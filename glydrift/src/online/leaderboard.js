// Online leaderboard (Supabase). Everything here is asynchronous and fire-and-forget from the
// game's point of view: nothing ever blocks a run, the game over screen or a retry.
//
//  - Anonymous auth: one persistent session per device → a stable player_id (auth.uid()).
//  - Scores go into a persistent local queue first, then upload in the background (and again
//    when the device comes back online). Only personal bests are written.
//  - Table "scores": one row per (player_id, level); RLS lets anyone read and players write
//    only their own row. Only the publishable key is used here.
//  - Two endless boards: SCORE (level "endless") and DISTANCE (level "endless-distance", where
//    the row's score is the run's metres). Every endless run submits to both; the Daily has
//    one score board. Rows also carry `distance` once the database has that column
//    (supabase/migrations); until then it is simply left out.
import { SUPABASE, WORLD } from "../config.js";
import { dailyNumber } from "../data/rng.js";
import { Save } from "../data/save.js";
import { Titles } from "../data/titles.js";
import { Shop } from "../data/cosmetics.js";
import { TEST } from "../systems/testFlags.js";

// ?lbtest routes all reads/writes to "test-…" levels so testing never touches the real boards
// (test builds only)
/* global __TEST_FLAGS__ */
const PREFIX =
  typeof __TEST_FLAGS__ !== "undefined" &&
  __TEST_FLAGS__ &&
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("lbtest")
    ? "test-"
    : "";

export const Levels = {
  endless: () => `${PREFIX}endless`,
  distance: () => `${PREFIX}endless-distance`,
  daily: (n = dailyNumber()) => `${PREFIX}daily-${n}`,
  forRun: (run) => (run.mode === "daily" ? Levels.daily() : Levels.endless()),
  isDistance: (level) => level.endsWith("endless-distance"),
  /** LEVEL MODE best times: one board per level (score encodes the time, higher = faster). */
  level: (n) => `${PREFIX}lv-${n}`,
  isLevel: (level) => /lv-\d+$/.test(level),
};

/** Level boards store a time as a score so the board's "higher is better" order still works. */
const TIME_K = 5e8;
export const timeToScore = (ms) => Math.max(1, Math.round(TIME_K / Math.max(1, ms)));
export const scoreToTime = (score) => (score > 0 ? TIME_K / score : 0);

const TIMEOUT_MS = 8000;
const MAX_QUEUE = 40;

/** fetch with a hard timeout so a dead network can never hang a request forever */
function timedFetch(input, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  if (init.signal) init.signal.addEventListener("abort", () => ctrl.abort());
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function isNetworkError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = `${err?.message ?? err ?? ""} ${err?.details ?? ""}`;
  return (
    /fetch|network|load failed|abort|timeout|offline|ECONN|ENOTFOUND/i.test(msg) ||
    err?.status === 0
  );
}

/** The server definitely refused this write (RLS / constraint / bad request): don't retry. */
function isRejection(err) {
  const st = err?.status ?? err?.statusCode;
  if ([400, 403, 404, 409, 422].includes(st)) return true;
  return /^(22|23|42|P0)/.test(String(err?.code || ""));
}

export class LeaderboardError extends Error {
  constructor(message, offline) {
    super(message);
    this.offline = offline;
  }
}

// The top speed is WORLD.maxSpeed times the fastest hero (WALLRUNNER ×1.2), the Abyss /
// dimension spike (×1.1) and Chrono "fast" zones (×1.35): real runs must never be rejected.
const MAX_SPEED_FACTOR = 1.8;

/**
 * Score = metres + bonuses (coins, close calls, dead-centre passes), each bonus times the
 * combo (x10, x13 for SXE). Endless spawns at most ~0.07 coins and ~0.04 hazards per metre,
 * so even every coin and every close call at x13 stays under 30 points per metre; real runs
 * make 5–9. The same limits are checked on the server (glydrift_check_score).
 */
export const MAX_POINTS_PER_METER = 30;
const POINTS_ALLOWANCE = 2000;

