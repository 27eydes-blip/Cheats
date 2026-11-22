"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveEvents } from "../live";
import { INDEX_OF, fundLabel, proxyNote } from "@/lib/markets/universe";
import { indexAfterUpdate, nextIndex, orderWire, relTime, ROTATE_MS, ROTATE_REDUCED_MS, type WireItem as Item } from "@/lib/wire-logic";

export type WireItem = Item;
export type WireQuote = { symbol: string; name: string; price: number; changePct: number };

/** Stable default so the sync effect below doesn't see a new array every render. */
const NO_QUOTES: WireQuote[] = [];

/** True when the reader asked for less motion (false during server render). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * The "Latest" ticker under the header, 32px tall and one line.
 *
 * Headlines: one at a time, crossfading every 6 seconds, with a thin progress
 * line along the bottom edge counting down to the next one. Each shows a
 * BREAKING tag only when the story is breaking (breaking items come first and
 * get a brief highlight), the headline, the outlet in small caps and a
 * relative time. Hover, touch or keyboard focus pauses it.
 *
 * Markets: a separate segment with its own smooth scroll and green and red
 * arrows (wider screens).
 *
 * Reduced motion: no scrolling, no pulsing, no progress line; the headline
 * still changes every 8 seconds, without animation.
 *
 * Every link has a 44px tall hit area that overhangs the 32px bar, so nothing
 * moves when it renders.
 */
