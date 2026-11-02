// In-run HUD overlay: score, coins, banners, toasts, pause. Unaffected by camera zoom/post-FX.
import Phaser from "phaser";
import { BIOMES, biomeName } from "../biomes/biomes.js";
import { PHYSICS } from "../config.js";
import { dailyNumber } from "../systems/rng.js";
import { button, hex, neonText, plainText, RollingCounter, toast } from "../ui/ui.js";

export class HudScene extends Phaser.Scene {
  constructor() {
    super("Hud");
  }

  init(data) {
    this.gameScene = data.game;
    this.ready = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W;
    this.H = H;
    this.sys.setVisible(true); // may have been hidden by a previous GameOver
    const top = (this.registry.get("safeTop") || 0) + 24;
    this.top = top;
    const gs = this.gameScene;

    this.flashRect = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(0);

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
    this.coinIcon = this.add.image(W - 120, top + 46, "coin").setScale(0.7);
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
    this.banner = this.add.container(W / 2, H * 0.3).setAlpha(0);
    this.bannerSub = plainText(this, 0, -46, "ENTERING", 20, "#ffffff");
    this.bannerText = neonText(this, 0, 0, "", 56, 0xffffff, { blur: 26 });
    this.bannerLine = this.add.rectangle(0, 42, 420, 3, 0xffffff);
    this.banner.add([this.bannerSub, this.bannerText, this.bannerLine]);

    this.comboText = neonText(this, W / 2, top + 200, "", 28, 0xffffff, { blur: 12 }).setAlpha(0);

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
      Phaser.Math.Distance.Between(pointer.x, pointer.y, this.pauseBtn.x, this.pauseBtn.y) < 46 ||
      !!this.pauseLayer
    );
  }

  // ------------------------------------------------------------------ events from GameScene
  onReset() {
    const gs = this.gameScene;
    this.score.set(0);
    this.coins.set(0);
    this.lastScore = 0;
    this.bestText.setText(gs.bestScore > 0 ? `BEST ${gs.bestScore}` : "");
    this.hint.setVisible(true).setAlpha(1);
    this.pauseBtn.setVisible(true);
    this.scoreText.setAlpha(1);
  }

  onStart() {
    this.tweens.add({
      targets: this.hint,
      alpha: 0,
      duration: 200,
      onComplete: () => this.hint.setVisible(false),
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
      scale: { from: 1, to: 0.7 },
      duration: 200,
      ease: "Back.easeOut",
    });
  }

  onBiome(rawIndex) {
    const b = BIOMES[rawIndex % BIOMES.length];
    this.bannerText.setText(biomeName(rawIndex));
    this.bannerText.setStroke(hex(b.neon), 4).setShadow(0, 0, hex(b.neon), 26, true, true);
    this.bannerLine.setFillStyle(b.neon);
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0).setScale(1.6);
    this.bannerLine.scaleX = 0;
    this.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: 1,
      duration: 500,
      ease: "Back.easeOut",
    });
    this.tweens.add({ targets: this.bannerLine, scaleX: 1, duration: 700, ease: "Cubic.easeOut" });
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      y: this.H * 0.27,
      delay: 1900,
      duration: 500,
      onComplete: () => (this.banner.y = this.H * 0.3),
    });
  }

  onSpeedUp() {
    const t = neonText(this, this.W / 2, this.H * 0.4, "SPEED UP", 40, 0xff4fd8, { blur: 18 });
    t.setAlpha(0).setScale(0.6);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({
      targets: t,
      alpha: 0,
      x: this.W / 2 - 160,
      delay: 700,
      duration: 360,
      onComplete: () => t.destroy(),
    });
  }

  onNewBest() {
    toast(this, "NEW BEST!", 0xffd23f, { y: this.top + 250, sub: "You passed your ghost" });
  }

  onMission(m) {
    toast(this, "MISSION COMPLETE", 0x39ff88, { y: this.top + 250, sub: m.text });
  }

  onPortal() {}

  onToast(title, sub) {
    toast(this, title, 0x3ef4ff, { y: this.top + 250, sub });
  }

  onDeath() {
    this.tweens.add({
      targets: [this.pauseBtn],
      alpha: 0,
      duration: 200,
      onComplete: () => this.pauseBtn.setVisible(false).setAlpha(1),
    });
  }

  // ------------------------------------------------------------------ pause
  pause() {
    const gs = this.gameScene;
    if (this.pauseLayer || gs.state !== "playing") return;
    this.scene.pause("Game");
    const W = this.W;
    const H = this.H;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.75).setInteractive();
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
    c.add([dim, title, resume, home]);
    this.pauseLayer = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  resume(silent) {
    if (!this.pauseLayer) return;
    const c = this.pauseLayer;
    this.pauseLayer = null;
    c.destroy();
    if (!silent) this.scene.resume("Game");
  }

  update() {
    const gs = this.gameScene;
    if (!gs || (!gs.sys.isActive() && !gs.sys.isPaused())) return;
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
    // low-graphics fallback flash
    if (!gs.post) this.flashRect.setFillStyle(0xffffff, Math.min(0.8, gs.fxState.flash));
  }
}
