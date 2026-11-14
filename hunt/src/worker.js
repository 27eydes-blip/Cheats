// Cloudflare Worker entry.
//   /ws        Quick Hunt: Matchmaker DO picks an open match (mode + arena) -> MatchRoom DO
//   /zone      Free Play: one ZoneRoom DO per world zone (nw/ne/se/sw); players are handed off
//              between zone DOs as they walk across borders.
//   everything else: static client from ./public
import { Sim, newId } from './sim.js';
import { QUICK_MODES, MODES } from './modes.js';
import {
  BRAWLERS, DT, WORLDS, ZONES, generateArena, generateWorld, zoneBounds, zoneAt, worldId,
} from '../public/shared.js';

const cleanName = (s) => (s || '').replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 14) || 'Hunter';
const arenaWorlds = () => WORLDS.filter((w) => w.arena).map((w) => w.key);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
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
      if (room) name = 'room:' + room;
      else {
        const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
        const r = await mm.fetch('https://mm/assign?skip=' + encodeURIComponent(url.searchParams.get('skip') || ''));
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
  constructor() { this.cur = null; }
  async fetch(req) {
    const skip = new URL(req.url).searchParams.get('skip');
    const now = Date.now();
    if (!this.cur || this.cur.count >= 10 || now - this.cur.created > 7000 || skip === this.cur.id) {
      this.cur = { id: `qp:${pick(QUICK_MODES)}:${pick(arenaWorlds())}:${crypto.randomUUID()}`, created: now, count: 0 };
    }
    this.cur.count++;
    return new Response(this.cur.id);
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

// ------------------------------------------------------------------ Quick Hunt match
export class MatchRoom {
  constructor() {
    this.sim = null;
    this.sockets = null;
    this.endedAt = 0;
    this.loop = new Loop(() => this.step());
  }

  newMatch(cfg) {
    if (this.sockets) for (const ws of this.sockets.values()) { try { ws.close(1000, 'new match'); } catch {} }
    const sockets = new Map();
    this.sockets = sockets;
    this.endedAt = 0;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.sim = new Sim({
      map: generateArena(seed, cfg.world), mode: cfg.mode, seed, lobbyTime: cfg.lobby, fillBots: cfg.bots,
      send: (id, msg) => { const ws = sockets.get(id); if (ws) sendJSON(ws, msg); },
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    const mname = url.searchParams.get('match') || '';
    const isRoom = mname.startsWith('room:');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (!this.sim || this.sim.phase === 'end' || (isRoom && this.sim.phase === 'play' && this.sockets.size === 0)) {
      let mode, world;
      if (isRoom) {
        const qm = url.searchParams.get('mode'), qw = url.searchParams.get('world');
        mode = QUICK_MODES.includes(qm) ? qm : pick(QUICK_MODES);
        world = worldId(qw) >= 0 && WORLDS[worldId(qw)].arena ? qw : pick(arenaWorlds());
      } else [, mode, world] = mname.split(':');
      const lobby = isRoom ? Math.max(1.5, Math.min(12, Number(url.searchParams.get('lobby')) || 12)) : 8;
      this.newMatch({ mode, world, lobby, bots: !(isRoom && url.searchParams.get('bots') === '0') });
    }
    const sim = this.sim, sockets = this.sockets;
    const b = url.searchParams.get('brawler');
    const id = sim.join(cleanName(url.searchParams.get('name')), BRAWLERS[b] ? b : 'volt');
    if (id == null) {
      sendJSON(server, { t: 'retry', reason: sim.phase === 'play' ? 'Match already started' : 'Match full', match: mname });
      server.close(1000, 'retry');
      return new Response(null, { status: 101, webSocket: client });
    }
    sockets.set(id, server);
    sendJSON(server, { t: 'welcome', id, room: isRoom ? mname.slice(5) : null, bots: sim.fillBots, mode: sim.modeKey, world: sim.map.world });
    sim.broadcastLobby();

    server.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ping') return sendJSON(server, { t: 'pong', c: m.c });
      sim.input(id, m);
    });
    const onClose = () => {
      if (sockets.get(id) !== server) return;
      sockets.delete(id);
      sim.leave(id);
      if (this.sockets === sockets && sockets.size === 0) this.stop();
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    this.loop.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  step() {
    this.sim.tick();
    if (this.sim.phase === 'end') {
      const now = Date.now();
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > 20000) this.stop();
    }
  }

  stop() {
    this.loop.stop();
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
    if (join) {
      const b = url.searchParams.get('brawler');
      const p = sim.addPlayer({ name: cleanName(url.searchParams.get('name')), brawler: BRAWLERS[b] ? b : 'volt' });
      p.alive = false;
      sim.respawn(p);
      server.huntKey = p.id;
      this.conns.set(p.id, server);
      sendJSON(server, { t: 'welcome', id: p.id, zone: this.slot, mode: 'freeplay' });
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
      if (m.t === 'claim') {
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
    const onClose = () => {
      const key = server.huntKey;
      if (this.conns.get(key) !== server) return;
      this.conns.delete(key);
      if (typeof key === 'number') sim.leave(key); else sim.observers.delete(key);
      if (this.conns.size === 0) { this.loop.stop(); this.sim = null; }
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    this.loop.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  step() {
    if (!this.sim) return;
    this.sim.tick();
    const now = Date.now();
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
