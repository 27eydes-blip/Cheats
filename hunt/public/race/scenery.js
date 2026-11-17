// Oblivion GP track worlds: the neon-night palette of each world and the background scenery placed
// around its tracks (grandstands, billboards, light towers, and each world's own tall shapes:
// canyon mesas, ice spires and pines, basalt columns, city towers). Scenery always stands well
// clear of the road and the walls (placeScenery checks every corridor), so it reads as backdrop,
// never as something to dodge.
//
// ADDING A WORLD (a new track theme): in a new file, `addWorld('myworld', { pal: {...}, night: {...},
// tall: 'spire', flat: ['crack'] ... })` (any field left out comes from `base`), and import that
// file before the track is drawn (e.g. from the file that defines the track). The track's
// `world: 'myworld'` then picks it up everywhere: chunks, sky, minimap, scenery.
//
// Placement is pure (no DOM: test/race-scenery.test.js runs it in Node); drawing takes a canvas
// context. Flat things (and the footprints of tall ones) are baked into the cached track chunks;
// the tall shapes are drawn each frame leaning away from the camera (a cheap parallax that gives
// the world height), only where they are on screen, and baked flat under Low Graphics.
import { pointAt } from './trackgeom.js';

export const WALL = 26; // wall band beyond the shoulder (px), as trackart.js
const TAU = Math.PI * 2;
export const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ------------------------------------------------------------------ worlds
// pal: the painted colours (ground, runoff, road, walls, zones, minimap); night: the lights (neon
// lines, kerbs, wall strip, pole lamps; `night` is a light multiply over the whole chunk to unify it);
// dusk: [screen-edge tint, top glow, far lights] for the renderer; horizon: the far glow in the
// tilted views; tall / flat: the scenery kinds; neon: sign and window colours; crowd: shirt colours.
export const WORLD_ART = {};
export const THEMES = {}; // world -> pal (the old name, still used by the app and the renderer)
export function addWorld(key, def) {
  const b = WORLD_ART.desert || {};
  const w = { ...b, ...def, key, pal: { ...(b.pal || {}), ...(def.pal || {}) }, night: { ...(b.night || {}), ...(def.night || {}) } };
  WORLD_ART[key] = w; THEMES[key] = w.pal;
  return w;
}
export const artOf = (world) => WORLD_ART[world] || WORLD_ART.desert;

