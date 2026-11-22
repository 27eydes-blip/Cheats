"use client";

import Link from "next/link";
import { useTransition } from "react";
import { addWatchAction, removeWatchAction } from "@/actions/markets";
import { useToast, useViewer } from "../providers";
import { fmtChg, fmtPct, fmtPrice, useMarket } from "./MarketData";

/** Add to / remove from your watchlist (sign-in link when signed out). */
export function WatchButton({ symbol }: { symbol: string }) {
  const { watchlist, setWatchlist } = useMarket();
  const viewer = useViewer();
  const toast = useToast();
  const [busy, start] = useTransition();
  const on = watchlist.includes(symbol);
  if (!viewer)
    return <Link href={`/login?next=/markets/${encodeURIComponent(symbol)}`} className="inline-flex h-11 items-center rounded-[10px] bg-[var(--wn-blue-fill)] px-4 text-[14px] font-bold text-white">Log in to add to your watchlist</Link>;
  const toggle = () => {
    const prev = watchlist;
    setWatchlist(on ? watchlist.filter((s) => s !== symbol) : [...watchlist, symbol]);
    start(async () => {
      const r = on ? await removeWatchAction(symbol) : await addWatchAction(symbol);
      if (r.ok) {
        setWatchlist(r.data);
        toast(on ? `${symbol} removed from your watchlist` : `${symbol} added to your watchlist`);
      } else (setWatchlist(prev), toast(r.error, "error"));
    });
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} className={`inline-flex h-11 items-center rounded-[10px] px-4 text-[14px] font-bold ${on ? "border border-white/25 text-white" : "bg-[var(--wn-blue-fill)] text-white"}`}>
      {on ? "✓ On your watchlist" : "+ Add to watchlist"}
    </button>
  );
}

/** Price headline for a stock page: last price, the day's change, and when it is from. */
export function StockPrice({ symbol }: { symbol: string }) {
  const { quotes, status, mode } = useMarket();
  const q = quotes[symbol];
  if (!q) return null;
  const up = q.change >= 0;
  return (
    <div>
      <p className="mono text-[clamp(2rem,1.4rem+2vw,3rem)] leading-none font-semibold text-white">{fmtPrice(q.price)}</p>
      <p className={`mono mt-1 text-[15px] font-semibold ${up ? "text-[#2ee6a6]" : "text-[#ff5c7a]"}`}>
        <span aria-hidden="true">{up ? "▲" : "▼"}</span> {fmtChg(q.change)} ({fmtPct(q.changePct)}) <span className="text-white/50">{status.open ? "today" : "last session"}</span>
      </p>
      <p className="mono mt-1 text-[11px] text-white/45" suppressHydrationWarning>
        {mode === "demo" ? "DEMO · SIMULATED PRICE" : `AS OF ${new Date(q.ts).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET · MAY BE DELAYED`}
      </p>
    </div>
  );
}
