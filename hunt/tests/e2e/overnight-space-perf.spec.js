// Space lobby frame rate on an iPhone SE-sized screen (667x375 at 2x) with every piece running:
// the animated sky (nebula, parallax stars, planet, shooting stars), the hologram pad with the car,
// the scrolling ticker, the carousel, crew pods, radar and orbit; main thread throttled 4x (CDP).
// Same method and tolerance as race-perf.spec.js (GPU raster via SwiftShader so the throttle hits
// what a phone's CPU does; the median frame must make the 60 Hz vsync).
import { test, expect, chromium } from '@playwright/test';

const GPU_RASTER = ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

test('space lobby: 60 fps at 667x375 with 4x CPU throttle', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling');
  test.setTimeout(120_000);
  const browser = await chromium.launch({ args: GPU_RASTER });
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
  expect(row.meanFps).toBeGreaterThanOrEqual(42);
  await browser.close();
});
