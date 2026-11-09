// Before the first tap of a run: hazards must hold still (collisions only start with the run,
// so anything moving would slide straight through the hovering bird), the first hazard must
// never reach the bird however long you wait, and from the first tap collisions work normally.
// (Regression: before this fix the world scrolled at half speed while waiting, hazards kept
// spawning and passed through the bird, and a late first tap started right on top of one.)
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, settle } from "./helpers.js";

const step = (page, n) =>
  page.evaluate((n) => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < n; i++) {
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
  }, n);

/** The hazards right now: how close the nearest one is to the bird (px), and how many. */
const hazards = (page) =>
  page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const p = s.player;
    const hz = s.obstacles.active.filter((o) => o.active && o.kind !== "portal" && o.kind !== "zone" && o.kind !== "field");
    const ahead = hz.map((o) => o.left - (p.x + p.radius));
    return {
      state: s.state,
      n: hz.length,
      nearest: ahead.length ? Math.min(...ahead) : null,
      xs: hz.map((o) => Math.round(o.x)),
      overlapping: hz.filter((o) => o.clearance(p.x, p.y, p.radius) < 0).length,
    };
  });

for (const mode of ["normal", "daily"])
  test(`pre-flight (${mode}): hazards hold still before the first tap, never reach the bird, and collide from the first tap @smoke`, async ({ page }, testInfo) => {
    test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
    test.setTimeout(180_000);
    const log = await openGame(page);
    await page.evaluate((mode) => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode }), mode);
    await settle(page, "Game", 800);
    await reseed(page);
    const before = await hazards(page);
    expect(before.state).toBe("ready");
    // wait 30 s without tapping
    let closest = Infinity;
    for (let k = 0; k < 30; k++) {
      await step(page, 60);
      const h = await hazards(page);
      expect(h.state).toBe("ready");
      expect(h.overlapping).toBe(0); // nothing ever passes through the bird
      if (h.nearest !== null) closest = Math.min(closest, h.nearest);
      expect(h.xs).toEqual(before.xs); // the hazards don't move (or multiply) while waiting
    }
    // the first hazard is still well away (off to the right of the screen)
    const W = await page.evaluate(() => window.__glydrift.scene.getScene("Game").W);
    const bx = await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.x);
    if (closest !== Infinity) expect(closest).toBeGreaterThan(W - bx - 40);
    // first tap: the run starts and collisions are on straight away
    await press(page, await fieldPoint(page));
    await step(page, 1);
    expect((await hazards(page)).state).toBe("playing");
    const died = await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      const p = s.player;
      // put a hazard right on the bird
      const o = s.obstacles.active.find((o) => o.active && o.kind !== "portal" && o.kind !== "zone" && o.kind !== "field");
      if (!o) return "no hazard";
      const dx = p.x - o.x;
      o.x += dx;
      for (let y = 0; y <= s.H; y += 4) if (o.clearance(p.x, y, p.radius) < 0) { p.y = y; break; }
      p.vy = 0;
      s.__t += 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
      return s.state;
    });
    expect(["dying", "dead"]).toContain(died);
    expect(log.errors).toEqual([]);
  });

test("pre-flight: the first hazard is exactly as far away at the first tap whether you wait 0 s or 20 s @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  const log = await openGame(page);
  const gap = async (waitFrames) => {
    await page.evaluate(() => {
      const g = window.__glydrift;
      for (const k of ["GameOver", "Hud", "Game"]) g.scene.stop(k);
      g.scene.start("Game", { mode: "daily" }); // (the daily run: the same course every time)
    });
    await settle(page, "Game", 800);
    await step(page, waitFrames);
    return page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      s.onTap();
      const p = s.player;
      const xs = s.obstacles.active.filter((o) => o.active).map((o) => o.left - p.x);
      return xs.length ? Math.round(Math.min(...xs)) : null;
    });
  };
  const now = await gap(1);
  const later = await gap(1200);
  expect(later).toBe(now);
  expect(log.errors).toEqual([]);
});
