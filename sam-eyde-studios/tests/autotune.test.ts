import { describe, expect, it } from "vitest";
import { correctionSemitones } from "../src/autotune/correct";
import { detectPitch } from "../src/autotune/pitch";
import { hzToMidi, nearestScaleNote, scaleMask } from "../src/autotune/scales";
import { analyze, tune } from "../src/autotune/tune";

const SR = 48000;

/** Buzzy harmonic "voice" following a frequency function. */
function voice(seconds: number, freq: (t: number) => number, sr = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    ph += freq(i / sr) / sr;
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * h * ph + h) / h;
    out[i] = v * 0.25;
  }
  return out;
}

function voicedMidi(x: Float32Array, sr = SR, from = 0.3, to = Infinity): number[] {
  const p = detectPitch(x, sr);
  const out: number[] = [];
  p.f0.forEach((f, i) => {
    const t = p.t0 + i * p.hop;
    if (f > 0 && t >= from && t <= to) out.push(hzToMidi(f));
  });
  return out;
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

describe("scales", () => {
  it("snaps to the nearest note in key", () => {
    const aMinor = scaleMask(9, "minor");
    expect(nearestScaleNote(56.4, aMinor)).toBe(57); // G#3-ish -> A3
    expect(nearestScaleNote(60.9, aMinor)).toBe(60); // C#4-ish -> C4
    expect(nearestScaleNote(61.2, aMinor)).toBe(62); // sharp C#4 -> D4
    expect(nearestScaleNote(61.2, scaleMask(0, "chromatic"))).toBe(61);
    expect(scaleMask(0, "minorPent").filter(Boolean).length).toBe(5);
  });
});

describe("YIN pitch detection", () => {
  it("finds the pitch of steady notes within a few cents", () => {
    for (const hz of [98, 146.83, 220, 329.63, 523.25]) {
      const m = voicedMidi(voice(1, () => hz));
      expect(m.length).toBeGreaterThan(100);
      expect(Math.abs(mean(m) - hzToMidi(hz))).toBeLessThan(0.05);
      expect(std(m)).toBeLessThan(0.05);
    }
  });

  it("works at 44.1 kHz too", () => {
    const m = voicedMidi(voice(1, () => 196, 44100), 44100);
    expect(Math.abs(mean(m) - hzToMidi(196))).toBeLessThan(0.05);
  });

  it("gates silence and noise as unvoiced", () => {
    const x = voice(1.5, () => 200);
    for (let i = SR * 0.5; i < SR; i++) x[i] = 0;
    const noise = new Float32Array(SR).map(() => (Math.random() - 0.5) * 0.4);
    const p = detectPitch(x, SR);
    const mid = p.f0.filter((_, i) => {
      const t = p.t0 + i * p.hop;
      return t > 0.56 && t < 0.94;
    });
    expect(mid.every((f) => f === 0)).toBe(true);
    const pn = detectPitch(noise, SR);
    expect(pn.f0.filter((f) => f > 0).length / pn.f0.length).toBeLessThan(0.05);
  });
});

describe("note snapping", () => {
  it("has hysteresis: wobbling around a boundary does not flicker", () => {
    // A minor: A3 (57) and B3 (59) — midpoint is 58. Wobble ±0.1 st around it.
    const n = 400;
    const f0 = new Float32Array(n).map((_, i) => 440 * 2 ** ((58 + 0.1 * Math.sin(i / 3) - 69) / 12));
    const corr = correctionSemitones({ f0, hop: 0.005, t0: 0 }, 9, "minor", 1);
    const targets = new Set(Array.from(corr).map((c, i) => Math.round(hzToMidi(f0[i]) + c)));
    expect(targets.size).toBe(1);
  });
});

describe("autotune (YIN + snap + TD-PSOLA)", () => {
  // 212 Hz sits between G#3 and A3; in A minor the nearest note is A3 = 220 Hz.
  const flat = voice(2, (t) => 212 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t)));
  const pitch = analyze(flat, SR);

  it("Hard: output locks onto the scale note and vibrato is flattened", () => {
    const out = tune(flat, SR, pitch, { key: 9, scale: "minor", retune: 1 });
    expect(out.length).toBe(flat.length);
    const m = voicedMidi(out);
    expect(Math.abs(mean(m) - 57)).toBeLessThan(0.06);
    expect(std(m)).toBeLessThan(0.06);
    expect(Math.abs(rms(out) / rms(flat) - 1)).toBeLessThan(0.15);
  });

  it("Natural: centre moves to the note but vibrato survives", () => {
    const out = tune(flat, SR, pitch, { key: 9, scale: "minor", retune: 0 });
    const m = voicedMidi(out, SR, 1.0);
    const inStd = std(voicedMidi(flat, SR, 1.0));
    expect(Math.abs(mean(m) - 57)).toBeLessThan(0.2);
    expect(std(m)).toBeGreaterThan(inStd * 0.6);
  });

  it("follows the key: same take, different key, different note", () => {
    // G# major contains G#3 (56) but not A3.
    const out = tune(flat, SR, pitch, { key: 8, scale: "major", retune: 1 });
    expect(Math.abs(mean(voicedMidi(out)) - 56)).toBeLessThan(0.06);
  });

  it("keeps the vocal tone (formants) instead of chipmunking", () => {
    // A voice with a fixed formant at 2 kHz, sung 1.4 semitones above C3.
    // C minor pentatonic pulls it down to C3: an 8 % pitch drop.
    const sr = SR;
    const inMidi = 49.4;
    const src = voice(1.5, () => 440 * 2 ** ((inMidi - 69) / 12));
    const sung = new Float32Array(src.length);
    const w = (2 * Math.PI * 2000) / sr;
    const r = 0.97;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const y = src[i] + 2 * r * Math.cos(w) * y1 - r * r * y2;
      y2 = y1;
      y1 = y;
      sung[i] = y * 0.03;
    }
    const out = tune(sung, sr, analyze(sung, sr), { key: 0, scale: "minorPent", retune: 1 });
    const outMidi = mean(voicedMidi(out));
    expect(Math.abs(outMidi - 48)).toBeLessThan(0.08);

    /** Energy-weighted centre of the harmonics around the formant. */
    const formantCentre = (x: Float32Array, midi: number) => {
      const f0 = 440 * 2 ** ((midi - 69) / 12);
      let num = 0;
      let den = 0;
      for (let h = Math.ceil(1400 / f0); h * f0 <= 2600; h++) {
        const hz = h * f0;
        let re = 0;
        let im = 0;
        for (let i = sr * 0.5; i < sr * 1.0; i++) {
          re += x[i] * Math.cos((2 * Math.PI * hz * i) / sr);
          im += x[i] * Math.sin((2 * Math.PI * hz * i) / sr);
        }
        const e = re * re + im * im;
        num += e * hz;
        den += e;
      }
      return num / den;
    };
    const before = formantCentre(sung, mean(voicedMidi(sung)));
    const after = formantCentre(out, outMidi);
    // Plain resampling would drag the formant down ~165 Hz along with the pitch.
    expect(Math.abs(after - before)).toBeLessThan(60);
  });

  it("passes silence / unvoiced audio through unchanged", () => {
    const x = new Float32Array(SR).map(() => (Math.random() - 0.5) * 0.2);
    const out = tune(x, SR, analyze(x, SR), { key: 0, scale: "major", retune: 1 });
    let maxDiff = 0;
    for (let i = 2000; i < x.length - 2000; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - x[i]));
    expect(maxDiff).toBeLessThan(0.02);
  });

  it("is fast enough for full takes", () => {
    const long = voice(30, (t) => 180 + 40 * Math.sin(t));
    const t0 = performance.now();
    const p = analyze(long, SR);
    const t1 = performance.now();
    tune(long, SR, p, { key: 0, scale: "minor", retune: 0.6 });
    const t2 = performance.now();
    console.log(`30 s take: analyze ${(t1 - t0).toFixed(0)} ms, tune ${(t2 - t1).toFixed(0)} ms`);
    expect(t2 - t0).toBeLessThan(15000);
  });
});
