// ALL MIGHTY: the player who is #1 in the world on the all-time SCORE board wears the gold
// animated title "ALL MIGHTY"; everyone who has ever been #1 keeps a "Former All Mighty" badge.
//
// The SERVER decides it, once a day (supabase/migrations/20261109000001_all_mighty.sql). This
// module only holds the server's last answer: who holds it now and everyone who ever has.
// The phone never works it out from a board's ranks. src/online/allMighty.js fetches it.
//
//   · The answer is cached on the device (glydrift.allmighty.v1) so it shows offline, but a
//     cached answer only grants YOU the title while it's under 36 hours old (the server
//     checks daily): a phone that stays offline can't keep the title forever.
//   · Once you've been seen as a holder, the save remembers it (save.allMighty.former), so
//     the Former All Mighty badge stays with you even offline and after you lose #1.
import { Save } from "./save.js";

const CACHE_KEY = "glydrift.allmighty.v1";
const FRESH_MS = 36 * 3600 * 1000;
const MAX_HISTORY = 500;

const listeners = new Set();
let cache = null; // { holder, holderName, since, history: [ids], me, at }
let userStale = false; // the signed-in player changed since the last answer (see userChanged)

function readCache() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (raw && typeof raw === "object") cache = sanitize(raw);
  } catch {
    /* private browsing / damaged: no cache */
  }
  return cache;
}

function sanitize(d) {
  const str = (v) => (typeof v === "string" ? v : "");
  return {
    holder: str(d.holder) || null,
    holderName: str(d.holderName),
    since: str(d.since),
    history: Array.isArray(d.history)
      ? d.history.filter((x) => typeof x === "string").slice(0, MAX_HISTORY)
      : [],
    me: str(d.me) || null,
    at: Number.isFinite(d.at) ? d.at : 0,
  };
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* no storage: it still works for this session */
  }
}

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a screen that's gone */
    }
  }
}

function saved() {
  const s = Save.data;
  if (!s.allMighty || typeof s.allMighty !== "object") s.allMighty = { former: false, at: "" };
  return s.allMighty;
}

export const AllMighty = {
  /** The server's answer arrived: { holder, holderName, since, history }, and who you are. */
  apply(data, myId) {
    const prev = this.isMe();
    const prevFormer = this.former();
    cache = sanitize({ ...data, me: myId || null, at: Date.now() });
    userStale = userStale && !myId; // (still nobody signed in: ask again next time)
    writeCache();
    // been #1 (now or before)? that's yours for good, in the save
    const me = cache.me;
    if (me && (cache.holder === me || cache.history.includes(me)) && !saved().former) {
      saved().former = true;
      saved().at = new Date().toISOString();
      Save.write();
    }
    if (prev !== this.isMe() || prevFormer !== this.former()) notify();
  },

  /**
   * The signed-in player changed (log in / log out / account deleted): the cached answer's
   * "you" was the previous player, so it must not give the title to whoever is playing now.
   * The holder and history stay (they don't depend on who you are); the next refresh fills
   * "you" in again.
   */
  userChanged() {
    const c = readCache();
    userStale = true;
    if (!c || !c.me) return;
    const prev = this.isMe();
    c.me = null;
    writeCache();
    if (prev) notify();
  },

  /** True after userChanged() until the next server answer (refresh it now, not in 30 min). */
  userStale() {
    return userStale;
  },

  /** The current holder's player id (from the server's last answer), or null. */
  holderId() {
    return readCache()?.holder || null;
  },

  /** Is this player the ALL MIGHTY right now? (only from a fresh server answer) */
  isMe() {
    const c = readCache();
    return !!c && !!c.holder && c.holder === c.me && Date.now() - c.at < FRESH_MS;
  },

  /** Have you ever been ALL MIGHTY (kept in the save, so offline too)? */
  former() {
    return !!saved().former;
  },

  /** Should this leaderboard row show the Former All Mighty badge? (not while holding it) */
  formerRow(row, mine = false) {
    const id = row?.player_id;
    if (!id) return false;
    if (id === this.holderId()) return false;
    if (mine) return this.former() && !this.isMe();
    return !!readCache()?.history.includes(id);
  },

  /** Run fn whenever your own status changes (title gained / lost, badge earned). */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** test builds: forget the cached answer */
  _reset() {
    cache = null;
    userStale = false;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
  },
};
