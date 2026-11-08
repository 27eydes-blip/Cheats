// Tiny WebAudio synth — no audio files, instant response, unlocked on first touch.
import { Music, rawAudioContext } from "./music.js";
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";

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
  if (ctx.state !== "running") {
    // suspended or interrupted (iOS: a call, Siri, the app in the background): ask for it back,
    // but play nothing meanwhile. A stopped audio clock never ends a sound, so every sound made
    // now would sit in the audio graph for good.
    try {
      if (ctx.state !== "closed") ctx.resume().catch(() => {});
    } catch {}
    return null;
  }
  return voices;
}

// Every sound is a few short-lived nodes (source → filter → gain → master). Safari keeps an
// audio node alive for as long as it's connected, even after it has finished, so on long runs
// thousands of dead nodes piled up in the audio graph. Each sound's nodes are disconnected
// as soon as its sources end: a node goes once everything feeding it has ended.
let liveNodes = 0; // sound nodes still connected (test builds read it: window.__glySfx)
function release(node) {
  if (node.__gone) return;
  node.__gone = true;
  liveNodes--;
  try {
    node.disconnect();
  } catch {}
  for (const d of node.__out || []) {
    if (d.__sfx && --d.__ins <= 0) release(d);
  }
  node.__out = null;
}
function track(node, source) {
  liveNodes++;
  node.__sfx = true;
  node.__ins = 0;
  const connect = node.connect;
  node.connect = function (dest, ...rest) {
    (this.__out ||= []).push(dest);
    if (dest?.__sfx) dest.__ins++;
    return connect.call(this, dest, ...rest);
  };
  if (source) node.onended = () => release(node);
  return node;
}
/** The audio context as the sounds see it: the same context, with every node tracked. */
const voices = {
  get currentTime() {
    return ctx.currentTime;
  },
  get sampleRate() {
    return ctx.sampleRate;
  },
  createBuffer: (...a) => ctx.createBuffer(...a),
  createOscillator: () => track(ctx.createOscillator(), true),
  createBufferSource: () => track(ctx.createBufferSource(), true),
  createGain: () => track(ctx.createGain(), false),
  createBiquadFilter: () => track(ctx.createBiquadFilter(), false),
};

function tone({
  type = "sine",
  f0 = 440,
  f1 = f0,
  dur = 0.12,
  vol = 0.5,
  delay = 0,
}) {
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
  for (let i = 0; i < len; i++)
    d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
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

// ---- flight feel: a soft whoosh on every flap (higher as the run speeds up) and a wind bed
// that builds with speed. Both quiet, both under the hero's own flap sound.
let noiseBuf = null;
function whiteNoise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function flapWhoosh(speed) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = whiteNoise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  const f = 700 + speed * 1500; // pitch rises with speed
  bp.frequency.setValueAtTime(f * 0.7, t);
  bp.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 + speed * 0.04, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(bp).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + 0.2);
}
let wind = null;
function windLevel(level) {
  const c = level > 0 ? ensure() : ctx;
  if (!c) return;
  if (!wind) {
    if (level <= 0) return;
    const src = c.createBufferSource();
    src.buffer = whiteNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "bandpass";
    lp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(lp).connect(g).connect(master);
    src.start();
    wind = { src, lp, g, level: 0 };
  }
  if (Math.abs(level - wind.level) < 0.01) return;
  wind.level = level;
  const t = c.currentTime;
  wind.g.gain.setTargetAtTime(level * 0.06, t, 0.25); // smooth: never a step
  wind.lp.frequency.setTargetAtTime(300 + level * 900, t, 0.4);
}

// MATTOE's aura: a quiet low hum (two detuned sines) that swells with speed
let hum = null;
function humLevel(level) {
  const c = level > 0 ? ensure() : ctx;
  if (!c) return;
  if (!hum) {
    if (level <= 0) return;
    const g = c.createGain();
    g.gain.value = 0;
    const oscs = [55, 55.7, 110.4].map((f, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(og).connect(g);
      o.start();
      return o;
    });
    g.connect(master);
    hum = { g, oscs, level: 0 };
  }
  if (Math.abs(level - hum.level) < 0.01) return;
  hum.level = level;
  hum.g.gain.setTargetAtTime(level * 0.05, c.currentTime, 0.3);
}

// SXE's Afterburner: a soft jet-engine hum (a low detuned saw buzz through a lowpass plus a
// breathy band of noise) whose pitch rises with speed. Through `master`, so it follows the
// sound-effects volume and mute.
let jet = null;
function jetLevel(level, pitch) {
  const c = level > 0 ? ensure() : ctx;
  if (!c) return;
  if (!jet) {
    if (level <= 0) return;
    const g = c.createGain();
    g.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const oscs = [0, 1].map((i) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 70 + i * 0.9;
      o.connect(lp);
      o.start();
      return o;
    });
    const src = c.createBufferSource();
    src.buffer = whiteNoise(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    bp.frequency.value = 900;
    const ng = c.createGain();
    ng.gain.value = 0.5;
    src.connect(bp).connect(ng).connect(g);
    src.start();
    lp.connect(g);
    g.connect(master);
    jet = { g, lp, bp, oscs, level: 0, pitch: 0 };
  }
  if (Math.abs(level - jet.level) < 0.01 && Math.abs(pitch - jet.pitch) < 0.01)
    return;
  jet.level = level;
  jet.pitch = pitch;
  const t = c.currentTime;
  jet.g.gain.setTargetAtTime(level * 0.035, t, 0.3);
  jet.oscs.forEach((o, i) =>
    o.frequency.setTargetAtTime(70 + pitch * 60 + i * 0.9, t, 0.4),
  );
  jet.lp.frequency.setTargetAtTime(420 + pitch * 700, t, 0.4);
  jet.bp.frequency.setTargetAtTime(800 + pitch * 1400, t, 0.4);
}

// Rising reward notes climb a major pentatonic scale (always consonant, never grating).
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const semis = (base, step) =>
  base * 2 ** (PENTA[Math.min(step, PENTA.length - 1)] / 12);
let lastTick = 0;

