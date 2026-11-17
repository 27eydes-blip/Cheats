// The race in the lobby's neon space look (Oblivion GP upgrade, UI):
//  - the in-race HUD letters in the space fonts (Chakra Petch / Barlow Semi Condensed), never the
//    old cartoon face, with no thick ink outlines, and the joystick / buttons are not cartoon yellow
//  - slimmer thumb controls: still >= 44 px tap targets, the joystick always drawn, but together
//    they cover far less of a phone screen than before (the road ahead stays visible)
//  - touch screens show the item and weapon on the ITEM / FIRE buttons (no second pair of slots
//    over the road)
//  - the finish screen: the place lands on yours, the rewards count up to the real numbers, RACE
//    AGAIN has the focus and Enter starts the next race; Reduce Flashing shows it all at once
//  - the lobby fetches the race code while you look at it, so LAUNCH starts at once
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, raceUrl, roomCode, waitPhase, layout, creditVisible } from './race-helpers.js';

// records what the HUD asks its canvas to draw with, for a few frames (only inside Hud.draw: in
// Top-down the HUD shares the world canvas)
const recordHud = (page, frames = 20) => page.evaluate((n) => new Promise((done) => {
  const s = window.__race.session, g = s.flat ? s.renderer.g : s.hg, H = s.hud, draw = H.draw;
  const fonts = new Set(), fills = new Map();
  let thick = 0;
  const P = Object.getPrototypeOf(g), dF = Object.getOwnPropertyDescriptor(P, 'font'), dS = Object.getOwnPropertyDescriptor(P, 'fillStyle'), st = g.stroke;
  H.draw = function (gg, S) {
    Object.defineProperty(gg, 'font', { configurable: true, get() { return dF.get.call(this); }, set(v) { fonts.add(v); dF.set.call(this, v); } });
    Object.defineProperty(gg, 'fillStyle', { configurable: true, get() { return dS.get.call(this); }, set(v) { if (typeof v === 'string') { const k = v.toLowerCase(); fills.set(k, (fills.get(k) || 0) + 1); } dS.set.call(this, v); } });
    gg.stroke = function (...a) { if (this.lineWidth >= 4 && String(this.strokeStyle).toLowerCase() === '#06040c') thick++; return st.apply(this, a); };
    try { return draw.call(this, gg, S); } finally { delete gg.font; delete gg.fillStyle; delete gg.stroke; }
  };
  let k = 0;
  const tick = () => {
    if (++k < n) { requestAnimationFrame(tick); return; }
    H.draw = draw;
    done({ fonts: [...fonts], fills: Object.fromEntries(fills), thick });
  };
  requestAnimationFrame(tick);
}), frames);

test('neon HUD: space fonts, no ink outlines, no cartoon yellow on the controls', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch context');
  test.setTimeout(90_000);
  const P = await phone(browser, 844, 390), page = P.page, errs = trackErrors(page);
  await page.goto(raceUrl({ room: roomCode('N'), bots: '1', lobby: '1' }));
  await waitPhase(page, 'race');
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 0.5);
  const r = await recordHud(page);
  expect(r.fonts.some((f) => /Lilita/.test(f)), `fonts: ${r.fonts.join(' | ')}`).toBe(false);
  expect(r.fonts.every((f) => /Chakra Petch|Barlow Semi Condensed/.test(f)), `fonts: ${r.fonts.join(' | ')}`).toBe(true);
  expect(r.thick, 'thick ink outlines').toBe(0);
  // the old knob / weapon / DRIFT yellow: at most the leader's small gold crown on the minimap
  expect(r.fills['#ffd23f'] || 0, JSON.stringify(r.fills)).toBeLessThanOrEqual(20); // (<= 1 per frame)
  // touch: no item / weapon slots over the road (they are on the buttons)
  expect(r.fills['rgba(60,30,110,0.55)'] || 0).toBe(0);
  // a place gained: the number pops and a ▲ shows for a moment
  const pop = await page.evaluate(() => new Promise((ok) => { const h = window.__race.session.hud; h.rk = 99; requestAnimationFrame(() => requestAnimationFrame(() => ok({ up: h.rkUp, t: h.rkT, rk: h.rk }))); }));
  expect(pop.up).toBe(true);
  expect(pop.t).toBeLessThan(1.2);
  expect(pop.rk).toBeLessThan(99);
  await creditVisible(page);
  expect(errs).toEqual([]);
  await P.ctx.close();
});

