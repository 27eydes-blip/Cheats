// ELIMINATION (the flagship mode): the cut schedule, the black hole, the racer in danger, the takedown
// boost, the final duel, tie-breaks, disconnects and quitters, spectators (emotes, reconnecting after
// the cut), smart bots only with FILL WITH BOTS on, rewards (placement + takedown + survival bonus,
// the 'Last Racer Standing' title) and old saves. Everything server-side and deterministic.
import assert from 'node:assert';
import { DT } from '../public/race/physics.js';
import { ELIM, elimInterval, elimSchedule, EMOTES } from '../public/race/protocol.js';
import { applyRace, raceResult, elimBonus, ELIM_PAY, ELIM_TITLE } from '../src/race/results.js';
import { newProgress, normalize, applyMatch } from '../public/progression.js';
import { TITLES, priceOf, rewardSource } from '../public/catalog.js';
import { earnHint } from '../public/progression.js';
import { botInput, ELIM_BOT } from '../src/race/bots.js';
import { mkRace, ticks, startRace, collectEvents, place } from './race-helpers.js';
import { raceEnv, fakeD1, open, settle } from './race-harness.js';
import worker, { RaceRoom, RaceMatchmaker } from '../src/worker.js';
import { RaceClient } from '../public/race/net.js';

const elim = (o = {}) => mkRace({ mode: 'elim', track: 'desert', ...o });
const runTo = (sim, t) => { while (sim.phase === 'play' && sim.time < t - 1e-9) sim.tick(); };
const runToEnd = (sim, max = 30 * 400) => { let n = 0; while (sim.phase !== 'end' && n++ < max) sim.tick(); };
const outs = (ev) => ev.filter((e) => e[1] === 'elim');
// place a car s px along the first lap (d across), with its lap and checkpoint to match
function at(sim, p, s, d = 0, v = 0) {
  place(sim, p, s, d, v);
  const G = sim.T.gates;
  let k = 0; for (let i = 0; i < G.length; i++) if (G[i].s <= s) k = i;
  p.lap = p.maxLap = 1; p.cp = k;
  return p;
}

// ---------------------------------------------------------------- the cut schedule
assert.deepStrictEqual([elimInterval(9), elimInterval(5), elimInterval(4), elimInterval(3), elimInterval(2)], [18, 18, 12, 12, 8]);
assert.deepStrictEqual(elimSchedule(10), [25, 43, 61, 79, 97, 115, 127, 139, 147], 'first cut 25 s, every 18 s, every 12 s from 4 left, 8 s duel');
assert.deepStrictEqual(elimSchedule(4), [25, 37, 45]);
assert.deepStrictEqual(elimSchedule(2), [25], 'two racers: one cut at 25 s');
{ // the HUD fields follow the timer: nx counts down, iv is the running interval
  const sim = elim({ fillBots: true, botLevel: 'normal' }); sim.bhOff = true;
  const [A] = startRace(sim, ['volt']); A.bot = true;
  const ev = collectEvents(sim);
  runTo(sim, 10);
  let md = sim.hud();
  assert.ok(Math.abs(md.nx - 15) < DT * 1.5 && md.iv === 25 && md.left === 10, `nx ${md.nx} iv ${md.iv}`);
  runTo(sim, 25 + DT);
  md = sim.hud();
  assert.strictEqual(outs(ev).length, 1); assert.strictEqual(outs(ev)[0][4], 'cut');
  assert.ok(md.iv === 18 && Math.abs(md.nx - 18) < DT * 2, 'next cut 18 s later');
  runToEnd(sim);
  const cut = outs(ev);
  assert.deepStrictEqual(cut.map((e) => e[4]), Array(9).fill('cut'));
  cut.forEach((e, i) => assert.ok(Math.abs(e[0] - elimSchedule(10)[i]) < DT * 1.5, `cut ${i + 1} at ${e[0]}`));
  assert.strictEqual(ev.filter((e) => e[1] === 'duel').length, 1, 'one FINAL DUEL');
  const duel = ev.find((e) => e[1] === 'duel');
  assert.ok(Math.abs(duel[0] - 139) < DT * 1.5, 'the duel starts at the cut that leaves two');
}

