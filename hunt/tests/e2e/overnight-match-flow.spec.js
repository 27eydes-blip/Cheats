// Match flow: the in-match menu (button + Esc), leaving a match / Free Play / the Test Range, and the
// death screen and spectate bar (LOBBY, earned rewards, clear of the creator credit).
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

const phase = (page) => page.evaluate(() => window.__hunt.phase);
const box = (page, sel) => page.locator(sel).boundingBox();
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// my account as the server has it
const account = (page) => page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: 'Bearer ' + localStorage.getItem('hunt-token') } })).json()).user.progress);
const PROGRESS = { t: 'progress', delta: 8, xp: 60, coins: 22, progress: { xp: 160, trophies: {}, owned: [], equipped: {} }, levels: [{ level: 2, coins: 50, weapons: ['breaker'] }], mastery: [] };
const eliminate = (page, progress = PROGRESS) => page.evaluate((p) => {
  window.__huntMsg({ t: 'dead', rank: 4, respawn: 0, killer: 'the Poison', killerId: 0, stolen: 0 });
  if (p) window.__huntMsg(p);
}, progress);

test('Esc and the menu button open the in-match menu; the match keeps running; RESUME closes it', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await expect(page.locator('#menuBtn')).toBeVisible();
  await expect(page.locator('#gmenu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#gmenu')).toBeVisible();
  await expect(page.locator('#gmNote')).toHaveText('The match is still running');
  await expect(page.locator('#gmLeave')).toHaveText('LEAVE MATCH');
  await expect(page.locator('#creditGame')).toBeVisible();
  // the match really is still running behind it, and held keys do not walk the brawler around
  const n0 = await page.evaluate(() => [...window.__hunt.conns.values()].find((c) => c.primary).last.n);
  await page.keyboard.down('d');
  const x0 = await page.evaluate(() => window.__hunt.pred.x);
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  expect(await page.evaluate(() => [...window.__hunt.conns.values()].find((c) => c.primary).last.n)).toBeGreaterThan(n0);
  expect(Math.abs((await page.evaluate(() => window.__hunt.pred.x)) - x0)).toBeLessThan(2);
  expect(await phase(page)).toBe('play');
  await page.keyboard.press('Escape');
  await expect(page.locator('#gmenu')).toBeHidden();
  expect(await page.evaluate(() => window.__hunt.phase === 'play' && document.getElementById('gmenu').hidden)).toBe(true);
  await page.click('#menuBtn');
  await expect(page.locator('#gmenu')).toBeVisible();
  await page.click('#gmResume');
  await expect(page.locator('#gmenu')).toBeHidden();
  // input works again
  const x1 = await page.evaluate(() => window.__hunt.pred.x);
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
  const moved = await page.evaluate(() => window.__hunt.pred.x);
  expect(Math.abs(moved - x1)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('the menu sound and music switches change the real settings', async ({ page }) => {
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.click('#menuBtn');
  await expect(page.locator('#gmSound')).toBeChecked();
  await expect(page.locator('#gmMusic')).toBeChecked();
  await page.click('#gmSound');
  await page.click('#gmMusic');
  const s = await page.evaluate(async () => { const m = await import('/settings.js'); return { sound: m.SETTINGS.sound, musicVol: m.SETTINGS.musicVol }; });
  expect(s).toEqual({ sound: false, musicVol: 0 });
  expect(await page.locator('#setSound').isChecked()).toBe(false); // (the lobby Settings box agrees)
  await page.click('#gmMusic');
  expect(await page.evaluate(async () => (await import('/settings.js')).SETTINGS.musicVol)).toBeGreaterThan(0);
  // and they are saved: a reload keeps sound off
  await page.reload();
  expect(await page.evaluate(async () => (await import('/settings.js')).SETTINGS.sound)).toBe(false);
});

test('LEAVE MATCH asks once, records the result once, and lands in the lobby with the rewards shown', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=showdown');
  await waitMe(page);
  const before = await account(page);
  await page.click('#menuBtn');
  await page.click('#gmLeave');
  await expect(page.locator('#gmAsk')).toHaveText('Leave match? You will be placed last.');
  // STAY backs out without leaving
  await page.click('#gmStay');
  await expect(page.locator('#gmLeave')).toBeVisible();
  expect(await phase(page)).toBe('play');
  await page.click('#gmLeave');
  await page.click('#gmYes');
  await expect(page.locator('#lobby')).toBeVisible();
  expect(await phase(page)).toBe('menu');
  await expect(page.locator('#gmenu')).toBeHidden();
  await expect(page.locator('#menuBtn')).toBeHidden();
  // the server's answer to the leave arrives a moment later: shown on a card over the lobby
  await expect(page.locator('#earnedCard')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#earnedCard')).toContainText('MATCH REWARDS');
  await expect(page.locator('#earnedCard')).toContainText('trophies');
  await expect(page.locator('#earnedCard')).toContainText('XP');
  const after = await account(page);
  expect(after.games).toBe((before.games || 0) + 1);
  expect(await page.evaluate(async () => (await import('/account.js')).progress().games)).toBe(after.games); // the lobby has the new totals
  await page.click('#earnedCard');
  await expect(page.locator('#earnedCard')).toBeHidden();
  await page.waitForTimeout(1500);
  expect((await account(page)).games).toBe(after.games); // recorded once
  expect(errors).toEqual([]);
});

test('death screen: LOBBY button, rewards as soon as the server reports them, unlock cards in the lobby', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=showdown');
  await waitMe(page);
  await eliminate(page);
  await expect(page.locator('#dead')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#menuBtn')).toBeHidden();
  await expect(page.locator('#deadEarned')).toBeVisible();
  await expect(page.locator('#deadEarned')).toContainText('+8 trophies');
  await expect(page.locator('#deadEarned')).toContainText('+60 XP');
  await expect(page.locator('#deadEarned')).toContainText('+22 coins');
  await expect(page.locator('#deadEarned')).toContainText('LEVEL 2!');
  await expect(page.locator('#dead .btns button')).toHaveText(['LOBBY', 'SPECTATE', 'PLAY AGAIN']);
  await expect(page.locator('#creditGame')).toBeVisible();
  await page.click('#deadLobby');
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#earnedCard')).toBeVisible();
  await expect(page.locator('#earnedCard')).toContainText('LEVEL 2!');
  await expect(page.locator('#earnedCard .ucard')).toHaveCount(2); // LEVEL UP + NEW WEAPON
  await expect(page.locator('#earnedCard')).toContainText('Breaker');
  expect(errors).toEqual([]);
});

test('PLAY AGAIN on the death screen: rewards were shown there, unlock cards wait for the next lobby visit', async ({ page }) => {
  const errors = trackErrors(page);
  // (the range itself earns nothing, so the only result in play is the one fed in below)
  await page.goto('/?world=meadow&mode=range');
  await waitMe(page);
  await eliminate(page);
  await expect(page.locator('#deadEarned')).toContainText('+8 trophies', { timeout: 5000 });
  await expect(page.locator('#deadEarned')).toContainText('LEVEL 2!');
  await page.click('#dead .again');
  await page.waitForFunction(() => window.__hunt.phase === 'waiting');
  await expect(page.locator('#earnedCard')).toBeHidden();
  await waitMe(page); // the next one starts
  await expect(page.locator('#deadEarned')).toBeHidden();
  // back in the lobby later: the level-up and the new weapon from that earlier match are shown
  await page.click('#menuBtn');
  await page.click('#gmLeave');
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#earnedCard')).toBeVisible();
  await expect(page.locator('#earnedCard .ucard')).toHaveCount(2);
  await expect(page.locator('#earnedCard')).toContainText('LEVEL 2!');
  await expect(page.locator('#earnedCard')).toContainText('Breaker');
  expect(errors).toEqual([]);
});

test('a death-screen result with nothing to unlock is not repeated after PLAY AGAIN', async ({ page }) => {
  await page.goto('/?world=meadow&mode=range'); // (the range earns nothing, so the server has nothing more to report)
  await waitMe(page);
  await eliminate(page, { ...PROGRESS, levels: [], mastery: [] });
  await expect(page.locator('#deadEarned')).toContainText('+8 trophies', { timeout: 5000 });
  await page.click('#dead .again');
  await page.waitForFunction(() => window.__hunt.phase === 'waiting');
  await waitMe(page); // the next range starts
  await page.click('#menuBtn');
  await page.click('#gmLeave');
  await expect(page.locator('#lobby')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('#earnedCard')).toBeHidden();
});

for (const vp of [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 1024, height: 768 }]) {
  test(`spectating at ${vp.width}x${vp.height}: LOBBY + PLAY AGAIN sit clear of the creator credit`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/?world=meadow&mode=showdown');
    await waitMe(page);
    await eliminate(page, null);
    await expect(page.locator('#dead')).toBeVisible({ timeout: 5000 });
    const panel = await box(page, '#dead .panel');
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThanOrEqual(vp.height);
    await page.click('#spectate');
    await expect(page.locator('#dead')).toBeHidden();
    await expect(page.locator('#specBar button')).toHaveText(['LOBBY', 'PLAY AGAIN']);
    const credit = await box(page, '#creditGame');
    await expect(page.locator('#creditGame')).toHaveText('Made by Gleyde Technologies');
    for (const sel of ['#hudLobby', '#hudAgain']) {
      const b = await box(page, sel);
      // 5px is the button's drop shadow, which must clear the credit too
      expect(b.y + b.height + 5, `${sel} (with its shadow) ends above the credit`).toBeLessThanOrEqual(credit.y);
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    }
    // the credit is the top-most thing where it is drawn (nothing covers it)
    const onTop = await page.evaluate(() => { const c = document.getElementById('creditGame'), r = c.getBoundingClientRect(); c.style.pointerEvents = 'auto'; const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); c.style.pointerEvents = ''; return hit === c; });
    expect(onTop).toBe(true);
    await page.click('#hudLobby');
    await expect(page.locator('#lobby')).toBeVisible();
  });
}

