// Layered parallax "living neon cosmos":
//  0 animated shader sky (gradient + drifting nebula, rendered low-res & upscaled)
//  1 far star field   2 near star field   3 drifting planets   4 nebula dust wisps
//  5 far crystal islands   6 near crystal islands   7 near-field biome particles
//  8 foreground motes + speed lines
import Phaser from "phaser";
import { WORLD } from "../config.js";
import { SKY_KEY } from "../scenes/SkyScene.js";
import { BIOMES, lerpColor } from "./biomes.js";

const ADD = Phaser.BlendModes.ADD;

export function heartbeat(t) {
  const p = t % 1.05;
  return Math.exp(-((p - 0.05) ** 2) * 600) + 0.65 * Math.exp(-((p - 0.27) ** 2) * 600);
}

const PARTICLES = {
  mote: {
    tex: "dot",
    rate: 26,
    cfg: {
      scale: { min: 0.12, max: 0.45 },
      alpha: { min: 0.25, max: 0.9 },
      vy: [-20, 20],
      fx: [0.5, 1.3],
    },
  },
  ember: {
    tex: "dot",
    rate: 34,
    cfg: {
      scale: { min: 0.1, max: 0.4 },
      alpha: { min: 0.5, max: 1 },
      vy: [-140, -40],
      fx: [0.6, 1.1],
    },
  },
  flake: {
    tex: "flake",
    rate: 30,
    cfg: {
      scale: { min: 0.2, max: 0.6 },
      alpha: { min: 0.4, max: 0.95 },
      vy: [40, 130],
      fx: [0.6, 1.2],
    },
  },
  pixel: {
    tex: "pixel",
    rate: 26,
    cfg: {
      scale: { min: 0.35, max: 1.1 },
      alpha: { min: 0.4, max: 1 },
      vy: [-10, 10],
      fx: [0.8, 1.6],
    },
  },
  ash: {
    tex: "ash",
    rate: 24,
    cfg: {
      scale: { min: 0.4, max: 1 },
      alpha: { min: 0.3, max: 0.85 },
      vy: [-40, 30],
      fx: [0.5, 1.1],
    },
  },
};

export class Background {
  constructor(scene, { lowGfx = false, W, H, cover = 1 / WORLD.minZoom } = {}) {
    this.scene = scene;
    this.lowGfx = lowGfx;
    this.W = W;
    this.H = H;
    this.cw = Math.ceil(W * cover) + 60;
    this.ch = Math.ceil(H * cover) + 60;
    this.cx = W / 2;
    this.cy = H / 2;
    this.time = 0;
    this.scrollAcc = 0;
    this.zoom = 1;
    this.speedNorm = 0;
    const cw = this.cw;
    const ch = this.ch;

    // --- 0: sky — shader texture rendered by the Sky scene, upscaled here
    this.skyScene = scene.scene.get("Sky");
    this.sky = scene.add
      .image(this.cx, this.cy, SKY_KEY)
      .setDisplaySize(cw, ch)
      .setDepth(-100)
      .setScrollFactor(0);

    // --- 1/2: stars
    this.stars1 = scene.add
      .tileSprite(this.cx, this.cy, cw, ch, "stars")
      .setDepth(-95)
      .setAlpha(0.55)
      .setScrollFactor(0);
    this.stars1.tileScaleX = this.stars1.tileScaleY = 0.7;
    if (!lowGfx) {
      this.stars2 = scene.add
        .tileSprite(this.cx, this.cy, cw, ch, "stars")
        .setDepth(-94)
        .setAlpha(0.85)
        .setScrollFactor(0);
      this.stars2.tilePositionY = 200;
      this.stars2.tileScaleX = this.stars2.tileScaleY = 1.2;
    }

    // --- 3: planets (+ additive halos that light the sky)
    this.planets = [];
    const nPlanets = lowGfx ? 1 : 2;
    for (let i = 0; i < nPlanets; i++) {
      const halo = scene.add.image(0, 0, "glow").setBlendMode(ADD).setDepth(-91).setAlpha(0.35);
      const img = scene.add.image(0, 0, `planet${i}`).setDepth(-90);
      const p = { img, halo, factor: 0.025 + i * 0.02, bob: Math.random() * 6 };
      this.placePlanet(p, i === 0 ? this.cx + 120 : this.cx - 200);
      this.planets.push(p);
    }

    // --- 4: dust wisps
    this.dust = scene.add
      .tileSprite(this.cx, this.cy, cw, ch, "dust")
      .setDepth(-85)
      .setBlendMode(ADD)
      .setAlpha(0.7)
      .setScrollFactor(0);

    // --- 5/6: crystal islands
    this.islands = [];
    const layers = lowGfx
      ? [{ n: 2, scale: 0.55, factor: 0.14, depth: -80, alpha: 0.55 }]
      : [
          { n: 3, scale: 0.5, factor: 0.12, depth: -80, alpha: 0.5 },
          { n: 2, scale: 0.95, factor: 0.3, depth: -70, alpha: 0.9 },
        ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const halo = scene.add
          .image(0, 0, "glow")
          .setBlendMode(ADD)
          .setDepth(L.depth - 1)
          .setAlpha(0.18 * L.alpha);
        const img = scene.add
          .image(0, 0, `island${(i + L.n) % 3}`)
          .setDepth(L.depth)
          .setAlpha(L.alpha);
        const isl = { img, halo, ...L, phase: Math.random() * 6 };
        this.placeIsland(isl, this.cx - cw / 2 + (i + 0.5) * (cw / L.n) + Math.random() * 80);
        this.islands.push(isl);
      }
    }

