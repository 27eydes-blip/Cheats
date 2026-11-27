// Barter with traders. Prices come from the Economy (per-raft supply and
// demand) times the Standing price modifier. Currencies: scrap, seal, salt, glass.
export class Trade {
  constructor(ctx) { this.ctx = ctx; this.stock = {}; }
  shop(id) { return this.ctx.data.trade.shops?.[id]; }
  cur(shopId, item) { return this.shop(shopId).sells[item].cur || 'scrap'; }
  price(shopId, item) { return this.ctx.economy.price(shopId, item); }
  stockOf(shopId, item) {
    const key = shopId + ':' + item;
    if (!(key in this.stock)) this.stock[key] = this.shop(shopId).sells[item].stock;
    return this.stock[key];
  }
  canBuy(shopId, item) { return this.stockOf(shopId, item) > 0 && this.ctx.inventory.has(this.cur(shopId, item), this.price(shopId, item)); }
  buy(shopId, item) {
    if (!this.canBuy(shopId, item)) return false;
    const p = this.price(shopId, item), c = this.cur(shopId, item), inv = this.ctx.inventory;
    if (p > 0) inv.remove(c, p);
    inv.add(item, 1, true);
    this.stock[shopId + ':' + item]--;
    this.ctx.economy.traded(shopId, item, 'buy');
    this.ctx.events.emit('trade', { shopId, item, dir: 'buy' });
    return true;
  }
  sellPrice(shopId, item) { return this.ctx.economy.sellPrice(shopId, item); }
  sell(shopId, item) {
    const p = this.sellPrice(shopId, item), inv = this.ctx.inventory;
    if (!p || !inv.remove(item, 1)) return false;
    inv.add('scrap', p, true);
    this.ctx.economy.traded(shopId, item, 'sell');
    this.ctx.events.emit('trade', { shopId, item, dir: 'sell' });
    return true;
  }
  service(shopId, sid) {
    const sv = this.shop(shopId).services?.[sid], inv = this.ctx.inventory, boat = this.ctx.boat;
    if (!sv || !inv.has('scrap', sv.price)) return false;
    if (sid === 'repair_hull') { if (boat.hull >= 100) return false; boat.repair(40); }
    if (sv.upgrade) { if (boat.upgrades[sv.upgrade]) return false; boat.applyUpgrade(sv.upgrade); }
    inv.remove('scrap', sv.price);
    return true;
  }
}
