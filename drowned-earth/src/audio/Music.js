// Procedural soundtrack. Sparse and lonely by default; regional colour near
// the rafts (warm at Portage, clangs near Rusthold, soft strings at Greentide),
// low pulses underwater; swells for discoveries and the festival; and it goes
// silent when danger is close — silence is part of the score.
const SCALES = {
  lonely: [50, 53, 55, 57, 60, 62, 65],      // D dorian-ish, low
  warm: [55, 59, 62, 64, 66, 67, 71],        // G lydian
  green: [57, 60, 62, 64, 67, 69, 72],       // A minor pentatonic-ish
  deep: [38, 41, 43, 45, 48],
  dread: [50, 51, 54, 55, 58],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(audio) {
    this.audio = audio;
    const ac = audio.ac;
    this.ac = ac;
    this.out = ac.createGain(); this.out.gain.value = 0.0;
    this.delay = ac.createDelay(2); this.delay.delayTime.value = 0.62;
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.delay.connect(lp).connect(fb).connect(this.delay);
    this.delay.connect(this.out);
    this.out.connect(audio.master);
    this.dry = ac.createGain(); this.dry.connect(this.out); this.dry.connect(this.delay);
    this.next = ac.currentTime + 2;
    this.padNext = ac.currentTime + 1;
    this.moment = null; this.momentT = 0;
    this.level = 0.55;
  }
  setMoment(kind) { this.moment = kind; this.momentT = kind === 'festival' ? 60 : 25; }
  region() {
    const g = this.audio.game.ctx, p = g.camera.position;
    if (g.atmosphere.underwater) return 'deep';
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    if (near(318, 250, 140)) return 'warm';
    if (near(640, 150, 90)) return 'green';
    if (near(470, 560, 90)) return 'rust';
    return 'lonely';
  }
  update(dt) {
    const ac = this.ac, t = ac.currentTime, a = this.audio;
    this.momentT = Math.max(0, this.momentT - dt);
    if (this.momentT <= 0) this.moment = null;
    const danger = a.danger || 0;
    const listener = a.listenerNear || 0;
    const silent = listener > 0.5 || a.game.ctx.story.finale || a.game.ctx.state.inLair;   // no music in the lairs
    const target = silent ? 0 : (this.moment ? 0.9 : this.level) * (a.game.ctx.settings.music ?? 1) * (1 - danger * 0.4);
    this.out.gain.setTargetAtTime(target * 0.35, t, silent ? 0.3 : 3);
    if (t < this.next - 0.1) return;
    const region = this.moment === 'festival' ? 'warm' : danger > 0.6 ? 'dread' : this.region();
    const scale = SCALES[region === 'rust' ? 'lonely' : region] || SCALES.lonely;
    // pad chord every ~12 s
    if (t >= this.padNext) {
      this.padNext = t + 10 + Math.random() * 6;
      const root = scale[Math.floor(Math.random() * 3)];
      for (const iv of [0, 7, region === 'dread' ? 6 : 10]) this.pad(mtof(root + iv - 12), t, 11);
    }
    // melody / texture
    let gap = 2.2 + Math.random() * 3.5;
    if (region === 'deep') { this.pulse(mtof(scale[0] - 12), t); gap = 3.2; }
    else if (region === 'dread') { this.pulse(mtof(38), t); gap = 0.9; }
    else if (region === 'rust') { this.clang(t); if (Math.random() < 0.5) this.pluck(mtof(scale[Math.floor(Math.random() * scale.length)]), t + 0.4); gap = 1.6 + Math.random() * 2; }
    else {
      const n = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
      if (Math.random() < (this.moment ? 0.95 : 0.6)) this.pluck(mtof(n), t);
      if (this.moment && Math.random() < 0.6) this.pluck(mtof(n + 7), t + 0.25);
      if (this.moment) gap *= 0.5;
    }
    this.next = t + gap;
  }
  pad(f, t, dur) {
    const ac = this.ac;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    for (const d of [-4, 4]) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    lp.connect(g).connect(this.dry);
    setTimeout(() => g.disconnect(), (dur + 1) * 1000);
  }
  pluck(f, t) {
    const ac = this.ac;
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2.001;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.dry);
    o.start(t); o2.start(t); o.stop(t + 2.8); o2.stop(t + 2.8);
    setTimeout(() => g.disconnect(), 3500);
  }
  pulse(f, t) {
    const ac = this.ac;
    const o = ac.createOscillator(); o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.3);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 1.5);
    setTimeout(() => g.disconnect(), 2000);
  }
  clang(t) {
    const ac = this.ac, s = this.audio.synth;
    const src = ac.createBufferSource(); src.buffer = s.noise('white'); src.start(t, Math.random() * 3, 0.5);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1400; bp.Q.value = 30;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(bp).connect(g).connect(this.dry);
    setTimeout(() => g.disconnect(), 1500);
  }
}
