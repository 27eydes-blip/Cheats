import { CLOSE_MIN, EARLY_CLOSE_MIN, OPEN_MIN } from "./clock";
import type { Quote } from "./provider";
import { SECTORS, STOCKS, type Ticker } from "./universe";

/** Client-safe helpers for the trading-floor page (no database, no network). */

export type SortKey = "symbol" | "name" | "sector" | "price" | "change" | "changePct" | "range";
export type SortDir = "asc" | "desc";

/** Where the price sits in today's range, 0 (low) to 1 (high). */
export const rangePos = (q: Pick<Quote, "price" | "high" | "low">) => (q.high > q.low ? Math.min(1, Math.max(0, (q.price - q.low) / (q.high - q.low))) : 0.5);

export type BoardRow = { t: Ticker; q?: Quote };

/** Big-board rows: filtered by sector and search text, then sorted (rows without a quote go last). */
export function boardRows(quotes: Record<string, Quote>, opts: { sector?: string; query?: string; sort: SortKey; dir: SortDir }, list: Ticker[] = STOCKS): BoardRow[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  const rows = list
    .filter((t) => !opts.sector || t.sector === opts.sector)
    .filter((t) => !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    .map((t) => ({ t, q: quotes[t.symbol] }));
  const val = (r: BoardRow): string | number | null => {
    if (opts.sort === "symbol") return r.t.symbol;
    if (opts.sort === "name") return r.t.name;
    if (opts.sort === "sector") return r.t.sector;
    if (!r.q) return null;
    return opts.sort === "range" ? rangePos(r.q) : r.q[opts.sort];
  };
  const sign = opts.dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null || y === null) return x === y ? a.t.symbol.localeCompare(b.t.symbol) : x === null ? 1 : -1;
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
    return c * sign || a.t.symbol.localeCompare(b.t.symbol);
  });
}

export type Breadth = { up: number; down: number; flat: number; total: number; avgPct: number };
export function breadthOf(quotes: (Quote | undefined)[]): Breadth {
  const qs = quotes.filter((q): q is Quote => !!q);
  const up = qs.filter((q) => q.changePct > 0.005).length;
  const down = qs.filter((q) => q.changePct < -0.005).length;
  return { up, down, flat: qs.length - up - down, total: qs.length, avgPct: qs.length ? qs.reduce((a, q) => a + q.changePct, 0) / qs.length : 0 };
}

export type SectorSummary = { key: string; short: string; etf: string; pct: number | null; fromEtf: boolean; breadth: Breadth; leader?: Quote; laggard?: Quote };

/** Each sector's move (its sector ETF when quoted, else the average of its stocks), breadth, and best and worst stock. */
export function sectorSummaries(quotes: Record<string, Quote>): SectorSummary[] {
  return SECTORS.map((s) => {
    const members = STOCKS.filter((t) => t.sector === s.key).map((t) => quotes[t.symbol]).filter((q): q is Quote => !!q);
    const breadth = breadthOf(members);
    const etf = quotes[s.etf];
    const sorted = [...members].sort((a, b) => b.changePct - a.changePct);
    return { key: s.key, short: s.short, etf: s.etf, pct: etf ? etf.changePct : members.length ? breadth.avgPct : null, fromEtf: !!etf, breadth, leader: sorted[0], laggard: sorted.at(-1) };
  });
}

/** The trading day on a 4:00 AM to 8:00 PM ET rail: where the bells sit and where "now" is, each 0 to 1. */
export function sessionRail(etMinutesNow: number, earlyClose: boolean) {
  const start = 4 * 60, end = 20 * 60;
  const at = (m: number) => Math.min(1, Math.max(0, (m - start) / (end - start)));
  return { open: at(OPEN_MIN), close: at(earlyClose ? EARLY_CLOSE_MIN : CLOSE_MIN), now: at(etMinutesNow) };
}

/** "1d 02:14:33" / "02:14:33" for a countdown. */
export function fmtCountdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400);
  const hms = [Math.floor((t % 86400) / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return d ? `${d}d ${hms}` : hms;
}
