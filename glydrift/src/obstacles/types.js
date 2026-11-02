// Obstacle implementations. Each type is pooled by the ObstacleManager: `spawn()` re-arms an
// instance, `kill()` returns it to the pool. Visuals are crisp vector neon (Graphics drawn
// once per spawn, then only moved/rotated), always in danger colours (red/orange/hot pink).
// Motion is driven by the run clock so it is identical for everyone in the Daily Challenge.
import Phaser from "phaser";
import { PORTAL_COLOR } from "../config.js";
import { circleClear, rectClear, segClear } from "./geometry.js";
import { glowStroke, hazardStripes, neonCircle, neonPoly, neonRect } from "./neon.js";

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;
const OFF = 600; // how far bodies extend beyond the playfield edges

class Obstacle {
  constructor(mgr) {
    this.mgr = mgr;
    this.scene = mgr.scene;
    this.active = false;
    this.objects = [];
    this.lit = 0;
    this.kind = "obstacle";
  }
  add(obj) {
    this.objects.push(obj);
    obj.setVisible(false);
    return obj;
  }
  gfx(depth = 2) {
    return this.add(this.scene.add.graphics().setDepth(depth));
  }
  halo(depth = -5) {
    // NORMAL blend: additive quads leave box artifacts in the transparent post-FX layer
    return this.add(this.scene.add.image(0, 0, "glow").setDepth(depth));
  }
  arm(x) {
    this.x = x;
    this.active = true;
    this.passed = false;
    this.minClear = Infinity;
    this.t = 0;
    this.color = this.mgr.colors[this.type] ?? 0xff2a3d;
    for (const o of this.objects) o.setVisible(true);
  }
  kill() {
    this.active = false;
    for (const o of this.objects) o.setVisible(false);
  }
  get left() {
    return this.x - this.halfW;
  }
  get right() {
    return this.x + this.halfW;
  }
}

// ------------------------------------------------------------------ spinning saw
export class Saw extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "saw";
    this.glow = this.halo();
    this.rail = this.gfx(1);
    this.g = this.gfx(2);
  }
  spawn(x, { y, amp = 0, freq = 1, phase = 0, R = 46 }) {
    this.arm(x);
    Object.assign(this, { y0: y, amp, freq, phase, R });
    this.halfW = R + 8;
    this.sparkT = Math.random() * 0.2;
    this.y = y;
    const g = this.g;
    const c = this.color;
    g.clear();
    const teeth = 12;
    const pts = [];
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU;
      const r = i % 2 === 0 ? R : R * 0.78;
      const a2 = a + (i % 2 === 0 ? 0.13 : 0);
      pts.push({ x: Math.cos(a2) * r, y: Math.sin(a2) * r });
    }
    neonPoly(g, pts, c, 5);
    neonCircle(g, 0, 0, R * 0.5, c, 3, { inner: 0.25 });
    g.lineStyle(3, c, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      g.lineBetween(
        Math.cos(a) * R * 0.14,
        Math.sin(a) * R * 0.14,
        Math.cos(a) * R * 0.48,
        Math.sin(a) * R * 0.48,
      );
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(0, 0, R * 0.12);
    this.rail.clear();
    if (amp > 0) {
      glowStroke(this.rail, c, 2, (gg) => gg.lineBetween(0, -amp - 14, 0, amp + 14), {
        core: false,
      });
      this.rail
        .fillStyle(c, 1)
        .fillCircle(0, -amp - 14, 5)
        .fillCircle(0, amp + 14, 5);
      this.rail.setAlpha(0.55);
    }
    this.glow.setTint(c).setScale((R / 64) * 2.6);
  }
  update(dt, clock) {
    this.y = this.y0 + this.amp * Math.sin(clock * this.freq + this.phase);
    this.g.setPosition(this.x, this.y);
    this.g.rotation += dt * (9 + this.R * 0.02);
    this.rail.setPosition(this.x, this.y0);
    this.glow.setPosition(this.x, this.y).setAlpha(0.3 + this.lit * 0.3);
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.x < this.mgr.rightEdge) {
      this.sparkT = 0.09 + Math.random() * 0.12;
      const a = Math.random() * TAU;
      this.mgr.fx.burst(
        "spark",
        this.x + Math.cos(a) * this.R,
        this.y + Math.sin(a) * this.R,
        2,
        0xffd0a0,
        {
          angle: { min: Phaser.Math.RadToDeg(a) + 60, max: Phaser.Math.RadToDeg(a) + 120 },
          speed: { min: 120, max: 320 },
        },
      );
    }
  }
  clearance(px, py, r) {
    return circleClear(px, py, r, this.x, this.y, this.R * 0.88);
  }
}