test('the home-bar inset lifts the spectate buttons and the credit together', async ({ page }) => {
  // browsers under test report no safe area, so check the rule itself: both offsets are built from the
  // same bottom inset, the buttons 24px above the credit's baseline
  await page.goto('/?world=meadow&mode=showdown');
  await waitMe(page);
  const rules = await page.evaluate(() => {
    const out = {};
    for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch { continue; } for (const r of rs) if (r.selectorText === '#specBar' || r.selectorText === '#creditGame') out[r.selectorText] = r.style.bottom; }
    return out;
  });
  expect(rules['#creditGame']).toBe('max(3px, env(safe-area-inset-bottom))');
  expect(rules['#specBar']).toBe('calc(max(3px, env(safe-area-inset-bottom)) + 24px)');
});

test('phone: the menu button is a full-size touch target, clear of the HUD, the controls and the credit', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch + mobile emulation is Chromium-only');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  // a full kill feed
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__huntMsg({ t: 'kill', k: 'Hunter' + i, v: 'Prey' + i, kid: 90 + i, vid: 80 + i, st: 2 }); });
  await page.waitForTimeout(400);
  const b = await box(page, '#menuBtn');
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.x + b.width).toBeLessThanOrEqual(844);
  expect(b.y).toBeGreaterThanOrEqual(0);
  for (const sel of ['#feed', '#timerPill', '#topBounty', '#leader', '#creditGame', '#ping']) {
    if (!(await page.locator(sel).isVisible())) continue;
    expect(overlap(b, await box(page, sel)), `menu button overlaps ${sel}`).toBe(false);
  }
  // canvas HUD: the minimap with the emote button beside it (top-left), sized as game.js draws them
  const r = Math.min(64, 390 * 0.15);
  expect(overlap(b, { x: 12, y: 36, width: r * 2 + 50, height: r * 2 })).toBe(false);
  expect(b.y + b.height).toBeLessThan(390 * 0.4); // far from the sticks and buttons along the bottom
  // tapping it opens the menu, and the buttons inside are thumb-sized too
  await page.tap('#menuBtn');
  await expect(page.locator('#gmenu')).toBeVisible();
  for (const sel of ['#gmLeave', '#gmResume']) expect((await box(page, sel)).height).toBeGreaterThanOrEqual(44);
  const panel = await box(page, '#gmenu .panel');
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(390);
  await page.tap('#gmResume');
  await expect(page.locator('#gmenu')).toBeHidden();
  await ctx.close();
});

