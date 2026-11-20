"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPage } from "@/lib/feed";
import type { ForYouItem } from "@/lib/foryou";
import type { FeedItem, PostView } from "@/lib/posts";
import { ForYouFrame, SponsoredCard } from "./feed/ForYou";
import { StoryTile } from "./front/StoryCard";
import { PostCard } from "./PostCard";
import { POSTED_EVENT } from "./providers";
import { ArrowUpIcon } from "./icons";
import { LogoMark } from "./ui/Logo";
import type { MenuItem } from "./ui/Menu";
import { ErrorState } from "./ui/States";
import { FeedSkeleton, PostSkeleton } from "./ui/Skeleton";

type Source = { tab: string; handle?: string; ptab?: string; q?: string; exclude?: string; topic?: string; team?: string; list?: string };

const qs = (s: Source, extra: Record<string, string>) => new URLSearchParams({ ...(s as Record<string, string>), ...extra }).toString();

export { PostSkeleton };

/**
 * Infinite feed. The first page is server-rendered; later pages, the "N new
 * posts" pill, and pull-to-refresh use /api/feed. Offscreen cards skip layout
 * and paint (content-visibility), which keeps long sessions smooth.
 */
type Item = FeedItem | ForYouItem;
type Page = { items: Item[]; nextCursor: string | null };
const itemId = (it: Item) => ("ad" in it ? `ad:${it.key}` : "story" in it ? `story:${it.story.key}` : `post:${it.post.id}`);

