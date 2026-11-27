import { RNG } from '../core/rng.js';

// Living prices. Each raft market keeps a multiplier per item tag that drifts
// with storms, harvests, Ward crackdowns, ration cuts and the player's own
// buying and selling. Also tracks the weekly Highmark ration level shown on
// every raft's ration board.
const TAGS = ['food', 'drink', 'salvage', 'material', 'medical', 'contraband', 'sealed', 'fuel', 'relic', 'gear'];

export class Economy {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = new RNG(ctx.worldMap.seed + 404);
    this.rafts = {};
    for (const r of ['portage', 'greentide', 'rusthold']) this.rafts[r] = Object.fromEntries(TAGS.map((t) => [t, 1]));
    this.itemBias = {};     // raft:item → multiplier from player trading
    this.ration = 1;        // weekly ration level (1 = normal)
    this.rationWeek = 1;
    this.rumours = [];
    this.lastDay = ctx.time.day;
    this.timer = 30;
    ctx.events.on('weather', (s) => { if (s === 'storm' || s === 'rain') this.rumour('storm'); });
  }
  tagsOf(item) { return this.ctx.data.items.items[item]?.tags || []; }
  mult(raft, item) {
    const r = this.rafts[raft] || this.rafts.portage;
    let m = 1;
    for (const t of this.tagsOf(item)) if (r[t]) m *= r[t];
    return m * (this.itemBias[raft + ':' + item] || 1);
  }
  price(shopId, item) {
    const shop = this.ctx.data.trade.shops[shopId], e = shop.sells[item];
    const cur = e.cur || 'scrap';
    const base = e.price * this.mult(shop.raft, item);
    const mod = cur === 'scrap' ? this.ctx.standing.priceMod(shop) : 1;
    return Math.max(cur === 'scrap' && e.price > 0 ? 1 : 0, Math.round(base * mod));
  }
  sellPrice(shopId, item) {
    const shop = this.ctx.data.trade.shops[shopId], d = this.ctx.data.items.items[item];
    if (!d || item === 'scrap') return 0;
    if (!shop.buys.some((t) => t === item || d.tags.includes(t))) return 0;
    return Math.max(1, Math.floor(d.value * shop.buyRate * this.mult(shop.raft, item)));
  }
  traded(shopId, item, dir) {
    const raft = this.ctx.data.trade.shops[shopId].raft, k = raft + ':' + item;
    this.itemBias[k] = Math.min(1.8, Math.max(0.5, (this.itemBias[k] || 1) * (dir === 'buy' ? 1.05 : 0.95)));
  }
  rumour(when, raftHint) {
    const list = (this.ctx.data.trade.rumours || []).filter((r) => r.when === when);
    if (!list.length) return;
    const r = this.rng.pick(list);
    for (const raft of Object.keys(this.rafts)) {
      if (r.raft && r.raft !== raft) continue;
      for (const [t, v] of Object.entries(r.fx)) this.rafts[raft][t] = Math.min(2, Math.max(0.5, this.rafts[raft][t] * v));
    }
    this.rumours.unshift({ day: this.ctx.time.day, text: r.text });
    this.rumours.length = Math.min(this.rumours.length, 8);
    this.ctx.events.emit('rumour', r.text);
  }
  update(dt) {
    // mean reversion
    const k = Math.min(1, dt * 0.002);
    for (const r of Object.values(this.rafts)) for (const t of TAGS) r[t] += (1 - r[t]) * k;
    for (const key of Object.keys(this.itemBias)) this.itemBias[key] += (1 - this.itemBias[key]) * k;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 90 + this.rng.range(0, 120); this.rumour('random'); }
    if (this.ctx.heat && this.ctx.heat.value > 60 && this.rng.chance(dt * 0.01)) this.rumour('heat');
    if (this.ctx.time.day !== this.lastDay) {
      this.lastDay = this.ctx.time.day;
      this.rationWeek++;
      const prev = this.ration;
      this.ration = Math.max(0.5, Math.min(1.2, this.ration + this.rng.range(-0.15, 0.08) - (this.ctx.story.flag('finale_done') ? 0.1 : 0)));
      if (this.ration < prev - 0.05) this.rumour('ration_cut');
      this.ctx.events.emit('rations', this.ration);
    }
  }
  rationText() {
    const bars = Math.round(7 * this.ration);
    return [`RATIONS — WEEK ${this.rationWeek}`, `BARS PER HEAD: ${bars} / 7`, `WATER: ${this.ration > 0.9 ? 'FULL' : 'HALF'}`, this.ration < 0.85 ? 'MEDICINE: PERMIT ONLY' : 'MEDICINE: BY SEAL'];
  }
  toJSON() { return { rafts: this.rafts, itemBias: this.itemBias, ration: this.ration, rationWeek: this.rationWeek, rumours: this.rumours }; }
  load(o) { if (o) Object.assign(this, { rafts: o.rafts, itemBias: o.itemBias, ration: o.ration, rationWeek: o.rationWeek, rumours: o.rumours || [] }); }
}
