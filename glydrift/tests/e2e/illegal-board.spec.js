// The ILLEGAL leaderboard: WASP LORD's runs go on boards of their own, never the normal boards or
// ALL MIGHTY (supabase/migrations/20261115000001_illegal_leaderboard.sql).
//  1. two devices on one (fake) server: his run shows on ILLEGAL and never on SCORE / DISTANCE,
//     even a row of his sitting on a normal board (an older app, before the migration ran)
//  2. the migration itself on a real Postgres: his existing rows move (nothing deleted), the
//     crown leaves a Wasp Lord score, older apps and doctored requests can't put him back on the
//     normal boards, normal heroes are untouched
//  3. in the game: the one-time "Wasp Lord is ILLEGAL" message and "Illegal leaderboard only."
//     on his shop card
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { fakeSupabase } from "./fakeSupabase.js";
import { MIG, pgAvailable, startPg } from "./pg.js";
import { fieldPoint, openGame, press, profileOf, run, settle, waitFor } from "./helpers.js";

const SUPA = /supabase\.co/;
// the game's service worker would fetch around Playwright's routes in WebKit
test.use({ serviceWorkers: "block" });

/** Open the leaderboard on a tab and wait for the server's rows. */
async function boardRows(page, tab) {
  await page.evaluate((tab) => {
    const g = window.__glydrift;
    const cur = g.scene.getScenes(true).find((s) => s.sys.settings.key !== "Backdrop") || g.scene.getScene("Menu");
    g.scene.getScene("Leaderboard").rows = undefined;
    cur.scene.start("Leaderboard", { tab });
  }, tab);
  await waitFor(page, () => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    return s.sys.isActive() && Array.isArray(s.rows);
  }, 20_000);
  return page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    return { level: s.level, rows: s.rows.map((r) => ({ name: r.username, hero: r.character, score: r.score })) };
  });
}

