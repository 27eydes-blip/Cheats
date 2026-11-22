import { gameCounts, isPremium, lastChecked, syncState, PROVIDER } from "@/lib/sports/games";
import { usage } from "@/lib/sports/budget";
import { LANE_TICK_MS, laneCandidates, laneState } from "@/lib/sports/livelane";
import { LEAGUES, LEAGUE_NAME } from "@/lib/sports/teams-data";
import { SportsSyncButton } from "./SportsSync";

/** Each league's last sync, games stored and any error, with a Sync now button. */
export function SportsDataStatus() {
  const sync = syncState();
  const games = gameCounts();
  const u = usage();
  const lane = laneState();
  const watching = laneCandidates().length;
  const checked = lastChecked();
  const time = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
  const cells: [string, string][] = [
    ["Last minute", `${u.lastMinute} / ${u.perMin}`],
    ["Last hour", String(u.lastHour)],
    ["Today (UTC)", String(u.today)],
    ["Errors, last hour", `${u.errorsLastHour}${u.limitedLastHour ? ` (${u.limitedLastHour} rate-limited)` : ""}`],
  ];
  return (
    <>
      <p className="text-[13.5px] text-ink-3">
        Schedules and standings from {PROVIDER} every 15 minutes. A live lane checks games in progress every {LANE_TICK_MS() / 1000} seconds{isPremium() ? " (live scores with your paid key, plus single-game lookups for finals)." : " (single-game lookups on the free key, a limited number of games per league). Add SPORTS_DATA_KEY in Railway for the full feed and live scores."}
      </p>
      <section aria-labelledby="usage" className="mt-4 rounded-[12px] ring-1 ring-line">
        <h3 id="usage" className="px-3 pt-3 text-[14px] font-bold">Requests to {PROVIDER}</h3>
        <dl className="grid grid-cols-2 gap-px p-3 sm:grid-cols-4">
          {cells.map(([k, v]) => (
            <div key={k}><dt className="text-[12px] text-ink-3">{k}</dt><dd className="num text-[17px] font-bold">{v}</dd></div>
          ))}
        </dl>
        <p className="border-t border-line px-3 py-2 text-[12.5px] text-ink-3">
          Limit {u.perMin} a minute (SPORTS_CALLS_PER_MIN). Last hour by kind: {Object.entries(u.byKind).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}.
          {u.pausedForMs > 0 && <span className="text-warning"> Paused {Math.ceil(u.pausedForMs / 1000)}s after a rate limit.</span>}
          {u.lastError && <> Last error: {u.lastError} ({time(u.lastErrorAt)}).</>}
        </p>
        <p className="border-t border-line px-3 py-2 text-[12.5px] text-ink-3">
          Live lane: watching {watching} game{watching === 1 ? "" : "s"}
          {lane.lastResult ? ` · last run ${time(lane.lastResult.at)}: ${lane.lastResult.requests} requests, ${lane.lastResult.updated} updated, ${lane.lastResult.finals} finals${lane.lastResult.skipped ? ` (${lane.lastResult.skipped})` : ""}` : " · no run yet"}
          {lane.backoffUntil > Date.now() && <span className="text-warning"> · backing off until {time(lane.backoffUntil)}</span>}
          {checked ? ` · data last checked ${time(checked)}` : ""}. Counts reset when the server restarts.
        </p>
      </section>
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
