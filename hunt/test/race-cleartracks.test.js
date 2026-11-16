// Hunt Racers CLEAR TRACKS: a full lap on each of the 4 tracks, once by a bot and once by a
// human-style driver (the touch joystick's heading steering, ha / hm, aimed at the racing line ahead
// with hand noise and a wandering line, throttle held), and nothing on the road blocks or slows the
// car: the only contacts are the corridor's guard walls (which slide the car along, never pin it),
// the car is always on road or the shoulder by a wall, never on a hazard surface, never hurt or
// wrecked, never nudged or reset, and every big speed loss happens at a wall. The arenas are open
// floors: a car crosses each one in every direction without touching anything but the outer wall.
import assert from 'node:assert';
import { RaceSim } from '../src/race/sim.js';
import { CAR_R, DRIVERS, SURF, newCar, stepCar, speedOf } from '../public/race/physics.js';
import { TRACK_IDS, getTrack } from '../public/race/tracks.js';
import { trackS } from '../public/race/trackgeom.js';

// deterministic noise (mulberry32) and a smooth wander for the human's aim
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const P = {};

// one lap; drive(sim, p) returns the input for this tick (null = bot drives)
function lap(track, driver, drive, seed) {
  const sim = new RaceSim({ mode: 'trial', track, seed, lobbyTime: 0.05, laps: 1 });
  const p = sim.players.get(sim.join('Racer', driver));
  if (!drive) p.bot = true;
  const T = sim.T, top = DRIVERS[driver].top;
  const st = { ticks: 0, road: 0, shoulder: 0, wallTicks: 0, walls: 0, badWall: 0, bad: [], drops: [], maxStuck: 0, hp: p.hp, kos: 0, hits: 0, slow: 0 };
  let seq = 0, prevV = 0, prevWall = 0, sinceWall = 9, sinceLift = 0, n = 0;
  while (sim.phase !== 'end' && n++ < 30 * 200) {
    if (drive && sim.phase === 'play') sim.input(p.id, { t: 'in', s: ++seq, st: 0, th: 1, dr: 0, ...drive(sim, p) });
    sim.tick();
    for (const e of sim.events) { const k = Array.isArray(e) ? e[0] : e.k; if (k === 'ko') st.kos++; if (k === 'hit') st.hits++; if (k === 'nudge' || k === 'reset') st.bad.push(k + '@' + sim.time.toFixed(1)); }
    if (sim.time <= 0 || p.finished || !p.alive) continue;
    const c = p.car, v = speedOf(c);
    st.ticks++;
    st.maxStuck = Math.max(st.maxStuck, p.stuck);
    if (c.airT <= 0) {
      const S = SURF[c.surf];
      if (!S || S.dmg || S.fall) st.bad.push(`on ${c.surf} at ${Math.round(c.x)},${Math.round(c.y)}`);
      if (c.surf === 'road') st.road++; else if (c.surf === T.corridors[Math.max(0, c.pc)].shoulder) st.shoulder++; else st.bad.push(`on ${c.surf} (not road or shoulder)`);
    }
    if (c.wall) {
      st.wallTicks++; if (!prevWall) st.walls++;
      // the contact is at the road's edge (the guard wall), never out in the road (the move's substeps
      // may have touched the wall and slid on a little: within 40 px of it)
      T.probe(c.x, c.y, CAR_R, P);
      if (!(P.c >= 0 && Math.abs(P.d) + CAR_R >= T.corridors[P.c].ww[P.i] - 40)) st.badWall++;
      sinceWall = 0;
    } else sinceWall += 1;
    // a speed loss away from the walls: only steering grip and the shoulder's drag may cost speed
    sinceLift = p.inp && p.inp.th > 0 ? sinceLift + 1 : 0; // the driver's own braking / lifting (bots slow for hairpins)
    const drop = prevV - v;
    if (sinceWall > 3 && c.airT <= 0 && st.ticks > 2) st.drops.push(drop);
    if (sinceWall > 30 && sinceLift > 45 && st.ticks > 30 * 4 && v < top * 0.45) st.slow++;
    prevV = v; prevWall = c.wall;
  }
  st.time = p.finishTime; st.hpEnd = p.hp; st.finished = p.finished;
  st.maxDrop = Math.max(0, ...st.drops);
  return st;
}

