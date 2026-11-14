import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

for (const b of ['dune', 'rook', 'flicker']) {
  test(`play as ${b}: attack + super without errors`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.evaluate((b) => localStorage.setItem('hunt', JSON.stringify({ brawler: b, name: 'T' })), b);
    await page.goto('/?world=meadow&mode=bounty');
    await waitMe(page);
    expect(await page.evaluate(() => window.__hunt.brawler)).toBe(b);
    await page.mouse.move(900, 360);
    for (let i = 0; i < 4; i++) { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(450); }
    await page.evaluate(() => { window.__hunt.me.sc = 1; });
    await page.keyboard.press('e');
    await page.waitForTimeout(1200);
    expect(errors).toEqual([]);
  });
}
