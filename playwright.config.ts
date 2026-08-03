import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Golden-path browser coverage only (MR-1 scope) — not a full UI regression
// suite. Runs against a real Next.js server (production build in CI, via
// webServer below) and a real Postgres instance, same as the app itself;
// no mocking of routes or the database.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Pinned to the sandbox's pre-installed Chromium build when present
        // (avoids a headless-shell revision mismatch); CI/production
        // environments without this path fall back to Playwright's own
        // resolution.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
