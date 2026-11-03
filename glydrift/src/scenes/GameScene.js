// The run itself: world scroll, biomes, obstacles, player, rewards and screen effects.
// UI lives in the parallel Hud scene so the camera zoom never touches it.
import Phaser from "phaser";
import {
  BIOMES,
  biomeIdOf,
  biomeStateAt,
  blendPalette,
  lerpColor,
  N_BIOMES,
} from "../biomes/biomes.js";
import { fitCamera, NEAR_MISS, PHYSICS, speedForMeters, VIEW, WORLD } from "../config.js";
import { ComboMeter, TIER_COLORS } from "../effects/ComboMeter.js";
import { Effects } from "../effects/Effects.js";
import { ScreenFlash } from "../effects/ScreenFlash.js";
import { ObstacleManager } from "../obstacles/ObstacleManager.js";
import { SHIFT_BLEND, SHIFT_EVERY, SHIFTS } from "../pixel/colorShift.js";
import { darknessTexture } from "../pixel/hazardArt.js";
import { pixelPerfectZoom, S } from "../pixel/px.js";
import { Terrain } from "../pixel/Terrain.js";
import { THEMES, themeFor } from "../pixel/themes.js";
import { getCharacter } from "../player/characterDefs.js";
import { Player } from "../player/Player.js";
import { Sfx } from "../audio/sfx.js";
import { Haptics } from "../systems/haptics.js";
import { Leaderboard } from "../online/leaderboard.js";
import { Music } from "../audio/music.js";
import { BIOME_TRACKS } from "../audio/musicTracks.js";
import { Progression } from "../data/progression.js";
import { dailySeed, todayKey } from "../data/rng.js";
import { Save } from "../data/save.js";
import { ABYSS, BIOME_ENTRY_SLOWMO, BIOME_SPEED, CALM, COMBO, FLASH, REWARDS } from "../tuning.js";

