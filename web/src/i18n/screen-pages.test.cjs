const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { createRequire } = require("node:module");
const base = path.resolve(__dirname, "../.."),
  req = createRequire(base + "/package.json"),
  ts = req("typescript"),
  React = req("react"),
  { renderToStaticMarkup } = req("react-dom/server"),
  { I18nextProvider } = req("react-i18next");
let route = "/function/findings";
const cache = new Map();
const stateSnapshots = new Map();
const noop = () => undefined;
function load(inputFile) {
  let file = path.resolve(inputFile);
  if (!path.extname(file) || !fs.existsSync(file))
    file = [".ts", ".tsx", ".json", "/index.ts", "/index.tsx"].map((x) => file + x).find(fs.existsSync) || file;
  if (file.endsWith(".css")) return {};
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const mod = { exports: {} };
  cache.set(file, mod);
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const custom = (id) =>
    id.endsWith(".css")
      ? {}
      : id === "next/navigation"
        ? {
            useRouter: () => ({ push: noop, replace: noop, refresh: noop, back: noop }),
            useSearchParams: () => new URLSearchParams("id=1"),
            usePathname: () => route,
            useParams: () => ({}),
            redirect: noop,
            notFound: noop,
          }
        : id.startsWith("@/")
          ? load(base + "/src/" + id.slice(2))
          : id.startsWith(".")
            ? load(path.resolve(path.dirname(file), id))
            : id === "react" && file.endsWith("/components/intelligence-panel.tsx")
              ? {
                  ...React,
                  useState(initial) {
                    // Supply the post-fetch state only to this component. Child
                    // components and React's actual rendering remain unchanged.
                    const snapshot = stateSnapshots.get(file);
                    const index = snapshot ? snapshot.next++ : -1;
                    return React.useState(snapshot?.values.has(index) ? snapshot.values.get(index) : initial);
                  },
                }
              : req(id);
  vm.runInThisContext("(function(require,module,exports,__filename,__dirname){" + compiled + "\n})", {
    filename: file,
  })(custom, mod, mod.exports, file, path.dirname(file));
  return mod.exports;
}
const { EgressIpProvider } = load(base + "/src/app/(main)/_components/egress-ip-banner.tsx");
const { createAppI18n } = load(base + "/src/i18n/instance.ts");
const i18n = createAppI18n();
const assert = require("node:assert/strict"),
  test = require("node:test");
function render(Component, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nextProvider,
      { i18n },
      React.createElement(EgressIpProvider, null, React.createElement(Component, props)),
    ),
  );
}
function visible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}
// These checks execute real components in Node. Navigation and styles are
// replaced. They validate rendering, not browser clicks or post-fetch behavior.
test("all main pages render English fixed labels and switch back", async () => {
  const main = base + "/src/app/(main)";
  const files = fs.readdirSync(main, { recursive: true }).filter((f) => f.endsWith("page.tsx"));
  assert.ok(files.length >= 27);
  for (const f of files) {
    route = "/" + f.replace("/page.tsx", "");
    const Page = load(main + "/" + f).default;
    await i18n.changeLanguage("en");
    const english = visible(render(Page));
    assert.doesNotMatch(english, /[\p{Script=Han}]/u, `${route}: ${english}`);
    assert.doesNotMatch(english, /screen\.[a-z\d]{14}/, route);
    await i18n.changeLanguage("zh-CN");
    const chinese = visible(render(Page));
    if (english.trim()) assert.notEqual(chinese, english, route);
    await i18n.changeLanguage("en");
    assert.equal(visible(render(Page)), english, route);
  }
});
test("all task detail tabs render their English fixed UI", async () => {
  await i18n.changeLanguage("en");
  for (const [file, name] of [
    ["overview", "OverviewTab"],
    ["sessions", "SessionsTab"],
    ["broadcast", "BroadcastTab"],
    ["findings", "FindingsTab"],
    ["retests", "RetestsTab"],
    ["assets", "AssetsTab"],
    ["coverage-graph", "CoverageGraphTab"],
    ["intercept", "InterceptTab"],
    ["report", "ReportTab"],
    ["graph", "GraphTab"],
    ["files", "FilesTab"],
  ]) {
    const Component = load(base + `/src/app/(main)/function/tasks/detail/_tabs/${file}-tab.tsx`)[name];
    const html = visible(render(Component, { taskId: "1", task: { id: "1", status: "done" }, active: true }));
    assert.doesNotMatch(html, /[\p{Script=Han}]/u, `${name}: ${html}`);
  }
  const { IntelligencePanel } = load(base + "/src/components/intelligence-panel.tsx");
  assert.doesNotMatch(visible(render(IntelligencePanel, { scope: "tasks", scopeId: "1" })), /[\p{Script=Han}]/u);
});

