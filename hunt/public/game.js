// Client: lobby, Quick Hunt + Free Play networking, own-player prediction/reconciliation,
// per-connection snapshot interpolation, zone handoff, twists/events/mode HUD, effects.
import {
  BRAWLERS, BRAWLER_IDS, DT, TICK_RATE, CRATE, PLAYER_R, ARENA_SIZE, ZONES, WORLDS,
  worldId, worldsInDisplayOrder, generateArena, generateWorld, applyMove, attackDirs, tileAt, isSolidTile,
  moveStats, zoneAt, zoneBounds, inHub, worldKeyAt, PREDICTED_KINDS, DAY_MS,
} from './shared.js';
import { EVENTS } from './events/index.js';
import { Input } from './input.js';
import * as R from './render.js';
import { SETTINGS, setSetting, pulse } from './settings.js';
import * as A from './account.js';
import { createLobby } from './ui/lobby.js';
import { createMatchmaking, createResults, showIntro, createEarned, earnedHtml, hasUnlocks, mergeEarned } from './ui/flow.js';
import './ui/fx.js';
import { levelInfo, loadoutFor } from './progression.js';
import { TITLES, EMOTES } from './catalog.js';
import { sfx, falloff } from './audio.js';
import { setMusicVolume } from './ui/music.js';
import { pickAimTarget, assistAngle } from './aim.js';
import { HUNTER_PAL } from './art/hunters.js';
import { ShotSim, PList, resetPart, resetText } from './shots.js';
import { WEAPONS, WEAPON_IDS, WKIND, withPerks, shotAngles, SWAP_TIME } from './weapons.js';
import { GADGETS } from './power.js';
import { drawMiniMap, drawFullMap } from './minimap.js';
import { envState, drawLandmarks, drawAtmosphere, drawCompass, ZONE_INFO, zoneLabel } from './world-fx.js';
import { startTense, stopTense } from './ui/music.js';
import { WallArt } from './art/walls.js';
import { artFor } from './art/themes.js';
import { SPAWNS, spawnHasCover, SPAWN_COVER_DIST, blocksMove, TILE as TILE_ } from './shared.js';


const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
// wall/cover art cache; rebuilt from scratch if the canvas context is lost
const art = new WallArt();
const resetArt = () => { art.reset(); R.resetGroundCache(G?.map); R.resetGroundCache(menuMap); };
canvas.addEventListener('contextlost', (e) => { e.preventDefault(); resetArt(); });
canvas.addEventListener('contextrestored', resetArt);
// a GPU reset usually hits every canvas: the lobby backdrop rebuilds its own caches on its own event
document.getElementById('lobbyBg')?.addEventListener('contextrestored', resetArt);
window.__huntArt = { art, artFor };
const TICK_MS = 1000 / TICK_RATE;
const INTERP_MS = 110;
const maxFor = (mode) => (mode === 'squad' ? 6 : mode === 'bighunt' ? 20 : 10);
const MODE_INFO = {
  squad: { name: 'SQUAD HUNT', desc: '3v3! Kills fill your team pot. Highest pot after 3:00 wins.' },
  bighunt: { name: 'BIG HUNT', desc: '20 hunters, one huge arena. Last one standing wins!' },
  showdown: { name: 'SHOWDOWN', desc: 'Last hunter standing wins. The poison closes in!' },
  bounty: { name: 'BOUNTY RUSH', desc: 'Steal bounties! Highest bounty after 2:00 wins.' },
  hunted: { name: 'HUNTED', desc: 'Everyone hunts the target. Take them down to become it!' },
  crystals: { name: 'CRYSTAL GRAB', desc: 'Grab 10 crystals and hold them for 10 seconds!' },
  freeplay: { name: 'FREE PLAY', desc: '' },
  range: { name: 'TEST RANGE', desc: 'Try your weapons on target dummies. Swap with R or the ⇄ button.' },
};
const worldName = (key) => WORLDS[worldId(key)]?.name || key;
// a mode this client has never heard of (the server is newer): still gets a name
const modeInfo = (mode) => MODE_INFO[mode] || { name: String(mode || 'match').toUpperCase(), desc: '' };
const bulletKind = (k) => (k === 20 ? 'cage' : k >= WKIND ? WEAPON_IDS[k - WKIND] : BRAWLER_IDS[k]);
const predicted = (k) => k !== 20 && k < WKIND && PREDICTED_KINDS.includes(BRAWLERS[BRAWLER_IDS[k]]?.attack.kind);
// own shots we draw instantly (client prediction): signature straight shots + weapon bullets
const predictedKind = (k) => predicted(k) || (k >= WKIND && localPredicts(WEAPONS[WEAPON_IDS[k - WKIND]]));
const localPredicts = (w) => !!w && (w.kind === 'shot' || w.kind === 'charge');
const isSniper = (w, sig) => (sig ? G.brawler === 'wisp' : w.cls === 'sniper');

