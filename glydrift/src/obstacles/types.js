// Obstacle implementations. Each type is pooled by the ObstacleManager: `spawn()` re-arms an
// instance, `kill()` returns it to the pool. Motion is driven by the run clock so it is
// identical for every player in the Daily Challenge.
import Phaser from "phaser";
import { lerpColor } from "../biomes/biomes.js";
import { circleClear, rectClear, segClear } from "./geometry.js";

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;
const OFF = 600; // how far bodies extend beyond the playfield edges

class Obstacle {
  constructor(mgr) {
    this.mgr = mgr;
    this.scene = mgr.scene;
    this.active = false;
    this.objects = [];
    this.lit = 0;
    this.kind = "obstacle";
  }
  add(obj) {
    this.objects.push(obj);
    obj.setVisible(false);
    return obj;
  }
  halo(depth = -35) {
    return this.add(this.scene.add.image(0, 0, "glow").setBlendMode(ADD).setDepth(depth));
  }
  arm(x) {
    this.x = x;
    this.active = true;
    this.passed = false;
    this.minClear = Infinity;
    this.t = 0;
    for (const o of this.objects) o.setVisible(true);
  }
  kill() {
    this.active = false;
    for (const o of this.objects) o.setVisible(false);
  }
  tint(base) {
    return lerpColor(base, 0xffffff, this.lit * 0.55);
  }
  get left() {
    return this.x - this.halfW;
  }
  get right() {
    return this.x + this.halfW;
  }
}

// ------------------------------------------------------------------ spinning saw
export class Saw extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "saw";
    this.glow = this.halo();
    this.img = this.add(this.scene.add.image(0, 0, "saw").setDepth(2));
    this.core = this.add(this.scene.add.image(0, 0, "dot").setDepth(3).setBlendMode(ADD));
  }
  spawn(x, { y, amp = 0, freq = 1, phase = 0, R = 46 }) {
    this.arm(x);
    Object.assign(this, { y0: y, amp, freq, phase, R });
    this.halfW = R + 8;
    this.img.setScale(R / 62);
    this.sparkT = Math.random() * 0.2;
    this.y = y;
  }
  update(dt, clock, pal) {
    this.y = this.y0 + this.amp * Math.sin(clock * this.freq + this.phase);
    this.img.setPosition(this.x, this.y).setTint(this.tint(pal.neon));
    this.img.rotation += dt * (9 + this.R * 0.02);
    this.core
      .setPosition(this.x, this.y)
      .setTint(pal.accent)
      .setScale(0.8 + Math.sin(clock * 12) * 0.15);
    this.glow
      .setPosition(this.x, this.y)
      .setTint(pal.neon)
      .setScale((this.R / 64) * 3.4)
      .setAlpha(0.28 + this.lit * 0.35);
    if (this.amp > 0) {
      const g = this.mgr.g;
      g.lineStyle(3, pal.neon, 0.35);
      g.lineBetween(this.x, this.y0 - this.amp - 10, this.x, this.y0 + this.amp + 10);
      g.fillStyle(pal.neon, 0.7);
      g.fillCircle(this.x, this.y0 - this.amp - 10, 5);
      g.fillCircle(this.x, this.y0 + this.amp + 10, 5);
    }
    // sparks fly off the teeth
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.x < this.mgr.rightEdge) {
      this.sparkT = 0.09 + Math.random() * 0.12;
      const a = Math.random() * TAU;
      this.mgr.fx.burst(
        "spark",
        this.x + Math.cos(a) * this.R,
        this.y + Math.sin(a) * this.R,
        2,
        0xfff1c0,
        {
          angle: { min: Phaser.Math.RadToDeg(a) + 60, max: Phaser.Math.RadToDeg(a) + 120 },
          speed: { min: 120, max: 320 },
        },
      );
    }
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, this.R * 0.9);
  }
}

