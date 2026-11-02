// Results overlay: rolling score, "almost there" nudges, XP fill with level-ups,
// missions/achievements, share card. A single tap anywhere restarts instantly.
import Phaser from "phaser";
import { BIOMES, biomeName } from "../biomes/biomes.js";
import { getCharacter } from "../player/characterDefs.js";
import { Sfx } from "../systems/audio.js";
import { LEVEL_REWARDS, Progression } from "../systems/progression.js";
import { dailyNumber } from "../systems/rng.js";
import { Save } from "../systems/save.js";
import { closeShareModal, openShareModal } from "../systems/shareCard.js";
import {
  button,
  drawNeonRect,
  hex,
  neonText,
  ProgressBar,
  plainText,
  popIn,
  RollingCounter,
  slideIn,
  toast,
} from "../ui/ui.js";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOver");
  }

  init(data) {
    this.result = data.result;
    this.gameScene = data.game;
    this.leaving = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const R = this.result;
    const run = R.run;
    const top = (this.registry.get("safeTop") || 0) + 20;
    const biome = BIOMES[run.biome % BIOMES.length];
    const col = biome.neon;
    this.scene.get("Hud")?.scene.setVisible(false);
    this.readyAt = this.time.now + 450;

    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0).setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.72, duration: 350 });

    // ---- header + score
    const head = plainText(
      this,
      W / 2,
      top + 70,
      run.mode === "daily" ? `DAILY CHALLENGE #${dailyNumber()}` : "RUN OVER",
      22,
      "#cfc6ff",
    );
    const scoreLbl = plainText(this, W / 2, H * 0.12 + 10, "SCORE", 20, "#ffffff");
    const scoreText = neonText(this, W / 2, H * 0.18, "0", 108, col, { blur: 36 });
    const counter = new RollingCounter(this, scoreText);
    counter.to(run.score, 1000, 250);
    popIn(this, [head, scoreLbl, scoreText], 0);

    let bestLine;
    if (R.newBest) {
      bestLine = neonText(this, W / 2, H * 0.245, "NEW BEST!", 40, 0xffd23f, { blur: 20 });
      this.time.delayedCall(1200, () => {
        Sfx.reward();
        this.tweens.add({ targets: bestLine, scale: 1.2, yoyo: true, duration: 180, repeat: 1 });
      });
    } else {
      bestLine = plainText(this, W / 2, H * 0.245, `BEST ${R.prevBest}`, 24, "#d8d0ff");
    }
    popIn(this, bestLine, 900);

    // ---- stat chips
    const chipY = H * 0.31;
    const chips = [
      [`${run.distance}m`, "DISTANCE", col],
      [biomeName(run.biome).split(" ")[0], "BIOME", biome.accent],
      [`${run.nearMiss}`, "CLOSE CALLS", 0xffffff],
    ].map(([v, l, c], i) => {
      const x = W / 2 + (i - 1) * 220;
      const cont = this.add.container(x, chipY);
      const g = this.add.graphics();
      drawNeonRect(g, -100, -46, 200, 92, 18, c, { fillAlpha: 0.6, width: 2 });
      cont.add([
        g,
        neonText(this, 0, -10, v, 30, c, { blur: 10 }),
        plainText(this, 0, 26, l, 14, "#cfc6ff"),
      ]);
      return cont;
    });
    slideIn(this, chips, 400);

    // coins row
    const coinRow = this.add.container(W / 2, H * 0.385);
    const coinIcon = this.add.image(-70, 0, "coin").setScale(0.75);
    const coinTxt = neonText(this, -40, 0, "+0", 34, 0xffc83d, { ox: 0, blur: 12 });
    coinRow.add([coinIcon, coinTxt]);
    const coinCounter = new RollingCounter(this, coinTxt, { format: (v) => `+${Math.round(v)}` });
    const missionCoins = R.missions.reduce((a, m) => a + m.reward.coins, 0);
    coinCounter.to(run.coins + missionCoins, 900, 700);
    slideIn(this, coinRow, 600);

    // ---- "almost there"
    const ay = H * 0.46;
    const almost = this.add.container(0, 0);
    const ag = this.add.graphics();
    drawNeonRect(ag, 40, ay - 58, W - 80, 150, 22, 0xff4fd8, { fillAlpha: 0.55, width: 2 });
    almost.add(ag);
    let line1;
    let frac1;
    if (R.newBest) {
      line1 =
        R.prevBest > 0
          ? `You beat your best by ${run.score - R.prevBest}!`
          : "First record set — now beat it!";
      frac1 = 1;
    } else {
      const gap = R.prevBest - run.score;
      line1 =
        gap <= Math.max(30, R.prevBest * 0.15)
          ? `SO CLOSE! Only ${gap} to beat your best`
          : `${gap} more to beat your best`;
      frac1 = R.prevBest > 0 ? run.score / R.prevBest : 0;
    }
    almost.add(plainText(this, W / 2, ay - 32, line1, 20, "#ffffff"));
    const bar1 = new ProgressBar(this, 80, ay - 10, W - 160, 12, 0xff4fd8);
    almost.add(bar1.g);
    bar1.to(frac1, 900, 900);
    const hint = Progression.nextUnlockHint();
    if (hint) {
      almost.add(plainText(this, W / 2, ay + 30, hint.text, 18, hex(hint.def.color)));
      const bar2 = new ProgressBar(this, 80, ay + 50, W - 160, 12, hint.def.color);
      almost.add(bar2.g);
      bar2.to(hint.frac, 900, 1100);
    } else {
      almost.add(
        plainText(this, W / 2, ay + 40, "Every character unlocked. Legend.", 18, "#ffd23f"),
      );
    }
    slideIn(this, almost, 700, 40);

    // ---- XP / level
    const ly = H * 0.585;
    const lvl = this.add.container(0, 0);
    const lg = this.add.graphics();
    drawNeonRect(lg, 40, ly - 50, W - 80, 104, 22, 0x3ef4ff, { fillAlpha: 0.55, width: 2 });
    const lvlText = neonText(this, 74, ly - 18, `LV ${R.levelBefore}`, 28, 0x3ef4ff, {
      ox: 0,
      blur: 10,
    });
    const xpText = plainText(this, W - 74, ly - 18, `+${R.xpGained} XP`, 20, "#bdf9ff", { ox: 1 });
    const xpBar = new ProgressBar(this, 74, ly + 12, W - 148, 16, 0x3ef4ff);
    xpBar.set(R.xpBefore / Progression.xpToNext(R.levelBefore));
    lvl.add([lg, lvlText, xpText, xpBar.g]);
    slideIn(this, lvl, 800, 40);
    this.animateXp(xpBar, lvlText, R, 1300);

    // ---- missions / unlocks
    let my = H * 0.675;
    for (const m of R.missions) {
      const t = plainText(this, W / 2, my, `✔ ${m.text}   +${m.reward.coins}`, 18, "#39ff88");
      slideIn(this, t, 1100);
      my += 30;
    }
    this.time.delayedCall(1500, () => {
      for (const u of R.unlocks)
        toast(this, `${u.name} UNLOCKED!`, u.color, { y: top + 120, sub: u.challenge?.text });
      for (const a of R.achievements)
        toast(this, `🏅 ${a.name}`, 0xffd23f, { y: top + 120, sub: a.desc });
    });

    // ---- buttons
    const retry = button(this, W / 2, H * 0.79, 420, 108, "RETRY", {
      color: 0x39ff88,
      size: 40,
      onClick: () => this.retry(),
    });
    const share = button(this, W / 2 - 220, H * 0.885, 196, 78, "SHARE", {
      color: 0xffd23f,
      size: 22,
      onClick: () => openShareModal(this.game, run),
    });
    const heroes = button(this, W / 2, H * 0.885, 196, 78, "HEROES", {
      color: 0xb45cff,
      size: 22,
      onClick: () => this.goto("Characters"),
    });
    const home = button(this, W / 2 + 220, H * 0.885, 196, 78, "HOME", {
      color: 0xff4fd8,
      size: 22,
      onClick: () => this.goto("Menu"),
    });
    popIn(this, [retry, share, heroes, home], 500);
    this.tweens.add({
      targets: retry,
      scale: 1.05,
      yoyo: true,
      repeat: -1,
      duration: 700,
      delay: 1200,
      ease: "Sine.easeInOut",
    });

    const tapHint = plainText(this, W / 2, H * 0.95, "TAP ANYWHERE TO RETRY", 16, "#9c90c8");
    this.tweens.add({ targets: tapHint, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });

    dim.on("pointerdown", () => {
      if (this.time.now >= this.readyAt) this.retry();
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.retry());

    // a character preview to celebrate what you flew with
    const def = getCharacter(run.char);
    const icon = this.add.image(W - 80, top + 70, def.texture).setScale(0.45);
    this.tweens.add({
      targets: icon,
      y: top + 62,
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: "Sine.easeInOut",
    });
  }

  animateXp(bar, lvlText, R, delay) {
    const steps = [];
    let level = R.levelBefore;
    for (const lu of R.levelUps) {
      steps.push({ to: 1, level, lu });
      level = lu.level;
    }
    steps.push({ to: R.xpAfter / Progression.xpToNext(R.levelAfter), level: R.levelAfter });
    let d = delay;
    const run = (i) => {
      if (i >= steps.length) return;
      const st = steps[i];
      bar.to(st.to, 650, i === 0 ? d : 120, () => {
        if (st.lu) {
          Sfx.reward();
          lvlText.setText(`LV ${st.lu.level}`);
          this.tweens.add({
            targets: lvlText,
            scale: { from: 1.5, to: 1 },
            duration: 400,
            ease: "Back.easeOut",
          });
          const rw = st.lu.reward;
          const parts = [];
          if (rw.coins) parts.push(`+${rw.coins} coins`);
          if (rw.shard) parts.push(st.lu.shardResult?.id ? "+1 character shard" : "+300 coins");
          toast(this, `LEVEL ${st.lu.level}!`, 0x3ef4ff, {
            y: (this.registry.get("safeTop") || 0) + 140,
            sub: parts.join(" · "),
          });
          bar.set(0);
        }
        run(i + 1);
      });
    };
    d = delay;
    run(0);
  }

  retry() {
    if (this.leaving) return;
    this.leaving = true;
    closeShareModal();
    const gs = this.gameScene;
    this.scene.get("Hud")?.scene.setVisible(true);
    this.scene.stop();
    gs.resetRun(true);
  }

  goto(key) {
    if (this.leaving) return;
    this.leaving = true;
    closeShareModal();
    this.scene.stop("Hud");
    this.scene.stop("Game");
    this.scene.start(key);
  }
}

export { LEVEL_REWARDS, Save };
