import type { GameView, StandingRow } from "./games";
import type { League } from "./teams-data";
import { fmtDay, fmtTime } from "./time";

/**
 * Client-safe sports helpers (no database): status labels, when to poll,
 * score changes, and standings zones.
 */

export type StatusKind = "live" | "final" | "scheduled" | "postponed" | "canceled";
export type StatusLabel = { kind: StatusKind; text: string; /** screen-reader text */ long: string };

/** "LIVE · Q3 4:12", "Final · OT", "7:30 PM" (or "Tomorrow · 7:30 PM"), "Postponed", "Canceled" in the reader's time zone. */
export function statusLabel(g: Pick<GameView, "status" | "detail" | "startsAt" | "timeKnown">, tz: string, now: number, withDay = true): StatusLabel {
  if (g.status === "live") {
    const text = g.detail && g.detail !== "Awaiting final score" ? `LIVE · ${g.detail}` : g.detail ? g.detail : "LIVE";
    return { kind: "live", text, long: `Live${g.detail ? `, ${g.detail}` : ""}` };
  }
  if (g.status === "final") {
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

/** Refresh every 30 seconds only while something is live or about to start (within 15 minutes, or started without a score yet). */
export const POLL_MS = 30_000;
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
