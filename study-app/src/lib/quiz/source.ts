/**
 * Finds where a question's source quote sits in a page of notes, so the UI can
 * highlight "this came from here". The AI is asked to copy quotes exactly,
 * but spacing, punctuation, and the student's later corrections can shift
 * things, so matching is whitespace/punctuation-insensitive with a fuzzy
 * fallback on the longest run of matching words.
 */
export function locateQuote(text: string, quote: string | null | undefined): { start: number; end: number } | null {
  if (!quote || !text) return null;
  const direct = text.indexOf(quote);
  if (direct >= 0) return { start: direct, end: direct + quote.length };

  // Build a normalized copy of `text` with a map back to original offsets.
  const map: number[] = [];
  let norm = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toLowerCase();
    if (/[\p{L}\p{N}]/u.test(ch)) {
      norm += ch;
      map.push(i);
    } else if (norm && norm[norm.length - 1] !== " ") {
      norm += " ";
      map.push(i);
    }
  }
  const q = quote
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!q) return null;
  const idx = norm.indexOf(q);
  if (idx >= 0) return { start: map[idx], end: map[Math.min(map.length - 1, idx + q.length - 1)] + 1 };

  // Fuzzy: longest run of consecutive quote words found in order.
  const words = q.split(" ");
  let best: { start: number; end: number; len: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    for (let j = words.length; j > i + Math.max(1, best?.len ?? 0); j--) {
      const phrase = words.slice(i, j).join(" ");
      if (phrase.length < 8) break;
      const at = norm.indexOf(phrase);
      if (at >= 0) {
        best = { start: map[at], end: map[Math.min(map.length - 1, at + phrase.length - 1)] + 1, len: j - i };
        break;
      }
    }
  }
  return best && best.len >= Math.min(3, words.length) ? { start: best.start, end: best.end } : null;
}
