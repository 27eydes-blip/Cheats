// DEWBERRY (epic): a glowing pink berry with a face, drawn in the game's 24x24 hero style. A
// round, plump pink berry made of little juicy bubbles (drupelets), a tiny green leaf and stem
// on top, big sparkly eyes, rosy cheeks and a small happy smile. Its soft pink glow is drawn
// by the rig (dewberryFx.js), not baked into the art. Bold dark outline; the rig adds the
// white outer rim. Frames:
//   0 glide      round, leaf flat (propeller blade one way)
//   1 squish     the flap: squashed wide, leaf turned
//   2 stretch    bouncing back: tall, leaf the other way
//   3 wide eyes  (near-miss)
//   4 delighted  (new best / portrait) happy closed eyes, big smile
import { PixelCanvas } from "./px.js";

const PINK = 0xff4fa0;
const PINK_D = 0xc82a78;
const PINK_L = 0xff8cc8;
const SHINE = 0xffe0f0;
const LEAF = 0x4ad85a;
const LEAF_D = 0x228a3a;
const STEM = 0x2a7a2a;
const EYE = 0x2a0a1e;
const CHEEK = 0xff2a5a;
const INK = 0x3a0820;

/** The berry body: a blob covered in little juicy bubbles. */
function berry(pc, cx, cy, rx, ry) {
  pc.ellipse(cx, cy, rx, ry, PINK);
  // drupelets: a grid of little bubbles, each with a light top-left and a dark bottom-right
  for (let y = Math.ceil(cy - ry) + 1; y <= cy + ry - 1; y += 3) {
    const off = Math.round((y - cy) / 3) % 2 ? 1 : 0;
    for (let x = Math.ceil(cx - rx) + 1 + off; x <= cx + rx - 1; x += 3) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.8) continue;
      pc.set(x, y, PINK_L).set(x + 1, y + 1, PINK_D);
    }
  }
  pc.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55), SHINE); // a glossy highlight
  pc.set(Math.round(cx - rx * 0.5) + 1, Math.round(cy - ry * 0.55), SHINE);
}

/** Leaf + stem on top; turn 0/1/2 = the propeller blade at three angles. */
function leaf(pc, x, y, turn) {
  pc.vline(x, y - 1, y, STEM);
  const blades = [
    [
      [x - 4, y - 2],
      [x + 4, y - 2],
    ],
    [
      [x - 3, y - 4],
      [x + 3, y],
    ],
    [
      [x - 3, y],
      [x + 3, y - 4],
    ],
  ][turn];
  for (const [bx, by] of blades) {
    pc.line(x, y - 2, bx, by, LEAF);
    pc.set(bx, by, LEAF_D);
  }
  pc.set(x, y - 2, LEAF_D);
}

/** Big sparkly eyes. wide: bigger (near-miss); happy: closed "^ ^" arcs. */
function eyes(pc, cx, cy, wide, happy) {
  for (const ex of [cx - 3, cx + 2]) {
    if (happy) {
      pc.set(ex, cy, EYE).set(ex + 1, cy - 1, EYE).set(ex + 2, cy, EYE);
    } else if (wide) {
      pc.rect(ex - 1, cy - 2, 3, 4, EYE).set(ex - 1, cy - 2, 0xffffff).set(ex, cy - 2, 0xffffff);
      pc.set(ex + 1, cy + 1, 0xffffff);
    } else {
      pc.rect(ex, cy - 1, 2, 3, EYE).set(ex, cy - 1, 0xffffff).set(ex + 1, cy + 1, 0xffffff);
    }
  }
}

export function dewberry(f) {
  const pc = new PixelCanvas(24, 24);
  const shape = { 1: [8.4, 6], 2: [6.4, 8] }[f] || [7.3, 7.1];
  const cx = 12;
  const cy = 14 + (f === 1 ? 1 : f === 2 ? -1 : 0);
  berry(pc, cx, cy, shape[0], shape[1]);
  leaf(pc, cx, Math.round(cy - shape[1]), f === 1 ? 1 : f === 2 ? 2 : 0);
  // face
  const fy = cy;
  eyes(pc, cx, fy - 1, f === 3, f === 4);
  pc.set(cx - 5, fy + 2, CHEEK).set(cx - 4, fy + 2, CHEEK).set(cx + 4, fy + 2, CHEEK).set(cx + 5, fy + 2, CHEEK);
  if (f === 4) {
    // a big delighted smile
    pc.hline(cx - 2, cx + 1, fy + 3, EYE).set(cx - 3, fy + 2, EYE).set(cx + 2, fy + 2, EYE);
    pc.hline(cx - 1, cx, fy + 4, CHEEK);
  } else if (f === 3) {
    pc.rect(cx - 1, fy + 2, 2, 2, EYE); // a little "o"
  } else {
    pc.set(cx - 2, fy + 2, EYE).hline(cx - 1, cx, fy + 3, EYE).set(cx + 1, fy + 2, EYE); // small smile
  }
  return pc.outline(INK, 1, true);
}
