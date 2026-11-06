// Pure (no imports): used by the cloud save merge too.
/** Merge two saves' level progress: the most progress wins and no star is ever lost. */
export function mergeLevelProgress(a = {}, b = {}) {
  const out = {
    p: { ...(a.p || {}) },
    claimed: { ...(a.claimed || {}) },
    played: Math.max(a.played || 0, b.played || 0),
  };
  for (const [k, v] of Object.entries(b.claimed || {})) if (v) out.claimed[k] = true;
  for (const [n, rb] of Object.entries(b.p || {})) {
    const ra = out.p[n];
    if (!ra) {
      out.p[n] = rb;
      continue;
    }
    const best = [ra.best, rb.best].filter((x) => x > 0);
    out.p[n] = {
      done: !!(ra.done || rb.done),
      coins: [0, 1, 2].map((i) => !!(ra.coins?.[i] || rb.coins?.[i])),
      flawless: !!(ra.flawless || rb.flawless),
      best: best.length ? Math.min(...best) : 0,
      attempts: Math.max(ra.attempts || 0, rb.attempts || 0),
    };
  }
  return out;
}
