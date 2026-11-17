// SKYDRIFT ISLES: screens and the daily game loop.
import { CONFIG } from '../config.js';
import {
  tierFor, layerFor, LANDMARKS, FEET_PER_POINT, PROMPTS_PER_DAY, dayNumber, TIERS,
} from '../shared/score.js';
import { loadProfile, saveProfile, localDate, liveStreak, completeDay } from './profile.js';
import { initSky, setAltitude, sparkle, mountGlider, isNight } from './sky.js';
import { ACTIVE_THEME } from '../themes.js';
// TEMPORARY: remove with the theme picker
import { initialTheme, initThemePicker } from './theme-picker.js';
import { sfx, setMuted, unlock as unlockAudio } from './audio.js';
import {
  awardForAnswer, awardForDay, renderCreatures, renderMaps, medalHTML, CREATURES, MAPS, FRAGMENTS_PER_MAP,
} from './collection.js';

const $ = (id) => document.getElementById(id);
const profile = loadProfile();
let state = null; // the flight in progress
let timerRAF = 0;
let countdownTimer = 0;

// ---------- api ----------
async function api(path, body) {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

// ---------- helpers ----------
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${screen}`;
  document.body.className = document.body.className.replace(/\bon-\w+/g, '').trim() + ` on-${screen}`;
  if (profile.premium) document.body.classList.add('premium');
  document.body.classList.toggle('night', isNight());
}

// One toast at a time, so unlocks don't pile up over the prompt.
const toastQueue = [];
let toastBusy = false;
function toast(html, onShow) {
  toastQueue.push({ html, onShow });
  if (!toastBusy) nextToast();
}
function nextToast() {
  const item = toastQueue.shift();
  if (!item) { toastBusy = false; return; }
  toastBusy = true;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = item.html;
  $('toasts').appendChild(t);
  item.onShow?.();
  setTimeout(() => t.remove(), 3700);
  setTimeout(nextToast, 2600);
}

function openModal(content) {
  const body = $('modal-body');
  body.innerHTML = '';
  if (content instanceof HTMLTemplateElement) body.appendChild(content.content.cloneNode(true));
  else body.innerHTML = content;
  $('modal').hidden = false;
  return body;
}
function closeModal() { $('modal').hidden = true; }
$('modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

function msUntilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}
function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function tierClass(points) { return `tier-${tierFor(points).id}`; }

function shareLine(share, points) {
  const pct = share * 100;
  const p = pct < 0.1 ? '<0.1' : pct < 10 ? pct.toFixed(1) : Math.round(pct);
  const flavor = { legendary: 'Almost nobody thought of this!', rare: 'A rare find.', uncommon: 'Off the beaten cloud.', common: 'A crowd favourite.' }[tierFor(points).id];
  return `${p}% of pilots said this. ${flavor}`;
}

// ---------- home ----------
function today() { return localDate(); }

function renderHome() {
  const t = today();
  const day = profile.days[t];
  const streak = liveStreak(profile, t);
  $('streak-count').textContent = streak;
  $('btn-streak').classList.toggle('cold', streak === 0);
  $('home-day').textContent = `Day #${dayNumber(t)} · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const btn = $('btn-play');
  clearInterval(countdownTimer);
  if (day?.done) {
    btn.innerHTML = `<span>See today’s flight</span><span class="countdown" id="home-countdown"></span>`;
    $('home-note').textContent = `You reached ${layerFor(day.total).name} · ${day.total}/700`;
    const tick = () => { const el = $('home-countdown'); if (el) el.textContent = `Next skies in ${hms(msUntilMidnight())}`; if (msUntilMidnight() < 1000) setTimeout(renderHome, 1500); };
    tick();
    countdownTimer = setInterval(tick, 1000);
    setAltitude(day.total);
  } else {
    const started = day?.results?.filter(Boolean).length || 0;
    btn.innerHTML = started ? `<span>Keep flying (${started}/7)</span>` : '<span>Take off</span>';
    $('home-note').textContent = '7 prompts · 25 seconds each';
    setAltitude(sumPoints(day?.results || []));
  }
  show('home');
}