// a human on the touch joystick: aims at the racing line ~0.45 s ahead (the corridor it is on, the
// main road after a shortcut), with a slowly wandering lateral offset (people don't hold the line),
// hand tremor on the angle and the stick magnitude, throttle held all lap, a drift held in long bends
function human(seed) {
  const R = rng(seed);
  let wander = 0, prevI = -1, prevC = -1, wv = 0;
  return (sim, p) => {
    const T = sim.T, c = p.car, ci = c.pc >= 0 ? c.pc : 0, cc = T.corridors[ci];
    if (ci !== prevC) prevI = -1;
    const r = prevI < 0 ? trackS(cc, c.x, c.y, 0, cc.n) : trackS(cc, c.x, c.y, prevI, 10);
    prevI = r.i; prevC = ci;
    wv += (R() - 0.5) * 0.25; wv *= 0.97; wander = Math.max(-1, Math.min(1, wander + wv * 0.03));
    const ahead = 220 + speedOf(c) * 0.45;
    let i = r.i, s = 0;
    let L = cc;
    while (s < ahead) {
      const j = L.closed ? (i + 1) % L.n : i + 1;
      if (j >= L.n) { const m = T.corridors[0]; const r2 = trackS(m, L.px[L.n - 1], L.py[L.n - 1], 0, m.n); L = m; i = r2.i; continue; }
      s += Math.hypot(L.px[j] - L.px[i], L.py[j] - L.py[i]); i = j;
    }
    const d = Math.max(L.line.lo[i], Math.min(L.line.hi[i], L.line.d[i] + wander * 70)); // off the line by up to 70 px
    const tx = L.px[i] - L.ty[i] * d, ty = L.py[i] + L.tx[i] * d;
    const ha = Math.atan2(ty - c.y, tx - c.x) + (R() - 0.5) * 0.16;
    const hm = Math.min(1, 0.8 + R() * 0.25);
    const bend = Math.abs(wrap(ha - c.a));
    return { ha, hm, th: 1, dr: bend > 0.5 && speedOf(c) > 450 ? 1 : 0 };
  };
}

const out = {};
for (const track of TRACK_IDS) {
  let botTime = null;
  for (const [who, run] of [['bot', () => lap(track, 'volt', null, 7)], ['human', () => lap(track, 'volt', human(11 + track.length), 7)], ['human2', () => lap(track, 'flicker', human(97 + track.length), 3)]]) {
    const r = run(), tag = `${track} ${who}`;
    out[tag] = { time: r.time, road: +(r.road / r.ticks).toFixed(3), walls: r.walls, wallTicks: r.wallTicks, maxDrop: +r.maxDrop.toFixed(1), stuck: +r.maxStuck.toFixed(2) };
    assert.ok(r.finished && r.time != null, `${tag}: finished the lap`);
    assert.deepStrictEqual(r.bad, [], `${tag}: no hazard surface, nudge or reset`);
    assert.strictEqual(r.kos, 0, `${tag}: never wrecked`);
    assert.strictEqual(r.hits, 0, `${tag}: never hit by anything`);
    assert.strictEqual(r.hpEnd, r.hp, `${tag}: no damage`);
    assert.strictEqual(r.badWall, 0, `${tag}: every contact is the guard wall`);
    assert.ok(r.maxStuck < 0.5, `${tag}: never pinned (${r.maxStuck} s)`);
    assert.strictEqual(r.slow, 0, `${tag}: never crawling away from a wall`);
    assert.ok(r.road / r.ticks > 0.85, `${tag}: on the road ${(100 * r.road / r.ticks).toFixed(1)}% of the lap`);
    if (who === 'bot') botTime = r.time;
    else assert.ok(r.time < botTime * 1.15, `${tag}: a rough human line is not much slower than the bot (${r.time} vs ${botTime} s)`);
  }
}

// ARENAS: open floors. From the middle, full throttle in 24 directions: the car crosses to the outer
// wall on road without touching anything else, and slides along that wall (keeps moving).
for (const track of TRACK_IDS) {
  const A = getTrack(track, true), B = A.box, V = DRIVERS.volt;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, c = newCar((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, a);
    stepCar(c, { st: 0, th: 0, dr: 0 }, V, A, 0);
    let hit = -1, minAfter = Infinity, corner = 0;
    for (let i = 0; i < 30 * 8 && (hit < 0 || i < hit + 30); i++) {
      stepCar(c, { st: 0, th: 1, dr: 0 }, V, A);
      assert.ok(SURF[c.surf] && !SURF[c.surf].dmg && !SURF[c.surf].fall && c.surf === 'road', `${A.key}: road all the way (${c.surf})`);
      if (c.wall && hit < 0) {
        hit = i;
        const edge = Math.min(c.x - B.x0, B.x1 - c.x, c.y - B.y0, B.y1 - c.y);
        assert.ok(edge <= CAR_R + 2, `${A.key} heading ${k}/24: first contact is the outer wall (${edge.toFixed(1)} px from it)`);
        corner = Math.min(...[[B.x0, B.y0], [B.x1, B.y0], [B.x0, B.y1], [B.x1, B.y1]].map(([x, y]) => Math.hypot(c.x - x, c.y - y)));
      }
      if (hit >= 0 && i > hit + 10) minAfter = Math.min(minAfter, speedOf(c));
    }
    assert.ok(hit > 0, `${A.key} heading ${k}/24: reached the wall`);
    // (a corner is a dead end by design: race-walls.test.js times the way out of it)
    if (Math.abs(Math.cos(a)) > 0.3 && Math.abs(Math.sin(a)) > 0.3 && corner > 500) assert.ok(minAfter > 150, `${A.key} heading ${k}/24: slides along the wall (${minAfter.toFixed(0)} px/s)`);
  }
}
console.log(JSON.stringify(out, null, 1));
console.log('race-cleartracks: ok');
