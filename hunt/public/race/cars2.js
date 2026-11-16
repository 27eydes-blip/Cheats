// Oblivion GP unlockable cars: eight original neon cars drawn in code, top down, nose along +x,
// in the same style as cars.js (dark glossy body, glowing neon outline, underglow), each with its
// own silhouette so they read apart at phone size:
//
//   void    VOIDRUNNER      rare       low black-and-violet chevron with a notched tail, void slits
//   fang    SOLAR FANG      rare       orange-gold wedge with two forward fangs and a sun emblem; flame trail
//   frost   FROSTBYTE       rare       faceted ice-blue body with crystal fins and a diamond canopy
//   grav    GRAVITON        epic       round floating pod inside a glowing ring: no wheels, no pads
//   vx      PHANTOM VX      epic       see-through prototype, wheels in outrigger pods, chassis visible inside
//   redline REDLINE ZERO    epic       long red-and-white bullet with tail fins and a zero roundel
//   helix   HELIX           legendary  twin bodies around a spinning energy core
//   prime   OBLIVION PRIME  legendary  chrome-black with animated galaxy paint, a mini black hole under it
//
// Same API shape as cars.js (CarSprites, blitCar, drawCar, drawUnderglow, drawCarPreview, glowDot,
// exhaustsOf, taillightsOf, headOf, CAR_IDS, BUCKETS, INK, mix, rgba, patternMix); the six starter
// cars are passed through to cars.js, so swapping the import is the whole integration. Extras:
// drawBoostTrail (the new trail styles), CAR2_IDS, spinOf.
//
// Per frame a car is one atlas blit plus at most two cross-faded animation cells and one small
// rotating sprite (GRAVITON's ring lights, HELIX's core): the neon glow is baked at build time.
import * as C1 from './cars.js';
import { makeLook, NEON_GLOW, glowA, isNewCar } from './looks2.js';

export const { INK, BUCKETS, mix, rgba, glowDot, patternMix } = C1;
const HALF = 46;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ small helpers (as in cars.js)
const rr = (g, x, y, w, h, r) => { g.beginPath(); sub(g, x, y, w, h, r); };
const sub = (g, x, y, w, h, r) => { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const poly = (g, pts) => { g.beginPath(); addPoly(g, pts); };
const addPoly = (g, pts) => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
const mirror = (pts) => { const out = pts.slice(); for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], -pts[i + 1]); return out; };
const flipY = (pts) => pts.map((v, i) => (i & 1 ? -v : v));
let SB = 1;
const glow = (g, c, b) => { g.shadowColor = glowA(c); g.shadowBlur = b * SB; g.shadowOffsetX = 0; g.shadowOffsetY = 0; };
const noGlow = (g) => { g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; };
const tube = (g, c, w, core = null, b = 5) => {
  g.lineJoin = 'round'; g.lineCap = 'round';
  glow(g, c, b); g.strokeStyle = c; g.lineWidth = w; g.stroke(); g.stroke();
  noGlow(g); g.strokeStyle = core || mix(c, '#ffffff', 0.55); g.lineWidth = Math.max(0.5, w * 0.42); g.stroke();
};
const dark = (g, fill, lw = 3) => { g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); };
const dot = (g, x, y, r, c, b = 6) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = mix(c, '#ffffff', 0.45); glow(g, c, b); g.fill(); noGlow(g); };
// a four-point sparkle (frost glints, galaxy stars)
const sparkle = (g, x, y, r) => { g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); };
function tyreBase(g, x, y, w, h) {
  rr(g, x - w / 2, y - h / 2, w, h, Math.min(2.6, h / 2.5)); dark(g, '#0b0a10', 2.2);
  g.strokeStyle = '#1c1b24'; g.lineWidth = 1.2; g.beginPath();
  for (let k = -w / 2 + 2.5; k < w / 2 - 1; k += 3.4) { g.moveTo(x + k, y - h / 2 + 1); g.lineTo(x + k, y + h / 2 - 1); }
  g.stroke();
}
function tyreNeon(g, L, x, y, w, h) {
  const rw = w * 0.62, rh = Math.max(1.6, h * 0.34);
  rr(g, x - rw / 2, y - rh / 2, rw, rh, rh / 2); tube(g, L.rim, 1.3, null, 4);
  g.strokeStyle = mix(L.rim, '#ffffff', 0.5); g.lineWidth = 0.7; g.beginPath();
  for (let k = 0; k < L.spokes; k++) { const sx = x - rw / 2 + (rw * (k + 0.5)) / L.spokes; g.moveTo(sx, y - rh / 2 - 0.6); g.lineTo(sx, y + rh / 2 + 0.6); }
  g.stroke();
}
const arch = (g, c, x, y, r, s, lw = 1.4) => { g.beginPath(); g.arc(x, y, r, s < 0 ? Math.PI + 0.35 : 0.35, s < 0 ? -0.35 : Math.PI - 0.35); tube(g, c, lw, null, 4); };
const lights = (g, pts, c, w = 1.6, b = 6) => { g.beginPath(); for (let i = 0; i < pts.length; i += 4) { g.moveTo(pts[i], pts[i + 1]); g.lineTo(pts[i + 2], pts[i + 3]); } tube(g, c, w, '#ffffff', b); };
const HEAD = '#e8f4ff', TAIL = '#ff2a3a';
const S2 = [-1, 1];

