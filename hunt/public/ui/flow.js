// Match flow screens: matchmaking (radar), match intro splash, results sequence.
import { BRAWLERS, WORLDS, worldId } from '../shared.js';
import * as R from '../render.js';
import { SETTINGS } from '../settings.js';
import { sfx } from '../audio.js';
import { icon } from './icons.js';
import { rewardBurst } from './fx.js';
import { levelInfo } from '../progression.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const worldName = (k) => WORLDS[worldId(k)]?.name || k;
const TIPS = [
  'Lay low: 5 seconds in a bush fades your bounty glow.',
  'Below 25% HP you get a speed rush and +15% damage.',
  'Whoever takes you down steals your WHOLE bounty.',
  'Spiked walls hurt — don’t hug the edge!',
  'Every 30 seconds the map changes. Watch the warning!',
  'Rook’s mines are invisible until you’re right on top of them.',
  'Tap the attack stick for auto-aim, drag it to aim yourself.',
  'High bounty = you ping on everyone’s radar more often.',
];

// ---------------------------------------------------------------- matchmaking
export function createMatchmaking(onCancel) {
  const el = document.createElement('div');
  el.className = 'mm'; el.hidden = true;
  el.innerHTML = `<div class="title found" id="mmFound">FINDING HUNTERS</div><div class="mmmode" id="mmMode"></div><canvas id="mmCv"></canvas>
    <div class="outlined" style="color:#fff;font-size:calc(var(--u)*2.4)" id="mmCount">1/10 · starting soon</div><div class="tip" id="mmTip"></div>
    <button class="btn btn-md red" id="mmCancel">CANCEL</button>`;
  document.body.appendChild(el);
  const st = { brawler: 'volt', raf: 0, t0: 0, tip: 0 };
  el.querySelector('#mmCancel').onclick = () => onCancel();
  const loop = (now) => {
    st.raf = 0; if (el.hidden) return;
    const t = (now - st.t0) / 1000, cv = $('mmCv');
    const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
    const g = cv.getContext('2d'), w = r.width, h = r.height, c = w / 2;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    // radar
    g.beginPath(); g.arc(c, c, c - 4, 0, 7); g.fillStyle = 'rgba(27,16,51,.75)'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#1b1033'; g.stroke();
    g.strokeStyle = 'rgba(120,255,180,.35)'; g.lineWidth = 2;
    for (const k of [0.33, 0.66]) { g.beginPath(); g.arc(c, c, (c - 4) * k, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(4, c); g.lineTo(w - 4, c); g.moveTo(c, 4); g.lineTo(c, h - 4); g.stroke();
    if (!SETTINGS.reduceFlash && g.createConicGradient) {
      const s = g.createConicGradient(t * 2.4, c, c); s.addColorStop(0, 'rgba(120,255,180,.45)'); s.addColorStop(0.15, 'rgba(120,255,180,0)');
      g.save(); g.beginPath(); g.arc(c, c, c - 6, 0, 7); g.clip(); g.fillStyle = s; g.fillRect(0, 0, w, h); g.restore();
    }
    for (let i = 0; i < st.found; i++) { const a = i * 2.39 + 1, rr = (c - 20) * (0.35 + ((i * 37) % 60) / 100); g.beginPath(); g.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 6, 0, 7); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1b1033'; g.stroke(); }
    R.drawBrawler(g, st.brawler, c, c + 6, 0.2, t * 1.6, { scale: c / 60, moving: true, skin: st.skin }); // running in place
    if (Math.floor(t / 3.5) !== st.tip) { st.tip = Math.floor(t / 3.5); $('mmTip').style.opacity = 0; setTimeout(() => { $('mmTip').textContent = TIPS[(st.tipBase + st.tip) % TIPS.length]; $('mmTip').style.opacity = 1; }, 250); }
    st.raf = requestAnimationFrame(loop);
  };
  return {
    show({ brawler, skin, label }) {
      Object.assign(st, { brawler, skin, found: 1, t0: performance.now(), tip: -1, tipBase: Math.floor(Math.random() * TIPS.length) });
      $('mmFound').textContent = 'FINDING HUNTERS'; $('mmMode').textContent = label || ''; $('mmCount').textContent = '1 found · starting soon';
      el.hidden = false; el.classList.remove('leave'); void el.offsetWidth; el.classList.add('ui-screen', 'enter');
      if (!st.raf) st.raf = requestAnimationFrame(loop);
    },
    update({ players, max, startIn, mode, world }) {
      st.found = players;
      $('mmCount').textContent = `${players}/${max} hunters found${startIn != null ? ` · starts in ${Math.ceil(startIn)}` : ''}`;
      if (mode) $('mmMode').textContent = `${mode} · ${worldName(world)}`;
    },
    hide() { el.hidden = true; },
  };
}

// ---------------------------------------------------------------- match intro splash
export function showIntro({ world, modeName, brawler, skin }) {
  const el = document.createElement('div');
  el.className = 'intro enter';
  el.innerHTML = `<canvas style="position:absolute;left:3%;bottom:6%;width:48vh;height:34vh"></canvas><div class="title vs">VS</div>
    <div class="title entering">ENTERING <b>${esc(worldName(world).toUpperCase())}</b></div><div class="imode">${esc(modeName)}</div>`;
  document.body.appendChild(el);
  sfx('slam', 0.8);
  const cv = el.querySelector('canvas'), d = Math.min(2, devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); cv.width = r.width * d; cv.height = r.height * d;
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  R.drawBrawler(g, brawler, r.width * 0.4, r.height * 0.6, 0.2, 0, { scale: r.height / 85, skin });
  setTimeout(() => el.remove(), 2250);
}

// ---------------------------------------------------------------- results
export function createResults({ onAgain, onLobby }) {
  const el = document.createElement('div');
  el.className = 'res'; el.hidden = true;
  el.innerHTML = `<div class="left"><div class="title rank" id="rsRank">#1</div><canvas class="posecv" id="pose"></canvas></div>
    <div class="right"><div class="rmsg" id="rsMsg"></div><div id="mvp" hidden></div>
      <div class="gain"><span class="cur">${icon('trophy')}<b id="rsTro">+0</b></span><span class="cur">${icon('star')}<b id="rsBounty">0</b><small>BOUNTY</small></span><span class="cur">${icon('skull')}<b id="rsKo">0</b><small>KO</small></span></div>
      <div class="xp">LV <b id="rsLv">1</b><div class="bar shine"><i id="rsXp" style="width:0%"></i></div><span id="rsXpN">+0 XP</span></div>
      <ol class="rlist" id="results"></ol>
      <div class="btns"><button class="btn btn-md alt" id="rsLobby">LOBBY</button><button class="btn btn-lg again" id="rsAgain" data-sfx="play">PLAY AGAIN</button></div></div>`;
  document.body.appendChild(el);
  el.querySelector('#rsAgain').onclick = () => onAgain();
  el.querySelector('#rsLobby').onclick = () => onLobby();
  const count = (node, from, to, ms, fmt = (v) => v) => {
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / ms); node.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  return {
    el,
    show(m, ctx) {
      el.hidden = false; el.classList.remove('leave'); void el.offsetWidth; el.classList.add('ui-screen', 'enter');
      const team = m.winTeam !== undefined;
      const rank = $('rsRank');
      rank.textContent = team ? (m.won ? 'WIN!' : m.winTeam === 0 ? 'DRAW' : 'LOSS') : '#' + m.rank;
      rank.classList.remove('slam'); void rank.offsetWidth; rank.classList.add('slam');
      setTimeout(() => sfx('slam'), 120);
      $('rsMsg').textContent = ctx.msg;
      count($('rsBounty'), 0, m.bounty, 900); count($('rsKo'), 0, m.kills, 700);
      $('rsTro').textContent = '…'; $('rsXpN').textContent = '';
      const mvp = m.results.reduce((b, r) => (!b || r[6] > b[6] ? r : b), null);
      $('mvp').hidden = !mvp || mvp[6] <= 0;
      if (mvp) $('mvp').innerHTML = `👑 TOP BOUNTY HUNTER <b>${esc(mvp[0])}</b> ★${mvp[6]}`;
      $('results').innerHTML = ctx.rows;
      if (ctx.won) setTimeout(() => rewardBurst(innerWidth * 0.25, innerHeight * 0.4), 450);
    },
    progress(m) {
      const L = levelInfo(m.progress.xp), before = levelInfo(Math.max(0, m.progress.xp - m.xp));
      count($('rsTro'), 0, m.delta, 900, (v) => (v >= 0 ? '+' : '') + v);
      $('rsLv').textContent = L.level; $('rsXpN').textContent = `+${m.xp} XP`;
      const bar = $('rsXp');
      bar.style.transition = 'none'; bar.style.width = `${L.level > before.level ? 0 : Math.round((before.into / before.need) * 100)}%`;
      requestAnimationFrame(() => { bar.style.transition = 'width 1.2s cubic-bezier(.2,.8,.3,1)'; bar.style.width = `${Math.round((L.into / L.need) * 100)}%`; });
      if (L.level > before.level) setTimeout(() => { rewardBurst(); }, 600);
    },
    hide() { el.hidden = true; },
  };
}
