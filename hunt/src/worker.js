// Cloudflare Worker entry: serves the static client and routes WebSockets to a
// per-match Durable Object. A tiny Matchmaker DO groups quick-play players.
import { Match } from './match.js';
import { BRAWLERS, DT } from '../public/shared.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      let matchName;
      if (room) {
        matchName = 'room:' + room;
      } else {
        const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
        const r = await mm.fetch('https://mm/assign?skip=' + encodeURIComponent(url.searchParams.get('skip') || ''));
        matchName = await r.text();
      }
      const fwd = new URL(req.url);
      fwd.searchParams.set('match', matchName);
      const stub = env.MATCH.get(env.MATCH.idFromName(matchName));
      return stub.fetch(new Request(fwd, req));
    }
    return env.ASSETS.fetch(req);
  },
};

// Hands out the id of the currently-filling quick-play match.
export class Matchmaker {
  constructor() { this.cur = null; }
  async fetch(req) {
    const skip = new URL(req.url).searchParams.get('skip');
    const now = Date.now();
    if (!this.cur || this.cur.count >= 10 || now - this.cur.created > 7000 || skip === this.cur.id) {
      this.cur = { id: 'qp:' + crypto.randomUUID(), created: now, count: 0 };
    }
    this.cur.count++;
    return new Response(this.cur.id);
  }
}

// One instance per match (or per private room code).
export class MatchRoom {
  constructor(state, env) {
    this.state = state;
    this.match = null;
    this.sockets = null; // Map<playerId, WebSocket> for the current match
    this.timer = null;
    this.last = 0;
    this.acc = 0;
    this.endedAt = 0;
  }

  newMatch(isRoom, fillBots = true) {
    if (this.sockets) for (const ws of this.sockets.values()) { try { ws.close(1000, 'new match'); } catch {} }
    const sockets = new Map();
    this.sockets = sockets;
    this.endedAt = 0;
    this.match = new Match({
      seed: (Math.random() * 2 ** 32) >>> 0,
      lobbyTime: isRoom ? 12 : 8,
      fillBots,
      send: (id, msg) => {
        const ws = sockets.get(id);
        if (ws) { try { ws.send(JSON.stringify(msg)); } catch {} }
      },
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    const isRoom = (url.searchParams.get('match') || '').startsWith('room:');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (!this.match || this.match.phase === 'end' || (isRoom && this.match.phase === 'play' && this.sockets.size === 0)) {
      this.newMatch(isRoom, !(isRoom && url.searchParams.get('bots') === '0'));
    }
    const name = (url.searchParams.get('name') || '').replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 14) || 'Hunter';
    const b = url.searchParams.get('brawler');
    const match = this.match, sockets = this.sockets;
    const id = match.join(name, BRAWLERS[b] ? b : 'volt');
    if (id == null) {
      server.send(JSON.stringify({ t: 'retry', reason: match.phase === 'play' ? 'Match already started' : 'Match full', match: url.searchParams.get('match') }));
      server.close(1000, 'retry');
      return new Response(null, { status: 101, webSocket: client });
    }
    sockets.set(id, server);
    server.send(JSON.stringify({ t: 'welcome', id, seed: match.seed, room: isRoom ? url.searchParams.get('match').slice(5) : null, bots: match.fillBots }));
    match.broadcastLobby();

    server.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ping') { try { server.send(JSON.stringify({ t: 'pong', c: m.c })); } catch {} return; }
      match.input(id, m);
    });
    const onClose = () => {
      if (sockets.get(id) !== server) return;
      sockets.delete(id);
      match.leave(id);
      if (this.sockets === sockets && sockets.size === 0) this.stop();
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);

    this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  startLoop() {
    if (this.timer) return;
    this.last = Date.now();
    this.acc = 0;
    this.timer = setInterval(() => this.loop(), 1000 / 20 / 2);
  }

  loop() {
    const now = Date.now();
    this.acc += (now - this.last) / 1000;
    this.last = now;
    let n = 0;
    while (this.acc >= DT && n < 4) {
      this.acc -= DT; n++;
      this.match.tick();
    }
    if (this.acc > DT * 4) this.acc = 0; // don't spiral after a stall
    if (this.match.phase === 'end') {
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > 20000) this.stop();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.sockets || this.sockets.size === 0) this.match = null;
  }
}