// ------------------------------------------------------------------ pendulum blade on a chain
export class Blade extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "blade";
    this.glow = this.halo();
    this.chain = this.add(this.scene.add.tileSprite(0, 0, 16, 100, "chain").setDepth(1));
    this.anchor = this.add(this.scene.add.image(0, 0, "emitter").setDepth(2).setScale(0.8));
    this.img = this.add(this.scene.add.image(0, 0, "blade").setDepth(2).setScale(0.78));
  }
  spawn(x, { top = true, L = 360, amp = 0.7, freq = 2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, L, amp, freq, phase });
    this.ay = top ? -14 : this.mgr.H + 14;
    this.halfW = Math.sin(amp) * L + 50;
    this.chain
      .setOrigin(0.5, top ? 0 : 1)
      .setSize(16, L)
      .setDisplaySize(16, L);
    this.chain.tileScaleY = 1;
  }
  update(dt, clock, pal) {
    const th = this.amp * Math.sin(clock * this.freq + this.phase);
    this.th = th;
    const s = Math.sin(th);
    const c = Math.cos(th);
    this.tx = this.x + this.L * s;
    this.ty = this.top ? this.ay + this.L * c : this.ay - this.L * c;
    this.chain
      .setPosition(this.x, this.ay)
      .setRotation(this.top ? -th : th)
      .setTint(this.tint(pal.neon2));
    this.anchor.setPosition(this.x, this.ay).setTint(pal.neon);
    this.img.setPosition(this.tx, this.ty).setTint(this.tint(pal.neon));
    this.img.rotation += dt * 7;
    this.glow
      .setPosition(this.tx, this.ty)
      .setTint(pal.neon)
      .setScale(2.8)
      .setAlpha(0.3 + this.lit * 0.35);
  }
  clearance(px, py, r) {
    return Math.min(
      circleClear(px, py, r, this.tx, this.ty, 42),
      segClear(px, py, r, this.x, this.ay, this.tx, this.ty, 5),
    );
  }
}

// ------------------------------------------------------------------ crusher (slamming pistons)
export class Crusher extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "crusher";
    this.w = 120;
    this.glowT = this.halo();
    this.glowB = this.halo();
    const len = mgr.H + OFF * 2;
    this.topBody = this.add(
      this.scene.add.tileSprite(0, 0, this.w, len, "crusher").setDepth(1).setOrigin(0.5, 1),
    );
    this.botBody = this.add(
      this.scene.add.tileSprite(0, 0, this.w, len, "crusher").setDepth(1).setOrigin(0.5, 0),
    );
    this.topFace = this.add(this.scene.add.image(0, 0, "face").setDepth(2).setOrigin(0.5, 0.75));
    this.botFace = this.add(
      this.scene.add.image(0, 0, "face").setDepth(2).setOrigin(0.5, 0.25).setFlipY(true),
    );
    this.lightT = this.add(this.scene.add.image(0, 0, "dot").setDepth(3).setBlendMode(ADD));
    this.lightB = this.add(this.scene.add.image(0, 0, "dot").setDepth(3).setBlendMode(ADD));
  }
  spawn(x, { gc, open = 360, closed = 120, period = 2.2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { gc, open, closed, period, phase });
    this.halfW = this.w / 2;
    this.wasClosed = false;
  }
  gapAt(clock) {
    const u = (((clock / this.period + this.phase) % 1) + 1) % 1;
    let k; // 0 = open, 1 = closed
    if (u < 0.42) k = 0;
    else if (u < 0.52) k = Phaser.Math.Easing.Cubic.In((u - 0.42) / 0.1);
    else if (u < 0.7) k = 1;
    else k = 1 - Phaser.Math.Easing.Sine.InOut((u - 0.7) / 0.3);
    this.warn = u > 0.3 && u < 0.42;
    return this.open + (this.closed - this.open) * k;
  }
  update(dt, clock, pal) {
    const g = this.gapAt(clock);
    this.gap = g;
    const yt = this.gc - g / 2;
    const yb = this.gc + g / 2;
    this.yt = yt;
    this.yb = yb;
    this.topBody.setPosition(this.x, yt);
    this.topBody.tilePositionY = -yt;
    this.botBody.setPosition(this.x, yb);
    this.botBody.tilePositionY = -yb;
    const faceTint = this.tint(pal.accent);
    this.topFace.setPosition(this.x, yt).setTint(faceTint);
    this.botFace.setPosition(this.x, yb).setTint(faceTint);
    this.topBody.setTint(lerpColor(0xffffff, pal.neon, 0.35));
    this.botBody.setTint(lerpColor(0xffffff, pal.neon, 0.35));
    const blink = this.warn
      ? Math.sin(clock * 40) > 0
        ? 1
        : 0.2
      : 0.5 + Math.sin(clock * 3) * 0.2;
    this.lightT
      .setPosition(this.x, yt - 40)
      .setTint(this.warn ? 0xff2a2a : pal.neon)
      .setAlpha(blink)
      .setScale(0.9);
    this.lightB
      .setPosition(this.x, yb + 40)
      .setTint(this.warn ? 0xff2a2a : pal.neon)
      .setAlpha(blink)
      .setScale(0.9);
    this.glowT
      .setPosition(this.x, yt)
      .setTint(pal.accent)
      .setScale(2.6, 1.6)
      .setAlpha(0.3 + this.lit * 0.3);
    this.glowB
      .setPosition(this.x, yb)
      .setTint(pal.accent)
      .setScale(2.6, 1.6)
      .setAlpha(0.3 + this.lit * 0.3);
    // slam impact
    const closed = g <= this.closed + 2;
    if (closed && !this.wasClosed && this.x < this.mgr.rightEdge && this.x > this.mgr.leftEdge) {
      this.mgr.fx.burst("spark", this.x, this.gc, 14, pal.accent, {
        speed: { min: 150, max: 420 },
      });
      this.mgr.onImpact?.(this);
    }
    this.wasClosed = closed;
  }
  clearance(px, py, r) {
    const x0 = this.x - this.w / 2;
    const x1 = this.x + this.w / 2;
    return Math.min(
      rectClear(px, py, r, x0, -OFF, x1, this.yt),
      rectClear(px, py, r, x0, this.yb, x1, this.mgr.H + OFF),
    );
  }
}

