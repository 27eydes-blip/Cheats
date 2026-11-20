"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FeedPage } from "@/lib/feed";
import type { ForYouItem } from "@/lib/foryou";
import type { FeedItem, PostView } from "@/lib/posts";
import { ForYouFrame, SponsoredCard } from "./feed/ForYou";
import { StoryRow } from "./front/StoryCard";
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
 * Infinite timeline. The first page is server-rendered; later pages, the "N new
 * dispatches" pill, and pull-to-refresh use /api/feed. Rows are flat with one
 * hairline between them. Once the list grows past VIRTUAL_FROM rows it is
 * windowed: only the rows near the screen stay mounted, and measured spacers
 * hold the scroll height, so a long session stays as fast as a short one.
 */
const VIRTUAL_FROM = 30;
const OVERSCAN = 1400; // px kept mounted above and below the screen
const EST = 150; // height guess for a row that has not been measured yet

/** Which rows are near the viewport, given each row's measured height. */
function useWindowing(ids: string[], on: boolean) {
  const list = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const [range, setRange] = useState<[number, number]>([0, ids.length]);
  const [, bump] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const compute = useCallback(() => {
    const el = list.current;
    const all = idsRef.current;
    if (!el || !on) return setRange((r) => (r[0] === 0 && r[1] === all.length ? r : [0, all.length]));
    const top = el.getBoundingClientRect().top;
    const from = -top - OVERSCAN;
    const to = -top + window.innerHeight + OVERSCAN;
    let y = 0;
    let start = all.length;
    let end = all.length;
    for (let i = 0; i < all.length; i++) {
      const h = heights.current.get(all[i]) ?? EST;
      if (start === all.length && y + h > from) start = i;
      if (y > to) { end = i; break; }
      y += h;
    }
    if (start === all.length) start = Math.max(0, all.length - 1);
    setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
  }, [on]);

  useEffect(() => {
    let raf = 0;
    const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
    tick();
    if (!on) return () => cancelAnimationFrame(raf);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => (cancelAnimationFrame(raf), window.removeEventListener("scroll", tick), window.removeEventListener("resize", tick));
  }, [compute, on, ids.length]);

  // Measure every mounted row; a changed height re-lays the spacers.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.row!;
        const h = (e.target as HTMLElement).offsetHeight;
        if (h && heights.current.get(id) !== h) (heights.current.set(id, h), (changed = true));
      }
      if (changed) (bump((n) => n + 1), compute());
    });
    return () => ro.current?.disconnect();
  }, [compute]);
  const measure = useCallback((el: HTMLElement | null) => {
    if (el) ro.current?.observe(el);
  }, []);

  const [start, end] = on ? range : [0, ids.length];
  const sum = (a: number, b: number) => {
    let t = 0;
    for (let i = a; i < b; i++) t += heights.current.get(ids[i]) ?? EST;
    return t;
  };
  return { list, measure, start, end: Math.min(end, ids.length), before: on ? sum(0, start) : 0, after: on ? sum(Math.min(end, ids.length), ids.length) : 0 };
}

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

  const ids = items.map(itemId);
  const win = useWindowing(ids, items.length > VIRTUAL_FROM);

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className={pad ? "" : ""}>
      {/* Pull to refresh: the WorldNet mark turns as you pull, then spins */}
      <div aria-hidden={!refreshing} className="flex items-center justify-center overflow-hidden" style={{ height: refreshing ? 48 : pull, transition: startY.current === null ? "height 300ms var(--ease-out)" : "none" }}>
        {showSpinner && (
          <span role={refreshing ? "status" : undefined} aria-label={refreshing ? "Refreshing" : undefined} className="flex h-9 w-9 items-center justify-center" style={{ opacity: refreshing ? 1 : Math.min(1, pull / 40) }}>
            <span className={refreshing ? "motion-safe:animate-spin" : ""} style={refreshing ? { animationDuration: "0.9s" } : { transform: `rotate(${pull * 4}deg) scale(${ready ? 1 : 0.8})` }}><LogoMark size={24} /></span>
          </span>
        )}
      </div>

      {fresh > 0 && (
        <div className="pointer-events-none sticky top-[calc(var(--sub-top)+52px)] z-20 flex h-0 justify-center">
          <button type="button" onClick={refresh} className="pointer-events-auto mt-1 inline-flex h-8 animate-slide-down items-center gap-1.5 rounded-full bg-[var(--wn-blue-fill)] px-3.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgb(0_0_0/0.4)]">
            <ArrowUpIcon size={14} strokeWidth={2.4} /> {fresh} new dispatch{fresh === 1 ? "" : "es"}
          </button>
        </div>
      )}

      {items.length === 0 && !cursor ? (
        <div>{empty}</div>
      ) : (
        <div ref={win.list} role="feed" aria-busy={loading} style={{ paddingTop: win.before, paddingBottom: win.after }}>
          {items.slice(win.start, win.end).map((it, k) => {
            const i = win.start + k;
            const id = ids[i];
            const drop = () => setItems((c) => c.filter((x) => itemId(x) !== id));
            const pos = { "aria-posinset": i + 1, "aria-setsize": cursor ? -1 : items.length };
            let row: React.ReactNode;
            if ("ad" in it) {
              row = <div role="article" aria-label="Sponsored" {...pos}><SponsoredCard ad={it.ad} /></div>;
            } else {
              const post = (extra?: MenuItem[]) =>
                "post" in it && (
                  <PostCard
                    flat
                    post={it.post}
                    repostedBy={it.repostedBy}
                    extraMenu={extra}
                    onChange={(p) => setItems((c) => c.map((x) => ("post" in x && x.post.id === p.id && x.post !== p ? { ...x, post: p } : x)))}
                    onGone={(pid) => setItems((c) => c.filter((x) => !("post" in x) || x.post.id !== pid))}
                  />
                );
              const story = "story" in it && <StoryRow s={it.story} rising={"rising" in it && it.rising} />;
              row = "kind" in it ? <ForYouFrame item={it} onDismiss={drop}>{"story" in it ? story : post}</ForYouFrame> : "story" in it ? <div role="article" aria-label={(it as { story: { title: string } }).story.title} {...pos}>{story}</div> : post();
            }
            return (
              <div key={it.key} data-row={id} ref={win.measure} className="tl-row">
                {row}
                {interleave && i === interleave.at - 1 && <div role="article" aria-label="People you may know" className="border-t border-[var(--hairline)] px-4 py-3">{interleave.node}</div>}
              </div>
            );
          })}
        </div>
      )}
      <div ref={sentinel} />
      {loading && <FeedSkeleton count={3} />}
      {error && <ErrorState message="Couldn't load more dispatches." onRetry={loadMore} />}
      {!cursor && items.length > 0 && <p className="px-6 py-8 text-center text-[13px] text-ink-3">You&apos;re all caught up</p>}
    </div>
  );
}
