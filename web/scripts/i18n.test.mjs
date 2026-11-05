import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createFormatter, createTranslator } from "next-intl";
import ts from "typescript";
import { checkMessages } from "./check-messages.mjs";
import { inventory } from "./inventory-chinese.mjs";

test("bundled Agent and rule labels cover current backend seeds", () => {
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const source = readFileSync(new URL("../../db/db.go", import.meta.url), "utf8");
  const agents = source.slice(source.indexOf("var builtinAgents ="), source.indexOf("func (d *DB) seedBuiltins()"));
  const seeds = [...agents.matchAll(/^\t\{"([\w]+)", "([^"]+)", "[^"]+", "([^"]+)"/gm)];
  assert.ok(seeds.length >= 7);
  for (const [, key, name, description] of seeds) {
    assert.equal(zh.builtinAgents[key]?.name, name, `Unreviewed Agent name: ${key}`);
    assert.equal(zh.builtinAgents[key]?.description, description, `Unreviewed Agent description: ${key}`);
  }
  const orchestration = readFileSync(new URL("../../server/orchestration.go", import.meta.url), "utf8");
  const reporter = orchestration.match(/CreateAgent\("reporter", "([^"]+)",\s*"([^"]+)"/);
  assert.ok(reporter);
  assert.equal(zh.builtinAgents.reporter.name, reporter[1]);
  assert.equal(zh.builtinAgents.reporter.description, reporter[2]);
  const credentials = readFileSync(new URL("../../server/credentials.go", import.meta.url), "utf8");
  const credentialAgent = credentials.match(/CreateAgent\(db\.CredentialAgentKey, "([^"]+)", "([^"]+)"/);
  assert.ok(credentialAgent);
  assert.equal(zh.builtinAgents.credential_processor.name, credentialAgent[1]);
  assert.equal(zh.builtinAgents.credential_processor.description, credentialAgent[2]);
  const rules = source.slice(source.indexOf("func (d *DB) seedDefaultInterceptRules()"));
  const ruleNames = [...rules.matchAll(/(?:name:\s*|const name = )"(\[内置\][^"]+)"/g)].map((match) => match[1]);
  assert.ok(ruleNames.length >= 18);
  assert.deepEqual(new Set(Object.values(zh.builtinRules.names)), new Set(ruleNames));
  const assetNotes = [...source.matchAll(/\{"fuzzy_domain", "[^"]+", "([^"]+)"\}/g)].map((match) => match[1]);
  assert.equal(assetNotes.length, 4);
  assert.deepEqual(new Set(Object.values(zh.builtinRules.assetNotes)), new Set(assetNotes));
  const server = readFileSync(new URL("../../server/server_mgmt.go", import.meta.url), "utf8");
  const t = createTranslator({ locale: "zh-CN", messages: zh });
  for (const key of ["Now", "DataDir"]) {
    const match = server.match(new RegExp(`Name: "${key}", Description: "([^"]+)"`));
    assert.ok(match);
    assert.equal(t(`agentEditor.globalVars.${key}`), match[1]);
  }
});

test("catalogs reject missing keys, empty values and invalid ICU", () => {
  assert.match(checkMessages({ a: "A" }, {})[0], /Missing key/);
  assert.throws(() => checkMessages({ a: "A" }, { a: " " }), /Empty message/);
  assert.match(checkMessages({ a: "A" }, { a: "{broken" })[0], /Invalid ICU/);
});

test("nested ICU arguments and rich tags must agree; plural categories can differ", () => {
  const zh = { a: "{n, plural, other {<b>{name}</b>}}" };
  const en = { a: "{n, plural, one {<b>{name}</b>} other {<b>{name}</b>}}" };
  assert.deepEqual(checkMessages(zh, en), []);
  assert.match(checkMessages(zh, { a: "{n, plural, other {{different}}}" })[0], /Placeholder mismatch/);
});

test("inventory detects JSX, attributes and template fragments but ignores comments", () => {
  const source = '// 中文 comment\nconst x = <p title="标题">你好{`开始${name}结束`}</p>;';
  const items = inventory(source, "page.tsx");
  assert.deepEqual(items.map((item) => item.text), ["标题", "你好", "开始", "结束"]);
  assert.ok(items.every((item) => item.line === 2));
});

test("completed UI files contain no uncataloged Chinese literals", () => {
  const completed = [
    "app/(auth)/login/page.tsx",
    "app/(auth)/setup/page.tsx",
    "app/(main)/dashboard/page.tsx",
    "app/(main)/system/settings/page.tsx",
    "app/(main)/system/settings/_components/basic-auth-card.tsx",
    "app/(main)/system/settings/_components/update-card.tsx",
    "app/(main)/function/tasks/detail/_tabs/report-tab.tsx",
    "app/(main)/_components/main-content.tsx",
    "app/(main)/_components/egress-ip-banner.tsx",
    "app/(main)/_components/live-clock.tsx",
    "app/(main)/_components/sidebar/account-switcher.tsx",
    "app/(main)/_components/sidebar/change-password-dialog.tsx",
    "app/(main)/_components/sidebar/layout-controls.tsx",
    "app/(main)/_components/sidebar/nav-user.tsx",
    "app/(main)/_components/sidebar/search-dialog.tsx",
    "app/(main)/_components/sidebar/theme-switcher.tsx",
    "components/copy-button.tsx",
    "components/date-select.tsx",
    "components/date-range-picker.tsx",
    "components/time-select.tsx",
    "components/table-pagination.tsx",
    "components/status-badge.tsx",
    "components/task-template-controls.tsx",
    "components/task-llm-profile-chain.tsx",
    "components/remark-editor.tsx",
    "components/todo-popover.tsx",
    "components/mention-textarea.tsx",
  ];
  for (const file of completed) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.deepEqual(inventory(source, file), [], `Review new UI strings in ${file}`);
  }
});

test("rule labels retain upstream metadata with matching Chinese translations", () => {
  const file = "components/asset-intercept-rules-editor.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const messages = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const labels = [];
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const fields = Object.fromEntries(node.properties
        .filter((property) => ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer))
        .map((property) => [property.name.getText(tree), property.initializer.text]));
      if (fields.value && fields.label) {
        assert.equal(messages.taskRules[fields.value], fields.label, `Stale rule label: ${fields.value}`);
        labels.push(fields.label);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(labels.length, 7);
  assert.deepEqual(inventory(source, file).map((item) => item.text), labels);
});

test("mention display translations preserve upstream kinds, aliases, and wire tokens", async () => {
  const file = "lib/chat-mentions.ts";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const { mentionKinds, mentionSearch, mentionToken, selectedMentions } =
    await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(en.chatMentions.kinds).sort(), mentionKinds.map(({ kind }) => kind).sort());
  for (const { kind, label, alias } of mentionKinds) {
    assert.equal(zh.chatMentions.kinds[kind], label, `Stale mention metadata: ${kind}`);
    for (const query of [label, alias]) {
      assert.deepEqual(mentionSearch(`${query} example.com`), { kind, query: "example.com", categories: [] });
    }
    const token = mentionToken({ kind, id: 42, label: "用户 {raw}", description: "raw detail" });
    assert.equal(token, `@[${label}#42 用户 {raw}]`);
    assert.deepEqual(selectedMentions(`draft ${token}`), [{
      token, label: `${label} #42 · 用户 {raw}`, start: 6,
    }]);
  }
});

test("task screen permits only reviewed metadata, wire logic, and persisted text", () => {
  const file = "app/(main)/function/tasks/page.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const exceptions = new Map([
    ["UPLOAD_MARKER", ["【上传文件（绝对路径）】"]],
    ["appendUploads", ["worker 可用 Read/Bash 按路径打开："]],
    ["STATUS_OPTIONS", Object.values(zh.status.task)],
    ["archiveStateLabel", Object.values(zh.taskArchives.states)],
    ["TaskArchivesPanel", ["归档不存在"]],
    ["COMPANY_SCOPE_LABELS", [zh.tasksCreate.scope.domain, zh.tasksCreate.scope.keyword]],
    ["CreateTaskSheet", ["新建任务计划", "新建任务计划"]],
  ]);
  for (const node of tree.statements) {
    const name = ts.isFunctionDeclaration(node) ? node.name?.text
      : ts.isVariableStatement(node) ? node.declarationList.declarations[0].name.getText(tree) : "";
    assert.deepEqual(inventory(node.getText(tree), file).map((item) => item.text),
      exceptions.get(name) ?? [], `Review Chinese literals in ${name || node.kind}`);
    exceptions.delete(name);
  }
  assert.equal(exceptions.size, 0, "Reviewed exception locations must exist");
});

