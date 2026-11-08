// DAWSON (legendary shark / butterfly / peacock) and DEWBERRY (epic glowing berry). Cosmetic
// only: standard hitbox and speed. Their moves (flap, near-miss, new best, death), DEWBERRY's
// glow (brighter in the Abyss, flaring on a near-miss, steady on Low Graphics, gentler with
// Reduce Flashing), the challenge unlocks, hats, and the portraits used by the share card.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle } from "./helpers.js";

const phoneOnly = (testInfo) => test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");

async function flyAs(page, id, extraSave = {}, flags = []) {
  const log = await openGame(page, {
    flags: ["god", `character=${id}`, ...flags],
    save: { ...SAVE, unlocked: { volt: true, [id]: true }, selected: id, ...extraSave },
  });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 800);
  await reseed(page);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  return log;
}

/** Step the game n frames with the hero held mid-screen. */
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

const look = (page) =>
  page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const rig = s.player.rig;
    const glow = rig.hb?.glow;
    return {
      frame: rig.sprite.frame.name,
      visible: rig.sprite.visible,
      angle: rig.sprite.angle,
      glow: glow ? { a: glow.alpha, s: glow.scaleX, v: glow.visible } : null,
    };
  });

const HEROES = [
  {
    id: "dawson",
    rarity: "legendary",
    cost: 12000,
    challenge: { stat: "maxNearRun", value: 25, text: "Get 25 near-misses in one run" },
    desc: "Part shark. Part butterfly. All show-off.",
    frames: 6,
  },
  {
    id: "dewberry",
    rarity: "epic",
    cost: 4000,
    challenge: { stat: "coins", value: 500, text: "Collect 500 coins total" },
    desc: "Small, sweet, and glowing.",
    frames: 5,
  },
];

for (const h of HEROES) {
  test(`${h.id.toUpperCase()}: ${h.rarity}, cosmetic only (standard hitbox and speed), portrait ready`, async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    const log = await flyAs(page, h.id);
    const r = await page.evaluate((id) => {
      const def = window.__heroDefs.find((c) => c.id === id);
      const volt = window.__heroDefs.find((c) => c.id === "volt");
      const s = window.__glydrift.scene.getScene("Game");
      return {
        hero: s.charDef.id,
        rarity: def.rarity,
        cost: def.cost,
        challenge: def.challenge,
        desc: def.desc,
        speed: def.speed ?? 1,
        voltSpeed: volt.speed ?? 1,
        perks: def.perks ?? null,
        coinMul: def.coinMul ?? 1,
        nFrames: def.pixel.frames.length,
        frames: def.pixel.frames.every((f) => window.__glydrift.textures.get("pxc").has(f)),
        portrait: window.__glydrift.textures.exists(`hero_${id}`),
        radius: s.player.radius,
      };
    }, h.id);
    expect(r.hero).toBe(h.id);
    expect(r.rarity).toBe(h.rarity);
    expect(r.cost).toBe(h.cost);
    expect(r.challenge).toEqual(h.challenge);
    expect(r.desc).toBe(h.desc);
    expect(r.speed).toBe(r.voltSpeed);
    expect(r.perks).toBe(null);
    expect(r.coinMul).toBe(1);
    expect(r.nFrames).toBe(h.frames);
    expect(r.frames).toBe(true);
    expect(r.portrait).toBe(true); // (the share card and leaderboard rows use hero_<id>)
    // the standard hitbox: the same as VOLT's
    const page2 = await page.context().newPage();
    await openGame(page2, { flags: ["god"] });
    await page2.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
    await settle(page2, "Game", 800);
    const voltRadius = await page2.evaluate(() => window.__glydrift.scene.getScene("Game").player.radius);
    await page2.close();
    expect(r.radius).toBe(voltRadius);
    expect(log.errors).toEqual([]);
  });

  test(`${h.id.toUpperCase()} unlocks with "${h.challenge.text}"`, async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    const log = await flyAs(page, h.id, { unlocked: { volt: true }, selected: "volt" });
    const r = await page.evaluate(
      ({ id, stat, value }) => {
        const { Progression } = window.__glyHeroes;
        const d = window.__glySave.data;
        d.stats[stat] = value - 1;
        Progression.checkChallengeUnlocks();
        const before = !!d.unlocked[id];
        d.stats[stat] = value;
        Progression.checkChallengeUnlocks();
        return { before, after: !!d.unlocked[id] };
      },
      { id: h.id, ...h.challenge },
    );
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
    expect(log.errors).toEqual([]);
  });

  test(`shop hats sit on ${h.id.toUpperCase()}'s head`, async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    const log = await flyAs(page, h.id, { cos: { owned: { hat_horns: true }, equipped: { hat: "hat_horns" } } });
    await step(page, 20);
    const r = await page.evaluate(() => {
      const rig = window.__glydrift.scene.getScene("Game").player.rig;
      const sp = rig.sprite;
      const hat = rig.hat;
      return {
        visible: hat.visible,
        dx: (hat.x - sp.x) / Math.abs(sp.displayWidth),
        dy: (hat.y - sp.y) / Math.abs(sp.displayHeight),
      };
    });
    expect(r.visible).toBe(true);
    expect(Math.abs(r.dx)).toBeLessThan(0.3);
    expect(r.dy).toBeLessThan(-0.05); // above the middle, on top of the head
    expect(r.dy).toBeGreaterThan(-0.45);
    expect(log.errors).toEqual([]);
  });
}

