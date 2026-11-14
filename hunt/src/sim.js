// Server-authoritative simulation shared by Quick Hunt arenas and Free Play zones.
// Pure JS (no Workers APIs) so it runs in Node tests. Durable Objects own the sockets and
// call tick() at 20 Hz.
import {
  BRAWLERS, BRAWLER_IDS, DT, TILE, MAX_PLAYERS, EMPTY, WALL, BUSH, CRATE,
  CRATE_HP, SUPPLY_HP, CUBE_HP, CUBE_DMG, REGEN_DELAY, REGEN_RATE, POISON_DPS, BUSH_REVEAL_DIST,
  CLOAK_REVEAL_DIST, SPAWNS, BOT_NAMES, EVENT_EVERY, EVENT_WARN, LOW_HP, RUSH_TIME, COMEBACK_DMG,
  applyMove, moveCircle, inBush, attackDirs, poisonInset, moveStats, bountyGlow, pingInterval,
  layLowFactor, rng, inHub, HUB,
} from '../public/shared.js';
import { EVENTS, pickEvent } from '../public/events/index.js';
import { MODES } from './modes.js';
import { botInput } from './bots.js';

const r2 = (v) => Math.round(v * 100) / 100;
export const newId = () => 1 + Math.floor(Math.random() * 2 ** 30);

// fields carried across a zone handoff
const CARRY = ['id', 'name', 'brawler', 'x', 'y', 'mvx', 'mvy', 'hp', 'maxHp', 'cubes', 'ammo', 'reloadP', 'atkCd', 'superC',
  'lastCombat', 'stun', 'cloak', 'reveal', 'facing', 'lastSeq', 'kills', 'bounty', 'bountyEarned', 'bestBounty', 'bushT',
  'rush', 'rushArmed', 'spawnProt', 'score', 'crystals', 'sessionKills', 'pingT'];

export class Sim {
  constructor(o) {
    this.map = o.map;
    this.send = o.send || (() => {});
    this.modeKey = o.mode || 'showdown';
    this.mode = MODES[this.modeKey];
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
    this.seed = o.seed ?? 0;
    this.rand = rng((o.seed ?? Date.now()) ^ 0x5bd1e995);

    this.players = new Map();
    this.observers = new Map(); // key -> {x, y}
    this.bullets = [];
    this.cubes = [];
    this.crystals = [];
    this.crates = new Map(); // idx -> {hp, supply}
    for (const idx of this.tilesInBounds(CRATE, false)) this.crates.set(idx, { hp: CRATE_HP });
    this.tileDirty = [];
    this.crateDirty = [];
    this.fx = [];
    this.pings = [];
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
    this.nextEventAt = EVENT_EVERY;
    this.mods = {};
    this.botSpawnT = 0;
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
      const idx = y * gw + x;
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
  dmgMult(p) { return (1 + CUBE_DMG * p.cubes) * (p.hp / p.maxHp < LOW_HP ? COMEBACK_DMG : 1); }
  stats(p) { return moveStats(p.brawler, p.hp, p.maxHp, p.rush); }

  // ---------------------------------------------------------------- players
  addPlayer({ name, brawler, bot = false, state = null, connected = !bot }) {
    const b = BRAWLERS[brawler] ? brawler : 'volt';
    const p = {
      id: newId(), name, brawler: b, bot, wasBot: bot, connected,
      x: this.center.x, y: this.center.y, mvx: 0, mvy: 0, px: 0, py: 0, vx: 0, vy: 0,
      hp: BRAWLERS[b].hp, maxHp: BRAWLERS[b].hp, cubes: 0, alive: true,
      ammo: 3, reloadP: 0, atkCd: 0, burst: null, superC: 0, lastCombat: -99, stun: 0, dash: null, knock: null,
      cloak: 0, reveal: 0, poisonT: 0.5, facing: 0, queue: [], credits: 2, lastSeq: 0, kills: 0, rank: 0, ai: null,
      bounty: 0, bountyEarned: 0, bestBounty: 0, bushT: 0, lowF: 0, rush: 0, rushArmed: true, pingT: 0,
      spawnProt: 0, respawnT: 0, score: 0, crystals: 0, sessionKills: 0, hazAcc: 0, lastHitBy: 0,
    };
    if (state) for (const k of CARRY) if (state[k] !== undefined) p[k] = state[k];
    while (this.players.has(p.id)) p.id = newId();
    this.players.set(p.id, p);
    this.broadcast({ t: 'ro', add: { [p.id]: [p.name, p.brawler, p.wasBot ? 1 : 0] } });
    return p;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.broadcast({ t: 'ro', del: [id] });
    if (this.targetId === id) this.targetId = 0;
  }

  exportPlayer(p) {
    const s = {};
    for (const k of CARRY) s[k] = p[k];
    if (p.dash) s.dash = { vx: p.dash.vx, vy: p.dash.vy, t: p.dash.t };
    if (p.knock) s.knock = { ...p.knock };
    return s;
  }
  importPlayer(state, name, connected) {
    const p = this.addPlayer({ name: state.name || name, brawler: state.brawler, state, connected });
    if (state.dash) p.dash = { ...state.dash, hit: new Set() };
    if (state.knock) p.knock = { ...state.knock };
    return p;
  }

  rosterMsg() {
    const add = {};
    for (const p of this.players.values()) add[p.id] = [p.name, p.brawler, p.wasBot ? 1 : 0];
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
    if (this.phase !== 'lobby' || this.players.size >= MAX_PLAYERS) return null;
    const p = this.addPlayer({ name, brawler, bot: false });
    this.lobbyEnd = this.lobbyEnd == null ? this.clock + this.lobbyTime : Math.max(this.lobbyEnd, this.clock + 4);
    if (this.humans().length >= MAX_PLAYERS) this.lobbyEnd = this.clock;
    this.broadcastLobby();
    return p.id;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || this.mode.hub) { this.removePlayer(id); if (this.phase === 'lobby') this.broadcastLobby(); return; }
    p.connected = false;
    p.bot = true; // a bot takes over a disconnected player
  }

