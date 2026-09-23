import { defineConfig } from "@playwright/test";

/**
 * Spec §9 smoke set. Runs against a built site with real data: `pnpm build && pnpm test:e2e` starts
 * `next start` on the dev database and index, or set E2E_BASE_URL to test a deployed instance
 * (self-signed certificates are accepted for the local production rehearsal).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  // A deployed single-core server with a cold Meilisearch can take several seconds per page, past
  // the default 5 s assertion window.
  expect: { timeout: process.env.E2E_BASE_URL ? 15_000 : 5_000 },
  retries: 0,
  reporter: "list",
  use: { baseURL, ignoreHTTPSErrors: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: "http://localhost:3000/", reuseExistingServer: true, timeout: 60_000 },
});
