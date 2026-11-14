// Living lobby backgrounds (parallax, one per world) + animated mode preview art.
// Layers are pre-rendered into tileable offscreen canvases once per size/world and then just
// scrolled, so the lobby stays cheap. Low Graphics: a single static frame, no particles.
import { drawBrawler } from '../render.js';
import { SETTINGS } from '../settings.js';
import { BRAWLER_IDS } from '../shared.js';

const INK = '#1b1033';
export const FEATURED_ORDER = ['mirage', 'city', 'forest', 'frozen', 'meadow', 'desert'];
export function featuredWorld(now = Date.now()) {
  const q = new URLSearchParams(location.search).get('featured');
  if (q && FEATURED_ORDER.includes(q)) return q;
  return FEATURED_ORDER[Math.floor(now / 864e5) % FEATURED_ORDER.length];
}

// periodic ridge: sum of sines whose periods divide the layer width => seamless tiling
function ridge(w, seed, amp, base, waves = [1, 2, 5]) {
  return (x) => base + waves.reduce((s, k, i) => s + Math.sin((x / w) * Math.PI * 2 * k + seed * (i + 1.7)) * amp / (i + 1), 0);
}
const mkCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const rngOf = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

const WORLDS = {
  mirage: {
    sky: ['#ff9a3c', '#ff5e7e', '#6a3fb0'], sun: { c: '#ffe08a', glow: 'rgba(255,190,90,.55)', y: 0.62, r: 0.2 },
    layers: [
      { col: '#9b4f7a', y: 0.62, amp: 0.05, kind: 'dunes', speed: 4 },
      { col: '#7a3a5e', y: 0.7, amp: 0.035, kind: 'ruins', speed: 9 },
      { col: '#e8a95c', y: 0.82, amp: 0.04, kind: 'dunes', speed: 18, rim: '#ffd08a' },
    ], prop: 'palm', particles: { kind: 'sand', col: 'rgba(255,220,150,.8)', n: 60 },
  },
  desert: {
    sky: ['#ffd27a', '#ffb35c', '#e07a3c'], sun: { c: '#fff2b8', glow: 'rgba(255,240,180,.5)', y: 0.3, r: 0.1 },
    layers: [
      { col: '#c9744a', y: 0.6, amp: 0.02, kind: 'mesas', speed: 4 },
      { col: '#a95b35', y: 0.72, amp: 0.02, kind: 'mesas', speed: 9 },
      { col: '#e8b56f', y: 0.84, amp: 0.025, kind: 'dunes', speed: 18, rim: '#ffd89a' },
    ], prop: 'cactus', particles: { kind: 'sand', col: 'rgba(255,230,180,.7)', n: 40 },
  },
  meadow: {
    sky: ['#8fd3ff', '#bfe9ff', '#e9f9ff'], sun: { c: '#fff6b0', glow: 'rgba(255,250,200,.6)', y: 0.22, r: 0.08 },
    layers: [
      { col: '#7fc6a4', y: 0.6, amp: 0.05, kind: 'hills', speed: 4 },
      { col: '#5fb84a', y: 0.7, amp: 0.04, kind: 'trees', speed: 9 },
      { col: '#8ee05e', y: 0.84, amp: 0.03, kind: 'hills', speed: 18, rim: '#c6ff8a' },
    ], prop: 'tree', particles: { kind: 'pollen', col: 'rgba(255,255,200,.9)', n: 30 },
  },
  city: {
    sky: ['#1a1240', '#3a1f6e', '#7a3fb0'], sun: { c: '#f3eaff', glow: 'rgba(200,170,255,.35)', y: 0.22, r: 0.05 },
    layers: [
      { col: '#2a1f5a', y: 0.5, amp: 0.2, kind: 'skyline', speed: 4, lights: '#5ff4ff' },
      { col: '#1f1645', y: 0.62, amp: 0.16, kind: 'skyline', speed: 9, lights: '#ff6bd6' },
      { col: '#140e30', y: 0.86, amp: 0.02, kind: 'flat', speed: 18 },
    ], prop: 'lamp', particles: { kind: 'rain', col: 'rgba(160,220,255,.45)', n: 70 },
  },
  forest: {
    sky: ['#2a6f6a', '#4fa38a', '#c9e89a'], sun: { c: '#fff2c4', glow: 'rgba(255,240,180,.45)', y: 0.32, r: 0.07 },
    layers: [
      { col: '#2f6e52', y: 0.55, amp: 0.04, kind: 'pines', speed: 4 },
      { col: '#21533d', y: 0.66, amp: 0.04, kind: 'pines', speed: 9 },
      { col: '#5fb84a', y: 0.85, amp: 0.025, kind: 'hills', speed: 18, rim: '#9be06a' },
    ], prop: 'pine', particles: { kind: 'leaves', col: '#e8590c', n: 22 },
  },
  frozen: {
    sky: ['#8fc8ff', '#c9e6ff', '#f2f9ff'], sun: { c: '#ffffff', glow: 'rgba(255,255,255,.6)', y: 0.25, r: 0.07 },
    layers: [
      { col: '#9fbfe8', y: 0.55, amp: 0.12, kind: 'peaks', speed: 4 },
      { col: '#7fa6d8', y: 0.66, amp: 0.08, kind: 'peaks', speed: 9 },
      { col: '#eef6ff', y: 0.84, amp: 0.025, kind: 'hills', speed: 18, rim: '#ffffff' },
    ], prop: 'snowpine', particles: { kind: 'snow', col: 'rgba(255,255,255,.9)', n: 70 },
  },
};

