// Procedural texture factory. Every visual in Glydrift is painted at boot with Canvas2D,
// so the game ships with zero image assets.
//  - `res`  paints at a higher (or lower) pixel density: HI-res sprites stay crisp on Retina,
//           low-res scenery (res < 1) is upscaled for a soft, out-of-focus look.
//  - `rim`  draws a bright outline + glow around the silhouette (characters), so even dark
//           heroes like Shade read on any background.

/** Pixel density of crisp sprites (characters, coins, icons). Display them at scale / HI. */
export const HI = 3;
/** Pixel density of blurred background scenery. */
export const LO = 0.35;

const shadowDesc = Object.getOwnPropertyDescriptor(
  CanvasRenderingContext2D.prototype,
  "shadowBlur",
);

function canvasTex(scene, key, w, h, draw, { res = 1, rim = null, rimWidth = 2.6 } = {}) {
  if (scene.textures.exists(key)) return;
  const pw = Math.max(1, Math.round(w * res));
  const ph = Math.max(1, Math.round(h * res));
  const tex = scene.textures.createCanvas(key, pw, ph);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, pw, ph);
  // shadowBlur is in device pixels (ignores transforms): scale it with the density,
  // and suppress it entirely for rimmed sprites (the rim provides a clean glow instead)
  Object.defineProperty(ctx, "shadowBlur", {
    configurable: true,
    get: () => shadowDesc.get.call(ctx),
    set: (v) => shadowDesc.set.call(ctx, rim ? 0 : v * res),
  });
  ctx.save();
  ctx.scale(res, res);
  draw(ctx, w, h);
  ctx.restore();
  delete ctx.shadowBlur;
  if (rim) {
    const body = document.createElement("canvas");
    body.width = pw;
    body.height = ph;
    body.getContext("2d").drawImage(tex.getSourceImage(), 0, 0);
    // dilate the silhouette into a solid rim
    const m = document.createElement("canvas");
    m.width = pw;
    m.height = ph;
    const mc = m.getContext("2d");
    const r = rimWidth * res;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      mc.drawImage(body, Math.cos(a) * r, Math.sin(a) * r);
    }
    mc.globalCompositeOperation = "source-in";
    mc.fillStyle = rim;
    mc.fillRect(0, 0, pw, ph);
    ctx.clearRect(0, 0, pw, ph);
    ctx.shadowColor = rim;
    shadowDesc.set.call(ctx, 14 * res);
    ctx.drawImage(m, 0, 0);
    shadowDesc.set.call(ctx, 0);
    ctx.drawImage(m, 0, 0);
    ctx.drawImage(body, 0, 0);
  }
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
  canvasTex(scene, "streak", 256, 6, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.8, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 1, 256, 4);
  });
  canvasTex(scene, "ash", 14, 14, (c) => {
    c.fillStyle = "#fff";
    poly(c, [
      [2, 5],
      [9, 1],
      [13, 8],
      [6, 13],
    ]);
    c.fill();
  });
}

