// Runs the headless simulation suites inside the e2e lane so one command covers everything.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
for (const f of ['test/sim.test.js', 'test/mirage.test.js', 'test/brawlers.test.js', 'test/squad.test.js', 'test/progression.test.js', 'test/cosmetics.test.js']) {
  test(`node ${f}`, () => { execFileSync(process.execPath, [f], { stdio: 'pipe', timeout: 120_000 }); });
}
