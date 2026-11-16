// ELIMINATION in the browser. Two phones in one friend room (bots off): both see the same cuts, the
// same racer in danger, the same cars, the same black hole position, the same weapon hits and the same finish order
// for the same server ticks. One phone in a bots race: the danger tag, the dark edges when the black
// hole is close, spectating after the cut (4 emotes, LEAVE, NEXT RACE, the credit still visible), the
// FINAL DUEL and the results screen replaying the final cut.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, roomCode, waitPhase, finishRows } from './race-helpers.js';

const noTips = () => { try { localStorage.setItem('hunt-race-steered', '1'); localStorage.setItem('hunt-race-tut', '1'); } catch {} };

test('two phones, one Elimination race: same cuts, danger, black hole, weapons and finish order', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'phone emulation');
  test.setTimeout(150_000);
  const A = await phone(browser, 844, 390), B = await phone(browser, 1180, 820);
  const errs = [trackErrors(A.page), trackErrors(B.page)];
  for (const P of [A, B]) await P.page.addInitScript(noTips);
  const url = '/?' + new URLSearchParams({ race: '1', room: roomCode('X'), lobby: '4', track: 'desert', mode: 'elim', bots: '0' });
  await A.page.goto(url); await waitPhase(A.page, 'lobby');
  await A.page.evaluate(() => window.__race.rc.pick('wisp')); // A picks another car in the lobby (B keeps the default)
  await B.page.goto(url);
  await Promise.all([waitPhase(A.page, 'race', 40_000), waitPhase(B.page, 'race', 40_000)]);
  // every page logs, per server tick: the mode state (danger, black hole, timer, duel) and the cars;
  // and the elimination / weapon events it is told about
  for (const P of [A, B]) await P.page.evaluate(() => {
    const r = window.__race, log = (window.__elog = { md: new Map(), cars: new Map(), ev: [] });
    const KEEP = new Set(['elim', 'duel', 'burst', 'hit', 'ko', 'lock', 'use']);
    r.rc.on('s', (m) => {
      log.md.set(m.n, JSON.stringify([m.md.dg, m.md.bh, m.md.nx, m.md.iv, m.md.duel, m.md.left]));
      log.cars.set(m.n, JSON.stringify(m.c.map((c) => [c[0], c[1], c[2], c[5]])));
      if (m.ev) for (const e of m.ev) if (Array.isArray(e) && KEEP.has(e[0])) log.ev.push([m.n, ...e]);
    });
    r.auto(true);
  });
  expect(await A.page.evaluate(() => window.__race.rc.roster.size)).toBe(2); // bots off: just the two phones
  // the same cars on both phones: who drives what (and their cosmetics)
  const rosters = await Promise.all([A, B].map((P) => P.page.evaluate(() => [...window.__race.rc.roster.entries()].sort((a, b) => a[0] - b[0]).map(([id, r]) => [id, r.name, r.driver, r.cos]))));
  expect(rosters[0]).toEqual(rosters[1]);
  expect(await A.page.evaluate(() => window.__race.rc.myDriver())).toBe('wisp');
  expect(rosters[0].map((r) => r[2]).sort()).toEqual(['volt', 'wisp']);
  const ids = await Promise.all([A, B].map((P) => P.page.evaluate(() => window.__race.rc.id)));
  // two racers: the race opens as the FINAL DUEL, a racer is in danger, the black hole is on the track
  for (const P of [A, B]) await P.page.waitForFunction(() => { const e = window.__race.elim(); return e && e.duel === 1 && e.dg > 0 && e.hole != null && e.nx > 0; }, null, { timeout: 15_000 });
  // WEAPONS: A sends a Hunter Drone at B (B waits so it lands), then B races on
  await B.page.evaluate(() => window.__race.auto(true, { stop: true }));
  await B.page.evaluate(() => window.__race.dev('aim', 'drone', 2));
  await B.page.waitForFunction((a) => window.__elog.ev.some((e) => e[1] === 'hit' && e[2] === window.__race.rc.id && e[3] === a), ids[0], { timeout: 20_000 });
  await B.page.evaluate(() => window.__race.auto(true));
  // the first (and here the only) cut comes at 25 s: the race is decided
  await Promise.all([waitPhase(A.page, 'end', 60_000), waitPhase(B.page, 'end', 60_000)]);
  const logs = await Promise.all([A, B].map((P) => P.page.evaluate(() => ({ md: [...window.__elog.md.entries()], cars: [...window.__elog.cars.entries()], ev: window.__elog.ev }))));
  const from = Math.max(logs[0].md[0][0], logs[1].md[0][0]);
  const mB = new Map(logs[1].md), cB = new Map(logs[1].cars);
  const common = logs[0].md.filter(([n]) => n >= from && mB.has(n));
  expect(common.length).toBeGreaterThan(300); // most of the race, tick by tick
  for (const [n, md] of common) expect(md, `danger / black hole / timer at tick ${n}`).toBe(mB.get(n));
  for (const [n, c] of logs[0].cars) if (n >= from && cB.has(n)) expect(c, `cars at tick ${n}`).toBe(cB.get(n));
  const evA = logs[0].ev.filter((e) => e[0] >= from), evB = logs[1].ev.filter((e) => e[0] >= from);
  expect(evA).toEqual(evB); // the same cuts, hits, knock-outs and boosts
  const cuts = evA.filter((e) => e[1] === 'elim');
  expect(cuts.length).toBe(1);
  expect(['cut', 'hole']).toContain(cuts[0][4]);
  expect(evA.some((e) => e[1] === 'hit' && e[2] === ids[1] && e[3] === ids[0] && e[4] === 'drone')).toBe(true);
  // the danger moved with the race and the black hole kept coming
  const dangers = new Set(common.map(([, md]) => JSON.parse(md)[0]).filter(Boolean));
  expect([...dangers].every((d) => ids.includes(d))).toBe(true);
  const holes = common.map(([, md]) => JSON.parse(md)[1]);
  expect(holes.at(-1)).toBeGreaterThan(holes[0]);
  // the same finish order on both results screens: the winner first, the cut racer second
  await Promise.all([A, B].map((P) => P.page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 15_000 })));
  const rows = await Promise.all([A, B].map((P) => finishRows(P.page)));
  expect(rows[0]).toEqual(rows[1]);
  expect(rows[0].map((r) => r[0])).toEqual([1, 2]);
  const loser = cuts[0][2];
  const names = await A.page.evaluate((id) => window.__race.rc.roster.get(id).name, loser);
  expect(rows[0][1][1]).toContain(names);
  for (const e of errs) expect(e).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});

