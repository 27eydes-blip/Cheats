// A procedural live band. Writes a chord progression and a melody for its
// style, then schedules notes a little ahead of time into `dest`. Used by the
// bars (positional, spilling out of doorways), the radio (through a radio
// filter) and the Gentleman's Club (muffled through the hull).
//
// styles: shanty (accordion + fiddle + stomp), garden (plucked strings, soft
// flute), forge (pipe clangs, a low drone, hammer rhythm), hymn (choir pads),
// smoke (musical saw, squeezebox, brushed snare), lounge (walking bass, ride,
// muted horn, a wordless singer), jingle (a 4-bar advert hook).
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROG = {
  shanty: { key: 50, mode: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 3, 7], [5, 8, 12], [7, 10, 14], [0, 3, 7]], bpm: 128, swing: 0 },
  garden: { key: 57, mode: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], bpm: 84, swing: 0.1 },
  forge:  { key: 40, mode: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 7, 12], [1, 8, 13], [0, 7, 12], [-2, 5, 10]], bpm: 104, swing: 0 },
  hymn:   { key: 55, mode: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], bpm: 56, swing: 0 },
  smoke:  { key: 52, mode: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 3, 7], [5, 8, 12], [-1, 2, 5, 8], [0, 3, 7]], bpm: 76, swing: 0.18 },
  lounge: { key: 53, mode: [0, 2, 3, 5, 7, 9, 10], chords: [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]], bpm: 92, swing: 0.22 },
  jingle: { key: 60, mode: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], bpm: 132, swing: 0 },
};

