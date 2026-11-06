// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Smooth Canvas2D textures still used next to the pixel art: particle sprites (glow, dot,
// spark, smoke, flake, shard, star, ring), the screen vignette, the hero pedestal beam,
// the coin and two UI icons. Everything else is generated as pixel art in src/pixel/.
//  - `res` paints at a higher pixel density so HI-res sprites stay crisp on Retina.

/** Pixel density of crisp sprites (characters, coins, icons). Display them at scale / HI. */
export const HI = 3;

const shadowDesc = Object.getOwnPropertyDescriptor(
  CanvasRenderingContext2D.prototype,
  "shadowBlur",
);

function canvasTex(scene, key, w, h, draw, { res = 1 } = {}) {
  if (scene.textures.exists(key)) return; // the pixel-art set may already own this key
  const pw = Math.max(1, Math.round(w * res));
  const ph = Math.max(1, Math.round(h * res));
  const tex = scene.textures.createCanvas(key, pw, ph);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, pw, ph);
  // shadowBlur is in device pixels (ignores transforms): scale it with the density
  Object.defineProperty(ctx, "shadowBlur", {
    configurable: true,
    get: () => shadowDesc.get.call(ctx),
    set: (v) => shadowDesc.set.call(ctx, v * res),
  });
  ctx.save();
  ctx.scale(res, res);
  draw(ctx, w, h);
  ctx.restore();
  delete ctx.shadowBlur;
  tex.refresh();
}

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- particles & fx
function particleTextures(scene) {
  canvasTex(scene, "glow", 128, 128, (c) => {
    c.fillStyle = radial(c, 64, 64, 64, [
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,0.55)"],
      [0.6, "rgba(255,255,255,0.12)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    c.fillRect(0, 0, 128, 128);
  });
  canvasTex(scene, "dot", 32, 32, (c) => {
    c.fillStyle = radial(c, 16, 16, 16, [
      [0, "rgba(255,255,255,1)"],
      [0.35, "rgba(255,255,255,0.8)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    c.fillRect(0, 0, 32, 32);
  });
  canvasTex(scene, "spark", 48, 10, (c) => {
    const g = c.createLinearGradient(0, 0, 48, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    c.fillStyle = g;
    c.shadowColor = "#fff";
    c.shadowBlur = 4;
    c.fillRect(2, 3, 44, 4);
  });
  canvasTex(scene, "pixel", 12, 12, (c) => {
    c.fillStyle = "#fff";
    c.fillRect(1, 1, 10, 10);
  });
  canvasTex(scene, "smoke", 64, 64, (c) => {
    const rnd = seeded(7);
    for (let i = 0; i < 7; i++) {
      const x = 20 + rnd() * 24;
      const y = 20 + rnd() * 24;
      const r = 14 + rnd() * 12;
      c.fillStyle = radial(c, x, y, r, [
        [0, "rgba(255,255,255,0.45)"],
        [1, "rgba(255,255,255,0)"],
      ]);
      c.fillRect(0, 0, 64, 64);
    }
  });
  canvasTex(scene, "flake", 32, 32, (c) => {
    c.translate(16, 16);
    c.strokeStyle = "#fff";
    c.lineWidth = 2;
    c.shadowColor = "#bff";
    c.shadowBlur = 5;
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -12);
      c.moveTo(0, -7);
      c.lineTo(-4, -10);
      c.moveTo(0, -7);
      c.lineTo(4, -10);
      c.stroke();
    }
  });
  canvasTex(scene, "shard", 28, 28, (c) => {
    c.shadowColor = "#fff";
    c.shadowBlur = 6;
    c.fillStyle = "#fff";
    poly(c, [
      [14, 3],
      [24, 22],
      [6, 18],
    ]);
    c.fill();
  });
  canvasTex(scene, "star4", 48, 48, (c) => {
    c.translate(24, 24);
    c.shadowColor = "#fff";
    c.shadowBlur = 8;
    c.fillStyle = "#fff";
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 20 : 4;
      const a = (i / 8) * Math.PI * 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  });
  canvasTex(scene, "ring", 256, 256, (c) => {
    c.strokeStyle = "#fff";
    c.shadowColor = "#fff";
    c.shadowBlur = 18;
    c.lineWidth = 8;
    c.beginPath();
    c.arc(128, 128, 104, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3;
    c.stroke();
  });
  canvasTex(scene, "vignette", 128, 128, (c) => {
    c.fillStyle = radial(c, 64, 64, 92, [
      [0, "rgba(0,0,0,0)"],
      [0.55, "rgba(0,0,0,0)"],
      [0.8, "rgba(0,0,0,0.45)"],
      [1, "rgba(0,0,0,0.9)"],
    ]);
    c.fillRect(0, 0, 128, 128);
  });
}

// ---------------------------------------------------------------- pedestal beam + coin
function spriteTextures(scene) {
  canvasTex(scene, "beam", 48, 16, (c) => {
    const g = c.createLinearGradient(0, 0, 48, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.3, "rgba(255,255,255,0.35)");
    g.addColorStop(0.45, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,1)");
    g.addColorStop(0.7, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 16);
  });

  canvasTex(
    scene,
    "coin",
    56,
    56,
    (c) => {
      c.translate(28, 28);
      c.shadowColor = "#ffd23f";
      c.shadowBlur = 12;
      const g = c.createLinearGradient(-16, -18, 16, 18);
      g.addColorStop(0, "#fff7c2");
      g.addColorStop(0.5, "#ffcf3a");
      g.addColorStop(1, "#ff8a00");
      c.fillStyle = g;
      poly(c, [
        [0, -19],
        [15, 0],
        [0, 19],
        [-15, 0],
      ]);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "rgba(255,255,255,0.9)";
      poly(c, [
        [0, -12],
        [7, 0],
        [0, -2],
        [-7, 0],
      ]);
      c.fill();
    },
    { res: HI },
  );
}

// ---------------------------------------------------------------- background

// ---------------------------------------------------------------- characters

// ---------------------------------------------------------------- ui
function uiTextures(scene) {
  canvasTex(
    scene,
    "lock",
    48,
    48,
    (c) => {
      c.translate(24, 24);
      c.strokeStyle = "#fff";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(0, -6, 9, Math.PI, 0);
      c.stroke();
      c.fillStyle = "#fff";
      roundRect(c, -13, -6, 26, 20, 4);
      c.fill();
      c.fillStyle = "#000";
      c.fillRect(-2, 0, 4, 8);
    },
    { res: HI },
  );
  canvasTex(
    scene,
    "shardIcon",
    40,
    40,
    (c) => {
      c.translate(20, 20);
      c.shadowColor = "#3fa9ff";
      c.shadowBlur = 8;
      const g = c.createLinearGradient(-10, -16, 10, 16);
      g.addColorStop(0, "#e6f6ff");
      g.addColorStop(1, "#3fa9ff");
      c.fillStyle = g;
      poly(c, [
        [0, -16],
        [10, -2],
        [4, 16],
        [-6, 12],
        [-10, -4],
      ]);
      c.fill();
    },
    { res: HI },
  );
}

export function buildTextures(scene) {
  particleTextures(scene);
  spriteTextures(scene);
  uiTextures(scene);
}
