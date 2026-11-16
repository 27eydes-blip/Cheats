// Hunt Racers: two phones in the same friend room race, with FILL WITH BOTS on and off.
// Both drive with real touch input (CDP touch events: steering thumb + DRIFT / FIRE / ITEM / BRAKE
// fingers at once), fire their weapon, use an item, one gets wrecked and is back ~2 s later, laps
// count up, both finish, and the finish order agrees on both screens and with the server.
// Short races come from the HUNT_DEV-only `laps=1` room option; the wreck uses the HUNT_DEV-only
// test command (the deploy config never has HUNT_DEV).
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, roomCode, raceUrl, waitPhase, raceState, drive, layout, finishRows, creditVisible } from './race-helpers.js';

test.describe.configure({ mode: 'serial' });

for (const bots of ['1', '0']) {
  test(`two phones race in one room (bots ${bots === '1' ? 'on' : 'off'})`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    test.setTimeout(240_000);
    const A = await phone(browser, 667, 375), B = await phone(browser, 844, 390);
    const errs = [trackErrors(A.page), trackErrors(B.page)];
    const room = roomCode();
    // brick and wisp: their weapons always go off (shockwave / rail), even with nobody near
    await A.page.goto(raceUrl({ room, bots, driver: 'brick' }));
    await waitPhase(A.page, 'lobby');
    await B.page.goto(raceUrl({ room, bots, driver: 'wisp' }));
    await Promise.all([waitPhase(A.page, 'race'), waitPhase(B.page, 'race')]);
    for (const P of [A, B]) {
      expect((await layout(P.page)).mode).toBe('touch');
      await creditVisible(P.page);
    }
    const same = await Promise.all([A, B].map((P) => P.page.evaluate(() => window.__race.rc.match)));
    expect(same[0]).toBe(same[1]);
    const nCars = await A.page.evaluate(() => window.__race.rc.roster.size);
    expect(nCars).toBe(bots === '1' ? 10 : 2);

    // both phones drive at once; along the way each fires, uses an item, and A gets wrecked
    const done = { A: {}, B: {} };
    const script = (P, me) => async (F, L, s) => {
      const d = done[me];
      // FIRE every couple of seconds (it is on a cooldown anyway); ITEM whenever we hold one. An
      // item from a box if we drove through one, otherwise the test hands one over once.
      if (s.tm > 1.5 && s.tm - (d.fired || 0) > 2) { await F.tap(2, L.btn.fire.x, L.btn.fire.y); d.fired = s.tm; }
      if (s.tm > 4 && s.it < 0 && !d.gave) { await P.page.evaluate(() => window.__race.dev('item', 'turbo')); d.gave = true; }
      if (s.it >= 0 && s.tm - (d.used || 0) > 1) { await F.tap(3, L.btn.item.x, L.btn.item.y); d.used = s.tm; }
      if (me === 'A' && s.tm > 7 && !d.wrecked) { await P.page.evaluate(() => window.__race.dev('wreck')); d.wrecked = true; }
    };
    const finished = (s) => s.fin > 0 || s.phase === 'end';
    const rates = await Promise.all([
      drive(A, { until: finished, maxMs: 150_000, onTick: script(A, 'A') }),
      drive(B, { until: finished, maxMs: 150_000, onTick: script(B, 'B') }),
    ]);
    console.log('touch input updates per second', rates.map((r) => r.toFixed(1)).join(' / '));
    const [sa, sb] = await Promise.all([raceState(A.page), raceState(B.page)]);
    expect(sa.fin, 'A finished').toBeGreaterThan(0);
    expect(sb.fin, 'B finished').toBeGreaterThan(0);
    expect(sa.fin).not.toBe(sb.fin);

    // weapon + item through the touch buttons: the server reported them
    const evs = (s, kind) => s.mine[kind] || [];
    expect(evs(sa, 'pulse').length, 'A fired (shock bumper)').toBeGreaterThan(0);
    expect(evs(sb, 'rail').length, 'B fired (rail lance)').toBeGreaterThan(0);
    expect(evs(sa, 'use').length, 'A used an item').toBeGreaterThan(0);
    expect(evs(sb, 'use').length, 'B used an item').toBeGreaterThan(0);
    // wreck -> back on track about 2 s later, laps kept
    const ko = evs(sa, 'ko')[0], rs = evs(sa, 'rs').find((t) => t > ko);
    expect(ko && rs, 'A wrecked and respawned').toBeTruthy();
    const gap = (rs - ko) / 1000;
    expect(gap).toBeGreaterThan(1.6);
    expect(gap).toBeLessThan(2.8);
    // the lap counter went up (lap 1 starts on the line, then the finish lap)
    for (const s of [sa, sb]) expect(evs(s, 'lap').length, 'laps counted').toBeGreaterThanOrEqual(1);

    // the race ends; both finish screens show the same order as the server's results message
    await Promise.all([A, B].map((P) => P.page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 60_000 })));
    const server = await Promise.all([A, B].map((P) => P.page.evaluate(() => window.__race.rc.results.results.map((r) => [r[3], r[1]]))));
    expect(server[0]).toEqual(server[1]);
    const shown = await Promise.all([A, B].map((P) => finishRows(P.page)));
    expect(shown[0]).toEqual(server[0]);
    expect(shown[1]).toEqual(server[0]);
    // each phone's own place is where the server put it
    const you = await Promise.all([A, B].map((P) => P.page.evaluate(() => { const m = window.__race.rc.results; return m.results.find((r) => r[0] === m.you)[3]; })));
    expect(you).toEqual([sa.fin, sb.fin]);
    for (const P of [A, B]) {
      await expect(P.page.locator('.rc-res')).toBeVisible();
      await creditVisible(P.page);
    }
    await A.page.screenshot({ path: test.info().outputPath('finish-a.png') });
    expect(errs[0]).toEqual([]);
    expect(errs[1]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });
}