function sumPoints(results) { return results.reduce((s, r) => s + (r?.points || 0), 0); }

// ---------- daily flight ----------
async function startDaily() {
  unlockAudio();
  const date = today();
  const day = profile.days[date];
  if (day?.done) return showResults(date);
  $('btn-play').disabled = true;
  try {
    const data = await api(`/api/day?date=${date}&player=${profile.id}`);
    const results = Array(data.prompts.length).fill(null);
    for (const r of data.played) results[r.idx] = { points: r.points, answer: r.answer, raw: r.raw };
    profile.days[date] = { ...(profile.days[date] || {}), results, prompts: data.prompts, total: sumPoints(results) };
    saveProfile(profile);
    state = { mode: 'daily', date, prompts: data.prompts, results, seconds: data.seconds, idx: results.findIndex((r) => !r) };
    if (state.idx === -1) return finishFlight();
    sfx.start();
    show('play');
    setAltitude(sumPoints(results));
    nextPrompt();
  } catch (e) {
    toast(`☁️ Couldn’t reach the sky server. ${esc(e.message)}`);
  } finally {
    $('btn-play').disabled = false;
  }
}

function renderDots() {
  $('hud-dots').innerHTML = state.prompts.map((_, i) => {
    const r = state.results[i];
    const style = r ? `style="background:${tierFor(r.points).color}"` : '';
    return `<i class="${i === state.idx ? 'now' : ''}" ${style}></i>`;
  }).join('');
  const alt = sumPoints(state.results);
  $('hud-feet').textContent = fmt(alt * FEET_PER_POINT);
  $('hud-layer').textContent = layerFor(alt).name;
}

function startedKey() { return `skydrift.started.${state.mode}.${state.date}.${state.idx}`; }

function nextPrompt() {
  if (state.idx >= state.prompts.length) return finishFlight();
  state.locked = false;
  state.busy = false;
  renderDots();
  $('prompt-label').textContent = `Prompt ${state.idx + 1} of ${state.prompts.length}`;
  $('prompt-text').textContent = state.prompts[state.idx];
  const card = $('prompt-card');
  card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
  $('answer-form').hidden = false;
  $('answer-hint').hidden = false;
  $('answer-hint').className = 'answer-hint';
  $('answer-hint').textContent = 'Any real answer counts. Rarer answers score more.';
  $('reveal').hidden = true;
  $('timer').hidden = false;
  const input = $('answer-input');
  input.value = '';
  input.disabled = false;
  setTimeout(() => input.focus({ preventScroll: true }), 60);

  // The clock keeps running across reloads, so refreshing can't buy extra time.
  let startedAt = Date.now();
  if (state.mode === 'daily') {
    const saved = Number(localStorage.getItem(startedKey()));
    if (saved && Date.now() - saved < 60 * 60 * 1000) startedAt = saved;
    else try { localStorage.setItem(startedKey(), String(startedAt)); } catch {}
  }
  runTimer(startedAt);
}

function runTimer(startedAt) {
  cancelAnimationFrame(timerRAF);
  const total = state.seconds * 1000;
  let lastSec = null;
  const frame = () => {
    const left = Math.max(0, total - (Date.now() - startedAt));
    const sec = Math.ceil(left / 1000);
    $('timer-fill').style.transform = `scaleX(${left / total})`;
    $('timer-num').textContent = sec;
    $('timer').classList.toggle('low', sec <= 5);
    if (sec !== lastSec && sec <= 5 && sec > 0 && lastSec !== null) sfx.tick(sec === 1);
    lastSec = sec;
    if (left <= 0) return timeUp();
    timerRAF = requestAnimationFrame(frame);
  };
  frame();
}

async function timeUp() {
  if (state.locked) return;
  state.locked = true;
  cancelAnimationFrame(timerRAF);
  sfx.timeout();
  $('answer-input').disabled = true;
  if (state.mode === 'daily') api('/api/timeout', { date: state.date, idx: state.idx, player: profile.id }).catch(() => {});
  recordResult({ points: 0, answer: null, raw: null });
  showReveal({ points: 0, answer: 'Lost in the clouds', line: 'Time’s up. The wind carried that one away.' });
}

