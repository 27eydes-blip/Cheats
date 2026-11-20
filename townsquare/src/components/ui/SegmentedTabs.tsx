"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

export type TabItem = { key: string; label: React.ReactNode; href: string; badge?: number };

/**
 * Link tabs with an animated sliding indicator. The indicator moves the
 * moment you tap (before the page data arrives), so switching feels instant.
 */
export function SegmentedTabs({ tabs, active, className = "", variant = "underline" }: { tabs: TabItem[]; active: string; className?: string; variant?: "underline" | "pill" }) {
  const [current, setCurrent] = useState(active);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const prevActive = useRef(active);
  if (prevActive.current !== active) {
    prevActive.current = active;
    if (current !== active) setCurrent(active);
  }

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[current];
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [current, tabs.length]);

  const pill = variant === "pill";
  return (
    <div role="tablist" className={`relative flex ${pill ? "gap-1 rounded-[4px] bg-paper-2 p-1" : ""} ${className}`}>
      {box && (
        <span
          aria-hidden="true"
          className={pill ? "absolute top-1 bottom-1 rounded-[3px] bg-paper shadow-1 ring-1 ring-rule" : "absolute bottom-0 h-[2px] bg-gold"}
          style={{
            left: pill ? box.left : box.left + 12,
            width: pill ? box.width : box.width - 24,
            transition: "left 380ms var(--ease-spring), width 380ms var(--ease-spring)",
          }}
        />
      )}
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            href={t.href}
            scroll={false}
            role="tab"
            aria-selected={on}
            onClick={() => setCurrent(t.key)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-200 ${
              pill ? "min-h-9 rounded-[3px] px-3 text-[13px] font-semibold" : "folio min-h-12 px-3 !text-[11.5px]"
            } ${on ? "text-ink-1" : "text-ink-3 hover:text-ink-1"}`}
          >
            {t.label}
            {!!t.badge && <span className="mono rounded-[2px] bg-gold-soft px-1 text-[10.5px] font-bold text-gold-ink">{t.badge}</span>}
          </Link>
        );
      })}
    </div>
  );
}
