// Hunt Racers bot drivers. One input per tick, the same shape a human client sends
// ({st, th, dr, f, i}), fed through the same physics. Bots follow the track's precomputed racing
// line, pick corner speeds from the line's curvature and their car's handling, drift through
// long corners, take shortcuts (boost-gated ones only when they can clear the gap), and use items
// and their weapon when it makes sense. Only the room's FILL WITH BOTS setting ever adds them.
import { DT, DRIVERS, CAR_R, SURF, AIR_PER_SPEED, driftTier } from '../../public/race/physics.js';
import { trackS, nearestS } from '../../public/race/trackgeom.js';
import { ITEMS, WEAPONS, itemStat } from '../../public/race/items.js';

export const RACE_BOT_LEVELS = {
  //       pace: share of top speed  drift: uses drifts  tier: spark tier it waits for  sc: shortcut chance
  // dodge: chance of timing a DRIFT press to shake a homing missile
  easy: { pace: 0.86, drift: false, tier: 1, sc: 0.15, react: 1.2, wobble: 0.35, aim: 0.55, dodge: 0.15 },
  normal: { pace: 0.95, drift: true, tier: 2, sc: 0.5, react: 0.6, wobble: 0.12, aim: 0.8, dodge: 0.35 },
  hard: { pace: 1, drift: true, tier: 3, sc: 0.85, react: 0.3, wobble: 0, aim: 1, dodge: 0.6 },
};
// the humans' average trophies -> bot difficulty (same thresholds as the shooter)
export function levelForTrophies(t) { return t < 150 ? 'easy' : t < 500 ? 'normal' : 'hard'; }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const BRAKE_PLAN = 1050; // deceleration bots plan with (px/s^2), below the real brake for margin

// corner speed limit per racing-line sample for one driver (cached per corridor)
const VCACHE = new WeakMap();
function cornerSpeeds(T, c, driver) {
  let m = VCACHE.get(c);
  if (!m) VCACHE.set(c, (m = {}));
  if (m[driver]) return m[driver];
  const st = DRIVERS[driver], v = new Float64Array(c.n), P = {};
  for (let i = 0; i < c.n; i++) {
    T.probe(c.line.x[i], c.line.y[i], 0, P);
    const S = SURF[P.surf] || SURF.road;
    v[i] = bendSpeed(st, c.line.k[i], S);
  }
  return (m[driver] = v);
}
const idxAt = (c, s) => { let lo = 0, hi = c.segs - 1; s = c.closed ? ((s % c.len) + c.len) % c.len : clamp(s, 0, c.len); while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.s[m] <= s) lo = m; else hi = m - 1; } return lo; };

function newAi(sim, p) {
  const T = sim.T;
  const ai = { c: 0, i: 0, slowT: 0, rev: 0, sc: {}, wait: 0, wob: sim.rand() * 6.28, itemHeld: 0, seen: 0, dodge: 0 };
  if (T.kind === 'track') ai.i = idxAt(T.corridors[0], nearestS(T.corridors[0], p.car.x, p.car.y));
  return ai;
}

export function botInput(sim, p) {
  const L = RACE_BOT_LEVELS[sim.botLevel] || RACE_BOT_LEVELS.normal;
  const ai = p.ai || (p.ai = newAi(sim, p));
  if (sim.modeKey === 'elim') elimSense(sim, p, ai); else ai.push = 0;
  const out = sim.T.kind === 'arena' ? arenaDrive(sim, p, ai, L) : raceDrive(sim, p, ai, L);
  out.f = 0; out.i = 0;
  if (!p.finished && sim.time > 0) {
    dodge(sim, p, ai, L, out);
    carryBomb(sim, p, out);
    if (sim.mode.weapons && p.wcd <= 0 && p.empT <= 0 && (wantWeapon(sim, p, L) || swat(sim, p))) out.f = 1;
    if (p.item && p.empT <= 0) {
      ai.itemHeld += DT;
      if ((ai.itemHeld > L.react && wantItem(sim, p, ai)) || (ai.push && p.item === 'turbo' && ai.itemHeld > 0.2)) { out.i = 1; ai.itemHeld = 0; }
    } else ai.itemHeld = 0;
  }
  return out;
}

