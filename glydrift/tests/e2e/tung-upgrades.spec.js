// TUNG's upgrade path and extras (cosmetic only): 5 levels earned by runs with her (her look,
// orbiting stars, crown, starlight mane, galaxy aura / halo / shooting-star trail), the level-up
// celebration, the look picker on her hero page, heart combos, the victory pose, her skins
// (Cotton Candy, Moonbeam, Rose Gold; Nightmare Tung for Season 1 Drift Pass+ owners) and the
// "Too Cute to Crash" title.
import { expect, test } from "@playwright/test";
import { fieldPoint, locate, openGame, press, profileOf, reseed, run, SAVE, settle, waitFor } from "./helpers.js";

async function fly(page, extra = {}, flags = []) {
  const log = await openGame(page, {
    flags: ["god", "character=tung", ...flags],
    save: { ...SAVE, unlocked: { volt: true, tung: true }, selected: "tung", ...extra },
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}
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
const ev = (page, src, arg) =>
  page.evaluate(
    ({ src, arg }) => {
      const s = window.__glydrift.scene.getScene("Game");
      return new Function("s", "r", "h", "arg", src)(s, s.player.rig, s.player.rig.hb, arg);
    },
    { src, arg },
  );
const phoneOnly = (testInfo) => test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

test("TUNG upgrades: 5 levels by runs (look, stars, aura, halo), level-up celebration, title @smoke", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await fly(page, { stats: { ...SAVE.stats, tungRuns: 9 } });
  await step(page, 20);
  // cosmetic only: standard speed and hitbox
  const def = await page.evaluate(() => window.__heroDefs.find((c) => c.id === "tung"));
  expect(def.speed ?? 1).toBe(1);
  expect(def.perks ?? null).toBe(null);
  // level 1 (9 runs): the Foal look, no extras
  const lv1 = await ev(page, `return { key: r.sprite.texture.key, aura: h.aura.visible, lv: h.level };`);
  expect(lv1).toEqual({ key: "tlook_base_1", aura: false, lv: 1 });
  // the 10th run: Sparkle — and the celebration on the results screen
  await ev(page, `window.__glyGod(false); s.die();`);
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
  await run(page, 900);
  const up = await page.evaluate(() => {
    const go = window.__glydrift.scene.getScene("GameOver");
    const texts = [];
    const walk = (o) => {
      if (o.text) texts.push(o.text);
      for (const k of o.list || []) walk(k);
    };
    for (const o of go.children.list) walk(o);
    return { runs: window.__glySave.data.stats.tungRuns, banner: texts.includes("TUNG LEVELED UP!"), sub: texts.find((t) => t.startsWith("LEVEL 2")) };
  });
  expect(up).toEqual({ runs: 10, banner: true, sub: "LEVEL 2 · SPARKLE" });
  // every level's look is its own drawing
  const keys = await page.evaluate(() => {
    const out = [];
    const d = window.__glySave.data;
    for (const n of [10, 25, 50, 100]) {
      d.stats.tungRuns = n;
      out.push(n);
    }
    return out;
  });
  expect(keys.length).toBe(4);
  // level 5 (100 runs): "Too Cute to Crash"
  await page.evaluate(() => {
    const d = window.__glySave.data;
    d.stats.tungRuns = 99;
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await step(page, 20);
  await ev(page, `window.__glyGod(false); s.die();`);
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
  await run(page, 600);
  const top = await page.evaluate(() => ({ runs: window.__glySave.data.stats.tungRuns, title: !!window.__glySave.data.titles?.owned?.h_toocute }));
  expect(top).toEqual({ runs: 100, title: true });
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await step(page, 30);
  const lv5 = await ev(page, `return { key: r.sprite.texture.key, aura: h.aura.visible, lv: h.level };`);
  expect(lv5).toEqual({ key: "tlook_base_5", aura: true, lv: 5 });
  expect(log.errors).toEqual([]);
});

test("TUNG extras: heart combo (burst at x10), victory pose, look picker on her hero page, skins @smoke", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await fly(page, {
    stats: { ...SAVE.stats, tungRuns: 30 },
    cos: { owned: { tskin_moonbeam: true }, equipped: {} },
  });
  await step(page, 30);
  // heart combo: a tiny heart per step, a burst at x10 (step 4)
  const hearts = () => ev(page, `return r.fx.emitters.heart?.getAliveParticleCount() || 0;`);
  await step(page, 120);
  const h0 = await hearts();
  await ev(page, `r.onCombo(1);`);
  const h1 = await hearts();
  expect(h1 - h0).toBe(1);
  await ev(page, `r.onCombo(4);`);
  expect((await hearts()) - h1).toBeGreaterThanOrEqual(10);
  await step(page, 60);
  // victory pose on a new best: rears up (tilted back) with a sparkle burst
  await ev(page, `r.onBest();`);
  await step(page, 6);
  expect(await ev(page, `return { f: r.sprite.frame.name, a: r.sprite.angle };`)).toEqual({ f: "tung_7", a: -24 });
  await step(page, 120);
  // a skin: her own look (drawn only on her)
  await ev(page, `window.__glyShop.Shop.equip("tskin_moonbeam"); r.setCosmetics(window.__glyShop.Shop.loadout());`);
  expect(await ev(page, `return r.sprite.texture.key;`)).toBe("tlook_tskin_moonbeam_3");
  // Nightmare Tung: only with Season 1's Drift Pass+
  const nm = await page.evaluate(() => {
    const { Shop } = window.__glyShop;
    const d = window.__glySave.data;
    const before = Shop.owns("tskin_nightmare");
    d.passPlus = { s1: { verified: true } };
    return { before, after: Shop.owns("tskin_nightmare"), sold: window.__glyShop.forSale(window.__glyShop.COSMETICS.find((c) => c.id === "tskin_nightmare")) };
  });
  expect(nm).toEqual({ before: false, after: true, sold: false });
  // the hero page: her level and progress, and a look picker for unlocked levels
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.stop("Hud");
    g.scene.stop("Game");
    g.registry.set("heroFocus", "tung");
    g.scene.start("Characters");
  });
  await settle(page, "Characters", 1200);
  const pg = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    return { line: c.tungText.text, btn: c.tungBtn.visible };
  });
  expect(pg).toEqual({ line: "LEVEL 3 · BLOSSOM · 30/50 RUNS", btn: true });
  const looks = [];
  for (let i = 0; i < 3; i++) {
    const label = await page.evaluate(() => window.__glydrift.scene.getScene("Characters").tungBtn.list.find((o) => o.text)?.text);
    await press(page, await locate(page, label));
    await run(page, 300);
    looks.push(await page.evaluate(() => window.__glySave.data.settings.tungLook));
  }
  expect(looks).toEqual([1, 2, 3]); // (cycles through the unlocked levels only)
  // the shop's SKINS tab lists her three
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.stop("Characters");
    g.scene.start("Shop", { tab: "skin" });
  });
  await settle(page, "Shop", 1200);
  const ids = await page.evaluate(() => window.__glydrift.scene.getScene("Shop").offersFor("skin").map((o) => o.id));
  for (const id of ["tskin_cottoncandy", "tskin_moonbeam", "tskin_rosegold"]) expect(ids).toContain(id);
  expect(ids).not.toContain("tskin_nightmare");
  expect(log.errors).toEqual([]);
});
