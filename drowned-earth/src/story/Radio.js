// Boat radio. R cycles stations (off at the end). Stations have broadcast
// hours; off-air you get static. Lines respond to flags and heat, so the
// propaganda shifts as the world does. Subtitles + synthesized voices.
export class Radio {
  constructor(ctx) {
    this.ctx = ctx;
    this.stations = ctx.data.radio.stations || [];
    this.index = -1;
    this.lineIdx = {};
    this.timer = 2;
  }
  get station() { return this.stations[this.index] || null; }
  onAir(s) {
    if (!s?.hours) return true;
    const h = this.ctx.time.hour, [a, b] = s.hours;
    return a < b ? h >= a && h < b : h >= a || h < b;
  }
  voiceOf(s) { return this.onAir(s) ? s.voice : 'static'; }
  cycle() {
    this.index = this.index + 1 >= this.stations.length ? -1 : this.index + 1;
    this.timer = 1.2;
    const s = this.station;
    this.ctx.audio?.radioTune(s ? this.voiceOf(s) : null);
    this.ctx.ui.toast(s ? `Radio: ${s.name}${this.onAir(s) ? '' : ' (off air)'}` : 'Radio off');
  }
  fits(l) {
    const st = this.ctx.story;
    if (l.if && !st.flag(l.if)) return false;
    if (l.ifNot && st.flag(l.ifNot)) return false;
    if (l.minHeat && this.ctx.heat.value < l.minHeat) return false;
    return true;
  }
  update(dt) {
    const { player, input } = this.ctx;
    const aboard = player.mode === 'boat';
    if (aboard && input.pressed('radio')) this.cycle();
    if (!aboard) { if (this.index !== -1 && this.wasAboard) this.ctx.audio?.radioTune(null); this.wasAboard = false; return; }
    if (!this.wasAboard && this.index !== -1) this.ctx.audio?.radioTune(this.voiceOf(this.station));
    this.wasAboard = true;
    const s = this.station;
    if (!s) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (!this.onAir(s)) { this.timer = 6; this.ctx.audio?.radioTune('static'); return; }
    const lines = s.lines.map((l, i) => ({ ...(typeof l === 'string' ? { text: l } : l), i })).filter((l) => this.fits(l));
    const k = (this.lineIdx[s.id] || 0) % lines.length;
    const line = lines[k];
    this.lineIdx[s.id] = k + 1;
    this.timer = s.gap + line.text.length * 0.06;
    const dur = 2 + line.text.length * 0.055;
    this.ctx.ui.subtitle(line.text, dur, s.voice === 'numbers' ? 'radio-numbers' : 'radio');
    this.ctx.audio?.radioTune(s.voice);
    this.ctx.audio?.radioSpeak(s.voice, dur, line.text);
    const set = s.sets?.[String(line.i)];
    if (set) this.ctx.story.setFlag(set);
    if (set === 'teo_song') { this.ctx.events.emit('music:moment', 'festival'); setTimeout(() => this.ctx.ui.whisper('Teo used to hum that one when he patched the boat. You had forgotten.'), (dur + 1) * 1000); }
  }
}
