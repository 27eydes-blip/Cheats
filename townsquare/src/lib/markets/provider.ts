import { marketStatus } from "./clock";
import { finnhub } from "./finnhub";
import { TICKER_MAP, priorityOf } from "./universe";

/**
 * Market data with two sources behind one interface:
 *  - "live": Finnhub REST quotes (set FINNHUB_API_KEY), refreshed in the
 *    background within a per-minute call budget (see finnhub.ts); intraday
 *    series are built from the quotes this server has seen.
 *  - "demo": a deterministic simulator. Every price it returns is synthetic and
 *    the UI labels it DEMO. Used when no key is configured.
 */
export type Quote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  ts: number;
  /** Intraday prices, oldest first (5-minute points in demo mode). */
  series: number[];
};
export type MarketMode = "live" | "demo";

export const marketMode = (): MarketMode => (process.env.FINNHUB_API_KEY ? "live" : "demo");

// ---------------------------------------------------------------- demo simulator
export function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** The whole simulated session for a symbol on a date: 390 one-minute prices. */
const sessionCache = new Map<string, { prevClose: number; path: number[] }>();
export function demoSession(symbol: string, date: string) {
  const key = `${symbol}:${date}`;
  const hit = sessionCache.get(key);
  if (hit) return hit;
  const t = TICKER_MAP.get(symbol);
  const base = t?.base ?? 50 + (seeded(symbol)() * 300);
  const r = seeded(key);
  const prevClose = base * (1 + (r() - 0.5) * 0.06);
  const vol = t?.etf ? 0.00032 : 0.0006 + r() * 0.0006;
  const drift = (r() - 0.5) * (t?.etf ? 0.00002 : 0.00005);
  const path: number[] = [];
  let p = prevClose * (1 + (r() - 0.5) * (t?.etf ? 0.004 : 0.01)); // opening gap
  for (let i = 0; i < 390; i++) {
    const shock = (r() + r() + r() - 1.5) * vol * 1.6;
    p = p * (1 + drift + shock);
    path.push(p);
  }
  const out = { prevClose, path };
  sessionCache.set(key, out);
  if (sessionCache.size > 400) sessionCache.delete(sessionCache.keys().next().value!);
  return out;
}

function demoQuote(symbol: string, now: number): Quote {
  const st = marketStatus(now);
  const { prevClose, path } = demoSession(symbol, st.sessionDate);
  const upto = Math.max(1, st.minuteOfSession + 1);
  const seen = path.slice(0, upto);
  // A small sub-minute wiggle so the tape feels alive between polls (still synthetic).
  const wiggle = st.open ? 1 + (seeded(`${symbol}:${Math.floor(now / 3000)}`)() - 0.5) * (TICKER_MAP.get(symbol)?.etf ? 0.0003 : 0.0008) : 1;
  const price = seen[seen.length - 1] * wiggle;
  const open = path[0];
  const series = seen.filter((_, i) => i % 5 === 0).concat(price);
  return {
    symbol,
    name: TICKER_MAP.get(symbol)?.name ?? symbol,
    price,
    change: price - prevClose,
    changePct: ((price - prevClose) / prevClose) * 100,
    open,
    high: Math.max(...seen, price),
    low: Math.min(...seen, price),
    prevClose,
    ts: now,
    series,
  };
}

// ---------------------------------------------------------------- live (Finnhub)
type FinnhubQuote = { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number };
type Entry = { q?: Quote; at: number; wantedAt: number; tried: number; unknown?: boolean };
/** Latest quote per symbol. Pages read from here and never wait on a full refresh. */
const store = new Map<string, Entry>();
const intraday = new Map<string, { date: string; points: number[] }>();
let refreshing: Promise<void> | null = null;

export function resetLive() {
  store.clear();
  intraday.clear();
  refreshing = null;
}

