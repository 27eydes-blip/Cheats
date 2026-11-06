// THE HADDAD (legendary): an original pixel boxer, drawn in the game's 24x24 hero style,
// facing right. Athletic, no shirt (cartoony), thick dark curly hair, a short trimmed beard
// along the jaw and a big confident smile; bright red gloves with white cuffs, black shorts
// with a red waistband and short black boxing shoes. The rig adds the white outer rim.
// Frames:
//   0 guard (glide): gloves up by the chin
//   1 uppercut (flap): the near glove driven straight up
//   2 slip (near-miss): ducked and leaning back, gloves tight
//   3 K.O. (new best): both gloves raised in victory, beaming
//   4 smile (showcase): gloves together in front of the chest, big grin
//   5 knocked out (death): X eyes, gloves dropped
//   6 jab (shadowboxing): the near glove thrown straight forward
import { PixelCanvas } from "./px.js";

const SK = 0xc98a5e; // skin
const SKD = 0x9a6440; // skin shade (muscle lines)
const SKL = 0xe6b088; // skin light
const HAIR = 0x17100c;
const HAIR_L = 0x3a2a20;
const BEARD = 0x2a1c14;
const GL = 0xe8202a; // glove red
const GLD = 0x9c0e16;
const GLL = 0xff7a72;
const CUFF = 0xffffff;
const SH = 0x16161c; // shorts
const SHL = 0x34343e;
const BAND = 0xe8202a; // waistband
const SHOE = 0x0c0c10;
const SHOEL = 0x3a3a44;
const INK = 0x140804;

/** A thick (2 px) arm from the shoulder to the glove. */
function arm(pc, x0, y0, x1, y1, c = SK) {
  pc.line(x0, y0, x1, y1, c);
  pc.line(x0, y0 + 1, x1, y1 + 1, c);
}

/** A boxing glove centred on (x, y), with its white cuff on the arm side (dx, dy). */
function glove(pc, x, y, far, cuff) {
  pc.ellipse(x, y, 2.3, 2.1, far ? GLD : GL);
  if (!far) {
    pc.set(x - 1, y - 1, GLL).set(x, y - 1, GLL); // shine
    pc.set(x + 1, y + 1, GLD); // underside
  }
  pc.set(x + cuff[0], y + cuff[1], CUFF).set(x + cuff[0] + cuff[2], y + cuff[1] + cuff[3], CUFF);
}

