// WASP LORD (ILLEGAL LEGENDARY): gameplay, leaderboard and score-check rules.
//  - PHASE: he flies through every wall, pillar and block; lasers, eye beams and zap beams,
//    the ground, the ceiling and leaving the screen still end the run
//  - SPEED ×1.308: every lethal hazard stays avoidable (a god-off autopilot flies every realm
//    and dimension, with lasers, zap beams, mirror lasers and double eye beams forced)
//  - DOUBLE JUMP: a second tap within 0.25 s, once, ready again when he falls
//  - COMBO up to x16 (the flaming red-and-black number)
//  - ILLEGAL tag on every leaderboard row set with him (from the row's stored hero)
//  - score checks: his speed and x16 allowed only on rows whose character is "wasplord"
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, SAVE, settle, tap, waitFor } from "./helpers.js";

const SAVE_ALL = {
  ...SAVE,
  selected: "wasplord",
  unlocked: { volt: true, ember: true, wasplord: true, milzzz: true, splice: true },
};

/** Start an endless run (the first tap launches it). */
async function startRun(page, seed = 4242) {
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await reseed(page, seed);
  await run(page, 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  expect(await page.evaluate(() => window.__glydrift.scene.getScene("Game").state)).toBe("playing");
}

/**
 * Spawn pattern `kind` right in front of him, keep the first hazard of type `type` pinned on him
 * for `frames` frames with him held at its most solid height (so he is inside it whenever it
 * has any solid part), then let it go past. Logic-only stepping, real collisions (god off).
 */
const probe = (page, kind, type, frames = 300) =>
  page.evaluate(
    ({ kind, type, frames }) => {
      const g = window.__glydrift;
      const s = g.scene.getScene("Game");
      const om = s.obstacles;
      const p = s.player;
      const H = s.H;
      window.__T ??= performance.now();
      const step = () => {
        window.__T += 1000 / 60;
        g.step(window.__T, 1000 / 60);
      };
      window.__glyNoRender = true;
      for (const o of om.active) o.kill();
      om.active.length = 0;
      om.nextX = p.x + 260;
      const keep = om.level;
      om.level = { i: 0, beats: [{ kind, d: 0.6, gap: 380 }], onBeat() {} };
      om.spawnPattern(s.course.pace(s.meters), s.zoneId);
      om.level = keep;
      om.nextX = 1e8; // nothing else spawns while we look
      const target = om.active.find((o) => o.type === type);
      if (!target) return { missing: true, types: om.active.map((o) => o.type) };
      for (const o of om.active) if (o !== target) o.kill();
      om.active.length = 0;
      om.active.push(target);
      const calls = [];
      const rig = p.rig;
      rig.phase = (on) => calls.push(on);
      const phased0 = s.run.phased || 0;
      const near0 = s.run.nearMiss;
      const perf0 = s.run.perfects;
      let minC = Infinity;
      let flicker = false;
      let inside = 0;
      for (let i = 0; i < frames && s.state === "playing"; i++) {
        // (just ahead of him after this frame's scroll: hazards that fire as he arrives see
        // him arriving)
        target.x = p.x + 10 + s.scroll / 60;
        let by = H / 2;
        let bc = Infinity;
        for (let y = p.radius + 20; y <= H - p.radius - 20; y += 8) {
          let c = target.clearance(p.x, y, p.radius);
          if (s.mirror) c = Math.min(c, target.clearance(p.x, H - y, p.radius));
          if (c < bc) {
            bc = c;
            by = y;
          }
        }
        p.y = by;
        p.vy = 0;
        step();
        minC = Math.min(minC, target.minClear);
        if (target.inPhase) {
          inside++;
          for (const [obj, a] of target.phaseAlpha || [])
            if (obj.visible && a.out < a.base - 0.05) flicker = true;
        }
      }
      const dead = s.state !== "playing";
      // let it go past: he is clear of it, its art is back to normal
      if (!dead) {
        target.x = p.x - 900;
        p.y = H / 2;
        p.vy = 0;
        step();
        step();
      }
      delete rig.phase;
      const restored = !target.phaseAlpha;
      window.__glyNoRender = false;
      return {
        type,
        dead,
        killedBy: dead ? s.run.killedBy : null,
        minC: Math.round(minC),
        inside,
        flicker,
        restored,
        calls,
        phased: (s.run.phased || 0) - phased0,
        near: s.run.nearMiss - near0,
        perfects: s.run.perfects - perf0,
      };
    },
    { kind, type, frames },
  );

// every hazard type, by the realm it lives in (fields, flip zones and portals are harmless for
// everyone: they have no solid part). [pattern, its hazard type]
const REALMS = {
  void: { phase: [["saw", "saw"], ["gate", "gate"], ["blade", "blade"], ["pulse", "pulse"]], lethal: [["hlaser", "laser"], ["laser", "laser"]] },
  sakura: { phase: [["bell", "bell"], ["bamboo", "bamboo"], ["lantern", "lantern"]] },
  solar: { phase: [["geyser", "geyser"], ["meteor", "meteor"], ["firebar", "firebar"], ["flare", "flare"]] },
  frozen: { phase: [["icicle", "icicle"], ["slider", "slider"], ["comet", "comet"]], lethal: [["zap", "zap"]] },
  glitch: { phase: [["blink", "blink"], ["column", "column"]], lethal: [["blaser", "laser"]] },
  abyss: { phase: [["tendril", "tendril"], ["slammer", "slammer"], ["walls", "walls"]], lethal: [["eyebeam", "eyebeam"]] },
  valley: { phase: [["vine", "vine"], ["puffs", "puffs"], ["bloom", "bloom"]] },
  hurricane: { phase: [["debris", "debris"], ["bolt", "bolt"], ["twister", "twister"]] },
  prism: { phase: [["glass", "glass"], ["rprism", "rprism"]], lethal: [["mlaser", "mlaser"]] },
  tidal: { phase: [["jelly", "jelly"], ["mine", "mine"]] },
  chrono: { phase: [["cgear", "cgear"], ["pendulum", "pendulum"], ["rewind", "rewind"]] },
  mirror: { phase: [["spire", "spire"], ["vorb", "vorb"], ["vbar", "vbar"]] },
};

test("WASP LORD: a normal hero now — walls kill him, standard speed, combo up to x10; double jump is his one power @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["wasplord", "character=wasplord"] });
  await startRun(page);
  const def = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const d = s.charDef;
    return { speed: d.speed ?? 1, phase: !!d.perks?.phase, comboMax: d.perks?.comboMax ?? null, perks: d.perks?.list, dj: !!d.doubleJump, omPhase: !!s.obstacles.phase };
  });
  expect(def).toEqual({ speed: 1, phase: false, comboMax: null, perks: ["DOUBLE JUMP"], dj: true, omPhase: false });
  // a saw right on him ends the run, like for any hero
  const hit = await probe(page, "saw", "saw");
  expect(hit.dead).toBe(true);
  expect(hit.phased).toBe(0);
  expect(log.errors).toEqual([]);
});

