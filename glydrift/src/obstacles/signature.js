// Biome-signature hazards. Every one has a readable warning phase before it can hurt:
//  Solar:  Geyser (bubbling vent → lava column), Meteor (red target + path → fall), FireBar
//  Frozen: Icicle (shakes → drops), IceSlider (slow sliding pillar), ZapOrbs (charge → zap)
//  Glitch: BlinkBlock (flicker + ghost → teleport), BrokenLaser (segments flicker → light),
//          GravityZone (visible stripe that flips gravity while inside — harmless)
//  Abyss:  Tendril (eyes open + reach line → lash), Slammer (red lamp + rattle → slam),
//          ClosingWalls (spiked walls step inward along a corridor)
// Hitboxes follow exactly what is drawn. Time-based triggers use the player's distance
// (manager.px / manager.scroll) so the warning always plays while the hazard is on screen.
import Phaser from "phaser";
import { PILLAR_W } from "../pixel/biomeArt.js";
import { S } from "../pixel/px.js";
import { circleClear, rectClear, segClear } from "./geometry.js";
import { CAP_H, OFF, PxObstacle } from "./pixelTypes.js";

const ADD = Phaser.BlendModes.ADD;
const WARN_DEPTH = 21; // warnings draw above the Abyss darkness
const snap = (v) => Math.round(v / S) * S;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Seconds until the player reaches this x (∞ if already past). */
function eta(o) {
  const m = o.mgr;
  const d = o.x - m.px;
  return d < 0 ? -1 : d / Math.max(60, m.scroll);
}

// ================================================================== SOLAR STORM
export class Geyser extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "geyser";
    this.col = this.add(
      this.scene.add
        .tileSprite(0, 0, 12 * S, 100, "hz_lava")
        .setOrigin(0.5, 0)
        .setDepth(2),
    );
    this.head = this.add(this.scene.add.image(0, 0, "hz", "lavahead_0").setDepth(3));
    this.vent = this.add(
      this.scene.add.image(0, 0, "hz", "vent_0").setOrigin(0.5, 1).setDepth(WARN_DEPTH),
    );
  }
  spawn(x, { h, rest = 0.7, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { h, rest, phase });
    this.halfW = 40;
    this.period = rest + 1.0 + 1.15;
    this.bubT = 0;
  }
  update(dt, clock) {
    const H = this.mgr.H;
    const u = (((clock + this.phase * this.period) % this.period) + this.period) % this.period;
    const warn = u >= this.rest && u < this.rest + 1.0;
    const e = u - this.rest - 1.0; // eruption time (0..1.15)
    let k = 0;
    if (e >= 0) k = e < 0.14 ? e / 0.14 : e < 0.85 ? 1 : 1 - (e - 0.85) / 0.3;
    k = clamp01(k);
    this.k = k;
    this.top = H - this.h * k;
    const blink = warn && Math.floor(clock * 12) % 2 === 0;
    this.vent.setPosition(this.x, H + S).setFrame(blink || k > 0 ? "vent_1" : "vent_0");
    // bubbling warning: the lava head peeks out and bubbles spit up
    if (k > 0) {
      const len = Math.max(4, H - this.top);
      this.col
        .setVisible(true)
        .setPosition(this.x, snap(this.top))
        .setSize(12 * S, len);
      this.col.tilePositionY -= dt * 300;
      this.head.setVisible(true).setPosition(this.x, snap(this.top));
    } else {
      this.col.setVisible(false);
      const bob = warn ? snap(H - 10 - Math.abs(Math.sin(clock * 16)) * 14) : H + 30;
      this.head.setVisible(warn).setPosition(this.x, bob);
    }
    this.head.setFrame(`lavahead_${Math.floor(clock * 10) % 3}`);
    if (warn && this.x < this.mgr.rightEdge) {
      this.bubT -= dt;
      if (this.bubT <= 0) {
        this.bubT = 0.06;
        this.mgr.fx.burst("pixel", this.x + (Math.random() - 0.5) * 30, H - 16, 1, 0xffa21a, {
          angle: { min: 255, max: 285 },
          speed: { min: 120, max: 300 },
        });
      }
    }
  }
  clearance(px, py, r) {
    if (this.k <= 0) return Infinity;
    return Math.min(
      rectClear(px, py, r, this.x - 20, this.top + 8, this.x + 20, this.mgr.H + OFF),
      circleClear(px, py, r, this.x, this.top, 24),
    );
  }
}