test("DAWSON's moves: wing flutter, tail flash, rainbow fan, shatter and spin; back after RETRY", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAs(page, "dawson");
  await step(page, 30);
  expect((await look(page)).frame).toMatch(/^dawson_[01]$/);
  // flap: the wings flutter (up / down frames)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  const flap = new Set();
  for (let i = 0; i < 6; i++) {
    await step(page, 1);
    flap.add((await look(page)).frame);
  }
  expect(flap.has("dawson_1") || flap.has("dawson_2")).toBe(true);
  await step(page, 40);
  // near-miss: the tail flash (frame 3)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onNear());
  await step(page, 2);
  expect((await look(page)).frame).toBe("dawson_3");
  await step(page, 60);
  // new best: the full rainbow fan (frame 4)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onBest());
  await step(page, 3);
  expect((await look(page)).frame).toBe("dawson_4");
  await step(page, 200);
  // death: wings shatter (frame 5) and he spins away
  await page.evaluate(() => {
    window.__glyGod(false);
    window.__glydrift.scene.getScene("Game").die();
  });
  await step(page, 20);
  const dead = await look(page);
  expect(dead.frame).toBe("dawson_5");
  await step(page, 10);
  expect((await look(page)).angle).not.toBe(dead.angle);
  // RETRY: whole again
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
  const back = await look(page);
  expect(back.visible).toBe(true);
  expect(["dawson_0", "dawson_1", "dawson_2"]).toContain(back.frame);
  expect(log.errors).toEqual([]);
});

test("DEWBERRY's moves: squish and spin, wide eyes + glow flare, delighted, the pop; back after RETRY", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAs(page, "dewberry");
  await step(page, 30);
  const calm = await look(page);
  expect(calm.frame).toBe("dewberry_0");
  expect(calm.glow.v).toBe(true);
  // flap: squish then stretch (the leaf turns)
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").onTap());
  const flap = new Set();
  for (let i = 0; i < 8; i++) {
    await step(page, 1);
    flap.add((await look(page)).frame);
  }
  expect(flap.has("dewberry_1")).toBe(true);
  await step(page, 40);
  // near-miss: wide eyes and the glow flares
  const before = await look(page);
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onNear());
  await step(page, 2);
  const near = await look(page);
  expect(near.frame).toBe("dewberry_3");
  expect(near.glow.a).toBeGreaterThan(before.glow.a + 0.1);
  await step(page, 90);
  // new best: delighted face, the glow bursts
  await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onBest());
  await step(page, 3);
  const best = await look(page);
  expect(best.frame).toBe("dewberry_4");
  expect(best.glow.s).toBeGreaterThan(calm.glow.s);
  await step(page, 200);
  // death: popped (the berry is gone), the glow fades after
  await page.evaluate(() => {
    window.__glyGod(false);
    window.__glydrift.scene.getScene("Game").die();
  });
  await step(page, 4);
  expect((await look(page)).visible).toBe(false);
  const drops = await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.fx.emitters.goo.getAliveParticleCount());
  expect(drops).toBeGreaterThan(5);
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
  const back = await look(page);
  expect(back.visible).toBe(true);
  expect(back.glow.v).toBe(true);
  expect(log.errors).toEqual([]);
});

test("DEWBERRY glows brighter in the Abyss; steady on Low Graphics; gentler with Reduce Flashing", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  const log = await flyAs(page, "dewberry");
  await step(page, 10);
  const glowAt = async (zone) => {
    // (the scene works out its realm every frame: pin it for this check)
    await page.evaluate((z) => {
      const s = window.__glydrift.scene.getScene("Game");
      Object.defineProperty(s, "zoneId", { configurable: true, get: () => z, set: () => {} });
    }, zone);
    const a = [];
    for (let i = 0; i < 12; i++) {
      await step(page, 5);
      a.push((await look(page)).glow.a);
    }
    return a;
  };
  const normal = await glowAt(null);
  const abyss = await glowAt("abyss");
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  expect(avg(abyss)).toBeGreaterThan(avg(normal) + 0.1);
  expect(avg(abyss)).toBeGreaterThan(0.45);
  // the glow pulses slowly
  expect(Math.max(...normal) - Math.min(...normal)).toBeGreaterThan(0.02);
  // Low Graphics: a steady glow
  await page.evaluate(() => (window.__glydrift.scene.getScene("Game").player.rig.lowGfx = true));
  const low = await glowAt(null);
  expect(Math.max(...low) - Math.min(...low)).toBeLessThan(0.005);
  // Reduce Flashing: a smaller flare on a near-miss
  const flare = async () => {
    await step(page, 120);
    const b = (await look(page)).glow.a;
    await page.evaluate(() => window.__glydrift.scene.getScene("Game").player.rig.onNear());
    await step(page, 1);
    return (await look(page)).glow.a - b;
  };
  const full = await flare();
  await page.evaluate(() => (window.__glySave.data.settings.reduceFlash = true));
  const soft = await flare();
  expect(soft).toBeLessThan(full);
  expect(log.errors).toEqual([]);
});

test("the test flags ?character=dawson / dewberry fly as them", async ({ page }, testInfo) => {
  phoneOnly(testInfo);
  for (const id of ["dawson", "dewberry"]) {
    const log = await openGame(page, { flags: ["god", `character=${id}`] });
    await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
    await settle(page, "Game", 800);
    expect(await page.evaluate(() => window.__glydrift.scene.getScene("Game").charDef.id)).toBe(id);
    expect(log.errors).toEqual([]);
  }
});
