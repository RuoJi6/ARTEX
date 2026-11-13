const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, "brand-storage-migration.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: exportsObject },
);

function storage(entries, failWrite = false) {
  const values = new Map(entries);
  return {
    values,
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite) throw new Error("quota");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
}

test("migrates all legacy preferences and sessions before reads, without overwriting new values", () => {
  const localStorage = storage([
    ["artex_locale", "en"],
    ["artex_token", "old-jwt"],
    ["artex.chat.send-mode", "shift-enter"],
    ["artex_repeater_workspace_v1", "workspace"],
    ["artex_task_list_sort", "old-sort"],
    ["mysterysecurityteam_task_list_sort", "new-sort"],
    ["unrelated", "untouched"],
  ]);
  const sessionStorage = storage([["artex.conversation-scroll.123", "250"]]);
  const run = () =>
    vm.runInNewContext(exportsObject.BRAND_STORAGE_MIGRATION_SCRIPT, { window: { localStorage, sessionStorage } });
  run();
  assert.equal(localStorage.getItem("mysterysecurityteam_locale"), "en");
  assert.equal(localStorage.getItem("mysterysecurityteam_token"), "old-jwt");
  assert.equal(localStorage.getItem("mysterysecurityteam_repeater_workspace_v1"), "workspace");
  assert.equal(localStorage.getItem("mysterysecurityteam.chat.send-mode"), "shift-enter");
  assert.equal(localStorage.getItem("mysterysecurityteam_task_list_sort"), "new-sort");
  assert.equal(sessionStorage.getItem("mysterysecurityteam.conversation-scroll.123"), "250");
  assert.equal(
    [...localStorage.values.keys()].some((key) => key.startsWith("artex")),
    false,
  );
  const snapshot = [...localStorage.values];
  run();
  assert.deepEqual([...localStorage.values], snapshot);
  assert.equal(localStorage.getItem("unrelated"), "untouched");
});

test("storage failures preserve legacy values and do not prevent the app from loading", () => {
  const localStorage = storage([["artex_token", "keep-me"]], true);
  vm.runInNewContext(exportsObject.BRAND_STORAGE_MIGRATION_SCRIPT, {
    window: {
      localStorage,
      get sessionStorage() {
        throw new Error("blocked");
      },
    },
  });
  assert.equal(localStorage.getItem("artex_token"), "keep-me");
});
