// DAWSON (legendary): a shark, butterfly and peacock hybrid, drawn in the game's 24x24 hero
// style, facing right. A sleek baby shark (deep ocean blue, lighter belly, a big toothy grin
// and a dorsal fin) with two shimmering butterfly wings painted with peacock "eye" spots
// (iridescent teal, emerald, gold and purple), and a peacock tail that rests folded behind him
// and fans open into a rainbow display on big moments. Bold dark outline; the rig adds the
// white outer rim. Frames:
//   0 glide      wings level, tail folded
//   1 flap up    wings raised high, body wiggled
//   2 flap down  wings swept down, body wiggled the other way
//   3 tail flash (near-miss) tail half open, wings up
//   4 fanned     (new best / portrait) the full rainbow tail fanned open, big grin
//   5 shattered  (death) wings gone, tail plucked bare: just the spinning shark
import { PixelCanvas } from "./px.js";

const BLUE = 0x1f4fb0; // deep ocean blue
const BLUE_D = 0x13307a;
const BLUE_L = 0x3d78d8;
const BELLY = 0xa8dcf6;
const TEETH = 0xffffff;
const MOUTH = 0x4a0a1a;
const EYE = 0x0a0c18;
const TEAL = 0x18c8b8;
const TEAL_D = 0x0e8a88;
const EMER = 0x18a050;
const GOLD = 0xffd23f;
const PURP = 0x8a3cd8;
const INK = 0x0a0a22;

/** A peacock "eye": purple centre, gold ring (in an emerald / teal field). */
function eyeSpot(pc, x, y, big = false) {
  if (big) {
    pc.circle(x, y, 1.4, GOLD).set(x, y, PURP).set(x + 1, y, PURP).set(x, y + 1, PURP);
  } else {
    pc.set(x, y, PURP).set(x + 1, y, GOLD);
  }
}

/** One butterfly wing hinged at (hx, hy). pose: 0 level, 1 up, 2 down. far: the darker back one. */
function wing(pc, hx, hy, pose, far) {
  const base = far ? TEAL_D : TEAL;
  const edge = far ? 0x0a5a50 : EMER;
  const shapes = {
    0: [
      [hx, hy],
      [hx - 3, hy - 6],
      [hx - 8, hy - 7],
      [hx - 9, hy - 3],
      [hx - 5, hy + 1],
    ],
    1: [
      [hx, hy],
      [hx - 1, hy - 8],
      [hx - 5, hy - 11],
      [hx - 8, hy - 8],
      [hx - 5, hy - 1],
    ],
    2: [
      [hx, hy],
      [hx - 4, hy + 2],
      [hx - 8, hy + 6],
      [hx - 6, hy + 8],
      [hx - 1, hy + 4],
    ],
  };
  const pts = shapes[pose];
  pc.poly(pts, edge);
  // inner panel (iridescent): a smaller copy pulled toward the hinge
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  pc.poly(
    pts.map(([x, y]) => [cx + (x - cx) * 0.62, cy + (y - cy) * 0.62]),
    base,
  );
  if (!far) eyeSpot(pc, Math.round(cx) - 1, Math.round(cy), true);
  else pc.set(Math.round(cx), Math.round(cy), GOLD);
}

