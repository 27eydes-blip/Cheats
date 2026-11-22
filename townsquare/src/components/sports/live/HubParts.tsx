"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { GameView } from "@/lib/sports/games";
import { fmtDay } from "@/lib/sports/time";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { useBoard } from "./LiveBoard";
import { GameCard, SideMark, StatusPill, winnerOf } from "./GameCard";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The live scoreboard strip at the top of the hub: live games first, then the
 * next ones to start. It advances one card every few seconds (paused while
 * you hover, touch or focus it, and off with reduced motion).
 */
export function ScoreHeader() {
  const { board, tz, now, flashing } = useBoard();
  const ref = useRef<HTMLUListElement>(null);
  const paused = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    const id = setInterval(() => {
      if (paused.current || document.hidden || el.scrollWidth <= el.clientWidth + 4) return;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + 196, behavior: "smooth" });
    }, 4_500);
    return () => clearInterval(id);
  }, []);
  if (!board.header.length) return null;
  const pause = (v: boolean) => () => void (paused.current = v);
  return (
    <section aria-label="Scoreboard" className="border-b border-[var(--hairline)] bg-[rgb(47_107_255/0.05)]">
      <ul
        ref={ref}
        data-no-swipe
        onMouseEnter={pause(true)}
        onMouseLeave={pause(false)}
        onTouchStart={pause(true)}
        onFocus={pause(true)}
        onBlur={pause(false)}
        className="scrollbar-none flex snap-x gap-2 overflow-x-auto px-4 py-2.5"
      >
        {board.header.map((g) => (
          <li key={g.id} className="shrink-0 snap-start">
            <Link href={`/sports/game/${g.id}`} data-game-id={g.id} className={`block w-[188px] rounded-[12px] px-3 py-2 ring-1 hover:bg-white/[0.05] ${g.status === "live" ? "ring-live/50" : "ring-[var(--hairline)]"} ${flashing.has(g.id) ? "score-flash" : ""}`}>
              <p className="mb-1 flex items-center justify-between gap-1">
                <span className="text-[10.5px] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{g.league}</span>
                <StatusPill g={g} tz={tz} now={now} />
              </p>
              {(["away", "home"] as const).map((k) => (
                <div key={k} className="flex min-h-7 items-center gap-1.5">
                  <SideMark side={g[k]} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{g[k].team?.abbr ?? g[k].name}</span>
                  {(g.status === "live" || g.status === "final") && <span className="num text-[15px] font-bold">{g[k].score ?? "–"}</span>}
                </div>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Game of the Day: big logos, records, the score or the start time, and a button into the game. */
export function GameOfDay() {
  const { board, tz, now, flashing } = useBoard();
  const g = board.featured;
  if (!g) return null;
  const win = winnerOf(g);
  const scored = g.status === "live" || g.status === "final";
  const team = (k: "home" | "away") => {
    const s = g[k];
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center text-center">
        <SideMark side={s} size="lg" />
        <span className={`mt-2 line-clamp-2 text-[15px] leading-tight ${win && win !== k ? "text-ink-3" : "font-bold"}`}>{s.team?.fullName ?? s.name}</span>
        {s.id && board.records[s.id] && <span className="num mt-0.5 text-[12.5px] text-ink-3">{board.records[s.id]}</span>}
      </div>
    );
  };
  return (
    <section aria-labelledby="gotd" className="px-4 pt-4">
      <div className={`relative overflow-hidden rounded-[20px] p-4 ring-1 sm:p-5 ${g.status === "live" ? "ring-live/40" : "ring-[var(--hairline)]"} ${flashing.has(g.id) ? "score-flash" : ""}`} style={{ background: "linear-gradient(135deg, rgb(47 107 255 / 0.18), rgb(7 11 20 / 0) 70%)" }}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="gotd" className="text-[12px] font-extrabold tracking-[0.14em] text-[var(--wn-blue-ink)] uppercase">Game of the day · {LEAGUE_NAME[g.league]}</h2>
          <StatusPill g={g} tz={tz} now={now} withDay={false} />
        </div>
        <div className="mt-4 flex items-start gap-2">
          {team("away")}
          <div className="flex min-w-[92px] flex-col items-center pt-3">
            {scored ? (
              <span className="num text-[38px] leading-none font-extrabold">{g.away.score ?? "–"}<span className="px-1.5 text-ink-3">–</span>{g.home.score ?? "–"}</span>
            ) : (
              <>
                <span className="text-[12.5px] font-bold text-ink-2">{fmtDay(g.startsAt, tz, now)}</span>
                <span className="text-[13px] text-ink-3">at</span>
              </>
            )}
          </div>
          {team("home")}
        </div>
        {g.venue && <p className="mt-3 text-center text-[13px] text-ink-3">{g.venue}</p>}
        <div className="mt-4 flex justify-center">
          <Link href={`/sports/game/${g.id}`} className="btn-primary !min-h-11 !text-[14.5px]">{g.status === "live" ? "Follow live" : g.status === "final" ? "Recap and stats" : "Game preview"}</Link>
        </div>
      </div>
    </section>
  );
}

function Group({ id, title, games, withDay = false, showLeague }: { id: string; title: string; games: GameView[]; withDay?: boolean; showLeague: boolean }) {
  const { tz, now, flashing, board } = useBoard();
  if (!games.length) return null;
  return (
    <section aria-labelledby={id} className="px-4 pt-5">
      <h2 id={id} className="mb-2 flex items-baseline gap-2 text-[17px] font-bold">
        {title}
        <span className="text-[13px] font-normal text-ink-3">{games.length}</span>
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {games.map((g) => <GameCard key={g.id} g={g} tz={tz} now={now} flash={flashing.has(g.id)} withDay={withDay} showLeague={showLeague} record={(tid) => (tid ? board.records[tid] ?? null : null)} />)}
      </ul>
    </section>
  );
}

/** Live now, Today, Upcoming (by day) and Results (by day), all kept fresh by the live board. */
export function BoardSections({ showLeague }: { showLeague: boolean }) {
  const { board, tz, now } = useBoard();
  const byDay = (games: GameView[]) => {
    const out: [string, GameView[]][] = [];
    for (const g of games) {
      const d = fmtDay(g.startsAt, tz, now);
      const last = out.at(-1);
      if (last && last[0] === d) last[1].push(g);
      else out.push([d, [g]]);
    }
    return out;
  };
  return (
    <>
      <Group id="live" title="Live now" games={board.live} showLeague={showLeague} />
      <Group id="today" title="Today" games={board.today} showLeague={showLeague} />
      {byDay(board.upcoming).map(([day, games], i) => <Group key={day} id={`up-${i}`} title={day} games={games} showLeague={showLeague} />)}
      {board.recent.length > 0 && (
        <>
          <h2 className="px-4 pt-6 text-[12.5px] font-extrabold tracking-[0.1em] text-ink-3 uppercase">Results</h2>
          {byDay(board.recent).map(([day, games], i) => <Group key={day} id={`res-${i}`} title={day} games={games} showLeague={showLeague} />)}
        </>
      )}
    </>
  );
}

export function RefreshNote() {
  const { board, refreshing } = useBoard();
  const live = board.live.length > 0;
  if (!live) return null;
  return (
    <p className="px-4 pt-3 text-[12.5px] text-ink-3" aria-live="polite">
      {refreshing ? "Updating scores…" : "Live scores update every 30 seconds."}
    </p>
  );
}
