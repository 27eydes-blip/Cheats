// Answer lists + fuzzy matching. Shared by the Worker (validation) and the admin page (preview).
//
// Answer list format, one answer per line:
//   Canonical answer | alias one, alias two, common misspelling | 4.5
// The last field is the estimated % of players who'd give it (used for rarity until real data arrives).
// Aliases and the estimate are optional. Lines starting with # are comments.

const ARTICLES = new Set(['a', 'an', 'the', 'my', 'your', 'some', 'his', 'her', 'their', 'our', 'one']);

export function normalize(text) {
  let s = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = s.split(' ').filter(Boolean);
  while (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.map(singular).join(' ');
}

function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export function parseAnswerList(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map((p) => p.trim());
    const answer = parts[0];
    if (!answer) continue;
    const aliases = (parts[1] || '').split(',').map((a) => a.trim()).filter(Boolean);
    const est = parts[2] !== undefined && parts[2] !== '' ? Math.max(0, Number(parts[2]) || 0) : 1;
    out.push({ answer, aliases, est });
  }
  return out;
}

export function formatAnswerList(list) {
  return list.map((a) => [a.answer, a.aliases.join(', '), String(a.est)].join(' | ')).join('\n');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function tolerance(len) {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 12) return 2;
  return 3;
}

// Build a lookup once per prompt: [{ index, forms: [normalized strings] }]
export function buildIndex(list) {
  return list.map((a, index) => {
    const forms = new Set([normalize(a.answer), ...a.aliases.map(normalize)]);
    for (const f of [...forms]) forms.add(f.replace(/ /g, '')); // "sea weed" == "seaweed"
    forms.delete('');
    return { index, forms: [...forms] };
  });
}

// Returns { index, how } or null. how: 'exact' | 'fuzzy' | 'contains'
export function matchAnswer(input, index) {
  const n = normalize(input);
  if (!n) return null;
  const squashed = n.replace(/ /g, '');
  for (const e of index) {
    if (e.forms.includes(n) || e.forms.includes(squashed)) return { index: e.index, how: 'exact' };
  }
  let best = null;
  for (const e of index) {
    for (const f of e.forms) {
      const tol = tolerance(Math.min(f.length, n.length));
      if (!tol || Math.abs(f.length - n.length) > tol) continue;
      const d = levenshtein(n, f);
      if (d <= tol && (!best || d < best.d)) best = { index: e.index, d };
    }
  }
  if (best) return { index: best.index, how: 'fuzzy' };
  // "a really big cactus" -> "cactus": a listed answer appears as whole words, with few extra words around it.
  const words = n.split(' ');
  let contained = null;
  for (const e of index) {
    for (const f of e.forms) {
      if (f.length < 4 || !f.includes(' ') && f.length < 4) continue;
      const fw = f.split(' ');
      if (words.length - fw.length > 3 || words.length <= fw.length) continue;
      const hay = ` ${n} `;
      if (hay.includes(` ${f} `) && (!contained || f.length > contained.len)) contained = { index: e.index, len: f.length };
    }
  }
  return contained ? { index: contained.index, how: 'contains' } : null;
}
