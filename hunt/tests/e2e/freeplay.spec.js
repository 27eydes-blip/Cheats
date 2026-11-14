import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';
import { generateWorld } from '../../public/shared.js';

// a spot on the road just west of the Hub/Ashlands border, with clear road ahead
const W = generateWorld();
function roadSpot() {
  for (let ty = 180; ty < 240; ty++) {
    let ok = true;
    for (let x = 255; x <= 272; x++) if (W.t[ty * W.gw + x] !== 0 || !W.road[ty * W.gw + x]) ok = false;
    if (ok) return [255 * 50 + 25, ty * 50 + 25];
  }
  throw new Error('no straight road across the c/e border');
}

test('free play: crossing a zone border is seamless (handoff, no snap)', async ({ page }) => {
  const errors = trackErrors(page);
  const [sx, sy] = roadSpot();
  await page.goto(`/?free=1&at=${sx},${sy}`);
  await waitMe(page);
  const key = 'd'; // walk east into Ashlands
  const start = await page.evaluate(() => [...window.__hunt.conns.values()].find((c) => c.primary).key);
  await page.evaluate(() => {
    const G = window.__hunt; window.__L = { maxErr: 0 };
    const f = () => { window.__L.maxErr = Math.max(window.__L.maxErr, Math.hypot(G.err.x, G.err.y)); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  // walk across the border; sidestep if a hub pillar is in the way (like a player would)
  await page.keyboard.down(key);
  let last = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ x: window.__hunt.pred.x, y: window.__hunt.pred.y, k: [...window.__hunt.conns.values()].find((c) => c.primary)?.key }));
    if (s.k && s.k !== start) break;
    if (last && Math.hypot(s.x - last.x, s.y - last.y) < 4) { const side = i % 2 ? 'w' : 's'; await page.keyboard.down(side); await page.waitForTimeout(400); await page.keyboard.up(side); }
    last = s;
  }
  await page.waitForTimeout(500);
  await page.keyboard.up(key);
  const end = await page.evaluate(() => [...window.__hunt.conns.values()].find((c) => c.primary)?.key);
  const maxErr = await page.evaluate(() => window.__L.maxErr);
  expect(end).not.toBe(start);
  expect(maxErr).toBeLessThan(25);
  expect(errors).toEqual([]);
});
