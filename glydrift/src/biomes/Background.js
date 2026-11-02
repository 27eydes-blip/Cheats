// Background atmosphere (lives in the Backdrop scene, never bloomed):
//  0 dark shader sky (gradient + very faint nebula)
//  1 style layer: "grid" (Tron floor/ceiling), "space" (stars only) or "horizon" (synthwave sun)
//  2 star field   3 one dark, blurred planet + one island silhouette in the edge bands
//  4 faint near-field biome particles + speed lines   5 vignette, heartbeat, dim overlay
// Rule: the background is subtle and dark — gameplay elements are always brighter.
import Phaser from "phaser";
import { VIEW } from "../config.js";
import { SKY_KEY } from "../scenes/SkyScene.js";
import { lerpColor } from "./biomes.js";

const ADD = Phaser.BlendModes.ADD;

export const BG_STYLES = ["grid", "space", "horizon"];

export function heartbeat(t) {
  const p = t % 1.05;
  return Math.exp(-((p - 0.05) ** 2) * 600) + 0.65 * Math.exp(-((p - 0.27) ** 2) * 600);
}

const PARTICLES = {
  mote: {
    tex: "dot",
    rate: 14,
    scale: [0.08, 0.22],
    alpha: [0.12, 0.35],
    vy: [-20, 20],
    fx: [0.5, 1.3],
  },
  ember: {
    tex: "dot",
    rate: 18,
    scale: [0.06, 0.2],
    alpha: [0.25, 0.5],
    vy: [-140, -40],
    fx: [0.6, 1.1],
  },
  flake: {
    tex: "flake",
    rate: 16,
    scale: [0.15, 0.35],
    alpha: [0.15, 0.4],
    vy: [40, 130],
    fx: [0.6, 1.2],
  },
  pixel: {
    tex: "pixel",
    rate: 14,
    scale: [0.3, 0.7],
    alpha: [0.15, 0.4],
    vy: [-10, 10],
    fx: [0.8, 1.6],
  },
  ash: {
    tex: "ash",
    rate: 14,
    scale: [0.35, 0.7],
    alpha: [0.15, 0.4],
    vy: [-40, 30],
    fx: [0.5, 1.1],
  },
};

const darken = (c, k) => lerpColor(0x000000, c, k);

export class Background {
  constructor(scene, { lowGfx = false, style = "grid" } = {}) {
    this.scene = scene;
    this.lowGfx = lowGfx;
    this.style = BG_STYLES.includes(style) ? style : "grid";
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.time = 0;
    this.scrollAcc = 0;
    this.beat = 0;

    // 0: sky (rendered by the Sky scene into a small texture, upscaled = naturally soft)
    this.skyScene = scene.scene.get("Sky");
    this.sky = scene.add
      .image(W / 2, H / 2, SKY_KEY)
      .setDisplaySize(W + 8, H + 8)
      .setDepth(-100);

    // 2: stars (faint)
    this.stars = scene.add
      .tileSprite(W / 2, H / 2, W, H, "stars")
      .setDepth(-95)
      .setAlpha(0.45);
    this.stars.tileScaleX = this.stars.tileScaleY = 0.8;
    if (!lowGfx && this.style === "space") {
      this.stars2 = scene.add
        .tileSprite(W / 2, H / 2, W, H, "stars")
        .setDepth(-94)
        .setAlpha(0.5);
      this.stars2.tilePositionY = 200;
    }

    // 1: style layer (vector, crisp)
    this.styleG = scene.add.graphics().setDepth(-90);
    this.sun = this.style === "horizon" ? scene.add.graphics().setDepth(-92) : null;

    // 3: scenery — one planet (top band) + one island (bottom band). Blurred (low-res
    // textures upscaled), dark and desaturated; fades out whenever a hazard passes in front.
    this.scenery = [];
    const planet = scene.add.image(0, 0, "planet0").setDepth(-88);
    this.scenery.push({
      img: planet,
      kind: "planet",
      factor: 0.03,
      band: [0.05, 0.12],
      base: 0.75,
      fade: 1,
    });
    if (!lowGfx) {
      const island = scene.add.image(0, 0, "island0").setDepth(-87);
      this.scenery.push({
        img: island,
        kind: "island",
        factor: 0.08,
        band: [0.92, 0.98],
        base: 0.8,
        fade: 1,
      });
    }
    this.scenery.forEach((s, i) => this.place(s, W * (0.2 + i * 0.55)));

    // 4: faint near-field particles + speed lines
    this.emitters = {};
    this.spawnAcc = {};
    const q = lowGfx ? 0.35 : 1;
    this.particleQuality = q;
    this.scroll = 0;
    for (const [k, d] of Object.entries(PARTICLES)) {
      const em = scene.add.particles(0, 0, d.tex, {
        emitting: false,
        lifespan: 4200,
        scale: { min: d.scale[0], max: d.scale[1] },
        alpha: { min: d.alpha[0], max: d.alpha[1] },
        speedX: { onEmit: () => -this.scroll * Phaser.Math.FloatBetween(d.fx[0], d.fx[1]) - 30 },
        speedY: { min: d.vy[0], max: d.vy[1] },
        rotate: k === "flake" || k === "ash" ? { start: 0, end: 360 } : 0,
        blendMode: k === "ash" ? "NORMAL" : "ADD",
        maxParticles: Math.round(60 * q),
      });
      em.setDepth(-60);
      this.emitters[k] = em;
      this.spawnAcc[k] = 0;
    }
    this.lines = [];
    for (let i = 0; i < (lowGfx ? 5 : 10); i++) {
      const l = scene.add.image(0, 0, "streak").setBlendMode(ADD).setDepth(-50).setAlpha(0);
      this.resetLine(l, true);
      this.lines.push(l);
    }

    // 5: vignette + heartbeat + dim
    this.vignette = scene.add
      .image(W / 2, H / 2, "vignette")
      .setDisplaySize(W, H)
      .setDepth(-20)
      .setAlpha(0.85);
    this.pulseVig = scene.add
      .image(W / 2, H / 2, "vignette")
      .setDisplaySize(W, H)
      .setDepth(-19);
    this.pulseVig.setTintFill(0xff0018).setBlendMode(ADD).setAlpha(0);
    this.dimRect = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(-10);
  }

