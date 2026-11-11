// Pixel-art toolkit. Art is authored at 1 "art pixel" = 1 cell, then written to textures
// pre-scaled by S (each art pixel becomes an S×S block) with NEAREST filtering. Game code keeps
// working in its usual logical units: 1 art pixel = S logical units on screen.
import Phaser from "phaser";

/** Logical units per art pixel (textures are pre-scaled by this). */
export const S = 4;

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export function shade(c, k) {
  // k > 0 lightens toward white, k < 0 darkens toward black
  const [r, g, b] = rgb(c);
  const f = (v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
export function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return (
    (Math.round(A[0] + (B[0] - A[0]) * t) << 16) |
    (Math.round(A[1] + (B[1] - A[1]) * t) << 8) |
    Math.round(A[2] + (B[2] - A[2]) * t)
  );
}

/** A tiny indexed canvas: each cell is a 0xRRGGBB color or null (transparent). */
export class PixelCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Array(w * h).fill(null);
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x, y) {
    return this.in(x, y) ? this.d[y * this.w + x] : null;
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (this.in(x, y)) this.d[y * this.w + x] = c;
    return this;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  hline(x0, x1, y, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
    return this;
  }
  vline(x, y0, y1, c) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }
  circle(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6) this.set(x, y, c);
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.05) this.set(x, y, c);
    return this;
  }
  /** Filled polygon (pixel centres inside). pts = [[x,y],...] */
  poly(pts, c) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
            inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
    return this;
  }
  /** String-art: rows of chars mapped through a palette ('.'/' ' = empty). */
  stamp(x, y, rows, pal) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === "." || ch === " ") return;
        const c = pal[ch];
        if (c !== undefined) this.set(x + i, y + j, c);
      });
    });
    return this;
  }
  /** Light from top-left: lighten exposed top/left pixels, darken exposed bottom/right. */
  autoShade(hl = 0.25, sh = -0.35) {
    const src = this.d.slice();
    const g = (x, y) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = g(x, y);
        if (c === null) continue;
        if (g(x, y - 1) === null || g(x - 1, y) === null) this.d[y * this.w + x] = shade(c, hl);
        else if (g(x, y + 1) === null || g(x + 1, y) === null)
          this.d[y * this.w + x] = shade(c, sh);
      }
    return this;
  }
  /** Dark outline around every opaque shape (thickness in art px, grows outward). */
  outline(c, thickness = 1, diagonal = false) {
    for (let t = 0; t < thickness; t++) {
      const src = this.d.slice();
      const g = (x, y) =>
        x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null;
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          if (g(x, y) !== null) continue;
          const n =
            g(x - 1, y) !== null ||
            g(x + 1, y) !== null ||
            g(x, y - 1) !== null ||
            g(x, y + 1) !== null ||
            (diagonal &&
              (g(x - 1, y - 1) !== null ||
                g(x + 1, y - 1) !== null ||
                g(x - 1, y + 1) !== null ||
                g(x + 1, y + 1) !== null));
          if (n) this.d[y * this.w + x] = c;
        }
    }
    return this;
  }
  flipY() {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        out.d[(this.h - 1 - y) * this.w + x] = this.d[y * this.w + x];
    return out;
  }
  flipX() {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        out.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x];
    return out;
  }
  /** Draw another PixelCanvas into this one. */
  blit(pc, ox, oy) {
    for (let y = 0; y < pc.h; y++)
      for (let x = 0; x < pc.w; x++) {
        const c = pc.d[y * pc.w + x];
        if (c !== null) this.set(ox + x, oy + y, c);
      }
    return this;
  }
  /** HTML canvas pre-scaled by `scale` (crisp blocks). */
  toCanvas(scale = S) {
    // write raw pixels once, then scale up with smoothing off (exact nearest-neighbour
    // blocks) — far faster than one fillRect per art pixel
    const small = document.createElement("canvas");
    small.width = this.w;
    small.height = this.h;
    const sctx = small.getContext("2d");
    const img = sctx.createImageData(this.w, this.h);
    const px = img.data;
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i];
      if (c === null) continue;
      const o = i * 4;
      px[o] = (c >> 16) & 255;
      px[o + 1] = (c >> 8) & 255;
      px[o + 2] = c & 255;
      px[o + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    if (scale === 1) return small;
    const cv = document.createElement("canvas");
    cv.width = this.w * scale;
    cv.height = this.h * scale;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cv.width, cv.height);
    releaseCanvas(small); // (the 1x copy is done with: give its memory back now, not at GC)
    return cv;
  }
}

// While set, addTexture/addAtlas queue their (slow) canvas + GPU upload work here instead.
let deferred = null;

/**
 * Runs `fn` and returns the texture uploads it asked for as a list of jobs, to be run later
 * (one per frame) so building a biome's art mid-run doesn't stall a frame.
 */
export function deferUploads(fn) {
  const jobs = [];
  deferred = jobs;
  try {
    fn();
  } finally {
    deferred = null;
  }
  return jobs;
}

/**
 * Register a finished canvas as a texture. Phaser's addCanvas() makes a CanvasTexture, which
 * reads every pixel back with getImageData() when it is created: ~0.75 s for one biome's
 * art even on a desktop, and far longer on iPhones (their canvases live on the GPU). That
 * froze the game for seconds at every realm boundary. A plain texture uploads the canvas
 * as-is and never reads it back.
 */
