// Results overlay. The whole intro animates in under a second; a tap skips it. Taps on the
// background only retry after 0.5 s (so a panicked tap doesn't restart), and taps on the
// buttons never count as "retry".
import Phaser from "phaser";
import { BIOMES, biomeName } from "../biomes/biomes.js";
import { COIN_COLOR, fitCamera, VIEW } from "../config.js";
import { HI } from "../gfx/textures.js";
import { getCharacter } from "../player/characterDefs.js";
import { Sfx } from "../systems/audio.js";
import { Leaderboard, Levels } from "../systems/leaderboard.js";
import { Music } from "../systems/music.js";
import { Progression, SPIN_EVERY } from "../systems/progression.js";
import { dailyNumber } from "../systems/rng.js";
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

const TAP_GUARD = 500; // ms before "tap anywhere" retries
const ANIM_END = 950; // ms — every intro animation finishes before this

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOver");
  }

  init(data) {
    this.result = data.result;
    this.gameScene = data.game;
    this.leaving = false;
    this.animDone = false;
    this.skipping = false;
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    const R = this.result;
    const run = R.run;
    const top = (this.registry.get("safeTop") || 0) + 20;
    const biome = BIOMES[run.biome % BIOMES.length];
    const col = biome.neon;
    this.scene.get("Hud")?.scene.setVisible(false);
    this.t0 = this.time.now;

    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x020107, 0).setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.8, duration: 200 });

    // ---- header + score
    // header sits just under the safe area; "SCORE" keeps clear of it on notched phones
    // (on a Dynamic Island iPhone the header used to land on top of the label)
    const headY = top + 32;
    const head = plainText(
      this,
      W / 2,
      headY,
      run.mode === "daily" ? `DAILY CHALLENGE #${dailyNumber()}` : "RUN OVER",
      22,
      "#cfc6ff",
    );
    const scoreLbl = plainText(
      this,
      W / 2,
      Math.max(H * 0.115, headY + 36),
      "SCORE",
      20,
      "#ffffff",
    );
    const scoreText = neonText(this, W / 2, H * 0.17, "0", 100, col, { blur: 22 });
    new RollingCounter(this, scoreText).to(run.score, 550, 100);
    popIn(this, [head, scoreLbl, scoreText], 0, { duration: 300 });
    // breakdown: why score ≠ distance
    const parts = [`${run.distance}m`];
    if (run.coinBonus) parts.push(`+${run.coinBonus} coins`);
    if (run.nearBonus) parts.push(`+${run.nearBonus} close calls`);
    const breakdown = plainText(this, W / 2, H * 0.222, parts.join("   "), 20, "#a99fd6");
    slideIn(this, breakdown, 300, 20);

    let bestLine;
    if (R.newBest) {
      bestLine = neonText(this, W / 2, H * 0.262, "NEW BEST!", 34, 0xffd23f, { blur: 12 });
      this.time.delayedCall(650, () => Sfx.reward());
    } else {
      bestLine = plainText(this, W / 2, H * 0.262, `BEST ${R.prevBest}`, 24, "#d8d0ff");
    }
    popIn(this, bestLine, 450, { duration: 300 });

    // ---- stat chips (numbers use the clean numeric font)
    const chipY = H * 0.36;
    const chips = [
      [`${run.distance}m`, "DISTANCE", col],
      [biomeName(run.biome).split(" ").slice(-1)[0], "BIOME", biome.accent],
      [`${run.nearMiss}`, "CLOSE CALLS", 0xffffff],
    ].map(([v, l, c], i) => {
      const cont = this.add.container(W / 2 + (i - 1) * 220, chipY);
      const g = this.add.graphics();
      drawNeonRect(g, -100, -46, 200, 92, 18, c, { fillAlpha: 0.6, width: 2 });
      cont.add([
        g,
        neonText(this, 0, -10, v, 30, c, { blur: 8 }),
        plainText(this, 0, 26, l, 15, "#cfc6ff"),
      ]);
      return cont;
    });
    slideIn(this, chips, 200, 30);

    let y = H * 0.428;
    // coins line — only when something was earned
    const missionCoins = R.missions.reduce((a, m) => a + m.reward.coins, 0);
    const earned = run.coins + missionCoins;
    if (earned > 0) {
      const coinRow = this.add.container(W / 2, y);
      const coinIcon = this.add.image(-60, 0, "coin").setScale(0.8 / HI);
      const coinTxt = neonText(this, -32, 0, "+0", 32, COIN_COLOR, { ox: 0, blur: 8 });
      coinRow.add([coinIcon, coinTxt]);
      new RollingCounter(this, coinTxt, { format: (v) => `+${Math.round(v)}` }).to(
        earned,
        400,
        450,
      );
      slideIn(this, coinRow, 400, 20);
      y += H * 0.065;
    } else {
      y += H * 0.01;
    }

    // ---- best + nearest goal
    const panelH = 150;
    const gy = y;
    const goals = this.add.container(0, 0);
    const gg = this.add.graphics();
    drawNeonRect(gg, 40, gy, W - 80, panelH, 22, 0xb45cff, { fillAlpha: 0.55, width: 2 });
    goals.add(gg);
    const best = Math.max(R.prevBest, run.score);
    const bestTxt = R.newBest
      ? R.prevBest > 0
        ? `NEW BEST ${run.score} · beat it by ${run.score - R.prevBest}`
        : `NEW BEST ${run.score} · your first record`
      : `BEST ${best} · ${best - run.score} to beat it`;
    goals.add(plainText(this, 76, gy + 30, bestTxt, 21, "#ffffff", { ox: 0 }));
    const bar1 = new ProgressBar(this, 76, gy + 52, W - 152, 12, 0xffd23f);
    goals.add(bar1.g);
    bar1.to(best > 0 ? Math.min(1, run.score / best) : 1, 350, 500);
    const goal = Progression.nearestGoal();
    if (goal) {
      goals.add(
        plainText(
          this,
          76,
          gy + 94,
          goal.kind === "mission" ? `MISSION · ${goal.text}` : goal.text,
          19,
          hex(goal.color),
          { ox: 0 },
        ),
      );
      const bar2 = new ProgressBar(this, 76, gy + 116, W - 152, 12, goal.color);
      goals.add(bar2.g);
      bar2.to(goal.frac, 350, 550);
    }
    slideIn(this, goals, 350, 25);
    y = gy + panelH + 24;

    // ---- XP / level
    const lvl = this.add.container(0, 0);
    const lg = this.add.graphics();
    drawNeonRect(lg, 40, y, W - 80, 100, 22, 0x3ef4ff, { fillAlpha: 0.55, width: 2 });
    const lvlText = neonText(this, 74, y + 32, `LV ${R.levelBefore}`, 26, 0x3ef4ff, {
      ox: 0,
      blur: 8,
    });
    const xpText = plainText(this, W - 74, y + 32, `+${R.xpGained} XP`, 22, "#bdf9ff", { ox: 1 });
    const xpBar = new ProgressBar(this, 74, y + 64, W - 148, 16, 0x3ef4ff);
    xpBar.set(R.xpBefore / Progression.xpToNext(R.levelBefore));
    lvl.add([lg, lvlText, xpText, xpBar.g]);
    slideIn(this, lvl, 400, 25);
    this.animateXp(xpBar, lvlText, R, 550);
    y += 124;

    // ---- missions completed this run
    for (const m of R.missions) {
      const t = plainText(this, W / 2, y, `✓ ${m.text}   +${m.reward.coins}`, 19, "#39ff88");
      slideIn(this, t, 600, 15);
      y += 30;
    }
    // ---- Lucky Spin progress
    {
      const earned = R.spinsEarned || 0;
      const txt = earned
        ? `LUCKY SPIN +${earned}!  spin it from the menu`
        : `Lucky Spin: ${R.spinPts ?? 0} / ${SPIN_EVERY} points`;
      const t = plainText(
        this,
        W / 2,
        y + 4,
        txt,
        earned ? 21 : 18,
        earned ? "#ffd23f" : "#c8b8ff",
      );
      slideIn(this, t, 650, 15);
      if (earned) this.time.delayedCall(900, () => Sfx.reward());
      y += 34;
    }
    // unlock / achievement banners: in the free band above RETRY, sliding in from the side
    // (they used to drop from the top onto the score)
    const toastY = Math.max(y + 46, Math.max(y + 90, H * 0.8) - 110);
    this.time.delayedCall(ANIM_END, () => {
      for (const u of R.unlocks)
        toast(this, `${u.name} UNLOCKED!`, u.color, {
          y: toastY,
          sub: u.challenge?.text,
          side: true,
        });
      for (const a of R.achievements)
        toast(this, a.name.toUpperCase(), 0xffd23f, {
          y: toastY,
          side: true,
          sub: `Achievement · ${a.desc}`,
        });
    });

    // ---- buttons
    const by = Math.max(y + 90, H * 0.8);
    const retry = button(this, W / 2, by, 440, 112, "RETRY", {
      color: 0x39ff88,
      size: 44,
      fill: 0x0c2a1a,
      onClick: () => this.retry(),
    });
    const rowY = by + 112;
    const share = button(this, 94, rowY, 140, 76, "SHARE", {
      color: 0xffd23f,
      size: 17,
      onClick: () => openShareModal(this.game, run),
    });
    const ranks = button(this, 283, rowY, 210, 76, "LEADERBOARD", {
      color: 0x3ef4ff,
      size: 16,
      onClick: () => this.goto("Leaderboard", { tab: run.mode === "daily" ? "daily" : "endless" }),
    });
    const heroes = button(this, 472, rowY, 140, 76, "HEROES", {
      color: 0xb45cff,
      size: 17,
      onClick: () => this.goto("Characters"),
    });
    const home = button(this, 626, rowY, 140, 76, "HOME", {
      color: 0xff4fd8,
      size: 17,
      onClick: () => this.goto("Menu"),
    });
    popIn(this, [retry, share, ranks, heroes, home], 250, { duration: 350 });
    this.showPlacement(R, run, H * 0.3);

    const tapHint = plainText(
      this,
      W / 2,
      Math.min(H - (this.registry.get("safeBottom") || 0) - 24, by + 180),
      "TAP ANYWHERE TO RETRY",
      17,
      "#9c90c8",
    ).setAlpha(0);
    this.time.delayedCall(TAP_GUARD, () => {
      this.tweens.add({ targets: tapHint, alpha: 0.9, duration: 200 });
    });
    this.time.delayedCall(ANIM_END, () => {
      this.finishIntro();
      this.tweens.add({ targets: tapHint, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
      this.tweens.add({
        targets: retry,
        scale: 1.04,
        yoyo: true,
        repeat: -1,
        duration: 700,
        ease: "Sine.easeInOut",
      });
    });

    dim.on("pointerdown", () => this.onBackgroundTap());
    this.input.keyboard?.on("keydown-SPACE", () => this.onBackgroundTap());

    // the hero you flew with
    const def = getCharacter(run.char);
    this.add.image(W - 70, headY + 4, def.texture).setScale(0.5 / HI);
  }

  /** "You placed #N worldwide!" once the background upload + rank lookup finish. */
  showPlacement(R, run, y) {
    const token = (this.placementToken = {});
    const W = VIEW.W;
    const alive = () => this.sys.isActive() && this.placementToken === token && !this.leaving;
    Promise.resolve(R.upload)
      .then((up) => {
        if (!up || up.rejected) return null;
        return Leaderboard.placementFor(Levels.forRun(run), run.score);
      })
      .then((rank) => {
        if (!rank || !alive()) return;
        const where = run.mode === "daily" ? "on today's Daily" : "worldwide";
        const t = neonText(
          this,
          W / 2,
          y,
          `You placed #${rank} ${where}!`,
          26,
          rank <= 3 ? 0xffd23f : 0x3ef4ff,
          { blur: 10 },
        );
        t.setScale(0.3).setAlpha(0);
        this.tweens.add({
          targets: t,
          scale: 1,
          alpha: 1,
          duration: 420,
          ease: "Back.easeOut",
          easeParams: [2.4],
        });
        this.tweens.add({
          targets: t,
          scale: 1.06,
          yoyo: true,
          repeat: 2,
          delay: 450,
          duration: 220,
          ease: "Sine.easeInOut",
        });
        if (rank <= 100) Sfx.reward();
      })
      .catch(() => {
        if (!alive()) return;
        const t = plainText(
          this,
          W / 2,
          y,
          "Offline · your score will upload automatically",
          18,
          "#9c90c8",
        ).setAlpha(0);
        this.tweens.add({ targets: t, alpha: 1, duration: 300 });
      });
  }

  onBackgroundTap() {
    const elapsed = this.time.now - this.t0;
    if (!this.animDone) {
      this.skipIntro();
      return;
    }
    if (elapsed >= TAP_GUARD) this.retry();
  }

  /** Fast-forward every intro tween/timer (values and callbacks land exactly as normal). */
  skipIntro() {
    if (this.skipping || this.animDone) return;
    this.skipping = true;
    this.tweens.timeScale = 40;
    this.time.timeScale = 40;
  }

  finishIntro() {
    this.animDone = true;
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
  }

  animateXp(bar, lvlText, R, delay) {
    const steps = [];
    for (const lu of R.levelUps) steps.push({ to: 1, lu });
    steps.push({ to: R.xpAfter / Progression.xpToNext(R.levelAfter) });
    const run = (i) => {
      if (i >= steps.length) return;
      const st = steps[i];
      bar.to(st.to, steps.length > 1 ? 220 : 350, i === 0 ? delay : 40, () => {
        if (st.lu) {
          Sfx.reward();
          lvlText.setText(`LV ${st.lu.level}`);
          this.tweens.add({
            targets: lvlText,
            scale: { from: 1.4, to: 1 },
            duration: 250,
            ease: "Back.easeOut",
          });
          const rw = st.lu.reward;
          const parts = [];
          if (rw.coins) parts.push(`+${rw.coins} coins`);
          if (rw.shard) parts.push(st.lu.shardResult?.id ? "+1 hero shard" : "+300 coins");
          toast(this, `LEVEL ${st.lu.level}!`, 0x3ef4ff, {
            y: (this.registry.get("safeTop") || 0) + 150,
            sub: parts.join(" · "),
          });
          bar.set(0);
        }
        run(i + 1);
      });
    };
    run(0);
  }

  retry() {
    if (this.leaving) return;
    this.leaving = true;
    this.finishIntro();
    closeShareModal();
    const gs = this.gameScene;
    this.scene.get("Hud")?.scene.setVisible(true);
    this.scene.stop();
    Music.restore();
    gs.resetRun(true);
  }

  goto(key, data) {
    if (this.leaving) return;
    this.leaving = true;
    this.finishIntro();
    closeShareModal();
    Music.restore();
    this.scene.stop("Hud");
    this.scene.stop("Game");
    this.scene.start(key, data);
  }
}
