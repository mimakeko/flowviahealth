import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.FLOWVIA_BROWSER_SMOKE_BASE_URL || "http://localhost:3000";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  testDir: "./tests/e2e",
  timeout: 90_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    reuseExistingServer: true,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
