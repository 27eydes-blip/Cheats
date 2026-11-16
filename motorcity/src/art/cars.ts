/** Period motor cars drawn as pixel art: rear view (3 yaw frames, 4 wheel phases, brake lamps, scarf),
 *  side view and front view for spin-outs. Player car is hand-tinted colour; rivals are sepia. */
import { canvas, rect, px, hline, vline, S, hexToRgb, rgbToHex, shade, mix, text, type Ctx } from './pixel';

export type ModelId = 'runabout' | 'modelT' | 'stutz' | 'mercer' | 'buick' | 'packard' | 'special' | 'truck' | 'carriage';

export interface CarModel {
  id: ModelId;
  name: string;
  tail: 'tank' | 'bolster' | 'flat' | 'boat' | 'touring';
  /** Rear-wheel centre offset from car centre (px). */
  wheelX: number;
  wheelRy: number;
  wheelRx: number;
  /** Body half-width at the tail (px). */
  bodyW: number;
  /** Extra height of body (px). */
  tall: number;
  screen: 'monocle' | 'upright' | 'none';
  mechanic: boolean;
  spare: boolean;
  /** Default paint (rivals use it in sepia). */
  paint: string;
  number: string;
}

export const MODELS: Record<string, CarModel> = {
  runabout: { id: 'runabout', name: 'Detroit Runabout', tail: 'flat', wheelX: 25, wheelRy: 14, wheelRx: 5, bodyW: 18, tall: 2, screen: 'upright', mechanic: false, spare: false, paint: '#8c2f2b', number: '7' },
  modelT: { id: 'modelT', name: 'Ford Model T', tail: 'flat', wheelX: 24, wheelRy: 15, wheelRx: 4, bodyW: 18, tall: 6, screen: 'upright', mechanic: false, spare: false, paint: '#1d1c1b', number: '3' },
  stutz: { id: 'stutz', name: 'Stutz Bearcat', tail: 'bolster', wheelX: 27, wheelRy: 15, wheelRx: 6, bodyW: 19, tall: 0, screen: 'monocle', mechanic: true, spare: true, paint: '#c9a227', number: '11' },
  mercer: { id: 'mercer', name: 'Mercer Raceabout', tail: 'tank', wheelX: 26, wheelRy: 15, wheelRx: 6, bodyW: 17, tall: -2, screen: 'monocle', mechanic: true, spare: false, paint: '#c23b22', number: '5' },
  buick: { id: 'buick', name: 'Buick Bug', tail: 'boat', wheelX: 26, wheelRy: 14, wheelRx: 6, bodyW: 15, tall: -3, screen: 'none', mechanic: false, spare: false, paint: '#2e4a6b', number: '9' },
  packard: { id: 'packard', name: 'Packard Six', tail: 'touring', wheelX: 28, wheelRy: 16, wheelRx: 6, bodyW: 23, tall: 5, screen: 'upright', mechanic: true, spare: true, paint: '#3b4a33', number: '2' },
  special: { id: 'special', name: 'Motor City Special', tail: 'boat', wheelX: 27, wheelRy: 16, wheelRx: 7, bodyW: 17, tall: -3, screen: 'monocle', mechanic: false, spare: false, paint: '#a3242b', number: '1' },
};

export const CAR_W = 80, CAR_H = 58;
/** World units per pixel for car sprites (car ≈ 430 units wide). */
export const CAR_UPP = 7.2;

type Pal = (hex: string) => string;
const lum = (h: string) => { const [r, g, b] = hexToRgb(h); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };
/** Map any colour to the sepia ramp by luminance (for B&W-world cars). */
export const toSepia: Pal = (h) => { const l = lum(h); const i = Math.max(0, Math.min(S.length - 1, Math.round(l * (S.length - 1) * 1.05))); return S[i]; };
/** Hand-tinted look: keep hue but soften saturation, like a colourised photograph. */
export const tinted: Pal = (h) => { const [r, g, b] = hexToRgb(h); const l = 0.3 * r + 0.59 * g + 0.11 * b; const k = 0.78; return rgbToHex(l + (r - l) * k, l + (g - l) * k + 3, l + (b - l) * k - 4); };

