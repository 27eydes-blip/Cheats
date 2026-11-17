// LEADERBOARDS (src/leaderboard.js) against a real SQLite behind a D1-shaped adapter: the ranked
// board and the best-lap board per track come from real account progress, sorted right, only
// registered names are listed, your own place is counted (guests too), results are cached, and
// the migration's indexes are the ones the server makes.
import assert from 'node:assert';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleBoards, resetBoards, BOARD_TTL_MS, BOARD_INDEXES } from '../src/leaderboard.js';

const enc = new TextEncoder();
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
function d1() {
  const sq = new DatabaseSync(':memory:');
  let reads = 0;
  return {
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
}
const T0 = 1_800_000_000_000;
const env = { DB: d1() };
const get = async (q, now, token) => { const r = await handleBoards(new Request('http://x/api/race/boards?' + q, { headers: token ? { authorization: 'Bearer ' + token } : {} }), env, now); assert.strictEqual(r.status, 200); return r.json(); };

// an empty game: empty boards, nothing invented
{
  const b = await get('track=skyline', T0);
  assert.deepStrictEqual([b.ranked, b.laps, b.me, b.track], [[], [], null, 'skyline']);
}
resetBoards();
const db = env.DB.sq;
const add = (id, name, race, t = 1) => db.prepare('INSERT INTO users (id, username, progress, created, updated) VALUES (?, ?, ?, ?, ?)').run(id, name, JSON.stringify({ race }), t, t);
add('a', 'Comet', { rk: { rp: 820 }, bestLap: { skyline: 19.42, desert: 18.1 } });
add('b', 'Nova', { rk: { rp: 1850 }, bestLap: { skyline: 20.05 } });
add('c', null, { rk: { rp: 9000 }, bestLap: { skyline: 15.0 } }); // a guest: never listed
add('d', 'Pulse', { rk: { rp: 0 }, bestLap: { skyline: 18.77 } });
add('e', 'Drift', { bestLap: {} }); // an old save: no rank, no laps
add('f', 'Echo', { rk: { rp: 820 }, bestLap: { skyline: 'x' } }, 0);
await db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)').run();
db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(await sha('tokA'), 'a', Date.now() + 1e9);
db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(await sha('tokC'), 'c', Date.now() + 1e9);

const b = await get('track=skyline', T0, 'tokA');
assert.deepStrictEqual(b.ranked.map((r) => [r.pos, r.name, r.rp, r.label]), [[1, 'Nova', 1850, 'Diamond III'], [2, 'Echo', 820, 'Gold III'], [3, 'Comet', 820, 'Gold III']], 'ranked: registered racers with RP, highest first (a tie: the earlier one)');
assert.deepStrictEqual(b.laps.map((r) => [r.pos, r.name, r.lap]), [[1, 'Pulse', 18.77], [2, 'Comet', 19.42], [3, 'Nova', 20.05]], 'best laps on Skyline: fastest first, guests and bad values left out');
assert.deepStrictEqual(b.me, { rp: 820, label: 'Gold III', rankPos: 2, lap: 19.42, lapPos: 2, name: 'Comet' }, 'your own place');
const g = await get('track=skyline', T0, 'tokC');
assert.deepStrictEqual([g.me.rankPos, g.me.lapPos, g.me.name], [1, 1, null], 'a guest sees where they would stand, without being listed');
assert.ok(!JSON.stringify(g.ranked).includes('9000') && !g.laps.some((r) => r.lap === 15), 'the guest is not on the boards');
const d = await get('track=desert', T0);
assert.deepStrictEqual(d.laps.map((r) => r.name), ['Comet'], 'each track has its own board');
const bad = await get('track=../../x', T0);
assert.strictEqual(bad.track, 'desert', 'an unknown track falls back to the first track');

// cached: a new result shows after BOARD_TTL_MS, not on every request
add('g', 'Flash', { rk: { rp: 5000 }, bestLap: { skyline: 17 } });
const reads = env.DB.reads;
const c1 = await get('track=skyline', T0 + 1000);
assert.strictEqual(c1.ranked[0].name, 'Nova', 'still cached');
assert.strictEqual(env.DB.reads, reads, 'no D1 read for a cached board');
const c2 = await get('track=skyline', T0 + BOARD_TTL_MS + 1);
assert.deepStrictEqual([c2.ranked[0].name, c2.ranked[0].label, c2.laps[0].name], ['Flash', 'Oblivion', 'Flash'], 'fresh after the TTL');

// the sorts use the indexes (the migration file and the server make the same ones)
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT username FROM users WHERE username IS NOT NULL AND CAST(json_extract(progress, '$.race.rk.rp') AS INTEGER) > 0 ORDER BY CAST(json_extract(progress, '$.race.rk.rp') AS INTEGER) DESC LIMIT 20").all();
assert.ok(plan.some((r) => /users_rank_rp/.test(r.detail)), 'the ranked board uses its index: ' + JSON.stringify(plan));
const mig = fs.readFileSync(new URL('../migrations/0002_boards.sql', import.meta.url), 'utf8');
for (const sql of BOARD_INDEXES) assert.ok(mig.includes(sql.replace(/\s+/g, ' ').trim() + ';'), 'the migration has: ' + sql);

// other paths
assert.strictEqual((await handleBoards(new Request('http://x/api/race/nope'), env)).status, 404);
assert.deepStrictEqual(await (await handleBoards(new Request('http://x/api/race/boards'), {})).json().then((j) => j.ranked), [], 'no database: empty boards');
console.log('race-boards: ok');
