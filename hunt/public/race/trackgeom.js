// Track geometry for Hunt Racers, shared by the server sim, bots, the client prediction and the
// renderer. A track is a union of CORRIDORS (the closed main loop plus open shortcut paths), each a
// sampled spline with a road half-width (hw) and a wall half-width (ww >= hw; the band between is
// the shoulder). The drivable area is the union of all corridors; anything outside is wall. Arenas
// are a box with pillars instead. probe() answers every per-car question in one pass: am I inside,
// how far am I pushed out of a wall, what surface am I on, am I on a pad or ramp.
// Pure data + math: no DOM, no randomness, so it runs identically everywhere.

const CELL = 128; // spatial grid cell (px)
const REACH = 64; // max query radius we index for (car radius + margin)
export const SAMPLE = 32; // spline sample spacing (px)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// uniform Catmull-Rom through control points [x, y, hw?]; returns dense samples
function sampleSpline(pts, closed, step, hwDef) {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  const xs = [], ys = [], ws = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      xs.push(f(p0[0], p1[0], p2[0], p3[0]));
      ys.push(f(p0[1], p1[1], p2[1], p3[1]));
      const w1 = p1[2] ?? hwDef, w2 = p2[2] ?? hwDef;
      ws.push(w1 + (w2 - w1) * t);
    }
  }
  if (!closed) { const l = P(n - 1); xs.push(l[0]); ys.push(l[1]); ws.push(l[2] ?? hwDef); }
  return { xs, ys, ws };
}

function buildCorridor(def, closed, idx) {
  const { xs, ys, ws } = sampleSpline(def.pts, closed, SAMPLE, def.hw);
  const n = xs.length, sh = def.sh ?? 60;
  const c = {
    idx, closed, n, main: idx === 0, name: def.name || null,
    px: new Float64Array(xs), py: new Float64Array(ys), hw: new Float64Array(ws), ww: new Float64Array(ws.map((w) => w + sh)),
    tx: new Float64Array(n), ty: new Float64Array(n), s: new Float64Array(n + 1),
    surf: def.surf || 'road', shoulder: def.shoulder || 'offroad', zones: [], needsBoost: !!def.needsBoost,
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n, dx = c.px[j] - c.px[i], dy = c.py[j] - c.py[i], l = Math.hypot(dx, dy) || 1;
    c.tx[i] = dx / l; c.ty[i] = dy / l; c.s[i + 1] = c.s[i] + l;
  }
  if (!closed) { c.tx[n - 1] = c.tx[n - 2]; c.ty[n - 1] = c.ty[n - 2]; c.s[n] = c.s[n - 1]; }
  c.segs = segs;
  c.len = c.s[segs];
  return c;
}

// index of the segment containing arc length s (binary search)
function segAt(c, s) {
  if (c.closed) s = ((s % c.len) + c.len) % c.len; else s = clamp(s, 0, c.len);
  let lo = 0, hi = c.segs - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.s[m] <= s) lo = m; else hi = m - 1; }
  return [lo, s];
}
// world point at (s along, d across: + is to the right of the driving direction)
export function pointAt(c, s, d = 0) {
  const [i, ss] = segAt(c, s), t = ss - c.s[i];
  const x = c.px[i] + c.tx[i] * t, y = c.py[i] + c.ty[i] * t;
  return { x: x - c.ty[i] * d, y: y + c.tx[i] * d, a: Math.atan2(c.ty[i], c.tx[i]), i };
}
export const hwAt = (c, s) => { const [i, ss] = segAt(c, s); const j = (i + 1) % c.n, f = (ss - c.s[i]) / ((c.s[i + 1] - c.s[i]) || 1); return c.hw[i] + (c.hw[j] - c.hw[i]) * f; };
export const wwAt = (c, s) => { const [i, ss] = segAt(c, s); const j = (i + 1) % c.n, f = (ss - c.s[i]) / ((c.s[i + 1] - c.s[i]) || 1); return c.ww[i] + (c.ww[j] - c.ww[i]) * f; };

// closest point on segment i of corridor c to (x, y)
function projSeg(c, i, x, y, o) {
  const j = (i + 1) % c.n, ax = c.px[i], ay = c.py[i];
  const sl = c.s[i + 1] - c.s[i];
  let t = (x - ax) * c.tx[i] + (y - ay) * c.ty[i];
  t = t < 0 ? 0 : t > sl ? sl : t;
  const qx = ax + c.tx[i] * t, qy = ay + c.ty[i] * t, dx = x - qx, dy = y - qy;
  const f = sl > 0 ? t / sl : 0;
  o.dist = Math.sqrt(dx * dx + dy * dy); o.qx = qx; o.qy = qy; o.t = t;
  o.d = dx * -c.ty[i] + dy * c.tx[i];
  o.hw = c.hw[i] + (c.hw[j] - c.hw[i]) * f; o.ww = c.ww[i] + (c.ww[j] - c.ww[i]) * f;
  return o;
}

