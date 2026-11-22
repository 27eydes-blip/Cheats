"use client";

import { useEffect, useMemo, useState } from "react";
import { etMinutes, upcomingCalendar, etDate } from "@/lib/markets/clock";
import { boardRows, breadthOf, fmtCountdown, rangePos, sectorSummaries, sessionRail, type SortDir, type SortKey } from "@/lib/markets/floor";
import type { Quote } from "@/lib/markets/provider";
import { MACRO_ETFS, MACRO_LABEL, SECTORS, STOCKS } from "@/lib/markets/universe";
import { BellIcon, SearchIcon } from "../icons";
import { MiniLine } from "./Charts";
import { fmtChg, fmtPct, fmtPrice, useFlash, useMarket } from "./MarketData";

const UP = "text-[#2ee6a6]";
const DOWN = "text-[#ff5c7a]";
const toneOf = (n: number) => (n >= 0 ? UP : DOWN);
const panel = "rounded-[var(--r-lg)] border border-white/10 bg-[#0b1220]/80";

/** Ticks every second after mount (null during server render, so markup matches). */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const fmtDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The bell clock: which bell rings next and a live countdown, New York time,
 * the trading day on a 4 AM–8 PM rail (pre-market, session, after hours), the
 * data source, and the next holidays and early closes.
 */
