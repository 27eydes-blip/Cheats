# Overnight run

## Summary
**All three jobs shipped to `news-v1`.** None failed, none were skipped, and no reverts were needed. Before each ship, all unit tests (330 by the end), the production build, the gate and the visual suite (52) passed.

| # | Job | Status | Commit |
|---|---|---|---|
| 1 | Look up any stock (tickers-v1) | Shipped | `b30d0057` |
| 2 | 3D heatmap above the Big Board (heatmap-v1) | Shipped | `723530e0` |
| 3 | Brief premium sponsored banners (ads-v1) | Shipped | `b3c0ce74` |

**Check first in the morning**
1. **Did Railway deploy?** Open /markets. You should see the "Look up any stock" box, the glass heatmap above the Big Board table, and index cards that say "Tracked via SPY ETF, not the index level".
2. **Real stock search** (needs `FINNHUB_API_KEY`): search "cloudflare" and you should get NET with its exchange. I couldn't reach Finnhub from here, so it was tested only with fake responses.
3. **Sponsors**: Control Room → Sponsors. Check that Glydrift, Glydaway and Flashdrop have sensible banner headlines; edit any that read oddly. Glydaway and Flashdrop got their own headline shortened to 8 words.

**Which sponsors need a better image**
- **Glydrift**: still uses the generated placeholder. It needs a real wide image: at least 1600×500, with the important part away from the left third, where the text sits.
- **Glydaway and Flashdrop**: those two only exist in your live database, so I couldn't see their images. Control Room → Sponsors now shows "Needs a real image" on any sponsor without one. For each, set the focal point on the important part of its image.

**Decisions for you**
- **Job order**: your message ended with an empty "JOBS (in order):" list, so I took the three requests above it as the jobs, in the order you wrote them.
- **Big chart and watchlist position**: your heatmap order put them below the Big Board table. If you want them higher, I can move them.
- **No Volume mode on the heatmap**: live quotes don't include volume, so only "Day change" and "Market cap" are offered.
- **Hide this ad**: it's remembered per device, not per account. Ask if you want it per account (that needs a small table).

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

### 3. ads-v1: brief premium sponsored banners — SHIPPED
- Commit on news-v1: `b3c0ce74`. Screenshots (TEST sponsors) are on the `ads-v1` branch only.
- Checks before shipping: 330 unit tests, production build, gate (/, /admin/sponsors, /admin, /markets, /news) and the visual suite (52) all passed. No snapshots changed, because ads are off in the visual test data.
- What changed:
  - A 140px (phone) / 160px (desktop) banner with the image as background and a readable left gradient.
  - An 8-word headline, a 40-character line, and a brand-colored pill button.
  - The "Sponsored" tag and sponsor name always show; a ••• menu has Hide and Why.
  - A one-time sheen, optional muted motion, and the focal-point picker plus previews in Control Room.
  - Migration 15 (additive) gave the existing sponsors banner copy.
- Please check:
  - In Control Room → Sponsors, open each sponsor: adjust the banner words and set the focal point.
  - Then look at the For You feed on your phone.
