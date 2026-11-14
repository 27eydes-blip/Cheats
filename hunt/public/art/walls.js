// Pixel-art walls + cover, drawn by code (no image files).
// Pieces are painted ONCE into offscreen canvases (16 art-pixels per cell = 64px art grid at 4x)
// and blitted nearest-neighbour. Everything stays inside each cell's collision footprint:
// the top face plus a darker visible side face, so what you see is exactly what collides.
// Caches keep at most 4 worlds' art (LRU) and are rebuilt after a lost canvas context.
import { artFor, INK } from './themes.js';
import { TILE, WALL, worldKeyAt } from '../shared.js';

export const P = 16; // art pixels per cell
const SIDE = 4; // side-face height in art pixels
const MAX_WORLDS = 4;

const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0);
function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// ---------------------------------------------------------------- pixel helpers
function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function tri(g, x0, y0, x1, y1, x2, y2, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.fill(); }

// Material painters: draw details on one cell's top face (x,y = cell origin in art px, h = top height)
const MATERIAL = {
  stone: {
    top(g, x, y, h, v, pal, s, one) {
      if (v === 0) { // bricks
        for (let r = 0; r < h; r += 5) { px(g, x, y + r, P, 1, pal.detail); const o = (r / 5) % 2 ? 4 : 10; px(g, x + o, y + r, 1, 5, pal.detail); }
      } else if (v === 1) { // carved column top
        px(g, x + 4, y + 3, 8, 8, pal.detail); px(g, x + 5, y + 4, 6, 6, pal.topHi); px(g, x + 7, y + 6, 2, 2, pal.detail);
        if (!one) { px(g, x + 1, y + 1, 2, 2, pal.detail); px(g, x + 13, y + 1, 2, 2, pal.detail); }
      } else { // big stone blocks with a crack
        if (s & 1) { px(g, x + 3, y + 2, 1, 4, pal.detail); px(g, x + 4, y + 5, 1, 3, pal.detail); px(g, x + 5, y + 7, 3, 1, pal.detail); }
        px(g, x + 11, y + 8, 2, 1, pal.detail); px(g, x + 9, y + 3, 1, 1, pal.topHi);
      }
    },
    side(g, x, y, v, pal) { for (let i = 1; i < P; i += 5) px(g, x + i, y, 1, SIDE, pal.sideDk); },
    border(g, x, y, pal, s) { // stone tiles
      px(g, x, y, P, P, pal.border);
      for (let r = 0; r < P; r += 8) { px(g, x, y + r, P, 1, pal.borderDk); px(g, x + ((r / 8) % 2 ? 4 : 12), y + r, 1, 8, pal.borderDk); }
      if (s & 2) px(g, x + 6, y + 10, 2, 1, pal.borderDk);
    },
  },
  metal: {
    top(g, x, y, h, v, pal, s) {
      px(g, x, y, P, 1, pal.topHi);
      if (v === 0) { for (const [a, b] of [[2, 2], [13, 2], [2, h - 3], [13, h - 3]]) { px(g, x + a, y + b, 1, 1, pal.detail); px(g, x + a, y + b + 1, 1, 1, INK); } px(g, x + 8, y, 1, h, pal.side); }
      else if (v === 1) { for (let r = 3; r < h - 2; r += 3) { px(g, x + 3, y + r, 10, 1, INK); px(g, x + 3, y + r + 1, 10, 1, pal.detail); } }
      else { for (let i = -h; i < P; i += 6) for (let k = 0; k < 3; k++) for (let j = 0; j < h; j++) { const xx = i + j + k; if (xx >= 0 && xx < P) px(g, x + xx, y + j, 1, 1, pal.stripe); } }
    },
    side(g, x, y, v, pal) { if (v === 2) for (let i = 0; i < P; i += 4) px(g, x + i, y, 2, SIDE, pal.stripe); else px(g, x, y + 1, P, 1, pal.detail); },
    border(g, x, y, pal, s) { // metal panels
      px(g, x, y, P, P, pal.border); px(g, x, y, P, 1, pal.borderDk); px(g, x, y, 1, P, pal.borderDk);
      for (const [a, b] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(g, x + a, y + b, 1, 1, pal.detail);
      if (s & 1) px(g, x + 4, y + 7, 8, 2, pal.borderDk);
    },
  },
  sandstone: {
    top(g, x, y, h, v, pal, s, one) {
      if (v === 0) { for (let r = 2; r < h; r += 4) for (let i = 0; i < P; i++) px(g, x + i, y + r + (((i + s) >> 2) % 2), 1, 1, pal.detail); }
      else if (v === 1) { // invented glyph-style marks (not any real script)
        const glyph = s % 3;
        if (glyph === 0) { px(g, x + 5, y + 3, 6, 1, pal.detail); px(g, x + 10, y + 3, 1, 5, pal.detail); px(g, x + 6, y + 7, 5, 1, pal.detail); px(g, x + 6, y + 5, 1, 3, pal.detail); px(g, x + 7, y + 5, 2, 1, pal.detail); } // squared spiral
        else if (glyph === 1) { for (let i = 0; i < 4; i++) { px(g, x + 3 + i * 3, y + 4 + (i % 2) * 3, 2, 1, pal.detail); px(g, x + 4 + i * 3, y + 5, 1, 2, pal.detail); } } // zigzag
        else { px(g, x + 5, y + 3, 6, 6, pal.detail); px(g, x + 6, y + 4, 4, 4, pal.top); px(g, x + 7, y + 5, 2, 2, pal.detail); px(g, x + 3, y + 10, 10, 1, pal.detail); } // dot in a box over a line
      } else { // broken pillar stump / chipped block
        if (one) { px(g, x + 3, y + 1, 10, h - 2, pal.side); px(g, x + 4, y + 2, 8, h - 4, pal.top); px(g, x + 5, y + 3, 6, 2, pal.topHi); px(g, x + 3, y + 1, 3, 2, pal.sideDk); px(g, x + 10, y + 1, 3, 3, pal.sideDk); }
        else { px(g, x, y, 3, 2, pal.sideDk); px(g, x + 13, y + 1, 3, 1, pal.detail); px(g, x + 6, y + 6, 1, 4, pal.detail); }
      }
    },
    side(g, x, y, v, pal) { px(g, x, y + 2, P, 1, pal.detail); },
    border(g, x, y, pal, s) { // sandstone cliff: stepped strata
      px(g, x, y, P, P, pal.border);
      for (let r = 3; r < P; r += 5) for (let i = 0; i < P; i++) px(g, x + i, y + r + ((i + (s & 3)) % 7 === 0 ? 1 : 0), 1, 1, pal.borderDk);
    },
  },
  ice: {
    top(g, x, y, h, v, pal, s) {
      px(g, x + 1, y + 1, 4, 1, pal.topHi);
      if (v === 0) { px(g, x + 4, y + 3, 1, 3, pal.detail); px(g, x + 5, y + 6, 3, 1, pal.detail); px(g, x + 8, y + 7, 1, 3, pal.detail); px(g, x + 9, y + 5, 2, 1, pal.detail); } // frost cracks
      else if (v === 1) { for (const [a, hh] of [[3, 6], [7, 9], [11, 5]]) { tri(g, x + a, y + h - 1, x + a + 2, y + h - 1 - hh, x + a + 4, y + h - 1, pal.topHi); tri(g, x + a + 2, y + h - 1, x + a + 2, y + h - 1 - hh, x + a + 4, y + h - 1, pal.side); } } // crystal cluster
      else { px(g, x, y, P, 5, '#ffffff'); for (let i = 0; i < P; i += 3) px(g, x + i, y + 5, 2, 1 + ((s + i) % 2), '#ffffff'); } // snow cap
    },
    side(g, x, y, v, pal) { px(g, x + 2, y + 1, 3, 1, pal.topHi); },
    border(g, x, y, pal, s) { // ice cliff facets
      px(g, x, y, P, P, pal.border);
      tri(g, x, y + P, x + 6, y + 2, x + 12, y + P, pal.borderDk); tri(g, x + 8, y, x + 14, y + 9, x + P, y, '#e6f6ff');
    },
  },
  wood: {
    top(g, x, y, h, v, pal, s, one) {
      if (v === 0) { for (let r = 0; r < h; r += 4) { px(g, x, y + r, P, 1, pal.detail); px(g, x + 1, y + r + 1, P - 2, 1, pal.topHi); } } // log wall
      else if (v === 1) { for (let i = 0; i < P; i += 4) px(g, x + i, y, 1, h, pal.detail); for (let k = 0; k < h; k++) px(g, x + Math.floor((k / h) * P), y + k, 2, 1, pal.detail); } // plank crate
      else { // mossy stump
        px(g, x + 3, y + 1, 10, h - 2, pal.detail); px(g, x + 4, y + 2, 8, h - 4, pal.topHi); px(g, x + 6, y + 4, 4, Math.max(1, h - 8), pal.top); px(g, x + 7, y + 5, 2, 1, pal.detail);
        px(g, x + 2, y + 1, 4, 2, pal.moss); px(g, x + 11, y + h - 4, 3, 2, pal.moss);
      }
    },
    side(g, x, y, v, pal) { for (let i = 3; i < P; i += 6) px(g, x + i, y, 2, SIDE, pal.sideDk); },
    border(g, x, y, pal, s) { // wooden palisade: pointed stakes
      px(g, x, y, P, P, pal.borderDk);
      for (let i = 0; i < P; i += 4) { px(g, x + i, y + 3, 3, P - 3, pal.border); tri(g, x + i, y + 3, x + i + 1.5, y, x + i + 3, y + 3, pal.border); px(g, x + i + 3, y + 3, 1, P - 3, INK); }
    },
  },
};

// ---------------------------------------------------------------- piece sprite
function edgeSpikes(g, x, y, len, dir, pal, inward) {
  // stone lip + slime band + bright spikes along one edge, all inside the footprint
  const horiz = dir === 'n' || dir === 's';
  const at = (a, d) => (horiz ? [x + a, dir === 'n' ? y + d : y - d - 1] : [dir === 'w' ? x + d : x - d - 1, y + a]);
  for (let a = 0; a < len; a++) {
    const [lx, ly] = at(a, 0); px(g, lx, ly, 1, 1, INK);
    const [sx, sy] = at(a, 1); px(g, sx, sy, 1, 1, pal.detail === pal.top ? pal.side : pal.topHi); // stone lip
    const [mx, my] = at(a, 2); px(g, mx, my, 1, 1, pal.slime);
    if ((a * 7 + len) % 5 === 0) { const [dx, dy] = at(a, 3); px(g, dx, dy, 1, 1, pal.slime); }
  }
  for (let a = 1; a + 3 <= len; a += 4) { // spikes pointing out of the piece (into the map for borders)
    const tipD = 7, baseD = 3;
    const [b0x, b0y] = at(a, baseD), [b1x, b1y] = at(a + 3, baseD), [tx, ty] = at(a + 1.5, tipD);
    const o = inward ? 0 : 0;
    g.fillStyle = INK; g.beginPath(); g.moveTo(b0x - (horiz ? 0.5 : 0), b0y); g.lineTo(tx + o, ty); g.lineTo(b1x + (horiz ? 0.5 : 0), b1y); g.closePath(); g.fill();
    g.fillStyle = pal.spike; g.beginPath(); g.moveTo(b0x + (horiz ? 0.5 : 0), b0y); g.lineTo(tx, ty + (dir === 'n' ? -0.6 : dir === 's' ? 0.6 : 0)); g.lineTo(b1x - (horiz ? 0.5 : 0), b1y); g.closePath(); g.fill();
  }
}

function buildPiece(world, cells, variant, spike) {
  const A = artFor(world), pal = A.palette, M = MATERIAL[A.material];
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), cw = Math.max(...xs) - x0 + 1, ch = Math.max(...ys) - y0 + 1;
  const local = cells.map(([x, y]) => [x - x0, y - y0]);
  const has = (x, y) => local.some((c) => c[0] === x && c[1] === y);
  const cv = canvas(cw * P, ch * P), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const one = cells.length === 1;
  for (const [cx, cy] of local) {
    const x = cx * P, y = cy * P, below = has(cx, cy + 1);
    const th = below ? P : P - SIDE;
    px(g, x, y, P, P, pal.side);
    px(g, x, y, P, th, pal.top);
    M.top(g, x, y, th, variant, pal, hash(cx + x0, cy + y0), one);
    if (!below) { px(g, x, y + th, P, 1, pal.sideDk); M.side(g, x, y + th + 1, variant, pal); px(g, x, y + P - 1, P, 1, pal.sideDk); }
  }
  // bold outline on the outer boundary + light rim on top edges
  for (const [cx, cy] of local) {
    const x = cx * P, y = cy * P;
    if (!has(cx, cy - 1)) { px(g, x, y, P, 2, INK); px(g, x + 2, y + 2, P - 4, 1, pal.topHi); }
    if (!has(cx, cy + 1)) px(g, x, y + P - 2, P, 2, INK);
    if (!has(cx - 1, cy)) px(g, x, y, 2, P, INK);
    if (!has(cx + 1, cy)) px(g, x + P - 2, y, 2, P, INK);
  }
  // about 1 in 6 cover pieces: a spiked, slimy edge on one side (decoration only)
  if (spike && !A.noSpikes) {
    for (const [cx, cy] of local) {
      const x = cx * P, y = cy * P;
      if (spike === 'n' && !has(cx, cy - 1)) edgeSpikes(g, x, y, P, 'n', pal);
      if (spike === 's' && !has(cx, cy + 1)) edgeSpikes(g, x, y + P, P, 's', pal);
      if (spike === 'w' && !has(cx - 1, cy)) edgeSpikes(g, x, y, P, 'w', pal);
      if (spike === 'e' && !has(cx + 1, cy)) edgeSpikes(g, x + P, y, P, 'e', pal);
    }
  }
  return { cv, x0, y0, cw, ch };
}

