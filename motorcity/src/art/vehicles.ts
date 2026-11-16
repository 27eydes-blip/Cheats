/** Traffic seen from behind: horse carriage, delivery wagon, trolley car, motor truck (sepia). */
import { canvas, rect, px, hline, vline, S, STONE, textCentered, text, type Ctx } from './pixel';
import { register } from './registry';

const ellipse = (ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: string) => {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2))); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
};

function spokedRear(ctx: Ctx, cx: number, cy: number, ry: number, phase: number) {
  ellipse(ctx, cx, cy, 2, ry, S[1]);
  for (let k = 0; k < 6; k++) { const a = phase + (k * Math.PI) / 3; px(ctx, cx, cy + Math.round(Math.cos(a) * (ry - 2)), S[7]); }
}

function horse(ctx: Ctx, cx: number, top: number, frame: number, rear: boolean) {
  // horse seen from behind beyond the carriage: rump, tail, ears, head
  const b = S[3], bl = S[5], bd = S[1];
  const hop = frame ? 1 : 0;
  ellipse(ctx, cx, top + 10 - hop, 8, 7, b);
  hline(ctx, cx - 6, top + 5 - hop, 12, bl);
  vline(ctx, cx, top + 8 - hop, 9, bd); // tail
  vline(ctx, cx + 1, top + 9 - hop, 8, bd);
  rect(ctx, cx - 3, top - 2 - hop - (rear ? 6 : 0), 6, 7, b); // neck/head
  px(ctx, cx - 3, top - 4 - hop - (rear ? 6 : 0), bd); px(ctx, cx + 2, top - 4 - hop - (rear ? 6 : 0), bd); // ears
  // legs
  const lf = frame ? 2 : 0;
  rect(ctx, cx - 6, top + 16 - hop, 2, 8 - lf + hop, bd); rect(ctx, cx + 4, top + 16 - hop, 2, 6 + lf + hop, bd);
  // harness
  hline(ctx, cx - 8, top + 7 - hop, 16, S[0]);
}

function carriage(frame: number, wagon: boolean, variant: number) {
  const [c, ctx] = canvas(56, 64);
  const cx = 28, gy = 63;
  ctx.globalAlpha = 0.45; ellipse(ctx, cx, gy - 1, 24, 2, '#000'); ctx.globalAlpha = 1;
  horse(ctx, cx, 4, frame, false);
  if (wagon) {
    // delivery wagon with canvas tilt and painted tailboard
    for (let y = 18; y < 40; y++) { const w = 17 - Math.max(0, (24 - y) * 0.8); hline(ctx, cx - w, y, w * 2, y < 22 ? S[10] : S[9]); }
    for (let x = -14; x <= 14; x += 7) vline(ctx, cx + x, 20, 20, S[7]);
    rect(ctx, cx - 18, 40, 36, 12, S[5]); hline(ctx, cx - 18, 40, 36, S[7]); hline(ctx, cx - 18, 51, 36, S[2]);
    textCentered(ctx, ['ICE', 'BREAD', 'MILK'][variant % 3], cx, 43, S[12]);
    ellipse(ctx, cx, 30, 6, 6, S[3]); // opening
  } else {
    // closed brougham: lacquered box, oval rear window, lamps, coachman's hat above
    rect(ctx, cx - 3, 2, 7, 3, S[0]); rect(ctx, cx - 5, 5, 11, 1, S[0]); // coachman's top hat over the box
    rect(ctx, cx - 16, 18, 33, 30, S[2]);
    hline(ctx, cx - 16, 18, 33, S[5]); rect(ctx, cx - 17, 16, 35, 3, S[1]);
    ellipse(ctx, cx, 28, 7, 5, S[6]); ellipse(ctx, cx, 28, 6, 4, S[4]);
    px(ctx, cx - 3, 26, S[8]);
    hline(ctx, cx - 14, 40, 29, S[4]); // moulding
    for (const s of [-1, 1]) { rect(ctx, cx + s * 17 - 1, 22, 3, 5, S[1]); px(ctx, cx + s * 17, 23, S[11]); }
  }
  // wheels: big rear wheels each side
  for (const s of [-1, 1]) spokedRear(ctx, cx + s * 20, gy - 13, 13, frame * 0.5);
  rect(ctx, cx - 20, gy - 14, 40, 2, S[1]);
  return c;
}

