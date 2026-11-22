import Link from "next/link";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { getFeedTabs } from "@/lib/feedtabs";
import { listStories } from "@/lib/news";
import { trending } from "@/lib/sections";
import { listTeams } from "@/lib/sports/teams";
import { LEAGUES, LEAGUE_NAME, type League } from "@/lib/sports/teams-data";
import { warmLogos } from "@/lib/sports/logo-provider";
import { standings, syncState, teamSchedule, PROVIDER } from "@/lib/sports/games";
import { buildBoard } from "@/lib/sports/hub";
import { standingZones } from "@/lib/sports/status";
import { tzAbbr } from "@/lib/sports/time";
import { viewerTz } from "@/lib/sports/viewer-tz";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { LeagueIcon } from "@/components/sports/LeagueIcon";
import { StandingsTable } from "@/components/sports/Games";
import { LiveBoardProvider } from "@/components/sports/live/LiveBoard";
import { BoardSections, GameOfDay, RefreshNote, ScoreHeader } from "@/components/sports/live/HubParts";
import { StatusPill } from "@/components/sports/live/GameCard";
import { StoryRow } from "@/components/front/StoryCard";
import { TrendingCard } from "@/components/sections/SectionParts";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sports", description: "Live scores, upcoming games, results and standings for the NFL, NBA, MLB, NHL, college football, MLS and the Premier League." };

const VIEWS = ["scores", "standings", "teams"] as const;
type View = (typeof VIEWS)[number];

function href(view: View, league: League | null) {
  const q = new URLSearchParams();
  if (view !== "scores") q.set("view", view);
  if (league) q.set("league", league);
  const s = q.toString();
  return `/sports${s ? `?${s}` : ""}`;
}

