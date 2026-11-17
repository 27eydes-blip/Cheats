// The two new tracks: SKYLINE CROSSOVER (a figure-8 whose loop crosses itself at one X, the second
// pass jumping over it) and STARFALL SPEEDWAY (one huge loop with the Comet Jump shortcut). Checks
// that the crossover keeps every car on the stretch it is driving (progress, laps and positions
// never jump to the other stretch), that the validator guards crossovers, that bots race both
// tracks cleanly in a full field, and that the old tracks drive exactly as before.
import assert from 'node:assert';
import { TRACK_IDS, TRACK_DEFS, getTrack, arenaKey, trackName } from '../public/race/tracks.js';
import { buildTrack } from '../public/race/trackgeom.js';
import { validateTrack, crossPasses } from '../public/race/trackcheck.js';
import { CAR_R, DRIVERS, newCar, stepCar, speedOf } from '../public/race/physics.js';
import { RaceSim } from '../src/race/sim.js';

assert.ok(TRACK_IDS.includes('skyline') && TRACK_IDS.includes('starfall'), 'both new tracks are in the rotation');
for (const k of ['skyline', 'starfall']) {
  const T = getTrack(k);
  assert.deepStrictEqual(validateTrack(T), [], `${k} validates`);
  assert.strictEqual(T.world, 'city', `${k} is a neon night track`);
  assert.ok(T.L > 13000 && T.L < 17000, `${k}: a full-size lap (${Math.round(T.L)} px)`);
  // Battle on a new track uses its world's arena
  assert.strictEqual(arenaKey(k), 'neon');
  assert.strictEqual(getTrack(k, true).key, 'neon_arena');
  assert.strictEqual(trackName(k, true), 'Rooftop Grid');
}
assert.strictEqual(arenaKey('desert'), 'desert');

// ---------------------------------------------------------------- the crossover
const S = getTrack('skyline'), X = S.cross[0], main = S.corridors[0];
const passes = crossPasses(S, X);
assert.strictEqual(passes.length, 2, 'the loop passes the X twice');
// the second pass has the big ramp just before the X; the first is flat
const ramps = main.zones.filter((z) => z.kind === 'ramp');
const before = (z, s) => ((s - z.s1) % S.L + S.L) % S.L;
assert.ok(ramps.some((z) => before(z, passes[1].s) > 400 && before(z, passes[1].s) < 800), 'a ramp 400-800 px before the second pass');
assert.ok(!ramps.some((z) => before(z, passes[0].s) < 900), 'the first pass is flat');

// drive a car straight through the X on each pass: it stays on its own stretch the whole way
for (const [k, pass] of passes.entries()) {
  const P0 = main.px[pass.i] - main.tx[pass.i] * 700, Q0 = main.py[pass.i] - main.ty[pass.i] * 700;
  const c = newCar(P0, Q0, Math.atan2(main.ty[pass.i], main.tx[pass.i]));
  c.vx = Math.cos(c.a) * 700; c.vy = Math.sin(c.a) * 700;
  stepCar(c, { st: 0, th: 0, dr: 0 }, DRIVERS.volt, S, 0);
  let prev = c.ps, sawAir = false;
  for (let t = 0; t < 60; t++) {
    stepCar(c, { st: 0, th: 1, dr: 0 }, DRIVERS.volt, S);
    if (c.airT > 0) sawAir = true;
    assert.strictEqual(c.pc, 0, `pass ${k}: on the main loop`);
    let ds = c.ps - prev; if (ds < -S.L / 2) ds += S.L;
    assert.ok(ds > 0 && ds < 60, `pass ${k}: distance along the track moves on smoothly (${ds.toFixed(1)} px)`);
    prev = c.ps;
  }
  assert.strictEqual(sawAir, k === 1, `pass ${k}: ${k ? 'jumps over' : 'drives across'} the X`);
}
// without the hint (a fresh probe) the X itself is ambiguous; with it, each stretch keeps its own
const P = {};
const pa = passes[0], pb = passes[1];
for (const p of [pa, pb]) {
  P.hc = 0; P.hs = main.s[p.i];
  S.probe(X.x + 5, X.y + 5, CAR_R, P);
  const ds = Math.min(Math.abs(P.s - main.s[p.i]), S.L - Math.abs(P.s - main.s[p.i]));
  assert.ok(ds < 80, `at the X a car coming in on the ${p === pa ? 'first' : 'second'} pass stays on it`);
}
// the old tracks ignore the hint entirely (no crossover: same answers as before)
for (const k of ['desert', 'frozen', 'ashlands', 'neon']) {
  const T = getTrack(k), c0 = T.corridors[0], A = {}, B = { hc: 0, hs: c0.len / 2 };
  for (let i = 0; i < c0.n; i += 7) {
    T.probe(c0.px[i] + 30, c0.py[i] - 20, CAR_R, A); T.probe(c0.px[i] + 30, c0.py[i] - 20, CAR_R, B);
    assert.ok(A.c === B.c && A.s === B.s && A.pen === B.pen && A.surf === B.surf, `${k}: probe unchanged`);
  }
}

