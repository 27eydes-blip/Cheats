import { getHistory } from "@/lib/markets/history";
import { recentSessions } from "@/lib/markets/clock";
import { beforeEach, describe, expect, it } from "vitest";
import { marketStatus } from "@/lib/markets/clock";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { DEFAULT_WATCHLIST } from "@/lib/markets/universe";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/markets/watchlist";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

// 2026-11-18 is a Wednesday. 15:00 UTC = 10:00 ET (EST, UTC-5).
const WED_10AM_ET = Date.UTC(2026, 10, 18, 15, 0, 0);
const WED_6PM_ET = Date.UTC(2026, 10, 18, 23, 0, 0);
const SAT_NOON_ET = Date.UTC(2026, 10, 21, 17, 0, 0);

describe("market clock", () => {
  it("knows open, after hours, and weekends (ET)", () => {
    expect(marketStatus(WED_10AM_ET)).toMatchObject({ open: true, label: "Market open", minuteOfSession: 30 });
    expect(marketStatus(WED_10AM_ET).nextChangeMs).toBe(6 * 3_600_000); // closes at 4pm
    const after = marketStatus(WED_6PM_ET);
    expect(after).toMatchObject({ open: false, label: "After hours" });
    expect(after.nextChangeMs).toBe(15.5 * 3_600_000); // Thursday 9:30
    const sat = marketStatus(SAT_NOON_ET);
    expect(sat).toMatchObject({ open: false, label: "Closed for the weekend" });
    expect(sat.nextChangeMs).toBe((2 * 24 - 2.5) * 3_600_000); // Monday 9:30
  });
});

describe("demo quotes", () => {
  it("are labeled demo, deterministic, and internally consistent", async () => {
    expect(marketMode()).toBe("demo");
    const [a] = await getQuotes(["AAPL"], WED_10AM_ET);
    const [b] = await getQuotes(["AAPL"], WED_10AM_ET);
    expect(a.price).toBe(b.price);
    expect(a.change).toBeCloseTo(a.price - a.prevClose, 6);
    expect(a.high).toBeGreaterThanOrEqual(a.price);
    expect(a.low).toBeLessThanOrEqual(a.price);
    expect(a.series.length).toBeGreaterThan(2);
    const closed1 = await getQuotes(["SPY"], WED_6PM_ET);
    const closed2 = await getQuotes(["SPY"], WED_6PM_ET + 9_000);
    expect(closed1[0].price).toBe(closed2[0].price); // no movement after the close
  });
});

describe("watchlist", () => {
  it("starts from defaults, adds, removes, validates", async () => {
    const u = await makeUser();
    expect(getWatchlist(u.id)).toEqual(DEFAULT_WATCHLIST);
    expect(getWatchlist(null)).toEqual(DEFAULT_WATCHLIST);
    expect(addToWatchlist(u.id, " $nflx ")).toContain("NFLX");
    expect(removeFromWatchlist(u.id, "AAPL")).not.toContain("AAPL");
    expect(getWatchlist(u.id)).toEqual([...DEFAULT_WATCHLIST.filter((s) => s !== "AAPL"), "NFLX"]);
    expect(() => addToWatchlist(u.id, "not a ticker")).toThrow("Enter a ticker");
    expect(addToWatchlist(u.id, "brk.b")).toContain("BRK.B");
  });
});

describe("price history (demo)", () => {
  const WED_2PM_ET = Date.parse("2026-11-18T19:00:00Z");
  const SAT_NOON_ET = Date.parse("2026-11-21T17:00:00Z");

  it("weekends point at Friday's session", () => {
    expect(recentSessions(3, SAT_NOON_ET)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
  });

  it("returns well-formed candles for every range", async () => {
    for (const [range, min] of [["1D", 50], ["5D", 50], ["1M", 22], ["1Y", 252]] as const) {
      const h = await getHistory("AAPL", range, WED_2PM_ET);
      expect(h.available).toBe(true);
      expect(h.candles.length).toBeGreaterThanOrEqual(min);
      for (const c of h.candles) {
        expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c) - 1e-9);
        expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c) + 1e-9);
        expect(c.v).toBeGreaterThan(0);
      }
      expect(h.candles.map((c) => c.t)).toEqual([...h.candles.map((c) => c.t)].sort((a, b) => a - b));
    }
  });

  it("daily history ends at the live quote and joins yesterday's close", async () => {
    const [q] = await getQuotes(["MSFT"], WED_2PM_ET);
    const { candles } = await getHistory("MSFT", "1M", WED_2PM_ET);
    expect(candles.at(-1)!.c).toBeCloseTo(q.price, 6);
    expect(candles.at(-2)!.c).toBeCloseTo(q.prevClose, 6);
  });
});
