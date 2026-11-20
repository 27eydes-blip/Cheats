"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Rundown, RundownItem } from "@/lib/rundown";
import { PostCard } from "../PostCard";
import { Avatar } from "../ui/Avatar";
import { LiveBadge } from "../ui/Badge";
import { MiniSplit } from "../ui/Stance";
import { SaveIcon } from "../icons";

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function until(ms: number, now: number) {
  const m = Math.round((ms - now) / 60_000);
  if (m <= 0) return "now";
  if (m < 60) return `in ${m}m`;
  return `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

function Item({ it, now, compact }: { it: RundownItem; now: number | null }  & { compact?: boolean }) {
  const time =
    it.kind === "show" ? (it.event.isLive ? "ON AIR" : now ? until(it.event.startsAt, now) : "") : now ? clock(it.at) : "";
  return (
    <li className="grid grid-cols-[64px_1fr] gap-3 border-b border-rule py-3 last:border-0 sm:grid-cols-[84px_1fr]">
      <div className="pt-0.5 text-right">
        <span className={`mono text-[11.5px] ${it.kind === "show" && it.event.isLive ? "font-bold text-live-bg dark:text-live" : "text-ink-3"}`} suppressHydrationWarning>{time}</span>
      </div>
      <div className="min-w-0 border-l border-rule pl-3">
        {it.kind === "story" && (
          <Link href={`/news/story/${it.story.key}`} className="group block">
            <span className="folio flex items-center gap-2 !text-[10px] text-ink-3">{it.story.status === "live" && <LiveBadge label="LIVE" />}{it.story.section} · {it.story.takes} takes</span>
            <span className="mt-0.5 block font-display text-[18px] leading-snug font-semibold group-hover:underline">{it.story.title}</span>
            <MiniSplit split={it.story.split} className="mt-1.5" />
          </Link>
        )}
        {it.kind === "show" && (
          <Link href={`/live/${it.event.id}`} className="group flex items-center gap-3">
            {it.event.host && <Avatar url={it.event.host.avatarUrl} name={it.event.host.displayName} handle={it.event.host.handle} size={34} live={it.event.isLive} />}
            <span className="min-w-0">
              <span className="folio block !text-[10px] text-ink-3">Live Studio · {it.event.kind === "audio" ? "Audio" : it.event.kind === "debate" ? "Debate" : "Show"}</span>
              <span className="block truncate font-semibold group-hover:underline">{it.event.title}</span>
            </span>
          </Link>
        )}
        {(it.kind === "take" || it.kind === "saved") && (
          <>
            {it.kind === "saved" && <p className="folio flex items-center gap-1 !text-[10px] text-navy-ink"><SaveIcon size={12} /> Saved for later</p>}
            {it.kind === "take" && it.amplifiedBy && <p className="folio !text-[10px] text-gold-ink">Amplified by {it.amplifiedBy}</p>}
            <PostCard post={it.post} compact={compact} />
          </>
        )}
      </div>
    </li>
  );
}

const SECTIONS: [keyof Rundown, string, string][] = [
  ["now", "Now", "On air and the last two hours"],
  ["next", "Next", "Coming up and developing"],
  ["later", "Later today", "Scheduled, and what you saved"],
  ["earlier", "Earlier", "From people you follow"],
];

/** The Rundown: your lineup, set like a TV show rundown with a time rail. */
export function RundownList({ data, compact }: { data: Rundown; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  return (
    <div>
      {SECTIONS.map(([key, label, sub]) =>
        data[key].length ? (
          <section key={key} aria-labelledby={`rd-${key}`} className="mb-6">
            <div className="flex items-baseline justify-between border-b-2 border-navy-ink pb-1.5">
              <h2 id={`rd-${key}`} className="flex items-center gap-2 font-display text-h3 font-semibold">
                {key === "now" && <span className="h-2 w-2 animate-live rounded-full bg-live" />}
                {label}
              </h2>
              <span className="folio !text-[10px] text-ink-3">{sub}</span>
            </div>
            <ul>{data[key].map((it, i) => <Item key={`${key}-${i}`} it={it} now={now} compact={compact} />)}</ul>
          </section>
        ) : null,
      )}
      {SECTIONS.every(([k]) => !data[k].length) && <p className="py-12 text-center font-display text-h3 text-ink-3">Your Rundown is empty. Follow a few Voices to fill it.</p>}
    </div>
  );
}
