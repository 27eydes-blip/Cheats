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
  await page.keyboard.down(key); await page.waitForTimeout(3500); await page.keyboard.up(key);
  const end = await page.evaluate(() => [...window.__hunt.conns.values()].find((c) => c.primary)?.key);
  const maxErr = await page.evaluate(() => window.__L.maxErr);
  expect(end).not.toBe(start);
  expect(maxErr).toBeLessThan(25);
  expect(errors).toEqual([]);
});
