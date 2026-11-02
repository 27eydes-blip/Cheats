// Pooled particle bursts, shockwave rings, lightning arcs and floating text.
// Every emitter has a hard particle cap that is lowered further in Low Graphics mode.
import Phaser from "phaser";
import { FONT } from "../config.js";

const toDeg = 180 / Math.PI;
const alongVelocity = {
  onEmit: (p) => Math.atan2(p.velocityY, p.velocityX) * toDeg,
};

const KINDS = {
  spark: {
    tex: "spark",
    cfg: {
      lifespan: { min: 180, max: 420 },
      speed: { min: 180, max: 520 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0.1 },
      alpha: { start: 1, end: 0 },
      rotate: alongVelocity,
      blendMode: "ADD",
    },
    cap: 160,
  },
  fire: {
    tex: "dot",
    cfg: {
      lifespan: { min: 300, max: 700 },
      speed: { min: 60, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0.1 },
      alpha: { start: 0.95, end: 0 },
      color: [0xfff1a8, 0xffa21f, 0xff3d00, 0x5a0500],
      gravityY: -180,
      blendMode: "ADD",
    },
    cap: 220,
  },
  smoke: {
    tex: "smoke",
    cfg: {
      lifespan: { min: 500, max: 1100 },
      speed: { min: 20, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 1.8 },
      alpha: { start: 0.65, end: 0 },
      rotate: { min: 0, max: 360 },
      blendMode: "NORMAL",
    },
    cap: 90,
  },
  flake: {
    tex: "flake",
    cfg: {
      lifespan: { min: 600, max: 1300 },
      speed: { min: 60, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 360 },
      gravityY: 120,
      blendMode: "ADD",
    },
    cap: 140,
  },
  pixel: {
    tex: "pixel",
    cfg: {
      lifespan: { min: 300, max: 900 },
      speed: { min: 60, max: 380 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.1, end: 0.4 },
      alpha: { start: 1, end: 0 },
      blendMode: "ADD",
    },
    cap: 180,
  },
  star: {
    tex: "star4",
    cfg: {
      lifespan: { min: 400, max: 900 },
      speed: { min: 80, max: 360 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 180 },
      blendMode: "ADD",
    },
    cap: 160,
  },
  shard: {
    tex: "shard",
    cfg: {
      lifespan: { min: 600, max: 1300 },
      speed: { min: 160, max: 620 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0.2 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 720 },
      gravityY: 380,
      blendMode: "ADD",
    },
    cap: 120,
  },
  dot: {
    tex: "dot",
    cfg: {
      lifespan: { min: 250, max: 600 },
      speed: { min: 40, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: "ADD",
    },
    cap: 200,
  },
};

export class Effects {
  constructor(scene, { lowGfx = false, depth = 40 } = {}) {
    this.scene = scene;
    this.quality = lowGfx ? 0.4 : 1;
    this.lowGfx = lowGfx;
    this.drift = 0;
    this.emitters = {};
    for (const [k, def] of Object.entries(KINDS)) {
      const em = scene.add.particles(0, 0, def.tex, {
        ...def.cfg,
        emitting: false,
        maxParticles: Math.round(def.cap * this.quality),
      });
      em.setDepth(depth);
      this.emitters[k] = em;
    }
    // rings
    this.rings = [];
    // lightning arcs (one shared Graphics)
    this.arcG = scene.add
      .graphics()
      .setDepth(depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.arcs = [];
    // floating text pool
    this.texts = [];
  }

  burst(kind, x, y, count, tint, opts = {}) {
    const em = this.emitters[kind];
    if (!em) return;
    const n = Math.max(1, Math.round(count * this.quality));
    if (tint !== undefined && kind !== "fire") em.setParticleTint(tint);
    if (opts.angle) em.setEmitterAngle(opts.angle);
    else em.setEmitterAngle({ min: 0, max: 360 });
    if (opts.speed) em.setParticleSpeed(opts.speed.min, opts.speed.max);
    else em.setParticleSpeed(KINDS[kind].cfg.speed.min, KINDS[kind].cfg.speed.max);
    em.explode(n, x, y);
  }

  ring(x, y, color, { scale = 1, duration = 450, from = 0.1, alpha = 0.9, width = 1 } = {}) {
    let r = this.rings.find((o) => !o.active);
    if (!r) {
      if (this.rings.length > 14) return;
      r = this.scene.add
        .image(0, 0, "ring")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(this.emitters.dot.depth + 2);
      this.rings.push(r);
    }
    r.setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setTint(color)
      .setAlpha(alpha)
      .setScale(from);
    r.scaleY = from * width;
    this.scene.tweens.add({
      targets: r,
      scaleX: scale,
      scaleY: scale * width,
      alpha: 0,
      duration,
      ease: "Cubic.easeOut",
      onComplete: () => r.setActive(false).setVisible(false),
    });
  }

  /** Jagged lightning arcs radiating from a point. */
  lightning(x, y, color, count = 4, length = 70) {
    const n = Math.max(1, Math.round(count * (this.lowGfx ? 0.5 : 1)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const pts = [x, y];
      let px = x;
      let py = y;
      const segs = 5;
      for (let s = 1; s <= segs; s++) {
        const d = (length / segs) * s;
        const j = (Math.random() - 0.5) * 22;
        px = x + Math.cos(a) * d - Math.sin(a) * j;
        py = y + Math.sin(a) * d + Math.cos(a) * j;
        pts.push(px, py);
      }
      this.arcs.push({ pts, life: 0.16, max: 0.16, color });
    }
  }

  lightningBetween(x1, y1, x2, y2, color, life = 0.12) {
    const pts = [x1, y1];
    const segs = 7;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const j = (Math.random() - 0.5) * 26;
      pts.push(x1 + (x2 - x1) * t + (nx / len) * j, y1 + (y2 - y1) * t + (ny / len) * j);
    }
    pts.push(x2, y2);
    this.arcs.push({ pts, life, max: life, color });
  }

  floatText(x, y, str, color = "#ffffff", size = 34) {
    let t = this.texts.find((o) => !o.active);
    if (!t) {
      t = this.scene.add
        .text(0, 0, "", {
          fontFamily: FONT,
          fontSize: "34px",
          fontStyle: "900",
          color: "#fff",
          stroke: "#000000",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setPadding(18, 18, 18, 18)
        .setDepth(this.emitters.dot.depth + 5);
      this.texts.push(t);
    }
    t.setActive(true).setVisible(true).setText(str).setColor(color).setFontSize(size);
    t.setShadow(0, 0, color, 16, true, true);
    t.setPosition(x, y).setScale(0.3).setAlpha(1).setAngle(Phaser.Math.Between(-8, 8));
    this.scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.scene.tweens.add({
      targets: t,
      y: y - 70,
      alpha: 0,
      delay: 380,
      duration: 520,
      ease: "Cubic.easeIn",
      onComplete: () => t.setActive(false).setVisible(false),
    });
    return t;
  }

  setTimeScale(ts) {
    for (const em of Object.values(this.emitters)) em.timeScale = ts;
  }

  update(dt) {
    if (this.drift) {
      const dx = this.drift * dt;
      for (const k in this.emitters) {
        if (k === "smoke") continue;
        this.emitters[k].forEachAlive((p) => {
          p.x -= dx;
        });
      }
    }
    const g = this.arcG;
    g.clear();
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      if (a.life <= 0) {
        this.arcs.splice(i, 1);
        continue;
      }
      const k = a.life / a.max;
      if (this.drift) for (let p = 0; p < a.pts.length; p += 2) a.pts[p] -= this.drift * dt;
      g.lineStyle(7, a.color, 0.35 * k);
      g.strokePoints(this.toPoints(a.pts));
      g.lineStyle(2.5, 0xffffff, k);
      g.strokePoints(this.toPoints(a.pts));
    }
  }

  toPoints(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i += 2) out.push({ x: arr[i], y: arr[i + 1] });
    return out;
  }

  clear() {
    for (const em of Object.values(this.emitters)) em.killAll();
    this.arcs.length = 0;
    this.arcG.clear();
  }
}
