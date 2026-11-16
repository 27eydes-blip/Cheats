// Race smoothness on an iPhone SE-sized screen (667x375 at 2x), the things a player sees as
// "glitchy":
//  1. frame pacing: after a warm-up, no frame takes over 100 ms in Top-down on any of the clear
//     tracks (no CPU throttle; Chromium's default rasterizer).
//  2. the other cars glide: snapshots arrive with 0-60 ms of random delay (a phone on Wi-Fi or
//     mobile data); the rivals must never be drawn moving backwards and your own car (followed by
//     the camera) must move on every frame, in Top-down and in Chase.
// The names carry "60 fps" so CI runs them in the frame-rate step, alone on the runner (see
// race-perf.spec.js); there CI_SLOW_RUNNER=1 allows the occasional stall a shared runner shows.
import { test, expect } from '@playwright/test';
import { roomCode, raceUrl, waitPhase } from './race-helpers.js';

const SLOW_RUNNER = process.env.CI_SLOW_RUNNER === '1';

// delay every incoming WebSocket message by a random 0..J ms, keeping their order (like TCP)
const JITTER = (J) => {
  const N = window.WebSocket;
  window.WebSocket = class extends N {
    addEventListener(t, fn, o) {
      if (t !== 'message') return super.addEventListener(t, fn, o);
      const q = []; let busy = false, last = 0;
      const pump = () => {
        if (!q.length) { busy = false; return; }
        busy = true;
        const w = q[0][0] - performance.now();
        if (w > 0) { setTimeout(pump, w); return; }
        fn({ data: q.shift()[1] }); pump();
      };
      return super.addEventListener(t, (e) => { last = Math.max(last, performance.now() + Math.random() * J); q.push([last, e.data]); if (!busy) pump(); }, o);
    }
  };
};

async function phoneRace(browser, baseURL, o, init) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init.fn, init.arg);
  await page.goto(raceUrl({ room: roomCode('F'), bots: '1', laps: '3', lobby: '1.5', ...o }));
  await waitPhase(page, 'race', 60_000);
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 0, null, { polling: 200 });
  return { ctx, page };
}

// record each race frame: its time, and every car's world position (own car flagged)
const RECORD = () => {
  const s = window.__race.session, R = (window.__rec = { on: false, ms: [], f: [] }), step = s.step.bind(s);
  s.step = (now, dt, ms) => {
    step(now, dt, ms);
    if (!R.on || !s.view) return;
    R.ms.push(ms);
    const cars = {};
    for (const c of s.view.cars) cars[c.id] = [c.x, c.y, c.me ? 1 : 0, c.f, c.spd];
    R.f.push({ t: now, cars });
  };
};

test('60 fps pacing: no frame over 100 ms in Top-down on every clear track (iPhone SE, no throttle)', async ({ browser, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'one engine is enough for the timing; WebKit runs the race smoke specs');
  test.setTimeout(300_000);
  const rows = [];
  for (const track of ['desert', 'frozen', 'ashlands', 'neon']) {
    const { ctx, page } = await phoneRace(browser, baseURL, { track });
    try {
      await page.evaluate(() => { window.__race.setCamera('top'); window.__race.auto(true, { fire: 1, every: 1.2 }); });
      await page.evaluate(RECORD);
      await page.waitForTimeout(2500); // warm-up: the first chunks and car sprites
      await page.evaluate(() => { window.__rec.on = true; });
      await page.waitForTimeout(8000);
      const ms = await page.evaluate(() => { window.__rec.on = false; return window.__rec.ms; });
      const s = ms.slice().sort((a, b) => a - b), q = (f) => s[Math.min(s.length - 1, Math.floor(s.length * f))];
      const row = { track, frames: ms.length, meanFps: +((1000 * ms.length) / ms.reduce((a, b) => a + b, 0)).toFixed(1), p99Ms: +q(0.99).toFixed(1), maxMs: +s[s.length - 1].toFixed(1), over100: ms.filter((x) => x > 100).length };
      rows.push(row);
      console.log('pacing', JSON.stringify(row));
      expect(row.frames, `${track}: frames recorded`).toBeGreaterThan(200);
      if (SLOW_RUNNER) expect(row.p99Ms, `${track}: 99th-percentile frame (ms)`).toBeLessThanOrEqual(52);
      else expect(row.maxMs, `${track}: longest frame (ms)`).toBeLessThanOrEqual(100);
    } finally { await ctx.close(); }
  }
  await test.info().attach('pacing.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
});

for (const cam of ['top', 'chase']) {
  test(`60 fps pacing: rivals glide and the camera moves every frame under 0-60 ms network jitter (${cam})`, async ({ browser, browserName, baseURL }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough for the timing');
    test.setTimeout(120_000);
    const { ctx, page } = await phoneRace(browser, baseURL, { track: 'desert' }, { fn: JITTER, arg: 60 });
    try {
      await page.evaluate((c) => { window.__race.setCamera(c); window.__race.auto(true); }, cam);
      await page.evaluate(RECORD);
      await page.waitForTimeout(3000);
      await page.evaluate(() => { window.__rec.on = true; });
      await page.waitForTimeout(8000);
      const F = await page.evaluate(() => { window.__rec.on = false; return window.__rec.f; });
      // rivals: frames where a moving car's step points against its previous step (drawn going
      // backwards); a real reversal (a bump, a spin, a wall) is rare and lasts one frame
      let pairs = 0, back = 0, own = 0, still = 0;
      for (let i = 2; i < F.length; i++) {
        const A = F[i - 2].cars, B = F[i - 1].cars, C = F[i].cars;
        for (const id in C) {
          const a = A[id], b = B[id], c = C[id];
          if (!a || !b || c[3] & 32 || b[3] & 32) continue; // (wrecked)
          const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
          if (Math.hypot(ux, uy) > 200 || Math.hypot(vx, vy) > 200) continue; // (respawn)
          if (c[2]) { if (c[4] > 200) { own++; if (Math.hypot(vx, vy) < 0.5) still++; } continue; }
          if (Math.hypot(ux, uy) < 1 || c[4] < 150) continue;
          pairs++;
          if (ux * vx + uy * vy < 0) back++;
        }
      }
      console.log(cam, JSON.stringify({ frames: F.length, pairs, back, own, still }));
      expect(pairs, 'rival frames seen').toBeGreaterThan(500);
      // (before the fix: ~14% of rival frames went backwards under this jitter)
      expect(back / pairs, `${cam}: rivals drawn moving backwards`).toBeLessThan(0.005);
      expect(own, 'own car frames at speed').toBeGreaterThan(200);
      // (before the fix: every other frame, the own car was drawn on the same spot)
      expect(still / own, `${cam}: own car frames without movement at speed`).toBeLessThan(0.02);
    } finally { await ctx.close(); }
  });
}
