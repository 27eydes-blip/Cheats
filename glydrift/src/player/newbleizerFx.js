// THE NEWBLEIZER, the samurai hooper. His one perk is the jump (+8% flap height, in
// Player.flap); everything here is cosmetic: the hitbox, speed and gravity are the standard
// ones, and poses swap art frames of the same size.
//   flap   a basketball-style jump (frame 1) into a quick katana spin (frame 2) with a
//          circular blade swoosh
//   glide  sword low at his side, sash flowing behind him (frame 0)
//   near   blade up (frame 3) and a quick sword-flash glint
//   best   the dunk: a hoop appears ahead of him, he rises and slams the ball through (frame
//          5, the net swishes), then slides his katana home over his shoulder (frame 6)
//   death  dazed (frame 7): the ball drops from his hip and bounces away, cartoon stars
//          circle his head, then he falls
//   trail  a faint red sash ribbon with small sparks
//   idle   (menus) the confident pose (frame 4), the dunk every few seconds
// The orange basketball glows wherever it is (hip, hand, overhead). Low Graphics: fewer sparks,
// no swoosh. Reduce Flashing: no flash line on the glint, softer rings.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";
import { HeroBits } from "./hybridFx.js";

const RED = 0xd8202a;
const RED_D = 0x8e1018;
const ORANGE = 0xff8a1a;
const GOLD = 0xffc83a;
const STEEL = 0xe8f0ff;
const DUNK = 1.0; // the dunk, then the sheathe
const BEST = 1.9;
/** Where the ball is in each frame (rimmed art coordinates, 26x26), or null (dropped). */
const BALL_AT = [[8, 15], [8, 15], [8, 15], [8, 15], [19.5, 16.5], [17.5, 2.5], [8, 15], null];

export class SamuraiBits extends HeroBits {
  constructor(rig, depth) {
    super(rig, depth);
    const sc = rig.scene;
    this.g = sc.add.graphics().setDepth(depth - 1.5); // the spin swoosh, the hoop
    this.fg = sc.add.graphics().setDepth(depth + 1.2); // glint, net, stars
    this.ballGlow = sc.add
      .image(rig.x, rig.y, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(ORANGE)
      .setDepth(depth - 0.5)
      .setVisible(false);
    this.ball = sc.add.image(rig.x, rig.y, "pxc", "newbleizer_ball").setDepth(depth + 0.6).setVisible(false);
    this.idleT = 1.4;
    this.hoop = null;
  }
  get objects() {
    return [this.g, this.fg, this.ballGlow, this.ball];
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
    if (this.bestT > 0) return BEST - this.bestT < DUNK ? 5 : 6;
    if (this.nearT > 0) return 3;
    if (this.flapT > 0) return this.flapT > 0.17 ? 1 : 2;
    return this.menu ? 4 : 0;
  }

  // ---------------------------------------------------------------- reactions
  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.3;
    const { fx } = this.rig;
    if (!fx) return;
    const p = this.at(19, 4);
    fx.burst("spark", p.x, p.y, this.rig.lowGfx ? 2 : 4, STEEL, { speed: { min: 60, max: 180 } });
  }

  near() {
    if (this.rig.dead || this.bestT > 0) return;
    this.nearT = 0.3;
    this.glintT = 0.18;
    const { fx } = this.rig;
    if (fx) {
      const p = this.at(21, 3); // the blade tip in the guard pose
      fx.burst("star", p.x, p.y, this.rig.lowGfx ? 1 : 3, 0xffffff, { speed: { min: 0, max: 60 } });
    }
    if (this.rig.sounds || this.showcase) Sfx.moment("newbleizer", "near");
  }