// ------------------------------------------------------------------ the eight cars
// each: tyres [[x, y, w, h]] (none for GRAVITON), body(g) path (clip for paint), base(g, L) dark
// parts, neon(g, L) glowing parts, anim(g, L, which) optional A/B animation layers, spin optional
// {x, y, r, w, draw(g, L)} rotating sprite, exhaust / tail / head attachment points.
const CARS = {
  // VOIDRUNNER: a low chevron; the tail is a deep notch the flames come out of
  void: {
    tyres: [[13, -11.5, 11, 6], [13, 11.5, 11, 6], [-10, -16, 12, 7], [-10, 16, 12, 7]],
    outline: mirror([36, 0, 22, -5, 8, -9.5, -6, -13, -20, -17, -30, -19.5, -27, -12.5, -21, -8, -14, -3, -12, 0]),
    spine: mirror([30, 0, 16, -2.8, -3, -5, -9, -2.4, -9, 0]),
    canopy: mirror([13, 0, 8, -3.6, -3, -4.6, -7, -2.6, -7, 0]),
    body(g) { poly(g, this.outline); },
    base(g, L) {
      this.body(g); dark(g, L.body);
      poly(g, this.spine); g.fillStyle = mix(L.body, L.neon, 0.14); g.fill();
      poly(g, this.canopy); dark(g, '#020108', 1.4);
      g.beginPath(); for (const s of S2) { g.moveTo(-4, s * 11.5); g.lineTo(-26, s * 17.5); } g.strokeStyle = mix(L.body, '#ffffff', 0.08); g.lineWidth = 2; g.stroke(); // wing creases
      g.beginPath(); for (const s of S2) { g.moveTo(26, s * 2.4); g.lineTo(9, s * 6.4); } g.strokeStyle = '#000000'; g.lineWidth = 2.2; g.stroke(); // void slits
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.5);
      poly(g, this.canopy); tube(g, L.neon2, 0.8, null, 3);
      g.beginPath(); for (const s of S2) { g.moveTo(-6, s * 13); g.lineTo(-30, s * 19.5); } tube(g, L.neon2, 0.7, '#ffffff', 3); // wing leading edges
      g.beginPath(); for (const s of S2) { g.moveTo(-27, s * 12.5); g.lineTo(-21, s * 8); g.lineTo(-14, s * 3); } tube(g, L.neon, 1.7, null, 7); // glowing notch lips
      for (const s of S2) { arch(g, L.neon, 13, s * 9.5, 6.5, s, 1.1); arch(g, L.neon, -10, s * 14, 7, s, 1.1); }
      lights(g, [31, -1.8, 24, -4.2, 31, 1.8, 24, 4.2], HEAD, 1.3);
      lights(g, [-29.5, -18.5, -26.5, -13.5, -29.5, 18.5, -26.5, 13.5], TAIL, 1.4);
    },
    // violet energy running down the void slits (two phases cross-faded)
    anim(g, L, which) {
      g.beginPath();
      for (const s of S2) for (let k = 0; k < 4; k++) { const f0 = (k + which * 0.5) / 4, f1 = f0 + 0.12; g.moveTo(26 - 17 * f0, s * (2.4 + 4 * f0)); g.lineTo(26 - 17 * f1, s * (2.4 + 4 * f1)); }
      tube(g, L.neon, 1.4, '#ffffff', 5);
    },
    exhaust: [[-16, -5], [-16, 5]], tail: [[-28, -16], [-28, 16]], head: 33,
  },

  // SOLAR FANG: a wedge with two fangs reaching forward, the cabin set far back, a sun on the hood
  fang: {
    tyres: [[15, -17.5, 14, 8], [15, 17.5, 14, 8], [-14, -17.5, 15, 9], [-14, 17.5, 15, 9]],
    outline: mirror([20, 0, 23.5, -3.5, 36, -8.5, 30, -12.5, 22, -14.5, 8, -15, -10, -14.5, -22, -12, -28, -7, -29.5, -3]),
    hood: mirror([21, 0, 23, -3, 14, -11, -1, -11, -1, 0]),
    glass: mirror([-2, 0, -4, -8.5, -15, -9, -18, -6, -18, 0]),
    body(g) { poly(g, this.outline); },
    base(g, L) {
      this.body(g); dark(g, L.body);
      poly(g, this.hood); g.fillStyle = mix(L.body, L.neon, 0.2); g.fill();
      poly(g, this.glass); dark(g, '#060308', 1.6);
      g.beginPath(); for (let x = -26; x <= -20; x += 2) { g.moveTo(x, -8); g.lineTo(x, 8); } g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); // engine louvres
      for (const s of S2) { g.beginPath(); g.arc(-28.5, s * 4, 2.6, 0, TAU); dark(g, '#2a1a10', 1.6); }
      g.beginPath(); g.arc(9, 0, 4.4, 0, TAU); dark(g, '#120802', 1.4); // sun disc
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.6);
      g.beginPath(); for (const s of S2) { g.moveTo(20, 0); g.lineTo(23.5, s * 3.5); g.lineTo(36, s * 8.5); g.moveTo(30, s * 12.5); g.lineTo(18, s * 10); g.lineTo(4, s * 11.5); } tube(g, L.neon2, 0.8, '#ffffff', 4); // fang edges
      poly(g, this.glass); tube(g, L.neon2, 0.8, null, 3);
      g.beginPath(); g.arc(9, 0, 3.2, 0, TAU); tube(g, L.neon2, 1, '#ffffff', 6);
      for (const s of S2) { g.beginPath(); g.arc(-28.5, s * 4, 1.6, 0, TAU); tube(g, L.neon, 0.9, null, 5); }
      for (const s of S2) { arch(g, L.neon, 15, s * 15, 8.5, s, 1.5); arch(g, L.neon, -14, s * 15, 9, s, 1.5); }
      lights(g, [34.5, -8.6, 29, -11.4, 34.5, 8.6, 29, 11.4], '#fff0b0', 1.4);
      lights(g, [-28.6, -6.6, -26.5, -10.6, -28.6, 6.6, -26.5, 10.6], TAIL, 1.6);
    },
    // the sun's rays: even rays on A, odd on B (it turns and breathes as they cross-fade)
    anim(g, L, which) {
      g.beginPath();
      for (let k = which; k < 12; k += 2) { const a = (k / 12) * TAU; g.moveTo(9 + Math.cos(a) * 5.4, Math.sin(a) * 5.4); g.lineTo(9 + Math.cos(a) * (which ? 7.4 : 8.6), Math.sin(a) * (which ? 7.4 : 8.6)); }
      tube(g, L.neon2, 0.9, '#ffffff', 5);
    },
    exhaust: [[-30, -4], [-30, 4]], tail: [[-28, -8], [-28, 8]], head: 30,
  },

  // FROSTBYTE: faceted body, three crystal fins a side swept back, a diamond canopy
  frost: {
    tyres: [[16, -12.5, 12, 6.5], [16, 12.5, 12, 6.5], [-21, -12, 11, 7], [-21, 12, 11, 7]],
    outline: mirror([32, 0, 24, -6, 12, -10, -2, -11, -16, -10.5, -25, -8, -29, -4]),
    fins: [[11, -9.8, 6, -16, 4, -10.4], [5, -10.6, -2, -22.5, -4, -10.9], [-6, -10.9, -15, -22, -12, -10.7]],
    canopy: [14, 0, 2, -6.5, -12, 0, 2, 6.5],
    body(g) { poly(g, this.outline); },
    finPath(g) { g.beginPath(); for (const f of this.fins) { addPoly(g, f); addPoly(g, flipY(f)); } },
    base(g, L) {
      this.finPath(g); g.fillStyle = rgba(L.neon, 0.28); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke(); // ice fins
      this.body(g); dark(g, L.body);
      poly(g, mirror([30, 0, 22, -4.6, 15, -5, 15, 0])); g.fillStyle = mix(L.body, L.neon, 0.18); g.fill(); // nose facet
      poly(g, mirror([-14, 0, -16, -7, -25, -6, -27, 0])); g.fillStyle = mix(L.body, L.neon, 0.1); g.fill(); // tail facet
      poly(g, this.canopy); dark(g, mix('#04121c', L.neon, 0.15), 1.4);
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.4);
      this.finPath(g); tube(g, L.neon2, 0.9, '#ffffff', 6);
      g.beginPath(); for (const f of this.fins) for (const s of S2) { const mx = (f[0] + f[4]) / 2, my = (f[1] + f[5]) / 2; g.moveTo(mx, -s * my); g.lineTo(f[2], -s * f[3]); } tube(g, L.neon, 0.6, null, 2); // fin facet ridges
      poly(g, this.canopy); tube(g, L.neon2, 0.9, null, 4);
      g.beginPath(); g.moveTo(14, 0); g.lineTo(-12, 0); g.moveTo(2, -6.5); g.lineTo(2, 6.5); tube(g, L.neon2, 0.5, '#ffffff', 2); // canopy facets
      g.beginPath(); for (const s of S2) { g.moveTo(30, 0); g.lineTo(22, s * 4.6); g.lineTo(15, s * 5); } tube(g, L.neon2, 0.6, '#ffffff', 3);
      for (const s of S2) { arch(g, L.neon, 16, s * 10, 7, s, 1.1); arch(g, L.neon, -21, s * 9.5, 6.5, s, 1.1); }
      lights(g, [29, -2.2, 24, -5.2, 29, 2.2, 24, 5.2], HEAD, 1.3);
      lights(g, [-28.4, -4.2, -25.6, -7.4, -28.4, 4.2, -25.6, 7.4], TAIL, 1.3);
    },
    // glints that hop between the fin tips and the canopy
    anim(g, L, which) {
      g.beginPath();
      const pts = which ? [6, -16, -15, -22, 2, 6.5, -2, 22.5, 24, 0] : [-2, -22.5, 6, 16, -15, 22, 2, -6.5, -12, 0];
      for (let i = 0; i < pts.length; i += 2) sparkle(g, pts[i], pts[i + 1], 2.6);
      tube(g, '#ffffff', 0.7, '#ffffff', 5);
    },
    exhaust: [[-29, -3], [-29, 3]], tail: [[-27, -5.5], [-27, 5.5]], head: 30,
  },

  // GRAVITON: a teardrop pod floating inside a glowing ring on four struts. No wheels, no pads.
  grav: {
    tyres: [],
    ringR: 22.5,
    body(g) { g.beginPath(); g.moveTo(19, 0); g.bezierCurveTo(16, -9, 6, -12.5, -4, -12); g.bezierCurveTo(-13, -11.5, -17, -6, -17, 0); g.bezierCurveTo(-17, 6, -13, 11.5, -4, 12); g.bezierCurveTo(6, 12.5, 16, 9, 19, 0); g.closePath(); },
    ring(g, r) { g.beginPath(); g.arc(0, 0, r, 0, TAU); },
    base(g, L) {
      const R = this.ringR;
      g.beginPath(); g.arc(0, 0, R + 2.6, 0, TAU); g.arc(0, 0, R - 2.6, 0, TAU, true); dark(g, L.body, 2.2); // the ring
      g.beginPath(); for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; g.moveTo(Math.cos(a) * 10, Math.sin(a) * 9); g.lineTo(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2)); } g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = mix(L.body, '#ffffff', 0.12); g.lineWidth = 1.6; g.stroke(); // struts
      this.body(g); dark(g, L.body);
      g.beginPath(); g.ellipse(5, 0, 8.5, 6.6, 0, 0, TAU); dark(g, '#020a08', 1.4); // dome
      g.beginPath(); g.ellipse(3, -2.4, 4, 1.6, -0.2, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fill();
      g.beginPath(); g.arc(-12, 0, 3.4, 0, TAU); dark(g, '#0a1a16', 1.4); // ion thruster
    },
    neon(g, L) {
      const R = this.ringR;
      this.ring(g, R + 2.6); tube(g, L.neon, 1.3, null, 6);
      this.ring(g, R - 2.6); tube(g, L.neon, 0.9, null, 4);
      this.ring(g, R); tube(g, L.neon2, 0.6, '#ffffff', 8);
      this.body(g); tube(g, L.neon, 1.3);
      g.beginPath(); g.ellipse(5, 0, 8.5, 6.6, 0, 0, TAU); tube(g, L.neon2, 0.8, null, 3);
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; dot(g, Math.cos(a) * R, Math.sin(a) * R, 1.8, L.neon, 7); } // ring emitters
      g.beginPath(); g.arc(-12, 0, 2, 0, TAU); tube(g, L.neon, 1, '#ffffff', 6);
      lights(g, [17, -2.6, 14.5, -5.6, 17, 2.6, 14.5, 5.6], HEAD, 1.2);
      lights(g, [-R - 1, -5, -R - 1, -2, -R - 1, 2, -R - 1, 5], TAIL, 1.4);
    },
    // two lights orbiting along the ring (rotated live)
    spin: {
      x: 0, y: 0, r: 30, w: 1.7,
      draw(g, L) {
        const R = 22.5;
        for (const a0 of [0, Math.PI]) { g.beginPath(); g.arc(0, 0, R, a0, a0 + 0.9); tube(g, L.neon2, 2.2, '#ffffff', 9); dot(g, Math.cos(a0 + 0.9) * R, Math.sin(a0 + 0.9) * R, 2.4, L.neon2, 10); }
      },
    },
    bob: true,
    exhaust: [[-26, 0]], tail: [[-24, -4], [-24, 4]], head: 24,
  },

  // PHANTOM VX: a see-through prototype. Fuselage, outrigger wheel pods and wing are glass-thin, so
  // the road and the chassis inside (frame tubes, engine, seat) show through.
  vx: {
    tyres: [[16, -16, 12, 5.5], [16, 16, 12, 5.5], [-15, -16.5, 13, 6], [-15, 16.5, 13, 6]],
    outline: mirror([37, 0, 29, -3.6, 15, -6.6, 0, -8, -14, -8, -24, -6.5, -31, -3]),
    pods: [[16, 16, 18, 8], [-15, 16.5, 19, 9]],
    body(g) { poly(g, this.outline); for (const [x, y, w, h] of this.pods) for (const s of S2) sub(g, x - w / 2, s * y - h / 2, w, h, h / 2); },
    shell(g) {
      g.beginPath(); addPoly(g, this.outline);
      for (const s of S2) { addPoly(g, [12, s * 6.6, 20, s * 13, 22, s * 13, 18, s * 6.2]); addPoly(g, [-8, s * 8, -12, s * 13, -18, s * 13, -20, s * 7.3]); } // side wings to the pods
      rr(g, -32, -19, 4, 38, 1.6); g.closePath();
    },
    base(g, L) {
      this.shell(g); g.fillStyle = rgba(L.body, 0.42); g.fill();
      for (const [x, y, w, h] of this.pods) for (const s of S2) { rr(g, x - w / 2, s * y - h / 2, w, h, h / 2); g.fillStyle = rgba(L.body, 0.4); g.fill(); }
      // the chassis seen through the glass
      g.strokeStyle = rgba(L.neon2, 0.32); g.lineWidth = 0.9; g.beginPath();
      g.moveTo(30, 0); g.lineTo(-28, 0); for (const s of S2) { g.moveTo(26, s * 2.6); g.lineTo(-26, s * 4.4); g.moveTo(16, s * 3); g.lineTo(16, s * 13); g.moveTo(-15, s * 4.2); g.lineTo(-15, s * 13.5); }
      for (let x = 22; x > -24; x -= 8) { g.moveTo(x, -3); g.lineTo(x - 4, 3.5); }
      g.stroke();
      rr(g, -22, -4.2, 11, 8.4, 2); g.strokeStyle = rgba(L.neon, 0.55); g.lineWidth = 1; g.stroke(); // engine
      g.beginPath(); for (let x = -20; x <= -13; x += 2.4) { g.moveTo(x, -3.4); g.lineTo(x, 3.4); } g.strokeStyle = rgba(L.neon, 0.35); g.stroke();
      g.beginPath(); g.ellipse(3, 0, 4, 2.8, 0, 0, TAU); g.strokeStyle = rgba(L.neon2, 0.5); g.stroke(); // seat
    },
    neon(g, L) {
      poly(g, this.outline); tube(g, L.neon, 1.2, null, 6);
      for (const [x, y, w, h] of this.pods) for (const s of S2) { rr(g, x - w / 2, s * y - h / 2, w, h, h / 2); tube(g, L.neon, 1, null, 5); }
      g.beginPath(); for (const s of S2) { g.moveTo(12, s * 6.6); g.lineTo(20, s * 12); g.moveTo(-20, s * 7.3); g.lineTo(-18, s * 12); } tube(g, L.neon2, 0.6, null, 3);
      rr(g, -32, -19, 4, 38, 1.6); tube(g, L.neon, 1, null, 6); // rear blade
      g.beginPath(); g.moveTo(20, 0); g.bezierCurveTo(16, -5.2, 4, -5.6, -4, -4); g.bezierCurveTo(-8, -2, -8, 2, -4, 4); g.bezierCurveTo(4, 5.6, 16, 5.2, 20, 0); tube(g, L.neon2, 0.8, null, 4); // canopy
      lights(g, [33, -1.6, 27, -3.6, 33, 1.6, 27, 3.6], HEAD, 1.2);
      lights(g, [-30, -18, -30, -12, -30, 12, -30, 18], TAIL, 1.3);
    },
    // a soft light band sliding through the glass (two positions cross-faded)
    anim(g, L, which) {
      g.save(); this.shell(g); g.clip();
      const x = which ? -14 : 14;
      g.beginPath(); g.moveTo(x - 3, -20); g.lineTo(x + 3, 20);
      g.strokeStyle = rgba(L.neon2, 0.55); g.lineWidth = 5; g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.4; g.stroke();
      g.restore();
    },
    ghost: true,
    exhaust: [[-30, 0]], tail: [[-30, -15.5], [-30, 15.5]], head: 34,
  },

  // REDLINE ZERO: a long narrow bullet, white twin stripes nose to tail, delta tail fins, a zero roundel
  redline: {
    tyres: [[20, -10.4, 11, 4.6], [20, 10.4, 11, 4.6], [-14, -10.4, 12, 5], [-14, 10.4, 12, 5]],
    outline: mirror([39, 0, 37.5, -3.6, 33, -6.6, 25, -8.6, 14, -9.2, -12, -9.2, -24, -8.4, -30, -7, -33, -3.6]),
    fin: [-14, -8.8, -31, -17.5, -34, -16.5, -30, -7.2],
    body(g) { poly(g, this.outline); },
    base(g, L) {
      g.beginPath(); addPoly(g, this.fin); addPoly(g, flipY(this.fin)); dark(g, L.body, 2);
      this.body(g); dark(g, L.body);
      poly(g, mirror([36, 0, 32, -5, 22, -6.8, -22, -6.6, -29, -4.6])); g.fillStyle = mix(L.body, L.neon, 0.32); g.fill(); // red top panel
      g.beginPath(); for (const s of S2) { g.moveTo(36, s * 1.6); g.lineTo(-31, s * 1.6); } g.strokeStyle = '#d8d6e0'; g.lineWidth = 2.2; g.stroke(); // white stripes
      g.beginPath(); g.ellipse(4, 0, 8, 4.4, 0, 0, TAU); dark(g, '#060206', 1.4); // bubble canopy
      g.beginPath(); g.ellipse(2.4, -1.6, 4, 1.2, 0, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
      g.beginPath(); g.arc(25, 0, 3.4, 0, TAU); dark(g, '#f2f0f6', 1.2); // roundel
      g.beginPath(); g.ellipse(25, 0, 1.3, 2, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke(); // its zero
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.4);
      g.beginPath(); addPoly(g, this.fin); addPoly(g, flipY(this.fin)); tube(g, L.neon, 1, null, 5);
      g.beginPath(); for (const s of S2) { g.moveTo(31, s * 1.6); g.lineTo(13, s * 1.6); g.moveTo(-5, s * 1.6); g.lineTo(-30, s * 1.6); } tube(g, L.neon2, 0.7, '#ffffff', 4);
      g.beginPath(); g.ellipse(4, 0, 8, 4.4, 0, 0, TAU); tube(g, L.neon2, 0.7, null, 3);
      g.beginPath(); g.arc(25, 0, 3.4, 0, TAU); tube(g, L.neon, 0.7, null, 3);
      for (const s of S2) { arch(g, L.neon, 20, s * 8.6, 5.6, s, 1); arch(g, L.neon, -14, s * 8.6, 6, s, 1); }
      lights(g, [37, -2.6, 34.5, -5, 37, 2.6, 34.5, 5], HEAD, 1.2);
      lights(g, [-32.6, -4, -30.5, -6.4, -32.6, 4, -30.5, 6.4], TAIL, 1.5);
    },
    // speed chevrons running back along the stripes
    anim(g, L, which) {
      g.beginPath();
      for (let x = 10 - which * 6; x > -26; x -= 12) { g.moveTo(x, -4.4); g.lineTo(x - 3, 0); g.lineTo(x, 4.4); }
      tube(g, L.neon2, 0.8, '#ffffff', 4);
    },
    exhaust: [[-33, -2.6], [-33, 2.6]], tail: [[-32, -5.5], [-32, 5.5]], head: 37,
  },

  // HELIX: two slim hulls (magenta and cyan) joined by a front and a rear wing, a spinning energy
  // core held between them
  helix: {
    tyres: [[14, -19.5, 12, 6], [14, 19.5, 12, 6], [-15, -19.5, 13, 6.5], [-15, 19.5, 13, 6.5]],
    hull: [35, -11, 28, -15.2, 12, -16.6, -16, -16.2, -27, -14.6, -30.5, -11, -27, -7.4, -16, -5.8, 12, -5.4, 28, -6.8],
    body(g) { g.beginPath(); addPoly(g, this.hull); addPoly(g, flipY(this.hull)); sub(g, 19, -6, 6, 12, 1.5); sub(g, -26, -7.4, 6, 14.8, 1.5); },
    base(g, L) {
      rr(g, 19, -7, 6, 14, 1.5); dark(g, L.body, 2.2); rr(g, -26, -8, 6, 16, 1.5); dark(g, L.body, 2.2); // cross wings
      g.beginPath(); g.arc(0, 0, 7.2, 0, TAU); dark(g, '#08040e', 2); // core cradle
      for (const s of S2) {
        poly(g, s < 0 ? this.hull : flipY(this.hull)); dark(g, L.body);
        poly(g, s < 0 ? [30, -11, 24, -13.2, 10, -13.8, 10, -8.4, 24, -8.6] : [30, 11, 24, 13.2, 10, 13.8, 10, 8.4, 24, 8.6]); g.fillStyle = mix(L.body, s < 0 ? L.neon : L.neon2, 0.18); g.fill();
        g.beginPath(); g.ellipse(-4, s * 11, 7, 3.2, 0, 0, TAU); dark(g, '#04020a', 1.2); // a cockpit per hull
      }
    },
    neon(g, L) {
      for (const s of S2) {
        const c = s < 0 ? L.neon : L.neon2;
        poly(g, s < 0 ? this.hull : flipY(this.hull)); tube(g, c, 1.4);
        g.beginPath(); g.ellipse(-4, s * 11, 7, 3.2, 0, 0, TAU); tube(g, mix(c, '#ffffff', 0.4), 0.7, null, 3);
        arch(g, c, 14, s * 17, 7, s, 1.2); arch(g, c, -15, s * 17, 7.5, s, 1.2);
        lights(g, [32, s * 9, 28, s * 7.4, 32, s * 13, 28, s * 14.6], HEAD, 1.2);
        lights(g, [-30, s * 9, -28, s * 7.8, -30, s * 13, -28, s * 14.2], TAIL, 1.2);
      }
      rr(g, 19, -7, 6, 14, 1.5); tube(g, L.neon, 0.9, null, 4); rr(g, -26, -8, 6, 16, 1.5); tube(g, L.neon2, 0.9, null, 4);
      g.beginPath(); g.arc(0, 0, 7.2, 0, TAU); tube(g, '#ffffff', 0.8, '#ffffff', 7);
    },
    // energy pulses running from the core into each hull
    anim(g, L, which) {
      g.beginPath();
      for (const s of S2) { const x = which ? -10 : 8; g.moveTo(x, s * 4); g.lineTo(x + (which ? -6 : 6), s * 7); }
      tube(g, which ? L.neon2 : L.neon, 1.2, '#ffffff', 6);
    },
    // the spinning core: a hot centre with two spiral arms
    spin: {
      x: 0, y: 0, r: 10, w: 5,
      draw(g, L) {
        g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fillStyle = '#ffffff'; glow(g, '#ffffff', 8); g.fill(); noGlow(g);
        for (const [s, c] of [[1, L.neon], [-1, L.neon2]]) { g.beginPath(); for (let k = 0; k <= 10; k++) { const a = s > 0 ? k * 0.36 : Math.PI + k * 0.36, r = 2 + k * 0.48; if (!k) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } tube(g, c, 1.3, '#ffffff', 6); }
      },
    },
    exhaust: [[-31, -11], [-31, 11]], tail: [[-29, -12], [-29, 12]], head: 33,
  },

  // OBLIVION PRIME: a wide chrome-black hypercar, crescent horizon blades at the rear, a black-lens
  // cockpit, galaxy paint that drifts and glows
  prime: {
    tyres: [[18, -14, 13, 7], [18, 14, 13, 7], [-12, -18.5, 15, 8], [-12, 18.5, 15, 8]],
    outline: mirror([35, 0, 31.5, -5, 22, -11, 10, -14.5, -4, -16, -16, -16.6, -24, -15, -30, -11, -31.5, -5]),
    body(g) { poly(g, this.outline); },
    blades(g) { g.beginPath(); for (const s of S2) { g.moveTo(-18, s * 15.4); g.quadraticCurveTo(-30, s * 27, -40, s * 23); g.quadraticCurveTo(-31, s * 19.5, -28, s * 12.4); g.closePath(); } },
    base(g, L) {
      this.blades(g); g.fillStyle = chrome(g); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      this.body(g); g.fillStyle = chrome(g); g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      // static galaxy under the animated layers: a faint nebula and a few stars
      g.save(); this.body(g); g.clip(); nebula(g, L, 0, 0.32); g.restore();
      g.beginPath(); g.arc(-1, 0, 7.6, 0, TAU); g.fillStyle = '#000000'; g.fill(); // black lens cockpit
      g.beginPath(); for (const s of S2) { g.moveTo(30, s * 3); g.lineTo(9, s * 8.4); } g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.4; g.stroke(); // chrome ridges
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.4, '#ffffff', 5);
      this.blades(g); tube(g, L.neon2, 1, null, 6);
      g.beginPath(); g.arc(-1, 0, 7.6, 0, TAU); tube(g, '#ffd36a', 1, '#fff6d8', 7); // the lens' photon ring
      g.beginPath(); g.arc(-1, 0, 4.4, -2.2, 0.4); tube(g, L.neon2, 0.6, null, 3);
      g.beginPath(); for (const s of S2) { g.moveTo(30, s * 3); g.lineTo(9, s * 8.4); } tube(g, L.neon, 0.6, '#ffffff', 3);
      for (const s of S2) { arch(g, L.neon, 18, s * 11.5, 7.5, s, 1.2); arch(g, L.neon, -12, s * 15.6, 8.5, s, 1.2); }
      lights(g, [32, -3.4, 26, -8.4, 32, 3.4, 26, 8.4], HEAD, 1.4);
      lights(g, [-31, -4, -29, -10, -31, 4, -29, 10], TAIL, 1.5);
    },
    // galaxy paint: two nebula states cross-faded (the paint drifts and pulses)
    anim(g, L, which) {
      g.save(); this.body(g); g.clip(); nebula(g, L, which ? 2 : 1, 0.9); g.restore();
    },
    exhaust: [[-32, -5], [-32, 5]], tail: [[-30, -10], [-30, 10]], head: 33,
  },
};
// chrome-black: a linear gradient of dark steel bands (car frame, so reflections turn with the car)
function chrome(g) {
  const gr = g.createLinearGradient(-30, -18, 26, 18);
  gr.addColorStop(0, '#2c2c36'); gr.addColorStop(0.22, '#060609'); gr.addColorStop(0.42, '#3a3a48'); gr.addColorStop(0.5, '#0a0a0e'); gr.addColorStop(0.74, '#24242e'); gr.addColorStop(1, '#030304');
  return gr;
}
// a seeded star / nebula field inside the current clip (seed picks the layout)
function nebula(g, L, seed, a) {
  const blobs = [[-14, -8, 13, L.neon2], [10, 7, 11, '#5a2cff'], [22, -4, 8, '#28c8ff'], [-24, 8, 9, '#ff5ad1'], [0, 0, 16, '#7a3cff']];
  for (let i = 0; i < blobs.length; i++) {
    const [x0, y0, r, c] = blobs[i], ox = seed ? Math.sin(i * 2.1 + seed * 1.7) * 6 : 0, oy = seed ? Math.cos(i * 1.3 + seed * 2.3) * 4 : 0;
    const gr = g.createRadialGradient(x0 + ox, y0 + oy, 0, x0 + ox, y0 + oy, r);
    gr.addColorStop(0, rgba(c, 0.5 * a)); gr.addColorStop(0.5, rgba(c, 0.2 * a)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(x0 + ox - r, y0 + oy - r, r * 2, r * 2);
  }
  // stars: a tiny deterministic hash per seed
  let h = 1234567 + seed * 7919;
  const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  g.fillStyle = `rgba(255,255,255,${Math.min(1, a + 0.1)})`;
  for (let i = 0; i < 26; i++) { const x = -32 + rnd() * 66, y = -17 + rnd() * 34, r = 0.35 + rnd() * 0.6; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  if (seed) { g.beginPath(); for (let i = 0; i < 4; i++) sparkle(g, -26 + rnd() * 54, -12 + rnd() * 24, 1.8); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.6; g.stroke(); }
}

export const CAR2_IDS = Object.keys(CARS);
export const CAR_IDS = [...C1.CAR_IDS, ...CAR2_IDS];
const def2 = (id) => CARS[id] || null;
export const exhaustsOf = (id) => (def2(id) ? CARS[id].exhaust : C1.exhaustsOf(id));
export const taillightsOf = (id) => (def2(id) ? CARS[id].tail : C1.taillightsOf(id));
export const headOf = (id) => (def2(id) ? CARS[id].head : C1.headOf(id));
// does the car have wheels (GRAVITON floats), a rotating part, a see-through body?
export const spinOf = (id) => (def2(id) && CARS[id].spin) || null;
export const hasWheels = (id) => !def2(id) || CARS[id].tyres.length > 0;

// ------------------------------------------------------------------ drawing
const asLook = (look) => (look && typeof look === 'object' ? look : makeLook(look));
function drawLayers(g, def, L, base, neon) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (base) { for (const [x, y, w, h] of def.tyres) tyreBase(g, x, y, w, h); def.base(g, L); }
  if (neon) { for (const [x, y, w, h] of def.tyres) tyreNeon(g, L, x, y, w, h); def.neon(g, L); }
}
function drawSpinPart(g, def, L) { const s = def.spin; g.save(); g.translate(s.x, s.y); s.draw(g, L); g.restore(); noGlow(g); }
// a car at the origin, nose +x, without the cache (one-off menu art); id or look; t animates it
export function drawCar(g, id, look = null, t = 0) {
  const L = asLook(look || id), def = def2(L.driver);
  if (!def) return C1.drawCar(g, id, look, t);
  const m = g.getTransform(); SB = Math.hypot(m.a, m.b) || 1;
  const ga = g.globalAlpha;
  drawLayers(g, def, L, true, true);
  if (def.anim) { const a = patternMix(t, false); g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga * a; def.anim(g, L, 0); g.globalAlpha = ga * (1 - a); def.anim(g, L, 1); g.globalAlpha = ga; g.globalCompositeOperation = 'source-over'; }
  if (def.spin) { g.save(); g.translate(def.spin.x, def.spin.y); g.rotate(t * def.spin.w); g.translate(-def.spin.x, -def.spin.y); drawSpinPart(g, def, L); g.restore(); }
  noGlow(g);
}

// Sprite cache with the cars.js shape: per look and pixel scale one atlas (8 x 4 heading cells),
// built from unrotated masters drawn once with the glow baked in; two animation atlases (A / B,
// cross-faded) and one small unrotated spin sprite where the car has them. The old six come from
// an inner cars.js cache, so render.js can keep one CarSprites for every car.
const COLS = 8, MS = 1.5;
export class CarSprites {
  constructor() { this.scale = 0; this.map = new Map(); this.old = new C1.CarSprites(); }
  setScale(s) { this.old.setScale(s); if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this.map.clear(); } }
  get(look, a) {
    const L = asLook(look), def = def2(L.driver);
    if (!def) return this.old.get(L, a);
    let arr = this.map.get(L.sprite);
    if (!arr) { if (this.map.size >= 24) this.map.clear(); arr = this.masters(L, def); this.map.set(L.sprite, arr); }
    let b = Math.round((a / TAU) * BUCKETS) % BUCKETS;
    if (b < 0) b += BUCKETS;
    return arr[b] || (arr[b] = this.build(b, arr));
  }
  canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  masters(L, def) {
    const arr = new Array(BUCKETS).fill(null), px = Math.ceil(HALF * 2 * this.scale), m = Math.ceil(HALF * 2 * this.scale * MS), ms = this.scale * MS;
    const layer = (fn, size = m, scale = ms) => { const cv = this.canvas(size, size), g = cv.getContext('2d'); SB = scale; g.setTransform(scale, 0, 0, scale, size / 2, size / 2); fn(g); noGlow(g); return cv; };
    arr.base = layer((g) => drawLayers(g, def, L, true, false));
    arr.neon = layer((g) => drawLayers(g, def, L, false, true));
    arr.atlas = this.canvas(px * COLS, px * (BUCKETS / COLS));
    if (def.anim) {
      arr.mpa = layer((g) => def.anim(g, L, 0)); arr.mpb = layer((g) => def.anim(g, L, 1));
      arr.pa = this.canvas(px * COLS, px * (BUCKETS / COLS)); arr.pb = this.canvas(px * COLS, px * (BUCKETS / COLS));
    }
    if (def.spin) { const r = def.spin.r, sz = Math.ceil(r * 2 * this.scale * MS); arr.spin = { cv: layer((g) => def.spin.draw(g, L), sz, this.scale * MS), x: def.spin.x, y: def.spin.y, r, w: def.spin.w }; }
    arr.fx = { spin: arr.spin || null, bob: !!def.bob, ghost: !!def.ghost };
    return arr;
  }
  build(b, arr) {
    const s = this.scale, px = Math.ceil(HALF * 2 * s), sx = (b % COLS) * px, sy = Math.floor(b / COLS) * px, ang = (b / BUCKETS) * TAU;
    const put = (atlas, master, gloss) => {
      const g = atlas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.save(); g.beginPath(); g.rect(sx, sy, px, px); g.clip();
      g.setTransform(s, 0, 0, s, sx + px / 2, sy + px / 2);
      g.save(); g.rotate(ang); g.drawImage(master, -HALF, -HALF, HALF * 2, HALF * 2); g.restore();
      if (gloss) {
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = gloss; g.fillRect(-HALF, -HALF, HALF * 2, HALF * 2); g.globalCompositeOperation = 'source-over';
        g.save(); g.rotate(ang); g.drawImage(arr.neon, -HALF, -HALF, HALF * 2, HALF * 2); g.restore();
      }
      g.restore();
    };
    put(arr.atlas, arr.base, glossOf(arr.atlas.getContext('2d')));
    if (arr.pa) { put(arr.pa, arr.mpa, null); put(arr.pb, arr.mpb, null); }
    return { cv: arr.atlas, sx, sy, px, ang, half: HALF, pa: arr.pa || null, pb: arr.pb || null, fx: arr.fx };
  }
}
function glossOf(g) {
  if (g.gloss) return g.gloss;
  const gr = g.createLinearGradient(-HALF * 0.5, -HALF * 0.5, HALF * 0.4, HALF * 0.4);
  gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.03)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,10,0.3)');
  return (g.gloss = gr);
}