// ------------------------------------------------------------------ sliding gate
export class Gate extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "gate";
    this.w = 64;
    this.glowT = this.halo();
    this.glowB = this.halo();
    const len = mgr.H + OFF * 2;
    this.top = this.add(
      this.scene.add
        .tileSprite(0, 0, this.w, len, "pillar")
        .setDepth(1)
        .setOrigin(0.5, 1)
        .setBlendMode(ADD),
    );
    this.bot = this.add(
      this.scene.add
        .tileSprite(0, 0, this.w, len, "pillar")
        .setDepth(1)
        .setOrigin(0.5, 0)
        .setBlendMode(ADD),
    );
    this.capT = this.add(this.scene.add.image(0, 0, "face").setDepth(2).setScale(0.6, 1));
    this.capB = this.add(this.scene.add.image(0, 0, "face").setDepth(2).setScale(0.6, 1));
  }
  spawn(x, { gc, gap = 280, amp = 120, freq = 1.2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { gc0: gc, gap, amp, freq, phase });
    this.halfW = this.w / 2;
  }
  update(dt, clock, pal) {
    const gc = this.gc0 + this.amp * Math.sin(clock * this.freq + this.phase);
    this.gc = gc;
    this.yt = gc - this.gap / 2;
    this.yb = gc + this.gap / 2;
    const tint = this.tint(pal.neon);
    this.top.setPosition(this.x, this.yt).setTint(tint);
    this.top.tilePositionY = clock * 60;
    this.bot.setPosition(this.x, this.yb).setTint(tint);
    this.bot.tilePositionY = -clock * 60;
    this.capT.setPosition(this.x, this.yt).setTint(this.tint(pal.accent));
    this.capB.setPosition(this.x, this.yb).setTint(this.tint(pal.accent));
    const a = 0.3 + this.lit * 0.35;
    this.glowT.setPosition(this.x, this.yt).setTint(pal.neon).setScale(2, 1.4).setAlpha(a);
    this.glowB.setPosition(this.x, this.yb).setTint(pal.neon).setScale(2, 1.4).setAlpha(a);
  }
  clearance(px, py, r) {
    const x0 = this.x - this.w / 2 + 4;
    const x1 = this.x + this.w / 2 - 4;
    return Math.min(
      rectClear(px, py, r, x0, -OFF, x1, this.yt - 6),
      rectClear(px, py, r, x0, this.yb + 6, x1, this.mgr.H + OFF),
    );
  }
}

