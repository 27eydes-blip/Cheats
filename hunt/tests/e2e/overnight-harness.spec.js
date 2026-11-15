// The test harness itself: the shared error tracker must notice the failures the suite relies on
// it to notice. Without this a broken /api or a missing asset passes every "no errors" test.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test('trackErrors reports a failing request to the game server (API 500, missing asset)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('**/api/me*', (r) => r.fulfill({ status: 500, json: { error: 'down' } }));
  await page.goto('/');
  await page.waitForSelector('#playBtn', { state: 'visible' });
  await page.evaluate(() => fetch('/api/me?token=secret-token').catch(() => {}));
  await page.evaluate(() => fetch('/no-such-file.js'));
  await expect.poll(() => errors.filter((e) => e.startsWith('HTTP ')).sort().join(' | ')).toContain('HTTP 404 GET /no-such-file.js');
  expect(errors.some((e) => /^HTTP 500 GET \/api\/me$/.test(e))).toBe(true);
  expect(errors.join(' ')).not.toContain('secret-token'); // the query string is left out
});

test('trackErrors: a clean lobby reports nothing, an allowed failure is skipped, other sites are ignored', async ({ page }) => {
  const errors = trackErrors(page, { allowHttp: /^404 GET \/expected-missing\.js$/ });
  await page.route('https://elsewhere.example/**', (r) => r.fulfill({ status: 500, body: 'no', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  await page.waitForSelector('#playBtn', { state: 'visible' });
  await page.evaluate(() => fetch('/expected-missing.js'));
  await page.evaluate(() => fetch('https://elsewhere.example/x').catch(() => {}));
  await page.waitForFunction(() => window.__hunt && window.__hunt.phase === 'menu');
  expect(errors).toEqual([]);
  await page.evaluate(() => fetch('/not-expected.js'));
  await expect.poll(() => errors).toEqual(['HTTP 404 GET /not-expected.js']);
});

test('trackErrors reports an uncaught page error and a frame error', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForSelector('#playBtn', { state: 'visible' });
  await page.evaluate(() => { setTimeout(() => { throw new Error('boom in page'); }, 0); console.log('frame error: test'); });
  await expect.poll(() => errors.length).toBe(2);
  expect(errors.join(' | ')).toContain('boom in page');
  expect(errors.join(' | ')).toContain('frame error: test');
});
