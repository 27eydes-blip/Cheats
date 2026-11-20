import { marketStatus, recentSessions } from "./clock";
import { demoSession, getQuotes, marketMode, seeded } from "./provider";
import { TICKER_MAP } from "./universe";

/** One bar: time (ms, UTC), open/high/low/close, and share volume. */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Range = "1D" | "5D" | "1M" | "1Y";
export const RANGES: Range[] = ["1D", "5D", "1M", "1Y"];
export type History = { symbol: string; range: Range; candles: Candle[]; available: boolean; note?: string };

const OPEN_UTC_OFFSET = (date: string) => {
  // 9:30 ET in UTC ms for a date (handles daylight time via Intl).
  const guess = Date.parse(`${date}T13:30:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(new Date(guess)));
  return guess + (9 - h) * 3_600_000;
};

function avgVolume(symbol: string) {
  const t = TICKER_MAP.get(symbol);
  const r = seeded(`vol:${symbol}`)();
  if (t?.etf) return (symbol === "SPY" ? 70 : symbol === "QQQ" ? 42 : symbol === "IWM" ? 30 : 4) * 1e6;
  return (t?.size ?? 1) * 14e6 * (0.6 + r);
}

/** Bucket a 1-minute path into candles of `size` minutes, with a U-shaped volume profile. */
function bucket(symbol: string, date: string, path: number[], upto: number, size: number, open0: number): Candle[] {
  const start = OPEN_UTC_OFFSET(date);
  const daily = avgVolume(symbol);
  const r = seeded(`v:${symbol}:${date}:${size}`);
  const out: Candle[] = [];
  for (let i = 0; i < upto; i += size) {
    const seg = path.slice(i, Math.min(upto, i + size));
    if (!seg.length) break;
    const o = i === 0 ? open0 : path[i - 1];
    const x = (i + size / 2) / 390;
    const shape = 0.55 + 2.2 * (x - 0.5) ** 2 * 2; // heavier near the open and close
    out.push({ t: start + i * 60_000, o, h: Math.max(o, ...seg), l: Math.min(o, ...seg), c: seg[seg.length - 1], v: Math.round((daily / 390) * size * shape * (0.6 + r() * 0.8)) });
  }
  return out;
}

/** Daily candles for the last `n` sessions (simulated), ending with today's live quote. */
async function demoDaily(symbol: string, n: number, now: number): Promise<Candle[]> {
  const dates = recentSessions(n, now);
  const [q] = await getQuotes([symbol], now);
  const t = TICKER_MAP.get(symbol);
  const vol = t?.etf ? 0.008 : 0.016;
  const out: Candle[] = [];
  // Walk backwards from today's previous close so the series joins today's quote.
  let close = q.prevClose;
  for (let i = dates.length - 2; i >= 0; i--) {
    const r = seeded(`d:${symbol}:${dates[i]}`);
    const ret = (r() + r() + r() - 1.5) * vol * 1.4 + (t?.etf ? 0.0004 : 0.0006);
    const o = close / (1 + ret) * (1 + (r() - 0.5) * vol * 0.6);
    const h = Math.max(o, close) * (1 + r() * vol * 0.6);
    const l = Math.min(o, close) * (1 - r() * vol * 0.6);
    out.unshift({ t: OPEN_UTC_OFFSET(dates[i]), o, h, l, c: close, v: Math.round(avgVolume(symbol) * (0.6 + r() * 0.9)) });
    close = close / (1 + ret);
  }
  const today = dates[dates.length - 1];
  const st = marketStatus(now);
  out.push({ t: OPEN_UTC_OFFSET(today), o: q.open, h: q.high, l: q.low, c: q.price, v: Math.round(avgVolume(symbol) * ((st.minuteOfSession + 1) / 390)) });
  return out;
}

async function demoHistory(symbol: string, range: Range, now: number): Promise<Candle[]> {
  const st = marketStatus(now);
  if (range === "1D") {
    const { path } = demoSession(symbol, st.sessionDate);
    const [q] = await getQuotes([symbol], now);
    const c = bucket(symbol, st.sessionDate, path, st.minuteOfSession + 1, 5, path[0]);
    if (c.length) c[c.length - 1] = { ...c[c.length - 1], c: q.price, h: Math.max(c[c.length - 1].h, q.price), l: Math.min(c[c.length - 1].l, q.price) };
    return c;
  }
  if (range === "5D") {
    // Five sessions of 30-minute bars. Earlier days are bridged to their daily candles so the views agree.
    const days = await demoDaily(symbol, 5, now);
    const dates = recentSessions(5, now);
    const out: Candle[] = [];
    dates.forEach((d, i) => {
      if (i === dates.length - 1) {
        const { path } = demoSession(symbol, d);
        out.push(...bucket(symbol, d, path, st.minuteOfSession + 1, 30, path[0]));
        return;
      }
      const day = days[i];
      const r = seeded(`b:${symbol}:${d}`);
      // Brownian bridge from the day's open to its close, scaled to the day's range.
      const sd = ((day.h - day.l) / Math.sqrt(390)) * 0.9;
      const walk: number[] = [];
      let w = 0;
      for (let m = 0; m < 390; m++) walk.push((w += (r() + r() + r() - 1.5) * sd * 1.4));
      const path = walk.map((v, m) => {
        const frac = (m + 1) / 390;
        return day.o + (day.c - day.o) * frac + (v - frac * walk[389]);
      });
      path[389] = day.c;
      out.push(...bucket(symbol, d, path, 390, 30, day.o));
    });
    return out;
  }
  return demoDaily(symbol, range === "1M" ? 22 : 252, now);
}

// ---------------------------------------------------------------- live (Finnhub candles; needs a plan with history)
const liveHist = new Map<string, { at: number; c: Candle[] }>();
async function liveHistory(symbol: string, range: Range, now: number): Promise<Candle[] | null> {
  const key = `${symbol}:${range}`;
  const hit = liveHist.get(key);
  if (hit && now - hit.at < (range === "1D" ? 60_000 : 15 * 60_000)) return hit.c;
  const res = range === "1D" ? "5" : range === "5D" ? "30" : "D";
  const span = { "1D": 1, "5D": 7, "1M": 31, "1Y": 366 }[range] * 86_400;
  const to = Math.floor(now / 1000);
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${res}&from=${to - span}&to=${to}&token=${process.env.FINNHUB_API_KEY}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { s: string; t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
    if (d.s !== "ok") return null;
    const c = d.t.map((t, i) => ({ t: t * 1000, o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i], v: d.v[i] }));
    liveHist.set(key, { at: now, c });
    return c;
  } catch {
    return null;
  }
}

export async function getHistory(symbol: string, range: Range, now = Date.now()): Promise<History> {
  if (marketMode() === "demo") return { symbol, range, candles: await demoHistory(symbol, range, now), available: true };
  const c = await liveHistory(symbol, range, now);
  if (c?.length) return { symbol, range, candles: c, available: true };
  // Fall back to today's quotes for 1D (line only, no volume).
  if (range === "1D") {
    const [q] = await getQuotes([symbol], now);
    const start = OPEN_UTC_OFFSET(marketStatus(now).sessionDate);
    const step = (now - start) / Math.max(1, (q?.series.length ?? 1) - 1);
    return { symbol, range, available: true, note: "Intraday line built from quotes; volume needs a data plan with candles.", candles: (q?.series ?? []).map((p, i) => ({ t: start + i * step, o: p, h: p, l: p, c: p, v: 0 })) };
  }
  return { symbol, range, candles: [], available: false, note: "Longer ranges need a market-data plan that includes price history." };
}
