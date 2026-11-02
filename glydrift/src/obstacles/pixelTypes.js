// Pixel-art obstacles. Collision maths is identical to the neon versions (gameplay unchanged);
// only the visuals differ: solid outlined tile blocks, bright spikes, pixel sprites.
import Phaser from "phaser";
import { S } from "../pixel/px.js";
import { circleClear, rectClear, segClear } from "./geometry.js";
import { Crusher } from "./types.js";

const TAU = Math.PI * 2;
const OFF = 600;
const CAP_H = 12 * S; // spiked cap height (art 12px)

class PxObstacle {
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
  get theme() {
    return this.mgr.theme;
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
  get left() {
    return this.x - this.halfW;
  }
  get right() {
    return this.x + this.halfW;
  }
}

// ------------------------------------------------------------------ spiked saw wheel
export class Saw extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "saw";
    this.rail = this.add(this.scene.add.tileSprite(0, 0, 6 * S, 100, "nv_chain").setDepth(1));
    this.img = this.add(this.scene.add.image(0, 0, "nv", "saw_12").setDepth(2));
  }
  spawn(x, { y, amp = 0, freq = 1, phase = 0, R = 46 }) {
    this.arm(x);
    Object.assign(this, { y0: y, amp, freq, phase, R });
    this.halfW = R + 8;
    this.sparkT = Math.random() * 0.2;
    this.y = y;
    const t = this.theme;
    const sizes = [10, 12, 14, 16];
    const want = R / S;
    const r = sizes.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    this.img.setTexture(t.atlas, `saw_${r}`);
    this.rail.setTexture(t.chain);
    this.rail.setVisible(amp > 0);
    if (amp > 0) this.rail.setSize(6 * S, amp * 2 + 40).setDisplaySize(6 * S, amp * 2 + 40);
  }
  update(dt, clock) {
    this.y = this.y0 + this.amp * Math.sin(clock * this.freq + this.phase);
    this.img.setPosition(this.x, this.y);
    // spin in crisp 22.5° steps (smooth rotation would smear the pixels)
    this.spin = (this.spin || 0) + dt * 9;
    this.img.setRotation(Math.round(this.spin / (TAU / 16)) * (TAU / 16));
    this.rail.setPosition(this.x, this.y0);
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.x < this.mgr.rightEdge) {
      this.sparkT = 0.12 + Math.random() * 0.14;
      const a = Math.random() * TAU;
      this.mgr.fx.burst(
        "pixel",
        this.x + Math.cos(a) * this.R,
        this.y + Math.sin(a) * this.R,
        2,
        this.theme.spark,
        {
          angle: { min: Phaser.Math.RadToDeg(a) + 60, max: Phaser.Math.RadToDeg(a) + 120 },
          speed: { min: 120, max: 300 },
        },
      );
    }
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, this.R * 0.88);
  }
}

// ------------------------------------------------------------------ axe on a chain
export class Blade extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "blade";
    this.chain = this.add(this.scene.add.tileSprite(0, 0, 6 * S, 100, "nv_chain").setDepth(1));
    this.pivot = this.add(this.scene.add.image(0, 0, "nv", "emitter").setDepth(2));
    this.head = this.add(this.scene.add.image(0, 0, "nv", "axe").setDepth(2));
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

