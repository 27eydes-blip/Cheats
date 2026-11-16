// UNLOCKABLE CARS (Oblivion GP Part 4): each car's one passive perk does exactly what it says,
// each has a built-in weapon (a variant of the six kinds), a hitbox sized to its art, and the
// 4 stat bars back up the cards ("OBLIVION PRIME: the best all-round stats").
import assert from 'node:assert';
import { RaceSim } from '../src/race/sim.js';
import { DRIVERS, DRIVER_IDS, NEW_DRIVER_IDS, ALL_DRIVER_IDS, CAR_R, newCar, stepCar, addBoost, BOOSTS, MINI_TURBO } from '../public/race/physics.js';
import { buildTrack } from '../public/race/trackgeom.js';
import { WEAPONS, weaponCd, ITEMS } from '../public/race/items.js';
import { driverStats } from '../public/race/preview.js';
import { BASE_LOOKS2 } from '../public/race/looks2.js';

const IDLE = { st: 0, th: 0, dr: 0 };
const dist = (a, b) => Math.hypot(a.car.x - b.car.x, a.car.y - b.car.y);
// a grand race on a track, both cars parked on the main loop; returns {sim, A, B}
function duo(da, db, mode = 'grand') {
  const sim = new RaceSim({ mode, track: 'desert', seed: 3, lobbyTime: 0, fillBots: false });
  const A = sim.addPlayer({ name: 'A', driver: da, bot: true }), B = sim.addPlayer({ name: 'B', driver: db, bot: true });
  sim.start();
  for (const p of [A, B]) { p.bot = false; p.connected = false; } // parked: no autopilot, no input
  while (sim.time <= 0.1) sim.tick();
  sim.snapshots = () => {};
  return { sim, A, B };
}
const place = (sim, p, s, d = 0) => { const c = sim.T.corridors[0]; const i = Math.floor(s / 32) % c.n; p.car = newCar(c.px[i] - c.ty[i] * d, c.py[i] + c.tx[i] * d, Math.atan2(c.ty[i], c.tx[i])); stepCar(p.car, IDLE, p.st, sim.T, 0); };
const evs = (sim, fn) => { const out = []; const t = sim.tick.bind(sim); sim.tick = () => { t(); for (const e of sim.events) out.push(e); }; fn(); sim.tick = t; return out; };

// every new car: a weapon, a perk, a look (trail colour, engine voice), a hitbox
for (const id of NEW_DRIVER_IDS) {
  const D = DRIVERS[id], W = WEAPONS[id];
  assert.ok(W && ['arc', 'pulse', 'rail', 'mine', 'turret', 'blink'].includes(W.kind), `${id}: a built-in weapon of a known kind`);
  assert.ok(D.perk, `${id}: a perk`);
  assert.ok(BASE_LOOKS2[id].trail.color && BASE_LOOKS2[id].voice === id, `${id}: its own trail colour and engine voice`);
  assert.ok(D.hit && D.hr > 10 && D.hs >= 0, `${id}: a hitbox`);
  // fair hitboxes: area within -10% .. +30% of the starters' circle
  const area = 4 * D.hr * D.hs + Math.PI * D.hr * D.hr, base = Math.PI * CAR_R * CAR_R;
  assert.ok(area > base * 0.9 && area < base * 1.3, `${id}: hitbox area ${Math.round(area)} vs ${Math.round(base)}`);
}
for (const id of DRIVER_IDS) assert.ok(DRIVERS[id].hr === CAR_R && DRIVERS[id].hs === 0, `${id}: the starters keep the round hitbox`);
assert.ok(DRIVERS.redline.hit.l >= 68 && DRIVERS.redline.hit.w <= 30, 'REDLINE ZERO: long and thin (its art is ~72 long)');
assert.ok(DRIVERS.helix.hit.w >= 40, 'HELIX: wide (its art is ~44 wide)');
console.log('weapons, looks, hitboxes: ok');

