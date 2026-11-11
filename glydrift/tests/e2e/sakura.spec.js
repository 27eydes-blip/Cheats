// SAKURA SKIES: the second realm of an endless run (Neon Void → Sakura Skies → Solar Storm …).
// What these check is the realm's place in the game, not its hazards, art or music (those have
// their own tests): the endless order and distances, the speed held still across it (so every
// realm after it plays exactly as before), level mode untouched, old saves kept exactly as they
// were (nothing lost, nothing gained by mistake), its discovered flag / achievement / mission,
// the Stats page and the cloud-save merge.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle, tap } from "./helpers.js";

const ORDER = ["void", "sakura", "solar", "frozen", "glitch", "abyss", "valley", "hurricane"];

async function startRun(page) {
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await reseed(page);
  await run(page, 600);
  await press(page, await fieldPoint(page)); // the first tap launches the run
  await run(page, 200);
}

/** Fly (god mode, logic only) to `toM` real metres; reports what happened on the way. */
const flyTo = (page, toM) =>
  page.evaluate((toM) => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    const hud = g.scene.getScene("Hud");
    const w = (window.__sk ||= { bounds: [], speedUps: [], titles: [], speed: [], sakuraAt: null });
    if (!w.hooked) {
      w.hooked = true;
      const up = hud.onSpeedUp.bind(hud);
      hud.onSpeedUp = () => (w.speedUps.push(Math.round(s.meters)), up());
      const bi = hud.onBiome.bind(hud);
      hud.onBiome = (i, o) => (w.titles.push(i), bi(i, o));
    }
    for (let i = 0; i < 60 * 60 * 10 && s.meters < toM && s.state === "playing"; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      s.__t = (s.__t || 1e6) + 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
      const seg = s.course.segAt(s.meters);
      if (w.bounds.at(-1)?.id !== seg.id) w.bounds.push({ id: seg.id, m: Math.round(s.meters) });
      if (w.sakuraAt === null && window.__glySave.data.realms?.sakura) w.sakuraAt = Math.round(s.meters);
      // the world speed without hero / boost multipliers (realm multipliers ease in and out)
      if (i % 30 === 0 && s.boostMul === 1)
        w.speed.push({ m: Math.round(s.meters), v: s.speed / ((s.charDef.speed ?? 1) * s.boostMul), mul: s.speedMul });
    }
    return { m: s.meters, state: s.state, sakura: s.run.sakura || 0, ...w };
  }, toM);

/** End the run with a crash and wait for the results screen. */
async function crash(page) {
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    window.__glyGod(false);
    s.die();
    for (let i = 0; i < 600 && !window.__glydrift.scene.isActive("GameOver"); i++) {
      s.__t += 1000 / 60;
      s.stepFrame(s.__t, 1000 / 60);
    }
    window.__glyGod(true);
  });
  await settle(page, "GameOver", 300);
}

test("Sakura Skies is the second realm: order, distances, title, and the run flies through it @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  const course = await page.evaluate(() =>
    window.__glydrift.scene
      .getScene("Game")
      .course.segs.filter((g) => !g.dimension)
      .map((g) => ({ id: g.id, start: g.start, end: g.end, biome: g.biome })),
  );
  expect(course.map((g) => g.id)).toEqual(ORDER);
  // every older realm keeps its BIOMES index (saves store them); Sakura Skies was appended
  expect(course.map((g) => g.biome)).toEqual([0, 11, 1, 2, 3, 4, 5, 6]);
  // 500 m each from 0 (the Abyss at 2500–3000 m, Hurricane at 3500 m, its rift 400 m in)
  course.forEach((g, i) => expect(g.start, g.id).toBe(i * 500));
  expect(course.at(-1).end).toBe(3900);

  const r = await flyTo(page, 1150);
  expect(r.state).toBe("playing");
  expect(r.bounds.map((b) => b.id)).toEqual(["void", "sakura", "solar"]);
  expect(r.bounds[1].m).toBeGreaterThanOrEqual(498);
  expect(r.bounds[1].m).toBeLessThanOrEqual(505);
  // entering it marks it discovered (and the run counts it, for the mission)
  expect(r.sakura).toBe(1);
  expect(r.sakuraAt).toBeGreaterThan(400);
  expect(r.sakuraAt).toBeLessThan(560);
  // its title showed (the HUD gets the realm's BIOMES index), and Solar's after it
  const ids = await page.evaluate(
    (t) => t.map((i) => window.__glydrift.scene.getScene("Game").course.segs.find((g) => g.biome === i)?.id),
    r.titles,
  );
  expect(ids).toEqual(expect.arrayContaining(["sakura", "solar"]));
  expect(ids.indexOf("sakura")).toBeLessThan(ids.indexOf("solar"));
  expect(log.errors).toEqual([]);
});

