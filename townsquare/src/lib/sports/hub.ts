import { getFeedTabs } from "../feedtabs";
import { tryTake } from "./budget";
import { dataKey, gamesVersion, getGame, getJson, lastChecked, scoreboard, teamStanding, type GameView, type Scoreboard } from "./games";
import { tzOffsetMin } from "./time";
import type { League } from "./teams-data";

/**
 * The sports hub's data in one object, used by the page and by the 30-second
 * live refresh (/api/sports/scores), so both always agree.
 */
export type Board = Scoreboard & {
  /** The live header strip: live games first, then the next ones to start. */
  header: GameView[];
  featured: GameView | null;
  /** Team records ("9-2", "9-1-2") for teams on the board. */
  records: Record<string, string>;
  myTeams: string[];
  at: number;
  /** When the data provider was last checked (live lane or full sync), for "Updated Xs ago". */
  syncedAt: number;
};

/**
 * Many visitors, one database read: scoreboards are cached in memory per
 * league filter and time zone for up to 15 seconds, and dropped as soon as a
 * game changes (gamesVersion). No visitor ever triggers a provider call.
 */
const g = globalThis as unknown as { __boardCache?: Map<string, { v: number; at: number; b: Scoreboard }> };
const boardCache = () => (g.__boardCache ??= new Map());
export const clearBoardCache = () => boardCache().clear();
export function cachedScoreboard(opts: { leagues?: League[]; tzOffsetMin: number; t: number }): Scoreboard {
  const key = `${(opts.leagues ?? []).join(",")}|${opts.tzOffsetMin}`;
  const hit = boardCache().get(key);
  const v = gamesVersion();
  if (hit && hit.v === v && opts.t - hit.at >= 0 && opts.t - hit.at < 15_000) return hit.b;
  const b = scoreboard({ leagues: opts.leagues, tzOffsetMin: opts.tzOffsetMin, t: opts.t, upcomingLimit: 60, recentLimit: 40 });
  if (boardCache().size > 200) boardCache().clear();
  boardCache().set(key, { v, at: opts.t, b });
  return b;
}

const WEIGHT: Record<League, number> = { NFL: 6, NBA: 5, NCAAF: 4.5, MLB: 4, NHL: 4, EPL: 3.5, MLS: 3 };

/**
 * Game of the Day: a live game with one of your teams; else the best live game
 * (big league, close score); else your team's next game today; else the next
 * game to start; else the latest final.
 */
export function pickGameOfDay(b: Pick<Scoreboard, "live" | "today" | "upcoming" | "recent">, myTeams: string[] = [], now = Date.now()): GameView | null {
  const mine = (g: GameView) => myTeams.includes(g.home.id ?? "") || myTeams.includes(g.away.id ?? "");
  const closeness = (g: GameView) => (g.home.score !== null && g.away.score !== null ? Math.abs(g.home.score - g.away.score) : 0);
  const live = [...b.live].sort((x, y) => Number(mine(y)) - Number(mine(x)) || WEIGHT[y.league] - WEIGHT[x.league] || closeness(x) - closeness(y));
  if (live.length) return live[0];
  const soon = [...b.today, ...b.upcoming].filter((g) => g.status === "scheduled" && g.startsAt > now - 3_600_000);
  const myNext = soon.filter(mine).sort((x, y) => x.startsAt - y.startsAt)[0];
  if (myNext && myNext.startsAt - now < 24 * 3_600_000) return myNext;
  const todayNext = soon.filter((g) => b.today.includes(g)).sort((x, y) => WEIGHT[y.league] - WEIGHT[x.league] || x.startsAt - y.startsAt)[0];
  if (todayNext) return todayNext;
  if (soon.length) return [...soon].sort((x, y) => x.startsAt - y.startsAt)[0];
  return b.recent[0] ?? null;
}

const recordOf = (teamId: string | null) => {
  if (!teamId) return null;
  const s = teamStanding(teamId);
  return s ? `${s.wins}-${s.losses}${s.draws ? `-${s.draws}` : ""}` : null;
};

export function buildBoard(opts: { leagues?: League[]; tz: string; viewerId: string | null; now?: number }): Board {
  const now = opts.now ?? Date.now();
  const b = cachedScoreboard({ leagues: opts.leagues, tzOffsetMin: tzOffsetMin(opts.tz, now), t: now });
  const myTeams = opts.viewerId ? getFeedTabs(opts.viewerId).filter((t) => t.kind === "team").map((t) => t.key) : [];
  const header = [...b.live, ...b.today.filter((g) => g.status !== "final"), ...b.upcoming].slice(0, 16);
  const featured = pickGameOfDay(b, myTeams, now);
  const records: Record<string, string> = {};
  for (const g of [...header, ...(featured ? [featured] : [])])
    for (const s of [g.home, g.away]) {
      const r = s.id && !(s.id in records) ? recordOf(s.id) : null;
      if (s.id && r) records[s.id] = r;
    }
  return { ...b, header, featured, records, myTeams, at: now, syncedAt: lastChecked() };
}

// ------------------------------------------------------------------ key stats

export type KeyStat = { label: string; home: string; away: string };
const statsCache = new Map<string, { at: number; stats: KeyStat[] }>();

/** Parse TheSportsDB event statistics ({ eventstats: [{ strStat, intHome, intAway }] }). */
export function parseEventStats(j: unknown): KeyStat[] {
  const rows = (j as { eventstats?: unknown })?.eventstats;
  if (!Array.isArray(rows)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  return rows
    .map((r) => ({ label: str((r as Record<string, unknown>).strStat), home: str((r as Record<string, unknown>).intHome), away: str((r as Record<string, unknown>).intAway) }))
    .filter((r) => r.label && (r.home || r.away))
    .slice(0, 12);
}

/**
 * Key stats for a live or finished game, if the data source provides them
 * (TheSportsDB's event statistics; often a paid-key feature). Cached for
 * 2 minutes; any failure means "no stats", and the page simply skips the strip.
 */
export async function eventStats(id: string, fetchImpl: typeof fetch = fetch, t = Date.now()): Promise<KeyStat[]> {
  const hit = statsCache.get(id);
  if (hit && t - hit.at < 120_000) return hit.stats;
  const g = getGame(id);
  if (!g || (g.status !== "live" && g.status !== "final")) return [];
  let stats: KeyStat[] = [];
  try {
    stats = parseEventStats(await getJson(fetchImpl, `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(dataKey())}/lookupeventstats.php?id=${encodeURIComponent(id)}`, "stats", { wait: false, tryTake: () => tryTake() }));
  } catch {
    stats = [];
  }
  statsCache.set(id, { at: t, stats });
  return stats;
}
export const clearStatsCache = () => statsCache.clear();
