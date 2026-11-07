// JAMAL (legendary): a lovably ugly little white dog, drawn in the game's 24x24 hero style,
// facing right. Small, chunky and shaggy (white / cream, messy wild fur), crazy tufts sticking
// straight up off his head like antennas, long scraggly bangs over one eye, one big round shiny
// eye showing, a squished brown-pink nose, a pink tongue always out of the side of his mouth,
// floppy shaggy ears, short stubby legs and a big curly fluffy tail. He wears a white dog
// diaper printed with little blue bones and a woven collar. Bold dark outline; the rig adds
// the white outer rim. Frames:
//   0 glide A    tongue streaming, eye wide, tail one way (the propeller)
//   1 flap       the whole body scrunched, ears flopped up, tufts bounced
//   2 near-miss  the eye huge, every tuft standing straight up
//   3 head tilt  (idle) head cocked, ears uneven
//   4 sneeze     (idle) eyes squeezed shut, nose wrinkled, body jolted
//   5 scratch    (idle) sitting, a hind leg up at the ear
//   6 stare      (idle / portrait) facing out a little, the big eye on the player
//   7 knocked out (death) flopped over, X eyes, tongue out
//   8 glide B    tongue flapped the other way, tail the other way
import { PixelCanvas } from "./px.js";

const FUR = 0xf6f1e6; // white fur
const FUR_L = 0xffffff;
const CREAM = 0xe2d6bf; // cream shade
const SHADE = 0xbfae92; // deep fur shadow
const NOSE = 0xa0605a; // squished brown-pink nose
const NOSE_D = 0x6e3a36;
const TONGUE = 0xff7fa0;
const TONGUE_D = 0xd8507a;
const EYE = 0x120c0a;
const DIAPER = 0xfbfdff;
const DIAPER_S = 0xcbd6e8;
const BONE = 0x3f86ec; // little blue bones
const COLLAR = 0xc9923e; // woven collar
const COLLAR_D = 0x86581e;
const INK = 0x2a1a12;

/** Shaggy edge: a few stray fur pixels around a blob so he never looks neat. */
function shag(pc, pts, c = FUR) {
  for (const [x, y] of pts) pc.set(x, y, c);
}

/** The big curly tail at (x, y). k: 0 / 1 = the two propeller blades, 2 = tucked (sitting). */
function tail(pc, x, y, k) {
  if (k === 0) {
    pc.circle(x, y - 2, 2.2, FUR).circle(x - 2, y - 3, 1.6, CREAM);
    pc.set(x - 3, y - 5, FUR).set(x - 1, y - 5, FUR).set(x - 4, y - 3, FUR); // fluff
    pc.set(x - 2, y - 3, SHADE); // the curl
  } else if (k === 1) {
    pc.circle(x - 1, y + 1, 2.2, FUR).circle(x - 3, y + 2, 1.6, CREAM);
    pc.set(x - 4, y + 4, FUR).set(x - 2, y + 4, FUR).set(x - 5, y + 1, FUR);
    pc.set(x - 3, y + 2, SHADE);
  } else {
    pc.circle(x, y, 2, FUR).set(x - 2, y - 1, CREAM).set(x - 1, y, SHADE);
  }
}

/** The diaper on his rear: white, a soft shade, little blue bones, a tab at the top. */
function diaper(pc, cx, cy, squish = 0) {
  pc.ellipse(cx, cy, 3.6, 2.6 - squish * 0.5, DIAPER);
  pc.hline(cx - 3, cx + 3, cy + 2 - squish, DIAPER_S);
  pc.set(cx + 3, cy - 1, DIAPER_S);
  // two tiny bones (a dash with knobs)
  for (const [bx, by] of [
    [cx - 2, cy - 1],
    [cx + 1, cy + 1 - squish],
  ]) {
    pc.set(bx, by, BONE).set(bx + 1, by, BONE);
  }
  pc.set(cx + 3, cy - 2, BONE); // the tab
}

/** The head (shaggy circle), centred on (hx, hy). */
function head(pc, hx, hy) {
  pc.circle(hx, hy, 4.4, FUR);
  pc.ellipse(hx + 3.4, hy + 1.8, 2.6, 2, FUR); // muzzle
  shag(pc, [
    [hx - 5, hy],
    [hx - 4, hy + 3],
    [hx + 1, hy + 5],
    [hx - 2, hy + 5],
    [hx + 4, hy - 3],
  ]);
  pc.set(hx - 3, hy + 3, CREAM).set(hx - 1, hy + 4, CREAM).set(hx - 4, hy + 1, CREAM);
}

/** Antenna tufts on top of the head: two wild strands with fluffy tips (they read best
 * spaced apart: the outline runs between them). lift: 0 normal, 1 bounced, 2 straight up. */
