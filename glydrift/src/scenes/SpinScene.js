// Lucky Spin: spend spins (earned every 1000 points) on a prize wheel — coins, or one of ten
// heroes you can only win here. The prize is rolled first; the wheel then lands on it.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, RARITY, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { getCharacter, LOTTERY_HEROES } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { Progression, SPIN_EVERY, SPIN_SLICES } from "../data/progression.js";
import { Save } from "../data/save.js";
import {
  button,
  drawNeonRect,
  hex,
  neonText,
  ProgressBar,
  plainText,
  popIn,
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
    this.R = 270;
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
    const by = this.cy + this.R + 120;
    this.spinBtn = button(this, W / 2, by, 420, 120, "SPIN", {
      color: 0x39ff88,
      size: 50,
      fill: 0x0c2a1a,
      onClick: () => this.spin(),
    }).setDepth(100);
    this.info = plainText(this, W / 2, by + 96, "", 19, "#d8d0ff").setDepth(100);
    this.bar = new ProgressBar(this, W / 2 - 180, by + 124, 360, 12, 0xffd23f).setDepth(100);
    this.heroLine = plainText(this, W / 2, by + 168, "", 18, "#ffe9a8").setDepth(100);
    popIn(this, [this.spinBtn], 150);
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
      const col = hero ? 0xff7ad9 : COLORS[i % COLORS.length];
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
    this.spinBtn.setLabel(spins > 0 ? (spins > 1 ? `SPIN  ×${spins}` : "SPIN") : "NO SPINS");
    this.spinBtn.setColor(spins > 0 ? 0x39ff88 : 0x6a608a);
    this.spinBtn.setEnabled(ready);
    const pts = s.spinPts || 0;
    this.info.setText(`Next spin: ${pts} / ${SPIN_EVERY} points  ·  every run counts`);
    this.bar.set(pts / SPIN_EVERY);
    const owned = LOTTERY_HEROES.filter((c) => s.unlocked[c.id]).length;
    this.heroLine.setText(
      owned < LOTTERY_HEROES.length
        ? `Lucky Spin heroes: ${owned} / ${LOTTERY_HEROES.length} — only found here`
        : "All 10 Lucky Spin heroes collected! Hero slices pay 1000 coins",
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

  win(prize) {
    const { cx, cy } = this;
    if (prize.type === "coins") {
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
    const img = this.add.image(W / 2, H * 0.42, def.texture).setScale(0.2 / HI);
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
    const ok = button(this, W / 2 + 130, H * 0.74, 230, 90, "COOL", {
      color: 0x3ef4ff,
      size: 30,
      onClick: () => this.closeReveal(),
    });
    c.add([dim, rays, panel, head, img, name, rar, desc, equip, ok]);
    this.tweens.add({ targets: img, scale: 2.5 / HI, duration: 650, ease: "Back.easeOut" });
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
    this.cameras.main.fadeOut(200, 5, 1, 13);
    this.time.delayedCall(200, () => this.scene.start("Menu"));
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
