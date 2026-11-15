// FILL WITH BOTS on the PLAY page is honoured by public matchmaking: OFF = humans-only matches
// (a lone player waits, and can cancel), ON = empty seats fill with bots. The choice is saved.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

const roster = (page) => page.evaluate(() => ({ n: Object.keys(window.__hunt.roster).length, botsOn: window.__hunt.botsOn }));

// each browser project queues for its own mode, so parallel runs (and the layout audit, which
// waits in the default Quick Hunt queue with bots off) never meet in the same humans-only match
const MODE = { chromium: 'bighunt', firefox: 'showdown', webkit: 'squad' };

test('FILL WITH BOTS off: a lone hunter waits (and can cancel), two hunters get a match with zero bots', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const mode = MODE[info.project.name] || 'bighunt';
  const a = await (await browser.newContext()).newPage(), b = await (await browser.newContext()).newPage();
  const errors = [...[a, b].map(trackErrors)];
  for (const p of [a, b]) {
    await p.goto('/');
    await p.click('#fillBots');
    await expect(p.locator('#fillBots')).toHaveAttribute('aria-checked', 'false');
    await p.reload(); // remembered without pressing PLAY
    await expect(p.locator('#fillBots')).toHaveAttribute('aria-checked', 'false');
    await expect(p.locator('#fillCb')).not.toHaveClass(/\bon\b/);
    await p.click(`.modebtn[data-m="${mode}"]`);
  }
  // alone: a clear waiting state that never turns into a bot match
  await a.click('#playBtn');
  await expect(a.locator('#mmFound')).toHaveText(/WAITING FOR MORE HUNTERS/);
  await expect(a.locator('#mmCount')).toContainText('bots are off');
  await a.waitForTimeout(9500); // longer than a public lobby's 8 s countdown
  expect(await a.evaluate(() => window.__hunt.phase)).toBe('waiting');
  // cancel goes back to the lobby
  await a.click('#mmCancel');
  await expect(a.locator('#playBtn')).toBeVisible();
  // two humans with bots off meet each other, and nobody else is added
  await a.click('#playBtn');
  await expect(a.locator('#mmFound')).toHaveText(/WAITING FOR MORE HUNTERS/);
  await b.click('#playBtn');
  await waitMe(a); await waitMe(b);
  await expect.poll(() => roster(a)).toEqual({ n: 2, botsOn: false });
  await expect.poll(() => roster(b)).toEqual({ n: 2, botsOn: false });
  expect(await a.evaluate(() => window.__hunt.matchName)).toMatch(/^qn:/); // the humans-only queue
  expect(errors.flat()).toEqual([]);
});

test('FILL WITH BOTS on (the default): PLAY fills the match with bots', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fillBots')).toHaveAttribute('aria-checked', 'true');
  await page.click('#playBtn');
  await waitMe(page);
  await expect.poll(async () => (await roster(page)).n, { timeout: 15_000 }).toBeGreaterThan(2);
  expect((await roster(page)).botsOn).toBe(true);
});

test('room codes still honour bots=0', async ({ page }) => {
  await page.goto('/');
  await page.click('#fillBots');
  await page.click('#rail_friends');
  await page.fill('#room', 'NB' + Math.floor(Math.random() * 1e6));
  await page.click('#roomPlay');
  // (a friend room shows its own waiting card: the host's bots switch is off and START waits for a friend)
  await expect(page.locator('#mmFound')).toHaveText('FRIENDS ROOM');
  await expect(page.locator('#mmWait')).toHaveText(/Bots are off/);
  await expect(page.locator('#mmBots')).not.toBeChecked();
  expect(await page.evaluate(() => window.__hunt.botsOn)).toBe(false);
});
