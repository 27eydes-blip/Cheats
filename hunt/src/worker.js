// Cloudflare Worker entry.
//   /ws        Quick Hunt: Matchmaker DO picks an open match (mode + arena) -> MatchRoom DO
//   /zone      Free Play: one ZoneRoom DO per world zone (nw/ne/se/sw); players are handed off
//              between zone DOs as they walk across borders.
//   everything else: static client from ./public
import { Sim, newId } from './sim.js';
import { QUICK_MODES, RANDOM_MODES, MODES, playersFor } from './modes.js';
import { EVENTS } from '../public/events/index.js';
import { handleApi, userFromToken, recordMatch } from './accounts.js';
import {
  BRAWLERS, DT, WORLDS, ZONES, generateArena, generateWorld, zoneBounds, zoneAt, worldId,
} from '../public/shared.js';

const cleanName = (s) => (s || '').replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 14) || 'Hunter';
const arenaWorlds = () => WORLDS.filter((w) => w.arena).map((w) => w.key);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env);
    if (url.pathname === '/ws' || url.pathname === '/zone') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      let name;
      if (url.pathname === '/zone') {
        const slot = url.searchParams.get('slot');
        if (!ZONES.some((z) => z.slot === slot)) return new Response('bad zone', { status: 400 });
        name = 'zone:' + slot;
        return env.ZONE.get(env.ZONE.idFromName(name)).fetch(req);
      }
      const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      const back = url.searchParams.get('rejoin') ? url.searchParams.get('match') || '' : '';
      if (/^(room:[A-Z0-9]{1,12}|qp:[a-z]+:[a-z]+:[0-9a-f-]{36})$/.test(back)) name = back; // reconnect to the same match
      else if (room) name = 'room:' + room;
      else {
        const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
        const want = QUICK_MODES.includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'any';
        const r = await mm.fetch('https://mm/assign?mode=' + want + '&skip=' + encodeURIComponent(url.searchParams.get('skip') || ''));
        name = await r.text();
      }
      const fwd = new URL(req.url);
      fwd.searchParams.set('match', name);
      return env.MATCH.get(env.MATCH.idFromName(name)).fetch(new Request(fwd, req));
    }
    return env.ASSETS.fetch(req);
  },
};

// Hands out the currently-filling quick-play match: a random event mode on a random arena.
export class Matchmaker {
  // one filling match per requested mode ('any' = random event mode)
  constructor() { this.cur = {}; }
  async fetch(req) {
    const u = new URL(req.url), skip = u.searchParams.get('skip'), want = u.searchParams.get('mode') || 'any';
    const now = Date.now();
    let c = this.cur[want];
    if (!c || c.count >= c.max || now - c.created > 7000 || skip === c.id) {
      const mode = want === 'any' ? pick(RANDOM_MODES) : want;
      c = this.cur[want] = { id: `qp:${mode}:${pick(arenaWorlds())}:${crypto.randomUUID()}`, created: now, count: 0, max: MODES[mode].maxPlayers || 10 };
    }
    c.count++;
    return new Response(c.id);
  }
}

// Fixed-step loop helper shared by both DO kinds.
class Loop {
  constructor(step) { this.step = step; this.timer = null; }
  start() {
    if (this.timer) return;
    this.last = Date.now(); this.acc = 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.acc += (now - this.last) / 1000; this.last = now;
      let n = 0;
      while (this.acc >= DT && n++ < 4) { this.acc -= DT; this.step(); }
      if (this.acc > DT * 4) this.acc = 0;
    }, 25);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
}

const sendJSON = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch {} };
// how long a dropped player's spot is kept for them to reconnect
const REJOIN_GRACE_MS = 25000;

// ------------------------------------------------------------------ Quick Hunt match
export class MatchRoom {
  constructor(state, env) {
    this.env = env;
    this.sim = null;
    this.sockets = null;
    this.endedAt = 0;
    this.emptyAt = 0;
    this.loop = new Loop(() => this.step());
  }

  newMatch(cfg) {
    if (this.dropped) for (const id of [...this.dropped.keys()]) this.abandon(id); // previous match's leavers
    if (this.sockets) for (const ws of this.sockets.values()) { try { ws.close(1000, 'new match'); } catch {} }
    const sockets = new Map();
    this.sockets = sockets;
    this.endedAt = 0;
    this.dropped = new Map(); // player id -> when their socket dropped mid-match
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const map = generateArena(seed, cfg.world, playersFor(cfg.mode));
    if (cfg.open) map.open = true;
    if (cfg.open) for (let y = 1; y < map.gh - 1; y++) for (let x = 1; x < map.gw - 1; x++) map.t[y * map.gw + x] = 0;
    this.sim = new Sim({
      map, mode: cfg.mode, seed, lobbyTime: cfg.lobby, fillBots: cfg.bots, forceEvent: cfg.ev, events: cfg.events,
      send: (id, msg) => { const ws = sockets.get(id); if (ws) sendJSON(ws, msg); },
      hooks: { finished: (rows) => this.recordResults(rows, sockets) },
    });
  }