/** Upper bounds a real run can't exceed. Same rules as the server's glydrift_check_score. */
export function isPlausible(run) {
  const ms = Math.round(run.run_time_ms ?? run.runTimeMs ?? 0);
  const score = Math.round(run.score);
  const meters = Math.floor(run.distance ?? 0);
  const level = run.level || "";
  if (!Number.isFinite(score) || score <= 0 || score > 2_000_000) return false;
  if (!Number.isFinite(ms) || ms < 500) return false;
  const maxMeters = ((MAX_SPEED_FACTOR * WORLD.maxSpeed) / WORLD.pxPerMeter) * (ms / 1000) + 40;
  if (!Number.isFinite(meters) || meters < 0 || meters > maxMeters) return false;
  // a level's board stores its time as a score: the two must agree
  if (Levels.isLevel(level)) return Math.abs(score - timeToScore(ms)) <= 1;
  // endless, daily and distance runs always carry the distance flown
  if (meters <= 0) return false;
  if (Levels.isDistance(level)) return score === meters;
  return score >= meters - 2 && score <= meters * MAX_POINTS_PER_METER + POINTS_ALLOWANCE;
}

/** The column a "no such column" error is about (PostgREST PGRST204 / Postgres 42703). */
function missingColumn(err, cols) {
  if (err?.code !== "PGRST204" && err?.code !== "42703") return null;
  const msg = `${err.message || ""} ${err.details || ""}`;
  return (
    cols.find((c) => msg.includes(`'${c}'`) || msg.includes(`"${c}"`) || msg.includes(c)) || null
  );
}

/**
 * Drift Pass+ flair shown with your name: "gold" (the gold name, switched on in Settings) and
 * "s1" (the forever Season 1 badge). The server keeps it only with a verified purchase.
 */
export function myFlair() {
  const f = [];
  if (Shop.equipped("name") === "name_pp_gold") f.push("gold");
  if (Shop.owns("badge_pp_s1")) f.push("s1");
  return f.length ? f.join(",") : null;
}
/** A row's flair as a set: { gold, s1 }. */
export const flairOf = (row) => {
  const set = new Set(
    String(row?.flair || "")
      .split(",")
      .filter(Boolean),
  );
  return { gold: set.has("gold"), s1: set.has("s1") };
};

// ---- test builds (?lbmock): a deterministic board of sample players, no network ----
const MOCK_NAMES = [
  "NeonAce",
  "VoidKid",
  "Starling",
  "ZipZap",
  "Kestrel",
  "Lumen",
  "Rogue7",
  "Pixelle",
  "Comet",
  "Wisp",
  "Drifter",
  "Nova",
  "Halo",
  "Blaze",
  "Frost",
  "Echo",
  "Rift",
  "Glimmer",
  "Orbit",
  "Spark",
  "Vex",
  "Juno",
  "Flux",
  "Talon",
  "Mira",
  "Quill",
  "Rune",
  "Sable",
  "Tempo",
  "Umbra",
  "Vale",
  "Wren",
  "Xeno",
  "Yara",
  "Zed",
  "Aero",
  "Bolt",
  "Cinder",
  "Dusk",
];
const MOCK_HEROES = ["volt", "ember", "ronin", "frost", "pengu", "glitch", "levijr"];
const MOCK_TITLES = [
  "p_neonroyal",
  "t_diamond",
  null,
  "t_gold",
  "p_abysslord",
  "t_daredevil",
  null,
  "t_silver",
];
const MOCK_FLAIR = ["gold,s1", null, "s1", null, null, "gold,s1", null, null, null];
function mockRows(level, period) {
  const dist = Levels.isDistance(level);
  const top = (dist ? 9200 : 15800) * (period === "today" ? 0.42 : period === "week" ? 0.7 : 1);
  return MOCK_NAMES.map((name, i) => ({
    player_id: `mock-${i}`,
    username: name,
    score: Math.round(top * Math.pow(0.955, i) + (dist ? 0 : 7) * (i % 3)),
    character: MOCK_HEROES[i % MOCK_HEROES.length],
    title: MOCK_TITLES[i % MOCK_TITLES.length],
    flair: MOCK_FLAIR[i % MOCK_FLAIR.length],
    created_at: "2026-11-04T10:00:00Z",
  }));
}
function mockBoard(level, period, username) {
  const rows = mockRows(level, period);
  const me = {
    username: username || "YOU",
    character: "volt",
    title: Titles.equippedId(),
    flair: myFlair(),
    created_at: "2026-11-04T11:00:00Z",
  };
  // you: just inside the list on the all-time boards, outside the top 100 on daily
  const rank = level.includes("daily") ? 142 : 12;
  me.score = level.includes("daily") ? 420 : Math.round(rows[rank - 1].score - 3);
  if (rank <= rows.length) rows.splice(rank - 1, 0, { ...me, player_id: "me" });
  return { rows: rows.slice(0, 100), me: { ...me, rank }, userId: "me" };
}
function mockRank(level, value) {
  const rows = mockRows(level, "all");
  return rows.filter((r) => r.score > value).length + 1;
}

