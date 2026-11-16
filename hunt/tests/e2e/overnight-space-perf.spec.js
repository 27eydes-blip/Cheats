// Space lobby frame rate on an iPhone SE-sized screen (667x375 at 2x) with every piece running:
// the animated sky (nebula, parallax stars, planet, shooting stars), the hologram pad with the car,
// the scrolling ticker, the carousel, crew pods, radar and orbit; main thread throttled 4x (CDP).
// Same method as race-perf.spec.js (GPU raster via SwiftShader so the throttle hits what a phone's
// CPU does). The bar is the MEDIAN frame making the 60 Hz vsync (>= 55 fps). The mean is printed
// and attached but not asserted: on this shared box the software GPU process competes with other
// test runs, and the mean then swings with the box's load (race-perf's own mean check misses too
// under that load), while the median holds at ~60.
import { test, expect, chromium } from '@playwright/test';

// closed after each test even when a check fails: a browser left open holds up the worker's teardown
let launched = null;
test.afterEach(async () => { await launched?.close(); launched = null; });
const GPU_RASTER = ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

test('space lobby: 60 fps at 667x375 with 4x CPU throttle', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling');
  test.setTimeout(120_000);
  const browser = (launched = await chromium.launch({ args: GPU_RASTER }));
  const ctx = await browser.newContext({ baseURL, viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto('/ui/space/preview.html?music=0');
  await page.waitForFunction(() => window.__space);
  await page.waitForTimeout(1000);
  // keep the parallax moving the whole time, and swipe the carousel once along the way
  await page.evaluate(() => { let k = 0; setInterval(() => { k += 0.05; window.__space.bg.setParallax(Math.sin(k), Math.cos(k * 0.7)); }, 50); });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__space.resetPerf());
  const t0 = Date.now();
  await page.evaluate(() => window.__space.carousel.next());
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.__space.pad.burst());
  await page.waitForTimeout(3500);
  const p = await page.evaluate(() => window.__space.perf());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const row = { medianFps: +p.medianFps.toFixed(1), meanFps: +(p.frames / ((Date.now() - t0) / 1000)).toFixed(1), p95Ms: +p.p95Ms.toFixed(1), bgFrames: p.bgFrames };
  console.log('space lobby fps', JSON.stringify(row));
  await test.info().attach('fps.json', { body: JSON.stringify(row, null, 2), contentType: 'application/json' });
  expect(p.bgFrames, 'the sky is animating').toBeGreaterThan(100);
  expect(row.medianFps).toBeGreaterThanOrEqual(55);
  await browser.close();
});

// the real racing lobby (/) with every space piece wired in, the ticker scrolling and the car on its pad
test('space lobby (the real one at /): 60 fps at 667x375 with 4x CPU throttle; Low Graphics keeps the sky still', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling');
  test.setTimeout(120_000);
  const browser = (launched = await chromium.launch({ args: GPU_RASTER }));
  const ctx = await browser.newContext({ baseURL, viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await page.waitForFunction(() => window.__spaceLobby);
  await page.waitForTimeout(1000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.__fd = []; let l = 0; const f = (t) => { if (l) window.__fd.push(t - l); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const f0 = await page.evaluate(() => window.__spaceLobby.bg.frames);
  await page.evaluate(() => window.__spaceLobby.carousel.next());
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => { const s = window.__fd.slice().sort((a, b) => a - b); return { frames: s.length, med: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], bg: window.__spaceLobby.bg.frames }; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const row = { medianFps: +(1000 / r.med).toFixed(1), meanFps: +(r.frames / 6).toFixed(1), p95Ms: +r.p95.toFixed(1), skyFrames: r.bg - f0 };
  console.log('space lobby (/) fps', JSON.stringify(row));
  await test.info().attach('fps-lobby.json', { body: JSON.stringify(row, null, 2), contentType: 'application/json' });
  expect(row.skyFrames, 'the sky is animating').toBeGreaterThan(60);
  expect(row.medianFps).toBeGreaterThanOrEqual(55);
  // Low Graphics: no nebula, no shooting stars, no parallax: the sky is one still frame
  await page.evaluate(() => import('/settings.js').then((m) => m.setSetting('lowGfx', true)));
  await page.reload();
  await page.waitForFunction(() => window.__spaceLobby);
  await page.waitForTimeout(800);
  const low = await page.evaluate(() => ({ still: window.__spaceLobby.bg.still, neb: !!window.__spaceLobby.bg.neb, frames: window.__spaceLobby.bg.frames, cls: document.getElementById('lobby').classList.contains('sp-low') }));
  expect(low).toEqual({ still: true, neb: false, frames: 0, cls: true });
  await browser.close();
});
