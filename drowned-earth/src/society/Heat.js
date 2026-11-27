// Heat with the Tide Ward. Crimes raise it; it cools while you stay unseen.
// High heat makes patrols hunt you even by day.
export class Heat {
  constructor(ctx) { this.ctx = ctx; this.value = 0; this.log = []; }
  add(v, why) {
    if (this.ctx.settings.difficulty === 'calm') return;
    const before = this.value;
    this.value = Math.max(0, Math.min(100, this.value + v));
    if (why) this.log.unshift(why);
    this.log.length = Math.min(this.log.length, 6);
    if (before < 50 && this.value >= 50) this.ctx.ui.whisper('The Ward will be looking for your boat now. Lie low.');
    this.ctx.events.emit('heat', this.value);
  }
  get hunted() { return this.value >= 60; }
  update(dt) {
    const seen = this.ctx.patrol?.state === 'chase';
    if (!seen) this.value = Math.max(0, this.value - dt * (this.value > 60 ? 0.08 : 0.15));
  }
  toJSON() { return { value: this.value }; }
  load(o) { this.value = o?.value || 0; }
}
