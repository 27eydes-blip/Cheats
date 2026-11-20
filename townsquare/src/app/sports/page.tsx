import Link from "next/link";
import { listTeams } from "@/lib/sports/teams";
import { LEAGUES, LEAGUE_NAME, type League } from "@/lib/sports/teams-data";
import { warmLogos } from "@/lib/sports/logo-provider";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams", description: "Every NFL, NBA, MLB, NHL, MLS, Premier League and major college football team." };

/** Teams directory: every league, every team, with its badge or licensed logo. */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const want = (await searchParams).league?.toUpperCase();
  const league = (LEAGUES as readonly string[]).includes(want ?? "") ? (want as League) : null;
  const teams = listTeams(league ?? undefined);
  warmLogos(teams);
  const groups = (league ? [league] : [...LEAGUES]).map((l) => [l, teams.filter((t) => t.league === l)] as const);
  return (
    <Frame width="wide">
      <PageTitle folio={<Kicker tone="gold">Sports</Kicker>} title="Teams" dek="Every team we cover. Tap one for its stories." />
      <nav aria-label="Leagues" className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pt-4 sm:px-6">
        {[null, ...LEAGUES].map((l) => (
          <Link key={l ?? "all"} href={l ? `/sports?league=${l}` : "/sports"} aria-current={league === l ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center rounded-[10px] px-3.5 text-[12.5px] font-bold tracking-[0.05em] uppercase ${league === l ? "bg-[var(--wn-blue-fill)] text-white" : "text-ink-2 ring-1 ring-rule hover:text-[var(--wn-cyan-ink)]"}`}>
            {l ? LEAGUE_NAME[l] : "All"}
          </Link>
        ))}
      </nav>
      <div className="space-y-8 px-4 py-6 sm:px-6">
        {groups.map(([l, list]) => (
          <section key={l} aria-labelledby={`lg-${l}`}>
            <h2 id={`lg-${l}`} className="mb-3 flex items-center gap-2 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">
              <span aria-hidden="true" className="h-5 w-1 rounded-full bg-[var(--wn-blue)]" /> {LEAGUE_NAME[l]} <span className="mono text-[12px] font-normal text-ink-3">{list.length}</span>
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((t) => (
                <li key={t.id}>
                  <Link href={`/sports/${t.id}`} className="card card-hover flex min-h-14 items-center gap-2.5 p-2.5">
                    <TeamLogo team={t} size="md" label={false} />
                    <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{t.fullName}</span><span className="mono block text-[11px] text-ink-3">{t.abbr}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Frame>
  );
}
