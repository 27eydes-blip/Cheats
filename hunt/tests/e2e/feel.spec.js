import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('every original sound effect synthesizes without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.click('body');
  const n = await page.evaluate(async () => {
    const a = await import('/audio.js');
    a.unlockAudio();
    await new Promise((r) => setTimeout(r, 200));
    for (const id of a.SOUND_IDS) a.sfx(id, 1);
    return a.SOUND_IDS.length;
  });
  expect(n).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});

test('end screen: victory pose + Top Bounty Hunter MVP banner', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.evaluate(() => {
    const G = window.__hunt;
    window.__huntMsg({ t: 'end', mode: 'bounty', rank: 1, kills: 4, bounty: 9, winner: 'Me', results: [['Me', G.brawler, 1, 4, 0, G.myId, 9, 9], ['Rex', 'brick', 2, 2, 1, 5, 12, 3]] });
  });
  await expect(page.locator('#mvp')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#mvp')).toContainText('TOP BOUNTY HUNTER');
  await expect(page.locator('#mvp')).toContainText('Rex');
  const drawn = await page.evaluate(() => { const c = document.getElementById('pose'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  expect(drawn).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test('Reduce Flashing: no screen shake', async ({ page }) => {
  await page.goto('/');
  await page.click('#rail_settings');
  await page.check('#setFlash');
  await page.click('.ui-screen .back');
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  const s = await page.evaluate(async () => { const G = window.__hunt; G.shake = 20; await new Promise((r) => setTimeout(r, 100)); return G.shake; });
  expect(s).toBe(0);
});
