// Server-authoritative simulation shared by Quick Hunt arenas and Free Play zones.
// Pure JS (no Workers APIs) so it runs in Node tests. Durable Objects own the sockets and
// call tick() at 20 Hz.
import {
  BRAWLERS, BRAWLER_IDS, DT, TILE, MAX_PLAYERS, EMPTY, WALL, BUSH, CRATE,
  CRATE_HP, SUPPLY_HP, CUBE_HP, CUBE_DMG, REGEN_DELAY, REGEN_RATE, POISON_DPS, BUSH_REVEAL_DIST,
  CLOAK_REVEAL_DIST, SPAWNS, BOT_NAMES, EVENT_EVERY, EVENT_WARN, LOW_HP, RUSH_TIME, COMEBACK_DMG,
  applyMove, moveCircle, inBush, attackDirs, poisonInset, moveStats, bountyGlow, pingInterval,
  layLowFactor, rng, inHub, HUB, MINE_SEEN, PLAYER_R, touchingBorder, SPIKE_DMG, SPIKE_CD, lineOfSight, isSolidTile, tileAt, blocksMove,
  dayNight, visionRange, onHigh, HIGH_REVEAL, own,
} from '../public/shared.js';
import { EVENTS, pickEvent } from '../public/events/index.js';
import { MODES } from './modes.js';
import { powerMult, clampPower, GADGETS, STARS, gadgetOf, starOf, GADGET_USES } from '../public/power.js';
import { botInput, levelForTrophies } from './bots.js';
import { WEAPONS, WEAPON_IDS, withPerks, shotAngles, stepShot, SWAP_TIME, MAX_SHOTS_PER_SEC, AIM_ASSIST, LAG_COMP_TICKS, WKIND, weaponIndex, STARTER_WEAPONS, CLASS_FX } from '../public/weapons.js';

const r2 = (v) => Math.round(v * 100) / 100;
const W2C = new Map(); // weapon + perks -> stats (memo)
export const clearWeaponCache = () => W2C.clear(); // (the balance tuner edits WEAPONS live)
// your own state: only the fields that changed since the last snapshot (full every 2s)
function meDelta(me, v, full) {
  const last = v.meSent || (v.meSent = {});
  if (full) { for (const k in me) last[k] = Array.isArray(me[k]) ? me[k].join(',') : me[k]; return me; }
  let out = null;
  for (const k in me) {
    const val = me[k], key = val !== null && typeof val === 'object' ? val.join(',') : val;
    if (last[k] !== key) { last[k] = key; (out ||= {})[k] = val; }
  }
  return out || {};
}
const ne = (a) => (a.length ? a : undefined); // empty lists are left out of snapshots (less to send and to encode)
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
// interest management: how far around a viewer the server sends things (half-extents, px)
export const VIEW_X = 1500, VIEW_Y = 1100, RADAR_RANGE = 2600;
export const HEARTBEAT_DIST = 330; // a hidden enemy this close makes your heart pound
export const ROOM_IDLE_SECS = 300; // a friend room whose host never presses START starts by itself after 5 minutes
export const IDLE_SECS = 30; // input gaps longer than this are idle time (it doesn't count for match pay)
export const newId = () => 1 + Math.floor(Math.random() * 2 ** 30);

// fields carried across a zone handoff
const CARRY = ['id', 'name', 'brawler', 'x', 'y', 'mvx', 'mvy', 'hp', 'maxHp', 'cubes', 'ammo', 'reloadP', 'atkCd', 'superC',
  'lastCombat', 'stun', 'cloak', 'reveal', 'facing', 'lastSeq', 'kills', 'bounty', 'bountyEarned', 'bestBounty', 'bushT',
  'rush', 'rushArmed', 'spawnProt', 'score', 'crystals', 'sessionKills', 'pingT', 'slowT', 'tp', 'cos', 'equipped', 'account', 'secret', 'spikeCd', 'burst', 'w2', 'slot', 'assists', 'steals', 'wstat', 'pset', 'gUses', 'lowHealUsed', 'lo', 'emotes', 'wmast'];

export class Sim {
  constructor(o) {
    this.map = o.map;
    this.send = o.send || (() => {});
    this.modeKey = own(MODES, o.mode) ? o.mode : 'showdown';
    this.mode = MODES[this.modeKey];
    this.maxPlayers = this.mode.maxPlayers || MAX_PLAYERS;
    this.teamPot = { 1: 0, 2: 0 };
    this.hooks = o.hooks || {};
    this.zone = o.zone || null;
    this.hub = o.hub ? HUB : null;
    const W = this.map.gw * TILE, H = this.map.gh * TILE;
    this.bounds = o.bounds || { x0: 0, y0: 0, x1: W, y1: H };
    this.center = { x: (this.bounds.x0 + this.bounds.x1) / 2, y: (this.bounds.y0 + this.bounds.y1) / 2 };
    this.fillBots = o.fillBots ?? true;
    this.botTarget = o.botTarget ?? MAX_PLAYERS;
    this.lobbyTime = o.lobbyTime ?? 8;
    this.eventsOn = o.events !== false;
    this.forceEvent = own(EVENTS, o.forceEvent) ? o.forceEvent : null; // test flag: always run this event, starting at 8s
    this.seed = o.seed ?? 0;
    this.rand = rng((o.seed ?? Date.now()) ^ 0x5bd1e995);

    this.players = new Map();
    this.observers = new Map(); // key -> {x, y}
    this.bullets = [];
    this.bnew = []; // projectiles fired this tick (sent once as events)
    this.bdead = []; // [id, x, y] projectiles that ended this tick
    this.flares = []; // Flare Gun reveals {x, y, r, t}
    this.cubes = [];
    this.crystals = [];
    this.wdrops = []; // Free Play: weapons dropped by broken crates {id, x, y, w, rare, t}
    this.mines = [];
    this.delayed = []; // timed effects (sand-worm eruptions)
    this.wallsToRestore = []; // Shifting Walls tiles that were occupied when the event ended
    this.crates = new Map(); // idx -> {hp, supply}
    for (const idx of this.tilesInBounds(CRATE, false)) this.crates.set(idx, { hp: CRATE_HP });
    this.tileDirty = [];
    this.crateDirty = [];
    this.fx = [];
    this.pings = [];
    this.pingLog = []; // last tick's public radar pings (bots may use them, like humans)
    this.botLevel = o.botLevel || 'normal';
    this.feed = [];
    this.nextEnt = 1;
    this.phase = o.phase || 'lobby';
    this.clock = 0;
    this.lobbyEnd = null;
    this.time = 0;
    this.tickN = 0;
    this.zoneInset = 0;
    this.event = null; // {id, ph:'warn'|'on', t, params}
    this.lastEvent = null;
    this.nextEventAt = this.forceEvent ? 8 : EVENT_EVERY;
    this.mods = {};
    this.botSpawnT = 0;
    // Free Play day/night runs on the wall clock (shared by every zone); tests can pass `now`
    this.now = o.now || (() => Date.now());
    this.dn = this.hub ? dayNight(this.now()) : null;
    this.brokenCrates = new Map(); // Free Play: idx -> time broken (they come back)
    this.mode.init?.(this);
  }