addWorld('desert', { // DESERT MIRAGE CANYON: violet dunes under a burning sunset rim, sandstone mesas
  pal: {
    bg: '#1d1024', ground: ['#24132b', '#2c1832', '#1b0e22'], tex: ['#3a2038', '#160a1c', '#4a2640', '#2a1430'], speck: 'rgba(255,140,110,0.06)',
    wall: '#140a18', wallTop: '#2e1a30', wallLine: '#ff8a4a', shoulder: '#2a1a2c', shoulderSpeck: 'rgba(255,170,140,0.08)',
    road: '#26212d', roadSpeck: 'rgba(255,220,200,0.05)', line: 'rgba(255,214,140,0.6)', curbA: '#ff3d6a', curbB: '#ffe8c0',
    sand: '#4a2c3a', ice: '#6a8ab0', snow: '#7a7aa0', lava: '#ff5212', mini: '#3a2236', miniRoad: '#140a14', sky: 'rgba(255,200,120,0.08)',
    blot: ['rgba(255,110,90,0.05)', 'rgba(120,60,200,0.07)', 'rgba(0,0,0,0.18)'],
  },
  night: { night: '#f0e4ff', line: '#ffd27a', edge: '#ffb070', curbA: '#ff3d6a', curbB: '#ffe8c0', wall: '#ff7a3a', pole: '#ffb35a', pole2: '#ff5fa2', puddles: 0.15 },
  dusk: ['rgba(60,16,70,0.55)', 'rgba(255,110,80,0.24)', ['#ff7a5a', '#ffb347', '#c04dff']], horizon: 'rgba(255,122,90,0.45)',
  tall: 'mesa', flat: ['dune'], neon: ['#ff5fa2', '#ffb347', '#c04dff', '#3ff5ff'], crowd: ['#ff5fa2', '#ffd27a', '#ffffff', '#c04dff', '#3ff5ff'],
});
addWorld('frozen', { // FROZEN LAKE CIRCUIT: deep blue snowfields, ice spires and dark pines, cyan light
  pal: {
    bg: '#0d1730', ground: ['#14223f', '#182a4c', '#101b34'], tex: ['#22375e', '#0c152a', '#2c4672', '#1a2c50'], speck: 'rgba(200,230,255,0.08)',
    wall: '#0a1226', wallTop: '#22385e', wallLine: '#7fe0ff', shoulder: '#1c2c4c', shoulderSpeck: 'rgba(220,240,255,0.1)',
    road: '#1e2534', roadSpeck: 'rgba(220,240,255,0.06)', line: 'rgba(235,245,255,0.6)', curbA: '#3f8bff', curbB: '#e8f8ff',
    ice: '#3a6a9a', snow: '#5a7aa8', sand: '#3a4a6a', lava: '#ff5212', mini: '#22355a', miniRoad: '#0a1224', sky: 'rgba(200,230,255,0.06)',
    blot: ['rgba(120,200,255,0.06)', 'rgba(160,120,255,0.05)', 'rgba(0,0,10,0.2)'],
  },
  night: { night: '#eef4ff', line: '#bff4ff', edge: '#9fe6ff', curbA: '#3f8bff', curbB: '#e8f8ff', wall: '#7fe0ff', pole: '#9fdcff', pole2: '#b38cff', puddles: 0.35 },
  dusk: ['rgba(10,26,70,0.55)', 'rgba(90,255,200,0.14)', ['#7fd8ff', '#b8a4ff', '#5effc8']], horizon: 'rgba(127,216,255,0.4)',
  tall: 'spire', flat: ['drift', 'pines'], neon: ['#7fe0ff', '#b38cff', '#5effc8', '#ffffff'], crowd: ['#7fe0ff', '#ffffff', '#b38cff', '#ff5fa2', '#5effc8'],
});
addWorld('ashlands', { // ASHLANDS INFERNO: black basalt, magma veins, lava pools, ember light
  pal: {
    bg: '#120a0a', ground: ['#181010', '#1e1312', '#120b0b'], tex: ['#2a1a16', '#0a0606', '#341f18', '#22140f'], speck: 'rgba(255,120,60,0.07)',
    wall: '#0c0606', wallTop: '#2a1814', wallLine: '#ff6a2a', shoulder: '#221613', shoulderSpeck: 'rgba(0,0,0,0.3)',
    road: '#221c1e', roadSpeck: 'rgba(255,180,120,0.05)', line: 'rgba(255,170,90,0.5)', curbA: '#ff6a1a', curbB: '#1d1416',
    lava: '#ff5212', sand: '#3a2620', ice: '#4a5a7a', snow: '#5a4a4a', mini: '#2a1a1a', miniRoad: '#0c0808', sky: 'rgba(255,80,20,0.05)',
    blot: ['rgba(255,80,20,0.06)', 'rgba(255,150,60,0.03)', 'rgba(0,0,0,0.25)'],
  },
  night: { night: '#fff0ea', line: '#ffb05a', edge: '#ff8a3a', curbA: '#ff4a1a', curbB: '#ffd0a0', wall: '#ff5a1f', pole: '#ff8a3a', pole2: '#ffd23f', puddles: 0 },
  dusk: ['rgba(40,6,10,0.55)', 'rgba(255,90,30,0.24)', ['#ff6a1a', '#ffb347', '#ff3fa4']], horizon: 'rgba(255,106,26,0.5)',
  tall: 'basalt', flat: ['pool', 'vein'], neon: ['#ff6a1a', '#ffd23f', '#ff3fa4'], crowd: ['#ff6a1a', '#ffd23f', '#ffffff', '#ff3fa4'],
});
addWorld('city', { // NEON CITY NIGHT: wet streets, towers with lit windows, neon on every roof
  pal: {
    bg: '#0a0a1c', ground: ['#0e0e22', '#121228', '#0b0b1c'], tex: ['#18183a', '#08081a', '#1e1e44', '#141432'], speck: 'rgba(160,160,255,0.05)',
    wall: '#08081a', wallTop: '#24244a', wallLine: '#ff3fa4', shoulder: '#16162e', shoulderSpeck: 'rgba(255,255,255,0.04)',
    road: '#18182a', roadSpeck: 'rgba(200,200,255,0.05)', line: 'rgba(120,250,255,0.6)', curbA: '#ff3fa4', curbB: '#e8e8ff',
    sand: '#2a2a46', ice: '#3a5a8a', snow: '#4a4a6a', lava: '#ff5212', mini: '#1c1c3c', miniRoad: '#08081a', sky: 'rgba(120,60,255,0.05)',
    blot: ['rgba(255,63,164,0.05)', 'rgba(63,245,255,0.04)', 'rgba(0,0,0,0.2)'],
  },
  night: { night: '#f2f0ff', line: '#78faff', edge: '#ff3fa4', curbA: '#ff3fa4', curbB: '#e8e8ff', wall: '#3ff5ff', pole: '#ff3fa4', pole2: '#3ff5ff', puddles: 1 },
  dusk: ['rgba(30,8,60,0.6)', 'rgba(255,63,164,0.22)', ['#ff3fa4', '#3ff5ff', '#a05cff', '#ffe14a']], horizon: 'rgba(255,63,164,0.45)',
  tall: 'tower', flat: ['lot'], neon: ['#ff3fa4', '#3ff5ff', '#a05cff', '#ffe14a', '#4bff9c'], crowd: ['#ff3fa4', '#3ff5ff', '#ffffff', '#ffe14a', '#a05cff'],
});

