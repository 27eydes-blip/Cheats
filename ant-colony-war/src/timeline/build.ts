import type { Episode } from '../../script/types';
import { END_CARD, MAX_SECONDS, MIN_SECONDS, TITLE_LEAD } from '../config';
import { parseBeat } from './parse';
import type { BeatAlignment, BeatTiming, Timeline, Word } from './types';

export const DEFAULT_PAUSE = 0.5;

/** Rough narration timing used for previews before any audio exists (slow, cinematic pace). */
export function mockAlignment(ep: Episode): BeatAlignment[] {
  return ep.beats.map((b) => {
    const tokens = parseBeat(b);
    let t = 0.05;
    const out = tokens.map((tk) => {
      const syl = Math.max(1, tk.spoken.replace(/[^aeiouy]+/gi, ' ').trim().split(' ').length);
      const len = 0.16 + syl * 0.17;
      const s = { start: t, end: t + len };
      t += len + 0.06;
      if (/\.\.\.$/.test(tk.spoken)) t += 0.55;
      else if (/[.!?]$/.test(tk.spoken)) t += 0.4;
      else if (/[,;:—-]$/.test(tk.spoken)) t += 0.18;
      return s;
    });
    return { duration: t + 0.1, tokens: out };
  });
}

/** Lengthens the pauses between lines (max 3.4 s each) so a short episode reaches MIN_SECONDS, or tightens them on a long one. Words are never touched. */
export function fitPauses(ep: Episode, align: BeatAlignment[]): Episode {
  const pauses = ep.beats.map((b) => b.pause ?? DEFAULT_PAUSE);
  const total = () => TITLE_LEAD + END_CARD + align.reduce((s, a, i) => s + a.duration + pauses[i], 0);
  for (let k = 0; k < 200 && total() < MIN_SECONDS + 0.5; k++) {
    let grown = false;
    pauses.forEach((p, i) => {
      if (p < 3.4) { pauses[i] = Math.min(3.4, p + 0.05 * (0.5 + p)); grown = true; }
    });
    if (!grown) break;
  }
  // long episodes: tighten the pauses (down to 0.25 s, never the words) toward MAX_SECONDS
  for (let k = 0; k < 200 && total() > MAX_SECONDS; k++) {
    let shrunk = false;
    pauses.forEach((p, i) => {
      if (p > 0.25) { pauses[i] = Math.max(0.25, p * 0.95); shrunk = true; }
    });
    if (!shrunk) break;
  }
  return { ...ep, beats: ep.beats.map((b, i) => ({ ...b, pause: +pauses[i].toFixed(2) })) };
}

/** Lays the beats end to end (with their pauses) and returns the full episode timeline. */
export function buildTimeline(ep: Episode, align: BeatAlignment[], audio: string | null, mock: boolean): Timeline {
  const words: Word[] = [];
  const beats: BeatTiming[] = [];
  let cursor = TITLE_LEAD;
  ep.beats.forEach((b, bi) => {
    const tokens = parseBeat(b);
    const al = align[bi];
    tokens.forEach((tk, i) => {
      const a = al.tokens[i] ?? al.tokens[al.tokens.length - 1];
      words.push({ text: tk.display, start: cursor + a.start, end: cursor + a.end, beat: bi, hl: tk.hl, cues: tk.cues });
    });
    const first = al.tokens[0]?.start ?? 0;
    beats.push({ start: cursor + first, end: cursor + al.duration });
    cursor += al.duration + (b.pause ?? DEFAULT_PAUSE);
  });
  // a beat's shot starts with its first word, and lasts until the next beat's first word
  beats[0].start = 0;
  for (let i = 0; i < beats.length - 1; i++) beats[i].end = beats[i + 1].start;
  const endStart = cursor;
  beats[beats.length - 1].end = endStart;
  return { episode: ep.n, audio, narrationStart: TITLE_LEAD, endStart, duration: endStart + END_CARD, words, beats, mock };
}
