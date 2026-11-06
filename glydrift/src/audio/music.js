// Procedural reggae engine (Tone.js). Every sound is synthesized: no audio files.
//
//  master:  track faders → bus → death low-pass → limiter → volume → speakers
//  each track is a small reggae band:
//    drums (one-drop / rockers / steppers / ska / digital) · deep round bass ·
//    guitar skank on the offbeats · bubbling organ · melodica / flute / horn lead ·
//    dub sends (shared spring-ish reverb + tempo-synced echo, rimshot echo throws, siren)
//
// Tracks are built from 8-bar sections (intro → build → main → dub breakdown → drop, looping),
// vary each loop (motif swaps, fills, bass drop-outs) and add layers as `intensity` (player
// speed) rises: a one-drop beat turns into rockers, then steppers, the skank doubles, the
// lead climbs an octave. Track changes start on the next bar and crossfade over 2 seconds.
import * as Tone from "tone";
import { SECTIONS, TRACKS } from "./musicTracks.js";
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const FADE = 2;
const KICK_HZ = 50;
const ORGAN_PARTIALS = [1, 0.55, 0.35, 0, 0.22, 0, 0.12, 0.08];

function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

/** Echo time for a tempo: a dotted eighth, the classic dub delay. */
function echoTime(bpm) {
  return (60 / bpm) * 0.75;
}

/** Drum pattern for a style: kick steps, rimshot / snare steps. */
const DRUMS = {
  onedrop: { kick: [8], rim: [8] },
  rockers: { kick: [0, 8], rim: [8] },
  steppers: { kick: [0, 4, 8, 12], rim: [8] },
  ska: { kick: [0, 8], snare: [4, 12] },
  digital: { kick: [0, 7, 8, 11], snare: [4, 12] },
  heartbeat: { kick: null, rim: [8] },
  none: { kick: [], rim: [] },
};