export class Meteor extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "meteor";
    this.path = this.add(
      this.scene.add
        .tileSprite(0, 0, 2 * S, 100, "hz_dash")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.mark = this.add(this.scene.add.image(0, 0, "hz", "reticle_0").setDepth(WARN_DEPTH));
    this.rock = this.add(this.scene.add.image(0, 0, "hz", "meteor_0").setDepth(4));
  }
  spawn(x, { lead = 1.4 }) {
    this.arm(x);
    this.lead = lead; // seconds before the player arrives that the warning starts
    this.halfW = 44;
    this.state = "idle";
    this.timer = 0;
    this.y = -80;
    this.rock.setVisible(false);
    this.path.setVisible(false);
    this.mark.setVisible(false);
  }
  update(dt) {
    const H = this.mgr.H;
    if (this.state === "idle") {
      const t = eta(this);
      if (t >= 0 && t < this.lead) {
        this.state = "warn";
        this.timer = 0;
      }
    } else if (this.state === "warn") {
      this.timer += dt;
      if (this.timer > 1.0) {
        this.state = "fall";
        this.y = -60;
        this.vy = 1500;
      }
    } else if (this.state === "fall") {
      this.y += this.vy * dt;
      if (this.y > H - 20) {
        this.state = "done";
        this.mgr.fx.burst("fire", this.x, H - 10, 26, undefined, {
          angle: { min: 200, max: 340 },
          speed: { min: 120, max: 420 },
        });
        this.mgr.onImpact?.(this);
      }
    }
    const warn = this.state === "warn";
    const blink = Math.floor(this.timer * (6 + this.timer * 14)) % 2 === 0;
    this.mark
      .setVisible(warn || this.state === "fall")
      .setPosition(this.x, H - 30)
      .setFrame(blink ? "reticle_1" : "reticle_0");
    this.path
      .setVisible(warn)
      .setPosition(this.x, 0)
      .setSize(2 * S, H - 40)
      .setAlpha(0.35 + 0.4 * (this.timer / 1.0));
    this.rock
      .setVisible(this.state === "fall")
      .setPosition(this.x, snap(this.y))
      .setFrame(`meteor_${((Math.floor(this.timer * 20 + this.y * 0.02) % 3) + 3) % 3}`);
  }
  clearance(px, py, r) {
    if (this.state !== "fall") return Infinity;
    return circleClear(px, py, r, this.x, this.y + 3 * S, 22);
  }
}

export class FireBar extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "firebar";
    this.pivot = this.add(this.scene.add.image(0, 0, "hz", "pivot").setDepth(3));
    this.balls = [];
    for (let i = 0; i < 6; i++)
      this.balls.push(this.add(this.scene.add.image(0, 0, "hz", "fireball_0").setDepth(4)));
  }
  spawn(x, { y, n = 5, speed = 1.5, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y, n, speed, phase });
    this.len = n * 9 * S;
    this.halfW = this.len + 24;
    this.balls.forEach((b, i) => b.setVisible(i < n));
  }
  update(dt, clock) {
    // turns in 32 crisp steps
    const steps = 32;
    const a =
      Math.round(((clock * this.speed + this.phase) / (Math.PI * 2)) * steps) *
      ((Math.PI * 2) / steps);
    this.a = a;
    this.pivot.setPosition(this.x, this.y);
    const f = Math.floor(clock * 10) % 2;
    for (let i = 0; i < this.n; i++) {
      const d = (i + 1) * 9 * S;
      this.balls[i]
        .setPosition(snap(this.x + Math.cos(a) * d), snap(this.y + Math.sin(a) * d))
        .setFrame(`fireball_${(f + i) % 2}`);
    }
  }
  clearance(px, py, r) {
    const ex = this.x + Math.cos(this.a) * this.len;
    const ey = this.y + Math.sin(this.a) * this.len;
    return Math.min(
      circleClear(px, py, r, this.x, this.y, 24),
      segClear(px, py, r, this.x, this.y, ex, ey, 15),
    );
  }
}

