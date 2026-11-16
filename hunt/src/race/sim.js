// Hunt Racers authoritative race simulation (one per RaceRoom Durable Object), 30 ticks/s.
// Phases: 'lobby' (waiting for racers) -> 'play' (time < 0 is the grid countdown) -> 'end'.
// Every car is driven by public/race/physics.js stepCar(), the same code the client predicts with.
import { DT, TICK_RATE, CAR_R, DRIVERS, DRIVER_IDS, newCar, stepCar, collideCars, addBoost, BOOSTS, cleanInput, cleanSens, packState, driftTier, SURF } from '../../public/race/physics.js';
import { getTrack, TRACK_IDS } from '../../public/race/tracks.js';
import { pointAt, hwAt, nearestS } from '../../public/race/trackgeom.js';
import { ITEMS, ITEM_IDS, rollItem, WEAPONS, itemStat, MAX_LEVEL, COMBAT } from '../../public/race/items.js';
import { FLAG, ENT, COUNTDOWN, RESPAWN_TIME, RACE_MODES, TUTORIAL_MODE, TUT_STEPS, RESET_COOLDOWN, STUCK_NUDGE, STUCK_RESET, ELIM, elimInterval, EMOTES } from '../../public/race/protocol.js';
import { BOT_NAMES, rng } from '../../public/shared.js';
import { botInput, levelForTrophies } from './bots.js';
import { cosRow } from '../../public/race/garage.js';

export { RACE_MODES };
export const RACE_MAX = 10;
export const RESPAWN_TICKS = Math.round(RESPAWN_TIME * TICK_RATE); // exactly 2 s
export const GHOST_TIME = 1.5; // can't be hit / bumped right after respawning
export const FINISH_TIMEOUT = 30; // the race ends this long after the winner crosses the line
export const RACE_CAP = 300; // hard cap on a race (s)
export const BOX_RESPAWN = 3;
export const CREDIT_WINDOW = 4; // a wreck within 4 s of a hit is credited to the hitter
export const COINS = { box: 1, lap: 2, takedown: 3 };
export const HORN_GAP = 1.5; // seconds between two horns from one car
export const ROOM_IDLE_SECS = 300; // a host-run friend room whose host never presses START starts by itself after 5 minutes
export const RESET_GHOST = 1; // s of ghosting after a reset (no hits, no bumps)
export const STUCK_SPEED = 60; // px/s: slower than this against a wall with throttle on = stuck
const NUDGE_DIST = 120, NUDGE_SPEED = 150; // the automatic nudge: px toward the racing line, px/s along the track
const MODES = { ...RACE_MODES, tutorial: TUTORIAL_MODE };
const r1 = (v) => Math.round(v * 10) / 10;
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

const IDLE = { st: 0, th: 0, dr: 0 };

export class RaceSim {
  // o: { mode, track, seed, fillBots, lobbyTime, hostStart, send(id, msg), hooks: {finished(rows)}, botLevel }
  // hostStart (friend rooms): the first human in is the host and starts the race with START
  constructor(o = {}) {
    this.modeKey = MODES[o.mode] ? o.mode : 'grand';
    this.mode = MODES[this.modeKey];
    this.trackKey = this.mode.tutorial ? 'tutorial' : TRACK_IDS.includes(o.track) ? o.track : TRACK_IDS[0];
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
    this.elimNext = this.mode.every ? ELIM.first : null;
    this.outCount = 0;
    // ELIMINATION: cutIv = length of the running cut timer (s), cutN = racers when it was set, bh = the
    // black hole's race distance (px, same scale as p.prog), dangerId = the racer in last place (cut next)
    this.cutIv = ELIM.first; this.cutN = 0; this.bh = null; this.dangerId = 0; this.duel = false; this.cuts = 0;
    this.bhOff = false; // (tests: the cut schedule on its own)
    this.ended = false;
  }

  // ------------------------------------------------------------------ roster
  humans() { return [...this.players.values()].filter((p) => !p.wasBot); }
  addPlayer({ name, driver, bot = false, sens }) {
    const id = this.nextId++;
    const st = DRIVERS[driver] ? driver : 'volt';
    const p = {
      id, name, driver: st, st: DRIVERS[st], bot, wasBot: bot, connected: !bot, car: newCar(), hp: DRIVERS[st].armor, maxHp: DRIVERS[st].armor,
      alive: true, respawnTick: 0, ghostT: 0, shieldT: 0, empT: 0, item: null, wcd: 0, lap: 0, cp: 0, maxLap: 0, prog: 0, rank: 0,
      finished: false, place: 0, finishTime: null, out: false, kills: 0, deaths: 0, steals: 0, mc: 0, lastHit: null,
      inp: { st: 0, th: 0, dr: 0 }, act: { f: 0, i: 0 }, queue: [], credits: 2, lastSeq: 0, lapStart: 0, lapTimes: [], bestLap: null,
      ai: null, left: false, recorded: false, ep: 0, trophies: 0, account: null, secret: null, gar: null, honk: 0, hornAt: -1e9,
      // sens: steering sensitivity (heading steering); stuck: wall-pinned / no-progress timers, RESET cooldown
      sens: cleanSens(sens), wallT: 0, noProgT: 0, bestProg: -Infinity, stuck: 0, nudged: false, resetCd: 0, resetReq: 0, bumpN: -9, resets: 0, nudges: 0,
      tut: 0, fired: false, dummy: false,
      // weapons: il item level (1-3), protT hit protection, phaseT Ghost Mode, shieldN hits a shield still blocks,
      // drAt when DRIFT was last pressed (missile dodge), dodges / combos (stats for tests and bots)
      il: 0, protT: 0, phaseT: 0, shieldN: 0, drAt: -9, drAt0: -9, drPrev: 0, dodges: 0, combos: 0,
      // elimination: outAt race time knocked out, outBy 'cut' | 'hole' | 'left', bursts takedown boosts, emoAt last emote
      outAt: null, outBy: null, bursts: 0, emoAt: -1e9, emo: -1,
    };
    this.players.set(id, p);
    return p;
  }
  // [name, driver, isBot, cosmetics]: the equipped store ids for the car they drive (garage.js
  // cosRow, SLOTS order, 0 = default) so every client draws everyone's look. Draw-only data.
  rosterRow(p) { return [p.name, p.driver, p.wasBot ? 1 : 0, p.gar ? cosRow(p.gar, p.driver) : 0]; }
  // an account's saved cosmetics (owned + equipped per car), read by the room when the account loads
  // (it can arrive after the race started: then everyone gets the updated roster row)
  setGarage(id, prog) {
    const p = this.players.get(id);
    if (!p) return;
    p.gar = { owned: Array.isArray(prog?.owned) ? prog.owned : [], race: { cos: prog?.race?.cos || {} } };
    if (this.phase === 'play') this.broadcast({ t: 'ro', add: { [id]: this.rosterRow(p) } });
  }
  rosterMsg() { const add = {}; for (const p of this.players.values()) add[p.id] = this.rosterRow(p); return { t: 'ro', add, full: 1 }; }
  broadcast(msg) { for (const p of this.players.values()) if (p.connected) this.send(p.id, msg); }