test('Free Play: LEAVE is instant in the safe hub', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?free=1');
  await waitMe(page);
  await expect(page.locator('#menuBtn')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#gmNote')).toHaveText('Free Play keeps running');
  await expect(page.locator('#gmLeave')).toHaveText('LEAVE');
  await page.click('#gmLeave');
  await expect(page.locator('#lobby')).toBeVisible();
  expect(await phase(page)).toBe('menu');
  expect(errors).toEqual([]);
});

test('Free Play outside the hub: a 3 second countdown that CANCEL or damage stops', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?free=1&at=12775,10025'); // out in the wild, east of the hub
  await waitMe(page);
  await expect(page.locator('#hubPanel')).toBeHidden();
  await expect(page.locator('#menuBtn')).toBeVisible();
  // CANCEL
  await page.click('#menuBtn');
  await page.click('#gmLeave');
  await expect(page.locator('#gmAsk')).toContainText('Leaving in 3...');
  await expect(page.locator('#gmYes')).toBeHidden();
  await expect(page.locator('#gmStay')).toHaveText('CANCEL');
  await page.click('#gmStay');
  await expect(page.locator('#gmLeave')).toBeVisible();
  await page.waitForTimeout(3300);
  expect(await phase(page)).toBe('play');
  // taking damage cancels it
  await page.click('#gmLeave');
  await expect(page.locator('#gmAsk')).toContainText('Leaving in');
  // a hit, as the client sees it: HP below where the countdown started. The server re-sends your
  // full state every 2 s, which would undo a single local edit before the countdown's next check
  // if that check runs late (slow machine), so hold the lowered HP until the countdown reacts.
  await page.evaluate(() => {
    const hp = window.__hunt.me.hp - 200;
    const hold = setInterval(() => { if (!document.getElementById('gmMain').hidden) clearInterval(hold); else window.__hunt.me.hp = hp; }, 10);
  });
  await expect(page.locator('#toast')).toHaveText('You took damage. Leaving cancelled.');
  await expect(page.locator('#gmLeave')).toBeVisible();
  await page.waitForTimeout(3300);
  expect(await phase(page)).toBe('play');
  // left alone, it leaves after the countdown (not before)
  await page.evaluate(() => { window.__hunt.me.hp = window.__hunt.me.mh; });
  await page.click('#gmLeave');
  const t0 = Date.now();
  await expect(page.locator('#lobby')).toBeVisible({ timeout: 6000 });
  expect(Date.now() - t0).toBeGreaterThan(2500);
  expect(errors).toEqual([]);
});

test('Test Range: the menu button sits beside LEAVE RANGE and leaves without asking', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/?world=meadow&mode=range');
  await waitMe(page);
  await expect(page.locator('#rangeLeave')).toBeVisible();
  expect(overlap(await box(page, '#menuBtn'), await box(page, '#rangeLeave'))).toBe(false);
  await page.click('#menuBtn');
  await expect(page.locator('#gmLeave')).toHaveText('LEAVE');
  await page.click('#gmLeave');
  await expect(page.locator('#lobby')).toBeVisible();
});
