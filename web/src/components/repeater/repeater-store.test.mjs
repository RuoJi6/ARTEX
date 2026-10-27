import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// Keep the tests runnable on Node 20 as well as versions with native TS support.
const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "Node10" },
});
const {
  addTab,
  defaultWorkspace,
  deserializeWorkspace,
  MAX_HISTORY,
  MAX_RESPONSE_CHARS,
  MAX_STORAGE_BYTES,
  newId,
  seedWorkspace,
  serializeWorkspace,
  truncateResponse,
} = require("./repeater-state.ts");
const {
  requestFromEvidence,
  buildRawRequest,
  parseRawRequest,
  joinRequestText,
  splitRequestText,
  requestFromTraffic,
  buildRawResponse,
  getHostHeader,
  headersFromReqHead,
  parseHeadersText,
  setHostHeader,
} = require("./repeater-http.ts");
const {
  DEFAULT_FILTERS,
  filterRepeaterTabs,
  groupRepeaterTabs,
  matchesRepeaterFilters,
} = require("./repeater-filter.ts");
const { flush, useRepeaterStore } = require("./repeater-store.ts");
const { toast } = require("sonner");

const response = (body = "ok") => ({
  status: 200,
  status_text: "200 OK",
  proto: "HTTP/1.1",
  headers: { "Content-Type": ["text/plain"] },
  body,
  body_truncated: false,
  body_bytes: body.length,
  elapsed_ms: 12,
  url: "https://example.test/",
});
const entry = (id, body = "ok") => ({
  id: String(id),
  method: "POST",
  url: "https://example.test/",
  headersText: "Host: example.test",
  body: "draft",
  useProxy: true,
  insecure: false,
  response: response(body),
  at: new Date(id * 1000).toISOString(),
});

test("response body is capped at 256 Ki characters without mutating the live response", () => {
  const original = response("x".repeat(MAX_RESPONSE_CHARS + 1));
  const truncated = truncateResponse(original);
  assert.equal(truncated.body.length, MAX_RESPONSE_CHARS);
  assert.equal(truncated.body_truncated, true);
  assert.equal(truncated.body_bytes, MAX_RESPONSE_CHARS + 1);
  assert.equal(original.body.length, MAX_RESPONSE_CHARS + 1);
  assert.equal(original.body_truncated, false);
  assert.equal(truncateResponse(response()).body_truncated, false);
});

test("persisted response bodies and histories are capped; live state is unchanged", () => {
  const workspace = defaultWorkspace();
  const tab = workspace.tabs[0];
  tab.response = response("x".repeat(MAX_RESPONSE_CHARS + 1));
  tab.history = Array.from({ length: 25 }, (_, index) => entry(25 - index));
  tab.history[0].response = tab.response;
  const saved = JSON.parse(serializeWorkspace(workspace));
  assert.equal(saved.tabs[0].history.length, MAX_HISTORY);
  assert.equal(saved.tabs[0].history[0].id, "25");
  assert.equal(saved.tabs[0].response.body.length, MAX_RESPONSE_CHARS);
  assert.equal(saved.tabs[0].history[0].response.body.length, MAX_RESPONSE_CHARS);
  assert.equal(tab.history.length, 25);
});

test("serialize/deserialize preserves drafts, groups, active tab, source and response", () => {
  let workspace = defaultWorkspace();
  workspace.groups.push({ id: "other", name: "验证", collapsed: true });
  workspace = seedWorkspace(
    workspace,
    { method: "post", url: "https://example.test/path", body: "payload", headersText: "Host: override" },
    { findingId: "42", bindingId: "2", label: "proof" },
    { groupId: "other" },
  );
  workspace.tabs[1].response = response();
  workspace.tabs[1].history = [entry(1)];
  assert.deepEqual(JSON.parse(JSON.stringify(deserializeWorkspace(serializeWorkspace(workspace)))), workspace);
});

