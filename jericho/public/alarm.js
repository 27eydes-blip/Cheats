// The alarm ringer, made live with Web Audio (no audio files), and Jericho reading the label
// between rings. Four sounds:
//   strike   (default) "Missile strike": five missile streaks whoosh across the stereo field and
//            land in deep impacts; an air-raid siren answers each hit, climbing higher and louder,
//            then holds at full with rapid warning beeps and sonar pings; a short silence; repeat
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
let noiseCache = new WeakMap();
function noiseBuffer(ctx, seconds = 2, brown = false) {
  const key = `${seconds}:${brown}`;
  const cache = noiseCache.get(ctx) || {};
  if (cache[key]) return cache[key];
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
  cache[key] = buf;
  noiseCache.set(ctx, cache);
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
  setTimeout(() => {
    delay.disconnect();
    fb.disconnect();
  }, Math.max(0, at - ctx.currentTime + 3) * 1000);
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
  spacing: 1.35, // a new streak every 1.35 s
  whoosh: 1.0, // each streak flies for 1 s, then hits
  hold: 7, // full siren after the 5th impact
  silence: 1.2, // then a short silence before the next cycle
  sirenFromImpact: 3, // the siren stays silent until the 3rd impact lands
  lastWeight: 1.9, // the 5th impact carries almost double the weight of the 1st
  preDuck: { from: 0.16, to: 0.06, depth: 0.22, back: 0.45 }, // everything else dips just before each hit
  impactLevel: 0.34, // how loud a weight-1 hit is (see impact())
  bedLevel: 0.55, // the siren, beeps, pings and rumble sit this much under the hits
};

/**
 * When everything happens in one cycle (seconds from its start). Streaks alternate left->right and
 * right->left; each lands harder than the one before (weight 1 up to 1.9 for the 5th). The siren is
 * silent until the 3rd impact, starts there low and rising, steps up at the 4th and 5th, then holds.
 */
export function strikeTimeline(cycle = 0) {
  const n = STRIKE.streaks;
  const streaks = Array.from({ length: n }, (_, i) => {
    const start = i * STRIKE.spacing;
    return { start, impact: start + STRIKE.whoosh, pan: i % 2 === 0 ? [-0.9, 0.9] : [0.9, -0.9], weight: 1 + (STRIKE.lastWeight - 1) * (i / (n - 1)) };
  });
  const sirenAt = STRIKE.sirenFromImpact - 1;
  const answering = streaks.slice(sirenAt);
  const stages = answering.map((s, j) => {
    const k = answering.length > 1 ? j / (answering.length - 1) : 1; // 0 at the 3rd impact, 1 at the 5th
    const next = streaks[sirenAt + j + 1];
    return {
      at: s.impact,
      nextStreak: next ? next.start : null, // dips while this one passes over
      level: 0.04 + 0.11 * k, // low and quiet at first, full at the 5th
      low: 400 + 40 * k,
      high: 650 + 550 * k, // 650 Hz at the 3rd impact, the full 400-1200 Hz by the 5th
      sweep: 1.0 - 0.45 * k, // seconds per rise (and per fall): faster, more urgent
      square: 0.35 + 0.65 * k, // more of the harsh square wave as it gets more urgent
    };
  });
  const holdStart = streaks.at(-1).impact;
  const holdEnd = holdStart + STRIKE.hold;
  // later cycles hit harder (up to 1.0 by the fourth cycle)
  const power = Math.min(1, 0.7 + 0.1 * cycle);
  return { streaks, stages, sirenStart: stages[0].at, holdStart, holdEnd, end: holdEnd + STRIKE.silence, power };
}

