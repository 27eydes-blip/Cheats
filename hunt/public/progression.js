// Progression rules shared by the server (authoritative, D1) and the client (display).
import { BRAWLER_IDS } from './shared.js';

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
export function xpFor({ rank, players, kills, bounty, won }) {
  return 40 + 10 * kills + 2 * bounty + (won || rank === 1 ? 50 : rank <= 3 ? 20 : 0) + (players > 1 ? 0 : 0);
}
// level L needs 100*L more XP than level L-1
export function levelInfo(xp) {
  let lvl = 1, need = 100, left = xp;
  while (left >= need) { left -= need; lvl++; need = 100 * lvl; }
  return { level: lvl, into: left, need };
}

// ---------- daily missions: 3 a day, same for everyone, reset at 00:00 UTC ----------
export const MISSION_POOL = [
  { id: 'play3', text: 'Play 3 matches', stat: 'play', goal: 3, reward: { coins: 60 } },
  { id: 'win1', text: 'Win a match', stat: 'win', goal: 1, reward: { gems: 5 } },
  { id: 'ko8', text: 'Get 8 knockouts', stat: 'kills', goal: 8, reward: { coins: 80 } },
  { id: 'bounty10', text: 'Earn 10 bounty', stat: 'bounty', goal: 10, reward: { gems: 4 } },
  { id: 'top3x2', text: 'Finish top 3 twice', stat: 'top3', goal: 2, reward: { coins: 70 } },
  { id: 'ko3one', text: 'Get 3 KOs in one match', stat: 'bestKills', goal: 3, reward: { gems: 3 } },
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
  return { progress: p };
}

// apply one match result; returns {progress, delta, xp}
export function applyMatch(p, r) {
  p = normalize(p);
  const before = p.trophies[r.brawler] | 0;
  const delta = trophyDelta(r);
  p.trophies[r.brawler] = Math.max(0, before + delta);
  const xp = xpFor(r);
  p.xp += xp;
  p.games++;
  if (r.won || r.rank === 1) p.wins++;
  p.pass.xp = (p.pass.xp || 0) + xp;
  const d = ensureDaily(p, r.day ?? dayIndex()), add = (k, v) => { d.prog[k] = (d.prog[k] || 0) + v; };
  add('play', 1); add('kills', r.kills | 0); add('bounty', r.bounty | 0);
  if (r.won || r.rank === 1) add('win', 1);
  if (r.rank <= 3 && r.won !== false) add('top3', 1);
  d.prog.bestKills = Math.max(d.prog.bestKills || 0, r.kills | 0);
  return { progress: p, delta: p.trophies[r.brawler] - before, xp };
}
