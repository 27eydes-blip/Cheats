import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('free play: crossing a zone border is seamless (handoff, no snap)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?free=1');
  await waitMe(page);
  const key = await page.evaluate(() => (window.__hunt.me.y < 2000 ? 's' : 'w'));
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
    if (last && Math.hypot(s.x - last.x, s.y - last.y) < 4) { const side = i % 2 ? 'a' : 'd'; await page.keyboard.down(side); await page.waitForTimeout(400); await page.keyboard.up(side); }
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