// ------------------------------------------------------------------ clearance
// distance from (x, y) to the nearest wall's outer edge (negative: on the track or its walls), for
// every corridor (not just the nearest one: a shortcut next to the main road counts too)
const FAR = 900, GC = 256;
export function clearanceOf(T) {
  if (T.box) {
    const B = T.box;
    return (x, y) => { const dx = Math.max(B.x0 - x, x - B.x1, 0), dy = Math.max(B.y0 - y, y - B.y1, 0); const inside = x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1; return inside ? -1 : Math.hypot(dx, dy) - WALL; };
  }
  const segs = [];
  for (const c of T.corridors) for (let i = 0; i < c.segs; i++) { const j = (i + 1) % c.n; segs.push(c.px[i], c.py[i], c.px[j], c.py[j], Math.max(c.ww[i], c.ww[j])); }
  const b = T.bounds, x0 = b.x0 - FAR * 2, y0 = b.y0 - FAR * 2, gw = Math.ceil((b.x1 - b.x0 + FAR * 4) / GC), gh = Math.ceil((b.y1 - b.y0 + FAR * 4) / GC);
  const grid = new Array(gw * gh);
  for (let k = 0; k < segs.length; k += 5) {
    const m = segs[k + 4] + WALL + FAR;
    const cx0 = Math.max(0, Math.floor((Math.min(segs[k], segs[k + 2]) - m - x0) / GC)), cx1 = Math.min(gw - 1, Math.floor((Math.max(segs[k], segs[k + 2]) + m - x0) / GC));
    const cy0 = Math.max(0, Math.floor((Math.min(segs[k + 1], segs[k + 3]) - m - y0) / GC)), cy1 = Math.min(gh - 1, Math.floor((Math.max(segs[k + 1], segs[k + 3]) + m - y0) / GC));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) (grid[cy * gw + cx] || (grid[cy * gw + cx] = [])).push(k);
  }
  return (x, y) => {
    const cx = Math.floor((x - x0) / GC), cy = Math.floor((y - y0) / GC);
    const list = cx >= 0 && cy >= 0 && cx < gw && cy < gh ? grid[cy * gw + cx] : null;
    if (!list) return FAR;
    let best = FAR;
    for (let n = 0; n < list.length; n++) {
      const k = list[n], ax = segs[k], ay = segs[k + 1], dx = segs[k + 2] - ax, dy = segs[k + 3] - ay, L2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t) - segs[k + 4] - WALL;
      if (d < best) best = d;
    }
    return best;
  };
}

// ------------------------------------------------------------------ placement
// gap: the space kept between any scenery and the nearest wall (px)
export const GAP = { stand: 34, board: 30, tall: 70, flat: 8, pine: 26 };
const polyR = (pts) => { let r = 0; for (let k = 0; k < pts.length; k += 2) r = Math.max(r, Math.hypot(pts[k], pts[k + 1])); return r; };
// is every point of a footprint (pts relative to x, y) at least gap clear of the walls?
function fits(clr, x, y, pts, gap) {
  if (clr(x, y) < gap + polyR(pts)) {
    for (let k = 0; k < pts.length; k += 2) if (clr(x + pts[k], y + pts[k + 1]) < gap) return false;
    // edge midpoints too (long shapes)
    for (let k = 0; k < pts.length; k += 2) { const j = (k + 2) % pts.length; if (clr(x + (pts[k] + pts[j]) / 2, y + (pts[k + 1] + pts[j + 1]) / 2) < gap) return false; }
    return clr(x, y) >= gap;
  }
  return true;
}
const rect = (w, h, a) => { const c = Math.cos(a), s = Math.sin(a), out = []; for (const [u, v] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) out.push(u * c - v * s, u * s + v * c); return out; };
const ngon = (n, r, a, jit, seed) => { const out = []; for (let k = 0; k < n; k++) { const an = a + (k / n) * TAU, rr = r * (1 - jit + jit * 2 * hash(k, seed, 51)); out.push(Math.cos(an) * rr, Math.sin(an) * rr); } return out; };
const bbox = (it, pts, m) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let k = 0; k < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k]); y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1]); } it.bx0 = it.x + x0 - m; it.by0 = it.y + y0 - m; it.bx1 = it.x + x1 + m; it.by1 = it.y + y1 + m; return it; };
const curv = (c, i) => { const j = (i + 1) % c.n, jj = (i + c.n - 1) % c.n; return Math.abs(c.tx[jj] * c.ty[i] - c.ty[jj] * c.tx[i]) + Math.abs(c.tx[i] * c.ty[j] - c.ty[i] * c.tx[j]); };

