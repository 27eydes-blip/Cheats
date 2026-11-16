// Hunt Racers authoritative sim: lap counting (no cutting), respawn timing, items, weapons, bounty.
import assert from 'node:assert';
import { RESPAWN_TICKS, COINS } from '../src/race/sim.js';
import { DT, TICK_RATE, BOOSTS, DRIVERS } from '../public/race/physics.js';
import { ITEMS, WEAPONS, ITEM_IDS, rollItem } from '../public/race/items.js';
import { rng } from '../public/shared.js';
import { FLAG } from '../public/race/protocol.js';
import { mkRace, ticks, startRace, toGo, place, drive, driver, collectEvents } from './race-helpers.js';

// ---------------------------------------------------------------- laps and anti-cut
{
  const sim = mkRace();
  const [A] = startRace(sim);
  toGo(sim);
  const G = sim.T.gates, N = G.length, L = sim.T.L;
  assert.strictEqual(A.lap, 0); assert.strictEqual(A.cp, N - 1, 'grid is behind the line');
  const cross = (s, back = false) => { place(sim, A, s, 0, 500, 0, back); drive(sim, A, { th: 1 }, 8); };
  cross(L - 80);
  assert.deepStrictEqual([A.lap, A.cp], [1, 0], 'crossing the line starts lap 1');
  cross(L - 80);
  assert.deepStrictEqual([A.lap, A.cp], [1, 0], 'crossing the line again without the checkpoints does not count');
  cross(G[3].s - 80);
  assert.strictEqual(A.cp, 0, 'skipping ahead to checkpoint 3 does not count');
  cross(60, true);
  assert.deepStrictEqual([A.lap, A.cp], [0, N - 1], 'reversing over the line takes the lap back');
  cross(L - 80);
  assert.deepStrictEqual([A.lap, A.cp], [1, 0]);
  assert.strictEqual(A.lapTimes.length, 0, 'no lap time from back-and-forth');
  for (let k = 1; k < N; k++) { cross(G[k].s - 80); assert.strictEqual(A.cp, k, `checkpoint ${k} in order`); }
  cross(L - 80);
  assert.deepStrictEqual([A.lap, A.cp], [2, 0], 'a real lap counts');
  assert.strictEqual(A.lapTimes.length, 1);
  assert.strictEqual(A.mc, COINS.lap, 'lap coins');
  // progress (race position) follows the checkpoints, not the raw position
  assert.ok(A.prog > L && A.prog < L + G[1].s, 'progress on lap 2');
}

// ---------------------------------------------------------------- a full solo run: 3 laps, finish, times
{
  const sim = mkRace({ mode: 'trial', track: 'neon' });
  const [A] = startRace(sim, ['flicker']);
  A.bot = true; // the autopilot drives the human's car
  let n = 0;
  while (sim.phase !== 'end' && n++ < 30 * 200) sim.tick();
  assert.strictEqual(sim.phase, 'end');
  assert.ok(A.finished && A.place === 1);
  assert.strictEqual(A.lapTimes.length, 3, 'three laps timed');
  assert.strictEqual(A.bestLap, Math.min(...A.lapTimes));
  const sum = A.lapTimes.reduce((s, v) => s + v, 0);
  assert.ok(A.finishTime >= sum && A.finishTime - sum < 3, 'finish time = run-up + lap times');
}