export function canvasTexture(scene, key, canvas) {
  const tm = scene.textures;
  // rebuilding after a lost GPU context (gfx/rebuildArt.js): the texture keeps its identity
  // (every sprite, tile sprite and particle emitter still points at it) and only gets the
  // freshly drawn canvas, uploaded into its own GPU texture
  if (rebuild.on && tm.exists(key)) {
    const src = tm.get(key).source[0];
    if (src && src.glTexture && src.width === canvas.width && src.height === canvas.height) {
      src.image = canvas;
      src.isCanvas = true;
      src.update();
      rebuild.done.add(key);
      return tm.get(key);
    }
  }
  if (tm.exists(key)) forgetTextures(scene, [key]);
  const tex = tm.addImage(key, canvas);
  if (rebuild.on) rebuild.done.add(key);
  restoreTextures(scene, key);
  return tex;
}

/**
 * Rebuild mode (set by gfx/rebuildArt.js while it re-runs the art builders after a lost GPU
 * context): `done` collects every texture key that got freshly drawn pixels. `extra`: texture
 * key → its builder, for art made on demand outside the launch / realm sets.
 */
export const rebuild = { on: false, done: new Set(), extra: new Map() };

/**
 * Give a canvas's memory back straight away. iPad Safari caps the memory of all canvases
 * together and draws NEW canvases blank once it's over the cap; a canvas that's only waiting
 * to be garbage-collected still counts. Only for canvases nothing will draw from again.
 */
export function releaseCanvas(c) {
  if (!c || typeof c.getContext !== "function") return;
  try {
    c.width = 0;
    c.height = 0;
  } catch {}
}

// Objects that were showing a texture when it was removed, by texture key: { o, frame }.
const lost = new Map();

/**
 * Remove textures safely. Removing a texture destroys its frames, but objects still pointing
 * at it (pooled hazards waiting for their next spawn, a scene's scenery) would draw a destroyed
 * frame the next time they're shown: "Cannot read properties of null (reading 'glTexture')",
 * the Abyss crash (a Slammer pooled in an earlier run drew the Abyss art freed after that run).
 * Every object on any scene still using one of them is switched to the blank texture first, and
 * goes back to its texture and frame when that texture is built again (restoreTextures).
 */
export function forgetTextures(scene, keys) {
  const tm = scene.textures;
  const dead = new Map();
  for (const k of keys) if (tm.exists(k)) dead.set(tm.get(k), k);
  if (!dead.size) return;
  const visit = (o) => {
    if (!o) return;
    if (o.texture && dead.has(o.texture) && typeof o.setTexture === "function") {
      const key = dead.get(o.texture);
      if (!lost.has(key)) lost.set(key, new Set());
      lost.get(key).add({ o, frame: o.frame?.name });
      try {
        o.setTexture("__DEFAULT");
      } catch {}
    }
    const kids = o.list || (o.type === "Layer" ? o.getChildren?.() : null);
    if (Array.isArray(kids)) for (const c of kids) visit(c);
  };
  for (const sc of scene.sys.game.scene.scenes) for (const o of sc.sys.displayList?.list || []) visit(o);
  for (const [tex, k] of dead) {
    const imgs = tex.source.map((src) => src.image);
    tm.remove(k);
    // (a freed realm's ~5 MB of canvases go now, not whenever the garbage collector runs)
    for (const img of imgs) releaseCanvas(img);
  }
}

/** A texture was (re)built: objects that lost it when it was removed get it back. */
export function restoreTextures(scene, key) {
  const set = lost.get(key);
  if (!set) return;
  const tex = scene.textures.get(key);
  for (const e of set) {
    // gone, or the game has given it another texture since: forget it
    if (!e.o.scene || e.o.texture?.key !== "__DEFAULT") {
      set.delete(e);
      continue;
    }
    if (e.frame && e.frame !== "__BASE" && !tex.has(e.frame)) continue; // (an atlas adds its frames next)
    try {
      e.o.setTexture(key, e.frame);
    } catch {}
    set.delete(e);
  }
  if (!set.size) lost.delete(key);
}

/** Register a PixelCanvas as a standalone (tileable) NEAREST texture. */
export function addTexture(scene, key, pc, scale = S) {
  if (deferred) {
    deferred.push(() => addTexture(scene, key, pc, scale));
    return null;
  }
  const tex = canvasTexture(scene, key, pc.toCanvas(scale));
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  restoreTextures(scene, key);
  return tex;
}

/**
 * Packs many PixelCanvas frames into one atlas texture (one draw-call-friendly texture per
 * biome). `frames` = { name: PixelCanvas }.
 */
export function addAtlas(scene, key, frames, scale = S) {
  if (deferred) {
    deferred.push(() => addAtlas(scene, key, frames, scale));
    return null;
  }
  const entries = Object.entries(frames);
  const maxW = 2048;
  let x = 0;
  let y = 0;
  let rowH = 0;
  const place = [];
  for (const [name, pc] of entries) {
    const w = pc.w * scale + 2;
    const h = pc.h * scale + 2;
    if (x + w > maxW) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    place.push({ name, pc, x, y });
    x += w;
    rowH = Math.max(rowH, h);
  }
  const cv = document.createElement("canvas");
  cv.width = maxW;
  cv.height = y + rowH;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (const p of place) {
    const fc = p.pc.toCanvas(scale);
    ctx.drawImage(fc, p.x, p.y);
    releaseCanvas(fc);
  }
  const tex = canvasTexture(scene, key, cv);
  // (Texture.add skips frames it already has: a texture rebuilt in place keeps its frames)
  for (const p of place) tex.add(p.name, 0, p.x, p.y, p.pc.w * scale, p.pc.h * scale);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  restoreTextures(scene, key); // (objects that lost this atlas get their frames back)
  return tex;
}

/**
 * Camera zoom (physical px per logical unit) closest to `wanted` that keeps every art pixel
 * an exact whole number of screen pixels.
 */
export function pixelPerfectZoom(Z, wanted) {
  const n = Math.max(1, Math.round(S * Z * wanted));
  return n / S;
}
