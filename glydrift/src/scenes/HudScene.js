// In-run HUD overlay: score, coins, banners, toasts, pause. Unaffected by camera zoom/post-FX.
import Phaser from "phaser";
import { BIOMES, biomeName } from "../biomes/biomes.js";
import { fitCamera, NUM_FONT, PHYSICS, VIEW } from "../config.js";
import { HI } from "../gfx/textures.js";
import { Music } from "../audio/music.js";
import { dailyNumber } from "../data/rng.js";
import { Sfx } from "../audio/sfx.js";
import { POP_HOLD, PopQueue } from "../ui/popQueue.js";
import {
  button,
  drawNeonRect,
  hex,
  neonText,
  plainText,
  RollingCounter,
  slider,
} from "../ui/ui.js";
import { Save } from "../data/save.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { levelNameLine } from "../ui/levelName.js";

/** Realm titles: drawn this much smaller than full size, centred this far below the HUD top. */
const REALM_TITLE_SCALE = 0.68;
const REALM_TITLE_Y = 380;

export class HudScene extends Phaser.Scene {
  constructor() {
    super("Hud");
  }

  init(data) {
    this.gameScene = data.game;
    this.ready = false;
  }

  create() {
    // the scene object outlives its game objects: drop text caches from the previous visit
    // (reusing destroyed texts crashed the first banner after Home → Play)
    this.titles = null;
    this.runBanners = null;
    this.bannerQ = null;
    this.bannerIdx = -1;
    this.speedText = null;
    this.centerText = null;
    // realm titles, NEW BEST, SPEED UP and distance markers share the centre one at a time
    this.pops = new PopQueue(
      (item) => this.showPop(item),
      (item) => this.hidePop(item),
    );
    fitCamera(this);
    // Esc / P toggle pause (handled here: the Game scene's input stops while it's paused)
    for (const k of ["ESC", "P"])
      this.input.keyboard?.on(`keydown-${k}`, (e) => {
        if (e?.repeat) return;
        if (this.pauseLayer) this.resume();
        else this.pause();
      });
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.sys.setVisible(true); // may have been hidden by a previous GameOver
    const top = (this.registry.get("safeTop") || 0) + 24;
    this.top = top;
    const gs = this.gameScene;

    this.scoreText = neonText(this, W / 2, top + 50, "0", 64, 0x3ef4ff, { blur: 22 });
    this.score = new RollingCounter(this, this.scoreText);
    this.bestText = plainText(this, W / 2, top + 100, "", 18, "#cfc6ff");
    this.modeText = plainText(
      this,
      W / 2,
      top + 126,
      gs.mode === "daily" ? `DAILY CHALLENGE #${dailyNumber()}` : "",
      16,
      "#ffd23f",
    );

    // coins
    this.coinIcon = this.add.image(W - 120, top + 46, "coin").setScale(0.8 / HI);
    this.coinText = neonText(this, W - 96, top + 46, "0", 30, 0xffc83d, { ox: 0, blur: 10 });
    this.coins = new RollingCounter(this, this.coinText);

    // pause
    this.pauseBtn = this.add.container(58, top + 46);
    const pg = this.add.graphics();
    pg.fillStyle(0x0a0418, 0.7).fillCircle(0, 0, 34);
    pg.lineStyle(3, 0x3ef4ff, 1).strokeCircle(0, 0, 34);
    pg.fillStyle(0xffffff, 1).fillRoundedRect(-11, -13, 7, 26, 2).fillRoundedRect(4, -13, 7, 26, 2);
    this.pauseBtn.add(pg);
    this.pauseBtn
      .setSize(80, 80)
      .setInteractive(new Phaser.Geom.Circle(40, 40, 40), Phaser.Geom.Circle.Contains);
    this.pauseBtn.on("pointerdown", () => this.pause());

    // status (mini / flip)
    this.statusText = neonText(this, W / 2, top + 160, "", 22, 0xffd23f, { blur: 10 }).setAlpha(0);
    this.miniBar = this.add.graphics();

    // tap hint
    this.hint = this.add.container(W / 2, H * 0.68);
    const ht = neonText(this, 0, 0, "TAP TO FLY", 44, 0xff4fd8, { blur: 20 });
    const hand = this.add.image(0, 80, "dot").setScale(1.2).setBlendMode(Phaser.BlendModes.ADD);
    this.hint.add([ht, hand]);
    this.tweens.add({
      targets: ht,
      scale: 1.08,
      yoyo: true,
      repeat: -1,
      duration: 600,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: hand,
      y: 64,
      scale: 0.8,
      yoyo: true,
      repeat: -1,
      duration: 420,
      ease: "Quad.easeInOut",
    });

    // banners
    // realm titles show over the play without interrupting it: small, high up, just below the
    // run-banner lane (top + 250), with a light backing that keeps the flight path visible
    this.bannerY = this.top + REALM_TITLE_Y;
    this.banner = this.add.container(W / 2, this.bannerY).setAlpha(0);
    // dark backing keeps the title readable over hazards
    this.bannerBack = this.add.graphics();
    this.bannerBack.fillStyle(0x000000, 0.42).fillRoundedRect(-300, -84, 600, 150, 24);
    this.banner.add(this.bannerBack);
    this.bannerSub = plainText(this, 0, -46, "ENTERING", 20, "#ffffff");
    this.bannerText = neonText(this, 0, 0, "", 56, 0xffffff, { blur: 26 });
    this.bannerLine = this.add.rectangle(0, 42, 420, 3, 0xffffff);
    this.banner.add([this.bannerSub, this.bannerText, this.bannerLine]);

    this.comboText = neonText(this, W / 2, top + 200, "", 28, 0xffffff, { blur: 12 }).setAlpha(0);
    // keep the HUD below the notch / Dynamic Island if the safe-area inset arrives late
    const topElems = [
      this.scoreText,
      this.bestText,
      this.modeText,
      this.coinIcon,
      this.coinText,
      this.pauseBtn,
      this.statusText,
      this.comboText,
    ];
    const onSafe = (_p, value) => {
      const nt = (value || 0) + 24;
      const d = nt - this.top;
      if (!d) return;
      this.top = nt;
      for (const o of topElems) if (o) o.y += d;
      this.bannerY = nt + REALM_TITLE_Y;
    };
    this.registry.events.on("changedata-safeTop", onSafe);
    this.events.once("shutdown", () => this.registry.events.off("changedata-safeTop", onSafe));

    for (let i = 0; i < BIOMES.length; i++) this.titleFor(i, BIOMES[i].id === "abyss");

    this.pauseLayer = null;
    this.ready = true;
    this.events.once("shutdown", () => {
      this.ready = false;
    });
    this.onReset();
  }

