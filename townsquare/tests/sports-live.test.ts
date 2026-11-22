import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { get, run } from "@/lib/db";
import { callsPerMin, record, resetSportsBudget, take, tryTake, usage } from "@/lib/sports/budget";
import { changedGames, getGame, parseEvent, scoreboard, upsertGame } from "@/lib/sports/games";
import { backoffMs, cadenceMs, dueGames, laneCandidates, laneState, MAX_LOOKUPS, runLiveLane } from "@/lib/sports/livelane";
import { AWAIT_CAP_MS, expectedEndAt, phaseOf, statusLabel, withPhase } from "@/lib/sports/status";
import { GET as changes } from "@/app/api/sports/changes/route";
import { freshDb } from "./helpers";

const H = 3_600_000;
const MIN = 60_000;
const T0 = Date.now();

/** A provider event in TheSportsDB's v1 shape. */
const ev = (id: string, o: Record<string, unknown> = {}) => ({
  idEvent: id, idLeague: "4391", strSeason: "2026", intRound: "12", strHomeTeam: "Kansas City Chiefs", strAwayTeam: "Buffalo Bills",
  strTimestamp: new Date(T0 - H).toISOString().slice(0, 19), strVenue: "Arrowhead", strStatus: "Q3", strProgress: "Q3 4:12", intHomeScore: "17", intAwayScore: "14", strPostponed: "no", ...o,
});
const put = (id: string, o: Record<string, unknown> = {}) => upsertGame(parseEvent(ev(id, o), "NFL", Date.now())!);
const startedAgo = (ms: number) => new Date(Date.now() - ms).toISOString().slice(0, 19);

beforeEach(() => {
  freshDb();
  delete process.env.SPORTS_DATA_KEY;
  delete process.env.SPORTS_CALLS_PER_MIN;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.SPORTS_DATA_KEY;
  delete process.env.SPORTS_CALLS_PER_MIN;
});

describe("status transitions", () => {
  const g = (startsAt: number) => ({ status: "live" as const, league: "NFL" as const, startsAt, detail: "Q4 0:12" });
  const s = T0 - 2 * H;
  const end = expectedEndAt("NFL", s);

  it("live until the expected end, then awaiting for 20 minutes, then Final (unconfirmed)", () => {
    expect(phaseOf(g(s), end - 1)).toBe("live");
    expect(phaseOf(g(s), end)).toBe("awaiting");
    expect(phaseOf(g(s), end + AWAIT_CAP_MS - 1)).toBe("awaiting");
    expect(phaseOf(g(s), end + AWAIT_CAP_MS)).toBe("unconfirmed");
    expect(withPhase(g(s), end + 60_000)).toMatchObject({ status: "live", detail: "Awaiting final score" });
    const u = withPhase(g(s), end + AWAIT_CAP_MS + 1);
    expect(u).toMatchObject({ status: "final", unconfirmed: true });
    expect(statusLabel({ ...u, timeKnown: true }, "America/New_York", end + AWAIT_CAP_MS).text).toBe("Final (unconfirmed)");
    expect(phaseOf({ ...g(s), status: "final" }, end - H)).toBe("final");
  });

  it("marks a game Final the moment the provider says it finished, whatever the clock", () => {
    for (const word of ["Match Finished", "FT", "Final", "Game Over", "AOT", "Full Time", "Ended"]) {
      const p = parseEvent(ev("x", { strStatus: word, strProgress: "" }), "NFL", Date.now())!;
      expect([word, p.status]).toEqual([word, "final"]);
    }
    put("g1");
    expect(getGame("g1")!.status).toBe("live");
    put("g1", { strStatus: "Match Finished", intHomeScore: "27", intAwayScore: "20" });
    expect(getGame("g1")).toMatchObject({ status: "final", detail: "", unconfirmed: false, home: { score: 27 } });
    // A late "live" answer never takes a final back.
    put("g1", { strStatus: "Q4" });
    expect(getGame("g1")!.status).toBe("final");
  });

  it("an overdue game moves from the live list to today's finals with its last score", () => {
    put("old", { strTimestamp: startedAgo(4.5 * H), intHomeScore: "31", intAwayScore: "28" });
    put("now", { strTimestamp: startedAgo(H) });
    const b = scoreboard({ t: Date.now() });
    expect(b.live.map((x) => x.id)).toEqual(["now"]);
    const old = [...b.today, ...b.recent].find((x) => x.id === "old")!;
    expect(old).toMatchObject({ status: "final", unconfirmed: true, home: { score: 31 } });
  });

  it("only real changes move changed_at", () => {
    expect(put("g2")).toBe("new");
    const before = get<{ changed_at: number }>("SELECT changed_at FROM games WHERE id = 'g2'")!.changed_at;
    run("UPDATE games SET changed_at = 1 WHERE id = 'g2'");
    expect(put("g2")).toBe("same");
    expect(get<{ changed_at: number }>("SELECT changed_at FROM games WHERE id = 'g2'")!.changed_at).toBe(1);
    expect(put("g2", { intHomeScore: "24" })).toBe("changed");
    expect(get<{ changed_at: number }>("SELECT changed_at FROM games WHERE id = 'g2'")!.changed_at).toBeGreaterThanOrEqual(before);
  });
});