async function submitAnswer(e) {
  e.preventDefault();
  if (!state || state.locked || state.busy) return;
  const input = $('answer-input');
  const text = input.value.trim();
  if (!text) return shakeForm();
  state.busy = true;
  sfx.tap();
  try {
    const res = state.mode === 'daily'
      ? await api('/api/answer', { date: state.date, idx: state.idx, text, player: profile.id })
      : await api('/api/practice', { player: profile.id, pack: state.pack, idx: state.order[state.idx], text });
    if (state.locked) return;
    if (res.already) {
      state.locked = true;
      cancelAnimationFrame(timerRAF);
      recordResult({ points: res.points, answer: text, raw: text });
      return showReveal({ points: res.points, answer: text, line: 'You already answered this one.' });
    }
    if (!res.valid) {
      sfx.invalid();
      shakeForm();
      const hint = $('answer-hint');
      hint.className = 'answer-hint bad';
      hint.textContent = `The clouds don’t recognise “${text}”. Try another!`;
      input.select();
      return;
    }
    state.locked = true;
    cancelAnimationFrame(timerRAF);
    input.blur();
    recordResult({ points: res.points, answer: res.answer, raw: text });
    sfx.valid(tierFor(res.points).id);
    showReveal({ points: res.points, answer: res.answer, line: shareLine(res.share, res.points) });
  } catch (err) {
    toast(`☁️ ${esc(err.message)}`);
  } finally {
    state.busy = false;
  }
}

function shakeForm() {
  const f = $('answer-form');
  f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
}

function recordResult(r) {
  const before = sumPoints(state.results);
  state.results[state.idx] = r;
  const after = before + r.points;
  if (state.mode === 'daily') {
    const day = profile.days[state.date];
    day.results = state.results;
    day.total = after;
    const finds = awardForAnswer(profile, { date: state.date, idx: state.idx, points: r.points });
    day.finds = [...(day.finds || []), ...finds];
    saveProfile(profile);
    setTimeout(() => announceFinds(finds), 900);
  }
  if (r.points > 0) {
    setTimeout(() => {
      setAltitude(after);
      sparkle(r.points >= 75 ? 22 : 12);
      sfx.whoosh();
      renderDots();
      const passed = LANDMARKS.filter((l) => l.at > before && l.at <= after).pop();
      if (passed) showLandmark(passed);
    }, 350);
  } else {
    renderDots();
  }
}

function announceFinds(finds) {
  for (const f of finds) {
    if (f.kind === 'creature') toast(`${medalHTML(f.creature)}<div><small>New sky creature</small>${esc(f.creature.name)}</div>`, sfx.unlock);
    else toast(`<div class="medal" style="--m1:#fff6d6;--m2:#e8b84a">🧩</div><div><small>Map fragment ${f.n}/${FRAGMENTS_PER_MAP}</small>${esc(f.map.name)}</div>`, sfx.unlock);
  }
}

function showLandmark(lm) {
  const el = $('landmark-toast');
  el.hidden = false;
  el.innerHTML = `<small>You flew past</small>${lm.icon} ${esc(lm.name)}`;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(showLandmark.t);
  showLandmark.t = setTimeout(() => { el.hidden = true; }, 3300);
}

function showReveal({ points, answer, line }) {
  $('answer-form').hidden = true;
  $('answer-hint').hidden = true;
  $('timer').hidden = true;
  const tier = tierFor(points);
  const badge = $('reveal-tier');
  badge.className = `tier-badge ${tierClass(points)}`;
  badge.textContent = tier.label;
  $('reveal-answer').textContent = answer;
  $('reveal-share').textContent = line;
  $('btn-next').textContent = state.idx + 1 >= state.prompts.length ? 'Land & see results ➜' : 'Next ➜';
  $('reveal').hidden = false;
  // count the points up
  const el = $('reveal-points');
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    el.textContent = Math.round(points * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => $('btn-next').focus({ preventScroll: true }), 50);
}

function advance() {
  sfx.tap();
  state.idx += 1;
  if (state.idx >= state.prompts.length) finishFlight();
  else nextPrompt();
}

