import { expect, type Page, test } from "@playwright/test";

import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { agents, interceptRules, settings } from "../src/lib/mock/data";
import { mockHandle } from "../src/lib/mock/handler";
import type { Agent, FindingTraffic } from "../src/lib/types";

declare global {
  interface Window {
    __i18nStreams: EventSource[];
    __i18nDraft: Element | null;
  }
}

const raw = "\u539f\u6587 {value} <payload>";
const model = { model: "fixture", name: "fixture", format: "openai", profile_id: 1 };
const item = {
  id: "i18n-side",
  ordinal: 1,
  client_request_id: "fixture",
  question: raw,
  answer: "",
  status: "running",
  model,
  sequence: 1,
  snapshot_at: "2026-10-30T07:08:09Z",
  created_at: "2026-10-30T07:08:09Z",
};
const sideHistory = {
  items: [item],
  current: item,
  next_cursor: 0,
  snapshot: { captured_at: item.snapshot_at, model, available: true, reason: "" },
};
const sideURL = "**/api/conversations/1/side-questions?*";
const language = (page: Page) => page.getByRole("combobox", { name: /^(Interface language|界面语言)$/, includeHidden: true });
let runtimeErrors: string[];

async function selectLanguage(page: Page, locale: "en" | "zh-CN") {
  await language(page).selectOption(locale, { force: true });
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

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
    window.__i18nStreams = [];
    class FixtureEventSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      onopen?: () => void;
      constructor(public url: string) {
        super();
        window.__i18nStreams.push(this as unknown as EventSource);
        setTimeout(() => this.onopen?.(), 0);
      }
      close() {
        this.readyState = 2;
      }
    }
    window.EventSource = FixtureEventSource as unknown as typeof EventSource;
  });
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

test.afterEach(() => expect(runtimeErrors).toEqual([]));

test("current seeded Agent labels translate in chat and resource bindings", async ({ page }) => {
  const seeded: Agent[] = Object.entries(zh.builtinAgents).map(([key, labels], index) => ({
    ...agents[0], id: String(index + 1), key, name: labels.name, description: labels.description,
    builtin: key !== "retester" && key !== "reporter", role: "assistant",
  }));
  const custom = { ...agents[0], id: "99", key: "custom-review", name: raw, description: raw, builtin: false };
  await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: [...seeded, custom] } }));

  await page.goto("/chat/?c=1");
  await selectLanguage(page, "en");
  await expect(page.getByText(en.builtinAgents.mainagent.description, { exact: true })).toBeVisible();
  const pinned = page.getByRole("button", { name: /^Pinned acme/ });
  await expect(pinned).toContainText(en.builtinAgents.mainagent.name);
  await expect(pinned).not.toContainText(zh.builtinAgents.mainagent.name);

  await page.goto("/system/mcp/");
  await expect(page.getByRole("checkbox", { name: en.builtinAgents.asset_mapper.name, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: raw, exact: true }).first()).toBeVisible();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("checkbox", { name: zh.builtinAgents.asset_mapper.name, exact: true }).first()).toBeVisible();
  await selectLanguage(page, "en");

  await page.goto("/system/tools/");
  await page.getByRole("button", { name: /^bash System/ }).click();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: `${en.builtinAgents.mainagent.name} mainagent`, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: `${raw} custom-review`, exact: true })).toBeVisible();

  await page.goto("/system/skills/");
  await page.getByRole("button", { name: en.skillsPage.newSkill, exact: true }).click();
  await page.getByRole("dialog").getByRole("tab", { name: en.skillsPage.tabVisibility, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: en.builtinAgents.asset_mapper.name, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: raw, exact: true })).toBeVisible();

  const renamed = seeded.map((agent) => agent.key === "asset_mapper" ? { ...agent, name: raw, description: raw } : agent);
  await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: renamed } }));
  await page.goto("/system/agents/");
  await expect(page.getByRole("button").filter({ hasText: "asset_mapper" })).toContainText(raw);
  await expect(page.getByText(en.builtinAgents.asset_mapper.description, { exact: true })).toHaveCount(0);
});