describe("rate limiting", () => {
  it("allows SPORTS_CALLS_PER_MIN a minute (25 free, 90 paid by default) and refills over time", () => {
    expect(callsPerMin()).toBe(25);
    process.env.SPORTS_DATA_KEY = "paid-key";
    expect(callsPerMin()).toBe(90);
    process.env.SPORTS_CALLS_PER_MIN = "3";
    resetSportsBudget();
    const t = 1_000_000;
    expect([tryTake(t), tryTake(t), tryTake(t), tryTake(t)]).toEqual([true, true, true, false]);
    expect(tryTake(t + 20_000)).toBe(true); // one request back every 20 s at 3/min
    expect(tryTake(t + 20_000)).toBe(false);
  });

  it("pauses everything for a minute after a 429, and counts usage by kind", () => {
    const t = Date.now();
    record("live", "ok", t);
    record("lookup", "ok", t);
    record("lookup", "limited", t, "HTTP 429");
    expect(tryTake(t + 1000)).toBe(false);
    expect(tryTake(t + 61_000)).toBe(true);
    const u = usage(t);
    expect(u).toMatchObject({ lastMinute: 3, lastHour: 3, limitedLastHour: 1, byKind: { live: 1, lookup: 2 } });
    expect(u.lastError).toBe("HTTP 429");
  });

  it("the full sync can wait for budget; it gives up after the wait", async () => {
    process.env.SPORTS_CALLS_PER_MIN = "1";
    resetSportsBudget();
    expect(await take(10)).toBe(true);
    expect(await take(10)).toBe(false);
  });
});

describe("live lane scheduling", () => {
  const c = (o: Partial<Parameters<typeof cadenceMs>[0]> & { checked_at?: number; id?: string } = {}) => ({ id: "c", league: "NFL" as const, status: "live" as const, starts_at: T0 - H, checked_at: 0, ...o });

  it("checks overdue finals every 30 s, live games every 30/60 s, unconfirmed every 5 min", () => {
    const s = T0 - 4 * H;
    const end = expectedEndAt("NFL", s);
    expect(cadenceMs(c({ starts_at: s }), end + MIN, false)).toBe(30_000);
    expect(cadenceMs(c(), T0, false)).toBe(60_000);
    expect(cadenceMs(c(), T0, true)).toBe(30_000);
    expect(cadenceMs(c({ status: "scheduled" }), T0, false)).toBe(60_000);
    expect(cadenceMs(c({ starts_at: s }), end + AWAIT_CAP_MS + 1, false)).toBe(300_000);
    expect(backoffMs(0)).toBe(0);
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  });

  it("puts overdue finals first and skips games checked recently", () => {
    const t = T0;
    const overdue = c({ id: "over", starts_at: t - 3.6 * H });
    const live = c({ id: "live", starts_at: t - H });
    const fresh = c({ id: "fresh", starts_at: t - H, checked_at: t - 10_000 });
    expect(dueGames([live, fresh, overdue], t, false).map((x) => x.id)).toEqual(["over", "live"]);
  });

  it("watches live games and started-but-silent games from the last 12 hours only", () => {
    put("live");
    put("silent", { strStatus: "Not Started", strProgress: "", intHomeScore: null, intAwayScore: null, strTimestamp: startedAgo(10 * MIN) });
    put("later", { strStatus: "Not Started", strProgress: "", intHomeScore: null, intAwayScore: null, strTimestamp: new Date(Date.now() + 3 * H).toISOString().slice(0, 19) });
    put("ancient", { strTimestamp: startedAgo(20 * H) });
    put("done", { strStatus: "FT" });
    expect(laneCandidates().map((x) => x.id).sort()).toEqual(["live", "silent"]);
  });
});