test("task metadata follows locale with raw unknown values and Chinese fallback", async () => {
  const file = "app/(main)/function/tasks/page.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = ["COMPANY_SCOPE_LABELS", "companyScopeSummary", "archiveStateLabel", "STATUS_OPTIONS"];
  const pieces = tree.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node)) return names.includes(node.name?.text);
    return ts.isVariableStatement(node) && names.includes(node.declarationList.declarations[0].name.getText(tree));
  }).map((node) => node.getText(tree));
  assert.equal(pieces.length, names.length);
  const { outputText } = ts.transpileModule(`${pieces.join("\n")}\nexport {${names.join(",")}}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  const { COMPANY_SCOPE_LABELS, companyScopeSummary, archiveStateLabel, STATUS_OPTIONS } =
    await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const read = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const zh = read("zh-CN");
  const en = read("en");
  assert.deepEqual(COMPANY_SCOPE_LABELS, zh.tasksCreate.scope);
  assert.deepEqual(Object.fromEntries(STATUS_OPTIONS.map(({ value, label }) => [value, label])), zh.status.task);
  const untranslated = { has: () => false };
  for (const [state, label] of Object.entries(zh.taskArchives.states)) {
    assert.equal(archiveStateLabel(state, untranslated), label);
    for (const [locale, messages] of [["zh-CN", zh], ["en", en]]) {
      const t = createTranslator({ locale, messages, namespace: "taskArchives" });
      assert.equal(archiveStateLabel(state, t), messages.taskArchives.states[state]);
    }
  }
  const t = createTranslator({ locale: "en", messages: en, namespace: "tasksCreate" });
  for (const kind of ["future_kind", "constructor", "__proto__", "toString"]) {
    assert.equal(archiveStateLabel(kind, { has: () => assert.fail("Unknown state must stay raw") }), kind);
    assert.equal(companyScopeSummary({ scope: [{ kind, value: "用户 <raw> {value}" }] }, t), `${kind}: 用户 <raw> {value}`);
  }
  assert.equal(companyScopeSummary({ scope: [{ kind: "domain", raw: "example.com {raw}" }] }, t), "Domain: example.com {raw}");
  assert.equal(companyScopeSummary({ scope: [{ kind: "domain", raw: "example.com" }] },
    Object.assign((key, values) => t(key, values), untranslated)), "域名: example.com");
});

test("task detail permits only reviewed metadata and a hidden image-load diagnostic", () => {
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const files = [
    ["app/(main)/function/tasks/detail/page.tsx", new Map([
      ["TABS", Object.values(zh.taskDetail.tabs)],
    ])],
    ["app/(main)/function/tasks/detail/_tabs/overview-tab.tsx", new Map([
      ["SCOPE_KIND_LABELS", Object.values(zh.taskOverview.scopeKinds).filter((label) => /\p{Script=Han}/u.test(label))],
      ["SCOPE_SOURCE_LABELS", Object.values(zh.taskOverview.scopeSources).filter((label) => /\p{Script=Han}/u.test(label))],
      ["TASK_RULE_KIND_OPTIONS", ["exact_domain", "exact_ip", "exact_url", "fuzzy_domain", "fuzzy_ip", "fuzzy_url", "cidr"]
        .map((key) => zh.taskRules[key])],
    ])],
    ["components/markdown.tsx", new Map([
      ["AuthenticatedImage", ["图片读取失败:"]],
    ])],
  ];
  for (const [file, exceptions] of files) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of tree.statements) {
      const name = ts.isFunctionDeclaration(node) ? node.name?.text
        : ts.isVariableStatement(node) ? node.declarationList.declarations[0].name.getText(tree) : "";
      assert.deepEqual(inventory(node.getText(tree), file).map((item) => item.text),
        exceptions.get(name) ?? [], `Review Chinese literals in ${file}: ${name || node.kind}`);
      exceptions.delete(name);
    }
    assert.equal(exceptions.size, 0, "Reviewed exception locations must exist");
  }
});

test("overview scope labels follow locale while unknown metadata and user values stay raw", async () => {
  const file = "app/(main)/function/tasks/detail/_tabs/overview-tab.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = ["scopeValue", "scopeLabel", "SCOPE_KIND_LABELS", "SCOPE_SOURCE_LABELS"];
  const pieces = tree.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node)) return names.includes(node.name?.text);
    return ts.isVariableStatement(node) && names.includes(node.declarationList.declarations[0].name.getText(tree));
  }).map((node) => node.getText(tree));
  assert.equal(pieces.length, names.length);
  const { outputText } = ts.transpileModule(`${pieces.join("\n")}\nexport {${names.join(",")}}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  const { scopeValue, scopeLabel, SCOPE_KIND_LABELS, SCOPE_SOURCE_LABELS } =
    await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const noTranslation = { has: () => false };
  const raw = "用户 <raw> {value}";
  for (const locale of ["zh-CN", "en"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const t = createTranslator({ locale, messages, namespace: "taskOverview" });
    for (const [group, labels] of [["scopeKinds", SCOPE_KIND_LABELS], ["scopeSources", SCOPE_SOURCE_LABELS]]) {
      for (const [value, label] of Object.entries(labels)) {
        assert.equal(scopeLabel(group, value, t), messages.taskOverview[group][value]);
        assert.equal(scopeLabel(group, value, noTranslation), label);
      }
      for (const value of ["future_kind", "constructor", "__proto__", "toString"]) {
        assert.equal(scopeLabel(group, value, { has: () => assert.fail("Unknown value must stay raw") }), value);
      }
    }
    for (const key of ["value", "domain", "net"]) assert.equal(scopeValue({ [key]: raw }, t), raw);
    assert.equal(scopeValue({ company_id: 42, company_name: raw }, t), raw);
    assert.equal(scopeValue({ company_id: 42, company_name: " " }, t), t("company", { id: 42 }));
    assert.equal(scopeValue({}, t), "—");
  }
});

