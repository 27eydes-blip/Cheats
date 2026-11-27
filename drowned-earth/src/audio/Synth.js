// Sound recipes. Every function builds a tiny WebAudio graph, schedules it on
// the context clock, and cleans it up when it is finished.
const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [440, 1020], [300, 870], [660, 1720]];

export class Synth {
  constructor(ac) { this.ac = ac; this.buffers = {}; }
  noise(type) {
    if (this.buffers[type]) return this.buffers[type];
    const ac = this.ac, len = ac.sampleRate * 5;
    const b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w * 0.5;
      else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else { // pink (Paul Kellet)
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
    // crossfade the loop seam
    const f = 2000; for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); }
    this.buffers[type] = b;
    return b;
  }
  src(type, t, dur) { const s = this.ac.createBufferSource(); s.buffer = this.noise(type); s.start(t, Math.random() * 4, dur + 0.1); return s; }
  env(g, t, a, peak, d, sustainEnd = null) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, (sustainEnd || t + a) + d);
  }
  done(nodes, sec) { setTimeout(() => nodes.forEach((n) => { try { n.disconnect(); } catch { /**/ } }), (sec + 0.5) * 1000); }
  filt(type, f, q = 1) { const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 0) { const g = this.ac.createGain(); g.gain.value = v; return g; }

  engine() {
    const ac = this.ac;
    const out = this.gain(0);
    const o1 = ac.createOscillator(); o1.type = 'sawtooth';
    const o2 = ac.createOscillator(); o2.type = 'square';
    const lp = this.filt('lowpass', 400, 2);
    const am = ac.createOscillator(); am.frequency.value = 18; const amg = this.gain(0.4);
    const mix = this.gain(0.15);
    am.connect(amg).connect(mix.gain);
    o1.connect(lp); o2.connect(lp); lp.connect(mix).connect(out);
    const nz = this.src('brown', ac.currentTime, 1e6); nz.loop = true; const ng = this.gain(0.25); nz.connect(this.filt('bandpass', 200, 1)).connect(ng).connect(out);
    [o1, o2, am].forEach((o) => o.start());
    return {
      out,
      setRpm: (r, dist) => {
        const t = ac.currentTime;
        o1.frequency.setTargetAtTime(38 + r * 70, t, 0.2); o2.frequency.setTargetAtTime(19 + r * 35, t, 0.2);
        am.frequency.setTargetAtTime(12 + r * 30, t, 0.2);
        lp.frequency.setTargetAtTime(250 + r * 900, t, 0.2);
        out.gain.setTargetAtTime(r > 0 ? (0.08 + r * 0.16) / (1 + dist * 0.15) : 0, t, 0.25);
      },
    };
  }
  chug(add, f = 29, rate = 9.5) {
    const ac = this.ac;
    const o = add(ac.createOscillator()); o.type = 'sawtooth'; o.frequency.value = f;
    const lfo = add(ac.createOscillator()); lfo.frequency.value = rate; const lg = this.gain(0.5);
    const g = this.gain(0.5); lfo.connect(lg).connect(g.gain);
    const lp = this.filt('lowpass', 260, 3);
    o.connect(lp).connect(g); o.start(); lfo.start();
    return g;
  }
  murmur(add, voices) {
    const ac = this.ac, out = this.gain(1);
    for (let i = 0; i < voices; i++) {
      const s = add(ac.createBufferSource()); s.buffer = this.noise('pink'); s.loop = true; s.start(ac.currentTime, Math.random() * 4);
      const f1 = this.filt('bandpass', 500, 6), f2 = this.filt('bandpass', 1500, 8);
      const g = this.gain(0);
      s.connect(f1).connect(g); s.connect(f2).connect(g); g.connect(out);
      // syllable-ish modulation with a slow LFO pair
      const l = add(ac.createOscillator()); l.frequency.value = 2.5 + Math.random() * 2.5; const lg = this.gain(0.35); l.connect(lg).connect(g.gain); l.start();
      const vf = add(ac.createOscillator()); vf.frequency.value = 0.7 + Math.random(); const vg = this.gain(250); vf.connect(vg).connect(f1.frequency); vf.start();
      g.gain.value = 0.15;
    }
    return out;
  }
  creak(dest, heavy) {
    const ac = this.ac, t = ac.currentTime + 0.01, dur = (heavy ? 2.5 : 1.2) + Math.random() * 1.5;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const f0 = heavy ? 55 + Math.random() * 30 : 90 + Math.random() * 120;
    o.frequency.setValueAtTime(f0, t);
    for (let k = 0; k < 6; k++) o.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.4), t + (dur * (k + 1)) / 6);
    const bp = this.filt('bandpass', heavy ? 300 : 700, 9);
    const bp2 = this.filt('bandpass', heavy ? 900 : 1800, 14);
    const g = this.gain(); this.env(g, t, 0.3, heavy ? 0.5 : 0.25, 0.6, t + dur * 0.7);
    // stick-slip tremolo
    const tr = ac.createOscillator(); tr.frequency.value = 18 + Math.random() * 25; const tg = this.gain(0.5); tr.connect(tg).connect(g.gain);
    o.connect(bp).connect(g); o.connect(bp2).connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.8); tr.start(t); tr.stop(t + dur + 0.8);
    this.done([g, dest], dur + 1);
  }
  ropeCreak(dest) {
    const ac = this.ac, t = ac.currentTime, dur = 0.4 + Math.random() * 0.5;
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(300 + Math.random() * 200, t); o.frequency.linearRampToValueAtTime(260 + Math.random() * 300, t + dur);
    const tr = ac.createOscillator(); tr.frequency.value = 35; const tg = this.gain(0.6); const g = this.gain(); this.env(g, t, 0.05, 0.08, dur);
    tr.connect(tg).connect(g.gain); o.connect(this.filt('bandpass', 600, 5)).connect(g).connect(dest);
    o.start(t); tr.start(t); o.stop(t + dur + 0.2); tr.stop(t + dur + 0.2);
    this.done([g, dest], dur + 0.4);
  }
  drip(dest) {
    const ac = this.ac, t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sine';
    const f = 900 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    const g = this.gain(); this.env(g, t, 0.003, 0.12, 0.09);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.2);
    this.done([g, dest], 0.3);
  }
  chime(dest) {
    const ac = this.ac, t = ac.currentTime;
    const base = [523, 659, 784, 880, 1046][Math.floor(Math.random() * 5)] * 0.5;
    const g = this.gain(); this.env(g, t, 0.005, 0.05, 2.5);
    for (const h of [1, 2.76, 5.4]) { const o = ac.createOscillator(); o.frequency.value = base * h; const hg = this.gain(0.4 / h); o.connect(hg).connect(g); o.start(t); o.stop(t + 3); }
    g.connect(dest);
    this.done([g, dest], 3);
  }
  foghorn(dest) {
    const ac = this.ac, t = ac.currentTime, dur = 3.5;
    const g = this.gain(); this.env(g, t, 0.6, 0.6, 1.8, t + dur);
    const lp = this.filt('lowpass', 420, 1);
    for (const f of [92, 92.8, 138]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + dur + 2.5); }
    lp.connect(g).connect(dest);
    this.done([g, dest], dur + 3);
  }
  gull(dest) {
    const ac = this.ac;
    const n = 1 + Math.floor(Math.random() * 3);
    let t = ac.currentTime;
    const out = this.gain(0.13); out.connect(dest);
    for (let i = 0; i < n; i++) {
      const d = 0.25 + Math.random() * 0.25;
      const o = ac.createOscillator(); o.type = 'sawtooth';
      const f = 1500 + Math.random() * 500;
      o.frequency.setValueAtTime(f * 0.7, t); o.frequency.linearRampToValueAtTime(f * 1.25, t + d * 0.3); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + d);
      const vib = ac.createOscillator(); vib.frequency.value = 28; const vg = this.gain(60); vib.connect(vg).connect(o.frequency);
      const bp = this.filt('bandpass', 2200, 2.5);
      const g = this.gain(); this.env(g, t, 0.02, 0.7, d);
      o.connect(bp).connect(g).connect(out);
      o.start(t); o.stop(t + d + 0.1); vib.start(t); vib.stop(t + d + 0.1);
      t += d + 0.05 + Math.random() * 0.15;
    }
    this.done([out, dest], t - ac.currentTime + 0.5);
  }
  tick(dest, v) {
    const ac = this.ac, t = ac.currentTime;
    const s = this.src('white', t, 0.02); const g = this.gain(); this.env(g, t, 0.001, v * (0.3 + Math.random()), 0.015);
    s.connect(this.filt('highpass', 3000 + Math.random() * 4000, 1)).connect(g).connect(dest);
    this.done([g], 0.1);
  }
  // creature voices, all synthesized: growl, huff, screech, chitter, sting, scrape, moanSoft, clicks
  creature(dest, name, k = 1) {
    const ac = this.ac, t = ac.currentTime;
    const out = this.gain(0.5 * k); out.connect(dest);
    const tone = (type, f0, f1, dur, peak, filt) => {
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = this.gain(); this.env(g, t, Math.min(0.08, dur * 0.2), peak, dur * 0.8);
      (filt ? o.connect(filt) : o).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.1);
    };
    const hiss = (type, f, q, dur, peak, a = 0.02) => { const s = this.src(type, t, dur); const g = this.gain(); this.env(g, t, a, peak, dur); s.connect(this.filt('bandpass', f, q)).connect(g).connect(out); };
    let dur = 1;
    if (name === 'growl') {
      dur = 1.4 + Math.random() * 0.6;
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70 + Math.random() * 20;
      const am = ac.createOscillator(); am.frequency.value = 22 + Math.random() * 8; const ag = this.gain(0.5); am.connect(ag);
      const g = this.gain(); this.env(g, t, 0.25, 0.9, dur); ag.connect(g.gain);
      o.connect(this.filt('lowpass', 420, 2)).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.2); am.start(t); am.stop(t + dur + 0.2);
      hiss('brown', 300, 1.5, dur, 0.4, 0.2);
    } else if (name === 'huff') { dur = 0.4; hiss('pink', 700, 1.2, dur, 0.7, 0.01); }
    else if (name === 'screech') { dur = 0.6; tone('sawtooth', 2400, 1500, dur, 0.35, this.filt('bandpass', 2600, 3)); hiss('white', 4500, 2, dur, 0.3); }
    else if (name === 'chitter') { dur = 0.8; for (let i = 0; i < 10; i++) this.click(out, 3000 + Math.random() * 2500, i * 0.06 + Math.random() * 0.03); }
    else if (name === 'sting') { dur = 0.5; hiss('white', 6000, 1, 0.35, 0.8, 0.002); tone('sine', 900, 200, 0.4, 0.3); }
    else if (name === 'scrape') { dur = 2.5; const s = this.src('white', t, dur); const f = this.filt('bandpass', 1400, 9); f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(2100, t + dur); const g = this.gain(); this.env(g, t, 0.6, 0.5, dur * 0.7); s.connect(f).connect(g).connect(out); }
    else if (name === 'moanSoft') { dur = 3; tone('triangle', 180, 120, dur, 0.25, this.filt('bandpass', 400, 3)); }
    else if (name === 'clicks') { dur = 4; this.clicks(out, dur); }
    this.done([out], dur + 1);
  }
  heartbeat(dest) {
    const ac = this.ac, t = ac.currentTime;
    for (const [dt, v] of [[0, 0.5], [0.16, 0.35]]) {
      const o = ac.createOscillator(); o.frequency.setValueAtTime(60, t + dt); o.frequency.exponentialRampToValueAtTime(35, t + dt + 0.12);
      const g = this.gain(); this.env(g, t + dt, 0.005, v, 0.14); o.connect(g).connect(dest); o.start(t + dt); o.stop(t + dt + 0.25);
      this.done([g], 0.5);
    }
  }
  moan(dest) {
    const ac = this.ac, t = ac.currentTime, dur = 5 + Math.random() * 5;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const f = 50 + Math.random() * 40;
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.6, t + dur * 0.4); o.frequency.linearRampToValueAtTime(f * 0.7, t + dur);
    const f1 = this.filt('bandpass', 250, 6); const f2 = this.filt('bandpass', 520, 8);
    f1.frequency.setValueAtTime(220, t); f1.frequency.linearRampToValueAtTime(380, t + dur * 0.5);
    const g = this.gain(); this.env(g, t, dur * 0.35, 0.6, dur * 0.5, t + dur * 0.4);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 1);
    this.done([g, dest], dur + 1.5);
  }
  deepTone(dest, dur, peak = 1) {
    const ac = this.ac, t = ac.currentTime;
    const g = this.gain(); this.env(g, t, Math.min(4, dur * 0.3), peak, Math.min(5, dur * 0.4), t + dur - Math.min(5, dur * 0.4));
    for (const [f, v] of [[27.5, 1], [41.2, 0.6], [55, 0.5], [82.4, 0.2], [27.9, 0.8]]) { const o = ac.createOscillator(); o.frequency.value = f; const og = this.gain(v); o.connect(og).connect(g); o.start(t); o.stop(t + dur + 1); }
    const r = this.src('brown', t, dur); const rg = this.gain(0.8); r.connect(this.filt('lowpass', 90, 1)).connect(rg).connect(g);
    g.connect(dest);
    this.done([g], dur + 2);
  }
  clicks(dest, dur) {
    const ac = this.ac, t0 = ac.currentTime;
    let t = t0 + 0.5, gap = 1.2;
    while (t < t0 + dur) {
      const o = ac.createOscillator(); o.frequency.value = 1800;
      const g = this.gain(); this.env(g, t, 0.001, 0.25, 0.03); o.connect(g).connect(dest); o.start(t); o.stop(t + 0.06);
      t += gap; gap = Math.max(0.12, gap * 0.82);
    }
  }
  thunder(dest, dist) {
    const ac = this.ac, delay = dist / 343, t = ac.currentTime + delay, dur = 3 + Math.random() * 3;
    const s = this.src('brown', t, dur + 1); const g = this.gain();
    const k = Math.min(1, 900 / dist);
    this.env(g, t, 0.08 + dist / 8000, 0.9 * k + 0.1, dur);
    s.connect(this.filt('lowpass', 200 + 1500 * k, 0.7)).connect(g).connect(dest);
    this.done([g], delay + dur + 1);
  }
  click(dest, f = 800, delay = 0) {
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(); o.frequency.value = f; const g = this.gain(); this.env(g, t, 0.002, 0.2, 0.05);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.1); this.done([g], 0.2);
  }
  page(dest) {
    const ac = this.ac, t = ac.currentTime;
    const s = this.src('white', t, 0.4); const g = this.gain(); this.env(g, t, 0.05, 0.15, 0.25);
    s.connect(this.filt('bandpass', 3000, 0.8)).connect(g).connect(dest); this.done([g], 0.6);
  }
  bubbles(dest, n) {
    const ac = this.ac;
    for (let i = 0; i < n; i++) {
      const t = ac.currentTime + Math.random() * 0.6;
      const o = ac.createOscillator(); const f = 300 + Math.random() * 500;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.5, t + 0.06);
      const g = this.gain(); this.env(g, t, 0.005, 0.08, 0.06); o.connect(g).connect(dest); o.start(t); o.stop(t + 0.1); this.done([g], 0.8);
    }
  }
  step(dest, surface, speed) {
    const ac = this.ac, t = ac.currentTime;
    if (surface === 'water') { this.splash(dest, 0.18 + speed * 0.03); return; }
    const s = this.src(surface === 'metal' ? 'white' : 'pink', t, 0.15);
    const conf = { metal: ['bandpass', 2400, 6, 0.25], wood: ['bandpass', 400, 2, 0.35], concrete: ['bandpass', 1100, 1, 0.2], solid: ['bandpass', 1100, 1, 0.2] }[surface] || ['bandpass', 900, 1, 0.2];
    const g = this.gain(); this.env(g, t, 0.004, conf[3] * (0.6 + speed * 0.12), surface === 'metal' ? 0.12 : 0.07);
    s.connect(this.filt(conf[0], conf[1] * (0.9 + Math.random() * 0.2), conf[2])).connect(g).connect(dest);
    if (surface === 'wood' && Math.random() < 0.3) this.ropeCreak(dest);
    this.done([g, dest], 0.4);
  }
  splash(dest, k = 1) {
    const ac = this.ac, t = ac.currentTime;
    const s = this.src('white', t, 1); const g = this.gain(); this.env(g, t, 0.01, 0.35 * k, 0.5 + k * 0.4);
    const f = this.filt('bandpass', 1200, 0.6); f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    s.connect(f).connect(g).connect(dest); this.done([g, dest], 1.5);
  }
  thud(dest, k) {
    const ac = this.ac, t = ac.currentTime;
    const o = ac.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const g = this.gain(); this.env(g, t, 0.005, Math.min(1, 0.3 * k), 0.4); o.connect(g).connect(dest); o.start(t); o.stop(t + 0.6); this.done([g], 0.8);
  }
  // Formant babble: a voice you can't quite make out. Radio voices are band-limited.
  voice(dest, dur, pitch = 1, radio = false) {
    const ac = this.ac, t0 = ac.currentTime + 0.05;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const base = (radio ? 120 : 140 + Math.random() * 60) * pitch;
    const f1 = this.filt('bandpass', 500, 7), f2 = this.filt('bandpass', 1500, 9);
    const g = this.gain(0.0001);
    o.connect(f1).connect(g); o.connect(f2).connect(g);
    const out = this.gain(radio ? 0.9 : 0.5); g.connect(out).connect(dest);
    let t = t0;
    o.frequency.setValueAtTime(base, t);
    while (t < t0 + dur) {
      const syl = 0.09 + Math.random() * 0.16;
      const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      f1.frequency.setTargetAtTime(v[0], t, 0.02); f2.frequency.setTargetAtTime(v[1], t, 0.02);
      o.frequency.setTargetAtTime(base * (0.85 + Math.random() * 0.35), t, 0.05);
      g.gain.setTargetAtTime(0.6, t, 0.015); g.gain.setTargetAtTime(0.05, t + syl * 0.7, 0.02);
      t += syl;
      if (Math.random() < 0.12) t += 0.15 + Math.random() * 0.2; // word gap
    }
    g.gain.setTargetAtTime(0.0001, t, 0.05);
    o.start(t0); o.stop(t + 0.3);
    this.done([out], t - t0 + 0.6);
  }
  breath(dest) {
    const ac = this.ac, t = ac.currentTime;
    const s = this.src('pink', t, 1.6); const g = this.gain(); this.env(g, t, 0.5, 0.05, 0.9);
    s.connect(this.filt('bandpass', 700, 1.2)).connect(g).connect(dest); this.done([g], 2);
    this.bubbles(dest, 4);
  }
  // A lone voice singing an old tune (Night Songs station / the Vigil's hymn)
  sing(dest, dur, pitch = 1) {
    const ac = this.ac, t0 = ac.currentTime + 0.1;
    const tune = [62, 65, 67, 69, 67, 65, 62, 60, 62, 64, 65, 62];
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const vib = ac.createOscillator(); vib.frequency.value = 5.2; const vg = this.gain(4); vib.connect(vg).connect(o.frequency);
    const f1 = this.filt('bandpass', 700, 6), f2 = this.filt('bandpass', 1150, 8);
    const g = this.gain(0.0001); o.connect(f1).connect(g); o.connect(f2).connect(g);
    const out = this.gain(0.5); g.connect(out).connect(dest);
    let t = t0, i = Math.floor(Math.random() * 4);
    while (t < t0 + dur) {
      const n = tune[i++ % tune.length], len = 0.45 + (i % 3 === 0 ? 0.5 : 0);
      o.frequency.setTargetAtTime(440 * Math.pow(2, (n - 69) / 12) * pitch, t, 0.04);
      const v = VOWELS[(i * 3) % VOWELS.length];
      f1.frequency.setTargetAtTime(v[0], t, 0.05); f2.frequency.setTargetAtTime(v[1], t, 0.05);
      g.gain.setTargetAtTime(0.5, t, 0.05); g.gain.setTargetAtTime(0.08, t + len * 0.85, 0.05);
      t += len;
    }
    g.gain.setTargetAtTime(0.0001, t, 0.1);
    o.start(t0); vib.start(t0); o.stop(t + 0.5); vib.stop(t + 0.5);
    this.done([out], t - t0 + 1);
  }
  numbersVoice(dest, dur) {
    const ac = this.ac, t0 = ac.currentTime + 0.1;
    // three pips, then flat monotone syllables
    for (let i = 0; i < 3; i++) { const o = ac.createOscillator(); o.frequency.value = 1000; const g = this.gain(); this.env(g, t0 + i * 0.3, 0.005, 0.2, 0.12); o.connect(g).connect(dest); o.start(t0 + i * 0.3); o.stop(t0 + i * 0.3 + 0.2); this.done([g], 1.2); }
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 105;
    const f1 = this.filt('bandpass', 600, 8), g = this.gain(0.0001);
    o.connect(f1).connect(g).connect(dest);
    let t = t0 + 1.1;
    while (t < t0 + dur) {
      const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      f1.frequency.setValueAtTime(v[0] * 1.2, t);
      g.gain.setTargetAtTime(0.7, t, 0.01); g.gain.setTargetAtTime(0.0001, t + 0.28, 0.03);
      t += 0.55;
    }
    o.start(t0); o.stop(t + 0.3);
    this.done([g], t - t0 + 0.6);
  }
}
