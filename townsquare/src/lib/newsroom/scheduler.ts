import { FEED_INTERVAL, runIngest } from "./ingest";

const g = globalThis as unknown as { __newsTimer?: ReturnType<typeof setInterval> };

/**
 * Runs the news ingest every NEWS_INGEST_INTERVAL_MIN minutes (default 10)
 * inside the web server process. On Railway the app is one long-running
 * service with the database on a volume, so an in-process timer is the
 * simplest scheduler that works there; a lock in the database stops overlap.
 * Set NEWS_INGEST=off to disable it (for example if you run
 * `npm run news:ingest` from a separate Railway cron service instead).
 */
export function startNewsScheduler() {
  if (g.__newsTimer || process.env.NEWS_INGEST === "off" || process.env.VITEST) return;
  const tick = () =>
    runIngest({ trigger: "schedule" })
      .then((r) => {
        if (!r.skipped && (r.newItems || r.errors.length)) console.log(`[news] ${r.newItems} new items, ${r.storiesNew} new stories, ${r.errors.length} feed errors`);
      })
      .catch((e) => console.error("[news] ingest failed", e));
  setTimeout(tick, 15_000).unref?.();
  g.__newsTimer = setInterval(tick, FEED_INTERVAL());
  g.__newsTimer.unref?.();
}