// ================================================================== FROZEN NEBULA
export class Icicle extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "icicle";
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
      if (this.timer > 0.45) this.state = "fall";
    } else if (this.state === "fall") {
      this.vy += 2600 * dt;
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
      rectClear(px, py, r, this.x - 20, top, this.x + 20, this.y + 4 * S),
      segClear(px, py, r, this.x, this.y + 4 * S, this.x, tipY, 10),
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
    this.cap = this.add(this.scene.add.image(0, 0, "frozen", "cap_0").setDepth(2));
  }
  spawn(x, { top = true, Lmin, Lmax, period = 3.4, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, Lmin, Lmax, period, phase });
    this.halfW = this.w / 2;
    this.body.setOrigin(0.5, top ? 1 : 0);
    this.cap.setOrigin(0.5, top ? 1 : 0).setFrame(top ? "cap_0" : "cap_0b");
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
    this.a = this.add(this.scene.add.image(0, 0, "hz", "orb_0").setDepth(WARN_DEPTH));
    this.b = this.add(this.scene.add.image(0, 0, "hz", "orb_0").setDepth(WARN_DEPTH));
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

// ================================================================== GLITCH REALM
export class BlinkBlock extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "blink";
    this.ghost = this.add(this.scene.add.image(0, 0, "hz", "blink_ghost").setDepth(1.5));
    this.img = this.add(this.scene.add.image(0, 0, "hz", "blink").setDepth(3));
  }
  spawn(x, { ya, yb, hold = 1.3, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { ya, yb, hold, phase });
    this.halfW = 48;
  }
  update(dt, clock) {
    const P = this.hold * 2;
    const u = (((clock + this.phase * P) % P) + P) % P;
    const atA = u < this.hold;
    const local = atA ? u : u - this.hold;
    const warn = local > this.hold - 0.5;
    this.y = atA ? this.ya : this.yb;
    const dest = atA ? this.yb : this.ya;
    // flicker + RGB jitter before teleporting, ghost outline marks where it lands
    const flick = warn && Math.floor(clock * 20) % 2 === 0;
    this.img.setPosition(this.x + (flick ? S : 0), this.y).setAlpha(flick ? 0.55 : 1);
    this.ghost
      .setVisible(warn)
      .setPosition(this.x, dest)
      .setAlpha(Math.floor(clock * 10) % 2 ? 0.9 : 0.5);
  }
  clearance(px, py, r) {
    return rectClear(px, py, r, this.x - 40, this.y - 40, this.x + 40, this.y + 40);
  }
}

const SEGS = 6;
export class BrokenLaser extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "laser";
    this.segs = [];
    for (let i = 0; i < SEGS; i++) {
      const glow = this.add(
        this.scene.add
          .tileSprite(0, 0, 14 * S, 100, "glitch_glow_v")
          .setOrigin(0.5, 0)
          .setDepth(1.9)
          .setBlendMode(ADD),
      );
      const beam = this.add(
        this.scene.add
          .tileSprite(0, 0, 4 * S, 100, "glitch_beam_v")
          .setOrigin(0.5, 0)
          .setDepth(2),
      );
      this.segs.push({ glow, beam, state: 0 });
    }
    this.nodes = [];
    for (let i = 0; i <= SEGS; i++)
      this.nodes.push(this.add(this.scene.add.image(0, 0, "glitch", "emitter").setDepth(3)));
  }
  spawn(x, { phase = 0 }) {
    this.arm(x);
    this.phase = phase;
    this.halfW = 26;
    this.cycle = -1;
    const H = this.mgr.H;
    this.segH = H / SEGS;
    this.segs.forEach((s, i) => {
      for (const t of [s.glow, s.beam])
        t.setSize(t.width, this.segH - 24).setPosition(x, i * this.segH + 12);
    });
  }
  update(dt, clock) {
    // cycle: segments flicker (warning) then light one by one; one random segment is
    // broken and never lights → the passage. Hold, then everything goes dark.
    const P = 3.6;
    const t = clock + this.phase * P;
    const cyc = Math.floor(t / P);
    const u = t - cyc * P;
    if (cyc !== this.cycle) {
      this.cycle = cyc;
      this.broken = 1 + ((cyc * 7 + Math.floor(this.phase * 10)) % (SEGS - 2));
      this.order = [0, 1, 2, 3, 4, 5].sort((a, b) => ((a * 5 + cyc) % 6) - ((b * 5 + cyc) % 6));
    }
    this.segs.forEach((s, i) => {
      const k = this.order.indexOf(i);
      const lightAt = 0.6 + k * 0.28;
      let st = 0; // 0 off, 1 warning flicker, 2 lethal
      if (i !== this.broken && u < 3.0) {
        if (u >= lightAt) st = 2;
        else if (u >= lightAt - 0.4) st = 1;
      }
      s.state = st;
      const y = i * this.segH + 12;
      s.beam
        .setPosition(this.x, y)
        .setAlpha(st === 2 ? 1 : st === 1 && Math.floor(clock * 22) % 2 ? 0.3 : 0);
      s.glow.setPosition(this.x, y).setAlpha(st === 2 ? 0.4 : 0);
      if (st === 2) s.beam.tilePositionY -= dt * 260;
    });
    this.nodes.forEach((n, i) => n.setPosition(this.x, i * this.segH));
  }
  clearance(px, py, r) {
    let c = Infinity;
    for (let i = 0; i < SEGS; i++) {
      if (this.segs[i].state !== 2) continue;
      const y = i * this.segH;
      c = Math.min(c, rectClear(px, py, r, this.x - 7, y + 12, this.x + 7, y + this.segH - 12));
    }
    for (const n of this.nodes) c = Math.min(c, circleClear(px, py, r, n.x, n.y, 14));
    return c;
  }
}

