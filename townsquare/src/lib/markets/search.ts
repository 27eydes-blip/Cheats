import { finnhub } from "./finnhub";
import { marketMode } from "./provider";
import { ALL_TICKERS, SYMBOL_RE, TICKER_MAP } from "./universe";

/**
 * Stock and ETF symbol search for the Markets page.
 *
 * Live: Finnhub's /search (restricted to U.S. listings), through the shared
 * Finnhub budget, cached for 10 minutes per query. The exchange for each hit
 * comes from Finnhub's U.S. symbol list (/stock/symbol), loaded once a day in
 * the background. When the budget is spent or Finnhub fails, the board's own
 * 130 tickers are searched instead, and the answer says so.
 *
 * Demo (no key): the board's own tickers only.
 */
export type SymbolHit = { symbol: string; name: string; exchange: string; kind: "Stock" | "ETF" };
export type SearchResult = { query: string; hits: SymbolHit[]; source: "finnhub" | "board"; note?: string };

const MIC: Record<string, string> = { XNYS: "NYSE", XNAS: "Nasdaq", ARCX: "NYSE Arca", XASE: "NYSE American", BATS: "Cboe BZX", XCBO: "Cboe", IEXG: "IEX" };
/** Finnhub security types we show by default: U.S.-listed stocks and exchange-traded funds. */
const STOCK_TYPES = new Set(["Common Stock", "ADR", "REIT", "Equity WRT"]);
const ETF_TYPES = new Set(["ETP", "ETF"]);

type ListRow = { symbol: string; mic?: string; type?: string; description?: string };
type G = { __symList?: { at: number; map: Map<string, { exchange: string; kind: SymbolHit["kind"] | null; name: string }> }; __symListLoading?: Promise<void>; __searchCache?: Map<string, { at: number; r: SearchResult }> };
const g = globalThis as unknown as G;
const cache = () => (g.__searchCache ??= new Map());
export const resetSymbolSearch = () => void ((g.__symList = undefined), (g.__symListLoading = undefined), cache().clear());

const kindOf = (type?: string): SymbolHit["kind"] | null => (type && ETF_TYPES.has(type) ? "ETF" : type && STOCK_TYPES.has(type) ? "Stock" : null);

/** Load Finnhub's U.S. symbol list (one request, refreshed daily) for exchange names. Never awaited by a search. */
export function loadUsSymbols(now = Date.now()) {
  if (marketMode() !== "live") return;
  if (g.__symList && now - g.__symList.at < 86_400_000) return;
  if (g.__symListLoading) return g.__symListLoading;
  g.__symListLoading = (async () => {
    const r = await finnhub<ListRow[]>("/stock/symbol?exchange=US", now, 20_000);
    if (r.ok && Array.isArray(r.data)) {
      const map = new Map<string, { exchange: string; kind: SymbolHit["kind"] | null; name: string }>();
      for (const row of r.data) if (row.symbol) map.set(row.symbol, { exchange: MIC[row.mic ?? ""] ?? "US", kind: kindOf(row.type), name: row.description ?? "" });
      g.__symList = { at: now, map };
    }
  })().finally(() => (g.__symListLoading = undefined));
  return g.__symListLoading;
}

/** What we know about a symbol without spending a request (board list, then the U.S. symbol list). */
export function symbolInfo(symbol: string): { name: string; exchange: string | null; kind: SymbolHit["kind"] | null } {
  const t = TICKER_MAP.get(symbol);
  const l = g.__symList?.map.get(symbol);
  return { name: t?.name ?? (l?.name ? titleCase(l.name) : symbol), exchange: l?.exchange ?? null, kind: t ? (t.etf ? "ETF" : "Stock") : l?.kind ?? null };
}

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Inc|Corp|Co|Ltd|Plc|Etf|Llc)\b/g, (m) => (m === "Etf" ? "ETF" : m)) : s);

/** Board tickers matching a query: exact ticker first, then ticker prefix, then name words. */
export function searchBoard(query: string, limit = 8): SymbolHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (sym: string, name: string) => {
    const s = sym.toLowerCase(), n = name.toLowerCase();
    if (s === q) return 0;
    if (s.startsWith(q)) return 1;
    if (n.startsWith(q)) return 2;
    if (n.split(/[\s&.-]+/).some((w) => w.startsWith(q))) return 3;
    if (n.includes(q)) return 4;
    return 9;
  };
  return ALL_TICKERS.map((t) => ({ t, s: score(t.symbol, t.name) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.t.symbol.localeCompare(b.t.symbol))
    .slice(0, limit)
    .map(({ t }) => ({ symbol: t.symbol, name: t.name, exchange: symbolInfo(t.symbol).exchange ?? "US", kind: t.etf ? "ETF" : "Stock" }));
}

type FinnhubSearch = { count: number; result: { description: string; displaySymbol: string; symbol: string; type: string }[] };

export async function searchSymbols(raw: string, now = Date.now(), opts: { includeAll?: boolean } = {}): Promise<SearchResult> {
  const query = raw.trim().slice(0, 40);
  if (!query) return { query, hits: [], source: "board" };
  const board = searchBoard(query);
  if (marketMode() !== "live") return { query, hits: board, source: "board", note: "Demo mode: searching the board's own tickers. Set FINNHUB_API_KEY to search every U.S. stock." };
  const key = `${opts.includeAll ? "all" : "us"}:${query.toLowerCase()}`;
  const hit = cache().get(key);
  if (hit && now - hit.at < 10 * 60_000) return hit.r;
  void loadUsSymbols(now);
  const r = await finnhub<FinnhubSearch>(`/search?q=${encodeURIComponent(query)}&exchange=US`, now);
  if (!r.ok) return { query, hits: board, source: "board", note: r.reason === "budget" || r.reason === "limited" ? "Search is busy right now; showing stocks on the board. Try again in a minute." : "Search is unavailable right now; showing stocks on the board." };
  const seen = new Set<string>();
  const hits: SymbolHit[] = [];
  for (const x of r.data?.result ?? []) {
    const sym = (x.displaySymbol || x.symbol || "").toUpperCase();
    if (!SYMBOL_RE.test(sym) || seen.has(sym)) continue;
    const kind = kindOf(x.type);
    if (!kind && !opts.includeAll) continue;
    seen.add(sym);
    const info = symbolInfo(sym);
    hits.push({ symbol: sym, name: TICKER_MAP.get(sym)?.name ?? titleCase(x.description || sym), exchange: info.exchange ?? "US", kind: kind ?? "Stock" });
  }
  // Board tickers that match exactly or by prefix float to the top (people usually mean them).
  const exact = hits.filter((h) => h.symbol.toLowerCase() === query.toLowerCase());
  const ordered = [...exact, ...hits.filter((h) => !exact.includes(h))].slice(0, 10);
  const result: SearchResult = { query, hits: ordered.length ? ordered : board, source: ordered.length ? "finnhub" : "board" };
  cache().set(key, { at: now, r: result });
  if (cache().size > 500) cache().delete(cache().keys().next().value!);
  return result;
}