test("intelligence renders real preview responses, populated records and localized errors", async () => {
  const file = base + "/src/components/intelligence-panel.tsx";
  const { IntelligencePanel } = load(file);
  const transport = load(base + "/src/lib/mock/handler.ts");
  const original = "原始情报内容";
  const fixture = {
    enabled: true,
    credential_agent_enabled: false,
    credential_traffic_binding: false,
    counts: { credential: 1, lead: 1, sensitive_data: 1 },
    total: 3,
    items: ["credential", "lead", "sensitive_data"].map((kind, i) => ({
      id: i + 1,
      task_id: 1,
      kind,
      title: `Record ${i + 1}`,
      content: original,
      evidence: "Original evidence",
      confidence: "observed",
      status: ["unverified", "pending", "suspected"][i],
      asset_ids: [],
      worker: "worker",
      created_at: "2026-11-10T12:30:00Z",
      updated_at: "2026-11-10T12:30:00Z",
      inherited: false,
    })),
  };
  const empty = await transport.mockHandle("GET", "/tasks/t-vpn-edge/intelligence");
  const output = (data, error = null) => {
    stateSnapshots.set(file, {
      next: 0,
      values: new Map([
        [5, data],
        [6, error],
      ]),
    });
    try {
      return visible(render(IntelligencePanel, { scope: "tasks", scopeId: "t-vpn-edge" }));
    } finally {
      stateSnapshots.delete(file);
    }
  };
  await i18n.changeLanguage("en");
  assert.doesNotMatch(output(empty), /[\p{Script=Han}]/u);
  const english = output(fixture);
  assert.match(english, /Record 1/);
  assert.match(english, /Record 3/);
  assert.ok(english.includes(original));
  assert.doesNotMatch(english.replaceAll(original, ""), /[\p{Script=Han}]/u);
  const error = Object.assign(new Error("情报数据响应不完整，请刷新后重试"), { code: "intelligence_response_invalid" });
  assert.match(output(null, error), /intelligence response is incomplete/);
  await i18n.changeLanguage("zh-CN");
  assert.match(output(null, error), /情报数据响应不完整/);
  assert.notEqual(output(fixture), english);
});

