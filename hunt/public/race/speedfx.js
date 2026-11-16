// Oblivion GP speed feel, drawn every frame at almost no cost:
//  - world(): glints on the road around your car, smeared along your speed (the road rushes by)
//  - screen(): speed lines at the screen edges, wind streaks over the whole view, an edge blur
//    (one pre-rendered radial vignette + streak sprite faded in above ~70% of top speed, never a
//    real-time blur filter) and a short tunnel ring when a boost kicks in.
// Everything flows out from the point you are driving toward (straight up the screen in Chase and
// Cockpit, the way you are moving in Top-down). Low Graphics keeps only a few speed lines; Reduce
// Flashing drops the boost ring. Pools are fixed-size typed arrays: nothing is allocated per frame.
import { SETTINGS } from '../settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const NL = 26, NS = 18, ND = 30; // speed lines, wind streaks, road glints
const TINT = { desert: '255,226,180', frozen: '220,240,255', ashlands: '255,190,150', city: '200,230,255' };

// the edge blur: dark soft edges with fine radial streaks, painted once per screen size at a quarter
// of the resolution (it is all soft gradients) and stretched over the screen
function blurSprite(W, H) {
  const w = Math.max(16, Math.round(W / 4)), h = Math.max(16, Math.round(H / 4));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
  g.save(); g.translate(cx, cy); g.scale(1, h / w);
  const gr = g.createRadialGradient(0, 0, R * 0.42, 0, 0, R * 1.02);
  gr.addColorStop(0, 'rgba(6,4,18,0)'); gr.addColorStop(0.55, 'rgba(6,4,18,0.25)'); gr.addColorStop(1, 'rgba(6,4,18,0.7)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 1.1, 0, TAU); g.fill();
  g.restore();
  // motion streaks radiating out from the middle (only in the outer ring)
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const a = (i * 2.399963) % TAU, r0 = R * (0.55 + ((i * 0.618) % 1) * 0.25), r1 = r0 + R * (0.25 + ((i * 0.37) % 1) * 0.35);
    g.strokeStyle = `rgba(210,220,255,${0.05 + ((i * 0.13) % 1) * 0.07})`; g.lineWidth = 0.6 + (i % 3) * 0.5;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  return cv;
}

// boost: a cyan rush glowing in from the edges (same quarter-resolution trick)
function boostSprite(W, H) {
  const w = Math.max(16, Math.round(W / 4)), h = Math.max(16, Math.round(H / 4));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), R = Math.hypot(w / 2, h / 2);
  g.translate(w / 2, h / 2); g.scale(1, h / w);
  const gr = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.05);
  gr.addColorStop(0, 'rgba(95,244,255,0)'); gr.addColorStop(0.6, 'rgba(95,244,255,0.16)'); gr.addColorStop(1, 'rgba(160,120,255,0.55)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
  return cv;
}

export class SpeedFx {
  constructor() {
    this.L = new Float32Array(NL * 3); // angle (from the flow centre), distance, speed jitter
    this.S = new Float32Array(NS * 3);
    this.D = new Float32Array(ND * 3); // road glints: world x, y, alive
    for (let i = 0; i < NL; i++) { this.L[i * 3] = Math.random(); this.L[i * 3 + 1] = Math.random(); this.L[i * 3 + 2] = 0.7 + Math.random() * 0.6; }
    for (let i = 0; i < NS; i++) { this.S[i * 3] = Math.random(); this.S[i * 3 + 1] = Math.random(); this.S[i * 3 + 2] = 0.6 + Math.random() * 0.8; }
    this.blur = null; this.bw = 0; this.bh = 0;
    this.k = 0; // speed feel 0..1+, eased
    this.ring = 0; this.boostWas = false; this.boost = 0; this.bsp = null;
    this.fan = { a0: 0, a1: TAU }; this.c = { x: 0, y: 0 };
  }
  // the speed feel for this frame: spd px/s, top the car's top speed, boost 0|1
  level(spd, top, boost, dt) {
    const want = clamp((spd - top * 0.45) / (top * 0.65), 0, 1.15) + (boost ? 0.35 : 0);
    this.k += (want - this.k) * (1 - Math.exp(-dt * (want > this.k ? 5 : 2.5)));
    if (boost && !this.boostWas) this.ring = 1;
    this.boostWas = !!boost;
    this.ring = Math.max(0, this.ring - dt * 2.2);
    this.boost += ((boost ? 1 : 0) - this.boost) * (1 - Math.exp(-dt * (boost ? 8 : 3)));
    return this.k;
  }

