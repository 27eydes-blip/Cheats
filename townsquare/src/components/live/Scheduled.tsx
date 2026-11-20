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
  const time = new Date(e.startsAt);
  return (
    <li className="grid grid-cols-[76px_1fr_auto] items-center gap-4 border-b border-rule px-4 py-4 sm:grid-cols-[110px_1fr_auto] sm:px-6">
      <div className="text-right">
        <p className="mono text-[17px] font-semibold" suppressHydrationWarning>{now ? time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "\u00a0"}</p>
        <p className="mono text-[10.5px] text-ink-3 uppercase" suppressHydrationWarning>{now ? time.toLocaleDateString("en-US", { weekday: "short" }) : ""}</p>
      </div>
      <div className="min-w-0 border-l-2 border-gold pl-4">
        <p className="mono flex items-center gap-2 text-[11px] font-semibold text-gold-ink uppercase" suppressHydrationWarning>
          <CountdownRing progress={left === null ? 1 : Math.min(1, left / day)} size={14} stroke={2} color="var(--gold)" />
          {left === null ? "\u00a0" : until(left)}
        </p>
        <h3 className="mt-0.5 truncate font-display text-[19px] font-semibold">{e.title}</h3>
        <p className="flex items-center gap-2 truncate text-[13px] text-ink-3">{e.host && <Avatar url={e.host.avatarUrl} name={e.host.displayName} handle={e.host.handle} size={18} />}{e.host?.displayName} · {e.description}</p>
      </div>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          const list = read();
          const next = on ? list.filter((x) => x !== e.id) : [...list, e.id];
          try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
          setOn(!on);
          toast(on ? "Reminder removed" : "We'll remind you on this device");
        }}
        className={`${on ? "btn-outline" : "btn-primary"} !min-h-9 !px-3 !text-[12.5px]`}
      >
        {on ? <><CheckIcon size={14} strokeWidth={2.6} /> Reminded</> : <><BellPlusIcon size={15} /> Remind me</>}
      </button>
    </li>
  );
}
