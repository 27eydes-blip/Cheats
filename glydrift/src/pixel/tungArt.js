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
//   7 rear       (victory pose) up on her back legs, front hooves high
//
// Every frame takes a LOOK (tungLook()): her upgrade level (1 Foal, 2 Sparkle, 3 Blossom: a
// flower crown, 4 Starlight: starlight mane + bigger wings, 5 Celestial: a galaxy mane) and a
// skin (Cotton Candy, Moonbeam, Rose Gold, Nightmare Tung).
import { PixelCanvas } from "./px.js";

/** The base Foal. Upgrade levels and skins replace parts of it. */
const BASE = {
  body: 0xffffff,
  shade: 0xe6dcf4, // soft lavender shading
  blush: 0xffa8cc,
  eye: 0x2a1438,
  shine: 0xffffff,
  shine2: 0xa8e0ff,
  horn: 0xffd23f,
  hornD: 0xe0a020,
  hornL: 0xfff4b8,
  hoof: 0xff8ac0,
  mane: [0xffa8d8, 0xc8a8ff, 0xa8f0d0, 0xa8d8ff], // pink, lavender, mint, baby blue
  wing: 0xf4e4ff, // pearly lavender
  sheen: [0xffc8e8, 0xb8e4ff],
  flower: 0xff7ab8,
  flowerC: 0xffe060,
  ink: 0x2a1030,
};
/** Upgrade levels: what each one changes in the drawing (the rig adds the glows and orbits). */
const LEVELS = {
  3: { crown: true },
  4: { crown: true, bigWings: true, mane: [0xfffbe0, 0xd8f0ff, 0xf0e0ff, 0xfff0a8] }, // starlight
  5: { crown: true, bigWings: true, galaxy: true, mane: [0x2a1a6a, 0x4a2a9a, 0x1a2a7a, 0x6a3ab8] }, // galaxy
};
/** Her shop skins (and Drift Pass+ Nightmare Tung). */
export const TUNG_SKINS = {
  tskin_cottoncandy: {
    mane: [0xffa8d8, 0xa8d8ff, 0xffc8e8, 0xc8e8ff], // pink and blue…
    fluffy: true, // …and fluffy
    blush: 0xff9ac8,
  },
  tskin_moonbeam: {
    body: 0xdfe3ee, // silver
    shade: 0xb4bacc,
    mane: [0xe8ecff, 0xb8c4e8, 0xfff4c8, 0xa8b4d8],
    wing: 0xeef2ff,
    moon: 0xfff0a0, // a crescent moon on her side
  },
  tskin_rosegold: {
    horn: 0xf0a890, // rose-gold horn and hooves
    hornD: 0xc87a68,
    hornL: 0xffd8c8,
    hoof: 0xe0907a,
    mane: [0xffc0b0, 0xf0a8c0, 0xffe0c8, 0xe8b0a0],
  },
  tskin_nightmare: {
    body: 0x241a2e, // black
    shade: 0x140e1c,
    blush: 0x5a2a4a,
    eye: 0xff2a2a, // red eyes
    shine: 0xffb0b0,
    shine2: 0xff6a6a,
    horn: 0x5a4a6a,
    hornD: 0x3a2a4a,
    hornL: 0xb080ff,
    hoof: 0x6a2a8a,
    mane: [0xb040ff, 0x8a20e0, 0xd080ff, 0x6a10c0], // glowing purple
    wing: 0x3a2a4a,
    sheen: [0x8a3aff, 0xb040ff],
    flower: 0x8a20e0,
    flowerC: 0xff2a2a,
    ink: 0x0a0610,
    glow: 0xb040ff,
  },
};
export const TUNG_LEVEL_NAMES = ["FOAL", "SPARKLE", "BLOSSOM", "STARLIGHT", "CELESTIAL"];

/** The full look for an upgrade level (1-5) and a skin (a skin keeps its own mane colours). */
export function tungLook(level = 1, skin = null) {
  const sk = TUNG_SKINS[skin] || null;
  const lv = LEVELS[level] || {};
  const L = { ...BASE, ...lv, ...(sk || {}), level };
  if (sk && lv.galaxy && !sk.mane) L.mane = lv.mane;
  return L;
}