test("unlinked asset groups translate without changing filters or asset names", async ({ page }) => {
  await page.goto("/function/findings/");
  await selectLanguage(page, "en");
  await page.getByRole("tab", { name: en.findings.view.asset, exact: true }).click();
  const group = page.getByRole("button", { name: en.findings.assetTree.unlinked, exact: true });
  await expect(group).toBeVisible();
  const request = page.waitForRequest((r) => new URL(r.url()).searchParams.get("asset_scope") === "__none__");
  await group.click();
  await request;
  await expect(page.getByRole("button", { name: en.findings.assetTree.unlinked, exact: true })).toHaveCount(2);
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("button", { name: zh.findings.assetTree.unlinked, exact: true })).toHaveCount(2);
  await selectLanguage(page, "en");
  await page.getByPlaceholder(en.findings.assetTree.filterPlaceholder).fill("Unlinked");
  await expect(page.getByRole("button", { name: en.findings.assetTree.unlinked, exact: true })).toHaveCount(2);
  await page.getByPlaceholder(en.findings.assetTree.filterPlaceholder).fill("");
  await expect(page.getByRole("button", { name: "Acme Corp", exact: true })).toBeVisible();
});

test("new task schedule defaults follow locale while edited names and timezone stay fixed", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: { id: "created-fixture" } });
    } else {
      await route.fulfill({ json: await mockHandle("GET", "/tasks") });
    }
  });
  await page.goto("/function/tasks/");
  await selectLanguage(page, "en");
  await page.getByRole("button", { name: en.tasksCreate.createTitle, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: en.tasksCreate.scheduleEnable }).check();
  await expect(dialog.locator("#task-schedule-name")).toHaveValue(en.tasksCreate.defaultScheduleName);
  await page.locator("select").filter({ has: page.locator('option[value="en"]') }).selectOption("zh-CN", { force: true });
  await expect(dialog.locator("#task-schedule-name")).toHaveValue(zh.tasksCreate.defaultScheduleName);
  await dialog.locator("#task-schedule-name").fill(raw);
  await page.locator("select").filter({ has: page.locator('option[value="en"]') }).selectOption("en", { force: true });
  await expect(dialog.locator("#task-schedule-name")).toHaveValue(raw);
  await dialog.getByRole("textbox", { name: en.tasksCreate.description, exact: true }).fill("fixture description");
  await dialog.getByRole("textbox", { name: en.tasksCreate.goal, exact: true }).fill("fixture goal");
  await dialog.getByRole("button", { name: en.tasksCreate.create, exact: true }).click();
  await expect.poll(() => submitted).toBeDefined();
  expect(submitted?.schedule).toMatchObject({ name: raw, timezone_mode: "beijing", start_time: "18:00", weekdays: [6, 7] });
});

test("bundled rule labels translate while editable rules and messages remain verbatim", async ({ page }) => {
  const rule = { ...interceptRules[0], id: 801, name: zh.builtinRules.names.recursiveDelete, action: "deny", message: raw };
  await page.route("**/api/intercept/rules", (route) => route.fulfill({ json: { rules: [rule] } }));
  await page.goto("/system/intercept/");
  await selectLanguage(page, "en");
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: en.builtinRules.names.recursiveDelete, exact: true }) }).getByRole("button").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByPlaceholder(en.interceptPage.editor.namePlaceholder)).toHaveValue(rule.name);
  await expect(dialog.getByPlaceholder(en.interceptPage.editor.denyMessagePlaceholder)).toHaveValue(raw);

  await page.route("**/api/asset-intercept/rules", (route) => route.fulfill({ json: { rules: [
    { id: 1, enabled: true, kind: "fuzzy_domain", pattern: ".gov", note: zh.builtinRules.assetNotes.government, builtin: true },
    { id: 2, enabled: true, kind: "exact_domain", pattern: "example.test", note: raw, builtin: false },
  ] } }));
  await page.goto("/system/intercept/assets/");
  await expect(page.getByText(en.builtinRules.assetNotes.government, { exact: true })).toBeVisible();
  await expect(page.getByText(raw, { exact: true })).toBeVisible();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByText(zh.builtinRules.assetNotes.government, { exact: true })).toBeVisible();
});

test("Chinese default and explicit language preference survive reloads", async ({ page }) => {
  await page.goto("/chat/");
  await expect(language(page)).toHaveValue("zh-CN");
  await expect(page).toHaveTitle(zh.metadata.title);
  await selectLanguage(page, "en");
  await page.reload();
  await expect(language(page)).toHaveValue("en");
  await expect(page).toHaveTitle(en.metadata.title);
  await selectLanguage(page, "zh-CN");
  await page.reload();
  await expect(language(page)).toHaveValue("zh-CN");
  await expect(page).toHaveTitle(zh.metadata.title);
});

