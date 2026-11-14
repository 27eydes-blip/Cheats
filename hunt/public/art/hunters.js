// The six brawlers as HUNTERS: dark, sharp silhouettes, glowing eyes, masks, hoods, armour and
// menacing weapons. All original art, drawn in code. Scary but bloodless (12+).
//
// Same footprint as before: the body stays inside the ~26px hitbox circle (moveStats), only the
// hair/cloaks/weapons reach out. Every brawler is recognisable by silhouette alone:
//   VOLT long coat + high collar + rifle     BRICK huge shoulders + furnace chest
//   WISP pointed hood + tattered hem         DUNE tall bandage wrap + sand ring
//   ROOK crow-skull beak + feathered cloak   FLICKER slim shadow + twin curved blades
// Idle: breathing, cloaks moving, eyes glowing, weapons twitching. Steady under Reduce Flashing.
import { SETTINGS, pulse } from '../settings.js';

const INK = '#120a1c';
export const HUNTER_PAL = {
  volt: { body: '#2c3346', dark: '#171b27', accent: '#5ff4ff', metal: '#8a93a6', trim: '#ffd23f' },
  brick: { body: '#5a4a44', dark: '#2e2420', accent: '#ff7a1f', metal: '#7d8290', trim: '#3d3f4a' },
  wisp: { body: '#3b3a52', dark: '#1d1c2c', accent: '#d8f6ff', metal: '#9aa0b8', trim: '#6e6a9a' },
  dune: { body: '#b89a6a', dark: '#6e5534', accent: '#ffb347', metal: '#efe4cc', trim: '#7a5a34' },
  rook: { body: '#262a33', dark: '#121419', accent: '#ff4d3a', metal: '#e8e2d2', trim: '#5a4a3a' },
  flicker: { body: '#16141f', dark: '#08070d', accent: '#ff2d6a', metal: '#f2eef8', trim: '#3a3550' },
};
// head anchor (top of the head) per hunter, for skin accessories
export const HEAD = { volt: -34, brick: -30, wisp: -40, dune: -40, rook: -32, flicker: -30 };

// a glowing eye; rot tilts it (inner corner down = a menacing slant)
const glowEye = (g, x, y, rx, ry, col, k, rot = 0) => {
  g.save(); g.globalAlpha = 0.28 * k; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx * 1.9, Math.max(ry, 1) * 2.1, rot, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1; g.beginPath(); g.ellipse(x, y, rx, Math.max(0.4, ry), rot, 0, Math.PI * 2); g.fill(); g.restore();
};
// rounded rect path (the canvas round-rect call is missing on older iPhones)
const rect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };

// pal: { body, dark, accent, metal, trim } (skins override body/dark/accent)
export function drawHunter(g, id, facing, t, o, pal) {
  const steady = SETTINGS.reduceFlash;
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const breathe = 1 + Math.sin(t * 2.2) * 0.025; // slow, heavy breathing
  const eyeK = steady ? 0.8 : 0.65 + pulse(t, 2.6, 0.8) * 0.35;
  const blink = o.blinkK ?? 1;
  const flash = o.flash > 0;
  const behind = Math.sin(facing) < -0.3;
  const twitch = steady ? 0 : Math.sin(t * 1.3) > 0.97 ? Math.sin(t * 40) * 0.06 : 0; // the weapon twitches now and then
  g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK;
  const body = flash ? '#fff' : pal.body;
  const weapon = () => { g.save(); g.rotate(facing + twitch); g.lineWidth = 4; WEAPONS[id](g, pal, t, steady); g.restore(); };
  if (behind) weapon();
  g.save(); g.scale(1, breathe);
  BODIES[id](g, pal, body, t, { fx, fy, eyeK, blink, steady, moving: o.moving, facing });
  g.restore();
  if (!behind) weapon();
}

