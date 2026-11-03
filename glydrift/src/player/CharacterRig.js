// Visual rig for a character: pixel sprite, stepped trail, idle animation, flap effect and
// death explosion. Used in-game and for the live previews on the menus.
import Phaser from "phaser";
import { HERO_SCALE } from "../config.js";
import { COLLECTIONS, Shop, SKINS } from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { HEAD_ANCHORS } from "../pixel/common.js";
import { greyAtlas } from "../pixel/grayHero.js";
import { Sfx } from "../audio/sfx.js";
import { AnimalBits } from "./animalFx.js";

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
    this.sounds = !!opts.sounds; // only the in-game hero plays its own flex / death sounds
    this.flexT = 0; // YARMS: time left in the flex pose
    this.nextFlex = 3 + Math.random() * 3;
    this.shineT = 0;
    this.deathFlex = 0;
    const depth = opts.depth ?? 30;

    this.trailG = scene.add.graphics().setDepth(depth - 2);
    this.px = def.pixel; // every hero is pixel art: atlas frames + stepped trail colours
    this.sprite = scene.add.image(this.x, this.y, this.px.atlas, this.px.frames[1]).setDepth(depth);
    this.extras = [];
    // shop cosmetics: the player's loadout by default; previews pass their own
    this.glow = scene.add
      .image(this.x, this.y, "glow")
      .setBlendMode(ADD)
      .setVisible(false)
      .setDepth(depth - 1);
    this.hat = scene.add
      .image(0, 0, "cosm", "hat_crown")
      .setVisible(false)
      .setDepth(depth + 0.5);
    this.extras.push(this.glow, this.hat);
    // YARMS: the gold shine that sweeps across the muscles on a big flex
    if (this.px.mode === "yarms") {
      this.shineG = scene.add
        .graphics()
        .setDepth(depth + 0.4)
        .setBlendMode(ADD);
      this.extras.push(this.shineG);
    }
    this.setCosmetics(opts.cosmetics === undefined ? Shop.loadout() : opts.cosmetics);
    // animal heroes: trails, lights, reactions and special deaths (see animalFx.js)
    this.an = def.animal ? new AnimalBits(this) : null;
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
    return [
      this.trailG,
      this.sprite,
      ...this.extras,
      ...(this.afterImages || []),
      ...(this.an?.objects || []),
    ];
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    for (const e of this.extras) e.setVisible(v);
    if (v) this.applyCosmeticVisibility();
  }

  /** Equip a loadout ({ trail, death, hat, skin, flap, title } of cosmetic ids, or null). */
  setCosmetics(lo) {
    this.cos = lo || {};
    this.skin = SKINS[this.cos.skin] || null;
    const set = COLLECTIONS.find((c) => c.id === this.cos.title);
    this.setGlow = set && (this.cos.titleForce || Shop.setComplete(set)) ? set.glow : null;
    this.sprite.clearTint();
    // skins recolour a greyscale copy of the hero (so gold reads gold on any hero)
    const key = this.skin ? greyAtlas(this.scene, this.def) : this.px.atlas;
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key, this.sprite.frame.name);
    if (this.skin) this.sprite.setTint(this.skin.tint);
    const fit = HAT_FIT[this.cos.hat];
    if (fit) this.hat.setFrame(fit.frame).setOrigin(0.5, 1);
    this.applyCosmeticVisibility();
  }

  applyCosmeticVisibility() {
    if (this.dead) return;
    this.hat.setVisible(!!HAT_FIT[this.cos.hat] && this.sprite.visible);
    const g = this.setGlow ?? this.skin?.glow;
    this.glow.setVisible(!!g && this.sprite.visible);
    if (g) this.glow.setTint(g);
  }

  reset(x, y) {
    this.dead = false;
    this.frozen = false;
    this.sprite.setAlpha(1);
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
  /**
   * YARMS's double-bicep flex. sparkle: a tiny flex sparkle (near-miss); shine: a gold shine
   * sweeps across the muscles (new best / showcase); big: hold it longer.
   */
  flex({ sparkle = false, shine = false, big = false } = {}) {
    if (this.px.mode !== "yarms" || this.dead) return;
    this.flexT = big ? 0.95 : 0.55;
    this.sx = 0.86;
    this.sy = 1.22;
    if (shine) this.shineT = 0.7;
    if (this.sounds || big) Sfx.flex();
    if (!this.fx) return;
    const u = this.u;
    if (sparkle || big)
      for (const side of [-1, 1])
        this.fx.burst("star", this.x + side * 18 * u, this.y - 16 * u, big ? 6 : 3, 0xffd23f, {
          speed: { min: 40, max: 160 },
        });
    if (big) this.fx.ring(this.x, this.y, 0xffd23f, { scale: 0.9 * u, duration: 420, width: 2 });
  }

  flap() {
    this.flapT = 0;
    if (this.px.mode === "yarms") {
      // the big floppy swim stroke: squash flat and wide, then spring back up tall
      this.sx = 1.42;
      this.sy = 0.62;
      this.flexT = 0;
    } else {
      this.sx = 0.72;
      this.sy = 1.34;
    }
    if (!this.fx) return;
    const { x, y, def, fx } = this;
    const down = this.gravityDir > 0 ? { min: 50, max: 130 } : { min: 230, max: 310 };
    const oy = 12 * this.gravityDir * this.u;
    this.cosmeticFlap(x, y + oy, down);
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
        this.an?.flap();
        break;
      case "yarms":
        // a whoosh puff under the stroke and sparkles off both hands
        fx.burst("smoke", x, y + oy * 1.4, 4, 0xfff0d8, {
          angle: down,
          speed: { min: 40, max: 140 },
        });
        for (const side of [-1, 1])
          fx.burst("pixel", x + side * 16 * this.u, y + 10 * this.u, 3, 0xffd23f, {
            speed: { min: 60, max: 200 },
          });
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

  /** Second leap in the air: a lily-pad shockwave below and a spray of leaves. */
  doubleJump() {
    this.flapT = 0;
    this.sx = 0.6;
    this.sy = 1.5;
    if (!this.fx) return;
    const { x, y, fx, def } = this;
    const oy = 16 * this.gravityDir * this.u;
    fx.ring(x, y + oy, def.color, { scale: 0.9 * this.u, duration: 380, width: 3 });
    fx.ring(x, y + oy, 0xffffff, { scale: 0.55 * this.u, duration: 260 });
    const down = this.gravityDir > 0 ? { min: 30, max: 150 } : { min: 210, max: 330 };
    fx.burst("dot", x, y + oy, 14, 0x8aff7a, { angle: down, speed: { min: 120, max: 360 } });
    fx.burst("star", x, y, 6, def.color2 ?? 0xffffff);
  }

  cosmeticFlap(x, y, down) {
    const fx = this.fx;
    switch (this.cos.flap) {
      case "flap_sparks":
        fx.burst("spark", x, y, 9, 0xffd23f, { angle: down, speed: { min: 160, max: 420 } });
        break;
      case "flap_stars":
        for (let i = 0; i < 3; i++)
          fx.burst("star", x, y, 2, hsv(Math.random(), 0.55, 1), { angle: down });
        break;
      case "flap_feathers":
        fx.burst("feather", x, y, 4, 0xffffff, { angle: down, speed: { min: 40, max: 140 } });
        break;
      case "flap_notes":
        fx.burst("note", x - 10, y - 10, 2, 0x3ef4ff, { angle: { min: 200, max: 250 } });
        fx.burst("note", x - 10, y - 10, 1, 0xff4fd8, { angle: { min: 200, max: 250 } });
        break;
    }
  }

  /** Shop death effect, played on top of the hero's own explosion. */
  cosmeticDeath(x, y) {
    const fx = this.fx;
    const scene = this.scene;
    const { def } = this;
    switch (this.cos.death) {
      case "death_shatter":
        fx.burst("pixel", x, y, 50, def.color, { speed: { min: 200, max: 700 } });
        fx.burst("pixel", x, y, 30, def.color2 ?? 0xffffff, { speed: { min: 100, max: 500 } });
        break;
      case "death_confetti":
        for (const c of [0xff3a5a, 0xffe14d, 0x39ff88, 0x3ef4ff, 0xff4fd8])
          fx.burst("confetti", x, y, 16, c, {
            angle: { min: 200, max: 340 },
            speed: { min: 250, max: 650 },
          });
        break;
      case "death_ghost": {
        const gh = scene.add
          .image(x, y, "fx_ghost")
          .setDepth(this.sprite.depth + 2)
          .setAlpha(0.9);
        scene.tweens.add({
          targets: gh,
          y: y - 220,
          alpha: 0,
          duration: 1500,
          ease: "Sine.easeOut",
          onComplete: () => gh.destroy(),
        });
        scene.tweens.add({
          targets: gh,
          x: x + 18,
          duration: 375,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
        });
        break;
      }
      case "death_firework":
        [0xff4fd8, 0xffd23f, 0x3ef4ff].forEach((c, i) =>
          scene.time.delayedCall(i * 220, () => {
            const fx2 = x + (i - 1) * 70;
            const fy = y - 60 - i * 30;
            fx.ring(fx2, fy, c, { scale: 1.4, duration: 520, width: 2 });
            fx.burst("star", fx2, fy, 18, c, { speed: { min: 180, max: 420 } });
            fx.burst("spark", fx2, fy, 14, 0xffffff);
          }),
        );
        break;
      case "death_blackhole": {
        const g = scene.add.graphics({ x, y }).setDepth(this.sprite.depth + 2);
        g.fillStyle(0x000000, 1).fillCircle(0, 0, 40);
        g.lineStyle(6, 0xb45cff, 1).strokeCircle(0, 0, 44);
        g.lineStyle(2, 0x7ad8ff, 0.8).strokeCircle(0, 0, 52);
        g.setScale(0);
        scene.tweens.chain({
          targets: g,
          tweens: [
            { scale: 1.3, angle: 180, duration: 260, ease: "Back.easeOut" },
            { scale: 1.1, angle: 360, duration: 500 },
            { scale: 0, angle: 720, duration: 280, ease: "Cubic.easeIn" },
          ],
          onComplete: () => g.destroy(),
        });
        fx.burst("dot", x, y, 30, 0xb45cff, { speed: { min: 40, max: 160 } });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ death
  /** Returns hints for the scene's death effects (flash strength, camera shake). */
  die() {
    const hints = { flash: 0.35, shake: 0.018 };
    if (this.px.mode === "yarms" && !this.dead) {
      // one last flex... then the burst (see updateYarms → yarmsExplode)
      this.dead = true;
      this.deathFlex = 0.32;
      this.flexT = 0.32;
      this.sx = 0.8;
      this.sy = 1.3;
      if (this.sounds) Sfx.flex();
      return hints;
    }
    this.dead = true;
    const { x, y, def, fx } = this;
    // animals with a death move (belly slide, last lap, snapping chains) burst at its end
    if (this.an && fx && this.an.die((bx, by) => this.animalBurst(bx, by))) return hints;
    this.setVisible(false);
    if (!fx) return hints;
    if (this.an) {
      this.animalBurst(x, y);
      return hints;
    }
    this.cosmeticDeath(x, y);
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

  /** An animal's death burst: shop death FX, shards + ring in its colour, its own particles. */
  animalBurst(x, y) {
    const { def, fx } = this;
    if (!fx) return;
    this.cosmeticDeath(x, y);
    fx.burst("shard", x, y, 22, def.color);
    fx.ring(x, y, def.color, { scale: 1.5, duration: 600 });
    for (const { kind, color, n, up } of def.fx?.death || [])
      fx.burst(kind, x, y, n, color, {
        angle: up ? { min: 200, max: 340 } : undefined,
        speed: { min: 100, max: 520 },
      });
  }

  /** Near-miss / new best / Second Chance reactions (animals; YARMS uses flex()). */
  onNear() {
    this.an?.near();
  }
  onBest() {
    this.an?.best();
  }
  onRevive() {
    this.an?.revive();
  }

  yarmsExplode() {
    this.setVisible(false);
    if (this.sounds) Sfx.deflate();
    if (!this.fx) return;
    const { x, y, fx } = this;
    this.cosmeticDeath(x, y);
    fx.burst("pixel", x, y, 60, 0xffd23f, { speed: { min: 150, max: 650 } });
    fx.burst("pixel", x, y, 24, 0xf0a070, { speed: { min: 100, max: 420 } });
    fx.burst("sweat", x, y - 10, 16, 0xbfe8ff, {
      angle: { min: 200, max: 340 },
      speed: { min: 200, max: 520 },
    });
    fx.burst("dumbbell", x, y - 10, 4, 0xffffff, {
      angle: { min: 220, max: 320 },
      speed: { min: 300, max: 560 },
    });
    fx.ring(x, y, 0xffd23f, { scale: 1.8, duration: 600, width: 3 });
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

    if (this.px.mode === "yarms") this.updateYarms(dt);
    if (this.an) this.an.update(dt, scroll);
    if (this.frozen) {
      // a death move is animating the sprite: just keep the trail fading
      this.drawTrail();
      return;
    }

    // shop skin: the tint wins over per-hero tints; extras sparkle / sheen
    if (this.skin) {
      let tint = this.skin.tint;
      if (this.skin.sheen && Math.sin(this.time * 2.2) > 0.93) tint = 0xffffff;
      this.sprite.setTint(tint);
      if (this.skin.sparkle && !this.dead && this.fx && Math.random() < dt * 4)
        this.fx.burst(
          "star",
          this.x + (Math.random() - 0.5) * 30 * this.u,
          this.y + (Math.random() - 0.5) * 30 * this.u,
          1,
          this.skin.sparkle,
          { speed: { min: 5, max: 30 } },
        );
    }
    if (this.cos.trail === "trail_money" && !this.dead && this.fx && !this.trailOverride) {
      this.cashT = (this.cashT || 0) - dt;
      if (this.cashT <= 0) {
        this.cashT = this.lowGfx ? 0.2 : 0.09;
        this.fx.burst("cash", this.x - 14 * this.u, this.y, 1, 0xffffff, {
          angle: { min: 160, max: 200 },
          speed: { min: 20, max: 80 },
        });
      }
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
    else if (mode === "animal") f = this.an ? this.an.frame() : 0;
    else if (mode === "yarms")
      f = this.flexT > 0 ? 3 : this.flapT < 0.17 ? 2 : Math.floor(this.time * 7) % 2;
    else if (mode === "punch" || mode === "leap")
      f = this.flapT < 0.14 ? 2 : Math.floor(this.time * 6) % 2;
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
    // YARMS gets exaggerated (goofy) squash & stretch steps
    const big = mode === "yarms";
    const step = (v) =>
      v < 0.8 && big ? 0.75 : v < 0.9 ? 0.875 : v > 1.25 && big ? 1.25 : v > 1.1 ? 1.125 : 1;
    sp.setScale(m * step(this.sx), m * step(this.sy) * flip);
    this.placeCosmetics();
    this.an?.place(scroll);
    this.drawTrail();
  }

  updateYarms(dt) {
    if (this.flexT > 0) this.flexT -= dt;
    if (this.deathFlex > 0) {
      this.deathFlex -= dt;
      if (this.deathFlex <= 0) this.yarmsExplode();
      return;
    }
    if (this.dead) return;
    // every few seconds of gliding: a quick double-bicep flex
    if (this.flapT > 0.6 && this.flexT <= 0) {
      this.nextFlex -= dt;
      if (this.nextFlex <= 0) {
        this.nextFlex = 3 + Math.random() * 3.5;
        this.flex();
      }
    }
    // sweat drops flying off the hands
    if (this.fx && !this.trailOverride && !this.cos.trail) {
      this.sweatT = (this.sweatT || 0) - dt;
      if (this.sweatT <= 0) {
        this.sweatT = this.lowGfx ? 0.3 : 0.14;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.fx.burst("sweat", this.x + side * 16 * this.u, this.y - 4 * this.u, 1, 0xbfe8ff, {
          angle: { min: 180, max: 240 },
          speed: { min: 60, max: 180 },
        });
      }
    }
    // the gold shine sweep across the muscles
    const g = this.shineG;
    if (g) {
      g.clear();
      if (this.shineT > 0) {
        this.shineT -= dt;
        const sp = this.sprite;
        const w = sp.displayWidth;
        const h = Math.abs(sp.displayHeight);
        const k = 1 - this.shineT / 0.7;
        const cx = sp.x - w / 2 + k * w * 1.2;
        g.fillStyle(0xfff6c0, 0.55 * Math.sin(Math.min(1, k) * Math.PI));
        g.fillPoints(
          [
            { x: cx - 10, y: sp.y + h / 2 },
            { x: cx + 6, y: sp.y + h / 2 },
            { x: cx + 22, y: sp.y - h / 2 },
            { x: cx + 6, y: sp.y - h / 2 },
          ],
          true,
        );
      }
    }
  }

  /** Hat on the head (any hero: HEAD_ANCHORS), glow behind the body. */
  placeCosmetics() {
    const sp = this.sprite;
    const vis = sp.visible && !this.dead;
    if (this.glow.visible || (vis && (this.setGlow ?? this.skin?.glow))) {
      const pulse = 1 + Math.sin(this.time * 3) * 0.08;
      this.glow
        .setVisible(vis && !!(this.setGlow ?? this.skin?.glow))
        .setPosition(sp.x, sp.y)
        .setScale(1.15 * Math.abs(sp.scaleX) * pulse)
        .setAlpha(this.setGlow ? 0.55 : 0.4);
    }
    const fit = HAT_FIT[this.cos.hat];
    if (!fit || !vis) {
      this.hat.setVisible(false);
      return;
    }
    const a = HEAD_ANCHORS[this.def.id] || { x: 2, y: -8 };
    const k = 4 * sp.scaleX; // art px → world px (atlas frames are drawn at 4x)
    const flip = sp.scaleY < 0 ? -1 : 1;
    const ox = (a.x + fit.dx) * k;
    const oy = (a.y + fit.dy) * k * flip;
    const r = sp.rotation;
    this.hat
      .setVisible(true)
      .setPosition(
        sp.x + ox * Math.cos(r) - oy * Math.sin(r),
        sp.y + ox * Math.sin(r) + oy * Math.cos(r),
      )
      .setRotation(r)
      .setScale(sp.scaleX, sp.scaleY);
  }

  // ------------------------------------------------------------------ trails
  drawTrail() {
    const g = this.trailG;
    g.clear();
    if (this.points.length < 2) return;
    // stepped pixel trail: squares snapped to the art-pixel grid, shrinking + fading
    const P = 4;
    const style = this.trailOverride ? null : this.cos.trail;
    if (style && this.drawCosmeticTrail(g, style, P)) return;
    if (!this.trailOverride && this.px.mode === "yarms") return this.drawYarmsTrail(g);
    if (!this.trailOverride && this.an?.trail(g)) return;
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

  /** YARMS: golden motion lines streaming off both arms and the shoulders. */
  drawYarmsTrail(g) {
    const pts = this.points;
    const n = pts.length;
    for (const [dy, w] of [
      [-9, 2],
      [0, 3],
      [9, 2],
    ]) {
      for (let i = 1; i < n; i += 2) {
        const a = pts[i - 1];
        const b = pts[i];
        const t = i / n;
        g.lineStyle(
          Math.max(1, w * (1 - t) * this.sizeMul + 1),
          t < 0.4 ? 0xfff0a0 : 0xffd23f,
          0.9 - t * 0.85,
        );
        g.lineBetween(a.x, a.y + dy * this.u, b.x, b.y + dy * this.u);
      }
    }
  }

  /** Shop trails. Returns false for styles that fall back to the stepped squares. */
  drawCosmeticTrail(g, style, P) {
    const pts = this.points;
    const n = pts.length;
    const snap = (v) => Math.round(v / P) * P;
    const sq = (x, y, size, col, a) => {
      g.fillStyle(col, a);
      g.fillRect(snap(x - size / 2), snap(y - size / 2), size, size);
    };
    const T = this.time;
    switch (style) {
      case "trail_fire":
      case "trail_rainbow":
      case "trail_galaxy":
      case "trail_money": {
        const fire = [0xfff1a0, 0xffd23f, 0xffa21a, 0xff5a1a, 0xb01000];
        const gal = [0xffffff, 0x9ab8ff, 0xb45cff, 0x5a2ab0, 0x2a1660];
        const cash = [0xfff6c0, 0xffd23f, 0x39ff88, 0x1fae5a];
        for (let i = 1; i < n; i += 2) {
          const p = pts[i];
          const t = i / n;
          let size = Math.max(1, Math.round((1 - t) * 4 * this.sizeMul)) * P;
          let col;
          if (style === "trail_fire") {
            col = fire[Math.min(4, Math.floor(t * 5))];
            if (Math.random() < 0.3) size += P;
          } else if (style === "trail_rainbow") col = hsv((t * 1.2 + T * 0.6) % 1, 0.8, 1);
          else if (style === "trail_galaxy") col = gal[Math.min(4, Math.floor(t * 5))];
          else col = cash[Math.min(3, Math.floor(t * 4))];
          sq(
            p.x,
            p.y + (style === "trail_fire" ? -t * 14 : 0),
            size,
            col,
            t < 0.15 ? 1 : 0.95 - t * 0.8,
          );
          if (style === "trail_galaxy" && (i * 7 + Math.floor(T * 8)) % 9 === 0)
            sq(p.x + ((i * 13) % 17) - 8, p.y + ((i * 7) % 15) - 7, P, 0xffffff, 1 - t);
        }
        return true;
      }
      case "trail_lightning": {
        g.lineStyle(3 * this.sizeMul + 1, 0xbff4ff, 0.95);
        g.beginPath();
        for (let i = 0; i < n; i += 2) {
          const p = pts[i];
          const j = i === 0 ? 0 : (Math.random() - 0.5) * 18 * (i / n + 0.3);
          if (i === 0) g.moveTo(p.x, p.y);
          else g.lineTo(p.x, p.y + j);
        }
        g.strokePath();
        g.lineStyle(7, 0x2a8aff, 0.25);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        g.lineTo(pts[n - 1].x, pts[n - 1].y);
        g.strokePath();
        return true;
      }
      case "trail_hearts": {
        for (let i = 2; i < n; i += 4) {
          const p = pts[i];
          const t = i / n;
          const a = 1 - t;
          const c = i % 8 < 4 ? 0xff3a8a : 0xff8ab8;
          const x = snap(p.x);
          const y = snap(p.y);
          g.fillStyle(c, a);
          g.fillRect(x - P, y - P, P, P).fillRect(x + P, y - P, P, P);
          g.fillRect(x - P * 1.5, y, P * 4, P).fillRect(x - P / 2, y + P, P * 2, P);
        }
        return true;
      }
      case "trail_glitch": {
        for (let i = 1; i < n; i += 2) {
          const p = pts[i];
          const t = i / n;
          const size = Math.max(1, Math.round((1 - t) * 4 * this.sizeMul)) * P;
          const a = 0.9 - t * 0.7;
          const jx = Math.random() < 0.15 ? (Math.random() - 0.5) * 24 : 0;
          sq(p.x - 4 + jx, p.y, size, 0xff2050, a * 0.8);
          sq(p.x + 4 + jx, p.y, size, 0x20c8ff, a * 0.8);
          sq(p.x + jx, p.y, size - P, 0x39ff88, a);
        }
        return true;
      }
    }
    return false;
  }

  destroy() {
    this.scene.tweens?.killTweensOf(this.sprite);
    for (const o of this.objects) o.destroy();
  }
}

export { TAU };
