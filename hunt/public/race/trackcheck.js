// Track validator: proves a track definition is raceable. Used by test/race-tracks.test.js and
// handy while designing a layout (returns a list of problems; empty = good).
import { CAR_R, SURF } from './physics.js';
import { nearestS, pointAt } from './trackgeom.js';

// CLEAR TRACKS: the minimum road half-width (px from the centre line to the road edge) of the main
// loop and of a shortcut. A car is 48 px long and 28 px wide: the main road fits 7+ cars across.
export const MIN_HW = 170, MIN_SC_HW = 110;

const segDist = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
};
const inSpan = (s, a, span, L) => ((s - a) % L + L) % L < span;

// opts.clear (default: every track but the tutorial, whose slalom needs its cones): the clear-track
// rules, see clearErrors()
export function validateTrack(T, opts = {}) {
  const errs = [], P = {};
  if (opts.clear ?? T.key !== 'tutorial') errs.push(...clearErrors(T));
  if (T.kind === 'arena') {
    for (const s of T.grid) if (T.probe(s.x, s.y, CAR_R, P).pen > 0) errs.push(`spawn ${Math.round(s.x)},${Math.round(s.y)} is in a wall`);
    for (const b of T.boxes) if (T.probe(b.x, b.y, CAR_R, P).pen > 0) errs.push(`item box ${b.x},${b.y} is in a wall`);
    if (T.grid.length < 10) errs.push('needs 10 spawns');
    return errs;
  }
  const main = T.corridors[0];
  if (!main.closed || main.len < 4000) errs.push('main loop must be closed and long enough');
  // 1. the main road never touches itself (except neighbouring samples)
  for (let i = 0; i < main.n; i += 2) for (let j = i + 2; j < main.n; j += 2) {
    const ds = Math.min(Math.abs(main.s[i] - main.s[j]), main.len - Math.abs(main.s[i] - main.s[j]));
    if (ds < (main.ww[i] + main.ww[j]) * 2.2) continue;
    if (Math.hypot(main.px[i] - main.px[j], main.py[i] - main.py[j]) < main.ww[i] + main.ww[j] + 20) { errs.push(`main road overlaps itself near ${Math.round(main.px[i])},${Math.round(main.py[i])}`); i = main.n; break; }
  }
  // 2. shortcuts: start and end on the main road, stay clear of it in between, and are shorter
  for (const c of T.corridors) {
    if (c.main) continue;
    for (const end of [0, c.n - 1]) if (T.probe(c.px[end], c.py[end], 0, P) && Math.abs(nearestDist(main, c.px[end], c.py[end])) > main.hw[0]) errs.push(`${c.name}: end ${end ? 'exit' : 'entry'} is not on the main road`);
    for (let i = 0; i < c.n; i++) {
      if (c.s[i] < 450 || c.len - c.s[i] < 450) continue;
      const d = nearestDist(main, c.px[i], c.py[i]);
      if (d < c.ww[i] + main.ww[0] + 10) { errs.push(`${c.name}: runs into the main road near ${Math.round(c.px[i])},${Math.round(c.py[i])}`); break; }
    }
    if (!(c.len < c.span)) errs.push(`${c.name}: not shorter (${Math.round(c.len)} vs main ${Math.round(c.span)})`);
    for (const g of T.gates) if (inSpan(g.s, c.entryS, c.span, T.L)) errs.push(`${c.name}: skips checkpoint ${g.k}`);
  }
  // 3. start grid: 10 slots fully on the road, not overlapping
  if (T.grid.length !== 10) errs.push('start grid needs 10 slots');
  T.grid.forEach((g, i) => {
    T.probe(g.x, g.y, CAR_R, P);
    if (P.pen > 0 || P.surf !== 'road' || P.c !== 0) errs.push(`grid slot ${i} is not on the road`);
    for (let j = 0; j < i; j++) if (Math.hypot(g.x - T.grid[j].x, g.y - T.grid[j].y) < CAR_R * 2.2) errs.push(`grid slots ${j} and ${i} overlap`);
  });
  for (const b of T.boxes) if (T.probe(b.x, b.y, CAR_R, P).pen > 0) errs.push(`item box ${Math.round(b.x)},${Math.round(b.y)} is off the track`);
  for (const h of T.hazards) if (T.probe(h.x, h.y, 0, P).pen > 0) errs.push(`hazard ${h.kind} is off the track`);
  if (T.gates.length < 3 || T.gates[0].s !== 0) errs.push('needs >= 3 checkpoints, the first at 0');
  for (let k = 1; k < T.gates.length; k++) if (T.gates[k].s <= T.gates[k - 1].s) errs.push('checkpoints must be in driving order');
  // 4. the gates cut the drivable area into exactly one region per gap between gates, each gate
  //    touching exactly the region before and after it: you cannot reach a checkpoint without
  //    passing the previous one (no skipping, no cutting), and the loop is closed
  errs.push(...partition(T));
  return errs;
}

