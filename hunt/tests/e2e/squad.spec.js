import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';
test('Squad Hunt: 3v3 with teammates on radar and team pots in HUD', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=squad');
  await waitMe(page);
  await page.waitForFunction(() => (window.__hunt.mates || []).length === 2);
  expect(await page.evaluate(() => window.__hunt.me.tm)).toBeGreaterThan(0);
  await expect(page.locator('#potPill')).toBeVisible();
  expect(errors).toEqual([]);
});
