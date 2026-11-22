"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchResult, SymbolHit } from "@/lib/markets/search";
import { SearchIcon } from "../icons";

/**
 * Look up any U.S. stock or ETF by name or ticker ("cloudflare", "NET").
 * Waits 250 ms after typing stops, cancels stale requests, and works with the
 * keyboard (arrows, Enter, Escape) as a standard combobox.
 */
export function SymbolSearch({ fetchImpl, autoFocus }: { fetchImpl?: typeof fetch; autoFocus?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setRes(null);
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true);
      try {
        const r = await (fetchImpl ?? fetch)(`/api/markets/search?q=${encodeURIComponent(query)}`, { signal: c.signal });
        const d = await r.json();
        if (c.signal.aborted) return;
        if (!r.ok) {
          setError(d.error ?? "Search failed. Try again.");
          setRes(null);
        } else {
          setError(null);
          setRes(d as SearchResult);
          setActive(0);
          setOpen(true);
        }
      } catch {
        if (!c.signal.aborted) setError("Search failed. Check your connection.");
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, fetchImpl]);

  const hits = res?.hits ?? [];
  const go = (h: SymbolHit) => {
    setOpen(false);
    router.push(`/markets/${encodeURIComponent(h.symbol)}`);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setOpen(true), setActive((a) => Math.min(hits.length - 1, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Enter" && hits[active]) (e.preventDefault(), go(hits[active]));
    else if (e.key === "Escape") setOpen(false);
  };
  const show = open && q.trim() && (hits.length > 0 || res || error);

  return (
    <div className="relative w-full sm:w-[360px]">
      <label htmlFor={`${id}-in`} className="sr-only">Look up any U.S. stock or ETF</label>
      <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/45" />
      <input
        id={`${id}-in`}
        role="combobox"
        aria-expanded={!!show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show && hits[active] ? `${id}-o${active}` : undefined}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onKeyDown={onKey}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Look up any stock: name or ticker"
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        className="h-11 w-full rounded-[10px] border border-white/15 bg-black/40 pr-9 pl-9 text-[14px] text-white placeholder:text-white/40 focus:border-[#22d3ee] focus:outline-none"
      />
      {loading && <span aria-hidden="true" className="absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />}
      {show && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[10px] border border-white/15 bg-[#0b1220] shadow-[0_18px_40px_rgb(0_0_0/0.5)]">
          {error ? (
            <p role="alert" className="px-3 py-3 text-[13px] text-white/75">{error}</p>
          ) : (
            <>
              <ul id={`${id}-list`} role="listbox" aria-label="Matching stocks and funds">
                {hits.map((h, i) => (
                  <li
                    key={h.symbol}
                    id={`${id}-o${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => (e.preventDefault(), go(h))}
                    onMouseEnter={() => setActive(i)}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 ${i === active ? "bg-[var(--wn-blue-fill)]/25" : ""}`}
                  >
                    <span className="mono w-16 shrink-0 text-[13.5px] font-bold text-white">{h.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{h.name}</span>
                    <span className="mono shrink-0 text-[10.5px] text-white/50">{h.exchange}{h.kind === "ETF" ? " · ETF" : ""}</span>
                  </li>
                ))}
              </ul>
              {!hits.length && res && <p className="px-3 py-3 text-[13px] text-white/60">No U.S. stocks or funds match “{res.query}”.</p>}
              {res?.note && <p className="border-t border-white/10 px-3 py-2 text-[11.5px] text-white/50">{res.note}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
