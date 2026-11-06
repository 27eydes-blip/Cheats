// Build-time renderer for the reggae soundtrack (runs in headless Chromium, never in the game).
// Synthesizes every song / bridge stem with Tone.js in an OfflineAudioContext and hands back
// mono PCM; scripts/music/render.mjs balances, encodes (MP3) and writes public/music/.
//
// One arrangement function per clip calls `P.<instrument>(...)` at absolute times; for each
// stem only that stem's instruments are real, the rest are no-ops, so stems always line up.
import * as Tone from "tone";
import {
  barSeconds,
  bridgeBars,
  bridgePairs,
  CALM,
  INTRO_BARS,
  MODES,
  SONGS,
  sections,
} from "./songs.js";

export const SAMPLE_RATE = 32000;
export const STEMS = ["drums", "bass", "skank", "lead"];
export const BRIDGE_STEMS = ["drums", "bass", "music"];
const TAIL = 3; // seconds of echo tail rendered after one-shot clips
const PAD = 0.05; // seconds kept around each loop (see render)

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** Pitch helpers for a song: scale degree → MIDI note. */
function theory(song) {
  const scale = MODES[song.mode];
  const midi = (deg, oct = 0) => {
    const i = ((deg % 7) + 7) % 7;
    return song.root + 12 * (Math.floor(deg / 7) + oct) + scale[i];
  };
  const fold = (m, lo, hi) => {
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  };
  const chord = (c, lo, hi) => {
    const degs = song.cluster ? [c, c + 1, c + 4] : [c, c + 2, c + 4];
    if (song.seventh) degs.push(c + 6);
    return degs.map((d) => mtof(fold(midi(d), lo, hi)));
  };
  const bassNote = (c, d) => mtof(fold(midi(c + d, -1), 33, 47));
  return { midi, chord, bassNote, fold };
}

// ------------------------------------------------------------------------------- instruments

/** Tape-style echo: delay with filtered, slightly wobbly feedback. Returns { input, delay }. */
function tapeEcho(out, time, fb = 0.5) {
  const input = new Tone.Gain(1);
  const delay = new Tone.Delay(time, 2.5);
  const lp = new Tone.Filter(2600, "lowpass");
  const hp = new Tone.Filter(240, "highpass");
  const feedback = new Tone.Gain(fb);
  input.connect(delay);
  delay.chain(lp, hp, feedback, delay);
  hp.connect(out);
  // tape wow: a slow, tiny wobble of the delay time
  const wow = new Tone.LFO({ frequency: 0.35, min: time * 0.996, max: time * 1.004 });
  wow.connect(delay.delayTime);
  wow.start(0);
  return { input, delay, feedback, wow };
}

async function springVerb(out, decay = 1.7) {
  const rev = new Tone.Reverb({ decay, preDelay: 0.012, wet: 1 });
  await rev.ready;
  const hp = new Tone.Filter(320, "highpass");
  const lp = new Tone.Filter(5200, "lowpass");
  rev.chain(hp, lp, out);
  return rev;
}

function crusher(bits) {
  const steps = 2 ** bits;
  return new Tone.WaveShaper((x) => Math.round(x * steps) / steps, 4096);
}

const NOOP = new Proxy({}, { get: (t, k) => (k === "then" ? undefined : () => {}) });
/** An instrument set where anything not defined is a silent no-op. */
// (never a "then": an instrument set must not look like a promise to `await`)
const kit = (o) =>
  new Proxy(o, { get: (t, k) => (k in t ? t[k] : k === "then" ? undefined : () => {}) });

/**
 * Build the instruments of one stem. Every method takes absolute times (seconds).
 * `fx.echo(t, amount, len)` opens the echo send for a "throw".
 */
