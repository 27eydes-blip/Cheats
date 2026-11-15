// SKYDRIFT ISLES API. Static files come from ./public (Workers Static Assets); /api/* lands here.
import { SEED_DAYS } from './content/seed-days.js';
import { PACKS } from './content/packs.js';
import { parseAnswerList, buildIndex, matchAnswer, normalize } from '../public/shared/match.js';
import {
  PROMPTS_PER_DAY, LAUNCH_DATE, blendedShare, pointsForShare, dayNumber, addDays, SECONDS_PER_PROMPT,
} from '../public/shared/score.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Players play on their local calendar date, which is at most a day either side of UTC.
function playableDate(date) {
  if (!DATE_RE.test(date || '')) return false;
  const t = utcToday();
  return date === t || date === addDays(t, -1) || date === addDays(t, 1);
}

async function loadDay(env, date) {
  const row = await env.DB.prepare('SELECT prompts FROM days WHERE date = ?').bind(date).first();
  if (row) return { prompts: JSON.parse(row.prompts), source: 'admin' };
  if (SEED_DAYS[date]) return { prompts: SEED_DAYS[date], source: 'seed' };
  // Nothing written for this date yet: replay a seed day so the sky never goes dark.
  const keys = Object.keys(SEED_DAYS).sort();
  const n = dayNumber(date);
  const pick = keys[(((n - 1) % keys.length) + keys.length) % keys.length];
  return { prompts: SEED_DAYS[pick], source: 'fallback:' + pick };
}

function compile(prompt) {
  const list = parseAnswerList(prompt.answers);
  return { list, index: buildIndex(list), estTotal: list.reduce((s, a) => s + a.est, 0) };
}

async function countsFor(env, date, idx) {
  const { results } = await env.DB.prepare('SELECT answer_key, count FROM answer_counts WHERE date = ? AND idx = ?')
    .bind(date, idx).all();
  const map = new Map(results.map((r) => [r.answer_key, r.count]));
  let total = 0;
  for (const c of map.values()) total += c;
  return { map, total };
}

function shareOf(entry, compiled, counts) {
  return blendedShare({
    est: entry.est,
    estTotal: compiled.estTotal,
    count: counts.map.get(normalize(entry.answer)) || 0,
    total: counts.total,
  });
}

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ---------- player routes ----------

async function getDay(env, url) {
  const date = url.searchParams.get('date');
  const player = url.searchParams.get('player') || '';
  if (!playableDate(date)) return bad('date out of range');
  const day = await loadDay(env, date);
  let played = [];
  if (ID_RE.test(player)) {
    const { results } = await env.DB.prepare(
      'SELECT idx, answer_idx, raw, points FROM submissions WHERE date = ? AND player_id = ? ORDER BY idx',
    ).bind(date, player).all();
    played = results.map((r) => {
      const c = r.answer_idx == null ? null : compile(day.prompts[r.idx]).list[r.answer_idx];
      return { idx: r.idx, points: r.points, answer: c ? c.answer : null, raw: r.raw };
    });
  }
  return json({
    date,
    dayNumber: dayNumber(date),
    seconds: SECONDS_PER_PROMPT,
    prompts: day.prompts.map((p) => p.prompt),
    played,
  });
}

