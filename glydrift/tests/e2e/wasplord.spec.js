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
import { waspFly } from "./waspBot.js";

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

test("WASP LORD: phases through every wall, pillar and block; lasers, eye beams and zap beams still kill", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(600_000);
  const results = [];
  let log;
  for (const [realm, { phase, lethal = [] }] of Object.entries(REALMS)) {
    log = await openGame(page, { flags: ["character=wasplord", `dimension=${realm}`] });
    await startRun(page);
    for (const [kind, type] of phase) results.push({ realm, kind, lethal: false, ...(await probe(page, kind, type)) });
    expect(log.errors, realm).toEqual([]);
    for (const [kind, type] of lethal) {
      // each lethal hazard on a fresh run (the last one ended it)
      const r = { realm, kind, lethal: true, ...(await probe(page, kind, type, 420)) };
      results.push(r);
      if (r.dead) {
        await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
        await run(page, 1500);
        await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
        await settle(page, "Game", 600);
        await press(page, await fieldPoint(page));
        await run(page, 200);
      }
    }
  }
  console.log(JSON.stringify(results));
  for (const r of results.filter((r) => !r.lethal)) {
    const what = `${r.realm} ${r.kind}`;
    expect(r.missing, what).toBeUndefined();
    expect(r.minC, `${what}: he was inside it`).toBeLessThan(0);
    expect(r.dead, `${what}: still flying`).toBe(false);
    // (one phase each time he goes in: a swinging axe or a blinking block can leave him and
    // come back while it sits on him)
    expect(r.phased, `${what}: phased`).toBeGreaterThanOrEqual(1);
    expect(r.calls.length, `${what}: rig.phase on, then off, each time`).toBe(r.phased * 2);
    expect(r.calls.every((on, i) => on === (i % 2 === 0)), what).toBe(true);
    expect(r.flicker, `${what}: it flickers while he is inside`).toBe(true);
    expect(r.restored, `${what}: its art is back to normal after`).toBe(true);
    expect(r.near, `${what}: no CLOSE! for phasing`).toBe(0);
    expect(r.perfects, `${what}: no PERFECT! for phasing`).toBe(0);
  }
  for (const r of results.filter((r) => r.lethal)) {
    expect(r.dead, `${r.realm} ${r.kind} kills him`).toBe(true);
    expect(r.killedBy).toBe(r.type);
  }
  expect(log.errors).toEqual([]);
});

test("WASP LORD: the ground, the ceiling and leaving the screen end the run; retry; Reduce Flashing dims steadily @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  const log = await openGame(page, { flags: ["character=wasplord"] });
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
    // RETRY: the same hero, still phasing, standard look again
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
  // after a retry he still phases (and nothing was left phasing from the last run)
  await startRun(page);
  const after = await probe(page, "saw", "saw");
  expect(after.dead).toBe(false);
  expect(after.phased).toBe(1);
  // Reduce Flashing: a steady dim instead of the flicker
  await page.evaluate(() => {
    window.__glySave.data.settings.reduceFlash = true;
  });
  const calm = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    const om = s.obstacles;
    const p = s.player;
    window.__T ??= performance.now();
    const step = () => {
      window.__T += 1000 / 60;
      window.__glydrift.step(window.__T, 1000 / 60);
    };
    for (const o of om.active) o.kill();
    om.active.length = 0;
    const saw = om.obtain("saw");
    saw.spawn(p.x + 4, { y: p.y, R: 60 });
    om.active.push(saw);
    om.nextX = 1e8;
    const ks = new Set();
    for (let i = 0; i < 20; i++) {
      saw.x = p.x + 4;
      p.y = saw.y;
      p.vy = 0;
      step();
      for (const [, a] of saw.phaseAlpha || []) ks.add(Math.round((a.out / a.base) * 100));
    }
    return { ks: [...ks], state: s.state };
  });
  expect(calm.state).toBe("playing");
  expect(calm.ks).toEqual([45]);
  expect(log.errors).toEqual([]);
});

test("WASP LORD: no CLOSE! or PERFECT! from phasing through a gate, a clean centre pass still counts @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["character=wasplord"] });
  await startRun(page);
  const pass = (phaseFirst) =>
    page.evaluate((phaseFirst) => {
      const s = window.__glydrift.scene.getScene("Game");
      const om = s.obstacles;
      const p = s.player;
      window.__T ??= performance.now();
      for (const o of om.active) o.kill();
      om.active.length = 0;
      om.nextX = p.x + 240;
      const keep = om.level;
      om.level = { i: 0, beats: [{ kind: "gate", d: 0.2, gap: 380 }], onBeat() {} };
      om.spawnPattern(s.course.pace(s.meters), s.zoneId);
      om.level = keep;
      om.nextX = 1e8;
      const gate = om.active.find((o) => o.type === "gate");
      const near0 = s.run.nearMiss;
      const perf0 = s.run.perfects;
      for (let i = 0; i < 200 && !gate.passed && s.state === "playing"; i++) {
        const mid = (gate.yt + gate.yb) / 2;
        // phaseFirst: fly into the gate's wall, then slip to the dead centre at the centre line
        const inWall = phaseFirst && gate.left - p.x < 30 && gate.x - p.x > 6;
        p.y = inWall ? gate.yt - 40 : mid;
        p.vy = 0;
        window.__T += 1000 / 60;
        window.__glydrift.step(window.__T, 1000 / 60);
      }
      return { phased: gate.phasedThrough, near: s.run.nearMiss - near0, perfects: s.run.perfects - perf0, state: s.state };
    }, phaseFirst);
  const cheat = await pass(true);
  expect(cheat.phased).toBe(true);
  expect(cheat.perfects).toBe(0);
  expect(cheat.near).toBe(0);
  const clean = await pass(false);
  expect(clean.phased).toBe(false);
  expect(clean.perfects).toBe(1);
  expect(clean.state).toBe("playing");
  expect(log.errors).toEqual([]);
});

