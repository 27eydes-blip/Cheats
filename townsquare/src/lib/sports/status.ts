import type { GameView, StandingRow } from "./games";
import type { League } from "./teams-data";
import { fmtDay, fmtTime } from "./time";

/**
 * Client-safe sports helpers (no database): status labels, when to poll,
 * score changes, and standings zones.
 */

/** Typical length of a game, start to final whistle, in minutes (used to know when a final is overdue). */
export const DURATION_MIN: Record<League, number> = { NFL: 200, NCAAF: 215, NBA: 150, NHL: 160, MLB: 190, MLS: 115, EPL: 115 };
/** How long a game may sit at "Awaiting final score" before we show "Final (unconfirmed)". */
export const AWAIT_CAP_MS = 20 * 60_000;
export const AWAITING = "Awaiting final score";

export const expectedEndAt = (league: League, startsAt: number) => startsAt + DURATION_MIN[league] * 60_000;

export type Phase = "scheduled" | "live" | "awaiting" | "unconfirmed" | "final" | "postponed" | "canceled";
/**
 * Where a game stands right now. The provider's word wins: a game it calls
 * finished is final. A game it still calls live is "live" until its expected
 * end, then "awaiting" (a final score is overdue) for up to 20 minutes, then
 * "unconfirmed" (shown as a final with the last known score).
 */
export function phaseOf(g: Pick<GameView, "status" | "league" | "startsAt">, now: number): Phase {
  if (g.status !== "live") return g.status;
  const end = expectedEndAt(g.league, g.startsAt);
  if (now < end) return "live";
  return now < end + AWAIT_CAP_MS ? "awaiting" : "unconfirmed";
}

/** The moments a live game changes phase on its own (no new data): its expected end, and 20 minutes later. */
export const phaseChanges = (g: Pick<GameView, "league" | "startsAt">) => {
  const end = expectedEndAt(g.league, g.startsAt);
  return [end, end + AWAIT_CAP_MS];
};

/** Apply the phase to a game for display: awaiting games say so; unconfirmed ones read as finals. */
export function withPhase<T extends Pick<GameView, "status" | "league" | "startsAt" | "detail"> & { unconfirmed?: boolean }>(g: T, now: number): T {
  const ph = phaseOf(g, now);
  if (ph === "awaiting") return { ...g, detail: AWAITING, unconfirmed: false };
  if (ph === "unconfirmed") return { ...g, status: "final", detail: "", unconfirmed: true };
  if (g.detail === AWAITING) return { ...g, detail: "", unconfirmed: false };
  return { ...g, unconfirmed: false };
}

export type StatusKind = "live" | "final" | "scheduled" | "postponed" | "canceled";
export type StatusLabel = { kind: StatusKind; text: string; /** screen-reader text */ long: string };

/** "LIVE · Q3 4:12", "Final · OT", "7:30 PM" (or "Tomorrow · 7:30 PM"), "Postponed", "Canceled" in the reader's time zone. */
export function statusLabel(g: Pick<GameView, "status" | "detail" | "startsAt" | "timeKnown"> & { unconfirmed?: boolean }, tz: string, now: number, withDay = true): StatusLabel {
  if (g.status === "live") {
    if (g.detail === AWAITING) return { kind: "live", text: AWAITING, long: "Game over, awaiting the final score" };
    const text = g.detail ? `LIVE · ${g.detail}` : "LIVE";
    return { kind: "live", text, long: `Live${g.detail ? `, ${g.detail}` : ""}` };
  }
  if (g.status === "final") {
    if (g.unconfirmed) return { kind: "final", text: "Final (unconfirmed)", long: "Final, not yet confirmed by the data provider. Showing the last known score." };
    const text = `Final${g.detail ? ` · ${g.detail}` : ""}`;
    return { kind: "final", text: withDay ? `${text} · ${fmtDay(g.startsAt, tz, now)}` : text, long: `Final${g.detail ? `, ${g.detail}` : ""}` };
  }
  if (g.status === "postponed") return { kind: "postponed", text: "Postponed", long: "Postponed" };
  if (g.status === "canceled") return { kind: "canceled", text: "Canceled", long: "Canceled" };
  const time = g.timeKnown ? fmtTime(g.startsAt, tz) : "Time TBA";
  const day = fmtDay(g.startsAt, tz, now);
  const text = withDay && day !== "Today" ? `${day} · ${time}` : time;
  return { kind: "scheduled", text, long: `Starts ${day === "Today" ? "today" : day} at ${time}` };
}

/** Refresh every 20 seconds only while something is live or about to start (within 15 minutes, or started without a score yet). */
export const POLL_MS = 20_000;
export function shouldPoll(games: Pick<GameView, "status" | "startsAt">[], now: number) {
  return games.some((g) => g.status === "live" || (g.status === "scheduled" && g.startsAt - now < 15 * 60_000 && now - g.startsAt < 4 * 3_600_000));
}

/** Ids of games whose score changed between two snapshots (for the score flash). */
export function changedScores(before: Map<string, Pick<GameView, "home" | "away">>, after: Pick<GameView, "id" | "home" | "away">[]) {
  const out = new Set<string>();
  for (const g of after) {
    const b = before.get(g.id);
    if (b && (b.home.score !== g.home.score || b.away.score !== g.away.score)) out.add(g.id);
  }
  return out;
}

export type Zone = "qualify" | "playin" | "relegation" | null;
/**
 * Standings zones. The provider's own row note wins ("Promotion - Champions
 * League", "Relegation", "Playoffs", "Play-in"). Without notes, only the
 * Premier League gets default lines (top 4, bottom 3), because the other
 * tables mix conferences and a wrong line is worse than none.
 */
export function standingZones(league: League, rows: Pick<StandingRow, "rank" | "note">[]): Zone[] {
  const fromNote = (n: string): Zone => (/relegat/i.test(n) ? "relegation" : /play-?in/i.test(n) ? "playin" : /champions league|promotion|playoff|qualif|europa|conference league|clinched|wild ?card/i.test(n) ? "qualify" : null);
  if (rows.some((r) => r.note && fromNote(r.note))) return rows.map((r) => (r.note ? fromNote(r.note) : null));
  if (league === "EPL" && rows.length >= 10) return rows.map((r) => (r.rank <= 4 ? "qualify" : r.rank > rows.length - 3 ? "relegation" : null));
  return rows.map(() => null);
}

/** W, L or D for one team in a finished game ("–" when there's no score). */
export function resultFor(x: Pick<GameView, "home" | "away">, teamId: string): "W" | "L" | "D" | "–" {
  const mine = x.home.id === teamId ? x.home.score : x.away.score;
  const theirs = x.home.id === teamId ? x.away.score : x.home.score;
  if (mine === null || theirs === null) return "–";
  return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}