// all scenery for track T: { flat: [...], tall: [...] }, each item with a world box (bx0..by1) and
// `clr` (its clearance: how far a tall shape may lean before it would reach the walls)
export function placeScenery(T, art = artOf(T.world)) {
  const clr = clearanceOf(T), flat = [], tall = [], taken = [];
  const free = (x, y, r) => { for (let k = 0; k < taken.length; k += 3) if (Math.hypot(x - taken[k], y - taken[k + 1]) < r + taken[k + 2]) return false; return true; };
  const take = (x, y, r) => taken.push(x, y, r);
  // GRANDSTANDS along the straights of the main loop (both sides, spaced out), facing the road
  if (!T.box && T.corridors.length) {
    const c = T.corridors[0];
    let last = -1e9, side = 1, k = 0;
    for (let i = 0; i < c.segs; i++) {
      if (c.s[i] - last < 1500 || c.s[i] < 400) continue;
      let straight = true; for (let q = -6; q <= 6; q++) if (curv(c, (i + q + c.n) % c.n) > 0.04) { straight = false; break; }
      if (!straight) continue;
      for (const sd of [side, -side]) {
        const len = 340 + hash(i, 1, 61) * 160, dep = 86, d = sd * (c.ww[i] + WALL + GAP.stand + dep / 2 + 6);
        const p = pointAt(c, c.s[i], d), pts = rect(len, dep, p.a);
        if (!fits(clr, p.x, p.y, pts, GAP.stand) || !free(p.x, p.y, len / 2)) continue;
        const it = bbox({ kind: 'stand', x: p.x, y: p.y, a: p.a, len, dep, face: sd, pts, foot: pts, v: hash(i, 2, 62), clr: clr(p.x, p.y) }, pts, 40);
        flat.push(it); take(p.x, p.y, len / 2); last = c.s[i]; side = -sd; k++;
        break;
      }
    }
  }
  // BILLBOARDS on the outside of the bends, angled to the road
  if (!T.box) for (const c of T.corridors) {
    if (!c.main) continue;
    let last = -1e9;
    for (let i = 0; i < c.segs; i++) {
      if (c.s[i] - last < 900 || curv(c, i) < 0.07) continue;
      const j = (i + 1) % c.n, turn = c.tx[i] * c.ty[j] - c.ty[i] * c.tx[j], sd = turn > 0 ? -1 : 1; // outside of the bend
      const w = 150, dd = sd * (c.ww[i] + WALL + GAP.board + 26), p = pointAt(c, c.s[i], dd), pts = rect(w, 22, p.a);
      if (!fits(clr, p.x, p.y, pts, GAP.board) || !free(p.x, p.y, w / 2 + 10)) continue;
      flat.push(bbox({ kind: 'board', x: p.x, y: p.y, a: p.a, w, face: sd, pts, foot: pts, v: hash(i, 3, 63), col: art.neon[Math.floor(hash(i, 4, 64) * art.neon.length)], clr: clr(p.x, p.y) }, pts, 120));
      take(p.x, p.y, w / 2 + 10); last = c.s[i];
    }
  }
  // the world's own shapes on a jittered grid, the tall ones set further back
  const b = T.bounds, cell = art.tall === 'tower' ? 230 : art.tall === 'mesa' ? 330 : art.tall === 'basalt' ? 260 : 200;
  const x0 = b.x0 - 700, y0 = b.y0 - 700, x1 = b.x1 + 700, y1 = b.y1 + 700;
  for (let gy = Math.floor(y0 / cell); gy <= y1 / cell; gy++) for (let gx = Math.floor(x0 / cell); gx <= x1 / cell; gx++) {
    const h = hash(gx, gy, 11), x = (gx + 0.2 + hash(gx, gy, 12) * 0.6) * cell, y = (gy + 0.2 + hash(gx, gy, 13) * 0.6) * cell, v = hash(gx, gy, 16), rot = hash(gx, gy, 15) * TAU;
    const c0 = clr(x, y);
    if (c0 < GAP.flat) continue;
    const it = tallAt(art.tall, x, y, rot, v, h, c0, art);
    if (it && fits(clr, x, y, it.foot, GAP.tall) && free(x, y, it.r)) {
      let m = clr(x, y); for (let k = 0; k < it.foot.length; k += 2) m = Math.min(m, clr(x + it.foot[k], y + it.foot[k + 1]));
      it.clr = m; tall.push(prepTall(bbox(it, it.foot, 20))); take(x, y, it.r); continue;
    }
    for (const kind of art.flat) {
      const f = flatAt(kind, x, y, rot, v, hash(gx, gy, 17), cell);
      if (f && fits(clr, x, y, f.foot, f.gap) && free(x, y, f.r * 0.6)) { flat.push(bbox(f, f.foot, 30)); if (f.solid) take(x, y, f.r); break; }
    }
  }
  return { flat, tall };
}