/** A flowing strand: from (x0,y0) back along dir, rippling with phase. */
function strand(pc, x0, y0, len, dx, dy, ph, amp, col) {
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const w = Math.round(Math.sin(t * 3.2 + ph) * amp * t);
    pc.set(Math.round(x0 + dx * i), Math.round(y0 + dy * i) + w, col);
  }
}

export function tung(f, L = tungLook()) {
  const pc = new PixelCanvas(24, 24);
  const bob = f === 1 ? -1 : f === 2 ? 1 : 0;
  const rear = f === 7; // the victory pose (the rig tilts the picture back as well)
  const prance = f === 6 || rear;
  const by = 16 + bob; // body centre
  const hx = 15; // head centre (a big chibi head)
  const hy = 9 + bob - (prance ? 1 : 0);
  // mane / tail ripple: up on the flap up, down on the flap down
  const ph = f === 1 ? 1.4 : f === 2 ? -1.2 : prance ? 2.4 : 0.4;
  const big = L.bigWings ? 2 : 0; // Starlight and up: bigger wings
  const wingUp = f === 1 || f === 3;
  const wingDown = f === 2;

  // ---- tail (behind): four pastel strands flowing back from the rump
  for (let k = 0; k < 4; k++) strand(pc, 4, by - 2 + k, 4, -0.9, 0.3, ph + k * 0.5, 1.5, L.mane[k]);

  // ---- far wing (behind the body)
  const wy = by - 3;
  if (wingUp) pc.poly([[8, wy], [6 - big, wy - 6 - big], [10, wy - 3]], L.sheen[1]);
  else if (wingDown) pc.poly([[8, wy], [5 - big, wy + 3 + big], [9, wy + 2]], L.sheen[1]);
  else pc.poly([[8, wy], [4 - big, wy - 3 - big], [9, wy - 1]], L.sheen[1]);

  // ---- legs (behind the body), little pink hooves
  const legs = prance
    ? [
        [6, 0],
        [8, 0],
        [12, rear ? -4 : -2],
        [14, rear ? -5 : -3],
      ]
    : [
        [6, 0],
        [8, 0],
        [12, 0],
        [14, 0],
      ];
  for (const [lx, up] of legs) {
    pc.vline(lx, by + 2, by + 3 + up, L.body);
    pc.set(lx, by + 4 + up, L.hoof);
  }

  // ---- the chubby body
  pc.ellipse(10, by, 5.8, 3.9, L.body);
  pc.hline(6, 13, by + 3, L.shade); // soft belly shading
  if (L.moon) {
    // Moonbeam: a crescent moon on her side
    pc.set(9, by - 1, L.moon).set(8, by, L.moon).set(8, by + 1, L.moon).set(9, by + 2, L.moon).set(10, by + 2, L.moon);
  }

  // ---- the big round head
  pc.circle(hx, hy, 5.1, L.body);
  pc.ellipse(hx + 4.6, hy + 2.6, 2.5, 2, L.body); // muzzle
  pc.set(hx + 6, hy + 2, L.blush); // nostril
  // ear (pink inside) + the flower tucked behind it
  pc.poly([[hx - 3, hy - 3], [hx - 3, hy - 8], [hx, hy - 4]], L.body);
  pc.set(hx - 2, hy - 5, L.blush).set(hx - 2, hy - 6, L.blush);
  pc.set(hx - 5, hy - 5, L.flower).set(hx - 6, hy - 4, L.flower).set(hx - 4, hy - 4, L.flower).set(hx - 5, hy - 3, L.flower);
  pc.set(hx - 5, hy - 4, L.flowerC);

  // ---- the golden spiral horn (shines brighter when she's delighted)
  for (let i = 0; i < 5; i++) {
    const x = hx + 1 + Math.round(i * 0.7);
    const y = hy - 5 - i;
    pc.set(x, y, i % 2 ? L.hornD : L.horn).set(x + 1, y, i % 2 ? L.horn : L.hornL);
  }
  pc.set(hx + 4, hy - 10, f === 4 ? 0xffffff : L.hornL);

  // ---- mane: pastel strands from the crown down the back of the head and neck
  for (let k = 0; k < 4; k++)
    strand(pc, hx - 2 - k, hy - 4 + k, 5, -0.6, 0.9, ph + k * 0.6, 1.2, L.mane[k]);
  if (L.fluffy) {
    // Cotton Candy: little fluffy puffs along the mane and tail
    pc.set(hx - 6, hy - 1, L.mane[0]).set(hx - 7, hy, L.mane[1]).set(hx - 7, hy + 2, L.mane[0]);
    pc.set(2, by - 2, L.mane[1]).set(1, by, L.mane[0]).set(2, by + 2, L.mane[1]);
  }
  if (L.galaxy) {
    // Celestial: tiny stars twinkling in the galaxy mane and tail
    pc.set(hx - 3, hy - 3, 0xffffff).set(hx - 5, hy, 0xfff0a0).set(hx - 6, hy + 3, 0xffffff);
    pc.set(2, by - 1, 0xffffff).set(3, by + 1, 0xfff0a0);
  }
  if (L.crown) {
    // Blossom and up: a flower crown around her ear
    const fl = [L.flower, 0xffd0f0, 0xb8a8ff];
    [
      [hx - 2, hy - 4],
      [hx, hy - 5],
      [hx - 4, hy - 2],
    ].forEach(([x, y], i) => pc.set(x, y, fl[i % 3]).set(x + 1, y, fl[(i + 1) % 3]));
    pc.set(hx - 1, hy - 5, 0x6ad86a).set(hx - 3, hy - 3, 0x6ad86a); // leaves
  }

  // ---- face: a huge sparkly eye with long lashes, a rosy cheek
  const ex = hx + 1; // eye's left column
  const ey = hy - 1; // eye's top row
  if (f === 4) {
    // a happy closed eye "^" and a smile
    pc.set(ex, ey + 2, L.eye).set(ex + 1, ey + 1, L.eye).set(ex + 2, ey + 2, L.eye);
    pc.set(hx + 4, hy + 4, L.eye).set(hx + 5, hy + 5, L.eye).set(hx + 6, hy + 4, L.eye);
  } else if (f === 5 || f === 3) {
    // a slow blink / the wink: a closed curve with long lashes
    pc.hline(ex, ex + 2, ey + 2, L.eye).set(ex + 3, ey + 1, L.eye).set(ex + 3, ey, L.eye);
    if (f === 3) {
      // a star twinkling beside the wink
      const sx = ex + 5;
      const sy = ey - 3;
      pc.set(sx, sy, L.hornL).set(sx, sy - 1, L.horn).set(sx, sy + 1, L.horn).set(sx - 1, sy, L.horn).set(sx + 1, sy, L.horn);
    }
  } else {
    pc.rect(ex, ey, 3, 4, L.eye);
    pc.set(ex + 1, ey + 1, L.shine); // a star shine (inside the eye, so it reads on her white face)
    pc.set(ex + 2, ey + 2, L.shine2); // and a little blue one
    pc.set(ex + 3, ey, L.eye).set(ex + 3, ey - 1, L.eye).set(ex + 2, ey - 1, L.eye); // long lashes
  }
  pc.set(ex - 1, ey + 4, L.blush).set(ex, ey + 4, L.blush); // blush

  // ---- near wing (over the body): tiny, pearly, with a pastel sheen
  const nw = by - 2;
  if (wingUp) pc.poly([[9, nw], [7 - big, nw - 7 - big], [12, nw - 4]], L.wing);
  else if (wingDown) pc.poly([[9, nw], [6 - big, nw + 4 + big], [11, nw + 2]], L.wing);
  else pc.poly([[9, nw], [4 - big, nw - 3 - big], [11, nw - 1]], L.wing);
  const sy = wingUp ? -3 : wingDown ? 1 : -1;
  pc.set(8, nw + sy, L.sheen[0]).set(7, nw + sy * 1.6, L.sheen[1]).set(9, nw + sy - 1, L.sheen[0]);

  return pc.outline(L.ink, 1, true);
}
