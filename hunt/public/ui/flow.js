// Match flow screens: matchmaking (radar), match intro splash, results sequence.
import { BRAWLERS, WORLDS, worldId } from '../shared.js';
import * as R from '../render.js';
import { SETTINGS } from '../settings.js';
import { sfx } from '../audio.js';
import { icon } from './icons.js';
import { rewardBurst } from './fx.js';
import { levelInfo } from '../progression.js';
import { WEAPONS, masteryInfo } from '../weapons.js';
import { SKINS, TITLES, EMOTES } from '../catalog.js';
// UNLOCK REVEAL: a card for each reward (level-ups, weapon unlocks, mastery-ups), flipping in one by one
function upsHtml(m) {
  const cards = [];
  const card = (kind, title, sub, col) => cards.push(`<div class="ucard" style="--uc:${col};animation-delay:${0.9 + cards.length * 0.35}s"><small>${esc(kind)}</small><b>${esc(title)}</b><span>${esc(sub)}</span></div>`);
  for (const r of m.levels || []) {
    card('LEVEL UP', `LEVEL ${r.level}`, `+${r.coins} coins`, '#ffd23f');
    for (const w of r.weapons || []) card('NEW WEAPON', WEAPONS[w]?.name || w, 'in the Armory', '#5ff4ff');
    for (const e of r.emotes || []) card('NEW EMOTE', EMOTES.find((x) => x.id === e)?.text || e, 'tap !? in a match', '#ff9f43');
    if (r.skin) card('NEW SKIN', SKINS[r.skin]?.name || r.skin, 'in the Locker', '#ff6bd6');
    if (r.title) card('NEW TITLE', TITLES[r.title] || r.title, 'in the Locker', '#c9a6ff');
  }
  for (const x of m.mastery || []) card('MASTERY UP', `${WEAPONS[x.id]?.name || x.id} ${x.level}`, [2, 5, 8].includes(x.level) ? 'pick a perk in the Armory' : x.level === 3 ? 'Bronze skin' : x.level === 6 ? 'Silver skin' : x.level === 7 ? 'kill effect' : x.level === 9 ? 'Gold skin' : x.level === 10 ? "Hunter's Bane!" : 'keep going', '#4be0c8');
  // weapon mastery progress for the weapon you used most
  const w = (m.wxp || [])[0];
  let bar = '';
  if (w && WEAPONS[w.id]) {
    const a = masteryInfo(w.xp0), b2 = masteryInfo(w.xp1);
    const from = b2.level > a.level ? 0 : a.need ? a.into / a.need : 1, to = b2.need ? b2.into / b2.need : 1;
    bar = `<div class="xp mxp">${esc(WEAPONS[w.id].name.toUpperCase())} <b>M${b2.level}</b><div class="bar shine"><i data-from="${Math.round(from * 100)}" data-to="${Math.round(to * 100)}" style="width:${Math.round(from * 100)}%;background:linear-gradient(#7dfff0,#2bc4cf)"></i></div><span>+${w.xp1 - w.xp0}</span></div>`;
  }
  return bar + (m.coins ? `<div class="coinsline">+${m.coins} coins</div>` : '') + (cards.length ? `<div class="ucards">${cards.slice(0, 6).join('')}</div>` : '');
}

