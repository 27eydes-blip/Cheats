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

async function saveProgress(db, id, progress) {
  await db.prepare('UPDATE users SET progress = ?, updated = ? WHERE id = ?').bind(JSON.stringify(progress), now(), id).run();
}

// Called by match DOs when a match ends. results: [{token-verified userId, rank, players, kills, bounty, brawler, won}]
export async function recordMatch(db, userId, result) {
  await ensureSchema(db);
  const u = await db.prepare('SELECT progress FROM users WHERE id = ?').bind(userId).first();
  if (!u) return null;
  const out = applyMatch(JSON.parse(u.progress || '{}'), result);
  await saveProgress(db, userId, out.progress);
  return out;
}

const validName = (n) => typeof n === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(n);
const validPass = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 128;

export async function handleApi(req, env) {
  const db = env.DB;
  if (!db) return json({ error: 'accounts unavailable' }, 503);
  await ensureSchema(db);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '');
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
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
    if (me && !me.username) { id = me.id; await db.prepare('UPDATE users SET username = ?, pass_hash = ?, salt = ?, updated = ? WHERE id = ?').bind(body.username, hash, salt, now(), id).run(); }
    else { id = crypto.randomUUID(); await db.prepare('INSERT INTO users (id, username, pass_hash, salt, progress, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, body.username, hash, salt, JSON.stringify(newProgress()), now(), now()).run(); }
    const token = await newSession(db, id);
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return json({ token, user: publicUser(u) });
  }
  if (path === '/login' && req.method === 'POST') {
    const u = typeof body.username === 'string' ? await db.prepare('SELECT * FROM users WHERE username = ?').bind(body.username).first() : null;
    const ok = u && u.pass_hash && validPass(body.password) && safeEqual((await hashPassword(body.password, u.salt)).hash, u.pass_hash);
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
    const p = normalize(JSON.parse(me.progress || '{}'));
    const at = body.at | 0, r = roadReward(at);
    if (!r || totalTrophies(p) < at || p.claimed.includes(at)) return json({ error: 'Not available' }, 400);
    p.claimed.push(at);
    if (r.coins) p.coins += r.coins;
    for (const k of ['title', 'fx', 'skin']) if (r[k] && !p.owned.includes(r[k])) p.owned.push(r[k]);
    await saveProgress(db, me.id, p);
    return json({ user: publicUser({ ...me, progress: JSON.stringify(p) }) });
  }
  if (path === '/shop' && req.method === 'POST') { // equip / buy with TEST currency / pass claims (see catalog.js)
    const p = normalize(JSON.parse(me.progress || '{}'));
    const res = applyPurchase(p, body);
    if (res.error) return json({ error: res.error }, 400);
    await saveProgress(db, me.id, res.progress);
    return json({ user: publicUser({ ...me, progress: JSON.stringify(res.progress) }) });
  }
  return json({ error: 'not found' }, 404);
}
