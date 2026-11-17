// Oblivion GP HUD, drawn on the race canvas in screen space (no DOM layout work per frame), in the
// lobby's neon space style: techno lettering (Chakra Petch / Barlow Semi Condensed), dark glass with
// thin cyan / violet / magenta rims, soft glows, no cartoon yellow and no thick ink outlines.
// Position, lap + lap timer + best lap, speedometer + boost / drift meter, held item, weapon
// cooldown, minimap frame (leader highlighted for everyone), mode info, countdown, wrong-way,
// wrecked, banners, missile lock warning, feed, the steering joystick (+ the first-race STEER hint
// and the steering arrow on your car), the touch buttons and RESET. Safe-area aware.
// Glows and lettering are pre-rendered into small sprites (once per string / size / colour): the
// per-frame work is drawImage, a few arcs and lines.
import { FLAG } from './protocol.js';
import { DRIVERS, driftTier, KMH } from './physics.js';
import { BASE_LOOKS } from './looks2.js'; // (every car's signature neon, the unlockable ones too)
import { WEAPONS, ITEMS, ITEM_IDS, itemStat, weaponCd } from './items.js';
import { SETTINGS, pulse } from '../settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
// the lobby's palette (ui/space/space.css, race.css .rc-wait)
export const NEON = { cyan: '#34e7ff', ice: '#7ff3ff', violet: '#a77bff', mag: '#ff3fb8', red: '#ff4d6d', lime: '#5ff4c8', text: '#e9f6ff', dim: '#93a6cf' };
const HALO = 'rgba(4,8,24,0.8)'; // a thin dark edge behind lettering, for any track colour
const GLASS = 'rgba(8,14,40,0.5)';
// the older cartoon colours the race code still passes for banners and the feed, shown in the neon palette
const RECOL = { '#ffd23f': NEON.ice, '#ff9f43': NEON.mag, '#ff9f1c': NEON.mag, '#5ef2c6': NEON.lime, '#c9b8ff': NEON.dim, '#ff5f5f': NEON.red, '#ff7a7a': NEON.red, '#ff3b3b': NEON.red, '#fff': '#ffffff' };
const nc = (c) => RECOL[c] || c;
const DISP = '"Chakra Petch", "Eurostile", "Segoe UI", system-ui, sans-serif';
const NARROW = '"Barlow Semi Condensed", "Roboto Condensed", "Arial Narrow", "Segoe UI", system-ui, sans-serif';
const ORD = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
export const fmtTime = (s) => { if (s == null || !(s >= 0)) return '--:--.-'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`; };
// drift charge tiers: the spark colours (none, blue, orange, purple)
const TIER_COL = ['#ffffff', '#3a86ff', '#ff8a3d', '#c04dff'];

// font strings per family + size (setting ctx.font re-parses it, so only set it when it changes).
// fam: 'd' the squared display face (numbers, titles), 'n' the narrow face (small labels).
const FONTS = new Map();
const famOf = (size, fam) => fam || (size >= 18 ? 'd' : 'n');
const fontOf = (size, fam) => { const k = size * 2 + (fam === 'd' ? 1 : 0); let f = FONTS.get(k); if (!f) FONTS.set(k, (f = `700 ${size}px ${fam === 'd' ? DISP : NARROW}`)); return f; };
// lettering drawn live (strings that change every frame: the lap timer, the feed): a thin dark edge
export function text(g, s, x, y, size, col, align = 'left', lw = 0, fam) {
  const f = fontOf(size, famOf(size, fam));
  if (g.__font !== f) { g.font = f; g.__font = f; }
  g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = Math.min(lw || 99, Math.max(2, size * 0.1)); g.strokeStyle = HALO;
  g.strokeText(s, x, y); g.fillStyle = nc(col); g.fillText(s, x, y);
}
// lettering with a soft neon glow, pre-rendered once per (string, size, colour) and blitted
const SPR = new Map();
function sprite(s, size, col, dpr, fam) {
  fam = famOf(size, fam); col = nc(col);
  let a = SPR.get(s); if (!a) SPR.set(s, (a = new Map()));
  const k = size * 10000 + Math.round(dpr * 100) * 2 + (fam === 'd' ? 1 : 0); // (numbers: no string building per call)
  let b = a.get(k); if (!b) a.set(k, (b = new Map()));
  let cv = b.get(col);
  if (!cv) {
    if (SPR.size > 300) SPR.clear();
    cv = document.createElement('canvas');
    const m = cv.getContext('2d'); m.font = fontOf(size, fam);
    const pad = size * 0.45, w = Math.ceil(m.measureText(s).width + pad * 2), h = Math.ceil(size * 1.7);
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr); cv.w = w; cv.h = h; cv.pad = pad;
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.font = fontOf(size, fam); c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.shadowColor = col; c.shadowBlur = size * 0.45; c.fillStyle = col; c.globalAlpha = 0.55; c.fillText(s, pad, h / 2); // the glow
    c.shadowBlur = 0; c.globalAlpha = 1; c.lineWidth = Math.max(1.5, size * 0.09); c.strokeStyle = HALO; c.strokeText(s, pad, h / 2);
    c.fillStyle = col === '#ffffff' ? '#ffffff' : mix(col); c.fillText(s, pad, h / 2);
    b.set(col, cv);
  }
  return cv;
}
// the letter fill: the neon colour lifted toward white, so it reads as lit
const MIX = new Map();
function mix(col) {
  let m = MIX.get(col);
  if (!m) { const n = parseInt(col.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255, f = (v) => Math.round(v + (255 - v) * 0.35); MIX.set(col, (m = `rgb(${f(r)},${f(gg)},${f(b)})`)); }
  return m;
}
export function label(g, s, x, y, size, col, align = 'left', dpr = 1, fam, scale = 1) {
  const cv = sprite(s, size, col, dpr, fam), w = cv.w * scale, h = cv.h * scale, p = cv.pad * scale;
  const ox = align === 'center' ? w / 2 : align === 'right' ? w - p : p;
  g.drawImage(cv, x - ox, y - h / 2, w, h);
  return (cv.w - cv.pad * 2) * scale;
}
// the web fonts arrive after the first frames: drop the sprites drawn in a fallback face
if (typeof document !== 'undefined' && document.fonts) {
  const fresh = () => { SPR.clear(); };
  document.fonts.addEventListener?.('loadingdone', fresh);
  for (const f of ['700 20px "Chakra Petch"', '700 14px "Barlow Semi Condensed"']) document.fonts.load?.(f).then(fresh, () => {});
}
// memoised strings for numbers that change rarely (no string building per frame)
const memo = new Map();
const str = (k, v, fn) => { let m = memo.get(k); if (!m) memo.set(k, (m = new Map())); let s = m.get(v); if (s === undefined) { if (m.size > 200) m.clear(); m.set(v, (s = fn(v))); } return s; };
// a glass panel with two cut corners (top left, bottom right), like the lobby's cards
const cut = (g, x, y, w, h, c) => { g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x, y + h); g.lineTo(x, y + c); g.closePath(); };
function glass(g, x, y, w, h, c, rim = 'rgba(52,231,255,0.55)', fill = GLASS) {
  cut(g, x, y, w, h, c); g.fillStyle = fill; g.fill(); g.lineWidth = 1.25; g.strokeStyle = rim; g.stroke();
}
const hexPath = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9) : g.moveTo(x + r, y); } g.closePath(); };
// item level pips (level 2 and 3 items), neon
function pips(g, x, y, lvl, u) {
  if (!(lvl > 1)) return;
  for (let i = 0; i < lvl; i++) { g.beginPath(); g.arc(x + (i - (lvl - 1) / 2) * 8 * u, y, 2.6 * u, 0, TAU); g.fillStyle = lvl === 3 ? NEON.mag : NEON.cyan; g.fill(); }
}
const INK = '#0a0f2e'; // the icons' own thin edge
// small vector icons for the items (size ~ s px)
const BOLT_ENDS = [[-14, -10], [14, 8]], ROTOR_XY = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
export function itemIcon(g, id, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 40, s / 40); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 2.2; g.strokeStyle = INK;
  switch (id) {
    case 'missile': g.rotate(-0.6); g.fillStyle = '#e8e2d2'; g.beginPath(); g.moveTo(16, 0); g.lineTo(8, -6); g.lineTo(-12, -6); g.lineTo(-12, 6); g.lineTo(8, 6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(16, 0); g.lineTo(8, -6); g.lineTo(8, 6); g.closePath(); g.fill(); for (const k of [-1, 1]) { g.beginPath(); g.moveTo(-6, k * 6); g.lineTo(-14, k * 13); g.lineTo(-14, k * 6); g.closePath(); g.fill(); g.stroke(); } g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-12, -3); g.lineTo(-20, 0); g.lineTo(-12, 3); g.fill(); break;
    case 'oil': g.fillStyle = '#1a1622'; g.beginPath(); g.ellipse(0, 6, 17, 9, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -16); g.quadraticCurveTo(9, -4, 0, 2); g.quadraticCurveTo(-9, -4, 0, -16); g.fill(); g.stroke(); g.fillStyle = '#c04dff'; g.beginPath(); g.ellipse(-5, 4, 6, 2.5, -0.3, 0, TAU); g.fill(); break;
    case 'shield': g.fillStyle = '#5ff4ff'; g.beginPath(); g.moveTo(0, -17); g.lineTo(14, -10); g.quadraticCurveTo(13, 9, 0, 17); g.quadraticCurveTo(-13, 9, -14, -10); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#e8ffff'; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, -7); g.quadraticCurveTo(7, 5, 0, 10); g.closePath(); g.fill(); break;
    case 'rockets': for (const k of [-10, 0, 10]) { g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(k, -16); g.lineTo(k + 5, -7); g.lineTo(k + 5, 10); g.lineTo(k - 5, 10); g.lineTo(k - 5, -7); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(k - 3, 11); g.lineTo(k, 17); g.lineTo(k + 3, 11); g.fill(); } break;
    case 'emp': g.fillStyle = '#3a86ff'; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#c9fbff'; g.lineWidth = 3; g.beginPath(); g.moveTo(3, -12); g.lineTo(-5, 1); g.lineTo(3, 1); g.lineTo(-3, 12); g.stroke(); break;
    case 'turbo': g.fillStyle = '#5ff4ff'; for (const k of [-9, 3]) { g.beginPath(); g.moveTo(k - 6, -14); g.lineTo(k + 8, 0); g.lineTo(k - 6, 14); g.lineTo(k - 1, 0); g.closePath(); g.fill(); g.stroke(); } break;
    // the five newer pickups (original drawings)
    case 'lightning': g.fillStyle = '#9fd8ff'; g.beginPath(); g.moveTo(6, -17); g.lineTo(-8, 1); g.lineTo(0, 1); g.lineTo(-6, 17); g.lineTo(9, -3); g.lineTo(1, -3); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ffffff'; for (const [x, y] of BOLT_ENDS) { g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); g.stroke(); } break;
    case 'gravity': g.fillStyle = '#12081e'; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#b98cff'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, 11 - k * 3.5, k * 2.1, k * 2.1 + 3.6); g.stroke(); } g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 2.5, 0, TAU); g.fill(); break;
    case 'ghost': g.fillStyle = '#e8f2ff'; g.beginPath(); g.moveTo(-13, 15); g.lineTo(-13, -3); g.quadraticCurveTo(-13, -17, 0, -17); g.quadraticCurveTo(13, -17, 13, -3); g.lineTo(13, 15); g.lineTo(8, 10); g.lineTo(4, 15); g.lineTo(0, 10); g.lineTo(-4, 15); g.lineTo(-8, 10); g.closePath(); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(-5, -4, 2.8, 0, TAU); g.arc(5, -4, 2.8, 0, TAU); g.fill(); break;
    case 'sticky': g.fillStyle = '#7dff5a'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, r = 12 + (k % 2) * 4; k ? g.lineTo(Math.cos(a) * r, 3 + Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, 3 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#26332a'; g.beginPath(); g.arc(0, 3, 7, 0, TAU); g.fill(); g.strokeStyle = '#ffb347'; g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(6, -16, 10, -15); g.stroke(); g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(11, -15, 2.5, 0, TAU); g.fill(); break;
    case 'drone': g.fillStyle = 'rgba(160,200,255,0.5)'; for (const [x, y] of ROTOR_XY) { g.beginPath(); g.arc(x, y, 6.5, 0, TAU); g.fill(); g.stroke(); } g.lineWidth = 3; g.beginPath(); g.moveTo(-11, -11); g.lineTo(11, 11); g.moveTo(11, -11); g.lineTo(-11, 11); g.stroke(); g.fillStyle = '#4a5466'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(2, 0, 2.6, 0, TAU); g.fill(); break;
    case 'spikes': g.fillStyle = '#4a4d58'; g.fillRect(-17, -2, 34, 10); g.strokeRect(-17, -2, 34, 10); g.fillStyle = '#e8e2d2'; g.beginPath(); for (let k = -15; k < 14; k += 8) { g.moveTo(k, -2); g.lineTo(k + 4, -14); g.lineTo(k + 8, -2); } g.fill(); g.stroke(); break;
  }
  g.restore();
}
// the driver's weapon icon
const WEAPON_ICON = { arc: 'volt', pulse: 'brick', rail: 'wisp', mine: 'dune', turret: 'rook', blink: 'flicker' };
export function weaponIcon(g, id, x, y, s, col) {
  g.save(); g.translate(x, y); g.scale(s / 40, s / 40); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4;
  switch (WEAPON_ICON[(WEAPONS[id] || WEAPONS.volt).kind] || id) { // (the unlockable cars: the icon of their weapon's kind)
    case 'volt': g.beginPath(); g.moveTo(-14, -4); g.lineTo(-6, 6); g.lineTo(0, -6); g.lineTo(6, 6); g.lineTo(14, -4); g.stroke(); break;
    case 'brick': for (const r of [6, 12, 17]) { g.beginPath(); g.arc(0, 0, r, -1, 1); g.stroke(); } break;
    case 'wisp': g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.stroke(); g.beginPath(); g.moveTo(10, -6); g.lineTo(17, 0); g.lineTo(10, 6); g.stroke(); break;
    case 'dune': g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill(); break;
    case 'rook': g.beginPath(); g.arc(0, 4, 9, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(13, -9); g.stroke(); g.beginPath(); g.moveTo(-12, 8); g.lineTo(12, 8); g.stroke(); break;
    case 'flicker': g.beginPath(); g.arc(-4, 6, 16, -1.4, -0.2); g.stroke(); g.beginPath(); g.moveTo(-14, 10); g.lineTo(14, -10); g.lineWidth = 2; g.stroke(); break;
  }
  g.restore();
}

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const canvas = (w, h, dpr) => { const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g]; };

export class Hud {
  constructor() {
    this.banners = []; // {text, sub, col, t, life}
    this.feed = []; // {text, col, t}
    this.roll = 0; // item roulette time left
    this.wrongT = 0;
    this.lastCount = 99;
    this.split = null; // {text, col, t}
    this.call = null; // kill-cam callout {text, col, t}
    this.spr = new Map(); // pre-rendered pieces: ring, gauge face, button bases, corner fade
  }
  // the short kill-cam callout ('NAME TOOK OUT NAME') under the slots
  callout(text, col = '#ffffff') { this.call = { text, col, t: 0 }; }
  banner(text, sub = '', col = NEON.ice, life = 1.8) { this.banners.push({ text, sub, col, t: 0, life }); if (this.banners.length > 3) this.banners.shift(); }
  log(text, col = '#fff') { this.feed.push({ text, col, t: 0 }); if (this.feed.length > 4) this.feed.shift(); }
  // a cached sprite (key -> canvas); paint(g) draws it once
  piece(key, w, h, dpr, paint) {
    let c = this.spr.get(key);
    if (!c) {
      if (this.spr.size > 40) this.spr.delete(this.spr.keys().next().value);
      const [cv, g] = canvas(w, h, dpr); cv.w = w; cv.h = h; paint(g); this.spr.set(key, (c = cv));
    }
    return c;
  }

  draw(g, S) {
    const { W, H, SA, dpr, view, me, rc, ctrl, dt, t, mode } = S;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const u = clamp(Math.min(H / 375, W / 667), 0.8, 1.6);
    const L = SA.l + 12, Tp = SA.t + 8, d = dpr;
    const car = view.cars.find((c) => c.me);
    const n = view.ranks.length || view.cars.length;
    const battle = mode === 'battle', trial = mode === 'trial';
    if (this.roll > 0) this.roll -= dt;
    // -------- position + lap block (top left; the tutorial has SKIP there instead)
    if (me && !S.tut) {
      const rk = me.out || me.fin || me.rk || 1, first = rk === 1, x = L + 7 * u;
      // a soft dark fade in the corner so the lettering reads over any track
      const fw = Math.round(190 * u), fh = Math.round(130 * u);
      const fade = this.piece(`fade${fw}x${fh}@${d}`, fw, fh, d, (c) => {
        const gr = c.createRadialGradient(0, 0, 0, 0, 0, fw); gr.addColorStop(0, 'rgba(5,8,22,0.62)'); gr.addColorStop(0.55, 'rgba(5,8,22,0.3)'); gr.addColorStop(1, 'rgba(5,8,22,0)');
        c.scale(1, fh / fw); c.fillStyle = gr; c.fillRect(0, 0, fw, fw);
      });
      g.drawImage(fade, SA.l, SA.t, fw, fh);
      const w1 = label(g, str('n', rk, String), x - 3 * u, Tp + 22 * u, Math.round(40 * u), first ? NEON.mag : NEON.text, 'left', d, 'd');
      label(g, ORD(rk), x + w1 + 1 * u, Tp + 12 * u, Math.round(15 * u), first ? NEON.mag : NEON.cyan, 'left', d, 'd');
      label(g, str('of', n, (v) => '/' + v), x + w1 + 1 * u, Tp + 30 * u, Math.round(13 * u), NEON.dim, 'left', d, 'n');
      let y = Tp + 54 * u;
      if (battle) { label(g, str('td', me.k, (v) => 'TAKEDOWNS ' + v), x, y, Math.round(14 * u), NEON.mag, 'left', d, 'n'); y += 20 * u; }
      else if (view.hud && view.hud.laps) {
        const laps = view.hud.laps, lap = clamp(me.lap, 1, laps), wl = label(g, 'LAP', x, y, Math.round(12 * u), NEON.dim, 'left', d, 'n');
        label(g, str('lap', lap * 100 + laps, () => `${lap}/${laps}`), x + wl + 5 * u, y, Math.round(17 * u), lap === laps ? NEON.mag : NEON.text, 'left', d, 'd'); y += 19 * u;
        text(g, fmtTime(me.lt), x, y, Math.round(14 * u), NEON.text, 'left', 0, 'd'); y += 16 * u;
        label(g, str('bl', me.bl || 0, (v) => `BEST ${v ? fmtTime(v) : '--'}`), x, y, Math.round(11 * u), NEON.dim, 'left', d, 'n'); y += 14 * u;
      } else if (mode === 'elim') { label(g, str('left', view.hud?.left ?? n, (v) => v + ' LEFT'), x, y, Math.round(14 * u), NEON.text, 'left', d, 'n'); y += 20 * u; }
      // the accent bar down the block's left edge (magenta when you lead)
      g.fillStyle = first ? NEON.mag : NEON.cyan; g.globalAlpha = 0.85; g.fillRect(L, Tp + 4 * u, 2 * u, y - Tp - 14 * u); g.globalAlpha = 1;
      // feed under the block
      for (let i = 0; i < this.feed.length; i++) {
        const f = this.feed[i]; f.t += dt;
        g.globalAlpha = clamp(3.5 - f.t, 0, 1);
        text(g, f.text, x, y + 4 * u + i * 16 * u, Math.round(12 * u), f.col, 'left', 0, 'n');
      }
      g.globalAlpha = 1;
      while (this.feed.length && this.feed[0].t > 3.5) this.feed.shift();
    }
    // -------- item + weapon slots (top centre). Touch screens show them on the ITEM and FIRE
    // buttons instead, so the top of the road stays clear.
    const cx = W / 2, slot = 42 * u;
    const slots = !!me && !trial && !me.out && ctrl.mode !== 'touch'; // (a spectator has no slots)
    if (slots) {
      const ix = cx - slot - 6 * u, iy = Tp, hold = me.item || this.roll > 0;
      glass(g, ix, iy, slot, slot, 8 * u, hold ? 'rgba(167,123,255,0.9)' : 'rgba(147,166,207,0.4)', hold ? 'rgba(60,30,110,0.55)' : GLASS);
      if (this.roll > 0) itemIcon(g, ITEM_IDS[Math.floor(t * 18) % ITEM_IDS.length], ix + slot / 2, iy + slot / 2, slot * 0.62);
      else if (me.item) { itemIcon(g, me.item, ix + slot / 2, iy + slot / 2 - (me.il > 1 ? 3 * u : 0), slot * 0.62); pips(g, ix + slot / 2, iy + slot - 6 * u, me.il, u); }
      label(g, 'K', ix + slot - 6 * u, iy + slot - 7 * u, Math.round(10 * u), NEON.dim, 'center', d, 'n');
      // weapon: a glass hex, lit cyan when ready, a violet sweep while it recharges
      const wid = rc.myDriver(), w = WEAPONS[wid], wx = cx + 6 * u + slot / 2, wy = Tp + slot / 2, r = slot / 2;
      const cd = me.em > 0 ? 1 : w ? clamp(me.wc / weaponCd(wid, DRIVERS[wid]), 0, 1) : 0;
      hexPath(g, wx, wy, r); g.fillStyle = cd > 0 ? GLASS : 'rgba(52,231,255,0.22)'; g.fill(); g.lineWidth = cd > 0 ? 1.25 : 2; g.strokeStyle = cd > 0 ? 'rgba(147,166,207,0.5)' : NEON.cyan; g.stroke();
      if (cd > 0) { g.beginPath(); g.arc(wx, wy, r * 0.82, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd)); g.lineWidth = 2.5 * u; g.strokeStyle = NEON.violet; g.stroke(); }
      weaponIcon(g, wid, wx, wy, slot * 0.55, cd > 0 ? NEON.dim : NEON.ice);
      if (me.em > 0) label(g, 'EMP', wx, wy, Math.round(13 * u), NEON.cyan, 'center', d, 'd'); // shut down: shown on the slot itself
      else label(g, 'J', wx + r - 4 * u, wy + r - 4 * u, Math.round(10 * u), NEON.dim, 'center', d, 'n');
    }
    // -------- mode info pill (under the slots)
    let pill = null, pillCol = NEON.text;
    const md = view.hud || {};
    if (mode === 'elim' && md.nx != null && view.countdown <= 0) { pill = str(md.duel ? 'duel' : 'cut', Math.ceil(md.nx), (v) => (md.duel ? `FINAL DUEL · CUT IN ${v}` : `CUT IN ${v}`)); pillCol = md.nx < 5 || (me && md.dg === rc.id) ? NEON.red : NEON.text; }
    else if (battle && md.tl != null) { pill = str('tl', Math.ceil(md.tl), (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); pillCol = md.tl < 15 ? NEON.red : NEON.text; }
    else if (md.ft != null) { pill = str('ft', Math.ceil(md.ft), (v) => `FINISH CLOSES ${v}`); pillCol = NEON.mag; }
    else if (trial && S.bestTime) { pill = str('bt', S.bestTime, (v) => `BEST ${fmtTime(v)}`); pillCol = NEON.dim; }
    const py = slots ? Tp + slot + 16 * u : Tp + 14 * u;
    if (pill) {
      const sz = Math.round(14 * u), cv = sprite(pill, sz, pillCol, d, 'd'), w = cv.w - cv.pad * 2 + 24 * u;
      glass(g, cx - w / 2, py - 12 * u, w, 24 * u, 7 * u, pillCol === NEON.red ? 'rgba(255,77,109,0.8)' : 'rgba(52,231,255,0.5)');
      label(g, pill, cx, py, sz, pillCol, 'center', d, 'd');
    }
    if (this.split) {
      this.split.t += dt;
      g.globalAlpha = clamp(3 - this.split.t, 0, 1);
      label(g, this.split.text, cx, py + (pill ? 30 : 14) * u, Math.round(17 * u), this.split.col, 'center', d, 'd');
      g.globalAlpha = 1;
      if (this.split.t > 3) this.split = null;
    }
    // -------- minimap (top right)
    this.minimap(g, S, u, car);
    // -------- speedometer + boost / drift meter (bottom centre; the credit sits just below)
    if (car && !(car.f & FLAG.DEAD)) this.gaugeDraw(g, S, u, car, cx);
    // -------- the steering arrow on your car, touch buttons, joystick, RESET
    if (ctrl.mode === 'touch' && !(me && me.out)) { this.arrow(g, S, u, car); this.buttons(g, S, u); }
    else if (S.hint > 0) this.keysHint(g, S, u);
    this.menuButton(g, S);
    if (me && !me.fin && !me.out) this.resetButton(g, S, u);
    // -------- centre overlays
    this.center(g, S, u, car);
  }

  // a thin neon arc dial: the face (disc, track, ticks) is a sprite; the speed arc and number are live
  gaugeDraw(g, S, u, car, cx) {
    const { H, SA, rc, dpr } = S, spd = car.spd, top = DRIVERS[rc.myDriver()]?.top || 800;
    // (the arc's lowest point is ~0.6 R under its centre; the credit line takes the bottom 18 px)
    const R = 30 * u, gx = cx, gy = H - SA.b - 20 - R * 0.75, A0 = Math.PI * 0.8, SW = Math.PI * 1.4;
    this.gauge = { x: gx, y: gy, r: R + 9 * u, bottom: gy + R * 0.75 };
    const e = R + 8 * u, face = this.piece(`gauge${Math.round(R * 10)}@${dpr}`, e * 2, e * 2, dpr, (c) => {
      c.translate(e, e);
      const gr = c.createRadialGradient(0, 0, R * 0.2, 0, 0, R + 4 * u); gr.addColorStop(0, 'rgba(8,14,40,0.62)'); gr.addColorStop(1, 'rgba(8,14,40,0.18)');
      c.beginPath(); c.arc(0, 0, R + 3 * u, 0, TAU); c.fillStyle = gr; c.fill();
      c.beginPath(); c.arc(0, 0, R, A0, A0 + SW); c.lineWidth = 3 * u; c.strokeStyle = 'rgba(147,166,207,0.25)'; c.lineCap = 'round'; c.stroke();
      c.lineCap = 'butt'; c.strokeStyle = 'rgba(147,166,207,0.55)'; c.lineWidth = 1;
      for (let i = 0; i <= 10; i++) { const a = A0 + (SW * i) / 10, r0 = R + 4 * u, r1 = R + (i % 5 ? 6 : 8) * u; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke(); }
    });
    g.drawImage(face, gx - e, gy - e, e * 2, e * 2);
    const kk = clamp(spd / (top * 1.4), 0, 1), boost = car.f & FLAG.BOOST, col = boost ? NEON.ice : spd > top * 0.95 ? NEON.mag : NEON.cyan;
    if (kk > 0.01) {
      const a1 = A0 + SW * kk;
      g.lineCap = 'round'; g.strokeStyle = col;
      g.globalAlpha = 0.25; g.lineWidth = 8 * u; g.beginPath(); g.arc(gx, gy, R, A0, a1); g.stroke(); // glow
      g.globalAlpha = 1; g.lineWidth = 3.2 * u; g.beginPath(); g.arc(gx, gy, R, A0, a1); g.stroke();
      g.lineCap = 'butt';
      g.beginPath(); g.arc(gx + Math.cos(a1) * R, gy + Math.sin(a1) * R, 2.4 * u, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    }
    // (the speed changes every frame: drawn live, not as a new glow sprite per number)
    text(g, str('kmh', Math.round(spd * KMH), String), gx, gy - 3 * u, Math.round(24 * u), NEON.text, 'center', 0, 'd');
    label(g, 'KM/H', gx, gy + 14 * u, Math.round(9 * u), NEON.dim, 'center', dpr, 'n');
    // drift charge (tier colours, with the tier marks) or boost left: a thin bar over the dial
    const c = rc.car;
    if (c && (c.drift || c.boostT > 0)) {
      const dc = car.predicted ? c.dc : 0, tier = driftTier(dc), k = c.drift ? clamp(dc / 2.2, 0, 1) : clamp(c.boostT / 1.6, 0, 1);
      const bw = 84 * u, bh = 4 * u, bx = gx - bw / 2, yy = gy - R - 16 * u;
      rr(g, bx, yy, bw, bh, bh / 2); g.fillStyle = 'rgba(8,14,40,0.7)'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(147,166,207,0.4)'; g.stroke();
      if (k > 0) { const f = c.drift ? TIER_COL[tier] : NEON.ice; g.globalAlpha = 0.3; rr(g, bx - 2, yy - 2, bw * k + 4, bh + 4, bh); g.fillStyle = f; g.fill(); g.globalAlpha = 1; rr(g, bx, yy, bw * k, bh, bh / 2); g.fill(); }
      if (c.drift) { g.fillStyle = 'rgba(4,8,24,0.9)'; for (const f of [0.7 / 2.2, 1.4 / 2.2]) g.fillRect(bx + bw * f - 1, yy - 1, 2, bh + 2); }
    }
  }

  minimap(g, S, u, car) {
    const { W, SA, dpr, view, art } = S;
    const size = Math.round(clamp(S.H * 0.34, 96, 180));
    // (the column right of it holds the pause and RESET buttons)
    const m = art.minimap(size, dpr), x = W - SA.r - 32 - 2 * S.ctrl.btn.reset.r1 - size, y = SA.t + 6;
    g.drawImage(m.cv, x, y, size, size);
    // a thin neon frame: four corner brackets
    const b = 12 * u;
    g.beginPath();
    g.moveTo(x, y + b); g.lineTo(x, y); g.lineTo(x + b, y);
    g.moveTo(x + size - b, y); g.lineTo(x + size, y); g.lineTo(x + size, y + b);
    g.moveTo(x + size, y + size - b); g.lineTo(x + size, y + size); g.lineTo(x + size - b, y + size);
    g.moveTo(x + b, y + size); g.lineTo(x, y + size); g.lineTo(x, y + size - b);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(52,231,255,0.7)'; g.stroke();
    const k = m.k, ox = x + m.ox, oy = y + m.oy;
    g.lineWidth = 1; g.strokeStyle = 'rgba(4,8,24,0.85)';
    for (const c of view.cars) {
      if (c.f & FLAG.DEAD || c.me) continue;
      const px = ox + c.x * k, py = oy + c.y * k;
      g.beginPath(); g.arc(px, py, 3, 0, TAU); g.fillStyle = (BASE_LOOKS[S.rc.roster.get(c.id)?.driver] || BASE_LOOKS.volt).neon; g.fill(); g.stroke(); // each car's signature neon
    }
    // the leader (bounty) is shown to everyone: a gold ring and crown, like the leader's glow on the track
    const ld = view.leader ? view.cars.find((c) => c.id === view.leader) : null;
    if (ld) {
      const px = ox + ld.x * k, py = oy + ld.y * k, pr = SETTINGS.reduceFlash ? 7 : 6 + Math.sin(S.t * 6) * 1.5;
      g.beginPath(); g.arc(px, py, pr, 0, TAU); g.lineWidth = 2; g.strokeStyle = '#ffd23f'; g.stroke();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(px - 5, py - 7); g.lineTo(px - 5, py - 12); g.lineTo(px - 2, py - 9); g.lineTo(px, py - 13); g.lineTo(px + 2, py - 9); g.lineTo(px + 5, py - 12); g.lineTo(px + 5, py - 7); g.closePath(); g.fill();
    }
    if (car) {
      const px = ox + car.x * k, py = oy + car.y * k;
      g.save(); g.translate(px, py); g.rotate(car.a);
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-3, 0); g.lineTo(-5, 5); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NEON.cyan; g.stroke();
      g.restore();
    }
  }

  menuButton(g, S) {
    const b = S.ctrl.btn.menu;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fillStyle = GLASS; g.fill(); g.lineWidth = 1.25; g.strokeStyle = 'rgba(52,231,255,0.6)'; g.stroke();
    g.fillStyle = NEON.text; g.fillRect(b.x - 5, b.y - 6, 3, 12); g.fillRect(b.x + 2, b.y - 6, 3, 12);
  }

  // a round glass button base (sprite per size / colour / pressed): a dark see-through disc and a thin neon rim
  base(B, col, S) {
    const r = B.r, e = r + 6, key = `b${Math.round(r * 10)}${col}${B.down ? 1 : 0}@${S.dpr}`;
    return this.piece(key, e * 2, e * 2, S.dpr, (c) => {
      c.translate(e, e);
      c.beginPath(); c.arc(0, 0, r - 1, 0, TAU);
      if (B.down) { c.fillStyle = col; c.globalAlpha = 0.34; c.fill(); } else { c.fillStyle = 'rgba(8,14,40,0.34)'; c.fill(); }
      c.strokeStyle = col; c.globalAlpha = B.down ? 0.45 : 0.18; c.lineWidth = 5; c.stroke(); // soft glow
      c.globalAlpha = B.down ? 1 : 0.85; c.lineWidth = 1.6; c.stroke();
      c.globalAlpha = 0.25; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r - 5, 0, TAU); c.stroke();
    });
  }
  buttons(g, S, u) {
    const { ctrl, me, rc, dpr } = S, b = ctrl.btn;
    const btn = (B, name, col, icon) => {
      const s = this.base(B, col, S), e = s.w / 2;
      g.drawImage(s, B.x - e, B.y - e, e * 2, e * 2);
      if (icon) icon(); else label(g, name, B.x, B.y, Math.round(Math.max(11, B.r * 0.36)), B.down ? '#ffffff' : col, 'center', dpr, 'd');
    };
    // DRIFT: cyan; while drifting, the charge tier's colour and a ring that fills with the charge
    const c = rc.car, tier = c ? driftTier(c.dc) : 0, drifting = !!(c && c.drift);
    btn(b.drift, 'DRIFT', drifting && tier ? TIER_COL[tier] : NEON.cyan);
    if (drifting) { const k = clamp(c.dc / 2.2, 0, 1); g.beginPath(); g.arc(b.drift.x, b.drift.y, b.drift.r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.lineWidth = 3; g.strokeStyle = TIER_COL[tier] === '#ffffff' ? NEON.ice : TIER_COL[tier]; g.stroke(); }
    btn(b.brake, 'BRAKE', NEON.red);
    // FIRE: the weapon icon, magenta when ready; a violet sweep while it recharges
    const wid = rc.myDriver(), w = WEAPONS[wid], cd = me ? (me.em > 0 ? 1 : w ? clamp(me.wc / weaponCd(wid, DRIVERS[wid]), 0, 1) : 0) : 0;
    const fc = cd > 0 ? '#7d86b3' : NEON.mag;
    btn(b.fire, 'FIRE', fc, () => {
      const F = b.fire;
      weaponIcon(g, wid, F.x, F.y - F.r * 0.16, F.r * 0.78, cd > 0 ? NEON.dim : '#ffd6ef');
      label(g, me && me.em > 0 ? 'EMP' : 'FIRE', F.x, F.y + F.r * 0.45, Math.round(Math.max(10, F.r * 0.3)), cd > 0 ? NEON.dim : NEON.mag, 'center', dpr, 'n');
      if (cd > 0) { g.beginPath(); g.arc(F.x, F.y, F.r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd)); g.lineWidth = 3; g.strokeStyle = NEON.violet; g.stroke(); }
    });
    // ITEM: what you hold (and the roulette while a box rolls), violet
    const hold = !!(me && (me.item || this.roll > 0));
    btn(b.item, 'ITEM', hold ? NEON.violet : '#6f78a6', () => {
      const I = b.item;
      if (this.roll > 0) itemIcon(g, ITEM_IDS[Math.floor(S.t * 18) % ITEM_IDS.length], I.x, I.y, I.r * 1.0);
      else if (me && me.item) { itemIcon(g, me.item, I.x, I.y - I.r * 0.1, I.r * 1.0); pips(g, I.x, I.y + I.r * 0.62, me.il, u); }
      else label(g, 'ITEM', I.x, I.y, Math.round(Math.max(10, I.r * 0.34)), '#6f78a6', 'center', dpr, 'n');
    });
    this.joystick(g, S, u);
    // the tutorial points at the button its step needs
    const fb = S.focus && b[S.focus];
    if (fb) { const k = pulse(S.t, 7, 0.6); g.beginPath(); g.arc(fb.x, fb.y, fb.r + 7 + 6 * k, 0, TAU); g.lineWidth = 3; g.strokeStyle = `rgba(95,244,200,${0.55 + 0.45 * k})`; g.stroke(); }
  }

  // the steering joystick: always drawn, a slim see-through ring and a small glass knob; while
  // held, the knob follows the thumb and a faint line shows the direction
  joystick(g, S, u) {
    const s = S.ctrl.stick, held = s.id != null, R = s.r, dpr = S.dpr;
    const ox = held ? s.ox : s.cx, oy = held ? s.oy : s.cy;
    const e = R + 8, ring = this.piece(`ring${R}${held ? 1 : 0}@${dpr}`, e * 2, e * 2, dpr, (c) => {
      c.translate(e, e);
      c.beginPath(); c.arc(0, 0, R - 1, 0, TAU); c.fillStyle = held ? 'rgba(8,14,40,0.26)' : 'rgba(8,14,40,0.16)'; c.fill();
      c.strokeStyle = NEON.cyan; c.globalAlpha = held ? 0.25 : 0.14; c.lineWidth = 5; c.stroke();
      c.globalAlpha = held ? 0.9 : 0.6; c.lineWidth = 1.6; c.stroke();
      c.globalAlpha = 0.2; c.lineWidth = 1; c.setLineDash([3, 5]); c.beginPath(); c.arc(0, 0, R * 0.56, 0, TAU); c.stroke(); c.setLineDash([]);
      // four short ticks on the rim: it goes every way
      c.globalAlpha = 0.7; c.lineWidth = 2; c.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2, co = Math.cos(a), sn = Math.sin(a); c.beginPath(); c.moveTo(co * (R - 5), sn * (R - 5)); c.lineTo(co * (R - 11), sn * (R - 11)); c.stroke(); }
    });
    g.drawImage(ring, ox - e, oy - e, e * 2, e * 2);
    // the hint (first races, and the tutorial's steering step): a ghost knob swings to show the move
    let kx = held ? s.x : ox, ky = held ? s.y : oy;
    const hint = !held && S.hint > 0;
    if (hint) {
      const t = S.t % 3, ph = t < 1.5 ? t / 1.5 : (3 - t) / 1.5, side = Math.floor(S.t / 3) % 2 ? -1 : 1;
      const ee = ph < 0.5 ? 2 * ph * ph : 1 - 2 * (1 - ph) * (1 - ph), a = -Math.PI / 2 + side * (0.35 + ee * 1.0), dd = R * 0.62 * Math.min(1, ee * 1.6);
      kx = ox + Math.cos(a) * dd; ky = oy + Math.sin(a) * dd;
    }
    const kr = R * 0.3;
    if (held && s.hm > 0.05) { g.beginPath(); g.moveTo(ox, oy); g.lineTo(kx, ky); g.lineWidth = 2; g.strokeStyle = 'rgba(52,231,255,0.45)'; g.stroke(); }
    g.beginPath(); g.arc(kx, ky, kr, 0, TAU); g.fillStyle = held ? 'rgba(52,231,255,0.3)' : 'rgba(52,231,255,0.14)'; g.fill();
    g.lineWidth = 1.6; g.strokeStyle = held ? NEON.ice : 'rgba(127,243,255,0.75)'; g.stroke();
    g.beginPath(); g.arc(kx, ky, Math.max(2.5, kr * 0.22), 0, TAU); g.fillStyle = held ? '#ffffff' : 'rgba(233,246,255,0.7)'; g.fill();
    if (hint) {
      g.globalAlpha = clamp(S.hint, 0, 1);
      // a pulsing arrow from the centre toward the knob, and two short lines of words
      const da = Math.atan2(ky - oy, kx - ox), dd = Math.hypot(kx - ox, ky - oy);
      if (dd > 8) {
        const k = pulse(S.t, 9, 0.8);
        g.save(); g.translate(ox, oy); g.rotate(da);
        g.beginPath(); g.moveTo(R + 4 + 8 * k, 0); g.lineTo(R - 8, -10); g.lineTo(R - 4, 0); g.lineTo(R - 8, 10); g.closePath();
        g.fillStyle = NEON.ice; g.fill();
        g.restore();
      }
      const sz = Math.round(clamp(R * 0.2, 15, 24)), ty = oy - R - sz * 1.5;
      label(g, 'STEER', ox, ty, sz, NEON.ice, 'center', dpr, 'd');
      label(g, 'point where you want to go', ox, ty + sz * 0.95, Math.round(sz * 0.62), NEON.text, 'center', dpr, 'n');
      g.globalAlpha = 1;
    }
  }
  // where the stick is pointing, drawn on your car (the stick's screen direction, in every camera view)
  arrow(g, S, u, car) {
    const s = S.ctrl.stick, R = S.renderer, c = R.meCar;
    if (s.id == null || s.hm < 0.15 || !car || !c || !R.M || car.f & FLAG.DEAD || R.hideMe) return;
    const p = R.toScreen(c.x, c.y), x = p.x, y = p.y, d = 46 * u + 10 * s.hm * u; // (screen point: after the camera's tilt)
    g.save(); g.translate(x, y); g.rotate(s.ha);
    g.globalAlpha = 0.5 + 0.4 * s.hm;
    g.beginPath(); g.moveTo(d + 18 * u, 0); g.lineTo(d, -11 * u); g.lineTo(d + 5 * u, 0); g.lineTo(d, 11 * u); g.closePath();
    g.fillStyle = NEON.ice; g.fill(); g.lineWidth = 1.5; g.strokeStyle = HALO; g.stroke();
    g.restore(); g.globalAlpha = 1;
  }
  // desktop first races: the keys
  keysHint(g, S, u) {
    g.globalAlpha = clamp(S.hint, 0, 1);
    const y = S.H - S.SA.b - 128 * u;
    label(g, '← →  or  A D  TO STEER', S.W / 2, y, Math.round(20 * u), NEON.ice, 'center', S.dpr, 'd');
    label(g, 'SHIFT drift · J fire · K item · R reset', S.W / 2, y + 24 * u, Math.round(14 * u), NEON.text, 'center', S.dpr, 'n');
    g.globalAlpha = 1;
  }
  // RESET: small when you're free; big, pulsing magenta and labelled once the server says you're stuck
  resetButton(g, S, u) {
    const b = S.ctrl.btn.reset, big = b.big, off = !S.canReset;
    const k = big ? pulse(S.t, 8, 0.7) : 0, r = b.r * (1 + 0.1 * k);
    g.globalAlpha = off ? 0.45 : 1;
    if (big) { g.beginPath(); g.arc(b.x, b.y, r + 5 + 7 * k, 0, TAU); g.lineWidth = 3; g.strokeStyle = `rgba(255,63,184,${0.35 + 0.5 * k})`; g.stroke(); }
    g.beginPath(); g.arc(b.x, b.y, r, 0, TAU); g.fillStyle = big ? 'rgba(255,63,184,0.85)' : GLASS; g.fill(); g.lineWidth = 1.25; g.strokeStyle = big ? '#ffd6ef' : 'rgba(52,231,255,0.6)'; g.stroke();
    // a circular arrow
    const ir = r * 0.42, iy = b.y - (big ? r * 0.12 : 0);
    g.beginPath(); g.arc(b.x, iy, ir, -Math.PI * 0.35, Math.PI * 1.25); g.lineWidth = Math.max(2.5, r * 0.11); g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
    const ax = b.x + Math.cos(-Math.PI * 0.35) * ir, ay = iy + Math.sin(-Math.PI * 0.35) * ir, hs = Math.max(5, r * 0.22);
    g.beginPath(); g.moveTo(ax + hs, ay - hs * 0.2); g.lineTo(ax - hs * 0.3, ay - hs); g.lineTo(ax - hs * 0.2, ay + hs * 0.6); g.closePath(); g.fillStyle = '#ffffff'; g.fill();
    if (big) label(g, 'RESET', b.x, b.y + r * 0.55, Math.round(Math.max(10, r * 0.28)), '#ffffff', 'center', S.dpr, 'n');
    else if (S.ctrl.mode !== 'touch') label(g, 'R', b.x + r - 2, b.y + r - 2, 10, NEON.dim, 'center', S.dpr, 'n');
    g.globalAlpha = 1;
    if (big && !off) label(g, S.ctrl.mode === 'touch' ? 'STUCK? TAP RESET' : 'STUCK? PRESS R', S.W - S.SA.r - 8, b.y + r + 22 + 9 * u, Math.round(16 * u), NEON.mag, 'right', S.dpr, 'd');
  }

  center(g, S, u, car) {
    const { W, H, view, me, dt, t, renderer, dpr } = S;
    const cx = W / 2, cy = H * 0.4;
    // countdown 3-2-1-GO in a glass hex, like the pre-race card's (lower in the tutorial: its prompt card is at the top)
    const cy2 = S.tut ? H * 0.56 : cy;
    const cd = view.countdown;
    if (cd > 0 || (view.time >= 0 && view.time < 0.8)) {
      const n = cd > 0 ? Math.ceil(cd) : 0, f = cd > 0 ? cd - Math.floor(cd) : 1 - view.time / 0.8;
      const s = SETTINGS.reduceFlash ? 1 : 1 + (cd > 0 ? f * 0.35 : (1 - f) * 0.25);
      g.globalAlpha = cd > 0 ? 1 : clamp(f * 1.6, 0, 1);
      if (n) {
        hexPath(g, cx, cy2, 66 * u); g.fillStyle = 'rgba(10,15,46,0.72)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(52,231,255,0.7)'; g.stroke();
        g.beginPath(); g.arc(cx, cy2, 72 * u, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.lineWidth = 3 * u; g.strokeStyle = n === 1 ? NEON.mag : NEON.cyan; g.stroke();
        label(g, String(n), cx, cy2 + 2 * u, Math.round(80 * u), NEON.text, 'center', dpr, 'd', s);
        label(g, 'GET READY', cx, cy2 + 46 * u, Math.round(11 * u), NEON.cyan, 'center', dpr, 'n');
      } else label(g, 'GO!', cx, cy2, Math.round(Math.min(130 * u, W * 0.24)), NEON.ice, 'center', dpr, 'd', s);
      g.globalAlpha = 1;
    }
    // wrong way
    if (S.wrong) { const k = SETTINGS.reduceFlash ? 1 : 0.6 + 0.4 * Math.sin(t * 10); g.globalAlpha = k; label(g, 'WRONG WAY', cx, cy, Math.round(36 * u), NEON.red, 'center', dpr, 'd'); label(g, '↻ turn around', cx, cy + 30 * u, Math.round(15 * u), NEON.text, 'center', dpr, 'n'); g.globalAlpha = 1; }
    // wrecked
    if (me && me.rt > 0 && !me.out) {
      glass(g, cx - 120 * u, cy - 36 * u, 240 * u, 72 * u, 12 * u, 'rgba(255,77,109,0.8)', 'rgba(10,15,46,0.78)');
      label(g, 'WRECKED', cx, cy - 10 * u, Math.round(30 * u), NEON.red, 'center', dpr, 'd');
      label(g, str('back', Math.ceil(me.rt), (v) => `back in ${v}`), cx, cy + 18 * u, Math.round(15 * u), NEON.text, 'center', dpr, 'n');
    }
    if (me && me.out && S.mode !== 'elim') label(g, str('ko', me.out, (v) => `KNOCKED OUT · ${v}${ORD(v).toLowerCase()}`), cx, H * 0.2, Math.round(21 * u), NEON.mag, 'center', dpr, 'd');
    if (me && me.fin && view.cars.length) label(g, str('fin', me.fin, (v) => `FINISHED ${v}${ORD(v)}`), cx, H * 0.2, Math.round(26 * u), me.fin === 1 ? NEON.mag : NEON.ice, 'center', dpr, 'd');
    // LOCK-ON warning (the server names the target): MISSILE LOCKED / DRONE ON YOU, and the counter
    // once it is close: DRIFT NOW! (the dodge) / FIRE TO SWAT!
    if (renderer.threat > 0 && !(car && car.f & FLAG.DEAD)) {
      const k = SETTINGS.reduceFlash ? 1 : Math.sin(t * 16) > 0 ? 1 : 0.4, drone = renderer.lockK === 'drone';
      g.globalAlpha = k; label(g, drone ? '⚠ DRONE ON YOU' : '⚠ MISSILE LOCKED', cx, H * 0.3, Math.round(19 * u), NEON.red, 'center', dpr, 'd'); g.globalAlpha = 1;
      const close = drone ? renderer.lockD < itemStat('drone').swat * 1.3 : renderer.lockD < itemStat('missile').dodgeR * 1.4;
      if (close) label(g, drone ? 'FIRE TO SWAT!' : 'DRIFT NOW!', cx, H * 0.3 + 24 * u, Math.round(17 * u), NEON.lime, 'center', dpr, 'd');
      if (!SETTINGS.reduceFlash) { g.lineWidth = 10; g.strokeStyle = `rgba(255,40,80,${0.25 * k * clamp(renderer.threat, 0, 1)})`; g.strokeRect(5, 5, W - 10, H - 10); }
      else { g.lineWidth = 6; g.strokeStyle = 'rgba(255,60,90,0.35)'; g.strokeRect(4, 4, W - 8, H - 8); } // a steady frame
    }
    // a sticky bomb on your car: pass it on
    const bomb = me && renderer.bombOn(view, S.rc.id);
    if (bomb) label(g, bomb.left != null ? str('bomb', Math.max(0, Math.ceil(bomb.left * 10)), (v) => `BOMB ${(v / 10).toFixed(1)} · BUMP SOMEONE!`) : 'BOMB · BUMP SOMEONE!', cx, H * 0.3 + 48 * u, Math.round(17 * u), '#7dff5a', 'center', dpr, 'd');
    if (me && me.ph > 0) label(g, str('ghost', Math.ceil(me.ph * 10), (v) => `GHOST ${(v / 10).toFixed(1)}`), cx, H * 0.3 + 72 * u, Math.round(15 * u), '#dff0ff', 'center', dpr, 'd');
    // kill-cam callout
    if (this.call) {
      const c = this.call; c.t += dt;
      g.globalAlpha = clamp(Math.min(c.t * 8, (1.8 - c.t) * 4), 0, 1);
      label(g, c.text, cx, H * 0.14 + (this.split ? 56 : 34) * u, Math.round(15 * u), c.col, 'center', dpr, 'd'); // (below a lap split)
      g.globalAlpha = 1;
      if (c.t > 1.8) this.call = null;
    }
    // banners: a pop-in title with a soft glow, the line under it
    let by = S.tut ? H * 0.66 : H * 0.22; // (the tutorial's prompt card sits at the top)
    for (let i = 0; i < this.banners.length; i++) {
      const b = this.banners[i]; b.t += dt;
      const f = b.t / b.life, k = clamp(Math.min(b.t * 6, (1 - f) * 4), 0, 1);
      g.globalAlpha = k;
      const s = SETTINGS.reduceFlash ? 1 : 1 + clamp(0.3 - b.t, 0, 0.3);
      label(g, b.text, cx, by, Math.round(24 * u), b.col, 'center', dpr, 'd', s);
      if (b.sub) label(g, b.sub, cx, by + 21 * u, Math.round(13 * u), NEON.text, 'center', dpr, 'n');
      by += (b.sub ? 42 : 32) * u;
      g.globalAlpha = 1;
    }
    for (let i = this.banners.length - 1; i >= 0; i--) if (this.banners[i].t > this.banners[i].life) this.banners.splice(i, 1);
  }
}
export { ITEMS };