test('one phone: danger tag, black hole close, spectate with emotes, final duel, results replay of the final cut', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'phone emulation');
  test.setTimeout(120_000);
  const P = await phone(browser, 844, 390);
  const errs = trackErrors(P.page);
  await P.page.addInitScript(noTips);
  await P.page.goto('/?' + new URLSearchParams({ race: '1', lobby: '3', track: 'frozen', mode: 'elim', bots: '1', mmpool: 'elim' + Math.random().toString(36).slice(2, 8) }));
  await waitPhase(P.page, 'race', 40_000);
  await P.page.evaluate(() => window.__race.auto(true));
  const el = () => P.page.evaluate(() => window.__race.elim());
  // bots fill the field (FILL WITH BOTS on); somebody is in danger, the timer counts to the first cut
  await P.page.waitForFunction(() => { const e = window.__race.elim(); return e && e.cars === 10 && e.dg > 0 && e.nx < 25; }, null, { timeout: 15_000 });
  // the black hole close behind: the edges darken
  await P.page.evaluate(() => { window.__race.auto(true, { stop: true }); window.__race.rc.send({ t: 'dev', k: 'hole', gap: 700 }); });
  await P.page.waitForFunction(() => window.__race.elim().near > 0.3 || window.__race.elim().out, null, { timeout: 10_000 });
  // knocked out: spectating (the camera follows the leader), 4 emotes, LEAVE and NEXT RACE
  await P.page.evaluate(() => { if (!window.__race.elim().out) window.__race.dev('cut'); });
  await P.page.waitForFunction(() => window.__race.elim().spec, null, { timeout: 10_000 });
  await expect(P.page.locator('.rc-spec .rc-emo')).toHaveCount(4);
  await expect(P.page.locator('.rc-spec .rc-sleave')).toBeVisible();
  await expect(P.page.locator('.rc-spec .rc-snext')).toBeVisible();
  expect(await P.page.evaluate(() => window.__race.session.ctrl.enabled)).toBe(false);
  // the credit is still on screen and on top
  const credit = await P.page.evaluate(() => { const c = document.querySelector('.rc-root .rc-credit'), r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { h: r.height, ok: top === c || c.contains(top) || !top || getComputedStyle(top).pointerEvents === 'none' || top.closest('.rc-credit') !== null, op: +getComputedStyle(c).opacity, overlap: (() => { const s = document.querySelector('.rc-spec').getBoundingClientRect(); return s.bottom > r.top && s.top < r.bottom && s.right > r.left && s.left < r.right; })() }; });
  expect(credit.h).toBeGreaterThan(0); expect(credit.op).toBeGreaterThan(0.5); expect(credit.overlap).toBe(false);
  await P.page.locator('.rc-spec .rc-emo').nth(1).tap();
  await P.page.waitForFunction(() => (window.__race.mine.emo || []).length > 0, null, { timeout: 5000 });
  // cut the field down to the final duel
  for (let i = 0; i < 12; i++) { const e = await el(); if (!e || e.left <= 2) break; await P.page.evaluate(() => window.__race.dev('cutnow')); await P.page.waitForTimeout(350); }
  await P.page.waitForFunction(() => window.__race.elim().duel === 1, null, { timeout: 10_000 });
  // the last cut ends it: the results replay the final cut
  await P.page.evaluate(() => window.__race.dev('cutnow'));
  await P.page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 15_000 });
  await expect(P.page.locator('.rc-res .rc-rplabel')).toContainText('FINAL CUT');
  expect(await P.page.evaluate(() => window.__race.moments().clip.label)).toBe('FINAL CUT');
  await expect(P.page.locator('.rc-spec')).toBeHidden();
  const rows = await finishRows(P.page);
  expect(rows.map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(errs).toEqual([]);
  await P.ctx.close();
});