const FLAP = {
  volt: () => tone({ type: "square", f0: 520, f1: 900, dur: 0.07, vol: 0.12 }),
  ember: () =>
    tone({ type: "sawtooth", f0: 300, f1: 520, dur: 0.09, vol: 0.1 }),
  shade: () => tone({ type: "sine", f0: 260, f1: 180, dur: 0.1, vol: 0.25 }),
  frost: () =>
    tone({ type: "triangle", f0: 1200, f1: 1600, dur: 0.08, vol: 0.18 }),
  glitch: () =>
    tone({
      type: "square",
      f0: 200 + Math.random() * 600,
      f1: 90,
      dur: 0.06,
      vol: 0.1,
    }),
  pip: () =>
    tone({ type: "triangle", f0: 1500, f1: 2100, dur: 0.05, vol: 0.14 }),
  coral: () => tone({ type: "sine", f0: 380, f1: 620, dur: 0.09, vol: 0.22 }),
  ruby: () =>
    tone({ type: "triangle", f0: 1800, f1: 2400, dur: 0.04, vol: 0.12 }),
  pengu: () =>
    tone({ type: "sawtooth", f0: 160, f1: 120, dur: 0.1, vol: 0.08 }),
  jelly: () => tone({ type: "sine", f0: 700, f1: 520, dur: 0.12, vol: 0.18 }),
  comet: () =>
    tone({ type: "sawtooth", f0: 220, f1: 440, dur: 0.1, vol: 0.08 }),
  springer: () =>
    tone({ type: "square", f0: 220, f1: 140, dur: 0.05, vol: 0.14 }),
  dzr: () => tone({ type: "sawtooth", f0: 180, f1: 420, dur: 0.08, vol: 0.09 }),
  wallrunner: () =>
    tone({ type: "square", f0: 880, f1: 1320, dur: 0.06, vol: 0.1 }),
  // MATTOE: a squishy little "pop" with a soft energy hum under it
  mattoe: () => {
    tone({ type: "sine", f0: 260, f1: 620, dur: 0.06, vol: 0.28 });
    tone({
      type: "triangle",
      f0: 900,
      f1: 500,
      dur: 0.05,
      vol: 0.06,
      delay: 0.03,
    });
    tone({ type: "sine", f0: 110, f1: 130, dur: 0.18, vol: 0.08 });
  },
  // SXE (id "splice"): a sharp, fast wing whoosh (bright noise + a quick falling chirp of air)
  splice: () => {
    noise({ dur: 0.08, vol: 0.26, f: 4200 });
    tone({ type: "triangle", f0: 900, f1: 260, dur: 0.06, vol: 0.05 });
  },
  // DAWSON: a soft fluttering whoosh with an underwater "bloop"
  dawson: () => {
    noise({ dur: 0.07, vol: 0.12, f: 2400 });
    noise({ dur: 0.05, vol: 0.08, f: 3000, delay: 0.04 });
    tone({ type: "sine", f0: 260, f1: 560, dur: 0.08, vol: 0.22, delay: 0.02 });
  },
  // DEWBERRY: a juicy little "bloop"
  dewberry: () => {
    const p = 0.94 + Math.random() * 0.12;
    tone({ type: "sine", f0: 520 * p, f1: 230 * p, dur: 0.09, vol: 0.26 });
    tone({ type: "triangle", f0: 900 * p, f1: 700 * p, dur: 0.04, vol: 0.05, delay: 0.02 });
  },
  // THE HADDAD: a punchy glove "thwap" (a short noise smack + a low thump under it)
  haddad: () => {
    noise({ dur: 0.05, vol: 0.34, f: 2600 });
    tone({ type: "sine", f0: 190, f1: 70, dur: 0.09, vol: 0.34 });
    tone({ type: "square", f0: 900, f1: 420, dur: 0.025, vol: 0.05 });
  },
  // YARMS: a meaty "whomp" + a floppy wobble
  yarms: () => {
    tone({ type: "sine", f0: 150, f1: 55, dur: 0.14, vol: 0.4 });
    tone({
      type: "triangle",
      f0: 520,
      f1: 260,
      dur: 0.09,
      vol: 0.1,
      delay: 0.04,
    });
    tone({
      type: "triangle",
      f0: 300,
      f1: 420,
      dur: 0.06,
      vol: 0.06,
      delay: 0.12,
    });
  },
  manny: () => tone({ type: "triangle", f0: 180, f1: 300, dur: 0.1, vol: 0.2 }),
  milzzz: () => tone({ type: "sine", f0: 420, f1: 760, dur: 0.07, vol: 0.2 }),
  leviathan: () => tone({ type: "sine", f0: 140, f1: 90, dur: 0.16, vol: 0.3 }),
  // 손주원: an electric "zzap" over a whoosh of the hover thrusters
  sonjuwon: () => {
    tone({ type: "sawtooth", f0: 1800, f1: 600, dur: 0.06, vol: 0.06 });
    tone({
      type: "square",
      f0: 2400,
      f1: 900,
      dur: 0.04,
      vol: 0.04,
      delay: 0.02,
    });
    noise({ dur: 0.18, vol: 0.12, f: 1400 });
  },
  nova: () => {
    tone({ type: "sine", f0: 660, f1: 990, dur: 0.12, vol: 0.2 });
    tone({ type: "sine", f0: 990, f1: 1320, dur: 0.12, vol: 0.1, delay: 0.03 });
  },
};

// The animal heroes' own sounds (all synthesised): flap, plus reactions on near-misses,
// new bests, deaths and Second Chance revives.
const T = (type, f0, f1, dur, vol, delay = 0) =>
  tone({ type, f0, f1, dur, vol, delay });
