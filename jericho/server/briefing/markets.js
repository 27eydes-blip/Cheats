// Futures and Bitcoin for the briefing: direction and percent move only, always marked as
// information, not advice. Free public quote sources, each with a fallback.
//   futures (ES=F, NQ=F, YM=F): Yahoo Finance chart data -> second Yahoo host -> Stooq
//   Bitcoin: CoinGecko -> Yahoo Finance (BTC-USD)
import { keepAliveFetch } from "../net.js";
import { cached } from "./cache.js";

export const DISCLAIMER = "Market moves are for information only, not financial advice.";

const FUTURES = [
  { symbol: "ES=F", name: "S&P 500 futures", short: "the S&P", stooq: "es.f" },
  { symbol: "NQ=F", name: "Nasdaq futures", short: "the Nasdaq", stooq: "nq.f" },
  { symbol: "YM=F", name: "Dow futures", short: "the Dow", stooq: "ym.f" },
];
const HEADERS = { "user-agent": "Mozilla/5.0 (Jericho personal assistant)", accept: "application/json,text/csv,*/*" };

const pct = (now, before) => (Number.isFinite(now) && Number.isFinite(before) && before !== 0 ? ((now - before) / before) * 100 : NaN);
const round2 = (x) => Math.round(x * 100) / 100;

export function fromYahooChart(json) {
  const meta = json?.chart?.result?.[0]?.meta;
  const now = Number(meta?.regularMarketPrice);
  const before = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  const change = pct(now, before);
  if (!Number.isFinite(change)) throw new Error("no price in the reply");
  return { changePct: round2(change), basis: "since the last close" };
}

/** Stooq CSV: Symbol,Date,Time,Open,High,Low,Close. Gives the move since today's open. */
export function fromStooqCsv(csv) {
  const [header, row] = String(csv).trim().split(/\r?\n/);
  if (!row) throw new Error("no rows");
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  const vals = row.split(",");
  const get = (name) => Number(vals[cols.indexOf(name)]);
  const change = pct(get("close"), get("open"));
  if (!Number.isFinite(change)) throw new Error("no price in the reply");
  return { changePct: round2(change), basis: "since today's open" };
}

export function fromCoinGecko(json) {
  const change = Number(json?.bitcoin?.usd_24h_change);
  if (!Number.isFinite(change)) throw new Error("no price in the reply");
  return { changePct: round2(change), basis: "over the last 24 hours" };
}

async function getJson(url) {
  const res = await keepAliveFetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`answered ${res.status}`);
  return res.json();
}

async function yahoo(symbol) {
  let lastErr;
  for (const host of ["query1", "query2"]) {
    try {
      return { ...fromYahooChart(await getJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`)), source: "Yahoo Finance" };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function quoteFuture(f) {
  try {
    return await yahoo(f.symbol);
  } catch {
    const res = await keepAliveFetch(`https://stooq.com/q/l/?s=${f.stooq}&f=sd2t2ohlc&h&e=csv`, { headers: HEADERS });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    return { ...fromStooqCsv(await res.text()), source: "Stooq" };
  }
}

async function quoteBitcoin() {
  try {
    return { ...fromCoinGecko(await getJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true")), source: "CoinGecko" };
  } catch {
    return await yahoo("BTC-USD");
  }
}

const direction = (c) => (Math.abs(c) < 0.05 ? "flat" : c > 0 ? "up" : "down");

export async function getMarkets() {
  try {
    const quotes = await cached("markets", 5 * 60_000, async () => {
      const items = [...FUTURES.map((f) => ({ ...f, get: () => quoteFuture(f) })), { symbol: "BTC", name: "Bitcoin", short: "Bitcoin", get: quoteBitcoin }];
      const settled = await Promise.allSettled(items.map((i) => i.get()));
      const out = settled.map((r, i) => {
        const { get: _g, stooq: _s, ...item } = items[i];
        return r.status === "fulfilled" ? { ...item, ...r.value, direction: direction(r.value.changePct), ok: true } : { ...item, ok: false };
      });
      if (!out.some((q) => q.ok)) throw new Error("no quotes");
      return out;
    });
    return { ok: true, quotes, disclaimer: DISCLAIMER };
  } catch {
    return { ok: false, reason: "couldn't reach the market data", disclaimer: DISCLAIMER };
  }
}