test("missing, corrupt and malformed storage recover a default group and empty tab", () => {
  const malformed = defaultWorkspace();
  malformed.tabs[0].response = { body: "bad" };
  for (const raw of [
    null,
    "",
    "{",
    "null",
    "[]",
    '{"version":2}',
    '{"version":1,"groups":[],"tabs":[{}]}',
    JSON.stringify(malformed),
  ]) {
    const recovered = deserializeWorkspace(raw);
    assert.equal(recovered.version, 1);
    assert.equal(recovered.groups[0].name, "默认");
    assert.equal(recovered.tabs.length, 1);
    assert.equal(recovered.tabs[0].title, "Tab 1");
    assert.equal(recovered.tabs[0].url, "");
    assert.equal(recovered.activeTabId, recovered.tabs[0].id);
  }
});

test("seeding always creates a new active tab in default or specified group", () => {
  const initial = defaultWorkspace();
  const seeded = seedWorkspace(initial, { method: "post", url: "https://example.test:8443/path" });
  assert.equal(initial.tabs.length, 1);
  assert.equal(seeded.tabs.length, 2);
  assert.equal(seeded.tabs[1].groupId, "default");
  assert.equal(seeded.tabs[1].title, "POST example.test:8443");
  assert.equal(seeded.activeTabId, seeded.tabs[1].id);
  seeded.groups.push({ id: "custom", name: "验证", collapsed: true });
  const custom = seedWorkspace(seeded, {}, { label: "证据" }, { groupId: "custom" });
  assert.equal(custom.tabs[2].groupId, "custom");
  assert.equal(custom.tabs[2].title, "证据");
  assert.equal(custom.groups[1].collapsed, false);
  const background = addTab(custom, {}, { activate: false, groupId: "missing" });
  assert.equal(background.activeTabId, custom.activeTabId);
  assert.equal(background.tabs[3].groupId, "default");
});

test("budget removes globally oldest history first then strips responses, preserving drafts", () => {
  const workspace = addTab(defaultWorkspace());
  workspace.tabs[0].history = [entry(3), entry(1)];
  workspace.tabs[1].history = [entry(4), entry(2)];
  const limit = (serializeWorkspace(workspace).length - JSON.stringify(entry(1)).length - 1) * 2;
  const saved = JSON.parse(serializeWorkspace(workspace, limit));
  assert.deepEqual(
    saved.tabs.map((tab) => tab.history.map((item) => item.id)),
    [["3"], ["4", "2"]],
  );
  workspace.tabs[0].response = response("中".repeat(MAX_RESPONSE_CHARS));
  workspace.tabs[1].response = response("x".repeat(MAX_RESPONSE_CHARS));
  workspace.tabs[0].body = "keep this request";
  const stripped = JSON.parse(serializeWorkspace(workspace, 3000));
  assert.equal(stripped.tabs[0].body, "keep this request");
  assert.equal(stripped.tabs[0].response.body, "");
  assert.equal(stripped.tabs[0].response.body_truncated, true);
  assert.equal(workspace.tabs[0].history.length, 2);
  let large = defaultWorkspace();
  for (let id = 0; id < 5; id++) large = addTab(large);
  for (const tab of large.tabs) {
    tab.response = response("中".repeat(MAX_RESPONSE_CHARS));
    tab.history = [entry(1, "中".repeat(MAX_RESPONSE_CHARS))];
  }
  assert.ok(serializeWorkspace(large).length * 2 <= MAX_STORAGE_BYTES);
});

test("storage cap counts UTF-16 bytes for ASCII, Chinese and surrogate pairs", () => {
  for (const text of ["x", "中", "😀"]) {
    let workspace = defaultWorkspace();
    for (let index = 0; index < 5; index++) workspace = addTab(workspace);
    for (const tab of workspace.tabs) {
      const body = text.repeat(MAX_RESPONSE_CHARS).slice(0, MAX_RESPONSE_CHARS);
      tab.response = response(body);
      tab.history = [entry(1, body)];
      tab.body = `保留草稿 ${text}`;
    }
    assert.ok(JSON.stringify(workspace).length * 2 > MAX_STORAGE_BYTES);
    const json = serializeWorkspace(workspace);
    assert.ok(json.length * 2 <= MAX_STORAGE_BYTES);
    assert.deepEqual(
      JSON.parse(json).tabs.map((tab) => tab.body),
      workspace.tabs.map((tab) => tab.body),
    );
  }
});