test("WASP LORD: double jump inside 0.25 s, once until he falls; MILZZZ unchanged @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const jumps = async (id) => {
    await openGame(page, { flags: ["god", `character=${id}`] });
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

test("WASP LORD: combo climbs to x16 (flaming number on the meter and the HUD); SXE x13, others x10 @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const climb = async (id) => {
    await openGame(page, { flags: ["god", `character=${id}`] });
    await startRun(page);
    return page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      const steps = [];
      const at = {};
      for (let i = 0; i < 34; i++) {
        s.addChain();
        if (steps.at(-1) !== s.mult) {
          steps.push(s.mult);
          at[s.mult] = s.chain;
        }
      }
      window.__T ??= performance.now();
      window.__T += 1000 / 60;
      window.__glydrift.step(window.__T, 1000 / 60);
      const label = s.comboMeter.labels[s.mult];
      s.hudReady.onNearMiss(25 * s.mult, s.mult);
      const hud = s.hudReady;
      return {
        steps,
        at,
        best: s.run.bestCombo,
        shown: !!label?.visible,
        flaming: !!label?.c?.flame,
        hudFlame: hud.comboFlame.c.alpha,
        hudText: hud.comboText.text,
        rigTier: s.player.rig.comboTier,
      };
    });
  };
  const w = await climb("wasplord");
  expect(w.steps).toEqual([1, 2, 3, 5, 10, 13, 16]);
  expect(w.at[16]).toBe(28);
  expect(w.best).toBe(16);
  expect(w.shown).toBe(true);
  expect(w.flaming).toBe(true);
  expect(w.hudFlame).toBe(1);
  expect(w.hudText).toBe("+400");
  const sxe = await climb("splice");
  expect(sxe.steps).toEqual([1, 2, 3, 5, 10, 13]);
  expect(sxe.flaming).toBe(false);
  expect(sxe.hudFlame).toBe(0);
  expect(sxe.hudText).toBe("COMBO x13  +325");
  const volt = await climb("volt");
  expect(volt.steps).toEqual([1, 2, 3, 5, 10]);
});

test("WASP LORD: swapping heroes mid-session restores the other hero exactly (no phasing, standard speed)", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const log = await openGame(page, { save: SAVE_ALL });
  const look = async () => {
    await startRun(page);
    const r = await page.evaluate(() => {
      const s = window.__glydrift.scene.getScene("Game");
      return {
        id: s.charDef.id,
        speedK: s.charDef.speed ?? 1,
        ratio: +(s.speed / (s.course.speedAt(s.meters) * s.speedMul)).toFixed(3),
        phase: s.obstacles.phase,
        ward: s.obstacles.ward,
        dj: !!s.charDef.doubleJump,
      };
    });
    const saw = await probe(page, "saw", "saw", 120);
    await page.evaluate(() => window.__glydrift.scene.getScene("Game").scene.start("Menu"));
    await settle(page, "Menu", 800);
    return { ...r, sawKills: saw.dead, phased: saw.phased };
  };
  const set = (id) =>
    page.evaluate((id) => {
      window.__glySave.data.selected = id;
      window.__glydrift.scene.getScene("Menu").scene.restart();
    }, id).then(() => run(page, 1500));
  const wasp1 = await look();
  await set("volt");
  await settle(page, "Menu", 800);
  const volt = await look();
  await set("splice");
  await settle(page, "Menu", 800);
  const sxe = await look();
  await set("wasplord");
  await settle(page, "Menu", 800);
  const wasp2 = await look();
  for (const w of [wasp1, wasp2]) {
    expect(w.id).toBe("wasplord");
    expect(w.ratio).toBe(1.308);
    expect(w.phase).toEqual(["laser", "blaser", "eyebeam", "mlaser", "zap"]);
    expect(w.sawKills).toBe(false);
    expect(w.phased).toBe(1);
  }
  expect(volt).toMatchObject({ id: "volt", ratio: 1, phase: null, ward: null, sawKills: true, phased: 0 });
  // SXE: his own +25% and no phase outside the Glitch Realm
  expect(sxe).toMatchObject({ id: "splice", ratio: 1.25, phase: null, ward: null, sawKills: true, phased: 0 });
  expect(log.errors).toEqual([]);
});

