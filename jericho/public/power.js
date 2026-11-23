// The power-up sound, made with Web Audio (no audio files), and its timeline, shared with the
// startup animation so the orb's flash lands exactly on the chime.
//   1. a low hum rising in pitch
//   2. a sweep of rising tones as the rings spin up
//   3. a bright metallic chime when the core ignites (the flash)
//   4. a soft idle hum underneath, very quiet, until muted or turned off

/** Where in the orb's power-on the flash happens (scene.js uses the same number). */
export const BOOT_FLASH_AT = 0.14;

/**
 * The timeline, in seconds from the tap. "full" on a fresh visit, "short" on a reload within
 * 10 minutes. orbDelay/orbDur go to the 3D scene; the flash is at orbDelay + 0.14 * orbDur.
 */
export function powerUpPlan(kind = "full") {
  const p = kind === "short" ? { chimeAt: 0.7, orbDur: 1.6, sweepFrom: 0.2, total: 2.2 } : { chimeAt: 2.2, orbDur: 3.6, sweepFrom: 0.9, total: 4.6 };
  return { kind: kind === "short" ? "short" : "full", ...p, humRise: p.chimeAt, orbDelay: Math.max(0, p.chimeAt - BOOT_FLASH_AT * p.orbDur) };
}

const IDLE_LEVEL = 0.05; // of the master volume: very low

/**
 * Plays the sequence on `ctx` (an AudioContext created in the tap). Returns controls for the
 * idle hum. volume 0..1.
 */
export function playPowerUp(ctx, plan, { volume = 0.6, power = true, idle = true } = {}) {
  const t0 = ctx.currentTime + 0.03;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;
  // a gentle limiter so the chime can't clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);

  if (power) {
    hum(ctx, master, t0, plan);
    sweep(ctx, master, t0, plan);
    chime(ctx, master, t0 + plan.chimeAt, plan.kind === "short" ? 0.8 : 1);
  }
  const idleHum = makeIdle(ctx, master, t0 + (power ? plan.chimeAt + 0.4 : 0));
  idleHum.set(idle);
  return {
    setIdle: (on) => idleHum.set(on),
    setVolume(v) {
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.5, ctx.currentTime, 0.05);
    },
    stop() {
      idleHum.set(false);
      setTimeout(() => ctx.close?.().catch(() => {}), 600);
    },
  };
}

// 1. the hum: two low oscillators gliding up, through a low-pass that opens as it rises
function hum(ctx, out, t0, plan) {
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(220, t0);
  lp.frequency.exponentialRampToValueAtTime(1400, t0 + plan.humRise);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + plan.humRise * 0.8);
  g.gain.setValueAtTime(0.5, t0 + plan.humRise);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + plan.humRise + 1.4);
  lp.connect(g).connect(out);
  for (const [type, from, to, level] of [["sawtooth", 38, 96, 0.35], ["sine", 76, 192, 0.6], ["triangle", 57, 144, 0.25]]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + plan.humRise);
    og.gain.value = level;
    o.connect(og).connect(lp);
    o.start(t0);
    o.stop(t0 + plan.humRise + 1.5);
  }
}

// 2. the sweep: quick rising tones, closer together as they near the ignition
function sweep(ctx, out, t0, plan) {
  const notes = [220, 277, 330, 440, 554, 659, 880, 1109];
  const span = plan.chimeAt - plan.sweepFrom;
  notes.forEach((f, i) => {
    const k = i / (notes.length - 1);
    const at = t0 + plan.sweepFrom + span * (1 - (1 - k) ** 1.6) - 0.04;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 1.06, at + 0.16);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.06 + k * 0.08, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.25);
  });
  // a soft rising whoosh under the tones (filtered noise)
  const noise = ctx.createBufferSource();
  const len = Math.ceil(ctx.sampleRate * (span + 0.3));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(300, t0 + plan.sweepFrom);
  bp.frequency.exponentialRampToValueAtTime(4000, t0 + plan.chimeAt);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0 + plan.sweepFrom);
  ng.gain.exponentialRampToValueAtTime(0.06, t0 + plan.chimeAt - 0.05);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + plan.chimeAt + 0.15);
  noise.connect(bp).connect(ng).connect(out);
  noise.start(t0 + plan.sweepFrom);
  noise.stop(t0 + plan.chimeAt + 0.3);
}

// 3. the chime: inharmonic bell partials (metallic) plus a bright strike
function chime(ctx, out, at, length = 1) {
  const base = 784; // G5
  const partials = [[1, 0.5, 2.6], [2.0, 0.22, 1.8], [2.76, 0.3, 1.5], [4.07, 0.14, 1.0], [5.4, 0.1, 0.7], [8.93, 0.05, 0.4]];
  for (const [ratio, level, decay] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = base * ratio;
    o.detune.value = (Math.random() - 0.5) * 6; // a little shimmer
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * length);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay * length + 0.05);
  }
  // the strike: a few milliseconds of bright noise
  const n = ctx.createBufferSource();
  const len = Math.ceil(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  n.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3500;
  const ng = ctx.createGain();
  ng.gain.value = 0.25;
  n.connect(hp).connect(ng).connect(out);
  n.start(at);
}

// 4. the idle hum: a soft low tone that breathes slowly
function makeIdle(ctx, out, startAt) {
  const g = ctx.createGain();
  g.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 260;
  lp.connect(g).connect(out);
  const oscs = [[55, 1], [110, 0.35], [82.5, 0.2]].map(([f, level]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.value = f;
    og.gain.value = level;
    o.connect(og).connect(lp);
    o.start(startAt);
    return o;
  });
  // slow breathing
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 0; // silent until the idle hum is turned on
  lfo.connect(lfoGain).connect(g.gain);
  lfo.start(startAt);
  let on = false;
  return {
    set(next) {
      if (next === on) return;
      on = next;
      const t = Math.max(ctx.currentTime, startAt);
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(on ? IDLE_LEVEL : 0, t, on ? 1.2 : 0.3);
      lfoGain.gain.setTargetAtTime(on ? IDLE_LEVEL * 0.3 : 0, t, 0.3);
    },
    oscs,
  };
}
