"use client";

import { useEffect, useState } from "react";
import type { LiveEventView } from "@/lib/news";
import { Avatar } from "../ui/Avatar";
import { CountdownRing } from "../ui/CountdownRing";
import { BellPlusIcon, CheckIcon } from "../icons";
import { useToast } from "../providers";
import { useNow } from "../Time";

const KEY = "ts:reminders";
const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};

function until(ms: number) {
  if (ms <= 0) return "Starting now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `Starts in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Starts in ${h}h ${m % 60}m`;
  return `Starts in ${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Upcoming show with a ticking countdown and a Remind me toggle (saved on this device). */
export function ScheduledRow({ e }: { e: LiveEventView }) {
  const now = useNow(30_000);
  const toast = useToast();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(read().includes(e.id)), [e.id]);
  const left = now ? e.startsAt - now : null;
  const day = 86_400_000;
  return (
    <li className="flex items-center gap-3.5 px-4 py-3.5 sm:px-6">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <span className="absolute inset-0"><CountdownRing progress={left === null ? 1 : Math.min(1, left / day)} size={56} stroke={3} /></span>
        {e.host && <Avatar url={e.host.avatarUrl} name={e.host.displayName} handle={e.host.handle} size={42} ring={false} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="kicker text-accent" suppressHydrationWarning>{left === null ? " " : until(left)}</p>
        <h3 className="truncate text-[15.5px] font-semibold">{e.title}</h3>
        <p className="truncate text-[13.5px] text-ink-3">{e.description}</p>
      </div>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          const list = read();
          const next = on ? list.filter((x) => x !== e.id) : [...list, e.id];
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            /* storage blocked */
          }
          setOn(!on);
          toast(on ? "Reminder removed" : "We'll remind you on this device");
        }}
        className={`${on ? "btn-outline" : "btn-ink"} !min-h-9 !px-3.5 !text-[13px]`}
      >
        {on ? <><CheckIcon size={14} strokeWidth={2.6} /> Reminded</> : <><BellPlusIcon size={15} /> Remind me</>}
      </button>
    </li>
  );
}
