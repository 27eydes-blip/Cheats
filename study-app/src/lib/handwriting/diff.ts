/**
 * When a student edits the text freely (not via a tapped word), find the
 * words they changed so those fixes also teach the handwriting profile.
 * Token-level LCS; replaced runs of up to 3 words become corrections.
 */
export function wordCorrections(before: string, after: string): { original: string; corrected: string; context: string }[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length > 4000 || b.length > 4000) return [];
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { original: string; corrected: string; context: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    const si = i;
    const sj = j;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) break;
      if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) i++;
      else j++;
    }
    const removed = a.slice(si, i);
    const added = b.slice(sj, j);
    if (removed.length && added.length && removed.length <= 3 && added.length <= 3) {
      const strip = (s: string) => s.replace(/^[^\p{L}\p{N}$\\]+|[^\p{L}\p{N}$}]+$/gu, "");
      const original = strip(removed.join(" "));
      const corrected = strip(added.join(" "));
      if (original && corrected && original !== corrected) {
        out.push({ original, corrected, context: b.slice(Math.max(0, sj - 5), j + 5).join(" ") });
      }
    }
  }
  return out;
}
