// Hunt Racers server: the /race WebSocket route, the RaceMatchmaker (public queues) and the RaceRoom
// Durable Object (one race). Same shape as the shooter's MatchRoom: authoritative fixed-step sim,
// reconnect with a secret, friend room codes, results recorded server-side.
//
// /race?name=&driver=&token=                     public race (matchmaker), mode=grand|elim|battle,
//        &mode=&track=&bots=0|1                  track=<id>|any, bots=0 -> a queue with no bots ever
// /race?room=CODE&mode=&track=&bots=&lobby=      friend room: the first player in (host) picks
// /race?mode=trial&track=                        Time Trial (always solo, never bots)
// /race?rejoin=<id>&secret=&match=<name>         reconnect to the same race
import { RaceSim, RACE_MODES } from './sim.js';
import { DT, DRIVERS } from '../../public/race/physics.js';
import { TRACK_IDS } from '../../public/race/tracks.js';
import { userFromToken, mutateProgress, ensureSchema } from '../accounts.js';
import { applyRace, raceResult } from './results.js';

const cleanName = (s) => (s || '').replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 14) || 'Racer';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sendJSON = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch {} };
export const REJOIN_GRACE_MS = 25000;
export const PUBLIC_MODES = ['grand', 'elim', 'battle'];
const NAME_RE = /^(room:[A-Z0-9]{1,12}|rq:(grand|elim|battle):[a-z]+:[01]:[0-9a-f-]{36}|solo:[a-z]+:[0-9a-f-]{36})$/;

export async function routeRace(req, env) {
  if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
  const url = new URL(req.url), q = url.searchParams;
  const room = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const back = q.get('rejoin') ? q.get('match') || '' : '';
  const track = TRACK_IDS.includes(q.get('track')) ? q.get('track') : null;
  let name;
  if (NAME_RE.test(back)) name = back; // reconnect to the same race
  else if (room) name = 'room:' + room;
  else if (q.get('mode') === 'trial') name = `solo:${track || pick(TRACK_IDS)}:${crypto.randomUUID()}`;
  else {
    const mode = PUBLIC_MODES.includes(q.get('mode')) ? q.get('mode') : 'grand';
    const mm = env.RACEMM.get(env.RACEMM.idFromName('global'));
    const r = await mm.fetch(`https://mm/assign?mode=${mode}&track=${track || 'any'}&bots=${q.get('bots') === '0' ? 0 : 1}&skip=${encodeURIComponent(q.get('skip') || '')}`);
    name = await r.text();
  }
  const fwd = new URL(req.url);
  fwd.searchParams.set('match', name);
  return env.RACE.get(env.RACE.idFromName(name)).fetch(new Request(fwd, req));
}

// Hands out the currently-filling public race, one per (mode, track choice, bots on/off): players
// who switched bots OFF never land in a race that has bots, and the other way round.
export class RaceMatchmaker {
  constructor() { this.cur = {}; }
  async fetch(req) {
    const u = new URL(req.url), q = u.searchParams;
    const mode = PUBLIC_MODES.includes(q.get('mode')) ? q.get('mode') : 'grand';
    const want = TRACK_IDS.includes(q.get('track')) ? q.get('track') : 'any';
    const bots = q.get('bots') === '0' ? 0 : 1, skip = q.get('skip');
    const key = `${mode}|${want}|${bots}`, now = Date.now();
    let c = this.cur[key];
    // bots ON races start after a short lobby; bots OFF ones wait for a second human, so keep
    // filling them longer
    const fill = bots ? 7000 : 45000;
    if (!c || c.count >= c.max || now - c.created > fill || skip === c.id) {
      const track = want === 'any' ? pick(TRACK_IDS) : want;
      c = this.cur[key] = { id: `rq:${mode}:${track}:${bots}:${crypto.randomUUID()}`, created: now, count: 0, max: 10 };
    }
    c.count++;
    return new Response(c.id);
  }
}

// fixed-step loop
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
    }, 16);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
}

// config of a new race from the room name and (for rooms) the host's query. dev (HUNT_DEV, local
// only): a room may ask for fewer laps (`laps=1`) so browser tests finish a race quickly.
export function raceConfig(name, q, dev = false) {
  if (name.startsWith('rq:')) { const [, mode, track, bots] = name.split(':'); return { mode, track, bots: bots === '1', lobby: 8 }; }
  if (name.startsWith('solo:')) return { mode: 'trial', track: name.split(':')[1], bots: false, lobby: 0.5 };
  const mode = RACE_MODES[q.get('mode')] ? q.get('mode') : 'grand';
  const track = TRACK_IDS.includes(q.get('track')) ? q.get('track') : pick(TRACK_IDS);
  const lobby = Math.max(1.5, Math.min(30, Number(q.get('lobby')) || 12));
  const laps = dev && Number(q.get('laps')) >= 1 && Number(q.get('laps')) <= 3 ? Math.floor(Number(q.get('laps'))) : undefined;
  return { mode, track, bots: q.get('bots') !== '0', lobby, ...(laps ? { laps } : {}) };
}

export class RaceRoom {
  constructor(state, env) {
    this.env = env;
    this.sim = null;
    this.sockets = null;
    this.dropped = new Map();
    this.endedAt = 0;
    this.emptyAt = 0;
    this.loop = new Loop(() => this.step());
  }

