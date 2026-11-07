// JAMAL (legendary): the lovably ugly little white dog. Cosmetic only; strange noises on every
// flap (never the same twice in a row, pitched by speed and combo, On / Quieter / Off), his
// moves, the "Die 50 times" challenge, hats, and the portrait used by the share card and boards.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle } from "./helpers.js";

const phoneOnly = (testInfo) => test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

async function flyAsJamal(page, extraSave = {}) {
  const log = await openGame(page, {
    flags: ["god", "character=jamal"],
    save: { ...SAVE, unlocked: { volt: true, jamal: true }, selected: "jamal", ...extraSave },
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}

test("JAMAL: a legendary, cosmetic-only hero (standard hitbox and speed)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAsJamal(page);
  const r = await page.evaluate(() => {
    const def = window.__heroDefs.find((c) => c.id === "jamal");
    const volt = window.__heroDefs.find((c) => c.id === "volt");
    const s = window.__glydrift.scene.getScene("Game");
    return {
      hero: s.charDef.id,
      rarity: def.rarity,
      cost: def.cost,
      challenge: def.challenge,
      desc: def.desc,
      speed: def.speed ?? 1,
      perks: def.perks ?? null,
      coinMul: def.coinMul ?? 1,
      voltSpeed: volt.speed ?? 1,
      radius: s.player.radius,
      frames: def.pixel.frames.every((f) => window.__glydrift.textures.get("pxc").has(f)),
      portrait: window.__glydrift.textures.exists("hero_jamal"),
    };
  });
  expect(r.hero).toBe("jamal");
  expect(r.rarity).toBe("legendary");
  expect(r.cost).toBe(12000);
  expect(r.challenge).toEqual({ stat: "deaths", value: 50, text: "Die 50 times" });
  expect(r.desc).toBe("Ugly. Loud. Loved.");
  expect(r.speed).toBe(r.voltSpeed);
  expect(r.perks).toBe(null);
  expect(r.coinMul).toBe(1);
  expect(r.frames).toBe(true);
  // (the share card and leaderboard rows draw every hero from its hero_<id> portrait)
  expect(r.portrait).toBe(true);
  const volt = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    return s.player.radius;
  });
  expect(r.radius).toBe(volt); // the standard hitbox
  expect(log.errors).toEqual([]);
});

test("JAMAL's noises: 12+ of them, never the same twice in a row, pitched by speed and combo", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const { Sfx, jamalCount } = window.__glySfx;
    const data = window.__glySave.data;
    const pick = (n, ctx) => Array.from({ length: n }, () => Sfx.flap("jamal", ctx));
    data.settings.jamalNoise = "on";
    const slow = pick(300, { speed: 0, combo: 1 });
    const fast = pick(300, { speed: 1, combo: 10 });
    data.settings.jamalNoise = "quiet";
    const quiet = pick(20, {});
    data.settings.jamalNoise = "off";
    const off = pick(5, {});
    data.settings.jamalNoise = "on";
    const all = slow.concat(fast);
    let repeats = 0;
    for (let i = 1; i < all.length; i++) if (all[i].i === all[i - 1].i) repeats++;
    const avg = (a) => a.reduce((x, y) => x + y.p, 0) / a.length;
    return {
      count: jamalCount,
      distinct: new Set(all.map((x) => x.i)).size,
      repeats,
      pitches: new Set(slow.map((x) => x.p.toFixed(3))).size,
      slowAvg: avg(slow),
      fastAvg: avg(fast),
      on: slow[0].v,
      quiet: quiet.every((x) => x.v === 0.4),
      off: off.every((x) => x === null),
    };
  });
  expect(r.count).toBeGreaterThanOrEqual(12);
  expect(r.distinct).toBe(r.count); // every noise gets heard
  expect(r.repeats).toBe(0);
  expect(r.pitches).toBeGreaterThan(50); // a slight random pitch every time
  expect(r.fastAvg).toBeGreaterThan(r.slowAvg * 1.15); // higher with speed and combo
  expect(r.on).toBe(1);
  expect(r.quiet).toBe(true);
  expect(r.off).toBe(true);
  expect(log.errors).toEqual([]);
});

test("JAMAL noises setting on his hero page: On → Quieter → Off → On", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await openGame(page, { save: { ...SAVE, unlocked: { volt: true, jamal: true }, selected: "jamal" } });
  await page.evaluate(() => {
    window.__glydrift.registry.set("heroFocus", "jamal");
    window.__glydrift.scene.getScene("Menu").scene.start("Characters");
  });
  await settle(page, "Characters", 1500);
  const { locate } = await import("./helpers.js");
  const seen = [];
  for (const label of ["JAMAL NOISES: ON", "JAMAL NOISES: QUIETER", "JAMAL NOISES: OFF"]) {
    await press(page, await locate(page, label));
    await run(page, 300);
    seen.push(await page.evaluate(() => window.__glySave.data.settings.jamalNoise));
  }
  expect(seen).toEqual(["quiet", "off", "on"]);
  // the button is his alone
  await page.evaluate(() => window.__glydrift.scene.getScene("Characters").select(0));
  await run(page, 600);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Characters").noiseBtn.visible)).toBe(
    await page.evaluate(() => window.__glydrift.scene.getScene("Characters").roster[0].id === "jamal"),
  );
  expect(log.errors).toEqual([]);
});

