// LEADERBOARDS from real account data (D1 users.progress, written only by the server):
//   GET /api/race/boards?track=<id>   (Authorization: Bearer <token> optional: adds "you")
//     { ranked: [{pos, name, rp, label, tier}],          the top racers on the ranked ladder
//       track, laps: [{pos, name, lap}],                  best lap on that track (any race mode)
//       me: {rp, label, rankPos, lap, lapPos} | null,     your own place (guests too: counted
//                                                         among registered racers, never listed)
//       at }
// Only registered usernames are ever shown (guests have no public name). Each board is cached
// per isolate for BOARD_TTL_MS so a busy lobby costs a few D1 reads a minute. The indexes in
// migrations/0002_boards.sql (also made here, IF NOT EXISTS) keep the sorts off a full scan.
import { userFromToken, ensureSchema } from './accounts.js';
import { TRACK_IDS } from '../public/race/tracks.js';
import { rankInfo, rkOf } from '../public/race/ranked.js';

export const BOARD_TTL_MS = 60_000;
export const BOARD_SIZE = 20;
const RP = "CAST(json_extract(progress, '$.race.rk.rp') AS INTEGER)";
const LAP = (track) => `json_extract(progress, '$.race.bestLap.${track}')`; // (track is one of TRACK_IDS: never user text)
export const BOARD_INDEXES = [
  `CREATE INDEX IF NOT EXISTS users_rank_rp ON users(${RP})`,
  ...TRACK_IDS.map((t) => `CREATE INDEX IF NOT EXISTS users_lap_${t} ON users(${LAP(t)})`),
];

const json = (data, status = 200, cache = 'no-store') => Response.json(data, { status, headers: { 'cache-control': cache } });
let cache = new Map(), ready = false;
export function resetBoards() { cache = new Map(); ready = false; }

async function schema(db) {
  if (ready) return;
  await ensureSchema(db);
  for (const sql of BOARD_INDEXES) await db.prepare(sql).run();
  ready = true;
}
async function cached(key, now, fn) {
  const c = cache.get(key);
  if (c && now - c.at < BOARD_TTL_MS) return c.v;
  const v = await fn();
  cache.set(key, { v, at: now });
  return v;
}
const rows = (r) => (r && r.results) || [];

async function rankedBoard(db) {
  const r = await db.prepare(`SELECT username, ${RP} AS rp FROM users WHERE username IS NOT NULL AND ${RP} > 0 ORDER BY ${RP} DESC, updated ASC LIMIT ${BOARD_SIZE}`).all();
  return rows(r).map((x, i) => { const I = rankInfo(Number(x.rp)); return { pos: i + 1, name: x.username, rp: Number(x.rp), label: I.label, tier: I.tier.id }; });
}
async function lapBoard(db, track) {
  const r = await db.prepare(`SELECT username, ${LAP(track)} AS lap FROM users WHERE username IS NOT NULL AND ${LAP(track)} > 0 AND typeof(${LAP(track)}) IN ('real', 'integer') ORDER BY ${LAP(track)} ASC, updated ASC LIMIT ${BOARD_SIZE}`).all();
  return rows(r).map((x, i) => ({ pos: i + 1, name: x.username, lap: Number(x.lap) }));
}
// your own place: 1 + the registered racers strictly ahead of you
async function mine(db, u, track) {
  let p = {};
  try { p = JSON.parse(u.progress || '{}') || {}; } catch {}
  const rp = rkOf(p).rp, l = p.race && p.race.bestLap && p.race.bestLap[track], lap = typeof l === 'number' && l > 0 ? l : null;
  const ahead = async (sql, v) => Number((await db.prepare(sql).bind(v).first())?.n || 0);
  const rankPos = rp > 0 ? 1 + await ahead(`SELECT COUNT(*) AS n FROM users WHERE username IS NOT NULL AND ${RP} > ?`, rp) : null;
  const lapPos = lap ? 1 + await ahead(`SELECT COUNT(*) AS n FROM users WHERE username IS NOT NULL AND ${LAP(track)} > 0 AND typeof(${LAP(track)}) IN ('real', 'integer') AND ${LAP(track)} < ?`, lap) : null;
  return { rp, label: rankInfo(rp).label, rankPos, lap, lapPos, name: u.username || null };
}

export async function handleBoards(req, env, now = Date.now()) {
  const url = new URL(req.url), db = env.DB;
  if (url.pathname !== '/api/race/boards' || req.method !== 'GET') return json({ error: 'not found' }, 404);
  const track = TRACK_IDS.includes(url.searchParams.get('track')) ? url.searchParams.get('track') : TRACK_IDS[0];
  if (!db) return json({ ranked: [], track, laps: [], me: null, at: now });
  try {
    await schema(db);
    const ranked = await cached('rank', now, () => rankedBoard(db));
    const laps = await cached('lap:' + track, now, () => lapBoard(db, track));
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const u = tok ? await userFromToken(db, tok) : null;
    return json({ ranked, track, laps, me: u ? await mine(db, u, track) : null, at: now });
  } catch (e) {
    console.log('boards error', e && e.message);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
