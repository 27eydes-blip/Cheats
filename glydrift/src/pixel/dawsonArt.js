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
//   6 chomp      (Chomp Combo) jaws wide open, wings up
//
// Every frame takes a LOOK (dawsonLook()): the palettes of a skin (Great White, Neon Reef) or
// the realm's wing colours. The default look is the classic Dawson.
import { PixelCanvas } from "./px.js";

const INK = 0x0a0a22;
const TEETH = 0xffffff;
const MOUTH = 0x4a0a1a;

/** The classic Dawson. Every palette entry can be replaced by a skin or a realm. */
const BASE = {
  body: 0x1f4fb0, // deep ocean blue
  bodyD: 0x13307a,
  bodyL: 0x3d78d8,
  belly: 0xa8dcf6,
  eye: 0x0a0c18,
  eyeShine: 0xffffff,
  wing: 0x18c8b8, // teal
  wingD: 0x0e8a88,
  edge: 0x18a050, // emerald
  edgeFar: 0x0a5a50,
  spot: 0x8a3cd8, // purple
  spot2: 0xffd23f, // gold
  fold: [0x0e8a88, 0x18a050, 0x0e8a88], // folded tail feathers
  fan: [0xff3a5a, 0xff8a2a, 0xffd23f, 0x5ae06a, 0x18c8b8, 0x3a8aff, 0x8a3cd8, 0xff5ad8, 0xff3a5a],
  half: [0x18c8b8, 0x18a050],
  ink: INK,
};

/** The shop skins: palette changes only, same frames. */
export const DAWSON_SKINS = {
  dskin_greatwhite: {
    body: 0xc8d2dc,
    bodyD: 0x8a96a6,
    bodyL: 0xeef3f8,
    belly: 0xffffff,
    wing: 0xffd23f, // gold wings
    wingD: 0xd8a21a,
    edge: 0xffb020,
    edgeFar: 0xa86a10,
    spot: 0x8a4a10,
    spot2: 0xfff1a0,
    fold: [0xd8a21a, 0xffb020, 0xffd23f],
    fan: [0xfff1a0, 0xffd23f, 0xffb020, 0xd8a21a, 0xffd23f, 0xfff1a0, 0xffb020, 0xffd23f, 0xfff1a0],
    half: [0xffd23f, 0xffb020],
  },
  dskin_neonreef: {
    body: 0x10b8b0, // glowing teal
    bodyD: 0x087a78,
    bodyL: 0x5af4e8,
    belly: 0xd0fff8,
    eyeShine: 0xffe0f0,
    wing: 0xff6a9a, // coral pink
    wingD: 0xd83a72,
    edge: 0xff3a7a,
    edgeFar: 0xa01a4a,
    spot: 0x10b8b0,
    spot2: 0xfff0f6,
    fold: [0xd83a72, 0xff6a9a, 0x5af4e8],
    fan: [0xff6a9a, 0x5af4e8, 0xff3a7a, 0x10b8b0, 0xff9ac0, 0x5af4e8, 0xff6a9a, 0x10b8b0, 0xff3a7a],
    half: [0xff6a9a, 0x5af4e8],
    glow: 0xff6a9a, // drawn with a soft glow in the rig
  },
};