async function band(stem, song, opts) {
  const master = new Tone.Gain(1);
  // stem mastering: non-bass stems leave the low end to the bass (no mud)
  const hp = new Tone.Filter(stem === "bass" ? 28 : stem === "drums" ? 30 : 160, "highpass");
  const lp = new Tone.Filter(stem === "bass" ? 1100 : 15500, "lowpass");
  master.chain(hp, lp, Tone.getDestination());
  const bus = new Tone.Gain(1).connect(master);
  // sweepable filter for the whole stem (builds, bridges, muffled realms)
  const sweep = new Tone.Filter({ frequency: song?.muffled ? 1800 : 16000, type: "lowpass" });
  sweep.connect(bus);
  const dry = new Tone.Gain(1).connect(sweep);
  const echoSend = new Tone.Gain(song ? song.echo * 0.5 : 0.2);
  const echoTime = opts.echoTime;
  const echo = tapeEcho(sweep, echoTime, opts.feedback ?? 0.48);
  echoSend.connect(echo.input);
  const verbSend = new Tone.Gain(song ? song.reverb : 0.3);
  const verb = await springVerb(sweep, opts.verbDecay ?? 1.7);
  verbSend.connect(verb);
  const route = (node, send = 1, rev = 1) => {
    node.connect(dry);
    if (send) {
      const g = new Tone.Gain(send).connect(echoSend);
      node.connect(g);
    }
    if (rev) {
      const g = new Tone.Gain(rev).connect(verbSend);
      node.connect(g);
    }
    return node;
  };
  const fx = {
    sweep,
    echoSend,
    echo,
    /** dub throw: open the echo send wide for `len` seconds */
    throw(t, amount = 1, len = 0.25) {
      const g = echoSend.gain;
      const base = song ? song.echo * 0.5 : 0.2;
      g.setValueAtTime(base, Math.max(0, t - 0.005));
      g.linearRampToValueAtTime(amount, t + 0.005);
      g.setValueAtTime(amount, t + len);
      g.linearRampToValueAtTime(base, t + len + 0.03);
    },
    feedback(t, v, ramp = 0.05) {
      echo.feedback.gain.setValueAtTime(echo.feedback.gain.getValueAtTime(t), t);
      echo.feedback.gain.linearRampToValueAtTime(v, t + ramp);
    },
    filter(t, from, to, len) {
      const f = sweep.frequency;
      f.setValueAtTime(from, t);
      f.exponentialRampToValueAtTime(to, t + len);
    },
  };
  const P = kit({ fx });
  const soft = song?.soft ? 0.7 : 1;

  if (stem === "drums") {
    const kick = route(
      new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 4.5,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 },
      }),
      0,
      0.05,
    );
    kick.volume.value = 0;
    const clickF = new Tone.Filter(3200, "highpass");
    const click = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.006, sustain: 0 },
    }).connect(clickF);
    route(clickF, 0, 0);
    click.volume.value = -22;
    const rimF = new Tone.Filter({ frequency: 2300, type: "bandpass", Q: 2.2 });
    route(rimF, 0.6, 0.5);
    const rimN = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    }).connect(rimF);
    rimN.volume.value = -3;
    const rimT = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
    });
    route(rimT, 0.6, 0.5);
    rimT.volume.value = -9;
    const snF = new Tone.Filter({ frequency: 1900, type: "bandpass", Q: 0.8 });
    route(snF, 0.25, 0.9);
    const snN = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.17, sustain: 0 },
    }).connect(snF);
    snN.volume.value = -3;
    const snB = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
    });
    route(snB, 0, 0.5);
    snB.volume.value = -10;
    const hatF = new Tone.Filter(7600, "highpass");
    route(hatF, 0.08, 0.1);
    const hatC = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.032, sustain: 0 },
    }).connect(hatF);
    hatC.volume.value = -17;
    const hatO = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
    }).connect(hatF);
    hatO.volume.value = -19;
    // airhorn: three detuned, overdriven saws honking short-short-long (pure synthesis)
    const hornBus = new Tone.Gain(1);
    const hornDist = new Tone.Distortion({ distortion: 0.55, oversample: "2x" });
    const hornBp = new Tone.Filter({ frequency: 1500, type: "bandpass", Q: 0.6 });
    hornBus.chain(hornDist, hornBp);
    route(hornBp, 1, 0.6);
    const horns = [0, 7, 12].map((iv, i) => {
      const s = new Tone.Synth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.012, decay: 0.05, sustain: 0.9, release: 0.06 },
      }).connect(hornBus);
      s.volume.value = -12 - i;
      s.iv = iv;
      return s;
    });
    // riser: noise through a band-pass that opens up + a rising tone
    const riseF = new Tone.Filter({ frequency: 400, type: "bandpass", Q: 1.6 });
    const riseG = new Tone.Gain(0);
    riseF.connect(riseG);
    route(riseG, 0.7, 0.4);
    const riseN = new Tone.Noise("white").connect(riseF);
    const riseT = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.2, decay: 0, sustain: 1, release: 0.05 },
    });
    const riseTF = new Tone.Filter(2400, "lowpass");
    riseT.chain(riseTF, riseG);
    riseT.volume.value = -20;
    // impact on drops: a long, dark noise boom
    const boomF = new Tone.Filter(900, "lowpass");
    route(boomF, 0.3, 0.6);
    const boom = new Tone.NoiseSynth({
      noise: { type: "brown" },
      envelope: { attack: 0.002, decay: 1.1, sustain: 0 },
    }).connect(boomF);
    boom.volume.value = -6;
    const siren = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.04, decay: 0.1, sustain: 0.85, release: 0.4 },
    });
    const sirenF = new Tone.Filter(1700, "lowpass");
    siren.connect(sirenF);
    const sirenG = new Tone.Gain(0.35);
    sirenF.connect(sirenG);
    route(sirenG, 1.2, 0.3);
    siren.volume.value = -16;
    const heart = new Tone.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 2.5,
      envelope: { attack: 0.004, decay: 0.34, sustain: 0, release: 0.1 },
    });
    route(heart, 0.35, 0.2);
    heart.volume.value = 0;

    Object.assign(P, {
      kick(t, v = 1) {
        kick.triggerAttackRelease(48, "8n", t, v * soft);
        click.triggerAttackRelease(0.01, t, v * soft);
      },
      rim(t, v = 1) {
        rimN.triggerAttackRelease(0.04, t, v * soft);
        rimT.triggerAttackRelease(1650, 0.03, t, v * soft);
      },
      snare(t, v = 1) {
        snN.triggerAttackRelease(0.16, t, v * soft);
        snB.triggerAttackRelease(190, 0.08, t, v * soft);
      },
      clap(t, v = 1) {
        for (let k = 0; k < 3; k++)
          snN.triggerAttackRelease(0.05, t + k * 0.011, v * (0.6 + k * 0.2));
      },
      hat(t, v = 0.6, open = false) {
        (open ? hatO : hatC).triggerAttackRelease(open ? 0.2 : 0.03, t, v * soft);
      },
      airhorn(t, f0) {
        // short, short, long, with the pitch scooping up into each honk
        for (const [at, len] of [
          [0, 0.13],
          [0.17, 0.13],
          [0.34, 0.55],
        ]) {
          for (const s of horns) {
            const f = f0 * 2 ** (s.iv / 12);
            s.triggerAttackRelease(f, len, t + at, 0.9);
            s.detune.setValueAtTime(-140, t + at);
            s.detune.linearRampToValueAtTime(0, t + at + 0.045);
          }
        }
        fx.throw(t + 0.34, 0.9, 0.6);
      },
      riser(t, len, peak = 0.6) {
        riseN.start(t).stop(t + len + 0.02);
        riseF.frequency.setValueAtTime(300, t);
        riseF.frequency.exponentialRampToValueAtTime(7000, t + len);
        riseG.gain.setValueAtTime(0.0001, t);
        riseG.gain.exponentialRampToValueAtTime(peak, t + len);
        riseG.gain.linearRampToValueAtTime(0, t + len + 0.02);
        riseT.triggerAttackRelease(110, len, t, 0.8);
        riseT.frequency.setValueAtTime(110, t);
        riseT.frequency.exponentialRampToValueAtTime(880, t + len);
      },
      boom(t) {
        boom.triggerAttackRelease(1.1, t, 1);
        kick.triggerAttackRelease(40, "4n", t, 1);
      },
      siren(t, f0, len) {
        siren.triggerAttackRelease(f0, len, t, 0.8);
        const f = siren.frequency;
        f.setValueAtTime(f0, t + 0.01);
        const n = 3;
        for (let k = 0; k < n; k++) {
          f.exponentialRampToValueAtTime(f0 * 2, t + (len * (k + 0.5)) / n);
          f.exponentialRampToValueAtTime(f0, t + (len * (k + 1)) / n);
        }
        fx.throw(t, 0.9, len);
      },
      heart(t, v = 1) {
        heart.triggerAttackRelease(52, "8n", t, v);
        heart.triggerAttackRelease(47, "8n", t + 0.2, v * 0.65);
      },
    });
  }

  if (stem === "bass") {
    const out = new Tone.Gain(1);
    // warm saturation, then keep it round
    const sat = new Tone.Distortion({ distortion: song?.bassSound === "wobble" ? 0.5 : 0.08 });
    const lpB = new Tone.Filter(song?.bassSound === "wobble" ? 1400 : 700, "lowpass");
    out.chain(sat, lpB);
    route(lpB, 0, 0);
    const sub = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.012, decay: 0.2, sustain: 0.9, release: 0.14 },
    }).connect(out);
    sub.volume.value = -2;
    const body = new Tone.MonoSynth({
      oscillator: { type: song?.bassSound === "wobble" ? "sawtooth" : "triangle" },
      filter: { Q: song?.bassSound === "wobble" ? 6 : 1, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.014, decay: 0.3, sustain: 0.75, release: 0.14 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.25,
        sustain: 0.5,
        baseFrequency: song?.bassSound === "wobble" ? 120 : 260,
        octaves: song?.bassSound === "wobble" ? 3 : 1.6,
      },
    }).connect(out);
    body.volume.value = song?.bassSound === "wobble" ? -9 : -6;
    let wob = null;
    if (song?.bassSound === "wobble") {
      // dubstep wobble: an LFO on the body's filter, in 8th notes of the 140 BPM grid
      wob = new Tone.LFO({ frequency: (140 / 60) * 2, min: 120, max: 1400 }).start(0);
      wob.connect(body.filter.frequency);
    }
    const dropSub = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 0.2, sustain: 1, release: 0.3 },
    }).connect(out);
    Object.assign(P, {
      bass(f, t, dur, v = 0.9) {
        sub.triggerAttackRelease(f, dur, t, v);
        body.triggerAttackRelease(f, dur, t, v);
      },
      wobble(t, rate) {
        if (!wob) return;
        wob.frequency.setValueAtTime(rate, t);
      },
      subDrop(t, len = 1.4) {
        // the heavy bass drop: a sine diving from 110 Hz into the floor
        dropSub.triggerAttackRelease(110, len, t, 1);
        dropSub.frequency.setValueAtTime(110, t);
        dropSub.frequency.exponentialRampToValueAtTime(34, t + len * 0.8);
      },
    });
  }

  if (stem === "skank" || stem === "music") {
    let skIn = new Tone.Gain(1);
    const skBp = new Tone.Filter({ frequency: 1500, type: "bandpass", Q: 0.7 });
    const skHp = new Tone.Filter(380, "highpass");
    if (song?.skank?.crush) {
      const cr = crusher(song.skank.crush);
      skIn.chain(cr, skBp, skHp);
    } else skIn.chain(skBp, skHp);
    route(skHp, 1, 0.5);
    // glitch: a short stutter delay that can be gated open for a beat
    let stut = null;
    if (song?.skank?.stutter) {
      stut = new Tone.Gain(0);
      const d = new Tone.FeedbackDelay({ delayTime: opts.sixteenth / 2, feedback: 0.72, wet: 1 });
      skHp.connect(stut);
      stut.chain(d, dry);
    }
    const skank = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: song?.skank?.wave || "sawtooth" },
      envelope: { attack: 0.001, decay: 0.075, sustain: 0, release: 0.05 },
    }).connect(skIn);
    skank.maxPolyphony = 48;
    skank.volume.value = song?.skank?.wave === "square" ? -15 : -12;
    const chk = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0 },
    }).connect(skIn);
    chk.volume.value = -26;
    const orgF = new Tone.Filter(song?.organBright ? 5200 : 3000, "lowpass");
    route(orgF, 0.5, 0.6);
    const organ = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "custom", partials: [1, 0.55, 0.35, 0, 0.22, 0, 0.12, 0.08] },
      envelope:
        song?.organ === "swell"
          ? { attack: 0.5, decay: 0.05, sustain: 0.8, release: 0.03 }
          : { attack: 0.004, decay: 0.1, sustain: 0.18, release: 0.06 },
    }).connect(orgF);
    organ.maxPolyphony = 48;
    organ.volume.value = song?.organ === "swell" ? -14 : song?.organBright ? -14 : -16;
    let pad = null;
    if (song?.pad) {
      const padF = new Tone.Filter(song.pad.icy ? 5000 : 2400, "lowpass");
      const padHp = new Tone.Filter(300, "highpass");
      const chorus = new Tone.Chorus({
        frequency: 0.6,
        delayTime: 3.5,
        depth: 0.5,
        wet: 0.5,
      }).start();
      padF.chain(padHp, chorus);
      route(chorus, 0.6, 1);
      pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: song.pad.icy
          ? { type: "fattriangle", count: 3, spread: 24 }
          : { type: song.pad.wave },
        envelope: { attack: 1.2, decay: 0.6, sustain: 0.75, release: 2 },
      }).connect(padF);
      pad.maxPolyphony = 24;
      pad.volume.value = -20 + song.pad.vol;
    }
    const hornF = new Tone.Filter(3200, "lowpass");
    route(hornF, 0.5, 0.5);
    const horn = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
      filter: { type: "lowpass", Q: 1 },
      filterEnvelope: { attack: 0.02, decay: 0.14, sustain: 0.4, baseFrequency: 500, octaves: 2.6 },
      envelope: { attack: 0.012, decay: 0.1, sustain: 0.6, release: 0.1 },
    }).connect(hornF);
    horn.maxPolyphony = 24;
    horn.volume.value = -16;
    Object.assign(P, {
      skank(notes, t, v = 0.75) {
        notes.forEach((f, k) => skank.triggerAttackRelease(f, 0.05, t + k * 0.006, v));
        chk.triggerAttackRelease(0.02, t, v);
      },
      organ(notes, t, dur, v = 0.5) {
        organ.triggerAttackRelease(notes, dur, t, v);
      },
      pad(notes, t, dur, v = 0.5) {
        pad?.triggerAttackRelease(notes, dur, t, v);
      },
      stab(notes, t, v = 0.7) {
        horn.triggerAttackRelease(notes, 0.09, t, v);
      },
      stutter(t, len) {
        if (!stut) return;
        stut.gain.setValueAtTime(0, t - 0.003);
        stut.gain.linearRampToValueAtTime(0.9, t + 0.003);
        stut.gain.setValueAtTime(0.9, t + len);
        stut.gain.linearRampToValueAtTime(0, t + len + 0.02);
      },
    });
  }

  if (stem === "lead" || stem === "music") {
    const voice = song?.lead?.voice || "melodica";
    const leadOut = new Tone.Gain(1);
    const vib = new Tone.Vibrato(5.2, voice === "digital" || voice === "bell" ? 0 : 0.08);
    let chain = [vib];
    if (voice === "melodica")
      chain = [
        new Tone.Filter({ frequency: 1300, type: "bandpass", Q: 0.5 }),
        new Tone.Filter(3400, "lowpass"),
        vib,
      ];
    if (voice === "horn") chain = [new Tone.Filter(3000, "lowpass"), vib];
    if (voice === "digital") chain = [crusher(5), new Tone.Filter(4200, "lowpass")];
    leadOut.chain(...chain);
    route(chain[chain.length - 1], 0.9, 0.6);
    const make = () => {
      if (voice === "bell")
        return new Tone.FMSynth({
          harmonicity: 3.01,
          modulationIndex: 6,
          envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 1 },
          modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
        }).connect(leadOut);
      if (voice === "horn")
        return new Tone.MonoSynth({
          oscillator: { type: "fatsawtooth", count: 3, spread: 14 },
          filter: { type: "lowpass", Q: 1 },
          filterEnvelope: {
            attack: 0.03,
            decay: 0.2,
            sustain: 0.5,
            baseFrequency: 600,
            octaves: 2.4,
          },
          envelope: { attack: 0.02, decay: 0.12, sustain: 0.65, release: 0.12 },
        }).connect(leadOut);
      return new Tone.Synth({
        oscillator:
          voice === "flute"
            ? { type: "sine" }
            : voice === "digital"
              ? { type: "square" }
              : { type: "fatsawtooth", count: 2, spread: 8 },
        portamento: voice === "flute" ? 0.04 : 0.025,
        envelope:
          voice === "flute"
            ? { attack: 0.07, decay: 0.2, sustain: 0.8, release: 0.3 }
            : { attack: 0.03, decay: 0.2, sustain: 0.72, release: 0.25 },
      }).connect(leadOut);
    };
    const lead = make();
    lead.volume.value =
      voice === "flute" ? -6 : voice === "bell" ? -8 : voice === "digital" ? -17 : -12;
    const harm = song?.lead?.harm ? make() : null;
    if (harm) harm.volume.value = lead.volume.value - 5;
    // breath on blown instruments
    const breathF = new Tone.Filter({
      frequency: voice === "flute" ? 2600 : 1600,
      type: "bandpass",
      Q: 1.2,
    });
    const breath = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.03, decay: 0.15, sustain: 0.25, release: 0.15 },
    }).connect(breathF);
    route(breathF, 0.3, 0.3);
    breath.volume.value = voice === "flute" ? -28 : -34;
    const bellF = new Tone.Filter(6000, "lowpass");
    route(bellF, 0.9, 0.8);
    const bell = new Tone.FMSynth({
      harmonicity: song?.arp?.digital ? 2 : 3.5,
      modulationIndex: song?.arp?.digital ? 12 : 4,
      oscillator: { type: song?.arp?.digital ? "square" : "sine" },
      envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
    }).connect(bellF);
    bell.volume.value = song?.arp?.digital ? -24 : -18;
    Object.assign(P, {
      lead(f, t, dur, v = 0.75, f2 = null) {
        lead.triggerAttackRelease(f, dur, t, v);
        if (harm && f2) harm.triggerAttackRelease(f2, dur, t, v);
        if (voice === "flute" || voice === "melodica") breath.triggerAttackRelease(dur, t, v);
      },
      bell(f, t, v = 0.5) {
        bell.triggerAttackRelease(f, 0.3, t, v);
      },
    });
  }
  return queued(P);
}

