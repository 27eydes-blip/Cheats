// Online leaderboard (Supabase). Everything here is asynchronous and fire-and-forget from the
// game's point of view: nothing ever blocks a run, the game over screen or a retry.
//
//  - Anonymous auth: one persistent session per device → a stable player_id (auth.uid()).
//  - Scores go into a persistent local queue first, then upload in the background (and again
//    when the device comes back online). Only personal bests are written.
//  - Table "scores": one row per (player_id, level); RLS lets anyone read and players write
//    only their own row. Only the publishable key is used here.
import { SUPABASE, WORLD } from "../config.js";
import { dailyNumber } from "../data/rng.js";
import { Save } from "../data/save.js";

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
  daily: (n = dailyNumber()) => `${PREFIX}daily-${n}`,
  forRun: (run) => (run.mode === "daily" ? Levels.daily() : Levels.endless()),
};

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

/** Upper bounds a real run can't exceed (bonuses are bounded per meter). */
export function isPlausible(run) {
  const ms = Math.round(run.run_time_ms ?? run.runTimeMs ?? 0);
  const score = Math.round(run.score);
  const meters = run.distance ?? 0;
  if (!Number.isFinite(score) || score <= 0 || score > 2_000_000) return false;
  if (!Number.isFinite(ms) || ms < 500) return false;
  const maxMeters = ((MAX_SPEED_FACTOR * WORLD.maxSpeed) / WORLD.pxPerMeter) * (ms / 1000) + 40;
  if (meters > maxMeters) return false;
  // score = meters + coin bonus + close-call bonus; both bonuses are capped generously
  const maxScore = maxMeters * 20 + 500;
  return score <= maxScore;
}

class LeaderboardService {
  constructor() {
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

  client() {
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
    // runs that used a shop Boost never reach the leaderboard (coins can't buy rank)
    if (run.boosted) return Promise.resolve({ rejected: true, boosted: true });
    const entry = {
      type: "score",
      level: Levels.forRun(run),
      score: Math.round(run.score),
      character: run.char,
      run_time_ms: Math.round(run.runTimeMs ?? 0),
      distance: run.distance,
    };
    if (!isPlausible({ ...entry, run_time_ms: entry.run_time_ms })) {
      return Promise.resolve({ rejected: true });
    }
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
    Save.write();
    return this.flush();
  }

  /** Upload queued operations. Safe to call any time; concurrent calls share one run. */
  flush() {
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
    const { error } = await sb.from("scores").upsert(
      {
        player_id: this.userId,
        username: this.username,
        level: op.level,
        score: op.score,
        character: op.character,
        run_time_ms: op.run_time_ms,
        created_at: new Date().toISOString(),
      },
      { onConflict: "player_id,level" },
    );
    if (error) throw error;
    return true;
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
    try {
      const sb = await this.session();
      const since = LeaderboardService.since(period);
      let q = sb
        .from("scores")
        .select("player_id,username,score,character,created_at")
        .eq("level", level)
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(100);
      if (since) q = q.gte("created_at", since);
      const { data: rows, error } = await q;
      if (error) throw error;
      const me = await this.myRank(sb, level, since);
      return { rows: rows || [], me, userId: this.userId };
    } catch (err) {
      throw this.wrap(err);
    }
  }

  async myRank(sb, level, since) {
    const { data: mine, error } = await sb
      .from("scores")
      .select("username,score,character,created_at")
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
