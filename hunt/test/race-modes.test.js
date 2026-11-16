// Hunt Racers modes: Grand Race finish order + timeout, Elimination, Battle Arena, Time Trial,
// FILL WITH BOTS on/off, result rows for the account progression.
import assert from 'node:assert';
import { RaceSim, FINISH_TIMEOUT, RACE_MODES } from '../src/race/sim.js';
import { DT } from '../public/race/physics.js';
import { elimSchedule } from '../public/race/protocol.js';
import { mkRace, ticks, startRace, collectEvents } from './race-helpers.js';

const runToEnd = (sim, max = 30 * 400) => { let n = 0; while (sim.phase !== 'end' && n++ < max) sim.tick(); return sim; };
const bots = (sim) => [...sim.players.values()].filter((p) => p.wasBot);
assert.deepStrictEqual(Object.keys(RACE_MODES), ['grand', 'elim', 'battle', 'trial']);

// GRAND RACE: one human finishes, the other never moves: the race ends FINISH_TIMEOUT after the winner
{
  const rows = [];
  const sim = mkRace({ track: 'frozen', hooks: { finished: (r) => rows.push(...r) } });
  const ends = [];
  sim.send = (id, m) => { if (m.t === 'end') ends.push([id, m]); };
  const [A, B] = startRace(sim, ['wisp', 'brick']);
  A.bot = true; // autopilot drives A
  runToEnd(sim);
  assert.strictEqual(sim.phase, 'end');
  assert.ok(A.finished && !B.finished);
  assert.ok(Math.abs(sim.time - (A.finishTime + FINISH_TIMEOUT)) <= DT + 1e-9, `ends ${FINISH_TIMEOUT}s after the winner`);
  assert.deepStrictEqual([A.rank, B.rank], [1, 2]);
  assert.strictEqual(ends.length, 2, 'both get the results');
  const res = ends[0][1].results;
  assert.deepStrictEqual(res.map((r) => r[0]), [A.id, B.id], 'results in finish order');
  assert.strictEqual(res[0][4], A.finishTime);
  assert.strictEqual(rows.length, 2, 'a result row per human for the progression');
  const ra = rows.find((r) => r.p === A);
  assert.deepStrictEqual([ra.rank, ra.players, ra.mode, ra.track, ra.finished, ra.driver], [1, 2, 'grand', 'frozen', true, 'wisp']);
  assert.strictEqual(bots(sim).length, 0, 'bots off: no bots');
}
// GRAND RACE: everyone finishes -> ends right away; finish order = order across the line
{
  const sim = mkRace({ track: 'neon', fillBots: true, botLevel: 'hard' });
  const [A] = startRace(sim, ['volt']);
  A.bot = true;
  const ev = collectEvents(sim);
  runToEnd(sim);
  const fins = ev.filter((e) => e[1] === 'fin');
  assert.strictEqual(sim.players.size, 10, 'filled with bots');
  assert.ok(fins.length >= 5, 'most of the field finishes');
  for (const [, , id, place, time] of fins) { const p = sim.players.get(id); assert.strictEqual(p.rank, place); assert.strictEqual(p.finishTime, time); }
  const ordered = sim.order.filter((p) => p.finished).map((p) => p.finishTime);
  assert.deepStrictEqual(ordered, [...ordered].sort((a, b) => a - b), 'finish order by time');
  assert.ok(sim.order.filter((p) => !p.finished).every((p, i, arr) => i === 0 || arr[i - 1].prog >= p.prog), 'non-finishers by distance');
}