test("status display follows locale without mutating shared metadata or unknown wire values", async () => {
  const source = readFileSync(new URL("../src/lib/status.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  const { statusMeta } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const read = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const chinese = read("zh-CN");
  const english = read("en");
  const translate = createTranslator({ locale: "en", messages: english, namespace: "status" });

  for (const [domain, values] of Object.entries(chinese.status)) {
    for (const [value, label] of Object.entries(values)) {
      const original = { ...statusMeta(domain, value) };
      assert.equal(original.label, label, `Stale Chinese catalog: ${domain}.${value}`);
      assert.deepEqual(statusMeta(domain, value, translate), { ...original, label: english.status[domain][value] });
      assert.deepEqual(statusMeta(domain, value, () => undefined), original);
      assert.deepEqual(statusMeta(domain, value), original);
    }
  }
  for (const value of ["future_status", "constructor", "__proto__"]) {
    assert.deepEqual(statusMeta("task", value, () => assert.fail("Unknown status must stay raw")), {
      label: value, tone: "neutral",
    });
  }
});

test("session controls retain only original fixed-session metadata as Chinese literals", () => {
  const file = "app/(main)/function/tasks/detail/_tabs/sessions-tab.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const exceptions = new Map([
    ["roleMeta", Object.values(zh.taskSessions.roles).filter((label) => /\p{Script=Han}/u.test(label))],
    ["mainSessionTitle", [zh.taskSessions.mainTitle.split("{number}")[0]]],
    ["PLANNER_SESSION", [zh.taskSessions.plannerTitle]],
    ["SYSTEM_SESSION", [zh.taskSessions.systemTitle]],
  ]);
  for (const node of tree.statements) {
    const name = ts.isFunctionDeclaration(node) ? node.name?.text
      : ts.isVariableStatement(node) ? node.declarationList.declarations[0].name.getText(tree) : "";
    assert.deepEqual(inventory(node.getText(tree), file).map((item) => item.text),
      exceptions.get(name) ?? [], `Review Chinese literals in session controls: ${name || node.kind}`);
    exceptions.delete(name);
  }
  assert.equal(exceptions.size, 0, "Reviewed exception locations must exist");
});