/** A missile streak: rising filtered noise, a rocket rumble, a Doppler tone, panned across. */
function streak(ctx, out, at, len, [fromPan, toPan], power) {
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) {
    pan.pan.setValueAtTime(fromPan, at);
    pan.pan.linearRampToValueAtTime(toPan, at + len);
    pan.connect(out);
  }
  const dest = pan || out;
  // the air: noise through a band-pass that sweeps upward
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 2, false);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(350, at);
  bp.frequency.exponentialRampToValueAtTime(5500, at + len);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, at);
  ng.gain.exponentialRampToValueAtTime(0.3 * power, at + len * 0.85);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.04);
  n.connect(bp).connect(ng).connect(dest);
  n.start(at);
  n.stop(at + len + 0.1);
  // the rocket: low rumbling noise opening up as it comes in
  const r = ctx.createBufferSource();
  r.buffer = noiseBuffer(ctx, 3, true);
  const rl = ctx.createBiquadFilter();
  rl.type = "lowpass";
  rl.frequency.setValueAtTime(140, at);
  rl.frequency.exponentialRampToValueAtTime(520, at + len);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.0001, at);
  rg.gain.exponentialRampToValueAtTime(0.55 * power, at + len * 0.9);
  rg.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.05);
  r.connect(rl).connect(rg).connect(dest);
  r.start(at);
  r.stop(at + len + 0.1);
  // Doppler: the tone climbs as it approaches, then drops as it passes
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(320, at);
  o.frequency.exponentialRampToValueAtTime(760, at + len * 0.72);
  o.frequency.exponentialRampToValueAtTime(290, at + len);
  const ol = ctx.createBiquadFilter();
  ol.type = "lowpass";
  ol.frequency.value = 1800;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, at);
  og.gain.exponentialRampToValueAtTime(0.07 * power, at + len * 0.72);
  og.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(ol).connect(og).connect(dest);
  o.start(at);
  o.stop(at + len + 0.02);
}

/**
 * The impact, in layers, scaled by `w` (1 for the 1st, up to 1.9 for the 5th; times the cycle's power):
 * a sharp crack, a pressure-wave whump, a deep 50->30 Hz sub thud, a long boom (lightly driven),
 * debris bursts flying out to the sides, and a long rumbling tail. Heavier hits are also longer.
 */
