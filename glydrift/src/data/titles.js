// TITLES: a line under your name on the leaderboard, your profile, the game over screen and
// the share card. Earned from achievements, distance leagues, seasons, the Drift Pass and
// completed collections; Drift Pass+ titles are animated (shimmer, glow or colour shift) and
// can only come from the paid track. A title is pure decoration: it never changes gameplay.
import { Save } from "./save.js";
import { COLLECTIONS } from "./cosmetics.js";
import { plusEntitled } from "./plusGate.js";

/** style: plain | shimmer | glow | shift (the animated ones are Drift Pass+ only). */
export const TITLES = [
  // ---- achievements
  {
    id: "t_daredevil",
    name: "Daredevil",
    source: "achievement",
    req: { ach: "daredevil" },
    color: "#ff4fd8",
    how: "10 near-misses in one run",
  },
  {
    id: "t_sunsurfer",
    name: "Sun Surfer",
    source: "achievement",
    req: { ach: "solar" },
    color: "#ffb020",
    how: "Reach the Solar Storm",
  },
  {
    id: "t_abyss",
    name: "Abyss Diver",
    source: "achievement",
    req: { ach: "abyss" },
    color: "#ff3a4a",
    how: "Reach the Abyss",
  },
  {
    id: "t_marathon",
    name: "Marathon Flyer",
    source: "achievement",
    req: { ach: "marathon" },
    color: "#39ff88",
    how: "Fly 2500m in one run",
  },
  {
    id: "t_laser",
    name: "Laser Dancer",
    source: "achievement",
    req: { ach: "laser" },
    color: "#3ef4ff",
    how: "Pass 15 lasers in one run",
  },
  {
    id: "t_portal",
    name: "Portal Hopper",
    source: "achievement",
    req: { ach: "portal" },
    color: "#b45cff",
    how: "6 portals in one run",
  },
  {
    id: "t_hoarder",
    name: "Stardust Hoarder",
    source: "achievement",
    req: { ach: "rich" },
    color: "#ffd23f",
    how: "Collect 1000 coins in total",
  },
  {
    id: "t_devoted",
    name: "Devoted",
    source: "achievement",
    req: { ach: "streak" },
    color: "#ff8a1a",
    how: "7-day login streak",
  },
  {
    id: "t_daily",
    name: "Daily Driver",
    source: "achievement",
    req: { ach: "daily5" },
    color: "#7ae82a",
    how: "Play 5 Daily Challenges",
  },
  {
    id: "t_ascendant",
    name: "Ascendant",
    source: "achievement",
    req: { ach: "level10" },
    color: "#bfe8ff",
    how: "Reach player level 10",
  },
  // ---- distance leagues (your farthest single run)
  {
    id: "t_bronze",
    name: "Bronze League",
    source: "league",
    req: { meters: 500 },
    color: "#d8894a",
    how: "Fly 500m in one run",
  },
  {
    id: "t_silver",
    name: "Silver League",
    source: "league",
    req: { meters: 1500 },
    color: "#dfe8f5",
    how: "Fly 1500m in one run",
  },
  {
    id: "t_gold",
    name: "Gold League",
    source: "league",
    req: { meters: 3000 },
    color: "#ffd23f",
    how: "Fly 3000m in one run",
  },
  {
    id: "t_diamond",
    name: "Diamond League",
    source: "league",
    req: { meters: 6000 },
    color: "#9fe8ff",
    how: "Fly 6000m in one run",
  },
  {
    id: "t_legend",
    name: "Legend",
    source: "league",
    req: { meters: 10000 },
    color: "#ff9ce8",
    how: "Fly 10000m in one run",
  },
  // ---- seasons (that season's pass tier)
  {
    id: "t_s1_riser",
    name: "Abyss Riser",
    source: "season",
    req: { season: "s1", tier: 10 },
    color: "#ff3a4a",
    how: "Season 1: reach pass tier 10",
  },
  {
    id: "t_s1_veteran",
    name: "Abyss Rising Veteran",
    source: "season",
    req: { season: "s1", tier: 50 },
    color: "#c8102e",
    how: "Season 1: finish the pass",
  },
  // ---- Drift Pass (the free track between seasons)
  {
    id: "t_drifter",
    name: "Drifter",
    source: "pass",
    req: { passTier: 15 },
    color: "#3ef4ff",
    how: "Finish the classic Drift Pass",
  },
  // ---- collections (own every piece of a set)
  ...COLLECTIONS.map((c) => ({
    id: `t_${c.id}`,
    name: c.title,
    source: "collection",
    req: { set: c.id },
    color: `#${c.glow.toString(16).padStart(6, "0")}`,
    how: `Complete the ${c.name}`,
  })),
  // ---- events (only while the event runs)
  {
    id: "t_founder",
    name: "Founding Drifter",
    source: "event",
    color: "#ffd23f",
    how: "Save your progress to an account during the move to glydrift.com",
  },
  // ---- Drift Pass+ exclusives (animated), granted only by the paid track
  {
    id: "p_abysslord",
    name: "ABYSS LORD",
    source: "plus",
    style: "shimmer",
    color: "#ff3a4a",
    how: "Drift Pass+ · Season 1, tier 7",
  },
  {
    id: "p_neonroyal",
    name: "NEON ROYALTY",
    source: "plus",
    style: "shift",
    color: "#ff4fd8",
    how: "Drift Pass+ · Season 1, tier 27",
  },
  {
    id: "p_starborn",
    name: "STARBORN",
    source: "plus",
    style: "glow",
    color: "#ffd23f",
    how: "Drift Pass+ · Season 1, tier 42",
  },
  // Season 1 "Abyss Rising" additions (glowing, animated; paid track only)
  {
    id: "p_riftdiver",
    name: "RIFT DIVER",
    source: "plus",
    style: "shimmer",
    color: "#3ef4ff",
    how: "Drift Pass+ · Season 1, tier 4",
  },
  {
    id: "p_abysswalker",
    name: "ABYSS WALKER",
    source: "plus",
    style: "glow",
    color: "#ff3a4a",
    how: "Drift Pass+ · Season 1, tier 13",
  },
  {
    id: "p_voidtouched",
    name: "VOID TOUCHED",
    source: "plus",
    style: "shift",
    color: "#b45cff",
    how: "Drift Pass+ · Season 1, tier 28",
  },
  {
    id: "p_s1founder",
    name: "SEASON 1 FOUNDER",
    source: "plus",
    style: "glow",
    color: "#ffd23f",
    how: "Drift Pass+ · Season 1, tier 43",
  },
];

