// TUNG (legendary): a super cute baby unicorn, drawn in the game's 24x24 hero style, facing
// right. A small, chubby white unicorn with pink blush, huge sparkly eyes with long lashes and
// star-shaped shines, a flowing pastel rainbow mane and tail (pink, lavender, mint, baby blue),
// a shiny golden spiral horn, tiny pearly pastel wings, little pink hooves and a flower tucked
// behind her ear. Bold dark outline; the rig adds the white outer rim. Frames:
//   0 glide      wings level, mane and tail flowing back
//   1 flap up    wings up, mane and tail bounced up
//   2 flap down  wings down, mane and tail bounced down
//   3 wink       (near-miss) one eye closed, a star by the eye
//   4 delighted  (new best / portrait) happy closed eyes, smile, the horn shining
//   5 blink      (hero screen) eyes softly closed
//   6 prance     (hero screen) front hooves up, mane flicked
import { PixelCanvas } from "./px.js";

const WHITE = 0xffffff;
const SHADE = 0xe6dcf4; // soft lavender shading
const BLUSH = 0xffa8cc;
const EYE = 0x2a1438;
const SHINE = 0xffffff;
const SHINE2 = 0xa8e0ff;
const HORN = 0xffd23f;
const HORN_D = 0xe0a020;
const HORN_L = 0xfff4b8;
const HOOF = 0xff8ac0;
const MANE = [0xffa8d8, 0xc8a8ff, 0xa8f0d0, 0xa8d8ff]; // pink, lavender, mint, baby blue
const WING = 0xf4e4ff; // pearly lavender
const WING_SHEEN = [0xffc8e8, 0xb8e4ff];
const FLOWER = 0xff7ab8;
const FLOWER_C = 0xffe060;
const INK = 0x2a1030;

/** A flowing strand: from (x0,y0) back along dir, rippling with phase. */
function strand(pc, x0, y0, len, dx, dy, ph, amp, col) {
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const w = Math.round(Math.sin(t * 3.2 + ph) * amp * t);
    pc.set(Math.round(x0 + dx * i), Math.round(y0 + dy * i) + w, col);
  }
}

