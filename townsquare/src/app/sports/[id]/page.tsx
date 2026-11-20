import Link from "next/link";
import { notFound } from "next/navigation";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { getTeam, storiesForTeam } from "@/lib/sports/teams";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { badgeColors } from "@/lib/sports/badge";
import { warmLogos } from "@/lib/sports/logo-provider";
import { StoryTile } from "@/components/front/StoryCard";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = getTeam((await params).id);
  return { title: t?.fullName ?? "Team" };
}

/** Team page: the team in its colors, plus every story that mentions it. */
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const team = getTeam((await params).id);
  if (!team) notFound();
  warmLogos([team]);
  const viewer = await getViewer();
  const ink = badgeColors(team.primary, team.secondary).text;
  const keys = new Set(storiesForTeam(team.id));
  const stories = keys.size ? listStories(200, { viewerId: viewer?.id ?? null }).filter((s) => keys.has(s.key)) : [];
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-5 lg:px-8">
      <header className="relative overflow-hidden rounded-[var(--r-xl)] p-6 ring-1 ring-[var(--wn-glass-border)] sm:p-8" style={{ background: `linear-gradient(120deg, ${team.primary} 0%, ${team.primary} 55%, #070b14 130%)` }}>
        <div aria-hidden="true" className="absolute -right-10 -bottom-16 h-64 w-64 rounded-full opacity-40 blur-2xl" style={{ background: team.secondary }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="rounded-[18px] bg-[rgb(7_11_20/0.35)] p-2 ring-1 ring-white/20"><TeamLogo team={team} size="lg" /></span>
          <div style={{ color: ink }}>
            <p className="text-[12px] font-extrabold tracking-[0.14em] uppercase">{LEAGUE_NAME[team.league]} · {team.abbr}</p>
            <h1 className="font-display text-[clamp(2.2rem,1.4rem+3vw,3.6rem)] leading-none font-extrabold uppercase">{team.fullName}</h1>
            <p className="mt-1 text-[14px]">{team.city}</p>
          </div>
        </div>
      </header>
      <section aria-labelledby="ts" className="mt-6">
        <h2 id="ts" className="mb-3 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">Stories</h2>
        {stories.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stories.map((s) => <StoryTile key={s.key} s={s} />)}</div>
        ) : (
          <EmptyState art="news" title={`No ${team.name} stories yet`} body="When a story mentions this team, it shows up here automatically." action={{ label: "All teams", href: "/sports" }} />
        )}
      </section>
      <p className="mt-6 text-[12px] text-ink-3"><Link href="/sports" className="hover:text-[var(--wn-cyan-ink)]">← All teams</Link>{team.logo ? "" : " · Badge shown in team colors until a licensed logo is added."}</p>
    </div>
  );
}