let W = 0, H = 0, DPR = 1;
// Adaptive resolution: if frames get slow, render at a lower pixel ratio (and back up when there's room).
const DPR_STEPS = [2, 1.5, 1.25, 1];
let dprStep = 0, frameAvg = 16.7, slowFor = 0, fastFor = 0;
function adaptResolution(dtMs) {
  frameAvg += (dtMs - frameAvg) * 0.05;
  if (frameAvg > 18.5) { slowFor += dtMs; fastFor = 0; } else if (frameAvg < 13) { fastFor += dtMs; slowFor = 0; } else { slowFor = fastFor = 0; }
  if (slowFor > 1500 && dprStep < DPR_STEPS.length - 1) { dprStep++; slowFor = 0; resize(); }
  else if (fastFor > 8000 && dprStep > 0) { dprStep--; fastFor = 0; resize(); }
}
// notch / home-bar insets, for things drawn on the canvas (CSS elements use env() directly)
const saProbe = document.createElement('div');
saProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(saProbe);
let SA = { t: 0, r: 0, b: 0, l: 0 };
function readSafeArea() {
  const cs = getComputedStyle(saProbe), n = (v) => parseFloat(v) || 0;
  SA = { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}
function resize() {
  DPR = SETTINGS.lowGfx ? 1 : Math.min(DPR_STEPS[dprStep], devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  readSafeArea();
  input.layout(W, H, SA);
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ prefs, stats, lobby
const prefs = (() => { try { const v = JSON.parse(localStorage.getItem('hunt') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('hunt', JSON.stringify(prefs)); } catch {} };
if (!prefs.stats || typeof prefs.stats !== 'object') prefs.stats = {}; // keyed by numeric world id (stable: WORLDS is append-only)
let selBrawler = BRAWLERS[prefs.brawler] ? prefs.brawler : 'volt';
$('name').value = prefs.name || '';
$('room').value = prefs.room || '';
$('bots').checked = prefs.bots !== false;

function stat(worldKey) { const id = worldId(worldKey); return (prefs.stats[id] ||= { games: 0, wins: 0, kills: 0, best: 0 }); }
function statRows() {
  const rows = worldsInDisplayOrder().map((w) => {
    const s = prefs.stats[w.id] || {};
    return `<tr><td>${w.name}</td><td>${s.games || 0}</td><td>${s.wins || 0}</td><td>${s.kills || 0}</td><td>★${s.best || 0}</td></tr>`;
  }).join('');
  return `<tr><th>World</th><th>Games</th><th>Wins</th><th>KOs</th><th>Best</th></tr>${rows}`;
}
const booted = A.boot();

function show(screen) {
  if (screen === 'lobby') UI.lobby.show(); else UI.lobby.hide();
  if (screen !== 'waiting') UI.mm.hide();
  if (screen !== 'end') UI.res.hide();
  $('dead').hidden = screen !== 'dead';
  $('hud').hidden = !(G.phase === 'play' || G.phase === 'dead' || G.phase === 'end');
  if (screen) $('specBar').hidden = true;
  $('menuBtn').hidden = G.phase !== 'play';
  if (G.phase !== 'play') closeMenu(); else if (menu.open) input.enabled = false; // (a reconnect re-enables input)
  if (screen !== 'lobby' && screen !== 'waiting') { const back = UI.earned.take(); if (back) unseen = mergeEarned(back, unseen); }
  document.body.classList.toggle('ingame', G.phase !== 'menu');
}

let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ state
const G = {
  phase: 'menu', kind: 'quick', conns: new Map(), myId: 0, brawler: 'volt', map: null, roster: {}, crateHp: new Map(),
  pending: [], seq: 0, pred: { x: 0, y: 0, mvx: 0, mvy: 0 }, prev: { x: 0, y: 0 }, err: { x: 0, y: 0 }, me: null, mods: {},
  localBullets: [], localBurst: null, localCd: 0, superCd: 0, parts: new PList(resetPart, 260), rings: [], texts: new PList(resetText, 28), flash: {}, shake: 0, hurt: 0,
  shots: new ShotSim(), recoil: new Map(), nudge: { x: 0, y: 0 }, hitMark: null, wantSlot: null, wantT: 0, localCd2: 0, localBurst2: null, bolts: [], myPerks: {},
  spectate: 0, view: { others: [], bullets: [], cubes: [], crystals: [] }, cam: { x: 1000, y: 1000 }, acc: 0, ping: 0,
  pings: [], handoff: null, online: {}, modeKey: 'showdown', world: 'meadow', retries: 0, room: '', botsOn: true, facing: 0,
  moving: false, slashes: [], worms: [], slashFlip: false, lastTp: 0, lastSk: 0, deadMsg: null, ticks: 0, opts: {}, bannerUntil: 0,
};

const menu = { open: false, timer: 0 }, STILL = { x: 0, y: 0 };
function resetMatchState() {
  Object.assign(G, {
    myId: 0, secret: null, matchName: null, map: null, zoneSlot: null, nightOn: undefined, env: null, roster: {}, crateHp: new Map(), pending: [], seq: 0, me: null, mods: {}, err: { x: 0, y: 0 },
    localBullets: [], localBurst: null, localCd: 0, superCd: 0, rings: [], slashes: [], worms: [], lastTp: 0, flash: {}, shake: 0, hurt: 0,
    hitMark: null, wantSlot: null, wantT: 0, localCd2: 0, localBurst2: null, bolts: [],
    spectate: 0, view: { others: [], bullets: [], cubes: [], crystals: [] }, pings: [], handoff: null, online: {}, deadMsg: null, lastSk: 0,
  });
  G.parts.clear(); G.texts.clear(); G.shots.clear(); G.recoil.clear();
  { const lo = loadoutFor(A.progress()); G.myPerks = lo.w2 ? { [lo.w2]: lo.perks } : {}; } // (for predicting your own shots)
  $('feed').innerHTML = '';
  $('specBar').hidden = true; $('deadEarned').hidden = true;
  UI.res?.reset?.();
  bulletAng.clear();
  closeFullMap(); if (G.bloodOn) { G.bloodOn = false; stopTense(); }
}

// ------------------------------------------------------------------ connections
const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
function openConn(key, path, o = {}) {
  const ws = new WebSocket(wsBase() + path);
  const c = { key, ws, zone: o.zone || null, primary: !!o.primary, snaps: [], off: null, fxN: 0, ev: null, last: null, open: false };
  G.conns.set(key, c);
  ws.onopen = () => { c.open = true; if (G.handoff && G.handoff.zone === c.zone) claim(); };
  ws.onmessage = (e) => { if (G.conns.get(key) === c) { c.lastMsg = performance.now(); onMsg(c, JSON.parse(e.data)); } };
  ws.onclose = () => {
    if (G.conns.get(key) !== c) return;
    G.conns.delete(key);
    if (c.rejoin && !c.welcomed) return; // a reconnect attempt failed: reconnect() tries again
    if ((c.primary || (G.handoff && G.handoff.zone === c.zone)) && G.phase !== 'menu' && G.phase !== 'end') lostConnection(c);
  };
  return c;
}
// quitting on purpose: tell the server so it doesn't hold our spot for a reconnect
function closeAll() {
  const cs = [...G.conns.values()]; G.conns.clear();
  // leaving a match that is still going: the server answers the bye with what the match earned us,
  // so that one socket stays open a moment longer to hear it
  const owed = G.kind === 'quick' && (G.phase === 'play' || G.phase === 'dead' || G.phase === 'end') && !!A.ACC.token;
  for (const c of cs) {
    try {
      if (c.open) c.ws.send('{"t":"bye"}');
      if (c.open && c.primary && owed) farewell(c.ws); else c.ws.close();
    } catch {}
  }
  stopReconnect();
}
function farewell(ws) {
  const done = () => { clearTimeout(t); try { ws.close(); } catch {} };
  const t = setTimeout(done, 5000);
  ws.onclose = () => clearTimeout(t);
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.t === 'progress') { done(); onProgress(m); } };
}

// ------------------------------------------------------------------ rewards the player has not seen yet
// The results screen shows a match's rewards in full. A player who leaves before it (LOBBY or PLAY AGAIN
// on the death screen, LEAVE MATCH) still gets told: a short line on the death screen, a card over the
// lobby, and any level-up / unlock cards are kept for the next lobby visit.
let unseen = null;
function onProgress(m) {
  if (A.ACC.user) A.setUser({ ...A.ACC.user, progress: m.progress });
  UI.res.progress(m);
  if (G.phase === 'end') return; // the results screen is about to show it (or already does)
  unseen = mergeEarned(unseen, m);
  if (G.phase === 'play' || G.phase === 'dead') { $('deadEarned').innerHTML = earnedHtml(m); $('deadEarned').hidden = false; }
  else showUnseen();
}
function showUnseen() {
  if (!unseen || (G.phase !== 'menu' && G.phase !== 'waiting')) return;
  UI.earned.show(unseen);
  unseen = null;
}

// ------------------------------------------------------------------ reconnect (lost signal, app switch)
const RECONNECT_MS = 22000; // a bit less than the server's grace period
let rc = null;
function stopReconnect() { if (rc) { clearTimeout(rc.timer); rc = null; } }
// the matchmaking socket dropped: queue up again, waiting longer each time (0.5 s doubling to 8 s),
// and give up after MM_TRIES so a server that is down is never hammered
const MM_TRIES = 5, MM_CONNECT_MS = 4000;
let mmFails = 0;
function lostConnection(c) {
  if (G.phase === 'waiting' && G.kind === 'quick') {
    clearTimeout(retryTimer);
    if (++mmFails > MM_TRIES) { toMenu(); toast('Can\u2019t reach the server. Check your connection and try again.', 4500); return; }
    UI.mm.lost();
    retryTimer = setTimeout(() => { if (G.phase === 'waiting') startQuick(G.opts, true); }, Math.min(8000, 500 * 2 ** (mmFails - 1)));
    return;
  }
  if (!G.secret || !G.myId) { toast('Connection lost'); toMenu(); return; }
  if (rc) return;
  rc = { t0: Date.now(), zone: c.zone, tries: 0, timer: 0 };
  input.reset();
  reconnectTry();
}
function reconnectTry() {
  if (!rc) return;
  if (Date.now() - rc.t0 > RECONNECT_MS) { rejoinFailed(); return; }
  toast('Reconnecting…', 3000);
  rc.tries++;
  const q = new URLSearchParams({ rejoin: String(G.myId), secret: G.secret });
  let c;
  if (G.kind === 'free') {
    G.handoff = null; // an interrupted zone transfer can't be resumed; the zone we lost tells us if we're still there
    q.set('slot', rc.zone);
    c = openConn(rc.zone, '/zone?' + q, { zone: rc.zone, primary: true });
  } else {
    q.set('match', G.matchName || '');
    c = openConn('main', '/ws?' + q, { primary: true });
  }
  c.rejoin = true;
  rc.timer = setTimeout(() => { if (rc && !c.welcomed) { G.conns.delete(c.key); try { c.ws.close(); } catch {} reconnectTry(); } }, Math.min(4000, 1000 + rc.tries * 700));
}
function rejoinFailed() {
  const kind = G.kind;
  stopReconnect();
  if (kind === 'free') { toast('Connection lost — rejoining Free Play'); startFree(); } else { toast('Connection lost — the match is over'); toMenu(); }
}
const primary = () => { for (const c of G.conns.values()) if (c.primary) return c; return null; };
const isOpen = (c) => c && c.open && c.ws.readyState === 1;
function send(o) { const c = primary(); if (isOpen(c) && !G.handoff) c.ws.send(JSON.stringify(o)); }
setInterval(() => { for (const c of G.conns.values()) if (isOpen(c)) c.ws.send(JSON.stringify({ t: 'ping', c: performance.now() })); }, 2000);
// A socket on a phone that loses signal often never fires onclose. The server sends several
// messages a second, so a few seconds of silence means the connection is gone: reconnect.
const SILENT_MS = 3500;
setInterval(() => {
  if (G.phase === 'menu' || G.phase === 'end' || rc) return;
  const c = primary();
  if (!c || !c.open || !c.lastMsg || G.handoff) return;
  if (performance.now() - c.lastMsg < SILENT_MS) return;
  G.conns.delete(c.key);
  try { c.ws.close(); } catch {}
  lostConnection(c);
}, 500);
// coming back to the app: timers were frozen, so give the socket a moment to prove it's alive
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const now = performance.now();
  for (const c of G.conns.values()) if (c.lastMsg) c.lastMsg = Math.max(c.lastMsg, now - SILENT_MS + 1500);
});

function readForm() {
  const name = $('name').value.trim().slice(0, 14) || 'Hunter';
  const room = $('room').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  prefs.name = name; prefs.room = room; prefs.bots = $('bots').checked; savePrefs();
  return { name, room };
}

function startQuick(opts = G.opts, retrying = false) {
  G.opts = opts;
  if (!retrying) mmFails = 0;
  if (unseen && !$('deadEarned').hidden && !hasUnlocks(unseen)) unseen = null; // (already read on the death screen)
  closeAll();
  resetMatchState();
  const { name, room: formRoom } = readForm();
  const room = opts.room ?? formRoom;
  G.kind = 'quick'; G.room = room; G.brawler = selBrawler;
  const q = new URLSearchParams({ name, brawler: selBrawler });
  if (A.ACC.token) q.set('token', A.ACC.token);
  devParams(q);
  if (room) q.set('room', room);
  if (opts.skip) q.set('skip', opts.skip);
  if (room && !$('bots').checked && !opts.world) q.set('bots', '0');
  for (const k of ['world', 'mode', 'lobby', 'ev']) if (opts[k]) q.set(k, opts[k]);
  if (opts.tryW) { q.set('try', opts.tryW); if (!q.get('wpn') && !A.ACC.token) q.set('wpn', opts.tryW); }
  const c = openConn('main', '/ws?' + q, { primary: true });
  // a phone with no signal can leave a connect hanging without ever failing: count that as lost too
  setTimeout(() => { if (G.conns.get('main') === c && !c.open && G.phase === 'waiting') { G.conns.delete('main'); try { c.ws.close(); } catch {} lostConnection(c); } }, MM_CONNECT_MS);
  G.phase = 'waiting';
  show('waiting');
  UI.mm.show({ brawler: selBrawler, skin: A.progress().equipped['skin:' + selBrawler] || null, label: room ? `ROOM ${room}` : (MODE_INFO[opts.mode]?.name || 'QUICK HUNT') });
  if (retrying) UI.mm.lost(); // still not through: keep saying so until the server answers
}

// ?wpn=&mast= are honoured only by a local dev server (HUNT_DEV), for tests and screenshots
function devParams(q) { const u = new URLSearchParams(location.search); for (const k of ['wpn', 'mast', 'pw', 'gd', 'sp']) if (u.get(k)) q.set(k, u.get(k)); }
function startFree() {
  closeAll();
  resetMatchState();
  const { name } = readForm();
  G.kind = 'free'; G.brawler = selBrawler; G.modeKey = 'freeplay';
  G.map = generateWorld();
  // everyone arrives at the safe hub in the middle of the world (?at=x,y: local dev only)
  const at = (new URLSearchParams(location.search).get('at') || '').split(',').map(Number);
  const slot = at.length === 2 && at.every(Number.isFinite) ? zoneAt(at[0], at[1]) : 'c';
  const zq = new URLSearchParams({ slot, join: '1', name, brawler: selBrawler, ...(A.ACC.token ? { token: A.ACC.token } : {}), ...(at.length === 2 ? { at: at.join(',') } : {}) });
  devParams(zq);
  openConn(slot, `/zone?${zq}`, { zone: slot, primary: true });
  G.phase = 'play';
  input.enabled = true; input.reset();
  show(null);
  const myConn = G.conns.get(slot);
  setTimeout(() => { if (G.kind === 'free' && G.phase === 'play' && !G.me && !rc && G.conns.get(slot) === myConn) { toast('Could not reach Free Play — try again'); toMenu(); } }, 12000);
}

let retryTimer = 0;
function toMenu() {
  clearTimeout(retryTimer);
  closeFullMap(); if (G.bloodOn) { G.bloodOn = false; stopTense(); }
  closeAll(); // (before the phase changes: it looks at the phase to know if a result is still owed)
  G.phase = 'menu';
  $('rangeLeave').hidden = true;
  input.enabled = false; input.reset();
  show('lobby');
  showUnseen();
}

// Free Play: keep observer sockets to zones near us, so we see across borders.
function manageZones() {
  if (G.kind !== 'free' || !G.me) return;
  const p = G.pred;
  for (const z of ZONES) {
    const b = zoneBounds(z.slot);
    const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dy = Math.max(b.y0 - p.y, 0, p.y - b.y1), d = Math.hypot(dx, dy);
    const c = G.conns.get(z.slot);
    const keep = c && (c.primary || (G.handoff && G.handoff.zone === z.slot));
    if (!c && d < 950) openConn(z.slot, `/zone?slot=${z.slot}&x=${Math.round(p.x)}&y=${Math.round(p.y)}`, { zone: z.slot });
    else if (c && !keep && d > 1300) { G.conns.delete(z.slot); try { c.ws.close(); } catch {} }
  }
  if (G.ticks % 5 === 0) for (const c of G.conns.values()) if (!c.primary && isOpen(c)) c.ws.send(JSON.stringify({ t: 'pos', x: Math.round(p.x), y: Math.round(p.y) }));
}

function claim() {
  const h = G.handoff;
  if (!h || h.sent) return;
  let c = G.conns.get(h.zone);
  if (!c) c = openConn(h.zone, `/zone?slot=${h.zone}&x=${Math.round(G.pred.x)}&y=${Math.round(G.pred.y)}`, { zone: h.zone });
  if (!c.open) return;
  h.sent = true;
  const pend = G.pending.filter((q) => q.s > h.ack).map(({ s, mx, my, ax, ay }) => ({ s, mx, my, ax, ay }));
  c.ws.send(JSON.stringify({ t: 'claim', token: h.token, pend }));
}

// ------------------------------------------------------------------ messages
function onMsg(c, m) {
  switch (m.t) {
    case 'welcome':
      if (m.observer) break;
      if (m.secret) G.secret = m.secret;
      if (m.sv && G.clockForced == null) G.svOff = m.sv - Date.now();
      if (m.match) G.matchName = m.match;
      if (m.rejoin) {
        c.welcomed = true;
        stopReconnect(); toast('Reconnected!', 1500);
        G.pending = []; G.err = { x: 0, y: 0 };
        if (G.kind === 'free') { G.myId = m.id; break; }
      }
      G.myId = m.id; G.retries = 0; mmFails = 0; G.botsOn = m.bots;
      if (m.mode) G.modeKey = m.mode;
      if (m.world) G.world = m.world;
      if (G.phase === 'waiting') UI.mm.update({ players: 1, max: maxFor(m.mode), mode: MODE_INFO[m.mode]?.name, world: m.world });
      break;
    case 'lobby':
      UI.mm.update({ players: m.players.length, max: maxFor(m.mode), startIn: m.startIn, mode: MODE_INFO[m.mode]?.name, world: m.world, bots: m.bots !== false });
      break;
    case 'retry':
      G.conns.delete(c.key); // the server closes this socket next: that's expected, not a lost connection
      if (!G.room && G.retries++ < 5) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { if (G.phase === 'waiting') startQuick({ ...G.opts, skip: m.match }); }, 150); }
      else { toast(m.reason + (G.room ? ' — try again when it ends' : '')); toMenu(); }
      break;
    case 'start':
      $('rangeLeave').hidden = m.mode !== 'range';
      if (m.rejoin && G.map && G.phase !== 'menu') {
        // back in the same match after a reconnect: keep our map, HUD and effects
        G.myId = m.you;
        if (G.phase !== 'dead') { G.phase = 'play'; input.enabled = true; input.reset(); show(null); }
        break;
      }
      G.myId = m.you; G.modeKey = m.mode; G.world = m.world;
      G.map = generateArena(m.seed, m.world, m.players || 10);
      if (m.open) for (let y = 1; y < G.map.gh - 1; y++) for (let x = 1; x < G.map.gw - 1; x++) G.map.t[y * G.map.gw + x] = 0;
      G.phase = 'play';
      input.enabled = true; input.reset();
      show(null);
      UI.showIntro({ world: m.world, modeName: modeInfo(m.mode).name, brawler: selBrawler, skin: A.progress().equipped['skin:' + selBrawler] || null });
      setTimeout(() => showBanner(modeInfo(m.mode).name, m.mode === 'range' ? MODE_INFO.range.desc : `${modeInfo(m.mode).desc} (${m.botLevel || 'normal'} bots)`, '#ffd23f', 2500), 2200);
      break;
    case 'ro':
      if (m.add) Object.assign(G.roster, m.add);
      break;
    case 'st':
      for (const [idx, type] of m.td) applyTile(idx, type);
      for (const [idx, hp] of m.ch) G.crateHp.set(idx, hp);
      if (m.ev && EVENTS[m.ev.id]) c.ev = { ...m.ev, at: performance.now() };
      break;
    case 'ev':
      if (m.id && !EVENTS[m.id]) break; // unknown event (client older than the server): ignore it
      c.ev = m.id ? { ...m, at: performance.now() } : null;
      if (c.primary && m.id) sfx(m.ph === 'warn' ? 'event_warn' : 'event_on', 0.8);
      if (c.primary && m.id && m.ph === 'on') { const def = EVENTS[m.id]; showBanner(def.name, def.desc, def.color, 2500); }
      break;
    case 's': onSnap(c, m); break;
    case 'kill':
      addFeed(m);
      if (m.kid === G.myId && G.me) {
        const me = renderMe();
        G.texts.push({ x: me.x, y: me.y - 110, txt: 'KO!', color: '#ffd23f', life: 1.1, max: 1.1, size: 34, pop: true });
        if (m.st > 0) { G.texts.push({ x: me.x, y: me.y - 145, txt: `+★${m.st + 1} BOUNTY STOLEN`, color: '#ffe066', life: 1.4, max: 1.4, size: 18, pop: true }); sfx('bounty'); }
      }
      break;
    case 'dead':
      if (m.respawn > 0) { G.deadMsg = m; G.spectate = m.killerId; break; }
      G.phase = 'dead'; closeMenu(); $('menuBtn').hidden = true;
      G.spectate = m.killerId;
      input.enabled = false; input.reset();
      $('deadRank').textContent = '#' + m.rank;
      $('deadBy').textContent = `Eliminated by ${m.killer}`;
      setTimeout(() => { if (G.phase === 'dead') show('dead'); }, 1200);
      break;
    case 'end': onEnd(m); break;
    case 'handoff':
      c.primary = false;
      G.handoff = { zone: m.zone, token: m.token, ack: m.ack };
      claim();
      break;
    case 'claimed':
      c.primary = true;
      G.handoff = null;
      break;
    case 'claimfail': toast('Zone transfer failed — rejoining'); startFree(); break;
    case 'rejoinfail': if (rc) { G.conns.delete(c.key); rejoinFailed(); } break;
    case 'online': G.online = m.zones; if (m.sv && G.clockForced == null) G.svOff = m.sv - Date.now(); break;
    case 'progress': onProgress(m); break;
    case 'pong': if (c.primary) { G.ping = Math.round(performance.now() - m.c); $('ping').textContent = `${G.ping} ms`; } break;
  }
}

