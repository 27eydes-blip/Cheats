"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { CHANNELS, activeChannel } from "./channels";

/** Channel tabs: uppercase pills; the active channel is a solid electric-blue tab. */
export function ChannelDial({ liveCount }: { liveCount: number }) {
  const path = usePathname();
  const params = useSearchParams();
  const active = activeChannel(path, params.get("c"));
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <nav aria-label="Channels" className="border-b border-rule bg-[var(--wn-panel-1)]/90 backdrop-blur-md">
      <ul ref={ref} className="scrollbar-none mx-auto flex h-[var(--dial-h)] max-w-[1320px] items-stretch gap-0.5 overflow-x-auto px-2 lg:justify-center lg:px-8" data-no-swipe>
        {CHANNELS.map((c, i) => {
          const on = c.key === active;
          return (
            <li key={c.key} className="flex items-stretch">
              {i === 7 && <span aria-hidden="true" className="mx-1.5 my-3.5 w-px bg-rule-strong" />}
              <Link href={c.href} scroll={false} aria-current={on ? "page" : undefined} className="group flex items-center px-0.5">
                <span
                  className={`flex h-9 items-center gap-1.5 rounded-[9px] px-3.5 text-[12.5px] font-bold tracking-[0.06em] whitespace-nowrap uppercase transition-all duration-200 ${
                    on ? "bg-[var(--wn-blue-fill)] text-white shadow-[0_0_0_1px_rgb(127_163_255/0.5)_inset,0_6px_20px_-6px_rgb(47_107_255/0.9)]" : "text-ink-2 group-hover:bg-white/[0.06] group-hover:text-[var(--wn-cyan-ink)]"
                  }`}
                >
                  {c.key === "live" && liveCount > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 animate-live rounded-full bg-live" />}
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
