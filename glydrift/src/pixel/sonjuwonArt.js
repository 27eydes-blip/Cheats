// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// 손주원 — a fierce white tiger riding a high-tech hover surfboard. Original art.
// 30x24 (a little wider than the 24x24 heroes so the board reads). Frames:
//   0 glide   1 glide (board tilted a touch, lightning moved)   2 flap (crouch, nose up)
//   3 roar (mouth open; idle showcase / new best)
// plus "board" — the surfboard alone (it spins away on death).
import { PixelCanvas } from "./px.js";

const FUR = 0xf4f6ff;
const FUR_SH = 0xc8d0ea;
const STRIPE = 0x16161f;
const EYE = 0x9af4ff;
const ZAP = 0x6ad8ff;
const ZAP_HI = 0xd8fbff;
const BOARD = 0xb8e4ff;
const BOARD_SH = 0x7ab4e8;
const CIRCUIT = 0x2ef0ff;
const LED = 0xf0ffff;
const OUT = 0x08142a;

/** The board: a long glossy hull whose height follows `tilt` (nose up when positive). */
function board(pc, tilt, thrust) {
  const y0 = 19;
  const yAt = (x) => y0 - (tilt * (x - 14)) / 13;
  for (let x = 2; x <= 27; x++) {
    const y = Math.round(yAt(x));
    const end = x < 4 || x > 25;
    pc.set(x, y, LED); // bright LED top edge
    if (!end || x === 26 || x === 3) pc.set(x, y + 1, (x + 1) % 4 ? BOARD : CIRCUIT);
    if (!end) pc.set(x, y + 2, BOARD_SH);
  }
  // pointed nose curling up, LED tips
  const ny = Math.round(yAt(27));
  pc.set(28, ny - 1, LED).set(27, ny - 1, BOARD);
  pc.set(1, Math.round(yAt(2)), CIRCUIT);
  // glowing circuit line with nodes along the middle
  for (let x = 5; x <= 24; x++) {
    const y = Math.round(yAt(x)) + 1;
    if (x % 5 === 0) pc.set(x, y, LED);
    else if (x % 2) pc.set(x, y, CIRCUIT);
  }
  // hover thrusters underneath, with their glow (bigger on the flap)
  for (const tx of [8, 20]) {
    const ty = Math.round(yAt(tx)) + 3;
    pc.set(tx, ty, 0x4a6a8a).set(tx + 1, ty, 0x4a6a8a);
    pc.set(tx, ty + 1, CIRCUIT).set(tx + 1, ty + 1, ZAP_HI);
    for (let k = 2; k < 2 + thrust; k++) pc.set(tx + (k % 2), ty + k, k === 2 ? CIRCUIT : ZAP);
  }
  return yAt;
}

export function sonjuwon(f) {
  const pc = new PixelCanvas(30, 24);
  const tilt = [0, 1, 4, 0][f];
  const crouch = f === 2 ? 2 : 0;
  const yAt = board(pc, tilt, f === 2 ? 4 : 2);
  const feet = (x) => Math.round(yAt(x)) - 1;
  // tail: curled up behind, striped tip
  pc.line(7, 12 + crouch, 4, 8 + crouch, FUR).line(6, 12 + crouch, 3, 8 + crouch, FUR);
  pc.line(4, 8 + crouch, 5, 5 + crouch, FUR).line(3, 8 + crouch, 4, 5 + crouch, FUR);
  pc.set(3, 7 + crouch, STRIPE)
    .set(4, 7 + crouch, STRIPE)
    .set(5, 5 + crouch, STRIPE);
  // low surfing stance: body and legs as one solid mass down to the board,
  // with dark gaps marking the four legs
  pc.ellipse(13.5, 11.5 + crouch, 7.4, 4, FUR);
  for (let x = 8; x <= 20; x++) {
    const fy = feet(x);
    for (let y = 13 + crouch; y <= fy; y++) pc.set(x, y, y > 14 + crouch ? FUR_SH : FUR);
  }
  for (const gx of [11, 16]) for (let y = 16 + crouch; y <= feet(gx); y++) pc.set(gx, y, OUT);
  pc.vline(13, 17 + crouch, feet(13), FUR_SH);
  // head (big, fierce)
  const hy = 6 + crouch;
  pc.circle(22, hy + 2, 4.2, FUR);
  pc.ellipse(25, hy + 3.5, 2.6, 1.8, 0xffffff); // white muzzle
  pc.poly(
    [
      [18, hy - 1],
      [19, hy - 4],
      [21, hy - 1],
    ],
    FUR,
  ); // ears
  pc.poly(
    [
      [22, hy - 1],
      [24, hy - 4],
      [25, hy],
    ],
    FUR,
  );
  pc.set(19, hy - 2, STRIPE).set(24, hy - 2, STRIPE);
  // bold tiger stripes: body bands, forehead and cheek marks
  for (const x of [9, 12, 15]) {
    pc.vline(x, 8 + crouch, 11 + crouch, STRIPE).set(x + 1, 12 + crouch, STRIPE);
  }
  pc.vline(18, 9 + crouch, 11 + crouch, STRIPE);
  pc.set(21, hy, STRIPE).set(21, hy - 1, STRIPE); // forehead
  pc.set(19, hy + 3, STRIPE); // cheek
  // glowing icy-blue eye with a glint under a fierce brow
  pc.rect(23, hy + 1, 2, 2, EYE).set(23, hy + 1, 0xffffff);
  pc.set(22, hy + 1, OUT).set(22, hy + 2, OUT); // dark eye line
  pc.hline(23, 25, hy, STRIPE);
  // nose + mouth (frame 3: a big roar with fangs)
  pc.set(27, hy + 2, 0x3a2a3a).set(26, hy + 2, 0x3a2a3a);
  if (f === 3) {
    pc.rect(23, hy + 4, 4, 3, 0x8a1a2a);
    pc.set(23, hy + 4, 0xffffff)
      .set(26, hy + 4, 0xffffff)
      .set(24, hy + 6, 0xffffff);
  } else pc.hline(24, 27, hy + 4, STRIPE);
  // electric lightning crackling over the fur (moves every frame)
  const zaps = [
    [
      [10, 9],
      [11, 10],
      [13, 9],
      [14, 10],
      [20, 5],
    ],
    [
      [15, 10],
      [16, 11],
      [17, 10],
      [8, 12],
      [23, 6],
    ],
    [
      [12, 12],
      [13, 13],
      [14, 12],
      [18, 11],
      [20, 7],
    ],
    [
      [10, 11],
      [11, 10],
      [17, 11],
      [18, 10],
      [21, 4],
    ],
  ][f];
  zaps.forEach(([x, y], i) => pc.set(x, y + crouch, i % 2 ? ZAP_HI : ZAP));
  return pc.outline(OUT, 1, true);
}
sonjuwon.frames = 4;

/** The surfboard alone (it flips away spinning when the tiger crashes). */
export function sonjuwonBoard() {
  const pc = new PixelCanvas(30, 10);
  const tmp = new PixelCanvas(30, 24);
  board(tmp, 0, 2);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 30; x++) pc.set(x, y, tmp.get(x, y + 16));
  return pc.outline(OUT, 1, true);
}