// LEVEL MODE: clearing a realm's boss level (levels 10, 20, 30, 40, 50) earns its title
TITLES.push(
  {
    id: "lv_void",
    name: "Void Pilot",
    source: "levels",
    color: "#3ef4ff",
    how: "Beat level 10 (Neon Void boss)",
  },
  {
    id: "lv_solar",
    name: "Storm Chaser",
    source: "levels",
    color: "#ff8a2a",
    how: "Beat level 20 (Solar Storm boss)",
  },
  {
    id: "lv_frozen",
    name: "Frost Runner",
    source: "levels",
    color: "#9ad8ff",
    how: "Beat level 30 (Frozen Nebula boss)",
  },
  {
    id: "lv_glitch",
    name: "Glitch Breaker",
    source: "levels",
    color: "#39ff88",
    how: "Beat level 40 (Glitch Realm boss)",
  },
  {
    id: "lv_abyss",
    name: "ABYSS CONQUEROR",
    source: "levels",
    style: "glow",
    color: "#ff3a4a",
    how: "Beat level 50, the final boss",
  },
  {
    id: "lv_starchaser",
    name: "Star Chaser",
    source: "levels",
    color: "#ffd23f",
    how: "Earn 75 level stars",
  },
  {
    id: "lv_perfect",
    name: "PERFECT PILOT",
    source: "levels",
    style: "glow",
    color: "#ffd23f",
    how: "Earn all 150 level stars",
  },
);

// HEROES: titles earned with one hero
TITLES.push({
  id: "h_showoff",
  name: "Show-Off",
  source: "hero",
  req: { stat: "dawsonBests", value: 10 },
  color: "#18c8b8",
  how: "10 new bests with DAWSON",
});

export const TITLE_SOURCES = {
  achievement: "ACHIEVEMENTS",
  league: "DISTANCE LEAGUES",
  season: "SEASONS",
  pass: "DRIFT PASS",
  collection: "COLLECTIONS",
  plus: "DRIFT PASS+",
  event: "EVENTS",
  levels: "LEVELS",
  hero: "HEROES",
};

export const getTitle = (id) => TITLES.find((t) => t.id === id) || null;

function state() {
  const s = Save.data;
  s.titles ||= { owned: {}, equipped: null };
  s.titles.owned ||= {};
  return s.titles;
}

/** Does the save meet this (earnable) title's requirement? */
function earned(t, s) {
  const r = t.req || {};
  if (r.ach) return !!s.achievements?.[r.ach];
  if (r.meters) return (s.stats?.maxDistance || 0) >= r.meters;
  if (r.season) {
    const rec = s.seasons?.[r.season];
    return !!rec && (rec.xp || 0) >= r.tier * (rec.tierXp || 450);
  }
  if (r.passTier) return (s.pass?.xp || 0) >= r.passTier * 400;
  if (r.stat) return (s.stats?.[r.stat] || 0) >= r.value;
  if (r.set) {
    const set = COLLECTIONS.find((c) => c.id === r.set);
    return !!set && set.items.every((id) => s.cos?.owned?.[id]);
  }
  return false;
}

export const Titles = {
  owns(id) {
    if (!state().owned[id]) return false;
    // Drift Pass+ titles also need the season's verified purchase (all "p_" titles are Season 1)
    return getTitle(id)?.source !== "plus" || plusEntitled("s1");
  },
  /** Grant every title the save has earned. Returns the ids that are new. */
  sync() {
    const s = Save.data;
    const st = state();
    const fresh = [];
    for (const t of TITLES) {
      if (t.source === "plus" || st.owned[t.id]) continue;
      if (earned(t, s)) {
        st.owned[t.id] = true;
        fresh.push(t.id);
      }
    }
    // a collection title that was equipped the old way carries over
    const oldSet = s.cos?.equipped?.title;
    if (!st.equipped && oldSet && st.owned[`t_${oldSet}`]) st.equipped = `t_${oldSet}`;
    if (fresh.length) Save.write();
    return fresh;
  },
  /** Drift Pass+ rewards and events (and only those) grant the exclusive titles. */
  grant(id) {
    if (!getTitle(id)) return false;
    state().owned[id] = true;
    Save.write();
    return true;
  },
  equippedId() {
    const id = state().equipped;
    return id && this.owns(id) ? id : null;
  },
  equipped() {
    return getTitle(this.equippedId());
  },
  equip(id) {
    if (id !== null && !this.owns(id)) return false;
    state().equipped = id;
    Save.write();
    return true;
  },
  /** Ready-made rows for the Titles screen, grouped by source. */
  catalog() {
    return TITLES.map((t) => ({
      ...t,
      owned: this.owns(t.id),
      equipped: this.equippedId() === t.id,
    }));
  },
};

// test builds only
import { TEST } from "../systems/testFlags.js";
if (TEST.on && typeof window !== "undefined") window.__glyTitles = Titles;
