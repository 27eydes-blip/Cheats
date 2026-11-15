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
