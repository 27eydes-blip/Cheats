// Client-side projectiles + object pools.
// The server sends each projectile ONCE ("fired from x,y with velocity v at tick n", plus "ended at
// x,y on tick m"). Clients simulate it with the shared stepShot, so what you see moves exactly like
// the server's copy without per-tick positions on the wire. Objects are pooled (no garbage per shot).
import { stepShot } from './weapons.js';

export class Pool {
  constructor(make) { this.make = make; this.free = []; }
  get() { return this.free.pop() || this.make(); }
  put(o) { if (this.free.length < 512) this.free.push(o); }
}

const newShot = () => ({ key: '', id: 0, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, dist: 0, range: 0, kind: 0, t0: 0, steps: 0, owner: 0, fuse: null, bounce: 0, endN: -1, ex: 0, ey: 0, dead: false, ang: 0 });

export class ShotSim {
  constructor() { this.live = new Map(); this.pool = new Pool(newShot); this.out = []; }
  clear() { for (const b of this.live.values()) this.pool.put(b); this.live.clear(); }
  // row: [id, x, y, vx, vy, range, kind, tick, owner, fuse]
  fired(connKey, row) {
    const key = connKey + ':' + row[0];
    if (this.live.has(key)) return null;
    const b = this.pool.get();
    b.key = key; b.ck = connKey; b.id = row[0]; b.x = b.px = row[1]; b.y = b.py = row[2]; b.vx = row[3]; b.vy = row[4];
    b.dist = 0; b.range = row[5]; b.kind = row[6]; b.t0 = row[7]; b.owner = row[8]; b.steps = 0;
    b.fuse = row[9] ? row[9] : null; b.bounce = row[9] ? 1 : 0; b.endN = -1; b.dead = false; b.ang = Math.atan2(b.vy, b.vx);
    this.live.set(key, b);
    return b;
  }
  ended(connKey, row, n) { const b = this.live.get(connKey + ':' + row[0]); if (b) { b.endN = n; b.ex = row[1]; b.ey = row[2]; } }
  // advance every projectile to render tick rt (fractional) and return what to draw
  sample(rtOf, map, mods, onEnd) {
    const out = this.out; out.length = 0;
    for (const [key, b] of this.live) {
      const rt = typeof rtOf === 'number' ? rtOf : rtOf(b.ck);
      if (rt == null) continue;
      if (b.endN >= 0 && rt >= b.endN) { onEnd && onEnd(b, b.ex, b.ey, true); this.live.delete(key); this.pool.put(b); continue; }
      // positions P_k are at tick t0+k; to draw tick rt we need P_floor and the next one to lerp toward
      const want = Math.floor(rt - b.t0) + 1;
      while (!b.dead && b.steps < want) {
        b.px = b.x; b.py = b.y;
        const why = stepShot(map, b, mods, null);
        b.steps++;
        if (why) { b.dead = true; onEnd && onEnd(b, b.x, b.y, false, why); }
      }
      if (b.dead) { if (b.endN < 0 && want > b.steps + 40) { this.live.delete(key); this.pool.put(b); } continue; } // ended on our side: wait for the server's word (or drop it)
      if (want <= 0) continue; // not fired yet on our timeline
      const f = Math.max(0, Math.min(1, rt - b.t0 - b.steps + 1));
      const x = b.px + (b.x - b.px) * f, y = b.py + (b.y - b.py) * f;
      if (b.vx || b.vy) b.ang = Math.atan2(b.vy, b.vx);
      b.drawX = x; b.drawY = y; out.push(b);
    }
    return out;
  }
}

// a list of pooled objects (particles, damage numbers): add() reuses a dead object;
// update(fn) keeps the ones fn returns true for and recycles the rest (no per-frame garbage)
export class PList {
  // cap: at most this many alive at once; adding past it recycles the oldest (keeps the worst case cheap)
  constructor(reset, cap = Infinity) { this.items = []; this.pool = new Pool(() => ({})); this.reset = reset; this.cap = cap; }
  add() {
    if (this.items.length >= this.cap) { const o = this.items.shift(); this.reset(o); this.items.push(o); return o; }
    const o = this.pool.get(); this.reset(o); this.items.push(o); return o;
  }
  push(src) { return Object.assign(this.add(), src); } // (rare effects)
  update(keep) {
    const it = this.items; let w = 0;
    for (let i = 0; i < it.length; i++) { const o = it[i]; if (keep(o)) it[w++] = o; else this.pool.put(o); }
    it.length = w;
  }
  clear() { for (const o of this.items) this.pool.put(o); this.items.length = 0; }
  get length() { return this.items.length; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
}
export const resetPart = (o) => { o.kind = null; o.grow = 0; o.rot = 0; o.spin = 0; o.w = 0; o.h = 0; };
export const resetText = (o) => { o.pop = false; o.crit = false; };
