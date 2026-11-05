// Background silhouettes for the Peaceful Valley, the Hurricane, the Frozen Nebula and the
// Solar Storm and the Neon Void. Every layer tiles
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
  // Solar Storm
  "sunrise",
  "mesas",
  "suntemples",
  "scorched",
  "lavadunes",
  // Neon Void
  "neonskyline",
  "monoliths",
  "circuitruins",
  "neonwires",
  "datarubble",
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
  if (["sunrise", "mesas", "suntemples", "scorched", "lavadunes"].includes(kind))
    return solarKind(pc, w, h, rnd, { base, rim, detail, kind });
  if (["neonskyline", "monoliths", "circuitruins", "neonwires", "datarubble"].includes(kind))
    return voidKind(pc, w, h, rnd, { base, rim, detail, kind });
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

/** Solar Storm layers: a low sun, mesas, sun temples, scorched overhangs, lava dunes. */
function solarKind(pc, w, h, rnd, { base, rim, detail, kind }) {
  if (kind === "sunrise") {
    // a huge, dim sun sunk into the horizon (dark: the hazards are the bright things here)
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.78);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.05);
        // deep ember reds: brighter than the sky, far darker than the lava hazards
        if (d < 30) pc.set(x, y, d < 26 ? (d < 22 ? 0x5a1c0c : 0x46150a) : 0x2e0e07);
      }
    // sunspot bands across the disc
    for (const by of [cy - 18, cy - 11, cy - 4])
      for (let x = cx - 26; x <= cx + 26; x++)
        if (pc.get(x, by) === 0x5a1c0c && (x + by) % 5 < 3) pc.set(x, by, 0x46150a);
    // a flat, low ridge in front of it
    ground(pc, (x) => h * 0.86 + wave(x, w, [[3, 1.5, 0.4], [7, 0.8, 1.1]]), base, rim);
  } else if (kind === "mesas") {
    // flat-topped desert mesas with stepped sides and banded rock
    for (let x = 0; x < w; x++) pc.vline(x, Math.floor(h * 0.82), h - 1, base);
    let x = 0;
    while (x < w) {
      const mw = 14 + Math.floor(rnd() * 20);
      const top = Math.floor(h * (0.3 + rnd() * 0.3));
      for (let i = 0; i < mw && x + i < w; i++) {
        const edge = Math.min(i, mw - 1 - i);
        const t = top + Math.max(0, 4 - edge) * 2;
        pc.vline(x + i, t, h - 1, base);
        pc.set(x + i, t, rim);
        if ((t + 6) % 7 === 0 || i % 9 === 4) pc.set(x + i, t + 6, detail);
      }
      for (let y = top + 8; y < h; y += 7) pc.hline(x + 2, Math.min(w - 1, x + mw - 3), y, rim);
      x += mw + 4 + Math.floor(rnd() * 12);
    }
  } else if (kind === "suntemples") {
    // ruined sun temples: stepped ziggurats and obelisks with a sun disc on top
    ground(pc, (x) => h * 0.78 + wave(x, w, [[2, 2, 0.8]]), base, rim);
    for (let i = 0; i < 4; i++) {
      const cx = Math.floor((i + 0.5) * (w / 4) + (rnd() - 0.5) * 12);
      const g = topOf(pc, cx);
      if (i % 2 === 0) {
        // ziggurat
        for (let step = 0; step < 4; step++) {
          const hw = 12 - step * 3;
          const y0 = g - (step + 1) * 4;
          pc.rect(cx - hw, y0, hw * 2 + 1, 4, base).hline(cx - hw, cx + hw, y0, rim);
        }
        pc.set(cx, g - 18, detail).set(cx - 1, g - 17, detail).set(cx + 1, g - 17, detail);
      } else {
        // obelisk with a sun disc
        const oh = 16 + Math.floor(rnd() * 10);
        pc.rect(cx - 2, g - oh, 5, oh, base).vline(cx - 2, g - oh, g, rim);
        pc.set(cx, g - oh - 1, rim).circle(cx, g - oh - 4, 2.2, detail);
      }
    }
  } else if (kind === "scorched") {
    // charred rock overhangs with ember tips
    for (let x = 0; x < w; x++) {
      const len = 4 + Math.round(Math.abs(wave(x, w, [[4, 6, 0.3], [9, 3, 1.4], [16, 1.4, 0.7]])));
      pc.vline(x, 0, len, base);
      pc.set(x, len, rim);
      if (x % 7 === 3 && len > 6) pc.set(x, len + 1, detail);
    }
  } else if (kind === "lavadunes") {
    // dark dunes with faint glowing cracks
    ground(pc, (x) => h * 0.45 + wave(x, w, [[2, 6, 0.2], [5, 2.5, 1.6], [11, 1, 0.3]]), base, rim);
    for (let i = 0; i < 9; i++) {
      let x = Math.floor(rnd() * w);
      let y = topOf(pc, x) + 4 + Math.floor(rnd() * 8);
      for (let k = 0; k < 6; k++) {
        if (pc.get(x, y) !== null) pc.set(x, y, detail);
        x += rnd() < 0.5 ? 1 : 0;
        y += 1;
      }
    }
  }
  return pc;
}

