// WASP LORD (ILLEGAL LEGENDARY), the armoured war-wasp king. Everything here is visual: his powers
// (phase, speed, double jump, combo x16) live in his def and the gameplay code.
//   idle    four wings buzzing fast (the art cycles up / blur / down / blur), a soft wing-blur
//           fan behind him, a small hover bob, and the red visor eyes pulsing
//   flap    a quick burst of wing beats and a red flash in the eyes (the low buzz is
//           Sfx.waspFlap, played by GameScene on every flap through Sfx.flap)
//   phase   rig.phase(true / false), called by the gameplay code while he passes through an
//           obstacle: he goes semi-transparent red with RGB-split ghost copies (red + cyan) and
//           horizontal slices of him jittering sideways. Drawn with normal blending, so it reads
//           on bright realms (Sakura Skies, Peaceful Valley) as well as the Abyss.
//   double  rig.doubleJump(): a red shockwave ring bursts under him, dark plates' sparks fly,
//           a metallic boom (Sfx.waspBoom)
//   near    the stinger strike pose (frame 5) with red sparks off the tip
//   best    the roar (frame 6): eyes flare, a red ring
//   death   his armour cracks and flies off (plates spin away, gunmetal shards), the eyes
//           flicker out, then he drops
//   trail   a thin red energy streak with dark armour-shard flecks
// Reduce Flashing: the eye pulse and flashes become a steady glow, the phase glitch stops
// strobing (slow steady offsets), softer rings. Low Graphics: fewer particles, no wing fan and
// fewer phase slices. Every object is made once in the constructor and destroyed with the rig.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";
import { WASP_EYE } from "../pixel/waspLordArt.js";
import { HeroBits } from "./hybridFx.js";

const ADD = Phaser.BlendModes.ADD;
const RED = 0xff1a2a;
const RED_D = 0x8a0812;
const RED_L = 0xff6a6a;
const METAL = 0x3a3c4c;
const METAL_L = 0x8a90a6;
const YELLOW = 0xffc81a;
const CYAN = 0x30e8ff;
const WING = 0xdcf0ff;
const BEST = 1.1;
const DIE_OUT = 1.6; // the broken wasp is gone after this (s)

export class WaspBits extends HeroBits {
  constructor(rig, depth) {
    super(rig, depth);
    const sc = rig.scene;
    const atlas = rig.px.atlas;
    this.calm = reduceFlashing();
    // the wing-blur fan, behind him
    this.wingG = sc.add.graphics().setDepth(depth - 0.6);
    // the eyes: a soft red haze (normal blend: visible on a bright sky) and a hot core (additive)
    this.halo = sc.add.image(rig.x, rig.y, "glow").setTint(RED).setDepth(depth + 0.3).setVisible(false);
    this.core = sc.add.image(rig.x, rig.y, "glow").setBlendMode(ADD).setTint(RED).setDepth(depth + 0.35).setVisible(false);
    // phase: two RGB-split ghosts and horizontal slices of him that jitter sideways
    this.ghosts = [RED, CYAN].map((c) =>
      sc.add.image(rig.x, rig.y, atlas, rig.px.frames[0]).setTintFill(c).setDepth(depth - 0.2).setVisible(false),
    );
    this.slices = Array.from({ length: rig.lowGfx ? 2 : 4 }, () =>
      sc.add.image(rig.x, rig.y, atlas, rig.px.frames[0]).setDepth(depth + 0.2).setVisible(false),
    );
    // death: armour plates that blow off and spin away
    this.plates = Array.from({ length: rig.lowGfx ? 3 : 6 }, () =>
      sc.add.image(rig.x, rig.y, atlas, "wasplord_plate").setDepth(depth + 0.4).setVisible(false),
    );
    this.flashT = 0; // the eye flash on a flap
    this.strikeT = 0; // the stinger strike pose (near-miss, double jump)
    this.phaseOn = false;
    this.phaseK = 0; // 0..1 fade of the phase look
    this.jitT = 0;
    this.jit = [];
    this.shardT = 0;
  }