// ---------------------------------------------------------------- obstacles
function obstacleTextures(scene) {
  canvasTex(scene, "saw", 150, 150, (c) => {
    c.translate(75, 75);
    const teeth = 14;
    c.shadowColor = "#fff";
    c.shadowBlur = 14;
    c.fillStyle = "#e9eef5";
    c.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 62 : 48;
      const a2 = a + (i % 2 === 0 ? 0.12 : 0);
      c.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
    }
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = radial(c, -10, -10, 60, [
      [0, "#ffffff"],
      [0.5, "#8892a0"],
      [1, "#3a4250"],
    ]);
    c.beginPath();
    c.arc(0, 0, 46, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.arc(0, 0, 30, a, a + 0.6);
      c.stroke();
    }
    c.fillStyle = "#fff";
    c.shadowColor = "#fff";
    c.shadowBlur = 10;
    c.beginPath();
    c.arc(0, 0, 9, 0, Math.PI * 2);
    c.fill();
  });

  canvasTex(scene, "blade", 132, 132, (c) => {
    c.translate(66, 66);
    c.shadowColor = "#fff";
    c.shadowBlur = 14;
    // double crescent axe
    for (const s of [1, -1]) {
      c.fillStyle = "#dfe6ef";
      c.beginPath();
      c.moveTo(0, -10 * s);
      c.quadraticCurveTo(50, -40 * s, 56, 0);
      c.quadraticCurveTo(50, 40 * s, 0, 10 * s);
      c.quadraticCurveTo(26, 0, 0, -10 * s);
      c.fill();
      c.beginPath();
      c.moveTo(0, -10 * s);
      c.quadraticCurveTo(-50, -40 * s, -56, 0);
      c.quadraticCurveTo(-50, 40 * s, 0, 10 * s);
      c.quadraticCurveTo(-26, 0, 0, -10 * s);
      c.fill();
    }
    c.shadowBlur = 0;
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 50, -0.6, 0.6);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 50, Math.PI - 0.6, Math.PI + 0.6);
    c.stroke();
    c.fillStyle = radial(c, 0, 0, 18, [
      [0, "#ffffff"],
      [1, "#6b7480"],
    ]);
    c.beginPath();
    c.arc(0, 0, 16, 0, Math.PI * 2);
    c.fill();
  });

  canvasTex(scene, "chain", 16, 28, (c) => {
    c.strokeStyle = "#d9e2ee";
    c.lineWidth = 3;
    c.shadowColor = "#fff";
    c.shadowBlur = 4;
    roundRect(c, 4, 2, 8, 16, 4);
    c.stroke();
    c.fillStyle = "#d9e2ee";
    c.fillRect(7, 18, 2, 10);
  });

  canvasTex(scene, "crusher", 128, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, "#1a1f2b");
    g.addColorStop(0.5, "#3b4456");
    g.addColorStop(1, "#141821");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = "rgba(255,255,255,0.22)";
    c.lineWidth = 2;
    for (let y = 0; y < 128; y += 32) {
      c.beginPath();
      c.moveTo(0, y + 0.5);
      c.lineTo(128, y + 0.5);
      c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,0.35)";
    for (let y = 16; y < 128; y += 32) {
      c.beginPath();
      c.arc(14, y, 3, 0, 7);
      c.arc(114, y, 3, 0, 7);
      c.fill();
    }
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillRect(0, 0, 4, 128);
    c.fillRect(124, 0, 4, 128);
  });

  canvasTex(scene, "face", 140, 36, (c) => {
    c.shadowColor = "#fff";
    c.shadowBlur = 12;
    c.fillStyle = "#ffffff";
    roundRect(c, 8, 10, 124, 16, 6);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "rgba(0,0,0,0.55)";
    for (let x = 14; x < 130; x += 18) {
      poly(c, [
        [x, 12],
        [x + 9, 12],
        [x + 3, 24],
        [x - 6, 24],
      ]);
      c.fill();
    }
  });

  canvasTex(scene, "pillar", 64, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.15, "rgba(255,255,255,0.25)");
    g.addColorStop(0.5, "rgba(255,255,255,0.1)");
    g.addColorStop(0.85, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0.95)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(58, 32);
    c.lineTo(6, 64);
    c.stroke();
  });

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

  canvasTex(scene, "emitter", 64, 64, (c) => {
    c.translate(32, 32);
    c.shadowColor = "#fff";
    c.shadowBlur = 10;
    c.fillStyle = "#2a3140";
    c.strokeStyle = "#ffffff";
    c.lineWidth = 3;
    poly(c, [
      [0, -24],
      [21, -12],
      [21, 12],
      [0, 24],
      [-21, 12],
      [-21, -12],
    ]);
    c.fill();
    c.stroke();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(0, 0, 8, 0, 7);
    c.fill();
  });

  canvasTex(scene, "portal", 150, 280, (c) => {
    c.translate(75, 140);
    c.shadowColor = "#fff";
    c.shadowBlur = 20;
    c.strokeStyle = "#fff";
    for (const [w, a] of [
      [10, 0.9],
      [4, 1],
    ]) {
      c.lineWidth = w;
      c.globalAlpha = a;
      c.beginPath();
      c.ellipse(0, 0, 46, 116, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.fillStyle = radial(c, 0, 0, 110, [
      [0, "rgba(255,255,255,0.35)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    c.beginPath();
    c.ellipse(0, 0, 44, 114, 0, 0, Math.PI * 2);
    c.fill();
  });

  canvasTex(scene, "arrow", 48, 48, (c) => {
    c.translate(24, 24);
    c.shadowColor = "#fff";
    c.shadowBlur = 6;
    c.fillStyle = "#fff";
    poly(c, [
      [0, -18],
      [16, 2],
      [6, 2],
      [6, 18],
      [-6, 18],
      [-6, 2],
      [-16, 2],
    ]);
    c.fill();
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
function backgroundTextures(scene) {
  canvasTex(scene, "stars", 512, 512, (c) => {
    const rnd = seeded(42);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const r = rnd() < 0.92 ? rnd() * 1.2 + 0.4 : rnd() * 2 + 1.5;
      c.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.65})`;
      if (r > 1.6) {
        c.shadowColor = "#fff";
        c.shadowBlur = 6;
      } else c.shadowBlur = 0;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  });
  canvasTex(scene, "dust", 512, 512, (c) => {
    const rnd = seeded(99);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const r = 30 + rnd() * 90;
      const a = 0.05 + rnd() * 0.08;
      // draw wrapped copies so the tile repeats without seams
      for (const ox of [-512, 0, 512]) {
        for (const oy of [-512, 0, 512]) {
          c.fillStyle = radial(c, x + ox, y + oy, r, [
            [0, `rgba(255,255,255,${a})`],
            [1, "rgba(255,255,255,0)"],
          ]);
          c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
  });

  // Planets: greyscale shaded spheres; tinted per biome at runtime.
  const planetStyles = [
    { bands: 6, ring: false, crater: true },
    { bands: 10, ring: true, crater: false },
    { bands: 3, ring: false, crater: false },
  ];
  planetStyles.forEach((st, idx) => {
    canvasTex(
      scene,
      `planet${idx}`,
      320,
      320,
      (c) => {
        const rnd = seeded(13 + idx * 31);
        c.translate(160, 160);
        const R = 100;
        c.save();
        c.beginPath();
        c.arc(0, 0, R, 0, Math.PI * 2);
        c.clip();
        c.fillStyle = "#cfd6e6";
        c.fillRect(-R, -R, R * 2, R * 2);
        for (let i = 0; i < st.bands; i++) {
          c.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "60,70,90"},${0.15 + rnd() * 0.25})`;
          const y = -R + (i / st.bands) * R * 2 + rnd() * 10;
          c.beginPath();
          c.ellipse(0, y, R * 1.4, 4 + rnd() * 14, 0.15, 0, Math.PI * 2);
          c.fill();
        }
        if (st.crater) {
          for (let i = 0; i < 9; i++) {
            c.fillStyle = "rgba(40,50,70,0.35)";
            c.beginPath();
            c.arc((rnd() - 0.5) * R * 1.6, (rnd() - 0.5) * R * 1.6, 4 + rnd() * 14, 0, 7);
            c.fill();
          }
        }
        // terminator shading
        c.fillStyle = radial(c, -R * 0.45, -R * 0.45, R * 2, [
          [0, "rgba(0,0,0,0)"],
          [0.5, "rgba(0,0,0,0.3)"],
          [1, "rgba(0,0,0,0.92)"],
        ]);
        c.fillRect(-R, -R, R * 2, R * 2);
        c.restore();
        // atmosphere rim
        c.strokeStyle = "rgba(255,255,255,0.7)";
        c.shadowColor = "#fff";
        c.shadowBlur = 24;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(0, 0, R + 1, Math.PI * 0.8, Math.PI * 1.75);
        c.stroke();
        if (st.ring) {
          c.shadowBlur = 8;
          c.strokeStyle = "rgba(255,255,255,0.55)";
          c.lineWidth = 6;
          c.beginPath();
          c.ellipse(0, 0, R * 1.5, R * 0.32, -0.35, 0.05, Math.PI - 0.05);
          c.stroke();
        }
      },
      { res: LO },
    );
  });

  // Floating crystal islands: dark rock + bright crystals (tint colours the crystals).
  for (let idx = 0; idx < 3; idx++) {
    canvasTex(
      scene,
      `island${idx}`,
      360,
      260,
      (c) => {
        const rnd = seeded(77 + idx * 17);
        const cx = 180;
        const top = 120;
        const w = 220 + idx * 30;
        // rock
        const rock = [];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          rock.push([cx - w / 2 + t * w, top + (rnd() - 0.5) * 8]);
        }
        for (let i = steps; i >= 0; i--) {
          const t = i / steps;
          const depth = Math.sin(t * Math.PI) * (90 + rnd() * 20);
          rock.push([cx - w / 2 + t * w + (rnd() - 0.5) * 16, top + 10 + depth]);
        }
        const rg = c.createLinearGradient(0, top, 0, top + 120);
        rg.addColorStop(0, "#3a3f55");
        rg.addColorStop(1, "#07080e");
        c.fillStyle = rg;
        poly(c, rock);
        c.fill();
        c.strokeStyle = "rgba(255,255,255,0.5)";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(rock[0][0], rock[0][1]);
        for (let i = 1; i <= steps; i++) c.lineTo(rock[i][0], rock[i][1]);
        c.stroke();
        // crystals
        const n = 5 + idx * 2;
        for (let i = 0; i < n; i++) {
          const x = cx - w / 2 + 20 + rnd() * (w - 40);
          const h = 26 + rnd() * 70;
          const bw = 7 + rnd() * 10;
          const lean = (rnd() - 0.5) * 14;
          c.shadowColor = "#fff";
          c.shadowBlur = 18;
          const cg = c.createLinearGradient(x, top - h, x, top);
          cg.addColorStop(0, "rgba(255,255,255,1)");
          cg.addColorStop(1, "rgba(255,255,255,0.35)");
          c.fillStyle = cg;
          poly(c, [
            [x - bw, top + 4],
            [x - bw * 0.7 + lean, top - h * 0.7],
            [x + lean, top - h],
            [x + bw * 0.7 + lean, top - h * 0.7],
            [x + bw, top + 4],
          ]);
          c.fill();
        }
        c.shadowBlur = 0;
        // hanging glow drips
        for (let i = 0; i < 4; i++) {
          const x = cx - w / 3 + rnd() * (w * 0.66);
          c.fillStyle = "rgba(255,255,255,0.7)";
          c.beginPath();
          c.arc(x, top + 70 + rnd() * 40, 2 + rnd() * 2, 0, 7);
          c.fill();
        }
      },
      { res: LO },
    );
  }
}

// ---------------------------------------------------------------- characters
function characterTextures(scene) {
  // VOLT — electric storm bird, 3 wing frames (up / mid / down)
  const voltWings = [-0.95, -0.15, 0.6];
  voltWings.forEach((wa, f) => {
    canvasTex(
      scene,
      `char_volt_${f}`,
      128,
      128,
      (c) => {
        c.translate(62, 68);
        // lightning-bolt tail feathers
        c.fillStyle = "#0e8fb8";
        poly(c, [
          [-18, 0],
          [-40, -12],
          [-34, -4],
          [-54, -6],
          [-36, 6],
          [-46, 12],
          [-18, 9],
        ]);
        c.fill();
        c.strokeStyle = "#bdfaff";
        c.lineWidth = 2;
        c.stroke();
        // far wing (behind the body, darker)
        c.save();
        c.rotate(wa * 0.75);
        c.fillStyle = "#075673";
        c.beginPath();
        c.moveTo(-4, -2);
        c.quadraticCurveTo(-24, -40, 8, -50);
        c.lineTo(4, -36);
        c.lineTo(14, -40);
        c.lineTo(10, -26);
        c.lineTo(18, -24);
        c.quadraticCurveTo(12, -8, 12, -2);
        c.closePath();
        c.fill();
        c.restore();
        // body
        const bg = c.createLinearGradient(-20, -16, 24, 18);
        bg.addColorStop(0, "#5fe9ff");
        bg.addColorStop(0.45, "#0fa6d6");
        bg.addColorStop(1, "#064a78");
        c.fillStyle = bg;
        c.beginPath();
        c.ellipse(2, 3, 25, 15, -0.12, 0, Math.PI * 2);
        c.fill();
        // belly highlight
        c.fillStyle = "rgba(190,250,255,0.4)";
        c.beginPath();
        c.ellipse(6, 9, 15, 6, -0.1, 0, Math.PI * 2);
        c.fill();
        // head
        c.fillStyle = "#14b4e4";
        c.beginPath();
        c.arc(24, -8, 12.5, 0, Math.PI * 2);
        c.fill();
        // jagged lightning crest
        c.fillStyle = "#ffffff";
        poly(c, [
          [17, -18],
          [12, -34],
          [20, -24],
          [22, -38],
          [27, -21],
          [24, -18],
        ]);
        c.fill();
        // beak
        c.fillStyle = "#ffd23f";
        poly(c, [
          [34, -12],
          [50, -6],
          [34, -2],
        ]);
        c.fill();
        // eye
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(28, -10, 4.8, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#04263a";
        c.beginPath();
        c.arc(29.5, -10, 2.4, 0, Math.PI * 2);
        c.fill();
        // near wing with feather notches + bolt highlight
        c.save();
        c.rotate(wa);
        const wg = c.createLinearGradient(0, 0, 0, -56);
        wg.addColorStop(0, "#0b8cc4");
        wg.addColorStop(1, "#5ef0ff");
        c.fillStyle = wg;
        c.beginPath();
        c.moveTo(-6, 0);
        c.quadraticCurveTo(-30, -42, 6, -58);
        c.lineTo(4, -44);
        c.lineTo(16, -48);
        c.lineTo(12, -33);
        c.lineTo(24, -32);
        c.lineTo(16, -19);
        c.quadraticCurveTo(12, -6, 14, 0);
        c.closePath();
        c.fill();
        c.strokeStyle = "#aef8ff";
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = "#ffffff";
        poly(c, [
          [2, -40],
          [-6, -24],
          [0, -24],
          [-4, -12],
          [6, -28],
          [0, -28],
        ]);
        c.fill();
        c.restore();
      },
      { res: HI, rim: "#8ff4ff", rimWidth: 2.2 },
    );
  });

  // EMBER — phoenix, 3 wing frames
  const wingAngles = [-0.9, -0.1, 0.65];
  wingAngles.forEach((wa, f) => {
    canvasTex(
      scene,
      `char_ember_${f}`,
      128,
      128,
      (c) => {
        c.translate(60, 66);
        c.shadowColor = "#ff7a1a";
        c.shadowBlur = 20;
        // tail flames
        for (let i = 0; i < 3; i++) {
          const tg = c.createLinearGradient(-50, 0, -10, 0);
          tg.addColorStop(0, "rgba(255,40,0,0)");
          tg.addColorStop(1, "#ffb02e");
          c.fillStyle = tg;
          c.beginPath();
          c.moveTo(-8, 2);
          c.quadraticCurveTo(-34, -14 + i * 14, -54, -10 + i * 14);
          c.quadraticCurveTo(-30, 0 + i * 6, -8, 10);
          c.fill();
        }
        // back wing
        c.save();
        c.rotate(wa * 0.8);
        const wg2 = c.createLinearGradient(0, 0, 0, -50);
        wg2.addColorStop(0, "#c2410c");
        wg2.addColorStop(1, "#ffcf3a");
        c.fillStyle = wg2;
        c.globalAlpha = 0.75;
        c.beginPath();
        c.moveTo(-6, -2);
        c.quadraticCurveTo(-30, -46, 6, -54);
        c.quadraticCurveTo(0, -30, 14, -6);
        c.fill();
        c.restore();
        // body
        const bg = c.createRadialGradient(6, -4, 2, 0, 0, 30);
        bg.addColorStop(0, "#fff1a8");
        bg.addColorStop(0.45, "#ff9a1f");
        bg.addColorStop(1, "#d22a00");
        c.fillStyle = bg;
        c.beginPath();
        c.ellipse(4, 2, 24, 17, -0.1, 0, Math.PI * 2);
        c.fill();
        // head
        c.beginPath();
        c.arc(26, -10, 12, 0, Math.PI * 2);
        c.fill();
        // crest
        c.fillStyle = "#ffd23f";
        poly(c, [
          [20, -20],
          [14, -36],
          [26, -22],
          [28, -40],
          [32, -20],
        ]);
        c.fill();
        // beak
        c.fillStyle = "#fff4c2";
        poly(c, [
          [36, -12],
          [50, -7],
          [36, -4],
        ]);
        c.fill();
        // eye
        c.shadowBlur = 0;
        c.fillStyle = "#2a0500";
        c.beginPath();
        c.arc(30, -12, 3, 0, 7);
        c.fill();
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(31, -13, 1.2, 0, 7);
        c.fill();
        // front wing
        c.save();
        c.shadowColor = "#ffcf3a";
        c.shadowBlur = 16;
        c.rotate(wa);
        const wg = c.createLinearGradient(0, 0, 0, -56);
        wg.addColorStop(0, "#ff5a00");
        wg.addColorStop(1, "#fff1a8");
        c.fillStyle = wg;
        c.beginPath();
        c.moveTo(-2, 0);
        c.quadraticCurveTo(-26, -40, 12, -58);
        c.quadraticCurveTo(4, -40, 24, -26);
        c.quadraticCurveTo(10, -22, 18, -4);
        c.fill();
        c.restore();
      },
      { res: HI, rim: "#ffe9a8" },
    );
  });

  // SHADE — shadow ninja
  canvasTex(
    scene,
    "char_shade",
    128,
    128,
    (c) => {
      c.translate(64, 64);
      c.shadowColor = "#a45cff";
      c.shadowBlur = 24;
      const bg = c.createRadialGradient(-8, -10, 4, 0, 0, 34);
      bg.addColorStop(0, "#3b2160");
      bg.addColorStop(1, "#08020f");
      c.fillStyle = bg;
      c.beginPath();
      c.arc(0, 0, 30, 0, Math.PI * 2);
      c.fill();
      // headband
      c.shadowBlur = 12;
      c.fillStyle = "#b45cff";
      c.fillRect(-30, -12, 60, 9);
      // tails
      c.beginPath();
      c.moveTo(-28, -10);
      c.quadraticCurveTo(-46, -20, -58, -8);
      c.quadraticCurveTo(-46, -12, -30, -4);
      c.fill();
      c.beginPath();
      c.moveTo(-28, -8);
      c.quadraticCurveTo(-44, 2, -56, 12);
      c.quadraticCurveTo(-42, -2, -30, -2);
      c.fill();
      // eye slit
      c.fillStyle = "#14051f";
      c.fillRect(-6, 2, 34, 11);
      c.fillStyle = "#f2e6ff";
      c.shadowColor = "#e0b8ff";
      c.shadowBlur = 14;
      poly(c, [
        [2, 6],
        [12, 5],
        [12, 10],
      ]);
      c.fill();
      poly(c, [
        [16, 5],
        [26, 6],
        [16, 10],
      ]);
      c.fill();
    },
    { res: HI, rim: "#e6c8ff" },
  );

  // FROST — ice crystal
  canvasTex(
    scene,
    "char_frost",
    128,
    128,
    (c) => {
      c.translate(64, 64);
      c.shadowColor = "#9ff2ff";
      c.shadowBlur = 24;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(a) * 34, Math.sin(a) * 38]);
      }
      const g = c.createLinearGradient(-30, -36, 30, 36);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, "#9fe8ff");
      g.addColorStop(1, "#2a7bd6");
      c.fillStyle = g;
      poly(c, pts);
      c.fill();
      c.shadowBlur = 0;
      // facets
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = 2;
      for (const p of pts) {
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(p[0], p[1]);
        c.stroke();
      }
      c.fillStyle = "rgba(255,255,255,0.35)";
      poly(c, [[0, 0], pts[5], pts[0]]);
      c.fill();
      c.fillStyle = "rgba(10,40,90,0.3)";
      poly(c, [[0, 0], pts[2], pts[3]]);
      c.fill();
      c.strokeStyle = "#ffffff";
      c.shadowColor = "#fff";
      c.shadowBlur = 8;
      c.lineWidth = 3;
      poly(c, pts);
      c.stroke();
      // eyes
      c.fillStyle = "#06305e";
      c.shadowBlur = 0;
      c.fillRect(4, -6, 6, 9);
      c.fillRect(16, -6, 6, 9);
    },
    { res: HI, rim: "#ffffff" },
  );

  // GLITCH — pixel creature (2 frames: clean + glitched)
  const sprite = [
    "..XXXXXX..",
    ".XXXXXXXX.",
    "XXXXXXXXXX",
    "XX..XX..XX",
    "XX.oXX.oXX",
    "XXXXXXXXXX",
    "XXX.XX.XXX",
    ".XXXXXXXX.",
    ".X.X..X.X.",
    "X.X....X.X",
  ];
  for (let f = 0; f < 2; f++) {
    canvasTex(
      scene,
      `char_glitch_${f}`,
      128,
      128,
      (c) => {
        const px = 8;
        const ox = 24;
        const oy = 24;
        const draw = (color, dx, dy) => {
          c.fillStyle = color;
          sprite.forEach((row, y) => {
            [...row].forEach((ch, x) => {
              if (ch === "X") c.fillRect(ox + x * px + dx, oy + y * px + dy, px, px);
            });
          });
        };
        c.globalCompositeOperation = "lighter";
        if (f === 1) {
          draw("rgba(255,0,80,0.9)", -5, 0);
          draw("rgba(0,200,255,0.9)", 5, 2);
        } else {
          draw("rgba(255,0,120,0.45)", -2, 0);
          draw("rgba(0,220,255,0.45)", 2, 0);
        }
        c.globalCompositeOperation = "source-over";
        c.shadowColor = "#39ff88";
        c.shadowBlur = 16;
        draw("#39ff88", 0, 0);
        c.shadowBlur = 0;
        c.fillStyle = "#eafff2";
        sprite.forEach((row, y) => {
          [...row].forEach((ch, x) => {
            if (ch === "o") c.fillRect(ox + x * px, oy + y * px, px, px);
          });
        });
        if (f === 1) {
          c.clearRect(0, 52, 128, 6);
          c.fillStyle = "rgba(57,255,136,0.9)";
          c.fillRect(30, 52, 80, 3);
        }
      },
      { res: HI, rim: "#c8ffe0" },
    );
  }

  // NOVA — living star
  canvasTex(
    scene,
    "char_nova",
    128,
    128,
    (c) => {
      c.translate(64, 64);
      c.fillStyle = radial(c, 0, 0, 62, [
        [0, "rgba(255,255,255,1)"],
        [0.25, "rgba(255,244,190,0.95)"],
        [0.45, "rgba(255,190,90,0.45)"],
        [1, "rgba(255,120,200,0)"],
      ]);
      c.fillRect(-64, -64, 128, 128);
      c.shadowColor = "#fff6c8";
      c.shadowBlur = 16;
      c.fillStyle = "#fffdf0";
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? 34 : 18;
        const a = (i / 16) * Math.PI * 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(0, 0, 16, 0, 7);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "#6a3a00";
      c.beginPath();
      c.arc(5, -3, 2.5, 0, 7);
      c.arc(12, -3, 2.5, 0, 7);
      c.fill();
    },
    { res: HI, rim: "#fff6c8" },
  );
  canvasTex(
    scene,
    "nova_ring",
    160,
    160,
    (c) => {
      c.translate(80, 80);
      c.shadowColor = "#fff";
      c.shadowBlur = 10;
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 64, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(64, 0, 5, 0, 7);
      c.fill();
    },
    { res: HI },
  );
}

// ---------------------------------------------------------------- ui
function uiTextures(scene) {
  canvasTex(scene, "badge", 120, 120, (c) => {
    c.translate(60, 60);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      pts.push([Math.cos(a) * 50, Math.sin(a) * 50]);
    }
    c.shadowColor = "#fff";
    c.shadowBlur = 14;
    c.fillStyle = "rgba(255,255,255,0.12)";
    poly(c, pts);
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = 4;
    c.stroke();
  });
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
  obstacleTextures(scene);
  backgroundTextures(scene);
  characterTextures(scene);
  uiTextures(scene);
}
