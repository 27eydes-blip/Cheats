// Hunt Racers steering: heading steering from the joystick (ha / hm / sens) turns the nose to the
// stick's direction without overshoot at low and high speed, faster with a higher sensitivity; the
// keyboard `st` path is unchanged; drifts are forgiving (full stick into the turn holds the drift,
// the slide blends in, a corrected stick right after the start flips it) and still charge tiers.
import assert from 'node:assert';
import { DT, DRIVERS, DRIVER_IDS, newCar, stepCar, cleanInput, driftTier, HM_DEAD, DRIFT_GRACE, DRIFT_KEEP_SPEED } from '../public/race/physics.js';
import { buildTrack } from '../public/race/trackgeom.js';

const V = DRIVERS.volt;
const lot = () => buildTrack({ key: 'lot', name: 'Lot', arena: true, w: 30000, h: 30000 });
const T = lot();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const atSpeed = (v, st = V, a = 0) => { const c = newCar(15000, 15000, a); c.vx = Math.cos(a) * v; c.vy = Math.sin(a) * v; stepCar(c, { st: 0, th: 0, dr: 0 }, st, T, 0); return c; };

// HEADING: reaches the target, never past it, no back-and-forth (low speed and top speed)
const settleTime = (v, target, sens = 1, hm = 1) => {
  const c = atSpeed(v);
  let reach = null, crossings = 0, prev = Math.sign(wrap(target - c.a));
  for (let i = 0; i < 30 * 4; i++) {
    stepCar(c, { st: 0, th: v > 500 ? 1 : 0.35, dr: 0, ha: target, hm, sens }, V, T);
    const e = wrap(target - c.a);
    if (Math.sign(e) !== prev && Math.abs(e) > 1e-9) crossings++;
    assert.ok(e * Math.sign(target) > -1e-6, `no overshoot (v ${v}, target ${target}, error ${e})`);
    if (reach == null && Math.abs(e) < 0.02) reach = (i + 1) * DT;
  }
  assert.strictEqual(crossings, 0, `no oscillation around the target (v ${v})`);
  assert.ok(reach != null, `reaches ${target} rad at ${v} px/s`);
  return reach;
};
for (const v of [320, 800]) for (const target of [0.6, 1.6, -2.4]) settleTime(v, target);
{
  // sensitivity: 0.5 slow .. 1.5 quick, same no-overshoot guarantee
  const slow = settleTime(800, 1.6, 0.5), mid = settleTime(800, 1.6, 1), quick = settleTime(800, 1.6, 1.5);
  assert.ok(slow > mid * 1.3 && mid > quick * 1.15, `sensitivity scales the turn rate (${slow} > ${mid} > ${quick})`);
  // a half-pushed stick turns slower than a full one
  assert.ok(settleTime(800, 1.6, 1, 0.4) > mid * 1.2, 'stick magnitude scales the turn rate');
  // speed-based: a full turn is a tighter circle slow than fast
  const radius = (v) => { const c = atSpeed(v); let ang = 0; const a0 = c.a; for (let i = 0; i < 15; i++) stepCar(c, { st: 0, th: 0.2, dr: 0, ha: c.a + 3, hm: 1 }, V, T); ang = Math.abs(wrap(c.a - a0)); return (Math.hypot(c.vx, c.vy) * 0.5) / ang; };
  assert.ok(radius(300) < radius(800) * 0.6, `tighter at low speed (${radius(300).toFixed(0)} px vs ${radius(800).toFixed(0)} px)`);
}
// determinism with heading inputs
{
  const a = atSpeed(600), b = atSpeed(600);
  for (let i = 0; i < 300; i++) { const inp = { st: 0, th: 1, dr: i % 90 > 50 ? 1 : 0, ha: Math.sin(i / 20) * 2, hm: 0.3 + (i % 7) / 10, sens: 1.2 }; stepCar(a, inp, V, T); stepCar(b, inp, V, T); }
  assert.deepStrictEqual(a, b, 'identical heading inputs -> identical cars');
}
// KEYBOARD: st works exactly as before (no ha, or a stick inside the deadzone, is plain st)
{
  const v = 600, c = atSpeed(v), turn = V.handling * 1 * (1 - 0.3 * ((v - 450) / 450));
  stepCar(c, { st: 0.5, th: 0, dr: 0 }, V, T);
  assert.ok(Math.abs(c.a - 0.5 * turn * DT) < 1e-12, 'one tick of st 0.5 turns by 0.5 * turn * dt');
  const plain = atSpeed(v), dead = atSpeed(v), none = atSpeed(v);
  for (let i = 0; i < 90; i++) {
    stepCar(plain, { st: 0.7, th: 1, dr: 0 }, V, T);
    stepCar(dead, { st: 0.7, th: 1, dr: 0, ha: 2, hm: HM_DEAD - 0.01 }, V, T);
    stepCar(none, cleanInput({ st: 0.7, th: 1, dr: 0 }), V, T);
  }
  assert.deepStrictEqual(dead, plain, 'a stick inside the deadzone steers by st');
  assert.deepStrictEqual(none, plain, 'a clean input without ha steers by st');
  assert.strictEqual(cleanInput({ st: 0, ha: 'x', hm: 1 }).ha, null, 'junk ha is dropped');
  assert.ok(Math.abs(cleanInput({ ha: 7, hm: 3 }).ha - wrap(7)) < 1e-12 && cleanInput({ ha: 7, hm: 3 }).hm === 1, 'ha wrapped, hm clamped');
}