  best() {
    if (this.rig.dead) return;
    this.bestT = BEST;
    this.flapT = this.nearT = 0;
    this.swished = this.sheathed = false;
    // the hoop hangs ahead of him and a little above, fixed on screen while he dunks
    const m = this.m;
    this.hoop = { x: this.rig.x + 21 * m, y: this.rig.y - 17 * m };
    if (this.rig.sounds || this.showcase) Sfx.moment("newbleizer", "best");
    const { fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    if (!reduceFlashing()) fx.ring(this.hoop.x, this.hoop.y, ORANGE, { scale: 0.9 * u, duration: 320, width: 2 });
  }

  reset() {
    super.reset();
    this.glintT = 0;
    this.hoop = null;
    this.ballV = null;
    this.ball.setVisible(false);
    this.ballGlow.setVisible(false);
    this.g.clear();
    this.fg.clear();
  }

  // ---------------------------------------------------------------- death
  die() {
    this.dieT = 0;
    this.bestT = this.nearT = this.flapT = 0;
    this.hoop = null;
    this.by = 0;
    this.bvy = -160;
    Sfx.moment("newbleizer", "death");
    // the ball drops from his hip and bounces away (back the way he came)
    const p = this.at(8, 15);
    const u = this.rig.u;
    this.ballV = { x: p.x, y: p.y, vx: -140 * u, vy: -260 * u, floor: p.y + 40 * u, bounces: 0, spin: 0 };
    this.ball.setPosition(p.x, p.y).setDisplaySize(7 * this.m, 7 * this.m).setAngle(0).setAlpha(1).setVisible(true);
    const { fx } = this.rig;
    if (!fx) return;
    fx.burst("star", this.rig.x, this.rig.y - 12 * u, this.rig.lowGfx ? 5 : 10, GOLD, {
      speed: { min: 100, max: 300 },
    });
    fx.burst("pixel", this.rig.x, this.rig.y, this.rig.lowGfx ? 5 : 12, RED, { speed: { min: 80, max: 260 } });
    fx.ring(this.rig.x, this.rig.y, 0xffffff, { scale: 1.1 * u, duration: reduceFlashing() ? 650 : 420, width: 2 });
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    this.tick(dt);
    this.glintT = Math.max(0, (this.glintT || 0) - dt);
    if (this.dieT >= 0) {
      this.dieT += dt;
      if (this.dieT > 0.7) {
        this.bvy += 1600 * dt;
        this.by += this.bvy * dt;
      } else {
        this.by += this.bvy * dt;
        this.bvy += 420 * dt;
      }
      if (this.dieT > 1.7) this.rig.setVisible(false);
      this.updateBall(dt);
      this.ballGlow.setVisible(false);
      this.g.clear();
      this.drawStars();
      return;
    }
    if (this.rig.dead) return;
    if (this.bestT <= 0) this.hoop = null;
  }

  /** The dropped ball: bounces along, each bounce lower, then fades. */
  updateBall(dt) {
    const b = this.ballV;
    if (!b) return;
    b.vy += 1500 * this.rig.u * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > b.floor && b.vy > 0) {
      b.y = b.floor;
      b.vy *= -0.62;
      b.bounces++;
      if (this.rig.fx && b.bounces < 4)
        this.rig.fx.burst("pixel", b.x, b.y + 3 * this.m, 2, ORANGE, { speed: { min: 20, max: 80 } });
    }
    b.spin -= 520 * dt;
    const fade = Math.max(0, 1 - Math.max(0, this.dieT - 1.4) / 0.5);
    this.ball.setPosition(Math.round(b.x), Math.round(b.y)).setAngle(Math.round(b.spin / 15) * 15).setAlpha(fade);
    if (fade <= 0) {
      this.ball.setVisible(false);
      this.ballV = null;
    }
  }

