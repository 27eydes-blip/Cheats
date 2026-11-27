// Item stacks keyed by id. The player carries one; the boat has its own.
export class Inventory {
  constructor(ctx, capacityKg = 25) { this.ctx = ctx; this.items = {}; this.capacity = capacityKg; }
  def(id) { return this.ctx.data.items.items[id]; }
  count(id) { return this.items[id] || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  weight() { let w = 0; for (const [id, n] of Object.entries(this.items)) w += (this.def(id)?.weight || 0) * n; return w; }
  add(id, n = 1, silent = false) {
    if (!this.def(id)) { console.warn('unknown item', id); return 0; }
    this.items[id] = this.count(id) + n;
    if (!silent) this.ctx.events.emit('inventory:add', { id, n });
    this.ctx.events.emit('inventory:change', this);
    return n;
  }
  remove(id, n = 1) {
    if (!this.has(id, n)) return false;
    this.items[id] -= n;
    if (this.items[id] <= 0) delete this.items[id];
    this.ctx.events.emit('inventory:change', this);
    return true;
  }
  list() { return Object.entries(this.items).map(([id, n]) => ({ id, n, def: this.def(id) })).sort((a, b) => a.def.name.localeCompare(b.def.name)); }
  toJSON() { return { ...this.items }; }
  load(obj) { this.items = { ...(obj || {}) }; this.ctx.events.emit('inventory:change', this); }
}
