// Hunt Racers world renderer (canvas 2D): camera with speed look-ahead and zoom, cached track
// chunks, animated track overlays, cars (cached sprites), items, weapons and effects. Draws from
// RaceClient.view() and is fed race events by the app (fx()).
import { TrackArt, CHUNK, THEMES } from './trackart.js';
import { CarSprites, BUCKETS, INK, blitCar, drawUnderglow, glowDot, exhaustsOf, taillightsOf, headOf, mix } from './cars.js';
import { lookForRacer, NEON_GLOW } from './looks.js';
const EDGE_A = Math.round(0x66 * NEON_GLOW).toString(16).padStart(2, '0'); // dusk edge lights (alpha hex)
import { Particles, Skids, Effects, PK, C, TIER_C, FK, colorIdx } from './fx.js';
import { FLAG, driftTierOf } from './protocol.js';
import { ITEMS, WEAPONS, ITEM_IDS, itemStat, COMBAT } from './items.js';
import { armPulse, drawWell, drawDrone, drawSticky, drawTrap, drawGhostVeil } from './weapons-fx.js';
import { driftTier } from './physics.js';
import { SETTINGS } from '../settings.js';
import { CAM, camRot, newCam, stepCam, anchorOf, tiltOf, project } from './camera.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const P = {}; // probe scratch
const CAR_VIS = 1.18; // cars are drawn a bit bigger than their hitbox
export const SAFE_BOX = 0.2;
const DASH = [6, 6], NODASH = [];
const LT = 10; // taillight trail points per light // the followed car stays within ±20% of the screen centre (0.3..0.7 of W and H)

