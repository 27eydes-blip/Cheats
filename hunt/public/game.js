// Client: lobby UI, WebSocket protocol, own-player prediction + reconciliation,
// snapshot interpolation for everything else, local bullet prediction, effects.
import {
  BRAWLERS, BRAWLER_IDS, DT, TICK_RATE, EMPTY, PLAYER_R, MAP_SIZE, POISON_START,
  generateMap, applyMove, attackDirs, tileAt, isSolidTile,
} from './shared.js';
import { Input } from './input.js';
import * as R from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const TICK_MS = 1000 / TICK_RATE;
const INTERP_MS = 110;

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  input.layout(W, H);
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ prefs + lobby
const prefs = (() => { try { return JSON.parse(localStorage.getItem('hunt') || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('hunt', JSON.stringify(prefs)); } catch {} };
let selBrawler = BRAWLERS[prefs.brawler] ? prefs.brawler : 'volt';
$('name').value = prefs.name || '';
$('room').value = prefs.room || '';
$('bots').checked = prefs.bots !== false;

function buildCards() {
  const wrap = $('cards');
  wrap.innerHTML = '';
  for (const id of BRAWLER_IDS) {
    const B = BRAWLERS[id];
    const el = document.createElement('div');
    el.className = 'card' + (id === selBrawler ? ' sel' : '');
    el.innerHTML = `<canvas></canvas><div class="nm">${B.name}</div><div class="role">${B.role.toUpperCase()}</div>
      <div class="stats">${B.hp} HP · ${B.speed > 260 ? 'Fast' : B.speed < 230 ? 'Slow' : 'Normal'} · ${B.attack.range > 800 ? 'Long' : B.attack.range < 400 ? 'Short' : 'Mid'} range<br>${B.blurb}</div>`;
    el.onclick = () => { selBrawler = id; prefs.brawler = id; savePrefs(); for (const c of wrap.children) c.classList.remove('sel'); el.classList.add('sel'); };
    wrap.appendChild(el);
    R.drawPortrait(el.querySelector('canvas'), id);
  }
}
document.fonts?.load(`20px ${R.FONT}`).finally(buildCards);

function show(screen) {
  for (const id of ['lobby', 'waiting', 'dead', 'end']) $(id).hidden = id !== screen;
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

// ------------------------------------------------------------------ game state
const G = {
  phase: 'menu', ws: null, myId: 0, brawler: 'volt', tiles: null, roster: {}, snaps: [], crateHp: new Map(),
  pending: [], seq: 0, pred: { x: 0, y: 0 }, prev: { x: 0, y: 0 }, err: { x: 0, y: 0 }, me: null,
  inset: 0, alive: 10, tm: 0, localBullets: [], localBurst: null, localCd: 0, superCd: 0,
  parts: [], rings: [], texts: [], flash: {}, shake: 0, hurt: 0, spectate: 0, timeOffset: null,
  fxApplied: 0, room: '', retries: 0, facing: 0, moving: false, view: { others: [], bullets: [], cubes: [] },
  cam: { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }, acc: 0, results: null, ping: 0,
};

function resetMatchState() {
  Object.assign(G, {
    myId: 0, tiles: null, roster: {}, snaps: [], crateHp: new Map(), pending: [], seq: 0, me: null,
    err: { x: 0, y: 0 }, inset: 0, alive: 10, tm: 0, localBullets: [], localBurst: null, localCd: 0, superCd: 0,
    parts: [], rings: [], texts: [], flash: {}, shake: 0, hurt: 0, spectate: 0, timeOffset: null, fxApplied: 0, results: null,
  });
  $('feed').innerHTML = '';
  $('hudAgain').hidden = true;
}

function connect(skip) {
  if (G.ws) { const old = G.ws; G.ws = null; try { old.close(); } catch {} }
  const name = $('name').value.trim().slice(0, 14) || 'Hunter';
  const room = $('room').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  prefs.name = name; prefs.room = room; savePrefs();
  G.room = room;
  G.brawler = selBrawler;
  const q = new URLSearchParams({ name, brawler: selBrawler });
  if (room) q.set('room', room);
  if (skip) q.set('skip', skip);
  if (room && !$('bots').checked) q.set('bots', '0');
  prefs.bots = $('bots').checked;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?${q}`);
  G.ws = ws;
  resetMatchState();
  G.phase = 'waiting';
  $('countdown').textContent = '…';
  $('plist').innerHTML = '';
  $('roomLabel').textContent = room ? `Room ${room}` : 'Quick play';
  show('waiting');
  ws.onmessage = (e) => { if (G.ws === ws) onMsg(JSON.parse(e.data)); };
  ws.onclose = () => {
    if (G.ws !== ws) return;
    G.ws = null;
    if (G.phase === 'waiting' || G.phase === 'play') { toast('Connection lost'); toMenu(); }
  };
}

function toMenu() {
  if (G.ws) { const old = G.ws; G.ws = null; try { old.close(); } catch {} }
  G.phase = 'menu';
  input.enabled = false;
  input.reset();
  show('lobby');
}

function send(o) { if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(o)); }
setInterval(() => send({ t: 'ping', c: performance.now() }), 2000);

function onMsg(m) {
  switch (m.t) {
    case 'welcome': G.myId = m.id; G.retries = 0; G.botsOn = m.bots; break;
    case 'lobby': {
      $('countdown').textContent = m.startIn == null ? '…' : Math.ceil(m.startIn);
      $('plist').innerHTML = m.players.map(([n, b]) => `<li>${esc(n)} · ${BRAWLERS[b].name}</li>`).join('') +
        (G.botsOn ? `<li style="opacity:.6">+ ${10 - m.players.length} bots</li>` : '');
      break;
    }
    case 'retry':
      if (!G.room && G.retries++ < 5) setTimeout(() => connect(m.match), 150);
      else { toast(m.reason + (G.room ? ' — try again when it ends' : '')); toMenu(); }
      break;
    case 'start':
      G.myId = m.you;
      G.roster = m.roster;
      G.tiles = generateMap(m.seed);
      G.phase = 'play';
      input.enabled = true;
      input.reset();
      show(null);
      break;
    case 's': onSnapshot(m); break;
    case 'kill': addFeed(m); break;
    case 'dead':
      G.phase = 'dead';
      G.spectate = m.killerId;
      input.enabled = false; input.reset();
      $('deadRank').textContent = '#' + m.rank;
      $('deadBy').textContent = `Eliminated by ${m.killer}`;
      setTimeout(() => { if (G.phase === 'dead') show('dead'); }, 1200);
      break;
    case 'end': {
      const won = m.rank === 1;
      G.phase = 'end';
      input.enabled = false; input.reset();
      $('endRank').textContent = '#' + m.rank;
      $('endMsg').textContent = won ? 'VICTORY! Last hunter standing.' : `${m.winner || 'Nobody'} won the hunt.`;
      $('results').innerHTML = m.results.map(([n, b, r, k, bot, id]) =>
        `<li class="${id === G.myId ? 'me' : ''}"><span class="r">#${r}</span>${esc(n)}${bot ? ' 🤖' : ''}<span class="k">${BRAWLERS[b].name} · ${k} KO</span></li>`).join('');
      setTimeout(() => { if (G.phase === 'end') show('end'); }, won ? 1800 : 600);
      break;
    }
    case 'pong': G.ping = Math.round(performance.now() - m.c); $('ping').textContent = `${G.ping} ms`; break;
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function addFeed(m) {
  const el = document.createElement('div');
  el.className = 'kf';
  const cls = (id) => (id === G.myId ? 'me' : '');
  el.innerHTML = `<span class="${cls(m.kid)}">${esc(m.k)}</span><span class="x">✖</span><span class="${cls(m.vid)}">${esc(m.v)}</span>`;
  const feed = $('feed');
  feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 4500);
}

// ------------------------------------------------------------------ snapshots
function onSnapshot(m) {
  if (!G.tiles) return;
  const now = performance.now();
  const off = now - m.n * TICK_MS;
  if (G.timeOffset == null || off < G.timeOffset) G.timeOffset = off;
  else G.timeOffset += (off - G.timeOffset) * 0.02;

  const p = new Map(), b = new Map();
  for (const e of m.p) p.set(e[0], e);
  for (const e of m.b) b.set(e[0], e);
  G.snaps.push({ n: m.n, p, b, cu: m.cu, fx: m.fx });
  if (G.snaps.length > 40) G.snaps.shift();

  for (const [idx, hp] of m.cr) {
    if (hp <= 0) { G.tiles[idx] = EMPTY; G.crateHp.delete(idx); } else G.crateHp.set(idx, hp);
  }
  G.inset = m.z; G.alive = m.al; G.tm = m.tm;

  const me = m.me;
  const first = !G.me;
  G.me = me;
  if (first) { G.pred = { x: me.x, y: me.y }; G.prev = { ...G.pred }; G.pending = []; return; }

  // reconcile own prediction: start from server state, replay unacknowledged inputs
  G.pending = G.pending.filter((q) => q.s > m.ack);
  const np = { x: me.x, y: me.y };
  if (!me.al || me.fo) G.pending = [];
  else for (const q of G.pending) applyMove(G.tiles, np, q.mx, q.my, BRAWLERS[G.brawler].speed);
  const dx = G.pred.x - np.x, dy = G.pred.y - np.y;
  if (Math.hypot(dx, dy) > 220) { G.err.x = G.err.y = 0; G.prev = { ...np }; }
  else { G.err.x += dx; G.err.y += dy; G.prev.x -= dx; G.prev.y -= dy; }
  G.pred = np;
}

// interpolated view of the world at (server time - INTERP_MS)
function sampleWorld() {
  const s = G.snaps;
  if (!s.length || G.timeOffset == null) return;
  const rt = (performance.now() - G.timeOffset - INTERP_MS) / TICK_MS; // in ticks
  let a = s[0], b = s[0], f = 0;
  if (rt >= s[s.length - 1].n) { a = b = s[s.length - 1]; }
  else {
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].n <= rt && rt < s[i + 1].n) { a = s[i]; b = s[i + 1]; f = (rt - a.n) / (b.n - a.n); break; }
    }
  }
  // fire effects up to current render time
  for (const snap of s) {
    if (snap.n > G.fxApplied && snap.n <= Math.max(rt, a.n)) { G.fxApplied = snap.n; for (const e of snap.fx) applyFx(e); }
  }
  const others = [];
  for (const [id, e] of b.p) {
    const ea = a.p.get(id) || e;
    const r = G.roster[id] || ['?', 'volt'];
    let da = e[5] - ea[5];
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    others.push({
      id, x: ea[1] + (e[1] - ea[1]) * f, y: ea[2] + (e[2] - ea[2]) * f, hp: e[3], mh: e[4], facing: ea[5] + da * f,
      fl: e[6], cu: e[7], name: r[0], brawler: r[1], moving: Math.hypot(e[1] - ea[1], e[2] - ea[2]) > 1, stun: e[6] & 2,
    });
  }
  const bullets = [];
  for (const [id, e] of b.b) {
    if (e[3] === G.myId) continue; // own bullets are predicted locally
    const ea = a.b.get(id);
    const x = ea ? ea[1] + (e[1] - ea[1]) * f : e[1], y = ea ? ea[2] + (e[2] - ea[2]) * f : e[2];
    const ang = ea ? Math.atan2(e[2] - ea[2], e[1] - ea[1]) : (bulletAng.get(id) ?? 0);
    if (ea) bulletAng.set(id, ang);
    bullets.push({ x, y, ang, kind: BRAWLER_IDS[e[4]] });
  }
  if (bulletAng.size > 500) bulletAng.clear();
  G.view = { others, bullets, cubes: b.cu };
}
const bulletAng = new Map();

