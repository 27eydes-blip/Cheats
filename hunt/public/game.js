// Client: lobby, Quick Hunt + Free Play networking, own-player prediction/reconciliation,
// per-connection snapshot interpolation, zone handoff, twists/events/mode HUD, effects.
import {
  BRAWLERS, BRAWLER_IDS, DT, TICK_RATE, CRATE, PLAYER_R, ARENA_SIZE, ZONES, WORLDS,
  worldId, worldsInDisplayOrder, generateArena, generateWorld, applyMove, attackDirs, tileAt, isSolidTile,
  moveStats, zoneAt, zoneBounds, inHub, worldKeyAt, PREDICTED_KINDS,
} from './shared.js';
import { EVENTS } from './events/index.js';
import { Input } from './input.js';
import * as R from './render.js';
import { SETTINGS, setSetting } from './settings.js';
import * as A from './account.js';
import { createLobby } from './ui/lobby.js';
import { createMatchmaking, createResults, showIntro } from './ui/flow.js';
import './ui/fx.js';
import { levelInfo } from './progression.js';
import { TITLES } from './catalog.js';
import { sfx, falloff } from './audio.js';
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
window.__huntArt = { art, artFor };
const TICK_MS = 1000 / TICK_RATE;
const INTERP_MS = 110;
const MODE_INFO = {
  squad: { name: 'SQUAD HUNT', desc: '3v3! Kills fill your team pot. Highest pot after 3:00 wins.' },
  showdown: { name: 'SHOWDOWN', desc: 'Last hunter standing wins. The poison closes in!' },
  bounty: { name: 'BOUNTY RUSH', desc: 'Steal bounties! Highest bounty after 2:00 wins.' },
  hunted: { name: 'HUNTED', desc: 'Everyone hunts the target. Take them down to become it!' },
  crystals: { name: 'CRYSTAL GRAB', desc: 'Grab 10 crystals and hold them for 10 seconds!' },
  freeplay: { name: 'FREE PLAY', desc: '' },
};
const worldName = (key) => WORLDS[worldId(key)]?.name || key;
const bulletKind = (k) => (k === 20 ? 'cage' : BRAWLER_IDS[k]);
const predicted = (k) => k !== 20 && PREDICTED_KINDS.includes(BRAWLERS[BRAWLER_IDS[k]]?.attack.kind);

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
function resize() {
  DPR = SETTINGS.lowGfx ? 1 : Math.min(DPR_STEPS[dprStep], devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  input.layout(W, H);
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ prefs, stats, lobby
const prefs = (() => { try { return JSON.parse(localStorage.getItem('hunt') || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('hunt', JSON.stringify(prefs)); } catch {} };
prefs.stats ||= {}; // keyed by numeric world id (stable: WORLDS is append-only)
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
  if (screen) $('hudAgain').hidden = true;
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
  localBullets: [], localBurst: null, localCd: 0, superCd: 0, parts: [], rings: [], texts: [], flash: {}, shake: 0, hurt: 0,
  spectate: 0, view: { others: [], bullets: [], cubes: [], crystals: [] }, cam: { x: 1000, y: 1000 }, acc: 0, ping: 0,
  pings: [], handoff: null, online: {}, modeKey: 'showdown', world: 'meadow', retries: 0, room: '', botsOn: true, facing: 0,
  moving: false, slashes: [], worms: [], slashFlip: false, lastTp: 0, lastSk: 0, deadMsg: null, ticks: 0, opts: {}, bannerUntil: 0,
};

function resetMatchState() {
  Object.assign(G, {
    myId: 0, map: null, roster: {}, crateHp: new Map(), pending: [], seq: 0, me: null, mods: {}, err: { x: 0, y: 0 },
    localBullets: [], localBurst: null, localCd: 0, superCd: 0, parts: [], rings: [], texts: [], slashes: [], worms: [], lastTp: 0, flash: {}, shake: 0, hurt: 0,
    spectate: 0, view: { others: [], bullets: [], cubes: [], crystals: [] }, pings: [], handoff: null, online: {}, deadMsg: null, lastSk: 0,
  });
  $('feed').innerHTML = '';
  $('hudAgain').hidden = true;
}

// ------------------------------------------------------------------ connections
const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
function openConn(key, path, o = {}) {
  const ws = new WebSocket(wsBase() + path);
  const c = { key, ws, zone: o.zone || null, primary: !!o.primary, snaps: [], off: null, fxN: 0, ev: null, last: null, open: false };
  G.conns.set(key, c);
  ws.onopen = () => { c.open = true; if (G.handoff && G.handoff.zone === c.zone) claim(); };
  ws.onmessage = (e) => { if (G.conns.get(key) === c) onMsg(c, JSON.parse(e.data)); };
  ws.onclose = () => {
    if (G.conns.get(key) !== c) return;
    G.conns.delete(key);
    if ((c.primary || (G.handoff && G.handoff.zone === c.zone)) && G.phase !== 'menu' && G.phase !== 'end') { toast('Connection lost'); toMenu(); }
  };
  return c;
}
function closeAll() { const cs = [...G.conns.values()]; G.conns.clear(); for (const c of cs) { try { c.ws.close(); } catch {} } }
const primary = () => { for (const c of G.conns.values()) if (c.primary) return c; return null; };
function send(o) { const c = primary(); if (c && c.open && !G.handoff) c.ws.send(JSON.stringify(o)); }
setInterval(() => { for (const c of G.conns.values()) if (c.open) c.ws.send(JSON.stringify({ t: 'ping', c: performance.now() })); }, 2000);

function readForm() {
  const name = $('name').value.trim().slice(0, 14) || 'Hunter';
  const room = $('room').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  prefs.name = name; prefs.room = room; prefs.bots = $('bots').checked; savePrefs();
  return { name, room };
}

function startQuick(opts = G.opts) {
  G.opts = opts;
  closeAll();
  resetMatchState();
  const { name, room: formRoom } = readForm();
  const room = opts.room ?? formRoom;
  G.kind = 'quick'; G.room = room; G.brawler = selBrawler;
  const q = new URLSearchParams({ name, brawler: selBrawler });
  if (A.ACC.token) q.set('token', A.ACC.token);
  if (room) q.set('room', room);
  if (opts.skip) q.set('skip', opts.skip);
  if (room && !$('bots').checked && !opts.world) q.set('bots', '0');
  for (const k of ['world', 'mode', 'lobby', 'ev']) if (opts[k]) q.set(k, opts[k]);
  openConn('main', '/ws?' + q, { primary: true });
  G.phase = 'waiting';
  show('waiting');
  UI.mm.show({ brawler: selBrawler, skin: A.progress().equipped['skin:' + selBrawler] || null, label: room ? `ROOM ${room}` : (MODE_INFO[opts.mode]?.name || 'QUICK HUNT') });
}

function startFree() {
  closeAll();
  resetMatchState();
  const { name } = readForm();
  G.kind = 'free'; G.brawler = selBrawler; G.modeKey = 'freeplay';
  G.map = generateWorld();
  const slot = ZONES[Math.floor(Math.random() * ZONES.length)].slot;
  openConn(slot, `/zone?${new URLSearchParams({ slot, join: '1', name, brawler: selBrawler, ...(A.ACC.token ? { token: A.ACC.token } : {}) })}`, { zone: slot, primary: true });
  G.phase = 'play';
  input.enabled = true; input.reset();
  show(null);
}

function toMenu() {
  G.phase = 'menu';
  closeAll();
  input.enabled = false; input.reset();
  show('lobby');
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
  if (G.ticks % 5 === 0) for (const c of G.conns.values()) if (!c.primary && c.open) c.ws.send(JSON.stringify({ t: 'pos', x: Math.round(p.x), y: Math.round(p.y) }));
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
      G.myId = m.id; G.retries = 0; G.botsOn = m.bots;
      if (m.mode) G.modeKey = m.mode;
      if (m.world) G.world = m.world;
      if (G.phase === 'waiting') UI.mm.update({ players: 1, max: m.mode === 'squad' ? 6 : 10, mode: MODE_INFO[m.mode]?.name, world: m.world });
      break;
    case 'lobby':
      UI.mm.update({ players: m.players.length, max: m.mode === 'squad' ? 6 : 10, startIn: m.startIn, mode: MODE_INFO[m.mode]?.name, world: m.world });
      break;
    case 'retry':
      if (!G.room && G.retries++ < 5) setTimeout(() => startQuick({ ...G.opts, skip: m.match }), 150);
      else { toast(m.reason + (G.room ? ' — try again when it ends' : '')); toMenu(); }
      break;
    case 'start':
      G.myId = m.you; G.modeKey = m.mode; G.world = m.world;
      G.map = generateArena(m.seed, m.world);
      if (m.open) for (let y = 1; y < G.map.gh - 1; y++) for (let x = 1; x < G.map.gw - 1; x++) G.map.t[y * G.map.gw + x] = 0;
      G.phase = 'play';
      input.enabled = true; input.reset();
      show(null);
      UI.showIntro({ world: m.world, modeName: MODE_INFO[m.mode].name, brawler: selBrawler, skin: A.progress().equipped['skin:' + selBrawler] || null });
      setTimeout(() => showBanner(MODE_INFO[m.mode].name, `${MODE_INFO[m.mode].desc} (${m.botLevel || 'normal'} bots)`, '#ffd23f', 2500), 2200);
      break;
    case 'ro':
      if (m.add) Object.assign(G.roster, m.add);
      break;
    case 'st':
      for (const [idx, type] of m.td) applyTile(idx, type);
      for (const [idx, hp] of m.ch) G.crateHp.set(idx, hp);
      if (m.ev) c.ev = { ...m.ev, at: performance.now() };
      break;
    case 'ev':
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
      G.phase = 'dead';
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
    case 'online': G.online = m.zones; break;
    case 'progress': {
      if (A.ACC.user) A.setUser({ ...A.ACC.user, progress: m.progress });
      UI.res.progress(m);
      break;
    }
    case 'pong': if (c.primary) { G.ping = Math.round(performance.now() - m.c); $('ping').textContent = `${G.ping} ms`; } break;
  }
}

function applyTile(idx, type) {
  G.map.t[idx] = type;
  if (type !== CRATE) G.crateHp.delete(idx);
}

function onEnd(m) {
  const won = m.winTeam !== undefined ? !!m.won : m.rank === 1;
  G.phase = 'end';
  input.enabled = false; input.reset();
  const s = stat(G.world);
  s.games++; if (won) s.wins++; s.kills += m.kills; s.best = Math.max(s.best, G.me?.bb || 0, m.bounty);
  savePrefs();
  const msg = m.winTeam !== undefined ? `Team pot ★${m.pots[m.team]} vs ★${m.pots[3 - m.team]}` : won ? `VICTORY! ${MODE_INFO[m.mode].name} on ${worldName(G.world)}` : `${m.winner || 'Nobody'} won ${MODE_INFO[m.mode].name}.`;
  const scoreLbl = { bounty: '★', hunted: 'pts', crystals: '💎' }[m.mode];
  const rows = m.results.map(([n, b, r, k, bot, id, be, sc, tm]) =>
    `<li class="${id === G.myId ? 'me' : ''} ${tm ? (tm === m.team ? 'mate' : 'foe') : ''}"><span class="r">#${r}</span>${esc(n)}${bot ? ' 🤖' : ''}<span class="k">${scoreLbl ? `${sc} ${scoreLbl} · ` : ''}${k} KO</span></li>`).join('');
  setTimeout(() => { if (G.phase === 'end') { show('end'); UI.res.show(m, { msg, rows, won }); sfx(won ? 'victory' : 'defeat'); startPose(won); } }, won ? 1600 : 600);
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
  const p = new Map(), b = new Map();
  for (const e of m.p) p.set(e[0], e);
  for (const e of m.b) b.set(e[0], e);
  c.snaps.push({ n: m.n, p, b, cu: m.cu, cy: m.cy, fx: m.fx, mn: m.mn || [] });
  if (c.snaps.length > 40) c.snaps.shift();
  for (const [idx, type] of m.td) applyTile(idx, type);
  for (const [idx, hp] of m.ch) G.crateHp.set(idx, hp);
  c.last = m;
  if (m.ev && c.ev && c.ev.id === m.ev[0]) { c.ev.ph = m.ev[1]; c.ev.tl = m.ev[2]; }
  for (const [id, x, y, bt] of m.pg) G.pings.push({ id, x, y, bt, t0: now, target: !!(m.md && m.md.tg === id) });
  if (c.primary) G.mates = m.mates || [];
  if (c.primary && m.me) reconcile(m);
}

function primaryMods() {
  const c = primary();
  const e = c && c.ev;
  return e && e.ph === 'on' && EVENTS[e.id].mods ? EVENTS[e.id].mods(e.p) : {};
}

function reconcile(m) {
  const me = m.me;
  const first = !G.me;
  G.me = me; G.myId = me.id; G.brawler = me.br;
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
    const st = moveStats(G.brawler, me.hp, me.mh, me.rs, me.sl);
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
  for (const [id, e] of b.p) {
    const ea = a.p.get(id) || e;
    const r = G.roster[id] || ['?', 'volt'];
    let da = e[5] - ea[5];
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const x = ea[1] + (e[1] - ea[1]) * f, y = ea[2] + (e[2] - ea[2]) * f;
    const prev = out.others.get(id);
    if (prev && G.kind === 'free' && zoneAt(prev.x, prev.y) === prev.zone) continue; // the owning zone's copy wins
    out.others.set(id, {
      id, x, y, hp: e[3], mh: e[4], facing: ea[5] + da * f, fl: e[6], cu: e[7], bt: e[8], glow: e[9], cr: e[10], team: e[11] || 0, zone: c.zone,
      name: r[0], brawler: r[1], moving: Math.hypot(e[1] - ea[1], e[2] - ea[2]) > 1, stun: e[6] & 2,
      skin: r[3]?.skin, title: r[3]?.title ? TITLES[r[3].title] : null,
    });
  }
  for (const [id, e] of b.b) {
    if (e[3] === G.myId && predicted(e[4])) continue; // own shots are predicted locally
    const ea = a.b.get(id);
    const key = c.key + id;
    const x = ea ? ea[1] + (e[1] - ea[1]) * f : e[1], y = ea ? ea[2] + (e[2] - ea[2]) * f : e[2];
    const ang = ea ? Math.atan2(e[2] - ea[2], e[1] - ea[1]) : (bulletAng.get(key) ?? 0);
    if (ea) bulletAng.set(key, ang);
    else if (!bulletAng.has(key + 's') && G.me) { bulletAng.set(key + 's', 1); sfx('shoot_' + bulletKind(e[4]), falloff(Math.hypot(x - G.pred.x, y - G.pred.y)) * 0.5); }
    out.bullets.push({ x, y, ang, kind: bulletKind(e[4]) });
  }
  out.cubes.push(...(b.cu || []));
  out.crystals.push(...(b.cy || []));
  out.mines.push(...(b.mn || []));
}
const bulletAng = new Map();

function sampleWorld() {
  const out = { others: new Map(), bullets: [], cubes: [], crystals: [], mines: [] };
  const list = [...G.conns.values()].sort((a, b) => b.primary - a.primary);
  for (const c of list) sampleConn(c, out);
  if (bulletAng.size > 800) bulletAng.clear();
  G.view = { others: [...out.others.values()].filter((o) => o.id !== G.myId), bullets: out.bullets, cubes: out.cubes, crystals: out.crystals, mines: out.mines };
  const now = performance.now();
  G.pings = G.pings.filter((p) => now - p.t0 < 3000);
}

// ------------------------------------------------------------------ effects
function burst(x, y, color, n, speed = 180, size = 5, life = 0.45) {
  if (SETTINGS.lowGfx) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * (0.6 + Math.random() * 0.8) });
  }
}
const KIND_COL = ['#7db8ff', '#ffb347', '#c9a6ff'];
function applyFx([type, x, y, v, id, extra]) {
  const dist = G.me ? Math.hypot(x - G.pred.x, y - G.pred.y) : 9999, near = dist < 700, vol = falloff(dist);
  const S = { hit: id === G.myId ? 'hurt' : 'hit', die: 'elim', slam: 'slam', boom: 'boom', worm: 'worm', blink: 'blink', cloak: 'cloak', dash: 'super', cube: 'pickup', gem: 'pickup', cage: 'super', wormwarn: 'super' }[type];
  if (S && (type !== 'hit' || id)) sfx(S, type === 'hit' && id !== G.myId ? vol * 0.6 : vol);
  switch (type) {
    case 'dmg':
      G.texts.push({ x: x + (Math.random() - 0.5) * 20, y: y - 70, txt: String(v), color: id === G.myId ? '#ff4d5e' : '#fff', life: 0.9, max: 0.9, size: v >= 1000 ? 26 : 20 });
      if (!SETTINGS.reduceFlash) G.flash[id] = 0.12;
      if (id === G.myId) { G.hurt = SETTINGS.reduceFlash ? 0.18 : 0.35; G.shake = Math.max(G.shake, 6); }
      break;
    case 'hit': burst(x, y, KIND_COL[v] || '#fff', 7, 200, 5, 0.3); break;
    case 'wall': burst(x, y, '#d8cfff', 4, 120, 4, 0.25); break;
    case 'crate':
      burst(x, y, v ? '#ffd23f' : '#d98c3f', 16, 260, 7, 0.6); burst(x, y, v ? '#1f6f8b' : '#8a4b1f', 8, 200, 6, 0.5);
      if (near) G.shake = Math.max(G.shake, 5);
      break;
    case 'die':
      burst(x, y, '#fff', 18, 300, 8, 0.7); burst(x, y, BRAWLERS[BRAWLER_IDS[v]]?.color || '#fff', 18, 240, 7, 0.8);
      G.rings.push({ x, y, r0: 10, r1: 110, life: 0.5, max: 0.5, color: '#fff', w: 8 });
      if (extra) killFx(extra, x, y);
      break;
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
  if (id === 'sparks') burst(x, y, '#ffe066', 24, 380, 4, 0.6);
  else if (id === 'stars') for (let i = 0; i < 6; i++) G.texts.push({ x: x + (Math.random() - 0.5) * 80, y: y - 30 - Math.random() * 50, txt: '★', color: '#ffd23f', life: 0.9, max: 0.9, size: 26 });
  else if (id === 'confetti') for (const c of ['#ff4d5e', '#4be06e', '#3a86ff', '#ffd23f', '#c04dff']) burst(x, y - 20, c, 6, 260, 5, 0.9);
  else if (id === 'ghost') G.texts.push({ x, y: y - 40, txt: '👻', color: '#fff', life: 1.4, max: 1.4, size: 34 });
  else if (id === 'bolt') { G.rings.push({ x, y, r0: 120, r1: 10, life: 0.35, max: 0.35, color: '#5ff4ff', w: 10, ink: true }); G.texts.push({ x, y: y - 60, txt: '⚡', color: '#5ff4ff', life: 0.8, max: 0.8, size: 40 }); }
}

function updateEffects(dt) {
  for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
  G.parts = G.parts.filter((p) => p.life > 0);
  for (const r of G.rings) r.life -= dt;
  for (const s of G.slashes) s.life -= dt;
  G.slashes = G.slashes.filter((s) => s.life > 0);
  for (const w of G.worms) w.life -= dt;
  G.worms = G.worms.filter((w) => w.life > 0);
  G.rings = G.rings.filter((r) => r.life > 0);
  for (const t of G.texts) { t.life -= dt; t.y -= 40 * dt; }
  G.texts = G.texts.filter((t) => t.life > 0);
  for (const k in G.flash) { G.flash[k] -= dt; if (G.flash[k] <= 0) delete G.flash[k]; }
  G.shake = SETTINGS.reduceFlash ? 0 : Math.max(0, G.shake - dt * 30);
  G.hurt = Math.max(0, G.hurt - dt);
  const k = Math.exp(-dt * 10);
  G.err.x *= k; G.err.y *= k;
}

// ------------------------------------------------------------------ local bullets (prediction)
function spawnLocalShot(x, y, ang) {
  const a = BRAWLERS[G.brawler].attack;
  const sp = a.speed * (G.mods.bulletSpeed || 1), range = a.range * (G.mods.bulletRange || 1);
  for (const d of attackDirs(G.brawler, ang)) {
    G.localBullets.push({ x: x + Math.cos(d) * 16, y: y + Math.sin(d) * 16, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, dist: 0, range, ang: d });
  }
}
function updateLocalBullets(dt) {
  const A = BRAWLERS[G.brawler].attack;
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
      if (A.kind !== 'wave') for (const o of G.view.others) if ((!o.team || o.team !== G.me?.tm) && Math.hypot(o.x - b.x, o.y - b.y) < PLAYER_R * sizeOf(o) + A.radius) dead = true;
      if (b.dist >= b.range) dead = true;
    }
    if (!dead) out.push(b);
  }
  G.localBullets = out;
}
function localSlash(ang) {
  const me = renderMe();
  G.slashes.push({ x: me.x, y: me.y, ang, life: 0.18, max: 0.18, follow: true, flip: (G.slashFlip = !G.slashFlip) });
}
const sizeOf = (o) => moveStats(o.brawler || 'volt', o.hp, o.mh).r / PLAYER_R;

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
  let best = null, bd = Infinity;
  for (const o of G.view.others) {
    if (o.fl & 16 || (o.team && o.team === G.me?.tm)) continue;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < Math.max(reach, 700)) return Math.atan2(best.y - me.y, best.x - me.x);
  return G.facing;
}

