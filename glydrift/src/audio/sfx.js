// Tiny WebAudio synth — no audio files, instant response, unlocked on first touch.
import { Music, rawAudioContext } from "./music.js";
import { Save } from "../data/save.js";

let ctx = null;
let master = null;

/** SFX share Tone's AudioContext (one context = reliable on iOS) with their own volume. */
function ensure() {
  const st = Save.data.settings;
  if (st.muted || (st.sfxVol ?? 0.8) <= 0.001) return null;
  if (!Music.unlocked) return null; // nothing may sound before the first tap
  if (!ctx) {
    ctx = rawAudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  master.gain.value = 0.42 * (st.sfxVol ?? 0.8);
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

// Rising reward notes climb a major pentatonic scale (always consonant, never grating).
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const semis = (base, step) => base * 2 ** (PENTA[Math.min(step, PENTA.length - 1)] / 12);
let lastTick = 0;

const FLAP = {
  volt: () => tone({ type: "square", f0: 520, f1: 900, dur: 0.07, vol: 0.12 }),
  ember: () => tone({ type: "sawtooth", f0: 300, f1: 520, dur: 0.09, vol: 0.1 }),
  shade: () => tone({ type: "sine", f0: 260, f1: 180, dur: 0.1, vol: 0.25 }),
  frost: () => tone({ type: "triangle", f0: 1200, f1: 1600, dur: 0.08, vol: 0.18 }),
  glitch: () =>
    tone({ type: "square", f0: 200 + Math.random() * 600, f1: 90, dur: 0.06, vol: 0.1 }),
  pip: () => tone({ type: "triangle", f0: 1500, f1: 2100, dur: 0.05, vol: 0.14 }),
  coral: () => tone({ type: "sine", f0: 380, f1: 620, dur: 0.09, vol: 0.22 }),
  ruby: () => tone({ type: "triangle", f0: 1800, f1: 2400, dur: 0.04, vol: 0.12 }),
  pengu: () => tone({ type: "sawtooth", f0: 160, f1: 120, dur: 0.1, vol: 0.08 }),
  jelly: () => tone({ type: "sine", f0: 700, f1: 520, dur: 0.12, vol: 0.18 }),
  comet: () => tone({ type: "sawtooth", f0: 220, f1: 440, dur: 0.1, vol: 0.08 }),
  springer: () => tone({ type: "square", f0: 220, f1: 140, dur: 0.05, vol: 0.14 }),
  dzr: () => tone({ type: "sawtooth", f0: 180, f1: 420, dur: 0.08, vol: 0.09 }),
  wallrunner: () => tone({ type: "square", f0: 880, f1: 1320, dur: 0.06, vol: 0.1 }),
  // YARMS: a meaty "whomp" + a floppy wobble
  yarms: () => {
    tone({ type: "sine", f0: 150, f1: 55, dur: 0.14, vol: 0.4 });
    tone({ type: "triangle", f0: 520, f1: 260, dur: 0.09, vol: 0.1, delay: 0.04 });
    tone({ type: "triangle", f0: 300, f1: 420, dur: 0.06, vol: 0.06, delay: 0.12 });
  },
  manny: () => tone({ type: "triangle", f0: 180, f1: 300, dur: 0.1, vol: 0.2 }),
  milzzz: () => tone({ type: "sine", f0: 420, f1: 760, dur: 0.07, vol: 0.2 }),
  leviathan: () => tone({ type: "sine", f0: 140, f1: 90, dur: 0.16, vol: 0.3 }),
  // 손주원: an electric "zzap" over a whoosh of the hover thrusters
  sonjuwon: () => {
    tone({ type: "sawtooth", f0: 1800, f1: 600, dur: 0.06, vol: 0.06 });
    tone({ type: "square", f0: 2400, f1: 900, dur: 0.04, vol: 0.04, delay: 0.02 });
    noise({ dur: 0.18, vol: 0.12, f: 1400 });
  },
  nova: () => {
    tone({ type: "sine", f0: 660, f1: 990, dur: 0.12, vol: 0.2 });
    tone({ type: "sine", f0: 990, f1: 1320, dur: 0.12, vol: 0.1, delay: 0.03 });
  },
};

export const Sfx = {
  unlock: () => Music.unlock(),
  flap: (id) => (FLAP[id] || FLAP.volt)(),
  /** YARMS flex: a stretchy creak + a short synth "hngh" grunt (no voice samples) */
  flex: () => {
    for (let i = 0; i < 3; i++)
      tone({
        type: "square",
        f0: 70 + i * 18,
        f1: 95 + i * 18,
        dur: 0.035,
        vol: 0.05,
        delay: i * 0.04,
      });
    tone({ type: "sawtooth", f0: 190, f1: 150, dur: 0.17, vol: 0.09, delay: 0.1 });
    tone({ type: "sine", f0: 130, f1: 110, dur: 0.2, vol: 0.14, delay: 0.1 });
  },
  /** YARMS death: a deflating "pfffft" */
  deflate: () => {
    noise({ dur: 0.65, vol: 0.16, f: 2400 });
    tone({ type: "sine", f0: 420, f1: 60, dur: 0.6, vol: 0.18 });
  },
  /** 손주원 near-miss: a short static crackle */
  crackle: () => {
    noise({ dur: 0.09, vol: 0.14, f: 7000 });
    noise({ dur: 0.05, vol: 0.1, f: 9000, delay: 0.07 });
    tone({ type: "square", f0: 3200, f1: 1200, dur: 0.03, vol: 0.03, delay: 0.03 });
  },
  /** 손주원 death / new best: a thunder crack and a rolling rumble (synth only) */
  thunder: (k = 1) => {
    noise({ dur: 0.12, vol: 0.32 * k, f: 9000 });
    noise({ dur: 1.1, vol: 0.26 * k, f: 380, delay: 0.05 });
    tone({ type: "sine", f0: 90, f1: 40, dur: 0.9, vol: 0.3 * k, delay: 0.05 });
  },
  /** frog double jump: a springy two-step "boing" */
  doubleJump: () => {
    tone({ type: "sine", f0: 300, f1: 900, dur: 0.12, vol: 0.22 });
    tone({ type: "triangle", f0: 600, f1: 1500, dur: 0.1, vol: 0.12, delay: 0.06 });
  },
  /** step = how many coins in a row (rising notes) */
  coin: (step = 0) => {
    const f = semis(1180, step);
    tone({ type: "triangle", f0: f, f1: f, dur: 0.06, vol: 0.15 });
    tone({ type: "triangle", f0: f * 1.5, f1: f * 1.5, dur: 0.1, vol: 0.11, delay: 0.045 });
    tone({ type: "sine", f0: f * 3, f1: f * 3, dur: 0.05, vol: 0.04, delay: 0.045 }); // sparkle
  },
  /** combo multiplier step (tier 1..4 → x2 x3 x5 x10): a punchy, higher-each-time chime */
  combo: (tier = 1) => {
    const f = semis(520, tier * 2);
    tone({ type: "square", f0: f, f1: f * 1.02, dur: 0.07, vol: 0.07 });
    tone({ type: "triangle", f0: f * 1.5, dur: 0.12, vol: 0.15, delay: 0.06 });
    tone({ type: "triangle", f0: f * 2, dur: 0.16, vol: 0.12, delay: 0.12 });
    noise({ dur: 0.08, vol: 0.12, f: 5000 });
  },
  perfect: () => {
    tone({ type: "triangle", f0: 1568, dur: 0.07, vol: 0.14 });
    tone({ type: "triangle", f0: 2093, dur: 0.14, vol: 0.12, delay: 0.06 });
    tone({ type: "sine", f0: 3136, dur: 0.1, vol: 0.05, delay: 0.06 });
  },
  /** 100 m pop; big = 500 m / 1000 m celebration */
  milestone: (big = 0) => {
    if (!big) {
      tone({ type: "triangle", f0: 880, f1: 1320, dur: 0.1, vol: 0.12 });
      return;
    }
    [0, 4, 7, 12, big > 1 ? 16 : 12].forEach((s, i) =>
      tone({ type: "triangle", f0: 523 * 2 ** (s / 12), dur: 0.16, vol: 0.16, delay: i * 0.07 }),
    );
    noise({ dur: 0.35, vol: 0.18, f: 6000, delay: 0.28 });
    tone({ type: "sine", f0: 130, f1: 65, dur: 0.3, vol: 0.3 });
  },
  /** passing your best mid-run: a bright brass-ish sting */
  newBest: () => {
    [0, 7, 12, 16].forEach((s, i) => {
      const f = 587 * 2 ** (s / 12);
      tone({ type: "sawtooth", f0: f, dur: 0.18, vol: 0.06, delay: i * 0.075 });
      tone({ type: "triangle", f0: f, dur: 0.22, vol: 0.14, delay: i * 0.075 });
    });
    noise({ dur: 0.5, vol: 0.16, f: 7000, delay: 0.3 });
  },
  /** Game Over roll-ups: tiny click, throttled so a fast count never buzzes */
  tick: () => {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    tone({ type: "square", f0: 2400, f1: 1800, dur: 0.018, vol: 0.05 });
  },
  whoosh: () => {
    noise({ dur: 0.45, vol: 0.22, f: 1600 });
    tone({ type: "sine", f0: 300, f1: 900, dur: 0.4, vol: 0.06 });
  },
  levelUp: () => {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
      tone({ type: "triangle", f0: 523 * 2 ** (s / 12), dur: 0.2, vol: 0.15, delay: i * 0.06 }),
    );
    tone({ type: "sine", f0: 98, f1: 196, dur: 0.5, vol: 0.25 });
    noise({ dur: 0.6, vol: 0.14, f: 8000, delay: 0.35 });
  },
  /** hero unlock reveal: a rising swell then a bright hit */
  reveal: () => {
    tone({ type: "sine", f0: 180, f1: 900, dur: 0.9, vol: 0.12 });
    noise({ dur: 0.9, vol: 0.1, f: 2500 });
    [0, 7, 12, 19].forEach((s, i) =>
      tone({
        type: "triangle",
        f0: 659 * 2 ** (s / 12),
        dur: 0.3,
        vol: 0.15,
        delay: 0.9 + i * 0.05,
      }),
    );
  },
  /** a dimension rift opens ahead: a low rising hum */
  riftOpen: () => {
    tone({ type: "sine", f0: 60, f1: 240, dur: 1.4, vol: 0.18 });
    tone({ type: "triangle", f0: 1200, f1: 1800, dur: 1.2, vol: 0.03, delay: 0.3 });
  },
  /** tearing through a rift */
  rift: () => {
    noise({ dur: 0.6, vol: 0.4, f: 4000 });
    tone({ type: "sawtooth", f0: 900, f1: 80, dur: 0.45, vol: 0.12 });
    [0, 7, 12, 19].forEach((s, i) =>
      tone({ type: "sine", f0: 392 * 2 ** (s / 12), dur: 0.4, vol: 0.1, delay: 0.25 + i * 0.05 }),
    );
  },
  chestShake: () => tone({ type: "square", f0: 160, f1: 120, dur: 0.05, vol: 0.08 }),
  chestOpen: () => {
    noise({ dur: 0.25, vol: 0.3, f: 1200 });
    tone({ type: "triangle", f0: 784, f1: 1568, dur: 0.3, vol: 0.18 });
    tone({ type: "sine", f0: 2093, dur: 0.25, vol: 0.08, delay: 0.12 });
  },
  lucky: () => {
    [0, 4, 7, 11, 14].forEach((s, i) =>
      tone({ type: "sine", f0: 784 * 2 ** (s / 12), dur: 0.25, vol: 0.14, delay: i * 0.09 }),
    );
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
