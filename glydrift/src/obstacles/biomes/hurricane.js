// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Hurricane: Debris (planks tumbling down-left in the wind), StormBolt (cloud charges with a
// dashed line, then strikes part-way down), Twister (funnel from the floor or ceiling).
import { S } from "../../pixel/px.js";
import { circleClear, rectClear, segClear } from "../geometry.js";
import { ADD, HAZ_TOP, PxObstacle, snap } from "../base.js";

export class Debris extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "debris";
    this.img = this.add(this.scene.add.image(0, 0, "vh", "plank_0").setDepth(HAZ_TOP));
  }
  spawn(x, { y, vx = -90, vy = 150, spin = 6, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y, vx, vy, spin, phase });
    this.halfW = 14 * S;
  }
  update(dt, clock) {
    // carried by the wind: drifts left (on top of the world scroll) and falls; wraps the
    // vertical so a piece never vanishes mid-screen
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const H = this.mgr.H;
    if (this.y > H + 60) this.y = -60;
    const f = ((Math.floor(clock * this.spin + this.phase * 4) % 4) + 4) % 4;
    this.f = f;
    this.img.setPosition(snap(this.x), snap(this.y)).setFrame(`plank_${f}`);
  }
  clearance(px, py, r) {
    const a = (this.f * Math.PI) / 4;
    const L = 10 * S;
    const dx = Math.cos(a) * L;
    const dy = Math.sin(a) * L;
    return segClear(px, py, r, this.x - dx, this.y - dy, this.x + dx, this.y + dy, 3 * S);
  }
}

export class StormBolt extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "bolt";
    this.warn = this.add(
      this.scene.add
        .tileSprite(0, 0, 4 * S, 100, "vh_boltwarn")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP),
    );
    this.glow = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_bolt")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP - 0.1)
        .setBlendMode(ADD)
        .setScale(2, 1),
    );
    this.bolt = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_bolt")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP),
    );
    this.cloud = this.add(this.scene.add.image(0, 0, "vh", "cloud_0").setDepth(HAZ_TOP + 0.1));
  }
  spawn(x, { idle = 1.1, charge = 1.0, strike = 0.4, phase = 0, depth = 0.6 }) {
    this.arm(x);
    Object.assign(this, { idle, charge, strike, phase });
    // the strike only reaches part-way down (shown by the dashed line): fly under it
    this.depth = depth;
    this.period = idle + charge + strike;
    this.halfW = 16 * S;
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const P = this.period;
    const u = (((clock + this.phase * P) % P) + P) % P;
    this.charging = u >= this.idle && u < this.idle + this.charge;
    this.live = u >= this.idle + this.charge;
    const cy = 22 * S;
    this.cy = cy;
    const flick = this.charging && Math.floor(clock * 12) % 2 === 0;
    this.cloud.setPosition(this.x, cy).setFrame(flick || this.live ? "cloud_1" : "cloud_0");
    const len = snap(H * this.depth - cy);
    this.len = len;
    this.warn
      .setPosition(this.x, cy + 6 * S)
      .setSize(4 * S, len)
      .setVisible(this.charging)
      .setAlpha(0.35 + 0.4 * ((u - this.idle) / this.charge));
    if (this.charging) this.warn.tilePositionY -= dt * 80;
    for (const t of [this.bolt, this.glow]) {
      t.setPosition(this.x, cy + 4 * S)
        .setSize(10 * S, len)
        .setVisible(this.live);
      if (this.live) t.tilePositionY = Math.floor(clock * 30) * 7; // crackle
    }
    this.glow.setAlpha(0.45);
    // crackling sparks where the strike ends
    this.sparkT = (this.sparkT ?? 0) - dt;
    if (this.live && this.sparkT <= 0 && this.x < this.mgr.rightEdge) {
      this.sparkT = 0.07;
      this.mgr.fx.burst("spark", this.x, cy + 4 * S + this.len, 3, 0xffd23f);
    }
  }
  clearance(px, py, r) {
    const cloudC = circleClear(px, py, r, this.x, this.cy, 9 * S);
    if (!this.live) return cloudC;
    return Math.min(
      cloudC,
      rectClear(px, py, r, this.x - 3 * S, this.cy, this.x + 3 * S, this.cy + 4 * S + this.len),
    );
  }
}

export class Twister extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "twister";
    this.img = this.add(this.scene.add.image(0, 0, "vh", "twister_0").setDepth(HAZ_TOP));
  }
  spawn(x, { top = false, wander = 40, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, wander, phase });
    this.halfW = 15 * S + wander;
    this.img.setOrigin(0.5, top ? 0 : 1).setFlipY(top);
  }
  update(dt, clock) {
    const H = this.mgr.H;
    this.cx = this.x + Math.sin(clock * 0.9 + this.phase * 6.28) * this.wander;
    this.base = this.top ? 0 : H; // the tip touches this edge
    this.img
      .setPosition(snap(this.cx), this.top ? -S * 2 : H + S * 2)
      .setFrame(`twister_${Math.floor(clock * 10) % 3}`);
  }
  clearance(px, py, r) {
    // funnel: 6 stacked slices, narrow at the tip (the edge), wide at the far end
    const Hf = 96 * S;
    let c = Infinity;
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6;
      const t1 = (i + 1) / 6;
      const half = (2 + 12 * ((t0 + t1) / 2) ** 1.3) * S;
      const a = this.top ? t0 * Hf : this.base - t1 * Hf;
      const b = this.top ? t1 * Hf : this.base - t0 * Hf;
      c = Math.min(c, rectClear(px, py, r, this.cx - half, a, this.cx + half, b));
    }
    return c;
  }
}
