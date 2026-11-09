// STATS page: lifetime totals recorded at the end of every run (time flown, runs per hero,
// crashes per realm), an old save without those counters, and the cloud-save merge.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle } from "./helpers.js";

const step = (page, n) =>
  page.evaluate((n) => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < n; i++) {
      if (s.state === "playing") {
        s.player.y = s.H * 0.45;
        s.player.vy = 0;
      }
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
  }, n);

/** One short endless run: fly ~5 s in god mode, then crash on purpose. */
async function shortRun(page, first) {
  if (first)
    await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  else await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await run(page, 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 100);
  await step(page, 300);
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    window.__glyGod(false);
    s.die();
    for (let i = 0; i < 400 && !window.__glydrift.scene.isActive("GameOver"); i++) {
      s.__t += 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    window.__glyGod(true);
  });
  await settle(page, "GameOver", 300);
}

/** The values the Stats page drew: tile label → shown text, realm id → deaths shown. */
const shown = (page) =>
  page.evaluate(() => {
    const sc = window.__glydrift.scene.getScene("Stats");
    const out = { tiles: {}, deaths: {} };
    for (const o of sc.list.list) {
      if (o.name?.startsWith("tile:")) out.tiles[o.name.slice(5)] = o.statValue;
      if (o.name?.startsWith("deaths:")) out.deaths[o.name.slice(7)] = o.text;
    }
    out.text = sc.list.list
      .flatMap((o) => (o.list ? o.list : [o]))
      .map((o) => o.text)
      .filter(Boolean)
      .join(" | ");
    return out;
  });

test("Stats: two short runs show the right totals @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  // a save from before the Stats page: none of its new counters exist yet
  const log = await openGame(page, { flags: ["god"], save: { ...SAVE, best: 0 } });
  await shortRun(page, true);
  await shortRun(page, false);
  const st = await page.evaluate(() => window.__glySave.data.stats);
  expect(st.runs).toBe(2);
  expect(st.timedRuns).toBe(2);
  expect(st.heroRuns).toEqual({ volt: 2 });
  expect(st.playMs).toBeGreaterThan(8000); // ~5 s each
  expect(st.playMs).toBeLessThan(20000);
  const realmTotal = Object.values(st.realmDeaths).reduce((a, b) => a + b, 0);
  expect(realmTotal).toBe(2);

  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").goto("Stats"));
  await settle(page, "Stats", 900);
  const v = await shown(page);
  const sum = await page.evaluate(() => window.__glyStats.statsSummary());
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  expect(v.tiles["TOTAL RUNS"]).toBe("2");
  const secs = Math.floor(st.playMs / 1000);
  expect(v.tiles["TIME PLAYED"]).toBe(`0:${String(secs).padStart(2, "0")}`);
  expect(v.tiles["BEST DISTANCE"]).toBe(`${fmt(st.maxDistance)} m`);
  expect(v.tiles["AVERAGE DISTANCE"]).toBe(`${fmt(st.totalDistance / 2)} m`);
  expect(v.tiles["NEAR-MISSES"]).toBe(fmt(st.nearMisses));
  expect(v.tiles["COINS COLLECTED"]).toBe(fmt(st.coins));
  expect(sum.fav).toMatchObject({ id: "volt", runs: 2 });
  expect(v.text).toContain("VOLT");
  expect(v.text).toContain("2 runs");
  for (const [realm, d] of Object.entries(st.realmDeaths)) expect(v.deaths[realm]).toBe(String(d));
  expect(v.text).not.toMatch(/NaN|undefined|Infinity/);
  // BACK returns home
  await page.evaluate(() => window.__glydrift.scene.getScene("Stats").scene.start("Menu"));
  await settle(page, "Menu", 300);
  expect(log.errors).toEqual([]);
});

