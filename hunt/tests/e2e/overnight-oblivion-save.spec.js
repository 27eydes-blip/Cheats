// The rename to Oblivion GP changed only what players read. A player who saved under the old name
// comes back to the renamed game with the same storage keys ('hunt-token', 'hunt', 'hunt-settings',
// 'hunt-race-mode', ...) and finds their coins, unlocks, name and lobby choices as they left them.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone } from './race-helpers.js';

const progress = (page) => page.evaluate(() => import('/account.js').then((A) => JSON.parse(JSON.stringify(A.progress()))));

test('a save written with the old keys still loads: coins, unlocks, name and lobby choices', async ({ browser }) => {
  // 1. the "before" player: a guest account that bought something, with prefs under the old keys
  const a = await phone(browser, 667, 375);
  await a.page.goto('/');
  await a.page.waitForSelector('#playBtn');
  await a.page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  await a.page.evaluate(() => import('/account.js').then((A) => A.shop({ action: 'gbuy', id: 'glow_lime' })));
  const before = await progress(a.page);
  expect(before.owned).toContain('glow_lime');
  const saved = await a.page.evaluate(() => ({ token: localStorage.getItem('hunt-token') }));
  expect(saved.token, 'the session token is still stored under hunt-token').toBeTruthy();
  await a.ctx.close();

  // 2. a fresh device holding exactly those old keys opens the renamed game
  const b = await phone(browser, 667, 375);
  const errors = trackErrors(b.page);
  await b.page.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('hunt-token', s.token);
    localStorage.setItem('hunt', JSON.stringify({ name: 'OldSave', brawler: 'volt', bots: true }));
    localStorage.setItem('hunt-race-mode', 'elim');
    localStorage.setItem('hunt-race-track', 'frozen');
    localStorage.setItem('hunt-race-tut', '1');
  }, saved);
  await b.page.goto('/');
  await b.page.waitForSelector('#playBtn');
  await b.page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  await expect(b.page).toHaveTitle('Oblivion GP');
  const after = await progress(b.page);
  expect(after.coins).toBe(before.coins);
  expect(after.owned).toEqual(expect.arrayContaining(before.owned));
  await expect(b.page.locator('#coinN')).toHaveText(String(before.coins).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  await expect(b.page.locator('#pName')).toHaveText('OldSave');
  await expect(b.page.locator('.modebtn[data-m="elim"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(b.page.locator('#trackNm')).toContainText(/FROZEN/i);
  await expect(b.page.locator('#lobby #credit')).toHaveText('Made by Gleyde Technologies');
  expect(errors).toEqual([]);
  await b.ctx.close();
});
