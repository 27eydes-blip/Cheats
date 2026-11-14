// Full-screen menus: brawler select (+ detail flip panel), mode picker, locker, Hunt Pass,
// Trophy Road, profile, settings, friends, missions. All built from the design-system tokens.
import { BRAWLERS, BRAWLER_IDS, WORLDS, worldsInDisplayOrder } from '../shared.js';
import * as R from '../render.js';
import { SETTINGS, setSetting } from '../settings.js';
import { sfx } from '../audio.js';
import { icon } from './icons.js';
import { openScreen, closeScreen, popup, rewardBurst, flyCoins } from './fx.js';
import { drawModePreview } from './scenes.js';
import { setMusicVolume } from './music.js';
import * as A from '../account.js';
import { SKINS, KILL_FX, TITLES, TITLE_PRICE, PASS, PASS_TIERS, PASS_XP_PER_TIER, PREMIUM_PRICE, CURRENCY, passTier } from '../catalog.js';
import { totalTrophies, roadReward, ROAD_STEP, missionState, msToReset } from '../progression.js';
import { EVENTS, EVENT_IDS } from '../events/index.js';

const INK = '#1b1033';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_COL = { Balanced: '#ffb000', Tank: '#ff7b39', Sniper: '#19b6a6', Controller: '#e0a03a', Trapper: '#6f9a3a', Assassin: '#9d4dff' };
const guard = async (fn) => { try { await fn(); } catch (e) { toastErr(e.message); } };
function toastErr(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2000); }
const stash = (ids) => { const s = $('formStash'); for (const id of ids) { const el = $(id); if (el) s.appendChild(el.closest('label') && el.closest('label').parentElement !== s ? el.closest('label') : el); } };

