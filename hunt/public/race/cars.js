// Hunt Racers vehicles: six original neon night-tuner cars drawn in code, top down, nose along +x.
// Dark glossy bodies with glowing neon outlines (edges, cabin, arches, wings), neon rims, head and
// tail lights. Each car has one signature neon colour (looks.js), so they read apart in a pack.
//
//   volt    ARCWIRE    balanced sports coupe, lightning-bolt body lines, glowing rear wing
//   brick   WARHOG     armoured muscle truck, bull bar, roof light bar, huge twin exhausts
//   wisp    PHANTOM    low sleek hypercar, faceted stealth nose, bubble canopy, swept fin wing
//   dune    SANDVIPER  rally buggy, big knobby tyres, roll cage, roof scoop, scale-pattern hood
//   rook    COBRA      wide-body tuner, flared arches, hood-shaped rear wing, chain-link decals, trap launcher
//   flicker RAZOR      the lightest and sharpest: needle wedge, blade wings, thin glowing edges
//
// Sprites are cached per look and angle bucket (the gloss stays lit from the top left at every
// heading) with the neon glow baked in at build time, so a frame only blits: no live shadowBlur.
// Animated skin patterns are two extra cached layers cross-faded by time (steady when Reduce
// Flashing is on).
import { BASE_LOOKS, makeLook, NEON_GLOW, glowA } from './looks.js';

export const INK = '#06040c';
export const BUCKETS = 32;
const HALF = 46; // sprite half size in world px (cars are ~56 x 34 plus wings, and the glow around them)

// ------------------------------------------------------------------ small helpers
const rr = (g, x, y, w, h, r) => { g.beginPath(); sub(g, x, y, w, h, r); };
// a rounded rect added to the current path (no beginPath)
const sub = (g, x, y, w, h, r) => { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
const mirror = (pts) => { const out = pts.slice(); for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], -pts[i + 1]); return out; }; // top half -> closed outline
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export function mix(a, b, f) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join(''); }
export const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };

// glow strength scales with the pixel size of the sprite being built
let SB = 1;
// (glowA: the soft halo at NEON_GLOW; the neon line itself keeps its full colour)
const glow = (g, c, b) => { g.shadowColor = glowA(c); g.shadowBlur = b * SB; g.shadowOffsetX = 0; g.shadowOffsetY = 0; };
const noGlow = (g) => { g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; };
// a neon tube along the current path: coloured glow, then a hot pale core
const tube = (g, c, w, core = null, b = 5) => {
  g.lineJoin = 'round'; g.lineCap = 'round';
  glow(g, c, b); g.strokeStyle = c; g.lineWidth = w; g.stroke(); g.stroke();
  noGlow(g); g.strokeStyle = core || mix(c, '#ffffff', 0.55); g.lineWidth = Math.max(0.5, w * 0.42); g.stroke();
};
// dark fill with a crisp ink edge (the neon goes on top later)
const dark = (g, fill, lw = 3) => { g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); };

// a tyre seen from above, and its glowing rim strip with spokes (L.rim, L.spokes)
function tyreBase(g, x, y, w, h, knobby = false) {
  rr(g, x - w / 2, y - h / 2, w, h, Math.min(2.6, h / 2.5)); dark(g, '#0b0a10', 2.2);
  g.strokeStyle = knobby ? '#2a2834' : '#1c1b24'; g.lineWidth = 1.2; g.beginPath();
  for (let k = -w / 2 + 2.5; k < w / 2 - 1; k += knobby ? 2.4 : 3.4) { g.moveTo(x + k, y - h / 2 + 1); g.lineTo(x + k, y + h / 2 - 1); }
  g.stroke();
}
function tyreNeon(g, L, x, y, w, h) {
  const rw = w * 0.62, rh = Math.max(1.6, h * 0.34);
  rr(g, x - rw / 2, y - rh / 2, rw, rh, rh / 2); tube(g, L.rim, 1.3, null, 4);
  g.strokeStyle = mix(L.rim, '#ffffff', 0.5); g.lineWidth = 0.7; g.beginPath();
  for (let k = 0; k < L.spokes; k++) { const sx = x - rw / 2 + (rw * (k + 0.5)) / L.spokes; g.moveTo(sx, y - rh / 2 - 0.6); g.lineTo(sx, y + rh / 2 + 0.6); }
  g.stroke();
}
// arch over a wheel: an outward flare on the body edge, side s = -1 / 1
const arch = (g, L, x, y, r, s, lw = 1.5) => { g.beginPath(); g.arc(x, y, r, s < 0 ? Math.PI + 0.35 : 0.35, s < 0 ? -0.35 : Math.PI - 0.35); tube(g, L.neon, lw, null, 4); };
const lights = (g, pts, c, w = 1.8, b = 6) => { g.beginPath(); for (let i = 0; i < pts.length; i += 4) { g.moveTo(pts[i], pts[i + 1]); g.lineTo(pts[i + 2], pts[i + 3]); } tube(g, c, w, '#ffffff', b); };
const HEAD = '#e8f4ff', TAIL = '#ff2a3a';
// COBRA's rear wing: a wide spread hood behind the tail
const hood = (g) => { g.beginPath(); g.moveTo(-22, 0); g.bezierCurveTo(-24, -10, -30, -22, -35, -18); g.bezierCurveTo(-34, -10, -33, -4, -33, 0); g.bezierCurveTo(-33, 4, -34, 10, -35, 18); g.bezierCurveTo(-30, 22, -24, 10, -22, 0); g.closePath(); };

