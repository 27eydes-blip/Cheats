import { RNG, hashString } from '../core/rng.js';

// Deterministic container loot: the roll depends on (worldSeed, containerId), so
// a container always held the same things. Looted ids are saved.
export class Loot {
  constructor(ctx) { this.ctx = ctx; }
  isLooted(id) { return this.ctx.state.looted.has(id); }
  roll(id, type) {
    const t = this.ctx.data.lootTables[type];
    if (!t) return [];
    const rng = new RNG(hashString(id) ^ this.ctx.worldMap.seed);
    const out = {};
    for (const g of t.guaranteed || []) out[g.item] = (out[g.item] || 0) + g.count;
    const rolls = rng.int(t.rolls[0], t.rolls[1]);
    for (let i = 0; i < rolls; i++) {
      const e = rng.weighted(t.entries.map((x) => ({ w: x.w, v: x })));
      out[e.item] = (out[e.item] || 0) + rng.int(e.count[0], e.count[1]);
    }
    return Object.entries(out).map(([item, n]) => ({ item, n }));
  }
  open(id, type) {
    if (this.isLooted(id)) return;
    const items = this.roll(id, type);
    this.ctx.state.looted.add(id);
    const inv = this.ctx.inventory;
    for (const { item, n } of items) inv.add(item, n, true);
    this.ctx.events.emit('loot', { id, type, items });
    const names = items.map(({ item, n }) => `${this.ctx.data.items.items[item].name}${n > 1 ? ' ×' + n : ''}`);
    this.ctx.ui.toast(names.length ? 'Found: ' + names.join(', ') : 'Nothing useful.');
  }
}
