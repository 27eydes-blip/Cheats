// Hunt Racers authoritative race simulation (one per RaceRoom Durable Object), 30 ticks/s.
// Phases: 'lobby' (waiting for racers) -> 'play' (time < 0 is the grid countdown) -> 'end'.
// Every car is driven by public/race/physics.js stepCar(), the same code the client predicts with.
import { DT, TICK_RATE, CAR_R, DRIVERS, DRIVER_IDS, newCar, stepCar, collideCars, addBoost, BOOSTS, cleanInput, packState, driftTier, SURF } from '../../public/race/physics.js';
import { getTrack, TRACK_IDS } from '../../public/race/tracks.js';
import { pointAt, hwAt } from '../../public/race/trackgeom.js';
import { ITEMS, ITEM_IDS, rollItem, WEAPONS } from '../../public/race/items.js';
import { FLAG, ENT, COUNTDOWN, RESPAWN_TIME, RACE_MODES } from '../../public/race/protocol.js';
import { BOT_NAMES, rng } from '../../public/shared.js';
import { botInput, levelForTrophies } from './bots.js';

export { RACE_MODES };
export const RACE_MAX = 10;
export const RESPAWN_TICKS = Math.round(RESPAWN_TIME * TICK_RATE); // exactly 2 s
export const GHOST_TIME = 1.5; // can't be hit / bumped right after respawning
export const FINISH_TIMEOUT = 30; // the race ends this long after the winner crosses the line
export const RACE_CAP = 300; // hard cap on a race (s)
export const BOX_RESPAWN = 3;
export const CREDIT_WINDOW = 4; // a wreck within 4 s of a hit is credited to the hitter
export const COINS = { box: 1, lap: 2, takedown: 3 };
export const ROOM_IDLE_SECS = 300; // a host-run friend room whose host never presses START starts by itself after 5 minutes
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function segHit(ax, ay, bx, by, cx, cy, dx, dy) { // do segments AB and CD cross?
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d3 !== 0;
}
const distToSeg = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
};

export class RaceSim {
  // o: { mode, track, seed, fillBots, lobbyTime, hostStart, send(id, msg), hooks: {finished(rows)}, botLevel }
  // hostStart (friend rooms): the first human in is the host and starts the race with START
  constructor(o = {}) {
    this.modeKey = RACE_MODES[o.mode] ? o.mode : 'grand';
    this.mode = RACE_MODES[this.modeKey];
    this.trackKey = TRACK_IDS.includes(o.track) ? o.track : TRACK_IDS[0];
    this.T = getTrack(this.trackKey, !!this.mode.arena);
    this.laps = this.mode.laps && o.laps >= 1 ? Math.min(this.mode.laps, o.laps | 0) : this.mode.laps || 0; // o.laps: dev short races
    this.send = o.send || (() => {});
    this.hooks = o.hooks || {};
    this.seed = o.seed ?? 1;
    this.rand = rng((this.seed ^ 0x2f6b1d35) >>> 0);
    this.fillBots = this.mode.solo ? false : (o.fillBots ?? true);
    this.maxPlayers = this.mode.solo ? 1 : RACE_MAX;
    this.lobbyTime = o.lobbyTime ?? 8;
    this.hostStart = !!o.hostStart && !this.mode.solo;
    this.hostId = 0;
    this.botLevel = o.botLevel || null; // null = follow the humans' trophies
    this.players = new Map();
    this.nextId = 1;
    this.phase = 'lobby';
    this.clock = 0;
    this.lobbyEnd = null;
    this.time = -COUNTDOWN;
    this.tickN = 0;
    this.ents = []; // missiles, rockets, oil, spikes, mines, turrets, bolts
    this.nextEnt = 1;
    this.boxes = this.T.boxes.map(() => 0); // tick each box comes back (0 = there now)
    this.events = [];
    this.leaderId = 0;
    this.order = []; // current ranking (player objects)
    this.finishAt = null; // when the race ends after the winner finished
    this.places = 0; // finishers so far
    this.elimNext = this.mode.every ? this.mode.first : null;
    this.outCount = 0;
    this.ended = false;
  }

  // ------------------------------------------------------------------ roster
  humans() { return [...this.players.values()].filter((p) => !p.wasBot); }
  addPlayer({ name, driver, bot = false }) {
    const id = this.nextId++;
    const st = DRIVERS[driver] ? driver : 'volt';
    const p = {
      id, name, driver: st, st: DRIVERS[st], bot, wasBot: bot, connected: !bot, car: newCar(), hp: DRIVERS[st].armor, maxHp: DRIVERS[st].armor,
      alive: true, respawnTick: 0, ghostT: 0, shieldT: 0, empT: 0, item: null, wcd: 0, lap: 0, cp: 0, maxLap: 0, prog: 0, rank: 0,
      finished: false, place: 0, finishTime: null, out: false, kills: 0, deaths: 0, steals: 0, mc: 0, lastHit: null,
      inp: { st: 0, th: 0, dr: 0 }, act: { f: 0, i: 0 }, queue: [], credits: 2, lastSeq: 0, lapStart: 0, lapTimes: [], bestLap: null,
      ai: null, left: false, recorded: false, ep: 0, trophies: 0, account: null, secret: null,
    };
    this.players.set(id, p);
    return p;
  }
  rosterRow(p) { return [p.name, p.driver, p.wasBot ? 1 : 0]; }
  rosterMsg() { const add = {}; for (const p of this.players.values()) add[p.id] = this.rosterRow(p); return { t: 'ro', add, full: 1 }; }
  broadcast(msg) { for (const p of this.players.values()) if (p.connected) this.send(p.id, msg); }

