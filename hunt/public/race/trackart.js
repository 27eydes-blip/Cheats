// Hunt Racers track art: four original themes painted in code. The static world (ground, scenery,
// walls, curbs, road, zones, start line, ramps, pad plates) is rendered once per chunk into an
// offscreen canvas (lazily, least-recently-used cache); the renderer only blits chunks plus a
// handful of animated overlays (pad chevrons, lava glow, hazards, item boxes) each frame.
import { pointAt } from './trackgeom.js';
import { CAR_R } from './physics.js';
import { SETTINGS } from '../settings.js';
import { NEON_GLOW } from './looks.js';
import { THEMES, artOf, placeScenery, drawFlat, drawTallBase, drawTall } from './scenery.js';
import { artTheme } from './trackthemes.js';

export const CHUNK = 384; // world px per chunk side
const MAX_CHUNKS = 40;
const POLE_H = 110; // a light pole's height (for its lean with the camera)
const WALL = 26; // wall band beyond the shoulder (px) (as scenery.js)

// worlds (palettes, lights, scenery): scenery.js. THEMES[world] is the palette.
export { THEMES };
// (only used for light: pole pools, lamp heads, puddles, neon glow underlays; scaled by NEON_GLOW)
const a2 = (c, a) => c + Math.round(Math.min(1, a * NEON_GLOW) * 255).toString(16).padStart(2, '0');

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

// a track's art: its world's (scenery.js), with a new track's own night palette from
// trackthemes.js (`art` in the track def) laid over it; made once per palette
const themed = new Map();
export function trackArtOf(T) {
  const base = artOf(T && T.world), ex = artTheme(T);
  if (!ex) return base;
  let a = themed.get(ex);
  if (!a) {
    const nt = ex.nt;
    a = { ...base, pal: { ...base.pal, ...ex.th, tex: [...(ex.groundSpecks || []), ...base.pal.tex.slice(0, 2)] },
      night: { ...base.night, ...nt, night: '#f2eeff' }, // (the palette is already night: only a light dusk over it)
      neon: [nt.edge, nt.line, nt.curbA, nt.pole2], crowd: [nt.edge, nt.line, '#ffffff', nt.curbA],
      dusk: [base.dusk[0], nt.edge + '38', [nt.edge, nt.line, nt.curbA]], horizon: base.horizon };
    a.pal.bg = ex.th.bg;
    themed.set(ex, a);
  }
  return a;
}
export class TrackArt {
  constructor(T) {
    this.T = T;
    this.art = trackArtOf(T); // the world's look, or a new track's own palette on its world's scenery
    this.th = this.art.pal;
    this.world = T.world;
    this.scale = 0;
    this.chunks = new Map();
    this.tick = 0;
    this.tiles();
    this.glows = []; // animated light spots: {x, y, r, col, ph}
    this.buildDecor();
    this.buildZones();
    this.nt = this.art.night;
    this.buildLights();
    this.mini = null;
  }

