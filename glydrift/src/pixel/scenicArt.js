// Background silhouettes for the Peaceful Valley, the Hurricane and the Frozen Nebula. Every layer tiles
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
  // Frozen Nebula
  "glaciers",
  "icespires",
  "frozentrees",
  "icefangs",
  "snowdrifts",
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
  if (["glaciers", "icespires", "frozentrees", "icefangs", "snowdrifts"].includes(kind))
    return frozenKind(pc, w, h, rnd, { base, rim, detail, kind });
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
/** Frozen Nebula layers: glaciers, ice spires, frozen trees, ice fangs, snowdrifts. */
function frozenKind(pc, w, h, rnd, { base, rim, detail, kind }) {
  if (kind === "glaciers") {
    // a far glacier range: sharp peaks with snow caps and blue crevasses, a ringed moon above
    ground(
      pc,
      (x) => {
        const v = Math.abs(wave(x, w, [[3, 10, 0.3], [7, 4, 1.7], [13, 1.5, 0.9]]));
        return h * 0.62 - v * 1.1;
      },
      base,
      rim,
    );
    for (let x = 0; x < w; x++) {
      const t = topOf(pc, x);
      if (t < h * 0.5) pc.vline(x, t, t + 1 + (x % 3 === 0 ? 1 : 0), detail); // snow caps
      if (x % 9 === 4) pc.vline(x, t + 4, Math.min(h - 1, t + 9), rim); // crevasses
    }
    const mx = Math.floor(w * 0.68);
    pc.circle(mx, 9, 5, detail).circle(mx - 2, 8, 4.2, base);
    for (let x = mx - 9; x <= mx + 9; x++) if (Math.abs(x - mx) > 5) pc.set(x, 10, rim);
  } else if (kind === "icespires") {
    // crystal spires of different heights, each with a lit face
    ground(pc, (x) => h * 0.86 + wave(x, w, [[2, 2, 0.2]]), base, rim);
    let x = 3;
    while (x < w - 6) {
      const hw = 2 + Math.floor(rnd() * 3);
      const top = Math.floor(h * (0.15 + rnd() * 0.45));
      for (let y = top; y < h; y++) {
        const k = (y - top) / (h - top);
        const half = Math.max(0, Math.round(hw * Math.min(1, k * 2.4)));
        pc.hline(x - half, x + half, y, base);
        if (half > 0) pc.set(x - half, y, rim); // lit left edge
      }
      pc.set(x, top, detail).set(x, top + 1, detail);
      if (rnd() < 0.5) pc.vline(x + 1, top + 4, top + 9, detail); // a glint
      x += hw * 2 + 3 + Math.floor(rnd() * 6);
    }
  } else if (kind === "frozentrees") {
    // a snowy ridge with frost-covered pines
    ground(pc, (x) => h * 0.62 + wave(x, w, [[2, 4, 0.6], [5, 1.5, 1.2]]), base, rim);
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor((i + 0.3 + rnd() * 0.4) * (w / 9));
      const t = topOf(pc, cx);
      const th = 8 + Math.floor(rnd() * 9);
      for (let k = 0; k < th; k++) {
        const half = Math.floor((k / th) * 4) + 1;
        pc.hline(cx - half, cx + half, t - th + k, base);
        if (k % 3 === 0) pc.hline(cx - half, cx - half + 1, t - th + k, detail); // snow on boughs
      }
      pc.set(cx, t - th - 1, detail);
    }
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rnd() * w);
      pc.set(x, topOf(pc, x), detail);
    }
  } else if (kind === "icefangs") {
    // jagged ice fangs hanging from the top edge, frosted tips
    for (let x = 0; x < w; x++) pc.vline(x, 0, 2, base);
    let x = 1;
    while (x < w - 3) {
      const hw = 1 + Math.floor(rnd() * 3);
      const len = 6 + Math.floor(rnd() * (h - 10));
      for (let y = 0; y < len; y++) {
        const half = Math.round(hw * (1 - y / len));
        pc.hline(x - half, x + half, y, base);
        pc.set(x - half, y, rim);
      }
      pc.set(x, len, detail);
      x += hw * 2 + 2 + Math.floor(rnd() * 4);
    }
  } else if (kind === "snowdrifts") {
    // soft snowdrifts along the bottom with a few half-buried ice shards
    ground(pc, (x) => h * 0.5 + wave(x, w, [[2, 5, 0.1], [4, 2.5, 1.9], [8, 1, 0.4]]), base, rim);
    for (let x = 0; x < w; x++) if (x % 5 === 2) pc.set(x, topOf(pc, x) + 1, detail);
    for (let i = 0; i < 5; i++) {
      const cx = Math.floor(rnd() * (w - 4)) + 2;
      const t = topOf(pc, cx);
      pc.line(cx, t, cx + 2, t - 6, rim).line(cx + 1, t, cx + 3, t - 5, detail);
    }
  }
  return pc;
}

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
  const bubble = new PixelCanvas(5, 5).stamp(0, 0, [".WWW.", "W.S.W", "W...W", "W...W", ".WWW."], {
    W,
    S: 0xffffff,
  });
  return { bfly_0: open, bfly_1: shut, petal, bubble };
}