// ------------------------------------------------------------------ the six cars
// each: tyres [[x, y, w, h]], body(g) path, base(g, L) dark parts, neon(g, L) glowing parts,
// exhaust [[x, y]] (boost flames), tail [[x, y]] (taillight trails), head (beam origin x)
const CARS = {
  volt: {
    tyres: [[15, -13, 13, 7], [15, 13, 13, 7], [-15, -14, 14, 8], [-15, 14, 14, 8]],
    outline: mirror([30, 0, 25, -6, 16, -11.5, 4, -12.5, -12, -12.5, -23, -11, -27, -7]),
    glass: mirror([9, 0, 5, -8.5, -12, -9, -16, -7, -16, 0]),
    body(g) { poly(g, this.outline); },
    base(g, L) {
      this.body(g); dark(g, L.body);
      poly(g, mirror([24, 0, 18, -5, 9, -6.5, 9, 0])); g.fillStyle = mix(L.body, L.neon, 0.16); g.fill(); // hood panel
      poly(g, this.glass); dark(g, '#04060c', 1.6);
      rr(g, -10, -6, 13, 12, 3); g.fillStyle = mix(L.body, '#ffffff', 0.06); g.fill(); // roof
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(-26, s * 6); g.lineTo(-22, s * 6); } g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke(); // wing stands
      rr(g, -31, -16, 5, 32, 1.5); dark(g, L.body, 2.4); // rear wing
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.6);
      poly(g, this.glass); tube(g, L.neon2, 0.9, null, 3);
      // lightning-bolt body lines down both flanks
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(22, s * 6); g.lineTo(13, s * 10); g.lineTo(10, s * 7.5); g.lineTo(-2, s * 11.5); g.lineTo(-5, s * 9); g.lineTo(-14, s * 11.5); }
      tube(g, L.neon2, 1.1, '#ffffff', 4);
      rr(g, -31, -16, 5, 32, 1.5); tube(g, L.neon, 1.5, null, 7); // glowing wing
      for (const s of [-1, 1]) { arch(g, L, 15, s * 11.5, 7.5, s); arch(g, L, -15, s * 12, 8, s); }
      lights(g, [27, -3.5, 22, -8, 27, 3.5, 22, 8], HEAD);
      lights(g, [-27.4, -6.5, -27.4, -3, -27.4, 3, -27.4, 6.5], TAIL, 1.6);
    },
    exhaust: [[-30, -3], [-30, 3]], tail: [[-28, -6], [-28, 6]], head: 28,
  },
  brick: {
    tyres: [[15, -16, 15, 9], [15, 16, 15, 9], [-14, -16, 16, 10], [-14, 16, 16, 10]],
    cab: mirror([17, 0, 15, -11, 1, -11, -1, -9, -1, 0]),
    glass: mirror([17, 0, 15.5, -10, 11, -10, 11, 0]),
    body(g) { rr(g, -26, -15, 50, 30, 4); },
    base(g, L) {
      this.body(g); dark(g, L.body, 3.2);
      rr(g, -24, -12, 21, 24, 2); dark(g, mix(L.body, '#000000', 0.35), 1.8); // bed
      g.strokeStyle = mix(L.body, '#ffffff', 0.1); g.lineWidth = 1.4; g.beginPath(); for (const y of [-6, 0, 6]) { g.moveTo(-22, y); g.lineTo(-5, y); } g.stroke(); // bed ribs
      poly(g, this.cab); dark(g, mix(L.body, '#ffffff', 0.05), 1.8);
      poly(g, this.glass); dark(g, '#04060c', 1.4);
      rr(g, 24, -18, 6, 36, 2); dark(g, '#14141c', 2.6); // bull bar
      g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); for (const y of [-12, -4, 4, 12]) { g.moveTo(24, y); g.lineTo(30, y); } g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.arc(-1, s * 13.5, 3.6, 0, 7); dark(g, '#1a1a22', 2); } // stacks
      for (const s of [-1, 1]) { rr(g, -31, s * 10 - 3, 6, 6, 2); dark(g, '#2a2a32', 2); } // huge exhaust tips
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.8);
      rr(g, 24, -18, 6, 36, 2); tube(g, L.neon, 1.5, null, 6);
      rr(g, -24, -12, 21, 24, 2); tube(g, L.neon2, 0.8, null, 3);
      poly(g, this.glass); tube(g, L.neon2, 0.9, null, 3);
      lights(g, [9, -7, 9, -4.6, 9, -1.2, 9, 1.2, 9, 4.6, 9, 7], '#ffd36a', 1.6, 6); // roof light bar
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(-1 + 1.6, s * 13.5); g.arc(-1, s * 13.5, 1.6, 0, 7); } g.fillStyle = mix(L.neon, '#ffffff', 0.4); glow(g, L.neon, 6); g.fill(); noGlow(g);
      for (const s of [-1, 1]) { rr(g, -31, s * 10 - 3, 6, 6, 2); tube(g, L.neon, 1, null, 5); }
      for (const s of [-1, 1]) { arch(g, L, 15, s * 14.5, 8.5, s, 1.8); arch(g, L, -14, s * 14.5, 9, s, 1.8); }
      lights(g, [23, -14, 23, -9, 23, 9, 23, 14], HEAD, 2);
      lights(g, [-26.5, -13, -26.5, -6, -26.5, 6, -26.5, 13], TAIL, 1.8);
    },
    exhaust: [[-32, -10], [-32, 10]], tail: [[-27, -10], [-27, 10]], head: 30,
  },
  wisp: {
    tyres: [[14, -11, 12, 6], [14, 11, 12, 6], [-16, -12, 13, 7], [-16, 12, 13, 7]],
    outline: mirror([34, 0, 26, -4, 14, -9, 0, -11.5, -12, -12, -22, -10, -27, -6]),
    body(g) { poly(g, this.outline); },
    base(g, L) {
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(-11, s * 9); g.lineTo(-31, s * 19); g.lineTo(-29, s * 9); g.lineTo(-24, s * 6); g.closePath(); } dark(g, L.body, 2.4); // swept fins
      this.body(g); dark(g, L.body);
      poly(g, mirror([33, 0, 22, -3, 8, -5, 8, 0])); g.fillStyle = mix(L.body, L.neon, 0.12); g.fill(); // facet
      g.beginPath(); g.ellipse(-2, 0, 11, 6.2, 0, 0, 7); dark(g, '#04080c', 1.6); // bubble canopy
      g.beginPath(); g.ellipse(-4, -2, 5, 1.6, 0, 0, 7); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill(); // canopy gleam
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.3);
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(-11, s * 9); g.lineTo(-31, s * 19); g.lineTo(-29, s * 9); } tube(g, L.neon, 1.3, null, 7);
      g.beginPath(); g.ellipse(-2, 0, 11, 6.2, 0, 0, 7); tube(g, L.neon2, 0.9, null, 4);
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(32, 0); g.lineTo(12, s * 6.5); g.lineTo(-10, s * 10); } g.moveTo(-14, 0); g.lineTo(-26, 0); tube(g, L.neon2, 0.7, '#ffffff', 3); // stealth facets + dorsal line
      for (const s of [-1, 1]) { arch(g, L, 14, s * 9.5, 6.5, s, 1.1); arch(g, L, -16, s * 11, 7, s, 1.1); }
      lights(g, [29, -2, 24, -4.5, 29, 2, 24, 4.5], HEAD, 1.4);
      lights(g, [-27.3, -5, -24, -9, -27.3, 5, -24, 9], TAIL, 1.4);
    },
    exhaust: [[-28, 0]], tail: [[-26, -7], [-26, 7]], head: 32,
  },
  dune: {
    tyres: [[15, -17, 15, 10], [15, 17, 15, 10], [-15, -17.5, 17, 11], [-15, 17.5, 17, 11]],
    knobby: true,
    outline: mirror([28, 0, 27, -6, 12, -11, -20, -11, -26, -7]),
    hood: mirror([26, 0, 25, -5, 12, -8, 12, 0]),
    body(g) { poly(g, this.outline); },
    base(g, L) {
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(12, s * 10); g.lineTo(15, s * 17); g.moveTo(-14, s * 10); g.lineTo(-15, s * 17); } g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); // suspension arms
      this.body(g); dark(g, L.body);
      poly(g, this.hood); g.fillStyle = mix(L.body, L.neon, 0.14); g.fill();
      rr(g, -16, -9, 26, 18, 4); dark(g, '#05070a', 1.6); // open cockpit
      rr(g, -9, -3.4, 13, 6.8, 2); dark(g, mix(L.body, '#ffffff', 0.08), 1.8); // roof scoop
      g.beginPath(); g.arc(-27, 0, 6, 0, 7); dark(g, '#0b0a10', 2.2); // spare tyre
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.5);
      // snake-scale rows on the hood
      g.save(); poly(g, this.hood); g.clip();
      g.beginPath(); for (let x = 13; x < 27; x += 4) for (let y = -8; y <= 8; y += 4) { const yy = y + ((x / 4) & 1 ? 2 : 0); g.moveTo(x + 2.4 * Math.cos(-0.9), yy + 2.4 * Math.sin(-0.9)); g.arc(x, yy, 2.4, -0.9, 0.9); }
      g.strokeStyle = rgba(L.neon2, 0.85); g.lineWidth = 0.8; g.stroke(); g.restore();
      // roll cage
      rr(g, -16, -9, 26, 18, 4); tube(g, L.neon, 1.4, null, 5);
      g.beginPath(); g.moveTo(-16, -9); g.lineTo(10, 9); g.moveTo(-16, 9); g.lineTo(10, -9); tube(g, L.neon, 0.9, null, 3);
      rr(g, -9, -3.4, 13, 6.8, 2); tube(g, L.neon2, 0.9, null, 4);
      lights(g, [4.6, -2.4, 4.6, 2.4], '#ffffff', 1.4, 4); // scoop mouth
      lights(g, [11, -7, 11, -3, 11, 3, 11, 7], '#fff4c0', 1.6, 6); // cage light bar
      g.beginPath(); g.arc(-27, 0, 3.4, 0, 7); tube(g, L.rim, 1, null, 4);
      lights(g, [27.6, -4, 26, -6, 27.6, 4, 26, 6], HEAD, 1.6);
      lights(g, [-24.5, -8, -21, -10.4, -24.5, 8, -21, 10.4], TAIL, 1.6);
    },
    exhaust: [[-24, -10], [-24, 10]], tail: [[-24, -9], [-24, 9]], head: 28,
  },
  rook: {
    tyres: [[15, -15.5, 15, 9], [15, 15.5, 15, 9], [-14, -16, 16, 10], [-14, 16, 16, 10]],
    outline: mirror([28, 0, 27, -8, 23, -12, 21, -15.5, 8, -15.5, 4, -12.5, -6, -12.5, -9, -16, -21, -16, -26, -12, -28, -8]),
    glass: mirror([11, 0, 7, -9.5, -9, -10, -12, -8, -12, 0]),
    body(g) { poly(g, this.outline); },
    base(g, L) {
      hood(g); dark(g, L.body, 2.4);
      this.body(g); dark(g, L.body);
      poly(g, mirror([26, 0, 25, -6, 12, -7, 12, 0])); g.fillStyle = mix(L.body, L.neon, 0.15); g.fill();
      poly(g, this.glass); dark(g, '#04060c', 1.6);
      rr(g, -6, -6.5, 12, 13, 3); g.fillStyle = mix(L.body, '#ffffff', 0.06); g.fill(); // roof
      rr(g, -22, -4.5, 10, 9, 2); dark(g, '#16141e', 2); // trap launcher box
      g.beginPath(); g.moveTo(-12, 0); g.lineTo(-7, 0); g.lineWidth = 3.4; g.strokeStyle = INK; g.stroke(); // launcher tube
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.6);
      hood(g); tube(g, L.neon, 1.4, null, 7);
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(-25, s * 3); g.quadraticCurveTo(-28, s * 10, -32, s * 15); } tube(g, L.neon2, 0.6, null, 2); // hood ribs
      poly(g, this.glass); tube(g, L.neon2, 0.9, null, 3);
      // chain-link decals along both flanks: interlocking rounded links
      g.beginPath(); for (const s of [-1, 1]) for (let x = -5, k = 0; x < 20; x += 3.6, k++) { if (k & 1) sub(g, x, s * 12.6 - 0.7, 4.6, 1.4, 0.7); else sub(g, x, s * 12.6 - 1.5, 4.6, 3, 1.5); }
      tube(g, L.neon2, 0.5, null, 2);
      rr(g, -22, -4.5, 10, 9, 2); tube(g, L.neon, 0.9, null, 4);
      g.beginPath(); g.arc(-17, 0, 1.8, 0, 7); g.fillStyle = mix(L.neon, '#ffffff', 0.5); glow(g, L.neon, 5); g.fill(); noGlow(g);
      for (const s of [-1, 1]) { arch(g, L, 15, s * 13, 9, s, 1.6); arch(g, L, -14, s * 13.5, 9.5, s, 1.6); }
      lights(g, [27.5, -6, 24, -10.5, 27.5, 6, 24, 10.5], HEAD, 1.6);
      lights(g, [-28.3, -7.5, -28.3, -3, -28.3, 3, -28.3, 7.5], TAIL, 1.6);
    },
    exhaust: [[-29, -5.5], [-29, 5.5]], tail: [[-28, -6], [-28, 6]], head: 28,
  },
  flicker: {
    tyres: [[12, -11.5, 11, 6], [12, 11.5, 11, 6], [-12, -12, 12, 7], [-12, 12, 12, 7]],
    outline: mirror([29, 0, 14, -5, 0, -7.5, -16, -8.5, -22, -5]),
    body(g) { poly(g, this.outline); },
    blades(g) { g.beginPath(); for (const s of [-1, 1]) { g.moveTo(6, s * 7); g.quadraticCurveTo(-4, s * 22, -26, s * 23); g.quadraticCurveTo(-10, s * 16, -8, s * 8); g.closePath(); } },
    base(g, L) {
      this.blades(g); dark(g, L.body, 2);
      this.body(g); dark(g, L.body, 2.6);
      poly(g, mirror([27, 0, 14, -3, 6, -3.4, 6, 0])); g.fillStyle = mix(L.body, L.neon, 0.15); g.fill();
      g.beginPath(); g.ellipse(-4, 0, 7.5, 4.6, 0, 0, 7); dark(g, '#04060c', 1.4); // canopy
    },
    neon(g, L) {
      this.body(g); tube(g, L.neon, 1.1, null, 4);
      this.blades(g); tube(g, L.neon, 1, null, 6);
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(1, s * 10); g.quadraticCurveTo(-6, s * 19, -20, s * 21); } tube(g, L.neon2, 0.6, '#ffffff', 3); // blade edges
      g.beginPath(); g.ellipse(-4, 0, 7.5, 4.6, 0, 0, 7); tube(g, L.neon2, 0.7, null, 3);
      g.beginPath(); g.moveTo(27, 0); g.lineTo(4, 0); tube(g, L.neon2, 0.6, '#ffffff', 3); // spine
      for (const s of [-1, 1]) { arch(g, L, 12, s * 10.5, 6, s, 1); arch(g, L, -12, s * 11, 6.5, s, 1); }
      lights(g, [24, -1.6, 18, -4, 24, 1.6, 18, 4], HEAD, 1.2);
      lights(g, [-22.2, -4.5, -20, -7.5, -22.2, 4.5, -20, 7.5], TAIL, 1.3);
    },
    exhaust: [[-23, 0]], tail: [[-21, -6], [-21, 6]], head: 26,
  },
};
export const CAR_IDS = Object.keys(CARS);
const carDef = (id) => CARS[id] || CARS.volt;
// attachment points in the car frame (nose +x) for the renderer: exhausts, taillights, headlights
export const tyresOf = (id) => carDef(id).tyres; // [[x, y, w, h]] in the car frame (nose +x)
export const exhaustsOf = (id) => carDef(id).exhaust;
export const taillightsOf = (id) => carDef(id).tail;
export const headOf = (id) => carDef(id).head;

