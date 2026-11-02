// Procedural house music engine (Tone.js). Every sound is synthesized — no audio files.
//
//  master:  track faders → bus → death low-pass → limiter → volume → speakers
//  each track: drums (dry) · bass (dry, ducked) · synths (ducked, sent to shared reverb/delay)
//
// Tracks are built from 8-bar sections (intro → build → main → breakdown → drop, looping),
// vary each loop (motif swaps, fills) and add layers as `intensity` (player speed) rises.
// Track changes start on the next bar and crossfade over 2 seconds.
import * as Tone from "tone";
import { SECTIONS, TRACKS } from "./musicTracks.js";
import { Save } from "./save.js";

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const FADE = 2;

function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

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

    // faders (crossfade) — sends fade together with the dry signal
    this.fader = keep(new Tone.Gain(0)).connect(engine.bus);
    this.sendFader = keep(new Tone.Gain(0));
    const rev = keep(new Tone.Gain(d.reverb)).connect(engine.reverb);
    this.sendFader.connect(rev);
    const dly = keep(new Tone.Gain(d.delay)).connect(engine.delay);
    this.sendFader.connect(dly);

    // drums: dry & punchy
    const drums = keep(new Tone.Gain(1)).connect(this.fader);
    this.kick = keep(
      new Tone.MembraneSynth({
        pitchDecay: 0.028,
        octaves: 6,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.05 },
      }),
    ).connect(drums);
    this.kick.volume.value = d.soft ? -9 : -3;
    const clapF = keep(new Tone.Filter(1700, "bandpass")).connect(drums);
    this.clap = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
      }),
    ).connect(clapF);
    this.clap.volume.value = d.soft ? -18 : -9;
    const hatF = keep(new Tone.Filter(7800, "highpass")).connect(drums);
    this.hatO = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.11, sustain: 0 },
      }),
    ).connect(hatF);
    this.hatO.volume.value = d.soft ? -24 : -19;
    this.hatC = keep(
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.025, sustain: 0 },
      }),
    ).connect(hatF);
    this.hatC.volume.value = -24;

    // bass: dry, ducked by the kick
    this.bassDuck = keep(new Tone.Gain(1)).connect(this.fader);
    this.bass = keep(
      new Tone.MonoSynth({
        oscillator: { type: d.bassWave },
        filter: { Q: 2, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.004, decay: 0.18, sustain: 0.45, release: 0.07 },
        filterEnvelope: {
          attack: 0.003,
          decay: 0.14,
          sustain: 0.25,
          baseFrequency: d.bassCutoff * 0.4,
          octaves: 2.2,
        },
      }),
    ).connect(this.bassDuck);
    this.bass.volume.value = d.sub ? -4 : -11;

    // synths: ducked + reverb/delay
    this.synthBus = keep(new Tone.Gain(1));
    let chain = this.synthBus;
    if (d.crush) {
      this.crusher = keep(new Tone.BitCrusher(5));
      chain.connect(this.crusher);
      chain = this.crusher;
    }
    this.synthDuck = keep(new Tone.Gain(1));
    chain.connect(this.synthDuck);
    this.synthDuck.connect(this.fader);
    this.synthDuck.connect(this.sendFader);

    this.chordF = keep(new Tone.Filter(d.chordCutoff, "lowpass")).connect(this.synthBus);
    this.chords = keep(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: d.chordWave },
        envelope: { attack: 0.004, decay: 0.26, sustain: 0, release: 0.22 },
      }),
    ).connect(this.chordF);
    this.chords.maxPolyphony = 16;
    this.chords.volume.value = d.chordWave === "sawtooth" || d.chordWave === "square" ? -21 : -15;
    if (d.pad) {
      this.pad = keep(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: d.pad.wave },
          envelope: { attack: 1.1, decay: 0.6, sustain: 0.7, release: 1.8 },
        }),
      ).connect(this.synthBus);
      this.pad.maxPolyphony = 16;
      this.pad.volume.value = d.pad.vol;
    }
    this.lead = keep(
      new Tone.Synth({
        oscillator: { type: d.lead.wave },
        portamento: 0.015,
        envelope: { attack: 0.008, decay: 0.2, sustain: 0.28, release: 0.25 },
      }),
    ).connect(this.synthBus);
    this.lead.volume.value = d.lead.wave === "square" || d.lead.wave === "sawtooth" ? -23 : -15;
    if (d.arp) {
      this.arp = keep(
        new Tone.Synth({
          oscillator: { type: d.arp.wave },
          envelope: { attack: 0.002, decay: 0.11, sustain: 0, release: 0.08 },
        }),
      ).connect(this.synthBus);
      this.arp.volume.value = d.arp.wave === "square" ? -26 : -19;
    }
  }

  chordNotes(deg, oct = 0) {
    const d = this.def;
    const degs = [deg, deg + 2, deg + 4];
    if (d.seventh) degs.push(deg + 6);
    if (d.ninth) degs.push(deg + 8);
    return degs.map((x) => midiToFreq(this.midi(x, oct)));
  }

  /** Scheduled every 16th note by the Transport. Never lets a scheduling clash throw. */
  tick(time) {
    if (this.disposed) return;
    try {
      this.tickInner(time);
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn("music tick skipped:", err?.message);
      }
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
    const chordDeg = d.prog[inSec % d.prog.length];
    const fillBar = inSec === 7 && sec !== "breakdown";

    // section-level automation at the top of each bar
    if (s === 0) {
      let cut = d.chordCutoff * (0.65 + 0.7 * I);
      if (sec === "build") cut *= 0.35 + (0.65 * inSec) / 7;
      if (sec === "breakdown") cut *= 0.5;
      if (sec === "intro") cut *= 0.6;
      this.chordF.frequency.rampTo(Math.max(200, cut), 0.4, time);
      if (this.crusher) this.crusher.bits.value = sec === "drop" ? 4 : 6;
    }

    // ---- drums
    const kickOn = sec !== "breakdown" && !(fillBar && sec === "build" && s >= 8);
    if (s % 4 === 0 && kickOn) {
      this.kick.triggerAttackRelease(midiToFreq(this.midi(0, -3)), "8n", time, d.soft ? 0.75 : 1);
      // sidechain-style pump
      this.bassDuck.gain.cancelScheduledValues(time);
      this.bassDuck.gain.setValueAtTime(0.3, time);
      this.bassDuck.gain.linearRampToValueAtTime(1, time + 0.2);
      this.synthDuck.gain.cancelScheduledValues(time);
      this.synthDuck.gain.setValueAtTime(0.28, time);
      this.synthDuck.gain.linearRampToValueAtTime(1, time + 0.24);
    }
    const clapOn = sec === "main" || sec === "drop" || (sec === "build" && inSec >= 4);
    const mainClap = clapOn && (s === 4 || s === 12);
    if (mainClap) this.clap.triggerAttackRelease("16n", time, 0.9);
    // drum fill: rising clap roll in the last half-bar of a section, varied per loop
    if (!mainClap && fillBar && sec !== "intro" && s >= (loop % 2 ? 12 : 8)) {
      this.clap.triggerAttackRelease("32n", time, 0.25 + (s - 8) * 0.08);
    }
    if (sec !== "breakdown" && s % 4 === 2) this.hatO.triggerAttackRelease("16n", time, 0.8);
    const hats16 =
      !d.soft &&
      (d.hats === "drive" || I > 0.3) &&
      (sec === "main" || sec === "drop" || sec === "build");
    if (hats16 && s % 2 === 1)
      this.hatC.triggerAttackRelease("32n", time, s % 4 === 3 ? 0.55 : 0.35);
    if (I > 0.75 && (sec === "main" || sec === "drop") && s % 4 === 3)
      this.hatC.triggerAttackRelease("32n", time + sixteenth / 2, 0.3);

    // ---- bass
    const bassOn =
      sec === "main" ||
      sec === "drop" ||
      (sec === "build" && inSec >= 2) ||
      (sec === "intro" && inSec >= 6);
    const bv = d.bass[s];
    if (bassOn && bv !== null && bv !== undefined) {
      this.bass.triggerAttackRelease(
        midiToFreq(this.midi(chordDeg + bv, d.sub ? -2 : -1)),
        "16n",
        time,
        0.9,
      );
    }

    // ---- chords (stabs) + glitch stutter
    const chordsOn = sec !== "intro" || inSec >= 4;
    if (chordsOn && d.chordSteps.includes(s)) {
      const notes = this.chordNotes(chordDeg);
      this.chords.triggerAttackRelease(notes, "16n", time, sec === "breakdown" ? 0.45 : 0.7);
      if (d.stutter && (sec === "main" || sec === "drop") && inSec % 4 === 3 && s >= 12) {
        for (let k = 1; k < 4; k++)
          this.chords.triggerAttackRelease(notes, "64n", time + (k * sixteenth) / 2, 0.5);
      }
    }

    // ---- pad (whole bar)
    if (this.pad && s === 0 && sec !== "build") {
      this.pad.triggerAttackRelease(
        this.chordNotes(chordDeg, -1),
        "1m",
        time,
        sec === "breakdown" ? 0.7 : 0.45,
      );
    }

    // ---- lead (two-bar motif, swaps A/B by loop & section, octave lift at high speed)
    const leadOn = sec === "main" || sec === "drop" || sec === "breakdown";
    if (leadOn) {
      const motif = (loop + secIdx) % 2 === 0 ? d.lead.a : d.lead.b;
      const v = motif[(bar % 2) * 16 + s];
      if (v !== null && v !== undefined) {
        let oct = d.lead.octave;
        if (sec === "drop" && I > 0.6) oct += 1;
        // small per-loop variation: every other loop, lift the phrase ending
        const varied = loop % 2 === 1 && s >= 12 ? v + 2 : v;
        this.lead.triggerAttackRelease(
          midiToFreq(this.midi(varied, oct)),
          "8n",
          time,
          sec === "breakdown" ? 0.45 : 0.7,
        );
      }
    }

    // ---- arpeggio
    if (this.arp && s % 2 === 0) {
      const arpOn =
        sec === "drop" ||
        (sec === "main" && I > 0.5) ||
        (d.name === "Frozen Nebula" && sec !== "intro");
      if (arpOn) {
        const pv = d.arp.pattern[(step / 2) % d.arp.pattern.length];
        this.arp.triggerAttackRelease(
          midiToFreq(this.midi(chordDeg + pv, d.arp.octave)),
          "32n",
          time,
          0.6,
        );
      }
    }
  }

  fadeIn(time) {
    for (const g of [this.fader.gain, this.sendFader.gain]) {
      g.cancelScheduledValues(time);
      g.setValueAtTime(0, time);
      g.linearRampToValueAtTime(1, time + FADE);
    }
  }

  fadeOut(time) {
    for (const g of [this.fader.gain, this.sendFader.gain]) {
      g.cancelScheduledValues(time);
      g.setValueAtTime(g.getValueAtTime(time), time);
      g.linearRampToValueAtTime(0, time + FADE);
    }
    const ms = Math.max(0, (time - Tone.now() + FADE + 0.6) * 1000);
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
    if (this.unlocked) return;
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
    this.delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.32, wet: 1 }).connect(
      this.lpf,
    );
    const t = Tone.getTransport();
    t.bpm.value = 124;
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
    const barTicks = t.PPQ * 4;
    const startTick = Math.ceil((t.ticks + t.PPQ / 4) / barTicks) * barTicks;
    tr.eventId = t.scheduleRepeat((time) => tr.tick(time), "16n", `${startTick}i`);
    this.pending = tr;
    const bpm = TRACKS[id].bpm;
    if (Math.abs(t.bpm.value - bpm) > 0.5) t.bpm.rampTo(bpm, FADE);
  }

  onTrackStarted(tr, time) {
    if (this.pending !== tr) return;
    const old = this.current;
    this.current = tr;
    this.pending = null;
    tr.fadeIn(time);
    if (old) {
      old.fading = true;
      old.fadeOut(time);
    }
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
    };
  }
}

export const Music = new MusicEngine();

/** Shared raw AudioContext so SFX and music use a single context (important on iOS). */
export function rawAudioContext() {
  return Tone.getContext().rawContext;
}