  // o.sens: the player's steering sensitivity (0.5..1.5, the `sens` join param)
  join(name, driver, o = {}) {
    if (this.phase !== 'lobby' || this.players.size >= this.maxPlayers) return null;
    const p = this.addPlayer({ name, driver, sens: o.sens });
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
    // knocked out already (an Elimination spectator leaving): their place is settled
    return this.resultRow(p, p.out ? p.place : this.players.size);
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
    // TUTORIAL: one parked target car to shoot (never drives, never in anyone's results)
    if (this.mode.tutorial && !this.dummy) { this.dummy = this.addPlayer({ name: 'Target', driver: 'brick', bot: true }); this.dummy.dummy = true; }
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
    if (this.dummy) this.parkDummy();
    this.phase = 'play';
    this.time = -COUNTDOWN;
    this.tickN = 0;
    this.rank();
    if (this.modeKey === 'elim') {
      this.cutN = this.players.size;
      this.bh = Math.min(...this.order.map((p) => p.prog)) - ELIM.hole.start; // behind the back of the grid
    }
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
    if (m.t === 'reset') { if (!p.bot) p.resetReq = 1; return; } // applied inside the next tick
    if (m.t === 'horn') { if (this.phase === 'play') p.honk = 1; return; } // applied in the next tick (rate-limited there)
    if (m.t === 'emote') { if (this.phase === 'play' && p.out && Number.isInteger(m.e) && m.e >= 0 && m.e < EMOTES.length) p.emo = m.e; return; } // spectators only
    if (m.t !== 'in' || p.bot) return;
    const inp = cleanInput(m);
    inp.s = m.s >>> 0; inp.f = m.f ? 1 : 0; inp.i = m.i ? 1 : 0;
    p.queue.push(inp);
    // too far behind: drop the oldest but keep their button presses
    while (p.queue.length > 6) { const o = p.queue.shift(); p.queue[0].f |= o.f; p.queue[0].i |= o.i; p.lastSeq = o.s; }
  }