// border tile: material + spiked inner edges (mask bits: n=1 e=2 s=4 w=8 → which sides face the map)
function buildBorder(world, mask, variant, roof) {
  const A = artFor(world), pal = A.palette, M = MATERIAL[A.material];
  const cv = canvas(P, P), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (roof) { // temple roof tiles strip (Wildwood north edge)
    px(g, 0, 0, P, P, pal.roofDk);
    for (let r = 0; r < P; r += 5) for (let i = (r / 5) % 2 ? -2 : 0; i < P; i += 4) { px(g, i, r, 3, 4, pal.roof); px(g, i, r + 3, 3, 1, pal.roofDk); }
  } else M.border(g, 0, 0, pal, variant);
  if (!A.noSpikes) {
    if (mask & 1) edgeSpikes(g, 0, 0, P, 'n', pal, true);
    if (mask & 4) edgeSpikes(g, 0, P, P, 's', pal, true);
    if (mask & 8) edgeSpikes(g, 0, 0, P, 'w', pal, true);
    if (mask & 2) edgeSpikes(g, P, 0, P, 'e', pal, true);
  }
  return { cv };
}

// ---------------------------------------------------------------- cache + drawing
export class WallArt {
  constructor() { this.worlds = new Map(); this.generation = 0; this.builds = 0; }
  reset() { this.worlds.clear(); this.generation++; }
  bucket(world) {
    let b = this.worlds.get(world);
    if (b) { this.worlds.delete(world); this.worlds.set(world, b); return b; } // LRU touch
    b = new Map(); this.worlds.set(world, b);
    const real = [...this.worlds.keys()].filter((w) => w !== 'hub');
    while (real.length > MAX_WORLDS) this.worlds.delete(real.shift()); // evict least recently used
    return b;
  }
  get(world, key, build) {
    const b = this.bucket(world);
    let s = b.get(key);
    if (!s) { s = build(); b.set(key, s); this.builds++; }
    return s;
  }
  stats() { return { worlds: [...this.worlds.keys()], sprites: [...this.worlds.values()].reduce((n, b) => n + b.size, 0), generation: this.generation, builds: this.builds }; }

