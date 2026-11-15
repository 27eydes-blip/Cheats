// Runs the headless simulation suites inside the e2e lane so one command covers everything.
// The list comes from test/run-all.js, so a new test/*.test.js file is included automatically.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { suites } from '../../test/run-all.js';
for (const f of suites()) {
  test(`node test/${f}`, () => {
    // they do not touch a browser: run them once, not once per installed browser
    test.skip(test.info().project.name !== test.info().config.projects[0].name, 'already run in the first browser project');
    test.setTimeout(600_000); execFileSync(process.execPath, [`test/${f}`], { stdio: 'pipe', timeout: 590_000 }); });
}