function applyTile(idx, type) {
  G.map.t[idx] = type;
  if (type !== CRATE) G.crateHp.delete(idx);
}

function onEnd(m) {
  const won = m.winTeam !== undefined ? !!m.won : m.rank === 1;
  G.phase = 'end'; closeMenu(); $('menuBtn').hidden = true;
  input.enabled = false; input.reset();
  const s = stat(G.world);
  s.games++; if (won) s.wins++; s.kills += m.kills; s.best = Math.max(s.best, G.me?.bb || 0, m.bounty);
  savePrefs();
  const msg = m.winTeam !== undefined ? `Team pot ★${m.pots[m.team]} vs ★${m.pots[3 - m.team]}` : won ? `VICTORY! ${modeInfo(m.mode).name} on ${worldName(G.world)}` : `${m.winner || 'Nobody'} won ${modeInfo(m.mode).name}.`;
  const scoreLbl = { bounty: '★', hunted: 'pts', crystals: '💎' }[m.mode];
  const rows = m.results.map(([n, b, r, k, bot, id, be, sc, tm]) =>
    `<li class="${id === G.myId ? 'me' : ''} ${tm ? (tm === m.team ? 'mate' : 'foe') : ''}"><span class="r">#${r}</span>${esc(n)}${bot ? ' 🤖' : ''}<span class="k">${scoreLbl ? `${sc} ${scoreLbl} · ` : ''}${k} KO</span></li>`).join('');
  // (the results screen shows the rewards in full, unlock cards included: nothing left to carry over)
  setTimeout(() => { if (G.phase === 'end') { show('end'); unseen = null; UI.res.show(m, { msg, rows, won }); sfx(won ? 'victory' : 'defeat'); startPose(won); } }, won ? 1600 : 600);
}

// short victory pose (or a sulk) on the end screen
function startPose(won) {
  const cv = $('pose'), c2 = cv.getContext('2d');
  const d = Math.min(2, devicePixelRatio || 1);
  cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
  const skin = G.roster[G.myId]?.[3]?.skin, t0 = performance.now();
  const loop = (now) => {
    if (G.phase !== 'end' || UI.res.el.hidden) return;
    const t = (now - t0) / 1000;
    c2.setTransform(d, 0, 0, d, 0, 0); c2.clearRect(0, 0, cv.width, cv.height);
    const w = cv.clientWidth, h = cv.clientHeight;
    const fit = Math.min(4, h / 80, w / 70); // brawler is ~70 units tall at scale 1
    let y = h * 0.66, face = 0.3, sc = fit;
    if (won) {
      const k = Math.min(1, t / 1.2);
      y -= (Math.abs(Math.sin(t * 5)) * 18 * (1 - k * 0.5) + (k < 1 ? Math.sin(k * Math.PI) * 30 : 0)) * (fit / 1.6);
      face = t < 1.2 ? t * 6 : Math.sin(t * 2) * 0.6 - Math.PI / 2;
      if (!SETTINGS.reduceFlash) for (let i = 0; i < 8; i++) { const a = t * 2 + i; R.outlinedText(c2, '★', w / 2 + Math.cos(a) * 70, h * 0.45 + Math.sin(a * 1.3) * 30, 16, '#ffd23f'); }
    } else { y += Math.sin(t * 2) * 2; face = Math.PI / 2 + Math.sin(t) * 0.3; sc = fit * 0.9; }
    R.drawBrawler(c2, G.brawler, w / 2, y, face, t, { scale: sc, skin, moving: won });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function addFeed(m) {
  const el = document.createElement('div');
  el.className = 'kf';
  const cls = (id) => (id === G.myId ? 'me' : '');
  el.innerHTML = `<span class="${cls(m.kid)}">${esc(m.k)}</span><span class="x">✖</span><span class="${cls(m.vid)}">${esc(m.v)}</span>${m.st > 0 && m.kid ? ` <b style="color:#ffd23f">+★${m.st + 1}</b>` : ''}`;
  const feed = $('feed');
  feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 4500);
}

function showBanner(name, desc, color, ms) {
  const b = $('evBanner');
  b.hidden = false; b.classList.remove('small');
  $('evName').textContent = name; $('evName').style.color = color; $('evDesc').textContent = desc;
  G.bannerUntil = performance.now() + ms;
}

// ------------------------------------------------------------------ snapshots
function onSnap(c, m) {
  if (!G.map) return;
  const now = performance.now();
  const off = now - m.n * TICK_MS;
  if (c.off == null || off < c.off) c.off = off; else c.off += (off - c.off) * 0.02;
  const p = new Map();
  for (const e of m.p) p.set(e[0], e);
  const st = c.statics || (c.statics = new Map());
  if (m.px) for (const e of m.px) st.set(e[0], e); // slow player fields (sent when they change)
  c.snaps.push({ n: m.n, p, cu: m.cu, cy: m.cy, fx: m.fx || NONE, mn: m.mn || NONE, wd: m.wd || null });
  // BULLETS: one 'fired' event each; we simulate them (own predicted shots are already flying)
  if (m.bn) for (const r of m.bn) {
    if (r[8] === G.myId && predictedKind(r[6])) continue;
    if (G.shots.fired(c.key, r) && r[8] !== G.myId) shotFeel(r[8], r[1], r[2], Math.atan2(r[4], r[3]), r[6]);
  }
  if (m.bd) for (const r of m.bd) G.shots.ended(c.key, r, m.n);
  c.flares = m.fl || null;
  if (c.primary && m.hm) { // HIT MARKER from the server
    const kind = m.hm & 2 ? 'kill' : m.hm & 4 ? 'crit' : 'hit';
    G.hitMark = { t: 0.3, kind };
    sfx(kind === 'kill' ? 'killmark' : kind === 'crit' ? 'critmark' : 'hitmark', 0.9);
  }
  if (c.snaps.length > 40) c.snaps.shift();
  if (m.td) for (const [idx, type] of m.td) applyTile(idx, type);
  if (m.ch) for (const [idx, hp] of m.ch) G.crateHp.set(idx, hp);
  c.last = m;
  if (m.ev && c.ev && c.ev.id === m.ev[0]) { c.ev.ph = m.ev[1]; c.ev.tl = m.ev[2]; }
  if (G.pings.length > 200) G.pings = G.pings.filter((p) => now - p.t0 < 3000);
  if (m.pg) for (const [id, x, y, bt] of m.pg) G.pings.push({ id, x, y, bt, t0: now, target: !!(m.md && m.md.tg === id) });
  if (c.primary) G.mates = m.mates || [];
  if (c.primary && m.me) reconcile(m);
}

function primaryMods() {
  const c = primary();
  const e = c && c.ev;
  return e && e.ph === 'on' && EVENTS[e.id]?.mods ? EVENTS[e.id].mods(e.p) : {};
}

function reconcile(m) {
  const first = !G.me;
  const me = first ? { ...m.me } : Object.assign(G.me, m.me); // the server only sends what changed
  G.me = me; G.myId = me.id; if (BRAWLERS[me.br]) G.brawler = me.br;
  G.mods = primaryMods();
  if (G.kind === 'free') {
    const s = stat(worldKeyAt(G.map, me.x, me.y));
    if (me.sk > G.lastSk) { s.kills += me.sk - G.lastSk; G.lastSk = me.sk; savePrefs(); }
    if (me.bt > s.best) { s.best = me.bt; savePrefs(); }
  }
  if (first || me.tp !== G.lastTp) { G.lastTp = me.tp; G.pred = { x: me.x, y: me.y, mvx: me.mvx, mvy: me.mvy }; G.prev = { x: me.x, y: me.y }; G.err = { x: 0, y: 0 }; G.pending = G.pending.filter((q) => q.s > m.ack); if (first) return; }
  G.pending = G.pending.filter((q) => q.s > m.ack);
  const np = { x: me.x, y: me.y, mvx: me.mvx, mvy: me.mvy };
  if (!me.al || me.fo) G.pending = [];
  else {
    const st = moveStats(G.brawler, me.hp, me.mh, me.rs, me.sl, me.sp || 1);
    for (const q of G.pending) applyMove(G.map, np, q.mx, q.my, st.speed, st.r, G.mods);
  }
  const dx = G.pred.x - np.x, dy = G.pred.y - np.y;
  if (Math.hypot(dx, dy) > 220) { G.err.x = G.err.y = 0; G.prev = { x: np.x, y: np.y }; }
  else { G.err.x += dx; G.err.y += dy; G.prev.x -= dx; G.prev.y -= dy; }
  G.pred = np;
}

function sampleConn(c, out) {
  const s = c.snaps;
  if (!s.length || c.off == null) return;
  const rt = (performance.now() - c.off - INTERP_MS) / TICK_MS;
  let a = s[0], b = s[0], f = 0;
  if (rt >= s[s.length - 1].n) a = b = s[s.length - 1];
  else for (let i = 0; i < s.length - 1; i++) if (s[i].n <= rt && rt < s[i + 1].n) { a = s[i]; b = s[i + 1]; f = (rt - a.n) / (b.n - a.n); break; }
  for (const snap of s) if (snap.n > c.fxN && snap.n <= Math.max(rt, a.n)) { c.fxN = snap.n; for (const e of snap.fx) applyFx(e); }
  c.rt = rt;
  const stc = c.statics || EMPTY_MAP;
  for (const [id, e] of b.p) { // e: [id, x, y, hp, facing, flags]; st: [id, maxHp, cubes, bounty, glow, crystals, team]
    const ea = a.p.get(id) || e;
    const r = G.roster[id] || ['?', 'volt'];
    const sv = stc.get(id) || NO_STATIC;
    let da = e[4] - ea[4];
    da = Math.atan2(Math.sin(da), Math.cos(da)); // never loop on a bad value
    const x = ea[1] + (e[1] - ea[1]) * f, y = ea[2] + (e[2] - ea[2]) * f;
    const prev = out.others.get(id);
    if (prev && G.kind === 'free' && zoneAt(prev.x, prev.y) === prev.zone) continue; // the owning zone's copy wins
    out.others.set(id, {
      id, x, y, hp: e[3], mh: sv[1] || e[3], facing: ea[4] + da * f, fl: e[5], cu: sv[2], bt: sv[3], glow: sv[4], cr: sv[5], team: sv[6] || 0, zone: c.zone,
      name: r[0], brawler: r[1], moving: Math.hypot(e[1] - ea[1], e[2] - ea[2]) > 1, stun: e[5] & 2,
      skin: r[3]?.skin, title: r[3]?.title ? TITLES[r[3].title] : null, badge: r[3]?.badge || null,
      wpn: sv[7] >= 0 ? WEAPON_IDS[sv[7]] : null, pw: sv[8] || 1,
    });
  }
  if (c.flares) for (const fl of c.flares) out.flares.push(fl);
  out.cubes.push(...(b.cu || []));
  out.crystals.push(...(b.cy || []));
  out.mines.push(...(b.mn || []));
  if (b.wd) out.wdrops.push(...b.wd);
}
const bulletAng = new Map(); // (kept for resetMatchState)
const EMPTY_MAP = new Map(), NO_STATIC = [0, 0, 0, 0, 0, 0, 0, -1, 1], NONE = [];

function sampleWorld() {
  const out = { others: new Map(), bullets: [], cubes: [], crystals: [], mines: [], flares: [], wdrops: [] };
  const list = [...G.conns.values()].sort((a, b) => b.primary - a.primary);
  for (const c of list) sampleConn(c, out);
  if (G.map) out.bullets = G.shots.sample((k) => G.conns.get(k)?.rt, G.map, G.mods, shotEnded);
  if (STRESS && G.me) stressWorld(out);
  G.view = { others: [...out.others.values()].filter((o) => o.id !== G.myId), bullets: out.bullets, cubes: out.cubes, crystals: out.crystals, mines: out.mines, flares: out.flares, wdrops: out.wdrops };
  const now = performance.now();
  G.pings = G.pings.filter((p) => now - p.t0 < 3000);
}

// PERF CHECK (?stress=1, client only): 19 extra hunters around you, all firing nonstop, with bullets,
// muzzle flashes, casings, hits and damage numbers. Measures the worst case on a phone.
const STRESS = +(new URLSearchParams(location.search).get('stress') || 0); // 1: firing, 2: just standing there
let stressN = 0;
function stressWorld(out) {
  const P = primary(); if (!P || P.rt == null) return;
  const me = G.pred, tick = Math.floor(P.rt);
  for (let i = 0; i < 19; i++) {
    const a = (i / 19) * Math.PI * 2 + G.ticks * 0.002, r = 260 + (i % 3) * 90;
    const x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r, face = a + Math.PI + Math.sin(G.ticks * 0.05 + i) * 0.5;
    out.others.set(-1 - i, { id: -1 - i, x, y, hp: 3000, mh: 3600, facing: face, fl: 0, cu: 0, bt: i % 4, glow: 0, cr: 0, team: 0, name: 'Bot' + i, brawler: BRAWLER_IDS[i % 6], moving: true });
    if (STRESS === 1 && stressN !== tick && (tick + i) % 3 === 0) {
      const wi = i % WEAPON_IDS.length, w = WEAPONS[WEAPON_IDS[wi]], sp = w.speed || 1000;
      for (const ang of shotAngles(w, face, tick * 31 + i)) G.shots.fired(P.key, [1e6 + tick * 64 + i * 3 + Math.round(ang * 100) % 3, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, w.range, WKIND + wi, tick, -1 - i, w.fuse || 0]);
      shotFeel(-1 - i, x, y, face, WKIND + wi);
      if (i % 2 === 0) applyFx(['dmg', Math.round(me.x + Math.cos(a) * 80), Math.round(me.y + Math.sin(a) * 80), 120 + i * 13, -1 - i, i % 5 === 0 ? 1 : 0]);
      if (i % 3 === 0) applyFx(['hit', Math.round(x), Math.round(y), WKIND + wi, -1 - i]);
    }
  }
  stressN = tick;
}

// ------------------------------------------------------------------ effects
// ELIMINATION: the hunter shatters into dark shards, rolling smoke and rising embers (no blood)
function shatter(x, y, id) {
  const low = SETTINGS.lowGfx, pal = HUNTER_PAL[id] || HUNTER_PAL.volt;
  for (let i = 0; i < (low ? 6 : 14); i++) { // dark shards spinning out
    const a = Math.random() * Math.PI * 2, v = 160 + Math.random() * 260;
    G.parts.push({ kind: 'shard', x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.9, max: 0.9, color: i % 3 ? pal.dark : pal.body, size: 5 + Math.random() * 7, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14 });
  }
  for (let i = 0; i < (low ? 4 : 10); i++) { // smoke billowing up
    const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
    G.parts.push({ kind: 'smoke', x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 8, vx: Math.cos(a) * v, vy: -40 - Math.random() * 40, life: 1.4 + Math.random() * 0.6, max: 2, color: i % 2 ? '#2b2433' : '#3d3546', size: 14 + Math.random() * 10, grow: 26 });
  }
  for (let i = 0; i < (low ? 6 : 18); i++) { // embers drifting upward
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
    G.parts.push({ kind: 'ember', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 90, life: 1 + Math.random() * 0.8, max: 1.8, color: Math.random() < 0.5 ? '#ff7a1f' : pal.accent, size: 2 + Math.random() * 2.5 });
  }
  G.rings.push({ x, y, r0: 12, r1: 90, life: 0.45, max: 0.45, color: SETTINGS.reduceFlash ? 'rgba(80,60,90,0.6)' : '#3d3546', w: 7, ink: true });
}

function burst(x, y, color, n, speed = 180, size = 5, life = 0.45) {
  if (SETTINGS.lowGfx) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    const p = G.parts.add(); p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.life = p.max = life; p.color = color; p.size = size * (0.6 + Math.random() * 0.8);
  }
}
const KIND_COL = ['#7db8ff', '#ffb347', '#c9a6ff'];
function applyFx([type, x, y, v, id, extra]) {
  const dist = G.me ? Math.hypot(x - G.pred.x, y - G.pred.y) : 9999, near = dist < 700, vol = falloff(dist);
  const S = { hit: id === G.myId ? 'hurt' : 'hit', die: 'elim', slam: 'slam', boom: 'boom', worm: 'worm', blink: 'blink', cloak: 'cloak', dash: 'super', cube: 'pickup', gem: 'pickup', cage: 'super', wormwarn: 'super' }[type];
  if (S && (type !== 'hit' || id)) sfx(S, type === 'hit' && id !== G.myId ? vol * 0.6 : vol);
  switch (type) {
    case 'dmg':
      { // DAMAGE NUMBER (pooled): critical hits are bigger and gold
        const tx = G.texts.add(), crit = !!extra;
        tx.x = x + (Math.random() - 0.5) * 20; tx.y = y - 70; tx.txt = crit ? v + '!' : String(v);
        tx.color = id === G.myId ? '#ff4d5e' : crit ? '#ffd23f' : '#fff'; tx.life = tx.max = crit ? 1.1 : 0.9;
        tx.size = (v >= 1000 ? 26 : 20) * (crit ? 1.45 : 1); tx.pop = crit; tx.crit = crit;
      }
      if (!SETTINGS.reduceFlash) G.flash[id] = 0.12;
      if (id === G.myId) { G.hurt = SETTINGS.reduceFlash ? 0.18 : 0.35; G.shake = Math.max(G.shake, 6); }
      break;
    case 'hit': burst(x, y, KIND_COL[v] || (v >= WKIND ? R.WEAPON_LOOK[WEAPON_IDS[v - WKIND]]?.c2 : null) || '#fff', 7, 200, 5, 0.3); break;
    case 'swing': if (id !== G.myId) { const w = WEAPONS[WEAPON_IDS[extra - WKIND]] || WEAPONS.cleaver; G.slashes.push({ x, y, ang: v, life: 0.2, max: 0.2, flip: Math.random() < 0.5, range: w.range, arc: w.arc }); } break;
    case 'arc': G.bolts.push({ x, y, x2: v, y2: id, life: 0.22, max: 0.22 }); sfx('zap', vol * 0.6); break;
    case 'flare': burst(x, y, '#ff7b5a', 10, 160, 5, 0.6); sfx('flarepop', vol); break;
    case 'emote': { const e = EMOTES[v]; if (!e) break; const tx = G.texts.add(); tx.x = x; tx.y = y - 120; tx.txt = e.text; tx.color = e.col; tx.life = tx.max = 2; tx.size = 24; tx.pop = true; } break;
    case 'gadget': { // a gadget (or Second Wind) went off
      const g = v >= 0 ? GADGETS[G.roster[id]?.[1] || G.brawler]?.[v] : { name: 'SECOND WIND' };
      G.rings.push({ x, y, r0: 20, r1: 110, life: 0.4, max: 0.4, color: '#4be0c8', w: 6, ink: true });
      if (g) { const tx = G.texts.add(); tx.x = x; tx.y = y - 100; tx.txt = g.name.toUpperCase(); tx.color = '#4be0c8'; tx.life = tx.max = 1.1; tx.size = 17; tx.pop = true; }
      sfx('blink', vol * 0.7);
    } break;
    case 'wpick': { const w = WEAPONS[WEAPON_IDS[v]]; if (id === G.myId && w) { const tx = G.texts.add(); tx.x = x; tx.y = y - 90; tx.txt = w.name.toUpperCase() + '!'; tx.color = '#5ff4ff'; tx.life = tx.max = 1.3; tx.size = 20; tx.pop = true; sfx('pickup'); } burst(x, y, '#5ff4ff', 10, 160, 5, 0.4); } break;
    case 'wall': burst(x, y, '#d8cfff', 4, 120, 4, 0.25); break;
    case 'crate':
      burst(x, y, v ? '#ffd23f' : '#d98c3f', 16, 260, 7, 0.6); burst(x, y, v ? '#1f6f8b' : '#8a4b1f', 8, 200, 6, 0.5);
      if (near) G.shake = Math.max(G.shake, 5);
      break;
    case 'die': shatter(x, y, BRAWLER_IDS[v]); if (extra) killFx(extra, x, y); break;
    case 'slam':
      G.rings.push({ x, y, r0: 20, r1: v, life: 0.45, max: 0.45, color: '#ffd23f', w: 14 });
      G.rings.push({ x, y, r0: 10, r1: v * 0.7, life: 0.35, max: 0.35, color: '#ff7b39', w: 8 });
      burst(x, y, '#c9a27a', 26, 380, 8, 0.6);
      if (near) G.shake = Math.max(G.shake, 14);
      break;
    case 'dash': G.rings.push({ x, y, r0: 10, r1: 60, life: 0.3, max: 0.3, color: '#7db8ff', w: 6 }); G.flash['dash' + id] = 0.3; break;
    case 'cube': G.texts.push({ x, y: y - 80, txt: '+POWER', color: '#7dff7a', life: 1, max: 1, size: 18 }); burst(x, y, '#7dff7a', 14, 200, 6, 0.5); break;
    case 'gem': G.texts.push({ x, y: y - 80, txt: `💎${v}`, color: '#f4b8ff', life: 0.8, max: 0.8, size: 18 }); burst(x, y, '#d65cff', 10, 160, 5, 0.4); break;
    case 'cloak': burst(x, y, '#c9a6ff', 20, 160, 9, 0.6); break;
    case 'rush': G.texts.push({ x, y: y - 90, txt: 'RUSH!', color: '#ffe066', life: 1, max: 1, size: 22 }); G.rings.push({ x, y, r0: 20, r1: 80, life: 0.35, max: 0.35, color: '#ffe066', w: 5 }); break;
    case 'slash': if (id !== G.myId) G.slashes.push({ x, y, ang: v, life: 0.18, max: 0.18, flip: Math.random() < 0.5 }); break;
    case 'blink': burst(x, y, '#c04dff', 14, 220, 7, 0.4); burst(x, y, '#ff5fa2', 6, 160, 5, 0.3); G.rings.push({ x, y, r0: v ? 60 : 10, r1: v ? 10 : 60, life: 0.25, max: 0.25, color: '#c04dff', w: 6 }); break;
    case 'wormwarn': G.rings.push({ x, y, r0: v * 0.3, r1: v, life: 0.7, max: 0.7, color: '#2bc4cf', w: 7, ink: true }); G.rings.push({ x, y, r0: v * 0.15, r1: v * 0.7, life: 0.7, max: 0.7, color: '#3b1f78', w: 5 }); break;
    case 'worm': G.worms.push({ x, y, r: v, life: 0.6, max: 0.6 }); burst(x, y, '#f7d98a', 22, 300, 7, 0.6); if (near) G.shake = Math.max(G.shake, 10); break;
    case 'boom': G.rings.push({ x, y, r0: 10, r1: v, life: 0.35, max: 0.35, color: '#ff8c1a', w: 12 }); burst(x, y, '#ffd23f', 18, 320, 7, 0.5); burst(x, y, '#4a4a5e', 10, 200, 6, 0.5); if (near) G.shake = Math.max(G.shake, 9); break;
    case 'cage': G.rings.push({ x, y, r0: 70, r1: 30, life: 0.3, max: 0.3, color: '#ff8c1a', w: 6 }); break;
    case 'spawn': G.rings.push({ x, y, r0: 80, r1: 20, life: 0.4, max: 0.4, color: '#bde0ff', w: 6 }); break;
    case 'target':
      G.rings.push({ x, y, r0: 20, r1: 140, life: 0.6, max: 0.6, color: '#ff2846', w: 10 });
      if (id === G.myId) showBanner('YOU ARE THE TARGET!', 'Everyone is hunting you. Survive!', '#ff6b81', 2500);
      break;
  }
}

