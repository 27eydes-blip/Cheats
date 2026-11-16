// Full-screen menus: brawler select (+ detail flip panel), mode picker, locker, GP Pass,
// Trophy Road, profile, settings, friends, missions. All built from the design-system tokens.
import { inviteText } from '../brand/name.js';
import { BRAWLERS, BRAWLER_IDS, WORLDS, worldsInDisplayOrder } from '../shared.js';
import * as R from '../render.js';
import { SETTINGS, setSetting } from '../settings.js';
import { sensName } from '../race/controls.js';
import { sfx } from '../audio.js';
import { icon } from './icons.js';
import { openScreen, closeScreen, popup, rewardBurst, flyCoins } from './fx.js';
import { drawModePreview } from './scenes.js';
import { setMusicVolume } from './music.js';
import * as A from '../account.js';
import { SKINS, KILL_FX, TITLES, PASS, PASS_TIERS, PASS_XP_PER_TIER, PREMIUM_PRICE, CURRENCY, passTier, priceOf, itemId, DUPE_COINS } from '../catalog.js';
import { totalTrophies, roadReward, ROAD_STEP, missionState, msToReset, levelInfo, levelReward, weaponUnlocked, earnTag, earnHint, armoryKeys, seenList } from '../progression.js';
import { EMOTES } from '../catalog.js';
import { MAX_POWER, POWER_COST, GADGET_AT, STAR_AT, GADGETS, STARS, clampPower, powerMult } from '../power.js';
import { WEAPONS, WEAPON_IDS, WEAPON_CLASSES, weaponStats, withPerks, masteryInfo, MASTERY_SKINS, perksFor } from '../weapons.js';
import { EVENTS, EVENT_IDS } from '../events/index.js';
import { DRIVERS, DRIVER_IDS } from '../race/physics.js';
import { RACE_MODES } from '../race/protocol.js';
import { TRACK_IDS } from '../race/tracks.js';
import { paintPreview, driverStats, weaponOf, trackLabel, TRACK_CHOICES } from '../race/preview.js';
import { drawCar } from '../race/cars.js';
import { carName } from '../race/looks.js';
import { drawPlatform, equippedLook } from './platform.js';

const INK = '#1b1033';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_COL = { Balanced: '#ffb000', Tank: '#ff7b39', Sniper: '#19b6a6', Controller: '#e0a03a', Trapper: '#6f9a3a', Assassin: '#9d4dff' };
// one shop/claim/login request at a time: a double tap must not send it twice
let busy = false;
const guard = async (fn) => { if (busy) return; busy = true; try { await fn(); } catch (e) { toastErr(e.message); } finally { busy = false; } };
export const toastMsg = (msg) => toastErr(msg);
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
    const p = A.progress(), had = grid.contains(document.activeElement) ? document.activeElement.dataset.b : null;
    grid.innerHTML = BRAWLER_IDS.filter((b) => filter === 'ALL' || BRAWLERS[b].role.toUpperCase() === filter).map((b) =>
      `<div class="card-b bcard tap ${b === api.getBrawler() ? 'sel' : ''}" tabindex="0" role="button" aria-label="${BRAWLERS[b].name}" data-b="${b}" style="--card-col:${ROLE_COL[BRAWLERS[b].role]}"><canvas data-b="${b}"></canvas><div class="title bc-name">${BRAWLERS[b].name}</div><div class="bc-tro">🏆 ${p.trophies[b] | 0}</div></div>`).join('');
    // a card opens a preview: only SELECT in the detail changes your hunter
    for (const c of grid.querySelectorAll('.bcard')) c.onclick = () => openDetail(api, c.dataset.b, () => draw());
    if (had) grid.querySelector(`[data-b="${had}"]`)?.focus({ preventScroll: true }); // keep keyboard focus across a redraw
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
  const skins = [[null, 'Hunter'], ...Object.entries(SKINS).filter(([, s]) => s.brawler === id).map(([k, s]) => [k, s.name])];
  el.innerHTML = `<div class="card-b" style="--card-col:${ROLE_COL[B.role]}">
    <div><canvas class="portrait"></canvas><div class="title" style="font-size:calc(var(--u)*4);text-align:center">${B.name}</div>
      <div style="text-align:center"><span class="role" style="--role-col:${ROLE_COL[B.role]}">${B.role.toUpperCase()}</span> <span class="np-tro">🏆 ${p.trophies[id] | 0}</span></div></div>
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="stats">${statsOf(id).map(([n, f, v]) => `<span>${n}</span><div class="bar shine"><i style="width:${Math.round(Math.min(1, f) * 100)}%"></i></div><span class="num">${v}</span>`).join('')}</div>
      <div class="abil"><canvas data-demo="attack"></canvas><div><h4>ATTACK · ${ATTACK_TXT[id][0]}</h4><p>${ATTACK_TXT[id][1]}</p></div></div>
      <div class="abil"><canvas data-demo="super"></canvas><div><h4>SUPER · ${SUPER_TXT[id][0]}</h4><p>${SUPER_TXT[id][1]}</p></div></div>
      <div class="skinrow">${skins.map(([k, n]) => { const own = !k || p.owned.includes(k), on = (p.equipped['skin:' + id] || null) === k; return `<div class="card-a sk tap ${on ? 'on' : ''}" tabindex="0" role="button" aria-label="Preview ${esc(n)}" data-skin="${k || ''}"><canvas data-skin="${k || ''}"></canvas>${esc(n)}${own ? '' : ` ${icon('lock')}`}</div>`; }).join('')}</div>
      <div class="detail-actions"><button class="btn btn-md alt" data-x>CLOSE</button><button class="btn btn-md mint" data-power>${icon('star')} POWER ${clampPower(p.power?.[id] || 1)}</button><button class="btn btn-md" data-x data-sel>SELECT</button></div>
    </div></div>`;
  document.body.appendChild(el);
  openScreen(el);
  const close = async () => { await closeScreen(el); el.remove(); onClose?.(); };
  // a preview: the skin you tap shows on the portrait; SELECT makes it your hunter (and wears the
  // skin if you own it); CLOSE, a tap outside or Escape change nothing
  let look = p.equipped['skin:' + id] || null;
  for (const b of el.querySelectorAll('[data-x]')) b.onclick = () => guard(async () => {
    if (b.dataset.sel !== undefined) {
      const owned = !look || A.progress().owned.includes(look);
      if (owned && look !== (A.progress().equipped['skin:' + id] || null)) await A.shop({ action: 'equip', slot: 'skin:' + id, id: look });
      api.setBrawler(id);
    }
    await close();
  });
  // POWER: upgrades, Gadget and Star Power for this hunter (the popup opens once the card is gone)
  el.querySelector('[data-power]').onclick = async () => { await closeScreen(el); el.remove(); openPower(api, onClose, id); };
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  for (const s of el.querySelectorAll('.sk')) s.onclick = () => {
    const k = s.dataset.skin || null;
    look = k;
    for (const o of el.querySelectorAll('.sk')) o.classList.toggle('on', o === s);
    if (k && !A.progress().owned.includes(k)) toastErr(earnTag(k) ? earnHint(k, SKINS[k].name) : `Buy ${SKINS[k].name} in the Locker`);
  };
  const t0 = performance.now();
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = (now - t0) / 1000;
    const pc = fitCanvas(el.querySelector('.portrait'));
    R.drawBrawler(pc.g, id, pc.w / 2, pc.h * 0.62, Math.sin(t * 0.8) * 0.6 + 0.3, t, { scale: pc.h / 80, skin: look, blink: (t % 3.2) < 0.12 ? 1 : 0 });
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
  ['bighunt', 'BIG HUNT', '20 hunters, one huge arena. Last one standing while the poison closes in.', '20 players', 'NEW'],
  ['free', 'FREE PLAY', 'Drop into the open world. Eight zones around a safe hub.', 'Drop-in', null],
  ['showdown', 'SHOWDOWN', 'Last hunter standing while the poison closes in.', '10 players', 'EVENT'],
];
export function openModePicker(current, onPick) {
  const S = screen('CHOOSE A MODE');
  S.body.classList.add('modes');
  S.body.innerHTML = `<div class="modes-grid">${MODE_CARDS.map(([k, n, d, pl, rib]) =>
    `<div class="card-b mcard tap ${k === current ? 'sel' : ''}" data-m="${k}" style="--card-col:${{ quick: '#5fb84a', squad: '#3a5aa8', free: '#2a9d8f', showdown: '#7a3fb0', bighunt: '#a8323e' }[k]}">${rib ? `<span class="ribbon ${rib === 'EVENT' ? 'event' : ''}">${rib}</span>` : ''}<canvas data-m="${k}"></canvas><div class="title mc-name">${n}</div><div class="mc-desc">${d}</div><div class="mc-meta"><span>${pl}</span><span>${k === current ? 'SELECTED' : 'TAP TO PICK'}</span></div></div>`).join('')}</div>
    <div class="events-row">WORLD EVENTS EVERY 30s: ${EVENT_IDS.map((e) => `<span title="${EVENTS[e].name}">${icon('ev_' + e)}</span>`).join('')}</div>`;
  for (const c of S.body.querySelectorAll('.mcard')) c.onclick = () => { onPick(c.dataset.m); S.close(); };
  S.loop((t) => { for (const cv of S.body.querySelectorAll('canvas[data-m]')) { const c = fitCanvas(cv); drawModePreview(c.g, cv.dataset.m, c.w, c.h, t); } });
}