test("side-question errors translate without replacing drafts, raw data or streams", async ({ page }) => {
  await page.route(sideURL, (route) => route.fulfill({ json: sideHistory }));
  await page.goto("/chat/?c=1");
  await selectLanguage(page, "en");
  await page.getByRole("button", { name: en.sideQuestion.button, exact: true }).click();
  const panel = page.getByRole("region", { name: en.sideQuestion.panelLabel });
  const draft = panel.getByRole("textbox");
  await draft.fill(raw);
  await draft.evaluate((element) => {
    window.__i18nDraft = element;
  });
  await expect(panel.getByRole("article").getByText(raw, { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__i18nStreams.some((s) => s.url.includes("/side-questions/i18n-side/events"))),
    )
    .toBe(true);
  const streams = await page.evaluate(() => window.__i18nStreams.length);
  await page.evaluate(() => {
    const stream = window.__i18nStreams.find((s) => s.url.includes("/side-questions/i18n-side/events"));
    stream?.dispatchEvent(new MessageEvent("snapshot", { data: "invalid-json" }));
  });
  await expect(page.getByText(en.sideQuestion.parseError, { exact: true })).toBeVisible();
  for (const locale of ["zh-CN", "en"] as const) {
    await selectLanguage(page, locale);
    const messages = locale === "en" ? en : zh;
    await expect(page.getByText(messages.sideQuestion.parseError, { exact: true })).toBeVisible();
    const input = page.getByRole("textbox", { name: messages.sideQuestion.questionAria, exact: true });
    await expect(input).toHaveValue(raw);
    expect(await input.evaluate((element) => element === window.__i18nDraft)).toBe(true);
    expect(await page.evaluate(() => window.__i18nStreams.length)).toBe(streams);
  }
  await page.evaluate(
    (answer) => {
      const stream = window.__i18nStreams.find((s) => s.url.includes("/side-questions/i18n-side/events"));
      if (!stream || stream.readyState !== EventSource.OPEN) throw new Error("Stream was closed by locale change");
      stream.dispatchEvent(new MessageEvent("snapshot", { data: JSON.stringify(answer) }));
    },
    { ...item, sequence: 2, answer: "Stream still delivers", status: "completed" },
  );
  await expect(page.getByText("Stream still delivers", { exact: true })).toBeVisible();

  // Even identical backend wording must remain raw, not matched against local errors.
  await page.route(sideURL, (route) => route.fulfill({ status: 503, json: { error: zh.sideQuestion.parseError } }));
  await page.reload();
  await expect(language(page)).toHaveValue("en");
  await page.getByRole("button", { name: en.sideQuestion.button, exact: true }).click();
  await expect(page.getByText(zh.sideQuestion.parseError, { exact: true })).toBeVisible();
});

test("traffic evidence and picker retain time of day in both languages", async ({ page }) => {
  await page.route("**/api/exploration/findings/f-2/traffic", async (route) => {
    const data = await mockHandle<FindingTraffic>("GET", "/exploration/findings/f-2/traffic");
    const json = structuredClone(data);
    json.bindings.forEach((binding, index) => {
      binding.snapshot.captured_at = Date.parse(`2026-10-30T07:08:0${index + 1}Z`) / 1000;
      binding.note = `${raw} ${index}`;
    });
    await route.fulfill({ json });
  });
  await page.route("**/api/traffic?*", async (route) => {
    await route.fulfill({
      json: {
        total: 2,
        exchanges: [1, 2].map((n) => ({
          id: `i18n-${n}`,
          method: "GET",
          url: `https://example.test/${n}`,
          status: 200,
          ts: `2026-10-30T07:08:0${n}Z`,
        })),
      },
    });
  });
  await page.goto("/function/findings/detail/?id=f-2");
  for (const locale of ["zh-CN", "en"] as const) {
    await selectLanguage(page, locale);
    const messages = locale === "en" ? en : zh;
    await expect(page.getByText(`${raw} 0`, { exact: true })).toBeVisible();
    await expect(page.getByText(/14:08:01/).first()).toBeVisible();
    await expect(page.getByText(/14:08:02/).first()).toBeVisible();
    await page.getByRole("button", { name: messages.settings.intelligence.binding, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/14:08:01/)).toBeVisible();
    await expect(dialog.getByText(/14:08:02/)).toBeVisible();
    await dialog.getByRole("button", { name: messages.trafficEvidence.picker.cancel, exact: true }).click();
  }
});

test("Repeater retains drafts and DOM while validation follows the sending locale", async ({ page }) => {
  await page.goto("/function/repeater/");
  await expect(page.getByRole("heading", { name: zh.repeater.title, exact: true })).toBeVisible();
  const request = page.getByRole("textbox", { name: zh.repeater.request, exact: true });
  await request.fill("GET /path HTTP/1.1");
  await request.evaluate((element) => {
    window.__i18nDraft = element;
  });
  await selectLanguage(page, "en");
  await expect(page.getByRole("heading", { name: en.repeater.title, exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: en.repeater.request, exact: true })).toHaveText("GET /path HTTP/1.1");
  expect(await page.getByRole("textbox", { name: en.repeater.request, exact: true }).evaluate((element) => element === window.__i18nDraft)).toBe(true);
  await page.getByRole("button", { name: en.repeater.send, exact: true }).click();
  await expect(page.getByText(en.repeater.errors.host, { exact: true })).toBeVisible();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("textbox", { name: zh.repeater.request, exact: true })).toHaveText("GET /path HTTP/1.1");
  await page.getByRole("button", { name: zh.repeater.send, exact: true }).click();
  await expect(page.getByText(zh.repeater.errors.host, { exact: true })).toBeVisible();
});

