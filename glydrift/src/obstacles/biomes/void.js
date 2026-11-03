// Neon Void signature hazards: the axe on a chain (Blade) and the vertical / horizontal
// lasers (Laser) with their charge-up warning.
import { S } from "../../pixel/px.js";
import { circleClear, rectClear, segClear } from "../geometry.js";
import { ADD, OFF, PxObstacle, TAU } from "../base.js";

const GLOW = 14; // laser glow width (art px)

// ------------------------------------------------------------------ axe on a chain
export class Blade extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "blade";
    this.chain = this.add(this.scene.add.tileSprite(0, 0, 6 * S, 100, "void_chain").setDepth(1));
    this.pivot = this.add(this.scene.add.image(0, 0, "void", "emitter").setDepth(2));
    this.head = this.add(this.scene.add.image(0, 0, "void", "axe").setDepth(2));
  }
  spawn(x, { top = true, L = 360, amp = 0.7, freq = 2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, L, amp, freq, phase });
    this.ay = top ? -14 : this.mgr.H + 14;
    this.halfW = Math.sin(amp) * L + 50;
    const t = this.theme;
    this.chain.setTexture(t.chain).setOrigin(0.5, top ? 0 : 1);
    this.chain.setSize(6 * S, L).setDisplaySize(6 * S, L);
    this.pivot.setTexture(t.atlas, "emitter");
    this.head.setTexture(t.atlas, "axe");
  }
  update(dt, clock) {
    const th = this.amp * Math.sin(clock * this.freq + this.phase);
    this.tx = this.x + this.L * Math.sin(th);
    this.ty = this.top ? this.ay + this.L * Math.cos(th) : this.ay - this.L * Math.cos(th);
    this.chain.setPosition(this.x, this.ay).setRotation(this.top ? -th : th);
    this.pivot.setPosition(this.x, this.ay);
    this.head.setPosition(this.tx, this.ty);
    this.spin = (this.spin || 0) + dt * 7;
    this.head.setRotation(Math.round(this.spin / (TAU / 16)) * (TAU / 16));
  }
  clearance(px, py, r) {
    return Math.min(
      circleClear(px, py, r, this.tx, this.ty, 40),
      segClear(px, py, r, this.x, this.ay, this.tx, this.ty, 5),
    );
  }
}

