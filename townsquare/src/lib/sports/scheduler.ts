import { syncAllSports } from "./games";
import { LANE_TICK_MS, runLiveLane } from "./livelane";
import { refreshAllLogos } from "./logo-provider";
import { listTeams } from "./teams";

const g = globalThis as unknown as { __sportsTimer?: ReturnType<typeof setInterval>; __laneTimer?: ReturnType<typeof setInterval>; __sportsLast?: number; __logosLast?: number };

const every = () => Math.max(5, Number(process.env.SPORTS_SYNC_INTERVAL_MIN) || 15) * 60_000;

/**
 * Keeps schedules, scores and standings fresh inside the web process (like the
 * news ingest): a full sync every SPORTS_SYNC_INTERVAL_MIN minutes (default 15)
 * for schedules and standings, and the live lane (livelane.ts) every
 * SPORTS_LIVE_INTERVAL_SEC seconds (default 30) for games in progress.
 * SPORTS_SYNC=off disables it.
 */
export function startSportsScheduler() {
  if (g.__sportsTimer || process.env.SPORTS_SYNC === "off" || process.env.VITEST) return;
  const full = () => {
    g.__sportsLast = Date.now();
    return syncAllSports({ pauseMs: 2_500 })
      .then((r) => {
        if (r.skipped) return;
        const bad = r.results.filter((x) => x.error);
        console.log(`[sports] synced ${r.results.reduce((n, x) => n + x.games, 0)} games${bad.length ? `; problems: ${bad.map((x) => `${x.league} (${x.error})`).join(", ")}` : ""}`);
      })
      .catch((e) => console.error("[sports] sync failed", e instanceof Error ? e.message : e));
  };
  // Team logos: fetch any missing ones (after the first sync, then daily). Cached on the volume.
  const logos = () => {
    g.__logosLast = Date.now();
    refreshAllLogos(listTeams(), { pauseMs: 400 })
      .then((t) => (t.ok || t.error || t.missing ? console.log("[sports] team logos:", JSON.stringify(t)) : undefined))
      .catch((e) => console.error("[sports] logo refresh failed", e instanceof Error ? e.message : e));
  };
  const tick = () => {
    if (Date.now() - (g.__logosLast ?? 0) >= 24 * 3_600_000) logos();
    if (Date.now() - (g.__sportsLast ?? 0) >= every()) return void full();
  };
  const lane = () =>
    runLiveLane()
      .then((r) => (r.finals || r.error ? console.log(`[sports] live lane: ${r.requests} requests, ${r.updated} updated, ${r.finals} finals${r.error ? `; ${r.error}` : ""}`) : undefined))
      .catch((e) => console.error("[sports] live lane failed", e instanceof Error ? e.message : e));
  setTimeout(full, 30_000).unref?.();
  setTimeout(logos, 60_000).unref?.();
  g.__sportsTimer = setInterval(tick, 60_000);
  g.__sportsTimer.unref?.();
  g.__laneTimer = setInterval(lane, LANE_TICK_MS());
  g.__laneTimer.unref?.();
}
