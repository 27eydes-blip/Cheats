// Minimal Durable Object harness for the Hunt Racers server: runs the real worker entry, RaceRoom and
// RaceMatchmaker in Node with fake sockets, a fake D1 and hand-cranked ticks (no timers, no network).
// Import this BEFORE src/worker.js (it installs the Workers globals the rooms use).
import { createHash } from 'node:crypto';
import { newProgress } from '../public/progression.js';

const RealResponse = globalThis.Response;
// Workers answer a WebSocket upgrade with status 101 + the client socket (Node's Response refuses 101)
class WorkerResponse extends RealResponse {
  constructor(body, init = {}) {
    if (init.status === 101) { super(null, { status: 200 }); this.upgrade = true; this.webSocket = init.webSocket; } else super(body, init);
  }
}
globalThis.Response = WorkerResponse;

export class FakeSocket {
  constructor() { this.listeners = { message: [], close: [], error: [], open: [] }; this.backlog = []; this.readyState = 1; this.peer = null; this.sent = 0; }
  accept() {}
  addEventListener(type, fn) {
    this.listeners[type].push(fn);
    if (type === 'message' && this.backlog.length) { const b = this.backlog.splice(0); for (const d of b) fn({ data: d }); }
  }
  send(data) { if (this.readyState !== 1) throw new Error('socket closed'); this.sent += data.length; this.peer.deliver(data); }
  deliver(data) { if (this.listeners.message.length) for (const fn of this.listeners.message) fn({ data }); else this.backlog.push(data); }
  close(code, reason) {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    for (const fn of this.listeners.close) fn({ code, reason });
    if (this.peer.readyState === 1) this.peer.close(code, reason);
  }
}
globalThis.WebSocketPair = class { constructor() { const a = new FakeSocket(), b = new FakeSocket(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } };

const sha = (s) => createHash('sha256').update(s).digest('hex');
// D1 stand-in: users + sessions, just the SQL accounts.js uses for match results
export function fakeD1() {
  const users = new Map(), sessions = new Map();
  const db = {
    users,
    addUser(id, token, progress = newProgress()) { users.set(id, { id, username: null, progress: JSON.stringify(progress) }); sessions.set(sha(token), id); return token; },
    progress(id) { return JSON.parse(users.get(id).progress); },
    prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; }, async first() { return exec(sql, st.args).first; }, async run() { return exec(sql, st.args).run; } };
      return st;
    },
    async batch() { return []; },
  };
  function exec(sql, a) {
    if (/^SELECT progress FROM users WHERE id/.test(sql)) { const u = users.get(a[0]); return { first: u ? { progress: u.progress } : null }; }
    if (/^UPDATE users SET progress = \?, updated = \? WHERE id = \? AND progress = \?/.test(sql)) {
      const u = users.get(a[2]);
      if (!u || u.progress !== a[3]) return { run: { meta: { changes: 0 } } };
      u.progress = a[0];
      return { run: { meta: { changes: 1 } } };
    }
    if (/FROM sessions s JOIN users u/.test(sql)) { const s = sessions.get(a[0]); return { first: s ? { ...users.get(s) } : null }; }
    if (/^CREATE/.test(sql)) return { run: {} };
    throw new Error('fake D1: unhandled SQL ' + sql);
  }
  return db;
}

// env with real race Durable Objects, one instance per name, ticked by hand
export function raceEnv(classes, db = fakeD1()) {
  const rooms = new Map();
  const ns = (Cls) => ({
    idFromName: (n) => n,
    get: (n) => {
      if (!rooms.has(n)) { const r = new Cls({}, env); r.loop = { start() {}, stop() {} }; r.name = n; rooms.set(n, r); }
      const r = rooms.get(n);
      // a stub: like Workers, fetch() takes a URL string or a Request
      return { fetch: (req, init) => r.fetch(typeof req === 'string' ? new Request(req, init) : req) };
    },
  });
  const env = { DB: db, RACE: ns(classes.RaceRoom), RACEMM: ns(classes.RaceMatchmaker), rooms };
  return env;
}
export const settle = (ms = 5) => new Promise((r) => setTimeout(r, ms));
// open a socket through the worker entry; returns the client end
export async function open(worker, env, path) {
  const res = await worker.fetch(new Request('http://hunt.test' + path, { headers: { Upgrade: 'websocket' } }), env);
  if (!res.upgrade) throw new Error('no WebSocket upgrade for ' + path + ' (status ' + res.status + ')');
  return res.webSocket;
}
