import Link from "next/link";
import { notFound } from "next/navigation";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { getGame, headToHead, teamSchedule, teamStanding, PROVIDER, type GameView } from "@/lib/sports/games";
import { buildBoard } from "@/lib/sports/hub";
import { storiesForTeam } from "@/lib/sports/teams";
import { fmtDay } from "@/lib/sports/time";
import { resultFor } from "@/lib/sports/status";
import { viewerTz } from "@/lib/sports/viewer-tz";
import { StoryRow } from "@/components/front/StoryCard";
import { LiveBoardProvider } from "@/components/sports/live/LiveBoard";
import { GameCard } from "@/components/sports/live/GameCard";
import { KeyStats, LiveGameHeader } from "@/components/sports/live/GameParts";

export const dynamic = "force-dynamic";

const name = (s: GameView["home"]) => s.team?.fullName ?? s.name;
const short = (s: GameView["home"]) => s.team?.name ?? s.name;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const g = getGame((await params).id);
  return { title: g ? `${name(g.away)} at ${name(g.home)}` : "Game" };
}


/** One game: live header, key stats (when available), form, head-to-head and related stories. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const g = getGame((await params).id);
  if (!g) notFound();
  const tz = await viewerTz();
  const now = Date.now();
  const viewer = await getViewer();
  const board = buildBoard({ leagues: [g.league], tz, viewerId: viewer?.id ?? null, now });
  const records: Record<string, string> = {};
  for (const s of [g.home, g.away]) {
    const st = s.id ? teamStanding(s.id) : null;
    if (s.id && st) records[s.id] = `${st.wins}-${st.losses}${st.draws ? `-${st.draws}` : ""} · #${st.rank}`;
  }
  const h2h = headToHead(g);
  const h2hWins = g.home.id && g.away.id ? { home: h2h.filter((x) => resultFor(x, g.home.id!) === "W").length, away: h2h.filter((x) => resultFor(x, g.away.id!) === "W").length } : null;
  const form = (["away", "home"] as const).map((side) => ({ side, s: g[side], last: g[side].id ? teamSchedule(g[side].id!, now).last.filter((x) => x.id !== g.id).slice(0, 5) : [] }));
  const keys = new Set([...(g.home.id ? storiesForTeam(g.home.id) : []), ...(g.away.id ? storiesForTeam(g.away.id) : [])]);
  const stories = keys.size ? listStories(200, { viewerId: viewer?.id ?? null }).filter((s) => keys.has(s.key)).slice(0, 5) : [];
  return (
    <LiveBoardProvider initial={board} league={g.league} tz={tz}>
      <div className="mx-auto max-w-[760px] lg:border-x lg:border-[var(--hairline)]">
        <LiveGameHeader initial={g} records={records} />
        <KeyStats gameId={g.id} homeName={short(g.home)} awayName={short(g.away)} enabled={g.status === "live" || g.status === "final"} />

        <section aria-labelledby="form" className="border-b border-[var(--hairline)] px-4 py-4">
          <h2 id="form" className="mb-2 text-[17px] font-bold">Last five games</h2>
          <ul className="space-y-2.5">
            {form.map(({ side, s, last }) => (
              <li key={side} className="flex items-center gap-3 text-[14px]">
                <span className="w-28 shrink-0 truncate font-semibold">{short(s)}</span>
                {last.length ? (
                  <span className="flex gap-1.5" aria-label={`${short(s)}, last ${last.length}: ${last.map((x) => resultFor(x, s.id!)).join(", ")}`}>
                    {last.map((x) => {
                      const r = resultFor(x, s.id!);
                      return (
                        <Link
                          key={x.id}
                          href={`/sports/game/${x.id}`}
                          aria-hidden="true"
                          tabIndex={-1}
                          className={`flex h-8 w-8 items-center justify-center rounded-[8px] text-[12.5px] font-extrabold ${r === "W" ? "bg-[var(--wn-blue-fill)] text-white" : r === "L" ? "text-ink-2 ring-1 ring-[var(--hairline)]" : "bg-white/[0.08] text-ink-2"}`}
                          title={`${fmtDay(x.startsAt, tz, now)}: ${x.away.team?.abbr ?? x.away.name} ${x.away.score}–${x.home.score} ${x.home.team?.abbr ?? x.home.name}`}
                        >
                          {r}
                        </Link>
                      );
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
          <section aria-labelledby="h2h" className="border-b border-[var(--hairline)] px-4 py-4">
            <h2 id="h2h" className="text-[17px] font-bold">Head to head</h2>
            {h2hWins && (
              <p className="mt-1 text-[14px] text-ink-2">
                Last {h2h.length} meeting{h2h.length === 1 ? "" : "s"}: {short(g.home)} {h2hWins.home}, {short(g.away)} {h2hWins.away}
                {h2h.length - h2hWins.home - h2hWins.away > 0 ? `, ${h2h.length - h2hWins.home - h2hWins.away} drawn` : ""}.
              </p>
            )}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{h2h.map((x) => <GameCard key={x.id} g={x} tz={tz} now={now} showLeague={false} withDay />)}</ul>
          </section>
        )}

        {stories.length > 0 && (
          <section aria-labelledby="stories">
            <h2 id="stories" className="tl-row px-4 pt-4 pb-2 text-[17px] font-bold">In the news</h2>
            {stories.map((s) => <div key={s.key} role="article" aria-label={s.title} className="tl-row"><StoryRow s={s} /></div>)}
          </section>
        )}

        <p className="px-4 py-5 text-[12.5px] text-ink-3">Data: {PROVIDER}. Live scores refresh every 30 seconds; check the league for official results.</p>
      </div>
    </LiveBoardProvider>
  );
}
