// Pooled particle bursts, shockwave rings, lightning arcs and floating text.
// Every emitter has a hard particle cap that is lowered further in Low Graphics mode.
import Phaser from "phaser";
import { NUM_FONT, VIEW } from "../config.js";

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

// shop cosmetics: white sprites tinted per use (flap / death / trail effects)
const fall = (tex, cap, extra = {}) => ({
  tex,
  cfg: {
    lifespan: { min: 600, max: 1100 },
    speed: { min: 60, max: 220 },
    angle: { min: 0, max: 360 },
    scale: { start: 1, end: 0.6 },
    alpha: { start: 1, end: 0 },
    rotate: { min: -40, max: 40 },
    ...extra,
  },
  cap,
});
KINDS.note = fall("fx_note", 60, { gravityY: -120 });
KINDS.feather = fall("fx_feather", 60, { gravityY: 140, rotate: { min: -90, max: 90 } });
KINDS.heart = fall("fx_heart", 80, { gravityY: -60 });
KINDS.confetti = fall("fx_confetti", 160, {
  gravityY: 520,
  lifespan: { min: 900, max: 1500 },
  rotate: { min: 0, max: 360 },
});
KINDS.cash = fall("fx_cash", 100, { gravityY: 700, rotate: { min: 0, max: 360 } });
KINDS.sweat = fall("fx_sweat", 80, {
  gravityY: 900,
  lifespan: { min: 350, max: 700 },
  rotate: 0,
  scale: { start: 1, end: 0.7 },
});
KINDS.dumbbell = fall("fx_dumbbell", 24, {
  gravityY: 1100,
  lifespan: { min: 900, max: 1400 },
  rotate: { min: 0, max: 360 },
  alpha: { start: 1, end: 0.6 },
});

// animal heroes (coloured sprites: pass 0xffffff to keep their colours, or tint white ones)
KINDS.petal = fall("fx_petal", 60, { gravityY: 60, rotate: { min: -180, max: 180 } });
KINDS.zzz = fall("fx_zzz", 30, { gravityY: -70, rotate: 0, lifespan: { min: 900, max: 1300 } });
KINDS.yarn = fall("fx_yarn", 40, { gravityY: 500, rotate: { min: 0, max: 360 } });
KINDS.acorn = fall("fx_acorn", 40, { gravityY: 900, rotate: { min: 0, max: 360 } });
KINDS.marsh = fall("fx_marsh", 40, { gravityY: 800, rotate: { min: 0, max: 360 } });
KINDS.berry = fall("fx_berry", 40, { gravityY: 900 });
KINDS.bubble = fall("fx_bubble", 50, {
  gravityY: -110,
  rotate: 0,
  scale: { start: 0.7, end: 1.2 },
});
KINDS.bone = fall("fx_bone", 30, { gravityY: 1000, rotate: { min: 0, max: 360 } });
KINDS.goo = fall("fx_goo", 50, { gravityY: 900, scale: { start: 1.2, end: 0.6 } });
KINDS.chain = fall("fx_chain", 24, { gravityY: 1000, rotate: { min: 0, max: 360 } });

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
        .setBlendMode(Phaser.BlendModes.NORMAL)
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
          fontFamily: NUM_FONT,
          resolution: VIEW.Z,
          fontSize: "34px",
          fontStyle: "700",
          color: "#fff",
          stroke: "#000000",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setPadding(18, 18, 18, 18)
        .setDepth(this.emitters.dot.depth + 5);
      this.texts.push(t);
    }
    // restyle only when something changed: each setter re-renders the text and re-uploads it
    // to the GPU (4 uploads per popup before); a repeated "CLOSE!" now costs none
    t.setActive(true).setVisible(true);
    if (t.__color !== color || t.__size !== size) {
      t.__color = color;
      t.__size = size;
      t.setColor(color)
        .setFontSize(size)
        .setShadow(0, 0, color, 16 * VIEW.Z, true, true);
    }
    t.setText(str);
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
      // pixel bolt: stepped squares on the 4-unit art grid (colored rim, white core)
      for (let p = 0; p + 3 < a.pts.length; p += 2) {
        const x0 = a.pts[p];
        const y0 = a.pts[p + 1];
        const x1 = a.pts[p + 2];
        const y1 = a.pts[p + 3];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 4));
        for (let q = 0; q <= n; q++) {
          const gx = Math.round((x0 + ((x1 - x0) * q) / n) / 4) * 4;
          const gy = Math.round((y0 + ((y1 - y0) * q) / n) / 4) * 4;
          g.fillStyle(a.color, 0.55 * k);
          g.fillRect(gx - 4, gy - 4, 8, 8);
          g.fillStyle(0xffffff, k);
          g.fillRect(gx - 2, gy - 2, 4, 4);
        }
      }
    }
  }

  clear() {
    for (const em of Object.values(this.emitters)) em.killAll();
    this.arcs.length = 0;
    this.arcG.clear();
  }
}
