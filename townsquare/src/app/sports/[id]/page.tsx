import Link from "next/link";
import { notFound } from "next/navigation";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { getTeam, storiesForTeam } from "@/lib/sports/teams";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { badgeColors } from "@/lib/sports/badge";
import { warmLogos } from "@/lib/sports/logo-provider";
import { teamSchedule, teamStanding, PROVIDER } from "@/lib/sports/games";
import { viewerTz } from "@/lib/sports/viewer-tz";
import { tzAbbr } from "@/lib/sports/time";
import { StoryRow } from "@/components/front/StoryCard";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { GameRow } from "@/components/sports/Games";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = getTeam((await params).id);
  return { title: t ? `${t.fullName}: schedule, scores and news` : "Team" };
}

/** Team page: the team in its colors, its record, upcoming games, results and every story that mentions it. */
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const team = getTeam((await params).id);
  if (!team) notFound();
  warmLogos([team]);
  const viewer = await getViewer();
  const tz = await viewerTz();
  const now = Date.now();
  const ink = badgeColors(team.primary, team.secondary).text;
  const { next, last } = teamSchedule(team.id, now);
  const standing = teamStanding(team.id);
  const keys = new Set(storiesForTeam(team.id));
  const stories = keys.size ? listStories(200, { viewerId: viewer?.id ?? null }).filter((s) => keys.has(s.key)) : [];
  return (
    <div className="mx-auto max-w-[760px] lg:border-x lg:border-[var(--hairline)]">
      <header className="relative overflow-hidden px-4 py-6 sm:px-6" style={{ background: `linear-gradient(120deg, ${team.primary} 0%, ${team.primary} 55%, #070b14 130%)` }}>
        <div aria-hidden="true" className="absolute -right-10 -bottom-16 h-56 w-56 rounded-full opacity-40 blur-2xl" style={{ background: team.secondary }} />
        <div className="relative flex items-center gap-4">
          <span className="rounded-[16px] bg-[rgb(7_11_20/0.35)] p-2 ring-1 ring-white/20"><TeamLogo team={team} size="lg" /></span>
          <div style={{ color: ink }} className="min-w-0">
            <p className="text-[12px] font-extrabold tracking-[0.14em] uppercase">{LEAGUE_NAME[team.league]} · {team.abbr}</p>
            <h1 className="text-[clamp(1.6rem,1.2rem+2vw,2.4rem)] leading-tight font-extrabold">{team.fullName}</h1>
            {standing && (
              <p className="num mt-0.5 text-[14px] font-semibold">
                {standing.wins}-{standing.losses}{standing.draws ? `-${standing.draws}` : ""}{standing.points !== null ? ` · ${standing.points} pts` : ""} · #{standing.rank} in the {LEAGUE_NAME[team.league]}
              </p>
            )}
          </div>
        </div>
      </header>

      <section aria-labelledby="sched">
        <h2 id="sched" className="tl-row px-4 pt-4 pb-2 text-[17px] font-bold">Schedule</h2>
        {next.length ? <ul>{next.map((g) => <GameRow key={g.id} g={g} tz={tz} now={now} showLeague={false} withDay />)}</ul> : <p className="tl-row px-4 pb-4 text-[14px] text-ink-3">No upcoming games loaded. It may be the off-season.</p>}
      </section>

      {last.length > 0 && (
        <section aria-labelledby="results">
          <h2 id="results" className="tl-row px-4 pt-4 pb-2 text-[17px] font-bold">Results</h2>
          <ul>{last.map((g) => <GameRow key={g.id} g={g} tz={tz} now={now} showLeague={false} withDay />)}</ul>
        </section>
      )}

      <section aria-labelledby="ts">
        <h2 id="ts" className="tl-row px-4 pt-4 pb-2 text-[17px] font-bold">Stories</h2>
        {stories.length ? (
          stories.map((s) => <div key={s.key} role="article" aria-label={s.title} className="tl-row"><StoryRow s={s} /></div>)
        ) : (
          <EmptyState art="news" title={`No ${team.name} stories yet`} body="When a story mentions this team, it shows up here automatically." action={{ label: "Sports news", href: "/topics/sports" }} />
        )}
      </section>

      <p className="px-4 py-5 text-[12.5px] text-ink-3">
        <Link href={`/sports?view=standings&league=${team.league}`} className="tap hover:text-ink-1 hover:underline">{LEAGUE_NAME[team.league]} standings</Link> ·{" "}
        <Link href={`/sports?view=teams&league=${team.league}`} className="tap hover:text-ink-1 hover:underline">All {LEAGUE_NAME[team.league]} teams</Link> · Times in {tzAbbr(tz, now)} · Data: {PROVIDER}
        {team.logo ? "" : " · Badge shown in team colors until a licensed logo is added."}
      </p>
    </div>
  );
}