// VOIDRUNNER: drift sparks charge faster (1.2x)
{
  const T = buildTrack({ key: 'lot', name: 'Lot', arena: true, w: 30000, h: 30000, circles: [], obstacles: [] });
  const charge = (d) => { const c = newCar(15000, 15000, 0); c.vx = 600; for (let i = 0; i < 20; i++) stepCar(c, { st: 1, th: 1, dr: 1 }, DRIVERS[d], T); return c.dc; };
  const v = charge('void'), base = charge('volt');
  assert.ok(v > base * 1.15, `VOIDRUNNER charges drift sparks faster (${v.toFixed(3)} vs ${base.toFixed(3)})`);
  // SOLAR FANG: every boost lasts 25% longer (pads, mini-turbos, Turbo, bounty, bursts)
  const c = newCar(), f = newCar();
  addBoost(c, BOOSTS.pad, DRIVERS.volt); addBoost(f, BOOSTS.pad, DRIVERS.fang);
  assert.ok(Math.abs(f.boostT - BOOSTS.pad.t * 1.25) < 1e-9 && Math.abs(c.boostT - BOOSTS.pad.t) < 1e-9, 'SOLAR FANG: a pad boost lasts 25% longer');
  const mt = (d) => { const k = newCar(15000, 15000, 0); k.vx = 650; for (let i = 0; i < 80; i++) stepCar(k, { st: 1, th: 1, dr: 1 }, DRIVERS[d], T); stepCar(k, { st: 0, th: 1, dr: 0 }, DRIVERS[d], T); return k.boostT; };
  assert.ok(mt('fang') > mt('volt') * 1.2, 'SOLAR FANG: a mini-turbo lasts longer');
  // FROSTBYTE: ice drives like road (no slide)
  const ice = buildTrack({ key: 'lot', name: 'Lot', arena: true, w: 30000, h: 30000, circles: [{ x: 15000, y: 15000, r: 9000, kind: 'surf', surf: 'ice' }], obstacles: [] });
  const slide = (d) => { const k = newCar(15000, 15000, 0); k.vy = 400; k.vx = 400; for (let i = 0; i < 15; i++) stepCar(k, { st: 0, th: 0, dr: 0 }, DRIVERS[d], ice); return Math.abs(k.vy); };
  assert.ok(slide('frost') < slide('volt') * 0.3, `FROSTBYTE grips on ice (sideways ${slide('frost').toFixed(0)} vs ${slide('volt').toFixed(0)} px/s)`);
  console.log('drift / boost / ice perks: ok');
}

// FROSTBYTE: oil never spins it (the slick stays for the next car); others spin
{
  const { sim, A, B } = duo('volt', 'frost');
  place(sim, A, 900); place(sim, B, 1500);
  sim.addEnt('oil', A, B.car.x, B.car.y, 0, { life: 20, st: ITEMS.oil, lv: 1, t: 5 });
  const ev = evs(sim, () => sim.tick());
  assert.ok(B.car.spinT === 0 && ev.some((e) => e[0] === 'perk' && e[1] === B.id && e[2] === 'grip'), 'FROSTBYTE drives through oil without slipping');
  const s2 = duo('flicker', 'volt');
  place(s2.sim, s2.A, 900); place(s2.sim, s2.B, 1500);
  s2.sim.addEnt('oil', s2.A, s2.B.car.x, s2.B.car.y, 0, { life: 20, st: ITEMS.oil, lv: 1, t: 5 });
  s2.sim.tick();
  assert.ok(s2.B.car.spinT > 0, 'a normal car spins on the same oil');
  console.log('frost oil: ok');
}

// GRAVITON: pulls item boxes in from further away
{
  for (const [d, want] of [['grav', true], ['volt', false]]) {
    const { sim, A } = duo(d, 'brick');
    const b = sim.T.boxes[0], c = sim.T.corridors[0];
    // park the car 100 px from a box (beyond the normal pickup reach of CAR_R + 22)
    A.car = newCar(b.x + 100, b.y, 0); stepCar(A.car, IDLE, A.st, sim.T, 0);
    sim.itemFor = () => 'shield';
    const ev = evs(sim, () => sim.tick());
    assert.strictEqual(!!A.item, want, `${d}: ${want ? 'pulls in' : 'does not reach'} a box 100 px away`);
    if (want) assert.ok(ev.some((e) => e[0] === 'perk' && e[2] === 'magnet'), 'a magnet event for the client');
    void c;
  }
  console.log('graviton magnet: ok');
}

// PHANTOM VX: once per race the first rival hit passes straight through
{
  const { sim, A, B } = duo('volt', 'vx');
  place(sim, A, 900); place(sim, B, 1500);
  const hp = B.hp;
  assert.strictEqual(sim.damage(B, A, 30, 'missile'), false, 'the first hit phases through');
  assert.strictEqual(B.hp, hp); assert.ok(B.phased && B.protT === 0, 'no damage, no protection used');
  assert.strictEqual(sim.damage(B, A, 30, 'missile'), true, 'the second hit lands');
  assert.strictEqual(B.hp, hp - 30);
  B.protT = 0;
  assert.strictEqual(sim.damage(B, A, 10, 'missile'), true, 'only once per race');
  // a shield still takes a hit first; lava (not a rival) is never phased
  const s2 = duo('volt', 'vx');
  s2.B.shieldT = 2; s2.B.shieldN = 1;
  s2.sim.damage(s2.B, s2.A, 30, 'missile');
  assert.ok(!s2.B.phased, 'a shield blocks before the phase is spent');
  s2.sim.damage(s2.B, null, 5, 'lava', true);
  assert.ok(!s2.B.phased, 'lava is not a rival hit');
  // a spin-out from a rival's oil also passes through once
  const s3 = duo('volt', 'vx');
  assert.strictEqual(s3.sim.spinHit(s3.B, s3.A, 0.5), 'phase'); assert.strictEqual(s3.B.car.spinT, 0);
  console.log('phantom vx: ok');
}

// REDLINE ZERO: the top speed leader, turns wide
{
  for (const id of ALL_DRIVER_IDS) if (id !== 'redline') {
    assert.ok(DRIVERS.redline.top > DRIVERS[id].top, `REDLINE ZERO is faster than ${id}`);
    assert.ok(DRIVERS.redline.handling < DRIVERS[id].handling, `REDLINE ZERO turns wider than ${id}`);
  }
  console.log('redline: ok');
}