// ------------------------------------------------------------------ animated skin pattern layers
// Two layers, A and B, cross-faded by time: scales ripple, circuit traces pulse, flow bands move.
function patternLayer(g, def, L, which) {
  const p = L.pattern;
  if (p === 'pulse') { if (!which) { def.body(g); tube(g, L.neon2, 2.2, '#ffffff', 9); } return; }
  g.save(); def.body(g); g.clip();
  g.beginPath();
  if (p === 'scales') {
    for (let row = 0, y = -16; y <= 16; y += 3.6, row++) { if ((row & 1) !== which) continue; for (let x = -34 + (row & 1) * 2.2; x < 36; x += 4.4) { g.moveTo(x + 2.2, y); g.arc(x, y, 2.2, 0, Math.PI); } }
    tube(g, L.neon2, 0.8, null, 3);
  } else if (p === 'circuit') {
    for (let k = 0; k < 8; k++) {
      if ((k & 1) !== which) continue;
      const y = -12 + k * 3.4, x0 = -26 + ((k * 7) % 11), x1 = 24 - ((k * 5) % 9), xm = (x0 + x1) / 2 + ((k % 3) - 1) * 4, dy = k < 4 ? 3 : -3;
      g.moveTo(x0, y); g.lineTo(xm, y); g.lineTo(xm + 3, y + dy); g.lineTo(x1, y + dy);
      g.moveTo(x1 + 1.4, y + dy); g.arc(x1, y + dy, 1.4, 0, 7);
    }
    tube(g, L.neon2, 0.8, '#ffffff', 4);
  } else { // flow: diagonal light bands
    for (let x = -60 + which * 7; x < 50; x += 14) { g.moveTo(x, -20); g.lineTo(x + 20, 20); }
    tube(g, L.neon2, 2.2, null, 6);
  }
  g.restore();
}
// cross-fade weight of layer A at time t (B gets 1 - a): a slow sine, steady under Reduce Flashing
export const patternMix = (t, steady) => (steady ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.4));