  place(s, x) {
    const W = this.W;
    const H = this.H;
    const sz = s.kind === "planet" ? 0.45 + Math.random() * 0.2 : 0.75 + Math.random() * 0.25;
    const tex =
      s.kind === "planet"
        ? `planet${Math.floor(Math.random() * 3)}`
        : `island${Math.floor(Math.random() * 3)}`;
    // textures are painted at 35% resolution: upscaling gives a soft, out-of-focus look
    s.img
      .setTexture(tex)
      .setScale(sz / 0.35)
      .setFlipX(Math.random() < 0.5);
    s.img.x = x ?? W + s.img.displayWidth / 2 + 40;
    s.baseY = H * Phaser.Math.FloatBetween(s.band[0], s.band[1]);
    s.img.y = s.baseY;
  }

  resetLine(l, initial) {
    l.x = this.W + Math.random() * (initial ? this.W : 200);
    l.y = Math.random() * this.H;
    l.speedMul = 1.8 + Math.random() * 1.6;
    l.setScale(0.6 + Math.random() * 1.2, 0.5 + Math.random() * 0.4);
  }

  /** Background-only style layer. */
  drawStyle(pal) {
    const g = this.styleG;
    g.clear();
    if (this.style === "space") return;
    const W = this.W;
    const H = this.H;
    const col = darken(pal.neon, 0.9);
    const vx = W / 2;
    const vy = H * 0.5;
    const spacing = 90;
    const off = (this.scrollAcc * 0.5) % spacing;
    const drawPlane = (edge, horizon, alphaMul) => {
      g.lineStyle(2, col, 0.32 * alphaMul);
      g.lineBetween(0, horizon, W, horizon);
      const rows = 7;
      for (let i = 1; i <= rows; i++) {
        const t = (i / rows) ** 2;
        const y = horizon + (edge - horizon) * t;
        g.lineStyle(1.5, col, (0.06 + 0.16 * t) * alphaMul);
        g.lineBetween(0, y, W, y);
      }
      // columns converge toward the vanishing point and slide with the world
      const k = (horizon - vy) / (edge - vy);
      for (let xb = -W * 1.5 - off; xb < W * 2.5; xb += spacing) {
        const xh = vx + (xb - vx) * k;
        g.lineStyle(1.5, col, 0.16 * alphaMul);
        g.lineBetween(xh, horizon, xb, edge);
      }
    };
    if (this.style === "grid") {
      drawPlane(H + 40, H * 0.8, 1);
      drawPlane(-40, H * 0.2, 0.7);
    } else if (this.style === "horizon") {
      const s = this.sun;
      s.clear();
      const cx = W / 2;
      const cy = H * 0.78;
      const R = 170;
      // upper half-disc built from horizontal slices; gaps near the bottom form the
      // classic synthwave stripes (no masking boxes)
      s.fillStyle(darken(lerpColor(pal.accent, pal.neb0, 0.4), 0.45), 0.55);
      for (let y = cy - R; y < cy; y += 3) {
        const d = cy - y;
        const stripe =
          d < R * 0.55 && Math.floor(d / 14) % 2 === 0 && d % 14 < 4 + (R * 0.55 - d) / 20;
        if (stripe) continue;
        const half = Math.sqrt(Math.max(0, R * R - d * d));
        s.fillRect(cx - half, y, half * 2, 3);
      }
      drawPlane(H + 40, H * 0.78, 1.1);
    }
  }

