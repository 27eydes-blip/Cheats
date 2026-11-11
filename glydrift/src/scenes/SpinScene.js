// Lucky Spin: spend spins (earned every 2500 points) on a prize wheel — coins, a rare
// cosmetic, or one of the heroes you can only win here. The prize is rolled first
// (Progression.spin); the wheel then spins, slows with a click per slice and lands exactly
// on it. Spins are earned by playing and can never be bought: no real money here, ever.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { greyPortrait } from "../pixel/grayHero.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { HI } from "../gfx/textures.js";
import { getCharacter, LOTTERY_HEROES } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { CATEGORIES, getCosmetic, Shop, SKINS } from "../data/cosmetics.js";
import {
  Progression,
  SPIN_COSMETICS,
  SPIN_EVERY,
  SPIN_HERO_COINS,
  SPIN_MULTI_MAX,
  SPIN_PITY,
  SPIN_SLICES,
  spinCosmeticCoins,
} from "../data/progression.js";
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";
import {
  button,
  drawNeonRect,
  fadeTo,
  hex,
  neonText,
  plainText,
  popIn,
  ProgressBar,
  RollingCounter,
  num,
} from "../ui/ui.js";

const N = SPIN_SLICES.length;
const SLICE = 360 / N;
const COLORS = [0x3ef4ff, 0xb45cff, 0xffd23f, 0xff4fd8];
const COSMETIC_COL = 0x7ffcff;
/** Rim lights: three per slice, so the chase lines up with the slices. */
const LIGHTS = N * 3;

/** Which slice sits under the pointer (at the top) when the wheel is turned `angle` degrees. */
export function sliceAt(angle) {
  const rel = (((-angle % 360) + 360) % 360) + 1e-6;
  return Math.floor(rel / SLICE) % N;
}

/** How big a win is, 1–3: drives the celebration (particles, rays, coin shower, sound). */
export function winTier(prize) {
  if (prize.type === "hero") return 3;
  if (prize.type === "cosmetic") return prize.dupe ? 2 : 3;
  if (prize.type === "spins") return 1;
  if (prize.jackpot) return 3;
  return prize.amount >= 800 ? 2 : 1;
}

export class SpinScene extends Phaser.Scene {
  constructor() {
    super("Spin");
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.top = top;
    this.cameras.main.fadeIn(250, 5, 1, 13);
    this.backdrop = this.scene.get("Backdrop");
    this.lowGfx = !!s.settings.lowGfx;
    // Reduce Flashing: rim lights glide instead of blinking, glows are dimmer, no fast pulses
    this.calm = reduceFlashing();
    this.fx = new Effects(this, { lowGfx: this.lowGfx, depth: 300 });
    this.pal = {};
    blendPalette({ a: BIOMES[3], b: BIOMES[1], t: 0.3 }, this.pal);
    this.t = 0;
    this.spinning = false;
    this.reveal = null;
    this.anim = null; // the wheel's current spin (see startSpin)
    this.vel = 0; // wheel speed, degrees per second (drives the rim chase and tick pitch)
    this.chase = 0;
    this.ptrKick = 0;
    this.win = null; // { idx, color, t } while a winning slice glows
    this.shower = [];
    this.raysFade = 0;
    this.raysTarget = 0;
    this.raysHold = 0;

    // ---- header
    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(100);
    neonText(this, W / 2, top + 46, "LUCKY SPIN", 38, 0xffd23f).setDepth(100);
    // the chance of every prize, shown before spinning (spins are earned by playing, never bought)
    this.oddsBtn = button(this, 80, top + 122, 120, 52, "ODDS", {
      color: 0x3ef4ff,
      size: 18,
      onClick: () => this.showOdds(),
    }).setDepth(100);
    this.add
      .image(W - 150, top + 46, "coin")
      .setScale(0.7 / HI)
      .setDepth(100);
    this.coinText = neonText(this, W - 128, top + 46, `${s.coins}`, 24, 0xffc83d, {
      ox: 0,
      blur: 8,
    }).setDepth(100);
    this.coins = new RollingCounter(this, this.coinText, { value: s.coins });

    // ---- the wheel
    this.cx = W / 2;
    this.cy = Math.max(top + 400, H * 0.4);
    this.R = 250;
    // Short frames (iPad portrait and other 3:2 windows, 1080 units tall): the wheel, the
    // controls and the odds strip under them (cy + 712) didn't fit, and the odds strip, which
    // must always be on screen, fell off the bottom. There the wheel moves up (its pointer
    // still clear of the title) and the controls and odds rows sit closer together; taller
    // screens keep the layout exactly as it was.
    const fitBottom = H - (this.registry.get("safeBottom") || 0) - 10;
    const tight = this.cy + 712 > fitBottom;
    if (tight) this.cy = Math.max(top + 362, Math.min(this.cy, fitBottom - 658));
    const k = tight
      ? { spin: 80, multi: 94, info: 146, bar: 168, hero: 192, odds: 226, row: 21 }
      : { spin: 96, multi: 98, info: 158, bar: 182, hero: 210, odds: 248, row: 25 };
    // light rays behind the wheel (shown on a win; brighter for bigger prizes)
    this.rays = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.rays.setPosition(this.cx, this.cy).setAlpha(0);
    this.wheel = this.add.container(this.cx, this.cy).setDepth(10);
    this.drawWheel();
    this.winGlow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.winGlow.alpha = 0;
    this.wheel.add(this.winGlow);
    this.rim = this.add.graphics().setDepth(11);
    this.rimGlow = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    // pointer (top, pointing down into the wheel); it pivots on its top edge so it flaps
    // as each peg clicks past
    const ptr = this.add.graphics().setDepth(12);
    ptr.fillStyle(0xffffff, 1).fillTriangle(-26, 0, 26, 0, 0, 48);
    ptr.lineStyle(5, 0xff4fd8, 1).strokeTriangle(-26, 0, 26, 0, 0, 48);
    ptr.setPosition(this.cx, this.cy - this.R - 34);
    this.pointer = ptr;
    this.ptrGlow = this.add
      .image(this.cx, this.cy - this.R - 6, "dot")
      .setDepth(11)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff4fd8)
      .setAlpha(0);
    // hub
    const hub = this.add.graphics().setDepth(12);
    hub.fillStyle(0x0a0418, 1).fillCircle(this.cx, this.cy, 70);
    hub.lineStyle(6, 0xffd23f, 1).strokeCircle(this.cx, this.cy, 70);
    this.hubText = neonText(this, this.cx, this.cy - 8, "", 40, 0xffd23f, { blur: 10 }).setDepth(
      13,
    );
    plainText(this, this.cx, this.cy + 30, "SPINS", 16, "#ffe9a8").setDepth(13);

