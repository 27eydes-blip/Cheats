// Cloudflare Worker entry.
//   /ws        Quick Hunt: Matchmaker DO picks an open match (mode + arena) -> MatchRoom DO
//   /zone      Free Play: one ZoneRoom DO per world zone (nw/ne/se/sw); players are handed off
//              between zone DOs as they walk across borders.
//   everything else: static client from ./public
import { Sim, newId } from './sim.js';
import { QUICK_MODES, RANDOM_MODES, MODES, playersFor } from './modes.js';
import { EVENTS } from '../public/events/index.js';
import { handleApi, userFromToken, recordMatch } from './accounts.js';
import { handleBoards } from './leaderboard.js';
import { loadoutFor, weaponUnlocked, normalize } from '../public/progression.js';
import { powerBracket } from '../public/power.js';
import { WEAPONS } from '../public/weapons.js';
import { fault, parseMsg, ZONE_HUMANS } from './guard.js';
import { VERSION } from '../public/version.js';
import { logError } from './log.js';
import { routeRace } from './race/room.js';
import { handleSpaceFeed } from './space-feed.js'; // lobby ticker: players online, top racer
export { RaceRoom, RaceMatchmaker } from './race/room.js';
// local dev only (HUNT_DEV is in wrangler.jsonc, never in wrangler.preview.jsonc, which is what deploys): ?wpn=id&mast=n hands
// you a secondary for tests and screenshots without an account at that level
function devWeapon(env, url, sim, id) {
  const w = url.searchParams.get('wpn');
  if (!env.HUNT_DEV || !w || !own(WEAPONS, w)) return;
  const m = Math.max(0, Math.min(10, Number(url.searchParams.get('mast')) || 1));
  const badge = m >= 10 ? 'bane' : m >= 9 ? 'gold' : m >= 6 ? 'silver' : m >= 3 ? 'bronze' : null;
  const p = sim.players.get(id), pw = Math.max(1, Math.min(11, Number(url.searchParams.get('pw')) || 1));
  const power = p ? { [p.brawler]: { power: pw, gadget: url.searchParams.get('gd') || null, star: url.searchParams.get('sp') || null } } : null;
  sim.setLoadout(id, { w2: w, perks: [], mastery: m, badge, emotes: [0, 1, 2, 3, 4, 5, 6, 7], dev: true, ...(power ? { power } : {}) });
}
import {
  BRAWLERS, DT, WORLDS, ZONES, generateArena, generateWorld, zoneBounds, zoneAt, worldId, own,
} from '../public/shared.js';

