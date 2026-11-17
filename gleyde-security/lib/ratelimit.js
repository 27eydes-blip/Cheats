/* Fixed-window rate limiter used by every API endpoint.

   Two layers:
   - In-memory per isolate. JS is single-threaded inside an isolate, so increments here are
     atomic and catch parallel bursts that would race past KV's read-then-write.
   - KV (binding RATE_LIMIT_KV), which spans isolates and time. KV is eventually consistent,
     so the Cloudflare WAF rate-limit rule in the README remains the hard limit.
   Subjects are salted and hashed: raw IPs and domains are never stored. */

const MEMORY_MAX_KEYS = 10_000;
const memories = new Map(); // limiter name -> { windowId, counts }

export function _resetRateLimitMemory() {
  memories.clear();
}

async function hash(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function memoryHit(name, key, windowId) {
  let mem = memories.get(name);
  if (!mem || mem.windowId !== windowId || mem.counts.size > MEMORY_MAX_KEYS) {
    mem = { windowId, counts: new Map() };
    memories.set(name, mem);
  }
  const n = (mem.counts.get(key) || 0) + 1;
  mem.counts.set(key, n);
  return n;
}

/* Counts one hit for `subject` and returns true when it is over the limit. */
export async function rateLimited(env, { name, subject, max, windowSec }) {
  const windowId = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${name}:${await hash(`${env.RATE_LIMIT_SALT || "gleyde"}:${subject}`)}:${windowId}`;

  if (memoryHit(name, key, windowId) > max) return true;

  if (!env.RATE_LIMIT_KV) return false;
  try {
    const count = Number((await env.RATE_LIMIT_KV.get(key)) || 0);
    if (count >= max) return true;
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: windowSec + 60 });
  } catch (err) {
    // KV outage: fail open (memory limit, WAF rule and Turnstile still apply) rather than take the endpoint down.
    console.error("Rate-limit KV error", err);
  }
  return false;
}