/** How old a quote may get before it is refetched: indexes fastest; slow when the market is closed. */
function ttl(symbol: string, open: boolean) {
  if (!open) return 15 * 60_000;
  return [20_000, 45_000, 60_000][priorityOf(symbol)];
}

async function fetchQuote(symbol: string, e: Entry, now: number): Promise<"ok" | "budget" | "fail"> {
  const r = await finnhub<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`, now);
  if (!r.ok) {
    if (r.reason === "budget" || r.reason === "limited") return "budget";
    e.tried = now;
    return "fail";
  }
  const d = r.data;
  e.tried = now;
  if (!d || !d.c) {
    // Finnhub answers unknown symbols with zeros.
    e.unknown = !e.q;
    return "fail";
  }
  const date = marketStatus(now).sessionDate;
  const h = intraday.get(symbol);
  const points = h && h.date === date ? h.points : [d.o || d.c];
  if (points[points.length - 1] !== d.c) points.push(d.c);
  if (points.length > 400) points.shift();
  intraday.set(symbol, { date, points });
  e.q = { symbol, name: TICKER_MAP.get(symbol)?.name ?? symbol, price: d.c, change: d.d ?? d.c - d.pc, changePct: d.dp ?? ((d.c - d.pc) / d.pc) * 100, open: d.o, high: d.h, low: d.l, prevClose: d.pc, ts: d.t * 1000 || now, series: [...points] };
  e.at = now;
  return "ok";
}

/**
 * Refresh the stalest quotes that pages asked for in the last 10 minutes,
 * within the shared Finnhub budget: indexes first, then symbols with no quote
 * yet, then the oldest. Stops as soon as the budget is spent.
 */
export async function refreshLive(now = Date.now()) {
  const open = marketStatus(now).open;
  const due = [...store.entries()]
    .filter(([s, e]) => !e.unknown && now - e.wantedAt < 10 * 60_000 && (e.q ? now - e.at > ttl(s, open) : now - e.tried > 15_000))
    .sort(([a, x], [b, y]) => {
      const pa = priorityOf(a), pb = priorityOf(b);
      return Number(pa !== 0) - Number(pb !== 0) || Number(!!x.q) - Number(!!y.q) || pa - pb || (now - y.at) / ttl(b, open) - (now - x.at) / ttl(a, open);
    });
  let i = 0;
  let spent = false;
  const worker = async () => {
    while (!spent && i < due.length) {
      const [s, e] = due[i++];
      if ((await fetchQuote(s, e, now)) === "budget") spent = true;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

function kick(now: number) {
  if (!refreshing) refreshing = refreshLive(now).finally(() => (refreshing = null));
  return refreshing;
}

/**
 * Quotes for the given symbols (unknown or not-yet-loaded symbols are
 * skipped). In live mode this answers from the store and starts a background
 * refresh; it only waits (up to `waitMs`) when some symbol has no quote yet.
 */
export async function getQuotes(symbols: string[], now = Date.now(), opts: { waitMs?: number } = {}): Promise<Quote[]> {
  const uniq = [...new Set(symbols)].slice(0, 200);
  if (marketMode() === "demo") return uniq.map((s) => demoQuote(s, now));
  let missing = false;
  for (const s of uniq) {
    const e = store.get(s) ?? { at: 0, wantedAt: now, tried: 0 };
    e.wantedAt = now;
    store.set(s, e);
    if (!e.q && !e.unknown) missing = true;
  }
  const run = kick(now);
  if (missing) await Promise.race([run, new Promise((r) => setTimeout(r, opts.waitMs ?? 1500))]);
  return uniq.map((s) => store.get(s)?.q).filter((q): q is Quote => !!q);
}

/** Drops the intraday series except for `keep` (keeps big-board payloads small). `null` keeps all. */
export function trimSeries(quotes: Quote[], keep: Set<string> | null) {
  return keep ? quotes.map((q) => (keep.has(q.symbol) ? q : { ...q, series: [] })) : quotes;
}