// ------------------------------------------------------------------ stone pillars with spiked ends
export class Gate extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "gate";
    this.w = 64;
    const len = Math.ceil((mgr.H + OFF * 2) / (16 * S)) * 16 * S;
    this.topBody = this.add(
      this.scene.add
        .tileSprite(0, 0, 16 * S, len, "nv_pillar_0")
        .setOrigin(0.5, 1)
        .setDepth(1),
    );
    this.botBody = this.add(
      this.scene.add
        .tileSprite(0, 0, 16 * S, len, "nv_pillar_0")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.capT = this.add(this.scene.add.image(0, 0, "nv", "cap_0").setOrigin(0.5, 1).setDepth(2));
    this.capB = this.add(this.scene.add.image(0, 0, "nv", "cap_0b").setOrigin(0.5, 0).setDepth(2));
    this.torch = this.add(this.scene.add.image(0, 0, "nv", "torch_0").setDepth(3));
  }
  spawn(x, { gc, gap = 280, amp = 120, freq = 1.2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { gc0: gc, gap, amp, freq, phase });
    this.halfW = this.w / 2;
    const t = this.theme;
    const r = Math.random;
    this.topBody.setTexture(t.pillars[Math.floor(r() * t.pillars.length)]);
    this.botBody.setTexture(t.pillars[Math.floor(r() * t.pillars.length)]);
    const cap = t.caps[Math.floor(r() * t.caps.length)];
    this.capT.setTexture(t.atlas, cap);
    this.capB.setTexture(t.atlas, `${cap}b`);
    // a torch mounted on one of the pillar faces (decoration only)
    this.torchSide = r() < 0.5 ? -1 : 1;
    this.torchOff = 90 + r() * 140;
    this.torch.setVisible(r() < 0.6);
  }
  update(dt, clock) {
    const gc = this.gc0 + this.amp * Math.sin(clock * this.freq + this.phase);
    this.gc = gc;
    this.yt = gc - this.gap / 2;
    this.yb = gc + this.gap / 2;
    // spike tips sit exactly on the collision edge
    this.capT.setPosition(this.x, this.yt);
    this.capB.setPosition(this.x, this.yb);
    this.topBody.setPosition(this.x, this.yt - CAP_H + S * 3);
    this.botBody.setPosition(this.x, this.yb + CAP_H - S * 3);
    if (this.torch.visible) {
      const f = Math.floor(clock * 9 + this.x * 0.01) % 3;
      this.torch.setFrame(`torch_${f}`);
      this.torch.setPosition(
        this.x,
        this.torchSide < 0 ? this.yt - CAP_H - this.torchOff : this.yb + CAP_H + this.torchOff,
      );
    }
  }
  clearance(px, py, r) {
    const x0 = this.x - this.w / 2 + 4;
    const x1 = this.x + this.w / 2 - 4;
    return Math.min(
      rectClear(px, py, r, x0, -OFF, x1, this.yt - 4),
      rectClear(px, py, r, x0, this.yb + 4, x1, this.mgr.H + OFF),
    );
  }
}

// ------------------------------------------------------------------ lasers
export class Laser extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "laser";
    this.beamA = this.add(this.scene.add.tileSprite(0, 0, 4 * S, 100, "nv_beam_v").setDepth(2));
    this.beamB = this.add(this.scene.add.tileSprite(0, 0, 4 * S, 100, "nv_beam_v").setDepth(2));
    this.emA = this.add(this.scene.add.image(0, 0, "nv", "emitter").setDepth(3));
    this.emB = this.add(this.scene.add.image(0, 0, "nv", "emitter").setDepth(3));
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
    } else {
      const w = span - 40;
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
    // beam texture crawls so the energy reads as "live"
    if (this.isOn) {
      this.beamA.tilePositionY -= dt * 240;
      this.beamB.tilePositionY += dt * 240;
      this.beamA.tilePositionX -= dt * 240;
    }
    if (this.orient === "v") {
      this.beamA.setPosition(this.x, this.yt - 20);
      this.beamB.setPosition(this.x, this.yb + 20);
      this.emA.setPosition(this.x, this.yt);
      this.emB.setPosition(this.x, this.yb);
    } else {
      this.y = this.gc + this.drift * Math.sin(clock * 0.9 + this.phase * 6);
      this.xa = this.x - this.span / 2;
      this.xb = this.x + this.span / 2;
      this.beamA.setPosition(this.x, this.y);
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

// ------------------------------------------------------------------ portals (bright ring + symbol)
export class Portal extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "portal";
    this.kind = "portal";
    this.img = this.add(this.scene.add.image(0, 0, "pxc", "portal_flip_0").setDepth(4));
  }
  spawn(x, { y, mode }) {
    this.arm(x);
    this.y = y;
    this.mode = mode;
    this.used = false;
    this.halfW = 74;
    this.R = 66;
    this.particleT = 0;
  }
  update(dt, clock) {
    const f = Math.floor(clock * 8) % 4;
    this.img.setFrame(`portal_${this.mode}_${f}`);
    this.img
      .setPosition(this.x, this.y + Math.round(Math.sin(clock * 4) * 2) * S)
      .setAlpha(this.used ? 0.35 : 1);
    this.particleT -= dt;
    if (this.particleT <= 0 && this.x < this.mgr.rightEdge && !this.used) {
      this.particleT = 0.09;
      const ang = Math.random() * TAU;
      this.mgr.fx.burst(
        "pixel",
        this.x + Math.cos(ang) * this.R,
        this.y + Math.sin(ang) * this.R,
        1,
        0xffb3ef,
        {
          speed: { min: 20, max: 50 },
        },
      );
    }
  }
  clearance() {
    return Infinity;
  }
  touches(px, py, r) {
    return !this.used && Math.hypot(px - this.x, py - this.y) < this.R + r * 0.6;
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
