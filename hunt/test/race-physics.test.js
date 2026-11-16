// Hunt Racers car physics: determinism, drift tiers + mini-turbo, surfaces, walls, ramps, pads,
// car-to-car bumps, and the driver balance (no driver dominates).
import assert from 'node:assert';
import { DT, CAR_R, DRIVERS, DRIVER_IDS, newCar, stepCar, collideCars, packState, unpackState, MINI_TURBO, DRIFT_TIERS, driftTier, BOOSTS } from '../public/race/physics.js';
import { buildTrack } from '../public/race/trackgeom.js';
import { getTrack } from '../public/race/tracks.js';
import { rng } from '../public/shared.js';

const V = DRIVERS.volt;
// a huge empty lot for clean measurements; zones placed by circles
const lot = (circles = [], obstacles = []) => buildTrack({ key: 'lot', name: 'Lot', arena: true, w: 30000, h: 30000, circles, obstacles });
const run = (car, inp, st, T, n, ev) => { for (let i = 0; i < n; i++) stepCar(car, inp, st, T, DT, ev); return car; };
const speed = (c) => Math.hypot(c.vx, c.vy);

// determinism: the same inputs from the same state give the same car, bit for bit
{
  const T = getTrack('desert');
  const g = T.grid[0];
  const R = rng(99), inputs = Array.from({ length: 900 }, () => ({ st: R() * 2 - 1, th: R() < 0.85 ? 1 : -1, dr: R() < 0.2 ? 1 : 0 }));
  const a = newCar(g.x, g.y, g.a), b = newCar(g.x, g.y, g.a);
  for (const inp of inputs) { stepCar(a, inp, V, T); stepCar(b, inp, V, T); }
  assert.deepStrictEqual(a, b, 'identical inputs -> identical cars');
  // prediction: a client starting from the packed (rounded) server state stays within a hair
  const server = newCar(g.x, g.y, g.a);
  for (let i = 0; i < 300; i++) stepCar(server, inputs[i], V, T);
  const client = unpackState(packState(server));
  for (let i = 300; i < 306; i++) { stepCar(server, inputs[i], V, T); stepCar(client, inputs[i], V, T); }
  assert.ok(Math.hypot(server.x - client.x, server.y - client.y) < 0.5, 'replaying 6 inputs from a snapshot stays within 0.5 px');
}

// acceleration and top speed, reverse
{
  const T = lot();
  const c = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, T, 30 * 6);
  assert.ok(Math.abs(speed(c) - V.top) < 3, `reaches top speed (${speed(c).toFixed(1)} vs ${V.top})`);
  const t1 = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, T, 30);
  const t2 = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, DRIVERS.flicker, T, 30);
  assert.ok(speed(t2) > speed(t1), 'Flicker (higher accel) is quicker off the line than Volt');
  run(c, { st: 0, th: -1, dr: 0 }, V, T, 30 * 3);
  assert.ok(c.vx < -50, 'holding brake then reverses');
}

// DRIFT: 3 charge tiers; release fires a mini-turbo of increasing strength; too short = nothing
{
  const T = lot();
  const results = [];
  for (const hold of [0.4, 0.9, 1.4, 2.2]) { // full steer charges 1.25 s of drift per second {
    const c = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, T, 30 * 5);
    const ev = {};
    let n = Math.round(hold / DT);
    for (let i = 0; i < n; i++) stepCar(c, { st: 1, th: 1, dr: 1 }, V, T, DT, ev);
    assert.strictEqual(c.drift, 1, 'drifting right while held');
    const tier = driftTier(c.dc);
    stepCar(c, { st: 0, th: 1, dr: 0 }, V, T, DT, ev);
    assert.strictEqual(c.drift, 0, 'drift ends on release');
    results.push({ tier, turbo: ev.turbo || 0, boostT: c.boostT, boostP: c.boostP });
  }
  assert.deepStrictEqual(results.map((r) => r.tier), [0, 1, 2, 3], 'charge tiers blue / orange / purple by hold time');
  assert.deepStrictEqual(results.map((r) => r.turbo), [0, 1, 2, 3], 'release fires the matching mini-turbo');
  assert.strictEqual(results[0].boostT, 0, 'a short drift gives no boost');
  for (let t = 1; t <= 3; t++) {
    assert.ok(results[t].boostT === MINI_TURBO[t].t && results[t].boostP === MINI_TURBO[t].p, `tier ${t} boost`);
    if (t > 1) assert.ok(MINI_TURBO[t].t > MINI_TURBO[t - 1].t && MINI_TURBO[t].p > MINI_TURBO[t - 1].p, 'each tier is stronger');
  }
  assert.ok(DRIFT_TIERS[0] < DRIFT_TIERS[1] && DRIFT_TIERS[1] < DRIFT_TIERS[2]);
  // the mini-turbo pushes the car past its normal top speed
  const c = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, T, 30 * 5);
  run(c, { st: 1, th: 1, dr: 1 }, V, T, Math.round(2.4 / DT));
  run(c, { st: 0, th: 1, dr: 0 }, V, T, 25);
  assert.ok(speed(c) > V.top * 1.15, `mini-turbo speed ${speed(c).toFixed(0)} > top`);
  // no drift below the minimum speed
  const slow = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, T, 8);
  stepCar(slow, { st: 1, th: 1, dr: 1 }, V, T);
  assert.strictEqual(slow.drift, 0, 'cannot start a drift from a crawl');
}

