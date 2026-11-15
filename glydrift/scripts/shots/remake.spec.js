// Before/after screenshots for the graphics remake: home, shop, leaderboard, game over and every
// realm in flight, on 3 iPhone sizes and an iPad. Run with scripts/shots/shots.config.js;
// SHOTS_OUT picks the output folder (e.g. docs/remake/before).
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fieldPoint, freshFrame, openGame, press, reseed, run, settle, tap, tapHome, waitFor } from "../../tests/e2e/helpers.js";

const OUT = process.env.SHOTS_OUT || "docs/remake/after";
const REALMS = ["void", "sakura", "solar", "frozen", "glitch", "abyss", "valley", "hurricane", "prism", "tidal", "chrono", "mirror"];
const shot = async (page, name) => {
  const dir = `${OUT}/${test.info().project.name}`;
  mkdirSync(dir, { recursive: true });
  await freshFrame(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
};
const home = (page) =>
  page.evaluate(() => {
    const g = window.__glydrift;
    for (const s of g.scene.getScenes(true)) if (!["Backdrop", "Menu"].includes(s.sys.settings.key)) g.scene.stop(s.sys.settings.key);
    if (!g.scene.isActive("Menu")) g.scene.start("Menu");
  });
async function startRun(page) {
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
}
const autopilot = async (page, steps) => {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
    });
    await run(page, 100);
  }
};

test("screens", async ({ page }) => {
  await openGame(page, { flags: ["lbmock"] });
  await run(page, 2500);
  await shot(page, "home");
  await tapHome(page, "SHOP", 0);
  await settle(page, "Shop", 2000);
  await shot(page, "shop");
  await home(page);
  await run(page, 1200);
  await tapHome(page, "LEADERBOARD", 0);
  await settle(page, "Leaderboard", 2500);
  await shot(page, "leaderboard");
  await home(page);
  await run(page, 1200);
  await startRun(page);
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 30_000);
  await settle(page, "GameOver", 3500);
  await shot(page, "game-over");
});

for (const id of REALMS)
  test(`realm ${id}`, async ({ page }) => {
    await openGame(page, { flags: ["god", `dimension=${id}`] });
    await run(page, 1500);
    await startRun(page);
    await autopilot(page, 12);
    await shot(page, `realm-${id}-title`);
    await autopilot(page, 40);
    await shot(page, `realm-${id}`);
    expect(true).toBe(true);
  });