    // ---- controls
    const by = this.cy + this.R + k.spin;
    this.spinBtn = button(this, W / 2, by, 420, 112, "SPIN", {
      color: 0x39ff88,
      size: 50,
      fill: 0x0c2a1a,
      onClick: () => this.spin(),
    }).setDepth(100);
    // multi-spin: up to 10 / 20 at once, one big spin and a results sheet
    this.multi = [10, SPIN_MULTI_MAX].map((n, i) =>
      button(this, W / 2 + (i - 0.5) * 230, by + k.multi, 210, 70, `×${n}`, {
        color: i ? 0xffd23f : 0xb45cff,
        size: 24,
        onClick: () => this.spinMulti(n),
      }).setDepth(100),
    );
    this.info = plainText(this, W / 2, by + k.info, "", 17, "#d8d0ff").setDepth(100);
    this.bar = new ProgressBar(this, W / 2 - 180, by + k.bar, 360, 10, 0xffd23f).setDepth(100);
    this.heroLine = plainText(this, W / 2, by + k.hero, "", 16, "#ffe9a8").setDepth(100);
    this.buildOddsStrip(by + k.odds, k.row);
    popIn(this, [this.spinBtn, ...this.multi], 150);
    this.refresh();
    if (TEST.on)
      window.__glySpin = {
        scene: this,
        sliceAt,
        spinOdds,
        winTier,
        SPIN_SLICES,
        SPIN_COSMETICS,
        SPIN_HERO_COINS,
        spinCosmeticCoins,
      };
  }

  drawWheel() {
    const R = this.R;
    const g = this.add.graphics();
    this.wheel.add(g);
    for (let i = 0; i < N; i++) {
      const sl = SPIN_SLICES[i];
      const a0 = Phaser.Math.DegToRad(-90 + i * SLICE);
      const a1 = Phaser.Math.DegToRad(-90 + (i + 1) * SLICE);
      const hero = sl.type === "hero";
      const cos = sl.type === "cosmetic";
      const col = hero
        ? 0xff7ad9
        : cos
          ? COSMETIC_COL
          : sl.type === "jackpot"
            ? 0xffd23f
            : sl.type === "spins"
              ? 0x39ff88
              : COLORS[i % COLORS.length];
      const base = hero ? 0x3a0f3a : cos ? 0x0c2a3a : i % 2 ? 0x150a2e : 0x0e0722;
      g.fillStyle(base, 1);
      g.slice(0, 0, R, a0, a1, false).fillPath();
      // coloured outer band
      g.fillStyle(col, hero || cos ? 0.9 : 0.75);
      g.slice(0, 0, R, a0, a1, false).fillPath();
      g.fillStyle(base, 1);
      g.slice(0, 0, R - 18, a0, a1, false).fillPath();
      g.lineStyle(4, 0x05010d, 1);
      g.lineBetween(0, 0, Math.cos(a0) * R, Math.sin(a0) * R);
      // label, upright along the slice's centre line
      const mid = (a0 + a1) / 2;
      const lx = Math.cos(mid) * R * 0.66;
      const ly = Math.sin(mid) * R * 0.66;
      const ix = Math.cos(mid) * R * 0.42;
      const iy = Math.sin(mid) * R * 0.42;
      const rot = mid + Math.PI / 2;
      if (hero) {
        const q = neonText(this, lx, ly - 6, "?", 60, 0xff7ad9, { blur: 14 }).setRotation(rot);
        const t = plainText(this, ix, iy, "HERO", 17, "#ffd0f0").setRotation(rot);
        this.wheel.add([q, t]);
      } else if (cos) {
        const ic = this.add.image(lx, ly, "cosm", HAT_FIT.hat_halo.frame).setScale(1.8);
        const t = plainText(this, ix, iy, "RARE ITEM", 14, "#c8fcff").setRotation(rot);
        ic.setRotation(rot);
        this.wheel.add([ic, t]);
      } else if (sl.type === "spins") {
        const t = neonText(this, lx, ly, `+${sl.amount}`, 38, 0x39ff88, { blur: 10 });
        const u = plainText(this, ix, iy, "SPINS", 16, "#b8ffd8");
        t.setRotation(rot);
        u.setRotation(rot);
        this.wheel.add([t, u]);
      } else if (sl.type === "jackpot") {
        const t = neonText(this, lx, ly, `${sl.amount}`, 30, 0xffffff, {
          blur: 12,
          stroke: "#ffd23f",
        });
        const u = neonText(this, ix, iy, "JACKPOT", 14, 0xffd23f, { blur: 6 });
        t.setRotation(rot);
        u.setRotation(rot);
        this.wheel.add([t, u]);
      } else {
        const t = neonText(this, lx, ly, `${sl.amount}`, 32, col, { blur: 8 }).setRotation(rot);
        const ci = this.add.image(ix, iy, "coin");
        ci.setScale(0.5 / HI).setRotation(rot);
        this.wheel.add([t, ci]);
      }
    }
    g.lineStyle(10, 0xffd23f, 1).strokeCircle(0, 0, R);
    g.lineStyle(3, 0xffffff, 0.6).strokeCircle(0, 0, R - 6);
  }

  /** The odds, always on screen under the wheel (the ODDS button shows the details). */
  buildOddsStrip(y, rowH = 25) {
    const W = this.W;
    const c = this.add.container(0, 0).setDepth(100);
    const rows = spinOdds();
    const per = Math.ceil(rows.length / 2);
    const g = this.add.graphics();
    const h = 36 + per * rowH;
    g.fillStyle(0x0b0520, 0.72).fillRoundedRect(44, y - 18, W - 88, h, 14);
    g.lineStyle(2, 0x3ef4ff, 0.5).strokeRoundedRect(44, y - 18, W - 88, h, 14);
    c.add(g);
    c.add(plainText(this, W / 2, y, "PRIZE ODDS · ADD UP TO 100%", 14, "#9fe8ff"));
    rows.forEach((r, i) => {
      const col = i < per ? 0 : 1;
      const x0 = col ? W / 2 + 14 : 64;
      const x1 = col ? W - 64 : W / 2 - 14;
      const yy = y + 28 + (i % per) * rowH;
      c.add(plainText(this, x0, yy, r.short, 15, "#ffffff").setOrigin(0, 0.5));
      c.add(plainText(this, x1, yy, `${r.pct}%`, 15, "#ffd23f").setOrigin(1, 0.5));
    });
    this.oddsStrip = c;
  }

  refresh() {
    const s = Save.data;
    const spins = s.spins || 0;
    this.hubText.setText(`${spins}`);
    const ready = spins > 0 && !this.spinning;
    this.spinBtn.setLabel(spins > 0 ? "SPIN" : "NO SPINS");
    this.spinBtn.setColor(spins > 0 ? 0x39ff88 : 0x6a608a);
    this.spinBtn.setEnabled(ready);
    [10, SPIN_MULTI_MAX].forEach((n, i) => {
      const k = Math.min(n, spins);
      const b = this.multi[i];
      // ≤ 10 spins: a single "use them all" button; more: ×10 and ×20 (or all, if fewer)
      const show = i === 0 || spins > 10;
      b.setVisible(show);
      b.x = this.W / 2 + (spins > 10 ? (i - 0.5) * 230 : 0);
      b.setLabel(spins >= 2 ? `SPIN ×${k}` : `×${n}`);
      b.setEnabled(ready && spins >= 2);
    });
    const pts = s.spinPts || 0;
    this.info.setText(`Next spin: ${num(pts)} / ${num(SPIN_EVERY)} points  ·  every run counts`);
    this.bar.set(pts / SPIN_EVERY);
    const owned = LOTTERY_HEROES.filter((c) => s.unlocked[c.id]).length;
    const g = Progression.spinsToGuarantee();
    this.heroLine.setText(
      (owned < LOTTERY_HEROES.length
        ? `Spin heroes: ${owned} / ${LOTTERY_HEROES.length}`
        : `All ${LOTTERY_HEROES.length} spin heroes collected!`) +
        (g ? `  ·  hero guaranteed in ${g} spin${g === 1 ? "" : "s"}` : ""),
    );
  }

  // ---------------------------------------------------------------- spinning
  /**
   * Turn the wheel so it ends exactly on slice `idx`. Phase 1 eases out (fast, then a long
   * suspenseful slowdown); phase 2 is a small settle. Some spins "creep" over the line into
   * the prize at the last moment, or tip just past it and rock back: a near miss that still
   * ends exactly on the prize rolled before the spin started.
   */
  startSpin(idx, { turns = 6, dur = 4.4, nearMiss = true, done }) {
    let off = (Math.random() - 0.5) * SLICE * 0.55; // where in the slice the pointer stops
    let over = 2 + Math.random() * 2; // degrees the wheel runs past before settling back
    let settle = 0.35;
    const roll = nearMiss ? Math.random() : 1;
    if (roll < 0.3) {
      // creep: it looks like it stops on the slice before, then just tips over the line
      off = -SLICE / 2 + 2 + Math.random() * 2;
      over = 0.6;
      dur += 0.5;
    } else if (roll < 0.6) {
      // tip-back: it slides just past the prize into the next slice, then rocks back
      off = SLICE / 2 - 3 - Math.random() * 2;
      over = SLICE / 2 - off + 3 + Math.random() * 3;
      settle = 0.75;
      dur += 0.3;
    }
    const target = -(idx * SLICE + SLICE / 2) + off;
    const from = this.wheel.angle;
    const to = from + ((((target - from) % 360) + 360) % 360) + 360 * turns;
    this.clearWin();
    this.anim = { from, to, over, t: 0, T1: dur, T2: settle, done, tick: Math.floor(from / SLICE) };
    Sfx.ui();
  }

  /** Advance the wheel's spin by dt seconds (called from update). */
  stepSpin(dt) {
    const a = this.anim;
    if (!a || dt <= 0) return;
    a.t += dt;
    let angle;
    if (a.t < a.T1) {
      const u = a.t / a.T1;
      angle = a.from + (a.to + a.over - a.from) * (1 - (1 - u) ** 4);
    } else if (a.t < a.T1 + a.T2) {
      const v = (a.t - a.T1) / a.T2;
      angle = a.to + a.over * (0.5 + 0.5 * Math.cos(v * Math.PI));
    } else angle = a.to;
    // (Phaser wraps a container's angle to -180..180: track the unwrapped value here)
    this.vel = Math.abs(angle - (a.prev ?? a.from)) / dt;
    a.prev = angle;
    this.wheel.angle = angle;
    const k = Math.floor(angle / SLICE);
    if (k !== a.tick) {
      a.tick = k;
      const sp = Math.min(1, this.vel / 900);
      Sfx.spinTick(sp);
      this.ptrKick = -0.1 - 0.25 * (1 - sp); // slow clicks flap the pointer harder
    }
    if (a.t >= a.T1 + a.T2) {
      this.anim = null;
      this.vel = 0;
      a.done?.();
    }
  }

  spin(force) {
    if (this.spinning || this.reveal) return;
    const res = Progression.spin(force);
    if (!res) return;
    this.spinning = true;
    this.lastResult = res;
    this.refresh();
    this.startSpin(res.slice, { done: () => this.landed(res) });
  }

  /** Many spins at once: roll them all, one fast spin of the wheel, then a results sheet. */
  spinMulti(n) {
    if (this.spinning || this.reveal) return;
    const results = Progression.spinMany(n);
    if (!results.length) return;
    this.spinning = true;
    const last = results[results.length - 1];
    this.lastResult = last;
    this.refresh();
    this.startSpin(last.slice, {
      turns: 9,
      dur: 2.4,
      nearMiss: false,
      done: () => this.showResults(results),
    });
  }

  // ---------------------------------------------------------------- winning
  /** The wheel stopped on the prize: light the slice, celebrate, then the prize's screen. */
  landed(res) {
    const prize = res.prize;
    const tier = winTier(prize);
    const col =
      prize.type === "hero"
        ? getCharacter(prize.id).color
        : prize.type === "cosmetic"
          ? COSMETIC_COL
          : prize.type === "spins"
            ? 0x39ff88
            : 0xffd23f;
    this.win = { idx: res.slice, color: col, t: 0 };
    this.drawWinGlow();
    const coins = prize.type === "coins" || (prize.type === "cosmetic" && prize.dupe);
    this.celebrate(tier, col, coins);
    if (prize.type === "hero") return this.showHero(getCharacter(prize.id));
    if (prize.type === "cosmetic") return this.showCosmetic(prize);
    const { cx, cy } = this;
    if (prize.type === "spins") {
      this.winLabel(cx, cy - 120, `+${prize.amount} SPINS`, 0x39ff88, 52, tier);
    } else {
      if (prize.jackpot) this.winLabel(cx, cy - 215, "JACKPOT!", 0xffffff, 64, tier);
      else if (tier >= 2) this.winLabel(cx, cy - 215, "BIG WIN!", 0xffffff, 52, tier);
      this.winLabel(cx, cy - 125, `+${num(prize.amount)}`, 0xffd23f, 56 + tier * 6, tier);
      this.coins.to(Save.data.coins, 700 + tier * 400);
    }
    this.time.delayedCall(500 + tier * 250, () => {
      this.spinning = false;
      this.refresh();
    });
  }

  /**
   * The win celebration, scaled by the prize (tier 1–3): particle bursts, light rays behind
   * the wheel and (for coins) a shower of coins. Low Graphics: far fewer particles and coins.
   * Reduce Flashing: dimmer rays, no shockwave rings, a gentler shake.
   */
  celebrate(tier, col, coins) {
    const { cx, cy, R } = this;
    Sfx.reward();
    if (tier >= 2) this.time.delayedCall(180, () => Sfx.coin());
    if (tier >= 3) this.time.delayedCall(260, () => Sfx.sting());
    this.fx.burst("star", cx, cy - R, 16 + tier * 14, col, {
      speed: { min: 150, max: 420 + tier * 140 },
    });
    if (tier >= 2)
      this.fx.burst("star", cx, cy, 20 * tier, 0xffd23f, {
        speed: { min: 200, max: 600 + tier * 120 },
      });
    if (!this.calm) {
      this.fx.ring(cx, cy - R, col, { scale: 1.2 + tier * 0.4, duration: 500 });
      if (tier >= 3) this.fx.ring(cx, cy, 0xffffff, { scale: 4, duration: 900, alpha: 0.6 });
    }
    if (tier >= 3) this.cameras.main.shake(this.calm ? 160 : 280, this.calm ? 0.004 : 0.009);
    // rays behind the wheel: more of them, and brighter, for bigger prizes
    const g = this.rays;
    g.clear();
    const n = 8 + tier * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fillStyle(i % 2 ? col : 0xfff6c8, 1);
      g.fillTriangle(
        0,
        0,
        Math.cos(a) * 760,
        Math.sin(a) * 760,
        Math.cos(a + 0.16) * 760,
        Math.sin(a + 0.16) * 760,
      );
    }
    this.raysTarget = (this.calm ? 0.035 : 0.06) * tier;
    this.raysHold = 1.2 + tier * 0.6;
    // coin shower (spawned above the screen at different heights, so they rain in over time)
    if (coins) {
      const count = Math.round([0, 12, 28, 56][tier] * (this.lowGfx ? 0.35 : 1));
      for (let i = 0; i < count; i++) {
        const img = this.add
          .image(40 + Math.random() * (this.W - 80), -30 - Math.random() * 520, "coin")
          .setDepth(450);
        const base = (0.45 + Math.random() * 0.25) / HI;
        img.setScale(base);
        this.shower.push({
          img,
          base,
          vx: (Math.random() - 0.5) * 60,
          vy: 120 + Math.random() * 240,
          ph: Math.random() * 6,
          sp: 4 + Math.random() * 5,
        });
      }
    }
  }

  /** A prize label that pops in over the wheel and stays a moment (longer for bigger wins). */
  winLabel(x, y, str, color, size, tier) {
    const t = neonText(this, x, y, str, size, color, { blur: 16 }).setDepth(320).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 320, ease: "Back.easeOut" });
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: y - 40,
      delay: 1300 + tier * 500,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  /** Light up the winning slice (a soft glow on the wheel itself). */
  drawWinGlow() {
    const g = this.winGlow;
    g.clear();
    if (!this.win) return;
    const a0 = Phaser.Math.DegToRad(-90 + this.win.idx * SLICE);
    const a1 = Phaser.Math.DegToRad(-90 + (this.win.idx + 1) * SLICE);
    g.fillStyle(this.win.color, 1);
    g.slice(0, 0, this.R - 4, a0, a1, false).fillPath();
    g.lineStyle(6, 0xffffff, 1);
    g.slice(0, 0, this.R - 4, a0, a1, false).strokePath();
    g.alpha = 0;
  }

  clearWin() {
    this.win = null;
    this.winGlow.clear();
    this.winGlow.alpha = 0;
  }

  /** Icon for a cosmetic (the same art the shop uses). */
  cosIcon(id, x, y, k = 1) {
    const cc = getCosmetic(id);
    if (cc.cat === "hat") return this.add.image(x, y, "cosm", HAT_FIT[id].frame).setScale(4.2 * k);
    if (cc.cat === "coin") return this.add.image(x, y, "cosm", `${id}_0`).setScale(5 * k);
    if (cc.cat === "skin")
      return this.add
        .image(x, y, greyPortrait(this, getCharacter(Save.data.selected)))
        .setScale((0.9 / HI) * PORTRAIT_K * k)
        .setTint(SKINS[id].tint);
    return this.add.image(x, y, "cosm", `icon_${id}`).setScale(3.8 * k);
  }

  /** A rare cosmetic: new (equip it now), or one you own, paid out in coins instead. */
  showCosmetic(prize) {
    const W = this.W;
    const H = this.H;
    const def = getCosmetic(prize.id);
    const rcol = RARITY[def.rarity]?.color ?? COSMETIC_COL;
    const c = this.add.container(0, 0).setDepth(400);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.86).setInteractive();
    const rays = this.revealRays(prize.dupe ? 0xffd23f : COSMETIC_COL, H * 0.4);
    const panel = this.add.graphics();
    drawNeonRect(panel, 50, H * 0.18, W - 100, H * 0.62, 30, rcol, { fillAlpha: 0.0 });
    const head = neonText(
      this,
      W / 2,
      H * 0.22,
      prize.dupe ? "ALREADY OWNED" : "RARE COSMETIC!",
      prize.dupe ? 46 : 52,
      prize.dupe ? 0xffd23f : COSMETIC_COL,
      { blur: 18 },
    );
    const icon = this.cosIcon(prize.id, W / 2, H * 0.4, 1.5);
    const s0 = icon.scaleX;
    icon.setScale(s0 * 0.2);
    const name = neonText(this, W / 2, H * 0.53, def.name, 52, rcol, { blur: 16 });
    const cat = CATEGORIES.find((k) => k.id === def.cat)?.one || "Cosmetic";
    const rar = plainText(
      this,
      W / 2,
      H * 0.585,
      `${cat} · ${RARITY[def.rarity]?.label || def.rarity}`,
      22,
      hex(rcol),
    );
    const line = prize.dupe
      ? `You already own it, so you get +${num(prize.amount)} coins instead.`
      : "It's yours to keep: equip it now or in the shop.";
    const desc = plainText(this, W / 2, H * 0.635, line, 18, prize.dupe ? "#ffe9a8" : "#d8d0ff");
    const btns = [];
    if (prize.dupe) {
      btns.push(
        button(this, W / 2, H * 0.73, 260, 90, "NICE!", {
          color: 0x3ef4ff,
          size: 30,
          onClick: () => this.closeReveal(),
        }),
      );
      this.coins.to(Save.data.coins, 1200);
    } else {
      btns.push(
        button(this, W / 2 - 130, H * 0.73, 230, 90, "EQUIP", {
          color: 0x39ff88,
          size: 30,
          onClick: () => {
            Shop.equip(prize.id);
            this.closeReveal();
          },
        }),
        button(this, W / 2 + 130, H * 0.73, 230, 90, "NICE!", {
          color: 0x3ef4ff,
          size: 30,
          onClick: () => this.closeReveal(),
        }),
      );
    }
    c.add([dim, rays, panel, head, icon, name, rar, desc, ...btns]);
    this.tweens.add({ targets: icon, scale: s0, duration: 650, ease: "Back.easeOut" });
    popIn(this, [head, name, rar, ...btns], 250);
    this.reveal = c;
  }

  /** The results sheet for a multi-spin: totals that count up, heroes, and every pull. */
  showResults(results) {
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(400);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.9).setInteractive();
    const panel = this.add.graphics();
    const top = H * 0.12;
    const ph = H * 0.76;
    drawNeonRect(panel, 36, top, W - 72, ph, 30, 0xffd23f, { fill: 0x0b0520, fillAlpha: 0.96 });
    c.add([dim, panel]);
    // coins: coin slices plus cosmetics already owned (paid in coins)
    const coins = results.reduce(
      (a, r) => a + (r.prize.type === "coins" || r.prize.dupe ? r.prize.amount : 0),
      0,
    );
    const free = results.reduce((a, r) => a + (r.prize.type === "spins" ? r.prize.amount : 0), 0);
    const jackpots = results.filter((r) => r.prize.jackpot).length;
    const heroes = results
      .filter((r) => r.prize.type === "hero")
      .map((r) => getCharacter(r.prize.id));
    const newCos = results
      .filter((r) => r.prize.type === "cosmetic" && !r.prize.dupe)
      .map((r) => getCosmetic(r.prize.id));

    c.add(neonText(this, W / 2, top + 56, `${results.length} SPINS`, 44, 0xffd23f, { blur: 16 }));
    // coin total counts up
    const coinRow = top + 140;
    c.add(this.add.image(W / 2 - 120, coinRow, "coin").setScale(0.9 / HI));
    const total = neonText(this, W / 2 - 84, coinRow, "+0", 52, 0xffc83d, { ox: 0, blur: 14 });
    c.add(total);
    const o = { v: 0 };
    this.tweens.add({
      targets: o,
      v: coins,
      duration: 1100,
      ease: "Cubic.easeOut",
      onUpdate: () => total.setText(`+${Math.round(o.v)}`),
    });
    const extras = [];
    if (jackpots) extras.push(`JACKPOT ×${jackpots}!`);
    if (free) extras.push(`+${free} FREE SPINS`);
    if (extras.length)
      c.add(neonText(this, W / 2, coinRow + 62, extras.join("   "), 24, 0x39ff88, { blur: 8 }));

    // heroes and new cosmetics won
    let y = coinRow + 120;
    const wins = [...heroes.map((hero) => ({ hero })), ...newCos.map((cos) => ({ cos }))];
    if (wins.length) {
      const head = heroes.length
        ? heroes.length > 1
          ? "NEW HEROES!"
          : "NEW HERO!"
        : newCos.length > 1
          ? "RARE COSMETICS!"
          : "RARE COSMETIC!";
      c.add(
        neonText(this, W / 2, y, head, 32, heroes.length ? 0xff7ad9 : COSMETIC_COL, { blur: 12 }),
      );
      y += 74;
      const per = Math.min(wins.length, 4);
      wins.forEach((w, i) => {
        const col = i % per;
        const row = Math.floor(i / per);
        const x = W / 2 + (col - (per - 1) / 2) * 150;
        const hy = y + row * 150;
        const img = w.hero
          ? this.add.image(x, hy, w.hero.texture).setScale((0.9 / HI) * PORTRAIT_K)
          : this.cosIcon(w.cos.id, x, hy, 0.8);
        const def = w.hero || w.cos;
        const nm = plainText(this, x, hy + 62, def.name, 16, hex(RARITY[def.rarity].color));
        c.add([img, nm]);
        const s0 = img.scaleX;
        img.setScale(s0 * 0.05);
        this.tweens.add({
          targets: img,
          scale: s0,
          duration: 500,
          delay: 300 + i * 180,
          ease: "Back.easeOut",
        });
      });
      y += Math.ceil(wins.length / per) * 150;
      Sfx.reveal();
      this.cameras.main.shake(220, this.calm ? 0.003 : 0.006);
    } else {
      y += 10;
    }

    // every pull as a little chip
    const chipW = 118;
    const perRow = 5;
    const chipsTop = Math.min(y, top + ph - 280);
    results.forEach((r, i) => {
      const x = W / 2 + ((i % perRow) - (perRow - 1) / 2) * (chipW + 8);
      const cyy = chipsTop + Math.floor(i / perRow) * 48;
      const p = r.prize;
      const col =
        p.type === "hero"
          ? 0xff7ad9
          : p.type === "cosmetic"
            ? COSMETIC_COL
            : p.jackpot
              ? 0xffd23f
              : p.type === "spins"
                ? 0x39ff88
                : 0x4a4070;
      const label =
        p.type === "hero"
          ? getCharacter(p.id).name
          : p.type === "cosmetic"
            ? p.dupe
              ? `${p.amount}`
              : getCosmetic(p.id).name
            : p.type === "spins"
              ? `+${p.amount} SPINS`
              : `${p.amount}`;
      const g = this.add.graphics();
      g.fillStyle(col, p.type === "coins" && !p.jackpot ? 0.25 : 0.45).fillRoundedRect(
        x - chipW / 2,
        cyy - 19,
        chipW,
        38,
        10,
      );
      g.lineStyle(2, col, 1).strokeRoundedRect(x - chipW / 2, cyy - 19, chipW, 38, 10);
      const t = plainText(this, x, cyy, label, 16, "#ffffff");
      t.setScale(Math.min(1, (chipW - 10) / t.width));
      g.alpha = 0;
      t.alpha = 0;
      c.add([g, t]);
      this.tweens.add({ targets: [g, t], alpha: 1, duration: 160, delay: 120 + i * 45 });
    });

    const ok = button(this, W / 2, top + ph - 70, 300, 92, "COLLECT", {
      color: 0x39ff88,
      size: 32,
      onClick: () => this.closeReveal(),
    });
    c.add(ok);
    // one celebration, sized by the best pull
    const best = Math.max(...results.map((r) => winTier(r.prize)));
    this.celebrate(Math.max(2, best), 0xffd23f, coins > 0);
    this.coins.to(Save.data.coins, 1100);
    this.reveal = c;
  }

  /** The big moment: a new lottery hero. */
  showHero(def) {
    const W = this.W;
    const H = this.H;
    // (the wheel's celebration already played: bursts, rays and the sound)
    const c = this.add.container(0, 0).setDepth(400);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.86).setInteractive();
    const rays = this.revealRays(def.color, H * 0.42);
    const panel = this.add.graphics();
    drawNeonRect(panel, 50, H * 0.18, W - 100, H * 0.62, 30, RARITY[def.rarity].color, {
      fillAlpha: 0.0,
    });
    const head = neonText(this, W / 2, H * 0.22, "NEW HERO!", 54, 0xffd23f, { blur: 20 });
    const img = this.add.image(W / 2, H * 0.42, def.texture).setScale((0.2 / HI) * PORTRAIT_K);
    const name = neonText(this, W / 2, H * 0.58, def.name, 60, def.color, { blur: 18 });
    const rar = plainText(
      this,
      W / 2,
      H * 0.63,
      `${def.title} · ${RARITY[def.rarity].label}`,
      22,
      hex(RARITY[def.rarity].color),
    );
    const desc = plainText(this, W / 2, H * 0.67, def.desc, 18, "#d8d0ff");
    const equip = button(this, W / 2 - 130, H * 0.74, 230, 90, "EQUIP", {
      color: 0x39ff88,
      size: 30,
      onClick: () => {
        Save.data.selected = def.id;
        Save.write();
        this.closeReveal();
      },
    });
    const ok = button(this, W / 2 + 130, H * 0.74, 230, 90, "NICE!", {
      color: 0x3ef4ff,
      size: 30,
      onClick: () => this.closeReveal(),
    });
    c.add([dim, rays, panel, head, img, name, rar, desc, equip, ok]);
    this.tweens.add({
      targets: img,
      scale: (2.5 / HI) * PORTRAIT_K,
      duration: 650,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: img,
      y: H * 0.42 - 14,
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: "Sine.easeInOut",
      delay: 650,
    });
    popIn(this, [head, name, rar, equip, ok], 250);
    this.reveal = c;
  }


  /** Slowly turning light rays behind a prize card (dimmer with Reduce Flashing). */
  revealRays(color, y) {
    const rays = this.add.graphics();
    rays.fillStyle(color, this.calm ? 0.1 : 0.18);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.fillTriangle(
        0,
        0,
        Math.cos(a) * 700,
        Math.sin(a) * 700,
        Math.cos(a + 0.18) * 700,
        Math.sin(a + 0.18) * 700,
      );
    }
    rays.setPosition(this.W / 2, y);
    this.tweens.add({ targets: rays, rotation: Math.PI * 2, duration: 14000, repeat: -1 });
    return rays;
  }

  /** The chance of every prize, from the same table the wheel rolls on. */
  showOdds() {
    if (this.spinning || this.reveal) return;
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(400);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.9).setInteractive();
    const panel = this.add.graphics();
    const top = H * 0.1;
    const ph = Math.min(H * 0.8, 1040);
    drawNeonRect(panel, 36, top, W - 72, ph, 30, 0x3ef4ff, { fill: 0x0b0520, fillAlpha: 0.96 });
    c.add([dim, panel]);
    c.add(neonText(this, W / 2, top + 56, "SPIN ODDS", 40, 0x3ef4ff, { blur: 14 }));
    let y = top + 124;
    for (const r of spinOdds()) {
      c.add(plainText(this, 90, y, r.label, 22, "#ffffff").setOrigin(0, 0.5));
      c.add(plainText(this, W - 90, y, `${r.pct}%`, 22, "#ffd23f").setOrigin(1, 0.5));
      y += 44;
    }
    const names = SPIN_COSMETICS.map((id) => getCosmetic(id).name);
    const notes = [
      "A hero is rare 6 : epic 3 : legendary 1 among",
      "the heroes you don't have yet.",
      `No hero in ${SPIN_PITY - 1} spins? The next one is a hero.`,
      `Own every spin hero? Hero slices pay ${num(SPIN_HERO_COINS)} coins.`,
      `Rare cosmetic: one of ${names.length}, each equally likely:`,
      names.slice(0, 4).join(", ") + ",",
      names.slice(4).join(", ") + ".",
      "Already own it? You get half its shop price in coins.",
      "Spins are earned by playing. They can't be bought.",
    ];
    y += 10;
    for (const n of notes) {
      c.add(plainText(this, W / 2, y, n, 17, "#d8d0ff"));
      y += 29;
    }
    const ok = button(this, W / 2, top + ph - 64, 260, 84, "GOT IT", {
      color: 0x39ff88,
      size: 28,
      onClick: () => this.closeReveal(),
    });
    c.add(ok);
    this.reveal = c;
  }

  closeReveal() {
    if (!this.reveal) return;
    this.reveal.destroy();
    this.reveal = null;
    this.spinning = false;
    this.refresh();
  }

  leave() {
    if (this.spinning && !this.reveal) return; // let the wheel finish
    fadeTo(this, "Menu");
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    this.backdrop.drive(this.pal, { scroll: 60, speedNorm: 0, dim: 0.55, scenery: false });
    // the wheel moves on real elapsed time (a slow frame doesn't stretch the spin)
    this.stepSpin(Math.min(delta / 1000, 0.1));
    if (!this.anim) this.vel *= 0.8;

    // chasing rim lights: they run with the wheel (fast while it spins, a slow idle crawl).
    // Each light fades smoothly up and down rather than switching, and Reduce Flashing caps
    // the chase so no light pulses faster than ~1.5 times a second.
    const speed = Math.min(this.calm ? 4.5 : 20, 2.2 + this.vel / 45);
    this.chase += dt * speed;
    const g = this.rim;
    const gl = this.rimGlow;
    g.clear();
    gl.clear();
    const lo = this.calm ? 0.45 : 0.15;
    const glowA = this.calm ? 0.22 : 0.45;
    const tail = this.win && !this.anim; // after a win: lights hold steady, tinted
    for (let i = 0; i < LIGHTS; i++) {
      const a = (i / LIGHTS) * Math.PI * 2 - Math.PI / 2;
      const w = 0.5 + 0.5 * Math.cos(((i - this.chase) / 3) * Math.PI * 2);
      const b = tail ? 0.8 : lo + (1 - lo) * w ** 2;
      const x = this.cx + Math.cos(a) * (this.R + 1);
      const y = this.cy + Math.sin(a) * (this.R + 1);
      const col = tail ? this.win.color : 0xfff6c8;
      g.fillStyle(0x6a4a10, 1).fillCircle(x, y, 5 + b * 2.5);
      g.fillStyle(col, b);
      g.fillCircle(x, y, 5 + b * 2.5);
      if (!this.lowGfx || i % 2 === 0) {
        gl.fillStyle(col, glowA * b);
        gl.fillCircle(x, y, 13);
      }
    }

    // the pointer flaps as pegs click past, and glows as the wheel slows to a stop
    this.ptrKick *= Math.exp(-dt * 14);
    this.pointer.rotation = this.ptrKick;
    const slowing = this.anim ? Math.max(0, 1 - this.vel / 300) : 0;
    this.ptrGlow.setAlpha(slowing * (this.calm ? 0.3 : 0.6)).setScale(4);

    // the winning slice glows (a slow breathe; steady with Reduce Flashing)
    if (this.win) {
      this.win.t += dt;
      const fade = Math.min(1, this.win.t * 3);
      this.winGlow.alpha =
        fade * (this.calm ? 0.4 : 0.38 + 0.16 * (0.5 + 0.5 * Math.sin(this.win.t * 4)));
    }

    // win rays: fade in, hold, fade out; they turn slowly
    if (this.raysTarget > 0) {
      this.raysHold -= dt;
      const goal = this.raysHold > 0 ? this.raysTarget : 0;
      this.raysFade += (goal - this.raysFade) * Math.min(1, dt * 5);
      if (this.raysHold <= 0 && this.raysFade < 0.005) {
        this.raysTarget = 0;
        this.raysFade = 0;
      }
      this.rays.setAlpha(this.raysFade);
      this.rays.rotation += dt * 0.35;
    }

    // coin shower: fall, sway, spin (a coin's width shrinks and grows), gone off the bottom
    for (let i = this.shower.length - 1; i >= 0; i--) {
      const c = this.shower[i];
      c.vy += 700 * dt;
      c.img.x += c.vx * dt;
      c.img.y += c.vy * dt;
      c.ph += c.sp * dt;
      c.img.setScale(c.base * Math.max(0.15, Math.abs(Math.cos(c.ph))), c.base);
      if (c.img.y > this.H + 40) {
        c.img.destroy();
        this.shower.splice(i, 1);
      }
    }
    this.fx.update(dt);
  }
}

