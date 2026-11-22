# Overnight run

## Summary
(filled in at the end)

## Job order
Your message ended with an empty "JOBS (in order):" list. I took the three requests written just above it as tonight's jobs, in the order you wrote them:
1. tickers-v1: look up any stock
2. heatmap-v1: futuristic 3D heatmap above the Big Board
3. ads-v1: brief premium sponsored banners

## Log

### 1. tickers-v1: look up any stock — SHIPPED
- Commit on news-v1: `b30d0057`. Screenshots are on the `tickers-v1` branch only.
- Checks before shipping: 304 unit tests, production build, gate (/, /markets, /markets/NET, /markets/DIA, /business, /news, /sports) and the visual suite (52) all passed. The four markets snapshots were updated on purpose (search box, index labels, more stocks).
- What changed:
  - 10 more names on the board (Cloudflare and others), now 120 stocks.
  - A symbol search box using Finnhub search.
  - Stock pages at `/markets/<ticker>`.
  - Watchlists take any valid ticker, up to 50.
  - Honest index labels ("Tracked via SPY ETF, not the index level").
- Please check:
  - With `FINNHUB_API_KEY` set, search "cloudflare" on /markets. You should see NET with its exchange (NYSE). This was only tested with fake Finnhub responses, because this workspace can't reach Finnhub.
  - Open /markets/NET, add it to your watchlist, and confirm it shows on /markets with a live price.
