// Test harness for the Durable Objects in src/worker.js: runs the real MatchRoom / ZoneRoom / entry
// code in Node with fake sockets, a fake D1 and a hand-cranked tick (no timers, no network).
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

class FakeSocket {
  constructor() { this.listeners = { message: [], close: [], error: [] }; this.msgs = []; this.readyState = 1; this.peer = null; this.closed = null; }
  accept() {}
  addEventListener(type, fn) { this.listeners[type].push(fn); }
  // what this end sends arrives at the other end
  send(data) { if (this.readyState !== 1) throw new Error('socket closed'); this.peer.deliver(data); }
  deliver(data) {
    if (this.listeners.message.length) for (const fn of this.listeners.message) fn({ data });
    else { try { this.msgs.push(JSON.parse(data)); } catch { this.msgs.push(data); } }
  }
  close(code, reason) {
    if (this.readyState !== 1) return;
    this.readyState = 3; this.closed = { code, reason };
    for (const fn of this.listeners.close) fn({ code, reason });
    if (this.peer.readyState === 1) this.peer.close(code, reason);
  }
  // ---- client-side conveniences
  say(obj) { this.send(typeof obj === 'string' || obj instanceof ArrayBuffer ? obj : JSON.stringify(obj)); }
  of(t) { return this.msgs.filter((m) => m && m.t === t); }
  last(t) { return this.of(t).pop(); }
}
globalThis.WebSocketPair = class { constructor() { const a = new FakeSocket(), b = new FakeSocket(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } };

const sha = (s) => createHash('sha256').update(s).digest('hex');
// D1 stand-in: users + sessions, enough SQL for accounts.js. `gate` lets a test hold every query.
export function fakeD1() {
  const users = new Map(), sessions = new Map();
  const db = {
    users, sessions, gate: null, queries: 0,
    addUser(id, token, progress = newProgress()) { users.set(id, { id, username: null, progress: JSON.stringify(progress) }); sessions.set(sha(token), id); return token; },
    progress(id) { return JSON.parse(users.get(id).progress); },
    prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; },
        async first() { db.queries++; if (db.gate) await db.gate; return exec(sql, st.args).first; },
        async run() { db.queries++; if (db.gate) await db.gate; return exec(sql, st.args).run; } };
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
    if (/FROM sessions s JOIN users u/.test(sql)) { const s = sessions.get(a[0]); return { first: s ? { ...users.get(s) } : null }; }
    if (/^CREATE/.test(sql)) return { run: {} };
    throw new Error('fake D1: unhandled SQL ' + sql);
  }
  return db;
}

// env for the rooms. Zone-to-zone and directory calls are answered locally.
export function fakeEnv(db = fakeD1(), extra = {}) {
  const stub = { fetch: async () => RealResponse.json({}) };
  const ns = { idFromName: (n) => n, get: () => stub };
  return { DB: db, ZONE: ns, DIRECTORY: ns, MATCH: ns, MATCHMAKER: ns, ASSETS: stub, ...extra };
}
// a room whose 20 Hz loop is cranked by the test: room.step() = one tick
export function manual(room) { room.loop = { start() {}, stop() {} }; return room; }
export const steps = (room, n) => { for (let i = 0; i < n; i++) room.step(); };
// open a socket to a room; returns the client end (msgs = everything the server sent)
export async function connect(room, path) {
  const req = new Request('http://hunt.test' + path, { headers: { Upgrade: 'websocket' } });
  const res = await room.fetch(req);
  if (!res.upgrade) throw new Error('no WebSocket upgrade for ' + path + ' (status ' + res.status + ')');
  return res.webSocket;
}
export const settle = () => new Promise((r) => setTimeout(r, 5));
// every name that lives on Object.prototype (constructor, __proto__, toString, hasOwnProperty, valueOf...)
export const PROTO_KEYS = Object.getOwnPropertyNames(Object.prototype);