  // trophies/XP are applied server-side for every player with an account (guests included)
  async recordResults(rows, sockets) {
    if (!this.env.DB) return;
    for (const r of rows) {
      if (!r.p.account || r.p.recorded) continue;
      r.p.recorded = true;
      try {
        const out = await recordMatch(this.env.DB, r.p.account, { rank: r.rank, players: r.players, kills: r.p.kills, bounty: r.p.bountyEarned, brawler: r.p.brawler, won: r.won });
        const ws = sockets.get(r.p.id);
        if (out && ws) sendJSON(ws, { t: 'progress', delta: out.delta, xp: out.xp, progress: out.progress });
      } catch (e) { console.log('recordMatch failed', e && e.message); }
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    const mname = url.searchParams.get('match') || '';
    const isRoom = mname.startsWith('room:');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (url.searchParams.get('rejoin')) return this.rejoin(url, server, client);
    if (!this.sim || this.sim.phase === 'end' || (isRoom && this.sim.phase === 'play' && this.sockets.size === 0)) {
      let mode, world;
      if (isRoom) {
        const qm = url.searchParams.get('mode'), qw = url.searchParams.get('world');
        mode = QUICK_MODES.includes(qm) ? qm : pick(RANDOM_MODES);
        world = worldId(qw) >= 0 && WORLDS[worldId(qw)].arena ? qw : pick(arenaWorlds());
      } else [, mode, world] = mname.split(':');
      const lobby = isRoom ? Math.max(1.5, Math.min(12, Number(url.searchParams.get('lobby')) || 12)) : 8;
      const ev = isRoom && EVENTS[url.searchParams.get('ev')] ? url.searchParams.get('ev') : null;
      const events = !(isRoom && url.searchParams.get('events') === '0');
      const open = isRoom && url.searchParams.get('testmap') === 'open'; // netcode tests: border walls only
      this.newMatch({ mode, world, lobby, ev, events, open, bots: !(isRoom && url.searchParams.get('bots') === '0') });
    }
    const sim = this.sim, sockets = this.sockets;
    const b = url.searchParams.get('brawler');
    const id = sim.join(cleanName(url.searchParams.get('name')), BRAWLERS[b] ? b : 'volt');
    if (id == null) {
      sendJSON(server, { t: 'retry', reason: sim.phase === 'play' ? 'Match already started' : 'Match full', match: mname });
      server.close(1000, 'retry');
      return new Response(null, { status: 101, webSocket: client });
    }
    const token = url.searchParams.get('token');
    if (token && this.env.DB) userFromToken(this.env.DB, token).then((u) => { const p = sim.players.get(id); if (u && p) { const pr = JSON.parse(u.progress || '{}'); p.account = u.id; p.trophies = pr.trophies?.[p.brawler] | 0; sim.setCosmetics(id, pr.equipped); } }).catch(() => {});
    const secret = crypto.randomUUID();
    sim.players.get(id).secret = secret;
    sendJSON(server, { t: 'welcome', id, room: isRoom ? mname.slice(5) : null, bots: sim.fillBots, mode: sim.modeKey, world: sim.map.world, match: mname, secret });
    sim.broadcastLobby();
    return this.attach(id, server, client);
  }

  // reconnect after a dropped connection: same player, same match, if it's still going
  rejoin(url, server, client) {
    const sim = this.sim, id = Number(url.searchParams.get('rejoin'));
    const p = sim && sim.phase !== 'end' ? sim.players.get(id) : null;
    if (!p || p.wasBot || p.left || !p.secret || p.secret !== url.searchParams.get('secret')) {
      sendJSON(server, { t: 'rejoinfail' });
      server.close(1000, 'rejoin failed');
      return new Response(null, { status: 101, webSocket: client });
    }
    const old = this.sockets.get(id);
    this.sockets.delete(id); // so the old socket's close handler is a no-op
    if (old) { try { old.close(1000, 'replaced'); } catch {} }
    sim.rejoin(id);
    this.dropped.delete(id);
    sendJSON(server, { t: 'welcome', id, rejoin: 1, room: url.searchParams.get('match').startsWith('room:') ? url.searchParams.get('match').slice(5) : null, bots: sim.fillBots, mode: sim.modeKey, world: sim.map.world, match: url.searchParams.get('match'), secret: p.secret });
    if (sim.phase === 'play') {
      sendJSON(server, { t: 'start', rejoin: 1, botLevel: sim.botLevel, you: id, mode: sim.modeKey, world: sim.map.world, seed: sim.seed, open: !!sim.map.open, players: sim.map.players || 10 });
      sendJSON(server, sim.rosterMsg());
      sendJSON(server, sim.stateMsg());
      if (!p.alive && !sim.mode.respawn) sendJSON(server, { t: 'dead', rank: p.rank, respawn: 0, killer: 'the Wild', killerId: 0, stolen: 0 });
    }
    const r = this.attach(id, server, client);
    if (sim.phase === 'lobby') sim.broadcastLobby();
    return r;
  }

  attach(id, server, client) {
    const sim = this.sim, sockets = this.sockets;
    sockets.set(id, server);
    this.emptyAt = 0;
    server.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ping') return sendJSON(server, { t: 'pong', c: m.c });
      if (m.t === 'bye') { this.abandon(id); onClose(true); try { server.close(1000, 'bye'); } catch {} return; }
      sim.input(id, m);
    });
    // bye = the player quit on purpose (no reconnect wanted); otherwise the connection dropped
    const onClose = (bye) => {
      if (sockets.get(id) !== server) return;
      sockets.delete(id);
      sim.leave(id);
      if (bye !== true && sim.phase === 'play' && this.sim === sim) this.dropped.set(id, Date.now());
      // nobody left: keep the match alive for a short grace period so a dropped player can come back,
      // then shut the room down (no Durable Object left ticking forever)
      if (this.sockets === sockets && sockets.size === 0) {
        if (sim.phase === 'play' && bye !== true) this.emptyAt = Date.now(); else this.stop();
      }
    };
    server.addEventListener('close', () => onClose(false));
    server.addEventListener('error', () => onClose(false));
    this.loop.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  // a leave is final: record it now (a loss), so quitting can't dodge a trophy drop
  abandon(id) {
    this.dropped.delete(id);
    const row = this.sim && this.sim.abandon(id);
    if (row) this.recordResults([row], this.sockets);
  }