describe("live lane runs", () => {
  type Hit = { url: string };
  const fakeFetch = (respond: (url: string) => Response | Promise<Response>, log: Hit[]) => (async (url: string) => (log.push({ url }), respond(url))) as unknown as typeof fetch;

  it("free key: looks up each due game once, brings in the final, then waits its cadence", async () => {
    put("a", { strTimestamp: startedAgo(3.5 * H) }); // overdue
    put("b");
    const log: Hit[] = [];
    const f = fakeFetch((url) => Response.json({ events: [url.includes("id=a") ? ev("a", { strTimestamp: startedAgo(3.5 * H), strStatus: "Match Finished", intHomeScore: "30", intAwayScore: "27" }) : ev("b", { intHomeScore: "21" })] }), log);
    const r = await runLiveLane({ fetchImpl: f });
    expect(log.map((h) => h.url.match(/lookupevent\.php\?id=(\w+)/)?.[1])).toEqual(["a", "b"]);
    expect(r).toMatchObject({ requests: 2, finals: 1, updated: 2, error: null });
    expect(getGame("a")).toMatchObject({ status: "final", home: { score: 30 } });
    expect(getGame("b")!.home.score).toBe(21);
    // Right away again: nothing is due.
    const again = await runLiveLane({ fetchImpl: f });
    expect(again).toMatchObject({ requests: 0, skipped: "idle" });
    expect(log.length).toBe(2);
  });

  it("paid key: one live-score request per sport covers every live game; finished games get a lookup", async () => {
    process.env.SPORTS_DATA_KEY = "paid-key";
    put("a");
    put("b", { strHomeTeam: "Buffalo Bills", strAwayTeam: "Miami Dolphins" });
    put("gone");
    const log: Hit[] = [];
    const f = fakeFetch((url) => {
      if (url.includes("/livescore/")) return Response.json({ livescore: [ev("a", { intHomeScore: "20" }), ev("b", { strHomeTeam: "Buffalo Bills", strAwayTeam: "Miami Dolphins" })] });
      return Response.json({ events: [ev("gone", { strStatus: "FT" })] });
    }, log);
    const r = await runLiveLane({ fetchImpl: f });
    expect(log.filter((h) => h.url.includes("/livescore/american_football")).length).toBe(1);
    expect(log.filter((h) => h.url.includes("lookupevent")).map((h) => h.url.split("id=")[1])).toEqual(["gone"]);
    expect(r.requests).toBe(2);
    expect(getGame("a")!.home.score).toBe(20);
    expect(getGame("gone")!.status).toBe("final");
  });

  it("stops when the budget runs out and never does more than the lookup cap", async () => {
    for (let i = 0; i < MAX_LOOKUPS + 4; i++) put(`g${i}`);
    const log: Hit[] = [];
    const f = fakeFetch(() => Response.json({ events: [] }), log);
    let left = 3;
    await runLiveLane({ fetchImpl: f, take: () => left-- > 0 });
    expect(log.length).toBe(3);
    resetSportsBudget();
    run("UPDATE games SET checked_at = 0");
    log.length = 0;
    await runLiveLane({ fetchImpl: f });
    expect(log.length).toBe(MAX_LOOKUPS);
  });

  it("backs off after a tick where every request failed, and recovers", async () => {
    put("a");
    const log: Hit[] = [];
    let fail = true;
    const f = fakeFetch(() => (fail ? new Response("down", { status: 503 }) : Response.json({ events: [ev("a")] })), log);
    const r = await runLiveLane({ fetchImpl: f });
    expect(r.error).toBe("HTTP 503");
    expect(laneState().failures).toBe(1);
    const t = Date.now();
    expect(await runLiveLane({ fetchImpl: f, t: t + 10_000 })).toMatchObject({ skipped: "backoff" });
    fail = false;
    run("UPDATE games SET checked_at = 0");
    expect(await runLiveLane({ fetchImpl: f, t: t + 31_000 })).toMatchObject({ requests: 1, error: null });
    expect(laneState().failures).toBe(0);
    expect(usage().errorsLastHour).toBe(1);
  });
});

describe("changed-games endpoint", () => {
  const call = (qs: string, headers: Record<string, string> = {}) => changes(new NextRequest(`http://localhost/api/sports/changes?${qs}`, { headers }));

  it("returns only games changed since the cursor, with an ETag, then 304", async () => {
    put("a");
    put("b");
    const cursor = Date.now();
    run("UPDATE games SET changed_at = ? ", [cursor - 60_000]);
    let res = await call(`since=${cursor}`);
    let body = await res.json();
    expect(body.games).toEqual([]);
    put("a", { intHomeScore: "24" });
    res = await call(`since=${cursor}`);
    body = await res.json();
    expect(body.games.map((x: { id: string }) => x.id)).toEqual(["a"]);
    expect(body.games[0].home.score).toBe(24);
    const tag = res.headers.get("ETag")!;
    expect(tag).toMatch(/^W\//);
    const again = await call(`since=${cursor}`, { "if-none-match": tag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("includes games that crossed into awaiting or unconfirmed on the clock", () => {
    const s = Date.now() - 4 * H;
    put("late", { strTimestamp: new Date(s).toISOString().slice(0, 19) });
    run("UPDATE games SET changed_at = 1");
    const end = expectedEndAt("NFL", s);
    expect(changedGames(end - 1000, { t: end + 1000 }).map((x) => x.detail)).toEqual(["Awaiting final score"]);
    expect(changedGames(end + 1000, { t: end + 2000 })).toEqual([]);
    expect(changedGames(end + AWAIT_CAP_MS - 1000, { t: end + AWAIT_CAP_MS + 1000 })[0]).toMatchObject({ status: "final", unconfirmed: true });
  });

  it("asks for a full reload when the cursor is missing or too old", async () => {
    expect(await (await call("since=0")).json()).toMatchObject({ full: true });
    expect(await (await call(`since=${Date.now() - 7 * H}`)).json()).toMatchObject({ full: true });
  });
});