export class Band {
  constructor(ac, dest, style = 'shanty', seed = 1) {
    this.ac = ac; this.dest = dest; this.style = style;
    this.p = PROG[style] || PROG.shanty;
    let s = (seed * 9301 + 49297) % 233280 || 1;
    this.rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    this.out = ac.createGain(); this.out.gain.value = 0.9; this.out.connect(dest);
    this.beat = 0; this.next = ac.currentTime + 0.1;
    this.melodyPos = 2;
    this.song = 0;
    this.noiseBuf = null;
    this.stopped = false;
  }
  get secPerBeat() { return 60 / this.p.bpm / 2; } // eighth notes
  tick() {
    if (this.stopped) return;
    const ac = this.ac;
    while (this.next < ac.currentTime + 0.25) {
      this.play(this.beat, this.next + (this.beat % 2 ? this.p.swing * this.secPerBeat : 0));
      this.beat++;
      this.next += this.secPerBeat;
      if (this.beat % 128 === 0) { this.song++; this.p = { ...this.p, key: this.p.key + [0, 5, -2, 3][this.song % 4] - [0, 5, -2, 3][(this.song - 1) % 4] }; }
    }
  }
  stop() { this.stopped = true; try { this.out.gain.setTargetAtTime(0, this.ac.currentTime, 0.3); setTimeout(() => this.out.disconnect(), 1500); } catch { /**/ } }
  // ---- voices
  osc(type, f, t, dur, peak, { attack = 0.01, release = 0.15, filter = null, q = 1, detune = 0, vib = 0 } = {}) {
    const ac = this.ac;
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setTargetAtTime(peak * 0.7, t + attack, dur * 0.3); g.gain.setTargetAtTime(0, t + dur, release);
    let n = o;
    if (vib) { const l = ac.createOscillator(); l.frequency.value = 5.5; const lg = ac.createGain(); lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + release * 4); }
    if (filter) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; fl.Q.value = q; n.connect(fl); n = fl; }
    n.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + release * 5);
  }
  noise(t, dur, peak, hp = 4000, bp = null) {
    const ac = this.ac;
    if (!this.noiseBuf) { const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b; }
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = bp || hp; if (bp) f.Q.value = 3;
    const g = ac.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.05);
  }
  kick(t, peak = 0.5) {
    const ac = this.ac; const o = ac.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ac.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }
  clang(t, f, peak = 0.2) { // inharmonic metal: a pipe or anvil
    for (const r of [1, 2.76, 5.4, 8.93]) this.osc('sine', f * r, t, 0.02, peak / r, { attack: 0.001, release: 0.4 + 1.2 / r });
  }
  scale(deg, oct = 0) { const m = this.p.mode; const d = ((deg % m.length) + m.length) % m.length; return this.p.key + m[d] + 12 * (oct + Math.floor(deg / m.length)); }
  // ---- one eighth-note step
  play(beat, t) {
    const st = this.style, p = this.p, spb = this.secPerBeat;
    const bar = Math.floor(beat / 8), inBar = beat % 8;
    const chord = p.chords[bar % p.chords.length];
    const root = p.key + chord[0];
    const r = this.rnd;
    // melody walk: mostly steps, sometimes leaps; phrase rests at bar ends
    const stepMel = () => { const mv = r() < 0.7 ? (r() < 0.5 ? -1 : 1) : (r() < 0.5 ? -2 : 3); this.melodyPos = Math.max(-2, Math.min(9, this.melodyPos + mv)); return this.scale(this.melodyPos, 1); };
    if (st === 'shanty') {
      if (inBar % 2 === 0) this.kick(t, inBar % 4 === 0 ? 0.45 : 0.25); // stomp
      if (inBar % 4 === 2) this.noise(t, 0.08, 0.12, 3000); // clap
      if (inBar === 0 || inBar === 4) for (const c of chord) this.osc('sawtooth', mtof(p.key + c), t, spb * 3.5, 0.035, { filter: 1600, attack: 0.03, vib: 2 }); // accordion
      if (inBar % 2 === 0 || r() < 0.4) this.osc('sawtooth', mtof(stepMel()), t, spb * (r() < 0.3 ? 2 : 1), 0.05, { filter: 3200, q: 2, vib: 4, attack: 0.02 }); // fiddle
      if (inBar % 2 === 0) this.osc('triangle', mtof(root - 12 + (inBar === 4 ? 7 : 0)), t, spb * 1.5, 0.18, { filter: 600 }); // bass
    } else if (st === 'garden') {
      if (inBar % 2 === 0) for (const [k, c] of chord.entries()) this.osc('triangle', mtof(p.key + c + 12), t + k * 0.04, 0.6, 0.05, { attack: 0.002, release: 0.5, filter: 2400 }); // plucked
      if ((inBar === 0 || inBar === 3 || inBar === 6) && r() < 0.8) this.osc('sine', mtof(stepMel() + 12), t, spb * 2.5, 0.05, { attack: 0.08, vib: 3 }); // flute
      if (inBar === 0) this.osc('sine', mtof(root - 12), t, spb * 7, 0.12, { attack: 0.05, release: 0.8 });
    } else if (st === 'forge') {
      if (inBar === 0 || inBar === 3 || inBar === 6) this.clang(t, mtof(root + 24), 0.22); // pipes
      if (inBar === 2 || inBar === 7) this.clang(t, 900 + r() * 400, 0.12); // hammer
      if (inBar % 2 === 0) this.kick(t, 0.5);
      if (inBar === 0) this.osc('sawtooth', mtof(root - 12), t, spb * 8, 0.08, { filter: 260, attack: 0.3 }); // drone
      if (inBar === 4 && r() < 0.6) this.osc('square', mtof(stepMel() - 12), t, spb * 2, 0.04, { filter: 900 });
    } else if (st === 'hymn') {
      if (inBar === 0) for (const c of chord) for (const d of [-6, 6]) this.osc('sawtooth', mtof(p.key + c), t, spb * 7.5, 0.025, { filter: 900, attack: 0.6, release: 1.2, detune: d, vib: 1.5 });
      if (inBar === 0 || inBar === 4) this.osc('sine', mtof(this.scale(Math.floor(r() * 5), 1)), t, spb * 3.5, 0.05, { attack: 0.3, release: 0.8, vib: 2 });
    } else if (st === 'smoke') {
      if (inBar % 2 === 1) this.noise(t, 0.12, 0.05, 0, 5000); // brushes
      if (inBar === 0 || inBar === 4) this.kick(t, 0.2);
      if (inBar === 0) for (const c of chord) this.osc('sawtooth', mtof(p.key + c), t, spb * 7, 0.03, { filter: 1100, attack: 0.15, vib: 3 }); // squeezebox
      if (inBar === 1 || inBar === 5) this.osc('sine', mtof(stepMel() + 12), t, spb * 4, 0.06, { attack: 0.25, release: 0.6, vib: 9 }); // the saw, wobbling
      if (inBar % 2 === 0) this.osc('triangle', mtof(root - 12 + [0, 7, 12, 7][inBar / 2]), t, spb * 1.6, 0.15, { filter: 500 });
    } else if (st === 'lounge') {
      if (inBar % 2 === 0) this.osc('triangle', mtof(root - 12 + [0, 4, 7, 9][inBar / 2]), t, spb * 1.8, 0.2, { filter: 700 }); // walking bass
      this.noise(t, inBar % 2 ? 0.05 : 0.18, inBar % 2 ? 0.02 : 0.05, 7000); // ride
      if (inBar === 2 || inBar === 6) this.noise(t, 0.1, 0.06, 0, 1800); // snare brush
      if (inBar === 0 || inBar === 3) for (const c of chord) this.osc('sine', mtof(p.key + c + 12), t, spb * 2.5, 0.025, { attack: 0.01, release: 0.4 }); // piano comp
      if (r() < 0.45 && inBar % 2 === 0) this.osc('sawtooth', mtof(stepMel()), t, spb * (1 + Math.floor(r() * 3)), 0.04, { filter: 1300, q: 4, attack: 0.04, vib: 3 }); // muted horn
      if (inBar === 4 && bar % 2 === 1) this.osc('sine', mtof(this.scale(this.melodyPos + 2, 1)), t, spb * 3.5, 0.05, { attack: 0.2, vib: 5 }); // the singer, wordless
    } else if (st === 'jingle') {
      if (inBar % 2 === 0) this.kick(t, 0.35);
      if (inBar === 0) for (const c of chord) this.osc('square', mtof(p.key + c), t, spb * 3, 0.03, { filter: 2400 });
      this.osc('square', mtof(this.scale([0, 2, 4, 2, 4, 5, 4, 7][inBar] + (bar % 2) * 2, 1)), t, spb * 0.9, 0.05, { filter: 3000 });
    }
  }
}
