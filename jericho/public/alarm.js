// The alarm ringer, made live with Web Audio (no audio files), and Jericho reading the label
// between rings. Four sounds:
//   missile  (default) air-raid siren sweep, sonar pings, a deep rumble with distant blasts,
//            rapid triple warning beeps on top, and now and then an incoming-missile whoosh
//            that lands in a low thud
//   siren    the air-raid siren on its own, over the rumble
//   sonar    sonar/radar pings with soft warning beeps
//   classic  the original rising beeps
// It starts at 60% of the alarm volume and ramps to full over 20 seconds, and gets more intense
// the longer it rings. Everything goes through one output chain: a light drive, a glue
// compressor, a brick-wall limiter and a fixed ceiling, so it can't clip or hurt speakers.
// While you talk over it, the whole thing dips so "stop" or "snooze" can be heard.

export const ALARM_SOUNDS = ["missile", "siren", "sonar", "classic"];
export const DEFAULT_ALARM_SOUND = "missile";
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

/** Incoming missile: a falling whistle and rising air noise over `len` seconds, landing in a thud. */
function whooshThud(ctx, drive, clean, at, len = 1.5) {
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(2600, at);
  o.frequency.exponentialRampToValueAtTime(520, at + len);
  og.gain.setValueAtTime(0.0001, at);
  og.gain.exponentialRampToValueAtTime(0.12, at + len * 0.8);
  og.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(og).connect(clean);
  o.start(at);
  o.stop(at + len + 0.02);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 2, false);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(600, at);
  bp.frequency.exponentialRampToValueAtTime(5200, at + len);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, at);
  ng.gain.exponentialRampToValueAtTime(0.22, at + len * 0.95);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.05);
  // sweeps from one side to the middle, like it's coming in
  n.connect(bp).connect(ng).connect(panner(ctx, -0.6, clean));
  n.start(at);
  n.stop(at + len + 0.1);
  // the impact: a low sine drop plus a dark noise burst, slightly driven
  const hit = at + len;
  const k = ctx.createOscillator();
  const kg = ctx.createGain();
  k.type = "sine";
  k.frequency.setValueAtTime(72, hit);
  k.frequency.exponentialRampToValueAtTime(32, hit + 0.55);
  kg.gain.setValueAtTime(0.0001, hit);
  kg.gain.exponentialRampToValueAtTime(0.9, hit + 0.01);
  kg.gain.exponentialRampToValueAtTime(0.0001, hit + 0.7);
  k.connect(kg).connect(drive);
  k.start(hit);
  k.stop(hit + 0.75);
  blast(ctx, drive, hit, 0.6);
  return hit + 0.7;
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
  // missile alert
  const sweep = 2.4 - heat * 0.7;
  const sirenEnd = siren(ctx, drive, at, { rise: sweep, fall: sweep, level: 0.13 });
  const pingGap = 1.6 - heat * 0.5;
  for (let t = 0.2; t < sirenEnd - at - 0.4; t += pingGap) sonar(ctx, clean, at + t, { level: 0.2 });
  const beepGap = 1.0 - heat * 0.35; // three quick beeps, pause, repeat (quicker with heat)
  for (let t = 0.1; t < sirenEnd - at; t += beepGap) tripleBeep(ctx, clean, at + t, { level: 0.08 + heat * 0.05 });
  rumble(ctx, clean, at, sirenEnd - at, { level: 0.45 + heat * 0.2, blasts: 1 + Math.round(heat * 2) });
  // the incoming missile: every other cycle at first, every cycle once it's been ringing a while
  if (n % 2 === 1 || heat >= 0.5) {
    const end = whooshThud(ctx, drive, clean, sirenEnd - 0.2, 1.5);
    return end - at;
  }
  return sirenEnd - at;
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
      if (n % 2 === 1) await say(line); // the label between rings
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

/** A 3-second sample of a sound at the given volume (through the same limiter), for the settings panel. */
export function previewAlarm(ctx, { sound = DEFAULT_ALARM_SOUND, volume = DEFAULT_ALARM_VOLUME, maxLoud = false } = {}) {
  const chain = buildOutput(ctx, alarmGain({ volume, maxLoud }), { maxLoud });
  const at = ctx.currentTime + 0.05;
  scheduleCycle(ctx, chain, normalizeSound(sound), at, { n: 1, heat: 0.3 });
  // fade out at 3 s, then let go of everything
  chain.duck.gain.setValueAtTime(1, at + 2.7);
  chain.duck.gain.linearRampToValueAtTime(0, at + 3);
  setTimeout(() => chain.duck.disconnect(), 3300);
  return { stop: () => chain.duck.disconnect() };
}