// ---------------------------------------------------------------- destroyed -> back in exactly 2 s at the last checkpoint
{
  const sim = mkRace();
  const [A, B] = startRace(sim);
  toGo(sim);
  const G = sim.T.gates;
  B.lap = 2; B.cp = 3;
  place(sim, B, G[3].s + 900, 0, 600);
  ticks(sim, 2);
  const lap = B.lap, cp = B.cp;
  sim.damage(B, A, 999, 'test');
  assert.strictEqual(B.alive, false);
  const t0 = sim.tickN;
  while (!B.alive) sim.tick();
  assert.strictEqual(sim.tickN - t0, RESPAWN_TICKS);
  assert.strictEqual((sim.tickN - t0) * DT, 2, 'exactly 2 seconds');
  assert.deepStrictEqual([B.lap, B.cp], [lap, cp], 'lap progress kept');
  const s = sim.T.toMain(B.car.pc, B.car.ps);
  assert.ok(s > G[3].s && s < G[3].s + 400, 'back on track just past the last checkpoint');
  assert.strictEqual(B.hp, B.maxHp, 'full armor');
  assert.ok(B.ghostT > 0 && sim.flags(B) & FLAG.GHOST, 'briefly untouchable');
  assert.strictEqual(sim.damage(B, A, 50, 'test'), false, 'ghosts take no damage');
  assert.strictEqual(A.kills, 1, 'takedown credited');
  // a wreck on lava a moment after being hit is still credited to the hitter
  ticks(sim, 60);
  sim.damage(B, A, 10, 'test');
  ticks(sim, 30);
  sim.damage(B, null, 999, 'lava', true);
  assert.strictEqual(A.kills, 2, 'credit window');
}

// ---------------------------------------------------------------- items
function itemDuel(item, setup) {
  const sim = mkRace();
  const [A, B] = startRace(sim);
  toGo(sim);
  const ev = collectEvents(sim);
  setup(sim, A, B);
  A.item = item;
  return { sim, A, B, ev };
}
{ // homing missile hits the racer ahead and spins them
  const { sim, A, B, ev } = itemDuel('missile', (s, A, B) => { place(s, A, 300); place(s, B, 1250, 60); ticks(s); });
  drive(sim, A, { i: 1 }, 1);
  assert.strictEqual(A.item, null, 'used');
  drive(sim, A, {}, 45);
  assert.strictEqual(B.hp, B.maxHp - ITEMS.missile.dmg, 'missile damage');
  assert.ok(ev.some((e) => e[1] === 'hit' && e[2] === B.id && e[4] === 'missile'));
}
{ // shield eats the missile
  const { sim, A, B, ev } = itemDuel('missile', (s, A, B) => { place(s, A, 300); place(s, B, 1250, 60); B.shieldT = ITEMS.shield.t; ticks(s); });
  drive(sim, A, { i: 1 }, 45);
  assert.strictEqual(B.hp, B.maxHp, 'shield blocked it');
  assert.strictEqual(B.shieldT, 0, 'shield used up');
  assert.ok(ev.some((e) => e[1] === 'shield' && e[2] === B.id));
}
{ // shield item
  const { sim, A } = itemDuel('shield', (s, A) => place(s, A, 500));
  drive(sim, A, { i: 1 }, 1);
  assert.ok(A.shieldT > ITEMS.shield.t - 0.1);
}
{ // rocket volley straight ahead
  const { sim, A, B } = itemDuel('rockets', (s, A, B) => { place(s, A, 500); place(s, B, 1100); ticks(s); });
  drive(sim, A, { i: 1 }, 30);
  assert.ok(B.hp <= B.maxHp - ITEMS.rockets.dmg, 'rockets hit');
  assert.strictEqual((B.maxHp - B.hp) % ITEMS.rockets.dmg, 0);
}
{ // oil slick behind: the follower spins out
  const { sim, A, B, ev } = itemDuel('oil', (s, A, B) => { place(s, A, 1200); place(s, B, 600, 0, 500); ticks(s); });
  drive(sim, A, { i: 1 }, 1);
  const dB = driver(sim, B);
  let spun = false;
  for (let i = 0; i < 60 && !spun; i++) { dB({ th: 1 }); sim.tick(); spun = B.car.spinT > 0; }
  assert.ok(spun, 'spun out on the oil');
  assert.ok(ev.some((e) => e[1] === 'spin' && e[2] === B.id && e[3] === A.id));
}
{ // spike strip: damage + slow, once per car
  const { sim, A, B } = itemDuel('spikes', (s, A, B) => { place(s, A, 1200); place(s, B, 600, 0, 500); ticks(s); });
  drive(sim, A, { i: 1 }, 1);
  const dB = driver(sim, B);
  for (let i = 0; i < 60; i++) { dB({ th: 1 }); sim.tick(); }
  assert.strictEqual(B.hp, B.maxHp - ITEMS.spikes.dmg, 'spikes hurt once');
}
{ // EMP: nearby racers can't use items or weapons and slow down
  const { sim, A, B } = itemDuel('emp', (s, A, B) => { place(s, A, 600); place(s, B, 900, 40); B.item = 'turbo'; ticks(s); });
  drive(sim, A, { i: 1 }, 1);
  assert.ok(B.empT > 2 && B.car.slowT > ITEMS.emp.slow - 0.1, 'B is disabled and slowed');
  assert.strictEqual(A.empT, 0, 'not the user');
  drive(sim, B, { i: 1, f: 1 }, 1);
  assert.strictEqual(B.item, 'turbo', 'item use blocked');
  assert.strictEqual(B.wcd, 0, 'weapon blocked');
}
{ // turbo
  const { sim, A } = itemDuel('turbo', (s, A) => place(s, A, 600));
  drive(sim, A, { i: 1, th: 1 }, 1);
  assert.ok(A.car.boostT > ITEMS.turbo.t - 0.1 && A.car.boostP === ITEMS.turbo.p); // (the item's own numbers, by level, since the weapons upgrade)
}
// position-weighted odds: the leader never gets a homing missile or EMP; the back gets catch-up items
{
  const R = rng(4), count = (place) => { const c = Object.fromEntries(ITEM_IDS.map((k) => [k, 0])); for (let i = 0; i < 4000; i++) c[rollItem(place, 10, R())]++; return c; };
  const front = count(1), back = count(10);
  assert.strictEqual(front.missile + front.emp + front.drone, 0, 'no missiles / EMPs / drones for the leader');
  // (12 items since the weapons upgrade: each share is smaller than with 7)
  assert.ok(back.missile > 600 && back.turbo > 600 && back.drone > 250, 'last place gets missiles, turbos and drones');
  assert.ok(front.shield + front.oil + front.spikes + front.ghost > 2600, 'the leader gets defensive items');
  assert.ok(back.oil + back.spikes < 300);
  assert.ok(ITEM_IDS.every((k) => count(5)[k] > 0), 'mid-pack can get anything');
}
// item boxes: picked up, respawn after a few seconds, odds favour the back of the pack
{
  const sim = mkRace();
  const [A] = startRace(sim);
  toGo(sim);
  const b = sim.T.boxes[0];
  A.car.x = b.x; A.car.y = b.y; A.car.vx = A.car.vy = 0;
  sim.tick();
  assert.ok(A.item, 'got an item');
  assert.ok(sim.boxes[0] > sim.tickN, 'box gone for now');
  place(sim, A, 300);
  ticks(sim, 3 * TICK_RATE + 1);
  assert.ok(sim.boxes[0] <= sim.tickN, 'box back after 3 s');
}

