"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLiveEvents } from "../live";
import type { TeamView } from "@/lib/sports/teams";
import { TeamLogo } from "../sports/TeamLogo";

export type WireItem = { text: string; href: string | null; at: number; label?: string; teams?: TeamView[] };
export type WireQuote = { symbol: string; name: string; price: number; changePct: number };

const INDEX: Record<string, string> = { SPY: "S&P 500", QQQ: "NASDAQ", DIA: "DOW", IWM: "RUSSELL" };

/**
 * The ticker under the header: breaking news and market moves scroll past in
 * one continuous band. Hover or focus pauses it; reduced-motion users get a
 * still, swipeable row instead. Breaking items set in the Control Room arrive
 * live (no reload) through the event stream.
 */
export function LiveWire({ items, quotes: initialQuotes = [], demo }: { items: WireItem[]; quotes?: WireQuote[]; demo?: boolean }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const path = usePathname();
  const [allQuotes, setQuotes] = useState(initialQuotes);
  useEffect(() => setQuotes(initialQuotes), [initialQuotes]);
  // The Market Board has its own stock tape, so the wire carries only news there.
  const quotes = path?.startsWith("/markets") ? [] : allQuotes;
  useLiveEvents((e) => {
    if (e.type === "wire") router.refresh();
  });
  // Market moves refresh every 30s while the tab is visible.
  useEffect(() => {
    if (!initialQuotes.length) return;
    const syms = initialQuotes.map((q) => q.symbol).join(",");
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/markets?symbols=${syms}`).catch(() => null);
      if (r?.ok) setQuotes(((await r.json()) as { quotes: WireQuote[] }).quotes);
    }, 30_000);
    return () => clearInterval(t);
  }, [initialQuotes]);

  if (!items.length && !quotes.length) return null;
  const breaking = items[0]?.label === "Breaking" || items[0]?.label === "Alert";

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={`w${i}`} className="flex items-center gap-2.5 pr-8">
          {it.label && !(breaking && i === 0) && (
            <span className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.12em] uppercase ${it.label === "Breaking" || it.label === "Alert" ? "bg-[var(--wn-red-fill)] text-white" : "bg-white/10 text-[#67e8f9]"}`}>
              {it.label}
            </span>
          )}
          {it.teams?.map((t) => <TeamLogo key={t.id} team={t} size="sm" label={false} />)}
          {it.href ? (
            <Link href={it.href} tabIndex={hidden ? -1 : undefined} className="text-[13px] font-semibold whitespace-nowrap text-white hover:text-[#67e8f9] hover:underline">{it.text}</Link>
          ) : (
            <span className="text-[13px] font-semibold whitespace-nowrap text-white">{it.text}</span>
          )}
          <span aria-hidden="true" className="ml-6 h-1 w-1 rounded-full bg-[var(--wn-blue-fill)]" />
        </li>
      ))}
      {quotes.map((q) => {
        const up = q.changePct >= 0;
        return (
          <li key={q.symbol} className="flex items-center gap-2 pr-6">
            <Link href={`/markets?s=${q.symbol}`} tabIndex={hidden ? -1 : undefined} className="mono flex items-center gap-2 text-[12.5px] whitespace-nowrap hover:text-[#67e8f9]">
              <b className="font-bold text-white">{INDEX[q.symbol] ?? q.symbol}</b>
              <span className="text-[#b8c2d9]">{q.price.toFixed(2)}</span>
              <span className={up ? "text-[#34d399]" : "text-[#ff6b81]"}>{up ? "▲" : "▼"} {up ? "+" : ""}{q.changePct.toFixed(2)}%</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
  const seconds = Math.max(30, items.reduce((n, it) => n + it.text.length, 0) * 0.16 + quotes.length * 3.5);

  return (
    <div
      role="region"
      aria-label="Live Wire"
      aria-roledescription="ticker"
      className="relative border-b border-rule bg-[var(--wire-bg)] text-[var(--wire-fg)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto flex h-[var(--wire-h)] max-w-[1320px] items-center">
        <span className={`relative z-10 flex h-full shrink-0 items-center gap-2 pr-3 pl-3 lg:pl-8 ${breaking ? "bg-[var(--wn-red-fill)]" : "bg-[var(--wire-bg)]"}`}>
          <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-white opacity-70 motion-reduce:hidden" /><span className={`relative h-2 w-2 rounded-full ${breaking ? "bg-white" : "bg-[#ff2d4a]"}`} /></span>
          <span className="text-[11px] font-extrabold tracking-[0.14em] text-white uppercase">{breaking ? "Breaking" : "Live"}</span>
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto" data-no-swipe>
          <div
            className="flex w-max items-center pl-4 motion-reduce:!animate-none"
            style={{ animation: `marquee ${seconds}s linear infinite`, animationPlayState: paused ? "paused" : "running" }}
          >
            {row(false)}
            <span className="contents motion-reduce:hidden">{row(true)}</span>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-[var(--wire-bg)] to-transparent" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--wire-bg)] to-transparent" />
        </div>
        {demo && quotes.length > 0 && <span className="mono hidden shrink-0 px-3 text-[10px] tracking-wider text-[#8893ad] lg:block lg:pr-8">PRICES: DEMO</span>}
      </div>
    </div>
  );
}
