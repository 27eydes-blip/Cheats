// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Background silhouettes for the four dimensions. Every layer tiles horizontally (shapes
// use periods that divide the width) and is original pixel art.
import { PixelCanvas, seeded } from "./px.js";

export const DIM_KINDS = [
  "crystals",
  "floatprisms",
  "spires",
  "whale",
  "coral",
  "seafloor",
  "kelp",
  "surface",
  "anemones",
  "clockface",
  "gears",
  "eclipse",
  "cogs",
  "towers",
];

const TAU = Math.PI * 2;
const wave = (x, w, parts) =>
  parts.reduce((v, [k, a, p]) => v + Math.sin((x / w) * TAU * k + p) * a, 0);
const topOf = (pc, x) => {
  let y = 0;
  while (y < pc.h && pc.get(x, y) === null) y++;
  return y;
};
/** Filled gear/cog outline at (cx, cy). */
function gear(pc, cx, cy, r, teeth, col, hole) {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.atan2(y - cy, x - cx);
      const tooth = Math.cos(a * teeth) > 0.35 ? 2 : 0;
      if (d <= r + tooth && d > r * 0.35) pc.set(x, y, col);
    }
  if (hole) pc.circle(cx, cy, r * 0.18, col);
}

export function silhouetteDim(w, h, seed, { base, rim, detail, kind }) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(w, h);
  if (kind === "crystals") {
    // a skyline of tall faceted crystal shards
    let x = 0;
    while (x < w) {
      const cw = 5 + Math.floor(rnd() * 8);
      const ch = Math.floor(h * (0.35 + rnd() * 0.55));
      const tip = x + Math.floor(cw / 2);
      for (let i = 0; i < cw; i++) {
        const top = h - ch + Math.round(Math.abs(x + i - tip) * (ch / cw) * 0.9);
        pc.vline(x + i, top, h - 1, base);
        if (x + i === tip) pc.vline(x + i, top, top + Math.floor(ch * 0.5), rim);
      }
      pc.set(tip, h - ch, detail);
      x += cw - 1 + Math.floor(rnd() * 3);
    }
  } else if (kind === "floatprisms") {
    // floating triangular prisms with a lit edge, over a low crystal ridge
    for (let x = 0; x < w; x++)
      pc.vline(x, h - 6 + Math.round(wave(x, w, [[4, 1.5, 0]])), h - 1, base);
    for (let i = 0; i < 4; i++) {
      const cx = Math.floor((i + 0.5) * (w / 4) + (rnd() - 0.5) * 10);
      const cy = Math.floor(h * (0.25 + rnd() * 0.4));
      const s = 6 + Math.floor(rnd() * 6);
      pc.poly(
        [
          [cx, cy - s],
          [cx + s, cy + s],
          [cx - s, cy + s],
        ],
        base,
      );
      pc.line(cx, cy - s, cx + s, cy + s, rim);
      pc.set(cx, cy, detail);
    }
  } else if (kind === "spires") {
    for (let x = 0; x < w; x++) {
      const top =
        h * 0.55 +
        wave(x, w, [
          [2, 5, 0.2],
          [5, 2, 1],
        ]);
      pc.vline(x, Math.round(top), h - 1, base);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * (w - 4)) + 2;
      const t = topOf(pc, x);
      const sh = 10 + Math.floor(rnd() * 22);
      for (let k = 0; k < sh; k++)
        pc.hline(
          x - Math.floor((1 - k / sh) * 2),
          x + Math.floor((1 - k / sh) * 2),
          t - sh + k,
          base,
        );
      pc.set(x, t - sh, detail);
    }
  } else if (kind === "whale") {
    // a giant whale gliding through the far dark, with a few small fish
    for (let x = 0; x < w; x++) pc.vline(x, h - 4, h - 1, base);
    const wx = Math.floor(w * 0.3);
    const wy = Math.floor(h * 0.45);
    pc.ellipse(wx, wy, w * 0.22, h * 0.17, base);
    pc.ellipse(wx + w * 0.16, wy + 1, w * 0.08, h * 0.12, base); // head
    pc.poly(
      [
        [wx - w * 0.2, wy],
        [wx - w * 0.32, wy - h * 0.14],
        [wx - w * 0.29, wy],
        [wx - w * 0.32, wy + h * 0.12],
      ],
      base,
    ); // tail
    pc.poly(
      [
        [wx, wy + h * 0.12],
        [wx - 6, wy + h * 0.28],
        [wx + 4, wy + h * 0.14],
      ],
      base,
    ); // fin
    for (let x = Math.floor(wx - w * 0.15); x < wx + w * 0.2; x += 3)
      pc.set(x, Math.round(wy + h * 0.1), rim);
    pc.set(Math.round(wx + w * 0.2), wy - 2, detail); // eye glint
    for (let i = 0; i < 7; i++) {
      const fx = Math.floor(w * 0.55 + rnd() * w * 0.4);
      const fy = Math.floor(h * (0.2 + rnd() * 0.5));
      pc.hline(fx, fx + 2, fy, rim)
        .set(fx - 1, fy - 1, rim)
        .set(fx - 1, fy + 1, rim);
    }
  } else if (kind === "coral") {
    for (let x = 0; x < w; x++)
      pc.vline(x, h - 8 + Math.round(wave(x, w, [[3, 2, 0.4]])), h - 1, base);
    let x = 2;
    while (x < w - 4) {
      // branching coral
      const hh = 10 + Math.floor(rnd() * (h * 0.55));
      const t = topOf(pc, x);
      pc.vline(x, t - hh, t, base);
      for (let b = 0; b < 3; b++) {
        const by = t - Math.floor(hh * (0.3 + rnd() * 0.6));
        const dir = rnd() < 0.5 ? -1 : 1;
        const len = 3 + Math.floor(rnd() * 5);
        for (let k = 0; k < len; k++) pc.set(x + dir * k, by - Math.floor(k * 0.7), base);
        pc.set(x + dir * len, by - Math.floor(len * 0.7), detail);
      }
      pc.set(x, t - hh, detail);
      x += 4 + Math.floor(rnd() * 8);
    }
  } else if (kind === "seafloor") {
    for (let x = 0; x < w; x++) {
      const top =
        h * 0.62 +
        wave(x, w, [
          [2, 4, 0.7],
          [7, 1.5, 0.1],
        ]);
      pc.vline(x, Math.round(top), h - 1, base);
      pc.set(x, Math.round(top), rim);
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rnd() * w);
      pc.set(x, topOf(pc, x) - 1, detail);
    }
  } else if (kind === "kelp") {
    for (let x = 0; x < w; x++) pc.vline(x, 0, 2, base);
    let x = 1;
    while (x < w - 2) {
      const len = 12 + Math.floor(rnd() * (h - 16));
      for (let y = 2; y < len; y++) {
        const sx = x + Math.round(Math.sin(y * 0.3 + x) * 1.5);
        pc.set(sx, y, base);
        if (y % 6 === 3) pc.set(sx + 1, y, rim).set(sx + 2, y + 1, rim);
      }
      x += 4 + Math.floor(rnd() * 7);
    }
  } else if (kind === "surface") {
    // the underside of the floating ocean's surface, with light breaking through
    for (let x = 0; x < w; x++) {
      const d =
        6 +
        Math.round(
          wave(x, w, [
            [4, 2, 0],
            [9, 1, 0.6],
          ]),
        );
      pc.vline(x, 0, d, base);
      pc.set(x, d, rim);
      if (Math.sin((x / w) * TAU * 8) > 0.8) pc.set(x, d - 2, detail);
    }
  } else if (kind === "anemones") {
    for (let x = 0; x < w; x++)
      pc.vline(x, h - 5 + Math.round(wave(x, w, [[4, 1, 0.3]])), h - 1, base);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor((i + 0.5) * (w / 10));
      const t = topOf(pc, x);
      const hh = 4 + Math.floor(rnd() * 8);
      pc.rect(x - 1, t - hh, 3, hh, base);
      for (const dx of [-2, 0, 2])
        pc.vline(x + dx, t - hh - 3, t - hh, rim).set(x + dx, t - hh - 4, detail);
    }
  } else if (kind === "clockface") {
    // a giant shattered clock: rim, numerals as ticks, cracked hands
    for (let x = 0; x < w; x++) pc.vline(x, h - 3, h - 1, base);
    const cx = Math.floor(w * 0.38);
    const cy = Math.floor(h * 0.5);
    const R = Math.floor(h * 0.42);
    for (let y = cy - R - 1; y <= cy + R + 1; y++)
      for (let x = cx - R - 1; x <= cx + R + 1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= R && d > R - 3) pc.set(x, y, base);
      }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      pc.set(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6), detail);
    }
    pc.line(cx, cy, cx + Math.floor(R * 0.5), cy - Math.floor(R * 0.3), base);
    pc.line(cx, cy, cx - Math.floor(R * 0.2), cy - Math.floor(R * 0.7), base);
    // the crack: a missing wedge + floating fragments
    for (let k = 0; k < 6; k++) pc.set(cx + R - 2 + k * 2, cy + 4 + k * 3, rim);
    gear(pc, Math.floor(w * 0.8), Math.floor(h * 0.6), Math.floor(h * 0.16), 8, base, true);
  } else if (kind === "gears") {
    for (let x = 0; x < w; x++) pc.vline(x, h - 5, h - 1, base);
    gear(pc, Math.floor(w * 0.15), h - 18, 13, 10, base, true);
    gear(pc, Math.floor(w * 0.42), h - 30, 22, 12, base, true);
    gear(pc, Math.floor(w * 0.72), h - 14, 10, 8, base, true);
    gear(pc, Math.floor(w * 0.9), h - 36, 15, 10, base, true);
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * w);
      const t = topOf(pc, x);
      if (t < h - 1) pc.set(x, t, rim);
    }
  } else if (kind === "eclipse") {
    // the eclipse: a dark disc with a bright stepped corona, over a low skyline of ruins
    for (let x = 0; x < w; x++)
      pc.vline(x, h - 6 + Math.round(wave(x, w, [[3, 2, 0.5]])), h - 1, base);
    const cx = Math.floor(w * 0.6);
    const cy = Math.floor(h * 0.42);
    for (let y = 0; y < h; y++)
      for (let x = cx - 26; x <= cx + 26; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < 15) pc.set(x, y, base);
        else if (d < 17) pc.set(x, y, detail);
        else if (d < 21 && (x + y) % 2 === 0) pc.set(x, y, rim);
      }
  } else if (kind === "cogs") {
    // a strip of half-buried cog teeth along the edge
    for (let x = 0; x < w; x++) pc.vline(x, h - 6, h - 1, base);
    for (let i = 0; i < 6; i++)
      gear(pc, Math.floor((i + 0.5) * (w / 6)), h - 2, 7 + (i % 3) * 2, 8, base, false);
  } else if (kind === "towers") {
    // tall thin obelisks with lit tips
    for (let x = 0; x < w; x++) pc.vline(x, h - 4, h - 1, base);
    let x = 2;
    while (x < w - 4) {
      const tw = 3 + Math.floor(rnd() * 4);
      const th = Math.floor(h * (0.3 + rnd() * 0.6));
      pc.rect(x, h - th, tw, th, base);
      pc.poly(
        [
          [x - 1, h - th],
          [x + tw / 2, h - th - 5],
          [x + tw, h - th],
        ],
        base,
      );
      pc.vline(x, h - th, h - 1, rim);
      pc.set(Math.floor(x + tw / 2), h - th - 4, detail);
      x += tw + 3 + Math.floor(rnd() * 9);
    }
  }
  return pc;
}