/** Where each instrument call carries its start time (the other arguments are passed on). */
const TIME_ARG = { bass: 1, skank: 1, organ: 1, pad: 1, stab: 1, lead: 1, bell: 1 };
/** Calls that share one synth (their start times must not collide either). */
const SYNTH = { boom: "kick", clap: "snare" };

/**
 * The arrangement calls instruments in musical order, not time order; Tone's monophonic
 * synths need strictly increasing start times. Queue every call, then play them sorted.
 */
function queued(P) {
  const q = [];
  const wrap =
    (name, fn) =>
    (...args) =>
      q.push({ name, fn, args, t: args[TIME_ARG[name] ?? 0] });
  const impl = {};
  for (const k of Object.keys(P)) if (k !== "fx") impl[k] = wrap(k, P[k]);
  const fx = {};
  for (const k of ["throw", "feedback", "filter"]) fx[k] = wrap(`fx.${k}`, P.fx[k]);
  impl.fx = fx;
  impl.flush = () => {
    q.sort((a, b) => a.t - b.t);
    const last = {};
    for (const e of q) {
      const i = TIME_ARG[e.name] ?? 0;
      let t = Math.max(0, e.args[i]);
      const g = SYNTH[e.name] || e.name;
      if (last[g] !== undefined && t <= last[g]) t = last[g] + 0.0005;
      last[g] = e.name === "clap" ? t + 0.025 : t;
      e.args[i] = t;
      e.fn(...e.args);
    }
    q.length = 0;
  };
  return kit(impl);
}

