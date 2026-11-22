"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MarketMode, Quote } from "@/lib/markets/provider";
import { MiniLine } from "./Charts";
import { fmtPct, fmtPrice } from "./MarketData";

/** Keeps a small set of quotes fresh (every 15s while the tab is visible). */
function useLiveQuotes(initial: Quote[]) {
  const [quotes, setQuotes] = useState(initial);
  const [flash, setFlash] = useState<Record<string, { dir: 1 | -1; n: number }>>({});
  const last = useRef(initial);
  useEffect(() => {
    const syms = initial.map((q) => q.symbol).join(",");
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/markets?symbols=${syms}`).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json()) as { quotes: Quote[] };
      const f: typeof flash = {};
      for (const q of d.quotes) {
        const p = last.current.find((x) => x.symbol === q.symbol);
        if (p && p.price !== q.price) f[q.symbol] = { dir: q.price > p.price ? 1 : -1, n: Date.now() };
      }
      last.current = d.quotes;
      setQuotes(d.quotes);
      setFlash((x) => ({ ...x, ...f }));
    }, 15000);
    return () => clearInterval(t);
  }, [initial]);
  return { quotes, flash };
}

import { INDEX_OF, fundLabel, proxyNote } from "@/lib/markets/universe";

/** Front Page band: the four indexes on navy, linking to the Market Board. */
export function MarketStrip({ initial, mode, label }: { initial: Quote[]; mode: MarketMode; label: string }) {
  const { quotes, flash } = useLiveQuotes(initial);
  return (
    <Link href="/markets" data-market-strip className="card card-hover group mb-8 flex items-stretch overflow-hidden text-white">
      <span className="flex shrink-0 flex-col justify-center bg-[var(--wn-blue-fill)] px-4 py-2.5">
        <span className="font-display text-[18px] leading-none font-extrabold tracking-[0.06em] uppercase">Markets</span>
        <span className="mono mt-1 text-[10.5px] text-white">{label}{mode === "demo" ? " · DEMO" : ""}</span>
      </span>
      <ul className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        {quotes.map((q) => {
          const up = q.change >= 0;
          const f = flash[q.symbol];
          return (
            <li key={q.symbol} className="flex shrink-0 items-center gap-3 border-r border-[var(--wn-glass-border)] px-4 py-2 last:border-r-0 lg:flex-1">
              <span>
                <span className="block text-[12px] font-bold text-ink-2" title={INDEX_OF[q.symbol] ? proxyNote(q.symbol) : undefined}>{fundLabel(q.symbol)}</span>
                <span key={f?.n} className={`mono block rounded-[6px] text-[13px] ${f ? (f.dir > 0 ? "flash-up" : "flash-down") : ""}`}>{fmtPrice(q.price)}</span>
              </span>
              <span className={`mono text-[12px] font-bold ${up ? "text-[#34d399]" : "text-[#ff6b81]"}`}>{up ? "▲" : "▼"} {fmtPct(q.changePct)}</span>
              <span className="hidden xl:block"><MiniLine values={q.series} prevClose={q.prevClose} width={70} height={24} /></span>
            </li>
          );
        })}
      </ul>
      <span className="hidden shrink-0 flex-col justify-center px-4 text-right sm:flex">
        <span className="text-[12px] font-semibold text-[var(--wn-cyan-ink)] group-hover:underline">Trading Floor →</span>
        {quotes.some((q) => INDEX_OF[q.symbol]) && <span className="text-[10.5px] text-ink-3">Index funds, not index levels</span>}
      </span>
    </Link>
  );
}

/** Story page: the stocks tied to this story and how they're trading. */
export function StoryTickers({ initial, mode }: { initial: Quote[]; mode: MarketMode }) {
  const { quotes, flash } = useLiveQuotes(initial);
  return (
    <section aria-labelledby="mkt" className="mt-6">
      <div className="flex items-baseline justify-between border-t border-[var(--wn-glass-border)] pt-3">
        <h2 id="mkt" className="folio text-navy-ink">Market reaction</h2>
        <Link href="/markets" className="mono text-[10.5px] text-ink-3 hover:text-navy-ink">{mode === "demo" ? "SIMULATED PRICES · " : ""}MARKET BOARD →</Link>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quotes.map((q) => {
          const up = q.change >= 0;
          const f = flash[q.symbol];
          return (
            <li key={q.symbol}>
              <Link href={`/markets/${q.symbol}`} className="flex items-center justify-between gap-2 rounded-[var(--r-lg)] border border-rule bg-paper-2 px-3 py-2 transition-colors hover:border-navy-ink">
                <span className="min-w-0">
                  <span className="mono block text-[13px] font-bold text-ink-1">{q.symbol}</span>
                  <span key={f?.n} className={`mono block rounded-[6px] text-[12px] text-ink-2 ${f ? (f.dir > 0 ? "flash-up" : "flash-down") : ""}`}>{fmtPrice(q.price)}</span>
                </span>
                <span className={`mono text-[12px] font-bold ${up ? "text-agree" : "text-disagree"}`}>{up ? "▲" : "▼"} {fmtPct(q.changePct)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