const ting = (f, delay = 0, vol = 0.08) => {
  T("triangle", f, f, 0.06, vol, delay);
  T("sine", f * 2, f * 2, 0.08, vol * 0.4, delay);
};
const shatter = () => {
  noise({ dur: 0.45, vol: 0.16, f: 7000 });
  [2600, 3300, 2900, 3900].forEach((f, i) => ting(f, 0.03 + i * 0.05, 0.06));
};
const splash = () => {
  noise({ dur: 0.4, vol: 0.2, f: 1800 });
  T("sine", 600, 200, 0.18, 0.12);
};
const pops = (n = 4) => {
  for (let i = 0; i < n; i++)
    T("sine", 700 + i * 90, 1300 + i * 90, 0.05, 0.12, i * 0.06);
};
const ANIMAL_SFX = {
  // ---- DRIFT PASS+ · Season 1
  voidcat: {
    flap: () => {
      T("sine", 1400, 2100, 0.05, 0.05);
      ting(2600 + Math.random() * 600, 0.02, 0.04); // a star chime
    },
    near: () => T("triangle", 700, 1100, 0.08, 0.08), // a little "mrrp"
    best: () =>
      [1320, 1660, 1980, 2640].forEach((f, i) => ting(f, i * 0.06, 0.06)),
    death: () => {
      T("triangle", 900, 300, 0.35, 0.1);
      [3000, 2400, 3600].forEach((f, i) => ting(f, 0.1 + i * 0.07, 0.04));
    },
  },
  hexowl: {
    flap: () => noise({ dur: 0.08, vol: 0.08, f: 1400 }),
    near: () => {
      T("square", 220, 220, 0.06, 0.05);
      T("sine", 440, 660, 0.12, 0.08, 0.03); // a rune hum
    },
    best: () => {
      T("sine", 330, 330, 0.25, 0.1);
      T("sine", 247, 247, 0.3, 0.08, 0.18); // "hoo-hoo"
    },
    death: () => {
      noise({ dur: 0.4, vol: 0.14, f: 1600 });
      T("sine", 300, 120, 0.4, 0.1);
    },
  },
  wraithmoth: {
    flap: () => noise({ dur: 0.06, vol: 0.06, f: 3200 }),
    near: () => T("sine", 1200, 700, 0.18, 0.05),
    best: () => {
      noise({ dur: 0.5, vol: 0.08, f: 5000 });
      T("sine", 600, 1200, 0.4, 0.06);
    },
    death: () => {
      noise({ dur: 0.6, vol: 0.12, f: 2600 });
      T("sine", 900, 200, 0.5, 0.06);
    },
  },
  triphound: {
    flap: () => {
      // the next head barks (three slightly different yaps)
      const f = [520, 600, 460][
        (ANIMAL_SFX.triphound.n = ((ANIMAL_SFX.triphound.n || 0) + 1) % 3)
      ];
      T("square", f, f * 0.7, 0.06, 0.06);
      T("sawtooth", f * 0.5, f * 0.35, 0.07, 0.04, 0.01);
    },
    near: () =>
      [500, 580, 460].forEach((f, i) =>
        T("square", f, f * 0.7, 0.05, 0.05, i * 0.05),
      ),
    best: () =>
      [700, 760, 640].forEach((f, i) =>
        T("triangle", f, f * 1.3, 0.2, 0.07, i * 0.04),
      ),
    death: () => {
      T("triangle", 900, 400, 0.3, 0.08);
      noise({ dur: 0.4, vol: 0.12, f: 800 });
    },
  },
  phantomray: {
    flap: () => T("sine", 180, 260, 0.2, 0.08), // a soft underwater swell, no wingbeat
    near: () => noise({ dur: 0.18, vol: 0.06, f: 900 }),
    best: () => T("sine", 200, 600, 0.6, 0.09),
    death: () => {
      noise({ dur: 0.7, vol: 0.14, f: 600 });
      T("sine", 300, 80, 0.6, 0.1);
    },
  },
  scorpyre: {
    flap: () => {
      noise({ dur: 0.05, vol: 0.08, f: 6000 }); // spark crackle
      T("square", 1800, 900, 0.03, 0.03);
    },
    near: () =>
      [2400, 3100].forEach((f, i) =>
        T("square", f, f * 0.6, 0.025, 0.04, i * 0.03),
      ),
    best: () => {
      noise({ dur: 0.5, vol: 0.14, f: 1200 });
      T("sawtooth", 160, 320, 0.4, 0.06);
    },
    death: () => {
      noise({ dur: 0.7, vol: 0.18, f: 1000 });
      T("sawtooth", 200, 60, 0.6, 0.08);
    },
  },
  krakkie: {
    flap: () => T("sine", 300, 600, 0.07, 0.1), // a little "bloop"
    near: () => pops(2),
    best: () => pops(5),
    death: () => {
      splash();
      pops(3);
    },
  },
  crimsonmantis: {
    flap: () => noise({ dur: 0.05, vol: 0.06, f: 4200 }),
    near: () => {
      // the slash: a fast high swish + a blade ring
      noise({ dur: 0.12, vol: 0.12, f: 7000 });
      ting(3400, 0.05, 0.05);
    },
    best: () =>
      [0, 0.08, 0.16].forEach((d) =>
        noise({ dur: 0.1, vol: 0.1, f: 7000, delay: d }),
      ),
    death: () => {
      shatter();
      T("sawtooth", 400, 120, 0.3, 0.05);
    },
  },
  gloomeleon: {
    flap: () => T("triangle", 420, 520, 0.05, 0.06),
    near: () => T("sine", 900, 1400, 0.08, 0.05),
    best: () => {
      // fading out of sight: a rising shimmer
      [880, 1100, 1320, 1760].forEach((f, i) =>
        T("sine", f, f * 1.02, 0.18, 0.05, i * 0.07),
      );
    },
    death: () => {
      T("triangle", 700, 200, 0.4, 0.08);
      noise({ dur: 0.3, vol: 0.08, f: 3000 });
    },
  },
  umbradrake: {
    flap: () => {
      noise({ dur: 0.1, vol: 0.1, f: 700 }); // a heavy little wingbeat
      T("sine", 140, 90, 0.12, 0.12);
    },
    near: () => T("sawtooth", 260, 180, 0.12, 0.05),
    best: () => {
      // dark fire breath: a roar into a roaring flame
      T("sawtooth", 180, 90, 0.5, 0.1);
      noise({ dur: 0.9, vol: 0.18, f: 900, delay: 0.08 });
    },
    death: () => {
      // the firestorm
      noise({ dur: 1.1, vol: 0.2, f: 700 });
      T("sawtooth", 120, 40, 1, 0.12);
      T("sine", 60, 40, 0.9, 0.2, 0.3);
    },
  },
  // peaceful
  bunbun: {
    flap: () => T("triangle", 600, 900, 0.05, 0.12),
    death: () => T("triangle", 1300, 500, 0.2, 0.12),
  },
  puddles: {
    flap: () => {
      T("square", 430, 300, 0.09, 0.08);
      T("sawtooth", 380, 270, 0.08, 0.05, 0.01);
    },
    death: splash,
  },
  snoozy: {
    flap: () => T("sine", 320, 240, 0.12, 0.18),
    death: () => T("sine", 300, 90, 0.7, 0.16),
  },
  kai: {
    flap: () => {
      T("sine", 500, 900, 0.06, 0.18);
      T("sine", 900, 1300, 0.05, 0.08, 0.05);
    },
    death: splash,
  },
  bao: {
    flap: () => {
      T("sine", 220, 220, 0.22, 0.16);
      T("triangle", 660, 660, 0.12, 0.05);
    },
    death: () => {
      T("sine", 180, 170, 0.9, 0.2);
      T("sine", 360, 350, 0.7, 0.06);
    },
  },
  // prism
  glassfrog: { flap: () => ting(2400), death: shatter },
  shardcrab: {
    flap: () => {
      T("square", 1800, 1700, 0.02, 0.07);
      T("square", 1900, 1800, 0.02, 0.07, 0.06);
    },
    death: shatter,
  },
  flicker: {
    flap: () => T("triangle", 1600, 2100, 0.04, 0.06),
    death: shatter,
  },
  spectra: {
    flap: () => ting(1760, 0, 0.06),
    near: () => {
      noise({ dur: 0.25, vol: 0.1, f: 4000 });
      [1320, 1760, 2200].forEach((f, i) => ting(f, i * 0.04, 0.06));
    },
    death: shatter,
  },
  prismara: {
    flap: () => {
      T("triangle", 1100, 1500, 0.06, 0.08);
      ting(2600, 0.04, 0.04);
    },
    revive: () =>
      [0, 4, 7, 12, 16].forEach((st, i) =>
        ting(880 * 2 ** (st / 12), i * 0.06, 0.08),
      ),
    death: shatter,
  },
  // abyss
  gloombat: {
    flap: () => T("triangle", 2300, 1800, 0.04, 0.06),
    death: () => T("sine", 900, 120, 0.4, 0.12),
  },
  grimrat: {
    flap: () =>
      [900, 1150, 800].forEach((f, i) =>
        T("square", f, f * 0.9, 0.018, 0.06, i * 0.03),
      ),
    death: () =>
      [700, 900, 600, 1000, 500].forEach((f, i) =>
        T("square", f, f, 0.02, 0.06, i * 0.04),
      ),
  },
  murktoad: {
    flap: () => T("sine", 260, 160, 0.08, 0.2),
    near: () => {
      T("sawtooth", 150, 110, 0.12, 0.09);
      T("sawtooth", 140, 100, 0.14, 0.09, 0.15);
    },
    death: () => {
      noise({ dur: 0.3, vol: 0.2, f: 500 });
      T("sine", 200, 60, 0.3, 0.2);
    },
  },
  hollowcrow: {
    flap: () => T("sawtooth", 720, 520, 0.11, 0.06),
    death: () => T("sawtooth", 800, 300, 0.4, 0.07),
  },
  lurkeel: {
    flap: () => noise({ dur: 0.12, vol: 0.1, f: 1200 }),
    death: () => T("sine", 400, 60, 0.5, 0.15),
  },
  ashspider: {
    flap: () =>
      [0, 0.04, 0.08].forEach((d) => T("square", 3000, 2800, 0.012, 0.04, d)),
    death: () => {
      noise({ dur: 0.3, vol: 0.14, f: 3000 });
      T("sawtooth", 300, 80, 0.3, 0.06);
    },
  },
  anglerfiend: {
    flap: () => T("sine", 160, 260, 0.1, 0.22),
    death: () => T("sine", 220, 40, 0.6, 0.2),
  },
  riftwolf: {
    flap: () => noise({ dur: 0.14, vol: 0.12, f: 900 }),
    best: () => {
      T("sine", 300, 620, 0.45, 0.16);
      T("sine", 620, 420, 0.6, 0.16, 0.45);
      T("triangle", 600, 1240, 0.45, 0.04);
    },
    death: () => T("sine", 500, 150, 0.6, 0.14),
  },
  grimvulture: {
    flap: () => {
      noise({ dur: 0.16, vol: 0.12, f: 500 });
      T("sine", 140, 90, 0.12, 0.12);
    },
    death: () => T("sawtooth", 1200, 600, 0.5, 0.06),
  },
  levijr: {
    flap: () => T("sine", 110, 70, 0.18, 0.3),
    death: () => {
      [1600, 2100, 1300].forEach((f, i) =>
        T("square", f, f * 0.8, 0.03, 0.06, i * 0.03),
      );
      T("sawtooth", 140, 55, 0.9, 0.14, 0.12);
      noise({ dur: 0.9, vol: 0.16, f: 450, delay: 0.12 });
    },
  },
  // christmas
  mittens: {
    flap: () => {
      T("triangle", 900, 1300, 0.07, 0.08);
      T("triangle", 1300, 1000, 0.08, 0.06, 0.07);
    },
    death: () => T("triangle", 1200, 500, 0.3, 0.1),
  },
  pengo: {
    flap: () => {
      noise({ dur: 0.04, vol: 0.12, f: 3000 });
      T("square", 900, 1200, 0.04, 0.05, 0.02);
    },
    death: () => {
      noise({ dur: 0.55, vol: 0.12, f: 2600 });
      T("sine", 500, 300, 0.5, 0.08);
    },
  },
  hollyhog: {
    flap: () => noise({ dur: 0.05, vol: 0.1, f: 2200 }),
    near: () => pops(3),
    death: () => pops(6),
  },
  frostfox: {
    flap: () => ting(2000, 0, 0.07),
    death: () => [2600, 2200, 1800].forEach((f, i) => ting(f, i * 0.07)),
  },
  jinglemoose: {
    flap: () =>
      [2600, 3150, 2800, 3400].forEach((f, i) => ting(f, i * 0.035, 0.05)),
    death: () =>
      [3400, 2600, 3100, 2300, 2800].forEach((f, i) => ting(f, i * 0.06, 0.06)),
  },
  cocoacub: {
    flap: () => T("sine", 240, 320, 0.08, 0.16),
    death: () => {
      T("sine", 300, 150, 0.2, 0.15);
      pops(5);
    },
  },
  snowl: {
    flap: () => noise({ dur: 0.1, vol: 0.08, f: 1500 }),
    best: () => {
      T("sine", 440, 400, 0.22, 0.2);
      T("sine", 420, 380, 0.3, 0.2, 0.3);
    },
    death: () => [2400, 2000, 2800].forEach((f, i) => ting(f, i * 0.06)),
  },
  glowotter: {
    flap: () => {
      T("triangle", 1200, 1600, 0.05, 0.08);
      ting(2400, 0.05, 0.04);
    },
    death: () =>
      [0, 2, 4, 7, 9].forEach((st, i) =>
        ting(1046 * 2 ** (st / 12), i * 0.05, 0.06),
      ),
  },
  captainacorn: {
    flap: () =>
      [0, 0.03, 0.06, 0.09].forEach((d) =>
        T("square", 140, 160, 0.02, 0.06, d),
      ),
    death: () => {
      noise({ dur: 0.2, vol: 0.14, f: 2500 });
      pops(4);
    },
  },
  aurorastag: {
    flap: () =>
      [0, 4, 7].forEach((st, i) => ting(1320 * 2 ** (st / 12), i * 0.03, 0.05)),
    death: () =>
      [12, 7, 4, 0].forEach((st, i) =>
        ting(660 * 2 ** (st / 12), i * 0.08, 0.08),
      ),
  },
};

