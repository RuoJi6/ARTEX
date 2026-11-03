import { expect, test } from "@playwright/test";

import { settings } from "../src/lib/mock/data";
import { mockHandle } from "../src/lib/mock/handler";

const screens = [
  "/dashboard/", "/chat/", "/function/assets/", "/function/commands/",
  "/function/findings/", "/function/findings/detail/?id=f-2",
  "/function/findings/case/?id=1", "/function/llm-records/",
  "/function/repeater/", "/function/schedules/", "/function/sync/",
  "/function/tasks/", "/function/tasks/detail/?id=t-acme-web", "/function/traffic/",
  "/function/workspace/", "/system/agents/", "/system/agents/detail/?key=mainagent",
  "/system/intercept/", "/system/intercept/approvals/", "/system/intercept/assets/",
  "/system/llm/", "/system/logs/", "/system/mcp/", "/system/notify/",
  "/system/settings/", "/system/skills/", "/system/tools/",
];

for (const screen of screens) {
  test(`English screen renders without missing messages: ${screen}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR|IntlError/.test(message.text())) {
        errors.push(message.text());
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
      else if (url.pathname === "/api/settings") json = { ...settings, show_egress_ip: false };
      else if (url.pathname === "/api/health") json = { ok: true, version: "fixture" };
      else if (url.pathname === "/api/notify/meta") json = {
        kinds: [{ kind: "webhook", default_rate_per_min: 60, secret_keys: [] }],
        enabled: true, public_base_url: "", digest_interval_min: "5",
        defaults: { digest_interval_min: 5 },
        stats: { channels: 0, channels_on: 0, pending: 0, failed: 0, sent_today: 0, backlog_age_ms: 0 },
      };
      else if (url.pathname === "/api/notify/channels") json = { channels: [] };
      else if (url.pathname === "/api/notify/deliveries") json = { deliveries: [], total: 0 };
      else if (url.pathname === "/api/exploration/finding-cases/1") json = {
        case: {
          id: "1", task_id: "t-acme-web", title: "Fixture case", reason: "Original reason",
          severity: "high", severity_reason: "Original evidence", report: "Original report",
          active: true, version: 1, report_version: 1, count: 2,
          critical: 0, high: 2, medium: 0, low: 0, created_at: "2026-11-01T07:08:09Z",
        },
        events: [],
      };
      else json = await mockHandle(request.method(), url.pathname.slice(4) + url.search, request.postData());
      await route.fulfill({ json });
    });
    await page.goto(screen);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("combobox", { name: "Interface language", exact: true })).toHaveValue("en");
    await expect(page.getByRole("main").first()).toBeVisible();
    await expect(page.getByText(/Loading[.…]/).first()).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
