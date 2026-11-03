// Signature hazards for the two late biomes. Hitboxes follow what is drawn.
//  Peaceful Valley (gentle, slow, readable):
//    ThornVine  — a thorny vine hanging/growing from an edge, swaying like a slow pendulum
//    PuffDrift  — dandelion puffs bobbing gently in a loose column (gaps between them)
//    BloomGate  — two flower stalks whose heads breathe the gap open and closed (never shut)
//  Hurricane:
//    Debris     — broken planks tumbling down-left across the screen with the wind
//    StormBolt  — a storm cloud charges (flicker + dashed line), then lightning strikes
//    Twister    — a swirling funnel rising from the floor or hanging from the ceiling
import Phaser from "phaser";
import { S } from "../pixel/px.js";
import { circleClear, rectClear, segClear } from "./geometry.js";
import { OFF, PxObstacle } from "./pixelTypes.js";

const ADD = Phaser.BlendModes.ADD;
const TOP = 21; // draw lethal parts above the Abyss darkness layer, like every hazard
const snap = (v) => Math.round(v / S) * S;

// ================================================================== PEACEFUL VALLEY
export class ThornVine extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "vine";
    this.vine = this.add(this.scene.add.tileSprite(0, 0, 10 * S, 100, "vh_vine").setDepth(TOP));
    this.bud = this.add(this.scene.add.image(0, 0, "vh", "bud").setDepth(TOP));
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
      this.puffs.push(this.add(this.scene.add.image(0, 0, "vh", "puff_0").setDepth(TOP)));
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
        .setDepth(TOP),
    );
    this.stemB = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_stem")
        .setOrigin(0.5, 0)
        .setDepth(TOP),
    );
    this.headT = this.add(
      this.scene.add.image(0, 0, "vh", "bloomb_0").setOrigin(0.5, 0).setDepth(TOP),
    );
    this.headB = this.add(
      this.scene.add.image(0, 0, "vh", "bloom_0").setOrigin(0.5, 1).setDepth(TOP),
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

// ================================================================== HURRICANE
export class Debris extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "debris";
    this.img = this.add(this.scene.add.image(0, 0, "vh", "plank_0").setDepth(TOP));
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
        .setDepth(TOP),
    );
    this.glow = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_bolt")
        .setOrigin(0.5, 0)
        .setDepth(TOP - 0.1)
        .setBlendMode(ADD)
        .setScale(2, 1),
    );
    this.bolt = this.add(
      this.scene.add
        .tileSprite(0, 0, 10 * S, 100, "vh_bolt")
        .setOrigin(0.5, 0)
        .setDepth(TOP),
    );
    this.cloud = this.add(this.scene.add.image(0, 0, "vh", "cloud_0").setDepth(TOP + 0.1));
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
    this.img = this.add(this.scene.add.image(0, 0, "vh", "twister_0").setDepth(TOP));
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

export const NEW_BIOME_TYPES = {
  vine: ThornVine,
  puffs: PuffDrift,
  bloom: BloomGate,
  debris: Debris,
  bolt: StormBolt,
  twister: Twister,
};
