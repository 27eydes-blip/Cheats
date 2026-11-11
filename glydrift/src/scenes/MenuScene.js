// Title screen: dimmed living background, the selected hero flying a figure-eight, a big
// ENDLESS button, LEVELS (level mode, which replaced the Daily Challenge), four main buttons
// (Heroes, Shop, Leaderboard, Settings) and one MORE sheet holding everything else.
import { COPYRIGHT, CREATED_BY, CREATOR_ROLE } from "../legal.js";
import Phaser from "phaser";
import { BIOMES, biomeIndex, biomeStateAt, blendPalette, CLASSIC } from "../biomes/biomes.js";
import { COIN_COLOR, fitCamera, FONT, NUM_FONT, VIEW } from "../config.js";
import { Effects } from "../effects/Effects.js";
import { Analytics } from "../systems/analytics.js";
import { Founding } from "../data/founding.js";
import { HI } from "../gfx/textures.js";
import { PORTRAIT_K } from "../pixel/common.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { CHARACTERS, getCharacter, onSale, saleLeft } from "../player/characterDefs.js";
import { Sfx } from "../audio/sfx.js";
import { TEST } from "../systems/testFlags.js";
import { Haptics, hapticsLevel } from "../systems/haptics.js";
import { Install } from "../systems/install.js";
import { flairOf, Leaderboard, Levels, myFlair } from "../online/leaderboard.js";
import { nameText } from "../ui/nameplate.js";
import { openRewardPreview } from "../ui/rewardPreview.js";
import { PassPlus, plusRewardFor } from "../data/passPlus.js";
import { titleText } from "../ui/titleText.js";
import { AllMighty } from "../data/allMighty.js";
import { Titles } from "../data/titles.js";
import { Account } from "../online/account.js";
import { LbReset } from "../online/lbReset.js";
import { CrashSafety } from "../systems/crashSafety.js";
import { Updater } from "../systems/updater.js";
import { openSite } from "../systems/platform.js";
import { openAccount } from "../ui/accountModal.js";
import { getCosmetic, Shop } from "../data/cosmetics.js";
import { lockerTotals } from "../data/locker.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Music } from "../audio/music.js";
import { LOGIN_REWARDS, Progression } from "../data/progression.js";
import { LEVEL_COUNT, currentLevel, totalStars } from "../levels/levels.js";
import { Save } from "../data/save.js";
import { Seasons } from "../data/seasons.js";
import { claimSeasonTier, DriftPass } from "../data/driftPass.js";
import { askUsername } from "../ui/nameModal.js";
import { openStats } from "./StatsScene.js";
import { openChest, revealHero } from "../ui/reveal.js";
import {
  killTweensDeep,
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
  num,
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

/** Most red "!" badges shown on the home screen at once. */
const MAX_BANGS = 2;

/** The glydrift.com launch pop-up comes up at most once per launch. */
let moveShownThisLaunch = false;

/** The launch rift: a jagged slash (k < 0.5) that widens into a glowing portal. */
function drawRift(g, x, y, k, T, calm) {
  g.clear();
  if (k < 0.5) {
    const len = 300 * (k / 0.5);
    const steps = 14;
    for (const [w, col, a] of [
      [14, 0xb45cff, 0.35],
      [7, 0x3ef4ff, 0.8],
      [3, 0xffffff, 1],
    ]) {
      g.lineStyle(w, col, a).beginPath();
      for (let i = 0; i <= steps; i++) {
        const yy = y - len / 2 + (len * i) / steps;
        const xx = x + (i % 2 ? 10 : -10) * (i > 0 && i < steps ? 1 : 0);
        if (i === 0) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.strokePath();
    }
    return;
  }
  const u = (k - 0.5) / 0.5;
  drawPortal(g, x, y, T, calm, 230 * u, 160);
}

/** A swirling neon portal: dark core, rings, and a few pixel motes orbiting it. */
function drawPortal(g, x, y, T, calm, rx = 110, ry = 82) {
  g.clear();
  if (rx < 2) return;
  const spin = calm ? T * 0.6 : T * 1.4;
  g.fillStyle(0x12042a, 0.95).fillEllipse(x, y, rx * 2, ry * 2);
  g.fillStyle(0x3a1070, 0.6).fillEllipse(x, y, rx * 1.4, ry * 1.4);
  const rings = [
    [1, 0x3ef4ff, 4],
    [0.82, 0xb45cff, 3],
    [0.62, 0xff4fd8, 2],
  ];
  for (const [f, col, w] of rings) {
    const wob = calm ? 1 : 1 + Math.sin(T * 3 + f * 5) * 0.03;
    g.lineStyle(w, col, 0.9).strokeEllipse(x, y, rx * 2 * f * wob, ry * 2 * f * wob);
  }
  for (let i = 0; i < 12; i++) {
    const a = spin + (i / 12) * Math.PI * 2;
    const r = 0.7 + 0.25 * Math.sin(i * 1.7);
    g.fillStyle(i % 3 ? 0x3ef4ff : 0xffd23f, 0.9).fillRect(
      Math.round(x + Math.cos(a) * rx * r) - 3,
      Math.round(y + Math.sin(a) * ry * r) - 3,
      6,
      6,
    );
  }
}

/** Type a word into a text, one letter at a time; a neon flicker unless Reduce Flashing. */
function typeDomain(scene, text, word, calm, onDone) {
  let i = 0;
  const step = () => {
    i++;
    text.setText(word.slice(0, i));
    if (!calm) {
      text.setAlpha(0.35);
      scene.time.delayedCall(45, () => text.setAlpha(1));
      if (Math.random() < 0.35) scene.time.delayedCall(95, () => text.setAlpha(0.6));
      scene.time.delayedCall(140, () => text.setAlpha(1));
    }
    if (i < word.length) scene.time.delayedCall(75, step);
    else onDone();
  };
  scene.time.delayedCall(120, step);
}

const shorten = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create() {
    this.moveFly = null;
    this.moveBusy = false;
    // an emailed link opened the game: a password reset continues, a confirmation says so
    const offAcct = Account.onChange(() => {
      const type = Account.linkType;
      if (!type || !this.sys.isActive()) return;
      Account.linkType = null;
      if (type === "recovery") openAccount({ view: "newpass" });
      else
        toast(this, "EMAIL CONFIRMED", 0x39ff88, {
          y: this.H * 0.3,
          sub: "Your account is ready",
        });
    });
    this.events.once("shutdown", offAcct);
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    const s = Save.data;
    this.leaving = false;
    this.modal = null;
    this.claiming = false;
    this.seasonBusy = false;
    // private browsing / blocked storage: the game runs, but say that progress won't save
    const note = document.getElementById("storage-note");
    if (note && !Save.canPersist()) {
      note.classList.add("show");
      const hide = () => note.classList.remove("show");
      this.time.delayedCall(8000, hide);
      this.events.once("shutdown", hide);
    }
    const lowGfx = s.settings.lowGfx;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.top = top;
    // ---- layout: one column top to bottom, spread evenly over the whole screen
    const L = this.layout(top);
    this.L = L;
    this.showIds = null; // re-pick the showcase worlds every visit (newly reached ones too)
    this.def = getCharacter(TEST.character || Progression.selectedHero());
    this.cameras.main.fadeIn(300, 2, 1, 7);

    this.backdrop = this.scene.get("Backdrop");
    this.fx = new Effects(this, { lowGfx });
    this.pal = {};
    this.t = Math.random() * 400;
    Music.play("menu");

    // ---- logo: one text object → perfectly even letter spacing; nothing overlaps it
    const logoY = L.logo - 16;
    this.logo = neonText(this, W / 2, logoY, "GLYDRIFT", 84, 0x3ef4ff, { blur: 22 }).setDepth(100);
    this.logo.setLetterSpacing?.(6);
    this.tagline = plainText(
      this,
      W / 2,
      logoY + 54,
      "DRIFT THE NEON COSMOS",
      20,
      "#bfb6e8",
    ).setDepth(100);
    popIn(this, this.logo, 80);

    // ---- seasons: wrap up ended seasons (auto-claim + recap), then the live season's look
    const hk = Seasons.housekeeping(claimSeasonTier, (s, i) => PassPlus.claimEnded(s, i));
    this.seasonQueue = hk.recaps.map((r) => () => this.openRecap(r));
    this.season = Seasons.active();
    if (this.season) {
      this.buildSeasonTheme(); // (the season banner itself lives in the MORE sheet)
      if (Seasons.needsHeroReveal()) this.seasonQueue.push(() => this.newHeroReveal());
    }
    // Drift Pass+ "Abyss" home theme (chosen in Settings)
    this.applyHomeTheme();
    // test builds only: ?ppreview=<reward id> opens its preview card
    if (TEST.ppreview) {
      const pr = plusRewardFor(TEST.ppreview);
      if (pr) this.time.delayedCall(300, () => openRewardPreview(this, pr.reward, { plus: true, tier: pr.tier }));
    }
    // hidden music test: tap the logo 5 times
    this.logoTaps = 0;
    this.logo.setInteractive().on("pointerdown", () => {
      this.logoTaps++;
      if (TEST.on && this.logoTaps >= 5) this.go("MusicTest"); // test builds only
    });

    // ---- hero
    this.heroY = L.hero;
    this.heroAmp = Math.min(30, L.heroH * 0.12); // gentle bob inside its slot
    // pedestal glow under the hero
    const ped = this.add.graphics().setDepth(54);
    const py = L.hero + L.heroH * 0.36;
    ped.fillStyle(this.def?.color ?? 0x3ef4ff, 0.18).fillEllipse(W / 2, py, 300, 46);
    ped.lineStyle(3, 0x3ef4ff, 0.5).strokeEllipse(W / 2, py, 240, 34);
    ped.lineStyle(2, 0xb45cff, 0.4).strokeEllipse(W / 2, py + 6, 300, 46);
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
      scale: Phaser.Math.Clamp(L.heroH / 150, 1.2, 1.9),
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
    // your name + the title you wear, between the level and the coins
    this.npTop = top;
    this.refreshNamePlate();
    // the server's ALL MIGHTY answer can land after the home screen is up: wear it at once
    const offMighty = AllMighty.onChange(() => this.sys.isActive() && this.refreshNamePlate());
    this.events.once("shutdown", offMighty);
    this.coinIcon = this.add
      .image(W - 196, top + 40, "coin") // (the gear moved into the main row as SETTINGS)
      .setScale(0.8 / HI)
      .setDepth(100);
    this.coinText = neonText(this, W - 170, top + 40, `${s.coins}`, 28, COIN_COLOR, {
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
    popIn(this, [lv, this.coinIcon, this.coinText], 150);

    // ---- buttons: PLAY is the biggest & brightest
    const by = L.play;
    const play = button(this, W / 2, by, 500, 150, "ENDLESS", {
      color: 0x39ff88,
      size: 60,
      fill: 0x0c2a1a,
      onClick: () => this.startGame("normal"),
    }).setDepth(100);
    this.play = play; // pulses to the music's beat (see update)
    this.beatClock = 0;
    if (s.best > 0) {
      const best = neonText(this, W / 2, L.best, `BEAT YOUR BEST · ${num(s.best)}`, 24, 0xffd23f, {
        blur: 10,
      }).setDepth(100);
      this.bestText = best;
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
    // LEVEL MODE replaced the Daily Challenge: 50 hand-made levels with stars
    this.daily = button(this, W / 2, L.daily, 380, 86, "LEVELS", {
      color: 0xffd23f,
      size: 30,
      sub: `${totalStars()}/${LEVEL_COUNT * 3} ★ · level ${currentLevel()}`,
      onClick: () => this.go("LevelSelect"),
    }).setDepth(100);
    this.levelsBtn = this.daily;
    // ---- the main row: HEROES · SHOP · LEADERBOARD · SETTINGS. Everything else (Lucky Spin,
    // the free drop, the season pass, progress, the streak, "Add to Home Screen") sits in
    // the one MORE sheet under it, so the home screen stays calm (see moreEntries()).
    // a limited-time hero on sale and not yet owned → "24H ONLY" tag; HEROES opens on it
    const limitedHero = CHARACTERS.find((c) => c.limited && onSale(c) && !s.unlocked[c.id]);
    const row = [
      ["HEROES", 0xb45cff, 150, () => {
        if (limitedHero) this.registry.set("heroFocus", limitedHero.id);
        this.go("Characters");
      }],
      ["SHOP", 0xffd23f, 150, () => this.go("Shop")],
      ["LEADERBOARD", 0x3ef4ff, 190, () => this.go("Leaderboard")],
      ["SETTINGS", 0xd8d0ff, 150, () => this.openSettings()],
    ];
    const rowGap = 12;
    let rx = W / 2 - (row.reduce((a, r) => a + r[2], 0) + rowGap * (row.length - 1)) / 2;
    this.mainButtons = row.map(([label, color, w, onClick]) => {
      const b = button(this, rx + w / 2, L.row, w, 76, label, {
        color,
        size: label === "LEADERBOARD" ? 14 : 16,
        onClick,
      }).setDepth(100);
      rx += w + rowGap;
      return b;
    });
    const [heroes, shop, ranks, settings] = this.mainButtons;
    this.heroesBtn = heroes;
    this.shopBtn = shop;
    // MORE: smaller and quieter than the main row (it's the "everything else" drawer)
    this.moreBtn = button(this, W / 2, L.more, 260, 58, "MORE", {
      color: 0x9c90c8,
      size: 18,
      onClick: () => this.openMore(),
    }).setDepth(100);
    popIn(this, [play, this.daily, heroes, shop, ranks, settings], 250);
    popIn(this, this.moreBtn, 320);
    this.placeBadges(limitedHero);
    this.time.delayedCall(520, () => {
      this.fx.burst("star", W / 2, by, 24, 0x39ff88, { speed: { min: 150, max: 520 } });
      this.fx.ring(W / 2, by, 0x39ff88, { scale: 2.6, duration: 600 });
    });
    // the news ticker at the very bottom
    this.buildTicker(L.ticker);
    // the creator credit: a small, quiet line under MORE (NEVER remove or hide it)
    this.creditText = plainText(this, W / 2, L.credit, CREATED_BY, 14, "#a89ed8")
      .setAlpha(0.85)
      .setDepth(100)
      .setName("creatorCredit");
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateCountdown() });

    // ---- one pop-up at a time on arrival (first launch, or a fresh guest after logging out):
    // pick a name → the daily reward (chest + coins) → season recaps → the NEW HERO reveal.
    // Each waits until the one before has fully finished (see update()).
    this.seasonQueue.unshift(
      () => (!Leaderboard.username ? this.promptName(true) : null),
      () => this.maybeLbResetNotice(),
      () => {
        const ls = Progression.loginStatus();
        if (ls.canClaim) this.openLogin(ls);
      },
      () => this.maybeMoveNotice(),
    );
    this.queueT = 0.45;
    // a run the game was closed in the middle of (or errored out of) was finished for them
    const saved = CrashSafety.lastRecovered;
    if (saved) {
      CrashSafety.lastRecovered = null;
      this.time.delayedCall(700, () =>
        toast(this, "YOUR LAST RUN WAS SAVED", 0x39ff88, {
          y: this.H * 0.3,
          sub: `${saved.score} points · ${saved.distance} m · on the leaderboard`,
        }),
      );
    }
    // a newer version is live: the home screen is a safe moment to load it
    Updater.applyIfSafe();

    this.input.keyboard?.on("keydown-SPACE", () => this.startGame("normal"));

    // the loading splash fades once the home screen has drawn
    this.events.once("postupdate", () => {
      const sp = document.getElementById("splash");
      if (!sp) return;
      sp.classList.add("gone");
      setTimeout(() => sp.remove(), 400);
    });
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

  // ------------------------------------------------------------------ MORE sheet + badges
  /**
   * Everything that isn't PLAY, LEVELS or one of the four main buttons, as one plain list: the
   * MORE sheet draws one row per entry, in this order. To add a page later (a Stats page), add
   * an entry here: `{ id, label, sub, color, go }` (+ `ready: true` for a red "!" when
   * something is waiting there). Entries that don't apply are left out (null).
   */
  moreEntries() {
    const s = Save.data;
    const ls = Progression.loginStatus();
    const spins = s.spins || 0;
    const drop = Shop.dropReady();
    const season = this.season;
    const total = season?.pass.tiers.length || 0;
    const locker = lockerTotals();
    return [
      season && {
        id: "pass",
        label: `SEASON ${season.number} · ${season.name}`,
        sub: `Drift Pass · tier ${Math.min(total, DriftPass.unlockedCount())}/${total} · ends in ${Seasons.countdown(season)}`,
        color: Seasons.colors(season).accent,
        ready: DriftPass.claimable() > 0,
        go: () => {
          if (this.leaving) return;
          this.leaving = true;
          fadeTo(this, "Pass", { from: "Menu" }, { ms: 180, rgb: [2, 1, 7] });
        },
      },
      {
        id: "spin",
        label: "LUCKY SPIN",
        sub: spins > 0 ? `${spins} spin${spins > 1 ? "s" : ""} ready` : "Earn spins by playing",
        color: 0xff7ad9,
        ready: spins > 0,
        go: () => this.go("Spin"),
      },
      {
        id: "drop",
        label: "FREE DROP",
        sub: drop ? "Your free Daily Drift Drop is waiting" : "A new free drop tomorrow",
        color: 0x7ae82a,
        ready: drop,
        go: () => this.go("Shop"),
      },
      {
        id: "streak",
        label: "DAILY STREAK",
        sub: ls.canClaim
          ? "Today's reward is ready to claim"
          : `${ls.streak || s.login.streak || 0}-day streak · back tomorrow`,
        color: 0xff8a1a,
        ready: ls.canClaim,
        go: () =>
          Progression.loginStatus().canClaim
            ? this.openLogin(Progression.loginStatus())
            : toast(this, `${s.login.streak}-DAY STREAK!`, 0xff8a1a, {
                y: this.H * 0.3,
                sub: "Come back tomorrow to keep it going",
              }),
      },
      {
        id: "locker",
        label: "LOCKER ROOM",
        sub: `Heroes ${locker.heroes.owned}/${locker.heroes.total} · wear your looks, titles & badges`,
        color: 0x39ff88,
        go: () => this.go("Locker"),
      },
      {
        id: "progress",
        label: "PROGRESS",
        sub: "Missions · achievements · titles",
        color: 0xff4fd8,
        go: () => this.go("Progress"),
      },
      {
        id: "stats",
        label: "STATS",
        sub: `${(s.stats.runs || 0).toLocaleString("en-US")} runs · best ${(s.best || 0).toLocaleString("en-US")}`,
        color: 0x3ef4ff,
        go: () => openStats(this),
      },
      Install.available && {
        id: "install",
        label: "ADD TO HOME SCREEN",
        sub: "Play full screen, like an app",
        color: 0x39ff88,
        go: () => Install.prompt(),
      },
    ].filter(Boolean);
  }

  /**
   * Badges on the home screen: at most MAX_BANGS at once (more just reads as noise), the most
   * important first: a free reward in the Shop, then a reward to claim inside MORE (the daily
   * streak), a limited-time hero leaving soon, other things waiting in MORE (spins, pass
   * tiers), and last the Shop's new season items. MORE carries one badge: how many of its
   * entries are waiting (the free drop is left out of that count while SHOP shows it).
   */
  placeBadges(limitedHero) {
    const drop = Shop.dropReady();
    const waiting = this.moreEntries().filter((e) => e.ready && e.id !== "drop");
    const loginReady = waiting.some((e) => e.id === "streak");
    const cands = [
      drop && { id: "shop-free", host: this.shopBtn, text: "FREE", color: 0x1fae5a, prio: 0 },
      waiting.length && {
        id: "more",
        host: this.moreBtn,
        text: `${waiting.length}`,
        prio: loginReady ? 1 : 3,
      },
      limitedHero && { id: "heroes-24h", host: this.heroesBtn, text: "24H ONLY", color: 0xff3a8a, prio: 2, top: true },
      !drop && Seasons.shopItems().length && { id: "shop-new", host: this.shopBtn, text: "NEW", prio: 4 },
    ]
      .filter(Boolean)
      .sort((a, b) => a.prio - b.prio)
      .slice(0, MAX_BANGS);
    this.homeBadges = cands.map((c) => c.id); // (read by the tests)
    for (const c of cands) {
      const b = c.host;
      // a wide tag sits centred on the top edge; a short one on the top-right corner
      const x = c.top ? 0 : b.width / 2 - 14;
      this.tileBadge(b, x, -b.height / 2 - 4, c.text, c.color);
      b.setDepth(101); // over its neighbour in the row
    }
  }

  /** The MORE sheet: one tidy list of everything off the home screen (see moreEntries()). */
  openMore() {
    if (this.modal || this.leaving || this.naming) return;
    const W = this.W;
    const H = this.H;
    const entries = this.moreEntries();
    const st = this.registry.get("safeTop") || 0;
    const sb = this.registry.get("safeBottom") || 0;
    // rows share the height between the title and CLOSE, up to a comfortable size
    const rowH = Phaser.Math.Clamp((H - st - sb - 80 - 250) / entries.length, 84, 112);
    const h = 120 + rowH * entries.length + 130;
    const c = this.modalBase(h, 0x9c90c8);
    c.isMore = true;
    const y0 = H / 2 - h / 2 + (st - sb) / 2;
    c.list[1].y = (st - sb) / 2; // the panel frame follows the safe-area shift
    const dim = c.list[0];
    dim.on("pointerup", () => this.closeModal());
    c.add(neonText(this, W / 2, y0 + 62, "MORE", 40, 0xd8d0ff, { blur: 12 }));
    const rw = W - 120;
    const rh = rowH - 14;
    entries.forEach((e, i) => {
      const r = this.add.container(W / 2, y0 + 120 + rowH * i + rowH / 2);
      const g = this.add.graphics();
      drawNeonRect(g, -rw / 2, -rh / 2, rw, rh, 18, e.color, { fillAlpha: 0.92, width: 2 });
      const label = neonText(this, -rw / 2 + 26, -rh * 0.17, e.label, 21, e.color, {
        ox: 0,
        blur: 6,
      });
      label.setScale(Math.min(1, (rw - 110) / Math.max(1, label.width)));
      const sub = plainText(this, -rw / 2 + 26, rh * 0.22, e.sub, 15, "#d8d0ff", { ox: 0 });
      sub.setScale(Math.min(1, (rw - 110) / Math.max(1, sub.width)));
      r.add([g, label, sub, plainText(this, rw / 2 - 30, 0, "▸", 26, hex(e.color))]);
      if (e.ready) {
        const b = this.add.graphics();
        b.fillStyle(0xff2a3d, 1).fillCircle(rw / 2 - 70, 0, 14);
        b.lineStyle(2, 0xffffff, 1).strokeCircle(rw / 2 - 70, 0, 14);
        r.add([b, plainText(this, rw / 2 - 70, -1, "!", 17, "#ffffff")]);
      }
      r.setSize(rw, rh).setInteractive();
      r.on("pointerdown", () => this.tweens.add({ targets: r, scale: 0.96, duration: 70 }));
      r.on("pointerup", () => {
        Sfx.ui();
        // the sheet goes at once, so a pop-up the entry opens (the daily reward) can show
        killTweensDeep(this, c);
        c.destroy();
        this.modal = null;
        e.go();
      });
      c.add(r);
      popIn(this, r, 40 + i * 40, { duration: 320 });
    });
    c.add(
      button(this, W / 2, y0 + h - 66, 260, 76, "CLOSE", {
        color: 0x9c90c8,
        size: 22,
        onClick: () => this.closeModal(),
      }),
    );
    this.moreEntriesShown = entries.map((e) => e.label); // (read by the tests)
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
    if (this.trick > 0) {
      // mid-loop: a tap still gets a reaction (a squashy flap + a few sparks), never ignored
      if (tapped) {
        this.rig.flap();
        this.rig.sx = 1.2;
        this.rig.sy = 0.85;
        this.fx.burst("star", this.rig.x, this.rig.y, 8, this.def.color, {
          speed: { min: 100, max: 300 },
        });
        Haptics.tap?.();
      }
      return;
    }
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

  // ------------------------------------------------------------------ layout
  /**
   * Centre Y of every home-screen block, top to bottom, with even gaps that fill the screen:
   * top bar · logo + tagline · hero · BEAT YOUR BEST · PLAY · LEVELS ·
   * Heroes / Shop / Leaderboard / Settings · MORE · ticker. (Everything else is in MORE.)
   */
  layout(top) {
    const H = this.H;
    const sb = this.registry.get("safeBottom") || 0;
    const tickerH = 48;
    const bottom = H - sb - tickerH; // the ticker sits under everything
    const avail = bottom - top;
    const blocks = [
      ["bar", 70],
      ["logo", 104],
      ["hero", 0],
      ["best", 30],
      ["play", 140],
      ["daily", 86],
      ["row", 76],
      ["more", 58],
      ["credit", 18], // "Created by Sam Eyde III" (never remove: tests/e2e/credit.spec.js)
    ];
    const fixed = blocks.reduce((a, b) => a + b[1], 0);
    const n = blocks.length;
    const gap = Phaser.Math.Clamp((avail - fixed - 240) / n, 8, 34);
    const heroH = Math.max(150, avail - fixed - gap * n);
    const L = { heroH, ticker: H - sb - tickerH / 2 };
    let y = top;
    for (const [name, h0] of blocks) {
      const h = name === "hero" ? heroH : h0;
      L[name] = y + h / 2;
      y += h + gap;
    }
    return L;
  }

  /** A little red corner ribbon / badge on a tile. */
  tileBadge(c, x, y, text, color = 0xff2a3d) {
    const b = this.add.container(x, y);
    b.isBadge = true; // (counted by the tests: never more than MAX_BANGS on the home screen)
    const g = this.add.graphics();
    const w = Math.max(44, text.length * 12 + 22);
    g.fillStyle(0x1a0630, 1).fillRoundedRect(-w / 2 - 3, -17, w + 6, 34, 17);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -14, w, 28, 14);
    g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-w / 2, -14, w, 28, 14);
    b.add([g, plainText(this, 0, -1, text, 15, "#ffffff")]);
    c.add(b);
    this.tweens.add({
      targets: b,
      scale: 1.1,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return b;
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

  // ------------------------------------------------------------------ name plate + home theme
  /**
   * Your name and the title you wear in the top bar (with the Drift Pass+ gold name and forever
   * Season 1 badge when you have them). Rebuilt when Settings changes the gold name.
   */
  refreshNamePlate() {
    for (const o of this.namePlate || []) o.destroy();
    this.namePlate = null;
    const uname = Save.data.profile?.username;
    if (!uname) return;
    const W = this.W;
    const top = this.npTop;
    const fl = flairOf({ flair: myFlair() });
    const np = nameText(this, W / 2 - 12, top + 30, uname, {
      size: 19,
      ox: 0.5,
      gold: fl.gold,
      badge: fl.s1,
      font: NUM_FONT,
    }).setDepth(100);
    np.setScale(Math.min(1, (W - 470) / Math.max(1, np.getBounds().width)));
    // (ALL MIGHTY while the server says you're the world's #1)
    const tt = titleText(this, W / 2 - 12, top + 56, Titles.shownId(), { size: 11 }).setDepth(100);
    if (tt.list.length) tt.setScale(Math.min(1, (W - 470) / Math.max(1, tt.getBounds().width)));
    this.namePlate = [np, tt];
  }

  /** Build (or take down) the Drift Pass+ "Abyss" home theme to match Settings. */
  applyHomeTheme() {
    const want = Shop.equipped("theme") === "theme_pp_abyss";
    if (!!this.abyss === want) return;
    if (!want) {
      for (const o of this.abyss.objects) o.destroy();
      this.abyss = null;
      for (const r of this.seasonBits || []) r.setVisible(true);
      return;
    }
    this.buildAbyssTheme();
  }

  /**
   * The "Abyss" home theme: the menu sinks into the dark, eyes open in the shadows at the edges
   * and blink slowly (their pupils follow your hero), and dim motes drift up through it. Fewer
   * eyes and motes on Low Graphics; nothing flashes, so Reduce Flashing changes nothing.
   */
  buildAbyssTheme() {
    const W = this.W;
    const H = this.H;
    const low = !!Save.data.settings.lowGfx;
    const objects = [];
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x05010a, 0.62).fillRect(0, 0, W, H);
    g.fillGradientStyle(0x1a0418, 0x1a0418, 0x1a0418, 0x1a0418, 0.9, 0.9, 0, 0);
    g.fillRect(0, 0, W, H * 0.3);
    g.fillGradientStyle(0x14020a, 0x14020a, 0x14020a, 0x14020a, 0, 0, 0.9, 0.9);
    g.fillRect(0, H * 0.7, W, H * 0.3);
    objects.push(g);
    for (const r of this.seasonBits || []) r.setVisible(false);
    // eyes in the dark at the edges (never behind the buttons in the middle)
    const eyes = [];
    const n = low ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const x = left ? 34 + Math.random() * 50 : W - 34 - Math.random() * 50;
      const y = H * (0.14 + (0.72 * (i + Math.random() * 0.6)) / n);
      const k = 1.1 + Math.random() * 0.6;
      const eye = this.add.container(x, y).setDepth(5).setScale(k);
      const glow = this.add
        .image(0, 0, "glow")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff2a4a)
        .setScale(0.5)
        .setAlpha(0.25);
      const ball = this.add.graphics();
      // a pixel-stepped almond eye
      ball.fillStyle(0x2a0410, 1).fillRect(-20, -6, 40, 12).fillRect(-14, -10, 28, 20);
      ball.fillStyle(0xf0e0e8, 1).fillRect(-17, -4, 34, 8).fillRect(-11, -7, 22, 14);
      const iris = this.add.container(0, 0);
      const ig = this.add.graphics();
      ig.fillStyle(0xc8102e, 1).fillRect(-6, -6, 12, 12);
      ig.fillStyle(0xff5a3a, 1).fillRect(-4, -6, 8, 2);
      ig.fillStyle(0x0a0206, 1).fillRect(-1.5, -5, 3, 10);
      iris.add(ig);
      eye.add([glow, ball, iris]);
      eye.iris = iris;
      eye.setAlpha(0.7);
      eye.lid = 1; // 1 open → 0 shut
      eye.nextBlink = 1.5 + Math.random() * 5;
      eyes.push(eye);
      objects.push(eye);
    }
    // drifting motes
    const motes = [];
    const m = low ? 10 : 24;
    for (let i = 0; i < m; i++) {
      const r = this.add
        .rectangle(Math.random() * W, Math.random() * H, 4, 4, [0x8a2a9a, 0xff3a4a, 0x4a1a6a][i % 3])
        .setDepth(5)
        .setAlpha(0.3 + Math.random() * 0.4);
      r.v = 10 + Math.random() * 26;
      r.ph = Math.random() * 6;
      motes.push(r);
      objects.push(r);
    }
    this.abyss = { objects, eyes, motes };
  }

  updateAbyss(dt) {
    const a = this.abyss;
    if (!a) return;
    const hx = this.rig?.x ?? this.W / 2;
    const hy = this.rig?.y ?? this.H / 2;
    for (const e of a.eyes) {
      // slow blinks: close over ~0.35 s, a beat shut, open over ~0.5 s
      e.nextBlink -= dt;
      if (e.nextBlink <= 0 && !e.blinking) {
        e.blinking = true;
        this.tweens.chain({
          targets: e,
          tweens: [
            { scaleY: e.scaleX * 0.08, duration: 350, ease: "Sine.easeIn" },
            { scaleY: e.scaleX, duration: 500, delay: 150, ease: "Sine.easeOut" },
          ],
          onComplete: () => {
            e.blinking = false;
            e.nextBlink = 3 + Math.random() * 5;
          },
        });
      }
      // the pupils follow your hero
      const ang = Math.atan2(hy - e.y, hx - e.x);
      e.iris.setPosition(Math.cos(ang) * 6, Math.sin(ang) * 2);
    }
    for (const r of a.motes) {
      r.ph += dt;
      r.y -= r.v * dt;
      r.x += Math.sin(r.ph * 0.9) * 12 * dt;
      if (r.y < -10) {
        r.y = this.H + 10;
        r.x = Math.random() * this.W;
      }
    }
  }

  updateSeason(dt) {
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
    this.updateMoveFly(dt);
    // one arrival pop-up at a time: name, daily reward, recaps, then the new hero reveal
    if (this.seasonQueue?.length && !this.seasonBusy && !this.leaving && this.popupFree()) {
      this.queueT -= dt;
      if (this.queueT <= 0) {
        this.seasonBusy = true;
        Promise.resolve(this.seasonQueue.shift()()).then((shown) => {
          this.seasonBusy = false;
          // a step with nothing to show (it says so with false) doesn't hold up the next one
          this.queueT = shown === false ? 0 : 0.5;
        });
      }
    }
  }

  /**
   * The move to glydrift.com, as a launch event. On the old address only: guests are invited
   * to lock their progress into an account (browser-saved progress can't follow a new
   * domain); signed-in players are told they're all set. Both get "Founding Drifter" (an
   * exclusive trail + title). A guest who taps LATER sees it once more on a later launch;
   * it never comes back after that, and never twice in one launch.
   */
  async maybeMoveNotice() {
    if (!Founding.live() || moveShownThisLaunch) return;
    const st = Founding.state();
    if (st.done || !Account.available) return;
    let ready = false;
    let signedIn = false;
    try {
      Account.init();
      await Account.ready;
      signedIn = Account.signedIn;
      // a guest is only sent to sign-up once accounts are open on the server
      ready = signedIn || (st.shown < 2 && (await Account.backend.serverReady()));
    } catch {
      ready = false;
    }
    if (!ready || this.leaving || !this.scene.isActive()) return;
    moveShownThisLaunch = true;
    st.shown++;
    Save.write();
    return this.openMovePopup(signedIn);
  }

  /**
   * The leaderboards were reset on the server (online/lbReset.js): once per player, a
   * notice that their progress is safe and everyone starts fresh. Never on a new install.
   */
  async maybeLbResetNotice() {
    const id = await LbReset.check();
    if (!id || this.leaving || !this.scene.isActive()) return false;
    // the old best is gone from this device: take it off the home screen too
    this.bestText?.destroy();
    this.bestText = null;
    if (this.tickItems) this.tickItems = this.tickItems.filter((t) => !/^Your best:/.test(t));
    // the queue waits for a free screen, but the check above took a moment: wait again
    while (!this.popupFree()) {
      await new Promise((r) => this.time.delayedCall(250, r));
      if (this.leaving || !this.scene.isActive()) return;
    }
    return this.openLbResetNotice();
  }

  openLbResetNotice() {
    return new Promise((resolve) => {
      const W = this.W;
      const H = this.H;
      const h = 620;
      const y0 = H / 2 - h / 2;
      const c = this.modalBase(h, 0xff3ea8);
      this.lbNoticeOpen = true;
      // a trophy with a reset arrow, drawn in the game's pixel-icon style
      const icon = this.add.graphics().setPosition(W / 2, y0 + 92);
      const px = 8; // a chunky pixel trophy
      const cup = [
        "1111111111",
        "1011111101",
        "1011111101",
        "0111111110",
        "0011111100",
        "0001111000",
        "0000110000",
        "0001111000",
        "0011111100",
      ];
      cup.forEach((row, j) =>
        [...row].forEach((v, i) => {
          if (v !== "1") return;
          icon.fillStyle(j === 0 || i === 2 ? 0xfff1a0 : 0xffd23f, 1);
          icon.fillRect((i - 5) * px, (j - 5) * px, px, px);
        }),
      );
      c.add(icon);
      c.add(
        neonText(this, W / 2, y0 + 176, "LEADERBOARD RESET", 40, 0xff3ea8, { blur: 14 }),
      );
      c.add(
        plainText(
          this,
          W / 2,
          y0 + 318,
          "Due to inflated scores, the leaderboard has been reset. Your coins, heroes and " +
            "progress are safe. Everyone starts fresh — go claim the #1 spot!",
          24,
          "#f1ebff",
          { wrap: W - 150, lineSpacing: 8 },
        ),
      );
      Sfx.combo(3);
      Haptics.light();
      c.add(
        button(this, W / 2, y0 + h - 78, 320, 88, "LET'S GO", {
          color: 0x39ff88,
          size: 32,
          onClick: () => {
            LbReset.markShown();
            this.lbNoticeOpen = false;
            this.closeModal();
            resolve();
          },
        }),
      );
    });
  }

  openMovePopup(signedIn) {
    const W = this.W;
    const H = this.H;
    const calm = reduceFlashing();
    const st = Founding.state();
    this.moveFx ||= new Effects(this, { lowGfx: !!Save.data.settings.lowGfx, depth: 360 });
    const fx = this.moveFx;
    const h = 960;
    const top = -h / 2;
    const c = this.add.container(0, 0).setDepth(300);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x020107, 0.85).setInteractive();
    c.add(dim);
    this.modal = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });

    // ---- 1. a rift tears open in the centre (a jagged slash that widens into a portal)
    const rift = this.add.graphics().setDepth(301).setBlendMode(Phaser.BlendModes.ADD);
    c.add(rift);
    const tear = { k: 0 };
    Sfx.portalOpen();
    Haptics.light();
    this.tweens.add({
      targets: tear,
      k: 1,
      duration: 520,
      ease: "Cubic.easeOut",
      onUpdate: () => drawRift(rift, W / 2, H / 2, tear.k, this.time.now / 1000, calm),
    });

    // ---- 2. the panel flies out of it
    const p = this.add.container(W / 2, H / 2).setDepth(302).setScale(0.05).setAngle(-10);
    c.add(p);
    const pw = W - 64;
    const panel = this.add.graphics();
    drawNeonRect(panel, -pw / 2, top, pw, h, 26, 0x3ef4ff, { fillAlpha: 0.97 });
    p.add(panel);
    // the portal in the header: the hero flies through it wearing the Founding trail
    const portalY = top + 150;
    const portal = this.add.graphics();
    p.add(portal);
    p.add(
      plainText(this, 0, top + 262, "YOUR HERO · FOUNDING TRAIL", 15, "#9c90c8", {
        weight: "800",
      }),
    );
    const fit = (t, max) => (t.width > max ? t.setScale(max / t.width) : t);
    p.add(
      fit(neonText(this, 0, top + 318, "GLYDRIFT HAS A NEW HOME", 34, 0x3ef4ff, { blur: 14 }), pw - 70),
    );
    const domain = neonText(this, 0, top + 384, "glydrift.com", 50, 0xffd23f, { blur: 16 }).setText("");
    p.add(domain);
    p.add(
      plainText(
        this,
        0,
        top + 452,
        signedIn
          ? "You're all set! Your progress is coming with you."
          : "Lock in your progress before the jump.",
        23,
        "#e8e4ff",
        { wrap: pw - 90 },
      ),
    );

    // ---- the reward, right in the pop-up
    const ry = top + 520;
    const card = this.add.graphics();
    drawNeonRect(card, -pw / 2 + 34, ry, pw - 68, 214, 18, 0xffd23f, { fillAlpha: 0.9, width: 2 });
    p.add(card);
    p.add(neonText(this, 0, ry + 30, "FOUNDING DRIFTER REWARD", 22, 0xffd23f, { blur: 8 }));
    const ix = -pw / 4 + 10;
    p.add(this.add.image(ix, ry + 96, "cosm", "icon_trail_founder").setScale(2.3));
    p.add(plainText(this, ix, ry + 150, "Exclusive trail", 17, "#bffcff"));
    const chip = this.add.graphics();
    drawNeonRect(chip, pw / 4 - 130, ry + 72, 240, 56, 28, 0xffd23f, { fillAlpha: 0.95, width: 2 });
    p.add(chip);
    p.add(plainText(this, pw / 4 - 10, ry + 100, "Founding Drifter", 21, "#ffd23f"));
    p.add(plainText(this, pw / 4 - 10, ry + 152, "Exclusive title", 17, "#bffcff"));
    p.add(plainText(this, 0, ry + 188, "Only during the move · yours forever", 16, "#9c90c8"));

    // ---- buttons
    let finished = false;
    const close = () => {
      if (this.moveFly) {
        this.moveFly.rig.destroy();
        this.moveFly = null;
      }
      this.closeModal();
    };
    const by = h / 2 - (signedIn ? 100 : 150);
    const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    drawNeonRect(glow, -246, by - 54, 492, 108, 30, 0x39ff88, { fillAlpha: 0.25, width: 6, glow: true });
    p.add(glow);
    return new Promise((resolve) => {
      const done = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };
      const claim = () => {
        Founding.grant();
        st.done = true;
        Save.write();
        Account.pushNow?.().catch(() => {});
        Analytics.log("move_reward", { signedIn: Account.signedIn });
        return this.celebrateMove().then(done);
      };
      const main = button(this, 0, by, 460, 92, signedIn ? "LET'S GO" : "CREATE ACCOUNT", {
        color: 0x39ff88,
        size: signedIn ? 36 : 30,
        fill: 0x0c2a1a,
        onClick: () => {
          if (finished || this.moveBusy) return;
          this.moveBusy = true;
          Haptics.light();
          fx.burst("confetti", W / 2, H / 2 + by, calm ? 12 : 30, 0xffffff);
          if (!calm) fx.burst("star", W / 2, H / 2 + by, 14, 0x39ff88);
          this.time.delayedCall(260, () => {
            close();
            this.moveBusy = false;
            if (signedIn) {
              claim();
              return;
            }
            openAccount({ view: "create" }).then(({ reload }) => {
              if (Account.signedIn) claim().then(() => reload && window.location.reload());
              else {
                // not finished (cancelled, or an email still to confirm): it comes back once
                if (Account.user?.newEmail)
                  toast(this, "CHECK YOUR EMAIL", 0xffd23f, {
                    y: this.H * 0.3,
                    sub: "Confirm it to lock in your progress and your reward",
                  });
                done();
              }
            });
          });
        },
      });
      p.add(main);
      if (!signedIn) {
        const later = button(this, 0, h / 2 - 58, 180, 50, "LATER", {
          color: 0x8a80b0,
          size: 16,
          onClick: () => {
            if (finished) return;
            Haptics.tap();
            close();
            done();
          },
        });
        p.add(later);
      }
      // the main button glows and breathes (gently, and slower, with Reduce Flashing)
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.25, to: calm ? 0.55 : 1 },
        yoyo: true,
        repeat: -1,
        duration: calm ? 1400 : 700,
        ease: "Sine.easeInOut",
      });
      if (!calm)
        this.tweens.add({
          targets: main,
          scale: 1.05,
          yoyo: true,
          repeat: -1,
          duration: 700,
          ease: "Sine.easeInOut",
        });

      // ---- the panel flies out of the rift, then lands with a burst
      this.tweens.add({
        targets: p,
        scale: 1,
        angle: 0,
        duration: 440,
        delay: 300,
        ease: "Back.easeOut",
        onComplete: () => {
          this.tweens.add({ targets: rift, alpha: 0, duration: 300 });
          Haptics.tap();
          const n = calm ? 0.4 : 1;
          fx.burst("confetti", W / 2 - pw / 2 + 60, H / 2 + top + 40, 26 * n, 0xffffff);
          fx.burst("confetti", W / 2 + pw / 2 - 60, H / 2 + top + 40, 26 * n, 0xffffff);
          if (!calm) fx.burst("star", W / 2, H / 2 + top + 150, 18, 0xffd23f);
          // the hero starts flying through the header portal
          const rig = new CharacterRig(this, this.def, fx, {
            x: W / 2,
            y: H / 2 + portalY,
            lowGfx: !!Save.data.settings.lowGfx,
            depth: 340,
            scale: 0.9,
            cosmetics: { ...Shop.loadout(), trail: "trail_founder" },
          });
          this.moveFly = { rig, t: 0, base: rig.displayScale, cx: W / 2, cy: H / 2 + portalY, portal, py: portalY, calm };
          // "glydrift.com" types in, letter by letter, with a neon flicker
          typeDomain(this, domain, "glydrift.com", calm, () => {
            Sfx.chime();
            this.tweens.add({
              targets: domain,
              scale: calm ? 1.02 : 1.06,
              yoyo: true,
              repeat: -1,
              duration: calm ? 1600 : 900,
              ease: "Sine.easeInOut",
            });
          });
        },
      });
    });
  }

  /** Every frame while the move pop-up is up: the header portal swirls, the hero loops through. */
  updateMoveFly(dt) {
    const m = this.moveFly;
    if (!m) return;
    m.t += dt;
    const T = m.t;
    drawPortal(m.portal, 0, m.py, T, m.calm);
    // a figure-eight through the portal: tiny at the portal, full size at the far ends
    const ph = (T / 3.2) % 1;
    const a = ph * Math.PI * 2;
    const rig = m.rig;
    const px = rig.x;
    const py = rig.y;
    rig.x = m.cx + Math.sin(a) * 240;
    rig.y = m.cy + Math.sin(a * 2) * 34;
    rig.displayScale = m.base * (0.3 + 0.7 * Math.abs(Math.sin(a)));
    rig.angle = Math.atan2(rig.y - py, rig.x - px) * 0.35;
    rig.facing = rig.x >= px ? 1 : -1;
    if (Math.floor((T - dt) / 0.55) !== Math.floor(T / 0.55)) rig.flap?.();
    rig.update(dt, 0);
  }

  /** "PROGRESS LOCKED IN!": the reward flies into the collection (tap or wait to close). */
  celebrateMove() {
    const W = this.W;
    const H = this.H;
    const calm = reduceFlashing();
    const fx = this.moveFx;
    Sfx.sting();
    Haptics.strong();
    return new Promise((resolve) => {
      const c = this.add.container(0, 0).setDepth(380);
      const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x020107, 0.9).setInteractive();
      c.add(dim);
      const head = neonText(this, W / 2, H * 0.27, "PROGRESS LOCKED IN!", 46, 0x39ff88, { blur: 18 });
      if (head.width > W - 60) head.setScale((W - 60) / head.width);
      c.add(head);
      c.add(plainText(this, W / 2, H * 0.27 + 64, "Welcome, Founding Drifter", 26, "#ffd23f"));
      const icon = this.add.image(W / 2 - 120, H * 0.46, "cosm", "icon_trail_founder").setScale(0.1);
      const chipG = this.add.graphics();
      drawNeonRect(chipG, -120, -32, 240, 64, 32, 0xffd23f, { fillAlpha: 0.95, width: 2 });
      const chip = this.add.container(W / 2 + 110, H * 0.46, [
        chipG,
        plainText(this, 0, 0, "Founding Drifter", 23, "#ffd23f"),
      ]).setScale(0.1);
      c.add([icon, chip]);
      const note = plainText(this, W / 2, H * 0.6, "Added to your collection", 22, "#bffcff").setAlpha(0);
      c.add(note);
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 200 });
      this.tweens.add({ targets: icon, scale: 4.2, duration: 420, delay: 150, ease: "Back.easeOut" });
      this.tweens.add({ targets: chip, scale: 1, duration: 420, delay: 250, ease: "Back.easeOut" });
      const n = calm ? 0.35 : 1;
      this.time.delayedCall(200, () => {
        fx.burst("confetti", W * 0.2, H * 0.2, 40 * n, 0xffffff);
        fx.burst("confetti", W * 0.8, H * 0.2, 40 * n, 0xffffff);
        if (!calm) fx.burst("star", W / 2, H * 0.46, 24, 0xffd23f);
      });
      // then both fly into the collection (the HEROES button)
      const tx = this.heroesBtn?.x ?? W / 2 - 220;
      const ty = this.heroesBtn?.y ?? H * 0.75;
      this.time.delayedCall(1500, () => {
        for (const o of [icon, chip])
          this.tweens.add({ targets: o, x: tx, y: ty, scale: 0.3, alpha: 0.2, duration: 520, ease: "Cubic.easeIn" });
        this.tweens.add({ targets: note, alpha: 1, duration: 300, delay: 300 });
        this.time.delayedCall(520, () => {
          Sfx.reward();
          Haptics.light();
          if (!calm) fx.burst("star", tx, ty, 14, 0xffd23f);
        });
      });
      let closed = false;
      const end = () => {
        if (closed) return;
        closed = true;
        this.tweens.add({
          targets: c,
          alpha: 0,
          duration: 220,
          onComplete: () => {
            killTweensDeep(this, c);
            c.destroy();
            resolve();
          },
        });
      };
      dim.once("pointerup", () => this.time.now - startedAt > 900 && end());
      const startedAt = this.time.now;
      this.time.delayedCall(3200, end);
    });
  }

  /** Nothing is on screen that another pop-up would land on top of. */
  popupFree() {
    if (this.modal || this.naming || this.claiming) return false;
    // the account / name screens are page overlays, opened from elsewhere too
    return !document.querySelector("#account-modal.open, #name-modal.open");
  }

  /** First open of a season: the NEW HERO reveal for its featured character. */
  async newHeroReveal() {
    const s = this.season;
    const def = getCharacter(s.featuredHero);
    Seasons.markHeroSeen();
    this.revealing = true;
    await revealHero(this, def, { title: `NEW HERO · SEASON ${s.number}` });
    this.revealing = false;
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
    // (the Daily Challenge countdown is gone: the LEVELS button shows stars instead)
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
        killTweensDeep(this, c);
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
    // the chest, the coins and any unlock reveal play out before the next pop-up may show
    this.claiming = true;
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
    // a streak hero unlocked by this login (Bao), or a hero completed by its shard
    const unlocked = [
      ...(res.unlocks || []),
      ...(res.shardResult?.unlocked ? [getCharacter(res.shardResult.id)] : []),
    ];
    this.time.delayedCall(1600, async () => {
      for (const def of unlocked) await revealHero(this, def, { title: "UNLOCKED!" });
      this.claiming = false;
    });
    if (res.shardResult?.id) {
      const def = getCharacter(res.shardResult.id);
      if (!res.shardResult.unlocked) {
        toast(this, `${def.name} SHARD`, def.color, {
          y: this.H * 0.3,
          sub: `${res.shardResult.count}/${res.shardResult.need} shards`,
        });
      }
    }
  }

  openSettings() {
    if (this.modal || this.leaving) return;
    const W = this.W;
    const H = this.H;
    const st = Save.data.settings;
    // Drift Pass+ extras you own get their own row: the gold leaderboard name and the home theme
    const hasGold = Shop.owns("name_pp_gold");
    const hasTheme = Shop.owns("theme_pp_abyss");
    const plusRow = hasGold || hasTheme;
    // + the privacy policy / support row (App Review needs the policy reachable in the app)
    // + CREDITS (the creator and copyright: never remove; tests/e2e/credit.spec.js)
    const h = (Install.available ? 910 : 820) + (plusRow ? 90 : 0) + 76 + 92;
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
    const half = (W - 200) / 2;
    const style = button(this, W / 2 - half / 2 - 10, y0 + 430, half, 72, flashLabel(), {
      color: 0xb45cff,
      size: 15,
      onClick: () => {
        st.reduceFlash = !reduceFlashing();
        Save.write();
        style.setLabel(flashLabel());
      },
    });
    // haptics: FULL (every flap too) → LIGHT (softer, no flap tick) → OFF
    const hapLabel = () => `HAPTICS: ${hapticsLevel().toUpperCase()}`;
    const hap = button(this, W / 2 + half / 2 + 10, y0 + 430, half, 72, hapLabel(), {
      color: 0x3ef4ff,
      size: 15,
      onClick: () => {
        const next = { full: "light", light: "off", off: "full" }[hapticsLevel()];
        st.haptics = next;
        Save.write();
        hap.setLabel(hapLabel());
        if (next !== "off") Haptics.strong();
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
    // accounts: save progress to the cloud / restore it on another device
    const acctLabel = () =>
      Account.signedIn ? `ACCOUNT: ${shorten(Account.user.email, 22)}` : "ACCOUNT · SAVE YOUR PROGRESS";
    const acct = button(this, W / 2, y0 + 615, W - 180, 72, acctLabel(), {
      color: Account.signedIn ? 0x39ff88 : 0xffd23f,
      size: 16,
      onClick: () => {
        if (!Account.available) {
          toast(this, "OFFLINE", 0xff4f7a, { y: this.H * 0.3, sub: "Accounts need a connection" });
          return;
        }
        openAccount().then(({ reload }) => {
          if (reload) window.location.reload();
          else if (acct.scene) acct.setLabel(acctLabel());
        });
      },
    });
    c.add([mute, gfx, style, hap, nameBtn, acct, done]);
    if (plusRow) {
      const py = y0 + (Install.available ? 795 : 705);
      const both = hasGold && hasTheme;
      const bw = both ? (W - 200) / 2 : W - 180;
      if (hasGold) {
        const goldOn = () => Shop.equipped("name") === "name_pp_gold";
        const lbl = () => `GOLD NAME: ${goldOn() ? "ON" : "OFF"}`;
        const gb = button(this, both ? W / 2 - bw / 2 - 10 : W / 2, py, bw, 72, lbl(), {
          color: 0xffd23f,
          size: 17,
          onClick: () => {
            if (goldOn()) Shop.unequip("name");
            else Shop.equip("name_pp_gold");
            gb.setLabel(lbl());
            this.refreshNamePlate();
          },
        });
        c.add(gb);
      }
      if (hasTheme) {
        const lbl = () => `HOME: ${Shop.equipped("theme") ? "ABYSS" : "SEASON"}`;
        const tb = button(this, both ? W / 2 + bw / 2 + 10 : W / 2, py, bw, 72, lbl(), {
          color: 0xc8102e,
          size: 17,
          onClick: () => {
            if (Shop.equipped("theme")) Shop.unequip("theme");
            else Shop.equip("theme_pp_abyss");
            tb.setLabel(lbl());
            this.applyHomeTheme();
          },
        });
        c.add(tb);
      }
    }
    // privacy policy and support: pages on glydrift.com (the app opens them in Safari)
    const linksY = y0 + 705 + (Install.available ? 90 : 0) + (plusRow ? 90 : 0);
    const lw = (W - 200) / 2;
    c.add([
      button(this, W / 2 - lw / 2 - 10, linksY, lw, 56, "PRIVACY POLICY", {
        color: 0xbfb6e8,
        size: 15,
        onClick: () => openSite("privacy"),
      }),
      button(this, W / 2 + lw / 2 + 10, linksY, lw, 56, "SUPPORT", {
        color: 0xbfb6e8,
        size: 15,
        onClick: () => openSite("support"),
      }),
    ]);
    // CREDITS: the creator and the copyright (NEVER remove or hide: tests/e2e/credit.spec.js)
    const cy = linksY + 76;
    const credits = this.add.container(0, 0).setName("creditsSection");
    const cg = this.add.graphics();
    cg.lineStyle(1, 0xbfb6e8, 0.35).lineBetween(W / 2 - 150, cy - 40, W / 2 + 150, cy - 40);
    credits.add([
      cg,
      plainText(this, W / 2, cy - 22, "Glydrift", 17, "#e8fdff"),
      plainText(this, W / 2, cy, CREATOR_ROLE, 15, "#d8d0ff"),
      plainText(this, W / 2, cy + 22, COPYRIGHT, 14, "#a89ed8"),
    ]);
    c.add(credits);
    // (on the shortest screens with every optional row showing, shrink the panel to fit)
    if (h > H - 24) {
      const k = (H - 24) / h;
      c.setScale(k).setPosition((W / 2) * (1 - k), (H / 2) * (1 - k));
      c.list[0].setScale(1 / k); // the dimmed backdrop still covers the whole screen
    }
    if (Install.available) {
      c.add(
        button(this, W / 2, y0 + 705, W - 180, 72, "ADD TO HOME SCREEN", {
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
    this.updateAbyss(dt);
    // slowly cycle every biome palette; menus keep the backdrop dim and scenery hidden
    blendPalette(biomeStateAt((this.t * 18) % (500 * CLASSIC)), this.pal);
    // showcase every pixel biome on the title screen (slow crossfade every ~9 s)
    // only the first world and the furthest one you've reached (each world's art costs ~5 MB,
    // so the menu never builds them all)
    if (!this.showIds) {
      // (stats.maxBiome is a BIOMES index on the original ladder: Void … Hurricane = 0 … 6)
      const far = Math.min(biomeIndex("hurricane"), Save.data.stats.maxBiome || 0);
      // (Sakura Skies, the second realm, isn't on that ladder: when it's the furthest a player
      // has flown, it is the one the title screen shows)
      const sakura = far === 0 && Save.data.realms?.sakura;
      this.showIds = far > 0 ? [BIOMES[0].id, BIOMES[far].id] : sakura ? [BIOMES[0].id, "sakura"] : [BIOMES[0].id];
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
    // centred: a gentle sway and bob inside its slot (never into the buttons or the text)
    const x = W / 2 + Math.sin(this.t * 0.9) * 26;
    const y = this.heroY + Math.sin(this.t * 1.8) * this.heroAmp;
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