function ellipseFill(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, col: string) {
  ctx.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

/** Spoked artillery wheel seen nearly edge-on (ellipse); phase 0..1 rotates spokes. */
function wheel(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, phase: number, c: Pal, spokeCol = '#c4a573') {
  ellipseFill(ctx, cx, cy, rx + 1, ry, c('#0a0908'));
  ellipseFill(ctx, cx, cy, rx, ry - 1, c('#3a3530'));
  ellipseFill(ctx, cx, cy, Math.max(1, rx - 1), ry - 2, c('#56504a'));
  ellipseFill(ctx, cx, cy, Math.max(1, rx - 2), ry - 4, c('#1a1612'));
  const n = 12;
  ctx.fillStyle = c(spokeCol);
  for (let k = 0; k < n; k++) {
    const a = (phase * Math.PI * 2) / n + (k * Math.PI * 2) / n;
    const ca = Math.cos(a), sa = Math.sin(a);
    if (ca < -0.2) continue; // far half hidden behind hub
    for (let t = 0.2; t <= 1; t += 0.08) ctx.fillRect(Math.round(cx + sa * t * (rx - 2)), Math.round(cy + ca * t * (ry - 4)), 1, 1);
  }
  // felloe ring + hub
  ctx.fillStyle = c('#7a5c38');
  for (let y = -(ry - 3); y <= ry - 3; y += 1) {
    const w = Math.round((rx - 2) * Math.sqrt(Math.max(0, 1 - (y / (ry - 3)) ** 2)));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), 1, 1); ctx.fillRect(Math.round(cx + w), Math.round(cy + y), 1, 1);
  }
  rect(ctx, cx - 1, cy - 2, 3, 4, c('#c9a04a'));
  px(ctx, cx, cy - 1, c('#f0d890'));
  // tyre highlight
  for (let y = -ry + 2; y < ry - 2; y += 3) px(ctx, cx - rx, cy + y, c('#3a3530'));
}

export interface CarState { yaw: -1 | 0 | 1; wheel: number; brake: boolean; scarf: number; colour: boolean; paint?: string }

