// Solar Storm: Geyser (bubbling vent → lava column), Meteor (red target + path → fall),
// FireBar (rotating chain of fireballs), FlareArc (a dome of fire from the floor: dashed
// outline first, then it erupts). Every hazard warns before it can hurt.
import { S } from "../../pixel/px.js";
import { circleClear, rectClear, segClear } from "../geometry.js";
import { clamp01, eta, HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";

const METEOR_WARN = 1.1; // seconds the red target shows before a meteor drops

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
      this.scene.add.image(0, 0, "hz", "vent_0").setOrigin(0.5, 1).setDepth(HAZ_TOP),
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
    this.mark = this.add(this.scene.add.image(0, 0, "hz", "reticle_0").setDepth(HAZ_TOP));
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
      // easier: it drops right after the warning and is near the floor by the time you pass
      if (this.timer > METEOR_WARN) {
        this.state = "fall";
        this.y = -60;
        this.vy = 1700;
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
      .setAlpha(0.35 + 0.4 * (this.timer / METEOR_WARN));
    this.rock
      .setVisible(this.state === "fall")
      .setPosition(this.x, snap(this.y))
      .setFrame(`meteor_${((Math.floor(this.timer * 20 + this.y * 0.02) % 3) + 3) % 3}`);
  }
  clearance(px, py, r) {
    if (this.state !== "fall") return Infinity;
    return circleClear(px, py, r, this.x, this.y + 3 * S, 17);
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

/**
 * Flare Arc: a half-ring of solar fire rising from the floor. For ARC_WARN seconds only a
 * dashed, pulsing outline shows exactly where it will be; then it erupts for ARC_ON seconds
 * (fly over the dome, or wait until it has burnt out). Harmless while it's an outline.
 */
const ARC_WARN = 1.1;
const ARC_ON = 0.9;
export class FlareArc extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "flare";
    this.g = this.add(this.scene.add.graphics().setDepth(HAZ_TOP));
  }
  spawn(x, { R, lead = 0.35 }) {
    this.arm(x);
    this.R = R;
    this.cy = this.mgr.H + 6;
    this.halfW = R + 20;
    this.lead = lead;
    this.state = "wait";
    this.timer = 0;
  }
  update(dt) {
    const t = eta(this);
    if (this.state === "wait") {
      // erupts just as the dome's near edge reaches the player
      const tEdge = t - this.R / Math.max(60, this.mgr.scroll);
      if (t >= 0 && tEdge < this.lead + ARC_WARN) {
        this.state = "warn";
        this.timer = 0;
      }
    } else if (this.state === "warn") {
      this.timer += dt;
      if (this.timer >= ARC_WARN) {
        this.state = "on";
        this.timer = 0;
        this.mgr.fx.burst("fire", this.x, this.cy - this.R, 16, undefined, {
          speed: { min: 80, max: 260 },
        });
      }
    } else if (this.state === "on") {
      this.timer += dt;
      if (this.timer >= ARC_ON) this.state = "gone";
    }
    this.draw();
  }
  draw() {
    const g = this.g.clear();
    if (this.state === "wait" || this.state === "gone") return;
    const N = 28;
    if (this.state === "warn") {
      // dashed outline (red = danger), brighter as the eruption nears
      const a = 0.45 + 0.5 * clamp01(this.timer / ARC_WARN);
      g.fillStyle(0xff3030, a);
      for (let i = 0; i <= N; i += 1) {
        if (i % 2) continue;
        const ang = Math.PI * (i / N);
        const px = snap(this.x - Math.cos(ang) * this.R);
        const py = snap(this.cy - Math.sin(ang) * this.R);
        g.fillRect(px - 1.5 * S, py - 1.5 * S, 3 * S, 3 * S);
      }
      return;
    }
    // eruption: a thick band of fire (white-hot core, orange body), flickering edges
    const fade = 1 - clamp01((this.timer - ARC_ON * 0.7) / (ARC_ON * 0.3));
    for (const [w, col, a] of [
      [7 * S, 0xff5a00, 0.85],
      [4 * S, 0xffb02a, 0.95],
      [1.5 * S, 0xfff0c0, 1],
    ]) {
      g.lineStyle(w, col, a * fade);
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const ang = Math.PI * (i / N);
        const wob = Math.sin(this.timer * 30 + i) * S * 0.6;
        const px = this.x - Math.cos(ang) * (this.R + wob);
        const py = this.cy - Math.sin(ang) * (this.R + wob);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
    if (Math.random() < 0.5)
      this.mgr.fx.burst("fire", this.x - Math.cos(Math.random() * Math.PI) * this.R, this.cy - Math.random() * this.R, 1, undefined, {
        speed: { min: 20, max: 90 },
      });
  }
  clearance(px, py, r) {
    if (this.state !== "on") return Infinity;
    if (py > this.cy) return Infinity;
    return Math.abs(Math.hypot(px - this.x, py - this.cy) - this.R) - 3.5 * S * 0.88 - r;
  }
}
