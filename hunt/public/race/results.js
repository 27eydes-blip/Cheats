// The race finish screen in the lobby's neon space look: your place is revealed (the number runs up
// through the field and lands with a slam), the rewards count up, the level bar fills, the finish
// order slides in row by row, and RACE AGAIN is the big obvious button (Enter / Space too).
// Reduce Flashing: everything is shown at once, nothing runs or slams.
//   showResults(session) builds it from session.rc.results; resultsProgress(session, msg) fills the
//   trophies, XP, level and extra rewards when the server's 'progress' message arrives.
import { fmtTime } from './hud.js';
import { BASE_LOOKS, carName, drawCarPreview } from './looks2.js';
import { trackName } from './tracks.js';
import { ReplayPlayer } from './replay.js';
import { RACE_MODES } from './protocol.js';
import { play } from './sound.js';
import { SETTINGS } from '../settings.js';
import { icon } from '../ui/icons.js';
import { spIcon } from '../ui/space/icons.js';
import { levelInfo } from '../progression.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const calm = () => !!SETTINGS.reduceFlash;
// a line-art trophy in the neon palette (the lobby's own icon set has no trophy)
const TROPHY = '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="#7ff3ff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M10 5h12v7a6 6 0 0 1-12 0z"/><path d="M10 8H5v2a5 5 0 0 0 5 5M22 8h5v2a5 5 0 0 1-5 5M16 18v5M11 27h10l-1-4h-8z"/></svg>';

// a number that counts up to `to` in `ms` (eased); fmt(v) gives the text. Instant under Reduce Flashing.
export function countUp(el, to, ms = 900, fmt = (v) => String(Math.round(v)), delay = 0) {
  if (!el) return;
  if (calm() || !(Math.abs(to) > 0)) { el.textContent = fmt(to); return; }
  el.textContent = fmt(0);
  const t0 = performance.now() + delay;
  const step = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, Math.max(0, (now - t0) / ms)), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step); else el.classList.add('pop');
  };
  requestAnimationFrame(step);
}

const placeText = (battle, k) => (battle ? `#${k}` : ORD(k).toUpperCase());

