/**
 * Learns a student's handwriting from their corrections.
 *
 * Every time a student fixes a word the AI misread, we store (original →
 * corrected). Before each new read we summarize those fixes into a short,
 * prompt-ready profile:
 *   - word-level fixes the student has made more than once or recently
 *     ("clorine" → "chlorine"), weighted toward the current class;
 *   - letter-level confusions found by aligning the two spellings
 *     (e.g. their "a" is often read as "o");
 *   - vocabulary the student uses in this class (from corrected words).
 * The model uses this as a prior when a letter shape is ambiguous.
 */

export interface CorrectionRow {
  original: string;
  corrected: string;
  class_id?: string | null;
  created_at?: string;
}

export interface HandwritingProfile {
  wordFixes: { from: string; to: string; count: number }[];
  letterConfusions: { written: string; misreadAs: string; count: number }[];
  vocabulary: string[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * Character-level alignment (Levenshtein backtrace). Returns substitutions as
 * [correctChar, misreadChar] pairs. Only single-character substitutions are
 * reported; insertions/deletions are folded into neighbours by the caller.
 */
export function letterSubstitutions(misread: string, correct: string): [string, string][] {
  const a = misread.toLowerCase();
  const b = correct.toLowerCase();
  if (!a || !b || Math.abs(a.length - b.length) > 3 || a === b) return [];
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  // Too different to be a misreading (probably a rewrite), skip.
  if (dp[a.length][b.length] > Math.max(2, Math.ceil(b.length / 3))) return [];
  const subs: [string, string][] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    if (dp[i][j] === dp[i - 1][j - 1] + cost) {
      if (cost) subs.push([b[j - 1], a[i - 1]]);
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }
  return subs.reverse().filter(([c, m]) => /\p{L}|\p{N}/u.test(c) && /\p{L}|\p{N}/u.test(m));
}

export function buildProfile(rows: CorrectionRow[], classId?: string | null): HandwritingProfile {
  const fixes = new Map<string, { from: string; to: string; count: number; score: number }>();
  const letters = new Map<string, { written: string; misreadAs: string; count: number }>();
  const vocab = new Map<string, number>();
  const now = Date.now();

  for (const r of rows) {
    const from = norm(r.original);
    const to = norm(r.corrected);
    if (!from || !to || from === to) continue;
    const ageDays = r.created_at ? (now - new Date(r.created_at).getTime()) / 86_400_000 : 0;
    const recency = 1 / (1 + Math.max(0, ageDays) / 30);
    const sameClass = classId && r.class_id === classId ? 2 : 1;
    const key = `${from.toLowerCase()}→${to.toLowerCase()}`;
    const f = fixes.get(key) ?? { from, to, count: 0, score: 0 };
    f.count++;
    f.score += recency * sameClass;
    fixes.set(key, f);

    for (const [written, misreadAs] of letterSubstitutions(from, to)) {
      const lk = `${written}→${misreadAs}`;
      const l = letters.get(lk) ?? { written, misreadAs, count: 0 };
      l.count++;
      letters.set(lk, l);
    }

    if (sameClass === 2 || !classId) {
      for (const w of to.split(/\s+/)) {
        const clean = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        if (clean.length >= 4) vocab.set(clean, (vocab.get(clean) ?? 0) + 1);
      }
    }
  }

  return {
    wordFixes: [...fixes.values()]
      .sort((x, y) => y.score - x.score)
      .slice(0, 40)
      .map(({ from, to, count }) => ({ from, to, count })),
    letterConfusions: [...letters.values()]
      .filter((l) => l.count >= 2)
      .sort((x, y) => y.count - x.count)
      .slice(0, 12),
    vocabulary: [...vocab.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 40)
      .map(([w]) => w),
  };
}

/** Renders a profile as compact prompt text (empty string if nothing learned yet). */
export function profileToPrompt(p: HandwritingProfile): string {
  const lines: string[] = [];
  if (p.letterConfusions.length) {
    lines.push(
      "Letter habits: " +
        p.letterConfusions.map((l) => `their "${l.written}" has been misread as "${l.misreadAs}" (${l.count}x)`).join("; "),
    );
  }
  if (p.wordFixes.length) {
    lines.push("Past misreadings they corrected (misread → correct):");
    for (const f of p.wordFixes) lines.push(`- "${f.from}" → "${f.to}"${f.count > 1 ? ` (${f.count}x)` : ""}`);
  }
  if (p.vocabulary.length) {
    lines.push(`Words this student often writes in this class: ${p.vocabulary.join(", ")}`);
  }
  return lines.join("\n");
}
