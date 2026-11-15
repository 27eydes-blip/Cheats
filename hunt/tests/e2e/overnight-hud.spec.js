// HUD and rendering: Big Hunt's top bar, the desktop ability buttons, the super-ready ring.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe, G } from './helpers.js';

// the server never charged the super in these tests: keep a local value set while we look
const holdSc = (page, v) => page.evaluate((v) => { clearInterval(window.__scT); window.__scT = setInterval(() => { if (window.__hunt.me) window.__hunt.me.sc = v; }, 10); }, v);
const box = (page, sel) => page.locator(sel).boundingBox();
const overlap = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('Big Hunt shows hunters left and the poison countdown, like Showdown', async ({ page }) => {
  const errors = trackErrors(page);
  for (const mode of ['bighunt', 'showdown']) {
    await page.goto(`/?world=meadow&mode=${mode}`);
    await waitMe(page);
    await expect(page.locator('#countPill')).toBeVisible();
    await expect(page.locator('#poison')).toBeVisible();
    await expect(page.locator('#poison')).toContainText('POISON IN');
    const left = Number(await page.locator('#aliveN').textContent());
    expect(left).toBe(await G(page, () => window.__hunt.conns.get('main').last.al));
    expect(left).toBeGreaterThan(1);
    await expect(page.locator('#timerPill')).toBeHidden(); // no time limit in either
    expect(await G(page, () => window.__hunt.caps)).toEqual({ poison: true, respawn: false });
  }
  // a timed mode with respawns: timer, no poison, no LEFT count
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await expect(page.locator('#timerPill')).toBeVisible();
  await expect(page.locator('#poison')).toBeHidden();
  await expect(page.locator('#countPill')).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('desktop ability buttons', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('SWAP, GADGET and SUPER are real buttons with their keys, clear of the credit, feed and minimap', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?world=meadow&mode=range&wpn=stormline&pw=7&gd=volt_jolt');
    await waitMe(page);
    await page.waitForFunction(() => window.__hunt.me.w2 && window.__hunt.me.gu >= 0);
    for (const id of ['#abSwap', '#abGadget', '#abSuper']) await expect(page.locator(id)).toBeVisible();
    await expect(page.locator('#abSuperKey')).toHaveText('E');
    await expect(page.locator('#abGadgetKey')).toHaveText('F');
    await expect(page.locator('#abSwapKey')).toHaveText('R');
    await expect(page.locator('#abSwapName')).toHaveText('Stormline');
    const cl = await box(page, '#abilities');
    expect(overlap(cl, await box(page, '#creditGame'))).toBe(false);
    expect(overlap(cl, await box(page, '#feed'))).toBe(false);
    expect(cl.x).toBeGreaterThan(200); // (minimap + emote button sit top-left)
    expect(cl.y).toBeGreaterThan(450);

    // clicking SWAP swaps and never fires
    const am0 = await G(page, () => window.__hunt.me.am);
    await page.locator('#abSwap').click();
    await page.waitForFunction(() => window.__hunt.me.ws === 1);
    await expect(page.locator('#abSwap')).toHaveClass(/on/);
    await expect(page.locator('#abSwapName')).toHaveText('Volt');
    expect(await G(page, () => window.__hunt.me.am)).toBe(am0);
    const w2am = await G(page, () => window.__hunt.me.w2[1]);
    // clicking GADGET uses it and never fires
    const gu0 = await G(page, () => window.__hunt.me.gu);
    await page.locator('#abGadget').click();
    await page.waitForFunction((g) => window.__hunt.me.gu === g - 1, gu0);
    await page.waitForTimeout(300);
    expect(await G(page, () => window.__hunt.me.w2[1])).toBe(w2am);

    // SUPER: charge ring, then READY
    await holdSc(page, 0.5);
    await expect(page.locator('#abSuperState')).toHaveText('50%');
    await expect(page.locator('#abSuper')).not.toHaveClass(/ready/);
    await holdSc(page, 1);
    await expect(page.locator('#abSuper')).toHaveClass(/ready/);
    await expect(page.locator('#abSuperState')).toHaveText('READY');
    expect(errors).toEqual([]);
  });

  test('the super-ready ring is drawn around you whichever weapon is out', async ({ page }) => {
    await page.goto('/?world=meadow&mode=range&wpn=stormline');
    await waitMe(page);
    await page.waitForFunction(() => window.__hunt.me.w2);
    // count strokes of the super ring (gold, 4px) and where they are, frame by frame
    await G(page, () => {
      const P = CanvasRenderingContext2D.prototype, arc = P.arc, stroke = P.stroke;
      window.__ring = [];
      P.arc = function (x, y, r, ...a) { this.__arc = [x, y, r]; return arc.call(this, x, y, r, ...a); };
      P.stroke = function (...a) {
        if (this.strokeStyle === 'rgba(255, 210, 63, 0.85)' && this.lineWidth === 4 && this.__arc) {
          const m = this.getTransform(), [x, y] = this.__arc;
          window.__ring.push([m.a * x + m.e, m.d * y + m.f]);
        }
        return stroke.apply(this, a);
      };
    });
    const ringAt = async (sc, want) => {
      await holdSc(page, sc);
      await page.waitForTimeout(150);
      await G(page, () => { window.__ring = []; });
      if (want) await page.waitForFunction(() => window.__ring.length > 0, null, { timeout: 5000 }).catch(() => {});
      else await page.waitForTimeout(400);
      return G(page, () => window.__ring);
    };
    for (const slot of [0, 1]) {
      if (slot) { await page.keyboard.press('r'); await page.waitForFunction(() => window.__hunt.me.ws === 1); }
      const pts = await ringAt(1, true);
      expect(pts.length, `ring drawn while holding slot ${slot}`).toBeGreaterThan(0);
      const vp = page.viewportSize(), dpr = await G(page, () => window.__huntPerf().dpr);
      const [x, y] = pts[pts.length - 1];
      expect(Math.abs(x / dpr - vp.width / 2)).toBeLessThan(60); // around your hunter (screen centre), not off-screen
      expect(Math.abs(y / dpr - vp.height / 2)).toBeLessThan(60);
    }
    expect((await ringAt(0.4, false)).length).toBe(0);
  });

  test('touch screens get the canvas controls, not the desktop buttons', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto('/?world=meadow&mode=range&wpn=stormline&pw=7&gd=volt_jolt');
    await waitMe(page);
    await page.waitForTimeout(500);
    await expect(page.locator('#abilities')).toBeHidden();
    await ctx.close();
  });
});

