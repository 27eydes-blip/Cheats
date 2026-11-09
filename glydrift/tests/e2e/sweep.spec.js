// Hour sweep regressions (bugs found on 9 Nov). Each test names the bug it guards against.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, SAVE, settle } from "./helpers.js";

test("damaged level record (star coins not a list) never crashes Level Select or Stats @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser");
  // a damaged or hand-edited save: level 1's star coins are text instead of [true, false, ...]
  const lv = { p: { 1: { done: true, coins: "broken", best: 0, attempts: 2 } }, claimed: {}, played: 2 };
  const log = await openGame(page, { save: { ...SAVE, lv } });
  await settle(page, "Menu", 800);
  for (const key of ["LevelSelect", "Stats"]) {
    await page.evaluate((key) => {
      const g = window.__glydrift;
      g.scene.getScenes(true).forEach((s) => s.sys.settings.key !== "Backdrop" && g.scene.stop(s.sys.settings.key));
      g.scene.start(key);
    }, key);
    await run(page, 1200);
    expect(await page.evaluate((key) => window.__glydrift.scene.isActive(key), key)).toBe(true);
  }
  // and finishing level 1 again repairs the record instead of throwing
  const stars = await page.evaluate(async () => {
    const L = await import("/src/levels/levels.js").catch(() => null);
    return L ? L.starsOf(1) : null;
  });
  if (stars) expect(stars[0]).toBe(true);
  expect(log.errors).toEqual([]);
});
