// THE LADDER (ui/space/ladder.js): the lobby's rank card shows your tier from the server, opens the
// ladder screen (rank, leaderboards, challenges) with the credit visible, the leaderboards list a
// registered racer from real account data, and the finish screen's rank line shows RP won. Also:
// the new tracks are in the track picker, and a race on Skyline Crossover starts and draws its
// figure-8 on the minimap.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const CREDIT = 'Made by Gleyde Technologies';
const grant = (page, body) => page.evaluate((b) => import('/account.js').then(async (A) => {
  const r = await fetch('/api/devgrant', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + A.ACC.token }, body: JSON.stringify(b) });
  A.setUser((await r.json()).user);
}), body);
async function lobby(browser, w = 844, h = 390) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hunt-race-tut', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  return { ctx, page, errors };
}
const creditShown = (page) => page.evaluate((t) => [...document.querySelectorAll('body *')].some((e) => {
  if (e.children.length || e.textContent.trim() !== t) return false;
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 20 && r.bottom <= innerHeight + 0.5 && r.top >= 0 && s.visibility !== 'hidden' && s.display !== 'none';
}), CREDIT);

test('rank card, ladder screen, leaderboards from real accounts', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page, errors } = await lobby(browser);
  // a fresh account starts at Bronze III
  await expect(page.locator('#rankCard')).toContainText('BRONZE III');
  // register (so the boards may list us) and earn some ladder points and a lap (dev-only grant)
  const name = 'Ld' + Math.random().toString(36).slice(2, 9);
  await page.evaluate((n) => import('/account.js').then((A) => A.register(n, 'secret123')), name);
  await grant(page, { rp: 999999, laps: { skyline: 5.5 + Math.random() * 0.6 } }); // (ties: the earlier racer ranks first, so a lap of 5.5-6.1 s)
  await expect(page.locator('#rankCard')).toContainText('OBLIVION');
  const box = await page.locator('#rankCard').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.locator('#rankCard').click();
  const S = page.locator('#ladderScreen');
  await expect(S).toBeVisible();
  await expect(S.locator('.ld-me')).toContainText('OBLIVION');
  expect(await creditShown(page)).toBe(true);
  // leaderboards: our row is marked on both boards (listed by name, or as "You" while the server's
  // 60 s board cache still holds the list from before we registered)
  await S.locator('.ld-tab[data-t="boards"]').click();
  await expect(S.locator('#ldRanked li.you')).toContainText('OBLIVION', { timeout: 15_000 });
  await S.locator('.ld-chip[data-k="skyline"]').click();
  await expect(S.locator('#ldLaps li.you')).toContainText('0:0');
  // challenges: today's and this week's, from the account
  await S.locator('.ld-tab[data-t="challenges"]').click();
  await expect(S.locator('.ld-ch')).toHaveCount(2);
  await expect(S.locator('.ld-ch').first()).toContainText('DAILY CHALLENGE');
  expect(await creditShown(page)).toBe(true);
  await S.locator('.back').click();
  await expect(S).toHaveCount(0);
  // the track picker has the two new tracks
  await page.click('#trackBtn');
  await expect(page.locator('.tcard[data-k="skyline"]')).toContainText('Skyline Crossover');
  await expect(page.locator('.tcard[data-k="starfall"]')).toContainText('Starfall Speedway');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the finish screen rank line', async ({ browser }) => {
  const { ctx, page, errors } = await lobby(browser);
  const r = await page.evaluate(() => import('/ui/space/ladder.js').then((m) => {
    const host = document.createElement('div'); host.className = 'rc-res'; host.innerHTML = '<div class="right"><div class="rc-ups"></div></div>';
    document.body.append(host);
    const el = m.rankResult(host.querySelector('.rc-ups'), { rp: 322, from: 290, delta: 32, up: 1, newTier: 1 });
    return { text: el.textContent, after: el.previousElementSibling === host.querySelector('.rc-ups') };
  }));
  expect(r.after).toBe(true);
  expect(r.text).toContain('SILVER III');
  expect(r.text).toContain('+32 RP');
  expect(r.text).toContain('NEW TIER');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('a race on Skyline Crossover: the figure-8 on the minimap', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hunt-race-tut', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto(`/?race=1&mode=grand&track=skyline&lobby=2&laps=1&room=LD${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
  await page.waitForFunction(() => window.__race && window.__race.phase === 'race', null, { timeout: 60_000 });
  const t = await page.evaluate(() => { const T = window.__race.rc.T; return { key: T.key, cross: !!T.cross, corridors: T.corridors.length }; });
  expect(t).toEqual({ key: 'skyline', cross: true, corridors: 2 });
  await page.waitForTimeout(1500);
  expect(await creditShown(page)).toBe(true);
  expect(errors).toEqual([]);
  await ctx.close();
});
