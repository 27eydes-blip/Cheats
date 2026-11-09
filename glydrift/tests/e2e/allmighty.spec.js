// ALL MIGHTY: the world's #1 on the all-time Score board wears the gold animated title, decided
// by the SERVER (supabase/migrations/20261109000001_all_mighty.sql) and read by the game. Here
// the server is the ?lbmock stand-in (?allmighty=me | other | former | none), no network.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, SAVE, settle, waitFor } from "./helpers.js";

const MIGHTY = "w_allmighty";

/** Names of every object in a container tree (titles are "title:<id>", the badge "formerBadge"). */
const tree = (page, key, part) =>
  page.evaluate(
    ({ key, part }) => {
      const s = window.__glydrift.scene.getScene(key);
      const walk = (c) => (c.list || []).flatMap((o) => [o.name, ...(o.list ? walk(o) : [])]);
      const root = part ? s[part] : { list: s.children.list };
      return walk(root).filter(Boolean);
    },
    { key, part },
  );

/** The podium places and list rows: who, and which title / badge they show. */
const boardRows = (page) =>
  page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    const names = (c) => (c.list || []).flatMap((o) => [o.name, ...(o.list ? names(o) : [])]);
    return (s.rows || []).map((r, i) => ({ rank: i + 1, id: r.player_id, name: r.username })).concat([
      { podium: s.podium.cols.map((c) => ({ rank: c.spec.rank, objs: names(c.col).filter(Boolean) })) },
    ]);
  });

/** Load the game again with other flags (same save), and wait for the home screen. */
async function reopen(page, url) {
  await page.goto(url);
  await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
  await settle(page, "Menu", 1000);
}

async function openBoard(page) {
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Leaderboard"));
  await waitFor(page, () => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    return s.sys.isActive() && s.state !== "loading" && !!s.podium;
  });
  await run(page, 1600); // the podium's entrance
}

const podiumOf = async (page, rank) =>
  (await boardRows(page)).at(-1).podium.find((p) => p.rank === rank).objs;

const status = (page) =>
  page.evaluate(() => ({
    shown: window.__glyTitles.shownId(),
    owns: window.__glyTitles.owns("w_allmighty"),
    isMe: window.__glyAllMighty.AllMighty.isMe(),
    former: !!window.__glySave.data.allMighty?.former,
  }));

test("ALL MIGHTY: the holder wears the gold title everywhere, from the server's answer @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock", "allmighty=me"] });
  await waitFor(page, () => window.__glyTitles.shownId() === "w_allmighty");
  expect(await status(page)).toEqual({ shown: MIGHTY, owns: true, isMe: true, former: true });
  // home: under your name
  expect(await tree(page, "Menu")).toContain(`title:${MIGHTY}`);
  // it can't be picked or uploaded as a normal title (the server decides who shows it)
  expect(await page.evaluate(() => window.__glyTitles.equip("w_allmighty"))).toBe(false);
  expect(await page.evaluate(() => window.__glyTitles.equippedId())).toBe(null);
  // leaderboard: your #1 place on the podium and your pinned row, no Former badge while holding
  await openBoard(page);
  const top = await podiumOf(page, 1);
  expect(top).toContain(`title:${MIGHTY}`);
  expect(top).not.toContain("formerBadge");
  expect((await boardRows(page))[0].id).toBe("me");
  const you = await tree(page, "Leaderboard", "you");
  expect(you).toContain(`title:${MIGHTY}`);
  expect(you).not.toContain("formerBadge");
  // nobody else's row shows it
  const others = await page.evaluate(() =>
    window.__glydrift.scene
      .getScene("Leaderboard")
      .rows.filter((r) => r.player_id !== "me")
      .filter((r) => window.__glyTitles.forRow(r) === "w_allmighty").length,
  );
  expect(others).toBe(0);
  // profile (Progress)
  await page.evaluate(() => window.__glydrift.scene.getScene("Leaderboard").scene.start("Progress"));
  await settle(page, "Progress", 600);
  expect(await tree(page, "Progress")).toContain(`title:${MIGHTY}`);
  expect(log.errors).toEqual([]);
});

test("ALL MIGHTY: a non-holder doesn't get it; the holder's row shows it @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, {
    flags: ["lbmock"], // (the mock server's default: NeonAce holds it, Kestrel held it before)
    save: { ...SAVE, titles: { owned: { t_gold: true }, equipped: "t_gold" } },
  });
  await waitFor(page, () => !!window.__glyAllMighty.AllMighty.holderId());
  expect(await status(page)).toEqual({ shown: "t_gold", owns: false, isMe: false, former: false });
  expect(await tree(page, "Menu")).not.toContain(`title:${MIGHTY}`);
  await openBoard(page);
  const rows = await boardRows(page);
  expect(rows[0]).toMatchObject({ id: "mock-0", name: "NeonAce" });
  // the #1 Score place: ALL MIGHTY (from the server's answer, not its own title column)
  expect(await podiumOf(page, 1)).toContain(`title:${MIGHTY}`);
  // Kestrel (#5) held it before: the Former badge
  expect(rows[4]).toMatchObject({ id: "mock-4" });
  expect(await podiumOf(page, 5)).toContain("formerBadge");
  for (const r of [2, 3, 4]) expect(await podiumOf(page, r)).not.toContain(`title:${MIGHTY}`);
  // you (#12): your own title, no ALL MIGHTY, no badge
  const you = await tree(page, "Leaderboard", "you");
  expect(you).toContain("title:t_gold");
  expect(you).not.toContain(`title:${MIGHTY}`);
  expect(you).not.toContain("formerBadge");
  // a row that claims the title itself is ignored
  expect(
    await page.evaluate(() => window.__glyTitles.forRow({ player_id: "x", title: "w_allmighty" })),
  ).toBe(null);
  expect(log.errors).toEqual([]);
});