// cosmetic kill effects (the killer's equipped one)
function killFx(id, x, y) {
  // weapon mastery 7+ kill effects (by weapon class)
  if (id === 'tracer') { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; G.rings.push({ x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, r0: 4, r1: 18, life: 0.4, max: 0.4, color: '#ffd23f', w: 3 }); } burst(x, y, '#ffb000', 16, 420, 3, 0.4); return; }
  if (id === 'shrapnel') { burst(x, y, '#c9ccd4', 22, 460, 4, 0.5); burst(x, y, '#ff7b39', 8, 260, 5, 0.4); return; }
  if (id === 'crosshair') { G.rings.push({ x, y, r0: 90, r1: 24, life: 0.5, max: 0.5, color: '#5ff4ff', w: 4, ink: true }); const tx = G.texts.add(); tx.x = x; tx.y = y - 50; tx.txt = '+'; tx.color = '#5ff4ff'; tx.life = tx.max = 0.6; tx.size = 54; return; }
  if (id === 'swarm') { for (let i = 0; i < 3; i++) burst(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, '#ffe066', 8, 200, 3, 0.7); return; }
  if (id === 'crater') { G.rings.push({ x, y, r0: 10, r1: 110, life: 0.5, max: 0.5, color: '#4a4a5e', w: 14, ink: true }); burst(x, y, '#8a8590', 18, 300, 8, 0.7); return; }
  if (id === 'cleave') { G.slashes.push({ x, y, ang: Math.random() * 6, life: 0.3, max: 0.3, flip: false, range: 90, arc: 2.6 }); burst(x, y, '#eef', 12, 300, 4, 0.4); return; }
  if (id === 'arcburst') { for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; G.bolts.push({ x, y, x2: x + Math.cos(a) * 90, y2: y + Math.sin(a) * 90, life: 0.3, max: 0.3 }); } return; }
  if (id === 'sparks') burst(x, y, '#ffe066', 24, 380, 4, 0.6);
  else if (id === 'stars') for (let i = 0; i < 6; i++) G.texts.push({ x: x + (Math.random() - 0.5) * 80, y: y - 30 - Math.random() * 50, txt: '★', color: '#ffd23f', life: 0.9, max: 0.9, size: 26 });
  else if (id === 'confetti') for (const c of ['#ff4d5e', '#4be06e', '#3a86ff', '#ffd23f', '#c04dff']) burst(x, y - 20, c, 6, 260, 5, 0.9);
  else if (id === 'ghost') G.texts.push({ x, y: y - 40, txt: '👻', color: '#fff', life: 1.4, max: 1.4, size: 34 });
  else if (id === 'bolt') { G.rings.push({ x, y, r0: 120, r1: 10, life: 0.35, max: 0.35, color: '#5ff4ff', w: 10, ink: true }); G.texts.push({ x, y: y - 60, txt: '⚡', color: '#5ff4ff', life: 0.8, max: 0.8, size: 40 }); }
}

function updateEffects(dt) {
  for (const [id, rk] of G.recoil) { const n = rk - dt * 9; if (n <= 0) G.recoil.delete(id); else G.recoil.set(id, n); }
  const nk = Math.exp(-dt * 14); G.nudge.x *= nk; G.nudge.y *= nk;
  if (G.hitMark && (G.hitMark.t -= dt) <= 0) G.hitMark = null;
  for (const b of G.bolts) b.life -= dt;
  if (G.bolts.length) G.bolts = G.bolts.filter((b) => b.life > 0);
  for (const p of G.parts) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.kind === 'smoke') { p.vx *= 0.96; p.vy *= 0.97; p.size += p.grow * dt; }
    else if (p.kind === 'ember') { p.vx *= 0.97; p.vy = p.vy * 0.97 - 30 * dt; }
    else if (p.kind === 'casing') { p.vx *= 0.92; p.vy = p.vy * 0.92 + 500 * dt; p.rot += p.spin * dt; }
    else { p.vx *= 0.9; p.vy *= 0.9; if (p.kind === 'shard') { p.rot += p.spin * dt; p.vy += 260 * dt; } }
  }
  G.parts.update((p) => p.life > 0);
  for (const r of G.rings) r.life -= dt;
  for (const s of G.slashes) s.life -= dt;
  G.slashes = G.slashes.filter((s) => s.life > 0);
  for (const w of G.worms) w.life -= dt;
  G.worms = G.worms.filter((w) => w.life > 0);
  G.rings = G.rings.filter((r) => r.life > 0);
  for (const t of G.texts) { t.life -= dt; t.y -= 40 * dt; }
  G.texts.update((t) => t.life > 0);
  for (const k in G.flash) { G.flash[k] -= dt; if (G.flash[k] <= 0) delete G.flash[k]; }
  G.shake = SETTINGS.reduceFlash ? 0 : Math.max(0, G.shake - dt * 30);
  G.hurt = Math.max(0, G.hurt - dt);
  const k = Math.exp(-dt * 10);
  G.err.x *= k; G.err.y *= k;
}