// ------------------------------------------------------------------ pendulum blade on a chain
export class Blade extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "blade";
    this.glow = this.halo();
    this.chain = this.gfx(1);
    this.head = this.gfx(2);
  }
  spawn(x, { top = true, L = 360, amp = 0.7, freq = 2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { top, L, amp, freq, phase });
    this.ay = top ? -14 : this.mgr.H + 14;
    this.halfW = Math.sin(amp) * L + 50;
    const c = this.color;
    // chain (drawn pointing +y, rotated per frame)
    const ch = this.chain;
    ch.clear();
    const dir = top ? 1 : -1;
    glowStroke(ch, c, 2.5, (gg) => gg.lineBetween(0, 0, 0, L * dir), { core: false });
    ch.fillStyle(0x14030a, 1);
    ch.lineStyle(3, c, 1);
    for (let d = 18; d < L - 30; d += 26) {
      ch.fillRoundedRect(-5, d * dir - 8, 10, 16, 4);
      ch.strokeRoundedRect(-5, d * dir - 8, 10, 16, 4);
    }
    neonCircle(ch, 0, 0, 14, c, 3);
    // double-crescent axe head
    const h = this.head;
    h.clear();
    const R = 44;
    const blade = (s) => {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = -0.95 + (i / 12) * 1.9;
        pts.push({ x: s * Math.cos(a) * R, y: Math.sin(a) * R });
      }
      for (let i = 12; i >= 0; i--) {
        const a = -0.95 + (i / 12) * 1.9;
        pts.push({ x: s * (Math.cos(a) * R * 0.45 + 4), y: Math.sin(a) * R * 0.55 });
      }
      return pts;
    };
    neonPoly(h, blade(1), c, 4.5);
    neonPoly(h, blade(-1), c, 4.5);
    neonCircle(h, 0, 0, 12, c, 3, { inner: 0.4 });
    h.fillStyle(0xffffff, 1).fillCircle(0, 0, 4);
    this.glow.setTint(c).setScale(2.3);
  }
  update(dt, clock) {
    const th = this.amp * Math.sin(clock * this.freq + this.phase);
    const s = Math.sin(th);
    const c = Math.cos(th);
    this.tx = this.x + this.L * s;
    this.ty = this.top ? this.ay + this.L * c : this.ay - this.L * c;
    this.chain.setPosition(this.x, this.ay).setRotation(this.top ? -th : th);
    this.head.setPosition(this.tx, this.ty);
    this.head.rotation += dt * 7;
    this.glow.setPosition(this.tx, this.ty).setAlpha(0.3 + this.lit * 0.3);
  }
  clearance(px, py, r) {
    return Math.min(
      circleClear(px, py, r, this.tx, this.ty, 40),
      segClear(px, py, r, this.x, this.ay, this.tx, this.ty, 5),
    );
  }
}

