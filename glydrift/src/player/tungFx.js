// TUNG (legendary): the super cute baby unicorn. Cosmetic only: standard hitbox, speed and
// gravity; poses swap art frames of the same size and move only the picture (tungArt.js).
//   flap   tiny wings flutter fast (frames 1/2), mane and tail bounce, little hearts pop off;
//          a soft twinkly chime with a random pitch (sfx.js FLAP.tung)
//   glide  gentle floaty bobbing, mane flowing behind her, the horn twinkling
//   idle   (hero screen) prances in place, flicks her mane, blinks slowly, then a sparkle burst
//          from her horn
//   near   a quick wink (frame 3) with a star sparkle
//   best   a rainbow arcs across the screen behind her (behind gameplay) with a magical chime
//   death  bursts into pastel sparkles, hearts and tiny stars with a gentle sparkly "poof"
//   trail  a soft pastel rainbow with floating sparkles and tiny hearts
// Low Graphics: fewer particles, a steady horn glow. Reduce Flashing: a softer rainbow, no
// flashing rings or pulsing glow.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";
import { HeroBits } from "./hybridFx.js";

const PASTEL = [0xffa8d8, 0xffc8a8, 0xfff0a0, 0xa8f0d0, 0xa8d8ff, 0xc8a8ff]; // the rainbow
const HEART = 0xff8ac0;
const GOLD = 0xffd23f;
const IDLE_CYCLE = 4.5; // s: prance → flick → blink → horn sparkle

export class UnicornBits extends HeroBits {
  constructor(rig, depth) {
    super(rig, depth);
    const sc = rig.scene;
    this.live = !!rig.fx && !!rig.sounds && sc.sys.settings.key === "Game";
    this.rainbowT = 0;
    this.idleT = 0.3;
    this.twinkleT = 0.8;
    // the horn's soft glow (additive, at the horn tip)
    this.hornGlow = sc.add
      .image(rig.x, rig.y, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff0a0)
      .setDepth(depth + 0.1)
      .setVisible(false);
    this.arc = null; // the new-best rainbow (graphics, made on the first new best)
  }
  get objects() {
    return [this.hornGlow, this.arc].filter(Boolean);
  }

  /** (The hero screen runs her idle routine instead of repeating the new-best moment.) */
  tick(dt) {
    for (const k of ["flapT", "nearT", "bestT"]) this[k] = Math.max(0, this[k] - dt);
    if (this.menu && !this.rig.dead) {
      this.idleT += dt;
      if (this.idleT >= IDLE_CYCLE) this.idleT -= IDLE_CYCLE;
      // the horn sparkle at the end of the routine
      const t = this.idleT;
      if (t >= 2.6 && t - dt < 2.6) this.hornSparkle(this.rig.lowGfx ? 6 : 12);
    }
  }

  frame() {
    if (this.bestT > 0) return 4;
    if (this.nearT > 0) return 3;
    if (this.flapT > 0) return Math.floor(this.flapT / 0.05) % 2 ? 1 : 2; // a fast flutter
    if (this.menu) {
      const t = this.idleT;
      if (t < 1.2) return Math.floor(t / 0.2) % 2 ? 6 : 0; // prancing in place
      if (t < 1.5) return 1; // the mane flick
      if (t >= 2 && t < 2.35) return 5; // a slow blink
      return 0;
    }
    return 0;
  }

  /** Her horn tip, in world space (the art faces right; flips with gravity). */
  hornTip() {
    const sp = this.rig.sprite;
    const m = Math.abs(sp.displayWidth) / 26;
    const fl = sp.scaleY < 0 ? -1 : 1;
    return { x: sp.x + 6 * m, y: sp.y - 11 * m * fl, m };
  }

