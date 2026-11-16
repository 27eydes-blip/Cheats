// Hunt Racers track art: four original themes painted in code. The static world (ground, scenery,
// walls, curbs, road, zones, start line, ramps, pad plates) is rendered once per chunk into an
// offscreen canvas (lazily, least-recently-used cache); the renderer only blits chunks plus a
// handful of animated overlays (pad chevrons, lava glow, hazards, item boxes) each frame.
import { pointAt } from './trackgeom.js';
import { CAR_R } from './physics.js';
import { SETTINGS } from '../settings.js';

export const CHUNK = 384; // world px per chunk side
const MAX_CHUNKS = 40;
const WALL = 26; // wall band beyond the shoulder (px)

// colours per world (track.world)
export const THEMES = {
  desert: {
    bg: '#d39a57', ground: ['#d9a35f', '#c98d4c', '#e4b673'], speck: 'rgba(120,60,20,0.18)',
    wall: '#8a3f22', wallTop: '#c8683a', wallLine: '#f0a46a', shoulder: '#e6c07e', shoulderSpeck: 'rgba(150,90,40,0.25)',
    road: '#5d5452', roadSpeck: 'rgba(255,230,200,0.06)', line: 'rgba(255,236,190,0.55)', curbA: '#d8432c', curbB: '#f7ead3',
    sand: '#e8c47f', mini: '#e7b46a', miniRoad: '#3b2e2b', sky: 'rgba(255,200,120,0.08)',
  },
  frozen: {
    bg: '#dfeaf6', ground: ['#e9f1fa', '#d6e4f3', '#f5f9fd'], speck: 'rgba(120,150,200,0.16)',
    wall: '#8fa9cc', wallTop: '#fbfdff', wallLine: '#cfe0f3', shoulder: '#c9dcef', shoulderSpeck: 'rgba(130,160,200,0.22)',
    road: '#4b5565', roadSpeck: 'rgba(220,240,255,0.07)', line: 'rgba(235,245,255,0.6)', curbA: '#2f7fe0', curbB: '#f4f8ff',
    ice: '#a9dcf5', snow: '#eef4fb', mini: '#cfe0f2', miniRoad: '#3a4454', sky: 'rgba(200,230,255,0.06)',
  },
  ashlands: {
    bg: '#2a2024', ground: ['#2d2327', '#241c20', '#372a2c'], speck: 'rgba(255,120,60,0.07)',
    wall: '#140d10', wallTop: '#3d2a28', wallLine: '#ff6a2a', shoulder: '#4a3b37', shoulderSpeck: 'rgba(0,0,0,0.25)',
    road: '#3a3335', roadSpeck: 'rgba(255,180,120,0.05)', line: 'rgba(255,170,90,0.45)', curbA: '#ff6a1a', curbB: '#1d1416',
    lava: '#ff5212', mini: '#3a2a2a', miniRoad: '#151012', sky: 'rgba(255,80,20,0.05)',
  },
  city: {
    bg: '#12122a', ground: ['#16163a', '#111130', '#1b1b44'], speck: 'rgba(160,160,255,0.06)',
    wall: '#2b2b48', wallTop: '#4a4a6e', wallLine: '#ff3fa4', shoulder: '#2a2a46', shoulderSpeck: 'rgba(255,255,255,0.05)',
    road: '#202036', roadSpeck: 'rgba(200,200,255,0.05)', line: 'rgba(120,250,255,0.55)', curbA: '#ff3fa4', curbB: '#e8e8ff',
    mini: '#24244a', miniRoad: '#0b0b1c', sky: 'rgba(120,60,255,0.05)',
  },
};
const NEON = ['#ff3fa4', '#3ff5ff', '#a05cff', '#ffe14a', '#4bff9c'];
// NIGHT: every chunk is painted in its day colours, then multiplied by the world's dusk colour
// (night), then the lights go on top: neon lane lines, edges and curbs, wall rims, light poles
// with glow pools, wet puddles, boost pads (and lava, signs) at full brightness.
const NIGHT = {
  desert: { night: '#5c4c9c', line: '#ffd27a', edge: '#ff8a4a', curbA: '#ff3d6a', curbB: '#ffe8c0', wall: '#ff6a3a', pole: '#ffb35a', pole2: '#ff5fa2', puddles: 0.3 },
  frozen: { night: '#4a5ca6', line: '#bff4ff', edge: '#5fd0ff', curbA: '#3f8bff', curbB: '#e8f8ff', wall: '#7fe0ff', pole: '#9fdcff', pole2: '#b38cff', puddles: 0.55 },
  ashlands: { night: '#8a6a84', line: '#ffb05a', edge: '#ff6a1a', curbA: '#ff4a1a', curbB: '#ffd0a0', wall: '#ff5a1f', pole: '#ff8a3a', pole2: '#ffd23f', puddles: 0.25 },
  city: { night: '#9090cc', line: '#78faff', edge: '#ff3fa4', curbA: '#ff3fa4', curbB: '#e8e8ff', wall: '#3ff5ff', pole: '#ff3fa4', pole2: '#3ff5ff', puddles: 1 },
};
const mul = (a, b) => '#' + [1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) * parseInt(b.slice(i, i + 2), 16)) / 255).toString(16).padStart(2, '0')).join('');
for (const w in THEMES) THEMES[w].bg = mul(THEMES[w].bg, NIGHT[w].night); // the clear colour beyond the chunks
const a2 = (c, a) => c + Math.round(a * 255).toString(16).padStart(2, '0');

// small deterministic hash -> [0, 1)
const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

