import { expect, type Page, test } from "@playwright/test";

import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { settings } from "../src/lib/mock/data";
import { mockHandle } from "../src/lib/mock/handler";

const language = (page: Page) => page.locator("select").filter({ has: page.locator('option[value="en"]') });
let runtimeErrors: string[];

async function selectLanguage(page: Page, locale: "en" | "zh-CN") {
  // Exercise an open modal without closing it or discarding its draft.
  await language(page).selectOption(locale, { force: true });
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function authenticated(page: Page) {
  await page.addInitScript(() => localStorage.setItem("artex_token", "fixture-only"));
  await page.goto("/function/workspace/");
  await expect(language(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let json: unknown;
    if (url.pathname === "/api/auth/status") json = { initialized: true };
    else if (url.pathname === "/api/health") json = { ok: true, version: "fixture" };
    else if (url.pathname === "/api/settings") json = { ...settings, show_egress_ip: false };
    else if (url.pathname === "/api/update/check") json = { has_update: true, latest: "v9.9.9" };
    else json = await mockHandle(request.method(), url.pathname.slice(4) + url.search, request.postData());
    await route.fulfill({ json });
  });
});

test.afterEach(() => expect(runtimeErrors).toEqual([]));

test("static Chinese defaults and explicit English preference survive reloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const html = await (await page.request.get("/login/")).text();
  expect(html).toContain('lang="zh-CN"');
  expect(html).toContain(zh.login.checking);
  await page.goto("/login/");
  await expect(language(page)).toHaveValue("zh-CN");
  await expect(page).toHaveTitle(zh.metadata.title);
  await selectLanguage(page, "en");
  await expect(page.getByRole("heading", { name: en.login.title })).toBeVisible();
  await expect(page).toHaveTitle(en.metadata.title);
  await page.reload();
  await expect(language(page)).toHaveValue("en");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", en.metadata.description);
  await selectLanguage(page, "zh-CN");
  await page.reload();
  await expect(language(page)).toHaveValue("zh-CN");
  expect(errors).toEqual([]);
});

test("unknown stored locales fall back to Chinese", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("artex.ui-locale", "unsupported"));
  await page.goto("/login/");
  await expect(page.getByRole("heading", { name: zh.login.title })).toBeVisible();
  await expect(language(page)).toHaveValue("zh-CN");
  await selectLanguage(page, "en");
  expect(await page.evaluate(() => localStorage.getItem("artex.ui-locale"))).toBe("en");
});

test("language selection works when preference storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "artex.ui-locale") throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "artex.ui-locale") throw new DOMException("Blocked", "SecurityError");
      return set.call(this, key, value);
    };
  });
  await page.goto("/login/");
  await selectLanguage(page, "en");
  await expect(page.getByRole("heading", { name: en.login.title })).toBeVisible();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("heading", { name: zh.login.title })).toBeVisible();
});

test("login retains password, DOM and terms acceptance across languages", async ({ page }) => {
  let payload: unknown;
  await page.route("**/api/auth/login", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: "fixture rejection" } });
  });
  await page.goto("/login/");
  await page.getByLabel(zh.login.password, { exact: true }).fill("fixture-password");
  const input = await page.locator("#password").elementHandle();
  await page.getByRole("button", { name: zh.login.termsLink, exact: true }).click();
  await expect(page.getByRole("button", { name: zh.login.termsAgree, exact: true })).toBeDisabled();
  await selectLanguage(page, "en");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: en.login.termsTitle })).toBeVisible();
  await expect(dialog.getByText(en.login.prohibitionScan, { exact: true })).toBeVisible();
  await dialog.locator(".overflow-y-auto").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.getByRole("button", { name: en.login.termsAgree, exact: true }).click();
  await selectLanguage(page, "zh-CN");
  await expect(page.locator("#agree-terms")).toBeChecked();
  await expect(page.locator("#password")).toHaveValue("fixture-password");
  expect(await input?.evaluate((element) => element === document.querySelector("#password"))).toBe(true);
  await page.getByRole("button", { name: zh.login.title, exact: true }).click();
  await expect(page.getByText(zh.login.invalidCredentials, { exact: true })).toBeVisible();
  expect(payload).toEqual({ username: "ARTEX", password: "fixture-password" });
  await selectLanguage(page, "en");
  await expect(page.getByText(en.login.invalidCredentials, { exact: true })).toBeVisible();
});

