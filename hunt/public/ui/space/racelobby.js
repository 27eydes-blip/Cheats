// The Hunt Racers lobby in the space look: deep-space sky, a top bar (missions orbit round your
// level, radar, trophies, hex currency badges, STORE, settings), the live news ticker, your car on
// the hologram pad (tap = Garage), the mode carousel with a mode strip, the track and crew panel
// (invite pods + FILL WITH BOTS), LAUNCH and the curved dock (Profile, Garage, Race, Pass, Crew).
// Screens (store, pass, garage, friends, settings...) are the existing ones from screens.js and
// store.js. Element ids that the game and tests know (#playBtn, #fillBots, #trackBtn, #rail_*,
// #tab_*, .modebtn[data-m], .nameplate #stage, #credit) are kept.
import { SETTINGS } from '../../settings.js';
import { unlockAudio } from '../../audio.js';
import { icon } from '../icons.js';
import { makeFocusable } from '../fx.js';
import { onDuck } from '../music.js';
import { totalTrophies, levelInfo, missionState, roadReward, ROAD_STEP } from '../../progression.js';
import { PASS, passTier } from '../../catalog.js';
import * as A from '../../account.js';
import * as SC from '../screens.js';
import { initRotateHint } from '../rotatehint.js';
import { DRIVERS } from '../../race/physics.js';
import { RACE_MODES } from '../../race/protocol.js';
import { paintPreview, trackLabel, TRACK_CHOICES, weaponOf, driverStats } from '../../race/preview.js';
import { trackName } from '../../race/tracks.js';
import { carName, drawCarPreview } from '../../race/looks.js';
import { shopDay, msToShopRefresh } from '../../race/garage.js';
import { equippedLook } from '../platform.js';
import { openStore } from '../store.js';
import { SpaceBackground } from './background.js';
import { createDock } from './dock.js';
import { createCarousel, MODE_CARDS } from './carousel.js';
import { createHoloPad } from './pad.js';
import { createCrew } from './pods.js';
import { createLaunch } from './launch.js';
import { createMissionOrbit } from './orbit.js';
import { createRadar } from './radar.js';
import { createHexBadge } from './badges.js';
import { createTicker } from './ticker.js';
import { tickerItems } from './feed-items.js';
import { lightSweep, slideIn } from './transition.js';
import { chime } from './chimes.js';
import { startAmbient, stopAmbient, duckAmbient } from './ambient.js';
import { startPresence, fetchFeed } from './presence.js';
import { loadSpaceFonts } from './fonts.js';
import { applyQuality, quality } from './quality.js';
import { spIcon } from './icons.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const fmtLap = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
export const MODE_SHORT = { grand: 'GRAND', elim: 'ELIM', battle: 'BATTLE', trial: 'TRIAL' };
// short track words for the LAUNCH line ("GRAND · ASHLANDS"): the world, never cut off
export const TRACK_SHORT = { any: 'RANDOM', desert: 'DESERT', frozen: 'FROZEN', ashlands: 'ASHLANDS', neon: 'NEON CITY' };
export const launchSub = (mode, track) => `${MODE_SHORT[mode] || 'GRAND'} · ${TRACK_SHORT[track] || String(track).toUpperCase()}${RACE_MODES[mode]?.arena ? ' ARENA' : ''}`;
// pad readouts: the Garage's bar for each stat as a 0-10 score (the same scale for every car)
export const padStats = (id) => driverStats(id).map((r) => ({ label: r.label, f: r.f, v: (r.f * 10).toFixed(1) }));
// shrink a one-line label until it fits its box (never below 11 px): run on refresh / resize only
export function fitText(el, min = 11) {
  if (!el || !el.clientWidth) return;
  el.style.fontSize = '';
  let px = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 0.5 && px > min) { px = Math.max(min, px - 1); el.style.fontSize = px + 'px'; }
}
const FEED_MS = 60_000;

// the car on the hologram pad: the equipped look, turning slowly (still under Reduce Flashing)
export function padCar(car, look) {
  return (g, w, h, t) => {
    const s = Math.max(0.1, Math.min(w / (64 * 1.35), h / (64 * 1.05)));
    g.translate(w / 2, h * 0.62);
    g.scale(s * 0.9, s * 0.72); // seen a little from the front, like the pad's ellipse
    drawCarPreview(g, car, look, t ? -0.6 + t * 0.5 : -0.6, t, { steady: SETTINGS.reduceFlash, boost: false });
  };
}

