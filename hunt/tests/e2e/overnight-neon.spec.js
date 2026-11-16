// Hunt Racers neon night look: every car is drawn from its look (signature colour, name), sprite
// caches stay flat while racing, cosmetics from the store reach the renderer, Low Graphics drops
// the light trails and Reduce Flashing keeps animated skins still. No frame errors anywhere.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { roomCode, raceUrl, waitPhase } from './race-helpers.js';

const race = async (page, o) => {
  await page.goto(raceUrl({ room: roomCode('N'), bots: '1', laps: '3', lobby: '1.5', track: 'neon', ...o }));
  await waitPhase(page, 'race', 60_000);
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 1, null, { polling: 100, timeout: 30_000 });
  await page.evaluate(() => window.__race.auto(true, {}));
};

test('10 neon cars: looks per car, flat sprite caches, light trails', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = trackErrors(page);
  await race(page, { driver: 'rook' });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const R = window.__race.session.renderer, rc = window.__race.rc, out = { cars: 0, wrong: [], looks: new Set(), trails: 0 };
    for (const [id, v] of R.vis) {
      if (!v.look) continue;
      out.cars++; out.looks.add(v.look.sprite);
      const rd = rc.roster.get(id);
      if (rd && v.look.driver !== rd.driver) out.wrong.push(id);
      if (v.ltn > 2) out.trails++;
    }
    const me = R.vis.get(rc.id).look;
    let sprites = 0; for (const arr of R.cars.map.values()) sprites += arr.filter(Boolean).length;
    return { ...out, looks: out.looks.size, me: me.name, meNeon: me.neon, keys: R.cars.map.size, sprites };
  });
  expect(r.me).toBe('COBRA');
  expect(r.meNeon).toBe('#b04dff');
  expect(r.cars).toBeGreaterThanOrEqual(6);
  expect(r.wrong).toEqual([]);
  expect(r.keys).toBeLessThanOrEqual(r.looks); // one cache entry per distinct look, never per car or per frame
  expect(r.sprites).toBeLessThanOrEqual(r.keys * 32);
  expect(r.trails).toBeGreaterThan(0); // taillight trails on by default
  // store cosmetics: a resolver turns equipped ids into a new look on the next roster change
  const skin = await page.evaluate(async () => {
    const L = await import('/race/looks.js'), rc = window.__race.rc, rd = rc.roster.get(rc.id);
    L.setCosResolver((ids) => (ids.skin === 'test' ? { skin: { neon: '#00ff88', pattern: 'flow' }, glow: { color: '#00ff88', style: 'twin' } } : null));
    rc.roster.set(rc.id, { ...rd, cos: { skin: 'test' } });
    await new Promise((res) => setTimeout(res, 400));
    const v = window.__race.session.renderer.vis.get(rc.id);
    L.setCosResolver(null);
    return { neon: v.look.neon, pattern: v.look.pattern, glow: v.look.glowStyle, name: v.look.name };
  });
  expect(skin).toEqual({ neon: '#00ff88', pattern: 'flow', glow: 'twin', name: 'COBRA' });
  // the app's look provider (renderer.lookOf): asked when a roster row changes; null = the car's own look
  const prov = await page.evaluate(async () => {
    const L = await import('/race/looks.js'), rc = window.__race.rc, R = window.__race.session.renderer, asked = [];
    R.lookOf = (id) => { asked.push(id); return id === rc.id ? L.makeLook('rook', { skin: { neon: '#ffee00' }, trail: { style: 'sparks' } }) : null; };
    rc.roster.set(rc.id, { ...rc.roster.get(rc.id) });
    await new Promise((res) => setTimeout(res, 400));
    const n = asked.length;
    await new Promise((res) => setTimeout(res, 400));
    const out = { neon: R.vis.get(rc.id).look.neon, trail: R.vis.get(rc.id).look.trail.style, cached: asked.length === n && n >= 1 };
    R.lookOf = null;
    return out;
  });
  expect(prov).toEqual({ neon: '#ffee00', trail: 'sparks', cached: true });
  await page.waitForTimeout(500);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Low Graphics drops light trails; Reduce Flashing keeps skins and glows steady', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => localStorage.setItem('hunt-settings', JSON.stringify({ lowGfx: true, reduceFlash: true })));
  const page = await ctx.newPage();
  const errs = trackErrors(page);
  await race(page, { driver: 'flicker', track: 'desert' });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const R = window.__race.session.renderer, C = await import('/race/cars.js');
    let trails = 0; for (const v of R.vis.values()) if (v.ltn > 0) trails++;
    return { trails, steady: C.patternMix(1, true) === C.patternMix(2, true) };
  });
  expect(r.trails).toBe(0);
  expect(r.steady).toBe(true);
  expect(errs).toEqual([]);
  await ctx.close();
});
