// Accounts: concurrent progress writes must not lose updates (fake D1 that interleaves requests).
import assert from 'node:assert';
import { recordMatch, mutateProgress } from '../src/accounts.js';
import { newProgress } from '../public/progression.js';

const tick = () => new Promise((r) => setTimeout(r, Math.random() * 4));
function fakeD1() {
  const users = new Map(), sessions = new Map();
  const db = {
    users, sessions,
    prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; },
        async first() { await tick(); return exec(sql, st.args).first; },
        async run() { await tick(); return exec(sql, st.args).run; } };
      return st;
    },
    async batch() { return []; },
  };
  function exec(sql, a) {
    if (/^SELECT progress FROM users WHERE id/.test(sql)) { const u = users.get(a[0]); return { first: u ? { progress: u.progress } : null }; }
    if (/^UPDATE users SET progress = \?, updated = \? WHERE id = \? AND progress = \?/.test(sql)) {
      const u = users.get(a[2]); if (!u || u.progress !== a[3]) return { run: { meta: { changes: 0 } } };
      u.progress = a[0]; return { run: { meta: { changes: 1 } } };
    }
    if (/^UPDATE users SET progress = \?, updated = \? WHERE id = \?$/.test(sql)) { users.get(a[2]).progress = a[0]; return { run: { meta: { changes: 1 } } }; }
    if (/FROM sessions s JOIN users u/.test(sql)) { const s = sessions.get(a[0]); return { first: s ? { ...users.get(s), id: s } : null }; }
    if (/^CREATE/.test(sql)) return { run: {} };
    throw new Error('fake D1: unhandled SQL ' + sql);
  }
  return db;
}

const db = fakeD1();
db.users.set('u1', { progress: JSON.stringify(newProgress()) });
// eight match results landing at the same moment
await Promise.all(Array.from({ length: 8 }, () => recordMatch(db, 'u1', { rank: 1, players: 10, kills: 2, bounty: 3, brawler: 'volt' })));
const p = JSON.parse(db.users.get('u1').progress);
assert.equal(p.games, 8, 'every concurrent match result was kept (got ' + p.games + ')');
assert.equal(p.trophies.volt, 64, 'trophies from all 8 wins');

// a buy and match results racing: both survive, coins never go negative
db.users.set('u2', { progress: JSON.stringify({ ...newProgress(), coins: 450 }) });
const { applyPurchase } = await import('../public/catalog.js');
const { normalize } = await import('../public/progression.js');
await Promise.all([
  mutateProgress(db, 'u2', (raw) => applyPurchase(normalize(JSON.parse(raw)), { action: 'buy', id: 'volt_storm' })),
  mutateProgress(db, 'u2', (raw) => applyPurchase(normalize(JSON.parse(raw)), { action: 'buy', id: 'volt_solar' })),
  recordMatch(db, 'u2', { rank: 1, players: 10, kills: 0, bounty: 0, brawler: 'brick' }),
]);
const q = JSON.parse(db.users.get('u2').progress);
assert.equal(q.games, 1, 'match result kept');
assert.equal(q.owned.filter((k) => k.startsWith('volt_') && !k.endsWith('_classic')).length, 1, 'only one 400-coin skin affordable from 450');
assert(q.coins >= 0, 'coins never negative');
console.log('accounts concurrency tests passed');