// ------------------------------------------------------------------ drawing
const asLook = (look) => (look && typeof look === 'object' ? look : makeLook(BASE_LOOKS[look] ? look : 'volt'));
function drawLayers(g, L, base, neon) {
  const def = carDef(L.driver);
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (base) { for (const [x, y, w, h] of def.tyres) tyreBase(g, x, y, w, h, def.knobby); def.base(g, L); }
  if (neon) { for (const [x, y, w, h] of def.tyres) tyreNeon(g, L, x, y, w, h); def.neon(g, L); }
}
// draw a car at the origin, nose along +x, without the cache (one-off menu art); id or look
export function drawCar(g, id, look = null, t = 0) {
  const L = asLook(look || id), m = g.getTransform();
  SB = Math.hypot(m.a, m.b) || 1;
  drawLayers(g, L, true, true);
  if (L.pattern !== 'none') { const a = patternMix(t, false), def = carDef(L.driver); g.globalAlpha = a; patternLayer(g, def, L, 0); g.globalAlpha = 1 - a; patternLayer(g, def, L, 1); g.globalAlpha = 1; }
  noGlow(g);
}

// cache: per look and pixel scale, ONE atlas canvas with a cell per angle bucket (8 x 4 cells).
// The car is drawn in full detail (neon glow baked with shadowBlur) only ONCE per look, into
// unrotated master canvases (dark base, neon, pattern layers); a heading cell is then just the
// masters rotated into place plus the top-left gloss: cheap enough to build while racing. One
// texture per look instead of 32 keeps the GPU's work and memory flat.
const COLS = 8, MS = 1.5; // masters are drawn 1.5x finer than the cells so rotating them stays crisp
export class CarSprites {
  // budget: how many looks may be (re)built now (the race renderer sets it every frame; unset = no limit)
  constructor() { this.scale = 0; this.map = new Map(); this.old = null; this.budget = undefined; }
  // a new pixel scale: the sprites at the old scale keep being drawn (a sprite blits at its world
  // size whatever its pixels) until each look is rebuilt, one per frame, instead of every car's
  // glow being baked again in the same frame
  setScale(s) { if (Math.abs(s - this.scale) > 0.01) { this.scale = s; if (this.map.size) this.old = this.map; this.map = new Map(); } }
  // look: a look object (looks.js) or a driver id. Returns a sprite {cv, sx, sy, px, ang, half, pa, pb}.
  get(look, a) {
    const L = asLook(look);
    let arr = this.map.get(L.sprite);
    if (!arr) {
      const o = this.old && this.old.get(L.sprite);
      if (o && this.budget === 0) arr = o;
      else {
        if (this.budget > 0) this.budget--;
        if (this.map.size >= 24) this.map.clear(); // more looks than a race can have: start over
        arr = this.masters(L); this.map.set(L.sprite, arr);
        if (this.old && this.map.size >= this.old.size) this.old = null;
      }
    }
    let b = Math.round((a / (Math.PI * 2)) * BUCKETS) % BUCKETS;
    if (b < 0) b += BUCKETS;
    return arr[b] || (arr[b] = this.build(b, arr));
  }
  canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  masters(L) {
    const arr = new Array(BUCKETS).fill(null); arr.s = this.scale;
    const px = Math.ceil(HALF * 2 * this.scale), m = Math.ceil(HALF * 2 * this.scale * MS), ms = this.scale * MS;
    const layer = (fn) => { const cv = this.canvas(m, m), g = cv.getContext('2d'); SB = ms; g.setTransform(ms, 0, 0, ms, m / 2, m / 2); fn(g); noGlow(g); return cv; };
    arr.base = layer((g) => drawLayers(g, L, true, false));
    arr.neon = layer((g) => drawLayers(g, L, false, true));
    arr.atlas = this.canvas(px * COLS, px * (BUCKETS / COLS));
    if (L.pattern !== 'none') {
      const def = carDef(L.driver);
      arr.mpa = layer((g) => patternLayer(g, def, L, 0)); arr.mpb = layer((g) => patternLayer(g, def, L, 1));
      arr.pa = this.canvas(px * COLS, px * (BUCKETS / COLS)); arr.pb = this.canvas(px * COLS, px * (BUCKETS / COLS));
    }
    return arr;
  }
  build(b, arr) {
    const s = arr.s, px = Math.ceil(HALF * 2 * s), sx = (b % COLS) * px, sy = Math.floor(b / COLS) * px, ang = (b / BUCKETS) * Math.PI * 2;
    const put = (atlas, master, gloss) => {
      const g = atlas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.save(); g.beginPath(); g.rect(sx, sy, px, px); g.clip();
      g.setTransform(s, 0, 0, s, sx + px / 2, sy + px / 2);
      g.save(); g.rotate(ang); g.drawImage(master, -HALF, -HALF, HALF * 2, HALF * 2); g.restore();
      if (gloss) {
        // gloss lit from the top left, the same at every heading (that is why cells are per bucket)
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = gloss; g.fillRect(-HALF, -HALF, HALF * 2, HALF * 2);
        g.globalCompositeOperation = 'source-over';
        g.save(); g.rotate(ang); g.drawImage(arr.neon, -HALF, -HALF, HALF * 2, HALF * 2); g.restore();
      }
      g.restore();
    };
    put(arr.atlas, arr.base, glossOf(arr.atlas.getContext('2d')));
    if (arr.pa) { put(arr.pa, arr.mpa, null); put(arr.pb, arr.mpb, null); }
    return { cv: arr.atlas, sx, sy, px, ang, half: HALF, pa: arr.pa || null, pb: arr.pb || null };
  }
}
// the gloss gradient (car-centred coordinates), made once per context
function glossOf(g) {
  if (g.gloss) return g.gloss;
  const gr = g.createLinearGradient(-HALF * 0.5, -HALF * 0.5, HALF * 0.4, HALF * 0.4);
  gr.addColorStop(0, 'rgba(255,255,255,0.34)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,10,0.42)');
  return (g.gloss = gr);
}

