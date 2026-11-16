// Hunt Racers tutorial + joystick netcode: mode=tutorial is a private solo run on the training
// track (cones, a drift curve, item boxes, a parked target); a scripted driver gets the steps
// steer -> drift -> item -> fire -> done in order; finishing sets progress.race.tut = 1 once and pays
// nothing else. End to end through the worker: a phone steering by joystick heading (ha / hm, with a
// sensitivity) is predicted to within a pixel of the server, and RaceClient.reset() works.
import assert from 'node:assert';
import { raceEnv, fakeD1, open, settle } from './race-harness.js';
import worker, { RaceRoom, RaceMatchmaker } from '../src/worker.js';
import { RaceClient } from '../public/race/net.js';
import { RaceSim } from '../src/race/sim.js';
import { botInput } from '../src/race/bots.js';
import { applyRace, raceResult } from '../src/race/results.js';
import { getTrack, TRACK_IDS, trackName } from '../public/race/tracks.js';
import { validateTrack } from '../public/race/trackcheck.js';
import { RACE_MODES, TUT_STEPS } from '../public/race/protocol.js';
import { newProgress } from '../public/progression.js';
import { collectEvents } from './race-helpers.js';

// the training track is valid, has its sections, and stays out of the lobby's lists
{
  const T = getTrack('tutorial');
  assert.deepStrictEqual(validateTrack(T), [], 'the training track is raceable');
  assert.ok(T.obstacles.length >= 4 && T.obstacles.every((o) => o.cone), 'a cone slalom');
  assert.ok(T.boxes.length >= 3, 'a row of item boxes');
  assert.ok(!TRACK_IDS.includes('tutorial') && !RACE_MODES.tutorial, 'not in the track picker or the mode list');
  assert.strictEqual(trackName('tutorial'), 'Training Track');
}

// a scripted player: the bot brain's steering turned into a joystick heading, drift on the big
// curve while that step is up, fire when that step is up
function tutor(sim, p, step) {
  const b = botInput(sim, p), c = p.car;
  const inp = { st: 0, th: 1, dr: 0, ha: c.a + b.st * 0.6, hm: 1, f: 0, i: 0 };
  if (step === 'drift' && c.x > 2500 && c.y < 1350) { inp.dr = 1; inp.ha = c.a + 0.9; }
  if (step === 'fire' && p.wcd <= 0) inp.f = 1;
  return inp;
}
const rows = [];
{
  const sim = new RaceSim({ mode: 'tutorial', track: 'neon', seed: 4, lobbyTime: 0.05, botLevel: 'hard', fillBots: true, hooks: { finished: (r) => rows.push(...r) } });
  assert.strictEqual(sim.trackKey, 'tutorial', 'always the training track');
  const id = sim.join('Newbie', 'volt', { sens: 1.2 });
  assert.strictEqual(sim.join('Friend', 'volt'), null, 'solo');
  const p = sim.players.get(id);
  assert.strictEqual(p.sens, 1.2);
  const ev = collectEvents(sim);
  let n = 0, seq = 0;
  while (sim.phase === 'lobby' && n++ < 100) sim.tick();
  assert.strictEqual(sim.players.size, 2, 'the player and the target car, no bots');
  const dummy = [...sim.players.values()].find((q) => q.dummy);
  assert.ok(dummy && dummy.wasBot, 'a parked target');
  const home = { x: dummy.car.x, y: dummy.car.y };
  n = 0;
  while (sim.phase !== 'end' && n++ < 30 * 120) {
    const step = sim.hud().tut;
    if (sim.time > 0) sim.input(id, { t: 'in', s: ++seq, ...tutor(sim, p, step) });
    sim.tick();
  }
  assert.ok(Math.hypot(dummy.car.x - home.x, dummy.car.y - home.y) < 200, 'the target stays parked');
  assert.strictEqual(sim.phase, 'end', 'the tutorial ends once every step is done');
  const steps = ev.filter((e) => e[1] === 'tut').map((e) => e[2]);
  assert.deepStrictEqual(steps.map((e) => e.step), TUT_STEPS, 'steps in order');
  assert.ok(steps.every((e) => e.id === id));
  const times = ev.filter((e) => e[1] === 'tut').map((e) => e[0]);
  console.log('tutorial steps at', times.map((t) => t.toFixed(1)).join(' '), 's');
  assert.ok(times[times.length - 1] < 60, `done in ${times[times.length - 1]} s`);
  assert.ok(!ev.some((e) => e[1] === 'ko' && e[2] === id), 'no wrecks on the way');
  assert.strictEqual(rows.length, 1, 'one result row: the player (not the target)');
  assert.strictEqual(rows[0].tut, 1);
}
// results: the one-time flag, no trophies, XP or coins (and not set by a run that was not finished)
{
  const prog = newProgress(), before = JSON.parse(JSON.stringify(prog));
  const out = applyRace(prog, raceResult(rows[0]));
  assert.strictEqual(out.progress.race.tut, 1, 'flag set');
  assert.ok(out.first && out.tut === 1);
  assert.deepStrictEqual([out.delta, out.xp, out.coins], [0, 0, 0], 'no rewards');
  assert.strictEqual(out.progress.coins, before.coins, 'coins unchanged');
  assert.strictEqual(out.progress.xp, before.xp, 'XP unchanged');
  assert.deepStrictEqual(out.progress.trophies, before.trophies, 'trophies unchanged');
  assert.ok(!out.progress.race.races, 'not counted as a race');
  const again = applyRace(out.progress, raceResult(rows[0]));
  assert.ok(!again.first && again.progress.race.tut === 1 && again.coins === 0 && again.progress.coins === before.coins, 'only once');
  const quit = applyRace(newProgress(), raceResult({ ...rows[0], tut: 0 }));
  assert.ok(!quit.progress.race.tut && quit.tut === 0, 'a skipped / unfinished tutorial sets nothing');
}

