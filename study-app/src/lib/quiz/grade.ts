import type { Question } from "./schema";

/** Lowercase, strip accents/punctuation/articles, collapse spaces. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Loosen LaTeX so "$H_2O$" matches "h2o".
    .replace(/\\([a-z]+)/g, "$1")
    .replace(/[$`{}^_]/g, "")
    .replace(/[^\p{L}\p{N}\s.+-]/gu, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Forgiving match for typed answers: allows small typos on longer words. */
export function answersMatch(given: string, expected: string): boolean {
  const g = normalizeAnswer(given);
  const e = normalizeAnswer(expected);
  if (!g || !e) return false;
  if (g === e) return true;
  // Numbers must match exactly.
  if (/\d/.test(e)) return g.replace(/\s/g, "") === e.replace(/\s/g, "");
  const allowed = e.length <= 4 ? 0 : e.length <= 8 ? 1 : 2;
  return editDistance(g, e) <= allowed;
}

export type Answer =
  | { type: "multiple_choice"; choice: number }
  | { type: "true_false"; value: boolean }
  | { type: "fill_blank"; text: string }
  | { type: "short_answer"; text: string }
  | { type: "flashcard"; knewIt: boolean }
  | { type: "matching"; pairs: Record<number, number> };

export interface GradeResult {
  correct: boolean;
  /** 0..1 partial credit. */
  score: number;
  feedback?: string;
}

export function grade(q: Question, a: Answer): GradeResult {
  if (q.type !== a.type) return { correct: false, score: 0 };
  switch (q.type) {
    case "multiple_choice": {
      const ok = (a as { choice: number }).choice === q.data.answer_index;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "true_false": {
      const ok = (a as { value: boolean }).value === q.data.answer;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "flashcard": {
      const ok = (a as { knewIt: boolean }).knewIt;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "fill_blank": {
      const text = (a as { text: string }).text;
      const ok = [q.data.answer, ...q.data.accepted_answers].some((e) => answersMatch(text, e));
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "short_answer": {
      const text = normalizeAnswer((a as { text: string }).text);
      if (!text) return { correct: false, score: 0 };
      if (answersMatch(text, q.data.answer)) return { correct: true, score: 1 };
      const points = q.data.key_points.length ? q.data.key_points : [q.data.answer];
      const hits = points.filter((p) => keyPointCovered(text, p)).length;
      const score = hits / points.length;
      return {
        correct: score >= 0.6,
        score,
        feedback: hits < points.length ? `Covered ${hits} of ${points.length} key points.` : undefined,
      };
    }
    case "matching": {
      const pairs = (a as { pairs: Record<number, number> }).pairs;
      const right = q.data.pairs.filter((_, i) => pairs[i] === i).length;
      const score = right / q.data.pairs.length;
      return { correct: score === 1, score };
    }
  }
}

/** A key point counts if most of its meaningful words appear (typo-tolerant). */
export function keyPointCovered(normalizedText: string, point: string): boolean {
  const words = normalizeAnswer(point)
    .split(" ")
    .filter((w) => w.length > 3);
  if (!words.length) return normalizedText.includes(normalizeAnswer(point));
  const textWords = normalizedText.split(" ");
  const found = words.filter((w) => textWords.some((t) => answersMatch(t, w) || t.startsWith(w.slice(0, 5)))).length;
  return found / words.length >= 0.6;
}