test("Repeater preserves raw HTTP, history, and storage warnings in English", async ({ page }) => {
  const payload = `POST /raw HTTP/1.1\nHost: example.test\nContent-Type: text/plain\n\n${raw}`;
  const response = {
    status: 200,
    status_text: "200 OK",
    proto: "HTTP/1.1",
    headers: {},
    body: raw,
    body_bytes: 12345,
    body_truncated: false,
    elapsed_ms: 12,
    url: "https://example.test/raw",
    error: zh.repeater.errors.host,
  };
  await page.route("**/api/repeater/send", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      method: "POST",
      http_version: "HTTP/1.1",
      url: response.url,
      headers: { Host: "example.test", "Content-Type": "text/plain" },
      body: raw,
      use_recording_proxy: true,
      insecure_skip_verify: false,
    });
    await route.fulfill({ json: response });
  });
  await page.goto("/function/repeater/");
  await selectLanguage(page, "en");
  await page.getByRole("textbox", { name: en.repeater.request, exact: true }).fill(payload);
  await page.getByRole("button", { name: en.repeater.send, exact: true }).click();
  await page.getByRole("textbox", { name: en.repeater.responsePane, exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await page.getByRole("textbox", { name: en.repeater.responsePane, exact: true }).locator(".cm-line").allTextContents()).join("\n")).toBe(`HTTP/1.1 200 OK\n\n\n${raw}`);
  await expect(page.getByText("12,345 bytes", { exact: true })).toBeVisible();
  await expect(page.getByText(zh.repeater.errors.host, { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await page.getByRole("textbox", { name: en.repeater.request, exact: true }).locator(".cm-line").allTextContents()).join("\n")).toBe(payload);
  await page.getByRole("button", { name: en.repeater.library, exact: true }).click();
  const library = page.getByRole("dialog");
  await expect(library.getByRole("heading", { name: en.repeater.history })).toBeVisible();
  await expect(library.locator("time")).toHaveCount(1);
  await library.getByRole("textbox", { name: en.repeater.searchAria }).fill("no-matching-request");
  await expect(library.getByText(en.repeater.noMatches)).toBeVisible();
  await page.keyboard.press("Escape");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "artex_repeater_workspace_v1") throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("textbox", { name: en.repeater.request, exact: true }).fill(`${payload}\nunsaved`);
  await expect(page.getByText(en.repeater.storageError, { exact: true })).toBeVisible();
});

