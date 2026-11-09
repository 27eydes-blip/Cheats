// THE NEWBLEIZER (legendary): an original samurai hooper. One perk, HIGHER JUMPS (+8% flap
// height, the same gravity and hitbox). Jump + katana spin flap, the sword glint on a near-miss,
// the new-best dunk then sheathe, the dropped ball bouncing away on death, the "Reach the Abyss
// 3 times" challenge, hats on his high-top, the perk badge on the leaderboard, fair score checks.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle } from "./helpers.js";

async function fly(page, id = "newbleizer", extra = {}) {
  const log = await openGame(page, {
    flags: ["god", `character=${id}`],
    save: { ...SAVE, unlocked: { volt: true, [id]: true }, selected: id, ...extra },
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}
const step = (page, n, hold = true) =>
  page.evaluate(
    ({ n, hold }) => {
      const s = window.__glydrift.scene.getScene("Game");
      for (let i = 0; i < n; i++) {
        if (hold && s.state === "playing") {
          s.player.y = s.H * 0.45;
          s.player.vy = 0;
        }
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
    },
    { n, hold },
  );
const ev = (page, src, arg) =>
  page.evaluate(
    ({ src, arg }) => {
      const s = window.__glydrift.scene.getScene("Game");
      return new Function("s", "r", "h", "arg", src)(s, s.player.rig, s.player.rig.hb, arg);
    },
    { src, arg },
  );

/** One flap from rest at mid-screen: how high it rises (px) and how long the rise takes. */
const jump = (page) =>
  page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const p = s.player;
    p.integrate(0); // (nothing: just make sure it exists)
    p.y = s.H * 0.6;
    p.vy = 0;
    p.gravityDir = 1;
    p.miniT = 0;
    const y0 = p.y;
    p.flap();
    let top = p.y;
    let n = 0;
    while (p.vy < 0 && n < 600) {
      p.integrate(1 / 240);
      top = Math.min(top, p.y);
      n++;
    }
    return { rise: y0 - top, v: -p.vy || 0, t: n / 240 };
  });

test("THE NEWBLEIZER: legendary samurai hooper; +8% jump with the standard hitbox and gravity; jump-spin, glint, dunk, ball bounces away, back after RETRY @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await fly(page);
  const def = await page.evaluate(() => {
    const d = window.__heroDefs.find((c) => c.id === "newbleizer");
    const tx = window.__glydrift.textures;
    return {
      name: d.name,
      rarity: d.rarity,
      cost: d.cost,
      challenge: d.challenge,
      speed: d.speed ?? 1,
      perks: d.perks,
      frames: d.pixel.frames.every((f) => tx.get("pxc").has(f)) && tx.get("pxc").has("newbleizer_ball"),
      portrait: tx.exists("hero_newbleizer"),
    };
  });
  expect(def).toEqual({
    name: "THE NEWBLEIZER",
    rarity: "legendary",
    cost: 12000,
    challenge: { stat: "abyssRuns", value: 3, text: "Reach the Abyss 3 times" },
    speed: 1,
    perks: { jump: 1.08, list: ["+8% JUMP"] },
    frames: true,
    portrait: true, // (the share card and leaderboard rows use hero_<id>)
  });
  // the perk: 8% higher flaps (same gravity), the standard hitbox (the same as VOLT's)
  const mine = await jump(page);
  const p2 = await page.context().newPage();
  await fly(p2, "volt");
  const volt = await jump(p2);
  const voltR = await p2.evaluate(() => window.__glydrift.scene.getScene("Game").player.radius);
  await p2.close();
  expect(await ev(page, `return s.player.radius;`)).toBe(voltR);
  expect(mine.rise / volt.rise).toBeGreaterThan(1.07);
  expect(mine.rise / volt.rise).toBeLessThan(1.09);
  // (gravity is untouched: the rise lasts exactly as much longer as the flap speed is higher)
  expect(mine.t / volt.t).toBeCloseTo(Math.sqrt(1.08), 1);

  await step(page, 30);
  await ev(page, `h.nearT = h.flapT = h.bestT = 0;`); // (a real near-miss on the way doesn't count)
  await step(page, 1);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("newbleizer_0"); // glide: blade at his side
  expect(await ev(page, `return h.ballGlow.visible;`)).toBe(true); // the glowing ball at his hip
  // flap: the jump (frame 1) into the katana spin (frame 2), with the swoosh drawn
  await ev(page, `s.slowT = 0; h.nearT = 0; s.onTap();`);
  const seen = new Set();
  let swoosh = false;
  for (let i = 0; i < 16; i++) {
    await ev(page, `s.slowT = 0;`);
    await step(page, 1);
    seen.add(await ev(page, `return r.sprite.frame.name;`));
    swoosh ||= await ev(page, `return h.g.commandBuffer.length > 0;`);
  }
  expect(seen.has("newbleizer_1") && seen.has("newbleizer_2")).toBe(true);
  expect(swoosh).toBe(true);
  await step(page, 40);
  // near-miss: blade up and the glint
  await ev(page, `r.onNear();`);
  await step(page, 2);
  expect(await ev(page, `return { f: r.sprite.frame.name, glint: h.glintT > 0 };`)).toEqual({ f: "newbleizer_3", glint: true });
  await step(page, 60);
  // new best: the dunk (frame 5, the hoop, the ball through the net), then the sheathe (frame 6)
  await ev(page, `r.onBest();`);
  await step(page, 6);
  expect(await ev(page, `return { f: r.sprite.frame.name, hoop: !!h.hoop };`)).toEqual({ f: "newbleizer_5", hoop: true });
  await step(page, 30);
  expect(await ev(page, `return { swished: h.swished, ball: h.ball.visible };`)).toEqual({ swished: true, ball: true });
  await step(page, 40);
  expect(await ev(page, `return r.sprite.frame.name;`)).toBe("newbleizer_6");
  await step(page, 60);
  expect(await ev(page, `return { f: r.sprite.frame.name, hoop: h.hoop, ball: h.ball.visible };`)).toEqual({
    f: "newbleizer_0",
    hoop: null,
    ball: false,
  });
  // death: dazed (frame 7), the ball drops and bounces away, stars; then RETRY brings him back
  await ev(page, `window.__glyGod(false); s.die();`);
  await step(page, 4, false);
  const d0 = await ev(page, `return { f: r.sprite.frame.name, ball: h.ball.visible, x: h.ball.x, stars: h.fg.commandBuffer.length > 0 };`);
  expect(d0.f).toBe("newbleizer_7");
  expect(d0.ball && d0.stars).toBe(true);
  await step(page, 70, false); // (the death slow-motion: game time runs slower)
  const d1 = await ev(page, `return { x: h.ball.x, bounces: h.ballV?.bounces ?? 9 };`);
  expect(d1.x).toBeLessThan(d0.x); // rolling away behind him
  expect(d1.bounces).toBeGreaterThan(0);
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
  expect(await ev(page, `return { v: r.sprite.visible, ball: h.ball.visible, f: r.sprite.frame.name };`)).toEqual({
    v: true,
    ball: false,
    f: "newbleizer_0",
  });
  expect(log.errors).toEqual([]);
});

