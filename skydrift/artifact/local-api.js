// Artifact build only: stands in for src/worker.js. Same routes, answered in the page.
// Shared rarity lives in the artifact's db: plays/<viewer id> = { date, picks: {idx: answerKey}, misses: {idx: [text]} }.
// Admin-written days live in days/<date> = { prompts: [{prompt, answers}] } (editors only).

const SKY = { db: null, user: null, uid: null, canEdit: false, plays: [], playsReady: false, dayCache: {} };
const subsKey = (date) => `skydrift.subs.${date}`;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

async function connectSky() {
  try {
    if (!window.claude?.use) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    SKY.db = db;
    SKY.user = user;
    if (user) {
      SKY.uid = await user.id();
      SKY.canEdit = !!(await user.canEdit());
    }
    if (db) {
      const date = localDate();
      db.collection('plays').where('date', '==', date).onSnapshot(
        (snap) => { SKY.plays = snap.docs.map((d) => d.data()); SKY.playsReady = true; },
        () => { SKY.playsReady = false; },
      );
    }
    document.dispatchEvent(new CustomEvent('sky-connected'));
  } catch {}
}

async function dayContent(date) {
  if (SKY.dayCache[date]) return SKY.dayCache[date];
  let prompts = null;
  if (SKY.db) {
    try {
      const snap = await Promise.race([SKY.db.doc(`days/${date}`).get(), new Promise((r) => setTimeout(() => r(null), 4000))]);
      if (snap?.exists && Array.isArray(snap.data().prompts) && snap.data().prompts.length === PROMPTS_PER_DAY) prompts = snap.data().prompts;
    } catch {}
  }
  let source = 'admin';
  if (!prompts) {
    if (SEED_DAYS[date]) { prompts = SEED_DAYS[date]; source = 'seed'; }
    else {
      const keys = Object.keys(SEED_DAYS).sort();
      const n = dayNumber(date);
      const pick = keys[(((n - 1) % keys.length) + keys.length) % keys.length];
      prompts = SEED_DAYS[pick];
      source = 'fallback:' + pick;
    }
  }
  return (SKY.dayCache[date] = { prompts, source });
}

function compileP(prompt) {
  const list = parseAnswerList(prompt.answers);
  return { list, index: buildIndex(list), estTotal: list.reduce((s, a) => s + a.est, 0) };
}

// counts for one prompt from everyone else's shared picks today
function sharedCounts(date, idx, excludeUid) {
  const map = new Map();
  let total = 0;
  for (const p of SKY.plays) {
    if (p.date !== date || p.uid === excludeUid) continue;
    const k = p.picks?.[idx];
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
    total += 1;
  }
  return { map, total };
}

function shareFor(entry, compiled, counts) {
  return blendedShare({ est: entry.est, estTotal: compiled.estTotal, count: counts.map.get(normalize(entry.answer)) || 0, total: counts.total });
}

let writeChain = Promise.resolve();
function pushPlay(date, mutate) {
  if (!SKY.db || !SKY.uid) return;
  writeChain = writeChain.then(async () => {
    const ref = SKY.db.doc(`plays/${SKY.uid}`);
    const local = lsGet(`skydrift.play.${date}`, { uid: SKY.uid, date, picks: {}, misses: {} });
    mutate(local);
    lsSet(`skydrift.play.${date}`, local);
    try { await ref.set(local); } catch {}
  });
}

async function localApi(path, body) {
  const url = new URL(path, 'https://sky.local');
  const p = url.pathname;
  const q = (k) => url.searchParams.get(k);

  if (p === '/api/day') {
    const date = q('date');
    const day = await dayContent(date);
    const subs = lsGet(subsKey(date), {});
    const played = Object.entries(subs).map(([idx, s]) => ({
      idx: +idx, points: s.points, raw: s.raw,
      answer: s.answerIdx == null ? null : compileP(day.prompts[idx]).list[s.answerIdx]?.answer ?? s.raw,
    })).sort((a, b) => a.idx - b.idx);
    return { date, dayNumber: dayNumber(date), seconds: SECONDS_PER_PROMPT, prompts: day.prompts.map((x) => x.prompt), played };
  }

  if (p === '/api/answer') {
    const { date, idx, text } = body;
    const subs = lsGet(subsKey(date), {});
    if (subs[idx]) return { already: true, points: subs[idx].points };
    const raw = String(text || '').slice(0, 80).trim();
    const day = await dayContent(date);
    const compiled = compileP(day.prompts[idx]);
    const m = matchAnswer(raw, compiled.index);
    if (!m) {
      pushPlay(date, (d) => { const arr = (d.misses[idx] ||= []); if (arr.length < 10) arr.push(normalize(raw).slice(0, 60)); });
      return { valid: false };
    }
    const entry = compiled.list[m.index];
    const counts = sharedCounts(date, idx, SKY.uid);
    const share = shareFor(entry, compiled, counts);
    const points = pointsForShare(share);
    subs[idx] = { answerIdx: m.index, raw, points };
    lsSet(subsKey(date), subs);
    pushPlay(date, (d) => { d.picks[idx] = normalize(entry.answer); });
    return { valid: true, answer: entry.answer, how: m.how, points, share, players: counts.total + 1 };
  }

  if (p === '/api/timeout') {
    const { date, idx } = body;
    const subs = lsGet(subsKey(date), {});
    if (!subs[idx]) { subs[idx] = { answerIdx: null, raw: null, points: 0 }; lsSet(subsKey(date), subs); }
    return { ok: true };
  }

  if (p === '/api/stats') {
    const date = q('date');
    const day = await dayContent(date);
    const prompts = day.prompts.map((pr, i) => {
      const compiled = compileP(pr);
      const counts = sharedCounts(date, i, null);
      const ranked = compiled.list.map((a) => ({ answer: a.answer, share: shareFor(a, compiled, counts) })).sort((a, b) => b.share - a.share);
      return { top: ranked.slice(0, 3), players: counts.total, rarest: ranked[ranked.length - 1] };
    });
    return { date, prompts };
  }

  if (p === '/api/profile') return { profile: null, premium: !!lsGet('skydrift.premium', false) };

  // STUB: no payment is taken in the artifact build.
  if (p === '/api/purchase') { lsSet('skydrift.premium', true); return { ok: true, premium: true, stub: true }; }

  if (p === '/api/packs') {
    const premium = !!lsGet('skydrift.premium', false);
    return {
      premium,
      packs: PACKS.map((x) => ({ id: x.id, name: x.name, blurb: x.blurb, emoji: x.emoji, count: x.prompts.length, prompts: premium ? x.prompts.map((y) => y.prompt) : undefined })),
      past: premium ? Object.values(SEED_DAYS).flat().map((y) => y.prompt) : undefined,
    };
  }

  if (p === '/api/practice') {
    const { pack, idx, text } = body;
    const prompts = pack === 'past' ? Object.values(SEED_DAYS).flat() : PACKS.find((x) => x.id === pack)?.prompts;
    const prompt = prompts?.[idx];
    if (!prompt) throw new Error('That prompt is missing.');
    const compiled = compileP(prompt);
    const m = matchAnswer(String(text || '').slice(0, 80), compiled.index);
    if (!m) return { valid: false };
    const entry = compiled.list[m.index];
    const share = blendedShare({ est: entry.est, estTotal: compiled.estTotal, count: 0, total: 0 });
    return { valid: true, answer: entry.answer, points: pointsForShare(share), share };
  }
  throw new Error('Unknown request');
}