// blitCar(g, spr, t, steady[, low]): as cars.js, plus the new cars' live parts: GRAVITON bobs and its
// ring lights orbit, HELIX's core spins, PHANTOM VX breathes. Steady (Reduce Flashing): no
// brightness pulsing (cross-fades hold at half, no breathing), spinning parts turn slowly.
// Low Graphics: no animation layers or spin sprite, the atlas cell only.
export function blitCar(g, spr, t, steady, low = false) {
  const fx = spr.fx;
  let h = spr.half;
  const ga = g.globalAlpha;
  if (fx) {
    if (fx.bob && !steady && !low) h *= 1 + 0.03 * Math.sin(t * 2.6);
    if (fx.ghost && !steady) g.globalAlpha = ga * (0.86 + 0.14 * Math.sin(t * 1.9));
  }
  const px = spr.px;
  g.drawImage(spr.cv, spr.sx, spr.sy, px, px, -h, -h, h * 2, h * 2);
  if (spr.pa && !(fx && low)) {
    const a = g.globalAlpha, m = patternMix(t, steady);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * m; g.drawImage(spr.pa, spr.sx, spr.sy, px, px, -h, -h, h * 2, h * 2);
    g.globalAlpha = a * (1 - m); g.drawImage(spr.pb, spr.sx, spr.sy, px, px, -h, -h, h * 2, h * 2);
    g.globalAlpha = a; g.globalCompositeOperation = 'source-over';
  }
  if (fx && fx.spin && !low) {
    // the sprite cell is rotated by spr.ang: turn into the car frame, then spin the part in place
    const sp = fx.spin, k = h / spr.half, rot = t * sp.w * (steady ? 0.3 : 1);
    g.rotate(spr.ang); g.translate(sp.x * k, sp.y * k); g.rotate(rot);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(sp.cv, -sp.r * k, -sp.r * k, sp.r * 2 * k, sp.r * 2 * k);
    g.globalCompositeOperation = 'source-over';
    g.rotate(-rot); g.translate(-sp.x * k, -sp.y * k); g.rotate(-spr.ang);
  }
  g.globalAlpha = ga;
}

