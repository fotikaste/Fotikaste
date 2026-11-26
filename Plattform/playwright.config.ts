import { defineConfig, devices } from "@playwright/test";

// Testet die gebaute Seite so, wie Cloudflare sie ausliefert (wrangler dev, lokal, offline).
// PW_PORT=8792 startet einen eigenen Server (z. B. wenn auf 8788 schon ein älterer «npm run dev:worker» läuft).
const PORT = process.env.PW_PORT ?? "8788";
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  reporter: [["list"]],
  globalSetup: "./tests/e2e/vorbereitung.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "de-CH", timezoneId: "Europe/Zurich" },
  webServer: {
    command: `npm run db:lokal && npx wrangler dev --port ${PORT} --ip 127.0.0.1 --var ENVIRONMENT:development --var DEV_ADMIN_EMAIL:inhaber@example.ch`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    env: { WRANGLER_SEND_METRICS: "false" },
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "handy", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
});
