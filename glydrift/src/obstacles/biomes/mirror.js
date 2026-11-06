// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Mirror Realm hazards. Each appears on ONE side of the glowing horizon, but your mirror twin
// flies upside down on the other side and can crash too — so every hazard counts twice.
//  Spire (crystal spike from an edge), VoidOrb (bobbing orb), SweepBar (an energy bar that
//  sweeps between its half's edge and the horizon along a dashed track).
import { S } from "../../pixel/px.js";
import { HAZ_TOP, OFF, PxObstacle, snap, TAU } from "../base.js";
import { circleClear, rectClear } from "../geometry.js";

export class Spire extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "spire";
    this.body = this.add(
      this.scene.add.tileSprite(0, 0, 12 * S, 100, "dh_spire").setDepth(HAZ_TOP),
    );
    this.tip = this.add(this.scene.add.image(0, 0, "dh", "spiretip").setDepth(HAZ_TOP));
  }
  spawn(x, { top = false, h }) {
    this.arm(x);
    Object.assign(this, { top, h });
    this.halfW = 6 * S;
  }
  update() {
    const H = this.mgr.H;
    const tipH = 12 * S;
    if (this.top) {
      this.body
        .setOrigin(0.5, 0)
        .setPosition(this.x, -OFF)
        .setSize(12 * S, OFF + this.h - tipH);
      this.tip
        .setFrame("spiretip_b")
        .setOrigin(0.5, 0)
        .setPosition(this.x, this.h - tipH);
    } else {
      this.body
        .setOrigin(0.5, 1)
        .setPosition(this.x, H + OFF)
        .setSize(12 * S, OFF + this.h - tipH);
      this.tip
        .setFrame("spiretip")
        .setOrigin(0.5, 1)
        .setPosition(this.x, H - this.h + tipH);
    }
  }
  clearance(px, py, r) {
    const H = this.mgr.H;
    const tipH = 12 * S;
    if (this.top)
      return Math.min(
        rectClear(px, py, r, this.x - 5 * S, -OFF, this.x + 5 * S, this.h - tipH),
        rectClear(px, py, r, this.x - 2.5 * S, this.h - tipH, this.x + 2.5 * S, this.h - 2 * S),
      );
    return Math.min(
      rectClear(px, py, r, this.x - 5 * S, H - this.h + tipH, this.x + 5 * S, H + OFF),
      rectClear(
        px,
        py,
        r,
        this.x - 2.5 * S,
        H - this.h + 2 * S,
        this.x + 2.5 * S,
        H - this.h + tipH,
      ),
    );
  }
}

export class VoidOrb extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "vorb";
    this.img = this.add(this.scene.add.image(0, 0, "dh", "vorb_0").setDepth(HAZ_TOP));
  }
  spawn(x, { y, bob = 30, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y0: y, bob, phase });
    this.halfW = 8 * S;
  }
  update(dt, clock) {
    this.y = this.y0 + Math.sin(clock * 1.6 + this.phase * TAU) * this.bob;
    this.img
      .setPosition(snap(this.x), snap(this.y))
      .setFrame(Math.floor(clock * 5) % 2 ? "vorb_1" : "vorb_0");
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, 7 * S);
  }
}

export class SweepBar extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "vbar";
    this.track = this.add(
      this.scene.add
        .tileSprite(0, 0, 4 * S, 100, "dh_vtrack")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.bar = this.add(this.scene.add.image(0, 0, "dh", "vbar").setDepth(HAZ_TOP));
  }
  spawn(x, { top = false, period = 3, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, period, phase });
    this.halfW = 17 * S;
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const a = this.top ? 40 : H / 2 + 50; // range inside this half
    const b = this.top ? H / 2 - 50 : H - 40;
    const k = 0.5 + 0.5 * Math.sin((clock / this.period + this.phase) * TAU);
    this.y = a + (b - a) * k;
    this.track.setPosition(this.x, a).setSize(4 * S, b - a);
    this.bar.setPosition(snap(this.x), snap(this.y));
  }
  clearance(px, py, r) {
    return rectClear(px, py, r, this.x - 17 * S, this.y - 3 * S, this.x + 17 * S, this.y + 3 * S);
  }
}
