import { all, db, get, now, run, tx } from "../db";
import { normName } from "./names";
import { badgeLetters, circleColors } from "./logos";
import { getSetting, setSetting } from "../newsroom/settings";
import { LEAGUES, type League } from "./teams-data";
import { listTeams, type TeamView } from "./teams";
import { record, take, type CallKind } from "./budget";
import { phaseChanges, withPhase } from "./status";

/**
 * Schedules, scores and standings from TheSportsDB (https://www.thesportsdb.com).
 *
 * Works on the free test key (a few upcoming and recent games per league,
 * partial tables). With a paid key in SPORTS_DATA_KEY it gets full schedules,
 * full tables and live scores. Only facts are stored (teams, times, scores,
 * venues, standings); team artwork still comes from the logo pipeline.
 */

export const PROVIDER = "TheSportsDB";
export const FREE_KEY = "123";
export const dataKey = () => process.env.SPORTS_DATA_KEY?.trim() || FREE_KEY;
export const isPremium = () => dataKey() !== FREE_KEY;
const V1 = () => `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(dataKey())}`;
const V2 = "https://www.thesportsdb.com/api/v2/json";

/** TheSportsDB league ids. */
export const PROVIDER_LEAGUE: Record<League, string> = { NFL: "4391", NBA: "4387", MLB: "4424", NHL: "4380", NCAAF: "4479", MLS: "4346", EPL: "4328" };
const SPORT: Record<League, string> = { NFL: "american_football", NBA: "basketball", MLB: "baseball", NHL: "ice_hockey", NCAAF: "american_football", MLS: "soccer", EPL: "soccer" };
/** Leagues whose standings have draws (soccer). */
export const DRAW_LEAGUES: League[] = ["MLS", "EPL"];

export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "canceled";
export type GameView = {
  id: string;
  league: League;
  season: string;
  round: string | null;
  startsAt: number;
  /** false when the provider gave only a date (time to be announced). */
  timeKnown: boolean;
  status: GameStatus;
  detail: string;
  venue: string;
  home: GameSide;
  away: GameSide;
  /** The provider never confirmed the result; showing the last known score as "Final (unconfirmed)". */
  unconfirmed?: boolean;
};
/** One side of a game. `badge` is the letter circle to show when there's no logo (the team's, or a neutral one for an unmatched name). */
export type GameSide = { id: string | null; name: string; score: number | null; team: TeamView | null; badge: { letters: string; fill: string; text: string } };
export type StandingRow = {
  league: League;
  season: string;
  rank: number;
  teamId: string | null;
  teamName: string;
  team: TeamView | null;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number | null;
  goalDiff: number | null;
  form: string;
  note: string;
};

// ------------------------------------------------------------------ parsing

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const int = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Map the provider's free-text status to ours. */
export function mapStatus(raw: string, startsAt: number, hasScore: boolean, t = now()): GameStatus {
  const s = raw.trim().toLowerCase();
  if (/postpon|^pst$|delayed|suspend/.test(s)) return "postponed";
  if (/cancel|canc|abandon|^aban$/.test(s)) return "canceled";
  if (/finish|^ft$|^aet$|^aot$|^ap$|^pen$|final|ended|game over|full[ -]?time|complete|^ot$ final|after (extra|over)|after pen/.test(s)) return "final";
  if (/not started|^ns$|scheduled|^tbd$|time to be defined/.test(s) || (!s && startsAt > t)) return "scheduled";
  if (/^(1h|2h|ht|et|bt|p|live|in progress|q[1-4]|ot|[1-9](st|nd|rd|th)|top|bot|mid|end|half|period|inning|1p|2p|3p|so)/.test(s) || /progress|live|quarter|period|inning|half/.test(s)) return "live";
  if (!s) return hasScore && startsAt < t ? "final" : "scheduled";
  return hasScore && startsAt < t - 5 * 3_600_000 ? "final" : startsAt > t ? "scheduled" : "live";
}