// ------------------------------------------------------------------ effects
function burst(x, y, color, n, speed = 180, size = 5, life = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * (0.6 + Math.random() * 0.8) });
  }
}
const KIND_COL = ['#7db8ff', '#ffb347', '#c9a6ff'];
function applyFx([type, x, y, v, id]) {
  const near = G.me && Math.hypot(x - G.pred.x, y - G.pred.y) < 700;
  switch (type) {
    case 'dmg':
      G.texts.push({ x: x + (Math.random() - 0.5) * 20, y: y - 70, txt: String(v), color: id === G.myId ? '#ff4d5e' : '#fff', life: 0.9, max: 0.9, size: v >= 1000 ? 26 : 20 });
      G.flash[id] = 0.12;
      if (id === G.myId) { G.hurt = 0.35; G.shake = Math.max(G.shake, 6); }
      break;
    case 'hit': burst(x, y, KIND_COL[v] || '#fff', 7, 200, 5, 0.3); break;
    case 'wall': burst(x, y, '#d8cfff', 4, 120, 4, 0.25); break;
    case 'crate': burst(x, y, '#d98c3f', 16, 260, 7, 0.6); burst(x, y, '#8a4b1f', 8, 200, 6, 0.5); if (near) G.shake = Math.max(G.shake, 5); break;
    case 'die':
      burst(x, y, '#fff', 18, 300, 8, 0.7); burst(x, y, BRAWLERS[BRAWLER_IDS[v]]?.color || '#fff', 18, 240, 7, 0.8);
      G.rings.push({ x, y, r0: 10, r1: 110, life: 0.5, max: 0.5, color: '#fff', w: 8 });
      break;
    case 'slam':
      G.rings.push({ x, y, r0: 20, r1: v, life: 0.45, max: 0.45, color: '#ffd23f', w: 14 });
      G.rings.push({ x, y, r0: 10, r1: v * 0.7, life: 0.35, max: 0.35, color: '#ff7b39', w: 8 });
      burst(x, y, '#c9a27a', 26, 380, 8, 0.6);
      if (near) G.shake = Math.max(G.shake, 14);
      break;
    case 'dash': G.rings.push({ x, y, r0: 10, r1: 60, life: 0.3, max: 0.3, color: '#7db8ff', w: 6 }); G.flash['dash' + id] = 0.3; break;
    case 'cube':
      G.texts.push({ x, y: y - 80, txt: '+POWER', color: '#7dff7a', life: 1, max: 1, size: 18 });
      burst(x, y, '#7dff7a', 14, 200, 6, 0.5);
      break;
    case 'cloak': burst(x, y, '#c9a6ff', 20, 160, 9, 0.6); break;
  }
}

