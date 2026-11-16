// Main lobby: living background, centre-stage brawler on a pedestal, profile card + icon rail,
// currencies + daily missions, mode card, PLAY. Screens live in screens.js; match flow in flow.js.
import { BRAWLERS, BRAWLER_IDS, WORLDS, worldId } from '../shared.js';
import { drawBrawler } from '../render.js';
import { SETTINGS } from '../settings.js';
import { createAdapt, adaptFrame } from '../adapt.js';
import { sfx, unlockAudio } from '../audio.js';
import { icon, ICONS } from './icons.js';
import { startMusic, stopMusic } from './music.js';
import { makeFocusable } from './fx.js';
import { totalTrophies, levelInfo, missionState, msToReset, roadReward, ROAD_STEP, armoryKeys, seenList, hasUnseen } from '../progression.js';
import { PASS, passTier } from '../catalog.js';
import * as A from '../account.js';

// storage can throw (Safari with cookies blocked, sandboxed frames): never let that kill the lobby
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
import * as SC from './screens.js';
import { initRotateHint } from './rotatehint.js';

export const ROLE_COL = { Balanced: 'var(--role-balanced)', Tank: 'var(--role-tank)', Sniper: 'var(--role-sniper)', Controller: 'var(--role-controller)', Trapper: 'var(--role-trapper)', Assassin: 'var(--role-assassin)' };
export const MODES_UI = {
  quick: { name: 'QUICK HUNT', desc: 'A random event: Showdown, Bounty Rush, Hunted or Crystal Grab.', players: '10 players', mode: '', ribbon: null },
  squad: { name: 'SQUAD HUNT', desc: '3v3 — kills fill your team pot. Biggest pot wins.', players: '3v3', mode: 'squad', ribbon: 'NEW' },
  bighunt: { name: 'BIG HUNT', desc: '20 hunters on a huge arena. Last one standing wins.', players: '20 players', mode: 'bighunt', ribbon: 'NEW' },
  free: { name: 'FREE PLAY', desc: 'Drop into the open world anytime. Eight zones around a safe hub.', players: 'Open world', mode: 'free', ribbon: null },
  showdown: { name: 'SHOWDOWN', desc: 'Last hunter standing wins while the poison closes in.', players: '10 players', mode: 'showdown', ribbon: 'EVENT' },
};
import { clampPower, POWER_COST, MAX_POWER } from '../power.js';
import { DRIVERS } from '../race/physics.js';
import { RACE_MODES } from '../race/protocol.js';
import { paintPreview, trackLabel, TRACK_CHOICES, weaponOf, driverStats } from '../race/preview.js';
import { carName } from '../race/looks.js';
import { shopDay } from '../race/garage.js';
import { drawPlatform, equippedLook } from './platform.js';
import { openStore } from './store.js';
// HUNT RACERS (the main game): the PLAY page lists the racing modes; the shooter lobby above is the
// classic one (?shooter=1)
export const RACE_MODE_BTNS = [
  ['grand', 'GRAND RACE', '3 laps · first past the flag', 'trophy', '#4a7fe0'],
  ['elim', 'ELIMINATION', 'Last place out every 18 s', 'skull', '#cf3a44'],
  ['battle', 'BATTLE ARENA', 'Most takedowns in 2:00', 'battle', '#7b45c9'],
  ['trial', 'TIME TRIAL', 'Solo vs the clock', 'star', '#d9822b'],
];
const $ = (id) => document.getElementById(id);
const fmtLap = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TAUNTS = ['The hunt is on.', 'I see you.', 'Run.', 'Your bounty is mine.', 'Nowhere to hide.', 'Ready.'];