/** One provider event → a game row (null if it is unusable). */
export function parseEvent(e: Raw, league: League, t = now()) {
  const id = str(e.idEvent);
  const home = str(e.strHomeTeam);
  const away = str(e.strAwayTeam);
  if (!id || !home || !away) return null;
  const stamp = str(e.strTimestamp);
  const date = str(e.dateEvent);
  const time = str(e.strTime);
  let startsAt = NaN;
  let timeKnown = true;
  if (stamp) startsAt = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : `${stamp}Z`);
  if (!Number.isFinite(startsAt) && date) {
    const hasTime = /^\d\d:\d\d/.test(time) && !time.startsWith("00:00:00");
    timeKnown = hasTime;
    startsAt = Date.parse(`${date}T${hasTime ? time.slice(0, 8) : "12:00:00"}Z`);
  }
  if (!Number.isFinite(startsAt)) return null;
  const hs = int(e.intHomeScore);
  const as = int(e.intAwayScore);
  const postponed = /^yes$/i.test(str(e.strPostponed));
  const rawStatus = str(e.strStatus);
  const status = postponed ? "postponed" : mapStatus(rawStatus, startsAt, hs !== null && as !== null, t);
  const progress = str(e.strProgress);
  return {
    id,
    league,
    season: str(e.strSeason),
    round: str(e.intRound) || null,
    startsAt,
    timeKnown,
    status,
    detail: status === "live" ? progress || rawStatus : status === "final" && rawStatus && !/finished|^ft$|final/i.test(rawStatus) ? rawStatus : "",
    venue: str(e.strVenue),
    homeName: home,
    awayName: away,
    homeScore: status === "scheduled" ? null : hs,
    awayScore: status === "scheduled" ? null : as,
  };
}

export function parseTableRow(r: Raw, league: League) {
  const name = str(r.strTeam);
  const rank = int(r.intRank);
  if (!name || rank === null) return null;
  return {
    league,
    season: str(r.strSeason),
    rank,
    teamName: name,
    played: int(r.intPlayed) ?? 0,
    wins: int(r.intWin) ?? 0,
    losses: int(r.intLoss) ?? 0,
    draws: int(r.intDraw) ?? 0,
    points: int(r.intPoints),
    goalDiff: int(r.intGoalDifference),
    form: str(r.strForm).slice(0, 10),
    note: str(r.strDescription).slice(0, 80),
  };
}

// ------------------------------------------------------------------ team matching

const norm = normName;

type Index = { exact: Map<string, string>; city: Map<string, Set<string>>; nick: Map<string, Set<string>>; aliases: Map<string, string>; full: [string, string][] };
const indexes = new WeakMap<object, Map<League, Index>>();

function teamIndex(league: League): Index {
  const d = db();
  let byLeague = indexes.get(d);
  if (!byLeague) indexes.set(d, (byLeague = new Map()));
  let idx = byLeague.get(league);
  if (idx) return idx;
  idx = { exact: new Map(), city: new Map(), nick: new Map(), aliases: new Map(), full: [] };
  const add = (m: Map<string, Set<string>>, k: string, id: string) => m.set(k, (m.get(k) ?? new Set()).add(id));
  for (const t of listTeams(league)) {
    for (const n of [t.fullName, `${t.city} ${t.name}`]) if (!idx.exact.has(norm(n))) idx.exact.set(norm(n), t.id);
    add(idx.city, norm(t.city), t.id);
    add(idx.nick, norm(t.name), t.id);
    idx.full.push([norm(t.fullName), t.id]);
  }
  for (const a of all<{ alias_norm: string; team_id: string }>("SELECT alias_norm, team_id FROM team_aliases WHERE league = ?", [league])) idx.aliases.set(a.alias_norm, a.team_id);
  byLeague.set(league, idx);
  return idx;
}
/** Drop cached name indexes (after an alias is added or removed). */
export function resetTeamIndex() {
  indexes.delete(db());
}

const only = (s: Set<string> | undefined) => (s && s.size === 1 ? [...s][0] : null);

/**
 * Our team id for a provider team name in a league, or null. In order:
 * an alias (Control Room → Team logos), the full name, the school or city
 * alone when only one team has it ("Arkansas State" is not "Arkansas"), the
 * nickname alone when unique, then a name that adds words after our full name.
 */
