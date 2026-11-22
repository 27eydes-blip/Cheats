"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GameView } from "@/lib/sports/games";
import type { KeyStat } from "@/lib/sports/hub";
import { fmtDay, fmtTime, tzAbbr } from "@/lib/sports/time";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { useBoard } from "./LiveBoard";
import { SideMark, StatusPill, winnerOf } from "./GameCard";

const ROUND: Partial<Record<GameView["league"], string>> = { NFL: "Week", NCAAF: "Week", EPL: "Matchday", MLS: "Matchday" };
const name = (s: GameView["home"]) => s.team?.fullName ?? s.name;

/** The game's header; while the game is live its score and clock refresh with the live board. */
export function LiveGameHeader({ initial, records }: { initial: GameView; records: Record<string, string> }) {
  const { board, tz, now, flashing } = useBoard();
  const g = [...board.live, ...board.today, ...board.recent, ...board.upcoming].find((x) => x.id === initial.id) ?? initial;
  const scored = g.status === "live" || g.status === "final";
  const win = winnerOf(g);
  const side = (k: "home" | "away") => {
    const s = g[k];
    const inner = (
      <>
        <SideMark side={s} size="lg" />
        <span className={`mt-2 block text-[15px] leading-tight ${win && win !== k ? "text-ink-3" : "font-bold"}`}>{name(s)}</span>
        {s.id && records[s.id] && <span className="num block text-[13px] text-ink-3">{records[s.id]}</span>}
        <span className="block text-[11.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">{k}</span>
      </>
    );
    return s.id ? <Link href={`/sports/${s.id}`} className="flex min-w-0 flex-1 flex-col items-center text-center hover:underline">{inner}</Link> : <div className="flex min-w-0 flex-1 flex-col items-center text-center">{inner}</div>;
  };
  return (
    <header className={`border-b border-[var(--hairline)] px-4 pt-3 pb-5 ${flashing.has(g.id) ? "score-flash" : ""}`} style={{ background: "linear-gradient(180deg, rgb(47 107 255 / 0.12), transparent)" }}>
      <p className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <Link href={`/sports?league=${g.league}`} className="tap font-extrabold tracking-[0.08em] text-ink-3 uppercase hover:text-ink-1">{LEAGUE_NAME[g.league]}{g.round && ROUND[g.league] ? ` · ${ROUND[g.league]} ${g.round}` : ""}</Link>
        <StatusPill g={g} tz={tz} now={now} />
      </p>
      <h1 className="sr-only">{name(g.away)} at {name(g.home)}</h1>
      <div className="mt-4 flex items-start gap-3" aria-live={g.status === "live" ? "polite" : undefined}>
        {side("away")}
        <div className="flex min-w-[96px] flex-col items-center pt-3 text-center">
          {scored ? (
            <span className="num text-[40px] leading-none font-extrabold" aria-label={`${name(g.away)} ${g.away.score ?? 0}, ${name(g.home)} ${g.home.score ?? 0}`}>
              {g.away.score ?? "–"}<span className="px-2 text-ink-3">–</span>{g.home.score ?? "–"}
            </span>
          ) : (
            <>
              <span className="text-[13px] font-bold text-ink-2">{fmtDay(g.startsAt, tz, now)}</span>
              <span className="text-[22px] leading-tight font-extrabold">{g.timeKnown ? fmtTime(g.startsAt, tz) : "TBA"}</span>
              <span className="text-[12px] text-ink-3">{tzAbbr(tz, g.startsAt)}</span>
            </>
          )}
        </div>
        {side("home")}
      </div>
      {g.venue && <p className="mt-4 text-center text-[13.5px] text-ink-2">{g.venue}</p>}
    </header>
  );
}

/**
 * Key stats, when the data source provides them for this game. Shows a
 * skeleton while loading and nothing at all if there are none.
 */
export function KeyStats({ gameId, homeName, awayName, enabled, fetchImpl }: { gameId: string; homeName: string; awayName: string; enabled: boolean; fetchImpl?: typeof fetch }) {
  const [stats, setStats] = useState<KeyStat[] | null>(enabled ? null : []);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (fetchImpl ?? fetch)(`/api/sports/games/${encodeURIComponent(gameId)}/stats`)
      .then((r) => (r.ok ? r.json() : { stats: [] }))
      .then((d: { stats?: KeyStat[] }) => alive && setStats(Array.isArray(d.stats) ? d.stats : []))
      .catch(() => alive && setStats([]));
    return () => void (alive = false);
  }, [gameId, enabled, fetchImpl]);
  if (stats && !stats.length) return null;
  return (
    <section aria-labelledby="keystats" className="border-b border-[var(--hairline)] px-4 py-4" aria-busy={stats === null}>
      <h2 id="keystats" className="mb-2 text-[17px] font-bold">Key stats</h2>
      {stats === null ? (
        <div className="space-y-2" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-6 rounded-[6px]" />)}</div>
      ) : (
        <table className="w-full text-[14px]">
          <caption className="sr-only">Key stats</caption>
          <thead>
            <tr className="text-[12px] text-ink-3"><th scope="col" className="py-1 text-left font-semibold">{awayName}</th><th scope="col" className="py-1 font-semibold"><span className="sr-only">Stat</span></th><th scope="col" className="py-1 text-right font-semibold">{homeName}</th></tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.label} className="border-t border-[var(--hairline)]">
                <td className="num py-1.5 font-bold">{s.away || "–"}</td>
                <th scope="row" className="py-1.5 text-center text-[13px] font-normal text-ink-2">{s.label}</th>
                <td className="num py-1.5 text-right font-bold">{s.home || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
