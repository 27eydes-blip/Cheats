// The Order of the World: the player's Standing tier (1 Concord … 7 Deep-Born),
// what they appear to be (tags can be forged), and reputation per faction.
// Docks, prices, dialogue, NPC distance and patrol stops all ask this system.
export class Standing {
  constructor(ctx) {
    this.ctx = ctx;
    this.def = ctx.data.standing;
    this.tier = 7;          // true standing
    this.forged = null;     // tier shown by a forged tag, if worn
    this.dives = 212 - 200; // tally marks on the sleeve
    this.rep = Object.fromEntries((this.def.reputations || []).map((k) => [k, 0]));
    this.rep.deep_born = 20;
  }
  get shown() { return this.forged ?? this.tier; }
  info(t = this.shown) { return this.def.tiers[String(t)]; }
  canDock(max) { return this.shown <= max; }
  priceMod(shop) { const t = String(this.shown); return shop?.standingMod?.[t] ?? this.info().priceMod; }
  tone() { return this.info().tone; }
  addRep(f, v) { if (f in this.rep) { this.rep[f] = Math.max(-100, Math.min(100, this.rep[f] + v)); this.ctx.events.emit('rep', { f, v }); } }
  canStep(id) {
    const s = this.def.steps[id];
    if (!s || this.tier <= s.toTier) return false;
    const inv = this.ctx.inventory;
    return Object.entries(s.cost).every(([k, n]) => inv.has(k, n));
  }
  step(id) {
    const s = this.def.steps[id];
    if (!this.canStep(id)) return false;
    for (const [k, n] of Object.entries(s.cost)) this.ctx.inventory.remove(k, n);
    for (const [f, v] of Object.entries(s.rep || {})) this.addRep(f, v);
    this.tier = s.toTier;
    this.forged = null;
    this.ctx.inventory.add(s.item, 1, true);
    this.ctx.events.emit('standing', this.tier);
    this.ctx.ui.whisper(`Your wrist changes. ${this.info().name} now. ${s.desc.split('.').slice(-2).join('.').trim()}`);
    this.ctx.story.setFlag('standing_' + this.tier);
    return true;
  }
  wearForged(t) { this.forged = t; this.ctx.events.emit('standing', this.shown); this.ctx.ui.whisper('You fasten the forged yellow tag. It looks right. It looks right until someone checks.'); }
  // Called when a patrol or dock inspects you. Returns true if a forgery was exposed.
  inspect() {
    if (this.forged == null) return false;
    if (Math.random() < this.def.forgery.caughtChance) {
      this.forged = null;
      this.ctx.inventory.remove('forged_tag');
      this.ctx.heat.add(this.def.forgery.heat, 'forgery');
      const fine = Math.min(this.ctx.inventory.count('scrap'), this.def.forgery.fine.scrap);
      if (fine) this.ctx.inventory.remove('scrap', fine);
      this.ctx.events.emit('standing', this.shown);
      return true;
    }
    return false;
  }
  toJSON() { return { tier: this.tier, forged: this.forged, rep: this.rep, dives: this.dives }; }
  load(o) { if (o) { this.tier = o.tier; this.forged = o.forged; Object.assign(this.rep, o.rep); this.dives = o.dives ?? this.dives; } }
}
