// Hunt Racers on desktop: a whole (short, HUNT_DEV-only laps=1) race driven with the keyboard by
// event.code (arrows / WASD, Shift drift, J fire, K item), a mouse click to fire, Escape for the
// menu, the finish screen against the server's results, and LOBBY back out of the race.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { roomCode, raceUrl, waitPhase, finishRows, creditVisible } from './race-helpers.js';

test('desktop keyboard race, menu and finish screen', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for the long drive');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errs = trackErrors(page);
  await page.goto(raceUrl({ room: roomCode('K'), bots: '1', driver: 'volt', track: 'neon' }));
  await waitPhase(page, 'race');
  expect(await page.evaluate(() => window.__race.layout().mode)).toBe('keys');
  await creditVisible(page);
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 0.3);

  // Escape opens the menu (LEAVE RACE), Escape again closes it
  await page.keyboard.press('Escape');
  await expect(page.locator('.rc-menu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'LEAVE RACE' })).toBeVisible();
  await creditVisible(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.rc-menu')).toBeHidden();

  // a left click fires the weapon (Volt's arc always goes off)
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => (window.__race.mine.arc || []).length > 0, null, { timeout: 5000 });

  // drive: steer with arrows / A-D from the racing-line hint, W to throttle, S to brake, J to fire,
  // K for items
  const held = new Set();
  const hold = async (code, on) => { if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); } else if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); } };
  let lastFire = 0, lastItem = 0, gave = false, driftChecked = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    const h = await page.evaluate(() => { const r = window.__race, me = r.rc.me, s = r.rc.car ? r.hint() : { st: 0, th: 1, dr: 0 }; return { ...s, tm: r.rc.latest.tm, fin: me.fin, it: me.it, phase: r.rc.phase }; });
    if (h.fin || h.phase === 'end') break;
    await hold(h.st > 0 ? 'ArrowRight' : 'KeyD', h.st > 0.12);
    await hold(h.st < 0 ? 'ArrowLeft' : 'KeyA', h.st < -0.12);
    if (h.st <= 0.12) { await hold('ArrowRight', false); await hold('KeyD', false); }
    if (h.st >= -0.12) { await hold('ArrowLeft', false); await hold('KeyA', false); }
    await hold('KeyW', h.th > 0);
    await hold('KeyS', h.th < 0);
    // Shift = drift: checked once on a straight (bang-bang arrow steering can't hold a drift well)
    if (!driftChecked && h.tm > 3) {
      await hold('ShiftLeft', true);
      await expect.poll(() => page.evaluate(() => window.__race.rc.held.dr)).toBe(1);
      await hold('ShiftLeft', false);
      await expect.poll(() => page.evaluate(() => window.__race.rc.held.dr)).toBe(0);
      driftChecked = true;
    }
    if (h.tm - lastFire > 2) { await page.keyboard.press('KeyJ'); lastFire = h.tm; }
    if (h.tm > 4 && h.it < 0 && !gave) { await page.evaluate(() => window.__race.dev('item', 'shield')); gave = true; }
    if (h.it >= 0 && h.tm - lastItem > 1) { await page.keyboard.press('KeyK'); lastItem = h.tm; }
    await page.waitForTimeout(10);
  }
  for (const k of [...held]) await hold(k, false);
  const mine = await page.evaluate(() => Object.fromEntries(Object.entries(window.__race.mine).map(([k, v]) => [k, v.length])));
  expect(driftChecked).toBe(true);
  expect(mine.lap, 'laps counted').toBeGreaterThanOrEqual(1);
  expect(mine.fin, 'finished').toBe(1);
  expect(mine.use, 'used an item with K').toBeGreaterThan(0);
  expect(mine.arc, 'fired with J / click').toBeGreaterThan(1);

  await page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 60_000 });
  const server = await page.evaluate(() => window.__race.rc.results.results.map((r) => [r[3], r[1]]));
  expect(await finishRows(page)).toEqual(server);
  await creditVisible(page);
  await page.screenshot({ path: test.info().outputPath('desktop-finish.png') });
  // LOBBY leaves the race layer
  await page.getByRole('button', { name: 'LOBBY' }).click();
  await page.waitForURL((u) => !u.search.includes('race='));
  await expect(page.locator('.rc-root')).toHaveCount(0);
  expect(errs).toEqual([]);
});