export function drawRear(m: CarModel, st: CarState): HTMLCanvasElement {
  const [cv, ctx] = canvas(CAR_W, CAR_H);
  const c: Pal = st.colour ? tinted : toSepia;
  const paint = st.paint ?? m.paint;
  const P = c(paint), PD = c(shade(paint, 0.62)), PL = c(shade(paint, 1.35)), PDD = c(shade(paint, 0.4));
  const brass = c('#c9a04a'), brassL = c('#f2d68a'), brassD = c('#7d5f26');
  const leather = c('#5b3a22'), leatherL = c('#87603e');
  const cx = 40 + st.yaw * 0; const gy = CAR_H - 1;
  const y = st.yaw;
  const t = m.tall;
  // --- ground shadow
  ctx.globalAlpha = 0.5; ellipseFill(ctx, cx, gy - 1, 34, 3, '#000'); ctx.globalAlpha = 1;
  // --- front wheels (far, peeking at top corners); steer shows one turned
  const fwY = gy - 26 - t;
  for (const s of [-1, 1]) {
    const fx = cx + s * (m.wheelX - 6) + y * 5;
    wheel(ctx, fx, fwY, Math.max(2, m.wheelRx - 2 + (s === y ? 1 : 0)), m.wheelRy - 6, st.wheel, c);
  }
  // --- hood stretching ahead, pointing into the turn
  const hoodTop = gy - 36 - t, hoodBot = gy - 22 - t;
  for (let yy = hoodTop; yy <= hoodBot; yy++) {
    const f = (yy - hoodTop) / (hoodBot - hoodTop);
    const half = Math.round(6 + f * 7);
    const off = Math.round(y * (1 - f) * 6);
    hline(ctx, cx - half + off, yy, half * 2 + 1, P);
    px(ctx, cx - half + off, yy, PD); px(ctx, cx + half + off, yy, PD);
    px(ctx, cx + off, yy, PL); // centre seam highlight
    if ((yy - hoodTop) % 3 === 1) { px(ctx, cx - half + 2 + off, yy, PD); px(ctx, cx + half - 2 + off, yy, PD); } // louvres
  }
  // radiator cap + brass shell glimpsed at hood tip
  rect(ctx, cx - 4 + y * 6, hoodTop - 2, 9, 2, brass); px(ctx, cx + y * 6, hoodTop - 3, brassL);
  // front fenders
  for (const s of [-1, 1]) {
    const fx = cx + s * (m.wheelX - 6) + y * 5;
    hline(ctx, fx - 3, fwY - m.wheelRy + 5, 7, PD);
    hline(ctx, fx - 2, fwY - m.wheelRy + 4, 5, P);
  }
  // --- windscreen
  if (m.screen === 'upright') {
    rect(ctx, cx - 14 + y * 2, gy - 44 - t, 29, 1, brass);
    vline(ctx, cx - 14 + y * 2, gy - 44 - t, 10, brass); vline(ctx, cx + 14 + y * 2, gy - 44 - t, 10, brass);
    ctx.globalAlpha = 0.25; rect(ctx, cx - 13 + y * 2, gy - 43 - t, 27, 9, '#dfe8e8'); ctx.globalAlpha = 1;
  } else if (m.screen === 'monocle') {
    ellipseFill(ctx, cx - 6 + y * 2, gy - 37 - t, 4, 3, brassD);
    ctx.globalAlpha = 0.45; ellipseFill(ctx, cx - 6 + y * 2, gy - 37 - t, 3, 2, '#e6f0f0'); ctx.globalAlpha = 1;
  }
  // --- cockpit tub + seats
  const tubTop = gy - 29 - t;
  rect(ctx, cx - m.bodyW + 3, tubTop, (m.bodyW - 3) * 2 + 1, 6, PD);
  rect(ctx, cx - m.bodyW + 4, tubTop + 1, (m.bodyW - 4) * 2 + 1, 4, leather);
  hline(ctx, cx - m.bodyW + 4, tubTop + 1, (m.bodyW - 4) * 2 + 1, leatherL);
  // --- driver (left seat) + optional riding mechanic (right)
  driver(ctx, cx - 6 + y, tubTop, st, c, false);
  if (m.mechanic) driver(ctx, cx + 7 + y, tubTop + 1, { ...st, scarf: (st.scarf + 1) % 3 }, c, true);
  // --- rear wheels (near), drawn before tail so tail overlaps their inner edge
  const rwY = gy - m.wheelRy;
  for (const s of [-1, 1]) wheel(ctx, cx + s * m.wheelX, rwY, m.wheelRx + (s === -y ? 1 : 0), m.wheelRy, st.wheel + (s > 0 ? 0.13 : 0), c);
  // --- rear fenders (mudguards)
  for (const s of [-1, 1]) {
    const fx = cx + s * m.wheelX;
    for (let i = -m.wheelRx - 2; i <= m.wheelRx + 2; i++) {
      const h = Math.round(Math.sqrt(Math.max(0, 1 - (i / (m.wheelRx + 3)) ** 2)) * 3);
      vline(ctx, fx + i, rwY - m.wheelRy - h + 1, 2, i === 0 ? PL : P);
    }
    hline(ctx, fx - m.wheelRx - 2, rwY - m.wheelRy + 2, (m.wheelRx + 2) * 2 + 1, PDD);
  }
  // --- tail body
  const tailTop = gy - 24 - t, tailBot = gy - 8;
  if (m.tail === 'boat') {
    for (let yy = tailTop; yy <= tailBot; yy++) {
      const f = (yy - tailTop) / (tailBot - tailTop);
      const half = Math.round(m.bodyW * (1 - f * 0.55));
      hline(ctx, cx - half, yy, half * 2 + 1, P);
      px(ctx, cx - half, yy, PD); px(ctx, cx + half, yy, PDD);
      if (f < 0.3) hline(ctx, cx - half + 2, yy, Math.max(1, half - 4), PL);
    }
    // faired headrest behind driver
    ellipseFill(ctx, cx - 6 + y, tailTop - 1, 5, 4, P); hline(ctx, cx - 9 + y, tailTop - 4, 6, PL);
    vline(ctx, cx, tailTop, tailBot - tailTop, PD);
  } else {
    rect(ctx, cx - m.bodyW, tailTop, m.bodyW * 2 + 1, tailBot - tailTop, P);
    hline(ctx, cx - m.bodyW, tailTop, m.bodyW * 2 + 1, PL);
    vline(ctx, cx - m.bodyW, tailTop, tailBot - tailTop, PD); vline(ctx, cx + m.bodyW, tailTop, tailBot - tailTop, PDD);
    hline(ctx, cx - m.bodyW, tailBot - 1, m.bodyW * 2 + 1, PDD);
    // pinstripe
    hline(ctx, cx - m.bodyW + 2, tailTop + 3, m.bodyW * 2 - 3, c(st.colour ? '#e8d6a0' : '#d0bc90'));
    if (m.tail === 'tank') {
      ellipseFill(ctx, cx, tailTop + 6, 9, 7, c('#5e5a55'));
      ellipseFill(ctx, cx, tailTop + 6, 8, 6, P);
      ellipseFill(ctx, cx - 2, tailTop + 4, 3, 2, PL);
      rect(ctx, cx - 1, tailTop - 1, 3, 2, brass);
      for (const s of [-1, 1]) vline(ctx, cx + s * 5, tailTop, 13, c('#2a2622'));
    } else if (m.tail === 'bolster') {
      rect(ctx, cx - 15, tailTop - 4, 31, 7, c('#8a8680'));
      hline(ctx, cx - 15, tailTop - 4, 31, c('#c8c4bc')); hline(ctx, cx - 15, tailTop + 2, 31, c('#4a4640'));
      rect(ctx, cx - 1, tailTop - 6, 3, 2, brass);
    } else if (m.tail === 'touring') {
      rect(ctx, cx - m.bodyW + 2, tailTop - 7, m.bodyW * 2 - 3, 7, leather); // high rear seat back
      hline(ctx, cx - m.bodyW + 2, tailTop - 7, m.bodyW * 2 - 3, leatherL);
      // folded top bundle
      rect(ctx, cx - m.bodyW + 1, tailTop - 10, m.bodyW * 2 - 1, 3, c('#3a3632'));
    } else if (m.id === 'modelT') {
      rect(ctx, cx - m.bodyW + 1, tailTop - 8, m.bodyW * 2 - 1, 4, c('#2b2825')); // folded top
      for (let x = cx - m.bodyW + 3; x < cx + m.bodyW - 1; x += 4) vline(ctx, x, tailTop - 8, 4, c('#45403a'));
    }
    if (m.spare) {
      ellipseFill(ctx, cx + 10, tailTop + 9, 6, 7, c('#141210'));
      ellipseFill(ctx, cx + 10, tailTop + 9, 3, 4, c('#3a3530'));
    }
  }
  // --- number roundel
  const nx = m.spare ? cx - 9 : cx;
  ellipseFill(ctx, nx, tailBot - 7, 4, 4, c('#efe6cc'));
  text(ctx, m.number, nx - (m.number.length * 4 - 1) / 2, tailBot - 9, c('#1a1410'));
  // --- tail lamps (kerosene lamps with red lenses)
  for (const s of [-1, 1]) {
    const lx = cx + s * (m.bodyW - 3);
    rect(ctx, lx - 2, tailBot - 4, 5, 5, brassD);
    rect(ctx, lx - 1, tailBot - 3, 3, 3, st.brake ? '#ff5a3c' : c('#7a2418'));
    if (st.brake) { px(ctx, lx, tailBot - 3, '#ffd0a0'); }
    px(ctx, lx - 1, tailBot - 4, brassL);
  }
  // --- exhaust pipe (right side)
  rect(ctx, cx + m.bodyW - 2, tailBot + 1, 6, 2, c('#3a3632')); px(ctx, cx + m.bodyW + 4, tailBot + 1, c('#111'));
  // chassis / differential
  rect(ctx, cx - m.wheelX + m.wheelRx, gy - m.wheelRy - 1, (m.wheelX - m.wheelRx) * 2, 2, c('#1e1c1a'));
  ellipseFill(ctx, cx, gy - m.wheelRy, 3, 2, c('#2a2622'));
  void mix;
  return cv;
}