// build the runtime object for a track or arena definition
export function buildTrack(def) {
  const T = { key: def.key, name: def.name, world: def.world, kind: def.arena ? 'arena' : 'track', laps: def.laps || 3, def };
  T.corridors = [];
  T.obstacles = (def.obstacles || []).map((o) => ({ x: o.x, y: o.y, r: o.r }));
  T.circles = (def.circles || []).map((z) => ({ ...z })); // world-space round zones (surf / pad / ramp)
  T.hazards = (def.hazards || []).map((h, i) => ({ id: i, period: 4, on: 1.2, phase: 0, ...h }));
  T.hazardsAt = T.hazards.filter((h) => h.s != null); // placed along a corridor: resolved below
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (def.arena) {
    T.box = { x0: 0, y0: 0, x1: def.w, y1: def.h };
    x0 = 0; y0 = 0; x1 = def.w; y1 = def.h;
    T.surf = def.surf || 'road';
  } else {
    T.corridors.push(buildCorridor(def.main, true, 0));
    (def.shortcuts || []).forEach((sc, k) => T.corridors.push(buildCorridor(sc, false, k + 1)));
    for (const c of T.corridors) for (let i = 0; i < c.n; i++) {
      x0 = Math.min(x0, c.px[i] - c.ww[i]); y0 = Math.min(y0, c.py[i] - c.ww[i]);
      x1 = Math.max(x1, c.px[i] + c.ww[i]); y1 = Math.max(y1, c.py[i] + c.ww[i]);
    }
    const main = T.corridors[0];
    T.L = main.len;
    // shortcut ends -> where they leave / rejoin the main loop (for race progress)
    const pr = {};
    for (const c of T.corridors) {
      if (c.main) continue;
      c.entryS = nearestS(main, c.px[0], c.py[0], pr);
      c.exitS = nearestS(main, c.px[c.n - 1], c.py[c.n - 1], pr);
      c.span = ((c.exitS - c.entryS) % T.L + T.L) % T.L; // main distance it skips
    }
    // zones on corridors: s as a fraction of that corridor's length, d0..d1 across (px)
    for (const z of def.zones || []) {
      const c = T.corridors[z.c || 0];
      const zz = { kind: z.kind || 'surf', surf: z.surf, s0: z.s0 * c.len, s1: z.s1 * c.len, d0: z.d0 ?? -1e9, d1: z.d1 ?? 1e9, pow: z.pow, c: c.idx };
      const mid = pointAt(c, (zz.s0 + zz.s1) / 2, z.d0 != null ? (zz.d0 + zz.d1) / 2 : 0);
      zz.x = mid.x; zz.y = mid.y; zz.a = mid.a;
      c.zones.push(zz);
    }
    // checkpoints: gates across the full corridor width (walls to walls)
    T.gates = (def.checkpoints || [0]).map((f, k) => {
      const s = f * T.L, p = pointAt(main, s), w = wwAt(main, s) + 24, nx = -Math.sin(p.a), ny = Math.cos(p.a);
      return { k, s, cx: p.x, cy: p.y, tx: Math.cos(p.a), ty: Math.sin(p.a), x0: p.x - nx * w, y0: p.y - ny * w, x1: p.x + nx * w, y1: p.y + ny * w, a: p.a };
    });
    // start grid for 10: two staggered columns behind the line, pole on the left
    T.grid = [];
    for (let i = 0; i < 10; i++) {
      const row = i >> 1, col = i & 1, s = T.L - 150 - row * 125 - col * 55, hw = hwAt(main, s);
      const p = pointAt(main, s, (col ? 1 : -1) * hw * 0.42);
      T.grid.push({ x: p.x, y: p.y, a: p.a });
    }
    T.boxes = [];
    for (const b of def.boxes || []) {
      const c = T.corridors[b.c || 0], s = b.s * c.len, hw = hwAt(c, s), n = b.n || 4;
      for (let k = 0; k < n; k++) { const p = pointAt(c, s, n === 1 ? 0 : -hw * 0.62 + (hw * 1.24 * k) / (n - 1)); T.boxes.push({ x: p.x, y: p.y }); }
    }
    for (const h of T.hazardsAt) { const p = pointAt(T.corridors[h.c || 0], h.s * T.corridors[h.c || 0].len, h.d || 0); h.x = Math.round(p.x); h.y = Math.round(p.y); }
    for (const c of T.corridors) racingLine(c, T.obstacles, T.hazards);
  }
  if (def.arena) {
    T.boxes = (def.boxes || []).map((b) => ({ x: b.x, y: b.y }));
    T.grid = def.spawns || ringSpawns(def.w, def.h, 10);
    T.gates = [];
  }
  T.bounds = { x0: Math.floor(x0 - 100), y0: Math.floor(y0 - 100), x1: Math.ceil(x1 + 100), y1: Math.ceil(y1 + 100) };
  buildGrid(T);
  T.probe = (x, y, r, out) => probe(T, x, y, r, out);
  T.inside = (x, y, r = 0) => probe(T, x, y, r, SCRATCH).pen <= 0;
  T.toMain = (c, s) => (c <= 0 ? s : (T.corridors[c].entryS + (s / T.corridors[c].len) * T.corridors[c].span) % T.L);
  return T;
}
const SCRATCH = {};

