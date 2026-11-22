import Link from "next/link";
import { notFound } from "next/navigation";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { getGame, headToHead, teamSchedule, teamStanding, PROVIDER, type GameView } from "@/lib/sports/games";
import { storiesForTeam } from "@/lib/sports/teams";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { fmtDay, fmtTime, tzAbbr } from "@/lib/sports/time";
import { viewerTz } from "@/lib/sports/viewer-tz";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { GameRow, GameStatusLabel } from "@/components/sports/Games";
import { StoryRow } from "@/components/front/StoryCard";

export const dynamic = "force-dynamic";

const ROUND: Partial<Record<GameView["league"], string>> = { NFL: "Week", NCAAF: "Week", EPL: "Matchday", MLS: "Matchday" };
const name = (s: GameView["home"]) => s.team?.fullName ?? s.name;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const g = getGame((await params).id);
  return { title: g ? `${name(g.away)} at ${name(g.home)}` : "Game" };
}

function Record({ teamId }: { teamId: string | null }) {
  if (!teamId) return null;
  const s = teamStanding(teamId);
  if (!s) return null;
  return <span className="num block text-[13px] text-ink-3">{s.wins}-{s.losses}{s.draws ? `-${s.draws}` : ""} · #{s.rank}</span>;
}

function Side({ g, side }: { g: GameView; side: "home" | "away" }) {
  const s = g[side];
  const inner = (
    <>
      {s.team ? <TeamLogo team={s.team} size="lg" label={false} /> : <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-[12px] bg-white/[0.08] text-[26px] font-bold">{s.name[0]}</span>}
      <span className="mt-2 block text-[15px] leading-tight font-bold">{name(s)}</span>
      <Record teamId={s.id} />
      <span className="block text-[11.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">{side}</span>
    </>
  );
  return s.id ? <Link href={`/sports/${s.id}`} className="flex flex-1 flex-col items-center text-center hover:underline">{inner}</Link> : <div className="flex flex-1 flex-col items-center text-center">{inner}</div>;
}

/** One game: the matchup and score, when and where, recent form, past meetings and related stories. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const g = getGame((await params).id);
  if (!g) notFound();
  const tz = await viewerTz();
  const now = Date.now();
  const viewer = await getViewer();
  const scored = g.status === "live" || g.status === "final";
  const h2h = headToHead(g);
  const form = (["away", "home"] as const).map((side) => ({ side, s: g[side], last: g[side].id ? teamSchedule(g[side].id!, now).last.slice(0, 5) : [] }));
  const keys = new Set([...(g.home.id ? storiesForTeam(g.home.id) : []), ...(g.away.id ? storiesForTeam(g.away.id) : [])]);
  const stories = keys.size ? listStories(200, { viewerId: viewer?.id ?? null }).filter((s) => keys.has(s.key)).slice(0, 5) : [];
  const result = (x: GameView, teamId: string) => {
    const mine = x.home.id === teamId ? x.home.score : x.away.score;
    const theirs = x.home.id === teamId ? x.away.score : x.home.score;
    if (mine === null || theirs === null) return "–";
    return mine > theirs ? "W" : mine < theirs ? "L" : "D";
  };
  return (
    <div className="mx-auto max-w-[760px] lg:border-x lg:border-[var(--hairline)]">
      <header className="tl-row px-4 pt-3 pb-5">
        <p className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <Link href={`/sports?league=${g.league}`} className="tap font-extrabold tracking-[0.08em] text-ink-3 uppercase hover:text-ink-1">{LEAGUE_NAME[g.league]}{g.round && ROUND[g.league] ? ` · ${ROUND[g.league]} ${g.round}` : ""}</Link>
          <GameStatusLabel g={g} tz={tz} now={now} />
        </p>
        <h1 className="sr-only">{name(g.away)} at {name(g.home)}</h1>
        <div className="mt-4 flex items-start gap-3">
          <Side g={g} side="away" />
          <div className="flex min-w-[96px] flex-col items-center pt-3 text-center">
            {scored ? (
              <span className="num text-[38px] leading-none font-extrabold">{g.away.score ?? "–"}<span className="px-2 text-ink-3">–</span>{g.home.score ?? "–"}</span>
            ) : (
              <>
                <span className="text-[13px] font-bold text-ink-2">{fmtDay(g.startsAt, tz, now)}</span>
                <span className="text-[22px] leading-tight font-extrabold">{g.timeKnown ? fmtTime(g.startsAt, tz) : "TBA"}</span>
                <span className="text-[12px] text-ink-3">{tzAbbr(tz, g.startsAt)}</span>
              </>
            )}
          </div>
          <Side g={g} side="home" />
        </div>
        {g.venue && <p className="mt-4 text-center text-[13.5px] text-ink-2">{g.venue}</p>}
      </header>

      <section aria-labelledby="form" className="tl-row px-4 py-4">
        <h2 id="form" className="mb-2 text-[17px] font-bold">Recent form</h2>
        <ul className="space-y-2">
          {form.map(({ side, s, last }) => (
            <li key={side} className="flex items-center gap-3 text-[14px]">
              <span className="w-28 truncate font-semibold">{s.team?.name ?? s.name}</span>
              {last.length ? (
                <span className="flex gap-1" aria-label={`Last ${last.length}: ${last.map((x) => result(x, s.id!)).join(", ")}`}>
                  {last.map((x) => {
                    const r = result(x, s.id!);
                    return <Link key={x.id} href={`/sports/game/${x.id}`} className={`flex h-7 w-7 items-center justify-center rounded-[6px] text-[12px] font-bold ${r === "W" ? "bg-[rgb(34_197_94/0.18)] text-[#4ade80]" : r === "L" ? "bg-danger-soft text-disagree" : "bg-white/[0.08] text-ink-2"}`} title={`${fmtDay(x.startsAt, tz, now)}: ${x.away.team?.abbr ?? x.away.name} ${x.away.score}–${x.home.score} ${x.home.team?.abbr ?? x.home.name}`}>{r}</Link>;
                  })}
                </span>
              ) : (
                <span className="text-ink-3">No recent results yet</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {h2h.length > 0 && (
        <section aria-labelledby="h2h">
          <h2 id="h2h" className="tl-row px-4 pt-4 pb-2 text-[17px] font-bold">Last meetings</h2>
          <ul>{h2h.map((x) => <GameRow key={x.id} g={x} tz={tz} now={now} showLeague={false} withDay />)}</ul>
        </section>
      )}

      {stories.length > 0 && (
        <section aria-labelledby="stories">
          <h2 id="stories" className="tl-row px-4 pt-4 pb-2 text-[17px] font-bold">In the news</h2>
          {stories.map((s) => <div key={s.key} role="article" aria-label={s.title} className="tl-row"><StoryRow s={s} /></div>)}
        </section>
      )}

      <p className="px-4 py-5 text-[12.5px] text-ink-3">Data: {PROVIDER}. Scores update every few minutes; check the league for official results.</p>
    </div>
  );
}