// ------------------------------------------------------------------ local bullets (prediction)
// ---- what you're holding (predicted slot while a swap is pending)
function holding() {
  const me = G.me;
  const slot = G.wantSlot != null && G.wantT > 0 ? G.wantSlot : me ? me.ws || 0 : 0;
  if (me && slot === 1 && me.w2 && WEAPON_IDS[me.w2[0]]) { // (a weapon we don't know: show the signature)
    const id = WEAPON_IDS[me.w2[0]];
    return { sig: false, id, w: withPerks(id, G.myPerks[id] || []), ammo: me.w2[1], slot };
  }
  return { sig: true, id: G.brawler, w: BRAWLERS[G.brawler].attack, ammo: me ? me.am : 0, slot: 0 };
}
// the aim line for what you're holding: exact range + spread
function aimProfile(h) {
  const w = h.w;
  if (h.sig) {
    if (w.kind === 'spread' || w.kind === 'slash') return { range: w.range, cone: w.arc / 2 + 0.04 };
    if (w.kind === 'mine') return { range: w.range, land: { blast: w.blast } };
    return { range: w.range, width: w.radius + 4, thin: G.brawler === 'wisp' };
  }
  if (w.kind === 'melee') return { melee: { arc: w.arc, range: w.range }, range: w.range };
  if (w.kind === 'grenade') return { range: w.range, land: { blast: w.blast } };
  if (w.pellets > 1) return { range: w.range, cone: w.arc / 2 + 0.03 };
  if (w.cls === 'sniper') return { range: w.range, thin: true };
  if (w.spread > 0.05) return { range: w.range, cone: w.spread / 2 + 0.02 };
  return { range: w.range, width: (w.radius || 8) + 4 };
}
// FEEL: recoil kick, muzzle flash, a shell casing (yours instantly, others from their 'fired' event)
const shotSfx = { t: 0, n: 0 };
function shotFeel(id, x, y, ang, kind) {
  G.recoil.set(id, 1);
  const name = bulletKind(kind), w = WEAPONS[name];
  const cls = w ? w.cls : name;
  // gunfire: yours always; other players' at most 4 per 100ms (a 20-player firefight stays one sound, not 200)
  if (G.me) {
    const now = performance.now();
    if (now - shotSfx.t > 100) { shotSfx.t = now; shotSfx.n = 0; }
    const v = id === G.myId ? 1 : falloff(Math.hypot(x - G.pred.x, y - G.pred.y)) * 0.5;
    if (id === G.myId || (v > 0.02 && shotSfx.n++ < 4)) sfx(w ? 'w_' + cls : 'shoot_' + name, v);
  }
  if (!SETTINGS.reduceFlash) { // muzzle flash (skipped with Reduce Flashing; the sound stays)
    const f = G.parts.add(); f.kind = 'flash'; f.x = x + Math.cos(ang) * 46; f.y = y + Math.sin(ang) * 46; f.vx = 0; f.vy = 0; f.life = f.max = 0.07; f.color = '#fff3b0'; f.size = 12; f.rot = ang;
  }
  if (!SETTINGS.lowGfx && (['rifle', 'smg', 'shotgun'].includes(cls) || name === 'volt' || name === 'brick')) {
    const c = G.parts.add(), side = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.6, v = 120 + Math.random() * 80;
    c.kind = 'casing'; c.x = x + Math.cos(ang) * 20; c.y = y + Math.sin(ang) * 20; c.vx = Math.cos(side) * v; c.vy = Math.sin(side) * v - 60;
    c.life = c.max = 0.6; c.color = cls === 'shotgun' || name === 'brick' ? '#d04a3a' : '#e0b040'; c.size = 3; c.rot = Math.random() * 6; c.spin = 18;
  }
}
// a simulated projectile ended (hit a wall on our side, or the server said so)
function shotEnded(b, x, y, server, why) {
  const look = R.WEAPON_LOOK[bulletKind(b.kind)];
  if (!server && (why === 'wall' || why === 'crate')) burst(x, y, look ? look.c2 : '#d8cfff', 4, 120, 4, 0.25);
}

function spawnLocalShot(x, y, ang) {
  const a = BRAWLERS[G.brawler].attack;
  const sp = a.speed * (G.mods.bulletSpeed || 1), range = a.range * (G.mods.bulletRange || 1);
  for (const d of attackDirs(G.brawler, ang)) {
    G.localBullets.push({ x: x + Math.cos(d) * 16, y: y + Math.sin(d) * 16, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, dist: 0, range, ang: d });
  }
}
function updateLocalBullets(dt) {
  const A = BRAWLERS[G.brawler].attack;
  if (G.localBurst2) {
    const lb = G.localBurst2; lb.t -= dt;
    if (lb.t <= 0) { if (localPredicts(lb.w)) spawnLocalWeaponShot(lb.w, lb.id, lb.ang, lb.seq, lb.k); shotFeel(G.myId, G.pred.x, G.pred.y, lb.ang, WKIND + WEAPON_IDS.indexOf(lb.id)); lb.k++; lb.left--; lb.t += lb.w.interval; if (lb.left <= 0) G.localBurst2 = null; }
  }
  if (G.localBurst) {
    G.localBurst.t -= dt;
    if (G.localBurst.t <= 0) {
      const me = renderMe();
      if (A.kind === 'slash') localSlash(G.localBurst.ang); else spawnLocalShot(me.x, me.y, G.localBurst.ang);
      G.localBurst.left--; G.localBurst.t += A.interval;
      if (G.localBurst.left <= 0) G.localBurst = null;
    }
  }
  const out = [];
  for (const b of G.localBullets) {
    const step = Math.hypot(b.vx, b.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 16));
    let dead = false;
    for (let i = 0; i < n && !dead; i++) {
      b.x += (b.vx * dt) / n; b.y += (b.vy * dt) / n; b.dist += step / n;
      if (isSolidTile(tileAt(G.map, b.x, b.y)) || (G.kind === 'free' && inHub(b.x, b.y))) dead = true;
      if (b.kind != null ? !b.pierce : A.kind !== 'wave') for (const o of G.view.others) if ((!o.team || o.team !== G.me?.tm) && Math.hypot(o.x - b.x, o.y - b.y) < PLAYER_R * sizeOf(o) + (b.r || A.radius)) dead = true;
      if (b.dist >= b.range) dead = true;
    }
    if (!dead) out.push(b);
    else if (b.dist < b.range && isSolidTile(tileAt(G.map, b.x, b.y))) burst(b.x, b.y, '#d8cfff', 4, 120, 4, 0.25); // wall impact
  }
  G.localBullets = out;
}
function localSlash(ang) {
  const me = renderMe();
  G.slashes.push({ x: me.x, y: me.y, ang, life: 0.18, max: 0.18, follow: true, flip: (G.slashFlip = !G.slashFlip) });
}
const sizeOf = (o) => moveStats(BRAWLERS[o.brawler] ? o.brawler : 'volt', o.hp, o.mh).r / PLAYER_R; // (a brawler we don't know is drawn in a neutral look)

// ------------------------------------------------------------------ input tick (20 Hz, same as server)
function renderMe() {
  const a = Math.min(1, G.acc / DT);
  return { x: G.prev.x + (G.pred.x - G.prev.x) * a + G.err.x, y: G.prev.y + (G.pred.y - G.prev.y) * a + G.err.y };
}
function worldScale() { return Math.min(H / 680, W / 1150); }
function mouseAngle() { return Math.atan2(input.mouse.y - H / 2, input.mouse.x - W / 2); }

function autoAngle(kind) {
  const B = BRAWLERS[G.brawler];
  const me = G.pred;
  const reach = kind === 'super' ? (B.super.dist || B.super.radius || 600) + 150 : B.attack.range * 1.15;
  const best = pickAimTarget(G.map, me, G.view.others, { reach, team: G.me?.tm, super: kind === 'super', free: G.kind === 'free' });
  if (best) return Math.atan2(best.y - me.y, best.x - me.x);
  return G.facing;
}

function clientTick() {
  G.ticks++;
  manageZones();
  if (!G.me || G.phase !== 'play') return;
  const B = BRAWLERS[G.brawler];
  const me = G.me;
  const mv = menu.open ? STILL : input.getMove(); // (menu open: held keys must not keep walking)
  let f = null, u = null, fd = 1, ch = 0, gd = 0;
  const safe = G.kind === 'free' && inHub(G.pred.x, G.pred.y);
  G.wantT -= DT;
  const h = holding();
  input.swapOn = !!me.w2; input.gadgetOn = me.gu >= 0; input.mouse.charge = !h.sig && h.w.kind === 'charge';
  const seqNext = G.seq + 1;
  // one trigger pull per input; returns true if it fired
  const pull = (ang, mag, held) => {
    if (f != null || G.handoff || !me.al || (me.f & 2) || me.fo || (me.sw > 0 && G.wantT <= 0)) return false;
    const shotsPending = G.pending.filter((q) => q.f).length;
    if (Math.floor(h.ammo) - shotsPending < 1) return false;
    if (h.sig) {
      if (G.localCd > 0 || G.localBurst) return false;
      f = ang; G.localCd = B.attack.cooldown;
      if (PREDICTED_KINDS.includes(B.attack.kind)) spawnLocalShot(G.pred.x, G.pred.y, isSniper(null, true) ? ang : assistAngle(G.map, G.pred, ang, B.attack.range, G.view.others, G.me?.tm));
      if (B.attack.kind === 'slash') localSlash(ang);
      if (B.attack.kind === 'burst' || B.attack.kind === 'slash') G.localBurst = { left: B.attack.count - 1, t: B.attack.interval, ang };
      shotFeel(G.myId, G.pred.x, G.pred.y, ang, BRAWLER_IDS.indexOf(G.brawler));
    } else {
      const w = h.w;
      if (G.localCd2 > 0 || G.localBurst2 || G.localSwap > 0) return false;
      f = ang; G.localCd2 = w.cooldown;
      ch = w.kind === 'charge' ? Math.min(w.charge, held || 0) : 0;
      const a2 = w.cls === 'sniper' || w.kind === 'melee' ? ang : assistAngle(G.map, G.pred, ang, w.range, G.view.others, G.me?.tm);
      if (localPredicts(w)) spawnLocalWeaponShot(w, h.id, a2, seqNext, 0);
      if (w.burst > 1) G.localBurst2 = { left: w.burst - 1, t: w.interval, ang: a2, k: 1, w, id: h.id, seq: seqNext };
      if (w.kind === 'melee') G.slashes.push({ x: G.pred.x, y: G.pred.y, ang, life: 0.2, max: 0.2, follow: true, flip: (G.slashFlip = !G.slashFlip), range: w.range, arc: w.arc });
      shotFeel(G.myId, G.pred.x, G.pred.y, ang, WKIND + WEAPON_IDS.indexOf(h.id));
    }
    G.facing = ang;
    fd = mag ?? 1;
    G.nudge.x += Math.cos(ang) * 10; G.nudge.y += Math.sin(ang) * 10; // camera nudge toward the shot
    return true;
  };
  for (const a of input.takeActions()) {
    if (a.type === 'gadget') { if (me.gu > 0 && me.al && !safe) { gd = 1; sfx('super', 0.6); } continue; }
    if (a.type === 'swap') {
      if (me.w2 && me.al) { G.wantSlot = (G.wantT > 0 && G.wantSlot != null ? G.wantSlot : me.ws || 0) === 1 ? 0 : 1; G.wantT = 1; G.localSwap = G.wantSlot === 1 ? withPerks(WEAPON_IDS[me.w2[0]], G.myPerks[WEAPON_IDS[me.w2[0]]] || []).swap : SWAP_TIME; G.localBurst = G.localBurst2 = null; sfx('swap', 0.7); }
      continue;
    }
    const ang = a.mode === 'angle' ? a.ang : a.mode === 'mouse' ? mouseAngle() : autoAngle(a.type);
    if (safe) continue;
    if (a.type === 'fire') {
      const mag = a.mag ?? (a.mode === 'mouse' ? Math.min(1, Math.hypot(input.mouse.x - W / 2, input.mouse.y - H / 2) / (h.w.range * worldScale())) : undefined);
      pull(ang, mag, a.held);
    } else if (me.sc >= 1 && G.superCd <= 0 && me.al) { u = ang; G.superCd = 0.6; G.facing = ang; sfx('super'); }
  }
  // HOLD TO FIRE (setting) and full-auto weapons: keep firing while the aim stick / mouse is held
  const autoFire = !h.sig && h.w.auto, holdMode = SETTINGS.holdFire && !(h.w.kind === 'charge') && h.w.kind !== 'mine';
  const held = input.getAim();
  if (!safe && (autoFire || holdMode)) {
    if (held && held.kind === 'fire' && !held.cancel) { if (pull(held.ang, held.mag, 0)) held.touch.holdFired = true; }
    else if (!input.isTouch && input.mouse.down && performance.now() - input.mouse.down > 120) { if (pull(mouseAngle(), undefined, 0)) input.mouse.holdFired = true; }
  }
  const aim = input.getAim();
  if (aim) G.facing = aim.ang;
  else if (!input.isTouch && input.mouse.active) G.facing = mouseAngle();
  else if (Math.hypot(mv.x, mv.y) > 0.2 && G.localCd <= 0) G.facing = Math.atan2(mv.y, mv.x);
  G.moving = Math.hypot(mv.x, mv.y) > 0.1;

  G.prev = { x: G.pred.x, y: G.pred.y };
  G.mods = primaryMods();
  if (me.al && !me.fo) {
    const st = moveStats(G.brawler, me.hp, me.mh, me.rs, me.sl, me.sp || 1);
    applyMove(G.map, G.pred, mv.x, mv.y, st.speed, st.r, G.mods);
  }
  G.seq++;
  const ax = +Math.cos(G.facing).toFixed(3), ay = +Math.sin(G.facing).toFixed(3);
  const P = primary();
  const inp = {
    t: 'in', s: G.seq, mx: +mv.x.toFixed(3), my: +mv.y.toFixed(3), ax, ay, f, u, ...(f != null && fd < 1 ? { fd: +fd.toFixed(2) } : {}), ...(gd ? { gd: 1 } : {}),
    ...(ch > 0 ? { ch: +ch.toFixed(2) } : {}),
    ...(f != null && P && P.rt != null ? { vt: +P.rt.toFixed(1) } : {}), // LAG COMPENSATION: the tick we were looking at
    ...(G.wantT > 0 && G.wantSlot != null && me.ws !== G.wantSlot ? { w: G.wantSlot } : {}),
  };
  G.pending.push({ s: G.seq, mx: inp.mx, my: inp.my, ax, ay, f: f != null });
  if (G.pending.length > 60) G.pending.shift();
  send(inp);
  G.localCd -= DT; G.superCd -= DT; G.localCd2 -= DT; G.localSwap = (G.localSwap || 0) - DT;
  if (G.wantT > 0 && me.ws === G.wantSlot && !(me.sw > 0)) G.wantT = 0;
}
// own weapon shot, drawn instantly with the same spread the server uses (seeded by the input number)
function spawnLocalWeaponShot(w, id, ang, seq, k) {
  const me = renderMe(), sp = (w.speed || 1000) * (G.mods.bulletSpeed || 1), range = w.range * (G.mods.bulletRange || 1);
  for (const a of shotAngles(w, ang, seq * 7 + k)) G.localBullets.push({ x: me.x + Math.cos(a) * 16, y: me.y + Math.sin(a) * 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dist: 0, range, ang: a, kind: WKIND + WEAPON_IDS.indexOf(id), r: w.radius || 8, pierce: !!w.pierce });
}

