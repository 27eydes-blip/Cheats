import { all, now, run, tx } from "../db";
import { tryTake } from "./budget";
import { BudgetSpent, PROVIDER_LEAGUE, SPORT_OF, V1_BASE, V2_BASE, dataKey, getJson, isPremium, markChecked, parseEvent, upsertGame } from "./games";
import { expectedEndAt, AWAIT_CAP_MS } from "./status";
import type { League } from "./teams-data";

/**
 * The live lane: a fast refresh (every 30 seconds by default) of only the
 * games that need it, alongside the 15-minute sync that keeps schedules and
 * standings.
 *
 * Candidates are games the provider calls live, and scheduled games that
 * should have started, from the last 12 hours. Each has its own cadence:
 *   - past its expected end, final not yet in: every 30 s (the finals people wait for);
 *   - live: every 30 s with a paid key (one live-score call per sport covers
 *     them all), every 60 s on the free key (one lookup per game);
 *   - should have started but no word yet: every 60 s;
 *   - "Final (unconfirmed)" (20+ minutes overdue): every 5 minutes.
 *
 * With a paid key, one live-score request per sport refreshes every live game
 * of that sport. Games missing from the live feed (it drops games once they
 * end) get a single-game lookup, which is how finals arrive within a minute.
 * Every request goes through the shared budget; when it runs out the lane
 * stops and picks up on the next tick. Errors back the lane off (30 s, 60 s,
 * 2 min, up to 5 min) until a request works again.
 */

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Candidate = { id: string; league: League; status: "live" | "scheduled"; starts_at: number; checked_at: number };

export const LANE_TICK_MS = () => Math.max(15, Math.min(120, Number(process.env.SPORTS_LIVE_INTERVAL_SEC) || 30)) * 1000;
/** At most this many single-game lookups per tick, so one busy evening can't eat the budget. */
export const MAX_LOOKUPS = 8;

/** How often a candidate should be checked, given where it stands. */
export function cadenceMs(c: Pick<Candidate, "league" | "status" | "starts_at">, t: number, premium = isPremium()): number {
  const end = expectedEndAt(c.league, c.starts_at);
  if (c.status === "scheduled") return 60_000;
  if (t >= end + AWAIT_CAP_MS) return 5 * 60_000;
  if (t >= end) return 30_000;
  return premium ? 30_000 : 60_000;
}

/** Games the lane watches: live, or scheduled to have started, within the last 12 hours. */
export function laneCandidates(t = now()): Candidate[] {
  return all<Candidate>(
    "SELECT id, league, status, starts_at, checked_at FROM games WHERE status IN ('live','scheduled') AND starts_at <= ? AND starts_at > ? ORDER BY starts_at",
    [t + 60_000, t - 12 * 3_600_000],
  );
}

/** The candidates due now, most urgent first: overdue finals, then live games, then games that should have started. */
export function dueGames(cands: Candidate[], t: number, premium = isPremium()): Candidate[] {
  const rank = (c: Candidate) => {
    const end = expectedEndAt(c.league, c.starts_at);
    if (c.status === "live" && t >= end && t < end + AWAIT_CAP_MS) return 0;
    if (c.status === "live" && t < end) return 1;
    if (c.status === "scheduled") return 2;
    return 3;
  };
  return cands.filter((c) => t - c.checked_at >= cadenceMs(c, t, premium) - 1_000).sort((a, b) => rank(a) - rank(b) || a.checked_at - b.checked_at);
}

type LaneState = { failures: number; backoffUntil: number; lastRun: number; lastResult: LaneResult | null; running: boolean };
const g = globalThis as unknown as { __lane?: LaneState };
const st = () => (g.__lane ??= { failures: 0, backoffUntil: 0, lastRun: 0, lastResult: null, running: false });
export const resetLane = () => void (g.__lane = undefined);
export const laneState = () => ({ ...st() });

/** Back-off after `failures` failed ticks in a row: 30 s, 60 s, 2 min, 4 min, then 5 min. */
export const backoffMs = (failures: number) => (failures <= 0 ? 0 : Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1)));

