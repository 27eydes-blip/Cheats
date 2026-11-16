// Oblivion GP weapons on two phones in one friend room (bots off): both pick up items from the boxes,
// both fire items, both get hit (a drone and a homing missile, aimed with the HUNT_DEV-only `aim`
// command), the target sees the LOCK-ON warning, and both screens get the same combat events, the same
// hp and the same positions for the same server tick. The HUD shows the held item's level.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, roomCode, waitPhase } from './race-helpers.js';

test('two phones: pick up, fire, get hit, see the same events, hp and positions', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'phone emulation');
  test.setTimeout(180_000);
  const A = await phone(browser, 844, 390), B = await phone(browser, 1180, 820);
  const errs = [trackErrors(A.page), trackErrors(B.page)];
  const room = roomCode('W');
  for (const P of [A, B]) await P.page.addInitScript(() => { try { localStorage.setItem('hunt-race-steered', '1'); localStorage.setItem('hunt-race-tut', '1'); } catch {} });
  const url = '/?' + new URLSearchParams({ race: '1', room, lobby: '4', laps: '3', track: 'desert', mode: 'grand', bots: '0' });
  await A.page.goto(url); await waitPhase(A.page, 'lobby');
  await B.page.goto(url);
  await Promise.all([waitPhase(A.page, 'race', 40_000), waitPhase(B.page, 'race', 40_000)]);
  // every page records the combat events it is told about and the car rows of each server tick
  for (const P of [A, B]) await P.page.evaluate(() => {
    const r = window.__race, log = (window.__wlog = { hit: [], lock: [], pickup: [], snaps: new Map() });
    r.bus.on('hit', (h) => log.hit.push([h.id, h.src, h.kind, h.dmg, h.big ? 1 : 0]));
    r.bus.on('lockon', (h) => log.lock.push([h.target, h.src, h.kind]));
    r.bus.on('pickup', (h) => log.pickup.push([h.id, h.item, h.lvl]));
    r.rc.on('s', (m) => { log.snaps.set(m.n, JSON.stringify(m.c.map((c) => [c[0], c[1], c[2], c[5]]))); if (log.snaps.size > 200) log.snaps.delete(log.snaps.keys().next().value); });
    r.auto(true);
  });
  expect(await A.page.evaluate(() => window.__race.rc.roster.size)).toBe(2);
  const ids = await Promise.all([A, B].map((P) => P.page.evaluate(() => window.__race.rc.id)));

  // PICK UP: both drive through item boxes (the autopilot follows the racing line through them)
  // (both follow the same line, so the car in front takes each box: the first to get one waits 6 s)
  const got = (P) => P.page.evaluate(() => (window.__race.mine.box || []).length > 0);
  await expect.poll(async () => (await got(A)) || (await got(B)), { timeout: 60_000 }).toBe(true);
  const first = (await got(A)) ? A : B, second = first === A ? B : A;
  await first.page.evaluate(() => window.__race.auto(true, { stop: true }));
  await first.page.waitForTimeout(6000);
  await first.page.evaluate(() => window.__race.auto(true));
  await second.page.waitForFunction(() => (window.__race.mine.box || []).length > 0, null, { timeout: 60_000 });
  // the HUD's item slot shows the level: a level 3 item from the dev hook
  await A.page.evaluate(() => { const r = window.__race; if (r.rc.me.it >= 0) r.rc.useItem(); });
  await A.page.waitForFunction(() => window.__race.rc.me.it < 0, null, { timeout: 5000 });
  await A.page.evaluate(() => window.__race.dev('item', 'shield', 3));
  await A.page.waitForFunction(() => window.__race.rc.me.it === 2 && window.__race.rc.me.il === 3, null, { timeout: 5000 });

  // FIRE: each phone uses an item with its own ITEM press
  for (const P of [A, B]) {
    await P.page.evaluate(() => { const r = window.__race; if (r.rc.me.it < 0) r.dev('item', 'turbo', 1); });
    await P.page.waitForFunction(() => window.__race.rc.me.it >= 0, null, { timeout: 5000 });
    await P.page.evaluate(() => window.__race.rc.useItem());
    await P.page.waitForFunction(() => (window.__race.mine.use || []).length > 0, null, { timeout: 5000 });
  }

  // GET HIT: A sends a Hunter Drone at B (B is warned), B sticks a bomb on A
  // (B waits on the road so the drone catches it wherever A is)
  await B.page.evaluate(() => window.__race.auto(true, { stop: true }));
  await B.page.evaluate(() => window.__race.dev('aim', 'drone', 2));
  await B.page.waitForFunction(() => window.__race.session.renderer.threat > 0 || window.__wlog.hit.some((h) => h[0] === window.__race.rc.id), null, { timeout: 8000 });
  await B.page.waitForFunction(() => window.__wlog.hit.some((h) => h[0] === window.__race.rc.id && h[2] === 'drone'), null, { timeout: 30_000 });
  await B.page.evaluate(() => window.__race.auto(true));
  await A.page.waitForFunction(() => window.__race.rc.me.pr <= 0 && !window.__race.rc.me.rt, null, { timeout: 8000 });
  // B fires a level 2 homing missile at A (A waits on the road, no drift: no dodge): a big hit
  await A.page.evaluate(() => window.__race.auto(true, { stop: true }));
  // (B may be wrecked or still too far for the missile's 4 s flight: then it fires again)
  const missileHit = () => A.page.evaluate(() => window.__wlog.hit.some((h) => h[0] === window.__race.rc.id && h[2] === 'missile' && h[4] === 1));
  for (let k = 0; k < 4 && !(await missileHit()); k++) {
    await A.page.evaluate(() => window.__race.dev('aim', 'missile', 2));
    await A.page.waitForFunction(() => window.__wlog.hit.some((h) => h[0] === window.__race.rc.id && h[2] === 'missile' && h[4] === 1), null, { timeout: 6000 }).catch(() => {});
  }
  expect(await missileHit()).toBe(true);
  await A.page.evaluate(() => window.__race.auto(true));

  // THE SAME on both screens: lock-on, hits (who, by whom, what, how much, big), pickups
  await A.page.waitForTimeout(500);
  const logs = await Promise.all([A, B].map((P) => P.page.evaluate(() => ({ hit: window.__wlog.hit, lock: window.__wlog.lock, pickup: window.__wlog.pickup }))));
  expect(logs[0].hit).toEqual(logs[1].hit);
  expect(logs[0].lock).toEqual(logs[1].lock);
  expect(logs[0].pickup).toEqual(logs[1].pickup);
  expect(logs[0].lock.some((l) => l[0] === ids[1] && l[2] === 'drone')).toBe(true);
  expect(logs[0].hit.some((h) => h[0] === ids[1] && h[1] === ids[0] && h[2] === 'drone')).toBe(true);
  expect(logs[0].hit.some((h) => h[0] === ids[0] && h[1] === ids[1] && h[2] === 'missile' && h[4] === 1)).toBe(true);
  expect(logs[0].lock.some((l) => l[0] === ids[0] && l[2] === 'missile')).toBe(true);
  // ...and the same hp and positions for the same server tick
  const snaps = await Promise.all([A, B].map((P) => P.page.evaluate(() => [...window.__wlog.snaps.entries()])));
  const mb = new Map(snaps[1]);
  const common = snaps[0].filter(([n]) => mb.has(n));
  expect(common.length).toBeGreaterThan(20);
  for (const [n, rows] of common) expect(rows, `tick ${n}`).toBe(mb.get(n));
  for (const e of errs) expect(e).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
