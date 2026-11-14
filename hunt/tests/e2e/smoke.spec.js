import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test('lobby renders with credit, brawlers and settings that persist', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#lobby #credit')).toHaveText('Created by Sam Eyde III');
  await expect(page.locator('#lobby #credit')).toBeVisible();
  await page.click('.nameplate');
  await expect(page.locator('.bcard')).toHaveCount(6);
  await page.click('.ui-screen .back');
  await page.click('#rail_settings');
  await page.check('#setFlash'); await page.check('#setLow');
  await page.reload();
  await page.click('#rail_settings');
  await expect(page.locator('#setFlash')).toBeChecked();
  await expect(page.locator('#setLow')).toBeChecked();
  expect(await page.evaluate(() => document.body.classList.contains('reduce-flash'))).toBe(true);
  expect(errors).toEqual([]);
});