test("Schedules retain drafts, wall dates, timezone and timeline across languages", async ({ page }) => {
  const schedule = {
    id: 901, name: raw, enabled: true, timezone_mode: "beijing", timezone: "Asia/Shanghai",
    schedule_type: "once", run_date: "2026-11-01", end_date: "2026-11-02", weekdays: [],
    start_time: "23:00:00", end_time: "01:30:00", start_immediately: false, task_ids: [1],
    status: "waiting", run_count: 1234, next_start: "2026-11-01T15:00:00Z",
    last_error: "run_date " + raw,
    history: [{ id: 1, action: "running", success: true, task_id: 1, message: raw, created_at: "2026-10-30T07:08:09Z" }],
  };
  let loads = 0;
  let saved: unknown;
  await page.route("**/api/schedules**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      saved = request.postDataJSON();
      await route.fulfill({ json: schedule });
    } else {
      loads++;
      await route.fulfill({ json: new URL(request.url()).pathname.endsWith("/901") ? schedule : { schedules: [schedule] } });
    }
  });
  await page.goto("/function/schedules/");
  await expect(page.getByRole("heading", { name: zh.schedules.title })).toBeVisible();
  await expect(page.getByText(zh.schedules.nextAt.replace("{time}", ""), { exact: false })).toContainText("23:00");
  await selectLanguage(page, "en");
  const row = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: `Select schedule ${raw}` }) });
  await expect(row).toContainText("November 1, 2026");
  await expect(row).toContainText("23:00");
  await expect(row).toContainText("1,234");
  await expect(row.getByText(en.schedules.nextAt.replace("{time}", ""), { exact: false })).toContainText("23:00");
  await expect(row).toContainText(schedule.last_error);
  await row.getByRole("button", { name: en.schedules.view, exact: true }).click();
  await expect(page.getByText(en.schedules.timelineTitle, { exact: true })).toBeVisible();
  await expect(page.getByText("14:08:09", { exact: false })).toBeVisible();
  await row.getByRole("button", { name: en.schedules.edit, exact: true }).click();
  const input = page.getByPlaceholder(en.schedules.namePlaceholder);
  await input.fill(raw + " draft");
  await input.evaluate((element) => { window.__i18nDraft = element; });
  const before = loads;
  await selectLanguage(page, "zh-CN");
  await expect(page.getByPlaceholder(zh.schedules.namePlaceholder)).toHaveValue(raw + " draft");
  await expect(page.getByText(zh.schedules.timelineTitle, { exact: true })).toBeVisible();
  await selectLanguage(page, "en");
  expect(await input.evaluate((element) => element === window.__i18nDraft)).toBe(true);
  expect(loads).toBe(before);
  await page.getByRole("button", { name: en.schedules.save, exact: true }).click();
  await expect.poll(() => saved).toEqual({
    name: raw + " draft", enabled: true, timezone_mode: "beijing", schedule_type: "once",
    run_date: "2026-11-01", end_date: "2026-11-02", weekdays: [], start_time: "23:00",
    end_time: "01:30", start_immediately: false, task_ids: [1],
  });
  await page.getByRole("button", { name: en.schedules.new, exact: true }).click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Schedule timezone selection follows upstream independently of language", async ({ page }) => {
  const schedules = ["UTC", "Local"].map((timezone, index) => ({
    id: 902 + index, name: timezone, enabled: true, timezone_mode: "system", timezone,
    schedule_type: "once", run_date: "2026-11-01", weekdays: [],
    start_time: "15:00:00", end_time: "", task_ids: [], status: "waiting", run_count: 0,
    next_start: "2026-11-01T15:00:00Z",
  }));
  const methods: string[] = [];
  await page.route("**/api/schedules**", async (route) => {
    methods.push(route.request().method());
    await route.fulfill({ json: { schedules } });
  });
  await page.goto("/function/schedules/");
  for (const locale of ["zh-CN", "en", "zh-CN"] as const) {
    await selectLanguage(page, locale);
    const messages = locale === "en" ? en : zh;
    for (const [name, hour] of [["UTC", "15:00"], ["Local", "22:00"]]) {
      const row = page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
      await expect(row.getByText(messages.schedules.nextAt.replace("{time}", ""), { exact: false })).toContainText(hour);
    }
  }
  expect(methods).toEqual(["GET"]);
});

test("Upload and download errors localize their prefix and preserve raw backend details", async ({ page }) => {
  const file = { name: "sample.txt", mimeType: "text/plain", buffer: Buffer.from(raw) };
  await page.route("**/api/workspace/list?*", (route) => route.fulfill({ json: {
    path: "", entries: [{ name: file.name, path: file.name, dir: false, size: 1, mtime: 0 }],
  } }));
  await page.route("**/api/workspace/upload?*", (route) => route.fulfill({ status: 503, body: "" }));
  await page.route("**/api/workspace/download?*", (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto("/function/workspace/");
  for (const locale of ["en", "zh-CN"] as const) {
    await selectLanguage(page, locale);
    const messages = locale === "en" ? en : zh;
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(messages.workspace.uploadFailed.replace("{msg}", "HTTP 503"), { exact: true })).toBeVisible();
    await page.getByTitle(messages.workspace.download, { exact: true }).click();
    await expect(page.getByText(messages.workspace.downloadFailed.replace("{msg}", "HTTP 503"), { exact: true })).toBeVisible();
  }
  await page.route("**/api/chat/upload?*", (route) => route.fulfill({ status: 503, body: raw }));
  await page.goto("/chat/?c=1");
  for (const locale of ["en", "zh-CN"] as const) {
    await selectLanguage(page, locale);
    const messages = locale === "en" ? en : zh;
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(messages.chat.toast.uploadFailed.replace("{msg}", `HTTP 503 ${raw}`), { exact: true })).toBeVisible();
  }
});

