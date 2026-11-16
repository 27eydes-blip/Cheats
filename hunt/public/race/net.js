// Hunt Racers client netcode (no DOM, no rendering): connect, lobby, inputs at the server tick
// rate, own-car prediction + reconciliation with the shared physics, ~100 ms interpolation of
// everything else, events, results, reconnect. The renderer / HUD / touch layer reads view()
// every frame and drains events. See PROTOCOL.md.
import { DT, TICK_RATE, DRIVERS, newCar, stepCar, unpackState, packState, cleanInput, cleanSens } from './physics.js';
import { getTrack } from './tracks.js';
import { ITEM_IDS } from './items.js';
import { ENT, FLAG } from './protocol.js';

export const INTERP_TICKS = 3; // others are drawn 3 ticks (100 ms) in the past
// the render clock for everyone else (see view()): the server clock is estimated from the LEAST
// late snapshot of the last ~2 s (network jitter only ever makes snapshots late), and the render
// time glides toward it at most 8% faster or slower than real time, so a late or bunched-up
// snapshot never moves the other cars backwards or makes them lurch; more than 4 ticks off (a
// stalled tab, a server hiccup) snaps. Past the newest snapshot cars carry on for up to 2 ticks.
export const CLOCK_WIN = 64, CLOCK_SNAP = 4, CLOCK_RATE = 0.08, EXTRAP_TICKS = 2;
const MAX_PENDING = 90;
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

export class RaceClient {
  // o: { base: 'wss://host' (or ws://), params: {name, driver, token, room, mode, track, bots, lobby, sens},
  //      transport(url) -> WebSocket-like (or a Promise of one), now() -> ms }
  constructor(o = {}) {
    this.base = o.base || '';
    this.params = { ...(o.params || {}) };
    this.transport = o.transport || ((url) => new WebSocket(url));
    this.now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.phase = 'idle'; // idle | connecting | wait (friend room mid-race) | lobby | race | end | failed
    this.id = 0; this.secret = null; this.match = null; this.room = null;
    this.mode = null; this.trackKey = null; this.arena = false; this.T = null;
    this.roster = new Map(); // id -> {name, driver, bot, cos}
    this.lobby = null; // last lobby message
    this.start = null; // start message
    this.me = null; // last `me` from the server
    this.car = null; // predicted own car
    this.carEp = -1;
    this.err = { x: 0, y: 0, a: 0 }; // visual smoothing of prediction corrections
    // the predicted car one tick earlier: the drawn car is blended between it and the newest tick by
    // the time left over in the tick accumulator, so it moves every frame (60 / 120 Hz screens) and
    // not in 30 Hz steps that make the camera, and with it the whole world, judder
    this.pv = { x: 0, y: 0, a: 0 };
    this.pending = []; // inputs not yet acknowledged
    this.seq = 0;
    this.held = { st: 0, th: 1, dr: 0, ha: null, hm: 0 }; // accelerate is on by default (touch layout)
    this.press = { f: 0, i: 0 };
    this.acc = 0; this.lastFrame = null;
    this.snaps = []; // recent snapshots for interpolation
    this.latest = null; this.latestAt = 0;
    this.offS = new Float64Array(CLOCK_WIN); this.offT = new Float64Array(CLOCK_WIN); this.offN = 0; this.off = null; // server tick - local tick, per arrival
    this.rt = null; this.rtAt = 0; // smoothed render time (server ticks) and when it was last stepped
    this.events = [];
    this.results = null; this.progress = null;
    this.ws = null; this.bye = false; this.tries = 0;
    this.listeners = {};
  }