function ringSpawns(w, h, n) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = w / 2 + Math.cos(a) * w * 0.38, y = h / 2 + Math.sin(a) * h * 0.38;
    return { x, y, a: Math.atan2(h / 2 - y, w / 2 - x) };
  });
}

export function nearestS(c, x, y, o = {}) {
  let best = Infinity, bs = 0;
  for (let i = 0; i < c.segs; i++) { projSeg(c, i, x, y, o); if (o.dist < best) { best = o.dist; bs = c.s[i] + o.t; } }
  return bs;
}
// nearest s near a previous guess (bots / progress tracking): searches +-win samples around it
export function trackS(c, x, y, prevI, win = 12, o = {}) {
  let best = Infinity, bi = prevI, bt = 0;
  for (let k = -win; k <= win; k++) {
    let i = prevI + k;
    if (c.closed) i = ((i % c.segs) + c.segs) % c.segs; else if (i < 0 || i >= c.segs) continue;
    projSeg(c, i, x, y, o);
    if (o.dist < best) { best = o.dist; bi = i; bt = o.t; }
  }
  return { i: bi, s: c.s[bi] + bt, dist: best };
}

function buildGrid(T) {
  const b = T.bounds, gw = Math.ceil((b.x1 - b.x0) / CELL), gh = Math.ceil((b.y1 - b.y0) / CELL);
  const segs = Array.from({ length: gw * gh }, () => []), obs = Array.from({ length: gw * gh }, () => []);
  const add = (arr, xa, ya, xb, yb, v) => {
    const cx0 = clamp(Math.floor((xa - b.x0) / CELL), 0, gw - 1), cx1 = clamp(Math.floor((xb - b.x0) / CELL), 0, gw - 1);
    const cy0 = clamp(Math.floor((ya - b.y0) / CELL), 0, gh - 1), cy1 = clamp(Math.floor((yb - b.y0) / CELL), 0, gh - 1);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) arr[cy * gw + cx].push(v);
  };
  for (const c of T.corridors) for (let i = 0; i < c.segs; i++) {
    const j = (i + 1) % c.n, m = Math.max(c.ww[i], c.ww[j]) + REACH;
    add(segs, Math.min(c.px[i], c.px[j]) - m, Math.min(c.py[i], c.py[j]) - m, Math.max(c.px[i], c.px[j]) + m, Math.max(c.py[i], c.py[j]) + m, c.idx * 65536 + i);
  }
  T.obstacles.forEach((o, k) => add(obs, o.x - o.r - REACH, o.y - o.r - REACH, o.x + o.r + REACH, o.y + o.r + REACH, k));
  T.cells = { gw, gh, segs: segs.map((a) => Int32Array.from(a)), obs: obs.map((a) => Int32Array.from(a)) };
}

