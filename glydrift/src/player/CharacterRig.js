// Visual rig for a character: pixel sprite, stepped trail, idle animation, flap effect and
// death explosion. Used in-game and for the live previews on the menus.
import Phaser from "phaser";
import { HERO_SCALE } from "../config.js";
import { TILT } from "../tuning.js";
import { COLLECTIONS, Shop, SKINS } from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { HEAD_ANCHORS } from "../pixel/common.js";
import { greyAtlas } from "../pixel/grayHero.js";
import { Sfx } from "../audio/sfx.js";
import { AnimalBits } from "./animalFx.js";
import { ToeBits } from "./mattoeFx.js";
import { FalconBits } from "./spliceFx.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";

const ADD = Phaser.BlendModes.ADD;
/** Blend two 0xRRGGBB colours (t = 0 → a, 1 → b). */
const mixCol = (a, b, t) => {
  const ch = (sh) =>
    Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
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
    this.sprite = scene.add
      .image(this.x, this.y, this.px.atlas, this.px.frames[1])
      .setDepth(depth);
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
    this.setCosmetics(
      opts.cosmetics === undefined ? Shop.loadout() : opts.cosmetics,
    );
    // animal heroes: trails, lights, reactions and special deaths (see animalFx.js)
    this.an = def.animal ? new AnimalBits(this) : null;
    // MATTOE: the always-on aura, footprints and the stubbed-toe death (see mattoeFx.js)
    this.toe = this.px.mode === "toe" ? new ToeBits(this, depth) : null;
    // SXE (id "splice"): dive tucks, barrel rolls, the sonic boom, wind-streak trail, perch showcase
    this.falcon =
      this.px.mode === "falcon" ? new FalconBits(this, depth) : null;
    // 손주원: the hover-thruster glow under the board
    if (this.px.mode === "surf") {
      this.roarT = 0;
      this.nextRoar = 1.5 + Math.random() * 2;
      this.thrustK = 0;
      this.thruster = scene.add
        .image(this.x, this.y, "glow")
        .setBlendMode(ADD)
        .setTint(0x3ef4ff)
        .setDepth(depth - 1);
      this.extras.push(this.thruster);
    }
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
      ...(this.toe?.objects || []),
      ...(this.falcon?.objects || []),
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
    this.setGlow =
      set && (this.cos.titleForce || Shop.setComplete(set)) ? set.glow : null;
    this.sprite.clearTint();
    // skins recolour a greyscale copy of the hero (so gold reads gold on any hero)
    const key = this.skin ? greyAtlas(this.scene, this.def) : this.px.atlas;
    if (this.sprite.texture.key !== key)
      this.sprite.setTexture(key, this.sprite.frame.name);
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
    this.falcon?.reset(); // SXE: undo the death tumble, or he stays hidden next run
    this.setVisible(true);
    this.trailG.clear();
    if (this.afterImages)
      for (const im of this.afterImages) im.setVisible(false).setActive(false);
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
        this.fx.burst(
          "star",
          this.x + side * 18 * u,
          this.y - 16 * u,
          big ? 6 : 3,
          0xffd23f,
          {
            speed: { min: 40, max: 160 },
          },
        );
    if (big)
      this.fx.ring(this.x, this.y, 0xffd23f, { scale: 0.9 * u, duration: 420 });
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
    const down =
      this.gravityDir > 0 ? { min: 50, max: 130 } : { min: 230, max: 310 };
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
        fx.burst("smoke", x, y + oy, 4, 0x3a1466, {
          angle: down,
          speed: { min: 30, max: 120 },
        });
        this.stampAfterImage(0.75);
        break;
      case "frost":
        fx.burst("flake", x, y + oy, 7, 0xdff8ff, { angle: down });
        break;
      case "glitch":
        for (const c of [0xff2050, 0x39ff88, 0x20c8ff])
          fx.burst("pixel", x, y, 4, c);
        this.glitchT = 0.14;
        break;
      default:
        if (def.fx?.flap) {
          const { kind, color, n } = def.fx.flap;
          fx.burst(kind, x, y + oy, n, color, { angle: down });
        }
        this.an?.flap();
        this.toe?.flap();
        this.falcon?.flap();
        break;
      case "yarms":
        // a whoosh puff under the stroke and sparkles off both hands
        fx.burst("smoke", x, y + oy * 1.4, 4, 0xfff0d8, {
          angle: down,
          speed: { min: 40, max: 140 },
        });
        for (const side of [-1, 1])
          fx.burst(
            "pixel",
            x + side * 16 * this.u,
            y + 10 * this.u,
            3,
            0xffd23f,
            {
              speed: { min: 60, max: 200 },
            },
          );
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
      case "sonjuwon": {
        // the board kicks up and the thrusters blast a burst of cyan energy
        const by = y + this.boardDY();
        this.thrustK = 1;
        fx.burst("spark", x - 6 * this.u, by, 12, 0x3ef4ff, {
          angle: down,
          speed: { min: 200, max: 480 },
        });
        fx.burst("dot", x, by, 8, 0xbffcff, {
          angle: down,
          speed: { min: 80, max: 260 },
        });
        fx.ring(x, by, 0x3ef4ff, {
          scale: 0.8 * this.u,
          duration: 300,
          width: 0.35,
        }); // flat wave
        fx.lightning(x, y - 6 * this.u, 0x9af4ff, 1, 26 * this.u);
        break;
      }
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
    fx.ring(x, y + oy, def.color, { scale: 0.9 * this.u, duration: 380 });
    fx.ring(x, y + oy, 0xffffff, { scale: 0.55 * this.u, duration: 260 });
    const down =
      this.gravityDir > 0 ? { min: 30, max: 150 } : { min: 210, max: 330 };
    fx.burst("dot", x, y + oy, 14, 0x8aff7a, {
      angle: down,
      speed: { min: 120, max: 360 },
    });
    fx.burst("star", x, y, 6, def.color2 ?? 0xffffff);
  }

  cosmeticFlap(x, y, down) {
    const fx = this.fx;
    switch (this.cos.flap) {
      case "flap_sparks":
        fx.burst("spark", x, y, 9, 0xffd23f, {
          angle: down,
          speed: { min: 160, max: 420 },
        });
        break;
      case "flap_stars":
        for (let i = 0; i < 3; i++)
          fx.burst("star", x, y, 2, hsv(Math.random(), 0.55, 1), {
            angle: down,
          });
        break;
      case "flap_feathers":
        fx.burst("feather", x, y, 4, 0xffffff, {
          angle: down,
          speed: { min: 40, max: 140 },
        });
        break;
      case "flap_notes":
        fx.burst("note", x - 10, y - 10, 2, 0x3ef4ff, {
          angle: { min: 200, max: 250 },
        });
        fx.burst("note", x - 10, y - 10, 1, 0xff4fd8, {
          angle: { min: 200, max: 250 },
        });
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
        fx.burst("pixel", x, y, 50, def.color, {
          speed: { min: 200, max: 700 },
        });
        fx.burst("pixel", x, y, 30, def.color2 ?? 0xffffff, {
          speed: { min: 100, max: 500 },
        });
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
      case "death_glitchout":
        // the hero splits into RGB shards that jitter away
        for (const c of [0xff2050, 0x39ff88, 0x20c8ff])
          fx.burst("pixel", x + (Math.random() - 0.5) * 30, y, 26, c, {
            angle: { min: 160, max: 200 },
            speed: { min: 150, max: 650 },
          });
        fx.ring(x, y, 0x39ff88, { scale: 1.2, duration: 260 });
        break;
      case "death_supernova":
        // a white-gold star that flares, then a slow shockwave
        fx.ring(x, y, 0xffffff, { scale: 0.8, duration: 200 });
        scene.time.delayedCall(120, () => {
          fx.ring(x, y, 0xffd23f, { scale: 3.2, duration: 900 });
          fx.burst("star", x, y, 40, 0xffd23f, {
            speed: { min: 220, max: 780 },
          });
          fx.burst("spark", x, y, 24, 0xffffff);
        });
        break;
      case "death_firework":
        [0xff4fd8, 0xffd23f, 0x3ef4ff].forEach((c, i) =>
          scene.time.delayedCall(i * 220, () => {
            const fx2 = x + (i - 1) * 70;
            const fy = y - 60 - i * 30;
            fx.ring(fx2, fy, c, { scale: 1.4, duration: 520 });
            fx.burst("star", fx2, fy, 18, c, { speed: { min: 180, max: 420 } });
            fx.burst("spark", fx2, fy, 14, 0xffffff);
          }),
        );
        break;
      case "death_pp_fireworks": {
        // three pixel-firework shells pop over the spot, one after another
        const calm = reduceFlashing();
        const cols = [0xff4fd8, 0x3ef4ff, 0xffd23f];
        cols.forEach((c, i) =>
          scene.time.delayedCall(80 + i * 260, () => {
            const ex = x + (i - 1) * 80;
            const ey = y - 80 - (i % 2) * 50;
            fx.burst("pixel", ex, ey, this.lowGfx ? 16 : 30, c, {
              speed: { min: 160, max: 440 },
            });
            fx.burst("pixel", ex, ey, this.lowGfx ? 6 : 12, 0xffffff, {
              speed: { min: 60, max: 200 },
            });
            if (!calm)
              fx.ring(ex, ey, c, { scale: 1.1, duration: 360, alpha: 0.7 });
          }),
        );
        // the rocket trails up from the hero
        fx.burst("spark", x, y, 8, 0xfff0a0, {
          angle: { min: 250, max: 290 },
          speed: { min: 300, max: 600 },
        });
        break;
      }
      case "death_pp_melt": {
        // the hero melts into a dark puddle of abyss goo that drips and fades
        const sp = this.sprite;
        const ghost = scene.add
          .image(sp.x, sp.y, sp.texture.key, sp.frame.name)
          .setScale(sp.scaleX, sp.scaleY)
          .setTint(0x6a2a8a)
          .setDepth(sp.depth + 1);
        scene.tweens.add({
          targets: ghost,
          scaleY: sp.scaleY * 0.15,
          scaleX: sp.scaleX * 1.5,
          y: sp.y + 40,
          alpha: 0,
          duration: 900,
          ease: "Quad.easeIn",
          onComplete: () => ghost.destroy(),
        });
        const pud = scene.add.graphics({ x, y: y + 48 }).setDepth(sp.depth);
        pud.fillStyle(0x1a0628, 0.9).fillEllipse(0, 0, 90, 18);
        pud.fillStyle(0x6a1a5a, 0.8).fillEllipse(-6, -2, 60, 10);
        pud.setScale(0.2, 1);
        scene.tweens.add({
          targets: pud,
          scaleX: 1.2,
          duration: 700,
          ease: "Quad.easeOut",
        });
        scene.tweens.add({
          targets: pud,
          alpha: 0,
          delay: 900,
          duration: 700,
          onComplete: () => pud.destroy(),
        });
        fx.burst("goo", x, y, this.lowGfx ? 8 : 16, 0x8a2a9a, {
          angle: { min: 60, max: 120 },
          speed: { min: 60, max: 220 },
        });
        fx.burst("pixel", x, y, this.lowGfx ? 6 : 12, 0xff3a4a, {
          angle: { min: 75, max: 105 },
          speed: { min: 40, max: 160 },
        });
        break;
      }
      case "death_pp_shatter": {
        // the hero splits into RGB slices that slide apart, then shatter into pixels
        const sp = this.sprite;
        const calm = reduceFlashing();
        const slices = [0xff2050, 0x39ff88, 0x20c8ff];
        slices.forEach((c, i) => {
          const im = scene.add
            .image(sp.x, sp.y, sp.texture.key, sp.frame.name)
            .setScale(sp.scaleX, sp.scaleY)
            .setTintFill(c)
            .setAlpha(0.75)
            .setBlendMode(ADD)
            .setDepth(sp.depth + 1);
          scene.tweens.add({
            targets: im,
            x: sp.x + (i - 1) * (calm ? 30 : 46),
            y: sp.y + (i - 1) * 10,
            alpha: 0,
            duration: calm ? 700 : 420,
            ease: calm ? "Sine.easeOut" : "Stepped",
            easeParams: calm ? undefined : [5],
            onComplete: () => im.destroy(),
          });
          fx.burst("pixel", x, y + (i - 1) * 12, this.lowGfx ? 10 : 20, c, {
            angle: { min: 150 + i * 10, max: 210 + i * 10 },
            speed: { min: 180, max: 620 },
          });
        });
        if (!calm)
          fx.ring(x, y, 0x39ff88, { scale: 1, duration: 220, alpha: 0.6 });
        break;
      }
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
    if (this.falcon && !this.dead) {
      // SXE (id "splice"): feathers burst out in a spiral and he tumbles away (the sprite stays)
      this.dead = true;
      this.falcon.die();
      if (this.fx) this.cosmeticDeath(this.x, this.y); // equipped death effects still play
      return hints;
    }
    if (this.toe && !this.dead) {
      // STUBBED! (the sprite stays: it flattens, then bounces away; see ToeBits)
      this.dead = true;
      this.toe.die();
      hints.shake = 0.024;
      return hints;
    }
    this.dead = true;
    const { x, y, def, fx } = this;
    // animals with a death move (belly slide, last lap, snapping chains) burst at its end
    if (this.an && fx && this.an.die((bx, by) => this.animalBurst(bx, by)))
      return hints;
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
        fx.burst("spark", x, y, 40, 0xbffcff, {
          speed: { min: 250, max: 700 },
        });
        break;
      case "ember":
        fx.burst("fire", x, y, 80, undefined, {
          speed: { min: 120, max: 520 },
        });
        fx.ring(x, y, 0xff5a00, { scale: 2.4, duration: 700 });
        hints.flash = 0.45;
        break;
      case "shade":
        fx.burst("smoke", x, y, 26, 0x24083f, { speed: { min: 30, max: 220 } });
        fx.burst("dot", x, y, 30, 0xb45cff, { speed: { min: 60, max: 260 } });
        hints.flash = 0.15;
        break;
      case "frost":
        fx.burst("flake", x, y, 46, 0xe8fbff, {
          speed: { min: 120, max: 520 },
        });
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
      case "sonjuwon":
        this.surfDeath(x, y);
        hints.flash = 0.5;
        hints.shake = 0.024;
        break;
      case "nova":
        fx.ring(x, y, 0xffffff, { scale: 5, duration: 1000 });
        fx.ring(x, y, 0xff7ad9, { scale: 3, duration: 800 });
        fx.ring(x, y, 0x7ae8ff, { scale: 2, duration: 650 });
        for (let i = 0; i < 4; i++)
          fx.burst("star", x, y, 16, hsv(i / 4, 0.5, 1), {
            speed: { min: 200, max: 760 },
          });
        fx.burst("spark", x, y, 40, 0xfff1a8, {
          speed: { min: 300, max: 900 },
        });
        hints.flash = 0.85;
        hints.shake = 0.028;
        break;
    }
    return hints;
  }

  /** 손주원's crash: a lightning surge, the board flips away spinning, electric pixels. */
  surfDeath(x, y) {
    const { fx, scene } = this;
    if (this.sounds) Sfx.thunder();
    fx.lightning(x, y, 0x9af4ff, 7, 150 * this.u);
    fx.lightning(x, y, 0xffffff, 3, 90 * this.u);
    fx.burst("pixel", x, y, 50, 0xffffff, { speed: { min: 200, max: 680 } });
    fx.burst("pixel", x, y, 40, 0x3ef4ff, { speed: { min: 150, max: 560 } });
    fx.burst("spark", x, y, 30, 0xbffcff, { speed: { min: 300, max: 800 } });
    fx.ring(x, y, 0x3ef4ff, { scale: 2.4, duration: 650 });
    const board = scene.add
      .image(x, y + this.boardDY(), this.px.atlas, "sonjuwon_board")
      .setScale(this.sprite.scaleX, this.sprite.scaleY)
      .setDepth(this.sprite.depth + 1);
    scene.tweens.add({
      targets: board,
      x: x + 220,
      angle: 900,
      duration: 1200,
      ease: "Cubic.easeOut",
    });
    scene.tweens.add({
      targets: board,
      y: { from: board.y, to: board.y - 170 },
      duration: 520,
      ease: "Quad.easeOut",
      yoyo: true,
      hold: 60,
    });
    scene.tweens.add({
      targets: board,
      alpha: 0,
      delay: 900,
      duration: 400,
      onComplete: () => board.destroy(),
    });
  }

  /** Offset from the sprite centre down to 손주원's board (world px, follows gravity flips). */
  boardDY() {
    return 7.5 * 4 * Math.abs(this.sprite.scaleX) * this.gravityDir;
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

  /** Near-miss / new best / Second Chance reactions (animals + 손주원; YARMS uses flex()). */
  onNear() {
    this.toe?.near();
    this.falcon?.near();
    this.an?.near();
    this.surfNear();
  }
  onBest() {
    this.toe?.best();
    this.falcon?.best();
    this.an?.best();
    this.surfBest();
    this.cosmeticPose();
  }

  /**
   * Drift Pass+ victory pose, played on a NEW BEST (purely visual). Power Pose: a big flex with
   * a gold ring and stars; Spin Flip: one full forward flip; Aura Burst: purple + gold rings and
   * a swelling aura. Gentler with Reduce Flashing, fewer particles on Low Graphics.
   */
  cosmeticPose(kind = this.cos.pose) {
    if (!kind || this.dead) return;
    const fx = this.fx;
    const calm = reduceFlashing();
    const n = (k) =>
      Math.max(2, Math.round(k * (this.lowGfx ? 0.5 : 1) * (calm ? 0.6 : 1)));
    this.poseKind = kind;
    if (kind === "pose_pp_power") {
      this.poseT = this.poseDur = 0.75;
      if (this.an) this.an.specialT = 0.75; // pass heroes strike their special pose
      fx?.ring(this.x, this.y, 0xffd23f, {
        scale: 1.6,
        duration: calm ? 700 : 480,
        alpha: calm ? 0.5 : 0.9,
      });
      fx?.burst("star", this.x, this.y - 10, n(18), 0xffd23f, {
        angle: { min: 230, max: 310 },
        speed: { min: 200, max: 520 },
      });
    } else if (kind === "pose_pp_spinflip") {
      this.poseT = this.poseDur = 0.6;
      fx?.burst("spark", this.x, this.y, n(12), 0x9af4ff, {
        speed: { min: 120, max: 360 },
      });
    } else if (kind === "pose_pp_aura") {
      this.poseT = this.poseDur = 1.1;
      fx?.ring(this.x, this.y, 0xb45cff, {
        scale: 2.2,
        duration: calm ? 900 : 620,
        alpha: calm ? 0.45 : 0.85,
      });
      this.scene.time.delayedCall(140, () =>
        fx?.ring(this.x, this.y, 0xffd23f, {
          scale: 2.8,
          duration: calm ? 1000 : 700,
          alpha: calm ? 0.4 : 0.8,
        }),
      );
      fx?.burst("dot", this.x, this.y, n(26), 0xd8a0ff, {
        speed: { min: 80, max: 300 },
      });
      if (!this.poseGlow)
        this.poseGlow = this.scene.add
          .image(this.x, this.y, "glow")
          .setBlendMode(ADD)
          .setTint(0xb45cff)
          .setDepth(this.sprite.depth - 1)
          .setVisible(false);
      if (!this.extras.includes(this.poseGlow)) this.extras.push(this.poseGlow);
    }
  }

  /** Pose state each frame: returns the extra spin (degrees) for the sprite. */
  posePlace() {
    if (!(this.poseT > 0)) {
      this.poseGlow?.setVisible(false);
      return 0;
    }
    const p = 1 - this.poseT / this.poseDur; // 0 → 1
    const sp = this.sprite;
    if (this.poseKind === "pose_pp_power") {
      // hold a big flex, then settle
      const k = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      this.sx = Math.max(this.sx, 1 + 0.28 * k);
      this.sy = Math.max(this.sy, 1 + 0.28 * k);
      return 0;
    }
    if (this.poseKind === "pose_pp_spinflip") {
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out
      return -360 * e;
    }
    if (this.poseKind === "pose_pp_aura" && this.poseGlow) {
      const k = Math.sin(p * Math.PI);
      this.poseGlow
        .setVisible(sp.visible && !this.dead)
        .setPosition(sp.x, sp.y)
        .setScale((1 + k * 1.6) * Math.abs(sp.scaleX))
        .setAlpha((reduceFlashing() ? 0.35 : 0.6) * k);
    }
    return 0;
  }
  onRevive() {
    this.an?.revive();
  }

  /** Near-miss reaction (손주원: a quick lightning crack and a spark burst). */
  surfNear() {
    if (this.px.mode !== "surf" || this.dead || !this.fx) return;
    this.fx.lightning(this.x, this.y, 0xbff4ff, 3, 44 * this.u);
    this.fx.burst("spark", this.x, this.y, 10, 0x9af4ff, {
      speed: { min: 150, max: 420 },
    });
    if (this.sounds) Sfx.crackle();
  }

  /** New best mid-run (손주원: it roars and a big lightning bolt strikes behind it). */
  surfBest() {
    if (this.px.mode !== "surf" || this.dead || !this.fx) return;
    this.roarT = 1;
    const scene = this.scene;
    const g = scene.add
      .graphics()
      .setDepth(this.sprite.depth - 3)
      .setBlendMode(ADD);
    const bx = this.x - 40 * this.u;
    let px = bx + 30;
    let py = this.y - 420;
    const pts = [[px, py]];
    while (py < this.y + 10) {
      px = bx + (Math.random() - 0.5) * 60;
      py += 40 + Math.random() * 30;
      pts.push([px, py]);
    }
    for (const [w, c, a] of [
      [16, 0x3ef4ff, 0.35],
      [7, 0xbffcff, 0.9],
      [3, 0xffffff, 1],
    ]) {
      g.lineStyle(w, c, a).beginPath().moveTo(pts[0][0], pts[0][1]);
      for (const [qx, qy] of pts) g.lineTo(qx, qy);
      g.strokePath();
    }
    scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 420,
      delay: 120,
      onComplete: () => g.destroy(),
    });
    this.fx.burst("spark", bx, this.y, 20, 0xbffcff, {
      speed: { min: 200, max: 600 },
    });
    if (this.sounds) Sfx.thunder(0.6);
  }

  /** 손주원 per frame: lightning crackles over the fur, sparks jump to the board, idle roars. */
  updateSurf(dt) {
    if (this.roarT > 0) this.roarT -= dt;
    this.thrustK = Math.max(0, this.thrustK - dt * 3);
    if (this.dead || !this.fx) return;
    const u = this.u;
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = (this.lowGfx ? 0.35 : 0.14) + Math.random() * 0.22;
      this.fx.lightning(
        this.x + (Math.random() - 0.4) * 30 * u,
        this.y - (4 + Math.random() * 10) * u,
        Math.random() < 0.3 ? 0xffffff : 0x6ad8ff,
        1,
        (14 + Math.random() * 12) * u,
      );
      if (Math.random() < 0.6)
        this.fx.burst(
          "spark",
          this.x + (Math.random() - 0.5) * 30 * u,
          this.y + 22 * u,
          2,
          0xbffcff,
          {
            speed: { min: 40, max: 140 },
          },
        );
    }
    // character select / menus: it balances and roars silently now and then
    if (!this.sounds && this.flapT > 1) {
      this.nextRoar -= dt;
      if (this.nextRoar <= 0) {
        this.nextRoar = 2.8 + Math.random() * 2.5;
        this.roarT = 0.8;
        this.fx.lightning(this.x, this.y - 8 * u, 0xbff4ff, 2, 34 * u);
      }
    }
  }

  /** The electric wave wake: cyan water spray with lightning zigzags through it. */
  drawSurfTrail(g) {
    const pts = this.points;
    const n = pts.length;
    const P = 4;
    const by = this.boardDY(); // the wake comes off the board
    for (let i = 1; i < n; i += 2) {
      const p = pts[i];
      const t = i / n;
      const spray = (((i * 37) % 11) / 11 - 0.5) * 26 * t;
      const size = Math.max(1, Math.round((1 - t) * 4 * this.sizeMul)) * P;
      const col = t < 0.2 ? 0xffffff : t < 0.5 ? 0xbffcff : 0x3ef4ff;
      g.fillStyle(col, t < 0.15 ? 1 : 0.95 - t * 0.85);
      g.fillRect(
        Math.round((p.x - size / 2) / P) * P,
        Math.round((p.y + by - spray - size / 2) / P) * P,
        size,
        size,
      );
      if (i % 6 === 1)
        g.fillRect(
          Math.round(p.x / P) * P,
          Math.round((p.y + by - spray - 14 * t) / P) * P,
          P,
          P,
        );
    }
    // the lightning zigzag riding the wake
    g.lineStyle(2 + this.sizeMul, 0xd8fbff, 0.9);
    g.beginPath();
    for (let i = 0; i < n; i += 3) {
      const p = pts[i];
      const zig =
        i === 0 ? 0 : (i % 6 === 0 ? -1 : 1) * (5 + Math.random() * 5);
      if (i === 0) g.moveTo(p.x, p.y + by);
      else g.lineTo(p.x, p.y + by + zig);
    }
    g.strokePath();
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
    fx.ring(x, y, 0xffd23f, { scale: 1.8, duration: 600 });
  }

  stampAfterImage(alpha = 0.5) {
    if (!this.afterImages) return;
    const im = this.afterImages.find((o) => !o.active);
    if (!im) return;
    im.setActive(true)
      .setVisible(true)
      .setPosition(this.x, this.y)
      .setAngle(this.angle);
    im.setScale(this.sprite.scaleX, this.sprite.scaleY).setAlpha(alpha);
    im.setFrame(this.sprite.frame.name)
      .setBlendMode(NORMAL)
      .setTintFill(0x9a5cff);
    im.setPosition(Math.round(this.x), Math.round(this.y)).setAngle(
      this.sprite.angle,
    );
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
    while (
      this.points.length &&
      this.points[this.points.length - 1].age > this.trailTime
    )
      this.points.pop();
    if (!this.dead)
      this.points.unshift({ x: this.x - 6 * this.u, y: this.y, age: 0 });

    if (this.poseT > 0) this.poseT = Math.max(0, this.poseT - dt);
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
        if (this.flapT < 0.24)
          vf = [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))];
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
        if (this.flapT < 0.24)
          f = [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))];
        else f = [0, 1, 2, 1][Math.floor(this.time * 7) % 4];
        wingFrame = f;
        if (!this.dead && this.fx) {
          this.emitT -= dt;
          if (this.emitT <= 0) {
            this.emitT = this.lowGfx ? 0.07 : 0.035;
            this.fx.burst(
              "fire",
              this.x - 16 * this.u,
              this.y + 4,
              1,
              undefined,
              {
                angle: { min: 160, max: 200 },
                speed: { min: 20, max: 90 },
              },
            );
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
        this.sprite.setTint(
          Math.sin(this.time * 6) > 0.85 ? 0xffffff : 0xe6fbff,
        );
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
    if (this.px.mode === "surf") this.updateSurf(dt);
    this.toe?.update(dt);
    this.falcon?.update(dt);
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
      // Starlight: the colour drifts between two hues
      if (this.skin.tint2) {
        const k = 0.5 + 0.5 * Math.sin(this.time * 1.6);
        tint = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(this.skin.tint),
          Phaser.Display.Color.ValueToColor(this.skin.tint2),
          100,
          k * 100,
        );
        tint = Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b);
      }
      this.sprite.setTint(tint);
      // Hologram: a translucent flicker with a glitch step now and then
      if (this.skin.holo && !this.dead) {
        const glitch = Math.sin(this.time * 7.3) > 0.97;
        this.sprite.setAlpha(
          glitch ? 0.45 : 0.72 + 0.18 * Math.sin(this.time * 11),
        );
        this.offX = glitch ? 3 * this.u : 0;
      }
      // Inferno Core: embers rise off the hero
      if (this.skin.embers && !this.dead && this.fx && Math.random() < dt * 9)
        this.fx.burst(
          "pixel",
          this.x + (Math.random() - 0.5) * 24 * this.u,
          this.y + 8 * this.u,
          1,
          this.skin.embers[Math.floor(Math.random() * this.skin.embers.length)],
          { angle: { min: 240, max: 300 }, speed: { min: 30, max: 90 } },
        );
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
    if (
      this.cos.trail === "trail_money" &&
      !this.dead &&
      this.fx &&
      !this.trailOverride
    ) {
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
    else if (mode === "glitch")
      f = this.glitchT > 0 ? 2 : Math.floor(this.time * 3) % 2;
    else if (mode === "spin") f = Math.floor(this.time * 20) % 3;
    else if (mode === "animal") f = this.an ? this.an.frame() : 0;
    else if (mode === "toe") f = this.toe ? this.toe.frame() : 0;
    else if (mode === "falcon") f = this.falcon ? this.falcon.frame() : 0;
    else if (mode === "surf")
      f =
        this.roarT > 0
          ? 3
          : this.flapT < 0.24
            ? 2
            : Math.floor(this.time * 2.5) % 2;
    else if (mode === "yarms")
      f =
        this.flexT > 0
          ? 3
          : this.flapT < 0.17
            ? 2
            : Math.floor(this.time * 7) % 2;
    else if (mode === "punch" || mode === "leap")
      f = this.flapT < 0.14 ? 2 : Math.floor(this.time * 6) % 2;
    else if (mode === "flap")
      f =
        this.flapT < 0.24
          ? [2, 0, 1][Math.min(2, Math.floor(this.flapT / 0.08))]
          : [0, 1, 2, 1][Math.floor(this.time * 6) % 4];
    else f = wingFrame;
    sp.setFrame(this.px.frames[Math.min(this.px.frames.length - 1, f)]);
    // Drift Pass+ skins draw the hero a little smaller (~10%, snapped down to 1/32 steps so
    // the shrink survives the pixel grid). Purely visual: the hitbox (Player.radius) is unchanged.
    // (DRIFT PASS+ heroes are drawn smaller the same way: def.visualScale)
    const vs = Math.min(this.skin?.visualScale ?? 1, this.def.visualScale ?? 1);
    const m =
      vs === 1
        ? Math.max(0.5, Math.round(this.sizeMul * this.displayScale * 2) / 2)
        : Math.max(
            0.5,
            Math.floor(this.sizeMul * this.displayScale * vs * 32) / 32,
          );
    const flip = this.gravityDir < 0 ? -1 : 1;
    sp.setPosition(
      Math.round(this.x + this.offX),
      Math.round(this.y + this.offY),
    );
    const spin = this.posePlace(); // victory pose (Spin Flip) — stepped like the tilt
    sp.setAngle(Math.round((this.angle + spin) / TILT.step) * TILT.step);
    // YARMS gets exaggerated (goofy) squash & stretch steps
    const big = mode === "yarms";
    const step = (v) =>
      v < 0.8 && big
        ? 0.75
        : v < 0.9
          ? 0.875
          : v > 1.25 && big
            ? 1.25
            : v > 1.1
              ? 1.125
              : 1;
    sp.setScale(m * step(this.sx), m * step(this.sy) * flip);
    this.toe?.post(sp);
    this.falcon?.post(sp);
    this.placeCosmetics();
    this.an?.place(scroll);
    if (this.thruster) {
      // hover glow under the board (flares on a flap)
      const k = 4 * sp.scaleX;
      const fl = sp.scaleY < 0 ? -1 : 1;
      this.thruster
        .setVisible(sp.visible && !this.dead)
        .setPosition(sp.x, sp.y + 10 * k * fl)
        .setScale(
          (0.5 + this.thrustK * 0.4) * Math.abs(sp.scaleX),
          0.25 * Math.abs(sp.scaleX),
        )
        .setAlpha(0.55 + 0.25 * Math.sin(this.time * 9) + this.thrustK * 0.3);
    }
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
        this.fx.burst(
          "sweat",
          this.x + side * 16 * this.u,
          this.y - 4 * this.u,
          1,
          0xbfe8ff,
          {
            angle: { min: 180, max: 240 },
            speed: { min: 60, max: 180 },
          },
        );
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
    if (!this.trailOverride && this.px.mode === "yarms")
      return this.drawYarmsTrail(g);
    if (!this.trailOverride && this.px.mode === "surf")
      return this.drawSurfTrail(g);
    if (!this.trailOverride && this.toe) return this.toe.trail(g);
    if (!this.trailOverride && this.falcon) return this.falcon.trail(g);
    if (!this.trailOverride && this.an?.trail(g)) return;
    const cols = this.trailOverride || this.px.trail; // Lucky Run: golden trail
    // squares laid at an even spacing along the path (not one per frame), so the trail has no
    // gaps at top speed and looks the same at 60 and 120 fps
    const pts = this.points;
    const n = pts.length;
    let total = 0;
    for (let i = 1; i < n; i++)
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (total <= 0) return;
    const gap = P * 1.5;
    let walked = 0;
    let next = 0;
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= walked + seg) {
        const k = seg > 0 ? (next - walked) / seg : 0;
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        const t = next / total;
        const size = Math.max(1, Math.round((1 - t) * 4 * this.sizeMul)) * P;
        const col =
          cols[Math.min(cols.length - 1, Math.floor(t * cols.length))];
        g.fillStyle(col, t < 0.15 ? 1 : 0.95 - t * 0.8);
        g.fillRect(
          Math.round((x - size / 2) / P) * P,
          Math.round((y - size / 2) / P) * P,
          size,
          size,
        );
        next += gap;
      }
      walked += seg;
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
          } else if (style === "trail_rainbow")
            col = hsv((t * 1.2 + T * 0.6) % 1, 0.8, 1);
          else if (style === "trail_galaxy")
            col = gal[Math.min(4, Math.floor(t * 5))];
          else col = cash[Math.min(3, Math.floor(t * 4))];
          sq(
            p.x,
            p.y + (style === "trail_fire" ? -t * 14 : 0),
            size,
            col,
            t < 0.15 ? 1 : 0.95 - t * 0.8,
          );
          if (style === "trail_galaxy" && (i * 7 + Math.floor(T * 8)) % 9 === 0)
            sq(
              p.x + ((i * 13) % 17) - 8,
              p.y + ((i * 7) % 15) - 7,
              P,
              0xffffff,
              1 - t,
            );
        }
        return true;
      }
      case "trail_bloodmoon":
      case "trail_abyssal":
      case "trail_prism":
      case "trail_zen":
      case "trail_storm":
      case "trail_founder":
      case "trail_aurora":
      case "trail_eclipse": {
        // season / pass trails: stepped squares in their own colours, each with a little twist
        const pal = {
          trail_aurora: [0xd8fff0, 0x6affc8, 0x3ef4ff, 0x8a6aff, 0x3a1a8a],
          trail_eclipse: [0xfff6c0, 0xffd23f, 0x8a5a1a, 0x1a0a2a, 0x000000],
          trail_bloodmoon: [0xffd0d0, 0xff3a4a, 0xc8102e, 0x7a0418, 0x3a020a],
          trail_abyssal: [0x8a6a9a, 0x4a2a4a, 0x2a1a2a, 0x14080c, 0x0a0206],
          trail_prism: [0xffffff, 0xff9ad8, 0x6ad8ff, 0xb48aff, 0xfff06a],
          trail_zen: [0xffffff, 0xffd0e4, 0xff9ac8, 0x9ae86a, 0x4ac84a],
          trail_storm: [0xffffff, 0xbffcff, 0x3ef4ff, 0x1a8ad8, 0x1a3a8a],
          trail_founder: [0xffffff, 0xfff0a0, 0x3ef4ff, 0xb45cff, 0x4a1a8a],
        }[style];
        const beat =
          style === "trail_bloodmoon" ? Math.exp(-((T * 2) % 1) * 5) : 0; // heartbeat
        for (let i = 1; i < n; i += 2) {
          const p = pts[i];
          const t = i / n;
          const size =
            Math.max(1, Math.round((1 - t) * (4 + beat * 2) * this.sizeMul)) *
            P;
          const col =
            style === "trail_prism"
              ? pal[(i + Math.floor(T * 10)) % pal.length]
              : pal[Math.min(pal.length - 1, Math.floor(t * pal.length))];
          const yo =
            style === "trail_zen" ? Math.sin(i * 0.6 + T * 4) * 6 * t : 0;
          sq(p.x, p.y + yo, size, col, t < 0.15 ? 1 : 0.95 - t * 0.8);
          if (
            style === "trail_abyssal" &&
            (i * 7 + Math.floor(T * 9)) % 8 === 0
          )
            sq(p.x, p.y - 10 * t, P, 0xff3a4a, 1 - t); // red embers in the smoke
          // Founding Drifter: gold glints twinkle along a portal-coloured stream
          if (
            style === "trail_founder" &&
            (i * 5 + Math.floor(T * 12)) % 7 === 0
          )
            sq(
              p.x + Math.sin(i + T * 6) * 7,
              p.y + Math.cos(i * 1.3 + T * 5) * 7,
              P,
              0xffd23f,
              1 - t,
            );
          if (style === "trail_storm" && i % 10 === 1 && Math.random() < 0.5)
            sq(
              p.x + (Math.random() - 0.5) * 20,
              p.y + (Math.random() - 0.5) * 20,
              P,
              0xffffff,
              1,
            );
        }
        return true;
      }
      case "trail_pp_galaxydust": {
        // a deep-space stream with drifting, twinkling dust around it
        const pal = [0xffffff, 0xc8b0ff, 0x8a5aff, 0x4a2ab0, 0x1a1060];
        for (let i = 1; i < n; i += 2) {
          const p = pts[i];
          const t = i / n;
          const size = Math.max(1, Math.round((1 - t) * 3 * this.sizeMul)) * P;
          sq(
            p.x,
            p.y,
            size,
            pal[Math.min(4, Math.floor(t * 5))],
            t < 0.15 ? 0.9 : 0.85 - t * 0.75,
          );
        }
        const dust = this.lowGfx ? 8 : 16;
        const calm = reduceFlashing();
        for (let d = 0; d < dust; d++) {
          const i = 2 + ((d * 7) % Math.max(1, n - 2));
          const p = pts[Math.min(n - 1, i)];
          const t = i / n;
          const ph = d * 1.7 + T * (calm ? 1.2 : 3);
          const tw = 0.5 + 0.5 * Math.sin(ph); // twinkle (a smooth fade)
          const col = [0xffffff, 0xffd0f8, 0x9ad8ff, 0xd8b0ff][d % 4];
          sq(
            p.x + Math.sin(d * 3.1 + T * 0.8) * (8 + t * 22),
            p.y + Math.cos(d * 2.3 + T * 0.7) * (8 + t * 22) - t * 10,
            P,
            col,
            (1 - t) * (0.35 + 0.65 * tw),
          );
        }
        return true;
      }
      case "trail_pp_lightning": {
        // a stepped pixel bolt with forks. Reduce Flashing: it re-forms 6×/s instead of 30×/s.
        const rate = reduceFlashing() ? 6 : 30;
        const seed = Math.floor(T * rate);
        const jit = (i) => {
          const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
          return h - Math.floor(h) - 0.5;
        };
        let prev = null;
        for (let i = 0; i < n; i += 2) {
          const p = pts[i];
          const t = i / n;
          const y = p.y + (i === 0 ? 0 : jit(i) * 22 * (t + 0.3));
          const a = 1 - t * 0.85;
          if (i % 4 === 0)
            sq(
              p.x,
              y,
              Math.max(1, Math.round((1 - t) * 3)) * P + P * 2,
              0x2a8aff,
              a * 0.3,
            );
          sq(p.x, y, Math.max(1, Math.round((1 - t) * 2)) * P, 0xe8ffff, a);
          // fill the gap to the last joint so the bolt reads as one line
          if (prev) sq((prev.x + p.x) / 2, (prev.y + y) / 2, P, 0xbff4ff, a);
          // forks
          if (i % 10 === 6 && !this.lowGfx) {
            const dir = jit(i + 99) > 0 ? 1 : -1;
            for (let k = 1; k <= 3; k++)
              sq(
                p.x - k * P * 2,
                y + dir * k * P * 2,
                P,
                0x9af4ff,
                a * (1 - k * 0.25),
              );
          }
          prev = { x: p.x, y };
        }
        return true;
      }
      case "trail_pp_comboflame": {
        // a pixel flame whose colour climbs with the combo: orange → gold → green → blue → violet
        const ramps = [
          [0xfff1a0, 0xffd23f, 0xffa21a, 0xff5a1a, 0xb01000],
          [0xffffff, 0xfff6a0, 0xffe14d, 0xffb020, 0xa06000],
          [0xf0fff0, 0xb0ff9a, 0x39ff88, 0x1fae5a, 0x0a5a2a],
          [0xffffff, 0xbff4ff, 0x3ef4ff, 0x2a7aff, 0x1a2a8a],
          [0xffffff, 0xffd0ff, 0xd88aff, 0xa040ff, 0x4a1a8a],
        ];
        const tierIdx =
          { 1: 0, 2: 1, 3: 2, 5: 3, 10: 4, 13: 4 }[this.comboTier || 1] ?? 0;
        // ease between colours so a combo step blends in over ~0.3 s
        this.flameHeat =
          (this.flameHeat ?? tierIdx) +
          (tierIdx - (this.flameHeat ?? tierIdx)) * 0.12;
        const lo = Math.floor(this.flameHeat);
        const hi = Math.min(4, lo + 1);
        const f = this.flameHeat - lo;
        const grow = 1 + this.flameHeat * 0.12;
        for (let i = 1; i < n; i += 2) {
          const p = pts[i];
          const t = i / n;
          const ci = Math.min(4, Math.floor(t * 5));
          const col = mixCol(ramps[lo][ci], ramps[hi][ci], f);
          let size =
            Math.max(1, Math.round((1 - t) * 4 * grow * this.sizeMul)) * P;
          if (Math.sin(i * 1.7 + T * 14) > 0.6) size += P; // flicker in size, not brightness
          sq(
            p.x,
            p.y - t * (14 + this.flameHeat * 4),
            size,
            col,
            t < 0.15 ? 1 : 0.95 - t * 0.8,
          );
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
          g.fillRect(x - P * 1.5, y, P * 4, P).fillRect(
            x - P / 2,
            y + P,
            P * 2,
            P,
          );
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
