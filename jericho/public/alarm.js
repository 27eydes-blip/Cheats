// The alarm ringer, made live with Web Audio (no audio files), and Jericho reading the label
// between rings. Four sounds:
//   strike   (default) "Missile strike": five missiles, each screaming in from far away (every one
//            different), a half-second of dead silence, then a huge layered impact echoing through
//            a city (synthetic reverb), with ringing ears and muffled hearing after the later hits;
//            a mechanical air-raid siren spins up on the 3rd hit, climbs at the 4th and 5th, then
//            holds with warning beeps, sonar pings and distant explosions; a tense silence; repeat
//   siren    the air-raid siren on its own, over the rumble
//   sonar    sonar/radar pings with soft warning beeps
//   classic  the original rising beeps
// It starts at 60% of the alarm volume and ramps to full over 20 seconds, and gets more intense
// the longer it rings. Everything goes through one output chain: a light drive, a glue
// compressor, a brick-wall limiter and a fixed ceiling, so it can't clip or hurt speakers.
// While you talk over it, the whole thing dips so "stop" or "snooze" can be heard.

export const ALARM_SOUNDS = ["strike", "siren", "sonar", "classic"];
export const DEFAULT_ALARM_SOUND = "strike";
export const DEFAULT_ALARM_VOLUME = 0.85;
export const ALARM_SAFE_MAX = 0.85; // the normal cap on the alarm's master gain
export const ALARM_MAX_LOUD_CAP = 0.95; // "Max loud" raises it a little
export const HARD_CEILING = 1.0; // nothing ever goes above this, whatever the settings say
export const LIMITER = { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.12 }; // brick wall
export const OUTPUT_CEILING = 0.92; // after the limiter: a little headroom below digital full scale
export const MAKEUP_GAIN = 2.0; // drives the mix into the limiter: louder overall, peaks still held
export const MAX_LOUD_MAKEUP = 1.4; // "Max loud" drives it a little harder still
export const SAFETY_MAX = 0.97; // the last stage can't output more than this (times the ceiling)

/**
 * The very last stage: unchanged below 0.8, a smooth knee above it, and a hard stop at SAFETY_MAX.
 * A waveshaper can't output anything outside its curve, so even a transient that slips past the
 * limiter can't go over the top.
 */
export function safetyCurve(n = 4096) {
  const curve = new Float32Array(n);
  const knee = 0.8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (SAFETY_MAX - knee) * Math.tanh((a - knee) / (SAFETY_MAX - knee));
    curve[i] = Math.sign(x) * Math.min(SAFETY_MAX, y);
  }
  return curve;
}
export const RAMP_START = 0.6;
export const RAMP_SECONDS = 20;

/** The alarm's master gain from the settings: never below 0.2, never above the cap or the hard ceiling. */
export function alarmGain({ volume = DEFAULT_ALARM_VOLUME, maxLoud = false } = {}) {
  const v = Number(volume);
  const cap = Math.min(HARD_CEILING, maxLoud ? ALARM_MAX_LOUD_CAP : ALARM_SAFE_MAX);
  if (!Number.isFinite(v)) return Math.min(cap, DEFAULT_ALARM_VOLUME);
  return Math.min(cap, Math.max(0.2, v));
}

/** Volume ramp: 60% at first, full after 20 seconds (a straight line in between). */
export function escalation(seconds) {
  const k = Math.min(1, Math.max(0, Number(seconds) || 0) / RAMP_SECONDS);
  return RAMP_START + (1 - RAMP_START) * k;
}

/** How intense the pattern is: 0 at the start, 1 after about a minute and a half of ringing. */
export function intensity(seconds) {
  return Math.min(1, Math.max(0, Number(seconds) || 0) / 90);
}

export function normalizeSound(name) {
  if (name === "missile") return "strike"; // the previous default, renamed
  return ALARM_SOUNDS.includes(name) ? name : DEFAULT_ALARM_SOUND;
}

// ---- the output chain --------------------------------------------------------------------------
function softClipCurve(amount = 2.2, n = 2048) {
  const curve = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / norm;
  }
  return curve;
}

/**
 * Builds: input -> [clean + driven blend] -> glue compressor -> limiter -> ceiling -> speakers.
 * Returns { input, drive, master, duck, ramp, nodes } where `input` takes clean sources,
 * `drive` takes sources that should get a little grit, master is the volume setting, ramp the
 * escalation and duck the dip while you speak.
 */
export function buildOutput(ctx, gain, { maxLoud = false } = {}) {
  const input = ctx.createGain(); // clean sources
  const drive = ctx.createGain(); // sources with a little distortion
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(2.2);
  shaper.oversample = "4x"; // keeps the distortion smooth, not fizzy
  const driveTrim = ctx.createGain();
  driveTrim.gain.value = 0.7;
  drive.connect(shaper).connect(driveTrim);

  const master = ctx.createGain(); // the volume setting (capped)
  master.gain.value = Math.min(HARD_CEILING, gain);
  const ramp = ctx.createGain(); // escalation: 60% -> 100% over 20 s
  const duck = ctx.createGain(); // dips while you talk
  input.connect(master);
  driveTrim.connect(master);
  master.connect(ramp).connect(duck);

  const glue = ctx.createDynamicsCompressor(); // holds the layers together
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 3;
  glue.attack.value = 0.01;
  glue.release.value = 0.25;
  const limiter = ctx.createDynamicsCompressor(); // the safety limiter: nothing past it can clip
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  const makeup = ctx.createGain(); // louder into the limiter (the limiter keeps the peaks down)
  makeup.gain.value = MAKEUP_GAIN * (maxLoud ? MAX_LOUD_MAKEUP : 1);
  const safety = ctx.createWaveShaper(); // a hard stop after the limiter (see safetyCurve)
  safety.curve = safetyCurve();
  safety.oversample = "none"; // must not add anything above the curve
  const ceiling = ctx.createGain();
  ceiling.gain.value = OUTPUT_CEILING;
  duck.connect(glue).connect(makeup).connect(limiter).connect(safety).connect(ceiling).connect(ctx.destination);
  return { input, drive, master, ramp, duck, nodes: { glue, makeup, limiter, safety, ceiling, shaper } };
}