/** Realm wings (the classic look only): each realm and dimension paints his wings its own way. */
export const REALM_WINGS = {
  void: null, // the classic teal / emerald
  solar: { wing: 0xff8a2a, wingD: 0xd8501a, edge: 0xffd23f, edgeFar: 0x8a3a10, spot: 0xc8102e, spot2: 0xfff1a0 },
  frozen: { wing: 0x9ae8ff, wingD: 0x5ab8e0, edge: 0xffffff, edgeFar: 0x3a7aa8, spot: 0x3a8aff, spot2: 0xe8faff },
  glitch: { wing: 0x39ff88, wingD: 0x18b858, edge: 0xff4fd8, edgeFar: 0x0a6a38, spot: 0x101014, spot2: 0x3ef4ff },
  abyss: { wing: 0x8a1a2a, wingD: 0x5a0a1a, edge: 0x2a0a14, edgeFar: 0x1a0610, spot: 0xff2a3d, spot2: 0xffb020 },
  valley: { wing: 0x8ae06a, wingD: 0x4aa83a, edge: 0xff9ad0, edgeFar: 0x2a6a2a, spot: 0xffd23f, spot2: 0xffffff },
  hurricane: { wing: 0x9aa8c8, wingD: 0x5a6a8a, edge: 0x3ef4ff, edgeFar: 0x3a4660, spot: 0xffffff, spot2: 0x3ef4ff },
  prism: { wing: 0xd08aff, wingD: 0x8a4ad8, edge: 0x3ef4ff, edgeFar: 0x4a2a8a, spot: 0xffd23f, spot2: 0xff5ad8 },
  tidal: { wing: 0x3a9aff, wingD: 0x1a5ad8, edge: 0x7af4ff, edgeFar: 0x0a3a8a, spot: 0xffffff, spot2: 0x18c8b8 },
  chrono: { wing: 0xe8c070, wingD: 0xa8803a, edge: 0x8a5a2a, edgeFar: 0x5a3a1a, spot: 0x3ef4ff, spot2: 0xfff1d0 },
  mirror: { wing: 0xe0d0ff, wingD: 0xa08ad8, edge: 0x9a3aff, edgeFar: 0x4a1a8a, spot: 0xffffff, spot2: 0xd8c0ff },
};

/** The full look: a skin (or none) and the realm (classic look only). */
export function dawsonLook(skin = null, realm = null) {
  const sk = DAWSON_SKINS[skin] || null;
  const rw = sk ? null : REALM_WINGS[realm] || null;
  return { ...BASE, ...(sk || {}), ...(rw || {}) };
}

/** A peacock "eye": a centre spot inside a ring. */
function eyeSpot(pc, L, x, y, big = false) {
  if (big) {
    pc.circle(x, y, 1.4, L.spot2).set(x, y, L.spot).set(x + 1, y, L.spot).set(x, y + 1, L.spot);
  } else {
    pc.set(x, y, L.spot).set(x + 1, y, L.spot2);
  }
}

/** One butterfly wing hinged at (hx, hy). pose: 0 level, 1 up, 2 down. far: the darker back one. */
function wing(pc, L, hx, hy, pose, far) {
  const base = far ? L.wingD : L.wing;
  const edge = far ? L.edgeFar : L.edge;
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
  if (!far) eyeSpot(pc, L, Math.round(cx) - 1, Math.round(cy), true);
  else pc.set(Math.round(cx), Math.round(cy), L.spot2);
}

/** The peacock tail. open: 0 folded, 1 half, 2 fanned into a rainbow display. */
function tail(pc, L, x, y, open) {
  if (open === 0) {
    // a slim folded bundle of feathers trailing back
    for (let i = 0; i < 3; i++) pc.line(x, y + i - 1, x - 6, y - 1 + i * 2, L.fold[i]);
    eyeSpot(pc, L, x - 6, y);
    pc.set(x - 6, y - 2, L.spot2).set(x - 6, y + 3, L.spot);
    return;
  }
  const rays = open === 1 ? 5 : 9;
  const r = open === 1 ? 6 : 8.5;
  for (let i = 0; i < rays; i++) {
    // fanned up and back, from straight up to straight back
    const a = open === 1 ? Math.PI * (0.6 + (i / (rays - 1)) * 0.35) : Math.PI * (0.3 + (i / (rays - 1)) * 0.68);
    const ex = x + Math.cos(a) * r;
    const ey = y - Math.sin(a) * r;
    const col = open === 2 ? L.fan[i] : L.half[i % 2];
    pc.line(x, y, ex, ey, col);
    pc.line(x, y + 1, ex, ey + 1, col);
    pc.set(Math.round(ex), Math.round(ey), L.spot2).set(Math.round(ex) + 1, Math.round(ey), L.spot); // eye tip
  }
}