function tufts(pc, hx, hy, lift = 0) {
  const top = hy - 4;
  const h = [4, 5, 6][lift];
  for (const [x, lean] of [
    [hx - 2, -1],
    [hx + 2, 1],
  ]) {
    const tip = lift === 2 ? 0 : lift === 1 ? lean * 2 : lean;
    pc.line(x, top, x + tip, top - h + 1, FUR);
    pc.rect(x + tip - (tip < 0 ? 1 : 0), top - h, 2, 2, FUR_L); // the fluffy tip
  }
  pc.set(hx, top - 1, FUR).set(hx - 1, top, CREAM).set(hx + 1, top, CREAM); // a stray wisp
}

/** Long scraggly bangs over the far eye, hanging from the forehead. */
function bangs(pc, hx, hy, swing = 0) {
  const cols = [SHADE, CREAM, SHADE, CREAM];
  for (let i = 0; i < 4; i++) {
    const x = hx - 3 + i;
    pc.line(x, hy - 3, x + swing - (i < 2 ? 1 : 0), hy + 1 + (i % 2), cols[i]);
  }
}

/** The one big shiny eye (r: 1 normal, 2 huge). */
function bigEye(pc, x, y, r = 1) {
  if (r >= 2) {
    // huge: 4x4 with a big shine
    pc.rect(x - 1, y - 1, 4, 4, EYE).rect(x - 1, y - 1, 2, 2, FUR_L).set(x + 2, y + 2, 0x4a3a34);
  } else {
    pc.rect(x - 1, y - 1, 3, 3, EYE).set(x - 1, y - 1, FUR_L).set(x + 1, y + 1, 0x4a3a34);
  }
}

/** Nose and the tongue out of the side of his mouth. t: tongue swing -1 / 0 / 1, long. */
function face(pc, hx, hy, t = 0, long = false) {
  const nx = hx + 6;
  const ny = hy + 1;
  pc.rect(nx, ny, 2, 2, NOSE).set(nx + 1, ny + 1, NOSE_D).set(nx, ny, 0xd89088); // squished nose
  pc.set(nx - 1, ny + 3, INK).set(nx, ny + 3, INK); // mouth line
  const tx = nx - 1 + t;
  const ty = ny + 4;
  pc.rect(nx - 1, ny + 3, 2, 1, TONGUE);
  pc.vline(tx, ty, ty + (long ? 3 : 1), TONGUE).set(tx + 1, ty, TONGUE_D);
  if (long) pc.set(tx - 1, ty + 3, TONGUE).set(tx, ty + 3, TONGUE_D);
}

/** Floppy shaggy ear hanging at the back of the head. up: flopped up (flap). */
function ear(pc, hx, hy, up = false) {
  if (up) {
    pc.poly(
      [
        [hx - 3, hy - 2],
        [hx - 7, hy - 6],
        [hx - 6, hy - 3],
        [hx - 2, hy],
      ],
      SHADE,
    );
    pc.set(hx - 7, hy - 7, CREAM);
  } else {
    pc.poly(
      [
        [hx - 2, hy - 2],
        [hx - 6, hy + 1],
        [hx - 5, hy + 5],
        [hx - 2, hy + 2],
      ],
      SHADE,
    );
    pc.set(hx - 6, hy + 5, CREAM).set(hx - 4, hy + 6, CREAM).set(hx - 3, hy + 1, CREAM); // shaggy tips
  }
}

/** The woven collar under the head. */
function collar(pc, hx, hy) {
  for (let x = hx - 3; x <= hx + 3; x++) pc.set(x, hy + 4, x % 2 ? COLLAR : COLLAR_D);
  pc.set(hx + 1, hy + 5, COLLAR); // a little tag
}

/** Stubby legs. pose: 0 hanging, 1 tucked (flap), 2 sitting. */
function legs(pc, bx, by, pose = 0) {
  const L = (x, y, len) => pc.rect(x, y, 2, len, FUR).set(x, y + len - 1, CREAM);
  if (pose === 1) {
    L(bx - 3, by + 2, 2);
    L(bx + 3, by + 2, 2);
  } else if (pose === 2) {
    L(bx + 3, by + 2, 3);
    L(bx + 5, by + 2, 3);
  } else {
    L(bx - 3, by + 3, 3);
    L(bx - 1, by + 3, 2);
    L(bx + 3, by + 3, 3);
    L(bx + 5, by + 3, 2);
  }
}

/** Body: a chunky shaggy blob. squash: 0 normal, 1 scrunched. */
function body(pc, bx, by, squash = 0) {
  pc.ellipse(bx, by, 5.6 - squash * 0.6, 3.8 - squash * 0.6, FUR);
  shag(pc, [
    [bx - 2, by - 4],
    [bx + 1, by - 4 + squash],
    [bx + 4, by - 3],
    [bx - 5, by - 2],
    [bx + 2, by + 4],
  ]);
  pc.hline(bx - 3, bx + 3, by + 3 - squash, CREAM);
  pc.set(bx + 4, by + 2, SHADE).set(bx - 4, by + 2, SHADE);
}

