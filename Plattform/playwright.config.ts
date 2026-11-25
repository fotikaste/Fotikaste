import { defineConfig, devices } from "@playwright/test";

// Testet die gebaute Seite so, wie Cloudflare sie ausliefert (wrangler dev, lokal, offline).
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8788" },
  webServer: {
    command: "npx wrangler dev --port 8788 --ip 127.0.0.1",
    url: "http://127.0.0.1:8788/",
    reuseExistingServer: true,
    env: { WRANGLER_SEND_METRICS: "false" },
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "handy", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
});