// ---- the sound layers --------------------------------------------------------------------------
// Noise and reverb buffers are made once per sample rate and shared by every render and the live
// context (an AudioBuffer works in any context), so nothing is regenerated while an alarm rings.
const noiseCache = new Map();
function noiseBuffer(ctx, seconds = 2, brown = false) {
  const key = `${ctx.sampleRate}:${seconds}:${brown}`;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = white;
    }
  }
  noiseCache.set(key, buf);
  return buf;
}

function panner(ctx, pan, out) {
  if (!ctx.createStereoPanner) return out;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  return p;
}

/** Air-raid siren: a sawtooth/square pair, slightly detuned and spread left/right, sweeping 400-1200 Hz. */
function siren(ctx, out, at, { rise = 2.4, fall = 2.4, level = 0.16 } = {}) {
  const end = at + rise + fall;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200; // takes the harsh edge off
  lp.Q.value = 0.7;
  lp.connect(out);
  for (const [type, detune, pan] of [["sawtooth", -8, -0.55], ["square", 8, 0.55], ["sawtooth", 3, 0]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(400, at);
    o.frequency.exponentialRampToValueAtTime(1200, at + rise);
    o.frequency.exponentialRampToValueAtTime(400, end);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level * (type === "square" ? 0.6 : 1), at + 0.25);
    g.gain.setValueAtTime(level * (type === "square" ? 0.6 : 1), end - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g).connect(panner(ctx, pan, lp));
    o.start(at);
    o.stop(end + 0.05);
  }
  return end;
}

/** Sonar/radar ping with a ping-pong echo. */
function sonar(ctx, out, at, { freq = 1450, level = 0.3 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.97, at + 1.1);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  // echo bouncing left and right
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.32;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  o.connect(g);
  g.connect(panner(ctx, 0, out));
  g.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(panner(ctx, Math.random() < 0.5 ? -0.7 : 0.7, out));
  o.start(at);
  o.stop(at + 1.15);
  // a feedback loop can keep running after it's silent: let go of it once the echo has died away
  if (typeof OfflineAudioContext === "undefined" || !(ctx instanceof OfflineAudioContext)) {
    setTimeout(() => {
      delay.disconnect();
      fb.disconnect();
    }, Math.max(0, at - ctx.currentTime + 3) * 1000);
  }
}

/** Three quick high warning beeps. */
function tripleBeep(ctx, out, at, { level = 0.1, freq = 2700 } = {}) {
  for (let i = 0; i < 3; i++) {
    const t = at + i * 0.12;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.setValueAtTime(level, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.connect(g).connect(panner(ctx, i === 1 ? 0 : i === 0 ? -0.35 : 0.35, out));
    o.start(t);
    o.stop(t + 0.09);
  }
}

/** The deep rumble bed, with distant blasts (filtered noise bursts). */
function rumble(ctx, out, at, seconds, { level = 0.5, blasts = 1 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 3, true);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 110;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.6);
  g.gain.setValueAtTime(level, at + seconds - 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(lp).connect(g).connect(out);
  src.start(at);
  src.stop(at + seconds + 0.05);
  for (let i = 0; i < blasts; i++) blast(ctx, out, at + 0.4 + Math.random() * Math.max(0.5, seconds - 1.6), 0.5 + Math.random() * 0.4);
}

function blast(ctx, out, at, level = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2, false);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(420, at);
  lp.frequency.exponentialRampToValueAtTime(60, at + 1.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
  src.connect(lp).connect(g).connect(panner(ctx, (Math.random() - 0.5) * 0.9, out));
  src.start(at);
  src.stop(at + 1.45);
}

function classicBurst(ctx, out, at, level = 1) {
  const notes = [880, 1047, 1319, 1568];
  for (let run = 0; run < 2; run++) {
    notes.forEach((f, i) => {
      const t = at + run * 1.1 + i * 0.22;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.04, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.01);
      g.gain.setValueAtTime(0.35 * level, t + 0.13);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.18);
    });
  }
  return at + 2.25;
}

// ---- "Missile strike" ------------------------------------------------------------------------------
export const STRIKE = {
  streaks: 5,
  spacing: 1.35, // impacts 1.35 s apart
  flight: 0.8, // each missile screams in for 0.8 s...
  gap: 0.5, // ...then half a second of near-silence (the air is sucked out), then it hits
  hold: 7, // the siren at full after the 5th impact
  silence: 1.5, // then a short, tense silence before the next cycle
  sirenFromImpact: 3, // the siren stays silent until the 3rd impact lands
  ringFromImpact: 3, // ringing ears and the concussion muffle after the 3rd, 4th and 5th hits
  lastWeight: 1.9, // the 5th impact carries almost double the weight of the 1st
  impactLevel: 0.34, // how loud a weight-1 hit is (the 1st sits well under the limiter)
  bedLevel: 0.45, // everything that isn't a hit sits this much under the hits
  silenceLevel: 0.03, // how far everything else drops in the half-second before a hit
  ringPeak: 0.035, // the ringing tone stays gentle: never a harsh peak
  muffle: { to: 380, seconds: 1.1 }, // concussion: everything else muffled to ~380 Hz, clearing over ~1 s
};

/** Small seeded random numbers, so every missile differs but a given cycle is repeatable (and testable). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * When everything happens in one cycle (seconds from its start), and how each missile sounds.
 * Every missile has its own pitch, stereo path and distance (never two the same). Each hit is
 * heavier than the last (weight 1 up to 1.9). The siren is silent until the 3rd impact, starts there
 * low and spinning up, steps up at the 4th and 5th, then holds. After hits 3-5: ringing ears and a
 * second of muffled hearing.
 */
