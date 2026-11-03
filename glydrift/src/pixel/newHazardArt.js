// Hazard art for the Peaceful Valley (thorn vines, dandelion puffs, bloom gates) and the
// Hurricane (tumbling debris, storm clouds + lightning, twisters). Original pixel art.
// Everything lethal carries the biome's danger colour so it reads instantly.
import { addAtlas, addTexture, PixelCanvas } from "./px.js";

const RASP = { d: 0x7a0a3a, m: 0xd0105a, l: 0xff2d78, h: 0xffc0d8 }; // valley danger
const ORNG = { d: 0x7a2a00, m: 0xff6a00, l: 0xffa21a, h: 0xfff0a0 }; // hurricane danger
const LEAF = { o: 0x16300f, d: 0x2e6a26, m: 0x4a9a3a, l: 0x7acc5a };

// ------------------------------------------------------------------ valley
/** Vertical, tileable thorny vine (10 x 16). */
function vineTile() {
  const pc = new PixelCanvas(10, 16);
  for (let y = 0; y < 16; y++) {
    const x = 4 + Math.round(Math.sin((y / 16) * Math.PI * 2) * 1);
    pc.rect(x, y, 2, 1, LEAF.m).set(x, y, LEAF.d);
  }
  // thorns, alternating sides
  for (const [x, y, dir] of [
    [3, 2, -1],
    [6, 7, 1],
    [3, 11, -1],
    [6, 14, 1],
  ]) {
    pc.set(x, y, RASP.m)
      .set(x + dir, y, RASP.l)
      .set(x + 2 * dir, y - 1, RASP.h);
  }
  pc.set(7, 4, LEAF.l).set(8, 4, LEAF.m).set(2, 9, LEAF.l).set(1, 9, LEAF.m); // leaves
  return pc.outline(LEAF.o, 1);
}
/** Closed raspberry bud on the end of a vine (12 x 12). */
function bud() {
  const pc = new PixelCanvas(12, 12);
  pc.ellipse(5.5, 6.5, 3.6, 4.4, RASP.m);
  pc.ellipse(5, 5.5, 1.6, 2.4, RASP.l).set(4, 4, RASP.h);
  pc.poly(
    [
      [2, 2],
      [5.5, 4],
      [9, 2],
      [7, 0],
      [5.5, 2],
      [4, 0],
    ],
    LEAF.m,
  );
  for (const [x, y] of [
    [1, 7],
    [10, 7],
    [5, 11],
  ])
    pc.set(x, y, RASP.h);
  return pc.outline(RASP.d, 1);
}
/** Dandelion puff: white fluff around a thorny raspberry core (14 x 14), 2 frames. */
function puff(f) {
  const pc = new PixelCanvas(14, 14);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + f * 0.26;
    const x = 6.5 + Math.cos(a) * 5.4;
    const y = 6.5 + Math.sin(a) * 5.4;
    pc.line(6.5 + Math.cos(a) * 2.5, 6.5 + Math.sin(a) * 2.5, x, y, 0xe8e0f0);
    pc.set(x, y, 0xffffff);
  }
  pc.circle(6.5, 6.5, 2.4, RASP.m).set(6, 6, RASP.h).set(7, 7, RASP.l);
  return pc.outline(0x5a3a5a, 1);
}
/** Flower head facing the gap (26 x 12): open / half / pinched petals. */
function bloom(f) {
  const pc = new PixelCanvas(26, 12);
  const spread = [12, 10, 8][f];
  // petals fan out from the stem joint at the bottom-centre
  for (let i = -3; i <= 3; i++) {
    const tx = 12.5 + i * (spread / 3.5);
    const ty = 1 + Math.abs(i) * 1.2;
    pc.poly(
      [
        [12.5, 11],
        [tx - 2, ty + 2],
        [tx, ty],
        [tx + 2, ty + 2],
      ],
      i % 2 ? RASP.l : RASP.m,
    );
    pc.set(tx, ty, RASP.h);
  }
  pc.ellipse(12.5, 9.5, 3, 2, 0xffd23f).set(12, 9, 0xfff4b0); // pollen centre
  return pc.outline(RASP.d, 1);
}
/** Thorny flower stalk, tileable vertically (10 x 16). */
function stemTile() {
  const pc = new PixelCanvas(10, 16);
  pc.rect(3, 0, 4, 16, LEAF.m).vline(3, 0, 15, LEAF.d).vline(6, 0, 15, LEAF.l);
  for (const [y, dir] of [
    [3, -1],
    [8, 1],
    [13, -1],
  ]) {
    const x = dir < 0 ? 2 : 7;
    pc.set(x, y, RASP.m).set(x + dir, y, RASP.l);
  }
  pc.rect(7, 5, 2, 1, LEAF.l).rect(1, 11, 2, 1, LEAF.l);
  return pc.outline(LEAF.o, 1);
}