    // --- 7: near-field biome particles (one emitter per type, crossfaded by biome weight)
    this.emitters = {};
    this.spawnAcc = {};
    const q = lowGfx ? 0.35 : 1;
    for (const [k, def] of Object.entries(PARTICLES)) {
      const c = def.cfg;
      const em = scene.add.particles(0, 0, def.tex, {
        emitting: false,
        lifespan: 4200,
        scale: c.scale,
        alpha: c.alpha,
        speedX: { onEmit: () => -this.scroll * Phaser.Math.FloatBetween(c.fx[0], c.fx[1]) - 30 },
        speedY: { min: c.vy[0], max: c.vy[1] },
        rotate: k === "flake" || k === "ash" ? { start: 0, end: 360 } : 0,
        blendMode: k === "ash" ? "NORMAL" : "ADD",
        maxParticles: Math.round(90 * q),
      });
      em.setDepth(k === "mote" ? 45 : -60);
      this.emitters[k] = em;
      this.spawnAcc[k] = 0;
    }
    this.particleQuality = q;
    this.scroll = 0;

    // --- 8: speed lines
    this.lines = [];
    const nLines = lowGfx ? 6 : 14;
    for (let i = 0; i < nLines; i++) {
      const l = scene.add.image(0, 0, "streak").setBlendMode(ADD).setDepth(55).setAlpha(0);
      this.resetLine(l, true);
      this.lines.push(l);
    }
  }

  placePlanet(p, x) {
    const s = 0.35 + Math.random() * 0.55;
    p.img.setTexture(`planet${Math.floor(Math.random() * 3)}`).setScale(s);
    p.img.x = x ?? this.cx + this.cw / 2 + 200 * s;
    p.baseY = this.cy - this.ch * 0.35 + Math.random() * this.ch * 0.5;
    p.img.y = p.baseY;
    p.img.setAngle(Math.random() * 40 - 20);
    p.halo.setScale(s * 5.5);
  }

  placeIsland(isl, x) {
    const s = isl.scale * (0.8 + Math.random() * 0.4);
    isl.img.setScale(s).setFlipX(Math.random() < 0.5);
    isl.img.x = x ?? this.cx + this.cw / 2 + 200 * s;
    isl.baseY = this.cy - this.ch * 0.38 + Math.random() * this.ch * 0.8;
    isl.halo.setScale(s * 4);
  }

  resetLine(l, initial) {
    l.x = this.cx + this.cw / 2 + Math.random() * (initial ? this.cw : 200);
    l.y = this.cy - this.ch / 2 + Math.random() * this.ch;
    l.speedMul = 1.8 + Math.random() * 1.6;
    l.setScale(0.6 + Math.random() * 1.2, 0.6 + Math.random() * 0.6);
  }

  /**
   * @param scroll world speed px/s
   * @param pal blended palette (see blendPalette)
   * @param extra { speedNorm, zoom }
   */
  update(dt, scroll, pal, extra = {}) {
    this.time += dt;
    this.scroll = scroll;
    this.scrollAcc += scroll * dt;
    const speedNorm = extra.speedNorm ?? 0;
    const zoom = extra.zoom ?? 1;
    const left = this.cx - this.W / 2 / zoom;
    const right = this.cx + this.W / 2 / zoom;
    const top = this.cy - this.H / 2 / zoom;
    const bottom = this.cy + this.H / 2 / zoom;

    // sky shader uniforms
    const beat = heartbeat(this.time) * pal.pulse;
    this.beat = beat;
    this.skyScene?.apply(pal, this.time, this.scrollAcc * 0.00012, beat * 0.6);

    // stars
    this.stars1.tilePositionX += scroll * dt * 0.012;
    this.stars1.setTint(lerpColor(0xffffff, pal.neon, 0.25));
    if (this.stars2) {
      this.stars2.tilePositionX += scroll * dt * 0.03;
      this.stars2.setAlpha(0.65 + Math.sin(this.time * 1.7) * 0.15);
    }

    // planets
    for (const p of this.planets) {
      p.img.x -= scroll * dt * p.factor;
      p.img.y = p.baseY + Math.sin(this.time * 0.2 + p.bob) * 10;
      p.img.rotation += dt * 0.01;
      p.img.setTint(pal.planet);
      p.halo.setPosition(p.img.x, p.img.y).setTint(pal.planet);
      if (p.img.x < this.cx - this.cw / 2 - 200 * p.img.scaleX) this.placePlanet(p);
    }

    // dust
    this.dust.tilePositionX += scroll * dt * 0.07;
    this.dust.tilePositionY = Math.sin(this.time * 0.1) * 40;
    this.dust.setTint(pal.neb0);

    // islands
    const islandTint = pal.island;
    for (const isl of this.islands) {
      isl.img.x -= scroll * dt * isl.factor;
      isl.img.y = isl.baseY + Math.sin(this.time * 0.6 + isl.phase) * 14;
      isl.img.setTint(islandTint);
      isl.halo.setPosition(isl.img.x, isl.img.y - 30 * isl.img.scaleY).setTint(islandTint);
      if (isl.img.x < this.cx - this.cw / 2 - 200 * isl.img.scaleX) this.placeIsland(isl);
    }

    // near-field particles
    for (const [k, def] of Object.entries(PARTICLES)) {
      const w = pal.weights[k] || 0;
      if (w <= 0.01) continue;
      this.spawnAcc[k] += def.rate * w * dt * this.particleQuality * (0.6 + speedNorm * 0.8);
      const em = this.emitters[k];
      if (k !== "ash")
        em.setParticleTint(
          k === "ember" ? lerpColor(0xffd25a, 0xff5a1a, Math.random()) : pal.particleColor,
        );
      while (this.spawnAcc[k] >= 1) {
        this.spawnAcc[k] -= 1;
        const fromTop = k === "flake" && Math.random() < 0.5;
        const fromBottom = k === "ember" && Math.random() < 0.5;
        const x = fromTop || fromBottom ? left + Math.random() * (right - left) * 1.2 : right + 20;
        const y = fromTop
          ? top - 10
          : fromBottom
            ? bottom + 10
            : top + Math.random() * (bottom - top);
        em.emitParticleAt(x, y, 1);
      }
      if (k === "ash") em.setParticleTint(pal.particleColor);
    }

    // speed lines
    const lineAlpha = Math.max(0, (speedNorm - 0.15) * 0.75);
    for (const l of this.lines) {
      l.x -= scroll * dt * l.speedMul;
      l.setAlpha(lineAlpha * (0.4 + 0.6 * Math.abs(Math.sin(l.y))));
      l.setTint(pal.neon);
      if (l.x < left - 300) this.resetLine(l, false);
    }
  }

  destroy() {}
}

export { BIOMES };
