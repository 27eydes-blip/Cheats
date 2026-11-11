import React from 'react';
import { W } from '../config';
import { clamp } from '../lib/random';
import type { Word } from '../timeline/types';
import { CAPTION_FONT } from './fonts';

const COLORS = { green: '#5dff7e', orange: '#ff8a2a' } as const;

export type Group = { words: Word[]; start: number; end: number };

/** Splits narration into 2-4 word TikTok-style chunks, breaking on punctuation, pauses and shot changes. */
export function groupWords(words: Word[]): Group[] {
  const groups: Group[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const punct = /[.!?…]$|\.\.\.$/.test(w.text);
    const comma = /[,;:—]$/.test(w.text);
    const longWord = cur.reduce((s, x) => s + x.text.length, 0) > 16;
    // never end a chunk on a little word like 'the' or 'like' unless we have to
    const dangling = /^(the|a|an|of|to|in|on|at|my|his|her|our|their|and|like|that|for|with|from|every|one|no)$/i.test(w.text) && cur.length < 5 && next && next.beat === w.beat && next.start - w.end < 0.45;
    if (dangling) return;
    if (!next || next.beat !== w.beat || next.start - w.end > 0.45 || punct || cur.length >= 4 || (cur.length >= 3 && (comma || longWord)) || (cur.length >= 2 && comma && longWord)) flush();
  });
  // merge lonely single words into the previous chunk when they belong to the same sentence
  for (let i = groups.length - 1; i > 0; i--) {
    const g = groups[i], p = groups[i - 1];
    if (g.words.length === 1 && p.words.length < 3 && g.words[0].beat === p.words[0].beat && !/[.!?]$/.test(p.words[p.words.length - 1].text) && g.start - p.end < 0.3) {
      p.words.push(...g.words);
      p.end = g.end;
      groups.splice(i, 1);
    }
  }
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    g.end = Math.min(next ? next.start - 0.02 : g.end + 0.8, g.end + 0.7);
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
