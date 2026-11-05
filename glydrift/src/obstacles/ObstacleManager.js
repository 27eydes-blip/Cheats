// Spawns obstacle patterns from a seeded RNG, pools every instance, and resolves
// collisions / near-misses / portal + coin pickups against the player circle.
import Phaser from "phaser";
import { hazardColors, NEAR_MISS } from "../config.js";
import { S } from "../pixel/px.js";
import { themeFor } from "../pixel/themes.js";
import { RNG } from "../data/rng.js";
import { COIN_FLOW, SPAWN } from "../tuning.js";
import { Shop } from "../data/cosmetics.js";
import { TYPES } from "./index.js";

/** Signature hazards per biome, in the order they are introduced (one at a time). */
const SIG = {
  void: ["laser", "blade", "hlaser", "pulse", "slalom", "bladeduo", "laserblade", "pulsepair"],
  solar: ["geyser", "meteor", "firebar", "flare", "eruption", "shower", "firepair", "geyserbar"],
  frozen: ["icicle", "slider", "zap", "comet", "icecurtain", "sliderpair", "zapstairs", "gauntlet"],
  glitch: ["blink", "zone"], // the broken-laser wall ("blaser") was taken out
  abyss: ["tendril", "slammer", "walls"],
  valley: ["vine", "puffs", "bloom"],
  hurricane: ["debris", "bolt", "twister"],
  prism: ["mlaser", "glass", "rprism"],
  tidal: ["jelly", "mine", "current", "bubblecol"],
  chrono: ["cgear", "pendulum", "timezone", "rewind"],
  mirror: ["spire", "vorb", "vbar"],
};
/** Combination patterns: built from a realm's own hazards, so they need no solo introduction. */
const COMBOS = new Set([
  "slalom",
  "bladeduo",
  "laserblade",
  "pulsepair",
  "eruption",
  "shower",
  "firepair",
  "geyserbar",
  "icecurtain",
  "sliderpair",
  "zapstairs",
  "gauntlet",
]);
/** Combination patterns are a little rarer than the realm's single hazards. */
const SIG_WEIGHT = {
  pulse: 1.8,
  slalom: 2,
  bladeduo: 1.8,
  laserblade: 2.2,
  pulsepair: 1.6,
  flare: 1.8,
  comet: 1.8,
  eruption: 2,
  shower: 1.8,
  firepair: 2,
  geyserbar: 1.8,
  icecurtain: 2,
  sliderpair: 2,
  zapstairs: 1.8,
  gauntlet: 1.8,
};
/** Biome-local meters at which each signature hazard unlocks. */
const UNLOCK = SPAWN.unlock;

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
    this.info = { local: 0, rawIndex: 0, firstVisit: true, pause: false, grace: false };
  }

  reset(seed, lead = 0) {
    this.rng = new RNG(seed);
    for (const o of this.active) o.kill();
    this.active.length = 0;
    for (const c of this.coins) {
      c.setActive(false).setVisible(false);
      c.halo?.setVisible(false); // or its glow stays frozen on screen after a retry
    }
    this.nextX = this.W + 260 + lead;
    // shop coin skin (gems / stars / hearts) and the Coin Magnet boost's pull radius
    const skin = Shop.equipped("coin");
    this.coinSkin = skin ? { tex: "cosm", prefix: `${skin}_` } : { tex: "pxc", prefix: "coin_" };
    this.magnetR = 110;
    this.lastCoinX = 0; // screen x of the furthest-right coin spawned (scrolls with the world)
    this.lastCoinY = this.H / 2;
    this.count = 0;
    this.lastKind = null;
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
      const pool = (this.pools[type] ||= []);
      const want = [
        "saw",
        "laser",
        "icicle",
        "meteor",
        "blink",
        "tendril",
        "vine",
        "spire",
        "vorb",
      ].includes(type)
        ? 2
        : type === "debris"
          ? 3
          : 1;
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
      c = this.scene.add.image(0, 0, this.coinSkin.tex, `${this.coinSkin.prefix}0`).setDepth(6);
      // stepped pixel halo that pulses with the music
      c.halo = this.scene.add
        .image(0, 0, "pxglow")
        .setDepth(5.9)
        .setScale(S)
        .setTint(0xffd23f)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.coins.push(c);
    }
    c.setActive(true).setVisible(true).setPosition(x, y).setScale(1);
    if (c.texture.key !== this.coinSkin.tex)
      c.setTexture(this.coinSkin.tex, `${this.coinSkin.prefix}0`);
    c.halo.setVisible(true);
    c.baseY = y;
    c.phase = Math.random() * 6;
    c.magnet = false;
    if (x >= this.lastCoinX) {
      this.lastCoinX = x;
      this.lastCoinY = y;
    }
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
    // the Abyss caps shared-obstacle difficulty (wider gates, slower saws)
    // dimensions ramp up within themselves (gentle start, full strength by ~500 m in)
    const d = this.info.dimension
      ? Math.min(1, Math.max(0, this.info.local) / 500)
      : Math.min(SPAWN.difficultyCap[biomeId] ?? 1, meters / SPAWN.difficultyMeters);
    const x = this.nextX;
    const mid = H / 2;
    const safeTop = 150;
    const safeBot = H - 150;
    // density ramps up faster than difficulty: more obstacles early, same gap sizes (and it
    // carries straight through realm and dimension changes, so a boundary never opens a gap)
    const sd = Math.min(1, meters / SPAWN.spacing.rampMeters);
    const spacing = Phaser.Math.Linear(SPAWN.spacing.start, SPAWN.spacing.end, sd) + r.range(-30, 40);
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
    const firstLap = info.firstVisit !== false; // first time in this biome this run
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
      w[k] = SIG_WEIGHT[k] ?? 2.6;
      // introduce each new hazard alone the first time it appears (combination patterns are
      // made of hazards already met, so they just join the mix)
      const key = `${info.rawIndex}:${k}`;
      if (!this.introduced.has(key) && !forced && !COMBOS.has(k)) forced = k;
    });
    if (w.zone && this.flipped) w.zone = 0;
    // the Peaceful Valley has only its own gentle hazards (no saws, gates or portals)
    // the Peaceful Valley and the dimensions have only their own hazards
    if (biomeId === "valley" || info.dimension) w.saw = w.gate = w.saw2 = w.flip = w.mini = 0;
    if (this.count < 2) w.saw2 = w.flip = w.mini = w.blade = w.hlaser = 0;
    if (info.simpleOnly) {
      // first metres of the Abyss / seconds of a dimension: only simple obstacles
      for (const k in w) if (k !== "saw" && k !== "gate") w[k] = 0;
      forced = null;
    }
    if (forced === "zone" && this.flipped) forced = null;
    let kind = forced || null;
    if (kind) this.introduced.add(`${info.rawIndex}:${kind}`);
    if (!kind) {
      // never the same pattern twice in a row (re-roll without it when there's a choice)
      if (this.lastKind && w[this.lastKind] && Object.values(w).filter((v) => v > 0).length > 1)
        w[this.lastKind] = 0;
      kind = r.weighted(w);
      this.introduced.add(`${info.rawIndex}:${kind}`);
    }
    this.lastKind = kind;
    this.count++;
    const roomy = SPAWN.roomy[biomeId] ?? 1;
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
      case "pulse": {
        // Neon Pulse: its full reach is drawn while it charges, then one ring goes out
        const R = r.range(150, 210);
        const y = r.range(safeTop + 40, safeBot - 40);
        const o = this.obtain("pulse");
        o.spawn(x + R, { y, R, lead: r.range(0.35, 0.55) });
        this.coinLine(x + R - 60, x + R + 60, y < mid ? y + R + 90 : y - R - 90, 3);
        width = R * 2;
        break;
      }
      case "slalom": {
        // two lasers with their gaps high then low, firing together: weave through
        const gap = Phaser.Math.Linear(300, 250, d);
        const hi = r.chance(0.5);
        const ph = r.next();
        for (let i = 0; i < 2; i++) {
          const gc = (i === 0) === hi ? safeTop + gap / 2 + 40 : safeBot - gap / 2 - 40;
          const o = this.obtain("laser");
          o.spawn(x + 22 + i * 280, { orient: "v", gc, gap, on: 1.3, off: 0.9, phase: ph });
          this.coinLine(x + i * 280 - 20, x + i * 280 + 60, gc, 2);
        }
        width = 44 + 280;
        break;
      }
      case "bladeduo": {
        // one axe from the ceiling, one from the floor, swinging opposite ways
        const L = r.range(H * 0.3, H * 0.4);
        const amp = 0.6;
        const ph = r.range(0, 6.28);
        const halfW = Math.sin(amp) * L + 50;
        for (let i = 0; i < 2; i++) {
          const o = this.obtain("blade");
          o.spawn(x + halfW + i * (halfW * 2 + 60), { top: i === 0, L, amp, freq: 1.8, phase: ph + i * Math.PI });
        }
        width = halfW * 4 + 60;
        break;
      }
      case "laserblade": {
        // a laser gate, then an axe swinging behind it
        const gap = Phaser.Math.Linear(300, 250, d);
        const gc = r.range(safeTop + gap / 2, safeBot - gap / 2);
        const lz = this.obtain("laser");
        lz.spawn(x + 22, { orient: "v", gc, gap, on: 1.3, off: 0.9, phase: r.next() });
        const L = r.range(H * 0.32, H * 0.42);
        const halfW = Math.sin(0.6) * L + 50;
        const bl = this.obtain("blade");
        bl.spawn(x + 44 + 200 + halfW, { top: gc > mid, L, amp: 0.6, freq: 1.9, phase: r.range(0, 6.28) });
        width = 44 + 200 + halfW * 2;
        break;
      }
      case "pulsepair": {
        // two pulses, one high and one low, firing a beat apart
        const R = 150;
        for (let i = 0; i < 2; i++) {
          const o = this.obtain("pulse");
          o.spawn(x + R + i * (R * 2 + 40), { y: i ? safeBot - 60 : safeTop + 60, R, lead: 0.4 + i * 0.25 });
        }
        width = R * 4 + 40;
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
      case "flare": {
        // Flare Arc: a dome of fire from the floor (outline first, then it erupts)
        const R = r.range(H * 0.2, H * 0.3);
        const o = this.obtain("flare");
        o.spawn(x + R + 10, { R, lead: r.range(0.25, 0.45) });
        this.coinLine(x + R - 60, x + R + 80, H - R - 160, 3);
        width = R * 2 + 20;
        break;
      }
      case "eruption": {
        // three geysers in a row, each a beat after the last (stepping stones of lava)
        const ph = r.next();
        for (let i = 0; i < 3; i++) {
          const o = this.obtain("geyser");
          o.spawn(x + 40 + i * 200, { h: H * (0.36 + i * 0.07), rest: 0.7, phase: (ph + i * 0.22) % 1 });
        }
        this.coinLine(x + 20, x + 460, H * 0.22, 4);
        width = 480;
        break;
      }
      case "shower": {
        // a short meteor shower: three falls, each marked by its own red target first
        for (let i = 0; i < 3; i++) {
          const o = this.obtain("meteor");
          o.spawn(x + 44 + i * 300, { lead: 1.95 + i * 0.12 });
        }
        width = 88 + 600;
        break;
      }
      case "firepair": {
        // two fire bars side by side, turning opposite ways
        const len = 4 * 36;
        const y = r.range(safeTop + len * 0.7, safeBot - len * 0.7);
        const sp = r.range(1.2, 1.6);
        for (let i = 0; i < 2; i++) {
          const o = this.obtain("firebar");
          o.spawn(x + len + 24 + i * (len * 2 + 120), { y, n: 4, speed: i ? -sp : sp, phase: i * Math.PI });
        }
        width = (len + 24) * 2 + len * 2 + 120;
        break;
      }
      case "geyserbar": {
        // a fire bar turning high up, a geyser below it on the far side
        const len = 4 * 36;
        const fb = this.obtain("firebar");
        fb.spawn(x + len + 24, { y: r.range(safeTop + len * 0.6, H * 0.4), n: 4, speed: r.pick([-1, 1]) * 1.3, phase: r.range(0, 6.28) });
        const gy = this.obtain("geyser");
        gy.spawn(x + len * 2 + 160, { h: H * 0.42, rest: 0.8, phase: r.next() });
        width = len * 2 + 220;
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
      case "comet": {
        // Frost Comet: its whole path is shown before it flies (see FrostComet)
        const o = this.obtain("comet");
        o.spawn(x + 160, { dir: r.chance(0.5) ? 1 : -1, lead: r.range(0.55, 0.85), span: r.range(240, 320) });
        this.coinLine(x + 60, x + 260, r.chance(0.5) ? H * 0.3 : H * 0.7, 3);
        width = 320;
        break;
      }
      case "icecurtain": {
        // three icicles in a cascade: each shakes (with its drop line) a beat after the last
        for (let i = 0; i < 3; i++) {
          const o = this.obtain("icicle");
          o.spawn(x + 26 + i * 150, { lead: 1.25 + i * 0.12 });
        }
        this.coinLine(x + 40, x + 320, H * 0.74, 4);
        width = 52 + 300;
        break;
      }
      case "sliderpair": {
        // pillars from the ceiling and the floor sliding in opposite phase: the gap moves
        const ph = r.next();
        const per = r.range(3.4, 4.2);
        const a = this.obtain("slider");
        a.spawn(x + a.w / 2, { top: true, Lmin: H * 0.08, Lmax: H * 0.36, period: per, phase: ph });
        const b = this.obtain("slider");
        b.spawn(x + b.w / 2, { top: false, Lmin: H * 0.08, Lmax: H * 0.36, period: per, phase: ph + 0.5 });
        width = a.w;
        break;
      }
      case "zapstairs": {
        // two zap pairs stepped like stairs, firing in turn
        const D = r.range(260, 320);
        const up = r.chance(0.5);
        for (let i = 0; i < 2; i++) {
          const c = up ? safeBot - D / 2 - i * 230 : safeTop + D / 2 + i * 230;
          const o = this.obtain("zap");
          o.spawn(x + 40 + i * 220, { y1: c - D / 2, y2: c + D / 2, dx: 0, phase: (i * 0.5 + r.next() * 0.2) % 1 });
        }
        this.coinLine(x + 60, x + 280, up ? safeTop + 60 : safeBot - 60, 4);
        width = 300;
        break;
      }
      case "gauntlet": {
        // a slider rising from the floor with an icicle hanging above its far side
        const sl = this.obtain("slider");
        sl.spawn(x + sl.w / 2, { top: false, Lmin: H * 0.12, Lmax: H * 0.42, period: r.range(3.6, 4.4), phase: r.next() });
        const ic = this.obtain("icicle");
        ic.spawn(x + sl.w + 150, { lead: 1.3 });
        this.coinLine(x + 30, x + sl.w + 160, H * 0.42, 3);
        width = sl.w + 180;
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
        const n = local > 200 && r.chance(0.25) ? 2 : 1;
        let top = r.chance(0.5);
        for (let i = 0; i < n; i++) {
          const o = this.obtain("tendril");
          o.spawn(x + 44 + i * 240, { top, L: r.range(H * 0.22, H * 0.34), lead: 1.3 });
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
          open: Phaser.Math.Linear(500, 470, d),
          hold: r.range(1.4, 1.8),
          minGap: 200,
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
          depth: r.range(H * 0.13, H * 0.19),
          sway: H * 0.04,
          phase: r.range(0, 6.28),
        });
        this.coinLine(x + 200, x + n * 64 - 200, mid, 4);
        width = n * 64;
        break;
      }
      // ------------------------------------------------------------ peaceful valley
      case "vine": {
        const n = r.chance(0.2) ? 2 : 1;
        let top = r.chance(0.5);
        for (let i = 0; i < n; i++) {
          const o = this.obtain("vine");
          o.spawn(x + 40 + i * 320, {
            top,
            L: r.range(H * 0.22, H * 0.32),
            amp: r.range(0.16, 0.26),
            speed: r.range(0.55, 0.8),
            phase: r.next(),
          });
          top = !top;
        }
        width = 80 + (n - 1) * 320;
        break;
      }
      case "puffs": {
        const lane = r.range(safeTop + 160, safeBot - 160); // the calm path between puffs
        const ys = [lane - 260, lane + 260].filter((y) => y > 40 && y < H - 40);
        if (r.chance(0.4)) {
          const far = lane + (r.chance(0.5) ? -1 : 1) * 520;
          if (far > 40 && far < H - 40) ys.push(far);
        }
        const o = this.obtain("puffs");
        o.spawn(x + 40, { ys, bob: r.range(28, 44), phase: r.next() });
        this.coinLine(x + 10, x + 70, lane, 2);
        width = 80;
        break;
      }
      case "bloom": {
        const gc = r.range(safeTop + 260, safeBot - 260);
        const o = this.obtain("bloom");
        o.spawn(x + 13 * S, {
          gc,
          open: r.range(520, 560),
          narrow: r.range(400, 430),
          period: r.range(3.8, 4.6),
          phase: r.next(),
        });
        this.coinLine(x, x + 26 * S, gc, 2);
        width = 26 * S;
        break;
      }
      // ------------------------------------------------------------ hurricane
      case "debris": {
        const n = 2 + (r.chance(0.4) ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const o = this.obtain("debris");
          o.spawn(x + 60 + i * 230, {
            y: r.range(-40, H * 0.5),
            vx: -r.range(60, 120),
            vy: r.range(110, 180),
            spin: r.range(4, 8),
            phase: r.next(),
          });
        }
        width = 120 + (n - 1) * 230;
        break;
      }
      case "bolt": {
        const o = this.obtain("bolt");
        o.spawn(x + 16 * S, {
          idle: r.range(0.9, 1.3),
          phase: r.next(),
          depth: r.range(0.45, 0.7),
        });
        width = 32 * S;
        break;
      }
      case "twister": {
        const o = this.obtain("twister");
        o.spawn(x + 100, { top: r.chance(0.35), wander: r.range(25, 50), phase: r.next() });
        width = 200;
        break;
      }
      // ------------------------------------------------------------ Prism Rift
      case "mlaser": {
        const top = r.chance(0.5);
        const dx = r.range(H * 0.16, H * 0.24);
        const ym = top ? r.range(H * 0.32, H * 0.5) : r.range(H * 0.5, H * 0.68);
        const o = this.obtain("mlaser");
        o.spawn(x + dx + 30, { top, dx, ym, phase: r.next() });
        width = dx * 2 + 60;
        break;
      }
      case "glass": {
        const gap = Phaser.Math.Linear(360, 300, d);
        const gc = r.range(safeTop + gap / 2 + 60, safeBot - gap / 2);
        const o = this.obtain("glass");
        o.spawn(x + 40, { gc, gap });
        this.coinLine(x + 10, x + 70, gc, 2);
        width = 80;
        break;
      }
      case "rprism": {
        const L = r.range(H * 0.2, H * 0.28);
        const o = this.obtain("rprism");
        o.spawn(x + L + 30, {
          y: r.range(H * 0.35, H * 0.65),
          L,
          speed: (r.chance(0.5) ? 1 : -1) * r.range(0.7, 1.0 + d * 0.3),
          phase: r.next(),
        });
        width = L * 2 + 60;
        break;
      }
      // ------------------------------------------------------------ Tidal Sky
      case "jelly": {
        const o = this.obtain("jelly");
        const y = r.range(safeTop, H * 0.55);
        o.spawn(x + 40, { y, tl: r.range(H * 0.14, H * 0.22), phase: r.next() });
        this.coinLine(x + 20, x + 60, y < H * 0.4 ? H * 0.72 : H * 0.25, 2);
        width = 80;
        break;
      }
      case "mine": {
        const n = local > 200 && r.chance(0.4) ? 2 : 1;
        let top = r.chance(0.5);
        for (let i = 0; i < n; i++) {
          const o = this.obtain("mine");
          o.spawn(x + 40 + i * 260, {
            top,
            y: top ? r.range(H * 0.18, H * 0.42) : r.range(H * 0.58, H * 0.82),
            phase: r.next(),
          });
          top = !top;
        }
        width = 80 + (n - 1) * 260;
        break;
      }
      case "current": {
        // a current that nudges you toward a mine — read the streaks and fly against them
        const w = r.range(340, 420);
        const dir = r.chance(0.5) ? -1 : 1;
        this.obtain("current").spawn(x + w / 2, { w, dir });
        const m = this.obtain("mine");
        m.spawn(x + w * 0.6, {
          top: dir < 0,
          y: dir < 0 ? r.range(H * 0.2, H * 0.32) : r.range(H * 0.68, H * 0.8),
          phase: r.next(),
        });
        width = w;
        break;
      }
      case "bubblecol": {
        // bubbles slow you inside the column, a jellyfish waits just past it
        this.obtain("bubblecol").spawn(x + 75, { w: 150 });
        const j = this.obtain("jelly");
        j.spawn(x + 260, {
          y: r.range(safeTop, H * 0.5),
          tl: r.range(H * 0.14, H * 0.2),
          phase: r.next(),
        });
        width = 300;
        break;
      }
      // ------------------------------------------------------------ Chrono Fracture
      case "cgear": {
        const moving = r.chance(0.3 + d * 0.4);
        const amp = moving ? r.range(60, 140) : 0;
        const o = this.obtain("cgear");
        o.spawn(x + 56, {
          y: r.range(safeTop + amp, safeBot - amp),
          amp,
          freq: r.range(0.9, 1.6),
          spin: (r.chance(0.5) ? 1 : -1) * r.range(2, 4),
          phase: r.next(),
        });
        width = 112;
        break;
      }
      case "pendulum": {
        const L = r.range(H * 0.42, H * 0.6);
        const o = this.obtain("pendulum");
        o.spawn(x + Math.sin(0.6) * L + 60, {
          L,
          amp: r.range(0.45, 0.65),
          period: r.range(2.2, 2.8),
          phase: r.next(),
        });
        width = Math.sin(0.65) * L * 2 + 120;
        break;
      }
      case "timezone": {
        // a time zone with a gear in it: gold slows everything, red speeds it all up
        const w = r.range(380, 460);
        this.obtain("timezone").spawn(x + w / 2, { w, fast: r.chance(0.5) });
        const g = this.obtain("cgear");
        g.spawn(x + w * 0.55, {
          y: r.range(H * 0.3, H * 0.7),
          amp: r.range(80, 150),
          freq: r.range(1.2, 1.8),
          spin: 3,
          phase: r.next(),
        });
        width = w;
        break;
      }
      case "rewind": {
        const y1 = r.range(safeTop, H * 0.45);
        const y2 = y1 + r.range(H * 0.3, H * 0.42);
        const o = this.obtain("rewind");
        o.spawn(x + 40, { y1, y2: Math.min(y2, safeBot), phase: r.next() });
        width = 80;
        break;
      }
      // ------------------------------------------------------------ Mirror Realm
      case "spire": {
        // heights start low and grow; remember your reflection flies the other half
        const h = r.range(H * 0.1, H * (0.16 + d * 0.16));
        const o = this.obtain("spire");
        o.spawn(x + 24, { top: r.chance(0.5), h });
        width = 48;
        break;
      }
      case "vorb": {
        const top = r.chance(0.5);
        const o = this.obtain("vorb");
        o.spawn(x + 32, {
          y: top
            ? r.range(H * 0.12, H * (0.3 + d * 0.12))
            : r.range(H * (0.58 - d * 0.12), H * 0.88),
          phase: r.next(),
        });
        width = 64;
        break;
      }
      case "vbar": {
        const o = this.obtain("vbar");
        o.spawn(x + 68, { top: r.chance(0.5), period: r.range(2.6, 3.4), phase: r.next() });
        width = 136;
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

    // coin flow: if the next coin chance would come too late to keep a combo going, lay a
    // short trail through the free space after this pattern, near the last coins' height
    const gapEnd = x + width + spacing * spacingMul;
    if (gapEnd - this.lastCoinX > (this.scroll || 500) * COIN_FLOW.maxGapSeconds) {
      const y = Phaser.Math.Clamp(
        Phaser.Math.Linear(this.lastCoinY, mid, COIN_FLOW.pullToMiddle) + r.range(-60, 60),
        safeTop + 40,
        safeBot - 40,
      );
      const sp = gapEnd - (x + width);
      this.coinLine(x + width + sp * 0.3, x + width + sp * 0.7, y, COIN_FLOW.bridgeCoins);
    }
    this.nextX = gapEnd;
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
    const { px, py, r, alive, meters, biomeId, zoom, twinY = null } = ctx;
    const ev =
      this.events ||
      (this.events = {
        hit: null,
        near: [],
        passed: [],
        perfect: [],
        portal: null,
        coins: 0,
        warded: [],
      });
    ev.hit = null;
    ev.warded.length = 0;
    ev.near.length = 0;
    ev.perfect.length = 0;
    ev.passed.length = 0;
    ev.portal = null;
    ev.coins = 0;
    ev.zone = false;
    ev.push = 0; // currents (px/s² added to the player's vertical speed)
    ev.drag = 0; // bubble columns (vertical-speed damping)
    ev.timeScale = 1; // time zones
    this.px = px;
    this.scroll = scroll;

    this.rightEdge = this.W / 2 + this.W / 2 / zoom + 40;
    this.leftEdge = this.W / 2 - this.W / 2 / zoom - 40;

    const dx = scroll * dt;
    this.nextX -= dx;
    this.lastCoinX -= dx;
    if (this.info.pause) {
      // title / calm window: keep the area clear (but never leave gravity flipped)
      if (this.flipped && this.nextX < this.rightEdge + 160) {
        const p = this.obtain("portal");
        p.spawn(this.nextX, { y: this.H / 2, mode: "restore" });
        this.flipped = false;
      }
      this.nextX = Math.max(this.nextX, this.rightEdge + 161);
      // no hazards here, but keep a gentle coin trail coming so the combo can survive
      const edge = this.rightEdge + 160;
      if (edge - this.lastCoinX > scroll * COIN_FLOW.maxGapSeconds * 0.75) {
        const y = Phaser.Math.Clamp(
          Phaser.Math.Linear(this.lastCoinY, this.H / 2, COIN_FLOW.pullToMiddle) +
            this.rng.range(-50, 50),
          190,
          this.H - 190,
        );
        this.coinLine(edge, edge + 120, y, COIN_FLOW.bridgeCoins);
      }
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
        } else if (o.kind === "field") {
          if (o.inside(px)) o.apply(ev);
        } else if (o.right > px - r - 30 && o.left < px + r + 30) {
          let c = o.clearance(px, py, r);
          // Mirror Realm: the twin (reflected across the horizon) can crash too
          if (twinY !== null) c = Math.min(c, o.clearance(px, twinY, r));
          if (c < o.minClear) o.minClear = c;
          // RONIN's Fire Ward: warded hazard types are passed through (one event per pass)
          if (c < 0 && this.ward?.includes(o.type)) {
            if (!o.inWard) ev.warded.push(o);
            o.inWard = true;
          } else {
            if (c >= 0) o.inWard = false;
            if (c < 0 && !ev.hit) ev.hit = o;
          }
        }
        // PERFECT: crossing a gap's centre line right in the middle of the opening
        if (!o.centerSeen && o.x <= px) {
          o.centerSeen = true;
          if (o.kind === "obstacle" && o.yb > o.yt) {
            const half = (o.yb - o.yt) / 2;
            if (Math.abs(py - (o.yt + half)) <= Math.max(22, half * 0.16)) ev.perfect.push(o);
          }
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
      // a magnetised coin flies at the bird and no longer scrolls with the world: scrolling
      // it too let fast runs (high scores) hold it in a trailing orbit it never left
      if (!c.magnet || !alive) c.x -= dx;
      const t = clock * 4 + c.phase;
      if (alive) {
        const ddx = px - c.x;
        const ddy = py - c.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < this.magnetR * this.magnetR) c.magnet = true;
        if (c.magnet) {
          c.x += ddx * Math.min(1, dt * 12);
          c.baseY += ddy * Math.min(1, dt * 12);
        }
        if (d2 < (r + 22) ** 2) {
          ev.coins++;
          this.fx.burst("star", c.x, c.y, 6, 0xffd23f, { speed: { min: 60, max: 240 } });
          this.fx.burst("pixel", c.x, c.y, 5, 0xfff1a0, { speed: { min: 120, max: 320 } });
          c.setActive(false).setVisible(false);
          c.halo.setVisible(false);
          continue;
        }
      }
      c.y = c.baseY + Math.sin(t) * 5;
      c.setFrame(`${this.coinSkin.prefix}${Math.floor(t * 2.2) % 4}`);
      c.halo.setPosition(c.x, c.y).setAlpha(0.3 + 0.45 * (this.beat || 0));
      if (c.x < this.leftEdge - 40) {
        c.setActive(false).setVisible(false);
        c.halo.setVisible(false);
      }
    }
    return ev;
  }
}