  /**
   * @param pal blended palette
   * @param o { speedNorm, dim, hazards: [[x0,x1]...] in screen units }
   */
  update(dt, scroll, pal, o = {}) {
    this.time += dt;
    this.scroll = scroll;
    this.scrollAcc += scroll * dt;
    const speedNorm = o.speedNorm ?? 0;
    const W = this.W;
    const H = this.H;

    const beat = heartbeat(this.time) * pal.pulse;
    this.beat = beat;
    this.skyScene?.apply(pal, this.time, this.scrollAcc * 0.00012, beat * 0.5);

    this.stars.tilePositionX += scroll * dt * 0.012;
    this.stars.setTint(lerpColor(0xffffff, pal.neon, 0.2));
    if (this.stars2) this.stars2.tilePositionX += scroll * dt * 0.025;

    this.drawStyle(pal);

    // scenery: never sits behind a hazard
    const hz = o.hazards || [];
    for (const s of this.scenery) {
      s.img.x -= scroll * dt * s.factor;
      s.img.y = s.baseY + Math.sin(this.time * 0.3 + s.factor * 50) * 6;
      const half = s.img.displayWidth / 2 + 50;
      let blocked = o.scenery === false;
      for (const [a, b] of hz) {
        if (b > s.img.x - half && a < s.img.x + half) {
          blocked = true;
          break;
        }
      }
      s.fade += ((blocked ? 0 : 1) - s.fade) * Math.min(1, dt * 6);
      s.img.setAlpha(s.base * s.fade);
      s.img.setTint(s.kind === "planet" ? pal.planet : pal.island);
      if (s.img.x < -s.img.displayWidth / 2 - 40) this.place(s);
    }

    for (const [k, d] of Object.entries(PARTICLES)) {
      const w = pal.weights[k] || 0;
      if (w <= 0.01) continue;
      this.spawnAcc[k] += d.rate * w * dt * this.particleQuality * (0.6 + speedNorm * 0.8);
      const em = this.emitters[k];
      em.setParticleTint(pal.particleColor);
      while (this.spawnAcc[k] >= 1) {
        this.spawnAcc[k] -= 1;
        const fromTop = k === "flake" && Math.random() < 0.5;
        const fromBottom = k === "ember" && Math.random() < 0.5;
        const x = fromTop || fromBottom ? Math.random() * W * 1.2 : W + 20;
        const y = fromTop ? -10 : fromBottom ? H + 10 : Math.random() * H;
        em.emitParticleAt(x, y, 1);
      }
    }

    const lineAlpha = Math.max(0, (speedNorm - 0.2) * 0.35);
    for (const l of this.lines) {
      l.x -= scroll * dt * l.speedMul;
      l.setAlpha(lineAlpha * (0.4 + 0.6 * Math.abs(Math.sin(l.y))));
      l.setTint(pal.neon);
      if (l.x < -300) this.resetLine(l, false);
    }

    this.pulseVig.setAlpha(beat * 0.55);
    const dim = o.dim ?? 0;
    this.dimRect.fillAlpha += (dim - this.dimRect.fillAlpha) * Math.min(1, dt * 8);
  }
}