test("WASP LORD: the ground, the ceiling and leaving the screen end the run; retry @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  const log = await openGame(page, { flags: ["wasplord", "character=wasplord"] });
  const edge = async (y) => {
    await startRun(page);
    const r = await page.evaluate((y) => {
      const s = window.__glydrift.scene.getScene("Game");
      window.__T ??= performance.now();
      s.player.y = y === "top" ? -s.player.radius : s.H + s.player.radius;
      s.player.vy = y === "top" ? -400 : 400;
      for (let i = 0; i < 4 && s.state === "playing"; i++) {
        window.__T += 1000 / 60;
        window.__glydrift.step(window.__T, 1000 / 60);
      }
      return { state: s.state, killedBy: s.run.killedBy, y: Math.round(s.player.y), H: s.H };
    }, y);
    await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
    await run(page, 1500);
    // RETRY: the same hero again
    await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
    await settle(page, "Game", 600);
    await page.evaluate(() => window.__glydrift.scene.getScene("Game").scene.start("Menu"));
    await settle(page, "Menu", 800);
    return r;
  };
  const floor = await edge("bottom");
  const ceiling = await edge("top");
  expect(floor.state).toBe("dying");
  expect(floor.killedBy).toBe("edge");
  expect(ceiling.state).toBe("dying");
  expect(ceiling.killedBy).toBe("edge");
  expect(log.errors).toEqual([]);
});

