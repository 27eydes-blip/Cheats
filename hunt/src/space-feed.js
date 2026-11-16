// Live data for the lobby's news ticker (public/ui/space/ticker.js). Every number here is real:
//   GET  /api/space/feed   {online, top, records, at}
//        online   players with the game open in the last ONLINE_WINDOW_MS (null if unknown)
//        top      the registered racer with the most race wins {name, wins} (null if nobody yet)
//        records  Time Trial record per track [{track, name, time}] (registered racers only)
//   POST /api/space/ping   (Authorization: Bearer <session token>) "I am online"; the open lobby
//        sends one every PING_EVERY_MS while the page is visible. Answers {ok, online}.
// Results are cached per isolate so a busy lobby costs a few D1 reads a minute, not one per player.
// Guests have no public name, so only registered usernames are ever shown.
import { userFromToken, ensureSchema } from './accounts.js';
import { TRACK_IDS } from '../public/race/tracks.js';

export const ONLINE_WINDOW_MS = 120_000; // two missed pings and you count as gone
export const PING_EVERY_MS = 60_000;
export const ONLINE_TTL_MS = 15_000;
export const TOP_TTL_MS = 300_000;
const PING_MIN_GAP_MS = 45_000; // one write per player per ~minute, however often a client pings
const PRUNE_EVERY_MS = 600_000;

const json = (data, status = 200, cache = 'no-store') => Response.json(data, { status, headers: { 'cache-control': cache } });
let cache = { online: null, onlineAt: 0, top: null, records: [], topAt: 0, prunedAt: 0, schema: false };
const seen = new Map(); // user id -> last presence write (ms)

// tests: start from a cold isolate
export function resetSpaceFeed() { cache = { online: null, onlineAt: 0, top: null, records: [], topAt: 0, prunedAt: 0, schema: false }; seen.clear(); }

async function schema(db) {
  if (cache.schema) return;
  await ensureSchema(db); // the users table the leader queries read
  await db.prepare('CREATE TABLE IF NOT EXISTS space_presence (user_id TEXT PRIMARY KEY, at INTEGER NOT NULL)').run();
  cache.schema = true;
}

async function onlineCount(db, now) {
  if (cache.online != null && now - cache.onlineAt < ONLINE_TTL_MS) return cache.online;
  await schema(db);
  const r = await db.prepare('SELECT COUNT(*) AS n FROM space_presence WHERE at > ?').bind(now - ONLINE_WINDOW_MS).first();
  cache.online = Number(r && r.n) || 0;
  cache.onlineAt = now;
  if (now - cache.prunedAt > PRUNE_EVERY_MS) {
    cache.prunedAt = now;
    await db.prepare('DELETE FROM space_presence WHERE at < ?').bind(now - 3600_000).run();
  }
  return cache.online;
}

async function leaders(db, now) {
  if (cache.topAt && now - cache.topAt < TOP_TTL_MS) return cache;
  await schema(db);
  const wins = "CAST(json_extract(progress, '$.race.wins') AS INTEGER)";
  const top = await db.prepare(`SELECT username, ${wins} AS wins FROM users WHERE username IS NOT NULL AND ${wins} > 0 ORDER BY wins DESC, updated ASC LIMIT 1`).first();
  const records = [];
  for (const track of TRACK_IDS) {
    const path = '$.race.best.' + track;
    const r = await db.prepare('SELECT username, json_extract(progress, ?) AS t FROM users WHERE username IS NOT NULL AND json_extract(progress, ?) > 0 ORDER BY t ASC, updated ASC LIMIT 1').bind(path, path).first();
    if (r && Number(r.t) > 0) records.push({ track, name: r.username, time: Number(r.t) });
  }
  cache.top = top ? { name: top.username, wins: Number(top.wins) } : null;
  cache.records = records;
  cache.topAt = now;
  return cache;
}

export async function handleSpaceFeed(req, env, now = Date.now()) {
  const path = new URL(req.url).pathname;
  const db = env.DB;
  try {
    if (path === '/api/space/feed' && req.method === 'GET') {
      if (!db) return json({ online: null, top: null, records: [], at: now }, 200);
      const online = await onlineCount(db, now);
      const l = await leaders(db, now);
      return json({ online, top: l.top, records: l.records, at: now }, 200, 'public, max-age=15');
    }
    if (path === '/api/space/ping' && req.method === 'POST') {
      if (!db) return json({ error: 'accounts unavailable' }, 503);
      const me = await userFromToken(db, (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
      if (!me) return json({ error: 'not signed in' }, 401);
      const last = seen.get(me.id);
      if (!last || now - last >= PING_MIN_GAP_MS) {
        await schema(db);
        await db.prepare('INSERT INTO space_presence (user_id, at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET at = excluded.at').bind(me.id, now).run();
        if (seen.size > 5000) seen.clear(); // bounded: a cleared entry only costs one extra write
        seen.set(me.id, now);
        if (!last) cache.onlineAt = 0; // a newcomer: recount so they see themselves
      }
      return json({ ok: true, online: await onlineCount(db, now) });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.log('space feed error', path, e && e.message);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
