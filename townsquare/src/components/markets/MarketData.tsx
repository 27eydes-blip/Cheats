"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MarketStatus } from "@/lib/markets/clock";
import type { MarketMode, Quote } from "@/lib/markets/provider";

type Ctx = {
  quotes: Record<string, Quote>;
  /** Direction of each symbol's last tick, for flash animations. */
  ticks: Record<string, { dir: 1 | -1; n: number }>;
  mode: MarketMode;
  status: MarketStatus;
  watchlist: string[];
  setWatchlist: (w: string[]) => void;
  selected: string;
  select: (s: string) => void;
  /** Server-rendered 1D candles for the first symbol shown, so the big chart paints immediately. */
  initialHistory?: { symbol: string; bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] };
};

const MarketCtx = createContext<Ctx | null>(null);
export const useMarket = () => useContext(MarketCtx)!;

/**
 * Keeps every quote on the page fresh: polls /api/markets (every 4s in demo
 * mode, 15s with a live provider) while the tab is visible, and records the
 * direction of each tick so prices can flash green or red.
 */
export function MarketData({ initial, mode, status: initialStatus, symbols, watchlist: initialWatch, focus, initialHistory, children }: { focus?: string; initialHistory?: Ctx["initialHistory"]; initial: Quote[]; mode: MarketMode; status: MarketStatus; symbols: string[]; watchlist: string[]; children: React.ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>(() => Object.fromEntries(initial.map((q) => [q.symbol, q])));
  const [ticks, setTicks] = useState<Ctx["ticks"]>({});
  const [status, setStatus] = useState(initialStatus);
  const [watchlist, setWatchlist] = useState(initialWatch);
  const [selected, select] = useState(focus ?? initialWatch[0] ?? "SPY");
  const last = useRef(quotes);
  const want = useMemo(() => [...new Set([...symbols, ...watchlist])], [symbols, watchlist]);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    const r = await fetch(`/api/markets?symbols=${want.join(",")}`).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { quotes: Quote[]; status: MarketStatus };
    const next: Ctx["ticks"] = {};
    for (const q of d.quotes) {
      const prev = last.current[q.symbol];
      if (prev && prev.price !== q.price) next[q.symbol] = { dir: q.price > prev.price ? 1 : -1, n: Date.now() };
    }
    last.current = { ...last.current, ...Object.fromEntries(d.quotes.map((q) => [q.symbol, q])) };
    setQuotes(last.current);
    setTicks((t) => ({ ...t, ...next }));
    setStatus(d.status);
  }, [want]);

  useEffect(() => {
    // The page arrives with fresh quotes; the first poll waits one interval.
    const t = setInterval(poll, mode === "demo" ? 4000 : 15000);
    return () => clearInterval(t);
  }, [poll, mode]);

  return <MarketCtx.Provider value={{ quotes, ticks, mode, status, watchlist, setWatchlist, selected, select, initialHistory }}>{children}</MarketCtx.Provider>;
}

export const fmtPrice = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
export const fmtChg = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