function impact(ctx, drive, clean, at, pan, weight) {
  // `weight` sets how long and full the hit is; `w` how loud. The 1st hit sits well under the
  // limiter so the heavier ones have room to be clearly bigger, instead of all being flattened.
  const len = (base, extra) => base + extra * (Math.max(1, weight) - 1);
  const w = weight * STRIKE.impactLevel;
  // the crack: a few milliseconds of bright noise, the loudest instant of the hit
  const c = ctx.createBufferSource();
  c.buffer = noiseBuffer(ctx, 2, false);
  const ch = ctx.createBiquadFilter();
  ch.type = "highpass";
  ch.frequency.value = 1200;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, at);
  cg.gain.exponentialRampToValueAtTime(0.75 * w, at + 0.002);
  cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  c.connect(ch).connect(cg).connect(panner(ctx, pan * 0.4, clean));
  c.start(at);
  c.stop(at + 0.08);
  // the whump: a short, heavy push of air
  const wp = ctx.createOscillator();
  const wg = ctx.createGain();
  wp.type = "sine";
  wp.frequency.setValueAtTime(78, at);
  wp.frequency.exponentialRampToValueAtTime(42, at + 0.2);
  wg.gain.setValueAtTime(0.0001, at);
  wg.gain.exponentialRampToValueAtTime(0.7 * w, at + 0.008);
  wg.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
  wp.connect(wg).connect(clean);
  wp.start(at);
  wp.stop(at + 0.26);
  const wn = ctx.createBufferSource();
  wn.buffer = noiseBuffer(ctx, 2, false);
  const wl = ctx.createBiquadFilter();
  wl.type = "lowpass";
  wl.frequency.value = 240;
  const wng = ctx.createGain();
  wng.gain.setValueAtTime(0.0001, at);
  wng.gain.exponentialRampToValueAtTime(0.6 * w, at + 0.01);
  wng.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  wn.connect(wl).connect(wng).connect(clean);
  wn.start(at);
  wn.stop(at + 0.22);
  // the sub thud: deep (50 -> 30 Hz), clean and centred, longer for heavier hits
  const sub = ctx.createOscillator();
  const sg = ctx.createGain();
  sub.type = "sine";
  const subLen = len(1.2, 0.9);
  sub.frequency.setValueAtTime(50, at);
  sub.frequency.exponentialRampToValueAtTime(30, at + subLen * 0.7);
  sg.gain.setValueAtTime(0.0001, at);
  sg.gain.exponentialRampToValueAtTime(0.55 * w, at + 0.015);
  sg.gain.exponentialRampToValueAtTime(0.0001, at + subLen);
  sub.connect(sg).connect(clean);
  sub.start(at);
  sub.stop(at + subLen + 0.05);
  // the boom: fuller and longer, a touch of drive for weight
  const boom = ctx.createOscillator();
  const bg = ctx.createGain();
  boom.type = "sine";
  const boomLen = len(1.8, 1.0);
  boom.frequency.setValueAtTime(92, at);
  boom.frequency.exponentialRampToValueAtTime(33, at + boomLen * 0.8);
  bg.gain.setValueAtTime(0.0001, at);
  bg.gain.exponentialRampToValueAtTime(0.5 * w, at + 0.02);
  bg.gain.exponentialRampToValueAtTime(0.0001, at + boomLen);
  boom.connect(bg).connect(panner(ctx, pan * 0.3, drive));
  boom.start(at);
  boom.stop(at + boomLen + 0.05);
  // debris: short filtered noise bursts scattered to the sides over the first moment
  const pieces = 5 + Math.round(3 * (Math.max(1, weight) - 1));
  for (let i = 0; i < pieces; i++) {
    const t = at + 0.03 + Math.random() * len(0.6, 0.4);
    const d = ctx.createBufferSource();
    d.buffer = noiseBuffer(ctx, 2, false);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.value = 900 + Math.random() * 2600;
    const dg = ctx.createGain();
    const lvl = (0.25 + Math.random() * 0.15) * w * (1 - (t - at) / 1.2);
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.exponentialRampToValueAtTime(Math.max(0.002, lvl), t + 0.004);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.07);
    d.connect(bp).connect(dg).connect(panner(ctx, (Math.random() * 2 - 1) * 0.95, clean));
    d.start(t);
    d.stop(t + 0.14);
  }
  // the tail: a dark rumble rolling on for seconds
  const tail = ctx.createBufferSource();
  tail.buffer = noiseBuffer(ctx, 3, true);
  tail.loop = true;
  const tl = ctx.createBiquadFilter();
  tl.type = "lowpass";
  tl.frequency.setValueAtTime(160, at);
  tl.frequency.exponentialRampToValueAtTime(70, at + 1.5);
  const tg = ctx.createGain();
  const tailLen = len(3.2, 1.8);
  tg.gain.setValueAtTime(0.0001, at);
  tg.gain.exponentialRampToValueAtTime(0.65 * w, at + 0.1);
  tg.gain.exponentialRampToValueAtTime(0.0001, at + tailLen);
  tail.connect(tl).connect(tg).connect(panner(ctx, -pan * 0.3, clean));
  tail.start(at);
  tail.stop(at + tailLen + 0.05);
}

/**
 * The siren that answers the strikes: three detuned oscillators sharing one sweep. At each
 * impact it jumps to that stage's pitch range, speed and loudness (swelling in), dips while the
 * next streak passes, and after the last impact holds at full until `holdEnd`.
 */
