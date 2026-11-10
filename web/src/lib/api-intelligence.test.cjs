const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

require("ts-node").register({
  skipProject: true,
  transpileOnly: true,
  compilerOptions: { target: "ES2022", module: "CommonJS", moduleResolution: "Node" },
});
const { mockHandle } = require("./mock/handler.ts");
const { assets } = require("./mock/data.ts");
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "api.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function client(mock, payload) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    URLSearchParams,
    require: (id) => {
      if (id === "@/lib/mock/enabled") return { MOCK: mock };
      if (id === "@/lib/mock/handler") return { mockHandle };
      throw new Error(`Unexpected runtime import: ${id}`);
    },
    fetch: async () => {
      assert.equal(mock, false, "Preview intelligence must not make a network request");
      return { ok: true, status: 200, json: async () => payload };
    },
  });
  return exports.api;
}
const emptyPage = {
  items: [],
  total: 0,
  counts: { credential: 0, lead: 0, sensitive_data: 0 },
  enabled: false,
  credential_agent_enabled: false,
  credential_traffic_binding: false,
};

test("incomplete intelligence responses fail before the panel reads counts or items", async () => {
  for (const payload of [
    null,
    {},
    { ok: true },
    [],
    { ...emptyPage, items: null },
    { ...emptyPage, counts: undefined },
    { ...emptyPage, counts: null },
    { ...emptyPage, counts: [] },
    { ...emptyPage, counts: {} },
    { ...emptyPage, counts: { ...emptyPage.counts, lead: "1" } },
    { ...emptyPage, total: -1 },
  ]) {
    await assert.rejects(
      client(false, payload).intelligence("tasks", "1", new URLSearchParams()),
      (error) => error.code === "intelligence_response_invalid",
    );
  }
});

test("valid intelligence pages retain original content", async () => {
  const payload = {
    ...emptyPage,
    total: 1,
    items: [{ title: "原始情报内容" }],
    counts: { ...emptyPage.counts, lead: 1 },
  };
  const page = await client(false, payload).intelligence("tasks", "1", new URLSearchParams());
  assert.equal(page, payload);
});

test("real preview transport returns the complete empty task and asset intelligence contract", async () => {
  const api = client(true);
  const settings = await api.settings();
  for (const [scope, id] of [
    ["tasks", "t-vpn-edge"],
    ["assets", String(assets[0].id)],
  ]) {
    for (const query of [
      new URLSearchParams(),
      new URLSearchParams({ kind: "credential", status: "verified", q: "test", offset: "25" }),
    ]) {
      const page = await api.intelligence(scope, id, query);
      assert.equal(page.total, 0);
      assert.equal(page.items.length, 0);
      assert.deepEqual(Object.keys(page.counts).sort(), ["credential", "lead", "sensitive_data"]);
      assert.equal(
        Object.values(page.counts).reduce((a, b) => a + b, 0),
        0,
      );
      assert.equal(page.enabled, settings.task_intelligence_enabled);
      assert.equal(page.credential_agent_enabled, settings.credential_agent_enabled);
      assert.equal(
        page.credential_traffic_binding,
        settings.credential_agent_enabled && settings.credential_traffic_binding,
      );
    }
    await assert.rejects(api.intelligenceDetail(scope, id, 999), /情报不存在/);
  }
  await assert.rejects(api.intelligence("tasks", "missing-task", new URLSearchParams()), /任务或资产不存在/);
});