function clientTick() {
  G.ticks++;
  manageZones();
  if (!G.me || G.phase !== 'play') return;
  const B = BRAWLERS[G.brawler];
  const me = G.me;
  const mv = input.getMove();
  let f = null, u = null, fd = 1;
  const safe = G.kind === 'free' && inHub(G.pred.x, G.pred.y);
  for (const a of input.takeActions()) {
    const ang = a.mode === 'angle' ? a.ang : a.mode === 'mouse' ? mouseAngle() : autoAngle(a.type);
    if (safe) continue;
    if (a.type === 'fire') {
      const shotsPending = G.pending.filter((q) => q.f).length;
      if (me.al && !(me.f & 2) && !me.fo && G.localCd <= 0 && !G.localBurst && Math.floor(me.am) - shotsPending >= 1 && f == null && !G.handoff) {
        f = ang; G.facing = ang; G.localCd = B.attack.cooldown;
        fd = a.mag ?? (a.mode === 'mouse' ? Math.min(1, Math.hypot(input.mouse.x - W / 2, input.mouse.y - H / 2) / (B.attack.range * worldScale())) : 1);
        sfx('shoot_' + G.brawler);
        if (PREDICTED_KINDS.includes(B.attack.kind)) spawnLocalShot(G.pred.x, G.pred.y, ang);
        if (B.attack.kind === 'slash') localSlash(ang);
        if (B.attack.kind === 'burst' || B.attack.kind === 'slash') G.localBurst = { left: B.attack.count - 1, t: B.attack.interval, ang };
      }
    } else if (me.sc >= 1 && G.superCd <= 0 && me.al) { u = ang; G.superCd = 0.6; G.facing = ang; sfx('super'); }
  }
  const aim = input.getAim();
  if (aim) G.facing = aim.ang;
  else if (!input.isTouch && input.mouse.active) G.facing = mouseAngle();
  else if (Math.hypot(mv.x, mv.y) > 0.2 && G.localCd <= 0) G.facing = Math.atan2(mv.y, mv.x);
  G.moving = Math.hypot(mv.x, mv.y) > 0.1;

  G.prev = { x: G.pred.x, y: G.pred.y };
  G.mods = primaryMods();
  if (me.al && !me.fo) {
    const st = moveStats(G.brawler, me.hp, me.mh, me.rs, me.sl);
    applyMove(G.map, G.pred, mv.x, mv.y, st.speed, st.r, G.mods);
  }
  G.seq++;
  const ax = +Math.cos(G.facing).toFixed(3), ay = +Math.sin(G.facing).toFixed(3);
  const inp = { t: 'in', s: G.seq, mx: +mv.x.toFixed(3), my: +mv.y.toFixed(3), ax, ay, f, u, ...(f != null && fd < 1 ? { fd: +fd.toFixed(2) } : {}) };
  G.pending.push({ s: G.seq, mx: inp.mx, my: inp.my, ax, ay, f: f != null });
  if (G.pending.length > 60) G.pending.shift();
  send(inp);
  G.localCd -= DT; G.superCd -= DT;
}