// a tall shape: { kind, x, y, r, foot (footprint pts, relative), prisms: [{pts, h, ...}] }
function tallAt(kind, x, y, rot, v, h, c0, art) {
  if (kind === 'tower') { // city tower: one or two stacked blocks, lit windows, neon crown
    if (h > 0.72 || c0 < 110) return null;
    const w = 90 + v * 70, d = 80 + hash(Math.round(x), Math.round(y), 71) * 70, a = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2) + (hash(Math.round(x), 3, 72) - 0.5) * 0.3, foot = rect(w, d, a);
    const col = art.neon[Math.floor(v * 97) % art.neon.length], hh = 70 + hash(Math.round(y), 5, 73) * 160;
    const prisms = [{ pts: foot, h: hh, wall: ['#232346', '#14142c'], roof: '#1c1c3a', rim: col, win: hash(Math.round(x), 9, 74) < 0.5 ? '#ffe9a8' : '#9fe8ff' }];
    if (v > 0.55) prisms.push({ pts: rect(w * 0.55, d * 0.55, a), h: hh + 30 + v * 50, wall: ['#2a2a52', '#181832'], roof: '#22224a', rim: mixHex(col, '#ffffff', 0.3), win: null, beacon: 1 });
    return { kind, x, y, r: Math.hypot(w, d) / 2, foot, prisms, col };
  }
  if (kind === 'mesa') { // canyon mesa: terraced sandstone, a sunset rim on the top edge
    if (h > 0.55 || c0 < 150) return null;
    const r = 90 + v * 110, foot = ngon(9, r, rot, 0.18, Math.round(x));
    return { kind, x, y, r, foot, prisms: [
      { pts: foot, h: 34 + v * 30, wall: ['#7a3446', '#34142a'], roof: '#4e2236', rim: '#ff8a5a' },
      { pts: ngon(8, r * 0.66, rot + 0.3, 0.15, Math.round(y)), h: 64 + v * 60, wall: ['#8e4050', '#3c182e'], roof: '#5e2a40', rim: '#ffb07a' },
    ] };
  }
  if (kind === 'spire') { // ice spires: a cluster of crystal prisms, lit from inside
    if (h > 0.34 || c0 < 90) return null;
    const n = 3 + Math.floor(v * 3), prisms = [], all = [];
    for (let k = 0; k < n; k++) {
      const a = rot + k * 2.1, d = k ? 18 + hash(k, Math.round(x), 75) * 22 : 0, rr = 14 + hash(k, Math.round(y), 76) * 14, px = Math.cos(a) * d, py = Math.sin(a) * d;
      const pts = ngon(5, rr, a, 0.2, k + Math.round(x)).map((q, i) => q + (i & 1 ? py : px));
      prisms.push({ pts, h: 40 + hash(k, 7, 77) * 70, wall: ['#5aa8e0', '#2a5a98'], roof: '#bfeaff', rim: '#e8fbff', glass: 1 }); all.push(...pts);
    }
    return { kind, x, y, r: polyR(all) + 6, foot: all, prisms };
  }
  if (kind === 'basalt') { // basalt columns: hexagonal pillars with a magma seam between them
    if (h > 0.42 || c0 < 100) return null;
    const n = 4 + Math.floor(v * 4), prisms = [], all = [];
    for (let k = 0; k < n; k++) {
      const a = rot + k * 1.9, d = k ? 22 + hash(k, Math.round(x), 78) * 30 : 0, rr = 16 + hash(k, Math.round(y), 79) * 12, px = Math.cos(a) * d, py = Math.sin(a) * d;
      const pts = ngon(6, rr, 0.5, 0.05, k).map((q, i) => q + (i & 1 ? py : px));
      prisms.push({ pts, h: 22 + hash(k, 9, 80) * 60, wall: ['#2a1a18', '#140c0c'], roof: '#33201c', rim: '#ff6a1a' }); all.push(...pts);
    }
    prisms.sort((p, q) => p.h - q.h);
    return { kind, x, y, r: polyR(all) + 6, foot: all, prisms };
  }
  return null;
}
// a flat thing: { kind, x, y, r, foot, gap, solid? }
function flatAt(kind, x, y, rot, v, h2, cell) {
  if (kind === 'dune') return { kind, x, y, r: 70 + v * 50, rot, v, foot: ngon(6, 70 + v * 50, rot, 0, 1), gap: GAP.flat };
  if (kind === 'drift') return h2 < 0.5 ? { kind, x, y, r: 50 + v * 50, rot, v, foot: ngon(6, 50 + v * 50, rot, 0, 2), gap: GAP.flat } : null;
  if (kind === 'pines') { // a small stand of pines (a snow-capped star from above)
    if (h2 < 0.45) return null;
    const n = 2 + Math.floor(v * 4), trees = [], all = [];
    for (let k = 0; k < n; k++) { const a = rot + k * 2.4, d = k ? 34 + hash(k, Math.round(x), 81) * 30 : 0, r = 22 + hash(k, Math.round(y), 82) * 16; trees.push([Math.cos(a) * d, Math.sin(a) * d, r]); all.push(Math.cos(a) * (d + r), Math.sin(a) * (d + r)); }
    return { kind, x, y, r: polyR(all), trees, rot, v, foot: all.length >= 6 ? all : ngon(6, polyR(all), 0, 0, 3), gap: GAP.pine, solid: 1 };
  }
  if (kind === 'vein') return { kind, x, y, r: 60 + v * 60, rot, v, foot: ngon(6, 60 + v * 60, rot, 0, 4), gap: GAP.flat };
  if (kind === 'pool') return h2 < 0.3 ? { kind, x, y, r: 40 + v * 50, rot, v, foot: ngon(8, 52 + v * 64, rot, 0, 5), gap: 40, solid: 1, glow: 1 } : null;
  if (kind === 'lot') return h2 < 0.7 ? { kind, x, y, r: cell * 0.42, rot: Math.round(rot / (Math.PI / 2)) * (Math.PI / 2), v, foot: rect(cell * 0.8, cell * 0.55, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2)), gap: GAP.flat } : null;
  return null;
}
export function mixHex(a, b, f) { const p = (c, i) => parseInt(c.slice(i, i + 2), 16); return '#' + [1, 3, 5].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * f).toString(16).padStart(2, '0')).join(''); }
const alpha = (c, a) => c + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