// ------------------------------------------------------------------------------- arrangement

const DRUMS = {
  onedrop: { kick: [8], rim: [8] },
  rockers: { kick: [0, 8], rim: [8] },
  steppers: { kick: [0, 4, 8, 12], rim: [8], snare: [8] },
  dancehall: { kick: [0, 7, 8], clap: [4, 12], rim: [3, 11] },
  ska: { kick: [0, 8], snare: [4, 12] },
  halftime: { kick: [0, 10], snare: [8], rim: [14] },
};

/**
 * Play one bar of a song. `T(step)` → seconds for a 16th of this bar (swing applied inside).
 * `ctx`: { section, bar (in section), sectionBars, chord, barIndex, intensity flags }.
 */
function playBar(P, song, th, T, c) {
  const { section: sec, bar, bars, chord, barIndex } = c;
  const sw = song.drums.swing;
  const t = (s) => T(s) + (s % 2 === 1 ? sw * (T(1) - T(0)) : 0);
  const last = bar === bars - 1;
  const dropOut = sec === "build" && last; // the beat before a drop goes quiet
  const style =
    sec === "drop" ? song.drums.drop : sec === "dub" ? song.drums.dub : song.drums.groove;
  const pat = DRUMS[style];
  const dub = sec === "dub";
  const s = song.scale || 1;

  // ---- drums
  const drumsOn = !(sec === "intro" && bar === 0 && bars > 1);
  for (let i = 0; i < 16; i++) {
    if (dropOut && i >= 12) break;
    if (drumsOn && pat.kick?.includes(i)) P.kick(t(i), style === "steppers" && i % 8 ? 0.8 : 1);
    if (drumsOn && pat.rim?.includes(i)) P.rim(t(i), 0.9);
    if (drumsOn && pat.snare?.includes(i) && sec !== "intro") P.snare(t(i), 0.9);
    if (drumsOn && pat.clap?.includes(i) && sec !== "intro") P.clap(t(i), 0.9);
    if (song.drums.tick && i % 2 === 0 && !pat.rim?.includes(i)) P.rim(t(i), 0.16);
    const hats16 = song.drums.hats === "16ths";
    if (i % 2 === 0) P.hat(t(i), i % 4 === 2 ? 0.75 : 0.45);
    else if (hats16 && sec !== "intro") P.hat(t(i), 0.28);
    if ((sec === "groove" || sec === "drop") && i === 14 && barIndex % 2 === 1)
      P.hat(t(i), 0.55, true);
  }
  // pick-up rim before every other bar, and a roll into the drop
  if ((sec === "groove" || sec === "drop") && barIndex % 2 === 1) P.rim(t(15), 0.35);
  if (sec === "build" && last) for (let i = 0; i < 12; i++) P.snare(t(i), 0.25 + i * 0.06);
  if (sec === "build" && bar === bars - 2 && bars >= 2)
    for (let i = 8; i < 16; i += 2) P.rim(t(i), 0.3 + (i - 8) * 0.06);
  if (sec === "build" && bar === 0) P.riser(t(0), (T(16) - T(0)) * bars, 0.5);
  if (sec === "drop" && bar === 0) {
    P.boom(t(0));
    if (song.airhorn) P.airhorn(t(0), mtof(th.fold(th.midi(0), 69, 80)));
  }
  if (song.siren && dub && bar === 1)
    P.siren(t(0), mtof(th.fold(th.midi(4), 64, 76)), T(16) - T(0));
  // dub throws: rimshots into the echo
  if (dub && pat.rim?.length) P.fx.throw(t(pat.rim[0]), 0.95, 0.06);

  // ---- bass (dub: a drop-out for the first half of bar 3)
  const bassLine = song.bass;
  const bassOn = sec !== "intro" || bar === bars - 1;
  for (let i = 0; i < 16; i++) {
    if (!bassOn || (dropOut && i >= 12)) break;
    if (dub && bar === 2 * s && i < 8) continue;
    if (sec === "intro" && i < 8) continue;
    const n = bassLine[(barIndex * 16 + i) % bassLine.length];
    if (n) P.bass(th.bassNote(chord, n.d), t(i), Math.max(0.08, (T(1) - T(0)) * n.len * 0.92));
  }
  if (sec === "drop" && bar === 0 && song.subDrop) P.subDrop(t(0), (T(16) - T(0)) * 0.9);
  if (song.bassSound === "wobble")
    P.wobble(t(0), sec === "drop" ? (song.bpm / 60) * 3 : (song.bpm / 60) * 1.5);

  // ---- skank, organ, pad, horns
  const notes = th.chord(chord, 57, 76);
  const skankOn = (sec !== "intro" && !(dub && bar < 2 * s)) || (dub && bar === 0);
  for (const i of song.skank.steps) {
    if (!skankOn || (dropOut && i >= 12)) continue;
    if (dub && bar === 0 && i !== song.skank.steps[0]) continue;
    P.skank(notes, t(i), dub ? 0.55 : 0.75);
    if (dub && bar === 0) P.fx.throw(t(i), 1, 0.1);
    if ((song.skank.double || sec === "drop") && song.skank.steps.length <= 2 && !dub)
      P.skank(notes, t(i + 1), 0.4);
  }
  if (sec === "build")
    P.fx.filter(t(0), 500 + 2500 * (bar / bars), 600 + 15000 * ((bar + 1) / bars), T(16) - T(0));
  if (song.skank.stutter && (sec === "drop" || sec === "groove") && barIndex % 2 === 1) {
    for (let k = 1; k < 4; k++) P.skank(notes, t(12) + (k * (T(1) - T(0))) / 2, 0.5);
    P.stutter(t(12), (T(1) - T(0)) * 4);
  }
  const organOn = sec !== "dub" || bar >= 2 * s;
  if (song.organ === "bubble" && organOn && !dropOut) {
    const low = th.chord(chord, 57, 72);
    const high = th.chord(chord, 60, 76);
    for (let i = 0; i < 16; i++) {
      if (i % 4 === 2) P.organ(low, t(i), 0.06, sec === "intro" ? 0.35 : 0.5);
      if (i % 4 === 3) P.organ(high, t(i), 0.05, 0.28);
    }
  }
  if (song.organ === "swell" && organOn) {
    P.organ(th.chord(chord, 55, 72), t(0), (T(8) - T(0)) * 0.98, 0.6);
    P.organ(th.chord(chord, 55, 72), t(8), (T(16) - T(8)) * 0.98, 0.5);
  }
  if (song.pad && bar % s === 0 && sec !== "build")
    P.pad(
      th.chord(chord, song.pad.high ? 69 : 62, song.pad.high ? 88 : 81),
      t(0),
      (T(16) - T(0)) * s,
      dub ? 0.55 : 0.35,
    );
  if (song.horns && (sec === "drop" || (sec === "groove" && bar % 2 === 1)))
    for (const i of song.horns.steps) P.stab(th.chord(chord, 62, 79), t(i), 0.75);

  // ---- lead
  const leadLine = sec === "drop" ? song.lead.drop : sec === "groove" ? song.lead.groove : null;
  if (leadLine) {
    for (let i = 0; i < 16; i++) {
      const n = leadLine[(bar * 16 + i) % leadLine.length];
      if (!n) continue;
      const f = mtof(th.midi(n.d, song.lead.octave));
      const f2 = song.lead.harm ? mtof(th.midi(n.d + song.lead.harm, song.lead.octave)) : null;
      P.lead(
        f,
        t(i),
        (T(1) - T(0)) * n.len * 0.95,
        sec === "drop" ? 0.8 : 0.6,
        sec === "drop" ? f2 : null,
      );
    }
  }
  if (dub && bar === 2 * s) {
    // a fragment of the hook, thrown into the echo
    const hook = song.lead.drop;
    for (let i = 0; i < 8; i++) {
      const n = hook[i];
      if (n)
        P.lead(
          mtof(th.midi(n.d, song.lead.octave)),
          t(i),
          (T(1) - T(0)) * Math.min(n.len, 4),
          0.55,
        );
    }
    P.fx.throw(t(0), 1, T(8) - T(0));
  }
  if (song.arp && (sec === "drop" || (song.pad?.icy && sec !== "intro"))) {
    for (let i = 0; i < 16; i += 2) {
      const pv = song.arp.pattern[(barIndex * 8 + i / 2) % song.arp.pattern.length];
      P.bell(mtof(th.fold(th.midi(chord + pv, song.arp.octave), 72, 98)), t(i), dub ? 0.3 : 0.5);
    }
  }
}