// ------------------------------------------------------------------ JAMAL's strange noises
// Every flap is one of these, picked at random (never the same twice in a row), all
// synthesized here (no recordings). p: pitch multiplier, v: volume multiplier. They play
// through `master`, so they follow the sound-effects volume and mute.
const T2 = (type, f0, f1, dur, vol, delay = 0) => tone({ type, f0, f1, dur, vol, delay });
const JAMAL_NOISES = [
  // snort: a short breathy rasp over a low buzz
  (p, v) => {
    noise({ dur: 0.1, vol: 0.32 * v, f: 700 * p });
    T2("sawtooth", 120 * p, 80 * p, 0.1, 0.12 * v);
  },
  // honk: a goose-ish double reed
  (p, v) => {
    T2("square", 420 * p, 370 * p, 0.16, 0.13 * v);
    T2("sawtooth", 210 * p, 190 * p, 0.16, 0.1 * v);
  },
  // wheeze: a thin whistling breath in
  (p, v) => {
    noise({ dur: 0.2, vol: 0.22 * v, f: 3200 * p });
    T2("sine", 900 * p, 1350 * p, 0.2, 0.06 * v);
  },
  // squeaky-toy squeak: up, then down
  (p, v) => {
    T2("sine", 1400 * p, 2300 * p, 0.07, 0.2 * v);
    T2("sine", 2300 * p, 1500 * p, 0.08, 0.18 * v, 0.07);
  },
  // grunt: a low push of air
  (p, v) => {
    T2("sawtooth", 115 * p, 78 * p, 0.12, 0.2 * v);
    noise({ dur: 0.08, vol: 0.14 * v, f: 380 * p });
  },
  // gurgle: four quick wet blips
  (p, v) => {
    [0, 0.04, 0.08, 0.12].forEach((d, i) =>
      T2("sine", (260 + ((i * 97) % 140)) * p, (180 + i * 30) * p, 0.04, 0.16 * v, d),
    );
  },
  // tiny sneeze: a squeaky "a-" and a sharp "choo"
  (p, v) => {
    T2("triangle", 900 * p, 1500 * p, 0.05, 0.08 * v);
    noise({ dur: 0.05, vol: 0.3 * v, f: 5200 * p, delay: 0.06 });
  },
  // "hrrrk": a throaty rattle (three fast pulses)
  (p, v) => {
    [0, 0.05, 0.1].forEach((d) => T2("sawtooth", 170 * p, 230 * p, 0.04, 0.14 * v, d));
    noise({ dur: 0.15, vol: 0.12 * v, f: 950 * p });
  },
  // warbly howl: a wobbling rise and fall
  (p, v) => {
    [500, 680, 560, 760, 620].forEach((f, i) =>
      T2("triangle", f * p, (f + (i % 2 ? -110 : 110)) * p, 0.07, 0.1 * v, i * 0.06),
    );
  },
  // raspberry: a flappy "pbbbt"
  (p, v) => {
    T2("square", 88 * p, 76 * p, 0.2, 0.12 * v);
    noise({ dur: 0.18, vol: 0.16 * v, f: 1300 * p });
  },
  // hiccup: a tiny chirp with a catch
  (p, v) => {
    T2("sine", 520 * p, 980 * p, 0.045, 0.22 * v);
    T2("square", 300 * p, 260 * p, 0.03, 0.05 * v, 0.03);
  },
  // bark-burp: a yap that collapses into a burp
  (p, v) => {
    T2("square", 270 * p, 150 * p, 0.09, 0.14 * v);
    T2("sawtooth", 120 * p, 66 * p, 0.2, 0.14 * v, 0.06);
  },
  // blep: a soft wet little pop
  (p, v) => T2("sine", 760 * p, 380 * p, 0.06, 0.22 * v),
  // yip: a bright tiny bark
  (p, v) => {
    T2("square", 900 * p, 640 * p, 0.05, 0.1 * v);
    T2("triangle", 1300 * p, 900 * p, 0.04, 0.06 * v, 0.01);
  },
];
let lastJamal = -1;
/** JAMAL's flap: a random noise, never the last one, pitched up with speed (0..1) and combo. */
function jamalFlap({ speed = 0, combo = 1 } = {}) {
  const mode = Save.data.settings.jamalNoise || "on";
  if (mode === "off") {
    noise({ dur: 0.04, vol: 0.08, f: 1500 }); // just a soft paw-flap
    return null;
  }
  let i = Math.floor(Math.random() * JAMAL_NOISES.length);
  if (i === lastJamal) i = (i + 1 + Math.floor(Math.random() * (JAMAL_NOISES.length - 1))) % JAMAL_NOISES.length;
  lastJamal = i;
  const rise = 1 + 0.22 * Math.max(0, Math.min(1, speed)) + 0.025 * Math.max(0, Math.min(9, combo - 1));
  const p = (0.9 + Math.random() * 0.2) * rise;
  const v = mode === "quiet" ? 0.4 : 1;
  JAMAL_NOISES[i](p, v);
  return { i, p, v }; // (tests read which noise, its pitch and volume)
}
/** JAMAL's big moments: "honk" (new best), "wheeze" (death), "sneeze" (idle). */
function jamalMoment(evt) {
  const mode = Save.data.settings.jamalNoise || "on";
  if (mode === "off") return;
  const v = mode === "quiet" ? 0.4 : 1;
  if (evt === "honk") {
    // a loud triumphant double honk
    [0, 0.2].forEach((d, k) => {
      T2("square", 440 + k * 60, 400 + k * 60, 0.18, 0.2 * v, d);
      T2("sawtooth", 220 + k * 30, 200 + k * 30, 0.18, 0.15 * v, d);
    });
  } else if (evt === "wheeze") {
    // a long, dramatic wheeze that runs out of air
    noise({ dur: 1.2, vol: 0.26 * v, f: 2800 });
    T2("sine", 1200, 380, 1.2, 0.07 * v);
    T2("sawtooth", 160, 70, 0.5, 0.06 * v, 0.8);
  } else if (evt === "sneeze") {
    JAMAL_NOISES[6](1, 0.7 * v);
  }
}