class Track {
  constructor(engine, id, startBar) {
    this.engine = engine;
    this.id = id;
    this.def = TRACKS[id];
    this.startBar = startBar;
    this.step = 0;
    this.bar = startBar;
    this.section = SECTIONS[Math.floor(startBar / 8) % SECTIONS.length];
    this.started = false;
    this.disposed = false;
    const d = this.def;
    const scale = d.phrygian ? PHRYGIAN : MINOR;
    this.midi = (deg, oct = 0) => {
      const i = ((deg % 7) + 7) % 7;
      const o = Math.floor(deg / 7);
      return d.root + 12 * (o + oct) + scale[i];
    };
    this.nodes = [];
    const keep = (n) => {
      this.nodes.push(n);
      return n;
    };

    // faders (crossfade): sends fade together with the dry signal
    this.fader = keep(new Tone.Gain(0)).connect(engine.bus);
    this.sendFader = keep(new Tone.Gain(0));
    this.revSend = keep(new Tone.Gain(d.reverb)).connect(engine.reverb);
    this.sendFader.connect(this.revSend);
    this.dlySend = keep(new Tone.Gain(d.delay)).connect(engine.delay);
    this.sendFader.connect(this.dlySend);

    // ---- drums: a round, low kick and a dry cross-stick rimshot
    const drums = keep(new Tone.Gain(1)).connect(this.fader);
    this.kick = keep(
      new Tone.MembraneSynth({
        pitchDecay: 0.045,
        octaves: 4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.08 },
      }),
    ).connect(drums);
    this.kick.volume.value = d.soft ? -8 : -3;
    // rimshots feed a dub "throw": a send to the echo that opens for single hits
    this.rimBus = keep(new Tone.Gain(1)).connect(drums);
    this.throwSend = keep(new Tone.Gain(0)).connect(this.sendFader);
    this.rimBus.connect(this.throwSend);
    const rimF = keep(new Tone.Filter({ frequency: 2300, type: "bandpass", Q: 2.2 })).connect(
      this.rimBus,
    );
    this.rimNoise = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
      }),
    ).connect(rimF);
    this.rimNoise.volume.value = d.soft ? -12 : -6;
    this.rimTone = keep(
      new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      }),
    ).connect(this.rimBus);
    this.rimTone.volume.value = d.soft ? -16 : -11;
    const snareF = keep(new Tone.Filter(1700, "bandpass")).connect(this.rimBus);
    this.snare = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
      }),
    ).connect(snareF);
    this.snare.volume.value = -8;
    const hatF = keep(new Tone.Filter(7500, "highpass")).connect(drums);
    this.hatC = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
      }),
    ).connect(hatF);
    this.hatC.volume.value = d.soft ? -27 : -22;
    this.hatO = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      }),
    ).connect(hatF);
    this.hatO.volume.value = d.soft ? -28 : -23;

    // ---- bass: deep and round (triangle through a low-pass so phone speakers still hear it)
    this.bassOut = keep(new Tone.Gain(1)).connect(this.fader);
    this.bass = keep(
      new Tone.MonoSynth({
        oscillator: { type: d.bassWave || "triangle" },
        filter: { Q: 1, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.012, decay: 0.3, sustain: 0.8, release: 0.12 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.25,
          sustain: 0.5,
          baseFrequency: d.bassCutoff * 0.5,
          octaves: 1.4,
        },
      }),
    );
    if (d.dist) {
      // heavy distorted sub: drive the bass into a waveshaper, then tame the fizz
      const dist = keep(new Tone.Distortion({ distortion: d.dist, oversample: "2x" }));
      const tame = keep(new Tone.Filter(800, "lowpass")).connect(this.bassOut);
      this.bass.connect(dist);
      dist.connect(tame);
      this.bass.volume.value = -8;
    } else {
      this.bass.connect(this.bassOut);
      this.bass.volume.value = -2;
    }

    // ---- melodic instruments: dry + sent to the shared reverb / echo
    this.synthBus = keep(new Tone.Gain(1));
    let chain = this.synthBus;
    if (d.crush) {
      this.crusher = keep(new Tone.BitCrusher(6));
      chain.connect(this.crusher);
      chain = this.crusher;
    }
    chain.connect(this.fader);
    chain.connect(this.sendFader);

    // guitar skank: a short, bright chop on the offbeat, strummed across the strings
    this.chordF = keep(new Tone.Filter(d.chordCutoff, "lowpass")).connect(this.synthBus);
    const skankHp = keep(new Tone.Filter(520, "highpass")).connect(this.chordF);
    this.skank = keep(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: d.skankWave || "sawtooth" },
        envelope: { attack: 0.001, decay: 0.075, sustain: 0, release: 0.05 },
      }),
    ).connect(skankHp);
    this.skank.maxPolyphony = 32;
    this.skank.volume.value = d.skankWave === "square" ? -20 : -17;

    // organ: the "bubble" (and long swells in the Mirror Realm)
    if (d.organ) {
      this.organ = keep(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "custom", partials: ORGAN_PARTIALS },
          envelope: d.swell
            ? { attack: 0.35, decay: 0.05, sustain: 0.6, release: 0.03 }
            : { attack: 0.004, decay: 0.11, sustain: 0.15, release: 0.06 },
        }),
      ).connect(this.chordF);
      this.organ.maxPolyphony = 32;
      this.organ.volume.value = d.swell ? -20 : -19;
    }
    if (d.pad) {
      this.pad = keep(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: d.pad.wave },
          envelope: { attack: 1.1, decay: 0.6, sustain: 0.7, release: 1.8 },
        }),
      ).connect(this.synthBus);
      this.pad.maxPolyphony = 24;
      this.pad.volume.value = d.pad.vol;
    }

    // lead: melodica (reedy saw), flute (sine), horn (brassy saw section) or digital (square)
    const voice = d.lead.voice;
    const leadWave = voice === "flute" ? "sine" : voice === "digital" ? "square" : "sawtooth";
    const leadCut = voice === "melodica" ? 2200 : voice === "horn" ? 2800 : 5000;
    const vib = keep(new Tone.Vibrato(5.2, voice === "digital" ? 0 : 0.07)).connect(this.synthBus);
    const leadF = keep(new Tone.Filter(leadCut, "lowpass")).connect(vib);
    const mkLead = () =>
      keep(
        new Tone.Synth({
          oscillator: { type: leadWave },
          portamento: voice === "horn" ? 0 : 0.03,
          envelope:
            voice === "horn"
              ? { attack: 0.02, decay: 0.12, sustain: 0.6, release: 0.12 }
              : { attack: 0.035, decay: 0.2, sustain: 0.7, release: 0.28 },
        }),
      ).connect(leadF);
    const leadVol = leadWave === "sine" ? -13 : leadWave === "square" ? -22 : -19;
    this.lead = mkLead();
    this.lead.volume.value = leadVol;
    if (d.lead.harm) {
      this.lead2 = mkLead();
      this.lead2.volume.value = leadVol - 4;
    }
    if (d.arp) {
      this.arp = keep(
        new Tone.Synth({
          oscillator: { type: d.arp.wave },
          envelope: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.1 },
        }),
      ).connect(this.synthBus);
      this.arp.volume.value = d.arp.wave === "square" ? -27 : -21;
    }
    if (d.siren) {
      // dub siren: a wailing tone swept up and down, drowned in echo
      this.siren = keep(
        new Tone.Synth({
          oscillator: { type: "square" },
          envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.6 },
        }),
      );
      const sirenF = keep(new Tone.Filter(1800, "lowpass")).connect(this.sendFader);
      this.siren.connect(sirenF);
      this.siren.volume.value = -24;
    }
    if (d.whisper) {
      // breathy noise swept through a resonant band-pass (eerie whispers)
      this.whisperF = keep(new Tone.Filter({ frequency: 600, type: "bandpass", Q: 7 })).connect(
        this.synthBus,
      );
      this.whisper = keep(
        new Tone.NoiseSynth({
          noise: { type: "pink" },
          envelope: { attack: 1.1, decay: 1.4, sustain: 0, release: 0.8 },
        }),
      ).connect(this.whisperF);
      this.whisper.volume.value = -16;
    }
  }

  chordNotes(deg, oct = 0) {
    const d = this.def;
    const degs = d.cluster ? [deg, deg + 1, deg + 4] : [deg, deg + 2, deg + 4];
    if (d.seventh) degs.push(deg + 6);
    if (d.ninth) degs.push(deg + 8);
    return degs.map((x) => midiToFreq(this.midi(x, oct)));
  }

  /** Bass note for a chord degree + line degree, kept in the A1..A2 range. */
  bassFreq(deg) {
    let m = this.midi(deg, -2);
    while (m < 33) m += 12;
    while (m > 47) m -= 12;
    return midiToFreq(m);
  }

  /** Scheduled every 16th note by the Transport. Never lets a scheduling clash throw. */
  tick(time) {
    if (this.disposed) return;
    // catching up after a long main-thread stall: Tone fires every missed 16th at once,
    // which piles dozens of notes onto the same instant (a blast + "max polyphony")
    if (this.step > 0 && time < Tone.getContext().rawContext.currentTime - 0.25) {
      this.step++;
      this.engine.skipped = (this.engine.skipped || 0) + 1;
      return;
    }
    try {
      this.tickInner(time);
    } catch {
      // a scheduling clash after a main-thread stall: skip this 16th silently (counted for
      // the ?music test page) instead of warning in the console
      this.engine.skipped = (this.engine.skipped || 0) + 1;
    }
  }

  /** The drum style right now: a one-drop gets busier as the player speeds up. */
  drumStyle(sec, I) {
    const base = this.def.drums || "onedrop";
    const hot = sec === "main" || sec === "drop";
    if (!hot) return base;
    if (base === "onedrop") return I > 0.85 ? "steppers" : I > 0.55 ? "rockers" : base;
    if (base === "rockers" && sec === "drop" && I > 0.75) return "steppers";
    return base;
  }

  /** One hit per drum per instant: a fill landing on a groove hit would make Tone throw. */
  once(key, t) {
    const k = `last${key}`;
    if (this[k] !== undefined && t <= this[k]) return false;
    this[k] = t;
    return true;
  }

  snareHit(t, vel, dur = "16n") {
    if (this.once("Snare", t)) this.snare.triggerAttackRelease(dur, t, vel);
  }

  rim(t, vel, throwIt = false) {
    if (!this.once("Rim", t)) return;
    this.rimNoise.triggerAttackRelease("32n", t, vel);
    this.rimTone.triggerAttackRelease(1650, "64n", t, vel);
    if (throwIt) {
      // dub throw: open the echo send just for this hit
      const g = this.throwSend.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.9, t);
      g.setValueAtTime(0, t + 0.09);
    }
  }

  tickInner(time) {
    const d = this.def;
    const e = this.engine;
    const step = this.step++;
    const s = step % 16;
    if (step === 0) {
      this.started = true;
      e.onTrackStarted(this, time);
    }
    const bar = this.startBar + Math.floor(step / 16);
    const secIdx = Math.floor(bar / 8) % SECTIONS.length;
    const sec = SECTIONS[secIdx];
    const inSec = bar % 8;
    const loop = Math.floor(bar / 40);
    this.bar = bar;
    this.section = sec;
    const I = e.intensity;
    const sixteenth = Tone.Time("16n").toSeconds();
    // the reggae shuffle: every off-16th lands a little late
    const t = s % 2 === 1 && d.swing ? time + d.swing * sixteenth : time;
    const chordDeg = d.prog[inSec % d.prog.length];
    const fillBar = inSec === 7;
    const dub = sec === "breakdown";
    const full = sec === "main" || sec === "drop";

    // section-level automation at the top of each bar
    if (s === 0) {
      let cut = d.chordCutoff * (0.7 + 0.5 * I);
      if (sec === "build") cut *= 0.45 + (0.55 * inSec) / 7;
      if (dub) cut *= 0.45;
      if (sec === "intro") cut *= 0.6;
      this.chordF.frequency.rampTo(Math.max(250, cut), 0.4, time);
      if (this.crusher) this.crusher.bits.value = sec === "drop" ? 4 : 6;
      // dub section: everything leans into the echo
      const echo = dub ? Math.min(0.85, d.delay * 2.2) : d.delay;
      this.dlySend.gain.rampTo(echo, 0.6, time);
      this.revSend.gain.rampTo(dub ? Math.min(0.85, d.reverb * 1.5) : d.reverb, 0.6, time);
    }

    // ---- drums
    const style = this.drumStyle(sec, I);
    const pat = DRUMS[style] || DRUMS.onedrop;
    const kicks = pat.kick ?? d.kickSteps ?? [8];
    // intro: rim and hats only until halfway; dub: the drums drop out for bar 6
    const drumsOn = !(sec === "intro" && inSec < 4) && !(dub && inSec === 6);
    if (drumsOn && kicks.includes(s)) {
      // heartbeat kicks: the "dub" (odd hits) is softer than the "lub"
      const soft = style === "heartbeat" && kicks.indexOf(s) % 2 === 1;
      const ghost = style === "steppers" && (s === 4 || s === 12);
      this.kick.triggerAttackRelease(KICK_HZ, "8n", t, soft ? 0.7 : ghost ? 0.8 : 1);
    }
    const rimOn = !(sec === "intro" && inSec < 2);
    if (rimOn && pat.rim?.includes(s)) {
      // throw the rimshot into the echo on odd dub bars and at the end of every section
      this.rim(t, d.soft ? 0.6 : 0.9, (dub && inSec % 2 === 1) || fillBar);
    }
    if (rimOn && pat.snare?.includes(s)) this.snareHit(t, 0.85);
    // pick-up rimshot before the next bar, and the clock tick (Chrono Fracture)
    if (full && I > 0.4 && s === 15 && pat.rim) this.rim(t, 0.35);
    if (d.tick && rimOn && s % 2 === 0 && !pat.rim?.includes(s)) this.rim(t, 0.18);
    // fill: a rising rimshot / snare roll over the last half-bar of a section
    if (fillBar && sec !== "intro" && style !== "none" && s >= (loop % 2 ? 12 : 10)) {
      const v = 0.25 + (s - 10) * 0.1;
      if (pat.snare) this.snareHit(t, v, "32n");
      else if (s % 2 === 0 || s >= 14) this.rim(t, v);
    }
    // hats: swung 8ths (16ths when it gets fast), an open hat leading into every other bar
    if (d.hats !== "none" && drumsOn) {
      const sixteenths = d.hats === "16ths" || (full && I > 0.6);
      if (s % 2 === 0) this.hatC.triggerAttackRelease("32n", t, s % 4 === 2 ? 0.75 : 0.5);
      else if (sixteenths) this.hatC.triggerAttackRelease("32n", t, 0.3);
      if (full && s === 14 && bar % 2 === 1) this.hatO.triggerAttackRelease("16n", t, 0.6);
    }

    // ---- bass (the dub section drops the bass out every fourth bar)
    const bassOn =
      full ||
      (sec === "build" && inSec >= 2) ||
      (sec === "intro" && inSec >= 6) ||
      (dub && inSec % 4 !== 1);
    const bn = d.bass[(bar * 16 + s) % d.bass.length];
    if (bassOn && bn) {
      this.bass.triggerAttackRelease(
        this.bassFreq(chordDeg + bn.d),
        bn.len * sixteenth * 0.92,
        t,
        0.95,
      );
    }

    // ---- guitar skank (+ double skank at speed, + glitch stutter)
    const skankOn =
      full || (sec === "build" && inSec >= 2) || (dub && inSec % 2 === 0 && s === d.skank[0]);
    if (skankOn && d.skank.includes(s)) {
      const notes = this.chordNotes(chordDeg, 1);
      const v = dub ? 0.5 : 0.75;
      notes.forEach((f, k) => this.skank.triggerAttackRelease(f, "32n", t + k * 0.005, v));
      if (dub) {
        // the dub chop: a single skank thrown into the echo
        this.dlySend.gain.setValueAtTime(0.9, t);
        this.dlySend.gain.setValueAtTime(Math.min(0.85, d.delay * 2.2), t + 0.1);
      }
      if ((d.doubleSkank || I > 0.7) && full && d.skank.length <= 2) {
        const t2 = t + sixteenth;
        notes.forEach((f, k) => this.skank.triggerAttackRelease(f, "32n", t2 + k * 0.004, 0.4));
      }
      if (d.stutter && full && inSec % 4 === 3 && s >= 12) {
        for (let k = 1; k < 4; k++)
          this.skank.triggerAttackRelease(notes, "64n", t + (k * sixteenth) / 2, 0.45);
      }
    }

    // ---- organ: bubble on the "&" with ghost notes on the "a" (or long swells)
    if (this.organ) {
      const organOn = full || sec === "build" || (sec === "intro" && inSec >= 4);
      if (organOn && d.swell) {
        if (s === 0 || s === 8)
          this.organ.triggerAttackRelease(this.chordNotes(chordDeg), "2n", t, 0.6);
      } else if (organOn && s % 4 >= 2) {
        const accent = s % 4 === 2;
        this.organ.triggerAttackRelease(
          this.chordNotes(chordDeg, accent ? 0 : 1),
          "32n",
          t,
          accent ? 0.55 : 0.28,
        );
      }
    }

    // ---- pad (whole bar)
    if (this.pad && s === 0 && sec !== "build") {
      this.pad.triggerAttackRelease(
        this.chordNotes(chordDeg, d.pad.oct ?? 0),
        "1m",
        time,
        dub ? 0.7 : 0.45,
      );
    }

    // ---- lead (two-bar motif, swaps A/B by loop & section, octave lift at high speed)
    const leadOn = full || (dub && inSec >= 4);
    if (leadOn) {
      const motif = (loop + secIdx) % 2 === 0 ? d.lead.a : d.lead.b;
      const n = motif[(bar % 2) * 16 + s];
      if (n) {
        let oct = d.lead.octave;
        if (sec === "drop" && I > 0.6) oct += 1;
        const dur = n.len * sixteenth * 0.95;
        const v = dub ? 0.45 : 0.7;
        this.lead.triggerAttackRelease(midiToFreq(this.midi(n.d, oct)), dur, t, v);
        if (this.lead2 && (sec === "drop" || d.drums === "ska"))
          this.lead2.triggerAttackRelease(midiToFreq(this.midi(n.d + d.lead.harm, oct)), dur, t, v);
      }
    }

    // ---- dub siren: a wail in the dub section every four bars
    if (this.siren && dub && s === 0 && inSec % 4 === 1) {
      const f = this.siren.frequency;
      const lo = midiToFreq(this.midi(4, 1));
      this.siren.triggerAttackRelease(lo, 1.4, time, 0.7);
      f.setValueAtTime(lo, time + 0.01);
      f.exponentialRampToValueAtTime(lo * 2, time + 0.5);
      f.exponentialRampToValueAtTime(lo * 0.9, time + 1.2);
    }

    // ---- whisper sweeps (every 4 bars)
    if (this.whisper && s === 0 && bar % 4 === 2) {
      this.whisper.triggerAttackRelease("1m", time, 0.7);
      this.whisperF.frequency.setValueAtTime(380, time);
      this.whisperF.frequency.exponentialRampToValueAtTime(4200, time + 2.4);
    }

    // ---- arpeggio chimes
    if (this.arp && s % 2 === 0) {
      const arpOn =
        sec === "drop" || (sec === "main" && I > 0.5) || (d.arp.always && sec !== "intro");
      if (arpOn) {
        const pv = d.arp.pattern[(step / 2) % d.arp.pattern.length];
        this.arp.triggerAttackRelease(
          midiToFreq(this.midi(chordDeg + pv, d.arp.octave)),
          "32n",
          t,
          dub ? 0.35 : 0.55,
        );
      }
    }
  }

  fadeIn(time, fade = FADE) {
    for (const g of [this.fader.gain, this.sendFader.gain]) {
      g.cancelScheduledValues(time);
      g.setValueAtTime(0, time);
      g.linearRampToValueAtTime(1, time + fade);
    }
  }

  fadeOut(time, fade = FADE) {
    for (const g of [this.fader.gain, this.sendFader.gain]) {
      g.cancelScheduledValues(time);
      g.setValueAtTime(g.getValueAtTime(time), time);
      g.linearRampToValueAtTime(0, time + fade);
    }
    const ms = Math.max(0, (time - Tone.now() + fade + 0.6) * 1000);
    setTimeout(() => this.dispose(), ms);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.eventId !== undefined) Tone.getTransport().clear(this.eventId);
    for (const n of this.nodes) n.dispose();
    this.nodes.length = 0;
  }
}