/** Neon Void layers: a far neon skyline, floating monoliths, circuit ruins, wires, rubble. */
function voidKind(pc, w, h, rnd, { base, rim, detail, kind }) {
  if (kind === "neonskyline") {
    // a far city of thin towers with rows of lit windows and a few antenna lights
    for (let x = 0; x < w; x++) pc.vline(x, Math.floor(h * 0.9), h - 1, base);
    let x = 0;
    while (x < w) {
      const tw = 4 + Math.floor(rnd() * 7);
      const top = Math.floor(h * (0.2 + rnd() * 0.55));
      pc.rect(x, top, tw, h - top, base).hline(x, x + tw - 1, top, rim);
      for (let y = top + 3; y < h - 2; y += 3)
        for (let i = 1; i < tw - 1; i += 2) if (rnd() < 0.35) pc.set(x + i, y, detail);
      if (rnd() < 0.4) pc.vline(x + Math.floor(tw / 2), top - 4, top - 1, rim).set(x + Math.floor(tw / 2), top - 5, detail);
      x += tw + 1 + Math.floor(rnd() * 3);
    }
  } else if (kind === "monoliths") {
    // tilted slabs hovering over a dark plain, each with a lit edge and a faint shadow below
    ground(pc, (x) => h * 0.88 + wave(x, w, [[2, 1.5, 0.2]]), base, rim);
    for (let i = 0; i < 5; i++) {
      const cx = Math.floor((i + 0.5) * (w / 5) + (rnd() - 0.5) * 10);
      const mh = 14 + Math.floor(rnd() * 16);
      const mw = 5 + Math.floor(rnd() * 4);
      const top = Math.floor(h * 0.15 + rnd() * h * 0.3);
      const lean = rnd() < 0.5 ? -1 : 1;
      for (let y = 0; y < mh; y++) {
        const off = Math.round((y / mh) * 2 * lean);
        pc.hline(cx + off, cx + off + mw - 1, top + y, base);
        pc.set(cx + off, top + y, rim);
      }
      pc.hline(cx, cx + mw - 1, top, detail);
      pc.hline(cx - 1, cx + mw, Math.floor(h * 0.88) - 1, rim); // shadow on the plain
    }
  } else if (kind === "circuitruins") {
    // broken columns and arches with neon circuit strips running up them
    ground(pc, (x) => h * 0.7 + wave(x, w, [[3, 2.5, 0.5], [7, 1, 1.3]]), base, rim);
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor((i + 0.4 + rnd() * 0.2) * (w / 6));
      const g = topOf(pc, cx);
      const ch = 10 + Math.floor(rnd() * 22);
      pc.rect(cx - 2, g - ch, 5, ch, base).vline(cx - 2, g - ch, g, rim);
      // the strip: a lit line with a node every few pixels
      for (let y = g - ch + 2; y < g; y++) if (y % 4 !== 0) pc.set(cx, y, detail);
      if (rnd() < 0.5) pc.hline(cx - 4, cx + 4, g - ch, rim); // capital
      else pc.set(cx + 2, g - ch, null).set(cx + 1, g - ch, null); // broken top
    }
  } else if (kind === "neonwires") {
    // sagging cables from the top with small lamps on them
    for (let x = 0; x < w; x++) pc.vline(x, 0, 1, base);
    for (let c = 0; c < 3; c++) {
      const sag = 6 + c * 4;
      const ph = c * 1.7;
      for (let x = 0; x < w; x++) {
        const y = 2 + Math.round(Math.abs(Math.sin((x / w) * Math.PI * (2 + c) + ph)) * sag);
        pc.set(x, y, c === 1 ? rim : base);
        if (x % (17 + c * 6) === 8) pc.set(x, y + 1, detail).set(x, y + 2, detail);
      }
    }
  } else if (kind === "datarubble") {
    // rubble along the floor with blinking data glyphs (static here; lit pixels)
    ground(pc, (x) => h * 0.5 + Math.abs(wave(x, w, [[5, 3, 0.4], [11, 2, 1.1], [19, 1, 0.2]])), base, rim);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rnd() * w);
      const y = topOf(pc, x) + 2 + Math.floor(rnd() * 8);
      if (pc.get(x, y) !== null) pc.set(x, y, detail);
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
