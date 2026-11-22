import Link from "next/link";
import type { GameView, StandingRow } from "@/lib/sports/games";
import { DRAW_LEAGUES } from "@/lib/sports/games";
import { LEAGUE_NAME, type League } from "@/lib/sports/teams-data";
import { fmtDay, fmtTime } from "@/lib/sports/time";
import { TeamLogo } from "./TeamLogo";

type Side = GameView["home"];

function SideLogo({ side, league, size = "sm" }: { side: Side; league: League; size?: "sm" | "md" }) {
  if (side.team) return <TeamLogo team={side.team} size={size} label={false} />;
  const px = size === "md" ? 34 : 22;
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[6px] bg-white/[0.08] font-bold text-ink-2 ring-1 ring-[var(--hairline)]" style={{ width: px, height: px, fontSize: px * 0.42 }} data-league={league}>
      {side.name.replace(/^(The|FC|AFC) /, "")[0]}
    </span>
  );
}

const winner = (g: GameView, side: "home" | "away") =>
  g.status === "final" && g.home.score !== null && g.away.score !== null && (side === "home" ? g.home.score > g.away.score : g.away.score > g.home.score);

/** Status text: LIVE detail, Final, Postponed, or the local start time. */
export function GameStatusLabel({ g, tz, now, withDay = true }: { g: GameView; tz: string; now: number; withDay?: boolean }) {
  if (g.status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-live">
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
        LIVE{g.detail ? ` · ${g.detail}` : ""}
      </span>
    );
  if (g.status === "final") return <span className="font-semibold text-ink-2">Final{g.detail ? ` · ${g.detail}` : ""}{withDay ? ` · ${fmtDay(g.startsAt, tz, now)}` : ""}</span>;
  if (g.status === "postponed") return <span className="font-semibold text-warning">Postponed</span>;
  if (g.status === "canceled") return <span className="font-semibold text-ink-3">Canceled</span>;
  return (
    <span className="text-ink-2">
      {withDay ? `${fmtDay(g.startsAt, tz, now)} · ` : ""}
      {g.timeKnown ? fmtTime(g.startsAt, tz) : "Time TBA"}
    </span>
  );
}

function TeamLine({ g, side }: { g: GameView; side: "home" | "away" }) {
  const s = g[side];
  const won = winner(g, side);
  const lost = g.status === "final" && !won && g.home.score !== g.away.score;
  const showScore = g.status === "live" || g.status === "final";
  return (
    <div className="flex min-h-8 items-center gap-2.5">
      <SideLogo side={s} league={g.league} />
      <span className={`min-w-0 flex-1 truncate text-[15px] ${won ? "font-bold text-ink-1" : lost ? "text-ink-3" : "font-semibold text-ink-1"}`}>{s.team?.fullName ?? s.name}</span>
      {showScore && <span className={`num w-8 text-right text-[17px] ${won ? "font-extrabold text-ink-1" : lost ? "text-ink-3" : "font-bold text-ink-1"}`}>{s.score ?? "–"}</span>}
    </div>
  );
}

/** One game as a timeline row: league and status on top, away then home (US style), links to the game page. */
export function GameRow({ g, tz, now, showLeague = true, withDay = false }: { g: GameView; tz: string; now: number; showLeague?: boolean; withDay?: boolean }) {
  return (
    <li>
      <Link href={`/sports/game/${g.id}`} className={`tl-row block px-4 py-3 transition-colors hover:bg-white/[0.03] ${g.status === "live" ? "shadow-[inset_3px_0_0_var(--live)]" : ""}`} aria-label={`${g.away.team?.fullName ?? g.away.name} at ${g.home.team?.fullName ?? g.home.name}`}>
        <p className="mb-1 flex items-center gap-2 text-[12.5px]">
          {showLeague && <span className="font-extrabold tracking-[0.08em] text-ink-3 uppercase">{LEAGUE_NAME[g.league]}</span>}
          <GameStatusLabel g={g} tz={tz} now={now} withDay={withDay} />
        </p>
        <TeamLine g={g} side="away" />
        <TeamLine g={g} side="home" />
        {g.venue && g.status === "scheduled" && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{g.venue}</p>}
      </Link>
    </li>
  );
}