export function showResults(s) {
  const rc = s.rc, m = rc.results, el = s.$('.rc-res');
  const me = m.results.find((r) => r[0] === m.you) || [];
  const battle = m.mode === 'battle', out = rc.me?.out, first = m.rank === 1;
  const msg = battle ? (first ? 'Top of the arena!' : `${m.k} takedowns`) : first ? (m.mode === 'elim' ? 'Last Racer Standing!' : 'You won the race!') : out ? `Knocked out in ${ORD(out)}` : me[9] ? `Finished ${ORD(m.rank)} · ${fmtTime(m.time)}` : `${ORD(m.rank)} place`;
  const rows = m.results.map((r, i) => {
    const right = battle ? `${r[5]} KO` : r[9] ? fmtTime(r[4]) : m.mode === 'elim' ? (r[3] === 1 ? 'WINNER' : 'out') : 'DNF';
    return `<li class="${r[0] === m.you ? 'me' : ''}" style="--i:${i}"><span class="r">${r[3]}</span><i class="rc-dot" style="background:${(BASE_LOOKS[r[2]] || BASE_LOOKS.volt).neon}" title="${esc(carName(r[2]))}"></i>${esc(r[1])}<span class="k">${right}</span></li>`;
  }).join('');
  const clip = s.mom.best, n = m.n || m.results.length;
  const modeName = (RACE_MODES[m.mode]?.name || m.mode || '').toUpperCase();
  const tile = (ic, cls, to, lab, fmt = '') => `<span class="cur rcr-tile"><span class="rcr-ic">${ic}</span><b class="${cls}" data-to="${to}"${fmt ? ` data-f="${fmt}"` : ''}>${to}</b><small>${lab}</small></span>`;
  el.innerHTML = `<div class="left rcr-left">
      <div class="rcr-place${first ? ' win' : ''}"><div class="title rank rcr-rank">${placeText(battle, n)}</div><div class="rcr-of">${battle ? 'IN THE ARENA' : `OF ${n} RACERS`}</div></div>
      <canvas class="posecv"${clip ? ' hidden' : ''}></canvas>${clip ? '<div class="rc-replay"></div>' : ''}</div>
    <div class="right">
      <div class="rcr-head"><span class="rc-mtag">${esc(modeName)}</span><span class="rc-mtrack">${esc(trackName(m.track, rc.arena) || '')}</span></div>
      <div class="rmsg">${esc(msg)}</div>
      <div class="gain">${tile(TROPHY, 'rc-tro', '…', 'TROPHIES')}${tile(spIcon('coin'), 'rcr-n', m.mc || 0, 'COINS')}${tile(icon('skull'), 'rcr-n', m.k || 0, 'KO')}${m.bestLap ? tile('⏱', 'rcr-n', m.bestLap, 'BEST LAP', 't') : ''}</div>
      <div class="xp"><span class="rcr-lvl">LV <b class="rc-lv">-</b></span><div class="bar"><i class="rc-xp" style="width:0%"></i></div><span class="rc-xpn"></span></div><div class="rc-ups"></div>
      <ol class="rlist rc-list">${rows}</ol>
      <div class="btns"><button class="btn btn-md alt rc-lobby">LOBBY</button><button class="btn btn-lg again rc-again" data-sfx="play">RACE AGAIN</button></div></div>`;
  el.hidden = false; el.classList.add('ui-screen', 'enter');
  el.classList.toggle('calm', calm());
  el.querySelector('.rc-lobby').onclick = () => s.exit();
  el.querySelector('.rc-again').onclick = () => s.again();
  // the keyboard: Enter / Space races again (one key from the finish to the next race)
  s.resKey = (e) => { if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && !el.hidden && !e.target.closest?.('button, input, textarea')) { e.preventDefault(); s.again(); } };
  addEventListener('keydown', s.resKey);
  if (!rc.progress) el.querySelector('.rc-tro').textContent = s.o.token ? '…' : '+0';
  // the rewards count up, one after another
  let d = calm() ? 0 : 650;
  for (const b of el.querySelectorAll('.rcr-n')) { const to = +b.dataset.to; countUp(b, to, 800, b.dataset.f === 't' ? (v) => fmtTime(v) : (v) => String(Math.round(v)), d); d += 180; }
  // the place: runs up from the back of the field and lands
  const rk = el.querySelector('.rcr-rank');
  if (calm() || n <= 1) { rk.textContent = placeText(battle, m.rank); rk.classList.add('landed'); }
  else {
    let k = n; const stepMs = Math.max(35, 520 / Math.max(1, n - m.rank));
    const tick = () => {
      if (!rk.isConnected) return;
      if (k > m.rank) { k--; rk.textContent = placeText(battle, k); setTimeout(tick, stepMs); }
      else { rk.classList.add('slam', 'landed'); play(first ? 'finish' : 'lap'); }
    };
    setTimeout(tick, 200);
  }
  // the car on the podium
  const cv = el.querySelector('.posecv'), r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
  const g = cv.getContext('2d'), sc = Math.min(r.width, r.height) / 70;
  g.setTransform(dpr * sc, 0, 0, dpr * sc, (r.width * dpr) / 2, (r.height * dpr) / 2);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(4, 6, 30, 20, -0.5, 0, 7); g.fill();
  drawCarPreview(g, rc.myDriver(), s.renderer.carLook(rc.id, rc), -0.5, 0, { boost: false, steady: true }); // in your equipped look
  // the biggest crash of the race, replayed (instead of the podium car)
  if (clip) { try { s.replay = new ReplayPlayer(el.querySelector('.rc-replay'), clip, rc); } catch (e) { console.warn('replay', e); s.replay = null; } }
  if (calm() || n <= 1) play(first ? 'finish' : 'lap');
  el.querySelector('.rc-again').focus?.({ preventScroll: true });
}

export function resultsProgress(s, m) {
  const el = s.$('.rc-res');
  const tro = el.querySelector('.rc-tro');
  if (tro) countUp(tro, m.delta || 0, 900, (v) => (m.delta >= 0 ? '+' : '−') + Math.abs(Math.round(v)), calm() ? 0 : 300);
  // the level bar (accounts with progress); the reward lines show either way
  if (m.progress) {
    const L = levelInfo(m.progress.xp);
    el.querySelector('.rc-lv').textContent = L.level;
    countUp(el.querySelector('.rc-xpn'), m.xp || 0, 1000, (v) => `+${Math.round(v)} XP`, calm() ? 0 : 400);
    requestAnimationFrame(() => { const b = el.querySelector('.rc-xp'); if (b) { b.style.transition = calm() ? 'none' : 'width 1.4s cubic-bezier(.2,.8,.3,1) .4s'; b.style.width = `${Math.round((L.into / L.need) * 100)}%`; } });
  }
  const ups = [];
  for (const r of m.levels || []) ups.push(`LEVEL ${r.level}! +${r.coins} coins`);
  if (m.coins) ups.push(`+${m.coins} coins`);
  if (m.improved && m.best) ups.push(`NEW BEST ${fmtTime(m.best)}`);
  // Elimination: the takedown and survival bonus, and the title for a win
  if (m.elim) {
    if (m.elim.ko) ups.push(`+${m.elim.ko} takedown bonus`);
    if (m.elim.surv) ups.push(`+${m.elim.surv} survival bonus (${m.elim.secs} s)`);
    if (m.elim.win) { const t = document.createElement('div'); t.className = 'rc-title'; t.textContent = m.elim.title ? 'NEW TITLE: LAST RACER STANDING' : 'LAST RACER STANDING'; el.querySelector('.rc-ups').after(t); }
  }
  const u = el.querySelector('.rc-ups');
  u.textContent = ups.join(' · ');
  u.classList.toggle('lvup', !!(m.levels && m.levels.length));
}
