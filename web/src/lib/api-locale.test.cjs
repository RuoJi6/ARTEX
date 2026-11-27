const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "api.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Loads api.ts with a fake localStorage. `storage` maps keys to values; pass a
// function instead to control getItem directly (e.g. to make it throw).
function load(storage, fetch = async () => assert.fail("unexpected request")) {
  const getItem = typeof storage === "function" ? storage : (key) => (key in storage ? storage[key] : null);
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: {} },
    URLSearchParams,
    window: {},
    localStorage: { getItem },
    require: (id) => {
      if (id === "@/lib/mock/enabled") return { MOCK: false };
      if (id === "@/lib/mock/handler") return { mockHandle: () => assert.fail("unexpected mock request") };
      if (id === "@/i18n/config") return require("../i18n/config.ts");
      throw new Error(`Unexpected runtime import: ${id}`);
    },
    fetch,
  });
  return exports;
}

test("uiLocaleHeader follows artex_locale", () => {
  const cases = [
    [{ artex_locale: "en" }, "en"],
    [{ artex_locale: "en-US" }, "en"],
    [{ artex_locale: "zh-CN" }, "zh-CN"],
    [{ artex_locale: "fr" }, "zh-CN"],
    [{}, "zh-CN"],
  ];
  for (const [storage, want] of cases) {
    assert.deepEqual({ ...load(storage).uiLocaleHeader() }, { "X-Artex-Locale": want }, JSON.stringify(storage));
  }
});

test("uiLocaleHeader falls back to the default locale when storage throws", () => {
  const { uiLocaleHeader } = load(() => {
    throw new Error("storage blocked");
  });
  assert.deepEqual({ ...uiLocaleHeader() }, { "X-Artex-Locale": "zh-CN" });
});

test("API requests carry X-Artex-Locale", async () => {
  let headers;
  const { api } = load({ artex_locale: "en" }, async (url, init) => {
    headers = init.headers;
    return { ok: true, status: 200, json: async () => ({ version: "v1" }) };
  });
  await api.version();
  assert.equal(headers["X-Artex-Locale"], "en");
});