// The lobby: a player banner + currencies on top, a tab bar down the left (Profile, Locker, Play,
// Armory, Pass, Friends) and the selected tab's page. PLAY: mode buttons, your party (your hunter +
// invite slots), fill-with-bots, Hunt Pass and a big PLAY button.
const MODE_BTNS = [
  ['quick', 'QUICK HUNT', 'Random event · 10', 'target', '#4a7fe0'],
  ['squad', 'SQUAD HUNT', '3 vs 3', 'friends', '#cf3a44'],
  ['bighunt', 'BIG HUNT', '20 hunters', 'skull', '#7b45c9'],
  ['free', 'FREE PLAY', 'Open world', 'road', '#2b9c6c'],
  ['showdown', 'SHOWDOWN', 'Last one standing', 'trophy', '#d9822b'],
];
const TABS = [['profile', 'PROFILE', 'user'], ['locker', 'LOCKER', 'locker'], ['play', 'PLAY', 'battle'], ['armory', 'ARMORY', 'armory'], ['pass', 'HUNT PASS', 'pass'], ['friends', 'FRIENDS', 'friends']];
// level shield (original): gold rim, deep red body, the level number
const shield = (id) => `<svg class="shield" viewBox="0 0 64 72"><path d="M32 3 L59 12 V36 C59 53 46 64 32 69 C18 64 5 53 5 36 V12 Z" fill="#ffc83d" stroke="#1b1033" stroke-width="4" stroke-linejoin="round"/><path d="M32 11 L51 17 V36 C51 48 42 56 32 60 C22 56 13 48 13 36 V17 Z" fill="#8e2a3a"/><path d="M32 11 V60 C22 56 13 48 13 36 V17 Z" fill="#b2423f"/><text id="${id}" x="32" y="45" text-anchor="middle" font-family="Lilita One" font-size="26" fill="#fff" stroke="#1b1033" stroke-width="4" paint-order="stroke">1</text></svg>`;

// Where the stage draws your hunter. A hunter with its weapon reaches up to ~68 units from its
// centre at any facing (the idle twirl spins it right round), and the taunt hop lifts it 26 more,
// so the scale is the largest at which all of that stays inside the canvas.
export const HUNTER_REACH = 68;
export function stageFit(w, h) {
  const sc = Math.max(0.1, Math.min((w / 2 - 4) / HUNTER_REACH, (h - 6) / (HUNTER_REACH + 30 + 26 + 18)));
  const base = h - 18 * sc; // pedestal along the bottom of the card
  return { sc, cx: w / 2, base, y: base - 30 * sc };
}