test("Sakura Skies holds the pace: end-of-Neon-Void speed, no SPEED UP, and Solar Storm plays as before @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"] });
  await startRun(page);
  // the curves: pace metres stop at 500 across Sakura Skies, then carry on; every realm after
  // it sees exactly the speed it saw at its old distance (a level's one-realm course has the
  // untouched curve: speedForMeters)
  const curve = await page.evaluate(() => {
    const c = window.__glydrift.scene.getScene("Game").course;
    const raw = new c.constructor(() => 0.5, null, "solar");
    const pace = [0, 250, 500, 501, 750, 999, 1000, 1250, 1500, 3000, 4000].map((m) => c.pace(m));
    const held = [500, 600, 800, 999, 1000].map((m) => c.speedAt(m));
    // every realm after Sakura: its real distance m plays at the old curve's m - 500
    const after = [1000, 1100, 1250, 1499, 1500, 2000, 2500, 3000, 3500, 3900, 4500, 8000].map(
      (m) => +(c.speedAt(m) - raw.speedAt(m - 500)).toFixed(6),
    );
    const before = [0, 100, 250, 499, 500].map((m) => +(c.speedAt(m) - raw.speedAt(m)).toFixed(6));
    return { pace, held, after, before, void: raw.speedAt(500), level: [0, 800, 3000].map((m) => raw.pace(m)) };
  });
  expect(curve.pace).toEqual([0, 250, 500, 500, 500, 500, 500, 750, 1000, 2500, 3500]);
  for (const v of curve.held) expect(v).toBeCloseTo(curve.void, 6);
  expect(curve.void).toBeGreaterThan(395); // ~407 px/s
  expect(curve.void).toBeLessThan(420);
  expect(curve.after.every((d) => d === 0)).toBe(true);
  expect(curve.before.every((d) => d === 0)).toBe(true);
  expect(curve.level).toEqual([0, 800, 3000]); // (a level's course never holds)

  // and in play: the world speed stays put across Sakura Skies, then climbs again in Solar
  const r = await flyTo(page, 1450);
  expect(r.state).toBe("playing");
  const inSak = r.speed.filter((x) => x.m > 560 && x.m < 990 && Math.abs(x.mul - 1) < 1e-3);
  expect(inSak.length).toBeGreaterThan(10);
  const vs = inSak.map((x) => x.v);
  expect(Math.max(...vs) - Math.min(...vs)).toBeLessThan(1);
  expect(vs[0]).toBeCloseTo(curve.void, 0);
  const solar = r.speed.filter((x) => x.m > 1300 && x.m < 1450);
  expect(Math.min(...solar.map((x) => x.v / x.mul))).toBeGreaterThan(Math.max(...vs) + 3);
  // SPEED UP pulses every 500 m of pace (250, 750 …): none while the speed holds
  expect(r.speedUps.filter((m) => m > 505 && m < 1000)).toEqual([]);
  expect(r.speedUps.some((m) => m >= 1240 && m <= 1265)).toBe(true); // pace 750 m
  expect(log.errors).toEqual([]);
});

