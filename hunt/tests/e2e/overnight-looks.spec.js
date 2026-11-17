// Oblivion GP race looks: every track draws its world's scenery with no frame errors in every
// camera; Chase draws its tilted canvas finer than the screen (it is stretched by the tilt) and
// bakes chunks and cars at the zoom it really uses; the chunk cache stays bounded; Low Graphics
// bakes the tall scenery into the chunks instead of drawing it every frame.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { roomCode, raceUrl, waitPhase } from './race-helpers.js';

const start = async (page, track, cam, extra = {}) => {
  await page.addInitScript(([c, e]) => localStorage.setItem('hunt-settings', JSON.stringify({ raceView: c, tutDone: 1, ...e })), [cam, extra]);
  await page.goto(raceUrl({ room: roomCode('V'), bots: '1', laps: '3', lobby: '1.5', track }));
  await waitPhase(page, 'race', 60_000);
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 0.5, null, { polling: 100, timeout: 30_000 });
  await page.evaluate(() => window.__race.auto(true, {}));
};

for (const track of ['desert', 'frozen', 'ashlands', 'neon', 'skyline', 'starfall']) {
  test(`${track}: neon-night scenery in Chase and Top-down, sharp Chase, no errors`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = trackErrors(page);
    await start(page, track, 'chase');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const R = window.__race.session.renderer, A = R.art, cv = R.cv;
      return { tall: A.tall.length, stands: A.flat.filter((d) => d.kind === 'stand').length, boards: A.flat.filter((d) => d.kind === 'board').length,
        cw: cv.width, css: cv.clientWidth, dpr0: R.dpr0, dpr: R.dpr, chunk: A.scale, z: R.M.s, cars: R.cars.scale, chunks: A.chunks.size, max: A.maxChunks(), cam: R.camName };
    });
    expect(r.cam).toBe('chase');
    expect(r.tall).toBeGreaterThan(10);
    expect(r.stands + r.boards).toBeGreaterThan(2);
    expect(r.dpr).toBeGreaterThan(r.dpr0 * 1.05); // the tilted canvas is drawn finer than the screen
    expect(r.cw).toBe(Math.round(r.css * r.dpr));
    expect(r.chunk).toBeGreaterThanOrEqual(Math.min(r.z, 2) * 0.85); // chunks baked at (about) the zoom they are drawn at (capped at 2 px per unit)
    expect(r.chunks).toBeLessThanOrEqual(r.max);
    // Top-down: the plain resolution again (its HUD shares the canvas)
    await page.evaluate(() => window.__race.setCamera('top'));
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => { const R = window.__race.session.renderer; return { dpr: R.dpr, dpr0: R.dpr0, cw: R.cv.width, css: R.cv.clientWidth }; });
    expect(t.dpr).toBe(t.dpr0);
    expect(t.cw).toBe(Math.round(t.css * t.dpr));
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('Low Graphics + Reduce Flashing: tall scenery baked, not drawn per frame; blasts leave a scorch', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = trackErrors(page);
  await start(page, 'neon', 'chase', { lowGfx: true, reduceFlash: true });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const R = window.__race.session.renderer, S = await import('/race/scenery.js');
    let calls = 0; const orig = R.tallLayer; R.tallLayer = function (...a) { const g = a[0], f = g.fill; g.fill = function (...b) { calls++; return f.apply(this, b); }; try { return orig.apply(this, a); } finally { g.fill = f; } };
    await new Promise((res) => setTimeout(res, 600));
    R.tallLayer = orig;
    const me = R.meCar; R.explode(me.x, me.y, 1);
    const k = R.scorchI * 4;
    return { calls, dpr: R.dpr, dpr0: R.dpr0, scorch: [R.scorch[k], R.scorch[k + 1]], me: [me.x, me.y], par: typeof S.PARALLAX };
  });
  expect(r.calls).toBe(0);
  expect(r.dpr).toBe(r.dpr0); // no extra resolution under Low Graphics
  expect(r.scorch[0]).toBeCloseTo(r.me[0], 3);
  expect(r.scorch[1]).toBeCloseTo(r.me[1], 3);
  await page.waitForTimeout(500);
  expect(errs).toEqual([]);
  await ctx.close();
});