export type LaneResult = { at: number; candidates: number; due: number; requests: number; updated: number; finals: number; skipped: "idle" | "backoff" | "budget" | null; error: string | null };

/** One tick of the live lane. Safe to call often: it does nothing unless games are due. */
export async function runLiveLane(opts: { fetchImpl?: Fetch; t?: number; take?: () => boolean } = {}): Promise<LaneResult> {
  const t = opts.t ?? now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const take = opts.take ?? (() => tryTake());
  const s = st();
  const res: LaneResult = { at: t, candidates: 0, due: 0, requests: 0, updated: 0, finals: 0, skipped: null, error: null };
  const done = (r: LaneResult) => ((s.lastResult = r), r);
  if (s.running) return { ...res, skipped: "idle" };
  if (t < s.backoffUntil) return done({ ...res, skipped: "backoff" });
  const cands = laneCandidates(t);
  res.candidates = cands.length;
  const premium = isPremium();
  const due = dueGames(cands, t, premium);
  res.due = due.length;
  if (!due.length) return done({ ...res, skipped: "idle" });

  s.running = true;
  s.lastRun = t;
  let failed = 0;
  let spent = false;
  const seen = new Set<string>();
  const apply = (e: Record<string, unknown>, league: League, fromLive: boolean) => {
    const p = parseEvent(e, league, t);
    if (!p) return;
    if (fromLive && p.status === "scheduled") p.status = "live";
    const r = upsertGame(p, { checked: true });
    seen.add(p.id);
    if (r !== "same") res.updated++;
    if (p.status === "final") res.finals++;
  };
  const byLeagueId = new Map(Object.entries(PROVIDER_LEAGUE).map(([l, id]) => [id, l as League]));
  try {
    // 1. Paid key: one live-score request per sport with a live or overdue game.
    if (premium) {
      const sports = [...new Set(due.filter((c) => c.status === "live").map((c) => SPORT_OF[c.league]))];
      for (const sport of sports) {
        try {
          const j = await getJson(fetchImpl, `${V2_BASE}/livescore/${sport}`, "live", { headers: { "X-API-KEY": dataKey() }, wait: false, tryTake: take });
          res.requests++;
          const list = Array.isArray(j.livescore) ? (j.livescore as Record<string, unknown>[]) : [];
          tx(() => {
            for (const e of list) {
              const league = byLeagueId.get(String(e.idLeague ?? ""));
              if (league) apply(e, league, true);
            }
          });
        } catch (e) {
          if (e instanceof BudgetSpent) {
            spent = true;
            break;
          }
          failed++;
          res.error = e instanceof Error ? e.message : String(e);
        }
      }
    }
    // 2. Single-game lookups for what the live feed didn't cover (finished games drop off it), most urgent first.
    const rest = due.filter((c) => !seen.has(c.id)).slice(0, MAX_LOOKUPS);
    for (const c of rest) {
      if (spent) break;
      try {
        const j = await getJson(fetchImpl, `${V1_BASE()}/lookupevent.php?id=${encodeURIComponent(c.id)}`, "lookup", { wait: false, tryTake: take });
        res.requests++;
        const e = Array.isArray(j.events) ? (j.events as Record<string, unknown>[])[0] : null;
        if (e) apply(e, c.league, false);
        // Checked even when the provider had nothing new, so it waits its cadence.
        run("UPDATE games SET checked_at = ? WHERE id = ?", [t, c.id]);
      } catch (e) {
        if (e instanceof BudgetSpent) {
          spent = true;
          break;
        }
        failed++;
        res.error = e instanceof Error ? e.message : String(e);
      }
    }
  } finally {
    s.running = false;
  }
  if (spent && !res.requests) res.skipped = "budget";
  // Back off only when every request this tick failed (`requests` counts the ones that worked).
  if (failed && !res.requests) {
    s.failures++;
    s.backoffUntil = t + backoffMs(s.failures);
  } else if (res.requests) {
    s.failures = 0;
    s.backoffUntil = 0;
  }
  if (res.requests) markChecked(t);
  return done(res);
}