test("Asset Sync preserves selection and configuration without locale-triggered reloads", async ({ page }) => {
  let loads = 0;
  let failStatus = false;
  let submitted: unknown;
  await page.route("**/api/sync/scopesentry/**", async (route) => {
    const url = new URL(route.request().url());
    if (failStatus && url.pathname.endsWith("/status")) {
      await route.fulfill({ status: 503, json: { error: raw } });
      return;
    }
    if (url.pathname.endsWith("/sync")) {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: { synced: { subdomain: 1234, unknown_kind: 2 }, companies: [raw], warnings: [raw], errors: [] } });
      return;
    }
    loads++;
    await route.fulfill({ json: url.pathname.endsWith("/status")
      ? { exists: true, configured: true, enabled: true, reachable: true, url: "https://fixture.invalid/mcp", tools: ["raw-tool"] }
      : { projects: [{ id: "p1", name: raw, tag: raw, AssetCount: 1234 }] } });
  });
  await page.goto("/function/sync/");
  await selectLanguage(page, "en");
  const row = page.getByRole("row").filter({ has: page.getByText(raw, { exact: true }).first() });
  await row.getByRole("checkbox").check();
  await page.getByPlaceholder(en.assetSync.mcpUrlPlaceholder).fill("https://fixture.invalid/draft");
  await page.getByPlaceholder("ssk_...").fill("draft-only");
  const before = loads;
  await selectLanguage(page, "zh-CN");
  await expect(page.getByPlaceholder(zh.assetSync.mcpUrlPlaceholder)).toHaveValue("https://fixture.invalid/draft");
  await expect(row.getByRole("checkbox")).toBeChecked();
  await selectLanguage(page, "en");
  await expect(page.getByPlaceholder("ssk_...")).toHaveValue("draft-only");
  expect(loads).toBe(before);
  await page.getByRole("button", { name: en.assetSync.syncSelected, exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({ dimension: "project", targets: ["p1"], asset_types: ["subdomain", "service", "app"], create_company: true });
  await expect(page.getByText("Subdomain: 1,234", { exact: true })).toBeVisible();
  await expect(page.getByText("unknown_kind: 2", { exact: true })).toBeVisible();
  failStatus = true;
  await page.getByRole("button", { name: en.assetSync.refresh, exact: true }).click();
  await expect(page.getByText(en.assetSync.statusLoadFailed.replace("{msg}", raw), { exact: true })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Finding duplicate decisions keep raw evidence and selection through locale changes", async ({ page }) => {
  const suggestion = { id: "s1", task_id: "1", left_id: "1", right_id: "2", finding_ids: ["1", "2", "3"], title: raw, reason: raw, state: "pending" };
  let visible = true;
  let decision: unknown;
  await page.route("**/api/exploration/finding-case-suggestions**", async (route) => {
    if (route.request().method() === "POST") {
      decision = route.request().postDataJSON();
      visible = false;
      return route.fulfill({ json: { case_id: "901" } });
    }
    await route.fulfill({ json: visible ? [suggestion] : [] });
  });
  await page.goto("/function/findings/");
  await selectLanguage(page, "en");
  const checkbox = page.getByRole("checkbox", { name: en.core.cases.includeReport.replace("{id}", "3"), exact: true });
  await checkbox.uncheck();
  await page.getByRole("button", { name: en.core.cases.showReason, exact: true }).click();
  await selectLanguage(page, "zh-CN");
  await expect(page.getByRole("checkbox", { name: zh.core.cases.includeReport.replace("{id}", "3"), exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: zh.core.cases.hideReason, exact: true })).toBeVisible();
  await selectLanguage(page, "en");
  await page.getByRole("button", { name: en.core.cases.confirmSelected.replace("{count}", "2"), exact: true }).click();
  await expect.poll(() => decision).toEqual({ accept: true, exclude_ids: ["3"] });
  visible = true;
  await page.reload();
  await page.getByRole("button", { name: en.core.cases.rejectGroup, exact: true }).click();
  await expect.poll(() => decision).toEqual({ accept: false });
});
