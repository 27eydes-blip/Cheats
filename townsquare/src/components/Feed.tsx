"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPage } from "@/lib/feed";
import type { FeedItem, PostView } from "@/lib/posts";
import { PostCard } from "./PostCard";
import { POSTED_EVENT } from "./providers";

type Source = { tab: string; handle?: string; ptab?: string; q?: string };

const qs = (s: Source, extra: Record<string, string>) => new URLSearchParams({ ...(s as Record<string, string>), ...extra }).toString();

export function PostSkeleton() {
  return (
    <div className="flex gap-3 border-b border-line px-4 py-4" aria-hidden="true">
      <div className="skeleton h-11 w-11 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
      </div>
    </div>
  );
}

/**
 * Infinite-scrolling feed. The first page comes from the server; later pages,
 * the "new posts" pill, and pull-to-refresh use /api/feed.
 */
export function Feed({ initial, source, empty, live, prependOwn }: { initial: FeedPage; source: Source; empty: React.ReactNode; live?: boolean; prependOwn?: boolean }) {
  const [items, setItems] = useState<FeedItem[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [pull, setPull] = useState(0);
  const loadedAt = useRef(Date.now());
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  // Reset when the source changes (e.g. switching tabs).
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
      const page = (await res.json()) as FeedPage;
      setItems((cur) => {
        const seen = new Set(cur.map((i) => i.post.id));
        return [...cur, ...page.items.filter((i) => !seen.has(i.post.id))];
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
    const res = await fetch(`/api/feed?${qs(source, {})}`);
    if (!res.ok) return;
    const page = (await res.json()) as FeedPage;
    setItems(page.items);
    setCursor(page.nextCursor);
    loadedAt.current = Date.now();
    setFresh(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [source]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // "New posts" pill: poll every 30s while the tab is visible
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/feed/new?${qs(source, { since: String(loadedAt.current) })}`).catch(() => null);
      if (r?.ok) setFresh(((await r.json()) as { count: number }).count);
    }, 30_000);
    return () => clearInterval(t);
  }, [live, source]);

  // Show the viewer's own new top-level post right away
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

  // Pull to refresh (touch only, at the top of the page)
  const startY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    setPull(Math.max(0, Math.min(90, (e.touches[0].clientY - startY.current) / 2)));
  };
  const onTouchEnd = () => {
    if (pull > 60) refresh();
    setPull(0);
    startY.current = null;
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {pull > 0 && (
        <div className="flex items-center justify-center text-sm text-muted" style={{ height: pull }} aria-hidden="true">
          {pull > 60 ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}
      {fresh > 0 && (
        <div className="sticky top-28 z-20 flex justify-center sm:top-16">
          <button type="button" onClick={refresh} className="btn-primary -mb-11 min-h-10 shadow-lg">
            ↑ {fresh} new post{fresh === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {items.length === 0 && !cursor ? (
        <div className="px-6 py-16 text-center text-muted">{empty}</div>
      ) : (
        <div role="feed" aria-busy={loading}>
          {items.map((it) => (
            <PostCard key={it.key} post={it.post} repostedBy={it.repostedBy} onGone={(id) => setItems((c) => c.filter((x) => x.post.id !== id))} />
          ))}
        </div>
      )}
      <div ref={sentinel} />
      {loading && (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}
      {error && (
        <div className="p-6 text-center">
          <button type="button" className="btn-outline" onClick={loadMore}>
            Couldn&apos;t load more. Retry
          </button>
        </div>
      )}
      {!cursor && items.length > 0 && <p className="py-10 text-center text-sm text-muted">You&apos;re all caught up.</p>}
    </div>
  );
}
