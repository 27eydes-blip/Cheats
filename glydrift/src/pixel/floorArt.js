// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Glowing floor liquids (one 32x8 tileable strip per biome): slime, lava, ice, data, blood.
// Sits behind the floor spikes so it glows between the teeth; scrolls with the world.
import { FLOOR } from "./colorShift.js";
import { addTexture, PixelCanvas, shade } from "./px.js";

function strip(kind, a, b) {
  const W = 32;
  const pc = new PixelCanvas(W, 8);
  const dark = shade(a, -0.45);
  for (let x = 0; x < W; x++) {
    // a wavy, tileable surface (period divides 32)
    const top = Math.round(1 + Math.sin((x / W) * Math.PI * 4) * 0.9);
    for (let y = top; y < 8; y++) pc.set(x, y, y >= 6 ? dark : a);
    pc.set(x, top, b);
  }
  const at = (pts, c) => {
    for (const [x, y] of pts) pc.set(x, y, c);
  };
  if (kind === "lava") {
    at(
      [
        [4, 4],
        [5, 4],
        [17, 5],
        [18, 5],
        [26, 3],
      ],
      0x8a1a00,
    );
    at(
      [
        [10, 3],
        [22, 4],
        [29, 5],
      ],
      0xfff1a0,
    );
  } else if (kind === "slime") {
    at(
      [
        [6, 3],
        [7, 4],
        [20, 3],
        [21, 3],
        [27, 5],
      ],
      b,
    );
    at(
      [
        [13, 5],
        [14, 5],
      ],
      dark,
    );
  } else if (kind === "ice") {
    for (const x of [3, 11, 19, 27]) pc.line(x, 2, x + 3, 6, 0xffffff);
    at(
      [
        [8, 3],
        [24, 4],
      ],
      0xffffff,
    );
  } else if (kind === "data") {
    for (let x = 0; x < W; x += 4) {
      pc.rect(x, 3, 2, 2, (x / 4) % 2 ? b : 0xffffff);
      pc.rect(x + 2, 5, 1, 1, dark);
    }
  } else if (kind === "meadow") {
    // clover + little flowers poking out of the grass
    for (const [x, c] of [
      [3, 0xff8ad0],
      [9, 0xfff4b0],
      [15, 0xffffff],
      [21, 0xff8ad0],
      [27, 0xb07aff],
    ]) {
      pc.set(x, 2, c)
        .set(x - 1, 3, c)
        .set(x + 1, 3, c)
        .set(x, 3, 0xfff4b0);
    }
    at(
      [
        [6, 5],
        [12, 4],
        [18, 5],
        [24, 4],
        [30, 5],
      ],
      dark,
    );
  } else if (kind === "surf") {
    // foam caps rolling along the water
    for (const x of [2, 10, 18, 26]) {
      pc.hline(x, x + 3, 2, 0xffffff);
      pc.set(x + 1, 3, b).set(x + 4, 3, b);
    }
    at(
      [
        [7, 5],
        [15, 6],
        [23, 5],
        [30, 6],
      ],
      0x1a3a5a,
    );
  } else if (kind === "glass") {
    // shards of glass catching rainbow light
    for (const [x, c] of [
      [3, 0xff9ad8],
      [10, 0x9ae8ff],
      [17, 0xfff09a],
      [24, 0xb0ffb0],
      [29, 0xffffff],
    ])
      pc.line(x, 2, x + 2, 5, c);
  } else if (kind === "reef") {
    for (const x of [2, 9, 15, 22, 28])
      pc.set(x, 2, b)
        .set(x, 3, b)
        .set(x + 1, 3, 0xff9ad0);
    at(
      [
        [6, 5],
        [19, 6],
        [26, 5],
      ],
      dark,
    );
  } else if (kind === "sand") {
    for (let x = 1; x < 32; x += 3) pc.set(x, 3 + (x % 2), b);
    at(
      [
        [5, 6],
        [13, 5],
        [21, 6],
        [29, 5],
      ],
      dark,
    );
  } else if (kind === "pool") {
    // a silvery violet surface with a mirrored glint
    pc.hline(0, 31, 3, shade(a, 0.4));
    for (const x of [4, 14, 24]) pc.hline(x, x + 4, 2, 0xffffff);
  } else if (kind === "blood") {
    at(
      [
        [5, 4],
        [15, 3],
        [16, 3],
        [25, 5],
      ],
      b,
    );
    at(
      [
        [9, 5],
        [21, 6],
      ],
      0x2a0006,
    );
  }
  return pc;
}

export function buildFloorStrips(scene) {
  for (const [id, f] of Object.entries(FLOOR))
    if (!scene.textures.exists(`floor_${id}`))
      addTexture(scene, `floor_${id}`, strip(f.kind, f.a, f.b));
}

/** "pxglow": a stepped (3-ring) pixel glow disc, white; tinted + additive at runtime. */
export function buildGlowDot(scene) {
  if (scene.textures.exists("pxglow")) return;
  const n = 12;
  const c = scene.textures.createCanvas("pxglow", n, n);
  const ctx = c.getContext();
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2);
      const a = d < 2.5 ? 0.6 : d < 4 ? 0.32 : d < 5.6 ? 0.14 : 0;
      if (!a) continue;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  c.refresh();
  c.setFilter(1); // NEAREST
}
