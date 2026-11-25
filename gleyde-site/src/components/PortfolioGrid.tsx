"use client";

import { m } from "framer-motion";
import { useState } from "react";
import type { Division } from "@/data/portfolio";
import { easeDeco } from "./Reveal";
import { StatusBadge } from "./StatusBadge";

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <path d="M4 12 L12 4 M6 4 H12 V10" />
    </svg>
  );
}

/**
 * Every product from every division in one grid, with division filters.
 * Data comes from src/data/portfolio.ts (passed in by app/portfolio/page.tsx).
 */
export function PortfolioGrid({ divisions }: { divisions: Division[] }) {
  const [filter, setFilter] = useState<string>("all");

  const all = divisions.flatMap((d) => d.projects.map((p) => ({ ...p, division: d })));
  const shown = filter === "all" ? all : all.filter((p) => p.division.id === filter);
  const filters = [
    { id: "all", label: "All", count: all.length },
    ...divisions.map((d) => ({ id: d.id, label: d.name, count: d.projects.length })),
  ];

  return (
    <>
      <div className="rule-b mt-16 -mx-6 overflow-x-auto px-6 sm:mx-0 sm:mt-20 sm:px-0">
        <ul className="flex min-w-max gap-8 sm:gap-12" aria-label="Filter by division">
          {filters.map((f) => {
            const active = f.id === filter;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                  className={`relative flex items-baseline gap-2.5 pt-2 pb-5 text-[0.7rem] tracking-[0.24em] whitespace-nowrap uppercase transition-colors duration-300 ${
                    active ? "text-ivory" : "text-ivory/60 hover:text-ivory/85"
                  }`}
                >
                  {f.label}
                  <span className={active ? "text-gold-light" : "text-ivory/55"}>{f.count}</span>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 -bottom-px h-px origin-left bg-gold-light transition-transform duration-500 ease-deco ${
                      active ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {shown.length} {shown.length === 1 ? "product" : "products"}
      </p>

      <ul key={filter} className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p, i) => {
          const body = (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="eyebrow">
                  <span className="text-gold">{p.division.numeral}</span>
                  <span className="ml-3">{p.division.name}</span>
                </span>
                <StatusBadge status={p.status} />
              </div>
              <h2 className="mt-8 flex items-center gap-3 font-display text-[1.9rem] leading-tight tracking-[0.02em] text-ivory transition-colors duration-300 group-hover:text-gold-light sm:text-[2.1rem]">
                {p.name}
              </h2>
              <p className="mt-4 max-w-sm text-base leading-relaxed font-light text-ivory/60">{p.description}</p>
              <p className="mt-8 flex items-center gap-2 text-[0.68rem] tracking-[0.24em] uppercase">
                {p.url ? (
                  <span className="flex items-center gap-2 text-gold-light">
                    {p.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <span className="transition-transform duration-500 ease-deco group-hover:translate-x-1 group-hover:-translate-y-1">
                      <Arrow />
                    </span>
                  </span>
                ) : (
                  <span className="text-ivory/55">{p.status === "Live" ? "By enquiry" : "Link coming soon"}</span>
                )}
              </p>
            </>
          );
          return (
            <m.li
              key={`${p.division.id}-${p.name}`}
              className="rule-t"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: easeDeco, delay: Math.min(i, 8) * 0.05 }}
            >
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block pt-8 pb-14">
                  {body}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <div className="group pt-8 pb-14">{body}</div>
              )}
            </m.li>
          );
        })}
      </ul>
    </>
  );
}
