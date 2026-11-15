// Deploy safety: what `npm run deploy` and Cloudflare Workers Builds ship must be the production
// config (wrangler.preview.jsonc), never the local dev config with its test-only cheat flags, and
// the two configs must not drift apart. Also covers the one-line server error log.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError, guard } from '../src/log.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const jsonc = (f) => JSON.parse(read(f).replace(/^\s*\/\/.*$/gm, ''));
const prodText = read('wrangler.preview.jsonc');
const prod = jsonc('wrangler.preview.jsonc'), dev = jsonc('wrangler.jsonc');
const pkg = JSON.parse(read('package.json'));

// --- the deploy command uses the production config
assert.match(pkg.scripts.deploy, /^wrangler deploy\b.*-c wrangler\.preview\.jsonc\b/, '`npm run deploy` must deploy wrangler.preview.jsonc, not the dev config');
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  if (/wrangler deploy/.test(cmd)) assert.match(cmd, /-c wrangler\.preview\.jsonc\b/, `script "${name}" deploys without the production config`);
}
assert.ok(!/```[^`]*\bwrangler deploy\s*(#.*)?\n/.test(read('README.md')), 'the README must not tell anyone to run a bare `wrangler deploy`');

// --- no dev cheat flags in production (HUNT_DEV unlocks any weapon / power / spawn point from the URL)
assert.ok(!/HUNT_DEV/.test(prodText), 'HUNT_DEV must never appear in wrangler.preview.jsonc');
assert.equal(prod.vars, undefined, 'the production config carries no vars');
assert.equal(dev.vars?.HUNT_DEV, '1', 'local dev keeps its test flags (the browser tests rely on them)');
assert.equal(prod.env, undefined, 'no named environments: they could carry their own vars');
// the worker only ever reads the flag from env, so the config is the single switch
const worker = read('src/worker.js');
for (const f of ['src/worker.js', 'src/accounts.js', 'src/sim.js', 'src/modes.js']) {
  for (const l of read(f).split('\n').filter((x) => /HUNT_DEV/.test(x) && !/^\s*\/\//.test(x))) {
    assert.ok(/\benv\.HUNT_DEV\b/.test(l) && !/HUNT_DEV\s*=[^=]/.test(l), `${f} must only read HUNT_DEV from env: ${l.trim()}`);
  }
}

// --- same Worker, same code, same Durable Objects
assert.equal(prod.name, 'hunt', 'the Worker name must stay "hunt" (Workers Builds deploys to it)');
assert.equal(prod.main, dev.main);
assert.deepEqual(prod.assets, dev.assets);
assert.equal(prod.compatibility_date, dev.compatibility_date);
assert.deepEqual(prod.compatibility_flags, dev.compatibility_flags);
const key = (b) => `${b.name}:${b.class_name}`;
const prodDO = new Set(prod.durable_objects.bindings.map(key));
for (const b of dev.durable_objects.bindings) assert.ok(prodDO.has(key(b)), `production is missing the Durable Object binding ${key(b)}`);
// migrations are an append-only history: production must have every step the dev config has, in order
assert.deepEqual(prod.migrations.slice(0, dev.migrations.length), dev.migrations, 'production lost or changed a Durable Object migration');
// every bound class is created by some migration and is exported by the worker
const created = new Set(prod.migrations.flatMap((m) => [...(m.new_sqlite_classes || []), ...(m.new_classes || [])]));
for (const b of prod.durable_objects.bindings) {
  assert.ok(created.has(b.class_name), `no migration creates ${b.class_name}`);
  assert.match(worker, new RegExp(`export class ${b.class_name}\\b`), `the worker does not export ${b.class_name}`);
}
// a real database, not the local placeholder; same binding and migrations folder
const pdb = prod.d1_databases[0], ddb = dev.d1_databases[0];
assert.equal(pdb.binding, ddb.binding); assert.equal(pdb.migrations_dir, ddb.migrations_dir);
assert.match(pdb.database_id, /^[0-9a-f-]{36}$/); assert.notEqual(pdb.database_id, ddb.database_id);
assert.ok(!/^0{8}-/.test(pdb.database_id), 'production must not point at the placeholder database');

// --- logs are kept in production
assert.equal(prod.observability?.enabled, true, 'Workers Logs must be on in the production config');

// --- the error log: one line, no personal data, not a flood
const lines = [];
const realError = console.error;
console.error = (...a) => lines.push(a.join(' '));
try {
  const secret = '3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab';
  const line = logError('tick', { where: 'match', mode: 'showdown', name: 'Sam', token: secret }, new Error(`boom for\n token=${secret} name=Sam&x=1 key AbCdEf0123456789AbCdEf0123456789`), 1000);
  assert.equal(lines.length, 1); assert.equal(lines[0], line);
  assert.ok(!line.includes('\n'), 'one line per error');
  assert.match(line, /^hunt-error \{/);
  const o = JSON.parse(line.slice('hunt-error '.length));
  assert.equal(o.what, 'tick'); assert.equal(o.where, 'match'); assert.equal(o.mode, 'showdown'); assert.equal(o.v, 'dev');
  assert.ok(o.at && !/\/workspace|\/home|file:/.test(o.at), 'the code location is short, without machine paths: ' + o.at);
  assert.deepEqual(Object.keys(o).sort(), ['at', 'mode', 'msg', 'v', 'what', 'where'], 'only the listed fields are logged');
  assert.ok(!line.includes(secret) && !line.includes('Sam') && !line.includes('AbCdEf0123456789'), 'tokens, names and long ids are scrubbed: ' + line);
  assert.ok(line.length < 400);
  // a tick fails 20 times a second: repeats inside the window are counted, then reported once
  for (let i = 0; i < 50; i++) assert.equal(logError('tick', { where: 'match', mode: 'showdown' }, new Error('same'), 2000 + i * 50), i === 0 ? lines[lines.length - 1] : null);
  assert.equal(lines.length, 2);
  const again = JSON.parse(logError('tick', { where: 'match', mode: 'showdown' }, new Error('same'), 2000 + 10001).slice(11));
  assert.equal(again.repeats, 49);
  // a different place or error is not swallowed by the window
  assert.ok(logError('tick', { where: 'zone', zone: 'nw' }, new Error('same'), 2100));
  assert.ok(logError('tick', { where: 'match' }, 'a plain string', 2100));
  assert.doesNotThrow(() => logError(null, null, null));
  // guard: a throwing handler is logged with the room's context and does not throw on
  lines.length = 0;
  const h = guard((x) => { if (x) throw new Error('bad input'); return 7; }, 'message', () => ({ where: 'zone', zone: 'se' }));
  assert.equal(h(0), 7); assert.equal(h(1), undefined);
  assert.equal(lines.length, 1); assert.match(lines[0], /"what":"message","where":"zone","zone":"se","msg":"bad input"/);

  // --- the rooms really use it: a tick that throws, a fetch that throws
  const mod = await import('../src/worker.js');
  const { MatchRoom, ZoneRoom } = mod;
  lines.length = 0;
  const room = new MatchRoom({}, {});
  room.sim = { modeKey: 'bounty', phase: 'play', tick() { throw new Error('tick exploded'); } };
  room.sockets = new Map([[1, {}]]); room.dropped = new Map();
  room.loop.start();
  await new Promise((r) => setTimeout(r, 300));
  room.loop.stop();
  assert.equal(lines.length, 1, 'a failing tick logs once, not 20 times a second');
  assert.match(lines[0], /"what":"tick","where":"match","mode":"bounty","msg":"tick exploded"/);
  lines.length = 0;
  const zone = new ZoneRoom({}, {}); zone.slot = 'nw';
  await assert.rejects(zone.fetch({ url: 'not a url' }));
  assert.equal(lines.length, 1); assert.match(lines[0], /"what":"fetch","where":"zone","zone":"nw"/);
  // the Worker entry logs the route only (the query string can hold a token) and still fails the request
  lines.length = 0;
  const env = { ZONE: { idFromName: () => 1, get: () => ({ fetch: async () => { throw new Error('zone down'); } }) } };
  const req = { url: `https://hunt.test/zone?slot=nw&token=${secret}&name=Sam`, headers: { get: () => 'websocket' } };
  await assert.rejects(mod.default.fetch(req, env), /zone down/);
  assert.equal(lines.length, 1); assert.match(lines[0], /"what":"request","where":"\/zone","msg":"zone down"/);
  assert.ok(!lines[0].includes(secret) && !lines[0].includes('Sam'));
} finally { console.error = realError; }

console.log('deploy tests passed');