test("WASP LORD: fair at his speed — a god-off autopilot flies every realm and dimension with the lethal hazards forced", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(900_000);
  const log = await openGame(page, { flags: ["character=wasplord"] });
  const FORCE = {
    void: ["hlaser", "blade", "hlaser", "pulse", "hlaser", "bladeduo"],
    frozen: ["zap", "zapstairs", "icicle", "zap", "gauntlet"],
    // every multi-hazard Abyss pattern, double eye beams most of all (as abyss-crash.spec.js)
    abyss: ["eyepair", "eyeslam", "eyepair", "eyepair", "tendrileye", "eyepair", "slammer", "eyepair", "walls", "eyepair"],
    prism: ["mlaser", "glass", "mlaser", "mlaser", "rprism"],
  };
  const laps = [];
  for (let lap = 0; lap < 3; lap++) {
    await startRun(page, 9000 + lap * 7919);
    // the full journey on the first lap: every classic realm, then the four dimensions in turn;
    // later laps fly to the end of the Abyss again (more double eye beams)
    const end = await page.evaluate((lap) => {
      const s = window.__glydrift.scene.getScene("Game");
      s.course.extend(8000);
      const order = [["prism", 7], ["tidal", 8], ["chrono", 9], ["mirror", 10]];
      let k = 0;
      for (const g of s.course.segs)
        if (g.dimension) {
          const [id, b] = order[k++ % order.length];
          Object.assign(g, { id, biome: b, firstVisit: k <= order.length });
        }
      const abyss = s.course.segs.find((g) => g.id === "abyss");
      const mirror = s.course.segs.find((g) => g.id === "mirror");
      return lap === 0 ? mirror.end + 20 : abyss.end + 20;
    }, lap);
    const r = await page.evaluate(waspFly, { frames: 60 * 60 * 12, untilM: end, force: FORCE });
    r.end = end;
    laps.push(r);
    console.log(JSON.stringify(r));
    if (r.state !== "playing") break;
    await page.evaluate(() => window.__glydrift.scene.getScene("Game").scene.start("Menu"));
    await settle(page, "Menu", 800);
  }
  for (const r of laps) {
    expect(r.state, `lap died: ${r.killedBy} in ${r.killedIn} at ${r.m} m`).toBe("playing");
    expect(r.m).toBeGreaterThanOrEqual(r.end);
  }
  const first = laps[0];
  for (const z of ["void", "sakura", "solar", "frozen", "glitch", "abyss", "valley", "hurricane", "prism", "tidal", "chrono", "mirror"])
    expect(first.zones[z] ?? 0, z).toBeGreaterThan(200);
  const sum = (k) => laps.reduce((a, l) => a + (l.forced?.[k] || 0), 0);
  expect(laps.reduce((a, l) => a + l.pairs, 0), "double eye beams").toBeGreaterThanOrEqual(10);
  expect(sum("hlaser")).toBeGreaterThanOrEqual(6);
  expect(sum("zap") + sum("zapstairs")).toBeGreaterThanOrEqual(6);
  expect(sum("mlaser")).toBeGreaterThanOrEqual(5);
  expect(first.phased).toBeGreaterThan(20); // and he flew through plenty of walls
  expect(log.errors).toEqual([]);
});

test("WASP LORD: a run still ends — passive he hits the ground, flying blind a laser or beam gets him within 10 minutes", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(600_000);
  const log = await openGame(page, { flags: ["character=wasplord"] });
  await startRun(page);
  // no taps at all
  const passive = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    window.__T ??= performance.now();
    window.__glyNoRender = true;
    let f = 0;
    for (; f < 60 * 600 && s.state === "playing"; f++) {
      window.__T += 1000 / 60;
      window.__glydrift.step(window.__T, 1000 / 60);
    }
    window.__glyNoRender = false;
    return { seconds: f / 60, killedBy: s.run.killedBy, state: s.state };
  });
  expect(passive.state).not.toBe("playing");
  expect(passive.killedBy).toBe("edge");
  expect(passive.seconds).toBeLessThan(5);
  await waitFor(page, () => window.__glydrift.scene.isActive("GameOver"), 15_000);
  await run(page, 1500);
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
  await settle(page, "Game", 600);
  await press(page, await fieldPoint(page));
  await run(page, 200);
  // holding the middle without looking: walls are nothing to him, but a laser or beam ends it
  const blind = await page.evaluate(waspFly, { frames: 60 * 60 * 10, steer: false });
  console.log(JSON.stringify(blind));
  expect(blind.state).not.toBe("playing");
  expect(["laser", "eyebeam", "mlaser", "zap", "edge"]).toContain(blind.killedBy);
  expect(blind.frames).toBeLessThan(60 * 60 * 10);
  expect(log.errors).toEqual([]);
});

test("WASP LORD: the ILLEGAL tag on his leaderboard rows — podium, list, your row — also from another device's data @smoke", async ({ page, browser }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock", "character=wasplord"] });
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
  const log2 = await openGame(other, { flags: ["lbmock"] });
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
  await openGame(page);
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