export function strikeTimeline(cycle = 0) {
  const n = STRIKE.streaks;
  const rnd = seeded(9173 + cycle * 7919);
  const pans = [];
  const streaks = Array.from({ length: n }, (_, i) => {
    const impact = STRIKE.flight + STRIKE.gap + i * STRIKE.spacing;
    const silenceStart = impact - STRIKE.gap;
    const start = silenceStart - STRIKE.flight;
    // a stereo path no other missile in this cycle takes: from one side, across, ending somewhere new
    let from;
    let to;
    do {
      from = (i % 2 === 0 ? -1 : 1) * (0.35 + rnd() * 0.6);
      to = -from * (0.2 + rnd() * 0.8);
    } while (pans.some(([f, t]) => Math.abs(f - from) < 0.05 && Math.abs(t - to) < 0.05));
    pans.push([from, to]);
    return {
      start,
      silenceStart,
      impact,
      pan: [from, to],
      pitch: 2350 + i * 140 + rnd() * 900, // where the scream starts, high and far away (Hz)
      drop: 0.42 + rnd() * 0.2, // how far it falls as it passes (Doppler): to 42-62% of the start
      distance: 0.45 + rnd() * 0.55, // 1 = close (loud, bright, dry), 0.45 = far (quiet, dull, wetter)
      weight: 1 + (STRIKE.lastWeight - 1) * (i / (n - 1)),
      reverb: 2.6 + 0.6 * i, // the city echo grows longer with every hit (seconds)
    };
  });
  const sirenAt = STRIKE.sirenFromImpact - 1;
  const answering = streaks.slice(sirenAt);
  const stages = answering.map((s, j) => {
    const k = answering.length > 1 ? j / (answering.length - 1) : 1; // 0 at the 3rd impact, 1 at the 5th
    return {
      at: s.impact,
      level: 0.05 + 0.11 * k, // low at first, full at the 5th
      peak: 450 + 700 * k, // where it climbs to: 450 Hz, then ~800, then 1150 Hz
      climb: 1.25 - 0.25 * k, // seconds to get there (the first is the slow spin-up from a growl)
    };
  });
  const ringing = streaks.slice(STRIKE.ringFromImpact - 1).map((s, j) => ({
    at: s.impact,
    freq: 4600 + j * 1300 + rnd() * 500, // ~4.6-7.4 kHz
    seconds: 2.2 + 0.3 * j,
  }));
  const muffles = ringing.map((r) => ({ at: r.at, until: r.at + STRIKE.muffle.seconds }));
  const holdStart = streaks.at(-1).impact;
  const holdEnd = holdStart + STRIKE.hold;
  // later cycles hit harder (up to 1.0 by the fourth cycle)
  const power = Math.min(1, 0.7 + 0.1 * cycle);
  return { streaks, stages, sirenStart: stages[0].at, ringing, muffles, holdStart, holdEnd, end: holdEnd + STRIKE.silence, power };
}

// ---- building blocks ----------------------------------------------------------------------------
const isOffline = (ctx) => typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
/** Let go of nodes (e.g. a reverb) once they're done. Offline renders keep everything to the end. */
function releaseLater(ctx, at, nodes) {
  if (isOffline(ctx)) return;
  setTimeout(() => nodes.forEach((n) => n.disconnect()), Math.max(0, at - ctx.currentTime) * 1000);
}

const irCache = new Map();
/**
 * A synthetic impulse response: a big open city. A few early reflections off buildings, then dense
 * stereo noise decaying to -60 dB over `seconds`, darker as it fades.
 */
export function cityImpulse(ctx, seconds) {
  const key = `${ctx.sampleRate}:${seconds.toFixed(2)}`;
  if (irCache.has(key)) return irCache.get(key);
  const rate = ctx.sampleRate;
  const len = Math.ceil(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const decay = Math.exp((-6.9 * t) / seconds); // -60 dB at the end
      const k = 0.15 + 0.8 * (t / seconds); // more low-pass as it fades (the air eats the highs)
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * decay;
    }
    // early reflections: walls 15-90 ms away, different on each side
    for (const ms of ch ? [19, 37, 58, 83] : [14, 31, 49, 71, 90]) {
      const i = Math.floor((ms / 1000) * rate);
      if (i < len) d[i] += 0.5 * Math.exp((-6.9 * ms) / 1000 / seconds) * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  irCache.set(key, buf);
  return buf;
}

/** How many impulse responses and noise buffers exist (for the tests: made once, then reused). */
export const generatedBuffers = () => ({ impulses: irCache.size, noises: noiseCache.size });

// Smooth mode: fewer simultaneous layers, a short delay echo instead of convolution, same timing.
// Set only while one cycle is being scheduled (scheduling is synchronous).
let LITE = false;

/** A reverb send into `out`: returns the node to connect sounds to. */
function reverb(ctx, out, seconds, returnLevel, until) {
  if (LITE || !ctx.createConvolver) {
    // a short slap-back echo off the buildings: two delays, no convolution
    const input = ctx.createGain();
    const ret = ctx.createGain();
    ret.gain.value = returnLevel * 0.6;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1800;
    input.connect(tone);
    for (const t of [0.13, 0.29]) {
      const d = ctx.createDelay(1);
      d.delayTime.value = t;
      tone.connect(d).connect(ret);
    }
    ret.connect(out);
    return input;
  }
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = cityImpulse(ctx, seconds);
  const ret = ctx.createGain();
  ret.gain.value = returnLevel;
  conv.connect(ret).connect(out);
  if (until) releaseLater(ctx, until + seconds + 0.5, [conv, ret]);
  return conv;
}

function noiseSource(ctx, at, seconds, brown = false) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, Math.max(2, Math.ceil(seconds)), brown);
  s.loop = seconds > 2;
  s.start(at);
  s.stop(at + seconds + 0.02);
  return s;
}

function env(ctx, at, peak, attack, release, hold = 0) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

/**
 * The incoming missile: a thin high scream far away, swelling as it nears and falling in pitch as
 * it passes (Doppler), with rushing air under it. Its distance sets loudness, brightness and how
 * much of it is echo. It ends abruptly where the silence begins.
 */