// ------------------------------------------------------------------ underglow
const spriteCache = new Map();
function cached(key, size, fn) {
  let cv = spriteCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = size;
  fn(cv.getContext('2d'), size);
  if (spriteCache.size > 64) spriteCache.clear();
  spriteCache.set(key, cv);
  return cv;
}
// a soft ring of light (GRAVITON's hover field)
const ringGlow = (c) => cached('ring' + c, 128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, s * 0.22, s / 2, s / 2, s / 2);
  gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(0.45, rgba(c, 0.85)); gr.addColorStop(0.62, rgba(c, 0.35)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
// frost flakes on the road (FROSTBYTE): a six-armed crystal of thin light
const frostFlake = (c) => cached('flake' + c, 128, (g, s) => {
  g.translate(s / 2, s / 2); g.strokeStyle = rgba(c, 0.8); g.lineWidth = 2; g.lineCap = 'round'; g.beginPath();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, x = Math.cos(a), y = Math.sin(a); g.moveTo(x * 8, y * 8); g.lineTo(x * 56, y * 56); for (const d of [26, 40]) { const bx = x * d, by = y * d; for (const o of [-0.6, 0.6]) { g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + o) * 12, by + Math.sin(a + o) * 12); } } }
  g.stroke();
});
// the mini black hole (OBLIVION PRIME): a dark centre, and an accretion disk of spiral arms
// u = distance / sprite radius: black to u 0.42, the photon ring at 0.42, the disk out to 1
const HOLE_U = 0.42;
const holeDark = () => cached('hole', 128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(HOLE_U, 'rgba(0,0,0,0.96)'); gr.addColorStop(0.62, 'rgba(2,0,10,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const holeDisk = (c) => cached('disk' + c, 192, (g, s) => {
  const h = s / 2; g.translate(h, h);
  const gr = g.createRadialGradient(0, 0, h * HOLE_U, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,244,214,1)'); gr.addColorStop(0.08, 'rgba(255,190,90,0.95)'); gr.addColorStop(0.3, rgba('#ff5ad1', 0.7)); gr.addColorStop(0.6, rgba(c, 0.45)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h, 0, TAU); g.arc(0, 0, h * HOLE_U, 0, TAU, true); g.fill();
  // dark lanes swirling into the hole
  g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    for (let k = 0; k <= 30; k++) { const f = k / 30, a = (i / 5) * TAU + f * 2.6, r = h * (HOLE_U + 0.04 + f * 0.6); if (!k) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = s * (0.012 + (i % 2) * 0.012); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  g.beginPath(); g.arc(0, 0, h * HOLE_U, 0, TAU); g.strokeStyle = 'rgba(255,248,226,1)'; g.lineWidth = s * 0.014; g.shadowColor = '#ffd36a'; g.shadowBlur = 10; g.stroke(); // photon ring
});

// drawUnderglow(g, L, t, k, steady[, low]): the light under the car (car frame, nose +x). New
// styles: void, frost, hover, ghost, streak, blackhole; the old ones go to cars.js.
export function drawUnderglow(g, L, t, k = 1, steady = false, low = false) {
  const st = L.glowStyle;
  if (st === 'pool' || st === 'mist' || st === 'twin' || !st) return C1.drawUnderglow(g, L, t, k, steady);
  const spr = glowDot(L.glow), ga = g.globalAlpha;
  k *= NEON_GLOW;
  if (st === 'blackhole') {
    // the hole darkens the road (normal blend), then the disk turns over it
    const r = 54;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = ga * 0.45 * k; g.drawImage(spr, -62, -50, 124, 100);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = ga * Math.min(1, k * 1.2); g.drawImage(holeDark(), -r, -r, r * 2, r * 2);
    g.globalCompositeOperation = 'lighter';
    const rot = low ? 0 : t * (steady ? 0.25 : 0.8); g.rotate(rot); g.globalAlpha = ga * Math.min(1, k * 1.2); g.drawImage(holeDisk(L.glow), -r, -r, r * 2, r * 2); g.rotate(-rot);
    g.globalAlpha = ga; g.globalCompositeOperation = 'source-over';
    return;
  }
  g.globalCompositeOperation = 'lighter';
  if (st === 'hover') {
    const p = steady ? 1 : 1 + 0.07 * Math.sin(t * 2.6), r = 38 * p;
    g.globalAlpha = ga * 0.9 * k; g.drawImage(ringGlow(L.glow), -r, -r, r * 2, r * 2);
    g.globalAlpha = ga * (steady ? 0.45 : 0.35 + 0.15 * Math.sin(t * 2.6)) * k; g.drawImage(spr, -22, -22, 44, 44);
  } else if (st === 'void') {
    g.globalAlpha = ga * 0.8 * k; g.drawImage(spr, -50, -34, 96, 68);
    g.globalAlpha = ga * 0.7 * k; g.drawImage(spr, -40, -32, 30, 22); g.drawImage(spr, -40, 10, 30, 22); // wing tips
  } else if (st === 'frost') {
    g.globalAlpha = ga * 0.8 * k; g.drawImage(spr, -50, -36, 100, 72);
    if (!low) { g.globalAlpha = ga * 0.32 * k; g.drawImage(frostFlake(L.glow), -38, -38, 76, 76); }
  } else if (st === 'ghost') {
    const w = steady ? 0 : Math.sin(t * 1.1) * 4;
    g.globalAlpha = ga * 0.5 * k; g.drawImage(spr, -54 + w, -36, 104, 72);
    g.globalAlpha = ga * 0.3 * k; g.drawImage(spr, -74 - w, -24, 70, 48); // the afterimage behind
  } else if (st === 'streak') {
    g.globalAlpha = ga * 0.85 * k; g.drawImage(spr, -62, -26, 124, 52);
    g.globalAlpha = ga * 0.5 * k; g.drawImage(glowDot('#ffffff'), -40, -6, 80, 12);
  }
  g.globalAlpha = ga; g.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ boost trails
// drawBoostTrail(g, L, ring, ti, tn, t, steady, low): the trail along the ring of past positions
// render.js keeps (Float32Array of 16 xy points, ti = next write slot, tn = valid points), in the
// current transform. New styles: void, flame, crystal, ring, ghost, streak, helix, galaxy; line /
// ribbon / sparks are drawn as render.js draws them. Colours come from a per-look cache: no strings
// are built per frame.
const tcol = new Map();
function trailCols(L) {
  let c = tcol.get(L.id);
  if (!c) { c = { core: mix(L.trail.color, '#ffffff', 0.6), hot: mix(L.flame.core, L.trail.color, 0.3) }; if (tcol.size > 64) tcol.clear(); tcol.set(L.id, c); }
  return c;
}
const RN = 16;
// a filled band along the first n ring points, half width w0 * f + w1 (f = 1 at the car, fading to
// 0 at the tail), centre shifted sideways by wob * sin (flame lick); left edge out, right edge back
function band(g, ring, ti, n, tn, w0, w1, wob, ph) {
  let px = 0, py = 0;
  g.beginPath();
  for (let side = 1; side >= -1; side -= 2) {
    for (let q = 0; q < n; q++) {
      const k = side > 0 ? q : n - 1 - q, i = ((ti - 1 - k + RN * 2) % RN) * 2, j = ((ti - 1 - Math.min(k + 1, n - 1) + RN * 2) % RN) * 2, jj = ((ti - 1 - Math.max(k - 1, 0) + RN * 2) % RN) * 2;
      const dx = ring[j] - ring[jj], dy = ring[j + 1] - ring[jj + 1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      const f = 1 - k / tn, w = w0 * f + w1, o = wob ? Math.sin(ph + k * 0.7) * wob * (1 - f) : 0;
      const x = ring[i] + nx * (o + side * w), y = ring[i + 1] + ny * (o + side * w);
      // smoothed: a curve through the midpoints, each point the control (no corners on the flame)
      if (side > 0 && q === 0) g.moveTo(x, y); else if (q === 0) g.lineTo(x, y); else g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    g.lineTo(px, py);
  }
  g.closePath(); g.fill();
}
const BANDS = { flame: 1, void: 1, galaxy: 1, ghost: 1 };
export function drawBoostTrail(g, L, ring, ti, tn, t, steady = false, low = false) {
  if (tn <= 2) return;
  const st = L.trail.style, C = trailCols(L), ga = g.globalAlpha;
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const n = low ? Math.min(tn, 8) : tn;
  if (BANDS[st]) {
    const A = ga * NEON_GLOW, ph = steady ? 0 : t * 22;
    if (st === 'flame') {
      g.fillStyle = L.flame.outer; g.globalAlpha = A * 0.6; band(g, ring, ti, n, tn, 14, 1.5, steady ? 0 : 5, ph);
      g.fillStyle = L.trail.color; g.globalAlpha = A * 0.75; band(g, ring, ti, Math.ceil(n * 0.7), tn, 9, 1, steady ? 0 : 3.5, ph + 1.1);
      g.fillStyle = L.flame.core; g.globalAlpha = A * 0.9; band(g, ring, ti, Math.ceil(n * 0.4), tn, 4, 0.6, 0, 0);
      if (!low) { g.fillStyle = C.hot; g.globalAlpha = A * 0.9; for (let q = 0; q < 6; q++) { const k = 4 + ((q * 5 + (steady ? 0 : Math.floor(t * 18))) % Math.max(1, n - 5)), i = ((ti - 1 - k + RN * 2) % RN) * 2, z = 2.6 - q * 0.25; g.fillRect(ring[i] + ((q * 7) % 9) - 4 - z / 2, ring[i + 1] + ((q * 11) % 9) - 4 - z / 2, z, z); } } // embers
    } else if (st === 'void') {
      g.fillStyle = L.trail.color; g.globalAlpha = A * 0.55; band(g, ring, ti, n, tn, 13, 1.5, 0, 0);
      g.fillStyle = L.neon2; g.globalAlpha = A * 0.5; band(g, ring, ti, Math.ceil(n * 0.5), tn, 6, 0.5, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.fillStyle = '#05010e'; g.globalAlpha = ga * 0.75; band(g, ring, ti, n, tn, 2.6, 0.3, 0, 0); // the dark core
    } else if (st === 'galaxy') {
      g.fillStyle = L.trail.color; g.globalAlpha = A * 0.5; band(g, ring, ti, n, tn, 10, 1.5, 0, 0);
      g.fillStyle = L.neon2; g.globalAlpha = A * 0.45; band(g, ring, ti, Math.ceil(n * 0.6), tn, 4, 0.5, steady ? 0 : 2, ph * 0.2);
      if (!low) { g.fillStyle = '#ffffff'; g.globalAlpha = ga * 0.9; for (let k = 1; k < n; k++) { const i = ((ti - 1 - k + RN * 2) % RN) * 2, so = ((k * 37) % 15) - 7, z = k & 1 ? 1.6 : 2.4; g.fillRect(ring[i] + so * 0.6 - z / 2, ring[i + 1] + so - z / 2, z, z); } }
    } else {
      g.fillStyle = L.trail.color; g.globalAlpha = A * 0.3; band(g, ring, ti, n, tn, 12, 2, steady ? 0 : 2, ph * 0.1);
      g.fillStyle = C.core; g.globalAlpha = A * 0.3; band(g, ring, ti, Math.ceil(n * 0.5), tn, 4, 0.6, 0, 0);
    }
    g.globalAlpha = ga; g.globalCompositeOperation = 'source-over';
    return;
  }
  for (let k = 1; k + 1 < n; k++) {
    const i0 = ((ti - k + RN * 2) % RN) * 2, i1 = ((ti - k - 1 + RN * 2) % RN) * 2;
    const x0 = ring[i0], y0 = ring[i0 + 1], x1 = ring[i1], y1 = ring[i1 + 1];
    const f = 1 - k / tn, dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    g.globalAlpha = ga * f * 0.6 * NEON_GLOW;
    if (st === 'crystal') {
      g.strokeStyle = L.trail.color; g.lineWidth = 4 * f + 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (k % 2 === 0) { const s = 4 + 7 * f, sx = nx * (k % 4 ? 7 : -7), sy = ny * (k % 4 ? 7 : -7); g.fillStyle = k < 5 ? C.core : L.trail.color; g.beginPath(); g.moveTo(x0 + sx + (dx / d) * s, y0 + sy + (dy / d) * s); g.lineTo(x0 + sx + nx * s * 0.5, y0 + sy + ny * s * 0.5); g.lineTo(x0 + sx - (dx / d) * s, y0 + sy - (dy / d) * s); g.lineTo(x0 + sx - nx * s * 0.5, y0 + sy - ny * s * 0.5); g.closePath(); g.fill(); }
    } else if (st === 'ring') {
      g.strokeStyle = L.trail.color; g.lineWidth = 3 * f + 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (k % 3 === 1) { g.lineWidth = 2.4; g.strokeStyle = k < 4 ? C.core : L.trail.color; g.beginPath(); g.arc(x0, y0, 8 + (1 - f) * 16, 0, TAU); g.stroke(); }
    } else if (st === 'streak') {
      g.lineWidth = 3.2 * f + 1.2;
      for (const o of [-5, 5]) { g.strokeStyle = o < 0 ? L.trail.color : '#ffffff'; g.beginPath(); g.moveTo(x0 + nx * o, y0 + ny * o); g.lineTo(x1 + nx * o, y1 + ny * o); g.stroke(); }
    } else if (st === 'helix') {
      const ph = steady ? 0 : t * 9;
      for (let q = 0; q < 2; q++) {
        const a0 = Math.sin(k * 0.9 + ph + q * Math.PI) * 9 * f + 0, a1 = Math.sin((k + 1) * 0.9 + ph + q * Math.PI) * 9 * f;
        g.strokeStyle = q ? L.neon2 : L.neon; g.lineWidth = 3.4 * f + 1.4; g.beginPath(); g.moveTo(x0 + nx * a0, y0 + ny * a0); g.lineTo(x1 + nx * a1, y1 + ny * a1); g.stroke();
      }
    } else {
      const wide = st === 'ribbon' ? 1.6 : st === 'sparks' ? 0.6 : 1;
      g.strokeStyle = k < 4 ? C.core : st === 'ribbon' && k & 1 ? L.neon2 : L.trail.color; g.lineWidth = (16 * f + 3) * wide;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  g.globalAlpha = ga; g.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ previews
const previewSprites = new Map();
function previewCache(px) {
  const s = Math.max(1, Math.min(4, Math.ceil(px * 2) / 2));
  let c = previewSprites.get(s);
  if (!c) { if (previewSprites.size >= 4) previewSprites.clear(); c = new CarSprites(); c.setScale(s); previewSprites.set(s, c); }
  return c;
}
// a straight trail behind a parked car for previews (car frame), written into one reused ring
const pring = new Float32Array(RN * 2);
function previewBoost(g, L, t, steady, low) {
  const ex = exhaustsOf(L.driver), tx = Math.min(...ex.map((e) => e[0]));
  for (let k = 0; k < RN; k++) { const j = ((RN - 1 - k + RN) % RN) * 2; pring[j] = tx - 2 - k * 8; pring[j + 1] = 0; }
  drawBoostTrail(g, L, pring, 0, 11, t, steady, low);
  const ga0 = g.globalAlpha;
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga0 * NEON_GLOW;
  const fl = 24 + (steady ? 6 : 8 * Math.abs(Math.sin(t * 17)));
  for (const [x, y] of ex) {
    const w = ex.length > 1 ? 0.75 : 1;
    g.fillStyle = L.flame.outer; g.beginPath(); g.moveTo(x, y - 8 * w); g.quadraticCurveTo(x - fl * 0.6 * w, y - 6 * w, x - fl * w, y); g.quadraticCurveTo(x - fl * 0.6 * w, y + 6 * w, x, y + 8 * w); g.closePath(); g.fill();
    g.fillStyle = L.flame.core; g.beginPath(); g.moveTo(x, y - 4 * w); g.quadraticCurveTo(x - fl * 0.35 * w, y - 3 * w, x - fl * 0.55 * w, y); g.quadraticCurveTo(x - fl * 0.35 * w, y + 3 * w, x, y + 4 * w); g.closePath(); g.fill();
  }
  g.globalAlpha = ga0; g.globalCompositeOperation = 'source-over';
}
// drawCarPreview(ctx, driverId, look, angle, t, {glow, steady, boost, low}): as cars.js, for every car
export function drawCarPreview(ctx, driverId, look, angle = -0.5, t = 0, { glow: under = true, steady = false, boost = true, low = false } = {}) {
  const L = look && typeof look === 'object' ? look : makeLook(driverId);
  if (!def2(L.driver)) return C1.drawCarPreview(ctx, driverId, L, angle, t, { glow: under, steady, boost });
  const m = ctx.getTransform(), px = Math.hypot(m.a, m.b) || 1;
  const spr = previewCache(px).get(L, angle), r = angle - spr.ang;
  ctx.save();
  if (under || boost) { ctx.save(); ctx.rotate(angle); if (under) drawUnderglow(ctx, L, t, 1, steady, low); if (boost) previewBoost(ctx, L, t, steady, low); ctx.restore(); }
  ctx.rotate(r);
  blitCar(ctx, spr, t, steady, low);
  ctx.restore();
}

export { isNewCar };
