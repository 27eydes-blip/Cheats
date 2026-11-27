// Barter with raft traders. Prices in scrap; traders buy by tag at a discount.
// Sealed (Highmark) goods are flagged in the UI.
export class Trade {
  constructor(ctx) { this.ctx = ctx; this.stock = {}; }
  shop(id) { return this.ctx.data.trade.shops?.[id]; }
  stockOf(shopId, item) {
    const key = shopId + ':' + item;
    if (!(key in this.stock)) this.stock[key] = this.shop(shopId).sells[item].stock;
    return this.stock[key];
  }
  buy(shopId, item) {
    const s = this.shop(shopId), e = s.sells[item], inv = this.ctx.inventory;
    if (!e || this.stockOf(shopId, item) <= 0 || !inv.has('scrap', e.price)) return false;
    inv.remove('scrap', e.price);
    inv.add(item, 1, true);
    this.stock[shopId + ':' + item]--;
    this.ctx.events.emit('trade', { shopId, item, dir: 'buy' });
    return true;
  }
  sellPrice(shopId, item) {
    const s = this.shop(shopId), d = this.ctx.data.items.items[item];
    if (!d || item === 'scrap') return 0;
    const ok = s.buys.some((t) => t === item || d.tags.includes(t));
    return ok ? Math.max(1, Math.floor(d.value * s.buyRate)) : 0;
  }
  sell(shopId, item) {
    const p = this.sellPrice(shopId, item), inv = this.ctx.inventory;
    if (!p || !inv.remove(item, 1)) return false;
    inv.add('scrap', p, true);
    this.ctx.events.emit('trade', { shopId, item, dir: 'sell' });
    return true;
  }
  service(shopId, sid) {
    const s = this.shop(shopId), sv = s.services?.[sid], inv = this.ctx.inventory;
    if (!sv || !inv.has('scrap', sv.price)) return false;
    if (sid === 'repair_hull') { if (this.ctx.boat.hull >= 100) return false; this.ctx.boat.repair(40); }
    inv.remove('scrap', sv.price);
    return true;
  }
}
