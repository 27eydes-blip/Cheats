// Prism Rift: MirrorLaser (path preview → beam bounces off a mirror panel, a "V" from one edge
// — fly round it), GlassWall (cracks → top pane shatters into falling shards), RotPrism (a
// rotating prism sweeps its beam: dashed preview → on → off).
import { S } from "../../pixel/px.js";
import { ADD, eta, HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";
import { circleClear, rectClear, segClear } from "../geometry.js";

/** Lay a vertical tile sprite (origin 0.5, 0) along the segment a → b. */
export function lay(ts, ax, ay, bx, by) {
  const len = Math.max(1, Math.hypot(bx - ax, by - ay));
  ts.setPosition(ax, ay)
    .setSize(ts.width, len)
    .setRotation(Math.atan2(by - ay, bx - ax) - Math.PI / 2);
}

const beamPair = (o) =>
  [0, 1].map(() => ({
    prev: o.add(
      o.scene.add
        .tileSprite(0, 0, 4 * S, 100, "dh_prev")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP),
    ),
    glow: o.add(
      o.scene.add
        .tileSprite(0, 0, 10 * S, 100, "dh_beam")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP - 0.1)
        .setBlendMode(ADD)
        .setScale(2, 1),
    ),
    beam: o.add(
      o.scene.add
        .tileSprite(0, 0, 10 * S, 100, "dh_beam")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP),
    ),
  }));

export class MirrorLaser extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "mlaser";
    this.legs = beamPair(this);
    this.em = this.add(this.scene.add.image(0, 0, "dh", "emitter").setDepth(HAZ_TOP + 0.1));
    this.mir = this.add(this.scene.add.image(0, 0, "dh", "mirror_r").setDepth(HAZ_TOP + 0.1));
  }
  spawn(x, { top = true, dx, ym, idle = 0.9, preview = 0.9, fire = 0.7, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, dx, ym, idle, preview, fire, phase });
    this.period = idle + preview + fire;
    this.halfW = Math.abs(dx) + 40;
    this.em.setFrame(top ? "emitter_b" : "emitter");
    this.mir.setFrame(top ? "mirror_l" : "mirror_r");
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const P = this.period;
    const u = (((clock + this.phase * P) % P) + P) % P;
    this.previewing = u >= this.idle && u < this.idle + this.preview;
    this.firing = u >= this.idle + this.preview;
    const edge = this.top ? 0 : H;
    this.pts = [
      [this.x - this.dx, edge],
      [this.x, this.ym],
      [this.x + this.dx, edge],
    ];
    this.em.setPosition(snap(this.x - this.dx), this.top ? 5 * S : H - 5 * S);
    this.mir.setPosition(snap(this.x), snap(this.ym));
    const flick = Math.floor(clock * 16) % 2;
    this.legs.forEach((L, i) => {
      const [a, b] = [this.pts[i], this.pts[i + 1]];
      for (const t of [L.prev, L.glow, L.beam]) lay(t, a[0], a[1], b[0], b[1]);
      L.prev.setVisible(this.previewing).setAlpha(flick ? 0.9 : 0.45);
      if (this.previewing) L.prev.tilePositionY -= dt * 60;
      L.beam.setVisible(this.firing);
      L.glow.setVisible(this.firing).setAlpha(0.35 + 0.15 * flick);
      if (this.firing) L.beam.tilePositionY -= dt * 240;
    });
  }
  clearance(px, py, r) {
    if (!this.firing) return Infinity;
    const [a, b, c] = this.pts;
    return Math.min(
      segClear(px, py, r, a[0], a[1], b[0], b[1], 3 * S),
      segClear(px, py, r, b[0], b[1], c[0], c[1], 3 * S),
    );
  }
}

