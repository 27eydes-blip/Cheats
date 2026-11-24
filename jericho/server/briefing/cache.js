// A tiny cache so each briefing part is fetched at most once every few minutes.
const store = new Map();

/**
 * Returns the cached value for `key` if it's fresh, otherwise runs `fn` and caches a success.
 * Once a value is past 70% of its life, it's still returned at once but refreshed in the
 * background, so a regular caller (the 4-minute prefetch) keeps it from ever running out.
 */
export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < ttlMs) {
    if (age > ttlMs * 0.7 && !hit.refreshing) {
      hit.refreshing = true;
      Promise.resolve()
        .then(fn)
        .then((value) => store.set(key, { at: Date.now(), value }))
        .catch(() => {})
        .finally(() => (hit.refreshing = false));
    }
    return hit.value;
  }
  const value = await fn();
  store.set(key, { at: Date.now(), value });
  return value;
}

export function forget(key) {
  store.delete(key);
}

export function clearCache() {
  store.clear();
}

/** Rejects if `promise` takes longer than `ms`, so one slow part can't hold up the briefing. */
export function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
    }),
  ]);
}
