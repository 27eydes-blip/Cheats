// Visual rig for a character: sprite, light halo, signature trail, idle animation,
// flap effect and death explosion. Used in-game, for the ghost run and for live previews.
import Phaser from "phaser";
import { HERO_SCALE } from "../config.js";
import { HI } from "../gfx/textures.js";

const ADD = Phaser.BlendModes.ADD;
const NORMAL = Phaser.BlendModes.NORMAL;
const TAU = Math.PI * 2;

function hsv(h, s, v) {
  const c = Phaser.Display.Color.HSVToRGB(h, s, v);
  return (c.r << 16) | (c.g << 8) | c.b;
}

function lerpColor(a, b, t) {
  return Phaser.Display.Color.GetColor(
    ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t,
    ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t,
    (a & 255) + ((b & 255) - (a & 255)) * t,
  );
}

export class CharacterRig {
  constructor(scene, def, fx, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.fx = fx;
    this.ghost = !!opts.ghost;
    this.lowGfx = !!opts.lowGfx;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.angle = 0;
    this.sizeMul = 1;
    this.displayScale = opts.scale ?? 1;
    this.sx = 1;
    this.sy = 1;
    this.time = Math.random() * 10;
    this.flapT = 9;
    this.dead = false;
    this.gravityDir = 1;
    this.points = [];
    this.trailTime = this.ghost ? 0.35 : this.lowGfx ? 0.32 : 0.5;
    this.emitT = 0;
    this.jitter = [];
    this.jitterT = 0;
    this.glitchT = 0;
    this.offX = 0;
    this.offY = 0;
    const depth = opts.depth ?? 30;

    this.trailG = scene.add.graphics().setDepth(depth - 2);
    this.trailG.setBlendMode(def.id === "shade" && !this.ghost ? NORMAL : ADD);
    this.px = def.pixel || null; // pixel-art sprite (no soft halo)
    if (!this.ghost && !this.px) {
      this.halo = scene.add
        .image(this.x, this.y, "glow")
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setTint(def.color)
        .setAlpha(0.55)
        .setDepth(depth - 1);
    }
    this.sprite = this.px
      ? scene.add.image(this.x, this.y, this.px.atlas, this.px.frames[1]).setDepth(depth)
      : scene.add.image(this.x, this.y, def.texture).setDepth(depth);
    if (this.px) this.trailG.setBlendMode(NORMAL);
    if (this.ghost) this.sprite.setAlpha(0.3).setTint(0xd8e8ff);

    this.extras = [];
    if (def.id === "nova") {
      this.rings = [0, 1].map((i) => {
        const r = scene.add
          .image(this.x, this.y, "nova_ring")
          .setBlendMode(ADD)
          .setDepth(depth + 1);
        r.setTint(i === 0 ? 0xffd2f4 : 0xa8f0ff).setAlpha(this.ghost ? 0.2 : 0.85);
        this.extras.push(r);
        return r;
      });
      this.moons = [0, 1].map((i) => {
        const m = scene.add
          .image(this.x, this.y, "dot")
          .setBlendMode(ADD)
          .setTint(i === 0 ? 0xff9ae6 : 0x9af2ff);
        if (this.ghost) m.setAlpha(0.25);
        this.extras.push(m);
        return m;
      });
    }
    if (def.id === "shade" && !this.ghost) {
      this.afterImages = [];
      for (let i = 0; i < 7; i++) {
        const im = scene.add
          .image(0, 0, def.texture)
          .setVisible(false)
          .setActive(false)
          .setDepth(depth - 1);
        im.setTintFill(0x7a3cff).setBlendMode(ADD);
        this.afterImages.push(im);
      }
    }
  }

  /** Visual unit: mini-mode size × display scale × global hero size. */
  get u() {
    return this.sizeMul * this.displayScale * HERO_SCALE;
  }

  get objects() {
    return [
      this.trailG,
      this.halo,
      this.sprite,
      ...this.extras,
      ...(this.afterImages || []),
    ].filter(Boolean);
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    if (this.halo) this.halo.setVisible(v);
    for (const e of this.extras) e.setVisible(v);
  }

