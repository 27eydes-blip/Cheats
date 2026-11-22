"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { muteTopicAction, notInterestedAction, showMoreAction, trackAction } from "@/actions/feed";
import type { SponsoredCard as SponsoredCardData } from "@/lib/ads";
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

const track = (id: string, kind: "view" | "click", preview?: boolean) => {
  if (preview) return;
  const url = `/api/sponsors/${encodeURIComponent(id)}/event?kind=${kind}`;
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* counting must never break the card */
  }
};

/**
 * A sponsored card: always labeled "Sponsored", quieter than a dispatch, in
 * the same compact row layout. Text first, then the image (1200×630, 12px
 * corners, lazy, fixed aspect ratio). Without an image, or if it fails to
 * load, it's a clean text card with the sponsor's initial. Links open in a
 * new tab with rel="noopener sponsored". A view counts after the card is
 * half on screen for a second; clicks count on tap.
 */
export function SponsoredCard({ ad, preview }: { ad: SponsoredCardData; /** Control Room preview: no counting */ preview?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || preview || typeof IntersectionObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) t = setTimeout(() => (track(ad.id, "view"), io.disconnect()), 1000);
      else if (t) clearTimeout(t);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (t) clearTimeout(t);
    };
  }, [ad.id, preview]);
  const link = { href: ad.url, target: "_blank", rel: "noopener sponsored", onClick: () => track(ad.id, "click", preview) };
  const initial = (ad.sponsor.trim()[0] ?? "S").toUpperCase();
  return (
    <aside ref={ref} aria-label={`Sponsored by ${ad.sponsor}`} className="flex gap-3 px-4 py-2.5">
      <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[16px] font-bold text-ink-2 ring-1 ring-[var(--hairline)]">{initial}</span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[20px] text-ink-3">
          <span className="truncate font-semibold text-ink-2">{ad.sponsor}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 rounded-[4px] px-1 py-px text-[11.5px] font-semibold ring-1 ring-[var(--hairline)]">Sponsored</span>
        </p>
        <a {...link} className="group block min-h-11">
          <span className="block text-[15px] leading-[21px] font-semibold text-ink-1 group-hover:underline">{ad.title}</span>
          {ad.body && <span className="block text-[14px] leading-[20px] text-ink-2">{ad.body}</span>}
        </a>
        {ad.image && imgOk && (
          <a {...link} tabIndex={-1} className="mt-2 block max-w-[520px] overflow-hidden rounded-[12px] ring-1 ring-[var(--hairline)]" style={{ aspectRatio: "1200 / 630" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ad.image.w600} srcSet={`${ad.image.w600} 600w, ${ad.image.w1200} 1200w`} sizes="(max-width: 640px) 100vw, 520px" alt={ad.image.alt} width={1200} height={630} loading="lazy" decoding="async" onError={() => setImgOk(false)} className="block h-full w-full object-cover" />
          </a>
        )}
        <a {...link} className="tap mt-1.5 inline-flex min-h-8 items-center rounded-full px-3 text-[13px] font-semibold text-ink-1 ring-1 ring-[var(--hairline)] hover:bg-white/[0.04]">
          {ad.button || "Learn more"} <span aria-hidden="true" className="ml-1 text-ink-3">↗</span><span className="sr-only"> (opens {ad.sponsor} in a new tab)</span>
        </a>
      </div>
    </aside>
  );
}
