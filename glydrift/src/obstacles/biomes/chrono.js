// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Chrono Fracture: ClockGear (spinning toothed gear, may slide on a rail), Pendulum (a swinging
// blade on a brass rod — only the blade cuts), TimeZone (harmless field: golden = everything
// slows, red = everything speeds up) and RewindBlade (runs along its track, then visibly
// rewinds and replays — the ◀◀ glyph and afterimages show the way back).
import { S } from "../../pixel/px.js";
import { Field, HAZ_TOP, OFF, PxObstacle, snap, TAU } from "../base.js";
import { circleClear } from "../geometry.js";
import { lay } from "./prism.js";

export class ClockGear extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "cgear";
    this.img = this.add(this.scene.add.image(0, 0, "dh", "cgear_0").setDepth(HAZ_TOP));
  }
  spawn(x, { y, amp = 0, freq = 1, spin = 3, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y0: y, amp, freq, spin, phase });
    this.halfW = 14 * S;
  }
  update(dt, clock) {
    this.y = this.y0 + Math.sin(clock * this.freq + this.phase * TAU) * this.amp;
    const rot = clock * this.spin;
    this.img
      .setPosition(snap(this.x), snap(this.y))
      .setFrame(`cgear_${Math.floor(rot * 8) % 4}`)
      .setRotation(Math.round(rot / (TAU / 16)) * (TAU / 16));
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, 11 * S);
  }
}

export class Pendulum extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "pendulum";
    this.rod = this.add(
      this.scene.add
        .tileSprite(0, 0, 4 * S, 100, "dh_rod")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP - 0.2),
    );
    this.blade = this.add(this.scene.add.image(0, 0, "dh", "pend").setDepth(HAZ_TOP));
  }
  spawn(x, { L, amp = 0.6, period = 2.4, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { L, amp, period, phase });
    this.halfW = Math.sin(amp) * L + 14 * S;
  }
  update(dt, clock) {
    const a = this.amp * Math.sin((clock / this.period + this.phase) * TAU);
    this.bx = this.x + Math.sin(a) * this.L;
    this.by = -S * 2 + Math.cos(a) * this.L;
    lay(this.rod, this.x, -S * 2, this.bx, this.by);
    this.blade.setPosition(snap(this.bx), snap(this.by + 4 * S)).setRotation(-a);
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.bx, this.by + 5 * S, 10 * S);
  }
}

export class TimeZone extends Field {
  constructor(mgr) {
    super(mgr, "timezone", "dh_slow", 0.3);
  }
  spawn(x, { w = 420, fast = false }) {
    this.arm(x);
    this.fast = fast;
    this.halfW = w / 2;
    this.strip.setTexture(fast ? "dh_fast" : "dh_slow").setTileScale(S);
  }
  update(dt) {
    const H = this.mgr.H;
    this.strip.setPosition(this.x, -OFF).setSize(this.halfW * 2, H + OFF * 2);
    this.strip.tilePositionX += dt * (this.fast ? 40 : 8);
  }
  apply(ev) {
    ev.timeScale = this.fast ? 1.35 : 0.6;
  }
}

export class RewindBlade extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "rewind";
    this.track = this.add(
      this.scene.add
        .tileSprite(0, 0, 4 * S, 100, "dh_track")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.ghosts = [0, 1, 2].map((i) =>
      this.add(
        this.scene.add
          .image(0, 0, "dh", "rblade_0")
          .setDepth(HAZ_TOP - 0.1)
          .setAlpha(0.3 - i * 0.08),
      ),
    );
    this.blade = this.add(this.scene.add.image(0, 0, "dh", "rblade_0").setDepth(HAZ_TOP));
    this.icon = this.add(this.scene.add.image(0, 0, "dh", "rewind").setDepth(HAZ_TOP + 0.1));
  }
  spawn(x, { y1, y2, fwd = 1.3, hold = 0.25, back = 0.6, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y1, y2, fwd, hold, back, phase });
    this.period = fwd + hold + back + hold;
    this.halfW = 10 * S;
    this.hist = [];
  }
  update(dt, clock) {
    const P = this.period;
    const u = (((clock + this.phase * P) % P) + P) % P;
    const ease = (t) => t * t * (3 - 2 * t);
    let k;
    this.rewinding = false;
    if (u < this.fwd) k = ease(u / this.fwd);
    else if (u < this.fwd + this.hold) k = 1;
    else if (u < this.fwd + this.hold + this.back) {
      k = 1 - (u - this.fwd - this.hold) / this.back; // linear: a tape running backwards
      this.rewinding = true;
    } else k = 0;
    this.y = this.y1 + (this.y2 - this.y1) * k;
    this.track
      .setPosition(this.x, Math.min(this.y1, this.y2))
      .setSize(4 * S, Math.abs(this.y2 - this.y1));
    const f = `rblade_${Math.floor(clock * (this.rewinding ? -24 : 12) + 400) % 4}`;
    this.blade.setPosition(snap(this.x), snap(this.y)).setFrame(f);
    this.hist.unshift(this.y);
    if (this.hist.length > 9) this.hist.pop();
    this.ghosts.forEach((g, i) =>
      g
        .setVisible(this.rewinding)
        .setPosition(snap(this.x), snap(this.hist[(i + 1) * 3] ?? this.y))
        .setFrame(f),
    );
    this.icon
      .setVisible(this.rewinding || Math.floor(clock * 4) % 2 === 0)
      .setAlpha(this.rewinding ? 1 : 0.45)
      .setPosition(snap(this.x), snap(Math.min(this.y1, this.y2) - 8 * S));
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, 8 * S);
  }
}
