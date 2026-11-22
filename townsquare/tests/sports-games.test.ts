import { beforeEach, describe, expect, it } from "vitest";
import { all, get } from "@/lib/db";
import { getGame, headToHead, mapStatus, matchTeam, parseEvent, parseTableRow, scoreboard, seasonFor, standings, syncAllSports, syncLeague, teamSchedule, teamStanding, resetTeamIndex } from "@/lib/sports/games";
import { freshDb } from "./helpers";

const T = Date.UTC(2026, 10, 22, 18, 0); // Sun 22 Nov 2026, 18:00 UTC
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const H = 3_600_000;

/** Sample events in TheSportsDB's v1 shape. */
const ev = (o: Record<string, unknown>) => ({
  idEvent: "1",
  strEvent: "",
  idLeague: "4391",
  strLeague: "NFL",
  strSeason: "2026",
  intRound: "12",
  strHomeTeam: "Kansas City Chiefs",
  strAwayTeam: "Buffalo Bills",
  idHomeTeam: "134931",
  idAwayTeam: "134918",
  intHomeScore: null,
  intAwayScore: null,
  dateEvent: "2026-11-23",
  strTime: "01:20:00",
  strTimestamp: "2026-11-23T01:20:00",
  strVenue: "Arrowhead Stadium",
  strStatus: "Not Started",
  strPostponed: "no",
  ...o,
});

function fakeFetch(map: Record<string, unknown>, log: string[] = []) {
  return async (url: string) => {
    log.push(url);
    const hit = Object.entries(map).find(([k]) => url.includes(k));
    if (!hit) return new Response(JSON.stringify({ events: null }), { status: 200 });
    if (hit[1] instanceof Response) return hit[1];
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  };
}

beforeEach(() => {
  freshDb();
  resetTeamIndex();
  delete process.env.SPORTS_DATA_KEY;
});

describe("parsing provider data", () => {
  it("reads an upcoming event with a UTC timestamp", () => {
    const g = parseEvent(ev({}), "NFL", T)!;
    expect(g).toMatchObject({ id: "1", status: "scheduled", homeName: "Kansas City Chiefs", awayName: "Buffalo Bills", venue: "Arrowhead Stadium", homeScore: null, round: "12", season: "2026" });
    expect(g.startsAt).toBe(Date.UTC(2026, 10, 23, 1, 20));
    expect(g.timeKnown).toBe(true);
  });

  it("falls back to the date when there is no timestamp, marking the time unknown", () => {
    const g = parseEvent(ev({ strTimestamp: "", strTime: "00:00:00" }), "NFL", T)!;
    expect(g.timeKnown).toBe(false);
    expect(new Date(g.startsAt).toISOString().slice(0, 10)).toBe("2026-11-23");
  });

  it("maps finished, live, postponed and canceled games", () => {
    expect(parseEvent(ev({ strStatus: "Match Finished", intHomeScore: "27", intAwayScore: "24", strTimestamp: iso(T - 5 * H) }), "NFL", T)).toMatchObject({ status: "final", homeScore: 27, awayScore: 24 });
    expect(parseEvent(ev({ strStatus: "FT", intHomeScore: "2", intAwayScore: "2", strTimestamp: iso(T - 3 * H) }), "EPL", T)!.status).toBe("final");
    expect(parseEvent(ev({ strStatus: "Q3", intHomeScore: "14", intAwayScore: "10", strTimestamp: iso(T - H) }), "NFL", T)).toMatchObject({ status: "live", detail: "Q3" });
    expect(parseEvent(ev({ strPostponed: "yes" }), "NFL", T)!.status).toBe("postponed");
    expect(parseEvent(ev({ strStatus: "Cancelled" }), "NFL", T)!.status).toBe("canceled");
    expect(mapStatus("", T - 10 * H, true, T)).toBe("final");
    expect(mapStatus("", T + H, false, T)).toBe("scheduled");
    expect(mapStatus("2H", T - H, true, T)).toBe("live");
    expect(mapStatus("Bottom 7th", T - H, true, T)).toBe("live");
  });

  it("skips unusable events and never shows a score for a game not yet played", () => {
    expect(parseEvent({ idEvent: "x" }, "NFL", T)).toBeNull();
    expect(parseEvent(ev({ strTimestamp: "", dateEvent: "" }), "NFL", T)).toBeNull();
    expect(parseEvent(ev({ intHomeScore: "0", intAwayScore: "0" }), "NFL", T)!.homeScore).toBeNull();
  });

  it("reads a table row", () => {
    expect(parseTableRow({ intRank: "1", strTeam: "Arsenal", intPlayed: "12", intWin: "9", intLoss: "1", intDraw: "2", intPoints: "29", intGoalDifference: "18", strForm: "WWDWL", strSeason: "2026-2027", strDescription: "Promotion - Champions League" }, "EPL")).toMatchObject({
      rank: 1, teamName: "Arsenal", wins: 9, losses: 1, draws: 2, points: 29, goalDiff: 18, form: "WWDWL",
    });
    expect(parseTableRow({ strTeam: "Nobody" }, "EPL")).toBeNull();
  });
});

