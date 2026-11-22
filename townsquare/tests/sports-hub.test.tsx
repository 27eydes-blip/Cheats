// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSide, GameView } from "@/lib/sports/games";
import type { Board } from "@/lib/sports/hub";
import { pickGameOfDay, parseEventStats } from "@/lib/sports/hub";
import { changedScores, POLL_MS, resultFor, shouldPoll, standingZones, statusLabel } from "@/lib/sports/status";
import { LiveBoardProvider } from "@/components/sports/live/LiveBoard";
import { BoardSections } from "@/components/sports/live/HubParts";
import { GameCard } from "@/components/sports/live/GameCard";
import { KeyStats } from "@/components/sports/live/GameParts";

vi.mock("@/lib/feedtabs", () => ({ getFeedTabs: () => [] }));
vi.mock("@/lib/sports/games", () => ({ dataKey: () => "123", getGame: () => null, scoreboard: () => ({}), teamStanding: () => null }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NY = "America/New_York";
const NOW = Date.UTC(2026, 10, 22, 18, 0); // 1:00 PM in New York
const H = 3_600_000;
const teamSide = (id: string, name: string, score: number | null, logo: string | null = null): GameSide => ({
  id, name, score,
  team: { id, league: "NFL", abbr: id.slice(4).toUpperCase(), city: name.split(" ")[0], name: name.split(" ").slice(1).join(" "), fullName: name, primary: "#E31837", secondary: "#FFB81C", logo, logoSource: logo ? "upload" : "letter", logoMode: "auto", hasUpload: !!logo, hasProviderLogo: false, circle: { letters: id.slice(4).toUpperCase(), fill: "#E31837", text: "#FFFFFF" } },
  badge: { letters: id.slice(4).toUpperCase(), fill: "#E31837", text: "#FFFFFF" },
});
const game = (id: string, o: Partial<GameView> = {}): GameView => ({
  id, league: "NFL", season: "2026", round: "12", startsAt: NOW - H, timeKnown: true, status: "live", detail: "Q3 4:12", venue: "Field",
  home: teamSide("nfl-kc", "Kansas City Chiefs", 17), away: teamSide("nfl-buf", "Buffalo Bills", 14), ...o,
});
const board = (o: Partial<Board> = {}): Board => ({ live: [], today: [], upcoming: [], recent: [], header: [], featured: null, records: {}, myTeams: [], at: NOW, ...o });

describe("status labels", () => {
  it("shows LIVE with the clock, Final, the local start time, or postponed", () => {
    expect(statusLabel(game("a"), NY, NOW)).toMatchObject({ kind: "live", text: "LIVE · Q3 4:12" });
    expect(statusLabel(game("a", { detail: "" }), NY, NOW).text).toBe("LIVE");
    expect(statusLabel(game("a", { detail: "Awaiting final score" }), NY, NOW).text).toBe("Awaiting final score");
    expect(statusLabel(game("a", { status: "final", detail: "OT", startsAt: NOW - 20 * H }), NY, NOW)).toMatchObject({ kind: "final", text: "Final · OT · Yesterday" });
    expect(statusLabel(game("a", { status: "final", detail: "" }), NY, NOW, false).text).toBe("Final");
    expect(statusLabel(game("a", { status: "scheduled", startsAt: NOW + 6.5 * H }), NY, NOW)).toMatchObject({ kind: "scheduled", text: "7:30 PM" });
    expect(statusLabel(game("a", { status: "scheduled", startsAt: NOW + 6.5 * H }), "America/Los_Angeles", NOW).text).toBe("4:30 PM");
    expect(statusLabel(game("a", { status: "scheduled", startsAt: NOW + 24 * H }), NY, NOW).text).toBe("Tomorrow · 1:00 PM");
    expect(statusLabel(game("a", { status: "scheduled", timeKnown: false, startsAt: NOW + 2 * H }), NY, NOW).text).toBe("Time TBA");
    expect(statusLabel(game("a", { status: "postponed" }), NY, NOW).text).toBe("Postponed");
  });

  it("works out wins, losses and draws", () => {
    expect(resultFor(game("a"), "nfl-kc")).toBe("W");
    expect(resultFor(game("a"), "nfl-buf")).toBe("L");
    expect(resultFor(game("a", { home: teamSide("nfl-kc", "Kansas City Chiefs", 7), away: teamSide("nfl-buf", "Buffalo Bills", 7) }), "nfl-kc")).toBe("D");
  });
});

describe("live refresh rules", () => {
  it("polls only while a game is live or about to start", () => {
    expect(shouldPoll([game("a")], NOW)).toBe(true);
    expect(shouldPoll([game("a", { status: "scheduled", startsAt: NOW + 10 * 60_000 })], NOW)).toBe(true);
    expect(shouldPoll([game("a", { status: "scheduled", startsAt: NOW + 2 * H })], NOW)).toBe(false);
    expect(shouldPoll([game("a", { status: "final" })], NOW)).toBe(false);
    expect(shouldPoll([], NOW)).toBe(false);
  });

  it("spots score changes", () => {
    const before = new Map([["a", game("a")], ["b", game("b")]]);
    expect([...changedScores(before, [game("a", { home: teamSide("nfl-kc", "Kansas City Chiefs", 24) }), game("b"), game("c")])]).toEqual(["a"]);
  });

  it("refreshes every 30 seconds without reloading, flashes changed scores, and pauses while hidden", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const first = board({ live: [game("g1")], header: [game("g1")] });
    const updated = board({ live: [game("g1", { home: teamSide("nfl-kc", "Kansas City Chiefs", 24), detail: "Q4 9:01" })], header: [game("g1")], at: NOW + POLL_MS });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(updated)));
    const { container } = render(
      <LiveBoardProvider initial={first} league="NFL" tz={NY} fetchImpl={fetchImpl as unknown as typeof fetch}>
        <BoardSections showLeague />
      </LiveBoardProvider>,
    );
    const card = () => container.querySelector('[data-game-id="g1"]')!;
    expect(card().textContent).toContain("17");
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS - 1);
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/sports/scores?league=NFL", expect.anything());
    expect(card().textContent).toContain("24");
    expect(card().textContent).toContain("Q4 9:01");
    expect(card().className).toContain("score-flash");
    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });
    expect(card().className).not.toContain("score-flash");
    // Hidden tab: no requests.
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 2);
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("doesn't poll when nothing is live", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const fetchImpl = vi.fn();
    render(
      <LiveBoardProvider initial={board({ recent: [game("f", { status: "final" })] })} league={null} tz={NY} fetchImpl={fetchImpl as unknown as typeof fetch}>
        <BoardSections showLeague />
      </LiveBoardProvider>,
    );
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 3);
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("logo fallbacks on game cards", () => {
  it("uses the logo when there is one, the team's color letters when not, and initials for unknown teams", () => {
    const g = game("x", {
      home: teamSide("nfl-kc", "Kansas City Chiefs", 17, "/api/team-logo/nfl-kc?k=upload"),
      away: { id: null, name: "Springfield Isotopes", score: 14, team: null, badge: { letters: "SI", fill: "#3A4256", text: "#FFFFFF" } },
    });
    const { container } = render(<ul><GameCard g={g} tz={NY} now={NOW} /></ul>);
    expect(container.querySelector("img[data-team-logo=image]")?.getAttribute("src")).toContain("nfl-kc");
    const letters = container.querySelectorAll("[data-team-logo=letter]");
    expect(letters).toHaveLength(1);
    expect(letters[0].textContent).toBe("SI");
    expect(container.textContent).toContain("LIVE · Q3 4:12");
    cleanup();
    const { container: c2 } = render(<ul><GameCard g={game("y")} tz={NY} now={NOW} /></ul>);
    expect([...c2.querySelectorAll("[data-team-logo=letter]")].map((e) => e.textContent)).toEqual(["BUF", "KC"]);
  });

  it("uses red only for LIVE", () => {
    const { container } = render(<ul><GameCard g={game("z", { status: "scheduled", startsAt: NOW + 2 * H })} tz={NY} now={NOW} /></ul>);
    expect(container.innerHTML).not.toMatch(/live/);
  });
});

