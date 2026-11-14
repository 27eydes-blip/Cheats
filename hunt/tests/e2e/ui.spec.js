import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

const SIZES = { 'iPhone SE': { width: 667, height: 375 }, 'iPhone Pro Max': { width: 932, height: 430 }, iPad: { width: 1180, height: 820 } };

for (const [name, vp] of Object.entries(SIZES)) {
  test(`lobby fits ${name}: PLAY fully on screen, nothing overflowing`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    await page.goto('/');
    await page.waitForSelector('#playBtn');
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      const inside = (b) => b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5;
      const parts = ['#playBtn', '#profileCard', '#modeCard', '.nameplate', '#tbMissions', '#rail_settings', '#lobby #credit'];
      return Object.fromEntries(parts.map((s) => [s, inside(box(s))]));
    });
    for (const [k, ok] of Object.entries(r)) expect(ok, `${k} inside the viewport`).toBe(true);
    // PLAY must not overlap the mode card or the credit
    const ov = await page.evaluate(() => { const a = document.querySelector('#playBtn').getBoundingClientRect(), b = document.querySelector('#modeCard').getBoundingClientRect(); return a.top < b.bottom - 1 && a.bottom > b.top && a.left < b.right && a.right > b.left; });
    expect(ov).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('screens slide in/out: brawler select, detail, mode picker, locker, pass, road, settings, profile', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.click('.nameplate');
  await expect(page.locator('.ui-screen.enter')).toBeVisible();
  await page.click('.bcard[data-b="rook"]');
  await expect(page.locator('.detail .stats')).toBeVisible();
  await page.click('.detail [data-sel]');
  await page.click('.ui-screen .back');
  await expect(page.locator('#npName')).toHaveText('Rook');
  await expect(page.locator('.modebtn')).toHaveCount(5);
  await page.click('.modebtn[data-m="squad"]');
  await expect(page.locator('#mcName')).toHaveText('SQUAD HUNT');
  await expect(page.locator('.modebtn[data-m="squad"]')).toHaveClass(/sel/);
  // tabs: profile (stats) and locker (categories)
  await page.click('#profileCard .pname');
  await expect(page.locator('.pg-profile .stat-table')).toBeVisible();
  await expect(page.locator('.pg-profile .stile').first()).toBeVisible();
  await page.click('#rail_locker');
  await expect(page.locator('.lsec')).toHaveCount(6);
  await page.click('#tab_play');
  await expect(page.locator('#playBtn')).toBeVisible();
  await page.click('#rail_locker'); await page.click('.lsec[data-open="fx"]');
  await expect(page.locator('.pedestals')).toBeVisible();
  await page.click('.ui-screen .back'); await page.click('#tab_play');
  for (const [btn, sel] of [['#rail_pass', '.track'], ['#rail_road', '.road-wrap'], ['#rail_settings', '#volMusic']]) {
    await page.click(btn);
    await expect(page.locator(sel)).toBeVisible();
    await page.click('.ui-screen .back');
    await expect(page.locator('.ui-screen')).toHaveCount(0);
  }
  await page.click('#tbMissions');
  await expect(page.locator('.mission')).toHaveCount(3);
  await page.click('.ui-pop [data-close]');
  expect(errors).toEqual([]);
});

test('play flow: matchmaking radar -> VS intro -> match -> results', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.click('#playBtn');
  await expect(page.locator('.mm')).toBeVisible();
  await expect(page.locator('#mmCount')).toContainText('hunters found');
  await expect(page.locator('.intro')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('.intro')).toContainText('ENTERING');
  await waitMe(page);
  await page.evaluate(() => { const G = window.__hunt; window.__huntMsg({ t: 'end', mode: 'bounty', rank: 2, kills: 1, bounty: 3, winner: 'Zed', results: [['Zed', 'volt', 1, 4, 1, 99, 9, 9], ['Me', G.brawler, 2, 1, 0, G.myId, 3, 3]] }); });
  await expect(page.locator('.res')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#rsRank')).toHaveText('#2');
  await expect(page.locator('#mvp')).toContainText('Zed');
  await page.click('#rsLobby');
  await expect(page.locator('#playBtn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('lobby music plays after a tap and ducks under popups; Low Graphics freezes the background', async ({ page }) => {
  await page.goto('/');
  await page.click('#rail_settings');
  await page.click('.ui-screen .back');
  const playing = await page.evaluate(async () => (await import('/ui/music.js')).musicPlaying());
  expect(playing).toBe(true);
  await page.click('#tbMissions');
  expect(await page.evaluate(async () => (await import('/ui/music.js')).isDucked())).toBe(true);
  await page.click('.ui-pop [data-close]');
  await page.waitForTimeout(300);
  expect(await page.evaluate(async () => (await import('/ui/music.js')).isDucked())).toBe(false);
  await page.click('#rail_settings'); await page.check('#setLow'); await page.click('.ui-screen .back');
  await page.waitForTimeout(500); // Low Graphics: the hunter card draws at 1x
  expect(await page.evaluate(() => { const c = document.getElementById('stage'); return Math.abs(c.width - c.getBoundingClientRect().width) <= 1; })).toBe(true);
});
