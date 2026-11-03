// Background silhouettes for the Peaceful Valley and the Hurricane. Every layer tiles
// horizontally (all shapes use periods that divide the width) and is original pixel art.
import { PixelCanvas, seeded } from "./px.js";

export const EXTRA_KINDS = [
  "hills",
  "meadow",
  "blossoms",
  "mountains",
  "canopy",
  "grass",
  "stormclouds",
  "palms",
  "scud",
  "surf",
];

const TAU = Math.PI * 2;
/** Tileable wave: sum of sines whose periods divide w. */
function wave(x, w, parts) {
  let v = 0;
  for (const [k, amp, ph] of parts) v += Math.sin((x / w) * TAU * k + ph) * amp;
  return v;
}
/** Draw a ground silhouette whose top edge is f(x); rim on the top pixel. */
function ground(pc, f, base, rim) {
  for (let x = 0; x < pc.w; x++) {
    const top = Math.max(0, Math.round(f(x)));
    pc.vline(x, top, pc.h - 1, base);
    pc.set(x, top, rim);
  }
}
const topOf = (pc, x) => {
  let y = 0;
  while (y < pc.h && pc.get(x, y) === null) y++;
  return y;
};

export function silhouetteExtra(w, h, seed, { base, rim, detail, kind }) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(w, h);
  if (kind === "hills") {
    ground(
      pc,
      (x) =>
        h * 0.45 +
        wave(x, w, [
          [1, 7, 0.4],
          [3, 3, 1.3],
          [5, 1.2, 2],
        ]),
      base,
      rim,
    );
    // a few round trees on the ridge
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rnd() * (w - 6)) + 3;
      const t = topOf(pc, x);
      pc.circle(x, t - 2, 2.2, rim).vline(x, t - 1, t + 1, base);
    }
  } else if (kind === "mountains") {
    // soft, far-away snow-capped peaks (also used, as cloud banks, for the storm haze)
    ground(
      pc,
      (x) =>
        h * 0.35 +
        Math.abs(
          wave(x, w, [
            [2, 14, 0.2],
            [5, 4, 1.1],
          ]),
        ) *
          0.9,
      base,
      rim,
    );
    for (let x = 0; x < w; x++) {
      const t = topOf(pc, x);
      if (t < h * 0.42) pc.vline(x, t, t + 2, detail);
    }
  } else if (kind === "meadow") {
    ground(
      pc,
      (x) =>
        h * 0.55 +
        wave(x, w, [
          [2, 5, 0.9],
          [4, 2, 0.2],
        ]),
      base,
      rim,
    );
    // flowers dotted over the meadow
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rnd() * w);
      const t = topOf(pc, x);
      const y = t + 2 + Math.floor(rnd() * (h - t - 4));
      pc.set(x, y, rnd() < 0.6 ? detail : 0xfff4b0);
    }
    // two little cottages with warm windows
    for (const cx of [Math.floor(w * 0.3), Math.floor(w * 0.78)]) {
      const t = topOf(pc, cx) - 1;
      pc.rect(cx - 3, t - 4, 7, 5, rim).set(cx, t - 2, 0xfff4b0);
      for (let i = 0; i < 4; i++) pc.hline(cx - 4 + i, cx + 4 - i, t - 5 - i, base);
    }
  } else if (kind === "blossoms") {
    // a blossoming branch canopy hanging from the top
    for (let x = 0; x < w; x++) pc.vline(x, 0, 3 + Math.round(wave(x, w, [[4, 1.5, 0]])), base);
    let x = 2;
    while (x < w - 6) {
      const len = 8 + Math.floor(rnd() * (h * 0.5));
      let cx = x;
      for (let y = 3; y < len; y++) {
        if (rnd() < 0.25) cx += rnd() < 0.5 ? -1 : 1;
        pc.set(cx, y, base);
      }
      // blossom clusters along and at the end of the twig
      for (let k = 0; k < 3; k++) {
        const by = 4 + Math.floor(rnd() * (len - 3));
        pc.circle(cx + (rnd() < 0.5 ? -1 : 1), by, 1.6, detail);
      }
      pc.circle(cx, len, 2, detail).set(cx, len, 0xffffff);
      x += 6 + Math.floor(rnd() * 10);
    }
  } else if (kind === "canopy") {
    // leafy fringe along the top edge
    for (let x = 0; x < w; x++) {
      const d =
        6 +
        Math.round(
          wave(x, w, [
            [4, 3, 0.3],
            [9, 1.5, 1],
          ]),
        );
      pc.vline(x, 0, d, base);
      pc.set(x, d, rim);
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(rnd() * (w - 4)) + 2;
      const d = 5 + Math.floor(rnd() * 10);
      pc.vline(x, 0, d, base);
      pc.circle(x, d, 2, base).set(x - 1, d - 1, rim);
    }
  } else if (kind === "grass") {
    // tall grass + flowers along the bottom
    ground(pc, (x) => h - 6 + wave(x, w, [[4, 1.5, 0.5]]), base, rim);
    for (let x = 0; x < w; x++) {
      if (rnd() < 0.55) {
        const len = 3 + Math.floor(rnd() * 12);
        const lean = rnd() < 0.5 ? 0 : 1;
        for (let i = 0; i < len; i++) pc.set(x + (i > len / 2 ? lean : 0), h - 6 - i, base);
        pc.set(x + lean, h - 6 - len, rim);
      }
    }
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * (w - 2)) + 1;
      const y = h - 12 - Math.floor(rnd() * 14);
      pc.vline(x, y, h - 6, base);
      pc.set(x, y, 0xfff4b0)
        .set(x - 1, y, detail)
        .set(x + 1, y, detail)
        .set(x, y - 1, detail);
    }
  } else if (kind === "stormclouds") {
    // heavy, rolling cloud banks with lit edges
    ground(
      pc,
      (x) =>
        h * 0.3 +
        wave(x, w, [
          [3, 8, 0.1],
          [7, 3, 1.4],
          [11, 1.5, 0.6],
        ]),
      base,
      rim,
    );
    for (let x = 0; x < w; x++) {
      const t = topOf(pc, x);
      if (Math.sin((x / w) * TAU * 6) > 0.6) pc.set(x, t + 1, detail);
    }
  } else if (kind === "palms") {
    // a shoreline of palms bent hard by the wind
    ground(pc, (x) => h - 8 + wave(x, w, [[2, 1.5, 0.3]]), base, rim);
    for (let i = 0; i < 5; i++) {
      const x0 = Math.floor((i + 0.3 + rnd() * 0.4) * (w / 5));
      const hgt = 26 + Math.floor(rnd() * 20);
      let px = x0;
      let py = h - 8;
      for (let k = 0; k < hgt; k++) {
        py--;
        if (k > hgt * 0.35 && k % 3 === 0) px--; // trunk bends away from the wind
        pc.set(px, py, base).set(px + 1, py, base);
      }
      // fronds streaming to the left
      for (const [dx, dy] of [
        [-9, -1],
        [-8, 2],
        [-7, 5],
        [-6, -3],
        [-4, 4],
      ])
        pc.line(px, py, px + dx, py + dy, base);
      pc.set(px - 1, py + 1, detail);
    }
  } else if (kind === "scud") {
    // ragged low cloud racing along the top
    for (let x = 0; x < w; x++) {
      const d =
        4 +
        Math.round(
          wave(x, w, [
            [5, 3, 0.7],
            [11, 2, 0.1],
          ]),
        );
      pc.vline(x, 0, Math.max(1, d), base);
      if (rnd() < 0.3) pc.set(x, d + 1, base);
      pc.set(x, d, rim);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * w);
      const y = 8 + Math.floor(rnd() * (h * 0.4));
      pc.hline(x, Math.min(w - 1, x + 6 + Math.floor(rnd() * 8)), y, base);
    }
  } else if (kind === "surf") {
    // churning waves along the bottom, white caps blown off the crests
    ground(
      pc,
      (x) =>
        h -
        10 +
        wave(x, w, [
          [4, 3, 0.2],
          [9, 1.5, 1.1],
        ]),
      base,
      rim,
    );
    for (let x = 0; x < w; x++) {
      const t = topOf(pc, x);
      if (Math.sin((x / w) * TAU * 4 + 0.2) > 0.75) pc.set(x, t, detail).set(x - 1, t - 1, detail);
    }
  }
  return pc;
}

/** Weather sprites: butterflies (white wings, tinted per butterfly; 2 flap frames) + petals. */
export function weatherFrames() {
  const W = 0xffffff;
  const Sp = 0xd8d0e0;
  const B = 0x3a2a3a;
  const open = new PixelCanvas(9, 7).stamp(
    0,
    0,
    [".WW...WW.", "WWWW.WWWW", "WSWWBWWSW", ".WWWBWWW.", "..WWBWW..", ".WW.B.WW.", ".W.....W."],
    { W, S: Sp, B },
  );
  const shut = new PixelCanvas(9, 7).stamp(
    0,
    0,
    [".........", "...W.W...", "..WWBWW..", "..WSBSW..", "...WBW...", "....B....", "........."],
    { W, S: Sp, B },
  );
  const petal = new PixelCanvas(3, 2).stamp(0, 0, ["WW.", ".WW"], { W });
  return { bfly_0: open, bfly_1: shut, petal };
}