export function BellClock() {
  const { status, statusAt, mode } = useMarket();
  const now = useNow();
  const left = status.nextChangeMs - ((now ?? statusAt) - statusAt);
  const rail = sessionRail(now ? etMinutes(now) : 0, status.earlyClose && (status.open || !status.holiday));
  const et = now ? new Date(now).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";
  const today = now ? etDate(now) : status.sessionDate;
  const cal = upcomingCalendar(today, 3);
  const ringing = left <= 0;
  const which = status.open ? "Closing bell" : "Opening bell";
  const nextLabel = status.open ? `today at ${status.closesAt} ET` : `${fmtDay(status.nextSession)} at 9:30 AM ET`;
  return (
    <section aria-labelledby="bell" className={`${panel} relative overflow-hidden p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${status.open ? "bg-[#2ee6a6]/15 text-[#2ee6a6]" : "bg-white/10 text-white/80"}`}>
            <BellIcon size={24} className={ringing ? "bell-ring" : ""} />
          </span>
          <div>
            <h2 id="bell" className="folio !text-[10.5px] text-[var(--wn-cyan-ink)]">{which}</h2>
            <p className="led mt-0.5 text-[clamp(1.7rem,1.2rem+1.6vw,2.4rem)] leading-none text-white" suppressHydrationWarning aria-live="off">
              {ringing ? "RINGING" : fmtCountdown(left)}
            </p>
            <p className="mt-1 text-[12.5px] text-white/60">{nextLabel}{status.earlyClose && !status.open && " · early close at 1:00 PM"}</p>
          </div>
        </div>
        <div className="mono flex flex-col items-end gap-2 text-[12px]">
          <span className={`flex items-center gap-2 rounded-[6px] px-2 py-1 font-bold tracking-wider uppercase ${status.open ? "bg-[#2ee6a6]/15 text-[#2ee6a6]" : "bg-white/10 text-white/80"}`}>
            <span className={`h-2 w-2 rounded-full ${status.open ? "bg-[#2ee6a6] shadow-[0_0_10px_#2ee6a6]" : "bg-white/50"}`} style={status.open ? { animation: "blink 1.6s infinite" } : undefined} />
            {status.label}
          </span>
          <span className="text-white/70" suppressHydrationWarning>NEW YORK <b className="inline-block min-w-[11ch] text-right text-white">{et || "--:--:-- --"}</b></span>
          <span className={`rounded-[6px] px-2 py-1 font-bold tracking-wider ${mode === "live" ? "bg-[#2ee6a6]/15 text-[#2ee6a6]" : "bg-[var(--wn-blue-fill)]/20 text-[var(--wn-cyan-ink)]"}`} title={mode === "demo" ? "No market-data key is configured, so prices are simulated." : "Quotes from Finnhub, refreshed within the plan's call limit"}>
            {mode === "live" ? "LIVE DATA · FINNHUB" : "DEMO DATA · SIMULATED PRICES"}
          </span>
        </div>
      </div>

      <div className="mt-5" aria-hidden="true">
        <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="absolute inset-y-0 bg-white/[0.08]" style={{ left: 0, width: `${rail.open * 100}%` }} />
          <span className="absolute inset-y-0 bg-[#2ee6a6]/25" style={{ left: `${rail.open * 100}%`, width: `${(rail.close - rail.open) * 100}%` }} />
          <span className="absolute inset-y-0 bg-white/[0.08]" style={{ left: `${rail.close * 100}%`, right: 0 }} />
          {now && <span className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]" style={{ left: `${rail.now * 100}%` }} />}
        </div>
        <div className="mono relative mt-1 h-4 text-[10px] text-white/50">
          <span className="absolute left-0">4 AM</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${rail.open * 100}%` }}>9:30 OPEN</span>
          <span className="absolute -translate-x-1/2 max-sm:hidden" style={{ left: `${rail.close * 100}%` }}>{rail.close < 0.6 ? "1 PM" : "4 PM"} CLOSE</span>
          <span className="absolute right-0">8 PM</span>
        </div>
      </div>
      <p className="sr-only">Regular session 9:30 AM to {status.closesAt} Eastern. Pre-market from 4 AM, after hours until 8 PM.</p>

      {cal.length > 0 && (
        <ul aria-label="Exchange calendar" className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3 text-[12px]">
          {cal.map((e) => (
            <li key={e.date} className={`rounded-[6px] px-2 py-1 ${e.kind === "holiday" ? "bg-[#ff5c7a]/10 text-white/85" : "bg-[#22d3ee]/10 text-white/85"}`}>
              <b className="mono mr-1.5 text-white">{fmtDay(e.date)}</b>
              {e.kind === "holiday" ? `Closed · ${e.name}` : `Closes 1:00 PM · ${e.name}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LedItem({ q }: { q: Quote }) {
  const f = useFlash(q.symbol);
  const upq = q.change >= 0;
  return (
    <li className="led flex items-baseline gap-2 px-5 text-[15px] sm:text-[17px]">
      <span className="led-sym">{q.symbol}</span>
      <span key={f.key} className={`rounded-[4px] px-0.5 text-white/90 ${f.cls}`}>{fmtPrice(q.price)}</span>
      <span className={upq ? "led-up" : "led-down"}>{upq ? "▲" : "▼"}{Math.abs(q.change).toFixed(2)}</span>
    </li>
  );
}

/** The big board: every stock on the floor crawling past in LED type, alphabetical like the boards over a trading floor. */
export function BigBoardCrawl() {
  const { quotes } = useMarket();
  const [paused, setPaused] = useState(false);
  const items = STOCKS.map((t) => quotes[t.symbol]).filter((q): q is Quote => !!q).sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (!items.length) return null;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((q) => <LedItem key={q.symbol} q={q} />)}
    </ul>
  );
  return (
    <div role="region" aria-label="Big board: every stock on the floor" className="led-board overflow-hidden rounded-[var(--r-lg)] border border-white/10 motion-reduce:overflow-x-auto" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="flex h-12 w-max items-center motion-reduce:!animate-none" style={{ animation: `marquee ${Math.max(60, items.length * 2.4)}s linear infinite`, animationPlayState: paused ? "paused" : "running" }}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** Floor stats: advancers, decliners, unchanged, the average move, and the best and worst sector. */
export function FloorStats() {
  const { quotes } = useMarket();
  const b = breadthOf(STOCKS.map((t) => quotes[t.symbol]));
  const secs = sectorSummaries(quotes).filter((s) => s.pct !== null).sort((x, y) => y.pct! - x.pct!);
  const cells: [string, React.ReactNode, string?][] = [
    ["Advancing", b.up, UP],
    ["Declining", b.down, DOWN],
    ["Unchanged", b.flat],
    ["Average move", fmtPct(b.avgPct), toneOf(b.avgPct)],
    ["Leading sector", secs[0] ? `${secs[0].short} ${fmtPct(secs[0].pct!)}` : "—", secs[0] && toneOf(secs[0].pct!)],
    ["Lagging sector", secs.at(-1) ? `${secs.at(-1)!.short} ${fmtPct(secs.at(-1)!.pct!)}` : "—", secs.at(-1) && toneOf(secs.at(-1)!.pct!)],
  ];
  return (
    <dl aria-label="Floor stats" className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-white/10 bg-white/10 sm:grid-cols-3 xl:grid-cols-6">
      {cells.map(([k, v, c]) => (
        <div key={k} className="bg-[#0b1220] px-3 py-2.5">
          <dt className="folio !text-[9.5px] text-white/50">{k}</dt>
          <dd className={`mono mt-0.5 text-[16px] font-semibold ${c ?? "text-white"}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Rates, gold, oil and the dollar via their ETFs. */
export function MacroStrip() {
  const { quotes, select } = useMarket();
  return (
    <section aria-label="Beyond stocks" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {MACRO_ETFS.map((t) => {
        const q = quotes[t.symbol];
        return (
          <button key={t.symbol} type="button" onClick={() => select(t.symbol)} className={`${panel} flex items-center gap-3 px-3 py-2.5 text-left hover:border-white/25`}>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-white">{MACRO_LABEL[t.symbol]}</span>
              <span className="mono block text-[10.5px] text-white/50">{t.symbol}</span>
            </span>
            {q?.series.length ? <MiniLine values={q.series} prevClose={q.prevClose} /> : null}
            <span className="text-right">
              <span className="mono block text-[14px] text-white">{q ? fmtPrice(q.price) : "—"}</span>
              {q && <span className={`mono block text-[11.5px] font-semibold ${toneOf(q.changePct)}`}>{fmtPct(q.changePct)}</span>}
            </span>
          </button>
        );
      })}
    </section>
  );
}

/** Sector board: the 11 sectors (plus the S&P 500 benchmark) with today's move, breadth, and leader. Picking one filters the big board. */
export function SectorBoard() {
  const { quotes, sector, setSector } = useMarket();
  const secs = sectorSummaries(quotes);
  const spy = quotes.SPY;
  const pick = (k: string) => {
    setSector(sector === k ? "" : k);
    document.getElementById("big-board")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const max = Math.max(1, ...secs.map((s) => Math.abs(s.pct ?? 0)));
  return (
    <section aria-labelledby="sectors" className={`${panel} p-4`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sectors" className="folio text-[var(--wn-cyan-ink)]">Sector board</h2>
        <p className="text-[12px] text-white/50">Moves from each sector&apos;s ETF. Pick a sector to filter the big board.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <li className="rounded-[10px] border border-white/10 bg-black/30 p-3">
          <p className="text-[12.5px] font-bold text-white">S&amp;P 500</p>
          <p className="mono text-[10px] text-white/50">SPY · BENCHMARK</p>
          <p className={`led mt-2 text-[22px] leading-none ${spy ? (spy.changePct >= 0 ? "led-up" : "led-down") : "text-white/40"}`}>{spy ? fmtPct(spy.changePct) : "—"}</p>
        </li>
        {secs.map((s) => {
          const on = sector === s.key;
          const p = s.pct ?? 0;
          return (
            <li key={s.key}>
              <button type="button" aria-pressed={on} onClick={() => pick(s.key)} className={`block h-full w-full rounded-[10px] border p-3 text-left transition-colors ${on ? "border-[#22d3ee] bg-[#22d3ee]/10" : "border-white/10 bg-black/30 hover:border-white/25"}`}>
                <span className="block text-[12.5px] font-bold text-white">{s.key}</span>
                <span className="mono block text-[10px] text-white/50">{s.etf}{s.fromEtf ? "" : " · AVG OF STOCKS"}</span>
                <span className={`led mt-2 block text-[22px] leading-none ${s.pct === null ? "text-white/40" : p >= 0 ? "led-up" : "led-down"}`}>{s.pct === null ? "—" : fmtPct(p)}</span>
                <span aria-hidden="true" className="mt-2 flex h-1 items-center">
                  <span className="relative h-1 w-full rounded-full bg-white/10">
                    <span className={`absolute inset-y-0 rounded-full ${p >= 0 ? "left-1/2 bg-[#2ee6a6]" : "right-1/2 bg-[#ff5c7a]"}`} style={{ width: `${(Math.abs(p) / max) * 50}%` }} />
                  </span>
                </span>
                <span className="mono mt-1.5 block text-[10.5px] text-white/60"><span className={UP}>{s.breadth.up}▲</span> <span className={DOWN}>{s.breadth.down}▼</span>{s.leader && <> · {s.leader.symbol} {fmtPct(s.leader.changePct)}</>}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const COLS: { key: SortKey; label: string; cls: string; num?: boolean }[] = [
  { key: "symbol", label: "Symbol", cls: "w-[92px]" },
  { key: "name", label: "Company", cls: "max-md:hidden" },
  { key: "sector", label: "Sector", cls: "max-lg:hidden" },
  { key: "price", label: "Last", cls: "", num: true },
  { key: "change", label: "Chg", cls: "max-sm:hidden", num: true },
  { key: "changePct", label: "% Chg", cls: "", num: true },
  { key: "range", label: "Day range", cls: "max-md:hidden w-[150px]" },
];

function BoardRowView({ symbol, name, sector, q, selected, onPick }: { symbol: string; name: string; sector: string; q?: Quote; selected: boolean; onPick: () => void }) {
  const f = useFlash(symbol);
  return (
    <tr className={`border-t border-white/[0.06] ${selected ? "bg-[var(--wn-blue-fill)]/10" : "hover:bg-white/[0.04]"}`}>
      <th scope="row" className="py-0 text-left font-normal">
        <button type="button" onClick={onPick} className="mono flex min-h-11 w-full flex-col justify-center px-3 text-left" aria-label={`${symbol}, ${name}: show chart`}>
          <span className="text-[13.5px] font-bold text-white">{symbol}</span>
          <span className="block max-w-[9rem] truncate font-sans text-[11px] text-white/50 md:hidden">{name}</span>
        </button>
      </th>
      <td className="truncate px-3 text-[13px] text-white/75 max-md:hidden">{name}</td>
      <td className="px-3 text-[12px] text-white/50 max-lg:hidden">{sector}</td>
      <td className="mono px-3 text-right text-[13.5px] text-white"><span key={f.key} className={`rounded-[4px] px-1 ${f.cls}`}>{q ? fmtPrice(q.price) : "—"}</span></td>
      <td className={`mono px-3 text-right text-[12.5px] max-sm:hidden ${q ? toneOf(q.change) : "text-white/40"}`}>{q ? fmtChg(q.change) : "—"}</td>
      <td className="px-3 text-right">
        {q ? <span className={`mono inline-block min-w-[66px] rounded-[6px] px-1.5 py-0.5 text-[12.5px] font-bold ${q.change >= 0 ? "bg-[#2ee6a6]/12 text-[#2ee6a6]" : "bg-[#ff5c7a]/12 text-[#ff5c7a]"}`}>{fmtPct(q.changePct)}</span> : <span className="mono text-white/40">—</span>}
      </td>
      <td className="px-3 max-md:hidden">
        {q && (
          <span className="block" title={`Low ${fmtPrice(q.low)} · High ${fmtPrice(q.high)}`}>
            <span className="relative block h-1 rounded-full bg-white/10">
              <span className="absolute top-1/2 h-2.5 w-[3px] -translate-y-1/2 rounded-full bg-[#22d3ee]" style={{ left: `${rangePos(q) * 100}%` }} />
            </span>
            <span className="sr-only">Low {fmtPrice(q.low)}, high {fmtPrice(q.high)}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

/** The big board as a table: every stock, sortable, filterable by sector and search; prices flash as they tick. */
export function BigBoard() {
  const { quotes, sector, setSector, select, selected } = useMarket();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "symbol", dir: "asc" });
  const rows = useMemo(() => boardRows(quotes, { sector, query, sort: sort.key, dir: sort.dir }), [quotes, sector, query, sort]);
  const b = breadthOf(rows.map((r) => r.q));
  const by = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "symbol" || key === "name" || key === "sector" ? "asc" : "desc" }));
  const pick = (s: string) => {
    select(s);
    document.getElementById("focus-chart")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const chip = "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors";
  return (
    <section id="big-board" aria-labelledby="bb" className={`${panel} scroll-mt-20 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 id="bb" className="folio text-[var(--wn-cyan-ink)]">The big board</h2>
          <p className="mono mt-0.5 text-[11px] text-white/55" aria-live="polite">{rows.length} STOCKS{sector ? ` · ${sector.toUpperCase()}` : ""} · <span className={UP}>{b.up} UP</span> · <span className={DOWN}>{b.down} DOWN</span></p>
        </div>
        <label className="relative flex min-w-0 items-center sm:w-64">
          <span className="sr-only">Find a stock</span>
          <SearchIcon size={15} className="pointer-events-none absolute left-3 text-white/40" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a stock" className="h-10 w-full rounded-[8px] border border-white/15 bg-black/40 pr-3 pl-9 text-[14px] text-white placeholder:text-white/35 focus:border-[#22d3ee] focus:outline-none" />
        </label>
      </div>
      <div role="group" aria-label="Filter by sector" className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-white/10 px-4 py-2.5">
        <button type="button" aria-pressed={!sector} onClick={() => setSector("")} className={`${chip} ${!sector ? "bg-[var(--wn-blue-fill)] text-white" : "bg-white/[0.06] text-white/70 hover:text-white"}`}>All</button>
        {SECTORS.map((s) => (
          <button key={s.key} type="button" aria-pressed={sector === s.key} onClick={() => setSector(sector === s.key ? "" : s.key)} className={`${chip} ${sector === s.key ? "bg-[var(--wn-blue-fill)] text-white" : "bg-white/[0.06] text-white/70 hover:text-white"}`}>{s.key}</button>
        ))}
      </div>
      <div className="relative max-h-[640px] overflow-y-auto">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">Every stock on the board with last price, change and day range. Column headers sort the table.</caption>
          <thead className="sticky top-0 z-10 bg-[#0b1220]">
            <tr>
              {COLS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`${c.cls} ${c.num ? "text-right" : "text-left"} px-0 py-0 text-[11px] font-semibold tracking-wider text-white/55 uppercase`}>
                  <button type="button" onClick={() => by(c.key)} className={`flex min-h-10 w-full items-center gap-1 px-3 hover:text-white ${c.num ? "justify-end" : ""}`}>
                    {c.label}
                    <span aria-hidden="true" className="text-[9px]">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <BoardRowView key={r.t.symbol} symbol={r.t.symbol} name={r.t.name} sector={r.t.sector} q={r.q} selected={selected === r.t.symbol} onPick={() => pick(r.t.symbol)} />)}
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-[13px] text-white/50">No stocks match “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