test.describe('Reduce Flashing', () => {
  test.use({ reducedMotion: 'reduce' });
  test('unlock cards on the results screen are visible with animations off', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?world=meadow&mode=bounty');
    await waitMe(page);
    expect(await page.evaluate(() => document.body.classList.contains('reduce-flash'))).toBe(true);
    await page.evaluate(() => {
      const G = window.__hunt;
      window.__huntMsg({ t: 'progress', delta: 5, xp: 30, coins: 9, progress: { xp: 130, trophies: {}, owned: [], equipped: {} },
        levels: [{ level: 6, coins: 50, weapons: ['ratchet'] }], mastery: [{ id: 'stormline', level: 3 }], wxp: [{ id: 'stormline', xp0: 0, xp1: 40 }] });
      window.__huntMsg({ t: 'end', mode: 'bounty', rank: 1, kills: 1, bounty: 3, winner: 'Me', results: [['Me', 'volt', 1, 1, 0, G.myId, 3, 3]] });
    });
    await expect(page.locator('#rsUps .ucard')).toHaveCount(3, { timeout: 8000 });
    await page.waitForTimeout(2500); // (longer than the last card's reveal delay)
    const op = await page.locator('#rsUps .ucard').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    expect(op).toEqual(['1', '1', '1']);
    for (const c of await page.locator('#rsUps .ucard').all()) await expect(c).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('the event banner only touches the DOM when its text changes', async ({ page }) => {
  await page.goto('/?world=meadow&mode=bounty&ev=wildfire&events=1');
  await waitMe(page);
  await page.evaluate(() => window.__huntMsg({ t: 'ev', id: 'wildfire', ph: 'warn', tl: 5, p: { burn: [] } }));
  await page.waitForFunction(() => !document.getElementById('evBanner').hidden && performance.now() > window.__hunt.bannerUntil, null, { timeout: 10000 });
  const n = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const mo = new MutationObserver((l) => { n += l.length; });
    mo.observe(document.getElementById('evBanner'), { subtree: true, childList: true, characterData: true, attributes: true });
    setTimeout(() => { mo.disconnect(); res(n); }, 2000);
  }));
  expect(n).toBeLessThan(12); // (the countdown changes once a second; it used to be rewritten every frame)
});