  join(name, driver) {
    if (this.phase !== 'lobby' || this.players.size >= this.maxPlayers) return null;
    const p = this.addPlayer({ name, driver });
    if (this.hostStart) { if (!this.hostId) this.hostId = p.id; this.lobbyEnd = this.clock + ROOM_IDLE_SECS; }
    else this.lobbyEnd = this.lobbyEnd == null ? this.clock + this.lobbyTime : Math.max(this.lobbyEnd, this.clock + 3);
    if (this.humans().length >= this.maxPlayers) this.lobbyEnd = this.clock;
    this.broadcastLobby();
    return p.id;
  }
  pick(p, driver) {
    if (this.phase !== 'lobby' || !DRIVERS[driver]) return;
    p.driver = driver; p.st = DRIVERS[driver]; p.hp = p.maxHp = p.st.armor;
    this.broadcastLobby();
  }
  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players.delete(id);
      if (id === this.hostId) this.hostId = this.humans()[0]?.id || 0; // the host left: the next one in takes over
      this.broadcastLobby();
      return;
    }
    p.connected = false;
    p.queue.length = 0;
    // a bot drives a dropped racer's car until they come back, unless bots are switched off
    if (this.fillBots) p.bot = true;
    else { p.inp = { st: 0, th: 0, dr: 0 }; p.act.f = p.act.i = 0; }
  }
  // the leave is final: the result counts now (last place), the car stays on track for the others
  abandon(id) {
    const p = this.players.get(id);
    if (!p || p.wasBot || p.left) return null;
    p.left = true; p.secret = null;
    if (this.phase !== 'play') return null;
    return this.resultRow(p, this.players.size);
  }
  rejoin(id) {
    const p = this.players.get(id);
    if (!p) return null;
    p.connected = true; p.bot = p.wasBot; p.queue.length = 0; p.ai = null; p.ep++;
    return p;
  }
  canStart() { return this.humans().length >= (this.fillBots || this.mode.solo ? 1 : 2); }
  broadcastLobby() {
    const hs = this.humans();
    const left = this.lobbyEnd == null || !this.canStart() ? null : r2(Math.max(0, this.lobbyEnd - this.clock));
    const msg = {
      t: 'lobby', mode: this.modeKey, track: this.trackKey, arena: !!this.mode.arena,
      players: hs.map((p) => [p.name, p.driver]), max: this.maxPlayers,
      // a host room only counts down in its last minute (the safety net), otherwise it waits for START
      startIn: this.hostStart && left != null && left > 60 ? null : left, bots: this.fillBots,
      ...(this.hostStart ? { host: this.hostId, ids: hs.map((p) => p.id), can: this.canStart() } : {}),
    };
    this.broadcast(msg);
  }
  // the room host's buttons: START, and FILL WITH BOTS on/off. Anyone else is ignored.
  hostCmd(p, m) {
    if (!this.hostStart || this.phase !== 'lobby' || p.id !== this.hostId) return;
    if (typeof m.bots === 'boolean' && m.bots !== this.fillBots) { this.fillBots = m.bots; this.broadcastLobby(); }
    if (m.start === 1 && this.canStart()) this.start();
  }

  start() {
    // FILL WITH BOTS: only when on; never in Time Trial
    if (this.fillBots) {
      const taken = new Set([...this.players.values()].map((p) => p.name));
      const names = BOT_NAMES.filter((n) => !taken.has(n));
      while (this.players.size < this.maxPlayers) {
        const name = names.splice(Math.floor(this.rand() * names.length), 1)[0] || 'Bot';
        this.addPlayer({ name, driver: DRIVER_IDS[Math.floor(this.rand() * DRIVER_IDS.length)], bot: true });
      }
    }
    const hs = this.humans();
    if (!this.botLevel) this.botLevel = hs.length ? levelForTrophies(hs.reduce((s, h) => s + (h.trophies || 0), 0) / hs.length) : 'normal';
    // grid: humans and bots shuffled (deterministic per seed)
    const list = [...this.players.values()];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    list.forEach((p, i) => {
      const g = this.T.grid[i % this.T.grid.length];
      p.car = newCar(g.x, g.y, g.a);
      stepCar(p.car, { st: 0, th: 0, dr: 0 }, p.st, this.T, 0); // settle (surface, corridor)
      p.lap = 0; p.cp = this.T.gates.length ? this.T.gates.length - 1 : 0; p.hp = p.maxHp = p.st.armor;
      p.ep++;
    });
    this.phase = 'play';
    this.time = -COUNTDOWN;
    this.tickN = 0;
    this.rank();
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.send(p.id, this.startMsg(p));
      this.send(p.id, this.rosterMsg());
    }
  }
  startMsg(p) {
    return { t: 'start', you: p.id, mode: this.modeKey, track: this.trackKey, arena: !!this.mode.arena, laps: this.laps, seed: this.seed, tick: TICK_RATE, cd: COUNTDOWN, players: this.players.size, botLevel: this.botLevel, tm: r2(this.time) };
  }

  // ------------------------------------------------------------------ input
  // {t:'in', s: seq, st: steer -1..1, th: throttle -1..1 (negative = brake / reverse), dr: drift held 0|1,
  //  f: 1 = fire pressed, i: 1 = use item pressed}
  input(id, m) {
    const p = this.players.get(id);
    if (!p || !m) return;
    if (m.t === 'pick') return this.pick(p, m.driver);
    if (m.t === 'host') return this.hostCmd(p, m);
    if (m.t !== 'in' || p.bot) return;
    const inp = cleanInput(m);
    inp.s = m.s >>> 0; inp.f = m.f ? 1 : 0; inp.i = m.i ? 1 : 0;
    p.queue.push(inp);
    // too far behind: drop the oldest but keep their button presses
    while (p.queue.length > 6) { const o = p.queue.shift(); p.queue[0].f |= o.f; p.queue[0].i |= o.i; p.lastSeq = o.s; }
  }

  // local dev / browser-test hooks (the room only forwards these when HUNT_DEV is set):
  // {k: 'wreck'} wrecks your car, {k: 'item', item} hands you an item
  // (queued and applied inside the next tick, so their events go out with that tick's snapshot)
  dev(id, m) { (this.devQ ||= []).push([id, m]); }
  applyDev() {
    for (const [id, m] of this.devQ.splice(0)) {
      const p = this.players.get(id);
      if (!p || this.phase !== 'play' || this.time <= 0) continue;
      if (m.k === 'wreck') this.destroy(p, null, 'fall');
      else if (m.k === 'item' && ITEM_IDS.includes(m.item) && !p.item) p.item = m.item;
    }
  }

  // ------------------------------------------------------------------ main loop
  tick() {
    this.clock += DT;
    if (this.phase === 'lobby') {
      if (this.lobbyEnd != null && this.clock >= this.lobbyEnd && this.canStart()) this.start();
      else if (Math.round(this.clock / DT) % 15 === 0) this.broadcastLobby();
      return;
    }
    if (this.phase === 'end') return;
    this.tickN++;
    this.time = r3(this.time + DT);
    this.events = [];
    if (this.devQ && this.devQ.length) this.applyDev();
    const go = this.time > 0;
    for (const p of this.players.values()) this.drive(p, go);
    if (go) {
      this.collisions();
      this.updateEnts();
      this.updateBoxes();
    }
    this.rank();
    this.modeTick();
    this.snapshots();
  }

  // one racer for one tick: timers, inputs -> physics, ground effects, checkpoints
  drive(p, go) {
    if (p.out) { p.queue.length = 0; return; }
    if (!p.alive) {
      // acknowledge inputs while wrecked (nothing to move)
      while (p.queue.length) p.lastSeq = p.queue.shift().s;
      if (this.tickN >= p.respawnTick) this.respawn(p);
      return;
    }
    if (p.ghostT > 0) p.ghostT = Math.max(0, p.ghostT - DT);
    if (p.shieldT > 0) p.shieldT = Math.max(0, p.shieldT - DT);
    if (p.empT > 0) p.empT = Math.max(0, p.empT - DT);
    if (p.wcd > 0) p.wcd = Math.max(0, p.wcd - DT);
    // inputs: one physics step per input; bots and finished racers get one from the autopilot
    const auto = p.bot || p.finished || (!p.connected && !p.wasBot && this.fillBots);
    const steps = [];
    if (auto) {
      const inp = botInput(this, p);
      if (!p.finished) { p.act.f |= inp.f; p.act.i |= inp.i; }
      steps.push(inp);
      while (p.queue.length) p.lastSeq = p.queue.shift().s;
    } else {
      p.credits = Math.min(p.credits + 1, 3);
      while (p.queue.length && p.credits >= 1) {
        p.credits -= 1;
        const q = p.queue.shift();
        p.lastSeq = q.s; p.act.f |= q.f; p.act.i |= q.i;
        steps.push(q);
      }
      // no input arrived in time: keep the last one going (the car can't just stop)
      if (!steps.length) { steps.push(p.inp); p.credits = Math.max(0, p.credits - 1); }
    }
    if (!go) { p.act.f = p.act.i = 0; return; } // grid countdown: nothing moves
    const ev = {};
    for (const inp of steps) {
      p.inp = { st: inp.st, th: inp.th, dr: inp.dr };
      const x0 = p.car.x, y0 = p.car.y;
      stepCar(p.car, p.inp, p.st, this.T, DT, ev);
      this.crossGates(p, x0, y0, p.car.x, p.car.y);
      if (!p.alive || p.finished) break;
    }
    if (ev.launch) this.events.push(['jump', p.id]);
    if (ev.turbo) this.events.push(['mt', p.id, ev.turbo]);
    if (!p.alive) return;
    if (p.act.f) { p.act.f = 0; this.fireWeapon(p); }
    if (p.act.i) { p.act.i = 0; this.useItem(p); }
    if (p.alive && p.car.airT <= 0) this.ground(p);
  }

  // lava, pits and timed hazards under a grounded car
  ground(p) {
    const S = SURF[p.car.surf];
    if (S && S.fall) return this.destroy(p, null, 'fall');
    if (S && S.dmg) this.damage(p, null, S.dmg * DT, 'lava', true);
    for (const h of this.T.hazards) {
      if (!this.hazardOn(h)) continue;
      if (Math.hypot(p.car.x - h.x, p.car.y - h.y) < h.r + CAR_R * 0.5) this.damage(p, null, 150 * DT, h.kind, true);
    }
  }
  hazardOn(h) { const t = ((this.time + h.phase) % h.period + h.period) % h.period; return this.time > 0 && t < h.on; }

  // ------------------------------------------------------------------ laps and checkpoints
  crossGates(p, x0, y0, x1, y1) {
    const G = this.T.gates, N = G.length;
    if (!N || p.finished) return;
    for (let guard = 0; guard < 2; guard++) {
      const nx = (p.cp + 1) % N, g = G[nx];
      if (segHit(x0, y0, x1, y1, g.x0, g.y0, g.x1, g.y1) && (x1 - x0) * g.tx + (y1 - y0) * g.ty > 0) { this.passGate(p, nx); continue; }
      const c = G[p.cp];
      // driving back over the last gate takes it back (no counting a lap twice)
      if (segHit(x0, y0, x1, y1, c.x0, c.y0, c.x1, c.y1) && (x1 - x0) * c.tx + (y1 - y0) * c.ty < 0) {
        if (p.cp === 0) p.lap--;
        p.cp = (p.cp - 1 + N) % N;
        continue;
      }
      break;
    }
  }
  passGate(p, k) {
    p.cp = k;
    if (k !== 0) return;
    p.lap++;
    if (p.lap > p.maxLap) {
      if (p.maxLap >= 1) { // a lap completed
        const lt = r3(this.time - p.lapStart);
        p.lapTimes.push(lt);
        if (p.bestLap == null || lt < p.bestLap) p.bestLap = lt;
        if (!this.mode.solo) p.mc += COINS.lap;
        this.events.push(['lap', p.id, p.lap, lt]);
      }
      p.maxLap = p.lap;
      p.lapStart = this.time;
    }
    if (this.laps && p.lap > this.laps && !p.finished) this.finishRacer(p);
  }
  finishRacer(p) {
    p.finished = true;
    p.place = ++this.places;
    p.finishTime = r3(this.time);
    p.lap = this.laps;
    p.ghostT = 0;
    this.events.push(['fin', p.id, p.place, p.finishTime]);
    if (p.place === 1) this.finishAt = Math.min(RACE_CAP, this.time + FINISH_TIMEOUT);
  }

  // race distance covered (for positions): laps * L + distance along the loop since the last gate
  progress(p) {
    const T = this.T, G = T.gates, N = G.length, L = T.L;
    if (!N) return 0;
    const s = T.toMain(p.car.pc, p.car.ps);
    const a = G[p.cp].s, b = p.cp + 1 < N ? G[p.cp + 1].s : L;
    let u = ((s - a) % L + L) % L; // ahead of the last gate by u
    if (u > (b - a) + (L - (b - a)) / 2) u -= L; // actually behind it
    u = Math.max(0, Math.min(b - a, u));
    return (p.lap - 1) * L + a + u;
  }

  rank() {
    const list = [...this.players.values()];
    for (const p of list) if (!p.finished && !p.out) p.prog = this.mode.arena ? 0 : this.progress(p);
    if (this.mode.arena) list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
    else list.sort((a, b) => (a.out - b.out) || (b.out && a.out ? a.place - b.place : 0)
      || (b.finished - a.finished) || (a.finished ? a.place - b.place : b.prog - a.prog) || a.id - b.id);
    list.forEach((p, i) => { p.rank = i + 1; });
    this.order = list;
    // BOUNTY: the leader glows on everyone's map; wrecking them steals their match coins
    const lead = list[0];
    this.leaderId = lead && !lead.out && !lead.finished && this.time > 0 && (!this.mode.arena || lead.kills > 0) ? lead.id : 0;
  }

  modeTick() {
    if (this.time <= 0) return;
    const active = [...this.players.values()].filter((p) => !p.out);
    if (this.modeKey === 'elim') {
      if (this.time >= this.elimNext && active.length > 1) {
        const last = this.order.filter((p) => !p.out).pop();
        this.eliminate(last);
        this.elimNext += this.mode.every;
      }
      if (this.racers() <= 1) return this.finish();
    } else if (this.modeKey === 'battle') {
      if (this.time >= this.mode.time) return this.finish();
    } else {
      const running = active.filter((p) => !p.finished && !p.left);
      // everyone still racing is a bot: wrap up quickly
      if (this.finishAt != null && !running.some((p) => !p.wasBot)) this.finishAt = Math.min(this.finishAt, this.time + 5);
      if (!running.length || (this.finishAt != null && this.time >= this.finishAt) || this.time >= RACE_CAP) return this.finish();
    }
  }
  eliminate(p) {
    if (!p || p.out) return;
    p.out = true;
    p.place = [...this.players.values()].filter((q) => !q.out).length + 1;
    p.alive = false;
    this.outCount++;
    this.events.push(['elim', p.id, p.place]);
  }

  // ------------------------------------------------------------------ combat
  damage(t, src, amount, kind, ground = false) {
    if (!t.alive || t.out || t.finished || t.ghostT > 0) return false;
    if (ground && t.car.airT > 0) return false;
    // a shield takes one hit (not the lava you sit in)
    if (t.shieldT > 0 && kind !== 'lava') { t.shieldT = 0; this.events.push(['shield', t.id]); return false; }
    t.hp -= amount;
    if (src && src !== t) t.lastHit = { id: src.id, at: this.time };
    if (kind !== 'lava') this.events.push(['hit', t.id, src ? src.id : 0, kind, Math.round(amount)]);
    if (t.hp <= 0) this.destroy(t, src, kind);
    return true;
  }
  destroy(p, src, cause) {
    if (!p.alive || p.out) return;
    p.alive = false;
    p.hp = 0;
    p.deaths++;
    p.respawnTick = this.tickN + RESPAWN_TICKS;
    p.car.vx = p.car.vy = 0; p.car.drift = 0; p.car.dc = 0; p.car.boostT = 0; p.car.airT = 0; p.car.spinT = 0;
    let by = src && src !== p ? src : null;
    if (!by && p.lastHit && this.time - p.lastHit.at <= CREDIT_WINDOW) by = this.players.get(p.lastHit.id) || null;
    if (by && by !== p) {
      by.kills++;
      by.mc += COINS.takedown;
      if (this.leaderId === p.id) { // BOUNTY STEAL
        const stolen = Math.ceil(p.mc / 2);
        p.mc -= stolen; by.mc += stolen; by.steals++;
        addBoost(by.car, BOOSTS.bounty);
        this.events.push(['steal', by.id, p.id, stolen]);
      }
    }
    p.lastHit = null;
    this.events.push(['ko', p.id, by ? by.id : 0, cause]);
  }
  respawn(p) {
    const T = this.T;
    let spot;
    if (this.mode.arena) {
      // the spawn farthest from everyone else
      let best = -1;
      for (const g of T.grid) {
        let near = Infinity;
        for (const q of this.players.values()) if (q !== p && q.alive && !q.out) near = Math.min(near, Math.hypot(q.car.x - g.x, q.car.y - g.y));
        if (near > best) { best = near; spot = g; }
      }
    } else spot = this.respawnSpot(p);
    p.car = newCar(spot.x, spot.y, spot.a);
    stepCar(p.car, { st: 0, th: 0, dr: 0 }, p.st, T, 0);
    p.alive = true; p.hp = p.maxHp; p.ghostT = GHOST_TIME; p.ep++;
    p.ai = null;
    this.events.push(['rs', p.id]);
  }
  // just past the last checkpoint, on plain road, spread out so wrecks don't stack
  respawnSpot(p) {
    const T = this.T, main = T.corridors[0], g = T.gates[p.cp], P = {};
    for (const ds of [70, 150, 240, 330]) {
      const hw = hwAt(main, g.s + ds);
      for (const f of [((p.id % 3) - 1) * 0.4, 0, -0.45, 0.45, -0.7, 0.7]) {
        const pt = pointAt(main, g.s + ds, f * hw);
        T.probe(pt.x, pt.y, CAR_R, P);
        if (P.pen > 0 || P.surf !== 'road' || P.c !== 0) continue;
        if (T.hazards.some((h) => Math.hypot(pt.x - h.x, pt.y - h.y) < h.r + CAR_R * 2)) continue;
        return pt;
      }
    }
    return pointAt(main, g.s + 70, 0);
  }

  enemies(p) { return [...this.players.values()].filter((q) => q !== p && q.alive && !q.out && !q.finished && q.ghostT <= 0); }
  fireWeapon(p) {
    if (!this.mode.weapons || p.wcd > 0 || p.empT > 0 || p.finished) return;
    const W = WEAPONS[p.driver], c = p.car, hx = Math.cos(c.a), hy = Math.sin(c.a);
    p.wcd = W.cd;
    switch (p.driver) {
      case 'volt': {
        let best = null, bd = W.range;
        for (const q of this.enemies(p)) {
          const d = Math.hypot(q.car.x - c.x, q.car.y - c.y);
          if (d < bd && Math.abs(angDiff(c.a, Math.atan2(q.car.y - c.y, q.car.x - c.x))) < W.cone) { bd = d; best = q; }
        }
        this.events.push(['arc', p.id, best ? best.id : 0]);
        if (best && this.damage(best, p, W.dmg, 'arc')) best.car.slowT = Math.max(best.car.slowT, W.slow);
        break;
      }
      case 'brick': {
        this.events.push(['pulse', p.id]);
        for (const q of this.enemies(p)) {
          const dx = q.car.x - c.x, dy = q.car.y - c.y, d = Math.hypot(dx, dy);
          if (d > W.r || q.car.airT > 0) continue;
          if (this.damage(q, p, W.dmg, 'pulse', true) && q.alive) { q.car.vx += (dx / (d || 1)) * W.knock; q.car.vy += (dy / (d || 1)) * W.knock; }
        }
        break;
      }
      case 'wisp': {
        const x0 = c.x + hx * CAR_R, y0 = c.y + hy * CAR_R;
        let len = 0;
        while (len < W.range && this.T.inside(x0 + hx * (len + 30), y0 + hy * (len + 30))) len += 30;
        let hit = null, hd = Infinity;
        for (const q of this.enemies(p)) {
          const d = distToSeg(q.car.x, q.car.y, x0, y0, x0 + hx * len, y0 + hy * len), along = (q.car.x - x0) * hx + (q.car.y - y0) * hy;
          if (d < W.width + CAR_R && along > 0 && along < hd) { hd = along; hit = q; }
        }
        const end = hit ? hd : len;
        this.events.push(['rail', p.id, Math.round(x0), Math.round(y0), Math.round(x0 + hx * end), Math.round(y0 + hy * end), hit ? hit.id : 0]);
        if (hit) this.damage(hit, p, W.dmg, 'rail');
        break;
      }
      case 'dune': {
        const mine = this.ents.filter((e) => e.kind === 'mine' && e.owner === p.id);
        if (mine.length >= W.max) this.ents.splice(this.ents.indexOf(mine[0]), 1);
        this.addEnt('mine', p, c.x - hx * 40, c.y - hy * 40, c.a, { life: W.life, arm: W.arm });
        break;
      }
      case 'rook':
        this.addEnt('turret', p, c.x - hx * 44, c.y - hy * 44, c.a, { life: W.life, reload: 0.3 });
        break;
      case 'flicker': {
        // blink forward (never through a wall), slicing grounded racers along the way
        const x0 = c.x, y0 = c.y;
        let d = 0;
        while (d < W.dist && this.T.inside(x0 + hx * (d + 20), y0 + hy * (d + 20), CAR_R)) d += 20;
        const x1 = x0 + hx * d, y1 = y0 + hy * d;
        for (const q of this.enemies(p)) if (q.car.airT <= 0 && distToSeg(q.car.x, q.car.y, x0, y0, x1, y1) < W.width + CAR_R) this.damage(q, p, W.dmg, 'blink', true);
        c.x = x1; c.y = y1; p.ep++;
        this.crossGates(p, x0, y0, x1, y1);
        stepCar(c, { st: 0, th: 0, dr: 0 }, p.st, this.T, 0); // settle on the new spot
        this.events.push(['blink', p.id, Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)]);
        break;
      }
    }
  }

  useItem(p) {
    if (!p.item || p.empT > 0 || p.finished) return;
    const it = p.item, I = ITEMS[it], c = p.car, hx = Math.cos(c.a), hy = Math.sin(c.a);
    p.item = null;
    this.events.push(['use', p.id, ITEM_IDS.indexOf(it)]);
    switch (it) {
      case 'missile': {
        // locks on to the racer one place ahead, else the nearest in front
        let tgt = !this.mode.arena && p.rank > 1 ? this.order[p.rank - 2] : null;
        if (!tgt || !tgt.alive || tgt.out || tgt.finished) {
          tgt = null;
          let bd = 2200;
          for (const q of this.enemies(p)) {
            const d = Math.hypot(q.car.x - c.x, q.car.y - c.y);
            if (d < bd && Math.abs(angDiff(c.a, Math.atan2(q.car.y - c.y, q.car.x - c.x))) < 1.2) { bd = d; tgt = q; }
          }
        }
        this.addEnt('missile', p, c.x + hx * 34, c.y + hy * 34, c.a, { life: I.life, target: tgt ? tgt.id : 0, speed: I.speed });
        break;
      }
      case 'rockets':
        for (let k = 0; k < I.n; k++) {
          const a = c.a + (k - (I.n - 1) / 2) * I.spread;
          this.addEnt('rocket', p, c.x + hx * 30, c.y + hy * 30, a, { life: I.life, speed: I.speed + Math.max(0, c.vx * hx + c.vy * hy) });
        }
        break;
      case 'oil': this.addEnt('oil', p, c.x - hx * 56, c.y - hy * 56, c.a, { life: I.life }); break;
      case 'spikes': this.addEnt('spikes', p, c.x - hx * 60, c.y - hy * 60, c.a + Math.PI / 2, { life: I.life, hits: I.hits, seen: [] }); break;
      case 'shield': p.shieldT = I.t; break;
      case 'turbo': addBoost(c, BOOSTS.turbo); break;
      case 'emp':
        this.events.push(['emp', p.id]);
        for (const q of this.enemies(p)) {
          if (Math.hypot(q.car.x - c.x, q.car.y - c.y) > I.r) continue;
          if (q.shieldT > 0) { q.shieldT = 0; this.events.push(['shield', q.id]); continue; }
          q.empT = Math.max(q.empT, I.t);
          q.car.slowT = Math.max(q.car.slowT, I.slow);
        }
        break;
    }
  }

  addEnt(kind, owner, x, y, a, o) {
    const e = { id: this.nextEnt++, kind, k: ENT.indexOf(kind), owner: owner.id, x, y, a, t: 0, ...o };
    this.ents.push(e);
    return e;
  }

  updateEnts() {
    const keep = [];
    for (const e of this.ents) {
      e.t += DT;
      if (e.t >= e.life || e.dead) continue;
      if (this.updateEnt(e)) keep.push(e);
    }
    this.ents = keep;
  }
  // returns false when the entity is used up
  updateEnt(e) {
    const owner = this.players.get(e.owner);
    const others = (ground) => [...this.players.values()].filter((q) => q.alive && !q.out && !q.finished && q.ghostT <= 0 && (!ground || q.car.airT <= 0));
    switch (e.kind) {
      case 'missile': {
        const tgt = this.players.get(e.target);
        if (tgt && tgt.alive && !tgt.out && !tgt.finished) e.a += Math.max(-ITEMS.missile.turn * DT, Math.min(ITEMS.missile.turn * DT, angDiff(e.a, Math.atan2(tgt.car.y - e.y, tgt.car.x - e.x))));
        e.x += Math.cos(e.a) * e.speed * DT; e.y += Math.sin(e.a) * e.speed * DT;
        for (const q of others(false)) {
          if (q.id === e.owner && e.t < 1) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < CAR_R + 18) {
            this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]);
            if (this.damage(q, owner, ITEMS.missile.dmg, 'missile') && q.alive) { q.car.spinT = ITEMS.missile.spin; q.car.spinDir = this.rand() < 0.5 ? -1 : 1; }
            return false;
          }
        }
        return true;
      }
      case 'rocket': case 'bolt': {
        const dmg = e.kind === 'rocket' ? ITEMS.rockets.dmg : WEAPONS.rook.dmg;
        e.x += Math.cos(e.a) * e.speed * DT; e.y += Math.sin(e.a) * e.speed * DT;
        if (!this.T.inside(e.x, e.y, 0)) { this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]); return false; }
        for (const q of others(true)) {
          if (q.id === e.owner) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < CAR_R + 10) {
            this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]);
            this.damage(q, owner, dmg, e.kind, true);
            return false;
          }
        }
        return true;
      }
      case 'oil':
        for (const q of others(true)) {
          if (q.id === e.owner && e.t < 1.2) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < ITEMS.oil.r + CAR_R * 0.6) {
            if (q.shieldT > 0) { q.shieldT = 0; this.events.push(['shield', q.id]); return false; }
            q.car.spinT = ITEMS.oil.spin; q.car.spinDir = this.rand() < 0.5 ? -1 : 1; q.car.drift = 0; q.car.dc = 0;
            if (owner && owner !== q) q.lastHit = { id: owner.id, at: this.time };
            this.events.push(['spin', q.id, e.owner]);
            return false;
          }
        }
        return true;
      case 'spikes': {
        const hx = Math.cos(e.a) * ITEMS.spikes.half, hy = Math.sin(e.a) * ITEMS.spikes.half;
        for (const q of others(true)) {
          if ((q.id === e.owner && e.t < 1.2) || e.seen.includes(q.id)) continue;
          if (distToSeg(q.car.x, q.car.y, e.x - hx, e.y - hy, e.x + hx, e.y + hy) < CAR_R + 8) {
            e.seen.push(q.id);
            if (this.damage(q, owner, ITEMS.spikes.dmg, 'spikes', true) && q.alive) q.car.slowT = Math.max(q.car.slowT, ITEMS.spikes.slow);
            if (--e.hits <= 0) return false;
          }
        }
        return true;
      }
      case 'mine': {
        if (e.t < e.arm) return true;
        const W = WEAPONS.dune;
        for (const q of others(true)) {
          if (q.id === e.owner) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < W.r + CAR_R) {
            this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]);
            if (this.damage(q, owner, W.dmg, 'mine', true) && q.alive) q.car.slowT = Math.max(q.car.slowT, W.slow);
            return false;
          }
        }
        return true;
      }
      case 'turret': {
        const W = WEAPONS.rook;
        e.reload -= DT;
        if (e.reload > 0) return true;
        let best = null, bd = W.range;
        for (const q of others(true)) {
          if (q.id === e.owner) continue;
          const d = Math.hypot(q.car.x - e.x, q.car.y - e.y);
          if (d < bd) { bd = d; best = q; }
        }
        if (best) {
          e.reload = W.rate;
          // lead the target a little
          const tt = bd / W.speed, ax = best.car.x + best.car.vx * tt, ay = best.car.y + best.car.vy * tt;
          e.a = Math.atan2(ay - e.y, ax - e.x);
          this.addEnt('bolt', owner || { id: e.owner }, e.x + Math.cos(e.a) * 20, e.y + Math.sin(e.a) * 20, e.a, { life: 0.6, speed: W.speed });
        }
        return true;
      }
    }
    return false;
  }

  updateBoxes() {
    if (!this.mode.items) return;
    const B = this.T.boxes;
    for (let k = 0; k < B.length; k++) {
      if (this.boxes[k] > this.tickN) continue;
      const b = B[k];
      for (const p of this.players.values()) {
        if (!p.alive || p.out || p.finished) continue;
        const dx = p.car.x - b.x, dy = p.car.y - b.y;
        if (dx * dx + dy * dy > (CAR_R + 22) ** 2) continue;
        this.boxes[k] = this.tickN + Math.round(BOX_RESPAWN * TICK_RATE);
        p.mc += COINS.box;
        if (!p.item) p.item = rollItem(p.rank || 1, this.racers(), this.rand(), !!this.mode.arena);
        this.events.push(['box', p.id, k, p.item ? ITEM_IDS.indexOf(p.item) : -1]);
        break;
      }
    }
  }
  racers() { let n = 0; for (const p of this.players.values()) if (!p.out) n++; return n; }

  // car-to-car bumps (not ghosts, not wrecks; airborne cars only meet other airborne cars)
  collisions() {
    const L = this.order;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || a.out || a.ghostT > 0 || a.finished) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || b.out || b.ghostT > 0 || b.finished || (a.car.airT > 0) !== (b.car.airT > 0)) continue;
        const dx = b.car.x - a.car.x, dy = b.car.y - a.car.y;
        if (dx * dx + dy * dy >= (CAR_R * 2) ** 2) continue;
        const imp = collideCars(a.car, b.car, a.st.mass, b.st.mass);
        if (imp > 250) this.events.push(['bump', a.id, b.id, Math.round(imp)]);
      }
    }
  }

  // ------------------------------------------------------------------ snapshots
  flags(p) {
    const c = p.car;
    return (c.drift ? FLAG.DRIFT : 0) | (c.boostT > 0 ? FLAG.BOOST : 0) | (c.airT > 0 ? FLAG.AIR : 0) | (p.shieldT > 0 ? FLAG.SHIELD : 0)
      | (this.leaderId === p.id ? FLAG.LEADER : 0) | (!p.alive ? FLAG.DEAD : 0) | (c.spinT > 0 ? FLAG.SPIN : 0) | (p.empT > 0 ? FLAG.EMP : 0)
      | (p.finished ? FLAG.FINISHED : 0) | (p.out ? FLAG.OUT : 0) | (p.ghostT > 0 ? FLAG.GHOST : 0) | (c.slowT > 0 ? FLAG.SLOW : 0)
      | (driftTier(c.dc) << 12) | ((c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a)) < -20 ? FLAG.REVERSE : 0);
  }
  hud() {
    if (this.modeKey === 'grand' || this.modeKey === 'trial') return { laps: this.laps, ft: this.finishAt != null ? r2(Math.max(0, this.finishAt - this.time)) : null };
    if (this.modeKey === 'elim') return { nx: r2(Math.max(0, this.elimNext - this.time)), left: this.racers() };
    return { tl: r2(Math.max(0, this.mode.time - this.time)) };
  }
  snapshots() {
    const cars = [];
    for (const p of this.players.values()) {
      if (p.out) continue;
      const c = p.car;
      cars.push([p.id, Math.round(c.x), Math.round(c.y), Math.round(c.a * 1000), this.flags(p), Math.round((100 * Math.max(0, p.hp)) / p.maxHp), p.lap, Math.round(Math.hypot(c.vx, c.vy))]);
    }
    const ents = this.ents.map((e) => [e.id, e.k, Math.round(e.x), Math.round(e.y), Math.round(e.a * 1000), e.owner, e.kind === 'mine' ? (e.t >= e.arm ? 1 : 0) : 0]);
    const bx = [];
    for (let k = 0; k < this.boxes.length; k++) if (this.boxes[k] > this.tickN) bx.push(k);
    let hz = 0;
    this.T.hazards.forEach((h, i) => { if (this.hazardOn(h)) hz |= 1 << i; });
    const common = { t: 's', n: this.tickN, tm: this.time, c: cars, rk: this.order.map((p) => p.id), ld: this.leaderId, e: ents, bx, hz, md: this.hud() };
    if (this.events.length) common.ev = this.events;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.send(p.id, { ...common, me: this.meMsg(p) });
    }
  }
  meMsg(p) {
    return {
      s: packState(p.car), ack: p.lastSeq, ep: p.ep, hp: Math.max(0, Math.round(p.hp)), mh: p.maxHp,
      it: p.item ? ITEM_IDS.indexOf(p.item) : -1, wc: r2(p.wcd), sh: r2(p.shieldT), em: r2(p.empT), gh: r2(p.ghostT),
      lap: p.lap, cp: p.cp, rk: p.rank, rt: p.alive ? 0 : r2(Math.max(0, (p.respawnTick - this.tickN) * DT)),
      mc: p.mc, k: p.kills, d: p.deaths, lt: p.maxLap >= 1 && !p.finished ? r2(this.time - p.lapStart) : 0, bl: p.bestLap,
      fin: p.place && p.finished ? p.place : 0, out: p.out ? p.place : 0, auto: p.finished ? 1 : 0,
    };
  }

  // ------------------------------------------------------------------ end
  resultRow(p, rank) {
    return {
      p, rank, players: this.players.size, mode: this.modeKey, track: this.trackKey, kills: p.kills, steals: p.steals, mc: p.mc,
      time: p.finishTime, bestLap: p.bestLap, finished: !!p.finished, driver: p.driver,
    };
  }
  finish() {
    if (this.phase === 'end') return;
    this.rank();
    this.phase = 'end';
    this.ended = true;
    const ranked = this.order;
    const results = ranked.map((p) => [p.id, p.name, p.driver, p.rank, p.finishTime, p.kills, p.mc, p.wasBot ? 1 : 0, p.bestLap, p.finished ? 1 : 0, p.deaths]);
    this.hooks.finished?.(ranked.filter((p) => !p.wasBot && !p.left).map((p) => this.resultRow(p, p.rank)));
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.send(p.id, { t: 'end', mode: this.modeKey, track: this.trackKey, rank: p.rank, you: p.id, results, n: this.players.size, time: p.finishTime, bestLap: p.bestLap, mc: p.mc, k: p.kills });
    }
  }
}