// ---------- screen scaffold with an animation loop that only runs while it's open ----------
function screen(title, headExtra = '', onClose) {
  const el = document.createElement('div');
  el.className = 'ui-screen'; el.hidden = true;
  el.innerHTML = `<div class="ui-head"><button class="btn btn-sm alt back" aria-label="Back">${icon('back')}</button><div class="title">${title}</div>${headExtra}</div><div class="ui-body"></div>`;
  document.body.appendChild(el);
  const loops = [];
  const close = async () => { onClose?.(); await closeScreen(el); el.remove(); };
  el.querySelector('.back').onclick = close;
  openScreen(el);
  const t0 = performance.now();
  const tick = (now) => { if (!el.isConnected) return; for (const f of loops) f((now - t0) / 1000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { el, body: el.querySelector('.ui-body'), close, loop: (f) => loops.push(f) };
}
function fitCanvas(cv) {
  const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
  return { g, w: r.width, h: r.height };
}

// ======================================================================= BRAWLER SELECT
const ATTACK_TXT = {
  volt: ['Triple Bolt', 'Fires 3 fast bolts in a quick burst.'], brick: ['Scattershot', 'Short-range blast of 5 pellets — devastating up close.'],
  wisp: ['Longshot', 'One long-range, heavy-hitting shot.'], dune: ['Sand Wave', 'A slow, wide wave that pierces and slows everything it hits.'],
  rook: ['Trap Mine', 'Throws a mine that arms after 1s. Enemies only see it up close.'], flicker: ['Twin Slash', 'Two lightning-fast blade swipes at close range.'],
};
const SUPER_TXT = {
  volt: ['Surge Dash', 'Dashes forward, knocking enemies back.'], brick: ['Quake Slam', 'Slams the ground, stunning everyone nearby.'],
  wisp: ['Fade', 'Turns invisible for 3 seconds.'], dune: ['Sandworm', 'A sand-worm erupts under the target after a ripple warning.'],
  rook: ['Cage Shot', 'Traps the first enemy hit in a cage for 2 seconds.'], flicker: ['Shadow Step', 'Teleports behind the nearest enemy.'],
};
const maxBurst = Math.max(...BRAWLER_IDS.map((b) => BRAWLERS[b].attack.damage * BRAWLERS[b].attack.count));
function statsOf(id) {
  const B = BRAWLERS[id], a = B.attack;
  return [['HEALTH', B.hp / 6000, B.hp], ['DAMAGE', (a.damage * a.count) / maxBurst, a.damage * a.count], ['SPEED', B.speed / 310, B.speed], ['RANGE', a.range / 960, a.range]];
}

export function openBrawlerSelect(api, onDone) {
  const S = screen('BRAWLERS', `<div class="chips" id="roleChips"></div>`, onDone);
  const roles = ['ALL', ...new Set(BRAWLER_IDS.map((b) => BRAWLERS[b].role.toUpperCase()))];
  let filter = 'ALL';
  const chips = S.el.querySelector('#roleChips');
  const grid = document.createElement('div'); grid.className = 'grid-cards'; S.body.appendChild(grid);
  const draw = () => {
    chips.innerHTML = roles.map((r) => `<button class="chipbtn ${r === filter ? 'on' : ''}" data-r="${r}">${r}</button>`).join('');
    for (const c of chips.children) c.onclick = () => { filter = c.dataset.r; draw(); };
    const p = A.progress();
    grid.innerHTML = BRAWLER_IDS.filter((b) => filter === 'ALL' || BRAWLERS[b].role.toUpperCase() === filter).map((b) =>
      `<div class="card-b bcard tap ${b === api.getBrawler() ? 'sel' : ''}" data-b="${b}" style="--card-col:${ROLE_COL[BRAWLERS[b].role]}"><canvas data-b="${b}"></canvas><div class="title bc-name">${BRAWLERS[b].name}</div><div class="bc-tro">🏆 ${p.trophies[b] | 0}</div></div>`).join('');
    for (const c of grid.querySelectorAll('.bcard')) c.onclick = () => { api.setBrawler(c.dataset.b); draw(); openDetail(api, c.dataset.b, () => draw()); };
  };
  draw();
  S.loop((t) => {
    for (const cv of grid.querySelectorAll('canvas[data-b]')) {
      const { g, w, h } = fitCanvas(cv), id = cv.dataset.b;
      R.drawBrawler(g, id, w / 2, h * 0.6, 0.35 + Math.sin(t + id.length) * 0.2, t + id.length, { scale: (h / 70) * 0.95, skin: A.progress().equipped['skin:' + id] || null });
    }
  });
}

function demo(g, w, h, id, which, t) {
  // tiny looping demo: our brawler on the left, a dummy on the right
  g.fillStyle = '#8ee05e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#82d653'; for (let x = 0; x < w; x += 20) for (let y = (x / 20) % 2 ? 0 : 10; y < h; y += 20) g.fillRect(x, y, 10, 10);
  const sc = h / 110, bx = w * 0.22, by = h * 0.6, dx = w * 0.78, dy = h * 0.6, k = (t % 2.2) / 2.2;
  const B = BRAWLERS[id];
  let dummyX = dx, dummyAlpha = 1, meX = bx, meAlpha = 1, hit = false;
  if (which === 'attack') {
    const a = B.attack;
    if (a.kind === 'slash') { meX = bx + (dx - bx - 60 * sc) * Math.min(1, k * 2); if (k > 0.5) { g.lineWidth = 8 * sc; g.strokeStyle = '#ff5fa2'; g.beginPath(); g.arc(meX, by, 55 * sc, -0.8 + (k - 0.5) * 2, 0.8); g.stroke(); hit = true; } }
    else if (a.kind === 'mine') { const u = Math.min(1, k * 2); const mx = bx + (dx - bx - 40 * sc) * u, my = by - Math.sin(u * Math.PI) * 30 * sc; if (u < 1) R.drawBullet(g, 'rook', mx, my, 0); else R.drawMine(g, mx, by, k > 0.75, true, t); }
    else {
      const n = a.kind === 'spread' ? 5 : a.kind === 'burst' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const u = a.kind === 'burst' ? (k * 1.6 - i * 0.12) : k * 1.4;
        if (u <= 0 || u > 1) continue;
        const ang = a.kind === 'spread' ? (i - 2) * 0.13 : 0;
        R.drawBullet(g, id, bx + (dx - bx) * u, by + Math.sin(ang) * (dx - bx) * u, ang);
        if (u > 0.9) hit = true;
      }
    }
  } else {
    const s = B.super.kind;
    if (s === 'dash') { meX = bx + (dx - bx - 70 * sc) * Math.min(1, k * 2.5); if (k > 0.35) { dummyX = dx + Math.min(1, (k - 0.35) * 4) * 40 * sc; hit = true; } }
    else if (s === 'slam') { meX = dx - 70 * sc; if (k > 0.3) { g.lineWidth = 6; g.strokeStyle = '#ffd23f'; g.beginPath(); g.arc(meX, by, (k - 0.3) * 200 * sc, 0, 7); g.stroke(); hit = true; } }
    else if (s === 'cloak') { meAlpha = k > 0.25 ? 0.25 : 1; meX = bx + (dx - bx - 80 * sc) * k; }
    else if (s === 'worm') { if (k < 0.45) { g.lineWidth = 5; g.strokeStyle = '#2bc4cf'; g.beginPath(); g.arc(dx, dy, 20 + k * 80 * sc, 0, 7); g.stroke(); } else { R.drawWorm(g, dx, dy + 10 * sc, 40 * sc, (k - 0.45) / 0.55); hit = true; } }
    else if (s === 'cage') { const u = Math.min(1, k * 2.2); if (u < 1) R.drawBullet(g, 'cage', bx + (dx - bx) * u, by, 0); else hit = true; }
    else if (s === 'blink') { if (k > 0.3) { meX = dx + 55 * sc; } if (k > 0.3 && k < 0.4) meAlpha = 0.3; hit = k > 0.5; }
  }
  R.drawBrawler(g, 'brick', dummyX, dy, Math.PI, t, { scale: sc * 0.8, alpha: dummyAlpha, flash: hit && (t * 10) % 2 < 1 ? 1 : 0 });
  if (which === 'super' && BRAWLERS[id].super.kind === 'cage' && hit) R.drawCage(g, dummyX, dy);
  R.drawBrawler(g, id, meX, by, meX > dx ? Math.PI : 0, t, { scale: sc * 0.8, alpha: meAlpha, moving: true });
}

function openDetail(api, id, onClose) {
  const B = BRAWLERS[id], p = A.progress();
  const el = document.createElement('div'); el.className = 'detail'; el.hidden = true;
  const skins = [[null, 'Classic'], ...Object.entries(SKINS).filter(([, s]) => s.brawler === id).map(([k, s]) => [k, s.name])];
  el.innerHTML = `<div class="card-b" style="--card-col:${ROLE_COL[B.role]}">
    <div><canvas class="portrait"></canvas><div class="title" style="font-size:calc(var(--u)*4);text-align:center">${B.name}</div>
      <div style="text-align:center"><span class="role" style="--role-col:${ROLE_COL[B.role]}">${B.role.toUpperCase()}</span> <span class="np-tro">🏆 ${p.trophies[id] | 0}</span></div></div>
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="stats">${statsOf(id).map(([n, f, v]) => `<span>${n}</span><div class="bar shine"><i style="width:${Math.round(Math.min(1, f) * 100)}%"></i></div><span class="num">${v}</span>`).join('')}</div>
      <div class="abil"><canvas data-demo="attack"></canvas><div><h4>ATTACK · ${ATTACK_TXT[id][0]}</h4><p>${ATTACK_TXT[id][1]}</p></div></div>
      <div class="abil"><canvas data-demo="super"></canvas><div><h4>SUPER · ${SUPER_TXT[id][0]}</h4><p>${SUPER_TXT[id][1]}</p></div></div>
      <div class="skinrow">${skins.map(([k, n]) => { const own = !k || p.owned.includes(k), on = (p.equipped['skin:' + id] || null) === k; return `<div class="card-a sk tap ${on ? 'on' : ''}" data-skin="${k || ''}"><canvas data-skin="${k || ''}"></canvas>${esc(n)}${own ? '' : ` ${icon('lock')}`}</div>`; }).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-md alt" data-x>CLOSE</button><button class="btn btn-md" data-x data-sel>SELECT</button></div>
    </div></div>`;
  document.body.appendChild(el);
  openScreen(el);
  const close = async () => { await closeScreen(el); el.remove(); onClose?.(); };
  for (const b of el.querySelectorAll('[data-x]')) b.onclick = () => { if (b.dataset.sel !== undefined) api.setBrawler(id); close(); };
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  for (const s of el.querySelectorAll('.sk')) s.onclick = () => guard(async () => {
    const k = s.dataset.skin || null;
    if (k && !A.progress().owned.includes(k)) { toastErr(`Unlock ${SKINS[k].name} in the Locker or Hunt Pass`); return; }
    await A.shop({ action: 'equip', slot: 'skin:' + id, id: k });
    for (const o of el.querySelectorAll('.sk')) o.classList.toggle('on', o === s);
  });
  const t0 = performance.now();
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = (now - t0) / 1000;
    const pc = fitCanvas(el.querySelector('.portrait'));
    R.drawBrawler(pc.g, id, pc.w / 2, pc.h * 0.62, Math.sin(t * 0.8) * 0.6 + 0.3, t, { scale: pc.h / 80, skin: A.progress().equipped['skin:' + id] || null, blink: (t % 3.2) < 0.12 ? 1 : 0 });
    for (const cv of el.querySelectorAll('canvas[data-demo]')) { const c = fitCanvas(cv); demo(c.g, c.w, c.h, id, cv.dataset.demo, t); }
    for (const cv of el.querySelectorAll('.sk canvas')) { const c = fitCanvas(cv); R.drawBrawler(c.g, id, c.w / 2, c.h * 0.62, 0.3, t, { scale: c.h / 80, skin: cv.dataset.skin || null }); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ======================================================================= MODE PICKER
const MODE_CARDS = [
  ['quick', 'QUICK HUNT', 'A random event mode — something different every match.', '10 players', null],
  ['squad', 'SQUAD HUNT', '3v3. Kills fill your team pot. Biggest pot after 3:00 wins.', '3 v 3', 'NEW'],
  ['free', 'FREE PLAY', 'Drop into the open world. Four zones around a safe hub.', 'Drop-in', null],
  ['showdown', 'SHOWDOWN', 'Last hunter standing while the poison closes in.', '10 players', 'EVENT'],
];
export function openModePicker(current, onPick) {
  const S = screen('CHOOSE A MODE');
  S.body.classList.add('modes');
  S.body.innerHTML = `<div class="modes-grid">${MODE_CARDS.map(([k, n, d, pl, rib]) =>
    `<div class="card-b mcard tap ${k === current ? 'sel' : ''}" data-m="${k}" style="--card-col:${{ quick: '#5fb84a', squad: '#3a5aa8', free: '#2a9d8f', showdown: '#7a3fb0' }[k]}">${rib ? `<span class="ribbon ${rib === 'EVENT' ? 'event' : ''}">${rib}</span>` : ''}<canvas data-m="${k}"></canvas><div class="title mc-name">${n}</div><div class="mc-desc">${d}</div><div class="mc-meta"><span>${pl}</span><span>${k === current ? 'SELECTED' : 'TAP TO PICK'}</span></div></div>`).join('')}</div>
    <div class="events-row">WORLD EVENTS EVERY 30s: ${EVENT_IDS.map((e) => `<span title="${EVENTS[e].name}">${icon('ev_' + e)}</span>`).join('')}</div>`;
  for (const c of S.body.querySelectorAll('.mcard')) c.onclick = () => { onPick(c.dataset.m); S.close(); };
  S.loop((t) => { for (const cv of S.body.querySelectorAll('canvas[data-m]')) { const c = fitCanvas(cv); drawModePreview(c.g, cv.dataset.m, c.w, c.h, t); } });
}

// ======================================================================= LOCKER
export function openLocker(api, onDone) {
  const S = screen('LOCKER', `<div class="cur">${icon('coin')}<b id="lkCoins">0</b><small>TEST</small></div>`, onDone);
  let tab = 'skins', who = api.getBrawler(), fxDemo = null;
  S.body.innerHTML = `<div class="locker"><div class="card-a preview"><canvas id="lkPrev"></canvas><div id="lkTitle" class="title" style="font-size:calc(var(--u)*2.2)"></div><button class="btn btn-sm mint" id="lkFx">PREVIEW KILL EFFECT</button></div>
    <div class="items"><div class="chips" id="lkTabs"></div><div class="chips" id="lkWho" style="margin-top:6px"></div><div class="pedestals" id="lkItems"></div></div></div>`;
  const render = () => {
    const p = A.progress();
    $('lkCoins').textContent = p.coins;
    $('lkTabs').innerHTML = [['skins', 'SKINS'], ['fx', 'KILL EFFECTS'], ['titles', 'TITLES']].map(([k, l]) => `<button class="chipbtn ${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
    for (const b of $('lkTabs').children) b.onclick = () => { tab = b.dataset.t; render(); };
    $('lkWho').innerHTML = tab === 'skins' ? BRAWLER_IDS.map((b) => `<button class="chipbtn ${b === who ? 'on' : ''}" data-w="${b}">${BRAWLERS[b].name}</button>`).join('') : '';
    for (const b of $('lkWho').children) b.onclick = () => { who = b.dataset.w; render(); };
    let items;
    if (tab === 'skins') items = [[null, 'Classic', 0], ...Object.entries(SKINS).filter(([, s]) => s.brawler === who).map(([k, s]) => [k, s.name, s.price])].map(([k, n, price]) => ({ k, n, price, slot: 'skin:' + who, on: (p.equipped['skin:' + who] || null) === k }));
    else if (tab === 'fx') items = [[null, 'None', 0], ...Object.entries(KILL_FX).map(([k, f]) => [k, f.name, f.price])].map(([k, n, price]) => ({ k, n, price, slot: 'fx', on: (p.equipped.fx || null) === k }));
    else items = [[null, 'None'], ...Object.entries(TITLES)].map(([k, n]) => ({ k, n, price: TITLE_PRICE, slot: 'title', on: (p.equipped.title || null) === k }));
    $('lkItems').innerHTML = items.map((it) => {
      const own = !it.k || p.owned.includes(it.k);
      return `<div class="card-a ped tap ${it.on ? 'on' : ''}" data-k="${it.k || ''}" data-slot="${it.slot}">${tab === 'skins' ? `<canvas data-skin="${it.k || ''}"></canvas>` : `<div class="ico" style="font-size:calc(var(--u)*5)">${icon(tab === 'fx' ? 'star' : 'pass')}</div>`}<span>${esc(it.n)}</span>
        ${it.on ? '<span class="tag">EQUIPPED</span>' : own ? `<button class="btn btn-sm" data-eq>EQUIP</button>` : `<button class="btn btn-sm" data-buy>${icon('coin')} ${it.price}</button>`}</div>`;
    }).join('');
    for (const c of $('lkItems').children) {
      const k = c.dataset.k || null;
      c.querySelector('[data-eq]')?.addEventListener('click', (e) => { e.stopPropagation(); guard(async () => { await A.shop({ action: 'equip', slot: c.dataset.slot, id: k }); render(); }); });
      c.querySelector('[data-buy]')?.addEventListener('click', (e) => { e.stopPropagation(); guard(async () => { await A.shop({ action: 'buy', id: k }); rewardBurst(); render(); }); });
      c.addEventListener('click', () => { if (tab === 'fx') fxDemo = { id: k, t0: performance.now() }; });
    }
  };
  $('lkFx').onclick = () => { fxDemo = { id: A.progress().equipped.fx || 'sparks', t0: performance.now() }; sfx('elim'); };
  render();
  S.loop((t) => {
    const p = A.progress(), id = tab === 'skins' ? who : api.getBrawler();
    const c = fitCanvas($('lkPrev'));
    const base = c.h * 0.68;
    c.g.beginPath(); c.g.ellipse(c.w / 2, base + 18, c.w * 0.3, 14, 0, 0, 7); c.g.fillStyle = '#5b37b8'; c.g.fill(); c.g.lineWidth = 4; c.g.strokeStyle = INK; c.g.stroke();
    R.drawBrawler(c.g, id, c.w / 2, base - 10, t * 0.9, t, { scale: Math.min(c.h / 95, c.w / 70), skin: p.equipped['skin:' + id] || null });
    $('lkTitle').textContent = p.equipped.title ? TITLES[p.equipped.title] : '';
    if (fxDemo && fxDemo.id) {
      const k = (performance.now() - fxDemo.t0) / 1000;
      if (k > 1.2) fxDemo = null; else drawFxDemo(c.g, fxDemo.id, c.w / 2, base - 30, k);
    }
    for (const cv of document.querySelectorAll('#lkItems canvas[data-skin]')) {
      const q = fitCanvas(cv);
      q.g.beginPath(); q.g.ellipse(q.w / 2, q.h * 0.8, q.w * 0.32, 8, 0, 0, 7); q.g.fillStyle = '#5b37b8'; q.g.fill(); q.g.lineWidth = 3; q.g.strokeStyle = INK; q.g.stroke();
      R.drawBrawler(q.g, who, q.w / 2, q.h * 0.62, t * 1.2, t, { scale: q.h / 85, skin: cv.dataset.skin || null }); // rotating pedestal
    }
  });
}
function drawFxDemo(g, id, x, y, k) {
  g.save(); g.globalAlpha = Math.max(0, 1 - k);
  const cols = ['#ff4d5e', '#4be06e', '#3a86ff', '#ffd23f', '#c04dff'];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, d = 20 + k * 110;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + (id === 'confetti' ? k * 60 : 0);
    g.fillStyle = id === 'sparks' ? '#ffe066' : id === 'confetti' ? cols[i % 5] : id === 'bolt' ? '#5ff4ff' : '#fff';
    if (id === 'stars') R.outlinedText(g, '★', px, py, 18, '#ffd23f'); else { g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill(); }
  }
  if (id === 'ghost') R.outlinedText(g, '👻', x, y - k * 60, 34);
  g.restore();
}

// ======================================================================= HUNT PASS
const rewardIcon = (r) => (r.coins ? 'coin' : r.skin ? 'locker' : r.fx ? 'star' : 'pass');
const rewardLabel = (r) => (r.coins ? `${r.coins}` : r.skin ? SKINS[r.skin].name : r.fx ? KILL_FX[r.fx].name : TITLES[r.title]);
export function openPass(onDone) {
  const S = screen('HUNT PASS', `<div class="cur" id="tbCoins">${icon('coin')}<b id="hpCoins">0</b><small>TEST</small></div>`, onDone);
  const render = (keepScroll) => {
    const p = A.progress(), tier = passTier(p.pass.xp), into = (p.pass.xp || 0) % PASS_XP_PER_TIER;
    const sc = S.body.querySelector('.track')?.scrollLeft;
    $('hpCoins').textContent = p.coins;
    const cell = (row, track) => {
      const key = `${track}:${row.tier}`, got = p.pass.claimed.includes(key), locked = row.tier > tier || (track === 'premium' && !p.pass.premium);
      return `<div class="card-b rw ${track} ${got ? 'got' : ''} ${locked ? 'locked' : ''}">${icon(rewardIcon(row[track]))}<span>${esc(rewardLabel(row[track]))}</span>${got ? '✓' : locked ? icon('lock') : `<button class="btn btn-sm claim" data-t="${row.tier}" data-k="${track}">CLAIM</button>`}</div>`;
    };
    S.body.innerHTML = `<div class="pass-wrap">
      <div class="pass-top"><span class="title" style="font-size:calc(var(--u)*3)">TIER ${tier}/${PASS_TIERS}</span><div class="bar shine"><i style="width:${tier >= PASS_TIERS ? 100 : Math.round((into / PASS_XP_PER_TIER) * 100)}%"></i></div>
        <span class="outlined" style="color:#fff">${tier >= PASS_TIERS ? 'COMPLETE!' : `${into}/${PASS_XP_PER_TIER} XP`}</span>
        ${p.pass.premium ? '<span class="role" style="--role-col:#8f5cff">PREMIUM ✓</span>' : `<button class="btn btn-md" id="premBtn">${icon('pass')} UNLOCK PREMIUM · ${PREMIUM_PRICE} ${icon('coin')}</button>`}</div>
      <div class="track">${PASS.map((row) => `<div class="tier ${row.tier <= tier ? 'reached' : ''}">${cell(row, 'premium')}<div class="num">${row.tier}</div>${cell(row, 'free')}</div>`).join('')}</div>
      <p class="hint" style="margin:0;text-align:center">${CURRENCY} — test currency only, no real money. Premium row on top, free row below.</p></div>`;
    const tr = S.body.querySelector('.track');
    if (keepScroll && sc != null) tr.scrollLeft = sc;
    else requestAnimationFrame(() => { const el = tr.children[Math.max(0, tier - 2)]; if (el) tr.scrollLeft = el.offsetLeft - 8; });
    $('premBtn')?.addEventListener('click', () => guard(async () => { await A.shop({ action: 'premium' }); rewardBurst(); render(true); }));
    for (const b of S.body.querySelectorAll('.claim')) b.onclick = () => guard(async () => {
      const row = PASS[+b.dataset.t - 1], r = row[b.dataset.k], cellEl = b.closest('.rw');
      await A.shop({ action: 'passClaim', tier: +b.dataset.t, track: b.dataset.k });
      cellEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
      if (r.coins) flyCoins(cellEl, '#tbCoins', 8, icon('coin')); else rewardBurst();
      sfx('reward');
      setTimeout(() => render(true), 900);
    });
  };
  render();
}

// ======================================================================= TROPHY ROAD
export function openRoad(onDone) {
  const S = screen('TROPHY ROAD', `<span class="cur">${icon('trophy')}<b id="trN">0</b></span>`, onDone);
  const render = (keep) => {
    const p = A.progress(), tt = totalTrophies(p);
    $('trN').textContent = tt;
    const max = Math.max(1000, Math.ceil((tt + 1) / ROAD_STEP) * ROAD_STEP + 300);
    const n = max / ROAD_STEP, gap = 130, H = (n + 1) * gap, W = Math.min(innerWidth - 40, 560);
    const pos = (i) => ({ x: W / 2 + Math.sin(i * 0.95) * W * 0.28, y: H - (i + 0.5) * gap }); // node i at trophies i*100, bottom = 0
    let d = ''; for (let i = 0; i <= n; i++) { const a = pos(i); d += i ? ` S ${pos(i - 0.5).x} ${pos(i - 0.5).y} ${a.x} ${a.y}` : `M ${a.x} ${a.y}`; }
    const done = tt / ROAD_STEP, m = pos(Math.min(n, done));
    const wrapScroll = S.body.querySelector('.road-wrap')?.scrollTop;
    S.body.innerHTML = `<div class="road-wrap"><div style="position:relative;width:${W}px;height:${H}px;margin:0 auto">
      <svg class="road-svg" width="${W}" height="${H}"><path d="${d}" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#7b52ff" stroke-width="14" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="#ffd23f" stroke-width="14" stroke-linecap="round" pathLength="${n}" stroke-dasharray="${Math.min(n, done)} ${n}"/></svg>
      ${Array.from({ length: n }, (_, k) => { const i = k + 1, at = i * ROAD_STEP, r = roadReward(at), q = pos(i), got = p.claimed.includes(at), ok = tt >= at;
        return `<div class="node ${ok ? 'reached' : ''} ${i % 2 ? 'left' : ''}" style="left:${q.x}px;top:${q.y}px"><div class="disc">${at}</div><div class="rlabel">${icon(rewardIcon(r))}${esc(rewardLabel(r))}${got ? ' ✓' : ok ? ` <button class="btn btn-sm" data-at="${at}">CLAIM</button>` : ` ${icon('lock')}`}</div></div>`; }).join('')}
      <div class="marker" style="left:${m.x}px;top:${m.y}px"></div></div></div>`;
    const wrap = S.body.querySelector('.road-wrap');
    if (keep && wrapScroll != null) wrap.scrollTop = wrapScroll;
    else requestAnimationFrame(() => { wrap.scrollTop = m.y - wrap.clientHeight / 2; });
    for (const b of S.body.querySelectorAll('[data-at]')) b.onclick = () => guard(async () => {
      const r = roadReward(+b.dataset.at);
      await A.claimRoad(+b.dataset.at);
      if (r.coins) flyCoins(b, '#trN', 6, icon('coin')); rewardBurst();
      setTimeout(() => render(true), 700);
    });
  };
  render();
}

// ======================================================================= PROFILE / SETTINGS / FRIENDS / MISSIONS
export function openProfile(api, onDone, upgradeFirst = false) {
  const S = screen('PROFILE', '', () => { stash(['name']); api.saveName(); onDone?.(); });
  const u = A.ACC.user;
  S.body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
    <div class="card-a" style="padding:12px"><div class="title" style="font-size:calc(var(--u)*2.4)">NAME</div><div id="nameSlot" style="margin-top:6px"></div>
      <div class="title" style="font-size:calc(var(--u)*2.4);margin-top:12px">ACCOUNT</div><div id="accSlot"></div></div>
    <div class="card-a" style="padding:12px"><div class="title" style="font-size:calc(var(--u)*2.4)">STATS BY WORLD</div><table class="stat-table">${api.statRows()}</table></div></div>`;
  const nm = $('name'); nm.classList.add('field'); $('nameSlot').appendChild(nm);
  const acc = $('accSlot');
  if (u && !u.guest) {
    acc.innerHTML = `<p class="outlined" style="color:#fff">Signed in as ${esc(u.username)} — progress syncs to every device.</p><button class="btn btn-md alt" id="logout">LOG OUT</button>`;
    $('logout').onclick = () => guard(async () => { await A.logout(); S.close(); });
  } else {
    acc.innerHTML = `<p class="outlined" style="color:#fff;font-size:calc(var(--u)*1.7)">You're a guest. Create an account to keep your progress and play on your iPad too.</p>
      <form id="regF" style="display:grid;gap:6px"><input class="field" name="username" placeholder="Username" maxlength="16" autocomplete="username"><input class="field" name="password" type="password" placeholder="Password (6+)" autocomplete="new-password"><button class="btn btn-md">SAVE PROGRESS</button></form>
      <details style="margin-top:8px;color:#fff;font-family:var(--font)"><summary>Already have an account? Log in</summary><form id="logF" style="display:grid;gap:6px;margin-top:6px"><input class="field" name="username" placeholder="Username"><input class="field" name="password" type="password" placeholder="Password"><button class="btn btn-md alt">LOG IN</button></form></details><p class="err" id="accE"></p>`;
    const go = (fn) => (e) => { e.preventDefault(); const f = new FormData(e.target); guard(async () => { try { await fn(f.get('username'), f.get('password')); rewardBurst(); S.close(); } catch (err) { $('accE').textContent = err.message; } }); };
    $('regF').onsubmit = go(A.register); $('logF').onsubmit = go(A.login);
    if (upgradeFirst) setTimeout(() => $('regF').querySelector('input').focus(), 300);
  }
}

export function openSettings(api, onDone) {
  const S = screen('SETTINGS', '', () => { stash(['setFlash', 'setLow', 'setSound']); onDone?.(); });
  S.body.innerHTML = `<div class="card-a" style="padding:16px;max-width:620px;margin:0 auto"><div class="settings-list">
    ${icon('music')}<label>MUSIC <input type="range" class="slider" id="volMusic" min="0" max="1" step="0.05"></label>
    ${icon('speaker')}<label>SOUND EFFECTS <input type="range" class="slider" id="volSfx" min="0" max="1" step="0.05"></label>
    <span></span><div id="setSlot" style="display:flex;flex-direction:column;gap:10px"></div></div>
    <p class="hint">Reduce Flashing removes flashes, strobes and screen shake. Low Graphics turns off the moving lobby background, particles, shadows and slime animation.</p>
    <p style="color:var(--gold);font-family:var(--font)">Created by Sam Eyde III</p></div>`;
  for (const id of ['setSound', 'setFlash', 'setLow']) { const l = $(id).closest('label') || $(id); $('setSlot').appendChild(l); }
  $('volMusic').value = SETTINGS.musicVol ?? 0.6; $('volSfx').value = SETTINGS.sfxVol ?? 0.9;
  $('volMusic').oninput = (e) => { setSetting('musicVol', +e.target.value); setMusicVolume(); };
  $('volSfx').oninput = (e) => { setSetting('sfxVol', +e.target.value); };
  $('volSfx').onchange = () => sfx('click');
}

export function openFriends(api) {
  const code = $('room').value || '';
  const P = popup(`<div class="title" style="font-size:calc(var(--u)*3.4)">PLAY WITH FRIENDS</div>
    <p class="outlined" style="color:#fff;font-size:calc(var(--u)*1.7)">Everyone types the same room code and presses play.</p>
    <div id="roomSlot" style="display:flex;gap:8px;align-items:center"></div><div id="botsSlot" style="margin:8px 0;color:#fff;font-family:var(--font)"></div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn btn-md alt" id="newCode">NEW CODE</button><button class="btn btn-md alt" id="shareCode">${icon('share')} SHARE</button><button class="btn btn-md" id="roomPlay" data-sfx="play">PLAY</button></div>
    <p class="hint">Friends list — coming soon.</p><button class="btn btn-sm alt" data-close>CLOSE</button>`, { onClose: () => stash(['room', 'bots']) });
  const room = $('room'); room.classList.add('field'); room.value = code; $('roomSlot').appendChild(room);
  const bl = $('bots').closest('label'); $('botsSlot').appendChild(bl);
  $('newCode').onclick = () => { room.value = Math.random().toString(36).slice(2, 7).toUpperCase(); };
  $('shareCode').onclick = async () => { const t = `Join my Hunt room: ${room.value} — ${location.origin}`; try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toastErr('Copied!'); } } catch {} };
  $('roomPlay').onclick = () => { if (!room.value.trim()) { room.value = Math.random().toString(36).slice(2, 7).toUpperCase(); } P.close(); api.startQuick({ fromFriends: true }); };
}

export function openMissions(onDone) {
  const render = (P) => {
    const ms = missionState(A.progress());
    const s = Math.floor(msToReset() / 1000);
    P.card.querySelector('.missionlist').innerHTML = ms.map((m) => `<div class="mission"><span>${esc(m.text)}</span><span>${m.reward.coins ? `${icon('coin')} ${m.reward.coins}` : `${icon('gem')} ${m.reward.gems}`}</span>
      <div class="bar shine"><i style="width:${Math.round((m.have / m.goal) * 100)}%"></i></div>${m.claimed ? '<span>✓</span>' : m.done ? `<button class="btn btn-sm" data-m="${m.id}">CLAIM</button>` : `<span>${m.have}/${m.goal}</span>`}</div>`).join('');
    P.card.querySelector('.reset').textContent = `New missions in ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    for (const b of P.card.querySelectorAll('[data-m]')) b.onclick = () => guard(async () => { await A.shop({ action: 'mission', id: b.dataset.m }); rewardBurst(); flyCoins(b, '#tbCoins', 6, icon('coin')); render(P); onDone?.(); });
  };
  const P = popup(`<div class="title" style="font-size:calc(var(--u)*3.4)">DAILY MISSIONS</div><div class="missionlist"></div><p class="hint reset"></p><button class="btn btn-md alt" data-close>CLOSE</button>`, { onClose: onDone });
  render(P);
}

export function openEarnInfo() {
  popup(`<div class="title" style="font-size:calc(var(--u)*3)">TEST CURRENCY</div>
    <p class="outlined" style="color:#fff;font-size:calc(var(--u)*1.8)">${icon('coin')} Coins and ${icon('gem')} gems are <b>test currency</b> — there are no real payments.</p>
    <p class="outlined" style="color:#fff;font-size:calc(var(--u)*1.6)">Earn them from daily missions, the Hunt Pass and the Trophy Road.</p><button class="btn btn-md" data-close>GOT IT</button>`);
}