export function matchTeam(league: League, name: string): string | null {
  const idx = teamIndex(league);
  const k = norm(name);
  if (k.trim() === "") return null;
  return idx.aliases.get(k) ?? idx.exact.get(k) ?? only(idx.city.get(k)) ?? only(idx.nick.get(k)) ?? only(new Set(idx.full.filter(([n]) => n.split(" ").length > 3 && k.startsWith(n)).map(([, id]) => id)));
}

// ------------------------------------------------------------------ sync

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type LeagueSync = { league: League; ok: boolean; games: number; standings: number; live: number; error: string | null; at: number };

export class BudgetSpent extends Error {}

/**
 * GET JSON from TheSportsDB through the shared request budget. `wait: false`
 * gives up at once when the budget is spent (the live lane); otherwise it
 * waits up to 30 seconds (the 15-minute sync).
 */
export async function getJson(fetchImpl: Fetch, url: string, kind: CallKind, opts: { headers?: Record<string, string>; wait?: boolean; tryTake?: () => boolean } = {}) {
  const ok = opts.wait === false ? (opts.tryTake ?? (() => true))() : await take();
  if (!ok) throw new BudgetSpent("Request budget spent; will try again shortly");
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: "application/json", ...opts.headers }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    record(kind, "error", Date.now(), e instanceof Error ? e.message : String(e));
    throw e;
  }
  if (res.status === 429) {
    record(kind, "limited", Date.now(), "HTTP 429");
    throw new Error("Rate limited by TheSportsDB (HTTP 429)");
  }
  if (!res.ok) {
    record(kind, "error", Date.now(), `HTTP ${res.status}`);
    throw new Error(`HTTP ${res.status}`);
  }
  record(kind, "ok");
  const text = await res.text();
  if (!text.trim()) return {} as Raw;
  try {
    return JSON.parse(text) as Raw;
  } catch {
    throw new Error("TheSportsDB sent something that isn't JSON");
  }
}

const gv = globalThis as unknown as { __gamesVersion?: number };
/** Bumped whenever a game's status, score or detail changes (server-side board cache key). */
export const gamesVersion = () => gv.__gamesVersion ?? 0;
export const bumpGamesVersion = () => void (gv.__gamesVersion = gamesVersion() + 1);

type Parsed = NonNullable<ReturnType<typeof parseEvent>>;
/**
 * Insert or update a game. A final is never turned back into live or
 * scheduled, and a missing score never erases a known one. `changed_at` moves
 * only when the status, score or detail actually changed (the changed-games
 * endpoint reads it). Returns what happened.
 */
export function upsertGame(g: Parsed, opts: { checked?: boolean } = {}): "new" | "changed" | "same" {
  const t = now();
  const old = get<{ status: GameStatus; detail: string; home_score: number | null; away_score: number | null; starts_at: number; changed_at: number }>("SELECT status, detail, home_score, away_score, starts_at, changed_at FROM games WHERE id = ?", [g.id]);
  const status = old?.status === "final" && (g.status === "scheduled" || g.status === "live") ? "final" : g.status;
  const detail = old?.status === "final" && status === "final" && g.status !== "final" ? old.detail : g.detail;
  const hs = g.homeScore ?? old?.home_score ?? null;
  const as = g.awayScore ?? old?.away_score ?? null;
  const changed = !old || old.status !== status || old.detail !== detail || old.home_score !== hs || old.away_score !== as || old.starts_at !== g.startsAt;
  run(
    `INSERT INTO games (id, league, season, round, starts_at, time_known, status, detail, venue, home_name, away_name, home_team_id, away_team_id, home_score, away_score, updated_at, changed_at, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET season = excluded.season, round = excluded.round, starts_at = excluded.starts_at, time_known = excluded.time_known,
       status = excluded.status, detail = excluded.detail, venue = excluded.venue, home_name = excluded.home_name, away_name = excluded.away_name,
       home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_score = excluded.home_score, away_score = excluded.away_score,
       updated_at = excluded.updated_at, changed_at = excluded.changed_at, checked_at = CASE WHEN ? THEN excluded.checked_at ELSE games.checked_at END`,
    [g.id, g.league, g.season, g.round, g.startsAt, g.timeKnown ? 1 : 0, status, detail, g.venue, g.homeName, g.awayName, matchTeam(g.league, g.homeName), matchTeam(g.league, g.awayName), hs, as, t, changed ? t : old!.changed_at, opts.checked ? t : 0, opts.checked ? 1 : 0],
  );
  if (changed) bumpGamesVersion();
  return !old ? "new" : changed ? "changed" : "same";
}

