// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Glitch Realm: BlinkBlock (flicker + ghost outline → teleport), BrokenLaser (segments
// flicker → light, one stays broken = the way through), GravityZone (harmless flip stripe),
// CorruptColumn (a column whose opening jumps to a new height, previewed by a ghost first).
import { S } from "../../pixel/px.js";
import { circleClear, rectClear } from "../geometry.js";
import { ADD, clamp01, eta, HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";

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
    const warn = local > this.hold - 0.65;
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
    // the biome's art is built lazily; until then use the blank texture (fixed on spawn)
    const tex = this.scene.textures.exists("glitch") ? ["glitch", "emitter"] : ["__DEFAULT"];
    for (let i = 0; i <= SEGS; i++)
      this.nodes.push(this.add(this.scene.add.image(0, 0, ...tex).setDepth(3)));
  }
  spawn(x, { phase = 0 }) {
    this.arm(x);
    // pooled before the Glitch art was built? pick the real frame up now
    if (this.nodes[0].frame.name !== "emitter")
      for (const n of this.nodes) n.setTexture("glitch", "emitter");
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
        else if (u >= lightAt - 0.55) st = 1;
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

/**
 * Corrupt Column: a column with an opening, like a gate. Ahead of the player it "corrupts":
 * for COL_WARN seconds a dashed green ghost shows where the opening will move to (the
 * old one flickers), then the opening jumps there. It always jumps at least COL_LEAD seconds
 * before the player arrives, so there's time to line up with the new opening.
 */
const COL_WARN = 0.9;
export class CorruptColumn extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "column";
    this.w = 84;
    this.g = this.add(this.scene.add.graphics().setDepth(HAZ_TOP - 1));
  }
  spawn(x, { gap, gc1, gc2, lead = 0.8 }) {
    this.arm(x);
    this.halfW = this.w / 2;
    this.gap = gap;
    this.gc = gc1;
    this.gc2 = gc2;
    this.lead = lead;
    this.state = "wait";
    this.timer = 0;
  }
  get yt() {
    return this.gc - this.gap / 2;
  }
  get yb() {
    return this.gc + this.gap / 2;
  }
  update(dt) {
    if (this.state === "wait") {
      const t = eta(this);
      if (t >= 0 && t < this.lead + COL_WARN) {
        this.state = "warn";
        this.timer = 0;
      }
    } else if (this.state === "warn") {
      this.timer += dt;
      if (this.timer >= COL_WARN) {
        this.state = "moved";
        this.gc = this.gc2;
        for (const c of [0xff2050, 0x39ff88, 0x2bffef])
          this.mgr.fx.burst("pixel", this.x, this.gc, 6, c, { speed: { min: 80, max: 260 } });
      }
    }
    this.draw();
  }
  draw() {
    const g = this.g.clear();
    const H = this.mgr.H;
    const x0 = this.x - this.w / 2;
    const warn = this.state === "warn";
    // during the warning the old column flickers in RGB-split slices
    const jit = warn && Math.floor(this.timer * 20) % 2 ? 3 : 0;
    const body = (y0, y1) => {
      g.fillStyle(0x171e26, 1).fillRect(x0 + jit, y0, this.w, y1 - y0);
      g.fillStyle(0x2bffef, 0.9).fillRect(x0 + jit, y0, 2 * S, y1 - y0);
      g.fillStyle(0x2bffef, 0.9).fillRect(x0 + this.w - 2 * S + jit, y0, 2 * S, y1 - y0);
      for (let y = y0 - (y0 % 24); y < y1; y += 24) g.fillStyle(0x24404a, 1).fillRect(x0 + 4 * S + jit, Math.max(y0, y), this.w - 8 * S, 2 * S);
    };
    body(-OFF, this.yt);
    body(this.yb, H + OFF);
    // the lit edges of the opening
    g.fillStyle(0x39ff88, 1).fillRect(x0 + jit, this.yt - 2 * S, this.w, 2 * S).fillRect(x0 + jit, this.yb, this.w, 2 * S);
    if (warn) {
      // the ghost of the new opening: dashed green outline (brightening as it nears)
      const a = 0.45 + 0.5 * clamp01(this.timer / COL_WARN);
      const yt = this.gc2 - this.gap / 2;
      const yb = this.gc2 + this.gap / 2;
      g.fillStyle(0x39ff88, a);
      for (let x = x0; x < x0 + this.w; x += 4 * S) {
        g.fillRect(x, snap(yt) - S, 2 * S, 2 * S);
        g.fillRect(x, snap(yb) - S, 2 * S, 2 * S);
      }
      for (let y = yt; y < yb; y += 4 * S) {
        g.fillRect(x0, snap(y), 2 * S, 2 * S);
        g.fillRect(x0 + this.w - 2 * S, snap(y), 2 * S, 2 * S);
      }
    }
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
