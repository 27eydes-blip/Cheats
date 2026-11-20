"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { StorySummary } from "@/lib/news";
import type { PostView } from "@/lib/posts";
import type { Debate } from "@/lib/takes";
import { useComposer } from "../providers";
import { Kicker, LiveBadge } from "../ui/Badge";
import { StanceMeter } from "../ui/Stance";
import { StanceChip } from "../ui/Stance";
import { TakeIcon } from "../icons";
import { DebateCard } from "./DebateCard";
import { StoryArt } from "./StoryArt";

type Card = { kind: "story"; s: StorySummary; top?: PostView } | { kind: "debate"; d: Debate } | { kind: "end" };

/**
 * Phone Front Page: a full-height story deck. Swipe up through Stories (one
 * per screen, snapping); swipe sideways to change channel.
 */
export function Deck({ cards, channels, channelIndex }: { cards: Card[]; channels: { href: string; label: string }[]; channelIndex: number }) {
  const router = useRouter();
  const openComposer = useComposer();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setAt(Math.round(el.scrollTop / el.clientHeight));
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="scrollbar-none h-[calc(100dvh-var(--header-h)-var(--dial-h)-var(--wire-h)-var(--dock-h)-env(safe-area-inset-bottom)-5px)] snap-y snap-mandatory overflow-y-auto overscroll-contain"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() })}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s || (e.target as HTMLElement).closest("button,a,[data-no-swipe]")) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5 && Date.now() - s.t < 600) {
            const n = channelIndex + (dx < 0 ? 1 : -1);
            if (n >= 0 && n < channels.length) router.push(channels[n].href, { scroll: false });
          }
        }}
        aria-label="Story deck"
      >
        {cards.map((c, i) => (
          <section key={i} className="relative flex h-full snap-start snap-always flex-col border-b border-rule" aria-roledescription="slide" aria-label={`${i + 1} of ${cards.length}`}>
            {c.kind === "story" && (
              <>
                <Link href={`/news/story/${c.s.key}`} className="relative block h-[36%] min-h-[150px] shrink-0 overflow-hidden">
                  <StoryArt seed={c.s.key} section={c.s.section} />
                  <span className="absolute top-3 left-3 flex items-center gap-2">
                    {c.s.status === "live" ? <LiveBadge label="LIVE" /> : <span className="folio bg-navy/85 px-1.5 py-0.5 !text-[10px] text-gold">{c.s.status === "developing" ? "Developing" : "Final"}</span>}
                  </span>
                  <span className="mono absolute right-3 bottom-3 bg-navy/85 px-2 py-0.5 text-[11px] text-white">{c.s.takes} takes</span>
                </Link>
                <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-3">
                  <Kicker tone="muted">{c.s.section === "Top Stories" ? "National" : c.s.section} · {String(i + 1).padStart(2, "0")}</Kicker>
                  <Link href={`/news/story/${c.s.key}`}>
                    <h2 className="mt-1 line-clamp-3 font-display text-[clamp(1.6rem,6.6vw,2rem)] leading-[1.05] font-semibold">{c.s.title}</h2>
                  </Link>
                  <p className="mt-2 line-clamp-2 text-[14.5px] leading-snug text-ink-2">{c.s.summary}</p>
                  {c.top && (
                    <p className="mt-2 line-clamp-1 text-[13px] text-ink-3">
                      {c.top.stance && <span className="mr-1.5 align-middle"><StanceChip stance={c.top.stance} /></span>}
                      <b className="text-ink-2">{c.top.author.displayName}:</b> {c.top.body.replace(/\s*#\w+\s*$/, "")}
                    </p>
                  )}
                  <div className="mt-auto pt-3">
                    <StanceMeter type="story" id={c.s.key} initial={c.s.split} variant="large" />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Link href={`/news/story/${c.s.key}`} className="btn-outline !min-h-10 !text-[13px]">Open story</Link>
                      <button type="button" onClick={() => openComposer({ storyKey: c.s.key })} className="btn-primary !min-h-10 !text-[13px]"><TakeIcon size={15} /> Take it</button>
                    </div>
                  </div>
                </div>
              </>
            )}
            {c.kind === "debate" && (
              <div className="flex h-full flex-col justify-center px-4">
                <p className="folio mb-3 text-navy-ink">Hot Debate</p>
                <DebateCard d={c.d} compact />
              </div>
            )}
            {c.kind === "end" && (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <p className="folio text-gold-ink">That&apos;s the front page</p>
                <p className="mt-3 font-display text-h1 font-semibold">You&apos;re caught up.</p>
                <p className="mt-2 text-ink-2">Swipe sideways for another channel, or read the Morning Edition.</p>
                <div className="mt-6 flex gap-2">
                  <Link href="/briefing" className="btn-primary">Morning Edition</Link>
                  <Link href="/rundown" className="btn-outline">Your Rundown</Link>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="pointer-events-none absolute top-1/2 right-1.5 flex -translate-y-1/2 flex-col gap-1" aria-hidden="true">
        {cards.map((_, i) => <span key={i} className={`w-[3px] transition-all duration-300 ${i === at ? "h-5 bg-gold" : "h-2 bg-rule-strong"}`} />)}
      </div>
    </div>
  );
}

export type { Card as DeckCardData };