test("WASP LORD: double jump inside 0.25 s, once until he falls; MILZZZ unchanged @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const jumps = async (id) => {
    await openGame(page, { flags: ["wasplord", "god", `character=${id}`] });
    await startRun(page);
    return page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      const p = s.player;
      window.__T ??= performance.now();
      const dbls = [];
      p.rig.doubleJump = () => dbls.push(1); // (the art's shockwave; counted here)
      const wait = (sec) => {
        for (let i = 0; i < Math.round(sec * 60); i++) {
          window.__T += 1000 / 60;
          window.__glydrift.step(window.__T, 1000 / 60);
        }
      };
      const fall = () => {
        // until he is falling again
        for (let i = 0; i < 240 && p.vy * p.gravityDir <= 0; i++) wait(1 / 60);
        wait(0.05);
      };
      const keepUp = () => {
        p.y = s.H / 2;
      };
      const tap = () => {
        keepUp();
        const n = dbls.length;
        s.onTap();
        return { dbl: dbls.length > n, vy: Math.round(p.vy) };
      };
      const out = {};
      fall();
      tap();
      wait(0.15);
      out.inside = tap(); // 0.15 s after a flap: the boosted jump
      wait(0.1);
      out.again = tap(); // within the window of that one, still rising
      wait(0.1);
      out.again2 = tap();
      wait(1.1); // (MILZZZ's 1 s cooldown is over; both have fallen)
      tap();
      wait(0.1);
      out.afterFall = tap();
      // keep tapping every 0.2 s for 1.6 s: always rising, never falling
      out.chain = 0;
      for (let i = 0; i < 8; i++) {
        wait(0.2);
        if (tap().dbl) out.chain++;
      }
      fall();
      tap();
      wait(0.28);
      out.outside = tap(); // 0.28 s: outside his 0.25 s window
      return out;
    });
  };
  const w = await jumps("wasplord");
  expect(w.inside.dbl).toBe(true);
  expect(w.inside.vy).toBe(Math.round(-790 * 1.45));
  expect(w.again.dbl).toBe(false); // once…
  expect(w.again2.dbl).toBe(false);
  expect(w.afterFall.dbl).toBe(true); // …then ready again once he has fallen
  expect(w.chain).toBe(0); // never while he keeps rising
  expect(w.outside.dbl).toBe(false);
  expect(w.outside.vy).toBe(-790);
  // MILZZZ: unchanged (window 0.3 s, a 1 s cooldown, ready again without falling)
  const m = await jumps("milzzz");
  expect(m.inside.dbl).toBe(true);
  expect(m.inside.vy).toBe(Math.round(-790 * 1.3));
  expect(m.again.dbl).toBe(false); // cooling down
  expect(m.again2.dbl).toBe(false);
  expect(m.afterFall.dbl).toBe(true);
  expect(m.chain).toBeGreaterThanOrEqual(1); // his comes back on the clock, rising or not
});