function noiseTile(size, base, specks, n, dot, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    const x = hash(i, seed, 1) * size, y = hash(i, seed, 2) * size, r = dot * (0.4 + hash(i, seed, 3));
    g.fillStyle = specks[i % specks.length]; g.globalAlpha = 0.35 + hash(i, seed, 4) * 0.65;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    // wrap so the tile repeats seamlessly
    if (x < r) { g.beginPath(); g.arc(x + size, y, r, 0, 7); g.fill(); }
    if (y < r) { g.beginPath(); g.arc(x, y + size, r, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  return cv;
}

export class TrackArt {
  constructor(T) {
    this.T = T;
    this.th = THEMES[T.world] || THEMES.desert;
    this.world = T.world;
    this.scale = 0;
    this.chunks = new Map();
    this.tick = 0;
    this.tiles();
    this.decor = [];
    this.glows = []; // animated light spots: {x, y, r, col, ph}
    this.buildDecor();
    this.buildZones();
    this.nt = NIGHT[this.world] || NIGHT.desert;
    this.buildLights();
    this.mini = null;
  }

  tiles() {
    const th = this.th, w = this.world;
    const ground = w === 'frozen' ? ['#c8d9ee', '#ffffff'] : w === 'city' ? ['#24244e', '#0c0c22'] : w === 'ashlands' ? ['#1a1215', '#4a3434', '#ff5a1f'] : ['#b9773c', '#eabb7c', '#9a5c2c'];
    this.tGround = noiseTile(256, th.ground[0], ground, 220, 3.2, 3);
    this.tShoulder = noiseTile(128, th.shoulder, [th.shoulderSpeck, '#0003', '#fff2'], 90, 2, 5);
    this.tRoad = noiseTile(128, th.road, [th.roadSpeck, 'rgba(0,0,0,0.18)', 'rgba(255,255,255,0.05)'], 160, 1.4, 7);
  }

  // scenery placed on a world grid, kept clear of the road and walls (deterministic)
  buildDecor() {
    const T = this.T, b = T.bounds, P = {}, w = this.world, cell = w === 'city' ? 210 : 150;
    const x0 = b.x0 - 600, y0 = b.y0 - 600, x1 = b.x1 + 600, y1 = b.y1 + 600;
    for (let gy = Math.floor(y0 / cell); gy <= y1 / cell; gy++) for (let gx = Math.floor(x0 / cell); gx <= x1 / cell; gx++) {
      const h = hash(gx, gy, 11);
      const x = (gx + 0.15 + hash(gx, gy, 12) * 0.7) * cell, y = (gy + 0.15 + hash(gx, gy, 13) * 0.7) * cell;
      let kind, r;
      if (w === 'desert') { if (h < 0.11) { kind = 'mesa'; r = 90 + hash(gx, gy, 14) * 90; } else if (h < 0.3) { kind = 'rock'; r = 14 + hash(gx, gy, 14) * 22; } else if (h < 0.42) { kind = 'cactus'; r = 16 + hash(gx, gy, 14) * 10; } else if (h < 0.6) { kind = 'ripple'; r = 50 + hash(gx, gy, 14) * 40; } else continue; }
      else if (w === 'frozen') { if (h < 0.3) { kind = 'pine'; r = 22 + hash(gx, gy, 14) * 18; } else if (h < 0.42) { kind = 'drift'; r = 40 + hash(gx, gy, 14) * 50; } else if (h < 0.5) { kind = 'pond'; r = 60 + hash(gx, gy, 14) * 70; } else if (h < 0.58) { kind = 'rock'; r = 12 + hash(gx, gy, 14) * 14; } else continue; }
      else if (w === 'ashlands') { if (h < 0.16) { kind = 'pool'; r = 40 + hash(gx, gy, 14) * 60; } else if (h < 0.4) { kind = 'crag'; r = 18 + hash(gx, gy, 14) * 30; } else if (h < 0.55) { kind = 'crack'; r = 50 + hash(gx, gy, 14) * 50; } else if (h < 0.62) { kind = 'bones'; r = 18; } else continue; }
      else { if (h < 0.55) { kind = 'block'; r = 60 + hash(gx, gy, 14) * 30; } else if (h < 0.8) { kind = 'sign'; r = 34; } else continue; }
      const rot = hash(gx, gy, 15) * Math.PI * 2, v = hash(gx, gy, 16);
      if (!this.clear(x, y, r + (kind === 'ripple' || kind === 'crack' || kind === 'drift' || kind === 'pond' ? 0 : 18), P)) continue;
      this.decor.push({ kind, x, y, r, rot, v });
      if (kind === 'pool') this.glows.push({ x, y, r: r * 1.6, col: 'lava', ph: v * 6 });
      if (kind === 'sign') this.glows.push({ x, y, r: 130, col: NEON[Math.floor(v * NEON.length)], ph: v * 6 });
    }
    // index by chunk
    this.decorAt = new Map();
    for (const d of this.decor) {
      const m = d.r + 40;
      for (let cy = Math.floor((d.y - m) / CHUNK); cy <= Math.floor((d.y + m) / CHUNK); cy++) for (let cx = Math.floor((d.x - m) / CHUNK); cx <= Math.floor((d.x + m) / CHUNK); cx++) {
        const k = cx + ',' + cy; let a = this.decorAt.get(k); if (!a) this.decorAt.set(k, (a = [])); a.push(d);
      }
    }
  }
  // light poles along the main road (alternating sides, outside the wall) and wet puddles on it
  buildLights() {
    const T = this.T, P = {}, nt = this.nt, w = this.world;
    this.lights = [];
    if (T.box) {
      const B = T.box;
      for (let x = B.x0; x <= B.x1; x += 520) for (const y of [B.y0 - WALL - 18, B.y1 + WALL + 18]) this.lights.push({ kind: 'pole', x, y, px: x, py: y < B.y0 ? B.y0 + 60 : B.y1 - 60, col: (x / 520) & 1 ? nt.pole2 : nt.pole });
    } else for (const c of T.corridors) {
      if (!c.main) continue;
      const step = w === 'city' ? 300 : 400;
      for (let s = 60, k = 0; s < c.len - 40; s += step, k++) {
        const side = k & 1 ? 1 : -1, a = pointAt(c, s, 0), d = side * (c.ww[a.i] + WALL + 16);
        const p = pointAt(c, s, d), q = pointAt(c, s, side * c.hw[a.i] * 0.35);
        T.probe(p.x, p.y, 0, P);
        if (P.pen < WALL) continue; // would stand on another road
        this.lights.push({ kind: 'pole', x: p.x, y: p.y, px: q.x, py: q.y, col: hash(k, 3, 41) < 0.35 ? nt.pole2 : nt.pole });
      }
      for (let s = 200, k = 0; s < c.len - 100; s += 260, k++) {
        if (hash(k, 7, 42) > nt.puddles) continue;
        const a = pointAt(c, s, 0), d = (hash(k, 8, 43) - 0.5) * c.hw[a.i] * 1.2, p = pointAt(c, s, d);
        if (this.onZone(c, s)) continue;
        this.lights.push({ kind: 'puddle', x: p.x, y: p.y, a: p.a + (hash(k, 9, 44) - 0.5) * 0.5, rx: 26 + hash(k, 10, 45) * 26, ry: 11 + hash(k, 11, 46) * 9, col: hash(k, 12, 47) < 0.5 ? nt.pole : nt.pole2 });
      }
    }
    this.lightAt = new Map();
    for (const L of this.lights) {
      const m = L.kind === 'pole' ? 240 : 60;
      for (let cy = Math.floor((L.y - m) / CHUNK); cy <= Math.floor((L.y + m) / CHUNK); cy++) for (let cx = Math.floor((L.x - m) / CHUNK); cx <= Math.floor((L.x + m) / CHUNK); cx++) {
        const k = cx + ',' + cy; let a = this.lightAt.get(k); if (!a) this.lightAt.set(k, (a = [])); a.push(L);
      }
    }
  }

  // is a circle at (x, y) clear of everything drivable (plus the wall band)?
  clear(x, y, r, P) {
    const T = this.T;
    if (T.box) { const B = T.box; return x + r < B.x0 - WALL || x - r > B.x1 + WALL || y + r < B.y0 - WALL || y - r > B.y1 + WALL; }
    T.probe(x, y, 0, P);
    return P.pen > r + WALL;
  }

  // zone outlines (world polygons) for painting and the animated overlays
  buildZones() {
    const T = this.T;
    this.zonePolys = [];
    this.pads = []; this.lavas = []; this.ices = [];
    for (const c of T.corridors) for (const z of c.zones) {
      const pts = [], step = 12;
      const dA = Math.max(z.d0, -1e4), dB = Math.min(z.d1, 1e4);
      const back = [];
      for (let s = z.s0; ; s += step) {
        const sv = Math.min(s, z.s1);
        const pa = pointAt(c, sv, 0), i = pa.i, ww = z.kind === 'surf' && (z.surf === 'lava' || z.surf === 'pit') ? c.ww[i] + 2 : c.hw[i]; // sand / ice / snow patches stay on the road
        const d0 = Math.max(dA, -ww), d1 = Math.min(dB, ww);
        const a = pointAt(c, sv, d0), bb = pointAt(c, sv, d1);
        pts.push(a.x, a.y); back.push(bb.x, bb.y);
        if (sv >= z.s1) break;
      }
      for (let k = back.length - 2; k >= 0; k -= 2) pts.push(back[k], back[k + 1]);
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let k = 0; k < pts.length; k += 2) { bx0 = Math.min(bx0, pts[k]); by0 = Math.min(by0, pts[k + 1]); bx1 = Math.max(bx1, pts[k]); by1 = Math.max(by1, pts[k + 1]); }
      const zp = { z, c, pts, bx0, by0, bx1, by1, mid: pointAt(c, (z.s0 + z.s1) / 2, z.d0 > -1e8 ? (Math.max(z.d0, -c.hw[0]) + Math.min(z.d1, c.hw[0])) / 2 : 0) };
      zp.w = z.d0 > -1e8 ? Math.min(z.d1, c.hw[zp.mid.i]) - Math.max(z.d0, -c.hw[zp.mid.i]) : c.hw[zp.mid.i] * 2;
      this.zonePolys.push(zp);
      if (z.kind === 'pad') this.pads.push(zp);
      if (z.kind === 'surf' && z.surf === 'lava') this.lavas.push(zp);
      if (z.kind === 'surf' && z.surf === 'ice') this.ices.push(zp);
    }
    for (const z of T.circles) {
      if (z.kind === 'pad') this.pads.push({ circle: z, mid: { x: z.x, y: z.y, a: -Math.PI / 2 }, w: z.r * 2, bx0: z.x - z.r, by0: z.y - z.r, bx1: z.x + z.r, by1: z.y + z.r });
      if (z.surf === 'lava') this.lavas.push({ circle: z, bx0: z.x - z.r, by0: z.y - z.r, bx1: z.x + z.r, by1: z.y + z.r, mid: { x: z.x, y: z.y } });
    }
    for (const c of T.corridors) if (c.surf === 'ice') for (let i = 0; i < c.n; i += 8) this.glows.push({ x: c.px[i], y: c.py[i], r: c.hw[i] * 1.6, col: 'ice', ph: i * 0.7 });
    for (const zp of this.ices) for (let s0 = zp.z.s0; s0 < zp.z.s1; s0 += 260) { const p = pointAt(zp.c, s0, 0); this.glows.push({ x: p.x, y: p.y, r: zp.w * 0.8, col: 'ice', ph: s0 * 0.01 }); }
    for (const z of T.circles) if (z.surf === 'ice') this.glows.push({ x: z.x, y: z.y, r: z.r, col: 'ice', ph: 0 });
    for (const L of this.lavas) this.glows.push({ x: L.mid.x, y: L.mid.y, r: Math.max(L.bx1 - L.bx0, L.by1 - L.by0) * 0.7, col: 'lava', ph: L.mid.x * 0.01 });
  }

  // ---------------------------------------------------------------- chunks
  setScale(s) { if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this.chunks.clear(); } }
  // the chunk canvas at (cx, cy), or null when not built yet (build=false)
  chunk(cx, cy, build = true) {
    const k = cx * 100003 + cy;
    let ch = this.chunks.get(k);
    if (ch) { ch.used = this.tick; return ch.cv; }
    if (!build) return null;
    ch = { cv: this.renderChunk(cx, cy), used: this.tick };
    this.chunks.set(k, ch);
    if (this.chunks.size > MAX_CHUNKS) {
      let oldK = null, old = Infinity;
      for (const [kk, v] of this.chunks) if (v.used < old) { old = v.used; oldK = kk; }
      const dead = this.chunks.get(oldK); this.chunks.delete(oldK); this.spare = dead.cv;
    }
    return ch.cv;
  }
  has(cx, cy) { return this.chunks.has(cx * 100003 + cy); }

  renderChunk(cx, cy) {
    const s = this.scale, px = Math.ceil((CHUNK + 2) * s);
    let cv = this.spare; this.spare = null;
    if (!cv || cv.width !== px) { cv = document.createElement('canvas'); cv.width = cv.height = px; }
    const g = cv.getContext('2d');
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const pat = (tile) => g.createPattern(tile, 'repeat');
    g.fillStyle = pat(this.tGround); g.fillRect(x0 - 1, y0 - 1, CHUNK + 4, CHUNK + 4);
    const decor = this.decorAt.get(cx + ',' + cy) || [];
    for (const d of decor) if (d.kind === 'ripple' || d.kind === 'crack' || d.kind === 'drift' || d.kind === 'pond' || d.kind === 'pool') this.drawDecor(g, d);
    const bx = { x0: x0 - 300, y0: y0 - 300, x1: x0 + CHUNK + 300, y1: y0 + CHUNK + 300 };
    if (this.T.box) this.paintArena(g, bx); else this.paintTrack(g, bx);
    for (const d of decor) if (!(d.kind === 'ripple' || d.kind === 'crack' || d.kind === 'drift' || d.kind === 'pond' || d.kind === 'pool')) this.drawDecor(g, d);
    // night falls, then the lights come on
    g.globalCompositeOperation = 'multiply'; g.fillStyle = this.nt.night; g.fillRect(x0 - 1, y0 - 1, CHUNK + 4, CHUNK + 4);
    g.globalCompositeOperation = 'source-over';
    this.nightLights(g, bx, cx, cy, decor);
    return cv;
  }

  // segments of corridor c whose box (with margin m) meets the chunk
  segsIn(c, bx) {
    const out = [];
    for (let i = 0; i < c.segs; i++) {
      const j = (i + 1) % c.n, m = c.ww[i] + WALL + 10;
      if (Math.max(c.px[i], c.px[j]) + m < bx.x0 + 300 - 10 || Math.min(c.px[i], c.px[j]) - m > bx.x1 - 300 + 10) continue;
      if (Math.max(c.py[i], c.py[j]) + m < bx.y0 + 300 - 10 || Math.min(c.py[i], c.py[j]) - m > bx.y1 - 300 + 10) continue;
      out.push(i);
    }
    return out;
  }

  paintTrack(g, bx) {
    const T = this.T, th = this.th;
    const lists = T.corridors.map((c) => this.segsIn(c, bx));
    if (!lists.some((l) => l.length)) return;
    const stroke = (c, i, w) => { const j = (i + 1) % c.n; g.lineWidth = w; g.beginPath(); g.moveTo(c.px[i], c.py[i]); g.lineTo(c.px[j], c.py[j]); g.stroke(); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    // walls: a dark base, a lit top, a bright rim line (theme)
    g.strokeStyle = th.wall; T.corridors.forEach((c, k) => { for (const i of lists[k]) stroke(c, i, 2 * c.ww[i] + WALL * 2); });
    g.strokeStyle = th.wallTop; T.corridors.forEach((c, k) => { for (const i of lists[k]) stroke(c, i, 2 * c.ww[i] + WALL * 1.1); });
    g.strokeStyle = th.wallLine; T.corridors.forEach((c, k) => { for (const i of lists[k]) stroke(c, i, 2 * c.ww[i] + 7); });
    // shoulders
    g.strokeStyle = g.createPattern(this.tShoulder, 'repeat');
    T.corridors.forEach((c, k) => { for (const i of lists[k]) stroke(c, i, 2 * c.ww[i]); });
    // curbs on the bends (striped, continuous along s), a plain edge line elsewhere
    T.corridors.forEach((c, k) => {
      for (const i of lists[k]) {
        const j = (i + 1) % c.n, jj = (i + c.n - 1) % c.n;
        const bend = Math.abs(c.tx[jj] * c.ty[i] - c.ty[jj] * c.tx[i]) + Math.abs(c.tx[i] * c.ty[j] - c.ty[i] * c.tx[j]);
        if (bend > 0.05 && c.surf === 'road') {
          g.strokeStyle = th.curbB; g.setLineDash([]); stroke(c, i, 2 * c.hw[i] + 22);
          g.strokeStyle = th.curbA; g.setLineDash([26, 26]); g.lineDashOffset = -c.s[i]; g.lineCap = 'butt'; stroke(c, i, 2 * c.hw[i] + 22); g.lineCap = 'round';
          g.setLineDash([]);
        } else { g.strokeStyle = th.curbB; g.globalAlpha = 0.75; stroke(c, i, 2 * c.hw[i] + 8); g.globalAlpha = 1; }
      }
    });
    // road surface
    const roadPat = g.createPattern(this.tRoad, 'repeat');
    T.corridors.forEach((c, k) => {
      g.strokeStyle = c.surf === 'road' ? roadPat : c.surf === 'ice' ? th.ice || '#a9dcf5' : c.surf === 'sand' ? th.sand || th.shoulder : th.shoulder;
      for (const i of lists[k]) stroke(c, i, 2 * c.hw[i]);
    });
    // texture on special corridors (sand ripples, ice streaks)
    T.corridors.forEach((c, k) => { if (c.surf !== 'road') for (const i of lists[k]) this.surfDetail(g, c.surf, c.px[i], c.py[i], c.hw[i], Math.atan2(c.ty[i], c.tx[i]), i); });
    // zones
    for (const zp of this.zonePolys) {
      if (zp.bx1 < bx.x0 + 290 || zp.bx0 > bx.x1 - 290 || zp.by1 < bx.y0 + 290 || zp.by0 > bx.y1 - 290) continue;
      this.paintZone(g, zp);
    }
    // centre line on the main road (dashed, continuous)
    const c0 = T.corridors[0];
    g.strokeStyle = th.line; g.setLineDash(this.world === 'city' ? [40, 30] : [34, 46]); g.lineCap = 'butt';
    for (const i of lists[0]) { if (this.onZone(c0, c0.s[i])) continue; g.lineDashOffset = -c0.s[i]; stroke(c0, i, this.world === 'city' ? 4 : 5); }
    if (this.world === 'city') { // lane lines and wet reflections
      g.strokeStyle = 'rgba(255,63,164,0.35)'; g.setLineDash([18, 22]);
      for (const i of lists[0]) for (const d of [-0.5, 0.5]) {
        const j = (i + 1) % c0.n, o = d * c0.hw[i];
        g.lineDashOffset = -c0.s[i]; g.lineWidth = 3; g.beginPath(); g.moveTo(c0.px[i] - c0.ty[i] * o, c0.py[i] + c0.tx[i] * o); g.lineTo(c0.px[j] - c0.ty[i] * o, c0.py[j] + c0.tx[i] * o); g.stroke();
      }
    }
    g.setLineDash([]); g.lineCap = 'round';
    // start / finish line and the grid boxes
    const G0 = T.gates[0];
    if (G0 && G0.cx > bx.x0 && G0.cx < bx.x1 && G0.cy > bx.y0 && G0.cy < bx.y1) this.startLine(g, G0);
    for (let n = 0; n < T.grid.length; n++) {
      const p = T.grid[n];
      if (p.x < bx.x0 || p.x > bx.x1 || p.y < bx.y0 || p.y > bx.y1) continue;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(34, -24); g.lineTo(-30, -24); g.moveTo(34, 24); g.lineTo(-30, 24); g.moveTo(34, -24); g.lineTo(34, 24); g.stroke();
      g.rotate(Math.PI / 2); g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '700 22px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n + 1), 0, 14);
      g.restore();
    }
    // shortcut entrances: painted arrows + a sign post on the road side
    for (const c of T.corridors) {
      if (c.main) continue;
      const p = pointAt(c, 70, 0);
      if (p.x < bx.x0 || p.x > bx.x1 || p.y < bx.y0 || p.y > bx.y1) continue;
      this.shortcutMark(g, c);
    }
    for (const o of T.obstacles) if (o.x > bx.x0 && o.x < bx.x1 && o.y > bx.y0 && o.y < bx.y1) this.pillar(g, o);
  }
  onZone(c, s) { for (const z of c.zones) if (z.kind !== 'surf' && s >= z.s0 - 40 && s <= z.s1 + 40) return true; return false; }

  paintArena(g, bx) {
    const T = this.T, th = this.th, B = T.box;
    g.fillStyle = th.wall; g.fillRect(B.x0 - WALL * 2, B.y0 - WALL * 2, B.x1 - B.x0 + WALL * 4, B.y1 - B.y0 + WALL * 4);
    g.fillStyle = th.wallTop; g.fillRect(B.x0 - WALL, B.y0 - WALL, B.x1 - B.x0 + WALL * 2, B.y1 - B.y0 + WALL * 2);
    g.fillStyle = th.wallLine; g.fillRect(B.x0 - 6, B.y0 - 6, B.x1 - B.x0 + 12, B.y1 - B.y0 + 12);
    g.fillStyle = g.createPattern(this.tRoad, 'repeat'); g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    // floor markings: a big centre ring and a grid of panel lines
    g.strokeStyle = this.th.line; g.lineWidth = 6; g.globalAlpha = 0.35;
    const cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
    g.beginPath(); g.arc(cx, cy, Math.min(B.x1 - B.x0, B.y1 - B.y0) * 0.33, 0, 7); g.stroke();
    g.lineWidth = 2; g.beginPath(); for (let x = B.x0 + 200; x < B.x1; x += 200) { g.moveTo(x, B.y0); g.lineTo(x, B.y1); } for (let y = B.y0 + 200; y < B.y1; y += 200) { g.moveTo(B.x0, y); g.lineTo(B.x1, y); } g.stroke();
    g.globalAlpha = 1;
    for (const z of T.circles) {
      if (z.x + z.r < bx.x0 || z.x - z.r > bx.x1 || z.y + z.r < bx.y0 || z.y - z.r > bx.y1) continue;
      if (z.kind === 'pad') { this.padPlate(g, z.x, z.y, -Math.PI / 2, z.r * 2, z.r * 2, true); continue; }
      g.beginPath(); g.arc(z.x, z.y, z.r, 0, 7);
      this.surfFill(g, z.surf); g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
      this.surfDetail(g, z.surf, z.x, z.y, z.r, 0, 1);
    }
    for (const o of T.obstacles) if (o.x + o.r > bx.x0 && o.x - o.r < bx.x1 && o.y + o.r > bx.y0 && o.y - o.r < bx.y1) this.pillar(g, o);
  }

  surfFill(g, surf) {
    const th = this.th;
    if (surf === 'lava') { g.fillStyle = '#c92a0a'; return; }
    if (surf === 'ice') { g.fillStyle = th.ice || '#a9dcf5'; return; }
    if (surf === 'sand') { g.fillStyle = th.sand || '#e8c47f'; return; }
    if (surf === 'snow') { g.fillStyle = th.snow || '#eef4fb'; return; }
    if (surf === 'pit') { g.fillStyle = '#0a0608'; return; }
    g.fillStyle = th.shoulder;
  }
  // texture strokes on a special surface around (x, y)
  surfDetail(g, surf, x, y, r, a, i) {
    if (surf === 'ice') {
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
      g.beginPath(); for (let k = 0; k < 3; k++) { const h = hash(i, k, 21), ox = (h - 0.5) * r, oy = (hash(i, k, 22) - 0.5) * r; g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a + 0.3) * 40, y + oy + Math.sin(a + 0.3) * 40); } g.stroke();
    } else if (surf === 'sand') {
      g.strokeStyle = 'rgba(150,90,40,0.28)'; g.lineWidth = 3;
      g.beginPath(); for (let k = -1; k <= 1; k++) { const o = k * r * 0.45; g.moveTo(x - Math.sin(a) * o - Math.cos(a) * 14, y + Math.cos(a) * o - Math.sin(a) * 14); g.quadraticCurveTo(x - Math.sin(a) * (o + 8), y + Math.cos(a) * (o + 8), x - Math.sin(a) * o + Math.cos(a) * 14, y + Math.cos(a) * o + Math.sin(a) * 14); } g.stroke();
    } else if (surf === 'lava') {
      // crusted plates floating on the lava
      g.fillStyle = 'rgba(90,20,6,0.55)';
      for (let k = 0; k < 2; k++) { const ox = (hash(i, k, 23) - 0.5) * r * 1.1, oy = (hash(i, k, 24) - 0.5) * r * 1.1; g.beginPath(); g.ellipse(x + ox, y + oy, 14 + hash(i, k, 25) * 12, 8 + hash(i, k, 26) * 6, a + k, 0, 7); g.fill(); }
    }
  }

  paintZone(g, zp) {
    const z = zp.z, pts = zp.pts;
    const path = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.closePath(); };
    if (z.kind === 'surf') {
      path(); this.surfFill(g, z.surf);
      if (z.surf === 'lava') {
        const gr = g.createRadialGradient(zp.mid.x, zp.mid.y, 10, zp.mid.x, zp.mid.y, Math.max(zp.bx1 - zp.bx0, zp.by1 - zp.by0) * 0.6);
        gr.addColorStop(0, '#ffcf4a'); gr.addColorStop(0.45, '#ff6a12'); gr.addColorStop(1, '#a91c06'); g.fillStyle = gr;
      }
      if (z.surf === 'pit') {
        g.fill(); g.lineWidth = 8; g.strokeStyle = '#ff5a1f'; g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
        const gr = g.createRadialGradient(zp.mid.x, zp.mid.y, 0, zp.mid.x, zp.mid.y, 260); gr.addColorStop(0, 'rgba(255,90,20,0.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
        path(); g.fillStyle = gr; g.fill();
        return;
      }
      g.fill();
      g.lineWidth = 4; g.strokeStyle = z.surf === 'lava' ? '#2a0c06' : 'rgba(0,0,0,0.12)'; g.stroke();
      const c = zp.c, step = 60;
      for (let s = z.s0 + 20; s < z.s1; s += step) { const p = pointAt(c, s, 0); this.surfDetail(g, z.surf, p.x, p.y, Math.min(zp.w, 200) * 0.5, p.a, Math.round(s)); }
      return;
    }
    if (z.kind === 'pad') { this.padPlate(g, zp.mid.x, zp.mid.y, zp.mid.a, Math.max(70, z.s1 - z.s0 + 40), zp.w); return; }
    if (z.kind === 'ramp') { this.ramp(g, zp); }
  }

  // boost pad base plate (the chevrons on it animate in the renderer)
  padPlate(g, x, y, a, len, w, round = false, lit = false) {
    g.save(); g.translate(x, y); g.rotate(a);
    if (round) { g.beginPath(); g.arc(0, 0, w / 2, 0, 7); } else { g.beginPath(); g.rect(-len / 2, -w / 2, len, w); }
    g.fillStyle = '#1b1438'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#12091e'; g.stroke();
    if (lit) { g.lineWidth = 12; g.strokeStyle = 'rgba(63,245,255,0.22)'; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#7ff8ff'; g.stroke(); }
    else { g.lineWidth = 3; g.strokeStyle = '#3ff5ff'; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1; }
    g.restore();
  }
  ramp(g, zp) {
    const z = zp.z, c = zp.c, pts = zp.pts, half = pts.length / 2;
    const path = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.closePath(); };
    const a = pointAt(c, z.s0, 0), b = pointAt(c, z.s1, 0);
    // the drop past the lip: a soft shadow on the road
    const sh = pointAt(c, z.s1 + 45, 0);
    const gs = g.createLinearGradient(b.x, b.y, sh.x, sh.y); gs.addColorStop(0, 'rgba(0,0,0,0.45)'); gs.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gs; g.beginPath();
    const lipA = [pts[half - 2], pts[half - 1]], lipB = [pts[half], pts[half + 1]];
    g.moveTo(lipA[0], lipA[1]); g.lineTo(lipB[0], lipB[1]); g.lineTo(lipB[0] + (sh.x - b.x), lipB[1] + (sh.y - b.y)); g.lineTo(lipA[0] + (sh.x - b.x), lipA[1] + (sh.y - b.y)); g.closePath(); g.fill();
    // the wedge: dark at the foot, bright at the lip
    const gr = g.createLinearGradient(a.x - Math.cos(a.a) * 20, a.y - Math.sin(a.a) * 20, b.x, b.y);
    gr.addColorStop(0, '#4a3d63'); gr.addColorStop(0.75, '#b8acd6'); gr.addColorStop(1, '#f2ecff');
    path(); g.fillStyle = gr; g.fill(); g.lineWidth = 5; g.strokeStyle = '#12091e'; g.stroke();
    // hazard stripes along the lip
    g.save(); path(); g.clip();
    g.lineWidth = 12; g.lineCap = 'butt'; g.strokeStyle = '#ffd23f'; g.setLineDash([18, 18]);
    g.beginPath(); g.moveTo(lipA[0], lipA[1]); g.lineTo(lipB[0], lipB[1]); g.stroke(); g.setLineDash([]);
    g.restore();
    // arrows up the ramp
    const m = pointAt(c, (z.s0 + z.s1) / 2 - 6, 0), w = c.hw[m.i];
    g.save(); g.translate(m.x, m.y); g.rotate(m.a); g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const yy of [-w * 0.45, 0, w * 0.45]) { g.beginPath(); g.moveTo(-14, yy - 12); g.lineTo(10, yy); g.lineTo(-14, yy + 12); g.lineTo(-7, yy); g.closePath(); g.fill(); }
    g.restore();
  }
  startLine(g, G0) {
    const w = Math.hypot(G0.x1 - G0.x0, G0.y1 - G0.y0) - 48 - 2 * 70;
    const sq = 16, rows = 3;
    g.save(); g.translate(G0.cx, G0.cy); g.rotate(G0.a);
    const hw = this.T.corridors[0].hw[0];
    for (let r = 0; r < rows; r++) for (let k = -Math.ceil(hw / sq); k < Math.ceil(hw / sq); k++) {
      g.fillStyle = (r + k) & 1 ? '#12091e' : '#f6f2ff';
      g.fillRect(-rows * sq / 2 + r * sq, k * sq, sq, Math.min(sq, hw - k * sq));
    }
    // gantry posts on both sides
    for (const s of [-1, 1]) { g.beginPath(); g.arc(0, s * (hw + 40), 12, 0, 7); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#12091e'; g.stroke(); }
    g.restore();
    void w;
  }
  shortcutMark(g, c) {
    const th = this.th;
    for (const s of [30, 90]) {
      const p = pointAt(c, s, 0);
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.fillStyle = c.needsBoost ? '#ff8c1a' : '#ffd23f'; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(-14, -16); g.lineTo(8, 0); g.lineTo(-14, 16); g.lineTo(-6, 0); g.closePath(); g.fill();
      g.restore();
    }
    const p = pointAt(c, 40, -(c.ww[0] + 20));
    g.save(); g.translate(p.x, p.y);
    g.fillStyle = '#12091e'; g.fillRect(-3, -2, 6, 30);
    g.rotate(Math.PI / 4); g.fillStyle = c.needsBoost ? '#ff8c1a' : '#ffd23f'; g.fillRect(-15, -15, 30, 30); g.lineWidth = 4; g.strokeStyle = '#12091e'; g.strokeRect(-15, -15, 30, 30);
    g.rotate(-Math.PI / 4); g.fillStyle = '#12091e'; g.font = '700 20px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c.needsBoost ? '»' : '↗', 0, 1);
    g.restore();
    void th;
  }
  pillar(g, o) {
    const w = this.world;
    g.beginPath(); g.arc(o.x + 8, o.y + 10, o.r, 0, 7); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7);
    g.fillStyle = w === 'frozen' ? '#bfe6fb' : w === 'ashlands' ? '#2a1a1a' : w === 'city' ? '#33335a' : '#a8552e'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#12091e'; g.stroke();
    g.beginPath(); g.arc(o.x - o.r * 0.2, o.y - o.r * 0.2, o.r * 0.62, 0, 7);
    g.fillStyle = w === 'frozen' ? '#effaff' : w === 'ashlands' ? '#4a2c24' : w === 'city' ? '#4a4a7a' : '#d07a45'; g.fill();
    if (w === 'city' || w === 'ashlands') { g.beginPath(); g.arc(o.x, o.y, o.r - 6, 0, 7); g.lineWidth = 3; g.strokeStyle = w === 'city' ? '#3ff5ff' : '#ff6a1a'; g.stroke(); }
  }
  wetReflections(g, bx) {
    // blurred neon colour pooled on the asphalt next to the signs
    for (const d of this.decor) {
      if (d.kind !== 'sign' && !(d.kind === 'block' && d.v > 0.6)) continue;
      if (d.x < bx.x0 || d.x > bx.x1 || d.y < bx.y0 || d.y > bx.y1) continue;
      const col = NEON[Math.floor(d.v * 97) % NEON.length];
      const gr = g.createRadialGradient(d.x, d.y, 10, d.x, d.y, d.r * 2.6);
      gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
      g.fillStyle = gr; g.beginPath(); g.ellipse(d.x, d.y, d.r * 2.6, d.r * 1.6, d.rot, 0, 7); g.fill();
    }
  }

  drawDecor(g, d) {
    const { x, y, r, rot, v } = d;
    g.lineJoin = 'round';
    switch (d.kind) {
      case 'mesa': { // layered sandstone butte with a shadow
        const n = 9, pts = [];
        for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2, rr2 = r * (0.78 + hash(k, Math.round(x), 31) * 0.3); pts.push(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        const shape = (sx, sy, k) => { g.beginPath(); g.moveTo(x + sx + pts[0] * k, y + sy + pts[1] * k); for (let i = 2; i < pts.length; i += 2) g.lineTo(x + sx + pts[i] * k, y + sy + pts[i + 1] * k); g.closePath(); };
        shape(r * 0.22, r * 0.28, 1); g.fillStyle = 'rgba(90,40,10,0.35)'; g.fill();
        shape(0, 0, 1); g.fillStyle = '#9c4a26'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#12091e'; g.stroke();
        shape(-r * 0.05, -r * 0.06, 0.8); g.fillStyle = '#c4693a'; g.fill();
        shape(-r * 0.09, -r * 0.1, 0.6); g.fillStyle = '#e09456'; g.fill();
        shape(-r * 0.11, -r * 0.13, 0.42); g.fillStyle = '#f0b878'; g.fill();
        break;
      }
      case 'rock': {
        g.beginPath(); g.ellipse(x + r * 0.3, y + r * 0.35, r, r * 0.8, rot, 0, 7); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
        g.beginPath(); g.ellipse(x, y, r, r * 0.8, rot, 0, 7);
        g.fillStyle = this.world === 'frozen' ? '#8d9db3' : '#a0603a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#12091e'; g.stroke();
        g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.35, rot, 0, 7); g.fillStyle = this.world === 'frozen' ? '#f4f8ff' : '#cf8752'; g.fill();
        break;
      }
      case 'cactus': { // round barrel cactus from above, with spines
        g.beginPath(); g.arc(x + 5, y + 6, r, 0, 7); g.fillStyle = 'rgba(80,40,10,0.3)'; g.fill();
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#4f8a3a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#12091e'; g.stroke();
        g.strokeStyle = '#2f5a24'; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + k * 1.047; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); } g.stroke();
        g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.3, 0, 7); g.fillStyle = v > 0.5 ? '#ff6fae' : '#ffd23f'; g.fill(); // flower
        break;
      }
      case 'ripple': {
        g.strokeStyle = 'rgba(140,80,30,0.22)'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath(); for (let k = -2; k <= 2; k++) { const o = k * 16; g.moveTo(x - Math.cos(rot) * r - Math.sin(rot) * o, y - Math.sin(rot) * r + Math.cos(rot) * o); g.quadraticCurveTo(x - Math.sin(rot) * (o + 12), y + Math.cos(rot) * (o + 12), x + Math.cos(rot) * r - Math.sin(rot) * o, y + Math.sin(rot) * r + Math.cos(rot) * o); } g.stroke();
        break;
      }
      case 'pine': { // a pine from above: layered star of needles, snow on top
        g.beginPath(); g.arc(x + r * 0.35, y + r * 0.4, r, 0, 7); g.fillStyle = 'rgba(60,90,140,0.25)'; g.fill();
        for (const [k, col] of [[1, '#1f4a3a'], [0.72, '#2c6a4c'], [0.45, '#3f8a5e']]) {
          g.beginPath(); for (let i = 0; i < 16; i++) { const a = rot + (i / 16) * Math.PI * 2, rr2 = r * k * (i & 1 ? 0.62 : 1); g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath();
          g.fillStyle = col; g.fill(); if (k === 1) { g.lineWidth = 3; g.strokeStyle = '#12091e'; g.stroke(); }
        }
        g.beginPath(); g.arc(x - r * 0.15, y - r * 0.15, r * 0.22, 0, 7); g.fillStyle = '#f4f8ff'; g.fill();
        break;
      }
      case 'drift': {
        g.beginPath(); g.ellipse(x + 8, y + 8, r, r * 0.55, rot, 0, 7); g.fillStyle = 'rgba(120,150,200,0.22)'; g.fill();
        g.beginPath(); g.ellipse(x, y, r, r * 0.55, rot, 0, 7); g.fillStyle = '#f8fbff'; g.fill();
        break;
      }
      case 'pond': { // frozen pond with cracks
        g.beginPath(); g.ellipse(x, y, r, r * 0.7, rot, 0, 7); g.fillStyle = '#a9dcf5'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#8fbfe0'; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath();
        for (let k = 0; k < 4; k++) { const a = rot + k * 1.7; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.35); g.lineTo(x + Math.cos(a + 0.4) * r * 0.85, y + Math.sin(a + 0.4) * r * 0.6); } g.stroke();
        g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.25, r * 0.3, r * 0.1, -0.5, 0, 7); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
        break;
      }
      case 'pool': { // lava pool (glow animates in the renderer)
        g.beginPath(); g.ellipse(x, y, r * 1.15, r * 0.85, rot, 0, 7); g.fillStyle = '#140c0e'; g.fill();
        const gr = g.createRadialGradient(x, y, 4, x, y, r); gr.addColorStop(0, '#ffe07a'); gr.addColorStop(0.4, '#ff7a1a'); gr.addColorStop(1, '#9a1a06');
        g.beginPath(); g.ellipse(x, y, r, r * 0.72, rot, 0, 7); g.fillStyle = gr; g.fill();
        g.strokeStyle = '#2a0c06'; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 4; k++) { const a = rot + k * 1.6; g.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.2); g.lineTo(x + Math.cos(a + 0.5) * r * 0.7, y + Math.sin(a + 0.5) * r * 0.5); } g.stroke();
        break;
      }
      case 'crag': {
        const n = 6;
        g.beginPath(); for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2, rr2 = r * (0.7 + hash(k, Math.round(y), 33) * 0.4); g.lineTo(x + 6 + Math.cos(a) * rr2, y + 8 + Math.sin(a) * rr2); } g.closePath(); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill();
        g.beginPath(); for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2, rr2 = r * (0.7 + hash(k, Math.round(y), 33) * 0.4); g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath();
        g.fillStyle = '#3a2a2a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#0b0607'; g.stroke();
        g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.35, 0, 7); g.fillStyle = '#54403a'; g.fill();
        break;
      }
      case 'crack': {
        g.strokeStyle = '#ff5a1f'; g.lineWidth = 3; g.globalAlpha = 0.75; g.beginPath();
        let px = x, py = y; g.moveTo(px, py);
        for (let k = 0; k < 5; k++) { const a = rot + (hash(k, Math.round(x), 34) - 0.5) * 1.6; px += Math.cos(a) * r * 0.35; py += Math.sin(a) * r * 0.35; g.lineTo(px, py); }
        g.stroke(); g.globalAlpha = 1;
        break;
      }
      case 'bones': { // a burnt-out wreck of a car, half buried in ash
        g.save(); g.translate(x, y); g.rotate(rot);
        g.fillStyle = '#1a1214'; g.fillRect(-22, -12, 44, 24); g.strokeStyle = '#4a3434'; g.lineWidth = 3; g.strokeRect(-22, -12, 44, 24);
        g.fillStyle = '#2d2124'; g.fillRect(-8, -8, 16, 16);
        g.restore();
        break;
      }
      case 'block': { // city block rooftop with a neon edge
        const w = r * 1.5, h = r * (1 + v * 0.6), col = NEON[Math.floor(v * 97) % NEON.length];
        g.save(); g.translate(x, y); g.rotate(Math.round(rot / 1.5708) * 1.5708);
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-w / 2 + 12, -h / 2 + 14, w, h);
        g.fillStyle = '#1f1f3c'; g.fillRect(-w / 2, -h / 2, w, h);
        g.lineWidth = 4; g.strokeStyle = '#0a0a18'; g.strokeRect(-w / 2, -h / 2, w, h);
        g.lineWidth = 2.5; g.strokeStyle = col; g.globalAlpha = 0.85; g.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12); g.globalAlpha = 1;
        g.fillStyle = '#2a2a52'; g.fillRect(-w * 0.2, -h * 0.2, w * 0.3, h * 0.25); // roof units
        g.fillStyle = '#2f2f5a'; g.fillRect(w * 0.12, h * 0.05, w * 0.2, h * 0.2);
        g.fillStyle = 'rgba(255,240,180,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + 12 + k * 14, h / 2 - 16, 6, 6);
        g.restore();
        break;
      }
      case 'sign': { // a neon sign on a post: an original glyph
        const col = NEON[Math.floor(v * NEON.length)];
        g.save(); g.translate(x, y);
        g.fillStyle = '#0a0a18'; g.fillRect(-34, -16, 68, 32);
        g.lineWidth = 4; g.strokeStyle = col; g.strokeRect(-30, -12, 60, 24);
        g.lineWidth = 3; g.beginPath();
        if (v < 0.33) { g.moveTo(-20, 6); g.lineTo(-8, -6); g.lineTo(4, 6); g.lineTo(16, -6); } else if (v < 0.66) { g.arc(-8, 0, 7, 0, 7); g.moveTo(8, -7); g.lineTo(18, 7); } else { g.moveTo(-18, 0); g.lineTo(18, 0); g.moveTo(10, -7); g.lineTo(18, 0); g.lineTo(10, 7); }
        g.stroke();
        g.restore();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- night lights (baked per chunk)
  nightLights(g, bx, cx, cy, decor) {
    const T = this.T, nt = this.nt, w = this.world, low = SETTINGS.lowGfx;
    const lights = this.lightAt.get(cx + ',' + cy) || [];
    // glow pools under the light poles (additive light on the road)
    g.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (L.kind !== 'pole') continue;
      const r = 200, gr = g.createRadialGradient(L.px, L.py, 0, L.px, L.py, r);
      gr.addColorStop(0, a2(L.col, 0.3)); gr.addColorStop(0.5, a2(L.col, 0.12)); gr.addColorStop(1, a2(L.col, 0));
      g.fillStyle = gr; g.fillRect(L.px - r, L.py - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    if (T.box) this.arenaLights(g); else this.trackLights(g, bx);
    // lava, signs and neon roofs keep their own light
    if (w === 'ashlands') { for (const zp of this.zonePolys) if (zp.z.kind === 'surf' && (zp.z.surf === 'lava' || zp.z.surf === 'pit') && !(zp.bx1 < bx.x0 + 290 || zp.bx0 > bx.x1 - 290 || zp.by1 < bx.y0 + 290 || zp.by0 > bx.y1 - 290)) this.paintZone(g, zp); }
    for (const d of decor) if (d.kind === 'pool' || d.kind === 'crack' || d.kind === 'sign') this.drawDecor(g, d); else if (d.kind === 'block') this.blockNeon(g, d);
    if (w === 'city' && !T.box && !low) this.wetReflections(g, bx);
    for (const z of T.circles) if (z.surf === 'lava' && z.x + z.r > bx.x0 && z.x - z.r < bx.x1 && z.y + z.r > bx.y0 && z.y - z.r < bx.y1) { g.beginPath(); g.arc(z.x, z.y, z.r, 0, 7); this.surfFill(g, 'lava'); g.fill(); this.surfDetail(g, 'lava', z.x, z.y, z.r, 0, 1); }
    // puddles: a dark wet mirror with the nearby lights and the dusk sky in it
    for (const L of lights) {
      if (L.kind !== 'puddle') continue;
      g.save(); g.translate(L.x, L.y); g.rotate(L.a);
      g.beginPath(); g.ellipse(0, 0, L.rx, L.ry, 0, 0, 7); g.fillStyle = 'rgba(6,6,18,0.55)'; g.fill();
      if (!low) {
        g.clip();
        const gr = g.createLinearGradient(-L.rx, -L.ry, L.rx, L.ry);
        gr.addColorStop(0, a2(L.col, 0.55)); gr.addColorStop(0.45, 'rgba(120,90,200,0.25)'); gr.addColorStop(1, 'rgba(40,30,90,0.1)');
        g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(-L.rx, -L.ry, L.rx * 2, L.ry * 2);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-L.rx * 0.5, -L.ry * 0.25); g.lineTo(L.rx * 0.3, -L.ry * 0.45); g.stroke();
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
      g.beginPath(); g.ellipse(L.x, L.y, L.rx, L.ry, L.a, 0, 7); g.lineWidth = 1.5; g.strokeStyle = 'rgba(200,210,255,0.22)'; g.stroke();
    }
    // the poles themselves: a dark mast with a bright lamp head
    for (const L of lights) {
      if (L.kind !== 'pole') continue;
      g.beginPath(); g.arc(L.x, L.y, 7, 0, 7); g.fillStyle = '#0c0a14'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#2a2638'; g.stroke();
      const hx = L.x + (L.px - L.x) * 0.18, hy = L.y + (L.py - L.y) * 0.18;
      g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(hx, hy); g.lineWidth = 4; g.strokeStyle = '#1a1726'; g.stroke();
      const gr = g.createRadialGradient(hx, hy, 0, hx, hy, 26); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.2, a2(L.col, 0.9)); gr.addColorStop(1, a2(L.col, 0));
      g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(hx - 26, hy - 26, 52, 52); g.globalCompositeOperation = 'source-over';
    }
  }
  // a neon line (glow underlay + bright core) along offset d of corridor c's segment i
  neonSeg(g, c, i, d) {
    const j = (i + 1) % c.n, nx = -c.ty[i], ny = c.tx[i], nx2 = -c.ty[j], ny2 = c.tx[j];
    const dd = typeof d === 'number' ? d : d(i), dj = typeof d === 'number' ? d : d(j);
    g.moveTo(c.px[i] + nx * dd, c.py[i] + ny * dd); g.lineTo(c.px[j] + nx2 * dj, c.py[j] + ny2 * dj);
  }
  glowStroke(g, col, w, path, dash = null, off = 0) {
    g.setLineDash(dash || []); g.lineDashOffset = off;
    g.strokeStyle = a2(col, 0.22); g.lineWidth = w * 4; path(); g.stroke();
    g.strokeStyle = col; g.lineWidth = w; path(); g.stroke();
    g.setLineDash([]);
  }
  trackLights(g, bx) {
    const T = this.T, nt = this.nt;
    const lists = T.corridors.map((c) => this.segsIn(c, bx));
    if (!lists.some((l) => l.length)) return;
    g.lineCap = 'round'; g.lineJoin = 'round';
    T.corridors.forEach((c, k) => {
      const L = lists[k];
      if (!L.length) return;
      // wall rims (both sides) and the road edges
      for (const side of [-1, 1]) {
        this.glowStroke(g, nt.wall, 2.5, () => { g.beginPath(); for (const i of L) this.neonSeg(g, c, i, (q) => side * (c.ww[q] + 4)); });
        const edgeCol = c.surf === 'road' ? nt.edge : c.surf === 'ice' ? '#bff4ff' : nt.line;
        this.glowStroke(g, edgeCol, 3, () => { g.beginPath(); for (const i of L) { if (this.bend(c, i) > 0.05 && c.surf === 'road') continue; this.neonSeg(g, c, i, (q) => side * (c.hw[q] + 2)); } });
        // curbs on the bends: neon dashes
        g.lineCap = 'butt';
        for (const i of L) {
          if (!(this.bend(c, i) > 0.05 && c.surf === 'road')) continue;
          const path = () => { g.beginPath(); this.neonSeg(g, c, i, (q) => side * (c.hw[q] + 6)); };
          this.glowStroke(g, nt.curbB, 6, path);
          this.glowStroke(g, nt.curbA, 6, path, [26, 26], -c.s[i]);
        }
        g.lineCap = 'round';
      }
    });
    // centre line, neon dashes
    const c0 = T.corridors[0];
    g.lineCap = 'butt';
    for (const i of lists[0]) {
      if (this.onZone(c0, c0.s[i])) continue;
      this.glowStroke(g, nt.line, this.world === 'city' ? 3.5 : 4, () => { g.beginPath(); this.neonSeg(g, c0, i, 0); }, this.world === 'city' ? [40, 30] : [34, 46], -c0.s[i]);
    }
    g.lineCap = 'round';
    // boost pads glow, shortcut signs stay readable
    for (const zp of this.zonePolys) if (zp.z.kind === 'pad' && !(zp.bx1 < bx.x0 + 290 || zp.bx0 > bx.x1 - 290 || zp.by1 < bx.y0 + 290 || zp.by0 > bx.y1 - 290)) this.padPlate(g, zp.mid.x, zp.mid.y, zp.mid.a, Math.max(70, zp.z.s1 - zp.z.s0 + 40), zp.w, false, true);
    for (const c of T.corridors) { if (c.main) continue; const p = pointAt(c, 70, 0); if (p.x >= bx.x0 && p.x <= bx.x1 && p.y >= bx.y0 && p.y <= bx.y1) this.shortcutMark(g, c); }
  }
  bend(c, i) { const j = (i + 1) % c.n, jj = (i + c.n - 1) % c.n; return Math.abs(c.tx[jj] * c.ty[i] - c.ty[jj] * c.tx[i]) + Math.abs(c.tx[i] * c.ty[j] - c.ty[i] * c.tx[j]); }
  arenaLights(g) {
    const B = this.T.box, nt = this.nt;
    this.glowStroke(g, nt.wall, 3, () => { g.beginPath(); g.rect(B.x0 - 3, B.y0 - 3, B.x1 - B.x0 + 6, B.y1 - B.y0 + 6); });
    for (const z of this.T.circles) if (z.kind === 'pad') this.padPlate(g, z.x, z.y, -Math.PI / 2, z.r * 2, z.r * 2, true, true);
  }
  blockNeon(g, d) {
    const { x, y, r, rot, v } = d, w = r * 1.5, h = r * (1 + v * 0.6), col = NEON[Math.floor(v * 97) % NEON.length];
    g.save(); g.translate(x, y); g.rotate(Math.round(rot / 1.5708) * 1.5708);
    this.glowStroke(g, col, 2.5, () => { g.beginPath(); g.rect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12); });
    g.fillStyle = 'rgba(255,240,180,0.7)'; for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + 12 + k * 14, h / 2 - 16, 6, 6);
    g.restore();
  }

  // ---------------------------------------------------------------- minimap
  // the track outline pre-rendered into a small canvas (size px), with the transform it used
  minimap(size, dpr) {
    if (this.mini && this.mini.size === size && this.mini.dpr === dpr) return this.mini;
    const T = this.T, b = T.bounds, w = b.x1 - b.x0, h = b.y1 - b.y0, k = (size - 12) / Math.max(w, h);
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(size * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = (size - w * k) / 2 - b.x0 * k, oy = (size - h * k) / 2 - b.y0 * k;
    g.fillStyle = 'rgba(18,9,30,0.55)'; g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, 7); g.fill();
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (T.box) {
      g.fillStyle = '#12091e'; g.fillRect(T.box.x0 - 40, T.box.y0 - 40, T.box.x1 + 80, T.box.y1 + 80);
      g.fillStyle = this.th.miniRoad === '#0b0b1c' ? '#3a3a66' : '#6a5a6a'; g.fillRect(T.box.x0, T.box.y0, T.box.x1, T.box.y1);
      g.fillStyle = '#12091e'; for (const o of T.obstacles) { g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.fill(); }
    } else {
      for (const [col, extra] of [['#12091e', 80 / k * 0.06 + 70], ['#f4ecff', 0]]) {
        g.strokeStyle = col;
        for (const c of T.corridors) {
          g.lineWidth = (c.main ? 150 : 90) + extra; g.setLineDash(c.main ? [] : [60, 60]);
          g.beginPath(); for (let i = 0; i < c.n; i++) g.lineTo(c.px[i], c.py[i]); if (c.closed) g.closePath(); g.stroke();
        }
      }
      g.setLineDash([]);
      const G0 = T.gates[0];
      g.strokeStyle = '#ffd23f'; g.lineWidth = 60; g.beginPath(); g.moveTo(G0.x0, G0.y0); g.lineTo(G0.x1, G0.y1); g.stroke();
    }
    this.mini = { cv, size, dpr, k, ox, oy };
    return this.mini;
  }
}
export { CAR_R };
