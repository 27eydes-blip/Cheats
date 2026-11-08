// DAWSON (shark x butterfly x peacock) and DEWBERRY (a glowing berry). Everything here is
// cosmetic: the hitbox, speed and gravity are the standard ones; poses swap art frames of the
// same size and move only the picture. Same shape as the other hero modules (see jamalFx.js).
//
// DAWSON
//   flap   wings flutter (frames 1/2) while his body does a little swim wiggle; a soft
//          fluttering whoosh with an underwater "bloop" (sfx.js FLAP.dawson)
//   glide  a lazy flutter now and then (frame 0, a quick 1)
//   near   tail flash (frame 3) with a sparkle burst
//   best   the full peacock tail fans open (frame 4) with a rainbow shimmer and a happy chomp
//   death  wings shatter into iridescent scales, feathers scatter, he spins away (frame 5) in a
//          splash of bubbles
//   trail  glowing butterfly scales, bubbles and peacock feather sparkles
// DEWBERRY
//   flap   squish and jelly bounce (frames 1/2) with the leaf spinning like a propeller; a
//          juicy "bloop"
//   glide  gently bobbing; the soft pink glow pulses slowly (brighter in dark realms)
//   near   eyes go wide (frame 3) and the glow flares
//   best   the glow bursts bright pink with a sweet chime and little hearts (frame 4)
//   death  pops with a juicy splat of glowing pink drops
//   trail  glowing pink droplets and tiny sparkles
// Low Graphics: fewer particles, a steady glow. Reduce Flashing: no rings or flares of light,
// gentler glow changes.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";

const SCALES = [0x18c8b8, 0x18a050, 0xffd23f, 0x8a3cd8];
const RAINBOW = [0xff3a5a, 0xff8a2a, 0xffd23f, 0x5ae06a, 0x18c8b8, 0x3a8aff, 0x8a3cd8];
const PINK = 0xff4fa0;
const PINK_L = 0xff9ad0;

class HeroBits {
  constructor(rig, depth) {
    this.rig = rig;
    this.depth = depth;
    this.flapT = this.nearT = this.bestT = 0;
    this.dieT = -1;
    this.menu = rig.scene.sys.settings.key !== "Game";
    this.showcase = rig.scene.sys.settings.key === "Characters";
    this.idleT = 1.2;
  }
  get objects() {
    return [];
  }
  reset() {
    this.dieT = -1;
    this.flapT = this.nearT = this.bestT = 0;
    this.spin = this.dx = this.dy = 0;
  }
  tick(dt) {
    for (const k of ["flapT", "nearT", "bestT"]) this[k] = Math.max(0, this[k] - dt);
    // the hero screen: show off the big moment every few seconds
    if (this.menu && !this.rig.dead) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 4.5;
        this.best();
      }
    }
  }
}