export function dawson(f, L = dawsonLook()) {
  const pc = new PixelCanvas(24, 24);
  const wig = f === 1 ? -1 : f === 2 ? 1 : 0; // the swim wiggle
  const bx = 13;
  const by = 13 + wig;
  // (fanned: the wings sweep down out of the way so the whole display shows)
  const wingPose = f === 1 || f === 3 || f === 6 ? 1 : f === 2 || f === 4 ? 2 : 0;
  const tailOpen = f === 4 ? 2 : f === 3 ? 1 : 0;

  const bare = f === 5;
  // ---- behind: tail and the far wing
  if (!bare) {
    tail(pc, L, tailOpen ? bx - 3 : bx - 6, tailOpen ? by - 2 : by, tailOpen);
    wing(pc, L, bx - 1, by - 2, wingPose, true);
  }

  // ---- the shark body
  pc.ellipse(bx, by, 7.2, 3.6, L.body);
  pc.poly(
    [
      [bx + 5, by - 3],
      [bx + 10, by],
      [bx + 5, by + 3],
    ],
    L.body,
  ); // the snout
  pc.ellipse(bx + 1, by + 2, 6, 1.6, L.belly); // lighter belly
  pc.hline(bx - 5, bx + 4, by - 3, L.bodyL); // a shine along the back
  // dorsal fin
  pc.poly(
    [
      [bx - 2, by - 3],
      [bx + 1, by - 8],
      [bx + 2, by - 3],
    ],
    L.bodyD,
  );
  pc.set(bx + 1, by - 7, L.bodyL);
  // tail fin joint (the shark's own small tail, behind the peacock feathers)
  pc.poly(
    [
      [bx - 7, by],
      [bx - 10, by - 3],
      [bx - 9, by],
      [bx - 10, by + 3],
    ],
    L.bodyD,
  );
  // pectoral fin
  pc.poly(
    [
      [bx + 1, by + 2],
      [bx - 1, by + 5],
      [bx + 3, by + 3],
    ],
    L.bodyD,
  );
  // gills
  pc.vline(bx + 2, by - 1, by + 1, L.bodyD).vline(bx + 3, by - 1, by, L.bodyD);
  // eye with a shine
  pc.rect(bx + 5, by - 2, 2, 2, L.eye).set(bx + 5, by - 2, L.eyeShine);
  // the mouth
  const mx = bx + 9; // front of the jaw
  if (f === 6) {
    // CHOMP: jaws wide open, two rows of teeth
    pc.rect(mx - 4, by, 5, 3, MOUTH);
    for (let i = 0; i < 5; i += 2) pc.set(mx - 4 + i, by, TEETH).set(mx - 3 + i, by + 2, TEETH);
  } else {
    // the big toothy grin (wider when showing off)
    const gw = f === 4 ? 6 : 5;
    pc.hline(mx - gw, mx, by + 1, MOUTH);
    for (let i = 0; i < gw; i += 1) pc.set(mx - i, by + (i % 2 ? 1 : 0), TEETH);
    if (f === 4) pc.hline(mx - 5, mx - 1, by + 2, MOUTH).set(mx - 4, by + 2, TEETH).set(mx - 2, by + 2, TEETH);
  }

  // ---- front wing (over the body)
  if (!bare) wing(pc, L, bx - 1, by - 1, wingPose, false);
  else pc.rect(bx + 5, by - 2, 2, 2, L.eye).set(bx + 6, by - 1, L.eyeShine); // dazed
  return pc.outline(L.ink, 1, true);
}

/** A tiny butterfly for the Migration (7x5, two flap frames), in his wing colours. */
export function miniButterfly(f, L = dawsonLook()) {
  const pc = new PixelCanvas(7, 5);
  if (f === 0) pc.rect(0, 0, 3, 2, L.wing).rect(4, 0, 3, 2, L.wing).rect(1, 2, 2, 2, L.edge).rect(4, 2, 2, 2, L.edge);
  else pc.rect(1, 1, 2, 3, L.wing).rect(4, 1, 2, 3, L.wing);
  pc.vline(3, 0, 4, 0x1a1a2a);
  return pc;
}
