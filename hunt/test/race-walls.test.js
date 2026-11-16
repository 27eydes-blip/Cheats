// Hunt Racers walls and "never stuck": a car driven straight into any wall (head-on included), a
// pillar or a corner is moving again within 2 s with throttle held and no steering; scraping along
// a wall keeps most of the speed and a hit costs a small, one-off loss; a pinned car is nudged off
// the wall at 1.5 s and reset at 3 s; the RESET button puts the car back on the racing line facing
// forward, with a cooldown; no car in a 10-bot race is ever stuck longer than 3 s.
import assert from 'node:assert';
import { DT, CAR_R, DRIVERS, newCar, stepCar, SURF, WALL_LOSS } from '../public/race/physics.js';
import { buildTrack, pointAt } from '../public/race/trackgeom.js';
import { getTrack, TRACK_IDS } from '../public/race/tracks.js';
import { RESET_COOLDOWN, STUCK_NUDGE, STUCK_RESET } from '../public/race/protocol.js';
import { RaceSim, RESET_GHOST } from '../src/race/sim.js';
import { mkRace, startRace, toGo, driver, collectEvents } from './race-helpers.js';

const V = DRIVERS.volt;
const P = {};
const speed = (c) => Math.hypot(c.vx, c.vy);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// throttle held, no steering, from (x, y, a) at v0: seconds from the first wall touch until the car
// is moving (> 100 px/s) away from or along the wall. null = never touched a wall.
function recovery(T, x, y, a, v0, st = V) {
  const c = newCar(x, y, a);
  c.vx = Math.cos(a) * v0; c.vy = Math.sin(a) * v0;
  stepCar(c, { st: 0, th: 0, dr: 0 }, st, T, 0);
  let hit = null, free = 0;
  for (let i = 1; i <= 30 * 6; i++) {
    stepCar(c, { st: 0, th: 1, dr: 0 }, st, T);
    if (SURF[c.surf]?.fall) return null; // fell into a pit: a wreck, not a wall
    if (c.wall && hit == null) hit = i;
    if (hit == null) { if (i > 60) return null; continue; }
    // moving again = faster than 100 px/s for a fifth of a second, clear of the wall or sliding
    // along it (nose no more than 30 degrees into it: e.g. riding the outside of a bend)
    let along = !c.wall;
    if (c.wall) { T.probe(c.x, c.y, CAR_R + 1, P); along = Math.cos(c.a) * P.nx + Math.sin(c.a) * P.ny > -0.5; }
    free = along && speed(c) > 100 ? free + 1 : 0;
    if (free >= 6) return (i - 5 - hit) * DT;
  }
  return Infinity;
}

