// Tiny synthesized sound kit (Web Audio, no files): chimes, whooshes, soft thuds.
let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }
export function unlock() { ac(); }

function tone(freq, { at = 0, dur = 0.5, type = 'sine', vol = 0.3, attack = 0.01, slideTo = null } = {}) {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// bell = sine + quiet octave partial
function bell(freq, at, vol = 0.22, dur = 1.1) {
  tone(freq, { at, dur, vol });
  tone(freq * 2.01, { at, dur: dur * 0.6, vol: vol * 0.25 });
  tone(freq * 3.02, { at, dur: dur * 0.3, vol: vol * 0.08 });
}

function noise({ at = 0, dur = 0.8, from = 400, to = 2400, vol = 0.12 } = {}) {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];

export const sfx = {
  tap() { tone(880, { dur: 0.08, vol: 0.08, type: 'triangle' }); },
  // More notes the rarer the answer
  valid(tierId) {
    const n = { legendary: 7, rare: 5, uncommon: 4, common: 3 }[tierId] || 3;
    for (let i = 0; i < n; i++) bell(PENTA[i + (tierId === 'legendary' ? 2 : 0)], i * 0.085, 0.2);
    if (tierId === 'legendary' || tierId === 'rare') {
      for (let i = 0; i < 6; i++) tone(2093 + Math.random() * 1200, { at: 0.5 + i * 0.06, dur: 0.25, vol: 0.05 });
    }
  },
  invalid() {
    tone(220, { dur: 0.18, vol: 0.18, type: 'triangle', slideTo: 180 });
    tone(165, { at: 0.12, dur: 0.25, vol: 0.16, type: 'triangle', slideTo: 130 });
  },
  tick(last) { tone(last ? 1320 : 990, { dur: 0.05, vol: 0.07, type: 'square' }); },
  timeout() { tone(660, { dur: 0.9, vol: 0.14, slideTo: 220 }); noise({ dur: 0.9, from: 1800, to: 300, vol: 0.06 }); },
  whoosh() { noise({ dur: 1.1, from: 300, to: 2600, vol: 0.1 }); },
  unlock() { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, i * 0.07, 0.16, 1.4)); },
  start() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.11, 0.18)); noise({ at: 0.2, dur: 1.2, vol: 0.06 }); },
  finish() { [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => bell(f, i * 0.12, 0.2, 1.6)); },
};