test("ALL MIGHTY: a former holder keeps the badge after losing #1 (offline too) @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page, { flags: ["lbmock", "allmighty=me"] });
  await waitFor(page, () => window.__glyTitles.shownId() === "w_allmighty");
  // the server's next answer: NeonAce took #1 (and its history doesn't even list you: the save
  // alone keeps the badge)
  await reopen(page, page.url().replace("allmighty=me", "allmighty=other"));
  await waitFor(page, () => window.__glyAllMighty.AllMighty.holderId() === "mock-0");
  expect(await status(page)).toEqual({ shown: null, owns: false, isMe: false, former: true });
  expect(await tree(page, "Menu")).not.toContain(`title:${MIGHTY}`);
  await openBoard(page);
  expect(await podiumOf(page, 1)).toContain(`title:${MIGHTY}`); // NeonAce's now
  const rows = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Leaderboard");
    return s.rows.findIndex((r) => r.player_id === "me");
  });
  expect(rows).toBe(11); // you're #12 again
  expect(await tree(page, "Leaderboard", "list")).toContain("formerBadge");
  expect(await tree(page, "Leaderboard", "you")).toContain("formerBadge");
  await page.evaluate(() => window.__glydrift.scene.getScene("Leaderboard").scene.start("Progress"));
  await settle(page, "Progress", 600);
  expect(await tree(page, "Progress")).toContain("formerBadge");
  // offline, no mock server: the badge stays (it's in the save), the title doesn't come back
  await reopen(page, page.url().replace(/&?lbmock/, "").replace(/&?allmighty=other/, ""));
  expect(await status(page)).toEqual({ shown: null, owns: false, isMe: false, former: true });
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Progress"));
  await settle(page, "Progress", 600);
  expect(await tree(page, "Progress")).toContain("formerBadge");
  expect(log.errors).toEqual([]);
});

test("ALL MIGHTY: offline never crashes or grants it (a stale cached answer doesn't either) @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page); // (?offline: no network at all)
  expect(await page.evaluate(() => window.__glyAllMighty.refresh({ force: true }))).toBe(false);
  expect(await status(page)).toEqual({ shown: null, owns: false, isMe: false, former: false });
  // a cached "you're #1" from 2 days ago (the server checks daily) doesn't grant it
  await page.evaluate(() => {
    localStorage.setItem(
      "glydrift.allmighty.v1",
      JSON.stringify({ holder: "u1", me: "u1", history: ["u1"], at: Date.now() - 48 * 3600e3 }),
    );
  });
  await reopen(page, page.url());
  expect(await status(page)).toMatchObject({ shown: null, owns: false, isMe: false });
  // the leaderboard says it's offline, without a crash
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Leaderboard"));
  await waitFor(page, () => window.__glydrift.scene.getScene("Leaderboard").state === "error");
  await page.evaluate(() => window.__glydrift.scene.getScene("Leaderboard").scene.start("Progress"));
  await settle(page, "Progress", 600);
  expect(await tree(page, "Progress")).not.toContain(`title:${MIGHTY}`);
  expect(log.errors).toEqual([]);
});

test("ALL MIGHTY: logging out (or into another account) drops the old player's title at once @smoke", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page); // (?offline: the refresh can't fetch a new answer)
  // a fresh server answer: this device's player (u1) is #1
  await page.evaluate(() =>
    window.__glyAllMighty.AllMighty.apply({ holder: "u1", holderName: "Ace", since: "", history: ["u1"] }, "u1"),
  );
  await waitFor(page, () => window.__glyTitles.shownId() === "w_allmighty");
  // the session's player changes (log out → a new guest; log in → another account)
  await page.evaluate(() => window.__glyLb.Leaderboard.restart());
  expect(await page.evaluate(() => window.__glyAllMighty.AllMighty.isMe())).toBe(false);
  expect(await page.evaluate(() => window.__glyTitles.shownId())).not.toBe("w_allmighty");
  await settle(page, "Menu", 300);
  expect(await tree(page, "Menu")).not.toContain(`title:${MIGHTY}`);
  // and it stays gone after a reload (the cached answer no longer says "you")
  await reopen(page, page.url());
  expect(await page.evaluate(() => window.__glyAllMighty.AllMighty.isMe())).toBe(false);
  // the holder's own row on a board still shows it (that doesn't depend on who you are)
  expect(await page.evaluate(() => window.__glyAllMighty.AllMighty.holderId())).toBe("u1");
  expect(log.errors).toEqual([]);
});