function paintLayer(L, w, h, seed) {
  const cv = mkCanvas(Math.ceil(w), Math.ceil(h)), g = cv.getContext('2d');
  const r = rngOf(seed * 9973 + 7), base = L.y * h, amp = L.amp * h;
  g.fillStyle = L.col; g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round';
  const top = ridge(w, seed, amp, base);
  if (L.kind === 'skyline') {
    g.beginPath(); g.moveTo(0, h);
    let x = 0; const bw = w / 24;
    const heights = [];
    for (let i = 0; i < 24; i++) heights.push(base - r() * amp - 10);
    heights[23] = heights[0];
    for (let i = 0; i < 24; i++) { g.lineTo(x, heights[i]); g.lineTo(x + bw * 0.92, heights[i]); g.lineTo(x + bw * 0.92, base + 6); x += bw; }
    g.lineTo(w, heights[0]); g.lineTo(w, h); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = L.lights;
    x = 0;
    for (let i = 0; i < 24; i++) { for (let yy = heights[i] + 8; yy < base; yy += 12) for (let xx = x + 5; xx < x + bw * 0.92 - 6; xx += 10) if (r() < 0.35) g.fillRect(xx, yy, 4, 5); x += bw; }
    return cv;
  }
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) {
    let y = top(x);
    if (L.kind === 'mesas') y = Math.round(y / (amp * 2 + 1)) * (amp * 2 + 1) - (Math.sin((x / w) * Math.PI * 12 + seed) > 0.4 ? amp * 1.6 : 0);
    if (L.kind === 'peaks') y = base - Math.abs(((x / w) * 14 + seed) % 2 - 1) * amp * 2 + amp;
    g.lineTo(x, y);
  }
  g.lineTo(w, h); g.closePath(); g.fill(); g.stroke();
  if (L.rim) { g.strokeStyle = L.rim; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 6) g.lineTo(x, top(x) + 4); g.stroke(); }
  // silhouettes standing on the ridge
  const stand = (x) => top(x);
  if (L.kind === 'ruins') {
    for (let i = 0; i < 7; i++) {
      const x = (i + 0.3 + r() * 0.4) * (w / 7), y = stand(x), ch = 30 + r() * 60, cw = 16 + r() * 10;
      g.fillStyle = L.col; g.strokeStyle = INK; g.lineWidth = 4;
      if (i % 3 === 0) { // broken arch
        g.beginPath(); g.moveTo(x - cw * 2, y); g.lineTo(x - cw * 2, y - ch); g.arc(x, y - ch, cw * 2, Math.PI, 0); g.lineTo(x + cw * 2, y - ch * 0.4); g.lineTo(x + cw, y - ch * 0.4); g.lineTo(x + cw, y - ch); g.arc(x, y - ch, cw, 0, Math.PI, true); g.lineTo(x - cw, y); g.closePath(); g.fill(); g.stroke();
      } else { g.fillRect(x - cw / 2, y - ch, cw, ch); g.strokeRect(x - cw / 2, y - ch, cw, ch); g.fillRect(x - cw / 2 - 5, y - ch - 6, cw + 10, 8); g.strokeRect(x - cw / 2 - 5, y - ch - 6, cw + 10, 8); }
    }
  }
  if (L.kind === 'trees' || L.kind === 'pines') {
    for (let i = 0; i < 18; i++) {
      const x = (i + r()) * (w / 18), y = stand(x) + 6, s = 22 + r() * 22;
      g.fillStyle = L.col; g.strokeStyle = INK; g.lineWidth = 3.5;
      g.beginPath();
      if (L.kind === 'pines') { g.moveTo(x, y - s * 2.2); g.lineTo(x + s * 0.7, y); g.lineTo(x - s * 0.7, y); g.closePath(); }
      else { g.arc(x, y - s, s, 0, Math.PI * 2); }
      g.fill(); g.stroke();
    }
  }
  return cv;
}

