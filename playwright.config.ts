import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL, E2E_PORT, e2eServerEnv } from "./e2e/support/env";

const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests against a production build (`next start`), not the dev server: that is
 * what users get, and it avoids dev-only compile delays making tests flaky.
 *
 * Run `npm run build` first, then `npm run e2e`. See "End-to-end tests and accessibility" in
 * the README.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [["github"], ["html", { outputFolder: "e2e/.report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Fixed so date formatting in assertions doesn't depend on the runner's locale.
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh database every run, then the production server on its own port and database so
    // it never touches dev.db or a running dev server.
    command: `npm run e2e:prepare && npx next start --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    env: e2eServerEnv,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
  },
});
