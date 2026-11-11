// Hazard art for Sakura Skies: temple bells on ropes, spinning red-bamboo blades, paper
// lanterns (lit / flickering-dark / warning ring) and the wind-gust petal streaks.
// Original pixel art. Sakura is a bright pink-and-orange realm, so everything lethal is deep
// lacquer red with a near-black outline (it reads on the pale sky at a glance); the harmless
// parts (bell ropes, wind) are dark brown or white so they never look like danger.
// Built once at boot with the other hazard atlases (nothing is drawn mid-run).
import { addAtlas, addTexture, PixelCanvas } from "./px.js";

export const SAKURA_RED = { o: 0x1c0306, d: 0x5e0a12, m: 0x9e1420, l: 0xcc2a28, h: 0xff7a5a };
const R = SAKURA_RED;
const GOLD = { d: 0x7a4a0a, m: 0xc8901e, l: 0xf0c850 };
const IRON = { d: 0x1a1214, m: 0x3a2a2e, l: 0x5e4a4e };

/** Bell: half-widths of the bell body per row (row 0 = crown), widest at the lip. */
export const BELL = { w: 20, h: 22, cx: 9.5, cy: 11.5, r: 9 };
function bell() {
  const pc = new PixelCanvas(BELL.w, BELL.h);
  // hanging loop (iron)
  pc.rect(8, 0, 4, 1, IRON.m).set(8, 1, IRON.m).set(11, 1, IRON.m).rect(8, 2, 4, 1, IRON.l);
  // body: rounded shoulder, slightly flared skirt, then a heavy lip
  for (let y = 3; y <= 19; y++) {
    const t = (y - 3) / 16;
    const half = y < 6 ? 4.5 + (y - 3) * 0.9 : 7 + t * 2.2;
    pc.hline(Math.round(BELL.cx - half), Math.round(BELL.cx + half), y, R.m);
  }
  pc.hline(0, 19, 18, R.d).hline(0, 19, 19, R.d); // lip
  // gold bands and the striking boss
  pc.hline(4, 15, 7, GOLD.m).hline(3, 16, 15, GOLD.m);
  pc.circle(BELL.cx, 11.5, 1.6, GOLD.l).set(9, 11, 0xfff0b0);
  // lacquer shine (left) and shadow (right)
  pc.vline(5, 8, 14, R.l).vline(6, 5, 6, R.l).set(5, 16, R.h).set(6, 9, R.h);
  pc.vline(15, 8, 14, R.d).vline(16, 16, 17, R.d);
  // clapper under the lip
  pc.rect(9, 20, 2, 2, IRON.m);
  return pc.outline(R.o, 1);
}
/** Harmless dark rope the bell hangs from (tileable 4 x 8, twisted). */
function ropeTile() {
  const pc = new PixelCanvas(4, 8);
  for (let y = 0; y < 8; y++) {
    pc.set(1, y, (y >> 1) % 2 ? 0x5a3420 : 0x3a2014);
    pc.set(2, y, (y >> 1) % 2 ? 0x3a2014 : 0x7a4a2a);
  }
  return pc;
}
/** Wooden bracket the rope hangs from (16 x 8). */
function bracket() {
  const pc = new PixelCanvas(16, 8);
  pc.rect(0, 0, 16, 4, 0x4a2a18).hline(0, 15, 0, 0x6a3e22);
  pc.rect(6, 4, 4, 3, 0x3a2014);
  pc.set(2, 1, GOLD.m).set(13, 1, GOLD.m);
  return pc.outline(IRON.d, 1);
}

/** Bamboo blade spinner: a red-lacquered bamboo staff with leaf blades at both ends. */
export const BAMBOO = { short: 44, long: 56, h: 13 };
function bamboo(D) {
  const H = BAMBOO.h;
  const cy = (H - 1) / 2;
  const pc = new PixelCanvas(D, H);
  const c = (D - 1) / 2;
  // staff (5 px thick) with darker nodes every 6 px
  pc.rect(6, cy - 2, D - 12, 5, R.m).hline(6, D - 7, cy - 2, R.l).hline(6, D - 7, cy + 2, R.d);
  for (let x = 8; x < D - 8; x += 6) {
    if (Math.abs(x - c) < 5) continue;
    pc.vline(x, cy - 2, cy + 2, R.d).set(x, cy - 3, R.d).set(x, cy + 3, R.d);
  }
  // leaf blades at both tips: pointed, wider than the staff
  for (const s of [-1, 1]) {
    const tip = s < 0 ? 0 : D - 1;
    const base = s < 0 ? 10 : D - 11;
    pc.poly(
      [
        [base, cy - 4.5],
        [tip + (s < 0 ? 0.2 : 0.8), cy + 0.5],
        [base, cy + 5.5],
        [base + s * -2, cy + 0.5],
      ],
      R.l,
    );
    pc.hline(Math.min(base, tip + s * -2), Math.max(base, tip + s * -2), cy, R.h); // edge shine
  }
  // iron hub with a gold pin
  pc.circle(c, cy, 3.4, IRON.m).circle(c, cy, 1.4, GOLD.l).set(c - 1.5, cy - 1.5, IRON.l);
  return pc.outline(R.o, 1);
}

