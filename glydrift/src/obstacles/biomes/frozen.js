// Frozen Nebula: Icicle (shakes → drops), IceSlider (slow sliding pillar), ZapOrbs
// (charge → zap between two orbs).
import { PILLAR_W } from "../../pixel/biomeArt.js";
import { S } from "../../pixel/px.js";
import { circleClear, rectClear, segClear } from "../geometry.js";
import { ADD, CAP_H, eta, HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";

export class Icicle extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "icicle";
    // faint drop line while it shakes: shows exactly where it will fall
    this.path = this.add(
      this.scene.add
        .tileSprite(0, 0, 2 * S, 100, "hz_dash")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.img = this.add(this.scene.add.image(0, 0, "hz", "icicle").setOrigin(0.5, 0).setDepth(3));
  }
  spawn(x, { lead = 1.0 }) {
    this.arm(x);
    this.lead = lead;
    this.halfW = 26;
    this.state = "hang";
    this.timer = 0;
    this.y = -6;
    this.vy = 0;
    this.img.setAlpha(1);
  }
  update(dt) {
    const H = this.mgr.H;
    if (this.state === "hang") {
      const t = eta(this);
      if (t >= 0 && t < this.lead) {
        this.state = "shake";
        this.timer = 0;
      }
    } else if (this.state === "shake") {
      this.timer += dt;
      if (this.timer > 0.7) this.state = "fall"; // longer shake = more warning
    } else if (this.state === "fall") {
      this.vy += 1900 * dt;
      this.y += this.vy * dt;
      if (this.y > H - 60) {
        this.state = "gone";
        this.mgr.fx.burst("shard", this.x, H - 20, 14, 0xeaffff, {
          angle: { min: 200, max: 340 },
          speed: { min: 100, max: 360 },
        });
        this.img.setAlpha(0);
      }
    }
    const shake = this.state === "shake" ? (Math.floor(this.timer * 30) % 2 ? S : -S) : 0;
    const tipY = this.y + 30 * S;
    this.path
      .setVisible(this.state === "shake")
      .setPosition(this.x, tipY)
      .setSize(2 * S, Math.max(4, H - tipY))
      .setAlpha(0.22 + 0.3 * Math.min(1, this.timer / 0.7))
      .setTint(0xeaffff);
    this.img.setPosition(this.x + shake, snap(this.y));
    if (this.state === "shake" && Math.random() < 0.3)
      this.mgr.fx.burst("pixel", this.x, 20, 1, 0xdff8ff, {
        angle: { min: 80, max: 100 },
        speed: { min: 60, max: 160 },
      });
  }
  clearance(px, py, r) {
    if (this.state === "gone") return Infinity;
    // body (wide at the root) + tip, 30 art px long
    const tipY = this.y + 30 * S - 6;
    // while hanging the root block is fused to the ceiling; once falling, the hitbox must
    // start at the icicle's own top edge (it used to reach 40 units above it into empty air)
    const top = this.state === "fall" ? this.y : this.y - 40;
    return Math.min(
      rectClear(px, py, r, this.x - 15, top, this.x + 15, this.y + 4 * S),
      segClear(px, py, r, this.x, this.y + 4 * S, this.x, tipY, 7),
    );
  }
}

export class IceSlider extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "slider";
    this.w = PILLAR_W * S;
    const len = Math.ceil((mgr.H + OFF) / (16 * S)) * 16 * S;
    this.body = this.add(
      this.scene.add.tileSprite(0, 0, this.w, len, "frozen_pillar_1").setDepth(1),
    );
    // the biome's art is built lazily; until then use the blank texture (set on spawn)
    const tex = this.scene.textures.exists("frozen") ? ["frozen", "cap_0"] : ["__DEFAULT"];
    this.cap = this.add(this.scene.add.image(0, 0, ...tex).setDepth(2));
  }
  spawn(x, { top = true, Lmin, Lmax, period = 3.4, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, Lmin, Lmax, period, phase });
    this.halfW = this.w / 2;
    this.body.setOrigin(0.5, top ? 1 : 0);
    this.cap.setOrigin(0.5, top ? 1 : 0).setTexture("frozen", top ? "cap_0" : "cap_0b");
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const k =
      0.5 - 0.5 * Math.cos(((clock + this.phase * this.period) / this.period) * Math.PI * 2);
    const L = snap(this.Lmin + (this.Lmax - this.Lmin) * k);
    this.L = L;
    if (this.top) {
      this.cap.setPosition(this.x, L);
      this.body.setPosition(this.x, L - CAP_H + S * 3);
    } else {
      this.cap.setPosition(this.x, H - L);
      this.body.setPosition(this.x, H - L + CAP_H - S * 3);
    }
  }
  clearance(px, py, r) {
    const x0 = this.x - this.w / 2 + 4;
    const x1 = this.x + this.w / 2 - 4;
    const H = this.mgr.H;
    return this.top
      ? rectClear(px, py, r, x0, -OFF, x1, this.L - 4)
      : rectClear(px, py, r, x0, H - this.L + 4, x1, H + OFF);
  }
}

