// Tiny WebAudio synth — no audio files, instant response, unlocked on first touch.
import { Save } from "./save.js";

let ctx = null;
let master = null;

function ensure() {
  if (!Save.data.settings.sound) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ type = "sine", f0 = 440, f1 = f0, dur = 0.12, vol = 0.5, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.4, f = 900, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = f;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(filt).connect(g).connect(master);
  src.start(t);
}

const FLAP = {
  volt: () => tone({ type: "square", f0: 520, f1: 900, dur: 0.07, vol: 0.12 }),
  ember: () => tone({ type: "sawtooth", f0: 300, f1: 520, dur: 0.09, vol: 0.1 }),
  shade: () => tone({ type: "sine", f0: 260, f1: 180, dur: 0.1, vol: 0.25 }),
  frost: () => tone({ type: "triangle", f0: 1200, f1: 1600, dur: 0.08, vol: 0.18 }),
  glitch: () =>
    tone({ type: "square", f0: 200 + Math.random() * 600, f1: 90, dur: 0.06, vol: 0.1 }),
  nova: () => {
    tone({ type: "sine", f0: 660, f1: 990, dur: 0.12, vol: 0.2 });
    tone({ type: "sine", f0: 990, f1: 1320, dur: 0.12, vol: 0.1, delay: 0.03 });
  },
};

export const Sfx = {
  unlock: () => ensure(),
  flap: (id) => (FLAP[id] || FLAP.volt)(),
  coin: () => {
    tone({ type: "triangle", f0: 1400, f1: 1400, dur: 0.06, vol: 0.15 });
    tone({ type: "triangle", f0: 2100, f1: 2100, dur: 0.1, vol: 0.12, delay: 0.05 });
  },
  near: () => {
    noise({ dur: 0.25, vol: 0.35, f: 2400 });
    tone({ type: "sine", f0: 400, f1: 1600, dur: 0.25, vol: 0.15 });
  },
  portal: () => tone({ type: "sine", f0: 200, f1: 1200, dur: 0.35, vol: 0.2 }),
  death: () => {
    noise({ dur: 0.7, vol: 0.6, f: 700 });
    tone({ type: "sawtooth", f0: 220, f1: 40, dur: 0.6, vol: 0.2 });
  },
  ui: () => tone({ type: "sine", f0: 700, f1: 1100, dur: 0.06, vol: 0.15 }),
  reward: () => {
    [0, 0.08, 0.16].forEach((d, i) =>
      tone({ type: "triangle", f0: 660 * (1 + i * 0.26), dur: 0.14, vol: 0.18, delay: d }),
    );
  },
  biome: () => tone({ type: "sine", f0: 120, f1: 480, dur: 0.8, vol: 0.18 }),
};
