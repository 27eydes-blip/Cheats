// Spawns obstacle patterns from a seeded RNG, pools every instance, and resolves
// collisions / near-misses / portal + coin pickups against the player circle.
import Phaser from "phaser";
import { hazardColors, NEAR_MISS } from "../config.js";
import { themeFor } from "../pixel/themes.js";
import { RNG } from "../systems/rng.js";
import { TYPES as BASE_TYPES } from "./pixelTypes.js";
import { SIGNATURE_TYPES } from "./signature.js";

const TYPES = { ...BASE_TYPES, ...SIGNATURE_TYPES };

/** Signature hazards per biome, in the order they are introduced (one at a time). */
const SIG = {
  void: ["laser", "blade", "hlaser"],
  solar: ["geyser", "meteor", "firebar"],
  frozen: ["icicle", "slider", "zap"],
  glitch: ["blink", "blaser", "zone"],
  abyss: ["tendril", "slammer", "walls"],
};
/** Biome-local meters at which each signature hazard unlocks. */
const UNLOCK = { void: [60, 200, 340], default: [0, 120, 230] };

export class ObstacleManager {
  constructor(scene, fx, { W, H, lowGfx, heroColor = 0x38f6ff }) {
    this.colors = hazardColors(heroColor);
    this.theme = themeFor("void");
    this.scene = scene;
    this.fx = fx;
    this.W = W;
    this.H = H;
    this.lowGfx = lowGfx;
    this.pools = {};
    this.active = [];
    this.coins = [];
    this.rightEdge = W;
    this.leftEdge = 0;
    this.rng = new RNG(1);
    this.px = 0;
    this.scroll = 300;
    this.info = { local: 0, rawIndex: 0, pause: false, grace: false };
  }

  reset(seed) {
    this.rng = new RNG(seed);
    for (const o of this.active) o.kill();
    this.active.length = 0;
    for (const c of this.coins) c.setActive(false).setVisible(false);
    this.nextX = this.W + 260;
    this.count = 0;
    this.flipped = false;
    this.sinceFlip = 0;
    this.lastPortalM = 0;
    this.introduced = new Set();
  }

  /**
   * Build one pooled instance of every obstacle type up front (hidden), so no hazard is
   * ever constructed mid-run (construction creates textures → frame hitches).
   */
  prewarm() {
    for (const type of Object.keys(TYPES)) {
      if (type === "crusher") continue; // legacy neon crusher, never spawned
      const pool = (this.pools[type] ||= []);
      const want = ["saw", "laser", "icicle", "meteor", "blink", "tendril"].includes(type) ? 2 : 1;
      while (pool.length < want) pool.push(new TYPES[type](this));
    }
  }

  obtain(type) {
    const pool = (this.pools[type] ||= []);
    let o = pool.find((p) => !p.active);
    if (!o) {
      o = new TYPES[type](this);
      pool.push(o);
    }
    this.active.push(o);
    return o;
  }

  coin(x, y) {
    let c = this.coins.find((o) => !o.active);
    if (!c) {
      c = this.scene.add.image(0, 0, "pxc", "coin_0").setDepth(6);
      // pixel coins carry no soft halo; keep a hidden stub so the update code stays simple
      c.halo = { setVisible() {}, setPosition() {} };
      this.coins.push(c);
    }
    c.setActive(true).setVisible(true).setPosition(x, y).setScale(1);
    c.halo.setVisible(true);
    c.baseY = y;
    c.phase = Math.random() * 6;
    c.magnet = false;
    return c;
  }

  coinLine(x0, x1, y, n) {
    for (let i = 0; i < n; i++) this.coin(x0 + ((x1 - x0) * (i + 0.5)) / n, y);
  }

