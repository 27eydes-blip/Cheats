// THE NEWBLEIZER (legendary): an original pixel samurai hooper, drawn in the game's 24x24 hero
// style, facing right. Athletic, brown skin, a high-top fade, a red headband with its tails
// flying back, a calm confident look. Sleek dark samurai armor over streetwear: a purple
// basketball jersey (gold trim, a gold "8") under armored shoulder plates, a red sash at the
// waist, basketball shorts and high-top sneakers. The katana rides on his back (the hilt over
// his far shoulder) and a glowing orange basketball is tucked at his hip. The rig adds the
// white outer rim.
// Frames:
//   0 glide: katana drawn and held low at his side, pointing back; sash flowing behind
//   1 jump (flap): knees tucked like a jump shot, blade swung up overhead
//   2 spin (flap): the blade whipped round behind him, mid katana spin
//   3 guard (near-miss): blade up in front of him, ready for the glint
//   4 confident (showcase / portrait): ball on his near hand at the hip, katana on his back
//   5 dunk (new best): rising high, the ball held up in both hands
//   6 sheathe (new best, after the dunk): sliding the katana home over his shoulder, eyes shut
//   7 dazed (death): ball gone, swirly eyes, arms loose
import { PixelCanvas } from "./px.js";

export const NB = {
  SK: 0x8a5634, // skin
  SKD: 0x5e3720,
  SKL: 0xa86e46,
  HAIR: 0x120c0a,
  FADE: 0x3a2618, // the faded sides
  BAND: 0xd8202a, // headband + sash red
  BANDD: 0x8e1018,
  BANDL: 0xff5a52,
  ARM: 0x22222c, // armor
  ARMD: 0x121218,
  ARML: 0x44445a,
  GOLD: 0xffc83a,
  JER: 0x5a3cc8, // jersey purple
  JERD: 0x3a2490,
  SHO: 0x1a1a24, // shorts
  SHOE: 0xf4f4f8,
  SHOED: 0xb8b8c8,
  BLADE: 0xe8f0ff,
  BLADED: 0x9aa8c0,
  HILT: 0x2a1a20,
  BALL: 0xff8a1a,
  BALLD: 0xc8560a,
  BALLL: 0xffc070,
  INK: 0x0c0608,
};
const C = NB;

/** A 2 px limb from (x0, y0) to (x1, y1). */
function limb(pc, x0, y0, x1, y1, c) {
  pc.line(x0, y0, x1, y1, c);
  pc.line(x0 + 1, y0, x1 + 1, y1, c);
}

/** The basketball (r ≈ 2.4) with its seams. */
export function ball(pc, x, y) {
  pc.circle(x, y, 2.4, C.BALL);
  pc.set(Math.round(x) - 1, Math.round(y) - 1, C.BALLL);
  pc.hline(Math.round(x) - 2, Math.round(x) + 2, Math.round(y), C.BALLD);
  pc.vline(Math.round(x), Math.round(y) - 2, Math.round(y) + 2, C.BALLD);
}

/** The katana blade from the hand (x0, y0) along (dx, dy), with a gold guard at the hand. */
function blade(pc, x0, y0, dx, dy, len) {
  const x1 = x0 + dx * len;
  const y1 = y0 + dy * len;
  pc.line(x0, y0, Math.round(x1), Math.round(y1), C.BLADE);
  // the back edge, one pixel off, darker
  const ox = Math.abs(dy) > Math.abs(dx) ? 1 : 0;
  const oy = ox ? 0 : 1;
  pc.line(x0 + Math.round(dx) + ox, y0 + Math.round(dy) + oy, Math.round(x1) + ox, Math.round(y1) + oy, C.BLADED);
  pc.set(Math.round(x1), Math.round(y1), 0xffffff); // the tip
  pc.set(x0 - Math.sign(Math.round(dy)) * 1, y0 + Math.sign(Math.round(dx)) * 1, C.GOLD); // tsuba
  pc.set(x0 + Math.sign(Math.round(dy)) * 1, y0 - Math.sign(Math.round(dx)) * 1, C.GOLD);
}