// Big moments for DAWSON and DEWBERRY (original synth sounds, through the SFX volume)
const MOMENTS = {
  dawson: {
    near: () => [2200, 2900].forEach((f, i) => tone({ type: "sine", f0: f, f1: f * 1.2, dur: 0.06, vol: 0.06, delay: i * 0.05 })),
    best: () => {
      // a shimmer up the scale and a happy chomp
      [880, 1100, 1320, 1760, 2200].forEach((f, i) =>
        tone({ type: "triangle", f0: f, f1: f * 1.05, dur: 0.1, vol: 0.06, delay: i * 0.05 }),
      );
      noise({ dur: 0.05, vol: 0.3, f: 1800, delay: 0.3 });
      tone({ type: "square", f0: 180, f1: 90, dur: 0.07, vol: 0.12, delay: 0.3 });
    },
    death: () => {
      // glassy scales shattering, then a splash of bubbles
      [3200, 2600, 3800, 2900].forEach((f, i) => tone({ type: "sine", f0: f, f1: f * 0.8, dur: 0.08, vol: 0.05, delay: i * 0.04 }));
      [0.15, 0.22, 0.3, 0.4].forEach((d, i) => tone({ type: "sine", f0: 300 + i * 90, f1: 700 + i * 120, dur: 0.06, vol: 0.12, delay: d }));
      noise({ dur: 0.3, vol: 0.14, f: 900, delay: 0.12 });
    },
    // Chomp Combo: a snappy double jaw-clack with a low thump
    chomp: () => {
      noise({ dur: 0.04, vol: 0.34, f: 2400 });
      tone({ type: "square", f0: 220, f1: 70, dur: 0.08, vol: 0.14 });
      noise({ dur: 0.04, vol: 0.28, f: 2000, delay: 0.09 });
      tone({ type: "square", f0: 180, f1: 60, dur: 0.07, vol: 0.12, delay: 0.09 });
    },
    // Feeding Frenzy: a rising growl with a glint on top
    frenzy: () => {
      tone({ type: "sawtooth", f0: 90, f1: 180, dur: 0.3, vol: 0.08 });
      [1760, 2640].forEach((f, i) => tone({ type: "sine", f0: f, f1: f * 1.1, dur: 0.08, vol: 0.06, delay: 0.2 + i * 0.06 }));
    },
    // the signature combo step: a bubbly shimmer, higher with every step
    combo: (step = 1) => {
      const k = 1 + (Math.max(1, step) - 1) * 0.12;
      [0, 0.04, 0.08].forEach((d, i) =>
        tone({ type: "sine", f0: (420 + i * 160) * k, f1: (900 + i * 220) * k, dur: 0.05, vol: 0.08, delay: d }),
      );
      [1800, 2400].forEach((f, i) => tone({ type: "triangle", f0: f * k, f1: f * k * 1.06, dur: 0.12, vol: 0.04, delay: 0.1 + i * 0.05 }));
    },
  },
  dewberry: {
    near: () => tone({ type: "sine", f0: 700, f1: 1100, dur: 0.1, vol: 0.12 }),
    best: () =>
      // a sweet chime
      [1047, 1319, 1568, 2093].forEach((f, i) =>
        tone({ type: "sine", f0: f, f1: f, dur: 0.22, vol: 0.12, delay: i * 0.08 }),
      ),
    death: () => {
      // a juicy splat
      noise({ dur: 0.12, vol: 0.32, f: 700 });
      tone({ type: "sine", f0: 400, f1: 90, dur: 0.16, vol: 0.28 });
      [0.08, 0.14, 0.2].forEach((d, i) => tone({ type: "sine", f0: 900 - i * 150, f1: 400, dur: 0.05, vol: 0.08, delay: d }));
    },
  },
};

