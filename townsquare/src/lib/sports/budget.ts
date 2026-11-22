/**
 * One request budget for everything that calls TheSportsDB (schedules,
 * standings, live scores, single-game lookups, key stats), plus a usage log
 * for Control Room → Sports data.
 *
 * TheSportsDB allows 30 requests a minute on the free key and 100 on paid
 * keys. We stay under that with SPORTS_CALLS_PER_MIN (default 25 free / 90
 * paid). A 429 pauses every call for a minute.
 */
export type CallKind = "schedule" | "standings" | "live" | "lookup" | "stats" | "logos";

const premium = () => !!process.env.SPORTS_DATA_KEY?.trim() && process.env.SPORTS_DATA_KEY.trim() !== "123";
export const callsPerMin = () => {
  const n = Number(process.env.SPORTS_CALLS_PER_MIN);
  return Math.max(1, Math.min(300, Number.isFinite(n) && n > 0 ? n : premium() ? 90 : 25));
};

type State = { tokens: number; last: number; pausedUntil: number; minutes: Map<number, Partial<Record<CallKind | "error" | "limited", number>>>; day: string; dayTotal: number; total: number; lastError: string | null; lastErrorAt: number };
const g = globalThis as unknown as { __sportsBudget?: State };
const fresh = (): State => ({ tokens: -1, last: 0, pausedUntil: 0, minutes: new Map(), day: "", dayTotal: 0, total: 0, lastError: null, lastErrorAt: 0 });
const st = () => (g.__sportsBudget ??= fresh());
export const resetSportsBudget = () => void (g.__sportsBudget = fresh());

function refill(t: number) {
  const s = st();
  const cap = callsPerMin();
  if (s.tokens < 0) (s.tokens = cap), (s.last = t);
  s.tokens = Math.min(cap, s.tokens + ((t - s.last) / 60_000) * cap);
  s.last = t;
  return s;
}

/** Take one request from the budget now, or return false (callers that can skip, like the live lane). */
export function tryTake(t = Date.now()): boolean {
  const s = refill(t);
  if (t < s.pausedUntil || s.tokens < 1) return false;
  s.tokens -= 1;
  return true;
}

/** Wait (up to `maxWaitMs`) for a request from the budget (the 15-minute sync can wait). */
export async function take(maxWaitMs = 30_000): Promise<boolean> {
  const until = Date.now() + maxWaitMs;
  for (;;) {
    if (tryTake()) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, Math.min(2_000, Math.max(250, until - Date.now()))));
  }
}

export const tokensLeft = (t = Date.now()) => Math.floor(refill(t).tokens);
export const pausedFor = (t = Date.now()) => Math.max(0, st().pausedUntil - t);

/** Record one request (and whether it failed) for the usage panel. */
export function record(kind: CallKind, outcome: "ok" | "error" | "limited", t = Date.now(), message?: string) {
  const s = st();
  const m = Math.floor(t / 60_000);
  const b = s.minutes.get(m) ?? {};
  b[kind] = (b[kind] ?? 0) + 1;
  if (outcome !== "ok") b[outcome] = (b[outcome] ?? 0) + 1;
  s.minutes.set(m, b);
  for (const k of s.minutes.keys()) if (k < m - 60) s.minutes.delete(k);
  const day = new Date(t).toISOString().slice(0, 10);
  if (s.day !== day) (s.day = day), (s.dayTotal = 0);
  s.dayTotal++;
  s.total++;
  if (outcome === "limited") s.pausedUntil = t + 60_000;
  if (outcome !== "ok") (s.lastError = message ?? outcome), (s.lastErrorAt = t);
}

export type Usage = { perMin: number; lastMinute: number; lastHour: number; today: number; sinceStart: number; byKind: Partial<Record<CallKind, number>>; errorsLastHour: number; limitedLastHour: number; pausedForMs: number; lastError: string | null; lastErrorAt: number };
export function usage(t = Date.now()): Usage {
  const s = st();
  const m = Math.floor(t / 60_000);
  const byKind: Partial<Record<CallKind, number>> = {};
  let lastHour = 0, lastMinute = 0, errorsLastHour = 0, limitedLastHour = 0;
  for (const [k, b] of s.minutes) {
    if (k < m - 59) continue;
    for (const kind of ["schedule", "standings", "live", "lookup", "stats", "logos"] as CallKind[]) {
      const n = b[kind] ?? 0;
      byKind[kind] = (byKind[kind] ?? 0) + n;
      lastHour += n;
      if (k === m) lastMinute += n;
    }
    errorsLastHour += b.error ?? 0;
    limitedLastHour += b.limited ?? 0;
  }
  return { perMin: callsPerMin(), lastMinute, lastHour, today: s.dayTotal, sinceStart: s.total, byKind, errorsLastHour, limitedLastHour, pausedForMs: pausedFor(t), lastError: s.lastError, lastErrorAt: s.lastErrorAt };
}