export function newbleizer(f) {
  const pc = new PixelCanvas(24, 24);
  const tuck = f === 1 || f === 5; // the jump-shot knee tuck
  const dazed = f === 7;
  const onBack = f === 4 || f === 5 || f === 7; // the katana is sheathed on his back
  // head lean: the dunk reaches up, dazed sags
  const hy = f === 5 ? -1 : dazed ? 1 : 0;

  // ---- the scabbard on his back (behind everything): from the far shoulder down to the hip
  pc.line(6, 15, 12, 6, C.ARMD);
  pc.line(7, 15, 13, 6, C.ARM);
  pc.set(7, 14, C.GOLD); // the scabbard's end cap
  if (onBack || f === 6) {
    // the hilt sticks up over the shoulder, wrapped, with a gold guard
    pc.set(13, 5, C.GOLD).set(14, 5, C.GOLD);
    pc.line(14, 4, 16, 1, C.HILT);
    pc.set(15, 3, C.ARML).set(16, 1, C.GOLD);
  }

  // ---- sash tails flowing back from the knot at his hip (longer on the glide)
  const wave = f === 0 ? 1 : 0;
  const tail = f === 0 || f === 3 ? 6 : f === 1 || f === 2 || f === 5 ? 4 : 3;
  for (let i = 0; i < tail; i++) {
    const y = 15 + Math.round(Math.sin(i * 0.9 + wave) * 0.8) + (dazed ? Math.floor(i / 2) : 0);
    pc.set(7 - i, y, i % 3 === 2 ? C.BANDD : C.BAND);
    if (i < tail - 2) pc.set(7 - i, y + 1, C.BANDD);
  }

  // ---- legs: basketball shorts and high-top sneakers
  if (tuck) {
    // knees up, feet back (a jump shot)
    pc.rect(9, 16, 7, 3, C.SHO);
    pc.rect(14, 17, 3, 2, C.SK); // the near knee, forward
    pc.rect(12, 19, 2, 2, C.SK); // the shin back down
    pc.rect(10, 20, 4, 2, C.SHOE).set(10, 21, C.SHOED).set(13, 20, C.BAND); // near shoe
    pc.rect(8, 18, 2, 2, C.SKD);
    pc.rect(6, 19, 3, 2, C.SHOED).set(6, 20, C.SHOE); // far shoe, tucked behind
  } else {
    const spread = dazed ? 1 : 0;
    pc.rect(9, 16, 7, 3, C.SHO);
    pc.rect(9, 19, 2, 2, C.SKD); // far leg
    pc.rect(13 + spread, 19, 2, 2, C.SK); // near leg
    pc.rect(8, 20, 4, 2, C.SHOED).set(8, 20, C.SHOE); // far shoe
    pc.rect(13 + spread, 20, 4, 2, C.SHOE).set(13 + spread, 21, C.SHOED).set(16 + spread, 20, C.BAND); // near shoe
  }
  pc.vline(15, 16, 18, C.JER); // the shorts' side stripe
  pc.set(12, 18, null);

  // ---- far arm (behind the body)
  const farHand = {
    0: [8, 15],
    1: [10, 6],
    2: [9, 11],
    3: [16, 11],
    4: [8, 13],
    5: [14, 2],
    6: [9, 13],
    7: [7, 15],
  }[f];
  limb(pc, 10, 9, farHand[0], farHand[1], C.SKD);

  // ---- torso: the purple jersey (gold trim, a gold 8) under dark armor
  pc.poly(
    [
      [9, 9],
      [15, 9],
      [15, 16],
      [9, 16],
    ],
    C.JER,
  );
  pc.vline(9, 10, 15, C.JERD);
  // a small gold "8" on the chest
  pc.set(12, 11, C.GOLD).set(13, 11, C.GOLD).set(12, 13, C.GOLD).set(13, 13, C.GOLD);
  pc.set(11, 12, C.GOLD).set(14, 12, C.GOLD).set(12, 12, C.JERD);
  // the jersey's V collar
  pc.set(12, 9, C.GOLD).set(13, 10, C.GOLD).set(14, 9, C.GOLD);
  // armored shoulder plates (sode): layered dark plates, gold rivets
  pc.rect(7, 9, 3, 3, C.ARM).hline(7, 9, 9, C.ARML).hline(7, 9, 11, C.ARMD); // far plate
  pc.rect(14, 9, 4, 3, C.ARM).hline(14, 17, 9, C.ARML).hline(14, 17, 11, C.ARMD); // near plate
  pc.set(15, 10, C.GOLD).set(8, 10, C.GOLD);
  // the red sash round the waist, knotted at the back hip
  pc.hline(9, 15, 15, C.BAND).hline(9, 15, 16, C.BANDD);
  pc.set(8, 15, C.BAND).set(8, 16, C.BANDD).set(14, 15, C.BANDL);

  // ---- the ball at his hip (in the glide, the jump and the guard it rides on the sash knot)
  if (f === 0 || f === 1 || f === 2 || f === 3 || f === 6) ball(pc, 7, 14);

  // ---- neck + head
  pc.rect(11, 7 + hy, 3, 2, C.SK);
  pc.set(11, 8 + hy, C.SKD);
  const cx = 12.5;
  const cy = 4.6 + hy;
  pc.ellipse(cx, cy, 3.4, 3.3, C.SK);
  pc.set(Math.round(cx - 3), Math.round(cy + 1), C.SKD); // ear
  // the high-top fade: a tall flat-topped block on top, the sides faded down to the skin
  const top = Math.round(cy - 3);
  const ht = Math.max(0, top - 2); // (kept inside the canvas: the hats sit on the flat top)
  pc.rect(Math.round(cx - 3), ht, 6, top - ht, C.HAIR);
  pc.hline(Math.round(cx - 3), Math.round(cx + 2), ht, C.FADE); // the flat top's edge light
  pc.set(Math.round(cx + 2), ht + 1, C.FADE);
  pc.hline(Math.round(cx - 3), Math.round(cx + 2), top, C.HAIR);
  pc.set(Math.round(cx - 3), top + 1, C.FADE).set(Math.round(cx - 3), top + 2, C.FADE); // faded side
  // the red headband with its tails flying back
  pc.hline(Math.round(cx - 3), Math.round(cx + 3), top + 1, C.BAND);
  pc.set(Math.round(cx + 3), top + 1, C.BANDL);
  const flutter = f === 0 || f === 2 ? 0 : 1;
  pc.set(Math.round(cx - 4), top + 1, C.BAND).set(Math.round(cx - 5), top + flutter, C.BAND);
  pc.set(Math.round(cx - 6), top + 1 + flutter, C.BANDD);
  if (f !== 7) pc.set(Math.round(cx - 7), top + flutter, C.BANDD);
  // face
  const ex = Math.round(cx + 2);
  const ey = Math.round(cy);
  if (dazed) {
    pc.set(ex, ey, C.INK).set(ex - 1, ey - 1, C.INK).set(ex + 1, ey + 1, C.INK); // a swirly look
    pc.set(ex + 1, ey + 2, C.SKD).set(ex, ey + 2, C.INK); // an "o"
  } else {
    if (f === 6) pc.hline(ex - 1, ex, ey, C.INK); // eyes shut, cool
    else pc.set(ex, ey, C.INK); // a focused eye
    pc.hline(ex, ex + 1, ey - 1, C.HAIR); // a level, confident brow
    pc.set(ex + 2, ey + 1, C.SKD); // nose
    // a small confident smile (bigger on the dunk and the showcase)
    const my = ey + 2;
    if (f === 4 || f === 5) pc.hline(ex, ex + 1, my, 0xffffff).set(ex - 1, my - 1, C.INK);
    else pc.hline(ex, ex + 1, my, C.SKD).set(ex - 1, my - 1, C.SKD);
  }
  pc.set(Math.round(cx - 1), Math.round(cy + 2), C.SKL); // a cheek light

  // ---- near arm + hand, and the blade / ball it holds
  const sx = 16;
  const sy = 10;
  switch (f) {
    case 0: // glide: blade low at his side, pointing back
      limb(pc, sx, sy, 15, 14, C.SK);
      blade(pc, 16, 15, -1, 0.35, 9);
      pc.set(16, 15, C.HILT).set(17, 15, C.HILT);
      break;
    case 1: // jump: blade swung up overhead
      limb(pc, sx, sy, 17, 5, C.SK);
      pc.set(18, 4, C.HILT).set(18, 5, C.HILT);
      blade(pc, 18, 3, 0.35, -1, 4);
      break;
    case 2: // spin: blade whipped round behind
      limb(pc, sx, sy, 18, 12, C.SK);
      blade(pc, 18, 12, 1, -0.2, 5);
      break;
    case 3: // guard: blade up in front
      limb(pc, sx, sy, 18, 12, C.SK);
      pc.set(19, 12, C.HILT).set(19, 13, C.HILT);
      blade(pc, 19, 11, 0.12, -1, 9);
      break;
    case 4: // confident: ball on the near hand at the hip
      limb(pc, sx, sy, 17, 14, C.SK);
      ball(pc, 18.5, 15.5);
      break;
    case 5: // dunk: the ball up high in both hands
      limb(pc, sx, sy, 17, 3, C.SK);
      ball(pc, 16.5, 1.5);
      break;
    case 6: // sheathe: the near hand up at the hilt over his shoulder
      limb(pc, sx, sy, 15, 4, C.SK);
      pc.set(15, 3, C.SKL);
      break;
    case 7: // dazed: arm hanging loose
      limb(pc, sx, sy, 17, 16, C.SK);
      break;
  }

  return pc.outline(C.INK, 1, true);
}
newbleizer.frames = 8;

/** The basketball on its own (the bouncing death ball, the dunk), with the dark outline. */
export function newbleizerBall() {
  const pc = new PixelCanvas(7, 7);
  ball(pc, 3, 3);
  return pc.outline(C.INK, 1, true);
}
