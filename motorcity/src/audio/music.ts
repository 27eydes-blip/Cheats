// Procedural ragtime piano. Each MusicId is an original piece generated from a
// fixed seed: stride left hand + syncopated right-hand melody built from chord
// and passing tones over progressions with secondary dominants and diminished
// passing chords. Form: intro, A A B B A, trio (in IV) C C, then loops from A.
// Notes are played by a lookahead scheduler on the AudioContext clock with a
// small synthesized "old upright" piano voice and a global voice limit.

import { Core, biquad, clamp, gain, loopNoise } from './core';

export type MusicId = 'title' | 'race' | 'results' | 'garage' | 'night';

// ---- theory ------------------------------------------------------------------

type Q = 'M' | '7' | 'm' | 'm7' | 'o7' | '6' | 'm6';
const INTERVALS: Record<Q, number[]> = {
  M: [0, 4, 7],
  '7': [0, 4, 7, 10],
  m: [0, 3, 7],
  m7: [0, 3, 7, 10],
  o7: [0, 3, 6, 9],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
};
interface Chord {
  root: number; // absolute pitch class
  q: Q;
}
const ROMAN: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const pcOf = (n: number): number => ((n % 12) + 12) % 12;

function parseChord(sym: string, key: number): Chord {
  const m = /^([#b]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(o7|7|6)?$/.exec(sym);
  if (!m) return { root: pcOf(key), q: 'M' };
  let off = ROMAN[m[2].toUpperCase()];
  if (m[1] === '#') off++;
  else if (m[1] === 'b') off--;
  const minor = m[2] === m[2].toLowerCase();
  const suf = m[3] || '';
  let q: Q = minor ? 'm' : 'M';
  if (suf === 'o7') q = 'o7';
  else if (suf === '7') q = minor ? 'm7' : '7';
  else if (suf === '6') q = minor ? 'm6' : '6';
  return { root: pcOf(key + off), q };
}

/** "I|VI7|II7 V7|I" -> one or two chords per bar */
function parseProg(s: string, key: number): Chord[][] {
  return s.split('|').map((bar) => bar.trim().split(/\s+/).map((c) => parseChord(c, key)));
}

const chordPcs = (c: Chord): number[] => INTERVALS[c.q].map((i) => pcOf(c.root + i));

function nearest(target: number, pcs: number[], lo: number, hi: number): number {
  let best = clamp(Math.round(target), lo, hi);
  let bd = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (pcs.indexOf(pcOf(m)) < 0) continue;
    const d = Math.abs(m - target);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- rhythm cells (16th-note durations per 2/4 bar; negative = rest) --------

const CELLS: number[][] = [
  [1, 2, 1, 1, 2, 1], // 0  short-long-short x2: the ragtime figure
  [1, 2, 1, 2, 2], // 1
  [2, 1, 2, 1, 2], // 2  syncopated
  [1, 2, 1, 4], // 3
  [2, 2, 1, 2, 1], // 4
  [1, 1, 1, 1, 1, 1, 1, 1], // 5  run
  [3, 3, 2], // 6  secondary rag
  [2, 2, 2, 2], // 7
  [4, 4], // 8
  [2, 1, 1, 2, 2], // 9
  [1, 1, 2, 1, 1, 2], // 10
  [-1, 1, 2, 1, 1, 2], // 11 off-beat start
  [-2, 1, 1, 2, 2], // 12
];
const CADENCE = [3, 6, 8, 9, 1];
const FINAL: number[][] = [
  [2, 2, 4],
  [1, 2, 1, 4],
  [4, -4],
];

interface Spec {
  key: number;
  bpm: number;
  seed: number;
  lo: number;
  hi: number;
  w: number[]; // cell weights
  tie: number;
  dbl: number;
  oct: number;
  blue: number;
  chroma: number;
  vel: number;
  bright: number;
  intro: string;
  A: string;
  B: string;
  C: string;
}

const STD_C = 'I|I|V7|V7|V7|V7|I|I|I7|IV|iv6|I|VI7|II7|V7|I';

const SPECS: Record<MusicId, Spec> = {
  title: {
    key: 5, bpm: 104, seed: 1915, lo: 65, hi: 84,
    w: [3, 3, 2, 2, 2, 1, 2, 1, 0, 1, 2, 2, 1],
    tie: 0.35, dbl: 0.35, oct: 0, blue: 0, chroma: 0.25, vel: 0.62, bright: 3400,
    intro: 'V7|V7|II7|V7',
    A: 'I|I|VI7|VI7|II7|II7|V7|V7|I|I7|IV|#IVo7|I|VI7|II7 V7|I',
    B: 'V7|V7|I|I|II7|II7|V7|V7|III7|III7|vi|vi|II7|V7|I VI7|II7 V7',
    C: STD_C,
  },
  race: {
    key: 0, bpm: 112, seed: 4242, lo: 67, hi: 88,
    w: [3, 2, 2, 1, 2, 3, 1, 1, 0, 1, 3, 2, 1],
    tie: 0.3, dbl: 0.25, oct: 0.1, blue: 0, chroma: 0.3, vel: 0.66, bright: 3800,
    intro: 'I #Io7|II7 V7|I VI7|II7 V7',
    A: 'I|I|I7|I7|IV|#IVo7|I|VI7|II7|II7|V7|V7|I|VI7|II7 V7|I',
    B: 'VI7|VI7|II7|II7|V7|V7|I|I|III7|III7|vi|II7|I VI7|II7|V7|V7',
    C: 'I|I|II7|V7|V7|V7|I|VI7|I7|IV|#IVo7|I|VI7|II7|V7|I',
  },
  results: {
    key: 10, bpm: 98, seed: 777, lo: 65, hi: 86,
    w: [4, 3, 2, 2, 2, 0, 2, 2, 1, 1, 1, 1, 1],
    tie: 0.3, dbl: 0.4, oct: 0.35, blue: 0, chroma: 0.2, vel: 0.66, bright: 3600,
    intro: 'I|IV|V7|V7',
    A: 'I|IV|I|V7|I|IV|II7|V7|I|IV|I|VI7|II7|V7|I|I',
    B: 'IV|IV|I|I|II7|II7|V7|V7|IV|#IVo7|I|VI7|II7|V7|I|V7',
    C: STD_C,
  },
  garage: {
    key: 7, bpm: 96, seed: 1908, lo: 62, hi: 81,
    w: [1, 2, 2, 2, 2, 0, 2, 3, 2, 2, 0, 1, 1],
    tie: 0.4, dbl: 0.3, oct: 0, blue: 0.05, chroma: 0.2, vel: 0.55, bright: 3000,
    intro: 'I|VI7|II7|V7',
    A: 'I|vi|II7|V7|I|vi|II7|V7|IV|#IVo7|I|VI7|II7|V7|I|I',
    B: 'III7|III7|vi|vi|II7|II7|V7|V7|III7|III7|vi|IV|I|VI7|II7 V7|I V7',
    C: STD_C,
  },
  night: {
    key: 3, bpm: 84, seed: 1313, lo: 60, hi: 80,
    w: [1, 2, 2, 3, 1, 0, 3, 3, 2, 2, 0, 1, 2],
    tie: 0.5, dbl: 0.3, oct: 0, blue: 0.22, chroma: 0.3, vel: 0.55, bright: 2400,
    intro: 'IV7|#IVo7|I VI7|II7 V7',
    A: 'I|I7|IV7|#IVo7|I|VI7|II7|V7|I|I7|IV7|iv6|I|VI7|II7 V7|I',
    B: 'vi|vi|II7|II7|V7|V7|I|I7|IV7|iv6|I|VI7|II7|V7|I|V7',
    C: 'I|I7|IV7|iv6|I|VI7|II7|V7|I|I7|IV7|#IVo7|I|VI7|II7 V7|I',
  },
};

// ---- generation ---------------------------------------------------------------

interface Ev {
  midi: number;
  dur: number; // in 16ths
  vel: number;
}
interface TimedEv extends Ev {
  step: number;
}
interface Song {
  bpm: number;
  bright: number;
  steps: Ev[][];
  loopStart: number;
}
interface MNote {
  bar: number;
  step: number;
  dur: number;
  antic: boolean;
  pitch: number;
  strong: boolean;
}

function pickWeighted(w: number[], rng: () => number): number {
  let sum = 0;
  for (const x of w) sum += x;
  let r = rng() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return i;
  }
  return 0;
}

function genStrain(prog: Chord[][], key: number, sp: Spec, rng: () => number): TimedEv[] {
  const n = prog.length;
  const chordAt = (bar: number, step: number): Chord => {
    const b = prog[Math.min(bar, n - 1)];
    return b.length > 1 && step >= 4 ? b[1] : b[0];
  };
  const scale = [0, 2, 4, 5, 7, 9, 11].map((x) => pcOf(x + key));

  // 1. rhythm
  const cells: number[][] = [];
  for (let b = 0; b < n; b++) {
    if (n === 16 && b >= 8 && b < 12) cells.push(cells[b - 8]);
    else if (b === n - 1) cells.push(FINAL[Math.floor(rng() * FINAL.length)]);
    else if (b % 4 === 3) cells.push(CELLS[CADENCE[Math.floor(rng() * CADENCE.length)]]);
    else cells.push(CELLS[pickWeighted(sp.w, rng)]);
  }
  const notes: MNote[] = [];
  const firstIdx: number[] = [];
  for (let b = 0; b < n; b++) {
    firstIdx.push(notes.length);
    let s = 0;
    for (const d of cells[b]) {
      if (d < 0) {
        s -= d;
        continue;
      }
      notes.push({ bar: b, step: s, dur: d, antic: false, pitch: 0, strong: false });
      s += d;
    }
  }
  firstIdx.push(notes.length);

  // 2. ties across the bar line (anticipations), the classic ragtime syncopation
  const drop = new Set<number>();
  for (let b = 0; b < n - 1; b++) {
    if (b % 4 === 3) continue;
    const li = firstIdx[b + 1] - 1;
    const last = notes[li];
    if (!last || last.bar !== b || last.step !== 7 || last.dur !== 1) continue;
    if (rng() >= sp.tie) continue;
    const fi = firstIdx[b + 1];
    const first = notes[fi];
    if (!first || first.bar !== b + 1) continue;
    if (first.step > 0) {
      last.dur += first.step;
      last.antic = true;
    } else if (first.dur <= 2) {
      last.dur += first.dur;
      last.antic = true;
      drop.add(fi);
    }
  }
  const mel = notes.filter((_, i) => !drop.has(i));

  // 3. pitches
  const mid = (sp.lo + sp.hi) / 2;
  const memo = new Map<number, number>();
  let prev = nearest(mid, chordPcs(chordAt(0, 0)), sp.lo, sp.hi);
  let prev2 = -1;
  for (let i = 0; i < mel.length; i++) {
    const nt = mel[i];
    const ch = nt.antic ? chordAt(nt.bar + 1, 0) : chordAt(nt.bar, nt.step);
    const pcs = chordPcs(ch);
    nt.strong = nt.antic || nt.step % 4 === 0 || nt.dur >= 2;
    const ph = ((nt.bar % 4) * 8 + nt.step) / 32;
    const copyKey = (nt.bar - 8) * 8 + nt.step;
    let target: number;
    if (n === 16 && nt.bar >= 8 && nt.bar < 12 && memo.has(copyKey)) {
      target = memo.get(copyKey) as number;
    } else {
      const bias = (ph < 0.5 ? 1.1 : -1.1) + (mid - prev) / 6;
      let mv = Math.round((rng() + rng() + rng() - 1.5) * 4.5 + bias);
      if (mv === 0 && rng() < 0.6) mv = rng() < 0.5 ? 1 : -1;
      if (nt.strong && rng() < 0.12) mv = (rng() < 0.5 ? -1 : 1) * (5 + Math.floor(rng() * 5));
      target = prev + mv;
    }
    let p = nt.strong ? nearest(target, pcs, sp.lo, sp.hi) : nearest(target, scale, sp.lo, sp.hi);
    if (!nt.strong && sp.blue > 0 && rng() < sp.blue) {
      p = nearest(target, [pcOf(key + 3), pcOf(key + 10), pcOf(key + 6)], sp.lo, sp.hi);
    }
    if (p === prev && p === prev2) p = nearest(p + (p > mid ? -2 : 2), pcs, sp.lo, sp.hi);
    const isLast = i === mel.length - 1;
    if (isLast) p = nearest(prev, [ch.root], sp.lo, sp.hi);
    if (nt.bar === n - 1 && i > 0 && nt.step === 0 && chordAt(nt.bar, 0).root === pcOf(key)) {
      p = nearest(prev, [pcOf(key), pcOf(key + 4)], sp.lo, sp.hi);
    }
    if (nt.bar < 4) memo.set(nt.bar * 8 + nt.step, p);
    nt.pitch = p;
    prev2 = prev;
    prev = p;
  }
  // chromatic lower-neighbour approach tones
  for (let i = 1; i < mel.length - 1; i++) {
    const a = mel[i];
    const b = mel[i + 1];
    if (a.dur === 1 && !a.strong && b.strong && rng() < sp.chroma) {
      const c = b.pitch - 1;
      if (c >= sp.lo && c !== mel[i - 1].pitch) a.pitch = c;
    }
  }

  // 4. events: right hand
  const out: TimedEv[] = [];
  for (const nt of mel) {
    const step = nt.bar * 8 + nt.step;
    let v = sp.vel + (nt.antic ? 0.12 : 0) + (nt.step === 0 ? 0.05 : 0) - (nt.dur === 1 ? 0.07 : 0) + (rng() - 0.5) * 0.08;
    v = clamp(v, 0.25, 0.95);
    out.push({ step, midi: nt.pitch, dur: nt.dur, vel: v });
    if (nt.strong && nt.dur >= 2) {
      if (rng() < sp.dbl) {
        const ch = nt.antic ? chordAt(nt.bar + 1, 0) : chordAt(nt.bar, nt.step);
        const pcs = chordPcs(ch);
        for (let d = 3; d <= 9; d++) {
          const m = nt.pitch - d;
          if (pcs.indexOf(pcOf(m)) >= 0 && m >= 57) {
            out.push({ step, midi: m, dur: nt.dur, vel: v * 0.6 });
            break;
          }
        }
      } else if (rng() < sp.oct && nt.pitch - 12 >= 55) {
        out.push({ step, midi: nt.pitch - 12, dur: nt.dur, vel: v * 0.55 });
      }
    }
  }

  // 5. left hand: stride "oom-pah" (bass octave on 1 & 3 of the 8th grid, chord on 2 & 4)
  for (let b = 0; b < n; b++) {
    for (let half = 0; half < 2; half++) {
      const ch = chordAt(b, half * 4);
      const same = half === 1 && prog[b].length === 1;
      const ints = INTERVALS[ch.q];
      const bassPc = same ? pcOf(ch.root + ints[2]) : ch.root;
      const bass = 33 + pcOf(bassPc - 33);
      const s0 = b * 8 + half * 4;
      out.push({ step: s0, midi: bass, dur: 2, vel: 0.5 + (half === 0 ? 0.05 : 0) });
      out.push({ step: s0, midi: bass + 12, dur: 2, vel: 0.4 });
      const tones = ints.length === 4 ? ints.slice(1) : ints;
      for (const iv of tones) {
        const pc = pcOf(ch.root + iv);
        out.push({ step: s0 + 2, midi: 53 + pcOf(pc - 53), dur: 1.2, vel: 0.28 });
      }
    }
  }
  return out;
}

function buildSong(sp: Spec): Song {
  const rng = mulberry32(sp.seed);
  const key = sp.key;
  const trioKey = pcOf(key + 5);
  const intro = genStrain(parseProg(sp.intro, key), key, sp, rng);
  const strains: Record<string, TimedEv[]> = {
    A: genStrain(parseProg(sp.A, key), key, sp, rng),
    B: genStrain(parseProg(sp.B, key), key, sp, rng),
    C: genStrain(parseProg(sp.C, trioKey), trioKey, sp, rng),
  };
  const introLen = parseProg(sp.intro, key).length * 8;
  const form = 'AABBACC';
  const total = introLen + form.length * 16 * 8;
  const steps: Ev[][] = [];
  for (let i = 0; i < total; i++) steps.push([]);
  const put = (evs: TimedEv[], off: number): void => {
    for (const e of evs) {
      const s = off + Math.floor(e.step);
      if (s < total) steps[s].push({ midi: e.midi, dur: e.dur, vel: e.vel });
    }
  };
  put(intro, 0);
  let off = introLen;
  for (const ch of form) {
    put(strains[ch], off);
    off += 128;
  }
  return { bpm: sp.bpm, bright: sp.bright, steps, loopStart: introLen };
}

// ---- playback -------------------------------------------------------------------

const MAX_VOICES = 24;
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const XFADE = 1.2;

interface Voice {
  oscs: OscillatorNode[];
  gains: GainNode[];
  end: number;
}
interface Track {
  song: Song;
  deck: GainNode;
  hammer: GainNode;
  step: number;
  next: number;
  stopAt: number;
}

export class Music {
  private readonly ctx: AudioContext;
  private readonly bank: Core['bank'];
  private readonly input: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly crackle: GainNode;
  private voices: Voice[] = [];
  private tracks: Track[] = [];
  private current: MusicId | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cache = new Map<MusicId, Song>();
  /** When false the scheduler keeps time but plays no notes (saves CPU). */
  enabled = true;

  constructor(core: Core) {
    this.ctx = core.ctx;
    this.bank = core.bank;
    const hp = biquad(this.ctx, 'highpass', 95, 0.7, core.music);
    this.lp = biquad(this.ctx, 'lowpass', 3400, 0.6, hp);
    // a slight mid "horn" bump, as if through a gramophone
    const peak = this.ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 1500;
    peak.Q.value = 0.8;
    peak.gain.value = 3;
    peak.connect(this.lp);
    this.input = gain(this.ctx, 0.55, peak);
    this.crackle = gain(this.ctx, 0, core.music);
    loopNoise(this.ctx, this.bank.crackle, biquad(this.ctx, 'highpass', 400, 0.7, this.crackle));
  }

  get playing(): MusicId | null {
    return this.current;
  }

  play(id: MusicId | null): void {
    if (id === this.current) return;
    this.current = id;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const tr of this.tracks) {
      if (tr.stopAt !== Infinity) continue;
      tr.stopAt = now + XFADE;
      tr.deck.gain.setTargetAtTime(0, now, XFADE / 3.5);
      const dead = tr;
      setTimeout(() => {
        this.tracks = this.tracks.filter((t) => t !== dead);
        try {
          dead.deck.disconnect();
        } catch {
          /* already gone */
        }
        if (!this.tracks.length) this.stopTimer();
      }, (XFADE + 2.5) * 1000);
    }
    if (id) {
      let song = this.cache.get(id);
      if (!song) {
        song = buildSong(SPECS[id]);
        this.cache.set(id, song);
      }
      const deck = gain(ctx, 0, this.input);
      deck.gain.setValueAtTime(0, now);
      deck.gain.setTargetAtTime(1, now, this.tracks.length ? 0.35 : 0.05);
      const hammer = gain(ctx, 0.22, deck);
      this.tracks.push({ song, deck, hammer, step: 0, next: now + 0.08, stopAt: Infinity });
      this.lp.frequency.setTargetAtTime(song.bright, now, 0.3);
      this.crackle.gain.setTargetAtTime(0.6, now, 0.4);
      this.startTimer();
    } else {
      this.crackle.gain.setTargetAtTime(0, now, 0.4);
    }
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // drop finished voices (in place)
    let w = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.end > now) this.voices[w++] = v;
    }
    this.voices.length = w;

    const horizon = now + LOOKAHEAD;
    for (const tr of this.tracks) {
      const sd = 15 / tr.song.bpm; // one 16th note
      if (tr.next < now - 0.1) tr.next = now + 0.03; // recover after a stall
      const steps = tr.song.steps;
      while (tr.next < horizon && tr.next < tr.stopAt) {
        if (this.enabled) {
          const evs = steps[tr.step];
          for (let i = 0; i < evs.length; i++) this.note(tr, evs[i], tr.next + Math.random() * 0.004, sd);
        }
        tr.step++;
        if (tr.step >= steps.length) tr.step = tr.song.loopStart;
        tr.next += sd;
      }
    }
  }

  private kill(v: Voice, t: number): void {
    for (const g of v.gains) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, 0.008);
    }
    for (const o of v.oscs) {
      try {
        o.stop(t + 0.05);
      } catch {
        /* ignore */
      }
    }
  }

  private note(tr: Track, ev: Ev, t: number, sd: number): void {
    const ctx = this.ctx;
    if (this.voices.length >= MAX_VOICES) {
      const v = this.voices.shift();
      if (v) this.kill(v, t);
    }
    const midi = ev.midi;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = ev.dur * sd;
    const decay = clamp(1.4 - (midi - 36) * 0.022, 0.3, 1.4);
    const end = t + Math.min(dur + 0.05, 2.2);
    const stop = end + 0.25;
    const peak = ev.vel * 0.3;

    const gm = ctx.createGain();
    gm.gain.setValueAtTime(0, t);
    gm.gain.linearRampToValueAtTime(peak, t + 0.004);
    gm.gain.setTargetAtTime(peak * 0.45, t + 0.004, 0.07);
    gm.gain.setTargetAtTime(0, t + 0.12, decay);
    gm.gain.setTargetAtTime(0, end, 0.05);
    gm.connect(tr.deck);

    const gh = ctx.createGain();
    gh.gain.setValueAtTime(0, t);
    gh.gain.linearRampToValueAtTime(peak * 0.35, t + 0.003);
    gh.gain.setTargetAtTime(0, t + 0.003, 0.09 + decay * 0.05);
    gh.connect(tr.deck);

    const oscs: OscillatorNode[] = [];
    const a = ctx.createOscillator();
    a.type = 'triangle';
    a.frequency.value = f;
    a.connect(gm);
    oscs.push(a);
    if (ev.vel >= 0.35) {
      // second string of the unison, slightly out of tune: honky-tonk upright
      const c = ctx.createOscillator();
      c.type = 'triangle';
      c.frequency.value = f * 1.0028;
      c.connect(gm);
      oscs.push(c);
    }
    // stretched (inharmonic) second partial for brightness
    const h = ctx.createOscillator();
    h.type = 'sine';
    h.frequency.value = f * 2.0016;
    h.connect(gh);
    oscs.push(h);
    for (const o of oscs) {
      o.start(t);
      o.stop(stop);
    }
    if (ev.vel >= 0.4) {
      const hs = ctx.createBufferSource();
      hs.buffer = this.bank.hammer;
      hs.playbackRate.value = clamp(0.6 + (midi - 40) / 50, 0.5, 1.8);
      hs.connect(tr.hammer);
      hs.start(t);
    }
    this.voices.push({ oscs, gains: [gm, gh], end: stop });
  }
}
