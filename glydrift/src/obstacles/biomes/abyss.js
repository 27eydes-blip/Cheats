// Abyss: Tendril (eyes open + reach line → lash), Slammer (red lamp + rattle → slam, never
// tighter than its safe gap), ClosingWalls (spiked walls step inward along a corridor).
import { PILLAR_W } from "../../pixel/biomeArt.js";
import { S } from "../../pixel/px.js";
import { circleClear, rectClear, segClear } from "../geometry.js";
import { CAP_H, clamp01, eta, HAZ_TOP, OFF, PxObstacle, snap } from "../base.js";

export class Tendril extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "tendril";
    this.reach = this.add(this.scene.add.tileSprite(0, 0, 2 * S, 100, "hz_dash").setDepth(HAZ_TOP));
    this.body = this.add(
      this.scene.add.tileSprite(0, 0, 10 * S, 100, "hz_tendril").setDepth(HAZ_TOP),
    );
    this.tip = this.add(this.scene.add.image(0, 0, "hz", "tip").setDepth(HAZ_TOP));
    this.eyes = this.add(this.scene.add.image(0, 0, "hz", "weyes_0").setDepth(HAZ_TOP));
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
      this.scene.add
        .image(0, 0, ...this.capTex("cap_1"))
        .setOrigin(0.5, 1)
        .setDepth(HAZ_TOP),
    );
    this.capB = this.add(
      this.scene.add
        .image(0, 0, ...this.capTex("cap_1b"))
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP),
    );
    this.lampT = this.add(this.scene.add.image(0, 0, "hz", "lamp_0").setDepth(HAZ_TOP));
    this.lampB = this.add(this.scene.add.image(0, 0, "hz", "lamp_0").setDepth(HAZ_TOP));
  }
  /** The biome's art is built lazily; until then use the blank texture (fixed on spawn). */
  capTex(f) {
    return this.scene.textures.exists("abyss") ? ["abyss", f] : ["__DEFAULT"];
  }
  spawn(x, { gc, open = 380, phase = 0, hold = 1.0, minGap = 0 }) {
    this.arm(x);
    // pooled before the Abyss art was built? pick the real frames up now
    if (this.capT.frame.name !== "cap_1") {
      this.capT.setTexture("abyss", "cap_1");
      this.capB.setTexture("abyss", "cap_1b");
    }
    Object.assign(this, { gc, open, phase, hold, minGap });
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
    // never closes tighter than minGap (a safe slot stays open even when it slams)
    gap = Math.max(this.minGap, gap);
    const shut = gap <= this.minGap + 1;
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