// ------------------------------------------------------------------ drawing: flat (baked into chunks)
// g: chunk context in world units; art: the world; lit: false = the base pass, true = the light pass
export function drawFlat(g, it, art, lit) {
  const { x, y } = it;
  switch (it.kind) {
    case 'stand': return lit ? standLights(g, it, art) : stand(g, it, art);
    case 'board': return lit ? boardLights(g, it) : board(g, it);
    case 'dune': { // wind ripples on the sand, catching the sunset
      if (lit) return;
      g.lineCap = 'round'; g.lineWidth = 3;
      const c = Math.cos(it.rot), s = Math.sin(it.rot);
      for (let k = -3; k <= 3; k++) {
        const o = k * 15, L = it.r * (1 - Math.abs(k) * 0.18);
        g.strokeStyle = k & 1 ? 'rgba(255,140,110,0.07)' : 'rgba(10,0,20,0.22)';
        g.beginPath(); g.moveTo(x - c * L - s * o, y - s * L + c * o); g.quadraticCurveTo(x - s * (o + 14), y + c * (o + 14), x + c * L - s * o, y + s * L + c * o); g.stroke();
      }
      return;
    }
    case 'drift': { // wind-carved snow ridges, their crests catching the blue light
      if (lit) return;
      g.lineCap = 'round'; g.lineWidth = 3;
      const c = Math.cos(it.rot), s = Math.sin(it.rot);
      for (let k = -3; k <= 3; k++) {
        const o = k * 16, L = it.r * (1 - Math.abs(k) * 0.18);
        g.strokeStyle = k & 1 ? 'rgba(190,225,255,0.1)' : 'rgba(0,6,20,0.25)';
        g.beginPath(); g.moveTo(x - c * L - s * o, y - s * L + c * o); g.quadraticCurveTo(x - s * (o + 16), y + c * (o + 16), x + c * L - s * o, y + s * L + c * o); g.stroke();
      }
      return;
    }
    case 'pines': { // a stand of snow-laden pines (seen from above): dark needles, snow on the boughs
      if (lit) return;
      for (const [px, py, r] of it.trees) { g.beginPath(); g.ellipse(x + px + r * 0.5, y + py + r * 0.6, r * 1.05, r * 0.85, 0.6, 0, TAU); g.fillStyle = 'rgba(0,4,16,0.5)'; g.fill(); }
      for (const [px, py, r] of it.trees) for (const [k, col, o] of [[1, '#0b1a26', 0], [0.74, '#14303f', 0.05], [0.4, '#9cbfd4', 0.32], [0.2, '#d8eefa', 0.38]]) {
        const cx = x + px - r * o, cy = y + py - r * o;
        g.beginPath(); for (let i = 0; i < 22; i++) { const a = it.rot + k * 3 + (i / 22) * TAU, rr = r * k * (i & 1 ? 0.84 : 1); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fillStyle = col; g.fill();
      }
      return;
    }
    case 'vein': { // magma cracks glowing through the basalt
      g.lineCap = 'round'; g.lineJoin = 'round';
      const pass = lit ? [[7, 'rgba(255,90,20,0.18)'], [2.2, '#ff7a2a']] : [[10, 'rgba(0,0,0,0.35)']];
      for (const [lw, col] of pass) {
        g.lineWidth = lw; g.strokeStyle = col; g.beginPath();
        for (let b = 0; b < 3; b++) { let px = x, py = y, a = it.rot + b * 2.1; g.moveTo(px, py); for (let k = 0; k < 5; k++) { a += (hash(k, b, Math.round(x)) - 0.5) * 1.3; px += Math.cos(a) * it.r * 0.24; py += Math.sin(a) * it.r * 0.24; g.lineTo(px, py); } }
        g.stroke();
      }
      return;
    }
    case 'pool': { // a lava pool in a black crust (its glow animates in the renderer)
      if (lit) {
        const gr = g.createRadialGradient(x, y, 4, x, y, it.r);
        gr.addColorStop(0, '#ffe07a'); gr.addColorStop(0.45, '#ff7a1a'); gr.addColorStop(1, '#a01c06');
        g.beginPath(); g.ellipse(x, y, it.r, it.r * 0.72, it.rot, 0, TAU); g.fillStyle = gr; g.fill();
        g.fillStyle = 'rgba(70,14,4,0.6)'; // cooling crust floating on it
        for (let k = 0; k < 3; k++) { const a = it.rot + k * 2.2, d = it.r * (0.35 + 0.2 * hash(k, 1, Math.round(x))); g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, it.r * 0.16, it.r * 0.1, a, 0, TAU); g.fill(); }
        return;
      }
      g.beginPath(); g.ellipse(x, y, it.r * 1.25, it.r * 0.95, it.rot, 0, TAU); g.fillStyle = '#0a0505'; g.fill();
      return;
    }
    case 'lot': { // a city lot: pavement, kerb edge and parking lines
      if (lit) return;
      g.save(); g.translate(x, y); g.rotate(it.rot);
      const w = it.r * 1.9, h = it.r * 1.3;
      g.fillStyle = '#121230'; g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(160,170,255,0.14)'; g.lineWidth = 3; g.strokeRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(220,220,255,0.12)'; g.lineWidth = 2; g.beginPath();
      for (let k = -w / 2 + 24; k < w / 2 - 10; k += 30) { g.moveTo(k, -h / 2 + 8); g.lineTo(k, -h / 2 + 50); g.moveTo(k, h / 2 - 8); g.lineTo(k, h / 2 - 50); }
      g.stroke(); g.restore();
      return;
    }
  }
}
// a grandstand: tiered seating packed with a crowd, a roof canopy edge with floodlights
function stand(g, it, art) {
  const { len, dep } = it;
  g.save(); g.translate(it.x, it.y); g.rotate(it.a); g.scale(1, it.face); // +y now points away from the road
  g.fillStyle = 'rgba(0,0,8,0.5)'; g.fillRect(-len / 2 + 10, -dep / 2 + 14, len, dep);
  const tiers = 5, th = dep / tiers;
  for (let k = 0; k < tiers; k++) { g.fillStyle = k & 1 ? '#1a1830' : '#211e3a'; g.fillRect(-len / 2, -dep / 2 + k * th, len, th); }
  // the crowd: rows of tiny heads in team colours (deterministic)
  const C = art.crowd;
  for (let k = 0; k < tiers; k++) for (let i = 0; i < len / 7 - 1; i++) {
    const hh = hash(i, k, Math.round(it.x)); if (hh < 0.18) continue;
    g.fillStyle = hh > 0.9 ? C[Math.floor(hh * 97) % C.length] : hh > 0.5 ? '#3a3456' : '#2c2848';
    g.fillRect(-len / 2 + 4 + i * 7, -dep / 2 + k * th + 3, 4, th - 6);
  }
  g.fillStyle = '#0c0a18'; g.fillRect(-len / 2 - 4, dep / 2 - 6, len + 8, 10); // the back wall / roof edge
  g.restore();
}
function standLights(g, it, art) {
  const { len, dep } = it;
  g.save(); g.translate(it.x, it.y); g.rotate(it.a); g.scale(1, it.face);
  // the front rail glows in the world's neon; floodlights on the roof edge throw light onto the track
  g.globalCompositeOperation = 'lighter';
  const col = art.night.wall;
  g.fillStyle = alpha(col, 0.25); g.fillRect(-len / 2, -dep / 2 - 5, len, 8);
  g.fillStyle = col; g.fillRect(-len / 2, -dep / 2 - 2, len, 2.5);
  for (let i = 0; i < 4; i++) {
    const fx = -len / 2 + len * (i + 0.5) / 4, gr = g.createRadialGradient(fx, dep / 2 - 2, 0, fx, dep / 2 - 2, 26);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, alpha('#fff4d8', 0.6)); gr.addColorStop(1, alpha('#fff4d8', 0));
    g.fillStyle = gr; g.fillRect(fx - 26, dep / 2 - 28, 52, 52);
  }
  // camera flashes and phone lights in the crowd
  const C = art.crowd;
  for (let i = 0; i < len / 30; i++) { const hh = hash(i, 5, Math.round(it.y)); const px = -len / 2 + hh * len, py = -dep / 2 + hash(i, 6, 3) * dep * 0.8; g.fillStyle = alpha(C[i % C.length], 0.7); g.fillRect(px, py, 2.5, 2.5); }
  g.globalCompositeOperation = 'source-over';
  g.restore();
}
// a billboard on two legs, its face toward the road: a neon frame and an original glyph
const BOARD_TXT = ['OBLIVION GP', 'NEON NIGHT', '>>>', 'FULL SEND', 'NO BRAKES', 'GP'];
function board(g, it) {
  g.save(); g.translate(it.x, it.y); g.rotate(it.a); g.scale(1, it.face);
  g.fillStyle = 'rgba(0,0,8,0.5)'; g.fillRect(-it.w / 2 + 8, -8, it.w, 26);
  g.fillStyle = '#0a0814'; g.fillRect(-it.w / 2, -11, it.w, 22);
  g.fillStyle = '#05040a'; g.fillRect(-it.w * 0.3 - 3, 11, 6, 10); g.fillRect(it.w * 0.3 - 3, 11, 6, 10);
  g.restore();
}
function boardLights(g, it) {
  const col = it.col;
  g.save(); g.translate(it.x, it.y); g.rotate(it.a); g.scale(1, it.face);
  // light spilling onto the ground in front of it
  g.globalCompositeOperation = 'lighter';
  const gr = g.createLinearGradient(0, -10, 0, -90); gr.addColorStop(0, alpha(col, 0.22)); gr.addColorStop(1, alpha(col, 0));
  g.fillStyle = gr; g.beginPath(); g.moveTo(-it.w / 2, -10); g.lineTo(it.w / 2, -10); g.lineTo(it.w / 2 + 30, -90); g.lineTo(-it.w / 2 - 30, -90); g.closePath(); g.fill();
  g.strokeStyle = alpha(col, 0.3); g.lineWidth = 7; g.strokeRect(-it.w / 2 + 3, -8, it.w - 6, 16);
  g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(-it.w / 2 + 3, -8, it.w - 6, 16);
  g.globalCompositeOperation = 'source-over';
  // the face text reads from the road (the board's front edge is toward the road: flip the text upright)
  g.scale(1, it.face); g.rotate(it.face > 0 ? Math.PI : 0);
  g.fillStyle = mixHex(col, '#ffffff', 0.55); g.font = '700 12px "Chakra Petch", "Barlow Semi Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(BOARD_TXT[Math.floor(it.v * BOARD_TXT.length)], 0, 0.5, it.w - 14);
  g.restore();
}