function missile(ctx, world, wet, s, power) {
  const { start: at, silenceStart: end, pitch, drop, distance: d, pan: [from, to] } = s;
  const len = end - at;
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2500 + 6000 * d; // far away is duller
  const level = ctx.createGain();
  level.gain.value = (0.35 + 0.65 * d) * power;
  tone.connect(level);
  if (p) {
    p.pan.setValueAtTime(from, at);
    p.pan.linearRampToValueAtTime(to, end);
    level.connect(p).connect(world);
  } else level.connect(world);
  const send = ctx.createGain();
  send.gain.value = 0.15 + 0.5 * (1 - d); // more echo the further it is
  level.connect(send).connect(wet);
  // the scream: a whistle with a little wobble, sliding down as it passes
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(pitch, at);
  o.frequency.setValueAtTime(pitch, at + len * 0.35);
  o.frequency.exponentialRampToValueAtTime(pitch * drop, end);
  if (!LITE) {
    const vib = ctx.createOscillator();
    const vibDepth = ctx.createGain();
    vib.frequency.value = 9 + d * 4;
    vibDepth.gain.value = pitch * 0.006;
    vib.connect(vibDepth).connect(o.frequency);
    vib.start(at);
    vib.stop(end);
  }
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, at);
  og.gain.exponentialRampToValueAtTime(0.012, at + len * 0.4); // faint, far away
  og.gain.exponentialRampToValueAtTime(0.11, end - 0.01); // screaming in
  og.gain.linearRampToValueAtTime(0.0001, end); // and gone: the silence
  o.connect(og).connect(tone);
  o.start(at);
  o.stop(end + 0.01);
  // a second, rougher partial for bite (not in Smooth)
  if (LITE) return missileAir(ctx, tone, at, end, len);
  const o2 = ctx.createOscillator();
  o2.type = "sawtooth";
  o2.frequency.setValueAtTime(pitch * 0.502, at);
  o2.frequency.setValueAtTime(pitch * 0.502, at + len * 0.35);
  o2.frequency.exponentialRampToValueAtTime(pitch * 0.502 * drop, end);
  const o2g = ctx.createGain();
  o2g.gain.setValueAtTime(0.0001, at);
  o2g.gain.exponentialRampToValueAtTime(0.025, end - 0.01);
  o2g.gain.linearRampToValueAtTime(0.0001, end);
  o2.connect(o2g).connect(tone);
  o2.start(at);
  o2.stop(end + 0.01);
  missileAir(ctx, tone, at, end, len);
}

/** The rushing air under a missile, rising with it. */
function missileAir(ctx, tone, at, end, len) {
  const n = noiseSource(ctx, at, len, false);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(900, at);
  bp.frequency.exponentialRampToValueAtTime(3600, end);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, at);
  ng.gain.exponentialRampToValueAtTime(0.2, end - 0.01);
  ng.gain.linearRampToValueAtTime(0.0001, end);
  n.connect(bp).connect(ng).connect(tone);
}

/** "Air sucked out": a short, sharp inward rush right where the silence begins. */
function airSuck(ctx, out, at, w) {
  const n = noiseSource(ctx, at, 0.25, false);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(3800, at);
  bp.frequency.exponentialRampToValueAtTime(180, at + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.16 * w, at + 0.11); // drawn in...
  g.gain.linearRampToValueAtTime(0.0001, at + 0.15); // ...and cut
  n.connect(bp).connect(g).connect(out);
}

/**
 * The impact, in layers, scaled by `weight` (1 for the 1st, up to 1.9 for the 5th, times the cycle's
 * power): crack, sub thud (50 -> 30 Hz), heavy mid boom, pressure-wave whump, debris burst and a long
 * tail. The hit itself goes straight out (`hit`, never ducked or muffled); its echo, distant
 * secondary rumbles and falling-debris crackle go into `world`.
 */
function impact(ctx, { hit, drive, world }, s, weight) {
  const at = s.impact;
  const pan = s.pan[1];
  const len = (base, extra) => base + extra * (Math.max(1, weight) - 1);
  const w = weight * STRIKE.impactLevel;
  const echo = reverb(ctx, world, s.reverb, 0.55 + 0.25 * (weight - 1), at); // the city answers
  const toHit = (node, p = 0, also = true) => {
    node.connect(panner(ctx, p, hit));
    if (also) node.connect(echo);
  };
  // crack: a few milliseconds of bright noise, the sharpest instant
  const c = noiseSource(ctx, at, 0.07);
  const ch = ctx.createBiquadFilter();
  ch.type = "highpass";
  ch.frequency.value = 1200;
  const cg = env(ctx, at, 0.75 * w, 0.002, 0.06);
  c.connect(ch).connect(cg);
  toHit(cg, pan * 0.4);
  // sub thud: 50 -> 30 Hz, clean and centred, longer for heavier hits (no echo: it's felt, not heard)
  const sub = ctx.createOscillator();
  sub.type = "sine";
  const subLen = len(1.3, 1.0);
  sub.frequency.setValueAtTime(50, at);
  sub.frequency.exponentialRampToValueAtTime(30, at + subLen * 0.7);
  const sg = env(ctx, at, 0.6 * w, 0.015, subLen);
  sub.connect(sg).connect(hit);
  sub.start(at);
  sub.stop(at + subLen + 0.05);
  // heavy mid boom: a falling tone plus dark noise, lightly driven
  const boom = ctx.createOscillator();
  boom.type = "triangle";
  const boomLen = len(1.9, 1.1);
  boom.frequency.setValueAtTime(140, at);
  boom.frequency.exponentialRampToValueAtTime(48, at + boomLen * 0.6);
  const bg = env(ctx, at, 0.42 * w, 0.02, boomLen);
  boom.connect(bg);
  bg.connect(panner(ctx, pan * 0.3, drive));
  bg.connect(echo);
  boom.start(at);
  boom.stop(at + boomLen + 0.05);
  const bn = noiseSource(ctx, at, len(0.9, 0.5), true);
  const bl = ctx.createBiquadFilter();
  bl.type = "lowpass";
  bl.frequency.setValueAtTime(700, at);
  bl.frequency.exponentialRampToValueAtTime(110, at + len(0.9, 0.5));
  const bng = env(ctx, at, 0.6 * w, 0.01, len(0.9, 0.5));
  bn.connect(bl).connect(bng);
  toHit(bng, pan * 0.2);
  // pressure-wave whump: a short heavy push of air
  const wp = ctx.createOscillator();
  wp.type = "sine";
  wp.frequency.setValueAtTime(78, at);
  wp.frequency.exponentialRampToValueAtTime(40, at + 0.22);
  const wg = env(ctx, at, 0.7 * w, 0.008, 0.24);
  wp.connect(wg).connect(hit);
  wp.start(at);
  wp.stop(at + 0.27);
  // debris burst: short filtered noise pieces flying out to the sides
  const pieces = LITE ? 3 : 6 + Math.round(4 * (Math.max(1, weight) - 1));
  const rnd = seeded(Math.round(at * 1000) + pieces);
  for (let i = 0; i < pieces; i++) {
    const t = at + 0.03 + rnd() * 0.65; // done before the next silence begins
    const dn = noiseSource(ctx, t, 0.14);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.value = 900 + rnd() * 2600;
    const dg = env(ctx, t, Math.max(0.002, (0.25 + rnd() * 0.15) * w * (1 - (t - at) / 1.2)), 0.004, 0.05 + rnd() * 0.07);
    dn.connect(bp).connect(dg);
    toHit(dg, (rnd() * 2 - 1) * 0.95);
  }
  // the long rumbling tail
  const tailLen = len(3.4, 2.0);
  const tail = noiseSource(ctx, at, tailLen, true);
  const tlp = ctx.createBiquadFilter();
  tlp.type = "lowpass";
  tlp.frequency.setValueAtTime(170, at);
  tlp.frequency.exponentialRampToValueAtTime(65, at + 1.6);
  const tg = env(ctx, at, 0.65 * w, 0.1, tailLen);
  tail.connect(tlp).connect(tg).connect(panner(ctx, -pan * 0.3, hit));
  // distant secondary rumbles, out in the city
  for (let i = 0; i < (LITE ? 1 : 2); i++) {
    const t = at + 0.6 + rnd() * 1.6;
    const r = noiseSource(ctx, t, 1.6, true);
    const rl = ctx.createBiquadFilter();
    rl.type = "lowpass";
    rl.frequency.value = 150 + rnd() * 80;
    const rg = env(ctx, t, 0.22 * w, 0.08, 1.4);
    r.connect(rl).connect(rg);
    rg.connect(panner(ctx, rnd() * 2 - 1, world));
    rg.connect(echo);
  }
  // falling debris: sparse crackle thinning out over a couple of seconds
  for (let i = 0; i < (LITE ? 5 : 14); i++) {
    const t = at + 0.3 + Math.pow(rnd(), 1.7) * 2.4;
    const k = noiseSource(ctx, t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200 + rnd() * 3000;
    const kg = env(ctx, t, (0.05 + rnd() * 0.06) * w, 0.001, 0.008 + rnd() * 0.012);
    k.connect(hp).connect(kg).connect(panner(ctx, rnd() * 2 - 1, world));
  }
}

/** Ringing ears: a thin high tone (4-8 kHz), soft at the start and fading away. Never harsh. */
function earRing(ctx, out, r) {
  for (const [mul, lvl] of [[1, 1], [1.0035, 0.6]]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = r.freq * mul; // two close tones beat slightly, like real tinnitus
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, r.at);
    g.gain.exponentialRampToValueAtTime(STRIKE.ringPeak * lvl, r.at + 0.12); // eases in: no sharp peak
    g.gain.exponentialRampToValueAtTime(0.0001, r.at + r.seconds);
    o.connect(g).connect(out);
    o.start(r.at);
    o.stop(r.at + r.seconds + 0.02);
  }
}

