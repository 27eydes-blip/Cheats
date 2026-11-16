// The NEW CAR UNLOCKED screen plays in the racing lobby only: an unlock that arrives while the classic
// shooter lobby (?shooter=1) or a shooter match is open waits (it is not marked as seen), and plays
// the next time the racing lobby is open.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

// the account's progress as a sync from the server would bring it (after the guest account answered)
const setProgress = async (page, patch) => {
  await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  await page.evaluate(async (patch) => {
    const A = await import('/account.js');
    A.setUser({ ...A.ACC.user, progress: { ...A.progress(), ...patch } });
  }, patch);
};
const seen = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hunt-cars-seen') || '[]'));

test('a car unlocked while the shooter is open waits for the racing lobby', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  // the classic lobby: 250 trophies unlock VOIDRUNNER, but no celebration over it
  await page.goto('/?shooter=1'); await page.waitForSelector('#playBtn');
  await setProgress(page, { trophies: { volt: 250 } });
  await page.waitForTimeout(1000);
  await expect(page.locator('.ulk')).toHaveCount(0);
  expect(await seen(page)).toEqual([]);
  await page.click('#rail_pass'); // the lobby still takes clicks
  await expect(page.locator('.ui-screen .back')).toBeVisible();
  // in a shooter match (Free Play): nothing pops over the game either
  await page.goto('/?free=1&at=12775,10025'); await waitMe(page);
  await setProgress(page, { trophies: { volt: 250 } });
  await page.waitForTimeout(1000);
  await expect(page.locator('.ulk')).toHaveCount(0);
  expect(await seen(page)).toEqual([]);
  // the racing lobby: it plays now, once, with the credit on it
  await page.goto('/'); await page.waitForSelector('#playBtn');
  await setProgress(page, { trophies: { volt: 250 } });
  const ulk = page.locator('.ulk[data-car="void"]');
  await expect(ulk).toBeVisible();
  await expect(ulk.locator('.ulk-cred')).toContainText('Created by Sam Eyde III');
  expect(await seen(page)).toEqual(['void']);
  expect(errors).toEqual([]);
});