function driver(ctx: Ctx, x: number, seatY: number, st: CarState, c: Pal, mech: boolean) {
  const coat = c(mech ? '#5d5446' : '#9b8358'), coatD = c(mech ? '#3c362c' : '#6d5b3b');
  const cap = c('#4a2f1c'), capL = c('#7a5236');
  // shoulders + back
  rect(ctx, x - 6, seatY - 7, 13, 8, coat);
  hline(ctx, x - 6, seatY - 7, 13, c(mech ? '#776c5a' : '#b89e70'));
  vline(ctx, x - 6, seatY - 6, 7, coatD); vline(ctx, x + 6, seatY - 6, 7, coatD);
  vline(ctx, x, seatY - 6, 6, coatD); // coat seam
  // arms forward to wheel
  rect(ctx, x - 8, seatY - 5, 2, 5, coatD); rect(ctx, x + 7, seatY - 5, 2, 5, coatD);
  // neck + head in leather helmet with goggle strap
  rect(ctx, x - 1, seatY - 9, 3, 2, c('#c9a57e'));
  rect(ctx, x - 3, seatY - 16, 7, 7, cap);
  rect(ctx, x - 2, seatY - 17, 5, 1, cap);
  hline(ctx, x - 2, seatY - 16, 3, capL); px(ctx, x - 3, seatY - 14, capL);
  hline(ctx, x - 3, seatY - 13, 7, c('#2a1a10')); // goggle strap
  px(ctx, x - 4, seatY - 13, c('#c9a04a')); px(ctx, x + 4, seatY - 13, c('#c9a04a'));
  rect(ctx, x - 4, seatY - 12, 2, 2, cap); rect(ctx, x + 3, seatY - 12, 2, 2, cap); // ear flaps
  if (mech) return;
  // flapping scarf streaming back and to the side
  const sc = c('#d83a2e'), scL = c('#f6efe0');
  const ph = st.scarf;
  const tailPts = [[0, 0], [2, 1], [4, 1 + (ph === 1 ? 1 : 0)], [6, 2 + (ph === 2 ? 1 : 0)], [8, 2 + ph], [10, 3 + (ph === 0 ? 1 : 0)], [12, 4 - (ph === 1 ? 2 : 0)], [14, 4 + (ph === 2 ? -1 : 1)]];
  rect(ctx, x - 3, seatY - 9, 7, 2, sc);
  for (let i = 0; i < tailPts.length; i++) {
    const [dx, dy] = tailPts[i];
    const col = (i >> 1) % 2 ? scL : sc;
    rect(ctx, x + 3 + dx - (st.yaw > 0 ? 18 + dx * 0 : 0), seatY - 9 + dy - 1, 2, 2, col);
  }
}

