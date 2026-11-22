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

### 2. heatmap-v1: futuristic 3D heatmap — SHIPPED
- Commit on news-v1: `723530e0`. Screenshots are on the `heatmap-v1` branch only.
- Checks before shipping: 315 unit tests, production build, gate (/, /markets, /markets/NET) and the visual suite (52) all passed. The markets snapshots were updated on purpose (new page order).
- What changed:
  - A CSS-3D glass heatmap now sits above the Big Board table. Tile height and glow follow the size of each move.
  - Tapping a sector plate zooms in and filters the table.
  - It has a legend and two modes (Day change and Market cap).
  - There's a flat version for phones and for reduced motion.
- Please check:
  - On /markets, scroll to the heatmap: hover a tile on desktop and touch-and-hold one on your phone.
  - Tap a sector, then Back.
  - The big chart and your watchlist now sit below the Big Board table, because of the order you asked for. If you'd rather have them higher, tell me.