/** Constant-tempo bar clock. */
function bars(bpm) {
  const bar = barSeconds(bpm);
  return (start) => (s) => start + (bar * s) / 16;
}

function chordFor(song, sec, barInSec) {
  const s = song.scale || 1;
  const prog = sec === "drop" ? song.chords.drop : song.chords.groove;
  return prog[Math.floor(barInSec / s) % prog.length];
}

/** The loop body (groove → build → drop → dub), with a warm-up so the loop seam is seamless. */
function arrangeBody(P, song) {
  const th = theory(song);
  const sec = sections(song);
  const clock = bars(song.bpm);
  const bar = barSeconds(song.bpm);
  const warm = 2 * (song.scale || 1);
  const order = ["groove", "build", "drop", "dub"];
  // the warm-up plays the end of the dub so its echoes ring into the first groove bar
  const list = [];
  for (let k = warm; k > 0; k--) list.push(["dub", sec.dub[1] - sec.dub[0] - k]);
  for (const name of order)
    for (let b = 0; b < sec[name][1] - sec[name][0]; b++) list.push([name, b]);
  list.push(["groove", 0]); // played past the loop end: crossfaded into the loop start
  list.forEach(([name, b], i) => {
    const bars = sec[name][1] - sec[name][0];
    playBar(P, song, th, clock(i * bar), {
      section: name,
      bar: b,
      bars,
      chord: chordFor(song, name, b),
      barIndex: b,
    });
  });
  return {
    offset: warm * bar,
    length: sec.total * bar,
    total: (warm + sec.total + 1) * bar,
    seam: true,
  };
}

