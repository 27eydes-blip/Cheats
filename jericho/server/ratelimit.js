// A small sliding-window rate limiter: at most `limit` hits per `windowMs` for each key
// (usually the caller's IP address). Used on the Twilio webhooks and for wrong access tokens.

export class RateLimiter {
  constructor({ limit, windowMs, maxKeys = 5000, now = () => Date.now() }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
    this.hits = new Map(); // key -> timestamps (oldest first)
  }

  #recent(key) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(key) || []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Is `key` already over the limit (without counting a new hit)? */
  blocked(key) {
    return this.#recent(key).length >= this.limit;
  }

  /** Counts a hit. { ok, retryAfterSeconds }: ok is false once the limit is passed. */
  hit(key) {
    const list = this.#recent(key);
    if (list.length >= this.limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((list[0] + this.windowMs - this.now()) / 1000)) };
    }
    list.push(this.now());
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) {
      // flooded with many addresses: drop the oldest keys (Map keeps insertion order)
      for (const k of [...this.hits.keys()].slice(0, this.hits.size - this.maxKeys)) this.hits.delete(k);
    }
    return { ok: true, retryAfterSeconds: 0 };
  }

  reset() {
    this.hits.clear();
  }
}