function trolley(variant: number) {
  const [c, ctx] = canvas(84, 96);
  const cx = 42, gy = 95;
  ctx.globalAlpha = 0.45; ellipse(ctx, cx, gy - 1, 38, 3, '#000'); ctx.globalAlpha = 1;
  // trolley pole to the overhead wire
  for (let i = 0; i < 30; i++) px(ctx, cx + 2 + Math.round(i * 0.25), 16 - i * 0.5, S[1]);
  // roof (clerestory)
  rect(ctx, cx - 34, 16, 69, 6, S[3]); rect(ctx, cx - 26, 12, 53, 4, S[4]); hline(ctx, cx - 26, 12, 53, S[6]);
  for (let x = -22; x <= 22; x += 6) rect(ctx, cx + x, 13, 3, 2, S[2]);
  // body
  rect(ctx, cx - 36, 22, 73, 58, STONE[5]);
  hline(ctx, cx - 36, 22, 73, STONE[7]);
  vline(ctx, cx - 36, 22, 58, STONE[3]); vline(ctx, cx + 36, 22, 58, STONE[2]);
  // rear windows (3) with passengers
  for (let i = 0; i < 3; i++) {
    const x = cx - 30 + i * 21;
    rect(ctx, x, 27, 18, 20, S[1]); rect(ctx, x + 1, 28, 16, 9, S[3]);
    if (i !== 1) { rect(ctx, x + 6, 36, 5, 11, S[2]); rect(ctx, x + 7, 32, 3, 4, S[9]); rect(ctx, x + 6, 31, 5, 1, S[0]); }
  }
  // dash panel with route number + destination
  rect(ctx, cx - 36, 50, 73, 22, S[6]); hline(ctx, cx - 36, 50, 73, S[8]);
  textCentered(ctx, ['WOODWARD', 'JEFFERSON', 'GRAND RIVER', 'BROADWAY'][variant % 4], cx, 54, S[1]);
  textCentered(ctx, String([14, 7, 22, 3][variant % 4]), cx, 62, S[1]);
  rect(ctx, cx - 36, 72, 73, 6, S[2]);
  // fender / cowcatcher + lamp
  rect(ctx, cx - 30, 78, 61, 6, S[1]);
  for (let x = -28; x <= 28; x += 4) vline(ctx, cx + x, 78, 6, S[3]);
  rect(ctx, cx - 3, 44, 7, 5, S[1]); rect(ctx, cx - 2, 45, 5, 3, '#7a2418');
  // wheels/trucks
  rect(ctx, cx - 30, 84, 14, 10, S[0]); rect(ctx, cx + 17, 84, 14, 10, S[0]);
  return c;
}

function truck(frame: number, variant: number) {
  const [c, ctx] = canvas(64, 70);
  const cx = 32, gy = 69;
  ctx.globalAlpha = 0.45; ellipse(ctx, cx, gy - 1, 28, 2, '#000'); ctx.globalAlpha = 1;
  // box van
  rect(ctx, cx - 26, 6, 53, 46, S[4]); hline(ctx, cx - 26, 6, 53, S[7]); rect(ctx, cx - 27, 4, 55, 3, S[2]);
  vline(ctx, cx, 8, 44, S[2]); // doors
  for (const s of [-1, 1]) rect(ctx, cx + s * 4 - (s < 0 ? 2 : 0), 28, 2, 4, S[1]);
  const words = [['BAKERY', 'FRESH DAILY'], ['HARDWARE', 'DELIVERY'], ['DAIRY', 'PURE MILK'], ['EXPRESS', 'PARCELS']][variant % 4];
  textCentered(ctx, words[0], cx, 14, S[12]);
  textCentered(ctx, words[1], cx, 22, S[10]);
  hline(ctx, cx - 26, 51, 53, S[1]);
  rect(ctx, cx - 26, 52, 53, 4, S[2]);
  // solid rubber tyres, chain drive
  for (const s of [-1, 1]) { ellipse(ctx, cx + s * 21, gy - 8, 4, 8, S[0]); px(ctx, cx + s * 21, gy - 8 - (frame ? 3 : -3), S[5]); }
  rect(ctx, cx - 17, gy - 10, 34, 3, S[1]);
  rect(ctx, cx - 4, 56, 9, 4, S[1]); text(ctx, String(100 + variant * 37), cx - 5, 56, S[9]);
  return c;
}

export function buildVehicles() {
  for (let v = 0; v < 3; v++) {
    register(`carriage:${v}`, [0, 1].map((f) => ({ img: carriage(f, false, v), upp: 9 })));
    register(`wagon:${v}`, [0, 1].map((f) => ({ img: carriage(f, true, v), upp: 9 })));
    register(`truck:${v}`, [0, 1].map((f) => ({ img: truck(f, v), upp: 9 })));
    register(`trolley:${v}`, [{ img: trolley(v), upp: 10 }]);
  }
}