// ------------------------------------------------------------------ crusher (slamming pistons)
export class Crusher extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "crusher";
    this.w = 120;
    this.glowT = this.halo();
    this.glowB = this.halo();
    this.topG = this.gfx(2);
    this.botG = this.gfx(2);
    this.lightT = this.add(this.scene.add.image(0, 0, "dot").setDepth(3).setBlendMode(ADD));
    this.lightB = this.add(this.scene.add.image(0, 0, "dot").setDepth(3).setBlendMode(ADD));
  }
  drawBlock(g, down) {
    const c = this.color;
    const w = this.w;
    const L = this.mgr.H + OFF;
    g.clear();
    const y0 = down ? -L : 0;
    neonRect(g, -w / 2, y0, w, L, c, 5, { inner: 0.08 });
    // inner rails
    g.lineStyle(2, c, 0.35);
    g.lineBetween(-w / 2 + 16, y0, -w / 2 + 16, y0 + L);
    g.lineBetween(w / 2 - 16, y0, w / 2 - 16, y0 + L);
    // crushing face with warning stripes
    const fh = 26;
    const fy = down ? -fh : 0;
    g.fillStyle(0x14030a, 1).fillRect(-w / 2, fy, w, fh);
    hazardStripes(g, -w / 2 + 3, fy + 3, w - 6, fh - 6, c, 0.9);
    glowStroke(g, c, 5, (gg) => gg.lineBetween(-w / 2, 0, w / 2, 0));
  }
  spawn(x, { gc, open = 360, closed = 120, period = 2.2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { gc, open, closed, period, phase });
    this.halfW = this.w / 2;
    this.wasClosed = false;
    this.drawBlock(this.topG, true);
    this.drawBlock(this.botG, false);
    this.glowT.setTint(this.color).setScale(2.4, 1.4);
    this.glowB.setTint(this.color).setScale(2.4, 1.4);
  }
  gapAt(clock) {
    if (this.closed >= this.open) {
      this.warn = false;
      return this.open; // static walls: never slam
    }
    const u = (((clock / this.period + this.phase) % 1) + 1) % 1;
    let k;
    if (u < 0.42) k = 0;
    else if (u < 0.52) k = Phaser.Math.Easing.Cubic.In((u - 0.42) / 0.1);
    else if (u < 0.7) k = 1;
    else k = 1 - Phaser.Math.Easing.Sine.InOut((u - 0.7) / 0.3);
    this.warn = u > 0.3 && u < 0.42;
    return this.open + (this.closed - this.open) * k;
  }
  update(dt, clock) {
    const g = this.gapAt(clock);
    this.gap = g;
    this.yt = this.gc - g / 2;
    this.yb = this.gc + g / 2;
    this.topG.setPosition(this.x, this.yt);
    this.botG.setPosition(this.x, this.yb);
    const blink = this.warn ? (Math.sin(clock * 40) > 0 ? 1 : 0.15) : 0.35;
    this.lightT
      .setPosition(this.x, this.yt - 48)
      .setTint(this.warn ? 0xffffff : this.color)
      .setAlpha(blink)
      .setScale(0.7);
    this.lightB
      .setPosition(this.x, this.yb + 48)
      .setTint(this.warn ? 0xffffff : this.color)
      .setAlpha(blink)
      .setScale(0.7);
    this.glowT.setPosition(this.x, this.yt).setAlpha(0.3 + this.lit * 0.3);
    this.glowB.setPosition(this.x, this.yb).setAlpha(0.3 + this.lit * 0.3);
    const closed = this.closed < this.open && g <= this.closed + 2;
    if (closed && !this.wasClosed && this.x < this.mgr.rightEdge && this.x > this.mgr.leftEdge) {
      this.mgr.fx.burst("spark", this.x, this.gc, 14, 0xffd0a0, { speed: { min: 150, max: 420 } });
      this.mgr.onImpact?.(this);
    }
    this.wasClosed = closed;
  }
  clearance(px, py, r) {
    const x0 = this.x - this.w / 2;
    const x1 = this.x + this.w / 2;
    return Math.min(
      rectClear(px, py, r, x0, -OFF, x1, this.yt),
      rectClear(px, py, r, x0, this.yb, x1, this.mgr.H + OFF),
    );
  }
}

