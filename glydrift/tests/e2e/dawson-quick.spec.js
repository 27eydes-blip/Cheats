// DAWSON's quick upgrade (cosmetic only): butterflies that follow him and scatter on
// near-misses, realm wings, the Full Display on a new best (behind gameplay), the Chomp at x5+,
// the twirl and bow on game over, the Great White and Neon Reef skins, and "Show-Off".
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle, waitFor } from "./helpers.js";

async function fly(page, extra = {}) {
  const log = await openGame(page, {
    flags: ["god", "character=dawson"],
    save: { ...SAVE, unlocked: { volt: true, dawson: true }, selected: "dawson", ...extra },
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

test("DAWSON upgrade: butterflies, realm wings, Full Display, Chomp, skins, Show-Off, bow @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await fly(page, { stats: { ...SAVE.stats, dawsonBests: 9 }, best: 0 });
  await step(page, 60);
  // cosmetic only: standard speed and hitbox, no perks
  const def = await page.evaluate(() => window.__heroDefs.find((c) => c.id === "dawson"));
  expect(def.speed ?? 1).toBe(1);
  expect(def.perks ?? null).toBe(null);
  // Migration: three butterflies follow close behind, scatter on a near-miss, come back
  const dist = () => ev(page, `return h.bflies.map((b) => Math.hypot(b.x - r.sprite.x, b.y - r.sprite.y));`);
  const before = await dist();
  expect(before.length).toBe(3);
  for (const d of before) expect(d).toBeLessThan(220);
  const pos = () => ev(page, `return h.bflies.map((b) => [b.x, b.y]);`);
  const p0 = await pos();
  await ev(page, `s.mult = 1; r.onNear();`);
  await step(page, 2);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("dawson_3"); // below x5: the tail flash
  await step(page, 18);
  // every butterfly darts off (well beyond its gentle follow wobble)
  const p1 = await pos();
  for (let i = 0; i < 3; i++) expect(Math.hypot(p1[i][0] - p0[i][0], p1[i][1] - p0[i][1])).toBeGreaterThan(60);
  await step(page, 150);
  for (const d of await dist()) expect(d).toBeLessThan(220);
  // Chomp at x5: the bite frame and its own sound
  await ev(page, `window.__snd = []; const S = window.__glySfx.Sfx; const m = S.moment; S.moment = (a, b, c) => { window.__snd.push(a + ":" + b); return m(a, b, c); };`);
  await ev(page, `s.mult = 5; r.onNear();`);
  await step(page, 2);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("dawson_6");
  expect(await page.evaluate(() => window.__snd)).toContain("dawson:chomp");
  await step(page, 40);
  // realm wings: each realm paints his wings
  const keys = new Set();
  for (const z of ["solar", "frozen", "abyss", null]) {
    await ev(page, `Object.defineProperty(s, "zoneId", { configurable: true, get: () => arg, set: () => {} });`, z);
    await step(page, 2);
    keys.add(await ev(page, `return r.sprite.texture.key;`));
  }
  expect(keys.size).toBe(4);
  // Full Display on a new best: behind gameplay (hazards start at depth 1), gone after 1 s
  await ev(page, `r.onBest();`);
  await step(page, 6);
  expect(await ev(page, `return { v: h.fan.visible, d: h.fan.depth };`)).toEqual({ v: true, d: 0.5 });
  await step(page, 60);
  expect(await ev(page, `return h.fan.visible;`)).toBe(false);
  // this run beats the best: the 10th with him earns "Show-Off"; game over: twirl and bow
  await ev(page, `window.__glyGod(false); s.die();`);
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
  const sx = [];
  const ang = [];
  for (let i = 0; i < 12; i++) {
    await run(page, 80);
    const f = await page.evaluate(() => {
      const im = window.__glydrift.scene.getScene("GameOver").dawsonFig;
      return { sx: im.scaleX, a: im.angle };
    });
    sx.push(f.sx);
    ang.push(f.a);
  }
  expect(Math.min(...sx)).toBeLessThan(0); // the twirl
  expect(Math.max(...ang)).toBeGreaterThan(15); // the bow
  const t = await page.evaluate(() => ({ n: window.__glySave.data.stats.dawsonBests, owned: !!window.__glySave.data.titles?.owned?.h_showoff }));
  expect(t).toEqual({ n: 10, owned: true });
  expect(log.errors).toEqual([]);
});

for (const skin of ["dskin_greatwhite", "dskin_neonreef"])
  test(`DAWSON skin ${skin}: in the shop's SKINS tab, worn in game @smoke`, async ({ page }, testInfo) => {
    test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
    const log = await fly(page, { cos: { owned: { [skin]: true }, equipped: { dskin: skin } } });
    await step(page, 20);
    const r = await ev(page, `return { key: r.sprite.texture.key, glow: h.bodyGlow.visible };`);
    expect(r.key).toContain(skin);
    if (skin === "dskin_neonreef") expect(r.glow).toBe(true);
    await page.evaluate(() => {
      const g = window.__glydrift;
      g.scene.stop("Hud");
      g.scene.stop("Game");
      g.scene.start("Shop", { tab: "skin" });
    });
    await settle(page, "Shop", 1200);
    const ids = await page.evaluate(() => window.__glydrift.scene.getScene("Shop").offersFor("skin").map((o) => o.id));
    expect(ids).toContain(skin);
    expect(log.errors).toEqual([]);
  });
