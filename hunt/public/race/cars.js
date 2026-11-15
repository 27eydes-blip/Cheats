// Hunt Racers vehicles: one original top-down car per driver, drawn in code, with the driver
// visible in the cockpit. Cars point along +x (nose right). Sprites are cached per driver and
// angle bucket (the gloss and the outline stay lit from the same top-left light at every heading),
// and drawn with a small leftover rotation so turning stays smooth.
//
//   VOLT    Static Comet  arrow-nosed racer, tesla coil prongs on the tail, lightning decal
//   BRICK   Iron Mule     wide heavy hauler, riveted ram plate, twin stacks
//   WISP    Ghostline     long, thin, swept fins, lance under the nose
//   DUNE    Dust Strider  open roll-cage buggy, big knobby tyres, spare on the back
//   ROOK    Bastion       armour-plated tank car, sentry dome on the roof
//   FLICKER Quickstitch   tiny kart with curved blade fins on the side pods
import { DRIVERS } from './physics.js';

export const INK = '#12091e';
export const BUCKETS = 32;
const HALF = 40; // sprite half size in world px (cars are ~54 x 32 plus fins / lance)

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
const fillStroke = (g, fill, lw = 2.4) => { g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); };
const tyre = (g, x, y, w = 13, h = 7, knobby = false) => {
  rr(g, x - w / 2, y - h / 2, w, h, 2.2); fillStroke(g, '#1d1a22', 2);
  g.strokeStyle = knobby ? '#5a5560' : '#3a3640'; g.lineWidth = 1.4; g.beginPath();
  for (let k = -w / 2 + 3; k < w / 2 - 1; k += knobby ? 2.6 : 4) { g.moveTo(x + k, y - h / 2 + 1.5); g.lineTo(x + k, y + h / 2 - 1.5); }
  g.stroke();
};
// a helmet from above: shell, visor toward the nose, a stripe
const helmet = (g, x, y, r, shell, visor, stripe) => {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fillStroke(g, shell, 2);
  g.beginPath(); g.arc(x, y, r - 1.2, -0.95, 0.95); g.lineTo(x + r * 0.25, y); g.closePath(); g.fillStyle = visor; g.fill();
  if (stripe) { g.strokeStyle = stripe; g.lineWidth = 2; g.beginPath(); g.moveTo(x - r + 1.5, y); g.lineTo(x + r * 0.2, y); g.stroke(); }
};
const cockpit = (g, x, y, w, h, col = '#241a33') => { rr(g, x - w / 2, y - h / 2, w, h, h / 2.2); fillStroke(g, col, 2); };