test("drafts exceeding the soft UTF-16 budget are never discarded", () => {
  const workspace = defaultWorkspace();
  workspace.tabs[0].body = "x".repeat(MAX_STORAGE_BYTES / 2);
  workspace.tabs[0].response = response("previous");
  workspace.tabs[0].history = [entry(1)];
  const json = serializeWorkspace(workspace);
  const saved = JSON.parse(json);
  assert.ok(json.length * 2 > MAX_STORAGE_BYTES);
  assert.equal(saved.tabs[0].body, workspace.tabs[0].body);
  assert.deepEqual(saved.tabs[0].history, []);
  assert.equal(saved.tabs[0].response.body, "");
});

function setupStore(t) {
  const previousWindow = globalThis.window;
  const writes = [];
  globalThis.window = {
    localStorage: {
      setItem: (key, value) => writes.push({ key, value }),
    },
  };
  useRepeaterStore.setState({ workspace: addTab(defaultWorkspace()), inflight: {} });
  t.after(() => {
    useRepeaterStore.setState({ workspace: null, inflight: {} });
    flush(); // Cancel pending persistence without writing to another test's storage.
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  return { store: useRepeaterStore.getState(), writes };
}

test("a second send invalidates only that tab's first send and stale cleanup cannot clear it", (t) => {
  const { store } = setupStore(t);
  const [first, other] = store.workspace.tabs;
  store.recordSend(first.id, entry(1, "previous"));
  const generation1 = store.beginSend(first.id);
  const otherGeneration = store.beginSend(other.id);
  const generation2 = store.beginSend(first.id);
  assert.notEqual(generation1, generation2);
  assert.equal(store.isCurrentSend(first.id, generation1), false);
  assert.equal(store.isCurrentSend(first.id, generation2), true);
  assert.equal(store.isCurrentSend(other.id, otherGeneration), true);
  store.completeSend(first.id, generation1, entry(2, "stale"));
  store.clearInflight(first.id, generation1);
  assert.equal(useRepeaterStore.getState().inflight[first.id], generation2);
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].response.body, "previous");
  store.completeSend(first.id, generation2, entry(3, "newest"));
  const state = useRepeaterStore.getState();
  assert.equal(state.workspace.tabs[0].response.body, "newest");
  assert.deepEqual(
    state.workspace.tabs[0].history.map((item) => item.id),
    ["3", "1"],
  );
  assert.equal(state.inflight[first.id], undefined);
  assert.equal(state.inflight[other.id], otherGeneration);
});

test("closing a tab or clearing the workspace drops pending results and history", (t) => {
  const { store } = setupStore(t);
  const [closed, other] = store.workspace.tabs;
  const generation = store.beginSend(closed.id);
  const otherGeneration = store.beginSend(other.id);
  store.closeTab(closed.id);
  assert.equal(store.isCurrentSend(closed.id, generation), false);
  assert.equal(store.beginSend(closed.id), undefined);
  store.completeSend(closed.id, generation, entry(1));
  assert.equal(useRepeaterStore.getState().inflight[closed.id], undefined);
  assert.equal(useRepeaterStore.getState().workspace.tabs.length, 1);
  assert.deepEqual(useRepeaterStore.getState().workspace.tabs[0].history, []);
  assert.equal(store.isCurrentSend(other.id, otherGeneration), true);
  store.clearWorkspace();
  store.completeSend(other.id, otherGeneration, entry(2));
  assert.deepEqual(useRepeaterStore.getState().inflight, {});
  assert.deepEqual(useRepeaterStore.getState().workspace.tabs[0].history, []);
});

test("busy state survives remount and successful completion records without an editor mounted", async (t) => {
  const { store, writes } = setupStore(t);
  const [tab, other] = store.workspace.tabs;
  store.recordSend(tab.id, entry(1, "previous"));
  const observedBusy = [];
  const unmount = useRepeaterStore.subscribe((state) => observedBusy.push(state.inflight[tab.id] !== undefined));
  const generation = store.beginSend(tab.id);
  let resolveResponse;
  const pending = new Promise((resolve) => {
    resolveResponse = resolve;
  }).then((result) => store.completeSend(tab.id, generation, result));
  unmount();
  store.setActiveTab(other.id);
  store.setActiveTab(tab.id);
  // A remounted editor reads the same store selector to disable duplicate sends.
  assert.equal(useRepeaterStore.getState().inflight[tab.id] !== undefined, true);
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].response.body, "previous");
  store.setActiveTab(other.id);
  resolveResponse(entry(2, "completed offscreen"));
  await pending;
  const state = useRepeaterStore.getState();
  assert.deepEqual(observedBusy, [true]);
  assert.equal(state.inflight[tab.id], undefined);
  assert.equal(state.workspace.activeTabId, other.id);
  assert.equal(state.workspace.tabs[0].response.body, "completed offscreen");
  assert.deepEqual(
    state.workspace.tabs[0].history.map((item) => item.id),
    ["2", "1"],
  );
  assert.equal(JSON.parse(writes.at(-1).value).tabs[0].history[0].id, "2");
});