  step() {
    if (!this.sim) return this.loop.stop();
    const now = Date.now();
    for (const [id, at] of this.dropped) if (now - at > REJOIN_GRACE_MS) this.abandon(id);
    if (this.emptyAt && this.sockets.size === 0 && Date.now() - this.emptyAt > REJOIN_GRACE_MS) return this.stop();
    this.sim.tick();
    if (this.sim.phase === 'end') {
      const now = Date.now();
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > 20000) this.stop();
    }
  }

  stop() {
    this.loop.stop();
    if (this.dropped) for (const id of [...this.dropped.keys()]) this.abandon(id);
    if (!this.sockets || this.sockets.size === 0) this.sim = null;
  }
}

// ------------------------------------------------------------------ Free Play zone
// Every client socket to a zone is either a PLAYER (its brawler lives in this zone) or an
// OBSERVER (it watches this zone because its player is near the border). When a player walks
// out of this zone's bounds we POST its state to the neighbour zone, then tell the client to
// "claim" it there (usually over the observer socket it already has open), and this socket is
// demoted to an observer. Bullets that leave the zone are POSTed over too, and kill/hit credit
// for a shooter in another zone is POSTed back to that zone.
export class ZoneRoom {
  constructor(state, env) {
    this.env = env;
    this.slot = null;
    this.sim = null;
    this.conns = new Map(); // key (player id | 'o:..') -> ws
    this.pending = new Map(); // token -> {state, exp}
    this.dropped = new Map(); // player id -> time their socket dropped (kept for REJOIN_GRACE_MS)
    this.dirT = 0;
    this.online = {};
    this.loop = new Loop(() => this.step());
  }

  zoneStub(slot) { return this.env.ZONE.get(this.env.ZONE.idFromName('zone:' + slot)); }

