import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { marketStatus } from "@/lib/markets/clock";
import { getHistory } from "@/lib/markets/history";
import { getWatchlist } from "@/lib/markets/watchlist";
import { loadUsSymbols, symbolInfo } from "@/lib/markets/search";
import { INDEX_OF, SYMBOL_RE, TICKER_MAP, proxyNote } from "@/lib/markets/universe";
import { MarketData } from "@/components/markets/MarketData";
import { FocusChart } from "@/components/markets/Panels";
import { StockPrice, WatchButton } from "@/components/markets/StockParts";
import { SymbolSearch } from "@/components/markets/SymbolSearch";

export const dynamic = "force-dynamic";

const parse = (raw: string) => {
  const s = decodeURIComponent(raw).trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
};

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const s = parse((await params).ticker);
  if (!s) return { title: "Markets" };
  return { title: `${s} · ${symbolInfo(s).name}`, description: `${symbolInfo(s).name} (${s}): price, today's change and chart.` };
}

/** /markets/NET — any U.S. stock or ETF: price, change, chart and a watchlist button. */
export default async function StockPage({ params }: { params: Promise<{ ticker: string }> }) {
  const symbol = parse((await params).ticker);
  if (!symbol) notFound();
  const viewer = await getViewer();
  const watchlist = getWatchlist(viewer?.id ?? null);
  const t = Date.now();
  void loadUsSymbols(t);
  const [quote] = await getQuotes([symbol], t, { waitMs: 2500 });
  const info = symbolInfo(symbol);
  const h1 = quote ? await getHistory(symbol, "1D", t) : null;
  const mode = marketMode();
  const fund = INDEX_OF[symbol];
  return (
    <div className="dark terminal-grid -mt-px min-h-screen text-white">
      <MarketData initial={quote ? [quote] : []} mode={mode} status={marketStatus(t)} symbols={[symbol]} seriesFor={[symbol]} watchlist={watchlist} focus={symbol} initialHistory={h1?.available ? { symbol, bars: h1.candles } : undefined}>
        <div className="mx-auto max-w-[1100px] px-4 pt-5 pb-16 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/markets" className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-[var(--wn-cyan-ink)] hover:underline">← Trading Floor</Link>
            <SymbolSearch />
          </div>
          <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mono text-[11px] tracking-wider text-white/55">{[info.exchange, info.kind === "ETF" ? "ETF" : info.kind ? "STOCK" : null, TICKER_MAP.get(symbol)?.sector && TICKER_MAP.get(symbol)!.sector !== "Index" ? TICKER_MAP.get(symbol)!.sector.toUpperCase() : null].filter(Boolean).join(" · ") || "U.S. LISTING"}</p>
              <h1 className="mt-1 font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-none font-semibold">
                {symbol} <span className="font-sans text-[clamp(1rem,0.9rem+0.5vw,1.25rem)] font-medium text-white/65">{info.name}</span>
              </h1>
              {fund && <p className="mt-2 text-[13px] text-white/65">Tracks the {fund.index}. {proxyNote(symbol)}.</p>}
            </div>
            <StockPrice symbol={symbol} />
          </header>
          <div className="mt-4"><WatchButton symbol={symbol} /></div>
          <div className="mt-6">
            {quote ? (
              <FocusChart />
            ) : (
              <div role="status" className="rounded-[var(--r-lg)] border border-white/10 bg-[#0b1220]/80 p-6 text-[14px] text-white/75">
                No price for <b className="text-white">{symbol}</b> yet. It may not be a U.S.-listed stock or fund, or the price feed is busy. Try again in a minute.
              </div>
            )}
          </div>
          <p className="mt-6 text-[12px] text-white/50">
            {mode === "demo" ? "Demo mode: this price is simulated and does not reflect real trading. " : "Quotes from Finnhub may be delayed. "}
            Nothing here is investment advice.
          </p>
        </div>
      </MarketData>
    </div>
  );
}