// is this joiner the room's last host? (signed-in players by account, guests without one by name)
const isHost = (h, url, user) => (user ? h.account === user.id : !h.account && h.name === cleanName(url.searchParams.get('name')));
const cleanName = (s) => (s || '').replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 14) || 'Hunter';
const arenaWorlds = () => WORLDS.filter((w) => w.arena).map((w) => w.key);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const brawlerId = (b) => (own(BRAWLERS, b) ? b : 'volt'); // a brawler id sent by a client
// an account's saved progress (never throws: a broken row reads as a new account)
const progressOf = (u) => { try { const p = JSON.parse(u.progress || '{}'); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
// who a join belongs to (null for guests without a token, or when accounts are unavailable)
async function userOf(env, token) {
  if (!token || !env.DB) return null;
  try { return await userFromToken(env.DB, token); } catch (e) { logError('account load', { where: 'join' }, e); return null; }
}

const app = {
  async fetch(req, env) {
    const url = new URL(req.url);
    // build id: an open client compares it with its own and offers a reload after a deploy
    if (url.pathname === '/api/version') return Response.json({ version: VERSION }, { headers: { 'cache-control': 'no-store' } });
    if (url.pathname.startsWith('/api/space/')) return handleSpaceFeed(req, env);
    if (url.pathname.startsWith('/api/race/')) return handleBoards(req, env); // leaderboards (src/leaderboard.js)
    if (url.pathname.startsWith('/api/')) return handleApi(req, env);
    if (url.pathname === '/race') return routeRace(req, env); // Hunt Racers (src/race/room.js)
    if (url.pathname === '/ws' || url.pathname === '/zone') {
      if (req.method !== 'GET' || req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      let name;
      if (url.pathname === '/zone') {
        const slot = url.searchParams.get('slot');
        if (!ZONES.some((z) => z.slot === slot)) return new Response('bad zone', { status: 400 });
        name = 'zone:' + slot;
        return env.ZONE.get(env.ZONE.idFromName(name)).fetch(req);
      }
      const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      const back = url.searchParams.get('rejoin') ? url.searchParams.get('match') || '' : '';
      if (/^(room:[A-Z0-9]{1,12}|q[pn]:[a-z]+:[a-z]+:[0-9a-f-]{36})$/.test(back)) name = back; // reconnect to the same match
      else if (room) name = 'room:' + room;
      else {
        const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
        const want = QUICK_MODES.includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'any';
        // POWER MATCHMAKING: players meet others of a similar brawler power (read from the account)
        let bracket = 1;
        const u = await userOf(env, url.searchParams.get('token'));
        if (u) bracket = powerBracket(own(progressOf(u).power || {}, brawlerId(url.searchParams.get('brawler'))) || 1);
        // "fill with bots" off: a separate queue of humans-only matches (never mixed with bot-filled ones)
        const nb = url.searchParams.get('bots') === '0' ? '&nb=1' : '';
        const r = await mm.fetch('https://mm/assign?mode=' + want + '&b=' + bracket + nb + '&skip=' + encodeURIComponent(url.searchParams.get('skip') || ''));
        name = await r.text();
      }
      const fwd = new URL(req.url);
      fwd.searchParams.set('match', name);
      return env.MATCH.get(env.MATCH.idFromName(name)).fetch(new Request(fwd, req));
    }
    return env.ASSETS.fetch(req);
  },
};
// anything a route throws is logged (route only: the query can hold a token) before the 500 goes out
export default {
  async fetch(req, env) {
    try { return await app.fetch(req, env); } catch (e) {
      let where = '?';
      try { where = new URL(req.url).pathname.split('/').slice(0, 3).join('/'); } catch {}
      logError('request', { where }, e);
      throw e;
    }
  },
};

// Hands out the currently-filling quick-play match: a random event mode on a random arena.
export class Matchmaker {
  // one filling match per requested mode ('any' = random event mode)
  constructor() { this.cur = {}; }
  async fetch(req) {
    const u = new URL(req.url), skip = u.searchParams.get('skip'), want = u.searchParams.get('mode') || 'any';
    const nb = u.searchParams.get('nb') === '1';
    // one filling match per mode, power bracket AND bots on/off ('qn:' matches never get bots)
    const key = want + '|' + (Number(u.searchParams.get('b')) || 1) + (nb ? '|nb' : '');
    const now = Date.now();
    let c = this.cur[key];
    // a bot-filled match starts in seconds anyway; a humans-only one keeps collecting players for
    // longer (once it has started, the room answers 'retry' and the client asks again with skip)
    if (!c || c.count >= c.max || now - c.created > (nb ? 120000 : 7000) || skip === c.id) {
      const mode = want === 'any' ? pick(RANDOM_MODES) : want;
      c = this.cur[key] = { id: `${nb ? 'qn' : 'qp'}:${mode}:${pick(arenaWorlds())}:${crypto.randomUUID()}`, created: now, count: 0, max: MODES[mode].maxPlayers || 10 };
    }
    c.count++;
    return new Response(c.id);
  }
}

// Fixed-step loop helper shared by both DO kinds.
class Loop {
  constructor(step, ctx) { this.step = step; this.ctx = ctx; this.timer = null; }
  start() {
    if (this.timer) return;
    this.last = Date.now(); this.acc = 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.acc += (now - this.last) / 1000; this.last = now;
      let n = 0;
      // each step is caught on its own (one bad tick must not skip the catch-up ticks after it): counted and logged
      while (this.acc >= DT && n++ < 4) { this.acc -= DT; try { this.step(); } catch (e) { fault('step', e, this.ctx?.()); } }
      if (this.acc > DT * 4) this.acc = 0;
    }, 25);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
}

const sendJSON = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch {} };
// how long a dropped player's spot is kept for them to reconnect
const REJOIN_GRACE_MS = 25000;
// shown on a screen whose seat was taken by the same account joining from somewhere else
const MOVED = 'Now playing on your other screen';

// ------------------------------------------------------------------ Quick Hunt match
export class MatchRoom {
  constructor(state, env) {
    this.env = env;
    this.sim = null;
    this.sockets = null;
    this.endedAt = 0;
    this.emptyAt = 0;
    this.waiting = new Map(); // FRIEND ROOM: socket -> a friend who came in mid-match, seated in the room's next match
    this.roomCfg = null; // what the room plays (mode asked for, bots) and who hosted the last match
    this.loop = new Loop(() => this.step(), () => this.logCtx());
  }

  logCtx() { return { where: 'match', mode: this.sim?.modeKey }; }

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
    const sim = this.sim = new Sim({
      map, mode: cfg.mode, seed, lobbyTime: cfg.lobby, fillBots: cfg.bots, forceEvent: cfg.ev, events: cfg.events,
      hostStart: cfg.hostStart, partyTeams: cfg.partyTeams,
      send: (id, msg) => { const ws = sockets.get(id); if (ws) sendJSON(ws, msg); },
      // (resultsIn: the next room match closes these sockets, so it waits until everyone got their rewards)
      // eliminated: no-respawn modes report a final place at once, so the death screen shows the rewards
      hooks: { finished: (rows) => { this.recordResults(rows, sockets, sim).finally(() => { sim.resultsIn = true; }); }, eliminated: (rows) => this.recordResults(rows, sockets, sim) },
    });
  }

  // FRIEND ROOM: the settings for a new match in this room. The room keeps its mode and bots
  // between matches; only the last match's host (or a fresh room) chooses again.
  roomMatch(url, user) {
    const old = this.roomCfg && this.sim, h = old && old.players.get(old.hostId);
    const prevHost = h ? { account: h.account || null, name: h.name } : null;
    const prev = old ? { ask: this.roomCfg.ask, bots: old.fillBots } : null;
    const mine = !prevHost || isHost(prevHost, url, user);
    const qm = url.searchParams.get('mode'), qw = url.searchParams.get('world');
    const ask = mine ? (QUICK_MODES.includes(qm) || qm === 'range' ? qm : '') : prev.ask;
    const mode = ask || pick(RANDOM_MODES);
    const world = mine && worldId(qw) >= 0 && WORLDS[worldId(qw)].arena ? qw : pick(arenaWorlds());
    // ?lobby= is the old fixed countdown (tests, the Test Range): no host START needed
    const timed = url.searchParams.has('lobby') || mode === 'range';
    const lobby = Math.max(1.5, Math.min(12, Number(url.searchParams.get('lobby')) || 12));
    const ev = own(EVENTS, url.searchParams.get('ev')) ? url.searchParams.get('ev') : null;
    const bots = mine ? url.searchParams.get('bots') !== '0' : prev.bots;
    this.roomCfg = { ask, bots, prevHost };
    return { mode, world, lobby, ev, events: url.searchParams.get('events') !== '0', open: url.searchParams.get('testmap') === 'open' || mode === 'range', bots, hostStart: !timed, partyTeams: true };
  }

  // trophies/XP are applied server-side for every player with an account (guests included).
  // `sim` is the match the rows came from. Everything is read from it and from the rows right now:
  // by the time D1 answers, this room may already be running its next match.
  async recordResults(rows, sockets, sim) {
    if (!this.env.DB || !sim || sim.mode.noRewards) return;
    const paid = (sim.paid ||= new Set()); // one result per account per match, whatever happens
    const jobs = [];
    for (const r of rows) {
      const acc = r.p.account;
      if (!acc || r.p.recorded || paid.has(acc)) continue;
      r.p.recorded = true; paid.add(acc);
      jobs.push({ p: r.p, acc, result: { rank: r.rank, players: r.players, kills: r.p.kills, bounty: r.p.bountyEarned, brawler: r.p.brawler, mode: sim.modeKey, won: r.won, assists: r.assists, steals: r.steals, secs: r.secs, wstat: structuredClone(r.wstat || {}) } });
    }
    for (const j of jobs) {
      try {
        const out = await recordMatch(this.env.DB, j.acc, j.result);
        if (!out) continue;
        // kept on the player: someone who was eliminated while disconnected gets it when they reconnect
        j.p.earned = { t: 'progress', delta: out.delta, xp: out.xp, progress: out.progress, levels: out.levels, mastery: out.mastery, wxp: out.wxp, coins: out.coins };
        const ws = sockets.get(j.p.id);
        if (ws) sendJSON(ws, j.p.earned);
      } catch (e) { logError('recordMatch', this.logCtx(), e); }
    }
  }

  // ONE SEAT PER ACCOUNT: the seat this account already holds in the running match, if any
  seatOf(sim, account) {
    for (const p of sim.players.values()) if (p.account === account && !p.wasBot && !p.left) return p;
    return null;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const mname = url.searchParams.get('match') || '';
    const isRoom = mname.startsWith('room:');
    // who is joining: looked up before the socket exists and before any room state is read
    // (nothing after this line waits)
    const user = url.searchParams.get('rejoin') ? null : await userOf(this.env, url.searchParams.get('token'));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (url.searchParams.get('rejoin')) return this.rejoin(url, server, client);
    if (!this.sim || this.sim.phase === 'end' || (isRoom && this.sim.phase === 'play' && this.sockets.size === 0)) {
      if (isRoom) { this.newMatch(this.roomMatch(url, user)); this.seatWaiting(); }
      // quick play: 'qn:' matches come from the humans-only queue ("fill with bots" off) and never get bots
      else { const [, mode, world] = mname.split(':'); this.newMatch({ mode, world, lobby: 8, ev: null, events: true, open: false, bots: !mname.startsWith('qn:') }); }
    }
    const sim = this.sim;
    // a second connection from the same account takes over its seat (like a reconnect): an account
    // never holds two seats in one match, so it can't be paid twice for it
    const seat = user && this.seatOf(sim, user.id);
    if (seat && sim.phase === 'play') return this.resume(seat, mname, server, client, true);
    // a friend who arrives while the room's match is running waits for the next one (or cancels)
    if (isRoom && sim.phase === 'play') return this.wait(url, user, mname, server, client);
    const id = this.seat(url, user, mname, server, seat);
    if (id == null) {
      sendJSON(server, { t: 'retry', reason: sim.phase === 'play' ? 'Match already started' : 'Match full', match: mname });
      server.close(1000, 'retry');
      return new Response(null, { status: 101, webSocket: client });
    }
    const res = this.attach(id, server, client);
    sim.broadcastLobby(); // (after attach, so the new player gets it too)
    return res;
  }

  // put a joining socket into the lobby of the current match -> player id, or null when it's full
  seat(url, user, mname, server, oldSeat = null) {
    const sim = this.sim, isRoom = mname.startsWith('room:');
    const wasHost = oldSeat && sim.hostId === oldSeat.id;
    if (oldSeat) this.unseat(oldSeat.id); // still in the lobby: the old seat goes and this connection joins below
    const id = sim.join(cleanName(url.searchParams.get('name')), brawlerId(url.searchParams.get('brawler')));
    if (id == null) return null;
    // the host keeps the room when they reconnect, and the last match's host gets it back
    const rc = this.roomCfg;
    if (sim.hostStart && (wasHost || (rc && rc.prevHost && isHost(rc.prevHost, url, user)))) sim.hostId = id;
    if (user) {
      const p = sim.players.get(id), pr = progressOf(user);
      p.account = user.id; p.trophies = pr.trophies?.[p.brawler] | 0; sim.setCosmetics(id, pr.equipped); sim.setLoadout(id, loadoutFor(pr));
      const tw = url.searchParams.get('try'); // TEST RANGE weapon: only one this account has unlocked
      if (sim.modeKey === 'range' && tw && weaponUnlocked(normalize(pr), tw)) { const tp = normalize(pr).perks[tw]; sim.setWeapon(p, tw, Array.isArray(tp) ? tp : []); p.slot = 1; }
    }
    devWeapon(this.env, url, sim, id);
    const secret = crypto.randomUUID();
    sim.players.get(id).secret = secret;
    sendJSON(server, { t: 'welcome', v: VERSION, id, room: isRoom ? mname.slice(5) : null, bots: sim.fillBots, mode: sim.modeKey, world: sim.map.world, match: mname, secret });
    return id;
  }

  // FRIEND ROOM, match running: hold this socket and seat it in the room's next match
  wait(url, user, mname, server, client) {
    this.waiting.set(server, { url, user, mname });
    this.tellWaiting(server);
    server.addEventListener('message', (e) => { const m = parseMsg(e.data); if (m && m.t === 'ping' && this.waiting.has(server)) sendJSON(server, { t: 'pong', c: m.c }); });
    const gone = () => { this.waiting.delete(server); };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
  tellWaiting(ws) {
    const sim = this.sim, tl = sim && sim.mode.timeLimit ? Math.max(0, Math.ceil(sim.mode.timeLimit - sim.time)) : null;
    sendJSON(ws, { t: 'roomwait', mode: sim ? sim.modeKey : null, left: tl, players: sim ? sim.humans().filter((p) => !p.wasBot).length : 0 });
  }
  // the room's match is over (and everyone has their rewards): open the next lobby for the friends who waited
  nextRoomMatch() {
    const first = this.waiting.values().next().value;
    this.newMatch(this.roomMatch(first.url, first.user));
    this.seatWaiting();
  }
  seatWaiting() {
    const list = [...this.waiting.entries()];
    this.waiting.clear();
    for (const [ws, w] of list) {
      if (ws.readyState !== 1) continue;
      const id = this.seat(w.url, w.user, w.mname, ws, w.user && this.seatOf(this.sim, w.user.id));
      if (id == null) { sendJSON(ws, { t: 'retry', reason: 'Match full', match: w.mname }); try { ws.close(1000, 'retry'); } catch {} continue; }
      this.attach(id, ws, null);
    }
    if (list.length) this.sim.broadcastLobby();
  }

  // the lobby seat of a connection that was replaced: its socket is told why, then the seat is freed
  unseat(id) {
    const old = this.sockets.get(id);
    this.sockets.delete(id); // so the old socket's close handler is a no-op
    if (old) { sendJSON(old, { t: 'kick', reason: MOVED }); try { old.close(1000, 'replaced'); } catch {} }
    this.dropped.delete(id);
    this.sim.leave(id);
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
    return this.resume(p, url.searchParams.get('match') || '', server, client, false);
  }

  // hand a seat to a new socket. takeover = another screen signed in to the same account joined
  // (a brand-new client: it gets the full start, and the old screen can't grab the seat back)
  resume(p, mname, server, client, takeover) {
    const sim = this.sim, id = p.id, rj = takeover ? {} : { rejoin: 1 };
    const old = this.sockets.get(id);
    this.sockets.delete(id); // so the old socket's close handler is a no-op
    if (old) { if (takeover) sendJSON(old, { t: 'kick', reason: MOVED }); try { old.close(1000, 'replaced'); } catch {} }
    if (takeover) p.secret = crypto.randomUUID();
    sim.rejoin(id);
    this.dropped.delete(id);
    sendJSON(server, { t: 'welcome', v: VERSION, id, ...rj, room: mname.startsWith('room:') ? mname.slice(5) : null, bots: sim.fillBots, mode: sim.modeKey, world: sim.map.world, match: mname, secret: p.secret });
    if (sim.phase === 'play') {
      sendJSON(server, { t: 'start', ...rj, botLevel: sim.botLevel, you: id, mode: sim.modeKey, caps: sim.caps(), world: sim.map.world, seed: sim.seed, open: !!sim.map.open, players: sim.map.players || 10 });
      sendJSON(server, sim.rosterMsg());
      sendJSON(server, sim.stateMsg());
      if (!p.alive && !sim.mode.respawn) sendJSON(server, { t: 'dead', rank: p.rank, respawn: 0, killer: 'the Wild', killerId: 0, stolen: 0 });
      if (p.earned) sendJSON(server, p.earned);
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
      const m = parseMsg(e.data);
      if (!m || sockets.get(id) !== server) return; // junk, or a socket that was replaced
      try {
        if (m.t === 'ping') return sendJSON(server, { t: 'pong', c: m.c });
        if (m.t === 'bye') {
          // the leaver is told what the match earned them before the socket closes (the client waits for it)
          const told = this.abandon(id, server);
          onClose(true);
          Promise.resolve(told).finally(() => { try { server.close(1000, 'bye'); } catch {} });
          return;
        }
        sim.input(id, m);
      } catch (err) { fault('message', err, this.logCtx()); }
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
    return client ? new Response(null, { status: 101, webSocket: client }) : null; // (no client: a waiting socket that was already answered)
  }

  // a leave is final: record it now (a loss), so quitting can't dodge a trophy drop
  abandon(id, ws) {
    this.dropped.delete(id);
    const sim = this.sim, row = sim && sim.abandon(id);
    if (row) return this.recordResults([row], ws ? new Map([[id, ws]]) : this.sockets, sim);
  }

  step() {
    if (!this.sim) return this.loop.stop();
    const now = Date.now();
    for (const [id, at] of this.dropped) if (now - at > REJOIN_GRACE_MS) this.abandon(id);
    if (this.emptyAt && this.sockets.size === 0 && Date.now() - this.emptyAt > REJOIN_GRACE_MS) return this.waiting.size ? this.nextRoomMatch() : this.stop();
    this.sim.tickSafe((e) => fault('tick', e, this.logCtx()));
    if (this.waiting.size) {
      if (this.sim.phase === 'end' && this.sim.resultsIn) return this.nextRoomMatch();
      if (this.sim.tickN % 20 === 0) for (const ws of this.waiting.keys()) this.tellWaiting(ws);
    }
    if (this.sim.phase === 'end') {
      const now = Date.now();
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > 20000) { if (this.waiting.size) this.nextRoomMatch(); else this.stop(); } // (results never came in: don't strand the friends who wait)
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
    this.loop = new Loop(() => this.step(), () => this.logCtx());
  }

  logCtx() { return { where: 'zone', zone: this.slot }; }

  zoneStub(slot) { return this.env.ZONE.get(this.env.ZONE.idFromName('zone:' + slot)); }

  ensureSim() {
    if (this.sim) return this.sim;
    const conns = this.conns;
    this.sim = new Sim({
      map: generateWorld(), mode: 'freeplay', zone: this.slot, bounds: zoneBounds(this.slot), hub: true, phase: 'play',
      botTarget: this.slot === 'c' ? 4 : 8, seed: (Math.random() * 2 ** 32) >>> 0,
      send: (id, msg) => { const ws = conns.get(id); if (ws) sendJSON(ws, msg); },
      hooks: {
        handoff: (p, state) => this.handoff(p, state),
        bulletsOut: (list) => {
          const by = {};
          for (const b of list) (by[zoneAt(b.x, b.y)] ||= []).push(b);
          for (const [slot, bl] of Object.entries(by)) {
            if (slot !== this.slot) this.zoneStub(slot).fetch('https://z/bullets?slot=' + slot, { method: 'POST', body: JSON.stringify(bl) }).catch((e) => logError('bullets handoff', this.logCtx(), e));
          }
        },
        credit: (slot, c) => { if (slot && slot !== this.slot) this.zoneStub(slot).fetch('https://z/credit?slot=' + slot, { method: 'POST', body: JSON.stringify(c) }).catch((e) => logError('credit handoff', this.logCtx(), e)); },
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
    } catch (e) {
      logError('player handoff', this.logCtx(), e);
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

    const join = url.searchParams.get('join') === '1';
    const back = Number(url.searchParams.get('rejoin')) || 0;
    // looked up before any zone state is read (nothing after this line waits)
    const user = join && !back ? await userOf(this.env, url.searchParams.get('token')) : null;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const sim = this.ensureSim();
    let seat = null;
    if (user) for (const q of sim.players.values()) if (q.account === user.id && !q.wasBot) { seat = q; break; }
    if (back) {
      const p = sim.players.get(back);
      if (!p || p.bot || !p.secret || p.secret !== url.searchParams.get('secret')) {
        sendJSON(server, { t: 'rejoinfail' });
        server.close(1000, 'rejoin failed');
        if (this.conns.size === 0 && this.dropped.size === 0) { this.loop.stop(); this.sim = null; }
        return new Response(null, { status: 101, webSocket: client });
      }
      // the right secret always wins, even while the old socket still looks open (a phone that
      // lost signal never closes it): the stale socket is dropped and this one takes the seat
      this.seat(p, server, false);
      sendJSON(server, { t: 'welcome', v: VERSION, id: back, zone: this.slot, mode: 'freeplay', rejoin: 1, secret: p.secret });
    } else if (seat) {
      // ONE SEAT PER ACCOUNT: joining again from another screen takes over the brawler already here
      this.seat(seat, server, true);
      seat.secret = crypto.randomUUID(); // the old screen can't grab the seat back
      sendJSON(server, { t: 'welcome', v: VERSION, id: seat.id, zone: this.slot, mode: 'freeplay', secret: seat.secret, sv: Date.now() });
    } else if (join && sim.humans().length >= ZONE_HUMANS) {
      // a crowded zone gets slow for everyone in it: new arrivals wait (walking in from next door still works)
      sendJSON(server, { t: 'kick', reason: 'Free Play is full right now. Try again in a minute.' });
      server.close(1000, 'full');
      return new Response(null, { status: 101, webSocket: client });
    } else if (join) {
      const p = sim.addPlayer({ name: cleanName(url.searchParams.get('name')), brawler: brawlerId(url.searchParams.get('brawler')) });
      p.alive = false;
      sim.respawn(p);
      // local dev only (HUNT_DEV is set in wrangler.jsonc, never in the deploy config): spawn at x,y
      const at = this.env.HUNT_DEV && (url.searchParams.get('at') || '').split(',').map(Number);
      if (at && at.length === 2 && sim.inBounds(at[0], at[1], -60)) { p.x = p.px = at[0]; p.y = p.py = at[1]; }
      if (user) { const pr = progressOf(user); p.account = user.id; sim.setCosmetics(p.id, pr.equipped); sim.setLoadout(p.id, loadoutFor(pr)); }
      devWeapon(this.env, url, sim, p.id);
      server.huntKey = p.id;
      this.conns.set(p.id, server);
      p.secret = crypto.randomUUID();
      sendJSON(server, { t: 'welcome', v: VERSION, id: p.id, zone: this.slot, mode: 'freeplay', secret: p.secret, sv: Date.now() });
    } else {
      const okey = 'o:' + crypto.randomUUID();
      server.huntKey = okey;
      this.conns.set(okey, server);
      sim.observers.set(okey, { x: Number(url.searchParams.get('x')) || 0, y: Number(url.searchParams.get('y')) || 0 });
      sendJSON(server, { t: 'welcome', v: VERSION, zone: this.slot, observer: true });
    }
    sendJSON(server, sim.rosterMsg());
    sendJSON(server, sim.stateMsg());
    if (Object.keys(this.online).length) sendJSON(server, { t: 'online', zones: this.online });

    const fin = (v) => (Number.isFinite(+v) ? +v : 0);
    const onMessage = (m) => {
      const key = server.huntKey;
      if (m.t === 'ping') return sendJSON(server, { t: 'pong', c: m.c, zone: this.slot });
      if (m.t === 'pos') { const o = sim.observers.get(key); if (o) { o.x = fin(m.x); o.y = fin(m.y); } return; }
      if (m.t === 'bye') { onClose(true); try { server.close(1000, 'bye'); } catch {} return; }
      if (m.t === 'claim') {
        if (typeof key === 'number') return sendJSON(server, { t: 'claimfail' }); // already a player here
        const pend = this.pending.get(m.token);
        if (!pend) return sendJSON(server, { t: 'claimfail' });
        this.pending.delete(m.token);
        sim.observers.delete(key); this.conns.delete(key);
        const p = sim.importPlayer(pend.state, pend.state.name, true);
        // replay inputs the client sent while the handoff was in flight
        if (Array.isArray(m.pend)) for (const inp of m.pend.slice(-12)) if (inp && typeof inp === 'object') sim.input(p.id, { ...inp, t: 'in' });
        p.credits = p.queue.length + 1;
        server.huntKey = p.id;
        this.conns.set(p.id, server);
        sendJSON(server, { t: 'claimed', id: p.id, zone: this.slot });
        return;
      }
      if (typeof key === 'number') sim.input(key, m);
    };
    server.addEventListener('message', (e) => {
      const m = parseMsg(e.data);
      if (!m || this.conns.get(server.huntKey) !== server) return; // junk, or a socket that was replaced
      try { onMessage(m); } catch (err) { fault('message', err, this.logCtx()); }
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

  // give a player's seat to this socket; a socket still holding it is stale (or another screen) and is closed
  seat(p, server, moved) {
    const old = this.conns.get(p.id);
    this.conns.delete(p.id); // so the old socket's close handler is a no-op
    if (old) { if (moved) sendJSON(old, { t: 'kick', reason: MOVED }); try { old.close(1000, 'replaced'); } catch {} }
    this.dropped.delete(p.id);
    p.connected = true;
    p.queue.length = 0;
    p.sentStatic = null; p.meSent = null; // a new socket knows nothing yet: resend everything
    server.huntKey = p.id;
    this.conns.set(p.id, server);
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
    this.sim.tickSafe((e) => fault('tick', e, this.logCtx()));
    for (const [k, v] of this.pending) if (v.exp < now) this.pending.delete(k);
    this.dirT -= DT;
    if (this.dirT <= 0) {
      this.dirT = 3;
      const players = this.sim.humans().map((p) => [p.name, p.brawler, p.bounty]);
      // for the full map: this zone's top bounty holder and its running event
      let top = null;
      for (const p of this.sim.players.values()) if (p.alive && p.bounty > 0 && (!top || p.bounty > top.bounty)) top = p;
      const ev = this.sim.event ? [this.sim.event.id, this.sim.event.ph] : null;
      const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('world'));
      dir.fetch('https://d/report', { method: 'POST', body: JSON.stringify({ slot: this.slot, players, bots: this.sim.players.size - players.length, top: top ? [top.name, top.bounty, Math.round(top.x), Math.round(top.y)] : null, ev }) })
        .then((r) => r.json())
        .then((zones) => { this.online = zones; this.sim?.broadcast({ t: 'online', zones, sv: Date.now() }); })
        .catch((e) => logError('directory report', this.logCtx(), e));
    }
  }
}

// Tracks who is online in each Free Play zone (for the hub's "players online" list).
export class Directory {
  constructor() { this.zones = {}; }
  async fetch(req) {
    const r = await req.json();
    this.zones[r.slot] = { players: r.players, bots: r.bots, top: r.top || null, ev: r.ev || null, at: Date.now() };
    const out = {};
    for (const [slot, z] of Object.entries(this.zones)) if (Date.now() - z.at < 10000) out[slot] = { players: z.players, bots: z.bots, top: z.top, ev: z.ev };
    return Response.json(out);
  }
}

// Anything a room's fetch throws is logged with its mode / zone before the caller gets the error.
for (const C of [Matchmaker, MatchRoom, ZoneRoom, Directory]) {
  const run = C.prototype.fetch;
  C.prototype.fetch = async function (req) {
    try { return await run.call(this, req); } catch (e) { logError('fetch', this.logCtx ? this.logCtx() : { where: C.name }, e); throw e; }
  };
}

export { MODES };
