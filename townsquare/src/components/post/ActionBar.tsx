"use client";

import { useState } from "react";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { BookmarkIcon, HeartIcon, QuoteIcon, ReplyIcon, RepostIcon, ShareIcon } from "../icons";
import { Menu } from "../ui/Menu";

type Counts = { likes: number; replies: number; reposts: number };
type State = { liked: boolean; reposted: boolean; bookmarked: boolean };

/** Six particles + a ring that burst out of the heart when you like. */
function Burst() {
  const parts = [0, 60, 120, 180, 240, 300];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="absolute h-8 w-8 rounded-full border-2 border-rose-500" style={{ animation: "ring-burst 520ms var(--ease-out) forwards" }} />
      {parts.map((deg, i) => (
        <span
          key={deg}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{
            background: i % 2 ? "#f43f5e" : "#a855f7",
            ["--dx" as string]: `${Math.cos((deg * Math.PI) / 180) * 18}px`,
            ["--dy" as string]: `${Math.sin((deg * Math.PI) / 180) * 18}px`,
            animation: "burst 560ms var(--ease-out) forwards",
          }}
        />
      ))}
    </span>
  );
}

/**
 * The post action row. Every toggle is optimistic; the parent rolls back on
 * failure. Animations: heart pop + burst, repost spin, bookmark bounce,
 * counts roll, and a press-scale on every button.
 */
export function ActionBar({
  counts, state, onReply, onToggle, onQuote, onShare, big,
}: { counts: Counts; state: State; onReply: () => void; onToggle: (k: keyof State) => void; onQuote: () => void; onShare: () => void; big?: boolean }) {
  const [anim, setAnim] = useState<{ k: keyof State | null; n: number }>({ k: null, n: 0 });
  const fire = (k: keyof State) => {
    if (!state[k]) setAnim((a) => ({ k, n: a.n + 1 }));
    onToggle(k);
  };
  const size = big ? 21 : 19;
  const base = "relative flex h-10 min-w-10 items-center gap-1.5 rounded-full px-2 text-[13.5px] font-medium transition-colors duration-150 active:scale-90";
  return (
    <div className={`-ml-2 flex items-center justify-between ${big ? "max-w-none py-1" : "max-w-[420px]"}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" data-action="reply" onClick={onReply} className={`${base} text-ink-3 hover:bg-accent-soft hover:text-accent`}>
        <ReplyIcon size={size} />
        <span className="sr-only">Reply</span>
        <AnimatedNumber value={counts.replies} hideZero />
      </button>

      <Menu
        label={state.reposted ? "Undo repost or quote" : "Repost or quote"}
        align="left"
        buttonClassName={`${base} ${state.reposted ? "text-success" : "text-ink-3"} hover:bg-success/10 hover:text-success`}
        button={
          <>
            <span key={anim.k === "reposted" ? anim.n : 0} className={anim.k === "reposted" ? "animate-spin-once" : ""}>
              <RepostIcon size={size} strokeWidth={state.reposted ? 2.3 : 1.9} />
            </span>
            <AnimatedNumber value={counts.reposts} hideZero />
          </>
        }
        items={[
          { label: state.reposted ? "Undo repost" : "Repost", icon: <RepostIcon size={18} />, onSelect: () => fire("reposted") },
          { label: "Quote post", icon: <QuoteIcon size={18} />, onSelect: onQuote },
        ]}
      />

      <button
        type="button"
        data-action="like"
        onClick={() => fire("liked")}
        aria-pressed={state.liked}
        className={`${base} ${state.liked ? "text-rose-600 dark:text-rose-400" : "text-ink-3"} hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400`}
      >
        <span className="relative">
          <span key={anim.k === "liked" ? anim.n : 0} className={`block ${anim.k === "liked" && state.liked ? "animate-pop" : ""}`}>
            <HeartIcon size={size} filled={state.liked} />
          </span>
          {anim.k === "liked" && state.liked && <Burst key={anim.n} />}
        </span>
        <span className="sr-only">{state.liked ? "Liked" : "Like"}</span>
        <AnimatedNumber value={counts.likes} hideZero />
      </button>

      <button
        type="button"
        onClick={() => fire("bookmarked")}
        aria-pressed={state.bookmarked}
        aria-label={state.bookmarked ? "Remove bookmark" : "Bookmark"}
        className={`${base} ${state.bookmarked ? "text-accent" : "text-ink-3"} hover:bg-accent-soft hover:text-accent`}
      >
        <span key={anim.k === "bookmarked" ? anim.n : 0} className={`block ${anim.k === "bookmarked" && state.bookmarked ? "animate-bounce-down" : ""}`}>
          <BookmarkIcon size={size} filled={state.bookmarked} />
        </span>
      </button>

      <button type="button" onClick={onShare} aria-label="Share" className={`${base} text-ink-3 hover:bg-accent-soft hover:text-accent`}>
        <ShareIcon size={size} />
      </button>
    </div>
  );
}