// ======================================================================= LOCKER
// The Locker preview turns your hunter right round: fit its full reach (weapon included) in the canvas.
const REACH = 68;
export function lockerFit(w, h) {
  const sc = Math.max(0.1, Math.min((w / 2 - 4) / REACH, (h - 8) / (REACH * 2 + 6)));
  return { sc, x: w / 2, y: Math.max(REACH * sc + 4, Math.min(h * 0.52, h - (REACH + 6) * sc - 4)) };
}
export function openLocker(api, onDone, startTab = 'skins', startWho = null) {
  const S = screen('LOCKER', `<div class="cur">${icon('coin')}<b id="lkCoins">0</b><small>TEST</small></div>`, onDone);
  // peek: the item you tapped, shown in the preview without equipping it (EQUIP / BUY commit)
  let tab = startTab, who = startWho || api.getBrawler(), fxDemo = null, peek = null;
  S.body.innerHTML = `<div class="locker"><div class="card-a preview"><canvas id="lkPrev"></canvas><div id="lkTitle" class="title" style="font-size:max(var(--t-sm), calc(var(--u) * 2.2))"></div><button class="btn btn-sm mint" id="lkFx">PREVIEW KILL EFFECT</button></div>
    <div class="items"><div class="chips" id="lkTabs"></div><div class="chips" id="lkWho" style="margin-top:6px"></div><div class="pedestals" id="lkItems"></div></div></div>`;
  const render = () => {
    const p = A.progress();
    $('lkCoins').textContent = p.coins;
    $('lkTabs').innerHTML = [['skins', 'SKINS'], ['fx', 'KILL EFFECTS'], ['titles', 'TITLES']].map(([k, l]) => `<button class="chipbtn ${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
    for (const b of $('lkTabs').children) b.onclick = () => { tab = b.dataset.t; peek = null; render(); };
    $('lkWho').innerHTML = tab === 'skins' ? BRAWLER_IDS.map((b) => `<button class="chipbtn ${b === who ? 'on' : ''}" data-w="${b}">${BRAWLERS[b].name}</button>`).join('') : '';
    for (const b of $('lkWho').children) b.onclick = () => { who = b.dataset.w; peek = null; render(); };
    let items;
    // prices come from priceOf (the server's rule): rewards are never sold, they show where to earn them
    if (tab === 'skins') items = [[null, 'Hunter'], ...Object.entries(SKINS).filter(([, s]) => s.brawler === who).map(([k, s]) => [k, s.name])].map(([k, n]) => ({ k, n, slot: 'skin:' + who, on: (p.equipped['skin:' + who] || null) === k }));
    else if (tab === 'fx') items = [[null, 'None'], ...Object.entries(KILL_FX).map(([k, f]) => [k, f.name])].map(([k, n]) => ({ k, n, slot: 'fx', on: (p.equipped.fx || null) === k }));
    else items = [[null, 'None'], ...Object.entries(TITLES)].map(([k, n]) => ({ k, n, slot: 'title', on: (p.equipped.title || null) === k }));
    $('lkItems').innerHTML = items.map((it) => {
      const own = !it.k || p.owned.includes(it.k), earn = own ? null : earnTag(it.k), price = it.k ? priceOf(it.k) : null;
      // reward items (level / Trophy Road / GP Pass) are earned, never bought: a lock and where from
      const act = it.on ? '<span class="tag">EQUIPPED</span>' : own ? `<button class="btn btn-sm" data-eq>EQUIP</button>`
        : earn || price == null ? `<span class="tag earn">${icon('lock')} ${earn || 'LOCKED'}</span>` : `<button class="btn btn-sm" data-buy>${icon('coin')} ${price}</button>`;
      return `<div class="card-a ped tap ${it.on ? 'on' : ''} ${peek && peek.slot === it.slot && peek.k === it.k ? 'peek' : ''}" tabindex="0" role="button" aria-label="Preview ${esc(it.n)}" data-k="${it.k || ''}" data-slot="${it.slot}">${tab === 'skins' ? `<canvas data-skin="${it.k || ''}"></canvas>` : `<div class="ico" style="font-size:calc(var(--u)*5)">${icon(tab === 'fx' ? 'star' : 'pass')}</div>`}<span>${esc(it.n)}</span>
        ${act}</div>`;
    }).join('');
    for (const c of $('lkItems').children) {
      const k = c.dataset.k || null;
      c.querySelector('[data-eq]')?.addEventListener('click', (e) => { e.stopPropagation(); guard(async () => { await A.shop({ action: 'equip', slot: c.dataset.slot, id: k }); render(); }); });
      c.querySelector('[data-buy]')?.addEventListener('click', (e) => { e.stopPropagation(); guard(async () => { await A.shop({ action: 'buy', id: k }); rewardBurst(); render(); }); });
      c.addEventListener('click', () => {
        peek = { slot: c.dataset.slot, k };
        for (const o of $('lkItems').children) o.classList.toggle('peek', o === c);
        if (tab === 'fx') fxDemo = { id: k, t0: performance.now() };
      });
    }
  };
  $('lkFx').onclick = () => { fxDemo = { id: A.progress().equipped.fx || 'sparks', t0: performance.now() }; sfx('elim'); };
  render();
  S.loop((t) => {
    const p = A.progress(), id = tab === 'skins' ? who : api.getBrawler();
    const pk = (slot) => (peek && peek.slot === slot ? peek.k : p.equipped[slot] || null);
    const c = fitCanvas($('lkPrev'));
    const f = lockerFit(c.w, c.h), base = f.y + 10;
    c.g.beginPath(); c.g.ellipse(f.x, f.y + 34 * f.sc, Math.min(c.w * 0.3, 40 * f.sc), Math.min(14, 11 * f.sc), 0, 0, 7); c.g.fillStyle = '#5b37b8'; c.g.fill(); c.g.lineWidth = 4; c.g.strokeStyle = INK; c.g.stroke();
    R.drawBrawler(c.g, id, f.x, f.y, t * 0.9, t, { scale: f.sc, skin: pk('skin:' + id) });
    const ti = pk('title'), tt = ti ? TITLES[ti] : '';
    if ($('lkTitle').textContent !== tt) $('lkTitle').textContent = tt;
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

// ======================================================================= GP PASS
const rewardIcon = (r) => (r.coins ? 'coin' : r.skin ? 'locker' : r.fx ? 'star' : 'pass');
const rewardLabel = (r) => (r.coins ? `${r.coins}` : r.skin ? SKINS[r.skin].name : r.fx ? KILL_FX[r.fx].name : TITLES[r.title]);
const dupeCoins = (r) => DUPE_COINS[r.skin ? 'skin' : r.fx ? 'fx' : 'title'];
export function openPass(onDone) {
  const S = screen('GP PASS', `<div class="cur" id="hpCoinChip">${icon('coin')}<b id="hpCoins">0</b><small>TEST</small></div>`, onDone);
  if (document.getElementById('lobby')?.classList.contains('racing')) S.el.classList.add('neon'); // the neon racing look (store.css)
  const render = (keepScroll) => {
    const p = A.progress(), tier = passTier(p.pass.xp), into = (p.pass.xp || 0) % PASS_XP_PER_TIER;
    const sc = S.body.querySelector('.track')?.scrollLeft;
    $('hpCoins').textContent = p.coins;
    const cell = (row, track) => {
      const key = `${track}:${row.tier}`, got = p.pass.claimed.includes(key), locked = row.tier > tier || (track === 'premium' && !p.pass.premium);
      const r = row[track], dupe = !got && itemId(r) && p.owned.includes(itemId(r)) ? dupeCoins(r) : 0;
      return `<div class="card-b rw ${track} ${got ? 'got' : ''} ${locked ? 'locked' : ''}">${icon(rewardIcon(r))}<span>${esc(rewardLabel(r))}${dupe ? `<small style="display:block;color:var(--gold)">Owned → +${dupe}</small>` : ''}</span>${got ? '✓' : locked ? icon('lock') : `<button class="btn btn-sm claim" data-t="${row.tier}" data-k="${track}">CLAIM</button>`}</div>`;
    };
    S.body.innerHTML = `<div class="pass-wrap">
      <div class="pass-top"><span class="title" style="font-size:calc(var(--u)*3)">TIER ${tier}/${PASS_TIERS}</span><div class="bar shine"><i style="width:${tier >= PASS_TIERS ? 100 : Math.round((into / PASS_XP_PER_TIER) * 100)}%"></i></div>
        <span class="outlined" style="color:#fff">${tier >= PASS_TIERS ? 'COMPLETE!' : `${into}/${PASS_XP_PER_TIER} XP`}</span>
        ${p.pass.premium ? '<span class="role" style="--role-col:#8f5cff">PREMIUM ✓</span>' : `<button class="btn btn-md" id="premBtn">${icon('pass')} UNLOCK PREMIUM · ${PREMIUM_PRICE} ${icon('coin')}</button>`}</div>
      <div class="track">${PASS.map((row) => `<div class="tier ${row.tier <= tier ? 'reached' : ''}">${cell(row, 'premium')}<div class="num">${row.tier}</div>${cell(row, 'free')}</div>`).join('')}</div>
      <p class="hint" style="margin:0;text-align:center">${CURRENCY} — test currency only, no real money. Premium row on top, free row below.</p></div>`;
    const tr = S.body.querySelector('.track');
    if (keepScroll && sc != null) tr.scrollLeft = sc;
    else requestAnimationFrame(() => {
      // open on the first reward waiting to be claimed, else one tier before the current one
      const first = PASS.find((r) => r.tier <= tier && (!p.pass.claimed.includes(`free:${r.tier}`) || (p.pass.premium && !p.pass.claimed.includes(`premium:${r.tier}`))));
      const el = tr.children[first ? first.tier - 1 : Math.max(0, tier - 2)];
      if (el) { tr.style.scrollBehavior = 'auto'; tr.scrollLeft = el.offsetLeft - tr.offsetLeft - 8; tr.style.scrollBehavior = ''; }
    });
    $('premBtn')?.addEventListener('click', () => guard(async () => { await A.shop({ action: 'premium' }); rewardBurst(); render(true); }));
    for (const b of S.body.querySelectorAll('.claim')) b.onclick = () => guard(async () => {
      const row = PASS[+b.dataset.t - 1], r = row[b.dataset.k], cellEl = b.closest('.rw');
      const d = await A.shop({ action: 'passClaim', tier: +b.dataset.t, track: b.dataset.k });
      cellEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
      if (d?.got?.dupe) toastErr(`You already own ${rewardLabel(r)}: +${d.got.dupe} coins instead`);
      // fly to this screen's own coin counter (ids are unique: the lobby's #tbCoins is behind it)
      if (r.coins || d?.got?.dupe) flyCoins(cellEl, '#hpCoinChip', 8, icon('coin')); else rewardBurst();
      $('hpCoins').textContent = A.progress().coins;
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
        const dupe = !got && itemId(r) && p.owned.includes(itemId(r)) ? dupeCoins(r) : 0;
        return `<div class="node ${ok ? 'reached' : ''} ${i % 2 ? 'left' : ''}" style="left:${q.x}px;top:${q.y}px"><div class="disc">${at}</div><div class="rlabel">${icon(rewardIcon(r))}${esc(rewardLabel(r))}${dupe ? ` (owned → +${dupe})` : ''}${got ? ' ✓' : ok ? ` <button class="btn btn-sm" data-at="${at}">CLAIM</button>` : ` ${icon('lock')}`}</div></div>`; }).join('')}
      <div class="marker" style="left:${m.x}px;top:${m.y}px"></div></div></div>`;
    const wrap = S.body.querySelector('.road-wrap');
    if (keep && wrapScroll != null) wrap.scrollTop = wrapScroll;
    else requestAnimationFrame(() => { wrap.scrollTop = m.y - wrap.clientHeight / 2; });
    for (const b of S.body.querySelectorAll('[data-at]')) b.onclick = () => guard(async () => {
      const r = roadReward(+b.dataset.at);
      const d = await A.claimRoad(+b.dataset.at);
      if (d?.got?.dupe) toastErr(`You already own ${rewardLabel(r)}: +${d.got.dupe} coins instead`);
      if (r.coins || d?.got?.dupe) flyCoins(b, '#trN', 6, icon('coin')); rewardBurst();
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
    <div class="card-a" style="padding:12px"><div class="title" style="font-size:calc(var(--u)*2.4)">MATCHES BY WORLD</div><table class="stat-table">${api.statRows('arena')}</table><div class="title" style="font-size:calc(var(--u)*2.4);margin-top:8px">FREE PLAY BY ZONE</div><table class="zone-table">${api.statRows('free')}</table></div></div>`;
  const nm = $('name'); nm.classList.add('field'); $('nameSlot').appendChild(nm);
  const acc = $('accSlot');
  if (u && !u.guest) {
    acc.innerHTML = `<p class="outlined" style="color:#fff">Signed in as ${esc(u.username)} — progress syncs to every device.</p><button class="btn btn-md alt" id="logout">LOG OUT</button>`;
    $('logout').onclick = () => guard(async () => { await A.logout(); S.close(); });
  } else {
    acc.innerHTML = `<p class="outlined" style="color:#fff;font-size:max(var(--t-sm), calc(var(--u) * 1.7))">You're a guest. Create an account to keep your progress and play on your iPad too.</p>
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
    <span></span><div id="setSlot" style="display:flex;flex-direction:column;gap:10px"></div>
    ${api.racing ? `${icon('target')}<label>STEERING SENSITIVITY <b id="sensName" style="color:var(--gold);margin-left:6px"></b><input type="range" class="slider" id="setSteer" min="0.5" max="1.5" step="0.05" aria-describedby="sensName"></label>
    <span></span><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">JOYSTICK SIZE <div class="chips" id="setStick">${[['s', 'SMALL'], ['m', 'MEDIUM'], ['l', 'LARGE']].map(([k, n]) => `<button type="button" class="chipbtn" data-k="${k}">${n}</button>`).join('')}</div></div>
    <span></span><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">CAMERA <div class="chips" id="setCam">${[['chase', 'CHASE'], ['top', 'TOP-DOWN'], ['cockpit', 'COCKPIT']].map(([k, n]) => `<button type="button" class="chipbtn" data-k="${k}">${n}</button>`).join('')}</div></div>
    <span></span><label class="opt"><input type="checkbox" id="setHaptics"> Haptics (vibration on phones that support it)</label>` : `${icon('target')}<label>AIM SENSITIVITY <input type="range" class="slider" id="setSens" min="0.5" max="2" step="0.05"></label>`}
    <span></span><div style="display:flex;flex-direction:column;gap:10px">
      <label class="opt"><input type="checkbox" id="setLeft"> ${api.racing ? 'Left-handed controls (buttons on the left, steer on the right)' : 'Left-handed controls (aim on the left)'}</label>
      ${api.racing ? '' : '<label class="opt"><input type="checkbox" id="setHold"> Hold to fire (instead of fire on release)</label>'}</div>
    ${api.racing ? `<span></span><button type="button" class="btn btn-md alt" id="setTut" style="justify-self:start">HOW TO DRIVE</button>` : ''}</div>
    <p class="hint">${api.racing ? 'Steering sensitivity sets how quickly your car turns toward the stick. Camera: Chase follows behind your car, Top-down is the map view, Cockpit puts you in the driver\'s seat; the stick always points where you want to go on screen. Haptics needs a phone with vibration (iPhone browsers have none). Reduce Flashing removes flashes and screen shake. Low Graphics turns off particles and moving backgrounds for a smoother race on older phones.' : 'Reduce Flashing removes flashes, strobes and screen shake. Low Graphics turns off the moving lobby background, particles, shadows and slime animation. Hold to fire keeps shooting while your thumb is on the aim stick.'}</p>
    <p style="color:var(--gold);font-family:var(--font)">Created by Sam Eyde III</p></div>`;
  for (const id of ['setSound', 'setFlash', 'setLow']) { const l = $(id).closest('label') || $(id); $('setSlot').appendChild(l); }
  $('volMusic').value = SETTINGS.musicVol ?? 0.6; $('volSfx').value = SETTINGS.sfxVol ?? 0.9;
  $('volMusic').oninput = (e) => { setSetting('musicVol', +e.target.value); setMusicVolume(); };
  $('volSfx').oninput = (e) => { setSetting('sfxVol', +e.target.value); };
  $('volSfx').onchange = () => sfx('click');
  $('setLeft').checked = !!SETTINGS.leftHanded;
  $('setLeft').onchange = (e) => { setSetting('leftHanded', e.target.checked); dispatchEvent(new Event('resize')); };
  if (api.racing) {
    // steering sensitivity: live label, applied from the next race (the server is told at join)
    const sl = $('setSteer'), nm = $('sensName');
    const show = () => { nm.textContent = sensName(+sl.value); };
    sl.value = SETTINGS.raceSens ?? 1; show();
    sl.oninput = () => { setSetting('raceSens', +sl.value); show(); };
    const chips = () => { for (const b of document.querySelectorAll('#setStick .chipbtn')) b.classList.toggle('on', b.dataset.k === (SETTINGS.raceStick || 'm')); };
    for (const b of document.querySelectorAll('#setStick .chipbtn')) b.onclick = () => { setSetting('raceStick', b.dataset.k); chips(); sfx('click'); };
    chips();
    // camera view (race/camera.js) and haptics: both apply from the next frame / race
    const cams = () => { for (const b of document.querySelectorAll('#setCam .chipbtn')) b.classList.toggle('on', b.dataset.k === (SETTINGS.raceView || 'top')); };
    for (const b of document.querySelectorAll('#setCam .chipbtn')) b.onclick = () => { setSetting('raceView', b.dataset.k); cams(); sfx('click'); };
    cams();
    $('setHaptics').checked = SETTINGS.haptics !== false;
    $('setHaptics').onchange = (e) => setSetting('haptics', e.target.checked);
    $('setTut').onclick = () => { S.close(); api.startRace?.({ tutorialOnly: true }); };
  }
  if (!api.racing) {
    $('setSens').value = SETTINGS.aimSens ?? 1; $('setHold').checked = !!SETTINGS.holdFire;
    $('setSens').oninput = (e) => setSetting('aimSens', +e.target.value);
    $('setHold').onchange = (e) => setSetting('holdFire', e.target.checked);
  }
}

// a friend room plays the mode its host picks here (the host also starts it and sets bots in the room)
const ROOM_MODES = [['', 'QUICK HUNT'], ['squad', 'SQUAD HUNT'], ['bighunt', 'BIG HUNT'], ['showdown', 'SHOWDOWN']];
export function openFriends(api) {
  const code = $('room').value || '';
  let mode = api.roomMode?.() || '';
  if (!ROOM_MODES.some(([k]) => k === mode)) mode = '';
  const P = popup(`<div class="title" style="font-size:calc(var(--u)*3.4)">PLAY WITH FRIENDS</div>
    <p class="outlined" style="color:#fff;font-size:max(var(--t-sm), calc(var(--u) * 1.7))">Everyone types the same room code and presses play. The first one in is the host: they pick the mode and press START.</p>
    <div id="roomSlot" style="display:flex;gap:8px;align-items:center"></div>
    <div class="chips" id="roomModes" style="margin:8px 0;justify-content:center"></div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn btn-md alt" id="newCode">NEW CODE</button><button class="btn btn-md alt" id="shareCode">${icon('share')} SHARE</button><button class="btn btn-md" id="roomPlay" data-sfx="play">PLAY</button></div>
    <p class="hint">Friends list — coming soon.</p><button class="btn btn-sm alt" data-close>CLOSE</button>`, { onClose: () => stash(['room']) });
  const room = $('room'); room.classList.add('field'); room.value = code; $('roomSlot').appendChild(room);
  const modes = () => { $('roomModes').innerHTML = ROOM_MODES.map(([k, l]) => `<button class="chipbtn ${k === mode ? 'on' : ''}" data-m="${k}">${l}</button>`).join(''); for (const b of $('roomModes').children) b.onclick = () => { mode = b.dataset.m; modes(); }; };
  modes();
  $('newCode').onclick = () => { room.value = Math.random().toString(36).slice(2, 7).toUpperCase(); };
  $('shareCode').onclick = async () => { const t = `Join my Oblivion GP room: ${room.value} — ${location.origin}`; try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toastErr('Copied!'); } } catch {} };
  $('roomPlay').onclick = () => { if (!room.value.trim()) { room.value = Math.random().toString(36).slice(2, 7).toUpperCase(); } P.close(); api.startQuick({ fromFriends: true, mode }); };
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
    <p class="outlined" style="color:#fff;font-size:max(var(--t-sm), calc(var(--u) * 1.8))">${icon('coin')} Coins and ${icon('gem')} gems are <b>test currency</b> — there are no real payments.</p>
    <p class="outlined" style="color:#fff;font-size:max(var(--t-sm), calc(var(--u) * 1.6))">Earn them from daily missions, the GP Pass and the Trophy Road.</p><button class="btn btn-md" data-close>GOT IT</button>`);
}

// ======================================================================= ARMORY
// Pick the ONE secondary weapon you carry next to your brawler's signature attack. Each weapon
// shows its stats, mastery (skins, badge, kill effect) and the perk picks at mastery 2, 5 and 8.
const RAR_COL = { common: '#cfc3ff', rare: '#5ff4ff', epic: '#ff6bd6' };
export function openArmory(api, onDone) {
  const S = screen('ARMORY', `<div class="cur">LV <b id="arLv">1</b></div>`, onDone);
  let sel = A.progress().loadout?.w2 || 'stormline';
  // what was new before this visit gets a NEW tag; opening the Armory counts as seeing it all
  const keys0 = armoryKeys(A.progress());
  let seen0 = keys0;
  try { seen0 = seenList(localStorage.getItem('hunt-seen-armory'), keys0).list; localStorage.setItem('hunt-seen-armory', JSON.stringify(keys0)); } catch {}
  const isNew = (k) => keys0.includes(k) && !seen0.includes(k);
  S.body.innerHTML = `<div class="locker armory"><div class="card-a preview" id="arInfo"></div><div class="items"><div class="chips" id="arHint"></div><div class="pedestals" id="arItems"></div></div></div>`;
  const bar = (label, v, txt) => `<div class="statrow"><span>${label}</span><div class="bar shine"><i style="width:${Math.round(Math.max(0.04, v) * 100)}%"></i></div><b>${txt}</b></div>`;
  const render = () => {
    const p = A.progress(), lv = levelInfo(p.xp).level, eq = p.loadout?.w2 || null;
    $('arLv').textContent = lv;
    $('arHint').innerHTML = `<span class="hint" style="margin:0">Carry ONE secondary. Swap in a match with the ⇄ button (R / Tab on a keyboard). Free Play crates can drop more.</span>`;
    $('arItems').innerHTML = WEAPON_IDS.map((id) => {
      const w = WEAPONS[id], ok = weaponUnlocked(p, id), m = masteryInfo(p.mastery?.[id] || 0).level;
      const fresh = isNew('w:' + id) || Object.keys(perksFor(id)).some((tier) => isNew(`p:${id}:${tier}`));
      return `<div class="card-a ped tap ${id === sel ? 'on' : ''}" tabindex="0" role="button" aria-label="${esc(w.name)}" data-w="${id}">${fresh ? '<span class="newtag">NEW</span>' : ''}<canvas data-wpn="${id}"></canvas><span style="color:${RAR_COL[w.rarity]}">${esc(w.name)}</span>
        <span class="tag" style="color:#fff">${ok ? (eq === id ? '★ EQUIPPED' : 'MASTERY ' + m) : icon('lock') + ' LEVEL ' + w.unlock}</span></div>`;
    }).join('');
    for (const c of $('arItems').children) c.onclick = () => { sel = c.dataset.w; sfx('click'); render(); };
    // detail panel
    const w = WEAPONS[sel], st = weaponStats(sel), ok = weaponUnlocked(p, sel), mi = masteryInfo(p.mastery?.[sel] || 0), mine = p.perks?.[sel] || [];
    const skin = [...MASTERY_SKINS].reverse().find((s) => mi.level >= s.lvl);
    $('arInfo').innerHTML = `<canvas id="arPrev" style="flex:none;width:100%;height:calc(var(--u) * 8)"></canvas>
      <div class="title" style="font-size:calc(var(--u)*2.6)">${esc(w.name)}</div>
      <div style="font-family:var(--font);color:${RAR_COL[w.rarity]};font-size:max(var(--t-xs), calc(var(--u) * 1.5))">${WEAPON_CLASSES[w.cls].toUpperCase()} · ${w.rarity.toUpperCase()}</div>
      <p class="hint" style="margin:4px 0">${esc(w.desc)}</p>
      <div class="stats">${bar('DAMAGE', st.bars.damage, Math.round(st.damage))}${bar('FIRE RATE', st.bars.fireRate, st.fireRate.toFixed(1) + '/s')}${bar('RANGE', st.bars.range, Math.round(st.range))}${bar('RELOAD', st.bars.reload, st.reload.toFixed(2) + 's')}${bar('SPREAD', st.bars.spread, Math.round(st.spread * 57.3) + '°')}</div>
      <div class="statrow" style="margin-top:6px"><span>MASTERY ${mi.level}/10</span><div class="bar shine"><i style="width:${mi.need ? Math.round((mi.into / mi.need) * 100) : 100}%;background:${skin ? skin.col : ''}"></i></div><b>${skin ? skin.name : '—'}</b></div>
      <div class="perks">${Object.entries(perksFor(sel)).map(([tier, opts]) => `<div class="perkrow"><span>M${tier}</span>${opts.map((o) => `<button class="chipbtn ${mine.includes(o.id) ? 'on' : ''}" data-tier="${tier}" data-perk="${o.id}" ${mi.level < +tier ? 'disabled' : ''} title="${esc(o.desc)}">${esc(o.name)}</button>`).join('')}</div>`).join('')}</div>
      <p class="hint" style="margin:2px 0">Bronze at mastery 3, Silver 6, Gold 9, animated Hunter's Bane at 10. Mastery 7 adds a kill effect.</p>
      <div class="ar-actions">${ok ? (p.loadout?.w2 === sel ? '<button class="btn btn-md alt" id="arUn">UNEQUIP</button>' : '<button class="btn btn-md" id="arEq">EQUIP</button>') + '<button class="btn btn-md mint" id="arTry" data-sfx="play">TEST RANGE</button>' : `<button class="btn btn-md alt" disabled>${icon('lock')} REACH LEVEL ${w.unlock}</button>`}</div>`;
    $('arEq')?.addEventListener('click', () => guard(async () => { await A.shop({ action: 'loadout', w2: sel }); sfx('reward'); render(); }));
    $('arTry')?.addEventListener('click', () => { S.close(); api.startRange(sel); });
    $('arUn')?.addEventListener('click', () => guard(async () => { await A.shop({ action: 'loadout', w2: null }); render(); }));
    for (const b of $('arInfo').querySelectorAll('[data-perk]')) b.onclick = () => guard(async () => { await A.shop({ action: 'perk', weapon: sel, tier: +b.dataset.tier, id: b.dataset.perk }); sfx('click'); render(); });
  };
  render();
  S.loop((t) => {
    for (const cv of S.el.querySelectorAll('canvas[data-wpn]')) { const c = fitCanvas(cv); R.drawWeaponDrop(c.g, c.w / 2, c.h / 2, cv.dataset.wpn, WEAPONS[cv.dataset.wpn].rarity !== 'common' ? 1 : 0, t); }
    const pv = $('arPrev'); if (!pv) return;
    const c = fitCanvas(pv), mi = masteryInfo(A.progress().mastery?.[sel] || 0), skin = [...MASTERY_SKINS].reverse().find((s) => mi.level >= s.lvl);
    c.g.save(); c.g.translate(c.w / 2, c.h / 2); c.g.scale(1.8, 1.8); R.drawWeaponDrop(c.g, 0, 0, sel, 1, t); c.g.restore();
    // a test shot across the preview, tinted by your mastery skin
    const k = (t * 0.8) % 1, x = c.w * 0.1 + k * c.w * 0.8;
    R.drawShotTrail(c.g, sel, 32 + WEAPON_IDS.indexOf(sel), x, c.h * 0.85, 0, skin ? R.masteryTint(skin.id, t) : null);
    R.drawShot(c.g, sel, 32 + WEAPON_IDS.indexOf(sel), x, c.h * 0.85, 0, '#fff', t);
  });
}

// ======================================================================= BRAWLER POWER
// Upgrade with coins earned by playing (test currency only: combat can never be bought with real
// money). +4% HP and damage per level; Gadget at 7, Star Power at 9 (pick one of two each).
export function openPower(api, onDone, startWho = null) {
  let who = startWho || api.getBrawler();
  const P = popup(`<div class="title" style="font-size:calc(var(--u)*3.2)">BRAWLER POWER</div><div class="chips" id="pwWho"></div><div id="pwBody"></div><button class="btn btn-md alt" data-close>CLOSE</button>`, { onClose: onDone });
  const render = () => {
    const p = A.progress(), L = clampPower(p.power?.[who] || 1), cost = POWER_COST[L];
    P.card.querySelector('#pwWho').innerHTML = BRAWLER_IDS.map((b) => `<button class="chipbtn ${b === who ? 'on' : ''}" data-b="${b}">${BRAWLERS[b].name} ${clampPower(p.power?.[b] || 1)}</button>`).join('');
    for (const c of P.card.querySelectorAll('[data-b]')) c.onclick = () => { who = c.dataset.b; render(); };
    const B = BRAWLERS[who], pick = (list, mine, at, kind) => `<div class="pwpick"><div class="pwhead">${kind} <small>(Power ${at})</small></div>${list.map((g) => `<button class="chipbtn ${mine === g.id || (!mine && g === list[0] && L >= at) ? 'on' : ''}" data-k="${kind === 'GADGET' ? 'gadget' : 'star'}" data-id="${g.id}" ${L < at ? 'disabled' : ''}><b>${esc(g.name)}</b><br><small>${esc(g.desc)}</small></button>`).join('')}</div>`;
    P.card.querySelector('#pwBody').innerHTML = `
      <div class="pwlv"><span class="pwnum">${L}</span><div style="flex:1"><div class="bar shine"><i style="width:${Math.round((L / MAX_POWER) * 100)}%"></i></div>
        <div class="hint" style="margin:2px 0">HP ${Math.round(B.hp * powerMult(L))} · damage +${Math.round((powerMult(L) - 1) * 100)}% · ${L >= MAX_POWER ? 'max power' : `next: +4% for ${cost} coins`}</div></div>
        ${L < MAX_POWER ? `<button class="btn btn-md" id="pwUp" ${p.coins < cost ? 'disabled' : ''}>${icon('coin')} ${cost}</button>` : ''}</div>
      ${pick(GADGETS[who], p.gadget?.[who], GADGET_AT, 'GADGET')}${pick(STARS[who], p.star?.[who], STAR_AT, 'STAR POWER')}
      <p class="hint">You have ${p.coins} coins (test currency, earned by playing). Matches pair you with hunters of a similar power.</p>`;
    P.card.querySelector('#pwUp')?.addEventListener('click', () => guard(async () => { await A.shop({ action: 'upgrade', brawler: who }); rewardBurst(); sfx('reward'); render(); }));
    for (const b of P.card.querySelectorAll('[data-k]')) b.onclick = () => guard(async () => { await A.shop({ action: b.dataset.k, brawler: who, id: b.dataset.id }); sfx('click'); render(); });
  };
  render();
}

// ======================================================================= LOBBY TAB PAGES
// PROFILE tab: your level, lifetime kills and wins, stats per mode, your hunters, Free Play by world
const MODE_NAMES = { showdown: 'SHOWDOWN', bounty: 'BOUNTY RUSH', hunted: 'HUNTED', crystals: 'CRYSTAL GRAB', squad: 'SQUAD HUNT', bighunt: 'BIG HUNT' };
const tile = (n, label) => `<div class="stile"><b>${n}</b><span>${label}</span></div>`;
const ribbon = (txt, extra = '') => `<div class="ribbonhead" ${extra}>${txt}</div>`;
export function renderProfilePage(el, api, onDone) {
  if (api.racing) return renderRaceProfile(el, api, onDone);
  const p = A.progress(), lv = levelInfo(p.xp), modes = p.modes || {};
  const top3 = Object.values(modes).reduce((t, m) => t + (m.top3 || 0), 0);
  const name = api.prefs.name || 'Hunter';
  el.innerHTML = `
    <div class="phead card-a"><div class="ph-name"><div class="pname title">${esc(name)}</div><div class="ph-lv">Level ${lv.level}</div></div>
      <svg class="bigshield" viewBox="0 0 64 72"><path d="M32 3 L59 12 V36 C59 53 46 64 32 69 C18 64 5 53 5 36 V12 Z" fill="#ffc83d" stroke="#1b1033" stroke-width="4" stroke-linejoin="round"/><path d="M32 11 L51 17 V36 C51 48 42 56 32 60 C22 56 13 48 13 36 V17 Z" fill="#8e2a3a"/><path d="M32 11 V60 C22 56 13 48 13 36 V17 Z" fill="#b2423f"/><text x="32" y="45" text-anchor="middle" font-family="Lilita One" font-size="26" fill="#fff" stroke="#1b1033" stroke-width="4" paint-order="stroke">${lv.level}</text></svg>
      <div class="ph-tot"><div><b>${p.kills | 0}</b><span>Kills</span></div><div><b>${p.wins | 0}</b><span>Wins</span></div></div></div>
    ${ribbon('OVERALL')}<div class="stiles">${tile(p.wins | 0, 'Wins')}${tile(top3, 'Top 3s')}${tile(p.games | 0, 'Matches')}${tile(totalTrophies(p), 'Trophies')}</div>
    ${Object.entries(MODE_NAMES).filter(([k]) => modes[k]?.games).map(([k, n]) => `${ribbon(n)}<div class="stiles">${tile(modes[k].wins, 'Wins')}${tile(modes[k].top3, 'Top 3s')}${tile(modes[k].games, 'Matches')}${tile(modes[k].kills, 'Kills')}</div>`).join('') || `<p class="hint">Play a match to fill in your stats for each mode.</p>`}
    ${ribbon('HUNTERS')}<div class="stiles six">${BRAWLER_IDS.map((b) => `<div class="stile tap" data-pw="${b}"><b>${p.trophies[b] | 0}</b><span>${BRAWLERS[b].name} · P${clampPower(p.power?.[b] || 1)}</span></div>`).join('')}</div>
    ${ribbon('MATCHES BY WORLD')}<div class="card-a" style="padding:8px"><table class="stat-table">${api.statRows('arena')}</table></div>
    ${ribbon('FREE PLAY BY ZONE')}<div class="card-a" style="padding:8px"><table class="zone-table">${api.statRows('free')}</table></div>
    <div style="display:flex;justify-content:center;margin:10px 0 4px"><button class="btn btn-md alt" id="pgAccount">${icon('user')} NAME &amp; ACCOUNT</button></div>`;
  el.querySelector('#pgAccount').onclick = () => openProfile(api, onDone);
  for (const t of el.querySelectorAll('[data-pw]')) t.onclick = () => openPower(api, onDone, t.dataset.pw);
}
// LOCKER tab: what you're wearing, by category; tap a category to change it
export function renderLockerPage(el, api, onDone) {
  const p = A.progress(), eq = p.equipped || {};
  const emotes = EMOTES.filter((e) => e.level <= 1 || p.owned.includes(e.id));
  const mastered = WEAPON_IDS.filter((w) => masteryInfo(p.mastery?.[w] || 0).level >= 3);
  el.innerHTML = `<div class="lockgrid">
    <div class="lsec" data-open="skins">${ribbon('SKINS')}<div class="ltiles">${BRAWLER_IDS.map((b) => `<div class="ltile tap" data-who="${b}"><canvas data-skin="${b}"></canvas></div>`).join('')}</div></div>
    <div class="lsec" data-open="fx">${ribbon('KILL EFFECT')}<div class="ltiles one"><div class="ltile big tap">${icon('star')}<span>${esc(eq.fx ? KILL_FX[eq.fx]?.name || eq.fx : 'None')}</span></div></div></div>
    <div class="lsec" data-open="titles">${ribbon('TITLE')}<div class="ltiles one"><div class="ltile big tap">${icon('pass')}<span>${esc(eq.title ? TITLES[eq.title] || eq.title : 'None')}</span></div></div></div>
    <div class="lsec">${ribbon('EMOTES')}<div class="ltiles">${emotes.map((e) => `<div class="ltile emote" style="--ec:${e.col}"><span>${esc(e.text)}</span></div>`).join('')}</div></div>
    <div class="lsec" data-armory="1">${ribbon('WEAPON SKINS')}${mastered.length ? `<div class="ltiles">${mastered.map((w) => `<div class="ltile tap"><canvas data-wpn="${w}"></canvas><span>${esc(WEAPONS[w].name)}</span></div>`).join('')}</div>` : '<p class="hint">Reach mastery 3 with a weapon to unlock its Bronze skin.</p>'}</div>
    <div class="lsec" data-open="shop">${ribbon('SHOP')}<div class="ltiles one"><div class="ltile big tap">${icon('coin')}<span>${p.coins} coins · get skins</span></div></div></div>
  </div>`;
  for (const cv of el.querySelectorAll('canvas[data-skin]')) { const c = fitCanvas(cv); R.drawBrawler(c.g, cv.dataset.skin, c.w / 2, c.h * 0.62, 0.3, 0, { scale: Math.min(c.w, c.h) / 70, skin: eq['skin:' + cv.dataset.skin] || null }); }
  for (const cv of el.querySelectorAll('canvas[data-wpn]')) { const c = fitCanvas(cv); R.drawWeaponDrop(c.g, c.w / 2, c.h / 2, cv.dataset.wpn, 1, 0); }
  for (const sec of el.querySelectorAll('.lsec[data-open]')) sec.onclick = (e) => { const t = e.target.closest('[data-who]'); openLocker(api, onDone, sec.dataset.open === 'shop' ? 'skins' : sec.dataset.open, t ? t.dataset.who : null); };
  el.querySelector('.lsec[data-armory]').onclick = () => openArmory(api, onDone);
}

// ======================================================================= RACING (Oblivion GP)
const fmtT = (s) => (s == null ? '--' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);
const TRACK_BLURB = { any: 'A different track every race', desert: 'Canyon jumps and a sandy shortcut', frozen: 'Wide sweeps across a frozen lake', ashlands: 'A wide road through the lava fields', neon: 'Tight corners under neon' };
const ARENA_BLURB = { any: 'A different arena every match', desert: 'Open sand bowl', frozen: 'Ice rink, low grip', ashlands: 'Lava pits in the middle', neon: 'Pillars and arc towers' };

// DRIVER SELECT: every driver with their car, trophies; a card opens the driver's detail
export function openDriverSelect(api, onDone) {
  const S = screen('DRIVERS', '', onDone);
  const grid = document.createElement('div'); grid.className = 'grid-cards drivers'; S.body.appendChild(grid);
  let looks = {};
  const draw = () => {
    const p = A.progress(), had = grid.contains(document.activeElement) ? document.activeElement.dataset.b : null;
    looks = Object.fromEntries(DRIVER_IDS.map((d) => [d, equippedLook(p, d)]));
    grid.innerHTML = DRIVER_IDS.map((d) => { const D = DRIVERS[d], nm = carName(d); return `<div class="card-b bcard dcard tap ${d === api.getBrawler() ? 'sel' : ''}" tabindex="0" role="button" aria-label="${nm}, ${esc(D.role)}" data-b="${d}" style="--card-col:${looks[d].neon}"><canvas data-b="${d}"></canvas><div class="title bc-name">${nm}</div><div class="dc-car">${esc(D.role)}</div><div class="dc-stats">${driverStats(d).map((r) => `<span>${r.label}</span><i><b style="width:${Math.round(r.f * 100)}%"></b></i>`).join('')}</div><div class="dc-wpn">${esc(weaponOf(d).name)}</div><div class="bc-tro">🏆 ${p.trophies[d] | 0}</div></div>`; }).join('');
    for (const c of grid.querySelectorAll('.bcard')) c.onclick = () => openDriverDetail(api, c.dataset.b, () => draw());
    if (had) grid.querySelector(`[data-b="${had}"]`)?.focus({ preventScroll: true });
  };
  draw();
  // every car on its spinning neon platform, wearing what you equipped for it in the store
  S.loop((t) => { for (const cv of grid.querySelectorAll('canvas[data-b]')) { const { g, w, h } = fitCanvas(cv); drawPlatform(g, w, h, cv.dataset.b, looks[cv.dataset.b], (SETTINGS.reduceFlash ? t * 0.5 : t) + cv.dataset.b.length, { low: SETTINGS.lowGfx }); } });
}

// a tiny looping picture of the built-in weapon going off
function weaponDemo(g, w, h, id, t) {
  g.fillStyle = '#3b3550'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.setLineDash([10, 10]); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); g.setLineDash([]);
  const k = (t % 1.6) / 1.6, s = h / 70, x = w * 0.22, y = h / 2;
  g.lineCap = 'round';
  if (id === 'volt' && k > 0.2) { g.strokeStyle = '#7fe8ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 20 * s, y); for (let i = 1; i <= 6; i++) g.lineTo(x + 20 * s + (w * 0.5 * i) / 6, y + (i % 2 ? -8 : 8) * s * (1 - k)); g.stroke(); }
  if (id === 'brick' && k > 0.1) { g.strokeStyle = `rgba(255,170,80,${1 - k})`; g.lineWidth = 4; g.beginPath(); g.arc(x, y, k * 60 * s, 0, 7); g.stroke(); }
  if (id === 'wisp' && k > 0.15 && k < 0.6) { g.strokeStyle = '#5ef2c6'; g.lineWidth = 5 * (0.6 - k) * 4; g.beginPath(); g.moveTo(x + 20 * s, y); g.lineTo(w, y); g.stroke(); }
  if (id === 'dune') for (let i = 0; i < 3; i++) { const mx = x - 22 * s - i * 26 * s; if (k > i * 0.25) { g.fillStyle = '#e8b04a'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(mx + w * 0.4, y + 14 * s, 6 * s, 0, 7); g.fill(); g.stroke(); } }
  if (id === 'rook') { g.fillStyle = '#7fa34a'; g.strokeStyle = INK; g.lineWidth = 2; g.fillRect(w * 0.55, y + 10 * s, 14 * s, 14 * s); g.strokeRect(w * 0.55, y + 10 * s, 14 * s, 14 * s); if (k % 0.4 < 0.2) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(w * 0.55 + 7 * s + (k % 0.4) * 300 * s, y + 17 * s - (k % 0.4) * 120 * s, 3 * s, 0, 7); g.fill(); } }
  if (id === 'flicker' && k > 0.3) { g.strokeStyle = 'rgba(255,95,162,.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.45 * Math.min(1, (k - 0.3) * 4), y); g.stroke(); }
  const cx = id === 'flicker' && k > 0.35 ? x + w * 0.45 : x;
  g.save(); g.translate(cx, y); g.scale(s * 0.9, s * 0.9); drawCar(g, id); g.restore();
}

function openDriverDetail(api, id, onClose) {
  const D = DRIVERS[id], p = A.progress(), W = weaponOf(id), look = equippedLook(p, id);
  const el = document.createElement('div'); el.className = 'detail driver'; el.hidden = true;
  el.innerHTML = `<div class="card-b" style="--card-col:${look.neon}">
    <div><canvas class="portrait"></canvas><div class="title" style="font-size:calc(var(--u)*4);text-align:center">${carName(id)}</div>
      <div style="text-align:center"><span class="role" style="--role-col:${look.neon}">${esc(D.role.toUpperCase())}</span> <span class="np-tro">🏆 ${p.trophies[id] | 0}</span></div></div>
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="dd-car">${esc(D.role.toUpperCase())} CAR</div>
      <div class="stats">${driverStats(id).map((r) => `<span>${r.label}</span><div class="bar shine"><i style="width:${Math.round(r.f * 100)}%"></i></div><span class="num">${r.v}</span>`).join('')}</div>
      <div class="abil"><canvas data-demo="weapon"></canvas><div><h4>WEAPON · ${esc(W.name)}</h4><p>${esc(W.desc)} Recharges in ${W.cd} s.</p></div></div>
      <div class="detail-actions"><button class="btn btn-md alt" data-x>CLOSE</button><button class="btn btn-md" data-x data-sel>SELECT</button></div>
    </div></div>`;
  document.body.appendChild(el);
  openScreen(el);
  const close = async () => { await closeScreen(el); el.remove(); onClose?.(); };
  for (const b of el.querySelectorAll('[data-x]')) b.onclick = async () => { if (b.dataset.sel !== undefined) api.setBrawler(id); await close(); };
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  const t0 = performance.now();
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = SETTINGS.reduceFlash ? 0 : (now - t0) / 1000;
    const pc = fitCanvas(el.querySelector('.portrait'));
    drawPlatform(pc.g, pc.w, pc.h, id, look, t, { low: SETTINGS.lowGfx });
    const c = fitCanvas(el.querySelector('canvas[data-demo]'));
    weaponDemo(c.g, c.w, c.h, id, (now - t0) / 1000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// TRACK PICKER: the 4 tracks (or their battle arenas) + Random, each with a preview of the layout
export function openTrackPicker({ track, arena, best = {}, trial = false }, onPick) {
  const S = screen(arena ? 'CHOOSE AN ARENA' : 'CHOOSE A TRACK');
  S.body.innerHTML = `<div class="track-grid">${TRACK_CHOICES.map((k) => `<button class="card-b tcard tap ${k === track ? 'sel' : ''}" data-k="${k}" aria-label="${esc(trackLabel(k, arena))}"><canvas data-k="${k}" aria-hidden="true"></canvas><span class="title tc-name">${esc(trackLabel(k, arena))}</span><span class="tc-sub">${esc((arena ? ARENA_BLURB : TRACK_BLURB)[k] || '')}${trial && best[k] ? ` · best ${fmtT(best[k])}` : ''}</span></button>`).join('')}</div>`;
  for (const c of S.body.querySelectorAll('.tcard')) c.onclick = () => { sfx('click'); onPick(c.dataset.k); S.close(); };
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const cv of S.body.querySelectorAll('canvas[data-k]')) paintPreview(cv, cv.dataset.k, arena); }));
  const re = () => { if (!S.el.isConnected) return removeEventListener('resize', re); for (const cv of S.body.querySelectorAll('canvas[data-k]')) paintPreview(cv, cv.dataset.k, arena); };
  addEventListener('resize', re);
}

// PLAY WITH FRIENDS (races): everyone types the same code; the first one in is the host, whose
// mode / track / bots the room plays, and who presses START. Late friends wait for the next race.
const ROOM_RACE_MODES = ['grand', 'elim', 'battle']; // (Time Trial is solo)
const SHORT_TRACK = { desert: 'DESERT', frozen: 'FROZEN LAKE', ashlands: 'ASHLANDS', neon: 'NEON CITY' };
export function openRaceFriends(api) {
  const code = $('room').value || '';
  let mode = ROOM_RACE_MODES.includes(api.raceMode?.()) ? api.raceMode() : 'grand';
  let track = TRACK_CHOICES.includes(api.raceTrack?.()) ? api.raceTrack() : 'any';
  const P = popup(`<div class="title" style="font-size:calc(var(--u)*3.4)">RACE WITH FRIENDS</div>
    <p class="outlined rf-help">Same code, same room. The first one in is the host: they pick the race and press START.</p>
    <div id="roomSlot" class="rf-row"><button class="btn btn-md alt" id="newCode">NEW CODE</button></div>
    <div class="chips rf-chips" id="roomModes"></div>
    <div class="chips rf-chips" id="roomTracks"></div>
    <div class="rf-row"><button type="button" class="fillbots" id="rfBots" role="switch"><span class="cb"></span> FILL WITH BOTS</button><button class="btn btn-md alt" id="shareCode">${icon('share')} COPY INVITE</button><button class="btn btn-md" id="roomPlay" data-sfx="play">GO</button></div>
    <button class="btn btn-sm alt" data-close>CLOSE</button>`, { onClose: () => stash(['room']) });
  P.el.classList.add('racefriends');
  const room = $('room'); room.classList.add('field'); room.value = code; $('roomSlot').prepend(room);
  const chips = (id, list, cur, label, set) => { $(id).innerHTML = list.map((k) => `<button class="chipbtn ${k === cur ? 'on' : ''}" data-k="${k}">${esc(label(k))}</button>`).join(''); for (const b of $(id).children) b.onclick = () => { set(b.dataset.k); draw(); }; };
  const bots = () => !$('bots') || $('bots').checked;
  const draw = () => {
    chips('roomModes', ROOM_RACE_MODES, mode, (k) => RACE_MODES[k].name.toUpperCase(), (k) => { mode = k; });
    chips('roomTracks', TRACK_CHOICES, track, (k) => (k === 'any' ? 'RANDOM' : SHORT_TRACK[k]), (k) => { track = k; });
    $('rfBots').setAttribute('aria-checked', String(bots())); $('rfBots').querySelector('.cb').classList.toggle('on', bots());
  };
  draw();
  $('rfBots').onclick = () => { const bx = $('bots'); if (bx) { bx.checked = !bx.checked; bx.dispatchEvent(new Event('change')); } sfx('click', 0.6); draw(); api.refresh?.(); };
  const fresh = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  const clean = () => room.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  $('newCode').onclick = () => { room.value = fresh(); };
  $('shareCode').onclick = async () => {
    if (!clean()) room.value = fresh();
    const link = `${location.origin}/?room=${clean()}`, t = inviteText(link);
    try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toastErr('Invite copied'); } } catch {}
  };
  $('roomPlay').onclick = () => { if (!clean()) room.value = fresh(); room.value = clean(); const r = room.value; api.saveName?.(); P.close(); api.startRace({ room: r, mode, track }); };
}