// draw a cached sprite with the car at the origin of the current transform (the caller's
// transform holds the car position and the leftover rotation), with its animated pattern at t
export function blitCar(g, spr, t, steady) {
  const h = spr.half, px = spr.px;
  g.drawImage(spr.cv, spr.sx, spr.sy, px, px, -h, -h, h * 2, h * 2);
  if (spr.pa) {
    const ga = g.globalAlpha, m = patternMix(t, steady);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = ga * m; g.drawImage(spr.pa, spr.sx, spr.sy, px, px, -h, -h, h * 2, h * 2);
    g.globalAlpha = ga * (1 - m); g.drawImage(spr.pb, spr.sx, spr.sy, px, px, -h, -h, h * 2, h * 2);
    g.globalAlpha = ga; g.globalCompositeOperation = 'source-over';
  }
}

// ------------------------------------------------------------------ glows and previews
const glowCache = new Map();
// a soft round light (radial gradient) in colour c, cached per colour
export function glowDot(c, size = 64) {
  const k = size === 64 ? c : c + size; // no string built for the per-frame default size
  let cv = glowCache.get(k);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, rgba(c, 0.95)); gr.addColorStop(0.35, rgba(c, 0.5)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  if (glowCache.size > 96) glowCache.clear();
  glowCache.set(k, cv);
  return cv;
}
// the underglow light pool under a car (car frame at the origin, nose +x): pool / mist / twin
export function drawUnderglow(g, L, t, k = 1, steady = false) {
  const spr = glowDot(L.glow);
  const ga = g.globalAlpha;
  k *= NEON_GLOW;
  g.globalCompositeOperation = 'lighter';
  if (L.glowStyle === 'twin') {
    g.globalAlpha = ga * 0.9 * k;
    g.drawImage(spr, -36, -30, 70, 26); g.drawImage(spr, -36, 4, 70, 26);
    g.globalAlpha = ga * 0.4 * k; g.drawImage(spr, -42, -26, 84, 52);
  } else if (L.glowStyle === 'mist') {
    const w = steady ? 0 : Math.sin(t * 1.3) * 5, w2 = steady ? 0 : Math.cos(t * 0.9) * 4;
    g.globalAlpha = ga * 0.6 * k;
    g.drawImage(spr, -54 + w, -34, 96, 68); g.drawImage(spr, -38 - w, -30 + w2, 86, 60);
    g.globalAlpha = ga * 0.35 * k; g.drawImage(glowDot('#ffffff'), -32, -18, 64, 36);
  } else {
    g.globalAlpha = ga * 0.95 * k; g.drawImage(spr, -48, -34, 96, 68);
  }
  g.globalAlpha = ga; g.globalCompositeOperation = 'source-over';
}