// ------------------------------------------------------------------ sliding gate (pillars)
export class Gate extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "gate";
    this.w = 64;
    this.glowT = this.halo();
    this.glowB = this.halo();
    this.topG = this.gfx(2);
    this.botG = this.gfx(2);
  }
  drawPillar(g, down) {
    const c = this.color;
    const w = this.w;
    const L = this.mgr.H + OFF;
    g.clear();
    const y0 = down ? -L : 0;
    neonRect(g, -w / 2, y0, w, L, c, 5, { inner: 0.1 });
    // energy chevrons along the pillar
    g.lineStyle(3, c, 0.55);
    const dir = down ? -1 : 1;
    for (let d = 40; d < 700; d += 46) {
      const y = d * dir;
      g.beginPath();
      g.moveTo(-w / 2 + 12, y);
      g.lineTo(0, y + 14 * dir);
      g.lineTo(w / 2 - 12, y);
      g.strokePath();
    }
    // bright cap
    glowStroke(g, c, 6, (gg) => gg.lineBetween(-w / 2 - 6, 0, w / 2 + 6, 0));
  }
  spawn(x, { gc, gap = 280, amp = 120, freq = 1.2, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { gc0: gc, gap, amp, freq, phase });
    this.halfW = this.w / 2;
    this.drawPillar(this.topG, true);
    this.drawPillar(this.botG, false);
    this.glowT.setTint(this.color).setScale(1.8, 1.2);
    this.glowB.setTint(this.color).setScale(1.8, 1.2);
  }
  update(dt, clock) {
    const gc = this.gc0 + this.amp * Math.sin(clock * this.freq + this.phase);
    this.gc = gc;
    this.yt = gc - this.gap / 2;
    this.yb = gc + this.gap / 2;
    this.topG.setPosition(this.x, this.yt);
    this.botG.setPosition(this.x, this.yb);
    const a = 0.3 + this.lit * 0.3;
    this.glowT.setPosition(this.x, this.yt).setAlpha(a);
    this.glowB.setPosition(this.x, this.yb).setAlpha(a);
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

// ------------------------------------------------------------------ blinking lasers
// orientation "v": vertical beams leaving a gap; "h": a horizontal beam between two emitters.
export class Laser extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "laser";
    this.glowA = this.halo();
    this.glowB = this.halo();
    this.beam = this.gfx(2);
    this.charge = this.gfx(2);
    this.emA = this.gfx(3);
    this.emB = this.gfx(3);
  }
  drawEmitter(g) {
    const c = this.color;
    g.clear();
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      pts.push({ x: Math.cos(a) * 20, y: Math.sin(a) * 20 });
    }
    neonPoly(g, pts, c, 4, { inner: 0.2 });
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 6);
  }
  spawn(x, { orient = "v", gc, gap = 260, span = 300, on = 1.2, off = 1.0, phase = 0, drift = 0 }) {
    this.arm(x);
    Object.assign(this, { orient, gc, gap, span, on, off, phase, drift });
    this.halfW = orient === "v" ? 22 : span / 2 + 24;
    this.crackleT = 0;
    const c = this.color;
    this.drawEmitter(this.emA);
    this.drawEmitter(this.emB);
    const b = this.beam;
    const ch = this.charge;
    b.clear();
    ch.clear();
    const seg = (gg, x1, y1, x2, y2) => gg.lineBetween(x1, y1, x2, y2);
    if (orient === "v") {
      const yt = gc - gap / 2;
      const yb = gc + gap / 2;
      const H = this.mgr.H;
      const draw = (gg) => {
        seg(gg, 0, -OFF, 0, yt - 20);
        seg(gg, 0, yb + 20, 0, H + OFF);
      };
      glowStroke(b, c, 9, draw);
      ch.lineStyle(2, c, 0.6);
      draw(ch);
      this.yt = yt;
      this.yb = yb;
    } else {
      const draw = (gg) => seg(gg, -span / 2 + 20, 0, span / 2 - 20, 0);
      glowStroke(b, c, 9, draw);
      ch.lineStyle(2, c, 0.6);
      draw(ch);
    }
    this.glowA.setTint(c).setScale(1.4);
    this.glowB.setTint(c).setScale(1.4);
  }
  update(dt, clock) {
    const period = this.on + this.off;
    const u = (((clock + this.phase * period) % period) + period) % period;
    this.isOn = u < this.on;
    this.charging = !this.isOn && u > period - 0.4;
    const flick = this.isOn ? 0.85 + Math.random() * 0.15 : 0;
    this.beam.setAlpha(flick);
    this.charge.setAlpha(this.charging ? (Math.random() < 0.5 ? 0.8 : 0.2) : 0);
    const ga = 0.22 + flick * 0.3;
    if (this.orient === "v") {
      this.beam.setPosition(this.x, 0);
      this.charge.setPosition(this.x, 0);
      this.emA.setPosition(this.x, this.yt);
      this.emB.setPosition(this.x, this.yb);
      this.glowA.setPosition(this.x, this.yt).setAlpha(ga);
      this.glowB.setPosition(this.x, this.yb).setAlpha(ga);
      if (this.isOn) {
        this.crackleT -= dt;
        if (this.crackleT <= 0 && this.x < this.mgr.rightEdge) {
          this.crackleT = 0.07;
          const y1 =
            Math.random() < 0.5
              ? this.yt - 30 - Math.random() * 300
              : this.yb + 30 + Math.random() * 300;
          this.mgr.fx.lightningBetween(
            this.x,
            y1,
            this.x + (Math.random() - 0.5) * 26,
            y1 + (Math.random() - 0.5) * 120,
            this.color,
            0.08,
          );
        }
      }
    } else {
      this.y = this.gc + this.drift * Math.sin(clock * 0.9 + this.phase * 6);
      this.xa = this.x - this.span / 2;
      this.xb = this.x + this.span / 2;
      this.beam.setPosition(this.x, this.y);
      this.charge.setPosition(this.x, this.y);
      this.emA.setPosition(this.xa, this.y);
      this.emB.setPosition(this.xb, this.y);
      this.glowA.setPosition(this.xa, this.y).setAlpha(ga);
      this.glowB.setPosition(this.xb, this.y).setAlpha(ga);
      if (this.isOn) {
        this.crackleT -= dt;
        if (this.crackleT <= 0 && this.x < this.mgr.rightEdge) {
          this.crackleT = 0.06;
          const x1 = this.xa + 20 + Math.random() * (this.span - 40);
          this.mgr.fx.lightningBetween(
            x1,
            this.y,
            x1 + 40 + Math.random() * 40,
            this.y + (Math.random() - 0.5) * 20,
            this.color,
            0.07,
          );
        }
      }
    }
  }
  clearance(px, py, r) {
    if (this.orient === "v") {
      let c = Math.min(
        circleClear(px, py, r, this.x, this.yt, 18),
        circleClear(px, py, r, this.x, this.yb, 18),
      );
      if (this.isOn) {
        c = Math.min(
          c,
          rectClear(px, py, r, this.x - 6, -OFF, this.x + 6, this.yt),
          rectClear(px, py, r, this.x - 6, this.yb, this.x + 6, this.mgr.H + OFF),
        );
      }
      return c;
    }
    let c = Math.min(
      circleClear(px, py, r, this.xa, this.y, 18),
      circleClear(px, py, r, this.xb, this.y, 18),
    );
    if (this.isOn) c = Math.min(c, segClear(px, py, r, this.xa, this.y, this.xb, this.y, 6));
    return c;
  }
}