for (const [W, H] of [[667, 375], [844, 390], [1180, 820]]) {
  test(`${W}x${H}: slim controls cover little of the screen and are still thumb-sized`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'touch context');
    const P = await phone(browser, W, H), page = P.page;
    await page.goto(raceUrl({ room: roomCode('S'), bots: '1', lobby: '1' }));
    await waitPhase(page, 'race');
    const L = await layout(page);
    expect(L.mode).toBe('touch');
    const circles = [{ r: L.stick.r }, ...['drift', 'fire', 'item', 'brake'].map((k) => L.btn[k])];
    for (const c of circles) expect(c.r * 2, 'tap target').toBeGreaterThanOrEqual(44);
    const area = (rs) => rs.reduce((a, r) => a + Math.PI * r * r, 0) / (W * H);
    const cover = area(circles.map((c) => c.r));
    // the layout before the redesign (stick 0.21 of the short side, DRIFT 0.12 H, the others 0.8 of it)
    const k = (v, a, b) => Math.max(a, Math.min(b, v)), r0 = k(H * 0.12, 32, 58), r2 = k(r0 * 0.8, 29, 48);
    const old = area([Math.round(k(Math.min(W, H) * 0.21, 70, 120)), r0, r2, r2, r2]);
    console.log(`${W}x${H}: controls cover ${(cover * 100).toFixed(1)}% of the screen (was ${(old * 100).toFixed(1)}%)`);
    expect(cover, 'at least a quarter less screen under the controls').toBeLessThan(old * 0.75);
    // the joystick is drawn while nobody touches it (its ring pixels are on the HUD canvas)
    const lit = await page.evaluate(() => {
      const s = window.__race.session, g = s.flat ? s.renderer.g : s.hg, d = s.dpr, k = s.ctrl.stick;
      const px = g.getImageData(Math.round((k.cx + k.r - 2) * d), Math.round((k.cy - 3) * d), Math.round(4 * d), Math.round(6 * d)).data;
      let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 60 && px[i + 2] > 150) n++;
      return n;
    });
    expect(lit, 'joystick ring drawn').toBeGreaterThan(0);
    await P.ctx.close();
  });
}

const END = (mode = 'grand') => {
  const rc = window.__race.rc;
  rc.onMsg({ t: 'end', mode, track: rc.trackKey, rank: 2, you: rc.id, n: 4, time: 92.4, bestLap: 29.8, mc: 12, k: 2, results: [[77, 'Nova', 'brick', 1, 91.2, 1, 7, 0, 29.1, 1, 1], [rc.id, 'You', 'volt', 2, 92.4, 2, 12, 0, 29.8, 1, 0], [99, 'Bolt', 'wisp', 3, 95, 0, 2, 1, 31, 1, 1], [98, 'Rook', 'rook', 4, 97, 0, 2, 1, 31, 1, 1]] });
  rc.onMsg({ t: 'progress', delta: 14, xp: 120, coins: 25, levels: [], progress: null, best: 29.8, improved: true });
};

test('finish screen: the place lands on yours, rewards count up, RACE AGAIN has the focus and Enter races again', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 844, height: 390 });
  const errs = trackErrors(page);
  await page.goto(raceUrl({ room: roomCode('R'), bots: '1', lobby: '1' }));
  await waitPhase(page, 'race');
  await page.evaluate(END);
  await page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 30_000 });
  // counting: shortly after it opens the coins are still on their way up
  const early = await page.evaluate(() => [...document.querySelectorAll('.rc-res .rcr-n')].map((b) => b.textContent));
  expect(early[0], 'coins start from 0').toBe('0');
  await expect(page.locator('.rc-res .rcr-rank')).toHaveText('2ND');
  await expect(page.locator('.rc-res .rcr-rank')).toHaveClass(/landed/);
  await expect(page.locator('.rc-res .rcr-n').first()).toHaveText('12');
  await expect(page.locator('.rc-res .rcr-n').nth(1)).toHaveText('2');
  await expect(page.locator('.rc-res .rcr-n').nth(2)).toHaveText('0:29.80');
  await expect(page.locator('.rc-res .rc-tro')).toHaveText('+14');
  await expect(page.locator('.rc-res .rc-ups')).toContainText('NEW BEST');
  await expect(page.locator('.rc-res .rcr-of')).toHaveText('OF 4 RACERS');
  await expect(page.locator('.rc-res .rc-again')).toBeFocused();
  await creditVisible(page);
  // Enter: the next race (a fresh session in the same mode)
  await page.evaluate(() => { window.__oldSession = window.__race.session; });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__race.session !== window.__oldSession && !window.__race.session.dead);
  await expect(page.locator('.rc-res')).toHaveCount(1);
  await expect(page.locator('.rc-res')).toBeHidden();
  expect(errs).toEqual([]);
});

test('finish screen with Reduce Flashing: everything is shown at once', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('hunt-settings', JSON.stringify({ ...(JSON.parse(localStorage.getItem('hunt-settings') || '{}')), reduceFlash: true })));
  await page.goto(raceUrl({ room: roomCode('F'), bots: '1', lobby: '1' }));
  await waitPhase(page, 'race');
  await page.evaluate(END);
  await page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 30_000 });
  const r = await page.evaluate(() => ({ rank: document.querySelector('.rcr-rank').textContent, n: [...document.querySelectorAll('.rc-res .rcr-n')].map((b) => b.textContent), tro: document.querySelector('.rc-tro').textContent, calm: document.querySelector('.rc-res').classList.contains('calm') }));
  expect(r).toEqual({ rank: '2ND', n: ['12', '2', '0:29.80'], tro: '+14', calm: true });
});

test('the lobby fetches the race code while you look at it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some((e) => /\/race\/app\.js/.test(e.name))), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#playBtn')).toBeVisible();
});