// every track, every corridor, both walls, sampled every ~220 px: 90 (head-on), 60, 30 and 15 degrees
const worst = {};
for (const key of TRACK_IDS) {
  const T = getTrack(key);
  for (const deg of [90, 60, 30, 15]) {
    let n = 0, max = 0;
    for (const c of T.corridors) for (let i = 0; i < c.n; i += 7) for (const side of [-1, 1]) {
      const p = pointAt(c, c.s[i], side * (c.ww[i] - CAR_R - 120));
      for (const v0 of [500, 950]) {
        const t = recovery(T, p.x, p.y, p.a + side * (deg * Math.PI) / 180, v0);
        if (t == null) continue;
        n++; max = Math.max(max, t);
        assert.ok(t <= 2, `${key} corridor ${c.idx} sample ${i} side ${side} at ${deg} deg, ${v0} px/s: moving again after ${t} s`);
      }
    }
    assert.ok(n > 150, `${key} ${deg} deg: sampled ${n} wall hits`);
    worst[deg] = Math.max(worst[deg] || 0, max);
  }
}
// pillars (tracks and arenas) and the arenas' corners, from all round
{
  const targets = [];
  for (const key of TRACK_IDS) {
    for (const arena of [false, true]) { const T = getTrack(key, arena); for (const o of T.obstacles) targets.push([T, o.x, o.y, o.r]); }
    const A = getTrack(key, true), b = A.box;
    for (const [cx, cy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) targets.push([A, cx, cy, 0, true]);
  }
  let max = 0, n = 0;
  for (const [T, ox, oy, r, corner] of targets) for (let k = 0; k < 16; k++) {
    const dir = (k / 16) * Math.PI * 2, R = r + CAR_R + 200;
    const x = ox + Math.cos(dir) * R, y = oy + Math.sin(dir) * R;
    if (T.probe(x, y, CAR_R, P).pen > 0) continue; // that side of it is outside the track
    const aim = Math.atan2(oy - y, ox - x);
    if (corner && Math.abs(Math.cos(aim)) < 0.3 || corner && Math.abs(Math.sin(aim)) < 0.3) continue;
    const t = recovery(T, x, y, aim, 600);
    if (t == null) continue;
    n++; max = Math.max(max, t);
    assert.ok(t <= 2, `${T.key}: into ${corner ? 'the corner' : 'the pillar'} at ${ox},${oy} from ${k}/16: moving again after ${t} s`);
  }
  assert.ok(n > 60, `pillars and corners: ${n} hits`);
  worst.pillar = max;
}
// never inside a wall while sliding along it, at any speed
{
  const T = getTrack('neon');
  for (let i = 0; i < T.corridors[0].n; i += 11) {
    const c0 = T.corridors[0], p = pointAt(c0, c0.s[i], c0.ww[i] - CAR_R - 60), c = newCar(p.x, p.y, p.a + 0.5);
    c.vx = Math.cos(c.a) * 1300; c.vy = Math.sin(c.a) * 1300;
    for (let k = 0; k < 40; k++) { stepCar(c, { st: 0, th: 1, dr: 0 }, V, T); assert.ok(T.probe(c.x, c.y, CAR_R, P).pen < 1e-6, 'never inside a wall'); }
  }
}

// SCRAPING: along a long straight wall at a shallow angle, at top speed
{
  const T = buildTrack({ key: 'lot', name: 'Lot', arena: true, w: 40000, h: 3000 });
  for (const deg of [4, 8, 15, 25]) {
    const a = (-deg * Math.PI) / 180, c = newCar(2000, 160, a);
    c.vx = Math.cos(a) * V.top; c.vy = Math.sin(a) * V.top;
    let hit = -1, min = Infinity, ticks = 0;
    for (let i = 0; i < 30 * 4; i++) {
      stepCar(c, { st: 0, th: 1, dr: 0 }, V, T);
      if (c.wall && hit < 0) hit = i;
      if (hit >= 0) { min = Math.min(min, speed(c)); if (c.wall) ticks++; }
    }
    assert.ok(hit >= 0, 'reached the wall');
    assert.ok(min / V.top > 0.7, `${deg} deg scrape keeps ${(100 * min / V.top).toFixed(1)}% speed`);
    assert.ok(speed(c) > V.top * 0.97, 'back to full speed after the scrape');
    worst['scrape' + deg] = +(min / V.top).toFixed(3);
  }
  // one hit costs at most WALL_LOSS of the speed along the wall; scraping on costs nothing more
  const a = (-30 * Math.PI) / 180, c = newCar(2000, 200, a);
  c.vx = Math.cos(a) * 800; c.vy = Math.sin(a) * 800;
  let along0 = null;
  for (let i = 0; i < 40; i++) {
    const before = c.vx;
    stepCar(c, { st: 0, th: 0, dr: 0 }, V, T);
    if (c.wall && along0 == null) { along0 = before; const lost = 1 - c.vx / before; assert.ok(lost > 0.08 && lost <= WALL_LOSS + 0.02, `a 30 deg hit costs ${(lost * 100).toFixed(1)}% of the speed along the wall`); worst.hit30 = +(lost * 100).toFixed(1); }
  }
  assert.ok(along0 != null);
  const long = newCar(2000, CAR_R + 1, 0);
  long.vx = 700; long.vy = -30; // pressed lightly against the wall, coasting
  let w = 0;
  for (let i = 0; i < 30; i++) { stepCar(long, { st: 0, th: 0, dr: 0 }, V, T); w += long.wall; }
  assert.ok(w > 0 && long.vx > 700 - 140 * 1.01 - 700 * WALL_LOSS * 0.2, `a long scrape is charged once (${long.vx.toFixed(0)} px/s)`);
}
console.log('wall recovery (s, worst):', JSON.stringify(worst));

// ---------------------------------------------------------------- server: nudge, reset, RESET button
const angleOfTrack = (sim, car) => Math.atan2(sim.T.corridors[0].ty[pointAt(sim.T.corridors[0], car.ps).i], sim.T.corridors[0].tx[pointAt(sim.T.corridors[0], car.ps).i]);
function onWall(sim, p) {
  // between checkpoints 0 and 1, pressed nose-first into the right-hand wall
  const main = sim.T.corridors[0], s = (sim.T.gates[0].s + sim.T.gates[1].s) / 2, ww = main.ww[pointAt(main, s).i];
  const pt = pointAt(main, s, ww - CAR_R + 0.5); // (just touching it)
  sim.T.probe(pt.x, pt.y, CAR_R + 4, P);
  const a = Math.atan2(-P.ny, -P.nx);
  p.car = newCar(pt.x, pt.y, a);
  stepCar(p.car, { st: 0, th: 0, dr: 0 }, p.st, sim.T, 0);
  p.lap = 1; p.cp = 0; p.ai = null;
  return { x: pt.x, y: pt.y, a };
}
{
  // a car held against the wall (wedged): nudge at 1.5 s, then (still held, no progress) reset at 3 s
  const sim = mkRace({ mode: 'trial', track: 'desert' });
  const [p] = startRace(sim, ['volt']);
  toGo(sim);
  const ev = collectEvents(sim);
  const pin = onWall(sim, p);
  const d = driver(sim, p);
  let nudgeAt = null, resetAt = null, stuckSeen = 0;
  for (let i = 1; i <= 30 * 4 && resetAt == null; i++) {
    // the wedge: whatever happens, the car is back against the wall, stopped, every tick until the nudge
    if (nudgeAt == null || i > nudgeAt + 2) { p.car.x = pin.x; p.car.y = pin.y; p.car.a = pin.a; p.car.vx = p.car.vy = 0; }
    d({ th: 1 });
    sim.tick();
    stuckSeen = Math.max(stuckSeen, p.stuck);
    for (const e of ev.splice(0)) {
      if (e[1] === 'nudge' && nudgeAt == null) {
        nudgeAt = i;
        const L = sim.lineNear(p), moved = Math.hypot(p.car.x - pin.x, p.car.y - pin.y);
        assert.ok(moved > 80, `nudged ${moved.toFixed(0)} px off the wall`);
        assert.ok(Math.hypot(p.car.x - L.x, p.car.y - L.y) < Math.hypot(pin.x - L.x, pin.y - L.y) - 80, 'toward the racing line');
        assert.ok(Math.abs(angDiff(p.car.a, angleOfTrack(sim, p.car))) < 0.05, 'facing along the track');
        assert.ok(speed(p.car) > 100 && !p.car.wall, 'rolling, off the wall');
      }
      if (e[1] === 'reset') { resetAt = i; assert.strictEqual(e[2].auto, 1); assert.strictEqual(e[2].id, p.id); }
    }
  }
  assert.ok(Math.abs(nudgeAt * DT - STUCK_NUDGE) <= DT + 1e-9, `auto-nudge at ${(nudgeAt * DT).toFixed(2)} s`);
  assert.ok(Math.abs(resetAt * DT - STUCK_RESET) <= DT + 1e-9, `auto-reset at ${(resetAt * DT).toFixed(2)} s`);
  assert.ok(stuckSeen >= 2.9, 'the stuck timer was reported');
  assert.ok(T_onRoad(sim, p), 'reset onto the road');
  assert.ok(p.ghostT > RESET_GHOST - 0.1, 'ghosted after a reset');
}
function T_onRoad(sim, p) { sim.T.probe(p.car.x, p.car.y, CAR_R, P); return P.pen <= 0 && P.surf === 'road' && P.c === 0; }
{
  // a real head-on crash in the race: moving again within 2 s, no nudge or reset needed
  for (const key of TRACK_IDS) {
    const sim = mkRace({ mode: 'trial', track: key });
    const [p] = startRace(sim, ['volt']);
    toGo(sim);
    const ev = collectEvents(sim);
    const pin = onWall(sim, p);
    p.car.x -= Math.cos(pin.a) * 150; p.car.y -= Math.sin(pin.a) * 150;
    p.car.vx = Math.cos(pin.a) * 700; p.car.vy = Math.sin(pin.a) * 700;
    const d = driver(sim, p);
    let hit = null, free = null;
    for (let i = 1; i <= 30 * 3 && free == null; i++) {
      d({ th: 1 }); sim.tick();
      if (p.car.wall && hit == null) hit = i;
      if (hit != null && !p.car.wall && speed(p.car) > 100) free = i;
    }
    assert.ok(hit != null && free != null && (free - hit) * DT <= 2, `${key}: head-on into the wall in a race, moving after ${((free - hit) * DT).toFixed(2)} s`);
    assert.ok(!ev.some((e) => e[1] === 'reset'), `${key}: without a reset`);
  }
}
{
  // RESET button: off the line, sideways, slow -> on the racing line facing forward, stopped, ghosted; 3 s cooldown
  const sim = mkRace({ mode: 'grand', track: 'frozen' });
  const [p, q] = startRace(sim, ['volt', 'wisp']);
  toGo(sim);
  const ev = collectEvents(sim);
  const d = driver(sim, p), dq = driver(sim, q);
  const main = sim.T.corridors[0], s = sim.T.gates[1].s + 400, pt = pointAt(main, s, 120);
  p.car = newCar(pt.x, pt.y, pt.a + 2.2); p.lap = 1; p.cp = 1;
  stepCar(p.car, { st: 0, th: 0, dr: 0 }, p.st, sim.T, 0);
  const prog0 = sim.progress(p), ep0 = sim.meMsg(p).ep;
  sim.input(p.id, { t: 'reset' });
  d({ th: 0 }); dq({ th: 0 }); sim.tick();
  const r = ev.filter((e) => e[1] === 'reset');
  assert.strictEqual(r.length, 1, 'reset event');
  assert.deepStrictEqual([r[0][2].id, r[0][2].auto], [p.id, 0]);
  assert.ok(T_onRoad(sim, p), 'on the road');
  const i = pointAt(main, p.car.ps).i;
  assert.ok(Math.hypot(p.car.x - main.line.x[i], p.car.y - main.line.y[i]) < 30, 'on the racing line');
  assert.ok(Math.abs(angDiff(p.car.a, angleOfTrack(sim, p.car))) < 0.05, 'facing forward');
  assert.ok(speed(p.car) < 1, 'stopped');
  assert.ok(Math.abs(sim.progress(p) - prog0) < 200 && p.cp === 1 && p.lap === 1, 'same place in the race (no gate gained or lost)');
  assert.ok(sim.meMsg(p).ep > ep0, 'a teleport (the client snaps)');
  assert.ok(p.ghostT > 0.9 && sim.flags(p) & 1024, 'ghosted for a second');
  assert.ok(sim.meMsg(p).rcd > 2.9, 'cooldown reported');
  // cooldown: a second press is ignored until 3 s have passed
  let n = 0;
  for (; n < 30 * 4; n++) {
    sim.input(p.id, { t: 'reset' });
    d({ th: 0 }); dq({ th: 0 }); sim.tick();
    if (ev.filter((e) => e[1] === 'reset').length > 1) break;
  }
  assert.ok(Math.abs((n + 1) * DT - RESET_COOLDOWN) <= 2 * DT, `next reset allowed after ${((n + 1) * DT).toFixed(2)} s`);
  // the snapshot rows carry the stuck seconds; nobody's stuck here
  const rows = [];
  sim.send = (id, m) => { if (m.t === 's') rows.push(m); };
  d({ th: 0 }); dq({ th: 0 }); sim.tick();
  assert.ok(rows[0].c.every((row) => row.length === 9 && typeof row[8] === 'number'), 'car rows: [..., speed, stuck]');
  assert.strictEqual(typeof rows[0].me.stuck, 'number');
  // no reset during the countdown
  const s2 = mkRace({ mode: 'trial', track: 'desert' });
  const [p2] = startRace(s2, ['volt']);
  const g = { x: p2.car.x, y: p2.car.y };
  s2.input(p2.id, { t: 'reset' }); s2.tick(); toGo(s2); s2.tick();
  assert.ok(Math.hypot(p2.car.x - g.x, p2.car.y - g.y) < 30, 'a reset pressed on the grid does nothing');
}

// 10-bot races on every track: nobody is ever stuck longer than 3 s (and resets are rare)
for (const track of TRACK_IDS) {
  const sim = new RaceSim({ mode: 'grand', track, seed: 21, lobbyTime: 0.05, fillBots: true, botLevel: 'normal' });
  const h = sim.players.get(sim.join('Host', 'volt'));
  h.bot = true;
  let n = 0, max = 0;
  while (sim.phase !== 'end' && n++ < 30 * 320) {
    sim.tick();
    for (const p of sim.players.values()) max = Math.max(max, p.stuck);
  }
  assert.strictEqual(sim.phase, 'end');
  assert.ok(max <= STUCK_RESET + 1e-9, `${track}: worst stuck ${max.toFixed(2)} s`);
  const resets = [...sim.players.values()].reduce((s, p) => s + p.resets, 0), nudges = [...sim.players.values()].reduce((s, p) => s + p.nudges, 0);
  assert.ok(resets <= 4, `${track}: ${resets} automatic resets in a 10-bot race`);
  console.log(`${track}: 10 bots, worst stuck ${max.toFixed(1)} s, ${nudges} nudges, ${resets} resets, ${sim.time.toFixed(0)} s`);
}
console.log('race-walls: ok');