describe("team matching", () => {
  it("matches provider names to our teams, including common short forms", () => {
    expect(matchTeam("NFL", "Kansas City Chiefs")).toBe("nfl-kc");
    expect(matchTeam("EPL", "Arsenal")).toBe("epl-ars");
    expect(matchTeam("EPL", "Brighton and Hove Albion")).toBe("epl-bha");
    expect(matchTeam("EPL", "Man United")).toBe(matchTeam("EPL", "Manchester United"));
    expect(matchTeam("NBA", "LA Clippers")).toBe(matchTeam("NBA", "Los Angeles Clippers"));
    expect(matchTeam("NFL", "Springfield Isotopes")).toBeNull();
  });
});

describe("sync", () => {
  it("stores games and standings for a league, and records errors without losing data", async () => {
    const next = { events: [ev({ idEvent: "n1" }), ev({ idEvent: "n2", strHomeTeam: "Dallas Cowboys", strAwayTeam: "Philadelphia Eagles", strTimestamp: iso(T + 30 * H) })] };
    const past = { events: [ev({ idEvent: "p1", strStatus: "Match Finished", intHomeScore: "31", intAwayScore: "17", strTimestamp: iso(T - 30 * H) })] };
    const table = { table: [{ intRank: "1", strTeam: "Kansas City Chiefs", intPlayed: "11", intWin: "9", intLoss: "2", intDraw: "0", strSeason: "2026" }] };
    const urls: string[] = [];
    const r = await syncLeague("NFL", fakeFetch({ eventsnextleague: next, eventspastleague: past, lookuptable: table }, urls), T);
    expect(r).toMatchObject({ ok: true, games: 3, standings: 1, error: null });
    expect(urls.every((u) => u.startsWith("https://www.thesportsdb.com/api/v1/json/123/"))).toBe(true);
    expect(urls.some((u) => u.includes("lookuptable.php?l=4391&s=2026"))).toBe(true);
    expect(getGame("p1")).toMatchObject({ status: "final", home: { id: "nfl-kc", score: 31 }, away: { id: "nfl-buf", score: 17 } });
    expect(teamStanding("nfl-kc")).toMatchObject({ rank: 1, wins: 9, losses: 2 });

    // A failing endpoint keeps what we had.
    const r2 = await syncLeague("NFL", fakeFetch({ eventsnextleague: new Response("nope", { status: 503 }), eventspastleague: past, lookuptable: { table: null } }), T);
    expect(r2.ok).toBe(true);
    expect(r2.error).toMatch(/eventsnextleague: HTTP 503/);
    expect(getGame("n2")).not.toBeNull();
    expect(standings("NFL")).toHaveLength(1);
  });

  it("uses the paid key from SPORTS_DATA_KEY and never lets a final score go back to scheduled", async () => {
    process.env.SPORTS_DATA_KEY = "paid-key";
    const urls: string[] = [];
    await syncLeague("NFL", fakeFetch({ eventspastleague: { events: [ev({ idEvent: "p1", strStatus: "Match Finished", intHomeScore: "20", intAwayScore: "3", strTimestamp: iso(T - 30 * H) })] } }, urls), T);
    expect(urls[0]).toContain("/json/paid-key/");
    await syncLeague("NFL", fakeFetch({ eventsnextleague: { events: [ev({ idEvent: "p1", strTimestamp: iso(T - 30 * H), strStatus: "" })] } }), T);
    expect(getGame("p1")).toMatchObject({ status: "final", home: { score: 20 } });
  });

  it("marks a league failed only when every request fails", async () => {
    const down = async () => new Response("", { status: 500 });
    const { results } = await syncAllSports({ fetchImpl: down, leagues: ["NBA"] });
    expect(results[0].ok).toBe(false);
    expect(all("SELECT * FROM games")).toHaveLength(0);
  });

  it("guesses the right season string for standings", () => {
    expect(seasonFor("EPL", T)).toBe("2026-2027");
    expect(seasonFor("NBA", Date.UTC(2027, 2, 1))).toBe("2026-2027");
    expect(seasonFor("NFL", Date.UTC(2027, 0, 10))).toBe("2026");
    expect(seasonFor("MLB", T)).toBe("2026");
  });
});