  // ------------------------------------------------------------------ pattern generation
  spawnPattern(meters, biomeId) {
    this.theme = themeFor(biomeId);
    const r = this.rng;
    const H = this.H;
    const d = Math.min(1, meters / 2600);
    const x = this.nextX;
    const mid = H / 2;
    const safeTop = 150;
    const safeBot = H - 150;
    const spacing = Phaser.Math.Linear(520, 360, d) + r.range(-30, 40);
    let width = 120;

    // gravity flip lasts a few obstacles, then a restore portal is guaranteed
    if (this.flipped) {
      this.sinceFlip++;
      if (this.sinceFlip >= 4) {
        const p = this.obtain("portal");
        p.spawn(x, { y: mid, mode: "restore" });
        this.flipped = false;
        this.nextX = x + 60 + spacing * 0.8;
        return;
      }
    }

    const info = this.info;
    const local = Math.max(0, info.local);
    const sig = SIG[biomeId] || SIG.void;
    const unlock = UNLOCK[biomeId] || UNLOCK.default;
    const firstLap = info.rawIndex < 5;
    // shared obstacles (every biome) + this biome's signature hazards
    const w = {
      saw: 2.2,
      gate: 2.2,
      saw2: meters > 600 ? 1 : 0,
      flip: meters > 420 && !this.flipped && meters - this.lastPortalM > 220 ? 0.7 : 0,
      mini: meters > 260 && !this.flipped && meters - this.lastPortalM > 160 ? 0.6 : 0,
    };
    let forced = null;
    sig.forEach((k, i) => {
      const open = !firstLap || local >= unlock[i] || (biomeId === "void" && meters >= unlock[i]);
      if (!open) return;
      w[k] = 2.6;
      // introduce each new hazard alone the first time it appears
      const key = `${info.rawIndex}:${k}`;
      if (!this.introduced.has(key) && !forced) forced = k;
    });
    if (w.zone && this.flipped) w.zone = 0;
    if (this.count < 2) w.saw2 = w.flip = w.mini = w.blade = w.hlaser = 0;
    if (info.grace) {
      // first seconds of the Abyss: only simple shared obstacles, spaced out
      for (const k in w) if (k !== "saw" && k !== "gate") w[k] = 0;
      forced = null;
    }
    if (forced === "zone" && this.flipped) forced = null;
    let kind = forced || null;
    if (kind) this.introduced.add(`${info.rawIndex}:${kind}`);
    if (!kind) {
      kind = r.weighted(w);
      this.introduced.add(`${info.rawIndex}:${kind}`);
    }
    this.count++;
    const roomy = biomeId === "abyss" ? 1.15 : biomeId === "glitch" ? 1.12 : 1; // a little more air
    const spacingMul = (forced ? 1.35 : info.grace ? 1.8 : 1) * roomy;

    switch (kind) {
      case "saw": {
        const moving = r.chance(0.3 + d * 0.5);
        const amp = moving ? r.range(80, 160 + d * 80) : 0;
        const y = r.range(safeTop + amp, safeBot - amp);
        const o = this.obtain("saw");
        o.spawn(x + 50, {
          y,
          amp,
          freq: r.range(1.2, 2 + d),
          phase: r.range(0, 6.28),
          R: r.range(40, 52 + d * 14),
        });
        width = 110;
        if (r.chance(0.55)) {
          const cy = y < mid ? Math.min(safeBot, y + 170 + amp) : Math.max(safeTop, y - 170 - amp);
          this.coinLine(x - 40, x + 140, cy, 4);
        }
        break;
      }
      case "saw2": {
        const gap = Phaser.Math.Linear(330, 250, d);
        const gc = r.range(safeTop + gap / 2, safeBot - gap / 2);
        const R = 50;
        const a = this.obtain("saw");
        a.spawn(x + 50, { y: gc - gap / 2 - R, amp: 0, R });
        const b = this.obtain("saw");
        b.spawn(x + 50, { y: gc + gap / 2 + R, amp: 0, R });
        this.coinLine(x, x + 100, gc, 3);
        width = 110;
        break;
      }
      case "gate": {
        const gap = Phaser.Math.Linear(310, 230, d) + r.range(-10, 20);
        const amp = r.chance(0.7) ? r.range(60, 120 + d * 90) : 0;
        const gc = r.range(safeTop + gap / 2 + amp - 40, safeBot - gap / 2 - amp + 40);
        const o = this.obtain("gate");
        const gw = o.w;
        o.spawn(x + gw / 2, {
          gc,
          gap,
          amp,
          freq: r.range(1, 1.6 + d * 0.8),
          phase: r.range(0, 6.28),
        });
        if (amp < 70) this.coinLine(x - 10, x + gw + 10, gc, 2);
        width = gw;
        break;
      }
      case "crusher": {
        const gc = r.range(safeTop + 160, safeBot - 160);
        const o = this.obtain("crusher");
        o.spawn(x + 60, {
          gc,
          // walls never close: a fixed gap (open === closed)
          open: Phaser.Math.Linear(330, 280, d),
          closed: Phaser.Math.Linear(330, 280, d),
          period: Phaser.Math.Linear(2.4, 1.8, d),
          phase: r.next(),
        });
        if (r.chance(0.6)) this.coinLine(x - 10, x + 130, gc, 3);
        width = 120;
        break;
      }
      case "blade": {
        const top = r.chance(0.5);
        const L = r.range(H * 0.32, H * 0.5);
        const amp = r.range(0.45, 0.75);
        const o = this.obtain("blade");
        const halfW = Math.sin(amp) * L + 50;
        o.spawn(x + halfW, {
          top,
          L,
          amp,
          freq: r.range(1.5, 2.1 + d * 0.8),
          phase: r.range(0, 6.28),
        });
        width = halfW * 2;
        if (r.chance(0.5)) {
          const cy = top
            ? Phaser.Math.Clamp(L + 140, safeTop, safeBot)
            : Phaser.Math.Clamp(H - L - 140, safeTop, safeBot);
          this.coinLine(x + halfW - 60, x + halfW + 60, cy, 3);
        }
        break;
      }
      case "laser": {
        const gap = Phaser.Math.Linear(300, 240, d);
        const gc = r.range(safeTop + gap / 2, safeBot - gap / 2);
        const o = this.obtain("laser");
        o.spawn(x + 22, {
          orient: "v",
          gc,
          gap,
          on: r.range(1.1, 1.6),
          off: r.range(0.7, 1.1),
          phase: r.next(),
        });
        this.coinLine(x - 30, x + 74, gc, 3);
        width = 44;
        break;
      }
      case "hlaser": {
        const span = r.range(240, 320);
        const n = r.chance(0.4 + d * 0.3) ? 2 : 1;
        const ys = n === 2 ? [H * 0.36, H * 0.64] : [r.range(safeTop + 60, safeBot - 60)];
        for (const y of ys) {
          const o = this.obtain("laser");
          o.spawn(x + span / 2 + 24, {
            orient: "h",
            gc: y,
            span,
            on: r.range(1.2, 1.7),
            off: r.range(0.8, 1.2),
            phase: r.next(),
            drift: r.chance(0.5) ? r.range(30, 70) : 0,
          });
        }
        width = span + 48;
        break;
      }
      // ------------------------------------------------------------ solar storm
      case "geyser": {
        const n = local > 200 && r.chance(0.5) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const o = this.obtain("geyser");
          o.spawn(x + 40 + i * 230, {
            h: r.range(H * 0.4, H * 0.6),
            rest: r.range(0.5, 0.9),
            phase: r.next(),
          });
        }
        this.coinLine(x, x + 80 + (n - 1) * 230, H * 0.25, 3);
        width = 80 + (n - 1) * 230;
        break;
      }
      case "meteor": {
        // pairs only late in the biome, further apart; they drop earlier (further down by
        // the time you reach them)
        const n = local > 280 && r.chance(0.4) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const o = this.obtain("meteor");
          o.spawn(x + 44 + i * 360, { lead: r.range(1.95, 2.15) });
        }
        width = 88 + (n - 1) * 360;
        break;
      }
      case "firebar": {
        const nb = r.chance(0.5) ? 5 : 4;
        const len = nb * 36;
        const y = r.range(safeTop + len * 0.6, safeBot - len * 0.6);
        const o = this.obtain("firebar");
        o.spawn(x + len + 24, {
          y,
          n: nb,
          speed: r.pick([-1, 1]) * r.range(1.2, 1.8),
          phase: r.range(0, 6.28),
        });
        width = (len + 24) * 2;
        break;
      }
      // ------------------------------------------------------------ frozen nebula
      case "icicle": {
        // at most two, spaced wider
        const n = local > 120 && r.chance(0.6) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const o = this.obtain("icicle");
          o.spawn(x + 26 + i * 170, { lead: r.range(1.15, 1.4) });
        }
        this.coinLine(x, x + 52 + (n - 1) * 170, H * 0.72, 3);
        width = 52 + (n - 1) * 170;
        break;
      }
      case "slider": {
        const o = this.obtain("slider");
        o.spawn(x + o.w / 2, {
          top: r.chance(0.5),
          Lmin: H * 0.1,
          Lmax: H * 0.55,
          period: r.range(3.2, 4.2),
          phase: r.next(),
        });
        width = o.w;
        break;
      }
      case "zap": {
        const D = r.range(300, 420);
        const c = r.range(safeTop + D / 2, safeBot - D / 2);
        const dx = r.chance(0.4) ? (r.chance(0.5) ? 1 : -1) * 130 : 0;
        const o = this.obtain("zap");
        o.spawn(x + 40 + Math.abs(dx) / 2, { y1: c - D / 2, y2: c + D / 2, dx, phase: r.next() });
        if (r.chance(0.6)) this.coinLine(x, x + 80, c < mid ? c + D / 2 + 140 : c - D / 2 - 140, 3);
        width = 80 + Math.abs(dx);
        break;
      }
      // ------------------------------------------------------------ glitch realm
      case "blink": {
        const ya = r.range(safeTop + 40, mid - 60);
        const yb = r.range(mid + 60, safeBot - 40);
        const o = this.obtain("blink");
        const flipAB = r.chance(0.5);
        o.spawn(x + 48, {
          ya: flipAB ? yb : ya,
          yb: flipAB ? ya : yb,
          hold: r.range(1.3, 1.7),
          phase: r.next(),
        });
        width = 96;
        break;
      }
      case "blaser": {
        const o = this.obtain("blaser");
        o.spawn(x + 26, { phase: r.next() });
        width = 52;
        break;
      }
      case "zone": {
        const zw = r.range(320, 420);
        const o = this.obtain("zone");
        o.spawn(x + zw / 2, { w: zw });
        this.coinLine(x + zw * 0.2, x + zw * 0.8, mid, 3);
        width = zw;
        break;
      }
      // ------------------------------------------------------------ abyss
      case "tendril": {
        const n = local > 150 && r.chance(0.5) ? 2 : 1;
        let top = r.chance(0.5);
        for (let i = 0; i < n; i++) {
          const o = this.obtain("tendril");
          o.spawn(x + 44 + i * 240, { top, L: r.range(H * 0.28, H * 0.42), lead: 1.3 });
          top = !top;
        }
        width = 88 + (n - 1) * 240;
        break;
      }
      case "slammer": {
        const gc = r.range(safeTop + 220, safeBot - 220);
        const o = this.obtain("slammer");
        o.spawn(x + o.w / 2, {
          gc,
          open: Phaser.Math.Linear(450, 400, d),
          hold: r.range(1.1, 1.4),
          phase: r.next(),
        });
        width = o.w;
        break;
      }
      case "walls": {
        const n = 14 + Math.floor(r.range(0, 6));
        const o = this.obtain("walls");
        o.spawn(x + (n * 64) / 2, {
          n,
          depth: r.range(H * 0.17, H * 0.24),
          sway: H * 0.055,
          phase: r.range(0, 6.28),
        });
        this.coinLine(x + 200, x + n * 64 - 200, mid, 4);
        width = n * 64;
        break;
      }
      case "flip":
      case "mini": {
        const p = this.obtain("portal");
        p.spawn(x + 30, { y: r.range(H * 0.35, H * 0.65), mode: kind });
        this.lastPortalM = meters;
        if (kind === "flip") {
          this.flipped = true;
          this.sinceFlip = 0;
        }
        width = 60;
        break;
      }
    }

    // a ribbon of free coins between patterns now and then
    if (r.chance(0.22)) {
      const y = r.range(safeTop + 40, safeBot - 40);
      this.coinLine(x + width + spacing * 0.25, x + width + spacing * 0.75, y, 3);
    }
    this.nextX = x + width + spacing * spacingMul;
  }

  /** World-space x ranges of every hazard on screen (used to keep scenery out from behind them). */
  hazardBounds(out = []) {
    out.length = 0;
    for (const o of this.active) if (o.kind === "obstacle") out.push([o.left, o.right]);
    return out;
  }

  // ------------------------------------------------------------------ per-frame
  /**
   * @returns events for this frame
   */
  update(dt, clock, scroll, pal, ctx) {
    const { px, py, r, alive, meters, biomeId, zoom } = ctx;
    const ev =
      this.events || (this.events = { hit: null, near: [], passed: [], portal: null, coins: 0 });
    ev.hit = null;
    ev.near.length = 0;
    ev.passed.length = 0;
    ev.portal = null;
    ev.coins = 0;
    ev.zone = false;
    this.px = px;
    this.scroll = scroll;

    this.rightEdge = this.W / 2 + this.W / 2 / zoom + 40;
    this.leftEdge = this.W / 2 - this.W / 2 / zoom - 40;

    const dx = scroll * dt;
    this.nextX -= dx;
    if (this.info.pause) {
      // title / calm window: keep the area clear (but never leave gravity flipped)
      if (this.flipped && this.nextX < this.rightEdge + 160) {
        const p = this.obtain("portal");
        p.spawn(this.nextX, { y: this.H / 2, mode: "restore" });
        this.flipped = false;
      }
      this.nextX = Math.max(this.nextX, this.rightEdge + 161);
    } else {
      while (this.nextX < this.rightEdge + 160) this.spawnPattern(meters, biomeId);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.x -= dx;
      o.t += dt;
      // the player's light brightens nearby obstacles
      const dist = Math.abs(o.x - px);
      o.lit = alive ? Math.max(0, 1 - dist / 260) : 0;
      o.update(dt, clock);

      if (alive) {
        if (o.kind === "portal") {
          if (o.touches(px, py, r)) {
            o.used = true;
            ev.portal = o;
          }
        } else if (o.kind === "zone") {
          if (o.inside(px)) ev.zone = true;
        } else if (o.right > px - r - 30 && o.left < px + r + 30) {
          const c = o.clearance(px, py, r);
          if (c < o.minClear) o.minClear = c;
          if (c < 0 && !ev.hit) ev.hit = o;
        }
        if (!o.passed && o.right < px - r) {
          o.passed = true;
          if (o.kind === "obstacle") {
            ev.passed.push(o);
            if (o.minClear > 0 && o.minClear < NEAR_MISS.threshold) ev.near.push(o);
          }
        }
      }

      if (o.right < this.leftEdge - 80) {
        o.kill();
        this.active.splice(i, 1);
      }
    }

    // coins
    for (const c of this.coins) {
      if (!c.active) continue;
      c.x -= dx;
      const t = clock * 4 + c.phase;
      if (alive) {
        const ddx = px - c.x;
        const ddy = py - c.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < 110 * 110) c.magnet = true;
        if (c.magnet) {
          c.x += ddx * Math.min(1, dt * 12);
          c.baseY += ddy * Math.min(1, dt * 12);
        }
        if (d2 < (r + 22) ** 2) {
          ev.coins++;
          this.fx.burst("star", c.x, c.y, 4, 0xffd23f, { speed: { min: 60, max: 200 } });
          c.setActive(false).setVisible(false);
          c.halo.setVisible(false);
          continue;
        }
      }
      c.y = c.baseY + Math.sin(t) * 5;
      c.setFrame(`coin_${Math.floor(t * 2.2) % 4}`);
      c.halo.setPosition(c.x, c.y);
      if (c.x < this.leftEdge - 40) {
        c.setActive(false).setVisible(false);
        c.halo.setVisible(false);
      }
    }
    return ev;
  }
}
