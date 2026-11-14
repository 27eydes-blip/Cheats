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
  return { v: 1, xp: 0, coins: 200, trophies: Object.fromEntries(BRAWLER_IDS.map((b) => [b, 0])), claimed: [], owned: [], equipped: {}, pass: { premium: false, claimed: [] }, games: 0, wins: 0 };
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
  return { progress: p, delta: p.trophies[r.brawler] - before, xp };
}
