"use client";

import Link from "next/link";
import { useState } from "react";

export type TickerItem = { text: string; href: string | null };

/**
 * Broadcast-style breaking bar: a pulsing BREAKING tag and a smooth marquee
 * of headlines. It pauses while hovered, focused, or touched, and each
 * headline opens its live story. Reduced motion shows a static first headline.
 */
export function Ticker({ label, items }: { label: "BREAKING" | "ALERT" | "UPDATE"; items: TickerItem[] }) {
  const [paused, setPaused] = useState(false);
  if (!items.length) return null;
  const seconds = Math.max(18, items.reduce((n, i) => n + i.text.length, 0) / 4.2);
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center">
          {it.href ? (
            <Link href={it.href} tabIndex={hidden ? -1 : undefined} className="px-5 text-[13px] font-semibold whitespace-nowrap text-[var(--ticker-fg)] hover:underline focus-visible:underline">
              {it.text}
            </Link>
          ) : (
            <span className="px-5 text-[13px] font-semibold whitespace-nowrap text-[var(--ticker-fg)]">{it.text}</span>
          )}
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/35" />
        </li>
      ))}
    </ul>
  );
  const tagColor = label === "UPDATE" ? "bg-accent-grad" : "bg-breaking";
  return (
    <div
      role="region"
      aria-label="Breaking news"
      className="relative z-40 flex h-[var(--ticker-h)] items-center overflow-hidden bg-[var(--ticker-bg)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), 2500)}
    >
      <div className="relative z-10 flex h-full shrink-0 items-center gap-2 bg-[var(--ticker-bg)] pr-3 pl-3 sm:pl-5">
        <span className={`flex items-center gap-1.5 rounded-[5px] ${tagColor} px-2 py-[3px] text-[10.5px] font-black tracking-[0.12em] text-white`}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-white opacity-75 motion-reduce:hidden" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          {label}
        </span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_24px,#000_calc(100%-40px),transparent)]">
        <div className="flex w-max motion-reduce:!animate-none" style={{ animation: `marquee ${seconds}s linear infinite`, animationPlayState: paused ? "paused" : "running" }}>
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}
