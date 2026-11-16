// E2E suite. Runs against `wrangler dev`. Browser projects are included only if that browser
// is installed. WebKit is the closest stand-in for iPhone Safari: `--project=webkit` runs it alone.
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const root = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const has = (name) => { try { return fs.readdirSync(root).some((d) => d.startsWith(name + '-')); } catch { return false; } };
const projects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
].filter((p) => has(p.name));
if (projects.length < 3) console.warn(`[e2e] browsers available: ${projects.map((p) => p.name).join(', ')} (others not installed — skipped)`);

// HUNT_PORT lets several checkouts run the suite side by side (each on its own port).
const PORT = Number(process.env.HUNT_PORT) || 8788;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 2,
  // CI only: one retry, so a test that passes on the retry is reported as "flaky" (listed in the
  // summary and annotated on the run) instead of hiding; a test that fails twice still fails the
  // job. Local runs never retry.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: { baseURL: BASE, trace: 'off' },
  projects,
  webServer: { command: `npx wrangler dev --port ${PORT} --ip 127.0.0.1`, url: BASE, reuseExistingServer: true, timeout: 60_000 },
});