function updateEffects(dt) {
  for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
  G.parts = G.parts.filter((p) => p.life > 0);
  for (const r of G.rings) r.life -= dt;
  G.rings = G.rings.filter((r) => r.life > 0);
  for (const t of G.texts) { t.life -= dt; t.y -= 40 * dt; }
  G.texts = G.texts.filter((t) => t.life > 0);
  for (const k in G.flash) { G.flash[k] -= dt; if (G.flash[k] <= 0) delete G.flash[k]; }
  G.shake = Math.max(0, G.shake - dt * 30);
  G.hurt = Math.max(0, G.hurt - dt);
  const k = Math.exp(-dt * 10);
  G.err.x *= k; G.err.y *= k;
}

// ------------------------------------------------------------------ local bullets (prediction)
function spawnLocalShot(x, y, ang) {
  const a = BRAWLERS[G.brawler].attack;
  for (const d of attackDirs(G.brawler, ang)) {
    G.localBullets.push({ x: x + Math.cos(d) * PLAYER_R * 0.6, y: y + Math.sin(d) * PLAYER_R * 0.6, vx: Math.cos(d) * a.speed, vy: Math.sin(d) * a.speed, dist: 0, range: a.range, ang: d });
  }
}

function updateLocalBullets(dt) {
  const A = BRAWLERS[G.brawler].attack;
  if (G.localBurst) {
    G.localBurst.t -= dt;
    if (G.localBurst.t <= 0) {
      const me = renderMe();
      spawnLocalShot(me.x, me.y, G.localBurst.ang);
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
      if (isSolidTile(tileAt(G.tiles, b.x, b.y))) dead = true;
      for (const o of G.view.others) if (Math.hypot(o.x - b.x, o.y - b.y) < PLAYER_R + A.radius) dead = true;
      if (b.dist >= b.range) dead = true;
    }
    if (!dead) out.push(b);
  }
  G.localBullets = out;
}