/** A compact horizontal strip of games (live first), for the Sports topic page and team pages. */
export function ScoreStrip({ games, tz, now, label = "Scores" }: { games: GameView[]; tz: string; now: number; label?: string }) {
  if (!games.length) return null;
  return (
    <section aria-label={label} className="tl-row">
      <ul data-no-swipe className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
        {games.map((g) => (
          <li key={g.id} className="shrink-0">
            <Link href={`/sports/game/${g.id}`} className={`block w-[172px] rounded-[12px] px-3 py-2 ring-1 hover:bg-white/[0.04] ${g.status === "live" ? "ring-live/50" : "ring-[var(--hairline)]"}`}>
              <p className="mb-1 truncate text-[11.5px]"><span className="font-extrabold tracking-[0.06em] text-ink-3 uppercase">{g.league}</span> · <GameStatusLabel g={g} tz={tz} now={now} /></p>
              {(["away", "home"] as const).map((side) => (
                <div key={side} className="flex items-center gap-1.5">
                  <SideLogo side={g[side]} league={g.league} />
                  <span className={`min-w-0 flex-1 truncate text-[13.5px] ${winner(g, side) ? "font-bold" : "font-semibold"}`}>{g[side].team?.abbr ?? g[side].name}</span>
                  {(g.status === "live" || g.status === "final") && <span className="num text-[14px] font-bold">{g[side].score ?? "–"}</span>}
                </div>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** League table. Soccer leagues show draws, goal difference and points; others wins, losses and win share. */
export function StandingsTable({ rows, league }: { rows: StandingRow[]; league: League }) {
  const soccer = DRAW_LEAGUES.includes(league);
  const hasPoints = rows.some((r) => r.points !== null);
  const pct = (r: StandingRow) => {
    const n = r.wins + r.losses + r.draws;
    return n ? (r.wins / n).toFixed(3).replace(/^0/, "") : "–";
  };
  return (
    <div className="overflow-x-auto" data-no-swipe>
      <table className="w-full min-w-[340px] text-[14px]">
        <caption className="sr-only">{LEAGUE_NAME[league]} standings{rows[0]?.season ? `, ${rows[0].season} season` : ""}</caption>
        <thead>
          <tr className="border-b border-[var(--hairline)] text-left text-[11.5px] font-bold tracking-[0.06em] text-ink-3 uppercase">
            <th scope="col" className="w-9 py-2 pl-4 font-bold">#</th>
            <th scope="col" className="py-2 font-bold">Team</th>
            <th scope="col" className="num w-10 py-2 text-right font-bold"><abbr title="Played" className="no-underline">GP</abbr></th>
            <th scope="col" className="num w-10 py-2 text-right font-bold"><abbr title="Wins" className="no-underline">W</abbr></th>
            {soccer && <th scope="col" className="num w-10 py-2 text-right font-bold"><abbr title="Draws" className="no-underline">D</abbr></th>}
            <th scope="col" className="num w-10 py-2 text-right font-bold"><abbr title="Losses" className="no-underline">L</abbr></th>
            {soccer ? (
              <th scope="col" className="num w-12 py-2 text-right font-bold"><abbr title="Goal difference" className="no-underline">GD</abbr></th>
            ) : (
              <th scope="col" className="num w-14 py-2 text-right font-bold"><abbr title="Win percentage" className="no-underline">PCT</abbr></th>
            )}
            {hasPoints && <th scope="col" className="num w-12 py-2 pr-4 text-right font-bold"><abbr title="Points" className="no-underline">PTS</abbr></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamName} className="border-b border-[var(--hairline)]">
              <td className="num py-2 pl-4 text-ink-3">{r.rank}</td>
              <th scope="row" className="py-2 text-left font-semibold">
                {r.teamId ? (
                  <Link href={`/sports/${r.teamId}`} className="flex min-h-8 items-center gap-2 hover:underline">
                    {r.team && <TeamLogo team={r.team} size="sm" label={false} />}
                    <span className="truncate">{r.team?.fullName ?? r.teamName}</span>
                  </Link>
                ) : (
                  <span className="flex min-h-8 items-center">{r.teamName}</span>
                )}
                {r.note && <span className="block text-[11.5px] font-normal text-ink-3">{r.note}</span>}
              </th>
              <td className="num py-2 text-right text-ink-2">{r.played}</td>
              <td className="num py-2 text-right">{r.wins}</td>
              {soccer && <td className="num py-2 text-right text-ink-2">{r.draws}</td>}
              <td className="num py-2 text-right text-ink-2">{r.losses}</td>
              <td className="num py-2 text-right text-ink-2">{soccer ? (r.goalDiff !== null && r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff ?? "–") : pct(r)}</td>
              {hasPoints && <td className="num py-2 pr-4 text-right font-bold">{r.points ?? "–"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