test("ILLEGAL board: a Wasp Lord run shows on ILLEGAL and never on the normal boards, on two devices @smoke", async ({ browser }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(180_000);
  // the server already has normal heroes' rows, a Wasp Lord row an older app left on the normal
  // board, and one on the ILLEGAL board
  const server = fakeSupabase({
    rows: [
      { player_id: "p-1", username: "Ace", level: "endless", score: 9000, distance: 1500, run_time_ms: 90000, character: "volt" },
      { player_id: "p-2", username: "Nova", level: "endless", score: 7000, distance: 1300, run_time_ms: 80000, character: "splice" },
      { player_id: "p-2", username: "Nova", level: "endless-distance", score: 1300, distance: 1300, run_time_ms: 80000, character: "splice" },
      { player_id: "p-3", username: "OldApp", level: "endless", score: 50000, distance: 3000, run_time_ms: 90000, character: "wasplord" },
      { player_id: "p-4", username: "Stinger", level: "illegal-endless", score: 40000, distance: 2900, run_time_ms: 90000, character: "wasplord" },
    ],
  });
  const devices = [];
  const open = async (flags) => {
    const ctx = await browser.newContext({ ...testInfo.project.use, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const log = await openGame(page, { online: true, flags, routes: [[SUPA, (r) => server.handle(r)]] });
    devices.push({ ctx, page, log });
    return { page, log };
  };

  // device 1 flies WASP LORD, then VOLT
  const a = await open(["character=wasplord"]);
  const up = await a.page.evaluate(async () => {
    const lb = window.__glyLb.Leaderboard;
    const wasp = await lb.submitRun({ score: 30000, distance: 3000, runTimeMs: 90_000, char: "wasplord", mode: "normal" });
    const volt = await lb.submitRun({ score: 8000, distance: 1400, runTimeMs: 85_000, char: "volt", mode: "normal" });
    return { wasp, volt, me: lb.userId, queue: window.__glySave.data.lbQueue.length };
  });
  expect(up.queue, JSON.stringify({ up, log: server.log })).toBe(0);
  const mine = server.db.scores.filter((r) => r.player_id === up.me).map((r) => `${r.level}:${r.character}:${r.score}`).sort();
  expect(mine).toEqual([
    "endless-distance:volt:1400",
    "endless:volt:8000",
    "illegal-endless-distance:wasplord:3000",
    "illegal-endless:wasplord:30000",
  ]);

  // device 2 (another player, another browser) opens the boards
  const b = await open([]);
  for (const [tab, level] of [["score", "endless"], ["distance", "endless-distance"]]) {
    const seen = await boardRows(b.page, tab);
    expect(seen.level).toBe(level);
    expect(seen.rows.length).toBeGreaterThan(0);
    expect(seen.rows.filter((r) => r.hero === "wasplord"), `${tab}: ${JSON.stringify(seen.rows)}`).toEqual([]);
    expect(seen.rows.map((r) => r.name)).not.toContain("OldApp"); // even his row on a normal board
  }
  const score = await boardRows(b.page, "score");
  expect(score.rows.map((r) => r.name)).toEqual(["Ace", "TestPilot", "Nova"]); // device 1's VOLT run counts
  const illegal = await boardRows(b.page, "illegal");
  expect(illegal.level).toBe("illegal-endless");
  expect(illegal.rows).toEqual([
    { name: "Stinger", hero: "wasplord", score: 40000 },
    { name: "TestPilot", hero: "wasplord", score: 30000 },
  ]);
  // and device 1 sees the same: its WASP LORD best on ILLEGAL, its VOLT best on SCORE
  expect((await boardRows(a.page, "illegal")).rows.map((r) => r.name)).toEqual(["Stinger", "TestPilot"]);
  const aScore = await boardRows(a.page, "score");
  expect(aScore.rows.find((r) => r.name === "TestPilot")).toEqual({ name: "TestPilot", hero: "volt", score: 8000 });
  // his "you placed" lookup counts only the ILLEGAL board
  const place = await a.page.evaluate(async () => {
    const { Leaderboard, Levels } = window.__glyLb;
    return {
      illegal: await Leaderboard.placementFor(Levels.illegal(Levels.endless()), 35000),
      normal: await Leaderboard.placementFor(Levels.endless(), 35000),
    };
  });
  expect(place).toEqual({ illegal: 1, normal: 1 }); // (OldApp's 50,000 on "endless" doesn't count)
  for (const d of devices) {
    expect(d.log.errors).toEqual([]);
    await d.ctx.close();
  }
});

// ---------------------------------------------------------------------------- the SQL
test("ILLEGAL board: the migration moves Wasp Lord scores off the normal boards (nothing deleted), moves the crown, leaves normal heroes alone @smoke", async ({}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser lane (no browser needed)");
  test.skip(!pgAvailable(), "PostgreSQL isn't installed here");
  test.setTimeout(120_000);
  const pg = startPg();
  const { psql, asPlayer } = pg;
  try {
    // ---- the live data: A holds the crown with a WASP LORD score; B is the best normal hero
    const A = "aaaaaaaa-0000-4000-8000-000000000001";
    const B = "bbbbbbbb-0000-4000-8000-000000000002";
    const C = "cccccccc-0000-4000-8000-000000000003";
    const D = "dddddddd-0000-4000-8000-000000000004";
    psql(`
      insert into auth.users(id) values ('${A}'), ('${B}'), ('${C}'), ('${D}');
      insert into public.player_saves(user_id, save) values ('${A}', '{"unlocked":{"volt":true,"wasplord":true}}');
      insert into public.scores(player_id, username, level, score, distance, run_time_ms, character, created_at) values
        ('${A}', 'WaspKing', 'endless',          100000, 3400, 60000, 'wasplord', '2026-11-15 03:00Z'),
        ('${A}', 'WaspKing', 'endless-distance',   3400, 3400, 60000, 'wasplord', '2026-11-15 03:00Z'),
        ('${B}', 'Bravo',    'endless',           50000, 2000, 60000, 'volt',     '2026-11-10 10:00Z'),
        ('${B}', 'Bravo',    'endless-distance',   2000, 2000, 60000, 'volt',     '2026-11-10 10:00Z'),
        ('${C}', 'Charlie',  'endless',           40000, 1800, 60000, 'splice',   '2026-11-11 10:00Z'),
        ('${C}', 'Charlie',  'lv-3', round(500000000.0 / 30000), 900, 30000, 'wasplord', '2026-11-15 04:00Z'),
        ('${D}', 'Delta',    'daily-321',          9000,  900, 60000, 'wasplord', '2026-11-15 05:00Z');
      select public.glydrift_refresh_all_mighty();`);
    expect(psql("select username from public.all_mighty")).toBe("WaspKing");
    const snapshot = (where) =>
      psql(`select string_agg(concat_ws('|', player_id, username, score, distance, run_time_ms, character, created_at), ',' order by id) from public.scores where ${where}`);
    const waspBefore = snapshot("character = 'wasplord'");
    const othersBefore = snapshot("character <> 'wasplord'");
    const countBefore = psql("select count(*) from public.scores");

    // ---- run it, twice
    const sum1 = psql(null, { file: join(MIG, "20261115000001_illegal_leaderboard.sql") }).split("\n").at(-1);
    const sum2 = psql(null, { file: join(MIG, "20261115000001_illegal_leaderboard.sql") }).split("\n").at(-1);
    // illegal_board_rows | wasp_rows_on_normal_boards | total_rows | all_mighty_now | all_mighty_hero
    expect(sum1).toBe("4|0|7|Bravo|volt");
    expect(sum2).toBe(sum1);

    // nothing deleted; his rows only changed board; everyone else's rows are exactly as they were
    expect(psql("select count(*) from public.scores")).toBe(countBefore);
    expect(snapshot("character = 'wasplord'")).toBe(waspBefore);
    expect(snapshot("character <> 'wasplord'")).toBe(othersBefore);
    expect(psql("select string_agg(level, ',' order by level) from public.scores where character = 'wasplord'")).toBe(
      "illegal-daily-321,illegal-endless,illegal-endless-distance,illegal-lv-3",
    );
    expect(psql("select string_agg(level, ',' order by level) from public.scores where character <> 'wasplord'")).toBe(
      "endless,endless,endless-distance",
    );
    // the crown: the best non-Wasp Lord score; his reign didn't count
    expect(psql("select username || ' ' || score from public.all_mighty")).toBe("Bravo 50000");
    expect(psql("select string_agg(username, ',') from public.all_mighty_history")).toBe("Bravo");
    expect(psql("select public.glydrift_refresh_all_mighty() ->> 'username'")).toBe("Bravo");

    // ---- from now on (as players, through the API's role)
    const up = "on conflict (player_id, level) do update set score = excluded.score, distance = excluded.distance, run_time_ms = excluded.run_time_ms, character = excluded.character, level = excluded.level";
    const ins = (uid, name, level, score, dist, ms, hero, tail = "returning level || ' ' || score") =>
      asPlayer(uid, `insert into public.scores(player_id, username, level, score, distance, run_time_ms, character) values ('${uid}', '${name}', '${level}', ${score}, ${dist}, ${ms}, '${hero}') ${up} ${tail}`);
    // an older app still sends his run to "endless": it lands on ILLEGAL
    expect(ins(A, "WaspKing", "endless", 120000, 3600, 60000, "wasplord")).toBe("illegal-endless 120000");
    // ...and a lower run of his from an older app never lowers his ILLEGAL best
    expect(ins(A, "WaspKing", "endless", 90000, 3000, 60000, "wasplord")).toBe("illegal-endless 120000");
    // the new app posts to the ILLEGAL board itself
    expect(ins(A, "WaspKing", "illegal-endless", 125000, 3650, 60000, "wasplord")).toBe("illegal-endless 125000");
    // his higher limits need him unlocked in the player's cloud save
    expect(ins(C, "Charlie", "illegal-endless", 120000, 3600, 60000, "wasplord")).toMatch(/^ERROR glydrift: impossible distance/);
    expect(ins(C, "Charlie", "endless", 8000, 1500, 60000, "wasplord")).toBe("illegal-endless 8000");
    // normal heroes: unchanged
    expect(ins(B, "Bravo", "endless", 60000, 2200, 60000, "volt")).toBe("endless 60000");
    expect(ins(B, "Bravo", "illegal-endless", 60000, 2200, 60000, "volt")).toMatch(/^ERROR glydrift: only Wasp Lord runs go on the ILLEGAL board/);
    // a doctored request can't move his row back or relabel a normal row as his
    expect(asPlayer(A, "update public.scores set level = 'endless', character = 'volt' where player_id = '" + A + "' and level = 'illegal-endless' returning level || ' ' || character")).toBe(
      "illegal-endless wasplord",
    );
    expect(asPlayer(B, `update public.scores set character = 'wasplord' where player_id = '${B}' and level = 'endless' returning 1`)).toMatch(/^ERROR glydrift: a normal board row/);
    // a rename keeps every row where it is
    asPlayer(A, `update public.scores set username = 'WaspKing2' where player_id = '${A}'`);
    expect(psql("select count(*) from public.scores where character = 'wasplord' and level not like 'illegal-%'")).toBe("0");
    expect(psql("select string_agg(username || ':' || character, ',' order by score desc) from public.scores where level = 'endless'")).toBe(
      "Bravo:volt,Charlie:splice",
    );
    expect(psql("select public.glydrift_refresh_all_mighty() ->> 'username'")).toBe("Bravo");
  } finally {
    pg.stop();
  }
});

// ---------------------------------------------------------------------------- in the game
test("ILLEGAL board: the first Wasp Lord run says his scores go on the Illegal leaderboard (once); his shop card says so @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["character=wasplord", "god"] });
  const banner = () =>
    page.evaluate(() => {
      const h = window.__glydrift.scene.getScene("Hud");
      return (h.runBanners || []).filter((c) => c.visible).map((c) => `${c.title.text} ${c.sub.text}`);
    });
  const start = async (from) => {
    await page.evaluate((from) => {
      document.getElementById("name-modal")?.classList.remove("open");
      window.__glydrift.scene.getScene(from).scene.start("Game", { mode: "normal" });
    }, from);
    await settle(page, "Game", 400);
    await run(page, 600);
    await press(page, await fieldPoint(page));
    await run(page, 900);
  };
  await start("Menu");
  expect(await banner()).toEqual(["Wasp Lord is ILLEGAL — his scores go on the Illegal leaderboard."]);
  expect(await page.evaluate(() => window.__glySave.data.illegalNoticeSeen)).toBe(true);
  // the next run: not again
  await start("Game");
  expect(await banner()).toEqual([]);

  // his shop card (locked: "???") and its stage
  await page.evaluate(() => {
    const g = window.__glydrift;
    g.scene.getScenes(true)[0].scene.start("Shop");
  });
  await settle(page, "Shop", 1200);
  const shop = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Shop");
    s.setTab("heroes");
    const i = s.cards.findIndex((c) => c.offer.id === "wasplord");
    s.focus(i, true);
    const texts = (o) => (o.list || []).flatMap((x) => (x.type === "Text" ? [x.text] : texts(x)));
    const others = s.cards.filter((c) => c.offer.id !== "wasplord").flatMap((c) => texts(c.content));
    return { card: texts(s.cards[i].content), stage: texts(s.stageInfo), a11y: s.cards[i].a11yLabel, others };
  });
  expect(shop.card).toContain("Illegal leaderboard only.");
  expect(shop.stage).toContain("Illegal leaderboard only.");
  expect(shop.a11y).toContain("Illegal leaderboard only.");
  expect(shop.others).not.toContain("Illegal leaderboard only."); // his card only
  expect(log.errors).toEqual([]);
});
