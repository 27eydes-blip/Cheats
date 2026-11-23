// A tiny cache so each briefing part is fetched at most once every few minutes.
const store = new Map();

/** Returns the cached value for `key` if it's fresh, otherwise runs `fn` and caches a success. */
export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
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