describe("scoreboard and schedules", () => {
  beforeEach(async () => {
    const events = [
      ev({ idEvent: "live", strStatus: "Q2", intHomeScore: "7", intAwayScore: "3", strTimestamp: iso(T - H) }),
      ev({ idEvent: "today", strTimestamp: iso(T + 2 * H) }),
      ev({ idEvent: "tomorrow", strHomeTeam: "Buffalo Bills", strAwayTeam: "Kansas City Chiefs", strTimestamp: iso(T + 26 * H) }),
      ev({ idEvent: "far", strTimestamp: iso(T + 10 * 24 * H) }),
      ev({ idEvent: "yesterday", strStatus: "Match Finished", intHomeScore: "21", intAwayScore: "20", strTimestamp: iso(T - 20 * H) }),
      ev({ idEvent: "old", strStatus: "Match Finished", intHomeScore: "1", intAwayScore: "0", strTimestamp: iso(T - 9 * 24 * H) }),
    ];
    await syncLeague("NFL", fakeFetch({ eventsnextleague: { events } }), T);
  });

  it("splits games into live, today, the next 7 days and recent results", () => {
    const b = scoreboard({ t: T });
    expect(b.live.map((g) => g.id)).toEqual(["live"]);
    expect(b.today.map((g) => g.id)).toEqual(["today"]);
    expect(b.upcoming.map((g) => g.id)).toEqual(["tomorrow"]);
    expect(b.recent.map((g) => g.id)).toEqual(["yesterday"]);
    expect(scoreboard({ t: T, leagues: ["NBA"] }).upcoming).toHaveLength(0);
  });

  it("uses the viewer's time zone for today", () => {
    // 18:00 UTC is 13:00 in New York (UTC-5): "tomorrow" at 20:00 New York the next day still isn't today.
    expect(scoreboard({ t: T, tzOffsetMin: 300 }).today.map((g) => g.id)).toEqual(["today"]);
    // In Tokyo (UTC+9) it is already 03:00 Monday: the 20:00 UTC Sunday game was yesterday's... and "tomorrow" (Mon 20:00 UTC = Tue 05:00) is upcoming.
    expect(scoreboard({ t: T, tzOffsetMin: -540 }).today.map((g) => g.id)).toEqual(["today"]);
  });

  it("gives a team its next games, recent results and head-to-head", () => {
    const s = teamSchedule("nfl-kc", T);
    expect(s.next.map((g) => g.id)).toEqual(["live", "today", "tomorrow", "far"]);
    expect(s.last.map((g) => g.id)).toEqual(["yesterday", "old"]);
    expect(headToHead(getGame("tomorrow")!).map((g) => g.id)).toEqual(["yesterday", "old"]);
    expect(get<{ n: number }>("SELECT count(*) n FROM games WHERE home_team_id IS NULL")!.n).toBe(0);
  });
});