test("failed send cleanup preserves the previous response and history", (t) => {
  const { store } = setupStore(t);
  const tab = store.workspace.tabs[0];
  store.recordSend(tab.id, entry(1, "previous"));
  const generation = store.beginSend(tab.id);
  store.clearInflight(tab.id, generation);
  const state = useRepeaterStore.getState();
  assert.equal(state.inflight[tab.id], undefined);
  assert.equal(state.workspace.tabs[0].response.body, "previous");
  assert.deepEqual(
    state.workspace.tabs[0].history.map((item) => item.id),
    ["1"],
  );
});

test("failed storage write retries with histories and response bodies removed, preserving live data and drafts", (t) => {
  const { store } = setupStore(t);
  const tab = store.workspace.tabs[0];
  store.updateTab(tab.id, { body: "keep this draft" });
  store.recordSend(tab.id, entry(1, "previous response"));
  const attempts = [];
  t.mock.method(globalThis.window.localStorage, "setItem", (_key, value) => {
    attempts.push(value);
    if (attempts.length === 1) throw new DOMException("full", "QuotaExceededError");
  });
  const error = t.mock.method(toast, "error", () => "test-toast");
  flush();
  assert.equal(attempts.length, 2);
  assert.ok(attempts[1].length < attempts[0].length);
  const saved = JSON.parse(attempts[1]).tabs[0];
  assert.equal(saved.body, "keep this draft");
  assert.deepEqual(saved.history, []);
  assert.equal(saved.response.body, "");
  assert.equal(saved.response.body_truncated, true);
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].response.body, "previous response");
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].history.length, 1);
  assert.equal(error.mock.callCount(), 0);
});

test("two failed storage writes report save failure through a Chinese error toast", (t) => {
  const { store } = setupStore(t);
  const tab = store.workspace.tabs[0];
  store.updateTab(tab.id, { body: "unsaved draft" });
  const setItem = t.mock.method(globalThis.window.localStorage, "setItem", () => {
    throw new DOMException("full", "QuotaExceededError");
  });
  const error = t.mock.method(toast, "error", () => "test-toast");
  flush();
  assert.equal(setItem.mock.callCount(), 2);
  assert.equal(error.mock.callCount(), 1);
  assert.match(error.mock.calls[0].arguments[0], /工作区保存失败/);
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].body, "unsaved draft");
});

test("Host shortcut replaces case-insensitive duplicates and preserves other header lines", () => {
  const headers = "X-Test: one\r\nhOsT: old.test\r\nCookie: a=1\r\nHost: duplicate.test\r\nX-Test: two";
  const updated = setHostHeader(headers, "new.test:8080");
  assert.equal(updated, "X-Test: one\nHost: new.test:8080\nCookie: a=1\nX-Test: two");
  assert.equal(getHostHeader(updated), "new.test:8080");
  assert.equal(getHostHeader("HOST: manual.test"), "manual.test");
  assert.equal(setHostHeader(updated, ""), "X-Test: one\nCookie: a=1\nX-Test: two");
  assert.equal(setHostHeader("Accept: */*", "new.test"), "Host: new.test\nAccept: */*");
  assert.equal(getHostHeader(setHostHeader("", "evil\r\nHeader: injected")), "evilHeader: injected");
  assert.deepEqual(parseHeadersText(updated), { "X-Test": "one, two", Host: "new.test:8080", Cookie: "a=1" });
});

test("migrated HTTP helpers retain raw request and response formatting", () => {
  assert.equal(headersFromReqHead("\r\nGET / HTTP/1.1\r\nHost: example.test\r\n"), "Host: example.test");
  assert.equal(buildRawResponse(response()), "HTTP/1.1 200 OK\nContent-Type: text/plain\n\nok");
});