/** X eyes (knocked out). */
function xEye(pc, x, y) {
  pc.set(x, y, EYE).set(x + 2, y, EYE).set(x + 1, y + 1, EYE).set(x, y + 2, EYE).set(x + 2, y + 2, EYE);
}

export function jamal(f) {
  const pc = new PixelCanvas(24, 24);

  if (f === 7) {
    // knocked out: flopped over on his back, legs up, tongue lolling, X eyes
    tail(pc, 4, 15, 2);
    pc.ellipse(10, 15, 5.6, 3.4, FUR); // body on its side
    diaper(pc, 6, 15);
    for (const x of [8, 10, 12, 14]) pc.rect(x, 10 + (x % 4 ? 1 : 0), 2, 2, FUR).set(x, 10, CREAM); // legs up
    collar(pc, 15, 10);
    pc.circle(17, 15, 4.2, FUR); // head lying down
    pc.ellipse(19.5, 16.5, 2.3, 1.8, FUR);
    pc.poly(
      [
        [15, 12],
        [12, 10],
        [13, 13],
      ],
      CREAM,
    ); // ear flopped back
    // tufts flopped sideways, bangs splayed
    pc.line(14, 13, 11, 12, FUR).line(14, 15, 11, 16, FUR).set(10, 12, FUR_L).set(10, 16, FUR_L);
    xEye(pc, 16, 13);
    pc.rect(21, 15, 2, 2, NOSE).set(22, 16, NOSE_D);
    pc.vline(20, 18, 21, TONGUE).set(21, 19, TONGUE_D).set(19, 21, TONGUE).set(20, 21, TONGUE_D);
    return pc.outline(INK, 1, true);
  }

  // ---- pose numbers
  const scrunch = f === 1 ? 1 : 0;
  const sit = f === 5;
  const bx = 9;
  const by = sit ? 16 : 15 + scrunch;
  let hx = 15;
  let hy = sit ? 9 : 9 + scrunch;
  if (f === 3) hx -= 0; // the tilt is drawn as cocked features below
  if (f === 4) hy += 1; // sneeze jolt (head dips)

  // ---- tail (behind)
  tail(pc, bx - 5, by - 1, sit ? 2 : f === 8 ? 1 : f === 1 ? 1 : 0);
  // ---- ear (behind the head)
  ear(pc, hx, hy, f === 1);
  // ---- legs and body
  legs(pc, bx, by, f === 1 ? 1 : sit ? 2 : 0);
  body(pc, bx, by, scrunch);
  diaper(pc, bx - 3, by + 1, scrunch);
  if (sit) {
    // the scratching hind leg, up at the ear
    pc.line(bx + 1, by, hx - 3, hy + 2, FUR);
    pc.line(bx + 2, by, hx - 2, hy + 3, FUR);
    pc.rect(hx - 4, hy + 1, 2, 2, CREAM);
  }
  // ---- head
  head(pc, hx, hy);
  collar(pc, hx, hy);
  tufts(pc, hx, hy, f === 2 ? 2 : f === 1 ? 1 : 0);

  // ---- face per pose
  if (f === 4) {
    // sneeze: both eyes squeezed shut, nose wrinkled up, tongue in
    pc.hline(hx, hx + 1, hy - 1, INK).set(hx + 2, hy - 2, INK);
    pc.rect(hx + 5, hy, 2, 2, NOSE).set(hx + 4, hy - 1, CREAM).set(hx + 5, hy - 1, CREAM);
    pc.set(hx + 4, hy + 3, INK).set(hx + 5, hy + 3, INK);
    bangs(pc, hx - 1, hy, 1);
  } else if (f === 6) {
    // the stare: turned toward the player, the big eye right on you
    pc.rect(hx - 1, hy, 2, 2, EYE);
    bangs(pc, hx - 1, hy, -1);
    bigEye(pc, hx + 3, hy, 2);
    face(pc, hx, hy, 0, false);
  } else {
    const huge = f === 2 || f === 0 || f === 8;
    pc.rect(hx - 1, hy, 2, 2, EYE); // the far eye, mostly behind the bangs
    bangs(pc, hx - 1, hy, f === 3 ? 1 : 0);
    if (f === 3) bigEye(pc, hx + 3, hy - 1, 1); // the tilt: eye up and cocked
    else bigEye(pc, hx + 3, hy, huge ? 2 : 1);
    const t = f === 8 ? 1 : f === 0 ? -1 : 0;
    face(pc, hx, hy, t, f === 0 || f === 8 || f === 1);
  }
  return pc.outline(INK, 1, true);
}
