// Overnight check C (saves and money): regression tests for the bugs fixed that night.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, SAVE } from "./helpers.js";

const phoneOnly = (testInfo) =>
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

const restartHome = (page) =>
  page.evaluate(() => {
    const g = window.__glydrift;
    for (const s of g.scene.getScenes(true))
      if (s.sys.settings.key !== "Backdrop") g.scene.stop(s.sys.settings.key);
    g.scene.start("Menu");
  });

test("Drift Pass+: a purchase restored after the season recap still pays its earned paid tiers (once) @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  // Season 1 is over; this device's save (e.g. just signed in on a new phone) doesn't know about
  // the Drift Pass+ purchase yet: the store restores it from the server after the recap ran
  const log = await openGame(page, {
    flags: ["seasonNow=2026-12-05"],
    save: { ...SAVE, seasons: { s1: { xp: 400 * 40, claimed: {}, started: true, heroSeen: true } } },
  });
  const before = await page.evaluate(() => {
    const r = window.__glySave.data.seasons.s1;
    return { recap: r.recapShown, paid: Object.keys(r.plusClaimed || {}).length };
  });
  expect(before).toEqual({ recap: true, paid: 0 }); // the recap ran without the paid track
  await page.evaluate(() => window.__glyPassPlus.grant("s1", { transactionId: "restored" }));
  await restartHome(page); // the next visit home
  await run(page, 1500);
  const after = await page.evaluate(() => {
    const d = window.__glySave.data;
    return { paid: Object.keys(d.seasons.s1.plusClaimed || {}).length, coins: d.coins, riftling: !!d.unlocked.riftling };
  });
  expect(after.paid).toBeGreaterThan(10); // every earned paid tier
  expect(after.riftling).toBe(true); // (tier 1's pass hero)
  // and never twice
  await restartHome(page);
  await run(page, 1500);
  const again = await page.evaluate(() => {
    const d = window.__glySave.data;
    return { paid: Object.keys(d.seasons.s1.plusClaimed || {}).length, coins: d.coins };
  });
  expect(again).toEqual({ paid: after.paid, coins: after.coins });
  expect(log.errors).toEqual([]);
});

test("cloud merge: Drift Pass+ claims from a save on the old Season 1 layout move to the new tiers @smoke", async ({
  page,
}, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { flags: ["mockcloud"] });
  const r = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const { plusTrackS1, plusTrackS1v1, layout } = window.__glyPlusS1;
    const v1 = plusTrackS1v1({ banner: "crimson" });
    const v2 = plusTrackS1({ banner: "crimson" });
    const oldI = v1.findIndex((t) => t.hero === "voidcat");
    const newI = v2.findIndex((t) => t.hero === "voidcat");
    // this device already moved its claim to the new layout; the cloud copy was uploaded before
    const local = { level: 5, seasons: { s1: { xp: 4000, claimed: {}, plusClaimed: { [newI]: true }, plusLayout: layout } } };
    const cloud = { level: 5, seasons: { s1: { xp: 4000, claimed: {}, plusClaimed: { [oldI]: true } } } };
    const a = mergeSaves(local, cloud).seasons.s1;
    const b = mergeSaves(cloud, local).seasons.s1;
    return { oldI, newI, layout, a: [a.plusClaimed, a.plusLayout], b: [b.plusClaimed, b.plusLayout] };
  });
  expect(r.oldI).not.toBe(r.newI);
  expect(r.a).toEqual([{ [r.newI]: true }, r.layout]); // not also the old tier number
  expect(r.b).toEqual([{ [r.newI]: true }, r.layout]);
  expect(log.errors).toEqual([]);
});
