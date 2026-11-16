// Progression rules shared by the server (authoritative, D1) and the client (display).
import { BRAWLER_IDS, WORLDS, worldId, worldsInDisplayOrder, ZONES, own } from './shared.js';
import { WEAPONS, WEAPON_IDS, perksFor, masteryInfo, masteryXp, masteryBadge, MASTERY_SKINS } from './weapons.js';
import { LEVEL_TITLES, EMOTES, SKINS, rewardSource } from './catalog.js';
import { powerSetup } from './power.js';

export const ROAD_STEP = 100;
// Trophy road: a free reward every 100 total trophies. Item ids live in public/catalog.js.
export const ROAD = [
  { at: 100, coins: 150 }, { at: 200, title: 'tracker' }, { at: 300, coins: 200 }, { at: 400, fx: 'sparks' },
  { at: 500, title: 'bounty_hunter' }, { at: 600, coins: 300 }, { at: 700, skin: 'volt_storm' }, { at: 800, coins: 300 },
  { at: 900, fx: 'stars' }, { at: 1000, title: 'apex' },
];
export const roadReward = (at) => ROAD.find((r) => r.at === at) || (at % ROAD_STEP === 0 && at > 0 ? { at, coins: 100 } : null);

export function newProgress() {
  return { v: 1, xp: 0, coins: 200, gems: 20, daily: null, trophies: Object.fromEntries(BRAWLER_IDS.map((b) => [b, 0])), claimed: [], owned: [], equipped: {}, pass: { premium: false, claimed: [] }, games: 0, wins: 0 };
}
// fill in anything missing (old saves, new brawlers) — never drops data
export function normalize(p) {
  const n = newProgress();
  p = p && typeof p === 'object' ? p : {};
  const out = { ...n, ...p };
  out.trophies = { ...n.trophies, ...(p.trophies || {}) };
  out.pass = { ...n.pass, ...(p.pass || {}) };
  for (const k of ['claimed', 'owned']) out[k] = Array.isArray(p[k]) ? p[k] : [];
  out.mastery = p.mastery && typeof p.mastery === 'object' ? p.mastery : {};
  out.perks = p.perks && typeof p.perks === 'object' ? p.perks : {};
  out.loadout = p.loadout && typeof p.loadout === 'object' ? p.loadout : { w2: null };
  for (const k of ['power', 'gadget', 'star', 'modes']) out[k] = p[k] && typeof p[k] === 'object' ? p[k] : {};
  if (typeof out.kills !== 'number') out.kills = 0;
  // free skins (the Classic looks) are owned by everyone, old saves included
  for (const b of BRAWLER_IDS) if (!out.owned.includes(b + '_classic')) out.owned = [...out.owned, b + '_classic'];
  out.equipped = p.equipped && typeof p.equipped === 'object' ? p.equipped : {};
  if (typeof out.gems !== 'number') out.gems = 20;
  return out;
}
export const totalTrophies = (p) => Object.values(p.trophies || {}).reduce((s, v) => s + (v | 0), 0);