function arrangeIntro(P, song) {
  const th = theory(song);
  const clock = bars(song.bpm);
  const bar = barSeconds(song.bpm);
  const n = INTRO_BARS * (song.scale || 1);
  for (let b = 0; b < n; b++)
    playBar(P, song, th, clock(b * bar), {
      section: "intro",
      bar: b,
      bars: n,
      chord: chordFor(song, "groove", b),
      barIndex: b,
    });
  P.fx.filter(0, 900, 6000, n * bar);
  return { offset: 0, length: n * bar, total: n * bar + TAIL };
}

/**
 * Tempo map for a bridge, in beats of the outgoing track: a linear tempo ramp from A to B over
 * all but the last bar (ramp pairs), or a constant tempo (same / half / double tempo pairs).
 */
export function bridgeTempo(a, b) {
  const A = SONGS[a].bpm;
  const B = SONGS[b].bpm;
  const n = bridgeBars(a);
  const ratio = B / A;
  const related = [0.5, 1, 2].some((r) => Math.abs(ratio - r) < 1e-6);
  const target = related ? A : B; // related tempos keep A's clock; B plays at its own rate
  const R = 4 * (n - 1);
  const time = (x) => {
    if (target === A) return (60 * x) / A;
    if (x <= R) return ((60 * R) / (target - A)) * Math.log(1 + ((target - A) * x) / (A * R));
    return time(R) + ((x - R) * 60) / target;
  };
  // B's 16th notes in A-beats: B runs `ratio` times faster on a related clock
  const bStep = related ? 1 / 4 / ratio : 1 / 4;
  return { n, time, beats: 4 * n, bStep, related, ratio };
}