export class GravityZone extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "zone";
    this.kind = "zone";
    this.fill = this.add(
      this.scene.add.tileSprite(0, 0, 100, mgr.H, "hz_zone_up").setOrigin(0.5, 0).setDepth(0.5),
    );
    this.edgeL = this.add(
      this.scene.add.rectangle(0, 0, S, mgr.H, 0xff7ae8).setOrigin(0.5, 0).setDepth(0.6),
    );
    this.edgeR = this.add(
      this.scene.add.rectangle(0, 0, S, mgr.H, 0xff7ae8).setOrigin(0.5, 0).setDepth(0.6),
    );
  }
  spawn(x, { w = 360 }) {
    this.arm(x);
    this.w = w;
    this.halfW = w / 2;
    this.fill.setSize(w, this.mgr.H);
  }
  update(dt, clock) {
    this.fill.setPosition(this.x, 0).setAlpha(0.55);
    this.fill.tilePositionY += dt * 90;
    const a = 0.6 + 0.4 * Math.sin(clock * 6);
    this.edgeL.setPosition(snap(this.x - this.w / 2), 0).setAlpha(a);
    this.edgeR.setPosition(snap(this.x + this.w / 2), 0).setAlpha(a);
  }
  inside(px) {
    return px > this.x - this.w / 2 && px < this.x + this.w / 2;
  }
  clearance() {
    return Infinity;
  }
}

// ================================================================== ABYSS
export class Tendril extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "tendril";
    this.reach = this.add(
      this.scene.add.tileSprite(0, 0, 2 * S, 100, "hz_dash").setDepth(WARN_DEPTH),
    );
    this.body = this.add(
      this.scene.add.tileSprite(0, 0, 10 * S, 100, "hz_tendril").setDepth(WARN_DEPTH),
    );
    this.tip = this.add(this.scene.add.image(0, 0, "hz", "tip").setDepth(WARN_DEPTH));
    this.eyes = this.add(this.scene.add.image(0, 0, "hz", "weyes_0").setDepth(WARN_DEPTH));
  }
  spawn(x, { top = true, L, lead = 1.3 }) {
    this.arm(x);
    Object.assign(this, { top, L, lead });
    this.halfW = 44;
    this.state = "idle";
    this.timer = 0;
    this.ext = 0;
    this.body.setOrigin(0.5, top ? 0 : 1);
    this.tip.setFlipY(!top);
    this.reach
      .setOrigin(0.5, top ? 0 : 1)
      .setSize(2 * S, L)
      .setVisible(false);
    this.eyes.setVisible(false);
  }
  update(dt, clock) {
    const H = this.mgr.H;
    if (this.state === "idle") {
      const t = eta(this);
      if (t >= 0 && t < this.lead) {
        this.state = "eyes";
        this.timer = 0;
      }
    } else this.timer += dt;
    let k = 0;
    if (this.state === "eyes" && this.timer > 0.85) {
      this.state = "lash";
      this.timer = 0;
    }
    if (this.state === "lash") {
      const t = this.timer;
      k = t < 0.16 ? t / 0.16 : t < 0.95 ? 1 : 1 - (t - 0.95) / 0.4;
      if (t > 1.35) this.state = "done";
    }
    k = clamp01(k);
    this.ext = snap(this.L * k);
    const wall = this.top ? 0 : H;
    const dir = this.top ? 1 : -1;
    const eyesOn = this.state === "eyes" || this.state === "lash";
    const ef = this.state === "eyes" ? Math.min(2, Math.floor(this.timer / 0.25)) : 2;
    this.eyes
      .setVisible(eyesOn)
      .setFrame(`weyes_${ef}`)
      .setPosition(this.x, wall + dir * 16);
    this.reach
      .setVisible(this.state === "eyes")
      .setPosition(this.x, wall)
      .setAlpha(0.25 + 0.35 * Math.min(1, this.timer / 0.85));
    const show = this.ext > 4;
    const wig = Math.round(Math.sin(clock * 9) * 1) * S;
    this.body
      .setVisible(show)
      .setPosition(this.x + wig, wall)
      .setSize(10 * S, Math.max(4, this.ext));
    this.body.tilePositionY += dt * 120 * dir;
    this.tip.setVisible(show).setPosition(this.x + wig, wall + dir * (this.ext + 6 * S));
  }
  clearance(px, py, r) {
    if (this.ext <= 4) return Infinity;
    const H = this.mgr.H;
    const wall = this.top ? -40 : H + 40;
    const dir = this.top ? 1 : -1;
    const tipY = (this.top ? 0 : H) + dir * (this.ext + 10 * S);
    return Math.min(
      segClear(px, py, r, this.x, wall, this.x, tipY - dir * 20, 18),
      circleClear(px, py, r, this.x, tipY - dir * 22, 22),
    );
  }
}

