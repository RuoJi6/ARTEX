import { expect, type Page, test } from "@playwright/test";

import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { settings } from "../src/lib/mock/data";
import { mockHandle } from "../src/lib/mock/handler";

const raw = "原文 {value} <payload>";
const language = (page: Page) => page.getByRole("combobox", { name: /^(Interface language|界面语言)$/, includeHidden: true });

async function selectLanguage(page: Page, locale: "en" | "zh-CN") {
  await language(page).selectOption(locale, { force: true });
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

let runtimeErrors: string[];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR|IntlError/.test(message.text())) {
      runtimeErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("artex_token", "fixture-only");
    localStorage.setItem("artex.ui-locale", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let json: unknown;
    if (url.pathname === "/api/auth/status") json = { initialized: true, authenticated: true };
    else if (url.pathname === "/api/health") json = { ok: true, version: "fixture" };
    else if (url.pathname === "/api/settings") json = { ...settings, show_egress_ip: false };
    else if (url.pathname === "/api/settings/proxy-pool") json = { entries: [], active_id: "", switch_log: [] };
    else if (url.pathname === "/api/update/settings") json = { proxy: "" };
    else if (url.pathname === "/api/update/check") json = { current: "v1.0.0", comparable: true, has_update: false, mode: "binary", os: "linux", arch: "amd64" };
    else json = await mockHandle(request.method(), url.pathname.slice(4) + url.search, request.postData());
    await route.fulfill({ json });
  });
});

test.afterEach(() => expect(runtimeErrors).toEqual([]));

test("proxy pool and reconnect drafts retain DOM and exact wire values across languages", async ({ page }) => {
  const writes: unknown[] = [];
  let imported: unknown;
  await page.route("**/api/settings", async (route) => {
    const patch = route.request().method() === "GET" ? {} : route.request().postDataJSON();
    if (route.request().method() !== "GET") writes.push(patch);
    await route.fulfill({ json: { ...settings, show_egress_ip: false, ...patch } });
  });
  await page.route("**/api/settings/proxy-pool/import", async (route) => {
    imported = route.request().postDataJSON();
    await route.fulfill({ json: { entries: [], active_id: "", switch_log: [], errors: [{ line: 1, error: raw }] } });
  });
  await page.goto("/system/settings/");
  await page.getByRole("navigation", { name: en.settings.categoriesLabel }).getByRole("button", { name: en.settings.categories.traffic.label }).click();
  await page.getByText(en.settings.proxy.reconnect.title, { exact: true }).click();
  await page.getByLabel(en.settings.proxy.reconnect.max, { exact: true }).fill("7");
  await page.getByLabel(en.settings.proxy.reconnect.interval, { exact: true }).fill("41");
  const reconnectNode = await page.locator("#proxy-reconnect-max").elementHandle();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByLabel(zh.settings.proxy.reconnect.max, { exact: true })).toHaveValue("7");
  expect(await page.locator("#proxy-reconnect-max").evaluate((node, previous) => node === previous, reconnectNode)).toBe(true);
  await selectLanguage(page, "en");
  await page.getByRole("button", { name: en.settings.proxy.reconnect.save, exact: true }).click();
  await expect.poll(() => writes).toContainEqual({ proxy_reconnect_max_attempts: 7, proxy_reconnect_interval_seconds: 41 });

  await page.getByText(en.settings.proxyPool.policyTitle, { exact: true }).click();
  await page.getByLabel(en.settings.proxyPool.interval, { exact: true }).fill("43");
  await page.getByLabel(en.settings.proxyPool.order, { exact: true }).click();
  await page.getByRole("option", { name: en.settings.proxyPool.random, exact: true }).click();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByLabel(zh.settings.proxyPool.order, { exact: true })).toContainText(zh.settings.proxyPool.random);
  await expect(page.getByLabel(zh.settings.proxyPool.interval, { exact: true })).toHaveValue("43");
  await selectLanguage(page, "en");
  await page.getByRole("button", { name: en.settings.proxyPool.savePolicy, exact: true }).click();
  await expect.poll(() => writes).toContainEqual(expect.objectContaining({ proxy_rotate_strategy: "random", proxy_rotate_interval_seconds: 43 }));

  await page.getByText(en.settings.proxyPool.importTitle, { exact: true }).click();
  const input = `http://127.0.0.1:8080|${raw}|${raw}`;
  await page.getByPlaceholder(en.settings.proxyPool.importPlaceholder).fill(input);
  await selectLanguage(page, "zh-CN");
  await expect(page.getByPlaceholder(zh.settings.proxyPool.importPlaceholder)).toHaveValue(input);
  await page.getByRole("button", { name: zh.settings.proxyPool.import, exact: true }).click();
  await expect.poll(() => imported).toEqual({ text: input });
  await expect(page.getByText(zh.settings.proxyPool.lineError.replace("{line}", "1").replace("{error}", raw), { exact: true })).toBeVisible();
});

test("Jev profile labels follow locale while the profile payload stays unchanged", async ({ page }) => {
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/llm/profiles", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { profiles: [] } });
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { id: 123 } });
  });
  await page.goto("/system/llm/");
  await page.getByRole("button", { name: en.llmPage.page.new, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(en.llmPage.profile.name.label, { exact: true }).fill(raw);
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: en.llmPage.profile.format.jev, exact: true }).click();
  await expect(dialog.getByLabel(en.llmPage.profile.model.label, { exact: true })).toHaveValue("jev-latest");
  await selectLanguage(page, "zh-CN");
  await expect(dialog.getByRole("combobox").first()).toContainText(zh.llmPage.profile.format.jev);
  await expect(dialog.getByLabel(zh.llmPage.profile.name.label, { exact: true })).toHaveValue(raw);
  await selectLanguage(page, "en");
  await dialog.getByRole("button", { name: en.llmPage.profile.create, exact: true }).click();
  await expect.poll(() => saved).toEqual(expect.objectContaining({ name: raw, format: "jev", model: "jev-latest", max_tokens_field: "" }));
});

test("update proxy drafts survive locale changes without refetching and backend errors stay raw", async ({ page }) => {
  let reads = 0;
  let saved: unknown;
  await page.route("**/api/update/settings", async (route) => {
    if (route.request().method() === "GET") {
      reads += 1;
      return route.fulfill({ json: { proxy: "" } });
    }
    saved = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: raw } });
  });
  await page.goto("/system/settings/");
  const input = page.getByLabel(en.settings.update.proxy, { exact: true });
  await input.fill("socks5://127.0.0.1:1080");
  await expect.poll(() => reads).toBe(1);
  await selectLanguage(page, "zh-CN");
  await expect(page.getByLabel(zh.settings.update.proxy, { exact: true })).toHaveValue("socks5://127.0.0.1:1080");
  await selectLanguage(page, "en");
  expect(reads).toBe(1);
  await input.locator("..").getByRole("button", { name: en.settings.update.save, exact: true }).click();
  await expect.poll(() => saved).toEqual({ proxy: "socks5://127.0.0.1:1080" });
  await expect(page.getByRole("alert").filter({ hasText: raw })).toHaveText(en.settings.update.saveFailed.replace("{error}", raw));
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("alert").filter({ hasText: raw })).toHaveText(zh.settings.update.saveFailed.replace("{error}", raw));
});
