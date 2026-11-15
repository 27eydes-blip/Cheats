// Results: the crown banner and the results list agree on who won.
import { test, expect } from '@playwright/test';
import { waitMe } from './helpers.js';

test('Bounty Rush results: the crown banner names the hunter the list ranks first', async ({ page }) => {
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.evaluate(() => {
    const G = window.__hunt;
    // Kestrel earned the most over the match but ended on 0; Pepper holds the most at the end and wins
    window.__huntMsg({ t: 'end', mode: 'bounty', rank: 3, kills: 2, bounty: 6, winner: 'Pepper', results: [
      ['Pepper', 'volt', 1, 12, 1, 91, 40, 35], ['Moss', 'brick', 2, 6, 1, 92, 30, 20], ['Me', G.brawler, 3, 2, 0, G.myId, 6, 4], ['Kestrel', 'wisp', 4, 5, 1, 93, 62, 0]] });
  });
  await expect(page.locator('.res')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#mvp')).toHaveText('👑 WINNER Pepper 35 ★');
  await expect(page.locator('#results li').first()).toContainText('Pepper');
  await expect(page.locator('#results li').first()).toContainText('35 ★');
  await expect(page.locator('#mvp')).not.toContainText('Kestrel');
});

test('Showdown results: the banner says what it measures (most bounty earned)', async ({ page }) => {
  await page.goto('/?world=meadow&mode=showdown');
  await waitMe(page);
  await page.evaluate(() => {
    const G = window.__hunt;
    window.__huntMsg({ t: 'end', mode: 'showdown', rank: 1, kills: 2, bounty: 3, winner: 'Me', results: [['Me', G.brawler, 1, 2, 0, G.myId, 3, 0], ['Rex', 'brick', 2, 5, 1, 95, 12, 0]] });
  });
  await expect(page.locator('#mvp')).toHaveText('👑 MOST BOUNTY EARNED Rex ★12', { timeout: 5000 });
});
