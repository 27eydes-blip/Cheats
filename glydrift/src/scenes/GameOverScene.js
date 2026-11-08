// Results overlay. The whole intro animates in under a second; a tap skips it. Taps on the
// background only retry after 0.5 s (so a panicked tap doesn't restart), and taps on the
// buttons never count as "retry".
import Phaser from "phaser";
import { heroImage } from "../ui/heroImage.js";
import { Save } from "../data/save.js";
import { Shop } from "../data/cosmetics.js";
import { tungLevelUpCelebration } from "../player/tungFx.js";
import { Titles } from "../data/titles.js";
import { titleText } from "../ui/titleText.js";
import { BIOMES, biomeName } from "../biomes/biomes.js";
import { COIN_COLOR, fitCamera, NUM_FONT, VIEW } from "../config.js";
import { HI } from "../gfx/textures.js";
import { getCharacter } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { flairOf, Leaderboard, Levels, myFlair } from "../online/leaderboard.js";
import { nameText } from "../ui/nameplate.js";
import { Music } from "../audio/music.js";
import { Progression, SPIN_EVERY } from "../data/progression.js";
import { SPIN_MAX } from "../tuning.js";
import { dailyNumber } from "../data/rng.js";
import { levelUpCelebration, revealHero } from "../ui/reveal.js";
import { closeShareModal, openShareModal } from "../online/shareCard.js";
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
  num,
} from "../ui/ui.js";