export default async function SportsPage({ searchParams }: { searchParams: Promise<{ league?: string; view?: string }> }) {
  const sp = await searchParams;
  const want = sp.league?.toUpperCase();
  const league = (LEAGUES as readonly string[]).includes(want ?? "") ? (want as League) : null;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "scores";
  const viewer = await getViewer();
  const tz = await viewerTz();
  const now = Date.now();
  const board = buildBoard({ leagues: league ? [league] : undefined, tz, viewerId: viewer?.id ?? null, now });
  const sync = syncState();
  const lastSync = Math.max(0, ...Object.values(sync).map((s) => s?.at ?? 0));
  const sportsStories = listStories(30, { section: "Sports", viewerId: viewer?.id ?? null });
  const news = sportsStories.slice(0, 6);
  const hot = trending(sportsStories, 5);

  const side = (idp: string) => (
    <>
      {news.length > 0 && (
        <section aria-labelledby={`${idp}news`} className="overflow-hidden rounded-[16px] bg-white/[0.03] ring-1 ring-[var(--hairline)]">
          <h2 id={`${idp}news`} className="flex items-center justify-between px-4 pt-4 text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">
            Sports news <Link href="/topics/sports" className="tap text-[12.5px] font-semibold tracking-normal normal-case text-[var(--wn-blue-ink)] hover:underline">See all</Link>
          </h2>
          <div className="divide-y divide-[var(--hairline)]">{news.map((s) => <div key={s.key} role="article" aria-label={s.title}><StoryRow s={s} /></div>)}</div>
        </section>
      )}
      <TrendingCard stories={hot} label="sports" idp={idp} />
    </>
  );

  let body: React.ReactNode;
  if (view === "teams") {
    const teams = listTeams(league ?? undefined);
    warmLogos(teams);
    const groups = (league ? [league] : [...LEAGUES]).map((l) => [l, teams.filter((t) => t.league === l)] as const);
    body = (
      <div className="space-y-6 px-4 py-4">
        {groups.map(([l, list]) => (
          <section key={l} aria-labelledby={`lg-${l}`}>
            <h2 id={`lg-${l}`} className="mb-2 flex items-center gap-2 text-[17px] font-bold"><LeagueIcon league={l} /> {LEAGUE_NAME[l]} <span className="text-[13px] font-normal text-ink-3">{list.length}</span></h2>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {list.map((t) => (
                <li key={t.id}>
                  <Link href={`/sports/${t.id}`} className="flex min-h-12 items-center gap-2.5 rounded-[10px] px-2 hover:bg-white/[0.04]">
                    <TeamLogo team={t} size="sm" label={false} />
                    <span className="min-w-0 truncate text-[14px] font-semibold">{t.fullName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  } else if (view === "standings") {
    const leagues = league ? [league] : [...LEAGUES];
    const tables = leagues.map((l) => [l, standings(l)] as const).filter(([, rows]) => rows.length);
    body = tables.length ? (
      <div>
        {tables.map(([l, rows], i) => (
          <details key={l} open={!!league || i === 0} className="group">
            <summary className="tl-row flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2"><LeagueIcon league={l} /> {LEAGUE_NAME[l]} <span className="text-[13px] font-normal text-ink-3">{rows[0].season}</span></span>
              <span aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-90">›</span>
            </summary>
            <StandingsTable rows={rows} league={l} zones={standingZones(l, rows)} />
          </details>
        ))}
      </div>
    ) : (
      <EmptyState art="news" title="Standings aren't in yet" body="Tables load from the sports data feed a few times an hour. Check back soon." />
    );
  } else {
    const mine = viewer ? getFeedTabs(viewer.id).filter((t) => t.kind === "team" && t.team) : [];
    const myRows = mine.map((t) => ({ tab: t, next: teamSchedule(t.key, now).next[0] ?? null }));
    const empty = !board.live.length && !board.today.length && !board.upcoming.length && !board.recent.length;
    body = (
      <>
        <GameOfDay />
        <section aria-labelledby="myteams" className="px-4 pt-5">
          <h2 id="myteams" className="mb-2 flex items-center justify-between text-[17px] font-bold">
            My Teams
            <Link href={href("teams", league)} className="tap text-[13.5px] font-semibold text-[var(--wn-blue-ink)] hover:underline">{myRows.length ? "Add teams" : "Find teams"}</Link>
          </h2>
          {myRows.length ? (
            <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4" data-no-swipe>
              {myRows.map(({ tab, next }) => (
                <li key={tab.key} className="shrink-0">
                  <Link href={next ? `/sports/game/${next.id}` : `/sports/${tab.key}`} className="flex min-h-14 w-[230px] items-center gap-2.5 rounded-[12px] px-3 py-2 ring-1 ring-[var(--hairline)] hover:bg-white/[0.04]">
                    {tab.kind === "team" && tab.team && <TeamLogo team={tab.team} size="md" label={false} />}
                    <span className="min-w-0 text-[13px]">
                      <span className="block truncate font-bold text-ink-1">{tab.kind === "team" ? tab.team.name : tab.label}{next ? ` ${next.home.id === tab.key ? "vs" : "at"} ${next.home.id === tab.key ? next.away.team?.abbr ?? next.away.name : next.home.team?.abbr ?? next.home.name}` : ""}</span>
                      <span className="block truncate">{next ? <StatusPill g={next} tz={tz} now={now} /> : <span className="text-ink-3">No game scheduled</span>}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[12px] px-3 py-3 text-[14px] text-ink-2 ring-1 ring-[var(--hairline)]">
              {viewer ? "Follow teams to see their next games here. Open any team and tap Add to My Teams." : <><Link href="/login?next=/sports" className="font-semibold text-[var(--wn-blue-ink)] underline">Log in</Link> to follow your teams.</>}
            </p>
          )}
        </section>
        <RefreshNote />
        {empty ? (
          <div className="px-4 pt-4">
            <EmptyState
              art="news"
              title={league ? `No ${LEAGUE_NAME[league]} games this week` : "No games loaded yet"}
              body={lastSync ? "Nothing scheduled in the next seven days or played in the last three. It may be the off-season." : "Schedules and scores load from the sports data feed a few minutes after the site starts."}
              action={{ label: "Sports news", href: "/topics/sports" }}
            />
          </div>
        ) : (
          <BoardSections showLeague={!league} />
        )}
      </>
    );
  }

  return (
    <LiveBoardProvider initial={board} league={league} tz={tz}>
      <ScoreHeader />
      <div className="mx-auto max-w-[1080px] lg:px-6">
        <div className="grid lg:grid-cols-[minmax(0,680px)_minmax(0,320px)] lg:justify-center lg:gap-7">
          <div className="min-w-0 pb-8 lg:min-h-screen lg:border-x lg:border-[var(--hairline)]">
            <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-1">
              <h1 className="font-display text-[clamp(2rem,1.6rem+2vw,2.8rem)] leading-none font-extrabold uppercase">Sports</h1>
              <Link href="/topics/sports" className="tap text-[14px] text-[var(--wn-blue-ink)] hover:underline">Sports news</Link>
            </header>
            <nav aria-label="Sports sections" className="flex border-b border-[var(--hairline)]">
              {VIEWS.map((v) => (
                <Link key={v} href={href(v, league)} aria-current={v === view ? "page" : undefined} className={`relative flex h-11 flex-1 items-center justify-center text-[15px] capitalize ${v === view ? "font-bold text-ink-1" : "font-medium text-ink-3 hover:text-ink-1"}`}>
                  {v}
                  {v === view && <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full bg-[var(--wn-blue)]" />}
                </Link>
              ))}
            </nav>
            <nav aria-label="Leagues" data-no-swipe className="scrollbar-none flex gap-1.5 overflow-x-auto border-b border-[var(--hairline)] px-4 py-2.5">
              {[null, ...LEAGUES].map((l) => (
                <Link key={l ?? "all"} href={href(view, l)} aria-current={league === l ? "page" : undefined} className={`tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${league === l ? "bg-[var(--wn-blue-fill)] text-white" : "text-ink-2 ring-1 ring-[var(--hairline)] hover:text-ink-1"}`}>
                  <LeagueIcon league={l ?? "ALL"} />
                  {l ? LEAGUE_NAME[l] : "All"}
                </Link>
              ))}
            </nav>
            {body}
            <div className="space-y-3 px-4 pt-6 lg:hidden">{side("m-")}</div>
            <p className="px-4 pt-5 text-[12.5px] text-ink-3">
              Schedules, scores and standings: {PROVIDER}. Times in {tzAbbr(tz, now)}.{lastSync ? ` Updated ${new Date(lastSync).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}.` : ""}
            </p>
          </div>
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-[calc(var(--sub-top)+16px)] space-y-3 pt-4">{side("d-")}</div>
          </aside>
        </div>
      </div>
    </LiveBoardProvider>
  );
}