// ELIMINATION sense: flat out (ai.push) when near the back with a cut coming or the black hole
// close; ai.prey = the racer in danger (weapons and items go for them first). Deterministic: only
// the sim's state, no randomness.
export const ELIM_BOT = { cutSoon: 7, backPlaces: 2, holeNear: 1100, preyR: 1500 };
function elimSense(sim, p, ai) {
  ai.push = 0; ai.prey = null;
  if (sim.time <= 0 || p.out) return;
  const live = sim.order.filter((q) => !q.out), pos = live.indexOf(p), n = live.length;
  const cutSoon = sim.elimNext - sim.time < ELIM_BOT.cutSoon && pos >= n - ELIM_BOT.backPlaces;
  const hole = sim.bh != null && !sim.bhOff && p.prog - sim.bh < ELIM_BOT.holeNear;
  if (cutSoon || hole) ai.push = 1;
  const d = sim.dangerId && sim.dangerId !== p.id ? sim.players.get(sim.dangerId) : null;
  // (only when close: hold fire for them, else fight as usual)
  if (d && d.alive && !d.out && d.ghostT <= 0 && d.protT <= 0 && Math.hypot(d.car.x - p.car.x, d.car.y - p.car.y) < ELIM_BOT.preyR) ai.prey = d;
}

function stuck(p, ai, sim, inp) {
  const c = p.car, fwd = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
  if (ai.rev > 0) { ai.rev -= DT; inp.th = -1; inp.st = -inp.st; inp.dr = 0; return; }
  if (sim.time > 1 && Math.abs(fwd) < 70 && c.spinT <= 0) ai.slowT += DT; else ai.slowT = 0;
  if (ai.slowT > 1.1) { ai.slowT = 0; ai.rev = 0.8; }
}

// speed this driver can take a bend of curvature k at, on surface S
function bendSpeed(st, k, S = SURF.road) {
  let v = st.top;
  for (let it = 0; it < 4; it++) {
    const turn = st.handling * (1 - 0.3 * clamp((v - 450) / 450, 0, 1)) * S.turn;
    v = Math.min(st.top * 1.3, (turn / Math.max(k, 1e-5)) * (S.grip < 0.5 ? 0.62 : 0.9));
  }
  return Math.max(260, v);
}
const JOIN_R = 260; // a shortcut's merge counts as a bend of this length