export function createLobby(api) {
  const RACE = !!api.racing;
  const root = $('lobby');
  root.className = 'lobby' + (RACE ? ' racing' : '');
  // racing: the STORE (car cosmetics) takes the place of the Locker and the Armory, which only hold
  // shooter cosmetics and weapons (both stay in the classic lobby)
  const tabs = RACE ? [['profile', 'PROFILE', 'user'], ['store', 'STORE', 'coin'], ...TABS.filter(([k]) => ['play', 'pass', 'friends'].includes(k))] : TABS;
  const playPage = RACE ? `
      <section class="pg pg-play" data-pg="play">
        <div class="modelist" id="modeCard">${RACE_MODE_BTNS.map(([k, n, sub, ic, col]) => `<button class="modebtn tap" data-m="${k}" style="--mc:${col}" title="${esc(RACE_MODES[k].desc)}"><span class="mi">${icon(ic)}</span><span class="mn"><b>${n}</b><small>${sub}</small></span><span class="go" aria-hidden="true"></span></button>`).join('')}
          <button type="button" class="modebtn trackbtn tap" id="trackBtn" style="--mc:#2b9c6c" aria-label="Choose a track"><canvas class="tpv" id="trackPv" aria-hidden="true"></canvas><span class="mn"><b id="trackNm">RANDOM TRACK</b><small id="trackSub">TRACK · tap to change</small></span><span class="go" aria-hidden="true"></span></button>
          <button type="button" class="fillbots" id="fillBots" role="switch" aria-checked="true"><span class="cb" id="fillCb"></span> FILL WITH BOTS</button></div>
        <div class="party">
          <div class="slots">
            <div class="slot me nameplate tap" title="Change driver"><canvas id="stage"></canvas><div class="np-row"><span class="np-name" id="npName">Volt</span><span class="role" id="npRole">ALL-ROUNDER</span></div>
              <div class="np-car" id="npCar"></div>
              <div class="np-stats" id="npStats" aria-hidden="true"></div>
              <div class="np-tro">${icon('trophy')}<span id="npTro">0</span><span class="np-mode" id="mcName">GRAND RACE</span></div></div>
            ${[1, 2, 3].map(() => `<button class="slot invite tap"><span class="plus">+</span><span>INVITE<br>FRIENDS</span></button>`).join('')}
          </div>
          <div class="actions"><button class="btn btn-md alt" id="rail_road">${icon('road')} TROPHY ROAD<span class="dot" id="dot_road" hidden></span></button>
            <button class="btn btn-md gold" id="passBtn">${icon('pass')} HUNT PASS</button>
            <button class="btn btn-lg play" id="playBtn" data-sfx="play">PLAY</button></div>
        </div>
      </section>` : '';
  root.innerHTML = `
    <div class="lb-top">
      <div class="pbanner tap" id="profileCard">${shield('lvN')}<div class="pb-txt"><div class="pb-row"><div class="pname" id="pName">Hunter</div><div class="ptro">${icon('trophy')}<span id="pTro">0</span></div></div><div class="xpbar"><i id="xpFill"></i></div></div>
        <div class="guestchip" id="guestChip" hidden><span><i>Guest · </i>save progress</span><button id="guestX" aria-label="Dismiss">✕</button></div></div>
      <div class="lb-cur">
        <div class="cur" id="tbGems">${icon('gem')}<b id="gemN">0</b><small>TEST</small><button class="plus tap" id="gemPlus" aria-label="Get gems">${icon('plus')}</button></div>
        <div class="cur" id="tbCoins">${icon('coin')}<b id="coinN">0</b><small>TEST</small><button class="plus tap" id="coinPlus" aria-label="Get coins">${icon('plus')}</button></div>
        <div class="cur missions tap" id="tbMissions"><svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="#3a2380" stroke="#1b1033" stroke-width="4"/><circle id="misArc" cx="18" cy="18" r="14" fill="none" stroke="#4be06e" stroke-width="5" stroke-dasharray="0 88" transform="rotate(-90 18 18)" stroke-linecap="round"/><text x="18" y="23" text-anchor="middle" font-family="Lilita One" font-size="13" fill="#fff" stroke="#1b1033" stroke-width="3" paint-order="stroke" id="misN">0</text></svg><span class="mt">MISSIONS<small id="misT">--:--</small></span><span class="dot" id="dotMis" hidden></span></div>
        <button class="gear tap" id="rail_settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </div>
    <nav class="lb-tabs">${tabs.map(([k, l, ic]) => `<button class="tabbtn tap" id="${k === 'locker' || k === 'armory' || k === 'pass' || k === 'friends' || k === 'store' ? 'rail_' + k : 'tab_' + k}" data-tab="${k}">${icon(ic)}<span>${l}</span><span class="dot" id="dot_${k}" hidden></span>${k === 'play' ? '<span class="tabchip" id="playChip">READY</span>' : k === 'store' ? '<span class="tabchip" id="storeChip">DAILY</span>' : ''}</button>`).join('')}</nav>
    <main class="lb-page">${RACE ? playPage : `
      <section class="pg pg-play" data-pg="play">
        <div class="modelist" id="modeCard">${MODE_BTNS.map(([k, n, sub, ic, col]) => `<button class="modebtn tap" data-m="${k}" style="--mc:${col}"><span class="mi">${icon(ic)}</span><span class="mn"><b>${n}</b><small>${sub}</small></span><span class="go" aria-hidden="true"></span></button>`).join('')}
          <button type="button" class="fillbots" id="fillBots" role="switch" aria-checked="true"><span class="cb" id="fillCb"></span> FILL WITH BOTS</button></div>
        <div class="party">
          <div class="slots">
            <div class="slot me nameplate tap" title="Change hunter"><canvas id="stage"></canvas><div class="np-row"><span class="np-name" id="npName">Volt</span><span class="role" id="npRole">BALANCED</span></div>
              <div class="power tap" id="npPower" data-notab>POWER <b id="npPow">1</b><div class="bar"><i id="npBar" style="width:0%"></i></div><button class="btn btn-sm" id="npUp">UPGRADE</button></div>
              <div class="np-tro">${icon('trophy')}<span id="npTro">0</span><span class="np-mode" id="mcName">QUICK HUNT</span></div></div>
            ${[1, 2, 3].map(() => `<button class="slot invite tap"><span class="plus">+</span><span>INVITE<br>FRIENDS</span></button>`).join('')}
          </div>
          <div class="actions"><button class="btn btn-md alt" id="rail_road">${icon('road')} TROPHY ROAD<span class="dot" id="dot_road" hidden></span></button>
            <button class="btn btn-md gold" id="passBtn">${icon('pass')} HUNT PASS</button>
            <button class="btn btn-lg play" id="playBtn" data-sfx="play">PLAY</button></div>
        </div>
      </section>`}
      <section class="pg pg-profile" data-pg="profile" hidden></section>
      <section class="pg pg-locker" data-pg="locker" hidden></section>
    </main>
    <div id="credit">Created by Sam Eyde III</div>`;

  initRotateHint();
  const L = {
    mode: store.get('hunt-mode') || 'quick', tab: 'play', t0: performance.now(), taunt: 0, twirl: 0, blinkAt: 2, raf: 0, visible: true,
  };
  if (!MODES_UI[L.mode]) L.mode = 'quick';
  if (RACE) {
    L.mode = store.get('hunt-race-mode') || 'grand'; if (!RACE_MODES[L.mode]) L.mode = 'grand';
    L.track = store.get('hunt-race-track') || 'any'; if (!TRACK_CHOICES.includes(L.track)) L.track = 'any';
  }
  const stage = $('stage'), sg = stage.getContext('2d');

  const Q = [{ st: 1.5 }, { st: 1.25 }, { st: 1 }];
  // stage resolution follows what the frames cost (adapt.js), so it can come back up too
  const AQ = createAdapt(Q.length);
  function adapt(cost, interval) { if (adaptFrame(AQ, cost, interval)) resize(); }
  function resize() {
    const dpr = SETTINGS.lowGfx ? 1 : Math.min(Q[AQ.step].st, devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    stage.width = Math.max(1, Math.round(r.width * dpr)); stage.height = Math.max(1, Math.round(r.height * dpr)); L.dpr = dpr;
  }
  addEventListener('resize', () => requestAnimationFrame(() => { resize(); if (RACE && !root.hidden && L.tab === 'play') refresh(); })); // (the track preview follows its box)

  // ---------- stage: big brawler on a glowing pedestal ----------
  function drawStage(t) {
    const w = stage.width / L.dpr, h = stage.height / L.dpr;
    sg.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); sg.clearRect(0, 0, w, h);
    if (RACE) { drawPlatform(sg, w, h, api.getBrawler(), L.look, SETTINGS.reduceFlash ? t * 0.5 : t, { low: SETTINGS.lowGfx }); return; } // the car turning on its neon platform
    const id = api.getBrawler(), B = BRAWLERS[id];
    const { sc, cx, base } = stageFit(w, h);
    // dramatic light from below: a warm cone rising off the pedestal
    const col = (L.colCache ||= {})[B.role] ||= getComputedStyle(document.documentElement).getPropertyValue(ROLE_COL[B.role].slice(4, -1)).trim() || '#ffd23f';
    const flick = SETTINGS.reduceFlash ? 0.85 : 0.8 + Math.sin(t * 1.7) * 0.08 + Math.sin(t * 5.3) * 0.04;
    const cone = sg.createLinearGradient(0, base, 0, base - 110 * sc);
    cone.addColorStop(0, `rgba(255,120,50,${0.42 * flick})`); cone.addColorStop(1, 'rgba(255,120,50,0)');
    sg.fillStyle = cone; sg.beginPath(); sg.moveTo(cx - 30 * sc, base); sg.lineTo(cx - 52 * sc, base - 110 * sc); sg.lineTo(cx + 52 * sc, base - 110 * sc); sg.lineTo(cx + 30 * sc, base); sg.closePath(); sg.fill();
    const gl = sg.createRadialGradient(cx, base, 4, cx, base, 46 * sc);
    gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
    sg.globalAlpha = 0.5 * flick; sg.fillStyle = gl; sg.fillRect(cx - 50 * sc, base - 50 * sc, 100 * sc, 80 * sc); sg.globalAlpha = 1;
    sg.lineWidth = 5; sg.strokeStyle = '#0c0614';
    sg.beginPath(); sg.ellipse(cx, base + 6 * sc, 36 * sc, 11 * sc, 0, 0, Math.PI * 2); sg.fillStyle = '#170d24'; sg.fill(); sg.stroke(); // dark stone pedestal
    sg.beginPath(); sg.ellipse(cx, base, 36 * sc, 11 * sc, 0, 0, Math.PI * 2); sg.fillStyle = '#2c1d3c'; sg.fill(); sg.stroke();
    sg.beginPath(); sg.ellipse(cx, base, 28 * sc, 8 * sc, 0, 0, Math.PI * 2); sg.strokeStyle = '#ff8a3d'; sg.lineWidth = 3; sg.stroke(); // glowing rune ring
    // idle: bob, blink, weapon twirl; taunt: hop + spin
    const blink = t > L.blinkAt && t < L.blinkAt + 0.12 ? 1 : 0;
    if (t > L.blinkAt + 0.12) L.blinkAt = t + 2 + Math.random() * 3;
    let facing = 0.35 + Math.sin(t * 0.7) * 0.15, hop = 0;
    if (L.twirl && t < L.twirl + 0.9) facing += ((t - L.twirl) / 0.9) * Math.PI * 2;
    else if (!L.twirl || t > L.twirl + 7) L.twirl = t + 5 + Math.random() * 3 - (L.twirl ? 0 : 3);
    if (L.taunt && t < L.taunt + 0.8) { const k = (t - L.taunt) / 0.8; hop = Math.sin(k * Math.PI) * 26 * sc; facing += k * Math.PI * 2; }
    const skin = A.progress().equipped['skin:' + id] || null;
    drawBrawler(sg, id, cx, base - 30 * sc - hop, facing, t, { scale: sc, blink, skin, moving: false });
    // light it from below: warm on the lower half, shadow falling over the head
    sg.save(); sg.globalCompositeOperation = 'source-atop';
    const ul = sg.createLinearGradient(0, base - 80 * sc, 0, base);
    ul.addColorStop(0, 'rgba(12,4,24,0.42)'); ul.addColorStop(0.5, 'rgba(12,4,24,0)'); ul.addColorStop(1, `rgba(255,110,40,${0.32 * flick})`);
    sg.fillStyle = ul; sg.fillRect(0, 0, w, h); sg.restore();
    // fog rolling over the pedestal
    if (!SETTINGS.lowGfx) {
      sg.save();
      for (let i = 0; i < 6; i++) {
        const d = SETTINGS.reduceFlash ? 0 : t * (8 + i * 3);
        // drifts within the canvas and fades out at the ends (no hard edges where the canvas clips)
        const off = ((i * 37 + d) % 68) - 34, fx2 = cx + off * sc, fy2 = base + (i % 2 ? 4 : -2) * sc;
        sg.globalAlpha = (0.18 + (i % 3) * 0.05) * (1 - (off / 34) ** 2); sg.fillStyle = '#b9a8d6';
        sg.beginPath(); sg.ellipse(fx2, fy2, (20 + (i % 3) * 6) * sc, 6 * sc, 0, 0, Math.PI * 2); sg.fill();
      }
      sg.restore();
    }
  }
  // ---------- data -> UI ----------
  function refresh() {
    if (RACE) return refreshRace();
    const p = A.progress(), id = api.getBrawler(), B = BRAWLERS[id];
    $('coinN').textContent = p.coins; $('gemN').textContent = p.gems ?? 0;
    const lv = levelInfo(p.xp);
    $('lvN').textContent = lv.level;
    $('xpFill').style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
    $('pName').textContent = api.prefs.name || 'Hunter';
    $('pTro').textContent = totalTrophies(p);
    const guest = !A.ACC.user || A.ACC.user.guest;
    $('guestChip').hidden = !guest || store.get('hunt-guestchip') === 'x';
    $('npName').textContent = B.name; $('npRole').textContent = B.role.toUpperCase(); $('npRole').style.setProperty('--role-col', ROLE_COL[B.role]);
    const tro = p.trophies[id] | 0, pl = clampPower(p.power?.[id] || 1), cost = POWER_COST[pl] || 0;
    $('npTro').textContent = tro; $('npPow').textContent = pl; $('npBar').style.width = `${Math.round((pl / MAX_POWER) * 100)}%`;
    $('npUp').textContent = pl >= MAX_POWER ? 'MAX' : p.coins >= cost ? 'UPGRADE' : 'POWER'; $('npUp').classList.toggle('alt', !(pl < MAX_POWER && p.coins >= cost));
    // missions
    const ms = missionState(p), done = ms.filter((m) => m.done).length, claimable = ms.some((m) => m.done && !m.claimed);
    $('misN').textContent = `${done}/3`;
    $('misArc').setAttribute('stroke-dasharray', `${(done / 3) * 88} 88`);
    $('dotMis').hidden = !claimable;
    // notification dots
    const tt = totalTrophies(p);
    let roadReady = false; for (let at = ROAD_STEP; at <= tt; at += ROAD_STEP) if (roadReward(at) && !p.claimed.includes(at)) roadReady = true;
    const tier = passTier(p.pass.xp);
    const passReady = PASS.some((r) => r.tier <= tier && (!p.pass.claimed.includes(`free:${r.tier}`) || (p.pass.premium && !p.pass.claimed.includes(`premium:${r.tier}`))));
    // Locker / Armory dots: only for things you have not looked at yet
    const seen = (k, now) => { const r = seenList(store.get(k), now); if (r.fresh) store.set(k, JSON.stringify(now)); return r.list; };
    const arm = armoryKeys(p);
    $('dot_road').hidden = !roadReady; $('dot_pass').hidden = !passReady; $('dot_locker').hidden = !hasUnseen(p.owned, seen('hunt-seen-locker', p.owned));
    $('dot_armory').hidden = !hasUnseen(arm, seen('hunt-seen-armory', arm));
    $('dot_friends').hidden = true; $('dot_profile').hidden = true; $('dot_play').hidden = true;
    // mode buttons + party
    const M = MODES_UI[L.mode];
    $('mcName').textContent = M.name;
    for (const b of root.querySelectorAll('.modebtn')) { b.classList.toggle('sel', b.dataset.m === L.mode); b.setAttribute('aria-pressed', String(b.dataset.m === L.mode)); }
    const bots = $('bots'), botsOn = !bots || bots.checked; $('fillCb').classList.toggle('on', botsOn); $('fillBots').setAttribute('aria-checked', String(botsOn));
    $('playChip').textContent = L.mode === 'free' ? 'FREE PLAY' : 'READY';
    for (const b of root.querySelectorAll('.tabbtn')) b.classList.toggle('on', b.dataset.tab === L.tab);
    for (const pg of root.querySelectorAll('.pg')) pg.hidden = pg.dataset.pg !== L.tab;
    if (L.tab === 'profile') SC.renderProfilePage(root.querySelector('.pg-profile'), api, refresh);
    if (L.tab === 'locker') SC.renderLockerPage(root.querySelector('.pg-locker'), api, refresh);
    makeFocusable(root);
  }
  // the parts every tab shows: banner, currencies, missions, notification dots, tabs
  function refreshTop(p) {
    $('coinN').textContent = p.coins; $('gemN').textContent = p.gems ?? 0;
    const lv = levelInfo(p.xp);
    $('lvN').textContent = lv.level;
    $('xpFill').style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
    $('pName').textContent = api.prefs.name || 'Racer';
    $('pTro').textContent = totalTrophies(p);
    const guest = !A.ACC.user || A.ACC.user.guest;
    $('guestChip').hidden = !guest || store.get('hunt-guestchip') === 'x';
    const ms = missionState(p), done = ms.filter((m) => m.done).length, claimable = ms.some((m) => m.done && !m.claimed);
    $('misN').textContent = `${done}/3`;
    $('misArc').setAttribute('stroke-dasharray', `${(done / 3) * 88} 88`);
    $('dotMis').hidden = !claimable;
    const tt = totalTrophies(p);
    let roadReady = false; for (let at = ROAD_STEP; at <= tt; at += ROAD_STEP) if (roadReward(at) && !p.claimed.includes(at)) roadReady = true;
    const tier = passTier(p.pass.xp);
    const passReady = PASS.some((r) => r.tier <= tier && (!p.pass.claimed.includes(`free:${r.tier}`) || (p.pass.premium && !p.pass.claimed.includes(`premium:${r.tier}`))));
    const seen = (k, now) => { const r = seenList(store.get(k), now); if (r.fresh) store.set(k, JSON.stringify(now)); return r.list; };
    $('dot_road').hidden = !roadReady; $('dot_pass').hidden = !passReady;
    if ($('dot_locker')) $('dot_locker').hidden = !hasUnseen(p.owned, seen('hunt-seen-locker', p.owned));
    if ($('dot_store')) $('dot_store').hidden = store.get('hunt-store-day') === String(shopDay()); // a new daily shop you have not seen
    $('dot_friends').hidden = true; $('dot_profile').hidden = true; $('dot_play').hidden = true;
    for (const b of root.querySelectorAll('.tabbtn')) b.classList.toggle('on', b.dataset.tab === L.tab);
    for (const pg of root.querySelectorAll('.pg')) pg.hidden = pg.dataset.pg !== L.tab;
    if (L.tab === 'profile') SC.renderProfilePage(root.querySelector('.pg-profile'), api, refresh);
    if (L.tab === 'locker') SC.renderLockerPage(root.querySelector('.pg-locker'), api, refresh);
  }
  // HUNT RACERS play page: mode, track (with its preview), bots, your driver and their car
  function refreshRace() {
    const p = A.progress(), id = api.getBrawler(), D = DRIVERS[id] || DRIVERS.volt;
    refreshTop(p);
    L.look = equippedLook(p, id); // (the platform draws it every frame)
    $('npName').textContent = carName(id); $('npRole').textContent = D.role.toUpperCase(); $('npRole').style.setProperty('--role-col', L.look.neon);
    root.querySelector('.slot.me').style.setProperty('--car-neon', L.look.neon);
    $('npCar').textContent = weaponOf(id).name;
    if (L.statsFor !== id) { L.statsFor = id; $('npStats').innerHTML = driverStats(id).map((r) => `<span>${r.label}</span><i><b style="width:${Math.round(r.f * 100)}%"></b></i>`).join(''); }
    $('npTro').textContent = p.trophies[id] | 0;
    $('mcName').textContent = RACE_MODES[L.mode].name.toUpperCase();
    for (const b of root.querySelectorAll('.modebtn[data-m]')) { b.classList.toggle('sel', b.dataset.m === L.mode); b.setAttribute('aria-pressed', String(b.dataset.m === L.mode)); }
    const arena = !!RACE_MODES[L.mode].arena;
    $('trackNm').textContent = trackLabel(L.track, arena).toUpperCase();
    const best = L.mode === 'trial' && L.track !== 'any' ? p.race?.best?.[L.track] : null;
    $('trackSub').textContent = best ? `BEST ${fmtLap(best)} · tap to change` : arena ? 'ARENA · tap to change' : 'TRACK · tap to change';
    if (!$('trackPv').closest('[hidden]')) paintPreview($('trackPv'), L.track, arena);
    // Time Trial is always solo: bots do not apply
    const solo = L.mode === 'trial', bots = $('bots'), botsOn = !bots || bots.checked;
    $('fillCb').classList.toggle('on', botsOn && !solo); $('fillBots').setAttribute('aria-checked', String(botsOn && !solo));
    $('fillBots').classList.toggle('na', solo); $('fillBots').setAttribute('aria-disabled', String(solo));
    $('playChip').textContent = 'READY';
    makeFocusable(root);
  }
  A.onUser(refresh);

  // ---------- loop (only while the lobby is visible) ----------
  function loop(now) {
    L.raf = 0;
    if (root.hidden) return;
    const t = (now - L.t0) / 1000, t0 = performance.now(), iv = L.lastNow ? now - L.lastNow : 0;
    L.lastNow = now;
    if (L.tab === 'play') drawStage(t);
    if (Math.floor(t) !== L.lastSec) { L.lastSec = Math.floor(t); $('misT').textContent = fmtReset(); }
    if (iv) adapt(performance.now() - t0, iv);
    L.raf = requestAnimationFrame(loop);
  }
  const fmtReset = () => { const s = Math.floor(msToReset() / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`; };

  // ---------- interactions ----------
  const tab = (k) => { L.tab = k; sfx('click', 0.6); refresh(); if (k === 'play') requestAnimationFrame(() => { resize(); if (RACE) refresh(); }); };
  if (RACE) {
    // ---------- HUNT RACERS play page ----------
    root.querySelector('.slot.me').addEventListener('click', () => SC.openDriverSelect(api, refresh));
    for (const b of root.querySelectorAll('.modebtn[data-m]')) b.onclick = () => { L.mode = b.dataset.m; store.set('hunt-race-mode', L.mode); sfx('click'); refresh(); };
    $('trackBtn').onclick = () => SC.openTrackPicker({ track: L.track, arena: !!RACE_MODES[L.mode].arena, best: A.progress().race?.best || {}, trial: L.mode === 'trial' }, (k) => { L.track = k; store.set('hunt-race-track', k); refresh(); });
    $('fillBots').onclick = () => { if (L.mode === 'trial') { SC.toastMsg('Time Trial is always just you'); return; } const bx = $('bots'); if (bx) { bx.checked = !bx.checked; bx.dispatchEvent(new Event('change')); } sfx('click', 0.6); refresh(); };
    for (const b of root.querySelectorAll('.slot.invite')) b.onclick = () => SC.openRaceFriends(api);
    $('playBtn').addEventListener('click', () => { unlockAudio(); api.startRace({ mode: L.mode, track: L.track }); });
    $('tab_play').onclick = () => tab('play');
    $('tab_profile').onclick = () => tab('profile');
    $('rail_store').onclick = () => { store.set('hunt-store-day', String(shopDay())); sfx('click', 0.6); openStore(api, refresh); refresh(); };
    $('rail_pass').onclick = $('passBtn').onclick = () => SC.openPass(refresh);
    $('rail_road').onclick = () => SC.openRoad(refresh);
    $('rail_friends').onclick = () => SC.openRaceFriends(api);
    $('rail_settings').onclick = () => SC.openSettings(api, () => { resize(); refresh(); });
    $('profileCard').addEventListener('click', (e) => { if (e.target.closest('#guestChip')) return; tab('profile'); });
    $('guestChip').addEventListener('click', (e) => { e.stopPropagation(); if (e.target.id === 'guestX') { store.set('hunt-guestchip', 'x'); refresh(); } else SC.openProfile(api, refresh, true); });
    $('tbMissions').onclick = () => SC.openMissions(refresh);
    $('coinPlus').onclick = $('gemPlus').onclick = () => SC.openEarnInfo();
  } else {
  root.querySelector('.slot.me').addEventListener('click', (e) => { if (!e.target.closest('#npPower')) SC.openBrawlerSelect(api, refresh); });
  for (const b of root.querySelectorAll('.modebtn')) b.onclick = () => { L.mode = b.dataset.m; store.set('hunt-mode', L.mode); sfx('click'); refresh(); };
  // FILL WITH BOTS: off = humans-only matches (the game saves the choice on 'change')
  $('fillBots').onclick = () => { const bx = $('bots'); if (bx) { bx.checked = !bx.checked; bx.dispatchEvent(new Event('change')); } sfx('click', 0.6); refresh(); };
  for (const b of root.querySelectorAll('.slot.invite')) b.onclick = () => SC.openFriends(api);
  $('playBtn').addEventListener('click', () => {
    unlockAudio();
    const M = MODES_UI[L.mode];
    if (L.mode === 'free') api.startFree(); else api.startQuick({ mode: M.mode || '' });
  });
  $('tab_play').onclick = () => tab('play');
  $('tab_profile').onclick = () => tab('profile');
  $('rail_locker').onclick = () => { store.set('hunt-seen-locker', JSON.stringify(A.progress().owned)); tab('locker'); };
  $('rail_armory').onclick = () => SC.openArmory(api, refresh);
  $('npPower').addEventListener('click', (e) => { e.stopPropagation(); SC.openPower(api, refresh); });
  $('rail_pass').onclick = $('passBtn').onclick = () => SC.openPass(refresh);
  $('rail_road').onclick = () => SC.openRoad(refresh);
  $('rail_friends').onclick = () => SC.openFriends(api);
  $('rail_settings').onclick = () => SC.openSettings(api, () => { resize(); refresh(); });
  $('profileCard').addEventListener('click', (e) => { if (e.target.closest('#guestChip')) return; tab('profile'); });
  $('guestChip').addEventListener('click', (e) => { e.stopPropagation(); if (e.target.id === 'guestX') { store.set('hunt-guestchip', 'x'); refresh(); } else SC.openProfile(api, refresh, true); });
  $('tbMissions').onclick = () => SC.openMissions(refresh);
  $('coinPlus').onclick = $('gemPlus').onclick = () => SC.openEarnInfo();
  }

  function show() {
    root.hidden = false; resize(); refresh();
    if (!L.raf) L.raf = requestAnimationFrame(loop);
    startMusic();
  }
  function hide() { root.hidden = true; L.lastNow = 0; stopMusic(); }
  // music needs a user gesture on mobile: start on the first tap in the lobby
  root.addEventListener('pointerdown', () => { unlockAudio(); if (!root.hidden) startMusic(); }, { once: false });
  return { show, hide, refresh, get mode() { return L.mode; }, get track() { return L.track; }, get tab() { return L.tab; }, perf: () => ({ q: AQ.step, avg: AQ.cost }) };
}
export { ICONS };