const CALM_M = CALM.meters;
const DARK_R = ABYSS.darkRadius;
const COIN_BONUS = REWARDS.coinPoints;
const PERFECT_BONUS = REWARDS.perfectPoints;
const BIOME_COINS = REWARDS.biomeCoins;
const COMBO_TIERS = COMBO.tiers;
const COMBO_WINDOW = COMBO.window;
const FORCE_LUCKY =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("lucky");
// ?god in the URL makes the player invincible (handy for testing / capturing screenshots)
const DEBUG_GOD =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("god");
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
    // transparent gameplay camera drawn over the Backdrop scene (bloom = gameplay only)
    fitCamera(this);
    this.backdrop = this.scene.get("Backdrop");
    this.hazardList = [];
    this.hazardScreen = [];

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
    // colour flashes (run start, portals, biome entrance, near-miss edges, new best, Abyss)
    this.flashFx = new ScreenFlash(this, { depth: 55 });
    this.comboMeter = new ComboMeter(this, 32);
    this.shiftCol = SHIFTS.void[0];
    this.beatClock = 0;
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
    this.coinPts = 0;
    this.chain = 0;
    this.chainT = 0;
    this.mult = 1;
    this.coinStep = 0;
    this.coinStepT = 0;
    this.nextMilestone = 100;
    this.sparkleT = 0;
    this.comboMeter.reset();
    this.lucky = this.mode !== "daily" && (FORCE_LUCKY || Math.random() < REWARDS.luckyChance);
    this.player.rig.trailOverride = this.lucky ? REWARDS.luckyTrail : null;
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
    this.flashFx.clear();
    this.shiftFrom = this.shiftTo = this.shiftCol = SHIFTS.void[0];
    this.shiftK = 1;
    for (const d of this.dark) d.setAlpha(0).setVisible(false);
    this.setDesat(0);
    Music.endCalm();
    this.passedBest = false;
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
      runTimeMs: 0,
      perfects: 0,
      bestCombo: 1,
      bonusCoins: 0,
      lucky: this.lucky,
    };

    const seed = this.mode === "daily" ? dailySeed() : (Math.random() * 2 ** 32) >>> 0;
    this.obstacles.reset(seed);
    this.fx.clear();
    this.player.reset();
    this.zoomLevel = this.pxZoomLevel;
    this.cameras.main.setZoom(VIEW.Z * this.pxZoomLevel);
    this.setupBest();
    this.hudReady?.onReset?.();
    Music.play(BIOME_TRACKS[0], { startBar: 8 });
    if (autoStart) this.startRun();
  }

  /** The score to beat this run (daily mode compares with today's daily best). */
  setupBest() {
    const s = Save.data;
    this.bestScore = s.best;
    if (this.mode === "daily") this.bestScore = s.daily.date === todayKey() ? s.daily.best : 0;
  }

  startRun() {
    this.state = "playing";
    this.flashFx.refresh();
    this.flashFx.flash(this.lucky ? 0xffd23f : BIOMES[0].neon, FLASH.runStart);
    if (this.lucky) {
      Sfx.lucky();
      Haptics.strong();
      this.time.delayedCall(250, () =>
        this.hudReady?.hudBanner?.("LUCKY RUN!", 0xffd23f, "Golden trail · double coins"),
      );
    }
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
    this.addChain();
    const pts = NEAR_MISS.bonus * this.mult;
    this.bonus += pts;
    this.slowT = NEAR_MISS.slowTime;
    this.flashFx.flash(0xffffff, FLASH.nearMiss);
    const p = this.player;
    this.fx.floatText(
      p.x + 40,
      p.y - 50,
      this.mult > 1 ? `CLOSE! +${pts}` : "CLOSE!",
      "#ffffff",
      40,
    );
    this.fx.burst("star", p.x, p.y, 10, 0xffffff, { speed: { min: 120, max: 300 } });
    this.fx.ring(p.x, p.y, 0xffffff, { scale: 0.9, duration: 300 });
    this.flashFx.flash(this.charDef.color, { ...FLASH.nearMissEdge, edge: true });
    Sfx.near();
    this.hudReady?.onNearMiss?.(pts, this.mult);
  }

  /** One combo event (near-miss, coin, perfect). Steps the multiplier up the tiers. */
  addChain() {
    this.chain++;
    this.chainT = COMBO_WINDOW;
    let m = 1;
    for (const [c, mm] of COMBO_TIERS)
      if (this.chain >= c) {
        m = mm;
        break;
      }
    if (m > this.mult) {
      this.mult = m;
      this.run.bestCombo = Math.max(this.run.bestCombo, m);
      this.comboMeter.setTier(m);
      Sfx.combo([2, 3, 5, 10].indexOf(m) + 1);
      Haptics.light();
      const p = this.player;
      this.fx.ring(p.x, p.y, TIER_COLORS[m], { scale: 1.2, duration: 340, width: 2 });
      this.fx.burst("pixel", p.x, p.y, m >= 5 ? 14 : 8, TIER_COLORS[m], {
        speed: { min: 140, max: 360 },
      });
    }
  }

  /** Flew through the dead centre of a gap. */
  perfect() {
    this.run.perfects++;
    this.addChain();
    const pts = PERFECT_BONUS * this.mult;
    this.bonus += pts;
    const p = this.player;
    this.fx.floatText(p.x + 30, p.y - 92, `PERFECT! +${pts}`, "#fff1a0", 34);
    this.fx.burst("star", p.x, p.y, 8, 0xfff1a0, { speed: { min: 100, max: 280 } });
    this.flashFx.flash(0xfff4c0, FLASH.perfect);
    Sfx.perfect();
    Haptics.light();
  }

  /** Every 100 m a pop; 500 m / 1000 m get a proper celebration. */
  milestone(m) {
    const p = this.player;
    const big = m % 1000 === 0 ? 2 : m % 500 === 0 ? 1 : 0;
    if (!big) {
      this.fx.floatText(p.x + 20, p.y - 120, `${m}m`, "#bdf9ff", 30);
      this.fx.ring(p.x, p.y, 0xbdf9ff, { scale: 0.8, duration: 300 });
      Sfx.milestone(0);
      return;
    }
    this.fx.floatText(p.x + 20, p.y - 130, `${m}m!`, "#ffd23f", big > 1 ? 60 : 50);
    this.fx.burst("star", p.x, p.y, big > 1 ? 36 : 24, 0xffd23f, { speed: { min: 200, max: 640 } });
    this.fx.burst("pixel", p.x, p.y, 16, 0xffffff, { speed: { min: 260, max: 700 } });
    this.fx.ring(p.x, p.y, 0xffd23f, { scale: big > 1 ? 2.4 : 1.8, duration: 600, width: 2 });
    this.flashFx.flash(0xffd23f, big > 1 ? FLASH.milestoneBig : FLASH.milestone);
    this.cameras.main.shake(160, 0.004);
    Sfx.milestone(big);
    Haptics.strong();
  }

  /** +50 coins for reaching a new biome (shown flying from the bird). */
  biomeBonus() {
    this.run.coins += BIOME_COINS;
    this.run.bonusCoins += BIOME_COINS;
    const p = this.player;
    this.fx.floatText(p.x + 30, p.y - 60, `+${BIOME_COINS}`, "#ffd23f", 40);
    this.fx.burst("star", p.x, p.y, 16, 0xffd23f, { speed: { min: 160, max: 460 } });
    Sfx.reward();
    Haptics.light();
    this.hudReady?.onCoin?.(this.run.coins);
  }

  portal(o) {
    const p = this.player;
    this.run.portals++;
    Sfx.portal();
    const col = { flip: 0xff4fd8, restore: 0x39ff88, mini: 0xffd23f }[o.mode];
    this.flashFx.flash(0xffffff, FLASH.portal);
    this.fx.burst("pixel", p.x, p.y, 22, col, { speed: { min: 200, max: 560 } });
    this.fx.burst("star", p.x, p.y, 10, 0xffffff, { speed: { min: 120, max: 380 } });
    this.fx.ring(o.x, o.y, col, { scale: 1.4, duration: 500, width: 2 });
    this.fx.burst("star", p.x, p.y, 16, col);
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
    this.comboMeter.setTier(1); // the multiplier label disappears with the bird
    Sfx.death();
    Music.endCalm(true);
    Music.deathSweep();
    Haptics.strong();
    this.cameras.main.shake(320, hints.shake);
    this.flashFx.flash(0xffffff, { ...FLASH.death, peak: hints.flash, priority: true });
    this.slowT = 0.5;
    this.run.distance = Math.floor(this.meters);
    this.run.score = this.score;
    this.run.nearBonus = this.bonus - this.coinPts;
    this.run.coinBonus = this.coinPts;
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
    // coin points are added as they are collected (with the combo multiplier)
    return Math.floor(this.meters) + this.bonus;
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
    const calm = biomeIdOf(raw0) === "glitch" && local0 > BL - CALM_M;
    if (calm) bs = { a: bs.a, b: bs.b, t: 0, rawIndex: raw0 };
    // stop spawning a little before The Calm so it starts with an empty screen
    const preCalm = biomeIdOf(raw0) === "glitch" && local0 > BL - CALM_M - 35;
    this.calm = calm && playing;
    this.calmK = calm ? Phaser.Math.Clamp((local0 - (BL - CALM_M)) / CALM_M, 0, 1) : 0;
    blendPalette(bs, this.pal);
    if (this.palMix > 0 && this.fromPal) {
      this.palMix = Math.max(0, this.palMix - rawDt * 1.4);
      for (const k of PAL_KEYS) this.pal[k] = lerpColor(this.pal[k], this.fromPal[k], this.palMix);
    }
    if (playing && bs.rawIndex !== this.biomeIndex) {
      this.biomeIndex = bs.rawIndex;
      if (biomeIdOf(bs.rawIndex) === "abyss") {
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
      const abyss = biomeIdOf(bs.rawIndex) === "abyss";
      this.announcedBiome = bs.rawIndex;
      this.run.biome = Math.max(this.run.biome, Math.min(bs.rawIndex, N_BIOMES - 1));
      if (!abyss) {
        Sfx.biome();
        Music.play(BIOME_TRACKS[bs.rawIndex % BIOME_TRACKS.length], { startBar: 8 });
        this.hudReady?.onBiome?.(bs.rawIndex);
        if (bs.rawIndex > 0) {
          this.slowT = Math.max(this.slowT, BIOME_ENTRY_SLOWMO); // a brief slow-mo beat
          this.biomeBonus();
        }
        this.flashFx.flash(BIOMES[bs.rawIndex % BIOMES.length].neon, {
          ...FLASH.biome,
          priority: true,
        });
      }
    }
    // speed-up pulses every 250m
    const tier = Math.floor(this.meters / 250);
    if (playing && tier > this.lastSpeedTier) {
      this.lastSpeedTier = tier;
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
    this.updateColorShift(rawDt, biomeId, raw0 === bs.rawIndex ? local0 : 0);
    const beatPh = Music.beatPhase(this.beatClock);
    this.beatClock += rawDt;
    const beat = Math.exp(-beatPh * 6) * (1 - this.calmK) * (playing ? 1 : 0.5);
    this.obstacles.beat = beat;
    this.backdrop.drive(this.pal, {
      shift: this.shiftCol,
      shiftAmt: 1 - this.calmK,
      beat,
      floor: biomeId,
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
    info.grace = biomeIdOf(raw0) === "abyss" && local0 < ABYSS.graceMeters;
    this.updateCalmFx(rawDt);
    this.flashFx.update(rawDt);

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
        this.run.coins += ev.coins * (this.lucky ? 2 : 1);
        for (let i = 0; i < ev.coins; i++) this.addChain();
        const pts = COIN_BONUS * ev.coins * this.mult;
        this.bonus += pts;
        this.coinPts += pts;
        // coins in quick succession climb a scale
        this.coinStep = this.coinStepT > 0 ? Math.min(12, this.coinStep + 1) : 0;
        this.coinStepT = 0.8;
        Sfx.coin(this.coinStep);
        Haptics.light();
        this.hudReady?.onCoin?.(this.run.coins);
      }
      for (const o of ev.near) this.nearMiss(o);
      for (const o of ev.perfect) this.perfect(o);
      const r = p.radius;
      if (ev.hit || p.y < -r * 0.6 || p.y > this.H + r * 0.6) this.die();

      // combo window runs on real time (slow-mo doesn't stretch it)
      if (this.chainT > 0) {
        this.chainT -= rawDt;
        if (this.chainT <= 0) {
          this.chain = 0;
          this.mult = 1;
          this.comboMeter.setTier(1);
        }
      }
      this.comboMeter.update(rawDt, p.x, p.y, Math.max(0, this.chainT / COMBO_WINDOW));
      if (this.coinStepT > 0) this.coinStepT -= rawDt;
      while (this.meters >= this.nextMilestone) {
        this.milestone(this.nextMilestone);
        this.nextMilestone += 100;
      }
      if (this.lucky) {
        this.sparkleT -= rawDt;
        if (this.sparkleT <= 0) {
          this.sparkleT = 0.12;
          this.fx.burst("star", p.x - 18, p.y + 4, 1, 0xffd23f, { speed: { min: 20, max: 80 } });
        }
      }
      this.run.distance = Math.floor(this.meters);
      this.run.score = this.score;

      if (!this.passedBest && this.bestScore > 0 && this.score > this.bestScore) {
        this.passedBest = true;
        this.hudReady?.onNewBest?.();
        this.fx.floatText(p.x + 20, p.y - 120, "NEW BEST!", "#ffd23f", 50);
        Sfx.newBest();
        Haptics.strong();
        this.fx.burst("star", p.x, p.y, 24, 0xffd23f, { speed: { min: 150, max: 420 } });
        this.fx.burst("pixel", p.x, p.y, 18, 0xfff1a0, { speed: { min: 240, max: 620 } });
        this.fx.ring(p.x, p.y, 0xffd23f, { scale: 1.6, duration: 520, width: 2 });
        this.flashFx.flash(0xffd23f, FLASH.newBest);
      }
      this.missionCheckT -= rawDt;
      if (this.missionCheckT <= 0) {
        this.missionCheckT = 0.4;
        for (const m of Progression.liveMissionCheck(this.run, this.missionAnnounced))
          this.hudReady?.onMission?.(m);
      }
    }

    // dying → game over
    if (dying) {
      this.deathT += rawDt;
      if (this.deathT > 0.85) this.finishRun();
    }

    this.terrain.update(dt, this.scroll);

    this.fx.update(rawDt);
  }

  /** Backdrop colour drifts through the biome's related colours every SHIFT_EVERY m. */
  updateColorShift(rawDt, biomeId, local) {
    const list = SHIFTS[biomeId] || SHIFTS.void;
    const target = list[Math.floor(Math.max(0, local) / SHIFT_EVERY) % list.length];
    if (target !== this.shiftTo) {
      this.shiftFrom = this.shiftCol;
      this.shiftTo = target;
      this.shiftK = 0;
    }
    if (this.shiftK < 1) {
      this.shiftK = Math.min(1, this.shiftK + rawDt / SHIFT_BLEND);
      const e = this.shiftK * this.shiftK * (3 - 2 * this.shiftK);
      this.shiftCol = lerpColor(this.shiftFrom, this.shiftTo, e);
    }
  }

  // ------------------------------------------------------------------ The Calm → Abyss
  updateSpeedMul(rawDt, freeze) {
    if (freeze) return;
    const BL = WORLD.biomeLength;
    const raw0 = Math.floor(this.meters / BL);
    const local0 = this.meters - raw0 * BL;
    let target = 1;
    const id = biomeIdOf(raw0);
    if (this.calm) target = 1 - CALM.slowdown * this.calmK;
    else if (id === "abyss") target = ABYSS.speedSpike + ABYSS.speedRamp * (local0 / BL);
    else target = BIOME_SPEED[id] ?? 1; // e.g. the Glitch Realm a touch slower, the Valley drifts
    if (target > this.speedMul) this.speedMul = Math.min(target, this.speedMul + rawDt * 0.5);
    else this.speedMul = Math.max(target, this.speedMul - rawDt * 0.12);
  }

  enterAbyss() {
    this.inAbyss = true;
    this.blackout.setAlpha(0);
    this.hudReady?.setBlackout?.(false);
    this.setDesat(0);
    this.cameras.main.shake(380, 0.012);
    this.flashFx.flash(0xff0820, { ...FLASH.abyss, priority: true });
    this.time.delayedCall(700, () => this.state === "playing" && this.biomeBonus());
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
    const inAbyssZone = biomeIdOf(Math.floor(this.meters / BL)) === "abyss" && this.blackoutT <= 0;
    const target = inAbyssZone && this.state !== "dead" ? ABYSS.darkAlpha : 0;
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
   * Low Graphics (applies on the next scene).
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
      this.hudReady?.onToast?.(
        "LOW GRAPHICS ON",
        "Smoother play on this device · change in Settings",
      );
    }
    Save.write();
  }
}

export { PHYSICS };
