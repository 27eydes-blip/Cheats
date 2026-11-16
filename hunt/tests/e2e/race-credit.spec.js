// "Made by Gleyde Technologies" stays visible, on top, in every race state: the pre-race card, the
// race HUD (phone and desktop), the pause menu, a connection error, and the finish screen. Also
// checks the canvas HUD never draws a button over it.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { roomCode, waitPhase, creditVisible } from './race-helpers.js';

for (const vp of [{ width: 667, height: 375, touch: true }, { width: 844, height: 390, touch: true }, { width: 1024, height: 768, touch: true }, { width: 1440, height: 900, touch: false }]) {
  test(`credit visible in a race at ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await ctx.newPage();
    const errs = trackErrors(page);
    // a friend room you host (no ?lobby countdown): the pre-race card stays up until you press
    // START, however slowly the page runs
    await page.goto('/?race=1&' + new URLSearchParams({ room: roomCode('C'), bots: '1', laps: '1', track: 'desert', mode: 'grand' }));
    await waitPhase(page, 'lobby');
    await expect(page.locator('.rc-wait')).toBeVisible();
    await creditVisible(page);
    await expect(page.locator('.rc-start')).toBeEnabled({ timeout: 30_000 });
    await page.locator('.rc-start').click();
    await waitPhase(page, 'race');
    await creditVisible(page);
    // no thumb button overlaps the credit
    const clear = await page.evaluate(() => {
      const r = document.querySelector('.rc-credit').getBoundingClientRect(), L = window.__race.layout();
      return Object.values(L.btn).every((b) => b.x + b.r < r.left || b.x - b.r > r.right || b.y + b.r < r.top || b.y - b.r > r.bottom);
    });
    expect(clear).toBe(true);
    // pause menu
    await page.keyboard.press('Escape');
    await expect(page.locator('.rc-menu')).toBeVisible();
    await creditVisible(page);
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('.rc-menu')).toBeHidden();
    // finish screen (from a results message shaped like the server's) and the error card
    await page.evaluate(() => {
      const rc = window.__race.rc;
      rc.onMsg({ t: 'end', mode: 'grand', track: rc.trackKey, rank: 1, you: rc.id, n: 2, time: 61.2, bestLap: 20.1, mc: 7, k: 1, results: [[rc.id, 'You', 'volt', 1, 61.2, 1, 7, 0, 20.1, 1, 0], [99, 'Bot', 'brick', 2, 63, 0, 2, 1, 21, 1, 1]] });
    });
    await page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 30_000 }); // (1.6 s after the end, on the next frame: slow machines draw few)
    await expect(page.locator('.rc-res')).toBeVisible();
    await creditVisible(page);
    await page.evaluate(() => { window.__race.session.endShown = false; window.__race.session.fail('Lost the connection to the race.'); });
    await expect(page.locator('.rc-fail')).toBeVisible();
    await creditVisible(page);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}