test("WASP LORD: the ILLEGAL tag on his leaderboard rows — podium, list, your row — also from another device's data @smoke", async ({ page, browser }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["wasplord", "lbmock", "character=wasplord"] });
  // a finished run with him (the mock server remembers your row's hero, as the real one stores it)
  await page.evaluate(() =>
    window.__glyLb.Leaderboard.submitRun({ score: 1200, distance: 900, runTimeMs: 60_000, char: "wasplord", mode: "normal" }),
  );
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Leaderboard"));
  await settle(page, "Leaderboard", 1500);
  const count = (page, ids) =>
    page.evaluate((ids) => {
      const sc = window.__glydrift.scene.getScene("Leaderboard");
      if (ids) {
        const rows = sc.rows.map((r, i) => ({ ...r, character: ids[i % ids.length] }));
        sc.list.removeAll(true);
        sc.renderRows(rows, sc.userId);
      }
      let list = 0;
      let you = 0;
      const walk = (o, f) => {
        if (o.name === "illegalTag") f();
        (o.list || []).forEach((c) => walk(c, f));
      };
      walk(sc.list, () => list++);
      walk(sc.you, () => you++);
      const rows = ids ? sc.rows.length : sc.rows.length;
      return { list, you, rows, wasp: sc.rows.filter((r) => r.character === "wasplord").length };
    }, ids);
  const mine = await count(page, null);
  expect(mine.you).toBe(1); // your own row: you flew him
  expect(mine.list).toBe(1); // your place in the list (#12)
  const half = await count(page, ["wasplord", "volt"]);
  expect(half.list).toBe(Math.ceil(half.rows / 2)); // every one of his rows (podium included)
  const none = await count(page, ["volt", "splice", "newbleizer"]);
  expect(none.list).toBe(0);
  expect(log.errors).toEqual([]);

  // another device (a second browser context): the board comes from the server's rows, where
  // someone else's score was set with WASP LORD
  const ctx = await browser.newContext({ ...testInfo.project.use });
  const other = await ctx.newPage();
  const log2 = await openGame(other, { flags: ["wasplord", "lbmock"] });
  await other.evaluate(() => {
    const lb = window.__glyLb.Leaderboard;
    const real = lb.board.bind(lb);
    lb.board = async (...a) => {
      const b = await real(...a);
      b.rows = b.rows.map((r, i) => (i === 0 || i === 7 ? { ...r, character: "wasplord" } : r));
      return b;
    };
  });
  await other.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Leaderboard"));
  await settle(other, "Leaderboard", 1500);
  const seen = await count(other, null);
  expect(seen.wasp).toBe(2);
  expect(seen.list).toBe(2); // the #1 podium place and #8 in the list
  expect(seen.you).toBe(0); // this device flew VOLT
  expect(log2.errors).toEqual([]);
  await ctx.close();
});

test("WASP LORD: score checks allow his speed and x16 only on his rows (same rules as the server) @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  await openGame(page, { flags: ["wasplord", "wasplord"] });
  const r = await page.evaluate(() => {
    const { isPlausible } = window.__glyLb;
    const t = (character, score, distance, ms, level = "endless") => isPlausible({ level, score, distance, run_time_ms: ms, character });
    return {
      // two minutes at close to his top speed (×1.95 of 625 px/s = 61 m/s: 7352 m max)
      fastWasp: t("wasplord", 7300, 7300, 120_000),
      fastVolt: t("volt", 7300, 7300, 120_000),
      fastSxe: t("splice", 7300, 7300, 120_000),
      fastWaspDist: t("wasplord", 7300, 7300, 120_000, "endless-distance"),
      fastVoltDist: t("volt", 7300, 7300, 120_000, "endless-distance"),
      tooFastWasp: t("wasplord", 7500, 7500, 120_000),
      // x16 points: 35 per metre (30 is the cap for everyone else)
      x16Wasp: t("wasplord", 105_000, 3000, 180_000),
      x16Volt: t("volt", 105_000, 3000, 180_000),
      tooManyWasp: t("wasplord", 117_000, 3000, 180_000),
      normalWasp: t("wasplord", 3000, 1700, 80_000),
      normalVolt: t("volt", 3000, 1700, 80_000),
      // the hero id must be well formed
      noHero: t(undefined, 3000, 1700, 80_000),
      badHero: t("Wasp Lord", 3000, 1700, 80_000),
      longHero: t("a".repeat(25), 3000, 1700, 80_000),
    };
  });
  expect(r).toEqual({
    fastWasp: true,
    fastVolt: false,
    fastSxe: false,
    fastWaspDist: true,
    fastVoltDist: false,
    tooFastWasp: false,
    x16Wasp: true,
    x16Volt: false,
    tooManyWasp: false,
    normalWasp: true,
    normalVolt: true,
    noHero: false,
    badHero: false,
    longHero: false,
  });
  // the server's migration carries the same numbers and keeps a run's hero on a rename
  const sql = readFileSync(new URL("../../supabase/migrations/20261114000001_wasp_lord_scores.sql", import.meta.url), "utf8");
  expect(sql).toContain("when is_wasp then 1.95 else 1.8 end");
  expect(sql).toContain("when is_wasp then 38 else 30 end");
  expect(sql).toContain("'^[a-z0-9_]{1,24}$'");
  expect(sql).toContain("new.character := old.character;");
  expect(sql).toMatch(/create or replace function public\.glydrift_check_score/);
  expect(sql).toMatch(/drop trigger if exists glydrift_check_score/);
  expect(sql).toMatch(/BEFORE the game update with WASP LORD goes live/);
});
