import Link from "next/link";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { getFeedTabs } from "@/lib/feedtabs";
import { listTeams } from "@/lib/sports/teams";
import { LEAGUES, LEAGUE_NAME, type League } from "@/lib/sports/teams-data";
import { warmLogos } from "@/lib/sports/logo-provider";
import { scoreboard, standings, syncState, teamSchedule, PROVIDER, type GameView } from "@/lib/sports/games";
import { fmtDay, tzAbbr, tzOffsetMin } from "@/lib/sports/time";
import { viewerTz } from "@/lib/sports/viewer-tz";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { GameRow, GameStatusLabel, StandingsTable } from "@/components/sports/Games";
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

/** Group games by local day, in order. */
function byDay(games: GameView[], tz: string, now: number) {
  const out: [string, GameView[]][] = [];
  for (const g of games) {
    const d = fmtDay(g.startsAt, tz, now);
    const last = out.at(-1);
    if (last && last[0] === d) last[1].push(g);
    else out.push([d, [g]]);
  }
  return out;
}

function Section({ id, title, children, count }: { id: string; title: string; children: React.ReactNode; count?: number }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="tl-row flex items-baseline gap-2 px-4 pt-4 pb-2 text-[17px] font-bold">
        {title}
        {count ? <span className="text-[13px] font-normal text-ink-3">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export default async function SportsPage({ searchParams }: { searchParams: Promise<{ league?: string; view?: string }> }) {
  const sp = await searchParams;
  const want = sp.league?.toUpperCase();
  const league = (LEAGUES as readonly string[]).includes(want ?? "") ? (want as League) : null;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "scores";
  const viewer = await getViewer();
  const tz = await viewerTz();
  const now = Date.now();
  const sync = syncState();
  const lastSync = Math.max(0, ...Object.values(sync).map((s) => s?.at ?? 0));

  let body: React.ReactNode;
  if (view === "teams") {
    const teams = listTeams(league ?? undefined);
    warmLogos(teams);
    const groups = (league ? [league] : [...LEAGUES]).map((l) => [l, teams.filter((t) => t.league === l)] as const);
    body = (
      <div className="space-y-6 px-4 py-4">
        {groups.map(([l, list]) => (
          <section key={l} aria-labelledby={`lg-${l}`}>
            <h2 id={`lg-${l}`} className="mb-2 flex items-baseline gap-2 text-[17px] font-bold">{LEAGUE_NAME[l]} <span className="text-[13px] font-normal text-ink-3">{list.length}</span></h2>
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
              <span>{LEAGUE_NAME[l]} <span className="text-[13px] font-normal text-ink-3">{rows[0].season}</span></span>
              <span aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-90">›</span>
            </summary>
            <StandingsTable rows={rows} league={l} />
          </details>
        ))}
      </div>
    ) : (
      <EmptyState art="news" title="Standings aren't in yet" body="Tables load from the sports data feed a few times an hour. Check back soon." />
    );
  } else {
    const b = scoreboard({ leagues: league ? [league] : undefined, tzOffsetMin: tzOffsetMin(tz, now), t: now });
    const teamTabs = viewer && !league ? getFeedTabs(viewer.id).filter((t) => t.kind === "team" && t.team) : [];
    const mine = teamTabs
      .map((t) => ({ tab: t, next: teamSchedule(t.key, now).next[0] ?? null }))
      .filter((x) => x.next)
      .sort((a, b2) => a.next!.startsAt - b2.next!.startsAt);
    const empty = !b.live.length && !b.today.length && !b.upcoming.length && !b.recent.length;
    body = empty ? (
      <EmptyState
        art="news"
        title={league ? `No ${LEAGUE_NAME[league]} games this week` : "No games loaded yet"}
        body={lastSync ? "Nothing scheduled in the next seven days or played in the last three. It may be the off-season." : "Schedules and scores load from the sports data feed a few minutes after the site starts."}
        action={{ label: "Sports news", href: "/topics/sports" }}
      />
    ) : (
      <div>
        {mine.length > 0 && (
          <Section id="mine" title="Your teams">
            <ul className="scrollbar-none tl-row flex gap-2 overflow-x-auto px-4 pb-3" data-no-swipe>
              {mine.map(({ tab, next }) => (
                <li key={tab.key} className="shrink-0">
                  <Link href={`/sports/game/${next!.id}`} className="flex w-[220px] items-center gap-2.5 rounded-[12px] px-3 py-2 ring-1 ring-[var(--hairline)] hover:bg-white/[0.04]">
                    {tab.kind === "team" && tab.team && <TeamLogo team={tab.team} size="md" label={false} />}
                    <span className="min-w-0 text-[13px]">
                      <span className="block truncate font-bold text-ink-1">{next!.home.id === tab.key ? `vs ${next!.away.team?.name ?? next!.away.name}` : `at ${next!.home.team?.name ?? next!.home.name}`}</span>
                      <span className="block truncate"><GameStatusLabel g={next!} tz={tz} now={now} /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {b.live.length > 0 && (
          <Section id="live" title="Live now" count={b.live.length}>
            <ul>{b.live.map((g) => <GameRow key={g.id} g={g} tz={tz} now={now} showLeague={!league} />)}</ul>
          </Section>
        )}
        {b.today.length > 0 && (
          <Section id="today" title="Today" count={b.today.length}>
            <ul>{b.today.map((g) => <GameRow key={g.id} g={g} tz={tz} now={now} showLeague={!league} />)}</ul>
          </Section>
        )}
        {b.upcoming.length > 0 && (
          <Section id="upcoming" title="Upcoming">
            {byDay(b.upcoming, tz, now).map(([day, games]) => (
              <div key={day}>
                <h3 className="tl-row px-4 pt-3 pb-1 text-[12.5px] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{day}</h3>
                <ul>{games.map((g) => <GameRow key={g.id} g={g} tz={tz} now={now} showLeague={!league} />)}</ul>
              </div>
            ))}
          </Section>
        )}
        {b.recent.length > 0 && (
          <Section id="results" title="Results">
            {byDay(b.recent, tz, now).map(([day, games]) => (
              <div key={day}>
                <h3 className="tl-row px-4 pt-3 pb-1 text-[12.5px] font-extrabold tracking-[0.08em] text-ink-3 uppercase">{day}</h3>
                <ul>{games.map((g) => <GameRow key={g.id} g={g} tz={tz} now={now} showLeague={!league} />)}</ul>
              </div>
            ))}
          </Section>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] lg:border-x lg:border-[var(--hairline)]">
      <header className="tl-row flex items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-[20px] font-bold">Sports</h1>
        <Link href="/topics/sports" className="tap text-[14px] text-[var(--wn-blue-ink)] hover:underline">Sports news</Link>
      </header>
      <nav aria-label="Sports sections" className="tl-row flex">
        {VIEWS.map((v) => (
          <Link key={v} href={href(v, league)} aria-current={v === view ? "page" : undefined} className={`relative flex h-11 flex-1 items-center justify-center text-[15px] capitalize ${v === view ? "font-bold text-ink-1" : "font-medium text-ink-3 hover:text-ink-1"}`}>
            {v}
            {v === view && <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full bg-[var(--wn-blue)]" />}
          </Link>
        ))}
      </nav>
      <nav aria-label="Leagues" data-no-swipe className="scrollbar-none tl-row flex gap-1.5 overflow-x-auto px-4 py-2.5">
        {[null, ...LEAGUES].map((l) => (
          <Link key={l ?? "all"} href={href(view, l)} aria-current={league === l ? "page" : undefined} className={`tap inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${league === l ? "bg-[var(--wn-blue-fill)] text-white" : "text-ink-2 ring-1 ring-[var(--hairline)] hover:text-ink-1"}`}>
            {l ? LEAGUE_NAME[l] : "All"}
          </Link>
        ))}
      </nav>
      {body}
      <p className="px-4 py-5 text-[12.5px] text-ink-3">
        Schedules, scores and standings: {PROVIDER}. Times in {tzAbbr(tz, now)}.{lastSync ? ` Updated ${new Date(lastSync).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}.` : ""}
      </p>
    </div>
  );
}