const DRAW = {
  volt(g, c) {
    tyre(g, 15, -13); tyre(g, 15, 13); tyre(g, -15, -14, 14, 8); tyre(g, -15, 14, 14, 8);
    poly(g, [28, 0, 18, -10, -4, -13, -24, -11, -27, 0, -24, 11, -4, 13, 18, 10]); fillStroke(g, c.color, 2.6);
    poly(g, [26, 0, 17, -4, 4, -5, 4, 5, 17, 4]); g.fillStyle = '#fff3b0'; g.fill(); // nose highlight
    g.strokeStyle = c.accent; g.lineWidth = 2.2; g.lineJoin = 'round'; g.beginPath(); g.moveTo(20, -2); g.lineTo(13, 3); g.lineTo(9, -2); g.lineTo(2, 3); g.stroke(); // lightning decal
    cockpit(g, -5, 0, 15, 14);
    helmet(g, -5, 0, 5.4, c.color, '#3a86ff', c.accent);
    // tesla coil: two prongs and orbs on the tail
    for (const s of [-1, 1]) { g.strokeStyle = INK; g.lineWidth = 4.2; g.beginPath(); g.moveTo(-20, s * 6); g.lineTo(-30, s * 8); g.stroke(); g.strokeStyle = '#8fb8ff'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.arc(-31, s * 8, 3.4, 0, 7); fillStroke(g, '#5ff4ff', 1.8); }
  },
  brick(g, c) {
    tyre(g, 15, -16, 15, 9); tyre(g, 15, 16, 15, 9); tyre(g, -14, -16, 16, 10); tyre(g, -14, 16, 16, 10);
    rr(g, -25, -14, 46, 28, 5); fillStroke(g, c.color, 2.8);
    rr(g, -22, -11, 20, 22, 3); fillStroke(g, '#d65a22', 2); // cargo bed
    g.strokeStyle = 'rgba(18,9,30,.45)'; g.lineWidth = 1.6; g.beginPath(); for (const y of [-5, 0, 5]) { g.moveTo(-21, y); g.lineTo(-3, y); } g.stroke();
    // ram plate across the nose, riveted
    rr(g, 21, -18, 8, 36, 2.5); fillStroke(g, '#7d8290', 2.6);
    g.fillStyle = '#3d3f4a'; for (const y of [-13, -5, 3, 11]) { g.beginPath(); g.arc(25, y + 1, 1.5, 0, 7); g.fill(); }
    cockpit(g, 8, 0, 14, 17, '#2e2420');
    helmet(g, 8, 0, 6.2, c.color, '#3b2a20', c.accent);
    for (const s of [-1, 1]) { g.beginPath(); g.arc(-1, s * 13, 3, 0, 7); fillStroke(g, '#4a4d58', 1.8); g.beginPath(); g.arc(-1, s * 13, 1.2, 0, 7); g.fillStyle = INK; g.fill(); } // twin stacks
  },
  wisp(g, c) {
    tyre(g, 14, -11, 12, 6); tyre(g, 14, 11, 12, 6); tyre(g, -16, -12, 13, 7); tyre(g, -16, 12, 13, 7);
    for (const s of [-1, 1]) { poly(g, [-10, s * 8, -30, s * 19, -26, s * 7]); fillStroke(g, c.accent, 2.2); } // swept fins
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(26, 0); g.lineTo(38, 0); g.stroke(); g.strokeStyle = '#d8f6ff'; g.lineWidth = 2; g.stroke(); // lance
    poly(g, [32, 0, 20, -8, -12, -9, -27, -6, -27, 6, -12, 9, 20, 8]); fillStroke(g, c.color, 2.6);
    g.fillStyle = '#c7fff0'; poly(g, [29, 0, 20, -3, 0, -3.5, 0, 3.5, 20, 3]); g.fill();
    g.strokeStyle = c.accent; g.lineWidth = 2; g.beginPath(); g.moveTo(-24, -3.5); g.lineTo(-8, -3.5); g.moveTo(-24, 3.5); g.lineTo(-8, 3.5); g.stroke(); // glow strips
    cockpit(g, -3, 0, 15, 12, '#1d1c2c');
    helmet(g, -3, 0, 5, '#eef6ff', '#5ef2c6', c.accent);
  },
  dune(g, c) {
    tyre(g, 15, -16, 15, 10, true); tyre(g, 15, 16, 15, 10, true); tyre(g, -15, -17, 17, 11, true); tyre(g, -15, 17, 17, 11, true);
    poly(g, [26, -6, 26, 6, 10, 12, -22, 12, -26, 6, -26, -6, -22, -12, 10, -12]); fillStroke(g, c.color, 2.6);
    g.fillStyle = '#f6d38c'; poly(g, [24, -4, 24, 4, 12, 7, 12, -7]); g.fill();
    // roll cage
    g.strokeStyle = INK; g.lineWidth = 4; rr(g, -14, -10, 22, 20, 4); g.stroke(); g.strokeStyle = c.accent; g.lineWidth = 2.2; g.stroke();
    g.beginPath(); g.moveTo(-14, -10); g.lineTo(8, 10); g.moveTo(-14, 10); g.lineTo(8, -10); g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = c.accent; g.lineWidth = 1.6; g.stroke();
    helmet(g, -3, 0, 5.6, '#efe4cc', '#2a1a10', c.accent); // sand wrap
    g.beginPath(); g.arc(-27, 0, 6, 0, 7); fillStroke(g, '#2a2530', 2.2); g.beginPath(); g.arc(-27, 0, 2.6, 0, 7); g.fillStyle = '#8a8590'; g.fill(); // spare tyre
  },
  rook(g, c) {
    tyre(g, 15, -15, 15, 9); tyre(g, 15, 15, 15, 9); tyre(g, -14, -15, 15, 9); tyre(g, -14, 15, 15, 9);
    poly(g, [27, -8, 27, 8, 20, 14, -22, 14, -27, 9, -27, -9, -22, -14, 20, -14]); fillStroke(g, c.color, 2.8);
    g.strokeStyle = 'rgba(18,9,30,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(14, -13); g.lineTo(14, 13); g.moveTo(-16, -13); g.lineTo(-16, 13); g.moveTo(-26, 0); g.lineTo(-20, 0); g.stroke(); // plates
    g.fillStyle = '#9cc364'; poly(g, [25, -6, 25, 6, 16, 9, 16, -9]); g.fill();
    cockpit(g, 6, 0, 13, 14, '#121419');
    helmet(g, 6, 0, 5.2, '#262a33', c.accent, null);
    g.fillStyle = '#e8e2d2'; poly(g, [11, -1.6, 15, 0, 11, 1.6]); g.fill(); // beak tip on the visor
    // sentry dome on the roof
    g.beginPath(); g.arc(-10, 0, 7.5, 0, 7); fillStroke(g, '#5a6a3a', 2.4);
    g.strokeStyle = INK; g.lineWidth = 4.4; g.beginPath(); g.moveTo(-10, 0); g.lineTo(-23, 0); g.stroke(); g.strokeStyle = c.accent; g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.arc(-10, 0, 3.2, 0, 7); g.fillStyle = c.accent; g.fill();
  },
  flicker(g, c) {
    tyre(g, 12, -12, 11, 7); tyre(g, 12, 12, 11, 7); tyre(g, -12, -12, 12, 7); tyre(g, -12, 12, 12, 7);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(6, s * 8); g.quadraticCurveTo(-2, s * 26, -20, s * 22); g.quadraticCurveTo(-6, s * 18, -6, s * 8); g.closePath(); fillStroke(g, '#f2eef8', 2.2); g.strokeStyle = c.accent; g.lineWidth = 1.4; g.beginPath(); g.moveTo(2, s * 11); g.quadraticCurveTo(-4, s * 20, -16, s * 21); g.stroke(); } // blade fins
    poly(g, [23, 0, 15, -9, -16, -9, -21, -5, -21, 5, -16, 9, 15, 9]); fillStroke(g, c.color, 2.6);
    g.fillStyle = '#e3a3ff'; poly(g, [21, 0, 15, -4, 6, -4, 6, 4, 15, 4]); g.fill();
    cockpit(g, -3, 0, 13, 13, '#16141f');
    helmet(g, -3, 0, 5, c.color, c.accent, null);
    g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-0.5, -2.6); g.lineTo(1.6, 0); g.lineTo(-0.5, 2.6); g.stroke(); // visor slit glint
  },
};

