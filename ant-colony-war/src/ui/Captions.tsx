import React from 'react';
import { W } from '../config';
import { clamp } from '../lib/random';
import type { Word } from '../timeline/types';
import { CAPTION_FONT } from './fonts';

const COLORS = { green: '#5dff7e', orange: '#ff8a2a' } as const;

export type Group = { words: Word[]; start: number; end: number };

// Words a chunk should never end on, and words that make a natural start for a new chunk.
const NO_END = /^(the|a|an|my|his|her|our|their|its|of|to|in|on|at|into|from|for|with|by|and|but|or|that|this|these|those|i|i'm|i'd|i've|was|is|were|be|every|any|no|not|just|like|about|than|as|so|one|two|three|four|five|six)$/i;
const GOOD_START = /^(and|but|or|so|that|because|before|after|when|where|while|who|which|for|from|with|without|into|in|on|at|of|to|like|than|until|since|through|across|past|near|i|we|they|he|she|it|nobody|every|all)$/i;
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Splits one phrase (no inner punctuation) into chunks of 2-4 words at the most natural points. */
function splitPhrase(words: Word[]): Word[][] {
  const n = words.length;
  if (n <= 4) return [words];
  // dynamic programming over split points
  const best: number[] = Array(n + 1).fill(Infinity), from: number[] = Array(n + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= n; j++)
    for (let len = 2; len <= 4; len++) {
      const i = j - len;
      if (i < 0 || best[i] === Infinity) continue;
      let c = best[i] + (len === 3 ? 0 : len === 2 ? 1.2 : 0.6);
      if (j < n) {
        if (NO_END.test(bare(words[j - 1].text))) c += 6;
        if (GOOD_START.test(bare(words[j].text))) c -= 1.5;
        c -= Math.min(0.3, Math.max(0, words[j].start - words[j - 1].end)) * 6; // a breath is a good place to split
      }
      if (c < best[j]) { best[j] = c; from[j] = i; }
    }
  if (best[n] === Infinity) return [words];
  const out: Word[][] = [];
  for (let j = n; j > 0; j = from[j]) out.unshift(words.slice(from[j], j));
  return out;
}

/** Splits narration into 2-4 word TikTok-style chunks. Chunks never cross punctuation, shots or pauses. */
export function groupWords(words: Word[]): Group[] {
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || next.beat !== w.beat || /[.,;:!?…"]$|\.\.\.$/.test(w.text) || next.start - w.end > 0.6) {
      phrases.push(cur);
      cur = [];
    }
  });
  const groups: Group[] = phrases.flatMap(splitPhrase).map((ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end }));
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    g.end = Math.min(next ? next.start - 0.02 : g.end + 0.8, g.end + 0.9);
  });
  return groups;
}

export const Captions: React.FC<{ groups: Group[]; time: number; y?: number }> = ({ groups, time, y = 1290 }) => {
  const g = groups.find((x) => time >= x.start - 0.04 && time < x.end);
  if (!g) return null;
  const age = time - g.start;
  const inK = clamp(age / 0.12);
  const outK = clamp((g.end - time) / 0.1);
  const pop = 0.82 + 0.18 * (1 - Math.pow(1 - inK, 3)) + 0.05 * Math.sin(Math.min(1, age / 0.25) * Math.PI);
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        top: y,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        columnGap: 26,
        rowGap: 4,
        transform: `scale(${pop})`,
        opacity: Math.min(inK * 1.5, outK),
        transformOrigin: '50% 50%',
        width: W - 140,
      }}
    >
      {g.words.map((w, i) => {
        const spoken = time >= w.start - 0.03;
        const wk = clamp((time - w.start) / 0.14);
        const hl = w.hl ? COLORS[w.hl] : null;
        const s = hl ? (spoken ? 1 + 0.22 * Math.sin(wk * Math.PI) + 0.06 : 0.94) : spoken ? 1 + 0.06 * Math.sin(wk * Math.PI) : 0.97;
        return (
          <span
            key={i}
            style={{
              fontFamily: CAPTION_FONT,
              fontWeight: 900,
              fontSize: hl ? 104 : 94,
              lineHeight: 1.08,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              color: hl && spoken ? hl : '#ffffff',
              opacity: spoken ? 1 : 0.55,
              transform: `scale(${s}) translateY(${spoken ? 0 : 6}px)`,
              display: 'inline-block',
              margin: hl ? '0 12px' : 0,
              WebkitTextStroke: '12px rgba(0,0,0,0.92)',
              paintOrder: 'stroke fill',
              textShadow: hl && spoken ? `0 0 28px ${hl}aa, 0 6px 18px rgba(0,0,0,0.9)` : '0 6px 18px rgba(0,0,0,0.9)',
            }}
          >
            {w.text.replace(/\.\.\.$/, '…')}
          </span>
        );
      })}
    </div>
  );
};