// ---------------------------------------------------------------- the validator guards crossovers
const broken = (fn) => { const d = structuredClone(TRACK_DEFS.skyline); fn(d); return validateTrack(buildTrack(d)); };
assert.ok(broken((d) => { delete d.cross; }).some((e) => /overlaps itself/.test(e)), 'an undeclared crossing is caught');
assert.ok(broken((d) => { d.checkpoints = [0, 0.1, 0.2, 0.3, 0.45, 0.55, 0.65]; }).some((e) => /no checkpoint between|regions/.test(e)), 'a lobe without a checkpoint is caught');
assert.ok(broken((d) => { d.checkpoints = [0, 0.25, 0.36, 0.56, 0.68, 0.78, 0.94]; }).some((e) => /in the crossing/.test(e)), 'a checkpoint in the X is caught');
assert.ok(broken((d) => { d.zones.push({ c: 0, s0: 0.357, s1: 0.363, kind: 'pad' }); }).some((e) => /pad in the crossing/.test(e)), 'a pad in the X is caught');
assert.ok(broken((d) => { d.cross = [[3000, 900]]; }).some((e) => /passes it 0 times|overlaps/.test(e)), 'a crossover in the wrong place is caught');
console.log('crossover: ok');

// ---------------------------------------------------------------- full bot fields race both tracks
for (const track of ['skyline', 'starfall']) {
  for (const seed of [3, 11]) {
    const sim = new RaceSim({ mode: 'grand', track, seed, lobbyTime: 0.05, fillBots: true, botLevel: 'hard' });
    const me = sim.players.get(sim.join('Racer', 'volt'));
    me.bot = true; // (drives like a bot; the rest of the grid fills with bots)
    const last = new Map(), resets = [];
    let n = 0, jumps = 0, cut = 0;
    while (sim.phase !== 'end' && n++ < 30 * 240) {
      sim.tick();
      for (const e of sim.events) { const k = Array.isArray(e) ? e[0] : e.k; if (k === 'reset') resets.push(e.id); }
      if (sim.time <= 0) continue;
      for (const p of sim.players.values()) {
        if (p.finished || !p.alive) { last.delete(p.id); continue; }
        if (p.car.airT > 0 && Math.hypot(p.car.x - (S.cross?.[0]?.x ?? 0), p.car.y - (S.cross?.[0]?.y ?? 0)) < 200 && track === 'skyline') jumps++;
        if (p.car.pc > 0) cut++;
        const pr = sim.progress(p), was = last.get(p.id);
        // race distance never leaps to the other stretch of the figure-8 (that would be ~L/2; taking
        // a shortcut maps onto the main loop in one step of a few hundred px, as on every track)
        if (was != null) assert.ok(Math.abs(pr - was) < 1000, `${track} seed ${seed}: racer ${p.id} progress jumped ${Math.round(was)} -> ${Math.round(pr)}`);
        last.set(p.id, pr);
      }
    }
    const field = [...sim.players.values()];
    assert.strictEqual(field.length, 10, 'a full grid');
    assert.ok(me.finished, `${track} seed ${seed}: the race is finished`);
    for (const p of field) assert.ok(p.finished || p.lap >= sim.laps, `${track} seed ${seed}: racer ${p.id} is on the last lap or done (lap ${p.lap})`);
    assert.ok(resets.length <= 2, `${track} seed ${seed}: bots drive it cleanly (${resets.length} resets)`);
    assert.ok(cut > 0, `${track} seed ${seed}: bots take the shortcut`);
    if (track === 'skyline') assert.ok(jumps > 0, `${track} seed ${seed}: bots fly over the X`);
    const times = field.filter((p) => p.bestLap).map((p) => p.bestLap);
    assert.ok(Math.min(...times) > 14 && Math.max(...times) < 30, `${track}: lap times in range (${Math.min(...times)}-${Math.max(...times)} s)`);
  }
}
console.log('race-newtracks: ok');