// Nothing on the driving surface but racers and dropped weapon items: no obstacles, no timed
// hazards, no hazard or slowing surfaces (only boost pads, ramps and look-only paint), roads at least
// MIN_HW / MIN_SC_HW wide, and every point of the road (car-sized) is open road.
export function clearErrors(T) {
  const errs = [], P = {};
  if (T.obstacles.length) errs.push(`${T.obstacles.length} obstacle(s) on the track`);
  if (T.hazards.length) errs.push(`${T.hazards.length} hazard(s) on the track`);
  for (const z of T.circles) if (z.kind !== 'pad' && z.kind !== 'ramp' && z.kind !== 'paint') errs.push(`a ${z.surf || z.kind} patch at ${z.x},${z.y} (only pads, ramps and paint)`);
  if (T.kind === 'arena') { if (T.surf !== 'road') errs.push('arena floor is not road'); return errs; }
  for (const c of T.corridors) {
    const name = c.name || 'main road';
    if (c.surf !== 'road') errs.push(`${name}: drives as ${c.surf} (use look for the theme)`);
    const sh = SURF[c.shoulder];
    if (!sh || sh.dmg || sh.fall) errs.push(`${name}: the ${c.shoulder} shoulder hurts`);
    for (const z of c.zones) if (z.kind !== 'pad' && z.kind !== 'ramp' && z.kind !== 'paint') errs.push(`${name}: a ${z.surf || z.kind} zone on the road (only pads, ramps and paint)`);
    const min = c.main ? MIN_HW : MIN_SC_HW;
    let narrow = Infinity;
    for (let i = 0; i < c.n; i++) narrow = Math.min(narrow, c.hw[i]);
    if (narrow < min) errs.push(`${name}: road only ${Math.round(narrow * 2)} px wide (min ${min * 2})`);
    // car-sized probes across the whole road, every 64 px along it
    let bad = 0, at = null;
    for (let s = 0; s < c.len && bad < 1; s += 64) {
      const p0 = pointAt(c, s), hw = c.hw[p0.i] - CAR_R;
      for (let d = -hw; d <= hw + 1e-6; d += hw / 4) {
        const p = pointAt(c, s, d);
        T.probe(p.x, p.y, CAR_R, P);
        if (P.pen > 0 || P.surf !== 'road') { bad++; at = `${Math.round(p.x)},${Math.round(p.y)} (${P.pen > 0 ? 'blocked' : P.surf})`; break; }
      }
    }
    if (bad) errs.push(`${name}: the road is not clear at ${at}`);
  }
  return errs;
}

function nearestDist(c, x, y) {
  const s = nearestS(c, x, y);
  let best = Infinity;
  for (let i = 0; i < c.n; i++) if (Math.abs(c.s[i] - s) < 80 || Math.abs(c.s[i] - s) > c.len - 80) best = Math.min(best, Math.hypot(c.px[i] - x, c.py[i] - y));
  return best;
}

function partition(T, S = 16) {
  const b = T.bounds, W = Math.ceil((b.x1 - b.x0) / S), H = Math.ceil((b.y1 - b.y0) / S), P = {};
  const free = new Uint8Array(W * H), lab = new Int32Array(W * H).fill(-1);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const x = b.x0 + gx * S + S / 2, y = b.y0 + gy * S + S / 2;
    if (T.probe(x, y, 0, P).pen > 0) continue;
    let gate = false;
    for (const g of T.gates) if (segDist(x, y, g.x0, g.y0, g.x1, g.y1) < S * 0.8) { gate = true; break; }
    if (!gate) free[gy * W + gx] = 1;
  }
  const sizes = [];
  for (let i = 0; i < W * H; i++) {
    if (!free[i] || lab[i] >= 0) continue;
    const id = sizes.length, q = [i];
    lab[i] = id;
    let n = 0;
    while (q.length) {
      const c = q.pop(); n++;
      const cx = c % W, cy = (c - cx) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !free[j] || lab[j] >= 0) continue;
        lab[j] = id; q.push(j);
      }
    }
    sizes.push(n);
  }
  const big = sizes.map((n) => n > 60);
  const errs = [], nBig = big.filter(Boolean).length;
  if (nBig !== T.gates.length) errs.push(`checkpoints split the track into ${nBig} regions, expected ${T.gates.length} (a gate does not span the whole road, or a path bypasses one)`);
  for (const g of T.gates) {
    const touch = new Set();
    const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
    for (let t = 0; t <= len; t += S / 2) for (const side of [-1, 1]) {
      const x = g.x0 + ((g.x1 - g.x0) * t) / len + g.tx * side * S * 2, y = g.y0 + ((g.y1 - g.y0) * t) / len + g.ty * side * S * 2;
      const gx = Math.floor((x - b.x0) / S), gy = Math.floor((y - b.y0) / S);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      const l = lab[gy * W + gx];
      if (l >= 0 && big[l]) touch.add(l);
    }
    if (touch.size !== 2) errs.push(`checkpoint ${g.k} touches ${touch.size} regions (expected 2)`);
  }
  return errs;
}

// where each shortcut leaves and rejoins, as fractions of the main loop (for placing checkpoints)
export const shortcutSpans = (T) => T.corridors.filter((c) => !c.main).map((c) => ({ name: c.name, from: c.entryS / T.L, to: c.exitS / T.L, len: c.len, span: c.span }));