// ------------------------------------------------------------------ hurricane
/** Tumbling broken plank with orange storm tape, drawn at 4 angles (0/45/90/135°). */
function plank(f) {
  const N = 26;
  const pc = new PixelCanvas(N, N);
  const a = (f * Math.PI) / 4;
  const c = (N - 1) / 2;
  const L = 10;
  const T = 2.6;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pt = (u, v) => [c + u * ca - v * sa, c + u * sa + v * ca];
  pc.poly([pt(-L, -T), pt(L, -T), pt(L, T), pt(-L, T)], 0x8a5a30);
  pc.poly([pt(-L, -T), pt(L, -T), pt(L, -T + 1.2), pt(-L, -T + 1.2)], 0xb07a40);
  // hazard tape bands
  for (const u of [-6, 2]) pc.poly([pt(u, -T), pt(u + 2.5, -T), pt(u + 2.5, T), pt(u, T)], ORNG.l);
  const [nx, ny] = pt(L - 1, 0);
  pc.set(nx, ny, 0xd8d8e0); // nail
  return pc.outline(0x1a0e06, 1);
}
/** Storm cloud (32 x 14); frame 1 is lit from inside while charging. */
function cloud(f) {
  const pc = new PixelCanvas(32, 14);
  const base = f ? 0x4a5a74 : 0x2a3444;
  const rim = f ? 0xc8e8ff : 0x4a5a6e;
  for (const [x, y, r] of [
    [7, 8, 5],
    [14, 6, 6.5],
    [22, 7, 5.5],
    [27, 9, 4],
    [4, 10, 3.5],
  ])
    pc.circle(x, y, r, base);
  for (let x = 0; x < 32; x++) {
    let t = 0;
    while (t < 14 && pc.get(x, t) === null) t++;
    if (t < 14) pc.set(x, t, rim);
  }
  if (f) for (const x of [9, 15, 21]) pc.set(x, 12, ORNG.h).set(x, 11, 0xffffff);
  return pc.outline(0x05080c, 1);
}
/** Vertical, tileable lightning bolt (10 x 24): white core, orange edges. */
function boltTile() {
  const pc = new PixelCanvas(10, 24);
  const xs = [5, 6, 7, 6, 4, 3, 4, 5, 6, 5, 4, 3, 2, 3, 4, 6, 7, 8, 7, 6, 5, 4, 4, 5];
  xs.forEach((x, y) => {
    pc.rect(x - 2, y, 5, 1, ORNG.m);
    pc.rect(x - 1, y, 3, 1, ORNG.h);
    pc.set(x, y, 0xffffff);
  });
  return pc;
}
/** Dashed strike-warning line (4 x 16). */
function boltWarn() {
  const pc = new PixelCanvas(4, 16);
  pc.rect(1, 0, 2, 8, ORNG.l);
  return pc;
}
/** Twister funnel (30 x 96): narrow at the bottom; 3 frames of swirling bands. */
function twister(f) {
  const W = 30;
  const H = 96;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) {
    const t = 1 - y / H; // 0 at the bottom tip, 1 at the top
    const half = 2 + 12 * t ** 1.3;
    const cx = 15 + Math.sin(y * 0.11 + f * 0.9) * 2.5 * (1 - t * 0.6);
    const band = (y + f * 3) % 8 < 3;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const edge = x <= cx - half + 1 || x >= cx + half - 1;
      pc.set(x, y, edge ? 0x8a9aae : band ? 0xc8d2de : 0x5e6e82);
    }
    // debris + danger streaks caught in the wind
    if ((y + f * 5) % 13 === 0) pc.set(Math.round(cx + half) + 1, y, ORNG.l);
  }
  return pc.outline(0x0a0e14, 1);
}

export function buildNewHazards(scene) {
  addTexture(scene, "vh_vine", vineTile());
  addTexture(scene, "vh_stem", stemTile());
  addTexture(scene, "vh_bolt", boltTile());
  addTexture(scene, "vh_boltwarn", boltWarn());
  const frames = {
    bud: bud(),
    puff_0: puff(0),
    puff_1: puff(1),
    cloud_0: cloud(0),
    cloud_1: cloud(1),
  };
  for (let f = 0; f < 3; f++) {
    frames[`bloom_${f}`] = bloom(f);
    frames[`bloomb_${f}`] = bloom(f).flipY();
    frames[`twister_${f}`] = twister(f);
  }
  for (let f = 0; f < 4; f++) frames[`plank_${f}`] = plank(f);
  addAtlas(scene, "vh", frames);
}