  newRace(cfg) {
    for (const id of [...this.dropped.keys()]) this.abandon(id); // the previous race's leavers
    if (this.sockets) for (const ws of this.sockets.values()) { try { ws.close(1000, 'new race'); } catch {} }
    const sockets = new Map();
    this.sockets = sockets;
    this.dropped = new Map();
    this.endedAt = 0;
    this.sim = new RaceSim({
      mode: cfg.mode, track: cfg.track, seed: (Math.random() * 2 ** 32) >>> 0, fillBots: cfg.bots, lobbyTime: cfg.lobby, laps: cfg.laps,
      send: (id, msg) => { const ws = sockets.get(id); if (ws) sendJSON(ws, msg); },
      hooks: { finished: (rows) => this.recordResults(rows, sockets) },
    });
  }

  // trophies / XP / coins / missions / best times, server-side only
  async recordResults(rows, sockets) {
    if (!this.env.DB) return;
    for (const r of rows) {
      if (!r.p.account || r.p.recorded) continue;
      r.p.recorded = true;
      try {
        await ensureSchema(this.env.DB);
        const res = raceResult(r);
        const out = await mutateProgress(this.env.DB, r.p.account, (raw) => applyRace(JSON.parse(raw), res));
        const ws = sockets.get(r.p.id);
        if (out && ws) sendJSON(ws, { t: 'progress', delta: out.delta, xp: out.xp, progress: out.progress, levels: out.levels, coins: out.coins, mcoins: out.matchCoins || 0, best: out.best ?? null, improved: !!out.improved });
      } catch (e) { console.log('race record failed', e && e.message); }
    }
  }

  async fetch(req) {
    const url = new URL(req.url), q = url.searchParams;
    const mname = q.get('match') || '';
    const isRoom = mname.startsWith('room:');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    if (q.get('rejoin')) return this.rejoin(url, server, client);
    if (!this.sim || this.sim.phase === 'end' || (isRoom && this.sim.phase === 'play' && this.sockets.size === 0)) this.newRace(raceConfig(mname, q, !!this.env.HUNT_DEV));
    const sim = this.sim;
    const d = q.get('driver') || q.get('brawler');
    const id = sim.join(cleanName(q.get('name')), DRIVERS[d] ? d : 'volt');
    if (id == null) {
      sendJSON(server, { t: 'retry', reason: sim.phase === 'play' ? 'Race already started' : 'Race full', match: mname });
      server.close(1000, 'retry');
      return new Response(null, { status: 101, webSocket: client });
    }
    const p = sim.players.get(id);
    p.secret = crypto.randomUUID();
    const token = q.get('token');
    if (token && this.env.DB) {
      userFromToken(this.env.DB, token).then((u) => {
        if (!u || !sim.players.has(id)) return;
        const pr = JSON.parse(u.progress || '{}');
        p.account = u.id;
        p.trophies = pr.trophies?.[p.driver] | 0;
      }).catch(() => {});
    }
    sendJSON(server, this.welcome(p, mname));
    sim.broadcastLobby();
    return this.attach(id, server, client);
  }
  welcome(p, mname, rejoin = false) {
    const sim = this.sim;
    return { t: 'welcome', id: p.id, secret: p.secret, match: mname, room: mname.startsWith('room:') ? mname.slice(5) : null, mode: sim.modeKey, track: sim.trackKey, arena: !!sim.mode.arena, bots: sim.fillBots, tick: Math.round(1 / DT), ...(rejoin ? { rejoin: 1 } : {}) };
  }

  // reconnect after a dropped connection: same car, same race, if it's still going
  rejoin(url, server, client) {
    const sim = this.sim, id = Number(url.searchParams.get('rejoin')), mname = url.searchParams.get('match') || '';
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
    sendJSON(server, this.welcome(p, mname, true));
    if (sim.phase === 'play') {
      sendJSON(server, { ...sim.startMsg(p), rejoin: 1 });
      sendJSON(server, sim.rosterMsg());
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
      if (!m || typeof m !== 'object') return;
      if (m.t === 'ping') return sendJSON(server, { t: 'pong', c: m.c });
      if (m.t === 'dev') { if (this.env.HUNT_DEV) sim.dev(id, m); return; } // local test hooks only
      if (m.t === 'bye') { this.abandon(id); onClose(true); try { server.close(1000, 'bye'); } catch {} return; }
      sim.input(id, m);
    });
    // bye = quit on purpose (no reconnect); otherwise the connection dropped
    const onClose = (bye) => {
      if (sockets.get(id) !== server) return;
      sockets.delete(id);
      sim.leave(id);
      if (bye !== true && sim.phase === 'play' && this.sim === sim) this.dropped.set(id, Date.now());
      if (this.sockets === sockets && sockets.size === 0) {
        if (sim.phase === 'play' && bye !== true) this.emptyAt = Date.now(); else this.stop();
      }
    };
    server.addEventListener('close', () => onClose(false));
    server.addEventListener('error', () => onClose(false));
    this.loop.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  // leaving is final: record it now (last place) so quitting can't dodge a trophy drop
  abandon(id) {
    this.dropped.delete(id);
    const row = this.sim && this.sim.abandon(id);
    if (row) this.recordResults([row], this.sockets);
  }

  step() {
    if (!this.sim) return this.loop.stop();
    const now = Date.now();
    for (const [id, at] of this.dropped) if (now - at > REJOIN_GRACE_MS) this.abandon(id);
    if (this.emptyAt && this.sockets.size === 0 && now - this.emptyAt > REJOIN_GRACE_MS) return this.stop();
    this.sim.tick();
    if (this.sim.phase === 'end') {
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > 20000) this.stop();
    }
  }

  stop() {
    this.loop.stop();
    for (const id of [...this.dropped.keys()]) this.abandon(id);
    if (!this.sockets || this.sockets.size === 0) this.sim = null;
  }
}