// ------------------------------------------------------------------ input tick (20 Hz, same as server)
function renderMe() {
  const a = Math.min(1, G.acc / DT);
  return { x: G.prev.x + (G.pred.x - G.prev.x) * a + G.err.x, y: G.prev.y + (G.pred.y - G.prev.y) * a + G.err.y };
}

function worldScale() { return Math.min(H / 680, W / 1150); }

function mouseAngle() {
  return Math.atan2(input.mouse.y - H / 2, input.mouse.x - W / 2); // camera is centred on me
}

function autoAngle(kind) {
  const B = BRAWLERS[G.brawler];
  const me = G.pred;
  const reach = kind === 'super' ? (B.super.dist || B.super.radius || 600) + 150 : B.attack.range * 1.15;
  let best = null, bd = Infinity;
  for (const o of G.view.others) {
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < Math.max(reach, 700)) return Math.atan2(best.y - me.y, best.x - me.x);
  return G.facing;
}

function clientTick() {
  if (!G.me || !G.ws || G.phase !== 'play') return;
  const B = BRAWLERS[G.brawler];
  const me = G.me;
  const mv = input.getMove();
  let f = null, u = null;
  for (const a of input.takeActions()) {
    const ang = a.mode === 'angle' ? a.ang : a.mode === 'mouse' ? mouseAngle() : autoAngle(a.type);
    if (a.type === 'fire') {
      const shotsPending = G.pending.filter((q) => q.f).length;
      if (me.al && !(me.f & 2) && !me.fo && G.localCd <= 0 && !G.localBurst && Math.floor(me.am) - shotsPending >= 1 && f == null) {
        f = ang;
        G.facing = ang;
        G.localCd = B.attack.cooldown;
        spawnLocalShot(G.pred.x, G.pred.y, ang);
        if (B.attack.kind === 'burst') G.localBurst = { left: B.attack.count - 1, t: B.attack.interval, ang };
      }
    } else if (me.sc >= 1 && G.superCd <= 0 && me.al) {
      u = ang; G.superCd = 0.6; G.facing = ang;
    }
  }
  const aim = input.getAim();
  if (aim) G.facing = aim.ang;
  else if (!input.isTouch && input.mouse.active) G.facing = mouseAngle();
  else if (Math.hypot(mv.x, mv.y) > 0.2 && G.localCd <= 0) G.facing = Math.atan2(mv.y, mv.x);
  G.moving = Math.hypot(mv.x, mv.y) > 0.1;

  G.prev = { x: G.pred.x, y: G.pred.y };
  if (me.al && !me.fo) applyMove(G.tiles, G.pred, mv.x, mv.y, B.speed);
  G.seq++;
  G.pending.push({ s: G.seq, mx: mv.x, my: mv.y, f: f != null });
  send({ t: 'in', s: G.seq, mx: +mv.x.toFixed(3), my: +mv.y.toFixed(3), ax: +Math.cos(G.facing).toFixed(3), ay: +Math.sin(G.facing).toFixed(3), f, u });
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
    if (G.tiles) updateLocalBullets(dt);
    updateEffects(dt);
    if (G.me && G.tiles) render(now / 1000);
    updateHud();
  } else {
    drawMenuBackdrop(now / 1000);
  }
  requestAnimationFrame(frame);
}