// ---------------------------------------------------------------- built-in weapons
function weapon(drv, setup, check) {
  const sim = mkRace();
  const [A, B] = startRace(sim, [drv, 'brick']);
  toGo(sim);
  const ev = collectEvents(sim);
  setup(sim, A, B);
  drive(sim, A, { f: 1 }, 1);
  check(sim, A, B, ev);
  assert.ok(A.wcd > 0, `${drv} weapon on cooldown`);
  const hp = B.hp;
  drive(sim, A, { f: 1 }, 1);
  assert.strictEqual(B.hp, hp, `${drv} cannot fire again during cooldown`);
}
weapon('volt', (s, A, B) => { place(s, A, 600); place(s, B, 850, 30); s.tick(); }, (s, A, B) => {
  assert.strictEqual(B.hp, B.maxHp - WEAPONS.volt.dmg); assert.ok(B.car.slowT > 0);
});
weapon('brick', (s, A, B) => { place(s, A, 600); place(s, B, 600, 120); s.tick(); }, (s, A, B) => {
  assert.strictEqual(B.hp, B.maxHp - WEAPONS.brick.dmg); assert.ok(Math.hypot(B.car.vx, B.car.vy) > 300, 'shoved');
});
weapon('wisp', (s, A, B) => { place(s, A, 300); place(s, B, 1000, 10); s.tick(); A.car.a = Math.atan2(B.car.y - A.car.y, B.car.x - A.car.x); }, (s, A, B, ev) => {
  assert.strictEqual(B.hp, B.maxHp - WEAPONS.wisp.dmg); assert.ok(ev.some((e) => e[1] === 'rail' && e[7] === B.id));
});
weapon('dune', (s, A, B) => { place(s, A, 1200); place(s, B, 700, 0, 450); s.tick(); }, (s, A, B) => {
  const dB = driver(s, B);
  for (let i = 0; i < 60; i++) { dB({ th: 1 }); s.tick(); }
  assert.strictEqual(B.hp, B.maxHp - WEAPONS.dune.dmg, 'sand mine');
});
weapon('rook', (s, A, B) => { place(s, A, 1200); place(s, B, 900); s.tick(); }, (s, A, B) => {
  ticks(s, 30 * 3);
  assert.ok(B.hp <= B.maxHp - WEAPONS.rook.dmg, 'turret shots');
});
weapon('flicker', (s, A, B) => { place(s, A, 600); place(s, B, 750, 0); s.tick(); }, (s, A, B) => {
  assert.strictEqual(B.hp, B.maxHp - WEAPONS.flicker.dmg, 'blink slash');
  const sA = s.T.toMain(A.car.pc, A.car.ps);
  assert.ok(sA > 600 + WEAPONS.flicker.dist * 0.8, 'blinked forward');
});
// airborne racers are safe from ground hazards
{
  const sim = mkRace();
  const [A, B] = startRace(sim);
  toGo(sim);
  place(sim, B, 900); B.car.airT = 1;
  assert.strictEqual(sim.damage(B, A, 30, 'spikes', true), false);
  assert.strictEqual(sim.damage(B, A, 30, 'missile'), true, 'a missile still finds you');
}

