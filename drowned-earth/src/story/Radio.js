// Boat radio. R cycles: off → Highmark → static scan → 3.3 (Unmoored). Lines
// show as subtitles while synthesized murmur/numbers play through the audio
// engine's radio bus.
export class Radio {
  constructor(ctx) {
    this.ctx = ctx;
    this.stations = ctx.data.radio.stations || [];
    this.index = -1; // off
    this.lineIdx = {};
    this.timer = 2;
    this.heard = new Set();
  }
  get station() { return this.stations[this.index] || null; }
  cycle() {
    this.index = this.index + 1 >= this.stations.length ? -1 : this.index + 1;
    this.timer = 1.2;
    const s = this.station;
    this.ctx.audio?.radioTune(s ? s.voice : null);
    this.ctx.ui.toast(s ? `Radio: ${s.name}` : 'Radio off');
  }
  update(dt) {
    const { player, input } = this.ctx;
    const aboard = player.mode === 'boat';
    if (aboard && input.pressed('radio')) this.cycle();
    if (!aboard) { if (this.index !== -1 && this.wasAboard) this.ctx.audio?.radioTune(null); this.wasAboard = false; return; }
    if (!this.wasAboard && this.index !== -1) this.ctx.audio?.radioTune(this.station?.voice);
    this.wasAboard = true;
    const s = this.station;
    if (!s) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const i = this.lineIdx[s.id] || 0;
    const line = s.lines[i % s.lines.length];
    this.lineIdx[s.id] = i + 1;
    this.timer = s.gap + line.length * 0.06;
    const dur = 2 + line.length * 0.055;
    this.ctx.ui.subtitle(line, dur, s.voice === 'numbers' ? 'radio-numbers' : 'radio');
    this.ctx.audio?.radioSpeak(s.voice, dur, line);
    const set = s.sets?.[String(i % s.lines.length)];
    if (set) this.ctx.story.setFlag(set);
  }
}