function finishFlight() {
  cancelAnimationFrame(timerRAF);
  if (state.mode === 'practice') return finishPractice();
  const date = state.date;
  const day = profile.days[date];
  day.total = sumPoints(state.results);
  day.done = true;
  completeDay(profile, date);
  const finds = awardForDay(profile, date);
  day.finds = [...(day.finds || []), ...finds];
  saveProfile(profile);
  sfx.finish();
  state = null;
  showResults(date);
  if (finds.length) setTimeout(sfx.unlock, 900);
}

// ---------- results ----------
function emojiRow(results) {
  return results.map((r) => tierFor(r?.points || 0).emoji).join('');
}

function shareText(date) {
  const day = profile.days[date];
  const layer = layerFor(day.total);
  const streak = liveStreak(profile, today());
  return [
    `SKYDRIFT ISLES #${dayNumber(date)} 🪂`,
    emojiRow(day.results),
    `${day.total}/700 · ${layer.name} · ${fmt(day.total * FEET_PER_POINT)} ft`,
    streak > 1 ? `🔥 ${streak}-day streak` : null,
    CONFIG.SHARE_URL,
  ].filter(Boolean).join('\n');
}

async function showResults(date) {
  const day = profile.days[date];
  if (!day) return renderHome();
  setAltitude(day.total);
  show('results');
  $('screen-results').scrollTop = 0;
  $('res-day').textContent = `Day #${dayNumber(date)} · flight complete`;
  $('res-layer').textContent = layerFor(day.total).name;
  $('res-feet').textContent = fmt(day.total * FEET_PER_POINT);
  $('res-score').textContent = day.total;
  $('res-emoji').textContent = emojiRow(day.results);
  const streak = liveStreak(profile, today());
  $('res-streak').textContent = streak ? `🔥 ${streak}-day streak${profile.best > streak ? ` · best ${profile.best}` : ''}` : '';
  $('share-done').hidden = true;

  const finds = day.finds || [];
  $('res-finds').hidden = !finds.length;
  const frags = finds.filter((f) => f.kind === 'fragment');
  $('res-finds-row').innerHTML = finds.filter((f) => f.kind === 'creature')
    .map((f) => `<div class="creature">${medalHTML(f.creature)}${esc(f.creature.name)}<small>${esc(f.creature.blurb)}</small></div>`).join('')
    + (frags.length ? `<div class="creature"><div class="medal" style="--m1:#fff6d6;--m2:#e8b84a">🧩</div>+${frags.length} map fragment${frags.length > 1 ? 's' : ''}<small>${esc(frags[frags.length - 1].map.name)}</small></div>` : '');

  const list = $('res-list');
  const renderList = (stats) => {
    list.innerHTML = (day.prompts || []).map((q, i) => {
      const r = day.results[i] || { points: 0 };
      const top = stats?.prompts?.[i]?.top?.[0];
      const most = top ? `Most said: ${esc(top.answer)} (${Math.round(top.share * 100)}%)` : '';
      return `<li style="--c:${tierFor(r.points).color}"><span class="q">${esc(q)}</span>
        <span class="a">${r.answer ? esc(r.answer) : '☁️ Lost in the clouds'}</span><span class="p">${r.points}</span>
        <span class="m">${most}</span></li>`;
    }).join('');
  };
  renderList(null);
  api(`/api/stats?date=${date}&player=${profile.id}`).then(renderList).catch(() => {});

  $('promo-glydrift').href = CONFIG.GLYDRIFT_URL;
  clearInterval(countdownTimer);
  const tick = () => { $('res-countdown').textContent = hms(msUntilMidnight()); };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function share() {
  sfx.tap();
  const date = profile.days[today()]?.done ? today() : Object.keys(profile.days).filter((d) => profile.days[d].done).sort().pop();
  if (!date) return;
  const text = shareText(date);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  $('share-done').hidden = false;
}

// ---------- collection ----------
function showCollection(tab = 'creatures') {
  renderCreatures($('col-creatures'), profile);
  renderMaps($('col-maps'), profile);
  const got = CREATURES.filter((c) => profile.creatures[c.id]).length;
  $('col-creature-count').textContent = `${got}/${CREATURES.length}`;
  $('col-fragment-count').textContent = `${Math.min(profile.fragments, MAPS.length * FRAGMENTS_PER_MAP)}/${MAPS.length * FRAGMENTS_PER_MAP}`;
  setTab(tab);
  show('collection');
}
function setTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('col-creatures').hidden = tab !== 'creatures';
  $('col-maps').hidden = tab !== 'maps';
}

