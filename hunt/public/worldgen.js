// Free Play world generator: 20000x20000, a 3x3 grid of zones around the Hub district.
// Deterministic (WORLD_SEED) so every zone Durable Object and every client build the same map.
//
//   City        | Ruined Citadel | Wildwood
//   The Hollow  | The Hub        | Ashlands
//   Frozen Lake | Dead Marsh     | Desert Mirage
//
// Roads link the hub to every zone and run a ring through the outer zones; zone borders are
// spiked walls with wide gates (always where a road crosses). Each zone gets its own terrain
// (fortress, caves, lava rivers, mud...), a landmark where it has one, and points of interest:
// power-cube vaults, crate caches, ambush bushes and high ground.
import {
  TILE, EMPTY, WALL, BUSH, CRATE, WATER, WORLD_GRID, ZONES, ZONE_EDGES, HUB, WORLDS, worldId, rng, GEN,
} from './shared.js';

export const WORLD_SEED = 424242;

export function generateWorld() {
  const { newMap, layout, addPiece, borderRing, clearCircle, freeAround } = GEN;
  const N = WORLD_GRID, E = ZONE_EDGES.map((e) => e / TILE); // [0, 134, 266, 400]
  const m = newMap(N, N, 'world', null);
  const I = (x, y) => y * N + x;
  const inMap = (x, y) => x > 0 && y > 0 && x < N - 1 && y < N - 1;
  const hx = HUB.x / TILE, hy = HUB.y / TILE;
  const R = rng(WORLD_SEED);
  borderRing(m);

  // ------------------------------------------------------------------ roads
  const zc = (z) => [Math.floor((E[z.c] + E[z.c + 1]) / 2), Math.floor((E[z.r] + E[z.r + 1]) / 2)];
  const paint = (x, y, rad) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (inMap(x + dx, y + dy) && dx * dx + dy * dy <= rad * rad + 1) m.road[I(x + dx, y + dy)] = 1; };
  const road = (a, b) => { // a gently curving road: two quadratic halves through a jittered midpoint
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const off = (R() - 0.5) * len * 0.25, mx = (a[0] + b[0]) / 2 + nx * off, my = (a[1] + b[1]) / 2 + ny * off;
    for (let t = 0; t <= 1; t += 0.5 / len) {
      const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mx + t * t * b[0], y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * my + t * t * b[1];
      paint(Math.round(x), Math.round(y), 1);
    }
  };
  const outer = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((s) => ZONES.find((z) => z.slot === s));
  for (const z of outer) road([hx, hy], zc(z));
  for (let i = 0; i < 8; i++) road(zc(outer[i]), zc(outer[(i + 1) % 8]));
  const nearRoad = (x, y, d = 2) => { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (inMap(x + dx, y + dy) && m.road[I(x + dx, y + dy)]) return true; return false; };
  const nearHub = (x, y, extra = 2.5) => Math.hypot(x + 0.5 - hx, y + 0.5 - hy) < HUB.r / TILE + extra;

  // ------------------------------------------------------------------ zone borders (spiked fences with gates)
  for (const e of [E[1], E[2]]) for (let k = 1; k < N - 1; k++) {
    if (k % 18 >= 11) continue; // regular gates
    for (const [x, y] of [[e - 1, k], [e, k], [k, e - 1], [k, e]]) {
      if (nearRoad(x, y, 3) || nearHub(x, y, 3)) continue; // a road always gets a gate
      m.t[I(x, y)] = WALL; m.border[I(x, y)] = 1;
    }
  }

  // ------------------------------------------------------------------ helpers
  const zoneRect = (z, pad = 3) => [E[z.c] + pad, E[z.r] + pad, E[z.c + 1] - pad, E[z.r + 1] - pad];
  const free = (x, y) => inMap(x, y) && m.t[I(x, y)] === EMPTY && !m.road[I(x, y)] && !m.lm[I(x, y)] && !nearHub(x, y);
  const areaFree = (x0, y0, w, h, margin = 1) => {
    for (let y = y0 - margin; y < y0 + h + margin; y++) for (let x = x0 - margin; x < x0 + w + margin; x++) if (!free(x, y) || m.high[I(x, y)]) return false;
    return true;
  };
  const pickSpot = (z, w, h, r, margin = 1, tries = 300) => {
    const [x0, y0, x1, y1] = zoneRect(z, 5);
    for (let i = 0; i < tries; i++) {
      const x = x0 + Math.floor(r() * (x1 - x0 - w)), y = y0 + Math.floor(r() * (y1 - y0 - h));
      if (areaFree(x, y, w, h, margin)) return [x, y];
    }
    return null;
  };
  // a wall line as pieces of up to 3 cells; road cells (and their sides) become gaps
  const wallLine = (cells, world, r) => {
    let run = [];
    const flush = () => { if (run.length) addPiece(m, run, Math.floor(r() * 3), null, world); run = []; };
    for (const [x, y] of cells) {
      if (!inMap(x, y) || m.t[I(x, y)] !== EMPTY || nearRoad(x, y, 1) || nearHub(x, y) || m.lm[I(x, y)]) { flush(); continue; }
      run.push([x, y]);
      if (run.length === 3) flush();
    }
    flush();
  };
  const hLine = (x0, x1, y) => { const c = []; for (let x = x0; x <= x1; x++) c.push([x, y]); return c; };
  const vLine = (x, y0, y1) => { const c = []; for (let y = y0; y <= y1; y++) c.push([x, y]); return c; };
  const rockAt = (x, y) => { if (!inMap(x, y) || m.road[I(x, y)] || nearHub(x, y) || m.border[I(x, y)]) return; m.t[I(x, y)] = WALL; m.rock[I(x, y)] = 1; };
  const landmark = (kind, zone, cx, cy, cells, blockCells) => {
    for (const [x, y] of cells) if (inMap(x, y)) m.lm[I(x, y)] = 1;
    for (const [x, y] of blockCells) if (inMap(x, y)) { m.t[I(x, y)] = WALL; m.rock[I(x, y)] = 1; }
    m.landmarks.push({ kind, zone: zone.slot, x: cx * TILE, y: cy * TILE });
  };
  // nearest spot to (cx,cy) whose disc of radius rad has no road, border, hub or other landmark
  const findClear = (cx, cy, rad, z) => {
    const [x0, y0, x1, y1] = zoneRect(z, Math.ceil(rad) + 4);
    for (let d = 0; d < 60; d++) for (let k = 0; k < Math.max(1, d * 8); k++) {
      const a = (k / Math.max(1, d * 8)) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (x < x0 || y < y0 || x > x1 || y > y1) continue;
      if (disc(x + 0.5, y + 0.5, rad + 1.5).every(([X, Y]) => inMap(X, Y) && !m.road[I(X, Y)] && !m.border[I(X, Y)] && !m.lm[I(X, Y)] && !nearHub(X, Y))) return [x, y];
    }
    return [cx, cy];
  };
  const disc = (cx, cy, rad) => { const c = []; for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad) c.push([x, y]); return c; };
  // smooth value noise for blobs (mud, rock)
  const vnoise = (seed, scale) => (x, y) => {
    const h = (a, b) => ((((a * 374761393) ^ (b * 668265263) ^ seed) * 1274126177) >>> 0) / 4294967296;
    const gx = x / scale, gy = y / scale, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const s = (t) => t * t * (3 - 2 * t);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * s(fx), b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * s(fx);
    return a + (b - a) * s(fy);
  };

  // ------------------------------------------------------------------ zone terrain
  for (const z of ZONES) {
    const r = rng(WORLD_SEED + (worldId(z.world) + 3) * 7919);
    const [zx0, zy0, zx1, zy1] = zoneRect(z, 3);
    const [cx, cy] = zc(z);
    if (z.world === 'citadel') {
      // a huge crumbling fortress: outer walls with gates, corner towers, courtyards, tunnels,
      // and the GIANT TOWER (landmark) in the middle
      const fx0 = zx0 + 14, fy0 = zy0 + 14, fx1 = zx1 - 14, fy1 = zy1 - 12;
      const gate = (cells, every = 26) => cells.filter((c, i) => (i % every) > 4 || r() < 0.03 ? r() > 0.12 : false); // gates + crumbled gaps
      wallLine(gate(hLine(fx0, fx1, fy0)), 'citadel', r); wallLine(gate(hLine(fx0, fx1, fy1)), 'citadel', r);
      wallLine(gate(vLine(fx0, fy0, fy1)), 'citadel', r); wallLine(gate(vLine(fx1, fy0, fy1)), 'citadel', r);
      for (const [tx, ty] of [[fx0 - 3, fy0 - 3], [fx1 + 1, fy0 - 3], [fx0 - 3, fy1 + 1], [fx1 + 1, fy1 + 1]]) { // corner towers (2x2 solid, just outside the corners)
        const cells = []; for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) cells.push([x, y]);
        if (cells.every(([x, y]) => inMap(x, y) && m.t[I(x, y)] === EMPTY && !nearRoad(x, y, 1))) addPiece(m, cells, 1, null, 'citadel');
      }
      // courtyards: inner cross walls with doorways
      const ix = Math.floor((fx0 + fx1) / 2), iy = Math.floor((fy0 + fy1) / 2);
      for (const yy of [Math.floor(fy0 + (fy1 - fy0) / 3), Math.floor(fy0 + 2 * (fy1 - fy0) / 3)]) wallLine(gate(hLine(fx0 + 2, fx1 - 2, yy), 14), 'citadel', r);
      for (const xx of [Math.floor(fx0 + (fx1 - fx0) / 3), Math.floor(fx0 + 2 * (fx1 - fx0) / 3)]) wallLine(gate(vLine(xx, fy0 + 2, fy1 - 2), 14), 'citadel', r);
      // tunnels: two long parallel walls two tiles apart, open at the ends
      for (const ty of [fy0 + 6, fy1 - 8]) { wallLine(hLine(ix - 22, ix + 22, ty), 'citadel', r); wallLine(hLine(ix - 22, ix + 22, ty + 3), 'citadel', r); }
      const [tx, ty] = findClear(ix, iy, 4.2, z);
      for (const [x, y] of disc(tx + 0.5, ty + 0.5, 5.2)) if (inMap(x, y) && m.pieceAt[I(x, y)] >= 0) { // clear walls around the tower base
        const p = m.pieces[m.pieceAt[I(x, y)]];
        for (const [px, py] of p.cells) { m.t[I(px, py)] = EMPTY; m.pieceAt[I(px, py)] = -1; }
        p.cells = []; // (an emptied piece draws nothing)
      }
      landmark('tower', z, tx + 0.5, ty + 0.5, disc(tx + 0.5, ty + 0.5, 4.2), disc(tx + 0.5, ty + 0.5, 3.2));
    } else if (z.world === 'hollow') {
      // caves: cellular automata rock, then remove 1-tile squeezes and unreachable pockets
      const w = zx1 - zx0, h = zy1 - zy0, cave = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cave[y * w + x] = r() < 0.47 ? 1 : 0;
      for (let it = 0; it < 5; it++) {
        const nx = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; n += xx < 0 || yy < 0 || xx >= w || yy >= h ? 1 : cave[yy * w + xx]; }
          nx[y * w + x] = n >= 5 ? 1 : 0;
        }
        cave.set(nx);
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = zx0 + x, Y = zy0 + y;
        if (!cave[y * w + x] || nearRoad(X, Y, 2) || m.t[I(X, Y)] !== EMPTY) continue;
        rockAt(X, Y);
      }
      // no squeezes: an open cell must be part of some open 2x2 block (players are ~52px wide)
      const open = (X, Y) => inMap(X, Y) && !(m.t[I(X, Y)] === WALL && m.rock[I(X, Y)]);
      for (let pass = 0; pass < 2; pass++) for (let Y = zy0; Y < zy1; Y++) for (let X = zx0; X < zx1; X++) {
        if (!open(X, Y) || m.t[I(X, Y)] !== EMPTY) continue;
        let ok = false;
        for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (open(X + ox, Y + oy) && open(X + ox + 1, Y + oy) && open(X + ox, Y + oy + 1) && open(X + ox + 1, Y + oy + 1)) ok = true;
        if (!ok) rockAt(X, Y);
      }
      // no hidden pockets: flood from the roads; open space you can't reach becomes rock
      const seen = new Uint8Array(N * N), q = [];
      for (let Y = zy0; Y < zy1; Y++) for (let X = zx0; X < zx1; X++) if (m.road[I(X, Y)]) { seen[I(X, Y)] = 1; q.push(I(X, Y)); }
      while (q.length) {
        const i = q.pop(), X = i % N, Y = (i / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = X + dx, yy = Y + dy;
          if (xx < zx0 - 3 || yy < zy0 - 3 || xx >= zx1 + 3 || yy >= zy1 + 3 || !inMap(xx, yy) || seen[I(xx, yy)] || !open(xx, yy)) continue;
          seen[I(xx, yy)] = 1; q.push(I(xx, yy));
        }
      }
      for (let Y = zy0; Y < zy1; Y++) for (let X = zx0; X < zx1; X++) if (!seen[I(X, Y)] && open(X, Y) && m.t[I(X, Y)] === EMPTY) rockAt(X, Y);
      // the crystal heart of the Hollow (decoration POI)
      m.pois.push({ kind: 'crystals', zone: z.slot, x: cx * TILE, y: cy * TILE });
    } else if (z.world === 'ashlands') {
      // two lava rivers wandering north-south (bridges where roads cross), and the VOLCANO
      for (const startX of [zx0 + Math.floor((zx1 - zx0) * 0.3), zx0 + Math.floor((zx1 - zx0) * 0.72)]) {
        let x = startX;
        for (let y = zy0 - 2; y <= zy1 + 2; y++) {
          x += Math.round((r() - 0.5) * 2.2); x = Math.max(zx0 + 4, Math.min(zx1 - 4, x));
          const bridge = (y % 28) < 3; // a crossing every so often
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx;
            if (!inMap(X, y) || nearRoad(X, y, 1) || bridge || m.t[I(X, y)] !== EMPTY || nearHub(X, y)) continue;
            m.t[I(X, y)] = WATER;
          }
        }
      }
      const [vx, vy] = findClear(cx + 10, cy - 14, 7, z);
      const ring = disc(vx + 0.5, vy + 0.5, 6.2);
      for (const [x, y] of ring) if (inMap(x, y)) { m.t[I(x, y)] = EMPTY; m.road[I(x, y)] = 0; }
      landmark('volcano', z, vx + 0.5, vy + 0.5, disc(vx + 0.5, vy + 0.5, 7), ring);
      // basalt outcrops
      const nz = vnoise(1337, 9);
      for (let y = zy0; y < zy1; y++) for (let x = zx0; x < zx1; x++) if (nz(x, y) > 0.8 && m.t[I(x, y)] === EMPTY && !nearRoad(x, y, 2) && !m.lm[I(x, y)]) rockAt(x, y);
    } else if (z.world === 'marsh') {
      // sinking mud everywhere, a few rocky hummocks
      const nz = vnoise(4242, 7);
      for (let y = zy0; y < zy1; y++) for (let x = zx0; x < zx1; x++) if (nz(x, y) > 0.56 && !m.road[I(x, y)]) m.mud[I(x, y)] = 1;
    } else if (z.world === 'frozen') {
      // the FROZEN WATERFALL: a cliff band with a frozen fall, north of the lake
      const [wx, wy] = findClear(cx + 1, cy - 17, 9, z), fx = wx - 7, fy = wy - 1, cells = [], block = [];
      for (let y = fy - 2; y <= fy + 4; y++) for (let x = fx - 2; x <= fx + 15; x++) cells.push([x, y]);
      for (let y = fy; y <= fy + 2; y++) for (let x = fx; x <= fx + 13; x++) block.push([x, y]);
      for (const [x, y] of cells) if (inMap(x, y)) { m.t[I(x, y)] = EMPTY; m.road[I(x, y)] = 0; }
      landmark('waterfall', z, fx + 7, fy + 1.5, cells, block);
    }
  }

  // ------------------------------------------------------------------ points of interest (every outer zone + the hub district)
  for (const z of ZONES) {
    const r = rng(WORLD_SEED + (worldId(z.world) + 3) * 104729);
    const world = z.world;
    // power-cube vaults: a walled 7x7 room, one gate, three crates inside
    for (let k = 0; k < 2; k++) {
      const s = pickSpot(z, 7, 7, r, 2); if (!s) continue;
      const [x, y] = s, gateSide = Math.floor(r() * 4);
      const ring = [];
      for (let i = 0; i < 7; i++) ring.push([x + i, y], [x + i, y + 6]);
      for (let j = 1; j < 6; j++) ring.push([x, y + j], [x + 6, y + j]);
      const isGate = ([cx2, cy2]) => (gateSide === 0 && cy2 === y && (cx2 === x + 3 || cx2 === x + 4)) || (gateSide === 1 && cy2 === y + 6 && (cx2 === x + 3 || cx2 === x + 4))
        || (gateSide === 2 && cx2 === x && (cy2 === y + 3 || cy2 === y + 4)) || (gateSide === 3 && cx2 === x + 6 && (cy2 === y + 3 || cy2 === y + 4));
      const sides = [ring.filter((c) => c[1] === y), ring.filter((c) => c[1] === y + 6), ring.filter((c) => c[0] === x && c[1] > y && c[1] < y + 6), ring.filter((c) => c[0] === x + 6 && c[1] > y && c[1] < y + 6)];
      for (const side of sides) {
        let run = [];
        const flush = () => { if (run.length) addPiece(m, run, Math.floor(r() * 3), null, world); run = []; };
        for (const c of side.sort((a, b) => a[0] - b[0] || a[1] - b[1])) { if (isGate(c)) { flush(); continue; } run.push(c); if (run.length === 3) flush(); }
        flush();
      }
      for (const [dx, dy] of [[2, 2], [4, 2], [3, 4]]) m.t[I(x + dx, y + dy)] = CRATE;
      m.pois.push({ kind: 'vault', zone: z.slot, x: (x + 3.5) * TILE, y: (y + 3.5) * TILE });
    }
    // crate caches
    for (let k = 0; k < 3; k++) {
      const s = pickSpot(z, 3, 2, r, 1); if (!s) continue;
      const [x, y] = s;
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 1]]) m.t[I(x + dx, y + dy)] = CRATE;
      m.pois.push({ kind: 'cache', zone: z.slot, x: (x + 1.5) * TILE, y: (y + 1) * TILE });
    }
    // ambush spots: thick bushes right beside a road
    let am = 0;
    const [rx0, ry0, rx1, ry1] = zoneRect(z, 6);
    for (let t = 0; t < 4000 && am < 3; t++) {
      const x = rx0 + Math.floor(r() * (rx1 - rx0)), y = ry0 + Math.floor(r() * (ry1 - ry0));
      if (!m.road[I(x, y)]) continue;
      const dir = r() < 0.5 ? [3, 0] : [0, 3], bx = x + dir[0] * (r() < 0.5 ? 1 : -1), by = y + dir[1] * (r() < 0.5 ? 1 : -1);
      if (!areaFree(bx, by, 3, 3, 0)) continue;
      for (let yy = by; yy < by + 3; yy++) for (let xx = bx; xx < bx + 3; xx++) m.t[I(xx, yy)] = BUSH;
      m.pois.push({ kind: 'ambush', zone: z.slot, x: (bx + 1.5) * TILE, y: (by + 1.5) * TILE });
      am++;
    }
    // high ground: a raised plateau that lets you see further (and into bushes)
    for (let k = 0; k < 2; k++) {
      const s = pickSpot(z, 8, 8, r, 1); if (!s) continue;
      const [x, y] = s;
      for (let yy = y; yy < y + 8; yy++) for (let xx = x; xx < x + 8; xx++) if (!((xx === x || xx === x + 7) && (yy === y || yy === y + 7))) m.high[I(xx, yy)] = 1;
      m.pois.push({ kind: 'high', zone: z.slot, x: (x + 4) * TILE, y: (y + 4) * TILE });
    }
  }

  // ------------------------------------------------------------------ cover everywhere else
  for (const z of ZONES) {
    const W = WORLDS[worldId(z.world)] || { gen: { pieces: 5, shapes: ['s1', 's2', 's3', 'sq'], bushes: 2, crates: 3, water: 0 } };
    const r = rng(WORLD_SEED + worldId(z.world) * 7919);
    const area = ((E[z.c + 1] - E[z.c]) * (E[z.r + 1] - E[z.r])) / 1600; // in 2000x2000 units
    const dense = z.world === 'hollow' ? 0.35 : z.world === 'citadel' ? 0.45 : z.world === 'hub' ? 0.5 : 1;
    const gen = { ...W.gen, pieces: Math.round(W.gen.pieces * 4 * area * dense), bushes: Math.round(W.gen.bushes * 3.5 * area * (z.world === 'marsh' ? 1.4 : 1)), crates: Math.round(W.gen.crates * 2 * area * dense), water: Math.round(W.gen.water * 2.5 * area) };
    layout(m, r, gen, zoneRect(z, 2), (x, y) => [[x, y]], (x, y) => nearHub(x, y) || nearRoad(x, y, 1) || m.lm[I(x, y)] === 1);
  }
  // nothing may sit on a road
  for (let i = 0; i < m.t.length; i++) if (m.road[i] && !m.border[i] && m.t[i] !== EMPTY && m.t[i] !== WATER) { if (m.pieceAt[i] < 0) { m.t[i] = EMPTY; m.rock[i] = 0; } }

  // ------------------------------------------------------------------ the safe hub: a ring of warm stone pillars
  clearCircle(m, hx, hy, HUB.r / TILE + 1.5, false);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (nearHub(x, y, 1.5)) { m.mud[I(x, y)] = 0; m.rock[I(x, y)] = 0; }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.floor(hx + Math.cos(a) * 5.4), y = Math.floor(hy + Math.sin(a) * 5.4);
    if (m.t[I(x, y)] === EMPTY && !m.road[I(x, y)] && freeAround(m, [[x, y]], 0)) addPiece(m, [[x, y]], i % 3, null, 'hub');
  }
  m.base = m.t.slice();
  return m;
}
