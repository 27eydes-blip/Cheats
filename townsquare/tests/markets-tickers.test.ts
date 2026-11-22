import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { rateLimit } from "@/lib/ratelimit";
import { resetFinnhub } from "@/lib/markets/finnhub";
import { getHistory, resetLiveHistory } from "@/lib/markets/history";
import { resetLive } from "@/lib/markets/provider";
import { loadUsSymbols, resetSymbolSearch, searchBoard, searchSymbols, symbolInfo } from "@/lib/markets/search";
import { INDEX_ETFS, INDEX_OF, STOCKS, SYMBOL_RE, TICKER_MAP, fundLabel, proxyNote } from "@/lib/markets/universe";
import { addToWatchlist, normalizeSymbol, WATCHLIST_MAX } from "@/lib/markets/watchlist";
import { freshDb, makeUser } from "./helpers";

beforeEach(() => {
  freshDb();
  resetSymbolSearch();
  resetFinnhub();
  resetLive();
  resetLiveHistory();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_CALLS_PER_MIN;
});

describe("board additions", () => {
  it("adds Cloudflare to Technology and the other popular names", () => {
    expect(TICKER_MAP.get("NET")).toMatchObject({ name: "Cloudflare", sector: "Technology" });
    for (const s of ["SNOW", "DDOG", "SHOP", "COIN", "HOOD", "RDDT", "RBLX", "UBER", "ABNB", "PLTR"]) expect(TICKER_MAP.has(s)).toBe(true);
    expect(STOCKS.length).toBe(new Set(STOCKS.map((t) => t.symbol)).size);
  });
});

describe("ticker validation", () => {
  it("allows letters, dots and dashes, up to 10 characters", () => {
    for (const ok of ["NET", "BRK.B", "BF-B", "A", "ABCDEFGHIJ", "RDS.A"]) expect([ok, SYMBOL_RE.test(ok)]).toEqual([ok, true]);
    for (const bad of ["", "ABCDEFGHIJK", "1A", "A1", "A.", "-A", "A..B", "A B", "A/B", "<b>", "net"]) expect([bad, SYMBOL_RE.test(bad)]).toEqual([bad, false]);
    expect(normalizeSymbol(" $net ")).toBe("NET");
    expect(() => normalizeSymbol("drop table")).toThrow(/letters, dots and dashes/);
  });
});

describe("watchlist limit", () => {
  it("holds any valid ticker, up to 50", async () => {
    const u = await makeUser();
    expect(addToWatchlist(u.id, "zzzz")).toContain("ZZZZ"); // any ticker, not just the board's
    let list: string[] = [];
    for (let i = 0; list.length < WATCHLIST_MAX; i++) list = addToWatchlist(u.id, `T${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
    expect(list.length).toBe(50);
    expect(() => addToWatchlist(u.id, "ONEMORE")).toThrow("50");
  });
});

describe("symbol search", () => {
  it("demo: searches the board by ticker or name, exact ticker first", async () => {
    expect(searchBoard("cloudflare")[0]).toMatchObject({ symbol: "NET", name: "Cloudflare", kind: "Stock" });
    expect(searchBoard("NET")[0].symbol).toBe("NET");
    expect(searchBoard("spdr").some((h) => h.kind === "ETF")).toBe(true);
    const r = await searchSymbols("cloudflare");
    expect(r).toMatchObject({ source: "board", hits: [{ symbol: "NET" }] });
    expect(r.note).toMatch(/Demo mode/);
  });

  it("live: uses Finnhub search (U.S. stocks and ETFs only), names exchanges, caches, and falls back when busy", async () => {
    process.env.FINNHUB_API_KEY = "test";
    process.env.FINNHUB_CALLS_PER_MIN = "3";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      calls.push(u.pathname + u.search.replace(/&?token=[^&]*/, ""));
      if (u.pathname.endsWith("/stock/symbol")) return Response.json([{ symbol: "NET", mic: "XNYS", type: "Common Stock", description: "CLOUDFLARE INC - A" }, { symbol: "SKYY", mic: "XNAS", type: "ETP", description: "FIRST TRUST CLOUD COMPUTING ETF" }]);
      return Response.json({ count: 4, result: [
        { description: "CLOUDFLARE INC - A", displaySymbol: "NET", symbol: "NET", type: "Common Stock" },
        { description: "FIRST TRUST CLOUD COMPUTING ETF", displaySymbol: "SKYY", symbol: "SKYY", type: "ETP" },
        { description: "CLOUDFLARE WARRANT", displaySymbol: "NET.WS", symbol: "NET.WS", type: "Warrant" },
        { description: "CLOUDFLARE FRANKFURT", displaySymbol: "8CF.F", symbol: "8CF.F", type: "Common Stock" },
      ] });
    }));
    await loadUsSymbols();
    expect(symbolInfo("NET")).toMatchObject({ exchange: "NYSE", name: "Cloudflare" });
    const r = await searchSymbols("cloudflare");
    expect(r.source).toBe("finnhub");
    expect(r.hits.map((h) => [h.symbol, h.exchange, h.kind])).toEqual([["NET", "NYSE", "Stock"], ["SKYY", "Nasdaq", "ETF"]]);
    expect(calls.some((c) => c.includes("/search?q=cloudflare&exchange=US"))).toBe(true);
    const before = calls.length;
    await searchSymbols("cloudflare");
    expect(calls.length).toBe(before); // cached
    // Budget: 3 a minute, 2 spent; the next new query spends the last one, and then search falls back to the board.
    await searchSymbols("snow");
    const busy = await searchSymbols("datadog");
    expect(busy).toMatchObject({ source: "board", hits: [{ symbol: "DDOG" }] });
    expect(busy.note).toMatch(/busy/);
  });

  it("rate-limits searches per user", () => {
    for (let i = 0; i < 30; i++) rateLimit("marketSearch", "user-1");
    expect(() => rateLimit("marketSearch", "user-1")).toThrow(/too often/);
    expect(() => rateLimit("marketSearch", "user-2")).not.toThrow();
  });
});

describe("charts on the free plan", () => {
  it("5D, 1M and 1Y show a note instead of a chart when the plan has no candles", async () => {
    process.env.FINNHUB_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("/stock/candle") ? new Response("no", { status: 403 }) : Response.json({ c: 10, d: 0.1, dp: 1, h: 11, l: 9, o: 9.9, pc: 9.9, t: 1 }))));
    for (const range of ["5D", "1M", "1Y"] as const) {
      const h = await getHistory("NET", range);
      expect(h).toMatchObject({ available: false, candles: [] });
      expect(h.note).toMatch(/price history/);
    }
  });
});

