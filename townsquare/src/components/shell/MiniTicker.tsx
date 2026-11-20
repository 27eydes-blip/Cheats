"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WireQuote } from "./LiveWire";

const SHORT: Record<string, string> = { SPY: "S&P", QQQ: "NDQ", DIA: "DOW", IWM: "RUT" };

/** A tiny market ticker for the phone top bar: one index at a time, rotating. Links to the Market Board. */
export function MiniTicker({ quotes: initial }: { quotes: WireQuote[] }) {
  const [quotes, setQuotes] = useState(initial.slice(0, 4));
  const [i, setI] = useState(0);
  useEffect(() => {
    if (quotes.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % quotes.length), 3200);
    return () => clearInterval(t);
  }, [quotes.length]);
  useEffect(() => {
    if (!initial.length) return;
    const syms = initial.slice(0, 4).map((q) => q.symbol).join(",");
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/markets?symbols=${syms}`).catch(() => null);
      if (r?.ok) setQuotes(((await r.json()) as { quotes: WireQuote[] }).quotes);
    }, 30_000);
    return () => clearInterval(t);
  }, [initial]);
  const q = quotes[i % Math.max(1, quotes.length)];
  if (!q) return <span className="w-[84px]" />;
  const up = q.changePct >= 0;
  return (
    <Link href="/markets" aria-label={`Markets: ${q.name} ${up ? "up" : "down"} ${Math.abs(q.changePct).toFixed(2)} percent. Open the Market Board`} className="flex h-11 w-[88px] flex-col items-end justify-center rounded-[12px] bg-[#0b1220] px-2.5 ring-1 ring-white/20 transition-transform active:scale-95">
      <span key={q.symbol} className="mono flex flex-col items-end leading-none" style={{ animation: "wire-in 380ms var(--ease-out) both" }}>
        <span className="text-[10px] font-bold tracking-[0.08em] text-[#b8c2d9]">{SHORT[q.symbol] ?? q.symbol}</span>
        <span className={`mt-1 text-[12.5px] font-bold ${up ? "text-[#34d399]" : "text-[#ff6b81]"}`}>{up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%</span>
      </span>
    </Link>
  );
}
