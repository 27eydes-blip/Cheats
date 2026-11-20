import Link from "next/link";
import { getViewer } from "@/lib/session";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { marketStatus } from "@/lib/markets/clock";
import { getWatchlist } from "@/lib/markets/watchlist";
import { INDEX_ETFS, STOCKS, SYMBOL_RE } from "@/lib/markets/universe";
import { listStories } from "@/lib/news";
import { getHistory } from "@/lib/markets/history";
import { MarketData } from "@/components/markets/MarketData";
import { Breadth, FocusChart, Heatmap, IndexCard, Movers, StatusBar, TickerTape, Watchlist } from "@/components/markets/Panels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Markets", description: "S&P 500, Nasdaq, Dow and your watchlist on a live market board." };

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const want = ((await searchParams).s ?? "").toUpperCase();
  const viewer = await getViewer();
  const watchlist = getWatchlist(viewer?.id ?? null);
  const focus = SYMBOL_RE.test(want) ? want : undefined;
  const symbols = [...new Set([...INDEX_ETFS, ...STOCKS].map((t) => t.symbol).concat(focus ? [focus] : []))];
  const t = Date.now();
  const quotes = await getQuotes([...new Set([...symbols, ...watchlist])], t);
  const stories = listStories(4, { section: "Business", viewerId: viewer?.id ?? null });
  const mode = marketMode();
  const first = focus ?? watchlist[0] ?? "SPY";
  const h1 = await getHistory(first, "1D", t);

  return (
    <div className="dark terminal-grid -mt-px min-h-screen text-white">
      <MarketData initial={quotes} mode={mode} status={marketStatus(t)} symbols={symbols} watchlist={watchlist} focus={focus} initialHistory={h1.available ? { symbol: first, bars: h1.candles } : undefined}>
        <TickerTape />
        <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-16 sm:px-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="folio text-[var(--wn-cyan-ink)]">Markets desk</p>
              <h1 className="mt-1 font-display text-[clamp(2.2rem,1.6rem+2.4vw,3.6rem)] leading-[0.95] font-semibold tracking-tight">
                The Market Board<span className="text-[#22d3ee]">.</span>
              </h1>
            </div>
            <Breadth />
          </header>
          <div className="mt-4 border-y border-white/10 py-3"><StatusBar /></div>

          <section aria-label="Major indexes" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {INDEX_ETFS.map((i) => <IndexCard key={i.symbol} symbol={i.symbol} />)}
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <FocusChart />
            <Watchlist />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Heatmap />
            <div className="flex flex-col gap-6">
              <Movers />
              <section aria-labelledby="mnews" className="rounded-[var(--r-lg)] border border-white/10 bg-[#0b1220]/80 p-4">
                <h2 id="mnews" className="folio mb-2 text-[var(--wn-cyan-ink)]">Business stories</h2>
                <ul className="divide-y divide-white/10">
                  {stories.map((s) => (
                    <li key={s.key}>
                      <Link href={`/news/story/${s.key}`} className="block py-2.5 hover:text-[var(--wn-cyan-ink)]">
                        <span className="font-display text-[16px] leading-snug font-semibold">{s.title}</span>
                        <span className="mono mt-0.5 block text-[10.5px] text-white/50">{s.takes} TAKES{s.split.total ? ` · ${Math.round((s.split.agree / s.split.total) * 100)}% AGREE` : ""}</span>
                      </Link>
                    </li>
                  ))}
                  {stories.length === 0 && <li className="py-3 text-[13px] text-white/50">No business stories yet.</li>}
                </ul>
              </section>
            </div>
          </div>

          <p className="mt-8 max-w-3xl text-[12px] leading-relaxed text-white/50">
            {mode === "demo"
              ? "Demo mode: every price on this page is simulated and does not reflect real trading. Set FINNHUB_API_KEY to show real quotes. "
              : "Quotes from Finnhub may be delayed. "}
            Index levels are shown with ETF proxies (SPY, QQQ, DIA, IWM). Nothing here is investment advice.
          </p>
        </div>
      </MarketData>
    </div>
  );
}
