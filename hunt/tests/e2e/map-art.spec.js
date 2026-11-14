import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { WORLDS, SPAWNS, generateArena, generateWorld, spawnHasCover, WALL, TILE, applyMove, moveStats } from '../../public/shared.js';
import { Sim } from '../../src/sim.js';

const EXPECT = { meadow: 'stone', city: 'metal', forest: 'wood', desert: 'sandstone', mirage: 'sandstone', frozen: 'ice' };

test('each world loads the right wall material and builds its art', async ({ page }) => {
  const errors = trackErrors(page);
  for (const w of WORLDS) {
    await page.goto(`/?mapview=1&world=${w.key}`);
    await page.waitForFunction(() => window.__huntArt && window.__huntArt.art.stats().sprites > 0);
    const r = await page.evaluate((k) => ({ mat: window.__huntArt.artFor(k).material, st: window.__huntArt.art.stats() }), w.key);
    expect(r.mat).toBe(EXPECT[w.key]);
    expect(r.st.worlds).toContain(w.key);
  }
  expect(errors).toEqual([]);
});

test('lost canvas context rebuilds all wall art', async ({ page }) => {
  await page.goto('/?mapview=1&world=mirage');
  await page.waitForFunction(() => window.__huntArt.art.stats().sprites > 0);
  const before = await page.evaluate(() => window.__huntArt.art.stats());
  await page.evaluate(() => { const c = document.getElementById('game'); c.dispatchEvent(new Event('contextlost', { cancelable: true })); c.dispatchEvent(new Event('contextrestored')); });
  const cleared = await page.evaluate(() => window.__huntArt.art.stats());
  expect(cleared.generation).toBeGreaterThan(before.generation);
  await page.waitForFunction((n) => window.__huntArt.art.stats().sprites >= n, before.sprites);
  const after = await page.evaluate(() => window.__huntArt.art.stats());
  expect(after.builds).toBeGreaterThan(before.builds);
});

test('art memory budget: at most 4 worlds cached', async ({ page }) => {
  await page.goto('/?mapview=1&world=meadow');
  await page.waitForFunction(() => window.__huntArt.art.stats().sprites > 0);
  const worlds = await page.evaluate(async () => {
    const { generateArena } = await import('/shared.js');
    const A = window.__huntArt.art;
    const c = document.createElement('canvas').getContext('2d');
    for (const k of ['meadow', 'city', 'forest', 'desert', 'frozen', 'mirage']) { const m = generateArena(3, k); A.draw(c, m, { x0: 0, y0: 0, x1: 2000, y1: 2000 }, 0, {}); }
    return A.stats().worlds.filter((w) => w !== 'hub');
  });
  expect(worlds.length).toBeLessThanOrEqual(4);
});

test('border spikes damage (5% max HP, 1s cooldown); cover spikes do not', () => {
  const sim = new Sim({ map: generateArena(7, 'meadow'), mode: 'bounty', phase: 'play', fillBots: false, events: false });
  const p = sim.addPlayer({ name: 'P', brawler: 'brick' });
  p.x = 76; p.y = 1000; // hugging the west border
  const hp0 = p.hp; sim.tick();
  expect(hp0 - p.hp).toBe(Math.round(p.maxHp * 0.05));
  const hp1 = p.hp; for (let i = 0; i < 10; i++) sim.tick();
  expect(p.hp).toBe(hp1); // 1s cooldown: no second hit within half a second
  const sim2 = new Sim({ map: generateArena(7, 'meadow'), mode: 'bounty', phase: 'play', fillBots: false, events: false });
  const q = sim2.addPlayer({ name: 'Q', brawler: 'brick' }); q.x = 76; q.y = 1000;
  for (let i = 0; i < 40; i++) sim2.tick(); // 2s
  const dmgEvents = Math.round((q.maxHp - q.hp) / (q.maxHp * 0.05));
  expect(dmgEvents).toBeGreaterThanOrEqual(2); expect(dmgEvents).toBeLessThanOrEqual(3); // ~1 per second
  // spiked cover piece: touching it does nothing
  const m = generateArena(7, 'meadow');
  const sp = m.pieces.find((pc) => pc.spike);
  expect(sp).toBeTruthy();
  const sim3 = new Sim({ map: m, mode: 'bounty', phase: 'play', fillBots: false, events: false });
  const c = sim3.addPlayer({ name: 'C', brawler: 'brick' });
  const [cx, cy] = sp.cells[0];
  const off = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[sp.spike];
  c.x = cx * TILE + 25 + off[0] * (25 + 27); c.y = cy * TILE + 25 + off[1] * (25 + 27);
  for (let i = 0; i < 40; i++) sim3.tick();
  expect(c.hp).toBe(c.maxHp);
});

test('every spawn point has cover nearby; every wall tile has art; pieces are 25-40 per arena', () => {
  for (const w of WORLDS) for (let seed = 1; seed <= 25; seed++) {
    const m = generateArena(seed * 101, w.key);
    for (const sp of SPAWNS) expect(spawnHasCover(m, sp), `${w.key}#${seed}`).toBe(true);
    expect(m.pieces.length).toBeGreaterThanOrEqual(25); expect(m.pieces.length).toBeLessThanOrEqual(40);
    for (let i = 0; i < m.t.length; i++) if (m.t[i] === WALL) expect(m.border[i] || m.pieceAt[i] >= 0).toBeTruthy();
  }
  const wm = generateWorld();
  for (let i = 0; i < wm.t.length; i++) if (wm.t[i] === WALL) expect(wm.border[i] || wm.pieceAt[i] >= 0).toBeTruthy();
});

test('brawlers slide along cover instead of sticking on corners', () => {
  const m = generateArena(7, 'meadow');
  for (let i = 0; i < m.t.length; i++) m.t[i] = m.border[i] ? WALL : 0;
  m.t[20 * 40 + 20] = WALL; // single block at (1000..1050, 1000..1050)
  const st = moveStats('volt', 3600, 3600);
  const p = { x: 1025, y: 940, mvx: 0, mvy: 0 }; // just above the block, pushing diagonally down-right
  const xs = [];
  for (let i = 0; i < 30; i++) { applyMove(m, p, 0.7, 0.7, st.speed, st.r); xs.push(p.x); }
  expect(p.x).toBeGreaterThan(1070); // slid off the corner and kept going
  expect(xs.every((x, i) => i === 0 || x > xs[i - 1])).toBe(true);
});