// ------------------------------------------------------------------ portals
// Deliberately NOT hazard-like: round purple/white swirl, soft, always spinning.
export class Portal extends Obstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "portal";
    this.kind = "portal";
    this.glow = this.halo(-4);
    this.ring = this.gfx(4);
    this.swirl = this.gfx(4);
    this.icon = this.gfx(5);
  }
  spawn(x, { y, mode }) {
    this.arm(x);
    this.y = y;
    this.mode = mode;
    this.used = false;
    this.halfW = 74;
    this.R = 66;
    const { main, light } = PORTAL_COLOR;
    const R = this.R;
    const ring = this.ring;
    ring.clear();
    ring.fillStyle(main, 0.18).fillCircle(0, 0, R);
    ring.lineStyle(14, main, 0.25).strokeCircle(0, 0, R);
    ring.lineStyle(6, main, 0.9).strokeCircle(0, 0, R);
    ring.lineStyle(2.5, light, 1).strokeCircle(0, 0, R);
    // swirl arms
    const sw = this.swirl;
    sw.clear();
    for (let arm = 0; arm < 3; arm++) {
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const a = arm * (TAU / 3) + t * 3.2;
        pts.push({ x: Math.cos(a) * R * 0.92 * t, y: Math.sin(a) * R * 0.92 * t });
      }
      sw.lineStyle(7, main, 0.6);
      sw.strokePoints(pts);
      sw.lineStyle(2.5, light, 0.95);
      sw.strokePoints(pts);
    }
    // icon: gravity = up/down chevrons, mini = four inward arrows
    const ic = this.icon;
    ic.clear();
    ic.lineStyle(5, 0xffffff, 1);
    if (mode === "mini") {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const ox = Math.cos(a) * 26;
        const oy = Math.sin(a) * 26;
        const px = -Math.sin(a) * 8;
        const py = Math.cos(a) * 8;
        ic.beginPath();
        ic.moveTo(ox * 0.55 + px + ox * 0.25, oy * 0.55 + py + oy * 0.25);
        ic.lineTo(ox * 0.55, oy * 0.55);
        ic.lineTo(ox * 0.55 - px + ox * 0.25, oy * 0.55 - py + oy * 0.25);
        ic.strokePath();
      }
    } else {
      const up = mode === "flip";
      const s = up ? -1 : 1;
      for (const off of [-8, 10]) {
        ic.beginPath();
        ic.moveTo(-16, off - 8 * s);
        ic.lineTo(0, off + 8 * s);
        ic.lineTo(16, off - 8 * s);
        ic.strokePath();
      }
    }
    this.glow.setTint(main).setScale(2.4);
    this.particleT = 0;
  }
  update(dt, clock) {
    const pulse = 1 + Math.sin(clock * 5) * 0.05;
    const a = this.used ? 0.3 : 1;
    this.ring.setPosition(this.x, this.y).setScale(pulse).setAlpha(a);
    this.swirl.setPosition(this.x, this.y).setAlpha(a);
    this.swirl.rotation -= dt * 3.2;
    this.icon.setPosition(this.x, this.y + Math.sin(clock * 4) * 4).setAlpha(a);
    this.glow.setPosition(this.x, this.y).setAlpha(this.used ? 0.1 : 0.45);
    this.particleT -= dt;
    if (this.particleT <= 0 && this.x < this.mgr.rightEdge && !this.used) {
      this.particleT = 0.07;
      const ang = Math.random() * TAU;
      this.mgr.fx.burst(
        "dot",
        this.x + Math.cos(ang) * this.R * 1.25,
        this.y + Math.sin(ang) * this.R * 1.25,
        1,
        Math.random() < 0.5 ? PORTAL_COLOR.main : PORTAL_COLOR.light,
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

export const TYPES = {
  saw: Saw,
  blade: Blade,
  crusher: Crusher,
  gate: Gate,
  laser: Laser,
  portal: Portal,
};
