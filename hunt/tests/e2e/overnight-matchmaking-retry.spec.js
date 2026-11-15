// Losing the connection while FINDING HUNTERS: retry with backoff, say so, let the player cancel,
// and give up with a clear message instead of looping forever.
import { test, expect } from '@playwright/test';

// A switchable outage that behaves the same in every browser: while window.__down is set, a new
// socket fails at once ('fail') or never answers ('hang'), like a dead server or a dead signal.
const outage = () => {
  const Real = window.WebSocket;
  window.__attempts = 0;
  window.WebSocket = function (url) {
    if (!window.__down) return new Real(url);
    window.__attempts++;
    const fake = { readyState: 0, send() {}, close() { this.readyState = 3; } };
    if (window.__down === 'fail') setTimeout(() => { fake.readyState = 3; if (fake.onclose) fake.onclose({}); }, 20);
    return fake;
  };
};
const queueUp = async (page) => {
  await page.addInitScript(outage);
  await page.goto('/');
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__hunt.phase === 'waiting' && window.__hunt.myId > 0);
};
// the server goes away: new sockets fail and the live one drops
const goDown = (page, how = 'fail') => page.evaluate((h) => { window.__down = h; for (const c of window.__hunt.conns.values()) c.ws.close(); }, how);

test('matchmaking retries slowly, says the connection is lost, and recovers', async ({ page }) => {
  await queueUp(page);
  await goDown(page);
  await expect(page.locator('#mmCount')).toHaveText('Connection lost. Retrying...');
  await expect(page.locator('#mmFound')).toHaveText('CONNECTION LOST');
  await expect(page.locator('#mmCancel')).toBeVisible();
  await page.waitForTimeout(5000);
  // backoff 0.5 s, 1 s, 2 s, 4 s: 3 attempts in 5 s (it used to be about 25)
  expect(await page.evaluate(() => window.__attempts)).toBe(3);
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('waiting');
  await expect(page.locator('#mmCount')).toHaveText('Connection lost. Retrying...');
  // the server is back: the next try gets through and the search carries on
  await page.evaluate(() => { window.__down = null; });
  await expect(page.locator('#mmFound')).toHaveText('FINDING HUNTERS', { timeout: 12_000 });
  await expect(page.locator('#mmCount')).toContainText('hunters found');
});

test('CANCEL during a retry goes back to the lobby and stops retrying', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await queueUp(page);
  await goDown(page);
  await expect(page.locator('#mmCount')).toHaveText('Connection lost. Retrying...');
  await page.click('#mmCancel');
  await expect(page.locator('#playBtn')).toBeVisible();
  const n = await page.evaluate(() => window.__attempts);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__attempts)).toBe(n);
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('menu');
  expect(errors).toEqual([]);
});

test('matchmaking gives up with a clear message when the server stays unreachable', async ({ page }) => {
  await queueUp(page);
  await goDown(page);
  await expect(page.locator('#toast')).toHaveText('Can’t reach the server. Check your connection and try again.', { timeout: 30_000 });
  await expect(page.locator('#playBtn')).toBeVisible();
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('menu');
  expect(await page.evaluate(() => window.__attempts)).toBe(5);
});

test('a connect that never answers counts as a lost connection too', async ({ page }) => {
  await queueUp(page);
  await goDown(page, 'hang');
  await expect(page.locator('#mmCount')).toHaveText('Connection lost. Retrying...');
  // first retry after 0.5 s hangs; the 4 s connect timeout ends it and schedules the next (1 s later)
  await page.waitForFunction(() => window.__attempts === 2, null, { timeout: 12_000 });
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('waiting');
});
