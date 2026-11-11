// The Abyss crash (crash reports: "Cannot read properties of null (reading 'glTexture')", 10x,
// 5 players, all in the Abyss). Retry keeps the game screen and its pooled hazards; the Abyss art
// is freed after you leave the Abyss and built again in the next run. A Slammer pooled in an
// earlier run still pointed at the freed art and crashed the game when drawn (most often in the
// Eye Beam + Slammer pattern: "two beams at once"). This flies the Abyss again and again across
// retries, forcing every multi-hazard Abyss pattern (50+ double eye beams), drawing every frame
// that matters, and fails on any error, anything drawn with a freed texture, or growth.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, reseed, run, settle, tap } from "./helpers.js";

const LAPS = 9;

test("Abyss: double eye beams and every multi-hazard pattern, run after run, never draw freed art @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(900_000);
  const log = await openGame(page, { flags: ["god"] });
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  let seed = 12345;
  const launch = async () => {
    // a new seed each run: the tests' seeded Math.random replayed from the same seed would hand
    // Phaser's text textures the same random ids as texts still alive from the last run
    await reseed(page, (seed += 7919));
    await run(page, 600);
    await press(page, await fieldPoint(page));
    await run(page, 200);
  };
  await launch();
  const laps = [];
  for (let lap = 0; lap < LAPS; lap++) {
    laps.push(
      await page.evaluate((lap) => {
        const g = window.__glydrift;
        const s = g.scene.getScene("Game");
        const mgr = s.obstacles;
        window.__T ??= performance.now();
        const out = { lap, pairs: 0, patterns: 0, dead: [], frames: 0 };
        // every Abyss pattern that fires more than one hazard, double eye beams most of all
        const CYCLE = ["eyepair", "eyeslam", "eyepair", "eyepair", "tendrileye", "eyepair", "slammer", "eyepair", "walls", "eyepair"];
        const spawn = mgr.spawnPattern;
        let n = 0;
        // where the Abyss sits in this run's course (its place in the realm order moves when a
        // realm is added: Sakura Skies put it at 2500–3000 m). Patterns are picked by pace
        // metres (the difficulty curve holds still across Sakura Skies), so compare in those.
        const abyss = s.course.segs.find((g) => g.id === "abyss");
        const from = s.course.pace(abyss.start) + 10;
        const to = abyss.end + 300;
        if (lap > 0)
          mgr.spawnPattern = function (meters, biomeId) {
            if (biomeId !== "abyss" || meters < from) return spawn.call(this, meters, biomeId);
            const kind = CYCLE[n++ % CYCLE.length];
            out.patterns++;
            if (kind === "eyepair") out.pairs++;
            const keep = this.level;
            this.level = { i: 0, beats: [{ kind, d: 0.6, gap: 380 }], onBeat() {} };
            try {
              return spawn.call(this, meters, biomeId);
            } finally {
              this.level = keep;
            }
          };
        const scan = () => {
          const walk = (o, sc) => {
            if (!o) return;
            if (o.visible && o.frame && !o.frame.source && out.dead.length < 5)
              out.dead.push(`${sc} ${o.type} ${o.frame.name} @${Math.floor(s.meters)} m`);
            if (o.list) for (const c of o.list) walk(c, sc);
          };
          for (const sc of g.scene.getScenes(true)) for (const o of sc.sys.displayList.list) walk(o, sc.sys.settings.key);
        };
        for (let i = 0; i < 60 * 60 * 30 && s.meters < to && s.state === "playing"; i++) {
          const inAbyss = s.zoneId === "abyss" && lap > 0;
          // draw the Abyss (every other frame: anything shown stays up for many frames), skip the rest
          window.__glyNoRender = !(inAbyss && i % 2 === 0);
          if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
          window.__T += 1000 / 60;
          g.step(window.__T, 1000 / 60);
          if (inAbyss) {
            out.frames++;
            if (i % 2 === 0) scan();
          }
        }
        window.__glyNoRender = false;
        mgr.spawnPattern = spawn;
        out.m = Math.floor(s.meters);
        out.to = to;
        out.state = s.state;
        out.textures = g.textures.getTextureKeys().length;
        out.objs = s.sys.displayList.length;
        out.texts = s.fx.texts.length; // pop-up texts (their fade-out needs the real clock)
        // display objects held by the hazard pools (pools grow while new pattern mixes need
        // more of one hazard at once, then stop)
        out.pooled = Object.values(mgr.pools).reduce((a, pool) => a + pool.reduce((b, o) => b + (o.objects?.length || 0), 0), 0);
        // per hazard type: how many instances its pool holds (a high-water mark: a pool only
        // grows when every instance of that type is on screen at once), and instances that are
        // live but no longer tracked by the manager (those could never be reused: a real leak)
        out.perType = Object.fromEntries(Object.entries(mgr.pools).map(([k, pool]) => [k, pool.length]));
        out.orphans = Object.values(mgr.pools).flat().filter((o) => o.active && !mgr.active.includes(o)).length;
        out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        out.crashes = window.__glyCrash.CrashReport.queued().filter((r) => r.kind !== "killed_mid_run").map((r) => r.message);
        // end the run; RETRY keeps the same game screen and its pools (the case that crashed)
        window.__glyGod(false);
        s.die();
        window.__glyGod(true);
        return out;
      }, lap),
    );
    await run(page, 2500);
    await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").retry());
    await settle(page, "Game", 600);
    await launch();
  }
  console.log(JSON.stringify(laps));
  const forced = laps.slice(1);
  expect(forced.reduce((a, l) => a + l.pairs, 0)).toBeGreaterThanOrEqual(50);
  for (const l of laps) {
    expect(l.dead, `lap ${l.lap}: drawn with freed art`).toEqual([]);
    expect(l.crashes, `lap ${l.lap}: errors`).toEqual([]);
    expect(l.m, `lap ${l.lap} reached the end of the Abyss`).toBeGreaterThanOrEqual(l.to);
  }
  // nothing piles up from one run to the next (the texture count moves a little with which
  // dimension the run reached; the hazard pools fill up over the first laps, then stay put)
  expect(laps.at(-1).textures - laps[1].textures).toBeLessThanOrEqual(30);
  // Everything on the game screen except the hazard pools and the pop-up texts must stay put
  // (pop-up texts: under the frozen test clock their fade-out never finishes). The pools are
  // checked on their own below.
  const rest = (l) => l.objs - l.texts - l.pooled;
  expect(rest(laps.at(-1)) - rest(laps[4])).toBeLessThanOrEqual(25);
  // The pools are high-water marks, not something that stops growing on a fixed lap: each pool
  // keeps as many instances of its hazard type as were ever on screen at once, so a new seed now
  // and then sets a new record for one type (one more saw, blink or meteor: +2 to +15 display
  // objects). Over 16 laps no type went past 5 instances. A leak would show as instances that
  // stay live but untracked (never reused), or a type whose pool keeps growing with every lap.
  for (const l of laps) expect(l.orphans, `lap ${l.lap}: hazards left live but untracked`).toBe(0);
  const most = Math.max(...Object.values(laps.at(-1).perType));
  expect(most, "no hazard type needs more than a screenful of instances").toBeLessThanOrEqual(8);
  if (laps.at(-1).heapMB && laps[1].heapMB) expect(laps.at(-1).heapMB - laps[1].heapMB).toBeLessThanOrEqual(25);
  expect(log.errors).toEqual([]);
});
