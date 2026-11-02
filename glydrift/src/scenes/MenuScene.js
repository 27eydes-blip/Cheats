// Title screen: living background cycling through every biome, the selected hero flying
// a figure-eight, daily login streak popup and settings.
import Phaser from "phaser";
import { Background } from "../biomes/Background.js";
import { biomeStateAt, blendPalette } from "../biomes/biomes.js";
import { FONT } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter } from "../player/characterDefs.js";
import { Sfx } from "../systems/audio.js";
import { LOGIN_REWARDS, Progression } from "../systems/progression.js";
import { dailyNumber, todayKey } from "../systems/rng.js";
import { Save } from "../systems/save.js";
import {
  button,
  drawNeonRect,
  hex,
  neonText,
  ProgressBar,
  plainText,
  popIn,
  RollingCounter,
  toast,
} from "../ui/ui.js";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W;
    this.H = H;
    const s = Save.data;
    this.leaving = false;
    this.modal = null;
    this.post = null;
    const lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.top = top;
    this.cameras.main.setBackgroundColor(0x05010d);
    if (!lowGfx && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline("GlyPostFX");
      this.post = this.cameras.main.getPostPipeline("GlyPostFX");
      if (Array.isArray(this.post)) this.post = this.post[0];
    }
    this.cameras.main.fadeIn(350, 5, 1, 13);

    this.bg = new Background(this, { lowGfx, W, H, cover: 1.05 });
    this.fx = new Effects(this, { lowGfx });
    this.pal = {};
    this.t = Math.random() * 400;
    this.events.once("shutdown", () => this.bg.destroy());

    // logo — each letter rides a wave
    this.letters = [];
    const word = "GLYDRIFT";
    // lay letters out by their real advance widths (glyphs differ, e.g. "I")
    let cursor = 0;
    const metrics = [];
    for (const ch of word) {
      const t = neonText(this, 0, H * 0.17, ch, 88, 0x3ef4ff, { blur: 30 }).setDepth(100);
      const adv = t.width - t.padding.left - t.padding.right + 6;
      metrics.push({ t, adv });
      cursor += adv;
    }
    let x = W / 2 - cursor / 2;
    for (const { t, adv } of metrics) {
      t.x = x + adv / 2;
      x += adv;
      this.letters.push(t);
    }
    popIn(this, this.letters, 100);
    this.tagline = plainText(
      this,
      W / 2,
      H * 0.17 + 72,
      "DRIFT THE LIVING NEON COSMOS",
      18,
      "#d8d0ff",
    ).setDepth(100);

    // hero
    this.def = getCharacter(s.selected);
    this.rig = new CharacterRig(this, this.def, this.fx, {
      x: W / 2,
      y: H * 0.4,
      lowGfx,
      depth: 60,
      scale: 1.7,
    });
    this.flapT = 0;

    // top bar: level + coins + settings
    const lvlNeed = Progression.xpToNext(s.level);
    const lv = neonText(this, 36, top + 40, `LV ${s.level}`, 26, 0x3ef4ff, {
      ox: 0,
      blur: 10,
    }).setDepth(100);
    this.xpBar = new ProgressBar(this, 36, top + 66, 180, 10, 0x3ef4ff).setDepth(100);
    this.xpBar.set(s.xp / lvlNeed);
    this.coinIcon = this.add
      .image(W - 210, top + 40, "coin")
      .setScale(0.7)
      .setDepth(100);
    this.coinText = neonText(this, W - 186, top + 40, `${s.coins}`, 28, 0xffc83d, {
      ox: 0,
      blur: 10,
    }).setDepth(100);
    this.coinCounter = new RollingCounter(this, this.coinText, { value: s.coins });
    const gear = this.add
      .text(W - 46, top + 98, "⚙", { fontFamily: FONT, fontSize: "40px", color: "#ffffff" })
      .setOrigin(0.5)
      .setDepth(100);
    gear.setShadow(0, 0, "#3ef4ff", 12, true, true).setInteractive({ useHandCursor: true });
    gear.on("pointerup", () => this.openSettings());
    popIn(this, [lv, this.coinIcon, this.coinText, gear], 200);

    // buttons
    const by = H * 0.62;
    const play = button(this, W / 2, by, 440, 124, "PLAY", {
      color: 0x39ff88,
      size: 54,
      onClick: () => this.startGame("normal"),
    }).setDepth(100);
    this.tweens.add({
      targets: play,
      scale: 1.04,
      yoyo: true,
      repeat: -1,
      duration: 800,
      ease: "Sine.easeInOut",
    });
    const today = todayKey();
    const dPlayed = s.daily.date === today && s.daily.attempts > 0;
    const daily = button(this, W / 2, by + 150, 440, 100, `DAILY #${dailyNumber()}`, {
      color: 0xffd23f,
      size: 30,
      sub: dPlayed ? `Today's best: ${s.daily.best}` : "Same run for everyone · NEW",
      onClick: () => this.startGame("daily"),
    }).setDepth(100);
    const heroes = button(this, W / 2 - 112, by + 278, 212, 92, "HEROES", {
      color: 0xb45cff,
      size: 26,
      onClick: () => this.go("Characters"),
    }).setDepth(100);
    const prog = button(this, W / 2 + 112, by + 278, 212, 92, "PROGRESS", {
      color: 0xff4fd8,
      size: 24,
      onClick: () => this.go("Progress"),
    }).setDepth(100);
    popIn(this, [play, daily, heroes, prog], 350);

    const best = plainText(
      this,
      W / 2,
      by - 100,
      s.best > 0 ? `BEST ${s.best}` : "TAP PLAY TO BEGIN",
      20,
      "#cfc6ff",
    ).setDepth(100);
    popIn(this, best, 300);

    // daily login streak
    const ls = Progression.loginStatus();
    if (ls.canClaim) this.time.delayedCall(700, () => this.openLogin(ls));

    this.input.keyboard?.on("keydown-SPACE", () => this.startGame("normal"));
  }

  go(key) {
    this.cameras.main.fadeOut(200, 5, 1, 13);
    this.time.delayedCall(200, () => this.scene.start(key));
  }

  startGame(mode) {
    if (this.leaving || this.modal) return;
    this.leaving = true;
    Sfx.unlock();
    this.cameras.main.fadeOut(220, 5, 1, 13);
    this.time.delayedCall(220, () => this.scene.start("Game", { mode }));
  }

  // ------------------------------------------------------------------ modals
  modalBase(h, color) {
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(300);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.8).setInteractive();
    const g = this.add.graphics();
    drawNeonRect(g, 40, H / 2 - h / 2, W - 80, h, 28, color, { fillAlpha: 0.95 });
    c.add([dim, g]);
    this.modal = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 200 });
    return c;
  }

  closeModal() {
    const c = this.modal;
    if (!c) return;
    this.tweens.add({
      targets: c,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        c.destroy();
        this.modal = null;
      },
    });
  }

  openLogin(ls) {
    const W = this.W;
    const H = this.H;
    const c = this.modalBase(560, 0xffd23f);
    const y0 = H / 2 - 280;
    c.add(neonText(this, W / 2, y0 + 64, "DAILY REWARD", 44, 0xffd23f));
    c.add(
      plainText(this, W / 2, y0 + 112, `${ls.streak}-day streak · keep it alive!`, 20, "#fff2c2"),
    );
    const cellW = 80;
    LOGIN_REWARDS.forEach((rw, i) => {
      const day = i + 1;
      const x = W / 2 + (i - 3) * (cellW + 8);
      const y = y0 + 230;
      const isToday = day === ls.day;
      const done = day < ls.day;
      const col = rw.shard ? 0x3fa9ff : 0xffd23f;
      const g = this.add.graphics();
      drawNeonRect(g, x - cellW / 2, y - 66, cellW, 132, 14, isToday ? 0xffffff : col, {
        fillAlpha: done ? 0.3 : 0.75,
        glow: isToday,
        width: isToday ? 4 : 2,
      });
      const items = [g, plainText(this, x, y - 44, `DAY ${day}`, 13, "#ffffff")];
      items.push(
        this.add.image(x, y - 2, rw.shard ? "shardIcon" : "coin").setScale(rw.shard ? 1 : 0.7),
      );
      items.push(plainText(this, x, y + 42, rw.shard ? "SHARD" : `${rw.coins}`, 15, hex(col)));
      if (done) items.push(plainText(this, x, y - 2, "✔", 40, "#39ff88"));
      c.add(items);
      if (isToday)
        this.tweens.add({ targets: g, alpha: 0.6, yoyo: true, repeat: -1, duration: 500 });
    });
    const claim = button(this, W / 2, y0 + 420, 340, 96, "CLAIM", {
      color: 0x39ff88,
      size: 36,
      onClick: () => {
        const res = Progression.claimLogin();
        if (!res) return this.closeModal();
        this.fx.burst("star", W / 2, y0 + 420, 30, 0xffd23f, { speed: { min: 200, max: 600 } });
        this.coinCounter.to(Save.data.coins, 900);
        if (res.shardResult?.id) {
          const def = getCharacter(res.shardResult.id);
          toast(
            this,
            res.shardResult.unlocked ? `${def.name} UNLOCKED!` : `${def.name} SHARD`,
            def.color,
            {
              y: this.H * 0.28,
              sub: res.shardResult.unlocked
                ? "Rare character joins your roster"
                : `${res.shardResult.count}/${res.shardResult.need} shards`,
            },
          );
        } else {
          toast(this, `+${res.coins} COINS`, 0xffd23f, {
            y: this.H * 0.28,
            sub: `Day ${res.day} reward`,
          });
        }
        this.closeModal();
      },
    });
    c.add(claim);
    popIn(this, claim, 300);
  }

  openSettings() {
    if (this.modal) return;
    const W = this.W;
    const H = this.H;
    const s = Save.data.settings;
    const c = this.modalBase(470, 0x3ef4ff);
    const y0 = H / 2 - 235;
    c.add(neonText(this, W / 2, y0 + 64, "SETTINGS", 44, 0x3ef4ff));
    const gfx = button(this, W / 2, y0 + 170, 460, 86, `LOW GRAPHICS: ${s.lowGfx ? "ON" : "OFF"}`, {
      color: s.lowGfx ? 0xffd23f : 0x3ef4ff,
      size: 24,
      onClick: () => {
        s.lowGfx = !s.lowGfx;
        Save.write();
        this.scene.restart();
      },
    });
    const snd = button(this, W / 2, y0 + 270, 460, 86, `SOUND: ${s.sound ? "ON" : "OFF"}`, {
      color: s.sound ? 0x39ff88 : 0xff4fd8,
      size: 24,
      onClick: () => {
        s.sound = !s.sound;
        Save.write();
        snd.setLabel(`SOUND: ${s.sound ? "ON" : "OFF"}`);
        snd.setColor(s.sound ? 0x39ff88 : 0xff4fd8);
      },
    });
    const close = button(this, W / 2, y0 + 380, 300, 80, "DONE", {
      color: 0xff4fd8,
      size: 26,
      onClick: () => this.closeModal(),
    });
    c.add([gfx, snd, close]);
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    // cycle through all biomes so the menu shows off every palette
    const meters = (this.t * 22) % 2500;
    blendPalette(biomeStateAt(meters), this.pal);
    this.bg.update(dt, 180, this.pal, { speedNorm: 0.25, zoom: 1 });
    this.fx.drift = 180 * 0.6;

    // figure-eight flight with auto flaps
    const W = this.W;
    const H = this.H;
    const x = W / 2 + Math.sin(this.t * 0.9) * 90;
    const y = H * 0.4 + Math.sin(this.t * 1.8) * 40;
    const vy = Math.cos(this.t * 1.8) * 72;
    this.rig.setPosition(x, y);
    this.rig.angle = Phaser.Math.Clamp(vy * 0.25, -20, 30);
    this.flapT -= dt;
    if (this.flapT <= 0 && vy < -20) {
      this.flapT = 0.75;
      this.rig.flap();
    }
    this.rig.update(dt, 260);
    this.fx.update(dt);

    this.letters.forEach((l, i) => {
      l.y = this.H * 0.17 + Math.sin(this.t * 2.4 + i * 0.55) * 7;
      const c = this.pal.neon;
      if (i === 0 || Math.floor(this.t * 10) % 8 === 0) {
        l.setStroke(hex(c), 6);
        l.setShadow(0, 0, hex(c), 30, true, true);
      }
    });
    if (this.post) {
      const P = this.post.params;
      P.aberration = 0.0015;
      P.glitch = this.pal.glitch * 0.12;
      P.pulse = (this.bg.beat || 0) * 0.7;
      P.flash = 0;
      P.bloom = 1;
      P.vignette = 0.45;
    }
  }
}
