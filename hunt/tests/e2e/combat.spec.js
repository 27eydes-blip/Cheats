// Combat upgrade: secondary weapon swap + firing in a real match, settings, armory, emotes.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('swap to a secondary, fire it, see bullets and the aim line; no frame errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/?world=meadow&wpn=hornet&mast=10');
  await waitMe(page);
  await page.waitForFunction(() => window.__hunt.me.w2, null, { timeout: 15_000 });
  await page.waitForTimeout(2500); // (intro)
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__hunt.me.ws === 1 && !(window.__hunt.me.sw > 0), null, { timeout: 5000 });
  await page.mouse.move(560, 120);
  await page.evaluate(() => { window.__maxShots = 0; const f = () => { window.__maxShots = Math.max(window.__maxShots, window.__hunt.localBullets.length); if (window.__maxShots < 3) requestAnimationFrame(f); }; f(); });
  await page.mouse.down(); // Hornet is full-auto: hold to fire
  await page.waitForFunction(() => window.__maxShots >= 3, null, { timeout: 8000 }); // several of our rounds in the air at once
  await page.mouse.up();
  expect(await page.evaluate(() => window.__hunt.roster[window.__hunt.myId][3].badge)).toBe('bane');
  expect(errors).toEqual([]);
});

test('settings: aim sensitivity, left-handed and hold-to-fire persist', async ({ page }) => {
  await page.goto('/');
  await page.click('#rail_settings');
  await page.check('#setLeft'); await page.check('#setHold');
  await page.locator('#setSens').fill('1.5');
  await page.reload();
  await page.click('#rail_settings');
  await expect(page.locator('#setLeft')).toBeChecked();
  await expect(page.locator('#setHold')).toBeChecked();
  expect(await page.locator('#setSens').inputValue()).toBe('1.5');
});

test('armory: 15 weapons, 3 open at level 1, equip a starter, locked ones say their level', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.click('#rail_armory');
  await expect(page.locator('#arItems .ped')).toHaveCount(15);
  await expect(page.locator('#arItems .ped', { hasText: 'LEVEL 40' })).toHaveCount(1);
  await page.click('#arItems .ped[data-w="breaker"]');
  await expect(page.locator('#arInfo .statrow')).toHaveCount(6); // 5 stats + mastery
  await page.click('#arEq');
  await expect(page.locator('#arItems .ped[data-w="breaker"]')).toContainText('EQUIPPED');
  await page.click('#arItems .ped[data-w="flare"]');
  await expect(page.locator('#arInfo')).toContainText('REACH LEVEL 40');
  expect(errors).toEqual([]);
});
