import { expect, type Page, test } from "@playwright/test";

import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { settings } from "../src/lib/mock/data";
import { mockHandle } from "../src/lib/mock/handler";
import type { Finding } from "../src/lib/types";

const raw = "\u539f\u6587 {value} <payload>";

async function selectLanguage(page: Page, locale: "en" | "zh-CN") {
  await page.getByRole("combobox", { name: /^(Interface language|界面语言)$/, includeHidden: true }).selectOption(locale, { force: true });
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("artex_token", "fixture-only"));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let json: unknown;
    if (url.pathname === "/api/auth/status") json = { initialized: true, authenticated: true };
    else if (url.pathname === "/api/health") json = { ok: true, version: "fixture" };
    else if (url.pathname === "/api/settings") json = { ...settings, show_egress_ip: false };
    else json = await mockHandle(request.method(), url.pathname.slice(4) + url.search, request.postData());
    await route.fulfill({ json });
  });
});

test("report conversation controls translate while drafts and reporter requests remain unchanged", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const finding = await mockHandle<Finding>("GET", "/exploration/findings/f-2");
  await page.route("**/api/exploration/findings/f-2", (route) => route.fulfill({
    json: { ...finding, name: raw, report: raw, inherited: false, report_conversation_id: undefined },
  }));
  const created: unknown[] = [];
  let sent: unknown;
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    created.push(route.request().postDataJSON());
    await route.fulfill({ json: {
      id: 9101, agent_key: "reporter", title: raw,
      created_at: "2026-11-02T07:08:09Z", updated_at: "2026-11-02T07:08:09Z",
    } });
  });
  await page.route("**/api/conversations/9101/messages**", async (route) => {
    if (route.request().method() === "POST") sent = route.request().postDataJSON();
    await route.fulfill({ json: { items: [], cursor: 0, running: false } });
  });

  await page.goto("/function/findings/detail/?id=f-2");
  await page.getByRole("button", { name: zh.core.findings.adjustReport, exact: true }).click();
  await expect.poll(() => created.length).toBe(1);
  const input = page.getByPlaceholder(zh.core.findings.reportChatPlaceholder, { exact: true });
  await input.fill(raw);
  const draft = await input.elementHandle();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    const messages = locale === "en" ? en : zh;
    await selectLanguage(page, locale);
    const translated = page.getByPlaceholder(messages.core.findings.reportChatPlaceholder, { exact: true });
    await expect(translated).toHaveValue(raw);
    expect(await translated.evaluate((element, original) => element === original, draft)).toBe(true);
    await expect(page.getByText(messages.core.findings.reportAgent, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: messages.core.findings.adjustReport, exact: true }))
      .toHaveAttribute("title", messages.core.findings.reportChatTitle);
    expect(created).toEqual([{ agent_key: "reporter", title: `漏洞 #f-2 · ${raw}`, llm_profile_id: null }]);
  }
  await page.getByPlaceholder(en.core.findings.reportChatPlaceholder).press("Enter");
  await expect.poll(() => sent).toEqual({ message: `@[漏洞#f-2 ${raw}] ${raw}` });
  expect(errors).toEqual([]);
});

test("approval side questions translate their context hints and retain drafts and raw commands", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/intercept/history/90/side-questions?*", (route) => route.fulfill({
    json: { items: [], current: null, next_cursor: 0, snapshot: null },
  }));
  await page.goto("/system/intercept/approvals/");
  await page.getByRole("button", {
    name: zh.approval.row.toggleAria.replace("{id}", "90").replace("{action}", zh.approval.expand),
    exact: true,
  }).click();
  const details = page.getByRole("region", { name: zh.approval.detailAria.replace("{id}", "90"), exact: true });
  await details.getByRole("button", { name: zh.sideQuestion.button, exact: true }).click();
  await page.getByPlaceholder(zh.core.approvals.questionPlaceholder, { exact: true }).fill(raw);
  const draft = await page.getByPlaceholder(zh.core.approvals.questionPlaceholder).elementHandle();
  for (const locale of ["zh-CN", "en", "zh-CN"] as const) {
    const messages = locale === "en" ? en : zh;
    await selectLanguage(page, locale);
    const panel = page.getByRole("region", { name: messages.sideQuestion.panelLabel, exact: true });
    await expect(panel.getByText(messages.core.approvals.questionReadyHint, { exact: true })).toBeVisible();
    await expect(panel.getByText(messages.core.approvals.questionDescription, { exact: true })).toBeVisible();
    const input = panel.getByPlaceholder(messages.core.approvals.questionPlaceholder, { exact: true });
    await expect(input).toHaveValue(raw);
    expect(await input.evaluate((element, original) => element === original, draft)).toBe(true);
    await expect(panel.getByRole("button", { name: messages.sideQuestion.sendQuestion, exact: true })).toBeDisabled();
    const request = page.getByRole("region", {
      name: messages.core.approvals.toolRequest.replace("{agent}", messages.approval.agents.worker),
      exact: true,
    }).locator("pre");
    await expect(request).toBeVisible();
    expect(JSON.parse(await request.innerText())).toEqual({ command: "dd if=/dev/zero of=/tmp/x" });
  }
  expect(errors).toEqual([]);
});

test("detaching a finding member keeps its ID and stored reason across language changes", async ({ page }) => {
  const finding = await mockHandle<Finding>("GET", "/exploration/findings/f-2");
  let removal: { method: string; pathname: string; body: unknown } | undefined;
  await page.route("**/api/exploration/finding-cases/701", (route) => route.fulfill({
    json: {
      case: {
        id: "701", task_id: "t-acme-api", title: raw, reason: raw, severity: "high",
        severity_reason: raw, report: raw, version: 1, report_version: 1, active: true,
        count: 2, critical: 0, high: 2, medium: 0, low: 0, created_at: "2026-11-02T07:08:09Z",
      },
      events: [],
    },
  }));
  await page.route("**/api/exploration/finding-cases/701/members?*", (route) => route.fulfill({
    json: { items: [{ ...finding, finding_id: "f-2", name: raw }], total: 1, page: 1, page_size: 20 },
  }));
  await page.route("**/api/exploration/finding-cases/701/members/f-2", async (route) => {
    const request = route.request();
    removal = { method: request.method(), pathname: new URL(request.url()).pathname, body: request.postDataJSON() };
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/function/findings/case/?id=701");
  await page.getByRole("tab", {
    name: zh.core.cases.originalCount.replace("{count}", "2"), exact: true,
  }).click();
  await page.getByRole("checkbox", {
    name: zh.core.cases.selectReport.replace("{id}", "f-2"), exact: true,
  }).check();
  await selectLanguage(page, "en");
  await expect(page.getByRole("checkbox", {
    name: en.core.cases.selectReport.replace("{id}", "f-2"), exact: true,
  })).toBeChecked();
  await page.getByRole("button", {
    name: en.core.cases.removeSelectedCount.replace("{count}", "1"), exact: true,
  }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: en.core.cases.remove, exact: true }).click();
  await expect.poll(() => removal).toEqual({
    method: "DELETE",
    pathname: "/api/exploration/finding-cases/701/members/f-2",
    body: { reason: "人工撤销归并" },
  });
});