// ------------------------------------------------------------------ render
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame); // first, so one bad frame can't freeze the game for good
  try { frameBody(now); } catch (e) { console.warn('frame error', e); unwindCanvas(); }
}
// a frame that threw part-way left saved states (clips, transforms, alpha) on the context: drop them,
// so one bad frame can't pile up state or bleed into the next
function unwindCanvas() {
  for (let i = 0; i < 32; i++) ctx.restore(); // (a no-op once the stack is empty; what was drawn stays on screen)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function frameBody(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (G.phase === 'play' || G.phase === 'dead' || G.phase === 'end') {
    G.acc += dt;
    let n = 0;
    while (G.acc >= DT && n++ < 5) { clientTick(); G.acc -= DT; }
    if (G.acc > DT) G.acc = DT;
    sampleWorld();
    if (G.map) updateLocalBullets(dt);
    updateEffects(dt);
    if (G.me && G.map) render(now / 1000);
    else if (G.phase === 'play') { // joining (Free Play) or reconnecting before the first snapshot: no stale frame
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#2b1d55'; ctx.fillRect(0, 0, W, H);
      R.outlinedText(ctx, 'Connecting…', W / 2, H / 2, 28, '#fff');
    }
    adaptResolution(dt * 1000);
    updateHud(now);
  } else if (G.phase === 'mapview') drawMapView(now / 1000);
}

const P0 = () => primary();
// entering a zone, nightfall and the Blood Moon get a banner (and the Blood Moon its own music)
function worldNotices(env) {
  if (G.kind !== 'free') { if (G.bloodOn) { G.bloodOn = false; stopTense(); } return; }
  if (env.zone && env.zone !== G.zoneSlot) {
    if (G.zoneSlot) showBanner(zoneLabel(env.zone).toUpperCase(), ZONE_INFO[env.key] || '', '#ffd23f', 2200);
    G.zoneSlot = env.zone;
  }
  const night = !!(env.dn && env.dn.night);
  if (G.nightOn !== undefined && night !== G.nightOn) showBanner(night ? 'NIGHTFALL' : 'DAWN', night ? 'Vision shrinks. High bounties glow brighter.' : 'The sun is up.', night ? '#9fb3ff' : '#ffd23f', 2500);
  G.nightOn = night;
  const blood = env.blood > 0;
  if (blood && !G.bloodOn) { showBanner('BLOOD MOON', 'Every kill is worth DOUBLE bounty for 2 minutes!', '#ff4d5e', 3200); startTense(); }
  if (!blood && G.bloodOn) stopTense();
  G.bloodOn = blood;
}

// FULL MAP: tap the minimap. Zones, roads, landmarks, you, the top bounty holder, events.
let fullMap = null;
function openFullMap() {
  if (fullMap) return;
  sfx('click');
  input.reset();
  const cv = document.createElement('canvas');
  cv.id = 'fullmap';
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 45, touchAction: 'none' });
  document.body.appendChild(cv);
  const draw = () => {
    if (!fullMap) return;
    const d = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const tops = Object.values(G.online || {}).map((z) => z.top).filter(Boolean).sort((a, b) => b[1] - a[1]);
    drawFullMap(g, G.map, w, h, { me: G.me ? renderMe() : null, online: G.online, dn: G.env?.dn, top: tops[0] ? { name: tops[0][0], bounty: tops[0][1], x: tops[0][2], y: tops[0][3] } : null });
  };
  const close = (e) => { e?.preventDefault(); clearInterval(fullMap.timer); cv.remove(); fullMap = null; };
  fullMap = { timer: setInterval(draw, 500), close };
  cv.addEventListener('pointerdown', close);
  draw();
}
const closeFullMap = () => { if (fullMap) fullMap.close(); };
window.__huntMap = { open: () => openFullMap(), close: () => closeFullMap(), isOpen: () => !!fullMap };