export function createSpaceLobby(api) {
  const root = $('lobby');
  root.className = 'sp sp-root'; // (not .lobby: the classic lobby's styles stay out)
  document.body.classList.add('sp-racing');
  loadSpaceFonts();
  root.innerHTML = `<canvas class="sp-bg" id="spBg" aria-hidden="true"></canvas>
    <div class="sp-lobby" id="spLobby">
      <header class="sp-top">
        <div class="sp-who" id="spWho">
          <div class="sp-who-txt tap" id="profileCard" role="button" aria-label="Profile"><span class="sp-who-row"><span class="sp-who-name" id="pName">Racer</span>
            <span class="guestchip" id="guestChip" hidden><span><i>Guest · </i>save progress</span><button id="guestX" aria-label="Dismiss">✕</button></span></span><span class="sp-who-sub"><span id="pSub">LEVEL 1</span><span class="xpbar" aria-hidden="true"><i id="xpFill"></i></span></span></div>
        </div>
        <div class="sp-top-right" id="spTopR">
          <button type="button" class="sp-trophy" id="rail_road" aria-label="Trophy Road">${icon('trophy')}<b id="pTro">0</b><span class="dot" id="dot_road" hidden></span></button>
          <button type="button" class="sp-storebtn" id="rail_store" aria-label="Store">${spIcon('coin')}<b>STORE</b><span class="sp-chip" id="storeChip">DAILY</span><span class="dot" id="dot_store" hidden></span></button>
          <button type="button" class="sp-iconbtn sp-glass all" id="rail_settings" aria-label="Settings">${spIcon('gear')}</button>
        </div>
      </header>
      <div class="sp-mid" id="spMid"></div>
      <aside class="sp-side" id="spSide">
        <button type="button" class="sp-trackbtn sp-glass" id="trackBtn" aria-label="Choose a track"><canvas class="tpv" id="trackPv" aria-hidden="true"></canvas><span class="sp-track-txt"><small id="trackSub">TRACK</small><b id="trackNm">RANDOM TRACK</b></span></button>
      </aside>
      <main class="sp-page" id="spPage"><section class="pg pg-profile sp-glass" data-pg="profile" hidden></section></main>
    </div>
    <div id="credit" class="sp-cred">Created by Sam Eyde III</div>`;
  initRotateHint();
  const spLobby = $('spLobby');
  let q = applyQuality(root);
  const L = { tab: 'play', visible: false };
  L.mode = store.get('hunt-race-mode') || 'grand'; if (!RACE_MODES[L.mode]) L.mode = 'grand';
  L.track = store.get('hunt-race-track') || 'any'; if (!TRACK_CHOICES.includes(L.track)) L.track = 'any';

  // ---------- the pieces
  const bg = new SpaceBackground($('spBg'));
  const orbit = createMissionOrbit({ avatar: spIcon('profile'), level: 1, missions: [], onTap: () => { chime('tap'); SC.openMissions(refresh); } });
  orbit.el.id = 'tbMissions';
  $('spWho').prepend(orbit.el);
  const radar = createRadar({ blips: [[0.4, -0.3], [-0.5, 0.25], [0.15, 0.6]] });
  $('spWho').append(radar.el);
  const earn = () => { chime('tap'); SC.openEarnInfo(); };
  const coins = createHexBadge({ kind: 'coin', value: 0, onTap: earn }), gems = createHexBadge({ kind: 'gem', value: 0, onTap: earn });
  coins.el.id = 'coinPlus'; gems.el.id = 'gemPlus';
  coins.el.querySelector('b').id = 'coinN'; gems.el.querySelector('b').id = 'gemN';
  $('rail_road').after(gems.el, coins.el);

  const ticker = createTicker({ onTap: (it) => tickerTap(it) });
  spLobby.insertBefore(ticker.el, $('spMid'));

  const pad = createHoloPad({ stats: [], title: '', sub: '' });
  pad.el.classList.add('nameplate', 'tap');
  pad.el.setAttribute('title', 'Garage: change car');
  const stage = pad.el.querySelector('canvas'); stage.id = 'stage';
  pad.el.querySelector('.sp-pad-title b').id = 'npName';
  pad.el.querySelector('.sp-pad-title small').id = 'npRole';
  spLobby.insertBefore(pad.el, $('spMid'));

  const carousel = createCarousel({
    index: Math.max(0, MODE_CARDS.findIndex((c) => c.id === L.mode)),
    onChange: (i, c) => { chime('swipe'); setMode(c.id); },
    onPick: () => { chime('select'); launch.button.focus({ preventScroll: true }); },
  });
  for (const c of carousel.el.querySelectorAll('.sp-card')) c.title = RACE_MODES[c.dataset.id].desc;
  // the mode strip under the cards: one tap to any mode (also the carousel's position marker)
  const strip = document.createElement('div');
  strip.className = 'sp-modes'; strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', 'Mode');
  strip.innerHTML = MODE_CARDS.map((c) => `<button type="button" class="modebtn" data-m="${c.id}" style="--hc:${c.hue}" title="${RACE_MODES[c.id].desc}">${MODE_SHORT[c.id]}</button>`).join('');
  const dots = carousel.el.querySelector('.sp-car-dots'); dots.replaceWith(strip);
  $('spMid').append(carousel.el);

  const crew = createCrew({
    title: 'CREW',
    slots: [{ state: 'empty' }, { state: 'empty' }, { state: 'empty' }],
    bots: botsOn(),
    onBots: () => toggleBots(),
    onPod: () => { chime('select'); SC.openRaceFriends(api); },
  });
  const sw = crew.el.querySelector('.sp-switch'); sw.id = 'fillBots'; sw.classList.add('fillbots');
  $('spSide').append(crew.el);

  const launch = createLaunch({ label: 'LAUNCH', sub: '', onLaunch: () => go() });
  launch.button.id = 'playBtn'; launch.button.dataset.sfx = 'play';
  spLobby.insertBefore(launch.el, $('spPage'));

  const dock = createDock({ active: 'race', onSelect: (k) => dockTo(k) });
  const ORB_ID = { profile: 'tab_profile', garage: 'rail_garage', race: 'tab_play', pass: 'rail_pass', crew: 'rail_friends' };
  for (const [k, id] of Object.entries(ORB_ID)) dock.el.querySelector(`.sp-orb[data-k="${k}"]`).id = id;
  spLobby.append(dock.el);

  // ---------- behaviour
  function botsOn() { const b = $('bots'); return !b || b.checked; }
  function toggleBots() {
    if (L.mode === 'trial') { crew.setBots(false); chime('error'); SC.toastMsg('Time Trial is always just you'); return; }
    const bx = $('bots');
    if (bx) { bx.checked = !bx.checked; bx.dispatchEvent(new Event('change')); }
    chime(botsOn() ? 'on' : 'off');
    refresh();
  }
  function setMode(m) {
    if (!RACE_MODES[m]) return;
    L.mode = m; store.set('hunt-race-mode', m);
    refresh();
  }
  function setTab(k) {
    if (k === L.tab) return;
    lightSweep(() => { L.tab = k; refresh(); slideIn(k === 'profile' ? root.querySelector('.pg-profile') : $('spMid')); });
  }
  function dockTo(k) {
    chime('select');
    if (k === 'race' || k === 'profile') { setTab(k === 'race' ? 'play' : 'profile'); return; }
    lightSweep(() => {}); // the sweep plays over the screen as it slides in
    if (k === 'garage') SC.openDriverSelect(api, refresh);
    else if (k === 'pass') SC.openPass(refresh);
    else if (k === 'crew') SC.openRaceFriends(api);
  }
  function go() {
    unlockAudio(); chime('launch'); pad.burst();
    // a short launch burst on the pad, then the race (the first race starts with the tutorial)
    setTimeout(() => api.startRace({ mode: L.mode, track: L.track }), q.calm ? 60 : 320);
  }
  function tickerTap(it) {
    chime('tap');
    if (it.target === 'shop') { store.set('hunt-store-day', String(shopDay())); openStore(api, refresh, { tab: 'daily' }); }
    else if (it.target === 'crew') SC.openRaceFriends(api);
    else if (it.target === 'trial' && it.track) { L.track = it.track; store.set('hunt-race-track', it.track); carousel.setIndex(MODE_CARDS.findIndex((c) => c.id === 'trial')); setMode('trial'); }
  }
  // live ticker: players online, top racer, trial records (src/space-feed.js) + the real daily-shop reset
  let feed = null;
  function fillTicker() {
    ticker.setItems(tickerItems(feed, { now: Date.now(), shopResetAt: Date.now() + msToShopRefresh(), trackName, targets: { online: 'crew', shop: 'shop', record: 'trial' } }));
    if (L.visible) requestAnimationFrame(() => ticker.layout());
  }
  function pullFeed() { fetchFeed().then((f) => { if (f) { feed = f; fillTicker(); } }); }

  $('rail_store').onclick = () => { store.set('hunt-store-day', String(shopDay())); chime('select'); lightSweep(() => {}); openStore(api, refresh); refresh(); };
  $('rail_road').onclick = () => { chime('select'); SC.openRoad(refresh); };
  $('rail_settings').onclick = () => { chime('tap'); SC.openSettings(api, () => { onQuality(); refresh(); }); };
  $('profileCard').addEventListener('click', (e) => { if (e.target.closest('#guestChip')) return; chime('select'); setTab('profile'); });
  $('guestChip').addEventListener('click', (e) => { e.stopPropagation(); if (e.target.id === 'guestX') { store.set('hunt-guestchip', 'x'); refresh(); } else SC.openProfile(api, refresh, true); });
  pad.el.addEventListener('click', () => { chime('select'); SC.openDriverSelect(api, refresh); });
  strip.addEventListener('click', (e) => { const b = e.target.closest('.modebtn'); if (!b) return; const i = MODE_CARDS.findIndex((c) => c.id === b.dataset.m); if (!carousel.setIndex(i)) { chime('tap'); setMode(b.dataset.m); } });
  $('trackBtn').onclick = () => { chime('tap'); SC.openTrackPicker({ track: L.track, arena: !!RACE_MODES[L.mode].arena, best: A.progress().race?.best || {}, trial: L.mode === 'trial' }, (k) => { L.track = k; store.set('hunt-race-track', k); refresh(); }); };
  // popups: the music ducks (music.js forwards it to the ambient track) and the ticker pauses
  onDuck((on) => { if (on) ticker.pause('popup'); else ticker.resume('popup'); });
  // Low Graphics / Reduce Flashing changed in Settings: every piece follows
  function onQuality() {
    const nq = quality();
    if (nq.low === q.low && nq.calm === q.calm) return;
    q = applyQuality(root, nq); bg.setQuality(q); pad.setQuality(q); ticker.setQuality(q);
    if (L.visible) { pad.stop(); pad.start(); }
  }

  // ---------- data -> UI
  function refresh() {
    const p = A.progress(), id = api.getBrawler(), D = DRIVERS[id] || DRIVERS.volt;
    // top bar
    const lv = levelInfo(p.xp), tro = totalTrophies(p);
    $('pName').textContent = api.prefs.name || 'Racer';
    $('pSub').textContent = `LEVEL ${lv.level}`;
    $('xpFill').style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
    $('pTro').textContent = tro;
    coins.set(p.coins); gems.set(p.gems ?? 0);
    const guest = !A.ACC.user || A.ACC.user.guest;
    $('guestChip').hidden = !guest || store.get('hunt-guestchip') === 'x';
    const ms = missionState(p);
    orbit.set({ level: lv.level, missions: ms.map((m) => ({ f: m.goal ? m.have / m.goal : 0, done: m.done })) });
    orbit.el.id = 'tbMissions';
    orbit.el.classList.toggle('claim', ms.some((m) => m.done && !m.claimed));
    let roadReady = false; for (let at = ROAD_STEP; at <= tro; at += ROAD_STEP) if (roadReward(at) && !p.claimed.includes(at)) roadReady = true;
    $('dot_road').hidden = !roadReady;
    const tier = passTier(p.pass.xp);
    dock.setBadge('pass', PASS.some((r) => r.tier <= tier && (!p.pass.claimed.includes(`free:${r.tier}`) || (p.pass.premium && !p.pass.claimed.includes(`premium:${r.tier}`)))));
    $('dot_store').hidden = store.get('hunt-store-day') === String(shopDay()); // a new daily shop you have not seen
    // the car on the pad
    const look = equippedLook(p, id);
    if (L.look !== look || L.car !== id) { L.look = look; L.car = id; pad.setCar(padCar(id, look)); }
    if (L.statsFor !== id) { L.statsFor = id; pad.setStats(padStats(id)); }
    pad.setTitle(carName(id), `${D.role.toUpperCase()} · ${weaponOf(id).name.toUpperCase()}`);
    pad.el.style.setProperty('--car-neon', look.neon);
    // modes, track, bots
    const i = MODE_CARDS.findIndex((c) => c.id === L.mode);
    if (carousel.index() !== i) carousel.setIndex(i, { silent: true });
    for (const b of strip.querySelectorAll('.modebtn')) { const on = b.dataset.m === L.mode; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); }
    const arena = !!RACE_MODES[L.mode].arena;
    $('trackNm').textContent = trackLabel(L.track, arena).toUpperCase();
    const best = L.mode === 'trial' && L.track !== 'any' ? p.race?.best?.[L.track] : null;
    $('trackSub').textContent = best ? `BEST ${fmtLap(best)}` : arena ? 'ARENA' : 'TRACK';
    if (L.visible && L.tab === 'play') paintPreview($('trackPv'), L.track, arena);
    const solo = L.mode === 'trial';
    crew.setBots(botsOn() && !solo);
    sw.classList.toggle('na', solo); sw.setAttribute('aria-disabled', String(solo));
    launch.setLabel('LAUNCH', launchSub(L.mode, L.track));
    fitLabels();
    // tabs: the play view or the profile page
    const prof = L.tab === 'profile';
    spLobby.classList.toggle('show-page', prof);
    root.querySelector('.pg-profile').hidden = !prof;
    dock.setActive(prof ? 'profile' : 'race');
    if (prof) SC.renderProfilePage(root.querySelector('.pg-profile'), api, refresh);
    makeFocusable(root);
  }
  A.onUser(refresh);

  // one-line labels that must never be cut: shrink to fit (on refresh and resize, never per frame)
  function fitLabels() {
    if (root.hidden) return;
    for (const el of root.querySelectorAll('.sp-launch-txt small, #npName, #npRole, .sp-who-name, .sp-card.on .sp-card-name')) fitText(el);
  }
  // ---------- sizes: measured once per resize, never per frame
  function layout() {
    if (root.hidden) return;
    fitLabels();
    bg.resize(innerWidth, innerHeight);
    carousel.layout(); pad.layout(); ticker.layout(); crew.layout();
    if (L.tab === 'play') paintPreview($('trackPv'), L.track, !!RACE_MODES[L.mode].arena);
  }
  let rz = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
  document.fonts?.ready.then(() => requestAnimationFrame(layout));
  addEventListener('pointermove', (e) => { if (L.visible) bg.setParallax((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); }, { passive: true });

  let stopPresence = null, feedTimer = 0;
  function show() {
    root.hidden = false; L.visible = true;
    onQuality();
    refresh();
    layout();
    requestAnimationFrame(layout); // (after the grid has its final size)
    bg.start(); pad.start();
    fillTicker(); pullFeed();
    clearInterval(feedTimer); feedTimer = setInterval(() => { if (!document.hidden) pullFeed(); }, FEED_MS);
    // the ping answers with the live count (you included): the ticker shows it at once
    if (!stopPresence) stopPresence = startPresence(() => A.ACC.token, { onOnline: (n) => { if (!feed || feed.online !== n) { feed = { ...(feed || {}), online: n }; fillTicker(); } } });
    startAmbient();
  }
  function hide() {
    root.hidden = true; L.visible = false;
    bg.stop(); pad.stop();
    clearInterval(feedTimer); feedTimer = 0;
    if (stopPresence) { stopPresence(); stopPresence = null; }
    stopAmbient(); duckAmbient(false);
  }
  // music needs a user gesture on mobile: start on the first tap in the lobby
  root.addEventListener('pointerdown', () => { unlockAudio(); if (!root.hidden) startAmbient(); });

  window.__spaceLobby = { bg, pad, carousel, ticker, crew, dock, launch, orbit };
  return { show, hide, refresh, get mode() { return L.mode; }, get track() { return L.track; }, get tab() { return L.tab; }, perf: () => ({ q: 0, avg: 0 }) };
}
