import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeMinute, isTradingDay, marketStatus, nextTradingDay, previousTradingDay, recentSessions, upcomingCalendar } from "@/lib/markets/clock";
import { finnhubStats, resetFinnhub, takeToken } from "@/lib/markets/finnhub";
import { getHistory, resetLiveHistory } from "@/lib/markets/history";
import { getQuotes, refreshLive, resetLive, trimSeries } from "@/lib/markets/provider";
import { ALL_TICKERS, SECTORS, STOCKS, TICKER_MAP, priorityOf } from "@/lib/markets/universe";

const et = (iso: string) => Date.parse(iso); // pass explicit offsets

describe("ticker universe", () => {
  it("has 100+ stocks across all 11 sectors, each with its sector ETF, and no duplicates", () => {
    expect(STOCKS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ALL_TICKERS.map((t) => t.symbol)).size).toBe(ALL_TICKERS.length);
    for (const s of SECTORS) {
      expect(STOCKS.filter((t) => t.sector === s.key).length).toBeGreaterThanOrEqual(5);
      expect(TICKER_MAP.get(s.etf)?.etf).toBe(true);
    }
    expect(STOCKS.every((t) => SECTORS.some((s) => s.key === t.sector))).toBe(true);
    expect([priorityOf("SPY"), priorityOf("XLK"), priorityOf("AAPL")]).toEqual([0, 1, 2]);
  });
});

describe("exchange calendar", () => {
  it("closes for holidays, closes early, and skips them when counting sessions", () => {
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(isTradingDay("2026-11-27")).toBe(true);
    expect(closeMinute("2026-11-27")).toBe(13 * 60);
    expect(previousTradingDay("2026-11-27")).toBe("2026-11-25");
    expect(nextTradingDay("2026-11-25")).toBe("2026-11-27");
    expect(nextTradingDay("2026-07-02")).toBe("2026-07-06"); // July 3 observed + weekend
    const thanksgiving = marketStatus(et("2026-11-26T12:00:00-05:00"));
    expect(thanksgiving).toMatchObject({ open: false, label: "Closed for Thanksgiving", holiday: "Thanksgiving", sessionDate: "2026-11-25", nextSession: "2026-11-27", closesAt: "1:00 PM", earlyClose: true });
    expect(thanksgiving.nextChangeMs).toBe(21.5 * 3_600_000); // Friday 9:30
    const friday = marketStatus(et("2026-11-27T12:00:00-05:00"));
    expect(friday).toMatchObject({ open: true, label: "Market open · early close", closesAt: "1:00 PM", minuteOfSession: 150 });
    expect(friday.nextChangeMs).toBe(3_600_000);
    expect(marketStatus(et("2026-11-27T13:30:00-05:00"))).toMatchObject({ open: false, label: "After hours", minuteOfSession: 209 });
    expect(recentSessions(3, et("2026-11-27T10:00:00-05:00"))).toEqual(["2026-11-24", "2026-11-25", "2026-11-27"]);
    expect(upcomingCalendar("2026-11-22", 3).map((e) => e.date)).toEqual(["2026-11-26", "2026-11-27", "2026-12-24"]);
  });

  it("counts down across a daylight-saving change exactly", () => {
    // Friday 2026-10-30 after the close; clocks fall back Sunday Nov 1; Monday opens 9:30 EST.
    const s = marketStatus(et("2026-10-30T17:00:00-04:00"));
    expect(s.nextChangeMs).toBe(et("2026-11-02T09:30:00-05:00") - et("2026-10-30T17:00:00-04:00"));
  });
});

describe("live quotes (Finnhub, mocked)", () => {
  const OPEN = et("2026-11-18T11:00:00-05:00");
  let calls: string[] = [];
  let status = 200;
  beforeEach(() => {
    process.env.FINNHUB_API_KEY = "test-key";
    process.env.FINNHUB_CALLS_PER_MIN = "5";
    resetFinnhub();
    resetLive();
    resetLiveHistory();
    calls = [];
    status = 200;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      calls.push(u.pathname + "?" + (u.searchParams.get("symbol") ?? ""));
      if (status !== 200) return new Response("no", { status });
      if (u.pathname.endsWith("/stock/candle")) return new Response("forbidden", { status: 403 });
      const sym = u.searchParams.get("symbol")!;
      if (sym === "ZZZZ") return Response.json({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 });
      return Response.json({ c: 101, d: 1, dp: 1, h: 102, l: 99, o: 100, pc: 100, t: OPEN / 1000 });
    }));
  });
  afterEach(() => {
    delete process.env.FINNHUB_API_KEY;
    delete process.env.FINNHUB_CALLS_PER_MIN;
    vi.unstubAllGlobals();
  });

  it("stays inside the per-minute budget, indexes first, and fills the rest later", async () => {
    const syms = ["AAPL", "MSFT", "NVDA", "SPY", "XLK", "QQQ", "TSLA", "AMZN"];
    const first = await getQuotes(syms, OPEN);
    expect(calls.length).toBe(5);
    expect(calls.slice(0, 2).map((c) => c.split("?")[1]).sort()).toEqual(["QQQ", "SPY"]);
    expect(first.length).toBe(5);
    expect(first.find((q) => q.symbol === "SPY")).toMatchObject({ price: 101, prevClose: 100, changePct: 1 });
    // A poll 10 seconds later answers at once from the store; nothing is refetched yet.
    calls = [];
    const again = await getQuotes(syms, OPEN + 10_000);
    expect(again.length).toBeGreaterThanOrEqual(5);
    // A minute later the budget has refilled and the missing symbols arrive.
    await refreshLive(OPEN + 70_000);
    const later = await getQuotes(syms, OPEN + 71_000);
    expect(later.map((q) => q.symbol).sort()).toEqual([...syms].sort());
    expect(finnhubStats().calls).toBeLessThanOrEqual(5 + 6);
  });

  it("keeps serving the last good quote when the provider fails or rate-limits", async () => {
    await getQuotes(["SPY"], OPEN);
    status = 429;
    await refreshLive(OPEN + 30_000);
    const [q] = await getQuotes(["SPY"], OPEN + 31_000);
    expect(q.price).toBe(101);
    expect(takeToken(Date.now())).toBe(false); // paused for a minute after a 429
  });

  it("skips symbols the provider doesn't know", async () => {
    const out = await getQuotes(["ZZZZ", "SPY"], OPEN);
    expect(out.map((q) => q.symbol)).toEqual(["SPY"]);
    calls = [];
    await refreshLive(OPEN + 120_000);
    expect(calls.some((c) => c.endsWith("ZZZZ"))).toBe(false);
  });

  it("history: a plan without candles falls back to a quote line and stops asking", async () => {
    await getQuotes(["AAPL"], OPEN);
    const h = await getHistory("AAPL", "1D", OPEN + 1000);
    expect(h.available).toBe(true);
    expect(h.note).toMatch(/built from quotes/);
    calls = [];
    await getHistory("AAPL", "1M", OPEN + 2000);
    expect(calls.filter((c) => c.includes("candle"))).toEqual([]);
  });

  it("trims series to the symbols that draw a line", () => {
    const q = { symbol: "A", series: [1, 2] } as never;
    expect(trimSeries([q], new Set(["B"]))[0]).toMatchObject({ series: [] });
    expect(trimSeries([q], null)[0]).toBe(q);
  });
});
