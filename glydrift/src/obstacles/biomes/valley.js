// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Peaceful Valley (gentle, slow, readable): ThornVine (slow pendulum), PuffDrift (dandelion
// puffs bobbing with a calm lane between them), BloomGate (flower gap breathes, never shuts).
import { S } from "../../pixel/px.js";
import { circleClear, rectClear, segClear } from "../geometry.js";
import { HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";

export class ThornVine extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "vine";
    this.vine = this.add(this.scene.add.tileSprite(0, 0, 10 * S, 100, "vh_vine").setDepth(HAZ_TOP));
    this.bud = this.add(this.scene.add.image(0, 0, "vh", "bud").setDepth(HAZ_TOP));
  }
  spawn(x, { top = true, L, amp = 0.32, speed = 1.0, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, L, amp, speed, phase });
    this.halfW = Math.sin(amp) * L + 40;
    this.vine.setOrigin(0.5, top ? 0 : 1).setSize(10 * S, L);
    this.bud.setFlipY(!top);
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const ang = this.amp * Math.sin(clock * this.speed + this.phase * 6.28);
    this.ang = ang;
    const rootY = this.top ? -S * 2 : H + S * 2;
    const dir = this.top ? 1 : -1;
    this.ax = this.x;
    this.ay = rootY;
    this.bx = this.x - Math.sin(ang) * this.L * dir;
    this.by = rootY + Math.cos(ang) * this.L * dir;
    this.vine.setPosition(this.ax, this.ay).setRotation(ang);
    this.bud.setPosition(snap(this.bx), snap(this.by)).setRotation(ang);
  }
  clearance(px, py, r) {
    return Math.min(
      segClear(px, py, r, this.ax, this.ay, this.bx, this.by, 4 * S),
      circleClear(px, py, r, this.bx, this.by, 5 * S),
    );
  }
}

export class PuffDrift extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "puffs";
    this.puffs = [];
    for (let i = 0; i < 3; i++)
      this.puffs.push(this.add(this.scene.add.image(0, 0, "vh", "puff_0").setDepth(HAZ_TOP)));
  }
  spawn(x, { ys, bob = 46, phase = 0 }) {
    this.arm(x);
    this.ys = ys;
    this.bob = bob;
    this.phase = phase;
    this.halfW = 40;
    this.puffs.forEach((p, i) => p.setVisible(i < ys.length));
    this.pos = ys.map((y) => ({ x, y }));
  }
  update(dt, clock) {
    this.ys.forEach((y0, i) => {
      const t = clock * 0.8 + this.phase * 6.28 + i * 1.7;
      const p = this.pos[i];
      p.x = this.x + Math.sin(t * 0.7) * 14;
      p.y = y0 + Math.sin(t) * this.bob;
      this.puffs[i]
        .setPosition(snap(p.x), snap(p.y))
        .setFrame(Math.floor(clock * 2 + i) % 2 ? "puff_1" : "puff_0");
    });
  }
  clearance(px, py, r) {
    let c = Infinity;
    for (const p of this.pos) c = Math.min(c, circleClear(px, py, r, p.x, p.y, 6 * S));
    return c;
  }
}

export class BloomGate extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "bloom";
    this.stemT = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_stem")
        .setOrigin(0.5, 1)
        .setDepth(HAZ_TOP),
    );
    this.stemB = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_stem")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP),
    );
    this.headT = this.add(
      this.scene.add.image(0, 0, "vh", "bloomb_0").setOrigin(0.5, 0).setDepth(HAZ_TOP),
    );
    this.headB = this.add(
      this.scene.add.image(0, 0, "vh", "bloom_0").setOrigin(0.5, 1).setDepth(HAZ_TOP),
    );
  }
  spawn(x, { gc, open = 440, narrow = 320, period = 4.2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { gc, open, narrow, period, phase });
    this.halfW = 13 * S;
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const k = 0.5 + 0.5 * Math.sin((clock / this.period + this.phase) * Math.PI * 2);
    const gap = this.narrow + (this.open - this.narrow) * k;
    this.yt = snap(this.gc - gap / 2);
    this.yb = snap(this.gc + gap / 2);
    const f = k > 0.66 ? 0 : k > 0.33 ? 1 : 2;
    this.f = f;
    // heads sit at the gap edges; stalks run from the heads to the screen edges
    this.headT.setPosition(this.x, this.yt - 12 * S).setFrame(`bloomb_${f}`);
    this.headB.setPosition(this.x, this.yb + 12 * S).setFrame(`bloom_${f}`);
    this.stemT.setPosition(this.x, this.yt - 11 * S).setSize(10 * S, this.yt + OFF);
    this.stemB.setPosition(this.x, this.yb + 11 * S).setSize(10 * S, H - this.yb + OFF);
  }
  clearance(px, py, r) {
    const H = this.mgr.H;
    const hw = [13, 11, 9][this.f ?? 0] * S; // petal half-width for the current frame
    return Math.min(
      rectClear(px, py, r, this.x - 4 * S, -OFF, this.x + 4 * S, this.yt - 10 * S),
      rectClear(px, py, r, this.x - 4 * S, this.yb + 10 * S, this.x + 4 * S, H + OFF),
      rectClear(px, py, r, this.x - hw + 2 * S, this.yt - 11 * S, this.x + hw - 2 * S, this.yt),
      rectClear(px, py, r, this.x - hw + 2 * S, this.yb, this.x + hw - 2 * S, this.yb + 11 * S),
    );
  }
}