  /** After the sprite is placed: the glide sway, the dunk rise, the dazed fall. */
  post(sp) {
    const m = this.m;
    const rig = this.rig;
    if (this.dieT >= 0) {
      sp.setPosition(Math.round(sp.x - this.dieT * 40 * m), Math.round(sp.y + this.by));
      sp.setAngle(Math.round((Math.sin(this.dieT * 9) * 12 - this.dieT * 40) / 3) * 3);
      return;
    }
    if (this.bestT > 0) {
      const t = BEST - this.bestT;
      // rise to the rim, hang, then back down for the sheathe
      const k = t < DUNK ? Math.sin(Math.min(1, t / 0.45) * Math.PI * 0.5) : Math.max(0, 1 - (t - DUNK) / 0.3);
      sp.setPosition(Math.round(sp.x + 8 * m * k), Math.round(sp.y - 10 * m * k));
      sp.setAngle(0);
    } else if (this.flapT > 0) {
      // the quick katana spin is in the blade (frames 1-2); his body snaps a half turn of tilt
      sp.setAngle(Math.round((sp.angle - Math.sin((this.flapT / 0.3) * Math.PI) * 14) / 2) * 2);
    } else if (this.menu) {
      sp.setY(Math.round(sp.y - Math.abs(Math.sin(rig.time * 2.4)) * 2 * m));
    }
    this.drawSwoosh(sp);
    this.drawHoop();
    this.drawGlint();
    this.placeBallGlow(sp);
  }

  placeBallGlow(sp) {
    const a = BALL_AT[this.frame()];
    const show = !!a && sp.visible && !this.rig.dead;
    this.ballGlow.setVisible(show);
    if (!show) return;
    const p = this.at(a[0], a[1]);
    const pulse = 0.55 + Math.sin(this.rig.time * 4) * (this.rig.lowGfx || reduceFlashing() ? 0.05 : 0.15);
    this.ballGlow.setPosition(p.x, p.y).setAlpha(pulse);
    this.ballGlow.setDisplaySize(16 * this.m, 16 * this.m);
  }

  /** The katana spin: a circle of steel squares sweeping round him while the flap plays. */
  drawSwoosh(sp) {
    const g = this.g.clear();
    if (this.flapT <= 0 || this.rig.lowGfx || this.rig.dead) return;
    const m = this.m;
    const P = Math.max(2, Math.round(m));
    const k = 1 - this.flapT / 0.3; // 0 → 1 over the spin
    const a1 = -Math.PI * 0.6 + k * Math.PI * 2;
    const r = 15 * m;
    for (let i = 0; i < 12; i++) {
      const a = a1 - i * 0.16;
      const x = Math.round((sp.x + Math.cos(a) * r) / P) * P;
      const y = Math.round((sp.y + Math.sin(a) * r * 0.8) / P) * P;
      g.fillStyle(i < 2 ? 0xffffff : STEEL, (1 - i / 12) * 0.85 * (1 - k * 0.4));
      g.fillRect(x - P, y - P / 2, P * 2, P);
    }
  }