// HELIX: the built-in weapon recharges 25% faster
{
  const { sim, A } = duo('helix', 'volt');
  place(sim, A, 900);
  sim.fireWeapon(A);
  assert.ok(Math.abs(A.wcd - WEAPONS.helix.cd * 0.75) < 1e-9 && Math.abs(weaponCd('helix', DRIVERS.helix) - WEAPONS.helix.cd * 0.75) < 1e-9, `HELIX recharges in ${A.wcd} s (25% faster than ${WEAPONS.helix.cd})`);
  const s2 = duo('volt', 'brick'); place(s2.sim, s2.A, 900); s2.sim.fireWeapon(s2.A);
  assert.strictEqual(s2.A.wcd, WEAPONS.volt.cd, 'others recharge at the listed speed');
  console.log('helix: ok');
}

// every unlockable car's weapon fires and can hit (variants run through the same kinds)
{
  for (const id of NEW_DRIVER_IDS) {
    const { sim, A, B } = duo(id, 'brick');
    const W = WEAPONS[id];
    const behind = W.kind === 'mine' || W.kind === 'turret';
    place(sim, A, 1200); place(sim, B, behind ? 1200 - 120 : 1200 + (W.kind === 'rail' ? 400 : W.kind === 'blink' ? 150 : 120));
    if (W.kind === 'rail') A.car.a = Math.atan2(B.car.y - A.car.y, B.car.x - A.car.x);
    const hp = B.hp;
    sim.fireWeapon(A);
    for (let i = 0; i < 60 && B.hp === hp; i++) { if (behind) { B.car.vx = (A.car.x - B.car.x); B.car.vy = (A.car.y - B.car.y); } sim.tick(); }
    assert.ok(B.hp < hp, `${id}: ${W.name} (${W.kind}) hits`);
  }
  // EVENT HORIZON drags racers in (knock < 0)
  const { sim, A, B } = duo('prime', 'brick');
  place(sim, A, 1200); place(sim, B, 1350);
  const d0 = dist(A, B);
  sim.fireWeapon(A);
  B.car.vx += 0; sim.tick();
  assert.ok(dist(A, B) < d0, 'Event Horizon pulls the racer toward OBLIVION PRIME');
  console.log('unlockable weapons: ok');
}

// hitboxes: REDLINE ZERO is hit at its nose, further out than a round car would be
{
  const { sim, A, B } = duo('volt', 'redline');
  place(sim, B, 1500);
  const hx = Math.cos(B.car.a), hy = Math.sin(B.car.a);
  // a rocket 30 px ahead of the centre line's end: inside the 70 px capsule (35 + 10), outside a 22 + 10 circle
  sim.addEnt('rocket', A, B.car.x + hx * 40, B.car.y + hy * 40, B.car.a + Math.PI, { life: 1, speed: 1, st: ITEMS.rockets, lv: 1 });
  const hp = B.hp; sim.tick();
  assert.ok(B.hp < hp, 'a rocket at REDLINE ZERO\'s nose hits it');
  const s2 = duo('volt', 'redline'); place(s2.sim, s2.B, 1500);
  const nx = -Math.sin(s2.B.car.a), ny = Math.cos(s2.B.car.a);
  s2.sim.addEnt('rocket', s2.A, s2.B.car.x + nx * 28, s2.B.car.y + ny * 28, 0, { life: 1, speed: 1, st: ITEMS.rockets, lv: 1 });
  const hp2 = s2.B.hp; s2.sim.tick();
  assert.strictEqual(s2.B.hp, hp2, 'but a rocket 28 px to its side misses (it is thin)');
  console.log('hitboxes: ok');
}

// the stat bars: OBLIVION PRIME has the best all-round stats (highest average, no weak spot)
{
  const rows = ALL_DRIVER_IDS.map((id) => { const f = driverStats(id).map((r) => r.f); return { id, avg: f.reduce((a, b) => a + b) / f.length, min: Math.min(...f) }; });
  const prime = rows.find((r) => r.id === 'prime');
  for (const r of rows) if (r.id !== 'prime') {
    assert.ok(prime.avg > r.avg, `PRIME's average bar beats ${r.id} (${prime.avg.toFixed(3)} vs ${r.avg.toFixed(3)})`);
    assert.ok(prime.min > r.min, `PRIME's weakest bar beats ${r.id}'s weakest`);
  }
  assert.deepStrictEqual(driverStats('volt').map((r) => r.label), ['SPEED', 'HANDLING', 'BOOST', 'WEAPON']);
  assert.ok(driverStats('void')[2].f > driverStats('volt')[2].f, 'VOIDRUNNER: its drift charge shows in BOOST');
  assert.ok(driverStats('helix')[3].f >= Math.max(...ALL_DRIVER_IDS.map((d) => driverStats(d)[3].f)), 'HELIX: the best WEAPON bar (25% faster recharge)');
  console.log('race-perks: ok');
}
void MINI_TURBO;
