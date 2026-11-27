import { Band } from '../audio/Band.js';

// The radio network. R cycles stations while aboard (off after the last).
// Each station schedules segments by weight — host talk, fake ads, news (which
// picks up your own exploits from the city feed), call-ins with two voices,
// procedurally composed songs and jingles played through the radio filter,
// and on the coded channel, numbers and messages that open doors.
// Off-air hours are static. Subtitles carry everything.
export class Radio {
  constructor(ctx) {
    this.ctx = ctx;
    this.stations = ctx.data.radio.stations || [];
    this.index = -1;
    this.pos = {};       // per-station position in each pool
    this.timer = 2;
    this.song = null;    // { band, until, station }
  }
  get station() { return this.stations[this.index] || null; }
  onAir(s) {
    if (!s?.hours) return true;
    const h = this.ctx.time.hour, [a, b] = s.hours;
    return a < b ? h >= a && h < b : h >= a || h < b;
  }
  voiceOf(s) { return this.onAir(s) ? s.voice : 'static'; }
  cycle() {
    this.stopSong();
    this.index = this.index + 1 >= this.stations.length ? -1 : this.index + 1;
    this.timer = 1.2;
    const s = this.station;
    this.ctx.audio?.radioTune(s ? this.voiceOf(s) : null);
    this.ctx.ui.toast(s ? `Radio: ${s.name}${this.onAir(s) ? ` · ${s.host}` : ' (off air)'}` : 'Radio off');
    this.ctx.events.emit('radio:station', s?.id || null);
  }
  fits(l) {
    if (typeof l === 'string') return true;
    const st = this.ctx.story;
    if (l.if === 'feed') { if (!this.ctx.state.feed?.length) return false; }
    else if (l.if && !st.flag(l.if)) return false;
    if (l.ifNot && st.flag(l.ifNot)) return false;
    if (l.minHeat && this.ctx.heat.value < l.minHeat) return false;
    if (l.minStars && this.ctx.heat.stars < l.minStars) return false;
    return true;
  }
  next(s, pool) {
    const list = (s[pool] || []).filter((l) => this.fits(l));
    if (!list.length) return null;
    const k = (this.pos[s.id + pool] = ((this.pos[s.id + pool] ?? Math.floor(Math.random() * list.length)) + 1)) % list.length;
    return list[k];
  }
  text(l) {
    let t = typeof l === 'string' ? l : l.text;
    if (t.includes('{feed}')) { const f = this.ctx.state.feed?.[0]; t = t.replace('{feed}', f ? f.short || f.text.replace(/\.$/, '').toLowerCase() : 'nobody in particular'); }
    return t;
  }
  pickSegment(s) {
    const mix = s.mix || { talk: 1 };
    const opts = Object.entries(mix).filter(([k]) => (k === 'song' || k === 'jingle' ? s.music : k === 'call' ? s.calls?.length : (s[k === 'talk' ? 'talk' : k === 'ad' ? 'ads' : k] || []).length));
    let total = opts.reduce((a, [, w]) => a + w, 0), r = Math.random() * total;
    for (const [k, w] of opts) { if ((r -= w) <= 0) return k; }
    return 'talk';
  }
  say(s, text, cls = 'radio', voice = s.voice, pitch) {
    const dur = 2 + text.length * 0.055;
    this.ctx.ui.subtitle(text, dur, s.voice === 'numbers' ? 'radio-numbers' : cls);
    this.ctx.audio?.radioTune(voice);
    this.ctx.audio?.radioSpeak(voice, dur, text, pitch);
    return dur;
  }
  playSong(s, title, jingle = false) {
    const a = this.ctx.audio;
    if (!a?.started || !a.radioIn) return 4;
    this.stopSong();
    const band = new Band(a.ac, a.radioIn, jingle ? 'jingle' : s.music, Math.floor(Math.random() * 1000));
    const len = jingle ? 4.5 : 38 + Math.random() * 20;
    this.song = { band, station: s.id };
    if (s.id === 'nightsongs' && !jingle && !this.ctx.story.flag('teo_song')) { this.ctx.story.setFlag('teo_song'); this.ctx.events.emit('music:moment', 'festival'); setTimeout(() => this.ctx.ui.whisper('Teo used to hum that one when he patched the boat. You had forgotten.'), 6000); }
    this.songLeft = len;
    if (title) this.ctx.ui.subtitle(`♪ ${title.title} — ${title.artist}`, 4, 'radio');
    this.ctx.events.emit('radio:song', { station: s.id, title: title?.title });
    return len;
  }
  stopSong() { if (this.song) { this.song.band.stop(); this.song = null; } }
  update(dt) {
    const { player, input } = this.ctx;
    const aboard = player.mode === 'boat';
    if (aboard && input.pressed('radio')) this.cycle();
    if (!aboard) { if (this.index !== -1 && this.wasAboard) { this.ctx.audio?.radioTune(null); this.stopSong(); } this.wasAboard = false; return; }
    if (!this.wasAboard && this.index !== -1) this.ctx.audio?.radioTune(this.voiceOf(this.station));
    this.wasAboard = true;
    const s = this.station;
    if (!s) return;
    if (this.song) { this.song.band.tick(); this.songLeft -= dt; if (this.songLeft <= 0) this.stopSong(); }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (!this.onAir(s)) { this.timer = 6; this.ctx.audio?.radioTune('static'); return; }
    const seg = s.voice === 'numbers' ? 'coded' : this.pickSegment(s);
    let dur = 4;
    if (seg === 'song') { dur = this.playSong(s, this.next(s, 'songs')); }
    else if (seg === 'jingle') { dur = this.playSong(s, null, true); }
    else if (seg === 'call') {
      const call = this.next(s, 'calls');
      let t = 0;
      call.forEach(([who, line], i) => setTimeout(() => { if (this.station === s) this.say(s, `${who}: ${line}`, 'radio', 'voice', who === s.host.split(' ')[0] || who === 'Barnaby' ? 0.85 : 1.15 + (i % 2) * 0.1); }, t * 1000) && (t += 2.2 + line.length * 0.055));
      dur = t;
    } else {
      const pool = seg === 'ad' ? 'ads' : seg === 'coded' ? 'coded' : seg;
      const l = this.next(s, pool) || this.next(s, 'talk');
      if (!l) { this.timer = 5; return; }
      const prefix = seg === 'ad' ? '' : seg === 'news' ? 'News: ' : seg === 'coded' ? '' : `${s.host}: `;
      dur = this.say(s, prefix + this.text(l));
      if (typeof l === 'object' && l.set) { this.ctx.story.setFlag(l.set); this.ctx.events.emit('radio:coded', l.set); }
    }
    this.timer = dur + (s.gap || 6) * (0.6 + Math.random() * 0.6);
  }
}