test("approval suggestions translate their buttons and keep the original submitted questions", async () => {
  const hooks = load(base + "/src/hooks/use-side-questions.ts");
  const workspace = load(base + "/src/components/side-question-workspace.tsx");
  const buttons = load(base + "/src/components/ui/button.tsx");
  const { ApprovalDetail } = load(base + "/src/components/approval-records.tsx");
  const saved = [hooks.useSideQuestions, workspace.SideQuestionWorkspace, buttons.Button];
  const sent = [],
    handlers = new Map();
  const questions = [
    "此脚本的作用是什么？",
    "脚本会修改哪些文件或数据？",
    "为什么这次被放行或拦截？",
    "脚本中有哪些未确定行为？",
  ];
  hooks.useSideQuestions = () => ({
    enabled: true,
    open: true,
    items: [],
    snapshot: { available: true, model: { model: "demo-model" }, captured_at: "2026-11-10T12:30:00Z" },
    busy: false,
    draft: "",
    setOpen: noop,
    setDraft: noop,
    ask: (question) => sent.push(question),
  });
  // Render the same side panel without relying on browser panel measurements.
  workspace.SideQuestionWorkspace = (props) => React.createElement(saved[1], { ...props, mode: "floating" });
  buttons.Button = (props) => {
    if (typeof props.children === "string" && props.onClick) handlers.set(props.children, props.onClick);
    return React.createElement(saved[2], props);
  };
  const row = {
    id: 90,
    status: "allowed",
    tool_name: "execute",
    tool_input: {},
    worker: "worker",
    reason: "",
    created_at: "2026-11-10T12:30:00Z",
  };
  try {
    await i18n.changeLanguage("en");
    const english = visible(render(ApprovalDetail, { row, busy: false, decide: noop, revision: 0 }));
    for (const key of ["scriptPurpose", "scriptChanges", "decisionReason", "uncertainBehavior"]) {
      const label = i18n.t(`chatUI.approval.${key}`);
      assert.ok(english.includes(label), label);
      assert.ok(handlers.has(label), label);
      handlers.get(label)();
    }
    assert.deepEqual(sent, questions);
    for (const question of questions) assert.ok(!english.includes(question));
    await i18n.changeLanguage("zh-CN");
    const chinese = visible(render(ApprovalDetail, { row, busy: false, decide: noop, revision: 0 }));
    for (const question of questions) assert.ok(chinese.includes(question), question);
  } finally {
    [hooks.useSideQuestions, workspace.SideQuestionWorkspace, buttons.Button] = saved;
  }
});
test("populated findings translate actions and headers while retaining original content", async () => {
  const { FindingsTable } = load(base + "/src/app/(main)/function/findings/_components/findings-table.tsx");
  const finding = {
    id: "1",
    finding_id: "1",
    task_id: "1",
    severity: "high",
    status: "confirmed",
    name: "Original title",
    vulnclass: "SQL Injection",
    summary: "原始 AI 发现内容",
    ts: "2026-11-10T12:30:00Z",
    assets: [],
  };
  const props = {
    items: [finding],
    selectedIds: new Set(),
    expandedKey: null,
    reports: {},
    edit: null,
    saving: false,
    activeRetests: {},
  };
  for (const k of [
    "onToggleSelected",
    "onToggleSelectedPage",
    "onToggleRow",
    "onEditChange",
    "onSave",
    "onStatusChange",
    "onRetest",
    "onDeepen",
    "onDelete",
  ])
    props[k] = noop;
  await i18n.changeLanguage("en");
  const english = visible(render(FindingsTable, props));
  for (const word of ["Finding name", "Retest", "Investigate", "Original title", "原始 AI 发现内容"])
    assert.ok(english.includes(word), word);
  assert.doesNotMatch(english.replaceAll("原始 AI 发现内容", ""), /[\p{Script=Han}]/u);
  await i18n.changeLanguage("zh-CN");
  assert.match(visible(render(FindingsTable, props)), /漏洞名称/);
});
test("scope errors, source labels and Repeater defaults translate only at UI boundaries", async () => {
  await i18n.changeLanguage("en");
  const ui = (key, values) => i18n.t(key, values);
  const { translateFixedUIText, repeaterGroupLabel } = load(base + "/src/i18n/fixed-ui-text.ts");
  const { agentDisplayName } = load(base + "/src/i18n/agent-display.ts");
  assert.equal(translateFixedUIText("请输入有效 IP", ui), "Enter a valid IP address");
  assert.equal(translateFixedUIText("最多 1024 个字符", ui), "Use at most 1024 characters");
  assert.equal(
    translateFixedUIText("请求首行应为：POST /path HTTP/1.1", ui),
    "The request line should look like: POST /path HTTP/1.1",
  );
  assert.equal(translateFixedUIText("Custom upstream response 原文", ui), "Custom upstream response 原文");
  assert.equal(repeaterGroupLabel({ id: "default", name: "默认" }, ui), "Default");
  assert.equal(repeaterGroupLabel({ id: "custom", name: "默认" }, ui), "默认");
  assert.equal(repeaterGroupLabel({ id: "default", name: "我的分组" }, ui), "我的分组");
  assert.equal(agentDisplayName({ key: "goals", name: "目标拆解" }, ui), "Goal decomposition");
  assert.equal(agentDisplayName({ key: "custom", name: "目标拆解" }, ui), "目标拆解");
  assert.equal(agentDisplayName({ key: "goals", name: "自定义名称" }, ui), "自定义名称");
  const { taskAssetSourceLabel, taskAssetTypeLabel } = load(base + "/src/lib/task-assets.ts");
  assert.equal(taskAssetSourceLabel("manual", ui), "Added manually");
  assert.equal(taskAssetTypeLabel("root_domain", ui), "Root domain");
  assert.equal(taskAssetSourceLabel("future-source", ui), "future-source");
});

