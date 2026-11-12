import type { Beat } from '../../script/types';
import type { Cue, Highlight, Token } from './types';

const ORANGE = /^(fire|fires|ember|embers|flame|flames|burn|burns|burning|venom|stinger|stingers|kesh|krell|dukar|drax|venn|velka|thrane|queen|smoke|glow|war|blood)$/i;
const GREEN = /^(dead|die|died|death|kill|killed|killing|green|snap|snapped|alive|awake|traitor|evil|invisible|weapon|mandros)$/i;
const NUMBER = /^[\d,]+$|^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|hundred|hundreds|thousand|thousands)$/i;
const PHRASES: [RegExp, Exclude<Highlight, null>][] = [
  [/^fire ants?$/i, 'orange'],
  [/^fire (queen|colony)$/i, 'orange'],
  [/^my colony$/i, 'green'],
  [/^(tavi ren|kael varro)$/i, 'blue'],
  [/^lord mandros$/i, 'green'],
  [/^my sisters$/i, 'green'],
  [/^trap-jaws?$/i, 'green'],
];
const BLUE = /^(tavi|kael|ren|varro|pip|rix|brother)$/i;
const bare = (s: string) => s.replace(/[^\p{L}\p{N},'-]/gu, '').replace(/,$/, '');

/** Splits a beat's text into tokens, resolving inline markup. */
export function parseBeat(beat: Beat): Token[] {
  const tokens: Token[] = [];
  // keep [display|spoken] groups together even when they contain spaces
  // only [display|spoken] (with a bar) is a pronunciation group; plain [ ... ] marks the Green speaking
  const parts = beat.text.match(/(\{[a-z]+\})*\[[^\]|]+\|[^\]]+\][^\s]*|\S+/g) ?? [];
  let inGreen = false, inQuote = false;
  for (let raw of parts) {
    let green = inGreen, quote = inQuote;
    if (!/\|/.test(raw)) {
      if (raw.includes('[')) { green = true; inGreen = true; }
      if (raw.includes(']')) inGreen = false;
      raw = raw.replace(/[[\]]/g, '');
      const q = (raw.match(/"/g) ?? []).length;
      if (raw.startsWith('"')) quote = true;
      if (q % 2 === 1) inQuote = !inQuote;
    }
    const cues: Cue[] = [];
    raw = raw.replace(/\{(snap|impact|shake|flash)\}/g, (_, c) => {
      cues.push(c as Cue);
      return '';
    });
    let hl: Highlight = null;
    if (/\*[^*]+\*/.test(raw)) hl = 'green';
    if (/\^[^^]+\^/.test(raw)) hl = 'orange';
    raw = raw.replace(/[*^]/g, '');
    let display = raw, spoken = raw;
    const m = raw.match(/^(.*)\[([^|\]]+)\|([^\]]+)\](.*)$/);
    if (m) {
      display = m[1] + m[2] + m[4];
      spoken = m[1] + m[3] + m[4];
    }
    if (!display) continue;
    tokens.push({ display, spoken, cues, hl, green: green || undefined, quote: quote || undefined });
  }
  // automatic highlights
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.hl) continue;
    const w = bare(t.display);
    if (NUMBER.test(w) || GREEN.test(w)) t.hl = 'green';
    else if (ORANGE.test(w)) t.hl = 'orange';
    else if (BLUE.test(w)) t.hl = 'blue';
    if (i + 1 < tokens.length) {
      const pair = w + ' ' + bare(tokens[i + 1].display);
      for (const [re, c] of PHRASES)
        if (re.test(pair)) {
          t.hl = c;
          tokens[i + 1].hl = c;
        }
    }
  }
  return tokens;
}

export const spokenText = (tokens: Token[]) => tokens.map((t) => t.spoken).join(' ');