export class LobbyScene {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.world = null; this.layers = []; this.parts = []; this.staticDone = false; }
  // the backdrop is soft, so it renders at 1x (4x fewer pixels than 2x on phones)
  resize(w, h, dpr) { this.w = w; this.h = h; this.dpr = Math.min(this.maxDpr ?? 1, dpr); this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr); this.build(); }
  setWorld(k) { if (this.world !== k) { this.world = k; this.build(); } }
  build() {
    if (!this.w || !this.world) return;
    const W = WORLDS[this.world] || WORLDS.mirage;
    this.layers = W.layers.map((L, i) => ({ L, cv: paintLayer(L, this.w * 2, this.h, i * 31 + this.world.length) }));
    this.parts = Array.from({ length: W.particles.n }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), p: Math.random() * 6 }));
    this.sky = this.paintSky(W);
    this.vig = this.paintVignette();
    this.staticDone = false;
  }
  paintVignette() {
    const { w, h } = this, cv = mkCanvas(Math.ceil(w), Math.ceil(h)), g = cv.getContext('2d');
    const v = g.createRadialGradient(w / 2, h * 0.6, Math.min(w, h) * 0.45, w / 2, h * 0.6, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(27,16,51,0)'); v.addColorStop(1, 'rgba(27,16,51,.55)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    return cv;
  }
  // sky gradient + sun + glow never move: paint them once per size/world
  paintSky(W) {
    const { w, h } = this, cv = mkCanvas(Math.ceil(w), Math.ceil(h)), g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, h * 0.8);
    W.sky.forEach((c, i) => sky.addColorStop(i / (W.sky.length - 1), c));
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const S = W.sun, sr = S.r * h;
    const glow = g.createRadialGradient(w * 0.62, S.y * h, sr * 0.5, w * 0.62, S.y * h, sr * 3);
    glow.addColorStop(0, S.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.beginPath(); g.arc(w * 0.62, S.y * h, sr, 0, Math.PI * 2); g.fillStyle = S.c; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    return cv;
  }
  draw(t) {
    if (!this.layers.length) return;
    if (SETTINGS.lowGfx) { if (this.staticDone) return; t = 0; this.staticDone = true; } else this.staticDone = false;
    const { g, w, h } = this, W = WORLDS[this.world] || WORLDS.mirage;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.drawImage(this.sky, 0, 0, w, h);
    const S = W.sun, sr = S.r * h;
    if (this.world === 'mirage' && !SETTINGS.lowGfx) { // heat shimmer bands across the low sun
      g.save(); g.globalAlpha = 0.25; g.strokeStyle = '#fff3d0'; g.lineWidth = 3;
      for (let k = 0; k < 4; k++) { g.beginPath(); for (let x = w * 0.62 - sr * 1.4; x < w * 0.62 + sr * 1.4; x += 8) g.lineTo(x, S.y * h + sr * 0.2 + k * 10 + Math.sin(x * 0.05 + t * 3 + k) * 3); g.stroke(); }
      g.restore();
    }
    for (const { L, cv } of this.layers) {
      const off = -((t * L.speed) % (this.w * 2));
      g.drawImage(cv, off, 0, this.w * 2, h); g.drawImage(cv, off + this.w * 2, 0, this.w * 2, h);
    }
    this.prop(g, W.prop, t);
    if (!SETTINGS.lowGfx) this.particles(g, W.particles, t);
    g.drawImage(this.vig, 0, 0, w, h);
  }
  prop(g, kind, t) {
    const { w, h } = this, sway = SETTINGS.reduceFlash ? 0 : Math.sin(t * 0.9) * 0.06;
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK;
    const x = w * 0.25, y = h * 0.95;
    if (kind === 'palm') {
      g.lineWidth = 16; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 40, y - h * 0.3, x + 20 + sway * 200, y - h * 0.55); g.stroke();
      g.strokeStyle = '#a0612f'; g.lineWidth = 9; g.stroke();
      const tx = x + 20 + sway * 200, ty = y - h * 0.55;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.55 + sway * 3, L = h * 0.2;
        g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 18, tx + Math.cos(a) * L, ty + Math.sin(a) * L + 22);
        g.strokeStyle = INK; g.lineWidth = 14; g.stroke(); g.strokeStyle = '#3f9a4a'; g.lineWidth = 8; g.stroke();
      }
    } else if (kind === 'pine' || kind === 'snowpine' || kind === 'tree') {
      const s = h * 0.16;
      g.save(); g.translate(x + 30, y); g.rotate(sway * 0.5);
      g.fillStyle = '#6b4226'; g.lineWidth = 4; g.fillRect(-8, -s * 0.6, 16, s * 0.6); g.strokeRect(-8, -s * 0.6, 16, s * 0.6);
      g.fillStyle = kind === 'tree' ? '#3fae55' : '#1f7a35';
      for (let k = 0; k < 3; k++) { g.beginPath(); if (kind === 'tree') g.arc(0, -s * (0.9 + k * 0.35), s * (0.55 - k * 0.1), 0, 7); else { g.moveTo(0, -s * (1.5 + k * 0.45)); g.lineTo(s * (0.6 - k * 0.12), -s * (0.55 + k * 0.45)); g.lineTo(-s * (0.6 - k * 0.12), -s * (0.55 + k * 0.45)); g.closePath(); } g.fill(); g.stroke(); }
      if (kind === 'snowpine') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -s * 2.4); g.lineTo(s * 0.18, -s * 2.05); g.lineTo(-s * 0.18, -s * 2.05); g.closePath(); g.fill(); }
      g.restore();
    } else if (kind === 'cactus') {
      g.lineWidth = 22; g.beginPath(); g.moveTo(x + 30, y); g.lineTo(x + 30, y - h * 0.25); g.moveTo(x + 30, y - h * 0.12); g.lineTo(x + 6, y - h * 0.15); g.lineTo(x + 6, y - h * 0.2); g.stroke();
      g.strokeStyle = '#3f9a4a'; g.lineWidth = 13; g.stroke();
    } else if (kind === 'lamp') {
      g.lineWidth = 10; g.beginPath(); g.moveTo(x + 30, y); g.lineTo(x + 30, y - h * 0.4); g.lineTo(x + 70, y - h * 0.4); g.stroke(); g.strokeStyle = '#3a3a5a'; g.lineWidth = 5; g.stroke();
      const lg = g.createRadialGradient(x + 70, y - h * 0.38, 4, x + 70, y - h * 0.38, h * 0.25); lg.addColorStop(0, 'rgba(95,244,255,.5)'); lg.addColorStop(1, 'rgba(95,244,255,0)');
      g.fillStyle = lg; g.fillRect(x - 60, y - h * 0.7, h * 0.6, h * 0.7);
    }
    g.restore();
  }
  particles(g, P, t) {
    const { w, h } = this;
    g.save(); g.fillStyle = P.col; g.strokeStyle = P.col;
    for (const p of this.parts) {
      let x, y;
      if (P.kind === 'snow') { x = ((p.x * w + Math.sin(t + p.p) * 20 + t * 8 * p.s) % w + w) % w; y = (p.y * h + t * 30 * p.s) % h; g.beginPath(); g.arc(x, y, 2 + p.s * 2, 0, 7); g.fill(); }
      else if (P.kind === 'rain') { x = (p.x * w - t * 60) % w; x = (x + w) % w; y = (p.y * h + t * 500 * p.s) % h; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 14); g.stroke(); }
      else if (P.kind === 'leaves') { x = ((p.x * w - t * 25 * p.s) % w + w) % w; y = (p.y * h + t * 22 * p.s) % h; g.save(); g.translate(x, y); g.rotate(t * 2 + p.p); g.fillRect(-5, -2.5, 10, 5); g.restore(); }
      else if (P.kind === 'pollen') { x = (p.x * w + Math.sin(t * 0.5 + p.p) * 30) % w; y = p.y * h * 0.8 + Math.cos(t * 0.7 + p.p) * 12; g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + p.p); g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); g.globalAlpha = 1; }
      else { x = ((p.x * w - t * 70 * p.s) % w + w) % w; y = h * 0.55 + p.y * h * 0.45 + Math.sin(t * 2 + p.p) * 6; g.fillRect(x, y, 3 + p.s * 2, 2); }
    }
    g.restore();
  }
}

