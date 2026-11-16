// Space lobby pieces on the dev preview page (ui/space/preview.html, demo data): on an iPhone SE,
// Pro Max, iPad (landscape) and a portrait phone nothing overlaps or leaves the screen, the credit
// line stays visible and uncovered; the carousel swipes, steps by arrows and keys; the ticker
// pauses for a popup; the bots switch, dock and LAUNCH respond; Low Graphics and Reduce Flashing
// take effect (still sky, no nebula, ticker steps instead of scrolling).
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const URL = '/ui/space/preview.html?music=0';
const PARTS = ['.sp-top', '.sp-ticker', '.sp-pad', '.sp-carousel', '.sp-crew', '.sp-launch', '.sp-dock'];
const VIEWS = [['iphone-se', 667, 375], ['pro-max', 932, 430], ['ipad', 1180, 820], ['portrait-phone', 390, 844]];

for (const [name, width, height] of VIEWS) {
  test(`space preview layout: ${name} ${width}x${height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = trackErrors(page);
    await page.goto(URL);
    await page.waitForFunction(() => window.__space);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const res = await page.evaluate((parts) => {
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { s, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const B = parts.map(box), credit = box('.sp-cred');
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      const overlaps = [];
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (hit(B[i], B[j])) overlaps.push(B[i].s + ' x ' + B[j].s);
      const outside = B.filter((b) => b.l < -1 || b.t < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1 || b.w < 20 || b.h < 16).map((b) => b.s);
      const onCredit = B.filter((b) => hit(b, credit)).map((b) => b.s);
      // the centred card is wholly inside the carousel, and bigger than its neighbours
      const on = document.querySelector('.sp-card.on').getBoundingClientRect(), side = document.querySelector('.sp-card:not(.on)').getBoundingClientRect(), car = box('.sp-carousel');
      const cardIn = on.left >= car.l - 1 && on.right <= car.r + 1 && on.top >= car.t - 1 && on.bottom <= car.b + 1;
      // the five dock orbs are on screen and at least thumb-sized
      const orbs = [...document.querySelectorAll('.sp-orb-ball')].map((o) => o.getBoundingClientRect()).filter((r) => r.width >= 28 && r.bottom <= innerHeight && r.top >= 0).length;
      const cs = getComputedStyle(document.querySelector('.sp-cred'));
      return { overlaps, outside, onCredit, cardIn, bigger: on.width > side.width, orbs, credit: { text: document.querySelector('.sp-cred').textContent, w: credit.w, in: credit.l >= 0 && credit.b <= innerHeight, op: Number(cs.opacity), vis: cs.visibility, z: Number(cs.zIndex) } };
    }, PARTS);
    expect(res.overlaps, 'no two pieces overlap').toEqual([]);
    expect(res.outside, 'every piece fully on screen').toEqual([]);
    expect(res.onCredit, 'nothing covers the credit line').toEqual([]);
    expect(res.cardIn).toBe(true);
    expect(res.bigger).toBe(true);
    expect(res.orbs).toBe(5);
    expect(res.credit.text).toBe('Made by Gleyde Technologies');
    expect(res.credit.w).toBeGreaterThan(50);
    expect(res.credit.in && res.credit.op >= 0.9 && res.credit.vis === 'visible' && res.credit.z >= 50).toBe(true);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('space preview: carousel, ticker pause, bots switch, dock, launch', async ({ page }) => {
  const errs = trackErrors(page);
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto(URL);
  await page.waitForFunction(() => window.__space);
  const idx = () => page.evaluate(() => window.__space.carousel.index());
  // arrows
  await expect(page.locator('.sp-car-arrow.prev')).toBeDisabled();
  await page.click('.sp-car-arrow.next');
  expect(await idx()).toBe(1);
  await expect(page.locator('.sp-card.on')).toHaveAttribute('data-id', 'elim');
  // keyboard
  await page.focus('.sp-car-view');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await idx()).toBe(3);
  await page.keyboard.press('ArrowRight');
  expect(await idx()).toBe(3);
  await expect(page.locator('.sp-car-arrow.next')).toBeDisabled();
  await page.keyboard.press('Home');
  expect(await idx()).toBe(0);
  // swipe with a pointer drag (left = next), and a short drag snaps back
  const v = await page.locator('.sp-car-view').boundingBox();
  const drag = async (dx) => { await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(v.x + v.width / 2 + (dx * i) / 8, v.y + v.height / 2); await page.mouse.up(); };
  await drag(-140);
  expect(await idx()).toBe(1);
  await page.waitForTimeout(500);
  await drag(-10);
  expect(await idx()).toBe(1);
  await page.waitForTimeout(500);
  await drag(140);
  expect(await idx()).toBe(0);
  // tapping a side card centres it
  await page.waitForTimeout(500);
  await page.click('.sp-card[data-id="elim"]', { position: { x: 30, y: 30 } });
  expect(await idx()).toBe(1);

  // ticker: real-format items scroll; a popup pauses it, closing resumes
  await expect(page.locator('.sp-ticker')).toBeVisible();
  const items = await page.evaluate(() => window.__space.ticker.items().map((i) => i.id));
  expect(items).toEqual(['online', 'top', 'shop', 'rec-frozen']);
  const play = () => page.evaluate(() => getComputedStyle(document.querySelector('.sp-tk-strip')).animationPlayState);
  expect(await play()).toBe('running');
  await page.click('#gear');
  await expect(page.locator('#pop')).toBeVisible();
  expect(await play()).toBe('paused');
  expect(await page.evaluate(() => window.__space.ticker.paused())).toBe(true);
  await page.click('#popClose');
  expect(await play()).toBe('running');
  // stacked pause reasons: still paused until every reason is gone
  await page.evaluate(() => { const t = window.__space.ticker; t.pause('a'); t.pause('b'); t.resume('a'); });
  expect(await play()).toBe('paused');
  await page.evaluate(() => window.__space.ticker.resume('b'));
  expect(await play()).toBe('running');

  // FILL WITH BOTS switch
  const sw = page.locator('.sp-switch');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(sw).toContainText('FILL WITH BOTS');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');

  // dock: the garage orb sweeps over and changes the active orb (and here the car)
  await page.click('.sp-orb[data-k="garage"]');
  await expect(page.locator('.sp-orb[data-k="garage"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.sp-pad-title b')).toHaveText('BRICK');
  await page.focus('.sp-orb[data-k="garage"]');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement.dataset.k)).toBe('race');

  // LAUNCH: burst on the button and the pad
  await page.click('.sp-launch');
  await expect(page.locator('.sp-launch-burst')).toHaveClass(/go/);
  expect(errs).toEqual([]);
});

test('space preview: Low Graphics and Reduce Flashing', async ({ page }) => {
  const errs = trackErrors(page);
  await page.setViewportSize({ width: 667, height: 375 });
  // normal: the sky animates
  await page.goto(URL);
  await page.waitForFunction(() => window.__space);
  await page.waitForFunction(() => window.__space.bg.frames > 5, null, { timeout: 15_000 }); // (WebKit headless can be slow to start painting)
  let s = await page.evaluate(() => ({ still: window.__space.bg.still, neb: !!window.__space.bg.neb, frames: window.__space.bg.frames, step: document.querySelector('.sp-ticker').classList.contains('step') }));
  expect(s.still).toBe(false);
  expect(s.neb).toBe(true);
  expect(s.frames).toBeGreaterThan(5);
  expect(s.step).toBe(false);
  // Low Graphics: no nebula, no motion, the ticker steps instead of scrolling
  await page.goto(URL + '&low=1');
  await page.waitForFunction(() => window.__space);
  await page.waitForTimeout(600);
  s = await page.evaluate(() => ({ still: window.__space.bg.still, neb: !!window.__space.bg.neb, frames: window.__space.bg.frames, step: document.querySelector('.sp-ticker').classList.contains('step'), low: document.getElementById('sp').classList.contains('sp-low') }));
  expect(s).toEqual({ still: true, neb: false, frames: 0, step: true, low: true });
  // Reduce Flashing: still sky (nebula kept), steady glows, ticker steps
  await page.goto(URL + '&calm=1');
  await page.waitForFunction(() => window.__space);
  await page.waitForTimeout(600);
  s = await page.evaluate(() => ({ still: window.__space.bg.still, neb: !!window.__space.bg.neb, frames: window.__space.bg.frames, step: document.querySelector('.sp-ticker').classList.contains('step'),
    flicker: getComputedStyle(document.querySelector('.sp-flicker')).animationName, sweep: getComputedStyle(document.querySelector('.sp-radar-sweep')).animationName }));
  expect(s).toEqual({ still: true, neb: true, frames: 0, step: true, flicker: 'none', sweep: 'none' });
  // switching live from the popup works both ways
  await page.click('#gear');
  await page.click('#popCalm');
  expect(await page.evaluate(() => window.__space.bg.still)).toBe(false);
  expect(errs).toEqual([]);
});

test('space feed endpoint answers with honest data', async ({ request }) => {
  const r = await request.get('/api/space/feed');
  expect(r.ok()).toBe(true);
  const f = await r.json();
  expect(typeof f.online === 'number' || f.online === null).toBe(true);
  expect(Array.isArray(f.records)).toBe(true);
  const g = await (await request.post('/api/guest')).json();
  const p = await request.post('/api/space/ping', { headers: { authorization: 'Bearer ' + g.token } });
  expect((await p.json()).online).toBeGreaterThanOrEqual(1);
  expect((await request.post('/api/space/ping')).status()).toBe(401);
});

test('space preview: ambient track starts on the first tap and ducks under a popup; chimes play', async ({ page, browserName }) => {
  const errs = trackErrors(page);
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto('/ui/space/preview.html');
  await page.waitForFunction(() => window.__space);
  expect(await page.evaluate(() => window.__space.ambient.playing())).toBe(false);
  await page.mouse.click(300, 250); // empty sky
  await page.waitForFunction(() => window.__space.ambient.playing());
  await page.waitForTimeout(2600); // the fade-in
  // the measured level reads AudioParam values under automation, which only Chromium reports live;
  // sounds need a running audio context (headless Firefox keeps it suspended: no audio device)
  const running = (await page.evaluate(() => window.__space.ambient.state())) === 'running';
  const measure = browserName === 'chromium' && running;
  const full = await page.evaluate(() => window.__space.ambient.level());
  if (measure) expect(full).toBeGreaterThan(0.05);
  await page.click('#gear');
  expect(await page.evaluate(() => window.__space.ambient.ducked())).toBe(true);
  await page.waitForTimeout(800);
  if (measure) expect(await page.evaluate(() => window.__space.ambient.level())).toBeLessThan(full * 0.5);
  await page.click('#popClose');
  expect(await page.evaluate(() => window.__space.ambient.ducked())).toBe(false);
  await page.waitForTimeout(200); // (closing just played 'back')
  if (running) expect(await page.evaluate(() => ['tap', 'select', 'back', 'swipe', 'on', 'off', 'ready', 'launch', 'error'].map((id) => window.__space.chime(id)))).toEqual(Array(9).fill(true));
  if (running) expect(await page.evaluate(() => window.__space.chime('tap')), 'a double tap never doubles the sound').toBe(false);
  expect(errs).toEqual([]);
});