test("JAMAL's moves: scrunch flap, propeller glide, huge eye, zoomies, the flop; back after RETRY", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAsJamal(page);
  const step = (n) =>
    page.evaluate((n) => {
      const s = window.__glydrift.scene.getScene("Game");
      for (let i = 0; i < n; i++) {
        s.player.y = s.H * 0.45;
        s.player.vy = 0;
        s.__t = (s.__t || 1e6) + 1000 / 60;
        s.stepFrame(s.__t, 1000 / 60);
      }
    }, n);
  const look = () =>
    page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      const rig = s.player.rig;
      return { frame: rig.sprite.frame.name, x: rig.sprite.x, y: rig.sprite.y, px: s.player.x, visible: rig.sprite.visible };
    });
  await step(30);
  // the glide: two frames (tongue + propeller tail) alternate
  const glide = new Set();
  for (let i = 0; i < 12; i++) {
    await step(3);
    glide.add((await look()).frame);
  }
  expect([...glide].sort()).toEqual(["jamal_0", "jamal_8"]);
  // flap: scrunched (frame 1)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  await step(2);
  expect((await look()).frame).toBe("jamal_1");
  await step(30);
  // near-miss: the eye goes huge, tufts straight up (frame 2)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onNear());
  await step(2);
  expect((await look()).frame).toBe("jamal_2");
  await step(40);
  // new best: zoomies (the picture runs a little circle; the hitbox stays put)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onBest());
  const xs = [];
  for (let i = 0; i < 8; i++) {
    await step(8);
    const l = await look();
    xs.push(Math.round(l.x - l.px));
  }
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
  await step(60);
  // death: the flop with X eyes (frame 7), then he drops away
  await page.evaluate(() => {
    window.__glyGod(false);
    window.__glydrift.scene.getScene("Game").die();
  });
  // (deaths play in slow motion: the shock first, then the flop)
  let flop = false;
  for (let i = 0; i < 30 && !flop; i++) {
    await step(6);
    flop = (await look()).frame === "jamal_7";
  }
  expect(flop).toBe(true);
  // RETRY: back on his paws, visible, gliding
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    for (let i = 0; i < 200 && !window.__glydrift.scene.isActive("GameOver"); i++) {
      s.__t += 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
  });
  await run(page, 800);
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await step(20);
  const back = await look();
  expect(back.visible).toBe(true);
  expect(["jamal_0", "jamal_8", "jamal_1"]).toContain(back.frame);
  expect(log.errors).toEqual([]);
});

test("JAMAL unlocks after dying 50 times (older saves count their earlier runs)", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAsJamal(page, {
    unlocked: { volt: true },
    selected: "volt",
    stats: { runs: 49, deaths: 49 },
  });
  await page.evaluate(() => {
    window.__glyGod(false);
    window.__glydrift.scene.getScene("Game").die();
  });
  await run(page, 2500);
  const r = await page.evaluate(() => {
    const d = window.__glySave.data;
    return { deaths: d.stats.deaths, owned: !!d.unlocked.jamal };
  });
  expect(r.deaths).toBe(50);
  expect(r.owned).toBe(true);
  // an older save with no death count: its runs count
  const legacy = await page.evaluate(() => {
    const d = window.__glySave.data;
    delete d.stats.deaths;
    d.stats.runs = 70;
    return window.__glyHeroes.Progression.statOf("deaths");
  });
  expect(legacy).toBe(70);
  expect(log.errors).toEqual([]);
});

test("shop hats sit on JAMAL's head between his tufts", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAsJamal(page, { cos: { owned: { hat_horns: true }, equipped: { hat: "hat_horns" } } });
  await run(page, 300);
  const r = await page.evaluate(() => {
    const rig = window.__glydrift.scene.getScene("Game").player.rig;
    const sp = rig.sprite;
    const h = rig.hat;
    return {
      visible: h.visible,
      dx: (h.x - sp.x) / Math.abs(sp.displayWidth),
      dy: (h.y - sp.y) / Math.abs(sp.displayHeight),
    };
  });
  expect(r.visible).toBe(true);
  // the hat's base is on the top of his head: right of centre (his head), above the middle
  expect(r.dx).toBeGreaterThan(0);
  expect(r.dx).toBeLessThan(0.25);
  expect(r.dy).toBeLessThan(-0.15);
  expect(r.dy).toBeGreaterThan(-0.4);
  expect(log.errors).toEqual([]);
});
