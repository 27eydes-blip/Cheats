// E2E suite. Runs against `wrangler dev`. Browser projects are included only if that browser
// is installed (this CI box ships Chromium only; Firefox/WebKit run wherever they're installed).
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

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8788', trace: 'off' },
  projects,
  webServer: { command: 'npx wrangler dev --port 8788 --ip 127.0.0.1', url: 'http://127.0.0.1:8788', reuseExistingServer: true, timeout: 60_000 },
});