test("workspace initializes and adds distinct tabs on HTTP origins without randomUUID", (t) => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
  t.after(() => {
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    else delete globalThis.crypto;
  });
  const workspace = defaultWorkspace();
  const updated = addTab(workspace, { url: "https://example.test/" });
  assert.equal(updated.tabs.length, 2);
  assert.notEqual(updated.tabs[0].id, updated.tabs[1].id);
  assert.equal(deserializeWorkspace(null).tabs.length, 1);
  assert.equal(new Set(Array.from({ length: 100 }, () => newId())).size, 100);
});

test("fallback IDs stay distinct without crypto even when clock and randomness repeat", (t) => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  t.after(() => {
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    else delete globalThis.crypto;
  });
  t.mock.method(Date, "now", () => 1700000000000);
  t.mock.method(Math, "random", () => 0);
  const ids = Array.from({ length: 100 }, () => newId());
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length);
});

test("secure origins retain native UUID generation", (t) => {
  const native = t.mock.method(globalThis.crypto, "randomUUID", () => "native-uuid");
  assert.equal(newId(), "native-uuid");
  assert.equal(native.mock.callCount(), 1);
});

test("combined request editing preserves body newlines and splits only the first HTTP separator", () => {
  const body = '\n{\r\n  "a": 1\r\n}\n\n';
  const text = joinRequestText("Host: example.test\nContent-Type: application/json", body);
  assert.deepEqual(splitRequestText(text), { headersText: "Host: example.test\nContent-Type: application/json", body });
  assert.deepEqual(splitRequestText("Host: example.test\n"), { headersText: "Host: example.test\n", body: "" });
  assert.deepEqual(splitRequestText("Host: example.test\r\n\r\nhello\r\n\r\nworld"), {
    headersText: "Host: example.test",
    body: "hello\r\n\r\nworld",
  });
  assert.deepEqual(splitRequestText(joinRequestText("", "body only")), { headersText: "", body: "body only" });
  assert.equal(joinRequestText("", ""), "");
});

test("traffic import uses captured metadata, preserves Host overrides and the full body", () => {
  const flow = { method: "POST", url: "https://example.test:8443/upload?q=1", host: "example.test" };
  const raw = "POST /upload?q=1 HTTP/1.1\r\nHost: override.test\r\nCookie: a=b\r\n\r\nfirst\r\n\r\nlast\n";
  const imported = requestFromTraffic(raw, flow);
  assert.equal(imported.method, "POST");
  assert.equal(imported.url, flow.url);
  assert.equal(imported.headersText, "Host: override.test\r\nCookie: a=b");
  assert.equal(imported.body, "first\r\n\r\nlast\n");
  assert.match(imported.rawRequest, /^POST \/upload\?q=1 HTTP\/1.1\n/);
  assert.equal(imported.targetOrigin, "https://example.test:8443");
  assert.equal(
    requestFromTraffic("POST /upload HTTP/1.1\nContent-Type: text/plain\n\nhello", flow).headersText,
    "Host: example.test:8443\nContent-Type: text/plain",
  );
});

test("traffic import rejects failed loads and blob preview markers rather than sending corrupted bodies", () => {
  const flow = { method: "POST", url: "https://example.test/", host: "example.test" };
  assert.throws(() => requestFromTraffic("（无法加载报文）", flow), /不完整/);
  assert.throws(
    () =>
      requestFromTraffic(
        `POST / HTTP/1.1\nHost: example.test\n\npreview\n…[truncated] @blob sha256:${"a".repeat(64)} (len=9999)`,
        flow,
      ),
    /截断预览/,
  );
});

