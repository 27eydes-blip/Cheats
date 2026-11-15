// NEON STYLE (graphics remake): the shared look for every sprite, realm and screen.
// Crisp pixel art (hard edges, nearest-neighbour) + neon glow: dark low-contrast backgrounds,
// bright saturated gameplay objects, a bold dark outline and a coloured rim light on every sprite.
//
// Rules for everything built on this module:
//  - glow is a cached soft sprite (glowTexture), drawn with ADD blending: never live shadowBlur
//  - sprites stay PixelCanvas art (px.js); these helpers only add outline / rim / lit-edge passes
//  - a sprite may grow (outline, aura) but never changes its hitbox: draw around it
//  - CanvasTextures call refresh() once drawn, so they rebuild after a lost GPU context
import { mix, PixelCanvas, shade } from "./px.js";

/** The signature palette. */
export const NEON = {
  cyan: 0x3ef4ff,
  magenta: 0xff4fd8,
  gold: 0xffd23f,
  purple: 0xb45cff,
  green: 0x39ff88,
  red: 0xff3355,
  white: 0xffffff,
  navy: 0x050d18, // near-black navy: the backdrop of everything
  navy2: 0x0a1830,
  navy3: 0x132a4a,
  ink: 0x02060c, // the bold outline colour
};

/** Rarity looks: rim/aura colour per rarity (Common plain, Rare blue … ILLEGAL red/black). */
export const RARITY_NEON = {
  common: { rim: 0xbfe9ff, aura: null },
  rare: { rim: 0x4aa8ff, aura: 0x2f7bff },
  epic: { rim: 0xc77dff, aura: 0x9a3cff },
  legendary: { rim: 0xffd23f, aura: 0xffb000 },
  ultra: { rim: 0x3ef4ff, aura: 0x3ef4ff, animated: true },
  mega: { rim: 0xff4fd8, aura: 0xff4fd8, animated: true },
  illegal: { rim: 0xff2a3a, aura: 0xff1a2a, tape: true },
};

const OPAQUE = (pc, x, y) => pc.get(x, y) !== null;

/**
 * Bold outline: every transparent pixel touching the sprite becomes `color`.
 * (Same as PixelCanvas.outline, kept here so the remake has one place to tune it.)
 */
export function boldOutline(pc, color = NEON.ink, diagonal = true) {
  return pc.outline(color, 1, diagonal);
}

/**
 * Rim light: opaque pixels whose neighbour toward the light (default: up-right) is transparent
 * or outline get tinted toward `color`. `depth` pixels deep, fading. Works on outlined sprites:
 * the outline colour counts as "outside".
 */
export function rimLight(pc, color, { dx = 1, dy = -1, depth = 1, strength = 0.75, outline = NEON.ink } = {}) {
  const outside = (x, y) => !OPAQUE(pc, x, y) || pc.get(x, y) === outline;
  const hits = [];
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++) {
      if (outside(x, y)) continue;
      for (let d = 1; d <= depth; d++) {
        if (outside(x + dx * d, y) || outside(x, y + dy * d) || outside(x + dx * d, y + dy * d)) {
          hits.push([x, y, strength * (1 - (d - 1) / depth)]);
          break;
        }
      }
    }
  for (const [x, y, k] of hits) pc.set(x, y, mix(pc.get(x, y), color, k));
  return pc;
}

/** Lit top edge: the top `rows` opaque pixels of each column brighten (solid obstacles, tiles). */
export function litTopEdge(pc, { rows = 1, k = 0.45, color = null, outline = NEON.ink } = {}) {
  for (let x = 0; x < pc.w; x++) {
    let n = 0;
    for (let y = 0; y < pc.h && n < rows; y++) {
      const c = pc.get(x, y);
      if (c === null || c === outline) continue;
      pc.set(x, y, color === null ? shade(c, k) : mix(c, color, k));
      n++;
    }
  }
  return pc;
}

/**
 * The hero style pass (replaces the old white rim): grows the canvas by 1 px on each side (the
 * same as the old rim(), so hats, anchors and hitboxes line up exactly), adds the bold dark
 * outline, then a coloured rim light on the top-right edge.
 */
export function heroNeon(pc, rimColor = NEON.cyan, { depth = 1, strength = 0.7 } = {}) {
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  boldOutline(out, NEON.ink, true);
  rimLight(out, rimColor, { depth, strength });
  return out;
}

// ------------------------------------------------------------------ cached glow sprites
const hexs = (c) => `#${c.toString(16).padStart(6, "0")}`;

