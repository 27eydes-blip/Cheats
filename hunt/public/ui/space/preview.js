// Dev preview of every space-lobby piece with demo data (ui/space/preview.html). Not linked from
// the game. URL options: ?low=1 (Low Graphics) &calm=1 (Reduce Flashing) &live=1 (the real
// /api/space/feed instead of demo ticker data) &mode=0..3 &driver=<id> &music=0
// window.__space exposes the pieces and a frame-time meter for tests.
import { SETTINGS } from '../../settings.js';
import { audioCtx } from '../../audio.js';
import { drawCarStage, driverStats } from '../../race/preview.js';
import { DRIVERS, DRIVER_IDS } from '../../race/physics.js';
import { trackName } from '../../race/tracks.js';
import {
  SpaceBackground, createDock, createCarousel, createHoloPad, createCrew, createLaunch, createMissionOrbit, createRadar,
  createTicker, tickerItems, lightSweep, slideIn, chime, startAmbient, duckAmbient, ambientPlaying, ambientDucked, ambientLevel,
  fetchFeed, loadSpaceFonts, applyQuality, spIcon, createHexBadge, MODE_CARDS,
} from './index.js';

const Q = new URLSearchParams(location.search);
if (Q.has('low')) SETTINGS.lowGfx = Q.get('low') === '1';
if (Q.has('calm')) SETTINGS.reduceFlash = Q.get('calm') === '1';
loadSpaceFonts();
const root = document.getElementById('sp'), lobby = document.getElementById('lobby');
let q = applyQuality(root);

// --- background
const bg = new SpaceBackground(document.getElementById('bg'));
bg.resize(innerWidth, innerHeight);
bg.start();
addEventListener('pointermove', (e) => bg.setParallax((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1), { passive: true });

// --- top bar: missions orbit around the avatar, radar, hex badges, settings
const orbit = createMissionOrbit({ avatar: spIcon('profile'), level: 7, missions: [{ f: 1, done: true }, { f: 0.6 }, { f: 0.2 }], onTap: () => chime('tap') });
const radar = createRadar({ blips: [[0.4, -0.3], [-0.5, 0.2], [0.1, 0.6]] });
const who = document.getElementById('who');
who.prepend(orbit.el);
who.append(radar.el);
const coins = createHexBadge({ kind: 'coin', value: 1240, onTap: () => chime('tap') }), gems = createHexBadge({ kind: 'gem', value: 35, onTap: () => chime('tap') });
const gear = document.getElementById('gear');
gear.innerHTML = spIcon('gear');
document.getElementById('topRight').prepend(coins.el, gems.el);

// --- ticker (demo data unless ?live=1)
const pop = document.getElementById('pop');
const ticker = createTicker({ onTap: (it) => { chime('tap'); flash(`ticker: ${it.id} -> ${it.target}`); } });
lobby.append(ticker.el);
const demoFeed = { online: 1284, top: { name: 'Nova_7', wins: 42 }, records: [{ track: 'frozen', name: 'Comet_Kid', time: 83.42 }] };
const targets = { online: 'crew', top: 'profile' };
const fill = (feed) => ticker.setItems(tickerItems(feed, { now: Date.now(), shopResetAt: Q.get('live') === '1' ? null : Date.now() + (3 * 60 + 12) * 60000, trackName, targets }));
if (Q.get('live') === '1') fetchFeed().then(fill); else fill(demoFeed);

// --- car pad
let driver = DRIVERS[Q.get('driver')] ? Q.get('driver') : 'volt';
const carFn = (id) => (g, w, h, t) => drawCarStage(g, w, h, id, t, { ring: false });
const pad = createHoloPad({ drawCar: carFn(driver), stats: driverStats(driver), title: DRIVERS[driver].name.toUpperCase(), sub: DRIVERS[driver].car.toUpperCase() });
lobby.append(pad.el);

// --- mode carousel
const carousel = createCarousel({
  index: Number(Q.get('mode')) || 0,
  onChange: () => chime('swipe'),
  onPick: (c) => { chime('select'); launch.setLabel('LAUNCH', c.name); },
});
lobby.append(carousel.el);

// --- crew pods
const still = (id) => (g, w, h) => drawCarStage(g, w, h, id, 0, { still: true, ring: false });
const slots = [{ state: 'ready', name: 'Flicker', drawCar: still('flicker') }, { state: 'joined', name: 'Wisp', drawCar: still('wisp') }, { state: 'empty' }];
const crew = createCrew({
  slots,
  bots: true,
  onBots: (on) => chime(on ? 'on' : 'off'),
  // demo: tapping a friend who joined marks them ready; an empty pod would open the invite screen
  onPod: (i, s) => { if (s && s.state === 'joined') { s.state = 'ready'; crew.setSlots(slots); chime('ready'); } else chime('tap'); },
});
lobby.append(crew.el);

// --- LAUNCH
const launch = createLaunch({ label: 'LAUNCH', sub: MODE_CARDS[carousel.index()].name, onLaunch: () => { chime('launch'); pad.burst(); } });
lobby.append(launch.el);
carousel.el.addEventListener('click', () => launch.setLabel('LAUNCH', carousel.card().name));
carousel.el.addEventListener('keydown', () => launch.setLabel('LAUNCH', carousel.card().name));

// --- dock: each orb sweeps to its "screen" (here: the garage cycles the driver)
const dock = createDock({
  active: 'race',
  onSelect: (k) => {
    chime('select');
    lightSweep(() => {
      dock.setActive(k);
      if (k === 'garage') { driver = DRIVER_IDS[(DRIVER_IDS.indexOf(driver) + 1) % DRIVER_IDS.length]; pad.setCar(carFn(driver)); pad.setStats(driverStats(driver)); pad.setTitle(DRIVERS[driver].name.toUpperCase(), DRIVERS[driver].car.toUpperCase()); slideIn(pad.el); }
      else slideIn(carousel.el);
    });
  },
});
dock.setBadge('pass', true);
dock.setBadge('crew', 2);
lobby.append(dock.el);

// --- popup: pauses the ticker, ducks the music, flips the quality settings live
const openPop = (on) => { pop.hidden = !on; if (on) { ticker.pause('popup'); duckAmbient(true); chime('tap'); } else { ticker.resume('popup'); duckAmbient(false); chime('back'); } };
gear.onclick = () => openPop(true);
document.getElementById('popClose').onclick = () => openPop(false);
const setQ = (k) => { SETTINGS[k] = !SETTINGS[k]; q = applyQuality(root); bg.setQuality(q); pad.setQuality(q); ticker.setQuality(q); };
document.getElementById('popLow').onclick = () => setQ('lowGfx');
document.getElementById('popCalm').onclick = () => setQ('reduceFlash');
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) openPop(false); });