function raceDrive(sim, p, ai, L) {
  const T = sim.T, car = p.car, main = T.corridors[0];
  const hx = Math.cos(car.a), hy = Math.sin(car.a), fwd = car.vx * hx + car.vy * hy;
  let c = T.corridors[ai.c];
  let tr = trackS(c, car.x, car.y, ai.i, 10);
  if (tr.dist > 420) { // lost the thread (respawn, blink, shove): find the main road again
    ai.c = 0; c = main;
    ai.i = idxAt(main, nearestS(main, car.x, car.y));
    tr = trackS(c, car.x, car.y, ai.i, 4);
  }
  ai.i = tr.i;
  let s = tr.s;
  if (ai.c === 0) {
    // SHORTCUTS: decide once per lap when one is coming up
    for (const sc of T.corridors) {
      if (sc.main) continue;
      const ahead = ((sc.entryS - s) % main.len + main.len) % main.len;
      if (ahead > 300 || ai.sc[sc.idx] === p.lap) continue;
      ai.sc[sc.idx] = p.lap;
      let take = sim.rand() < (ai.push ? Math.max(L.sc, 0.85) : L.sc);
      if (take && sc.needsBoost) take = canJump(sc, p) || p.item === 'turbo';
      if (take) { ai.c = sc.idx; c = sc; tr = trackS(c, car.x, car.y, 0, 3); s = tr.s; ai.i = tr.i; }
      break;
    }
  } else if (s > c.len - 90) { // back onto the main road
    ai.c = 0; ai.i = idxAt(main, c.exitS); c = main; tr = trackS(c, car.x, car.y, ai.i, 6); ai.i = tr.i; s = tr.s;
  }
  const spd = Math.max(0, fwd);
  // aim at the racing line a little ahead (further at speed), past a shortcut's end onto the main road
  const la = 90 + spd * 0.38;
  let lc = c, j;
  if (!c.closed && s + la > c.len) { lc = main; j = idxAt(main, c.exitS + (s + la - c.len)); } else j = idxAt(c, s + la);
  let off = 0;
  if (L.wobble) off = Math.sin(sim.time * 0.8 + ai.wob) * L.wobble * lc.hw[j];
  const d = clamp(lc.line.d[j] + off, lc.line.lo[j], lc.line.hi[j]);
  const tx = lc.px[j] - lc.ty[j] * d, ty = lc.py[j] + lc.tx[j] * d;
  const err = angDiff(car.a, Math.atan2(ty - car.y, tx - car.x));
  const inp = { st: clamp(err * 2.6, -1, 1), th: 1, dr: 0 };
  // SPEED: the slowest bend ahead, given the braking distance to it (shortcut merges included)
  const look = spd * 1.2 + 260;
  let target = p.st.top * (ai.push ? 1 : L.pace) * (car.boostT > 0 ? car.boostP : 1), kAhead = 0;
  const limit = (v, dist) => { const allow = Math.sqrt(v * v + 2 * BRAKE_PLAN * Math.max(0, dist)); if (allow < target) target = allow; };
  if (!c.main && s < 1) { // still on the main road, about to turn into the shortcut
    const m = idxAt(main, c.entryS), turn = Math.abs(angDiff(Math.atan2(main.ty[m], main.tx[m]), Math.atan2(c.ty[0], c.tx[0])));
    limit(bendSpeed(p.st, turn / JOIN_R), Math.hypot(c.px[0] - car.x, c.py[0] - car.y) - JOIN_R / 2);
    if (turn / JOIN_R > kAhead) kAhead = turn / JOIN_R;
  }
  let cc = c, vmax = cornerSpeeds(T, cc, p.driver);
  for (let dist = 0, k = ai.i; dist < look; ) {
    limit(vmax[k], dist);
    if (dist < spd * 0.7 + 100) kAhead = Math.max(kAhead, cc.line.k[k]);
    if (!cc.closed && k >= cc.n - 1) { // the shortcut ends: the merge, then the main road
      const m = idxAt(main, cc.exitS), turn = Math.abs(angDiff(Math.atan2(cc.ty[k], cc.tx[k]), Math.atan2(main.ty[m], main.tx[m])));
      limit(bendSpeed(p.st, turn / JOIN_R), dist);
      if (dist < spd * 0.7 + 100) kAhead = Math.max(kAhead, turn / JOIN_R);
      cc = main; k = m; vmax = cornerSpeeds(T, cc, p.driver);
      continue;
    }
    const nk = cc.closed ? (k + 1) % cc.n : k + 1;
    dist += cc.closed && nk === 0 ? cc.s[cc.segs] - cc.s[k] : cc.s[nk] - cc.s[k];
    k = nk;
  }
  if (fwd > target + 45) inp.th = -1; else if (fwd > target) inp.th = 0;
  // DRIFT through long bends, release for the mini-turbo
  if (L.drift && car.airT <= 0) {
    if (car.drift) {
      const tier = driftTier(car.dc);
      const keep = (Math.abs(err) > 0.1 || tier < L.tier) && kAhead > 1 / 1100 && Math.sign(err) === car.drift;
      inp.dr = keep ? 1 : 0;
      if (inp.dr) inp.th = 1;
    } else if (fwd > 470 && kAhead > 1 / 650 && Math.abs(err) > 0.28) { inp.dr = 1; inp.th = 1; }
  }
  stuck(p, ai, sim, inp);
  return inp;
}

// can this car clear a boost-gated shortcut's gap right now?
function canJump(sc, p) {
  const pit = sc.zones.find((z) => z.surf === 'pit'), ramp = sc.zones.find((z) => z.kind === 'ramp');
  if (!pit || !ramp) return true;
  const need = Math.sqrt((pit.s1 - ramp.s1 + CAR_R * 2) / AIR_PER_SPEED) * 1.05;
  return p.car.boostT > 0.8 && p.st.top * p.car.boostP >= need;
}