test("level mode is untouched: 50 levels, the same five realms, no Sakura Skies @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  const lv = await page.evaluate(() => {
    const L = window.__glyLevels;
    const out = [];
    for (let n = 1; n <= 51; n++) {
      const l = L.getLevel(n);
      out.push(l ? { n: l.n, realm: l.realm, id: l.id, boss: l.boss } : null);
    }
    return { out, names: L.names().length, count: window.__glyLevelCount() };
  });
  expect(lv.count).toBe(50);
  expect(lv.names).toBe(50);
  expect(lv.out[50]).toBe(null); // no level 51
  const realms = ["void", "solar", "frozen", "glitch", "abyss"];
  lv.out.slice(0, 50).forEach((l, i) => {
    expect(l.n).toBe(i + 1);
    expect(l.id).toBe(`lv${String(i + 1).padStart(2, "0")}`);
    expect(l.realm, `level ${i + 1}`).toBe(realms[Math.floor(i / 10)]);
    expect(l.boss).toBe((i + 1) % 10 === 0);
  });
  // a level plays its one realm at its own pace: nothing of Sakura Skies, no held pace
  for (const n of [1, 11, 41]) {
    const r = await page.evaluate((n) => {
      const g = window.__glydrift;
      for (const k of ["LevelComplete", "GameOver", "Hud", "Game"]) g.scene.stop(k);
      g.scene.start("Game", { mode: "level", level: n });
      return true;
    }, n);
    expect(r).toBe(true);
    await run(page, 900);
    const c = await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      return {
        ids: [...new Set(s.course.segs.map((g) => g.id))],
        pace: [0, 700, 1500].map((m) => s.course.pace(m)),
        sakura: !!window.__glySave.data.realms?.sakura,
      };
    });
    expect(c.ids).toEqual([realms[Math.floor((n - 1) / 10)]]);
    expect(c.pace).toEqual([0, 700, 1500]);
    expect(c.sakura).toBe(false);
  }
  expect(log.errors).toEqual([]);
});

// a player from before Sakura Skies: reached the Glitch Realm (maxBiome 3), three realm
// achievements, two "Reach …" missions in progress, and the heroes those realms earned (FROST
// and PENGU: "Reach the Glitch Realm"); GLITCH's "Reach the Abyss" is still to come
const OLD = {
  ...SAVE,
  unlocked: { ...SAVE.unlocked, frost: true, pengu: true },
  best: 4000,
  stats: { runs: 40, totalDistance: 30000, maxDistance: 1900, maxBiome: 3, nearMisses: 50, coins: 300 },
  achievements: { first: 1, close: 1, solar: 1, frozen: 1, glitch: 1 },
  missions: [
    { tpl: "biome", text: "Reach Solar Storm", stat: "biome", scope: "run", target: 1, progress: 0, done: false, reward: { coins: 100, xp: 60 } },
    { tpl: "biome", text: "Reach Abyss", stat: "biome", scope: "run", target: 4, progress: 0, done: false, reward: { coins: 300, xp: 160 } },
    { tpl: "runs", text: "Play 6 runs", stat: "runs", scope: "total", target: 6, progress: 1, done: false, reward: { coins: 200, xp: 110 } },
  ],
};

