import { marketStatus } from "./clock";
import { TICKER_MAP } from "./universe";

/**
 * Market data with two sources behind one interface:
 *  - "live": Finnhub REST quotes (set FINNHUB_API_KEY). Cached 45s server-side;
 *    intraday series are built from the quotes this server has seen.
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
function seeded(seed: string) {
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
function demoSession(symbol: string, date: string) {
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
const liveCache = new Map<string, { at: number; q: Quote }>();
const history = new Map<string, { date: string; points: number[] }>();

async function liveQuote(symbol: string, now: number): Promise<Quote | null> {
  const hit = liveCache.get(symbol);
  // Finnhub free tier: 60 calls/min. ~40 tickers refreshed every 45s stays under it.
  if (hit && now - hit.at < 45_000) return hit.q;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`, { cache: "no-store" });
    if (!res.ok) return hit?.q ?? null;
    const d = (await res.json()) as FinnhubQuote;
    if (!d || !d.c) return hit?.q ?? null;
    const date = marketStatus(now).sessionDate;
    const h = history.get(symbol);
    const points = h && h.date === date ? h.points : [d.o || d.c];
    if (points[points.length - 1] !== d.c) points.push(d.c);
    if (points.length > 400) points.shift();
    history.set(symbol, { date, points });
    const q: Quote = { symbol, name: TICKER_MAP.get(symbol)?.name ?? symbol, price: d.c, change: d.d, changePct: d.dp, open: d.o, high: d.h, low: d.l, prevClose: d.pc, ts: d.t * 1000 || now, series: [...points] };
    liveCache.set(symbol, { at: now, q });
    return q;
  } catch {
    return hit?.q ?? null;
  }
}

/** Quotes for the given symbols (unknown or unavailable symbols are skipped). */
export async function getQuotes(symbols: string[], now = Date.now()): Promise<Quote[]> {
  const uniq = [...new Set(symbols)].slice(0, 60);
  if (marketMode() === "demo") return uniq.map((s) => demoQuote(s, now));
  const out = await Promise.all(uniq.map((s) => liveQuote(s, now)));
  return out.filter((q): q is Quote => !!q);
}