test("global replay filters combine title, request, response, method, path and status", () => {
  const tab = {
    ...defaultWorkspace().tabs[0],
    title: "上传测试",
    method: "POST",
    url: "https://example.test/api/upload?q=1",
    headersText: "X-Test: RequestSecret",
    body: "request-body",
    response: response("ResponseSecret"),
  };
  const match = (patch) => matchesRepeaterFilters(tab, { ...DEFAULT_FILTERS, ...patch });
  assert.equal(match({ query: "上传" }), true);
  assert.equal(match({ query: "requestsecret" }), true);
  assert.equal(match({ query: "responseSECRET" }), true);
  assert.equal(match({ method: "POST", path: "/api/upload", response: "ResponseSecret", status: "2xx" }), true);
  assert.equal(match({ method: "GET" }), false);
  assert.equal(match({ path: "example.test" }), false);
  assert.equal(match({ status: "4xx" }), false);
  assert.equal(match({ response: "missing" }), false);
  assert.equal(match({ status: "pending" }), false);
  assert.equal(matchesRepeaterFilters({ ...tab, response: null }, { ...DEFAULT_FILTERS, status: "pending" }), true);
  assert.equal(
    matchesRepeaterFilters(
      { ...tab, response: { ...response(), status: 0, error: "connection refused" } },
      { ...DEFAULT_FILTERS, status: "error", response: "refused" },
    ),
    true,
  );
});

test("top tab helpers filter by group and preserve workspace group order", () => {
  let workspace = defaultWorkspace();
  workspace.groups.push({ id: "other", name: "验证" });
  const first = workspace.tabs[0];
  first.title = "默认请求";
  workspace = addTab(workspace, { method: "POST", url: "https://example.test/verify" }, { groupId: "other" });
  const visible = filterRepeaterTabs(workspace.tabs, { ...DEFAULT_FILTERS, query: "请求" });
  assert.deepEqual(
    visible.map((tab) => tab.title),
    ["默认请求"],
  );
  assert.deepEqual(
    filterRepeaterTabs(workspace.tabs, DEFAULT_FILTERS, "other").map((tab) => tab.groupId),
    ["other"],
  );
  const grouped = groupRepeaterTabs(workspace.tabs, workspace.groups);
  assert.deepEqual(
    grouped.map(({ group, tabs }) => [group.id, tabs.length]),
    [
      ["default", 1],
      ["other", 1],
    ],
  );
});

test("deleting a group keeps its tabs in the default group", (t) => {
  const { store } = setupStore(t);
  store.createGroup("临时组");
  const groupId = useRepeaterStore.getState().workspace.groups[1].id;
  const tabId = store.createTab({ title: "临时请求" }, { groupId });
  store.toggleGroupCollapsed("default");
  store.deleteGroup(groupId);
  const workspace = useRepeaterStore.getState().workspace;
  assert.equal(
    workspace.groups.some((group) => group.id === groupId),
    false,
  );
  assert.equal(workspace.groups.find((group) => group.id === "default").collapsed, false);
  assert.equal(workspace.tabs.find((tab) => tab.id === tabId).groupId, "default");
  store.deleteGroup("default");
  assert.equal(
    useRepeaterStore.getState().workspace.groups.some((group) => group.id === "default"),
    true,
  );
});

test("bulk move preserves draft, response and inflight requests and persists the whole selection atomically", (t) => {
  const { store, writes } = setupStore(t);
  const [first, other] = store.workspace.tabs;
  store.recordSend(first.id, entry(1, "original response"));
  store.createGroup("目标组");
  const groupId = useRepeaterStore.getState().workspace.groups[1].id;
  store.toggleGroupCollapsed(groupId);
  const generation = store.beginSend(first.id);
  const beforeWrites = writes.length;
  store.setTabsGroup([first.id, other.id], groupId);
  const state = useRepeaterStore.getState();
  assert.equal(
    state.workspace.tabs.every((tab) => tab.groupId === groupId),
    true,
  );
  assert.equal(state.workspace.tabs[0].response.body, "original response");
  assert.equal(state.workspace.activeTabId, other.id);
  assert.equal(state.workspace.groups[1].collapsed, false);
  assert.equal(store.isCurrentSend(first.id, generation), true);
  assert.equal(writes.length, beforeWrites + 1);
  store.setTabsGroup([first.id], "missing-group");
  assert.equal(useRepeaterStore.getState().workspace.tabs[0].groupId, groupId);
});

