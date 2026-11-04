// SEASONS — which season is live, the player's progress in each, event challenges, the
// end-of-season auto-claim + recap. Data comes from Supabase remote config (table
// `season_config`, row "live"; cached on the device), else the built-in SEASON_DEFAULTS.
// Seasons are started, changed or ended by editing that row — no app update needed.
import { TEST } from "../systems/testFlags.js";
import { SEASON_DEFAULTS } from "./seasonDefs.js";
import { Save } from "./save.js";
import { COSMETICS, getCosmetic, setSeasonItemCheck } from "./cosmetics.js";
import { CHARACTERS, getCharacter, releaseHeroes } from "../player/characterDefs.js";
import { Analytics } from "../systems/analytics.js";
import { Leaderboard } from "../online/leaderboard.js";

const CACHE_KEY = "glydrift.seasons.v1";
const DAY = 86400000;

let config = SEASON_DEFAULTS;
let source = "built-in";
let nowOverride = null; // test builds: ?seasonNow=2026-12-05

const hexNum = (h, fb = 0xffffff) => {
  const n = typeof h === "number" ? h : Number.parseInt(String(h || "").replace("#", ""), 16);
  return Number.isFinite(n) ? n : fb;
};

/** Drop anything a remote config gets wrong instead of crashing the game. */
function validSeason(s) {
  if (!s || typeof s.id !== "string" || !s.name) return false;
  const a = Date.parse(s.start);
  const b = Date.parse(s.end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return false;
  if (!Array.isArray(s.pass?.tiers) || !s.pass.tiers.length) return false;
  const heroOk = (id) => CHARACTERS.some((c) => c.id === id);
  const itemOk = (id) => COSMETICS.some((c) => c.id === id);
  if (s.featuredHero && !heroOk(s.featuredHero)) return false;
  // a reward the app doesn't know becomes coins, so tier numbers never shift
  const ok = (r) =>
    r &&
    (r.coins > 0 ||
      r.pod ||
      r.shards > 0 ||
      r.xpBoost?.mul > 1 ||
      (r.item && itemOk(r.item)) ||
      (r.hero && heroOk(r.hero)));
  s.pass.tiers = s.pass.tiers.map((r) => (ok(r) ? r : { coins: 100 }));
  if (!Array.isArray(s.pass.plus)) s.pass.plus = [];
  s.event ||= { name: s.name, challenges: [], shopItems: [] };
  // a malformed challenge would crash the end of a run: keep only well-formed ones
  s.event.challenges = (s.event.challenges || []).filter(
    (c) =>
      c?.id &&
      c.metric &&
      (c.type === "collect"
        ? Array.isArray(c.values) && c.values.length > 0
        : (c.type === "count" || c.type === "best") && Number.isFinite(c.value) && c.value > 0),
  );
  for (const c of s.event.challenges) {
    c.reward ||= {};
    c.reward.coins = Math.max(0, Math.floor(Number(c.reward.coins) || 0));
    c.reward.xp = Math.max(0, Math.floor(Number(c.reward.xp) || 0));
  }
  s.event.shopItems = (s.event.shopItems || []).filter(itemOk);
  return s.pass.tiers.length > 0;
}

function useConfig(cfg, from) {
  if (!cfg || !Array.isArray(cfg.seasons)) return false;
  const seasons = JSON.parse(JSON.stringify(cfg.seasons)).filter(validSeason);
  if (!seasons.length) return false;
  seasons.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  config = { ...cfg, seasons };
  source = from;
  // a season's heroes come out of storage when it starts (and stay out)
  const now = Seasons.now();
  for (const s of seasons)
    if (Date.parse(s.start) <= now)
      releaseHeroes([s.featuredHero, ...s.pass.tiers.map((r) => r.hero)].filter(Boolean));
  return true;
}

function rec(id) {
  const s = Save.data;
  s.seasons ||= {};
  const r = (s.seasons[id] ||= {});
  // fill anything missing (older or partial saves) so a run can never crash on it
  r.xp ||= 0;
  r.claimed ||= {};
  r.started ??= false;
  r.heroSeen ??= false;
  r.recapShown ??= false;
  r.stats = { runs: 0, best: 0, coins: 0, meters: 0, ...(r.stats || {}) };
  r.ev ||= {};
  r.ev.count ||= {};
  r.ev.best ||= {};
  r.ev.sets ||= {};
  r.ev.done ||= {};
  r.autoClaimed ??= null;
  return r;
}

/** The numbers a run contributes to event challenges. */
function runMetrics(run) {
  return {
    runs: 1,
    score: run.score || 0,
    meters: Math.floor(run.distance || 0),
    nearMiss: run.nearMiss || 0,
    coins: run.coins || 0,
    reachedAbyss: run.abyssM > 0 ? 1 : 0,
    abyssM: Math.floor(run.abyssM || 0),
    reachedPrism: run.prismM > 0 ? 1 : 0,
    prismM: Math.floor(run.prismM || 0),
    prismClear: run.prismClear || 0,
    abyssClear: run.abyssClear || 0,
    abyssKiller: run.killedIn === "abyss" ? run.killedBy : null,
  };
}

export const Seasons = {
  now() {
    return nowOverride ?? Date.now();
  },
  setNow(t) {
    nowOverride = t;
    useConfig(config, source);
  },
  get source() {
    return source;
  },
  all() {
    return config.seasons;
  },
  byId(id) {
    return config.seasons.find((s) => s.id === id) || null;
  },
  /** The live season, or null between seasons. */
  active() {
    const t = Seasons.now();
    return config.seasons.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end)) || null;
  },
  next() {
    const t = Seasons.now();
    return config.seasons.find((s) => Date.parse(s.start) > t) || null;
  },
  msLeft(s = Seasons.active()) {
    return s ? Math.max(0, Date.parse(s.end) - Seasons.now()) : 0;
  },
  /** "12d 4h" / "5h 20m" countdown text. */
  countdown(s = Seasons.active()) {
    const ms = Seasons.msLeft(s);
    const d = Math.floor(ms / DAY);
    const h = Math.floor((ms % DAY) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  },
  colors(s = Seasons.active()) {
    const t = s?.theme || {};
    return {
      primary: hexNum(t.primary, 0xc8102e),
      accent: hexNum(t.accent, 0xff3a4a),
      dark: hexNum(t.dark, 0x14020a),
      home: t.home || "crimson",
      pulse: t.pulse || "heartbeat",
    };
  },
  record: rec,

  /** Launch: use the cached remote config, then refresh it from Supabase in the background. */
  init() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached) useConfig(cached, "cached");
    } catch {
      /* no cache */
    }
    if (!useConfig(config, source)) useConfig(SEASON_DEFAULTS, "built-in");
    setSeasonItemCheck((c) => !c.season || Seasons.active()?.event.shopItems.includes(c.id));
    if (!TEST.offline) Seasons.refresh();
  },

  /**
   * Fetch the live config. First Supabase (table season_config, row "live"), then the
   * seasons.json published next to the game on the website. Safe to fail (offline / not set up).
   */
  async refresh() {
    const apply = (cfg, from) => {
      if (!useConfig(cfg, from)) return false;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
      } catch {
        /* storage full / private mode */
      }
      return true;
    };
    try {
      const sb = await Leaderboard.client();
      const { data, error } = await sb
        .from("season_config")
        .select("data")
        .eq("id", "live")
        .maybeSingle();
      if (!error && data?.data && apply(data.data, "remote")) return true;
    } catch {
      /* not set up yet / offline */
    }
    try {
      const res = await fetch(`./seasons.json?t=${Math.floor(Date.now() / 600000)}`, {
        cache: "no-store",
      });
      if (res.ok) return apply(await res.json(), "website");
    } catch {
      /* offline */
    }
    return false;
  },

  /** Price of a season's featured hero once its season has ended (else 0). */
  afterPrice(heroId) {
    const t = Seasons.now();
    const s = config.seasons.find((x) => x.featuredHero === heroId && Date.parse(x.end) <= t);
    return s ? s.heroPriceAfter || 12000 : 0;
  },

  /** After every run: season stats + event challenges. Returns challenges completed. */
  onRun(run) {
    const s = Seasons.active();
    if (!s) return [];
    const r = rec(s.id);
    const m = runMetrics(run);
    r.stats.runs += 1;
    r.stats.best = Math.max(r.stats.best, m.score);
    r.stats.coins += m.coins;
    r.stats.meters += m.meters;
    const done = [];
    for (const c of s.event.challenges) {
      if (r.ev.done[c.id]) continue;
      const v = m[c.metric];
      let ok = false;
      if (c.type === "count") {
        r.ev.count[c.id] = (r.ev.count[c.id] || 0) + (Number(v) || 0);
        ok = r.ev.count[c.id] >= c.value;
      } else if (c.type === "best") {
        r.ev.best[c.id] = Math.max(r.ev.best[c.id] || 0, Number(v) || 0);
        ok = r.ev.best[c.id] >= c.value;
      } else if (c.type === "collect") {
        const set = (r.ev.sets[c.id] ||= []);
        if (v && c.values.includes(v) && !set.includes(v)) set.push(v);
        ok = c.values.every((x) => set.includes(x));
      }
      if (ok) {
        r.ev.done[c.id] = true;
        const reward = c.reward || {};
        if (reward.coins) Save.data.coins += reward.coins;
        done.push(c);
        Analytics.log("season_event_challenge_completed", { season: s.id, challenge: c.id });
      }
    }
    return done;
  },

  /** Progress toward one event challenge, 0..1, plus a short label. */
  challengeProgress(s, c) {
    const r = rec(s.id);
    if (r.ev.done[c.id]) return { frac: 1, label: "DONE" };
    if (c.type === "count") {
      const v = r.ev.count[c.id] || 0;
      return { frac: Math.min(1, v / c.value), label: `${Math.min(v, c.value)}/${c.value}` };
    }
    if (c.type === "best") {
      const v = r.ev.best[c.id] || 0;
      return { frac: Math.min(1, v / c.value), label: `${Math.min(v, c.value)}/${c.value}` };
    }
    const set = r.ev.sets[c.id] || [];
    return { frac: set.length / c.values.length, label: `${set.length}/${c.values.length}` };
  },

  /**
   * Called on the home screen: marks a new season as started (analytics), and wraps up
   * ended seasons — every unlocked-but-unclaimed tier is auto-claimed and a recap is
   * returned (once). The caller shows the recap; the pass then starts fresh next season.
   */
  housekeeping(claimTier) {
    const out = { started: null, recaps: [] };
    const now = Seasons.now();
    const active = Seasons.active();
    if (active) {
      const r = rec(active.id);
      if (!r.started) {
        r.started = true;
        out.started = active;
        Analytics.log("season_started", { season: active.id });
      }
    }
    for (const s of config.seasons) {
      if (!Save.data.seasons?.[s.id]) continue;
      const r = rec(s.id); // filled in if partial
      if (r.recapShown || Date.parse(s.end) > now) continue;
      if (!r.started && !r.xp) continue;
      const tierXp = s.pass.tierXp || 400;
      const unlocked = Math.min(s.pass.tiers.length, Math.floor(r.xp / tierXp));
      const got = [];
      for (let i = 0; i < unlocked; i++)
        if (!r.claimed[i]) {
          const res = claimTier(s, r, i);
          if (res) got.push(res);
        }
      r.recapShown = true;
      r.autoClaimed = got.length;
      out.recaps.push({
        season: s,
        tiers: unlocked,
        total: s.pass.tiers.length,
        stats: { ...r.stats },
        challenges: s.event.challenges.filter((c) => r.ev.done[c.id]).length,
        challengeTotal: s.event.challenges.length,
        heroes: s.pass.tiers
          .slice(0, unlocked)
          .filter((t) => t.hero)
          .map((t) => getCharacter(t.hero)),
        autoClaimed: got,
      });
    }
    Save.write();
    return out;
  },

  /** True once the featured hero has been shown to this player this season. */
  needsHeroReveal() {
    const s = Seasons.active();
    return !!(s?.featuredHero && !rec(s.id).heroSeen);
  },
  markHeroSeen() {
    const s = Seasons.active();
    if (!s) return;
    rec(s.id).heroSeen = true;
    Save.write();
    Analytics.log("new_hero_viewed", { season: s.id, hero: s.featuredHero });
  },
  /** Season shop items that are on sale right now. */
  shopItems() {
    return (Seasons.active()?.event.shopItems || []).map(getCosmetic);
  },
};