export function Feed({ initial, source, empty, live, prependOwn, interleave, pad = true }: { initial: FeedPage | Page; source: Source; empty: React.ReactNode; live?: boolean; prependOwn?: boolean; /** a block shown after the Nth item (e.g. friend suggestions) */ interleave?: { at: number; node: React.ReactNode }; /** side padding (off when the page already pads) */ pad?: boolean }) {
  const [items, setItems] = useState<Item[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [pull, setPull] = useState(0);
  const loadedAt = useRef(Date.now());
  const firstCount = useRef(initial.items.length);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const key = JSON.stringify(source);
  useEffect(() => {
    setItems(initial.items);
    setCursor(initial.nextCursor);
    loadedAt.current = Date.now();
    firstCount.current = initial.items.length;
    setFresh(0);
  }, [key, initial]);

  const loadMore = useCallback(async () => {
    if (!cursor || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?${qs(source, { cursor })}`);
      if (!res.ok) throw new Error();
      const page = (await res.json()) as Page;
      setItems((cur) => {
        const seen = new Set(cur.map(itemId));
        return [...cur, ...page.items.filter((i) => !seen.has(itemId(i)))];
      });
      setCursor(page.nextCursor);
      setError(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [cursor, source]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/feed?${qs(source, {})}`);
      if (!res.ok) throw new Error();
      const page = (await res.json()) as Page;
      setItems(page.items);
      setCursor(page.nextCursor);
      loadedAt.current = Date.now();
      firstCount.current = 0;
      setFresh(0);
      setError(false);
      window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [source]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "1200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // "New dispatches" pill: check quietly; never move the feed under the reader.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/feed/new?${qs({ tab: source.tab === "following" ? "following" : "foryou" }, { since: String(loadedAt.current) })}`).catch(() => null);
      if (r?.ok) setFresh(((await r.json()) as { count: number }).count);
    }, 30_000);
    return () => clearInterval(t);
  }, [live, source.tab]);

  useEffect(() => {
    if (!prependOwn) return;
    const on = (e: Event) => {
      const p = (e as CustomEvent<PostView>).detail;
      if (p.replyTo) return;
      setItems((cur) => [{ key: `own_${p.id}`, post: p, repostedBy: null }, ...cur]);
    };
    window.addEventListener(POSTED_EVENT, on);
    return () => window.removeEventListener(POSTED_EVENT, on);
  }, [prependOwn]);

  // Pull to refresh (touch, at the top of the page) with resistance.
  const startY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const d = e.touches[0].clientY - startY.current;
    setPull(d > 0 ? Math.min(96, d * 0.45) : 0);
  };
  const onTouchEnd = () => {
    if (pull > 64) refresh();
    setPull(0);
    startY.current = null;
  };
  const showSpinner = pull > 0 || refreshing;
  const ready = pull > 64;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className={pad ? "px-3 sm:px-4" : ""}>
      {/* Pull to refresh: the WorldNet mark winds up, then spins with a cyan ring */}
      <div aria-hidden={!refreshing} className="flex items-center justify-center overflow-hidden" style={{ height: refreshing ? 60 : pull, transition: startY.current === null ? "height 300ms var(--ease-out)" : "none" }}>
        {showSpinner && (
          <span role={refreshing ? "status" : undefined} aria-label={refreshing ? "Refreshing" : undefined} className="relative flex h-11 w-11 items-center justify-center" style={{ opacity: refreshing ? 1 : Math.min(1, pull / 40) }}>
            <span className={`absolute inset-0 rounded-[15px] ring-2 transition-colors ${ready || refreshing ? "ring-[var(--wn-cyan)] shadow-[0_0_18px_rgb(34_211_238/0.6)]" : "ring-[var(--rule-strong)]"} ${refreshing ? "motion-safe:animate-ping" : ""}`} />
            <span className={refreshing ? "motion-safe:animate-spin" : ""} style={refreshing ? { animationDuration: "0.9s" } : { transform: `rotate(${pull * 4}deg) scale(${0.7 + Math.min(0.3, pull / 220)})` }}><LogoMark size={30} /></span>
          </span>
        )}
      </div>

      {fresh > 0 && (
        <div className="pointer-events-none sticky top-[calc(var(--sub-top)+64px)] z-20 flex h-0 justify-center">
          <button type="button" onClick={refresh} className="btn-primary pointer-events-auto mt-1 !min-h-11 animate-slide-down !rounded-full !px-5 !text-[14px] shadow-glow">
            <ArrowUpIcon size={16} strokeWidth={2.4} /> {fresh} new dispatch{fresh === 1 ? "" : "es"}
          </button>
        </div>
      )}

      {items.length === 0 && !cursor ? (
        <div className="card overflow-hidden">{empty}</div>
      ) : (
        <div role="feed" aria-busy={loading} className="space-y-3">
          {items.map((it, i) => {
            const drop = () => setItems((c) => c.filter((x) => itemId(x) !== itemId(it)));
            // Cards fade and rise in: staggered on first paint, immediate for pages loaded later.
            const anim = { animationDelay: i < firstCount.current ? `${Math.min(i, 6) * 45}ms` : "0ms" };
            let row: React.ReactNode;
            if ("ad" in it) {
              row = <div key={it.key} role="article" aria-label="Sponsored" className="animate-rise" style={anim}><SponsoredCard ad={it.ad} /></div>;
            } else {
              const post = (extra?: MenuItem[]) => "post" in it && <PostCard flat post={it.post} repostedBy={it.repostedBy} index={i} extraMenu={extra} onGone={(id) => setItems((c) => c.filter((x) => !("post" in x) || x.post.id !== id))} />;
              const story = "story" in it && <StoryTile s={it.story} big flat rising={"rising" in it && it.rising} />;
              row = (
                <div key={it.key} role={"kind" in it ? undefined : "story" in it ? "article" : undefined} className="card feed-card animate-rise overflow-hidden" style={anim}>
                  {"kind" in it ? <ForYouFrame item={it} onDismiss={drop}>{"story" in it ? story : post}</ForYouFrame> : "story" in it ? story : post()}
                </div>
              );
            }
            return interleave && i === interleave.at - 1 ? [row, <div key="interleave" role="article" aria-label="People you may know" className="card animate-rise p-4">{interleave.node}</div>] : row;
          })}
        </div>
      )}
      <div ref={sentinel} />
      {loading && <div className="mt-3"><FeedSkeleton count={2} /></div>}
      {error && <ErrorState message="Couldn't load more dispatches." onRetry={loadMore} />}
      {!cursor && items.length > 0 && (
        <div className="flex items-center gap-3 px-6 py-10 text-[13px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          You&apos;re all caught up
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </div>
  );
}