  // ---------------------------------------------------------------- helpers
  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  aliveCount() { let n = 0; for (const p of this.players.values()) if (p.alive) n++; return n; }
  inBounds(x, y, m = 0) { const b = this.bounds; return x >= b.x0 - m && y >= b.y0 - m && x < b.x1 + m && y < b.y1 + m; }
  inBoundsIdx(idx) { return this.inBounds((idx % this.map.gw) * TILE + 1, Math.floor(idx / this.map.gw) * TILE + 1); }
  isSafe(x, y) { return !!this.hub && inHub(x, y); }
  areaScale(n) { const b = this.bounds; return Math.max(1, Math.round(n * ((b.x1 - b.x0) * (b.y1 - b.y0)) / 4e6)); }
  tilesInBounds(type, interior = true) {
    const out = [], gw = this.map.gw, b = this.bounds;
    const tx0 = Math.floor(b.x0 / TILE), ty0 = Math.floor(b.y0 / TILE), tx1 = Math.floor(b.x1 / TILE), ty1 = Math.floor(b.y1 / TILE);
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (interior && (x <= 0 || y <= 0 || x >= gw - 1 || y >= this.map.gh - 1)) continue;
      // never the spiked border walls, nor the tile band on a Free Play zone edge (the neighbour zone shares it)
      if (interior && (x === tx0 || y === ty0 || x === tx1 - 1 || y === ty1 - 1)) continue;
      const idx = y * gw + x;
      if (interior && this.map.border && this.map.border[idx]) continue;
      if (this.map.t[idx] === type && !(interior && this.isSafe(x * TILE + 25, y * TILE + 25))) out.push(idx);
    }
    return out;
  }
  tileOccupied(idx) {
    const x = (idx % this.map.gw) * TILE + TILE / 2, y = Math.floor(idx / this.map.gw) * TILE + TILE / 2;
    for (const p of this.players.values()) if (p.alive && Math.abs(p.x - x) < 60 && Math.abs(p.y - y) < 60) return true;
    return this.isSafe(x, y);
  }
  setTile(idx, type) {
    if (this.map.t[idx] === type) return;
    if (this.map.t[idx] === CRATE) this.crates.delete(idx);
    this.map.t[idx] = type;
    this.tileDirty.push([idx, type]);
  }
  addCrate(idx, supply = false) {
    this.setTile(idx, CRATE);
    this.crates.set(idx, { hp: supply ? SUPPLY_HP : CRATE_HP, supply });
    this.crateDirty.push([idx, supply ? -SUPPLY_HP : CRATE_HP]);
  }
  randomPoint(margin = 80) {
    const b = this.bounds;
    for (let i = 0; i < 40; i++) {
      const x = b.x0 + margin + this.rand() * (b.x1 - b.x0 - margin * 2), y = b.y0 + margin + this.rand() * (b.y1 - b.y0 - margin * 2);
      const t = this.map.t[Math.floor(y / TILE) * this.map.gw + Math.floor(x / TILE)];
      if (t === EMPTY || t === BUSH) return { x, y };
    }
    return { ...this.center };
  }
  dmgMult(p) { return (1 + CUBE_DMG * p.cubes) * (p.hp / p.maxHp < LOW_HP ? COMEBACK_DMG : 1) * powerMult(p.power); }
  stats(p) { return moveStats(p.brawler, p.hp, p.maxHp, p.rush, p.slowT, p.star ? p.star.fx.speed || 1 : 1); }
  baseHp(p) { return Math.round(BRAWLERS[p.brawler].hp * powerMult(p.power)); }
  // BRAWLER POWER: level (HP + damage), gadget and star power for the brawler being played
  applyPower(p, resetUses = false) {
    const s = (p.pset && p.pset[p.brawler]) || null;
    const oldGadget = p.gadget;
    p.power = s ? clampPower(s.power) : clampPower(p.power || 1);
    p.gadget = s ? gadgetOf(p.brawler, s.gadget) : p.gadget && GADGETS[p.brawler]?.includes(p.gadget) ? p.gadget : null;
    p.star = s ? starOf(p.brawler, s.star) : p.star && STARS[p.brawler]?.includes(p.star) ? p.star : null;
    if (resetUses || p.gadget !== oldGadget || p.gUses == null) p.gUses = p.gadget ? GADGET_USES : 0;
    const f = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = this.baseHp(p) + p.cubes * CUBE_HP;
    p.hp = Math.max(1, Math.round(p.maxHp * Math.min(1, f)));
  }
  enemies(a, b) { return a !== b && (!a.team || a.team !== b.team); }

  // ---------------------------------------------------------------- players
  addPlayer({ name, brawler, bot = false, state = null, connected = !bot }) {
    const b = own(BRAWLERS, brawler) ? brawler : 'volt';
    const p = {
      id: newId(), name, brawler: b, bot, wasBot: bot, connected,
      x: this.center.x, y: this.center.y, mvx: 0, mvy: 0, px: 0, py: 0, vx: 0, vy: 0,
      hp: BRAWLERS[b].hp, maxHp: BRAWLERS[b].hp, cubes: 0, alive: true,
      ammo: 3, reloadP: 0, atkCd: 0, burst: null, superC: 0, lastCombat: -99, stun: 0, dash: null, knock: null,
      cloak: 0, reveal: 0, poisonT: 0.5, facing: 0, queue: [], credits: 2, lastSeq: 0, kills: 0, rank: 0, ai: null,
      bounty: 0, bountyEarned: 0, bestBounty: 0, bushT: 0, lowF: 0, rush: 0, rushArmed: true, pingT: 0,
      spawnProt: 0, respawnT: 0, score: 0, crystals: 0, sessionKills: 0, hazAcc: 0, lastHitBy: 0,
      slowT: 0, cageT: 0, tp: 0, team: 0,
      // combat upgrade: secondary weapon (w2) + active slot (0 = signature), swap timer, lag
      // compensation rewind (ticks), position history, hit markers, assists, steals, per-weapon stats
      w2: null, slot: 0, swapT: 0, rw: 0, hx: new Float32Array(8), hy: new Float32Array(8), hm: 0,
      assists: 0, steals: 0, wstat: {}, shotLog: [], poison: null, flareT: 0, emotes: [0, 1],
    };
    if (state) for (const k of CARRY) if (state[k] !== undefined) p[k] = state[k];
    p.brawler = b; // (carried state can't bring in an unknown brawler either)
    while (this.players.has(p.id)) p.id = newId();
    p.hx.fill(p.x); p.hy.fill(p.y);
    this.players.set(p.id, p);
    this.broadcast({ t: 'ro', add: { [p.id]: this.rosterRow(p) } });
    return p;
  }

  rosterRow(p) { return [p.name, p.brawler, p.wasBot ? 1 : 0, p.cos || null]; }
  // give a player a secondary weapon (armory pick, a bot's random pick, or a Free Play drop)
  setWeapon(p, id, perks = []) {
    if (!own(WEAPONS, id)) { p.w2 = null; p.slot = 0; return; }
    const w = withPerks(id, perks);
    p.w2 = { id, perks, ammo: w.ammo, reloadP: 0, cd: 0, lastFire: -99 };
    if (p.slot === 1) p.swapT = 0;
  }
  // ACCOUNT LOADOUT (already validated against the account by progression.loadoutFor)
  setLoadout(id, lo) {
    const p = this.players.get(id);
    if (!p || !lo || (p.devLo && !lo.dev)) return; // (a local-dev loadout isn't overwritten by the account)
    if (lo.dev) p.devLo = true;
    p.emotes = Array.isArray(lo.emotes) ? lo.emotes : [0, 1];
    p.wmast = lo.mastery | 0;
    p.lo = lo; // kept so a respawn gives your armory weapon back after a Free Play pick-up
    if (lo.power) { p.pset = lo.power; this.applyPower(p, this.phase !== 'play' || !!this.hub); }
    if (lo.w2 && own(WEAPONS, lo.w2) && !(p.w2 && p.w2.dropped)) this.setWeapon(p, lo.w2, lo.perks || []);
    p.cos = { ...(p.cos || {}), badge: lo.badge || null, wskin: lo.badge || null };
    this.broadcast({ t: 'ro', add: { [p.id]: this.rosterRow(p) } });
  }
  w2def(p) {
    if (!p.w2) return null;
    const key = p.w2.id + '|' + (p.w2.perks || []).join(',');
    let w = W2C.get(key);
    if (!w) { w = withPerks(p.w2.id, p.w2.perks || []); W2C.set(key, w); }
    return w;
  }
  // cosmetics: drawn by clients only. Never read by the simulation.
  setCosmetics(id, equipped) {
    const p = this.players.get(id);
    if (!p) return;
    p.equipped = equipped || {};
    p.cos = { ...(p.cos || {}), skin: p.equipped['skin:' + p.brawler] || null, fx: p.equipped.fx || null, title: p.equipped.title || null };
    this.broadcast({ t: 'ro', add: { [p.id]: this.rosterRow(p) } });
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.broadcast({ t: 'ro', del: [id] });
    if (this.targetId === id) this.targetId = 0;
  }

  exportPlayer(p) {
    const s = {};
    for (const k of CARRY) s[k] = p[k];
    // zones run on their own clocks: carry "seconds since last combat", not this zone's timestamp
    s.lastCombat = p.lastCombat - this.time;
    if (p.dash) s.dash = { vx: p.dash.vx, vy: p.dash.vy, t: p.dash.t };
    if (p.knock) s.knock = { ...p.knock };
    return s;
  }
  importPlayer(state, name, connected) {
    const p = this.addPlayer({ name: state.name || name, brawler: state.brawler, state, connected });
    if (typeof state.lastCombat === 'number') p.lastCombat = this.time + state.lastCombat;
    if (p.pset) { const hp = p.hp, mh = p.maxHp; this.applyPower(p); p.hp = hp; p.maxHp = mh; }
    if (state.dash) p.dash = { ...state.dash, hit: new Set() };
    if (state.knock) p.knock = { ...state.knock };
    return p;
  }

  rosterMsg() {
    const add = {};
    for (const p of this.players.values()) add[p.id] = this.rosterRow(p);
    return { t: 'ro', add, full: 1, zone: this.zone };
  }
  stateMsg() {
    const td = [];
    for (let i = 0; i < this.map.t.length; i++) if (this.map.t[i] !== this.map.base[i] && this.inBoundsIdx(i)) td.push([i, this.map.t[i]]);
    const ch = [...this.crates].map(([i, c]) => [i, c.supply ? -c.hp : c.hp]);
    return { t: 'st', zone: this.zone, mode: this.modeKey, td, ch, ev: this.event ? this.evMsg() : null };
  }
  evMsg() { const e = this.event; return { t: 'ev', zone: this.zone, id: e.id, ph: e.ph, tl: r2(e.t), p: e.params }; }

  broadcast(msg) {
    for (const p of this.players.values()) if (p.connected) this.send(p.id, msg);
    for (const k of this.observers.keys()) this.send(k, msg);
  }

  // ---------------------------------------------------------------- arena lobby
  join(name, brawler) {
    if (this.phase !== 'lobby' || this.players.size >= this.maxPlayers) return null;
    const p = this.addPlayer({ name, brawler, bot: false });
    if (this.mode.teams) p.team = this.smallerTeam();
    this.lobbyEnd = this.lobbyEnd == null ? this.clock + this.lobbyTime : Math.max(this.lobbyEnd, this.clock + 4);
    if (this.humans().length >= this.maxPlayers) this.lobbyEnd = this.clock;
    this.broadcastLobby();
    return p.id;
  }

  smallerTeam() {
    let a = 0, b = 0;
    for (const p of this.players.values()) { if (p.team === 1) a++; else if (p.team === 2) b++; }
    return a <= b ? 1 : 2;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || this.mode.hub) { this.removePlayer(id); if (this.phase === 'lobby') this.broadcastLobby(); return; }
    p.connected = false;
    // a bot takes over a disconnected player until they reconnect, unless bots are switched off
    if (this.fillBots) p.bot = true;
    else p.queue.length = 0;
  }

  // a human's leave became final mid-match (quit, or never came back): their result counts now,
  // as a loss, and the bot that keeps their slot earns nothing for their account
  abandon(id) {
    const p = this.players.get(id);
    if (!p || p.wasBot || p.left) return null;
    p.left = true; p.secret = null;
    if (this.phase !== 'play') return null;
    return { p, rank: !p.alive && p.rank ? p.rank : this.players.size, players: this.players.size, won: this.mode.teams ? false : undefined, assists: p.assists, steals: p.steals, wstat: p.wstat, secs: this.secsOf(p) };
  }

  // a dropped player reconnected (same match): hand control back
  rejoin(id) {
    const p = this.players.get(id);
    if (!p) return null;
    p.connected = true;
    p.sentStatic = null; p.meSent = null; // a new socket knows nothing yet: resend everything
    p.bot = p.wasBot;
    p.queue.length = 0;
    p.ai = null;
    return p;
  }

  broadcastLobby() {
    const msg = {
      t: 'lobby', mode: this.modeKey, world: this.map.world,
      players: this.humans().map((p) => [p.name, p.brawler]),
      startIn: this.lobbyEnd == null || !this.canStart() ? null : Math.max(0, this.lobbyEnd - this.clock), bots: this.fillBots,
    };
    for (const p of this.players.values()) if (p.connected) this.send(p.id, msg);
  }

  // with "fill empty slots with bots" OFF, a match needs two humans: never add bots to fill it
  canStart() { return this.humans().length >= (this.fillBots ? 1 : 2); }

  start() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    const target = this.fillBots ? this.maxPlayers : 0;
    while (this.players.size < target) {
      const b = this.addPlayer({ name: names.pop() || 'Bot', brawler: BRAWLER_IDS[Math.floor(Math.random() * BRAWLER_IDS.length)], bot: true });
      if (this.mode.teams) b.team = this.smallerTeam();
      this.setWeapon(b, WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)]); // bots carry a random secondary
    }
    // bots play at the humans' average power, so a match stays fair at every level
    const humansNow = this.humans(), avg = humansNow.length ? Math.round(humansNow.reduce((t, h) => t + (h.power || 1), 0) / humansNow.length) : 1;
    for (const b of this.players.values()) {
      if (!b.wasBot) continue;
      const pick = (list) => list[Math.floor(Math.random() * list.length)].id;
      b.pset = { [b.brawler]: { power: avg, gadget: avg >= 7 ? pick(GADGETS[b.brawler]) : null, star: avg >= 9 ? pick(STARS[b.brawler]) : null } };
      this.applyPower(b, true); b.hp = b.maxHp;
    }
    for (const p of humansNow) if (p.gadget) p.gUses = GADGET_USES; // 3 gadget uses per match
    // teams spawn on opposite sides of the ring; FFA spawns are shuffled
    const SP = this.map.spawns || SPAWNS;
    const spawns = SP.slice().sort(() => Math.random() - 0.5);
    const sideA = SP.filter((s) => s.x < this.center.x), sideB = SP.filter((s) => s.x >= this.center.x);
    let i = 0, ia = 0, ib = 0;
    for (const p of this.players.values()) {
      const s = !this.mode.teams ? spawns[i++ % spawns.length] : p.team === 1 ? sideA[ia++ % sideA.length] : sideB[ib++ % sideB.length];
      p.x = p.px = s.x; p.y = p.py = s.y;
      p.facing = Math.atan2(this.center.y - s.y, this.center.x - s.x);
    }
    this.mode.onStart?.(this);
    this.phase = 'play';
    this.time = 0;
    // bot difficulty follows the humans' trophies (guests/new players get easy bots)
    const hs = this.humans();
    if (hs.length) this.botLevel = levelForTrophies(hs.reduce((s, h) => s + (h.trophies || 0), 0) / hs.length);
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.send(p.id, { t: 'start', botLevel: this.botLevel, you: p.id, mode: this.modeKey, world: this.map.world, seed: this.seed, open: !!this.map.open, players: this.map.players || 10 });
      this.send(p.id, this.rosterMsg());
    }
  }

  canSee(viewer, t) {
    if (viewer === t) return true;
    if (viewer.team && viewer.team === t.team) return true; // teammates are always visible
    if (viewer.alive === false) return true;
    const dist = Math.hypot(viewer.x - t.x, viewer.y - t.y);
    if (this.mods.vision && dist > this.mods.vision) return false;
    // darkness: caves, marsh fog and night shrink vision, but at night a high bounty glows and
    // can be spotted from further away (high-bounty hunters are easier to hunt after dark)
    // (vision range + high ground depend only on the viewer: computed once per viewer per tick)
    let vc = viewer._vc;
    if (!vc || vc.n !== this.tickN || vc.x !== viewer.x || vc.y !== viewer.y || vc.dn !== this.dn) {
      vc = viewer._vc = { n: this.tickN, x: viewer.x, y: viewer.y, dn: this.dn, vr: visionRange(this.map, viewer.x, viewer.y, this.dn), high: !viewer.observer && onHigh(this.map, viewer.x, viewer.y) };
    }
    const vr = vc.vr;
    if (dist > vr && !(this.dn && this.dn.dark > 0 && t.bounty >= 3 && dist < Math.max(vr, 2000))) return false;
    // observer sockets (Free Play border views) send their own position, so it can't be trusted:
    // they never get the "close enough to reveal" exception for bushes, cloak or armed mines
    const d = viewer.observer ? Infinity : dist;
    if (t.flareT > 0) return true; // lit up by a flare
    if (t.cloak > 0 && d > CLOAK_REVEAL_DIST) return false;
    const bushReveal = BUSH_REVEAL_DIST * (vc.high ? HIGH_REVEAL : 1); // high ground sees into bushes
    if (t.reveal <= 0 && d > bushReveal && inBush(this.map, t.x, t.y)) return false;
    return true;
  }

  setTarget(p) {
    this.targetId = p.id;
    this.fx.push(['target', Math.round(p.x), Math.round(p.y), 0, p.id]);
  }

  // ---------------------------------------------------------------- combat
  // anti-cheat + performance: at most MAX_SHOTS_PER_SEC trigger pulls a second
  shotAllowed(p) {
    const t = this.time, log = p.shotLog;
    while (log.length && t - log[0] >= 1) log.shift();
    if (log.length >= MAX_SHOTS_PER_SEC) return false;
    log.push(t); return true;
  }
  // AIM ASSIST (humans only, never snipers): nudge the shot toward an enemy within 6 degrees of the
  // aim line, as the shooter saw them. Half way there: it helps, it never locks on.
  assist(p, ang, range) {
    if (p.bot) return ang;
    let best = null, bd = AIM_ASSIST;
    for (const e of this.players.values()) {
      if (!this.enemies(p, e) || !e.alive || !this.canSee(p, e)) continue;
      const [ex, ey] = this.posAt(e, p.rw);
      const d = Math.hypot(ex - p.x, ey - p.y);
      if (d > range * 1.1 || d < 1) continue;
      const da = Math.abs(angDiff(Math.atan2(ey - p.y, ex - p.x), ang));
      if (da < bd && lineOfSight(this.map, p.x, p.y, ex, ey)) { bd = da; best = Math.atan2(ey - p.y, ex - p.x); }
    }
    return best == null ? ang : ang + angDiff(best, ang) * 0.5;
  }

  tryAttack(p, ang, fd = 1, seq = 0) {
    const B = BRAWLERS[p.brawler], a = B.attack;
    if (!p.alive || p.ammo < 1 || p.atkCd > 0 || p.stun > 0 || p.burst || p.dash || p.swapT > 0 || this.isSafe(p.x, p.y)) return;
    if (!this.shotAllowed(p)) return;
    if (p.brawler !== 'wisp' && a.kind !== 'mine') ang = this.assist(p, ang, a.range);
    p.ammo -= 1;
    p.atkCd = a.cooldown;
    p.reveal = 0.8;
    p.cloak = 0;
    p.spawnProt = 0;
    p.facing = ang;
    this.spawnShot(p, ang, fd);
    if (a.kind === 'burst' || a.kind === 'slash') p.burst = { left: a.count - 1, t: a.interval, ang };
  }

  spawnShot(p, ang, fd = 1) {
    const a = BRAWLERS[p.brawler].attack;
    const dmg = a.damage * this.dmgMult(p);
    if (a.kind === 'slash') return this.slash(p, ang, dmg);
    const sp = a.speed * (this.mods.bulletSpeed || 1), range = a.range * (this.mods.bulletRange || 1);
    for (const d of attackDirs(p.brawler, ang)) {
      const c = Math.cos(d), s = Math.sin(d);
      this.addShot({
        owner: p.id, oname: p.name, ozone: this.zone, kind: BRAWLER_IDS.indexOf(p.brawler),
        x: p.x + c * 16, y: p.y + s * 16, vx: c * sp, vy: s * sp, dist: 0, range, dmg, r: a.radius, team: p.team, rw: p.rw,
        ...(a.kind === 'wave' ? { pierce: true, hit: [], slow: a.slowTime } : {}),
        ...(a.kind === 'mine' ? { mine: true, range: Math.max(80, range * Math.max(0, Math.min(1, fd))) } : {}),
      });
    }
  }

  // every projectile goes through here: clients get ONE "fired from x,y with velocity v at tick n"
  // event and simulate it themselves (no per-tick bullet positions on the wire)
  addShot(b) {
    b.id = this.nextEnt++;
    b.t0 = this.tickN;
    b.ev = [r2(b.x), r2(b.y), r2(b.vx), r2(b.vy), b.fuse || 0]; // exact spawn state for the clients
    this.bullets.push(b);
    this.bnew.push(b);
    return b;
  }

  // ---------------------------------------------------------------- secondary weapons
  tryWeapon(p, ang, inp, seq = 0) {
    const w = this.w2def(p), st = p.w2;
    if (!p.alive || !w || st.ammo < 1 || st.cd > 0 || p.stun > 0 || p.dash || p.swapT > 0 || this.isSafe(p.x, p.y)) return;
    if (!this.shotAllowed(p)) return;
    if (w.cls !== 'sniper' && w.kind !== 'melee') ang = this.assist(p, ang, w.range);
    st.ammo -= 1; st.cd = w.cooldown;
    const held = Math.min(w.charge || 0, inp ? inp.ch : 0, this.time - st.lastFire); // charge can't exceed time since the last shot
    st.lastFire = this.time;
    p.reveal = 0.8; p.cloak = 0; p.spawnProt = 0; p.facing = ang;
    const mult = this.dmgMult(p), wi = WKIND + weaponIndex(st.id);
    if (w.kind === 'melee') return this.weaponMelee(p, w, ang, mult);
    let sp = (w.speed || 1000) * (this.mods.bulletSpeed || 1);
    const range = w.range * (this.mods.bulletRange || 1);
    // grenades land where you aim: the throw speed is set so the roll stops at aim distance
    if (w.kind === 'grenade') sp = range * Math.max(0.15, Math.min(1, inp && inp.fd != null ? inp.fd : 1)) * (1 - 0.93) / DT;
    const fire = (k) => {
      for (const a of shotAngles(w, ang, seq * 7 + k)) {
        const c = Math.cos(a), s = Math.sin(a);
        let dmg = w.damage * mult, crit = 0;
        if (w.kind === 'charge') { const f = Math.min(1, held / w.charge); dmg = (w.damage + (w.maxDamage - w.damage) * f) * mult; crit = f >= 0.95 ? 1 : 0; }
        this.addShot({
          owner: p.id, oname: p.name, ozone: this.zone, kind: wi, wid: st.id, x: p.x + c * 16, y: p.y + s * 16, vx: c * sp, vy: s * sp, dist: 0, range, dmg, crit,
          r: w.radius || 8, team: p.team, rw: p.rw, x0: p.x, y0: p.y,
          ...(w.pierce ? { pierce: w.pierce, hit: [] } : {}), ...(w.slow ? { slow: w.slow } : {}), ...(w.poison ? { poison: w.poison } : {}),
          ...(w.chain ? { chain: w.chain } : {}), ...(w.flare ? { flare: w.flare } : {}), ...(w.crit === 'close' ? { close: 1 } : {}),
          ...(w.kind === 'grenade' ? { bounce: 1, fuse: w.fuse, blast: w.blast, range: 1e9 } : {}),
          ...(w.kind === 'rocket' ? { rocket: 1, blast: w.blast, splash: w.splash * mult } : {}),
        });
      }
    };
    fire(0);
    if (w.burst > 1) p.wburst = { left: w.burst - 1, t: w.interval, ang, fire, k: 1 };
  }

  // melee: an instant arc, checked against where enemies were on the attacker's screen
  weaponMelee(p, w, ang, mult) {
    this.fx.push(['swing', Math.round(p.x), Math.round(p.y), r2(ang), p.id, WKIND + weaponIndex(p.w2.id)]);
    if (w.lunge) p.knock = { vx: Math.cos(ang) * w.lunge / 0.12, vy: Math.sin(ang) * w.lunge / 0.12, t: 0.12 };
    for (const e of this.players.values()) {
      if (!this.enemies(p, e) || !e.alive) continue;
      const [ex, ey] = this.posAt(e, p.rw);
      const dx = ex - p.x, dy = ey - p.y, d = Math.hypot(dx, dy);
      if (d > w.range + this.stats(e).r) continue;
      const dir = Math.atan2(dy, dx);
      if (Math.abs(angDiff(dir, ang)) > w.arc / 2 + 0.15) continue;
      if (!lineOfSight(this.map, p.x, p.y, ex, ey)) continue;
      const behind = w.crit === 'behind' && Math.abs(angDiff(e.facing, dir)) < Math.PI / 3; // they're facing away
      this.fx.push(['hit', Math.round(ex), Math.round(ey), WKIND + weaponIndex(p.w2.id), e.id]);
      this.damage(p, e, w.damage * mult * (behind ? 1.3 : 1), true, 'poison', { wid: p.w2.id, crit: behind });
    }
    const cx = p.x + Math.cos(ang) * Math.min(w.range * 0.6, 90), cy = p.y + Math.sin(ang) * Math.min(w.range * 0.6, 90);
    const idx = Math.floor(cy / TILE) * this.map.gw + Math.floor(cx / TILE);
    if (this.map.t[idx] === CRATE) this.hitCrate(idx, w.damage * mult);
  }

  // where a player was `rw` ticks ago (lag compensation)
  posAt(e, rw) {
    if (!rw || !e.hx) return [e.x, e.y];
    const i = (this.tickN - rw) & 7;
    return [e.hx[i], e.hy[i]];
  }

  // explosions (grenades, rockets): everything in the blast, crates too
  explode(b, x, y) {
    this.fx.push(['boom', Math.round(x), Math.round(y), b.blast, b.owner]);
    const src = this.players.get(b.owner) || (b.ozone && b.ozone !== this.zone ? { remote: true, id: b.owner, name: b.oname, zone: b.ozone } : null);
    const dmg = b.rocket ? b.splash : b.dmg;
    for (const e of this.players.values()) {
      if (!e.alive || (b.team && e.team === b.team && e.id !== b.owner) || e.id === b.owner) continue;
      if (Math.hypot(e.x - x, e.y - y) < b.blast + this.stats(e).r && lineOfSight(this.map, x, y, e.x, e.y)) this.damage(src, e, dmg, true, 'poison', { wid: b.wid });
    }
    const r = Math.ceil(b.blast / TILE);
    for (let ty = Math.floor(y / TILE) - r; ty <= Math.floor(y / TILE) + r; ty++) for (let tx = Math.floor(x / TILE) - r; tx <= Math.floor(x / TILE) + r; tx++) {
      const idx = ty * this.map.gw + tx;
      if (tx >= 0 && ty >= 0 && tx < this.map.gw && ty < this.map.gh && this.map.t[idx] === CRATE && Math.hypot(tx * TILE + 25 - x, ty * TILE + 25 - y) < b.blast + 25) this.hitCrate(idx, dmg);
    }
  }

  // Flicker: melee arc, hits everything in front (players + one crate)
  slash(p, ang, dmg) {
    const a = BRAWLERS[p.brawler].attack;
    this.fx.push(['slash', Math.round(p.x), Math.round(p.y), r2(ang), p.id]);
    for (const e of this.players.values()) {
      if (!this.enemies(p, e) || !e.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > a.range + this.stats(e).r) continue;
      let da = Math.atan2(dy, dx) - ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > a.arc / 2 + 0.2) continue;
      if (!lineOfSight(this.map, p.x, p.y, e.x, e.y)) continue;
      this.fx.push(['hit', Math.round(e.x), Math.round(e.y), BRAWLER_IDS.indexOf(p.brawler), e.id]);
      this.damage(p, e, dmg, true);
    }
    const cx = p.x + Math.cos(ang) * 70, cy = p.y + Math.sin(ang) * 70;
    const idx = Math.floor(cy / TILE) * this.map.gw + Math.floor(cx / TILE);
    if (this.map.t[idx] === CRATE) this.hitCrate(idx, dmg);
  }

  nearestEnemy(p, range) {
    let best = null, bd = range;
    for (const e of this.players.values()) {
      if (!this.enemies(p, e) || !e.alive || e.spawnProt > 0 || this.isSafe(e.x, e.y) || !this.canSee(p, e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  trySuper(p, ang) {
    if (!p.alive || p.superC < 1 || p.stun > 0 || p.dash || this.isSafe(p.x, p.y)) return;
    const s = BRAWLERS[p.brawler].super;
    if (s.kind === 'blink' && !this.nearestEnemy(p, s.range)) return; // nothing to blink to: no charge spent, protection kept
    p.superC = 0;
    p.reveal = 0.8;
    p.spawnProt = 0;
    const mult = this.dmgMult(p);
    if (s.kind === 'dash') {
      p.cloak = 0; p.facing = ang; p.burst = null;
      const sp = s.dist / s.time;
      p.dash = { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: s.time, hit: new Set() };
      this.fx.push(['dash', r2(p.x), r2(p.y), r2(ang), p.id]);
    } else if (s.kind === 'slam') {
      p.cloak = 0;
      this.fx.push(['slam', r2(p.x), r2(p.y), s.radius, p.id]);
      for (const e of this.players.values()) {
        if (!this.enemies(p, e) || !e.alive || e.spawnProt > 0 || this.isSafe(e.x, e.y)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= s.radius + this.stats(e).r) {
          e.stun = Math.max(e.stun, s.stun); e.dash = null; e.burst = null;
          this.damage(p, e, s.damage * mult, false);
        }
      }
    } else if (s.kind === 'cloak') {
      p.cloak = s.time; p.reveal = 0;
      this.fx.push(['cloak', r2(p.x), r2(p.y), 0, p.id]);
    } else if (s.kind === 'worm') {
      // aim decides direction; lock on to the nearest visible enemy roughly in that direction
      let best = null, bd = Infinity;
      for (const e of this.players.values()) {
        if (!this.enemies(p, e) || !e.alive || !this.canSee(p, e) || this.isSafe(e.x, e.y)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        let da = Math.abs(Math.atan2(e.y - p.y, e.x - p.x) - ang); if (da > Math.PI) da = Math.PI * 2 - da;
        if (d < s.range && da < 0.8 && d + da * 300 < bd) { bd = d + da * 300; best = e; }
      }
      const tx = best ? best.x : p.x + Math.cos(ang) * s.range * 0.6, ty = best ? best.y : p.y + Math.sin(ang) * s.range * 0.6;
      this.delayed.push({ kind: 'worm', x: tx, y: ty, t: s.delay, owner: p.id, dmg: s.damage * mult, r: s.radius, stun: s.stun });
      this.fx.push(['wormwarn', Math.round(tx), Math.round(ty), s.radius, p.id]);
    } else if (s.kind === 'cage') {
      const c = Math.cos(ang), sn = Math.sin(ang);
      this.addShot({ owner: p.id, oname: p.name, ozone: this.zone, kind: 20, x: p.x + c * 16, y: p.y + sn * 16,
        vx: c * s.speed, vy: sn * s.speed, dist: 0, range: s.range, dmg: s.damage * mult, r: s.radius, cage: s.time, team: p.team });
    } else if (s.kind === 'blink') {
      const e = this.nearestEnemy(p, s.range);
      if (!e) { p.superC = 1; return; } // nothing to blink to: keep the charge
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      const from = { x: p.x, y: p.y };
      // behind = on the far side of the target; fall back to the sides, then our side
      for (const off of [0, 0.9, -0.9, 1.8, -1.8, Math.PI]) {
        const a = Math.atan2(dy, dx) + off;
        const nx = e.x + Math.cos(a) * 62, ny = e.y + Math.sin(a) * 62;
        if (!blocksMove(tileAt(this.map, nx, ny)) && !this.isSafe(nx, ny) && this.inBounds(nx, ny, -20)) {
          p.x = nx; p.y = ny; moveCircle(this.map, p, 0, 0, this.stats(p).r);
          break;
        }
      }
      p.facing = Math.atan2(e.y - p.y, e.x - p.x);
      p.tp++; p.burst = null; p.cloak = 0; p.atkCd = 0;
      this.fx.push(['blink', Math.round(from.x), Math.round(from.y), 0, p.id]);
      this.fx.push(['blink', Math.round(p.x), Math.round(p.y), 1, p.id]);
    }
  }

  // environmental damage (lava, fire): accumulated so damage numbers stay readable
  hazard(p, cause, amount) {
    if (!p.alive || p.spawnProt > 0 || this.isSafe(p.x, p.y)) return;
    p.hazAcc += amount;
    if (p.hazAcc >= 200) { const d = p.hazAcc; p.hazAcc = 0; this.damage(null, p, d, false, cause); }
  }

  // src: local player | {remote:true, id, name, zone} | null
  // opt: { wid (secondary weapon id), crit } — crits are drawn big; hit markers go to the shooter
  damage(src, t, amount, charge, cause = 'poison', opt = null) {
    if (!t.alive || t.spawnProt > 0 || this.isSafe(t.x, t.y)) return;
    if (t.armorT > 0) amount *= 1 - t.armorF; // Iron Skin gadget
    if (t.star && t.star.fx.armor) amount *= t.star.fx.armor; // Bulwark / Iron Will
    amount = Math.round(amount);
    t.hp -= amount;
    t.lastCombat = this.time;
    t.reveal = Math.max(t.reveal, 0.5);
    const crit = !!(opt && opt.crit) || amount >= 900;
    this.fx.push(['dmg', Math.round(t.x), Math.round(t.y), amount, t.id, crit ? 1 : 0]);
    if (src) {
      t.lastHitBy = src.id;
      if (src.remote) { if (charge) this.hooks.credit?.(src.zone, { id: src.id, charge: 1 }); }
      else {
        src.lastCombat = this.time;
        src.hm |= crit ? 4 : 1; // HIT MARKER (4 = critical)
        (t.dmgBy ||= new Map()).set(src.id, this.time); // for assists
        if (opt && opt.wid) {
          const ws = (src.wstat[opt.wid] ||= { d: 0, k: 0 }); ws.d += amount;
          const a = BRAWLERS[src.brawler].attack;
          if (charge && src.alive) this.addCharge(src, (amount / (a.damage * BRAWLERS[src.brawler].superHits)) * (src.star?.fx.charge || 1));
        } else if (charge && src.alive) this.addCharge(src, (1 / BRAWLERS[src.brawler].superHits) * (src.star?.fx.charge || 1));
      }
    }
    if (t.hp <= 0) this.kill(t, src, cause, opt);
    else if (t.star && t.star.fx.lowHeal && !t.lowHealUsed && t.hp < t.maxHp * 0.25) { // Second Wind
      t.lowHealUsed = true; t.hp = Math.min(t.maxHp, t.hp + t.maxHp * t.star.fx.lowHeal);
      this.fx.push(['gadget', Math.round(t.x), Math.round(t.y), -1, t.id]);
    }
  }

  // SUPER charge. 6 hits of 1/6 add up to 0.9999999999999999 in floating point: a hair short of
  // full counts as full, so the documented number of hits always gives a super that fires.
  addCharge(p, inc) {
    const c = p.superC + inc;
    p.superC = c > 1 - 1e-9 ? 1 : c;
  }

  gainBounty(p, gain) {
    p.bounty += gain; p.bountyEarned += gain; p.kills++; p.sessionKills++;
    p.bestBounty = Math.max(p.bestBounty, p.bounty);
  }

  kill(t, src, cause, opt = null) {
    if (src && !src.remote && src.alive && src.star && src.star.fx.killHeal) src.hp = Math.min(src.maxHp, src.hp + src.maxHp * src.star.fx.killHeal); // Scavenger
    t.alive = false;
    if (src && !src.remote) {
      src.hm |= 2; // kill marker
      if (opt && opt.wid) (src.wstat[opt.wid] ||= { d: 0, k: 0 }).k++;
      if (t.bounty > 0) src.steals++;
    }
    if (t.dmgBy) { // ASSISTS: anyone else who hurt them in the last 5 seconds
      for (const [id, at] of t.dmgBy) { const a = this.players.get(id); if (a && a !== src && this.time - at < 5) a.assists++; }
      t.dmgBy = null;
    }
    t.poison = null;
    t.hp = 0;
    t.dash = t.knock = t.burst = null;
    // everyone eliminated on the same tick shares the best of their places (a trade = a tie)
    if (this.deathTick !== this.tickN) { this.deathTick = this.tickN; this.deathList = []; }
    this.deathList.push(t);
    t.rank = this.aliveCount() + 1;
    for (const v of this.deathList) v.rank = t.rank;
    if (!this.mode.respawn) t.outAt = this.time; // match pay is per minute played
    const stolen = t.bounty;
    const moon = this.dn && this.dn.blood ? 2 : 1; // BLOOD MOON: double bounty for every kill
    if (src && src !== t) {
      if (src.remote) this.hooks.credit?.(src.zone, { id: src.id, kill: 1, gain: (1 + stolen) * moon });
      else this.gainBounty(src, (1 + stolen) * moon);
      // SQUAD HUNT: kills feed the shared team pot; the stolen bounty leaves the victim's pot
      if (this.mode.teams && src.team && t.team && src.team !== t.team) {
        this.teamPot[src.team] += 1 + stolen;
        this.teamPot[t.team] = Math.max(0, this.teamPot[t.team] - stolen);
      }
    }
    t.bounty = 0; t.bushT = 0; t.lowF = 0;
    this.mode.onKill?.(this, t, src && !src.remote ? src : null);
    // Showdown: every cube drops. Free Play (capped): most of them, so a kill can't hand over a full stack
    const n = Math.max(1, this.mode.cubeCap ? Math.ceil(t.cubes * 0.7) : t.cubes);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, d = n > 1 ? 30 : 0; this.dropCube(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d); }
    for (let i = 0; i < t.crystals; i++) { const a = this.rand() * Math.PI * 2, d = 20 + this.rand() * 50; this.dropCrystal(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d); }
    t.crystals = 0;
    const mfx = src && !src.remote && opt && opt.wid && WEAPONS[opt.wid] && src.w2 && src.w2.id === opt.wid && src.wmast >= 7 ? CLASS_FX[WEAPONS[opt.wid].cls] : 0;
    this.fx.push(['die', Math.round(t.x), Math.round(t.y), BRAWLER_IDS.indexOf(t.brawler), t.id, mfx || (src && !src.remote && src.cos && src.cos.fx) || 0]);
    const causeName = { poison: 'Poison', lava: 'Lava', fire: 'Wildfire', spikes: 'Spikes' }[cause] || 'The Wild';
    this.broadcast({ t: 'kill', k: src ? src.name : causeName, v: t.name, kid: src ? src.id : 0, vid: t.id, st: stolen });
    if (this.mode.respawn) t.respawnT = 3;
    if (t.connected) {
      this.send(t.id, {
        t: 'dead', rank: this.mode.respawn ? 0 : t.rank, respawn: this.mode.respawn ? t.respawnT : 0,
        killer: src ? src.name : causeName.toLowerCase() === 'poison' ? 'the Poison' : causeName, killerId: src ? src.id : 0, stolen,
      });
    }
  }

  // credit from another zone (a bullet that crossed the border and hit/killed someone there)
  credit(c) {
    const p = this.players.get(c.id);
    if (!p) return;
    if (c.charge && p.alive) this.addCharge(p, 1 / BRAWLERS[p.brawler].superHits);
    if (c.kill) this.gainBounty(p, c.gain || 1);
  }

  respawn(p) {
    const B = BRAWLERS[p.brawler];
    Object.assign(p, {
      alive: true, hp: this.baseHp(p), maxHp: this.baseHp(p), cubes: 0, ammo: 3, reloadP: 0, stun: 0, cloak: 0, dash: null, knock: null, burst: null,
      spawnProt: 2, respawnT: 0, mvx: 0, mvy: 0, rushArmed: true, rush: 0, lastCombat: -99, poisonT: 0.5, bushT: 0,
    });
    if (p.w2 && p.w2.dropped) { if (p.lo && p.lo.w2) this.setWeapon(p, p.lo.w2, p.lo.perks || []); else this.setWeapon(p, null); }
    else if (p.w2) { const w = this.w2def(p); p.w2.ammo = w.ammo; p.w2.reloadP = 0; p.w2.cd = 0; }
    p.slot = 0; p.swapT = 0;
    if (this.hub && p.gadget) p.gUses = GADGET_USES; p.lowHealUsed = false;
    let pt;
    if (this.hub && !p.bot) {
      // somewhere in our slice of the hub
      for (let i = 0; i < 30; i++) {
        const a = this.rand() * Math.PI * 2, d = this.rand() * (HUB.r - 60);
        const x = HUB.x + Math.cos(a) * d, y = HUB.y + Math.sin(a) * d;
        if (this.inBounds(x, y, -30) && !blocksMove(tileAt(this.map, x, y)) && !blocksMove(tileAt(this.map, x + 30, y)) && !blocksMove(tileAt(this.map, x - 30, y))) { pt = { x, y }; break; }
      }
    }
    if (!pt && this.hub && p.bot) {
      // Free Play zones are huge: bring bots to where the people are (but not on top of them)
      const hs = this.humans().filter((h) => h.alive && h.connected && !this.isSafe(h.x, h.y));
      if (hs.length) {
        const h = hs[Math.floor(this.rand() * hs.length)];
        for (let i = 0; i < 30 && !pt; i++) {
          const a = this.rand() * Math.PI * 2, d = 900 + this.rand() * 900, x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d;
          if (this.inBounds(x, y, -80) && !this.isSafe(x, y) && Math.hypot(x - HUB.x, y - HUB.y) > HUB.r + 150 && !blocksMove(tileAt(this.map, x, y)) && !blocksMove(tileAt(this.map, x + 28, y)) && !blocksMove(tileAt(this.map, x - 28, y)) && !blocksMove(tileAt(this.map, x, y + 28)) && !blocksMove(tileAt(this.map, x, y - 28))) pt = { x, y };
        }
      }
    }
    if (!pt) {
      let best = null, bd = -1;
      for (let i = 0; i < 12; i++) {
        const c = this.randomPoint(120);
        if (this.isSafe(c.x, c.y) || (this.hub && Math.hypot(c.x - HUB.x, c.y - HUB.y) < HUB.r + 150)) continue;
        let md = Infinity;
        for (const o of this.players.values()) if (o !== p && o.alive) md = Math.min(md, Math.hypot(o.x - c.x, o.y - c.y));
        if (md > bd) { bd = md; best = c; }
      }
      pt = best || this.randomPoint(120);
    }
    p.x = p.px = pt.x; p.y = p.py = pt.y;
    this.fx.push(['spawn', Math.round(p.x), Math.round(p.y), 0, p.id]);
  }

  pick(p, brawler) {
    if (!own(BRAWLERS, brawler) || !p.alive || !this.isSafe(p.x, p.y) || p.brawler === brawler) return;
    p.brawler = brawler;
    p.maxHp = 1; p.hp = 1; this.applyPower(p, true); p.hp = p.maxHp;
    p.ammo = 3; p.superC = 0;
    if (p.equipped) this.setCosmetics(p.id, p.equipped); else this.broadcast({ t: 'ro', add: { [p.id]: this.rosterRow(p) } });
  }

  dropCube(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const t = this.map.t[ty * this.map.gw + tx];
    if (t !== EMPTY && t !== BUSH) { x = tx * TILE + TILE / 2; y = ty * TILE + TILE / 2; }
    this.cubes.push({ id: this.nextEnt++, x, y, t: this.time });
  }
  dropCrystal(x, y) {
    const t = this.map.t[Math.floor(y / TILE) * this.map.gw + Math.floor(x / TILE)];
    if (t !== EMPTY && t !== BUSH) { x = Math.floor(x / TILE) * TILE + 25; y = Math.floor(y / TILE) * TILE + 25; }
    this.crystals.push({ id: this.nextEnt++, x, y });
  }

  hitCrate(idx, dmg) {
    const c = this.crates.get(idx);
    if (!c) return;
    c.hp -= dmg;
    if (c.hp <= 0) {
      this.crates.delete(idx);
      this.setTile(idx, EMPTY);
      if (this.hub && this.map.base[idx] === CRATE) this.brokenCrates.set(idx, this.time);
      const x = (idx % this.map.gw) * TILE + TILE / 2, y = Math.floor(idx / this.map.gw) * TILE + TILE / 2;
      this.fx.push(['crate', x, y, c.supply ? 1 : 0, 0]);
      if (c.supply) for (let i = 0; i < 3; i++) this.dropCube(x + Math.cos(i * 2.1) * 30, y + Math.sin(i * 2.1) * 30);
      else this.dropCube(x, y);
      // FREE PLAY WEAPON DROPS: some crates hold a weapon; rare and epic ones are scarcer (and glow)
      if (this.hub && this.rand() < (c.supply ? 0.5 : 0.2) && this.wdrops.length < 40) {
        const pool = WEAPON_IDS.filter((id) => { const r = WEAPONS[id].rarity, k = this.rand(); return r === 'common' || (r === 'rare' && k < 0.45) || (r === 'epic' && k < 0.18); });
        const id = pool[Math.floor(this.rand() * pool.length)] || 'stormline';
        this.wdrops.push({ id: this.nextEnt++, x: x + 22, y: y - 10, w: id, rare: WEAPONS[id].rarity !== 'common' ? 1 : 0, t: this.time });
      }
    } else this.crateDirty.push([idx, c.supply ? -Math.round(c.hp) : Math.round(c.hp)]);
  }

  processInput(p, inp) {
    if (inp.s) p.lastSeq = inp.s;
    if (!p.alive) return;
    const st = this.stats(p);
    if (p.stun <= 0 && !p.dash && !p.knock) applyMove(this.map, p, inp.mx, inp.my, st.speed, st.r, this.mods);
    if (Math.hypot(inp.ax, inp.ay) > 0.2) p.facing = Math.atan2(inp.ay, inp.ax);
    else if (Math.hypot(inp.mx, inp.my) > 0.2) p.facing = Math.atan2(inp.my, inp.mx);
    // LAG COMPENSATION: how far back (in ticks, max 150ms) the shooter was seeing everyone else
    if (inp.vt != null) p.rw = Math.max(0, Math.min(LAG_COMP_TICKS, Math.round(this.tickN - inp.vt)));
    if (inp.w != null && inp.w !== p.slot && p.w2 && p.swapT <= 0 && !p.dash) {
      p.slot = inp.w; p.burst = null;
      p.swapT = p.slot === 1 ? this.w2def(p).swap : SWAP_TIME;
    }
    if (inp.f != null) { if (p.slot === 1 && p.w2) this.tryWeapon(p, inp.f, inp, inp.s); else this.tryAttack(p, inp.f, inp.fd ?? 1, inp.s); }
    if (inp.u != null) this.trySuper(p, inp.u);
    if (inp.gd) this.useGadget(p);
  }

  input(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot || !m || typeof m !== 'object') return; // (any JSON value can arrive: null, 5, "x", [])
    if (m.t === 'pick') return this.pick(p, m.brawler);
    if (m.t === 'emote') return this.emote(p, m.e);
    if (m.t !== 'in') return;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    // angles from the client are untrusted: wrap into (-PI, PI] (a huge value would hang the angle loops)
    const ang = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.atan2(Math.sin(v), Math.cos(v)) : null);
    p.queue.push({
      gd: m.gd === 1 ? 1 : 0, // use the gadget
      s: m.s | 0, mx: num(m.mx), my: num(m.my), ax: num(m.ax), ay: num(m.ay), f: ang(m.f), u: ang(m.u), fd: typeof m.fd === 'number' ? Math.max(0, Math.min(1, m.fd)) : 1,
      w: m.w === 0 || m.w === 1 ? m.w : null, // swap request (0 signature, 1 secondary)
      ch: typeof m.ch === 'number' && Number.isFinite(m.ch) ? Math.max(0, Math.min(2, m.ch)) : 0, // charge held (s)
      vt: typeof m.vt === 'number' && Number.isFinite(m.vt) ? m.vt : null, // the server tick the shooter was looking at
    });
    if (p.queue.length > 12) p.queue.splice(0, p.queue.length - 12);
    const q = p.queue[p.queue.length - 1];
    if (q.mx || q.my || q.f != null || q.u != null || q.gd || q.w != null) { // playing, not idle: time counts for match pay
      const gap = this.time - (p.lastAct ?? -1e9);
      if (gap > 0 && gap < IDLE_SECS) p.actT = (p.actT || 0) + gap;
      p.lastAct = this.time;
    }
  }

  // ---------------------------------------------------------------- events
  updateEvent() {
    if (!this.eventsOn) return;
    const e = this.event;
    if (!e) {
      if (this.time >= this.nextEventAt - EVENT_WARN) {
        const id = this.forceEvent || pickEvent(this.rand, this.lastEvent);
        this.lastEvent = id;
        this.event = { id, ph: 'warn', t: EVENT_WARN, params: EVENTS[id].prepare?.(this) || {} };
        this.broadcast(this.evMsg());
      }
      return;
    }
    const def = EVENTS[e.id];
    e.t -= DT;
    if (e.ph === 'warn' && e.t <= 0) {
      e.ph = 'on'; e.t = def.duration;
      def.start?.(this, e.params);
      this.broadcast(this.evMsg());
    } else if (e.ph === 'on') {
      def.tick?.(this, e.params, DT);
      if (e.t <= 0) {
        def.end?.(this, e.params);
        this.event = null;
        this.nextEventAt += EVENT_EVERY;
        this.broadcast({ t: 'ev', zone: this.zone, id: null });
      }
    }
    this.mods = this.event && this.event.ph === 'on' ? (EVENTS[this.event.id].mods?.(this.event.params) || {}) : {};
  }

  // ---------------------------------------------------------------- tick
  // What the Durable Objects call: one exception must never stop the match for everyone. The
  // error is counted and handed to onError; this tick's one-shot buffers are dropped so they
  // can't pile up. (Tests call tick() directly, so a bug still fails loudly there.)
  tickSafe(onError) {
    try { this.tick(); return true; } catch (e) {
      this.tickErrors = (this.tickErrors || 0) + 1;
      this.fx = []; this.tileDirty = []; this.crateDirty = []; this.pings = []; this.bnew = []; this.bdead = [];
      onError?.(e, this.tickErrors);
      return false;
    }
  }

  tick() {
    this.clock += DT;
    if (this.phase === 'lobby') {
      if (this.lobbyEnd != null && this.clock >= this.lobbyEnd && this.canStart()) this.start();
      else if (Math.round(this.clock / DT) % 10 === 0) this.broadcastLobby();
      return;
    }
    if (this.phase === 'end') return;

    this.time += DT;
    this.tickN++;
    this.zoneInset = this.mode.poison ? poisonInset(this.time, this.bounds.x1 - this.bounds.x0) : 0;
    this.updateEvent();
    if (this.wallsToRestore.length && this.tickN % 10 === 0) {
      this.wallsToRestore = this.wallsToRestore.filter((idx) => { if (this.map.t[idx] !== EMPTY || this.tileOccupied(idx)) return this.map.t[idx] === EMPTY; this.setTile(idx, WALL); return false; });
    }
    this.mode.tick?.(this);
    const mods = this.mods;

    for (const p of this.players.values()) {
      if (!p.alive) {
        p.queue.length = 0;
        if (p.respawnT > 0) { p.respawnT -= DT; if (p.respawnT <= 0) this.respawn(p); }
        continue;
      }
      p.px = p.x; p.py = p.y;
      p.atkCd -= DT; p.stun -= DT; p.cloak -= DT; p.reveal -= DT; p.rush -= DT; p.spawnProt -= DT; p.slowT -= DT; p.cageT -= DT;
      p.swapT -= DT; p.flareT -= DT; p.armorT -= DT;
      if (p.w2) { // secondary weapon: cooldown, magazine reload, burst rounds
        const w = this.w2def(p), st = p.w2;
        st.cd -= DT;
        if (st.ammo < w.ammo) { st.reloadP += (DT / w.reload) * (p.star?.fx.reload || 1); if (st.reloadP >= 1) { st.ammo++; st.reloadP = st.ammo >= w.ammo ? 0 : st.reloadP - 1; } }
        if (p.wburst) { p.wburst.t -= DT; if (p.wburst.t <= 0) { p.wburst.fire(p.wburst.k++); p.wburst.left--; p.wburst.t += w.interval; if (p.wburst.left <= 0 || p.slot !== 1) p.wburst = null; } }
      }
      if (p.poison) { // Viper poison: damage over time
        const ps = p.poison; ps.t -= DT; ps.tick -= DT;
        if (ps.tick <= 0) { ps.tick += 0.5; this.damage(this.players.get(ps.src) || null, p, ps.dps * 0.5, false, 'poison', { wid: ps.wid }); }
        if (ps.t <= 0 || !p.alive) p.poison = null;
        if (!p.alive) continue;
      }

      if (p.bot) {
        p.queue = [p.dummy ? this.mode.dummyInput(this, p) : botInput(this, p)];
        if (p.gadget && p.gUses > 0 && this.time - p.lastCombat < 1 && p.hp < p.maxHp * 0.55 && Math.random() < 0.04) this.useGadget(p);
      }
      p.credits = Math.min(p.credits + 1, 4);
      while (p.queue.length && p.credits >= 1) {
        p.credits -= 1;
        this.processInput(p, p.queue.shift());
      }
      if (p.bot && this.hub) this.keepBotInZone(p);

      const B = BRAWLERS[p.brawler];
      if (p.burst) {
        p.burst.t -= DT;
        if (p.burst.t <= 0) {
          this.spawnShot(p, p.burst.ang);
          p.burst.left--; p.burst.t += B.attack.interval;
          if (p.burst.left <= 0) p.burst = null;
        }
      }
      if (p.dash) this.updateDash(p);
      if (p.knock) {
        moveCircle(this.map, p, p.knock.vx * DT, p.knock.vy * DT, this.stats(p).r);
        p.knock.t -= DT;
        if (p.knock.t <= 0) p.knock = null;
      }
      if (p.ammo < 3) {
        p.reloadP += (DT / B.reload) * (p.star?.fx.reload || 1);
        if (p.reloadP >= 1) { p.ammo++; p.reloadP = p.ammo >= 3 ? 0 : p.reloadP - 1; }
      }
      if (this.time - p.lastCombat > REGEN_DELAY && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * REGEN_RATE * DT);

      // SHRINK & SPEED: dropping under 25% triggers a one-off speed rush
      const f = p.hp / p.maxHp;
      if (f < LOW_HP && p.rushArmed) { p.rushArmed = false; p.rush = RUSH_TIME; this.fx.push(['rush', Math.round(p.x), Math.round(p.y), 0, p.id]); }
      else if (f > 0.4) p.rushArmed = true;
      // LAY LOW
      p.bushT = inBush(this.map, p.x, p.y) && p.reveal <= 0 ? p.bushT + DT : 0;
      p.lowF = layLowFactor(p.bushT);

      // spiked border walls
      p.spikeCd = (p.spikeCd || 0) - DT;
      if (p.spikeCd <= 0 && touchingBorder(this.map, p.x, p.y, this.stats(p).r) && !this.isSafe(p.x, p.y) && p.spawnProt <= 0) {
        p.spikeCd = SPIKE_CD;
        this.fx.push(['spike', Math.round(p.x), Math.round(p.y), 0, p.id]);
        this.damage(null, p, p.maxHp * SPIKE_DMG, false, 'spikes');
        if (!p.alive) continue;
      }
      const z = this.zoneInset;
      if (z > 0 && (p.x < z || p.y < z || p.x > this.bounds.x1 - z || p.y > this.bounds.y1 - z)) {
        p.poisonT -= DT;
        if (p.poisonT <= 0) { p.poisonT = 1; this.damage(null, p, POISON_DPS, false, 'poison'); if (!p.alive) continue; }
      } else p.poisonT = 0.5;

      const pr = this.stats(p).r + 20;
      const cubeCap = this.mode.cubeCap || Infinity; // Free Play: a full stack leaves cubes for others
      for (let i = this.cubes.length - 1; i >= 0; i--) {
        const c = this.cubes[i];
        if (p.cubes < cubeCap && Math.hypot(c.x - p.x, c.y - p.y) < pr) {
          this.cubes.splice(i, 1);
          p.cubes++; p.maxHp += CUBE_HP; p.hp += CUBE_HP;
          this.fx.push(['cube', Math.round(p.x), Math.round(p.y), p.cubes, p.id]);
        }
      }
      for (let i = this.wdrops.length - 1; i >= 0; i--) { // walk over a dropped weapon to take it as your secondary
        const d = this.wdrops[i];
        if (Math.hypot(d.x - p.x, d.y - p.y) < pr && !(p.w2 && p.w2.id === d.w) && this.time - (p.dropT ?? -9) > 1.5) {
          if (p.bot && p.w2) continue; // bots keep their own
          this.wdrops.splice(i, 1);
          this.setWeapon(p, d.w, p.lo && p.lo.w2 === d.w ? p.lo.perks || [] : []);
          p.w2.dropped = true; p.dropT = this.time;
          this.fx.push(['wpick', Math.round(d.x), Math.round(d.y), weaponIndex(d.w), p.id]);
        }
      }
      for (let i = this.crystals.length - 1; i >= 0; i--) {
        const c = this.crystals[i];
        if (Math.hypot(c.x - p.x, c.y - p.y) < pr) {
          this.crystals.splice(i, 1);
          p.crystals++;
          this.fx.push(['gem', Math.round(p.x), Math.round(p.y), p.crystals, p.id]);
        }
      }
      // BOUNTY radar pings (hunted target always pings)
      const isTarget = this.targetId === p.id;
      let iv = pingInterval(p.bounty) * (1 + 3 * p.lowF);
      if (isTarget) iv = Math.min(iv, 1.5);
      p.pingT += DT;
      if (p.pingT >= iv) { p.pingT = 0; this.pings.push([p.id, Math.round(p.x), Math.round(p.y), p.bounty]); }
      p.vx = (p.x - p.px) / DT; p.vy = (p.y - p.py) / DT;
    }

    this.updateBullets();
    // LAG COMPENSATION history: where everyone is at the end of this tick (8 ticks kept)
    const hi = this.tickN & 7;
    for (const p of this.players.values()) { p.hx[hi] = p.x; p.hy[hi] = p.y; }
    if (this.flares.length) {
      for (const f of this.flares) { f.t -= DT; for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - f.x, p.y - f.y) < f.r) p.flareT = Math.max(p.flareT, 0.15); }
      this.flares = this.flares.filter((f) => f.t > 0);
    }
    this.updateMines();
    this.updateDelayed();
    if (this.hooks.handoff) this.checkHandoffs();
    if (this.hub) this.maintainBots();
    if (this.hub && this.tickN % 40 === 0) {
      this.dn = dayNight(this.now());
      for (const [idx, at] of this.brokenCrates) { // Free Play crates (vaults, caches) refill after 90s
        if (this.time - at < 90 || this.map.t[idx] !== EMPTY || this.tileOccupied(idx)) continue;
        this.brokenCrates.delete(idx); this.addCrate(idx);
      }
      if (this.wdrops.length) this.wdrops = this.wdrops.filter((d) => this.time - d.t < 75); // drops fade after 75s
      if (this.cubes.length) this.cubes = this.cubes.filter((c) => this.time - (c.t || 0) < 90); // so do loose power cubes
    }
    this.sendSnapshots();
    this.pingLog = this.pings;
    this.fx = []; this.tileDirty = []; this.crateDirty = []; this.pings = []; this.bnew = []; this.bdead = [];
    for (const p of this.players.values()) p.hm = 0;

    if (this.mode.checkEnd(this)) this.finish();
  }

  keepBotInZone(p) {
    const b = this.bounds, m = 40;
    p.x = Math.max(b.x0 + m, Math.min(b.x1 - m, p.x));
    p.y = Math.max(b.y0 + m, Math.min(b.y1 - m, p.y));
    const d = Math.hypot(p.x - HUB.x, p.y - HUB.y), keep = HUB.r + 40;
    if (d < keep) { p.x = HUB.x + ((p.x - HUB.x) / (d || 1)) * keep; p.y = HUB.y + ((p.y - HUB.y) / (d || 1)) * keep; }
  }

  updateDash(p) {
    const s = BRAWLERS[p.brawler].super;
    const mult = this.dmgMult(p);
    moveCircle(this.map, p, p.dash.vx * DT, p.dash.vy * DT, this.stats(p).r);
    const sp = Math.hypot(p.dash.vx, p.dash.vy), nx = p.dash.vx / sp, ny = p.dash.vy / sp;
    const km = this.mods.knockMul || 1;
    for (const e of this.players.values()) {
      if (!this.enemies(p, e) || !e.alive || p.dash.hit.has(e.id) || e.spawnProt > 0 || this.isSafe(e.x, e.y)) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < s.radius + this.stats(e).r) {
        p.dash.hit.add(e.id);
        let kx = e.x - p.x, ky = e.y - p.y;
        const kl = Math.hypot(kx, ky) || 1;
        kx = nx * 0.6 + (kx / kl) * 0.4; ky = ny * 0.6 + (ky / kl) * 0.4;
        const kn = Math.hypot(kx, ky) || 1;
        e.knock = { vx: ((kx / kn) * s.knock * km) / 0.2, vy: ((ky / kn) * s.knock * km) / 0.2, t: 0.2 };
        e.dash = null; e.burst = null;
        e.stun = Math.max(e.stun, 0.3);
        this.damage(p, e, s.damage * mult, false);
      }
    }
    if (p.dash) { p.dash.t -= DT; if (p.dash.t <= 0) p.dash = null; }
  }

  mineVisible(v, m) {
    if (v.id === m.owner || (m.team && v.team === m.team) || v.alive === false || m.arm > 0) return true;
    return !v.observer && Math.hypot(v.x - m.x, v.y - m.y) < MINE_SEEN;
  }

  updateMines() {
    if (!this.mines.length) return;
    const keep = [];
    for (const m of this.mines) {
      m.arm -= DT; m.life -= DT;
      let boom = m.life <= 0;
      if (m.arm <= 0 && !boom) {
        const owner = this.players.get(m.owner);
        for (const e of this.players.values()) {
          if (!e.alive || e.id === m.owner || (m.team && e.team === m.team)) continue;
          if (Math.hypot(e.x - m.x, e.y - m.y) < m.trigger + this.stats(e).r) { boom = true; break; }
        }
        if (boom) {
          this.fx.push(['boom', Math.round(m.x), Math.round(m.y), m.blast, m.owner]);
          for (const e of this.players.values()) {
            if (!e.alive || e.id === m.owner || (m.team && e.team === m.team)) continue;
            if (Math.hypot(e.x - m.x, e.y - m.y) < m.blast + this.stats(e).r) {
              const src = owner || (m.ozone && m.ozone !== this.zone ? { remote: true, id: m.owner, name: m.oname, zone: m.ozone } : null);
              this.damage(src, e, m.dmg, true);
            }
          }
          continue;
        }
      }
      if (!boom) keep.push(m);
    }
    this.mines = keep;
  }

  updateDelayed() {
    if (!this.delayed.length) return;
    const keep = [];
    for (const d of this.delayed) {
      d.t -= DT;
      if (d.t > 0) { keep.push(d); continue; }
      if (d.kind === 'worm') {
        this.fx.push(['worm', Math.round(d.x), Math.round(d.y), d.r, d.owner]);
        const owner = this.players.get(d.owner);
        for (const e of this.players.values()) {
          if (!e.alive || e.id === d.owner || (owner && !this.enemies(owner, e)) || e.spawnProt > 0 || this.isSafe(e.x, e.y)) continue;
          if (Math.hypot(e.x - d.x, e.y - d.y) < d.r + this.stats(e).r) {
            e.stun = Math.max(e.stun, d.stun); e.dash = null; e.burst = null;
            this.damage(owner || null, e, d.dmg, false);
          }
        }
      }
    }
    this.delayed = keep;
  }

  // GADGET: an active ability with 3 uses a match (Power 7+)
  useGadget(p) {
    const g = p.gadget, fx = g && g.fx;
    if (!g || !p.alive || p.gUses <= 0 || p.stun > 0 || p.dash || this.isSafe(p.x, p.y) || this.time - (p.gadgetT ?? -9) < 1) return;
    p.gUses--; p.gadgetT = this.time;
    const near = (r) => [...this.players.values()].filter((e) => this.enemies(p, e) && e.alive && Math.hypot(e.x - p.x, e.y - p.y) < r);
    if (fx.dash) { const a = p.facing, t = 0.15; p.knock = { vx: (Math.cos(a) * fx.dash) / t, vy: (Math.sin(a) * fx.dash) / t, t }; }
    if (fx.slowAoe) for (const e of near(fx.slowAoe[0])) e.slowT = Math.max(e.slowT, fx.slowAoe[1]);
    if (fx.armor) { p.armorT = fx.armor[1]; p.armorF = fx.armor[0]; }
    if (fx.knockAoe) for (const e of near(fx.knockAoe[0])) {
      const a = Math.atan2(e.y - p.y, e.x - p.x), t = 0.15;
      e.knock = { vx: (Math.cos(a) * 220) / t, vy: (Math.sin(a) * 220) / t, t };
      this.damage(p, e, fx.knockAoe[1] * this.dmgMult(p), true);
    }
    if (fx.cloak) p.cloak = Math.max(p.cloak, fx.cloak);
    if (fx.revealAoe) for (const e of near(fx.revealAoe[0])) { e.reveal = Math.max(e.reveal, fx.revealAoe[1]); e.flareT = Math.max(e.flareT || 0, fx.revealAoe[1]); }
    if (fx.heal) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * fx.heal);
    if (fx.mine) this.placeMine({ owner: p.id, oname: p.name, ozone: this.zone, team: p.team, x: p.x, y: p.y, dmg: BRAWLERS.rook.attack.damage * this.dmgMult(p) });
    if (fx.pull) {
      let best = null, bd = fx.pull;
      for (const e of near(fx.pull)) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd && this.canSee(p, e) && lineOfSight(this.map, p.x, p.y, e.x, e.y)) { bd = d; best = e; } }
      if (best) { const a = Math.atan2(p.y - best.y, p.x - best.x), dist = Math.max(0, bd - 70), t = 0.2; best.knock = { vx: (Math.cos(a) * dist) / t, vy: (Math.sin(a) * dist) / t, t }; best.stun = Math.max(best.stun, 0.3); }
    }
    this.fx.push(['gadget', Math.round(p.x), Math.round(p.y), GADGETS[p.brawler].indexOf(g), p.id]);
  }

  placeMine(b) {
    const a = BRAWLERS.rook.attack;
    const mine = { id: this.nextEnt++, owner: b.owner, oname: b.oname, ozone: b.ozone, team: b.team, x: b.x, y: b.y, arm: a.arm, life: a.life, trigger: a.trigger, blast: a.blast, dmg: b.dmg };
    const mine0 = this.mines.filter((m) => m.owner === b.owner);
    if (mine0.length >= a.max) this.mines.splice(this.mines.indexOf(mine0[0]), 1);
    this.mines.push(mine);
  }

  addBullets(list) { for (const b of list) this.addShot({ ...b }); } // crossed in from a neighbour zone

  // SPATIAL GRID: players bucketed into 160px cells (one grid per rewind amount), so each bullet
  // only checks the few players near it instead of everyone
  grid(rw) {
    let g = this.grids[rw];
    if (g) return g;
    g = new Map();
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const [x, y] = this.posAt(p, rw), k = ((x / 160) | 0) * 4096 + ((y / 160) | 0);
      let cell = g.get(k);
      if (!cell) g.set(k, (cell = []));
      cell.push(p, x, y);
    }
    return (this.grids[rw] = g);
  }

  updateBullets() {
    const out = [], leaving = [];
    this.grids = [];
    for (const b of this.bullets) {
      let victim = null, vx = 0, vy = 0;
      const g = this.grid(b.rw || 0);
      const hit = b.mine || b.bounce ? null : (bb) => {
        if (this.isSafe(bb.x, bb.y)) { victim = 'safe'; return true; }
        const cx = (bb.x / 160) | 0, cy = (bb.y / 160) | 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const cell = g.get((cx + i) * 4096 + cy + j);
          if (!cell) continue;
          for (let k = 0; k < cell.length; k += 3) {
            const p = cell[k];
            if (p.id === bb.owner || (bb.team && p.team === bb.team) || !p.alive || (bb.hit && bb.hit.includes(p.id))) continue;
            const rr = this.stats(p).r + bb.r;
            if ((cell[k + 1] - bb.x) ** 2 + (cell[k + 2] - bb.y) ** 2 < rr * rr) {
              if (bb.pierce) { // piercing shots hit and keep flying (Dune's wave: everyone; Needle: one extra)
                this.bulletHit(bb, p, cell[k + 1], cell[k + 2]);
                if (bb.pierce !== true && bb.hit.length > bb.pierce) return true;
                continue;
              }
              victim = p; vx = cell[k + 1]; vy = cell[k + 2]; return true;
            }
          }
        }
        return false;
      };
      let why = stepShot(this.map, b, this.mods, hit);
      if (b.mine && !why && this.isSafe(b.x, b.y)) why = 'safe';
      if (why === 'hit' && victim && victim !== 'safe') this.bulletHit(b, victim, vx, vy);
      if (why === 'crate') {
        const idx = Math.floor(b.y / TILE) * this.map.gw + Math.floor(b.x / TILE);
        if (b.mine) { this.hitCrate(idx, b.dmg); this.fx.push(['boom', Math.round(b.x), Math.round(b.y), 60, b.owner]); }
        else if (b.rocket) this.explode(b, b.x, b.y);
        else { this.hitCrate(idx, b.dmg); this.fx.push(['hit', Math.round(b.x), Math.round(b.y), b.kind, 0]); }
      }
      if (b.mine && why && why !== 'crate') {
        // a thrown mine lands just before whatever it hit
        if (why === 'wall') { b.x -= b.vx * DT / 4; b.y -= b.vy * DT / 4; }
        if (!this.isSafe(b.x, b.y)) this.placeMine(b);
      }
      if (b.rocket && (why === 'wall' || why === 'range' || why === 'hit')) this.explode(b, b.x, b.y);
      if (b.bounce && why === 'fuse') this.explode(b, b.x, b.y);
      if (b.flare && why) this.lightFlare(b);
      if (why) { this.bdead.push([b.id, Math.round(b.x), Math.round(b.y)]); continue; }
      if (!this.inBounds(b.x, b.y)) { leaving.push(b); this.bdead.push([b.id, Math.round(b.x), Math.round(b.y)]); } else out.push(b);
    }
    this.bullets = out;
    if (leaving.length && this.hooks.bulletsOut) this.hooks.bulletsOut(leaving);
  }

  bulletHit(b, p, x, y) {
    this.fx.push(['hit', Math.round(b.x), Math.round(b.y), b.kind, p.id]);
    const src = this.players.get(b.owner) || (b.ozone && b.ozone !== this.zone ? { remote: true, id: b.owner, name: b.oname, zone: b.ozone } : null);
    const ok = p.spawnProt <= 0 && !this.isSafe(p.x, p.y);
    if (b.slow && ok) p.slowT = Math.max(p.slowT, b.slow);
    if (b.cage && ok) { p.stun = Math.max(p.stun, b.cage); p.cageT = b.cage; p.dash = null; p.burst = null; this.fx.push(['cage', Math.round(p.x), Math.round(p.y), 0, p.id]); }
    if (b.poison && ok) p.poison = { dps: b.poison.dps, t: b.poison.time, tick: 0.5, src: b.owner, wid: b.wid };
    let dmg = b.dmg, crit = !!b.crit;
    if (b.close && Math.hypot(x - b.x0, y - b.y0) < 170) { dmg *= 1.3; crit = true; } // Slugger point-blank
    if (b.rocket) return; // the explosion does the damage
    if (b.hit) b.hit.push(p.id);
    this.damage(src, p, dmg, !b.cage, 'poison', b.wid ? { wid: b.wid, crit } : crit ? { crit } : null);
    if (b.chain) { // Arc Gun: jump to up to n more enemies near the last one
      let from = p, mul = 1;
      const done = new Set([p.id]);
      for (let k = 0; k < b.chain.n; k++) {
        let next = null, nd = b.chain.range;
        for (const e of this.players.values()) {
          if (done.has(e.id) || !e.alive || e.id === b.owner || (b.team && e.team === b.team)) continue;
          const d = Math.hypot(e.x - from.x, e.y - from.y);
          if (d < nd && lineOfSight(this.map, from.x, from.y, e.x, e.y)) { nd = d; next = e; }
        }
        if (!next) break;
        mul *= b.chain.mul; done.add(next.id);
        this.fx.push(['arc', Math.round(from.x), Math.round(from.y), Math.round(next.x), Math.round(next.y)]);
        this.damage(src, next, b.dmg * mul, true, 'poison', { wid: b.wid });
        from = next;
      }
    }
  }

  // Flare Gun: lights an area; everyone inside is revealed (bushes, cloak) for a few seconds
  lightFlare(b) {
    this.flares.push({ x: Math.round(b.x), y: Math.round(b.y), r: b.flare.r, t: b.flare.time });
    this.fx.push(['flare', Math.round(b.x), Math.round(b.y), b.flare.r, b.owner]);
  }

  // signature melee etc. still use emote / misc helpers below
  emote(p, e) {
    if (typeof e !== 'number' || e < 0 || e > 31 || this.time - (p.emoteT ?? -9) < 2.5) return;
    if (p.emotes && !p.emotes.includes(e)) return; // only emotes you own
    p.emoteT = this.time;
    this.fx.push(['emote', Math.round(p.x), Math.round(p.y), e, p.id]);
  }

  checkHandoffs() {
    for (const p of [...this.players.values()]) {
      if (p.bot || !p.alive || !p.connected) continue;
      if (this.inBounds(p.x, p.y, -0.01)) continue;
      const state = this.exportPlayer(p);
      this.removePlayer(p.id);
      this.hooks.handoff(p, state);
    }
  }

  maintainBots() {
    this.botSpawnT -= DT;
    if (this.botSpawnT > 0) return;
    this.botSpawnT = 2;
    const bots = [...this.players.values()].filter((p) => p.wasBot);
    if (bots.length >= this.botTarget) return;
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const name = BOT_NAMES.filter((n) => !taken.has(n))[Math.floor(this.rand() * 10)] || 'Bot';
    const p = this.addPlayer({ name, brawler: BRAWLER_IDS[Math.floor(this.rand() * BRAWLER_IDS.length)], bot: true });
    this.setWeapon(p, WEAPON_IDS[Math.floor(this.rand() * WEAPON_IDS.length)]);
    p.alive = false;
    this.respawn(p);
  }

  sendSnapshots() {
    // BULLETS AS EVENTS: one "fired" row per projectile ([id, x, y, vx, vy, range, kind, tick, owner,
    // fuse]); clients simulate it with the same stepShot. Plus [id, x, y] when one ends.
    const shots = this.bnew.map((b) => [b.id, b.ev[0], b.ev[1], b.ev[2], b.ev[3], Math.round(Math.min(b.range, 99999)), b.kind, b.t0 - 1, b.owner, b.ev[4]]);
    const shotPath = (r) => { // the box a shot can reach (grenades: a circle of their roll distance)
      const reach = r[9] ? 700 : r[5];
      const l = Math.hypot(r[3], r[4]) || 1;
      return [r[1], r[2], r[1] + (r[3] / l) * reach, r[2] + (r[4] / l) * reach, r[9] ? 700 : 0];
    };
    const paths = shots.map(shotPath);
    const cubes = this.cubes.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]);
    const crystals = this.crystals.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]);
    const mineRows = (v) => (!this.mines.length ? undefined : ne(this.mines.filter((m) => this.mineVisible(v, m)).map((m) => [m.id, Math.round(m.x), Math.round(m.y), m.arm <= 0 ? 1 : 0, m.owner])));
    const alive = this.aliveCount();
    let top = null;
    for (const p of this.players.values()) if (p.bounty > 0 && (!top || p.bounty > top.bounty)) top = p;
    const common = {
      t: 's', zone: this.zone, n: this.tickN, tm: r2(this.time),
      td: ne(this.tileDirty), ch: ne(this.crateDirty), z: Math.round(this.zoneInset), al: alive,
      top: top ? [top.id, top.name, top.bounty] : null, ev: this.event ? [this.event.id, this.event.ph, r2(this.event.t)] : null,
      md: this.mode.hud?.(this) || null,
    };
    if (this.mode.respawn && !this.mode.noRewards && this.tickN % 10 === 0) {
      common.lb = this.mode.rank(this).slice(0, 3).map((p) => [p.id, p.name, this.mode.score(p)]);
    }
    if (this.hub && this.tickN % 40 === 0) common.on = this.humans().length;
    // players: the fast-changing part every tick [id, x, y, hp, facing, flags]; the slow part
    // ([id, maxHp, cubes, bounty, glow, crystals, team]) only when it changed for that viewer, plus a
    // full refresh every 2s. Static rows are computed once per player per tick.
    const fast = new Map(), slow = new Map();
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      fast.set(p.id, [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.hp), Math.round(p.facing * 100) / 100, this.flags(p)]);
      const st = [p.id, p.maxHp, p.cubes, p.bounty, this.glow(p), p.crystals, p.team, p.w2 ? weaponIndex(p.w2.id) : -1, p.power || 1];
      slow.set(p.id, st);
    }
    const refresh = this.tickN % 40 === 0;
    let hb = 0; // HEARTBEAT (set by rows): an enemy is close to the viewer but hidden from them
    const rows = (v, memo) => {
      const others = [], statics = [];
      hb = 0;
      for (const p of this.players.values()) {
        if (p === v || !p.alive) continue;
        if (Math.abs(p.x - v.x) > VIEW_X || Math.abs(p.y - v.y) > VIEW_Y) continue;
        if (!this.canSee(v, p)) {
          if (!hb && v.alive && Math.abs(p.x - v.x) < HEARTBEAT_DIST && Math.abs(p.y - v.y) < HEARTBEAT_DIST && this.enemies(v, p) && Math.hypot(p.x - v.x, p.y - v.y) < HEARTBEAT_DIST) hb = 1;
          continue;
        }
        others.push(fast.get(p.id));
        const st = slow.get(p.id), was = memo.get(p.id);
        if (refresh || !was || was[1] !== st[1] || was[2] !== st[2] || was[3] !== st[3] || was[4] !== st[4] || was[5] !== st[5] || was[6] !== st[6] || was[7] !== st[7] || was[8] !== st[8]) { memo.set(p.id, st); statics.push(st); }
      }
      return [others, statics];
    };
    // INTEREST MANAGEMENT: each viewer only gets what's near them (bullets, pickups, effects,
    // radar pings), so a snapshot's size doesn't grow with the map or the player count
    const near = (v, x, y, mx, my) => Math.abs(x - v.x) < mx && Math.abs(y - v.y) < my;
    const seesPath = (v, q) => { // does the viewer's area overlap this shot's path?
      const x0 = Math.min(q[0], q[2]) - q[4], x1 = Math.max(q[0], q[2]) + q[4], y0 = Math.min(q[1], q[3]) - q[4], y1 = Math.max(q[1], q[3]) + q[4];
      return x1 > v.x - VIEW_X - 300 && x0 < v.x + VIEW_X + 300 && y1 > v.y - VIEW_Y - 300 && y0 < v.y + VIEW_Y + 300;
    };
    const local = (v) => ({
      bn: shots.length ? ne(shots.filter((r, i) => seesPath(v, paths[i]))) : undefined,
      bd: this.bdead.length ? ne(this.bdead.filter((r) => near(v, r[1], r[2], VIEW_X + 400, VIEW_Y + 400))) : undefined,
      fl: this.flares.length ? this.flares.filter((f) => near(v, f.x, f.y, VIEW_X + f.r, VIEW_Y + f.r)).map((f) => [f.x, f.y, f.r, r2(f.t)]) : undefined,
      cu: ne(cubes.filter((r) => near(v, r[1], r[2], VIEW_X + 200, VIEW_Y + 200))),
      wd: this.wdrops.length ? this.wdrops.filter((d) => near(v, d.x, d.y, VIEW_X + 200, VIEW_Y + 200)).map((d) => [d.id, Math.round(d.x), Math.round(d.y), weaponIndex(d.w), d.rare]) : undefined,
      cy: crystals.length ? ne(crystals.filter((r) => near(v, r[1], r[2], VIEW_X + 200, VIEW_Y + 200))) : undefined,
      fx: this.fx.length ? ne(this.fx.filter((f) => f[4] === v.id || near(v, f[1], f[2], VIEW_X + 200, VIEW_Y + 200))) : undefined,
      pg: this.pings.length ? ne(this.pings.filter((g) => Math.hypot(g[1] - v.x, g[2] - v.y) < RADAR_RANGE)) : undefined,
    });
    for (const v of this.players.values()) {
      if (!v.connected) continue;
      const [pr, px] = rows(v, v.sentStatic ||= new Map());
      this.send(v.id, {
        ...common, ...local(v), ack: v.lastSeq, p: pr, ...(px.length ? { px } : {}), mn: mineRows(v), ...(v.hm ? { hm: v.hm } : {}),
        ...(v.team ? { mates: [...this.players.values()].filter((q) => q !== v && q.team === v.team && q.alive).map((q) => [q.id, Math.round(q.x), Math.round(q.y)]) } : {}),
        me: meDelta({
          x: r2(v.x), y: r2(v.y), mvx: r2(v.mvx), mvy: r2(v.mvy), hp: Math.round(v.hp), mh: v.maxHp, am: r2(v.ammo + v.reloadP),
          sc: v.superC >= 1 ? 1 : Math.min(0.99, r2(v.superC)), cu: v.cubes, f: this.flags(v), al: v.alive ? 1 : 0, fo: v.dash || v.knock || v.stun > 0 ? 1 : 0,
          cl: r2(Math.max(0, v.cloak)), bt: v.bounty, lo: r2(v.lowF), bt5: r2(Math.min(v.bushT, 5)), rs: r2(Math.max(0, v.rush)),
          rt: r2(Math.max(0, v.respawnT)), cr: v.crystals, scr: Math.floor(this.mode.score ? this.mode.score(v) : 0),
          k: v.kills, be: v.bountyEarned, sk: v.sessionKills, bb: v.bestBounty, gl: this.glow(v), id: v.id, br: v.brawler,
          sl: v.slowT > 0 ? r2(v.slowT) : 0, tp: v.tp, tm: v.team, hb,
          ws: v.slot, sw: v.swapT > 0 ? r2(v.swapT) : 0, pz: v.poison ? 1 : 0,
          w2: v.w2 ? [weaponIndex(v.w2.id), r2(v.w2.ammo + v.w2.reloadP), r2(Math.max(0, v.w2.cd))] : null,
          pw: v.power || 1, gu: v.gadget ? v.gUses : -1, gi: v.gadget ? GADGETS[v.brawler].indexOf(v.gadget) : -1, sp: v.star ? v.star.fx.speed || 1 : 1,
        }, v, refresh),
      });
    }
    if (this.observers.size && this.tickN % 2 === 0) {
      for (const [k, o] of this.observers) {
        const v = { x: o.x, y: o.y, alive: true, observer: true }, [pr, px] = rows(v, o.sentStatic ||= new Map());
        this.send(k, { ...common, ...local(v), p: pr, ...(px.length ? { px } : {}), mn: mineRows(v) });
      }
    }
  }

  glow(p) { return Math.round(Math.max(bountyGlow(p.bounty), this.targetId === p.id ? 1 : 0) * (1 - 0.85 * p.lowF) * 100); }

  flags(p) {
    return (inBush(this.map, p.x, p.y) ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.cloak > 0 ? 4 : 0) | (p.dash ? 8 : 0)
      | (p.spawnProt > 0 ? 16 : 0) | (this.targetId === p.id ? 32 : 0) | (p.rush > 0 ? 64 : 0) | (p.lowF > 0 ? 128 : 0)
      | (p.cageT > 0 ? 256 : 0) | (p.slowT > 0 ? 512 : 0);
  }

  // seconds this player was in the match (until knocked out when there are no respawns), counting
  // only time they were playing: standing idle pays for IDLE_SECS at most
  secsOf(p) { return Math.min(p.outAt != null && !this.mode.respawn ? p.outAt : this.time, (p.actT || 0) + IDLE_SECS); }

  finish() {
    this.phase = 'end';
    const ranked = this.mode.rank(this);
    const winTeam = this.mode.teams ? (this.teamPot[1] === this.teamPot[2] ? 0 : this.teamPot[1] > this.teamPot[2] ? 1 : 2) : 0;
    const key = this.mode.tieKey ? (p) => this.mode.tieKey(this, p) : null;
    ranked.forEach((p, i) => { p.rank = i > 0 && key && key(p) === key(ranked[i - 1]) ? ranked[i - 1].rank : i + 1; });
    const score = this.mode.score || (() => 0);
    const results = ranked.map((p) => [p.name, p.brawler, p.rank, p.kills, p.wasBot ? 1 : 0, p.id, p.bountyEarned, Math.floor(score(p)), p.team]);
    const winner = ranked[0];
    this.hooks.finished?.(ranked.filter((p) => !p.wasBot && !p.left).map((p) => ({ p, rank: p.rank, players: this.players.size, won: this.mode.teams ? (winTeam === 0 ? null : p.team === winTeam) : undefined, assists: p.assists, steals: p.steals, wstat: p.wstat, secs: this.secsOf(p) })));
    for (const p of this.players.values()) {
      if (p.connected) {
        this.send(p.id, { t: 'end', mode: this.modeKey, rank: p.rank, kills: p.kills, bounty: p.bountyEarned, winner: winner ? winner.name : null, results,
          ...(this.mode.teams ? { team: p.team, winTeam, pots: this.teamPot, won: p.team === winTeam } : {}), n: this.players.size });
      }
    }
  }
}
