"use client";

import { useEffect, useState, useTransition } from "react";
import type { PollView } from "@/lib/posts";
import { votePollAction } from "@/actions/posts";
import { CheckIcon } from "../icons";
import { CountdownRing } from "../ui/CountdownRing";
import { useToast, useViewer } from "../providers";
import { useNow } from "../Time";

function left(ms: number) {
  if (ms <= 0) return "Final results";
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} min left`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} left`;
  return `${Math.round(h / 24)} days left`;
}

/**
 * Poll with optimistic voting. Bars fill smoothly after you vote, the leading
 * option is highlighted, and a ring counts down the time left.
 */
export function Poll({ poll, postId, isAuthor, createdAt }: { poll: PollView; postId: string; isAuthor: boolean; createdAt: number }) {
  const viewer = useViewer();
  const toast = useToast();
  const now = useNow(30_000);
  const [p, setP] = useState(poll);
  const [filled, setFilled] = useState(false);
  const [pending, start] = useTransition();
  const showResults = !viewer || !!p.myVote || p.closed || isAuthor;

  // Animate bars from 0 on first reveal.
  useEffect(() => {
    if (!showResults) return setFilled(false);
    const t = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(t);
  }, [showResults]);

  const max = Math.max(...p.options.map((o) => o.votes));
  const span = p.closesAt - createdAt;
  const remaining = now ? p.closesAt - now : span;

  const vote = (optionId: string) => {
    const prev = p;
    setP({ ...p, myVote: optionId, total: p.total + 1, options: p.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)) });
    start(async () => {
      const res = await votePollAction(p.id, optionId, postId);
      if (res.ok) setP(res.data);
      else (setP(prev), toast(res.error, "error"));
    });
  };

  return (
    <div className="mt-2 max-w-[520px] space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <p className="text-[12.5px] text-ink-3"><span className="rounded-[4px] px-1 py-px font-semibold ring-1 ring-[var(--hairline)]">Poll</span></p>
      {p.options.map((o, i) => {
        const pct = p.total ? Math.round((o.votes / p.total) * 100) : 0;
        const winner = showResults && o.votes === max && max > 0;
        const mine = p.myVote === o.id;
        return showResults ? (
          <div key={o.id} className="relative overflow-hidden rounded-[10px] bg-surface-2">
            <div
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 rounded-[10px] ${winner ? "bg-navy opacity-[0.16] dark:bg-gold dark:opacity-30" : "bg-line-strong"}`}
              style={{ width: filled ? `${Math.max(pct, 2)}%` : "0%", transition: `width 900ms var(--ease-spring) ${i * 70}ms` }}
            />
            <div className={`relative flex min-h-11 items-center justify-between gap-3 px-3.5 text-[15px] ${winner ? "font-semibold" : ""}`}>
              <span className="flex items-center gap-2 text-ink-1">
                {o.label}
                {mine && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-[8px] bg-navy text-white" title="Your vote">
                    <CheckIcon size={13} strokeWidth={3} />
                    <span className="sr-only">(your vote)</span>
                  </span>
                )}
              </span>
              <span className={`num ${winner ? "font-bold text-ink-1" : "font-semibold text-ink-2"}`}>{pct}%</span>
            </div>
          </div>
        ) : (
          <button
            key={o.id}
            type="button"
            disabled={pending}
            onClick={() => vote(o.id)}
            className="flex min-h-11 w-full items-center justify-center rounded-[10px] text-[15px] font-semibold text-accent ring-1 ring-accent/40 transition-all duration-150 hover:bg-accent-soft hover:ring-accent active:scale-[0.98]"
          >
            {o.label}
          </button>
        );
      })}
      <p className="flex items-center gap-2 pt-0.5 text-[13px] text-ink-3">
        {!p.closed && <CountdownRing progress={span > 0 ? remaining / span : 0} size={15} stroke={2.2} />}
        <span className="num">{p.total.toLocaleString("en-US")} vote{p.total === 1 ? "" : "s"}</span>
        <span aria-hidden="true">·</span>
        <span suppressHydrationWarning>{now ? left(remaining) : p.closed ? "Final results" : " "}</span>
        {!p.closed && showResults && <span className="ml-auto text-[12px]">Open</span>}
      </p>
    </div>
  );
}
