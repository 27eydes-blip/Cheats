// Hunt Racers server: the /race WebSocket route, the RaceMatchmaker (public queues) and the RaceRoom
// Durable Object (one race). Same shape as the shooter's MatchRoom: authoritative fixed-step sim,
// reconnect with a secret, friend room codes, results recorded server-side.
//
// /race?name=&driver=&token=                     public race (matchmaker), mode=grand|elim|battle,
//        &mode=&track=&bots=0|1                  track=<id>|any, bots=0 -> a queue with no bots ever
// /race?room=CODE&mode=&track=&bots=            friend room: the first player in (host) picks mode, track
//                                                and bots and presses START ({t:'host', start:1, bots});
//                                                a friend who arrives mid-race waits for the next one
//        &lobby=<s>                              (rooms) a fixed countdown instead of the host's START
// /race?mode=trial&track=                        Time Trial (always solo, never bots)
// /race?mode=tutorial                            the first-race tutorial (solo, training track, no rewards
//                                                but the one-time progress.race.tut flag)
//        &sens=0.5..1.5                          (any race) the player's steering sensitivity
// /race?rejoin=<id>&secret=&match=<name>         reconnect to the same race
import { RaceSim, RACE_MODES } from './sim.js';
import { DT, DRIVERS } from '../../public/race/physics.js';
import { carUnlocked, unlockedCars, defaultCar, STARTER_CARS } from '../../public/race/unlocks.js';
import { normalize } from '../../public/progression.js';
import { TRACK_IDS } from '../../public/race/tracks.js';
import { userFromToken, mutateProgress, ensureSchema } from '../accounts.js';
import { applyRace, raceResult } from './results.js';

const cleanName = (s) => (s || '').replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 14) || 'Racer';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// who is this, across races of one room: their session token, or (no token) their name
const whoOf = (q) => (q.get('token') ? 't:' + q.get('token') : 'n:' + cleanName(q.get('name')));
const sendJSON = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch {} };
export const REJOIN_GRACE_MS = 25000;
export const PUBLIC_MODES = ['grand', 'elim', 'battle'];
const NAME_RE = /^(room:[A-Z0-9]{1,12}|rq:(grand|elim|battle):[a-z]+:[01]:[0-9a-f-]{36}|solo:[a-z]+:[0-9a-f-]{36}|tut:[0-9a-f-]{36})$/;