// ---------- Unlimited Skies (stub purchase) + practice ----------
function openUnlimited() {
  sfx.tap();
  if (profile.premium) return showPractice();
  const body = openModal(`<div class="premium-sheet">
    <h2>✦ Unlimited Skies</h2>
    <p class="price">${CONFIG.PRICE}<small>one-time · yours forever</small></p>
    <ul>
      <li><span>🪂</span>Practice mode: fly as often as you like</li>
      <li><span>🐉</span>Themed packs: Dragon Daycare, Pirate Kitchen, Haunted Gift Shop</li>
      <li><span>☁️</span>Past Skies: replay every earlier day</li>
      <li><span>🚫</span>No ads, ever</li>
    </ul>
    <button class="btn btn-gold" id="btn-buy">Unlock for ${CONFIG.PRICE}</button>
    <p class="stub-note">The daily game is always free.</p>
  </div>`);
  body.querySelector('#btn-buy').onclick = openCheckout;
}

function openCheckout() {
  const body = openModal(`<div class="checkout">
    <h2>Checkout</h2>
    <p class="stub-note" style="margin-top:0">Test mode: payments aren’t connected yet. No card will be charged.</p>
    <div class="fake-field">Unlimited Skies · ${CONFIG.PRICE}</div>
    <div class="fake-field">•••• •••• •••• 4242</div>
    <button class="btn btn-gold" id="btn-confirm">Confirm purchase</button>
    <button class="btn btn-glass" data-close>Cancel</button>
  </div>`);
  body.querySelector('#btn-confirm').onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api('/api/purchase', { player: profile.id, sku: 'unlimited-skies' });
      profile.premium = true;
      saveProfile(profile);
      document.body.classList.add('premium');
      closeModal();
      sfx.unlock();
      toast('<div class="medal" style="--m1:#fff6d6;--m2:#e8b84a">✦</div><div><small>Unlocked</small>Unlimited Skies</div>');
      showPractice();
    } catch (err) {
      e.target.disabled = false;
      toast(`☁️ ${esc(err.message)}`);
    }
  };
}

let packsCache = null;
async function showPractice() {
  show('practice');
  const list = $('pack-list');
  list.innerHTML = '<p class="practice-intro">Loading packs…</p>';
  try {
    packsCache = await api(`/api/packs?player=${profile.id}`);
    const items = [
      { id: 'past', name: 'Past Skies', blurb: 'Seven random prompts from earlier days.', emoji: '🌤️', prompts: packsCache.past },
      ...packsCache.packs,
    ];
    list.innerHTML = items.map((p) => `<button class="pack" data-pack="${p.id}"><span class="em">${p.emoji}</span>
      <span><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></span></button>`).join('');
    list.onclick = (e) => {
      const b = e.target.closest('[data-pack]');
      if (!b) return;
      const pack = items.find((p) => p.id === b.dataset.pack);
      startPractice(pack);
    };
  } catch (err) {
    list.innerHTML = `<p class="practice-intro">Couldn’t load packs: ${esc(err.message)}</p>`;
  }
}

function startPractice(pack) {
  unlockAudio();
  const all = pack.prompts.map((_, i) => i);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const order = all.slice(0, Math.min(PROMPTS_PER_DAY, all.length));
  state = {
    mode: 'practice', pack: pack.id, packName: pack.name, order, date: 'practice',
    prompts: order.map((i) => pack.prompts[i]), results: Array(order.length).fill(null), seconds: 25, idx: 0,
  };
  sfx.start();
  show('play');
  setAltitude(0);
  nextPrompt();
}