test('shots do not pile up while frames are paused (hidden tab)', async ({ page }) => {
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; }); // what a background tab does
  await page.waitForTimeout(12000);
  const n = await page.evaluate(() => window.__hunt.shots.live.size);
  expect(n).toBeLessThan(60);
});

test.describe('Free Play map and hub', () => {
  test.use({ viewport: { width: 844, height: 340 } });
  test('the full map follows a height-only resize (phone toolbar)', async ({ page }) => {
    await page.goto('/?free=1');
    await waitMe(page);
    await page.evaluate(() => window.__huntMap.open());
    const size = () => page.evaluate(() => { const c = document.getElementById('fullmap'); return [c.width, c.height, Math.min(2, devicePixelRatio)]; });
    let [w, h, d] = await size();
    expect([w, h]).toEqual([844 * d, 340 * d]);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await size()).slice(0, 2), { timeout: 2000 }).toEqual([844 * d, 390 * d]);
  });

  test('world map: zone names and hunter counts are drawn over the icons', async ({ page }) => {
    await page.goto('/?free=1');
    await waitMe(page);
    await page.evaluate(() => {
      const P = CanvasRenderingContext2D.prototype, fill = P.fill, fillText = P.fillText;
      window.__ops = [];
      P.fill = function (...a) { if (this.canvas.id === 'fullmap') window.__ops.push('fill'); return fill.apply(this, a); };
      P.fillText = function (t, ...a) { if (this.canvas.id === 'fullmap') window.__ops.push('text:' + t); return fillText.call(this, t, ...a); };
      window.__huntMap.open();
    });
    const ops = await page.evaluate(() => window.__ops.slice());
    const firstLabel = ops.findIndex((o) => o === 'text:RUINED CITADEL' || o === 'text:THE HUB');
    const you = ops.indexOf('text:YOU');
    expect(firstLabel).toBeGreaterThan(0);
    expect(ops.slice(0, firstLabel).filter((o) => o === 'fill').length).toBeGreaterThan(5); // the icons came first
    expect(ops.slice(firstLabel, you).filter((o) => o === 'fill').length).toBeLessThanOrEqual(3); // (only your own dot, and the Marked skull)
  });
});

for (const vp of [{ width: 667, height: 375, touch: true }, { width: 932, height: 430, touch: true }, { width: 1180, height: 820, touch: true }, { width: 1440, height: 900, touch: false }]) {
  test(`hub panel at ${vp.width}x${vp.height}: clear of the move stick side, the event banner and the credit`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await ctx.newPage();
    await page.goto('/?free=1');
    await waitMe(page);
    await expect(page.locator('#hubPanel')).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => window.__huntMsg({ t: 'ev', id: 'wildfire', ph: 'warn', tl: 5, p: { burn: [] } }));
    await page.waitForFunction(() => !document.getElementById('evBanner').hidden && performance.now() > window.__hunt.bannerUntil, null, { timeout: 10000 });
    const hub = await box(page, '#hubPanel');
    expect(overlap(hub, await box(page, '#evBanner'))).toBe(false);
    expect(overlap(hub, await box(page, '#creditGame'))).toBe(false);
    expect(overlap(hub, await box(page, '#menuBtn'))).toBe(false);
    expect(hub.x).toBeGreaterThan(vp.width * 0.45); // (touches left of 0.45 W start the move stick)
    expect(hub.y + hub.height).toBeLessThanOrEqual(vp.height);
    await ctx.close();
  });
}