const PANE = 12 * S; // glass pane width
export class GlassWall extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "glass";
    this.paneT = this.add(
      this.scene.add.tileSprite(0, 0, PANE, 100, "dh_glass").setOrigin(0.5, 1).setDepth(HAZ_TOP),
    );
    this.paneB = this.add(
      this.scene.add.tileSprite(0, 0, PANE, 100, "dh_glass").setOrigin(0.5, 0).setDepth(HAZ_TOP),
    );
    this.capT = this.add(
      this.scene.add.image(0, 0, "dh", "glasscap_b").setOrigin(0.5, 1).setDepth(HAZ_TOP),
    );
    this.capB = this.add(
      this.scene.add.image(0, 0, "dh", "glasscap").setOrigin(0.5, 0).setDepth(HAZ_TOP),
    );
    this.crack = this.add(
      this.scene.add
        .image(0, 0, "dh", "crack")
        .setOrigin(0.5, 1)
        .setDepth(HAZ_TOP + 0.1),
    );
    this.shards = [];
    for (let i = 0; i < 7; i++)
      this.shards.push(
        this.add(this.scene.add.image(0, 0, "dh", `shard_${i % 3}`).setDepth(HAZ_TOP)),
      );
  }
  spawn(x, { gc, gap = 300 }) {
    this.arm(x);
    this.yt = snap(gc - gap / 2);
    this.yb = snap(gc + gap / 2);
    this.halfW = PANE / 2 + 20;
    this.state = "whole";
    this.timer = 0;
    this.crack.setVisible(false);
    for (const s of this.shards) {
      s.setVisible(false);
      s.live = false;
    }
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const t = eta(this);
    if (this.state === "whole" && t >= 0 && t < 1.15) {
      this.state = "crack";
      this.timer = 0;
    }
    if (this.state === "crack") {
      this.timer += dt;
      if (this.timer > 0.5) this.shatter();
    }
    const whole = this.state !== "falling";
    this.paneT
      .setVisible(whole)
      .setPosition(this.x, this.yt - 2 * S)
      .setSize(PANE, this.yt + OFF);
    this.capT.setVisible(whole).setPosition(this.x, this.yt);
    this.paneB.setPosition(this.x, this.yb + 2 * S).setSize(PANE, H - this.yb + OFF);
    this.capB.setPosition(this.x, this.yb);
    this.crack
      .setVisible(this.state === "crack" && Math.floor(clock * 18) % 3 !== 0)
      .setPosition(this.x, this.yt - 2 * S);
    for (const s of this.shards) {
      if (!s.live) continue;
      s.vy += 1700 * dt;
      s.oy += s.vy * dt;
      s.setPosition(snap(this.x + s.ox), snap(s.oy)).setFrame(
        `shard_${(Math.floor(clock * 10) + s.fi) % 3}`,
      );
      if (s.oy > H + 40) {
        s.live = false;
        s.setVisible(false);
      }
    }
  }
  shatter() {
    this.state = "falling";
    this.mgr.fx.burst("shard", this.x, this.yt - 30, 10, 0xffffff);
    this.shards.forEach((s, i) => {
      s.live = true;
      s.fi = i % 3;
      s.ox = (i / (this.shards.length - 1) - 0.5) * PANE * 1.6;
      s.oy = this.yt - 20 - Math.random() * 120;
      s.vy = Math.random() * 120;
      s.setVisible(true);
    });
  }
  clearance(px, py, r) {
    const H = this.mgr.H;
    const w = PANE / 2 - 2;
    let c = rectClear(px, py, r, this.x - w, this.yb, this.x + w, H + OFF);
    if (this.state !== "falling")
      c = Math.min(c, rectClear(px, py, r, this.x - w, -OFF, this.x + w, this.yt));
    for (const s of this.shards)
      if (s.live) c = Math.min(c, circleClear(px, py, r, this.x + s.ox, s.oy, 3 * S));
    return c;
  }
}

export class RotPrism extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "rprism";
    [this.leg] = beamPair(this);
    this.body = this.add(this.scene.add.image(0, 0, "dh", "prism_0").setDepth(HAZ_TOP + 0.1));
  }
  spawn(x, { y, L, speed = 0.9, on = 2.0, off = 1.1, prev = 0.6, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y, L, speed, on, off, prev, phase });
    this.period = on + off;
    this.halfW = L + 30;
  }
  update(dt, clock) {
    const P = this.period;
    const u = (((clock + this.phase * P) % P) + P) % P;
    this.lit = u >= this.off;
    const previewing = !this.lit && u >= this.off - this.prev;
    this.ang = this.phase * 6.28 + clock * this.speed;
    this.tx = this.x + Math.cos(this.ang) * this.L;
    this.ty = this.y + Math.sin(this.ang) * this.L;
    this.body
      .setPosition(snap(this.x), snap(this.y))
      .setFrame(`prism_${Math.floor(clock * 8) % 4}`);
    const L = this.leg;
    for (const t of [L.prev, L.glow, L.beam]) lay(t, this.x, this.y, this.tx, this.ty);
    L.prev.setVisible(previewing).setAlpha(Math.floor(clock * 16) % 2 ? 0.9 : 0.4);
    L.beam.setVisible(this.lit);
    L.glow.setVisible(this.lit).setAlpha(0.4);
    if (this.lit) L.beam.tilePositionY -= dt * 240;
  }
  clearance(px, py, r) {
    let c = circleClear(px, py, r, this.x, this.y, 7 * S);
    if (this.lit) c = Math.min(c, segClear(px, py, r, this.x, this.y, this.tx, this.ty, 3 * S));
    return c;
  }
}