// music starts with the first tap (browsers need a gesture for sound)
if (Q.get('music') !== '0') addEventListener('pointerdown', () => { if (!ambientPlaying()) startAmbient(); }, { once: true });

// --- sizes: measured once per resize, never per frame
function layout() { bg.resize(innerWidth, innerHeight); carousel.layout(); pad.layout(); ticker.layout(); crew.layout(); }
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
requestAnimationFrame(() => { layout(); pad.start(); });
document.fonts?.ready.then(() => requestAnimationFrame(layout)); // web fonts change text widths

function flash(msg) { console.log('[space preview]', msg); }

// --- frame meter for the perf test (rAF deltas)
let deltas = [], lastT = 0;
function meter(t) { if (lastT) deltas.push(t - lastT); lastT = t; if (deltas.length > 4000) deltas = deltas.slice(-2000); requestAnimationFrame(meter); }
requestAnimationFrame(meter);
window.__space = {
  bg, pad, carousel, crew, ticker, dock, launch, orbit, radar, lightSweep, chime,
  ambient: { playing: ambientPlaying, ducked: ambientDucked, level: ambientLevel, state: () => audioCtx()?.state || 'none' },
  quality: () => q,
  resetPerf() { deltas = []; lastT = 0; },
  perf() {
    const s = deltas.slice().sort((a, b) => a - b), med = s.length ? s[Math.floor(s.length / 2)] : 0;
    return { frames: deltas.length, medianMs: med, medianFps: med ? 1000 / med : 0, p95Ms: s.length ? s[Math.floor(s.length * 0.95)] : 0, dpr: devicePixelRatio, bgFrames: bg.frames };
  },
};
