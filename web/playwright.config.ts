import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4190",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/serve-static.mjs",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
  },
});