/** A → B bridge: A's groove, B's drums + bass fading in, bass swap, echo throw, riser, land. */
function arrangeBridge(P, a, b) {
  const A = SONGS[a];
  const B = SONGS[b];
  const thA = theory(A);
  const thB = theory(B);
  const map = bridgeTempo(a, b);
  const { n, time } = map;
  const warmBar = barSeconds(A.bpm);
  const at = (beat) => warmBar + time(beat);
  // warm-up: one bar of A's groove at A's tempo, so A's echoes are already ringing
  playBar(P, A, thA, bars(A.bpm)(0), {
    section: "groove",
    bar: 3,
    bars: 4,
    chord: chordFor(A, "groove", 3),
    barIndex: 3,
  });
  const half = n / 2; // A bars before the bass swap
  // ---- A's side
  for (let k = 0; k < half; k++) {
    const T = (s) => at(4 * k + s / 4);
    const c = chordFor(A, "groove", k);
    const body = { ...A, lead: { ...A.lead, drop: A.lead.groove } };
    // play A's groove bar; the lead only in the first bar
    const P2 =
      k === 0 ? P : new Proxy(P, { get: (o, key) => (key === "lead" ? () => {} : o[key]) });
    playBar(P2, body, thA, T, { section: "groove", bar: k, bars: 4, chord: c, barIndex: k });
    if (k === half - 1) {
      // the big echo throw on A's last chop; the echo keeps ringing over the swap
      const st = A.skank.steps[A.skank.steps.length - 1];
      P.fx.throw(T(st), 1, (T(16) - T(st)) * 0.9);
      P.fx.feedback(T(st), 0.66, 0.02);
      P.fx.feedback(at(4 * n), 0.45, 1.5);
    }
  }
  // B's hats + rim fade in under A's last bar(s)
  const fadeFrom = n === 4 ? 1 : 0;
  for (let k = fadeFrom; k < half; k++)
    for (let i = 0; i < 16; i += 2) {
      const v = 0.12 + (0.35 * ((k - fadeFrom) * 16 + i)) / ((half - fadeFrom) * 16);
      P.hat(at(4 * k + i / 4) + 0.001, v);
    }
  // ---- B's side: drums (dub style) + bass on B's chords, from the swap downbeat
  const swapBeat = 4 * half;
  const bBars = Math.round(((4 * n - swapBeat) / 4) * (map.related ? map.ratio : 1));
  const sB = B.scale || 1;
  const grooveLen = 4 * sB;
  for (let k = 0; k < bBars; k++) {
    const kb = grooveLen - bBars + k; // the last bars of B's groove lead into its drop
    const c = B.chords.groove[Math.floor(kb / sB) % B.chords.groove.length];
    const T = (s) => at(swapBeat + (k * 16 + s) * map.bStep);
    const sw = B.drums.swing;
    const t = (s) => T(s) + (s % 2 ? sw * (T(1) - T(0)) : 0);
    const lastBar = k === bBars - 1;
    const pat = DRUMS[B.drums.dub];
    for (let i = 0; i < 16; i++) {
      if (lastBar && i >= 12) break; // drop-out on the last beat: only the riser
      if (pat.kick?.includes(i)) P.kick(t(i), 0.95);
      if (pat.rim?.includes(i)) P.rim(t(i), 0.9);
      if (pat.snare?.includes(i)) P.snare(t(i), 0.8);
      if (i % 2 === 0) P.hat(t(i), i % 4 === 2 ? 0.7 : 0.45);
      const nB = B.bass[(kb * 16 + i) % B.bass.length];
      if (nB) P.bass(thB.bassNote(c, nB.d), t(i), Math.max(0.08, (T(1) - T(0)) * nB.len * 0.92));
    }
    if (lastBar) {
      P.fx.throw(t(pat.rim?.[0] ?? 8), 1, 0.08);
      for (let i = 8; i < 12; i++) P.snare(t(i), 0.25 + (i - 8) * 0.12);
    }
  }
  // filter sweep + riser over the second half, landing on B's first beat
  const riseStart = at(swapBeat);
  const land = at(4 * n);
  P.riser(riseStart, land - riseStart, 0.55);
  P.fx.filter(riseStart, 700, 16000, land - riseStart);
  return { offset: warmBar, land: land - warmBar, total: land + TAIL };
}