test("an old save loads with everything kept and nothing gained; reaching Sakura gives Blossom Drifter only @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { flags: ["god"], save: OLD });
  const pick = () =>
    page.evaluate(() => {
      const d = window.__glySave.data;
      return {
        achievements: Object.keys(d.achievements).sort(),
        maxBiome: d.stats.maxBiome,
        missions: d.missions.map((m) => ({ text: m.text, target: m.target, done: m.done })),
        unlocked: Object.keys(d.unlocked).filter((k) => d.unlocked[k]).sort(),
        realms: d.realms,
        best: d.best,
      };
    });
  const loaded = await pick();
  expect(loaded.achievements).toEqual(Object.keys(OLD.achievements).sort());
  expect(loaded.maxBiome).toBe(3);
  expect(loaded.missions.slice(0, 3)).toEqual(OLD.missions.map((m) => ({ text: m.text, target: m.target, done: false })));
  expect(loaded.unlocked).toEqual(Object.keys(OLD.unlocked).sort());
  expect(loaded.unlocked).not.toContain("glitch");
  expect(loaded.realms).toEqual({});
  expect(loaded.best).toBe(4000);
  // the Stats page: the four realms reached, not Sakura Skies (never flown yet)
  const sum0 = await page.evaluate(() => window.__glyStats.statsSummary());
  expect(sum0.realms.filter((x) => x.found).map((x) => x.id)).toEqual(["void", "solar", "frozen", "glitch"]);

  // fly into Sakura Skies and crash there
  await startRun(page);
  const r = await flyTo(page, 760);
  expect(r.bounds.at(-1).id).toBe("sakura");
  // no "Reach Solar Storm" toast for a run that only reached Sakura Skies
  const live = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    return window.__glyHeroes.Progression.liveMissionCheck(s.run, new Set()).map((m) => m.text);
  });
  expect(live).not.toContain("Reach Solar Storm");
  expect(live).not.toContain("Reach Abyss");
  await crash(page);
  const after = await pick();
  expect(after.realms).toEqual({ sakura: true });
  expect(after.achievements).toEqual([...Object.keys(OLD.achievements), "sakura"].sort());
  expect(after.maxBiome).toBe(3); // Sakura is not "further" than the Glitch Realm
  // no "Reach the Abyss" (or any other realm-reach) hero handed out, and nothing lost. (A hero
  // whose challenge the run really met, e.g. THE HADDAD's x10 combo, can unlock: whether the
  // autopilot strings a x10 combo together on the way varies from run to run.)
  expect(after.unlocked).toEqual(expect.arrayContaining(loaded.unlocked));
  const gained = after.unlocked.filter((k) => !loaded.unlocked.includes(k));
  const byRealm = await page.evaluate(() =>
    window.__heroDefs.filter((c) => c.challenge?.stat === "maxBiome").map((c) => c.id),
  );
  expect(gained.filter((k) => byRealm.includes(k))).toEqual([]);
  const texts = after.missions.map((m) => m.text);
  expect(texts).toContain("Reach Solar Storm");
  expect(texts).toContain("Reach Abyss");
  const sum1 = await page.evaluate(() => window.__glyStats.statsSummary());
  expect(sum1.realms.filter((x) => x.found).map((x) => x.id)).toEqual(["void", "sakura", "solar", "frozen", "glitch"]);
  expect(sum1.realmsFound).toBe(5);
  expect(log.errors).toEqual([]);
});

test("missions: Sakura Skies completes its own mission, never Reach Solar Storm @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { save: { ...OLD, stats: { ...OLD.stats, maxBiome: 0 }, achievements: {} } });
  const out = await page.evaluate(() => {
    const { Progression } = window.__glyHeroes;
    const d = window.__glySave.data;
    d.missions.push({ tpl: "sakura", text: "Reach Sakura Skies", stat: "sakura", scope: "run", target: 1, progress: 0, done: false, reward: { coins: 100, xp: 60 } });
    const base = { mode: "normal", score: 900, distance: 800, coins: 3, nearMiss: 0, lasers: 0, saws: 0, portals: 0, bestCombo: 1, runTimeMs: 60000, char: "volt" };
    // (11: Sakura Skies' BIOMES index, checked in the first test; Solar Storm is 1)
    const r1 = Progression.commitRun({ ...base, biome: 11, sakura: 1, killedIn: "sakura" });
    const after1 = { done: r1.missions.map((m) => m.text), maxBiome: d.stats.maxBiome, left: d.missions.map((m) => m.text), ach: Object.keys(d.achievements) };
    const r2 = Progression.commitRun({ ...base, distance: 1200, biome: 1, killedIn: "solar" });
    const after2 = { done: r2.missions.map((m) => m.text), maxBiome: d.stats.maxBiome, ach: Object.keys(d.achievements) };
    return { after1, after2 };
  });
  expect(out.after1.done).toContain("Reach Sakura Skies");
  expect(out.after1.done).not.toContain("Reach Solar Storm");
  expect(out.after1.left).toContain("Reach Solar Storm");
  expect(out.after1.maxBiome).toBe(0);
  expect(out.after1.ach).not.toContain("solar");
  // (Blossom Drifter comes from the discovered flag, set by the game when you get there)
  expect(out.after2.done).toContain("Reach Solar Storm");
  expect(out.after2.maxBiome).toBe(1);
  expect(out.after2.ach).toContain("solar");
  expect(log.errors).toEqual([]);
});

