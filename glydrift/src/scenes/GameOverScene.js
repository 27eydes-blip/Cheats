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
import { illegalTag, isIllegalHero } from "../ui/illegalTag.js";
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
// every outline on this screen: the same light blue, with a strong glow
const EDGE = 0x3ef4ff;
const EDGE_GLOW = 2.2;
const edge = { outline: EDGE, glow: EDGE_GLOW };

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
      drawNeonRect(g, -190, -22, 380, 44, 22, EDGE, { fill: 0x0c2a1a, fillAlpha: 0, width: 2, glow: EDGE_GLOW });
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

    // ---- the middle of the screen (run facts, REWARDS, missions, NEXT UP) is laid out as one
    // block, centred in the space between the score (and its placement line) and RETRY
    const spins = Save.data.spins || 0;
    const best = Math.max(R.prevBest, run.score);
    const closeToBest = !R.newBest && !run.boosted && best > 0 && run.score >= best * 0.75;
    const goal = closeToBest
      ? { text: `SO CLOSE! ${num(best - run.score)} to beat your best`, frac: run.score / best, color: 0xffd23f }
      : Progression.nearestGoal();
    const showSpin = spins > 0;
    const middleH =
      52 + 238 + 22 + (R.missions.length ? R.missions.length * 30 + 8 : 0) + (goal || showSpin ? 132 : 0);
    const middleTop = bestY + 92; // (the placement line sits at bestY + 46)
    const sbot0 = this.registry.get("safeBottom") || 0;
    const retryAt = Math.min(H * 0.79, H - sbot0 - 150);
    const room = retryAt - 110 - middleTop;
    // ---- the run in one quiet line: distance · realm · close calls (the score above is the star)
    const factsY = middleTop + Math.max(0, Math.floor((room - middleH) / 2));
    {
      const facts = this.add.container(W / 2, factsY);
      const bits = [
        [`${run.distance}m`, hex(col)],
        [biomeName(run.biome).toUpperCase(), hex(biome.accent)],
        [`${run.nearMiss} CLOSE CALL${run.nearMiss === 1 ? "" : "S"}`, "#ffffff"],
      ];
      let x = 0;
      const parts = [];
      bits.forEach(([t, c], i) => {
        if (i) parts.push(plainText(this, 0, 0, "·", 22, "#6f6699"));
        parts.push(plainText(this, 0, 0, t, 22, c));
      });
      for (const p of parts) {
        p.setOrigin(0, 0.5).setX(x);
        x += p.width + 14;
      }
      for (const p of parts) p.x -= (x - 14) / 2;
      facts.add(parts).setScale(Math.min(1, (W - 60) / Math.max(1, x)));
      slideIn(this, facts, 200, 20);
    }

    // ---- REWARDS: what this run gave you, three big tiles that count up (coins · XP · spins),
    // with the level bar under them
    const missionCoins = R.missions.reduce((a, m) => a + m.reward.coins, 0);
    const earned =
      run.coins + missionCoins + (run.perkBonus?.total || 0) + (run.heroPerk?.coins || 0);
    let y = factsY + 52;
    const cardX = 40;
    const cardW = W - 80;
    const rewardsH = 238;
    const rewards = this.add.container(0, 0);
    const rg = this.add.graphics();
    drawNeonRect(rg, cardX, y, cardW, rewardsH, 24, EDGE, { fillAlpha: 0.55, width: 2, glow: EDGE_GLOW });
    rewards.add([rg, plainText(this, cardX + 30, y + 30, "REWARDS", 17, "#8f86c0", { ox: 0 })]);
    if (run.lucky) rewards.add(plainText(this, cardX + cardW - 30, y + 30, "LUCKY RUN · x2 COINS", 17, "#ffd23f", { ox: 1 }));
    const tileW = (cardW - 60 - 2 * 16) / 3;
    const tileY = y + 98;
    const tiles = [
      { label: "COINS", color: COIN_COLOR, value: earned, fmt: (v) => `+${num(v)}`, icon: "coin" },
      { label: "XP", color: 0x3ef4ff, value: R.xpGained, fmt: (v) => `+${num(v)}` },
      R.spinsEarned
        ? { label: "LUCKY SPIN", color: 0xff4fd8, value: R.spinsEarned, fmt: (v) => `+${v}` }
        : { label: spins ? "SPINS READY" : "NEXT SPIN", color: 0xff4fd8, text: spins ? `${spins}/${SPIN_MAX}` : `${Math.round((100 * (R.spinPts ?? 0)) / SPIN_EVERY)}%` },
    ];
    tiles.forEach((t, i) => {
      const cx = cardX + 30 + tileW / 2 + i * (tileW + 16);
      const tg = this.add.graphics();
      drawNeonRect(tg, cx - tileW / 2, tileY - 46, tileW, 92, 16, EDGE, { fill: 0x0b0620, fillAlpha: 0.9, width: 2, glow: EDGE_GLOW });
      const big = neonText(this, cx + (t.icon ? 14 : 0), tileY - 10, t.text ?? t.fmt(0), 36, t.color, { blur: 10 });
      const parts = [tg, big, plainText(this, cx, tileY + 28, t.label, 14, "#cfc6ff")];
      if (t.icon) parts.push(this.add.image(cx - 14 - big.width / 2 - 8, tileY - 10, "coin").setScale(0.62 / HI));
      rewards.add(parts);
      if (t.text == null)
        new RollingCounter(this, big, { format: t.fmt, onTick: Sfx.tick }).to(t.value, 500, 450 + i * 120);
      if (t.label === "LUCKY SPIN") this.time.delayedCall(900, () => Sfx.reward());
    });
    // the level bar (the XP whoosh and LEVEL UP play on it)
    const barY = y + rewardsH - 44;
    const lvlText = neonText(this, cardX + 30, barY, `LV ${R.levelBefore}`, 24, 0x3ef4ff, { ox: 0, blur: 8 });
    const xpBar = new ProgressBar(this, cardX + 130, barY - 8, cardW - 160, 16, 0x3ef4ff);
    xpBar.set(R.xpBefore / Progression.xpToNext(R.levelBefore));
    rewards.add([lvlText, xpBar.g]);
    slideIn(this, rewards, 300, 25);
    this.animateXp(xpBar, lvlText, R, 550);
    // RONIN's perk (or a DRIFT PASS+ hero's coin perk): a gold pop over the coins tile
    {
      const pb = run.perkBonus;
      const hp = run.heroPerk?.coins > 0 ? run.heroPerk : null;
      if (pb || hp) {
        const label = pb
          ? `+${pb.total} ${getCharacter(run.char).name} BONUS${pb.mul > 1 ? ` (x${pb.mul})` : ""}`
          : `+${hp.coins} ${getCharacter(run.char).name} PERK${hp.daily ? " · DAILY" : ""}`;
        const pop = neonText(this, W / 2, y - 6, label, 20, 0xffd23f, { blur: 8 }).setScale(0);
        this.tweens.add({ targets: pop, scale: 1, duration: 360, delay: 900, ease: "Back.easeOut" });
        this.time.delayedCall(900, () => Sfx.coin(6));
      }
    }
    y += rewardsH + 22;

    // ---- missions completed this run: green ticks with their coins
    for (const m of R.missions) {
      const t = plainText(this, W / 2, y, `✓ ${m.text}   +${m.reward.coins}`, 19, "#39ff88");
      slideIn(this, t, 600, 15);
      y += 30;
    }
    if (R.missions.length) y += 8;

    // ---- NEXT: one goal to chase, never a reminder of how far away the best is. Close to your
    // best (within 25%): that's the goal; otherwise the nearest unlock or mission. Spins waiting:
    // a SPIN button right here (it used to be a line of text saying to go back to the menu).
    if (goal || showSpin) {
      const nextH = 112;
      const next = this.add.container(0, 0);
      const ng = this.add.graphics();
      const c = goal ? goal.color : 0xff4fd8;
      drawNeonRect(ng, cardX, y, cardW, nextH, 24, EDGE, { fillAlpha: 0.55, width: 2, glow: EDGE_GLOW });
      next.add([ng, plainText(this, cardX + 30, y + 28, goal ? "NEXT UP" : "LUCKY SPIN", 17, "#8f86c0", { ox: 0 })]);
      const textW = cardW - 60 - (showSpin ? 170 : 0);
      if (goal) {
        const label = goal.kind === "mission" ? `MISSION · ${goal.text}` : goal.text;
        const gt = plainText(this, cardX + 30, y + 60, label, 21, hex(c), { ox: 0 });
        gt.setScale(Math.min(1, textW / Math.max(1, gt.width)));
        const gb = new ProgressBar(this, cardX + 30, y + 80, textW, 12, c);
        next.add([gt, gb.g]);
        gb.to(Math.min(1, goal.frac), 350, 600);
      } else {
        next.add(plainText(this, cardX + 30, y + 68, `${spins} spin${spins === 1 ? "" : "s"} waiting`, 22, "#ffd6f5", { ox: 0 }));
      }
      slideIn(this, next, 450, 25);
      if (showSpin) {
        const spinBtn = button(this, cardX + cardW - 105, y + nextH / 2, 160, 70, `SPIN ×${spins}`, {
          color: 0xff4fd8,
          ...edge,
          size: 22,
          fill: 0x3a0a33,
          onClick: () => this.goto("Spin"),
        });
        spinBtn.setName("spinNow");
        popIn(this, spinBtn, 700, { duration: 350 });
        // a soft pulse so the eye finds it after RETRY
        this.tweens.add({ targets: spinBtn, scale: 1.06, duration: 520, yoyo: true, repeat: -1, delay: 1400, ease: "Sine.easeInOut" });
      }
      y += nextH + 20;
    }

    // unlock / achievement banners: in the band just above RETRY, sliding in from the side
    // (they used to drop from the top onto the score). Always clear of the button: after a long
    // results list (big runs) `y + 46` used to win and put the 92 px banner on top of RETRY;
    // now it may briefly cover the last results line instead, never a button.
    // where RETRY sits: low, under the results. A long results list (coins + a perk + three
    // missions + a Lucky Spin) on a short screen (iPhone SE) used to push it to the bottom edge
    // and the SHARE / LEADERBOARD / HEROES / HOME row right off the screen (no way home but
    // RETRY). The block (RETRY and the row under it) now always stays above the home
    // indicator; on the rare crowded screen RETRY covers the last results lines instead.
    // 150 = the row's drawn bottom edge (measured: by + 146) + 4: the cap only bites when the row would
    // otherwise leave the screen, so every normal game over keeps its old layout
    // ("TAP ANYWHERE" already clamps itself above the home indicator, below).
    const sbot = this.registry.get("safeBottom") || 0;
    const by = Math.min(Math.max(y + 110, H * 0.79), H - sbot - 150);
    const toastY = by - 140; // (clear of the tall RETRY)
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

    // ---- buttons: RETRY is by far the biggest and brightest thing on screen, centred low where
    // the thumb already is; the row under it is smaller and dimmer so it never competes
    const retry = button(this, W / 2, by, 600, 156, "RETRY", {
      color: 0x39ff88,
      size: 68,
      ...edge,
      fill: 0x138a42, // a lit green fill (the other buttons are dark): the eye lands here first
      onClick: () => this.retry(),
    });
    this.retryBtn = retry;
    const rowY = by + 78 + 22 + 32;
    const small = { size: 17, ...edge };
    const share = button(this, 94, rowY, 140, 64, "SHARE", {
      ...small,
      color: 0xffd23f,
      onClick: () => openShareModal(this.game, run),
    });
    const ranks = button(this, 283, rowY, 210, 64, "LEADERBOARD", {
      ...small,
      size: 16,
      color: 0x3ef4ff,
      onClick: () => this.goto("Leaderboard", { tab: run.mode === "daily" ? "daily" : "score" }),
    });
    const heroes = button(this, 472, rowY, 140, 64, "HEROES", {
      ...small,
      color: 0xb45cff,
      onClick: () => this.goto("Characters"),
    });
    const home = button(this, 626, rowY, 140, 64, "HOME", {
      ...small,
      color: 0xff4fd8,
      onClick: () => this.goto("Menu"),
    });
    for (const b of [share, ranks, heroes, home]) b.setAlpha(0.95);
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
      Math.min(H - (this.registry.get("safeBottom") || 0) - 24, rowY + 62),
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
    // (ALL MIGHTY while the server says you're the world's #1)
    const title = Titles.shownId();
    if (title) {
      const tt = titleText(this, W - 70, headY + 70, title, { size: 12 });
      tt.setScale(Math.min(1, 112 / Math.max(1, tt.lineWidth)));
    }
    // a run with WASP LORD is tagged ILLEGAL here too, as it is on the leaderboard
    if (isIllegalHero(run.char))
      illegalTag(this, W - 70, headY + (title ? 92 : name ? 72 : 50), { ox: 0.5 });
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
        // a great placement (or a new best) celebrates; a low one is just a quiet fact
        if (!R.newBest && rank > 100) {
          const q = plainText(this, W / 2, y, msg, 19, "#8f86c0").setAlpha(0);
          q.setScale(Math.min(1, (W - 40) / Math.max(1, q.width)));
          this.tweens.add({ targets: q, alpha: 1, duration: 300 });
          return;
        }
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