test("Stats: an old save without the new counters shows zeros, not NaN @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  // a very old save: some stats are there, the new ones are missing, one is damaged
  const old = { ...SAVE, best: 0, stats: { runs: 0, totalDistance: 0, heroRuns: "junk" } };
  const log = await openGame(page, { save: old });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Stats"));
  await settle(page, "Stats", 900);
  const st = await page.evaluate(() => window.__glySave.data.stats);
  expect(st).toMatchObject({ playMs: 0, timedRuns: 0, heroRuns: {}, realmDeaths: {} });
  const v = await shown(page);
  expect(v.tiles["TOTAL RUNS"]).toBe("0");
  expect(v.tiles["TIME PLAYED"]).toBe("0:00");
  expect(v.tiles["AVERAGE RUN"]).toBe("0:00");
  expect(v.tiles["AVERAGE DISTANCE"]).toBe("0 m");
  expect(v.tiles["HIGHEST COMBO"]).toBe("x0");
  expect(Object.values(v.deaths).every((d) => d === "0")).toBe(true);
  expect(v.text).toContain("Fly a few runs to find out");
  expect(v.text).not.toMatch(/NaN|undefined|Infinity/);
  // a long-time player: 500 runs flown before play time was counted shows "—" (counting from
  // now), never "0:00 played" next to 500 runs
  const vet = await page.evaluate(() => {
    const { statsSummary } = window.__glyStats;
    const d = window.__glySave.data;
    return statsSummary({ ...d, stats: { ...d.stats, runs: 500, playMs: 0, timedRuns: 0 } }).untimed;
  });
  expect(vet).toBe(true);
  // and the time formats
  const f = await page.evaluate(() => {
    const { fmtSpan, fmtNum } = window.__glyStats;
    return [fmtSpan(83000), fmtSpan(3600000 * 3 + 12 * 60000 + 5000), fmtNum(1234567), fmtSpan(NaN)];
  });
  expect(f).toEqual(["1:23", "3h 12m", "1,234,567", "0:00"]);
  expect(log.errors).toEqual([]);
});

test("Stats: the cloud merge keeps the larger counters @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  await openGame(page);
  const m = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const base = JSON.parse(JSON.stringify(window.__glySave.data));
    const local = {
      ...base,
      stats: { ...base.stats, runs: 40, playMs: 90000, timedRuns: 30, heroRuns: { volt: 30, ember: 2 }, realmDeaths: { void: 20, solar: 1 } },
    };
    const cloud = {
      ...base,
      stats: { ...base.stats, runs: 10, playMs: 500000, timedRuns: 8, heroRuns: { volt: 4, ember: 9, ronin: 3 }, realmDeaths: { void: 2, abyss: 5 } },
    };
    // either way round, the same counters win
    return [mergeSaves(local, cloud).stats, mergeSaves(cloud, local).stats];
  });
  for (const st of m)
    expect(st).toMatchObject({
      runs: 40,
      playMs: 500000,
      timedRuns: 30,
      heroRuns: { volt: 30, ember: 9, ronin: 3 },
      realmDeaths: { void: 20, solar: 1, abyss: 5 },
    });
});

test("Stats: a damaged save (negative counters, text in the per-hero map) loads clean and keeps counting @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const bad = {
    ...SAVE,
    stats: {
      runs: -7,
      totalDistance: -100,
      nearMisses: 3,
      heroRuns: { volt: "5", ember: "junk", frost: -2, ronin: null },
      realmDeaths: { void: "4", solar: {} },
    },
  };
  const log = await openGame(page, { save: bad });
  const st = await page.evaluate(() => window.__glySave.data.stats);
  expect(st.runs).toBe(0);
  expect(st.totalDistance).toBe(0);
  expect(st.nearMisses).toBe(3);
  expect(st.heroRuns).toEqual({ volt: 5 });
  expect(st.realmDeaths).toEqual({ void: 4 });
  // the next run adds 1 (as a number: "5" + 1 used to make "51")
  const after = await page.evaluate(() => {
    window.__glyHeroes.Progression.commitRun({
      mode: "normal",
      char: "volt",
      killedIn: "void",
      score: 10,
      distance: 50,
      coins: 0,
      nearMiss: 0,
      lasers: 0,
      saws: 0,
      portals: 0,
      biome: 0,
      runTimeMs: 4000,
      bestCombo: 1,
    });
    return window.__glySave.data.stats;
  });
  expect(after.heroRuns.volt).toBe(6);
  expect(after.realmDeaths.void).toBe(5);
  expect(after.runs).toBe(1);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Stats"));
  await settle(page, "Stats", 900);
  const v = await shown(page);
  expect(v.tiles["TOTAL RUNS"]).toBe("1");
  expect(v.text).toContain("6 runs");
  expect(v.deaths.void).toBe("5");
  expect(v.text).not.toMatch(/NaN|undefined|Infinity|-\d/);
  expect(log.errors).toEqual([]);
});
