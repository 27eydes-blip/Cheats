// Recipes from data/recipes.json. Stations gate some recipes.
export class Crafting {
  constructor(ctx) { this.ctx = ctx; }
  get recipes() { return this.ctx.data.recipes.recipes || []; }
  stationAvailable(st) {
    if (!st) return true;
    if (st === 'boat') return this.ctx.player.mode === 'boat';
    return this.ctx.ui.currentStation === st;
  }
  canCraft(r) {
    const inv = this.ctx.inventory;
    if (!this.stationAvailable(r.station)) return false;
    if (r.tool && !inv.has(r.tool)) return false;
    return Object.entries(r.in).every(([id, n]) => inv.has(id, n));
  }
  craft(id) {
    const r = this.recipes.find((x) => x.id === id);
    if (!r || !this.canCraft(r)) return false;
    const inv = this.ctx.inventory;
    for (const [k, n] of Object.entries(r.in)) inv.remove(k, n);
    for (const [k, n] of Object.entries(r.out)) inv.add(k, n, true);
    this.ctx.events.emit('craft', r);
    this.ctx.ui.toast(`Made: ${Object.keys(r.out).map((k) => this.ctx.data.items.items[k].name).join(', ')}`);
    return true;
  }
}