/** The peacock tail. open: 0 folded, 1 half, 2 fanned into a rainbow display. */
function tail(pc, x, y, open) {
  if (open === 0) {
    // a slim folded bundle of feathers trailing back
    for (let i = 0; i < 3; i++) pc.line(x, y + i - 1, x - 6, y - 1 + i * 2, i === 1 ? EMER : TEAL_D);
    eyeSpot(pc, x - 6, y);
    pc.set(x - 6, y - 2, GOLD).set(x - 6, y + 3, PURP);
    return;
  }
  const rays = open === 1 ? 5 : 9;
  const r = open === 1 ? 6 : 8.5;
  const RAINBOW = [0xff3a5a, 0xff8a2a, GOLD, 0x5ae06a, TEAL, 0x3a8aff, PURP, 0xff5ad8, 0xff3a5a];
  for (let i = 0; i < rays; i++) {
    // fanned up and back, from straight up to straight back
    const a = open === 1 ? Math.PI * (0.6 + (i / (rays - 1)) * 0.35) : Math.PI * (0.3 + (i / (rays - 1)) * 0.68);
    const ex = x + Math.cos(a) * r;
    const ey = y - Math.sin(a) * r;
    const col = open === 2 ? RAINBOW[i] : i % 2 ? EMER : TEAL;
    pc.line(x, y, ex, ey, col);
    pc.line(x, y + 1, ex, ey + 1, col);
    pc.set(Math.round(ex), Math.round(ey), GOLD).set(Math.round(ex) + 1, Math.round(ey), PURP); // eye tip
  }
}

export function dawson(f) {
  const pc = new PixelCanvas(24, 24);
  const wig = f === 1 ? -1 : f === 2 ? 1 : 0; // the swim wiggle
  const bx = 13;
  const by = 13 + wig;
  // (fanned: the wings sweep down out of the way so the whole display shows)
  const wingPose = f === 1 || f === 3 ? 1 : f === 2 || f === 4 ? 2 : 0;
  const tailOpen = f === 4 ? 2 : f === 3 ? 1 : 0;

  const bare = f === 5;
  // ---- behind: tail and the far wing
  if (!bare) {
    tail(pc, tailOpen ? bx - 3 : bx - 6, tailOpen ? by - 2 : by, tailOpen);
    wing(pc, bx - 1, by - 2, wingPose, true);
  }

  // ---- the shark body
  pc.ellipse(bx, by, 7.2, 3.6, BLUE);
  pc.poly(
    [
      [bx + 5, by - 3],
      [bx + 10, by],
      [bx + 5, by + 3],
    ],
    BLUE,
  ); // the snout
  pc.ellipse(bx + 1, by + 2, 6, 1.6, BELLY); // lighter belly
  pc.hline(bx - 5, bx + 4, by - 3, BLUE_L); // a shine along the back
  // dorsal fin
  pc.poly(
    [
      [bx - 2, by - 3],
      [bx + 1, by - 8],
      [bx + 2, by - 3],
    ],
    BLUE_D,
  );
  pc.set(bx + 1, by - 7, BLUE_L);
  // tail fin joint (the shark's own small tail, behind the peacock feathers)
  pc.poly(
    [
      [bx - 7, by],
      [bx - 10, by - 3],
      [bx - 9, by],
      [bx - 10, by + 3],
    ],
    BLUE_D,
  );
  // pectoral fin
  pc.poly(
    [
      [bx + 1, by + 2],
      [bx - 1, by + 5],
      [bx + 3, by + 3],
    ],
    BLUE_D,
  );
  // gills
  pc.vline(bx + 2, by - 1, by + 1, BLUE_D).vline(bx + 3, by - 1, by, BLUE_D);
  // eye with a shine
  pc.rect(bx + 5, by - 2, 2, 2, EYE).set(bx + 5, by - 2, 0xffffff);
  // the big toothy grin (wider when showing off)
  const gw = f === 4 ? 6 : 5;
  pc.hline(bx + 9 - gw, bx + 9, by + 1, MOUTH);
  for (let i = 0; i < gw; i += 1) pc.set(bx + 9 - i, by + (i % 2 ? 1 : 0), TEETH);
  if (f === 4) pc.hline(bx + 4, bx + 8, by + 2, MOUTH).set(bx + 5, by + 2, TEETH).set(bx + 7, by + 2, TEETH);

  // ---- front wing (over the body)
  if (!bare) wing(pc, bx - 1, by - 1, wingPose, false);
  else pc.rect(bx + 5, by - 2, 2, 2, EYE).set(bx + 5, by - 2, EYE).set(bx + 6, by - 1, 0xffffff); // dazed
  return pc.outline(INK, 1, true);
}
