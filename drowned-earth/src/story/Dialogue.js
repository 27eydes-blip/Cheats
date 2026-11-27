// Talking to NPCs. Picks the next line that fits story flags and the player's
// Standing, shows it as a subtitle with a murmur voice, then offers the NPC's
// shop or Standing step. Lines marked `once` are never repeated.
export class Dialogue {
  constructor(ctx) { this.ctx = ctx; this.seen = ctx.state.seenLines || (ctx.state.seenLines = {}); }
  lineFits(l) {
    const c = this.ctx, tier = c.standing.shown;
    if (l.if && !c.story.flag(l.if)) return false;
    if (l.minTier && tier < l.minTier) return false;
    if (l.maxTier && tier > l.maxTier) return false;
    if (l.once && this.seen[l._key]) return false;
    return true;
  }
  // world position of whoever is speaking (for the focus pull), or null
  target() {
    const a = this.active;
    if (!a || performance.now() > a.until) { this.active = null; return null; }
    return a.npc.worldPos(this._p || (this._p = new (a.npc.root.position.constructor)())).setY(a.npc.worldPos().y + 1.6);
  }
  talk(npc) {
    const d = npc.def, ctx = this.ctx;
    d.talk.forEach((l, i) => (l._key = d.id + ':' + i));
    const lines = d.talk.filter((l) => this.lineFits(l));
    // living NPCs speak from what they remember, in their own voice
    const own = ctx.society?.lineFor(npc);
    if (own && (Math.random() < 0.6 || !lines.length)) lines.unshift({ text: own, _key: d.id + ':own:' + Math.random() });
    if (!lines.length) return;
    let line = lines.find((l) => (l.if || l.minTier || l.maxTier) && !this.seen[l._key]) || lines.find((l) => !this.seen[l._key]);
    if (!line) { const n = (this.seen[d.id + ':cyc'] = (this.seen[d.id + ':cyc'] || 0) + 1); const pool = lines.filter((l) => !l.once); line = pool[n % pool.length] || lines[0]; }
    this.seen[line._key] = true;
    if (line.set) ctx.story.setFlag(line.set);
    const dur = 2.5 + line.text.length * 0.05;
    ctx.ui.subtitle(`${d.name}: ${line.text}`, dur, 'speech');
    ctx.audio?.speak(npc.worldPos(), dur, d.scale || 1);
    // the speaker turns, talks with their hands; the camera pulls focus to them
    npc.talkT = dur;
    npc.rig?.say?.(line.text, dur);
    this.active = { npc, until: performance.now() + dur * 1000 };
    ctx.events.emit('talk', { npc: d.id, respect: !!d.respect });
    if (d.respect && ctx.standing.shown === 7) ctx.story.setFlag('respected');
    if (d.shop || d.step) setTimeout(() => ctx.ui.openShop(d.shop, d.step, d.name), 700);
  }
}