  hornSparkle(n) {
    const { fx } = this.rig;
    if (!fx) return;
    const h = this.hornTip();
    fx.burst("star", h.x, h.y, n, GOLD, { speed: { min: 60, max: 200 } });
    fx.burst("star", h.x, h.y, Math.ceil(n / 2), PASTEL[4], { speed: { min: 40, max: 160 } });
    if (this.showcase) Sfx.moment("tung", "near");
  }

  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.24;
    const { fx } = this.rig;
    if (!fx) return;
    const sp = this.rig.sprite;
    const u = this.rig.u;
    // little hearts pop off
    fx.burst("heart", sp.x - 6 * u, sp.y - 8 * u, this.rig.lowGfx ? 1 : 2, HEART, {
      angle: { min: 200, max: 320 },
      speed: { min: 40, max: 120 },
    });
  }

  near() {
    if (this.rig.dead) return;
    this.nearT = 0.45;
    const { fx } = this.rig;
    if (fx) {
      // a star sparkle by the wink
      const sp = this.rig.sprite;
      const m = Math.abs(sp.displayWidth) / 26;
      fx.burst("star", sp.x + 8 * m, sp.y - 5 * m, this.rig.lowGfx ? 3 : 6, GOLD, { speed: { min: 60, max: 180 } });
    }
    if (this.rig.sounds || this.showcase) Sfx.moment("tung", "near");
  }

  best() {
    if (this.rig.dead) return;
    this.bestT = 1.4;
    if (this.rig.sounds || this.showcase) Sfx.moment("tung", "best");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    fx.burst("heart", x, y - 10 * this.rig.u, this.rig.lowGfx ? 3 : 7, HEART, { speed: { min: 80, max: 240 } });
    if (!reduceFlashing()) fx.ring(x, y, 0xfff0a0, { scale: 1.4 * this.rig.u, duration: 520, width: 3 });
    // a rainbow arcs across the screen behind her (behind gameplay)
    if (this.live) this.rainbowT = 1.4;
  }

  die() {
    this.dieT = 0;
    this.flapT = this.nearT = this.bestT = 0;
    Sfx.moment("tung", "death");
    this.rig.setVisible(false); // poof
    this.hornGlow.setVisible(false);
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const low = this.rig.lowGfx;
    // pastel sparkles, hearts and tiny stars
    for (const c of low ? PASTEL.filter((_, i) => i % 2 === 0) : PASTEL)
      fx.burst("spark", x, y, low ? 2 : 4, c, { speed: { min: 80, max: 320 } });
    fx.burst("heart", x, y, low ? 3 : 7, HEART, { speed: { min: 60, max: 240 } });
    fx.burst("star", x, y, low ? 4 : 9, 0xfff6c0, { speed: { min: 60, max: 260 } });
    fx.burst("smoke", x, y, low ? 3 : 6, 0xf4e4ff, { speed: { min: 20, max: 90 } });
  }

  reset() {
    super.reset();
    this.rainbowT = 0;
  }

  update(dt) {
    this.tick(dt);
    if (this.dieT >= 0) this.dieT += dt;
    // the horn twinkles now and then as she glides
    if (this.live && this.dieT < 0 && !this.rig.lowGfx) {
      this.twinkleT -= dt;
      if (this.twinkleT <= 0) {
        this.twinkleT = 0.7 + Math.random() * 0.6;
        const h = this.hornTip();
        this.rig.fx?.burst("spark", h.x, h.y, 1, 0xfff6c0, { speed: { min: 10, max: 40 } });
      }
    }
    this.updateRainbow(dt);
  }

  /** The new-best rainbow: pastel bands arc across the screen, behind the hazards (depth 0.5). */
  updateRainbow(dt) {
    if (!(this.rainbowT > 0)) {
      if (this.arc?.visible) this.arc.clear().setVisible(false);
      return;
    }
    this.rainbowT = Math.max(0, this.rainbowT - dt);
    const sc = this.rig.scene;
    if (!this.arc) this.arc = sc.add.graphics().setDepth(0.5);
    const g = this.arc.clear().setVisible(true);
    const p = 1 - this.rainbowT / 1.4; // 0 → 1
    const sweep = Math.min(1, p / 0.35); // it arcs across in 0.5 s
    const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    const alpha = (reduceFlashing() ? 0.22 : 0.42) * fade;
    const cx = sc.W * 0.5;
    const cy = sc.H * 0.95;
    const R = sc.W * 0.62;
    const band = sc.W * 0.035;
    const P = 8;
    const steps = this.rig.lowGfx ? 28 : 48;
    PASTEL.forEach((col, k) => {
      const r = R - k * band;
      g.fillStyle(col, alpha);
      // a stepped pixel arc from the left horizon, sweeping over to the right
      for (let i = 0; i <= steps * sweep; i++) {
        const a = Math.PI - (i / steps) * Math.PI;
        const x = Math.round((cx + Math.cos(a) * r) / P) * P;
        const y = Math.round((cy - Math.sin(a) * r) / P) * P;
        g.fillRect(x - P, y - band / 2, P * 2, band);
      }
    });
  }

  post(sp) {
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT >= 0) return;
    // gentle floaty bobbing as she glides (a little hop while prancing on the hero screen)
    if (this.menu && this.idleT < 1.2) sp.setY(Math.round(sp.y - Math.abs(Math.sin(this.idleT * Math.PI * 5)) * 3 * m));
    else if (this.flapT <= 0) sp.setY(Math.round(sp.y - Math.sin(this.rig.time * 2.6) * 1.5 * m));
    if (this.flapT > 0) sp.setAngle(0); // (the wings do the work: she stays upright)
    // the horn glows softly (steady on Low Graphics / Reduce Flashing)
    const h = this.hornTip();
    const steady = this.rig.lowGfx || reduceFlashing();
    this.hornGlow
      .setVisible(sp.visible)
      .setPosition(h.x, h.y)
      .setScale(0.22 * m * (this.bestT > 0 ? 1.6 : 1))
      .setAlpha(steady ? 0.5 : 0.45 + 0.15 * Math.sin(this.rig.time * 3));
  }

  /** A soft pastel rainbow ribbon with floating sparkles and tiny hearts. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    const bands = rig.lowGfx ? 3 : 6;
    for (let i = 2; i < n; i += rig.lowGfx ? 3 : 2) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.75 - t);
      const x = snap(p.x);
      // the ribbon: pastel bands stacked under her path
      for (let k = 0; k < bands; k++) {
        g.fillStyle(PASTEL[Math.round((k * (PASTEL.length - 1)) / (bands - 1))], a);
        g.fillRect(x, snap(p.y - (bands / 2) * P + k * P), P, P);
      }
      if (!rig.lowGfx && i % 7 === 0) {
        // a floating sparkle
        const sx = snap(p.x + Math.sin(i + rig.time) * 6 * u);
        const sy = snap(p.y - (10 + t * 18) * u);
        g.fillStyle(0xfff6c0, a).fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
      }
      if (!rig.lowGfx && i % 11 === 5) {
        // a tiny heart
        const hx = snap(p.x);
        const hy = snap(p.y + (12 + t * 10) * u);
        g.fillStyle(HEART, a);
        g.fillRect(hx - P, hy, P, P).fillRect(hx + P, hy, P, P).fillRect(hx - P, hy + P, P * 3, P).fillRect(hx, hy + P * 2, P, P);
      }
    }
  }
}
