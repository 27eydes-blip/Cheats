import { anyLive, anySoon, syncAllSports, syncLive } from "./games";

const g = globalThis as unknown as { __sportsTimer?: ReturnType<typeof setInterval>; __sportsLast?: number };

const every = () => Math.max(5, Number(process.env.SPORTS_SYNC_INTERVAL_MIN) || 15) * 60_000;

/**
 * Keeps schedules, scores and standings fresh inside the web process (like the
 * news ingest): a full sync every SPORTS_SYNC_INTERVAL_MIN minutes (default 15),
 * and, with a paid key, live scores every 2 minutes while games are on.
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
  const tick = () => {
    if (Date.now() - (g.__sportsLast ?? 0) >= every()) return void full();
    if (anyLive() || anySoon()) syncLive().catch(() => {});
  };
  setTimeout(full, 30_000).unref?.();
  g.__sportsTimer = setInterval(tick, 2 * 60_000);
  g.__sportsTimer.unref?.();
}
