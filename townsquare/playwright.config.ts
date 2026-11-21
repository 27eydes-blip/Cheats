import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression: screenshots of the main pages on a phone and a desktop,
 * in light and dark, compared against committed baselines.
 *   npm run test:visual          compare
 *   npm run test:visual:update   accept new baselines
 * Uses its own freshly seeded database so results don't depend on your data.
 */
const PORT = 3005;
export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" } },
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "phone-light", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", colorScheme: "dark" } },
    { name: "desktop-light", use: { viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
  ],
  webServer: {
    command: `rm -rf data/visual && DATABASE_PATH=data/visual/app.db UPLOAD_DIR=data/visual/uploads npx tsx scripts/seed.ts && NEWS_DEMO=1 NEWS_INGEST=off DATABASE_PATH=data/visual/app.db UPLOAD_DIR=data/visual/uploads npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
