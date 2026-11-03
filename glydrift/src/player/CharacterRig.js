// Visual rig for a character: pixel sprite, stepped trail, idle animation, flap effect and
// death explosion. Used in-game and for the live previews on the menus.
import Phaser from "phaser";
import { HERO_SCALE } from "../config.js";

const ADD = Phaser.BlendModes.ADD;
const NORMAL = Phaser.BlendModes.NORMAL;
const TAU = Math.PI * 2;

function hsv(h, s, v) {
  const c = Phaser.Display.Color.HSVToRGB(h, s, v);
  return (c.r << 16) | (c.g << 8) | c.b;
}

export class CharacterRig {
  constructor(scene, def, fx, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.fx = fx;
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
    this.trailTime = this.lowGfx ? 0.32 : 0.5;
    this.emitT = 0;
    this.glitchT = 0;
    this.offX = 0;
    this.offY = 0;
    const depth = opts.depth ?? 30;

    this.trailG = scene.add.graphics().setDepth(depth - 2);
    this.px = def.pixel; // every hero is pixel art: atlas frames + stepped trail colours
    this.sprite = scene.add.image(this.x, this.y, this.px.atlas, this.px.frames[1]).setDepth(depth);
    this.extras = [];
    if (def.id === "shade") {
      this.afterImages = [];
      for (let i = 0; i < 7; i++) {
        const im = scene.add
          .image(0, 0, this.px.atlas, this.px.frames[0])
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
    return [this.trailG, this.sprite, ...this.extras, ...(this.afterImages || [])];
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  setVisible(v) {
    this.sprite.setVisible(v);
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
    if (!this.fx) return;
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
      default:
        if (def.fx?.flap) {
          const { kind, color, n } = def.fx.flap;
          fx.burst(kind, x, y + oy, n, color, { angle: down });
        }
        break;
      case "smash":
        // the punch: a cavitation shockwave in front + rainbow sparks
        fx.ring(x + 18 * this.u, y, hsv((this.time * 0.6) % 1, 0.7, 1), {
          scale: 0.5 * this.u,
          duration: 260,
        });
        fx.burst("star", x + 14 * this.u, y, 5, hsv(Math.random(), 0.7, 1), {
          speed: { min: 120, max: 320 },
        });
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
  /** Returns hints for the scene's death effects (flash strength, camera shake). */
  die() {
    this.dead = true;
    this.setVisible(false);
    const { x, y, def, fx } = this;
    const hints = { flash: 0.35, shake: 0.018 };
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
        hints.flash = 0.1;
        break;
      default:
        if (def.fx?.death) {
          for (const { kind, color, n } of def.fx.death)
            fx.burst(kind, x, y, n, color, { speed: { min: 100, max: 520 } });
        }
        break;
      case "smash":
        // the punch: a cavitation shockwave in front + rainbow sparks
        fx.ring(x + 18 * this.u, y, hsv((this.time * 0.6) % 1, 0.7, 1), {
          scale: 0.5 * this.u,
          duration: 260,
        });
        fx.burst("star", x + 14 * this.u, y, 5, hsv(Math.random(), 0.7, 1), {
          speed: { min: 120, max: 320 },
        });
        break;
      case "nova":
        fx.ring(x, y, 0xffffff, { scale: 5, duration: 1000 });
        fx.ring(x, y, 0xff7ad9, { scale: 3, duration: 800 });
        fx.ring(x, y, 0x7ae8ff, { scale: 2, duration: 650 });
        for (let i = 0; i < 4; i++)
          fx.burst("star", x, y, 16, hsv(i / 4, 0.5, 1), { speed: { min: 200, max: 760 } });
        fx.burst("spark", x, y, 40, 0xfff1a8, { speed: { min: 300, max: 900 } });
        hints.flash = 0.85;
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
    im.setFrame(this.sprite.frame.name).setBlendMode(NORMAL).setTintFill(0x9a5cff);
    im.setPosition(Math.round(this.x), Math.round(this.y)).setAngle(this.sprite.angle);
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
    let wingFrame = 0; // wing pose for "wings" mode heroes (Volt, Ember)

    switch (def.id) {
      case "volt": {
        // wings: quick down-stroke on flap, lazy glide cycle otherwise
        let vf;
        if (this.flapT < 0.24) vf = [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))];
        else vf = [0, 1, 2, 1][Math.floor(this.time * 6) % 4];
        wingFrame = vf;
        if (!this.dead && this.fx) {
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
        wingFrame = f;
        if (!this.dead && this.fx) {
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
        this.sprite.setTint(Math.sin(this.time * 6) > 0.85 ? 0xffffff : 0xe6fbff);
        if (!this.dead && this.fx) {
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
          this.offX = (Math.random() - 0.5) * 8;
          this.offY = (Math.random() - 0.5) * 6;
        }
        break;
      case "nova":
        if (!this.dead && this.fx) {
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
    // pixel sprite: frame from the same wing logic, crisp scale steps, tilt in 15° steps
    const mode = this.px.mode || "wings";
    let f;
    if (mode === "idle") f = Math.floor(this.time * 5) % 3;
    else if (mode === "glitch") f = this.glitchT > 0 ? 2 : Math.floor(this.time * 3) % 2;
    else if (mode === "spin") f = Math.floor(this.time * 20) % 3;
    else if (mode === "punch") f = this.flapT < 0.14 ? 2 : Math.floor(this.time * 6) % 2;
    else if (mode === "flap")
      f =
        this.flapT < 0.24
          ? [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))]
          : [0, 1, 2, 1][Math.floor(this.time * 6) % 4];
    else f = wingFrame;
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
  }

  // ------------------------------------------------------------------ trails
  drawTrail() {
    const g = this.trailG;
    g.clear();
    if (this.points.length < 2) return;
    // stepped pixel trail: squares snapped to the art-pixel grid, shrinking + fading
    const P = 4;
    const cols = this.trailOverride || this.px.trail; // Lucky Run: golden trail
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
  }

  destroy() {
    for (const o of this.objects) o.destroy();
  }
}

export { TAU };
