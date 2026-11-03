// Obstacles shared by every biome (except the Peaceful Valley): saw wheels, spiked stone
// gates and the portals (gravity flip / restore / mini).
import Phaser from "phaser";
import { PILLAR_W } from "../pixel/biomeArt.js";
import { S } from "../pixel/px.js";
import { circleClear, rectClear } from "./geometry.js";
import { CAP_H, HAZ_TOP, OFF, PxObstacle, TAU } from "./base.js";

// ------------------------------------------------------------------ spiked saw wheel
export class Saw extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "saw";
    this.rail = this.add(this.scene.add.tileSprite(0, 0, 6 * S, 100, "void_chain").setDepth(1));
    this.img = this.add(this.scene.add.image(0, 0, "void", "saw_12").setDepth(HAZ_TOP));
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

// ------------------------------------------------------------------ stone pillars with spiked ends
export class Gate extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "gate";
    this.w = PILLAR_W * S; // thick pillars (art px × S)
    const len = Math.ceil((mgr.H + OFF * 2) / (16 * S)) * 16 * S;
    this.topBody = this.add(
      this.scene.add
        .tileSprite(0, 0, PILLAR_W * S, len, "void_pillar_0")
        .setOrigin(0.5, 1)
        .setDepth(1),
    );
    this.botBody = this.add(
      this.scene.add
        .tileSprite(0, 0, PILLAR_W * S, len, "void_pillar_0")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.capT = this.add(
      this.scene.add.image(0, 0, "void", "cap_0").setOrigin(0.5, 1).setDepth(HAZ_TOP),
    );
    this.capB = this.add(
      this.scene.add.image(0, 0, "void", "cap_0b").setOrigin(0.5, 0).setDepth(HAZ_TOP),
    );
    this.torch = this.add(this.scene.add.image(0, 0, "void", "torch_0").setDepth(3));
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

// ------------------------------------------------------------------ portals (bright ring + symbol)
export class Portal extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "portal";
    this.kind = "portal";
    // pulsing stepped halo behind the ring (beat-synced)
    this.halo = this.add(
      this.scene.add
        .image(0, 0, "pxglow")
        .setDepth(HAZ_TOP - 0.1)
        .setScale(S * 3)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    this.img = this.add(this.scene.add.image(0, 0, "pxc", "portal_flip_0").setDepth(HAZ_TOP));
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
    const beat = this.mgr.beat || 0;
    this.halo
      .setPosition(this.img.x, this.img.y)
      .setTint({ flip: 0xff4fd8, restore: 0x39ff88, mini: 0xffd23f }[this.mode])
      .setScale(S * (beat > 0.6 ? 4 : 3))
      .setAlpha(this.used ? 0.1 : 0.35 + 0.4 * beat);
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
