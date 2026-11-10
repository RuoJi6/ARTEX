const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function loadSource(file, cache = new Map()) {
  const filename = path.resolve(__dirname, file);
  if (filename.endsWith(".json")) return { default: JSON.parse(fs.readFileSync(filename, "utf8")) };
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(
    compiled,
    {
      exports,
      Error,
      require: (id) =>
        id.startsWith("@/")
          ? loadSource(path.resolve(__dirname, "..", `${id.slice(2)}.ts`), cache)
          : id.startsWith(".")
            ? loadSource(path.resolve(path.dirname(filename), id.endsWith(".json") ? id : `${id}.ts`), cache)
            : require(id),
    },
    { filename },
  );
  return exports;
}

const { createAppI18n } = loadSource("instance.ts");
const { resources } = loadSource("messages.ts");
const { resolveLocale } = loadSource("config.ts");
const { localizedError } = loadSource("errors.ts");
const { matchesSettingsQuery } = loadSource("settings-search.ts");
const { useLiveTranslation } = loadSource("use-live-translation.ts");

test("translation resources are complete and preserve interpolation parameters", () => {
  assert.deepEqual(Object.keys(resources.en.translation).sort(), Object.keys(resources["zh-CN"].translation).sort());
  for (const key of Object.keys(resources.en.translation)) {
    const english = resources.en.translation[key];
    assert.ok(english.trim(), key);
    const params = (text) => [...text.matchAll(/\{\{(.*?)\}\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(params(english), params(resources["zh-CN"].translation[key]), key);
  }
});

test("instances start in Chinese, switch synchronously and remain isolated", async () => {
  const first = createAppI18n();
  const second = createAppI18n();
  assert.equal(first.t("auth.login"), "登录");
  await first.changeLanguage("en");
  assert.equal(first.t("auth.login"), "Sign in");
  assert.equal(second.t("auth.login"), "登录");
  assert.equal(first.t("mention.searchType", { kind: "Endpoint" }), "Search Endpoint");
  assert.equal(first.t("pagination.range", { from: 1, to: 10, total: 23 }), "1–10 of 23 records");
  assert.equal(first.t("pagination.range", { from: 1, to: 1, total: 1, count: 1 }), "1–1 of 1 record");
  assert.equal(first.t("mention.all", { count: 1 }), "Showing 1 record");
  await first.changeLanguage("zh-CN");
  assert.equal(first.t("auth.login"), "登录");
});

test("unsupported saved locale values use the deterministic static default", () => {
  for (const value of [undefined, null, "", "fr", "corrupted", "zh-TW"]) assert.equal(resolveLocale(value), "zh-CN");
  for (const value of ["en", "en-US", "EN-gb"]) assert.equal(resolveLocale(value), "en");
});

test("localized error text keeps raw server details as fallback", async () => {
  const i18n = createAppI18n();
  await i18n.changeLanguage("en");
  const raw = "original server detail";
  assert.equal(localizedError(raw, i18n.t.bind(i18n)), raw);
  assert.equal(localizedError("auth.passwordMismatch", i18n.t.bind(i18n)), "The passwords do not match");
  const structured = Object.assign(new Error("密码长度至少 8 位"), { code: "password_too_short", params: { min: 8 } });
  assert.equal(localizedError(structured, i18n.t.bind(i18n)), "Password must contain at least 8 characters");
  structured.code = "future_error";
  assert.equal(localizedError(structured, i18n.t.bind(i18n)), "密码长度至少 8 位");
});

test("settings search accepts both languages independently of the display language", async () => {
  const i18n = createAppI18n();
  for (const locale of ["en", "zh-CN"]) {
    await i18n.changeLanguage(locale);
    for (const query of ["截图", "SCREENSHOTS", "  OpSec  "]) {
      assert.ok(matchesSettingsQuery(i18n, "settings.keywords.browserSecurity", query), `${locale}: ${query}`);
    }
    assert.ok(matchesSettingsQuery(i18n, "settings.keywords.globalProxy", "reconnection"));
    assert.ok(matchesSettingsQuery(i18n, "settings.keywords.globalProxy", "代理"));
    assert.equal(matchesSettingsQuery(i18n, "settings.keywords.python", "screenshots"), false);
    assert.ok(matchesSettingsQuery(i18n, "settings.keywords.python", "  "));
  }
});

test("settings translation callbacks read the active provider's language after switching", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { I18nextProvider } = require("react-i18next");
  const i18n = createAppI18n();
  let callback;
  function Probe() {
    callback = useLiveTranslation().liveT;
    return React.createElement("span", null, callback("settings.category.system"));
  }
  assert.equal(
    renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(Probe))),
    "<span>系统与账号</span>",
  );
  await i18n.changeLanguage("en");
  // In-flight callbacks do not retain the language from the original render.
  assert.equal(callback("settings.category.system"), "System and account");
  assert.equal(callback("settings.workerTotal", { count: 1 }), "Total: 1 Worker session");
  assert.equal(callback("settings.workerTotal", { count: 3 }), "Total: 3 Worker sessions");
  assert.equal(callback("settings.failureCount", { count: 1 }), "1 failure");
});