// ------------------------------------------------------------------ drawing: tall (per frame)
// The footprint shadow is baked (drawTallBase); the walls and roof are drawn each frame offset
// away from the eye (ex, ey): o = (item - eye) x k per unit of height, capped so a roof never
// leans over the walls of the track. Only faces toward the eye are drawn.
export const PARALLAX = 0.00055; // world offset per unit of height per unit of distance from the eye
export function drawTallBase(g, it) {
  g.fillStyle = 'rgba(0,0,6,0.55)';
  for (const p of it.prisms) { g.beginPath(); poly(g, it.x, it.y, p.pts, 6, 8); g.fill(); }
}
function poly(g, x, y, pts, ox = 0, oy = 0) { g.moveTo(x + pts[0] + ox, y + pts[1] + oy); for (let k = 2; k < pts.length; k += 2) g.lineTo(x + pts[k] + ox, y + pts[k + 1] + oy); g.closePath(); }
// ox, oy: offset per unit of height (already capped by the caller); t: time (beacons); low: no windows
export function drawTall(g, it, ox, oy, t, steady, low) {
  const x = it.x, y = it.y;
  for (const p of it.prisms) {
    const pts = p.pts, n = pts.length, h = p.h, dx = ox * h, dy = oy * h;
    // walls facing the eye (outward normal against the lean)
    for (let k = 0; k < n; k += 2) {
      const j = (k + 2) % n, ex = pts[j] - pts[k], ey = pts[j + 1] - pts[k + 1];
      // outward normal of a counter-clockwise ring in a y-down world: (ey, -ex); test either winding
      const nx = ey * (p.cw || 1), ny = -ex * (p.cw || 1);
      if (nx * dx + ny * dy >= 0) continue;
      const ax = x + pts[k], ay = y + pts[k + 1], bx = x + pts[j], by = y + pts[j + 1];
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx + dx, by + dy); g.lineTo(ax + dx, ay + dy); g.closePath();
      g.fillStyle = nx - ny > 0 ? p.wall[1] : p.wall[0]; g.fill();
      if (p.win && !low) { // lit floors: a band of window light across the face per storey
        g.strokeStyle = p.win; g.lineWidth = 1.4; g.globalAlpha = 0.55;
        g.beginPath(); for (let f = 0.2; f < 0.95; f += 0.19) { g.moveTo(ax + dx * f, ay + dy * f); g.lineTo(bx + dx * f, by + dy * f); } g.stroke();
        g.globalAlpha = 1;
      }
    }
    // the roof and its lit rim
    g.beginPath(); poly(g, x, y, pts, dx, dy);
    g.fillStyle = p.roof; g.fill();
    g.lineJoin = 'round';
    if (!low) { g.globalAlpha = 0.3; g.strokeStyle = p.rim; g.lineWidth = 6; g.stroke(); g.globalAlpha = 1; }
    g.strokeStyle = p.rim; g.lineWidth = p.glass ? 1.5 : 2; g.stroke();
    if (p.beacon) { // a red light on the top of the tower (blinks; steady under Reduce Flashing)
      const on = steady || (t * 1.3 + it.x * 0.01) % 1 < 0.5;
      if (on) { g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(x + dx, y + dy, 3.2, 0, TAU); g.fill(); }
    }
  }
}
// winding of each prism (so wall culling works whatever order the points were made in)
export function prepTall(it) {
  it.hMax = 0;
  for (const p of it.prisms) { it.hMax = Math.max(it.hMax, p.h); let a = 0; for (let k = 0; k < p.pts.length; k += 2) { const j = (k + 2) % p.pts.length; a += p.pts[k] * p.pts[j + 1] - p.pts[j] * p.pts[k + 1]; } p.cw = a > 0 ? 1 : -1; }
  return it;
}
