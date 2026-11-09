// DRIFT PASS+ hero perks: each pass hero has one small reward-only perk (a few % more coins,
// XP or Drift Pass XP, or a once-a-day coin bonus; data/heroPerks.js). They change what a run
// PAYS, never what it SCORES: the same seeded run gives the same score and distance (what the
// leaderboard gets) with or without the perk, only the coins / XP differ.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, SAVE, settle, waitFor } from "./helpers.js";

const TODAY = "2026-11-04"; // helpers.js NOW
const ALLOWED = ["coinPct", "xpPct", "passPct", "dailyCoins", "list"];
// LeaderboardScene's gold perk badge (hasCoinPerks) and the gameplay perks GameScene reads
const BADGE_OR_GAMEPLAY = ["coinBonus", "fireWard", "glitchProof", "comboMax", "coinMul", "jump"];

/** A plain run handed straight to Progression.commitRun (no gameplay), as `char`. */
const RUN = {
  mode: "normal",
  score: 1500,
  distance: 1100,
  coins: 100,
  nearMiss: 4,
  lasers: 1,
  saws: 1,
  portals: 0,
  biome: 1,
  bestCombo: 3,
  runTimeMs: 60000,
};

test("DRIFT PASS+ heroes: every one has a small reward-only perk, shown on its card @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  const heroes = await page.evaluate(() =>
    window.__heroDefs
      .filter((d) => d.passPlus)
      .map((d) => ({
        id: d.id,
        perks: d.perks ?? null,
        speed: d.speed ?? 1,
        coinMul: d.coinMul ?? 1,
        radius: d.radius ?? null,
        gravity: d.gravity ?? null,
      })),
  );
  expect(heroes.length).toBe(14);
  const kinds = new Set();
  for (const h of heroes) {
    expect(h.perks, h.id).not.toBe(null);
    // only reward keys: nothing the game reads during a run, nothing that earns the gold badge
    for (const k of Object.keys(h.perks)) expect(ALLOWED, `${h.id}.${k}`).toContain(k);
    for (const k of BADGE_OR_GAMEPLAY) expect(h.perks[k], `${h.id}.${k}`).toBeUndefined();
    expect(h.perks.list.length).toBeGreaterThan(0);
    for (const k of ["coinPct", "xpPct", "passPct"]) {
      if (h.perks[k] == null) continue;
      kinds.add(k);
      expect(h.perks[k]).toBeGreaterThanOrEqual(5);
      expect(h.perks[k]).toBeLessThanOrEqual(10);
    }
    if (h.perks.dailyCoins) {
      kinds.add("dailyCoins");
      expect(h.perks.dailyCoins).toBeLessThanOrEqual(100);
    }
    // standard flight: same speed, hitbox and gravity as everyone, no coin multiplier
    expect(h).toMatchObject({ speed: 1, coinMul: 1, radius: null, gravity: null });
  }
  expect([...kinds].sort()).toEqual(["coinPct", "dailyCoins", "passPct", "xpPct"]); // a mix

  // the hero card shows the perk lines in its PERKS section
  await page.evaluate(() => {
    const s = window.__glySave.data;
    s.unlocked.krakkie = true;
    s.unlocked.voidcat = true;
    s.selected = "krakkie";
    window.__glydrift.scene.getScene("Menu").scene.start("Characters");
  });
  await settle(page, "Characters", 1200);
  const shown = await page.evaluate(() => {
    const sc = window.__glydrift.scene.getScene("Characters");
    const texts = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.list) walk(o.list);
        if (o.type === "Text" && o.visible) texts.push(o.text);
      }
    };
    walk(sc.children.list);
    return texts;
  });
  expect(shown).toContain("PERKS");
  expect(shown).toContain("◆ +10% COINS (TENTACLES GRAB MORE)");
  expect(log.errors).toEqual([]);
});