/** When the provider data was last checked (live lane or full sync), for "Updated Xs ago". */
export function markChecked(t = now()) {
  setSetting("sports_checked_at", String(t));
}
export const lastChecked = () => Number(getSetting("sports_checked_at") ?? 0) || 0;

const events = (j: Raw, k = "events") => (Array.isArray(j[k]) ? (j[k] as Raw[]) : []);

/** Season string for standings: the one the latest games use, else a sensible guess. */
export function seasonFor(league: League, t = now()): string {
  const r = get<{ season: string }>("SELECT season FROM games WHERE league = ? AND season != '' ORDER BY starts_at DESC LIMIT 1", [league]);
  if (r?.season) return r.season;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (league === "NBA" || league === "NHL" || league === "EPL") return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  if (league === "NFL" || league === "NCAAF") return String(m >= 3 ? y : y - 1);
  return String(y);
}

export async function syncLeague(league: League, fetchImpl: Fetch = fetch, t = now()): Promise<LeagueSync> {
  const id = PROVIDER_LEAGUE[league];
  const out: LeagueSync = { league, ok: true, games: 0, standings: 0, live: 0, error: null, at: t };
  const errors: string[] = [];
  const take = (list: Raw[]) => {
    tx(() => {
      for (const e of list) {
        const g = parseEvent(e, league, t);
        if (!g) continue;
        upsertGame(g);
        out.games++;
      }
    });
  };
  for (const path of [`eventsnextleague.php?id=${id}`, `eventspastleague.php?id=${id}`]) {
    try {
      take(events(await getJson(fetchImpl, `${V1()}/${path}`, "schedule")));
    } catch (e) {
      errors.push(`${path.split(".")[0]}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    const season = seasonFor(league, t);
    const rows = events(await getJson(fetchImpl, `${V1()}/lookuptable.php?l=${id}&s=${encodeURIComponent(season)}`, "standings"), "table")
      .map((r) => parseTableRow(r, league))
      .filter((r): r is NonNullable<typeof r> => !!r);
    if (rows.length) {
      tx(() => {
        run("DELETE FROM standings WHERE league = ?", [league]);
        for (const r of rows)
          run(
            `INSERT OR REPLACE INTO standings (league, season, team_name, team_id, rank, played, wins, losses, draws, points, goal_diff, form, note, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [league, r.season || season, r.teamName, matchTeam(league, r.teamName), r.rank, r.played, r.wins, r.losses, r.draws, r.points, r.goalDiff, r.form, r.note, now()],
          );
      });
      out.standings = rows.length;
      bumpGamesVersion();
    }
  } catch (e) {
    errors.push(`standings: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (errors.length === 3) out.ok = false;
  out.error = errors.length ? errors.join("; ") : null;
  return out;
}

export const V1_BASE = V1;
export const V2_BASE = V2;
export const SPORT_OF = SPORT;

const STATE_KEY = "sports_sync";
export function syncState(): Partial<Record<League, LeagueSync>> {
  try {
    return JSON.parse(getSetting(STATE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const g = globalThis as unknown as { __sportsRunning?: boolean };
/** Sync every league one after another (stays well inside the free key's rate limit). */
export async function syncAllSports(opts: { fetchImpl?: Fetch; leagues?: League[]; pauseMs?: number } = {}) {
  if (g.__sportsRunning) return { skipped: true as const, results: [] };
  g.__sportsRunning = true;
  const results: LeagueSync[] = [];
  try {
    const state = syncState();
    for (const league of opts.leagues ?? [...LEAGUES]) {
      const r = await syncLeague(league, opts.fetchImpl);
      results.push(r);
      state[league] = r;
      setSetting(STATE_KEY, JSON.stringify(state));
      if (opts.pauseMs) await new Promise((res) => setTimeout(res, opts.pauseMs));
    }
    markChecked();
  } finally {
    g.__sportsRunning = false;
  }
  return { skipped: false as const, results };
}

// ------------------------------------------------------------------ reading

type GameRow = {
  id: string; league: League; season: string; round: string | null; starts_at: number; time_known: number; status: GameStatus; detail: string; venue: string;
  home_name: string; away_name: string; home_team_id: string | null; away_team_id: string | null; home_score: number | null; away_score: number | null;
};

function teamsById(ids: (string | null)[]) {
  const want = new Set(ids.filter((x): x is string => !!x));
  const map = new Map<string, TeamView>();
  if (!want.size) return map;
  for (const t of listTeams()) if (want.has(t.id)) map.set(t.id, t);
  return map;
}

function toViews(rows: GameRow[], t = now()): GameView[] {
  const teams = teamsById(rows.flatMap((r) => [r.home_team_id, r.away_team_id]));
  return rows.map((r) => withPhase<GameView>({
    id: r.id,
    league: r.league,
    season: r.season,
    round: r.round,
    startsAt: r.starts_at,
    timeKnown: !!r.time_known,
    status: r.status,
    detail: r.detail,
    venue: r.venue,
    home: side(r.home_team_id, r.home_name, r.home_score, teams),
    away: side(r.away_team_id, r.away_name, r.away_score, teams),
  }, t));
}

function side(id: string | null, name: string, score: number | null, teams: Map<string, TeamView>): GameSide {
  const team = id ? teams.get(id) ?? null : null;
  return { id, name, score, team, badge: team?.circle ?? { letters: badgeLetters({ name }), ...circleColors(null) } };
}

const leagueWhere = (leagues?: League[]) => (leagues?.length ? `AND league IN (${leagues.map(() => "?").join(",")})` : "");

export type Scoreboard = { live: GameView[]; today: GameView[]; upcoming: GameView[]; recent: GameView[] };

/**
 * Everything for a scoreboard: live games, the rest of today, the next 7 days,
 * and the last 3 days of results. "Today" uses the viewer's UTC offset in minutes.
 */
export function scoreboard(opts: { leagues?: League[]; tzOffsetMin?: number; t?: number; upcomingLimit?: number; recentLimit?: number } = {}): Scoreboard {
  const t = opts.t ?? now();
  const off = (opts.tzOffsetMin ?? 0) * 60_000;
  const local = new Date(t - off);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + off;
  const dayEnd = dayStart + 86_400_000;
  const L = opts.leagues ?? [];
  const q = (sql: string, params: (string | number)[]) => toViews(all<GameRow>(sql, [...params, ...L]), t);
  // Games the provider still calls live but whose final is long overdue read as "Final (unconfirmed)", so they move to today/results.
  const liveRows = q(`SELECT * FROM games WHERE status = 'live' AND starts_at > ? ${leagueWhere(L)} ORDER BY starts_at`, [t - 8 * 3_600_000]);
  const live = liveRows.filter((g) => g.status === "live");
  const today = q(`SELECT * FROM games WHERE starts_at >= ? AND starts_at < ? ${leagueWhere(L)} ORDER BY starts_at, id`, [dayStart, dayEnd]).filter((g) => g.status !== "live");
  const upcoming = q(`SELECT * FROM games WHERE status IN ('scheduled','postponed') AND starts_at >= ? AND starts_at < ? ${leagueWhere(L)} ORDER BY starts_at, id LIMIT ${opts.upcomingLimit ?? 60}`, [dayEnd, dayEnd + 7 * 86_400_000]);
  const recent = q(`SELECT * FROM games WHERE status IN ('final','live') AND starts_at < ? AND starts_at > ? ${leagueWhere(L)} ORDER BY starts_at DESC LIMIT ${opts.recentLimit ?? 40}`, [dayStart, dayStart - 3 * 86_400_000]).filter((g) => g.status === "final");
  return { live, today, upcoming, recent };
}

/** A team's schedule: next games and recent results. */
export function teamSchedule(teamId: string, t = now()) {
  const where = "(home_team_id = ? OR away_team_id = ?)";
  const next = toViews(all<GameRow>(`SELECT * FROM games WHERE ${where} AND status IN ('scheduled','live','postponed') AND starts_at > ? ORDER BY starts_at LIMIT 10`, [teamId, teamId, t - 8 * 3_600_000]));
  const nextAll = next.filter((g) => g.status !== "final");
  const last = toViews(all<GameRow>(`SELECT * FROM games WHERE ${where} AND (status = 'final' OR (status = 'live' AND starts_at < ?)) ORDER BY starts_at DESC LIMIT 12`, [teamId, teamId, t]), t).filter((g) => g.status === "final").slice(0, 10);
  return { next: nextAll, last };
}

export function getGame(id: string): GameView | null {
  const r = get<GameRow>("SELECT * FROM games WHERE id = ?", [id]);
  return r ? toViews([r])[0] : null;
}

/** Earlier meetings of the same two teams. */
export function headToHead(g: GameView, limit = 5) {
  if (!g.home.id || !g.away.id) return [];
  return toViews(
    all<GameRow>(
      "SELECT * FROM games WHERE id != ? AND status = 'final' AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?)) ORDER BY starts_at DESC LIMIT ?",
      [g.id, g.home.id, g.away.id, g.away.id, g.home.id, limit],
    ),
  );
}

export function standings(league: League): StandingRow[] {
  const rows = all<{ league: League; season: string; team_name: string; team_id: string | null; rank: number; played: number; wins: number; losses: number; draws: number; points: number | null; goal_diff: number | null; form: string; note: string }>(
    "SELECT * FROM standings WHERE league = ? ORDER BY rank, team_name",
    [league],
  );
  const teams = teamsById(rows.map((r) => r.team_id));
  return rows.map((r) => ({
    league: r.league, season: r.season, rank: r.rank, teamId: r.team_id, teamName: r.team_name, team: r.team_id ? teams.get(r.team_id) ?? null : null,
    played: r.played, wins: r.wins, losses: r.losses, draws: r.draws, points: r.points, goalDiff: r.goal_diff, form: r.form, note: r.note,
  }));
}

export function teamStanding(teamId: string) {
  const r = get<{ league: League; rank: number; wins: number; losses: number; draws: number; points: number | null; played: number }>("SELECT league, rank, wins, losses, draws, points, played FROM standings WHERE team_id = ?", [teamId]);
  return r ? { ...r } : null;
}

export const gameCounts = () => Object.fromEntries(all<{ league: string; n: number }>("SELECT league, count(*) n FROM games GROUP BY league").map((r) => [r.league, r.n])) as Record<string, number>;

/** Whether anything is live, so the scheduler can poll faster. */
export const anyLive = (t = now()) => !!get("SELECT 1 FROM games WHERE status = 'live' AND starts_at > ?", [t - 8 * 3_600_000]);
/** Games starting soon (or in progress) also get a faster refresh. */
export const anySoon = (t = now()) => !!get("SELECT 1 FROM games WHERE status = 'scheduled' AND starts_at BETWEEN ? AND ?", [t - 4 * 3_600_000, t + 15 * 60_000]);

/**
 * Games that changed after `since` (ms): new scores, statuses or details from
 * the provider, plus live games that crossed into "awaiting" or "unconfirmed"
 * on the clock alone. Limited to games from the last day and the next one.
 */
export function changedGames(since: number, opts: { leagues?: League[]; t?: number } = {}): GameView[] {
  const t = opts.t ?? now();
  const L = opts.leagues ?? [];
  const rows = all<GameRow & { changed_at: number }>(
    `SELECT * FROM games WHERE starts_at > ? AND starts_at < ? AND (changed_at > ? OR status = 'live') ${leagueWhere(L)} ORDER BY starts_at LIMIT 300`,
    [t - 36 * 3_600_000, t + 36 * 3_600_000, since, ...L],
  );
  const keep = rows.filter((r) => r.changed_at > since || (r.status === "live" && phaseChanges({ league: r.league, startsAt: r.starts_at }).some((x) => x > since && x <= t)));
  return toViews(keep, t);
}