// ---------- Editor panel (artifact owner and editors) ----------
function openEditor() {
  const today = localDate();
  const body = openModal(`<div class="editor-panel">
    <h2>Prompt editor</h2>
    <p class="stub-note" style="margin-top:0">Write any day’s 7 prompts. One answer per line:<br><code>Answer | alias, misspelling | est%</code></p>
    <div class="ed-row"><label for="ed-date">Date</label><input type="date" id="ed-date" value="${today}"><span class="ed-src" id="ed-src"></span></div>
    <div id="ed-prompts"></div>
    <p class="ed-msg" id="ed-msg"></p>
    <button class="btn btn-gold" id="ed-save">Save day</button>
  </div>`);
  const load = async () => {
    const date = body.querySelector('#ed-date').value;
    delete SKY.dayCache[date];
    const day = await dayContent(date);
    body.querySelector('#ed-src').textContent = day.source === 'admin' ? 'saved' : day.source === 'seed' ? 'seed day' : `empty: replays ${day.source.split(':')[1]}`;
    const misses = {};
    for (const pl of SKY.plays) if (pl.date === date) for (const [i, arr] of Object.entries(pl.misses || {})) for (const t of arr) { (misses[i] ||= {}); misses[i][t] = (misses[i][t] || 0) + 1; }
    body.querySelector('#ed-prompts').innerHTML = day.prompts.map((pr, i) => {
      const counts = sharedCounts(date, i, null);
      const ms = Object.entries(misses[i] || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
      return `<div class="ed-prompt"><label for="ed-q${i}">Prompt ${i + 1} <small>${counts.total} players today</small></label>
        <input id="ed-q${i}" class="ed-q" value="${esc(pr.prompt)}">
        <textarea id="ed-a${i}" class="ed-a" wrap="off" spellcheck="false">${esc(String(pr.answers).trim())}</textarea>
        ${ms.length ? `<p class="ed-miss">Not recognised: ${ms.map(([t, n]) => `<button type="button" data-i="${i}" data-t="${esc(t)}">+ ${esc(t)} ×${n}</button>`).join(' ')}</p>` : ''}</div>`;
    }).join('');
  };
  body.querySelector('#ed-date').onchange = load;
  body.querySelector('#ed-prompts').onclick = (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    const ta = body.querySelector(`#ed-a${b.dataset.i}`);
    ta.value = ta.value.replace(/\s*$/, '') + `\n${b.dataset.t} |  | 0.5`;
    b.remove();
  };
  body.querySelector('#ed-save').onclick = async () => {
    const msg = body.querySelector('#ed-msg');
    const date = body.querySelector('#ed-date').value;
    const prompts = [...body.querySelectorAll('.ed-prompt')].map((el) => ({ prompt: el.querySelector('.ed-q').value.trim(), answers: el.querySelector('.ed-a').value }));
    const bad = prompts.findIndex((x) => !x.prompt || parseAnswerList(x.answers).length < 3);
    if (bad >= 0) { msg.textContent = `Prompt ${bad + 1} needs text and at least 3 answers.`; msg.className = 'ed-msg err'; return; }
    try {
      await SKY.db.doc(`days/${date}`).set({ prompts, updatedAt: Date.now() });
      SKY.dayCache[date] = { prompts, source: 'admin' };
      msg.textContent = `Saved ${date}. Players get these prompts that day.`;
      msg.className = 'ed-msg ok';
    } catch (err) {
      msg.textContent = `Couldn’t save: ${err.message || err.code}. Only the artifact’s owner and editors can save.`;
      msg.className = 'ed-msg err';
    }
  };
  load();
}