// SURFACES: ice slides, rough ground slows (less for Dune), pads boost
{
  const T = lot([{ x: 15000, y: 15000, r: 9000, kind: 'surf', surf: 'ice' }]);
  const R = lot();
  const turnSlide = (Tk) => {
    const c = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, Tk, 30 * 5);
    run(c, { st: 1, th: 1, dr: 0 }, V, Tk, 15);
    const hx = Math.cos(c.a), hy = Math.sin(c.a);
    return Math.abs(c.vx * -hy + c.vy * hx); // sideways speed
  };
  assert.ok(turnSlide(T) > turnSlide(R) * 2, 'a car slides far more on ice than on road');
  const top = (surf, d) => speed(run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, DRIVERS[d], lot([{ x: 15000, y: 15000, r: 9000, kind: 'surf', surf }]), 30 * 6));
  assert.ok(top('sand', 'wisp') < DRIVERS.wisp.top * 0.75, 'sand slows a normal car');
  assert.ok(top('offroad', 'dune') / DRIVERS.dune.top > top('offroad', 'wisp') / DRIVERS.wisp.top + 0.15, 'Dune shrugs off rough ground');
  const P = lot([{ x: 16500, y: 15000, r: 60, kind: 'pad' }]);
  const c = newCar(15000, 15000, 0), ev = {};
  for (let i = 0; i < 30 * 4 && !ev.pad; i++) stepCar(c, { st: 0, th: 1, dr: 0 }, V, P, DT, ev);
  assert.ok(ev.pad && c.boostT > 0 && c.boostP === BOOSTS.pad.p, 'driving over a boost pad boosts');
}

// WALLS: never pass through, bounce back
{
  const T = getTrack('frozen'), main = T.corridors[0], P = {};
  // aim straight at the outside wall of the first straight at full boost
  const g = T.grid[0];
  const c = newCar(g.x, g.y, g.a - Math.PI / 2);
  c.vx = Math.cos(c.a) * 1200; c.vy = Math.sin(c.a) * 1200;
  let maxPen = 0;
  const ev = {};
  for (let i = 0; i < 60; i++) { stepCar(c, { st: 0, th: 1, dr: 0 }, V, T, DT, ev); maxPen = Math.max(maxPen, T.probe(c.x, c.y, CAR_R, P).pen); }
  assert.ok(maxPen < 1e-6, `never inside a wall (max overlap ${maxPen})`);
  assert.ok(ev.wall > 500, 'reported the impact');
  assert.ok(main.len > 0);
}

// RAMPS: airborne for a while, no steering in the air, then lands
{
  const T = lot([{ x: 15300, y: 15000, r: 40, kind: 'ramp' }]);
  const c = run(newCar(15000, 15000, 0), { st: 0, th: 1, dr: 0 }, V, T, 30 * 4);
  const c2 = newCar(15000, 15000, 0);
  run(c2, { st: 0, th: 1, dr: 0 }, V, T, 1);
  // drive at the ramp from a run-up
  const car = newCar(13000, 15000, 0), ev = {};
  let airTicks = 0, aBefore = null;
  for (let i = 0; i < 30 * 6; i++) {
    stepCar(car, { st: car.airT > 0 ? 1 : 0, th: 1, dr: 0 }, V, T, DT, ev);
    if (car.airT > 0) { if (aBefore == null) aBefore = car.a; airTicks++; assert.strictEqual(car.a, aBefore, 'no steering in the air'); }
  }
  assert.ok(ev.launch && ev.land, 'launched and landed');
  assert.ok(airTicks * DT > 0.5, `airborne ${airTicks * DT}s`);
  assert.ok(c.x > 0 && c2.x > 0);
}

// car-to-car: pushed apart, momentum kept, heavier car shoves the lighter one more
{
  const a = newCar(0, 0, 0), b = newCar(CAR_R * 1.5, 0, Math.PI);
  a.vx = 400; b.vx = -400;
  const pa = DRIVERS.brick.mass * a.vx + DRIVERS.wisp.mass * b.vx;
  const imp = collideCars(a, b, DRIVERS.brick.mass, DRIVERS.wisp.mass);
  assert.ok(imp > 700, 'head-on impact speed');
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= CAR_R * 2 - 1e-9, 'separated');
  assert.ok(Math.abs(DRIVERS.brick.mass * a.vx + DRIVERS.wisp.mass * b.vx - pa) < 1e-6, 'momentum conserved');
  assert.ok(Math.abs(b.vx) > Math.abs(a.vx), 'the lighter car bounces harder');
}

// balance: every driver trades stats, nobody is best at everything
{
  const keys = ['top', 'accel', 'handling', 'armor'];
  for (const id of DRIVER_IDS) {
    const top3 = keys.filter((k) => DRIVER_IDS.filter((o) => DRIVERS[o][k] > DRIVERS[id][k]).length < 3);
    assert.ok(top3.length < keys.length, `${id} is not top 3 in every stat`);
    const lows = keys.filter((k) => DRIVER_IDS.filter((o) => DRIVERS[o][k] < DRIVERS[id][k]).length < 3);
    assert.ok(lows.length >= 1, `${id} pays for its strengths somewhere`);
  }
  assert.strictEqual(new Set(DRIVER_IDS.map((d) => DRIVERS[d].car)).size, 6, 'six distinct vehicles');
}
console.log('race-physics: ok');
