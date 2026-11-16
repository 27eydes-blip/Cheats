// Oblivion GP ELIMINATION: what the player sees of the mode (presentation only; the server decides
// every cut, the black hole and who is in danger: md.dg / md.nx / md.iv / md.bh / md.duel, me.bg).
//  - the black hole: cached sprites (core + two spiral layers), drawn on the track at md.bh and turned
//    each frame (no gradient is ever built per frame)
//  - the racer in danger (last place): a red outline that pulses (steady with Reduce Flashing), a
//    countdown ring to the cut and a DANGER tag until the cut
//  - the screen edges darken and a warning pulse sounds as the hole gets close to you
//  - the cut / swallow implosion, the FINAL DUEL tag, the spectator header
import { SETTINGS } from '../settings.js';
import { ELIM } from './protocol.js';
import { label } from './hud.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const RED = '#ff3b4f';
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h || w; return cv; }
// the hole: a black core, a hot violet / magenta accretion ring and a faint lensing halo
function coreSprite(S) {
  const cv = canvas(S), g = cv.getContext('2d'), c = S / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.36, 'rgba(0,0,0,1)'); gr.addColorStop(0.42, 'rgba(40,6,60,1)');
  gr.addColorStop(0.47, 'rgba(255,90,210,0.95)'); gr.addColorStop(0.52, 'rgba(150,60,255,0.75)'); gr.addColorStop(0.64, 'rgba(70,20,140,0.45)');
  gr.addColorStop(0.82, 'rgba(30,8,70,0.25)'); gr.addColorStop(1, 'rgba(10,0,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return cv;
}
// spiral arms (drawn additively and turned every frame)
function swirlSprite(S, arms, col, tw) {
  const cv = canvas(S), g = cv.getContext('2d'), c = S / 2;
  g.translate(c, c); g.lineCap = 'round';
  for (let k = 0; k < arms; k++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const f = i / 40, r = c * (0.42 + f * 0.56), a = (k / arms) * TAU + f * tw;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.strokeStyle = col; g.lineWidth = S * 0.035; g.globalAlpha = 0.55; g.stroke();
    g.lineWidth = S * 0.012; g.globalAlpha = 0.9; g.stroke();
  }
  return cv;
}
// screen edges darkening toward black (one quarter-resolution image per screen size)
function edgeSprite(W, H) {
  const w = Math.max(8, Math.round(W / 4)), h = Math.max(8, Math.round(H / 4)), cv = canvas(w, h), g = cv.getContext('2d');
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.hypot(w, h) / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, 'rgba(12,0,24,0.45)'); gr.addColorStop(0.7, 'rgba(6,0,14,0.85)'); gr.addColorStop(1, 'rgba(2,0,6,1)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return cv;
}

// race distance (px along the main loop, any lap) -> world point on the centre line, no allocation
export function holeAt(T, bh, out) {
  const c = T.corridors[0], L = c.len || T.L, s = ((bh % L) + L) % L;
  let lo = 0, hi = c.segs - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.s[m] <= s) lo = m; else hi = m - 1; }
  const t = s - c.s[lo];
  out.x = c.px[lo] + c.tx[lo] * t; out.y = c.py[lo] + c.ty[lo] * t; out.a = Math.atan2(c.ty[lo], c.tx[lo]);
  return out;
}
// 0 (far) .. 1 (touching): how close the hole is, from your lead on it (me.bg, px)
export const holeNear = (bg) => (bg == null ? 0 : clamp(1 - (bg - ELIM.hole.reach) / (ELIM.hole.warn - ELIM.hole.reach), 0, 1));
// the danger ring: share of the cut timer left (1 = just started, 0 = the cut)
export const ringLeft = (md) => (md && md.iv > 0 ? clamp(md.nx / md.iv, 0, 1) : 0);

export class ElimFx {
  constructor({ low = SETTINGS.lowGfx } = {}) {
    const S = low ? 160 : 256;
    this.core = coreSprite(S);
    this.sw1 = swirlSprite(S, 3, '#ff7ae0', 2.6);
    this.sw2 = swirlSprite(S, 2, '#8fdcff', -2.0);
    this.edge = null; this.eW = 0; this.eH = 0;
    this.hp = { x: 0, y: 0, a: 0 }; // the hole's world point (reused)
    this.sp = { x: 0, y: 0, k: 1 }; // screen point scratch
    this.booms = []; // implosions {x, y, t}
    this.spin = 0; this.warnT = 0; this.near = 0;
  }
  // a car was cut or swallowed at (x, y): it collapses into a point
  implode(x, y) { if (this.booms.length > 6) this.booms.shift(); this.booms.push({ x, y, t: 0 }); }