  isOverHud(pointer) {
    if (!pointer) return false;
    return (
      Phaser.Math.Distance.Between(
        pointer.worldX,
        pointer.worldY,
        this.pauseBtn.x,
        this.pauseBtn.y,
      ) < 50 || !!this.pauseLayer
    );
  }

  // ------------------------------------------------------------------ events from GameScene
  onReset() {
    const gs = this.gameScene;
    this.pops.clear();
    this.score.set(0);
    this.coins.set(0);
    this.lastScore = 0;
    this.bestText.setText(gs.bestScore > 0 ? `BEST ${gs.bestScore}` : "");
    // "TAP TO FLY" only before the first flap (the run may already be live if the first tap
    // landed before this HUD finished starting)
    const waiting = gs.state === "ready";
    this.hint.setVisible(waiting).setAlpha(waiting ? 1 : 0);
    this.cameras.main.setAlpha(1);
    this.pauseBtn.setVisible(true);
    this.scoreText.setAlpha(1);
  }

  /** "TAP TO FLY" again (a level waiting at its checkpoint after a crash). */
  showTapHint() {
    this.tweens.killTweensOf(this.hint);
    this.hintFading = false;
    this.hint.setVisible(true).setAlpha(1);
  }

  onStart() {
    this.hintFading = true;
    this.tweens.add({
      targets: this.hint,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.hint.setVisible(false);
        this.hintFading = false;
      },
    });
  }

  onNearMiss(pts, combo) {
    this.comboText.setText(combo > 1 ? `COMBO x${combo}  +${pts}` : `+${pts}`).setColor("#ffffff");
    this.comboText.setAlpha(1).setScale(0.5);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 220, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 900, duration: 400 });
  }

  onCoin(n) {
    this.coins.bump(n);
    this.tweens.add({
      targets: this.coinIcon,
      scale: { from: 1.25 / HI, to: 0.8 / HI },
      duration: 200,
      ease: "Back.easeOut",
    });
    // the number itself bounces too
    const t = this.coins.text;
    this.tweens.killTweensOf(t);
    t.setScale(1);
    this.tweens.add({
      targets: t,
      scale: { from: 1.3, to: 1 },
      duration: 220,
      ease: "Back.easeOut",
    });
  }

  /**
   * Biome titles are rendered once and reused: re-styling one shared text object meant three
   * full text re-renders + GPU uploads (text, stroke, glow) right at the biome change.
   */
  titleFor(rawIndex, slam) {
    const name = biomeName(rawIndex);
    const key = `${name}|${slam ? 1 : 0}`;
    this.titles ||= {};
    let t = this.titles[key];
    if (!t) {
      const col = slam ? 0xff1030 : BIOMES[rawIndex % BIOMES.length].neon;
      t = neonText(this, 0, 0, name, 56, 0xffffff, { blur: 26 });
      t.setStroke(hex(col), slam ? 5 : 4).setShadow(0, 0, hex(col), slam ? 30 : 26, true, true);
      t.setVisible(false);
      this.banner.add(t);
      this.titles[key] = t;
    }
    return t;
  }

  showTitle(rawIndex, slam) {
    const t = this.titleFor(rawIndex, slam);
    for (const o of Object.values(this.titles)) o.setVisible(o === t);
    this.bannerText.setVisible(false);
  }

  onBiome(rawIndex, { slam = false } = {}) {
    this.pops.push("realm", { rawIndex, slam }, this.time.now);
  }

  showRealm(rawIndex, slam, done) {
    const b = BIOMES[rawIndex % BIOMES.length];
    this.showTitle(rawIndex, slam);
    if (slam) return this.slamTitle(rawIndex, b, done);
    this.bannerLine.setFillStyle(b.neon);
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0).setScale(1.6 * REALM_TITLE_SCALE).setY(this.bannerY);
    this.bannerLine.scaleX = 0;
    this.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: REALM_TITLE_SCALE,
      duration: 500,
      ease: "Back.easeOut",
    });
    this.tweens.add({ targets: this.bannerLine, scaleX: 1, duration: 700, ease: "Cubic.easeOut" });
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      y: this.bannerY - this.H * 0.03,
      delay: 1900,
      duration: 500,
      onComplete: () => {
        this.banner.y = this.bannerY;
        done?.();
      },
    });
  }

  /** "ENTERING ABYSS": slams in from huge with a shake (the Game scene adds the red flash). */
  slamTitle(rawIndex, b, done) {
    this.tweens.killTweensOf(this.banner);
    this.bannerLine.setFillStyle(0xff1030);
    this.banner.setAlpha(1).setScale(3.2).setY(this.bannerY);
    this.bannerLine.scaleX = 1;
    this.tweens.add({ targets: this.banner, scale: 1, duration: 170, ease: "Quad.easeIn" });
    this.cameras.main.shake(320, 0.012);
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: 2600,
      duration: 500,
      onComplete: () => done?.(),
    });
    void rawIndex;
    void b;
  }

  /** Blackout before the Abyss: the HUD goes dark with the world. */
  setBlackout(on) {
    this.cameras.main.setAlpha(on ? 0 : 1);
  }

  /**
   * Run banners (mission / new best / tips): slide in from the side below the score and
   * out again quickly; queued so two never overlap.
   */
  hudBanner(text, color, sub) {
    const W = this.W;
    const y = this.top + 250;
    const q = (this.bannerQ ||= { t: 0 });
    const now = this.time.now;
    const delay = Math.max(0, q.t - now);
    q.t = now + delay + 2000;
    // two reusable banners (alternating) — no text objects created mid-run
    this.runBanners ||= [0, 1].map(() => {
      const c = this.add
        .container(W + 320, y)
        .setDepth(80)
        .setVisible(false);
      c.g = this.add.graphics();
      c.title = neonText(this, 0, -13, "", 24, 0xffffff, { blur: 8 });
      c.sub = plainText(this, 0, 20, "", 16, "#d8d0ff");
      c.add([c.g, c.title, c.sub]);
      return c;
    });
    const c = this.runBanners[(this.bannerIdx = ((this.bannerIdx ?? -1) + 1) % 2)];
    this.tweens.killTweensOf(c);
    const w = Math.min(W - 60, 520);
    const h = sub ? 84 : 64;
    const show = () => {
      c.g.clear();
      drawNeonRect(c.g, -w / 2, -h / 2, w, h, 18, color, { fillAlpha: 0.92 });
      c.title
        .setText(text)
        .setY(sub ? -13 : 0)
        .setStroke(hex(color), 2);
      c.title.setShadow(0, 0, hex(color), 8 * VIEW.Z, true, true);
      c.sub.setText(sub || "").setVisible(!!sub);
      c.setPosition(W + 320, y).setVisible(true);
      Sfx.reward();
    };
    this.time.delayedCall(delay, show);
    this.tweens.add({ targets: c, x: W / 2, delay, duration: 200, ease: "Cubic.easeOut" });
    this.tweens.add({
      targets: c,
      x: -320,
      delay: delay + 1700,
      duration: 200,
      ease: "Cubic.easeIn",
      onComplete: () => c.setVisible(false),
    });
  }

  onSpeedUp() {
    this.pops.push("speed", null, this.time.now);
  }

  /** NEW BEST! in the centre (the slide-in banner below the score still shows too). */
  onCenterBest() {
    this.pops.push("best", { str: "NEW BEST!", color: "#ffd23f", size: 50 }, this.time.now);
  }

  /** Distance marker: every 100 m small, 500 m / 1000 m big and gold. */
  onDistance(m, big) {
    const data = big
      ? { str: `${m}m!`, color: "#ffd23f", size: big > 1 ? 60 : 50 }
      : { str: `${m}m`, color: "#bdf9ff", size: 30 };
    this.pops.push("distance", data, this.time.now);
  }

  // ------------------------------------------------------------------ centre pop-ups
  showPop(item) {
    const d = item.data;
    const done = () => this.pops.release(item);
    if (item.kind === "realm") {
      this.showRealm(d.rawIndex, d.slam, done);
      // a realm title never has pops on top: clear any already rising through its strip
      this.gameScene?.clearPopsIn?.(this.centerBandFor("realm"));
    }
    else if (item.kind === "speed") this.showSpeed(done);
    else this.showCenterText(d.str, d.color, d.size, done);
    // released when its animation really ends; this is only the fallback
    return POP_HOLD[item.kind] + (d?.slam ? 700 : 0) + 1500;
  }

  hidePop(item) {
    const o =
      item.kind === "realm"
        ? this.banner
        : item.kind === "speed"
          ? this.speedText
          : this.centerText;
    if (!o) return;
    // cut short: gone at once, so it never overlaps the pop-up replacing it
    this.tweens.killTweensOf(o);
    o.setAlpha(0);
    if (o !== this.banner) o.setVisible(false);
  }

  /** Same look as the in-world pop text (Effects.floatText), centred and scaled to match. */
  showCenterText(str, color, size, done) {
    const z = this.worldZoom();
    if (!this.centerText) {
      this.centerText = this.add
        .text(0, 0, "", {
          fontFamily: NUM_FONT,
          resolution: VIEW.Z,
          fontSize: "34px",
          fontStyle: "700",
          color: "#fff",
          stroke: "#000000",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setPadding(18, 18, 18, 18)
        .setDepth(60);
    }
    const t = this.centerText;
    this.tweens.killTweensOf(t);
    if (t.__color !== color || t.__size !== size || t.__z !== z) {
      t.__color = color;
      t.__size = size;
      t.__z = z;
      t.setColor(color)
        .setFontSize(Math.round(size * z))
        .setStroke("#000000", 6 * z)
        .setShadow(0, 0, color, 16 * VIEW.Z * z, true, true);
    }
    const y = this.centerY();
    t.setText(str)
      .setPosition(this.W / 2, y)
      .setScale(0.3)
      .setAlpha(1)
      .setVisible(true)
      .setAngle(Phaser.Math.Between(-8, 8));
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({
      targets: t,
      y: y - 70 * z,
      alpha: 0,
      delay: 380,
      duration: 520,
      ease: "Cubic.easeIn",
      onComplete: () => {
        t.setVisible(false);
        done?.();
      },
    });
  }

  /** The in-run world is drawn zoomed relative to the HUD: pop text keeps its world size. */
  worldZoom() {
    const g = this.gameScene?.cameras?.main;
    return g ? g.zoom / this.cameras.main.zoom : 1;
  }

  centerY() {
    return this.H * 0.4;
  }

  /**
   * The strip of the screen (HUD coordinates) the live centre pop-up uses, or null. Pop text
   * near the bird is moved out of it.
   */
  centerBand() {
    const cur = this.pops.live(this.time.now);
    return cur ? this.centerBandFor(cur.kind, cur.data) : null;
  }

  centerBandFor(kind, data) {
    if (kind === "realm") {
      const k = this.banner.scale || 1;
      return { y0: this.bannerY - 96 * k, y1: this.bannerY + 78 * k };
    }
    const cur = { kind, data };
    const y = this.centerY();
    if (cur.kind === "speed") return { y0: y - 44, y1: y + 44 };
    const h = (cur.data.size * this.worldZoom()) / 2 + 22;
    return { y0: y - 70 * this.worldZoom() - h, y1: y + h };
  }

  showSpeed(done) {
    // one reusable label (creating text mid-run uploads a new texture → hitch)
    if (!this.speedText) {
      this.speedText = neonText(this, this.W / 2, this.H * 0.4, "SPEED UP", 40, 0xff4fd8, {
        blur: 18,
      });
    }
    const t = this.speedText;
    this.tweens.killTweensOf(t);
    t.setPosition(this.W / 2, this.H * 0.4)
      .setAlpha(0)
      .setScale(0.6)
      .setVisible(true);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({
      targets: t,
      alpha: 0,
      x: this.W / 2 - 160,
      delay: 700,
      duration: 360,
      onComplete: () => {
        t.setVisible(false);
        done?.();
      },
    });
  }

  onNewBest() {
    this.hudBanner("NEW BEST!", 0xffd23f, "You beat your best run");
  }

  onMission(m) {
    this.hudBanner("MISSION COMPLETE", 0x39ff88, m.text);
  }

  onPortal() {}

  onToast(title, sub) {
    this.hudBanner(title, 0x3ef4ff, sub);
  }

  onDeath() {
    if (this.gameScene?.mode === "level") return; // levels respawn: keep the pause button
    this.tweens.add({
      targets: [this.pauseBtn],
      alpha: 0,
      duration: 200,
      onComplete: () => this.pauseBtn.setVisible(false).setAlpha(1),
    });
  }

  // ------------------------------------------------------------------ pause
  /** Can the run be paused right now? Levels can also pause before the first tap. */
  canPause() {
    const gs = this.gameScene;
    if (!gs) return false;
    if (gs.state === "playing") return true;
    return gs.mode === "level" && gs.state === "ready";
  }

  pause() {
    const gs = this.gameScene;
    if (this.pauseLayer || !this.canPause()) return;
    this.scene.pause("Game");
    Music.muffle(true);
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.78).setInteractive();
    c.add(dim);
    c.page = this.add.container(0, 0);
    c.add(c.page);
    this.pauseLayer = c;
    if (gs.mode === "level") this.levelPauseMenu();
    else {
      const title = neonText(this, W / 2, H * 0.36, "PAUSED", 64, 0x3ef4ff);
      const resume = button(this, W / 2, H * 0.5, 360, 96, "RESUME", {
        color: 0x39ff88,
        onClick: () => this.resume(),
      });
      const home = button(this, W / 2, H * 0.5 + 120, 360, 84, "HOME", {
        color: 0xff4fd8,
        size: 26,
        onClick: () => {
          this.resume(true);
          this.scene.stop("Game");
          this.scene.start("Menu");
        },
      });
      c.page.add([title, resume, home]);
    }
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  /** LEVEL MODE pause: Resume, Restart Level, Practice Mode, Settings, Back to Level Map. */
  levelPauseMenu() {
    const gs = this.gameScene;
    const def = gs.levelDef;
    const W = this.W;
    const H = this.H;
    const page = this.pauseLayer.page;
    page.removeAll(true);
    const y0 = H * 0.24;
    page.add(neonText(this, W / 2, y0, "PAUSED", 60, 0x3ef4ff));
    const name = levelNameLine(this, W / 2, y0 + 64, def, 22, { maxW: W - 100, color: "#cfc6ff" });
    page.add(name);
    if (gs.practice) page.add(plainText(this, W / 2, y0 + 100, "PRACTICE", 18, "#7ae8ff"));
    const restart = (practice) => {
      this.resume(true);
      this.scene.stop("Game");
      this.scene.start("Game", { mode: "level", level: def.n, practice });
    };
    const items = [
      ["RESUME", 0x39ff88, () => this.resume(), 96, 34],
      ["RESTART LEVEL", 0x3ef4ff, () => restart(gs.practice), 80, 24],
      // in practice the same slot plays it for real
      [gs.practice ? "PLAY FOR REAL" : "PRACTICE MODE", 0xffd23f, () => restart(!gs.practice), 80, 24],
      ["SETTINGS", 0xb45cff, () => this.pauseSettings(), 80, 24],
      [
        "BACK TO LEVEL MAP",
        0xff4fd8,
        () => {
          this.resume(true);
          this.scene.stop("Game");
          this.scene.start("LevelSelect");
        },
        80,
        22,
      ],
    ];
    let y = y0 + 190;
    for (const [label, color, onClick, h, size] of items) {
      page.add(button(this, W / 2, y, 420, h, label, { color, size, onClick }));
      y += h + 26;
    }
  }

  /** Settings while paused: volumes, mute and Reduce Flashing (Low Graphics needs a reload). */
  pauseSettings() {
    const W = this.W;
    const H = this.H;
    const st = Save.data.settings;
    const page = this.pauseLayer.page;
    page.removeAll(true);
    const y0 = H * 0.22;
    page.add(neonText(this, W / 2, y0, "SETTINGS", 48, 0x3ef4ff, { blur: 14 }));
    slider(this, 90, y0 + 110, W - 180, st.musicVol ?? 0.7, 0x39ff88, (v) => {
      st.musicVol = v;
      Music.applyVolume();
    }, { container: page, label: "MUSIC" });
    slider(this, 90, y0 + 205, W - 180, st.sfxVol ?? 0.8, 0x3ef4ff, (v) => {
      st.sfxVol = v;
      Sfx.ui?.();
    }, { container: page, label: "SOUND EFFECTS" });
    const mute = button(this, W / 2, y0 + 300, 420, 72, st.muted ? "UNMUTE" : "MUTE ALL", {
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
    const flashLabel = () => `REDUCE FLASHING: ${reduceFlashing() ? "ON" : "OFF"}`;
    const flash = button(this, W / 2, y0 + 392, 420, 72, flashLabel(), {
      color: 0xb45cff,
      size: 18,
      onClick: () => {
        st.reduceFlash = !reduceFlashing();
        Save.write();
        flash.setLabel(flashLabel());
      },
    });
    page.add([
      mute,
      flash,
      plainText(this, W / 2, y0 + 466, "Low Graphics is on the home screen's settings", 15, "#8a80b0"),
      button(this, W / 2, y0 + 560, 300, 80, "BACK", {
        color: 0x39ff88,
        size: 24,
        onClick: () => {
          Save.write();
          this.levelPauseMenu();
        },
      }),
    ]);
  }

  resume(silent) {
    if (!this.pauseLayer) return;
    const c = this.pauseLayer;
    this.pauseLayer = null;
    c.destroy();
    Music.muffle(false);
    if (!silent) this.scene.resume("Game");
  }

  update() {
    const gs = this.gameScene;
    if (!gs || (!gs.sys.isActive() && !gs.sys.isPaused())) return;
    if (gs.sys.isActive()) this.pops.update(this.time.now);
    if (this.hint.visible && gs.state !== "ready" && !this.hintFading) this.hint.setVisible(false);
    const s = gs.score;
    if (s !== this.lastScore) {
      if (s - this.lastScore > 5) this.score.bump(s);
      else this.score.set(s);
      this.lastScore = s;
    }
    // mini + flip status
    const p = gs.player;
    this.miniBar.clear();
    let status = "";
    if (p.mini) {
      status = "MINI";
      const f = p.miniT / PHYSICS.miniDuration;
      this.miniBar
        .fillStyle(0xffd23f, 0.9)
        .fillRoundedRect(this.W / 2 - 80, this.top + 180, 160 * f, 8, 4);
      this.miniBar
        .lineStyle(2, 0xffd23f, 0.6)
        .strokeRoundedRect(this.W / 2 - 80, this.top + 180, 160, 8, 4);
    }
    if (p.gravityDir < 0) status = status ? `${status} · FLIPPED` : "GRAVITY FLIPPED";
    this.statusText
      .setText(status)
      .setAlpha(status && p.alive ? 0.8 + Math.sin(gs.clock * 8) * 0.2 : 0);
  }
}
