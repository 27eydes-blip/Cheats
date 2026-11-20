"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { CHANNELS, activeChannel } from "./channels";

/** Horizontal channel dial: small caps, a gold underline under the active channel. */
export function ChannelDial({ liveCount }: { liveCount: number }) {
  const path = usePathname();
  const params = useSearchParams();
  const active = activeChannel(path, params.get("c"));
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <nav aria-label="Channels" className="border-b border-rule bg-paper">
      <ul ref={ref} className="scrollbar-none mx-auto flex h-[var(--dial-h)] max-w-[1320px] items-stretch overflow-x-auto px-2 lg:justify-center lg:px-8" data-no-swipe>
        {CHANNELS.map((c, i) => {
          const on = c.key === active;
          return (
            <li key={c.key} className="flex items-stretch">
              {i === 7 && <span aria-hidden="true" className="mx-1 my-3 w-px bg-rule lg:mx-2" />}
              <Link
                href={c.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`folio relative flex items-center gap-1.5 px-3 !text-[11.5px] whitespace-nowrap transition-colors lg:px-4 ${on ? "text-navy-ink" : "text-ink-3 hover:text-ink-1"}`}
              >
                {c.key === "live" && liveCount > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 animate-live rounded-full bg-live" />}
                {c.label}
                <span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-[3px] bg-gold transition-transform duration-300 lg:inset-x-4 ${on ? "scale-x-100" : "scale-x-0"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
