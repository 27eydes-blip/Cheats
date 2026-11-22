import { gameCounts, isPremium, syncState, PROVIDER } from "@/lib/sports/games";
import { LEAGUES, LEAGUE_NAME } from "@/lib/sports/teams-data";
import { SportsSyncButton } from "./SportsSync";

/** Each league's last sync, games stored and any error, with a Sync now button. */
export function SportsDataStatus() {
  const sync = syncState();
  const games = gameCounts();
  return (
    <>
      <p className="text-[13.5px] text-ink-3">
        Schedules, scores and standings from {PROVIDER}, every 15 minutes{isPremium() ? ", with live scores every 2 minutes during games (paid key)." : ". Using the free key: a limited number of games per league and no live scores. Add SPORTS_DATA_KEY in Railway for the full feed."}
      </p>
      <ul className="mt-3 divide-y divide-line text-[14px]">
        {LEAGUES.map((l) => {
          const st = sync[l];
          return (
            <li key={l} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
              <span className="font-semibold">{LEAGUE_NAME[l]} <span className="font-normal text-ink-3">{games[l] ?? 0} games stored</span></span>
              <span className={!st ? "text-ink-3" : st.ok && !st.error ? "text-ink-2" : st.ok ? "text-warning" : "text-disagree"}>
                {!st ? "Not synced yet" : `${st.ok ? (st.error ? "Partly OK" : "OK") : "Failed"} · ${st.games} games, ${st.standings} table rows · ${new Date(st.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                {st?.error && <span className="block text-[12.5px] text-ink-3">{st.error}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <SportsSyncButton />
    </>
  );
}
