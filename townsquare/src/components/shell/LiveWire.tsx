"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackIcon, ChevronRight } from "../icons";
import { useLiveEvents } from "../live";

export type WireItem = { text: string; href: string | null; at: number; label?: string };

function hhmm(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The Live Wire: one breaking item at a time slides up into the bar every few
 * seconds (no marquee). Pauses on hover or focus; arrows step through items.
 */
export function LiveWire({ items }: { items: WireItem[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  useEffect(() => setMounted(true), []);
  // Breaking item set in the Control Room: pull the new wire right away and show it first.
  useLiveEvents((e) => {
    if (e.type === "wire") (router.refresh(), setI(0));
  });
  useEffect(() => {
    if (paused || items.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 5200);
    return () => clearInterval(t);
  }, [paused, items.length]);
  if (!items.length) return null;
  const it = items[i % items.length];
  const body = (
    <span key={i} className="flex min-w-0 items-center gap-3" style={{ animation: "wire-in 420ms var(--ease-spring) both" }}>
      {it.label && <span className="folio shrink-0 !text-[10px] text-gold">{it.label}</span>}
      <span className="truncate text-[13px] font-semibold">{it.text}</span>
    </span>
  );
  return (
    <div
      role="region"
      aria-label="Live Wire"
      aria-roledescription="ticker"
      className="bg-[var(--wire-bg)] text-[var(--wire-fg)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto flex h-[var(--wire-h)] max-w-[1320px] items-center gap-3 px-3 lg:px-8">
        <span className="flex shrink-0 items-center gap-2 border-r border-white/15 pr-3">
          <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-[#ff4d5e] opacity-70 motion-reduce:hidden" /><span className="relative h-2 w-2 rounded-full bg-[#ff4d5e]" /></span>
          <span className="folio !text-[10.5px] text-gold">Live Wire</span>
        </span>
        <span className="mono hidden shrink-0 text-[11.5px] text-white/60 sm:inline" suppressHydrationWarning>{mounted ? hhmm(it.at) : ""}</span>
        <div className="relative min-w-0 flex-1 overflow-hidden" aria-live="polite">
          {it.href ? <Link href={it.href} className="block min-w-0 hover:underline focus-visible:underline">{body}</Link> : body}
        </div>
        {items.length > 1 && (
          <span className="flex shrink-0 items-center">
            <button type="button" onClick={() => setI((x) => (x - 1 + items.length) % items.length)} className="inline-flex h-7 w-7 items-center justify-center text-white/70 hover:text-white" aria-label="Previous wire item"><BackIcon size={15} /></button>
            <span className="mono text-[10.5px] text-white/50">{(i % items.length) + 1}/{items.length}</span>
            <button type="button" onClick={() => setI((x) => (x + 1) % items.length)} className="inline-flex h-7 w-7 items-center justify-center text-white/70 hover:text-white" aria-label="Next wire item"><ChevronRight size={15} /></button>
          </span>
        )}
      </div>
    </div>
  );
}