const TAP_GUARD = 500; // ms before "tap anywhere" retries
const ANIM_END = 950; // ms — every intro animation finishes before this

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOver");
  }

  /** DAWSON takes a quick twirl and a bow (beside the header, as the results come in). */
  dawsonBow(x, y) {
    const skin = Shop.equipped("dskin");
    const im = this.add.image(x, y, skin ? `hero_dawson_${skin}` : "hero_dawson").setAlpha(0);
    const k = 110 / im.height;
    im.setScale(k);
    this.tweens.add({ targets: im, alpha: 1, duration: 160 });
    // the twirl: one full turn with the tail fanned…
    const tw = { p: 0 };
    this.tweens.add({
      targets: tw,
      p: 1,
      duration: 480,
      delay: 80,
      ease: "Sine.easeInOut",
      onUpdate: () => im.setScale(k * Math.cos(tw.p * Math.PI * 2), k),
      onComplete: () => {
        // …then a bow: nose dipped, back up
        if (!skin) im.setTexture("hero_dawson_0");
        im.setScale(k);
        this.tweens.add({ targets: im, angle: 30, y: y + 8, duration: 200, yoyo: true, hold: 220, ease: "Sine.easeOut" });
      },
    });
    this.dawsonFig = im;
  }

  init(data) {
    this.result = data.result;
    this.gameScene = data.game;
    this.afterError = !!data.afterError; // the run ended because the game kept failing
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

    // dark enough that the bright neon hazards behind the results don't show through
    // (oversized so a camera shake never reveals an edge)
    const dim = this.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x020107, 0).setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.93, duration: 200 });

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
    // everything below stacks from the header, so a tall safe area (notch / Dynamic Island)
    // pushes it all down together instead of the big score landing on "RUN OVER"
    const lblY = Math.max(H * 0.115, headY + 40);
    const scoreY = lblY + 70;
    const scoreLbl = plainText(this, W / 2, lblY, "SCORE", 20, "#ffffff");
    const scoreText = neonText(this, W / 2, scoreY, "0", 100, col, { blur: 22 });
    new RollingCounter(this, scoreText, { onTick: Sfx.tick }).to(run.score, 550, 100);
    popIn(this, [head, scoreLbl, scoreText], 0, { duration: 300 });
    if (run.char === "dawson") this.dawsonBow(W / 2 - 190, headY + 40);
    if (run.tungLevelUp) tungLevelUpCelebration(this, run.tungLevelUp, W / 2, H * 0.5);
    // breakdown: why score ≠ distance
    const parts = [`${run.distance}m`];
    // these are score points (not the coins you keep, shown further down)
    if (run.coinBonus) parts.push(`+${run.coinBonus} coin pts`);
    if (run.nearBonus) parts.push(`+${run.nearBonus} combo pts`);
    if (run.bestCombo > 1) parts.push(`best x${run.bestCombo}`);
    const breakY = scoreY + 68;
    const breakdown = plainText(this, W / 2, breakY, parts.join("   "), 20, "#a99fd6");
    breakdown.setScale(Math.min(1, (W - 40) / breakdown.width));
    const bestY = breakY + 44;
    slideIn(this, breakdown, 300, 20);

    let bestLine;
    if (run.boosted) {
      // boosted runs keep their coins and missions but aren't ranked
      bestLine = this.add.container(W / 2, bestY);
      const g = this.add.graphics();
      g.fillStyle(0x0c2a1a, 0.95).fillRoundedRect(-190, -22, 380, 44, 22);
      g.lineStyle(2, 0x39ff88, 1).strokeRoundedRect(-190, -22, 380, 44, 22);
      g.fillStyle(0x39ff88, 1).fillPoints(
        [
          { x: -160, y: -12 },
          { x: -170, y: 3 },
          { x: -162, y: 3 },
          { x: -166, y: 14 },
          { x: -152, y: -4 },
          { x: -160, y: -4 },
        ],
        true,
      );
      bestLine.add([g, plainText(this, 12, 0, "BOOSTED RUN · NOT RANKED", 18, "#b8ffd8")]);
    } else if (R.newBest) {
      bestLine = neonText(this, W / 2, bestY, "NEW BEST!", 34, 0xffd23f, { blur: 12 });
      this.time.delayedCall(650, () => Sfx.reward());
    } else {
      bestLine = plainText(this, W / 2, bestY, `BEST ${num(R.prevBest)}`, 24, "#d8d0ff");
    }
    popIn(this, bestLine, 450, { duration: 300 });

    // ---- stat chips (numbers use the clean numeric font)
    const chipY = Math.max(H * 0.36, bestY + 92);
    const chips = [
      [`${run.distance}m`, "DISTANCE", col],
      [biomeName(run.biome).split(" ")[0], "BIOME", biome.accent],
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

    let y = chipY + H * 0.068;
    // coins line — only when something was earned
    const missionCoins = R.missions.reduce((a, m) => a + m.reward.coins, 0);
    const earned = run.coins + missionCoins + (run.perkBonus?.total || 0);
    if (earned > 0) {
      const coinRow = this.add.container(W / 2, y);
      const coinIcon = this.add.image(-60, 0, "coin").setScale(0.8 / HI);
      const coinTxt = neonText(this, -32, 0, "+0", 32, COIN_COLOR, { ox: 0, blur: 8 });
      coinRow.add([coinIcon, coinTxt]);
      if (run.lucky)
        coinRow.add(plainText(this, 150, 0, "LUCKY RUN · x2", 18, "#ffd23f", { ox: 0 }));
      new RollingCounter(this, coinTxt, {
        format: (v) => `+${num(v)}`,
        onTick: Sfx.tick,
      }).to(earned, 400, 450);
      slideIn(this, coinRow, 400, 20);
      // RONIN's perk: a small gold pop under the coins
      if (run.perkBonus) {
        const pb = run.perkBonus;
        const pop = neonText(
          this,
          W / 2,
          y + 44,
          `+${pb.total} ${getCharacter(run.char).name} BONUS${pb.mul > 1 ? ` (x${pb.mul})` : ""}`,
          22,
          0xffd23f,
          { blur: 8 },
        ).setScale(0);
        this.tweens.add({
          targets: pop,
          scale: 1,
          duration: 360,
          delay: 900,
          ease: "Back.easeOut",
        });
        this.time.delayedCall(900, () => Sfx.coin(6));
        y += 40;
      }
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
        ? `NEW BEST ${num(run.score)} · beat it by ${num(run.score - R.prevBest)}`
        : `NEW BEST ${num(run.score)} · your first record`
      : `BEST ${num(best)} · ${num(best - run.score)} to beat it`;
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
        : R.spinsFull
          ? `Lucky Spins full (${SPIN_MAX}/${SPIN_MAX})  ·  spin them from the menu`
          : `Lucky Spin: ${num(R.spinPts ?? 0)} / ${num(SPIN_EVERY)} points`;
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
    // unlock / achievement banners: in the band just above RETRY, sliding in from the side
    // (they used to drop from the top onto the score). Always clear of the button: after a long
    // results list (big runs) `y + 46` used to win and put the 92 px banner on top of RETRY;
    // now it may briefly cover the last results line instead, never a button.
    const toastY = Math.max(y + 90, H * 0.8) - 110;
    this.time.delayedCall(ANIM_END, () => {
      // each new hero gets the full spotlight reveal, one after another
      (async () => {
        for (const u of R.unlocks) {
          if (this.leaving) return;
          const def = u.texture ? u : getCharacter(u.id);
          if (def) await revealHero(this, def, { title: "UNLOCKED!" });
        }
      })();
      for (const a of R.achievements)
        toast(this, a.name.toUpperCase(), 0xffd23f, {
          y: toastY,
          side: true,
          sub: `Achievement · ${a.desc}`,
        });
      // season event challenges finished this run
      for (const c of R.seasonDone || [])
        toast(this, "SEASON CHALLENGE!", 0xff3a4a, {
          y: toastY,
          side: true,
          sub: `${c.text} · +${c.reward?.coins || 0} coins, +${c.reward?.xp || 0} pass XP`,
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
      onClick: () => this.goto("Leaderboard", { tab: run.mode === "daily" ? "daily" : "score" }),
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

    // ---- Drift Pass: a "TIER UP!" pop with a shortcut to the pass
    if (R.passAfter > R.passBefore) {
      const tx = W - 120;
      const ty = (this.registry.get("safeTop") || 0) + 64;
      const pop = this.add.container(tx, ty).setDepth(60);
      const pg = this.add.graphics();
      pg.fillStyle(0x1a0630, 1).fillRoundedRect(-104, -46, 208, 92, 18);
      pg.fillStyle(0xc8102e, 1).fillRoundedRect(-100, -42, 200, 84, 15);
      pg.fillStyle(0xffffff, 0.25).fillRoundedRect(-94, -38, 188, 18, 8);
      pop.add([
        pg,
        neonText(this, 0, -14, "TIER UP!", 26, 0xffd23f, { blur: 8 }),
        plainText(this, 0, 18, `Tier ${R.passAfter} · PASS ▸`, 17, "#ffffff"),
      ]);
      pop.setSize(208, 92).setInteractive();
      pop.on("pointerup", () => this.goto("Pass", { from: "Menu" }));
      pop.setScale(0);
      this.tweens.add({ targets: pop, scale: 1, duration: 420, delay: 700, ease: "Back.easeOut" });
      this.tweens.add({
        targets: pop,
        angle: { from: -4, to: 4 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        delay: 1200,
        ease: "Sine.easeInOut",
      });
      this.time.delayedCall(700, () => Sfx.reward());
    }
    this.showPlacement(R, run, bestY + 46);

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
    heroImage(this, W - 70, headY + 4, def.id, 0.5 / HI);
    // your name and title ride under your hero
    const name = Save.data.profile?.username;
    if (name) {
      // Drift Pass+: the animated gold name and the forever Season 1 badge
      const fl = flairOf({ flair: myFlair() });
      const nt = nameText(this, W - 70, headY + 50, name, {
        size: 15,
        ox: 0.5,
        gold: fl.gold,
        badge: fl.s1,
        font: NUM_FONT,
      });
      nt.setScale(Math.min(1, 132 / Math.max(1, nt.getBounds().width)));
    }
    const title = Titles.equippedId();
    if (title) titleText(this, W - 70, headY + 70, title, { size: 12 });
  }

  /**
   * Where this run placed, once the background upload + rank lookups finish:
   * "You placed #N in Score · #M in Distance" (or "#N on today's Daily"). Score comes first:
   * it's the main board.
   */
  showPlacement(R, run, y) {
    const token = (this.placementToken = {});
    const W = VIEW.W;
    const alive = () => this.sys.isActive() && this.placementToken === token && !this.leaving;
    Promise.resolve(R.upload)
      .then((up) => {
        if (!up || up.rejected) return null;
        if (run.mode === "daily")
          return Leaderboard.placementFor(Levels.daily(), run.score).then((daily) => ({ daily }));
        return Promise.all([
          Leaderboard.placementFor(Levels.distance(), Math.floor(run.distance)),
          Leaderboard.placementFor(Levels.endless(), run.score),
        ]).then(([distance, score]) => ({ distance, score }));
      })
      .then((p) => {
        if (!p || !alive()) return;
        const rank = Math.min(p.daily ?? Infinity, p.distance ?? Infinity, p.score ?? Infinity);
        const msg = p.daily
          ? `You placed #${p.daily} on today's Daily!`
          : `You placed #${p.score} in Score · #${p.distance} in Distance`;
        this.placementText = msg;
        const t = neonText(
          this,
          W / 2,
          y,
          msg,
          p.daily ? 26 : 23,
          rank <= 3 ? 0xffd23f : 0x3ef4ff,
          {
            blur: 10,
          },
        );
        t.setScale(Math.min(1, (W - 40) / Math.max(1, t.width)));
        const full = t.scale;
        t.setScale(0.3 * full).setAlpha(0);
        this.tweens.add({
          targets: t,
          scale: full,
          alpha: 1,
          duration: 420,
          ease: "Back.easeOut",
          easeParams: [2.4],
        });
        this.tweens.add({
          targets: t,
          scale: full * 1.06,
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
      this.time.delayedCall(i === 0 ? delay : 40, () => Sfx.whoosh());
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
          levelUpCelebration(this, st.lu.level, parts.join(" · "));
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
    if (this.afterError) {
      // after a crash: a fresh game scene, not the one that broke
      this.leaving = false;
      return this.goto("Game", { mode: "normal" });
    }
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