export class ZapOrbs extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "zap";
    this.beam = this.add(
      this.scene.add
        .tileSprite(0, 0, 4 * S, 100, "frozen_beam_v")
        .setOrigin(0.5, 0)
        .setDepth(2),
    );
    this.glow = this.add(
      this.scene.add
        .tileSprite(0, 0, 14 * S, 100, "frozen_glow_v")
        .setOrigin(0.5, 0)
        .setDepth(1.9)
        .setBlendMode(ADD),
    );
    // beat-pulsing halos so the orbs read as live energy
    this.haloA = this.add(
      this.scene.add
        .image(0, 0, "pxglow")
        .setDepth(HAZ_TOP - 0.1)
        .setScale(S * 2)
        .setBlendMode(ADD),
    );
    this.haloB = this.add(
      this.scene.add
        .image(0, 0, "pxglow")
        .setDepth(HAZ_TOP - 0.1)
        .setScale(S * 2)
        .setBlendMode(ADD),
    );
    for (const h of [this.haloA, this.haloB]) h.setTint(0x7fd6ff);
    this.a = this.add(this.scene.add.image(0, 0, "hz", "orb_0").setDepth(HAZ_TOP));
    this.b = this.add(this.scene.add.image(0, 0, "hz", "orb_0").setDepth(HAZ_TOP));
  }
  spawn(x, { y1, y2, dx = 0, off = 1.1, charge = 0.75, on = 0.75, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y1, y2, dx, off, charge, on, phase });
    this.period = off + charge + on;
    this.halfW = Math.abs(dx) / 2 + 40;
    this.arcT = 0;
  }
  update(dt, clock) {
    const u = (((clock + this.phase * this.period) % this.period) + this.period) % this.period;
    this.charging = u >= this.off && u < this.off + this.charge;
    this.zapping = u >= this.off + this.charge;
    this.ax = this.x - this.dx / 2;
    this.bx = this.x + this.dx / 2;
    const f = this.zapping ? 2 : this.charging ? (Math.floor(clock * 14) % 2 ? 1 : 0) : 0;
    this.a.setPosition(this.ax, this.y1).setFrame(`orb_${f}`);
    this.b.setPosition(this.bx, this.y2).setFrame(`orb_${f}`);
    const ha = this.zapping ? 0.8 : 0.3 + 0.4 * (this.mgr.beat || 0);
    this.haloA.setPosition(this.ax, this.y1).setAlpha(ha);
    this.haloB.setPosition(this.bx, this.y2).setAlpha(ha);
    const len = Math.hypot(this.bx - this.ax, this.y2 - this.y1);
    const rot = Math.atan2(this.y2 - this.y1, this.bx - this.ax) - Math.PI / 2;
    for (const t of [this.beam, this.glow]) {
      t.setPosition(this.ax, this.y1).setRotation(rot).setSize(t.width, len);
    }
    this.beam.setAlpha(this.zapping ? (Math.random() < 0.85 ? 1 : 0.7) : 0);
    this.glow.setAlpha(this.zapping ? 0.45 + Math.random() * 0.2 : this.charging ? 0.12 : 0);
    if (this.zapping) this.beam.tilePositionY -= dt * 300;
    // crackle: small sparks while charging, big arcs while zapping
    this.arcT -= dt;
    if ((this.charging || this.zapping) && this.arcT <= 0 && this.x < this.mgr.rightEdge) {
      this.arcT = this.zapping ? 0.06 : 0.16;
      if (this.zapping)
        this.mgr.fx.lightningBetween(this.ax, this.y1, this.bx, this.y2, 0xeaffff, 0.08);
      else {
        const o = Math.random() < 0.5 ? [this.ax, this.y1] : [this.bx, this.y2];
        this.mgr.fx.lightning(o[0], o[1], 0x7fd6ff, 1, 34);
      }
    }
  }
  clearance(px, py, r) {
    let c = Math.min(
      circleClear(px, py, r, this.ax, this.y1, 26),
      circleClear(px, py, r, this.bx, this.y2, 26),
    );
    if (this.zapping) c = Math.min(c, segClear(px, py, r, this.ax, this.y1, this.bx, this.y2, 8));
    return c;
  }
}