// ------------------------------------------------------------------ lasers
export class Laser extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "laser";
    // additive stepped glow under the hot core so the beam reads as energy, not a platform
    this.glowA = this.add(
      this.scene.add
        .tileSprite(0, 0, GLOW * S, 100, "void_glow_v")
        .setDepth(1.9)
        .setBlendMode(ADD),
    );
    this.glowB = this.add(
      this.scene.add
        .tileSprite(0, 0, GLOW * S, 100, "void_glow_v")
        .setDepth(1.9)
        .setBlendMode(ADD),
    );
    this.beamA = this.add(this.scene.add.tileSprite(0, 0, 4 * S, 100, "void_beam_v").setDepth(2));
    this.beamB = this.add(this.scene.add.tileSprite(0, 0, 4 * S, 100, "void_beam_v").setDepth(2));
    this.emA = this.add(this.scene.add.image(0, 0, "void", "emitter").setDepth(3));
    this.emB = this.add(this.scene.add.image(0, 0, "void", "emitter").setDepth(3));
  }
  spawn(x, { orient = "v", gc, gap = 260, span = 300, on = 1.2, off = 1.0, phase = 0, drift = 0 }) {
    this.arm(x);
    Object.assign(this, { orient, gc, gap, span, on, off, phase, drift });
    this.halfW = orient === "v" ? 22 : span / 2 + 24;
    const t = this.theme;
    this.emA.setTexture(t.atlas, "emitter");
    this.emB.setTexture(t.atlas, "emitter");
    if (orient === "v") {
      const yt = gc - gap / 2;
      const yb = gc + gap / 2;
      this.yt = yt;
      this.yb = yb;
      const H = this.mgr.H;
      const hA = yt - 20 + OFF;
      const hB = H + OFF - (yb + 20);
      this.beamA
        .setTexture(t.beamV)
        .setOrigin(0.5, 1)
        .setSize(4 * S, hA)
        .setDisplaySize(4 * S, hA);
      this.beamB
        .setTexture(t.beamV)
        .setOrigin(0.5, 0)
        .setSize(4 * S, hB)
        .setDisplaySize(4 * S, hB);
      this.beamB.setVisible(true);
      this.glowA
        .setTexture(t.glowV)
        .setOrigin(0.5, 1)
        .setSize(GLOW * S, hA)
        .setDisplaySize(GLOW * S, hA);
      this.glowB
        .setTexture(t.glowV)
        .setOrigin(0.5, 0)
        .setSize(GLOW * S, hB)
        .setDisplaySize(GLOW * S, hB);
      this.glowB.setVisible(true);
    } else {
      const w = span - 40;
      this.glowA
        .setTexture(t.glowH)
        .setOrigin(0.5, 0.5)
        .setSize(w, GLOW * S)
        .setDisplaySize(w, GLOW * S);
      this.glowB.setVisible(false);
      this.beamA
        .setTexture(t.beamH)
        .setOrigin(0.5, 0.5)
        .setSize(w, 4 * S)
        .setDisplaySize(w, 4 * S);
      this.beamB.setVisible(false);
    }
  }
  update(dt, clock) {
    const period = this.on + this.off;
    const u = (((clock + this.phase * period) % period) + period) % period;
    this.isOn = u < this.on;
    this.charging = !this.isOn && u > period - 0.4;
    const a = this.isOn
      ? Math.random() < 0.85
        ? 1
        : 0.75
      : this.charging
        ? Math.random() < 0.5
          ? 0.45
          : 0.1
        : 0;
    this.beamA.setAlpha(a);
    this.beamB.setAlpha(a);
    // glow breathes fast and stutters (live current); a faint pre-flash while charging
    const g = this.isOn
      ? (0.38 + 0.2 * Math.sin(clock * 38 + this.phase * 9)) * (Math.random() < 0.15 ? 0.3 : 1)
      : this.charging
        ? Math.random() < 0.5
          ? 0.3
          : 0
        : 0;
    this.glowA.setAlpha(g);
    this.glowB.setAlpha(g);
    if (this.isOn) {
      this.glowA.tilePositionY -= dt * 120;
      this.glowB.tilePositionY += dt * 120;
      this.glowA.tilePositionX -= dt * 120;
      // crackling pixel lightning along the beam: unmistakably live current
      this.arcT = (this.arcT ?? 0) - dt;
      if (this.arcT <= 0 && this.x < this.mgr.rightEdge && this.mgr.fx) {
        this.arcT = 0.12 + Math.random() * 0.16;
        const col = this.theme.hazard;
        if (this.orient === "v") {
          const top = Math.random() < 0.5;
          const y0 = top ? this.yt - 20 - Math.random() * 300 : this.yb + 20 + Math.random() * 300;
          const y1 = y0 + (top ? -1 : 1) * (60 + Math.random() * 80);
          this.mgr.fx.lightningBetween(this.x, y0, this.x, y1, col, 0.1);
        } else {
          const x0 = this.xa + 20 + Math.random() * (this.xb - this.xa - 120);
          this.mgr.fx.lightningBetween(x0, this.y, x0 + 60 + Math.random() * 60, this.y, col, 0.1);
        }
      }
      // sparks spit off the beam
      this.sparkT = (this.sparkT ?? 0) - dt;
      if (this.sparkT <= 0 && this.x < this.mgr.rightEdge && this.mgr.fx) {
        this.sparkT = 0.09 + Math.random() * 0.12;
        const v = this.orient === "v";
        const along = Math.random();
        const sx = v ? this.x : this.xa + (this.xb - this.xa) * along;
        const sy = v
          ? along < 0.5
            ? this.yt - 20 - Math.random() * 260
            : this.yb + 20 + Math.random() * 260
          : this.y;
        this.mgr.fx.burst("pixel", sx, sy, 2, this.theme.spark, {
          angle: v ? { min: -30, max: 30 } : { min: 240, max: 300 },
          speed: { min: 80, max: 220 },
        });
      }
    }
    // beam texture crawls so the energy reads as "live"
    if (this.isOn) {
      this.beamA.tilePositionY -= dt * 240;
      this.beamB.tilePositionY += dt * 240;
      this.beamA.tilePositionX -= dt * 240;
    }
    if (this.orient === "v") {
      this.beamA.setPosition(this.x, this.yt - 20);
      this.beamB.setPosition(this.x, this.yb + 20);
      this.glowA.setPosition(this.x, this.yt - 20);
      this.glowB.setPosition(this.x, this.yb + 20);
      this.emA.setPosition(this.x, this.yt);
      this.emB.setPosition(this.x, this.yb);
    } else {
      this.y = this.gc + this.drift * Math.sin(clock * 0.9 + this.phase * 6);
      this.xa = this.x - this.span / 2;
      this.xb = this.x + this.span / 2;
      this.beamA.setPosition(this.x, this.y);
      this.glowA.setPosition(this.x, this.y);
      this.emA.setPosition(this.xa, this.y);
      this.emB.setPosition(this.xb, this.y);
    }
  }
  clearance(px, py, r) {
    if (this.orient === "v") {
      let c = Math.min(
        circleClear(px, py, r, this.x, this.yt, 18),
        circleClear(px, py, r, this.x, this.yb, 18),
      );
      if (this.isOn) {
        c = Math.min(
          c,
          rectClear(px, py, r, this.x - 6, -OFF, this.x + 6, this.yt),
          rectClear(px, py, r, this.x - 6, this.yb, this.x + 6, this.mgr.H + OFF),
        );
      }
      return c;
    }
    let c = Math.min(
      circleClear(px, py, r, this.xa, this.y, 18),
      circleClear(px, py, r, this.xb, this.y, 18),
    );
    if (this.isOn) c = Math.min(c, segClear(px, py, r, this.xa, this.y, this.xb, this.y, 6));
    return c;
  }
}