// PROFILE (racing): totals, race stats, best laps / Time Trial bests per track, drivers
const RACE_MODE_TAGS = { race_grand: 'GRAND RACE', race_elim: 'ELIMINATION RACE', race_battle: 'BATTLE ARENA' };
function renderRaceProfile(el, api, onDone) {
  const p = A.progress(), lv = levelInfo(p.xp), modes = p.modes || {}, R = p.race || {};
  const name = api.prefs.name || 'Racer';
  const rows = TRACK_IDS.map((k) => `<tr><td>${esc(trackLabel(k))}</td><td>${fmtT(R.bestLap?.[k])}</td><td>${fmtT(R.best?.[k])}</td></tr>`).join('');
  el.innerHTML = `
    <div class="phead card-a"><div class="ph-name"><div class="pname title">${esc(name)}</div><div class="ph-lv">Level ${lv.level}</div></div>
      <svg class="bigshield" viewBox="0 0 64 72"><path d="M32 3 L59 12 V36 C59 53 46 64 32 69 C18 64 5 53 5 36 V12 Z" fill="#ffc83d" stroke="#1b1033" stroke-width="4" stroke-linejoin="round"/><path d="M32 11 L51 17 V36 C51 48 42 56 32 60 C22 56 13 48 13 36 V17 Z" fill="#8e2a3a"/><path d="M32 11 V60 C22 56 13 48 13 36 V17 Z" fill="#b2423f"/><text x="32" y="45" text-anchor="middle" font-family="Lilita One" font-size="26" fill="#fff" stroke="#1b1033" stroke-width="4" paint-order="stroke">${lv.level}</text></svg>
      <div class="ph-tot"><div><b>${R.wins | 0}</b><span>Race wins</span></div><div><b>${totalTrophies(p)}</b><span>Trophies</span></div></div></div>
    ${ribbon('RACING')}<div class="stiles">${tile(R.races | 0, 'Races')}${tile(R.wins | 0, 'Wins')}${tile(R.trials | 0, 'Time Trials')}${tile(Object.keys(RACE_MODE_TAGS).reduce((t, k) => t + (modes[k]?.kills | 0), 0), 'Takedowns')}</div>
    ${ribbon('BEST TIMES')}<div class="card-a" style="padding:8px"><table class="stat-table race-times"><tr><th>TRACK</th><th>BEST LAP</th><th>TIME TRIAL</th></tr>${rows}</table></div>
    ${Object.entries(RACE_MODE_TAGS).filter(([k]) => modes[k]?.games).map(([k, n]) => `${ribbon(n)}<div class="stiles">${tile(modes[k].wins | 0, 'Wins')}${tile(modes[k].top3 | 0, 'Top 3s')}${tile(modes[k].games | 0, 'Races')}${tile(modes[k].kills | 0, 'Takedowns')}</div>`).join('') || `<p class="hint">Race to fill in your stats for each mode.</p>`}
    ${ribbon('DRIVERS')}<div class="stiles six">${DRIVER_IDS.map((d) => `<div class="stile"><b>${p.trophies[d] | 0}</b><span>${carName(d)} · ${esc(DRIVERS[d].role)}</span></div>`).join('')}</div>
    <div style="display:flex;justify-content:center;margin:10px 0 4px"><button class="btn btn-md alt" id="pgAccount">${icon('user')} NAME &amp; ACCOUNT</button></div>`;
  el.querySelector('#pgAccount').onclick = () => openProfile(api, onDone);
}