test("session and asset display follow locale without translating backend content or mutating metadata", async () => {
  const file = "app/(main)/function/tasks/detail/_tabs/sessions-tab.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = ["sessionDisplayTitle", "resolutionLabel"];
  const pieces = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(pieces.length, names.length);
  const assetSource = readFileSync(new URL("../src/lib/task-assets.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(`${assetSource}\n${pieces.map((node) => node.getText(tree)).join("\n")}\nexport {${names.join(",")}}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  const { sessionDisplayTitle, resolutionLabel, taskAssetTypeLabel, taskAssetSourceLabel } =
    await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const raw = "用户 <raw> {value}";
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  for (const locale of ["zh-CN", "en"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const t = createTranslator({ locale, messages, namespace: "taskSessions" });
    const assetT = createTranslator({ locale, messages, namespace: "taskAssets" });
    for (const [role, key] of [["mainagent", "mainTitle"], ["planner", "plannerTitle"], ["system", "systemTitle"]]) {
      const session = { role, title: raw, seg: 2, id: "stable-id" };
      assert.equal(sessionDisplayTitle(session, t), t(key, { number: 3 }));
      assert.equal(session.title, raw);
      assert.equal(session.id, "stable-id");
    }
    assert.equal(sessionDisplayTitle({ role: "mainagent", title: raw }, t), t("mainTitle", { number: 1 }));
    assert.equal(sessionDisplayTitle({ role: "worker", title: raw }, t), raw);
    assert.equal(resolutionLabel({ name: raw, model: "model-id" }, t("unnamedProfile")), raw);
    assert.equal(resolutionLabel({ model: raw }, t("unnamedProfile")), raw);
    assert.equal(resolutionLabel({}, t("unnamedProfile")), t("unnamedProfile"));
    for (const [group, label] of [["types", taskAssetTypeLabel], ["sources", taskAssetSourceLabel]]) {
      for (const [value, chinese] of Object.entries(zh.taskAssets[group])) {
        assert.equal(label(value), chinese, `Stale asset metadata: ${group}.${value}`);
        assert.equal(label(value, assetT), messages.taskAssets[group][value]);
        assert.equal(label(value, () => undefined), chinese);
        assert.equal(label(value), chinese);
      }
      for (const unknown of ["future_kind", "constructor", "__proto__", "toString"]) {
        assert.equal(label(unknown, () => assert.fail("Unknown asset metadata must stay raw")), unknown);
      }
    }
  }
});

test("Phase 1 core coverage permits only reviewed protocol, metadata, and saved content", () => {
  const files = JSON.parse(readFileSync(new URL("./i18n-coverage.json", import.meta.url), "utf8"));
  for (const [file, exceptions] of Object.entries(files)) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const remaining = new Set(Object.keys(exceptions));
    for (const node of tree.statements) {
      const name = ts.isFunctionDeclaration(node) ? node.name?.text
        : ts.isVariableStatement(node) ? node.declarationList.declarations[0].name.getText(tree) : "";
      assert.deepEqual(inventory(node.getText(tree), file).map(({ text }) => text), exceptions[name] ?? [],
        `Review Chinese in ${file}: ${name || node.kind}`);
      remaining.delete(name);
    }
    assert.equal(remaining.size, 0, `Obsolete literal exceptions in ${file}`);
  }
});

test("scope validation exposes stable codes while legacy error messages stay Chinese", async () => {
  const source = readFileSync(new URL("../src/lib/company-scope.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  const scope = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"));
  for (const [kind, value, code] of [
    ["domain", "", "empty"], ["domain", "a b.example", "domainSpace"],
    ["domain", "192.0.2.1", "domainInvalid"], ["ip", "999.1.2.3", "ipInvalid"],
    ["cidr", "10.0.0.0/8", "cidrPrefixV4"], ["cidr", "2001:db8::/16", "cidrPrefixV6"],
    ["cidr", "invalid", "cidrInvalid"], ["keyword", "a".repeat(1025), "tooLong"],
  ]) {
    assert.equal(scope.companyScopeRuleErrorCode({ kind, value }), code);
    const t = createTranslator({ locale: "zh-CN", messages: zh, namespace: "scopeEditor" });
    assert.equal(scope.companyScopeRuleError({ kind, value }), t(`error.${code}`, { max: 1024 }));
    assert.ok(createTranslator({ locale: "en", messages: en, namespace: "scopeEditor" })(`error.${code}`, { max: 1024 }));
  }
  for (const [kind, value] of [["domain", "example.com"], ["ip", "2001:db8::1"], ["cidr", "192.0.0.0/16"]]) {
    assert.equal(scope.companyScopeRuleErrorCode({ kind, value }), "");
  }
  assert.deepEqual(scope.parseCompanyScopeText("192.0.2.1\n999.1.2.3").errors, [{ line: 2, error: "ipInvalid" }]);
});

test("report parsing preserves generated Chinese text under both UI languages", async () => {
  const file = "components/finding-reproduction-panel.tsx";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = ["extractSection", "withoutPacket", "parseSteps", "reportSection"];
  const pieces = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  const { outputText } = ts.transpileModule(`${pieces.map((node) => node.getText(tree)).join("\n")}\nexport { parseSteps, reportSection };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const { parseSteps, reportSection } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const report = "## 概述\n用户内容 {raw}\n\n## 复现步骤\n### 步骤 1. 原始步骤\n原始证据\n\n## 修复建议\n保持原文";
  for (const locale of ["zh-CN", "en"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const t = createTranslator({ locale, messages, namespace: "core.reproduction" });
    const labels = { verify: t("verify"), noSteps: t("noSteps"), process: t("process") };
    assert.deepEqual(parseSteps(report, "", labels), [{ number: 1, title: "原始步骤", body: "原始证据" }]);
    assert.equal(parseSteps("", "", labels)[0].body, t("noSteps"));
    assert.equal(reportSection(report, ["概述"]), "用户内容 {raw}");
    assert.equal(reportSection(report, ["修复建议"]), "保持原文");
  }
});

test("wording drift is visible even when catalog keys and ICU arguments are unchanged", async () => {
  const { translationDrift } = await import("./check-messages.mjs");
  assert.deepEqual(translationDrift({ action: "删除" }, { action: "Delete" }, { action: "归档" }, { action: "Delete" }), ["action"]);
  assert.deepEqual(translationDrift({ action: "删除" }, { action: "Delete" }, { action: "归档" }, { action: "Archive" }), []);
});

test("notification field metadata resolves every label and preserves transport values", async () => {
  const source = readFileSync(new URL("../src/app/(main)/system/notify/_components/channel-fields.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  const { CHANNEL_FIELDS, SEVERITY_OPTIONS, parseIDs, parseKeywords } =
    await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  for (const locale of ["zh-CN", "en"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const t = createTranslator({ locale, messages, namespace: "notifyPage" });
    for (const fields of Object.values(CHANNEL_FIELDS)) {
      for (const field of fields) {
        for (const key of [field.label, field.help, ...(field.options ?? []).map(({ label }) => label)].filter(Boolean)) {
          assert.ok(t.has(key), `Missing notification field label: ${key}`);
        }
      }
    }
    for (const { label } of SEVERITY_OPTIONS) assert.ok(t.has(label));
  }
  assert.deepEqual(CHANNEL_FIELDS.webhook.find(({ key }) => key === "method").options.map(({ value }) => value), ["POST", "PUT", "PATCH", "GET"]);
  assert.deepEqual(parseIDs("1，2, 3"), [1, 2, 3]);
  assert.deepEqual(parseKeywords("SQL injection，XSS\nraw {value}"), ["SQL injection", "XSS", "raw {value}"]);
});

test("timestamps preserve seconds and the selected timezone in both locales", async () => {
  const file = "i18n/formatting.ts";
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations[0].name.getText(tree) === "formats");
  const { outputText } = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  const { formats } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  for (const locale of ["zh-CN", "en"]) {
    for (const [timeZone, hour] of [["UTC", "07"], ["Asia/Ho_Chi_Minh", "14"]]) {
      const format = createFormatter({ locale, timeZone, formats });
      const first = format.dateTime(new Date("2026-10-30T07:08:01Z"), "timestamp");
      const second = format.dateTime(new Date("2026-10-30T07:08:02Z"), "timestamp");
      assert.ok(first.includes(`${hour}:08:01`), first);
      assert.ok(second.includes(`${hour}:08:02`), second);
      assert.notEqual(first, second);
    }
  }
});

test("system activity labels match backend-generated Chinese", () => {
  const zh = JSON.parse(readFileSync(new URL("../messages/zh-CN.json", import.meta.url), "utf8"));
  const source = ["engine.go", "goals.go", "engine_timeout.go"]
    .map((file) => readFileSync(new URL(`../../server/${file}`, import.meta.url), "utf8")).join("\n");
  for (const [key, value] of Object.entries(zh.transcript.systemActivity)) {
    const format = value.replace("{worker}", "%s").replace(/\{(round|id)\}/g, "%d");
    assert.ok(source.includes(`"${format}"`), `Backend label drifted: transcript.systemActivity.${key}`);
  }
});

test("known API errors match backend writeErr text and localize only exact templates", async () => {
  const read = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const zh = read("zh-CN");
  const en = read("en");
  const server = new URL("../../server/", import.meta.url);
  const goSource = readdirSync(server).filter((f) => f.endsWith(".go") && !f.endsWith("_test.go"))
    .map((f) => readFileSync(new URL(f, server), "utf8")).join("\n");
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [key, chinese] of Object.entries(zh.apiErrors)) {
    // {detail} at the end is a concatenated suffix; other args are fmt verbs.
    const literal = chinese.endsWith("{detail}") ? `"${chinese.slice(0, -"{detail}".length)}"` : `"${chinese}"`;
    const pattern = escape(literal).replace(/"\\\{\w+\\\}"/g, "%q").replace(/\\\{\w+\\\}/g, "%[dsv]");
    assert.match(goSource, new RegExp(`writeErr\\(w,[^\\n]*${pattern}`), `Backend error drifted: apiErrors.${key}`);
  }

  const source = readFileSync(new URL("../src/lib/api-errors.ts", import.meta.url), "utf8")
    .replace(/^import .*$/gm, "") + `\nconst en = ${JSON.stringify(en)};\nconst zh = ${JSON.stringify(zh)};`;
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  const { localizeApiError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  assert.equal(localizeApiError("归档不存在", "en"), "Archive not found");
  assert.equal(localizeApiError("归档不存在", "zh-CN"), "归档不存在");
  assert.equal(localizeApiError("安装失败：原文 detail", "en"), "Installation failed: 原文 detail");
  assert.equal(localizeApiError("关联任务 #42 不存在", "en"), "Linked task #42 does not exist");
  assert.equal(localizeApiError('渠道类型 "x" 未注册', "en"), 'Channel type "x" is not registered');
  assert.equal(localizeApiError("未知错误 归档不存在", "en"), "未知错误 归档不存在");
  assert.equal(localizeApiError("POST /x: 500", "en"), "POST /x: 500");
});