// ---------------------------------------------------------------- bounty
{
  const sim = mkRace();
  const [A, B] = startRace(sim);
  toGo(sim);
  const msgs = [];
  sim.send = (id, m) => { if (id === A.id && m.t === 's') msgs.push(m); };
  place(sim, A, 400); place(sim, B, 2000);
  A.lap = B.lap = 1; A.cp = 0; B.cp = 1; // B is past checkpoint 1: in the lead
  B.mc = 20;
  sim.tick();
  assert.strictEqual(sim.leaderId, B.id, 'the leader carries the bounty');
  assert.ok(sim.flags(B) & FLAG.LEADER);
  assert.strictEqual(msgs.at(-1).ld, B.id, 'everyone is told who the leader is');
  assert.ok(msgs.at(-1).c.find((r) => r[0] === B.id)[4] & FLAG.LEADER);
  const mcA = A.mc;
  sim.damage(B, A, 999, 'rail');
  const ev = sim.events.map((e) => [sim.time, ...e]);
  assert.strictEqual(B.mc, 10, 'half the leader\'s coins are stolen');
  assert.strictEqual(A.mc, mcA + 10 + COINS.takedown);
  assert.strictEqual(A.steals, 1);
  assert.ok(A.car.boostT > 0 && A.car.boostP >= BOOSTS.bounty.p, 'the attacker gets a boost');
  assert.ok(ev.some((e) => e[1] === 'steal' && e[2] === A.id && e[3] === B.id && e[4] === 10));
  // taking down someone who is not leading steals nothing
  ticks(sim, 70);
  place(sim, A, 4000); place(sim, B, 1000);
  A.cp = 2; B.cp = 0;
  sim.tick();
  assert.strictEqual(sim.leaderId, A.id);
  const before = B.mc;
  sim.damage(B, A, 999, 'rail');
  assert.strictEqual(B.mc, before);
  assert.ok(DRIVERS.brick.armor > DRIVERS.wisp.armor);
}
console.log('race-sim: ok');