export const Sfx = {
  unlock: () => Music.unlock(),
  /** ctx (JAMAL): { speed 0..1, combo } raise his noises' pitch. */
  flap: (id, ctx) =>
    id === "jamal" ? jamalFlap(ctx) : (FLAP[id] || ANIMAL_SFX[id]?.flap || FLAP.volt)(),
  /** JAMAL: "honk" | "wheeze" | "sneeze" (follow his Jamal noises setting). */
  jamal: (evt) => jamalMoment(evt),
  /** DAWSON / DEWBERRY: "near" | "best" | "death". */
  moment: (id, evt, arg) => MOMENTS[id]?.[evt]?.(arg),
  /** An animal hero's own reaction sound: "near" | "best" | "death" | "revive". */
  hero: (id, evt) => ANIMAL_SFX[id]?.[evt]?.(),
  /** A soft whoosh under every flap; `speed` 0..1 raises its pitch. */
  flapWhoosh: (speed = 0) => flapWhoosh(speed),
  /** The wind bed: 0 = silent (menus, pause, death), 1 = top speed. Changes are smoothed. */
  wind: (level) => windLevel(Math.max(0, Math.min(1, level))),
  /** SXE's Afterburner engine hum: level 0 = silent; pitch 0..1 rises with speed */
  jetHum: (level, pitch = 0) =>
    jetLevel(Math.max(0, Math.min(1, level)), Math.max(0, Math.min(1, pitch))),
  /** SXE flap with the Afterburner: a short "fwoom" (a noise swell + a low sweep) */
  afterburner: (speed = 0) => {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = whiteNoise(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(380 + speed * 200, t);
    bp.frequency.exponentialRampToValueAtTime(1600 + speed * 600, t + 0.22);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + 0.32);
    tone({ type: "sawtooth", f0: 90, f1: 180, dur: 0.2, vol: 0.06 });
  },
  /** SXE new best with the Afterburner: a deep sonic "boom" */
  sonicBoom: () => {
    tone({ type: "sine", f0: 120, f1: 32, dur: 0.7, vol: 0.5 });
    tone({
      type: "triangle",
      f0: 70,
      f1: 28,
      dur: 0.6,
      vol: 0.25,
      delay: 0.02,
    });
    noise({ dur: 0.5, vol: 0.4, f: 700 });
    noise({ dur: 0.9, vol: 0.12, f: 220, delay: 0.05 });
  },
  /** SXE death with the Afterburner: the engines cough and sputter out */
  engineSputter: () => {
    [0, 0.12, 0.27, 0.45].forEach((d, i) => {
      noise({ dur: 0.08, vol: 0.28 - i * 0.05, f: 900 - i * 150, delay: d });
      tone({
        type: "square",
        f0: 110 - i * 15,
        f1: 60,
        dur: 0.07,
        vol: 0.06,
        delay: d,
      });
    });
    tone({ type: "sawtooth", f0: 140, f1: 40, dur: 0.8, vol: 0.05 });
  },
  /** MATTOE's aura hum (0 = silent) */
  auraHum: (level) => humLevel(Math.max(0, Math.min(1, level))),
  /** MATTOE new best: a deep rising "power-up" with a bright crown */
  powerUp: () => {
    tone({ type: "sawtooth", f0: 55, f1: 220, dur: 0.9, vol: 0.12 });
    tone({ type: "sine", f0: 80, f1: 320, dur: 0.9, vol: 0.22 });
    noise({ dur: 0.8, vol: 0.1, f: 1800 });
    [0, 7, 12, 19].forEach((st, i) =>
      tone({
        type: "triangle",
        f0: 523 * 2 ** (st / 12),
        dur: 0.3,
        vol: 0.1,
        delay: 0.75 + i * 0.05,
      }),
    );
  },
  /** SXE new best: a fierce falcon screech, "kee-kee!" (synth only: no recordings) */
  falconScreech: () => {
    for (const [d, k] of [
      [0, 1],
      [0.16, 0.92],
    ]) {
      tone({
        type: "sawtooth",
        f0: 2500 * k,
        f1: 1500 * k,
        dur: 0.15,
        vol: 0.07,
        delay: d,
      });
      tone({
        type: "square",
        f0: 3300 * k,
        f1: 2100 * k,
        dur: 0.12,
        vol: 0.035,
        delay: d + 0.01,
      });
      tone({
        type: "sine",
        f0: 1700 * k,
        f1: 1250 * k,
        dur: 0.16,
        vol: 0.09,
        delay: d,
      });
    }
    noise({ dur: 0.3, vol: 0.06, f: 6500 });
    // the boom under it
    tone({ type: "sine", f0: 120, f1: 45, dur: 0.35, vol: 0.28, delay: 0.02 });
  },
  /** SXE death: a burst of feathers and a fading rush of wind */
  featherBurst: () => {
    noise({ dur: 0.18, vol: 0.22, f: 3200 });
    tone({ type: "triangle", f0: 700, f1: 240, dur: 0.12, vol: 0.06 });
    noise({ dur: 1.3, vol: 0.12, f: 700, delay: 0.08 });
  },
  /** MATTOE death: a cartoony "bonk" (hollow wood knock + pitch drop) */
  bonk: () => {
    tone({ type: "square", f0: 520, f1: 180, dur: 0.08, vol: 0.12 });
    tone({ type: "sine", f0: 340, f1: 90, dur: 0.22, vol: 0.32 });
    tone({
      type: "triangle",
      f0: 1400,
      f1: 900,
      dur: 0.05,
      vol: 0.06,
      delay: 0.02,
    });
  },
  /** THE HADDAD's new best: a boxing-ring bell, "ding ding" (struck metal partials) */
  bell: () => {
    for (const d of [0, 0.26])
      for (const [f, v, dur] of [
        [1180, 0.16, 0.9],
        [2832, 0.06, 0.6],
        [3906, 0.035, 0.4],
        [590, 0.05, 0.7],
      ])
        tone({ type: "sine", f0: f, f1: f * 0.995, dur, vol: v, delay: d });
  },
  /** THE HADDAD's knockout: a heavy body "thud" on the canvas */
  thud: () => {
    tone({ type: "sine", f0: 120, f1: 38, dur: 0.32, vol: 0.5 });
    noise({ dur: 0.16, vol: 0.28, f: 420 });
    tone({ type: "triangle", f0: 70, f1: 45, dur: 0.2, vol: 0.18, delay: 0.05 });
  },
  /** MATTOE's aura shatters like glass: bright noise tinkles */
  shatter: () => {
    noise({ dur: 0.35, vol: 0.18, f: 7500 });
    [0, 1, 2, 3, 4].forEach((i) =>
      tone({
        type: "triangle",
        f0: 2600 + i * 420,
        dur: 0.06,
        vol: 0.05,
        delay: 0.04 + i * 0.045,
      }),
    );
  },
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
    tone({
      type: "sawtooth",
      f0: 190,
      f1: 150,
      dur: 0.17,
      vol: 0.09,
      delay: 0.1,
    });
    tone({ type: "sine", f0: 130, f1: 110, dur: 0.2, vol: 0.14, delay: 0.1 });
  },
  /** YARMS death: a deflating "pfffft" */
  deflate: () => {
    noise({ dur: 0.65, vol: 0.16, f: 2400 });
    tone({ type: "sine", f0: 420, f1: 60, dur: 0.6, vol: 0.18 });
  },
  /** RONIN's Fire Ward: a hiss as the flames slide off */
  hiss: () => {
    noise({ dur: 0.32, vol: 0.18, f: 6500 });
    tone({ type: "sine", f0: 900, f1: 300, dur: 0.25, vol: 0.05 });
  },
  /** 손주원 near-miss: a short static crackle */
  crackle: () => {
    noise({ dur: 0.09, vol: 0.14, f: 7000 });
    noise({ dur: 0.05, vol: 0.1, f: 9000, delay: 0.07 });
    tone({
      type: "square",
      f0: 3200,
      f1: 1200,
      dur: 0.03,
      vol: 0.03,
      delay: 0.03,
    });
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
    tone({
      type: "triangle",
      f0: 600,
      f1: 1500,
      dur: 0.1,
      vol: 0.12,
      delay: 0.06,
    });
  },
  /** step = how many coins in a row (rising notes) */
  coin: (step = 0) => {
    const f = semis(1180, step);
    tone({ type: "triangle", f0: f, f1: f, dur: 0.06, vol: 0.15 });
    tone({
      type: "triangle",
      f0: f * 1.5,
      f1: f * 1.5,
      dur: 0.1,
      vol: 0.11,
      delay: 0.045,
    });
    tone({
      type: "sine",
      f0: f * 3,
      f1: f * 3,
      dur: 0.05,
      vol: 0.04,
      delay: 0.045,
    }); // sparkle
  },
  /** combo multiplier step (tier 1..5 → x2 x3 x5 x10 x13): a punchy, higher-each-time chime */
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
      tone({
        type: "triangle",
        f0: 523 * 2 ** (s / 12),
        dur: 0.16,
        vol: 0.16,
        delay: i * 0.07,
      }),
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
      tone({
        type: "triangle",
        f0: 523 * 2 ** (s / 12),
        dur: 0.2,
        vol: 0.15,
        delay: i * 0.06,
      }),
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
    tone({
      type: "triangle",
      f0: 1200,
      f1: 1800,
      dur: 1.2,
      vol: 0.03,
      delay: 0.3,
    });
  },
  /** tearing through a rift */
  rift: () => {
    noise({ dur: 0.6, vol: 0.4, f: 4000 });
    tone({ type: "sawtooth", f0: 900, f1: 80, dur: 0.45, vol: 0.12 });
    [0, 7, 12, 19].forEach((s, i) =>
      tone({
        type: "sine",
        f0: 392 * 2 ** (s / 12),
        dur: 0.4,
        vol: 0.1,
        delay: 0.25 + i * 0.05,
      }),
    );
  },
  chestShake: () =>
    tone({ type: "square", f0: 160, f1: 120, dur: 0.05, vol: 0.08 }),
  chestOpen: () => {
    noise({ dur: 0.25, vol: 0.3, f: 1200 });
    tone({ type: "triangle", f0: 784, f1: 1568, dur: 0.3, vol: 0.18 });
    tone({ type: "sine", f0: 2093, dur: 0.25, vol: 0.08, delay: 0.12 });
  },
  lucky: () => {
    [0, 4, 7, 11, 14].forEach((s, i) =>
      tone({
        type: "sine",
        f0: 784 * 2 ** (s / 12),
        dur: 0.25,
        vol: 0.14,
        delay: i * 0.09,
      }),
    );
  },
  near: () => {
    noise({ dur: 0.25, vol: 0.35, f: 2400 });
    tone({ type: "sine", f0: 400, f1: 1600, dur: 0.25, vol: 0.15 });
  },
  portal: () => tone({ type: "sine", f0: 200, f1: 1200, dur: 0.35, vol: 0.2 }),
  /** the glydrift.com launch: a rift tears open (airy whoosh under a rising shimmer) */
  portalOpen: () => {
    noise({ dur: 0.55, vol: 0.24, f: 2200 });
    tone({ type: "sine", f0: 140, f1: 620, dur: 0.5, vol: 0.14 });
    tone({
      type: "triangle",
      f0: 1400,
      f1: 2600,
      dur: 0.4,
      vol: 0.03,
      delay: 0.15,
    });
  },
  /** a bright sparkle chime (the domain finished typing) */
  chime: () => {
    [0, 7, 12, 19].forEach((s, i) =>
      tone({
        type: "sine",
        f0: 1318 * 2 ** (s / 12),
        dur: 0.22,
        vol: 0.07,
        delay: i * 0.045,
      }),
    );
  },
  /** progress locked in: a short celebratory sting */
  sting: () => {
    [0, 4, 7, 12].forEach((s, i) => {
      const f = 523 * 2 ** (s / 12);
      tone({ type: "triangle", f0: f, dur: 0.24, vol: 0.15, delay: i * 0.07 });
      tone({ type: "sawtooth", f0: f, dur: 0.16, vol: 0.04, delay: i * 0.07 });
    });
    tone({ type: "triangle", f0: 1046, dur: 0.6, vol: 0.14, delay: 0.3 });
    noise({ dur: 0.5, vol: 0.12, f: 8000, delay: 0.3 });
  },
  death: () => {
    noise({ dur: 0.7, vol: 0.6, f: 700 });
    tone({ type: "sawtooth", f0: 220, f1: 40, dur: 0.6, vol: 0.2 });
  },
  ui: () => tone({ type: "sine", f0: 700, f1: 1100, dur: 0.06, vol: 0.15 }),
  reward: () => {
    [0, 0.08, 0.16].forEach((d, i) =>
      tone({
        type: "triangle",
        f0: 660 * (1 + i * 0.26),
        dur: 0.14,
        vol: 0.18,
        delay: d,
      }),
    );
  },
  biome: () => tone({ type: "sine", f0: 120, f1: 480, dur: 0.8, vol: 0.18 }),
};

if (TEST.on && typeof window !== "undefined")
  window.__glySfx = { Sfx, jamalCount: JAMAL_NOISES.length, live: () => liveNodes, persistent: () => (wind ? 3 : 0) + (hum ? 7 : 0) + (jet ? 9 : 0) };
