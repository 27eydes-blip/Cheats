// Server-authoritative match simulation. Pure JS (no Workers APIs) so it can be
// unit-tested in Node. The Durable Object owns sockets and calls tick() at 20 Hz.
import {
  BRAWLERS, BRAWLER_IDS, DT, MAP_SIZE, TILE, GRID, PLAYER_R, MAX_PLAYERS, EMPTY, CRATE,
  CRATE_HP, CUBE_HP, CUBE_DMG, REGEN_DELAY, REGEN_RATE, POISON_DPS, BUSH_REVEAL_DIST,
  CLOAK_REVEAL_DIST, SPAWNS, BOT_NAMES, generateMap, applyMove, moveCircle, inBush,
  attackDirs, poisonInset,
} from '../public/shared.js';
import { botInput } from './bots.js';

const r2 = (v) => Math.round(v * 100) / 100;

export class Match {
  constructor({ seed, lobbyTime = 8, send = () => {}, fillBots = true }) {
    this.fillBots = fillBots;
    this.seed = seed;
    this.tiles = generateMap(seed);
    this.send = send;
    this.lobbyTime = lobbyTime;
    this.players = new Map();
    this.bullets = [];
    this.cubes = [];
    this.crates = new Map();
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === CRATE) this.crates.set(i, CRATE_HP);
    this.crateDirty = [];
    this.fx = [];
    this.nextId = 1;
    this.nextEnt = 1;
    this.phase = 'lobby';
    this.clock = 0; // seconds since creation
    this.lobbyEnd = null;
    this.time = 0; // seconds since match start
    this.tickN = 0;
    this.zoneInset = 0;
    this.endAt = null;
  }

  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  aliveCount() { let n = 0; for (const p of this.players.values()) if (p.alive) n++; return n; }

  makePlayer(name, brawler, bot) {
    const b = BRAWLERS[brawler];
    const id = this.nextId++;
    const p = {
      id, name, brawler, bot, wasBot: bot, connected: !bot,
      x: MAP_SIZE / 2, y: MAP_SIZE / 2, px: 0, py: 0, vx: 0, vy: 0,
      hp: b.hp, maxHp: b.hp, cubes: 0, alive: true,
      ammo: 3, reloadP: 0, atkCd: 0, burst: null, superC: 0,
      lastCombat: -99, stun: 0, dash: null, knock: null, cloak: 0, reveal: 0, poisonT: 0.5,
      facing: 0, queue: [], credits: 2, lastSeq: 0, kills: 0, rank: 0, ai: null,
    };
    this.players.set(id, p);
    return p;
  }

  join(name, brawler) {
    if (this.phase !== 'lobby' || this.players.size >= MAX_PLAYERS) return null;
    const p = this.makePlayer(name, BRAWLERS[brawler] ? brawler : 'volt', false);
    this.lobbyEnd = this.lobbyEnd == null ? this.clock + this.lobbyTime : Math.max(this.lobbyEnd, this.clock + 4);
    if (this.humans().length >= MAX_PLAYERS) this.lobbyEnd = this.clock;
    this.broadcastLobby();
    return p.id;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') { this.players.delete(id); this.broadcastLobby(); return; }
    p.connected = false;
    p.bot = true; // a bot takes over a disconnected player
  }

  input(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot || m.t !== 'in') return;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    const ang = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    p.queue.push({ s: m.s | 0, mx: num(m.mx), my: num(m.my), ax: num(m.ax), ay: num(m.ay), f: ang(m.f), u: ang(m.u) });
    if (p.queue.length > 10) p.queue.splice(0, p.queue.length - 10);
  }

  broadcastLobby() {
    const msg = {
      t: 'lobby',
      players: this.humans().map((p) => [p.name, p.brawler]),
      startIn: this.lobbyEnd == null ? null : Math.max(0, this.lobbyEnd - this.clock),
    };
    for (const p of this.players.values()) if (p.connected) this.send(p.id, msg);
  }

  start() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    const target = this.fillBots || this.players.size < 2 ? MAX_PLAYERS : 0;
    while (this.players.size < target) {
      this.makePlayer(names.pop() || 'Bot', BRAWLER_IDS[Math.floor(Math.random() * BRAWLER_IDS.length)], true);
    }
    const spawns = SPAWNS.slice().sort(() => Math.random() - 0.5);
    let i = 0;
    for (const p of this.players.values()) {
      const s = spawns[i++ % spawns.length];
      p.x = p.px = s.x; p.y = p.py = s.y;
      p.facing = Math.atan2(MAP_SIZE / 2 - s.y, MAP_SIZE / 2 - s.x);
    }
    this.phase = 'play';
    this.time = 0;
    const roster = {};
    for (const p of this.players.values()) roster[p.id] = [p.name, p.brawler, p.bot ? 1 : 0];
    for (const p of this.players.values()) {
      if (p.connected) this.send(p.id, { t: 'start', you: p.id, roster, seed: this.seed });
    }
  }

  canSee(viewer, t) {
    if (viewer === t) return true;
    if (!viewer.alive) return true;
    const d = Math.hypot(viewer.x - t.x, viewer.y - t.y);
    if (t.cloak > 0 && d > CLOAK_REVEAL_DIST) return false;
    if (t.reveal <= 0 && d > BUSH_REVEAL_DIST && inBush(this.tiles, t.x, t.y)) return false;
    return true;
  }

  // ---------------- combat ----------------
  tryAttack(p, ang) {
    const B = BRAWLERS[p.brawler], a = B.attack;
    if (!p.alive || p.ammo < 1 || p.atkCd > 0 || p.stun > 0 || p.burst || p.dash) return;
    p.ammo -= 1;
    p.atkCd = a.cooldown;
    p.reveal = 0.8;
    p.cloak = 0;
    p.facing = ang;
    this.spawnShot(p, ang);
    if (a.kind === 'burst') p.burst = { left: a.count - 1, t: a.interval, ang };
  }

  spawnShot(p, ang) {
    const a = BRAWLERS[p.brawler].attack;
    const dmg = a.damage * (1 + CUBE_DMG * p.cubes);
    for (const d of attackDirs(p.brawler, ang)) {
      const c = Math.cos(d), s = Math.sin(d);
      this.bullets.push({
        id: this.nextEnt++, owner: p.id, kind: BRAWLER_IDS.indexOf(p.brawler),
        x: p.x + c * (PLAYER_R * 0.6), y: p.y + s * (PLAYER_R * 0.6),
        vx: c * a.speed, vy: s * a.speed, dist: 0, range: a.range, dmg, r: a.radius,
      });
    }
  }

  trySuper(p, ang) {
    if (!p.alive || p.superC < 1 || p.stun > 0 || p.dash) return;
    const B = BRAWLERS[p.brawler], s = B.super;
    p.superC = 0;
    p.reveal = 0.8;
    const mult = 1 + CUBE_DMG * p.cubes;
    if (s.kind === 'dash') {
      p.cloak = 0;
      p.facing = ang;
      p.burst = null;
      const sp = s.dist / s.time;
      p.dash = { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: s.time, hit: new Set() };
      this.fx.push(['dash', r2(p.x), r2(p.y), r2(ang), p.id]);
    } else if (s.kind === 'slam') {
      p.cloak = 0;
      this.fx.push(['slam', r2(p.x), r2(p.y), s.radius, p.id]);
      for (const e of this.players.values()) {
        if (e === p || !e.alive) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= s.radius + PLAYER_R) {
          e.stun = Math.max(e.stun, s.stun);
          e.dash = null; e.burst = null;
          this.damage(p, e, s.damage * mult, false);
        }
      }
    } else if (s.kind === 'cloak') {
      p.cloak = s.time;
      p.reveal = 0;
      this.fx.push(['cloak', r2(p.x), r2(p.y), 0, p.id]);
    }
  }

  damage(src, t, amount, charge) {
    if (!t.alive) return;
    amount = Math.round(amount);
    t.hp -= amount;
    t.lastCombat = this.time;
    t.reveal = Math.max(t.reveal, 0.5);
    this.fx.push(['dmg', Math.round(t.x), Math.round(t.y), amount, t.id]);
    if (src) {
      t.lastHitBy = src.id;
      src.lastCombat = this.time;
      if (charge && src.alive) src.superC = Math.min(1, src.superC + 1 / BRAWLERS[src.brawler].superHits);
    }
    if (t.hp <= 0) this.kill(t, src);
  }

  kill(t, src) {
    t.alive = false;
    t.hp = 0;
    t.dash = t.knock = t.burst = null;
    t.rank = this.aliveCount() + 1;
    if (src && src !== t) src.kills++;
    const n = Math.max(1, t.cubes);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, d = n > 1 ? 30 : 0;
      this.dropCube(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
    }
    this.fx.push(['die', Math.round(t.x), Math.round(t.y), BRAWLER_IDS.indexOf(t.brawler), t.id]);
    const feed = { t: 'kill', k: src ? src.name : 'Poison', kb: src ? src.brawler : null, v: t.name, vb: t.brawler, kid: src ? src.id : 0, vid: t.id };
    for (const p of this.players.values()) if (p.connected) this.send(p.id, feed);
    if (t.connected) this.send(t.id, { t: 'dead', rank: t.rank, killer: src ? src.name : 'the Poison', killerId: src ? src.id : 0, kills: t.kills });
  }

  dropCube(x, y) {
    // keep cubes out of walls
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const t = this.tiles[ty * GRID + tx];
    if (t !== EMPTY && t !== 2) { x = tx * TILE + TILE / 2; y = ty * TILE + TILE / 2; }
    this.cubes.push({ id: this.nextEnt++, x, y });
  }

  hitCrate(idx, dmg) {
    const hp = (this.crates.get(idx) ?? 0) - dmg;
    if (hp <= 0) {
      this.crates.delete(idx);
      this.tiles[idx] = EMPTY;
      this.crateDirty.push([idx, 0]);
      const x = (idx % GRID) * TILE + TILE / 2, y = Math.floor(idx / GRID) * TILE + TILE / 2;
      this.fx.push(['crate', x, y, 0, 0]);
      this.dropCube(x, y);
    } else {
      this.crates.set(idx, hp);
      this.crateDirty.push([idx, Math.round(hp)]);
    }
  }

  processInput(p, inp) {
    if (inp.s) p.lastSeq = inp.s;
    if (!p.alive) return;
    if (p.stun <= 0 && !p.dash && !p.knock) applyMove(this.tiles, p, inp.mx, inp.my, BRAWLERS[p.brawler].speed);
    if (Math.hypot(inp.ax, inp.ay) > 0.2) p.facing = Math.atan2(inp.ay, inp.ax);
    else if (Math.hypot(inp.mx, inp.my) > 0.2) p.facing = Math.atan2(inp.my, inp.mx);
    if (inp.f != null) this.tryAttack(p, inp.f);
    if (inp.u != null) this.trySuper(p, inp.u);
  }

  // ---------------- tick ----------------
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
    this.zoneInset = poisonInset(this.time);

    for (const p of this.players.values()) {
      if (!p.alive) { p.queue.length = 0; continue; }
      p.px = p.x; p.py = p.y;
      p.atkCd -= DT; p.stun -= DT; p.cloak -= DT; p.reveal -= DT;

      if (p.bot) p.queue = [botInput(this, p)];
      p.credits = Math.min(p.credits + 1, 4);
      while (p.queue.length && p.credits >= 1) {
        p.credits -= 1;
        this.processInput(p, p.queue.shift());
        if (!p.alive) break;
      }
      if (!p.alive) continue;

      if (p.burst) {
        p.burst.t -= DT;
        if (p.burst.t <= 0) {
          this.spawnShot(p, p.burst.ang);
          p.burst.left--;
          p.burst.t += BRAWLERS[p.brawler].attack.interval;
          if (p.burst.left <= 0) p.burst = null;
        }
      }
      if (p.dash) this.updateDash(p);
      if (p.knock) {
        moveCircle(this.tiles, p, p.knock.vx * DT, p.knock.vy * DT);
        p.knock.t -= DT;
        if (p.knock.t <= 0) p.knock = null;
      }

      const B = BRAWLERS[p.brawler];
      if (p.ammo < 3) {
        p.reloadP += DT / B.reload;
        if (p.reloadP >= 1) { p.ammo++; p.reloadP = p.ammo >= 3 ? 0 : p.reloadP - 1; }
      }
      if (this.time - p.lastCombat > REGEN_DELAY && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * REGEN_RATE * DT);
      }
      // poison
      const z = this.zoneInset;
      if (z > 0 && (p.x < z || p.y < z || p.x > MAP_SIZE - z || p.y > MAP_SIZE - z)) {
        p.poisonT -= DT;
        if (p.poisonT <= 0) { p.poisonT = 1; this.damage(null, p, POISON_DPS, false); if (!p.alive) continue; }
      } else p.poisonT = 0.5;
      // power cubes
      for (let i = this.cubes.length - 1; i >= 0; i--) {
        const c = this.cubes[i];
        if (Math.hypot(c.x - p.x, c.y - p.y) < PLAYER_R + 20) {
          this.cubes.splice(i, 1);
          p.cubes++;
          p.maxHp += CUBE_HP;
          p.hp += CUBE_HP;
          this.fx.push(['cube', Math.round(p.x), Math.round(p.y), p.cubes, p.id]);
        }
      }
      p.vx = (p.x - p.px) / DT; p.vy = (p.y - p.py) / DT;
    }

    this.updateBullets();
    this.sendSnapshots();
    this.fx = [];
    this.crateDirty = [];

    if (this.aliveCount() <= 1) this.finish();
  }

  updateDash(p) {
    const s = BRAWLERS[p.brawler].super;
    const mult = 1 + CUBE_DMG * p.cubes;
    moveCircle(this.tiles, p, p.dash.vx * DT, p.dash.vy * DT);
    const sp = Math.hypot(p.dash.vx, p.dash.vy);
    const nx = p.dash.vx / sp, ny = p.dash.vy / sp;
    for (const e of this.players.values()) {
      if (e === p || !e.alive || p.dash.hit.has(e.id)) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < s.radius + PLAYER_R) {
        p.dash.hit.add(e.id);
        // knock away from the dash line, mostly forward
        let kx = e.x - p.x, ky = e.y - p.y;
        const kl = Math.hypot(kx, ky) || 1;
        kx = nx * 0.6 + (kx / kl) * 0.4; ky = ny * 0.6 + (ky / kl) * 0.4;
        const kn = Math.hypot(kx, ky) || 1;
        e.knock = { vx: (kx / kn) * s.knock / 0.2, vy: (ky / kn) * s.knock / 0.2, t: 0.2 };
        e.dash = null; e.burst = null;
        e.stun = Math.max(e.stun, 0.3);
        this.damage(p, e, s.damage * mult, false);
      }
    }
    p.dash && (p.dash.t -= DT);
    if (p.dash && p.dash.t <= 0) p.dash = null;
  }

  updateBullets() {
    const out = [];
    for (const b of this.bullets) {
      const step = Math.hypot(b.vx, b.vy) * DT;
      const n = Math.max(1, Math.ceil(step / 16));
      let dead = false;
      for (let i = 0; i < n && !dead; i++) {
        b.x += (b.vx * DT) / n; b.y += (b.vy * DT) / n; b.dist += step / n;
        const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
        const idx = ty * GRID + tx;
        const t = tx < 0 || ty < 0 || tx >= GRID || ty >= GRID ? 1 : this.tiles[idx];
        if (t === 1) { dead = true; this.fx.push(['wall', Math.round(b.x), Math.round(b.y), b.kind, 0]); break; }
        if (t === CRATE) { this.hitCrate(idx, b.dmg); dead = true; this.fx.push(['hit', Math.round(b.x), Math.round(b.y), b.kind, 0]); break; }
        for (const p of this.players.values()) {
          if (!p.alive || p.id === b.owner) continue;
          const rr = PLAYER_R + b.r;
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr) {
            this.fx.push(['hit', Math.round(b.x), Math.round(b.y), b.kind, p.id]);
            this.damage(this.players.get(b.owner), p, b.dmg, true);
            dead = true;
            break;
          }
        }
        if (b.dist >= b.range) dead = true;
      }
      if (!dead) out.push(b);
    }
    this.bullets = out;
  }

  sendSnapshots() {
    const bullets = this.bullets.map((b) => [b.id, Math.round(b.x), Math.round(b.y), b.owner, b.kind]);
    const cubes = this.cubes.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]);
    const alive = this.aliveCount();
    for (const v of this.players.values()) {
      if (!v.connected) continue;
      const others = [];
      for (const p of this.players.values()) {
        if (p === v || !p.alive || !this.canSee(v, p)) continue;
        others.push([p.id, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.maxHp, Math.round(p.facing * 100) / 100, this.flags(p), p.cubes]);
      }
      this.send(v.id, {
        t: 's', n: this.tickN, tm: r2(this.time), ack: v.lastSeq,
        me: {
          x: r2(v.x), y: r2(v.y), hp: Math.round(v.hp), mh: v.maxHp, am: r2(v.ammo + v.reloadP),
          sc: r2(v.superC), cu: v.cubes, f: this.flags(v), al: v.alive ? 1 : 0,
          fo: v.dash || v.knock || v.stun > 0 ? 1 : 0, cd: r2(Math.max(0, v.atkCd)), cl: r2(Math.max(0, v.cloak)),
        },
        p: others, b: bullets, cu: cubes, cr: this.crateDirty, z: Math.round(this.zoneInset), al: alive, fx: this.fx,
      });
    }
  }

  flags(p) {
    return (inBush(this.tiles, p.x, p.y) ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.cloak > 0 ? 4 : 0) | (p.dash ? 8 : 0);
  }

  finish() {
    this.phase = 'end';
    const winner = [...this.players.values()].find((p) => p.alive);
    if (winner) winner.rank = 1;
    const results = [...this.players.values()]
      .sort((a, b) => a.rank - b.rank)
      .map((p) => [p.name, p.brawler, p.rank, p.kills, p.wasBot ? 1 : 0, p.id]);
    for (const p of this.players.values()) {
      if (p.connected) this.send(p.id, { t: 'end', rank: p.rank, kills: p.kills, winner: winner ? winner.name : null, results });
    }
  }

}