test("THE NEWBLEIZER: unlocks by reaching the Abyss 3 times; +8% JUMP on his card; hats on his high-top; dunks on the hero screen; perk badge and fair score checks @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await fly(page, "newbleizer", { cos: { owned: { hat_crown: true }, equipped: { hat: "hat_crown" } } });
  await step(page, 20);
  const hat = await ev(
    page,
    `const sp = r.sprite; return { v: r.hat.visible, dx: (r.hat.x - sp.x) / Math.abs(sp.displayWidth), dy: (r.hat.y - sp.y) / Math.abs(sp.displayHeight) };`,
  );
  expect(hat.v).toBe(true);
  expect(hat.dy).toBeLessThan(-0.3); // on top of his head…
  expect(Math.abs(hat.dx)).toBeLessThan(0.15); // …centred on it
  const unlock = await page.evaluate(() => {
    const { Progression } = window.__glyHeroes;
    const d = window.__glySave.data;
    delete d.unlocked.newbleizer;
    d.stats.abyssRuns = 2;
    Progression.checkChallengeUnlocks();
    const before = !!d.unlocked.newbleizer;
    d.stats.abyssRuns = 3;
    Progression.checkChallengeUnlocks();
    return { before, after: !!d.unlocked.newbleizer };
  });
  expect(unlock).toEqual({ before: false, after: true });
  // score checks: a jump perk doesn't change how fast the world moves, so the usual limits
  // apply unchanged (a normal run passes, an impossible distance is refused)
  const fair = await page.evaluate(() => {
    const { isPlausible } = window.__glyLb;
    const ok = isPlausible({ score: 900, distance: 600, run_time_ms: 60_000, character: "newbleizer" });
    const tooFar = isPlausible({ score: 9000, distance: 6000, run_time_ms: 60_000, character: "newbleizer" });
    return { ok, tooFar };
  });
  expect(fair).toEqual({ ok: true, tooFar: false });
  // the hero screen: his card says +8% JUMP, the confident pose, the dunk every few seconds
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.stop("Hud");
    g.scene.stop("Game");
    g.registry.set("heroFocus", "newbleizer");
    g.scene.start("Characters");
  });
  await settle(page, "Characters", 1200);
  const card = await page.evaluate(() => {
    const sc = window.__glydrift.scene.getScene("Characters");
    const texts = [];
    const walk = (o) => {
      if (o.type === "Text") texts.push(o.text);
      (o.list || []).forEach(walk);
    };
    walk(sc.cards[sc.roster.findIndex((d) => d.id === "newbleizer")]);
    return texts;
  });
  expect(card.some((t) => t.includes("+8% JUMP"))).toBe(true);
  const frames = new Set();
  for (let i = 0; i < 60; i++) {
    await run(page, 100);
    frames.add(await page.evaluate(() => window.__glydrift.scene.getScene("Characters").rig.sprite.frame.name));
  }
  expect(frames.has("newbleizer_4")).toBe(true); // the confident pose
  expect(frames.has("newbleizer_5")).toBe(true); // the dunk
  expect(frames.has("newbleizer_6")).toBe(true); // the sheathe
  expect(log.errors).toEqual([]);
});

test("THE NEWBLEIZER: his runs get the gold perk badge on the leaderboard @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock"] });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Leaderboard"));
  await settle(page, "Leaderboard", 1500);
  const count = (id) =>
    page.evaluate((id) => {
      const sc = window.__glydrift.scene.getScene("Leaderboard");
      const rows = sc.rows.map((r) => ({ ...r, character: id }));
      sc.list.removeAll(true);
      sc.renderRows(rows, sc.userId);
      let n = 0;
      const walk = (o) => {
        if (o.name === "perkBadge") n++;
        (o.list || []).forEach(walk);
      };
      walk(sc.list);
      return { n, rows: rows.length };
    }, id);
  const nb = await count("newbleizer");
  const volt = await count("volt");
  expect(nb.n).toBe(nb.rows); // every one of his rows (podium included)
  expect(volt.n).toBe(0);
  expect(log.errors).toEqual([]);
});