  get objects() {
    return [this.wingG, this.halo, this.core, ...this.ghosts, ...this.slices, ...this.plates];
  }

  get m() {
    return Math.abs(this.rig.sprite.displayWidth) / 26; // world px per art pixel
  }

  /** Rimmed art coordinates → world, following the sprite's tilt and gravity flip. */
  at(ax, ay) {
    const sp = this.rig.sprite;
    const m = this.m;
    const flip = sp.scaleY < 0 ? -1 : 1;
    const dx = (ax - 13) * m;
    const dy = (ay - 13) * m * flip;
    const c = Math.cos(sp.rotation);
    const s = Math.sin(sp.rotation);
    return { x: sp.x + dx * c - dy * s, y: sp.y + dx * s + dy * c };
  }

  frame() {
    if (this.dieT >= 0) return 7;
    if (this.bestT > 0) return 6;
    if (this.strikeT > 0) return 5;
    const t = this.rig.time;
    // a flap: a burst of fast, full wing beats (up, down)
    if (this.flapT > 0) return Math.floor(this.flapT / 0.035) % 2 ? 1 : 2;
    // the buzz: up, blur, down, blur
    return [1, 3, 2, 3][Math.floor(t * 22) % 4];
  }

  // ---------------------------------------------------------------- reactions
  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.21;
    this.flashT = 0.18;
    const { fx } = this.rig;
    if (!fx) return;
    const p = this.at(8, 9);
    fx.burst("pixel", p.x, p.y, this.rig.lowGfx ? 1 : 3, WING, { angle: { min: 150, max: 230 }, speed: { min: 60, max: 180 } });
  }

  /** The second leap: a red shockwave ring bursts under him with a metallic boom. */
  doubleJump() {
    const rig = this.rig;
    if (rig.dead) return;
    this.strikeT = 0.28;
    this.flashT = 0.22;
    if (rig.sounds || this.showcase) Sfx.waspBoom?.();
    const { fx } = rig;
    if (!fx) return;
    const u = rig.u;
    const calm = reduceFlashing();
    const oy = 16 * rig.gravityDir * u;
    fx.ring(rig.x, rig.y + oy, RED, { scale: 2 * u, duration: 460, width: 0.45, alpha: calm ? 0.6 : 0.95 });
    fx.ring(rig.x, rig.y + oy, 0x1a0408, { scale: 1.3 * u, duration: 380, width: 0.45, alpha: 0.8 });
    if (!calm) fx.ring(rig.x, rig.y + oy, 0xffffff, { scale: 0.8 * u, duration: 220, width: 0.45, alpha: 0.7 });
    const down = rig.gravityDir > 0 ? { min: 20, max: 160 } : { min: 200, max: 340 };
    fx.burst("shard", rig.x, rig.y + oy, rig.lowGfx ? 4 : 10, METAL_L, { angle: down, speed: { min: 140, max: 380 } });
    fx.burst("pixel", rig.x, rig.y + oy, rig.lowGfx ? 4 : 10, RED, { angle: down, speed: { min: 100, max: 320 } });
  }

  near() {
    if (this.rig.dead || this.bestT > 0) return;
    this.strikeT = 0.26;
    const { fx } = this.rig;
    if (!fx) return;
    const p = this.at(18, 21); // the stinger tip in the strike pose
    fx.burst("spark", p.x, p.y, this.rig.lowGfx ? 2 : 5, RED_L, { speed: { min: 80, max: 260 } });
  }

  best() {
    if (this.rig.dead) return;
    this.bestT = BEST;
    this.flashT = 0.3;
    if (this.rig.sounds) Sfx.waspRoar?.();
    const { fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.ring(this.rig.x, this.rig.y, RED, { scale: 1.6 * u, duration: 520, alpha: reduceFlashing() ? 0.5 : 0.9 });
    fx.burst("spark", this.rig.x, this.rig.y, this.rig.lowGfx ? 4 : 10, RED, { speed: { min: 120, max: 360 } });
  }

  /** Phase through an obstacle: on → the glitchy red ghost look; off → back to solid. */
  phase(on) {
    on = !!on;
    if (on === this.phaseOn) return;
    this.phaseOn = on;
    if (on && this.rig.fx && !this.rig.dead) {
      const u = this.rig.u;
      this.rig.fx.burst("pixel", this.rig.x, this.rig.y, this.rig.lowGfx ? 3 : 8, RED, { speed: { min: 60, max: 200 } });
      this.rig.fx.ring(this.rig.x, this.rig.y, RED, { scale: 0.9 * u, duration: 260, alpha: 0.6 });
    }
  }

  reset() {
    super.reset();
    this.flashT = this.strikeT = 0;
    this.phaseOn = false;
    this.phaseK = 0;
    this.endPhaseLook();
    for (const p of this.plates) p.setVisible(false);
    this.plateV = null;
    this.halo.setVisible(false);
    this.core.setVisible(false);
    this.wingG.clear();
    this.rig.sprite.setAlpha(1);
  }

  // ---------------------------------------------------------------- death
  die() {
    const rig = this.rig;
    this.dieT = 0;
    this.bestT = this.flapT = this.strikeT = 0;
    this.phaseOn = false;
    this.phaseK = 0;
    this.endPhaseLook();
    this.fallV = -120 * rig.u;
    this.fallY = 0;
    if (rig.sounds) Sfx.waspBoom?.(0.6);
    const { fx } = rig;
    // the plates blow off his chest, helmet and abdomen and spin away
    const from = [
      [12, 9],
      [19, 6],
      [6, 13],
      [14, 12],
      [4, 16],
      [21, 10],
    ];
    const u = rig.u;
    this.plateV = this.plates.map((im, i) => {
      const p = this.at(...from[i % from.length]);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = (180 + Math.random() * 220) * u;
      im.setPosition(p.x, p.y).setScale(this.m / 4).setAngle(0).setAlpha(1).setVisible(true);
      return { im, x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (Math.random() - 0.5) * 900 };
    });
    if (!fx) return;
    fx.burst("shard", rig.x, rig.y, rig.lowGfx ? 8 : 20, METAL, { speed: { min: 120, max: 440 } });
    fx.burst("shard", rig.x, rig.y, rig.lowGfx ? 4 : 10, METAL_L, { speed: { min: 100, max: 380 } });
    fx.burst("pixel", rig.x, rig.y, rig.lowGfx ? 4 : 10, RED, { speed: { min: 80, max: 300 } });
    fx.burst("pixel", rig.x, rig.y, rig.lowGfx ? 2 : 6, YELLOW, { speed: { min: 60, max: 240 } });
    fx.ring(rig.x, rig.y, RED, { scale: 1.3 * u, duration: reduceFlashing() ? 650 : 420, alpha: reduceFlashing() ? 0.5 : 0.9 });
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    this.tick(dt);
    this.calm = reduceFlashing();
    this.flashT = Math.max(0, this.flashT - dt);
    this.strikeT = Math.max(0, this.strikeT - dt);
    const target = this.phaseOn && !this.rig.dead ? 1 : 0;
    this.phaseK += Math.sign(target - this.phaseK) * Math.min(Math.abs(target - this.phaseK), dt * 8);
    if (this.dieT >= 0) {
      this.dieT += dt;
      this.fallV += 900 * this.rig.u * dt;
      this.fallY += this.fallV * dt;
      this.updatePlates(dt);
      if (this.dieT > DIE_OUT && this.rig.sprite.visible) this.rig.setVisible(false);
      return;
    }
    // armour flecks shed off him as he flies (in a run, not on the menus)
    const rig = this.rig;
    if (rig.fx && !this.menu && !rig.dead) {
      this.shardT -= dt;
      if (this.shardT <= 0) {
        this.shardT = rig.lowGfx ? 0.3 : 0.13;
        const p = this.at(5, 15);
        rig.fx.burst("pixel", p.x, p.y, 1, Math.random() < 0.7 ? METAL : RED_D, {
          angle: { min: 150, max: 210 },
          speed: { min: 20, max: 90 },
        });
      }
    }
  }

  updatePlates(dt) {
    if (!this.plateV) return;
    const g = 1400 * this.rig.u;
    const fade = Math.max(0, 1 - Math.max(0, this.dieT - 0.9) / 0.6);
    for (const p of this.plateV) {
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.im
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setAngle(Math.round((p.im.angle + p.spin * dt) / 15) * 15)
        .setAlpha(fade);
    }
    if (fade <= 0) {
      for (const p of this.plateV) p.im.setVisible(false);
      this.plateV = null;
    }
  }

  /** After the sprite is placed: the hover bob, the eyes, the wing fan, the phase look, the fall. */
  post(sp) {
    const m = this.m;
    const rig = this.rig;
    if (this.dieT >= 0) {
      sp.setPosition(Math.round(sp.x - this.dieT * 30 * m), Math.round(sp.y + this.fallY));
      sp.setAngle(Math.round((this.dieT * 160) / 15) * 15 * (sp.scaleY < 0 ? -1 : 1));
      this.wingG.clear();
      this.placeEyes(sp);
      return;
    }
    // the hover bob (the drawing only, the hitbox never moves)
    if (!rig.dead) sp.setY(Math.round(sp.y + Math.sin(rig.time * 5.5) * 1.2 * m));
    this.drawWingFan(sp);
    this.placeEyes(sp);
    this.placePhase(sp);
  }

  /** The red visor glow: pulses (steady with Reduce Flashing), flashes on a flap, flickers out on death. */
  placeEyes(sp) {
    const rig = this.rig;
    let a;
    if (this.dieT >= 0) {
      // the eyes flicker out (Reduce Flashing: a smooth fade, no flicker)
      const k = Math.max(0, 1 - this.dieT / 0.7);
      a = this.calm ? k * 0.7 : k > 0 && Math.sin(this.dieT * 47) > -0.2 ? k : 0;
    } else if (this.calm) a = this.flashT > 0 || this.bestT > 0 ? 0.85 : 0.7;
    else a = 0.62 + 0.22 * Math.sin(rig.time * 4.2) + (this.flashT > 0 ? 0.4 * (this.flashT / 0.18) : 0);
    const show = sp.visible && a > 0.01;
    this.halo.setVisible(show);
    this.core.setVisible(show);
    if (!show) return;
    const p = this.at(WASP_EYE.x, WASP_EYE.y + (this.dieT >= 0 ? 1 : 0));
    const m = this.m;
    const big = !this.calm && (this.flashT > 0 || this.bestT > 0) ? 1.3 : 1;
    const ph = 1 - this.phaseK * 0.4;
    this.halo.setPosition(p.x, p.y).setDisplaySize(22 * m * big, 12 * m * big).setAlpha(Math.min(0.5, a * 0.55) * ph);
    this.core.setPosition(p.x, p.y).setDisplaySize(13 * m * big, 7 * m * big).setAlpha(Math.min(1, a) * ph);
  }

  /** A faint fan of buzzing wing behind him (pixel squares, see-through). */
  drawWingFan(sp) {
    const g = this.wingG.clear();
    if (this.rig.lowGfx || !sp.visible || this.rig.dead) return;
    const m = this.m;
    const P = Math.max(2, Math.round(m));
    const root = this.at(12, 9);
    const fl = sp.scaleY < 0 ? -1 : 1;
    const beat = this.flapT > 0 ? 1.25 : 1;
    const al = 0.13 * (1 - this.phaseK);
    if (al <= 0.01) return;
    g.fillStyle(WING, al);
    for (let a = -2.6; a <= -1.0; a += 0.16)
      for (let r = 4; r <= 10; r += 1.5) {
        const x = root.x + Math.cos(a + sp.rotation) * r * m * beat;
        const y = root.y + Math.sin(a + sp.rotation) * r * m * fl * 0.9;
        g.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, P, P);
      }
  }

  /** The phase look: semi-transparent red body, RGB-split ghosts, jittering horizontal slices. */
  placePhase(sp) {
    const k = this.phaseK;
    if (k <= 0) {
      if (this.phaseShown) this.endPhaseLook();
      return;
    }
    this.phaseShown = true;
    const m = this.m;
    const rig = this.rig;
    sp.setTint(0xff5a6a).setAlpha(1 - 0.5 * k);
    // the RGB split: a red copy behind-left, a cyan copy ahead-right (wobbling apart)
    const split = (2.2 + (this.calm ? 0 : Math.sin(rig.time * 23) * 0.8)) * m * k;
    this.ghosts.forEach((gh, i) => {
      const dir = i ? 1 : -1;
      gh.setFrame(sp.frame.name)
        .setPosition(Math.round(sp.x + dir * split), Math.round(sp.y + (i ? -0.5 : 0.5) * m))
        .setScale(sp.scaleX, sp.scaleY)
        .setAngle(sp.angle)
        .setAlpha((i ? 0.32 : 0.5) * k)
        .setVisible(sp.visible);
    });
    // horizontal slices: bands of him shoved sideways; they re-roll every few frames (slowly and
    // smoothly with Reduce Flashing: no strobing)
    this.jitT -= rig.scene.game.loop.delta / 1000;
    const fh = sp.frame.height;
    const n = this.slices.length;
    if (this.jitT <= 0 || this.jit.length !== n) {
      this.jitT = this.calm ? 0.5 : 0.06 + Math.random() * 0.08;
      this.jit = this.slices.map(() => ({
        y: Math.floor(Math.random() * (fh - 12)),
        h: 6 + Math.floor(Math.random() * 14),
        dx: (Math.random() < 0.5 ? -1 : 1) * (this.calm ? 1.2 : 1.5 + Math.random() * 3),
        on: this.calm || Math.random() < 0.75,
      }));
    }
    this.slices.forEach((s, i) => {
      const j = this.jit[i];
      s.setFrame(sp.frame.name)
        .setCrop(0, j.y, sp.frame.width, j.h)
        .setPosition(Math.round(sp.x + j.dx * m * k), sp.y)
        .setScale(sp.scaleX, sp.scaleY)
        .setAngle(sp.angle)
        .setTint(i % 2 ? 0xff9aa4 : RED)
        .setAlpha(0.75 * k)
        .setVisible(sp.visible && j.on);
    });
  }

  endPhaseLook() {
    this.phaseShown = false;
    for (const o of [...this.ghosts, ...this.slices]) o.setVisible(false);
    const sp = this.rig.sprite;
    sp.setAlpha(1);
    sp.clearTint(); // (a colour skin tints him again on the next frame)
  }

  /** A thin red energy streak (white-hot at his tail) with dark armour-shard flecks. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    const oy = 3 * u * (rig.gravityDir < 0 ? -1 : 1);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a0 = pts[i - 1];
      const p = pts[i];
      const a = Math.max(0, 1 - t * 1.05);
      const col = t < 0.12 ? 0xffffff : t < 0.3 ? RED_L : t < 0.7 ? RED : RED_D;
      const jit = this.calm ? 0 : Math.round(Math.sin(i * 1.7 + rig.time * 31) * 1.2 * t) * P;
      // one continuous streak: each step spans the gap to the point before it
      const x0 = snap(Math.min(a0.x, p.x));
      const x1 = snap(Math.max(a0.x, p.x)) + P;
      const y = snap(p.y + oy) + jit;
      g.fillStyle(RED_D, a * 0.5).fillRect(x0, y - P, x1 - x0, P * 3); // the soft edge
      g.fillStyle(col, a).fillRect(x0, y, x1 - x0, P);
      if (!rig.lowGfx && i % 5 === 2 && t > 0.15 && t < 0.85) {
        // a dark armour shard tumbling off the streak
        const s = (i * 37) % 3 === 0 ? 1 : -1;
        g.fillStyle(i % 3 ? METAL : METAL_L, Math.min(1, a + 0.3));
        g.fillRect(snap(p.x + 2 * u), snap(p.y + oy + s * (4 + (i % 4)) * u * (0.5 + t)), P, P);
      }
    }
  }
}
