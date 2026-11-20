"use client";

import { useState, useTransition } from "react";
import { muteTopicAction } from "@/actions/feed";
import { useToast } from "@/components/providers";

const TOPICS: [string, string][] = [["politics", "Politics"], ["markets", "Markets"], ["sports", "Sports"], ["tech", "Tech"], ["world", "World"], ["culture", "Culture"], ["national", "National"]];

/** Toggle topics off in For You. Muted topics show as struck-through chips. */
export function TopicMutes({ initial }: { initial: string[] }) {
  const [muted, setMuted] = useState(new Set(initial));
  const [, start] = useTransition();
  const toast = useToast();
  const toggle = (k: string) => {
    const on = !muted.has(k);
    const next = new Set(muted);
    if (on) next.add(k); else next.delete(k);
    setMuted(next);
    start(async () => {
      const r = await muteTopicAction(k, on);
      if (!r.ok) (setMuted(muted), toast(r.error, "error"));
    });
  };
  return (
    <div className="flex flex-wrap gap-2">
      {TOPICS.map(([k, label]) => {
        const off = muted.has(k);
        return (
          <button key={k} type="button" aria-pressed={off} onClick={() => toggle(k)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold transition-all ${off ? "bg-white/[0.03] text-ink-3 line-through ring-1 ring-rule" : "bg-[rgb(47_107_255/0.14)] text-[var(--wn-blue-ink)] ring-1 ring-[rgb(127_163_255/0.35)]"}`}>
            {label} <span className="sr-only">{off ? "(muted)" : "(on)"}</span>
          </button>
        );
      })}
    </div>
  );
}