test("every fixed UI key resolves and English resources contain no untranslated Chinese", () => {
  const { resources } = load(base + "/src/i18n/messages.ts");
  const catalog = require("./screen-catalog.json");
  for (const [key, pair] of Object.entries(catalog)) assert.doesNotMatch(pair[1], /[\p{Script=Han}]/u, key);
  for (const dir of ["app", "components"])
    for (const relative of fs.readdirSync(base + "/src/" + dir, { recursive: true })) {
      if (!relative.endsWith(".tsx")) continue;
      const file = base + "/src/" + dir + "/" + relative;
      const source = fs.readFileSync(file, "utf8");
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const walk = (n) => {
        if (
          ts.isCallExpression(n) &&
          /^(ui|liveUI)$/.test(n.expression.getText(tree)) &&
          ts.isStringLiteral(n.arguments[0])
        )
          assert.ok(resources.en.translation[n.arguments[0].text], `${file}: ${n.arguments[0].text}`);
        if (ts.isJsxText(n) && /[\p{Script=Han}]/u.test(n.text))
          assert.ok(
            file.endsWith("/language-switcher.tsx") && n.text.trim() === "简体中文",
            `${file}: ${n.text.trim()}`,
          );
        ts.forEachChild(n, walk);
      };
      walk(tree);
    }
});

test("Repeater renders persisted drafts with translated default group and preserves raw packets", async () => {
  await i18n.changeLanguage("en");
  const storeModule = load(base + "/src/components/repeater/repeater-store.ts");
  const { useRepeaterStore } = storeModule;
  const { defaultWorkspace } = load(base + "/src/components/repeater/repeater-state.ts");
  const { RepeaterWorkspace } = load(base + "/src/components/repeater/repeater-workspace.tsx");
  const workspace = defaultWorkspace();
  workspace.tabs[0].rawRequest = "GET / HTTP/1.1\nHost: example.test\n\n";
  useRepeaterStore.setState({ workspace });
  // Supply the saved browser snapshot for this server render. Zustand normally
  // returns its empty pre-hydration snapshot on the server.
  storeModule.useRepeaterStore = Object.assign(
    (selector) => (selector ? selector(useRepeaterStore.getState()) : useRepeaterStore.getState()),
    useRepeaterStore,
  );
  let english;
  try {
    const { RepeaterNavigator } = load(base + "/src/components/repeater/repeater-navigator.tsx");
    english = visible(render(RepeaterWorkspace)) + visible(render(RepeaterNavigator, { workspace, onRename: noop }));
  } finally {
    storeModule.useRepeaterStore = useRepeaterStore;
  }
  assert.doesNotMatch(english, /[\p{Script=Han}]/u);
  assert.match(english, /Repeater/);
  assert.match(english, /Default/);
  assert.match(english, /Send/);
  assert.equal(workspace.groups[0].name, "默认");
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].rawRequest, "GET / HTTP/1.1\nHost: example.test\n\n");
  useRepeaterStore.setState({ workspace: null });
});