function render(t) {
  const s = worldScale();
  const mePos = renderMe();
  const meAlive = G.me.al;
  // camera: follow me, or spectate someone when dead
  let target = mePos;
  if (!meAlive) {
    const o = G.view.others.find((p) => p.id === G.spectate) || G.view.others.reduce((best, p) => (!best || Math.hypot(p.x - G.cam.x, p.y - G.cam.y) < Math.hypot(best.x - G.cam.x, best.y - G.cam.y) ? p : best), null);
    if (o) { target = o; G.spectate = o.id; } else target = G.cam;
    G.cam.x += (target.x - G.cam.x) * 0.12; G.cam.y += (target.y - G.cam.y) * 0.12;
  } else { G.cam.x = target.x; G.cam.y = target.y; }
  const cam = G.cam;
  const hw = W / 2 / s, hh = H / 2 / s;
  const x0 = cam.x - hw, y0 = cam.y - hh - 60, x1 = cam.x + hw, y1 = cam.y + hh + 60;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(s, s);
  ctx.translate(-cam.x, -cam.y);

  R.drawGround(ctx, x0, y0, x1, y1);

  // aim indicators (under everything)
  if (meAlive && G.phase === 'play') {
    const aim = input.getAim();
    if (aim && !aim.cancel) R.drawAim(ctx, G.brawler, mePos.x, mePos.y, aim.ang, aim.kind);
    else if (!input.isTouch && input.mouse.active) {
      ctx.globalAlpha = 0.45; R.drawAim(ctx, G.brawler, mePos.x, mePos.y, mouseAngle(), 'fire'); ctx.globalAlpha = 1;
    }
  }

  for (const c of G.view.cubes || []) R.drawCube(ctx, c[1], c[2], t);
  R.drawBlocks(ctx, G.tiles, G.crateHp, x0, y0, x1, y1);

  // players sorted by y
  const list = G.view.others.map((o) => ({ ...o, me: false }));
  if (meAlive) {
    list.push({ id: G.myId, x: mePos.x, y: mePos.y, hp: G.me.hp, mh: G.me.mh, cu: G.me.cu, facing: G.facing, fl: G.me.f, name: G.roster[G.myId]?.[0] || 'You', brawler: G.brawler, moving: G.moving, stun: G.me.f & 2, me: true });
  }
  list.sort((a, b) => a.y - b.y);
  for (const p of list) {
    let alpha = 1;
    if (p.fl & 4) alpha = p.me ? 0.45 + Math.sin(t * 8) * 0.08 : 0.35;
    else if (p.fl & 1) alpha = p.me ? 0.7 : 0.75;
    if (G.flash['dash' + p.id] > 0) {
      for (let i = 1; i <= 3; i++) R.drawBrawler(ctx, p.brawler, p.x - Math.cos(p.facing) * i * 22, p.y - Math.sin(p.facing) * i * 22, p.facing, t, { alpha: 0.18 * (4 - i) });
    }
    R.drawBrawler(ctx, p.brawler, p.x, p.y, p.facing, t, { alpha, moving: p.moving, flash: G.flash[p.id] });
  }

  for (const b of G.view.bullets) R.drawBullet(ctx, b.kind, b.x, b.y, b.ang);
  for (const b of G.localBullets) R.drawBullet(ctx, G.brawler, b.x, b.y, b.ang);

  R.drawBushes(ctx, G.tiles, x0, y0, x1, y1, meAlive ? mePos : null, t);
  R.drawPoison(ctx, G.inset, x0, y0, x1, y1, t);

  for (const r of G.rings) {
    const k = 1 - r.life / r.max;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2);
    ctx.globalAlpha = 1 - k; ctx.lineWidth = r.w; ctx.strokeStyle = r.color; ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const p of G.parts) {
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const p of list) {
    if (p.fl & 4 && !p.me) continue;
    R.drawStatus(ctx, p, p.me, t);
  }
  if (meAlive) R.drawAmmo(ctx, mePos.x, mePos.y, G.me.am, G.me.sc >= 1, t);
  for (const tx of G.texts) {
    ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
    R.outlinedText(ctx, tx.txt, tx.x, tx.y, tx.size, tx.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // screen-space
  if (G.hurt > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${G.hurt})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (G.me.al && G.inset > 0) {
    const z = G.inset;
    if (mePos.x < z || mePos.y < z || mePos.x > MAP_SIZE - z || mePos.y > MAP_SIZE - z) {
      ctx.fillStyle = `rgba(80,220,90,${0.15 + Math.sin(t * 6) * 0.05})`; ctx.fillRect(0, 0, W, H);
    }
  }
  if (G.phase === 'play' && G.me.al) R.drawControls(ctx, input, G.me.sc, G.brawler, t);
  if (!G.me.al && G.phase !== 'play') {
    const o = G.view.others.find((p) => p.id === G.spectate);
    if (o) R.outlinedText(ctx, `Spectating ${o.name}`, W / 2, H - 30, 18);
  }
}

let hudT = 0;
function updateHud() {
  if (performance.now() - hudT < 150) return;
  hudT = performance.now();
  $('aliveN').textContent = G.alive;
  const pt = $('poison');
  if (G.tm < POISON_START) { pt.classList.remove('on'); pt.innerHTML = `POISON IN <b>${Math.ceil(POISON_START - G.tm)}</b>`; }
  else { pt.classList.add('on'); pt.textContent = 'POISON CLOSING IN!'; }
}

// gentle animated backdrop behind the lobby
let menuTiles = null;
function drawMenuBackdrop(t) {
  if (!menuTiles) menuTiles = generateMap(7);
  const s = worldScale() * 0.9;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  const cx = 1000 + Math.cos(t * 0.05) * 500, cy = 1000 + Math.sin(t * 0.05) * 500;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-cx, -cy);
  const hw = W / 2 / s, hh = H / 2 / s;
  R.drawGround(ctx, cx - hw, cy - hh, cx + hw, cy + hh);
  R.drawBlocks(ctx, menuTiles, new Map(), cx - hw, cy - hh - 60, cx + hw, cy + hh + 60);
  R.drawBushes(ctx, menuTiles, cx - hw, cy - hh, cx + hw, cy + hh, null, t);
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
$('play').onclick = () => { goFullscreen(); connect(); };
$('cancel').onclick = toMenu;
$('spectate').onclick = () => { $('dead').hidden = true; $('hudAgain').hidden = false; };
for (const b of document.querySelectorAll('.again')) b.onclick = () => connect();
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });
