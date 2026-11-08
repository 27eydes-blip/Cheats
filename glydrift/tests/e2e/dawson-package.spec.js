// DAWSON's special package: +5% speed (card, leaderboard badge, fair score checks), the shark
// / butterfly / peacock features, his skins (shop + Drift Pass+), titles, the cocoon reveal,
// the strut, the bow and his victory pose. Standard hitbox; Reduce Flashing and Low Graphics.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle, waitFor } from "./helpers.js";

const phoneOnly = (testInfo) => test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

async function flyAsDawson(page, extraSave = {}, flags = []) {
  const log = await openGame(page, {
    flags: ["god", "character=dawson", ...flags],
    save: { ...SAVE, unlocked: { volt: true, dawson: true }, selected: "dawson", ...extraSave },
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}

/** Step the game n frames; hold: keep the hero at this height (fraction of the screen). */
const step = (page, n, hold = 0.45) =>
  page.evaluate(
    ({ n, hold }) => {
      const s = window.__glydrift.scene.getScene("Game");
      for (let i = 0; i < n; i++) {
        if (hold !== null && s.state === "playing") {
          s.player.y = s.H * hold;
          s.player.vy = 0;
        }
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
    },
    { n, hold },
  );

const hb = (page, fn, arg) =>
  page.evaluate(
    ({ src, arg }) => {
      const s = window.__glydrift.scene.getScene("Game");
      // eslint-disable-next-line no-new-func
      return new Function("s", "r", "h", "arg", src)(s, s.player.rig, s.player.rig.hb, arg);
    },
    { src: fn, arg },
  );

test("DAWSON: +5% speed with the standard hitbox; '+5% SPEED' on his card; fair score checks", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await flyAsDawson(page);
  const r = await hb(
    page,
    `const def = window.__heroDefs.find((c) => c.id === "dawson");
     const volt = window.__heroDefs.find((c) => c.id === "volt");
     return { speed: def.speed, volt: volt.speed ?? 1, perks: def.perks.list, desc: def.desc,
              live: s.speed / (s.speedMul * (s.boostMul || 1)), radius: s.player.radius };`,
  );
  expect(r.speed).toBe(1.05);
  expect(r.volt).toBe(1);
  expect(r.perks).toEqual(["+5% SPEED"]);
  expect(r.desc).toBe("Part shark. Part butterfly. All show-off. +5% speed.");
  // the run itself moves 5% faster than the base speed for this distance
  const base = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    return s.speed / (s.speedMul * (s.charDef.speed ?? 1) * (s.boostMul || 1));
  });
  expect(r.live / base).toBeCloseTo(1.05, 5);
  // standard hitbox (the same as VOLT's)
  const p2 = await page.context().newPage();
  await openGame(p2, { flags: ["god"] });
  await p2.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(p2, "Game", 800);
  expect(await p2.evaluate(() => window.__glydrift.scene.getScene("Game").player.radius)).toBe(r.radius);
  await p2.close();

  // fair score checks: the fastest a DAWSON run can go (5% × the Abyss / dimension spike ×
  // Chrono fast zones) stays inside the client and server distance limits (1.8 × top speed),
  // and his runs are checked exactly like everyone else's
  const fair = await page.evaluate(() => {
    const { isPlausible } = window.__glyLb;
    const W = { maxSpeed: 625, pxPerMeter: 20 };
    const ms = 120_000;
    const fastest = Math.floor(((W.maxSpeed * 1.05 * 1.1 * 1.35) / W.pxPerMeter) * (ms / 1000));
    return {
      fastest: isPlausible({ score: fastest * 6, distance: fastest, run_time_ms: ms, level: "endless" }),
      tooFar: isPlausible({ score: fastest * 3, distance: fastest * 3, run_time_ms: ms, level: "endless" }),
      factor: 1.05 * 1.1 * 1.35,
    };
  });
  expect(fair.fastest).toBe(true);
  expect(fair.tooFar).toBe(false);
  expect(fair.factor).toBeLessThan(1.8);
  expect(readFileSync("src/online/leaderboard.js", "utf8")).toMatch(/MAX_SPEED_FACTOR = 1\.8/);
  expect(readFileSync("supabase/migrations/20261107000001_strict_score_check.sql", "utf8")).toMatch(/1\.8/);

  // the hero card shows the perk
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.stop("Hud");
    g.scene.stop("Game");
    g.registry.set("heroFocus", "dawson");
    g.scene.start("Characters");
  });
  await settle(page, "Characters", 1500);
  const card = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    const texts = [];
    const walk = (o) => {
      if (o.text) texts.push(o.text);
      for (const k of o.list || []) walk(k);
    };
    for (const o of c.children.list) walk(o);
    return texts;
  });
  expect(card.some((t) => t.includes("+5% SPEED"))).toBe(true);
  expect(log.errors).toEqual([]);
});

test("DAWSON's runs carry the speed badge on the leaderboard", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { flags: ["lbmock"] });
  await page.evaluate(() => {
    const { Leaderboard } = window.__glyLb;
    const orig = Leaderboard.board.bind(Leaderboard);
    // every sample player flies DAWSON
    Leaderboard.board = async (...a) => {
      const res = await orig(...a);
      for (const row of res.rows || []) row.character = "dawson";
      return res;
    };
    window.__glydrift.scene.getScene("Menu").scene.start("Leaderboard", { tab: "score" });
  });
  await waitFor(page, () => window.__glydrift.scene.isActive("Leaderboard"));
  await run(page, 2500);
  const badges = await page.evaluate(() => {
    const lb = window.__glydrift.scene.getScene("Leaderboard");
    const all = [...lb.children.list, ...(lb.list?.list || [])].flatMap((o) => (o.list ? [o, ...o.list] : [o]));
    return all.filter((o) => o.name === "speedBadge").length;
  });
  expect(badges).toBeGreaterThan(3);
  expect(log.errors).toEqual([]);
});

test("SHARK: Fin Cruise wake, Chomp Combo at x5+, Feeding Frenzy, Shark Week fin", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await flyAsDawson(page);
  await step(page, 30);
  // Fin Cruise: high up, no wake; skimming the floor, a wake of droplets
  const dots = () => hb(page, `return r.fx.emitters.dot.getAliveParticleCount();`);
  await step(page, 60, 0.45);
  const high = await dots();
  await step(page, 20, 0.86);
  const low = await dots();
  expect(low).toBeGreaterThan(high + 3);
  await step(page, 60, 0.45);
  // Chomp Combo: at x5 a near-miss is a CHOMP (jaws open, its own sound); below x5 a tail flash
  const sounds = await hb(
    page,
    `window.__chomps = [];
     const { Sfx } = window.__glySfx;
     const m = Sfx.moment;
     Sfx.moment = (id, evt, a) => { window.__chomps.push(id + ":" + evt); return m(id, evt, a); };
     return true;`,
  );
  expect(sounds).toBe(true);
  await hb(page, `s.mult = 2; r.onNear();`);
  await step(page, 2);
  expect(await hb(page, `return r.sprite.frame.name;`)).toBe("dawson_3");
  await step(page, 40);
  await hb(page, `s.mult = 5; r.onNear();`);
  await step(page, 2);
  expect(await hb(page, `return r.sprite.frame.name;`)).toBe("dawson_6");
  expect(await page.evaluate(() => window.__chomps)).toEqual(["dawson:near", "dawson:chomp"]);
  await step(page, 40);
  // the bubbly shimmer on every combo step
  await hb(page, `r.onCombo(1); r.onCombo(2);`);
  expect(await page.evaluate(() => window.__chomps.filter((x) => x === "dawson:combo").length)).toBe(2);
  // Feeding Frenzy: 4 coins spread over 3 s — nothing; then 5 in 2 s — glowing eyes
  for (let i = 0; i < 4; i++) {
    await hb(page, `r.onCoin(1);`);
    await step(page, 45);
  }
  expect(await hb(page, `return h.frenzyT;`)).toBe(0);
  for (let i = 0; i < 5; i++) {
    await hb(page, `r.onCoin(1);`);
    await step(page, 10);
  }
  const fr = await hb(page, `return { t: h.frenzyT, eye: h.eyeGlow.visible, tint: h.eyeGlow.tintTopLeft };`);
  expect(fr.t).toBeGreaterThan(1);
  expect(fr.eye).toBe(true);
  await step(page, 160);
  expect(await hb(page, `return h.eyeGlow.visible;`)).toBe(false);
  // Shark Week: crossing 1,000 m sends a fin circling in the background, behind every hazard
  await hb(page, `s.distance = Math.max(s.distance, 1000 * 20);`); // (WORLD.pxPerMeter = 20)
  await step(page, 30);
  const fin = await hb(
    page,
    `const hz = s.obstacles.active.flatMap((o) => (o.parts || o.list || [])).map((p) => p.depth).filter((d) => d != null);
     return { vis: h.fin?.visible, depth: h.fin?.depth, next: h.nextFin, x0: h.fin?.x };`,
  );
  expect(fin.vis).toBe(true);
  expect(fin.depth).toBeLessThan(1); // hazards start at depth 1
  expect(fin.next).toBe(2000);
  await step(page, 30);
  expect(await hb(page, `return h.fin.x;`)).not.toBe(fin.x0); // it swims
  await step(page, 200);
  expect(await hb(page, `return h.fin.visible;`)).toBe(false);
  expect(log.errors).toEqual([]);
});

test("BUTTERFLY: Migration (scatter on near-miss), realm wings, wing dust", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await flyAsDawson(page);
  await step(page, 60);
  // Migration: three tiny butterflies follow close behind
  const near = () =>
    hb(page, `return h.bflies.map((b) => Math.hypot(b.x - r.sprite.x, b.y - r.sprite.y));`);
  const before = await near();
  expect(before.length).toBe(3);
  for (const d of before) expect(d).toBeLessThan(220);
  await hb(page, `r.onNear();`);
  await step(page, 20);
  const scattered = await near();
  expect(Math.max(...scattered)).toBeGreaterThan(Math.max(...before) + 30);
  await step(page, 150);
  for (const d of await near()) expect(d).toBeLessThan(220); // they come back
  // realm wings: each realm and dimension paints his wings
  const keys = {};
  for (const z of ["solar", "frozen", "abyss", "prism", "tidal", null]) {
    await hb(page, `Object.defineProperty(s, "zoneId", { configurable: true, get: () => arg, set: () => {} });`, z);
    await step(page, 2);
    keys[z] = await hb(page, `return r.sprite.texture.key;`);
  }
  expect(new Set(Object.values(keys)).size).toBe(6);
  expect(keys.solar).toContain("solar");
  // wing dust: each flap drops a few scales that fade slowly
  await hb(page, `h.dust.length = 0; s.onTap();`);
  await step(page, 2);
  const dust = await hb(page, `return h.dust.length;`);
  expect(dust).toBeGreaterThanOrEqual(3);
  await step(page, 60);
  expect(await hb(page, `return h.dust.length;`)).toBeGreaterThan(0); // still there after 1 s
  await step(page, 60);
  expect(await hb(page, `return h.dust.length;`)).toBe(0);
  expect(log.errors).toEqual([]);
});

test("PEACOCK: Full Display behind gameplay, Feather Growth stages, victory pose", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await flyAsDawson(page, { stats: { ...SAVE.stats, dawsonRuns: 0 } });
  await step(page, 30);
  // Feather Growth: five tail stages (1 at first … 5 after 60 runs with him)
  const keys = [];
  for (const n of [0, 5, 15, 30, 60, 500]) {
    await hb(page, `window.__glySave.data.stats.dawsonRuns = arg; r.setCosmetics(r.cos);`, n);
    keys.push(await hb(page, `return r.sprite.texture.key.slice(-2);`));
  }
  expect(keys).toEqual(["_1", "_2", "_3", "_4", "_5", "_5"]);
  // Full Display + victory pose on a new best: the fan sits behind everything, gone after 1 s
  await hb(page, `r.onBest();`);
  await step(page, 6);
  const fan = await hb(page, `return { vis: h.fan.visible, depth: h.fan.depth, frame: r.sprite.frame.name, pose: r.poseKind, angle: r.sprite.angle };`);
  expect(fan.vis).toBe(true);
  expect(fan.depth).toBeLessThan(1);
  expect(fan.frame).toBe("dawson_4"); // tail fully fanned…
  expect(fan.pose).toBe("pose_dawson"); // …spinning in place
  await step(page, 20);
  const mid = await hb(page, `return r.sprite.angle;`);
  expect(mid).not.toBe(fan.angle);
  await step(page, 50);
  expect(await hb(page, `return h.fan.visible;`)).toBe(false);
  // a run with him counts toward the stages
  const runs = await hb(page, `return window.__glySave.data.stats.dawsonRuns;`);
  await hb(page, `window.__glyGod(false); s.die();`);
  await run(page, 2500);
  expect(await page.evaluate(() => window.__glySave.data.stats.dawsonRuns)).toBe(runs + 1);
  expect(log.errors).toEqual([]);
});

test("SKINS: four in the shop's SKINS tab, Abyss Dawson on Drift Pass+ tier 44; each its own look", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__glydrift;
    const { getCosmetic, forSale } = window.__glyShop || {};
    return {
      tex: ["dskin_greatwhite", "dskin_hammerhead", "dskin_neonreef", "dskin_monarch", "dskin_abyss"].map((id) =>
        g.textures.exists(`hero_dawson_${id}`),
      ),
      track: window.__glyPlusS1.plusTrackS1({ banner: "crimson" })[43],
      layout: window.__glyPlusS1.layout,
      has: !!getCosmetic,
      sale: getCosmetic
        ? ["dskin_greatwhite", "dskin_hammerhead", "dskin_neonreef", "dskin_monarch", "dskin_abyss"].map((id) => forSale(getCosmetic(id)))
        : null,
    };
  });
  expect(r.tex).toEqual([true, true, true, true, true]);
  expect(r.track).toMatchObject({ item: "dskin_abyss" });
  expect(r.layout).toBe(3);
  if (r.has) expect(r.sale).toEqual([true, true, true, true, false]);
  // the shop's SKINS tab lists his four (previewed on DAWSON)
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Shop", { tab: "skin" }));
  await settle(page, "Shop", 1200);
  const shop = await page.evaluate(() => {
    const sh = window.__glydrift.scene.getScene("Shop");
    return sh.offersFor("skin").map((o) => o.id);
  });
  for (const id of ["dskin_greatwhite", "dskin_hammerhead", "dskin_neonreef", "dskin_monarch"]) expect(shop).toContain(id);
  expect(shop).not.toContain("dskin_abyss");
  // a claim made on tier 44 under layout 2 (the shards) frees the tier for Abyss Dawson
  const moved = await page.evaluate(() => {
    const rec = window.__glyPlusS1.record("s1");
    rec.plusClaimed = { 0: true, 43: true, 44: true };
    rec.plusLayout = 2;
    const again = window.__glyPlusS1.record("s1");
    return { layout: again.plusLayout, claimed: Object.keys(again.plusClaimed).map(Number).sort((a, b) => a - b) };
  });
  expect(moved).toEqual({ layout: 3, claimed: [0, 44] });
  expect(log.errors).toEqual([]);
});

for (const skin of ["dskin_greatwhite", "dskin_hammerhead", "dskin_neonreef", "dskin_monarch", "dskin_abyss"])
  test(`skin ${skin}: worn in game (own look, standard hitbox), only on DAWSON`, async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    test.skip(skin !== "dskin_monarch" && skin !== "dskin_abyss" && testInfo.project.name.startsWith("webkit"), "two skins on WebKit");
    const plus = skin === "dskin_abyss" ? { passPlus: { s1: { verified: true } } } : {};
    const log = await flyAsDawson(page, {
      cos: { owned: { [skin]: true }, equipped: { dskin: skin } },
      ...plus,
    });
    await step(page, 20);
    const r = await hb(
      page,
      `return { key: r.sprite.texture.key, radius: s.player.radius, glow: h.bodyGlow.visible, eye: h.eyeGlow.visible };`,
    );
    expect(r.key).toContain(skin);
    expect(r.radius).toBeGreaterThan(0);
    if (skin === "dskin_neonreef") expect(r.glow).toBe(true);
    if (skin === "dskin_abyss") expect(r.eye).toBe(true); // red glowing eyes
    expect(log.errors).toEqual([]);
  });

test("Abyss Dawson needs Season 1's Drift Pass+; without it he wears his classic look", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAsDawson(page, { cos: { owned: { dskin_abyss: true }, equipped: { dskin: "dskin_abyss" } } });
  await step(page, 10);
  expect(await hb(page, `return r.sprite.texture.key;`)).toContain("classic");
  expect(log.errors).toEqual([]);
});

test("TITLES: Show-Off (10 new bests with DAWSON) and Apex (reach the Abyss with him)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await flyAsDawson(page, { stats: { ...SAVE.stats, dawsonBests: 9, dawsonAbyss: 0 }, best: 0 });
  await step(page, 60);
  // this run beats the best and reaches the Abyss
  await hb(page, `s.run.abyssM = 50; window.__glyGod(false); s.die();`);
  await run(page, 3000);
  const t = await page.evaluate(() => ({
    st: window.__glySave.data.stats,
    owned: window.__glySave.data.titles?.owned || {},
  }));
  expect(t.st.dawsonBests).toBe(10);
  expect(t.st.dawsonAbyss).toBe(1);
  expect(t.owned.h_showoff).toBe(true);
  expect(t.owned.h_apex).toBe(true);
  expect(log.errors).toEqual([]);
});

