// THE LADDER: your rank on the ranked ladder, the leaderboards and the daily / weekly challenges,
// in the lobby's neon glass style. Pieces:
//   createRankCard(onTap)   the lobby's rank button (tier emblem, "GOLD II", RP to the next division)
//   openLadder(startTab)    a full screen with three tabs: RANK, LEADERBOARDS, CHALLENGES
//   rankResult(el, rank)    the rank line on the race finish screen (RP gained, bar, PROMOTED)
// Everything shown is the server's: rank points and challenge progress from the account's
// progress (race/ranked.js, race/unlocks.js), the boards from GET /api/race/boards.
import * as A from '../../account.js';
import { TIERS, rankInfo, rkOf, RP } from '../../race/ranked.js';
import { challengeState, dayOf, weekOf } from '../../race/unlocks.js';
import { TRACK_IDS, trackName } from '../../race/tracks.js';
import { openScreen, closeScreen } from '../fx.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtLap = (s) => (s == null ? '--' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);

// a tier emblem: a hex with chevrons for the division (III one, II two, I three), the top tier a star
export function emblem(rp, size = 28) {
  const I = rankInfo(rp), c = I.tier.col, n = I.div ? ['III', 'II', 'I'].indexOf(I.div) + 1 : 0; // III: one chevron .. I: three
  const chev = Array.from({ length: n }, (_, k) => `<path d="M10 ${21 - k * 5} l6 -4 l6 4" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const star = I.div ? '' : `<path d="M16 8 l2.4 5 5.4 .6 -4 3.7 1.1 5.3 -4.9 -2.7 -4.9 2.7 1.1 -5.3 -4 -3.7 5.4 -.6z" fill="${c}"/>`;
  return `<svg class="ld-emb" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" fill="rgba(8,12,34,.85)" stroke="${c}" stroke-width="1.8"/><path d="M16 5 L25.5 10.5 V21.5 L16 27 L6.5 21.5 V10.5 Z" fill="${c}" opacity=".16"/>${chev}${star}</svg>`;
}

let cssDone = false;
function css() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.id = 'ladderCss';
  s.textContent = `
.ld-card { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 44px; padding: 4px 10px 4px 10px; text-align: left; color: var(--sp-text, #e9f6ff); font: 600 12px/1.1 var(--sp-narrow, sans-serif); cursor: pointer; }
.ld-card .ld-emb { flex: none; filter: drop-shadow(0 0 6px var(--tc)); }
.ld-card .ld-txt { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 3px; }
.ld-card small { color: var(--sp-dim, #93a6cf); font: 600 11px/1 var(--sp-narrow, sans-serif); letter-spacing: .12em; }
.ld-card b { font: 700 14px/1 var(--sp-display, sans-serif); letter-spacing: .06em; color: var(--tc); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ld-bar { position: relative; display: block; height: 4px; border-radius: 2px; background: rgba(147,166,207,.22); overflow: hidden; }
.ld-bar > i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--tc), #fff); border-radius: 2px; }
.ld-screen { background: radial-gradient(120% 90% at 20% 0%, rgba(80,40,160,.35), transparent 60%), rgba(5,8,22,.94); color: var(--sp-text, #e9f6ff); font-family: var(--sp-narrow, sans-serif); }
.ld-screen .ui-head .title { font: 700 clamp(18px, 4.2vh, 30px)/1 var(--sp-display, sans-serif); letter-spacing: .12em; color: #e9f6ff; text-shadow: 0 0 12px rgba(52,231,255,.45); -webkit-text-stroke: 0; }
.ld-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.ld-tab { min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(52,231,255,.35); background: rgba(12,20,52,.62); color: var(--sp-dim, #93a6cf); font: 700 13px/1 var(--sp-display, sans-serif); letter-spacing: .1em; cursor: pointer; }
.ld-tab[aria-selected="true"] { color: #fff; border-color: #34e7ff; box-shadow: 0 0 12px rgba(52,231,255,.35), inset 0 0 10px rgba(52,231,255,.15); }
.ld-body { display: grid; gap: 12px; padding: 4px 2px 12px; max-width: 980px; margin: 0 auto; width: 100%; }
.ld-glass { background: rgba(12,20,52,.62); border: 1px solid rgba(167,123,255,.35); border-radius: 14px; padding: 12px 14px; }
.ld-me { display: flex; align-items: center; gap: 14px; }
.ld-me .ld-emb { filter: drop-shadow(0 0 10px var(--tc)); }
.ld-me h3 { margin: 0; font: 700 clamp(20px, 5vh, 34px)/1 var(--sp-display, sans-serif); letter-spacing: .08em; color: var(--tc); }
.ld-me p { margin: 4px 0 0; color: var(--sp-dim, #93a6cf); font-size: 14px; }
.ld-me .ld-bar { height: 7px; margin-top: 8px; }
.ld-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }
.ld-tier { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px; background: rgba(8,12,34,.6); border: 1px solid rgba(147,166,207,.18); font-size: 13px; }
.ld-tier.on { border-color: var(--tc); box-shadow: 0 0 10px color-mix(in srgb, var(--tc) 40%, transparent); }
.ld-tier b { display: block; font: 700 13px/1.1 var(--sp-display, sans-serif); color: var(--tc); letter-spacing: .06em; }
.ld-tier span { color: var(--sp-dim, #93a6cf); font-size: 12px; }
.ld-how { margin: 0; padding-left: 18px; color: #cfe0ff; font-size: 14px; line-height: 1.45; }
.ld-h { margin: 0 0 8px; font: 700 13px/1 var(--sp-display, sans-serif); letter-spacing: .14em; color: #34e7ff; }
.ld-chips { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 8px; padding-bottom: 2px; scrollbar-width: none; }
.ld-chips::-webkit-scrollbar { display: none; }
.ld-chip { flex: none; min-height: 44px; padding: 0 12px; border-radius: 22px; border: 1px solid rgba(167,123,255,.4); background: rgba(8,12,34,.6); color: var(--sp-dim, #93a6cf); font: 700 12px/1 var(--sp-display, sans-serif); letter-spacing: .08em; cursor: pointer; }
.ld-chip[aria-pressed="true"] { color: #fff; border-color: #ff3fb8; box-shadow: 0 0 10px rgba(255,63,184,.35); }
.ld-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.ld-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ld-list li { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 8px; min-height: 30px; padding: 2px 8px; border-radius: 8px; background: rgba(8,12,34,.5); font-size: 15px; }
.ld-list li.you { background: rgba(52,231,255,.14); border: 1px solid rgba(52,231,255,.5); }
.ld-list .p { font: 700 14px/1 var(--sp-display, sans-serif); color: #a77bff; text-align: right; }
.ld-list .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ld-list .v { font: 700 14px/1 var(--sp-display, sans-serif); color: #e9f6ff; font-variant-numeric: tabular-nums; }
.ld-list .v small { color: var(--tc, #93a6cf); font-size: 11px; margin-left: 6px; letter-spacing: .06em; }
.ld-list li.ld-empty { display: block; background: none; }
.ld-empty { color: var(--sp-dim, #93a6cf); font-size: 14px; padding: 6px 2px; }
.ld-ch { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: center; }
.ld-ch .k { font: 700 11px/1 var(--sp-display, sans-serif); letter-spacing: .14em; color: #ff3fb8; }
.ld-ch .t { font-size: 16px; color: #fff; }
.ld-ch .r { font: 700 13px/1 var(--sp-display, sans-serif); color: #7ef9e0; text-align: right; }
.ld-ch .ld-bar { grid-column: 1 / -1; height: 6px; --tc: #34e7ff; }
.ld-ch .s { color: var(--sp-dim, #93a6cf); font-size: 13px; }
.ld-ch.done .r { color: #fff; }
.rc-rank { display: flex; align-items: center; gap: 10px; margin: 6px 0 2px; padding: 6px 10px; border-radius: 12px; background: rgba(8,12,34,.55); border: 1px solid color-mix(in srgb, var(--tc) 55%, transparent); font: 600 13px/1.1 var(--sp-narrow, "Barlow Semi Condensed", sans-serif); color: #e9f6ff; }
.rc-rank .ld-txt { flex: 1; min-width: 0; display: grid; gap: 4px; }
.rc-rank b { font: 700 15px/1 var(--sp-display, "Chakra Petch", sans-serif); letter-spacing: .06em; color: var(--tc); }
.rc-rank .d { font: 700 15px/1 var(--sp-display, "Chakra Petch", sans-serif); color: #7ef9e0; white-space: nowrap; }
.rc-rank .d.neg { color: #ff6b8a; }
.rc-rank .ld-bar > i { transition: width 1.2s cubic-bezier(.2,.8,.3,1); }
.rc-rank .up { font: 700 12px/1 var(--sp-display, "Chakra Petch", sans-serif); letter-spacing: .14em; color: #fff; background: var(--tc); color: #050816; padding: 3px 6px; border-radius: 6px; }
@media (prefers-reduced-motion: reduce) { .rc-rank .ld-bar > i { transition: none; } }
`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- the lobby's rank button
export function createRankCard(onTap) {
  css();
  const el = document.createElement('button');
  el.type = 'button'; el.id = 'rankCard';
  el.className = 'ld-card sp-glass';
  el.onclick = onTap;
  const set = (p) => {
    const rk = rkOf(p), I = rankInfo(rk.rp);
    el.style.setProperty('--tc', I.tier.col);
    el.setAttribute('aria-label', `Rank: ${I.label}, ${rk.rp} points. Open the ladder and leaderboards`);
    el.innerHTML = `${emblem(rk.rp, 30)}<span class="ld-txt"><small>RANKED · ${rk.rp} RP</small><b>${esc(I.label.toUpperCase())}</b><span class="ld-bar" aria-hidden="true"><i style="width:${Math.round(I.f * 100)}%"></i></span></span>`;
  };
  set(A.progress());
  return { el, set };
}

// ---------------------------------------------------------------- the race finish screen
// rank: the server's result (race/ranked.js applyRanked) -> a line right after `anchor` (the rewards)
export function rankResult(anchor, rank) {
  if (!anchor || !anchor.parentElement || !rank) return null;
  css();
  anchor.parentElement.querySelector('.rc-rank')?.remove();
  const I = rankInfo(rank.rp), from = rankInfo(rank.from ?? rank.rp);
  const el = document.createElement('div');
  el.className = 'rc-rank';
  el.style.setProperty('--tc', I.tier.col);
  const d = rank.delta | 0;
  const note = rank.up ? (rank.newTier ? `<span class="up">NEW TIER</span>` : `<span class="up">PROMOTED</span>`) : rank.down ? `<small>Down to ${esc(I.label)}</small>` : '';
  el.innerHTML = `${emblem(rank.rp, 30)}<span class="ld-txt"><span><b>${esc(I.label.toUpperCase())}</b> ${note}</span><span class="ld-bar"><i style="width:${Math.round((rank.up || rank.down ? 0 : from.f) * 100)}%"></i></span><small>${I.next ? `${I.toNext} RP to ${esc(I.next)}` : 'Top of the ladder'}</small></span><span class="d ${d < 0 ? 'neg' : ''}">${d >= 0 ? '+' : ''}${d} RP</span>`;
  anchor.after(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { const b = el.querySelector('.ld-bar > i'); if (b) b.style.width = `${Math.round(I.f * 100)}%`; }));
  return el;
}

