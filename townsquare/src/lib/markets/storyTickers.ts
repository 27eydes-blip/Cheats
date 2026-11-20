/**
 * Which stocks move with which Story. Shown as "Market reaction" on the Story
 * page. Keyed by story key; an editor tool can replace this map later.
 */
export const STORY_TICKERS: Record<string, string[]> = {
  fedrates: ["SPY", "JPM", "GS", "BAC"],
  railstrike: ["DIA", "CAT", "UPS", "WMT"],
  antitrust: ["GOOGL", "META", "AAPL", "QQQ"],
  trade: ["CAT", "BA", "TSLA", "GE"],
  "ai-schools": ["MSFT", "NVDA", "GOOGL"],
  hurricane: ["XOM", "CVX", "HD"],
  infrastructure: ["CAT", "GE", "DIA"],
  writers: ["NFLX", "DIS"],
  splashdown: ["BA"],
};

export const storyTickers = (key: string) => STORY_TICKERS[key] ?? [];
