/**
 * Reference list of well-known U.S. tickers: symbol, company, sector, and an
 * approximate size bucket (for heatmap tile sizes). `base` is only used as the
 * starting point for the DEMO simulator; it is not a real price.
 */
export type Ticker = { symbol: string; name: string; sector: string; size: 1 | 2 | 3; base: number; etf?: boolean };

export const INDEX_ETFS: Ticker[] = [
  { symbol: "SPY", name: "S&P 500", sector: "Index", size: 3, base: 612, etf: true },
  { symbol: "QQQ", name: "Nasdaq-100", sector: "Index", size: 3, base: 528, etf: true },
  { symbol: "DIA", name: "Dow Jones", sector: "Index", size: 3, base: 441, etf: true },
  { symbol: "IWM", name: "Russell 2000", sector: "Index", size: 3, base: 228, etf: true },
];

export const STOCKS: Ticker[] = [
  { symbol: "AAPL", name: "Apple", sector: "Technology", size: 3, base: 231 },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology", size: 3, base: 448 },
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology", size: 3, base: 142 },
  { symbol: "AVGO", name: "Broadcom", sector: "Technology", size: 2, base: 178 },
  { symbol: "ORCL", name: "Oracle", sector: "Technology", size: 2, base: 172 },
  { symbol: "AMD", name: "AMD", sector: "Technology", size: 2, base: 152 },
  { symbol: "CRM", name: "Salesforce", sector: "Technology", size: 1, base: 288 },
  { symbol: "INTC", name: "Intel", sector: "Technology", size: 1, base: 24 },
  { symbol: "GOOGL", name: "Alphabet", sector: "Communication", size: 3, base: 176 },
  { symbol: "META", name: "Meta Platforms", sector: "Communication", size: 3, base: 584 },
  { symbol: "NFLX", name: "Netflix", sector: "Communication", size: 2, base: 742 },
  { symbol: "DIS", name: "Disney", sector: "Communication", size: 1, base: 101 },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer", size: 3, base: 198 },
  { symbol: "TSLA", name: "Tesla", sector: "Consumer", size: 3, base: 251 },
  { symbol: "HD", name: "Home Depot", sector: "Consumer", size: 2, base: 398 },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer", size: 1, base: 291 },
  { symbol: "NKE", name: "Nike", sector: "Consumer", size: 1, base: 79 },
  { symbol: "WMT", name: "Walmart", sector: "Staples", size: 2, base: 84 },
  { symbol: "COST", name: "Costco", sector: "Staples", size: 2, base: 902 },
  { symbol: "KO", name: "Coca-Cola", sector: "Staples", size: 1, base: 64 },
  { symbol: "PG", name: "Procter & Gamble", sector: "Staples", size: 1, base: 168 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", size: 3, base: 236 },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", size: 2, base: 44 },
  { symbol: "V", name: "Visa", sector: "Financials", size: 2, base: 302 },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials", size: 1, base: 571 },
  { symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", size: 2, base: 468 },
  { symbol: "LLY", name: "Eli Lilly", sector: "Health Care", size: 3, base: 812 },
  { symbol: "UNH", name: "UnitedHealth", sector: "Health Care", size: 2, base: 571 },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Health Care", size: 2, base: 156 },
  { symbol: "PFE", name: "Pfizer", sector: "Health Care", size: 1, base: 26 },
  { symbol: "XOM", name: "ExxonMobil", sector: "Energy", size: 2, base: 118 },
  { symbol: "CVX", name: "Chevron", sector: "Energy", size: 1, base: 157 },
  { symbol: "CAT", name: "Caterpillar", sector: "Industrials", size: 2, base: 389 },
  { symbol: "BA", name: "Boeing", sector: "Industrials", size: 1, base: 154 },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials", size: 1, base: 181 },
  { symbol: "UPS", name: "UPS", sector: "Industrials", size: 1, base: 132 },
];

export const ALL_TICKERS = [...INDEX_ETFS, ...STOCKS];
export const TICKER_MAP = new Map(ALL_TICKERS.map((t) => [t.symbol, t]));
export const DEFAULT_WATCHLIST = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "JPM"];

/** Valid U.S. ticker format (e.g. AAPL, BRK.B). */
export const SYMBOL_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;