describe("game of the day", () => {
  const mk = (id: string, o: Partial<GameView>) => game(id, o);
  it("prefers a live game with your team, then the best live game, then upcoming, then the latest result", () => {
    const close = mk("close", { home: teamSide("nfl-kc", "Kansas City Chiefs", 21), away: teamSide("nfl-buf", "Buffalo Bills", 20) });
    const blowout = mk("blow", { home: teamSide("nfl-dal", "Dallas Cowboys", 42), away: teamSide("nfl-nyg", "New York Giants", 3) });
    expect(pickGameOfDay({ live: [blowout, close], today: [], upcoming: [], recent: [] }, [], NOW)?.id).toBe("close");
    expect(pickGameOfDay({ live: [close, blowout], today: [], upcoming: [], recent: [] }, ["nfl-dal"], NOW)?.id).toBe("blow");
    const later = mk("later", { status: "scheduled", startsAt: NOW + 5 * H });
    const mine = mk("mine", { status: "scheduled", startsAt: NOW + 7 * H, home: teamSide("nfl-gb", "Green Bay Packers", null) });
    expect(pickGameOfDay({ live: [], today: [later, mine], upcoming: [], recent: [] }, ["nfl-gb"], NOW)?.id).toBe("mine");
    expect(pickGameOfDay({ live: [], today: [later], upcoming: [], recent: [] }, [], NOW)?.id).toBe("later");
    expect(pickGameOfDay({ live: [], today: [], upcoming: [mk("next", { status: "scheduled", startsAt: NOW + 30 * H })], recent: [] }, [], NOW)?.id).toBe("next");
    expect(pickGameOfDay({ live: [], today: [], upcoming: [], recent: [mk("old", { status: "final" })] }, [], NOW)?.id).toBe("old");
    expect(pickGameOfDay({ live: [], today: [], upcoming: [], recent: [] }, [], NOW)).toBeNull();
  });
});