// ELIMINATION: last place cut on the schedule (25 s, then every 18 s, every 12 s from 4 left, the final
// duel on 8 s) until one remains. (The black hole is off here: test/race-elim.test.js covers it.)
{
  const sim = mkRace({ mode: 'elim', track: 'ashlands', fillBots: true, botLevel: 'normal' });
  sim.bhOff = true;
  const [A] = startRace(sim, ['dune']);
  A.bot = true;
  const ev = collectEvents(sim);
  const snapshots = [];
  const orig = sim.eliminate.bind(sim);
  sim.eliminate = (p) => { snapshots.push(sim.order.filter((q) => !q.out).at(-1) === p); orig(p); };
  runToEnd(sim);
  const outs = ev.filter((e) => e[1] === 'elim');
  assert.strictEqual(outs.length, 9, 'nine knocked out');
  const at = elimSchedule(10);
  assert.deepStrictEqual(at, [25, 43, 61, 79, 97, 115, 127, 139, 147]);
  outs.forEach((e, i) => assert.ok(Math.abs(e[0] - at[i]) < DT * 1.5, `elimination ${i + 1} at ${at[i]}s (was ${e[0]})`));
  assert.ok(snapshots.every(Boolean), 'always the racer in last place');
  assert.deepStrictEqual(outs.map((e) => e[3]), [10, 9, 8, 7, 6, 5, 4, 3, 2], 'places from the back');
  const win = sim.order[0];
  assert.ok(!win.out && win.rank === 1);
  assert.deepStrictEqual(sim.order.map((p) => p.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(sim.order.slice(1).every((p, i) => p.out && p.place === i + 2));
}

// BATTLE ARENA: timed, takedowns win, respawns
{
  const sim = mkRace({ mode: 'battle', track: 'neon', fillBots: true, botLevel: 'hard' });
  const [A] = startRace(sim, ['brick']);
  A.bot = true;
  const ev = collectEvents(sim);
  runToEnd(sim);
  assert.strictEqual(sim.T.kind, 'arena');
  assert.ok(Math.abs(sim.time - RACE_MODES.battle.time) <= DT + 1e-9, 'ends when the clock runs out');
  const kos = ev.filter((e) => e[1] === 'ko').length;
  assert.ok(kos >= 5, `takedowns happen (${kos})`);
  assert.ok(ev.some((e) => e[1] === 'rs'), 'wrecked cars come back');
  const o = sim.order;
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1].kills > o[i].kills || (o[i - 1].kills === o[i].kills && o[i - 1].deaths <= o[i].deaths), 'ranked by takedowns');
}

// TIME TRIAL: always solo (never bots, even if asked), 3 laps, best lap
{
  const rows = [];
  const sim = new RaceSim({ mode: 'trial', track: 'desert', seed: 2, lobbyTime: 0.05, fillBots: true, hooks: { finished: (r) => rows.push(...r) } });
  const a = sim.join('Solo', 'flicker');
  assert.strictEqual(sim.join('Second', 'volt'), null, 'one racer only');
  ticks(sim, 5);
  assert.strictEqual(sim.phase, 'play');
  assert.strictEqual(sim.players.size, 1, 'no bots in a time trial');
  sim.players.get(a).bot = true;
  runToEnd(sim);
  const p = sim.players.get(a);
  assert.ok(p.finished && p.lapTimes.length === 3);
  assert.strictEqual(rows[0].time, p.finishTime);
  assert.strictEqual(rows[0].bestLap, Math.min(...p.lapTimes));
  assert.ok(sim.ents.length === 0 && p.mc === 0, 'no items or coins in a trial');
}

// FILL WITH BOTS: OFF never adds a bot (needs 2 humans), and a dropped human is not replaced by one
{
  const sim = mkRace({ fillBots: false });
  sim.join('Solo', 'volt');
  ticks(sim, 60);
  assert.strictEqual(sim.phase, 'lobby', 'bots off + 1 human: waits');
  const b = sim.join('Friend', 'rook');
  ticks(sim, 100);
  assert.strictEqual(sim.phase, 'play');
  assert.strictEqual(sim.players.size, 2);
  sim.leave(b);
  assert.strictEqual(sim.players.get(b).bot, false, 'not handed to a bot');
  ticks(sim, 200);
  assert.strictEqual(bots(sim).length, 0);
  // bots ON: a dropped racer's car is driven by a bot until they come back
  const s2 = mkRace({ fillBots: true });
  const id = s2.join('Solo', 'volt');
  ticks(s2, 100);
  assert.strictEqual(s2.players.size, 10);
  s2.leave(id);
  assert.strictEqual(s2.players.get(id).bot, true);
  s2.rejoin(id);
  assert.strictEqual(s2.players.get(id).bot, false);
  // quitting mid-race: the result counts now, last place
  const row = s2.abandon(id);
  assert.deepStrictEqual([row.rank, row.players], [10, 10]);
  assert.strictEqual(s2.abandon(id), null, 'only once');
}
console.log('race-modes: ok');
