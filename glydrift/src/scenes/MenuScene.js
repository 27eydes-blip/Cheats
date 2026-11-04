// Title screen: dimmed living background, the selected hero flying a figure-eight, a big
// PLAY button, the Daily Challenge with a countdown, the daily login reward and settings.
import Phaser from "phaser";
import { BIOMES, biomeStateAt, blendPalette, CLASSIC } from "../biomes/biomes.js";
import { COIN_COLOR, fitCamera, FONT, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { HI } from "../gfx/textures.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { CHARACTERS, getCharacter, onSale, saleLeft } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { TEST } from "../systems/testFlags.js";
import { Haptics } from "../systems/haptics.js";
import { Install } from "../systems/install.js";
import { Leaderboard, Levels } from "../online/leaderboard.js";
import { getCosmetic, Shop } from "../data/cosmetics.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Music } from "../audio/music.js";
import { LOGIN_REWARDS, Progression } from "../data/progression.js";
import { todayKey } from "../data/rng.js";
import { Save } from "../data/save.js";
import { Seasons } from "../data/seasons.js";
import { claimSeasonTier, DriftPass } from "../data/driftPass.js";
import { drawIcon } from "../ui/icons.js";
import { askUsername } from "../ui/nameModal.js";
import { openChest, revealHero } from "../ui/reveal.js";
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
    const lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.top = top;
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

    // ---- seasons: wrap up ended seasons (auto-claim + recap), then the live season's look
    const hk = Seasons.housekeeping(claimSeasonTier);
    this.seasonQueue = hk.recaps.map((r) => () => this.openRecap(r));
    this.season = Seasons.active();
    if (this.season) {
      this.buildSeasonTheme();
      this.buildSeasonBanner(logoY + 116);
      if (Seasons.needsHeroReveal()) this.seasonQueue.push(() => this.newHeroReveal());
    }
    this.queueT = 1.2;
    // hidden music test: tap the logo 5 times
    this.logoTaps = 0;
    this.logo.setInteractive().on("pointerdown", () => {
      this.logoTaps++;
      if (this.logoTaps >= 5) this.go("MusicTest");
    });

    // ---- hero
    this.def = getCharacter(TEST.character || s.selected);
    this.heroY = H * 0.44;
    // spotlight: a soft glow in the hero's colour that follows it around
    this.spot = this.add
      .image(W / 2, this.heroY, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.def.color)
      .setScale(3.2)
      .setAlpha(0.32)
      .setDepth(55);
    this.rig = new CharacterRig(this, this.def, this.fx, {
      x: W / 2,
      y: this.heroY,
      lowGfx,
      depth: 60,
      scale: H < 1400 ? 1.5 : 1.9,
    });
    this.flapT = 0;
    this.trickT = 5;
    this.trick = 0; // >0 while a loop-the-loop is playing
    // tap your hero: it does a trick
    this.heroZone = this.add
      .zone(W / 2, this.heroY, 220, 200)
      .setInteractive()
      .setDepth(90);
    this.heroZone.on("pointerup", () => this.doTrick(true));

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
    // tap your coins: they bounce and jingle
    this.coinIcon.setInteractive(
      new Phaser.Geom.Rectangle(-40, -40, 240, 120),
      Phaser.Geom.Rectangle.Contains,
    );
    this.coinIcon.on("pointerup", () => {
      const sc = 0.8 / HI;
      this.tweens.killTweensOf([this.coinIcon, this.coinText]);
      this.coinIcon.setScale(sc).setY(top + 40);
      this.coinText.setY(top + 40);
      this.tweens.add({
        targets: [this.coinIcon, this.coinText],
        y: top + 18,
        duration: 140,
        yoyo: true,
        ease: "Quad.easeOut",
      });
      this.tweens.add({ targets: this.coinIcon, scale: sc * 1.3, duration: 140, yoyo: true });
      this.fx.burst("star", this.coinIcon.x, this.coinIcon.y, 10, COIN_COLOR, {
        speed: { min: 80, max: 260 },
      });
      Sfx.coin?.(Math.floor(Math.random() * 6));
      Haptics.light?.();
    });
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
    this.play = play; // pulses to the music's beat (see update)
    this.beatClock = 0;
    if (s.best > 0) {
      const best = neonText(this, W / 2, by - 106, `BEAT YOUR BEST · ${s.best}`, 24, 0xffd23f, {
        blur: 10,
      }).setDepth(100);
      popIn(this, best, 250);
      this.tweens.add({
        targets: best,
        alpha: { from: 1, to: 0.8 },
        delay: 900,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
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
    // a limited-time hero on sale and not yet owned → "24H ONLY" tag; HEROES opens on it
    const limitedHero = CHARACTERS.find((c) => c.limited && onSale(c) && !s.unlocked[c.id]);
    const heroes = button(this, W / 2 - 220, by + 248, 200, 72, "HEROES", {
      color: 0xb45cff,
      size: 18,
      onClick: () => {
        if (limitedHero) this.registry.set("heroFocus", limitedHero.id);
        this.go("Characters");
      },
    }).setDepth(100);
    if (limitedHero) {
      const tag = this.add.container(W / 2 - 220 + 70, by + 248 - 42).setDepth(101);
      const tg = this.add.graphics();
      tg.fillStyle(0xff3a8a, 1).fillRoundedRect(-58, -15, 116, 30, 15);
      tg.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-58, -15, 116, 30, 15);
      const tt = this.add
        .text(0, 1, "24H ONLY", {
          fontFamily: FONT,
          fontSize: "15px",
          fontStyle: "900",
          color: "#ffffff",
        })
        .setOrigin(0.5);
      tag.add([tg, tt]);
      this.tweens.add({
        targets: tag,
        scale: 1.12,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
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
    this.time.delayedCall(520, () => {
      this.fx.burst("star", W / 2, by, 24, 0x39ff88, { speed: { min: 150, max: 520 } });
      this.fx.ring(W / 2, by, 0x39ff88, { scale: 2.6, duration: 600, width: 3 });
    });
    // ---- Lucky Spin: round wheel button beside the hero, with a spins badge
    {
      const sx = W - 96;
      const sy = H * 0.31;
      const spins = s.spins || 0;
      const wb = this.add.container(sx, sy).setDepth(100);
      const wg = this.add.graphics();
      const cols = [0x3ef4ff, 0xb45cff, 0xffd23f, 0xff4fd8];
      for (let i = 0; i < 8; i++) {
        wg.fillStyle(cols[i % 4], 0.85);
        wg.slice(0, 0, 54, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2, false).fillPath();
      }
      wg.fillStyle(0x0a0418, 1).fillCircle(0, 0, 18);
      wg.lineStyle(5, 0xffd23f, 1).strokeCircle(0, 0, 54);
      wg.fillStyle(0xffffff, 1).fillTriangle(-9, -66, 9, -66, 0, -48);
      const lbl = neonText(this, 0, 80, "LUCKY SPIN", 17, 0xffd23f, { blur: 8 });
      wb.add([wg, lbl]);
      if (spins > 0) {
        const bg = this.add.graphics();
        bg.fillStyle(0xff2a3d, 1)
          .fillCircle(42, -42, 20)
          .lineStyle(3, 0xffffff, 1)
          .strokeCircle(42, -42, 20);
        wb.add([bg, plainText(this, 42, -43, `${spins}`, 20, "#ffffff")]);
        this.tweens.add({ targets: wg, angle: 360, duration: 6000, repeat: -1 });
      }
      wb.setSize(140, 170).setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 140, 170),
        Phaser.Geom.Rectangle.Contains,
      );
      wb.on("pointerdown", () => this.tweens.add({ targets: wb, scale: 0.9, duration: 70 }));
      wb.on("pointerup", () => {
        this.tweens.add({ targets: wb, scale: 1, duration: 200, ease: "Back.easeOut" });
        Sfx.ui();
        this.go("Spin");
      });
      popIn(this, wb, 350);
    }
    // ---- Shop: a neon bag on the left, mirroring the Lucky Spin wheel
    {
      const sb = this.add.container(96, H * 0.31).setDepth(100);
      const g = this.add.graphics();
      g.fillStyle(0x0a0418, 1).fillRoundedRect(-46, -30, 92, 80, 14);
      g.lineStyle(5, 0xffd23f, 1).strokeRoundedRect(-46, -30, 92, 80, 14);
      g.lineStyle(5, 0xffd23f, 1).beginPath().arc(0, -30, 22, Math.PI, 0).strokePath();
      sb.add([g, this.add.image(0, 10, "coin").setScale(0.75 / HI)]);
      sb.add(neonText(this, 0, 80, "SHOP", 18, 0xffd23f, { blur: 8 }));
      // a red "SALE" badge for the Daily Shop deal
      const bg = this.add.graphics();
      bg.fillStyle(0xff2a3d, 1).fillRoundedRect(14, -58, 64, 28, 14);
      sb.add([bg, plainText(this, 46, -44, "SALE", 15, "#ffffff")]);
      this.tweens.add({
        targets: sb,
        angle: { from: -3, to: 3 },
        yoyo: true,
        repeat: -1,
        duration: 1200,
        ease: "Sine.easeInOut",
      });
      sb.setSize(140, 170).setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 140, 170),
        Phaser.Geom.Rectangle.Contains,
      );
      sb.on("pointerdown", () => this.tweens.add({ targets: sb, scale: 0.9, duration: 70 }));
      sb.on("pointerup", () => {
        this.tweens.add({ targets: sb, scale: 1, duration: 200, ease: "Back.easeOut" });
        Sfx.ui();
        this.go("Shop");
      });
      popIn(this, sb, 380);
    }
    // "Add to Home Screen" — hidden once you're already playing from the home screen
    const sb0 = this.registry.get("safeBottom") || 0;
    const roomy = H - sb0 - (by + 248) > 250; // most phones; small ones skip the extras
    if (roomy) this.buildToday(by + 352);
    this.buildTicker(H - sb0 - 34);
    if (Install.available) {
      const add = button(
        this,
        W / 2,
        roomy ? Math.min(H - sb0 - 100, by + 440) : Math.min(H - sb0 - 50, by + 340),
        360,
        64,
        "ADD TO HOME SCREEN",
        {
          color: 0x39ff88,
          size: 15,
          onClick: () => Install.prompt(),
        },
      ).setDepth(100);
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

  /** "Today" row: daily challenge, free drop, spins and streak — a "!" when one is ready. */
  buildToday(y) {
    const s = Save.data;
    const W = this.W;
    const played = s.daily.date === todayKey() && s.daily.attempts > 0;
    const ls = Progression.loginStatus();
    const chips = [
      {
        label: "DAILY",
        sub: played ? "played" : "new run",
        col: 0xffd23f,
        ready: !played,
        go: () => this.startGame("daily"),
      },
      {
        label: "FREE DROP",
        sub: Shop.dropReady() ? "ready!" : "tomorrow",
        col: 0x7ae82a,
        ready: Shop.dropReady(),
        go: () => this.go("Shop"),
      },
      {
        label: "SPINS",
        sub: `${s.spins || 0} left`,
        col: 0xff7ad9,
        ready: (s.spins || 0) > 0,
        go: () => this.go("Spin"),
      },
      {
        label: "STREAK",
        sub: `${ls.streak || s.login.streak || 0} days`,
        col: 0xff8a1a,
        ready: ls.canClaim,
        go: () =>
          ls.canClaim
            ? this.openLogin(Progression.loginStatus())
            : toast(this, `${s.login.streak}-DAY STREAK!`, 0xff8a1a, {
                y: this.H * 0.3,
                sub: "Come back tomorrow to keep it going",
              }),
      },
    ];
    const cw = (W - 56) / 4;
    chips.forEach((ch, i) => {
      const x = 28 + cw * i + cw / 2;
      const c = this.add.container(x, y).setDepth(100);
      const g = this.add.graphics();
      drawNeonRect(g, -cw / 2 + 5, -36, cw - 10, 72, 16, ch.col, { fillAlpha: 0.88, width: 2 });
      c.add([
        g,
        plainText(this, 0, -10, ch.label, 15, hex(ch.col)),
        plainText(this, 0, 14, ch.sub, 14, "#e8e2ff"),
      ]);
      if (ch.ready) {
        const b = this.add.container(cw / 2 - 14, -34);
        const bg = this.add.graphics();
        bg.fillStyle(0xff2a3d, 1)
          .fillCircle(0, 0, 15)
          .lineStyle(2, 0xffffff, 1)
          .strokeCircle(0, 0, 15);
        b.add([bg, plainText(this, 0, -1, "!", 18, "#ffffff")]);
        c.add(b);
        this.tweens.add({
          targets: b,
          y: -42,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          delay: i * 120,
        });
      }
      c.setSize(cw - 10, 72).setInteractive();
      c.on("pointerdown", () => this.tweens.add({ targets: c, scale: 0.92, duration: 70 }));
      c.on("pointerup", () => {
        this.tweens.add({ targets: c, scale: 1, duration: 200, ease: "Back.easeOut" });
        Sfx.ui();
        ch.go();
      });
      popIn(this, c, 420 + i * 60);
    });
  }

  /** News ticker along the bottom: sales, today's deal, your rank and the world's best. */
  buildTicker(y) {
    const W = this.W;
    const s = Save.data;
    const g = this.add.graphics().setDepth(99);
    g.fillStyle(0x0a0418, 0.85).fillRect(0, y - 24, W, 48);
    g.lineStyle(2, 0xff4fd8, 0.7).lineBetween(0, y - 24, W, y - 24);
    this.tickY = y;
    this.tickText = plainText(this, W, y, "", 18, "#ffe9a8").setOrigin(0, 0.5).setDepth(100);
    const items = [];
    for (const c of CHARACTERS)
      if (c.limited && onSale(c) && !s.unlocked[c.id]) {
        const h = Math.max(1, Math.round(saleLeft(c) / 3600000));
        items.push(`★ ${c.name} leaves in about ${h}h · get it in HEROES!`);
      }
    const xmas = CHARACTERS.filter((c) => c.season && !c.shelved && onSale(c) && !s.unlocked[c.id]);
    if (xmas.length)
      items.push(`❄ CHRISTMAS HEROES are here all December: ${xmas.length} to collect in HEROES!`);
    try {
      const deal = getCosmetic(Shop.daily().deal);
      if (deal) items.push(`SHOP DEAL: ${deal.name} 30% off today`);
    } catch {}
    const season = Seasons.active();
    if (season) {
      items.push(`SEASON ${season.number}: ${season.name} · ends in ${Seasons.countdown(season)}`);
      const r = Seasons.record(season.id);
      const left = season.event.challenges.filter((c) => !r.ev.done[c.id]);
      if (left.length) items.push(`EVENT: ${left[0].text}`);
    }
    if (Shop.dropReady()) items.push("Your free Daily Drift Drop is waiting in the SHOP");
    if ((s.spins || 0) > 0) items.push(`You have ${s.spins} Lucky Spins to use`);
    if (s.best > 0) items.push(`Your best: ${s.best} · can you beat it?`);
    this.tickItems = items.length ? items : ["Tap PLAY to drift the neon cosmos!"];
    this.tickI = -1;
    this.nextTick();
    this.tickText.setX(W * 0.35); // the first item starts on screen
    // world news (best effort; offline just keeps the local items)
    Leaderboard.board(Levels.endless(), "all")
      .then((res) => {
        if (!this.scene.isActive() || !res) return;
        const top = res.rows?.[0];
        if (top) this.tickItems.push(`WORLD #1: ${top.username} · ${top.score}`);
        if (res.me?.rank) this.tickItems.push(`You're #${res.me.rank} in the world`);
      })
      .catch(() => {});
  }

  nextTick() {
    this.tickI = (this.tickI + 1) % this.tickItems.length;
    this.tickText.setText(this.tickItems[this.tickI]).setX(this.W + 10);
  }

  /** Loop-the-loop with a sparkle burst (YARMS flexes instead). */
  doTrick(tapped = false) {
    if (this.trick > 0) return;
    this.trickT = 6 + Math.random() * 4;
    if (this.def.id === "yarms") {
      this.rig.flex?.({ big: true, shine: true });
      this.fx.burst("star", this.rig.x, this.rig.y, 20, 0xffd23f, {
        speed: { min: 150, max: 420 },
      });
      return;
    }
    this.trick = 1;
    this.rig.flap();
    this.fx.ring(this.rig.x, this.rig.y, this.def.color, { scale: 1.6, duration: 500 });
    this.fx.burst("star", this.rig.x, this.rig.y, tapped ? 22 : 14, this.def.color, {
      speed: { min: 120, max: 420 },
    });
    if (tapped) {
      Sfx.ui();
      Haptics.light?.();
    }
  }

  // ------------------------------------------------------------------ seasons
  /** The season's home look: an edge glow in its colours and drifting themed particles. */
  buildSeasonTheme() {
    const W = this.W;
    const H = this.H;
    const sc = Seasons.colors(this.season);
    const g = this.add.graphics().setDepth(2);
    g.fillGradientStyle(sc.primary, sc.primary, sc.primary, sc.primary, 0.6, 0.6, 0, 0);
    g.fillRect(0, 0, W, H * 0.34);
    g.fillGradientStyle(sc.primary, sc.primary, sc.primary, sc.primary, 0, 0, 0.6, 0.6);
    g.fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle(sc.primary, 0.1).fillRect(0, 0, W, H); // a crimson wash over everything
    this.seasonTint = g;
    this.seasonBits = [];
    const n = Save.data.settings.lowGfx ? 12 : 26;
    for (let i = 0; i < n; i++) {
      const r = this.add
        .rectangle(Math.random() * W, Math.random() * H, 6, 6, i % 3 ? sc.accent : sc.primary)
        .setDepth(3)
        .setAlpha(0.5 + Math.random() * 0.4);
      r.v = 20 + Math.random() * 50;
      r.ph = Math.random() * 6;
      this.seasonBits.push(r);
    }
  }

  /** "SEASON 1 · ABYSS RISING" banner with a countdown; it beats like a heart. */
  buildSeasonBanner(y) {
    const W = this.W;
    const s = this.season;
    const sc = Seasons.colors(s);
    const bw = 560;
    const bh = 84;
    const c = this.add.container(W / 2, y).setDepth(120);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(-bw / 2 + 4, -bh / 2 + 6, bw, bh, 18);
    g.fillStyle(sc.dark, 0.96).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 18);
    g.lineStyle(4, sc.primary, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 18);
    g.fillStyle(sc.primary, 0.35).fillRoundedRect(-bw / 2 + 6, -bh / 2 + 6, bw - 12, 14, 7);
    const glow = this.add
      .image(0, 0, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(sc.primary)
      .setScale(5, 1.2)
      .setAlpha(0.35);
    const title = neonText(this, 0, -14, `SEASON ${s.number} · ${s.name}`, 24, sc.accent, {
      blur: 10,
    });
    const tier = Math.min(s.pass.tiers.length, DriftPass.unlockedCount());
    this.seasonSub = plainText(
      this,
      0,
      20,
      `Ends in ${Seasons.countdown(s)} · Pass tier ${tier}/${s.pass.tiers.length}`,
      17,
      "#ffd8d8",
    );
    c.add([glow, g, title, this.seasonSub]);
    c.setSize(bw, bh).setInteractive();
    c.on("pointerup", () => {
      Sfx.ui();
      if (this.leaving) return;
      this.leaving = true;
      fadeTo(this, "Pass", { from: "Menu" }, { ms: 180, rgb: [2, 1, 7] });
    });
    popIn(this, c, 200);
    this.seasonBanner = c;
    this.seasonGlow = glow;
  }

  updateSeason(dt) {
    if (this.seasonBanner) {
      // heartbeat: two quick beats then a rest (gentler with Reduce Flashing)
      const ph = (this.t * 1.1) % 1;
      const beat = Math.exp(-((ph * 8) % 4) * 3) * (ph < 0.5 ? 1 : 0);
      const k = reduceFlashing() ? 0.012 : 0.04;
      this.seasonBanner.setScale(1 + beat * k);
      this.seasonGlow.setAlpha(0.25 + beat * (reduceFlashing() ? 0.1 : 0.45));
      if (Math.floor(this.t) !== Math.floor(this.t - dt)) {
        const s = this.season;
        const tier = Math.min(s.pass.tiers.length, DriftPass.unlockedCount());
        this.seasonSub.setText(
          `Ends in ${Seasons.countdown(s)} · Pass tier ${tier}/${s.pass.tiers.length}`,
        );
      }
    }
    if (this.seasonBits) {
      const home = Seasons.colors(this.season).home;
      for (const r of this.seasonBits) {
        r.ph += dt;
        if (home === "garden") {
          r.y += r.v * dt * 0.6; // petals drift down
          r.x += Math.sin(r.ph * 1.5) * 20 * dt;
        } else if (home === "storm") {
          r.y += r.v * dt * 6; // rain
          r.setSize(2, 14);
        } else r.y -= r.v * dt; // embers / sparkles rise
        if (r.y < -10) r.y = this.H + 10;
        if (r.y > this.H + 10) r.y = -10;
        if (home === "prism")
          r.setFillStyle(Phaser.Display.Color.HSVToRGB((r.ph * 0.2) % 1, 0.5, 1).color);
      }
    }
    // one season moment at a time: recaps, then the new hero reveal
    if (
      this.seasonQueue?.length &&
      !this.modal &&
      !this.naming &&
      !this.seasonBusy &&
      !this.leaving
    ) {
      this.queueT -= dt;
      if (this.queueT <= 0) {
        this.seasonBusy = true;
        Promise.resolve(this.seasonQueue.shift()()).then(() => {
          this.seasonBusy = false;
          this.queueT = 0.5;
        });
      }
    }
  }

  /** First open of a season: the NEW HERO reveal for its featured character. */
  async newHeroReveal() {
    const s = this.season;
    const def = getCharacter(s.featuredHero);
    Seasons.markHeroSeen();
    await revealHero(this, def, { title: `NEW HERO · SEASON ${s.number}` });
    const tier = s.pass.tiers.findIndex((t) => t.hero === def.id) + 1;
    toast(this, `${def.name} IS HERE`, Seasons.colors(s).accent, {
      y: this.H * 0.3,
      sub: tier ? `Reach tier ${tier} of the Season ${s.number} pass to unlock` : s.tagline,
    });
  }

  /** End of a season: what you did and what you got (unclaimed tiers were auto-claimed). */
  openRecap(r) {
    return new Promise((resolve) => {
      const W = this.W;
      const H = this.H;
      const s = r.season;
      const sc = Seasons.colors(s);
      const h = 760;
      const c = this.modalBase(h, sc.primary);
      const y0 = H / 2 - h / 2;
      c.add(neonText(this, W / 2, y0 + 56, "SEASON RECAP", 44, sc.accent, { blur: 14 }));
      c.add(plainText(this, W / 2, y0 + 100, `Season ${s.number} · ${s.name}`, 22, "#ffd8d8"));
      const rows = [
        ["Runs played", `${r.stats.runs}`],
        ["Best score", `${r.stats.best}`],
        ["Coins collected", `${r.stats.coins}`],
        ["Pass tiers reached", `${r.tiers} / ${r.total}`],
        ["Event challenges", `${r.challenges} / ${r.challengeTotal}`],
        ["Rewards auto-claimed", `${r.autoClaimed.length}`],
      ];
      rows.forEach(([k, v], i) => {
        const y = y0 + 160 + i * 52;
        c.add(plainText(this, 90, y, k, 22, "#e8e2ff", { ox: 0 }));
        c.add(neonText(this, W - 90, y, v, 26, 0xffd23f, { ox: 1, blur: 6 }));
      });
      // heroes earned this season
      const heroes = r.heroes.slice(0, 10);
      if (heroes.length) {
        c.add(plainText(this, W / 2, y0 + 486, "HEROES EARNED", 18, hex(sc.accent)));
        const step = Math.min(64, (W - 140) / heroes.length);
        heroes.forEach((d, i) => {
          const x = W / 2 + (i - (heroes.length - 1) / 2) * step;
          c.add(this.add.image(x, y0 + 540, d.texture).setScale((0.3 / HI) * PORTRAIT_K));
        });
      }
      c.add(
        button(this, W / 2, y0 + h - 70, 300, 84, "NICE!", {
          color: 0x39ff88,
          size: 30,
          onClick: () => {
            this.closeModal();
            resolve();
          },
        }),
      );
    });
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
    fadeTo(this, key, undefined, { ms: 180, rgb: [2, 1, 7] });
  }

  startGame(mode) {
    if (this.leaving || this.modal || this.naming) return;
    this.leaving = true;
    Sfx.unlock();
    fadeTo(this, "Game", { mode }, { rgb: [2, 1, 7] });
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

  async claimLogin(bx, by) {
    const res = Progression.claimLogin();
    this.closeModal();
    if (!res) return;
    // the reward comes out of a chest that shakes and bursts open
    const { x, y } = await openChest(this, this.W / 2, this.H * 0.46);
    Sfx.reward();
    // coin burst: coins pop out of the chest and fly into the coin counter
    const tx = this.coinIcon.x;
    const ty = this.coinIcon.y;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const coin = this.add
        .image(x, y, "coin")
        .setScale(0.9 / HI)
        .setDepth(500);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const r = 120 + Math.random() * 160;
      this.tweens.add({
        targets: coin,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r * 0.8,
        duration: 340,
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
              Sfx.coin(Math.min(12, Math.floor(i / 1.4)));
              Haptics.light();
              this.tweens.add({
                targets: this.coinIcon,
                scale: { from: 1.25 / HI, to: 0.8 / HI },
                duration: 160,
              });
            },
          }),
      });
    }
    this.time.delayedCall(700, () => this.coinCounter.to(Save.data.coins, 800));
    // a streak hero unlocked by this login (Bao)
    if (res.unlocks?.length)
      this.time.delayedCall(1700, () => revealHero(this, res.unlocks[0], { title: "UNLOCKED!" }));
    if (res.shardResult?.id) {
      const def = getCharacter(res.shardResult.id);
      if (res.shardResult.unlocked) {
        this.time.delayedCall(1500, () => revealHero(this, def, { title: "UNLOCKED!" }));
      } else {
        toast(this, `${def.name} SHARD`, def.color, {
          y: this.H * 0.3,
          sub: `${res.shardResult.count}/${res.shardResult.need} shards`,
        });
      }
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
    // Reduce Flashing: flashes become gentle colour fades (defaults to the device's Reduce Motion)
    const flashLabel = () => `REDUCE FLASHING: ${reduceFlashing() ? "ON" : "OFF"}`;
    const style = button(this, W / 2, y0 + 430, W - 180, 72, flashLabel(), {
      color: 0xb45cff,
      size: 18,
      onClick: () => {
        st.reduceFlash = !reduceFlashing();
        Save.write();
        style.setLabel(flashLabel());
      },
    });
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
    this.updateSeason(dt);
    // slowly cycle every biome palette; menus keep the backdrop dim and scenery hidden
    blendPalette(biomeStateAt((this.t * 18) % (500 * CLASSIC)), this.pal);
    // showcase every pixel biome on the title screen (slow crossfade every ~9 s)
    // only the first world and the furthest one you've reached (each world's art costs ~5 MB,
    // so the menu never builds them all)
    if (!this.showIds) {
      const far = Math.min(CLASSIC - 1, Save.data.stats.maxBiome || 0);
      this.showIds = far > 0 ? [BIOMES[0].id, BIOMES[far].id] : [BIOMES[0].id];
    }
    const showId = this.showIds[Math.floor(this.t / 9) % this.showIds.length];
    this.backdrop.drive(this.pal, {
      scroll: 140,
      speedNorm: 0,
      dim: 0.38,
      scenery: false,
      theme: showId,
    });
    this.fx.drift = 140 * 0.6;

    const W = this.W;
    const x = W / 2 + Math.sin(this.t * 0.9) * 110;
    const y = this.heroY + Math.sin(this.t * 1.8) * 34;
    const vy = Math.cos(this.t * 1.8) * 62;
    this.rig.setPosition(x, y);
    this.spot.setPosition(x, y + 10);
    this.heroZone.setPosition(x, y);
    if (this.trick > 0) {
      this.trick = Math.max(0, this.trick - dt / 0.8);
      this.rig.angle = -360 * Phaser.Math.Easing.Cubic.InOut(1 - this.trick);
    } else this.rig.angle = Phaser.Math.Clamp(vy * 0.25, -20, 30);
    this.trickT -= dt;
    if (this.trickT <= 0 && !this.modal) this.doTrick();
    // PLAY pulses on the beat
    this.beatClock += dt;
    if (this.play) {
      const ph = Music.beatPhase(this.beatClock);
      const k = reduceFlashing() ? 0.02 : 0.05;
      this.play.setScale(1 + k * Math.exp(-ph * 5));
    }
    if (this.tickText) {
      this.tickText.x -= dt * 120;
      if (this.tickText.x < -this.tickText.width - 20) this.nextTick();
    }
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
  }
}
