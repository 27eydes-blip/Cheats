// The space lobby sky: never a black screen. Before the sky images arrive the canvas shows the
// painted navy sky; once they load the lobby shows the nebula and planet. Phones get only the
// phone-size images; a big screen upgrades to the large set. Low Graphics shows one still image.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

// mean colour of the sky canvas plus how much of it is colourful (the nebula) and how much is
// pure black (a blank canvas)
const sample = (page) => page.evaluate(() => {
  const c = document.getElementById('spBg'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let r = 0, gg = 0, b = 0, n = 0, colour = 0, black = 0;
  for (let i = 0; i < d.length; i += 4 * 37) {
    r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) colour++;
    if (d[i] + d[i + 1] + d[i + 2] === 0) black++;
  }
  return { r: r / n, g: gg / n, b: b / n, colour: colour / n, black: black / n, ready: window.__spaceLobby.bg.ready };
});

test('space sky: painted sky before the images load, nebula + planet after; phones load only the phone set', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = trackErrors(page);
  const asked = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/ui/space/sky/*.webp', async (route) => { asked.push(route.request().url().split('/').pop()); await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' }); // (the load event would wait for the held images)
  await page.waitForFunction(() => window.__spaceLobby);
  await page.waitForTimeout(500);
  const before = await sample(page);
  expect(before.ready).toBe(false);
  expect(before.black, 'no black canvas while the images load').toBeLessThan(0.01);
  expect(before.b, 'the painted navy sky shows').toBeGreaterThan(12);
  expect(before.b).toBeGreaterThan(before.r);
  release();
  await page.waitForFunction(() => window.__spaceLobby.bg.ready && window.__spaceLobby.bg.fade >= 1, null, { timeout: 15_000 });
  await page.waitForTimeout(200);
  const after = await sample(page);
  expect(after.black).toBeLessThan(0.01);
  expect(after.colour, 'the nebula and planet show').toBeGreaterThan(before.colour + 0.03);
  // deep space stays dark so the panels stand out
  expect((after.r + after.g + after.b) / 3).toBeLessThan(70);
  expect(asked.sort()).toEqual(['planet-s.webp', 'sky-l-s.webp']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('space sky: a large screen upgrades to the large set; portrait uses the portrait sky', async ({ browser }) => {
  // iPad landscape at 2x: phone set first (fast), then the large set; a portrait phone: the portrait phone set only
  for (const [w, h, sky, want] of [[1180, 820, 'sky-l-l', ['planet-l.webp', 'planet-s.webp', 'sky-l-l.webp', 'sky-l-s.webp']], [390, 844, 'sky-p-s', ['planet-s.webp', 'sky-p-s.webp']]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const asked = new Set();
    page.on('request', (r) => { if (r.url().includes('/ui/space/sky/')) asked.add(r.url().split('/').pop()); });
    await page.goto('/');
    await page.waitForFunction((n) => window.__spaceLobby && window.__spaceLobby.bg.ready && window.__spaceLobby.bg.src.includes(n + '.webp'), sky, { timeout: 15_000 });
    expect([...asked].sort()).toEqual(want);
    await ctx.close();
  }
});

test('space sky: Low Graphics is one still image with the art in it; Reduce Flashing is still too', async ({ browser }) => {
  for (const key of ['lowGfx', 'reduceFlash']) {
    const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate((k) => import('/settings.js').then((m) => m.setSetting(k, true)), key);
    await page.reload();
    await page.waitForFunction(() => window.__spaceLobby && window.__spaceLobby.bg.ready, null, { timeout: 15_000 });
    await page.waitForTimeout(600);
    const s = await sample(page);
    const bg = await page.evaluate(() => ({ still: window.__spaceLobby.bg.still, frames: window.__spaceLobby.bg.frames }));
    expect(bg).toEqual({ still: true, frames: 0 });
    expect(s.black).toBeLessThan(0.01);
    expect(s.colour, `${key}: the sky art is in the still frame`).toBeGreaterThan(0.03);
    await ctx.close();
  }
});