  // world layer (camera transform set): the hole, implosions, the red outline + countdown ring
  world(g, R, view, rc, dt) {
    const md = view.hud || {}, T = R.T, steady = SETTINGS.reduceFlash;
    this.spin += dt;
    const bh = view.hole != null ? view.hole : md.bh;
    if (bh != null && T && T.corridors && T.corridors.length) {
      const p = holeAt(T, bh, this.hp), r = ELIM.hole.r, vw = R.view;
      if (p.x + r * 1.6 > vw.x0 && p.x - r * 1.6 < vw.x1 && p.y + r * 1.6 > vw.y0 && p.y - r * 1.6 < vw.y1) {
        const D = r * 2.3;
        R.at(g, p.x, p.y, this.spin * 0.35); g.drawImage(this.core, -D / 2, -D / 2, D, D);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.8; R.at(g, p.x, p.y, this.spin * 1.4); g.drawImage(this.sw1, -D / 2, -D / 2, D, D);
        g.globalAlpha = 0.5; R.at(g, p.x, p.y, -this.spin * 0.9); g.drawImage(this.sw2, -D * 0.45, -D * 0.45, D * 0.9, D * 0.9);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        R.at(g, p.x, p.y, 0, 1); g.drawImage(this.core, -D * 0.25, -D * 0.25, D * 0.5, D * 0.5); // the core on top of the arms
        R.base(g);
      }
    }
    // implosions: a ring collapsing inward and a dark flash
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      if (b.t > 0.7) { this.booms.splice(i, 1); continue; }
      const f = b.t / 0.7;
      R.base(g);
      g.globalAlpha = 1 - f; g.lineWidth = 8 * (1 - f) + 2; g.strokeStyle = '#ff7ae0';
      g.beginPath(); g.arc(b.x, b.y, 90 * (1 - f) + 6, 0, TAU); g.stroke();
      g.globalAlpha = (1 - f) * 0.9; R.at(g, b.x, b.y, this.spin * 2); g.drawImage(this.core, -60 * (1 - f * 0.7), -60 * (1 - f * 0.7), 120 * (1 - f * 0.7), 120 * (1 - f * 0.7));
      R.base(g); g.globalAlpha = 1;
    }
    // the racer in danger: red outline (pulsing; steady with Reduce Flashing) and the countdown ring
    if (md.dg && view.countdown <= 0) {
      const c = R.carAt(view, md.dg);
      if (c && !(c.f & 32)) {
        const pulse = steady ? 0.85 : 0.55 + 0.45 * Math.sin(R.t * 7.5);
        R.base(g);
        g.lineWidth = 6; g.strokeStyle = RED; g.globalAlpha = pulse;
        g.beginPath(); g.arc(c.x, c.y, 44, 0, TAU); g.stroke();
        const left = ringLeft(md);
        g.globalAlpha = 0.35; g.lineWidth = 5; g.strokeStyle = '#ffffff';
        g.beginPath(); g.arc(c.x, c.y, 54, 0, TAU); g.stroke();
        if (left > 0) { g.globalAlpha = 0.95; g.strokeStyle = left < 0.25 ? RED : '#ffd23f'; g.beginPath(); g.arc(c.x, c.y, 54, -Math.PI / 2, -Math.PI / 2 + TAU * left); g.stroke(); }
        g.globalAlpha = 1;
      }
    }
  }

  // screen layer (CSS px, dpr transform set): dark edges + warning pulse, the DANGER tag, the duel and
  // spectator labels. o: { W, H, SA, dpr, view, me, R, rc, play, name }
  screen(g, o) {
    const { W, H, dpr, view, me, R } = o, md = view.hud || {}, steady = SETTINGS.reduceFlash;
    const u = clamp(Math.min(H / 375, W / 667), 0.8, 1.6);
    // the hole close behind you: the edges go dark, a warning pulse speeds up
    const k = me && !me.out && view.countdown <= 0 ? holeNear(me.bg) : 0;
    this.near += (k - this.near) * Math.min(1, o.dt * 6);
    if (this.near > 0.02) {
      if (!this.edge || this.eW !== W || this.eH !== H) { this.edge = edgeSprite(W, H); this.eW = W; this.eH = H; }
      const throb = steady ? 1 : 0.85 + 0.15 * Math.sin(R.t * (5 + this.near * 7));
      g.globalAlpha = clamp(this.near * 1.1 * throb, 0, 1); g.drawImage(this.edge, 0, 0, W, H); g.globalAlpha = 1;
    }
    if (k > 0.05) {
      this.warnT -= o.dt;
      if (this.warnT <= 0) { this.warnT = 0.95 - k * 0.6; o.play('holewarn', 0.35 + k * 0.65); }
    } else this.warnT = 0;
    // DANGER tag over the racer in danger until the cut (upright in every camera view)
    if (md.dg && view.countdown <= 0 && md.nx > 0) {
      const c = R.carAt(view, md.dg);
      if (c && !(c.f & 32)) {
        const p = R.toScreen(c.x, c.y, this.sp), y = p.y - 46 * u;
        if (p.x > -60 && p.x < W + 60 && p.y > -60 && p.y < H + 60) {
          g.globalAlpha = steady ? 1 : 0.75 + 0.25 * Math.sin(R.t * 7.5);
          const w = label(g, 'DANGER', p.x, y, Math.round(14 * u), RED, 'center', dpr);
          g.globalAlpha = 1;
          label(g, String(Math.ceil(md.nx)), p.x + w / 2 + 12 * u, y, Math.round(14 * u), '#ffffff', 'center', dpr);
        }
      }
    }
    // spectating: who you are watching (the item / weapon slots are hidden then)
    const Tp = o.SA.t + 8;
    if (me && me.out) {
      label(g, 'SPECTATING', W / 2, Tp + 12 * u, Math.round(17 * u), '#5ff4ff', 'center', dpr);
      const lead = view.ranks && view.ranks[0];
      if (lead !== this.leadId || me.out !== this.outN) { this.leadId = lead; this.outN = me.out; this.sub = `Out in ${ORD(me.out)} · following ${lead ? o.name(lead) : 'the leader'}`; }
      label(g, this.sub, W / 2, Tp + 32 * u, Math.round(12 * u), '#ffffff', 'center', dpr);
    }
    if (md.duel) label(g, 'FINAL DUEL', W / 2, Tp + (me && me.out ? 88 : 98) * u, Math.round(13 * u), '#ffd23f', 'center', dpr);
  }
}