test("Stats lists the realms in run order and counts Sakura Skies once it's found @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, {
    save: {
      ...OLD,
      realms: { sakura: true },
      dimensions: { prism: true },
      stats: { ...OLD.stats, maxBiome: 6, realmDeaths: { sakura: 3, void: 5 } },
    },
  });
  const sum = await page.evaluate(() => window.__glyStats.statsSummary());
  expect(sum.realms.map((x) => x.id)).toEqual([...ORDER, "prism", "tidal", "chrono", "mirror"]);
  expect(sum.realms.filter((x) => x.found).map((x) => x.id)).toEqual([...ORDER, "prism"]);
  expect(sum.realmsFound).toBe(9);
  expect(sum.realmCount).toBe(12);
  expect(sum.realms.find((x) => x.id === "sakura")).toMatchObject({ name: "SAKURA SKIES", deaths: 3 });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Stats"));
  await settle(page, "Stats", 900);
  const v = await page.evaluate(() => {
    const sc = window.__glydrift.scene.getScene("Stats");
    const out = { tiles: {}, deaths: [], text: [] };
    for (const o of sc.list.list) {
      if (o.name?.startsWith("tile:")) out.tiles[o.name.slice(5)] = o.statValue;
      if (o.name?.startsWith("deaths:")) out.deaths.push([o.name.slice(7), o.text]);
      if (o.text) out.text.push(o.text);
    }
    return out;
  });
  expect(v.tiles["REALMS FOUND"]).toBe("9/12");
  expect(v.deaths.map((x) => x[0])).toEqual([...ORDER, "prism", "tidal", "chrono", "mirror"]);
  expect(v.deaths.find((x) => x[0] === "sakura")[1]).toBe("3");
  expect(v.text).toContain("SAKURA SKIES");
  // the order on screen: Neon Void, then Sakura Skies, then Solar Storm
  const at = (t) => v.text.indexOf(t);
  expect(at("NEON VOID")).toBeLessThan(at("SAKURA SKIES"));
  expect(at("SAKURA SKIES")).toBeLessThan(at("SOLAR STORM"));
  // a save without the flag shows it as not found yet ("???")
  const fresh = await page.evaluate(() => {
    const d = window.__glySave.data;
    return window.__glyStats.statsSummary({ ...d, realms: {} }).realms.find((x) => x.id === "sakura").found;
  });
  expect(fresh).toBe(false);
  expect(log.errors).toEqual([]);
});

test("cloud merge keeps Sakura Skies discovered, from either side @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  const m = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const base = JSON.parse(JSON.stringify(window.__glySave.data));
    const rich = { ...base, level: 30, xp: 10, stats: { ...base.stats, runs: 500, maxBiome: 6 }, realms: {}, achievements: { solar: 1 } };
    const poor = { ...base, level: 2, xp: 0, stats: { ...base.stats, runs: 3 }, realms: { sakura: true }, achievements: { sakura: 2 } };
    const old = { ...base, level: 2 };
    delete old.realms; // a cloud copy saved before Sakura Skies existed
    return [
      mergeSaves(rich, poor), // the flag is on the side that loses the "most progress" pick
      mergeSaves(poor, rich),
      mergeSaves(poor, old),
      mergeSaves(old, poor),
    ].map((x) => ({ realms: x.realms, ach: Object.keys(x.achievements || {}).sort() }));
  });
  for (const x of m.slice(0, 2)) {
    expect(x.realms).toEqual({ sakura: true });
    expect(x.ach).toEqual(["sakura", "solar"]);
  }
  for (const x of m.slice(2)) expect(x.realms).toEqual({ sakura: true });
  expect(log.errors).toEqual([]);
});