// win = +8, top 3 = +4, bottom half = -2 (never below 0), otherwise 0
export function trophyDelta({ rank, players, won }) {
  if (won === null) return 0; // team draw
  if (won === true || rank === 1) return 8;
  if (won === false && players <= 6) return -2; // team loss
  if (rank <= 3) return 4;
  if (rank > players / 2) return -2;
  return 0;
}
// team modes say won true/false/null (null = draw); FFA modes leave it undefined and rank 1 wins
export const isWin = ({ rank, won }) => won === true || (won === undefined && rank === 1);
// MATCH PAY, every number in one place. Most of it is per minute played (secs: until you were
// knocked out in Showdown / Big Hunt, the whole match in respawn modes), so XP and coins per minute
// come out about even in every mode (test/economy.test.js plays them all). Kills, assists and steals
// are capped, and bounty itself pays nothing: it snowballs much faster in some modes than others.
export const PAY = {
  xp: { base: 10, perMin: 64, kill: 5, assist: 2, steal: 3, place: [40, 16, 6] },
  coins: { base: 1, perMin: 13, kill: 1, place: [10, 5, 2] },
  caps: { kill: 12, assist: 12, steal: 6 }, maxSecs: 600, defaultSecs: 120,
};
const minutes = (secs) => Math.max(0, Math.min(PAY.maxSecs, Number.isFinite(secs) ? secs : PAY.defaultSecs)) / 60;
// [win, top 3, top half] -> index, or -1
const placeOf = ({ rank, players, won }) => (isWin({ rank, won }) ? 0 : rank <= 3 ? 1 : rank <= Math.ceil((players || 1) / 2) ? 2 : -1);
const cap = (v, k) => Math.max(0, Math.min(PAY.caps[k], v | 0));
// match XP: time played, kills, assists, bounty steals, placement
export function xpFor(r) {
  const X = PAY.xp, pl = placeOf(r);
  return Math.round(X.base + X.perMin * minutes(r.secs) + X.kill * cap(r.kills, 'kill') + X.assist * cap(r.assists, 'assist') + X.steal * cap(r.steals, 'steal') + (pl >= 0 ? X.place[pl] : 0));
}
export const MISSION_XP = 40;
export function matchCoins(r) {
  const C = PAY.coins, pl = placeOf(r);
  return Math.round(C.base + C.perMin * minutes(r.secs) + C.kill * Math.min(10, cap(r.kills, 'kill')) + (pl >= 0 ? C.place[pl] : 0));
}
// ACCOUNT LEVEL 1-100. Level L -> L+1 needs 80 + 12(L-1) XP: about 2 matches early on,
// around level 40 after ~100 matches, level 100 after ~500.
export const MAX_LEVEL = 100;
export const levelNeed = (L) => 80 + 12 * (L - 1);
export function levelInfo(xp = 0) {
  let lvl = 1, left = xp;
  while (lvl < MAX_LEVEL && left >= levelNeed(lvl)) { left -= levelNeed(lvl); lvl++; }
  if (lvl >= MAX_LEVEL) return { level: MAX_LEVEL, into: levelNeed(MAX_LEVEL), need: levelNeed(MAX_LEVEL), max: true };
  return { level: lvl, into: left, need: levelNeed(lvl) };
}
// THE LEVEL ROAD: a reward at every level. Coins always; plus weapons, emotes, skins and titles.
let LS = null; // (built on first use: catalog.js and this file import each other)
const levelSkin = (L) => (LS || (LS = Object.fromEntries(Object.entries(SKINS).filter(([, s]) => s.level).map(([k, s]) => [s.level, k]))))[L];
export function levelReward(L) {
  const r = { level: L, coins: 30 + L * 2 + (L % 10 === 0 ? 150 : 0) };
  const w = WEAPON_IDS.filter((id) => WEAPONS[id].unlock === L && L > 1);
  if (w.length) r.weapons = w;
  const e = EMOTES.filter((x) => x.level === L && L > 1).map((x) => x.id);
  if (e.length) r.emotes = e;
  if (levelSkin(L)) r.skin = levelSkin(L);
  if (LEVEL_TITLES[L]) r.title = LEVEL_TITLES[L];
  return r;
}
export const weaponUnlocked = (p, id) => !!own(WEAPONS, id) && (WEAPONS[id].unlock <= levelInfo(p.xp || 0).level);
// grant every level reward up to the current level (also catches old saves up, once)
export function grantLevels(p) {
  const L = levelInfo(p.xp).level, got = [];
  for (let l = (p.lvlClaimed || 1) + 1; l <= L; l++) {
    const r = levelReward(l);
    p.coins += r.coins;
    for (const id of [...(r.emotes || []), r.skin, r.title]) if (id && !p.owned.includes(id)) p.owned.push(id);
    got.push(r);
  }
  p.lvlClaimed = Math.max(p.lvlClaimed || 1, L);
  return got;
}
// what the match server lets this account bring in (checked server-side: locked weapons and
// perks you haven't earned are dropped)
export function loadoutFor(p) {
  p = normalize(p);
  const w2 = p.loadout?.w2 && weaponUnlocked(p, p.loadout.w2) ? p.loadout.w2 : null;
  const mast = w2 ? masteryInfo(own(p.mastery, w2) || 0).level : 0;
  const perks = w2 ? (Array.isArray(own(p.perks, w2)) ? p.perks[w2] : []).filter((id) => Object.entries(perksFor(w2)).some(([tier, o]) => mast >= +tier && o.some((x) => x.id === id))) : [];
  const emotes = EMOTES.map((e, i) => (e.level <= 1 || p.owned.includes(e.id) ? i : -1)).filter((i) => i >= 0);
  return { w2, perks, mastery: mast, badge: w2 ? masteryBadge(mast) : null, emotes, power: powerSetup(p) };
}
export { MASTERY_SKINS };

