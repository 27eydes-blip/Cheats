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
import { DAWSON_SKINS, dawson, dawsonLook, REALM_WINGS } from "../pixel/dawsonArt.js";
import { rim } from "../pixel/common.js";
import { addAtlas } from "../pixel/px.js";

const RAINBOW = [0xff3a5a, 0xff8a2a, 0xffd23f, 0x5ae06a, 0x18c8b8, 0x3a8aff, 0x8a3cd8];
const PINK = 0xff4fa0;
const PINK_L = 0xff9ad0;

export class HeroBits {
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
// His upgrade (all cosmetic): Migration (2-3 tiny butterflies follow him and scatter on
// near-misses), realm wings (each realm paints his wings; his skins keep their own), Full
// Display (new best: his tail fans across the screen for a second, behind gameplay) and the
// Chomp (at x5 combo or higher a near-miss is a bite with a CHOMP sound). The bow on game over
// is in GameOverScene.js; the Great White and Neon Reef skins are in dawsonArt.js.
export class SharkBits extends HeroBits {
  constructor(rig, depth) {
    super(rig, depth);
    const sc = rig.scene;
    // the hero being flown (not the Mirror twin or previews)
    this.live = !!rig.fx && !!rig.sounds && sc.sys.settings.key === "Game";
    this.chompT = this.displayT = 0;
    this.realm = null;
    // the Neon Reef glow
    this.bodyGlow = sc.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(depth - 1);
    // Migration: tiny butterflies that follow him (in game and on the hero screen)
    this.bflies = [];
    if (rig.fx && (this.live || this.showcase))
      for (let i = 0; i < (rig.lowGfx ? 2 : 3); i++)
        this.bflies.push({
          im: sc.add.image(rig.x, rig.y, "pxc", "dawson_bfly_0").setDepth(depth - 0.5),
          x: rig.x - 30,
          y: rig.y,
          vx: 0,
          vy: 0,
          scatterT: 0,
          ph: i * 2.1,
        });
    this.fan = null; // Full Display (graphics, created on the first new best)
  }
  get objects() {
    return [this.bodyGlow, ...this.bflies.map((b) => b.im), this.fan].filter(Boolean);
  }

  // ---------------------------------------------------------------- look
  /** His look right now: one of his skins, or realm wings on the classic look. */
  look() {
    const rig = this.rig;
    const skin = DAWSON_SKINS[rig.cos?.dskin] ? rig.cos.dskin : null;
    const realm = !skin && this.live ? rig.scene.zoneId || null : null;
    return { skin, realm };
  }
  get skinned() {
    return !!this.look().skin;
  }
  /** The atlas key for his current look (built on first use, 7 small frames). */
  lookKey() {
    const { skin, realm } = this.look();
    const key = `dlook_${skin || "classic"}_${REALM_WINGS[realm] ? realm : "x"}`;
    const sc = this.rig.scene;
    if (!sc.textures.exists(key)) {
      const L = dawsonLook(skin, realm);
      const frames = {};
      for (let f = 0; f < 7; f++) frames[`dawson_${f}`] = rim(dawson(f, L));
      addAtlas(sc, key, frames);
    }
    this.realm = realm;
    return key;
  }
  get pal() {
    const { skin, realm } = this.look();
    return dawsonLook(skin, realm);
  }

  // ---------------------------------------------------------------- frames
  frame() {
    if (this.dieT >= 0) return 5;
    if (this.chompT > 0) return 6;
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
    // the butterflies scatter
    for (const b of this.bflies) {
      const a = Math.random() * Math.PI * 2;
      b.vx = Math.cos(a) * (260 + Math.random() * 200);
      b.vy = Math.sin(a) * (260 + Math.random() * 200);
      b.scatterT = 0.7;
    }
    if (!fx) return;
    const u = this.rig.u;
    // Chomp: at x5 or higher every near-miss is a bite
    if (this.live && (this.rig.scene.mult || 1) >= 5) {
      this.chompT = 0.32;
      Sfx.moment("dawson", "chomp");
      fx.floatText(x + 30 * u, y - 60 * u, "CHOMP", "#ffffff", 34);
      fx.burst("pixel", x + 14 * u, y, this.rig.lowGfx ? 3 : 6, 0xffffff, { speed: { min: 80, max: 200 } });
      return;
    }
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
    if (this.live || this.showcase) fx.floatText(x, y - 100 * u, "CHOMP!", "#3ae8ff", 52);
    if (!reduceFlashing()) fx.ring(x, y, 0xffd23f, { scale: 1.5 * u, duration: 520, width: 3 });
    // Full Display: the whole tail fans across the screen for a second (behind gameplay)
    if (this.live) this.displayT = 1;
  }

