import { AppError } from "../errors";
import { all, get, now, run } from "../db";
import { DEFAULT_WATCHLIST, SYMBOL_RE } from "./universe";

/** Each watchlist holds at most this many symbols. */
export const WATCHLIST_MAX = 50;
const MAX = WATCHLIST_MAX;

export function getWatchlist(userId: string | null): string[] {
  if (!userId) return DEFAULT_WATCHLIST;
  const rows = all<{ symbol: string }>("SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY position, created_at", [userId]);
  return rows.length || get("SELECT 1 FROM site_settings WHERE key = ?", [`watchlist-init:${userId}`]) ? rows.map((r) => r.symbol) : DEFAULT_WATCHLIST;
}

/** First edit copies the default list into the user's own, so removals stick. */
function ensureOwn(userId: string) {
  if (get("SELECT 1 FROM site_settings WHERE key = ?", [`watchlist-init:${userId}`])) return;
  run("INSERT INTO site_settings (key, value) VALUES (?, '1')", [`watchlist-init:${userId}`]);
  if (!get("SELECT 1 FROM watchlist WHERE user_id = ?", [userId])) {
    DEFAULT_WATCHLIST.forEach((s, i) => run("INSERT OR IGNORE INTO watchlist (user_id, symbol, position, created_at) VALUES (?, ?, ?, ?)", [userId, s, i, now()]));
  }
}

export function normalizeSymbol(raw: string) {
  const s = raw.trim().toUpperCase().replace(/^\$/, "");
  if (!SYMBOL_RE.test(s)) throw new AppError("Enter a ticker like AAPL, BRK.B or BF-B (letters, dots and dashes, up to 10 characters).");
  return s;
}

export function addToWatchlist(userId: string, raw: string) {
  const symbol = normalizeSymbol(raw);
  ensureOwn(userId);
  const n = get<{ n: number }>("SELECT count(*) n FROM watchlist WHERE user_id = ?", [userId])!.n;
  if (n >= MAX) throw new AppError(`Your watchlist can hold ${MAX} tickers.`);
  run("INSERT OR IGNORE INTO watchlist (user_id, symbol, position, created_at) VALUES (?, ?, ?, ?)", [userId, symbol, n, now()]);
  return getWatchlist(userId);
}

export function removeFromWatchlist(userId: string, raw: string) {
  const symbol = normalizeSymbol(raw);
  ensureOwn(userId);
  run("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?", [userId, symbol]);
  return getWatchlist(userId);
}