test("setup validation follows locale while drafts and backend details remain unchanged", async ({ page }) => {
  await page.route("**/api/auth/status", (route) => route.fulfill({ json: { initialized: false } }));
  const rawError = "Backend detail {value} <payload>";
  let payload: unknown;
  await page.route("**/api/auth/init", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: rawError } });
  });
  await page.goto("/setup/");
  await page.getByLabel(zh.setup.password, { exact: true }).fill("fixture-password");
  await page.getByLabel(zh.setup.confirm, { exact: true }).fill("different-password");
  await page.getByRole("button", { name: zh.setup.submit, exact: true }).click();
  await expect(page.getByText(zh.setup.passwordMismatch, { exact: true })).toBeVisible();
  await selectLanguage(page, "en");
  await expect(page.getByText(en.setup.passwordMismatch, { exact: true })).toBeVisible();
  await expect(page.getByLabel(en.setup.password, { exact: true })).toHaveValue("fixture-password");
  await page.getByLabel(en.setup.confirm, { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: en.setup.submit, exact: true }).click();
  await expect(page.getByText(rawError, { exact: true })).toBeVisible();
  expect(payload).toEqual({ password: "fixture-password" });
  await selectLanguage(page, "zh-CN");
  await expect(page.getByText(rawError, { exact: true })).toBeVisible();
});

test("navigation translates without changing links, search drafts, theme or local clock", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T07:08:09Z"));
  await authenticated(page);
  const links = await page.locator('[data-slot="sidebar"] a').evaluateAll((items) => items.map((a) => a.getAttribute("href")));
  await expect(page.getByRole("timer")).toHaveText("2026-11-02 14:08:09");
  await selectLanguage(page, "en");
  expect(await page.locator('[data-slot="sidebar"] a').evaluateAll((items) => items.map((a) => a.getAttribute("href")))).toEqual(links);
  await expect(page.getByRole("timer", { name: en.header.currentTime })).toHaveText("2026-11-02 14:08:09");
  await expect(page.getByRole("link", { name: en.nav.tasks, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.updates.availableVersion.replace("{version}", "9.9.9"), exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Search/ }).click();
  await page.getByRole("dialog").getByRole("combobox").fill("LLM");
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveValue("LLM");
  await selectLanguage(page, "en");
  await page.getByRole("option", { name: en.nav.llm, exact: true }).click();
  await expect(page).toHaveURL(/\/system\/llm\/$/);
  await page.getByRole("button", { name: en.preferences.title, exact: true }).click();
  await page.getByRole("radio", { name: en.preferences.dark, exact: true }).click();
  await selectLanguage(page, "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  await expect(page.getByRole("radio", { name: zh.preferences.dark, exact: true })).toBeChecked();
});

test("account password drafts and request values survive locale changes", async ({ page }) => {
  let payload: unknown;
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route("**/api/auth/change-password", async (route) => {
    payload = route.request().postDataJSON();
    await pending;
    await route.fulfill({ json: { ok: true } });
  });
  await authenticated(page);
  await page.getByRole("button", { name: "A ARTEX", exact: true }).click();
  await page.getByRole("menuitem", { name: zh.account.changePassword, exact: true }).click();
  await page.getByLabel(zh.password.current, { exact: true }).fill("old-fixture");
  await page.getByLabel(zh.password.new, { exact: true }).fill("new-fixture");
  await page.getByLabel(zh.password.confirm, { exact: true }).fill("new-fixture");
  await selectLanguage(page, "en");
  await expect(page.getByLabel(en.password.current, { exact: true })).toHaveValue("old-fixture");
  await expect(page.getByLabel(en.password.new, { exact: true })).toHaveValue("new-fixture");
  await page.getByRole("dialog").getByRole("button", { name: en.password.submit, exact: true }).click();
  await expect.poll(() => payload).toBeDefined();
  await selectLanguage(page, "zh-CN");
  finish();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(zh.password.changed, { exact: true })).toBeVisible();
  expect(payload).toEqual({ old_password: "old-fixture", new_password: "new-fixture" });
});

test("mobile sidebar exposes the language selector and translated navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("artex_token", "fixture-only"));
  await page.goto("/function/workspace/");
  await page.getByRole("button", { name: zh.sidebar.toggle, exact: true }).click();
  await expect(language(page)).toBeVisible();
  await selectLanguage(page, "en");
  await expect(page.getByRole("dialog").getByRole("link", { name: en.nav.tasks, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: en.sidebar.toggle, exact: true }).click();
  await expect(language(page)).toHaveValue("en");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
