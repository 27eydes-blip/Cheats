"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Quote } from "@/lib/markets/provider";
import { addWatchAction, removeWatchAction } from "@/actions/markets";
import { ALL_TICKERS, INDEX_OF, STOCKS, proxyNote } from "@/lib/markets/universe";
import { CloseIcon, PlusIcon } from "../icons";
import { useToast, useViewer } from "../providers";
import { AreaChart, MiniLine, PriceChart, type Bar } from "./Charts";
import type { Range } from "@/lib/markets/history";

const RANGES: Range[] = ["1D", "5D", "1M", "1Y"];
import { fmtChg, fmtPct, fmtPrice, useFlash, useMarket } from "./MarketData";

const up = (q: Quote) => q.change >= 0;
const tone = (q: Quote) => (up(q) ? "text-[#2ee6a6]" : "text-[#ff5c7a]");
const Arrow = ({ q }: { q: Quote }) => <span aria-hidden="true">{up(q) ? "▲" : "▼"}</span>;

/** One index card: S&P 500 (SPY), Nasdaq-100 (QQQ), Dow (DIA), Russell 2000 (IWM). */
export function IndexCard({ symbol }: { symbol: string }) {
  const { quotes, select, selected, status } = useMarket();
  const q = quotes[symbol];
  const f = useFlash(symbol);
  if (!q) return <div className="h-[210px] animate-pulse rounded-[var(--r-lg)] bg-white/5" />;
  const range = q.high - q.low || 1;
  return (
    <button
      type="button"
      onClick={() => select(symbol)}
      aria-pressed={selected === symbol}
      className={`group relative overflow-hidden rounded-[var(--r-lg)] border bg-[#0b1220]/80 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 ${selected === symbol ? "border-[#22d3ee] shadow-[0_0_0_1px_#22d3ee,0_10px_40px_rgb(34_211_238/0.18)]" : "border-white/10 hover:border-white/25"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white">{INDEX_OF[symbol]?.title ?? q.name}</p>
          <p className="text-[11.5px] text-white/70">{q.name} · <span className="mono">{symbol}</span></p>
        </div>
        <span className={`mono shrink-0 rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${up(q) ? "bg-[#2ee6a6]/12 text-[#2ee6a6]" : "bg-[#ff5c7a]/12 text-[#ff5c7a]"}`}><Arrow q={q} /> {fmtPct(q.changePct)}</span>
      </div>
      <p key={f.key} className={`mono mt-3 inline-block rounded-[6px] px-1 -ml-1 text-[30px] leading-none font-semibold ${up(q) ? "glow-up" : "glow-down"} ${f.cls}`}>{fmtPrice(q.price)}</p>
      <p className={`mono mt-1 text-[12px] ${tone(q)}`}>{fmtChg(q.change)} {status.open ? "today" : "last session"}</p>
      <p className="mt-1 text-[11px] text-[var(--wn-cyan-ink)]" data-proxy-note>{proxyNote(symbol)}</p>
      <div className="mt-3"><AreaChart values={q.series} prevClose={q.prevClose} height={64} label={`${q.name} intraday`} /></div>
      <div className="mt-3">
        <div className="relative h-1 rounded-full bg-white/10">
          <span className="absolute top-1/2 h-2.5 w-[3px] -translate-y-1/2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]" style={{ left: `${((q.price - q.low) / range) * 100}%` }} />
        </div>
        <div className="mono mt-1 flex justify-between text-[10px] text-white/45"><span>L {fmtPrice(q.low)}</span><span>DAY RANGE</span><span>H {fmtPrice(q.high)}</span></div>
      </div>
    </button>
  );
}

/** Big interactive chart for the selected symbol: 1D/5D/1M/1Y, line or candles, volume, key stats. */
export function FocusChart() {
  const { quotes, selected, mode, status, initialHistory } = useMarket();
  const q = quotes[selected];
  const f = useFlash(selected);
  const [range, setRange] = useState<Range>("1D");
  const [kind, setKind] = useState<"line" | "candle">("line");
  const [hist, setHist] = useState<{ key: string; bars: Bar[]; note?: string; available: boolean } | null>(() =>
    initialHistory ? { key: `${initialHistory.symbol}:1D`, bars: initialHistory.bars, available: true } : null,
  );
  const skipFirst = useRef(!!initialHistory);
  const key = `${selected}:${range}`;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch(`/api/markets/history?symbol=${selected}&range=${range}`).catch(() => null);
      if (!r?.ok || !alive) return;
      const d = (await r.json()) as { candles: Bar[]; note?: string; available: boolean };
      if (alive) setHist({ key, bars: d.candles, note: d.note, available: d.available });
    };
    if (skipFirst.current) skipFirst.current = false;
    else load();
    const t = range === "1D" ? setInterval(() => !document.hidden && load(), 30_000) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [selected, range, key]);

  // Keep the newest bar in step with the live quote between history refreshes.
  const bars = useMemo(() => {
    if (!hist || hist.key !== key || !q) return null;
    const b = [...hist.bars];
    if (b.length && (range === "1D" || range === "5D" || range === "1M" || range === "1Y")) {
      const last = b[b.length - 1];
      b[b.length - 1] = { ...last, c: q.price, h: Math.max(last.h, q.price), l: Math.min(last.l, q.price) };
    }
    return b;
  }, [hist, key, q, range]);

  if (!q) return <div className="h-[460px] animate-pulse rounded-[var(--r-lg)] bg-white/5" />;
  const first = range === "1D" ? q.prevClose : bars?.[0]?.o;
  const rangeChg = first ? q.price - first : 0;
  const rangePct = first ? (rangeChg / first) * 100 : 0;
  const rUp = rangeChg >= 0;
  const stats: [string, string][] = [["Open", fmtPrice(q.open)], ["Prev close", fmtPrice(q.prevClose)], ["Day high", fmtPrice(q.high)], ["Day low", fmtPrice(q.low)]];
  const seg = "rounded-[8px] px-2.5 py-1 text-[11.5px] font-bold transition-colors";
  return (
    <section id="focus-chart" aria-label={`${q.symbol} chart`} className="scroll-mt-20 relative overflow-hidden rounded-[var(--r-lg)] border border-white/10 bg-[#0b1220]/80 p-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-white/[0.04] to-transparent" style={{ animation: "scan 6s linear infinite" }} />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="folio !text-[10px] text-[var(--wn-cyan-ink)]">Now watching</p>
          <h2 className="mt-1 flex items-baseline gap-3 font-display text-[clamp(1.8rem,1.3rem+1.6vw,2.6rem)] leading-none font-semibold text-white">
            {q.symbol}<span className="font-sans text-[15px] font-medium text-white/60">{q.name}</span>
          </h2>
          {INDEX_OF[q.symbol] && <p className="mt-1 text-[12px] text-[var(--wn-cyan-ink)]">{proxyNote(q.symbol)}</p>}
        </div>
        <div className="text-right">
          <p key={f.key} className={`mono inline-block rounded-[6px] px-1 text-[clamp(2rem,1.4rem+2vw,3rem)] leading-none font-semibold ${rUp ? "glow-up" : "glow-down"} ${f.cls}`}>{fmtPrice(q.price)}</p>
          <p className={`mono mt-1 text-[14px] font-semibold ${rUp ? "text-[#2ee6a6]" : "text-[#ff5c7a]"}`}>{rUp ? "▲" : "▼"} {fmtChg(rangeChg)} ({fmtPct(rangePct)}) <span className="text-white/45">{range === "1D" ? (status.open ? "today" : "last session") : range === "5D" ? "5 days" : range === "1M" ? "1 month" : "1 year"}</span></p>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Time range" className="mono flex gap-1 rounded-[var(--r-lg)] bg-black/40 p-1">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={range === r} type="button" onClick={() => setRange(r)} className={`${seg} ${range === r ? "bg-[var(--wn-blue-fill)] text-white" : "text-white/60 hover:text-white"}`}>{r}</button>
          ))}
        </div>
        <div className="mono flex gap-1 rounded-[var(--r-lg)] bg-black/40 p-1" role="group" aria-label="Chart style">
          {(["line", "candle"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`${seg} ${kind === k ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>{k === "line" ? "LINE" : "CANDLES"}</button>
          ))}
        </div>
      </div>
      <div className="relative mt-4">
        {bars ? <PriceChart bars={bars} kind={kind} range={range} baseline={range === "1D" ? q.prevClose : undefined} height={280} /> : <div className="h-[300px] animate-pulse rounded-[6px] bg-white/[0.04]" />}
      </div>
      {hist?.key === key && hist.note && <p className="relative mt-2 text-[11.5px] text-white/50">{hist.note}</p>}
      {mode === "demo" && <p className="mono relative mt-2 text-[10px] text-[var(--wn-cyan-ink)]/80">SIMULATED HISTORY · DEMO DATA</p>}
      <dl className="relative mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] bg-white/10 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-[#0b1220] px-3 py-2.5"><dt className="folio !text-[9.5px] text-white/50">{k}</dt><dd className="mono mt-0.5 text-[15px] text-white">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

/** Your watchlist: live rows with sparklines; add or remove tickers (saved to your account). */
export function Watchlist() {
  const { quotes, watchlist, setWatchlist, select, selected } = useMarket();
  const viewer = useViewer();
  const toast = useToast();
  const [sym, setSym] = useState("");
  const [, start] = useTransition();
  const add = () => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    if (!viewer) return (window.location.href = "/login?next=/markets");
    const prev = watchlist;
    if (!watchlist.includes(s)) setWatchlist([...watchlist, s]);
    navigator.vibrate?.(6);
    setSym("");
    start(async () => {
      const r = await addWatchAction(s);
      if (r.ok) (setWatchlist(r.data), select(s));
      else (setWatchlist(prev), toast(r.error, "error"));
    });
  };
  const remove = (s: string) => {
    const prev = watchlist;
    setWatchlist(watchlist.filter((x) => x !== s));
    start(async () => {
      const r = await removeWatchAction(s);
      if (!r.ok) (setWatchlist(prev), toast(r.error, "error"));
    });
  };
  return (
    <section aria-labelledby="wl" className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-white/10 bg-[#0b1220]/80">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 id="wl" className="folio text-[var(--wn-cyan-ink)]">Your watchlist</h2>
        <span className="mono text-[11px] text-white/50">{watchlist.length} TICKERS</span>
      </div>
      <form onSubmit={(e) => (e.preventDefault(), add())} className="flex gap-2 border-b border-white/10 p-3">
        <label className="sr-only" htmlFor="wl-add">Add a ticker</label>
        <input id="wl-add" list="tickers" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder={viewer ? "Add ticker, e.g. NFLX" : "Log in to edit your watchlist"} className="mono min-w-0 flex-1 rounded-[8px] border border-white/15 bg-black/40 px-3 py-2 text-[14px] text-white placeholder:text-white/35 focus:border-[#22d3ee] focus:outline-none" autoCapitalize="characters" autoComplete="off" />
        <datalist id="tickers">{ALL_TICKERS.map((t) => <option key={t.symbol} value={t.symbol}>{t.name}</option>)}</datalist>
        <button type="submit" className="inline-flex h-10 items-center gap-1 rounded-[8px] bg-[var(--wn-blue-fill)] px-3 text-[13px] font-bold text-white"><PlusIcon size={15} strokeWidth={2.4} /> Add</button>
      </form>
      <ul className="max-h-[440px] flex-1 overflow-y-auto">
        {watchlist.map((s) => {
          const q = quotes[s];
          return (
            <li key={s} className={`group flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 transition-colors ${selected === s ? "bg-[var(--wn-blue-fill)]/10 shadow-[inset_3px_0_0_#22d3ee]" : "hover:bg-white/[0.04]"}`}>
              <button type="button" onClick={() => select(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="mono block text-[14px] font-bold text-white">{s}</span>
                  <span className="block truncate text-[11.5px] text-white/50">{q?.name ?? "Loading…"}</span>
                </span>
                {q && <MiniLine values={q.series} prevClose={q.prevClose} />}
                <span className="w-[86px] text-right">{q ? <WatchPrice q={q} /> : <span className="mono text-[12px] text-white/40">—</span>}</span>
              </button>
              {viewer && (
                <button type="button" onClick={() => remove(s)} className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-white/40 opacity-60 hover:bg-white/10 hover:text-white group-hover:opacity-100" aria-label={`Remove ${s} from watchlist`}>
                  <CloseIcon size={14} />
                </button>
              )}
            </li>
          );
        })}
        {watchlist.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-white/50">Add a ticker to start tracking it.</li>}
      </ul>
      {!viewer && <p className="px-4 py-2.5 text-[12px] text-white/50"><Link href="/login?next=/markets" className="font-semibold text-[var(--wn-cyan-ink)] hover:underline">Log in</Link> to save your own watchlist.</p>}
    </section>
  );
}

function WatchPrice({ q }: { q: Quote }) {
  const f = useFlash(q.symbol);
  return (
    <>
      <span key={f.key} className={`mono block rounded-[6px] text-[14px] text-white ${f.cls}`}>{fmtPrice(q.price)}</span>
      <span className={`mono block text-[11.5px] font-semibold ${tone(q)}`}>{fmtPct(q.changePct)}</span>
    </>
  );
}

/** Biggest gainers and losers among the tracked large caps. */
export function Movers() {
  const { quotes, select } = useMarket();
  const list = STOCKS.map((t) => quotes[t.symbol]).filter(Boolean);
  const gain = [...list].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  const lose = [...list].sort((a, b) => a.changePct - b.changePct).slice(0, 5);
  const col = (title: string, rows: Quote[]) => (
    <div>
      <h3 className="folio mb-2 !text-[10px] text-white/60">{title}</h3>
      <ul className="space-y-1">
        {rows.map((q, i) => (
          <li key={q.symbol}>
            <button type="button" onClick={() => select(q.symbol)} className="flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left hover:bg-white/[0.05]">
              <span className="mono w-4 text-[11px] text-white/40">{i + 1}</span>
              <span className="mono w-14 text-[13px] font-bold text-white">{q.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/50">{q.name}</span>
              <span className="mono text-[12.5px] text-white/85">{fmtPrice(q.price)}</span>
              <span className={`mono w-[68px] rounded-[6px] px-1.5 py-0.5 text-right text-[12px] font-bold ${up(q) ? "bg-[#2ee6a6]/12 text-[#2ee6a6]" : "bg-[#ff5c7a]/12 text-[#ff5c7a]"}`}>{fmtPct(q.changePct)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-labelledby="movers" className="rounded-[var(--r-lg)] border border-white/10 bg-[#0b1220]/80 p-4">
      <h2 id="movers" className="folio mb-3 text-[var(--wn-cyan-ink)]">Top movers</h2>
      <div className="grid gap-5 sm:grid-cols-2">{col("Gainers", gain)}{col("Losers", lose)}</div>
    </section>
  );
}

/** Market breadth: how many tracked stocks are up vs down, as a single bar. */
export function Breadth() {
  const { quotes } = useMarket();
  const list = STOCKS.map((t) => quotes[t.symbol]).filter(Boolean);
  const upN = list.filter((q) => q.change >= 0).length;
  const pct = list.length ? Math.round((upN / list.length) * 100) : 50;
  return (
    <div className="mono flex items-center gap-3 text-[11.5px] text-white/70">
      <span className="text-[#2ee6a6]">{upN} ADVANCING</span>
      <span className="relative h-1.5 w-40 overflow-hidden rounded-full bg-[#ff5c7a]/70"><span className="absolute inset-y-0 left-0 bg-[#2ee6a6] transition-[width] duration-700" style={{ width: `${pct}%` }} /></span>
      <span className="text-[#ff5c7a]">{list.length - upN} DECLINING</span>
    </div>
  );
}