// ================================================================== DAWSON
export class SharkBits extends HeroBits {
  frame() {
    if (this.dieT >= 0) return 5;
    if (this.bestT > 0) return 4;
    if (this.nearT > 0) return 3;
    if (this.flapT > 0) return Math.floor(this.flapT / 0.06) % 2 ? 1 : 2; // quick flutter
    // a lazy flutter now and then while gliding
    return Math.floor(this.rig.time * 4) % 5 === 0 ? 1 : 0;
  }

  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.24;
    const { fx } = this.rig;
    if (!fx) return;
    const sp = this.rig.sprite;
    fx.burst("bubble", sp.x - 10 * this.rig.u, sp.y + 6 * this.rig.u, this.rig.lowGfx ? 1 : 2, 0xbfeaff, {
      speed: { min: 20, max: 80 },
    });
  }

  near() {
    if (this.rig.dead) return;
    this.nearT = 0.4;
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.burst("star", x - 16 * u, y - 6 * u, this.rig.lowGfx ? 4 : 9, 0xffd23f, { speed: { min: 80, max: 240 } });
    if (!this.rig.lowGfx)
      fx.burst("star", x - 16 * u, y - 6 * u, 5, 0x18c8b8, { speed: { min: 60, max: 180 } });
    if (this.rig.sounds || this.showcase) Sfx.moment("dawson", "near");
    if (!reduceFlashing()) fx.ring(x - 12 * u, y, 0x18c8b8, { scale: 0.7 * u, duration: 260, width: 2 });
  }

  best() {
    if (this.rig.dead) return;
    this.bestT = 1.6;
    if (this.rig.sounds || this.showcase) Sfx.moment("dawson", "best");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    // the rainbow shimmer: a burst of every colour of the fan
    for (const c of this.rig.lowGfx ? RAINBOW.filter((_, i) => i % 2 === 0) : RAINBOW)
      fx.burst("star", x - 8 * u, y - 14 * u, 2, c, { angle: { min: 180, max: 360 }, speed: { min: 140, max: 380 } });
    fx.floatText(x, y - 100 * u, "CHOMP!", "#3ae8ff", 52);
    if (!reduceFlashing()) fx.ring(x, y, 0xffd23f, { scale: 1.5 * u, duration: 520, width: 3 });
  }

  die() {
    this.dieT = 0;
    this.spin = 0;
    this.dx = 0;
    this.dy = 0;
    this.flapT = this.nearT = this.bestT = 0;
    Sfx.moment("dawson", "death");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const low = this.rig.lowGfx;
    // the wings shatter into iridescent scales; feathers scatter; a splash of bubbles
    for (const c of SCALES) fx.burst("shard", x - 4, y - 6, low ? 3 : 7, c, { speed: { min: 120, max: 420 } });
    for (const c of [0x18a050, 0x18c8b8, 0xffd23f])
      fx.burst("feather", x - 14, y, low ? 2 : 4, c, { speed: { min: 60, max: 240 } });
    fx.burst("bubble", x, y, low ? 6 : 14, 0xbfeaff, { speed: { min: 80, max: 300 } });
  }

  update(dt) {
    this.tick(dt);
    if (this.dieT >= 0) {
      this.dieT += dt;
      this.spin += 900 * dt;
      this.dx += 160 * dt;
      this.dy += (this.dieT * 600 - 80) * dt;
      if (this.dieT > 1.8) this.rig.setVisible(false);
    }
  }

  post(sp) {
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT >= 0) {
      sp.setPosition(Math.round(sp.x + this.dx * m * 0.2), Math.round(sp.y + this.dy * m * 0.2));
      sp.setAngle(Math.round(this.spin / 15) * 15);
      return;
    }
    if (this.flapT > 0) {
      // the swim wiggle: a quick side-to-side tilt of the body
      const k = Math.sin((this.flapT / 0.24) * Math.PI * 2);
      sp.setAngle(Math.round((sp.angle + k * 8) / 2) * 2);
    }
    if (this.bestT > 0) sp.setY(Math.round(sp.y - Math.sin((this.bestT / 1.6) * Math.PI) * 4 * m));
  }

  /** Glowing butterfly scales, bubbles and peacock feather sparkles. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    for (let i = 2; i < n; i += rig.lowGfx ? 4 : 2) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.9 - t);
      const wob = Math.sin(i * 1.3 + rig.time * 2) * 7 * u;
      const x = snap(p.x);
      const y = snap(p.y + wob);
      // a scale: a little diamond in one of the wing colours
      g.fillStyle(SCALES[i % SCALES.length], a);
      g.fillRect(x, y - P, P, P).fillRect(x - P, y, P * 3, P).fillRect(x, y + P, P, P);
      if (!rig.lowGfx && i % 6 === 0) {
        // a bubble (a hollow ring of four squares), drifting up
        const bx = snap(p.x - wob);
        const by = snap(p.y - t * 20 * u - 8 * u);
        g.fillStyle(0xbfeaff, a * 0.9);
        g.fillRect(bx, by - P, P, P).fillRect(bx - P, by, P, P).fillRect(bx + P, by, P, P).fillRect(bx, by + P, P, P);
      }
      if (!rig.lowGfx && i % 8 === 4 && t < 0.7) {
        // a peacock sparkle: a gold plus with a purple heart
        g.fillStyle(0xffd23f, a);
        const sx = snap(p.x + wob);
        const sy = snap(p.y + 12 * u);
        g.fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
        g.fillStyle(0x8a3cd8, a).fillRect(sx, sy, P, P);
      }
    }
  }
}

// ================================================================== DEWBERRY
export class BerryBits extends HeroBits {
  constructor(rig, depth) {
    super(rig, depth);
    // the soft pink glow all around the berry (additive, behind the sprite)
    this.glow = rig.scene.add
      .image(rig.x, rig.y, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PINK)
      .setDepth(depth - 1)
      .setAlpha(0);
    this.flare = 0;
  }
  get objects() {
    return [this.glow];
  }

  frame() {
    if (this.bestT > 0) return 4;
    if (this.nearT > 0) return 3;
    if (this.flapT > 0) return Math.floor(this.flapT / 0.06) % 2 ? 1 : 2; // squish, stretch: the leaf spins
    return 0;
  }

  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.3;
  }

  near() {
    if (this.rig.dead) return;
    this.nearT = 0.45;
    this.flare = Math.max(this.flare, reduceFlashing() ? 0.25 : 0.6);
    if (this.rig.sounds || this.showcase) Sfx.moment("dewberry", "near");
  }

  best() {
    if (this.rig.dead) return;
    this.bestT = 1.4;
    this.flare = reduceFlashing() ? 0.35 : 1;
    if (this.rig.sounds || this.showcase) Sfx.moment("dewberry", "best");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.burst("heart", x, y - 10 * u, this.rig.lowGfx ? 4 : 9, 0xff5ab0, {
      angle: { min: 220, max: 320 },
      speed: { min: 80, max: 240 },
    });
    fx.burst("star", x, y, this.rig.lowGfx ? 3 : 8, PINK_L, { speed: { min: 60, max: 200 } });
  }

  die() {
    this.dieT = 0;
    this.flapT = this.nearT = this.bestT = 0;
    Sfx.moment("dewberry", "death");
    this.rig.setVisible(false); // popped
    this.glow.setVisible(true);
    this.flare = reduceFlashing() ? 0.3 : 0.9;
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const low = this.rig.lowGfx;
    // a juicy splat of glowing pink drops
    fx.burst("goo", x, y, low ? 6 : 14, PINK, { speed: { min: 160, max: 460 } });
    fx.burst("goo", x, y, low ? 3 : 7, PINK_L, { speed: { min: 80, max: 260 } });
    fx.burst("star", x, y, low ? 3 : 8, PINK_L, { speed: { min: 60, max: 220 } });
    fx.burst("pixel", x, y, low ? 4 : 10, 0x4ad85a, { speed: { min: 80, max: 220 } }); // the leaf bits
  }

  reset() {
    super.reset();
    this.flare = 0;
    this.glow.setVisible(true);
  }

  update(dt) {
    this.tick(dt);
    this.flare = Math.max(0, this.flare - dt * (reduceFlashing() ? 0.8 : 1.8));
    if (this.dieT >= 0) {
      this.dieT += dt;
      if (this.dieT > 0.5) this.glow.setVisible(false);
    }
  }

  post(sp) {
    const rig = this.rig;
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT < 0) {
      // gently bobbing as it glides
      sp.setY(Math.round(sp.y - Math.sin(rig.time * 3) * 1.5 * m));
      if (this.flapT > 0) sp.setAngle(0); // jelly bounce stays upright
    }
    // the glow: a slow pulse, brighter in the dark realms (the Abyss) and on big moments
    const dark = rig.scene.zoneId === "abyss" || (rig.scene.darkA || 0) > 0.1;
    const pulse = rig.lowGfx ? 0 : Math.sin(rig.time * 1.6) * 0.08;
    const base = (dark ? 0.55 : 0.32) + pulse;
    this.glow
      .setPosition(sp.x, sp.y)
      .setVisible(this.dieT < 0 ? sp.visible : this.glow.visible)
      .setScale(0.9 * m * (1 + this.flare * 0.6))
      .setAlpha(Math.min(0.95, base + this.flare * 0.5));
  }

  /** Glowing pink droplets and tiny sparkles. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    for (let i = 2; i < n; i += rig.lowGfx ? 4 : 2) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.9 - t);
      // a droplet: a little falling teardrop (pink with a light top)
      const x = snap(p.x + Math.sin(i * 2.1) * 6 * u);
      const y = snap(p.y + t * 16 * u);
      g.fillStyle(PINK, a).fillRect(x, y, P * 2, P * 2);
      g.fillStyle(PINK_L, a).fillRect(x, y - P, P, P);
      if (!rig.lowGfx && i % 6 === 0 && t < 0.75) {
        g.fillStyle(0xffffff, a);
        const sx = snap(p.x - 8 * u);
        const sy = snap(p.y - 12 * u);
        g.fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
      }
    }
  }
}
