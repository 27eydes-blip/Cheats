// Title screen: dimmed living background, the selected hero flying a figure-eight, a big
// PLAY button, the Daily Challenge with a countdown, the daily login reward and settings.
import Phaser from "phaser";
import { BG_STYLES } from "../biomes/Background.js";
import { biomeStateAt, blendPalette } from "../biomes/biomes.js";
import { COIN_COLOR, fitCamera, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter } from "../player/characterDefs.js";
import { Sfx } from "../systems/audio.js";
import { Install } from "../systems/install.js";
import { Leaderboard } from "../systems/leaderboard.js";
import { Music } from "../systems/music.js";
import { LOGIN_REWARDS, Progression } from "../systems/progression.js";
import { todayKey } from "../systems/rng.js";
import { Save } from "../systems/save.js";
import { drawIcon } from "../ui/icons.js";
import { askUsername } from "../ui/nameModal.js";
import {
  button,
  drawNeonRect,
  hex,
  neonText,
  ProgressBar,
  plainText,
  popIn,
  RollingCounter,
  slider,
  toast,
} from "../ui/ui.js";

function countdownText() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    this.leaving = false;
    this.modal = null;
    this.post = null;
    const lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.top = top;
    if (!lowGfx && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline("GlyPostFX");
      this.post = this.cameras.main.getPostPipeline("GlyPostFX");
      if (Array.isArray(this.post)) this.post = this.post[0];
      if (this.post) this.post.params.pxScale = VIEW.Z;
    }
    this.cameras.main.fadeIn(300, 2, 1, 7);

    this.backdrop = this.scene.get("Backdrop");
    this.fx = new Effects(this, { lowGfx });
    this.pal = {};
    this.t = Math.random() * 400;
    Music.play("menu");

    // ---- logo: one text object → perfectly even letter spacing; nothing overlaps it
    const logoY = top + 150;
    this.logo = neonText(this, W / 2, logoY, "GLYDRIFT", 84, 0x3ef4ff, { blur: 22 }).setDepth(100);
    this.logo.setLetterSpacing?.(6);
    this.tagline = plainText(
      this,
      W / 2,
      logoY + 66,
      "DRIFT THE NEON COSMOS",
      20,
      "#bfb6e8",
    ).setDepth(100);
    popIn(this, this.logo, 80);
    // hidden music test: tap the logo 5 times
    this.logoTaps = 0;
    this.logo.setInteractive().on("pointerdown", () => {
      this.logoTaps++;
      if (this.logoTaps >= 5) this.go("MusicTest");
    });

    // ---- hero
    this.def = getCharacter(s.selected);
    this.heroY = H * 0.43;
    this.rig = new CharacterRig(this, this.def, this.fx, {
      x: W / 2,
      y: this.heroY,
      lowGfx,
      depth: 60,
      scale: 0.85,
    });
    this.flapT = 0;

    // ---- top bar: level + coins + settings
    const lvlNeed = Progression.xpToNext(s.level);
    const lv = neonText(this, 32, top + 36, `LV ${s.level}`, 26, 0x3ef4ff, {
      ox: 0,
      blur: 8,
    }).setDepth(100);
    this.xpBar = new ProgressBar(this, 32, top + 66, 170, 10, 0x3ef4ff).setDepth(100);
    this.xpBar.set(s.xp / lvlNeed);
    this.coinIcon = this.add
      .image(W - 236, top + 40, "coin")
      .setScale(0.8 / HI)
      .setDepth(100);
    this.coinText = neonText(this, W - 210, top + 40, `${s.coins}`, 28, COIN_COLOR, {
      ox: 0,
      blur: 8,
    }).setDepth(100);
    this.coinCounter = new RollingCounter(this, this.coinText, { value: s.coins });
    const gear = this.add
      .graphics()
      .setDepth(100)
      .setPosition(W - 50, top + 40);
    drawIcon(gear, "gear", 22, 0xd8d0ff);
    gear.setInteractive(new Phaser.Geom.Circle(0, 0, 36), Phaser.Geom.Circle.Contains);
    gear.on("pointerup", () => this.openSettings());
    popIn(this, [lv, this.coinIcon, this.coinText], 150);

    // ---- buttons: PLAY is the biggest & brightest
    const by = H * 0.66;
    const play = button(this, W / 2, by, 500, 150, "PLAY", {
      color: 0x39ff88,
      size: 66,
      fill: 0x0c2a1a,
      onClick: () => this.startGame("normal"),
    }).setDepth(100);
    this.tweens.add({
      targets: play,
      scale: 1.04,
      yoyo: true,
      repeat: -1,
      duration: 750,
      ease: "Sine.easeInOut",
    });
    if (s.best > 0) {
      const best = plainText(this, W / 2, by - 104, `BEST ${s.best}`, 22, "#cfc6ff").setDepth(100);
      popIn(this, best, 250);
    }
    const today = todayKey();
    const played = s.daily.date === today && s.daily.attempts > 0;
    this.daily = button(this, W / 2, by + 140, 380, 86, "DAILY CHALLENGE", {
      color: 0xffd23f,
      size: 22,
      sub: played
        ? `Best today ${s.daily.best} · new in ${countdownText()}`
        : `New run in ${countdownText()}`,
      onClick: () => this.startGame("daily"),
    }).setDepth(100);
    this.dailyPlayed = played;
    const heroes = button(this, W / 2 - 220, by + 248, 200, 72, "HEROES", {
      color: 0xb45cff,
      size: 18,
      onClick: () => this.go("Characters"),
    }).setDepth(100);
    const ranks = button(this, W / 2, by + 248, 220, 72, "LEADERBOARD", {
      color: 0x3ef4ff,
      size: 16,
      onClick: () => this.go("Leaderboard"),
    }).setDepth(100);
    const prog = button(this, W / 2 + 220, by + 248, 200, 72, "PROGRESS", {
      color: 0xff4fd8,
      size: 16,
      onClick: () => this.go("Progress"),
    }).setDepth(100);
    popIn(this, [play, this.daily, heroes, ranks, prog], 250);
    // "Add to Home Screen" — hidden once you're already playing from the home screen
    if (Install.available) {
      const add = button(this, W / 2, Math.min(H - 60, by + 340), 360, 64, "ADD TO HOME SCREEN", {
        color: 0x39ff88,
        size: 15,
        onClick: () => Install.prompt(),
      }).setDepth(100);
      popIn(this, add, 450);
    }
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateCountdown() });

    // ---- daily login reward (single source of truth: Progression.loginStatus)
    // first launch: pick a leaderboard name, then the daily reward
    const ls = Progression.loginStatus();
    if (!Leaderboard.username) {
      this.time.delayedCall(450, () =>
        this.promptName(true).then(() => ls.canClaim && this.openLogin(ls)),
      );
    } else if (ls.canClaim) {
      this.time.delayedCall(600, () => this.openLogin(ls));
    }

    this.input.keyboard?.on("keydown-SPACE", () => this.startGame("normal"));
  }

  /** Neon username prompt; saves locally and renames existing leaderboard rows. */
  async promptName(first = false) {
    this.naming = true;
    const name = await askUsername({
      initial: Leaderboard.username,
      cancellable: !first,
      title: first ? "PICK A NAME" : "CHANGE NAME",
    });
    this.naming = false;
    if (name && name !== Leaderboard.username) {
      Leaderboard.setUsername(name);
      toast(this, `HI, ${name.toUpperCase()}!`, 0x3ef4ff, {
        y: this.H * 0.3,
        sub: "You're on the worldwide leaderboard",
      });
    }
    return name;
  }

  updateCountdown() {
    const s = Save.data;
    this.daily.subLabel?.setText(
      this.dailyPlayed
        ? `Best today ${s.daily.best} · new in ${countdownText()}`
        : `New run in ${countdownText()}`,
    );
  }

  go(key) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(180, 2, 1, 7);
    this.time.delayedCall(180, () => this.scene.start(key));
  }

  startGame(mode) {
    if (this.leaving || this.modal || this.naming) return;
    this.leaving = true;
    Sfx.unlock();
    this.cameras.main.fadeOut(200, 2, 1, 7);
    this.time.delayedCall(200, () => this.scene.start("Game", { mode }));
  }

  // ------------------------------------------------------------------ modals
  modalBase(h, color) {
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(300);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x020107, 0.82).setInteractive();
    const g = this.add.graphics();
    drawNeonRect(g, 36, H / 2 - h / 2, W - 72, h, 26, color, { fillAlpha: 0.97 });
    c.add([dim, g]);
    this.modal = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    return c;
  }

  closeModal() {
    const c = this.modal;
    if (!c) return;
    this.tweens.add({
      targets: c,
      alpha: 0,
      duration: 160,
      onComplete: () => {
        c.destroy();
        this.modal = null;
      },
    });
  }

  openLogin(ls) {
    if (this.modal) return;
    const W = this.W;
    const H = this.H;
    const h = 470; // sized to its content
    const c = this.modalBase(h, 0xffd23f);
    const y0 = H / 2 - h / 2;
    c.add(neonText(this, W / 2, y0 + 56, "DAILY REWARD", 40, 0xffd23f, { blur: 14 }));
    c.add(
      plainText(
        this,
        W / 2,
        y0 + 100,
        `${ls.streak}-day streak · day ${ls.day} of 7`,
        22,
        "#fff2c2",
      ),
    );
    const shardFor = Progression.shardTarget();
    const cellW = 84;
    LOGIN_REWARDS.forEach((rw, i) => {
      const day = i + 1;
      const x = W / 2 + (i - 3) * (cellW + 4);
      const y = y0 + 200;
      const isToday = day === ls.day;
      const done = day < ls.day;
      const col = rw.shard ? 0x3fa9ff : 0xffd23f;
      const g = this.add.graphics();
      drawNeonRect(g, x - cellW / 2, y - 62, cellW, 124, 14, isToday ? 0xffffff : col, {
        fillAlpha: done ? 0.35 : 0.8,
        glow: isToday,
        width: isToday ? 4 : 2,
      });
      const items = [g, plainText(this, x, y - 44, `DAY ${day}`, 15, "#ffffff")];
      if (!done)
        items.push(
          this.add
            .image(x, y - 6, rw.shard ? "shardIcon" : "coin")
            .setScale((rw.shard ? 1 : 0.7) / HI),
        );
      if (rw.shard) {
        const name = shardFor ? shardFor.name : "BONUS";
        items.push(plainText(this, x, y + 32, `${name}\nSHARD`, 14, hex(col), { lineSpacing: 0 }));
      } else {
        items.push(plainText(this, x, y + 34, `${rw.coins}`, 18, hex(col)));
      }
      if (done) items.push(plainText(this, x, y - 6, "✓", 40, "#39ff88"));
      c.add(items);
      if (isToday)
        this.tweens.add({ targets: g, alpha: 0.55, yoyo: true, repeat: -1, duration: 480 });
    });
    const by = y0 + h - 86;
    const claim = button(this, W / 2, by, 440, 112, "CLAIM", {
      color: 0x39ff88,
      size: 48,
      fill: 0x0c2a1a,
      onClick: () => this.claimLogin(W / 2, by),
    });
    c.add(claim);
    popIn(this, claim, 200);
    this.tweens.add({
      targets: claim,
      scale: 1.05,
      yoyo: true,
      repeat: -1,
      duration: 600,
      delay: 700,
    });
  }

  claimLogin(x, y) {
    const res = Progression.claimLogin();
    this.closeModal();
    if (!res) return;
    Sfx.reward();
    // coin burst: coins pop out of the button and fly into the coin counter
    const tx = this.coinIcon.x;
    const ty = this.coinIcon.y;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const coin = this.add
        .image(x, y, "coin")
        .setScale(0.9 / HI)
        .setDepth(400);
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 120;
      this.tweens.add({
        targets: coin,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r * 0.7,
        duration: 320,
        ease: "Cubic.easeOut",
        onComplete: () =>
          this.tweens.add({
            targets: coin,
            x: tx,
            y: ty,
            scale: 0.5 / HI,
            duration: 420,
            delay: i * 28,
            ease: "Cubic.easeIn",
            onComplete: () => {
              coin.destroy();
              Sfx.coin();
              this.tweens.add({
                targets: this.coinIcon,
                scale: { from: 1.2 / HI, to: 0.8 / HI },
                duration: 160,
              });
            },
          }),
      });
    }
    this.fx.burst("star", x, y, 24, COIN_COLOR, { speed: { min: 200, max: 600 } });
    this.time.delayedCall(700, () => this.coinCounter.to(Save.data.coins, 800));
    if (res.shardResult?.id) {
      const def = getCharacter(res.shardResult.id);
      toast(
        this,
        res.shardResult.unlocked ? `${def.name} UNLOCKED!` : `${def.name} SHARD`,
        def.color,
        {
          y: this.H * 0.3,
          sub: res.shardResult.unlocked
            ? "Rare hero joins your roster"
            : `${res.shardResult.count}/${res.shardResult.need} shards`,
        },
      );
    }
  }

  openSettings() {
    if (this.modal) return;
    const W = this.W;
    const H = this.H;
    const st = Save.data.settings;
    const h = Install.available ? 820 : 730;
    const c = this.modalBase(h, 0x3ef4ff);
    const y0 = H / 2 - h / 2;
    c.add(neonText(this, W / 2, y0 + 56, "SETTINGS", 40, 0x3ef4ff, { blur: 14 }));
    slider(
      this,
      90,
      y0 + 150,
      W - 180,
      st.musicVol ?? 0.7,
      0x39ff88,
      (v) => {
        st.musicVol = v;
        Music.applyVolume();
      },
      { container: c, label: "MUSIC" },
    );
    slider(
      this,
      90,
      y0 + 245,
      W - 180,
      st.sfxVol ?? 0.8,
      0xffd23f,
      (v) => {
        st.sfxVol = v;
        Sfx.ui();
      },
      { container: c, label: "SOUND EFFECTS" },
    );
    const mute = button(this, W / 2 - 150, y0 + 335, 270, 72, st.muted ? "UNMUTE" : "MUTE ALL", {
      color: st.muted ? 0xff4fd8 : 0x8a80b0,
      size: 20,
      onClick: () => {
        st.muted = !st.muted;
        Music.applyVolume();
        Save.write();
        mute.setLabel(st.muted ? "UNMUTE" : "MUTE ALL");
        mute.setColor(st.muted ? 0xff4fd8 : 0x8a80b0);
      },
    });
    const gfx = button(
      this,
      W / 2 + 150,
      y0 + 335,
      270,
      72,
      `LOW GFX: ${st.lowGfx ? "ON" : "OFF"}`,
      {
        color: st.lowGfx ? 0xffd23f : 0x3ef4ff,
        size: 18,
        onClick: () => {
          st.lowGfx = !st.lowGfx;
          Save.write();
          // resolution & layers are chosen at boot, so reload to apply cleanly
          window.location.reload();
        },
      },
    );
    const styleName = { grid: "GRID", space: "DEEP SPACE", horizon: "HORIZON" };
    const style = button(
      this,
      W / 2,
      y0 + 430,
      W - 180,
      72,
      `BACKDROP: ${styleName[st.bgStyle || "grid"]}`,
      {
        color: 0xb45cff,
        size: 18,
        onClick: () => {
          const i = BG_STYLES.indexOf(st.bgStyle || "grid");
          st.bgStyle = BG_STYLES[(i + 1) % BG_STYLES.length];
          Save.write();
          style.setLabel(`BACKDROP: ${styleName[st.bgStyle]}`);
          this.scene.get("Backdrop").rebuild();
        },
      },
    );
    const done = button(this, W / 2, y0 + h - 70, 300, 80, "DONE", {
      color: 0x39ff88,
      size: 24,
      onClick: () => {
        Save.write();
        this.closeModal();
      },
    });
    const nameBtn = button(
      this,
      W / 2,
      y0 + 525,
      W - 180,
      72,
      `NAME: ${Leaderboard.username || "—"}`,
      {
        color: 0x3ef4ff,
        size: 18,
        onClick: () =>
          this.promptName(false).then(() =>
            nameBtn.setLabel(`NAME: ${Leaderboard.username || "—"}`),
          ),
      },
    );
    c.add([mute, gfx, style, nameBtn, done]);
    if (Install.available) {
      c.add(
        button(this, W / 2, y0 + 615, W - 180, 72, "ADD TO HOME SCREEN", {
          color: 0x39ff88,
          size: 16,
          onClick: () => Install.prompt(),
        }),
      );
    }
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.t += dt;
    // slowly cycle every biome palette; menus keep the backdrop dim and scenery hidden
    blendPalette(biomeStateAt((this.t * 18) % 2500), this.pal);
    this.backdrop.drive(this.pal, { scroll: 140, speedNorm: 0, dim: 0.5, scenery: false });
    this.fx.drift = 140 * 0.6;

    const W = this.W;
    const x = W / 2 + Math.sin(this.t * 0.9) * 110;
    const y = this.heroY + Math.sin(this.t * 1.8) * 34;
    const vy = Math.cos(this.t * 1.8) * 62;
    this.rig.setPosition(x, y);
    this.rig.angle = Phaser.Math.Clamp(vy * 0.25, -20, 30);
    this.flapT -= dt;
    if (this.flapT <= 0 && vy < -20) {
      this.flapT = 0.75;
      this.rig.flap();
    }
    this.rig.update(dt, 240);
    this.fx.update(dt);

    if (Math.floor(this.t * 4) % 4 === 0) {
      this.logo.setStroke(hex(this.pal.neon), this.logo.style.strokeThickness);
    }
    if (this.post) {
      const P = this.post.params;
      P.aberration = 0;
      P.glitch = 0;
      P.flash = 0;
      P.bloom = 0.8;
    }
  }
}
