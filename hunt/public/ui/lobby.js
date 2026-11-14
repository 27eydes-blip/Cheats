// Main lobby: living background, centre-stage brawler on a pedestal, profile card + icon rail,
// currencies + daily missions, mode card, PLAY. Screens live in screens.js; match flow in flow.js.
import { BRAWLERS, BRAWLER_IDS, WORLDS, worldId } from '../shared.js';
import { drawBrawler } from '../render.js';
import { SETTINGS } from '../settings.js';
import { sfx, unlockAudio } from '../audio.js';
import { icon, ICONS } from './icons.js';
import { LobbyScene, featuredWorld, drawModePreview } from './scenes.js';
import { startMusic, stopMusic } from './music.js';
import { totalTrophies, levelInfo, missionState, msToReset, roadReward, ROAD_STEP } from '../progression.js';
import { PASS, passTier } from '../catalog.js';
import * as A from '../account.js';

// storage can throw (Safari with cookies blocked, sandboxed frames): never let that kill the lobby
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
import * as SC from './screens.js';

export const ROLE_COL = { Balanced: 'var(--role-balanced)', Tank: 'var(--role-tank)', Sniper: 'var(--role-sniper)', Controller: 'var(--role-controller)', Trapper: 'var(--role-trapper)', Assassin: 'var(--role-assassin)' };
export const MODES_UI = {
  quick: { name: 'QUICK HUNT', desc: 'A random event: Showdown, Bounty Rush, Hunted or Crystal Grab.', players: '10 players', mode: '', ribbon: null },
  squad: { name: 'SQUAD HUNT', desc: '3v3 — kills fill your team pot. Biggest pot wins.', players: '3v3', mode: 'squad', ribbon: 'NEW' },
  bighunt: { name: 'BIG HUNT', desc: '20 hunters on a huge arena. Last one standing wins.', players: '20 players', mode: 'bighunt', ribbon: 'NEW' },
  free: { name: 'FREE PLAY', desc: 'Drop into the open world anytime. Eight zones around a safe hub.', players: 'Open world', mode: 'free', ribbon: null },
  showdown: { name: 'SHOWDOWN', desc: 'Last hunter standing wins while the poison closes in.', players: '10 players', mode: 'showdown', ribbon: 'EVENT' },
};
import { clampPower, POWER_COST, MAX_POWER } from '../power.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TAUNTS = ['The hunt is on.', 'I see you.', 'Run.', 'Your bounty is mine.', 'Nowhere to hide.', 'Ready.'];