const P1 = {}, P2 = {};
// One query per car per substep. out: { pen (>0 = overlapping a wall by that much), nx, ny (push
// direction), c, i, s, d (corridor, segment, along, across), surf, pad, ramp }
function probe(T, x, y, r, out) {
  out.pad = null; out.ramp = null; out.c = -1; out.i = 0; out.s = 0; out.d = 0; out.pen = -1e9; out.nx = 0; out.ny = 0;
  const b = T.bounds;
  if (T.box) {
    const bx = T.box, l = x - r - bx.x0, rr = bx.x1 - (x + r), t = y - r - bx.y0, bb = bx.y1 - (y + r);
    const m = Math.min(l, rr, t, bb);
    out.pen = -m;
    if (m === l) { out.nx = 1; out.ny = 0; } else if (m === rr) { out.nx = -1; out.ny = 0; } else if (m === t) { out.nx = 0; out.ny = 1; } else { out.nx = 0; out.ny = -1; }
    out.surf = T.surf;
  } else {
    const cx = Math.floor((x - b.x0) / CELL), cy = Math.floor((y - b.y0) / CELL);
    const list = cx >= 0 && cy >= 0 && cx < T.cells.gw && cy < T.cells.gh ? T.cells.segs[cy * T.cells.gw + cx] : null;
    let bm = Infinity, bc = null, bi = 0;
    const o = P1;
    if (list && list.length) {
      for (let k = 0; k < list.length; k++) {
        const code = list[k], c = T.corridors[code >> 16], i = code & 65535;
        projSeg(c, i, x, y, o);
        const m = o.dist - o.ww;
        if (m < bm) { bm = m; bc = c; bi = i; }
      }
    } else { // far outside everything (should not happen in play): brute force the main loop
      const c = T.corridors[0];
      for (let i = 0; i < c.segs; i++) { projSeg(c, i, x, y, o); const m = o.dist - o.ww; if (m < bm) { bm = m; bc = c; bi = i; } }
    }
    projSeg(bc, bi, x, y, o);
    out.c = bc.idx; out.i = bi; out.s = bc.s[bi] + o.t; out.d = o.d;
    out.pen = o.dist - o.ww + r;
    const inv = o.dist > 1e-6 ? 1 / o.dist : 0;
    out.nx = -(x - o.qx) * inv; out.ny = -(y - o.qy) * inv; // toward the centre line
    out.surf = Math.abs(o.d) > o.hw ? bc.shoulder : bc.surf;
    const zs = bc.zones;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      const inS = z.s0 <= z.s1 ? out.s >= z.s0 && out.s <= z.s1 : out.s >= z.s0 || out.s <= z.s1;
      if (!inS || o.d < z.d0 || o.d > z.d1) continue;
      if (z.kind === 'surf') out.surf = z.surf; else if (z.kind === 'pad') out.pad = z; else if (z.kind === 'ramp') out.ramp = z;
    }
  }
  for (let k = 0; k < T.circles.length; k++) {
    const z = T.circles[k], dx = x - z.x, dy = y - z.y;
    if (dx * dx + dy * dy > z.r * z.r) continue;
    if (z.kind === 'pad') out.pad = z; else if (z.kind === 'ramp') out.ramp = z; else out.surf = z.surf;
  }
  // pillars: report whichever contact is deeper
  if (T.obstacles.length) {
    const cx = Math.floor((x - b.x0) / CELL), cy = Math.floor((y - b.y0) / CELL);
    if (cx >= 0 && cy >= 0 && cx < T.cells.gw && cy < T.cells.gh) {
      const ol = T.cells.obs[cy * T.cells.gw + cx];
      for (let k = 0; k < ol.length; k++) {
        const ob = T.obstacles[ol[k]], dx = x - ob.x, dy = y - ob.y, dd = Math.sqrt(dx * dx + dy * dy), pen = ob.r + r - dd;
        if (pen > out.pen && pen > 0) { out.pen = pen; out.nx = dd > 1e-6 ? dx / dd : 1; out.ny = dd > 1e-6 ? dy / dd : 0; }
      }
    }
  }
  return out;
}