// ---------------------------------------------------------------- end to end through the worker
const db = fakeD1();
db.addUser('u1', 'tok1');
const env = raceEnv({ RaceRoom, RaceMatchmaker }, db);
const coins0 = db.progress('u1').coins;
// a phone link where everything sent arrives LAG ticks late
const LAG = 3;
function laggy(c) {
  const q = [], tr = c.transport;
  c.transport = async (url) => { const ws = await tr(url); const send = ws.send.bind(ws); ws.send = (d) => q.push([c.tickN, d, send, ws]); return ws; };
  c.flush = () => { while (q.length && q[0][0] <= c.tickN - LAG) { const [, d, send, ws] = q.shift(); if (ws.readyState === 1) send(d); } };
  c.tickN = 0;
  return c;
}
const A = laggy(new RaceClient({ base: '', params: { name: 'Ann', driver: 'flicker', token: 'tok1', mode: 'tutorial', room: 'IGNORED', sens: 1.3 }, transport: (url) => open(worker, env, url) }));
await A.connect();
await settle();
const room = [...env.rooms.entries()].find(([k]) => k.startsWith('tut:'))?.[1];
assert.ok(room, 'mode=tutorial gets its own private room (never a friend room)');
assert.strictEqual(A.trackKey, 'tutorial');
for (let i = 0; i < 100 && ![...room.sim.players.values()].some((p) => p.account); i++) await settle(5);
const me = () => room.sim.players.get(A.id);
let n = 0;
const corr = [];
while (room.sim.phase !== 'play' && n++ < 200) { room.step(); await settle(0); }
assert.strictEqual(me().sens, 1.3, 'the server steers with the sensitivity the phone joined with');
let resetDone = false;
const kinds = [];
n = 0;
while (A.phase !== 'end' && n++ < 30 * 150) {
  A.tickN++;
  if (room.sim.time > 0 && me().alive) {
    const inp = tutor(room.sim, me(), room.sim.hud().tut);
    A.setInput({ st: 0, th: 1, dr: inp.dr, ha: inp.ha, hm: inp.hm });
    if (inp.f) A.fire();
  }
  // one RESET from the phone mid-run (on the drift step, so the run still completes)
  if (!resetDone && room.sim.hud().tut === 'drift' && room.sim.time > 0) { A.reset(); resetDone = true; }
  A.step(); A.flush();
  room.step();
  for (const e of A.drainEvents()) if (!Array.isArray(e)) kinds.push(e.k + (e.step ? ':' + e.step : ''));
  if (A.corr != null && A.predicting()) corr.push(A.corr);
}
assert.strictEqual(A.phase, 'end', 'the tutorial run ended');
assert.ok(kinds.includes('reset'), 'the phone saw its reset');
assert.deepStrictEqual(kinds.filter((k) => k.startsWith('tut:')), TUT_STEPS.map((s) => 'tut:' + s), 'the phone saw every step, in order');
assert.strictEqual(A.results.tut, 1, 'end says the tutorial was completed');
corr.sort((x, y) => x - y);
assert.ok(corr.length > 200, `${corr.length} predicted ticks`);
assert.ok(corr[corr.length >> 1] < 1, `joystick steering: median prediction correction ${corr[corr.length >> 1]} px`);
assert.ok(corr[Math.floor(corr.length * 0.95)] < 25, `95th percentile correction ${corr[Math.floor(corr.length * 0.95)]} px`);
console.log(`joystick prediction: median ${corr[corr.length >> 1].toFixed(3)} px, p95 ${corr[Math.floor(corr.length * 0.95)].toFixed(3)} px over ${corr.length} ticks`);
for (let i = 0; i < 100 && !A.progress; i++) await settle(10);
assert.ok(A.progress && A.progress.tut === 1, 'progress message carries the flag');
const pr = db.progress('u1');
assert.strictEqual(pr.race.tut, 1, 'account flag saved');
assert.strictEqual(pr.coins, coins0, 'no coins');
assert.ok(!pr.race.races, 'no race counted');
console.log('race-tutorial: ok');