function arenaDrive(sim, p, ai, L) {
  const T = sim.T, car = p.car;
  // goal: an item box if empty-handed, else the leader / nearest rival
  let gx = T.box.x1 / 2, gy = T.box.y1 / 2, best = Infinity;
  if (!p.item) T.boxes.forEach((b, k) => { if (sim.boxes[k] > sim.tickN) return; const d = Math.hypot(b.x - car.x, b.y - car.y); if (d < best) { best = d; gx = b.x; gy = b.y; } });
  if (best > 900) {
    for (const q of sim.players.values()) {
      if (q === p || !q.alive || q.out || q.ghostT > 0) continue;
      const d = Math.hypot(q.car.x - car.x, q.car.y - car.y) * (q.id === sim.leaderId ? 0.6 : 1);
      if (d < best) { best = d; gx = q.car.x; gy = q.car.y; }
    }
  }
  let want = Math.atan2(gy - car.y, gx - car.x);
  // steer around pillars and away from the walls
  for (const o of T.obstacles) {
    const dx = o.x - car.x, dy = o.y - car.y, d = Math.hypot(dx, dy);
    if (d > o.r + 260) continue;
    const off = angDiff(want, Math.atan2(dy, dx));
    if (Math.abs(off) < 0.9) want += (off > 0 ? -1 : 1) * (0.9 - Math.abs(off)) * 1.4;
  }
  const ax = car.x + Math.cos(car.a) * 220, ay = car.y + Math.sin(car.a) * 220;
  if (!T.inside(ax, ay, CAR_R)) want = Math.atan2(T.box.y1 / 2 - car.y, T.box.x1 / 2 - car.x);
  const err = angDiff(car.a, want), fwd = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
  const inp = { st: clamp(err * 2.4, -1, 1), th: Math.abs(err) > 1.5 && fwd > 350 ? 0 : 1, dr: 0 };
  if (fwd > p.st.top * L.pace) inp.th = 0;
  if (L.drift && Math.abs(err) > 0.9 && fwd > 420) inp.dr = 1;
  stuck(p, ai, sim, inp);
  return inp;
}

// ---------------------------------------------------------------- combat choices
function rivals(sim, p) { return [...sim.players.values()].filter((q) => q !== p && q.alive && !q.out && !q.finished && q.ghostT <= 0); }
function inCone(p, q, range, cone) {
  const c = p.car, dx = q.car.x - c.x, dy = q.car.y - c.y, d = Math.hypot(dx, dy);
  return d < range && Math.abs(angDiff(c.a, Math.atan2(dy, dx))) < cone;
}
function behind(p, q, range) {
  const c = p.car, dx = q.car.x - c.x, dy = q.car.y - c.y;
  return Math.hypot(dx, dy) < range && dx * Math.cos(c.a) + dy * Math.sin(c.a) < -10;
}

function wantWeapon(sim, p, L) {
  const W = WEAPONS[p.driver], R = p.ai && p.ai.prey ? [p.ai.prey] : rivals(sim, p); // (Elimination: the racer in danger first)
  switch (p.driver) {
    case 'volt': return R.some((q) => inCone(p, q, W.range * 0.95, W.cone * L.aim));
    case 'brick': return R.some((q) => q.car.airT <= 0 && Math.hypot(q.car.x - p.car.x, q.car.y - p.car.y) < W.r * 0.9);
    case 'wisp': return R.some((q) => inCone(p, q, W.range * 0.9, 0.06 * L.aim + 0.02));
    case 'dune': return R.some((q) => behind(p, q, 450));
    case 'rook': return R.some((q) => behind(p, q, 380));
    case 'flicker': return R.some((q) => inCone(p, q, W.dist, 0.25));
  }
  return false;
}

