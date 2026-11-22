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

/** The 11 sectors, in board order, each with the sector ETF used as its benchmark. */
export const SECTORS = [
  { key: "Technology", short: "Tech", etf: "XLK", etfName: "Technology Select Sector SPDR", base: 238 },
  { key: "Communication", short: "Comm", etf: "XLC", etfName: "Communication Services Select Sector SPDR", base: 101 },
  { key: "Consumer", short: "Cons Disc", etf: "XLY", etfName: "Consumer Discretionary Select Sector SPDR", base: 221 },
  { key: "Staples", short: "Staples", etf: "XLP", etfName: "Consumer Staples Select Sector SPDR", base: 81 },
  { key: "Financials", short: "Fin", etf: "XLF", etfName: "Financial Select Sector SPDR", base: 51 },
  { key: "Health Care", short: "Health", etf: "XLV", etfName: "Health Care Select Sector SPDR", base: 146 },
  { key: "Energy", short: "Energy", etf: "XLE", etfName: "Energy Select Sector SPDR", base: 91 },
  { key: "Industrials", short: "Indust", etf: "XLI", etfName: "Industrial Select Sector SPDR", base: 141 },
  { key: "Materials", short: "Matls", etf: "XLB", etfName: "Materials Select Sector SPDR", base: 91 },
  { key: "Utilities", short: "Utils", etf: "XLU", etfName: "Utilities Select Sector SPDR", base: 81 },
  { key: "Real Estate", short: "REIT", etf: "XLRE", etfName: "Real Estate Select Sector SPDR", base: 42 },
] as const;
export type SectorKey = (typeof SECTORS)[number]["key"];

export const SECTOR_ETFS: Ticker[] = SECTORS.map((s) => ({ symbol: s.etf, name: s.etfName, sector: "Sector ETF", size: 2, base: s.base, etf: true }));

/** Rates, gold and oil through their best-known ETFs (shown on the "Beyond stocks" strip). */
export const MACRO_ETFS: Ticker[] = [
  { symbol: "TLT", name: "20+ Year Treasury Bond ETF", sector: "Macro", size: 1, base: 89, etf: true },
  { symbol: "GLD", name: "Gold Trust", sector: "Macro", size: 1, base: 248, etf: true },
  { symbol: "USO", name: "United States Oil Fund", sector: "Macro", size: 1, base: 76, etf: true },
  { symbol: "UUP", name: "U.S. Dollar Index Bullish Fund", sector: "Macro", size: 1, base: 28, etf: true },
];
export const MACRO_LABEL: Record<string, string> = { TLT: "Long bonds", GLD: "Gold", USO: "Crude oil", UUP: "U.S. dollar" };

const s = (symbol: string, name: string, sector: SectorKey, size: 1 | 2 | 3, base: number): Ticker => ({ symbol, name, sector, size, base });