/**
 * A soft round glow (white-hot centre → colour → transparent), drawn once per colour/size and
 * cached as a texture. Draw it with blendMode ADD behind / around the thing that glows.
 * Returns the texture key.
 */
export function glowTexture(scene, color = NEON.cyan, size = 64, { core = 0.18 } = {}) {
  const key = `neonglow_${color.toString(16)}_${size}`;
  const tm = scene.textures;
  if (tm.exists(key)) return key;
  const tex = tm.createCanvas(key, size, size);
  const ctx = tex.getContext();
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const [R, G, B] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  g.addColorStop(0, `rgba(255,255,255,0.9)`);
  g.addColorStop(core, `rgba(${R},${G},${B},0.75)`);
  g.addColorStop(0.45, `rgba(${R},${G},${B},0.28)`);
  g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh(); // (keeps a copy of its pixels: rebuilt after a lost GPU context)
  return key;
}

/** A soft horizontal/vertical glow bar (beams, edges): 1 × size, fading at both ends. */
export function glowBarTexture(scene, color = NEON.cyan, size = 64, vertical = false) {
  const key = `neonbar_${color.toString(16)}_${size}_${vertical ? "v" : "h"}`;
  const tm = scene.textures;
  if (tm.exists(key)) return key;
  const w = vertical ? size : 4;
  const h = vertical ? 4 : size;
  const tex = tm.createCanvas(key, w, h);
  const ctx = tex.getContext();
  const g = vertical ? ctx.createLinearGradient(0, 0, size, 0) : ctx.createLinearGradient(0, 0, 0, size);
  const [R, G, B] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  g.addColorStop(0, `rgba(${R},${G},${B},0)`);
  g.addColorStop(0.4, `rgba(${R},${G},${B},0.35)`);
  g.addColorStop(0.5, `rgba(255,255,255,0.85)`);
  g.addColorStop(0.6, `rgba(${R},${G},${B},0.35)`);
  g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
}

/** Scanlines (1 dark line every `gap` px), tileable; draw full-screen at low alpha. Low Graphics: skip. */
export function scanlineTexture(scene, gap = 4) {
  const key = `neonscan_${gap}`;
  const tm = scene.textures;
  if (tm.exists(key)) return key;
  const tex = tm.createCanvas(key, 8, gap * 8);
  const ctx = tex.getContext();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (let y = 0; y < gap * 8; y += gap) ctx.fillRect(0, y, 8, 1);
  tex.refresh();
  return key;
}

// ------------------------------------------------------------------ hologram UI panels
/**
 * Chamfered (cut-corner) hologram panel with a neon rim, drawn into a Phaser Graphics.
 * opts: cut (corner size), fill / fillAlpha, rim colour, rimW, inner (second faint rim),
 * ticks (tick-mark underline along the bottom edge).
 */
export function chamferPanel(g, x, y, w, h, opts = {}) {
  const {
    cut = Math.min(18, w / 6, h / 3),
    fill = NEON.navy,
    fillAlpha = 0.86,
    rim = NEON.cyan,
    rimW = 2,
    rimAlpha = 1,
    inner = true,
    ticks = false,
  } = opts;
  const pts = [
    [x + cut, y],
    [x + w, y],
    [x + w, y + h - cut],
    [x + w - cut, y + h],
    [x, y + h],
    [x, y + cut],
  ];
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  };
  g.fillStyle(fill, fillAlpha);
  path();
  g.fillPath();
  if (inner) {
    // faint inner rim, 4 px in
    const k = 4;
    g.lineStyle(1, rim, 0.25 * rimAlpha);
    g.beginPath();
    g.moveTo(x + cut + k * 0.4, y + k);
    g.lineTo(x + w - k, y + k);
    g.lineTo(x + w - k, y + h - cut - k * 0.4);
    g.lineTo(x + w - cut - k * 0.4, y + h - k);
    g.lineTo(x + k, y + h - k);
    g.lineTo(x + k, y + cut + k * 0.4);
    g.closePath();
    g.strokePath();
  }
  g.lineStyle(rimW, rim, rimAlpha);
  path();
  g.strokePath();
  if (ticks) {
    const n = Math.max(4, Math.floor(w / 14));
    g.lineStyle(1, rim, 0.6 * rimAlpha);
    for (let i = 1; i < n; i++) {
      const tx = x + (w * i) / n;
      g.lineBetween(tx, y + h + 3, tx, y + h + (i % 4 === 0 ? 9 : 6));
    }
    g.lineBetween(x, y + h + 3, x + w, y + h + 3);
  }
  return g;
}

export const neonHex = hexs;