export function drawSide(m: CarModel, st: CarState): HTMLCanvasElement {
  const [cv, ctx] = canvas(CAR_W, CAR_H);
  const c: Pal = st.colour ? tinted : toSepia;
  const paint = st.paint ?? m.paint;
  const P = c(paint), PD = c(shade(paint, 0.6)), PL = c(shade(paint, 1.3));
  const gy = CAR_H - 1;
  ctx.globalAlpha = 0.5; ellipseFill(ctx, 40, gy - 1, 36, 3, '#000'); ctx.globalAlpha = 1;
  const r = 11;
  for (const wx of [16, 64]) {
    ellipseFill(ctx, wx, gy - r, r, r, c('#141210'));
    ellipseFill(ctx, wx, gy - r, r - 2, r - 2, c('#0e0c0b'));
    ctx.fillStyle = c('#c4a573');
    for (let k = 0; k < 12; k++) { const a = (st.wheel * Math.PI) / 6 + (k * Math.PI) / 6; for (let t = 2; t < r - 2; t++) ctx.fillRect(Math.round(wx + Math.cos(a) * t), Math.round(gy - r + Math.sin(a) * t), 1, 1); }
    rect(ctx, wx - 1, gy - r - 1, 3, 3, c('#c9a04a'));
    for (let i = -r - 1; i <= r + 1; i++) px(ctx, wx + i, gy - r - Math.round(Math.sqrt(Math.max(0, (r + 2) ** 2 - i * i))), P);
  }
  rect(ctx, 6, gy - 22, 68, 9, P); hline(ctx, 6, gy - 22, 68, PL); hline(ctx, 6, gy - 14, 68, PD);
  rect(ctx, 54, gy - 26, 22, 5, P); rect(ctx, 74, gy - 27, 4, 12, c('#c9a04a'));
  rect(ctx, 26, gy - 30, 14, 9, c('#5b3a22'));
  rect(ctx, 28, gy - 40, 8, 10, c('#9b8358')); rect(ctx, 29, gy - 46, 6, 6, c('#4a2f1c'));
  rect(ctx, 2, gy - 26, 10, 8, PD);
  return cv;
}