test("migrated pages reference existing keys and contain no hardcoded Chinese display text", () => {
  const root = path.resolve(__dirname, "..");
  const files = [
    "app/(main)/system/settings/page.tsx",
    "app/(main)/chat/page.tsx",
    "app/(main)/function/schedules/page.tsx",
    "components/remark-editor.tsx",
    "app/(main)/function/tasks/page.tsx",
    "components/task-template-controls.tsx",
    "components/task-llm-profile-chain.tsx",
    "app/(main)/system/notify/page.tsx",
    "app/(main)/system/notify/_components/channel-form.tsx",
    "app/(main)/system/notify/_components/channel-fields.ts",
    "app/(main)/system/notify/_components/delivery-list.tsx",
    "app/(main)/system/notify/_components/stat-tile.tsx",
    "lib/schedule-display.ts",
    "components/side-question-workspace.tsx",
    "components/transcript.tsx",
    "components/todo-popover.tsx",
    "components/approval-execution-focus.tsx",
    "hooks/use-side-questions.ts",
    "app/(main)/dashboard/page.tsx",
    "app/(main)/system/settings/_components/basic-auth-card.tsx",
    "app/(main)/system/settings/_components/update-card.tsx",
    "app/(main)/_components/egress-ip-banner.tsx",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      // Upload manifests are Agent-facing protocol text, outside UI translation.
      if (ts.isFunctionDeclaration(node) && node.name?.text === "appendUploads") return;
      if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "UPLOAD_MARKER") return;
      if (
        ts.isCallExpression(node) &&
        ["t", "liveT", "translate"].includes(node.expression.getText(tree)) &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        assert.ok(
          Object.hasOwn(resources.en.translation, node.arguments[0].text) ||
            Object.hasOwn(resources.en.translation, `${node.arguments[0].text}_other`),
          `${file}: ${node.arguments[0].text}`,
        );
      }
      if (ts.isStringLiteral(node) && /^(taskUI|schedule|notify)\./.test(node.text)) {
        assert.ok(
          Object.hasOwn(resources.en.translation, node.text) ||
            Object.hasOwn(resources.en.translation, `${node.text}_other`),
          `${file}: ${node.text}`,
        );
      }
      if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        assert.equal(/[\u3400-\u9fff]/u.test(node.text), false, `${file}: ${node.text.trim()}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
});

test("overview and conversation counts use English singular and plural forms", async () => {
  const i18n = createAppI18n();
  await i18n.changeLanguage("en");
  for (const [key, singular, plural] of [
    ["overview.taskCount", "1 task", "2 tasks"],
    ["overview.rounds", "1 turn", "2 turns"],
    ["overview.conversationsDeleted", "Deleted 1 conversation", "Deleted 2 conversations"],
    ["overview.deleteSelected", "Delete 1 selected conversation?", "Delete 2 selected conversations?"],
    ["chatUI.recentExchanges", "1 recent exchange verbatim", "2 recent exchanges verbatim"],
  ]) {
    assert.equal(i18n.t(key, { count: 1 }), singular);
    assert.equal(i18n.t(key, { count: 2 }), plural);
  }
  assert.equal(i18n.t("overview.deleteConversation", { title: "用户的名称" }), "Delete conversation “用户的名称”?");
});

test("render translations invalidate caches while lifecycle translations keep a stable identity", async () => {
  const i18n = createAppI18n();
  let memo;
  let memoDependencies;
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "use-live-translation.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (id) => {
      if (id === "react")
        return {
          useMemo: (factory, dependencies) => {
            if (!memoDependencies || dependencies.some((value, index) => value !== memoDependencies[index])) {
              memo = factory();
              memoDependencies = dependencies;
            }
            return memo;
          },
        };
      if (id === "react-i18next") return { useTranslation: () => ({ i18n, t: i18n.getFixedT(i18n.language) }) };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const chinese = exports.useLiveTranslation();
  assert.equal(chinese.t("settings.category.system"), "系统与账号");
  await i18n.changeLanguage("en");
  const english = exports.useLiveTranslation();
  // React Compiler can now invalidate text cached against the render function.
  assert.notEqual(english.t, chinese.t);
  assert.equal(english.t("settings.category.system"), "System and account");
  // Switching languages does not retrigger effects that populate editable fields.
  assert.equal(english.liveT, chinese.liveT);
  assert.equal(chinese.liveT("settings.category.system"), "System and account");
});

test("execution labels switch language without translating cached commands or tool output", async () => {
  const { formatToolDetail, toolInputText } = loadSource("../lib/execution-display.ts");
  const i18n = createAppI18n();
  const command = 'printf "用户输入"';
  const output = "原始工具输出\nAI 输出也保持原文";
  const parts = [
    { kind: "command", text: JSON.stringify({ command, description: "原始描述" }) },
    { kind: "output", text: output },
  ];
  assert.equal(
    formatToolDetail(parts, "Bash", false, i18n.t.bind(i18n)),
    `【命令】\n${command}\n\n【输出 ✓】\n${output}`,
  );
  await i18n.changeLanguage("en");
  assert.equal(
    formatToolDetail(parts, "Bash", false, i18n.t.bind(i18n)),
    `【Command】\n${command}\n\n【Output ✓】\n${output}`,
  );
  assert.equal(toolInputText("Bash", '{"command":"echo 中文'), "echo 中文");
  assert.equal(toolInputText("Read", parts[0].text), parts[0].text);
  assert.equal(
    formatToolDetail([{ kind: "output", text: "", failed: true }], "Bash", true, i18n.t.bind(i18n)),
    "【Output ✕】\n(Could not load)",
  );
});

test("schedule windows, counts and stored system messages follow the selected language", async () => {
  const { scheduleDisplay } = loadSource("../lib/schedule-display.ts");
  const i18n = createAppI18n();
  const weekly = {
    schedule_type: "weekly",
    weekdays: [1, 6],
    start_time: "18:00:00",
    end_time: "06:00:00",
    status: "running",
    timezone_mode: "beijing",
  };
  const zh = scheduleDisplay(i18n.getFixedT("zh-CN"), "zh-CN");
  assert.match(zh.periodLabel(weekly), /周一.*周六/);
  assert.equal(zh.endLabel(weekly), "06:00（次日）");
  assert.equal(zh.statusText(weekly), "窗口运行中");
  await i18n.changeLanguage("en");
  const en = scheduleDisplay(i18n.getFixedT("en"), "en");
  assert.match(en.periodLabel(weekly), /Weekly.*Mon.*Sat/);
  assert.equal(en.endLabel(weekly), "06:00 (next day)");
  assert.equal(en.windowLabel({ ...weekly, end_time: "" }), "Runs continuously from 18:00");
  assert.equal(en.statusText(weekly), "Window active");
  assert.equal(en.historyActionText("resume"), "Task resumed");
  assert.equal(en.historyActionText("future-action"), "Status changed");
  assert.equal(en.timezoneLabel(weekly), "Beijing time (UTC+8)");
  assert.equal(en.formatDateValue("2026-11-10"), "November 10, 2026");
  assert.equal(en.formatDateValue("invalid-date"), "invalid-date");
  assert.equal(
    en.endLabel({ ...weekly, schedule_type: "once", run_date: "2026-11-10", end_date: "2026-11-11", end_time: "" }),
    "November 11, 2026 24:00",
  );
  assert.equal(en.nextWindowLabel("2026-11-10T10:00:00Z", "Asia/Shanghai"), "11/10/2026, 18:00");
  assert.equal(en.nextWindowLabel("2026-11-10T10:00:00Z", "invalid-zone"), en.formatTime("2026-11-10T10:00:00Z"));
  assert.equal(en.scheduleErrorText("手动立即运行"), "Manually started immediately");
  assert.equal(en.scheduleErrorText("任务 #42 已结束，无法立即运行"), "Task #42 has ended and cannot run immediately");
  assert.equal(
    en.scheduleErrorText("任务 #42: 状态读取失败; 任务 #43: 人工暂停优先"),
    "Task #42: Could not read task state; Task #43: Manual pause takes priority",
  );
  const original = "用户的计划与备注，包含 start_time";
  assert.equal(en.scheduleErrorText(original), original);
  assert.equal(en.scheduleErrorText("任务 #42：unknown original detail"), "Task #42: unknown original detail");
  for (const [key, singular, plural] of [
    ["schedule.started", "Started 1 task immediately", "Started 2 tasks immediately"],
    ["schedule.deleted", "Deleted 1 schedule", "Deleted 2 schedules"],
    ["schedule.confirmBulkDelete", "Delete 1 selected schedule?", "Delete 2 selected schedules?"],
    ["schedule.recentRecords", "Latest 1 record", "Latest 2 records"],
  ]) {
    assert.equal(i18n.t(key, { count: 1 }), singular);
    assert.equal(i18n.t(key, { count: 2 }), plural);
  }
  assert.equal(i18n.t("inlineEditor.fieldLabel", { field: "Notes", label: "用户计划" }), "Notes for 用户计划");
});

test("notification fields and filters translate without changing API values or template syntax", async () => {
  const { CHANNEL_FIELDS, SEVERITY_OPTIONS, KIND_LABEL, parseKV, parseIDs, parseKeywords } = loadSource(
    "../app/(main)/system/notify/_components/channel-fields.ts",
  );
  const { notificationError } = loadSource("notify-runtime.ts");
  const i18n = createAppI18n();
  await i18n.changeLanguage("en");
  const translate = i18n.t.bind(i18n);
  for (const key of Object.values(KIND_LABEL)) assert.ok(!/[\u3400-\u9fff]/u.test(translate(key)));
  for (const field of Object.values(CHANNEL_FIELDS).flat()) {
    assert.ok(!/[\u3400-\u9fff]/u.test(translate(field.label)));
    if (field.help) assert.ok(Object.hasOwn(resources.en.translation, field.help), field.help);
    for (const option of field.options ?? [])
      assert.ok(Object.hasOwn(resources.en.translation, option.label), option.label);
  }
  for (const option of SEVERITY_OPTIONS) assert.ok(Object.hasOwn(resources.en.translation, option.label));
  assert.equal(translate(KIND_LABEL.dingtalk), "DingTalk");
  assert.equal(
    translate(CHANNEL_FIELDS.email.find((field) => field.key === "password").label),
    "Password / app password",
  );
  const method = CHANNEL_FIELDS.webhook.find((field) => field.key === "method");
  assert.equal(method.options[0].value, "POST");
  assert.equal(translate(method.options[0].label), "POST (with body)");
  const help = translate("notify.fields.bodyTemplateHelp", {
    variables: "{{.Title}} {{.Batch}} {{.Count}} {{.HomeURL}} {{.SentAt}}",
    fields: ".Name/.VulnClass/.Severity/.Summary/.Assets/.DetailURL/.StatusLabel",
    jsonExample: "{{json .Xxx}}",
    rawExample: "{{.Xxx}}",
  });
  assert.ok(help.includes("{{.Title}}"));
  assert.ok(help.includes("{{json .Xxx}} instead of {{.Xxx}}"));
  assert.equal(notificationError(new Error("缺少 Webhook 地址"), translate), "Webhook URL is required");
  assert.equal(
    notificationError(new Error("演示模式不会发送真实通知，请在实际部署中测试"), translate),
    "Demo mode does not send notifications. Test this channel in a deployed instance.",
  );
  assert.equal(notificationError(new Error("Webhook 地址无效: 原始错误"), translate), "Invalid webhook URL: 原始错误");
  assert.equal(notificationError(new Error("原始第三方响应"), translate), "原始第三方响应");
  assert.equal(
    JSON.stringify(parseKV("Authorization=Bearer abc\nX-Test=中文值")),
    JSON.stringify({ Authorization: "Bearer abc", "X-Test": "中文值" }),
  );
  assert.equal(JSON.stringify(parseIDs("1，2 3")), "[1,2,3]");
  assert.equal(
    JSON.stringify(parseKeywords("SQL注入\nCommand execution")),
    JSON.stringify(["SQL注入", "Command execution"]),
  );
  for (const [key, singular, plural] of [
    ["notify.tasks", "1 task", "2 tasks"],
    ["notify.assets", "1 asset", "2 assets"],
    ["notify.minutes", "1 minute", "2 minutes"],
    ["notify.includeWords", "Type matches 1 keyword", "Type matches 2 keywords"],
    ["notify.total", "1 record", "2 records"],
  ]) {
    assert.equal(translate(key, { count: 1 }), singular);
    assert.equal(translate(key, { count: 2 }), plural);
  }
  await i18n.changeLanguage("zh-CN");
  assert.equal(translate(KIND_LABEL.dingtalk), "钉钉");
  assert.equal(translate(CHANNEL_FIELDS.email.find((field) => field.key === "password").label), "密码 / 授权码");
});

test("task summaries, archive eligibility and category scope labels switch without altering user content", async () => {
  const filename = path.resolve(__dirname, "../app/(main)/function/tasks/page.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = [
    "deleteDetails",
    "deleteSummary",
    "archiveBlockReason",
    "archiveStateLabel",
    "formatArchiveBytes",
    "archiveCompressionLabel",
    "companyScopeSummary",
  ];
  const declarations = tree.statements.filter(
    (node) =>
      (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((declaration) =>
          ["ARCHIVABLE_STATUSES", "COMPANY_SCOPE_LABELS"].includes(declaration.name.getText(tree)),
        )),
  );
  const helpers = vm.runInNewContext(
    ts.transpileModule(declarations.map((node) => node.getText(tree)).join("\n") + `\n;({${names.join(",")}})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );
  const i18n = createAppI18n();
  const translate = i18n.t.bind(i18n);
  const counts = {
    assets_deleted: 1,
    assets_detached: 2,
    traffic_deleted: 0,
    files_deleted: false,
    findings_deleted: 1,
    llm_records_deleted: 0,
  };
  assert.match(helpers.deleteSummary(counts, translate), /任务已删除.*删除资产 1 条/);
  await i18n.changeLanguage("en");
  assert.equal(
    helpers.deleteSummary(counts, translate),
    "Task deleted (Deleted 1 asset, Unlinked 2 shared assets, Deleted 1 finding)",
  );
  assert.equal(helpers.archiveBlockReason({ status: "queued", queued: true }, translate), "Pause queued tasks first");
  assert.equal(helpers.archiveBlockReason({ status: "running" }, translate), "Pause active or unfinished tasks first");
  assert.equal(helpers.archiveBlockReason({ status: "done" }, translate), "");
  assert.match(helpers.archiveBlockReason({ status: "done", archive_blocked_by_task_id: 42 }, translate), /Task #42/);
  assert.equal(helpers.archiveStateLabel("restore_queued", translate), "Queued for restoration");
  assert.equal(
    helpers.archiveCompressionLabel({ original_size: 2048, compressed_size: 1024 }, translate),
    "1.0 KB · 50% saved",
  );
  const company = {
    scope: [
      { kind: "domain", raw: "用户.example.com" },
      { kind: "keyword", raw: "用户关键词" },
    ],
  };
  assert.equal(helpers.companyScopeSummary(company, translate), "Domain: 用户.example.com · Keyword: 用户关键词");
  assert.equal(translate("taskUI.confirmDeleteCategory", { name: "用户分类" }), "Delete category “用户分类”?");
  assert.equal(translate("taskUI.deletedTasks", { count: 1 }), "Deleted 1 task");
  assert.equal(translate("taskUI.deletedTasks", { count: 2 }), "Deleted 2 tasks");
  assert.equal(translate("taskUI.uncategorizedCount", { count: 1 }), "1 task is uncategorized.");
  assert.equal(
    translate("taskUI.categoryUsed", { count: 1 }),
    "1 task uses this category. Renaming updates the task list.",
  );
  for (const kind of ["exact_domain", "exact_ip", "exact_url", "fuzzy_domain", "fuzzy_ip", "fuzzy_url", "cidr"])
    assert.ok(Object.hasOwn(resources.en.translation, `taskUI.assetRule.${kind}`));
  const upload = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "appendUploads");
  assert.ok(upload.getText(tree).includes("worker 可用 Read/Bash 按路径打开"));
});

test("task runtime validation preserves unknown details and schedule validation remains bilingual", async () => {
  const { taskError } = loadSource("task-runtime.ts");
  const i18n = createAppI18n();
  await i18n.changeLanguage("en");
  const translate = i18n.t.bind(i18n);
  assert.equal(taskError(new Error("分类名称已存在"), translate), "A category with this name already exists");
  assert.equal(taskError(new Error("备注最多 200 个字符"), translate), "Notes must be 200 characters or fewer");
  assert.equal(taskError(new Error("截止日期不能早于开始日期"), translate), "End date cannot be before start date");
  assert.equal(taskError(new Error("原始系统或第三方详细信息"), translate), "原始系统或第三方详细信息");
  assert.equal(translate("taskUI.phase.snapshot_database"), "Creating database snapshot");
  await i18n.changeLanguage("zh-CN");
  assert.equal(taskError(new Error("备注最多 200 个字符"), translate), "备注最多 200 个字符");
  assert.equal(translate("taskUI.phase.snapshot_database"), "创建数据库快照");
});