  /** The new-best hoop (orange rim, white net) ahead of him; the net swishes as he dunks. */
  drawHoop() {
    const g = this.fg.clear();
    if (!this.hoop || this.bestT <= 0) return;
    const m = this.m;
    const P = Math.max(2, Math.round(m));
    const t = BEST - this.bestT;
    // the hoop rides along with him (he keeps flying, and the hero screen turns him about)
    const fl = this.rig.gravityDir < 0 ? -1 : 1;
    this.hoop = { x: this.rig.x + 21 * m, y: this.rig.y - 17 * m * fl };
    const a = t < 0.15 ? t / 0.15 : this.bestT < 0.35 ? this.bestT / 0.35 : 1; // fade in / out
    const { x, y } = this.hoop;
    const snap = (v) => Math.round(v / P) * P;
    // the backboard and the rim
    g.fillStyle(0xffffff, 0.85 * a).fillRect(snap(x + 7 * m), snap(y - 11 * m), P * 2, snap(15 * m));
    g.fillStyle(ORANGE, a).fillRect(snap(x - 7 * m), snap(y), snap(14 * m), P * 2);
    // the net: swings once the ball goes through (from ~0.45 s)
    const sw = t > 0.45 && t < 0.9 ? Math.sin((t - 0.45) * 30) * 1.5 * m : 0;
    g.fillStyle(0xffffff, 0.8 * a);
    for (let i = 0; i < 5; i++) {
      for (let j = 1; j <= 4; j++) {
        const nx = x - 6 * m + i * 3 * m + (j / 4) * (2 * m - i * m) + sw * (j / 4);
        g.fillRect(snap(nx), snap(y + j * 2.2 * m), P, P);
      }
    }
    // the slam: from 0.4 s the ball leaves his hands and drops through the net
    if (t > 0.4 && t < 0.95) {
      const k = (t - 0.4) / 0.55;
      this.ball.setVisible(true).setDisplaySize(7 * m, 7 * m).setAlpha(1).setAngle(0);
      this.ball.setPosition(Math.round(x), Math.round(y - 4 * m + k * 18 * m));
      if (!this.swished && t > 0.5) {
        this.swished = true;
        const { fx } = this.rig;
        if (fx) {
          fx.floatText(x, y - 28 * m, "SWISH!", "#ffb050", 44);
          fx.burst("star", x, y + 4 * m, this.rig.lowGfx ? 5 : 12, GOLD, {
            angle: { min: 200, max: 340 },
            speed: { min: 120, max: 360 },
          });
        }
      }
    } else if (!this.ballV) this.ball.setVisible(false);
    // the katana slides home: a glint on the hilt
    if (!this.sheathed && t > DUNK + 0.55) {
      this.sheathed = true;
      const p = this.at(16, 2);
      this.rig.fx?.burst("star", p.x, p.y, 2, 0xffffff, { speed: { min: 0, max: 40 } });
    }
  }

  /** The near-miss sword flash: a short bright diagonal line through the blade tip. */
  drawGlint() {
    if (!(this.glintT > 0) || this.rig.dead) return;
    const g = this.fg;
    const m = this.m;
    const P = Math.max(2, Math.round(m));
    const p = this.at(21, 3);
    const k = this.glintT / 0.18;
    const calm = reduceFlashing();
    const len = (calm ? 3 : 7) * m * (1 - k * 0.3);
    g.fillStyle(0xffffff, (calm ? 0.5 : 0.95) * k);
    for (let i = -len; i <= len; i += P) g.fillRect(Math.round((p.x + i) / P) * P, Math.round((p.y - i) / P) * P, P, P);
    g.fillRect(Math.round(p.x / P) * P - P, Math.round(p.y / P) * P - P, P * 3, P * 3);
  }

  /** Cartoon stars circling his head while he's dazed. */
  drawStars() {
    const g = this.fg.clear();
    const sp = this.rig.sprite;
    if (!sp.visible || this.dieT > 1.5) return;
    const m = this.m;
    const P = Math.max(2, Math.round(m));
    const cx = sp.x;
    const cy = sp.y - 13 * m;
    const a0 = this.dieT * 7;
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i * Math.PI * 2) / 3;
      const s = Math.round((cx + Math.cos(a) * 9 * m) / P) * P;
      const t = Math.round((cy + Math.sin(a) * 3 * m) / P) * P;
      g.fillStyle(i === 1 ? 0xffffff : GOLD, 1);
      g.fillRect(s - P, t, P * 3, P).fillRect(s, t - P, P, P * 3);
    }
  }

  /** A faint red sash ribbon waving behind him, with small gold sparks. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.55 - t * 0.6);
      const wave = Math.sin(i * 0.45 - rig.time * 6) * 5 * u * t;
      const w = Math.max(P, snap(8 * (1 - t) * u));
      g.fillStyle(t < 0.5 ? RED : RED_D, a);
      g.fillRect(snap(p.x - w / 2), snap(p.y + 6 * u + wave), w, P);
      if (!rig.lowGfx && i % 6 === 0 && t < 0.7) {
        g.fillStyle(i % 12 ? GOLD : 0xffffff, a + 0.25);
        g.fillRect(snap(p.x), snap(p.y + 6 * u + wave + (i % 12 ? -8 : 8) * u), P, P);
      }
    }
  }
}