  broadcastLobby() {
    const msg = {
      t: 'lobby', mode: this.modeKey, world: this.map.world,
      players: this.humans().map((p) => [p.name, p.brawler]),
      startIn: this.lobbyEnd == null ? null : Math.max(0, this.lobbyEnd - this.clock), bots: this.fillBots,
    };
    for (const p of this.players.values()) if (p.connected) this.send(p.id, msg);
  }

  start() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    const target = this.fillBots || this.players.size < 2 ? MAX_PLAYERS : 0;
    while (this.players.size < target) this.addPlayer({ name: names.pop() || 'Bot', brawler: BRAWLER_IDS[Math.floor(Math.random() * 3)], bot: true });
    const spawns = SPAWNS.slice().sort(() => Math.random() - 0.5);
    let i = 0;
    for (const p of this.players.values()) {
      const s = spawns[i++ % spawns.length];
      p.x = p.px = s.x; p.y = p.py = s.y;
      p.facing = Math.atan2(this.center.y - s.y, this.center.x - s.x);
    }
    this.phase = 'play';
    this.time = 0;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.send(p.id, { t: 'start', you: p.id, mode: this.modeKey, world: this.map.world, seed: this.seed });
      this.send(p.id, this.rosterMsg());
    }
  }

  canSee(viewer, t) {
    if (viewer === t) return true;
    if (viewer.alive === false) return true;
    const d = Math.hypot(viewer.x - t.x, viewer.y - t.y);
    if (this.mods.vision && d > this.mods.vision) return false;
    if (t.cloak > 0 && d > CLOAK_REVEAL_DIST) return false;
    if (t.reveal <= 0 && d > BUSH_REVEAL_DIST && inBush(this.map, t.x, t.y)) return false;
    return true;
  }

  setTarget(p) {
    this.targetId = p.id;
    this.fx.push(['target', Math.round(p.x), Math.round(p.y), 0, p.id]);
  }

  // ---------------------------------------------------------------- combat
  tryAttack(p, ang) {
    const B = BRAWLERS[p.brawler], a = B.attack;
    if (!p.alive || p.ammo < 1 || p.atkCd > 0 || p.stun > 0 || p.burst || p.dash || this.isSafe(p.x, p.y)) return;
    p.ammo -= 1;
    p.atkCd = a.cooldown;
    p.reveal = 0.8;
    p.cloak = 0;
    p.spawnProt = 0;
    p.facing = ang;
    this.spawnShot(p, ang);
    if (a.kind === 'burst') p.burst = { left: a.count - 1, t: a.interval, ang };
  }

  spawnShot(p, ang) {
    const a = BRAWLERS[p.brawler].attack;
    const dmg = a.damage * this.dmgMult(p);
    const sp = a.speed * (this.mods.bulletSpeed || 1), range = a.range * (this.mods.bulletRange || 1);
    for (const d of attackDirs(p.brawler, ang)) {
      const c = Math.cos(d), s = Math.sin(d);
      this.bullets.push({
        id: this.nextEnt++, owner: p.id, oname: p.name, ozone: this.zone, kind: BRAWLER_IDS.indexOf(p.brawler),
        x: p.x + c * 16, y: p.y + s * 16, vx: c * sp, vy: s * sp, dist: 0, range, dmg, r: a.radius,
      });
    }
  }

  trySuper(p, ang) {
    if (!p.alive || p.superC < 1 || p.stun > 0 || p.dash || this.isSafe(p.x, p.y)) return;
    const s = BRAWLERS[p.brawler].super;
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
        if (e === p || !e.alive || e.spawnProt > 0 || this.isSafe(e.x, e.y)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= s.radius + this.stats(e).r) {
          e.stun = Math.max(e.stun, s.stun); e.dash = null; e.burst = null;
          this.damage(p, e, s.damage * mult, false);
        }
      }
    } else if (s.kind === 'cloak') {
      p.cloak = s.time; p.reveal = 0;
      this.fx.push(['cloak', r2(p.x), r2(p.y), 0, p.id]);
    }
  }

  // environmental damage (lava, fire): accumulated so damage numbers stay readable
  hazard(p, cause, amount) {
    if (!p.alive || p.spawnProt > 0 || this.isSafe(p.x, p.y)) return;
    p.hazAcc += amount;
    if (p.hazAcc >= 200) { const d = p.hazAcc; p.hazAcc = 0; this.damage(null, p, d, false, cause); }
  }

  // src: local player | {remote:true, id, name, zone} | null
  damage(src, t, amount, charge, cause = 'poison') {
    if (!t.alive || t.spawnProt > 0 || this.isSafe(t.x, t.y)) return;
    amount = Math.round(amount);
    t.hp -= amount;
    t.lastCombat = this.time;
    t.reveal = Math.max(t.reveal, 0.5);
    this.fx.push(['dmg', Math.round(t.x), Math.round(t.y), amount, t.id]);
    if (src) {
      t.lastHitBy = src.id;
      if (src.remote) { if (charge) this.hooks.credit?.(src.zone, { id: src.id, charge: 1 }); }
      else {
        src.lastCombat = this.time;
        if (charge && src.alive) src.superC = Math.min(1, src.superC + 1 / BRAWLERS[src.brawler].superHits);
      }
    }
    if (t.hp <= 0) this.kill(t, src, cause);
  }

  gainBounty(p, gain) {
    p.bounty += gain; p.bountyEarned += gain; p.kills++; p.sessionKills++;
    p.bestBounty = Math.max(p.bestBounty, p.bounty);
  }

  kill(t, src, cause) {
    t.alive = false;
    t.hp = 0;
    t.dash = t.knock = t.burst = null;
    t.rank = this.aliveCount() + 1;
    const stolen = t.bounty;
    if (src && src !== t) {
      if (src.remote) this.hooks.credit?.(src.zone, { id: src.id, kill: 1, gain: 1 + stolen });
      else this.gainBounty(src, 1 + stolen);
    }
    t.bounty = 0; t.bushT = 0; t.lowF = 0;
    this.mode.onKill?.(this, t, src && !src.remote ? src : null);
    const n = Math.max(1, t.cubes);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, d = n > 1 ? 30 : 0; this.dropCube(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d); }
    for (let i = 0; i < t.crystals; i++) { const a = this.rand() * Math.PI * 2, d = 20 + this.rand() * 50; this.dropCrystal(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d); }
    t.crystals = 0;
    this.fx.push(['die', Math.round(t.x), Math.round(t.y), BRAWLER_IDS.indexOf(t.brawler), t.id]);
    const causeName = { poison: 'Poison', lava: 'Lava', fire: 'Wildfire' }[cause] || 'The Wild';
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
    if (c.charge && p.alive) p.superC = Math.min(1, p.superC + 1 / BRAWLERS[p.brawler].superHits);
    if (c.kill) this.gainBounty(p, c.gain || 1);
  }

  respawn(p) {
    const B = BRAWLERS[p.brawler];
    Object.assign(p, {
      alive: true, hp: B.hp, maxHp: B.hp, cubes: 0, ammo: 3, reloadP: 0, stun: 0, cloak: 0, dash: null, knock: null, burst: null,
      spawnProt: 2, respawnT: 0, mvx: 0, mvy: 0, rushArmed: true, rush: 0, lastCombat: -99, poisonT: 0.5, bushT: 0,
    });
    let pt;
    if (this.hub && !p.bot) {
      // somewhere in our slice of the hub
      for (let i = 0; i < 30; i++) {
        const a = this.rand() * Math.PI * 2, d = this.rand() * (HUB.r - 60);
        const x = HUB.x + Math.cos(a) * d, y = HUB.y + Math.sin(a) * d;
        if (this.inBounds(x, y, -30)) { pt = { x, y }; break; }
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
    if (!BRAWLERS[brawler] || !p.alive || !this.isSafe(p.x, p.y) || p.brawler === brawler) return;
    p.brawler = brawler;
    p.hp = p.maxHp = BRAWLERS[brawler].hp + p.cubes * CUBE_HP;
    p.ammo = 3; p.superC = 0;
    this.broadcast({ t: 'ro', add: { [p.id]: [p.name, p.brawler, 0] } });
  }

  dropCube(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const t = this.map.t[ty * this.map.gw + tx];
    if (t !== EMPTY && t !== BUSH) { x = tx * TILE + TILE / 2; y = ty * TILE + TILE / 2; }
    this.cubes.push({ id: this.nextEnt++, x, y });
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
      const x = (idx % this.map.gw) * TILE + TILE / 2, y = Math.floor(idx / this.map.gw) * TILE + TILE / 2;
      this.fx.push(['crate', x, y, c.supply ? 1 : 0, 0]);
      if (c.supply) for (let i = 0; i < 3; i++) this.dropCube(x + Math.cos(i * 2.1) * 30, y + Math.sin(i * 2.1) * 30);
      else this.dropCube(x, y);
    } else this.crateDirty.push([idx, c.supply ? -Math.round(c.hp) : Math.round(c.hp)]);
  }

  processInput(p, inp) {
    if (inp.s) p.lastSeq = inp.s;
    if (!p.alive) return;
    const st = this.stats(p);
    if (p.stun <= 0 && !p.dash && !p.knock) applyMove(this.map, p, inp.mx, inp.my, st.speed, st.r, this.mods);
    if (Math.hypot(inp.ax, inp.ay) > 0.2) p.facing = Math.atan2(inp.ay, inp.ax);
    else if (Math.hypot(inp.mx, inp.my) > 0.2) p.facing = Math.atan2(inp.my, inp.mx);
    if (inp.f != null) this.tryAttack(p, inp.f);
    if (inp.u != null) this.trySuper(p, inp.u);
  }

  input(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    if (m.t === 'pick') return this.pick(p, m.brawler);
    if (m.t !== 'in') return;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    const ang = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    p.queue.push({ s: m.s | 0, mx: num(m.mx), my: num(m.my), ax: num(m.ax), ay: num(m.ay), f: ang(m.f), u: ang(m.u) });
    if (p.queue.length > 12) p.queue.splice(0, p.queue.length - 12);
  }

  // ---------------------------------------------------------------- events
  updateEvent() {
    if (!this.eventsOn) return;
    const e = this.event;
    if (!e) {
      if (this.time >= this.nextEventAt - EVENT_WARN) {
        const id = pickEvent(this.rand, this.lastEvent);
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
  tick() {
    this.clock += DT;
    if (this.phase === 'lobby') {
      if (this.lobbyEnd != null && this.clock >= this.lobbyEnd && this.humans().length > 0) this.start();
      else if (Math.round(this.clock / DT) % 10 === 0) this.broadcastLobby();
      return;
    }
    if (this.phase === 'end') return;

    this.time += DT;
    this.tickN++;
    this.zoneInset = this.mode.poison ? poisonInset(this.time) : 0;
    this.updateEvent();
    this.mode.tick?.(this);
    const mods = this.mods;

    for (const p of this.players.values()) {
      if (!p.alive) {
        p.queue.length = 0;
        if (p.respawnT > 0) { p.respawnT -= DT; if (p.respawnT <= 0) this.respawn(p); }
        continue;
      }
      p.px = p.x; p.py = p.y;
      p.atkCd -= DT; p.stun -= DT; p.cloak -= DT; p.reveal -= DT; p.rush -= DT; p.spawnProt -= DT;

      if (p.bot) p.queue = [botInput(this, p)];
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
        p.reloadP += DT / B.reload;
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

      const z = this.zoneInset;
      if (z > 0 && (p.x < z || p.y < z || p.x > this.bounds.x1 - z || p.y > this.bounds.y1 - z)) {
        p.poisonT -= DT;
        if (p.poisonT <= 0) { p.poisonT = 1; this.damage(null, p, POISON_DPS, false, 'poison'); if (!p.alive) continue; }
      } else p.poisonT = 0.5;

      const pr = this.stats(p).r + 20;
      for (let i = this.cubes.length - 1; i >= 0; i--) {
        const c = this.cubes[i];
        if (Math.hypot(c.x - p.x, c.y - p.y) < pr) {
          this.cubes.splice(i, 1);
          p.cubes++; p.maxHp += CUBE_HP; p.hp += CUBE_HP;
          this.fx.push(['cube', Math.round(p.x), Math.round(p.y), p.cubes, p.id]);
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
    if (this.hooks.handoff) this.checkHandoffs();
    if (this.hub) this.maintainBots();
    this.sendSnapshots();
    this.fx = []; this.tileDirty = []; this.crateDirty = []; this.pings = [];

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
      if (e === p || !e.alive || p.dash.hit.has(e.id) || e.spawnProt > 0 || this.isSafe(e.x, e.y)) continue;
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

  addBullets(list) { for (const b of list) this.bullets.push({ ...b, id: this.nextEnt++ }); }

  updateBullets() {
    const out = [], leaving = [];
    const bw = this.mods.bulletWind || 0;
    const wl = Math.hypot(this.mods.wx || 0, this.mods.wy || 0) || 1;
    const wdx = bw ? ((this.mods.wx || 0) / wl) * bw : 0, wdy = bw ? ((this.mods.wy || 0) / wl) * bw : 0;
    for (const b of this.bullets) {
      if (bw) { b.vx += wdx * DT; b.vy += wdy * DT; }
      const step = Math.hypot(b.vx, b.vy) * DT;
      const n = Math.max(1, Math.ceil(step / 16));
      let dead = false;
      for (let i = 0; i < n && !dead; i++) {
        b.x += (b.vx * DT) / n; b.y += (b.vy * DT) / n; b.dist += step / n;
        const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
        const idx = ty * this.map.gw + tx;
        const t = tx < 0 || ty < 0 || tx >= this.map.gw || ty >= this.map.gh ? WALL : this.map.t[idx];
        if (t === WALL) { dead = true; this.fx.push(['wall', Math.round(b.x), Math.round(b.y), b.kind, 0]); break; }
        if (t === CRATE) { this.hitCrate(idx, b.dmg); dead = true; this.fx.push(['hit', Math.round(b.x), Math.round(b.y), b.kind, 0]); break; }
        if (this.isSafe(b.x, b.y)) { dead = true; break; }
        for (const p of this.players.values()) {
          if (!p.alive || p.id === b.owner) continue;
          const rr = this.stats(p).r + b.r;
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr) {
            this.fx.push(['hit', Math.round(b.x), Math.round(b.y), b.kind, p.id]);
            const src = this.players.get(b.owner) || (b.ozone && b.ozone !== this.zone ? { remote: true, id: b.owner, name: b.oname, zone: b.ozone } : null);
            this.damage(src, p, b.dmg, true);
            dead = true;
            break;
          }
        }
        if (b.dist >= b.range) dead = true;
      }
      if (dead) continue;
      if (!this.inBounds(b.x, b.y)) leaving.push(b); else out.push(b);
    }
    this.bullets = out;
    if (leaving.length && this.hooks.bulletsOut) this.hooks.bulletsOut(leaving);
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
    const p = this.addPlayer({ name, brawler: BRAWLER_IDS[Math.floor(this.rand() * 3)], bot: true });
    p.alive = false;
    this.respawn(p);
  }

  sendSnapshots() {
    const bullets = this.bullets.map((b) => [b.id, Math.round(b.x), Math.round(b.y), b.owner, b.kind]);
    const cubes = this.cubes.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]);
    const crystals = this.crystals.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]);
    const alive = this.aliveCount();
    let top = null;
    for (const p of this.players.values()) if (p.bounty > 0 && (!top || p.bounty > top.bounty)) top = p;
    const common = {
      t: 's', zone: this.zone, n: this.tickN, tm: r2(this.time), b: bullets, cu: cubes, cy: crystals,
      td: this.tileDirty, ch: this.crateDirty, z: Math.round(this.zoneInset), al: alive, fx: this.fx, pg: this.pings,
      top: top ? [top.id, top.name, top.bounty] : null, ev: this.event ? [this.event.id, this.event.ph, r2(this.event.t)] : null,
      md: this.mode.hud?.(this) || null,
    };
    if (this.mode.respawn && this.tickN % 10 === 0) {
      common.lb = this.mode.rank(this).slice(0, 3).map((p) => [p.id, p.name, this.mode.score(p)]);
    }
    if (this.hub && this.tickN % 40 === 0) common.on = this.humans().length;
    const rows = (v) => {
      const others = [];
      for (const p of this.players.values()) {
        if (p === v || !p.alive || !this.canSee(v, p)) continue;
        if (Math.abs(p.x - v.x) > 1500 || Math.abs(p.y - v.y) > 1100) continue;
        others.push([p.id, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.maxHp, Math.round(p.facing * 100) / 100,
          this.flags(p), p.cubes, p.bounty, this.glow(p), p.crystals]);
      }
      return others;
    };
    for (const v of this.players.values()) {
      if (!v.connected) continue;
      this.send(v.id, {
        ...common, ack: v.lastSeq, p: rows(v),
        me: {
          x: r2(v.x), y: r2(v.y), mvx: r2(v.mvx), mvy: r2(v.mvy), hp: Math.round(v.hp), mh: v.maxHp, am: r2(v.ammo + v.reloadP),
          sc: r2(v.superC), cu: v.cubes, f: this.flags(v), al: v.alive ? 1 : 0, fo: v.dash || v.knock || v.stun > 0 ? 1 : 0,
          cl: r2(Math.max(0, v.cloak)), bt: v.bounty, lo: r2(v.lowF), bt5: r2(Math.min(v.bushT, 5)), rs: r2(Math.max(0, v.rush)),
          rt: r2(Math.max(0, v.respawnT)), cr: v.crystals, scr: Math.floor(this.mode.score ? this.mode.score(v) : 0),
          k: v.kills, be: v.bountyEarned, sk: v.sessionKills, bb: v.bestBounty, gl: this.glow(v), id: v.id, br: v.brawler,
        },
      });
    }
    if (this.observers.size && this.tickN % 2 === 0) {
      for (const [k, o] of this.observers) this.send(k, { ...common, p: rows({ x: o.x, y: o.y, alive: true }) });
    }
  }

  glow(p) { return Math.round(Math.max(bountyGlow(p.bounty), this.targetId === p.id ? 1 : 0) * (1 - 0.85 * p.lowF) * 100); }

  flags(p) {
    return (inBush(this.map, p.x, p.y) ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.cloak > 0 ? 4 : 0) | (p.dash ? 8 : 0)
      | (p.spawnProt > 0 ? 16 : 0) | (this.targetId === p.id ? 32 : 0) | (p.rush > 0 ? 64 : 0) | (p.lowF > 0 ? 128 : 0);
  }

  finish() {
    this.phase = 'end';
    const ranked = this.mode.rank(this);
    ranked.forEach((p, i) => { p.rank = i + 1; });
    const score = this.mode.score || (() => 0);
    const results = ranked.map((p) => [p.name, p.brawler, p.rank, p.kills, p.wasBot ? 1 : 0, p.id, p.bountyEarned, Math.floor(score(p))]);
    const winner = ranked[0];
    for (const p of this.players.values()) {
      if (p.connected) this.send(p.id, { t: 'end', mode: this.modeKey, rank: p.rank, kills: p.kills, bounty: p.bountyEarned, winner: winner ? winner.name : null, results });
    }
  }
}