test("DRIFT PASS+ perks pay only when that hero flies; daily bonus once per day, any hero @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: { ...SAVE, perkDaily: "2026-11-03" } });
  const out = await page.evaluate(
    ({ RUN }) => {
      const { Progression } = window.__glyHeroes;
      const Save = window.__glySave;
      const snap = JSON.stringify(Save.data);
      // one run as `char` from the same starting save: what it paid
      const once = (char, prep) => {
        const s = Save.data;
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(snap));
        s.missions = []; // no mission rewards muddying the coin count
        s.xpBoost = { mul: 1, runs: 0 };
        prep?.(s);
        const before = { coins: s.coins, passXp: s.pass.xp };
        const run = { ...RUN, char };
        const res = Progression.commitRun(run);
        return {
          coins: s.coins - before.coins,
          xp: res.xpGained,
          pass: s.pass.xp - before.passXp,
          score: run.score,
          distance: run.distance,
          heroPerk: run.heroPerk ?? null,
          perkDaily: s.perkDaily,
          statsCoins: s.stats.coins,
        };
      };
      const base = once("volt");
      return {
        base,
        krakkie: once("krakkie"), // +10% coins
        hexowl: once("hexowl"), // +10% XP
        phantomray: once("phantomray"), // +10% Drift Pass XP
        voidcat: once("voidcat"), // daily +50 (yesterday's claimed: due today)
        voidcatAgain: once("voidcat", (s) => (s.perkDaily = "2026-11-04")), // already paid today
        mothAfterCat: once("wraithmoth", (s) => (s.perkDaily = "2026-11-04")), // switching heroes
        clockBack: once("voidcat", (s) => (s.perkDaily = "2026-11-05")), // clock wound back
        umbradrake: once("umbradrake"), // daily +100 and +5%
        ronin: once("ronin"), // (RONIN's own +13 is paid by GameScene, not here)
      };
    },
    { RUN },
  );
  const { base } = out;
  // the standard hero gets no perk at all
  expect(base.heroPerk).toBe(null);
  expect(base.perkDaily).toBe("2026-11-03");
  expect(out.ronin.heroPerk).toBe(null);
  expect(out.ronin.coins).toBe(base.coins);
  for (const k of Object.keys(out)) {
    // a perk never touches the run's score or distance (or the "collected" coin stats)
    expect(out[k].score, k).toBe(RUN.score);
    expect(out[k].distance, k).toBe(RUN.distance);
    expect(out[k].statsCoins, k).toBe(base.statsCoins);
  }
  // KRAKKIE: +10% of the 100 coins collected; same XP and pass XP
  expect(out.krakkie.coins).toBe(base.coins + 10);
  expect(out.krakkie.xp).toBe(base.xp);
  expect(out.krakkie.pass).toBe(base.pass);
  // HEXOWL: +10% level XP only
  expect(out.hexowl.coins).toBe(base.coins);
  expect(out.hexowl.xp).toBe(base.xp + Math.floor(base.xp * 0.1));
  expect(out.hexowl.pass).toBe(base.pass);
  // PHANTOM RAY: +10% Drift Pass XP only
  expect(out.phantomray.coins).toBe(base.coins);
  expect(out.phantomray.xp).toBe(base.xp);
  expect(out.phantomray.pass).toBe(base.pass + Math.floor(base.pass * 0.1));
  // VOIDCAT: +50 on the day's first run, then nothing more that day, with any daily hero
  expect(out.voidcat.coins).toBe(base.coins + 50);
  expect(out.voidcat.perkDaily).toBe(TODAY);
  expect(out.voidcat.heroPerk).toMatchObject({ coins: 50, daily: 50, pctCoins: 0 });
  expect(out.voidcatAgain.coins).toBe(base.coins);
  expect(out.mothAfterCat.coins).toBe(base.coins);
  expect(out.clockBack.coins).toBe(base.coins);
  expect(out.clockBack.perkDaily).toBe("2026-11-05");
  // UMBRADRAKE: the daily hoard and +5%
  expect(out.umbradrake.coins).toBe(base.coins + 100 + 5);
  expect(log.errors).toEqual([]);
});

/** One seeded endless run as `id` (with or without its perk): what it scored and paid. */
async function seededRun(page, id, withPerk) {
  const log = await openGame(page, {
    flags: ["god", `character=${id}`],
    save: { ...SAVE, unlocked: { volt: true, [id]: true }, selected: id, missions: [], perkDaily: "" },
  });
  await page.evaluate(
    ({ id, withPerk }) => {
      // "without the perk": the very same hero with its perks block taken away
      if (!withPerk) delete window.__heroDefs.find((d) => d.id === id).perks;
      window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" });
    },
    { id, withPerk },
  );
  await settle(page, "Game", 800);
  const coinsAtStart = await page.evaluate(() => window.__glySave.data.coins);
  // the whole run in one go, from one seed: a fresh course, then a fixed flight path, every
  // frame the same, so both runs see exactly the same world (nothing else can draw a random
  // number in between)
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    window.__glyReseed(424242);
    s.resetRun(false);
    s.startRun();
    for (let i = 0; i < 2400; i++) {
      if (s.state === "playing") {
        // a slow sweep up and down the screen, picking up whatever coins lie on it
        s.player.y = s.H * (0.45 + 0.25 * Math.sin(i / 50));
        s.player.vy = 0;
      }
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    window.__glyGod(false);
    s.die();
    for (let i = 0; i < 400 && s.state !== "dead"; i++) {
      s.__t += 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
  });
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"));
  const r = await page.evaluate((c0) => {
    const run = window.__glydrift.scene.getScene("Game").run;
    const q = window.__glySave.data.lbQueue;
    return {
      score: run.score,
      distance: run.distance,
      coins: run.coins,
      paid: window.__glySave.data.coins - c0,
      heroPerk: run.heroPerk ?? null,
      // the GAME OVER coin line's gold pop
      pops: window.__glydrift.scene
        .getScene("GameOver")
        .children.list.filter((o) => o.type === "Text" && / PERK/.test(o.text))
        .map((o) => o.text),
      board: q.map((e) => ({ level: e.level, score: e.score, distance: e.distance, character: e.character })),
    };
  }, coinsAtStart);
  expect(log.errors).toEqual([]);
  return r;
}

test("DRIFT PASS+ perks: the same seeded run scores the same with or without the perk @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  // UMBRADRAKE: +5% coins and the daily +100 (a fresh save: the day's first run)
  const off = await seededRun(page, "umbradrake", false);
  // a fresh start for the second run (the same saved game, the device ledger forgotten)
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  const on = await seededRun(page, "umbradrake", true);
  expect(off.distance).toBeGreaterThan(300);
  expect(off.coins).toBeGreaterThan(20);
  // score, distance and what goes to the leaderboard: identical
  expect(on.score).toBe(off.score);
  expect(on.distance).toBe(off.distance);
  expect(on.coins).toBe(off.coins);
  expect(on.board).toEqual(off.board);
  expect(on.board.length).toBeGreaterThan(0);
  // what the run paid: the perk on top
  expect(off.heroPerk).toBe(null);
  const extra = Math.floor(off.coins * 0.05) + 100;
  expect(on.heroPerk).toMatchObject({ coins: extra, daily: 100 });
  expect(on.paid).toBe(off.paid + extra);
  expect(off.pops).toEqual([]);
  expect(on.pops).toEqual([`+${extra} UMBRA DRAKE PERK · DAILY`]);
});