  die() {
    this.dieT = 0;
    this.spin = 0;
    this.dx = 0;
    this.dy = 0;
    this.flapT = this.nearT = this.bestT = this.chompT = 0;
    Sfx.moment("dawson", "death");
    for (const b of this.bflies) {
      b.vx = (Math.random() - 0.3) * 500;
      b.vy = -200 - Math.random() * 200;
      b.scatterT = 9; // they fly off
    }
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const low = this.rig.lowGfx;
    const L = this.pal;
    // the wings shatter into iridescent scales; feathers scatter; a splash of bubbles
    for (const c of [L.wing, L.edge, L.spot2, L.spot])
      fx.burst("shard", x - 4, y - 6, low ? 3 : 7, c, { speed: { min: 120, max: 420 } });
    for (const c of [L.fold[1], L.wing, L.spot2])
      fx.burst("feather", x - 14, y, low ? 2 : 4, c, { speed: { min: 60, max: 240 } });
    fx.burst("bubble", x, y, low ? 6 : 14, 0xbfeaff, { speed: { min: 80, max: 300 } });
  }

  reset() {
    super.reset();
    this.chompT = this.displayT = 0;
    for (const b of this.bflies) {
      b.scatterT = 0;
      b.x = this.rig.x - 30;
      b.y = this.rig.y;
      b.im.setAlpha(1);
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.tick(dt);
    this.chompT = Math.max(0, this.chompT - dt);
    if (this.dieT >= 0) {
      this.dieT += dt;
      this.spin += 900 * dt;
      this.dx += 160 * dt;
      this.dy += (this.dieT * 600 - 80) * dt;
      if (this.dieT > 1.8) this.rig.setVisible(false);
    }
    // realm wings: a new realm or dimension repaints them
    const rig = this.rig;
    if (this.live && !this.skinned && (rig.scene.zoneId || null) !== this.realm)
      rig.sprite.setTexture(this.lookKey(), rig.sprite.frame.name);
    this.updateBflies(dt);
    this.updateDisplay(dt);
  }

  updateBflies(dt) {
    const rig = this.rig;
    const sp = rig.sprite;
    const u = rig.u;
    this.bflies.forEach((b, i) => {
      if (b.scatterT > 0) {
        b.scatterT -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= Math.exp(-dt * 1.5);
        b.vy *= Math.exp(-dt * 1.5);
        if (this.dieT >= 0) b.im.setAlpha(Math.max(0, b.im.alpha - dt));
      } else {
        // follow a little behind him, each on its own wobble
        const tx = sp.x - (30 + i * 16) * u + Math.cos(rig.time * 1.7 + b.ph) * 8 * u;
        const ty = sp.y - 12 * u + Math.sin(rig.time * 2.3 + b.ph) * 14 * u;
        const k = 1 - Math.exp(-dt * 5);
        b.x += (tx - b.x) * k;
        b.y += (ty - b.y) * k;
      }
      // (the atlas is already drawn at art scale: match the hero's own sprite scale)
      const m = (Math.abs(sp.scaleX) || 1) * 1.5;
      b.im
        .setFrame(Math.floor(rig.time * 10 + i) % 2 ? "dawson_bfly_1" : "dawson_bfly_0")
        .setPosition(Math.round(b.x), Math.round(b.y))
        .setScale(m)
        .setVisible(sp.visible || this.dieT >= 0);
    });
  }

  /** Full Display: a screen-wide peacock fan behind gameplay (hazards start at depth 1). */
  updateDisplay(dt) {
    if (!(this.displayT > 0)) {
      if (this.fan?.visible) this.fan.clear().setVisible(false);
      return;
    }
    this.displayT = Math.max(0, this.displayT - dt);
    const sc = this.rig.scene;
    if (!this.fan) this.fan = sc.add.graphics().setDepth(0.5);
    const g = this.fan.clear().setVisible(true);
    const p = 1 - this.displayT; // 0 → 1 over one second
    const open = Math.min(1, p / 0.3); // opens in 0.3 s
    const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    const calm = reduceFlashing();
    const L = this.pal;
    const rays = this.rig.lowGfx ? 7 : 13;
    const ox = this.rig.x;
    const oy = sc.H * 0.98;
    const R = sc.H * 0.62 * (0.4 + 0.6 * open);
    const P = 8;
    for (let i = 0; i < rays; i++) {
      const t = i / (rays - 1);
      const a = Math.PI * (1 - t) * open + (Math.PI / 2) * (1 - open); // folded straight up → a half circle
      const col = L.fan[Math.round(t * (L.fan.length - 1))];
      // (Reduce Flashing: no colour shimmer, softer)
      const shimmer = calm ? 0 : Math.sin(this.rig.time * 8 + i) * 0.12;
      const alpha = (calm ? 0.22 : 0.45 + shimmer) * fade;
      this.fanPeak = Math.max(this.fanPeak || 0, alpha); // (tests)
      const ex = ox + Math.cos(a) * R;
      const ey = oy - Math.sin(a) * R;
      // a feather: a stepped line of squares widening toward its eye
      const n = Math.ceil(R / (P * 1.5));
      g.fillStyle(col, alpha);
      for (let k = 2; k <= n; k++) {
        const f = k / n;
        const w = P * (f > 0.55 ? 3 : 2);
        g.fillRect(Math.round((ox + (ex - ox) * f) / P) * P - w / 2, Math.round((oy + (ey - oy) * f) / P) * P, w, P * 2);
      }
      g.fillStyle(L.spot2, Math.min(1, alpha * 1.3)).fillCircle(ex, ey, P * 3);
      g.fillStyle(L.spot, Math.min(1, alpha * 1.5)).fillCircle(ex, ey, P * 1.5);
    }
  }

  post(sp) {
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT >= 0) {
      sp.setPosition(Math.round(sp.x + this.dx * m * 0.2), Math.round(sp.y + this.dy * m * 0.2));
      sp.setAngle(Math.round(this.spin / 15) * 15);
    } else {
      if (this.flapT > 0) {
        // the swim wiggle: a quick side-to-side tilt of the body
        const k = Math.sin((this.flapT / 0.24) * Math.PI * 2);
        sp.setAngle(Math.round((sp.angle + k * 8) / 2) * 2);
      }
      if (this.bestT > 0) sp.setY(Math.round(sp.y - Math.sin((this.bestT / 1.6) * Math.PI) * 4 * m));
    }
    // the Neon Reef glow
    const L = this.pal;
    if (L.glow && sp.visible) {
      this.bodyGlow
        .setVisible(true)
        .setTint(L.glow)
        .setPosition(sp.x, sp.y)
        .setScale(0.8 * m)
        .setAlpha(this.rig.lowGfx || reduceFlashing() ? 0.35 : 0.35 + 0.1 * Math.sin(this.rig.time * 2));
    } else this.bodyGlow.setVisible(false);
  }

  /** Glowing butterfly scales, bubbles and peacock feather sparkles (in his look's colours). */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    const L = this.pal;
    const SC = [L.wing, L.edge, L.spot2, L.spot];
    for (let i = 2; i < n; i += rig.lowGfx ? 4 : 2) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.9 - t);
      const wob = Math.sin(i * 1.3 + rig.time * 2) * 7 * u;
      const x = snap(p.x);
      const y = snap(p.y + wob);
      // a scale: a little diamond in one of the wing colours
      g.fillStyle(SC[i % SC.length], a);
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
        g.fillStyle(L.spot2, a);
        const sx = snap(p.x + wob);
        const sy = snap(p.y + 12 * u);
        g.fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
        g.fillStyle(L.spot, a).fillRect(sx, sy, P, P);
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
