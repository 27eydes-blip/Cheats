"use client";

import Link from "next/link";
import type { GameSide, GameView } from "@/lib/sports/games";
import { statusLabel } from "@/lib/sports/status";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { LetterBadge, TeamLogo } from "../TeamLogo";

const PX = { sm: 22, md: 34, lg: 64 } as const;

/** Team logo with the shared fallback: uploaded or provider logo, else the color letter circle. */
export function SideMark({ side, size = "sm" }: { side: GameSide; size?: keyof typeof PX }) {
  if (side.team) return <TeamLogo team={side.team} size={size} label={false} />;
  return <LetterBadge circle={side.badge} name={side.name} px={PX[size]} label={false} />;
}

/** The status pill: red pulsing LIVE (the only red on the page), Final, or the local start time. */
export function StatusPill({ g, tz, now, withDay = true, className = "" }: { g: GameView; tz: string; now: number; withDay?: boolean; className?: string }) {
  const s = statusLabel(g, tz, now, withDay);
  if (s.kind === "live")
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-[6px] bg-live-bg px-1.5 py-0.5 text-[11.5px] leading-none font-extrabold tracking-[0.04em] text-white ${className}`} aria-label={s.long}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" />
        <span aria-hidden="true">{s.text}</span>
      </span>
    );
  return (
    <span className={`text-[12.5px] ${s.kind === "final" ? "font-bold text-ink-1" : s.kind === "scheduled" ? "font-semibold text-[var(--wn-blue-ink)]" : "font-semibold text-ink-3"} ${className}`} aria-label={s.long}>
      <span aria-hidden="true">{s.text}</span>
    </span>
  );
}

export const winnerOf = (g: GameView): "home" | "away" | null =>
  g.status === "final" && g.home.score !== null && g.away.score !== null && g.home.score !== g.away.score ? (g.home.score > g.away.score ? "home" : "away") : null;

const sideName = (s: GameSide) => s.team?.fullName ?? s.name;

/** A game card: league, status, both teams (away first) and the score; the whole card opens the game page. */
export function GameCard({ g, tz, now, flash, showLeague = true, withDay = false, record }: { g: GameView; tz: string; now: number; flash?: boolean; showLeague?: boolean; withDay?: boolean; record?: (id: string | null) => string | null }) {
  const win = winnerOf(g);
  const scored = g.status === "live" || g.status === "final";
  return (
    <li>
      <Link
        href={`/sports/game/${g.id}`}
        data-game-id={g.id}
        aria-label={`${sideName(g.away)} at ${sideName(g.home)}`}
        className={`block min-h-[96px] rounded-[14px] p-3 ring-1 transition-colors hover:bg-white/[0.04] ${g.status === "live" ? "ring-live/50" : "ring-[var(--hairline)]"} ${flash ? "score-flash" : ""}`}
      >
        <p className="mb-1.5 flex items-center justify-between gap-2">
          {showLeague ? <span className="text-[11.5px] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{LEAGUE_NAME[g.league]}</span> : <span />}
          <StatusPill g={g} tz={tz} now={now} withDay={withDay} />
        </p>
        {(["away", "home"] as const).map((k) => {
          const s = g[k];
          const lost = win !== null && win !== k;
          const rec = record?.(s.id);
          return (
            <div key={k} className="flex min-h-8 items-center gap-2.5">
              <SideMark side={s} />
              <span className={`min-w-0 flex-1 truncate text-[15px] ${win === k ? "font-bold text-ink-1" : lost ? "text-ink-3" : "font-semibold text-ink-1"}`}>
                {sideName(s)}
                {rec && <span className="ml-1.5 text-[12px] font-normal text-ink-3">{rec}</span>}
              </span>
              {scored && <span className={`num min-w-8 text-right text-[18px] ${win === k ? "font-extrabold" : lost ? "text-ink-3" : "font-bold"}`}>{s.score ?? "–"}</span>}
            </div>
          );
        })}
        {g.status === "scheduled" && g.venue && <p className="mt-0.5 truncate text-[12px] text-ink-3">{g.venue}</p>}
      </Link>
    </li>
  );
}
