const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "api.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function client(response) {
  response.headers ??= new Headers();
  const exports = {};
  const location = { href: "/setup" };
  const removed = [];
  const document = { cookie: "" };
  vm.runInNewContext(compiled, {
    exports,
    Error,
    process: { env: {} },
    URLSearchParams,
    window: { location },
    document,
    localStorage: { getItem: () => "test-token", removeItem: (key) => removed.push(key) },
    require: (id) => {
      if (id === "@/lib/mock/enabled") return { MOCK: false };
      if (id === "@/lib/mock/handler") return { mockHandle: () => assert.fail("unexpected mock request") };
      throw new Error(`Unexpected runtime import: ${id}`);
    },
    fetch: async () => response,
  });
  return { ...exports, location, removed, document };
}

test("API errors retain original text, stable codes and interpolation values", async () => {
  const { http, ApiError } = client({
    ok: false,
    status: 400,
    json: async () => ({ error: "密码长度至少 8 位", code: "password_too_short", params: { min: 8 } }),
  });
  await assert.rejects(http("/auth/init"), (error) => {
    assert.ok(error instanceof Error && error instanceof ApiError);
    assert.equal(error.message, "密码长度至少 8 位");
    assert.equal(error.code, "password_too_short");
    assert.equal(error.params.min, 8);
    return true;
  });
});

test("legacy, invalid and non-JSON failures preserve useful fallback messages", async () => {
  for (const [payload, message] of [
    [{ error: "legacy detail" }, "legacy detail"],
    [{ error: " detail ", code: 123, params: [] }, "detail"],
    [null, "GET /example: 503"],
  ]) {
    const { http } = client({ ok: false, status: 503, json: async () => payload });
    await assert.rejects(http("/example"), (error) => {
      assert.equal(error.message, message);
      assert.equal(error.code, undefined);
      assert.equal(error.params, undefined);
      return true;
    });
  }
  const { http } = client({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError("not JSON");
    },
  });
  await assert.rejects(http("/example"), /GET \/example: 502/);
});

test("unauthorized requests still clear authentication and return to sign-in", async () => {
  const { http, location, removed, document } = client({ ok: false, status: 401 });
  await assert.rejects(http("/private"), (error) => error.code === "unauthorized");
  assert.deepEqual(removed, ["artex_token"]);
  assert.equal(document.cookie, "artex_token=; path=/; max-age=0");
  assert.equal(location.href, "/login");
});

test("unauthorized responses retain the server's specific authentication code", async () => {
  const { http } = client({
    ok: false,
    status: 401,
    json: async () => ({ error: "当前密码错误", code: "current_password_incorrect" }),
  });
  await assert.rejects(http("/auth/change-password"), (error) => {
    assert.equal(error.code, "current_password_incorrect");
    assert.equal(error.message, "当前密码错误");
    return true;
  });
});
