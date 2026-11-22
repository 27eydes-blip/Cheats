"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CHANNELS, TOPICS_END, activeChannel } from "./channels";

/** The one top nav (all screen sizes): topics, then Markets, Live, Desks. Scrolls sideways on phones; the active item is underlined. */
export function ChannelDial({ liveCount }: { liveCount: number }) {
  const path = usePathname() ?? "/";
  const active = activeChannel(path);
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <nav aria-label="Topics" className="border-b border-[var(--hairline)] bg-[var(--paper)]">
      <ul ref={ref} className="scrollbar-none mx-auto flex h-[var(--dial-h)] max-w-[1320px] items-stretch gap-0.5 overflow-x-auto px-2 lg:justify-center lg:px-8" data-no-swipe>
        {CHANNELS.map((c, i) => {
          const on = c.key === active;
          return (
            <li key={c.key} className="flex items-stretch">
              {i === TOPICS_END && <span aria-hidden="true" className="mx-1.5 my-3 w-px bg-[var(--hairline)]" />}
              <Link href={c.href} scroll={false} aria-current={on ? "page" : undefined} className="group flex items-center px-0.5">
                <span
                  className={`relative flex h-full items-center gap-1.5 px-3 text-[13.5px] whitespace-nowrap transition-colors ${
                    on ? "font-bold text-ink-1 shadow-[inset_0_-2px_0_var(--wn-blue)]" : "font-medium text-ink-3 group-hover:text-ink-1"
                  }`}
                >
                  {c.key === "live" && liveCount > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--wn-blue)]" />}
                  {c.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
