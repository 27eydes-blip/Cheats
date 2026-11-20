"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { FeedPage } from "@/lib/feed";
import type { ForYouItem } from "@/lib/foryou";
import type { FeedItem, PostView } from "@/lib/posts";
import { ForYouFrame } from "./feed/ForYou";
import { StoryTile } from "./front/StoryCard";
import { PostCard } from "./PostCard";
import { POSTED_EVENT } from "./providers";
import { ArrowUpIcon } from "./icons";
import { ErrorState } from "./ui/States";
import { FeedSkeleton, PostSkeleton } from "./ui/Skeleton";

type Source = { tab: string; handle?: string; ptab?: string; q?: string; exclude?: string };

const qs = (s: Source, extra: Record<string, string>) => new URLSearchParams({ ...(s as Record<string, string>), ...extra }).toString();

export { PostSkeleton };

/**
 * Infinite feed. The first page is server-rendered; later pages, the "N new
 * posts" pill, and pull-to-refresh use /api/feed. Offscreen cards skip layout
 * and paint (content-visibility), which keeps long sessions smooth.
 */
type Item = FeedItem | ForYouItem;
type Page = { items: Item[]; nextCursor: string | null };
const itemId = (it: Item) => ("story" in it ? `story:${it.story.key}` : `post:${it.post.id}`);

export function Feed({ initial, source, empty, live, prependOwn, interleave }: { initial: FeedPage | Page; source: Source; empty: React.ReactNode; live?: boolean; prependOwn?: boolean; /** a block shown after the Nth item (e.g. friend suggestions) */ interleave?: { at: number; node: React.ReactNode } }) {
  const [items, setItems] = useState<Item[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [pull, setPull] = useState(0);
  const loadedAt = useRef(Date.now());
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const key = JSON.stringify(source);
  useEffect(() => {
    setItems(initial.items);
    setCursor(initial.nextCursor);
    loadedAt.current = Date.now();
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
      setFresh(0);
      setError(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/feed/new?${qs(source, { since: String(loadedAt.current) })}`).catch(() => null);
      if (r?.ok) setFresh(((await r.json()) as { count: number }).count);
    }, 30_000);
    return () => clearInterval(t);
  }, [live, source]);

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

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        aria-hidden={!refreshing}
        className="flex items-center justify-center overflow-hidden"
        style={{ height: refreshing ? 52 : pull, transition: startY.current === null ? "height 300ms var(--ease-out)" : "none" }}
      >
        {showSpinner && (
          <svg width="26" height="26" viewBox="0 0 26 26" className={refreshing ? "animate-spin" : ""} style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }} role={refreshing ? "status" : undefined} aria-label={refreshing ? "Refreshing" : undefined}>
            <circle cx="13" cy="13" r="10" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
            <circle cx="13" cy="13" r="10" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${refreshing ? 20 : Math.min(62, (pull / 64) * 62)} 63`} />
          </svg>
        )}
      </div>

      {fresh > 0 && (
        <div className="pointer-events-none sticky top-[calc(var(--sub-top)+60px)] z-20 flex h-0 justify-center">
          <button type="button" onClick={refresh} className="btn-primary pointer-events-auto mt-2 !min-h-10 animate-slide-down !px-4 !text-[14px] shadow-glow">
            <ArrowUpIcon size={16} strokeWidth={2.4} /> {fresh} new post{fresh === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {items.length === 0 && !cursor ? (
        empty
      ) : (
        <div role="feed" aria-busy={loading}>
          {items.map((it, i) => {
            const drop = () => setItems((c) => c.filter((x) => itemId(x) !== itemId(it)));
            const body =
              "story" in it ? (
                <div className="px-3 pb-3 sm:px-4"><StoryTile s={it.story} big /></div>
              ) : (
                <PostCard post={it.post} repostedBy={it.repostedBy} index={i} onGone={(id) => setItems((c) => c.filter((x) => "story" in x || x.post.id !== id))} />
              );
            const row = "kind" in it ? <ForYouFrame key={it.key} item={it} onDismiss={drop}>{body}</ForYouFrame> : "story" in it ? <div key={it.key} role="article">{body}</div> : <Fragment key={it.key}>{body}</Fragment>;
            return interleave && i === interleave.at - 1 ? [row, <div key="interleave" role="article" aria-label="People you may know" className="border-y border-rule bg-white/[0.015] px-4 py-2">{interleave.node}</div>] : row;
          })}
        </div>
      )}
      <div ref={sentinel} />
      {loading && <FeedSkeleton count={2} />}
      {error && <ErrorState message="Couldn't load more posts." onRetry={loadMore} />}
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