/**
 * A mechanical rotary air-raid siren across the city. Silent until the 3rd impact; there it spins
 * up slowly from a low growl, then climbs higher and louder at the 4th and 5th; then long rising and
 * falling swells while it holds, and a spin-down at the end. Stacked sawtooth/square tones (with an
 * octave), a little motor noise, an uneven wobble, a horn-like resonance and plenty of distance echo.
 * Returns its frequency points.
 */
function rotarySiren(ctx, out, wet, tl) {
  const first = tl.stages[0].at;
  const end = tl.holdEnd;
  const points = [[first, 95]]; // a low growl as the rotor starts
  tl.stages.forEach((st, i) => {
    const nextAt = i + 1 < tl.stages.length ? tl.stages[i + 1].at : end;
    const reach = Math.min(st.at + st.climb, nextAt - 0.05);
    points.push([reach, st.peak]);
    if (i === tl.stages.length - 1) {
      // the hold: long swells, falling and rising again
      let t = reach;
      let up = false;
      while (t + 0.3 < end - 0.4) {
        const next = Math.min(end - 0.4, t + 2.1);
        points.push([next, up ? st.peak : st.peak * 0.58]);
        t = next;
        up = !up;
      }
    }
  });
  points.push([end + 0.4, 160]); // spinning down
  // the sound
  const horn = ctx.createBiquadFilter(); // the horn's resonance
  horn.type = "peaking";
  horn.frequency.value = 950;
  horn.Q.value = 1.1;
  horn.gain.value = 5;
  const far = ctx.createBiquadFilter(); // across the city: no crisp top end
  far.type = "lowpass";
  far.frequency.value = 3000;
  const body = ctx.createGain(); // loudness: slow swell in, a step up at each hit
  body.gain.setValueAtTime(0.0001, first);
  tl.stages.forEach((st, i) => body.gain.setTargetAtTime(st.level, st.at, i === 0 ? 0.45 : 0.12));
  body.gain.setTargetAtTime(0.0001, end, 0.18);
  body.connect(horn).connect(far);
  far.connect(out);
  const send = ctx.createGain();
  send.gain.value = 0.7; // mostly heard as echo off the buildings
  far.connect(send).connect(wet);
  // an uneven wobble from the rotor: two slow, unrelated wobbles
  const wobble = [];
  for (const [rate, depth] of LITE ? [[5.7, 7]] : [[5.7, 7], [0.83, 11]]) {
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.value = depth;
    l.connect(lg);
    l.start(first);
    l.stop(end + 0.5);
    wobble.push(lg);
  }
  const voices = [["sawtooth", -6, -0.45, 0.55], ["square", 7, 0.45, 0.32], ["sawtooth", 1203, 0, 0.18], ["sawtooth", 3, 0, 0.4]];
  for (const [type, detune, pan, level] of LITE ? voices.slice(0, 2) : voices) {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(points[0][1], points[0][0]);
    for (const [t, f] of points.slice(1)) o.frequency.linearRampToValueAtTime(f, t);
    for (const lg of wobble) lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(panner(ctx, pan, body));
    o.start(first);
    o.stop(end + 0.5);
  }
  // motor noise: a low mechanical whirr under the tone (not in Smooth)
  if (LITE) return points;
  const m = noiseSource(ctx, first, end + 0.4 - first, true);
  const mb = ctx.createBiquadFilter();
  mb.type = "bandpass";
  mb.Q.value = 2;
  mb.frequency.value = 170;
  const mg = ctx.createGain();
  mg.gain.value = 0.35;
  m.connect(mb).connect(mg).connect(body);
  return points;
}

/** One "Missile strike" cycle. Returns its length (including the silence after it). */
export function scheduleStrike(ctx, bus, at, cycle = 0, { lite = false } = {}) {
  LITE = lite;
  try {
    return scheduleStrikeNow(ctx, bus, at, cycle);
  } finally {
    LITE = false;
  }
}

