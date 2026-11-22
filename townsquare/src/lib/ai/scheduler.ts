import { runAiHour } from "./newsroom";
import { anthropicWriter, hasApiKey, type AiWriter } from "./writer";

const g = globalThis as unknown as { __aiTimer?: ReturnType<typeof setInterval>; __aiWriter?: AiWriter };

const writerOrNull = () => (hasApiKey() ? (g.__aiWriter ??= anthropicWriter()) : null);

/**
 * The hourly AI newsroom, inside the web server process (like the news ingest).
 * It wakes every 5 minutes and runs each account at most once per clock hour;
 * the hour is claimed in the database, so restarts and redeploys never repeat it.
 * Nothing runs while the Control Room kill switch is off, ANTHROPIC_API_KEY is
 * missing, or a spending cap is reached. AI_NEWSROOM=off disables the timer.
 */
export function startAiScheduler() {
  if (g.__aiTimer || process.env.AI_NEWSROOM === "off" || process.env.VITEST) return;
  const tick = () => {
    runAiHour({ writer: writerOrNull() })
      .then((r) => {
        if (!r.skipped && r.accounts.length) console.log(`[ai] ${r.slot}: ${r.posted} posted, ${r.queued} queued, ${r.blocked} blocked, $${r.spentUsd.toFixed(3)}`);
      })
      .catch((e) => console.error("[ai] run failed", e instanceof Error ? e.message : e));
  };
  setTimeout(tick, 90_000).unref?.();
  g.__aiTimer = setInterval(tick, 5 * 60_000);
  g.__aiTimer.unref?.();
}

/** Run now from the Control Room (same guards; hours already run are skipped). */
export function runAiNow() {
  return runAiHour({ writer: writerOrNull() });
}