  // local dev / browser-test hooks (the room only forwards these when HUNT_DEV is set):
  // {k: 'wreck'} wrecks your car, {k: 'item', item, lv} hands you an item (level 1-3),
  // {k: 'aim', item, lv} makes the nearest other racer use that item now (aimed at you when it homes)
  // (queued and applied inside the next tick, so their events go out with that tick's snapshot)
  dev(id, m) { (this.devQ ||= []).push([id, m]); }
  applyDev() {
    for (const [id, m] of this.devQ.splice(0)) {
      const p = this.players.get(id);
      if (!p || this.phase !== 'play' || this.time <= 0) continue;
      if (m.k === 'wreck') this.destroy(p, null, 'fall');
      else if (m.k === 'cut' && this.modeKey === 'elim' && this.racers() > 1) { this.rank(); this.eliminate(p, 'cut'); this.rank(); } // knock yourself out (spectate)
      else if (m.k === 'cutnow' && this.modeKey === 'elim') this.elimNext = this.time; // the next cut this tick
      else if (m.k === 'hole' && this.modeKey === 'elim' && !p.out) this.bh = this.progress(p) - (Number(m.gap) > 0 ? Math.min(2000, Number(m.gap)) : 350); // the black hole right behind you
      else if (m.k === 'item' && ITEM_IDS.includes(m.item) && !p.item) { p.item = m.item; p.il = Math.max(1, Math.min(MAX_LEVEL, m.lv | 0 || 1)); }
      else if (m.k === 'aim' && ITEM_IDS.includes(m.item)) {
        let q = null, bd = Infinity;
        for (const o of this.players.values()) { if (o === p || !o.alive || o.out || o.finished) continue; const d = Math.hypot(o.car.x - p.car.x, o.car.y - p.car.y); if (d < bd) { bd = d; q = o; } }
        if (!q) continue;
        q.item = m.item; q.il = Math.max(1, Math.min(MAX_LEVEL, m.lv | 0 || 1)); q.empT = 0; q.phaseT = 0;
        this.aimAt = () => p; // homing items lock on to you
        this.useItem(q);
        delete this.aimAt;
        const sb = m.item === 'sticky' && this.ents.at(-1); // a sticky bomb goes straight onto you
        if (sb && sb.kind === 'sticky') { sb.mode = 'stuck'; sb.carrier = p.id; sb.passCd = sb.st.pass; this.events.push(['stick', p.id, q.id, sb.id]); }
      }
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
    // HORN: an event for everyone (clients play it louder the closer they are), one per HORN_GAP
    for (const p of this.players.values()) if (p.honk) {
      p.honk = 0;
      if (p.connected && !p.out && this.time - p.hornAt >= HORN_GAP) { p.hornAt = this.time; this.events.push(['horn', p.id]); }
    }
    for (const p of this.players.values()) if (p.emo >= 0) {
      if (this.time - p.emoAt >= ELIM.emoteGap) { p.emoAt = this.time; this.events.push(['emo', p.id, p.emo]); }
      p.emo = -1;
    }
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
    if (p.protT > 0) p.protT = Math.max(0, p.protT - DT);
    if (p.phaseT > 0) p.phaseT = Math.max(0, p.phaseT - DT);
    if (p.shieldT <= 0) p.shieldN = 0;
    if (p.wcd > 0) p.wcd = Math.max(0, p.wcd - DT);
    // inputs: one physics step per input; bots and finished racers get one from the autopilot
    const auto = p.bot || p.finished || (!p.connected && !p.wasBot && this.fillBots);
    const steps = [];
    if (p.dummy) steps.push(IDLE);
    else if (auto) {
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
    if (!go) { p.act.f = p.act.i = p.resetReq = 0; return; } // grid countdown: nothing moves
    const ev = {};
    for (const inp of steps) {
      p.inp = { st: inp.st, th: inp.th, dr: inp.dr, ha: inp.ha ?? null, hm: inp.hm || 0, sens: p.sens };
      // DRIFT pressed (not held): the missile dodge. Presses closer than 0.8 s apart don't count (no spamming)
      if (inp.dr && !p.drPrev) { if (this.time - p.drAt0 >= 0.8) p.drAt = this.time; p.drAt0 = this.time; }
      p.drPrev = inp.dr ? 1 : 0;
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
    if (p.alive) this.unstick(p);
    if (this.mode.tutorial && !p.wasBot) this.tutorialStep(p);
  }

  // ------------------------------------------------------------------ never stuck
  // "Stuck" = against a wall (or wedged against a pillar / another car) and slower than STUCK_SPEED
  // with throttle on, or no progress along the track for STUCK_RESET s. Pinned for STUCK_NUDGE s:
  // a nudge toward the racing line, facing along the track. Stuck for STUCK_RESET s: a reset.
  unstick(p) {
    if (p.resetCd > 0) p.resetCd = Math.max(0, p.resetCd - DT);
    if (p.resetReq) { p.resetReq = 0; if (this.resetCar(p, false)) return; }
    const c = p.car;
    if (p.finished || p.dummy || c.airT > 0) { p.wallT = 0; p.noProgT = 0; p.stuck = 0; p.bestProg = -Infinity; return; }
    const wedged = c.wall || this.tickN - p.bumpN <= 1;
    if (wedged && p.inp.th > 0 && Math.hypot(c.vx, c.vy) < STUCK_SPEED) p.wallT += DT; else { p.wallT = 0; p.nudged = false; }
    if (!this.mode.arena) {
      const pr = this.progress(p);
      if (pr > p.bestProg + 40) { p.bestProg = pr; p.noProgT = 0; } else p.noProgT += DT;
    }
    p.stuck = Math.max(p.wallT, p.noProgT);
    if (p.stuck >= STUCK_RESET - 1e-9) this.resetCar(p, true);
    else if (p.wallT >= STUCK_NUDGE - 1e-9 && !p.nudged) this.nudge(p);
  }
  clearStuck(p) { p.wallT = 0; p.noProgT = 0; p.stuck = 0; p.nudged = false; p.bestProg = -Infinity; }
  // the racing line point (and track direction) nearest the car on its corridor
  lineNear(p) {
    const T = this.T, c = p.car;
    if (T.kind === 'arena') { const x = (T.box.x0 + T.box.x1) / 2, y = (T.box.y0 + T.box.y1) / 2; return { x, y, a: Math.atan2(y - c.y, x - c.x) }; }
    const cor = T.corridors[c.pc >= 0 ? c.pc : 0], i = pointAt(cor, c.pc >= 0 ? c.ps : nearestS(cor, c.x, c.y)).i;
    return { x: cor.line.x[i], y: cor.line.y[i], a: Math.atan2(cor.ty[i], cor.tx[i]) };
  }
  // pinned against a wall: slide the car toward the racing line, point it along the track, roll it
  nudge(p) {
    const c = p.car, L = this.lineNear(p), x0 = c.x, y0 = c.y;
    const dx = L.x - c.x, dy = L.y - c.y, d = Math.hypot(dx, dy), k = d > 1 ? Math.min(1, NUDGE_DIST / d) : 0;
    c.x += dx * k; c.y += dy * k; c.a = L.a;
    c.vx = Math.cos(L.a) * NUDGE_SPEED; c.vy = Math.sin(L.a) * NUDGE_SPEED;
    c.drift = 0; c.dc = 0; c.dg = 0;
    stepCar(c, IDLE, p.st, this.T, 0); // settle (and push out of anything we landed on)
    this.crossGates(p, x0, y0, c.x, c.y);
    p.nudged = true; p.wallT = 0; p.nudges++; p.ep++; p.ai = null;
    this.events.push({ k: 'nudge', id: p.id });
  }
  // RESET (the button, or stuck STUCK_RESET s): back on the racing line at the car's progress
  // (never behind its last checkpoint), facing along the track, stopped, ghosted for a second
  resetCar(p, auto) {
    if (!p.alive || p.out || p.finished || p.dummy || this.time <= 0 || p.car.airT > 0) return false;
    if (!auto && p.resetCd > 0) return false;
    const spot = this.mode.arena ? this.arenaSpot(p) : this.resetSpot(p);
    p.car = newCar(spot.x, spot.y, spot.a);
    stepCar(p.car, IDLE, p.st, this.T, 0);
    p.ghostT = Math.max(p.ghostT, RESET_GHOST); p.resetCd = RESET_COOLDOWN; p.resets++; p.ep++; p.ai = null;
    this.clearStuck(p);
    this.events.push({ k: 'reset', id: p.id, auto: auto ? 1 : 0 });
    return true;
  }
  resetSpot(p) {
    const T = this.T, main = T.corridors[0], G = T.gates, N = G.length, L = T.L, P = {};
    const a = G[p.cp].s, span = (p.cp + 1 < N ? G[p.cp + 1].s : L) - a;
    const u = Math.max(0, Math.min(span, this.progress(p) - (p.lap - 1) * L - a));
    const s0 = a + (span > 160 ? Math.max(70, Math.min(span - 90, u)) : span / 2);
    for (const ds of [0, 90, 180, 270, -60]) {
      const s = s0 + ds, i = pointAt(main, s).i, hw = hwAt(main, s);
      for (const d of [main.line.d[i], 0, -0.4 * hw, 0.4 * hw]) {
        const pt = pointAt(main, s, d);
        T.probe(pt.x, pt.y, CAR_R, P);
        if (P.pen > 0 || P.c !== 0 || SURF[P.surf]?.fall || SURF[P.surf]?.dmg || P.ramp) continue;
        if (T.hazards.some((h) => Math.hypot(pt.x - h.x, pt.y - h.y) < h.r + CAR_R * 2)) continue;
        return pt;
      }
    }
    return this.respawnSpot(p);
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
    // ELIMINATION tie-break (who is cut when two racers are level): distance to the pixel, then the
    // racer who was behind on the previous tick, then the later grid slot (higher id) is behind
    else if (this.modeKey === 'elim') list.sort((a, b) => (a.out - b.out) || (b.out && a.out ? a.place - b.place : 0)
      || (Math.round(b.prog) - Math.round(a.prog)) || ((a.rank || 0) - (b.rank || 0)) || a.id - b.id);
    else list.sort((a, b) => (a.out - b.out) || (b.out && a.out ? a.place - b.place : 0)
      || (b.finished - a.finished) || (a.finished ? a.place - b.place : b.prog - a.prog) || a.id - b.id);
    list.forEach((p, i) => { p.rank = i + 1; });
    this.order = list;
    // BOUNTY: the leader glows on everyone's map; wrecking them steals their match coins
    const lead = list[0];
    this.leaderId = lead && !lead.out && !lead.finished && this.time > 0 && !this.mode.tutorial && (!this.mode.arena || lead.kills > 0) ? lead.id : 0;
  }

  modeTick() {
    if (this.time <= 0) return;
    const active = [...this.players.values()].filter((p) => !p.out);
    if (this.modeKey === 'elim') {
      this.elimTick();
      if (this.racers() <= 1 || this.humans().every((p) => p.left)) return this.finish();
    } else if (this.modeKey === 'battle') {
      if (this.time >= this.mode.time) return this.finish();
    } else if (this.mode.tutorial) {
      // over when the steps are done, the clock runs out or the player is gone
      if (this.humans().every((p) => p.tut >= TUT_STEPS.length - 1 || p.left) || this.time >= this.mode.time) return this.finish();
    } else {
      const running = active.filter((p) => !p.finished && !p.left);
      // everyone still racing is a bot: wrap up quickly
      if (this.finishAt != null && !running.some((p) => !p.wasBot)) this.finishAt = Math.min(this.finishAt, this.time + 5);
      if (!running.length || (this.finishAt != null && this.time >= this.finishAt) || this.time >= RACE_CAP) return this.finish();
    }
  }
  // ELIMINATION, once a tick after GO. Order inside a tick (deterministic, see PROTOCOL.md):
  // 1) racers who quit for good with bots off are out (worst first), 2) the black hole moves and
  // swallows (worst first, never the last racer), 3) the cut takes last place, 4) the timer shrinks
  // to the interval for the field that is left, 5) the racer in danger and the final duel.
  elimTick() {
    const H = ELIM.hole;
    const live = () => this.order.filter((p) => !p.out);
    if (!this.fillBots) for (const p of live().reverse()) if (p.left && this.racers() > 1) this.eliminate(p, 'left');
    if (!this.bhOff && this.bh != null) {
      const L = live(), last = L[L.length - 1];
      this.bh += this.holeSpeed() * DT;
      if (last && last.prog - this.bh > H.leash) this.bh = last.prog - H.leash; // never far behind the pack
      // (live() is in race order, so a tie in distance goes to the racer ranked lower: see rank())
      const eat = L.filter((p) => p.prog - this.bh < H.reach).reverse();
      for (const p of eat) { if (this.racers() <= 1) break; this.eliminate(p, 'hole'); }
    }
    if (this.time >= this.elimNext - 1e-9 && this.racers() > 1) {
      this.eliminate(live().pop(), 'cut');
      this.cuts++;
      this.cutIv = elimInterval(this.racers());
      this.elimNext += this.cutIv;
      this.cutN = this.racers();
    }
    // the hole (or a quitter) took racers: the running timer is never longer than the field's interval
    if (this.racers() < this.cutN) {
      const iv = elimInterval(this.racers());
      if (this.elimNext - this.time > iv) { this.elimNext = this.time + iv; this.cutIv = iv; }
      this.cutN = this.racers();
    }
    this.rank();
    const L = live();
    this.dangerId = L.length > 1 ? L[L.length - 1].id : 0;
    if (L.length === 2 && !this.duel) { this.duel = true; this.events.push(['duel', L[0].id, L[1].id]); }
  }
  holeSpeed() { const H = ELIM.hole; return Math.min(H.max, H.base + H.step * this.cuts) * Math.min(1, Math.max(0, this.time) / H.ramp); }
  // cause: 'cut' (last place when the timer ran out), 'hole' (the black hole), 'left' (quit, bots off)
  eliminate(p, cause = 'cut') {
    if (!p || p.out) return;
    p.out = true;
    p.place = [...this.players.values()].filter((q) => !q.out).length + 1;
    p.alive = false; p.outAt = r3(Math.max(0, this.time)); p.outBy = cause;
    this.outCount++;
    // x, y: where the car was (it leaves the snapshots now), for the cut / swallow effect
    this.events.push(['elim', p.id, p.place, cause, Math.round(p.car.x), Math.round(p.car.y)]);
  }
  // TAKEDOWN BOOST (Elimination): knocking a car out or hitting the racer in danger
  burst(by, why) {
    if (this.modeKey !== 'elim' || !by || !by.alive || by.out) return;
    addBoost(by.car, ELIM.burst); by.bursts++;
    this.events.push(['burst', by.id, why]);
  }

  // ------------------------------------------------------------------ combat
  // o: { big (spin-out + explosion), spin (s of spin-out on a big hit) }. A rival's hit (src set, not
  // yourself) starts COMBAT.protect s of protection: no rival can damage or spin you until it runs out.
  damage(t, src, amount, kind, ground = false, o = null) {
    if (!t.alive || t.out || t.finished || t.ghostT > 0) return false;
    if (ground && t.car.airT > 0) return false;
    const rival = !!src && src !== t;
    if (rival && t.protT > 0) return false;
    // a shield takes one hit (not the lava you sit in)
    if (t.shieldT > 0 && kind !== 'lava') { this.popShield(t); return false; }
    t.hp -= amount;
    if (rival) { t.lastHit = { id: src.id, at: this.time }; t.protT = COMBAT.protect; }
    if (rival && t.hp > 0 && t.id === this.dangerId) this.burst(src, 'danger');
    const big = !!(o && o.big);
    if (kind !== 'lava') this.events.push(['hit', t.id, src ? src.id : 0, kind, Math.round(amount), big ? 1 : 0]);
    if (t.hp <= 0) this.destroy(t, src, kind);
    else if (big && kind !== 'lava') { t.car.spinT = Math.max(t.car.spinT, (o && o.spin) || COMBAT.bigSpin); t.car.spinDir = this.rand() < 0.5 ? -1 : 1; t.car.drift = 0; t.car.dc = 0; }
    return true;
  }
  popShield(t) {
    t.shieldN = (t.shieldN || 1) - 1;
    if (t.shieldN <= 0) { t.shieldT = 0; t.shieldN = 0; }
    this.events.push(['shield', t.id]);
  }
  // a spin-out from a rival's trap (oil): blocked by a shield or the hit protection; starts protection
  spinHit(q, owner, spin) {
    const rival = !!owner && owner !== q;
    if (rival && q.protT > 0) return false;
    if (q.shieldT > 0) { this.popShield(q); return 'shield'; }
    q.car.spinT = Math.max(q.car.spinT, spin); q.car.spinDir = this.rand() < 0.5 ? -1 : 1; q.car.drift = 0; q.car.dc = 0;
    if (rival) { q.lastHit = { id: owner.id, at: this.time }; q.protT = COMBAT.protect; }
    if (rival && q.id === this.dangerId) this.burst(owner, 'danger');
    this.events.push(['spin', q.id, owner ? owner.id : 0]);
    return true;
  }
  destroy(p, src, cause) {
    if (!p.alive || p.out) return;
    p.alive = false;
    p.hp = 0;
    p.deaths++;
    p.respawnTick = this.tickN + RESPAWN_TICKS;
    p.car.vx = p.car.vy = 0; p.car.drift = 0; p.car.dc = 0; p.car.boostT = 0; p.car.airT = 0; p.car.spinT = 0;
    p.phaseT = 0; p.ghostT = 0; p.shieldT = 0; p.shieldN = 0;
    let by = src && src !== p ? src : null;
    if (!by && p.lastHit && this.time - p.lastHit.at <= CREDIT_WINDOW) by = this.players.get(p.lastHit.id) || null;
    if (by && by !== p) {
      by.kills++;
      by.mc += COINS.takedown;
      this.burst(by, 'ko');
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
    if (p.dummy) { p.alive = true; p.hp = p.maxHp; p.ep++; this.parkDummy(); this.events.push(['rs', p.id]); return; }
    // (Elimination: back where you crashed, on the racing line: the black hole is behind you, and a
    // trip back to the last checkpoint would hand you to it)
    const spot = this.mode.arena ? this.arenaSpot(p) : this.modeKey === 'elim' ? this.resetSpot(p) : this.respawnSpot(p);
    p.car = newCar(spot.x, spot.y, spot.a);
    stepCar(p.car, { st: 0, th: 0, dr: 0 }, p.st, T, 0);
    p.alive = true; p.hp = p.maxHp; p.ghostT = GHOST_TIME; p.protT = 0; p.phaseT = 0; p.ep++;
    p.ai = null;
    this.clearStuck(p);
    this.events.push(['rs', p.id]);
  }
  // arena: the spawn farthest from everyone else
  arenaSpot(p) {
    let best = -1, spot = this.T.grid[0];
    for (const g of this.T.grid) {
      let near = Infinity;
      for (const q of this.players.values()) if (q !== p && q.alive && !q.out) near = Math.min(near, Math.hypot(q.car.x - g.x, q.car.y - g.y));
      if (near > best) { best = near; spot = g; }
    }
    return spot;
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
    if (!this.mode.weapons || p.wcd > 0 || p.empT > 0 || p.finished || p.phaseT > 0) return;
    const W = WEAPONS[p.driver], c = p.car, hx = Math.cos(c.a), hy = Math.sin(c.a);
    p.wcd = W.cd; p.fired = true;
    // COUNTER: firing your weapon swats a Hunter Drone that is chasing you, when it is close
    for (const e of this.ents) if (e.kind === 'drone' && e.target === p.id && !e.dead && Math.hypot(e.x - c.x, e.y - c.y) < e.st.swat) {
      e.dead = true; this.events.push(['swat', p.id, e.id], ['boom', Math.round(e.x), Math.round(e.y), e.k]);
    }
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

  // the racer a homing item locks on to: the one k places ahead (race modes), else the nearest in front
  aimAt(p, k = 1) {
    const c = p.car;
    let tgt = !this.mode.arena && p.rank > k ? this.order[p.rank - 1 - k] : null;
    if (tgt && (!tgt.alive || tgt.out || tgt.finished || tgt.ghostT > 0)) tgt = null;
    if (!tgt) {
      let bd = 2200;
      for (const q of this.enemies(p)) {
        const d = Math.hypot(q.car.x - c.x, q.car.y - c.y);
        if (d < bd && Math.abs(angDiff(c.a, Math.atan2(q.car.y - c.y, q.car.x - c.x))) < 1.2) { bd = d; tgt = q; }
      }
    }
    return tgt;
  }
  useItem(p) {
    if (!p.item || p.empT > 0 || p.finished || p.phaseT > 0) return;
    const it = p.item, lv = Math.max(1, p.il || 1), I = itemStat(it, lv), c = p.car, hx = Math.cos(c.a), hy = Math.sin(c.a);
    p.item = null; p.il = 0;
    this.events.push(['use', p.id, ITEM_IDS.indexOf(it), lv]);
    switch (it) {
      case 'missile': {
        // locks on to the racer one place ahead (level 3: a second one at the racer two ahead)
        for (let k = 0; k < I.n; k++) {
          const tgt = (k && this.aimAt(p, 2)) || this.aimAt(p, 1);
          const a = c.a + (I.n > 1 ? (k ? 0.18 : -0.18) : 0);
          const e = this.addEnt('missile', p, c.x + hx * 34, c.y + hy * 34, a, { life: I.life, target: tgt ? tgt.id : 0, speed: I.speed, st: I, lv });
          if (tgt) this.events.push(['lock', tgt.id, p.id, e.id, 'missile']);
        }
        break;
      }
      case 'rockets':
        for (let k = 0; k < I.n; k++) {
          const a = c.a + (k - (I.n - 1) / 2) * I.spread;
          this.addEnt('rocket', p, c.x + hx * 30, c.y + hy * 30, a, { life: I.life, speed: I.speed + Math.max(0, c.vx * hx + c.vy * hy), st: I, lv });
        }
        break;
      case 'oil': this.placeTrap('oil', p, c.x - hx * 56, c.y - hy * 56, c.a, { life: I.life, st: I, lv }); break;
      case 'spikes': this.placeTrap('spikes', p, c.x - hx * 60, c.y - hy * 60, c.a + Math.PI / 2, { life: I.life, hits: I.hits, seen: [], st: I, lv }); break;
      case 'shield': p.shieldT = I.t; p.shieldN = I.hits; break;
      case 'turbo': addBoost(c, I); break;
      case 'emp':
        this.events.push(['emp', p.id, lv]);
        for (const q of this.players.values()) {
          if (q === p || !q.alive || q.out || q.finished || Math.hypot(q.car.x - c.x, q.car.y - c.y) > I.r) continue;
          // COUNTER to Ghost Mode: the blast knocks a ghost back into the real world
          if (q.phaseT > 0) { q.phaseT = 0; q.ghostT = 0; this.events.push(['unghost', q.id]); }
          if (q.ghostT > 0) continue;
          if (q.shieldT > 0) { this.popShield(q); continue; }
          q.empT = Math.max(q.empT, I.t);
          q.car.slowT = Math.max(q.car.slowT, I.slow);
          q.car.boostT = 0; // COUNTER to Turbo: the blast cuts a boost
        }
        break;
      case 'lightning': {
        // the nearest racer in reach, then jumps to the nearest racer not yet hit near the last one
        const hit = [], R = this.enemies(p);
        let from = c, reach = I.range, dmg = I.dmg;
        for (let k = 0; k < I.jumps; k++) {
          let best = null, bd = reach;
          for (const q of R) { if (hit.includes(q)) continue; const d = Math.hypot(q.car.x - from.x, q.car.y - from.y); if (d < bd) { bd = d; best = q; } }
          if (!best) break;
          hit.push(best);
          if (this.damage(best, p, dmg, 'chain') && best.alive) best.car.slowT = Math.max(best.car.slowT, I.slow);
          from = best.car; reach = I.chain; dmg *= I.fall;
        }
        this.events.push(['chain', p.id, ...hit.map((q) => q.id)]);
        break;
      }
      case 'gravity': {
        // lobbed onto the nearest racer in reach (ahead or behind), else a short way ahead
        let tgt = null, d = I.reach;
        for (const q of this.enemies(p)) { const dq = Math.hypot(q.car.x - c.x, q.car.y - c.y); if (dq < d) { d = dq; tgt = q; } }
        const far = tgt && d < I.reach ? d + 60 : I.throwT * I.throwV, a = tgt && d < I.reach ? Math.atan2(tgt.car.y - c.y, tgt.car.x - c.x) : c.a;
        this.addEnt('well', p, c.x, c.y, a, { life: I.throwT + I.life + 0.1, end: I.throwT + I.life, v: far / I.throwT, st: I, lv });
        break;
      }
      case 'ghost': p.phaseT = I.t; p.ghostT = Math.max(p.ghostT, I.t); break;
      case 'sticky': this.addEnt('sticky', p, c.x + hx * 34, c.y + hy * 34, c.a, { life: 60, mode: 'fly', carrier: 0, fuse: I.fuse, passCd: 0, from: p.id, speed: I.speed + Math.max(0, c.vx * hx + c.vy * hy) * 0.5, st: I, lv }); break;
      case 'drone': {
        const tgt = this.aimAt(p, 1);
        const e = this.addEnt('drone', p, c.x - hx * 20, c.y - hy * 20, c.a, { life: I.life, target: tgt ? tgt.id : 0, strikes: I.strikes, cool: 0.4, st: I, lv });
        if (tgt) this.events.push(['lock', tgt.id, p.id, e.id, 'drone']);
        break;
      }
    }
  }
  // oil or spikes. COMBO: dropped onto the other kind, the two merge into one bigger trap
  placeTrap(kind, p, x, y, a, o) {
    const other = kind === 'oil' ? 'spikes' : 'oil', I = o.st;
    const reach = kind === 'oil' ? I.r + ITEMS.spikes.half * 0.7 : I.half * 0.7 + ITEMS.oil.r;
    const hit = this.ents.find((e) => e.kind === other && !e.dead && Math.hypot(e.x - x, e.y - y) < reach);
    if (!hit) return this.addEnt(kind, p, x, y, a, o);
    hit.dead = true;
    const oil = kind === 'oil' ? I : hit.st, lv = Math.max(o.lv, hit.lv || 1), mx = (x + hit.x) / 2, my = (y + hit.y) / 2;
    p.combos++;
    this.events.push(['combo', p.id, 'trap', Math.round(mx), Math.round(my)]);
    return this.addEnt('trap', p, mx, my, a, { life: COMBAT.trapLife, r: oil.r * COMBAT.trapR, hits: COMBAT.trapHits + lv - 1, seen: [], lv, arm: 0.3 });
  }

  addEnt(kind, owner, x, y, a, o) {
    const e = { id: this.nextEnt++, kind, k: ENT.indexOf(kind), owner: owner.id, x, y, a, t: 0, lv: 1, ...o };
    this.ents.push(e);
    return e;
  }

  updateEnts() {
    const keep = [];
    for (const e of this.ents) {
      e.t += DT;
      if (e.t >= e.life || e.dead) continue;
      if (this.updateEnt(e) && !e.dead) keep.push(e);
    }
    this.ents = keep;
  }
  // returns false when the entity is used up
  updateEnt(e) {
    const owner = this.players.get(e.owner);
    const others = (ground) => [...this.players.values()].filter((q) => q.alive && !q.out && !q.finished && q.ghostT <= 0 && (!ground || q.car.airT <= 0));
    switch (e.kind) {
      case 'missile': {
        const I = e.st || ITEMS.missile, tgt = this.players.get(e.target);
        if (tgt && tgt.alive && !tgt.out && !tgt.finished && tgt.ghostT <= 0) {
          e.a += Math.max(-I.turn * DT, Math.min(I.turn * DT, angDiff(e.a, Math.atan2(tgt.car.y - e.y, tgt.car.x - e.x))));
          // COUNTER: DRIFT pressed with the missile inside its dodge range shakes the lock
          if (Math.hypot(tgt.car.x - e.x, tgt.car.y - e.y) < (I.dodgeR || 330) && this.time - tgt.drAt <= COMBAT.dodgeWin && tgt.car.airT <= 0) {
            e.ignore = tgt.id; e.target = 0; tgt.dodges++;
            this.events.push(['dodge', tgt.id, e.id]);
          }
        }
        e.x += Math.cos(e.a) * e.speed * DT; e.y += Math.sin(e.a) * e.speed * DT;
        for (const q of others(false)) {
          if ((q.id === e.owner && e.t < 1) || q.id === e.ignore) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < CAR_R + 18) {
            this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]);
            // COMBO: an EMP-ed racer takes extra missile damage
            const emp = q.empT > 0 && q.id !== e.owner;
            if (this.damage(q, owner, I.dmg * (emp ? COMBAT.empMissile : 1), 'missile', false, { big: I.spin > 0, spin: I.spin }) && emp) {
              if (owner) owner.combos++;
              this.events.push(['combo', e.owner, 'emp', q.id]);
            }
            return false;
          }
        }
        return true;
      }
      case 'rocket': case 'bolt': {
        const dmg = e.kind === 'rocket' ? (e.st || ITEMS.rockets).dmg : WEAPONS.rook.dmg;
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
      case 'oil': {
        const I = e.st || ITEMS.oil;
        if (e.t < (I.arm || 0)) return true; // arming: flashes, harmless
        for (const q of others(true)) {
          if (q.id === e.owner && e.t < 1.2) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < I.r + CAR_R * 0.6) {
            if (q.id !== e.owner && q.protT > 0) continue; // protected: rolls over it, the slick stays
            this.spinHit(q, owner, I.spin);
            return false;
          }
        }
        return true;
      }
      case 'spikes': {
        const I = e.st || ITEMS.spikes;
        if (e.t < (I.arm || 0)) return true;
        const hx = Math.cos(e.a) * I.half, hy = Math.sin(e.a) * I.half;
        for (const q of others(true)) {
          if ((q.id === e.owner && e.t < 1.2) || e.seen.includes(q.id)) continue;
          if (distToSeg(q.car.x, q.car.y, e.x - hx, e.y - hy, e.x + hx, e.y + hy) < CAR_R + 8) {
            e.seen.push(q.id);
            if (this.damage(q, owner, I.dmg, 'spikes', true) && q.alive) q.car.slowT = Math.max(q.car.slowT, I.slow);
            if (--e.hits <= 0) return false;
          }
        }
        return true;
      }
      case 'trap': { // COMBO oil + spikes: spins, hurts and slows everyone who drives in, a few times
        if (e.t < e.arm) return true;
        for (const q of others(true)) {
          if ((q.id === e.owner && e.t < 1.2) || e.seen.includes(q.id)) continue;
          if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < e.r + CAR_R * 0.6) {
            if (q.id !== e.owner && q.protT > 0) continue;
            e.seen.push(q.id);
            if (this.damage(q, owner, COMBAT.trapDmg, 'trap', true, { big: true, spin: COMBAT.trapSpin }) && q.alive) q.car.slowT = Math.max(q.car.slowT, COMBAT.trapSlow);
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
            if (q.protT > 0) continue; // protected: drives over it, the mine stays
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
      case 'well': { // thrown ahead, then pulls grounded racers toward its centre
        const I = e.st;
        if (e.t < I.throwT) { e.x += Math.cos(e.a) * e.v * DT; e.y += Math.sin(e.a) * e.v * DT; return true; }
        const end = e.t >= e.end;
        for (const q of others(true)) {
          if (q.id === e.owner) continue;
          const dx = e.x - q.car.x, dy = e.y - q.car.y, d = Math.hypot(dx, dy);
          if (d > I.r || d < 1) continue;
          if (end && I.crush && d < I.r * 0.45) this.damage(q, owner, I.crush, 'crush', true, { big: true });
          const k = I.pull * (0.4 + 0.6 * (1 - d / I.r)) * DT, drag = Math.exp(-I.drag * DT); // pulled in and held
          q.car.vx = q.car.vx * drag + (dx / d) * k; q.car.vy = q.car.vy * drag + (dy / d) * k;
        }
        if (end) { this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]); return false; }
        return true;
      }
      case 'sticky': return this.updateSticky(e, owner, others);
      case 'drone': {
        const I = e.st;
        let tgt = this.players.get(e.target);
        if (!tgt || !tgt.alive || tgt.out || tgt.finished || tgt.ghostT > 0) {
          tgt = null;
          if (owner) { let bd = 1400; for (const q of this.enemies(owner)) { const d = Math.hypot(q.car.x - e.x, q.car.y - e.y); if (d < bd) { bd = d; tgt = q; } } }
          if (tgt && tgt.id !== e.target) { e.target = tgt.id; this.events.push(['lock', tgt.id, e.owner, e.id, 'drone']); }
        }
        if (tgt) e.a += Math.max(-I.turn * DT, Math.min(I.turn * DT, angDiff(e.a, Math.atan2(tgt.car.y - e.y, tgt.car.x - e.x))));
        e.x += Math.cos(e.a) * I.speed * DT; e.y += Math.sin(e.a) * I.speed * DT;
        if (e.cool > 0) { e.cool -= DT; return true; }
        if (tgt && Math.hypot(tgt.car.x - e.x, tgt.car.y - e.y) < CAR_R + 16) {
          this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]);
          if (this.damage(tgt, owner, I.dmg, 'drone') && tgt.alive) tgt.car.slowT = Math.max(tgt.car.slowT, I.slow);
          if (--e.strikes <= 0) return false;
          e.cool = COMBAT.protect + 0.1; // strikes again once the protection is over
        }
        return true;
      }
    }
    return false;
  }
  // STICKY BOMB: flies ahead and sticks to the first racer it touches (or lies on the road and sticks to
  // the next one over it). Stuck, it rides on that car and passes on to any racer the carrier touches;
  // when the fuse runs out it blows up on whoever carries it. Ghost Mode shakes it off.
  updateSticky(e, owner, others) {
    const I = e.st;
    if (e.mode !== 'stuck') {
      if (e.mode === 'fly') {
        if (e.t >= I.fly) { e.mode = 'ground'; e.t0 = e.t; }
        else {
          // a light homing toward the nearest racer in front
          let best = null, bd = 600;
          for (const q of others(false)) { if (q.id === e.owner) continue; const d = Math.hypot(q.car.x - e.x, q.car.y - e.y); if (d < bd && Math.abs(angDiff(e.a, Math.atan2(q.car.y - e.y, q.car.x - e.x))) < 0.9) { bd = d; best = q; } }
          if (best) e.a += Math.max(-2.4 * DT, Math.min(2.4 * DT, angDiff(e.a, Math.atan2(best.car.y - e.y, best.car.x - e.x))));
          const nx = e.x + Math.cos(e.a) * e.speed * DT, ny = e.y + Math.sin(e.a) * e.speed * DT;
          if (this.T.inside(nx, ny, 0)) { e.x = nx; e.y = ny; } else { e.mode = 'ground'; e.t0 = e.t; }
        }
      } else if (e.t - e.t0 > I.ground) { this.events.push(['fizzle', e.id, 0]); return false; }
      const armed = e.mode === 'fly' ? e.t > 0.25 : e.t - e.t0 > 0.5;
      if (!armed) return true;
      for (const q of others(e.mode === 'ground')) {
        if (q.id === e.owner && e.mode === 'fly') continue;
        if (Math.hypot(q.car.x - e.x, q.car.y - e.y) < CAR_R + 14) {
          e.mode = 'stuck'; e.carrier = q.id; e.fuse = I.fuse; e.passCd = I.pass;
          this.events.push(['stick', q.id, e.owner, e.id]);
          break;
        }
      }
      return true;
    }
    const cq = this.players.get(e.carrier);
    if (!cq || !cq.alive || cq.out || cq.finished) { this.events.push(['fizzle', e.id, e.carrier]); return false; }
    if (cq.phaseT > 0) { this.events.push(['fizzle', e.id, cq.id]); return false; } // COUNTER: Ghost Mode shakes it off
    e.x = cq.car.x; e.y = cq.car.y; e.a = cq.car.a;
    e.fuse -= DT; e.passCd -= DT;
    if (e.passCd <= 0) {
      for (const q of others(false)) {
        if (q === cq || (q.car.airT > 0) !== (cq.car.airT > 0)) continue;
        if (Math.hypot(q.car.x - cq.car.x, q.car.y - cq.car.y) < CAR_R * 2 + 10) {
          e.from = cq.id; e.carrier = q.id; e.passCd = I.pass;
          this.events.push(['pass', cq.id, q.id, e.id]);
          return true;
        }
      }
    }
    if (e.fuse > 0) return true;
    // BOOM: the carrier takes the blast; levels 2-3 splash the racers near them for half
    const by = this.players.get(e.from) || owner || null;
    this.events.push(['boom', Math.round(e.x), Math.round(e.y), e.k]);
    this.damage(cq, by, I.dmg, 'sticky', false, { big: true, spin: I.spin });
    if (I.splash) for (const q of others(false)) {
      if (q === cq || q === by || Math.hypot(q.car.x - e.x, q.car.y - e.y) > I.splash) continue;
      this.damage(q, by, I.dmg * 0.5, 'sticky');
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
        // empty slot: a new item. Holding one: the same item again levels it up (up to 3), else nothing
        // (itemFor(p): a test hook that fixes what a racer gets: an item id, null = nothing, undefined = the roll)
        let got = -1, up = 0;
        const f = this.itemFor ? this.itemFor(p) : undefined;
        const r = f !== undefined ? f : rollItem(p.rank || 1, this.racers(), this.rand(), !!this.mode.arena, p.item);
        if (r && !p.item) { p.item = r; p.il = 1; got = 1; } else if (r && r === p.item && p.il < MAX_LEVEL) { p.il++; got = up = 1; }
        this.events.push(['box', p.id, k, got > 0 ? ITEM_IDS.indexOf(p.item) : -1, got > 0 ? p.il : 0, up]);
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
        const ax = a.car.x, ay = a.car.y, bx = b.car.x, by = b.car.y;
        const imp = collideCars(a.car, b.car, a.st.mass, b.st.mass);
        a.bumpN = b.bumpN = this.tickN; // (wedged against a car counts as stuck)
        // a shove can push a car over a checkpoint line: count it (else that car's lap and progress stall)
        this.crossGates(a, ax, ay, a.car.x, a.car.y); this.crossGates(b, bx, by, b.car.x, b.car.y);
        if (imp > 250) this.events.push(['bump', a.id, b.id, Math.round(imp)]);
      }
    }
  }

  // ------------------------------------------------------------------ tutorial
  // the target car: parked across the back straight, stopped
  parkDummy() {
    const main = this.T.corridors[0], pt = pointAt(main, this.T.def.tut.dummy * this.T.L, 0), d = this.dummy;
    d.car = newCar(pt.x, pt.y, pt.a);
    stepCar(d.car, IDLE, d.st, this.T, 0);
    d.ghostT = 0;
  }
  // steps in order (TUT_STEPS): steer through the cones, drift (a spark tier charged), grab an item,
  // fire the weapon; each one done sends {k:'tut', id, step}, then 'done' and the run ends
  tutorialStep(p) {
    if (p.tut >= TUT_STEPS.length - 1) return;
    const c = p.car, tut = this.T.def.tut;
    let ok = false;
    switch (TUT_STEPS[p.tut]) {
      case 'steer': ok = p.alive && c.pc === 0 && c.x > tut.cones[1] && c.x < tut.drift[0] + 300 && c.y < 1000 && p.lap >= 1; break;
      case 'drift': ok = driftTier(c.dc) >= 1; break;
      case 'item': ok = !!p.item; break;
      case 'fire': ok = p.fired; break;
    }
    p.fired = false;
    if (!ok) return;
    this.events.push({ k: 'tut', id: p.id, step: TUT_STEPS[p.tut] });
    p.tut++;
    if (p.tut === TUT_STEPS.length - 1) this.events.push({ k: 'tut', id: p.id, step: 'done' });
  }

  // ------------------------------------------------------------------ snapshots
  flags(p) {
    const c = p.car, fwd = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    return (c.drift ? FLAG.DRIFT : 0) | (c.boostT > 0 ? FLAG.BOOST : 0) | (c.airT > 0 ? FLAG.AIR : 0) | (p.shieldT > 0 ? FLAG.SHIELD : 0)
      | (this.leaderId === p.id ? FLAG.LEADER : 0) | (!p.alive ? FLAG.DEAD : 0) | (c.spinT > 0 ? FLAG.SPIN : 0) | (p.empT > 0 ? FLAG.EMP : 0)
      | (p.finished ? FLAG.FINISHED : 0) | (p.out ? FLAG.OUT : 0) | (p.ghostT > 0 ? FLAG.GHOST : 0) | (c.slowT > 0 ? FLAG.SLOW : 0)
      | (driftTier(c.dc) << 12) | (fwd < -20 ? FLAG.REVERSE : 0) | (p.inp && p.inp.th < 0 && fwd > 40 && p.alive ? FLAG.BRAKE : 0)
      | (p.protT > 0 ? FLAG.PROT : 0) | (p.phaseT > 0 ? FLAG.PHASE : 0);
  }
  hud() {
    if (this.modeKey === 'grand' || this.modeKey === 'trial') return { laps: this.laps, ft: this.finishAt != null ? r2(Math.max(0, this.finishAt - this.time)) : null };
    // elim: nx s to the cut, iv the timer's length, dg the racer in danger, bh the black hole (race px),
    // bv its speed, duel 1 = the final two
    if (this.modeKey === 'elim') return { nx: r2(Math.max(0, this.elimNext - this.time)), left: this.racers(), iv: this.cutIv, dg: this.dangerId, bh: this.bh == null ? null : Math.round(this.bh), bv: Math.round(this.holeSpeed()), duel: this.duel ? 1 : 0 };
    if (this.mode.tutorial) { const h = this.humans()[0]; return { tut: TUT_STEPS[h ? h.tut : 0], tl: r2(Math.max(0, this.mode.time - this.time)) }; }
    return { tl: r2(Math.max(0, this.mode.time - this.time)) };
  }
  snapshots() {
    const cars = [];
    for (const p of this.players.values()) {
      if (p.out) continue;
      const c = p.car;
      cars.push([p.id, Math.round(c.x), Math.round(c.y), Math.round(c.a * 1000), this.flags(p), Math.round((100 * Math.max(0, p.hp)) / p.maxHp), p.lap, Math.round(Math.hypot(c.vx, c.vy)), r1(p.stuck)]);
    }
    // [id, kind, x, y, a, owner, armed, level, target]: target = who a missile / drone is locked on to,
    // or who carries a sticky bomb (0 = none)
    const ents = this.ents.map((e) => [e.id, e.k, Math.round(e.x), Math.round(e.y), Math.round(e.a * 1000), e.owner, this.armed(e) ? 1 : 0, e.lv || 1, e.kind === 'sticky' ? e.carrier : e.target || 0]);
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
  armed(e) {
    switch (e.kind) {
      case 'mine': case 'trap': return e.t >= e.arm;
      case 'oil': case 'spikes': return e.t >= (e.st?.arm || 0);
      case 'well': return e.t >= e.st.throwT;
      case 'sticky': return e.mode === 'stuck';
    }
    return false;
  }
  meMsg(p) {
    return {
      s: packState(p.car), ack: p.lastSeq, ep: p.ep, hp: Math.max(0, Math.round(p.hp)), mh: p.maxHp,
      it: p.item ? ITEM_IDS.indexOf(p.item) : -1, il: p.item ? p.il || 1 : 0, pr: r2(p.protT), ph: r2(p.phaseT), wc: r2(p.wcd), sh: r2(p.shieldT), em: r2(p.empT), gh: r2(p.ghostT),
      lap: p.lap, cp: p.cp, rk: p.rank, rt: p.alive ? 0 : r2(Math.max(0, (p.respawnTick - this.tickN) * DT)),
      mc: p.mc, k: p.kills, d: p.deaths, lt: p.maxLap >= 1 && !p.finished ? r2(this.time - p.lapStart) : 0, bl: p.bestLap,
      fin: p.place && p.finished ? p.place : 0, out: p.out ? p.place : 0, auto: p.finished ? 1 : 0,
      stuck: r1(p.stuck), rcd: r2(p.resetCd),
      // elim: bg = your lead on the black hole (px; the warning and the dark edges come from it)
      ...(this.modeKey === 'elim' && this.bh != null && !p.out ? { bg: Math.round(p.prog - this.bh) } : {}),
    };
  }

  // ------------------------------------------------------------------ end
  resultRow(p, rank) {
    return {
      p, rank, players: this.players.size, mode: this.modeKey, track: this.trackKey, kills: p.kills, steals: p.steals, mc: p.mc,
      time: p.finishTime, bestLap: p.bestLap, finished: !!p.finished, driver: p.driver, tut: p.tut >= TUT_STEPS.length - 1 ? 1 : 0,
      // elim: seconds survived (to the knock-out, or the whole race for the winner)
      ...(this.modeKey === 'elim' ? { surv: r1(p.out ? p.outAt : Math.max(0, this.time)) } : {}),
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
      this.send(p.id, { t: 'end', mode: this.modeKey, track: this.trackKey, rank: p.rank, you: p.id, results, n: this.players.size, time: p.finishTime, bestLap: p.bestLap, mc: p.mc, k: p.kills, ...(this.mode.tutorial ? { tut: p.tut >= TUT_STEPS.length - 1 ? 1 : 0 } : {}) });
    }
  }
}
