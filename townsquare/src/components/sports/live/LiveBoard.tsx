"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/sports/hub";
import type { GameView } from "@/lib/sports/games";
import { changedScores, POLL_MS, shouldPoll } from "@/lib/sports/status";

type Ctx = { board: Board; tz: string; now: number; flashing: Set<string>; refreshing: boolean; syncedAt: number };
const BoardCtx = createContext<Ctx | null>(null);

export function useBoard(): Ctx {
  const c = useContext(BoardCtx);
  if (!c) throw new Error("useBoard needs a LiveBoardProvider");
  return c;
}

const allGames = (b: Board): GameView[] => [...b.live, ...b.today, ...b.upcoming, ...b.recent, ...b.header, ...(b.featured ? [b.featured] : [])];

/** Put changed games into the board in place. Returns null when a change needs the whole board (a game moved between lists). */
export function mergeChanges(b: Board, changed: GameView[]): Board | null {
  const known = new Map(allGames(b).map((g) => [g.id, g]));
  const byId = new Map<string, GameView>();
  for (const g of changed) {
    const old = known.get(g.id);
    if (!old) {
      if (g.status === "live") return null; // a game just started: reload so it lands in the right list
      continue;
    }
    if (old.status !== g.status) return null;
    byId.set(g.id, g);
  }
  if (!byId.size) return b;
  const swap = (list: GameView[]) => list.map((g) => byId.get(g.id) ?? g);
  return { ...b, live: swap(b.live), today: swap(b.today), upcoming: swap(b.upcoming), recent: swap(b.recent), header: swap(b.header), featured: b.featured ? byId.get(b.featured.id) ?? b.featured : null };
}

/**
 * Holds the hub's games and keeps them fresh without reloading the page.
 * Every 20 seconds, while something is live or about to start and the tab is
 * visible, it asks /api/sports/changes for only the games that changed since
 * the last answer (a 304 when nothing did). Changed scores flash briefly;
 * when a game moves between lists (it started or ended) the whole board is
 * fetched once.
 */
export function LiveBoardProvider({ initial, league, tz, children, fetchImpl }: { initial: Board; league: string | null; tz: string; children: React.ReactNode; fetchImpl?: typeof fetch }) {
  const [board, setBoard] = useState(initial);
  const [now, setNow] = useState(initial.at);
  const [syncedAt, setSyncedAt] = useState(initial.syncedAt ?? 0);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const cursor = useRef(initial.at);
  const etag = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Board) => {
    const before = new Map(allGames(boardRef.current).map((g) => [g.id, g]));
    const changed = changedScores(before, allGames(next));
    boardRef.current = next;
    setBoard(next);
    if (changed.size) {
      setFlashing(changed);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashing(new Set()), 2_000);
    }
  }, []);

  const q = league ? `league=${league}` : "";
  const reload = useCallback(async () => {
    const res = await (fetchImpl ?? fetch)(`/api/sports/scores${q ? `?${q}` : ""}`, { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()) as Board;
    show(next);
    cursor.current = next.at ?? Date.now();
    etag.current = null;
    setNow(next.at ?? Date.now());
    if (next.syncedAt) setSyncedAt(next.syncedAt);
  }, [fetchImpl, q, show]);

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (!shouldPoll(allGames(boardRef.current), Date.now())) return;
    setRefreshing(true);
    try {
      const res = await (fetchImpl ?? fetch)(`/api/sports/changes?since=${cursor.current}${q ? `&${q}` : ""}`, { cache: "no-store", headers: etag.current ? { "If-None-Match": etag.current } : {} });
      setNow(Date.now());
      if (res.status === 304 || !res.ok) return;
      const d = (await res.json()) as { full: boolean; at: number; syncedAt: number; games: GameView[] };
      if (d.full) return void (await reload());
      etag.current = res.headers.get("ETag");
      cursor.current = d.at;
      if (d.syncedAt) setSyncedAt(d.syncedAt);
      const merged = mergeChanges(boardRef.current, d.games);
      if (merged === null) await reload();
      else if (merged !== boardRef.current) show(merged);
    } catch {
      /* offline or server busy: keep showing the last scores and try again next time */
    } finally {
      setRefreshing(false);
    }
  }, [fetchImpl, q, reload, show]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [refresh]);

  return <BoardCtx.Provider value={{ board, tz, now, flashing, refreshing, syncedAt }}>{children}</BoardCtx.Provider>;
}
