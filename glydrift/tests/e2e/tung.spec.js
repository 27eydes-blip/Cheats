// TUNG (legendary): the super cute baby unicorn. Cosmetic only (standard hitbox and speed);
// flutter flap with hearts, wink, the new-best rainbow behind gameplay, the pastel poof, the
// "Earn 30 level stars" challenge, hats behind the horn and her portrait for the share card.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle } from "./helpers.js";

async function fly(page, extra = {}) {
  const log = await openGame(page, {
    flags: ["god", "character=tung"],
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

test("TUNG: legendary unicorn, cosmetic only; flutter, wink, rainbow behind gameplay, poof, back after RETRY @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await fly(page);
  const def = await page.evaluate(() => {
    const d = window.__heroDefs.find((c) => c.id === "tung");
    return {
      rarity: d.rarity,
      cost: d.cost,
      challenge: d.challenge,
      desc: d.desc,
      speed: d.speed ?? 1,
      perks: d.perks ?? null,
      frames: d.pixel.frames.every((f) => window.__glydrift.textures.get("pxc").has(f)),
      portrait: window.__glydrift.textures.exists("hero_tung"),
    };
  });
  expect(def).toEqual({
    rarity: "legendary",
    cost: 12000,
    challenge: { stat: "levelStars", value: 30, text: "Earn 30 level stars" },
    desc: "Too cute to crash.",
    speed: 1,
    perks: null,
    frames: true,
    portrait: true, // (the share card and leaderboard rows use hero_<id>)
  });
  // the standard hitbox (the same as VOLT's)
  const p2 = await page.context().newPage();
  await openGame(p2, { flags: ["god"] });
  await p2.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(p2, "Game", 800);
  const voltR = await p2.evaluate(() => window.__glydrift.scene.getScene("Game").player.radius);
  await p2.close();
  expect(await ev(page, `return s.player.radius;`)).toBe(voltR);
  await step(page, 30);
  await ev(page, `h.nearT = h.flapT = h.bestT = 0;`); // (a real near-miss on the way doesn't count)
  await step(page, 1);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("tung_0");
  // flap: a fast flutter (frames 1 / 2) and little hearts
  // (no near-miss slow motion while watching the flutter)
  await ev(page, `s.slowT = 0; h.nearT = 0; s.onTap();`);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    await ev(page, `s.slowT = 0;`);
    await step(page, 1);
    seen.add(await ev(page, `return r.sprite.frame.name;`));
  }
  expect(seen.has("tung_1") && seen.has("tung_2")).toBe(true);
  expect(await ev(page, `return r.fx.emitters.heart.getAliveParticleCount();`)).toBeGreaterThan(0);
  await step(page, 40);
  // near-miss: a wink
  await ev(page, `r.onNear();`);
  await step(page, 2);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("tung_3");
  await step(page, 60);
  // new best: the victory pose (rearing up), then delighted, and a rainbow arcs across the
  // screen behind gameplay
  await ev(page, `r.onBest();`);
  await step(page, 6);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("tung_7");
  await step(page, 44);
  const rb = await ev(page, `return { f: r.sprite.frame.name, v: h.arc.visible, d: h.arc.depth };`);
  expect(rb).toEqual({ f: "tung_4", v: true, d: 0.5 }); // (hazards start at depth 1)
  await step(page, 60);
  expect(await ev(page, `return h.arc.visible;`)).toBe(false);
  // death: she bursts into a pastel poof (the picture is gone), then RETRY brings her back
  await ev(page, `window.__glyGod(false); s.die();`);
  await step(page, 4);
  expect(await ev(page, `return r.sprite.visible;`)).toBe(false);
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 300 && !window.__glydrift.scene.isActive("GameOver"); i++) {
      s.__t += 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
  });
  await run(page, 800);
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await step(page, 20);
  expect(await ev(page, `return r.sprite.visible;`)).toBe(true);
  expect(log.errors).toEqual([]);
});

test("TUNG: unlocks with 30 level stars; hats sit behind her horn; prances and blinks on the hero screen @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await fly(page, { cos: { owned: { hat_horns: true }, equipped: { hat: "hat_horns" } } });
  await step(page, 20);
  const hat = await ev(
    page,
    `const sp = r.sprite; return { v: r.hat.visible, dx: (r.hat.x - sp.x) / Math.abs(sp.displayWidth), dy: (r.hat.y - sp.y) / Math.abs(sp.displayHeight) };`,
  );
  expect(hat.v).toBe(true);
  expect(hat.dy).toBeLessThan(-0.15); // on top of her head…
  expect(hat.dx).toBeLessThan(0.15); // …behind the horn (the horn is at the front, right)
  const unlock = await page.evaluate(() => {
    const { Progression } = window.__glyHeroes;
    const d = window.__glySave.data;
    delete d.unlocked.tung;
    d.stats.levelStars = 29;
    Progression.checkChallengeUnlocks();
    const before = !!d.unlocked.tung;
    d.stats.levelStars = 30;
    Progression.checkChallengeUnlocks();
    return { before, after: !!d.unlocked.tung };
  });
  expect(unlock).toEqual({ before: false, after: true });
  // the hero screen: prances, blinks
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.stop("Hud");
    g.scene.stop("Game");
    g.registry.set("heroFocus", "tung");
    g.scene.start("Characters");
  });
  await settle(page, "Characters", 1200);
  const frames = new Set();
  for (let i = 0; i < 50; i++) {
    await run(page, 100);
    frames.add(await page.evaluate(() => window.__glydrift.scene.getScene("Characters").rig.sprite.frame.name));
  }
  expect(frames.has("tung_6")).toBe(true); // prancing
  expect(frames.has("tung_5")).toBe(true); // a slow blink
  expect(log.errors).toEqual([]);
});