function scheduleStrikeNow(ctx, bus, at, cycle) {
  const { input: clean, drive } = bus;
  const tl = strikeTimeline(cycle);
  const T = (t) => at + t;
  // Everything except the hits plays through the "world": it sits under the hits, drops to
  // near-silence for the half-second before each hit, and is muffled for a second after hits 3-5.
  const world = ctx.createGain();
  const muffle = ctx.createBiquadFilter();
  muffle.type = "lowpass";
  muffle.Q.value = 0.5;
  muffle.frequency.setValueAtTime(18000, at);
  world.connect(muffle).connect(clean);
  const level = STRIKE.bedLevel;
  world.gain.setValueAtTime(level, at);
  for (const s of tl.streaks) {
    world.gain.setValueAtTime(level, T(s.silenceStart) - 0.01);
    world.gain.linearRampToValueAtTime(STRIKE.silenceLevel * level, T(s.silenceStart) + 0.04); // sudden
    world.gain.setValueAtTime(STRIKE.silenceLevel * level, T(s.impact) - 0.005);
    world.gain.linearRampToValueAtTime(level, T(s.impact) + 0.15);
  }
  for (const m of tl.muffles) {
    muffle.frequency.setValueAtTime(18000, T(m.at) - 0.001);
    muffle.frequency.setValueAtTime(STRIKE.muffle.to, T(m.at));
    muffle.frequency.exponentialRampToValueAtTime(18000, T(m.until));
  }
  const cityWet = reverb(ctx, world, 3.2, 0.6, T(tl.end)); // the city's echo for missiles and the siren
  // The hits: full the instant each one lands, never muffled. Whatever is still ringing from a
  // hit (its sub, boom and tail) drops away with everything else in the next missile's silence.
  const hit = ctx.createGain();
  hit.connect(clean);
  hit.gain.setValueAtTime(1, at);
  for (const s of tl.streaks) {
    hit.gain.setValueAtTime(1, T(s.silenceStart) - 0.01);
    hit.gain.linearRampToValueAtTime(STRIKE.silenceLevel, T(s.silenceStart) + 0.04);
    hit.gain.setValueAtTime(STRIKE.silenceLevel, T(s.impact) - 0.003);
    hit.gain.linearRampToValueAtTime(1, T(s.impact)); // back to full exactly on the hit
  }
  for (const s of tl.streaks) {
    const shifted = { ...s, start: T(s.start), silenceStart: T(s.silenceStart), impact: T(s.impact) };
    missile(ctx, world, cityWet, shifted, tl.power);
    airSuck(ctx, clean, shifted.silenceStart, s.weight * tl.power); // the one sound in the silence
    impact(ctx, { hit, drive, world }, shifted, tl.power * s.weight);
  }
  for (const r of tl.ringing) earRing(ctx, clean, { ...r, at: T(r.at) });
  // the siren: silent until the 3rd impact
  rotarySiren(ctx, world, cityWet, { ...tl, stages: tl.stages.map((st) => ({ ...st, at: T(st.at) })), holdEnd: T(tl.holdEnd) });
  // the hold: rapid triple beeps and sonar pings under the siren, distant explosions bleeding in
  for (let t = tl.holdStart + 0.2; t < tl.holdEnd - 0.3; t += 0.75) tripleBeep(ctx, world, T(t), { level: 0.1 + 0.04 * tl.power, freq: 2700 });
  for (let t = tl.holdStart + 0.5; t < tl.holdEnd - 0.8; t += 1.4) sonar(ctx, world, T(t), { level: 0.22 });
  const rnd = seeded(31337 + cycle);
  for (let i = 0; i < 3; i++) {
    const t = T(tl.holdStart + 1.5 + i * 1.8 + rnd() * 0.8);
    blast(ctx, cityWet, t, 0.35 + rnd() * 0.25);
  }
  // a low rumble bed under everything (not in the closing silence)
  rumble(ctx, world, at, tl.holdEnd, { level: 0.3 + 0.12 * tl.power, blasts: 0 });
  return tl.end;
}

/**
 * One cycle of a sound, starting at `at`. `heat` (0..1) is how long it has rung: beeps get
 * faster, pings closer, the siren quicker and the missile more frequent. Returns the cycle's length (s).
 */
export function scheduleCycle(ctx, bus, sound, at, { n = 0, heat = 0, lite = false } = {}) {
  const { input: clean, drive } = bus;
  if (sound === "classic") return classicBurst(ctx, clean, at, Math.min(1, 0.5 + n * 0.17)) - at;
  if (sound === "sonar") {
    const len = 5.2;
    const gap = 1.7 - heat * 0.6;
    for (let t = 0; t < len - 0.6; t += gap) sonar(ctx, clean, at + t, { freq: 1450 + (Math.floor(t / gap) % 2) * 160, level: 0.32 });
    for (let t = 0.6; t < len; t += 2.2 - heat * 0.8) tripleBeep(ctx, clean, at + t, { level: 0.06 + heat * 0.04, freq: 2200 });
    rumble(ctx, clean, at, len, { level: 0.25, blasts: 0 });
    return len;
  }
  if (sound === "siren") {
    const sweep = 3.2 - heat * 0.9; // faster wail the longer it goes
    const end = siren(ctx, drive, at, { rise: sweep, fall: sweep, level: 0.15 });
    rumble(ctx, clean, at, end - at, { level: 0.35, blasts: heat > 0.5 ? 1 : 0 });
    return end - at;
  }
  // missile strike
  return scheduleStrike(ctx, bus, at, n, { lite });
}

// ---- pre-rendered cycles ----------------------------------------------------------------------
// Building the Missile strike live means thousands of audio nodes at once, which makes a weak
// laptop glitch. Instead each cycle is rendered once into an AudioBuffer with an
// OfflineAudioContext (off the page's main thread), cached, and played as a single buffer through
// the live output chain (volume, escalation, ducking, compressor, limiter, ceiling).

export const ALARM_PERFORMANCE = ["auto", "smooth", "full"];
/** How long each sound's render is (a cycle plus room for its echo to fade). */
export const RENDER_SECONDS = { strike: 19.5, siren: 8.5, sonar: 6.5, classic: 3 };
/** Cycles 1-4 sound different (later ones hit harder); from the 4th on the last one repeats. */
export const VARIANTS = 4;
export const variantFor = (n) => Math.min(VARIANTS - 1, Math.max(0, n));