export async function routeRace(req, env) {
  if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
  const url = new URL(req.url), q = url.searchParams;
  const room = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const back = q.get('rejoin') ? q.get('match') || '' : '';
  const track = TRACK_IDS.includes(q.get('track')) ? q.get('track') : null;
  let name;
  if (NAME_RE.test(back)) name = back; // reconnect to the same race
  else if (q.get('mode') === 'tutorial') name = `tut:${crypto.randomUUID()}`; // (never a friend room)
  else if (room) name = 'room:' + room;
  else if (q.get('mode') === 'trial') name = `solo:${track || pick(TRACK_IDS)}:${crypto.randomUUID()}`;
  else {
    const mode = PUBLIC_MODES.includes(q.get('mode')) ? q.get('mode') : 'grand';
    // local dev only (HUNT_DEV is in wrangler.jsonc, never in the deploy config): ?mmpool=x gives a
    // browser test its own matchmaker, so parallel tests never land in each other's public race
    const pool = env.HUNT_DEV && (q.get('mmpool') || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
    const mm = env.RACEMM.get(env.RACEMM.idFromName(pool ? 'pool:' + pool : 'global'));
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
  if (name.startsWith('tut:')) return { mode: 'tutorial', track: 'tutorial', bots: false, lobby: 0.5 };
  const mode = RACE_MODES[q.get('mode')] ? q.get('mode') : 'grand';
  const track = TRACK_IDS.includes(q.get('track')) ? q.get('track') : pick(TRACK_IDS);
  const lobby = Math.max(1.5, Math.min(30, Number(q.get('lobby')) || 12));
  const laps = dev && Number(q.get('laps')) >= 1 && Number(q.get('laps')) <= 3 ? Math.floor(Number(q.get('laps'))) : undefined;
  // ?lobby= is a fixed countdown (tests, scripts); otherwise the host starts the race
  const hostStart = !q.has('lobby') && mode !== 'trial';
  return { mode, track, any: !TRACK_IDS.includes(q.get('track')), bots: q.get('bots') !== '0', lobby, hostStart, ...(laps ? { laps } : {}) };
}

export class RaceRoom {
  constructor(state, env) {
    this.env = env;
    this.sim = null;
    this.sockets = null;
    this.dropped = new Map();
    this.endedAt = 0;
    this.emptyAt = 0;
    this.waiting = new Map(); // FRIEND ROOM: socket -> {q} a friend who came in mid-race, seated in the next race
    this.roomCfg = null; // FRIEND ROOM: what the room plays (kept between races) and who hosted the last one
    this.loop = new Loop(() => this.step());
  }

  newRace(cfg) {
    for (const id of [...this.dropped.keys()]) this.abandon(id); // the previous race's leavers
    if (this.sockets) for (const ws of this.sockets.values()) { try { ws.close(1000, 'new race'); } catch {} }
    const sockets = new Map();
    this.sockets = sockets;
    this.dropped = new Map();
    this.endedAt = 0;
    const sim = this.sim = new RaceSim({
      mode: cfg.mode, track: cfg.track, seed: (Math.random() * 2 ** 32) >>> 0, fillBots: cfg.bots, lobbyTime: cfg.lobby, laps: cfg.laps, hostStart: cfg.hostStart,
      send: (id, msg) => { const ws = sockets.get(id); if (ws) sendJSON(ws, msg); },
      // (resultsIn: the next room race closes these sockets, so it waits until everyone got their rewards)
      hooks: { finished: (rows) => { this.recordResults(rows, sockets).finally(() => { sim.resultsIn = true; }); }, tell: (ws, msg) => sendJSON(ws, msg) },
    });
  }

  // FRIEND ROOM: the settings of a new race. The room keeps its mode, track choice and bots between
  // races; only the last race's host (or the first one into a fresh room) chooses again.
  roomRace(mname, q) {
    const old = this.sim, oh = old && old.hostStart ? old.players.get(old.hostId) : null;
    const prevHost = oh ? oh.who : null, mine = !this.roomCfg || !prevHost || prevHost === whoOf(q);
    let cfg;
    if (mine) cfg = raceConfig(mname, q, !!this.env.HUNT_DEV);
    else {
      const rc = this.roomCfg.cfg;
      // same mode and track choice; the bots switch as the host left it in the last lobby
      cfg = { ...rc, track: rc.any ? pick(TRACK_IDS) : rc.track, bots: old ? old.fillBots : rc.bots };
    }
    this.roomCfg = { cfg };
    this.prevHost = prevHost; // they get the room back when they come in for this race
    return cfg;
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
        if (out && ws) sendJSON(ws, { t: 'progress', delta: out.delta, xp: out.xp, progress: out.progress, levels: out.levels, coins: out.coins, mcoins: out.matchCoins || 0, best: out.best ?? null, improved: !!out.improved, ...(out.tut != null ? { tut: out.tut } : {}), ...(out.elim ? { elim: out.elim } : {}), ...(out.unlocked && out.unlocked.length ? { unlocked: out.unlocked } : {}), ...(out.pieces ? { pieces: out.pieces } : {}) });
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
    if (!this.sim || this.sim.phase === 'end' || (isRoom && this.sim.phase === 'play' && this.sockets.size === 0)) {
      this.newRace(isRoom ? this.roomRace(mname, q) : raceConfig(mname, q, !!this.env.HUNT_DEV));
      if (isRoom) this.seatWaiting();
    }
    // a friend who arrives while the room's race is running waits for the next one (or cancels)
    if (isRoom && this.sim.phase === 'play') return this.wait(q, mname, server, client);
    const id = this.seat(q, mname, server);
    if (id == null) {
      const sim = this.sim;
      sendJSON(server, { t: 'retry', reason: sim.phase === 'play' ? 'Race already started' : 'Race full', match: mname });
      server.close(1000, 'retry');
      return new Response(null, { status: 101, webSocket: client });
    }
    const r = this.attach(id, server, client);
    this.sim.broadcastLobby();
    return r;
  }

  // put a joining socket into the lobby of the current race -> player id, or null when it's full
  seat(q, mname, server) {
    const sim = this.sim;
    const d = q.get('driver') || q.get('brawler'), name = cleanName(q.get('name'));
    const want = DRIVERS[d] ? d : 'volt';
    const id = sim.join(name, want, { sens: q.has('sens') ? Number(q.get('sens')) : 1 });
    if (id == null) return null;
    const p = sim.players.get(id);
    // UNLOCKS (server-authoritative): an unlockable car needs the account's progress to say it is
    // unlocked. Until the account has loaded it is unverified (carOk false); a guest, an unknown
    // token or a locked car gets the account's default car instead, and the client is told ('car').
    p.carOk = STARTER_CARS.includes(want);
    p.who = whoOf(q);
    // the last race's host gets the room back when they come in for the next one
    if (sim.hostStart && this.prevHost && this.prevHost === p.who) { sim.hostId = id; this.prevHost = null; }
    p.secret = crypto.randomUUID();
    const token = q.get('token');
    sendJSON(server, this.welcome(p, mname));
    if (token && this.env.DB) {
      userFromToken(this.env.DB, token).then((u) => {
        if (!sim.players.has(id)) return;
        if (!u) { if (!p.carOk) sim.swapCar(p, 'volt'); return; }
        const pr = normalize(JSON.parse(u.progress || '{}'));
        p.account = u.id;
        p.cars = new Set(unlockedCars(pr)); p.defCar = defaultCar(pr);
        if (!p.carOk) { if (carUnlocked(pr, p.driver)) p.carOk = true; else sim.swapCar(p, p.defCar); }
        p.trophies = pr.trophies?.[p.driver] | 0;
        sim.setGarage(id, pr); // store cosmetics (draw-only), carried in the roster
      }).catch(() => { if (sim.players.has(id) && !p.carOk) sim.swapCar(p, 'volt'); });
    } else if (!p.carOk) sim.swapCar(p, 'volt', server); // a guest: the starter cars only
    return id;
  }

  // FRIEND ROOM, race running: hold this socket and seat it in the room's next race
  wait(q, mname, server, client) {
    this.waiting.set(server, { q, mname });
    this.tellWaiting(server);
    server.addEventListener('message', (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m || !this.waiting.has(server)) return;
      if (m.t === 'ping') sendJSON(server, { t: 'pong', c: m.c });
      if (m.t === 'bye') { this.waiting.delete(server); try { server.close(1000, 'bye'); } catch {} }
    });
    const gone = () => { this.waiting.delete(server); };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
  tellWaiting(ws) {
    const sim = this.sim, tl = sim && sim.mode.timeLimit ? Math.max(0, Math.ceil(sim.mode.timeLimit - Math.max(0, sim.time))) : null;
    const w = this.waiting.get(ws);
    sendJSON(ws, { t: 'roomwait', room: w ? w.mname.slice(5) : null, mode: sim ? sim.modeKey : null, track: sim ? sim.trackKey : null, left: tl, players: sim ? sim.humans().filter((p) => !p.left).length : 0 });
  }
  // the room's race is over (and everyone has their rewards): open the next lobby for the friends who waited
  nextRoomRace() {
    const first = this.waiting.values().next().value;
    this.newRace(this.roomRace(first.mname, first.q));
    this.seatWaiting();
  }
  seatWaiting() {
    const list = [...this.waiting.entries()];
    this.waiting.clear();
    for (const [ws, w] of list) {
      if (ws.readyState !== 1) continue;
      const id = this.seat(w.q, w.mname, ws);
      if (id == null) { sendJSON(ws, { t: 'retry', reason: 'Race full', match: w.mname }); try { ws.close(1000, 'retry'); } catch {} continue; }
      this.attach(id, ws, null);
    }
    if (list.length) this.sim.broadcastLobby();
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

  // (client null: a waiting socket that already has its Response)
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
    return client ? new Response(null, { status: 101, webSocket: client }) : null;
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
    // every racer is gone but friends are waiting: their race starts now (like a fresh join would)
    if (this.waiting.size && this.sockets.size === 0 && this.sim.phase !== 'lobby') return this.nextRoomRace();
    if (this.emptyAt && this.sockets.size === 0 && now - this.emptyAt > REJOIN_GRACE_MS) return this.stop();
    this.sim.tick();
    if (this.sim.phase === 'end') {
      if (!this.endedAt) this.endedAt = now;
      // friends waited for this race to end: their lobby opens once the results are paid out
      if (this.waiting.size && (this.sim.resultsIn || now - this.endedAt > 8000)) return this.nextRoomRace();
      if (now - this.endedAt > 20000) this.stop();
    } else if (this.waiting.size && this.waitTold !== (this.waitTold = Math.floor(now / 2000))) for (const ws of this.waiting.keys()) this.tellWaiting(ws); // every 2 s
  }

  stop() {
    this.loop.stop();
    for (const id of [...this.dropped.keys()]) this.abandon(id);
    if ((!this.sockets || this.sockets.size === 0) && !this.waiting.size) this.sim = null;
  }
}