export class Slammer extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "slammer";
    this.w = PILLAR_W * S;
    const len = Math.ceil((mgr.H + OFF * 2) / (16 * S)) * 16 * S;
    this.topBody = this.add(
      this.scene.add.tileSprite(0, 0, this.w, len, "abyss_pillar_2").setOrigin(0.5, 1).setDepth(1),
    );
    this.botBody = this.add(
      this.scene.add.tileSprite(0, 0, this.w, len, "abyss_pillar_2").setOrigin(0.5, 0).setDepth(1),
    );
    this.capT = this.add(
      this.scene.add.image(0, 0, "abyss", "cap_1").setOrigin(0.5, 1).setDepth(WARN_DEPTH),
    );
    this.capB = this.add(
      this.scene.add.image(0, 0, "abyss", "cap_1b").setOrigin(0.5, 0).setDepth(WARN_DEPTH),
    );
    this.lampT = this.add(this.scene.add.image(0, 0, "hz", "lamp_0").setDepth(WARN_DEPTH));
    this.lampB = this.add(this.scene.add.image(0, 0, "hz", "lamp_0").setDepth(WARN_DEPTH));
  }
  spawn(x, { gc, open = 380, phase = 0, hold = 1.0 }) {
    this.arm(x);
    Object.assign(this, { gc, open, phase, hold });
    this.halfW = this.w / 2;
    // open hold → warning rattle 0.5 s → slam 0.1 s → shut 0.25 s → reopen 0.45 s
    this.period = hold + 0.5 + 0.1 + 0.25 + 0.45;
    this.wasShut = false;
  }
  update(dt, clock) {
    const P = this.period;
    const u = (((clock + this.phase * P) % P) + P) % P;
    const h = this.hold;
    let gap;
    let warn = false;
    if (u < h) gap = this.open;
    else if (u < h + 0.5) {
      gap = this.open;
      warn = true;
    } else if (u < h + 0.6) gap = this.open * (1 - (u - h - 0.5) / 0.1);
    else if (u < h + 0.85) gap = 0;
    else gap = this.open * ((u - h - 0.85) / 0.45);
    const shut = gap <= 1;
    if (shut && !this.wasShut && Math.abs(this.x - this.mgr.px) < 500) this.mgr.onImpact?.(this);
    this.wasShut = shut;
    this.gap = gap;
    const rattle = warn ? (Math.floor(clock * 30) % 2 ? S : -S) : 0;
    this.yt = snap(this.gc - gap / 2);
    this.yb = snap(this.gc + gap / 2);
    this.capT.setPosition(this.x + rattle, this.yt);
    this.capB.setPosition(this.x + rattle, this.yb);
    this.topBody.setPosition(this.x + rattle, this.yt - CAP_H + S * 3);
    this.botBody.setPosition(this.x + rattle, this.yb + CAP_H - S * 3);
    const lit = warn ? Math.floor(clock * 12) % 2 === 0 : u >= h && u < h + 0.85;
    this.lampT.setFrame(lit ? "lamp_1" : "lamp_0").setPosition(this.x, this.yt - CAP_H - 10 * S);
    this.lampB.setFrame(lit ? "lamp_1" : "lamp_0").setPosition(this.x, this.yb + CAP_H + 10 * S);
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

const COL = 16 * S; // closing-wall column width (one wall tile)
const MAX_COLS = 22;
export class ClosingWalls extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "walls";
    this.cols = [];
    for (let i = 0; i < MAX_COLS; i++) {
      const top = this.add(
        this.scene.add.tileSprite(0, 0, COL, 100, "abyss_wall").setOrigin(0, 1).setDepth(1),
      );
      const topE = this.add(
        this.scene.add
          .tileSprite(0, 0, COL, 11 * S, "abyss_edge")
          .setOrigin(0, 0)
          .setDepth(1.5),
      );
      const bot = this.add(
        this.scene.add.tileSprite(0, 0, COL, 100, "abyss_wall").setOrigin(0, 0).setDepth(1),
      );
      const botE = this.add(
        this.scene.add
          .tileSprite(0, 0, COL, 11 * S, "abyss_edge_b")
          .setOrigin(0, 1)
          .setDepth(1.5),
      );
      this.cols.push({ top, topE, bot, botE, dTop: 0, dBot: 0 });
    }
  }
  spawn(x, { n = 16, depth, sway = 0, phase = 0 }) {
    this.n = Math.min(MAX_COLS, n);
    this.arm(x);
    this.halfW = (this.n * COL) / 2;
    const H = this.mgr.H;
    // stepped depth profile: ease in, hold, ease out; the gap centre sways gently
    for (let i = 0; i < MAX_COLS; i++) {
      const c = this.cols[i];
      const vis = i < this.n;
      for (const k of ["top", "topE", "bot", "botE"]) c[k].setVisible(vis);
      if (!vis) continue;
      const t = i / (this.n - 1);
      const ramp = Math.min(1, t / 0.3, (1 - t) / 0.2);
      const d = depth * Math.max(0, ramp);
      const shift = sway * Math.sin(phase + t * Math.PI * 1.4) * ramp;
      c.dTop = snap(Math.max(0, d + shift));
      c.dBot = snap(Math.max(0, d - shift));
      c.top.setSize(COL, Math.max(4, c.dTop + 200)).setTilePosition(i * COL, 0);
      c.bot.setSize(COL, Math.max(4, c.dBot + 200)).setTilePosition(i * COL, 0);
      c.topE.setTilePosition(i * COL, 0);
      c.botE.setTilePosition(i * COL, 0);
      // (EDGE spikes hang below/above the body face)
      c.H = H;
    }
  }
  update() {
    const H = this.mgr.H;
    const x0 = snap(this.x - this.halfW);
    for (let i = 0; i < this.n; i++) {
      const c = this.cols[i];
      const cx = x0 + i * COL;
      c.top.setPosition(cx, c.dTop - 11 * S + 3 * S);
      c.topE.setPosition(cx, c.dTop - 11 * S);
      c.bot.setPosition(cx, H - c.dBot + 11 * S - 3 * S);
      c.botE.setPosition(cx, H - c.dBot + 11 * S);
      const hide = c.dTop < 2 * S && c.dBot < 2 * S;
      for (const k of ["top", "topE", "bot", "botE"]) c[k].setVisible(!hide);
    }
  }
  clearance(px, py, r) {
    const H = this.mgr.H;
    const x0 = this.x - this.halfW;
    let c = Infinity;
    const i0 = Math.max(0, Math.floor((px - r - x0) / COL));
    const i1 = Math.min(this.n - 1, Math.floor((px + r - x0) / COL));
    for (let i = i0; i <= i1; i++) {
      const col = this.cols[i];
      if (col.dTop < 2 * S && col.dBot < 2 * S) continue;
      const a = x0 + i * COL;
      // spike tips sit at the old edge line + depth (edge strip = 11 art px, tips at its end)
      c = Math.min(
        c,
        rectClear(px, py, r, a, -OFF, a + COL, col.dTop - 4),
        rectClear(px, py, r, a, H - col.dBot + 4, a + COL, H + OFF),
      );
    }
    return c;
  }
}

export const SIGNATURE_TYPES = {
  geyser: Geyser,
  meteor: Meteor,
  firebar: FireBar,
  icicle: Icicle,
  slider: IceSlider,
  zap: ZapOrbs,
  blink: BlinkBlock,
  blaser: BrokenLaser,
  zone: GravityZone,
  tendril: Tendril,
  slammer: Slammer,
  walls: ClosingWalls,
};