// ---------------------------------------------------------------- the racer in danger
{
  const sim = elim(); sim.bhOff = true;
  const [A, B, C] = startRace(sim, ['volt', 'volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 3000); at(sim, B, 2600); at(sim, C, 2200);
  ticks(sim, 2);
  assert.strictEqual(sim.hud().dg, C.id, 'last place is in danger');
  at(sim, C, 3400); ticks(sim, 2);
  assert.strictEqual(sim.hud().dg, B.id, 'pass them and the danger moves');
}

// ---------------------------------------------------------------- tie at a cut (documented tie-break)
// Equal race distance (to the pixel): the racer who was behind on the previous tick is cut; still
// equal (e.g. from the very start) the later grid slot (higher id) is behind.
{
  const sim = elim(); sim.bhOff = true;
  const [A, B] = startRace(sim, ['volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 2000, -60); at(sim, B, 2000, 60);
  ticks(sim, 2);
  assert.strictEqual(Math.round(A.prog), Math.round(B.prog), 'level');
  assert.strictEqual(sim.hud().dg, B.id, 'level from the start: the higher id is behind');
  const ev = collectEvents(sim);
  runToEnd(sim);
  assert.deepStrictEqual(outs(ev).map((e) => e[2]), [B.id]);
  assert.deepStrictEqual([A.rank, B.rank, B.place], [1, 2, 2]);
}
{
  const sim = elim(); sim.bhOff = true;
  const [A, B] = startRace(sim, ['volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 1990, -60); at(sim, B, 2000, 60);
  ticks(sim, 2);
  assert.strictEqual(sim.hud().dg, A.id, 'A behind');
  at(sim, A, 2000, -60); ticks(sim, 2); // now level: A was behind on the previous tick, so A stays behind
  assert.strictEqual(Math.round(A.prog), Math.round(B.prog));
  assert.strictEqual(sim.hud().dg, A.id, 'level: the one behind a tick ago is still behind');
  runToEnd(sim);
  assert.ok(A.out && !B.out && B.rank === 1);
}

// ---------------------------------------------------------------- the black hole
{ // it starts behind the grid, eases up to speed, speeds up after each cut, stays on the pack's heels
  const sim = elim({ fillBots: true, botLevel: 'normal' });
  const [A] = startRace(sim, ['volt']); A.bot = true;
  const back = Math.min(...sim.order.map((p) => p.prog));
  assert.ok(Math.abs(sim.bh - (back - ELIM.hole.start)) < 1, 'behind the back of the grid');
  ticks(sim, 1);
  assert.strictEqual(sim.hud().bv, 0, 'still on the grid');
  assert.strictEqual(sim.holeSpeed(), 0);
  runTo(sim, ELIM.hole.ramp + 0.5);
  assert.strictEqual(sim.holeSpeed(), ELIM.hole.base, 'full speed after the ramp');
  const speeds = [];
  const orig = sim.eliminate.bind(sim);
  sim.eliminate = (p, c) => { orig(p, c); speeds.push(sim.holeSpeed()); };
  let maxLag = 0;
  while (sim.phase === 'play') {
    const n0 = sim.outCount;
    sim.tick();
    const L = sim.order.filter((p) => !p.out);
    if (sim.outCount === n0 && L.length) maxLag = Math.max(maxLag, L.at(-1).prog - sim.bh); // (a cut moves "last" ahead: the leash catches up next tick)
  }
  assert.ok(maxLag <= ELIM.hole.leash + 1, `never more than the leash behind the last racer (${maxLag})`);
  assert.ok(sim.cuts >= 6, 'cuts happened');
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] >= speeds[i - 1], 'faster after every cut');
  assert.ok(speeds.at(-1) > ELIM.hole.base, 'the hole got faster');
}
{ // touching it eliminates you (bots off, two humans: the one who never drives is swallowed)
  const sim = elim();
  const [A, B] = startRace(sim, ['volt', 'volt']);
  A.bot = true; // A drives (autopilot), B never touches the throttle
  const ev = collectEvents(sim);
  runToEnd(sim);
  const o = outs(ev);
  assert.strictEqual(o.length, 1);
  assert.deepStrictEqual([o[0][2], o[0][4]], [B.id, 'hole'], 'the black hole took B');
  assert.ok(o[0][0] < ELIM.first, `before the first cut (${o[0][0]} s)`);
  assert.ok(B.prog - sim.bh < ELIM.hole.reach + 1, 'it touched them');
  assert.deepStrictEqual([A.rank, B.rank, B.place, B.outBy], [1, 2, 2, 'hole']);
  assert.ok(Number.isFinite(o[0][5]) && Number.isFinite(o[0][6]), 'where it happened (for the effect)');
}
{ // it reaches several at once: worst first, distinct places, and it never takes the last racer
  const sim = elim(); sim.bhOff = true;
  const [A, B, C] = startRace(sim, ['volt', 'volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 2100); at(sim, B, 2050, 50); at(sim, C, 2000, -50);
  ticks(sim, 2);
  sim.bhOff = false; sim.bh = A.prog + 500; // the hole swallowed the whole road under them
  const ev = collectEvents(sim);
  ticks(sim, 1);
  assert.deepStrictEqual(outs(ev).map((e) => [e[2], e[3], e[4]]), [[C.id, 3, 'hole'], [B.id, 2, 'hole']], 'worst first');
  assert.ok(!A.out && sim.phase === 'end' && A.rank === 1, 'the best placed survives and wins');
}
{ // the warning distance: me.bg = your lead on the hole (px)
  const sim = elim(); sim.bhOff = true;
  const [A, B] = startRace(sim, ['volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 3000); at(sim, B, 3200); ticks(sim, 1);
  sim.bh = A.prog - 600;
  const me = sim.meMsg(A);
  assert.strictEqual(me.bg, 600);
  assert.ok(me.bg < ELIM.hole.warn, 'inside the warning range');
  assert.strictEqual(sim.hud().bh, Math.round(sim.bh));
}
{ // a wreck comes back where it crashed (on the racing line), not at the last checkpoint behind the hole
  const sim = elim(); sim.bhOff = true;
  const [A, B] = startRace(sim, ['volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 2600, 40, 600); ticks(sim, 1);
  const before = A.prog;
  sim.destroy(A, null, 'fall');
  ticks(sim, 61);
  assert.ok(A.alive, 'back');
  assert.ok(A.prog >= before - 100, `respawned near the wreck (${Math.round(A.prog - before)} px)`);
}

// ---------------------------------------------------------------- takedown boost
{
  const sim = elim(); sim.bhOff = true;
  const ev = collectEvents(sim);
  const [A, B, C] = startRace(sim, ['volt', 'volt', 'volt']);
  ticks(sim, 4 * 30);
  at(sim, A, 3000); at(sim, B, 2600); at(sim, C, 2000); ticks(sim, 2);
  // knocking a car out
  sim.destroy(B, A, 'missile');
  assert.deepStrictEqual(sim.events.find((e) => e[0] === 'burst'), ['burst', A.id, 'ko']);
  assert.ok(Math.abs(A.car.boostT - ELIM.burst.t) < 1e-9 && A.car.boostP === ELIM.burst.p, '2 s burst for the takedown');
  // hitting the racer in danger (C is last)
  ticks(sim, 1);
  assert.strictEqual(sim.dangerId, C.id);
  A.car.boostT = 0;
  assert.ok(sim.damage(C, A, 5, 'arc'));
  assert.deepStrictEqual(sim.events.find((e) => e[0] === 'burst'), ['burst', A.id, 'danger']);
  assert.ok(Math.abs(A.car.boostT - ELIM.burst.t) < 1e-9, '2 s burst for hitting the racer in danger');
  // hitting someone who is not in danger: no burst
  ticks(sim, 70); A.car.boostT = 0; C.protT = 0;
  at(sim, C, 3200); ticks(sim, 2); // C passes B (B is in danger now)
  assert.strictEqual(sim.dangerId, B.id);
  assert.ok(sim.damage(C, A, 5, 'arc'));
  assert.strictEqual(A.car.boostT, 0, 'no burst for an ordinary hit');
  assert.strictEqual(A.bursts, 2);
  void ev;
  // other modes never burst
  const g = mkRace({ mode: 'grand' });
  const [P, Q] = startRace(g, ['volt', 'volt']); ticks(g, 4 * 30);
  g.destroy(Q, P, 'missile');
  assert.strictEqual(P.car.boostT, 0, 'Grand Race: no takedown boost');
}

// ---------------------------------------------------------------- final duel, bots off with 2 humans
{
  const sim = elim({ fillBots: false });
  const [A, B] = startRace(sim, ['volt', 'brick']);
  assert.strictEqual(sim.players.size, 2, 'bots off: just the two humans');
  assert.ok([...sim.players.values()].every((p) => !p.wasBot));
  A.bot = B.bot = true; // (both on autopilot: a fair race)
  const ev = collectEvents(sim);
  ticks(sim, 3 * 30 + 2);
  const duel = ev.filter((e) => e[1] === 'duel');
  assert.strictEqual(duel.length, 1, 'two racers: FINAL DUEL from GO');
  assert.strictEqual(sim.hud().duel, 1);
  assert.ok(Math.abs(sim.hud().nx - (ELIM.first - sim.time)) < 0.01, 'the first cut is still at 25 s');
  runToEnd(sim);
  const o = outs(ev);
  assert.strictEqual(o.length, 1);
  assert.ok(Math.abs(o[0][0] - 25) < DT * 1.5 || o[0][4] === 'hole');
  assert.ok(sim.phase === 'end' && sim.order[0].rank === 1 && !sim.order[0].out);
  assert.ok([...sim.players.values()].every((p) => !p.wasBot), 'still no bots');
}
{ // the hole shrinks the timer: 3 racers, the hole takes one early -> the duel's 8 s, not 25 s
  const sim = elim(); sim.bhOff = true;
  const [A, B, C] = startRace(sim, ['volt', 'volt', 'volt']);
  ticks(sim, 30 * 4);
  at(sim, A, 3000); at(sim, B, 2900); at(sim, C, 2000); ticks(sim, 2);
  sim.bhOff = false; sim.bh = C.prog;
  ticks(sim, 1);
  assert.ok(C.out && C.outBy === 'hole');
  assert.ok(sim.duel, 'two left: the final duel');
  assert.ok(Math.abs(sim.elimNext - sim.time - ELIM.duel) < 1e-6, 'the cut comes 8 s later');
  assert.strictEqual(sim.cutIv, ELIM.duel);
}

// ---------------------------------------------------------------- disconnect during a cut, then reconnect = spectate
{
  const sent = new Map();
  const sim = elim({ fillBots: false }); sim.bhOff = true;
  sim.send = (id, m) => { if (m.t === 's') sent.set(id, m); };
  const [A, B, C] = startRace(sim, ['volt', 'volt', 'volt']);
  A.bot = B.bot = true;
  runTo(sim, 24.9);
  sim.leave(C.id); // C's connection drops just before the cut (bots off: their car stops)
  sent.delete(C.id);
  const ev = collectEvents(sim);
  runTo(sim, 25 + DT * 2);
  const o = outs(ev);
  assert.deepStrictEqual(o.map((e) => [e[2], e[4]]), [[C.id, 'cut']], 'the cut happens on time and takes the dropped racer (last)');
  assert.ok(!sent.has(C.id), 'nothing sent to a dropped socket');
  // C comes back: same car, knocked out = spectating (snapshots keep coming, me.out = place)
  sim.rejoin(C.id);
  ticks(sim, 2);
  const m = sent.get(C.id);
  assert.ok(m && m.me.out === 3, 'spectating in 3rd');
  assert.ok(!m.c.some((r) => r[0] === C.id), 'their car is off the track');
  assert.ok(m.c.length === 2 && m.rk[0] === sim.order[0].id, 'they see the race (the leader first)');
  // spectators send emotes (one per 1.5 s); racers cannot
  const ev2 = collectEvents(sim);
  sim.input(C.id, { t: 'emote', e: 1 }); sim.input(A.id, { t: 'emote', e: 2 }); sim.input(C.id, { t: 'emote', e: 99 });
  ticks(sim, 1);
  sim.input(C.id, { t: 'emote', e: 0 }); ticks(sim, 1);
  assert.deepStrictEqual(ev2.filter((e) => e[1] === 'emo').map((e) => [e[2], e[3]]), [[C.id, 1]], 'one emote, from the spectator, rate-limited');
  assert.strictEqual(EMOTES.length, 4);
  ticks(sim, 30 * 2); sim.input(C.id, { t: 'emote', e: 3 }); ticks(sim, 1);
  assert.strictEqual(ev2.filter((e) => e[1] === 'emo').length, 2, 'again after the gap');
}
{ // with bots on, a dropped racer's car is driven by a bot: the schedule is untouched
  const sim = elim({ fillBots: true, botLevel: 'normal' }); sim.bhOff = true;
  const [A] = startRace(sim, ['volt']);
  const ev = collectEvents(sim);
  runTo(sim, 20); sim.leave(A.id);
  runTo(sim, 44);
  assert.deepStrictEqual(outs(ev).map((e) => Math.round(e[0])), [25, 43]);
  assert.ok(A.bot && !A.left, 'a bot drives their car until they are back');
}
{ // the same thing end to end through the race room: drop before the cut, reconnect after it = spectate
  const env = raceEnv({ RaceRoom, RaceMatchmaker }, fakeD1());
  const client = (params) => new RaceClient({ base: '', params, transport: (url) => open(worker, env, url) });
  const tick = (room, n = 1, cs = []) => { for (let i = 0; i < n; i++) { for (const c of cs) c.step(); room.step(); } };
  const A = client({ name: 'Ann', driver: 'volt', room: 'cutx', mode: 'elim', track: 'desert', bots: 0 });
  await A.connect(); await settle();
  const B = client({ name: 'Ben', driver: 'wisp', room: 'cutx' }); await B.connect(); await settle();
  const C = client({ name: 'Cat', driver: 'dune', room: 'cutx' }); await C.connect(); await settle();
  const room = env.rooms.get('room:CUTX');
  A.send({ t: 'host', start: 1 }); await settle(); tick(room);
  assert.strictEqual(room.sim.phase, 'play');
  room.sim.bhOff = true;
  A.setInput({ th: 1 }); B.setInput({ th: 1 }); C.setInput({ th: 0 });
  while (room.sim.time < 24) { tick(room, 1, [A, B, C]); await settle(0); }
  C.ws.close(); await settle(); // dropped (not a bye): C will try to rejoin
  const cid = C.id;
  while (room.sim.time < 25.5) { tick(room, 1, [A, B]); await settle(0); }
  const pc = room.sim.players.get(cid);
  assert.ok(pc.out && pc.place === 3, 'cut while away');
  await settle(1200); // the client's automatic rejoin
  tick(room, 3, [A, B]); await settle();
  assert.strictEqual(C.phase, 'race', 'back in the race');
  assert.strictEqual(C.me.out, 3, 'as a spectator');
  const v = C.view();
  assert.ok(v && v.cars.length === 2 && !v.cars.some((c) => c.me), 'watching the two left');
  assert.ok(v.hud.duel === 1, 'they see the final duel');
  A.leave(); B.leave(); C.leave();
}

// ---------------------------------------------------------------- quitting: the last two leaving
{
  const rows = [];
  const sim = elim({ fillBots: false, hooks: { finished: (r) => rows.push(...r) } }); sim.bhOff = true;
  const [A, B, C] = startRace(sim, ['volt', 'volt', 'volt']);
  A.bot = true;
  runTo(sim, 26); // C (never drove) was cut at 25 s
  assert.ok(C.out);
  // the spectator leaves: their settled place counts, not last
  assert.strictEqual(sim.abandon(C.id).rank, 3, 'a spectator who leaves keeps their place');
  // one of the last two quits (bots off): they are out now and the other one wins
  const rb = sim.abandon(B.id);
  assert.strictEqual(rb.rank, 3, 'a quitter is recorded last');
  sim.leave(B.id);
  const ev = collectEvents(sim);
  ticks(sim, 1);
  assert.deepStrictEqual(outs(ev).map((e) => [e[2], e[4]]), [[B.id, 'left']]);
  assert.ok(sim.phase === 'end' && A.rank === 1, 'the last one in wins');
  assert.deepStrictEqual(rows.map((r) => r.p.id), [A.id], 'the race end reports only the one still here');
}
{ // both of the last two leave on the same tick: the race just ends
  const sim = elim({ fillBots: false }); sim.bhOff = true;
  const [A, B] = startRace(sim, ['volt', 'volt']);
  ticks(sim, 30 * 5);
  sim.abandon(A.id); sim.leave(A.id); sim.abandon(B.id); sim.leave(B.id);
  ticks(sim, 1);
  assert.strictEqual(sim.phase, 'end');
  assert.strictEqual(sim.racers(), 1, 'one of them is still the winner on paper');
}

// ---------------------------------------------------------------- smart bots (FILL WITH BOTS on only)
{
  const sim = elim({ fillBots: true, botLevel: 'easy' }); sim.bhOff = true;
  startRace(sim, ['volt']);
  const bots = [...sim.players.values()].filter((p) => p.wasBot);
  assert.strictEqual(bots.length, 9, 'bots fill the field');
  runTo(sim, 10);
  const live = sim.order.filter((p) => !p.out), back = live.at(-1);
  // far from a cut: an easy bot cruises
  if (back.wasBot) { botInput(sim, back); assert.strictEqual(back.ai.push, 0, 'no rush at 10 s'); }
  runTo(sim, ELIM.first - ELIM_BOT.cutSoon + 1);
  const b2 = sim.order.filter((p) => !p.out && p.wasBot).at(-1);
  botInput(sim, b2);
  const pos = sim.order.filter((p) => !p.out).indexOf(b2);
  assert.ok(pos >= live.length - ELIM_BOT.backPlaces, 'a bot near the back');
  assert.strictEqual(b2.ai.push, 1, 'flat out with the cut coming');
  // the black hole close behind: flat out too
  const front = sim.order.find((p) => p.wasBot && !p.out);
  sim.bhOff = false; sim.bh = front.prog - 400;
  botInput(sim, front);
  assert.strictEqual(front.ai.push, 1, 'flat out with the hole behind');
  // the racer in danger close by is the target
  const d = sim.players.get(sim.dangerId);
  const hunter = sim.order.filter((p) => p.wasBot && !p.out && p !== d).find((p) => Math.hypot(p.car.x - d.car.x, p.car.y - d.car.y) < ELIM_BOT.preyR);
  if (hunter && d.ghostT <= 0 && d.protT <= 0) { botInput(sim, hunter); assert.strictEqual(hunter.ai.prey, d, 'weapons and items go for the racer in danger'); }
}
{ // smart bots survive the black hole far better than they would standing still: a whole race of
  // normal bots on every track loses only a few to it, and every race finishes deterministically
  const runs = [];
  for (const track of ['desert', 'frozen', 'ashlands', 'neon']) {
    const sim = elim({ track, seed: 11, fillBots: true, botLevel: 'normal' });
    const [A] = startRace(sim, ['volt']); A.bot = true;
    const ev = collectEvents(sim);
    runToEnd(sim);
    assert.strictEqual(sim.phase, 'end');
    const o = outs(ev);
    assert.strictEqual(o.length, 9, `${track}: nine out`);
    runs.push(o.filter((e) => e[4] === 'hole').length);
    // determinism: the same seed gives the same race
    const sim2 = elim({ track, seed: 11, fillBots: true, botLevel: 'normal' });
    const [A2] = startRace(sim2, ['volt']); A2.bot = true;
    const ev2 = collectEvents(sim2);
    runToEnd(sim2);
    assert.deepStrictEqual(outs(ev2), o, `${track}: deterministic`);
  }
  assert.ok(runs.reduce((a, b) => a + b, 0) <= 12, `the hole takes a few, not most (${runs})`);
}

// ---------------------------------------------------------------- rewards
{
  assert.deepStrictEqual(elimBonus({ kills: 3, surv: 95 }), { ko: 6, surv: 9 });
  assert.deepStrictEqual(elimBonus({ kills: 50, surv: 9999 }), { ko: ELIM_PAY.ko * ELIM_PAY.koCap, surv: ELIM_PAY.survCap }, 'capped');
  assert.deepStrictEqual(elimBonus({}), { ko: 0, surv: 0 });
  const day = 20000;
  const row = (o) => ({ p: {}, rank: 1, players: 10, mode: 'elim', track: 'neon', kills: 2, steals: 0, mc: 12, time: null, bestLap: null, finished: false, driver: 'volt', surv: 147, ...o });
  const r = { ...raceResult(row()), day };
  assert.strictEqual(r.secs, 147, 'paid for the time survived');
  const win = applyRace(newProgress(), r);
  const base = applyMatch(newProgress(), { ...r });
  assert.strictEqual(win.delta, 8, 'a win: +8 trophies (placement)');
  assert.strictEqual(win.coins, base.coins + 12 + 4 + 14, 'placement pay + match coins + takedown bonus + survival bonus');
  assert.deepStrictEqual(win.elim, { ko: 4, surv: 14, secs: 147, win: 1, title: 1, titleId: ELIM_TITLE });
  assert.ok(win.progress.owned.includes(ELIM_TITLE), 'Last Racer Standing earned');
  assert.strictEqual(win.progress.race.elimWins, 1);
  const again = applyRace(JSON.parse(JSON.stringify(win.progress)), r);
  assert.strictEqual(again.elim.title, 0, 'earned once');
  assert.strictEqual(again.progress.owned.filter((x) => x === ELIM_TITLE).length, 1);
  assert.strictEqual(again.progress.race.elimWins, 2);
  const fifth = applyRace(newProgress(), { ...raceResult(row({ rank: 5, kills: 1, surv: 79 })), day });
  assert.deepStrictEqual(fifth.elim, { ko: 2, surv: 7, secs: 79, win: 0, title: 0, titleId: null });
  assert.ok(!fifth.progress.owned.includes(ELIM_TITLE), 'no title without the win');
  const last = applyRace(newProgress(), { ...raceResult(row({ rank: 10, kills: 0, surv: 25 })), day });
  assert.ok(last.delta <= 0 && last.coins < fifth.coins && fifth.coins < win.coins, 'better place, better pay');
  // the title is cosmetic, earned only, never sold
  assert.strictEqual(TITLES[ELIM_TITLE], 'Last Racer Standing');
  assert.strictEqual(priceOf(ELIM_TITLE), null);
  assert.ok(rewardSource(ELIM_TITLE));
  assert.ok(/Win an Elimination race/.test(earnHint(ELIM_TITLE, 'Last Racer Standing')));
  // the sim's result row carries the seconds survived
  const rows = [];
  const sim = elim({ fillBots: false, hooks: { finished: (x) => rows.push(...x) } }); sim.bhOff = true;
  const [A, B] = startRace(sim, ['volt', 'volt']); A.bot = true;
  runToEnd(sim);
  assert.deepStrictEqual(rows.map((x) => [x.p.id, x.rank, x.surv]).sort(), [[A.id, 1, 25], [B.id, 2, 25]].sort());
}

// ---------------------------------------------------------------- old saves
{
  // a save from before this update: no race block, no titles, coins and trophies of its own
  const old = { coins: 321, gems: 7, trophies: { volt: 140 }, xp: 900, owned: ['tracker'], equipped: { title: 'tracker' } };
  const n = normalize(JSON.parse(JSON.stringify(old)));
  assert.deepStrictEqual([n.coins, n.gems, n.trophies.volt, n.xp, n.equipped.title], [321, 7, 140, 900, 'tracker'], 'old save loads as it was');
  assert.ok(!n.owned.includes(ELIM_TITLE) && n.race.elimWins === undefined, 'nothing new handed out on load');
  // a Grand Race result on an old save: exactly as before (no elim fields)
  const g = applyRace(JSON.parse(JSON.stringify(old)), { ...raceResult({ p: {}, rank: 2, players: 10, mode: 'grand', track: 'desert', kills: 1, steals: 0, mc: 5, time: 80, bestLap: 25, finished: true, driver: 'volt' }), day: 20000 });
  assert.ok(!('elim' in g) && !g.progress.owned.includes(ELIM_TITLE));
  assert.ok(g.progress.coins >= 321 + g.coins, "the old coins are kept (plus the race pay and any level-ups)");
  // an Elimination loss on an old save keeps the equipped title and everything else
  const e = applyRace(JSON.parse(JSON.stringify(old)), { ...raceResult({ p: {}, rank: 4, players: 10, mode: 'elim', track: 'desert', kills: 0, steals: 0, mc: 3, time: null, bestLap: null, finished: false, driver: 'volt', surv: 100 }), day: 20000 });
  assert.deepStrictEqual([e.progress.equipped.title, e.progress.gems, e.progress.owned.includes('tracker')], ['tracker', 7, true]);
}

console.log('race-elim: ok');