function glowSprite(col, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return cv;
}
// headlight beam: a soft cone along +x from the origin (drawn additively ahead of each car)
function beamSprite() {
  const w = 160, h = 80, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(235,245,255,0.75)'); gr.addColorStop(0.5, 'rgba(210,230,255,0.25)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, h / 2 - 7); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(0, h / 2 + 7); g.closePath(); g.fill();
  return cv;
}
// screen-edge dusk: a purple / pink / blue tint along the edges with a few far-off city lights,
// painted once per size and theme at a quarter of the resolution (it is all soft gradients)
const DUSK = {
  desert: ['rgba(60,20,70,0.55)', 'rgba(255,120,90,0.22)', ['#ff7a5a', '#ffb347', '#c04dff']],
  frozen: ['rgba(14,30,80,0.55)', 'rgba(120,180,255,0.2)', ['#7fd8ff', '#b8a4ff', '#ffffff']],
  ashlands: ['rgba(40,6,10,0.55)', 'rgba(255,90,30,0.22)', ['#ff6a1a', '#ffb347', '#ff3fa4']],
  city: ['rgba(30,8,60,0.6)', 'rgba(255,63,164,0.22)', ['#ff3fa4', '#3ff5ff', '#a05cff', '#ffe14a']],
};
function duskSprite(W, H, world) {
  const D = DUSK[world] || DUSK.desert, w = Math.max(8, Math.round(W / 4)), h = Math.max(8, Math.round(H / 4));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  // edge bands that fade out before the middle box (x 0.2-0.8, y 0.3-0.75), which stays clear and is never drawn
  const band = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, D[0]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
  band(0, 0, 0, h * 0.3, 0, 0, w, h * 0.3);
  band(0, h, 0, h * 0.75, 0, h * 0.75, w, h * 0.25);
  band(0, 0, w * 0.2, 0, 0, 0, w * 0.2, h);
  band(w, 0, w * 0.8, 0, w * 0.8, 0, w * 0.2, h);
  const top = g.createLinearGradient(0, 0, 0, h * 0.3);
  top.addColorStop(0, D[1]); top.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = top; g.fillRect(0, 0, w, h * 0.3);
  // far-off lights along the top edge and the corners
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = ((i * 0.618 + 0.11) % 1) * w, y = (i % 3) * h * 0.035 + h * 0.01, s = h * (0.05 + (i % 4) * 0.02), c = D[2][i % D[2].length];
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, c + EDGE_A); gr.addColorStop(1, c + '00');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  return cv;
}
function boxSprite() {
  const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.translate(s / 2, s / 2);
  const gr = g.createLinearGradient(-20, -20, 20, 20);
  gr.addColorStop(0, '#5ff4ff'); gr.addColorStop(0.5, '#c04dff'); gr.addColorStop(1, '#ff5fa2');
  g.beginPath(); g.moveTo(-15, -20); g.arcTo(20, -20, 20, 20, 6); g.arcTo(20, 20, -20, 20, 6); g.arcTo(-20, 20, -20, -20, 6); g.arcTo(-20, -20, 20, -20, 6); g.closePath();
  g.fillStyle = gr; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-14, -14, 12, 8);
  g.fillStyle = '#fff'; g.font = '700 26px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = INK; g.strokeText('?', 0, 2); g.fillText('?', 0, 2);
  return cv;
}
function oilSprite() {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d'); g.translate(s / 2, s / 2);
  g.fillStyle = '#0c0a10';
  for (let k = 0; k < 7; k++) { const a = k * 0.9, r = 18 + (k % 3) * 6; g.beginPath(); g.arc(Math.cos(a) * 26, Math.sin(a) * 22, r, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.fill();
  const gr = g.createLinearGradient(-30, -30, 30, 30);
  gr.addColorStop(0, 'rgba(95,244,255,0.35)'); gr.addColorStop(0.35, 'rgba(192,77,255,0.3)'); gr.addColorStop(0.7, 'rgba(255,210,63,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.beginPath(); g.ellipse(-6, -8, 30, 16, -0.6, 0, TAU); g.fill();
  return cv;
}

export class RaceRenderer {
  // opts.lookOf(id) -> look | null: the app's per-car look provider (equipped cosmetics); null or
  // no provider = the car's own look from the roster. Asked again only when the car's roster row changes.
  constructor(canvas, { lookOf = null } = {}) {
    this.lookOf = lookOf;
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1;
    this.art = null; this.T = null;
    this.cars = new CarSprites();
    this.parts = new Particles(SETTINGS.lowGfx ? 360 : 720);
    this.skids = new Skids(900);
    this.fxs = new Effects(48);
    this.vis = new Map(); // per car visual state
    this.cam = { x: 0, y: 0, z: 1, lx: 0, ly: 0, shake: 0, sx: 0, sy: 0, init: false };
    this.t = 0;
    this.glow = { lava: glowSprite('rgba(255,120,30,0.9)'), ice: glowSprite('rgba(220,250,255,0.85)'), gold: glowSprite('rgba(255,210,63,0.95)'), cyan: glowSprite('rgba(95,244,255,0.9)'), red: glowSprite('rgba(255,60,60,0.9)') };
    for (const c of ['#ff3fa4', '#3ff5ff', '#a05cff', '#ffe14a', '#4bff9c']) this.glow[c] = glowSprite(c + 'cc');
    this.box = boxSprite(); this.oil = oilSprite(); this.beam = beamSprite();
    this.dusk = null; this.lfx = new Map(); // look id -> derived colours (strings, particle colour slots)
    this.amb = new Float32Array(60 * 3); // screen-space ambience (snow / embers / rain)
    for (let i = 0; i < 60; i++) { this.amb[i * 3] = Math.random(); this.amb[i * 3 + 1] = Math.random(); this.amb[i * 3 + 2] = Math.random(); }
    this.threat = 0; // a missile is homing on us (0..1)
    this.lockD = Infinity; this.lockK = ''; // the nearest missile / drone locked on to us: distance, kind
    this.stickAt = new Map(); // sticky bomb id -> race time it stuck (for its fuse light)
    this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };
    // camera view (camera.js): Top-down is the classic path below; Chase / Cockpit rotate the world
    this.cfg = CAM.top; this.camName = 'top'; this.cm = newCam(); this.anc = { x: 0, y: 0 }; this.tl = tiltOf(CAM.top, 1, 1);
    this.hideMe = false; this.meBrake = false; this.focusKey = ''; this.sfx = null; this.pt = { x: 0, y: 0, k: 1 };
  }
  // the camera view ('chase' | 'top' | 'cockpit'); the app applies tl.css to the canvas element
  setCamera(name) {
    const cfg = CAM[name] || CAM.chase;
    if (cfg !== this.cfg) { this.cm = newCam(); this.cam.init = false; }
    this.cfg = cfg; this.camName = CAM[name] ? name : 'chase'; this.tl = tiltOf(cfg, this.W || 1, this.H || 1);
    return this.tl;
  }
  // world point -> canvas CSS px (before the tilt) and -> screen CSS px (after it)
  toCanvas(x, y, out = this.pt) { const M = this.M, d = this.dpr; if (!M) { out.x = out.y = 0; out.k = 1; return out; } out.x = (M.a * x + M.c * y + M.x) / d; out.y = (M.b * x + M.d * y + M.y) / d; out.k = 1; return out; }
  toScreen(x, y, out = this.pt) { this.toCanvas(x, y, out); return project(this.tl, out.x, out.y, out); }
  setTrack(T) {
    if (this.T === T) return;
    this.T = T; this.art = new TrackArt(T); this.vis.clear(); this.cam.init = false; this.dusk = null; this.stickAt.clear();
    this.skids = new Skids(900); this.parts.n = 0;
    this.art.setScale(this.chunkScale());
  }
  baseZoom() { return clamp(Math.min(this.W, this.H * 1.75) / 1000, 0.5, 1.3); }
  chunkScale() { return Math.round(this.baseZoom() * this.dpr * 8) / 8; }
  resize(W, H, dpr) {
    if (W !== this.W || H !== this.H) this.dusk = null;
    this.W = W; this.H = H; this.dpr = dpr; this.tl = tiltOf(this.cfg, W, H);
    // (setting a canvas size, even the same one, throws its pixels away and reallocates it)
    const cw = Math.round(W * dpr), chh = Math.round(H * dpr);
    if (this.cv.width !== cw || this.cv.height !== chh) { this.cv.width = cw; this.cv.height = chh; }
    const s = this.chunkScale();
    if (this.art) this.art.setScale(s);
    this.cars.setScale(Math.round(this.baseZoom() * dpr * CAR_VIS * 8) / 8);
  }
  // object transforms without save/restore: world (x, y), rotation a, scale k on top of the camera
  // (M is the camera's affine world -> canvas pixel matrix: a b c d, offset x y, scale s)
  at(g, x, y, a = 0, k = 1) { const M = this.M, c = Math.cos(a) * k, sn = Math.sin(a) * k; g.setTransform(M.a * c + M.c * sn, M.b * c + M.d * sn, M.c * c - M.a * sn, M.d * c - M.b * sn, M.a * x + M.c * y + M.x, M.b * x + M.d * y + M.y); }
  base(g) { const M = this.M; g.setTransform(M.a, M.b, M.c, M.d, M.x, M.y); }
  visOf(id) {
    let v = this.vis.get(id);
    if (!v) {
      // lt: taillight trail ring (LT points x 2 lights x xy); look: this car's look (from the roster)
      v = { lt: new Float32Array(LT * 4), ltn: 0, lti: 0, ltT: 0, look: null, lookSrc: undefined, trail: new Float32Array(32), tn: 0, ti: 0, wx: new Float32Array(4), skid: false, flame: 0, flameC: 0, respawnT: 0, hitT: 0, puff: 0, dust: 0, tierPrev: 0, air: 0, airMax: 0.6, spinT: 0, lastX: 0, lastY: 0, pa: null, yaw: 0, bounce: 0, bT: 0, wasAir: false, scrape: 0, brk: 0 };
      this.vis.set(id, v);
    }
    return v;
  }

  // colours derived from a look, computed once per look (no strings built per frame)
  fxOf(L) {
    let f = this.lfx.get(L.id);
    if (!f) {
      f = { neon: colorIdx(L.neon), trail: colorIdx(L.trail.color), flame: colorIdx(L.flame.outer), trailCore: mix(L.trail.color, '#ffffff', 0.6), ribbon: L.neon2 };
      if (this.lfx.size > 64) this.lfx.clear();
      this.lfx.set(L.id, f);
    }
    return f;
  }
  carLook(id, rc) {
    const v = this.visOf(id), rd = rc.roster.get(id);
    if (v.lookSrc !== rd || !v.look) {
      v.lookSrc = rd;
      let L = null;
      if (this.lookOf) { try { L = this.lookOf(id); } catch { L = null; } }
      v.look = L && typeof L === 'object' && L.sprite ? L : lookForRacer(rd || { driver: 'volt' });
    }
    return v.look;
  }

  // build every racer's car sprites ahead of time (lobby and countdown: many per frame; racing:
  // one), so the first laps never pay for baking the glow
  warm(rc, budget) {
    if (this.warmN === rc.roster.size && this.warmS === this.cars.scale) return;
    let left = budget;
    for (const id of rc.roster.keys()) {
      const L = this.carLook(id, rc), arr = this.cars.map.get(L.sprite);
      for (let b = 0; b < BUCKETS && left > 0; b++) if (!arr || !arr[b]) { this.cars.get(L, (b / BUCKETS) * TAU); left--; }
      if (left <= 0) return;
    }
    this.warmN = rc.roster.size; this.warmS = this.cars.scale; // all built for this roster and scale
  }

  // ------------------------------------------------------------------ events -> effects
  carAt(view, id) { const cs = view.cars; for (let i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i]; return null; }
  explode(x, y, big = 1) {
    const p = this.parts, n = SETTINGS.lowGfx ? 0.5 : 1;
    this.fxs.add(FK.FLASH, x, y, { r: 120 * big, life: 0.35, col: '#ffd23f' });
    this.fxs.add(FK.RING, x, y, { r: 150 * big, life: 0.45, col: '#ff9f1c', w: 10 });
    for (let i = 0; i < 14 * n * big; i++) { const a = Math.random() * TAU, s = 150 + Math.random() * 420; p.emit(PK.FLAME, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.3, 10 + Math.random() * 10, i & 1 ? C.ORANGE : C.GOLD, -10, 4); }
    for (let i = 0; i < 10 * n * big; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 160; p.emit(PK.SMOKE, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.9 + Math.random() * 0.8, 14, C.DARK, 30, 2); }
    for (let i = 0; i < 10 * n * big; i++) { const a = Math.random() * TAU, s = 240 + Math.random() * 380; p.emit(PK.DEBRIS, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.6 + Math.random() * 0.5, 5 + Math.random() * 4, i & 1 ? C.INK : C.SMOKE, 0, 3); }
  }
  shake(k) { if (!SETTINGS.reduceFlash) this.cam.shake = Math.min(1.4, this.cam.shake + k); }
  fx(e, view, meId) {
    const p = this.parts, F = this.fxs;
    const car = (id) => this.carAt(view, id);
    switch (e[0]) {
      case 'ko': { const c = car(e[1]); if (c) { this.explode(c.x, c.y, 1.2); if (e[1] === meId) this.shake(1); else if (this.near(c, 600)) this.shake(0.4); } break; }
      case 'rs': { this.visOf(e[1]).respawnT = 0.7; break; }
      case 'hit': { const c = car(e[1]); if (c) { if (e[5]) this.explode(c.x, c.y, 0.55); for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, s = 200 + Math.random() * 300; p.emit(PK.SPARK, c.x, c.y, Math.cos(a) * s, Math.sin(a) * s, 0.25, 3, C.GOLD, 0, 3); } this.visOf(e[1]).hitT = 0.25; if (e[1] === meId) this.shake(0.35); } break; }
      case 'shield': { const c = car(e[1]); if (c) F.add(FK.RING, c.x, c.y, { r: 70, life: 0.35, col: '#5ff4ff', w: 8 }); break; }
      case 'steal': {
        const a = car(e[1]), b = car(e[2]);
        if (a && b) for (let i = 0; i < 12; i++) p.emit(PK.GLINT, b.x, b.y, (a.x - b.x) * 1.6 + (Math.random() - 0.5) * 300, (a.y - b.y) * 1.6 + (Math.random() - 0.5) * 300, 0.5 + i * 0.02, 5, C.GOLD, 0, 1.5);
        break;
      }
      case 'box': { const B = this.T.boxes[e[2]]; if (B) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.emit(PK.GLINT, B.x, B.y, Math.cos(a) * 260, Math.sin(a) * 260, 0.35, 4, i & 1 ? C.CYAN : C.PINK, 0, 4); } break; }
      case 'use': {
        const c = car(e[1]); if (!c) break;
        const it = ITEM_IDS[e[2]];
        if (it === 'turbo') { const v = this.visOf(e[1]); v.flame = 1.6; v.flameC = -1; /* -1: the car's own flame look */ F.add(FK.RING, c.x, c.y, { r: 90, life: 0.3, col: '#5ff4ff', w: 6 }); }
        if (it === 'shield') F.add(FK.RING, c.x, c.y, { r: 60, life: 0.4, col: '#5ff4ff', w: 6 });
        if (it === 'ghost') F.add(FK.RING, c.x, c.y, { r: 80, life: 0.45, col: '#dff0ff', w: 8 });
        if (it === 'gravity') F.add(FK.RING, c.x, c.y, { r: 70, life: 0.35, col: '#b98cff', w: 6 });
        break;
      }
      // WEAPONS: chain lightning hops, dodges, combos, sticky bombs, drones, ghosts
      case 'chain': {
        let a = car(e[1]);
        if (!a) break;
        for (let i = 2; i < e.length; i++) { const b = car(e[i]); if (!b) break; F.add(FK.ARC, a.x, a.y, { x1: b.x, y1: b.y, life: 0.4, id: a.id, id2: b.id, col: '#9fd8ff' }); a = b; }
        if (e.length === 2) F.add(FK.RING, a.x, a.y, { r: 90, life: 0.3, col: '#9fd8ff', w: 5 }); // nobody in reach
        break;
      }
      case 'dodge': { const c = car(e[1]); if (c) { F.add(FK.RING, c.x, c.y, { r: 80, life: 0.4, col: '#5ef2c6', w: 7 }); for (let i = 0; i < 8; i++) { const a = Math.random() * TAU; p.emit(PK.GLINT, c.x, c.y, Math.cos(a) * 240, Math.sin(a) * 240, 0.3, 3, C.CYAN, 0, 4); } } break; }
      case 'combo': {
        if (e[2] === 'trap') F.add(FK.RING, e[3], e[4], { r: ITEMS.oil.r * COMBAT.trapR * 1.6, life: 0.55, col: '#ffd23f', w: 10 });
        else { const c = car(e[3]); if (c) { F.add(FK.RING, c.x, c.y, { r: 120, life: 0.45, col: '#5ff4ff', w: 10 }); F.add(FK.FLASH, c.x, c.y, { r: 140, life: 0.3, col: '#5ff4ff' }); } }
        break;
      }
      case 'stick': { this.stickAt.set(e[3], view.time); const c = car(e[1]); if (c) for (let i = 0; i < 8; i++) { const a = Math.random() * TAU; p.emit(PK.DEBRIS, c.x, c.y, Math.cos(a) * 160, Math.sin(a) * 160, 0.35, 4, C.GREEN, 0, 4); } break; }
      case 'pass': { const a = car(e[1]), b = car(e[2]); if (a && b) for (let i = 0; i < 8; i++) p.emit(PK.GLINT, a.x, a.y, (b.x - a.x) * 3 + (Math.random() - 0.5) * 120, (b.y - a.y) * 3 + (Math.random() - 0.5) * 120, 0.3, 3, C.GREEN, 0, 3); break; }
      case 'fizzle': { this.stickAt.delete(e[1]); const c = car(e[2]); if (c) for (let i = 0; i < 8; i++) p.emit(PK.SMOKE, c.x, c.y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.6, 8, C.SMOKE, 20, 2); break; }
      case 'swat': { const c = car(e[1]); if (c) F.add(FK.RING, c.x, c.y, { r: 70, life: 0.3, col: '#ff9f43', w: 6 }); break; }
      case 'unghost': { const c = car(e[1]); if (c) F.add(FK.RING, c.x, c.y, { r: 70, life: 0.35, col: '#5ff4ff', w: 8 }); break; }
      case 'emp': { const c = car(e[1]); if (c) { F.add(FK.RING, c.x, c.y, { r: ITEMS.emp.r, life: 0.7, col: '#5ff4ff', w: 16 }); F.add(FK.FLASH, c.x, c.y, { r: 200, life: 0.3, col: '#5ff4ff' }); if (this.near(c, ITEMS.emp.r)) this.shake(0.3); } break; }
      case 'spin': { this.visOf(e[1]).spinT = 0.9; break; }
      case 'arc': { const a = car(e[1]), b = car(e[2]); if (a) F.add(FK.ARC, a.x, a.y, { x1: b ? b.x : a.x + 200, y1: b ? b.y : a.y, life: 0.32, id: e[1], id2: e[2], col: '#5ff4ff' }); break; }
      case 'pulse': { const c = car(e[1]); if (c) { F.add(FK.RING, c.x, c.y, { r: WEAPONS.brick.r + 30, life: 0.45, col: '#ff7b39', w: 14 }); F.add(FK.FLASH, c.x, c.y, { r: 130, life: 0.25, col: '#ffb347' }); if (this.near(c, 400)) this.shake(0.35); } break; }
      case 'rail': { F.add(FK.BEAM, e[2], e[3], { x1: e[4], y1: e[5], life: 0.45, col: '#5ef2c6', w: 12 }); if (e[6]) { for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; p.emit(PK.SPARK, e[4], e[5], Math.cos(a) * 300, Math.sin(a) * 300, 0.3, 3, C.CYAN, 0, 3); } } break; }
      case 'blink': { F.add(FK.BLINK, e[2], e[3], { x1: e[4], y1: e[5], life: 0.4, col: '#c04dff', id: e[1] }); F.add(FK.SLASH, e[4], e[5], { a: Math.atan2(e[5] - e[3], e[4] - e[2]), life: 0.3, col: '#ff5fa2' }); break; }
      case 'boom': { this.explode(e[1], e[2], e[3] === 'mine' || e[3] === 4 ? 0.8 : e[3] === 8 ? 1.1 : e[3] === 7 ? 0.9 : e[3] === 9 ? 0.5 : 0.6); if (this.near({ x: e[1], y: e[2] }, 350)) this.shake(0.25); break; }
      case 'mt': { const v = this.visOf(e[1]); v.flame = [0, 0.5, 0.85, 1.3][e[2]] || 0.5; v.flameC = TIER_C[e[2]] ?? C.BLUE; break; }
      case 'jump': { this.visOf(e[1]).air = 0.001; break; }
      case 'bump': { const a = car(e[1]), b = car(e[2]); if (a && b) { const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2; for (let i = 0; i < 6; i++) { const an = Math.random() * TAU; p.emit(PK.SPARK, x, y, Math.cos(an) * 260, Math.sin(an) * 260, 0.22, 2.5, C.WHITE, 0, 4); } if (e[1] === meId || e[2] === meId) this.shake(clamp(e[3] / 900, 0.1, 0.4)); } break; }
    }
  }
  near(c, r) { const me = this.meCar; return !!me && Math.hypot(me.x - c.x, me.y - c.y) < r; }

  // ------------------------------------------------------------------ frame
  draw(view, rc, dt, now) {
    const g = this.g, W = this.W, H = this.H, dpr = this.dpr, T = this.T, art = this.art;
    this.t += dt;
    const t = this.t;
    art.tick++;
    this.cars.budget = 1; // (after a resolution step: one look's sprites rebuilt per frame)
    const me = view.cars.find((c) => c.me) || null;
    this.meCar = me;
    // CAMERA: follow (the leader once knocked out), look ahead in the driving direction, zoom out at speed
    let focus = me;
    if (view.me && view.me.out) focus = this.carAt(view, view.leader) || view.cars[0] || me;
    const cam = this.cam, cfg = this.cfg;
    const M = this.M || (this.M = { s: 1, x: 0, y: 0, a: 1, b: 0, c: 0, d: 1 });
    const vw = this.view;
    let cx, cy, z;
    cam.shake = Math.max(0, cam.shake - dt * 2.6);
    if (cam.shake > 0 && !SETTINGS.reduceFlash) { const s = cam.shake * cam.shake * 14; cam.sx = (Math.random() - 0.5) * s; cam.sy = (Math.random() - 0.5) * s; } else { cam.sx = cam.sy = 0; }
    if (!cfg.rotate) {
      if (focus) {
        let vx = 0, vy = 0;
        if (focus.me && rc.car && focus.predicted) { vx = rc.car.vx; vy = rc.car.vy; } else { vx = Math.cos(focus.a) * focus.spd; vy = Math.sin(focus.a) * focus.spd; }
        const spd = Math.hypot(vx, vy), la = clamp(spd / 900, 0, 1.2);
        // keep the car in the middle third: look-ahead capped to a share of the half-screen
        const zz = cam.z || this.baseZoom(), tlx = clamp(vx * 0.3, -this.W * 0.17 / zz, this.W * 0.17 / zz), tly = clamp(vy * 0.3, -this.H * 0.17 / zz, this.H * 0.17 / zz), kk = 1 - Math.exp(-dt * 3.2);
        if (!cam.init) { cam.x = focus.x; cam.y = focus.y; cam.lx = tlx; cam.ly = tly; cam.z = this.baseZoom(); cam.init = true; }
        cam.lx += (tlx - cam.lx) * kk; cam.ly += (tly - cam.ly) * kk;
        cam.x = focus.x + cam.lx * (SETTINGS.reduceFlash ? 0.8 : 1); cam.y = focus.y + cam.ly * (SETTINGS.reduceFlash ? 0.8 : 1);
        // zoom out at speed, a little more on boost (the wider view)
        const tz = this.baseZoom() * (1 - cfg.speedZoom * clamp((spd - 350) / 650, 0, 1) * Math.min(1, la + 0.2) - (focus.f & FLAG.BOOST ? cfg.boostZoom : 0));
        cam.z += (tz - cam.z) * (1 - Math.exp(-dt * 1.6));
      }
      z = cam.z;
      cx = cam.x + cam.sx / z; cy = cam.y + cam.sy / z;
      // SAFE BOX: whatever the look-ahead, shake, a respawn or a jump do, your car stays inside the
      // middle 40% of the screen: clear of the HUD corners, the thumb buttons, the speedometer and the
      // credit along the bottom
      if (focus) { const mx = W * SAFE_BOX / z, my = H * SAFE_BOX / z; cx = clamp(cx, focus.x - mx, focus.x + mx); cy = clamp(cy, focus.y - my, focus.y + my); }
      vw.x0 = cx - W / 2 / z; vw.y0 = cy - H / 2 / z; vw.x1 = cx + W / 2 / z; vw.y1 = cy + H / 2 / z;
      M.s = dpr * z; M.a = M.d = M.s; M.b = M.c = 0; M.x = dpr * (W / 2 - cx * z); M.y = dpr * (H / 2 - cy * z);
    } else {
      // CHASE / COCKPIT: the world turns so the car points up (camera.js does the heading, lean,
      // boost kick and speed zoom, all bounded); the CSS tilt on the canvas does the rest
      const cm = this.cm;
      if (focus) {
        const pred = focus.me && rc.car && focus.predicted, spd = pred ? Math.hypot(rc.car.vx, rc.car.vy) : focus.spd;
        // (a cut - respawn, another car to follow, a replay starting or ending - snaps the view instead of swinging it round)
        const key = focus.id + ':' + (focus.me ? rc.carEp : 0), cut = Math.abs(focus.x - cam.x) + Math.abs(focus.y - cam.y) > 260;
        const snap = key !== this.focusKey || this.visOf(focus.id).respawnT > 0.62 || cut;
        this.focusKey = key;
        const S = this.camIn || (this.camIn = { a: 0, spd: 0, top: 900, boost: 0, spin: 0, snap: 0 });
        S.a = focus.a; S.spd = spd; S.top = this.top || 900; S.boost = focus.f & FLAG.BOOST ? 1 : 0; S.spin = focus.f & FLAG.SPIN ? 1 : 0; S.snap = snap ? 1 : 0;
        stepCam(cm, cfg, S, dt);
        cam.x = focus.x; cam.y = focus.y; cam.lx = cam.ly = 0; cam.init = true;
      }
      z = cam.z = this.baseZoom() * cfg.zoom * cm.zk;
      cx = cam.x; cy = cam.y;
      const rot = camRot(cfg, cm.h), cr = Math.cos(rot), sr = Math.sin(rot), an = anchorOf(cfg, cm, W, H, this.anc);
      this.downA = Math.atan2(cr, sr); // the world angle that points down the screen
      const ax = an.x + cam.sx, ay = an.y + cam.sy;
      M.s = dpr * z; M.a = M.s * cr; M.b = M.s * sr; M.c = -M.s * sr; M.d = M.s * cr;
      M.x = dpr * (ax - z * (cr * cx - sr * cy)); M.y = dpr * (ay - z * (sr * cx + cr * cy));
      // the world box the (rotated) canvas shows: its four corners back in the world
      vw.x0 = vw.y0 = Infinity; vw.x1 = vw.y1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const px = ((k & 1 ? W : 0) - ax) / z, py = ((k & 2 ? H : 0) - ay) / z, wx = cx + cr * px + sr * py, wy = cy - sr * px + cr * py;
        if (wx < vw.x0) vw.x0 = wx; if (wx > vw.x1) vw.x1 = wx; if (wy < vw.y0) vw.y0 = wy; if (wy > vw.y1) vw.y1 = wy;
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = (THEMES[T.world] || THEMES.desert).bg; g.fillRect(0, 0, this.cv.width, this.cv.height);
    this.base(g);
    // CHUNKS: everything visible now, plus one chunk ahead per frame
    const c0 = Math.floor(vw.x0 / CHUNK), c1 = Math.floor(vw.x1 / CHUNK), r0 = Math.floor(vw.y0 / CHUNK), r1 = Math.floor(vw.y1 / CHUNK);
    g.imageSmoothingEnabled = true;
    if (!cfg.rotate) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g.drawImage(art.chunk(c, r), c * CHUNK, r * CHUNK, CHUNK + 2, CHUNK + 2); }
    else {
      // rotated view: only the chunks that reach the canvas (its world box holds many that don't)
      const rad = CHUNK * 0.7072 * M.s, cw = this.cv.width, ch = this.cv.height, h2 = CHUNK / 2;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const X = c * CHUNK + h2, Y = r * CHUNK + h2, px = M.a * X + M.c * Y + M.x, py = M.b * X + M.d * Y + M.y;
        if (px < -rad || py < -rad || px > cw + rad || py > ch + rad) continue;
        g.drawImage(art.chunk(c, r), c * CHUNK, r * CHUNK, CHUNK + 2, CHUNK + 2);
      }
    }
    if (focus) {
      const hx = cfg.rotate ? Math.cos(this.cm.h) * H * 0.8 / z : cam.lx * 2.2, hy = cfg.rotate ? Math.sin(this.cm.h) * H * 0.8 / z : cam.ly * 2.2;
      const ax = Math.floor((cx + hx) / CHUNK), ay = Math.floor((cy + hy) / CHUNK);
      let done = false;
      for (let dy = -1; dy <= 1 && !done; dy++) for (let dx = -1; dx <= 1 && !done; dx++) if (!art.has(ax + dx, ay + dy)) { art.chunk(ax + dx, ay + dy); done = true; }
    }
    this.warm(rc, view.countdown > 0 || !view.cars.length ? 12 : 1);
    this.overlays(g, view, t);
    this.skids.draw(g, t, vw.x0 - 60, vw.y0 - 60, vw.x1 + 60, vw.y1 + 60, T.world === 'frozen' ? 'rgba(60,80,110,1)' : T.world === 'city' ? '#05050c' : '#1a1212');
    if (this.sfx) this.sfx.world(g, this, view, rc, dt);
    if (this.elim) this.elim.world(g, this, view, rc, dt); // Elimination: the black hole, the racer in danger (elim.js)
    this.ents(g, view, t, me, true);
    this.drawCars(g, view, rc, dt, t);
    this.ents(g, view, t, me, false);
    this.parts.update(dt);
    this.parts.draw(g, vw.x0, vw.y0, vw.x1, vw.y1);
    this.effects(g, view, dt);
    this.ambience(g, dt, t);
    // dusk at the screen edges (one cached quarter-resolution image)
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.dusk) this.dusk = duskSprite(W, H, T.world);
    // only the bands where the tint is visible (the middle of the screen stays clear): less fill
    const dk = this.dusk, dw = dk.width, dh = dk.height, cw = this.cv.width, ch = this.cv.height;
    g.drawImage(dk, 0, 0, dw, dh * 0.3, 0, 0, cw, ch * 0.3);
    g.drawImage(dk, 0, dh * 0.75, dw, dh * 0.25, 0, ch * 0.75, cw, ch * 0.25);
    g.drawImage(dk, 0, dh * 0.3, dw * 0.2, dh * 0.45, 0, ch * 0.3, cw * 0.2, ch * 0.45);
    g.drawImage(dk, dw * 0.8, dh * 0.3, dw * 0.2, dh * 0.45, cw * 0.8, ch * 0.3, cw * 0.2, ch * 0.45);
  }

  // animated bits of the track: lava glow, neon flicker, pads, hazards, item boxes
  overlays(g, view, t) {
    const art = this.art, vw = this.view, T = this.T, steady = SETTINGS.reduceFlash;
    g.globalCompositeOperation = 'lighter';
    for (const L of art.glows) {
      if (L.x + L.r < vw.x0 || L.x - L.r > vw.x1 || L.y + L.r < vw.y0 || L.y - L.r > vw.y1) continue;
      const slow = L.col === 'lava' || L.col === 'ice', k = steady ? 0.6 : 0.45 + 0.25 * Math.sin(t * (slow ? 1.8 : 7) + L.ph) + (!slow && Math.sin(t * 23 + L.ph * 5) > 0.96 ? -0.3 : 0);
      g.globalAlpha = clamp(k, 0, 1) * (L.col === 'lava' ? 0.55 : L.col === 'ice' ? 0.22 : 0.5) * NEON_GLOW;
      g.drawImage(this.glow[L.col] || this.glow.lava, L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    g.globalAlpha = 1;
    // boost pads: chevrons racing forward
    for (const pd of art.pads) {
      if (pd.bx1 < vw.x0 - 40 || pd.bx0 > vw.x1 + 40 || pd.by1 < vw.y0 - 40 || pd.by0 > vw.y1 + 40) continue;
      const m = pd.mid, w = Math.min(pd.w, 150) * 0.42, len = pd.circle ? pd.w * 0.8 : 90;
      g.globalAlpha = 0.55 * NEON_GLOW; g.drawImage(this.glow.cyan, m.x - len * 0.9, m.y - len * 0.9, len * 1.8, len * 1.8);
      this.at(g, m.x, m.y, m.a);
      g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const ph = steady ? k / 3 : ((t * 1.8 + k / 3) % 1), x = -len / 2 + ph * len;
        g.globalAlpha = steady ? 0.8 : Math.sin(ph * Math.PI) * 0.95;
        g.strokeStyle = k === 1 ? '#5ff4ff' : '#c9fbff';
        g.beginPath(); g.moveTo(x - 14, -w); g.lineTo(x + 10, 0); g.lineTo(x - 14, w); g.stroke();
      }
      this.base(g);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // hazards: lava geysers and neon arc emitters
    for (let i = 0; i < T.hazards.length; i++) {
      const h = T.hazards[i];
      if (h.x + h.r * 2 < vw.x0 || h.x - h.r * 2 > vw.x1 || h.y + h.r * 2 < vw.y0 || h.y - h.r * 2 > vw.y1) continue;
      const on = (view.hazardsOn >> i) & 1;
      const ph = (((view.time + h.phase) % h.period) + h.period) % h.period, soon = !on && ph > h.period - 0.9;
      if (h.kind === 'geyser') this.geyser(g, h, on, soon, t);
      else this.arcPost(g, h, on, soon, t);
    }
    // item boxes: spinning, bobbing
    const off = view.boxesOff;
    for (let i = 0; i < T.boxes.length; i++) {
      const b = T.boxes[i];
      if (b.x < vw.x0 - 40 || b.x > vw.x1 + 40 || b.y < vw.y0 - 40 || b.y > vw.y1 + 40) continue;
      let taken = false;
      for (let k = 0; k < off.length; k++) if (off[k] === i) { taken = true; break; }
      if (taken) { g.globalAlpha = 0.25; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(b.x, b.y, 10, 0, TAU); g.stroke(); g.globalAlpha = 1; continue; }
      const bob = steady ? 1 : 1 + Math.sin(t * 3 + i) * 0.06, a = steady ? 0.4 : t * 1.6 + i * 0.7;
      g.globalAlpha = 0.3; g.fillStyle = '#000'; g.beginPath(); g.ellipse(b.x + 6, b.y + 9, 20, 14, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      this.at(g, b.x, b.y, a, bob); g.drawImage(this.box, -24, -24, 48, 48); this.base(g);
    }
  }
  geyser(g, h, on, soon, t) {
    g.save(); g.translate(h.x, h.y);
    g.beginPath(); g.arc(0, 0, h.r * 0.55, 0, TAU); g.fillStyle = '#1a0c0a'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ff5a1f'; g.stroke();
    if (soon) { g.globalAlpha = SETTINGS.reduceFlash ? 0.6 : 0.4 + 0.4 * Math.sin(t * 18); g.lineWidth = 6; g.strokeStyle = '#ffd23f'; g.setLineDash([16, 12]); g.beginPath(); g.arc(0, 0, h.r, 0, TAU); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    if (on) {
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.glow.lava, -h.r * 1.6, -h.r * 1.6, h.r * 3.2, h.r * 3.2);
      g.globalCompositeOperation = 'source-over';
      const gr = g.createRadialGradient(0, 0, 4, 0, 0, h.r);
      gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#ff8c1a'); gr.addColorStop(1, 'rgba(200,30,0,0.2)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h.r, 0, TAU); g.fill();
      for (let k = 0; k < 2; k++) { const a = Math.random() * TAU, s = 120 + Math.random() * 260; this.parts.emit(PK.EMBER, h.x, h.y, Math.cos(a) * s, Math.sin(a) * s, 0.5, 4, k ? C.LAVA : C.GOLD, -4, 2); }
    }
    g.restore();
  }
  arcPost(g, h, on, soon, t) {
    g.save(); g.translate(h.x, h.y);
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * h.r, 0, 10, 0, TAU); g.fillStyle = '#2b2b48'; g.fill(); g.lineWidth = 4; g.strokeStyle = on || soon ? '#3ff5ff' : '#55557a'; g.stroke(); }
    if (soon) { g.globalAlpha = SETTINGS.reduceFlash ? 0.6 : 0.4 + 0.4 * Math.sin(t * 18); g.lineWidth = 5; g.strokeStyle = '#3ff5ff'; g.setLineDash([12, 10]); g.beginPath(); g.arc(0, 0, h.r, 0, TAU); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    if (on) {
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.glow['#3ff5ff'], -h.r * 1.4, -h.r * 1.4, h.r * 2.8, h.r * 2.8);
      this.bolt(g, -h.r, 0, h.r, 0, '#c9fbff', 5, 8);
      this.bolt(g, -h.r, 0, h.r, 0, '#3ff5ff', 3, 8);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
  // a jagged lightning line (fresh jitter each frame; no allocation)
  bolt(g, x0, y0, x1, y1, col, w, n) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, amp = Math.min(26, L * 0.12);
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x0, y0);
    for (let k = 1; k < n; k++) { const f = k / n, o = (Math.random() - 0.5) * 2 * amp; g.lineTo(x0 + dx * f + nx * o, y0 + dy * f + ny * o); }
    g.lineTo(x1, y1); g.stroke();
  }

  // ground entities (low=true: oil, spikes, mines, turret bases) and flying ones
  ents(g, view, t, me, low) {
    const vw = this.view, steady = SETTINGS.reduceFlash, p = this.parts;
    if (!low) { this.threat = 0; this.lockD = Infinity; this.lockK = ''; }
    for (const e of view.ents) {
      // a sticky bomb rides on its carrier: draw it where the car is drawn (own car: predicted)
      if (e.kind === 'sticky' && e.armed && e.tg) { const cc = this.carAt(view, e.tg); if (cc) { e.x = cc.x; e.y = cc.y; } }
      if (e.x < vw.x0 - 120 || e.x > vw.x1 + 120 || e.y < vw.y0 - 120 || e.y > vw.y1 + 120) {
        if (!low && (e.kind === 'missile' || e.kind === 'drone') && me && e.owner !== me.id) this.missileThreat(e, me);
        continue;
      }
      const k = e.kind;
      if (low) {
        if (k === 'oil') {
          const r = itemStat('oil', e.lv).r;
          if (!e.armed) g.globalAlpha = armPulse(t, e.id); // arming: blinks (breathes under Reduce Flashing)
          g.save(); g.translate(e.x, e.y); g.rotate(e.id * 1.7); g.drawImage(this.oil, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3); g.restore();
          g.globalAlpha = 1;
        } else if (k === 'spikes') { if (!e.armed) g.globalAlpha = armPulse(t, e.id); this.spikes(g, e); g.globalAlpha = 1; }
        else if (k === 'trap') drawTrap(g, e, t, itemStat('oil', e.lv).r * COMBAT.trapR, this.oil, e.armed);
        else if (k === 'well') drawWell(g, e, t, itemStat('gravity', e.lv).r, e.armed);
        else if (k === 'sticky' && !e.armed) drawSticky(g, e, t, null);
        else if (k === 'mine') this.mine(g, e, t, steady);
        else if (k === 'turret') this.turret(g, e, t, view);
        continue;
      }
      if ((k === 'missile' || k === 'drone') && me && e.owner !== me.id) this.missileThreat(e, me);
      if (k === 'drone') { drawDrone(g, e, t, !!me && e.tg === me.id); continue; }
      if (k === 'sticky') { if (e.armed) { const s0 = this.stickAt.get(e.id); drawSticky(g, e, t, s0 == null ? null : itemStat('sticky', e.lv).fuse - (view.time - s0)); } continue; }
      if (k === 'missile') {
        g.save(); g.translate(e.x, e.y); g.rotate(e.a);
        g.globalCompositeOperation = 'lighter'; g.drawImage(this.glow.red, -40, -16, 32, 32); g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#e8e2d2'; g.beginPath(); g.moveTo(16, 0); g.lineTo(8, -5); g.lineTo(-12, -5); g.lineTo(-12, 5); g.lineTo(8, 5); g.closePath(); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
        g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(16, 0); g.lineTo(9, -5); g.lineTo(9, 5); g.closePath(); g.fill();
        g.fillStyle = '#ff3b3b'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-6, s * 5); g.lineTo(-13, s * 11); g.lineTo(-13, s * 5); g.closePath(); g.fill(); }
        g.restore();
        p.emit(PK.SMOKE, e.x - Math.cos(e.a) * 16, e.y - Math.sin(e.a) * 16, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.8, 6, C.SMOKE, 22, 1.5);
        p.emit(PK.FLAME, e.x - Math.cos(e.a) * 14, e.y - Math.sin(e.a) * 14, -Math.cos(e.a) * 120, -Math.sin(e.a) * 120, 0.12, 6, C.ORANGE, -20, 3);
      } else if (k === 'rocket') {
        g.save(); g.translate(e.x, e.y); g.rotate(e.a);
        g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -4); g.lineTo(-8, 4); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
        g.restore();
        p.emit(PK.FLAME, e.x - Math.cos(e.a) * 10, e.y - Math.sin(e.a) * 10, -Math.cos(e.a) * 80, -Math.sin(e.a) * 80, 0.1, 5, C.GOLD, -20, 3);
        if (Math.random() < 0.5) p.emit(PK.SMOKE, e.x, e.y, 0, 0, 0.5, 4, C.SMOKE, 18, 1);
      } else if (k === 'bolt') {
        g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#ff8c1a'; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x - Math.cos(e.a) * 26, e.y - Math.sin(e.a) * 26); g.stroke();
        g.strokeStyle = '#fff3b0'; g.lineWidth = 2; g.stroke(); g.globalCompositeOperation = 'source-over';
      }
    }
  }
  // a sticky bomb on car `id`: {left: fuse seconds or null}
  bombOn(view, id) {
    const B = this.bomb || (this.bomb = { left: null });
    for (const e of view.ents) if (e.kind === 'sticky' && e.armed && e.tg === id) { const s0 = this.stickAt.get(e.id); B.left = s0 == null ? null : itemStat('sticky', e.lv).fuse - (view.time - s0); return B; }
    return null;
  }
  missileThreat(e, me) {
    const dx = me.x - e.x, dy = me.y - e.y, d = Math.hypot(dx, dy);
    // the server names the target (lock-on): exact, wherever it is
    if (e.tg) { if (e.tg === me.id) { this.threat = Math.max(this.threat, Math.max(0.35, 1 - d / 1600)); if (d < this.lockD) { this.lockD = d; this.lockK = e.kind; } } return; }
    if (e.kind !== 'missile' || d > 1300) return;
    let da = Math.atan2(dy, dx) - e.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    if (Math.abs(da) < 0.7) this.threat = Math.max(this.threat, 1 - d / 1300 + 0.2);
  }
  spikes(g, e) {
    const half = itemStat('spikes', e.lv).half;
    g.save(); g.translate(e.x, e.y); g.rotate(e.a + Math.PI / 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-half + 4, -6, half * 2, 16);
    g.fillStyle = '#4a4d58'; g.fillRect(-half, -8, half * 2, 14); g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(-half, -8, half * 2, 14);
    g.fillStyle = '#e8e2d2';
    g.beginPath(); for (let x = -half + 6; x < half - 4; x += 13) { g.moveTo(x, -8); g.lineTo(x + 5, -17); g.lineTo(x + 10, -8); g.moveTo(x, 6); g.lineTo(x + 5, 15); g.lineTo(x + 10, 6); } g.fill(); g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  mine(g, e, t, steady) {
    g.save(); g.translate(e.x, e.y);
    g.beginPath(); g.arc(3, 4, 17, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fillStyle = '#c99a52'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * 1.047; g.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); } g.strokeStyle = '#7a5a34'; g.lineWidth = 2; g.stroke();
    // arming: the light flashes a warning (breathes under Reduce Flashing); armed: a steady red glow
    const k = e.armed ? 1 : armPulse(t, e.id);
    g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fillStyle = e.armed ? '#ff3b3b' : k > 0.5 ? '#ffd23f' : '#7a5a1a'; g.fill();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = e.armed ? 0.8 : k * 0.9; g.drawImage(e.armed ? this.glow.red : this.glow.gold, -18, -18, 36, 36); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  turret(g, e, t, view) {
    // aim at the nearest other car in range (visual only; the server does the shooting)
    let best = null, bd = WEAPONS.rook.range;
    for (const c of view.cars) { if (c.id === e.owner || c.f & FLAG.DEAD) continue; const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; best = c; } }
    const a = best ? Math.atan2(best.y - e.y, best.x - e.x) : t * 1.5;
    g.save(); g.translate(e.x, e.y);
    g.beginPath(); g.arc(4, 5, 18, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    g.beginPath(); for (let k = 0; k < 3; k++) { const an = k * 2.094 + 0.5; g.moveTo(0, 0); g.lineTo(Math.cos(an) * 20, Math.sin(an) * 20); } g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#7d8290'; g.stroke();
    g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fillStyle = '#5a6a3a'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.rotate(a); g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.moveTo(0, 0); g.lineTo(20, 0); g.stroke(); g.lineWidth = 3; g.strokeStyle = '#ff8c1a'; g.stroke();
    g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fillStyle = '#ff8c1a'; g.fill();
    g.restore();
  }

  drawCars(g, view, rc, dt, t) {
    const vw = this.view, cars = view.cars, steady = SETTINGS.reduceFlash, low = SETTINGS.lowGfx, p = this.parts, T = this.T;
    const wet = T.world === 'city' && !low;
    // grounded cars first, airborne cars on top, own car last among equals
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < cars.length; i++) {
      const c = cars[i], air = c.f & FLAG.AIR;
      if ((pass === 0 && (air || c.me)) || (pass === 1 && (air || !c.me)) || (pass === 2 && !air)) continue;
      const v = this.visOf(c.id);
      // a jump across the map (respawn, RESET, a slow-mo replay starting or ending): no taillight
      // streak or skid line across the road, no body-roll kick from the sudden heading
      if (Math.abs(c.x - v.lastX) + Math.abs(c.y - v.lastY) > 260) { v.ltn = 0; v.tn = 0; v.skid = false; v.pa = null; v.yaw = 0; }
      v.lastX = c.x; v.lastY = c.y;
      const dead = c.f & FLAG.DEAD;
      const inView = c.x > vw.x0 - 80 && c.x < vw.x1 + 80 && c.y > vw.y0 - 80 && c.y < vw.y1 + 80;
      v.respawnT = Math.max(0, v.respawnT - dt); v.hitT = Math.max(0, v.hitT - dt); v.flame = Math.max(0, v.flame - dt); v.spinT = Math.max(0, v.spinT - dt);
      if (air) v.air = Math.min(v.airMax, v.air + dt); else v.air = 0;
      // CAR FEEL: turn rate (body roll, headlight sweep) and the suspension bounce after a landing
      if (v.pa != null && dt > 0) { let da = c.a - v.pa; if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU; v.yaw += (clamp(da / dt, -5, 5) - v.yaw) * Math.min(1, dt * 10); }
      v.pa = c.a;
      if (v.wasAir && !air && !dead) { v.bounce = 1; v.bT = 0; }
      v.wasAir = !!air; v.bT += dt; v.bounce = Math.max(0, v.bounce - dt * 1.4);
      if (dead) {
        if (inView && Math.random() < 0.5) p.emit(PK.SMOKE, c.x + (Math.random() - 0.5) * 20, c.y + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40, -30, 1, 8, C.DARK, 20, 1);
        if (inView) { g.globalAlpha = 0.6; g.fillStyle = '#12091e'; g.beginPath(); g.ellipse(c.x, c.y, 30, 20, c.a, 0, TAU); g.fill(); g.globalAlpha = 1; }
        v.tn = 0; v.ltn = 0;
        continue;
      }
      const cos = Math.cos(c.a), sin = Math.sin(c.a);
      const L = this.carLook(c.id, rc), lf = this.fxOf(L), st = L.driver;
      const boost = c.f & FLAG.BOOST, drift = c.f & FLAG.DRIFT, tier = c.me && c.predicted && rc.car ? driftTier(rc.car.dc) : driftTierOf(c.f);
      // trail ring (world positions), sampled every frame while boosting
      if (boost && !air) { v.trail[v.ti * 2] = c.x - cos * 24; v.trail[v.ti * 2 + 1] = c.y - sin * 24; v.ti = (v.ti + 1) % 16; v.tn = Math.min(16, v.tn + 1); } else v.tn = Math.max(0, v.tn - 1);
      // taillight trails: both rear lights sampled ~30 times a second
      if (!low && (v.ltT += dt) > 0.033) {
        v.ltT = 0;
        const tl = taillightsOf(st), k = v.lti * 4;
        for (let q = 0; q < 2; q++) { const o = tl[q] || tl[0]; v.lt[k + q * 2] = c.x + cos * o[0] * CAR_VIS - sin * o[1] * CAR_VIS; v.lt[k + q * 2 + 1] = c.y + sin * o[0] * CAR_VIS + cos * o[1] * CAR_VIS; }
        v.lti = (v.lti + 1) % LT; v.ltn = Math.min(LT, v.ltn + 1);
      }
      // rear wheels: skid marks and drift sparks
      const rlx = c.x - cos * 15 + sin * 13, rly = c.y - sin * 15 - cos * 13, rrx = c.x - cos * 15 - sin * 13, rry = c.y - sin * 15 + cos * 13;
      const skid = !air && (drift || (c.f & FLAG.SPIN) || v.spinT > 0);
      if (skid && v.skid) { this.skids.add(v.wx[0], v.wx[1], rlx, rly, t); this.skids.add(v.wx[2], v.wx[3], rrx, rry, t); }
      v.skid = skid; v.wx[0] = rlx; v.wx[1] = rly; v.wx[2] = rrx; v.wx[3] = rry;
      if (!inView) continue;
      if (drift && !air && tier > 0) {
        const col = TIER_C[tier];
        for (let k = 0; k < (low ? 1 : 2); k++) {
          const wx = k ? rlx : rrx, wy = k ? rly : rry, a = c.a + Math.PI + (Math.random() - 0.5) * 1.4, s = 160 + Math.random() * 240;
          p.emit(PK.SPARK, wx, wy, Math.cos(a) * s, Math.sin(a) * s, 0.18 + Math.random() * 0.12, tier === 3 ? 3.5 : 2.6, col, 0, 3);
        }
      }
      // drift smoke lit up in the car's neon colour
      if (drift && !air && Math.random() < (low ? 0.3 : 0.6)) { const k = Math.random() < 0.5; p.emit(PK.HAZE, k ? rlx : rrx, k ? rly : rry, -cos * 30, -sin * 30, 0.7, 8, lf.neon, 30, 1.2); }
      // tyre smoke: pale clouds off the rear tyres in a hard drift or a spin
      if (!air && (((drift && c.spd > 380) || c.f & FLAG.SPIN || v.spinT > 0)) && Math.random() < (low ? 0.15 : 0.45)) { const k = Math.random() < 0.5; p.emit(PK.SMOKE, k ? rlx : rrx, k ? rly : rry, -cos * 50 + (Math.random() - 0.5) * 50, -sin * 50 + (Math.random() - 0.5) * 50, 0.9 + Math.random() * 0.5, 10, C.SMOKE, 34, 1.4); }
      // sparks scraping a guard wall (own car: the physics' wall contact; others: a probe now and then)
      if (!air && c.spd > 160) {
        let touch = false;
        if (c.me && c.predicted && rc.car) { touch = rc.car.wh < 0.07; if (touch) { T.probe(c.x, c.y, 22, P); } }
        else if ((v.scrape += dt) > 0.07) { v.scrape = 0; T.probe(c.x, c.y, 22, P); touch = P.pen > -3; }
        if (touch) {
          const wx = c.x - P.nx * 22, wy = c.y - P.ny * 22;
          for (let k = 0; k < (low ? 2 : 4); k++) { const a = c.a + Math.PI + (Math.random() - 0.5) * 1.1, s = 180 + Math.random() * 320; p.emit(PK.SPARK, wx, wy, Math.cos(a) * s - P.nx * 60, Math.sin(a) * s - P.ny * 60, 0.2 + Math.random() * 0.15, 2.6, k & 1 ? C.GOLD : C.WHITE, 0, 3); }
        }
      }
      // ground dust from the shoulder / sand / snow
      if (!air && c.spd > 220 && (v.dust += dt) > 0.05) {
        v.dust = 0;
        T.probe(c.x, c.y, 0, P);
        const s = P.surf;
        if (s === 'sand' || s === 'snow' || s === 'offroad' || s === 'ice') p.emit(PK.DUST, rlx, rly, -cos * 60 + (Math.random() - 0.5) * 60, -sin * 60 + (Math.random() - 0.5) * 60, 0.7, 9, s === 'sand' ? C.SAND : s === 'snow' || s === 'ice' ? C.SNOW : C.ASH, 26, 1.6);
      }
      // exhaust puffs
      if ((v.puff += dt) > (boost ? 0.03 : 0.12)) { v.puff = 0; p.emit(PK.SMOKE, c.x - cos * 28, c.y - sin * 28, -cos * 40, -sin * 40, 0.5, 4, C.SMOKE, 14, 1.5); }
      const lift = air ? Math.sin(Math.min(1, v.air / v.airMax) * Math.PI * 0.5 + 0.0) : 0;
      const bob = v.bounce > 0 ? v.bounce * Math.cos(v.bT * 26) * 0.07 : 0;
      const sc = (1 + lift * 0.28) * (1 + bob);
      // body roll: the body leans out of the bend (shifted sideways off its shadow, turned a touch)
      const roll = air ? 0 : clamp((v.yaw * c.spd) / 2600, -1, 1), rox = sin * roll * 3.4, roy = -cos * roll * 3.4;
      const sweep = clamp(v.yaw * 0.13, -0.38, 0.38); // headlights lead into the turn
      if (this.hideMe && c.me) { // cockpit: your own car is the bonnet on the HUD; its lights still reach ahead
        this.at(g, c.x, c.y, c.a + sweep, CAR_VIS); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.36 * NEON_GLOW;
        g.drawImage(this.beam, headOf(st) - 4, -26, 150, 52); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; this.base(g);
        continue;
      }
      // leader glow (bounty) under the car
      if (c.f & FLAG.LEADER) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = steady ? 0.7 : 0.55 + 0.25 * Math.sin(t * 4);
        g.drawImage(this.glow.gold, c.x - 70, c.y - 70, 140, 140); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      // shadow (offset grows in the air: the height cue for jumps)
      g.globalAlpha = air ? 0.25 : 0.32; g.fillStyle = '#000';
      const so = 6 + lift * 34;
      g.beginPath(); g.ellipse(c.x + so, c.y + so * 1.2, 28 * (1 - lift * 0.15), 17 * (1 - lift * 0.15), c.a, 0, TAU); g.fill();
      g.globalAlpha = 1;
      // wet road: the car's neon smeared down the asphalt (cheap fake reflection)
      if (wet) {
        // (smeared down the SCREEN in every camera view: world direction of screen-down)
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.28 * NEON_GLOW;
        if (this.cfg.rotate) { this.at(g, c.x, c.y, this.downA); g.drawImage(glowDot(L.neon), 4, -18, 86, 36); this.base(g); } else g.drawImage(glowDot(L.neon), c.x - 18, c.y + 4, 36, 86);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      // underglow pool on the road (stays on the ground under a jump, fading with height)
      this.at(g, c.x + so * 0.5, c.y + so * 0.6, c.a, CAR_VIS * (1 + lift * 0.4));
      drawUnderglow(g, L, t, 1 - lift * 0.6, steady);
      // headlight beams ahead, sweeping into the turn
      if (sweep) this.at(g, c.x + so * 0.5, c.y + so * 0.6, c.a + sweep, CAR_VIS * (1 + lift * 0.4));
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3 * NEON_GLOW;
      g.drawImage(this.beam, headOf(st) - 4, -22, 120, 44);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this.base(g);
      // taillight light trails
      if (!low && v.ltn > 2) {
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#ff2a3a';
        for (let band = 0; band < 2; band++) {
          g.globalAlpha = (band ? 0.16 : 0.38) * NEON_GLOW; g.lineWidth = band ? 3 : 4;
          const k0 = band ? 4 : 0, k1 = band ? v.ltn - 1 : Math.min(5, v.ltn - 1);
          g.beginPath();
          for (let q = 0; q < 2; q++) for (let k = k0; k <= k1; k++) {
            const j = ((v.lti - 1 - k + LT * 2) % LT) * 4 + q * 2;
            if (k === k0) g.moveTo(v.lt[j], v.lt[j + 1]); else g.lineTo(v.lt[j], v.lt[j + 1]);
          }
          g.stroke();
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      // boost trail (look: line / ribbon / sparks)
      if (v.tn > 2) {
        const ts = L.trail.style, wide = ts === 'ribbon' ? 1.6 : ts === 'sparks' ? 0.6 : 1;
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        for (let k = 1; k < v.tn; k++) {
          const i0 = ((v.ti - k + 16) % 16) * 2, i1 = ((v.ti - k - 1 + 16) % 16) * 2;
          if (k + 1 >= v.tn || (low && k > 6)) break;
          g.globalAlpha = (1 - k / v.tn) * 0.6 * NEON_GLOW; g.strokeStyle = k < 4 ? lf.trailCore : ts === 'ribbon' && k & 1 ? lf.ribbon : L.trail.color; g.lineWidth = (16 * (1 - k / v.tn) + 3) * wide;
          g.beginPath(); g.moveTo(v.trail[i0], v.trail[i0 + 1]); g.lineTo(v.trail[i1], v.trail[i1 + 1]); g.stroke();
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        if (ts === 'sparks' && boost && Math.random() < 0.7) { const a = c.a + Math.PI + (Math.random() - 0.5) * 0.8, s = 120 + Math.random() * 200; p.emit(PK.GLINT, c.x - cos * 26, c.y - sin * 26, Math.cos(a) * s, Math.sin(a) * s, 0.35, 3, lf.trail, 0, 3); }
      }
      // boost / mini-turbo flames from every exhaust (the car's flame look; mini-turbo tiers keep their colour)
      if (boost || v.flame > 0) {
        const Lf = (boost ? 26 : 16) + (steady ? 6 : Math.random() * 14), tierC = v.flame > 0 && v.flameC >= 0 ? v.flameC : -1;
        const outer = tierC === C.BLUE ? '#3a86ff' : tierC === C.PURPLE ? '#c04dff' : tierC === C.ORANGE ? '#ff8c1a' : tierC >= 0 ? '#ffffff' : L.flame.outer;
        const ex = exhaustsOf(st), fw = ex.length > 1 ? 0.75 : 1;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = NEON_GLOW;
        for (let q = 0; q < ex.length; q++) {
          const ox = ex[q][0] * CAR_VIS, oy = ex[q][1] * CAR_VIS;
          this.at(g, c.x + cos * ox - sin * oy, c.y + sin * ox + cos * oy, c.a, fw);
          g.fillStyle = outer;
          g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(-Lf * 0.6, -6, -Lf, 0); g.quadraticCurveTo(-Lf * 0.6, 6, 0, 8); g.closePath(); g.fill();
          g.fillStyle = L.flame.core; g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(-Lf * 0.35, -3, -Lf * 0.55, 0); g.quadraticCurveTo(-Lf * 0.35, 3, 0, 4); g.closePath(); g.fill();
        }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        this.base(g);
        if (Math.random() < 0.6) p.emit(PK.FLAME, c.x - cos * (30 + Lf * 0.6), c.y - sin * (30 + Lf * 0.6), -cos * 90, -sin * 90, 0.14, 6, tierC >= 0 ? tierC : lf.flame, -24, 2);
      }
      // the car
      const ghost = c.f & FLAG.GHOST, phase = c.f & FLAG.PHASE;
      if (phase) drawGhostVeil(g, c.x, c.y); // Ghost Mode item: see-through, steady
      g.globalAlpha = phase ? 0.4 : ghost ? (steady ? 0.55 : 0.45 + 0.35 * (Math.sin(t * 22) > 0 ? 1 : 0)) : 1;
      const spr = this.cars.get(L, c.a);
      this.at(g, c.x + rox, c.y + roy - lift * 10, c.a - spr.ang - roll * 0.05, sc * CAR_VIS);
      blitCar(g, spr, t, steady);
      this.base(g);
      g.globalAlpha = 1;
      // brake lights: bright red at the tail while braking (rivals: the BRAKE flag; you: your BRAKE)
      // (held a quarter second and faded: a bot taps the brake for a tick or two, ~2 times a second,
      // and the lights blinked with every tap)
      v.brk = (c.me ? this.meBrake && c.spd > 40 : c.f & FLAG.BRAKE) ? 0.25 : Math.max(0, v.brk - dt);
      if (v.brk > 0) {
        const tl = taillightsOf(st);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.95 * Math.min(1, v.brk / 0.1);
        for (let q = 0; q < tl.length; q++) { const o = tl[q], bx = c.x + rox + (cos * o[0] - sin * o[1]) * CAR_VIS * sc, by = c.y + roy + (sin * o[0] + cos * o[1]) * CAR_VIS * sc; g.drawImage(this.glow.red, bx - 15, by - 15, 30, 30); }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      if (v.hitT > 0 && !steady) { g.globalAlpha = v.hitT * 2.4; g.globalCompositeOperation = 'lighter'; g.drawImage(this.glow.red, c.x - 40, c.y - 40, 80, 80); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
      // shield bubble
      if (c.f & FLAG.SHIELD) {
        const r = 40 + (steady ? 0 : Math.sin(t * 6) * 2);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(this.glow.cyan, c.x - r * 1.3, c.y - r * 1.3, r * 2.6, r * 2.6); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(200,255,255,0.9)'; g.stroke();
        g.beginPath(); g.arc(c.x, c.y, r - 5, -2.4, -1.4); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke();
      }
      // hit protection (2 s after a rival's hit): a thin steady halo
      if (c.f & FLAG.PROT && !phase) { g.globalAlpha = 0.5; g.beginPath(); g.arc(c.x, c.y, 34, 0, TAU); g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.setLineDash(DASH); g.stroke(); g.setLineDash(NODASH); g.globalAlpha = 1; }
      // EMP'd: crackle
      if (c.f & FLAG.EMP && Math.random() < 0.5) { const a = Math.random() * TAU; p.emit(PK.SPARK, c.x + Math.cos(a) * 22, c.y + Math.sin(a) * 22, Math.cos(a) * 120, Math.sin(a) * 120, 0.15, 2, C.CYAN, 0, 2); }
      // spun out: swirl
      if ((c.f & FLAG.SPIN || v.spinT > 0) && !steady) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y - 30, 12, t * 10, t * 10 + 4); g.stroke(); }
      // respawn flash ring
      if (v.respawnT > 0) { const k = v.respawnT / 0.7; g.globalAlpha = k; g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(c.x, c.y, 30 + (1 - k) * 70, 0, TAU); g.stroke(); g.globalAlpha = 1; }
      // damage smoke when low on health
      if (c.hp < 35 && Math.random() < 0.3) p.emit(PK.SMOKE, c.x, c.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.8, 6, C.DARK, 18, 1);
    }
  }

  effects(g, view, dt) {
    const steady = SETTINGS.reduceFlash;
    this.fxs.update(dt);
    for (const f of this.fxs.list) {
      if (!f.on) continue;
      const k = f.t / f.life, a = 1 - k;
      if (f.k === FK.RING) {
        g.globalAlpha = a; g.lineWidth = f.w * (0.4 + a); g.strokeStyle = f.col;
        g.beginPath(); g.arc(f.x, f.y, f.r * (0.2 + 0.8 * Math.sqrt(k)), 0, TAU); g.stroke();
      } else if (f.k === FK.FLASH) {
        if (steady) continue;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * 0.9;
        g.drawImage(f.col === '#5ff4ff' ? this.glow.cyan : this.glow.gold, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
        g.globalCompositeOperation = 'source-over';
      } else if (f.k === FK.BEAM) {
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        g.globalAlpha = a; g.strokeStyle = f.col; g.lineWidth = f.w * (0.5 + a);
        g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x1, f.y1); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = f.w * 0.35 * a + 1; g.stroke();
        g.globalCompositeOperation = 'source-over';
      } else if (f.k === FK.ARC) {
        // follow both cars while the arc lasts
        const A = this.carAt(view, f.id), B = this.carAt(view, f.id2);
        if (A) { f.x = A.x; f.y = A.y; } if (B) { f.x1 = B.x; f.y1 = B.y; }
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
        this.bolt(g, f.x, f.y, f.x1, f.y1, '#3a86ff', 7, 9);
        this.bolt(g, f.x, f.y, f.x1, f.y1, '#c9fbff', 3, 9);
        g.drawImage(this.glow.cyan, f.x1 - 40, f.y1 - 40, 80, 80);
        g.globalCompositeOperation = 'source-over';
      } else if (f.k === FK.BLINK) {
        g.globalAlpha = a * 0.8; g.lineCap = 'round'; g.strokeStyle = '#c04dff'; g.lineWidth = 34 * a + 4;
        g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x1, f.y1); g.stroke();
        g.strokeStyle = '#ffd6f0'; g.lineWidth = 6 * a + 1; g.stroke();
      } else if (f.k === FK.SLASH) {
        g.globalAlpha = a; g.strokeStyle = f.col; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.arc(f.x, f.y, 46 + k * 20, f.a - 1.2, f.a + 1.2); g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  // screen-space weather per theme (cheap: 60 points max)
  ambience(g, dt, t) {
    if (SETTINGS.lowGfx) return;
    const W = this.W, H = this.H, dpr = this.dpr, w = this.T.world, a = this.amb, cam = this.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = w === 'desert' ? 0 : 60;
    const mvx = cam.lx * 0.004, mvy = cam.ly * 0.004;
    if (w === 'desert') {
      // mirage shimmer: soft bright bands drifting across the heat haze
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const y = ((t * 0.03 + k * 0.37) % 1) * H, x = W * (0.5 + Math.sin(t * 0.3 + k * 2) * 0.35);
        g.globalAlpha = (0.07 + 0.04 * Math.sin(t * 2 + k)) * NEON_GLOW;
        g.drawImage(this.glow.gold, x - W * 0.45, y - 30, W * 0.9, 60);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    for (let i = 0; i < n; i++) {
      let x = a[i * 3], y = a[i * 3 + 1];
      const s = a[i * 3 + 2];
      if (w === 'frozen') { x += (Math.sin(t + s * 9) * 0.02 - mvx) * dt * 3; y += (0.05 + s * 0.06 - mvy) * dt; }
      else if (w === 'ashlands') { x += (Math.sin(t * 2 + s * 9) * 0.03 - mvx) * dt * 2; y += (-0.04 - s * 0.05 - mvy) * dt; }
      else { x += (-0.06 - mvx) * dt; y += (0.9 + s * 0.4 - mvy) * dt; }
      x = ((x % 1) + 1) % 1; y = ((y % 1) + 1) % 1;
      a[i * 3] = x; a[i * 3 + 1] = y;
      const px = x * W, py = y * H;
      if (w === 'frozen') { g.globalAlpha = 0.85; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 1.2 + s * 2, 0, TAU); g.fill(); }
      else if (w === 'ashlands') { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5 + s * 20); g.fillStyle = s > 0.5 ? '#ff8c1a' : '#ffd23f'; g.fillRect(px, py, 2 + s * 2, 2 + s * 2); }
      else { g.globalAlpha = 0.18; g.strokeStyle = '#9fb3ff'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 3, py + 14); g.stroke(); }
    }
    g.globalAlpha = 1;
  }
}