// preview sprite caches per pixel scale (cards and the big store preview use different sizes)
const previewSprites = new Map();
function previewCache(px) {
  const s = Math.max(1, Math.min(4, Math.ceil(px * 2) / 2)); // atlas width stays under 3000 px
  let c = previewSprites.get(s);
  if (!c) { if (previewSprites.size >= 4) previewSprites.clear(); c = new CarSprites(); c.setScale(s); previewSprites.set(s, c); }
  return c;
}
// boost trail and exhaust flames for previews (car frame, nose +x): the look's trail style and
// flame colours, so store try-ons show them without the race renderer
function previewBoost(g, L, t, steady) {
  const def = carDef(L.driver), ex = def.exhaust, tx = Math.min(...ex.map((e) => e[0]));
  const ga0 = g.globalAlpha, ga = ga0 * NEON_GLOW;
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  const st = L.trail.style;
  for (let k = 0; k < 4; k++) {
    const x0 = tx - 6 - k * 16, x1 = x0 - 16;
    g.globalAlpha = ga * (0.7 - k * 0.15);
    if (st === 'sparks') { g.fillStyle = L.trail.color; for (let q = 0; q < 3; q++) { const y = ((k * 7 + q * 5 + (steady ? 0 : Math.floor(t * 12))) % 11) - 5; g.fillRect(x0 - q * 5, y, 2.2, 2.2); } continue; }
    g.strokeStyle = L.trail.color; g.lineWidth = (st === 'ribbon' ? 14 : 9) * (1 - k * 0.2);
    g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.stroke();
    g.strokeStyle = st === 'ribbon' ? L.neon2 : '#ffffff'; g.lineWidth *= 0.35; g.stroke();
  }
  const fl = 24 + (steady ? 6 : 8 * Math.abs(Math.sin(t * 17)));
  for (const [x, y] of ex) {
    const w = ex.length > 1 ? 0.75 : 1;
    g.globalAlpha = ga;
    g.fillStyle = L.flame.outer; g.beginPath(); g.moveTo(x, y - 8 * w); g.quadraticCurveTo(x - fl * 0.6 * w, y - 6 * w, x - fl * w, y); g.quadraticCurveTo(x - fl * 0.6 * w, y + 6 * w, x, y + 8 * w); g.closePath(); g.fill();
    g.fillStyle = L.flame.core; g.beginPath(); g.moveTo(x, y - 4 * w); g.quadraticCurveTo(x - fl * 0.35 * w, y - 3 * w, x - fl * 0.55 * w, y); g.quadraticCurveTo(x - fl * 0.35 * w, y + 3 * w, x, y + 4 * w); g.closePath(); g.fill();
  }
  g.globalAlpha = ga0; g.globalCompositeOperation = 'source-over';
}
// a car at the origin of the current transform (world units: a car is ~60 long), heading `angle`,
// over its underglow, with its rims, boost flames and boost trail (boost: false for a car at rest);
// the animated skin pattern runs on `t`. The lobby and the store draw with this.
export function drawCarPreview(ctx, driverId, look, angle = -0.5, t = 0, { glow: under = true, steady = false, boost = true } = {}) {
  const L = look && typeof look === 'object' ? look : makeLook(driverId);
  const m = ctx.getTransform(), px = Math.hypot(m.a, m.b) || 1;
  const spr = previewCache(px).get(L, angle), r = angle - spr.ang;
  ctx.save();
  if (under || boost) { ctx.save(); ctx.rotate(angle); if (under) drawUnderglow(ctx, L, t, 1, steady); if (boost) previewBoost(ctx, L, t, steady); ctx.restore(); }
  ctx.rotate(r);
  blitCar(ctx, spr, t, steady);
  ctx.restore();
}
