"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLiveEvents } from "../live";
import type { TeamView } from "@/lib/sports/teams";
import { TeamLogo } from "../sports/TeamLogo";

export type WireItem = { text: string; href: string | null; at: number; label?: string; teams?: TeamView[] };
export type WireQuote = { symbol: string; name: string; price: number; changePct: number };

/** Stable default so the sync effect below doesn't see a new array every render. */
const NO_QUOTES: WireQuote[] = [];
const INDEX: Record<string, string> = { SPY: "S&P 500", QQQ: "NASDAQ", DIA: "DOW", IWM: "RUSSELL" };

/**
 * The ticker under the header: breaking news and market moves scroll past in
 * one continuous band. Hover or focus pauses it; reduced-motion users get a
 * still, swipeable row instead. Breaking items set in the Control Room arrive
 * live (no reload) through the event stream.
 */
export function LiveWire({ items, quotes: initialQuotes = NO_QUOTES, demo, slot }: { items: WireItem[]; quotes?: WireQuote[]; demo?: boolean; /** "layout": the site-wide bar (hidden on the phone home page, where the feed shows its own under the tabs); "home": that in-feed copy */ slot?: "layout" | "home" }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const path = usePathname();
  const [allQuotes, setQuotes] = useState(initialQuotes);
  useEffect(() => setQuotes(initialQuotes), [initialQuotes]);
  // The Market Board has its own stock tape, so the wire carries only news there.
  const quotes = path?.startsWith("/markets") ? [] : allQuotes;
  useLiveEvents((e) => {
    // Only the site-wide bar refreshes; the in-feed copy rides along.
    if (e.type === "wire" && slot !== "home") router.refresh();
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
          {(it.label === "Breaking" || it.label === "Alert") && !(breaking && i === 0) && (
            <span className={`rounded-[4px] px-1 py-px text-[9.5px] font-bold tracking-[0.1em] uppercase ${it.label === "Breaking" || it.label === "Alert" ? "bg-[var(--wn-red-fill)] text-white" : "text-ink-3 ring-1 ring-[var(--hairline)]"}`}>
              {it.label}
            </span>
          )}
          {it.teams?.map((t) => <TeamLogo key={t.id} team={t} size="sm" label={false} />)}
          {it.href ? (
            <Link href={it.href} tabIndex={hidden ? -1 : undefined} className="flex h-[var(--wire-h)] items-center text-[12px] whitespace-nowrap text-ink-2 hover:text-ink-1 hover:underline">{it.text}</Link>
          ) : (
            <span className="text-[12px] whitespace-nowrap text-ink-2">{it.text}</span>
          )}
          <span aria-hidden="true" className="ml-6 h-[3px] w-[3px] rounded-full bg-[var(--rule-strong)]" />
        </li>
      ))}
      {quotes.map((q) => {
        const up = q.changePct >= 0;
        return (
          <li key={q.symbol} className="flex items-center gap-2 pr-6">
            <Link href={`/markets?s=${q.symbol}`} tabIndex={hidden ? -1 : undefined} className="mono flex h-[var(--wire-h)] items-center gap-1.5 text-[11.5px] whitespace-nowrap text-ink-3 hover:text-ink-1">
              <span className="font-semibold text-ink-2">{INDEX[q.symbol] ?? q.symbol}</span>
              <span>{q.price.toFixed(2)}</span>
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
      className={`relative border-b border-[var(--hairline)] bg-[var(--wire-bg)] text-[var(--wire-fg)] ${slot === "home" ? "hidden" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto flex h-[var(--wire-h)] max-w-[1320px] items-center">
        {/* Only breaking news gets a (small) red tag; otherwise the wire is plain gray text. */}
        <span className="relative z-10 flex h-full shrink-0 items-center bg-[var(--wire-bg)] pr-2 pl-3 lg:pl-8">
          {breaking ? (
            <span className="rounded-[4px] bg-[var(--wn-red-fill)] px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-white uppercase">Breaking</span>
          ) : (
            <span className="text-[9.5px] font-bold tracking-[0.1em] text-ink-3 uppercase">Latest</span>
          )}
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
        {demo && quotes.length > 0 && <span className="mono hidden shrink-0 px-3 text-[10px] tracking-wider text-ink-3 lg:block lg:pr-8">PRICES: DEMO</span>}
      </div>
    </div>
  );
}