function finishPractice() {
  const total = sumPoints(state.results);
  const name = state.packName;
  const row = emojiRow(state.results);
  state = null;
  sfx.finish();
  const body = openModal(`<div style="text-align:center"><h2>${esc(name)}</h2>
    <p class="res-emoji">${row}</p><p class="reveal-points"><b>${total}</b><span>pts</span></p>
    <p class="stub-note">Practice flights don’t count toward rarity or your streak.</p>
    <button class="btn btn-gold" id="btn-again">Fly another</button></div>`);
  body.querySelector('#btn-again').onclick = () => { closeModal(); showPractice(); };
}

// ---------- wiring ----------
function quitFlight() {
  sfx.tap();
  cancelAnimationFrame(timerRAF);
  const wasPractice = state?.mode === 'practice';
  state = null;
  if (wasPractice) showPractice();
  else renderHome();
}

function setSoundIcon() {
  $('btn-sound').textContent = profile.muted ? '🔇' : '🔊';
  $('btn-sound').setAttribute('aria-label', profile.muted ? 'Sound off' : 'Sound on');
}

function wire() {
  $('btn-play').onclick = startDaily;
  $('answer-form').addEventListener('submit', submitAnswer);
  $('btn-next').onclick = advance;
  $('btn-quit').onclick = quitFlight;
  $('btn-share').onclick = share;
  $('btn-res-home').onclick = () => { sfx.tap(); renderHome(); };
  $('btn-res-collection').onclick = () => { sfx.tap(); showCollection(); };
  $('btn-collection').onclick = () => { sfx.tap(); showCollection(); };
  $('btn-col-back').onclick = () => { sfx.tap(); renderHome(); };
  $('btn-pr-back').onclick = () => { sfx.tap(); renderHome(); };
  document.querySelector('.tabs').onclick = (e) => { const t = e.target.closest('.tab'); if (t) { sfx.tap(); setTab(t.dataset.tab); } };
  $('btn-howto').onclick = () => { sfx.tap(); openModal($('tpl-howto')); };
  $('btn-credits').onclick = () => { sfx.tap(); openModal($('tpl-credits')); };
  $('btn-unlimited').onclick = openUnlimited;
  $('btn-streak').onclick = () => {
    sfx.tap();
    const s = liveStreak(profile, today());
    openModal(`<div style="text-align:center"><h2>🔥 ${s}-day streak</h2>
      <p>Best streak: <b>${profile.best}</b></p>
      <p class="stub-note">Fly every day to keep it alive. Streak friends join you at 3, 7, 14 and 30 days.</p>
      <button class="btn btn-gold" data-close>Keep flying</button></div>`);
  };
  $('btn-sound').onclick = () => {
    profile.muted = !profile.muted;
    setMuted(profile.muted);
    saveProfile(profile, false);
    setSoundIcon();
    sfx.tap();
  };
  // Leaving the tab mid-prompt doesn't pause the clock (it's wall-clock based), but resume the frame loop.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state && !state.locked && $('screen-play').hidden === false) {
      const saved = Number(localStorage.getItem(startedKey()));
      if (saved) runTimer(saved);
    }
  });
}

async function init() {
  setMuted(profile.muted);
  setSoundIcon();
  initSky(initialTheme(ACTIVE_THEME)); // TEMPORARY: after picking a theme this becomes initSky(ACTIVE_THEME)
  mountGlider();
  initThemePicker(); // TEMPORARY
  wire();
  if (profile.premium) document.body.classList.add('premium');
  renderHome();
  if (!localStorage.getItem('skydrift.seenHowto')) {
    try { localStorage.setItem('skydrift.seenHowto', '1'); } catch {}
    setTimeout(() => openModal($('tpl-howto')), 600);
  }
  // Server knows about purchases (and is where a real payment webhook will flip the flag).
  try {
    const r = await api(`/api/profile?player=${profile.id}`);
    if (r.premium && !profile.premium) { profile.premium = true; saveProfile(profile, false); document.body.classList.add('premium'); }
  } catch {}
}

init();

// Exposed for quick debugging in the console.
window.skydrift = { profile, TIERS };