export function haddad(f) {
  const pc = new PixelCanvas(24, 24);
  // head offset (the slip ducks and leans back)
  const hx = f === 2 ? -1 : 0;
  const hy = f === 2 ? 1 : 0;

  // ---- legs and shoes (behind everything): a light boxer's bounce
  const kick = f === 1 ? 1 : 0;
  pc.rect(9, 17, 2, 4, SK).rect(13, 17, 2, 4 - kick, SK); // legs
  pc.vline(10, 18, 20, SKD).vline(14, 18, 20 - kick, SKD); // calf shade
  pc.rect(8, 20, 4, 2, SHOE).hline(8, 10, 20, SHOEL); // back shoe
  pc.rect(13, 20 - kick, 4, 2, SHOE).hline(13, 15, 20 - kick, SHOEL); // front shoe
  pc.set(11, 21, CUFF).set(16, 21 - kick, CUFF); // a white sole tip

  // ---- shorts with the red waistband
  pc.rect(8, 15, 8, 3, SH);
  pc.hline(8, 15, 15, BAND);
  pc.hline(9, 14, 16, SHL); // the satin sheen
  pc.set(12, 17, null); // the split between the legs
  pc.set(8, 17, SHL).set(15, 17, SHL); // leg hems

  // ---- far arm + glove (behind the body)
  const far = {
    0: [16, 11],
    1: [17, 11],
    2: [15, 9],
    3: [6, 3],
    4: [15, 11],
    5: [8, 15],
    6: [16, 10],
  }[f];
  arm(pc, 10, 9, far[0], far[1], SKD);
  glove(pc, far[0], far[1], true, [-2, 0, 0, 1]);

  // ---- torso: athletic, cartoony (shoulders, pecs, abs)
  pc.poly(
    [
      [8, 9],
      [15, 9],
      [14, 15],
      [9, 15],
    ],
    SK,
  );
  pc.ellipse(9, 10, 1.6, 1.4, SK); // back shoulder
  pc.ellipse(14.5, 10, 1.8, 1.5, SK); // front shoulder
  pc.hline(10, 13, 11, SKD); // pec line
  pc.set(11, 12, SKD).set(11, 13, SKD).set(12, 14, SKD); // abs
  pc.set(10, 13, SKD).set(13, 13, SKD);
  pc.set(9, 10, SKL).set(14, 9, SKL); // shoulder light

  // ---- neck
  pc.rect(11 + hx, 8 + hy, 3, 2, SK);
  pc.set(11 + hx, 9 + hy, SKD);

  // ---- head (a touch big: cartoony), facing right
  const cx = 12.5 + hx;
  const cy = 5 + hy;
  pc.ellipse(cx, cy, 3.6, 3.4, SK);
  pc.set(Math.round(cx - 3), Math.round(cy + 1), SKD); // ear
  pc.set(Math.round(cx - 3), Math.round(cy), SKD);
  // thick dark curly hair on top: a mop with curls bumping up out of it
  pc.ellipse(cx - 0.5, cy - 2.6, 4.1, 2.2, HAIR);
  for (const [x, y] of [
    [-4, -3],
    [-3, -5],
    [-1, -5],
    [1, -5],
    [3, -4],
    [-4, -1],
  ])
    pc.set(Math.round(cx + x), Math.round(cy + y), HAIR);
  for (const [x, y] of [
    [-2, -4],
    [0, -4],
    [2, -3],
  ])
    pc.set(Math.round(cx + x), Math.round(cy + y), HAIR_L); // curl highlights
  pc.set(Math.round(cx - 3), Math.round(cy - 1), HAIR).set(Math.round(cx - 3), Math.round(cy - 2), HAIR); // back of the head
  // face
  const ex = Math.round(cx + 2);
  const ey = Math.round(cy - 0.5);
  if (f === 5) {
    // knocked out: X eyes
    pc.set(ex - 1, ey - 1, INK).set(ex + 1, ey + 1, INK).set(ex + 1, ey - 1, INK).set(ex - 1, ey + 1, INK);
  } else {
    pc.set(ex, ey, INK); // eye
    pc.hline(ex - 1, ex + 1, ey - 1, HAIR); // a strong brow
    if (f === 3 || f === 4) pc.set(ex, ey - 1, HAIR).set(ex + 1, ey, HAIR); // happy, squinting
  }
  pc.set(ex + 2, ey + 1, SKD); // nose
  // short trimmed beard along the jaw, with a sideburn
  const jy = Math.round(cy + 3);
  pc.hline(Math.round(cx - 2), Math.round(cx + 3), jy, BEARD);
  pc.set(Math.round(cx - 2), jy - 1, BEARD).set(Math.round(cx - 2), jy - 2, BEARD); // sideburn
  pc.set(Math.round(cx + 3), jy - 1, BEARD).set(Math.round(cx - 1), jy + 1, BEARD).set(Math.round(cx + 1), jy + 1, BEARD);
  // the big confident smile
  const my = jy - 1;
  if (f === 5) pc.set(ex + 1, my, INK).set(ex + 1, my - 1, null).set(ex + 1, my - 1, SKD); // dazed "o"
  else {
    pc.hline(ex - 1, ex + 2, my, 0xffffff); // teeth
    pc.set(ex - 2, my - 1, INK); // the corner turned up
    if (f === 3 || f === 4) pc.set(ex + 3, my - 1, INK).hline(ex - 1, ex + 2, my + 1, INK); // beaming
  }

  // ---- near arm + glove (in front)
  const near = {
    0: [18, 8], // guard by the chin
    1: [18, 1], // uppercut: straight up
    2: [17, 7], // slip: tucked tight
    3: [18, 1], // victory: raised
    4: [17, 11], // gloves together at the chest
    5: [16, 16], // dropped
    6: [21, 9], // jab: straight forward
  }[f];
  const sx = 15;
  const sy = 10;
  if (f === 6) arm(pc, sx, sy, near[0] - 2, near[1]);
  else arm(pc, sx, sy, near[0], near[1] + (near[1] < sy ? 2 : -1));
  const cuffDir =
    f === 1 || f === 3 ? [0, 2, 1, 0] : f === 6 ? [-2, 0, 0, 1] : f === 5 ? [-1, -2, 1, 0] : [-1, 2, 1, 0];
  glove(pc, near[0], near[1], false, cuffDir);

  return pc.outline(INK, 1, true);
}
haddad.frames = 7;
