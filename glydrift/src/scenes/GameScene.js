// The run itself: world scroll, biomes, obstacles, player, rewards and screen effects.
// UI lives in the parallel Hud scene so the camera zoom never touches it.
import Phaser from "phaser";
import { BIOMES, blendPalette, lerpColor } from "../biomes/biomes.js";
import { Course } from "../biomes/course.js";
import {
  fitCamera,
  NEAR_MISS,
  PHYSICS,
  speedForMeters,
  VIEW,
  WORLD,
} from "../config.js";
import { ComboMeter, TIER_COLORS } from "../effects/ComboMeter.js";
import { Effects } from "../effects/Effects.js";
import { ScreenFlash } from "../effects/ScreenFlash.js";
import { ObstacleManager } from "../obstacles/ObstacleManager.js";
import { SHIFT_BLEND, SHIFT_EVERY, SHIFTS } from "../pixel/colorShift.js";
import { darknessTexture } from "../pixel/hazardArt.js";
import { pixelPerfectZoom, S } from "../pixel/px.js";
import { Terrain } from "../pixel/Terrain.js";
import {
  biomeArtReady,
  pumpBiomeArt,
  queueBiomeArt,
  THEMES,
  themeFor,
} from "../pixel/themes.js";
import { getCharacter } from "../player/characterDefs.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { Player } from "../player/Player.js";
import { Sfx } from "../audio/sfx.js";
import { Analytics } from "../systems/analytics.js";
import { getBoost, Shop } from "../data/cosmetics.js";
import { Haptics } from "../systems/haptics.js";
import { TEST } from "../systems/testFlags.js";
import { Leaderboard } from "../online/leaderboard.js";
import { Music } from "../audio/music.js";
import { BIOME_TRACKS } from "../audio/musicTracks.js";
import { Progression } from "../data/progression.js";
import { LevelRun } from "../levels/LevelRun.js";
import { getLevel, recordLevel } from "../levels/levels.js";
import { RNG } from "../data/rng.js";
import { Save } from "../data/save.js";
import {
  ABYSS,
  BIOME_SPEED,
  CALM,
  CAMERA_FEEL,
  HAZARD,
  COMBO,
  DIMENSIONS,
  FLASH,
  REWARDS,
} from "../tuning.js";