function render(t) {
  const s = worldScale();
  const mePos = renderMe();
  const meAlive = !!G.me.al;
  let target = mePos;
  if (!meAlive) {
    const o = G.view.others.find((p) => p.id === G.spectate) || (G.kind === 'quick' && G.modeKey === 'showdown' ? G.view.others[0] : null);
    if (o) { target = o; G.spectate = o.id; } else target = G.cam;
    G.cam.x += (target.x - G.cam.x) * 0.12; G.cam.y += (target.y - G.cam.y) * 0.12;
  } else { G.cam.x = target.x + (SETTINGS.reduceFlash ? 0 : G.nudge.x); G.cam.y = target.y + (SETTINGS.reduceFlash ? 0 : G.nudge.y); }
  const cam = G.cam;
  const hw = W / 2 / s, hh = H / 2 / s;
  const x0 = cam.x - hw, y0 = cam.y - hh - 60, x1 = cam.x + hw, y1 = cam.y + hh + 60;
  const view = { x0, y0, x1, y1 };

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(s, s);
  ctx.translate(-cam.x, -cam.y);

  R.drawGround(ctx, G.map, x0, y0, x1, y1, t, s * DPR);
  const helpers = R.eventHelpers(ctx, G.map, view);
  const evs = [...G.conns.values()].map((c) => c.ev).filter((e) => e && EVENTS[e.id]);
  for (const e of evs) if (EVENTS[e.id].layer === 'ground') EVENTS[e.id].draw?.(ctx, e.p, e.ph, t, helpers);

  if (meAlive && G.phase === 'play') {
    const aim = input.getAim(), h = holding(), prof = aimProfile(h);
    const chargeOf = (held) => (!h.sig && h.w.kind === 'charge' ? Math.min(1, held / h.w.charge) : 0);
    if (aim && !aim.cancel) {
      if (aim.kind === 'super') R.drawAim(ctx, G.brawler, mePos.x, mePos.y, aim.ang, aim.kind, aim.mag);
      else R.drawAimProfile(ctx, { ...prof, charge: chargeOf(aim.held) }, mePos.x, mePos.y, aim.ang, aim.mag);
    } else if (!input.isTouch && input.mouse.active) {
      ctx.globalAlpha = 0.45;
      R.drawAimProfile(ctx, { ...prof, charge: input.mouse.down && input.mouse.charge ? chargeOf((performance.now() - input.mouse.down) / 1000) : 0 }, mePos.x, mePos.y, mouseAngle(), Math.hypot(input.mouse.x - W / 2, input.mouse.y - H / 2) / (h.w.range * s));
      ctx.globalAlpha = 1;
    }
  }
  for (const fl of G.view.flares) R.drawFlare(ctx, fl[0], fl[1], fl[2], fl[3]);
  for (const c of G.view.cubes) R.drawCube(ctx, c[1], c[2], t);
  if (G.view.wdrops) for (const d of G.view.wdrops) R.drawWeaponDrop(ctx, d[1], d[2], WEAPON_IDS[d[3]], d[4], t);
  for (const c of G.view.crystals) R.drawCrystal(ctx, c[1], c[2], t);
  for (const mn of G.view.mines) R.drawMine(ctx, mn[1], mn[2], mn[3], mn[4] === G.myId, t);
  if (!SETTINGS.lowGfx) art.drawShadows(ctx, G.map, view);
  art.draw(ctx, G.map, view, t, SETTINGS);
  R.drawBlocks(ctx, G.map, G.crateHp, x0, y0, x1, y1);
  if (G.map.landmarks && G.map.landmarks.length) drawLandmarks(ctx, G.map, view, t);
  const env = envState(G.map, cam, G.svOff || 0);
  G.env = env;

  const list = G.view.others.map((o) => ({ ...o, me: false, size: sizeOf(o) }));
  if (meAlive) {
    const me = G.me;
    list.push({
      id: G.myId, x: mePos.x, y: mePos.y, hp: me.hp, mh: me.mh, cu: me.cu, facing: G.facing, fl: me.f, name: G.roster[G.myId]?.[0] || 'You',
      brawler: G.brawler, moving: G.moving, stun: me.f & 2, me: true, skin: G.roster[G.myId]?.[3]?.skin, title: G.roster[G.myId]?.[3]?.title ? TITLES[G.roster[G.myId][3].title] : null, badge: G.roster[G.myId]?.[3]?.badge || null, pw: me.pw || 1, wpn: me.w2 ? WEAPON_IDS[me.w2[0]] : null, bt: me.bt, glow: me.gl, cr: me.cr, size: moveStats(G.brawler, me.hp, me.mh).r / PLAYER_R,
    });
  }
  list.sort((a, b) => a.y - b.y);
  const myTeam = G.me.tm || 0;
  for (const p of list) { if (myTeam) R.drawTeamRing(ctx, p, p.me || p.team === myTeam); else R.drawRim(ctx, G.map, p); }
  const topId = P0()?.last?.top?.[0] || 0;
  for (const p of list) { p.glowBoost = env.dn ? 1 + env.dn.dark * 0.8 : 1; p.marked = p.id === topId; R.drawAura(ctx, p, t); }
  for (const p of list) {
    let alpha = 1;
    if (p.fl & 4) alpha = p.me ? 0.37 + pulse(t, 8, 0.5) * 0.16 : 0.35;
    else if (p.fl & 1) alpha = p.me ? 0.7 : 0.75;
    if (G.flash['dash' + p.id] > 0) {
      for (let i = 1; i <= 3; i++) R.drawBrawler(ctx, p.brawler, p.x - Math.cos(p.facing) * i * 22, p.y - Math.sin(p.facing) * i * 22, p.facing, t, { alpha: 0.18 * (4 - i), size: p.size });
    }
    const rk = G.recoil.get(p.id) || 0, rx = p.x - Math.cos(p.facing) * rk * 5, ry = p.y - Math.sin(p.facing) * rk * 5;
    R.drawBrawler(ctx, p.brawler, rx, ry, p.facing, t, { alpha, moving: p.moving, flash: G.flash[p.id], size: p.size, skin: p.skin });
    R.drawBubble(ctx, p, t);
    if (p.fl & 512) R.drawSlowed(ctx, p.x, p.y, t);
    if (p.fl & 256) R.drawCage(ctx, p.x, p.y);
  }
  for (const w of G.worms) R.drawWorm(ctx, w.x, w.y, w.r, 1 - w.life / w.max);
  for (const sl of G.slashes) {
    const k = 1 - sl.life / sl.max, x = sl.follow ? mePos.x : sl.x, y = sl.follow ? mePos.y : sl.y;
    const A = sl.range ? sl : BRAWLERS.flicker.attack, a0 = sl.ang - A.arc / 2, sweep = A.arc * Math.min(1, k * 1.8);
    ctx.save(); ctx.globalAlpha = 1 - k * 0.6; ctx.lineCap = 'round';
    ctx.beginPath(); sl.flip ? ctx.arc(x, y, A.range * 0.85, a0 + A.arc - sweep, a0 + A.arc) : ctx.arc(x, y, A.range * 0.85, a0, a0 + sweep);
    ctx.lineWidth = 16; ctx.strokeStyle = R.INK; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = sl.range ? '#c9ccd4' : '#ff5fa2'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
  const rimAt = (x, y) => R.theme(worldKeyAt(G.map, x, y)).bulletRim;
  const myKind = BRAWLER_IDS.indexOf(G.brawler);
  if (!SETTINGS.lowGfx) {
    for (const b of G.view.bullets) R.drawShotTrail(ctx, bulletKind(b.kind), b.kind, b.drawX, b.drawY, b.ang, b.kind >= WKIND ? R.masteryTint(G.roster[b.owner]?.[3]?.wskin, t) : null);
    const myTint = R.masteryTint(G.roster[G.myId]?.[3]?.wskin, t);
    for (const b of G.localBullets) R.drawShotTrail(ctx, G.brawler, b.kind ?? myKind, b.x, b.y, b.ang, b.kind != null ? myTint : null);
  }
  for (const b of G.view.bullets) R.drawShot(ctx, bulletKind(b.kind), b.kind, b.drawX, b.drawY, b.ang, rimAt(b.drawX, b.drawY), t);
  for (const b of G.localBullets) R.drawShot(ctx, G.brawler, b.kind ?? myKind, b.x, b.y, b.ang, rimAt(b.x, b.y), t);
  for (const bo of G.bolts) { // Arc Gun chain
    ctx.save(); ctx.globalAlpha = bo.life / bo.max; ctx.lineCap = 'round';
    const mx = (bo.x + bo.x2) / 2 + (Math.random() - 0.5) * 30, my = (bo.y + bo.y2) / 2 + (Math.random() - 0.5) * 30;
    for (const [w, c] of [[7, R.INK], [4, '#5ff4ff'], [1.5, '#fff']]) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(bo.x, bo.y); ctx.lineTo(mx, my); ctx.lineTo(bo.x2, bo.y2); ctx.stroke(); }
    ctx.restore();
  }

  R.drawBushes(ctx, G.map, x0, y0, x1, y1, meAlive ? mePos : null, t, Math.max(env.dn ? env.dn.dark : 0, env.cave ? 0.5 : 0));
  for (const e of evs) if (EVENTS[e.id].layer !== 'ground') EVENTS[e.id].draw?.(ctx, e.p, e.ph, t, helpers);
  if (!SETTINGS.lowGfx) R.drawAmbient(ctx, G.map, view, t, false);
  const P = primary();
  if (P && P.last && P.last.z > 0) R.drawPoison(ctx, P.last.z, G.map.gw * TILE_, x0, y0, x1, y1, t);

  for (const r of G.rings) {
    const k = 1 - r.life / r.max;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r0 + (r.r1 - r.r0) * k), 0, Math.PI * 2);
    ctx.globalAlpha = 1 - k; if (r.ink) { ctx.lineWidth = r.w + 5; ctx.strokeStyle = R.INK; ctx.stroke(); } ctx.lineWidth = r.w; ctx.strokeStyle = r.color; ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const p of G.parts) {
    const k = p.life / p.max;
    ctx.fillStyle = p.color;
    if (p.kind === 'smoke') { ctx.globalAlpha = Math.min(0.55, k * 0.7); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    else if (p.kind === 'shard') {
      ctx.globalAlpha = Math.min(1, k * 1.6); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.4); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size * 0.3, p.size * 0.7); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = R.INK; ctx.stroke(); ctx.restore();
    } else if (p.kind === 'flash') { ctx.globalAlpha = k; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(-6, -p.size * 0.6); ctx.lineTo(p.size * 1.4, 0); ctx.lineTo(-6, p.size * 0.6); ctx.closePath(); ctx.fill(); ctx.restore(); }
    else if (p.kind === 'casing') { ctx.globalAlpha = Math.min(1, k * 2); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore(); }
    else if (p.kind === 'ember') { ctx.globalAlpha = Math.min(1, k * 1.4) * (SETTINGS.reduceFlash ? 0.8 : 0.6 + Math.sin(p.life * 30) * 0.4); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.globalAlpha = Math.min(1, k * 1.5); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const p of list) { if (p.fl & 4 && !p.me && p.team !== myTeam) continue; R.drawStatus(ctx, p, p.me, t, myTeam ? (p.me || p.team === myTeam ? 'mate' : 'foe') : null); }
  if (meAlive) {
    const hh = holding();
    if (hh.sig) R.drawAmmo(ctx, mePos.x, mePos.y, G.me.am, G.me.sc >= 1, t);
    else { R.drawWeaponAmmo(ctx, mePos.x, mePos.y, hh.ammo, hh.w.ammo); if (G.me.sc >= 1) R.drawAmmo(ctx, mePos.x, mePos.y + 999, 0, true, t); }
    // LAY LOW meter: fills while hiding, then "LAYING LOW"
    if (G.me.f & 1) {
      const k = G.me.bt5 / 5;
      ctx.beginPath(); ctx.arc(mePos.x + 44, mePos.y + 40, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.lineWidth = 5; ctx.strokeStyle = '#51cf66'; ctx.stroke();
      if (G.me.lo > 0) { ctx.globalAlpha = 0.5 + G.me.lo * 0.5; R.outlinedText(ctx, 'LAYING LOW', mePos.x, mePos.y + 66, 13, '#9dffb0'); ctx.globalAlpha = 1; }
    }
  }
  for (const tx of G.texts) {
    const k = 1 - tx.life / tx.max, pop = k < 0.15 ? 1 + (0.15 - k) * (tx.pop ? 6 : 3) : 1;
    ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2); R.outlinedText(ctx, tx.txt, tx.x, tx.y, Math.round(tx.size * pop), tx.color);
  }
  ctx.globalAlpha = 1;
  if (G.hitMark && !SETTINGS.reduceFlash && meAlive) { // HIT MARKER at the aim point (sound plays either way)
    const hm = G.hitMark, a = G.facing, d = 90;
    R.drawHitMarker(ctx, mePos.x + Math.cos(a) * d, mePos.y + Math.sin(a) * d, hm.t / 0.3, hm.kind);
  }
  ctx.restore();

  // ---- screen space
  if (!SETTINGS.lowGfx) R.drawGrade(ctx, G.map, cam, W, H);
  drawAtmosphere(ctx, env, cam, W, H, s, t);
  if (G.kind === 'free') drawCompass(ctx, G.map, cam, W, H, s);
  const pe = P?.ev;
  if (pe && EVENTS[pe.id]?.drawScreen) EVENTS[pe.id].drawScreen(ctx, pe.p, pe.ph, t, W, H, s);
  // HEARTBEAT: an enemy is hiding close by -> pounding heart + slightly darker screen edges (steady)
  if (meAlive && G.me.hb) {
    const now2 = performance.now();
    if (!G.hbAt || now2 - G.hbAt > 900) { G.hbAt = now2; sfx('heartbeat', 0.8); }
    const g2 = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.72);
    g2.addColorStop(0, 'rgba(10,4,16,0)'); g2.addColorStop(1, 'rgba(10,4,16,0.32)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }
  if (G.hurt > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${G.hurt})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (meAlive && P && P.last && P.last.z > 0) {
    const z = P.last.z;
    const AS = G.map.gw * TILE_;
    if (mePos.x < z || mePos.y < z || mePos.x > AS - z || mePos.y > AS - z) { ctx.fillStyle = `rgba(80,220,90,${SETTINGS.reduceFlash ? 0.15 : 0.15 + Math.sin(t * 6) * 0.05})`; ctx.fillRect(0, 0, W, H); }
  }
  // hunted: arrow towards the target when it's off-screen
  const tg = P?.last?.md?.tg;
  if (tg && tg !== G.myId) {
    const o = G.view.others.find((q) => q.id === tg) || G.pings.filter((q) => q.id === tg).pop();
    if (o) {
      const dx = (o.x - cam.x) * s, dy = (o.y - cam.y) * s;
      if (Math.abs(dx) > W / 2 - 20 || Math.abs(dy) > H / 2 - 20) {
        const a = Math.atan2(dy, dx), k = Math.min((W / 2 - 50) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 50) / Math.abs(Math.sin(a) || 1e-6));
        ctx.save(); ctx.translate(W / 2 + Math.cos(a) * k, H / 2 + Math.sin(a) * k); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-12, -16); ctx.lineTo(-12, 16); ctx.closePath();
        ctx.fillStyle = '#ff2846'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = R.INK; ctx.stroke(); ctx.restore();
      }
    }
  }
  const radarR = Math.min(64, H * 0.15);
  const now = performance.now();
  const rcx = 12 + SA.l + radarR, rcy = 36 + SA.t + radarR;
  if (G.kind === 'free') {
    // MINIMAP (tap it for the full map): zone, landmarks, bounty pings, the top bounty holder
    const tops = Object.values(G.online || {}).map((z) => z.top).filter(Boolean).sort((a, b) => b[1] - a[1]);
    const top = tops[0] ? { name: tops[0][0], bounty: tops[0][1], x: tops[0][2], y: tops[0][3] } : null;
    const clock = env.blood ? `BLOOD MOON ${Math.ceil(env.blood)}s` : env.dn && env.dn.night ? 'NIGHT' : env.dn && env.dn.dark > 0 ? 'DUSK' : '';
    drawMiniMap(ctx, G.map, rcx, rcy, radarR, { x: cam.x, y: cam.y }, {
      facing: G.facing, label: zoneLabel(env.zone).toUpperCase() + (clock ? ' · ' + clock : ''), hint: G.ticks < 400, top,
      pings: [...G.pings.map((p) => ({ x: p.x, y: p.y })), ...(G.mates || []).map(([, x, y]) => ({ x, y, mate: true }))],
    });
    input.taps = [{ x: rcx, y: rcy, r: radarR + 6, on: openFullMap }];
  } else {
    input.taps = [];
    R.drawRadar(ctx, rcx, rcy, radarR, { x: cam.x, y: cam.y },
      [...G.pings.map((p) => ({ ...p, age: (now - p.t0) / 1000 })), ...(G.mates || []).map(([id, x, y]) => ({ id, x, y, bt: 0, age: 0, mate: true }))],
      { poison: P?.last?.z ? { inset: P.last.z, size: G.map.gw * TILE_ } : null, hub: false, zones: false, range: 1600 }, t);
  }
  // EMOTES: a small button under the map; tap it, then tap a call-out
  if (meAlive && G.phase === 'play') {
    const ex = rcx + radarR + 30, ey = rcy - radarR + 22, er = 19; // (beside the minimap, clear of the leaderboard)
    input.taps.push({ x: ex, y: ey, r: er + 4, on: () => { G.emoteOpen = !G.emoteOpen; sfx('click', 0.6); } });
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fillStyle = G.emoteOpen ? 'rgba(255,210,63,0.92)' : 'rgba(30,16,51,0.8)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = R.INK; ctx.stroke();
    R.outlinedText(ctx, '!?', ex, ey + 1, 14, G.emoteOpen ? R.INK : '#fff', G.emoteOpen ? '#ffd23f' : R.INK);
    if (G.emoteOpen) {
      const own = loadoutFor(A.progress()).emotes;
      own.forEach((i, k) => {
        const e = EMOTES[i], y = ey + 40 + k * 32, w = 104, x = ex - er + w / 2 + 4;
        ctx.fillStyle = 'rgba(30,16,51,0.88)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 13, w, 26, 9) : ctx.rect(x - w / 2, y - 13, w, 26); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = R.INK; ctx.stroke();
        R.outlinedText(ctx, e.text, x, y + 1, 12, e.col);
        input.taps.push({ x, y, r: 15, on: () => { send({ t: 'emote', e: i }); G.emoteOpen = false; } });
        input.taps.push({ x: x - 32, y, r: 14, on: () => { send({ t: 'emote', e: i }); G.emoteOpen = false; } });
        input.taps.push({ x: x + 32, y, r: 14, on: () => { send({ t: 'emote', e: i }); G.emoteOpen = false; } });
      });
    }
  } else G.emoteOpen = false;
  worldNotices(env);
  if (G.phase === 'play' && meAlive) {
    R.drawControls(ctx, input, G.me.sc, G.brawler, t, G.kind === 'free' && inHub(mePos.x, mePos.y));
    const hh = holding();
    if (G.me.w2 && WEAPON_IDS[G.me.w2[0]]) { // SWAP button (above the fire button): signature <-> secondary
      const id = WEAPON_IDS[G.me.w2[0]];
      R.drawSwapButton(ctx, input.swapBtn, { active: hh.slot === 1, name: WEAPONS[id].name, sigName: BRAWLERS[G.brawler].name, swap: Math.max(0, G.localSwap || 0, G.me.sw || 0) }, t);
    }
    // what you're holding, next to the fire button: icon, name, ammo
    R.drawWeaponPanel(ctx, input.weaponPanel, hh.sig ? { weapon: null, name: BRAWLERS[G.brawler].name.toUpperCase(), ammo: G.me.am, max: 3, color: HUNTER_PAL[G.brawler]?.accent } : { weapon: hh.id, name: WEAPONS[hh.id].name.toUpperCase(), ammo: hh.ammo, max: hh.w.ammo }, t);
    if (G.me.gu >= 0) R.drawGadgetButton(ctx, input.gadgetBtn, { uses: G.me.gu, name: GADGETS[G.brawler]?.[G.me.gi]?.name }, t);
  }
  if (!meAlive && G.phase !== 'play') {
    const o = G.view.others.find((p) => p.id === G.spectate);
    if (o) R.outlinedText(ctx, `Spectating ${o.name}`, W / 2, H - 30, 18);
  }
}