export function LiveWire({ items: rawItems, quotes: initialQuotes = NO_QUOTES, demo, slot, now: serverNow }: { items: WireItem[]; quotes?: WireQuote[]; demo?: boolean; /** "layout": the site-wide bar; "home": the in-feed copy (hidden) */ slot?: "layout" | "home"; /** Server time, so relative times match on first paint */ now?: number }) {
  const router = useRouter();
  const path = usePathname();
  const reduced = useReducedMotion();
  const items = useMemo(() => orderWire(rawItems), [rawItems]);
  const [idx, setIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [marketsPaused, setMarketsPaused] = useState(false);
  const [now, setNow] = useState(serverNow ?? items[0]?.at ?? 0);
  const [allQuotes, setQuotes] = useState(initialQuotes);
  const prevItems = useRef(items);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paused = hovered || touched || focused;

  useEffect(() => setQuotes(initialQuotes), [initialQuotes]);
  // The Market Board has its own stock tape, so the wire carries only news there.
  const quotes = path?.startsWith("/markets") ? [] : allQuotes;

  // New headlines (a live "wire" event refreshes the page data): breaking ones take the stage at once.
  useEffect(() => {
    if (prevItems.current === items) return;
    setIdx((i) => indexAfterUpdate(prevItems.current, items, i));
    prevItems.current = items;
  }, [items]);

  useLiveEvents((e) => {
    // Only the site-wide bar refreshes; the in-feed copy rides along.
    if (e.type === "wire" && slot !== "home") router.refresh();
  });

  // Relative times tick every 30 seconds.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  const advance = useCallback(() => setIdx((i) => nextIndex(i, items.length)), [items.length]);

  // With reduced motion there is no progress line to end, so a plain timer moves the headline on.
  useEffect(() => {
    if (!reduced || paused || items.length < 2) return;
    const t = setInterval(advance, ROTATE_REDUCED_MS);
    return () => clearInterval(t);
  }, [reduced, paused, items.length, advance]);

  useEffect(() => () => void (touchTimer.current && clearTimeout(touchTimer.current)), []);

  if (!items.length && !quotes.length) return null;
  const cur = Math.min(idx, Math.max(0, items.length - 1));

  const onTouchStart = () => {
    setTouched(true);
    if (touchTimer.current) clearTimeout(touchTimer.current);
  };
  const onTouchEnd = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => setTouched(false), 4_000);
  };

  const quoteRow = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {quotes.map((q) => {
        const up = q.changePct >= 0;
        return (
          <li key={q.symbol} className="flex items-center pr-5">
            <Link href={`/markets/${q.symbol}`} tabIndex={hidden ? -1 : undefined} title={INDEX_OF[q.symbol] ? proxyNote(q.symbol) : q.name} data-tap="wire" className="wire-num -my-1.5 flex h-11 items-center gap-1.5 text-[11.5px] whitespace-nowrap text-ink-3 hover:text-ink-1">
              <span className="font-semibold text-ink-2">{fundLabel(q.symbol)}</span>
              <span>{q.price.toFixed(2)}</span>
              <span className={up ? "text-[#34d399]" : "text-[#ff6b81]"}>
                <span aria-hidden="true">{up ? "▲" : "▼"}</span>
                <span className="sr-only">{up ? "up" : "down"}</span> {up ? "+" : ""}{q.changePct.toFixed(2)}%
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      role="region"
      aria-label="Latest headlines and markets"
      aria-roledescription="ticker"
      data-reduced={reduced || undefined}
      className={`wire relative border-b border-[var(--hairline)] bg-[var(--wire-bg)] text-[var(--wire-fg)] ${slot === "home" ? "hidden" : ""}`}
    >
      <div className="mx-auto flex h-[var(--wire-h)] max-w-[1320px] items-center">
        <span className="flex h-full shrink-0 items-center gap-2 pr-2 pl-3 sm:pr-3 lg:pl-8">
          <span aria-hidden="true" className="wire-dot" />
          <span className="text-[10.5px] font-extrabold tracking-[0.16em] text-ink-1 uppercase">Latest</span>
        </span>

        {items.length > 0 && (
          <div
            className="relative h-full min-w-0 flex-1 [overflow-x:clip]"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            data-no-swipe
            data-paused={paused || undefined}
          >
            {items.map((it, i) => {
              const active = i === cur;
              const body = (
                <>
                  {it.breaking && <span className="wire-breaking shrink-0">Breaking</span>}
                  <span className="min-w-0 truncate text-[12.5px] text-ink-1 group-hover:underline">{it.text}</span>
                  {it.source && <span className="shrink-0 text-[11.5px] tracking-[0.04em] text-ink-3 [font-variant-caps:all-small-caps] max-sm:sr-only">{it.source}</span>}
                  <span className="wire-num shrink-0 text-[11px] text-ink-3" suppressHydrationWarning>{relTime(it.at, now)}</span>
                </>
              );
              return (
                <div
                  key={(it.href ?? it.text) + i}
                  aria-hidden={!active || undefined}
                  inert={!active || undefined}
                  className={`absolute inset-0 flex items-center pr-3 transition-opacity duration-300 ease-out motion-reduce:transition-none ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
                >
                  {it.href ? (
                    <Link href={it.href} data-tap="wire" className={`wire-headline group -my-1.5 flex h-11 min-w-0 items-center gap-2.5 rounded-[4px] px-1 ${active && it.breaking ? "wire-flash" : ""}`} key={active ? `on-${cur}` : "off"}>
                      {body}
                    </Link>
                  ) : (
                    <span className={`flex min-w-0 items-center gap-2.5 px-1 ${active && it.breaking ? "wire-flash" : ""}`}>{body}</span>
                  )}
                </div>
              );
            })}
            {items.length > 1 && !reduced && (
              <span
                key={`p${cur}-${items.length}`}
                aria-hidden="true"
                className="wire-progress"
                style={{ animationDuration: `${ROTATE_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
                onAnimationEnd={advance}
              />
            )}
            <span className="sr-only" aria-live="polite">{items[cur]?.breaking ? `Breaking: ${items[cur].text}` : ""}</span>
          </div>
        )}

        {quotes.length > 0 && (
          <div
            className={`relative hidden h-full shrink-0 border-l border-[var(--hairline)] md:block ${items.length ? "w-[32%] max-w-[400px]" : "flex-1"} [overflow-x:clip] motion-reduce:overflow-x-auto`}
            onMouseEnter={() => setMarketsPaused(true)}
            onMouseLeave={() => setMarketsPaused(false)}
            onFocus={() => setMarketsPaused(true)}
            onBlur={() => setMarketsPaused(false)}
            aria-label="Markets"
            role="group"
          >
            <div className="flex h-full w-max items-center pl-4 motion-reduce:!animate-none" style={reduced ? undefined : { animation: `marquee ${Math.max(24, quotes.length * 5)}s linear infinite`, animationPlayState: marketsPaused ? "paused" : "running" }}>
              {quoteRow(false)}
              {!reduced && quoteRow(true)}
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--wire-bg)] to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--wire-bg)] to-transparent" />
          </div>
        )}
        {demo && quotes.length > 0 && <span className="wire-num hidden shrink-0 px-3 text-[10px] tracking-wider text-ink-3 lg:block lg:pr-8">PRICES: DEMO</span>}
      </div>
    </div>
  );
}