export const HIDDEN_NAME = "Hidden player";

class LeaderboardService {
  constructor() {
    this.cols = {}; // optional columns known to be missing on the server (false)
    this.clientPromise = null;
    this.sessionPromise = null;
    this.userId = null;
    this.flushing = null;
    this.online = true;
  }

  get data() {
    const s = Save.data;
    s.profile ||= { username: "" };
    s.lbQueue ||= [];
    return s;
  }

  get username() {
    return this.data.profile.username || "";
  }

  // ---------------------------------------------------------------- reported names
  /** Players this player reported or hid: { player_id: the name they had } (this device). */
  get hidden() {
    const s = Save.data;
    s.hiddenPlayers ||= {};
    return s.hiddenPlayers;
  }

  /** Rows with every hidden player's name replaced (their score stays, the name doesn't). */
  maskHidden(rows) {
    const hidden = this.hidden;
    return rows.map((r) =>
      r && hidden[r.player_id] && r.player_id !== this.userId
        ? { ...r, username: HIDDEN_NAME, hiddenName: true }
        : r,
    );
  }

  /**
   * Report an offensive name: it's hidden for this player straight away and the report goes to
   * the server (table name_reports), where enough reports rename the player automatically and
   * the owner can remove it by hand. Works offline (the hide is local; the report is retried).
   */
  async reportName(playerId, name) {
    if (!playerId || playerId === this.userId) return false;
    this.hidden[playerId] = String(name || "").slice(0, 40);
    Save.write();
    if (TEST.lbmock || TEST.offline) {
      (window.__glyReports ||= []).push({ playerId, name });
      return true;
    }
    try {
      const sb = await this.session();
      const { error } = await sb
        .from("name_reports")
        .insert({ reported_player: playerId, reported_name: String(name || "").slice(0, 40) });
      // already reported by this player (unique) is fine
      if (error && error.code !== "23505") throw error;
      return true;
    } catch {
      return false; // still hidden here
    }
  }

  /** Show every hidden name again. */
  unhideAll() {
    Save.data.hiddenPlayers = {};
    Save.write();
  }