// ------------------------------------------------------------------ render
let lastT = performance.now();
function frame(now) {
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
    adaptResolution(dt * 1000);
    updateHud(now);
  } else if (G.phase === 'mapview') drawMapView(now / 1000);

  requestAnimationFrame(frame);
}

function render(t) {
  const s = worldScale();
  const mePos = renderMe();
  const meAlive = !!G.me.al;
  let target = mePos;
  if (!meAlive) {
    const o = G.view.others.find((p) => p.id === G.spectate) || (G.kind === 'quick' && G.modeKey === 'showdown' ? G.view.others[0] : null);
    if (o) { target = o; G.spectate = o.id; } else target = G.cam;
    G.cam.x += (target.x - G.cam.x) * 0.12; G.cam.y += (target.y - G.cam.y) * 0.12;
  } else { G.cam.x = target.x; G.cam.y = target.y; }
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
  const evs = [...G.conns.values()].map((c) => c.ev).filter(Boolean);
  for (const e of evs) if (EVENTS[e.id].layer === 'ground') EVENTS[e.id].draw?.(ctx, e.p, e.ph, t, helpers);

  if (meAlive && G.phase === 'play') {
    const aim = input.getAim();
    if (aim && !aim.cancel) R.drawAim(ctx, G.brawler, mePos.x, mePos.y, aim.ang, aim.kind, aim.mag);
    else if (!input.isTouch && input.mouse.active) { ctx.globalAlpha = 0.45; R.drawAim(ctx, G.brawler, mePos.x, mePos.y, mouseAngle(), 'fire', Math.hypot(input.mouse.x - W / 2, input.mouse.y - H / 2) / (BRAWLERS[G.brawler].attack.range * s)); ctx.globalAlpha = 1; }
  }
  for (const c of G.view.cubes) R.drawCube(ctx, c[1], c[2], t);
  for (const c of G.view.crystals) R.drawCrystal(ctx, c[1], c[2], t);
  for (const mn of G.view.mines) R.drawMine(ctx, mn[1], mn[2], mn[3], mn[4] === G.myId, t);
  if (!SETTINGS.lowGfx) art.drawShadows(ctx, G.map, view);
  art.draw(ctx, G.map, view, t, SETTINGS);
  R.drawBlocks(ctx, G.map, G.crateHp, x0, y0, x1, y1);

  const list = G.view.others.map((o) => ({ ...o, me: false, size: sizeOf(o) }));
  if (meAlive) {
    const me = G.me;
    list.push({
      id: G.myId, x: mePos.x, y: mePos.y, hp: me.hp, mh: me.mh, cu: me.cu, facing: G.facing, fl: me.f, name: G.roster[G.myId]?.[0] || 'You',
      brawler: G.brawler, moving: G.moving, stun: me.f & 2, me: true, skin: G.roster[G.myId]?.[3]?.skin, title: G.roster[G.myId]?.[3]?.title ? TITLES[G.roster[G.myId][3].title] : null, bt: me.bt, glow: me.gl, cr: me.cr, size: moveStats(G.brawler, me.hp, me.mh).r / PLAYER_R,
    });
  }
  list.sort((a, b) => a.y - b.y);
  const myTeam = G.me.tm || 0;
  for (const p of list) { if (myTeam) R.drawTeamRing(ctx, p, p.me || p.team === myTeam); else R.drawRim(ctx, G.map, p); }
  for (const p of list) R.drawAura(ctx, p, t);
  for (const p of list) {
    let alpha = 1;
    if (p.fl & 4) alpha = p.me ? 0.45 + Math.sin(t * 8) * 0.08 : 0.35;
    else if (p.fl & 1) alpha = p.me ? 0.7 : 0.75;
    if (G.flash['dash' + p.id] > 0) {
      for (let i = 1; i <= 3; i++) R.drawBrawler(ctx, p.brawler, p.x - Math.cos(p.facing) * i * 22, p.y - Math.sin(p.facing) * i * 22, p.facing, t, { alpha: 0.18 * (4 - i), size: p.size });
    }
    R.drawBrawler(ctx, p.brawler, p.x, p.y, p.facing, t, { alpha, moving: p.moving, flash: G.flash[p.id], size: p.size, skin: p.skin });
    R.drawBubble(ctx, p, t);
    if (p.fl & 512) R.drawSlowed(ctx, p.x, p.y, t);
    if (p.fl & 256) R.drawCage(ctx, p.x, p.y);
  }
  for (const w of G.worms) R.drawWorm(ctx, w.x, w.y, w.r, 1 - w.life / w.max);
  for (const sl of G.slashes) {
    const k = 1 - sl.life / sl.max, x = sl.follow ? mePos.x : sl.x, y = sl.follow ? mePos.y : sl.y;
    const A = BRAWLERS.flicker.attack, a0 = sl.ang - A.arc / 2, sweep = A.arc * Math.min(1, k * 1.8);
    ctx.save(); ctx.globalAlpha = 1 - k * 0.6; ctx.lineCap = 'round';
    ctx.beginPath(); sl.flip ? ctx.arc(x, y, A.range * 0.85, a0 + A.arc - sweep, a0 + A.arc) : ctx.arc(x, y, A.range * 0.85, a0, a0 + sweep);
    ctx.lineWidth = 16; ctx.strokeStyle = R.INK; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = '#ff5fa2'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
  const rimAt = (x, y) => R.theme(worldKeyAt(G.map, x, y)).bulletRim;
  if (!SETTINGS.lowGfx) { for (const b of G.view.bullets) R.drawTrail(ctx, b.kind, b.x, b.y, b.ang); for (const b of G.localBullets) R.drawTrail(ctx, G.brawler, b.x, b.y, b.ang); }
  for (const b of G.view.bullets) R.drawBullet(ctx, b.kind, b.x, b.y, b.ang, rimAt(b.x, b.y));
  for (const b of G.localBullets) R.drawBullet(ctx, G.brawler, b.x, b.y, b.ang, rimAt(b.x, b.y));

  R.drawBushes(ctx, G.map, x0, y0, x1, y1, meAlive ? mePos : null, t);
  for (const e of evs) if (EVENTS[e.id].layer !== 'ground') EVENTS[e.id].draw?.(ctx, e.p, e.ph, t, helpers);
  if (!SETTINGS.lowGfx) R.drawAmbient(ctx, G.map, view, t, false);
  const P = primary();
  if (P && P.last && P.last.z > 0) R.drawPoison(ctx, P.last.z, ARENA_SIZE, x0, y0, x1, y1, t);

  for (const r of G.rings) {
    const k = 1 - r.life / r.max;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r0 + (r.r1 - r.r0) * k), 0, Math.PI * 2);
    ctx.globalAlpha = 1 - k; if (r.ink) { ctx.lineWidth = r.w + 5; ctx.strokeStyle = R.INK; ctx.stroke(); } ctx.lineWidth = r.w; ctx.strokeStyle = r.color; ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const p of G.parts) {
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of list) { if (p.fl & 4 && !p.me && p.team !== myTeam) continue; R.drawStatus(ctx, p, p.me, t, myTeam ? (p.me || p.team === myTeam ? 'mate' : 'foe') : null); }
  if (meAlive) {
    R.drawAmmo(ctx, mePos.x, mePos.y, G.me.am, G.me.sc >= 1, t);
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
  ctx.restore();

  // ---- screen space
  if (!SETTINGS.lowGfx) R.drawGrade(ctx, G.map, cam, W, H);
  const pe = P?.ev;
  if (pe && EVENTS[pe.id].drawScreen) EVENTS[pe.id].drawScreen(ctx, pe.p, pe.ph, t, W, H, s);
  if (G.hurt > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${G.hurt})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (meAlive && P && P.last && P.last.z > 0) {
    const z = P.last.z;
    if (mePos.x < z || mePos.y < z || mePos.x > ARENA_SIZE - z || mePos.y > ARENA_SIZE - z) { ctx.fillStyle = `rgba(80,220,90,${SETTINGS.reduceFlash ? 0.15 : 0.15 + Math.sin(t * 6) * 0.05})`; ctx.fillRect(0, 0, W, H); }
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
  R.drawRadar(ctx, 12 + radarR, 36 + radarR, radarR, { x: cam.x, y: cam.y },
    [...G.pings.map((p) => ({ ...p, age: (now - p.t0) / 1000 })), ...(G.mates || []).map(([id, x, y]) => ({ id, x, y, bt: 0, age: 0, mate: true }))],
    { poison: P?.last?.z ? { inset: P.last.z, size: ARENA_SIZE } : null, hub: G.kind === 'free', zones: G.kind === 'free', range: 1600 }, t);
  if (G.phase === 'play' && meAlive) R.drawControls(ctx, input, G.me.sc, G.brawler, t, G.kind === 'free' && inHub(mePos.x, mePos.y));
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
  if (m.kind === 'arena') for (const sp of SPAWNS) {
    ctx.beginPath(); ctx.arc(sp.x, sp.y, SPAWN_COVER_DIST, 0, Math.PI * 2); ctx.strokeStyle = spawnHasCover(m, sp) ? 'rgba(75,224,110,0.8)' : 'rgba(255,0,0,1)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2); ctx.fillStyle = '#4be06e'; ctx.fill();
  }
  ctx.restore();
  const st = art.stats();
  R.outlinedText(ctx, `MAPVIEW · ${m.kind === 'arena' ? m.world + ' arena' : 'Free Play world'} · ${m.pieces.length} cover pieces · art sprites ${st.sprites} · worlds cached ${st.worlds.join(',')}`, W / 2, 16, 14, '#fff', '#000');
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
$('spectate').onclick = () => { $('dead').hidden = true; $('hudAgain').hidden = false; };
for (const [id, key] of [['setFlash', 'reduceFlash'], ['setLow', 'lowGfx'], ['setSound', 'sound']]) {
  $(id).checked = !!SETTINGS[key];
  $(id).onchange = () => { setSetting(key, $(id).checked); applySettings(); };
}
function applySettings() { document.body.classList.toggle('reduce-flash', SETTINGS.reduceFlash); resize(); }
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
  getBrawler: () => selBrawler,
  setBrawler: (id) => { selBrawler = id; prefs.brawler = id; savePrefs(); UI.lobby?.refresh(); },
  prefs, saveName: () => { readForm(); UI.lobby?.refresh(); }, statRows,
});
UI.mm = createMatchmaking(() => toMenu());
UI.res = createResults({ onAgain: playAgain, onLobby: () => toMenu() });
UI.showIntro = showIntro;


// Test flags: ?world=<key>[&mode=<mode>] drops you straight into that arena with bots; ?free=1 into Free Play.
const qs = new URLSearchParams(location.search);
if (qs.get('mapview')) {
  G.phase = 'mapview';
  G.map = qs.get('free') ? generateWorld() : generateArena(+(qs.get('seed') || 7), qs.get('world') || 'meadow');
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