export function drawFront(m: CarModel, st: CarState): HTMLCanvasElement {
  const [cv, ctx] = canvas(CAR_W, CAR_H);
  const c: Pal = st.colour ? tinted : toSepia;
  const paint = st.paint ?? m.paint;
  const P = c(paint), PD = c(shade(paint, 0.6));
  const gy = CAR_H - 1, cx = 40;
  ctx.globalAlpha = 0.5; ellipseFill(ctx, cx, gy - 1, 34, 3, '#000'); ctx.globalAlpha = 1;
  for (const s of [-1, 1]) wheel(ctx, cx + s * m.wheelX, gy - m.wheelRy, m.wheelRx, m.wheelRy, st.wheel, c);
  // radiator
  rect(ctx, cx - 8, gy - 34, 17, 20, c('#c9a04a'));
  rect(ctx, cx - 6, gy - 32, 13, 16, c('#2a2622'));
  for (let y = gy - 31; y < gy - 16; y += 2) hline(ctx, cx - 6, y, 13, c('#4a4640'));
  // headlamps
  for (const s of [-1, 1]) { ellipseFill(ctx, cx + s * 15, gy - 30, 5, 5, c('#c9a04a')); ellipseFill(ctx, cx + s * 15, gy - 30, 3, 3, c('#f8f0d8')); }
  // fenders + driver
  for (const s of [-1, 1]) rect(ctx, cx + s * m.wheelX - 6, gy - m.wheelRy * 2 - 2, 13, 3, P);
  rect(ctx, cx - 6, gy - 44, 13, 10, c('#9b8358')); rect(ctx, cx - 3, gy - 51, 7, 7, c('#c9a57e'));
  rect(ctx, cx - 3, gy - 52, 7, 3, c('#4a2f1c')); rect(ctx, cx - 3, gy - 49, 3, 2, c('#d8e8e8')); rect(ctx, cx + 1, gy - 49, 3, 2, c('#d8e8e8'));
  rect(ctx, cx - 4, gy - 44, 9, 2, c('#d83a2e'));
  rect(ctx, cx - m.bodyW, gy - 16, m.bodyW * 2, 3, PD);
  return cv;
}

const cache = new Map<string, HTMLCanvasElement>();
export function carSprite(m: CarModel, view: 'rear' | 'side' | 'front', st: CarState): HTMLCanvasElement {
  const key = `${m.id}|${view}|${st.yaw}|${st.wheel & 3}|${st.brake ? 1 : 0}|${st.scarf}|${st.colour ? 1 : 0}|${st.paint ?? ''}`;
  let cv = cache.get(key);
  if (!cv) {
    const s = { ...st, wheel: (st.wheel & 3) / 4 };
    cv = view === 'rear' ? drawRear(m, s) : view === 'side' ? drawSide(m, s) : drawFront(m, s);
    cache.set(key, cv);
  }
  return cv;
}
