import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('locker + pass: buy and equip a title with test coins, shows in match roster', async ({ page }) => {
  const errors = trackErrors(page);
  page.on('dialog', (d) => d.dismiss());
  await page.goto('/');
  await page.waitForSelector('#lockerBtn');
  await page.click('#lockerBtn');
  await page.click('[data-tab="titles"]');
  await page.click('[data-buy="tracker"]');
  await page.click('[data-eq="title"][data-id="tracker"]');
  await expect(page.locator('.litem.on')).toContainText('Tracker');
  await expect(page.locator('.testnote')).toContainText('test currency');
  await page.click('#modalClose');
  await page.click('#passBtn');
  await expect(page.locator('.pcol')).toHaveCount(30);
  await page.click('#modalClose');
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.waitForFunction(() => window.__hunt.roster[window.__hunt.myId]?.[3]?.title === 'tracker', null, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
