// Friend rooms in the browser: the host's mode, the room card (code, who's in, START for the host
// only), friends on one squad, a late friend held for the next match. And a pass reward you
// already own pays coins.
import { test, expect } from '@playwright/test';
import { trackErrors, G } from './helpers.js';

async function joinRoom(page, name, code, mode) {
  await page.goto('/');
  await page.waitForSelector('#rail_friends');
  await page.evaluate((n) => { document.getElementById('name').value = n; }, name);
  await page.click('#rail_friends');
  await page.fill('#room', code);
  if (mode) await page.click(`#roomModes [data-m="${mode}"]`);
  await page.click('#roomPlay');
  await page.waitForFunction(() => window.__hunt.phase === 'waiting');
}

test('friend room: host picks Squad, presses START; friends are one squad; a late friend waits', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = () => browser.newContext({ viewport: { width: 1280, height: 720 } });
  const [a, b, c] = await Promise.all([ctx(), ctx(), ctx()]).then((cs) => Promise.all(cs.map((x) => x.newPage())));
  const errs = [a, b, c].map(trackErrors);
  const code = 'E2E' + Math.floor(Math.random() * 1e6);
  await joinRoom(a, 'Ann', code, 'squad');
  await joinRoom(b, 'Ben', code, 'showdown'); // a guest's pick doesn't change the room
  await expect(b.locator('#mmList li')).toHaveCount(2);
  await expect(a.locator('#mmCode')).toHaveText(code);
  await expect(b.locator('#mmCode')).toHaveText(code);
  await expect(a.locator('#mmMode')).toContainText(`ROOM ${code} · SQUAD HUNT`);
  await expect(a.locator('#mmStart')).toBeVisible();
  await expect(b.locator('#mmStart')).toBeHidden();
  await expect(b.locator('#mmWait')).toHaveText('Waiting for Ann to start.');
  await expect(a.locator('.mmcredit')).toHaveText('Created by Sam Eyde III');
  // no countdown race: still waiting well past the old 12 seconds
  await a.waitForTimeout(13_000);
  expect(await G(b, () => window.__hunt.phase)).toBe('waiting');
  await a.click('#mmStart');
  for (const p of [a, b]) await p.waitForFunction(() => window.__hunt.me, null, { timeout: 20_000 });
  const ta = await G(a, () => [window.__hunt.modeKey, window.__hunt.me.tm]), tb = await G(b, () => [window.__hunt.modeKey, window.__hunt.me.tm]);
  expect(ta[0]).toBe('squad'); expect(tb[0]).toBe('squad');
  expect(ta[1]).toBe(tb[1]);
  // a friend arriving mid-match is held for the next one, with the code still on screen
  await joinRoom(c, 'Cat', code);
  await expect(c.locator('#mmCount')).toContainText('mid-match');
  await expect(c.locator('#mmCode')).toHaveText(code);
  await c.waitForTimeout(4500); // longer than the client's 3.5 s silence check: the socket stays up
  expect(await G(c, () => window.__hunt.phase)).toBe('waiting');
  await c.click('#mmCancel');
  await c.waitForFunction(() => window.__hunt.phase === 'menu');
  for (const e of errs) expect(e).toEqual([]);
});

test('locker and pass: rewards are not sold, and a reward you already own shows its coin value', async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForSelector('#rail_pass');
  const token = await page.evaluate(() => localStorage.getItem('hunt-token'));
  const buy = await (await request.post('/api/shop', { headers: { authorization: 'Bearer ' + token }, data: { action: 'buy', id: 'confetti' } })).json();
  expect(buy.error).toBe('not for sale');
  // show the pass as if this player owned Little Ghost (a free reward at tiers 15 and 25) and reached tier 30
  await page.evaluate(() => window.__huntMsg({ t: 'progress', delta: 0, xp: 0, progress: { xp: 0, trophies: {}, owned: ['ghost'], equipped: {}, pass: { xp: 1e6, claimed: [], premium: false } } }));
  await page.click('#rail_pass');
  await expect(page.locator('.track .tier').nth(14).locator('.rw.free')).toContainText('Owned → +60');
  await expect(page.locator('.pass-wrap')).toContainText('1400');
  expect(errors).toEqual([]);
});
