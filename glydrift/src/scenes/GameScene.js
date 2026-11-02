// The run itself: world scroll, biomes, obstacles, player, ghost, juice, post-FX.
// UI lives in the parallel Hud scene so the camera zoom / post-FX never touch it.
import Phaser from "phaser";
import { BIOMES, biomeStateAt, blendPalette, lerpColor } from "../biomes/biomes.js";
import { fitCamera, NEAR_MISS, PHYSICS, POST_FX, speedForMeters, VIEW, WORLD } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { ObstacleManager } from "../obstacles/ObstacleManager.js";
import { darknessTexture } from "../pixel/hazardArt.js";
import { pixelPerfectZoom, S } from "../pixel/px.js";
import { Terrain } from "../pixel/Terrain.js";
import { THEMES, themeFor } from "../pixel/themes.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { getCharacter } from "../player/characterDefs.js";
import { Player } from "../player/Player.js";
import { Sfx } from "../systems/audio.js";
import { Leaderboard } from "../systems/leaderboard.js";
import { Music } from "../systems/music.js";
import { BIOME_TRACKS } from "../systems/musicTracks.js";
import { Progression } from "../systems/progression.js";
import { dailySeed, todayKey } from "../systems/rng.js";
import { Save } from "../systems/save.js";

const GHOST_STEP = 8;
const CALM_M = 150; // last meters of the Glitch Realm before the Abyss: The Calm
const ABYSS_SPIKE = 1.28; // speed jump entering the Abyss
const DARK_R = 340; // Abyss light radius around the player
const COIN_BONUS = 10;
// ?god in the URL makes the player invincible (handy for testing / capturing screenshots)
const DEBUG_GOD =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("god"); // px of distance per ghost sample
const PAL_KEYS = [
  "sky0",
  "sky1",
  "sky2",
  "neb0",
  "neb1",
  "neon",
  "neon2",
  "accent",
  "planet",
  "island",
  "particleColor",
];

