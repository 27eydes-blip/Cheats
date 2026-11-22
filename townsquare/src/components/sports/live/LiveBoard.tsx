"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/sports/hub";
import type { GameView } from "@/lib/sports/games";
import { changedScores, POLL_MS, shouldPoll } from "@/lib/sports/status";

type Ctx = { board: Board; tz: string; now: number; flashing: Set<string>; refreshing: boolean };
const BoardCtx = createContext<Ctx | null>(null);

export function useBoard(): Ctx {
  const c = useContext(BoardCtx);
  if (!c) throw new Error("useBoard needs a LiveBoardProvider");
  return c;
}

const allGames = (b: Board): GameView[] => [...b.live, ...b.today, ...b.upcoming, ...b.recent, ...b.header, ...(b.featured ? [b.featured] : [])];

/**
 * Holds the hub's games and refreshes them every 30 seconds while anything is
 * live or about to start, without reloading the page. Pauses while the tab is
 * hidden. Scores that changed flash briefly (CSS, skipped with reduced motion).
 */
export function LiveBoardProvider({ initial, league, tz, children, fetchImpl }: { initial: Board; league: string | null; tz: string; children: React.ReactNode; fetchImpl?: typeof fetch }) {
  const [board, setBoard] = useState(initial);
  const [now, setNow] = useState(initial.at);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (!shouldPoll(allGames(boardRef.current), Date.now())) return;
    setRefreshing(true);
    try {
      const res = await (fetchImpl ?? fetch)(`/api/sports/scores${league ? `?league=${league}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Board;
      const before = new Map(allGames(boardRef.current).map((g) => [g.id, g]));
      const changed = changedScores(before, allGames(next));
      setBoard(next);
      setNow(next.at ?? Date.now());
      if (changed.size) {
        setFlashing(changed);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashing(new Set()), 2_000);
      }
    } catch {
      /* offline or server busy: keep showing the last scores and try again next time */
    } finally {
      setRefreshing(false);
    }
  }, [fetchImpl, league]);

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

  return <BoardCtx.Provider value={{ board, tz, now, flashing, refreshing }}>{children}</BoardCtx.Provider>;
}