test("MENUS: the strut on the hero screen, the cocoon reveal, the twirl and bow on game over", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  test.setTimeout(240_000);
  const log = await openGame(page, { save: { ...SAVE, unlocked: { volt: true, dawson: true }, selected: "dawson" } });
  await page.evaluate(() => {
    window.__glydrift.registry.set("heroFocus", "dawson");
    window.__glydrift.scene.getScene("Menu").scene.start("Characters");
  });
  await settle(page, "Characters", 1500);
  // strut: back and forth, turning to face the way he walks
  const xs = [];
  const faces = new Set();
  for (let i = 0; i < 16; i++) {
    await run(page, 250);
    const s = await page.evaluate(() => {
      const sp = window.__glydrift.scene.getScene("Characters").rig.sprite;
      return { x: sp.x, f: Math.sign(sp.scaleX) };
    });
    xs.push(s.x);
    faces.add(s.f);
  }
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(60);
  expect(faces.size).toBe(2);
  // the cocoon reveal: a cocoon first, then he hatches with his tail fanned
  const seen = [];
  await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Characters");
    window.__reveal = window.__glyReveal.revealHero(c, window.__heroDefs.find((d) => d.id === "dawson"));
  });
  for (const ms of [700, 1100, 1450, 1700]) {
    await run(page, ms - (seen.length ? [700, 1100, 1450, 1700][seen.length - 1] : 0));
    seen.push(
      await page.evaluate(() => {
        const c = window.__glydrift.scene.getScene("Characters");
        const imgs = c.children.list.filter((o) => o.type === "Container").flatMap((o) => o.list).filter((o) => o.type === "Image" && o.visible && o.alpha > 0.5);
        return imgs.map((o) => o.texture.key).filter((k) => k.startsWith("dawson_cocoon") || k.startsWith("hero_dawson"));
      }),
    );
  }
  expect(seen[0]).toContain("dawson_cocoon");
  expect(seen[1]).toContain("dawson_cocoon_crack");
  expect(seen[2]).toContain("hero_dawson_1"); // wings unfold
  expect(seen[3]).toContain("hero_dawson"); // the tail fans open
  await run(page, 3000);
  // game over: a twirl and a bow beside the header
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.stop("Characters");
    g.scene.start("Game", { mode: "normal" });
  });
  await settle(page, "Game", 800);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  await page.evaluate(() => {
    window.__glyGod?.(false);
    window.__glydrift.scene.getScene("Game").die();
  });
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
  const sx = [];
  const ang = [];
  for (let i = 0; i < 12; i++) {
    await run(page, 80);
    const f = await page.evaluate(() => {
      const im = window.__glydrift.scene.getScene("GameOver").dawsonFig;
      return im ? { sx: im.scaleX, a: im.angle } : null;
    });
    expect(f).not.toBe(null);
    sx.push(f.sx);
    ang.push(f.a);
  }
  expect(Math.min(...sx)).toBeLessThan(0); // the twirl turns him all the way round
  expect(Math.max(...ang)).toBeGreaterThan(15); // and he bows
  expect(log.errors).toEqual([]);
});

test("Low Graphics: two butterflies and less dust; Reduce Flashing: softer Full Display", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAsDawson(page, {
    settings: { ...SAVE.settings, lowGfx: true, reduceFlash: true },
  });
  await step(page, 20);
  const r = await hb(page, `return { low: r.lowGfx, n: h.bflies.length };`);
  if (r.low) {
    expect(r.n).toBe(2);
    await hb(page, `h.dust.length = 0; s.onTap();`);
    await step(page, 1);
    expect(await hb(page, `return h.dust.length;`)).toBe(1);
  }
  // Reduce Flashing: the display's feathers are drawn fainter and without the shimmer
  await hb(page, `r.onBest();`);
  await step(page, 20);
  const peak = await hb(page, `return h.fanPeak;`);
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(0.22); // (0.57 without Reduce Flashing)
  expect(log.errors).toEqual([]);
});
