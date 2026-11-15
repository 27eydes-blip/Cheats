// Accounts API (Cloudflare D1). Everyone gets a server-side account: guests have no username/
// password; "upgrade" sets them on the same row, so progress carries over. Match results are
// applied here by the match Durable Objects — clients can't write trophies or XP.
import { newProgress, normalize, applyMatch, roadReward, totalTrophies } from '../public/progression.js';
import { applyPurchase } from '../public/catalog.js';

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const now = () => Date.now();
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const SESSION_MS = 90 * 24 * 3600 * 1000;
export const PBKDF2_ITER = 100000;

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

let schemaReady = false;
export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, pass_hash TEXT, salt TEXT, progress TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL, updated INTEGER NOT NULL)"),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)'),
  ]);
  schemaReady = true;
}

async function newSession(db, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, now() + SESSION_MS).run();
  return token;
}

export async function userFromToken(db, token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  await ensureSchema(db);
  const row = await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?').bind(await sha256(token), now()).first();
  return row || null;
}
const publicUser = (u) => ({ id: u.id, username: u.username || null, guest: !u.username, progress: normalize(JSON.parse(u.progress || '{}')) });

// Read-modify-write of a user's progress with compare-and-swap: the UPDATE only lands if nobody
// else changed the row since we read it (a match result landing while you buy something, two
// tabs/devices claiming at once); otherwise re-read and re-apply. fn(raw) -> {progress, ...} | {error}
export async function mutateProgress(db, id, fn) {
  for (let i = 0; i < 8; i++) {
    const u = await db.prepare('SELECT progress FROM users WHERE id = ?').bind(id).first();
    if (!u) return null;
    const out = fn(u.progress || '{}');
    if (!out || out.error) return out;
    const r = await db.prepare('UPDATE users SET progress = ?, updated = ? WHERE id = ? AND progress = ?').bind(JSON.stringify(out.progress), now(), id, u.progress).run();
    if (r.meta && r.meta.changes) return out;
  }
  throw new Error('Busy, please try again');
}

// Called by match DOs when a match ends. results: [{token-verified userId, rank, players, kills, bounty, brawler, won}]
export async function recordMatch(db, userId, result) {
  await ensureSchema(db);
  return mutateProgress(db, userId, (raw) => applyMatch(JSON.parse(raw), result));
}

const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const validName = (n) => typeof n === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(n);
const validPass = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 128;

// Every API answer is JSON, even when something unexpected breaks (never the runtime's error page).
export async function handleApi(req, env) {
  try { return await api(req, env); } catch (e) {
    console.log('api error', new URL(req.url).pathname, e && e.message);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
async function api(req, env) {
  const db = env.DB;
  if (!db) return json({ error: 'accounts unavailable' }, 503);
  await ensureSchema(db);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '');
  const sent = req.method === 'POST' ? await req.json().catch(() => null) : null;
  const body = sent && typeof sent === 'object' && !Array.isArray(sent) ? sent : {}; // (null, 5, "x", [] are valid JSON too)
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const me = await userFromToken(db, auth);

  if (path === '/guest' && req.method === 'POST') {
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO users (id, progress, created, updated) VALUES (?, ?, ?, ?)').bind(id, JSON.stringify(newProgress()), now(), now()).run();
    const token = await newSession(db, id);
    return json({ token, user: publicUser({ id, progress: '{}' }) });
  }
  if (path === '/register' && req.method === 'POST') { // upgrade the current guest (or create fresh)
    if (!validName(body.username)) return json({ error: 'Username: 3-16 letters, numbers or _' }, 400);
    if (!validPass(body.password)) return json({ error: 'Password: at least 6 characters' }, 400);
    if (await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(body.username).first()) return json({ error: 'That username is taken' }, 409);
    const { hash, salt } = await hashPassword(body.password);
    let id;
    try {
      if (me && !me.username) { id = me.id; await db.prepare('UPDATE users SET username = ?, pass_hash = ?, salt = ?, updated = ? WHERE id = ?').bind(body.username, hash, salt, now(), id).run(); }
      else { id = crypto.randomUUID(); await db.prepare('INSERT INTO users (id, username, pass_hash, salt, progress, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, body.username, hash, salt, JSON.stringify(newProgress()), now(), now()).run(); }
    } catch (e) {
      // two sign-ups racing for the same name: the UNIQUE constraint catches the second one
      if (/UNIQUE/i.test(String(e && e.message))) return json({ error: 'That username is taken' }, 409);
      throw e;
    }
    const token = await newSession(db, id);
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return json({ token, user: publicUser(u) });
  }
  if (path === '/login' && req.method === 'POST') {
    const u = typeof body.username === 'string' ? await db.prepare('SELECT * FROM users WHERE username = ?').bind(body.username).first() : null;
    // always run the hash, so response time doesn't reveal whether a username exists
    const h = await hashPassword(typeof body.password === 'string' ? body.password.slice(0, 128) : '', u && u.salt ? u.salt : DUMMY_SALT);
    const ok = u && u.pass_hash && validPass(body.password) && safeEqual(h.hash, u.pass_hash);
    if (!ok) return json({ error: 'Wrong username or password' }, 401);
    return json({ token: await newSession(db, u.id), user: publicUser(u) });
  }
  if (!me) return json({ error: 'not signed in' }, 401);
  if (path === '/me') return json({ user: publicUser(me) });
  if (path === '/logout' && req.method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(auth)).run();
    return json({ ok: true });
  }
  if (path === '/claim' && req.method === 'POST') { // trophy road
    const out = await mutateProgress(db, me.id, (raw) => {
      const p = normalize(JSON.parse(raw));
      const at = body.at | 0, r = roadReward(at);
      if (!r || totalTrophies(p) < at || p.claimed.includes(at)) return { error: 'Not available' };
      p.claimed.push(at);
      if (r.coins) p.coins += r.coins;
      for (const k of ['title', 'fx', 'skin']) if (r[k] && !p.owned.includes(r[k])) p.owned.push(r[k]);
      return { progress: p };
    });
    if (!out || out.error) return json({ error: out ? out.error : 'not found' }, 400);
    return json({ user: publicUser({ ...me, progress: JSON.stringify(out.progress) }) });
  }
  if (path === '/shop' && req.method === 'POST') { // equip / buy with TEST currency / pass claims (see catalog.js)
    const out = await mutateProgress(db, me.id, (raw) => applyPurchase(normalize(JSON.parse(raw)), body));
    if (!out || out.error) return json({ error: out ? out.error : 'not found' }, 400);
    return json({ user: publicUser({ ...me, progress: JSON.stringify(out.progress) }) });
  }
  return json({ error: 'not found' }, 404);
}