// ---------------------------------------------------------------- the ladder screen
const TABS = [['rank', 'RANK'], ['boards', 'LEADERBOARDS'], ['challenges', 'CHALLENGES']];
let boardsCache = { at: 0, by: {} };
async function boards(track) {
  const c = boardsCache.by[track];
  if (c && Date.now() - c.at < 30_000) return c.v;
  const r = await fetch(`/api/race/boards?track=${encodeURIComponent(track)}`, { headers: A.ACC.token ? { authorization: 'Bearer ' + A.ACC.token } : {} });
  if (!r.ok) throw new Error('boards ' + r.status);
  const v = await r.json();
  boardsCache.by[track] = { at: Date.now(), v };
  return v;
}

export function openLadder(startTab = 'rank') {
  css();
  const el = document.createElement('div');
  el.className = 'ui-screen ld-screen'; el.hidden = true; el.id = 'ladderScreen';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Ranked ladder');
  el.innerHTML = `<div class="ui-head"><button class="btn btn-sm alt back" aria-label="Back">&#8592;</button><div class="title">THE LADDER</div>
    <div class="ld-tabs" role="tablist">${TABS.map(([k, t]) => `<button class="ld-tab" role="tab" data-t="${k}" aria-selected="false">${t}</button>`).join('')}</div></div><div class="ui-body"><div class="ld-body"></div></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('.ld-body');
  const S = { tab: TABS.some(([k]) => k === startTab) ? startTab : 'rank', track: TRACK_IDS[0], gen: 0 };
  const close = async () => { await closeScreen(el); el.remove(); };
  el.querySelector('.back').onclick = close;
  for (const b of el.querySelectorAll('.ld-tab')) b.onclick = () => { S.tab = b.dataset.t; draw(); };
  const draw = () => {
    for (const b of el.querySelectorAll('.ld-tab')) b.setAttribute('aria-selected', String(b.dataset.t === S.tab));
    const p = A.progress();
    if (S.tab === 'rank') body.innerHTML = rankTab(p);
    else if (S.tab === 'challenges') body.innerHTML = challengesTab(p);
    else boardsTab(body, S);
  };
  draw();
  openScreen(el);
  return { el, close, show: (t) => { S.tab = t; draw(); } };
}

function rankTab(p) {
  const rk = rkOf(p), I = rankInfo(rk.rp), best = rankInfo(rk.best);
  const tiers = TIERS.map((t, k) => `<div class="ld-tier ${k === I.k ? 'on' : ''}" style="--tc:${t.col}">${emblem(k === TIERS.length - 1 ? t.at : TIERS[k + 1].at - 1, 26)}<span><b>${t.name.toUpperCase()}</b><span>${t.at} RP</span></span></div>`).join('');
  return `<section class="ld-glass ld-me" style="--tc:${I.tier.col}">${emblem(rk.rp, 64)}<div style="flex:1;min-width:0"><h3>${esc(I.label.toUpperCase())}</h3>
      <p>${rk.rp} RP · ${rk.n} ranked race${rk.n === 1 ? '' : 's'}${rk.st > 1 ? ` · top-3 streak ${rk.st}` : ''}${rk.best > rk.rp ? ` · best ${esc(best.label)}` : ''}</p>
      <span class="ld-bar" style="--tc:${I.tier.col}"><i style="width:${Math.round(I.f * 100)}%"></i></span>
      <p>${I.next ? `${I.toNext} RP to ${esc(I.next)}` : 'You are at the top of the ladder.'}</p></div></section>
    <section class="ld-glass"><h4 class="ld-h">TIERS</h4><div class="ld-tiers">${tiers}</div></section>
    <section class="ld-glass"><h4 class="ld-h">HOW IT WORKS</h4><ul class="ld-how">
      <li>Public Grand Races and Elimination races are ranked. Friend rooms, Time Trial and Battle are not.</li>
      <li>A win is worth up to +${RP.win} RP. Finish higher for more. Takedowns and top-3 streaks add a little.</li>
      <li>You never drop out of a tier once you reach it, and Bronze never loses points.</li></ul></section>`;
}

function challengesTab(p) {
  const day = dayOf(), ch = challengeState(p, day);
  const msDay = (day + 1) * 864e5 - Date.now(), msWeek = ((weekOf(day) + 1) * 7 - 3) * 864e5 - Date.now();
  const left = (ms) => { const h = Math.max(0, Math.floor(ms / 3600e3)); return h >= 48 ? `${Math.floor(h / 24)} days left` : `${h}h ${Math.max(0, Math.floor((ms % 3600e3) / 60e3))}m left`; };
  const row = (c, ms) => `<section class="ld-glass ld-ch ${c.done ? 'done' : ''}"><span class="k">${c.kind === 'daily' ? 'DAILY CHALLENGE' : 'WEEKLY CHALLENGE'}</span><span class="r">${c.done ? 'DONE' : `${c.have} / ${c.goal}`}</span>
    <span class="t">${esc(c.text)}</span><span class="s">+${c.pieces} car piece${c.pieces > 1 ? 's' : ''}</span>
    <span class="ld-bar"><i style="width:${Math.round((c.done ? 1 : c.have / c.goal) * 100)}%"></i></span><span class="s">${c.done ? 'Reward collected' : left(ms)}</span><span></span></section>`;
  return `${row(ch[0], msDay)}${row(ch[1], msWeek)}
    <section class="ld-glass"><ul class="ld-how"><li>Every race mode counts except Time Trial.</li><li>Car pieces build HELIX, then OBLIVION PRIME. With both built, a piece pays 100 coins (test currency).</li><li>New daily challenge at 00:00 UTC; the weekly one changes every Monday.</li></ul></section>`;
}

function boardsTab(body, S) {
  const gen = ++S.gen;
  const chips = TRACK_IDS.map((k) => `<button class="ld-chip" data-k="${k}" aria-pressed="${k === S.track}" aria-label="${esc(trackName(k) || k)}">${esc(k === 'neon' ? 'NEON CITY' : k.toUpperCase())}</button>`).join('');
  body.innerHTML = `<div class="ld-cols"><section class="ld-glass"><h4 class="ld-h">TOP RACERS</h4><ol class="ld-list" id="ldRanked"><li class="ld-empty">Loading…</li></ol></section>
    <section class="ld-glass"><h4 class="ld-h">BEST LAPS</h4><div class="ld-chips">${chips}</div><ol class="ld-list" id="ldLaps"><li class="ld-empty">Loading…</li></ol></section></div>`;
  for (const b of body.querySelectorAll('.ld-chip')) b.onclick = () => { S.track = b.dataset.k; boardsTab(body, S); };
  boards(S.track).then((d) => {
    if (gen !== S.gen || !body.isConnected) return;
    const me = d.me, you = (n) => me && me.name && n === me.name;
    const R = body.querySelector('#ldRanked'), L = body.querySelector('#ldLaps');
    R.innerHTML = d.ranked.length ? d.ranked.map((r) => `<li class="${you(r.name) ? 'you' : ''}" style="--tc:${rankInfo(r.rp).tier.col}"><span class="p">${r.pos}</span><span class="n">${esc(r.name)}</span><span class="v">${r.rp}<small>${esc(r.label.toUpperCase())}</small></span></li>`).join('')
      : '<li class="ld-empty">No ranked racers yet. Win public races to be the first.</li>';
    if (me && me.rankPos && !d.ranked.some((r) => you(r.name))) R.insertAdjacentHTML('beforeend', `<li class="you" style="--tc:${rankInfo(me.rp).tier.col}"><span class="p">${me.rankPos}</span><span class="n">You${me.name ? '' : ' (sign up to be listed)'}</span><span class="v">${me.rp}<small>${esc(me.label.toUpperCase())}</small></span></li>`);
    L.innerHTML = d.laps.length ? d.laps.map((r) => `<li class="${you(r.name) ? 'you' : ''}"><span class="p">${r.pos}</span><span class="n">${esc(r.name)}</span><span class="v">${fmtLap(r.lap)}</span></li>`).join('')
      : `<li class="ld-empty">No laps on ${esc(trackName(S.track) || '')} yet. Set the first.</li>`;
    if (me && me.lapPos && !d.laps.some((r) => you(r.name))) L.insertAdjacentHTML('beforeend', `<li class="you"><span class="p">${me.lapPos}</span><span class="n">You${me.name ? '' : ' (sign up to be listed)'}</span><span class="v">${fmtLap(me.lap)}</span></li>`);
  }).catch(() => {
    if (gen !== S.gen || !body.isConnected) return;
    for (const id of ['#ldRanked', '#ldLaps']) body.querySelector(id).innerHTML = '<li class="ld-empty">Could not load the boards. Check your connection.</li>';
  });
}