async function postAnswer(env, req) {
  const { date, idx, text, player } = await readBody(req);
  if (!playableDate(date)) return bad('date out of range');
  if (!ID_RE.test(player || '')) return bad('bad player');
  if (!Number.isInteger(idx) || idx < 0 || idx >= PROMPTS_PER_DAY) return bad('bad idx');
  const raw = String(text || '').slice(0, 80).trim();
  if (!raw) return bad('empty');

  const existing = await env.DB.prepare('SELECT points FROM submissions WHERE date = ? AND idx = ? AND player_id = ?')
    .bind(date, idx, player).first();
  if (existing) return json({ already: true, points: existing.points });

  const day = await loadDay(env, date);
  const compiled = compile(day.prompts[idx]);
  const m = matchAnswer(raw, compiled.index);
  if (!m) {
    await env.DB.prepare(
      'INSERT INTO misses (date, idx, text, count) VALUES (?, ?, ?, 1) ON CONFLICT(date, idx, text) DO UPDATE SET count = count + 1',
    ).bind(date, idx, normalize(raw).slice(0, 60) || raw.toLowerCase()).run();
    return json({ valid: false });
  }
  const entry = compiled.list[m.index];
  const counts = await countsFor(env, date, idx);
  const share = shareOf(entry, compiled, counts);
  const points = pointsForShare(share);
  const key = normalize(entry.answer);

  const ins = await env.DB.prepare(
    'INSERT OR IGNORE INTO submissions (date, idx, player_id, answer_idx, raw, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(date, idx, player, m.index, raw, points, Date.now()).run();
  if (ins.meta.changes) {
    await env.DB.prepare(
      'INSERT INTO answer_counts (date, idx, answer_key, count) VALUES (?, ?, ?, 1) ON CONFLICT(date, idx, answer_key) DO UPDATE SET count = count + 1',
    ).bind(date, idx, key).run();
  }
  return json({ valid: true, answer: entry.answer, how: m.how, points, share, players: counts.total + 1 });
}

async function postTimeout(env, req) {
  const { date, idx, player } = await readBody(req);
  if (!playableDate(date) || !ID_RE.test(player || '') || !Number.isInteger(idx)) return bad('bad request');
  await env.DB.prepare(
    'INSERT OR IGNORE INTO submissions (date, idx, player_id, answer_idx, raw, points, created_at) VALUES (?, ?, ?, NULL, NULL, 0, ?)',
  ).bind(date, idx, player, Date.now()).run();
  return json({ ok: true });
}

// Top answers per prompt: only for players who've finished the day, so no spoilers.
async function getStats(env, url) {
  const date = url.searchParams.get('date');
  const player = url.searchParams.get('player') || '';
  if (!DATE_RE.test(date || '') || !ID_RE.test(player)) return bad('bad request');
  const done = await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions WHERE date = ? AND player_id = ?')
    .bind(date, player).first();
  if ((done?.n || 0) < PROMPTS_PER_DAY) return bad('finish the day first', 403);
  const day = await loadDay(env, date);
  const prompts = [];
  for (let i = 0; i < day.prompts.length; i++) {
    const compiled = compile(day.prompts[i]);
    const counts = await countsFor(env, date, i);
    const ranked = compiled.list
      .map((a) => ({ answer: a.answer, share: shareOf(a, compiled, counts) }))
      .sort((a, b) => b.share - a.share);
    prompts.push({ top: ranked.slice(0, 3), players: counts.total, rarest: ranked[ranked.length - 1] });
  }
  return json({ date, prompts });
}

async function profileRoute(env, req, url) {
  const player = url.searchParams.get('player') || '';
  if (!ID_RE.test(player)) return bad('bad player');
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT profile, premium FROM players WHERE id = ?').bind(player).first();
    return json(row ? { profile: JSON.parse(row.profile), premium: !!row.premium } : { profile: null, premium: false });
  }
  const body = await readBody(req);
  const profile = JSON.stringify(body.profile || {});
  if (profile.length > 50000) return bad('profile too large');
  await env.DB.prepare(
    'INSERT INTO players (id, profile, premium, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at',
  ).bind(player, profile, Date.now()).run();
  return json({ ok: true });
}

// STUB: marks the player as an "Unlimited Skies" owner without charging anything.
// Replace with Stripe Checkout + a webhook that flips `premium` once payment succeeds.
async function postPurchase(env, req) {
  const { player, sku } = await readBody(req);
  if (!ID_RE.test(player || '') || sku !== 'unlimited-skies') return bad('bad request');
  await env.DB.prepare(
    `INSERT INTO players (id, profile, premium, updated_at) VALUES (?, '{}', 1, ?)
     ON CONFLICT(id) DO UPDATE SET premium = 1, updated_at = excluded.updated_at`,
  ).bind(player, Date.now()).run();
  return json({ ok: true, premium: true, stub: true });
}

async function isPremium(env, player) {
  if (!ID_RE.test(player || '')) return false;
  const row = await env.DB.prepare('SELECT premium FROM players WHERE id = ?').bind(player).first();
  return !!row?.premium;
}

async function getPacks(env, url) {
  const premium = await isPremium(env, url.searchParams.get('player'));
  const packs = PACKS.map((p) => ({
    id: p.id, name: p.name, blurb: p.blurb, emoji: p.emoji, count: p.prompts.length,
    prompts: premium ? p.prompts.map((q) => q.prompt) : undefined,
  }));
  // "Past Skies": every seed day's prompts, shuffled client-side.
  const past = premium
    ? Object.values(SEED_DAYS).flat().map((p) => p.prompt)
    : undefined;
  return json({ premium, packs, past });
}