// ------------------------------------------------------------------ DOM HUD
let hudT = 0;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateHud(now) {
  const P = primary();
  const e = P?.ev;
  const banner = $('evBanner');
  if (now < G.bannerUntil) { /* a big banner is showing */ }
  else if (e) {
    const def = EVENTS[e.id];
    banner.hidden = false;
    if (e.ph === 'warn') {
      banner.classList.remove('small');
      $('evName').textContent = `⚠ ${def.name} IN ${Math.max(1, Math.ceil(e.tl))}`; $('evName').style.color = def.color; $('evDesc').textContent = def.desc;
    } else {
      banner.classList.add('small');
      $('evName').textContent = `${def.name} · ${Math.ceil(e.tl)}s`; $('evName').style.color = def.color;
    }
  } else banner.hidden = true;

  if (now - hudT < 150) return;
  hudT = now;
  const last = P?.last;
  const me = G.me;
  if (G.kind === 'free') {
    const humans = Object.values(G.online || {}).flatMap((z) => z.players);
    $('countPill').hidden = false;
    $('aliveN').textContent = Math.max(1, humans.length); $('countLbl').textContent = 'ONLINE';
    $('statsPill').hidden = false;
    if (me) { $('sessK').textContent = me.sk; $('sessB').textContent = me.bb; }
    $('poison').hidden = true; $('timerPill').hidden = true;
    const safe = me && me.al && inHub(G.pred.x, G.pred.y);
    $('hubPanel').hidden = !safe;
    if (safe) {
      $('onlineN').textContent = Math.max(1, humans.length);
      $('onlineList').innerHTML = ZONES.map((z) => (G.online[z.slot]?.players || []).map(([n, , bt]) =>
        `<li>${esc(n)} <span>${worldName(z.world)}${bt ? ` ★${bt}` : ''}</span></li>`).join('')).join('') || '<li>Just you (and bots)</li>';
      for (const b of $('hubPick').children) b.classList.toggle('sel', b.dataset.b === G.brawler);
    }
  } else if (last) {
    $('statsPill').hidden = true; $('hubPanel').hidden = true;
    const sd = G.modeKey === 'showdown';
    $('countPill').hidden = !sd;
    $('aliveN').textContent = last.al; $('countLbl').textContent = 'LEFT';
    $('poison').hidden = !sd;
    if (sd) {
      const pt = $('poison');
      if (last.tm < 60) { pt.classList.remove('on'); pt.innerHTML = `POISON IN <b>${Math.ceil(60 - last.tm)}</b>`; }
      else { pt.classList.add('on'); pt.textContent = 'POISON CLOSING IN!'; }
    }
    $('timerPill').hidden = sd || !last.md;
    if (last.md) $('timerT').textContent = fmt(last.md.tl);
    const pots = last.md?.pots, mt = G.me?.tm;
    $('potPill').hidden = !pots;
    if (pots && mt) { $('potUs').textContent = pots[mt]; $('potThem').textContent = pots[3 - mt]; }
  }
  const top = last?.top;
  $('topBounty').hidden = !top;
  if (top) { $('topName').textContent = top[0] === G.myId ? 'YOU' : top[1]; $('topVal').textContent = top[2]; }
  const lb = last?.lb;
  if (lb) {
    const lbl = { bounty: '★', hunted: 'pts', crystals: '💎' }[G.modeKey] || '★';
    $('leader').hidden = false;
    $('leader').innerHTML = lb.map(([id, n, sc], i) => `<div>${i + 1}. ${id === G.myId ? '<b>YOU</b>' : esc(n)}<span>${sc} ${lbl}</span></div>`).join('');
  }
  const mb = $('modeBanner');
  mb.className = '';
  let txt = '';
  if (G.modeKey === 'hunted' && last?.md) {
    if (last.md.tg === G.myId) { txt = '🎯 YOU ARE THE TARGET — SURVIVE!'; mb.className = 'red'; }
    else if (last.md.tg) { txt = `🎯 Hunt ${esc(G.roster[last.md.tg]?.[0] || '?')}!`; mb.className = 'red'; }
  } else if (G.modeKey === 'crystals' && me) {
    const h = last?.md?.hold;
    mb.className = 'gem';
    txt = `💎 ${me.cr}/10`;
    if (h) txt += h[0] === G.myId ? ` · HOLD ON! ${Math.ceil(h[1])}s` : ` · ${esc(G.roster[h[0]]?.[0] || '?')} wins in ${Math.ceil(h[1])}s!`;
  }
  mb.hidden = !txt || G.phase !== 'play';
  mb.innerHTML = txt;
  const rs = me && !me.al && me.rt > 0;
  $('respawn').hidden = !rs;
  if (rs) $('respawnT').textContent = Math.ceil(me.rt);
}

// hub brawler picker
for (const id of BRAWLER_IDS) {
  const b = document.createElement('button');
  b.textContent = BRAWLERS[id].name; b.dataset.b = id;
  b.onclick = () => { selBrawler = id; prefs.brawler = id; savePrefs(); send({ t: 'pick', brawler: id }); };
  $('hubPick').appendChild(b);
}

// ?mapview=1 : whole map zoomed out with collision boxes (debug). &world=<key> for an arena, &free=1 for the world.
function drawMapView(t) {
  const m = G.map, Wm = m.gw * TILE_, Hm = m.gh * TILE_;
  const s = Math.min(W / Wm, H / Hm) * 0.96;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#120a24'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate((W - Wm * s) / 2, (H - Hm * s) / 2); ctx.scale(s, s);
  const v = { x0: 0, y0: 0, x1: Wm, y1: Hm };
  R.drawGround(ctx, m, 0, 0, Wm, Hm, t, s * DPR);
  art.drawShadows(ctx, m, v);
  art.draw(ctx, m, v, t, SETTINGS);
  R.drawBlocks(ctx, m, new Map(), 0, 0, Wm, Hm);
  R.drawBushes(ctx, m, 0, 0, Wm, Hm, null, t);
  // collision boxes: walls red, spiked border orange, water/crates blue
  ctx.lineWidth = 3 / s * 1.2;
  for (let y = 0; y < m.gh; y++) for (let x = 0; x < m.gw; x++) {
    const tt = m.t[y * m.gw + x];
    if (!blocksMove(tt)) continue;
    ctx.strokeStyle = m.border[y * m.gw + x] ? 'rgba(255,150,40,0.9)' : tt === 1 ? 'rgba(255,40,70,0.9)' : 'rgba(80,170,255,0.9)';
    ctx.strokeRect(x * TILE_ + 2, y * TILE_ + 2, TILE_ - 4, TILE_ - 4);
  }
  if (m.kind === 'arena') for (const sp of m.spawns || SPAWNS) {
    ctx.beginPath(); ctx.arc(sp.x, sp.y, SPAWN_COVER_DIST, 0, Math.PI * 2); ctx.strokeStyle = spawnHasCover(m, sp) ? 'rgba(75,224,110,0.8)' : 'rgba(255,0,0,1)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2); ctx.fillStyle = '#4be06e'; ctx.fill();
  }
  ctx.restore();
  const st = art.stats();
  R.outlinedText(ctx, `MAPVIEW · ${m.kind === 'arena' ? `${m.world} arena · ${m.layout} · ${m.size}px` : 'Free Play world'} · ${m.pieces.length} cover pieces · art sprites ${st.sprites} · worlds cached ${st.worlds.join(',')}`, W / 2, 16, 14, '#fff', '#000');
}

let menuMap = null;
function drawMenuBackdrop(t) {
  if (!menuMap) menuMap = generateWorld();
  const s = worldScale() * 0.9;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  const cx = 2000 + Math.cos(t * 0.04) * 1300, cy = 2000 + Math.sin(t * 0.04) * 1300;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-cx, -cy);
  const hw = W / 2 / s, hh = H / 2 / s;
  R.drawGround(ctx, menuMap, cx - hw, cy - hh, cx + hw, cy + hh, t, s * DPR);
  const mv = { x0: cx - hw, y0: cy - hh - 60, x1: cx + hw, y1: cy + hh + 60 };
  art.drawShadows(ctx, menuMap, mv);
  art.draw(ctx, menuMap, mv, t, SETTINGS);
  R.drawBlocks(ctx, menuMap, new Map(), mv.x0, mv.y0, mv.x1, mv.y1);
  R.drawBushes(ctx, menuMap, cx - hw, cy - hh, cx + hw, cy + hh, null, t);
  ctx.restore();
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ buttons
function goFullscreen() {
  if (!input.isTouch) return;
  const el = document.documentElement;
  const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
  if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
$('leaveWorld').onclick = toMenu;
$('rangeLeave').onclick = toMenu;
$('spectate').onclick = () => { $('dead').hidden = true; $('specBar').hidden = false; };
// eliminated: your place is already final, so LOBBY needs no confirm
$('deadLobby').onclick = toMenu;
$('hudLobby').onclick = toMenu;

// ------------------------------------------------------------------ in-match menu (button or Esc)
// The match keeps running behind it. LEAVE uses the deliberate-quit path (bye), so the result is
// recorded once. Free Play outside the safe hub: a 3 s countdown that taking damage cancels.
const LEAVE_S = 3;
function openMenu() {
  if (menu.open || G.phase !== 'play') return;
  menu.open = true;
  closeFullMap();
  input.enabled = false; input.reset();
  const free = G.kind === 'free', range = G.modeKey === 'range';
  $('gmNote').textContent = free ? 'Free Play keeps running' : range ? 'Test Range' : 'The match is still running';
  $('gmLeave').textContent = free || range ? 'LEAVE' : 'LEAVE MATCH';
  $('gmSound').checked = !!SETTINGS.sound; $('gmMusic').checked = SETTINGS.musicVol > 0;
  menuPage('main');
  $('gmenu').hidden = false;
  sfx('click', 0.6);
}
function closeMenu() {
  if (!menu.open) return;
  menu.open = false;
  clearInterval(menu.timer); menu.timer = 0;
  $('gmenu').hidden = true;
  if (G.phase === 'play') { input.enabled = true; input.reset(); }
}
function menuPage(page) {
  clearInterval(menu.timer); menu.timer = 0;
  $('gmMain').hidden = page !== 'main';
  $('gmConfirm').hidden = page === 'main';
  $('gmYes').hidden = page !== 'confirm';
  $('gmStay').textContent = page === 'leaving' ? 'CANCEL' : 'STAY';
}
function leaveNow() { closeMenu(); toMenu(); }
function askLeave() {
  const me = G.me;
  if (G.kind !== 'free') {
    if (G.modeKey === 'range' || !me) return leaveNow(); // nothing at stake
    $('gmAsk').textContent = G.modeKey === 'squad' ? 'Leave match? It counts as a loss.' : 'Leave match? You will be placed last.';
    return menuPage('confirm');
  }
  // Free Play: instant in the safe hub (or while down); out in the wild you have to survive 3 seconds
  if (!me || !me.al || inHub(G.pred.x, G.pred.y)) return leaveNow();
  menuPage('leaving');
  const hp0 = me.hp, t0 = performance.now();
  const step = () => {
    const left = LEAVE_S - (performance.now() - t0) / 1000;
    if (!G.me || G.me.hp < hp0) { menuPage('main'); toast('You took damage. Leaving cancelled.'); return; }
    if (left <= 0) return leaveNow();
    $('gmAsk').textContent = `Leaving in ${Math.ceil(left)}... Taking damage cancels it.`;
  };
  step();
  menu.timer = setInterval(step, 100);
}
$('menuBtn').onclick = openMenu;
$('gmResume').onclick = closeMenu;
$('gmLeave').onclick = askLeave;
$('gmStay').onclick = () => menuPage('main');
$('gmYes').onclick = leaveNow;
$('gmSound').onchange = () => { setSetting('sound', $('gmSound').checked); $('setSound').checked = $('gmSound').checked; applySettings(); };
// music off = volume 0; back on restores the volume it had (the lobby Settings slider still works)
$('gmMusic').onchange = () => {
  if ($('gmMusic').checked) setSetting('musicVol', prefs.musicWas > 0 ? prefs.musicWas : 0.6);
  else { prefs.musicWas = SETTINGS.musicVol; savePrefs(); setSetting('musicVol', 0); }
  applySettings();
};
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.repeat || (e.target && e.target.tagName === 'INPUT')) return;
  if (fullMap) return closeFullMap();
  if (menu.open) closeMenu(); else openMenu();
});
for (const [id, key] of [['setFlash', 'reduceFlash'], ['setLow', 'lowGfx'], ['setSound', 'sound']]) {
  $(id).checked = !!SETTINGS[key];
  $(id).onchange = () => { setSetting(key, $(id).checked); applySettings(); };
}
function applySettings() { document.body.classList.toggle('reduce-flash', SETTINGS.reduceFlash); setMusicVolume(); resize(); }
applySettings();
const playAgain = () => { goFullscreen(); startQuick(G.opts.world ? { ...G.opts, room: 'T' + Math.floor(Math.random() * 1e8) } : { mode: G.opts.mode, room: G.opts.room }); };
$('hudAgain').onclick = playAgain;
for (const b of document.querySelectorAll('#dead .again')) b.onclick = playAgain;

// ------------------------------------------------------------------ menus / lobby UI
const UI = {};
UI.lobby = createLobby({
  // lobby PLAY = public matchmaking for the chosen mode; Friends popup = the typed room code
  startQuick: (o = {}) => { goFullscreen(); startQuick(o.fromFriends ? {} : { mode: o.mode || '', room: '' }); },
  startFree: () => { goFullscreen(); startFree(); },
  // TEST RANGE: a private room with target dummies, carrying the weapon picked in the Armory
  startRange: (weapon) => { goFullscreen(); startQuick({ room: 'R' + Math.random().toString(36).slice(2, 9).toUpperCase(), mode: 'range', world: 'meadow', lobby: '1.5', tryW: weapon }); },
  getBrawler: () => selBrawler,
  setBrawler: (id) => { const changed = id !== selBrawler; selBrawler = id; prefs.brawler = id; savePrefs(); UI.lobby?.refresh(); if (changed) sfx('growl_' + id, 0.9); }, // each hunter growls when picked
  prefs, saveName: () => { readForm(); UI.lobby?.refresh(); }, statRows,
});
UI.mm = createMatchmaking(() => toMenu());
UI.res = createResults({ onAgain: playAgain, onLobby: () => toMenu() });
UI.earned = createEarned();
UI.showIntro = showIntro;


// Test flags: ?world=<key>[&mode=<mode>] drops you straight into that arena with bots; ?free=1 into Free Play.
const qs = new URLSearchParams(location.search);
// ?clock=<0..1>: show the day/night cycle at that point (screenshots; visual only, the server keeps real time)
if (qs.get('clock') != null) { const ph = +qs.get('clock'); G.clockForced = ph; G.svOff = Math.floor(Date.now() / DAY_MS) * DAY_MS + ph * DAY_MS - Date.now(); }
if (qs.get('mapview')) {
  G.phase = 'mapview';
  G.map = qs.get('free') ? generateWorld() : generateArena(+(qs.get('seed') || 7), qs.get('world') || 'meadow', +(qs.get('players') || 10));
  show(null); $('hud').hidden = true; document.body.classList.add('ingame');
}
if (!qs.get('mapview') && !qs.get('world') && !qs.get('free')) show('lobby');
booted.then(() => {
if (qs.get('mapview')) return;
if (qs.get('world')) startQuick({ world: qs.get('world'), mode: qs.get('mode') || '', ev: qs.get('ev') || '', lobby: '1.5', room: 'T' + Math.floor(Math.random() * 1e8) });
else if (qs.get('free')) startFree();
});

// exposed for e2e tests
window.__hunt = G;
window.__huntPerf = () => ({ dpr: DPR, frameAvg, dprStep });
window.__huntMsg = (m) => onMsg(primary() || { primary: true }, m); // e2e hook: inject server messages