// EARNED: the short version (trophies, XP, coins, level-ups) for the death screen and the lobby card
export function earnedHtml(m) {
  const n = (v) => Math.round(Number(v) || 0);
  const parts = [`<span><b>${n(m.delta) >= 0 ? '+' : ''}${n(m.delta)}</b> trophies</span>`, `<span><b>+${n(m.xp)}</b> XP</span>`];
  if (n(m.coins) > 0) parts.push(`<span><b>+${n(m.coins)}</b> coins</span>`);
  for (const r of m.levels || []) parts.push(`<span class="up">LEVEL ${esc(r.level)}!</span>`);
  return parts.join('');
}
// does this result carry unlock cards (level-ups, new weapons, mastery-ups)?
export const hasUnlocks = (m) => !!m && ((m.levels || []).length > 0 || (m.mastery || []).length > 0);
// two results the player has not seen in full yet, as one
export function mergeEarned(a, b) {
  if (!a) return b;
  return { ...b, delta: (a.delta || 0) + (b.delta || 0), xp: (a.xp || 0) + (b.xp || 0), coins: (a.coins || 0) + (b.coins || 0), levels: [...(a.levels || []), ...(b.levels || [])], mastery: [...(a.mastery || []), ...(b.mastery || [])] };
}
// A small card over the lobby: what the match you just left earned you. Tap it (or wait) to dismiss.
export function createEarned() {
  const el = document.createElement('div');
  el.className = 'earnedCard'; el.id = 'earnedCard'; el.hidden = true;
  document.body.appendChild(el);
  let timer = 0, showing = null, since = 0;
  const hide = () => { clearTimeout(timer); el.hidden = true; showing = null; };
  el.onclick = hide;
  return {
    el,
    show(m) {
      m = showing = mergeEarned(showing, m); // a second result while the card is up adds to it (never replaces it)
      const cards = hasUnlocks(m) ? upsHtml({ levels: m.levels, mastery: m.mastery }) : '';
      el.innerHTML = `<small>MATCH REWARDS</small><div class="earned">${earnedHtml(m)}</div>${cards}<p class="hint">Tap to close</p>`;
      if (el.hidden) since = performance.now();
      el.hidden = false;
      if (cards) sfx('reward');
      clearTimeout(timer);
      timer = setTimeout(hide, cards ? 14000 : 7000);
    },
    hide,
    // another screen is taking over: hide, and hand back unlock cards that were up too briefly to read
    take() { const m = showing && hasUnlocks(showing) && performance.now() - since < 3000 ? showing : null; hide(); return m; },
  };
}

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
// FRIEND ROOM: the same screen plus a room card on the side: the code (big, with COPY), who has
// joined, and for the host START + fill with bots. Everyone else waits for the host.
export function createMatchmaking(onCancel, room = {}) {
  const el = document.createElement('div');
  el.className = 'mm'; el.hidden = true;
  el.innerHTML = `<div class="title found" id="mmFound">FINDING HUNTERS</div><div class="mmmode" id="mmMode"></div><canvas id="mmCv"></canvas>
    <div class="outlined" style="color:#fff;font-size:calc(var(--u)*2.4)" id="mmCount">1/10 · starting soon</div><div class="tip" id="mmTip"></div>
    <button class="btn btn-md red" id="mmCancel">CANCEL</button>
    <div class="card-a mmroom" id="mmRoom" hidden><small>ROOM CODE</small><div class="mmcode"><b id="mmCode"></b><button class="btn btn-sm alt" id="mmCopy">COPY</button></div>
      <ol class="mmlist" id="mmList"></ol><div class="mmhost" id="mmHost"><label class="opt"><input type="checkbox" id="mmBots"> Fill with bots</label><button class="btn btn-md" id="mmStart" data-sfx="play">START</button></div>
      <div class="mmwait" id="mmWait"></div></div>
    <div class="mmcredit">Made by Gleyde Technologies</div>`;
  document.body.appendChild(el);
  const st = { brawler: 'volt', raf: 0, t0: 0, tip: 0, room: '' };
  el.querySelector('#mmCancel').onclick = () => onCancel();
  $('mmCopy').onclick = async () => { try { await navigator.clipboard.writeText(st.room); room.toast?.('Room code copied'); } catch { room.toast?.(`Room code: ${st.room}`); } };
  $('mmStart').onclick = () => room.onStart?.();
  $('mmBots').onchange = (e) => room.onBots?.(e.target.checked);
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
    show({ brawler, skin, label, room: code = '' }) {
      Object.assign(st, { brawler, skin, found: 1, t0: performance.now(), tip: -1, tipBase: Math.floor(Math.random() * TIPS.length), room: code });
      $('mmFound').textContent = code ? 'FRIENDS ROOM' : 'FINDING HUNTERS'; $('mmMode').textContent = label || ''; $('mmCount').textContent = code ? 'Joining the room…' : '1 found · starting soon';
      el.classList.toggle('room', !!code); $('mmRoom').hidden = !code; $('mmCode').textContent = code; $('mmList').innerHTML = ''; $('mmHost').hidden = true; $('mmWait').textContent = '';
      el.hidden = false; el.classList.remove('leave'); void el.offsetWidth; el.classList.add('ui-screen', 'enter');
      if (!st.raf) st.raf = requestAnimationFrame(loop);
    },
    // lobby/welcome state. Room lobbies also carry names, host (id), ids, can (START ready), me (my id).
    update({ players, max, startIn, mode, world, bots = true, names = null, host = 0, ids = null, can = false, me = 0 }) {
      st.found = players;
      if (mode) $('mmMode').textContent = `${st.room ? `ROOM ${st.room} · ` : ''}${mode} · ${worldName(world)}`; // (the code stays on screen)
      if (!st.room || !ids) {
        // bots off: nobody fills the empty seats, so say plainly that we're waiting for real players
        const waiting = !bots && startIn == null;
        $('mmFound').textContent = st.room ? 'FRIENDS ROOM' : waiting ? 'WAITING FOR MORE HUNTERS…' : 'FINDING HUNTERS';
        $('mmCount').textContent = `${players}/${max} hunters found${startIn != null ? ` · starts in ${Math.ceil(startIn)}` : waiting ? ' · bots are off' : ''}`;
        return;
      }
      const hi = ids.indexOf(host), hostName = hi >= 0 && names ? names[hi][0] : 'the host', amHost = host === me;
      $('mmFound').textContent = 'FRIENDS ROOM';
      $('mmList').innerHTML = (names || []).map(([n], i) => `<li class="${ids[i] === host ? 'host' : ''}${ids[i] === me ? ' me' : ''}">${esc(n)}${ids[i] === host ? ' <small>HOST</small>' : ''}${ids[i] === me ? ' <small>YOU</small>' : ''}</li>`).join('');
      $('mmHost').hidden = !amHost;
      $('mmBots').checked = bots; $('mmStart').disabled = !can;
      $('mmCount').textContent = `${players}/${max} hunters in the room${startIn != null ? ` · starts by itself in ${Math.ceil(startIn)}` : ''}`;
      $('mmWait').textContent = amHost ? (can ? 'Press START when everyone is here.' : 'Bots are off: waiting for a friend to join.') : `Waiting for ${hostName} to start.`;
    },
    // a friend room that is mid-match: we're held for its next match
    wait({ mode, left }) {
      $('mmFound').textContent = 'FRIENDS ROOM';
      $('mmMode').textContent = `ROOM ${st.room}${mode ? ` · ${mode}` : ''}`;
      $('mmCount').textContent = `Your friends are mid-match${left != null ? ` (about ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left)` : ''}`;
      $('mmList').innerHTML = ''; $('mmHost').hidden = true;
      $('mmWait').textContent = "You'll join their next match. Stay here, or CANCEL.";
    },
    // the connection dropped while searching: say so (CANCEL stays available) until update() is called again
    lost() { st.found = 0; $('mmFound').textContent = 'CONNECTION LOST'; $('mmCount').textContent = 'Connection lost. Retrying...'; },
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
  sfx('uislam', 0.8);
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
      <div class="xp">LV <b id="rsLv">1</b><div class="bar shine"><i id="rsXp" style="width:0%"></i></div><span id="rsXpN">+0 XP</span></div><div class="lvups" id="rsUps"></div>
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
  let pendingProgress = null, shown = false;
  const applyProgress = (m) => {
    const L = levelInfo(m.progress.xp), before = levelInfo(Math.max(0, m.progress.xp - m.xp));
    count($('rsTro'), 0, m.delta, 900, (v) => (v >= 0 ? '+' : '') + v);
    $('rsLv').textContent = L.level; $('rsXpN').textContent = `+${m.xp} XP`;
    $('rsUps').innerHTML = upsHtml(m);
    for (const i of $('rsUps').querySelectorAll('[data-to]')) setTimeout(() => { i.style.transition = 'width 1.2s cubic-bezier(.2,.8,.3,1)'; i.style.width = i.dataset.to + '%'; }, 500);
    if ((m.levels || []).length || (m.mastery || []).length) setTimeout(() => sfx('reward'), 1000);
    const bar = $('rsXp');
    bar.style.transition = 'none'; bar.style.width = `${L.level > before.level ? 0 : Math.round((before.into / before.need) * 100)}%`;
    requestAnimationFrame(() => { bar.style.transition = 'width 1.2s cubic-bezier(.2,.8,.3,1)'; bar.style.width = `${Math.round((L.into / L.need) * 100)}%`; });
    if (L.level > before.level) setTimeout(() => { rewardBurst(); }, 600);
  };
  return {
    el,
    // a new match is starting: forget any progress left over from the last one
    reset() { pendingProgress = null; shown = false; },
    show(m, ctx) {
      shown = true;
      el.hidden = false; el.classList.remove('leave'); void el.offsetWidth; el.classList.add('ui-screen', 'enter');
      const team = m.winTeam !== undefined;
      const rank = $('rsRank');
      rank.textContent = team ? (m.won ? 'WIN!' : m.winTeam === 0 ? 'DRAW' : 'LOSS') : '#' + m.rank;
      rank.classList.remove('slam'); void rank.offsetWidth; rank.classList.add('slam');
      setTimeout(() => sfx('uislam'), 120);
      $('rsMsg').textContent = ctx.msg;
      count($('rsBounty'), 0, m.bounty, 900); count($('rsKo'), 0, m.kills, 700);
      $('rsTro').textContent = '…'; $('rsXpN').textContent = ''; $('rsUps').innerHTML = '';
      // the crown banner and the list below it tell the same story: in score modes it names whoever
      // the list ranks #1, with the score the list shows; elsewhere it is the most bounty earned
      if (ctx.scoreLbl && !team) {
        const first = m.results.filter((r) => r[2] === 1);
        $('mvp').hidden = !first.length;
        if (first.length) $('mvp').innerHTML = `👑 ${first.length > 1 ? 'WINNERS' : 'WINNER'} <b>${first.slice(0, 3).map((r) => esc(r[0])).join(' & ')}</b> ${esc(first[0][7])} ${esc(ctx.scoreLbl)}`;
      } else {
        const mvp = m.results.reduce((b, r) => (!b || r[6] > b[6] ? r : b), null);
        $('mvp').hidden = !mvp || mvp[6] <= 0;
        if (mvp) $('mvp').innerHTML = `👑 MOST BOUNTY EARNED <b>${esc(mvp[0])}</b> ★${esc(mvp[6])}`;
      }
      $('results').innerHTML = ctx.rows;
      if (ctx.won) setTimeout(() => rewardBurst(innerWidth * 0.25, innerHeight * 0.4), 450);
      if (pendingProgress) { applyProgress(pendingProgress); pendingProgress = null; }
    },
    // the server's trophy/XP result usually arrives BEFORE the results screen is shown
    progress(m) { if (shown) applyProgress(m); else pendingProgress = m; },
    hide() { el.hidden = true; shown = false; },
  };
}