/** Paper lantern (14 x 20): 0 = lit (warm), 1 = dark (flicker off), ring = warning outline. */
export const LANTERN = { w: 14, h: 20, cy: 10.5, r: 7 };
function lantern(f) {
  const pc = new PixelCanvas(LANTERN.w, LANTERN.h);
  const body = f === 1 ? R.d : R.m;
  pc.ellipse(6.5, 10.5, 6, 7, body);
  // inner glow (lit frame) or a dull core (dark frame)
  if (f === 0) pc.ellipse(6.5, 10.5, 3, 4.5, 0xff9a3a).ellipse(6.5, 10.5, 1.6, 2.6, 0xffe08a);
  else pc.ellipse(6.5, 10.5, 3, 4.5, R.m);
  // paper ribs
  for (const y of [6, 9, 12, 15]) pc.hline(1, 12, y, f === 1 ? R.o : R.d);
  // re-cut the silhouette so ribs don't poke out of the body
  for (let y = 0; y < LANTERN.h; y++)
    for (let x = 0; x < LANTERN.w; x++)
      if (((x - 6.5) / 6) ** 2 + ((y - 10.5) / 7) ** 2 > 1.05 && y > 2 && y < 18) pc.set(x, y, null);
  // black lacquer caps and a tassel
  pc.rect(3, 2, 8, 2, IRON.m).hline(3, 10, 2, IRON.l);
  pc.rect(3, 17, 8, 2, IRON.m);
  pc.set(6, 0, IRON.m).set(7, 0, IRON.m).set(6, 1, IRON.m).set(7, 1, IRON.m);
  pc.outline(R.o, 1);
  return pc;
}
/** Warning ring drawn around a lantern about to drop (steady, pulses in alpha only). */
function lanternRing() {
  const pc = new PixelCanvas(LANTERN.w + 8, LANTERN.h + 8);
  const cx = (LANTERN.w + 8 - 1) / 2;
  const cy = (LANTERN.h + 8 - 1) / 2;
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++) {
      const d = ((x - cx) / 10) ** 2 + ((y - cy) / 13) ** 2;
      if (d <= 1.05 && d >= 0.72) pc.set(x, y, 0xff3a3a);
    }
  return pc;
}
/** Dashed drop line under a lantern about to fall (2 x 12, tileable). */
function dropDash() {
  const pc = new PixelCanvas(2, 12);
  pc.rect(0, 0, 2, 6, R.l);
  return pc;
}
/** Thin cord a lantern hangs from (2 x 4). */
function cordTile() {
  const pc = new PixelCanvas(2, 4);
  pc.rect(0, 0, 1, 4, 0x2a1a14).rect(1, 0, 1, 4, 0x4a2e20);
  return pc;
}

/**
 * Wind gust streaks (harmless): tileable 24 x 32, long white wind lines, little chevrons that
 * point the push, and a few cherry petals tumbling along (dark-edged so they read on pink).
 */
function gustTile(dir) {
  const pc = new PixelCanvas(24, 32);
  for (const [x, y0, len] of [
    [3, 2, 11],
    [11, 15, 13],
    [19, 6, 9],
    [7, 22, 8],
  ])
    for (let k = 0; k < len; k++) pc.set(x + (k > len / 2 ? 1 : 0), (y0 + k) % 32, 0xffffff);
  // chevrons pointing the push (up: ^, down: v)
  for (const [x, y] of [
    [15, 4],
    [4, 26],
  ]) {
    pc.set(x, y, 0xfff4f8).set(x - 1, y - dir, 0xfff4f8).set(x + 1, y - dir, 0xfff4f8);
    pc.set(x - 2, y - 2 * dir, 0xfff4f8).set(x + 2, y - 2 * dir, 0xfff4f8);
  }
  // petals
  for (const [x, y] of [
    [6, 10],
    [16, 25],
    [20, 16],
  ])
    pc.set(x, y, 0xe0507a).set(x + 1, y, 0xff9ab8).set(x, y + 1, 0x8a1a40);
  return pc;
}
/** Faint white backing for a gust column (so its edges read). */
function gustBack() {
  const pc = new PixelCanvas(4, 4);
  pc.rect(0, 0, 4, 4, 0xffffff);
  return pc;
}

export function buildSakuraHazards(scene) {
  addTexture(scene, "sk_rope", ropeTile());
  addTexture(scene, "sk_cord", cordTile());
  addTexture(scene, "sk_drop", dropDash());
  addTexture(scene, "sk_gust_up", gustTile(-1));
  addTexture(scene, "sk_gust_down", gustTile(1));
  addTexture(scene, "sk_gust_back", gustBack());
  addAtlas(scene, "skh", {
    bell: bell(),
    bracket: bracket(),
    bamboo_s: bamboo(BAMBOO.short),
    bamboo_l: bamboo(BAMBOO.long),
    lantern_0: lantern(0),
    lantern_1: lantern(1),
    lantern_ring: lanternRing(),
  });
}
