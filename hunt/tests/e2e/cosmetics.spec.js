import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('locker + pass: buy and equip a title with test coins, shows in match roster', async ({ page }) => {
  const errors = trackErrors(page);
  page.on('dialog', (d) => d.dismiss());
  await page.goto('/');
  await page.waitForSelector('#rail_locker');
  await expect(page.locator('#tbCoins')).toContainText('TEST');
  await page.click('#rail_locker');
  await page.click('.lsec[data-open="titles"]');
  await page.click('#lkTabs [data-t="titles"]');
  // Trophy Road titles are earned, not sold: the shop shows where to get them
  await expect(page.locator('.ped[data-k="tracker"] [data-buy]')).toHaveCount(0);
  await expect(page.locator('.ped[data-k="tracker"]')).toContainText('TROPHY ROAD 200');
  await page.click('.ped[data-k="sharpshooter"] [data-buy]');
  await page.click('.ped[data-k="sharpshooter"] [data-eq]');
  await expect(page.locator('.ped.on')).toContainText('Sharpshooter');
  await page.click('.ui-screen .back');
  await page.click('#rail_pass');
  await expect(page.locator('.track .tier')).toHaveCount(30);
  await expect(page.locator('.pass-wrap')).toContainText('test currency');
  await page.click('.ui-screen .back');
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.waitForFunction(() => window.__hunt.roster[window.__hunt.myId]?.[3]?.title === 'sharpshooter', null, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