function strikeSiren(ctx, out, tl) {
  const first = tl.stages[0].at;
  const end = tl.holdEnd;
  // the sweep: up and down within each stage's range, faster and wider stage by stage
  const points = []; // [time, freq]
  let freq = tl.stages[0].low;
  points.push([first, freq]);
  tl.stages.forEach((st, i) => {
    const stop = i + 1 < tl.stages.length ? tl.stages[i + 1].at : end;
    let t = st.at;
    let up = true; // every hit sends it climbing
    while (t + 0.05 < stop) {
      const target = up ? st.high : st.low;
      const next = Math.min(stop, t + st.sweep);
      // a sweep cut short by the next impact stops part of the way there
      freq += (target - freq) * ((next - t) / st.sweep);
      points.push([next, freq]);
      t = next;
      up = !up;
    }
  });
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3400;
  lp.connect(out);
  const body = ctx.createGain(); // the siren's loudness: swells on each hit, dips for each streak
  body.gain.setValueAtTime(0.0001, first);
  body.connect(lp);
  tl.stages.forEach((st) => {
    body.gain.setTargetAtTime(st.level, st.at, 0.08); // swell
    if (st.nextStreak != null) body.gain.setTargetAtTime(st.level * 0.45, st.nextStreak + 0.25, 0.1); // the next streak passes over
  });
  body.gain.setTargetAtTime(0.0001, end - 0.15, 0.05);
  const squareMix = ctx.createGain(); // the harsh part grows with urgency
  squareMix.gain.setValueAtTime(tl.stages[0].square, first);
  tl.stages.forEach((st) => squareMix.gain.setTargetAtTime(st.square, st.at, 0.1));
  squareMix.connect(body);
  for (const [type, detune, pan] of [["sawtooth", -9, -0.6], ["sawtooth", 4, 0], ["square", 9, 0.6]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(points[0][1], points[0][0]);
    for (const [t, f] of points.slice(1)) o.frequency.linearRampToValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.value = type === "square" ? 0.55 : 0.8;
    o.connect(g).connect(panner(ctx, pan, type === "square" ? squareMix : body));
    o.start(first);
    o.stop(end + 0.1);
  }
  return points;
}

/** One "Missile strike" cycle. Returns its length (including the silence after it). */
export function scheduleStrike(ctx, bus, at, cycle = 0) {
  const { input: clean, drive } = bus;
  const tl = strikeTimeline(cycle);
  // Everything except the impacts plays through this bed, which dips for a moment right before
  // each hit, so the hit lands on near-silence and feels much bigger (contrast, not more volume).
  const bedClean = ctx.createGain();
  const bedDrive = ctx.createGain();
  bedClean.connect(clean);
  bedDrive.connect(drive);
  const { from, to, depth, back } = STRIKE.preDuck;
  for (const bed of [bedClean, bedDrive]) {
    const level = STRIKE.bedLevel;
    bed.gain.setValueAtTime(level, at);
    for (const s of tl.streaks) {
      const hit = at + s.impact;
      bed.gain.setValueAtTime(level, hit - from);
      bed.gain.linearRampToValueAtTime(depth * level, hit - to);
      bed.gain.setValueAtTime(depth * level, hit + 0.08);
      bed.gain.linearRampToValueAtTime(level, hit + back);
    }
  }
  tl.streaks.forEach((s) => {
    streak(ctx, bedClean, at + s.start, s.impact - s.start, s.pan, tl.power);
    impact(ctx, drive, clean, at + s.impact, s.pan[1], tl.power * s.weight); // straight out: never ducked
  });
  // the siren: silent until the 3rd impact
  strikeSiren(ctx, bedDrive, {
    ...tl,
    stages: tl.stages.map((st) => ({ ...st, at: at + st.at, nextStreak: st.nextStreak == null ? null : at + st.nextStreak })),
    holdEnd: at + tl.holdEnd,
  });
  // the hold: rapid triple beeps and sonar pings under the full siren
  for (let t = tl.holdStart + 0.2; t < tl.holdEnd - 0.3; t += 0.75) tripleBeep(ctx, bedClean, at + t, { level: 0.1 + 0.04 * tl.power, freq: 2700 });
  for (let t = tl.holdStart + 0.5; t < tl.holdEnd - 0.8; t += 1.4) sonar(ctx, bedClean, at + t, { level: 0.22 });
  // the low rumble bed under everything (not in the silence)
  rumble(ctx, bedClean, at, tl.holdEnd, { level: 0.25 + 0.12 * tl.power, blasts: 0 });
  return tl.end;
}

/**
 * One cycle of a sound, starting at `at`. `heat` (0..1) is how long it has rung: beeps get
 * faster, pings closer, the siren quicker and the missile more frequent. Returns the cycle's length (s).
 */
export function scheduleCycle(ctx, bus, sound, at, { n = 0, heat = 0 } = {}) {
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
  return scheduleStrike(ctx, bus, at, n);
}

// ---- the ringer ----------------------------------------------------------------------------------
export function createAlarmRinger({ getCtx, ttsUrl, lang = () => "en-US" }) {
  let ringing = false;
  let ctx = null;
  let out = null; // the output chain
  let target = DEFAULT_ALARM_VOLUME;
  let startedAt = 0;
  let voice = null;
  let spoken = [];
  let calib = null; // { until, levels }
  let echo = 0;
  let duckUntil = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
      try {
        voice = new Audio(ttsUrl(text));
        voice.volume = 1; // above his normal (ducked) speaking volume
        voice.onended = voice.onerror = done;
        voice.play().catch(() => {
          // ElevenLabs unavailable or blocked: the browser voice
          if (!("speechSynthesis" in window)) return done();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = lang();
          u.volume = 1;
          u.onend = u.onerror = done;
          speechSynthesis.speak(u);
        });
      } catch {
        done();
      }
    });
  }

  async function loop(alarm, sound) {
    const line = `Alarm${alarm.label ? `: ${alarm.label}` : ""}. It's ${alarm.time}.`;
    for (let n = 0; ringing; n++) {
      const elapsed = (performance.now() - startedAt) / 1000;
      const len = scheduleCycle(ctx, out, sound, ctx.currentTime + 0.05, { n, heat: intensity(elapsed) });
      await wait(len * 1000 + 80);
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
    /** Start ringing. Resolves { audible }: false if the browser is blocking sound. */
    async start(alarm, { volume = DEFAULT_ALARM_VOLUME, sound = DEFAULT_ALARM_SOUND, maxLoud = false } = {}) {
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
      startedAt = performance.now();
      calib = { until: performance.now() + 1200, levels: [] };
      echo = 0;
      loop(alarm, normalizeSound(sound));
      return { audible: true };
    },
    stop() {
      ringing = false;
      calib = null;
      if (out && ctx) {
        const g = out.master.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setTargetAtTime(0, ctx.currentTime, 0.02);
        const o = out;
        setTimeout(() => o.duck.disconnect(), 300);
      }
      out = null;
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
 * Preview for the settings panel: one full cycle of the sound (a whole 5-streak strike), at the
 * given volume, through the same limiter. Returns { stop(), length } and calls onEnd when done.
 */
export function previewAlarm(ctx, { sound = DEFAULT_ALARM_SOUND, volume = DEFAULT_ALARM_VOLUME, maxLoud = false } = {}, onEnd = () => {}) {
  const chain = buildOutput(ctx, alarmGain({ volume, maxLoud }), { maxLoud });
  const at = ctx.currentTime + 0.05;
  const len = scheduleCycle(ctx, chain, normalizeSound(sound), at, { n: 1, heat: 0.3 });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    const g = chain.duck.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(0, ctx.currentTime, 0.03); // a quick fade, never a click
    setTimeout(() => chain.duck.disconnect(), 250);
    onEnd();
  };
  const timer = setTimeout(stop, len * 1000 + 300);
  return { stop, length: len };
}