  tiles() {
    const th = this.th;
    this.tGround = noiseTile(512, th.ground[0], th.tex, 1040, 2.6, 3);
    // big soft light and dark patches, baked into the (seamless) ground tile: free per chunk
    if (th.blot) {
      const g = this.tGround.getContext('2d'), S = 512;
      for (let i = 0; i < 7; i++) {
        const x = hash(i, 1, 95) * S, y = hash(i, 2, 95) * S, r = 90 + hash(i, 3, 95) * 110, gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, th.blot[i % th.blot.length]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.setTransform(1, 0, 0, 1, x + ox, y + oy); g.fillRect(-r, -r, r * 2, r * 2); }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.tRunoff = noiseTile(128, th.wall, [th.shoulderSpeck, 'rgba(255,255,255,0.05)', '#0005'], 160, 1.4, 9);
    this.tShoulder = noiseTile(128, th.shoulder, [th.shoulderSpeck, '#0003', '#fff1'], 110, 1.6, 5);
    this.tRoad = noiseTile(128, th.road, [th.roadSpeck, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.04)'], 190, 1.1, 7);
  }

  // background scenery (scenery.js: placed clear of the road and walls, deterministic), indexed by chunk
  buildDecor() {
    const S = placeScenery(this.T, this.art);
    this.flat = S.flat; this.tall = S.tall;
    for (const d of this.flat) if (d.glow) this.glows.push({ x: d.x, y: d.y, r: d.r * 1.7, col: 'lava', ph: d.v * 6 });
    const index = (list, m) => {
      const at = new Map();
      for (const d of list) for (let cy = Math.floor((d.by0 - m) / CHUNK); cy <= Math.floor((d.by1 + m) / CHUNK); cy++) for (let cx = Math.floor((d.bx0 - m) / CHUNK); cx <= Math.floor((d.bx1 + m) / CHUNK); cx++) {
        const k = cx + ',' + cy; let a = at.get(k); if (!a) at.set(k, (a = [])); a.push(d);
      }
      return at;
    };
    this.decorAt = index(this.flat, 0); this.tallAt = index(this.tall, 12);
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
      const m = L.kind === 'pole' ? 210 + Math.hypot(L.px - L.x, L.py - L.y) : 60; // a pole's glow pool sits toward the road
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
      if ((z.kind === 'surf' || z.kind === 'paint') && z.surf === 'ice') this.ices.push(zp);
    }
    for (const z of T.circles) {
      if (z.kind === 'pad') this.pads.push({ circle: z, mid: { x: z.x, y: z.y, a: -Math.PI / 2 }, w: z.r * 2, bx0: z.x - z.r, by0: z.y - z.r, bx1: z.x + z.r, by1: z.y + z.r });
      if (z.surf === 'lava') this.lavas.push({ circle: z, bx0: z.x - z.r, by0: z.y - z.r, bx1: z.x + z.r, by1: z.y + z.r, mid: { x: z.x, y: z.y } });
    }
    for (const c of T.corridors) if (c.look === 'ice') for (let i = 0; i < c.n; i += 8) this.glows.push({ x: c.px[i], y: c.py[i], r: c.hw[i] * 1.6, col: 'ice', ph: i * 0.7 });
    for (const zp of this.ices) for (let s0 = zp.z.s0; s0 < zp.z.s1; s0 += 260) { const p = pointAt(zp.c, s0, 0); this.glows.push({ x: p.x, y: p.y, r: zp.w * 0.8, col: 'ice', ph: s0 * 0.01 }); }
    for (const z of T.circles) if (z.surf === 'ice') this.glows.push({ x: z.x, y: z.y, r: z.r, col: 'ice', ph: 0 });
    for (const L of this.lavas) this.glows.push({ x: L.mid.x, y: L.mid.y, r: Math.max(L.bx1 - L.bx0, L.by1 - L.by0) * 0.7, col: 'lava', ph: L.mid.x * 0.01 });
  }

  // ---------------------------------------------------------------- chunks
  // a new pixel scale (the adaptive resolution stepped): chunks already built stay on screen at their
  // old resolution and are redrawn one per frame (redrawing every visible chunk at once was a long
  // frame in the middle of the race)
  setScale(s) { if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this.gen = (this.gen || 0) + 1; } }
  // the chunk canvas at (cx, cy), or null when not built yet (build=false)
  chunk(cx, cy, build = true) {
    const k = cx * 100003 + cy;
    let ch = this.chunks.get(k);
    if (ch) {
      ch.used = this.tick;
      if (ch.gen !== (this.gen || 0) && build && this.redo !== this.tick) { this.redo = this.tick; ch.cv = this.renderChunk(cx, cy); ch.gen = this.gen || 0; }
      return ch.cv;
    }
    if (!build) return null;
    ch = { cv: this.renderChunk(cx, cy), used: this.tick, gen: this.gen || 0 };
    this.chunks.set(k, ch);
    if (this.chunks.size > this.maxChunks()) {
      let oldK = null, old = Infinity;
      for (const [kk, v] of this.chunks) if (v.used < old) { old = v.used; oldK = kk; }
      const dead = this.chunks.get(oldK); this.chunks.delete(oldK); this.spare = dead.cv;
    }
    return ch.cv;
  }
  has(cx, cy) { return this.chunks.has(cx * 100003 + cy); }
  // the cache holds about 80 MB of chunk pixels whatever the bake scale (finer chunks: fewer of them;
  // a closer camera also shows fewer at once)
  maxChunks() { const px = Math.ceil((CHUNK + 2) * (this.scale || 1)); return Math.max(16, this.need || 0, Math.min(MAX_CHUNKS, Math.floor(80e6 / (px * px * 4)))); }