// ---------- animated mode preview art ----------
const pathPos = (t, i, w, h) => ({ x: w * (0.5 + Math.cos(t * 0.8 + i * 2.1) * 0.32), y: h * (0.55 + Math.sin(t * 1.1 + i * 1.3) * 0.25) });
export function drawModePreview(g, mode, w, h, t) {
  g.save();
  const grd = g.createLinearGradient(0, 0, 0, h);
  const bg = { quick: ['#8ee05e', '#5fb84a'], squad: ['#5a6ea8', '#38406e'], free: ['#5fd1c0', '#2a8a80'], showdown: ['#b07ae0', '#6a3fb0'] }[mode] || ['#888', '#444'];
  grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.18; g.fillStyle = '#fff';
  for (let x = 0; x < w; x += 24) for (let y = (x / 24) % 2 ? 0 : 12; y < h; y += 24) g.fillRect(x, y, 12, 12);
  g.globalAlpha = 1;
  const sc = Math.min(w / 320, h / 200) * 1.1;
  if (mode === 'showdown') { // the poison closing in
    const inset = (Math.sin(t * 0.6) * 0.5 + 0.5) * Math.min(w, h) * 0.3;
    g.fillStyle = 'rgba(70,200,90,.45)'; g.beginPath(); g.rect(0, 0, w, h); g.rect(inset, inset, w - inset * 2, h - inset * 2); g.fill('evenodd');
    g.setLineDash([12, 8]); g.lineWidth = 4; g.strokeStyle = '#d4ff4f'; g.strokeRect(inset, inset, w - inset * 2, h - inset * 2); g.setLineDash([]);
  }
  if (mode === 'free') { // four zones around a hub
    const cols = ['#8c93a8', '#5fb84a', '#ecc77e', '#e2eefb'];
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([i, j], k) => { g.globalAlpha = 0.55; g.fillStyle = cols[k]; g.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); });
    g.globalAlpha = 1; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.16, 0, 7); g.fillStyle = '#c7b8ff'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  }
  const ids = mode === 'squad' ? ['volt', 'brick', 'wisp', 'dune', 'rook', 'flicker'] : BRAWLER_IDS.slice(0, mode === 'quick' ? 4 : 3);
  ids.forEach((id, i) => {
    const p = pathPos(t, i, w, h);
    if (mode === 'squad') { g.beginPath(); g.arc(p.x, p.y + 2, 30 * sc, 0, 7); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = i < 3 ? '#3a86ff' : '#ff2846'; g.stroke(); }
    if (mode === 'quick' && i === 0) { g.font = `${22 * sc}px "Lilita One", sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = INK; g.strokeText('★5', p.x, p.y - 44 * sc); g.fillStyle = '#ffd23f'; g.fillText('★5', p.x, p.y - 44 * sc); }
    const q = pathPos(t + 0.05, i, w, h);
    drawBrawler(g, id, p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x), t, { scale: sc * 0.9, moving: true });
  });
  // bullets streaking across
  for (let k = 0; k < 3; k++) {
    const u = (t * 0.7 + k / 3) % 1;
    g.fillStyle = ['#3a86ff', '#ff7b39', '#8f5cff'][k]; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.ellipse(w * u, h * (0.3 + k * 0.2), 10 * sc, 6 * sc, 0, 0, 7); g.fill(); g.stroke();
  }
  g.restore();
}
