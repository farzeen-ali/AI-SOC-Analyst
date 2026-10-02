import { defineConfig, devices } from "@playwright/test";

import { loadEnvLocal } from "./e2e/support/env";

/**
 * Playwright configuration.
 *
 * Tests run against a **production build** rather than `next dev`. Dev
 * compiles each route on first request, which turns a cold navigation into a
 * multi-second wait and makes timeouts look like product bugs. A built server
 * also exercises the real security headers, the real caching rules and the
 * real React build — all three differ in dev, and all three are things this
 * suite asserts on.
 */

loadEnvLocal();

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Screenshots are the deliverable here, so a flake that silently passes on
  // retry would hide a real problem. Retry once in CI only.
  retries: process.env.CI ? 1 : 0,
  // Tenant state (seats, quota, invitations) is shared per workspace, so
  // parallel workers would race each other. Correctness over speed.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  outputDir: "test-results/artifacts",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    testIdAttribute: "data-testid",
  },

  projects: [
    // Seeds the test tenants and writes a storage state per role. Everything
    // else depends on this, so a seeding failure fails fast and loudly.
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