  reset(x, y) {
    this.dead = false;
    this.points.length = 0;
    this.x = x;
    this.y = y;
    this.sizeMul = 1;
    this.sx = this.sy = 1;
    this.gravityDir = 1;
    this.setVisible(true);
    this.trailG.clear();
    if (this.afterImages) for (const im of this.afterImages) im.setVisible(false).setActive(false);
  }

  // ------------------------------------------------------------------ flap
  flap() {
    this.sx = 0.72;
    this.sy = 1.34;
    this.flapT = 0;
    if (this.ghost || !this.fx) return;
    const { x, y, def, fx } = this;
    const down = this.gravityDir > 0 ? { min: 50, max: 130 } : { min: 230, max: 310 };
    const oy = 12 * this.gravityDir * this.u;
    switch (def.id) {
      case "volt":
        fx.burst("spark", x, y + oy, 10, def.color, { angle: down });
        fx.lightning(x, y, def.color, 3, 46 * this.u);
        break;
      case "ember":
        fx.burst("fire", x - 6, y + oy, 14, undefined, {
          angle: down,
          speed: { min: 80, max: 240 },
        });
        break;
      case "shade":
        fx.burst("smoke", x, y + oy, 4, 0x3a1466, { angle: down, speed: { min: 30, max: 120 } });
        this.stampAfterImage(0.75);
        break;
      case "frost":
        fx.burst("flake", x, y + oy, 7, 0xdff8ff, { angle: down });
        break;
      case "glitch":
        for (const c of [0xff2050, 0x39ff88, 0x20c8ff]) fx.burst("pixel", x, y, 4, c);
        this.glitchT = 0.14;
        break;
      case "nova":
        fx.ring(x, y, hsv((this.time * 0.3) % 1, 0.5, 1), {
          scale: 0.55 * this.u,
          duration: 360,
        });
        fx.burst("star", x, y, 7, hsv(Math.random(), 0.45, 1));
        break;
    }
  }

  // ------------------------------------------------------------------ death
  /** Returns post-FX hints for the scene (flash, glitch, aberration). */
  die() {
    this.dead = true;
    this.setVisible(false);
    const { x, y, def, fx } = this;
    const hints = { flash: 0.35, glitch: 0, aberration: 0.012, shake: 0.018 };
    if (!fx) return hints;
    fx.burst("shard", x, y, 26, def.color);
    fx.ring(x, y, def.color, { scale: 1.5, duration: 600 });
    switch (def.id) {
      case "volt":
        fx.lightning(x, y, def.color, 9, 150);
        fx.burst("spark", x, y, 40, 0xbffcff, { speed: { min: 250, max: 700 } });
        break;
      case "ember":
        fx.burst("fire", x, y, 80, undefined, { speed: { min: 120, max: 520 } });
        fx.ring(x, y, 0xff5a00, { scale: 2.4, duration: 700 });
        hints.flash = 0.45;
        break;
      case "shade":
        fx.burst("smoke", x, y, 26, 0x24083f, { speed: { min: 30, max: 220 } });
        fx.burst("dot", x, y, 30, 0xb45cff, { speed: { min: 60, max: 260 } });
        hints.flash = 0.15;
        break;
      case "frost":
        fx.burst("flake", x, y, 46, 0xe8fbff, { speed: { min: 120, max: 520 } });
        fx.burst("shard", x, y, 20, 0xffffff);
        break;
      case "glitch":
        for (const c of [0xff2050, 0x39ff88, 0x20c8ff])
          fx.burst("pixel", x, y, 26, c, { speed: { min: 80, max: 560 } });
        hints.glitch = 1;
        hints.flash = 0.1;
        break;
      case "nova":
        fx.ring(x, y, 0xffffff, { scale: 5, duration: 1000 });
        fx.ring(x, y, 0xff7ad9, { scale: 3, duration: 800 });
        fx.ring(x, y, 0x7ae8ff, { scale: 2, duration: 650 });
        for (let i = 0; i < 4; i++)
          fx.burst("star", x, y, 16, hsv(i / 4, 0.5, 1), { speed: { min: 200, max: 760 } });
        fx.burst("spark", x, y, 40, 0xfff1a8, { speed: { min: 300, max: 900 } });
        hints.flash = 0.85;
        hints.aberration = 0.035;
        hints.shake = 0.028;
        break;
    }
    return hints;
  }

