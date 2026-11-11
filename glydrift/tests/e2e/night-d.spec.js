// Overnight checker D (Nov 11): regression tests for screens on every device size.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, run, settle, waitFor } from "./helpers.js";

test("game over: a long results list never pushes the buttons off a short screen @smoke", async ({ page }, testInfo) => {
  test.skip(!["iphone-small", "iphone-std"].includes(profileOf(testInfo)), "short and notched iPhones");
  test.setTimeout(180_000);
  const log = await openGame(page);
  // a notch + home indicator on the standard iPhone (Playwright reports no insets itself)
  if (profileOf(testInfo) === "iphone-std")
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--sat", "47px");
      document.documentElement.style.setProperty("--sab", "34px");
      window.__glySafe();
    });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await press(page, await fieldPoint(page)); // launch, then fall into the floor
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 40_000);
  await settle(page, "GameOver", 500);
  // the same run's results, as crowded as they get: coins + a hero bonus, three missions
  // finished and a Lucky Spin earned
  await page.evaluate(() => {
    const g = window.__glydrift;
    const go = g.scene.getScene("GameOver");
    const R = { ...go.result, run: { ...go.result.run, coins: 12, perkBonus: { total: 5, mul: 1 } } };
    R.missions = [1, 2, 3].map((i) => ({ text: `Fly ${i}00m in one run`, reward: { coins: 50 } }));
    R.achievements = [];
    R.unlocks = [];
    R.spinsEarned = 1;
    const data = { result: R, game: go.gameScene };
    g.scene.stop("GameOver");
    g.scene.getScene("Game").scene.launch("GameOver", data);
  });
  await settle(page, "GameOver", 3000);
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const go = g.scene.getScene("GameOver");
    const cam = go.cameras.main;
    const limit = cam.height / cam.zoom - (g.registry.get("safeBottom") || 0);
    return {
      limit,
      buttons: go.children.list
        .filter((c) => c.type === "Container" && c.label && c.visible)
        .map((c) => ({ label: c.label.text, bottom: c.getBounds().bottom })),
    };
  });
  expect(r.buttons.map((b) => b.label).sort()).toEqual(["HEROES", "HOME", "LEADERBOARD", "RETRY", "SHARE"]);
  for (const b of r.buttons) expect(b.bottom, `${b.label} above the bottom edge / home indicator`).toBeLessThanOrEqual(r.limit);
  expect(log.errors).toEqual([]);
});

test("website footer: the copyright line stays beside the game, never over it @smoke", async ({ page }, testInfo) => {
  test.skip(!["ipad-landscape", "laptop", "desktop"].includes(profileOf(testInfo)), "wide screens show the footer");
  const log = await openGame(page);
  const f = await page.evaluate(() => {
    const c = document.querySelector("#game canvas").getBoundingClientRect();
    const e = document.getElementById("legal");
    const r = e.getBoundingClientRect();
    return { right: c.right, left: r.left, legalRight: r.right, vw: innerWidth, text: e.textContent, shown: getComputedStyle(e).display !== "none" && r.width > 0 };
  });
  expect(f.shown).toBe(true);
  expect(f.text).toContain("© 2026 Sam Eyde III. All rights reserved.");
  expect(f.left).toBeGreaterThanOrEqual(f.right); // in the side area, right of the game frame
  expect(f.legalRight).toBeLessThanOrEqual(f.vw);
  expect(log.errors).toEqual([]);
});

test("Lucky Spin: the prize odds are fully on screen on every device, under the wheel @smoke", async ({ page }, testInfo) => {
  test.skip(!["iphone-small", "iphone-std", "ipad-portrait", "laptop"].includes(profileOf(testInfo)), "short, notched and 3:2 frames");
  const log = await openGame(page);
  // a status bar / home indicator (Playwright reports no insets itself)
  const inset = { "iphone-std": [47, 34], "ipad-portrait": [24, 20] }[profileOf(testInfo)];
  if (inset)
    await page.evaluate(([t, b]) => {
      document.documentElement.style.setProperty("--sat", `${t}px`);
      document.documentElement.style.setProperty("--sab", `${b}px`);
      window.__glySafe();
    }, inset);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Spin"));
  await settle(page, "Spin", 1500);
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Spin");
    const cam = s.cameras.main;
    const H = cam.height / cam.zoom;
    const texts = s.oddsStrip.list.filter((o) => o.type === "Text").map((o) => o.getBounds());
    const wheelBottom = s.cy + s.R;
    return {
      limit: H - (g.registry.get("safeBottom") || 0),
      top: g.registry.get("safeTop") || 0,
      pointerTop: s.cy - s.R - 34,
      rows: texts.length,
      lowest: Math.max(...texts.map((b) => b.bottom)),
      highest: Math.min(...texts.map((b) => b.top)),
      below: s.spinBtn.getBounds().top - wheelBottom,
      oddsBelowControls: Math.min(...texts.map((b) => b.top)) - s.heroLine.getBounds().bottom,
    };
  });
  expect(r.rows).toBeGreaterThan(8); // the heading + every prize and its chance
  expect(r.lowest).toBeLessThanOrEqual(r.limit);
  expect(r.pointerTop).toBeGreaterThan(r.top + 70); // the wheel stays under the title
  expect(r.below).toBeGreaterThan(0); // SPIN under the wheel, not on it
  expect(r.oddsBelowControls).toBeGreaterThan(0);
  expect(log.errors).toEqual([]);
});
