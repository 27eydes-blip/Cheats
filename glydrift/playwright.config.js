// Automated cross-device / cross-browser tests. `npm run test:all` builds the game and runs
// everything; GitHub Actions runs the same on every push and pull request.
import { existsSync } from "node:fs";
import { chromium, defineConfig, firefox, webkit } from "@playwright/test";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// iPadOS Safari asks for desktop sites (a Mac user agent) but has a touch screen
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/** The seven device profiles every test runs on. */
export const PROFILES = {
  "iphone-small": {
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    touch: true,
    ua: IPHONE_UA,
  },
  "iphone-std": {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    touch: true,
    ua: IPHONE_UA,
  },
  "iphone-large": {
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    touch: true,
    ua: IPHONE_UA,
  },
  "ipad-portrait": {
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    touch: true,
    ua: IPAD_UA,
  },
  "ipad-landscape": {
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    touch: true,
    ua: IPAD_UA,
  },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, touch: false },
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, touch: false },
};

const ENGINES = { chromium, firefox, webkit };
const CI = !!process.env.CI;
// Locally a browser engine that isn't installed is skipped with a warning (CI always runs all 3)
const engines = Object.keys(ENGINES).filter((name) => {
  if (CI) return true;
  let ok = false;
  try {
    ok = existsSync(ENGINES[name].executablePath());
  } catch {}
  if (!ok)
    console.warn(`[glydrift tests] ${name} is not installed here — skipping it (CI runs it)`);
  return ok;
});
const only = process.env.ENGINES?.split(",");

const projects = [];
for (const engine of engines) {
  if (only && !only.includes(engine)) continue;
  for (const [name, p] of Object.entries(PROFILES)) {
    projects.push({
      name: `${engine}-${name}`,
      use: {
        browserName: engine,
        viewport: p.viewport,
        deviceScaleFactor: p.deviceScaleFactor,
        hasTouch: p.touch,
        // Firefox can't emulate a mobile viewport; everything else about the profile still applies
        isMobile: p.touch && engine !== "firefox" && name.startsWith("iphone"),
        userAgent: p.ua,
        // Headless Firefox has no WebGL on Linux: CI runs it headed inside a virtual display
        // (xvfb-run, FIREFOX_HEADED=1), where Mesa provides software WebGL.
        headless: !(engine === "firefox" && process.env.FIREFOX_HEADED),
        launchOptions:
          engine === "firefox" ? { firefoxUserPrefs: { "webgl.force-enabled": true } } : {},
      },
      metadata: { profile: name, engine },
    });
  }
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    // screenshot comparisons: small anti-aliasing differences are fine, real changes are not
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.25, animations: "disabled" },
  },
  fullyParallel: true,
  workers: CI ? 2 : undefined,
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["list"], ["html", { open: "never" }], ["./tests/summary-reporter.mjs"]]
    : [["list"], ["./tests/summary-reporter.mjs"]],
  // baselines live next to the tests, one per project
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: {
    baseURL: "http://localhost:4317",
    timezoneId: "UTC",
    locale: "en-US",
    trace: CI ? "off" : "retain-on-failure", // CI artifacts stay small
  },
  projects,
  webServer: [
    {
      command: "node tests/serve.mjs dist-test 4317",
      url: "http://localhost:4317",
      reuseExistingServer: !CI,
    },
    {
      command: "node tests/serve.mjs dist 4318",
      url: "http://localhost:4318",
      reuseExistingServer: !CI,
    },
  ],
});