export function tung(f) {
  const pc = new PixelCanvas(24, 24);
  const bob = f === 1 ? -1 : f === 2 ? 1 : 0;
  const prance = f === 6;
  const by = 16 + bob; // body centre
  const hx = 15; // head centre (a big chibi head)
  const hy = 9 + bob - (prance ? 1 : 0);
  // mane / tail ripple: up on the flap up, down on the flap down
  const ph = f === 1 ? 1.4 : f === 2 ? -1.2 : prance ? 2.4 : 0.4;
  const wingUp = f === 1 || f === 3;
  const wingDown = f === 2;

  // ---- tail (behind): four pastel strands flowing back from the rump
  for (let k = 0; k < 4; k++) strand(pc, 4, by - 2 + k, 4, -0.9, 0.3, ph + k * 0.5, 1.5, MANE[k]);

  // ---- far wing (behind the body)
  const wy = by - 3;
  if (wingUp) pc.poly([[8, wy], [6, wy - 6], [10, wy - 3]], WING_SHEEN[1]);
  else if (wingDown) pc.poly([[8, wy], [5, wy + 3], [9, wy + 2]], WING_SHEEN[1]);
  else pc.poly([[8, wy], [4, wy - 3], [9, wy - 1]], WING_SHEEN[1]);

  // ---- legs (behind the body), little pink hooves
  const legs = prance
    ? [
        [6, 0],
        [8, 0],
        [12, -2],
        [14, -3],
      ]
    : [
        [6, 0],
        [8, 0],
        [12, 0],
        [14, 0],
      ];
  for (const [lx, up] of legs) {
    pc.vline(lx, by + 2, by + 3 + up, WHITE);
    pc.set(lx, by + 4 + up, HOOF);
  }

  // ---- the chubby body
  pc.ellipse(10, by, 5.8, 3.9, WHITE);
  pc.hline(6, 13, by + 3, SHADE); // soft belly shading

  // ---- the big round head
  pc.circle(hx, hy, 5.1, WHITE);
  pc.ellipse(hx + 4.6, hy + 2.6, 2.5, 2, WHITE); // muzzle
  pc.set(hx + 6, hy + 2, BLUSH); // nostril
  // ear (pink inside) + the flower tucked behind it
  pc.poly([[hx - 3, hy - 3], [hx - 3, hy - 8], [hx, hy - 4]], WHITE);
  pc.set(hx - 2, hy - 5, BLUSH).set(hx - 2, hy - 6, BLUSH);
  pc.set(hx - 5, hy - 5, FLOWER).set(hx - 6, hy - 4, FLOWER).set(hx - 4, hy - 4, FLOWER).set(hx - 5, hy - 3, FLOWER);
  pc.set(hx - 5, hy - 4, FLOWER_C);

  // ---- the golden spiral horn (shines brighter when she's delighted)
  for (let i = 0; i < 5; i++) {
    const x = hx + 1 + Math.round(i * 0.7);
    const y = hy - 5 - i;
    pc.set(x, y, i % 2 ? HORN_D : HORN).set(x + 1, y, i % 2 ? HORN : HORN_L);
  }
  pc.set(hx + 4, hy - 10, f === 4 ? WHITE : HORN_L);

  // ---- mane: pastel strands from the crown down the back of the head and neck
  for (let k = 0; k < 4; k++)
    strand(pc, hx - 2 - k, hy - 4 + k, 5, -0.6, 0.9, ph + k * 0.6, 1.2, MANE[k]);

  // ---- face: a huge sparkly eye with long lashes, a rosy cheek
  const ex = hx + 1; // eye's left column
  const ey = hy - 1; // eye's top row
  if (f === 4) {
    // a happy closed eye "^" and a smile
    pc.set(ex, ey + 2, EYE).set(ex + 1, ey + 1, EYE).set(ex + 2, ey + 2, EYE);
    pc.set(hx + 4, hy + 4, EYE).set(hx + 5, hy + 5, EYE).set(hx + 6, hy + 4, EYE);
  } else if (f === 5 || f === 3) {
    // a slow blink / the wink: a closed curve with long lashes
    pc.hline(ex, ex + 2, ey + 2, EYE).set(ex + 3, ey + 1, EYE).set(ex + 3, ey, EYE);
    if (f === 3) {
      // a star twinkling beside the wink
      const sx = ex + 5;
      const sy = ey - 3;
      pc.set(sx, sy, HORN_L).set(sx, sy - 1, HORN).set(sx, sy + 1, HORN).set(sx - 1, sy, HORN).set(sx + 1, sy, HORN);
    }
  } else {
    pc.rect(ex, ey, 3, 4, EYE);
    pc.set(ex + 1, ey + 1, SHINE); // a star shine (inside the eye, so it reads on her white face)
    pc.set(ex + 2, ey + 2, SHINE2); // and a little blue one
    pc.set(ex + 3, ey, EYE).set(ex + 3, ey - 1, EYE).set(ex + 2, ey - 1, EYE); // long lashes
  }
  pc.set(ex - 1, ey + 4, BLUSH).set(ex, ey + 4, BLUSH); // blush

  // ---- near wing (over the body): tiny, pearly, with a pastel sheen
  const nw = by - 2;
  if (wingUp) pc.poly([[9, nw], [7, nw - 7], [12, nw - 4]], WING);
  else if (wingDown) pc.poly([[9, nw], [6, nw + 4], [11, nw + 2]], WING);
  else pc.poly([[9, nw], [4, nw - 3], [11, nw - 1]], WING);
  const sy = wingUp ? -3 : wingDown ? 1 : -1;
  pc.set(8, nw + sy, WING_SHEEN[0]).set(7, nw + sy * 1.6, WING_SHEEN[1]).set(9, nw + sy - 1, WING_SHEEN[0]);

  return pc.outline(INK, 1, true);
}