// RACING LINE: per sample, an offset across the road that straightens corners (iterative
// smoothing kept inside the road), plus the curvature bots use to pick corner speeds.
const DANGER = { lava: 1, pit: 1 };
function smoothLine(c, d, lo, hi, iters) {
  const n = c.n, X = new Float64Array(n), Y = new Float64Array(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) { X[i] = c.px[i] - c.ty[i] * d[i]; Y[i] = c.py[i] + c.tx[i] * d[i]; }
    for (let i = 0; i < n; i++) {
      if (!c.closed && (i < 3 || i > n - 4)) { d[i] = 0; continue; }
      const a = c.closed ? (i - 2 + n) % n : i - 2, b = c.closed ? (i + 2) % n : i + 2;
      const want = ((X[a] + X[b]) / 2 - c.px[i]) * -c.ty[i] + ((Y[a] + Y[b]) / 2 - c.py[i]) * c.tx[i];
      d[i] = clamp(d[i] + (want - d[i]) * 0.6, lo[i], hi[i]);
    }
  }
}
function racingLine(c, obstacles = [], hazards = []) {
  const n = c.n, X = new Float64Array(n), Y = new Float64Array(n);
  const nx = (i) => -c.ty[i], ny = (i) => c.tx[i];
  const lo = new Float64Array(n), hi = new Float64Array(n);
  for (let i = 0; i < n; i++) { hi[i] = Math.max(0, c.hw[i] - 48); lo[i] = -hi[i]; }
  // pass 1: the free line (shortest, smoothest)
  const free = new Float64Array(n);
  smoothLine(c, free, lo, hi, c.closed ? 260 : 120);
  // pass 2: keep clear of pillars, hazards and lava strips, always passing each on the side the
  // free line was already on (if there is room), easing in and out so the line stays smooth
  const ease = (t) => 0.5 + 0.5 * Math.cos(Math.PI * clamp(t, 0, 1)); // 1 -> 0
  const bans = []; // {i0..i1 samples, at(i) -> [a, b] lateral band}
  const solid = [...obstacles.map((o) => ({ x: o.x, y: o.y, r: o.r + 50 })), ...hazards.map((h) => ({ x: h.x, y: h.y, r: h.r + 40 }))];
  for (const o of solid) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const along = (o.x - c.px[i]) * c.tx[i] + (o.y - c.py[i]) * c.ty[i], R = o.r + 420;
      if (Math.abs(along) > R) continue;
      const od = (o.x - c.px[i]) * nx(i) + (o.y - c.py[i]) * ny(i);
      if (Math.abs(od) > c.ww[i] + o.r) continue;
      const w = o.r * Math.sqrt(ease(Math.abs(along) / R));
      rows.push([i, od - w, od + w, Math.abs(along)]);
    }
    if (rows.length) bans.push(rows);
  }
  for (const z of c.zones) {
    if (z.kind !== 'surf' || !DANGER[z.surf] || (z.d0 < -c.hw[0] && z.d1 > c.hw[0])) continue;
    const a = Math.max(z.d0, -c.hw[0] - 60), b = Math.min(z.d1, c.hw[0] + 60), mid = (a + b) / 2, half = (b - a) / 2 + 45;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const si = c.s[i];
      let out = z.s0 <= z.s1 ? (si < z.s0 ? z.s0 - si : si > z.s1 ? si - z.s1 : 0) : (si > z.s1 && si < z.s0 ? Math.min(si - z.s1, z.s0 - si) : 0);
      if (c.closed) out = Math.min(out, c.len - out);
      if (out > 380) continue;
      const f = ease(out / 380);
      rows.push([i, mid - half * f, mid + half * f, out]);
    }
    if (rows.length) bans.push(rows);
  }
  for (const rows of bans) {
    const core = rows.reduce((m, r) => (r[3] < m[3] ? r : m), rows[0]); // the row at the hazard itself
    const ci = core[0], mid = (core[1] + core[2]) / 2;
    const roomL = core[1] - lo[ci], roomR = hi[ci] - core[2];
    let left = free[ci] < mid;
    if (left && roomL < 30 && roomR > roomL) left = false; else if (!left && roomR < 30 && roomL > roomR) left = true;
    for (const [i, a, b] of rows) { if (left) hi[i] = Math.max(lo[i], Math.min(hi[i], a)); else lo[i] = Math.min(hi[i], Math.max(lo[i], b)); }
  }
  const d = Float64Array.from(free);
  for (let i = 0; i < n; i++) d[i] = clamp(d[i], lo[i], hi[i]);
  smoothLine(c, d, lo, hi, c.closed ? 260 : 120);
  for (let i = 0; i < n; i++) { X[i] = c.px[i] + nx(i) * d[i]; Y[i] = c.py[i] + ny(i) * d[i]; }
  // curvature (1/radius) from points 3 samples apart
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = c.closed ? (i - 3 + n) % n : Math.max(0, i - 3), b = c.closed ? (i + 3) % n : Math.min(n - 1, i + 3);
    const ax = X[i] - X[a], ay = Y[i] - Y[a], bx = X[b] - X[i], by = Y[b] - Y[i];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const cross = (ax * by - ay * bx) / (la * lb), dot = (ax * bx + ay * by) / (la * lb);
    k[i] = Math.abs(Math.atan2(cross, dot)) / ((la + lb) / 2);
  }
  c.line = { d, x: X, y: Y, k, lo, hi }; // lo/hi: the safe lateral range at each sample
}
