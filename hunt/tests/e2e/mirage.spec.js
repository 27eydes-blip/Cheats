import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('Desert Mirage: listed in display order, saves keyed by stable ids', async ({ page }) => {
  await page.goto('/');
  // an old save from before Mirage existed (keys = world ids 0..4)
  await page.evaluate(() => localStorage.setItem('hunt', JSON.stringify({ name: 'Old', stats: { 2: { games: 4, kills: 9 }, 4: { games: 1, best: 6 } } })));
  await page.reload();
  await page.click('#profileCard .pname');
  const rows = await page.locator('.stat-table tr td:first-child').allTextContents();
  expect(rows.indexOf('Desert Mirage')).toBe(rows.indexOf('Wildwood') + 1);
  expect(rows.indexOf('Frozen Lake')).toBeGreaterThan(rows.indexOf('Desert Mirage'));
  const forest = await page.locator('.stat-table tr', { hasText: 'Wildwood' }).locator('td').allTextContents();
  expect(forest[1]).toBe('4'); expect(forest[3]).toBe('9');
  await expect(page.locator('#name')).toHaveValue('Old');
});

test('Desert Mirage: hazards render in mirage palette with forced event', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=mirage&mode=bounty&ev=lava');
  await waitMe(page);
  await page.waitForFunction(() => [...window.__hunt.conns.values()].some((c) => c.ev && c.ev.id === 'lava'), null, { timeout: 20_000 });
  expect(errors).toEqual([]);
});