// DRIFT: full stick into the turn holds the drift (it used to bleed below the keep speed and end)
for (const d of DRIVER_IDS) {
  for (const inp of [{ st: 1 }, { st: 0, ha: Math.PI / 2, hm: 1 }]) {
    const c = atSpeed(DRIVERS[d].top, DRIVERS[d]);
    let held = 0;
    for (let i = 0; i < 30 * 4; i++) {
      // heading mode: keep the stick a quarter turn ahead of the nose (full stick into the turn)
      const ha = inp.ha != null ? c.a + inp.ha : undefined;
      stepCar(c, { st: inp.st, th: 1, dr: 1, ha, hm: inp.hm }, DRIVERS[d], T);
      if (c.drift === 1) held++; else if (i > 3) break;
    }
    assert.ok(held >= 30 * 4 - 4, `${d}: full ${inp.ha != null ? 'stick' : 'steer'} into the drift holds it for 4 s (${(held * DT).toFixed(2)} s)`);
    assert.ok(Math.hypot(c.vx, c.vy) > DRIFT_KEEP_SPEED * 1.3, `${d}: and keeps its pace (${Math.hypot(c.vx, c.vy).toFixed(0)} px/s)`);
    assert.strictEqual(driftTier(c.dc), 3, `${d}: charged to purple`);
  }
}
{
  // heading-mode drift: the nose follows the stick and stops there (no spinning past it)
  const c = atSpeed(800), target = 1.2;
  let maxA = 0, vl = 0;
  for (let i = 0; i < 30 * 2; i++) {
    stepCar(c, { st: 0, th: 1, dr: 1, ha: target, hm: 1 }, V, T);
    maxA = Math.max(maxA, c.a); vl = Math.max(vl, Math.abs(-c.vx * Math.sin(c.a) + c.vy * Math.cos(c.a)));
  }
  assert.strictEqual(c.drift, 1, 'drifting');
  assert.ok(maxA <= target + 1e-6, `the drifting nose never passes the stick (${maxA.toFixed(3)} vs ${target})`);
  assert.ok(Math.abs(c.a - target) < 0.05, 'and holds it there');
  assert.ok(vl > 100, `sliding on the way round (${vl.toFixed(0)} px/s sideways)`);
}
{
  // no snap: the first drift ticks turn no faster than plain steering did, the slide builds in
  const plain = atSpeed(800), drift = atSpeed(800);
  const da = [], dp = [];
  for (let i = 0; i < 6; i++) {
    const a0 = drift.a, p0 = plain.a;
    stepCar(drift, { st: 1, th: 1, dr: 1 }, V, T); stepCar(plain, { st: 1, th: 1, dr: 0 }, V, T);
    da.push(drift.a - a0); dp.push(plain.a - p0);
  }
  assert.strictEqual(drift.drift, 1);
  for (let i = 0; i < 6; i++) assert.ok(da[i] <= dp[i] * 1.12 + 1e-9, `tick ${i}: drift turn ${da[i].toFixed(4)} vs steer ${dp[i].toFixed(4)}`);
  for (let i = 1; i < 6; i++) assert.ok(Math.abs(da[i] - da[i - 1]) < 0.02, 'turn rate changes smoothly into the drift');
  // grace: started the wrong way by a wobble, the corrected stick flips the drift (no penalty)
  const c = atSpeed(800);
  stepCar(c, { st: 0.5, th: 1, dr: 1 }, V, T);
  assert.strictEqual(c.drift, 1);
  for (let i = 0; i < 3; i++) stepCar(c, { st: -1, th: 1, dr: 1 }, V, T);
  assert.strictEqual(c.drift, -1, 'flipped within the grace');
  for (let i = 0; i < Math.ceil(DRIFT_GRACE / DT); i++) stepCar(c, { st: -1, th: 1, dr: 1 }, V, T);
  for (let i = 0; i < 6; i++) stepCar(c, { st: 1, th: 1, dr: 1 }, V, T);
  assert.strictEqual(c.drift, -1, 'after the grace a counter-steer is a counter-steer (the drift holds)');
}
console.log('race-steer: ok');