async function postPractice(env, req) {
  const { player, pack, idx, text } = await readBody(req);
  if (!(await isPremium(env, player))) return bad('Unlimited Skies required', 402);
  const prompts = pack === 'past' ? Object.values(SEED_DAYS).flat() : PACKS.find((p) => p.id === pack)?.prompts;
  const prompt = prompts?.[idx];
  if (!prompt) return bad('bad prompt');
  const compiled = compile(prompt);
  const m = matchAnswer(String(text || '').slice(0, 80), compiled.index);
  if (!m) return json({ valid: false });
  const entry = compiled.list[m.index];
  const share = blendedShare({ est: entry.est, estTotal: compiled.estTotal, count: 0, total: 0 });
  return json({ valid: true, answer: entry.answer, points: pointsForShare(share), share });
}

// ---------- admin ----------

function isAdmin(env, req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

function validateDay(prompts) {
  if (!Array.isArray(prompts) || prompts.length !== PROMPTS_PER_DAY) return `need exactly ${PROMPTS_PER_DAY} prompts`;
  for (const [i, p] of prompts.entries()) {
    if (!p || typeof p.prompt !== 'string' || !p.prompt.trim()) return `prompt ${i + 1} is empty`;
    if (parseAnswerList(p.answers).length < 3) return `prompt ${i + 1} needs at least 3 answers`;
  }
  return null;
}

async function admin(env, req, url) {
  if (!isAdmin(env, req)) return bad('unauthorized', 401);
  const path = url.pathname.replace('/api/admin', '');
  if (path === '/days' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT date, updated_at FROM days ORDER BY date').all();
    const saved = new Map(results.map((r) => [r.date, r.updated_at]));
    const start = [addDays(utcToday(), -7), LAUNCH_DATE].sort()[1];
    const dates = new Set([...Object.keys(SEED_DAYS), ...saved.keys()]);
    for (let i = 0; i < 45; i++) dates.add(addDays(start, i));
    const list = [...dates].filter((d) => d >= LAUNCH_DATE).sort().map((d) => ({
      date: d,
      dayNumber: dayNumber(d),
      source: saved.has(d) ? 'admin' : SEED_DAYS[d] ? 'seed' : 'empty',
      updatedAt: saved.get(d) || null,
    }));
    return json({ today: utcToday(), days: list });
  }
  if (path === '/day') {
    const date = req.method === 'GET' || req.method === 'DELETE' ? url.searchParams.get('date') : null;
    if (req.method === 'GET') {
      if (!DATE_RE.test(date || '')) return bad('bad date');
      const day = await loadDay(env, date);
      const stats = [];
      for (let i = 0; i < day.prompts.length; i++) {
        const counts = await countsFor(env, date, i);
        const { results: misses } = await env.DB.prepare(
          'SELECT text, count FROM misses WHERE date = ? AND idx = ? ORDER BY count DESC LIMIT 40',
        ).bind(date, i).all();
        stats.push({ players: counts.total, counts: Object.fromEntries(counts.map), misses });
      }
      return json({ date, dayNumber: dayNumber(date), source: day.source, prompts: day.prompts, stats });
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!DATE_RE.test(body.date || '')) return bad('bad date');
      const err = validateDay(body.prompts);
      if (err) return bad(err);
      const prompts = body.prompts.map((p) => ({ prompt: p.prompt.trim(), answers: String(p.answers) }));
      await env.DB.prepare(
        'INSERT INTO days (date, prompts, updated_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET prompts = excluded.prompts, updated_at = excluded.updated_at',
      ).bind(body.date, JSON.stringify(prompts), Date.now()).run();
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM days WHERE date = ?').bind(date).run();
      return json({ ok: true });
    }
  }
  return bad('not found', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      const p = url.pathname;
      if (p.startsWith('/api/admin')) return await admin(env, req, url);
      if (p === '/api/day' && req.method === 'GET') return await getDay(env, url);
      if (p === '/api/answer' && req.method === 'POST') return await postAnswer(env, req);
      if (p === '/api/timeout' && req.method === 'POST') return await postTimeout(env, req);
      if (p === '/api/stats' && req.method === 'GET') return await getStats(env, url);
      if (p === '/api/profile') return await profileRoute(env, req, url);
      if (p === '/api/purchase' && req.method === 'POST') return await postPurchase(env, req);
      if (p === '/api/packs' && req.method === 'GET') return await getPacks(env, url);
      if (p === '/api/practice' && req.method === 'POST') return await postPractice(env, req);
      return bad('not found', 404);
    } catch (e) {
      console.error(e);
      return bad('server error', 500);
    }
  },
};