// ---------- daily missions: 3 a day, same for everyone, reset at 00:00 UTC ----------
export const MISSION_POOL = [
  { id: 'play3', text: 'Play 3 races', stat: 'play', goal: 3, reward: { coins: 60 } },
  { id: 'win1', text: 'Win a race', stat: 'win', goal: 1, reward: { gems: 5 } },
  { id: 'ko8', text: 'Get 8 takedowns', stat: 'kills', goal: 8, reward: { coins: 80 } },
  { id: 'bounty10', text: 'Earn 10 bounty', stat: 'bounty', goal: 10, reward: { gems: 4 } },
  { id: 'top3x2', text: 'Finish top 3 twice', stat: 'top3', goal: 2, reward: { coins: 70 } },
  { id: 'ko3one', text: 'Get 3 takedowns in one race', stat: 'bestKills', goal: 3, reward: { gems: 3 } },
];
export const dayIndex = (now = Date.now()) => Math.floor(now / 864e5);
export const msToReset = (now = Date.now()) => 864e5 - (now % 864e5);
export function dailyMissions(day = dayIndex()) {
  const pool = MISSION_POOL.slice(), out = [];
  let s = (day * 2654435761) >>> 0;
  while (out.length < 3) { s = (s * 1103515245 + 12345) >>> 0; out.push(pool.splice(s % pool.length, 1)[0]); }
  return out;
}
export function ensureDaily(p, day = dayIndex()) {
  if (!p.daily || p.daily.day !== day) p.daily = { day, prog: {}, claimed: [] };
  return p.daily;
}
export function missionState(p, day = dayIndex()) {
  const d = p.daily && p.daily.day === day ? p.daily : { prog: {}, claimed: [] };
  return dailyMissions(day).map((m) => ({ ...m, have: Math.min(m.goal, d.prog[m.stat] || 0), done: (d.prog[m.stat] || 0) >= m.goal, claimed: d.claimed.includes(m.id) }));
}
export function claimMission(p, id, day = dayIndex()) {
  const m = missionState(p, day).find((q) => q.id === id);
  if (!m || !m.done || m.claimed) return { error: 'Not ready' };
  ensureDaily(p, day).claimed.push(id);
  if (m.reward.coins) p.coins += m.reward.coins;
  if (m.reward.gems) p.gems += m.reward.gems;
  p.xp += MISSION_XP; // missions count toward your account level too
  return { progress: p, levels: grantLevels(p) };
}

// apply one match result; returns {progress, delta, xp}
export function applyMatch(p, r) {
  p = normalize(p);
  // only real brawlers hold trophies (a made-up id must never become a trophy key)
  const tb = BRAWLER_IDS.includes(r.brawler) ? r.brawler : null;
  const before = tb ? p.trophies[tb] | 0 : 0;
  const delta = tb ? trophyDelta(r) : 0;
  if (tb) p.trophies[tb] = Math.max(0, before + delta);
  const xp = xpFor(r), lvBefore = levelInfo(p.xp).level;
  p.xp += xp;
  const levels = grantLevels(p);
  // COINS earned by playing (test currency; they buy brawler Power)
  const coins = matchCoins(r);
  p.coins += coins;
  // WEAPON MASTERY from damage + kills with each weapon this match
  const mast = [], wxp = [];
  for (const [id, s] of Object.entries(r.wstat || {})) {
    if (!own(WEAPONS, id) || !s) continue;
    const before = masteryInfo(p.mastery[id] || 0).level;
    wxp.push({ id, xp0: p.mastery[id] || 0, xp1: (p.mastery[id] || 0) + masteryXp(+s.d || 0, +s.k || 0) });
    p.mastery[id] = (p.mastery[id] || 0) + masteryXp(+s.d || 0, +s.k || 0);
    const after = masteryInfo(p.mastery[id]).level;
    if (after > before) mast.push({ id, level: after });
  }
  p.games++;
  if (isWin(r)) p.wins++;
  // lifetime stats for the profile page: totals and per mode
  p.kills = (p.kills | 0) + (r.kills | 0);
  const mk = typeof r.mode === 'string' && r.mode ? r.mode : 'quick';
  if (!own(p.modes, mk)) p.modes[mk] = { games: 0, wins: 0, top3: 0, kills: 0 };
  const md = p.modes[mk];
  md.games++; md.kills += r.kills | 0; if (isWin(r)) md.wins++; if (r.rank <= 3 && r.won !== false) md.top3++;
  p.pass.xp = (p.pass.xp || 0) + xp;
  const d = ensureDaily(p, r.day ?? dayIndex()), add = (k, v) => { d.prog[k] = (d.prog[k] || 0) + v; };
  add('play', 1); add('kills', r.kills | 0); add('bounty', r.bounty | 0);
  if (isWin(r)) add('win', 1);
  if (r.rank <= 3 && r.won !== false) add('top3', 1);
  d.prog.bestKills = Math.max(d.prog.bestKills || 0, r.kills | 0);
  wxp.sort((a, b) => b.xp1 - b.xp0 - (a.xp1 - a.xp0));
  return { progress: p, delta: tb ? p.trophies[tb] - before : 0, xp, coins, levels, mastery: mast, wxp, levelBefore: lvBefore };
}

