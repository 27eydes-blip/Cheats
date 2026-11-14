import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test('lobby renders with credit, brawlers and settings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#credit')).toHaveText('Created by Sam Eyde III');
  await expect(page.locator('.card')).toHaveCount(await page.evaluate(() => document.querySelectorAll('.card').length));
  expect(await page.locator('.card').count()).toBeGreaterThanOrEqual(3);
  await page.check('#setFlash'); await page.check('#setLow');
  await page.reload();
  await expect(page.locator('#setFlash')).toBeChecked();
  await expect(page.locator('#setLow')).toBeChecked();
  expect(await page.evaluate(() => document.body.classList.contains('reduce-flash'))).toBe(true);
  expect(errors).toEqual([]);
});