  ensureSim() {
    if (this.sim) return this.sim;
    const conns = this.conns;
    this.sim = new Sim({
      map: generateWorld(), mode: 'freeplay', zone: this.slot, bounds: zoneBounds(this.slot), hub: true, phase: 'play',
      botTarget: 4, seed: (Math.random() * 2 ** 32) >>> 0,
      send: (id, msg) => { const ws = conns.get(id); if (ws) sendJSON(ws, msg); },
      hooks: {
        handoff: (p, state) => this.handoff(p, state),
        bulletsOut: (list) => {
          const by = {};
          for (const b of list) (by[zoneAt(b.x, b.y)] ||= []).push(b);
          for (const [slot, bl] of Object.entries(by)) {
            if (slot !== this.slot) this.zoneStub(slot).fetch('https://z/bullets?slot=' + slot, { method: 'POST', body: JSON.stringify(bl) }).catch(() => {});
          }
        },
        credit: (slot, c) => { if (slot && slot !== this.slot) this.zoneStub(slot).fetch('https://z/credit?slot=' + slot, { method: 'POST', body: JSON.stringify(c) }).catch(() => {}); },
      },
    });
    return this.sim;
  }

  async handoff(p, state) {
    const dest = zoneAt(state.x, state.y);
    if (dest === this.slot) { // a hair inside our own edge: not a crossing, keep them here
      const b = this.sim.bounds;
      state.x = Math.max(b.x0 + 1, Math.min(b.x1 - 1, state.x)); state.y = Math.max(b.y0 + 1, Math.min(b.y1 - 1, state.y));
      const np = this.sim.importPlayer(state, state.name, true);
      const ws0 = this.conns.get(p.id);
      if (ws0) { this.conns.delete(p.id); this.conns.set(np.id, ws0); ws0.huntKey = np.id; }
      return;
    }
    const token = crypto.randomUUID();
    const ws = this.conns.get(p.id);
    // this socket is now an observer of this zone
    const okey = 'o:' + token;
    if (ws) { this.conns.delete(p.id); this.conns.set(okey, ws); ws.huntKey = okey; this.sim.observers.set(okey, { x: state.x, y: state.y }); }
    try {
      const r = await this.zoneStub(dest).fetch('https://z/handoff?slot=' + dest, { method: 'POST', body: JSON.stringify({ token, state }) });
      if (!r.ok) throw new Error('handoff refused');
      if (ws) sendJSON(ws, { t: 'handoff', zone: dest, token, ack: state.lastSeq });
    } catch {
      // the socket closed (or the zone emptied) while we waited: don't resurrect a ghost player
      if (!this.sim || !ws || ws.readyState !== 1 || this.conns.get(okey) !== ws) return;
      // put them back on our side of the border
      const b = this.sim.bounds;
      state.x = Math.max(b.x0 + 30, Math.min(b.x1 - 30, state.x));
      state.y = Math.max(b.y0 + 30, Math.min(b.y1 - 30, state.y));
      const np = this.sim.importPlayer(state, state.name, true);
      if (ws) { this.conns.delete(okey); this.sim.observers.delete(okey); this.conns.set(np.id, ws); ws.huntKey = np.id; }
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (!this.slot) this.slot = url.searchParams.get('slot');
    if (req.method === 'POST') {
      const body = await req.json();
      if (!this.slot) this.slot = url.searchParams.get('slot') || null;
      if (url.pathname === '/handoff') {
        this.pending.set(body.token, { state: body.state, exp: Date.now() + 15000 });
        return new Response('ok');
      }
      if (url.pathname === '/bullets') { if (this.sim) this.sim.addBullets(body); return new Response('ok'); }
      if (url.pathname === '/credit') { if (this.sim) this.sim.credit(body); return new Response('ok'); }
      return new Response('?', { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const sim = this.ensureSim();
    const join = url.searchParams.get('join') === '1';
    const back = Number(url.searchParams.get('rejoin')) || 0;
    if (back) {
      const p = sim.players.get(back);
      if (!p || p.bot || !p.secret || p.secret !== url.searchParams.get('secret') || (this.conns.has(back) && !this.dropped.has(back))) {
        sendJSON(server, { t: 'rejoinfail' });
        server.close(1000, 'rejoin failed');
        if (this.conns.size === 0 && this.dropped.size === 0) { this.loop.stop(); this.sim = null; }
        return new Response(null, { status: 101, webSocket: client });
      }
      this.dropped.delete(back);
      p.connected = true;
      server.huntKey = back;
      this.conns.set(back, server);
      sendJSON(server, { t: 'welcome', id: back, zone: this.slot, mode: 'freeplay', rejoin: 1, secret: p.secret });
    } else if (join) {
      const b = url.searchParams.get('brawler');
      const p = sim.addPlayer({ name: cleanName(url.searchParams.get('name')), brawler: BRAWLERS[b] ? b : 'volt' });
      p.alive = false;
      sim.respawn(p);
      const token = url.searchParams.get('token');
      if (token && this.env.DB) userFromToken(this.env.DB, token).then((u) => { if (u && sim.players.has(p.id)) { p.account = u.id; sim.setCosmetics(p.id, JSON.parse(u.progress || '{}').equipped); } }).catch(() => {});
      server.huntKey = p.id;
      this.conns.set(p.id, server);
      p.secret = crypto.randomUUID();
      sendJSON(server, { t: 'welcome', id: p.id, zone: this.slot, mode: 'freeplay', secret: p.secret });
    } else {
      const okey = 'o:' + crypto.randomUUID();
      server.huntKey = okey;
      this.conns.set(okey, server);
      sim.observers.set(okey, { x: Number(url.searchParams.get('x')) || 0, y: Number(url.searchParams.get('y')) || 0 });
      sendJSON(server, { t: 'welcome', zone: this.slot, observer: true });
    }
    sendJSON(server, sim.rosterMsg());
    sendJSON(server, sim.stateMsg());
    if (Object.keys(this.online).length) sendJSON(server, { t: 'online', zones: this.online });

    server.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      const key = server.huntKey;
      if (m.t === 'ping') return sendJSON(server, { t: 'pong', c: m.c, zone: this.slot });
      if (m.t === 'pos') { const o = sim.observers.get(key); if (o) { o.x = +m.x || 0; o.y = +m.y || 0; } return; }
      if (m.t === 'bye') { onClose(true); try { server.close(1000, 'bye'); } catch {} return; }
      if (m.t === 'claim') {
        if (typeof key === 'number') return sendJSON(server, { t: 'claimfail' }); // already a player here
        const pend = this.pending.get(m.token);
        if (!pend) return sendJSON(server, { t: 'claimfail' });
        this.pending.delete(m.token);
        sim.observers.delete(key); this.conns.delete(key);
        const p = sim.importPlayer(pend.state, pend.state.name, true);
        // replay inputs the client sent while the handoff was in flight
        if (Array.isArray(m.pend)) for (const inp of m.pend.slice(-12)) sim.input(p.id, { ...inp, t: 'in' });
        p.credits = p.queue.length + 1;
        server.huntKey = p.id;
        this.conns.set(p.id, server);
        sendJSON(server, { t: 'claimed', id: p.id, zone: this.slot });
        return;
      }
      if (typeof key === 'number') sim.input(key, m);
    });
    const onClose = (bye) => {
      const key = server.huntKey;
      if (this.conns.get(key) !== server) return;
      this.conns.delete(key);
      if (typeof key === 'number') {
        // a dropped connection keeps its brawler (HP, bounty) for a short while in case they reconnect
        const p = sim.players.get(key);
        if (p && bye !== true) { p.connected = false; p.queue.length = 0; this.dropped.set(key, Date.now()); } else sim.leave(key);
      } else sim.observers.delete(key);
      if (this.conns.size === 0 && this.dropped.size === 0) { this.loop.stop(); this.sim = null; }
    };
    server.addEventListener('close', () => onClose(false));
    server.addEventListener('error', () => onClose(false));
    this.loop.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  step() {
    if (!this.sim) return this.loop.stop();
    const now = Date.now();
    for (const [id, at] of this.dropped) {
      if (now - at < REJOIN_GRACE_MS) continue;
      this.dropped.delete(id);
      this.sim.leave(id);
    }
    if (this.conns.size === 0 && this.dropped.size === 0) { this.loop.stop(); this.sim = null; return; }
    this.sim.tick();
    for (const [k, v] of this.pending) if (v.exp < now) this.pending.delete(k);
    this.dirT -= DT;
    if (this.dirT <= 0) {
      this.dirT = 3;
      const players = this.sim.humans().map((p) => [p.name, p.brawler, p.bounty]);
      const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('world'));
      dir.fetch('https://d/report', { method: 'POST', body: JSON.stringify({ slot: this.slot, players, bots: this.sim.players.size - players.length }) })
        .then((r) => r.json())
        .then((zones) => { this.online = zones; this.sim?.broadcast({ t: 'online', zones }); })
        .catch(() => {});
    }
  }
}

// Tracks who is online in each Free Play zone (for the hub's "players online" list).
export class Directory {
  constructor() { this.zones = {}; }
  async fetch(req) {
    const r = await req.json();
    this.zones[r.slot] = { players: r.players, bots: r.bots, at: Date.now() };
    const out = {};
    for (const [slot, z] of Object.entries(this.zones)) if (Date.now() - z.at < 10000) out[slot] = { players: z.players, bots: z.bots };
    return Response.json(out);
  }
}

export { MODES };