describe("standings zones", () => {
  it("uses the provider's notes, the Premier League's default lines, and nothing otherwise", () => {
    expect(standingZones("NBA", [{ rank: 1, note: "Playoffs" }, { rank: 7, note: "Play-in" }, { rank: 11, note: "" }])).toEqual(["qualify", "playin", null]);
    const epl = Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, note: "" }));
    const z = standingZones("EPL", epl);
    expect(z.slice(0, 5)).toEqual(["qualify", "qualify", "qualify", "qualify", null]);
    expect(z.slice(17)).toEqual(["relegation", "relegation", "relegation"]);
    expect(standingZones("NFL", [{ rank: 1, note: "" }, { rank: 2, note: "" }])).toEqual([null, null]);
  });
});

describe("key stats", () => {
  it("reads the provider's event stats and ignores anything else", () => {
    expect(parseEventStats({ eventstats: [{ strStat: "Total Yards", intHome: "402", intAway: "355" }, { strStat: "", intHome: "1" }, { strStat: "Turnovers", intHome: 0, intAway: 2 }] })).toEqual([
      { label: "Total Yards", home: "402", away: "355" },
      { label: "Turnovers", home: "0", away: "2" },
    ]);
    expect(parseEventStats({ eventstats: null })).toEqual([]);
    expect(parseEventStats("nope")).toEqual([]);
  });

  it("shows the strip when stats exist and skips it cleanly when they don't", async () => {
    const withStats = vi.fn(async () => new Response(JSON.stringify({ stats: [{ label: "Possession", home: "55%", away: "45%" }] })));
    const { container, findByText } = render(<KeyStats gameId="g1" homeName="Chiefs" awayName="Bills" enabled fetchImpl={withStats as unknown as typeof fetch} />);
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull(); // skeleton while loading
    expect(await findByText("Possession")).toBeTruthy();
    cleanup();
    const none = vi.fn(async () => new Response(JSON.stringify({ stats: [] })));
    const r2 = render(<KeyStats gameId="g2" homeName="Chiefs" awayName="Bills" enabled fetchImpl={none as unknown as typeof fetch} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(r2.container.innerHTML).toBe("");
    cleanup();
    const failing = vi.fn(async () => { throw new Error("offline"); });
    const r3 = render(<KeyStats gameId="g3" homeName="Chiefs" awayName="Bills" enabled fetchImpl={failing as unknown as typeof fetch} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(r3.container.innerHTML).toBe("");
    // Scheduled games never ask.
    const never = vi.fn();
    render(<KeyStats gameId="g4" homeName="A" awayName="B" enabled={false} fetchImpl={never as unknown as typeof fetch} />);
    expect(never).not.toHaveBeenCalled();
  });
});
