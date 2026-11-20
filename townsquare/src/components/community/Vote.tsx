"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voteAction } from "@/actions/communities";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { VoteDownIcon, VoteUpIcon } from "../icons";
import { useToast, useViewer } from "../providers";

/** Up/down vote with an optimistic, animated score. Horizontal for comments, vertical for posts. */
export function Vote({ postId, score: initial, myVote: initialVote, horizontal }: { postId: string; score: number; myVote: number; horizontal?: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [vote, setVote] = useState(initialVote);
  const [score, setScore] = useState(initial);
  const [bump, setBump] = useState(0);
  const [, start] = useTransition();
  const cast = (v: 1 | -1) => {
    if (!viewer) return router.push("/login");
    const next = vote === v ? 0 : v;
    const prev = { vote, score };
    setScore(score + (next - vote));
    setVote(next);
    setBump((b) => b + 1);
    start(async () => {
      const r = await voteAction(postId, next as -1 | 0 | 1);
      if (r.ok) setScore(r.data);
      else (setVote(prev.vote), setScore(prev.score), toast(r.error, "error"));
    });
  };
  const tone = vote === 1 ? "text-accent" : vote === -1 ? "text-danger" : "text-ink-2";
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`flex shrink-0 items-center ${horizontal ? "gap-0.5 rounded-full bg-surface-2 px-1" : "flex-col gap-0 rounded-full bg-surface-2 py-1"}`}
    >
      <button
        type="button"
        onClick={() => cast(1)}
        aria-pressed={vote === 1}
        aria-label="Upvote"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 active:scale-75 ${vote === 1 ? "bg-accent-soft text-accent" : "text-ink-3 hover:text-accent"}`}
      >
        <span key={vote === 1 ? bump : 0} className={vote === 1 ? "animate-pop" : ""}><VoteUpIcon size={17} filled={vote === 1} /></span>
      </button>
      <span className={`num min-w-6 text-center text-[13.5px] font-bold ${tone}`} aria-label={`Score ${score}`}>
        <AnimatedNumber value={score} />
      </span>
      <button
        type="button"
        onClick={() => cast(-1)}
        aria-pressed={vote === -1}
        aria-label="Downvote"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 active:scale-75 ${vote === -1 ? "bg-danger-soft text-danger" : "text-ink-3 hover:text-danger"}`}
      >
        <span key={vote === -1 ? bump : 0} className={vote === -1 ? "animate-pop" : ""}><VoteDownIcon size={17} filled={vote === -1} /></span>
      </button>
    </div>
  );
}
