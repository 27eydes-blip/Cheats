// Runs the headless simulation suites inside the e2e lane so one command covers everything.
// The list comes from test/run-all.js, so a new test/*.test.js file is included automatically.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { suites } from '../../test/run-all.js';
for (const f of suites()) {
  test(`node test/${f}`, () => { test.setTimeout(600_000); execFileSync(process.execPath, [`test/${f}`], { stdio: 'pipe', timeout: 590_000 }); });
}