// ------------------------------------------------------------------ blinking lasers
// orientation "v": vertical beams leaving a gap; "h": a horizontal beam between two emitters.
export class Laser extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "laser";
    this.glowA = this.halo();
    this.glowB = this.halo();
    this.beamA = this.add(this.scene.add.image(0, 0, "beam").setDepth(2).setBlendMode(ADD));
    this.beamB = this.add(this.scene.add.image(0, 0, "beam").setDepth(2).setBlendMode(ADD));
    this.emA = this.add(this.scene.add.image(0, 0, "emitter").setDepth(3).setScale(0.75));
    this.emB = this.add(this.scene.add.image(0, 0, "emitter").setDepth(3).setScale(0.75));
  }
  spawn(x, { orient = "v", gc, gap = 260, span = 300, on = 1.2, off = 1.0, phase = 0, drift = 0 }) {
    this.arm(x);
    Object.assign(this, { orient, gc, gap, span, on, off, phase, drift });
    this.halfW = orient === "v" ? 22 : span / 2 + 24;
    this.crackleT = 0;
    if (orient === "v") {
      this.beamA.setOrigin(0.5, 1).setAngle(0);
      this.beamB.setOrigin(0.5, 0).setAngle(0);
      this.beamB.setVisible(true);
      this.emB.setVisible(true);
    } else {
      this.beamA.setOrigin(0.5, 0.5).setAngle(90);
      this.beamB.setVisible(false);
    }
  }
  update(dt, clock, pal) {
    const period = this.on + this.off;
    const u = (((clock + this.phase * period) % period) + period) % period;
    this.isOn = u < this.on;
    this.charging = !this.isOn && u > period - 0.4;
    const col = this.tint(pal.neon2);
    const flick = this.isOn
      ? 0.85 + Math.random() * 0.15
      : this.charging
        ? Math.random() < 0.5
          ? 0.25
          : 0.05
        : 0;
    const width = this.isOn ? 0.9 + Math.sin(clock * 50) * 0.1 : 0.25;
    const g = this.mgr.g;
    if (this.orient === "v") {
      this.yt = this.gc - this.gap / 2;
      this.yb = this.gc + this.gap / 2;
      const top = -OFF;
      const H = this.mgr.H;
      this.beamA
        .setPosition(this.x, this.yt)
        .setScale(width, (this.yt - top) / 16)
        .setTint(col)
        .setAlpha(flick);
      this.beamB
        .setPosition(this.x, this.yb)
        .setScale(width, (H + OFF - this.yb) / 16)
        .setTint(col)
        .setAlpha(flick);
      this.emA.setPosition(this.x, this.yt).setTint(this.tint(pal.neon));
      this.emB.setPosition(this.x, this.yb).setTint(this.tint(pal.neon));
      this.glowA
        .setPosition(this.x, this.yt)
        .setTint(pal.neon2)
        .setScale(1.6)
        .setAlpha(0.25 + flick * 0.35);
      this.glowB
        .setPosition(this.x, this.yb)
        .setTint(pal.neon2)
        .setScale(1.6)
        .setAlpha(0.25 + flick * 0.35);
      if (this.isOn) {
        this.crackleT -= dt;
        if (this.crackleT <= 0 && this.x < this.mgr.rightEdge) {
          this.crackleT = 0.06;
          const y1 =
            Math.random() < 0.5 ? this.yt - Math.random() * 300 : this.yb + Math.random() * 300;
          this.mgr.fx.lightningBetween(
            this.x,
            y1,
            this.x + (Math.random() - 0.5) * 30,
            y1 + (Math.random() - 0.5) * 120,
            pal.neon2,
            0.08,
          );
        }
      }
    } else {
      this.y = this.gc + this.drift * Math.sin(clock * 0.9 + this.phase * 6);
      const xa = this.x - this.span / 2;
      const xb = this.x + this.span / 2;
      this.xa = xa;
      this.xb = xb;
      this.beamA
        .setPosition(this.x, this.y)
        .setScale(width, this.span / 16)
        .setTint(col)
        .setAlpha(flick);
      this.emA.setPosition(xa, this.y).setTint(this.tint(pal.neon)).setAngle(90);
      this.emB.setPosition(xb, this.y).setTint(this.tint(pal.neon)).setAngle(90);
      this.glowA
        .setPosition(xa, this.y)
        .setTint(pal.neon2)
        .setScale(1.5)
        .setAlpha(0.25 + flick * 0.3);
      this.glowB
        .setPosition(xb, this.y)
        .setTint(pal.neon2)
        .setScale(1.5)
        .setAlpha(0.25 + flick * 0.3);
      if (this.isOn) {
        this.crackleT -= dt;
        if (this.crackleT <= 0 && this.x < this.mgr.rightEdge) {
          this.crackleT = 0.05;
          const x1 = xa + Math.random() * this.span;
          this.mgr.fx.lightningBetween(
            x1,
            this.y,
            x1 + 40 + Math.random() * 50,
            this.y + (Math.random() - 0.5) * 20,
            pal.neon2,
            0.07,
          );
        }
      }
      if (this.charging) {
        g.lineStyle(2, pal.neon2, 0.4);
        g.lineBetween(xa, this.y, xb, this.y);
      }
    }
    if (this.charging && this.orient === "v") {
      g.lineStyle(2, pal.neon2, 0.35);
      g.lineBetween(this.x, this.yt, this.x, -OFF);
      g.lineBetween(this.x, this.yb, this.x, this.mgr.H + OFF);
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

// ------------------------------------------------------------------ portals
const PORTAL_COLORS = { flip: 0xff4fd8, restore: 0x39ff88, mini: 0xffd23f };

export class Portal extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "portal";
    this.kind = "portal";
    this.glow = this.halo();
    this.ring = this.add(this.scene.add.image(0, 0, "portal").setDepth(4).setBlendMode(ADD));
    this.inner = this.add(this.scene.add.image(0, 0, "portal").setDepth(4).setBlendMode(ADD));
    this.icon = this.add(this.scene.add.image(0, 0, "arrow").setDepth(5).setBlendMode(ADD));
    this.icon2 = this.add(this.scene.add.image(0, 0, "arrow").setDepth(5).setBlendMode(ADD));
  }
  spawn(x, { y, mode }) {
    this.arm(x);
    this.y = y;
    this.mode = mode;
    this.used = false;
    this.halfW = 30;
    const col = PORTAL_COLORS[mode];
    this.ring.setTint(col);
    this.inner.setTint(col);
    this.glow.setTint(col);
    this.icon.setTint(0xffffff);
    this.icon2.setTint(0xffffff).setVisible(mode === "mini");
    this.particleT = 0;
  }
  update(dt, clock) {
    const pulse = 1 + Math.sin(clock * 6) * 0.05;
    this.ring
      .setPosition(this.x, this.y)
      .setScale(pulse, pulse)
      .setAlpha(this.used ? 0.35 : 1);
    this.inner
      .setPosition(this.x, this.y)
      .setScale(0.6 + Math.sin(clock * 4) * 0.1, 0.7)
      .setAlpha(0.6);
    this.glow
      .setPosition(this.x, this.y)
      .setScale(2.2, 4)
      .setAlpha(this.used ? 0.15 : 0.45);
    const bob = Math.sin(clock * 5) * 8;
    if (this.mode === "mini") {
      this.icon
        .setPosition(this.x, this.y - 40 + bob * 0.5)
        .setAngle(180)
        .setScale(0.7);
      this.icon2
        .setPosition(this.x, this.y + 40 - bob * 0.5)
        .setAngle(0)
        .setScale(0.7);
    } else {
      this.icon
        .setPosition(this.x, this.y + bob)
        .setAngle(this.mode === "flip" ? 0 : 180)
        .setScale(0.9);
    }
    this.particleT -= dt;
    if (this.particleT <= 0 && this.x < this.mgr.rightEdge) {
      this.particleT = 0.08;
      const a = Math.random() * TAU;
      this.mgr.fx.burst(
        "dot",
        this.x + Math.cos(a) * 44,
        this.y + Math.sin(a) * 110,
        1,
        PORTAL_COLORS[this.mode],
        {
          speed: { min: 10, max: 40 },
        },
      );
    }
  }
  clearance() {
    return Infinity;
  }
  touches(px, py, r) {
    return !this.used && Math.abs(px - this.x) < 26 + r && Math.abs(py - this.y) < 118 + r;
  }
}

export const TYPES = {
  saw: Saw,
  blade: Blade,
  crusher: Crusher,
  gate: Gate,
  laser: Laser,
  portal: Portal,
};