export const STOCKS: Ticker[] = [
  // Technology
  s("AAPL", "Apple", "Technology", 3, 231), s("MSFT", "Microsoft", "Technology", 3, 448), s("NVDA", "NVIDIA", "Technology", 3, 142),
  s("AVGO", "Broadcom", "Technology", 2, 178), s("ORCL", "Oracle", "Technology", 2, 172), s("AMD", "AMD", "Technology", 2, 152),
  s("CRM", "Salesforce", "Technology", 1, 288), s("ADBE", "Adobe", "Technology", 1, 512), s("CSCO", "Cisco", "Technology", 1, 58),
  s("ACN", "Accenture", "Technology", 1, 361), s("IBM", "IBM", "Technology", 1, 214), s("QCOM", "Qualcomm", "Technology", 1, 162),
  s("TXN", "Texas Instruments", "Technology", 1, 201), s("INTC", "Intel", "Technology", 1, 24), s("MU", "Micron", "Technology", 1, 102),
  s("NOW", "ServiceNow", "Technology", 1, 1012), s("PLTR", "Palantir", "Technology", 1, 64),
  // Communication
  s("GOOGL", "Alphabet", "Communication", 3, 176), s("META", "Meta Platforms", "Communication", 3, 584), s("NFLX", "Netflix", "Communication", 2, 742),
  s("DIS", "Disney", "Communication", 1, 101), s("TMUS", "T-Mobile US", "Communication", 1, 231), s("VZ", "Verizon", "Communication", 1, 42),
  s("T", "AT&T", "Communication", 1, 22), s("CMCSA", "Comcast", "Communication", 1, 42),
  // Consumer discretionary
  s("AMZN", "Amazon", "Consumer", 3, 198), s("TSLA", "Tesla", "Consumer", 3, 251), s("HD", "Home Depot", "Consumer", 2, 398),
  s("MCD", "McDonald's", "Consumer", 1, 291), s("NKE", "Nike", "Consumer", 1, 79), s("LOW", "Lowe's", "Consumer", 1, 262),
  s("SBUX", "Starbucks", "Consumer", 1, 97), s("BKNG", "Booking Holdings", "Consumer", 1, 4870), s("TJX", "TJX Companies", "Consumer", 1, 119),
  s("CMG", "Chipotle", "Consumer", 1, 58), s("GM", "General Motors", "Consumer", 1, 54), s("F", "Ford", "Consumer", 1, 11),
  // Consumer staples
  s("WMT", "Walmart", "Staples", 2, 84), s("COST", "Costco", "Staples", 2, 902), s("PG", "Procter & Gamble", "Staples", 2, 168),
  s("KO", "Coca-Cola", "Staples", 1, 64), s("PEP", "PepsiCo", "Staples", 1, 162), s("PM", "Philip Morris", "Staples", 1, 128),
  s("MDLZ", "Mondelez", "Staples", 1, 66), s("CL", "Colgate-Palmolive", "Staples", 1, 93), s("TGT", "Target", "Staples", 1, 131),
  // Financials
  s("JPM", "JPMorgan Chase", "Financials", 3, 236), s("BRK.B", "Berkshire Hathaway", "Financials", 2, 468), s("V", "Visa", "Financials", 2, 302),
  s("MA", "Mastercard", "Financials", 2, 521), s("BAC", "Bank of America", "Financials", 2, 44), s("WFC", "Wells Fargo", "Financials", 1, 71),
  s("GS", "Goldman Sachs", "Financials", 1, 571), s("MS", "Morgan Stanley", "Financials", 1, 128), s("C", "Citigroup", "Financials", 1, 68),
  s("AXP", "American Express", "Financials", 1, 281), s("BLK", "BlackRock", "Financials", 1, 1012), s("SCHW", "Charles Schwab", "Financials", 1, 79),
  s("PYPL", "PayPal", "Financials", 1, 84),
  // Health care
  s("LLY", "Eli Lilly", "Health Care", 3, 812), s("UNH", "UnitedHealth", "Health Care", 2, 571), s("JNJ", "Johnson & Johnson", "Health Care", 2, 156),
  s("ABBV", "AbbVie", "Health Care", 1, 178), s("MRK", "Merck", "Health Care", 1, 101), s("TMO", "Thermo Fisher", "Health Care", 1, 528),
  s("ABT", "Abbott", "Health Care", 1, 116), s("ISRG", "Intuitive Surgical", "Health Care", 1, 528), s("AMGN", "Amgen", "Health Care", 1, 288),
  s("PFE", "Pfizer", "Health Care", 1, 26), s("CVS", "CVS Health", "Health Care", 1, 57),
  // Energy
  s("XOM", "ExxonMobil", "Energy", 2, 118), s("CVX", "Chevron", "Energy", 2, 157), s("COP", "ConocoPhillips", "Energy", 1, 108),
  s("SLB", "SLB", "Energy", 1, 43), s("EOG", "EOG Resources", "Energy", 1, 131), s("OXY", "Occidental", "Energy", 1, 51),
  s("PSX", "Phillips 66", "Energy", 1, 134), s("MPC", "Marathon Petroleum", "Energy", 1, 152),
  // Industrials
  s("GE", "GE Aerospace", "Industrials", 2, 181), s("CAT", "Caterpillar", "Industrials", 2, 389), s("RTX", "RTX", "Industrials", 1, 121),
  s("UNP", "Union Pacific", "Industrials", 1, 236), s("HON", "Honeywell", "Industrials", 1, 221), s("BA", "Boeing", "Industrials", 1, 154),
  s("DE", "Deere", "Industrials", 1, 412), s("LMT", "Lockheed Martin", "Industrials", 1, 531), s("UPS", "UPS", "Industrials", 1, 132),
  s("FDX", "FedEx", "Industrials", 1, 281), s("DAL", "Delta Air Lines", "Industrials", 1, 62),
  // Materials
  s("LIN", "Linde", "Materials", 2, 452), s("SHW", "Sherwin-Williams", "Materials", 1, 378), s("APD", "Air Products", "Materials", 1, 318),
  s("FCX", "Freeport-McMoRan", "Materials", 1, 44), s("NEM", "Newmont", "Materials", 1, 46), s("ECL", "Ecolab", "Materials", 1, 247),
  s("DOW", "Dow", "Materials", 1, 42), s("NUE", "Nucor", "Materials", 1, 142),
  // Utilities
  s("NEE", "NextEra Energy", "Utilities", 2, 76), s("SO", "Southern Company", "Utilities", 1, 88), s("DUK", "Duke Energy", "Utilities", 1, 112),
  s("CEG", "Constellation Energy", "Utilities", 1, 241), s("AEP", "American Electric Power", "Utilities", 1, 98), s("D", "Dominion Energy", "Utilities", 1, 56),
  // Real estate
  s("PLD", "Prologis", "Real Estate", 2, 114), s("AMT", "American Tower", "Real Estate", 1, 202), s("EQIX", "Equinix", "Real Estate", 1, 881),
  s("SPG", "Simon Property", "Real Estate", 1, 171), s("O", "Realty Income", "Real Estate", 1, 56), s("PSA", "Public Storage", "Real Estate", 1, 321),
  s("CCI", "Crown Castle", "Real Estate", 1, 101),
];

export const ALL_TICKERS = [...INDEX_ETFS, ...SECTOR_ETFS, ...MACRO_ETFS, ...STOCKS];
export const TICKER_MAP = new Map(ALL_TICKERS.map((t) => [t.symbol, t]));
export const DEFAULT_WATCHLIST = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "JPM"];

/** Valid U.S. ticker format (e.g. AAPL, BRK.B). */
export const SYMBOL_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

/** Live-data refresh priority: indexes first, then sector and macro ETFs, then stocks. */
export function priorityOf(symbol: string): 0 | 1 | 2 {
  const t = TICKER_MAP.get(symbol);
  if (t?.sector === "Index") return 0;
  if (t?.etf) return 1;
  return 2;
}