  pieceWorld(map, piece) { return piece.world || worldKeyAt(map, piece.cells[0][0] * TILE + 25, piece.cells[0][1] * TILE + 25); }

  // ground shadows (vector, cheap): skipped in Low Graphics
  drawShadows(ctx, map, view) {
    ctx.fillStyle = 'rgba(27,16,51,0.22)';
    const S = TILE * 0.28;
    this.forVisibleWalls(map, view, (tx, ty) => { if (!map.border[ty * map.gw + tx]) ctx.fillRect(tx * TILE + S, ty * TILE + S, TILE, TILE); });
  }

  forVisibleWalls(map, view, f) {
    const tx0 = Math.max(0, Math.floor(view.x0 / TILE) - 1), ty0 = Math.max(0, Math.floor(view.y0 / TILE) - 1);
    const tx1 = Math.min(map.gw - 1, Math.floor(view.x1 / TILE) + 1), ty1 = Math.min(map.gh - 1, Math.floor(view.y1 / TILE) + 1);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (map.t[ty * map.gw + tx] === WALL) f(tx, ty);
  }

  // draw every wall tile in view: whole pieces from cache, border tiles, and fallback cells
  // (walls raised by events, or pieces partly sunk) so nothing collides invisibly.
  draw(ctx, map, view, t, S = {}) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const k = TILE / P, done = new Set();
    this.forVisibleWalls(map, view, (tx, ty) => {
      const i = ty * map.gw + tx, pid = map.pieceAt[i];
      if (map.border[i]) {
        const world = worldKeyAt(map, tx * TILE + 25, ty * TILE + 25);
        const open = (x, y) => x >= 0 && y >= 0 && x < map.gw && y < map.gh && !map.border[y * map.gw + x];
        const mask = (open(tx, ty - 1) ? 1 : 0) | (open(tx + 1, ty) ? 2 : 0) | (open(tx, ty + 1) ? 4 : 0) | (open(tx - 1, ty) ? 8 : 0);
        const roof = artFor(world).northRoof && ty === 0;
        const v = hash(tx, ty) % 3;
        const s = this.get(world, `B${mask}|${v}|${roof ? 1 : 0}`, () => buildBorder(world, mask, v, roof));
        ctx.drawImage(s.cv, tx * TILE, ty * TILE, TILE, TILE);
        return;
      }
      if (pid >= 0 && !done.has(pid)) {
        const piece = map.pieces[pid];
        if (piece.cells.every(([x, y]) => map.t[y * map.gw + x] === WALL)) {
          done.add(pid);
          const world = this.pieceWorld(map, piece);
          const key = `P${piece.cells.map((c) => c.join(',')).join(';')}|${piece.variant}|${piece.spike || ''}`;
          const s = this.get(world, key, () => buildPiece(world, piece.cells, piece.variant, piece.spike));
          ctx.drawImage(s.cv, s.x0 * TILE, s.y0 * TILE, s.cw * TILE, s.ch * TILE);
          if (artFor(world).shimmer && !S.lowGfx) this.shimmer(ctx, s, t, S.reduceFlash);
          return;
        }
      }
      if (pid >= 0 && done.has(pid)) return;
      // fallback single cell
      const world = worldKeyAt(map, tx * TILE + 25, ty * TILE + 25);
      const v = hash(tx, ty) % 3;
      const s = this.get(world, `F${v}`, () => buildPiece(world, [[0, 0]], v, null));
      ctx.drawImage(s.cv, tx * TILE, ty * TILE, TILE, TILE);
    });
    if (!S.lowGfx) this.drawSlime(ctx, map, view, t, S.reduceFlash);
    ctx.restore();
    void k;
  }

  // slow slime drips hanging off border spikes (steady glow under Reduce Flashing)
  drawSlime(ctx, map, view, t, steady) {
    this.forVisibleWalls(map, view, (tx, ty) => {
      const i = ty * map.gw + tx;
      if (!map.border[i]) return;
      const world = worldKeyAt(map, tx * TILE + 25, ty * TILE + 25), A = artFor(world);
      if (A.noSpikes) return;
      const below = ty + 1 < map.gh && !map.border[i + map.gw] && map.t[i + map.gw] !== WALL;
      if (!below) return;
      const h = hash(tx, ty), x = tx * TILE + 8 + (h % 34), y0 = ty * TILE + TILE;
      ctx.fillStyle = A.palette.slime;
      if (steady) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y0 + 2, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillRect(x - 1.5, y0, 3, 5); return; }
      const ph = ((t * 0.35 + (h % 100) / 100) % 1);
      const len = 3 + ph * 12;
      ctx.fillRect(x - 1.5, y0, 3, len);
      ctx.beginPath(); ctx.arc(x, y0 + len, 2.6, 0, Math.PI * 2); ctx.fill();
    });
  }

  shimmer(ctx, s, t, steady) {
    const x = s.x0 * TILE, y = s.y0 * TILE, w = s.cw * TILE, h = s.ch * TILE;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.globalAlpha = steady ? 0.12 : 0.18;
    ctx.fillStyle = '#fff6d6';
    const off = steady ? 0 : (t * 30) % 40;
    for (let k2 = -h; k2 < w + h; k2 += 40) { ctx.beginPath(); ctx.moveTo(x + k2 + off, y); ctx.lineTo(x + k2 + off + 10, y); ctx.lineTo(x + k2 + off + 10 - h, y + h); ctx.lineTo(x + k2 + off - h, y + h); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  // debug: every collision tile has art (no invisible edges)
  undrawnWalls(map) {
    let n = 0;
    for (let i = 0; i < map.t.length; i++) if (map.t[i] === WALL && !map.border[i] && map.pieceAt[i] < 0 && map.base[i] === WALL) n++;
    return n;
  }
}
export const MATERIALS = Object.keys(MATERIAL);