/**
 * Auto picks Smooth when the page is struggling: under ~20 fps, audio underruns, or a render that
 * took more than 60% of the audio's own length (a weak machine). Smooth and Full are fixed choices.
 */
export function chooseAlarmPerformance({ setting = "auto", fps = 0, underruns = 0, renderRatio = 0 } = {}) {
  if (setting === "smooth" || setting === "full") return setting;
  if (underruns > 0) return "smooth";
  if (fps > 0 && fps < 20) return "smooth";
  if (renderRatio > 0.6) return "smooth";
  return "full";
}

const defaultOffline = (channels, length, rate) => new OfflineAudioContext(channels, length, rate);

export class AlarmBufferCache {
  constructor({ sampleRate = 48000, makeOffline = defaultOffline, now = () => performance.now() } = {}) {
    this.sampleRate = sampleRate;
    this.makeOffline = makeOffline;
    this.now = now;
    this.items = new Map(); // key -> { promise, value }
    this.lastRatio = 0; // render time / audio time of the latest render
    this.renders = 0;
  }
  key(sound, mode, variant) {
    return `${normalizeSound(sound)}|${mode === "smooth" ? "smooth" : "full"}|${variantFor(variant)}`;
  }
  /** The rendered cycle if it's ready (no waiting), else null. */
  peek(sound, mode, variant) {
    return this.items.get(this.key(sound, mode, variant))?.value || null;
  }
  /** The rendered cycle: { buffer, length }. Each one is rendered only once. */
  get(sound, mode, variant) {
    const key = this.key(sound, mode, variant);
    const have = this.items.get(key);
    if (have) return have.promise;
    const item = { value: null, promise: null };
    item.promise = this.render(normalizeSound(sound), mode === "smooth", variantFor(variant)).then(
      (v) => (item.value = v),
      (err) => {
        this.items.delete(key); // try again next time
        throw err;
      },
    );
    this.items.set(key, item);
    return item.promise;
  }
  /** Forget other sounds (a changed setting), so memory stays small. */
  keepOnly(sound) {
    const s = normalizeSound(sound);
    for (const k of [...this.items.keys()]) if (!k.startsWith(`${s}|`)) this.items.delete(k);
  }
  async render(sound, lite, variant) {
    const seconds = RENDER_SECONDS[sound] || 10;
    const rate = this.sampleRate;
    const off = this.makeOffline(2, Math.ceil(seconds * rate), rate);
    // the same "clean" and "driven" inputs as the live chain, mixed into one stereo buffer
    const input = off.createGain();
    input.connect(off.destination);
    const drive = off.createGain();
    const shaper = off.createWaveShaper();
    shaper.curve = softClipCurve(2.2);
    shaper.oversample = "4x";
    const trim = off.createGain();
    trim.gain.value = 0.7;
    drive.connect(shaper).connect(trim).connect(off.destination);
    const length = scheduleCycle(off, { input, drive }, sound, 0.02, { n: variant, heat: Math.min(1, variant / (VARIANTS - 1)), lite }) + 0.02;
    const t0 = this.now();
    const buffer = await off.startRendering();
    this.lastRatio = (this.now() - t0) / (seconds * 1000);
    this.renders++;
    return { buffer, length: Math.min(length, seconds) };
  }
}

const caches = new Map();
/** One cache per sample rate, shared by the ringer and the preview. */
export function sharedAlarmCache(sampleRate = 48000) {
  if (!caches.has(sampleRate)) caches.set(sampleRate, new AlarmBufferCache({ sampleRate }));
  return caches.get(sampleRate);
}

/** Audio underruns so far (Chromium reports them as "fallback frames"); 0 where unknown. */
const underrunsOf = (ctx) => Number(ctx?.playoutStats?.fallbackFramesEvents) || 0;

