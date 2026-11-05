// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Lucky Spin: spend spins (earned every 2500 points) on a prize wheel — coins, or one of ten
// heroes you can only win here. The prize is rolled first; the wheel then lands on it.
import Phaser from "phaser";
import { PORTRAIT_K } from "../pixel/common.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { getCharacter, LOTTERY_HEROES } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { Progression, SPIN_EVERY, SPIN_MULTI_MAX, SPIN_SLICES } from "../data/progression.js";
import { Save } from "../data/save.js";
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
} from "../ui/ui.js";

const N = SPIN_SLICES.length;
const SLICE = 360 / N;
const COLORS = [0x3ef4ff, 0xb45cff, 0xffd23f, 0xff4fd8];

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
    this.fx = new Effects(this, { lowGfx: s.settings.lowGfx, depth: 300 });
    this.pal = {};
    blendPalette({ a: BIOMES[3], b: BIOMES[1], t: 0.3 }, this.pal);
    this.t = 0;
    this.spinning = false;
    this.reveal = null;

    // ---- header
    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 20,
      onClick: () => this.leave(),
    }).setDepth(100);
    neonText(this, W / 2, top + 46, "LUCKY SPIN", 38, 0xffd23f).setDepth(100);
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
    this.cy = Math.max(top + 420, H * 0.42);
    this.R = 250;
    this.wheel = this.add.container(this.cx, this.cy).setDepth(10);
    this.drawWheel();
    this.rim = this.add.graphics().setDepth(11);
    // pointer (top, pointing down into the wheel)
    const ptr = this.add.graphics().setDepth(12);
    ptr.fillStyle(0xffffff, 1).fillTriangle(-26, -this.R - 34, 26, -this.R - 34, 0, -this.R + 14);
    ptr
      .lineStyle(5, 0xff4fd8, 1)
      .strokeTriangle(-26, -this.R - 34, 26, -this.R - 34, 0, -this.R + 14);
    ptr.setPosition(this.cx, this.cy);
    this.pointer = ptr;
    // hub
    const hub = this.add.graphics().setDepth(12);
    hub.fillStyle(0x0a0418, 1).fillCircle(this.cx, this.cy, 70);
    hub.lineStyle(6, 0xffd23f, 1).strokeCircle(this.cx, this.cy, 70);
    this.hubText = neonText(this, this.cx, this.cy - 8, "", 40, 0xffd23f, { blur: 10 }).setDepth(
      13,
    );
    plainText(this, this.cx, this.cy + 30, "SPINS", 16, "#ffe9a8").setDepth(13);

    // ---- controls
    const by = this.cy + this.R + 100;
    this.spinBtn = button(this, W / 2, by, 420, 120, "SPIN", {
      color: 0x39ff88,
      size: 50,
      fill: 0x0c2a1a,
      onClick: () => this.spin(),
    }).setDepth(100);
    // multi-spin: up to 10 / 20 at once, one big spin and a results sheet
    this.multi = [10, SPIN_MULTI_MAX].map((n, i) =>
      button(this, W / 2 + (i - 0.5) * 230, by + 104, 210, 74, `×${n}`, {
        color: i ? 0xffd23f : 0xb45cff,
        size: 24,
        onClick: () => this.spinMulti(n),
      }).setDepth(100),
    );
    this.info = plainText(this, W / 2, by + 170, "", 18, "#d8d0ff").setDepth(100);
    this.bar = new ProgressBar(this, W / 2 - 180, by + 196, 360, 12, 0xffd23f).setDepth(100);
    this.heroLine = plainText(this, W / 2, by + 232, "", 17, "#ffe9a8").setDepth(100);
    popIn(this, [this.spinBtn, ...this.multi], 150);
    this.refresh();
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
      const col = hero
        ? 0xff7ad9
        : sl.type === "jackpot"
          ? 0xffd23f
          : sl.type === "spins"
            ? 0x39ff88
            : COLORS[i % COLORS.length];
      g.fillStyle(hero ? 0x3a0f3a : i % 2 ? 0x150a2e : 0x0e0722, 1);
      g.slice(0, 0, R, a0, a1, false).fillPath();
      // coloured outer band
      g.fillStyle(col, hero ? 0.9 : 0.75);
      g.slice(0, 0, R, a0, a1, false).fillPath();
      g.fillStyle(hero ? 0x3a0f3a : i % 2 ? 0x150a2e : 0x0e0722, 1);
      g.slice(0, 0, R - 18, a0, a1, false).fillPath();
      g.lineStyle(4, 0x05010d, 1);
      g.lineBetween(0, 0, Math.cos(a0) * R, Math.sin(a0) * R);
      // label, upright along the slice's centre line
      const mid = (a0 + a1) / 2;
      const lx = Math.cos(mid) * R * 0.64;
      const ly = Math.sin(mid) * R * 0.64;
      const rot = mid + Math.PI / 2;
      if (hero) {
        const q = neonText(this, lx, ly - 6, "?", 64, 0xff7ad9, { blur: 14 }).setRotation(rot);
        const t = plainText(
          this,
          Math.cos(mid) * R * 0.4,
          Math.sin(mid) * R * 0.4,
          "HERO",
          18,
          "#ffd0f0",
        );
        t.setRotation(rot);
        this.wheel.add([q, t]);
      } else if (sl.type === "spins") {
        const t = neonText(this, lx, ly, `+${sl.amount}`, 40, 0x39ff88, { blur: 10 });
        const u = plainText(
          this,
          Math.cos(mid) * R * 0.4,
          Math.sin(mid) * R * 0.4,
          "SPINS",
          17,
          "#b8ffd8",
        );
        t.setRotation(rot);
        u.setRotation(rot);
        this.wheel.add([t, u]);
      } else if (sl.type === "jackpot") {
        const t = neonText(this, lx, ly, `${sl.amount}`, 32, 0xffffff, {
          blur: 12,
          stroke: "#ffd23f",
        });
        const u = neonText(
          this,
          Math.cos(mid) * R * 0.4,
          Math.sin(mid) * R * 0.4,
          "JACKPOT",
          15,
          0xffd23f,
          { blur: 6 },
        );
        t.setRotation(rot);
        u.setRotation(rot);
        this.wheel.add([t, u]);
      } else {
        const t = neonText(this, lx, ly, `${sl.amount}`, 34, col, { blur: 8 }).setRotation(rot);
        const ci = this.add.image(Math.cos(mid) * R * 0.42, Math.sin(mid) * R * 0.42, "coin");
        ci.setScale(0.55 / HI).setRotation(rot);
        this.wheel.add([t, ci]);
      }
    }
    g.lineStyle(10, 0xffd23f, 1).strokeCircle(0, 0, R);
    g.lineStyle(3, 0xffffff, 0.6).strokeCircle(0, 0, R - 6);
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
    this.info.setText(`Next spin: ${pts} / ${SPIN_EVERY} points  ·  every run counts`);
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

  spin() {
    if (this.spinning || this.reveal) return;
    const res = Progression.spin();
    if (!res) return;
    this.spinning = true;
    this.refresh();
    Sfx.ui();
    // land on the chosen slice (a random spot inside it), after 6 full turns
    const target = -(res.slice * SLICE + SLICE / 2) + Phaser.Math.Between(-15, 15);
    const from = this.wheel.angle;
    const delta = ((((target - from) % 360) + 360) % 360) + 360 * 6;
    let last = Math.floor(from / SLICE);
    this.tweens.add({
      targets: this.wheel,
      angle: from + delta,
      duration: 4600,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        const k = Math.floor(this.wheel.angle / SLICE);
        if (k !== last) {
          last = k;
          Sfx.ui();
          this.pointer.setRotation(-0.12);
          this.tweens.add({ targets: this.pointer, rotation: 0, duration: 90 });
        }
      },
      onComplete: () => {
        this.wheel.angle %= 360;
        this.win(res.prize);
      },
    });
  }

  /** Many spins at once: roll them all, one fast spin of the wheel, then a results sheet. */
  spinMulti(n) {
    if (this.spinning || this.reveal) return;
    const results = Progression.spinMany(n);
    if (!results.length) return;
    this.spinning = true;
    this.refresh();
    Sfx.ui();
    const from = this.wheel.angle;
    const last = results[results.length - 1];
    const target = -(last.slice * SLICE + SLICE / 2);
    const delta = ((((target - from) % 360) + 360) % 360) + 360 * 9;
    let tick = Math.floor(from / SLICE);
    this.tweens.add({
      targets: this.wheel,
      angle: from + delta,
      duration: 2400,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        const k = Math.floor(this.wheel.angle / SLICE);
        if (k !== tick) {
          tick = k;
          if (k % 2 === 0) Sfx.ui();
        }
      },
      onComplete: () => {
        this.wheel.angle %= 360;
        this.showResults(results);
      },
    });
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
    const coins = results.reduce((a, r) => a + (r.prize.type === "coins" ? r.prize.amount : 0), 0);
    const free = results.reduce((a, r) => a + (r.prize.type === "spins" ? r.prize.amount : 0), 0);
    const jackpots = results.filter((r) => r.prize.jackpot).length;
    const heroes = results
      .filter((r) => r.prize.type === "hero")
      .map((r) => getCharacter(r.prize.id));

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

    // heroes won
    let y = coinRow + 120;
    if (heroes.length) {
      c.add(
        neonText(this, W / 2, y, heroes.length > 1 ? "NEW HEROES!" : "NEW HERO!", 32, 0xff7ad9, {
          blur: 12,
        }),
      );
      y += 74;
      const per = Math.min(heroes.length, 4);
      heroes.forEach((def, i) => {
        const col = i % per;
        const row = Math.floor(i / per);
        const x = W / 2 + (col - (per - 1) / 2) * 150;
        const hy = y + row * 150;
        const img = this.add.image(x, hy, def.texture).setScale((0.05 / HI) * PORTRAIT_K);
        const nm = plainText(this, x, hy + 62, def.name, 16, hex(RARITY[def.rarity].color));
        c.add([img, nm]);
        this.tweens.add({
          targets: img,
          scale: (0.9 / HI) * PORTRAIT_K,
          duration: 500,
          delay: 300 + i * 180,
          ease: "Back.easeOut",
        });
      });
      y += Math.ceil(heroes.length / per) * 150;
      Sfx.reveal();
      this.cameras.main.shake(220, 0.006);
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
          : p.jackpot
            ? 0xffd23f
            : p.type === "spins"
              ? 0x39ff88
              : 0x4a4070;
      const label =
        p.type === "hero"
          ? getCharacter(p.id).name
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
    Sfx.reward();
    this.fx.burst("star", W / 2, coinRow, 40, 0xffd23f, { speed: { min: 150, max: 600 } });
    this.coins.to(Save.data.coins, 1100);
    this.reveal = c;
  }

  win(prize) {
    const { cx, cy } = this;
    if (prize.type === "spins") {
      Sfx.reward();
      this.fx.burst("star", cx, cy - this.R, 30, 0x39ff88, { speed: { min: 150, max: 520 } });
      this.fx.floatText(cx, cy - 40, `+${prize.amount} SPINS`, "#39ff88", 56);
      this.time.delayedCall(700, () => {
        this.spinning = false;
        this.refresh();
      });
      return;
    }
    if (prize.type === "coins") {
      if (prize.jackpot) {
        this.cameras.main.shake(300, 0.01);
        this.fx.floatText(cx, cy - 120, "JACKPOT!", "#ffffff", 72);
        this.fx.burst("star", cx, cy, 70, 0xffd23f, { speed: { min: 200, max: 900 } });
      }
      Sfx.reward();
      this.fx.burst("star", cx, cy - this.R, 30, 0xffd23f, { speed: { min: 150, max: 520 } });
      this.fx.floatText(cx, cy - 40, `+${prize.amount}`, "#ffd23f", 64);
      this.coins.to(Save.data.coins, 900);
      this.time.delayedCall(700, () => {
        this.spinning = false;
        this.refresh();
      });
      return;
    }
    this.showHero(getCharacter(prize.id));
  }

  /** The big moment: a new lottery hero. */
  showHero(def) {
    const W = this.W;
    const H = this.H;
    Sfx.reward();
    this.cameras.main.shake(260, 0.008);
    this.fx.ring(this.cx, this.cy, 0xffffff, { scale: 4, duration: 900 });
    this.fx.burst("star", this.cx, this.cy, 60, def.color, { speed: { min: 200, max: 800 } });
    const c = this.add.container(0, 0).setDepth(400);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.86).setInteractive();
    const rays = this.add.graphics();
    rays.fillStyle(def.color, 0.18);
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
    rays.setPosition(W / 2, H * 0.42);
    this.tweens.add({ targets: rays, rotation: Math.PI * 2, duration: 14000, repeat: -1 });
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
    // chasing rim lights
    const g = this.rim;
    g.clear();
    const n = 24;
    const step = Math.floor(this.t * (this.spinning ? 16 : 5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const on = (i + step) % 3 === 0;
      g.fillStyle(on ? 0xfff6c8 : 0x8a6a1a, 1);
      g.fillCircle(
        this.cx + Math.cos(a) * (this.R + 1),
        this.cy + Math.sin(a) * (this.R + 1),
        on ? 7 : 5,
      );
    }
    this.fx.update(dt);
  }
}