  on(type, fn) { (this.listeners[type] ||= []).push(fn); return this; }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }

  url(extra = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...this.params, ...extra })) if (v != null && v !== '') q.set(k, String(v));
    return `${this.base}/race?${q}`;
  }
  async connect(extra = {}) {
    this.phase = this.phase === 'race' ? 'race' : 'connecting';
    this.bye = false;
    const ws = await this.transport(this.url(extra));
    this.ws = ws;
    this.outbox = [];
    const onOpen = () => { for (const m of this.outbox.splice(0)) ws.send(m); };
    if (ws.readyState === 0) ws.addEventListener('open', onOpen); else onOpen();
    ws.addEventListener('message', (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); });
    ws.addEventListener('close', () => { if (this.ws === ws) this.onClose(); });
    return this;
  }
  send(m) {
    const s = JSON.stringify(m), ws = this.ws;
    if (!ws) return;
    if (ws.readyState === 1) { try { ws.send(s); } catch {} } else if (ws.readyState === 0) this.outbox.push(s);
  }
  // quit for good (the server records the result now)
  leave() { this.bye = true; this.send({ t: 'bye' }); try { this.ws?.close(1000, 'bye'); } catch {} this.phase = 'idle'; }
  pick(driver) { if (DRIVERS[driver]) { this.params.driver = driver; this.send({ t: 'pick', driver }); } }
  // HORN (the server rate-limits it and sends a 'horn' event to everyone)
  horn() { if (this.phase === 'race') this.send({ t: 'horn' }); }
  // friend room host: START, and FILL WITH BOTS on/off (the server ignores anyone else)
  host(o) { this.send({ t: 'host', ...(o.start ? { start: 1 } : {}), ...(typeof o.bots === 'boolean' ? { bots: o.bots } : {}) }); }
  // RESET: back on the racing line facing forward (the server allows one every 3 s; see me.rcd)
  reset() { this.send({ t: 'reset' }); }
  // the steering sensitivity the server applies to this car (the `sens` join param), for the prediction
  sens() { return cleanSens(this.params.sens == null ? 1 : Number(this.params.sens)); }

  // a dropped connection mid-race: rejoin the same car (3 tries)
  async onClose() {
    if (this.bye || this.phase === 'end' || this.phase === 'idle') return;
    if (!this.secret || this.tries >= 3) { this.phase = 'failed'; this.emit('failed'); return; }
    this.tries++;
    await new Promise((r) => setTimeout(r, 300 * this.tries));
    try { await this.connect({ rejoin: this.id, secret: this.secret, match: this.match }); } catch { this.onClose(); }
  }

  onMsg(m) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.secret = m.secret; this.match = m.match; this.room = m.room; this.tries = 0;
        this.mode = m.mode; this.trackKey = m.track; this.arena = !!m.arena; this.T = getTrack(m.track, this.arena);
        if (!m.rejoin) this.phase = 'lobby';
        break;
      case 'lobby': this.lobby = m; this.phase = 'lobby'; break;
      case 'roomwait': this.phase = 'wait'; this.room = m.room || this.room; this.waitInfo = m; break;
      case 'ro': if (m.full) this.roster.clear(); for (const [id, r] of Object.entries(m.add)) this.roster.set(+id, { name: r[0], driver: r[1], bot: !!r[2], cos: Array.isArray(r[3]) ? r[3] : null }); break; // cos: store ids (race/garage.js SLOTS order)
      case 'start':
        this.start = m; this.phase = 'race'; this.mode = m.mode; this.trackKey = m.track; this.arena = !!m.arena; this.T = getTrack(m.track, this.arena);
        this.pending = []; this.car = null; this.carEp = -1; this.snaps = []; this.offN = 0; this.off = null; this.rt = null;
        break;
      case 's': this.onSnap(m); break;
      case 'end': this.results = m; this.phase = 'end'; break;
      case 'progress': this.progress = m; break;
      case 'retry': case 'rejoinfail': this.phase = 'failed'; break;
    }
    this.emit(m.t, m);
  }

  onSnap(m) {
    // (a WebSocket keeps order; anything a little older than what we have is only kept for its
    // events; a tick count far back means the room restarted its clock: start over from it)
    if (this.latest && m.n <= this.latest.n && this.snaps.length) {
      if (this.latest.n - m.n < 60) { if (m.ev) for (const e of m.ev) this.events.push(e); return; }
      this.snaps = []; this.offN = 0; this.off = null; this.rt = null;
    }
    this.latest = m; this.latestAt = this.now();
    this.clockSample(m.n, this.latestAt);
    this.snaps.push(m);
    while (this.snaps.length > 12) this.snaps.shift();
    if (m.ev) for (const e of m.ev) this.events.push(e);
    const me = m.me;
    this.me = me;
    // drop acknowledged inputs; rebuild the prediction from the server's state + the rest
    while (this.pending.length && this.pending[0].s <= me.ack) this.pending.shift();
    if (!this.predicting()) { this.car = unpackState(me.s, this.car || newCar()); this.carEp = me.ep; this.prevAt(this.car); return; }
    const st = DRIVERS[this.myDriver()];
    const before = this.car;
    const car = unpackState(me.s, newCar());
    stepCar(car, { st: 0, th: 0, dr: car.drift ? 1 : 0 }, st, this.T, 0); // settle surface / corridor (dt 0; keep a drift going)
    for (const p of this.pending) stepCar(car, p, st, this.T);
    this.corr = before && me.ep === this.carEp ? Math.hypot(before.x - car.x, before.y - car.y) : 0; // last correction (px)
    if (before && me.ep === this.carEp) { // same "epoch": smooth over the correction visually
      this.err.x += before.x - car.x; this.err.y += before.y - car.y; this.err.a = lerpA(0, before.a - car.a, 1) + this.err.a;
      // (the tick-earlier pose moves with the correction: the drawn blend stays where it was)
      this.pv.x += car.x - before.x; this.pv.y += car.y - before.y; this.pv.a += lerpA(0, car.a - before.a, 1);
      if (Math.hypot(this.err.x, this.err.y) > 120) { this.err.x = this.err.y = this.err.a = 0; this.prevAt(car); } // too far: snap
    } else { this.err.x = this.err.y = this.err.a = 0; this.prevAt(car); } // respawn / teleport / knock: snap
    this.car = car; this.carEp = me.ep;
  }
  // server clock estimate: the largest (= least delayed) tick offset seen in the last ~2 s
  clockSample(n, at) {
    const i = this.offN++ % CLOCK_WIN, s = n - (at / 1000) * TICK_RATE;
    this.offS[i] = s; this.offT[i] = at;
    let best = -Infinity;
    for (let k = 0, m = Math.min(this.offN, CLOCK_WIN); k < m; k++) if (at - this.offT[k] <= 2000 && this.offS[k] > best) best = this.offS[k];
    this.off = best;
  }
  // the render time (server ticks) for others at local time now: smooth, never backwards
  renderTick(now) {
    const target = (now / 1000) * TICK_RATE + this.off - INTERP_TICKS;
    if (this.rt == null || Math.abs(target - this.rt) > CLOCK_SNAP || now < this.rtAt) { this.rt = target; this.rtAt = now; return this.rt; }
    const d = ((now - this.rtAt) / 1000) * TICK_RATE;
    this.rtAt = now;
    this.rt += d * (1 + Math.max(-CLOCK_RATE, Math.min(CLOCK_RATE, (target - this.rt) * 0.5)));
    return this.rt;
  }
  prevAt(c) { this.pv.x = c.x; this.pv.y = c.y; this.pv.a = c.a; }
  myDriver() { return this.roster.get(this.id)?.driver || this.params.driver || 'volt'; }
  // own-car prediction runs only while we drive it ourselves
  predicting() { const me = this.me; return !!me && this.latest && this.latest.tm > 0 && !me.rt && !me.auto && !me.out; }

  // controls: held state (steer -1..1, throttle -1..1, drift 0|1, target heading ha (rad, world;
  // null = steer by st) + stick magnitude hm 0..1) and one-shot presses
  setInput(inp) { this.held = { ...this.held, ...cleanInput({ ...this.held, ...inp }) }; }
  fire() { this.press.f = 1; }
  useItem() { this.press.i = 1; }

  // call every animation frame: sends inputs at the tick rate and advances the prediction
  frame(now = this.now()) {
    if (this.lastFrame == null) this.lastFrame = now;
    this.acc = Math.min(this.acc + (now - this.lastFrame) / 1000, DT * 6);
    this.lastFrame = now;
    // corrections fade out over ~150 ms
    const k = Math.exp(-((now - (this.errAt ?? now)) / 1000) * 14);
    this.errAt = now;
    this.err.x *= k; this.err.y *= k; this.err.a *= k;
    while (this.acc >= DT) { this.acc -= DT; this.step(); }
  }
  // one input tick (also usable directly by tests / headless clients)
  step() {
    if (this.phase !== 'race' || !this.ws) return;
    const h = this.held, head = h.ha != null;
    const inp = { t: 'in', s: ++this.seq, st: h.st, th: h.th, dr: h.dr ? 1 : 0, f: this.press.f, i: this.press.i, ...(head ? { ha: Math.round(h.ha * 1e4) / 1e4, hm: Math.round(h.hm * 1e3) / 1e3 } : {}) };
    this.press.f = this.press.i = 0;
    this.send(inp);
    // (the prediction uses exactly what the server will see: the rounded heading, our sensitivity)
    const p = { ...cleanInput(inp), s: inp.s, sens: this.sens() };
    this.pending.push(p);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.car && this.predicting()) { this.prevAt(this.car); stepCar(this.car, p, DRIVERS[this.myDriver()], this.T); }
  }

  // what to draw now. Cars: [{id, x, y, a, f (FLAG bits), hp (0-100), lap, spd, me}], own car predicted.
  view(now = this.now()) {
    const L = this.latest;
    if (!L) return null;
    // render time in server ticks: the estimated server clock - the interpolation delay (renderTick)
    if (this.off == null) this.clockSample(L.n, this.latestAt);
    const rt = this.renderTick(now), sn = this.snaps, last = sn.length - 1;
    let a = sn[0], b = sn[last];
    for (let i = last; i > 0; i--) if (sn[i - 1].n <= rt) { a = sn[i - 1]; b = sn[i]; break; }
    // (past the newest snapshot: carry on along the last step for a moment instead of stopping dead)
    const t = b.n > a.n ? Math.max(0, Math.min(rt >= b.n ? 1 + EXTRAP_TICKS / (b.n - a.n) : 1, (rt - a.n) / (b.n - a.n))) : 1;
    const prev = new Map(a.c.map((r) => [r[0], r]));
    const cars = b.c.map((r) => {
      const o = prev.get(r[0]) || r;
      const tele = Math.abs(o[1] - r[1]) + Math.abs(o[2] - r[2]) > 400; // respawn: don't slide across the map
      return { id: r[0], x: tele ? r[1] : o[1] + (r[1] - o[1]) * t, y: tele ? r[2] : o[2] + (r[2] - o[2]) * t, a: lerpA(o[3] / 1000, r[3] / 1000, t), f: r[4], hp: r[5], lap: r[6], spd: r[7], me: r[0] === this.id };
    });
    const mine = cars.find((c) => c.me);
    const myRow = L.c.find((r) => r[0] === this.id); // own state: newest, not delayed
    if (mine && myRow) { mine.f = myRow[4]; mine.hp = myRow[5]; mine.lap = myRow[6]; }
    if (mine && this.car && this.predicting()) {
      const c = this.car, pv = this.pv, f = Math.max(0, Math.min(1, this.acc / DT)), far = Math.abs(c.x - pv.x) + Math.abs(c.y - pv.y) > 200;
      mine.x = (far ? c.x : pv.x + (c.x - pv.x) * f) + this.err.x; mine.y = (far ? c.y : pv.y + (c.y - pv.y) * f) + this.err.y; mine.a = (far ? c.a : lerpA(pv.a, c.a, f)) + this.err.a;
      mine.spd = Math.hypot(this.car.vx, this.car.vy); mine.drift = this.car.drift; mine.boost = this.car.boostT > 0; mine.air = this.car.airT > 0;
      mine.predicted = true;
    }
    const pe = new Map(a.e.map((r) => [r[0], r]));
    // lv: item level (1-3), tg: who a missile / drone is locked on to, or who carries a sticky bomb
    const ents = b.e.map((r) => { const o = pe.get(r[0]) || r; return { id: r[0], kind: ENT[r[1]], x: o[2] + (r[2] - o[2]) * t, y: o[3] + (r[3] - o[3]) * t, a: lerpA(o[4] / 1000, r[4] / 1000, t), owner: r[5], armed: !!r[6], lv: r[7] || 1, tg: r[8] || 0 }; });
    const me = this.me;
    // Elimination: the black hole's race distance, interpolated like the other cars
    const ha = a.md && a.md.bh, hb = b.md && b.md.bh, hole = hb == null ? null : ha == null ? hb : ha + (hb - ha) * t;
    return {
      tick: L.n, time: L.tm, countdown: L.tm < 0 ? -L.tm : 0, cars, ents, boxesOff: L.bx, hazardsOn: L.hz, leader: L.ld, ranks: L.rk, hud: L.md, hole,
      me: me && { ...me, item: me.it >= 0 ? ITEM_IDS[me.it] : null, leader: L.ld === this.id },
    };
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
  static flags = FLAG;
}

export { packState };