  stampAfterImage(alpha = 0.5) {
    if (!this.afterImages) return;
    const im = this.afterImages.find((o) => !o.active);
    if (!im) return;
    im.setActive(true).setVisible(true).setPosition(this.x, this.y).setAngle(this.angle);
    im.setScale(this.sprite.scaleX, this.sprite.scaleY).setAlpha(alpha);
    im.life = 0.32;
  }

  // ------------------------------------------------------------------ update
  update(dt, scroll) {
    this.time += dt;
    this.flapT += dt;
    const { def } = this;

    // trail points ride the world scroll
    for (const p of this.points) {
      p.x -= scroll * dt;
      p.age += dt;
    }
    while (this.points.length && this.points[this.points.length - 1].age > this.trailTime)
      this.points.pop();
    if (!this.dead) this.points.unshift({ x: this.x - 6 * this.u, y: this.y, age: 0 });

    // squash & stretch spring back
    const k = Math.exp(-dt * 11);
    this.sx = 1 + (this.sx - 1) * k;
    this.sy = 1 + (this.sy - 1) * k;

    this.offX = 0;
    this.offY = 0;
    let texture = def.texture;
    let extraAngle = 0;
    let pulse = 1;

    switch (def.id) {
      case "volt": {
        // wings: quick down-stroke on flap, lazy glide cycle otherwise
        let vf;
        if (this.flapT < 0.24) vf = [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))];
        else vf = [0, 1, 2, 1][Math.floor(this.time * 6) % 4];
        texture = `char_volt_${vf}`;
        pulse = 1 + Math.sin(this.time * 9) * 0.02;
        if (!this.ghost && !this.dead && this.fx) {
          this.emitT -= dt;
          if (this.emitT <= 0) {
            this.emitT = 0.25 + Math.random() * 0.45;
            this.fx.lightning(this.x, this.y, def.color, 1, 30 * this.u);
          }
        }
        break;
      }
      case "ember": {
        let f;
        if (this.flapT < 0.24) f = [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))];
        else f = [0, 1, 2, 1][Math.floor(this.time * 7) % 4];
        texture = `char_ember_${f}`;
        if (!this.ghost && !this.dead && this.fx) {
          this.emitT -= dt;
          if (this.emitT <= 0) {
            this.emitT = this.lowGfx ? 0.07 : 0.035;
            this.fx.burst("fire", this.x - 16 * this.u, this.y + 4, 1, undefined, {
              angle: { min: 160, max: 200 },
              speed: { min: 20, max: 90 },
            });
          }
        }
        break;
      }
      case "shade":
        this.offY = Math.sin(this.time * 3) * 3;
        if (!this.dead && this.afterImages) {
          this.emitT -= dt;
          if (this.emitT <= 0) {
            this.emitT = 0.055;
            this.stampAfterImage(0.6);
          }
        }
        break;
      case "frost":
        extraAngle = Math.sin(this.time * 1.4) * 9;
        if (!this.ghost) this.sprite.setTint(Math.sin(this.time * 6) > 0.85 ? 0xffffff : 0xe6fbff);
        if (!this.ghost && !this.dead && this.fx) {
          this.emitT -= dt;
          if (this.emitT <= 0) {
            this.emitT = this.lowGfx ? 0.18 : 0.08;
            this.fx.burst("flake", this.x - 10, this.y, 1, 0xdff8ff, {
              speed: { min: 10, max: 60 },
            });
          }
        }
        break;
      case "glitch":
        this.glitchT -= dt;
        if (Math.random() < 0.03) this.glitchT = Math.max(this.glitchT, 0.06);
        if (this.glitchT > 0) {
          texture = "char_glitch_1";
          this.offX = (Math.random() - 0.5) * 8;
          this.offY = (Math.random() - 0.5) * 6;
        }
        break;
      case "nova":
        pulse = 1 + Math.sin(this.time * 4) * 0.07;
        extraAngle = this.time * 25;
        if (!this.ghost && !this.dead && this.fx) {
          this.emitT -= dt;
          if (this.emitT <= 0) {
            this.emitT = this.lowGfx ? 0.14 : 0.06;
            this.fx.burst(
              "star",
              this.x - 12,
              this.y + (Math.random() - 0.5) * 20,
              1,
              hsv(Math.random(), 0.4, 1),
              {
                speed: { min: 10, max: 60 },
              },
            );
          }
        }
        break;
    }

    // afterimages fade
    if (this.afterImages) {
      for (const im of this.afterImages) {
        if (!im.active) continue;
        im.life -= dt;
        im.x -= scroll * dt;
        im.alpha = Math.max(0, im.alpha - dt * 1.5);
        if (im.life <= 0) im.setActive(false).setVisible(false);
      }
    }

    // sprite transform
    const sp = this.sprite;
    if (this.px) {
      // pixel sprite: frame from the same wing logic, crisp scale steps, tilt in 15° steps
      const f = Number(String(texture).slice(-1)) || 0;
      sp.setFrame(this.px.frames[Math.min(this.px.frames.length - 1, f)]);
      const m = Math.max(0.5, Math.round(this.sizeMul * this.displayScale * 2) / 2);
      const flip = this.gravityDir < 0 ? -1 : 1;
      sp.setPosition(Math.round(this.x + this.offX), Math.round(this.y + this.offY));
      sp.setAngle(Math.round(this.angle / 15) * 15);
      sp.setScale(
        m * (this.sx < 0.9 ? 0.875 : this.sx > 1.1 ? 1.125 : 1),
        m * (this.sy > 1.1 ? 1.125 : this.sy < 0.9 ? 0.875 : 1) * flip,
      );
      this.drawTrail();
      return;
    }
    const s = (def.scale * this.u) / HI;
    if (sp.texture.key !== texture) sp.setTexture(texture);
    sp.setPosition(this.x + this.offX, this.y + this.offY);
    sp.setAngle(this.angle + (def.id === "nova" ? 0 : extraAngle));
    sp.setScale(
      s * this.sx * pulse,
      s *
        this.sy *
        pulse *
        (this.gravityDir < 0 && (def.id === "ember" || def.id === "volt") ? -1 : 1),
    );
    if (def.id === "nova") sp.setAngle(extraAngle * 0.4);
    if (this.halo) {
      this.halo.setPosition(this.x, this.y);
      this.halo.setScale(1.05 * this.u * pulse);
      this.halo.setAlpha(0.42 + Math.sin(this.time * 5) * 0.08 + Math.max(0, 0.3 - this.flapT));
    }
    if (this.rings) {
      const sc = this.u;
      this.rings.forEach((r, i) => {
        const tilt = Phaser.Math.DegToRad(i === 0 ? 22 : -38);
        r.setPosition(this.x, this.y)
          .setRotation(tilt)
          .setScale((0.6 * sc) / HI, (0.2 * sc) / HI);
        // orbiting moon travels along the flattened ellipse
        const a = this.time * (i === 0 ? 2.6 : -1.9) + i * 2;
        const ex = Math.cos(a) * 38 * sc;
        const ey = Math.sin(a) * 12.5 * sc;
        const moon = this.moons[i];
        moon.setPosition(
          this.x + ex * Math.cos(tilt) - ey * Math.sin(tilt),
          this.y + ex * Math.sin(tilt) + ey * Math.cos(tilt),
        );
        moon.setScale(0.32 * sc).setDepth(this.sprite.depth + (Math.sin(a) > 0 ? 1 : -1));
      });
    }

    this.drawTrail();
  }

  // ------------------------------------------------------------------ trails
  ribbon(width, colorFn, alphaFn, offY = 0, quant = 0) {
    const g = this.trailG;
    const pts = this.points;
    const n = pts.length;
    if (n < 2) return;
    const W = width * this.u * 0.9;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const t0 = i / (n - 1);
      const t1 = (i + 1) / (n - 1);
      let ay = a.y + offY;
      let by = b.y + offY;
      if (quant) {
        ay = Math.round(ay / quant) * quant;
        by = Math.round(by / quant) * quant;
      }
      const dx = b.x - a.x;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const w0 = (W * (1 - t0)) / 2;
      const w1 = (W * (1 - t1)) / 2;
      g.fillStyle(colorFn(t0, i), alphaFn(t0));
      g.fillTriangle(
        a.x + nx * w0,
        ay + ny * w0,
        a.x - nx * w0,
        ay - ny * w0,
        b.x + nx * w1,
        by + ny * w1,
      );
      g.fillTriangle(
        a.x - nx * w0,
        ay - ny * w0,
        b.x - nx * w1,
        by - ny * w1,
        b.x + nx * w1,
        by + ny * w1,
      );
    }
  }

  drawTrail() {
    const g = this.trailG;
    g.clear();
    if (this.points.length < 2) return;
    const { def } = this;
    if (this.px && !this.ghost) {
      // stepped pixel trail: squares snapped to the art-pixel grid, shrinking + fading
      const P = 4;
      const cols = this.px.trail;
      const n = this.points.length;
      for (let i = 1; i < n; i += 2) {
        const p = this.points[i];
        const t = i / n;
        const size = Math.max(1, Math.round((1 - t) * 4 * this.sizeMul)) * P;
        const col = cols[Math.min(cols.length - 1, Math.floor(t * cols.length))];
        g.fillStyle(col, t < 0.15 ? 1 : 0.95 - t * 0.8);
        g.fillRect(
          Math.round((p.x - size / 2) / P) * P,
          Math.round((p.y - size / 2) / P) * P,
          size,
          size,
        );
      }
      return;
    }
    if (this.ghost) {
      this.ribbon(
        10,
        () => 0xcfe0ff,
        (t) => (1 - t) * 0.22,
      );
      return;
    }
    switch (def.id) {
      case "volt": {
        this.ribbon(
          9,
          () => def.color,
          (t) => (1 - t) * 0.45,
        );
        this.jitterT -= 1 / 60;
        if (this.jitterT <= 0 || this.jitter.length < this.points.length) {
          this.jitterT = 0.05;
          this.jitter = this.points.map(() => (Math.random() - 0.5) * 2);
        }
        const pts = this.points;
        const step = 3;
        const path = [];
        for (let i = 0; i < pts.length; i += step) {
          const t = i / pts.length;
          path.push({ x: pts[i].x, y: pts[i].y + this.jitter[i] * 16 * t * this.u });
        }
        if (path.length > 1) {
          g.lineStyle(7 * this.u, def.color, 0.35);
          g.strokePoints(path);
          g.lineStyle(2.5 * this.u, 0xffffff, 0.95);
          g.strokePoints(path);
        }
        break;
      }
      case "ember":
        this.ribbon(
          30,
          (t) =>
            t < 0.35
              ? lerpColor(0xfff1a8, 0xff8a1f, t / 0.35)
              : lerpColor(0xff8a1f, 0xb01000, (t - 0.35) / 0.65),
          (t) => (1 - t) * 0.5,
        );
        this.ribbon(
          8,
          () => 0xffe08a,
          (t) => (1 - t) * 0.45,
        );
        break;
      case "shade":
        this.ribbon(
          30,
          () => 0x12031f,
          (t) => (1 - t) * 0.7,
        );
        this.ribbon(
          8,
          () => 0xa45cff,
          (t) => (1 - t) * 0.95,
        );
        this.ribbon(
          3,
          () => 0xf0dcff,
          (t) => (1 - t) * 0.9,
        );
        break;
      case "frost":
        this.ribbon(
          18,
          (t) => lerpColor(0xbff4ff, 0x2a7bd6, t),
          (t) => (1 - t) * 0.55,
        );
        this.ribbon(
          5,
          () => 0xffffff,
          (t) => (1 - t) * 0.9,
        );
        break;
      case "glitch": {
        const j = () => (Math.random() - 0.5) * 3;
        this.ribbon(
          10,
          () => 0xff2050,
          (t) => (1 - t) * 0.7,
          -5 + j(),
          6,
        );
        this.ribbon(
          10,
          () => 0x39ff88,
          (t) => (1 - t) * 0.7,
          0,
          6,
        );
        this.ribbon(
          10,
          () => 0x20c8ff,
          (t) => (1 - t) * 0.7,
          5 + j(),
          6,
        );
        break;
      }
      case "nova":
        this.ribbon(
          26,
          (t) => hsv((t * 0.9 + this.time * 0.45) % 1, 0.8, 1),
          (t) => (1 - t) * 0.6,
        );
        this.ribbon(
          6,
          () => 0xffffff,
          (t) => (1 - t) * 0.6,
        );
        break;
    }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
  }
}

export { TAU };
