// ELIMINATION frame rate: the black hole on screen (its cached sprites turning), the danger outline and
// ring, the dark edges and the warning pulse, 10 cars racing with weapons, at 667x375 2x with the main
// thread throttled 4x (same setup and the same bar as race-perf.spec.js: median >= 55 fps; mean >= 42
// locally, 95th-percentile frame under CI_SLOW_RUNNER=1; see that file for why).
import { test, expect, chromium } from '@playwright/test';
import { roomCode, waitPhase } from './race-helpers.js';

const SLOW_RUNNER = process.env.CI_SLOW_RUNNER === '1';
const GPU_RASTER = ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

test('Elimination at 60 fps with the black hole on screen (667x375, 4x CPU throttle)', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling');
  test.setTimeout(180_000);
  // a fresh browser per track: closing a race page makes the software GPU process tear down its
  // canvases for a minute or more, and a new page in the same browser waits for that (it ran the
  // test out of time); a new browser starts at once and the old one is fully gone before we measure
  let browser = null;
  const rows = [];
  try {
    for (const track of ['desert', 'neon']) {
      browser = await chromium.launch({ args: GPU_RASTER });
      const ctx = await browser.newContext({ baseURL, viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await page.addInitScript(() => { try { localStorage.setItem('hunt-race-steered', '1'); localStorage.setItem('hunt-race-tut', '1'); } catch {} });
      await page.goto('/?' + new URLSearchParams({ race: '1', room: roomCode('Q'), bots: '1', track, mode: 'elim', lobby: '1.5' }));
      await waitPhase(page, 'race', 60_000);
      await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 0, null, { polling: 200 });
      await page.evaluate(() => window.__race.auto(true, { fire: 1, every: 1.2 }));
      // keep the black hole just behind us the whole time (it is re-placed every 1.5 s; we pull away from it)
      await page.evaluate(() => { window.__holeT = setInterval(() => { const r = window.__race; if (r.rc.me && !r.rc.me.out) r.rc.send({ t: 'dev', k: 'hole', gap: 480 }); }, 1500); });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.__race.resetPerf());
      const t0 = Date.now();
      let near = 0;
      for (let i = 0; i < 8; i++) { await page.waitForTimeout(1000); near = Math.max(near, await page.evaluate(() => window.__race.elim().near)); }
      const p = await page.evaluate(() => window.__race.perf());
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const st = await page.evaluate(() => window.__race.elim());
      const row = { track, cars: p.cars, medianFps: +p.medianFps.toFixed(1), meanFps: +(p.frames / ((Date.now() - t0) / 1000)).toFixed(1), p95Ms: +p.p95Ms.toFixed(1), dpr: p.dpr, near: +near.toFixed(2) };
      rows.push(row);
      console.log('elim fps', JSON.stringify(row));
      expect(st.out, 'still racing (the hole stayed behind)').toBe(0);
      expect(near, 'the dark edges were on').toBeGreaterThan(0.2);
      expect(row.medianFps, `${track} median fps`).toBeGreaterThanOrEqual(55);
      if (SLOW_RUNNER) expect(row.p95Ms, `${track} 95th percentile frame (ms)`).toBeLessThanOrEqual(52);
      else expect(row.meanFps, `${track} mean fps`).toBeGreaterThanOrEqual(42);
      await browser.close(); browser = null;
    }
  } finally { if (browser) await browser.close(); }
  await test.info().attach('elim-fps.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
});
