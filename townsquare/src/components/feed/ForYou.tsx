"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { muteTopicAction, notInterestedAction, showMoreAction, trackAction } from "@/actions/feed";
import type { ForYouItem } from "@/lib/foryou";
import type { TrackEvent } from "@/lib/interests";
import { MoreIcon, MuteIcon, PlusIcon, CloseIcon } from "../icons";
import { useToast, useViewer } from "../providers";
import { Menu, type MenuItem } from "../ui/Menu";

const TOPIC_LABEL: Record<string, string> = { politics: "Politics", markets: "Markets", sports: "Sports", tech: "Tech", world: "World", culture: "Culture", national: "National" };

/* ---------------------------------------------------------- engagement tracking */
const queue: TrackEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  timer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  trackAction(batch).catch(() => {});
}
function enqueue(e: TrackEvent) {
  queue.push(e);
  if (queue.length >= 40) flush();
  else if (!timer) timer = setTimeout(flush, 10_000);
}
if (typeof window !== "undefined") {
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}

/**
 * Wraps one For You item: records a view after 1s on screen, time spent
 * (dwell) when it leaves, and clicks; shows why it's here and the
 * Show more / Not interested / Mute topic controls.
 */
export function ForYouFrame({ item, onDismiss, children }: { item: Exclude<ForYouItem, { kind: "sponsored" }>; onDismiss: () => void; /** dispatches get the feed controls merged into their own ••• menu */ children: React.ReactNode | ((feedMenu: MenuItem[]) => React.ReactNode) }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewer = useViewer();
  const toast = useToast();
  const [, start] = useTransition();
  const [gone, setGone] = useState(false);
  const target = item.kind === "post" ? { type: "post" as const, id: item.post.id } : { type: "story" as const, id: item.story.key };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let since = 0;
    let viewed = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          since = performance.now();
          t = setTimeout(() => {
            if (!viewed) (viewed = true), enqueue({ ...target, kind: "view" });
          }, 1000);
        } else if (since) {
          if (t) clearTimeout(t);
          const ms = performance.now() - since;
          since = 0;
          if (ms > 3000) enqueue({ ...target, kind: "dwell", ms });
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  if (gone) return null;
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, hide?: boolean) => {
    if (!viewer) return (location.href = "/login?next=/");
    if (hide) setGone(true);
    start(async () => {
      const r = await fn();
      if (!r.ok) (hide && setGone(false), toast(r.error ?? "Something went wrong.", "error"));
      else {
        toast(done);
        if (hide) onDismiss();
      }
    });
  };
  const topic = item.topic ? TOPIC_LABEL[item.topic] ?? item.topic : null;
  const items: MenuItem[] = [
    { label: "Show more like this", icon: <PlusIcon size={18} />, onSelect: () => act(() => showMoreAction(target), "Got it. More like this.") },
    { label: "Not interested", icon: <CloseIcon size={18} />, onSelect: () => act(() => notInterestedAction(target), "Hidden. You'll see less like this.", true) },
    ...(topic ? [{ label: `Mute topic: ${topic}`, icon: <MuteIcon size={18} />, onSelect: () => act(() => muteTopicAction(item.topic!, true), `${topic} muted. Undo in Settings.`, true) }] : []),
  ];

  // "Why am I seeing this": one quiet gray line, indented to line up with the text column.
  const label = item.kind === "post" && item.promoted ? "Promoted" : item.kind === "post" ? item.reason : null;
  const merged = typeof children === "function";
  return (
    <div ref={ref} role="article" aria-label={item.kind === "story" ? item.story.title : `Dispatch by ${item.post.author.displayName}`} className="relative">
      {label && <p className="truncate px-4 pt-2 pl-[68px] text-[12.5px] leading-none text-ink-3">{label}</p>}
      {!merged && (
        <div className="absolute top-1.5 right-[104px] z-[1] sm:right-[140px]">
          <Menu label="Feed options" items={items} button={<MoreIcon size={17} />} buttonClassName="tap flex h-6 w-8 items-center justify-center text-ink-3 hover:text-ink-1" />
        </div>
      )}
      {merged ? children(items) : children}
    </div>
  );
}

/** Records that a story or dispatch was opened (feeds History and interests). Renders nothing. */
export function TrackOpen({ type, id }: { type: "post" | "story"; id: string }) {
  useEffect(() => {
    enqueue({ type, id, kind: "click" });
    const t = setTimeout(flush, 1500);
    return () => clearTimeout(t);
  }, [type, id]);
  return null;
}

/**
 * A sponsored row: always labeled, and deliberately quieter than a dispatch
 * (gray text, no avatar, no image, no color). Shown only when ads are on in the Control Room.
 */
export function SponsoredCard({ ad }: { ad: { id: string; sponsor: string; title: string; body: string; url: string } }) {
  return (
    <aside aria-label={`Sponsored by ${ad.sponsor}`} className="px-4 py-2.5 pl-[68px]">
      <p className="text-[12.5px] text-ink-3"><span className="rounded-[4px] px-1 py-px font-semibold ring-1 ring-[var(--hairline)]">Sponsored</span> · {ad.sponsor}</p>
      <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" className="group mt-1 block">
        <span className="block text-[14.5px] leading-[20px] font-medium text-ink-2 group-hover:underline">{ad.title}</span>
        {ad.body && <span className="block text-[13.5px] leading-[19px] text-ink-3">{ad.body}</span>}
        <span className="tap mt-0.5 inline-block text-[13px] text-ink-3 underline underline-offset-2">Learn more</span>
      </a>
    </aside>
  );
}