  renderChunk(cx, cy) {
    const s = this.scale, px = Math.ceil((CHUNK + 2) * s);
    let cv = this.spare; this.spare = null;
    if (!cv || cv.width !== px) { cv = document.createElement('canvas'); cv.width = cv.height = px; }
    const g = cv.getContext('2d');
    const x0 = cx * CHUNK, y0 = cy * CHUNK, art = this.art, low = SETTINGS.lowGfx;
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const pat = (tile) => g.createPattern(tile, 'repeat');
    g.fillStyle = pat(this.tGround); g.fillRect(x0 - 1, y0 - 1, CHUNK + 4, CHUNK + 4);
    const decor = this.decorAt.get(cx + ',' + cy) || [], tall = this.tallAt.get(cx + ',' + cy) || [];
    for (const d of decor) drawFlat(g, d, art, false);
    for (const d of tall) drawTallBase(g, d);
    const bx = { x0: x0 - 300, y0: y0 - 300, x1: x0 + CHUNK + 300, y1: y0 + CHUNK + 300 };
    if (this.T.box) this.paintArena(g, bx); else this.paintTrack(g, bx);
    // a light dusk over everything, then the lights come on
    g.globalCompositeOperation = 'multiply'; g.fillStyle = this.nt.night; g.fillRect(x0 - 1, y0 - 1, CHUNK + 4, CHUNK + 4);
    g.globalCompositeOperation = 'source-over';
    this.nightLights(g, bx, cx, cy, decor);
    // Low Graphics: the tall scenery is baked here, leaning a fixed way, instead of drawn every frame
    if (low) for (const d of tall) drawTall(g, d, 0.12, -0.2, 0, true, true);
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
    // runoff: a gravel band just outside the walls (under them), so the track has a clean border
    g.strokeStyle = g.createPattern(this.tRunoff, 'repeat'); T.corridors.forEach((c, k) => { // (one stroke per corridor)
      const L = lists[k]; if (!L.length) return;
      g.lineWidth = 2 * Math.max(...L.map((i) => c.ww[i])) + WALL * 2 + 44; g.beginPath();
      for (const i of L) { const j = (i + 1) % c.n; g.moveTo(c.px[i], c.py[i]); g.lineTo(c.px[j], c.py[j]); }
      g.stroke();
    });
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
        if (bend > 0.05 && c.look === 'road') {
          g.strokeStyle = th.curbB; g.setLineDash([]); stroke(c, i, 2 * c.hw[i] + 22);
          g.strokeStyle = th.curbA; g.setLineDash([26, 26]); g.lineDashOffset = -c.s[i]; g.lineCap = 'butt'; stroke(c, i, 2 * c.hw[i] + 22); g.lineCap = 'round';
          g.setLineDash([]);
        } else { g.strokeStyle = th.curbB; g.globalAlpha = 0.75; stroke(c, i, 2 * c.hw[i] + 8); g.globalAlpha = 1; }
      }
    });
    // road surface
    const roadPat = g.createPattern(this.tRoad, 'repeat');
    T.corridors.forEach((c, k) => {
      g.strokeStyle = c.look === 'road' ? roadPat : c.look === 'ice' ? th.ice || '#a9dcf5' : c.look === 'sand' ? th.sand || th.shoulder : th.shoulder;
      for (const i of lists[k]) stroke(c, i, 2 * c.hw[i]);
    });
    // texture on special corridors (sand ripples, ice streaks)
    T.corridors.forEach((c, k) => { if (c.look !== 'road') for (const i of lists[k]) this.surfDetail(g, c.look, c.px[i], c.py[i], c.hw[i], Math.atan2(c.ty[i], c.tx[i]), i); });
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
  onZone(c, s) { for (const z of c.zones) if (z.kind !== 'surf' && z.kind !== 'paint' && s >= z.s0 - 40 && s <= z.s1 + 40) return true; return false; }

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
    this.arenaPaint(g, B, cx, cy);
    for (const z of T.circles) {
      if (z.x + z.r < bx.x0 || z.x - z.r > bx.x1 || z.y + z.r < bx.y0 || z.y - z.r > bx.y1) continue;
      if (z.kind === 'pad') { this.padPlate(g, z.x, z.y, -Math.PI / 2, z.r * 2, z.r * 2, true); continue; }
      g.beginPath(); g.arc(z.x, z.y, z.r, 0, 7);
      this.surfFill(g, z.surf); g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
      this.surfDetail(g, z.surf, z.x, z.y, z.r, 0, 1);
    }
    for (const o of T.obstacles) if (o.x + o.r > bx.x0 && o.x - o.r < bx.x1 && o.y + o.r > bx.y0 && o.y - o.r < bx.y1) this.pillar(g, o);
  }

  // themed floor paint for the bare arenas (look only: it all drives as plain floor). Deterministic,
  // painted into the cached chunks like the rest of the floor, so it costs nothing per frame.
  arenaPaint(g, B, cx, cy) {
    const w = this.T.world, R = Math.min(B.x1 - B.x0, B.y1 - B.y0);
    // a striped warning band inside the walls (every arena)
    const band = 34, inset = 18;
    g.save();
    g.beginPath(); g.rect(B.x0 + inset, B.y0 + inset, B.x1 - B.x0 - inset * 2, B.y1 - B.y0 - inset * 2); g.rect(B.x0 + inset + band, B.y0 + inset + band, B.x1 - B.x0 - (inset + band) * 2, B.y1 - B.y0 - (inset + band) * 2); g.clip('evenodd');
    g.globalAlpha = 0.28; g.fillStyle = w === 'city' ? '#ff3fa4' : w === 'frozen' ? '#5fd0ff' : '#ffb03a';
    for (let k = -R * 2; k < R * 4; k += 70) { g.beginPath(); g.moveTo(B.x0 + k, B.y0); g.lineTo(B.x0 + k + 34, B.y0); g.lineTo(B.x0 + k + 34 - (B.y1 - B.y0), B.y1); g.lineTo(B.x0 + k - (B.y1 - B.y0), B.y1); g.closePath(); g.fill(); }
    g.restore();
    if (w === 'ashlands') {
      // CINDER PIT: glowing magma cracks running out from a scorched centre seal, cooled-rock rings
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 16; i++) {
        let a = (i / 16) * Math.PI * 2 + hash(i, 1, 41) * 0.3, x = cx + Math.cos(a) * R * 0.17, y = cy + Math.sin(a) * R * 0.17;
        const pts = [[x, y]];
        for (let k = 0; k < 9; k++) { a += (hash(i, k, 42) - 0.5) * 0.7; const st = R * (0.03 + hash(i, k, 43) * 0.035); x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); }
        for (const [lw, col, al] of [[16, '#1a0a08', 0.85], [8, '#c9360c', 0.75], [3, '#ffb347', 0.85]]) {
          g.globalAlpha = al; g.lineWidth = lw * (1 - i % 3 * 0.18); g.strokeStyle = col;
          g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.stroke();
        }
      }
      g.globalAlpha = 0.35; g.lineWidth = 10; g.strokeStyle = '#1a0a08';
      for (const f of [0.42, 0.47]) { g.beginPath(); g.arc(cx, cy, R * f, 0, 7); g.stroke(); }
      // the seal: a dark disc with an ember ring and eight spokes
      g.globalAlpha = 0.9; g.fillStyle = '#1d1012'; g.beginPath(); g.arc(cx, cy, R * 0.16, 0, 7); g.fill();
      g.lineWidth = 12; g.strokeStyle = '#ff6a1a'; g.globalAlpha = 0.7; g.stroke();
      g.lineWidth = 6; g.strokeStyle = '#ffb347'; g.globalAlpha = 0.55;
      g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; g.moveTo(cx + Math.cos(a) * R * 0.05, cy + Math.sin(a) * R * 0.05); g.lineTo(cx + Math.cos(a) * R * 0.13, cy + Math.sin(a) * R * 0.13); } g.stroke();
      g.globalAlpha = 1;
    } else if (w === 'city') {
      // ROOFTOP GRID: a landing pad in the middle (rings, a cross of chevrons), neon tile lines,
      // corner parking bays
      g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeStyle = '#3ff5ff';
      g.beginPath(); for (let x = B.x0 + 100; x < B.x1; x += 200) { g.moveTo(x, B.y0 + 60); g.lineTo(x, B.y1 - 60); } g.stroke();
      g.strokeStyle = '#ff3fa4'; g.beginPath(); for (let y = B.y0 + 100; y < B.y1; y += 200) { g.moveTo(B.x0 + 60, y); g.lineTo(B.x1 - 60, y); } g.stroke();
      g.globalAlpha = 0.85; g.fillStyle = '#14142a'; g.beginPath(); g.arc(cx, cy, R * 0.2, 0, 7); g.fill();
      g.lineWidth = 10; g.strokeStyle = '#ffe14a'; g.stroke();
      g.lineWidth = 4; g.strokeStyle = '#3ff5ff'; g.beginPath(); g.arc(cx, cy, R * 0.15, 0, 7); g.stroke();
      g.fillStyle = '#ffe14a';
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        for (let j = 0; j < 3; j++) { const d = R * (0.04 + j * 0.035), ca = Math.cos(a), sa = Math.sin(a), px = cx + ca * d, py = cy + sa * d, s2 = R * 0.018; g.beginPath(); g.moveTo(px + ca * s2, py + sa * s2); g.lineTo(px - sa * s2 * 1.4 - ca * s2 * 0.4, py + ca * s2 * 1.4 - sa * s2 * 0.4); g.lineTo(px - ca * s2 * 0.1, py - sa * s2 * 0.1); g.lineTo(px + sa * s2 * 1.4 - ca * s2 * 0.4, py - ca * s2 * 1.4 - sa * s2 * 0.4); g.closePath(); g.fill(); }
      }
      g.globalAlpha = 0.55; g.lineWidth = 5; g.strokeStyle = '#e8e8ff';
      for (const [qx, qy] of [[B.x0 + 90, B.y0 + 90], [B.x1 - 330, B.y0 + 90], [B.x0 + 90, B.y1 - 250], [B.x1 - 330, B.y1 - 250]]) { g.beginPath(); for (let k = 0; k <= 4; k++) { g.moveTo(qx + k * 60, qy); g.lineTo(qx + k * 60, qy + 160); } g.stroke(); }
      g.globalAlpha = 1;
    }
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
    if (z.kind === 'surf' || z.kind === 'paint') { // paint: a themed patch that drives like road
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
    if (o.cone) { this.cone(g, o); return; }
    const w = this.world;
    g.beginPath(); g.arc(o.x + 8, o.y + 10, o.r, 0, 7); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7);
    g.fillStyle = w === 'frozen' ? '#bfe6fb' : w === 'ashlands' ? '#2a1a1a' : w === 'city' ? '#33335a' : '#a8552e'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#12091e'; g.stroke();
    g.beginPath(); g.arc(o.x - o.r * 0.2, o.y - o.r * 0.2, o.r * 0.62, 0, 7);
    g.fillStyle = w === 'frozen' ? '#effaff' : w === 'ashlands' ? '#4a2c24' : w === 'city' ? '#4a4a7a' : '#d07a45'; g.fill();
    if (w === 'city' || w === 'ashlands') { g.beginPath(); g.arc(o.x, o.y, o.r - 6, 0, 7); g.lineWidth = 3; g.strokeStyle = w === 'city' ? '#3ff5ff' : '#ff6a1a'; g.stroke(); }
  }
  // a traffic cone seen from above (the tutorial's slalom: obstacles flagged `cone`)
  cone(g, o) {
    const r = o.r;
    g.beginPath(); g.arc(o.x + 5, o.y + 7, r, 0, 7); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    g.fillStyle = '#ff7a1a'; g.fillRect(o.x - r, o.y - r, r * 2, r * 2); g.lineWidth = 4; g.strokeStyle = '#12091e'; g.strokeRect(o.x - r, o.y - r, r * 2, r * 2);
    g.beginPath(); g.arc(o.x, o.y, r * 0.78, 0, 7); g.fillStyle = '#ff9a3c'; g.fill(); g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(o.x, o.y, r * 0.5, 0, 7); g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.arc(o.x, o.y, r * 0.28, 0, 7); g.fillStyle = '#ff7a1a'; g.fill(); g.lineWidth = 2.5; g.stroke();
  }
  wetReflections(g, bx) {
    // blurred neon pooled on the wet ground in front of the billboards and under the towers
    for (const d of this.flat) {
      if (d.kind !== 'board' || d.bx1 < bx.x0 || d.bx0 > bx.x1 || d.by1 < bx.y0 || d.by0 > bx.y1) continue;
      const gr = g.createRadialGradient(d.x, d.y, 10, d.x, d.y, d.w);
      gr.addColorStop(0, a2(d.col, 0.3)); gr.addColorStop(1, d.col + '00');
      g.fillStyle = gr; g.beginPath(); g.ellipse(d.x, d.y, d.w, d.w * 0.5, d.a, 0, 7); g.fill();
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
    // lava pools, cracks, signs and neon roofs keep their own light (lava zones stay as painted under a
    // light dusk: re-painting their big gradients per chunk cost too much, the renderer's lava glow lights them)
    g.globalCompositeOperation = 'lighter';
    if (w === 'city' && !T.box && !low) this.wetReflections(g, bx);
    g.globalCompositeOperation = 'source-over';
    for (const d of decor) drawFlat(g, d, this.art, true);
    for (const z of T.circles) if (z.surf === 'lava' && z.x + z.r > bx.x0 && z.x - z.r < bx.x1 && z.y + z.r > bx.y0 && z.y - z.r < bx.y1) { g.beginPath(); g.arc(z.x, z.y, z.r, 0, 7); this.surfFill(g, 'lava'); g.fill(); this.surfDetail(g, 'lava', z.x, z.y, z.r, 0, 1); }
    // puddles: a dark wet mirror with the nearby lights and the dusk sky in it
    for (const L of lights) {
      if (L.kind !== 'puddle') continue;
      g.save(); g.translate(L.x, L.y); g.rotate(L.a);
      g.beginPath(); g.ellipse(0, 0, L.rx, L.ry, 0, 0, 7); g.fillStyle = 'rgba(6,6,18,0.3)'; g.fill();
      if (!low) {
        g.clip();
        const gr = g.createLinearGradient(-L.rx, -L.ry, L.rx, L.ry);
        gr.addColorStop(0, a2(L.col, 0.3)); gr.addColorStop(0.45, `rgba(120,90,200,${0.25 * NEON_GLOW})`); gr.addColorStop(1, `rgba(40,30,90,${0.1 * NEON_GLOW})`);
        g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(-L.rx, -L.ry, L.rx * 2, L.ry * 2);
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }
    // the poles themselves: a dark mast with a bright lamp head
    for (const L of lights) {
      if (L.kind !== 'pole') continue;
      g.beginPath(); g.arc(L.x, L.y, 7, 0, 7); g.fillStyle = '#0c0a14'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#2a2638'; g.stroke();
      if (!low) continue; // (the mast and lamp are drawn each frame, leaning with the camera: poleLayer)
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
        this.glowStroke(g, nt.wall, 2.5, () => { g.beginPath(); for (const i of L) if (!this.onOther(c, i, side * (c.ww[i] + 4))) this.neonSeg(g, c, i, (q) => side * (c.ww[q] + 4)); });
        this.reflectors(g, c, L, side);
        const edgeCol = c.look === 'road' ? nt.edge : c.look === 'ice' ? '#bff4ff' : nt.line;
        this.glowStroke(g, edgeCol, 3, () => { g.beginPath(); for (const i of L) { if ((this.bend(c, i) > 0.05 && c.look === 'road') || this.onOther(c, i, side * (c.hw[i] + 2))) continue; this.neonSeg(g, c, i, (q) => side * (c.hw[q] + 2)); } });
        // curbs on the bends: neon dashes
        g.lineCap = 'butt';
        for (const i of L) {
          if (!(this.bend(c, i) > 0.05 && c.look === 'road')) continue;
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
    this.chevrons(g, bx);
  }
  // the light poles' masts and lamps, leaning away from the eye (ex, ey) like the tall scenery
  poleLayer(g, ex, ey, vw, k) {
    const P = this.poles || (this.poles = this.lights.filter((L) => L.kind === 'pole'));
    g.lineCap = 'round';
    for (let i = 0; i < P.length; i++) {
      const L = P[i];
      if (L.x < vw.x0 - 120 || L.x > vw.x1 + 120 || L.y < vw.y0 - 120 || L.y > vw.y1 + 120) continue;
      let ox = (L.x - ex) * k * POLE_H, oy = (L.y - ey) * k * POLE_H; const m = Math.hypot(ox, oy);
      if (m > 70) { ox *= 70 / m; oy *= 70 / m; }
      const tx = L.x + ox, ty = L.y + oy, hx = tx + (L.px - L.x) * 0.16, hy = ty + (L.py - L.y) * 0.16;
      g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(tx, ty); g.lineTo(hx, hy); g.lineWidth = 4; g.strokeStyle = '#1c1828'; g.stroke();
      g.globalCompositeOperation = 'lighter'; g.drawImage(this.lamp(L.col), hx - 26, hy - 26, 52, 52); g.globalCompositeOperation = 'source-over';
    }
  }
  lamp(col) {
    const C = this.lamps || (this.lamps = new Map());
    let cv = C.get(col);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.2, a2(col, 0.9)); gr.addColorStop(1, a2(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); C.set(col, cv);
    }
    return cv;
  }
  // is this wall point of corridor c (segment i, offset d) out on another corridor's road (a crossover
  // or a shortcut mouth)? Its lights are left out there, so nothing glows across a road
  onOther(c, i, d) {
    if (this.T.corridors.length < 2) return false;
    const M = this.otherMemo || (this.otherMemo = new Map()), key = (c.idx * 100003 + i) * 2 + (d > 0 ? 1 : 0) + (Math.abs(d) > c.hw[i] + 3 ? 1e9 : 0);
    let r = M.get(key);
    if (r === undefined) { const j = (i + 1) % c.n; r = this.inOther(c, (c.px[i] + c.px[j]) / 2 - c.ty[i] * d, (c.py[i] + c.py[j]) / 2 + c.tx[i] * d); M.set(key, r); }
    return r;
  }
  // is (x, y) on the road (or its shoulder) of a corridor other than c?
  inOther(c, x, y) {
    if (this.T.corridors.length < 2) return false;
    for (const o of this.T.corridors) {
      if (o === c) continue;
      for (let i = 0; i < o.segs; i++) {
        const j = (i + 1) % o.n, ax = o.px[i], ay = o.py[i], dx = o.px[j] - ax, dy = o.py[j] - ay, w = o.ww[i];
        if (Math.abs(x - ax) > w + 80 || Math.abs(y - ay) > w + 80) continue;
        const L2 = dx * dx + dy * dy || 1; let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - ax - dx * t, y - ay - dy * t) < w) return true;
      }
    }
    return false;
  }
  // cat-eye reflectors along the top of the wall every 64 px: they stream past at speed
  reflectors(g, c, L, side) {
    const nt = this.nt, low = SETTINGS.lowGfx, STEP = 64;
    for (const [r, col] of low ? [[1.6, '#ffffff']] : [[3.2, a2(nt.wall, 0.4)], [1.5, '#ffffff']]) {
      g.fillStyle = col; g.beginPath();
      for (const i of L) {
        const s0 = c.s[i], s1 = c.s[i + 1];
        for (let m = Math.ceil(s0 / STEP) * STEP; m < s1; m += STEP) {
          const t = m - s0, d = side * (c.ww[i] + WALL * 0.55), x = c.px[i] + c.tx[i] * t - c.ty[i] * d, y = c.py[i] + c.ty[i] * t + c.tx[i] * d;
          if (this.inOther(c, x, y)) continue; // (where another road crosses this wall: no lights across it)
          g.rect(x - r, y - r, r * 2, r * 2); // (squares: far cheaper to fill than arcs, and too small to tell)
        }
      }
      g.fill();
    }
  }
  // lit chevron boards along the outside of the tight bends, pointing the way round
  chevrons(g, bx) {
    const T = this.T, nt = this.nt, P = this.P || (this.P = {});
    for (const c of T.corridors) {
      if (!c.main) continue;
      for (let i = 0; i < c.segs; i += 2) {
        if (this.bend(c, i) < 0.11 || c.px[i] < bx.x0 + 250 || c.px[i] > bx.x1 - 250 || c.py[i] < bx.y0 + 250 || c.py[i] > bx.y1 - 250) continue;
        const j = (i + 1) % c.n, turn = c.tx[i] * c.ty[j] - c.ty[i] * c.tx[j], sd = turn > 0 ? -1 : 1, d = sd * (c.ww[i] + WALL + 14);
        const x = c.px[i] - c.ty[i] * d, y = c.py[i] + c.tx[i] * d;
        T.probe(x, y, 0, P); if (P.pen < WALL + 8) continue; // (would stand on another road's walls)
        g.save(); g.translate(x, y); g.rotate(Math.atan2(c.ty[i], c.tx[i]));
        g.fillStyle = '#07050c'; g.fillRect(-13, -9, 26, 18);
        g.strokeStyle = a2(nt.curbA, 0.35); g.lineWidth = 6; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-6, -6); g.lineTo(4, 0); g.lineTo(-6, 6); g.stroke();
        g.strokeStyle = nt.curbB; g.lineWidth = 2.5; g.stroke();
        g.restore();
      }
    }
  }
  bend(c, i) { const j = (i + 1) % c.n, jj = (i + c.n - 1) % c.n; return Math.abs(c.tx[jj] * c.ty[i] - c.ty[jj] * c.tx[i]) + Math.abs(c.tx[i] * c.ty[j] - c.ty[i] * c.tx[j]); }
  arenaLights(g) {
    const B = this.T.box, nt = this.nt;
    this.glowStroke(g, nt.wall, 3, () => { g.beginPath(); g.rect(B.x0 - 3, B.y0 - 3, B.x1 - B.x0 + 6, B.y1 - B.y0 + 6); });
    for (const z of this.T.circles) if (z.kind === 'pad') this.padPlate(g, z.x, z.y, -Math.PI / 2, z.r * 2, z.r * 2, true, true);
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
      // the track in the world's neon: a dark casing, a soft glow, a bright core
      const nt = this.nt;
      for (const [col, extra, al] of [['#0a0614', 80 / k * 0.06 + 70, 1], [nt.edge, 120, 0.35], [nt.edge, 40, 1], ['#f4ecff', -25, 1]]) {
        g.strokeStyle = col; g.globalAlpha = al;
        for (const c of T.corridors) {
          g.lineWidth = Math.max(20, (c.main ? 150 : 90) + extra); g.setLineDash(c.main ? [] : [60, 60]);
          g.beginPath(); for (let i = 0; i < c.n; i++) g.lineTo(c.px[i], c.py[i]); if (c.closed) g.closePath(); g.stroke();
        }
      }
      g.globalAlpha = 1; g.setLineDash([]);
      const G0 = T.gates[0];
      g.strokeStyle = '#ffffff'; g.lineWidth = 70; g.beginPath(); g.moveTo(G0.x0, G0.y0); g.lineTo(G0.x1, G0.y1); g.stroke();
      g.strokeStyle = nt.line; g.lineWidth = 36; g.stroke();
    }
    this.mini = { cv, size, dpr, k, ox, oy };
    return this.mini;
  }
}
export { CAR_R };
