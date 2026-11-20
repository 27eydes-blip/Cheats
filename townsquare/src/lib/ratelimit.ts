import { RATE_LIMITS } from "@/config";
import { AppError } from "./errors";
import { all, get, run, now } from "./db";

type Rule = readonly (readonly [number, number])[];

/**
 * Sliding-window limiter stored in the database so it survives restarts.
 * Throws AppError when any window is full; otherwise records the event.
 */
export function rateLimit(kind: keyof typeof RATE_LIMITS, subject: string) {
  const rules: Rule = RATE_LIMITS[kind];
  const key = `${kind}:${subject}`;
  const t = now();
  for (const [max, windowMs] of rules) {
    const row = get<{ n: number }>("SELECT count(*) AS n FROM rate_events WHERE key = ? AND at > ?", [key, t - windowMs]);
    if ((row?.n ?? 0) >= max) {
      const mins = Math.ceil(windowMs / 60_000);
      throw new AppError(`You're doing that too often. Try again in a few minutes (limit: ${max} per ${mins} min).`, "rate_limited");
    }
  }
  run("INSERT INTO rate_events (key, at) VALUES (?, ?)", [key, t]);
  // Occasionally prune events older than the longest window (1 day is plenty).
  if (Math.random() < 0.02) run("DELETE FROM rate_events WHERE at < ?", [t - 24 * 60 * 60_000]);
}

/** For tests/admin: how many events a key has recorded. */
export function rateEvents(kind: string, subject: string) {
  return all("SELECT at FROM rate_events WHERE key = ?", [`${kind}:${subject}`]).length;
}
