// Big Hunt: 20 players (bots) on a 5000x5000 arena — everyone is there and prediction stays in sync.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('Big Hunt: 20 hunters, 5000x5000 arena, client prediction stays in sync with the server', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bighunt');
  await waitMe(page);
  const info = await page.evaluate(() => ({ size: window.__hunt.map.gw * 50, players: Object.keys(window.__hunt.roster).length, layout: window.__hunt.map.layout }));
  expect(info.size).toBe(5000);
  expect(info.players).toBe(20);
  await page.evaluate(() => {
    const G = window.__hunt; window.__L = { maxErr: 0, snaps: 0, maxGap: 0, last: performance.now() };
    const f = () => { window.__L.maxErr = Math.max(window.__L.maxErr, Math.hypot(G.err.x, G.err.y)); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  // run around (with direction changes) for a few seconds
  for (const k of ['d', 's', 'a', 'w', 'd']) { await page.keyboard.down(k); await page.waitForTimeout(900); await page.keyboard.up(k); }
  const r = await page.evaluate(() => {
    const G = window.__hunt, me = G.me, c = [...G.conns.values()].find((q) => q.primary);
    return { maxErr: window.__L.maxErr, drift: Math.hypot(G.pred.x - me.x, G.pred.y - me.y), alive: me.al, snaps: c.snaps.length };
  });
  expect(r.maxErr, 'prediction correction stays small (no rubber-banding)').toBeLessThan(25);
  expect(r.drift, 'predicted position matches the server').toBeLessThan(60);
  expect(r.snaps).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