/**
 * The odds of every prize on the wheel (from SPIN_SLICES, so they always match the game).
 * The weights add up to 100, so these are exact and add up to 100%.
 */
export function spinOdds() {
  const total = SPIN_SLICES.reduce((a, sl) => a + sl.weight, 0);
  const rows = new Map();
  const order = { coins: 0, jackpot: 1, spins: 2, cosmetic: 3, hero: 4 };
  const slices = SPIN_SLICES.slice().sort(
    (a, b) => order[a.type] - order[b.type] || (a.amount || 0) - (b.amount || 0),
  );
  for (const sl of slices) {
    const [label, short] =
      sl.type === "coins"
        ? [`${sl.amount} coins`, `${sl.amount} coins`]
        : sl.type === "jackpot"
          ? [`JACKPOT: ${sl.amount} coins`, `Jackpot ${sl.amount}`]
          : sl.type === "spins"
            ? [`${sl.amount} free spins`, `+${sl.amount} spins`]
            : sl.type === "cosmetic"
              ? ["A rare cosmetic", "Rare cosmetic"]
              : ["A new hero", "New hero"];
    const r = rows.get(label) || { label, short, w: 0 };
    r.w += sl.weight;
    rows.set(label, r);
  }
  return [...rows.values()].map((r) => ({
    label: r.label,
    short: r.short,
    pct: Math.round((r.w / total) * 1000) / 10,
  }));
}