  client() {
    // automated tests (?offline): no network at all, so nothing lands at a real-time moment
    if (TEST.offline) return Promise.reject(new Error("offline (test)"));
    if (!this.clientPromise) {
      this.clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
        createClient(SUPABASE.url, SUPABASE.publishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: "glydrift.auth",
          },
          global: { fetch: timedFetch },
        }),
      );
      this.clientPromise.catch(() => {
        this.clientPromise = null;
      });
    }
    return this.clientPromise;
  }

  /** Restore the saved session, or sign in anonymously once (session is persisted). */
  session() {
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const sb = await this.client();
        let {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) {
          const { data, error } = await sb.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        this.userId = session.user.id;
        this.online = true;
        return sb;
      })();
      this.sessionPromise.catch(() => {
        this.sessionPromise = null; // retry next time
        this.online = false;
      });
    }
    return this.sessionPromise;
  }

  /** The signed-in user changed (log in / log out): pick the session up afresh. */
  restart() {
    this.sessionPromise = null;
    this.userId = null;
  }

  /** Call once at launch: sign in in the background and upload anything queued. */
  init() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.flush());
    }
    this.session()
      .then(() => this.flush())
      .catch(() => {});
  }

  // ---------------------------------------------------------------- username
  setUsername(name) {
    this.data.profile.username = name;
    // change the queue in place: a flush that's running keeps working on the same array
    const q = this.data.lbQueue;
    for (let i = q.length - 1; i >= 0; i--)
      if (q[i].type === "rename" && !(this.flushing && i === 0)) q.splice(i, 1);
    q.push({ type: "rename", username: name });
    Save.write();
    return this.flush();
  }

  // ---------------------------------------------------------------- submitting
  /**
   * Queue a finished run and upload it in the background. Never throws, never blocks.
   * @returns Promise resolving to { uploaded, queued, rejected }
   */
  submitRun(run) {
    // runs that used a shop Boost never reach either board (coins can't buy rank)
    if (run.boosted) return Promise.resolve({ rejected: true, boosted: true });
    const entry = {
      type: "score",
      level: Levels.forRun(run),
      score: Math.round(run.score),
      character: run.char,
      run_time_ms: Math.round(run.runTimeMs ?? 0),
      distance: Math.floor(run.distance || 0),
    };
    // an impossible run (score or distance too high for its run time) goes to neither board
    if (!isPlausible(entry)) {
      return Promise.resolve({ rejected: true });
    }
    if (TEST.lbmock) return Promise.resolve({ uploaded: 2, queued: 0, mock: true });
    this.enqueue(entry);
    // endless runs also go on the DISTANCE board (its "score" is the metres flown)
    if (run.mode !== "daily" && entry.distance > 0)
      this.enqueue({
        ...entry,
        level: Levels.distance(),
        score: entry.distance,
      });
    Save.write();
    return this.flush();
  }

  /**
   * A level finished with no crashes (normal mode, never practice): its time goes on that
   * level's board in the background; offline it waits in the same queue as endless scores.
   */
  submitLevelTime({ n, timeMs, distance, char }) {
    const entry = {
      type: "score",
      level: Levels.level(n),
      score: timeToScore(timeMs),
      character: char,
      run_time_ms: Math.round(timeMs),
      distance: Math.floor(distance || 0),
    };
    if (!isPlausible(entry)) return Promise.resolve({ rejected: true });
    if (TEST.lbmock) return Promise.resolve({ uploaded: 1, queued: 0, mock: true });
    this.enqueue(entry);
    Save.write();
    return this.flush();
  }

  /** Keep only the best pending entry per level. */
  enqueue(entry) {
    const q = this.data.lbQueue;
    // keep only the best pending score per level
    // (never merge into the entry an upload is sending right now: that new best would be lost)
    const same = q.find(
      (op, i) => op.type === "score" && op.level === entry.level && !(this.flushing && i === 0),
    );
    if (same) {
      if (entry.score > same.score) Object.assign(same, entry);
    } else {
      q.push(entry);
      while (q.length > MAX_QUEUE) q.shift();
    }
  }

  /** Upload queued operations. Safe to call any time; concurrent calls share one run. */
  flush() {
    if (TEST.lbmock) return Promise.resolve({ uploaded: 0, queued: 0 });
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      const result = { uploaded: 0, queued: 0 };
      try {
        const sb = await this.session();
        const q = this.data.lbQueue;
        while (q.length) {
          const op = q[0];
          if (op.type === "score" && !this.username) break; // wait for a name
          try {
            if (op.type === "rename") await this.doRename(sb, op);
            else if (await this.doScore(sb, op)) result.uploaded++;
            q.shift();
            Save.write();
          } catch (err) {
            // drop an entry only when the server clearly refused it (or after many tries);
            // timeouts, 5xx, rate limits and token refreshes keep it for a later retry
            op.tries = (op.tries || 0) + 1;
            if (isNetworkError(err) || (!isRejection(err) && op.tries < 8)) throw err;
            q.shift();
            Save.write();
          }
        }
        this.online = true;
      } catch {
        this.online = false;
      } finally {
        result.queued = this.data.lbQueue.length;
        this.flushing = null;
      }
      // something is still waiting: try again later (backing off up to a minute)
      if (result.queued && !this.retryTimer) {
        this.retryMs = Math.min(60000, (this.retryMs || 4000) * 2);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.flush();
        }, this.retryMs);
      } else if (!result.queued) this.retryMs = 0;
      return result;
    })();
    return this.flushing;
  }

  async doRename(sb, op) {
    const { error } = await sb
      .from("scores")
      .update({ username: op.username })
      .eq("player_id", this.userId);
    if (error) throw error;
  }

  /** Upsert only when it beats the stored best for that level. */
  async doScore(sb, op) {
    const { data: existing, error: e1 } = await sb
      .from("scores")
      .select("score")
      .eq("player_id", this.userId)
      .eq("level", op.level)
      .maybeSingle();
    if (e1) throw e1;
    if (existing && existing.score >= op.score) return false;
    const row = {
      player_id: this.userId,
      username: this.username,
      level: op.level,
      score: op.score,
      character: op.character,
      run_time_ms: op.run_time_ms,
      created_at: new Date().toISOString(),
    };
    // optional columns the database may not have yet (added by supabase/migrations)
    for (const [col, v] of Object.entries(this.extraColumns(op)))
      if (this.cols[col] !== false && (v != null || col === "flair")) row[col] = v;
    let { error } = await sb.from("scores").upsert(row, { onConflict: "player_id,level" });
    const missing = error && missingColumn(error, Object.keys(this.extraColumns(op)));
    if (missing) {
      // an older database: remember the column isn't there and send the row without it
      this.cols[missing] = false;
      delete row[missing];
      ({ error } = await sb.from("scores").upsert(row, { onConflict: "player_id,level" }));
    }
    if (error) throw error;
    return true;
  }

  /** Columns added by the migrations: the run's distance and the title you wear. */
  extraColumns(op) {
    return {
      distance: op.distance,
      title: Titles.equippedId(),
      flair: myFlair(),
    };
  }

  // ---------------------------------------------------------------- reading
  static since(period) {
    const d = new Date();
    if (period === "today") {
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    if (period === "week") {
      const day = (d.getDay() + 6) % 7; // Monday = 0
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    return null;
  }

  wrap(err) {
    return new LeaderboardError(
      isNetworkError(err)
        ? "You're offline — connect to see the leaderboard."
        : "Couldn't load the leaderboard. Try again.",
      isNetworkError(err),
    );
  }

  /** Top 100 for a level + the player's own row and rank (even outside the top 100). */
  async board(level, period = "all") {
    if (TEST.lbmock) {
      const b = mockBoard(level, period, this.username);
      return { ...b, rows: this.maskHidden(b.rows) };
    }
    try {
      const sb = await this.session();
      const since = LeaderboardService.since(period);
      let q = sb
        .from("scores")
        .select(`player_id,${this.readCols()}`)
        .eq("level", level)
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(100);
      if (since) q = q.gte("created_at", since);
      const { data: rows, error } = await q;
      if (error) throw error;
      const me = await this.myRank(sb, level, since);
      return { rows: this.maskHidden(rows || []), me, userId: this.userId };
    } catch (err) {
      // an older database without the title / flair column: read without it
      const missing = missingColumn(err, ["title", "flair"]);
      if (missing && this.cols[missing] !== false) {
        this.cols[missing] = false;
        return this.board(level, period);
      }
      throw this.wrap(err);
    }
  }

  /** Columns read for a board row (the optional ones only while the database has them). */
  readCols() {
    return [
      "username,score,character",
      this.cols.title === false ? null : "title",
      this.cols.flair === false ? null : "flair",
      "created_at",
    ]
      .filter(Boolean)
      .join(",");
  }

  async myRank(sb, level, since) {
    const { data: mine, error } = await sb
      .from("scores")
      .select(this.readCols())
      .eq("player_id", this.userId)
      .eq("level", level)
      .maybeSingle();
    if (error) throw error;
    if (!mine || (since && mine.created_at < since)) return null;
    let q = sb
      .from("scores")
      .select("id", { count: "exact", head: true })
      .eq("level", level)
      .gt("score", mine.score);
    if (since) q = q.gte("created_at", since);
    const { count, error: e2 } = await q;
    if (e2) throw e2;
    return { ...mine, rank: (count ?? 0) + 1 };
  }

  /** Worldwide placement of a single run's score among other players (all time). */
  async placementFor(level, score) {
    if (TEST.lbmock) return mockRank(level, score);
    const sb = await this.session();
    const { count, error } = await sb
      .from("scores")
      .select("id", { count: "exact", head: true })
      .eq("level", level)
      .gt("score", score)
      .neq("player_id", this.userId);
    if (error) throw error;
    return (count ?? 0) + 1;
  }
}

export const Leaderboard = new LeaderboardService();

// test builds only: let automated tests reach the board logic directly
if (TEST.on && typeof window !== "undefined") window.__glyLb = { Leaderboard, Levels, isPlausible };