// a missile locked on to us: once it is close, maybe (L.dodge) time a DRIFT press to shake it
function dodge(sim, p, ai, L, out) {
  const c = p.car;
  for (const e of sim.ents) {
    if (e.kind !== 'missile' || e.target !== p.id) continue;
    const d = Math.hypot(e.x - c.x, e.y - c.y), R = (e.st && e.st.dodgeR) || 330;
    if (ai.seen !== e.id && d < R * 1.6) { ai.seen = e.id; ai.dodge = sim.rand() < L.dodge ? 1 : 0; }
    if (ai.seen === e.id && ai.dodge && d < R * 0.85) {
      if (ai.dodge === 1) { out.dr = 0; ai.dodge = 2; } // let go first if already drifting, press next tick
      else { out.dr = 1; ai.dodge = 0; }
    }
    return;
  }
}
// carrying a sticky bomb: steer into a nearby rival to pass it on
function carryBomb(sim, p, out) {
  const bomb = sim.ents.find((e) => e.kind === 'sticky' && e.mode === 'stuck' && e.carrier === p.id);
  if (!bomb) return;
  const c = p.car;
  let best = null, bd = 380;
  for (const q of rivals(sim, p)) { const d = Math.hypot(q.car.x - c.x, q.car.y - c.y); if (d < bd && Math.abs(angDiff(c.a, Math.atan2(q.car.y - c.y, q.car.x - c.x))) < 1.1) { bd = d; best = q; } }
  if (best) { out.st = clamp(angDiff(c.a, Math.atan2(best.car.y - c.y, best.car.x - c.x)) * 3, -1, 1); out.th = 1; out.dr = 0; }
}
// a Hunter Drone on us and close: fire the weapon to swat it
function swat(sim, p) {
  return sim.ents.some((e) => e.kind === 'drone' && e.target === p.id && Math.hypot(e.x - p.car.x, e.y - p.car.y) < e.st.swat * 0.9);
}

function wantItem(sim, p, ai) {
  const R = ai.prey ? [ai.prey] : rivals(sim, p), c = p.car, I = itemStat(p.item, p.il || 1);
  const threat = sim.ents.some((e) => ((e.kind === 'missile' || e.kind === 'drone') && e.target === p.id && Math.hypot(e.x - c.x, e.y - c.y) < 900) || (e.kind === 'sticky' && e.mode === 'stuck' && e.carrier === p.id && e.fuse < 1.5));
  switch (p.item) {
    case 'missile': return !sim.mode.arena ? (p.rank > 1 || ai.wait > 6) : R.some((q) => Math.hypot(q.car.x - c.x, q.car.y - c.y) < 1400);
    case 'rockets': return R.some((q) => inCone(p, q, 900, 0.18) || (ai.itemHeld > 8 && inCone(p, q, 1500, 0.3)));
    case 'oil': case 'spikes': return R.some((q) => behind(p, q, 600)) || ai.itemHeld > 7;
    case 'shield': return threat || ai.itemHeld > 8 || (sim.leaderId === p.id && ai.itemHeld > 3);
    case 'emp': return R.filter((q) => Math.hypot(q.car.x - c.x, q.car.y - c.y) < I.r * 0.85).length >= 1;
    case 'lightning': return R.some((q) => Math.hypot(q.car.x - c.x, q.car.y - c.y) < I.range * 0.9);
    case 'gravity': return R.some((q) => { const d = Math.hypot(q.car.x - c.x, q.car.y - c.y); return d < I.reach * 0.9 && d > 160; });
    case 'ghost': return threat || ai.itemHeld > 10;
    case 'sticky': return R.some((q) => inCone(p, q, 650, 0.35) || (ai.itemHeld > 8 && behind(p, q, 700)));
    case 'drone': return !sim.mode.arena ? (p.rank > 1 || ai.itemHeld > 6) : R.some((q) => Math.hypot(q.car.x - c.x, q.car.y - c.y) < 1400);
    case 'turbo': {
      if (sim.T.kind === 'arena') return true;
      const sc = sim.T.corridors[ai.c];
      if (sc && sc.needsBoost) { const ramp = sc.zones.find((z) => z.kind === 'ramp'); const s = sc.s[ai.i]; return ramp && ramp.s0 - s < 520; }
      const k = sim.T.corridors[ai.c].line.k;
      let maxK = 0;
      for (let d = 0; d < 18; d++) maxK = Math.max(maxK, k[(ai.i + d) % k.length]);
      return maxK < 1 / 1600;
    }
  }
  return true;
}