// draw a car at the origin, nose along +x (unrotated art; used by the sprite cache and menus)
export function drawCar(g, id) {
  const c = DRIVERS[id] || DRIVERS.volt;
  g.lineJoin = 'round'; g.lineCap = 'round';
  (DRAW[id] || DRAW.volt)(g, c);
}

// cache: per driver, per pixel scale, one canvas per angle bucket (built lazily)
export class CarSprites {
  constructor() { this.scale = 0; this.map = new Map(); }
  setScale(s) { if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this.map.clear(); } }
  get(id, a) {
    let arr = this.map.get(id);
    if (!arr) { arr = new Array(BUCKETS).fill(null); this.map.set(id, arr); }
    let b = Math.round((a / (Math.PI * 2)) * BUCKETS) % BUCKETS;
    if (b < 0) b += BUCKETS;
    return arr[b] || (arr[b] = this.build(id, b));
  }
  build(id, b) {
    const s = this.scale, px = Math.ceil(HALF * 2 * s), cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d'), ang = (b / BUCKETS) * Math.PI * 2;
    g.setTransform(s, 0, 0, s, px / 2, px / 2);
    g.save(); g.rotate(ang); drawCar(g, id); g.restore();
    // gloss lit from the top left, the same at every heading (that is why sprites are per bucket)
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(-HALF * 0.6, -HALF * 0.6, HALF * 0.5, HALF * 0.5);
    gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(10,0,30,0.22)');
    g.fillStyle = gr; g.fillRect(-HALF, -HALF, HALF * 2, HALF * 2);
    g.globalCompositeOperation = 'source-over';
    cv.ang = ang; cv.half = HALF;
    return cv;
  }
}
