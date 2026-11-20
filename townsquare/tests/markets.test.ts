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
    expect(() => addToWatchlist(u.id, "not a ticker")).toThrow("U.S. ticker");
    expect(addToWatchlist(u.id, "brk.b")).toContain("BRK.B");
  });
});
