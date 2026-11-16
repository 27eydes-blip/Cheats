// Lobby ticker data (src/space-feed.js) against a real SQLite (node:sqlite behind a D1-shaped
// adapter): players online counts only recent pings, guests are never named, the top racer and
// Time Trial records come from real progress, results are cached, and nothing is ever made up.
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { handleSpaceFeed, resetSpaceFeed, ONLINE_WINDOW_MS, ONLINE_TTL_MS, TOP_TTL_MS } from '../src/space-feed.js';

const enc = new TextEncoder();
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

function d1() {
  const sq = new DatabaseSync(':memory:');
  let reads = 0;
  const db = {
    sq, get reads() { return reads; },
    prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; },
        async first() { reads++; return sq.prepare(sql).get(...st.args) ?? null; },
        async all() { reads++; return { results: sq.prepare(sql).all(...st.args) }; },
        async run() { const r = sq.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes) } }; } };
      return st;
    },
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
  };
  return db;
}

const T0 = 1_800_000_000_000;
const env = { DB: d1() };
const get = async (now) => (await handleSpaceFeed(new Request('http://x/api/space/feed'), env, now)).json();
const ping = (token, now) => handleSpaceFeed(new Request('http://x/api/space/ping', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {} }), env, now);

// an empty game: no one online, nobody to name, no records
{
  const f = await get(T0);
  assert.deepEqual([f.online, f.top, f.records], [0, null, []], 'empty game shows nothing invented');
}

// accounts: two registered racers and a guest who has the most wins
const db = env.DB.sq;
const add = async (id, username, race, token) => {
  db.prepare('INSERT INTO users (id, username, progress, created, updated) VALUES (?, ?, ?, ?, ?)').run(id, username, JSON.stringify({ race }), T0, T0);
  if (token) db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').run(await sha(token), id, T0 + 1e12);
};
await add('a', 'Comet_Kid', { wins: 7, best: { desert: 81.25, frozen: 0 } }, 'tok-a');
await add('b', 'Nova', { wins: 3, best: { desert: 79.5, neon: 92.1 } }, 'tok-b');
await add('g', null, { wins: 50, best: { desert: 60 } }, 'tok-g');

// pings: unknown token refused, and only signed-in players count
assert.equal((await ping(null, T0)).status, 401, 'ping without a session is refused');
assert.equal((await ping('nope', T0)).status, 401, 'ping with a bad token is refused');
resetSpaceFeed();
let r = await (await ping('tok-a', T0)).json();
assert.equal(r.online, 1, 'first ping counts you');
r = await (await ping('tok-g', T0 + 1000)).json();
assert.equal(r.online, 2, 'a guest counts as online (but is never named)');
await ping('tok-b', T0 + 2000);

// cached for ONLINE_TTL_MS, then recounted
let f = await get(T0 + 3000);
assert.ok(f.online >= 2 && f.online <= 3, 'cached count is a real recent count');
f = await get(T0 + 2000 + ONLINE_TTL_MS + 1);
assert.equal(f.online, 3, 'three players online');

// the top racer is the registered one with most wins (the guest has more but no public name)
assert.deepEqual(f.top, { name: 'Comet_Kid', wins: 7 });
// Time Trial records: fastest registered time per track, zero/garbage times ignored, guest skipped
assert.deepEqual(f.records, [{ track: 'desert', name: 'Nova', time: 79.5 }, { track: 'neon', name: 'Nova', time: 92.1 }]);

// leaders are cached: a new winner shows up only after TOP_TTL_MS
db.prepare('UPDATE users SET progress = ? WHERE id = ?').run(JSON.stringify({ race: { wins: 9 } }), 'b');
f = await get(T0 + 60_000);
assert.equal(f.top.name, 'Comet_Kid', 'leaders cached');
const reads = env.DB.reads;
await get(T0 + 60_001);
assert.equal(env.DB.reads, reads, 'a cached feed costs no database reads');
f = await get(T0 + TOP_TTL_MS + 10_000);
assert.deepEqual(f.top, { name: 'Nova', wins: 9 }, 'new leader after the cache expires');

// pings are throttled per player (no write storm), and people who stop pinging drop out
const before = db.prepare('SELECT at FROM space_presence WHERE user_id = ?').get('a').at;
await ping('tok-a', T0 + 5000);
assert.equal(db.prepare('SELECT at FROM space_presence WHERE user_id = ?').get('a').at, before, 'a ping a few seconds later does not write');
const late = T0 + TOP_TTL_MS + ONLINE_WINDOW_MS + 30_000; // (after every earlier read: the clock only moves forward)
await ping('tok-a', late);
f = await get(late + ONLINE_TTL_MS + 1);
assert.equal(f.online, 1, 'only the player still pinging is online');

// wrong method / path, and no database at all
assert.equal((await handleSpaceFeed(new Request('http://x/api/space/feed', { method: 'POST' }), env, T0)).status, 404);
assert.equal((await handleSpaceFeed(new Request('http://x/api/space/other'), env, T0)).status, 404);
const none = await (await handleSpaceFeed(new Request('http://x/api/space/feed'), {}, T0)).json();
assert.deepEqual([none.online, none.top, none.records], [null, null, []], 'no database: unknown, not zero');

// the worker routes /api/space/* here before the accounts API
const fs = await import('node:fs');
const worker = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
assert.ok(worker.indexOf("startsWith('/api/space/')") > 0 && worker.indexOf("startsWith('/api/space/')") < worker.indexOf("startsWith('/api/')) return handleApi"), 'route hook before the accounts API');

console.log('space feed: ok');
