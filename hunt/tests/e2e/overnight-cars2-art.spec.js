// Unlockable cars art (dev preview page race/cars2-preview): every view renders without errors,
// the unlock screen shows the car, rarity, buttons and the creator credit on top, Reduce Flashing
// and Low Graphics variants open, EQUIP / LATER close it.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const CREDIT = 'Created by Sam Eyde III';
const ready = (page) => page.waitForFunction(() => window.__cars2 && window.__cars2.ready, null, { timeout: 20_000 });

test.use({ viewport: { width: 844, height: 390 } });

for (const view of ['grid', 'close', 'pack', 'spin']) {
  test(`cars2 preview: ${view} renders`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/race/cars2-preview?view=${view}&car=helix`);
    await ready(page);
    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
  });
}

for (const flags of ['', '&rf=1', '&low=1']) {
  test(`unlock screen (${flags ? flags.slice(1) : 'full effects'}): car, rarity, buttons, credit`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/race/cars2-preview?view=unlock&car=prime&bar=0${flags}`);
    await ready(page);
    const u = page.locator('.ulk');
    await expect(u).toBeVisible();
    await expect(u).toHaveAttribute('data-rarity', 'legendary');
    await expect(u.locator('.ulk-name')).toHaveText('OBLIVION PRIME');
    await expect(u.locator('.ulk-tag')).toHaveText('LEGENDARY');
    if (flags === '&rf=1') await expect(u).toHaveClass(/calm/);
    const cred = u.locator('.ulk-cred');
    await expect(cred).toHaveText(CREDIT);
    await expect(page.locator('.ulk-info')).toHaveCSS('opacity', '1', { timeout: 5000 });
    // the credit is on screen, on top and readable
    const top = await cred.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { onTop: el.contains(hit), inView: r.bottom <= innerHeight && r.top >= 0, op: +getComputedStyle(el).opacity }; });
    expect(top).toEqual({ onTop: true, inView: true, op: 1 });
    // buttons are thumb-sized and close the screen
    const b = await u.locator('[data-act="equip"]').boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    await u.locator('[data-act="later"]').click();
    await expect(page.locator('.ulk')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