function arrangeCalm(P) {
  const song = { ...CALM, echo: 0.6, reverb: 0.5, drums: { swing: 0 } };
  const th = theory({ ...song, seventh: false });
  const bar = barSeconds(CALM.bpm);
  const beat = bar / 4;
  const warm = 2;
  for (let b = 0; b < warm + CALM.bars + 1; b++) {
    const t0 = b * bar;
    for (let k = 0; k < 4; k++) P.heart(t0 + k * beat, k % 2 ? 0.8 : 1);
    // a soft dub echo: one muted chord chop every other bar, fading into the delay
    if (b % 2 === 0) {
      P.skank(th.chord(0, 57, 72), t0 + 2 * beat, 0.25);
      P.fx.throw(t0 + 2 * beat, 0.9, 0.1);
    }
  }
  return {
    offset: warm * bar,
    length: CALM.bars * bar,
    total: (warm + CALM.bars + 1) * bar,
    seam: true,
  };
}

// ------------------------------------------------------------------------------- jobs

/** Render one clip stem. job: { kind: "body"|"intro"|"bridge"|"calm"|"calib", id?, a?, b?, stem } */
export async function render(job) {
  const SR = SAMPLE_RATE;
  if (job.kind === "calib") {
    // a single click at exactly 0.1 s: tells the game how much delay its MP3 decoder adds
    const d = new Float32Array(SR);
    d[Math.round(SR * 0.1)] = 0.9;
    d[Math.round(SR * 0.1) + 1] = -0.9;
    return { data: d, sampleRate: SR, meta: { mark: 0.1 } };
  }
  const song = job.kind === "calm" ? null : SONGS[job.a || job.id];
  const bpm = job.kind === "calm" ? CALM.bpm : job.kind === "bridge" ? SONGS[job.b].bpm : song.bpm;
  const beat = 60 / bpm;
  let meta = null;
  // dry-run the arrangement to learn the clip's duration
  const probe = kit({ fx: NOOP });
  if (job.kind === "body") meta = arrangeBody(probe, song);
  else if (job.kind === "intro") meta = arrangeIntro(probe, song);
  else if (job.kind === "bridge") meta = arrangeBridge(probe, job.a, job.b);
  else meta = arrangeCalm(probe);
  const buf = await Tone.Offline(
    async () => {
      const opts = {
        echoTime: beat * 0.75,
        sixteenth: beat / 4,
        feedback: job.kind === "calm" ? 0.62 : 0.48,
        verbDecay: 1.7,
      };
      const P = await band(
        job.stem,
        job.kind === "calm" ? { ...CALM, echo: 0.6, reverb: 0.5, skank: {} } : song,
        opts,
      );
      if (job.kind === "body") arrangeBody(P, song);
      else if (job.kind === "intro") arrangeIntro(P, song);
      else if (job.kind === "bridge") arrangeBridge(P, job.a, job.b);
      else arrangeCalm(P);
      P.flush();
    },
    meta.total,
    1,
    SR,
  );
  const all = buf.getChannelData(0);
  const start = Math.round(meta.offset * SR);
  const end =
    job.kind === "bridge" || job.kind === "intro"
      ? all.length
      : start + Math.round(meta.length * SR);
  if (!meta.seam) return { data: all.slice(start, end), sampleRate: SR, meta };
  // loops keep PAD seconds of audio on both sides of the loop, so the loop points never sit
  // on the very first / last samples of the MP3 (codecs smear the edges of a file)
  const pad = Math.round(PAD * SR);
  const data = all.slice(start - pad, end + pad);
  // seamless loop: the first 30 ms of the loop fade over from what was rendered right after
  // its end, so the sample after the loop point continues the sample before it exactly
  const n = Math.round(0.03 * SR);
  for (let i = 0; i < n; i++) {
    const w = i / n;
    data[pad + i] = data[pad + i] * w + all[end + i] * (1 - w);
  }
  meta.pad = PAD;
  return { data, sampleRate: SR, meta };
}

/** Everything the build renders, in order. */
export function jobs() {
  const list = [{ kind: "calib", name: "calibration" }];
  for (const id of Object.keys(SONGS)) {
    for (const stem of STEMS) list.push({ kind: "body", id, stem, name: `${id}-${stem}` });
    for (const stem of STEMS) list.push({ kind: "intro", id, stem, name: `${id}-intro-${stem}` });
  }
  for (const [a, b] of bridgePairs())
    for (const stem of BRIDGE_STEMS)
      list.push({ kind: "bridge", a, b, stem, name: `bridge-${a}-${b}-${stem}` });
  list.push({ kind: "calm", stem: "drums", name: "calm-drums" });
  list.push({ kind: "calm", stem: "skank", name: "calm-skank" });
  return list;
}

export { bridgeBars };