class MusicEngine {
  constructor() {
    this.unlocked = false;
    this.ready = false;
    this.current = null;
    this.pending = null;
    this.wanted = null;
    this.intensity = 0;
  }

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    if (this.unlocked || TEST.noaudio) return;
    this.unlocked = true;
    Tone.start()
      .then(() => {
        this.build();
        if (this.wanted) this.play(this.wanted.id, this.wanted.opts);
      })
      .catch(() => {
        this.unlocked = false;
      });
  }

  /**
   * Bring sound back after iOS suspended or "interrupted" the context (app switch, a phone
   * call, Siri, the silent switch). Safe to call often; must run in a gesture to work on iOS.
   */
  revive() {
    if (!this.unlocked) return;
    try {
      const ctx = Tone.getContext().rawContext;
      if (ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
    } catch {
      /* no audio on this device */
    }
  }

  build() {
    if (this.ready) return;
    const ctx = Tone.getContext();
    ctx.lookAhead = 0.12; // a little headroom keeps scheduling smooth while the game renders
    this.out = new Tone.Volume(0).toDestination();
    this.limiter = new Tone.Limiter(-1.5).connect(this.out);
    this.lpf = new Tone.Filter({ frequency: 18000, type: "lowpass", rolloff: -24 }).connect(
      this.limiter,
    );
    this.bus = new Tone.Gain(0.8).connect(this.lpf);
    this.reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(this.lpf);
    // tempo-synced dub echo (dotted 8th); retimed whenever the track's tempo changes
    this.delay = new Tone.FeedbackDelay({
      delayTime: echoTime(TRACKS.menu.bpm),
      maxDelay: 1.5,
      feedback: 0.42,
      wet: 1,
    }).connect(this.lpf);
    // The Calm: a low detuned drone + a heartbeat, both outside the track crossfades
    this.calmOut = new Tone.Gain(0).connect(this.limiter);
    const droneF = new Tone.Filter(160, "lowpass").connect(this.calmOut);
    this.drone = [36.71, 36.95, 55.0].map((f, i) => {
      const o = new Tone.Oscillator(f, i === 2 ? "sine" : "sawtooth").connect(droneF);
      o.volume.value = i === 2 ? -14 : -10;
      return o;
    });
    this.heartGain = new Tone.Gain(0).connect(this.limiter);
    this.heart = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 3,
      envelope: { attack: 0.002, decay: 0.32, sustain: 0, release: 0.1 },
    }).connect(this.heartGain);
    this.heart.volume.value = 2;
    this.calmLevel = 0;
    this.calmOn = false;
    const t = Tone.getTransport();
    t.bpm.value = TRACKS.menu.bpm;
    t.start("+0.05");
    this.ready = true;
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ready) return;
    const st = Save.data.settings;
    const v = st.musicVol ?? 0.7;
    this.out.mute = !!st.muted || v <= 0.001;
    if (!this.out.mute) this.out.volume.rampTo(20 * Math.log10(v), 0.1);
  }

  /**
   * Switch to a track on the next bar with a 2 s crossfade.
   * @param opts.startBar section to enter at (0 = intro, 8 = build, 16 = main…)
   */
  play(id, opts = {}) {
    this.wanted = { id, opts };
    if (!this.ready) return;
    const t = Tone.getTransport();
    if (this.pending && this.pending.id === id) return;
    if (!this.pending && this.current && this.current.id === id && !this.current.fading) return;
    if (this.pending) {
      this.pending.dispose();
      this.pending = null;
    }
    const tr = new Track(this, id, opts.startBar ?? 0);
    tr.fade = opts.immediate ? 0.12 : FADE;
    // normally start on the next bar; `immediate` starts on the next 16th (a hard cut-in)
    const unit = opts.immediate ? t.PPQ / 4 : t.PPQ * 4;
    const startTick = Math.ceil((t.ticks + t.PPQ / 4) / unit) * unit;
    tr.eventId = t.scheduleRepeat((time) => tr.tick(time), "16n", `${startTick}i`);
    this.pending = tr;
    const bpm = TRACKS[id].bpm;
    if (Math.abs(t.bpm.value - bpm) > 0.5) {
      t.bpm.rampTo(bpm, opts.immediate ? 0.05 : FADE);
      this.delay.delayTime.rampTo(echoTime(bpm), opts.immediate ? 0.05 : FADE);
    }
    this.tempoK = 1;
  }

  onTrackStarted(tr, time) {
    if (this.pending !== tr) return;
    const old = this.current;
    this.current = tr;
    this.pending = null;
    tr.fadeIn(time, tr.fade);
    if (old) {
      old.fading = true;
      old.fadeOut(time, tr.fade);
    }
  }

  /**
   * The Calm (0..1): the track's filter closes and fades to a low hum while a drone and a
   * heartbeat rise. Throttled; safe to call every frame.
   */
  setCalm(level) {
    if (!this.ready) return;
    level = Math.max(0, Math.min(1, level));
    if (!this.calmOn && level > 0) {
      this.calmOn = true;
      const now = Tone.now();
      for (const o of this.drone) if (o.state !== "started") o.start(now);
      this.heartLoop = new Tone.Loop((time) => {
        // lub-dub, quickening slightly as the Calm deepens
        this.heart.triggerAttackRelease(46, "8n", time, 1);
        this.heart.triggerAttackRelease(44, "8n", time + 0.19, 0.65);
      }, 0.95).start("+0.05");
    }
    if (!this.calmOn || Math.abs(level - this.calmLevel) < 0.02) return;
    this.calmLevel = level;
    if (this.heartLoop) this.heartLoop.interval = 0.95 - level * 0.25;
    this.calmOut.gain.rampTo(0.15 + level * 0.55, 0.3);
    this.heartGain.gain.rampTo(0.15 + level * 0.85, 0.3);
    this.bus.gain.rampTo(0.8 * (1 - level * 0.85), 0.3);
    this.lpf.frequency.rampTo(Math.max(220, 18000 * (1 - level) ** 3), 0.3);
  }

  /** End the Calm. `silence`: cut everything for the blackout before the Abyss. */
  endCalm(silence = false) {
    if (!this.ready || !this.calmOn) return;
    this.calmOn = false;
    this.calmLevel = 0;
    const now = Tone.now();
    this.heartLoop?.stop();
    this.heartLoop?.dispose();
    this.heartLoop = null;
    this.calmOut.gain.cancelScheduledValues(now);
    this.calmOut.gain.rampTo(0, silence ? 0.05 : 0.6);
    this.heartGain.gain.cancelScheduledValues(now);
    this.heartGain.gain.rampTo(0, silence ? 0.05 : 0.4);
    const stopAt = now + (silence ? 0.2 : 0.8);
    for (const o of this.drone) o.stop(stopAt);
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.rampTo(0.8, silence ? 0.6 : 0.5);
    this.restore(silence ? 0.6 : 0.5);
  }

  stop() {
    this.wanted = null;
    if (this.pending) {
      this.pending.dispose();
      this.pending = null;
    }
    if (this.current) {
      this.current.fading = true;
      this.current.fadeOut(Tone.now());
      this.current = null;
    }
  }

  /**
   * Beat clock for visuals: 0..1 position inside the current quarter note of what is
   * audible right now (falls back to a free-running 124 BPM clock before audio starts,
   * so silent test builds keep their timing).
   */
  beatPhase(fallbackSec = 0) {
    if (this.ready) {
      try {
        const t = Tone.getTransport();
        if (t.state === "started") {
          const ticks = t.getTicksAtTime(Tone.getContext().rawContext.currentTime);
          return (ticks % t.PPQ) / t.PPQ;
        }
      } catch {}
    }
    return (fallbackSec * (124 / 60)) % 1;
  }

  /** Chrono Fracture: the tempo follows the time zones (1 = the track's own tempo). */
  setTempoScale(k) {
    if (!this.ready) return;
    const tr = this.pending || this.current;
    const base = tr && TRACKS[tr.id]?.bpm;
    if (!base || Math.abs(k - (this.tempoK ?? 1)) < 0.02) return;
    this.tempoK = k;
    Tone.getTransport().bpm.rampTo(base * k, 0.25);
  }

  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, x));
  }

  /** Death: low-pass sweep down over 0.5 s. */
  deathSweep() {
    if (!this.ready) return;
    const f = this.lpf.frequency;
    const now = Tone.now();
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.getValueAtTime(now), now);
    f.exponentialRampToValueAtTime(240, now + 0.5);
  }

  /** Back to full range (retry / resume). */
  restore(time = 0.35) {
    if (!this.ready) return;
    const f = this.lpf.frequency;
    const now = Tone.now();
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.getValueAtTime(now), now);
    f.exponentialRampToValueAtTime(18000, now + time);
  }

  /** Muffle while paused. */
  muffle(on) {
    if (!this.ready) return;
    if (on) {
      const f = this.lpf.frequency;
      const now = Tone.now();
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.getValueAtTime(now), now);
      f.exponentialRampToValueAtTime(700, now + 0.25);
    } else this.restore(0.25);
    // and the volume eases down / back up with it (no hard cut either way)
    if (!this.out.mute) {
      const v = Save.data.settings.musicVol ?? 0.7;
      this.out.volume.rampTo(20 * Math.log10(v) + (on ? -9 : 0), 0.3);
    }
  }

  status() {
    const c = this.pending || this.current;
    return {
      id: this.current?.id ?? null,
      pending: this.pending?.id ?? null,
      section: this.current?.section ?? "-",
      bar: this.current?.bar ?? 0,
      bpm: this.ready ? Math.round(Tone.getTransport().bpm.value) : 0,
      unlocked: this.unlocked,
      running: !!c,
      skipped: this.skipped || 0,
    };
  }
}

export const Music = new MusicEngine();

/** Shared raw AudioContext so SFX and music use a single context (important on iOS). */
export function rawAudioContext() {
  return Tone.getContext().rawContext;
}