// ---- the ringer ----------------------------------------------------------------------------------
export function createAlarmRinger({ getCtx, ttsUrl, lang = () => "en-US", getFps = () => 0, cache: givenCache = null, makeUtterance = null }) {
  let ringing = false;
  let ctx = null;
  let out = null; // the output chain
  let target = DEFAULT_ALARM_VOLUME;
  let voice = null;
  let spoken = [];
  let calib = null; // { until, levels }
  let echo = 0;
  let duckUntil = 0;
  let current = null; // the buffer playing now
  let underrunsAtStart = 0;
  let mode = "full"; // what's playing: "full" or "smooth"
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cacheFor = (c) => givenCache || sharedAlarmCache(c?.sampleRate || 48000);

  async function audible() {
    ctx = getCtx?.() || null;
    if (!ctx) return false;
    if (ctx.state !== "running") await Promise.race([ctx.resume().catch(() => {}), wait(300)]);
    return ctx.state === "running";
  }

  function say(text) {
    spoken = [...spoken.slice(-2), text];
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 7000);
      // the browser voice: when no server voice is selected, or the server voice failed (never silent)
      let spokeLocally = false;
      const speakLocally = () => {
        if (spokeLocally) return;
        spokeLocally = true;
        if (!("speechSynthesis" in window)) return done();
        const u = makeUtterance ? makeUtterance(text) : new SpeechSynthesisUtterance(text);
        if (!makeUtterance) u.lang = lang();
        u.volume = 1;
        u.onend = u.onerror = done;
        speechSynthesis.speak(u);
      };
      try {
        const url = ttsUrl ? ttsUrl(text) : null;
        if (!url) return speakLocally();
        voice = new Audio(url);
        voice.volume = 1; // above his normal (ducked) speaking volume
        voice.onended = done;
        voice.onerror = speakLocally;
        voice.play().catch(speakLocally);
      } catch {
        speakLocally();
      }
    });
  }

  /** Play one pre-rendered cycle; resolves when it has played. */
  function play(item) {
    const src = ctx.createBufferSource();
    src.buffer = item.buffer;
    src.connect(out.input);
    src.start(ctx.currentTime + 0.05);
    current = src;
    return wait(item.length * 1000 + 80);
  }

  async function loop(alarm, sound, setting) {
    const line = `Alarm${alarm.label ? `: ${alarm.label}` : ""}. It's ${alarm.time}.`;
    const cache = cacheFor(ctx);
    for (let n = 0; ringing; n++) {
      mode = chooseAlarmPerformance({ setting, fps: getFps(), underruns: underrunsOf(ctx) - underrunsAtStart, renderRatio: cache.lastRatio });
      let item = cache.peek(sound, mode, n);
      if (!item) {
        // not rendered yet: the light classic beeps (cheap, live) until it is, so it's never silent
        const pending = cache.get(sound, mode, n).catch(() => null);
        while (ringing && !(item = cache.peek(sound, mode, n))) {
          const len = scheduleCycle(ctx, out, "classic", ctx.currentTime + 0.05, { n });
          const r = await Promise.race([pending, wait(len * 1000 + 100).then(() => undefined)]);
          if (r === null) break; // the render failed: keep the classic beeps for this cycle
          if (r === undefined) continue;
        }
        if (!item) {
          if (!ringing) break;
          continue;
        }
      }
      if (!ringing) break;
      cache.get(sound, mode, n + 1).catch(() => {}); // render the next one while this plays
      await play(item);
      if (!ringing) break;
      // the label between rings (every cycle for the long missile strike, every other one otherwise)
      if (sound === "strike" || n % 2 === 1) await say(line);
      else await wait(300);
    }
  }

  return {
    get ringing() {
      return ringing;
    },
    /** "full" or "smooth": what's playing now. */
    get mode() {
      return mode;
    },
    /**
     * Render the first cycle ahead of time (e.g. when an alarm is set), so ringing starts at once.
     * In Auto, if that render was slow, the Smooth version is rendered too.
     */
    async prepare({ sound = DEFAULT_ALARM_SOUND, performance: setting = "auto", sampleRate } = {}) {
      const cache = givenCache || sharedAlarmCache(sampleRate || getCtx?.()?.sampleRate || 48000);
      cache.keepOnly(sound);
      const first = chooseAlarmPerformance({ setting, fps: getFps(), renderRatio: cache.lastRatio });
      await cache.get(sound, first, 0);
      const after = chooseAlarmPerformance({ setting, fps: getFps(), renderRatio: cache.lastRatio });
      if (after !== first) await cache.get(sound, after, 0);
      return { mode: after, renderRatio: cache.lastRatio };
    },
    /** Start ringing. Resolves { audible }: false if the browser is blocking sound. */
    async start(alarm, { volume = DEFAULT_ALARM_VOLUME, sound = DEFAULT_ALARM_SOUND, maxLoud = false, performance: setting = "auto" } = {}) {
      if (ringing) return { audible: Boolean(out) };
      ringing = true;
      spoken = [];
      target = alarmGain({ volume, maxLoud });
      const ok = await audible();
      if (!ringing) return { audible: ok };
      if (!ok) return { audible: false };
      out = buildOutput(ctx, target, { maxLoud });
      // escalation: 60% of the setting, up to full over 20 seconds
      const now = ctx.currentTime;
      out.ramp.gain.setValueAtTime(RAMP_START, now);
      out.ramp.gain.linearRampToValueAtTime(1, now + RAMP_SECONDS);
      calib = { until: performance.now() + 1200, levels: [] };
      echo = 0;
      underrunsAtStart = underrunsOf(ctx);
      loop(alarm, normalizeSound(sound), setting);
      return { audible: true };
    },
    stop() {
      ringing = false;
      calib = null;
      if (out && ctx) {
        const g = out.master.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setTargetAtTime(0, ctx.currentTime, 0.02); // silent within a few ms
        const o = out;
        const src = current;
        setTimeout(() => {
          try {
            src?.stop();
          } catch {
            /* already stopped */
          }
          o.duck.disconnect();
        }, 120);
      }
      out = null;
      current = null;
      if (voice) {
        voice.pause();
        voice = null;
      }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    /** What Jericho said while ringing (so it's not mistaken for you). */
    spoken: () => [...spoken],
    /**
     * Mic level while ringing: the first 1.2 s measure the alarm's own echo; after that, a level
     * clearly above it (a lower bar than interrupting speech) dips the alarm so you can be heard.
     */
    level(v, now = performance.now()) {
      if (!ringing || !out || !ctx) return;
      if (calib) {
        calib.levels.push(v);
        if (now >= calib.until) {
          const s = [...calib.levels].sort((a, b) => a - b);
          echo = s[Math.floor(s.length * 0.9)] || 0;
          calib = null;
        }
        return;
      }
      if (v > Math.max(0.05, echo * 1.8) && now > duckUntil - 1200) {
        duckUntil = now + 1800;
        const g = out.duck.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setTargetAtTime(0.2, ctx.currentTime, 0.03);
        g.setTargetAtTime(1, ctx.currentTime + 1.8, 0.2);
      }
    },
  };
}

/**
 * Preview for the settings panel: one full cycle of the sound (a whole 5-missile strike) at the
 * given volume, through the same limiter, from the same pre-rendered cache. Returns
 * { stop(), ready } at once; `ready` resolves to the cycle's length when it starts playing
 * (the first time, after it has been rendered). Calls onEnd when it's done or stopped.
 */
export function previewAlarm(ctx, { sound = DEFAULT_ALARM_SOUND, volume = DEFAULT_ALARM_VOLUME, maxLoud = false, performance: setting = "auto" } = {}, onEnd = () => {}, { cache = sharedAlarmCache(ctx.sampleRate), getFps = () => 0 } = {}) {
  const chain = buildOutput(ctx, alarmGain({ volume, maxLoud }), { maxLoud });
  let stopped = false;
  let timer = null;
  let src = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    const g = chain.duck.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(0, ctx.currentTime, 0.03); // a quick fade, never a click
    setTimeout(() => {
      try {
        src?.stop();
      } catch {
        /* not started */
      }
      chain.duck.disconnect();
    }, 250);
    onEnd();
  };
  const mode = chooseAlarmPerformance({ setting, fps: getFps(), renderRatio: cache.lastRatio });
  const ready = cache.get(normalizeSound(sound), mode, 1).then(
    (item) => {
      if (stopped) return 0;
      src = ctx.createBufferSource();
      src.buffer = item.buffer;
      src.connect(chain.input);
      src.start(ctx.currentTime + 0.05);
      timer = setTimeout(stop, item.length * 1000 + 300);
      return item.length;
    },
    () => {
      stop();
      return 0;
    },
  );
  return { stop, ready, mode };
}