test("bulk delete invalidates only removed requests and retains an editable tab after deleting everything", (t) => {
  const { store } = setupStore(t);
  const [first, other] = store.workspace.tabs;
  const thirdId = store.createTab({ body: "keep me" });
  const firstGeneration = store.beginSend(first.id);
  const otherGeneration = store.beginSend(other.id);
  const thirdGeneration = store.beginSend(thirdId);
  store.setActiveTab(first.id);
  store.closeTabs([first.id, other.id]);
  store.completeSend(first.id, firstGeneration, entry(1, "late"));
  store.completeSend(other.id, otherGeneration, entry(2, "late"));
  let state = useRepeaterStore.getState();
  assert.deepEqual(
    state.workspace.tabs.map((tab) => tab.id),
    [thirdId],
  );
  assert.equal(state.workspace.activeTabId, thirdId);
  assert.equal(state.workspace.tabs[0].body, "keep me");
  assert.deepEqual(state.inflight, { [thirdId]: thirdGeneration });
  store.closeTabs([thirdId]);
  state = useRepeaterStore.getState();
  assert.equal(state.workspace.tabs.length, 1);
  assert.notEqual(state.workspace.tabs[0].id, thirdId);
  assert.equal(state.workspace.tabs[0].body, "");
  assert.equal(state.workspace.activeTabId, state.workspace.tabs[0].id);
  assert.deepEqual(state.inflight, {});
});

test("raw HTTP editing keeps the first line, method, path, protocol, Host and body together", () => {
  const tab = {
    ...defaultWorkspace().tabs[0],
    method: "POST",
    url: "https://example.test:8443/api/upload?q=1",
    headersText: "Host: virtual.test\nContent-Type: text/plain",
    body: "first\n\nlast",
  };
  const raw = buildRawRequest(tab);
  assert.equal(raw, "POST /api/upload?q=1 HTTP/1.1\nHost: virtual.test\nContent-Type: text/plain\n\nfirst\n\nlast");
  const parsed = parseRawRequest(
    raw.replace("POST /api/upload?q=1 HTTP/1.1", "PATCH /api/edited?q=2 HTTP/2.0"),
    "https://example.test:8443",
  );
  assert.deepEqual(parsed, {
    method: "PATCH",
    url: "https://example.test:8443/api/edited?q=2",
    httpVersion: "HTTP/2.0",
    headersText: tab.headersText,
    body: tab.body,
  });
  assert.equal(parseRawRequest("GET /new HTTP/1.1\nHost: new.test\n\n").url, "https://new.test/new");
  assert.equal(parseRawRequest("GET /new HTTP/1.1\nHost: newer.test\n\n").url, "https://newer.test/new");
  assert.equal(
    parseRawRequest("GET http://elsewhere.test/path HTTP/1.1\nHost: vhost.test\n\n", "https://old.test").url,
    "http://elsewhere.test/path",
  );
  assert.throws(() => parseRawRequest("POST /missing-version\nHost: test\n\n"), /首行/);
  assert.equal(buildRawRequest({ ...tab, rawRequest: "unfinished HTTP draft" }), "unfinished HTTP draft");
});

test("raw request drafts and connection origins survive persistence and history restoration", (t) => {
  const { store } = setupStore(t);
  const id = store.workspace.tabs[0].id;
  const rawRequest = "POST /unfinished HTTP/1.";
  store.updateTab(id, { rawRequest, targetOrigin: "http://example.test:8080" });
  const loaded = deserializeWorkspace(serializeWorkspace(useRepeaterStore.getState().workspace));
  assert.equal(loaded.tabs[0].rawRequest, rawRequest);
  assert.equal(loaded.tabs[0].targetOrigin, "http://example.test:8080");
  store.recordSend(id, {
    ...entry(1),
    rawRequest: "POST /old HTTP/1.1\nHost: example.test\n\nbody",
    targetOrigin: "https://example.test",
  });
  assert.equal(
    useRepeaterStore.getState().workspace.tabs[0].history[0].rawRequest.startsWith("POST /old HTTP/1.1"),
    true,
  );
});

test("evidence import preserves captured request line and protocol rather than removing it", () => {
  const initial = { method: "GET", url: "https://example.test/path", headersText: "Host: example.test", body: "" };
  const imported = requestFromEvidence(initial, "GET /path HTTP/2.0\r\nHost: example.test\r\n");
  assert.equal(imported.rawRequest, "GET /path HTTP/2.0\nHost: example.test\n\n");
  assert.equal(imported.targetOrigin, "https://example.test");
  assert.equal(buildRawRequest(imported), imported.rawRequest);
});
