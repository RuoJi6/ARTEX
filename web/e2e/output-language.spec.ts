import { expect, type Page, test } from "@playwright/test";

import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { settings } from "../src/lib/mock/data";
import { mockHandle } from "../src/lib/mock/handler";

const selector = (page: Page) => page.getByRole("combobox", { name: /^(Interface language|界面语言)$/ });
let saves: unknown[];

test.beforeEach(async ({ page }) => {
  saves = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let json: unknown;
    if (url.pathname === "/api/auth/status") json = { initialized: true };
    else if (url.pathname === "/api/health") json = { ok: true, version: "fixture" };
    else if (url.pathname === "/api/settings") {
      if (request.method() === "PUT") saves.push(request.postDataJSON());
      json = { ...settings, show_egress_ip: false };
    } else json = await mockHandle(request.method(), url.pathname.slice(4) + url.search, request.postData());
    await route.fulfill({ json });
  });
});

test("explicit selection saves output language once; hydration and reload do not", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("artex_token", "fixture-only");
    if (!localStorage.getItem("artex.ui-locale")) localStorage.setItem("artex.ui-locale", "en");
  });
  await page.goto("/function/workspace/");
  await expect(selector(page)).toHaveValue("en");
  expect(saves).toEqual([]);
  await selector(page).selectOption("zh-CN");
  await expect.poll(() => saves).toEqual([{ output_language: "zh" }]);
  await expect(selector(page)).toBeEnabled();
  await selector(page).selectOption("en");
  await expect.poll(() => saves).toEqual([{ output_language: "zh" }, { output_language: "en" }]);
  await expect(selector(page)).toBeEnabled();
  await page.reload();
  await expect(selector(page)).toHaveValue("en");
  expect(saves).toHaveLength(2);
  expect(await page.evaluate(() => sessionStorage.getItem("artex.pending-output-language"))).toBeNull();
});

test("pending save disables selection; failure retains UI and offers an explicit retry", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("artex_token", "fixture-only"));
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let attempts = 0;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    attempts++;
    if (attempts === 1) {
      await pending;
      await route.fulfill({ status: 500, json: { error: "fixture save failure" } });
    } else await route.fulfill({ json: { ...settings, output_language: "en" } });
  });
  await page.goto("/function/workspace/");
  await selector(page).selectOption("en");
  await expect(selector(page)).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  finish();
  await expect(page.getByText(en.language.saveFailed, { exact: true })).toBeVisible();
  await expect(selector(page)).toBeEnabled();
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: en.language.retry, exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(selector(page)).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem("artex.pending-output-language"))).toBeNull();
});

for (const screen of ["login", "setup"] as const) {
  test(`${screen} carries an explicit choice through successful authentication`, async ({ page }) => {
    if (screen === "setup") await page.route("**/api/auth/status", (route) => route.fulfill({ json: { initialized: false } }));
    await page.route(`**/api/auth/${screen === "login" ? "login" : "init"}`, (route) => route.fulfill({ json: { token: "fixture-only" } }));
    await page.goto(`/${screen}/`);
    await selector(page).selectOption("en");
    expect(saves).toEqual([]);
    if (screen === "login") {
      // The full reload preserves only the explicit pending action.
      await page.reload();
      await expect(selector(page)).toHaveValue("en");
      await page.locator("#password").fill("fixture-password");
      await page.getByRole("button", { name: en.login.termsLink, exact: true }).click();
      await page.getByRole("dialog").locator(".overflow-y-auto").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event("scroll"));
      });
      await page.getByRole("button", { name: en.login.termsAgree, exact: true }).click();
      await page.getByRole("button", { name: en.login.title, exact: true }).click();
    } else {
      await page.getByLabel(en.setup.password, { exact: true }).fill("fixture-password");
      await page.getByLabel(en.setup.confirm, { exact: true }).fill("fixture-password");
      await page.getByRole("button", { name: en.setup.submit, exact: true }).click();
    }
    await expect(page).toHaveURL(/\/function\/tasks\/?$/);
    await expect.poll(() => saves).toEqual([{ output_language: "en" }]);
    await expect(selector(page)).toBeEnabled();
    await page.reload();
    await expect(selector(page)).toHaveValue("en");
    expect(saves).toHaveLength(1);
  });
}

test("origin summary translates its generated wrapper and preserves custom text and raw payload", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("artex_token", "fixture-only"));
  const description = "Original {description}";
  const goal = "Original <goal>";
  const summary = `任务起点：${description}；目标：${goal}`;
  const custom = "Custom 原文 summary";
  const nodes = [summary, custom].map((text, index) => ({
    id: String(8100 + index), type: "fact", state: "origin", origin: "system",
    payload: JSON.stringify({ summary: text, description, goal }), priority: 0,
  }));
  const original = JSON.stringify(nodes);
  await page.route("**/api/exploration/graph?*", (route) => route.fulfill({ json: { nodes, edges: [] } }));
  await page.goto("/function/tasks/detail/?id=t-acme-web");
  await page.getByRole("tab", { name: zh.taskDetail.tabs.graph, exact: true }).click();
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  await selector(page).selectOption("en");
  await expect(page.getByText(`Task start: ${description}; Objective: ${goal}`, { exact: true })).toBeVisible();
  await expect(page.getByText(custom, { exact: true })).toBeVisible();
  expect(JSON.stringify(nodes)).toBe(original);
});