  // road glints (world space, drawn under the cars): they sit still on the ground and are drawn
  // smeared along your velocity, so the faster you go the longer they streak past
  world(g, R, view, rc, dt) {
    const car = R.meCar, c = rc.car;
    if (!car || !c || !car.predicted || SETTINGS.lowGfx || this.k < 0.12) return;
    const vx = c.vx, vy = c.vy, spd = Math.hypot(vx, vy);
    if (spd < 250) return;
    const D = this.D, ux = vx / spd, uy = vy / spd, k = this.k, smear = 0.045 * Math.min(1.6, k + 0.3);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineWidth = 3;
    g.strokeStyle = `rgba(${TINT[R.T.world] || TINT.desert},${(0.1 + 0.16 * Math.min(1, k)).toFixed(3)})`;
    g.beginPath();
    for (let i = 0; i < ND; i++) {
      const j = i * 3;
      let x = D[j], y = D[j + 1];
      const rx = x - car.x, ry = y - car.y, along = rx * ux + ry * uy, side = -rx * uy + ry * ux;
      if (!D[j + 2] || along < -420 || along > 900 || Math.abs(side) > 520) {
        // respawn ahead of the car, spread across the road
        const fwd = 250 + Math.random() * 650, sd = (Math.random() - 0.5) * 760;
        x = D[j] = car.x + ux * fwd - uy * sd; y = D[j + 1] = car.y + uy * fwd + ux * sd; D[j + 2] = 1;
      }
      g.moveTo(x, y); g.lineTo(x + vx * smear, y + vy * smear);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }

  // screen space (HUD canvas, CSS px). S: { W, H, x, y: your car on screen, fx, fy: unit screen
  // direction you are driving toward, far: distance of the flow centre ahead (px) }
  screen(g, S, dt) {
    const k = this.k, low = SETTINGS.lowGfx;
    if (k < 0.04 && this.ring <= 0) return;
    const W = S.W, H = S.H, cx = S.x + S.fx * S.far, cy = S.y + S.fy * S.far, tint = TINT[S.world] || TINT.desert;
    this.fanOf(cx, cy, W, H);
    const F = this.fan, span = F.a1 - F.a0, Rmax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 40, Rmin = Math.max(0, this.nearOf(cx, cy, W, H) - 30);
    // edge blur (above ~70% of top speed; one stretched sprite)
    if (!low && k > 0.35) {
      if (!this.blur || this.bw !== W || this.bh !== H) { this.blur = blurSprite(W, H); this.bw = W; this.bh = H; }
      g.globalAlpha = clamp((k - 0.35) * 1.3, 0, 0.9);
      const ox = clamp((cx - W / 2) * 0.08, -W * 0.06, W * 0.06), oy = clamp((cy - H / 2) * 0.08, -H * 0.06, H * 0.06);
      g.drawImage(this.blur, ox - W * 0.04, oy - H * 0.04, W * 1.08, H * 1.08);
      g.globalAlpha = 1;
    }
    // boost: the edges rush cyan
    if (!low && this.boost > 0.03) {
      if (!this.bsp || this.bsp.W !== W || this.bsp.H !== H) { this.bsp = boostSprite(W, H); this.bsp.W = W; this.bsp.H = H; }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, this.boost) * 0.85;
      g.drawImage(this.bsp, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.lineCap = 'round';
    // speed lines: long, thin, only out at the edges (they never cross the middle of the screen)
    const nl = low ? 10 : NL, L = this.L, flow = 1 + k * 2.4;
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      const bo = this.boost > 0.4; // (boost: cyan, brighter and thicker)
      g.strokeStyle = pass ? `rgba(${bo ? '140,250,255' : tint},${((bo ? 0.75 : 0.5) * Math.min(1, k)).toFixed(3)})` : `rgba(255,255,255,${((bo ? 0.3 : 0.22) * Math.min(1, k)).toFixed(3)})`;
      g.lineWidth = (pass ? 1.6 : 3.2) * (bo ? 1.5 : 1);
      for (let i = pass; i < nl; i += 2) {
        const j = i * 3;
        let r = L[j + 1];
        r += dt * (0.25 + r) * flow * L[j + 2] * 1.3;
        if (r > 1) { r = Math.random() * 0.25; L[j] = Math.random(); }
        L[j + 1] = r;
        const a = F.a0 + L[j] * span, d = Rmin + r * (Rmax - Rmin), len = (24 + d * 0.22) * Math.min(1.3, k + 0.2);
        const ca = Math.cos(a), sa = Math.sin(a), x0 = cx + ca * d, y0 = cy + sa * d;
        const ex = (x0 - W / 2) / (W / 2), ey = (y0 - H / 2) / (H / 2);
        if (ex * ex + ey * ey < 0.5) continue; // the middle stays clear
        g.moveTo(x0, y0); g.lineTo(x0 + ca * len, y0 + sa * len);
      }
      g.stroke();
    }
    // wind streaks: short, faint, all over the view once you are really moving
    if (!low && k > 0.45) {
      const S2 = this.S;
      g.beginPath(); g.lineWidth = 2; g.strokeStyle = `rgba(${tint},${(0.16 * Math.min(1, k - 0.3)).toFixed(3)})`;
      for (let i = 0; i < NS; i++) {
        const j = i * 3;
        let r = S2[j + 1];
        r += dt * (0.3 + r) * flow * S2[j + 2];
        if (r > 1) { r = Math.random() * 0.15; S2[j] = Math.random(); }
        S2[j + 1] = r;
        const a = F.a0 + S2[j] * span, d = Rmin + r * (Rmax - Rmin), len = 10 + d * 0.08;
        const ca = Math.cos(a), sa = Math.sin(a), x0 = cx + ca * d, y0 = cy + sa * d;
        g.moveTo(x0, y0); g.lineTo(x0 + ca * len, y0 + sa * len);
      }
      g.stroke();
    }
    // boost: a quick tunnel ring rushing out from the flow centre (a flash: not with Reduce Flashing)
    if (this.ring > 0 && !SETTINGS.reduceFlash) {
      const f = 1 - this.ring, r = Rmin + f * (Rmax - Rmin);
      g.globalAlpha = this.ring * 0.5; g.lineWidth = 10 * this.ring + 2; g.strokeStyle = '#5ff4ff';
      g.beginPath(); g.arc(cx, cy, Math.max(1, r), F.a0, F.a0 + span); g.stroke();
      g.globalAlpha = 1;
    }
  }
  // the angles from the flow centre that cross the screen (all of them when it is on screen)
  fanOf(cx, cy, W, H) {
    const F = this.fan;
    if (cx >= 0 && cx <= W && cy >= 0 && cy <= H) { F.a0 = 0; F.a1 = TAU; return F; }
    const mid = Math.atan2(H / 2 - cy, W / 2 - cx);
    let lo = 0, hi = 0;
    for (let q = 0; q < 4; q++) {
      let d = Math.atan2((q & 2 ? H : 0) - cy, (q & 1 ? W : 0) - cx) - mid;
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    F.a0 = mid + lo; F.a1 = mid + hi;
    return F;
  }
  // distance from the flow centre to the nearest point of the screen
  nearOf(cx, cy, W, H) { const dx = cx < 0 ? -cx : cx > W ? cx - W : 0, dy = cy < 0 ? -cy : cy > H ? cy - H : 0; return Math.hypot(dx, dy); }
}

// COCKPIT: your bonnet across the bottom of the screen (screen space, under the speedometer), in
// your car's paint and neon, leaning a touch with the camera's sway
export function drawHood(g, W, H, SA, look, sway, t) {
  const w = Math.min(W * 0.62, H * 1.5), h = Math.min(H * 0.17, 74), cx = W / 2 - sway * W * 0.012, y = H - SA.b;
  const body = (look && look.body) || '#2a1f4a', neon = (look && look.neon) || '#5ff4ff';
  g.beginPath();
  g.moveTo(cx - w / 2, y + 2); g.quadraticCurveTo(cx - w * 0.47, y - h * 0.62, cx - w * 0.28, y - h * 0.86);
  g.quadraticCurveTo(cx, y - h * 1.04, cx + w * 0.28, y - h * 0.86); g.quadraticCurveTo(cx + w * 0.47, y - h * 0.62, cx + w / 2, y + 2); g.closePath();
  g.fillStyle = body; g.fill();
  g.lineWidth = 4; g.strokeStyle = '#12091e'; g.stroke();
  // a soft shine and the neon edge line along the bonnet
  g.globalAlpha = 0.18; g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(cx - w * 0.12, y - h * 0.62, w * 0.16, h * 0.13, -0.08, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.9; g.lineWidth = 2.5; g.strokeStyle = neon;
  g.beginPath(); g.moveTo(cx - w * 0.44, y - h * 0.2); g.quadraticCurveTo(cx - w * 0.4, y - h * 0.6, cx - w * 0.25, y - h * 0.76); g.quadraticCurveTo(cx, y - h * 0.92, cx + w * 0.25, y - h * 0.76); g.quadraticCurveTo(cx + w * 0.4, y - h * 0.6, cx + w * 0.44, y - h * 0.2); g.stroke();
  g.globalAlpha = 1;
}