// ---------------------------------------------------------------- client display helpers
// Reward items (level road, Trophy Road, Hunt Pass) are earned, not bought: the Locker shows a lock
// and where they come from. Returns a short tag ('LEVEL 15', 'ROAD 700', 'PASS 5', 'PREMIUM PASS 10')
// or null for an item that is only sold.
export function earnTag(id) {
  // one rule with the server: catalog.rewardSource is what makes priceOf() refuse to sell an item
  const src = rewardSource(id);
  if (!src) return null;
  return src.toUpperCase().replace(/^TROPHY ROAD /, 'ROAD ').replace(/^(HUNT|PREMIUM) PASS TIER /, (_, k) => (k === 'PREMIUM' ? 'PREMIUM PASS ' : 'PASS '));
}
// the same, as a sentence for a toast
export function earnHint(id, name) {
  const t = earnTag(id);
  if (!t) return `Buy ${name} in the Locker`;
  if (t.startsWith('LEVEL')) return `Reach level ${t.slice(6)} to unlock ${name}`;
  if (t.startsWith('ROAD')) return `Reach ${t.slice(5)} trophies on the Trophy Road to unlock ${name}`;
  return `${name} is a Hunt Pass reward (tier ${t.split(' ').pop()}${t.startsWith('PREMIUM') ? ', premium' : ''})`;
}

// This device's per-world stats (localStorage prefs). stats[worldId] = arena matches (Quick Hunt
// etc.): games, wins, KOs, best bounty. free[zoneWorldKey] = Free Play KOs and best bounty, the Hub
// included. Old saves wrote Hub kills to stats['-1'] (the Hub is not an arena world): move them over.
export function migrateLocalStats(prefs) {
  if (!prefs.stats || typeof prefs.stats !== 'object') prefs.stats = {};
  if (!prefs.free || typeof prefs.free !== 'object') prefs.free = {};
  const lost = prefs.stats['-1'];
  if (lost) {
    const h = freeStat(prefs, 'hub');
    h.kills += lost.kills | 0; h.best = Math.max(h.best, lost.best | 0);
    delete prefs.stats['-1'];
    return true;
  }
  return false;
}
export function arenaStat(prefs, worldKey) {
  const id = worldId(worldKey);
  if (id < 0) return { games: 0, wins: 0, kills: 0, best: 0 }; // not an arena: nothing to keep
  return (prefs.stats[id] ||= { games: 0, wins: 0, kills: 0, best: 0 });
}
export function freeStat(prefs, zoneWorldKey) { return (prefs.free[zoneWorldKey] ||= { kills: 0, best: 0 }); }
export function arenaStatRows(prefs) {
  const rows = worldsInDisplayOrder().map((w) => {
    const s = prefs.stats?.[w.id] || {};
    return `<tr><td>${w.name}</td><td>${s.games | 0}</td><td>${s.wins | 0}</td><td>${s.kills | 0}</td><td>★${s.best | 0}</td></tr>`;
  }).join('');
  return `<tr><th>World</th><th>Games</th><th>Wins</th><th>KOs</th><th>Best</th></tr>${rows}`;
}
export function freeStatRows(prefs) {
  // Free Play zones, the Hub first, then the outer zones in world display order
  const order = (k) => (k === 'hub' ? -1 : WORLDS[worldId(k)]?.order ?? 99);
  const zones = [...ZONES].sort((a, b) => order(a.world) - order(b.world));
  const rows = zones.map((z) => { const s = prefs.free?.[z.world] || {}; return `<tr><td>${z.name}</td><td>${s.kills | 0}</td><td>★${s.best | 0}</td></tr>`; }).join('');
  return `<tr><th>Zone</th><th>KOs</th><th>Best</th></tr>${rows}`;
}

// "Something new" dots. Armory: every unlocked weapon and every perk pick it has reached (by key);
// the lobby lights the dot while any key has not been seen in the Armory yet.
export function armoryKeys(p) {
  const out = [];
  for (const id of WEAPON_IDS) {
    if (!weaponUnlocked(p, id)) continue;
    out.push('w:' + id);
    const lv = masteryInfo(p.mastery?.[id] || 0).level;
    for (const tier of Object.keys(perksFor(id))) if (lv >= +tier) out.push(`p:${id}:${tier}`);
  }
  return out;
}
// seen list from storage; the first time there is none, everything you have now counts as seen
export function seenList(raw, now) {
  if (raw == null) return { list: now, fresh: true };
  try { const v = JSON.parse(raw); return { list: Array.isArray(v) ? v : now, fresh: !Array.isArray(v) }; } catch { return { list: now, fresh: true }; }
}
export const hasUnseen = (keys, seen) => { const s = new Set(seen); return keys.some((k) => !s.has(k)); };