const CALM_M = CALM.meters;
const DARK_R = ABYSS.darkRadius;
const COIN_BONUS = REWARDS.coinPoints;
const PERFECT_BONUS = REWARDS.perfectPoints;
const BIOME_COINS = REWARDS.biomeCoins;
/** Pop text by the bird is drawn at this size so it reads as secondary to centre pop-ups. */
const POP_NEAR_SCALE = 0.8;
const COMBO_TIERS = COMBO.tiers;
const COMBO_WINDOW = COMBO.window;
const FORCE_LUCKY = TEST.lucky;
// ?god in the URL makes the player invincible (handy for testing / capturing screenshots)
let DEBUG_GOD = TEST.god;
// test builds only: lets an automated test end a long god-mode run
if (TEST.on && typeof window !== "undefined")
  window.__glyGod = (on) => (DEBUG_GOD = !!on);
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
    // "normal" (endless) or "level" (LEVEL MODE: data.level = 1..50, data.practice); the
    // Daily Challenge was replaced by level mode
    this.levelDef = data?.mode === "level" ? getLevel(data.level) : null;
    this.mode = this.levelDef ? "level" : "normal";
    this.practice = !!(this.levelDef && data.practice);
  }

  create() {
    this.wardAura = null; // RONIN's Fire Ward aura (rebuilt per scene)
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

    this.charDef = getCharacter(TEST.character || Progression.selectedHero());
    this.fx = new Effects(this, { lowGfx: this.lowGfx });
    this.obstacles = new ObstacleManager(this, this.fx, {
      W,
      H,
      lowGfx: this.lowGfx,
      heroColor: this.charDef.color,
    });
    this.obstacles.prewarm();
    this.obstacles.onImpact = (o) => {
      // (no camera shake here: the camera only shakes on death and the Abyss entrance)
    };

    // pixel-art terrain walls along both screen edges (spiked surface = the existing kill line)
    this.terrain = new Terrain(this, themeFor("void"), { W, H });
    this.terrainTodo = null;
    // camera zoom chosen so every art pixel is a whole number of screen pixels
    this.pxZoomLevel = pixelPerfectZoom(VIEW.Z, WORLD.baseZoom) / VIEW.Z;
    this.cameras.main.roundPixels = true;
    // the walls cover the view at the camera's widest (the gentle zoom-out at top speed)
    this.terrain.setView(this.pxZoomLevel * (1 - CAMERA_FEEL.zoomOut));
    this.terrain.prebuild(
      Object.values(THEMES).filter((t) => biomeArtReady(t.id)),
    );

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
    this.tearG = this.add.graphics().setDepth(57); // dimension rift: screen-tear transition
    this.comboMeter = new ComboMeter(this, 32);
    // Mirror Realm: a ghostly twin flies upside down across the glowing horizon
    this.twin = new CharacterRig(this, this.charDef, null, {
      x: 0,
      y: 0,
      depth: 29,
    });
    this.twin.trailOverride = [0xffffff, 0xd8c0ff, 0x9a3aff, 0x4a1a8a];
    this.twin.sprite.setTint(0xd8c0ff);
    this.twin.setVisible(false);
    this.horizon = this.add
      .graphics()
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.shiftCol = SHIFTS.void[0];
    this.beatClock = 0;
    const DS = 1024;
    if (!this.textures.exists("abyss_dark"))
      darknessTexture(this, "abyss_dark", DS, DS, DARK_R);
    this.dark = [this.add.image(0, 0, "abyss_dark")];
    for (let i = 0; i < 4; i++)
      this.dark.push(this.add.rectangle(0, 0, 10, 10, 0x020004));
    for (const d of this.dark) d.setDepth(20).setAlpha(0).setVisible(false);
    this.darkSize = DS;
    this.desat = null;

    this.input.on("pointerdown", (p) => this.onTap(p));
    // keyboard: Space / W / Up flap (held keys don't auto-repeat flaps); Esc / P pause (Hud)
    for (const k of ["SPACE", "W", "UP"])
      this.input.keyboard?.on(
        `keydown-${k}`,
        (e) => !e?.repeat && this.onTap(),
      );

    this.game.events.on("hidden", this.onHidden, this);
    // the wind bed fades out whenever the run isn't on screen and moving
    // (the scene's event emitter outlives restarts: hook it once)
    if (!this.windHooked) {
      this.windHooked = true;
      const calmWind = () => {
        Sfx.wind(0);
        Sfx.auraHum(0);
        Sfx.jetHum(0);
      };
      for (const e of ["pause", "sleep", "shutdown"])
        this.events.on(e, calmWind);
    }
    this.events.once("shutdown", () => {
      this.game.events.off("hidden", this.onHidden, this);
      // leaving mid-Calm (pause → HOME): drop the grey filter on the shared Backdrop camera
      // and the Calm drone / heartbeat, or they'd follow the player into every screen
      this.setDesat(0);
      Music.endCalm();
    });

    this.events.once("shutdown", () => {
      this.levelRun?.destroy();
      this.levelRun = null;
    });
    this.levelRun = this.levelDef
      ? new LevelRun(this, this.levelDef, { practice: this.practice })
      : null;
    this.scene.launch("Hud", { game: this });
    this.hud = this.scene.get("Hud");
    this.resetRun(false);
  }

  // ------------------------------------------------------------------ run lifecycle
  resetRun(autoStart) {
    this.isRetry = !!autoStart; // RETRY from game over (a fresh run from home isn't)
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
    if (this.player?.rig) this.player.rig.comboTier = 1; // Combo Flame trail cools down
    this.coinStep = 0;
    this.coinStepT = 0;
    this.nextMilestone = 100;
    this.sparkleT = 0;
    this.comboMeter.reset();
    this.lucky =
      this.mode === "normal" &&
      (FORCE_LUCKY || Math.random() < REWARDS.luckyChance);
    this.player.rig.trailOverride = this.lucky ? REWARDS.luckyTrail : null;
    this.lastSpeedTier = 0;
    this.biomeIndex = 0;
    this.announcedBiome = 0;
    this.titledBiome = 0;
    this.speedMul = 1;
    // WALLRUNNER's boost dash (double-tap): timers + the eased speed multiplier
    this.boostT = 0;
    this.boostGrace = 0;
    this.boostCd = 0;
    this.boostMul = 1;
    this.lastTapAt = -9;
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
      abyssM: 0,
      abyssNear: 0,
      prismM: 0,
      prismClear: 0,
    };
    this.zoneId = null;
    this.zoneLastM = undefined;

    const seed = this.levelRun
      ? this.levelRun.def.seed
      : (Math.random() * 2 ** 32) >>> 0;
    // retry grace: after a crash the first obstacle starts a little farther away, a breath to
    // settle back in (the daily keeps its fixed course)
    this.obstacles.reset(
      seed,
      this.isRetry && this.mode === "normal" ? HAZARD.retryLead : 0,
    );
    // the run's course: classic biomes, then random dimensions behind rifts
    const courseRng = new RNG((seed ^ 0x9e3779b9) >>> 0);
    this.course = this.levelRun
      ? this.levelRun.course()
      : new Course(() => courseRng.next(), TEST.dimension);
    this.levelRun?.reset();
    this.biomeIndex = -1;
    this.announcedBiome = -1;
    this.rift?.destroy();
    this.rift = null;
    this.tearT = 0;
    this.zoneScale = 1;
    this.mirror = false;
    this.glitchT = 2;
    this.twin.setVisible(false);
    this.twin.trailG.clear();
    this.horizon.clear();
    this.fx.clear();
    this.player.reset();
    this.zoomLevel = this.pxZoomLevel;
    this.cameras.main.setZoom(VIEW.Z * this.pxZoomLevel);
    this.camLead = 0;
    if (this.camBaseY !== undefined) this.cameras.main.scrollY = this.camBaseY;
    this.setupBest();
    this.hudReady?.onReset?.();
    Music.play(this.levelRun ? this.levelRun.def.realm : BIOME_TRACKS[0], {
      startBar: 8,
    });
    if (autoStart) this.startRun();
  }

  /** The score to beat this run (levels have no score: their HUD shows progress instead). */
  setupBest() {
    this.bestScore = this.levelRun ? 0 : Save.data.best;
  }

  startRun() {
    this.state = "playing";
    // shop Boosts were removed: every run is a normal, ranked run
    this.revives = 0;
    this.coinBoost = 1;
    this.flashFx.refresh();
    this.flashFx.flash(
      this.lucky
        ? 0xffd23f
        : this.levelRun
          ? this.levelRun.realm.col
          : BIOMES[0].neon,
      FLASH.runStart,
    );
    if (this.lucky) {
      Sfx.lucky();
      Haptics.strong();
      this.time.delayedCall(250, () =>
        this.hudReady?.hudBanner?.(
          "LUCKY RUN!",
          0xffd23f,
          "Golden trail · double coins",
        ),
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
      // a quick second tap fires the boost dash (heroes with `boost`, when it's charged)
      const B = this.charDef.boost;
      const now = this.time.now / 1000;
      if (
        B &&
        now - this.lastTapAt < B.window &&
        this.boostCd <= 0 &&
        this.boostT <= 0
      ) {
        this.lastTapAt = -9;
        this.startBoost();
        return;
      }
      this.lastTapAt = now;
      const dbl = this.player.flap();
      this.run.flaps++;
      if (dbl) {
        Sfx.doubleJump();
        Haptics.light();
        const p = this.player;
        this.popNear(p.x + 30, p.y - 46, "DOUBLE JUMP!", "#8aff7a", 40);
      }
      Sfx.flap(this.charDef.id);
      Sfx.flapWhoosh(this.speedNorm || 0);
      Haptics.tap(); // a crisp, tiny tick on every flap (installed app / Android)
    }
  }

  onHidden() {
    if (this.state === "playing") this.hudReady?.pause?.();
  }

  // ------------------------------------------------------------------ events
  nearMiss(o) {
    this.run.nearMiss++;
    this.player.rig.flex({ sparkle: true }); // YARMS: a quick flex (no-op for other heroes)
    this.player.rig.onNear(); // animals: berries pop, croaks, tail fans…
    if (this.zoneId === "abyss")
      this.run.abyssNear = (this.run.abyssNear || 0) + 1;
    this.addChain();
    const pts = NEAR_MISS.bonus * this.mult;
    this.bonus += pts;
    this.slowT = NEAR_MISS.slowTime;
    this.flashFx.flash(0xffffff, FLASH.nearMiss);
    const p = this.player;
    this.popNear(
      p.x + 40,
      p.y - 50,
      this.mult > 1 ? `CLOSE! +${pts}` : "CLOSE!",
      "#ffffff",
      40,
    );
    this.fx.burst("star", p.x, p.y, 10, 0xffffff, {
      speed: { min: 120, max: 300 },
    });
    this.fx.ring(p.x, p.y, 0xffffff, { scale: 0.9, duration: 300 });
    this.flashFx.flash(this.charDef.color, {
      ...FLASH.nearMissEdge,
      edge: true,
    });
    Sfx.near();
    this.hudReady?.onNearMiss?.(pts, this.mult);
  }

  /** One combo event (near-miss, coin, perfect). Steps the multiplier up the tiers. */
  addChain() {
    this.chain++;
    this.chainT = COMBO_WINDOW;
    let m = 1;
    // SXE (perks.comboMax 13) has one more tier above x10
    const tiers =
      this.charDef.perks?.comboMax >= 13
        ? [COMBO.overdrive, ...COMBO_TIERS]
        : COMBO_TIERS;
    for (const [c, mm] of tiers)
      if (this.chain >= c) {
        m = mm;
        break;
      }
    if (m > this.mult) {
      this.mult = m;
      if (this.player?.rig) this.player.rig.comboTier = m; // Combo Flame trail heats up
      this.run.bestCombo = Math.max(this.run.bestCombo, m);
      this.comboMeter.setTier(m);
      Sfx.combo([2, 3, 5, 10, 13].indexOf(m) + 1);
      Haptics.light();
      const p = this.player;
      this.fx.ring(p.x, p.y, TIER_COLORS[m], { scale: 1.2, duration: 340 });
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
    this.popNear(p.x + 30, p.y - 92, `PERFECT! +${pts}`, "#fff1a0", 34);
    this.fx.burst("star", p.x, p.y, 8, 0xfff1a0, {
      speed: { min: 100, max: 280 },
    });
    this.flashFx.flash(0xfff4c0, FLASH.perfect);
    Sfx.perfect();
    Haptics.light();
  }

  /**
   * Pop text by the bird (CLOSE!, PERFECT!, +coins…): drawn a little smaller than the centre
   * pop-ups and moved out of the strip a live centre pop-up (realm title, NEW BEST, SPEED UP,
   * distance) is using, so the two never overlap.
   */
  popNear(x, y, str, color, size) {
    const sz = Math.round(size * POP_NEAR_SCALE);
    const band = this.hudReady?.centerBand?.();
    if (band) {
      // HUD → screen → world
      const hc = this.hud.cameras.main;
      const gc = this.cameras.main;
      const toWorld = (hy) =>
        ((hy - hc.worldView.y) * hc.zoom) / gc.zoom + gc.worldView.y;
      const b0 = toWorld(band.y0);
      const b1 = toWorld(band.y1);
      const h = sz / 2 + 18;
      // the text rises 70 while it fades: keep that whole path clear of the band
      if (y + h > b0 && y - 70 - h < b1) {
        const below = b1 + 70 + h + 6;
        const above = b0 - h - 6;
        y = below + h < gc.worldView.bottom ? below : above;
      }
    }
    return this.fx.floatText(x, y, str, color, sz);
  }

  /** HUD → world y (the HUD and the world are drawn at different zooms). */
  hudToWorldY(hy) {
    const hc = this.hud.cameras.main;
    const gc = this.cameras.main;
    return ((hy - hc.worldView.y) * hc.zoom) / gc.zoom + gc.worldView.y;
  }

  /** Remove pop text that would rise through a HUD strip (a realm title just appeared there). */
  clearPopsIn(band) {
    if (!band || !this.hud) return;
    const b0 = this.hudToWorldY(band.y0);
    const b1 = this.hudToWorldY(band.y1);
    for (const t of this.fx.texts) {
      if (!t.active) continue;
      const h = t.height / 2;
      // its remaining path: from where it is up to 70 above where it started (≤ 70 above now)
      if (t.y + h > b0 && t.y - 70 - h < b1) {
        this.tweens.killTweensOf(t);
        t.setActive(false).setVisible(false);
      }
    }
  }

  /** Every 100 m a pop; 500 m / 1000 m get a proper celebration. */
  milestone(m) {
    const p = this.player;
    const big = m % 1000 === 0 ? 2 : m % 500 === 0 ? 1 : 0;
    const hud = this.hudReady;
    if (!big) {
      if (hud?.onDistance) hud.onDistance(m, 0);
      else this.fx.floatText(p.x + 20, p.y - 120, `${m}m`, "#bdf9ff", 30);
      this.fx.ring(p.x, p.y, 0xbdf9ff, { scale: 0.8, duration: 300 });
      Sfx.milestone(0);
      return;
    }
    if (hud?.onDistance) hud.onDistance(m, big);
    else
      this.fx.floatText(
        p.x + 20,
        p.y - 130,
        `${m}m!`,
        "#ffd23f",
        big > 1 ? 60 : 50,
      );
    this.fx.burst("star", p.x, p.y, big > 1 ? 36 : 24, 0xffd23f, {
      speed: { min: 200, max: 640 },
    });
    this.fx.burst("pixel", p.x, p.y, 16, 0xffffff, {
      speed: { min: 260, max: 700 },
    });
    this.fx.ring(p.x, p.y, 0xffd23f, {
      scale: big > 1 ? 2.4 : 1.8,
      duration: 600,
    });
    this.flashFx.flash(
      0xffd23f,
      big > 1 ? FLASH.milestoneBig : FLASH.milestone,
    );
    Sfx.milestone(big);
    Haptics.strong();
  }

  /** +50 coins for reaching a new biome (shown flying from the bird). */
  /** "ENTERING …": title, sound and flash (once per realm). Returns false if not shown. */
  realmTitle(seg, withFlash = true) {
    if (this.state !== "playing" || this.titledBiome === seg.i) return false;
    this.titledBiome = seg.i;
    Sfx.biome();
    this.hudReady?.onBiome?.(seg.biome);
    if (withFlash) this.flashBiome(seg);
    return true;
  }

  flashBiome(seg) {
    this.flashFx.flash(BIOMES[seg.biome].neon, {
      ...FLASH.biome,
      priority: true,
    });
  }

  biomeBonus() {
    this.run.coins += BIOME_COINS;
    this.run.bonusCoins += BIOME_COINS;
    const p = this.player;
    this.popNear(p.x + 30, p.y - 60, `+${BIOME_COINS}`, "#ffd23f", 40);
    this.fx.burst("star", p.x, p.y, 16, 0xffd23f, {
      speed: { min: 160, max: 460 },
    });
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
    this.fx.burst("pixel", p.x, p.y, 22, col, {
      speed: { min: 200, max: 560 },
    });
    this.fx.burst("star", p.x, p.y, 10, 0xffffff, {
      speed: { min: 120, max: 380 },
    });
    this.fx.ring(o.x, o.y, col, { scale: 1.4, duration: 500 });
    this.fx.burst("star", p.x, p.y, 16, col);
    if (o.mode === "flip") {
      p.flipGravity(-1);
      this.popNear(p.x + 50, p.y - 60, "GRAVITY FLIP", "#ff9ce8", 30);
    } else if (o.mode === "restore") {
      p.flipGravity(1);
      this.popNear(p.x + 50, p.y - 60, "GRAVITY RESTORED", "#9cffc4", 26);
    } else {
      p.makeMini();
      this.popNear(p.x + 50, p.y - 60, "MINI!", "#ffe27a", 34);
    }
    this.hudReady?.onPortal?.(o.mode);
  }

  /**
   * Shop Boosts armed for this run (never in the Daily Challenge). A boosted run still pays
   * coins and mission progress but is kept off the leaderboard (run.boosted).
   */
  applyBoosts() {
    this.revives = 0;
    this.coinBoost = 1;
    if (this.mode === "level") return; // levels never use boosts (their best times are ranked)
    const used = Shop.consumeBoosts();
    this.run.boosts = used;
    this.run.boosted = used.length > 0;
    if (!used.length) return;
    if (used.includes("revive")) this.revives = 1;
    if (used.includes("double")) this.coinBoost = 2;
    if (used.includes("magnet")) this.obstacles.magnetR = 300;
    if (used.includes("headstart")) {
      this.distance = 200 * WORLD.pxPerMeter;
      this.meters = 200;
      this.nextMilestone = 300;
      this.boostGrace = 1.5; // land safely among the obstacles
    }
    const names = used.map((id) => getBoost(id).name).join(" · ");
    this.time.delayedCall(this.lucky ? 1600 : 250, () =>
      this.hudReady?.hudBanner?.(
        "BOOSTED RUN",
        0x39ff88,
        `${names} · not ranked`,
      ),
    );
  }

  /** Second Chance: back to the middle of the screen with a moment of shield. */
  revive() {
    this.revives -= 1;
    const p = this.player;
    p.y = this.H / 2;
    p.vy = 0;
    this.boostGrace = 2;
    Sfx.levelUp();
    Haptics.strong();
    this.flashFx.flash(0x39ff88, FLASH.perfect);
    this.fx.ring(p.x, p.y, 0x39ff88, { scale: 2, duration: 600 });
    this.fx.burst("star", p.x, p.y, 24, 0x39ff88, {
      speed: { min: 150, max: 450 },
    });
    this.popNear(p.x + 40, p.y - 70, "SECOND CHANCE!", "#39ff88", 44);
    p.rig.onRevive(); // Prismara shatters into light and reforms
  }

  /** WALLRUNNER's dash: a burst to 13x speed, straight and untouchable, then a short grace. */
  startBoost() {
    const B = this.charDef.boost;
    const p = this.player;
    this.boostT = B.duration;
    this.boostCd = B.cooldown;
    this.run.boosts = (this.run.boosts || 0) + 1;
    p.vy = 0;
    Sfx.whoosh();
    Sfx.lucky();
    Haptics.strong();
    this.flashFx.flash(0xffd23f, FLASH.perfect);
    this.popNear(p.x + 40, p.y - 70, `${B.mul}x BOOST!`, "#ffd23f", 56);
    this.fx.ring(p.x, p.y, 0xffd23f, { scale: 1.6, duration: 380 });
  }

  updateBoost(dt) {
    const B = this.charDef.boost;
    const p = this.player;
    if (this.boostT > 0) {
      this.boostT -= dt;
      this.boostMul += (B.mul - this.boostMul) * Math.min(1, dt * 18);
      p.vy = 0; // dead straight through everything
      // speed streaks and gold sparks blasting off behind him
      this.fx.burst("spark", p.x - 20, p.y, 4, 0xffd23f, {
        angle: { min: 170, max: 190 },
        speed: { min: 600, max: 1200 },
      });
      if (this.boostT <= 0) this.boostGrace = B.grace;
    } else {
      this.boostMul += (1 - this.boostMul) * Math.min(1, dt * 9);
      if (this.boostMul < 1.01) this.boostMul = 1;
      if (this.boostGrace > 0) this.boostGrace -= dt;
    }
    if (this.boostCd > 0) {
      this.boostCd -= dt;
      if (this.boostCd <= 0)
        this.popNear(p.x + 40, p.y - 60, "BOOST READY", "#ffd23f", 28);
    }
  }

  /** RONIN passes through a Solar Storm fire hazard: crimson shield flash + hiss (logged). */
  fireWardBlock(o) {
    const p = this.player;
    const glitch = this.obstacles.ward === "all"; // SXE phasing through in the Glitch Realm
    this.run.wardBlocks = (this.run.wardBlocks || 0) + 1;
    this.fx.ring(p.x, p.y, glitch ? 0x39ff88 : 0xff2a3d, {
      scale: 1.3,
      duration: 320,
    });
    this.fx.burst("spark", p.x, p.y, 10, glitch ? 0x6aff9a : 0xff6a3a, {
      speed: { min: 120, max: 320 },
    });
    this.flashFx.flash(glitch ? 0x39ff88 : 0xff2a3d, {
      ...FLASH.nearMissEdge,
      edge: true,
    });
    this.wardFlashT = 0.25;
    Sfx.hiss();
    Analytics.log(glitch ? "glitch_proof_phased" : "fire_ward_blocked", {
      hazard: o.type,
      m: Math.round(this.meters),
      blocks: this.run.wardBlocks,
    });
  }

  die() {
    if (this.state !== "playing" || DEBUG_GOD) return;
    if (this.revives > 0) return this.revive();
    this.state = "dying";
    this.deathT = 0;
    // what ended the run, and where (season challenge: "Die to every Abyss hazard")
    this.run.killedBy = this.obstacles.events?.hit?.type || "edge";
    this.run.killedIn = this.zoneId;
    const hints = this.player.die();
    if (this.mirror) {
      this.fx.burst(
        "shard",
        this.player.x,
        this.H - this.player.y,
        20,
        0xc87aff,
      );
      this.twin.setVisible(false);
    }
    this.comboMeter.setTier(1); // the multiplier label disappears with the bird
    Sfx.death();
    Sfx.hero(this.charDef.id, "death");
    Music.endCalm(true);
    Music.deathSweep();
    Haptics.strong();
    this.cameras.main.shake(320, hints.shake);
    this.flashFx.flash(0xffffff, {
      ...FLASH.death,
      peak: hints.flash,
      priority: true,
    });
    this.slowT = HAZARD.deathSlow; // a short slow-mo beat on the crash (~0.3 s)
    this.run.distance = Math.floor(this.meters);
    this.run.score = this.score;
    this.run.nearBonus = this.bonus - this.coinPts;
    this.run.coinBonus = this.coinPts;
    this.hudReady?.onDeath?.();
  }

  finishRun() {
    this.state = "dead";
    // RONIN's coin perk: a bonus at the end of every run (doubled by Double Coins / Lucky Run)
    const perkCoins = this.charDef.perks?.coinBonus;
    if (perkCoins) {
      const mul = (this.lucky ? 2 : 1) * (this.coinBoost || 1);
      // paid in commitRun, not as "collected" coins (missions / XP / stats ignore it)
      this.run.perkBonus = { base: perkCoins, mul, total: perkCoins * mul };
    }
    // music drops back to normal after the run (the Abyss track never lingers)
    if (this.inAbyss) Music.play(BIOME_TRACKS[0], { startBar: 8 });
    const result = Progression.commitRun(this.run);
    // upload in the background — never awaited, never blocks retry
    result.upload = Leaderboard.submitRun(this.run);
    this.scene.launch("GameOver", { result, game: this });
    this.scene.bringToTop("GameOver");
  }

  /** Level mode: the world was rewound to a checkpoint — bring the hero back. */
  respawnAt() {
    const p = this.player;
    p.reset();
    p.y = this.H * 0.45;
    p.vy = 0;
    this.state = "playing";
    this.deathT = 0;
    this.slowT = 0;
    this.timeScale = 1;
    this.boostGrace = 1.1; // a short blink of safety after the respawn
    this.chain = 0;
    this.mult = 1;
    this.comboMeter.setTier(1);
    this.fx.ring(p.x, p.y, 0x39ff88, { scale: 1.6, duration: 420 });
    this.flashFx.flash(0x39ff88, { ...FLASH.nearMissEdge, edge: true });
    this.player.flap();
    Sfx.flap(this.charDef.id);
  }

  /** Level mode: crossed the finish line. */
  levelComplete(res) {
    if (this.state !== "playing") return;
    this.state = "won";
    this.comboMeter.setTier(1); // no "x13" left floating behind LEVEL COMPLETE
    const p = this.player;
    const col = this.levelRun.realm.col;
    const boss = this.levelRun.def.boss;
    // a burst at the line; the boss levels get a big finale
    this.fx.burst("star", p.x, p.y, boss ? 60 : 30, 0xffd23f, {
      speed: { min: 150, max: 520 },
    });
    this.fx.ring(p.x, p.y, col, { scale: boss ? 3.2 : 2, duration: 700 });
    if (boss)
      for (let k = 0; k < 5; k++)
        this.time.delayedCall(140 * k, () =>
          this.fx.burst(
            "pixel",
            this.W * (0.3 + Math.random() * 0.6),
            this.H * (0.2 + Math.random() * 0.6),
            30,
            [col, 0xffd23f, 0xffffff][k % 3],
            { speed: { min: 200, max: 600 } },
          ),
        );
    this.flashFx.flash(col, { ...FLASH.biome, priority: true });
    this.cameras.main.shake(boss ? 500 : 200, boss ? 0.012 : 0.004);
    Sfx.newBest?.();
    Haptics.strong();
    this.run.distance = Math.floor(this.meters);
    this.run.score = 0;
    this.run.level = res;
    // practice never counts; a normal finish saves the stars / rewards, then also feeds
    // missions ("Beat 3 levels", "Earn 5 stars"), achievements, XP and the Drift Pass
    const out = res.practice ? null : recordLevel(res);
    this.run.levelDone = out ? 1 : 0;
    this.run.levelStars = out ? out.newStars.length : 0;
    const result = res.practice ? null : Progression.commitRun(this.run);
    this.time.delayedCall(boss ? 1700 : 1100, () => {
      this.state = "dead";
      this.scene.launch("LevelComplete", { res, out, result, game: this });
      this.scene.bringToTop("LevelComplete");
    });
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
    this.watchFrameRate(deltaMs);
    // Same game speed at any refresh rate: a long frame (30 fps Low Power Mode, a hiccup) runs
    // as several ~60 Hz steps instead of one big clamped one, so the world never slows down and
    // collisions are checked as finely as at 60 fps. Real stalls are still capped (4 steps).
    const n = Math.min(4, Math.max(1, Math.round(deltaMs / (1000 / 60))));
    const d = deltaMs / n;
    for (let i = 0; i < n; i++) this.stepFrame(time - (n - 1 - i) * d, d);
  }

  stepFrame(time, deltaMs) {
    const rawDt = Math.min(deltaMs / 1000, 1 / 30);

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
      // (held by the audio clock while the Abyss drop is on its way: exactly one bar)
      this.blackoutT = Music.syncBlackout(this.blackoutT - rawDt);
      freeze = true;
      if (this.blackoutT <= 0) this.enterAbyss();
    }
    // slow-mo × Chrono time zones (golden slows everything, red speeds it all up)
    const dt = freeze ? 0 : rawDt * this.timeScale * this.zoneScale;
    this.fx.setTimeScale(this.timeScale);
    this.tweens.timeScale = 1;

    const playing = this.state === "playing";
    const dying = this.state === "dying";

    // speed & distance
    if (playing) {
      this.updateSpeedMul(rawDt, freeze);
      if (this.charDef.boost) this.updateBoost(rawDt);
      else if (this.boostGrace > 0) this.boostGrace -= rawDt;
      // shield blink (Second Chance / Head Start landing / boost grace)
      this.player.rig.sprite.setAlpha(
        this.boostGrace > 0 && Math.floor(this.boostGrace * 12) % 2 ? 0.35 : 1,
      );
      // some heroes fly faster than the rest (WALLRUNNER), and his boost multiplies it again
      this.speed =
        (this.levelRun
          ? this.levelRun.speedAt(this.meters)
          : speedForMeters(this.meters)) *
        this.speedMul *
        (this.charDef.speed ?? 1) *
        this.boostMul;
      this.scroll = this.speed;
    } else if (this.state === "ready") {
      // a level holds still until the first tap (so its layout is exactly the same every time)
      this.scroll = this.levelRun ? 0 : WORLD.baseSpeed * 0.55;
    } else {
      this.scroll *= Math.exp(-rawDt * 1.6);
    }
    if (playing) {
      this.run.runTimeMs += rawDt * 1000;
      this.distance += this.scroll * dt;
      this.meters = this.distance / WORLD.pxPerMeter;
    }
    this.clock += dt;
    const speedNorm = Phaser.Math.Clamp(
      (this.speed - WORLD.baseSpeed) / WORLD.speedGain,
      0,
      1,
    );
    this.speedNorm = speedNorm;
    // wind builds with speed while flying; it fades out when paused, dead or on another screen
    Sfx.wind(
      this.state === "playing" && !this.sys.isPaused()
        ? 0.25 + speedNorm * 0.75
        : 0,
    );
    // MATTOE: the aura's quiet low hum while gliding (swells with speed)
    Sfx.auraHum(
      this.charDef.id === "mattoe" &&
        this.state === "playing" &&
        !this.sys.isPaused()
        ? 0.35 + speedNorm * 0.65
        : 0,
    );
    // SXE: the Afterburner's soft engine hum, rising in pitch with speed
    const jetOn =
      this.player?.rig?.falcon?.burner &&
      !this.player.rig.dead &&
      this.state === "playing" &&
      !this.sys.isPaused();
    Sfx.jetHum(jetOn ? 0.45 + speedNorm * 0.55 : 0, speedNorm);
    // music layers follow speed (drums + bass, then the skank, then the lead)
    Music.setIntensity(
      this.state === "playing" ? 0.15 + speedNorm * 0.85 : 0.1,
    );
    // the music watches the road ahead: next realm preloaded, its bridge timed to land on it
    Music.follow(
      this.course,
      this.meters,
      this.state === "playing" && !this.sys.isPaused(),
    );

    // biome palette from the run's course (smooth blend back to Neon Void after a restart)
    const st = this.course.stateAt(this.meters);
    const seg0 = st.seg; // segment the player is in
    const local0 = st.local;
    const len0 = seg0.length;
    // The Calm: hold the Glitch Realm (no morph) until the blackout at the Abyss border
    const calm = seg0.id === "glitch" && local0 > len0 - CALM_M;
    const dom = calm ? seg0 : st.dom; // segment the screen shows
    const bs = { a: st.a, b: st.b, t: calm ? 0 : st.t };
    // stop spawning a little before The Calm so it starts with an empty screen
    const preCalm = seg0.id === "glitch" && local0 > len0 - CALM_M - 35;
    this.calm = calm && playing;
    this.calmK = calm
      ? Phaser.Math.Clamp((local0 - (len0 - CALM_M)) / CALM_M, 0, 1)
      : 0;
    blendPalette(bs, this.pal);
    if (this.palMix > 0 && this.fromPal) {
      this.palMix = Math.max(0, this.palMix - rawDt * 1.4);
      for (const k of PAL_KEYS)
        this.pal[k] = lerpColor(this.pal[k], this.fromPal[k], this.palMix);
    }
    if (playing && dom.i !== this.biomeIndex) {
      this.biomeIndex = dom.i;
      if (dom.id === "abyss" && !this.levelRun) {
        // the Abyss: blackout first, then the slam (see enterAbyss)
        this.run.biome = dom.biome;
        this.blackoutT = Music.abyssDrop(0.5);
        this.blackout.setAlpha(1);
        this.calmVig.setAlpha(0);
        Music.endCalm(true);
        this.hudReady?.setBlackout?.(true);
      }
    }
    if (this.blackoutT <= 0 && playing && dom.i !== this.announcedBiome) {
      this.announcedBiome = dom.i;
      this.run.biome = dom.biome;
      Analytics.log("biome_reached", {
        biome: dom.id,
        m: Math.round(this.meters),
      });
      if (dom.id !== "abyss") {
        if (dom.i > 0) {
          // no pause on entry. The title, its sound and flash land on the realm's first beat
          // (the music's drop): usually the music got there a moment ago (see realmTitle);
          // otherwise they wait for it. Without music they happen right away, in this order.
          let late = false;
          let now = false;
          if (this.titledBiome !== dom.i)
            Music.cue(dom.id, () => {
              if (late) this.realmTitle(dom);
              else now = this.realmTitle(dom, false);
            });
          late = true;
          if (dom.dimension) this.enterDimension(dom);
          this.biomeBonus();
          if (now) this.flashBiome(dom);
        } else if (dom.dimension) {
          // test builds can start straight inside a dimension (?dimension=…)
          Music.play(dom.id, { startBar: 16 });
          this.hudReady?.onBiome?.(dom.biome);
          this.enterDimension(dom);
        }
      }
    }
    // the music lands on the realm ahead on a beat near the border: its title shows right then
    const ahead = this.course.next(seg0);
    if (
      playing &&
      this.blackoutT <= 0 &&
      ahead.id !== "abyss" &&
      ahead.i !== this.titledBiome &&
      Music.landedOn(ahead.id, seg0.end - this.meters)
    )
      this.realmTitle(ahead);
    if (playing) this.updateRift(seg0);
    this.updateTear(rawDt);
    // speed-up pulses every 250m
    const tier = Math.floor(this.meters / 250);
    if (playing && tier > this.lastSpeedTier) {
      this.lastSpeedTier = tier;
      // (levels show their progress bar instead of SPEED UP / distance pop-ups)
      if (tier % 2 === 1 && !this.levelRun) this.hudReady?.onSpeedUp?.();
    }

    // camera: a gentle zoom-out as the run speeds up (at most a few %, eased so it is never
    // noticed as a move) and a slight vertical lead toward where the hero is heading, smoothed.
    // Purely a view change: the playfield, hitboxes and spawn points are untouched.
    const cam = this.cameras.main;
    const zTarget =
      this.pxZoomLevel * (1 - CAMERA_FEEL.zoomOut * (playing ? speedNorm : 0));
    this.zoomLevel +=
      (zTarget - this.zoomLevel) * Math.min(1, rawDt * CAMERA_FEEL.zoomEase);
    cam.setZoom(VIEW.Z * this.zoomLevel);
    if (this.camBaseY === undefined) this.camBaseY = cam.scrollY;
    const pv = this.player.alive && playing ? this.player.vy : 0;
    const leadTarget = Phaser.Math.Clamp(
      pv * CAMERA_FEEL.lead,
      -CAMERA_FEEL.leadMax,
      CAMERA_FEEL.leadMax,
    );
    this.camLead =
      (this.camLead || 0) +
      (leadTarget - (this.camLead || 0)) *
        Math.min(1, rawDt * CAMERA_FEEL.leadEase);
    cam.scrollY = this.camBaseY + this.camLead;

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
    // pixel biome art follows the dominant biome (walls + backdrop crossfade on change; a
    // rift switches instantly under the screen tear)
    const biomeId = dom.id;
    // metres flown in the Abyss / Prism Rift and Prism Rifts survived (animal challenges)
    if (playing) {
      const dm = Math.max(0, this.meters - (this.zoneLastM ?? this.meters));
      if (this.zoneId === "prism" && biomeId !== "prism")
        this.run.prismClear = (this.run.prismClear || 0) + 1;
      if (this.zoneId === "abyss" && biomeId !== "abyss")
        this.run.abyssClear = (this.run.abyssClear || 0) + 1;
      this.zoneId = biomeId;
      if (biomeId === "abyss") this.run.abyssM = (this.run.abyssM || 0) + dm;
      if (biomeId === "prism") this.run.prismM = (this.run.prismM || 0) + dm;
    }
    this.zoneLastM = this.meters;
    // RONIN's Fire Ward: only while the run is in Solar Storm (off the moment he leaves)
    const fireWard =
      this.charDef.perks?.fireWard && biomeId === "solar" && playing;
    // SXE: indestructible for as long as the run is in the Glitch Realm
    this.glitchProof = !!(
      this.charDef.perks?.glitchProof &&
      biomeId === "glitch" &&
      playing
    );
    const ward = fireWard || this.glitchProof;
    this.obstacles.ward = this.glitchProof
      ? "all"
      : fireWard
        ? this.charDef.perks.fireWard
        : null;
    if (ward && !this.wardAura) {
      this.wardAura = this.add
        .image(0, 0, "glow")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(29);
    }
    if (ward) this.wardAura.setTint(this.glitchProof ? 0x39ff88 : 0xff2a3d);
    if (this.wardAura) {
      const p = this.player;
      this.wardFlashT = Math.max(0, (this.wardFlashT || 0) - rawDt);
      this.wardAura
        .setVisible(!!ward && !p.rig.dead)
        .setPosition(p.x, p.y)
        .setScale(
          1.25 + Math.sin(this.time.now / 260) * 0.06 + this.wardFlashT * 1.6,
        )
        .setAlpha(0.32 + this.wardFlashT * 1.8);
    }
    this.terrain.setTheme(themeFor(biomeId), dom.dimension);
    // build the next biome's art well before it arrives (it's made on demand to save memory)
    const nx = this.course.next(seg0);
    if (nx && nx.start - this.meters < 700) queueBiomeArt(nx.id);
    // once its art is in, build the biome's walls (hidden) on a later frame, not on arrival
    if (this.terrainTodo) this.terrain.prebuild([THEMES[this.terrainTodo]]);
    this.terrainTodo = pumpBiomeArt();
    this.updateColorShift(rawDt, biomeId, seg0 === dom ? local0 : 0);
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
      instant: dom.dimension,
      particleSpeed: 1 - this.calmK * 0.8,
    });
    this.fx.drift = this.scroll * 0.7;

    // player
    const p = this.player;
    if (this.state === "ready" || this.state === "won")
      p.hover(dt, this.scroll);
    else p.update(dt, this.scroll);

    // spawn windows: keep biome titles clear, no hazards in The Calm, gentle Abyss start
    const info = this.obstacles.info;
    info.rawIndex = dom.i;
    info.local = this.meters - dom.start;
    info.firstVisit = dom.firstVisit;
    info.dimension = dom.dimension;
    this.mirror = dom.id === "mirror" && playing;
    // Realm changes never pause the action: obstacles keep coming through every boundary
    // (the realm title shows small, high up, over the play). Only The Calm and the blackout
    // into the Abyss hold spawning — that is a designed moment.
    info.pause = playing && (calm || preCalm || this.blackoutT > 0);
    // gentle starts: the Abyss's first metres (spaced out), and the first seconds of every
    // dimension (only simple obstacles while its new mechanics settle in, at normal spacing)
    const dimGrace = (this.speed * DIMENSIONS.graceSeconds) / WORLD.pxPerMeter;
    info.grace = seg0.id === "abyss" && local0 < ABYSS.graceMeters;
    info.simpleOnly = info.grace || (seg0.dimension && local0 < dimGrace);
    if (this.levelRun) info.pause = info.grace = info.simpleOnly = false;
    this.updateCalmFx(rawDt);
    this.flashFx.update(rawDt);

    const ev = this.obstacles.update(dt, this.clock, this.scroll, null, {
      px: p.x,
      py: p.y,
      r: p.radius,
      alive: playing,
      meters: this.meters,
      biomeId: dom.id,
      zoom: this.zoomLevel,
      twinY: this.mirror ? this.H - p.y : null,
    });
    this.levelRun?.update(rawDt);
    // Chrono time zones ease in/out; the twin, horizon and prism trail follow the bird
    this.zoneScale +=
      ((playing ? ev.timeScale : 1) - this.zoneScale) * Math.min(1, rawDt * 5);
    this.updateDimensionFx(rawDt, dom);

    if (playing) {
      for (const o of ev.passed) {
        // side lasers and the Prism dimension's mirror lasers count (the vertical laser is gone)
        if (o.type === "laser" || o.type === "mlaser") this.run.lasers++;
        if (o.type === "saw") this.run.saws++;
      }
      if (ev.portal) this.portal(ev.portal);
      // Glitch Realm gravity-flip zones (harmless; flip only while inside)
      if (ev.zone !== this.inZone) {
        this.inZone = ev.zone;
        if (ev.zone) {
          p.flipGravity(-1);
          Sfx.portal();
          this.popNear(p.x + 50, p.y - 60, "FLIP ZONE", "#ff9ce8", 28);
        } else if (!this.obstacles.flipped) p.flipGravity(1);
      }
      if (ev.coins) {
        // some heroes multiply every coin (WALLRUNNER ×15); score from coins is unchanged
        const cm = this.charDef.coinMul ?? 1;
        this.run.coins += ev.coins * (this.lucky ? 2 : 1) * cm * this.coinBoost;
        if (cm > 1)
          this.popNear(
            p.x + 26,
            p.y - 40,
            `+${ev.coins * (this.lucky ? 2 : 1) * cm}`,
            "#ffd23f",
            30,
          );
        for (let i = 0; i < ev.coins; i++) this.addChain();
        const pts = COIN_BONUS * ev.coins * this.mult;
        this.bonus += pts;
        this.coinPts += pts;
        // coins in quick succession climb a scale
        this.coinStep =
          this.coinStepT > 0 ? Math.min(12, this.coinStep + 1) : 0;
        this.coinStepT = 0.8;
        Sfx.coin(this.coinStep);
        Haptics.light();
        this.hudReady?.onCoin?.(this.run.coins);
      }
      for (const o of ev.near) this.nearMiss(o);
      for (const o of ev.perfect) this.perfect(o);
      // dimension fields: Tidal currents push, bubble columns drag, Chrono zones bend time
      if (ev.push) p.vy += ev.push * dt;
      if (ev.drag) p.vy *= Math.exp(-ev.drag * dt);
      for (const o of ev.warded) this.fireWardBlock(o);
      const r = p.radius;
      const shielded = this.boostT > 0 || this.boostGrace > 0; // boosting smashes through
      if (this.glitchProof) {
        // SXE in the Glitch Realm: the screen edges hold him instead of ending the run
        const top = r;
        const bottom = this.H - r;
        if (p.y < top) {
          p.y = top;
          p.vy = Math.max(0, p.vy);
        }
        if (p.y > bottom) {
          p.y = bottom;
          p.vy = Math.min(0, p.vy);
        }
      } else if (
        (ev.hit && !shielded) ||
        p.y < -r * 0.6 ||
        p.y > this.H + r * 0.6
      )
        this.die();

      // combo window runs on real time (slow-mo doesn't stretch it)
      if (this.chainT > 0) {
        this.chainT -= rawDt;
        if (this.chainT <= 0) {
          this.chain = 0;
          this.mult = 1;
          if (this.player?.rig) this.player.rig.comboTier = 1; // Combo Flame trail cools down
          this.comboMeter.setTier(1);
        }
      }
      this.comboMeter.update(
        rawDt,
        p.x,
        p.y,
        Math.max(0, this.chainT / COMBO_WINDOW),
      );
      if (this.coinStepT > 0) this.coinStepT -= rawDt;
      while (this.meters >= this.nextMilestone) {
        if (!this.levelRun) this.milestone(this.nextMilestone);
        this.nextMilestone += 100;
      }
      if (this.lucky) {
        this.sparkleT -= rawDt;
        if (this.sparkleT <= 0) {
          this.sparkleT = 0.12;
          this.fx.burst("star", p.x - 18, p.y + 4, 1, 0xffd23f, {
            speed: { min: 20, max: 80 },
          });
        }
      }
      this.run.distance = Math.floor(this.meters);
      this.run.score = this.score;

      if (
        !this.passedBest &&
        !this.run.boosted &&
        this.bestScore > 0 &&
        this.score > this.bestScore
      ) {
        this.passedBest = true;
        this.hudReady?.onNewBest?.();
        this.player.rig.flex({ shine: true, big: true }); // YARMS: big flex + gold shine
        this.player.rig.onBest(); // 손주원: roar + a lightning bolt behind it
        if (this.charDef.id === "sonjuwon")
          this.flashFx.flash(0xbfe8ff, FLASH.newBest);
        if (this.hudReady?.onCenterBest) this.hudReady.onCenterBest();
        else this.fx.floatText(p.x + 20, p.y - 120, "NEW BEST!", "#ffd23f", 50);
        Sfx.newBest();
        Haptics.strong();
        this.fx.burst("star", p.x, p.y, 24, 0xffd23f, {
          speed: { min: 150, max: 420 },
        });
        this.fx.burst("pixel", p.x, p.y, 18, 0xfff1a0, {
          speed: { min: 240, max: 620 },
        });
        this.fx.ring(p.x, p.y, 0xffd23f, { scale: 1.6, duration: 520 });
        this.flashFx.flash(0xffd23f, FLASH.newBest);
      }
      this.missionCheckT -= rawDt;
      if (this.missionCheckT <= 0) {
        this.missionCheckT = 0.4;
        for (const m of Progression.liveMissionCheck(
          this.run,
          this.missionAnnounced,
        ))
          this.hudReady?.onMission?.(m);
      }
    }

    // dying → game over
    if (dying) {
      this.deathT += rawDt;
      if (this.deathT > 0.85) {
        // level mode: back to the last checkpoint (no game over)
        if (this.levelRun) this.levelRun.respawn();
        else this.finishRun();
      }
    }

    this.terrain.update(dt, this.scroll);

    this.fx.update(rawDt);
  }

  // ------------------------------------------------------------------ dimensions
  /** Flying through a rift: the screen tears apart, a white flash, then the title. */
  enterDimension(dom) {
    this.tearT = DIMENSIONS.tearSeconds;
    this.tearSeed = Math.random() * 1000;
    this.flashFx.flash(0xffffff, { ...FLASH.rift, priority: true });
    Sfx.rift();
    Haptics.strong();
    const found = (Save.data.dimensions ||= {});
    if (!found[dom.id]) {
      found[dom.id] = true;
      this.run.newDimension = dom.id;
      Save.write();
    }
  }

  /** Per-dimension visuals that follow the bird: the Mirror twin + horizon, prism trail. */
  updateDimensionFx(rawDt, dom) {
    const p = this.player;
    // Prism Rift paints the trail in rainbow light (a Lucky Run keeps its gold)
    if (!this.lucky)
      p.rig.trailOverride =
        dom.id === "prism"
          ? [0xffffff, 0xff9ad8, 0xfff09a, 0x9ae8ff, 0x9aff9a]
          : null;
    if (dom.id === "chrono") Music.setTempoScale(this.zoneScale);
    const g = this.horizon;
    g.clear();
    if (!this.mirror) {
      if (this.twin.sprite.visible) this.twin.setVisible(false);
      this.twin.trailG.clear();
      return;
    }
    // the glowing horizon the realm is mirrored across
    const H = this.H;
    const v = this.cameras.main.worldView;
    const pulse = 0.55 + 0.25 * Math.sin(this.clock * 3);
    g.fillStyle(0x9a3aff, 0.25 * pulse).fillRect(v.x, H / 2 - 6, v.width, 12);
    g.fillStyle(0xe8d0ff, 0.8 * pulse).fillRect(v.x, H / 2 - 1, v.width, 2);
    // glitchy reflection distortion now and then (purely visual)
    this.glitchT -= rawDt;
    let jitter = 0;
    if (this.glitchT < 0.14) {
      jitter = (Math.random() - 0.5) * 16;
      for (let i = 0; i < 3; i++)
        g.fillStyle(0xc87aff, 0.18).fillRect(
          v.x,
          v.y + Math.random() * (H / 2),
          v.width,
          4 + Math.random() * 8,
        );
      if (this.glitchT < 0) this.glitchT = 2 + Math.random() * 3;
    }
    // the twin: same x, reflected y, upside down, copying every move
    const t = this.twin;
    if (!t.sprite.visible && p.alive) t.setVisible(true);
    t.gravityDir = -p.gravityDir;
    t.angle = -p.rig.angle;
    t.sizeMul = p.sizeMul;
    t.setPosition(p.x + jitter, H - p.y);
    t.update(rawDt * this.timeScale, this.scroll);
    t.sprite.setAlpha(0.75);
  }

  /** The glowing rift portal at the end of a segment that leads into a dimension. */
  updateRift(seg0) {
    const PX = WORLD.pxPerMeter;
    if (!this.rift && this.course.riftAfter(seg0)) {
      const ahead = (seg0.end - this.meters) * PX;
      if (ahead < this.W * 1.6) {
        const to = this.course.next(seg0);
        this.rift = this.add
          .graphics()
          .setDepth(19)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.rift.endM = seg0.end;
        this.rift.col = BIOMES[to.biome].neon;
        Sfx.riftOpen();
      }
    }
    const r = this.rift;
    if (!r) return;
    const x = this.player.x + (r.endM - this.meters) * PX;
    if (x < -this.W) {
      r.destroy();
      this.rift = null;
      return;
    }
    // a jagged vertical tear of light, flickering; drawn on the art-pixel grid
    const H = this.H;
    const t = this.clock;
    r.clear();
    for (const [w, a, c] of [
      [70, 0.22, r.col],
      [34, 0.45, r.col],
      [12, 0.95, 0xffffff],
    ]) {
      r.fillStyle(c, a * (0.85 + 0.15 * Math.sin(t * 17)));
      for (let y = -60; y < H + 60; y += 16) {
        const j =
          Math.round(
            (Math.sin(y * 0.05 + t * 6) * 10 + Math.sin(y * 0.13 - t * 9) * 6) /
              S,
          ) * S;
        const ww =
          Math.round((w * (0.75 + 0.25 * Math.sin(y * 0.09 + t * 4))) / S) * S;
        r.fillRect(Math.round((x + j - ww / 2) / S) * S, y, ww, 16);
      }
    }
    if (Math.random() < 0.5)
      this.fx.burst("pixel", x, Math.random() * H, 2, r.col, {
        speed: { min: 40, max: 160 },
      });
  }

  /** Screen tear while entering a dimension: offset light bands + jagged cracks, ~0.45 s. */
  updateTear(rawDt) {
    const g = this.tearG;
    if (this.tearT <= 0) return;
    this.tearT -= rawDt;
    g.clear();
    if (this.tearT <= 0) return;
    const k = this.tearT / DIMENSIONS.tearSeconds;
    const v = this.cameras.main.worldView;
    let s = this.tearSeed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const soft = this.flashFx.reduce ? 0.35 : 1;
    const col = BIOMES[this.course.segAt(this.meters).biome].neon;
    for (let i = 0; i < 9; i++) {
      const y = v.y + rnd() * v.height;
      const h = 10 + rnd() * v.height * 0.07;
      const off = (rnd() - 0.5) * 160 * k;
      g.fillStyle(i % 3 ? col : 0xffffff, 0.45 * k * soft);
      g.fillRect(v.x + off, y, v.width, h);
    }
    for (let c = 0; c < 3; c++) {
      let x = v.x + rnd() * v.width;
      g.lineStyle(10, 0x000000, 0.8 * k);
      const pts = [];
      for (let y = v.y; y <= v.bottom + 40; y += 40) {
        x += (rnd() - 0.5) * 90;
        pts.push({ x, y });
      }
      g.strokePoints(pts);
      g.lineStyle(3, 0xffffff, k * soft);
      g.strokePoints(pts);
    }
  }

  /** Backdrop colour drifts through the biome's related colours every SHIFT_EVERY m. */
  updateColorShift(rawDt, biomeId, local) {
    const list = SHIFTS[biomeId] || SHIFTS.void;
    const target =
      list[Math.floor(Math.max(0, local) / SHIFT_EVERY) % list.length];
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
    const seg = this.course.segAt(this.meters);
    const local0 = this.meters - seg.start;
    let target = 1;
    const id = seg.id;
    if (this.calm) target = 1 - CALM.slowdown * this.calmK;
    else if (id === "abyss")
      target = ABYSS.speedSpike + ABYSS.speedRamp * (local0 / seg.length);
    else if (seg.dimension)
      target = ABYSS.speedSpike + ABYSS.speedRamp; // the Abyss's top speed
    else target = BIOME_SPEED[id] ?? 1; // e.g. the Glitch Realm a touch slower, the Valley drifts
    if (target > this.speedMul)
      this.speedMul = Math.min(target, this.speedMul + rawDt * 0.5);
    else this.speedMul = Math.max(target, this.speedMul - rawDt * 0.12);
  }

  enterAbyss() {
    this.inAbyss = true;
    this.blackout.setAlpha(0);
    this.hudReady?.setBlackout?.(false);
    this.setDesat(0);
    this.cameras.main.shake(380, 0.012);
    this.flashFx.flash(0xff0820, { ...FLASH.abyss, priority: true });
    this.time.delayedCall(
      700,
      () => this.state === "playing" && this.biomeBonus(),
    );
    Sfx.biome();
    Music.play("abyss", { startBar: 16, immediate: true });
    this.hudReady?.onBiome?.(this.course.segAt(this.meters).biome, {
      slam: true,
    });
    this.announcedBiome = this.biomeIndex;
  }

  updateCalmFx(rawDt) {
    const k = this.calm ? this.calmK : 0;
    // edges darken, colours drain, music sinks to a hum under a rising heartbeat
    this.calmVig.setAlpha(this.blackoutT > 0 ? 0 : k * k * 0.95);
    this.setDesat(k);
    if (this.calm) Music.setCalm(k);
    // Abyss limited vision (fades in after the slam, out when the Abyss ends)
    const inAbyssZone =
      this.course.segAt(this.meters).id === "abyss" && this.blackoutT <= 0;
    const target = inAbyssZone && this.state !== "dead" ? ABYSS.darkAlpha : 0;
    this.darkA +=
      Math.sign(target - this.darkA) *
      Math.min(Math.abs(target - this.darkA), rawDt * 0.7);
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
    const cams = [this.cameras.main, this.backdrop?.cameras?.main].filter(
      Boolean,
    );
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
