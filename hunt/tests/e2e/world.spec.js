// The big Free Play world on the client: minimap -> full map, day/night, chunked ground memory.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('tapping the minimap opens the full world map; tapping again closes it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto('/?free=1');
  await waitMe(page);
  await page.waitForTimeout(800);
  // the minimap sits top-left; tap its centre
  const R = Math.min(64, 390 * 0.15);
  await page.touchscreen.tap(12 + R, 36 + R);
  await expect(page.locator('#fullmap')).toBeVisible();
  expect(await page.evaluate(() => window.__huntMap.isOpen())).toBe(true);
  await page.touchscreen.tap(420, 200);
  await expect(page.locator('#fullmap')).toHaveCount(0);
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('play');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('night falls (darkness + Blood Moon state) on the Free Play clock', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?free=1&clock=0.7');
  await waitMe(page);
  await page.waitForTimeout(600);
  const env = await page.evaluate(() => ({ dark: window.__hunt.env.dark, night: window.__hunt.env.dn.night }));
  expect(env.night).toBe(true);
  expect(env.dark).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('ground chunks: only the ones near the camera stay in memory', async ({ page }) => {
  await page.goto('/');
  const n = await page.evaluate(async () => {
    const S = await import('/shared.js'); const R = await import('/render.js');
    const m = S.generateWorld(), c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d');
    for (let i = 0; i < 60; i++) { const x = 1000 + i * 300, y = 1000 + i * 300; R.drawGround(g, m, x - 600, y - 400, x + 600, y + 400, 0, 1); }
    return { kept: m._ground.chunks.size, max: R.MAX_CHUNKS };
  });
  expect(n.kept).toBeLessThanOrEqual(n.max);
});