const BODIES = {
  // VOLT — storm hunter: long dark coat, high collar, cracked metal mask leaking lightning
  volt(g, pal, body, t, s) {
    const sway = Math.sin(t * 3) * (s.moving ? 3 : 1.2);
    poly(g, [[-20, -10], [20, -10], [27 + sway, 26], [8, 22], [0, 28], [-8, 22], [-27 + sway, 26]]); // coat
    g.fillStyle = body; g.fill(); g.lineWidth = 4.5; g.stroke();
    g.strokeStyle = pal.accent; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 24); g.stroke(); g.strokeStyle = INK; // seam
    poly(g, [[-22, -14], [-14, -30], [-6, -14]]); g.fillStyle = pal.dark; g.fill(); g.lineWidth = 3.5; g.stroke(); // collar
    poly(g, [[22, -14], [14, -30], [6, -14]]); g.fill(); g.stroke();
    rect(g, -13, -32, 26, 24, 7); g.fillStyle = pal.metal; g.fill(); g.lineWidth = 4; g.stroke(); // mask
    g.strokeStyle = 'rgba(18,10,28,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, -32); g.lineTo(1, -24); g.lineTo(-2, -18); g.stroke(); g.strokeStyle = INK; // crack
    g.fillStyle = pal.accent;
    const ex = s.fx * 3, ey = s.fy * 2;
    for (const k of [-1, 1]) { g.fillStyle = INK; poly(g, [[k * 2 + ex, -21 + ey], [k * 11 + ex, -25 + ey], [k * 11 + ex, -21 + ey]]); g.fill(); glowEye(g, k * 6.5 + ex, -22.4 + ey, 3.4, 1.1 * s.blink, pal.accent, s.eyeK, k * 0.3); }
    if (!s.steady) { // electricity leaking from the eye slits
      g.strokeStyle = pal.accent; g.lineWidth = 1.6;
      for (const k of [-1, 1]) {
        const ph = Math.floor(t * 9 + k * 3) % 4;
        if (ph === 0) continue;
        g.beginPath(); g.moveTo(k * 10 + ex, -22 + ey); g.lineTo(k * 15, -25 - ph * 2); g.lineTo(k * 13, -29 - ph * 2); g.lineTo(k * 18, -33 - ph); g.stroke();
      }
      g.strokeStyle = INK;
    }
  },
  // BRICK — hulking armoured brute: stone helmet, furnace chest, huge pauldrons
  brick(g, pal, body, t, s) {
    rect(g, -24, -18, 48, 44, 12); g.fillStyle = body; g.fill(); g.lineWidth = 4.5; g.stroke(); // torso
    for (const k of [-1, 1]) { // pauldrons
      for (const [a, l] of [[-0.9, 9], [-0.35, 11], [0.2, 8]]) { // spikes on the pauldron
        const bx = k * 26 + Math.cos(a - Math.PI / 2) * 9 * k, by = -12 + Math.sin(a - Math.PI / 2) * 9;
        poly(g, [[bx - 3, by + 1], [bx + Math.cos(a - Math.PI / 2) * l * k, by + Math.sin(a - Math.PI / 2) * l], [bx + 3, by + 1]]); g.fillStyle = '#c9ccd4'; g.fill(); g.lineWidth = 2.5; g.stroke();
      }
      g.beginPath(); g.ellipse(k * 26, -12, 13, 11, k * 0.3, 0, Math.PI * 2); g.fillStyle = pal.metal; g.fill(); g.lineWidth = 4; g.stroke();
      g.strokeStyle = 'rgba(18,10,28,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(k * 17, -6); g.lineTo(k * 36, -16); g.moveTo(k * 18, -1); g.lineTo(k * 35, -9); g.stroke(); g.strokeStyle = INK; // plate ridges
    }
    const heat = s.steady ? 0.85 : 0.7 + pulse(t, 2.2, 0.85) * 0.3; // the furnace breathes
    rect(g, -13, -4, 26, 20, 4); g.fillStyle = INK; g.fill();
    g.save(); g.globalAlpha = heat; g.fillStyle = pal.accent; rect(g, -10, -1, 20, 14, 3); g.fill();
    g.globalAlpha = heat * 0.6; g.fillStyle = '#ffd23f'; g.fillRect(-6, 3, 12, 7); g.restore();
    g.strokeStyle = INK; g.lineWidth = 2.5; for (const x of [-5, 0, 5]) { g.beginPath(); g.moveTo(x, -1); g.lineTo(x, 13); g.stroke(); } // grille
    g.beginPath(); g.moveTo(-16, -22); g.quadraticCurveTo(-18, -40, 0, -41); g.quadraticCurveTo(18, -40, 16, -22); g.closePath(); // stone helmet
    g.fillStyle = pal.trim; g.fill(); g.lineWidth = 4.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(-6, -34, 6, 3, -0.3, 0, 7); g.fill();
    g.fillStyle = INK; g.fillRect(-12, -30, 24, 6); // visor slit
    for (const k of [-1, 1]) glowEye(g, k * 5.5 + s.fx * 2, -27 + s.fy, 3, 1.3 * s.blink, pal.accent, s.eyeK, k * 0.25);
  },
  // WISP — ghostly sniper: a hood with no face (two pale eyes), tattered hem, faint mist
  wisp(g, pal, body, t, s) {
    if (!SETTINGS.lowGfx) { // faint mist trailing behind
      g.save(); g.globalAlpha = 0.18;
      for (let i = 0; i < 3; i++) { const k = s.steady ? i / 3 : ((t * 0.6 + i / 3) % 1); g.fillStyle = '#dfe8ff'; g.beginPath(); g.arc(-s.fx * (14 + k * 26) + Math.sin(i * 2) * 6, 18 - s.fy * (10 + k * 18), 6 + k * 8, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    const w = (i) => (s.steady ? 0 : Math.sin(t * 5 + i) * 2.2);
    poly(g, [[0, -46], [16, -22], [22, 4], [24, 24], [17, 19 + w(1)], [11, 27], [5, 20 + w(2)], [-2, 28], [-8, 20 + w(3)], [-14, 27], [-19, 19 + w(4)], [-24, 24], [-22, 4], [-16, -22]]); // hooded cloak
    g.fillStyle = body; g.fill(); g.lineWidth = 4.5; g.stroke();
    g.strokeStyle = 'rgba(18,10,28,0.45)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-10, -8); g.lineTo(-14, 20); g.moveTo(10, -8); g.lineTo(13, 18); g.stroke(); g.strokeStyle = INK; // folds
    g.beginPath(); g.ellipse(s.fx * 2, -20 + s.fy, 11, 12, 0, 0, Math.PI * 2); g.fillStyle = '#05040a'; g.fill(); // the void inside the hood
    for (const k of [-1, 1]) glowEye(g, k * 4.8 + s.fx * 3, -20 + s.fy * 2, 1.6, 3.4 * s.blink, pal.accent, s.eyeK, -k * 0.45);
  },
  // DUNE — desert wraith: sand-worn bandages, a bone mask, sand always swirling around it
  dune(g, pal, body, t, s) {
    const sp = s.steady ? 0 : t * 2.4;
    g.save(); g.fillStyle = '#e8c98a'; // swirling sand ring (behind)
    for (let i = 0; i < 10; i++) { const a = sp + i * 0.63; if (Math.sin(a) > 0) continue; g.globalAlpha = 0.55; g.beginPath(); g.arc(Math.cos(a) * 32, Math.sin(a) * 11 + 6, 2.4, 0, 7); g.fill(); }
    g.restore();
    poly(g, [[0, -44], [14, -26], [20, 0], [24, 26], [0, 30], [-24, 26], [-20, 0], [-14, -26]]); // wrapped body
    g.fillStyle = body; g.fill(); g.lineWidth = 4.5; g.stroke();
    g.save(); g.clip(); g.strokeStyle = pal.dark; g.lineWidth = 3; // bandage wraps
    for (let y = -36; y < 32; y += 9) { g.beginPath(); g.moveTo(-26, y + 6); g.lineTo(26, y - 4); g.stroke(); }
    g.strokeStyle = 'rgba(255,240,210,0.35)'; g.lineWidth = 1.5; for (let y = -32; y < 32; y += 9) { g.beginPath(); g.moveTo(-26, y + 7); g.lineTo(26, y - 3); g.stroke(); }
    g.restore();
    const tail = s.steady ? 0 : Math.sin(t * 4) * 4; // a loose bandage end
    g.strokeStyle = body; g.lineWidth = 5; g.beginPath(); g.moveTo(14, -18); g.quadraticCurveTo(28, -14 + tail, 34, -4 + tail); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
    g.beginPath(); g.moveTo(-11, -30); g.quadraticCurveTo(0, -38, 11, -30); g.lineTo(9, -16); g.lineTo(0, -12); g.lineTo(-9, -16); g.closePath(); // bone mask
    g.fillStyle = pal.metal; g.fill(); g.lineWidth = 3.5; g.stroke();
    g.fillStyle = INK; g.fillRect(-1, -19, 2, 6);
    for (const k of [-1, 1]) { g.fillStyle = INK; poly(g, [[k * 1.5 + s.fx * 2, -24 + s.fy], [k * 9 + s.fx * 2, -28 + s.fy], [k * 8 + s.fx * 2, -22 + s.fy]]); g.fill(); glowEye(g, k * 5.6 + s.fx * 2, -24.6 + s.fy, 1.5, 1.2 * s.blink, pal.accent, s.eyeK, k * 0.4); }
    g.save(); g.fillStyle = '#f2dca0'; // sand ring (in front)
    for (let i = 0; i < 10; i++) { const a = sp + i * 0.63; if (Math.sin(a) <= 0) continue; g.globalAlpha = 0.85; g.beginPath(); g.arc(Math.cos(a) * 32, Math.sin(a) * 11 + 6, 2.6, 0, 7); g.fill(); }
    g.restore();
  },
  // ROOK — trapper: crow-skull helmet with a long beak, feathered cloak, chains, hooks on the belt
  rook(g, pal, body, t, s) {
    const ruffle = s.steady ? 0 : Math.sin(t * 2.6) * 1.5;
    for (let i = -3; i <= 3; i++) { // feathered cloak
      const a = Math.PI / 2 + i * 0.36, r = 30 + (i % 2 ? 2 : 0) + ruffle;
      g.beginPath(); g.moveTo(Math.cos(a) * 12, Math.sin(a) * 10 - 6); g.quadraticCurveTo(Math.cos(a - 0.2) * r, Math.sin(a - 0.2) * r, Math.cos(a) * (r + 4), Math.sin(a) * (r + 2) - 2); g.quadraticCurveTo(Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r, Math.cos(a) * 12, Math.sin(a) * 10 - 6);
      g.fillStyle = i % 2 ? pal.dark : '#1d2028'; g.fill(); g.lineWidth = 3; g.stroke();
    }
    rect(g, -20, -18, 40, 40, 12); g.fillStyle = body; g.fill(); g.lineWidth = 4.5; g.stroke(); // body
    g.strokeStyle = '#8f939e'; g.lineWidth = 2.5; // a chain across the chest
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(-14 + i * 7, -8 + i * 5, 3.4, 2, 0.6, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = INK;
    rect(g, -20, 10, 40, 8, 3); g.fillStyle = pal.trim; g.fill(); g.lineWidth = 3; g.stroke(); // belt
    g.strokeStyle = '#c9ccd4'; g.lineWidth = 2.5; for (const x of [-12, 0, 12]) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 24); g.arc(x - 3, 24, 3, 0, Math.PI * 0.9); g.stroke(); } g.strokeStyle = INK; // hooks
    // crow-skull helmet: the beak points where Rook looks
    g.save(); g.translate(0, -24); g.rotate(Math.atan2(s.fy * 0.5, s.fx));
    poly(g, [[5, -7], [30, -2], [38, 2], [29, 4], [5, 8]]); g.fillStyle = pal.metal; g.fill(); g.lineWidth = 3.5; g.stroke();
    g.strokeStyle = 'rgba(18,10,28,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, 1); g.lineTo(27, 1); g.stroke(); g.strokeStyle = INK;
    g.restore();
    for (const a of [-0.5, 0, 0.5]) { poly(g, [[-3, -30], [Math.sin(a) * 14, -46 - Math.cos(a) * 3], [3, -30]]); g.fillStyle = '#1d2028'; g.fill(); g.lineWidth = 2.5; g.stroke(); } // feather crest
    g.beginPath(); g.ellipse(0, -24, 13, 11, 0, 0, Math.PI * 2); g.fillStyle = pal.metal; g.fill(); g.lineWidth = 4; g.stroke(); // skull dome
    for (const k of [-1, 1]) { g.fillStyle = INK; poly(g, [[k * 1.5 + s.fx * 2, -23 + s.fy], [k * 10 + s.fx * 2, -28 + s.fy], [k * 9 + s.fx * 2, -20 + s.fy]]); g.fill(); glowEye(g, k * 6 + s.fx * 2.4, -24 + s.fy * 1.2, 1.6, 1.3 * s.blink, pal.accent, s.eyeK, k * 0.4); }
  },
  // FLICKER — shadow assassin: all black, a jagged grin mask; blurs when moving
  flicker(g, pal, body, t, s) {
    if (s.moving && !SETTINGS.lowGfx) { // motion blur: dark afterimages behind
      g.save();
      for (let i = 1; i <= 3; i++) { g.globalAlpha = 0.16 * (4 - i); g.fillStyle = pal.dark; g.beginPath(); g.ellipse(-s.fx * i * 9, -s.fy * i * 7, 18, 24, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    const tail = s.steady ? 0 : Math.sin(t * 7) * 4; // torn scarf
    g.beginPath(); g.moveTo(-6, -10); g.quadraticCurveTo(-26 - s.fx * 10, -8 + tail, -36 - s.fx * 12, -16 + tail); g.lineTo(-30, -6 + tail); g.lineTo(-36, 0 + tail); g.quadraticCurveTo(-20, -2, -4, -2); g.closePath();
    g.fillStyle = pal.dark; g.fill(); g.lineWidth = 3; g.stroke();
    poly(g, [[0, -38], [9, -26], [18, -8], [16, 20], [6, 26], [-6, 26], [-16, 20], [-18, -8], [-9, -26]]); // slim, sharp body
    g.fillStyle = body; g.fill(); g.lineWidth = 4.5; g.stroke();
    for (const k of [-1, 1]) { poly(g, [[k * 6, -30], [k * 14, -44], [k * 13, -28]]); g.fillStyle = body; g.fill(); g.lineWidth = 3; g.stroke(); } // hood points
    g.beginPath(); g.ellipse(s.fx * 2, -18 + s.fy, 12, 11, 0, 0, Math.PI * 2); g.fillStyle = pal.metal; g.fill(); g.lineWidth = 3.5; g.stroke(); // mask
    g.fillStyle = INK; poly(g, [[-8 + s.fx * 2, -15], [-5, -11], [-2, -14], [1, -10], [4, -14], [7, -10], [9 + s.fx * 2, -15], [5, -13], [0, -16], [-5, -13]]); g.fill(); // jagged grin
    for (const k of [-1, 1]) { g.fillStyle = INK; poly(g, [[k * 2.5 + s.fx * 2, -22], [k * 10 + s.fx * 2, -27], [k * 8 + s.fx * 2, -20]]); g.fill(); glowEye(g, k * 6 + s.fx * 2, -23 + s.fy, 1.9, 1.1 * s.blink, pal.accent, s.eyeK, k * 0.4); }
  },
};

const WEAPONS = {
  volt(g, pal, t, steady) { // crackling rifle: long barrel with glowing coils
    rect(g, 8, -5, 44, 10, 3); g.fillStyle = '#2a2f3d'; g.fill(); g.stroke();
    rect(g, 10, -2, 14, 12, 3); g.fillStyle = '#3d4456'; g.fill(); g.stroke(); // grip
    for (const x of [28, 36, 44]) { rect(g, x, -7, 4, 14, 2); g.fillStyle = pal.accent; g.fill(); g.lineWidth = 2; g.stroke(); }
    if (!steady && Math.floor(t * 12) % 3) { g.strokeStyle = pal.accent; g.lineWidth = 1.5; g.beginPath(); g.moveTo(30, -9); g.lineTo(34, -13); g.lineTo(38, -9); g.lineTo(42, -13); g.lineTo(46, -9); g.stroke(); g.strokeStyle = INK; }
    g.lineWidth = 4;
  },
  brick(g, pal) { // massive scrap-metal shotgun: two barrels, mismatched plates, rivets
    rect(g, 10, -13, 40, 26, 4); g.fillStyle = '#4a4e5c'; g.fill(); g.stroke();
    rect(g, 18, -15, 14, 11, 2); g.fillStyle = '#6b5a44'; g.fill(); g.lineWidth = 2.5; g.stroke(); // patch plate
    g.lineWidth = 4; for (const y of [-6, 6]) { g.beginPath(); g.arc(50, y, 5, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); }
    g.fillStyle = '#c9ccd4'; for (const [x, y] of [[14, -9], [14, 9], [40, -9], [40, 9]]) { g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill(); }
  },
  wisp(g, pal) { // long pale sniper rifle with a scope
    rect(g, 6, -4, 60, 8, 3); g.fillStyle = '#4b4a66'; g.fill(); g.stroke();
    rect(g, 18, -10, 18, 6, 2); g.fillStyle = pal.metal; g.fill(); g.lineWidth = 2.5; g.stroke();
    g.fillStyle = pal.accent; g.beginPath(); g.arc(37, -7, 2.4, 0, 7); g.fill(); g.lineWidth = 4;
  },
  dune(g, pal) { // a bone staff with a glowing amber stone
    rect(g, 4, -3.5, 46, 7, 3); g.fillStyle = pal.metal; g.fill(); g.stroke();
    for (const x of [16, 30]) { g.fillStyle = pal.dark; g.fillRect(x, -4, 3, 8); }
    g.beginPath(); poly(g, [[50, -9], [60, 0], [50, 9], [44, 0]]); g.fillStyle = pal.accent; g.fill(); g.stroke();
  },
  rook(g, pal) { // hooked mine launcher
    rect(g, 10, -9, 30, 18, 4); g.fillStyle = '#353944'; g.fill(); g.stroke();
    g.beginPath(); g.arc(42, 0, 9, 0, Math.PI * 2); g.fillStyle = pal.accent; g.fill(); g.stroke();
    g.strokeStyle = '#c9ccd4'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(22, 9); g.lineTo(22, 15); g.arc(19, 15, 3, 0, Math.PI); g.stroke(); g.strokeStyle = INK; g.lineWidth = 4;
  },
  flicker(g, pal) { // twin curved blades
    for (const k of [-1, 1]) {
      g.beginPath(); g.moveTo(10, k * 10); g.quadraticCurveTo(34, k * 22, 52, k * 6); g.lineTo(46, k * 3); g.quadraticCurveTo(30, k * 12, 10, k * 4); g.closePath();
      g.fillStyle = '#2a2838'; g.fill(); g.lineWidth = 3; g.stroke();
      g.strokeStyle = pal.metal; g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, k * 9); g.quadraticCurveTo(34, k * 19, 50, k * 6); g.stroke(); g.strokeStyle = INK; // edge glint
    }
    g.lineWidth = 4;
  },
};