export class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
  }

  init(data) {
    this.mode = data?.mode === "daily" ? "daily" : "normal";
  }

  create() {
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.lowGfx = Save.data.settings.lowGfx;
    // scene instances are reused across restarts: clear per-visit references
    this.ghostRig = null;
    // transparent gameplay camera drawn over the Backdrop scene (bloom = gameplay only)
    fitCamera(this);
    this.backdrop = this.scene.get("Backdrop");
    this.hazardList = [];
    this.hazardScreen = [];

    // post FX
    this.post = null;
    if (POST_FX && !this.lowGfx && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline("GlyPostFX");
      this.post = this.cameras.main.getPostPipeline("GlyPostFX");
      if (Array.isArray(this.post)) this.post = this.post[0];
    }
    this.fxState = { aberration: 0, glitchSpike: 0, flash: 0, zoomPunch: 0 };

    this.charDef = getCharacter(Save.data.selected);
    this.fx = new Effects(this, { lowGfx: this.lowGfx });
    this.obstacles = new ObstacleManager(this, this.fx, {
      W,
      H,
      lowGfx: this.lowGfx,
      heroColor: this.charDef.color,
    });
    this.obstacles.prewarm();
    this.obstacles.onImpact = (o) => {
      if (Math.abs(o.x - this.player.x) < 260) this.cameras.main.shake(90, 0.004);
    };

    // pixel-art terrain walls along both screen edges (spiked surface = the existing kill line)
    this.terrain = new Terrain(this, themeFor("void"), { W, H });
    // camera zoom chosen so every art pixel is a whole number of screen pixels
    this.pxZoomLevel = pixelPerfectZoom(VIEW.Z, WORLD.baseZoom) / VIEW.Z;
    this.cameras.main.roundPixels = true;
    this.terrain.setView(this.pxZoomLevel);
    this.terrain.prebuild(Object.values(THEMES));

    this.pal = {};
    this.fromPal = null;
    this.palMix = 0;

    this.player = new Player(this, this.charDef, this.fx, {
      x: W * WORLD.playerXFrac,
      y: H * 0.45,
      lowGfx: this.lowGfx,
    });

    // The Calm / Abyss layers: edge darkening, blackout, limited-vision darkness
    this.calmVig = this.add
      .image(W / 2, H / 2, "vignette")
      .setDisplaySize(W * 1.5, H * 1.5)
      .setTintFill(0x000000)
      .setDepth(50)
      .setAlpha(0);
    this.blackout = this.add
      .rectangle(W / 2, H / 2, W * 3, H * 3, 0x000000)
      .setDepth(60)
      .setAlpha(0);
    this.redFlash = this.add
      .rectangle(W / 2, H / 2, W * 3, H * 3, 0xff0820)
      .setDepth(59)
      .setAlpha(0);
    const DS = 1024;
    if (!this.textures.exists("abyss_dark")) darknessTexture(this, "abyss_dark", DS, DS, DARK_R);
    this.dark = [this.add.image(0, 0, "abyss_dark")];
    for (let i = 0; i < 4; i++) this.dark.push(this.add.rectangle(0, 0, 10, 10, 0x020004));
    for (const d of this.dark) d.setDepth(20).setAlpha(0).setVisible(false);
    this.darkSize = DS;
    this.desat = null;

    this.input.on("pointerdown", (p) => this.onTap(p));
    this.input.keyboard?.on("keydown-SPACE", () => this.onTap());
    this.input.keyboard?.on("keydown-UP", () => this.onTap());

    this.game.events.on("hidden", this.onHidden, this);
    this.events.once("shutdown", () => {
      this.game.events.off("hidden", this.onHidden, this);
    });

    this.scene.launch("Hud", { game: this });
    this.hud = this.scene.get("Hud");
    this.resetRun(false);
  }

  // ------------------------------------------------------------------ run lifecycle
  resetRun(autoStart) {
    const W = this.W;
    if (this.pal.sky0 !== undefined) {
      this.fromPal = {};
      for (const k of PAL_KEYS) this.fromPal[k] = this.pal[k];
      this.palMix = 1;
    }
    this.state = "ready";
    this.distance = 0; // px
    this.meters = 0;
    this.clock = 0;
    this.speed = WORLD.baseSpeed;
    this.scroll = WORLD.baseSpeed;
    this.timeScale = 1;
    this.slowT = 0;
    this.deathT = 0;
    this.bonus = 0;
    this.combo = 0;
    this.comboT = 0;
    this.lastSpeedTier = 0;
    this.biomeIndex = 0;
    this.announcedBiome = 0;
    this.speedMul = 1;
    this.calmK = 0;
    this.blackoutT = 0;
    this.darkA = 0;
    this.inZone = false;
    this.inAbyss = false;
    this.calmVig.setAlpha(0);
    this.blackout.setAlpha(0);
    this.redFlash.setAlpha(0);
    for (const d of this.dark) d.setAlpha(0).setVisible(false);
    this.setDesat(0);
    Music.endCalm();
    this.passedBest = false;
    this.ghostDone = false;
    this.missionAnnounced = new Set();
    this.missionCheckT = 0;
    this.run = {
      mode: this.mode,
      char: this.charDef.id,
      distance: 0,
      score: 0,
      coins: 0,
      nearMiss: 0,
      lasers: 0,
      saws: 0,
      portals: 0,
      flaps: 0,
      biome: 0,
      ghost: null,
      runTimeMs: 0,
    };
    this.ghostRec = [];
    this.nextGhostSample = 0;

    const seed = this.mode === "daily" ? dailySeed() : (Math.random() * 2 ** 32) >>> 0;
    this.obstacles.reset(seed);
    this.fx.clear();
    this.player.reset();
    this.zoomLevel = this.pxZoomLevel;
    this.cameras.main.setZoom(VIEW.Z * this.pxZoomLevel);
    this.setupGhost();
    this.hudReady?.onReset?.();
    Music.play(BIOME_TRACKS[0], { startBar: 8 });
    if (autoStart) this.startRun();
  }

  setupGhost() {
    const s = Save.data;
    let data = s.ghost;
    let charId = s.ghostChar;
    this.bestScore = s.best;
    if (this.mode === "daily") {
      const today = todayKey();
      data = s.daily.date === today ? s.daily.ghost : null;
      charId = s.daily.ghostChar;
      this.bestScore = s.daily.date === today ? s.daily.best : 0;
    }
    // ghost replay turned off (best runs are still recorded, just not shown)
    this.ghostData = null;
    void data;
    if (this.ghostRig && this.ghostRig.def.id !== charId) {
      this.ghostRig.destroy();
      this.ghostRig = null;
    }
    if (this.ghostData) {
      if (!this.ghostRig) {
        this.ghostRig = new CharacterRig(this, getCharacter(charId), null, {
          ghost: true,
          depth: 26,
          x: this.player.x,
          y: this.H / 2,
        });
      }
      this.ghostRig.reset(this.player.x, this.ghostData[0]);
      this.ghostRig.sprite.setAlpha(0.3);
    } else if (this.ghostRig) {
      this.ghostRig.setVisible(false);
      this.ghostRig.trailG.clear();
    }
  }

  startRun() {
    this.state = "playing";
    this.player.flap();
    this.run.flaps++;
    Sfx.flap(this.charDef.id);
    this.hudReady?.onStart?.();
  }

  onTap(pointer) {
    Sfx.unlock();
    if (this.hudReady?.isOverHud?.(pointer)) return;
    if (this.state === "ready") this.startRun();
    else if (this.state === "playing") {
      this.player.flap();
      this.run.flaps++;
      Sfx.flap(this.charDef.id);
    }
  }

  onHidden() {
    if (this.state === "playing") this.hudReady?.pause?.();
  }

  // ------------------------------------------------------------------ events
  nearMiss(o) {
    this.run.nearMiss++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 2.5;
    const pts = NEAR_MISS.bonus * this.combo;
    this.bonus += pts;
    this.slowT = NEAR_MISS.slowTime;
    this.fxState.flash = Math.max(this.fxState.flash, 0.28);
    this.fxState.zoomPunch = 0.035;
    const p = this.player;
    this.fx.floatText(
      p.x + 40,
      p.y - 50,
      this.combo > 1 ? `CLOSE! x${this.combo}` : "CLOSE!",
      "#ffffff",
      40,
    );
    this.fx.burst("star", p.x, p.y, 10, 0xffffff, { speed: { min: 120, max: 300 } });
    this.fx.ring(p.x, p.y, 0xffffff, { scale: 0.9, duration: 300 });
    Sfx.near();
    this.hudReady?.onNearMiss?.(pts, this.combo);
  }

  portal(o) {
    const p = this.player;
    this.run.portals++;
    Sfx.portal();
    const col = { flip: 0xff4fd8, restore: 0x39ff88, mini: 0xffd23f }[o.mode];
    this.fx.ring(o.x, o.y, col, { scale: 1.4, duration: 500, width: 2 });
    this.fx.burst("star", p.x, p.y, 16, col);
    this.fxState.aberration = Math.max(this.fxState.aberration, 0.02);
    if (o.mode === "flip") {
      p.flipGravity(-1);
      this.fx.floatText(p.x + 50, p.y - 60, "GRAVITY FLIP", "#ff9ce8", 30);
    } else if (o.mode === "restore") {
      p.flipGravity(1);
      this.fx.floatText(p.x + 50, p.y - 60, "GRAVITY RESTORED", "#9cffc4", 26);
    } else {
      p.makeMini();
      this.fx.floatText(p.x + 50, p.y - 60, "MINI!", "#ffe27a", 34);
    }
    this.hudReady?.onPortal?.(o.mode);
  }

  die() {
    if (this.state !== "playing" || DEBUG_GOD) return;
    this.state = "dying";
    this.deathT = 0;
    const hints = this.player.die();
    Sfx.death();
    Music.endCalm(true);
    Music.deathSweep();
    if (navigator.vibrate) navigator.vibrate(60);
    this.cameras.main.shake(320, hints.shake);
    this.fxState.flash = Math.max(this.fxState.flash, hints.flash);
    this.fxState.glitchSpike = Math.max(this.fxState.glitchSpike, hints.glitch);
    this.fxState.aberration = Math.max(this.fxState.aberration, hints.aberration);
    this.slowT = 0.5;
    this.run.distance = Math.floor(this.meters);
    this.run.score = this.score;
    this.run.nearBonus = this.bonus;
    this.run.coinBonus = this.run.coins * COIN_BONUS;
    this.run.ghost = this.ghostRec;
    this.hudReady?.onDeath?.();
  }

  finishRun() {
    this.state = "dead";
    // music drops back to normal after the run (the Abyss track never lingers)
    if (this.inAbyss) Music.play(BIOME_TRACKS[0], { startBar: 8 });
    const result = Progression.commitRun(this.run);
    // upload in the background — never awaited, never blocks retry
    result.upload = Leaderboard.submitRun(this.run);
    this.scene.launch("GameOver", { result, game: this });
    this.scene.bringToTop("GameOver");
  }

  get hudReady() {
    return this.hud?.ready && this.hud.sys.isActive() ? this.hud : null;
  }

  /** Score = distance + close-call bonuses + coin bonuses (so it differs from distance). */
  get score() {
    return Math.floor(this.meters) + this.bonus + this.run.coins * COIN_BONUS;
  }

  // ------------------------------------------------------------------ main loop
  update(time, deltaMs) {
    const rawDt = Math.min(deltaMs / 1000, 1 / 30);
    this.watchFrameRate(deltaMs);

    // slow-mo (near-miss & death) eases back to real time
    if (this.slowT > 0) {
      this.slowT -= rawDt;
      const target = this.state === "dying" ? 0.25 : NEAR_MISS.slowScale;
      this.timeScale += (target - this.timeScale) * Math.min(1, rawDt * 30);
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 8);
    }
    // blackout before the Abyss: the world holds still for half a second
    let freeze = false;
    if (this.blackoutT > 0) {
      this.blackoutT -= rawDt;
      freeze = true;
      if (this.blackoutT <= 0) this.enterAbyss();
    }
    const dt = freeze ? 0 : rawDt * this.timeScale;
    this.fx.setTimeScale(this.timeScale);
    this.tweens.timeScale = 1;

    const playing = this.state === "playing";
    const dying = this.state === "dying";

    // speed & distance
    if (playing) {
      this.updateSpeedMul(rawDt, freeze);
      this.speed = speedForMeters(this.meters) * this.speedMul;
      this.scroll = this.speed;
    } else if (this.state === "ready") {
      this.scroll = WORLD.baseSpeed * 0.55;
    } else {
      this.scroll *= Math.exp(-rawDt * 1.6);
    }
    if (playing) {
      this.run.runTimeMs += rawDt * 1000;
      this.distance += this.scroll * dt;
      this.meters = this.distance / WORLD.pxPerMeter;
    }
    this.clock += dt;
    const speedNorm = Phaser.Math.Clamp((this.speed - WORLD.baseSpeed) / WORLD.speedGain, 0, 1);
    // music layers follow speed (more drums & synths as you go faster)
    Music.setIntensity(this.state === "playing" ? 0.15 + speedNorm * 0.85 : 0.1);

    // biome palette (with a smooth blend back to Neon Void after a restart)
    let bs = biomeStateAt(this.meters);
    const BL = WORLD.biomeLength;
    const raw0 = Math.floor(this.meters / BL);
    const local0 = this.meters - raw0 * BL;
    // The Calm: hold the Glitch Realm (no morph) until the blackout at the Abyss border
    const calm = raw0 % 5 === 3 && local0 > BL - CALM_M;
    if (calm) bs = { a: bs.a, b: bs.b, t: 0, rawIndex: raw0 };
    // stop spawning a little before The Calm so it starts with an empty screen
    const preCalm = raw0 % 5 === 3 && local0 > BL - CALM_M - 35;
    this.calm = calm && playing;
    this.calmK = calm ? Phaser.Math.Clamp((local0 - (BL - CALM_M)) / CALM_M, 0, 1) : 0;
    blendPalette(bs, this.pal);
    if (this.palMix > 0 && this.fromPal) {
      this.palMix = Math.max(0, this.palMix - rawDt * 1.4);
      for (const k of PAL_KEYS) this.pal[k] = lerpColor(this.pal[k], this.fromPal[k], this.palMix);
    }
    if (playing && bs.rawIndex !== this.biomeIndex) {
      this.biomeIndex = bs.rawIndex;
      if (bs.rawIndex % 5 === 4) {
        // the Abyss: blackout first, then the slam (see enterAbyss)
        this.run.biome = Math.max(this.run.biome, 4);
        this.blackoutT = 0.5;
        this.blackout.setAlpha(1);
        this.calmVig.setAlpha(0);
        Music.endCalm(true);
        this.hudReady?.setBlackout?.(true);
      }
    }
    if (this.blackoutT <= 0 && playing && bs.rawIndex !== this.announcedBiome) {
      const abyss = bs.rawIndex % 5 === 4;
      this.announcedBiome = bs.rawIndex;
      this.run.biome = Math.max(this.run.biome, Math.min(bs.rawIndex, 4));
      this.fxState.aberration = Math.max(this.fxState.aberration, 0.03);
      this.fxState.glitchSpike = Math.max(this.fxState.glitchSpike, 0.3);
      if (!abyss) {
        Sfx.biome();
        Music.play(BIOME_TRACKS[bs.rawIndex % BIOME_TRACKS.length], { startBar: 8 });
        this.hudReady?.onBiome?.(bs.rawIndex);
      }
    }
    // speed-up pulses every 250m
    const tier = Math.floor(this.meters / 250);
    if (playing && tier > this.lastSpeedTier) {
      this.lastSpeedTier = tier;
      this.fxState.aberration = Math.max(this.fxState.aberration, 0.022);
      if (tier % 2 === 1) this.hudReady?.onSpeedUp?.();
    }

    // camera zoom-out with speed (+ punch-in on near-miss)
    // fixed pixel-perfect zoom (a drifting zoom would make the pixel grid shimmer)
    const cam = this.cameras.main;
    this.zoomLevel = this.pxZoomLevel;
    cam.setZoom(VIEW.Z * this.zoomLevel);

    // world: drive the shared backdrop (hazard x-ranges in screen space keep scenery out
    // from behind hazards)
    const zl = this.zoomLevel;
    const hb = this.obstacles.hazardBounds(this.hazardList);
    this.hazardScreen.length = hb.length;
    for (let i = 0; i < hb.length; i++) {
      this.hazardScreen[i] = [
        this.W / 2 + (hb[i][0] - this.W / 2) * zl,
        this.W / 2 + (hb[i][1] - this.W / 2) * zl,
      ];
    }
    // pixel biome art follows the dominant biome (walls + backdrop crossfade on change)
    const biomeId = BIOMES[bs.rawIndex % BIOMES.length].id;
    this.terrain.setTheme(themeFor(biomeId));
    this.backdrop.drive(this.pal, {
      scroll: dt > 0 ? this.scroll * this.timeScale : 0,
      speedNorm,
      dim: 0,
      hazards: this.hazardScreen,
      theme: biomeId,
      particleSpeed: 1 - this.calmK * 0.8,
    });
    this.fx.drift = this.scroll * 0.7;

    // player
    const p = this.player;
    if (this.state === "ready") p.hover(dt, this.scroll);
    else p.update(dt, this.scroll);

    // spawn windows: keep biome titles clear, no hazards in The Calm, gentle Abyss start
    const info = this.obstacles.info;
    info.rawIndex = bs.rawIndex;
    info.local = this.meters - bs.rawIndex * BL;
    const titleWin = this.meters > 100 && (local0 > BL - 85 || local0 < 50);
    info.pause = playing && (calm || preCalm || titleWin || this.blackoutT > 0);
    info.grace = raw0 % 5 === 4 && local0 < 120;
    this.updateCalmFx(rawDt);

    const ev = this.obstacles.update(dt, this.clock, this.scroll, null, {
      px: p.x,
      py: p.y,
      r: p.radius,
      alive: playing,
      meters: this.meters,
      biomeId: bs.b && bs.t > 0.5 ? bs.b.id : bs.a.id,
      zoom: this.zoomLevel,
    });

    if (playing) {
      // ghost recording
      while (this.distance >= this.nextGhostSample) {
        this.ghostRec.push(Math.round(p.y));
        this.nextGhostSample += GHOST_STEP;
      }
      for (const o of ev.passed) {
        if (o.type === "laser") this.run.lasers++;
        if (o.type === "saw") this.run.saws++;
      }
      if (ev.portal) this.portal(ev.portal);
      // Glitch Realm gravity-flip zones (harmless; flip only while inside)
      if (ev.zone !== this.inZone) {
        this.inZone = ev.zone;
        if (ev.zone) {
          p.flipGravity(-1);
          Sfx.portal();
          this.fx.floatText(p.x + 50, p.y - 60, "FLIP ZONE", "#ff9ce8", 28);
        } else if (!this.obstacles.flipped) p.flipGravity(1);
      }
      if (ev.coins) {
        this.run.coins += ev.coins;
        Sfx.coin();
        this.hudReady?.onCoin?.(this.run.coins);
      }
      for (const o of ev.near) this.nearMiss(o);
      const r = p.radius;
      if (ev.hit || p.y < -r * 0.6 || p.y > this.H + r * 0.6) this.die();

      if (this.comboT > 0) this.comboT -= dt;
      this.run.distance = Math.floor(this.meters);
      this.run.score = this.score;

      if (!this.passedBest && this.bestScore > 0 && this.score > this.bestScore) {
        this.passedBest = true;
        this.hudReady?.onNewBest?.();
        this.fx.burst("star", p.x, p.y, 24, 0xffd23f, { speed: { min: 150, max: 420 } });
      }
      this.missionCheckT -= rawDt;
      if (this.missionCheckT <= 0) {
        this.missionCheckT = 0.4;
        for (const m of Progression.liveMissionCheck(this.run, this.missionAnnounced))
          this.hudReady?.onMission?.(m);
      }
    }

    // ghost playback
    this.updateGhost(dt);

    // dying → game over
    if (dying) {
      this.deathT += rawDt;
      if (this.deathT > 0.85) this.finishRun();
    }

    this.terrain.update(dt, this.scroll);

    this.fx.update(rawDt);
    this.updatePost(rawDt, speedNorm);
  }

  // ------------------------------------------------------------------ The Calm → Abyss
  updateSpeedMul(rawDt, freeze) {
    if (freeze) return;
    const BL = WORLD.biomeLength;
    const raw0 = Math.floor(this.meters / BL);
    const local0 = this.meters - raw0 * BL;
    let target = 1;
    if (this.calm) target = 1 - 0.18 * this.calmK;
    else if (raw0 % 5 === 4) target = ABYSS_SPIKE + 0.16 * (local0 / BL); // keeps ramping
    if (target > this.speedMul) this.speedMul = Math.min(target, this.speedMul + rawDt * 0.5);
    else this.speedMul = Math.max(target, this.speedMul - rawDt * 0.12);
  }

  enterAbyss() {
    this.inAbyss = true;
    this.blackout.setAlpha(0);
    this.hudReady?.setBlackout?.(false);
    this.setDesat(0);
    this.cameras.main.shake(380, 0.012);
    this.redFlash.setAlpha(0.55);
    this.tweens.add({ targets: this.redFlash, alpha: 0, duration: 650, ease: "Cubic.easeOut" });
    Sfx.biome();
    Music.play("abyss", { startBar: 16, immediate: true });
    this.hudReady?.onBiome?.(this.biomeIndex, { slam: true });
    this.announcedBiome = this.biomeIndex;
  }

  updateCalmFx(rawDt) {
    const k = this.calm ? this.calmK : 0;
    // edges darken, colours drain, music sinks to a hum under a rising heartbeat
    this.calmVig.setAlpha(this.blackoutT > 0 ? 0 : k * k * 0.95);
    this.setDesat(k);
    if (this.calm) Music.setCalm(k);
    // Abyss limited vision (fades in after the slam, out when the Abyss ends)
    const BL = WORLD.biomeLength;
    const inAbyssZone = Math.floor(this.meters / BL) % 5 === 4 && this.blackoutT <= 0;
    const target = inAbyssZone && this.state !== "dead" ? 0.82 : 0;
    this.darkA +=
      Math.sign(target - this.darkA) * Math.min(Math.abs(target - this.darkA), rawDt * 0.7);
    if (!inAbyssZone && this.inAbyss && this.darkA <= 0) this.inAbyss = false;
    const show = this.darkA > 0.001;
    const p = this.player;
    const cx = Math.round(p.x / S) * S;
    const cy = Math.round(p.y / S) * S;
    const h = this.darkSize / 2;
    const big = 6000;
    const [img, l, r, t, b] = this.dark;
    img.setPosition(cx, cy);
    l.setPosition(cx - h - big / 2, cy).setSize(big, big * 2);
    r.setPosition(cx + h + big / 2, cy).setSize(big, big * 2);
    t.setPosition(cx, cy - h - big / 2).setSize(this.darkSize, big);
    b.setPosition(cx, cy + h + big / 2).setSize(this.darkSize, big);
    for (const d of this.dark) d.setVisible(show).setAlpha(this.darkA);
  }

  /** Colour drain for The Calm (WebGL colour-matrix FX only while needed). */
  setDesat(k) {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cams = [this.cameras.main, this.backdrop?.cameras?.main].filter(Boolean);
    if (k <= 0.001) {
      if (this.desat) {
        cams.forEach((c, i) => c.postFX.remove(this.desat[i]));
        this.desat = null;
      }
      return;
    }
    if (!this.desat) this.desat = cams.map((c) => c.postFX.addColorMatrix());
    for (const cm of this.desat) {
      cm.reset();
      cm.saturate(-0.85 * k);
      cm.brightness(1 - 0.25 * k, true);
    }
  }

  /**
   * One-time auto-detect: if the first seconds of play can't hold ~60 fps, switch to
   * Low Graphics (drops the post-FX pass immediately; the rest applies on the next scene).
   */
  watchFrameRate(deltaMs) {
    const settings = Save.data.settings;
    if (settings.gfxChecked || this.state !== "playing") return;
    this.perf ||= { t: 0, frames: 0 };
    this.perf.t += deltaMs;
    this.perf.frames++;
    if (this.perf.t < 5000) return;
    const fps = (this.perf.frames * 1000) / this.perf.t;
    settings.gfxChecked = true;
    if (fps < 45 && !settings.lowGfx) {
      settings.lowGfx = true;
      this.cameras.main.resetPostPipeline();
      this.post = null;
      this.hudReady?.onToast?.(
        "LOW GRAPHICS ON",
        "Smoother play on this device · change in Settings",
      );
    }
    Save.write();
  }

  updateGhost() {
    const g = this.ghostRig;
    if (!g || !this.ghostData) return;
    const idx = this.distance / GHOST_STEP;
    const data = this.ghostData;
    if (idx >= data.length - 1) {
      if (!this.ghostDone) {
        this.ghostDone = true;
        if (this.state === "playing") {
          this.fx.burst("dot", g.x, g.y, 14, 0xcfe0ff);
          this.fx.ring(g.x, g.y, 0xcfe0ff, { scale: 0.8, alpha: 0.5 });
        }
        g.setVisible(false);
      }
      g.dead = true;
      g.update(1 / 60, this.scroll);
      return;
    }
    const i = Math.floor(idx);
    const f = idx - i;
    const y = data[i] + (data[i + 1] - data[i]) * f;
    const vy = data[i + 1] - data[i];
    g.setPosition(this.player.x, y);
    g.angle += (Phaser.Math.Clamp(vy * 4, -28, 60) - g.angle) * 0.2;
    g.update(1 / 60, this.scroll);
  }

  updatePost(dt, speedNorm) {
    const s = this.fxState;
    s.aberration *= Math.exp(-dt * 3.5);
    s.glitchSpike *= Math.exp(-dt * 2.5);
    s.flash *= Math.exp(-dt * 7);
    if (!this.post) return;
    const P = this.post.params;
    P.aberration = 0.0015 + speedNorm * 0.003 + s.aberration;
    P.glitch = Math.min(
      1,
      this.pal.glitch * (0.18 + (Math.random() < 0.04 ? 0.5 : 0)) + s.glitchSpike,
    );
    P.flash = s.flash;
    P.bloom = 1;
    P.pxScale = VIEW.Z;
  }
}

export { PHYSICS };
