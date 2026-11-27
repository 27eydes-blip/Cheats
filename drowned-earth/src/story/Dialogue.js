// Talking to NPCs: picks the next line (respecting flags), shows it as a
// subtitle with a murmur voice, then opens a shop / bench for traders.
export class Dialogue {
  constructor(ctx) { this.ctx = ctx; this.seen = ctx.state.seenLines || (ctx.state.seenLines = {}); }
  talk(npc) {
    const d = npc.def, ctx = this.ctx;
    const lines = d.talk.filter((l) => !l.if || ctx.story.flag(l.if));
    const key = (l) => d.id + ':' + d.talk.indexOf(l);
    // newly unlocked (flag-gated) lines take priority, then lines in order
    let line = lines.find((l) => l.if && !this.seen[key(l)]) || lines.find((l) => !this.seen[key(l)]);
    if (!line) { const n = (this.seen[d.id + ':cyc'] = ((this.seen[d.id + ':cyc'] || 0) + 1)); line = lines[n % lines.length]; }
    this.seen[key(line)] = true;
    if (line.set) ctx.story.setFlag(line.set);
    const dur = 2.5 + line.text.length * 0.05;
    ctx.ui.subtitle(`${d.name}: ${line.text}`, dur, 'speech');
    ctx.audio?.speak(npc.worldPos(), dur, d.scale || 1);
    if (d.shop) setTimeout(() => ctx.ui.openShop(d.shop), 600);
  }
}
