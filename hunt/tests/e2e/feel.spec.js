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

test('end screen: victory pose + winner banner', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.evaluate(() => {
    const G = window.__hunt;
    window.__huntMsg({ t: 'end', mode: 'bounty', rank: 1, kills: 4, bounty: 9, winner: 'Me', results: [['Me', G.brawler, 1, 4, 0, G.myId, 9, 9], ['Rex', 'brick', 2, 2, 1, 5, 12, 3]] });
  });
  await expect(page.locator('#mvp')).toBeVisible({ timeout: 5000 });
  // (the banner names whoever the list ranks #1, with the score the list shows)
  await expect(page.locator('#mvp')).toHaveText('👑 WINNER Me 9 ★');
  // the pose is painted on the next animation frame: poll for it, a slow browser may not have drawn yet
  const drawn = () => page.evaluate(() => { const c = document.getElementById('pose'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  await expect.poll(drawn, { timeout: 10_000 }).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test('Reduce Flashing: no screen shake', async ({ page }) => {
  await page.goto('/');
  await page.click('#rail_settings');
  await page.check('#setFlash');
  await page.click('.ui-screen .back');
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hunt-settings')).reduceFlash)).toBe(true);
  // Wait for real frames, not for a fixed time: a busy machine may not draw one within 100 ms.
  // The shake is far too big to fade out by itself in a frame or two (it fades at 30 a second),
  // so 0 can only mean the setting cleared it.
  const s = await page.evaluate(async () => {
    const G = window.__hunt, frame = () => new Promise((r) => requestAnimationFrame(r));
    G.shake = 5000;
    await frame(); await frame(); await frame();
    return G.shake;
  });
  expect(s).toBe(0);
});
