const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "api.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function client(fetch) {
  const exports = {};
  const state = { token: "original-admin-token", reloads: 0, requests: [], streams: [] };
  const location = { href: "http://localhost/function/tasks/?page=2", hostname: "localhost", reload: () => state.reloads++ };
  const document = { cookie: "artex_token=original-admin-token" };
  class EventSource {
    constructor(url, options) { this.url = url; this.options = options; this.listeners = {}; state.streams.push(this); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  vm.runInNewContext(compiled, {
    exports, URL, URLSearchParams, FormData, EventSource,
    process: { env: { NODE_ENV: "production" } },
    window: { location }, document,
    localStorage: { getItem: () => state.token, removeItem: () => { state.token = null; } },
    require: (id) => {
      if (id === "@/lib/mock/enabled") return { MOCK: false };
      if (id === "@/lib/mock/handler") return { mockHandle: () => assert.fail("unexpected mock request") };
      throw new Error(`Unexpected import: ${id}`);
    },
    fetch: async (...args) => { state.requests.push(args); return fetch(...args); },
  });
  return { ...exports, state, location, document };
}

const gateFailure = () => new Response('{"error":"请先完成 HTTP Basic Auth 验证","code":"basic_auth_required"}', {
  status: 401, headers: { "X-Artex-Auth": "basic" },
});

function assertSessionPreserved(c) {
  assert.equal(c.state.token, "original-admin-token");
  assert.equal(c.document.cookie, "artex_token=original-admin-token");
  assert.equal(c.location.href, "http://localhost/function/tasks/?page=2");
}

test("expired Basic gate reloads the current tab and preserves the admin session", async () => {
  const c = client(async () => gateFailure());
  await assert.rejects(c.http("/version"), /访问验证已过期/);
  assert.equal(c.state.reloads, 1);
  assert.equal(c.state.requests[0][1].headers.Authorization, "Bearer original-admin-token");
  assertSessionPreserved(c);
});

test("concurrent gate failures reload once and stop new polling requests", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const c = client(async () => { await pending; return gateFailure(); });
  const requests = [c.http("/version"), c.http("/tasks"), c.http("/settings")];
  release();
  const results = await Promise.allSettled(requests);
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.equal(c.state.reloads, 1);
  await assert.rejects(c.http("/tasks"), /访问验证已过期/);
  assert.equal(c.state.requests.length, 3);
  assertSessionPreserved(c);
});

test("a late admin 401 cannot clear the token once gate recovery has started", async () => {
  let release;
  const late = new Promise((resolve) => { release = resolve; });
  const c = client(async (url) => {
    if (url === "/api/tasks") { await late; return new Response("expired", { status: 401 }); }
    return gateFailure();
  });
  const staleRequest = c.http("/tasks");
  await assert.rejects(c.http("/version"), /访问验证已过期/);
  release();
  await assert.rejects(staleRequest, /访问验证已过期/);
  assert.equal(c.state.reloads, 1);
  assertSessionPreserved(c);
});

test("an ordinary expired admin JWT still clears the login and opens /login", async () => {
  const c = client(async () => new Response('{"error":"token 无效或已过期"}', { status: 401 }));
  await assert.rejects(c.http("/version"), (error) => {
    assert.equal(error.name, "ApiError");
    assert.equal(error.code, "unauthorized");
    assert.equal(error.message, "token 无效或已过期");
    return true;
  });
  assert.equal(c.state.token, null);
  assert.equal(c.location.href, "/login");
  assert.equal(c.state.reloads, 0);
});

test("business errors do not trigger gate recovery", async () => {
  const c = client(async () => new Response('{"error":"禁止操作"}', { status: 403 }));
  await assert.rejects(c.http("/tasks"), /禁止操作/);
  assert.equal(c.state.reloads, 0);
  assertSessionPreserved(c);
});

test("uploads and downloads also recover the Basic gate", async () => {
  for (const action of [
    (c) => c.api.workspaceUpload("", [new File(["test"], "test.txt")]),
    (c) => c.api.workspaceDownload("test.txt"),
    (c) => c.api.report(),
    (c) => c.api.interceptGetToolConfig(),
  ]) {
    const c = client(async () => gateFailure());
    await assert.rejects(action(c), /访问验证已过期/);
    assert.equal(c.state.reloads, 1);
    assertSessionPreserved(c);
  }
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("SSE failures probe the same-origin gate once for concurrent streams", async () => {
  const c = client(async () => gateFailure());
  const first = c.openSSE("/api/logs/stream");
  const second = c.openSSE("/api/update/stream");
  first.listeners.error();
  second.listeners.error();
  await tick();
  assert.equal(c.state.requests.length, 1);
  assert.equal(c.state.requests[0][0], "/api/auth/status");
  assert.equal(c.state.reloads, 1);
  assertSessionPreserved(c);
});

test("ordinary SSE disconnects and network errors do not reload the page", async () => {
  for (const fetch of [
    async () => new Response('{"initialized":true}'),
    async () => { throw new TypeError("network unavailable"); },
  ]) {
    const c = client(fetch);
    const source = c.openSSE("/api/logs/stream");
    source.listeners.error();
    await tick();
    source.listeners.error();
    await tick();
    assert.equal(c.state.reloads, 0);
    assert.equal(c.state.requests.length, 2);
    assertSessionPreserved(c);
  }
});

test("a fresh document resumes API requests with the original admin token", async () => {
  const c = client(async () => new Response('{"version":"test"}'));
  assert.equal((await c.api.version()).version, "test");
  assert.equal(c.state.requests[0][1].headers.Authorization, "Bearer original-admin-token");
  assert.equal(c.state.reloads, 0);
});