export function createLobby(api) {
  const root = $('lobby');
  root.className = 'lobby';
  root.innerHTML = `
    <canvas id="lobbyBg"></canvas>
    <div class="lb-top">
      <div class="cur" id="tbCoins">${icon('coin')}<b id="coinN">0</b><small>TEST</small><button class="plus tap" id="coinPlus" aria-label="Get coins">${icon('plus')}</button></div>
      <div class="cur" id="tbGems">${icon('gem')}<b id="gemN">0</b><small>TEST</small><button class="plus tap" id="gemPlus" aria-label="Get gems">${icon('plus')}</button></div>
      <div class="cur missions tap" id="tbMissions"><svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="#3a2380" stroke="#1b1033" stroke-width="4"/><circle id="misArc" cx="18" cy="18" r="14" fill="none" stroke="#4be06e" stroke-width="5" stroke-dasharray="0 88" transform="rotate(-90 18 18)" stroke-linecap="round"/><text x="18" y="23" text-anchor="middle" font-family="Lilita One" font-size="13" fill="#fff" stroke="#1b1033" stroke-width="3" paint-order="stroke" id="misN">0</text></svg><span class="mt">DAILY MISSIONS<small id="misT">--:--</small></span><span class="dot" id="dotMis" hidden></span></div>
    </div>
    <div class="lb-left">
      <div class="card-a profile tap" id="profileCard">
        <div class="avatar"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="#1b1033" stroke-width="6"/><circle cx="20" cy="20" r="17" fill="none" stroke="#3a2380" stroke-width="3"/><circle id="xpArc" cx="20" cy="20" r="17" fill="none" stroke="#ffd23f" stroke-width="3.4" stroke-dasharray="0 107" stroke-linecap="round"/></svg><canvas id="avatarCv" width="96" height="96"></canvas><span class="lv" id="lvN">1</span></div>
        <div class="pname" id="pName">Hunter</div>
        <div class="ptro">${icon('trophy')}<span id="pTro">0</span></div>
        <div class="guestchip" id="guestChip" hidden><span>Guest · save progress</span><button id="guestX" aria-label="Dismiss">✕</button></div>
      </div>
      <div class="rail">
        ${[['armory', 'ARMORY'], ['locker', 'LOCKER'], ['pass', 'HUNT PASS'], ['road', 'TROPHY ROAD'], ['friends', 'FRIENDS'], ['settings', 'SETTINGS']].map(([k, l]) =>
          `<button class="btn btn-sm railbtn" id="rail_${k}">${icon(k)}<span>${l}</span><span class="dot" id="dot_${k}" hidden></span></button>`).join('')}
      </div>
    </div>
    <div class="lb-stage">
      <canvas id="stage" aria-label="Your brawler — tap to choose"></canvas>
      <div class="card-a nameplate">
        <div class="np-row"><span class="title np-name" id="npName">Volt</span><span class="role" id="npRole">BALANCED</span><span class="np-tro">${icon('trophy')}<span id="npTro">0</span></span></div>
        <div class="power tap" id="npPower">POWER <b id="npPow">1</b><div class="bar shine"><i id="npBar" style="width:0%"></i></div><button class="btn btn-sm" id="npUp">UPGRADE</button></div>
      </div>
    </div>
    <div class="lb-right">
      <div class="card-b modecard tap" id="modeCard"><span class="ribbon" id="mcRibbon" hidden></span><canvas id="modeCv" width="320" height="200"></canvas><div class="title mc-name" id="mcName">QUICK HUNT</div><div class="mc-desc" id="mcDesc"></div><div class="mc-change">${icon('swap')} CHANGE MODE</div></div>
    </div>
    <button class="btn btn-lg play" id="playBtn" data-sfx="play">PLAY</button>
    <div id="credit">Created by Sam Eyde III</div>`;

  const L = {
    mode: store.get('hunt-mode') || 'quick', t0: performance.now(), taunt: 0, twirl: 0, blinkAt: 2, raf: 0, visible: true,
  };
  if (!MODES_UI[L.mode]) L.mode = 'quick';
  const scene = new LobbyScene($('lobbyBg'));
  scene.setWorld(featuredWorld());
  const stage = $('stage'), sg = stage.getContext('2d'), mcv = $('modeCv'), mg = mcv.getContext('2d');
  const av = $('avatarCv').getContext('2d');

  // adaptive quality: slow frames step the backdrop/stage resolution down (soft backdrop upscales fine)
  const Q = [{ bg: 1, st: 1.5 }, { bg: 0.75, st: 1.25 }, { bg: 0.5, st: 1 }];
  L.q = 0; L.avg = 16.7; L.slow = 0; L.fast = 0;
  function adapt(dt) {
    L.avg += (dt - L.avg) * 0.08;
    if (L.avg > 19) { L.slow += dt; L.fast = 0; } else if (L.avg < 14) { L.fast += dt; L.slow = 0; }
    if (L.slow > 800 && L.q < Q.length - 1) { L.q++; L.slow = 0; resize(); }
    else if (L.fast > 10000 && L.q > 0) { L.q--; L.fast = 0; resize(); }
  }
  function resize() {
    const dpr = SETTINGS.lowGfx ? 1 : Math.min(Q[L.q].st, devicePixelRatio || 1);
    scene.maxDpr = SETTINGS.lowGfx ? 1 : Q[L.q].bg;
    scene.resize(innerWidth, innerHeight, dpr);
    const r = stage.getBoundingClientRect();
    stage.width = Math.max(1, Math.round(r.width * dpr)); stage.height = Math.max(1, Math.round(r.height * dpr)); L.dpr = dpr;
  }
  addEventListener('resize', () => requestAnimationFrame(resize));

  // ---------- stage: big brawler on a glowing pedestal ----------
  function drawStage(t) {
    const w = stage.width / L.dpr, h = stage.height / L.dpr;
    sg.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); sg.clearRect(0, 0, w, h);
    const id = api.getBrawler(), B = BRAWLERS[id];
    const size = Math.min(innerHeight * 0.4, h * 0.82, w * 0.7);
    const sc = size / 80, cx = w / 2, base = h - 16 * sc;
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
        const fx2 = cx + (((i * 37 + d) % 120) - 60) * sc, fy2 = base + (i % 2 ? 4 : -2) * sc;
        sg.globalAlpha = 0.18 + (i % 3) * 0.05; sg.fillStyle = '#b9a8d6';
        sg.beginPath(); sg.ellipse(fx2, fy2, (22 + (i % 3) * 8) * sc, 6 * sc, 0, 0, Math.PI * 2); sg.fill();
      }
      sg.restore();
    }
  }
  function drawAvatar(t) {
    av.setTransform(1, 0, 0, 1, 0, 0); av.clearRect(0, 0, 96, 96);
    drawBrawler(av, api.getBrawler(), 48, 62, 0.3, t, { scale: 1.45, skin: A.progress().equipped['skin:' + api.getBrawler()] || null });
  }

  // ---------- data -> UI ----------
  function refresh() {
    const p = A.progress(), id = api.getBrawler(), B = BRAWLERS[id];
    $('coinN').textContent = p.coins; $('gemN').textContent = p.gems ?? 0;
    const lv = levelInfo(p.xp);
    $('lvN').textContent = lv.level;
    $('xpArc').setAttribute('stroke-dasharray', `${(lv.into / lv.need) * 107} 107`);
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
    const seen = +(store.get('hunt-seen-owned') || 0);
    $('dot_road').hidden = !roadReady; $('dot_pass').hidden = !passReady; $('dot_locker').hidden = p.owned.length <= seen;
    $('dot_friends').hidden = true; $('dot_settings').hidden = true;
    // mode card
    const M = MODES_UI[L.mode];
    $('mcName').textContent = M.name; $('mcDesc').textContent = M.desc;
    $('mcRibbon').hidden = !M.ribbon; $('mcRibbon').textContent = M.ribbon || ''; $('mcRibbon').className = 'ribbon' + (M.ribbon === 'EVENT' ? ' event' : '');
  }
  A.onUser(refresh);

  // ---------- loop (only while the lobby is visible) ----------
  function loop(now) {
    L.raf = 0;
    if (root.hidden) return;
    const t = (now - L.t0) / 1000;
    if (L.lastNow) adapt(Math.min(100, now - L.lastNow));
    L.lastNow = now;
    scene.draw(t);
    drawStage(t);
    drawModePreview(mg, L.mode === 'free' ? 'free' : L.mode, mcv.width, mcv.height, t);
    if (Math.floor(t * 4) !== L.lastAv) { L.lastAv = Math.floor(t * 4); drawAvatar(t); $('misT').textContent = fmtReset(); }
    L.raf = requestAnimationFrame(loop);
  }
  const fmtReset = () => { const s = Math.floor(msToReset() / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`; };

  // ---------- interactions ----------
  stage.addEventListener('click', (e) => {
    const r = stage.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if (y > 0.25) { // tapping the brawler: short taunt, a second tap opens brawler select
      const now = (performance.now() - L.t0) / 1000;
      if (L.taunt && now - L.taunt < 1.2) { SC.openBrawlerSelect(api, refresh); return; }
      L.taunt = now; sfx('super', 0.7);
      const b = document.createElement('div'); b.className = 'taunt'; b.textContent = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
      root.querySelector('.lb-stage').appendChild(b); setTimeout(() => b.remove(), 1100);
    }
  });
  $('npName').closest('.nameplate').addEventListener('click', () => SC.openBrawlerSelect(api, refresh));
  $('modeCard').addEventListener('click', () => SC.openModePicker(L.mode, (m) => { L.mode = m; store.set('hunt-mode', m); refresh(); }));
  $('playBtn').addEventListener('click', () => {
    unlockAudio();
    const M = MODES_UI[L.mode];
    if (L.mode === 'free') api.startFree(); else api.startQuick({ mode: M.mode || '' });
  });
  $('rail_armory').onclick = () => SC.openArmory(api, refresh);
  $('npPower').addEventListener('click', (e) => { e.stopPropagation(); SC.openPower(api, refresh); });
  $('rail_locker').onclick = () => { store.set('hunt-seen-owned', A.progress().owned.length); SC.openLocker(api, refresh); };
  $('rail_pass').onclick = () => SC.openPass(refresh);
  $('rail_road').onclick = () => SC.openRoad(refresh);
  $('rail_friends').onclick = () => SC.openFriends(api);
  $('rail_settings').onclick = () => SC.openSettings(api, () => { resize(); refresh(); });
  $('profileCard').addEventListener('click', (e) => { if (e.target.closest('#guestChip')) return; SC.openProfile(api, refresh); });
  $('guestChip').addEventListener('click', (e) => { if (e.target.id === 'guestX') { store.set('hunt-guestchip', 'x'); refresh(); } else SC.openProfile(api, refresh, true); });
  $('tbMissions').onclick = () => SC.openMissions(refresh);
  $('coinPlus').onclick = $('gemPlus').onclick = () => SC.openEarnInfo();

  function show() {
    root.hidden = false; resize(); refresh();
    if (!L.raf) L.raf = requestAnimationFrame(loop);
    startMusic();
  }
  function hide() { root.hidden = true; L.lastNow = 0; stopMusic(); }
  // music needs a user gesture on mobile: start on the first tap in the lobby
  root.addEventListener('pointerdown', () => { unlockAudio(); if (!root.hidden) startMusic(); }, { once: false });
  return { show, hide, refresh, get mode() { return L.mode; }, perf: () => ({ q: L.q, avg: L.avg }) };
}
export { ICONS };
