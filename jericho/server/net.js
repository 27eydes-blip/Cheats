// Keeps connections to Claude, ElevenLabs and Twilio open between requests, so the
// first reply after a pause doesn't pay for a fresh DNS lookup + TLS handshake.
//
// The pool and the fetch that uses it both come from the same undici package. Never
// hand this pool to Node's built-in fetch: Node ships its own undici, and when the two
// versions differ (for example Node 26 with undici 8 inside) every request fails with
// "fetch failed ... invalid onError method".
//
// If the pool fails for any reason while the plain built-in fetch works, Jericho
// switches to the built-in fetch for the rest of the run and logs it once.
import { logAction } from "./logger.js";

let pool = null; // { Agent, fetch, agent } once loaded
let usePool = process.env.JERICHO_NO_KEEPALIVE !== "1";
let reason = usePool ? null : "turned off with JERICHO_NO_KEEPALIVE=1";

try {
  if (usePool) {
    const undici = await import("undici");
    let agent = new undici.Agent({
      keepAliveTimeout: 60_000, // keep idle sockets for a minute...
      keepAliveMaxTimeout: 10 * 60_000,
      connections: 16,
    });
    // Remember DNS answers for a few minutes, so a new socket doesn't wait on a lookup.
    try {
      if (undici.interceptors?.dns) agent = agent.compose(undici.interceptors.dns({ maxTTL: 5 * 60_000 }));
    } catch {
      /* older undici: plain lookups */
    }
    pool = { fetch: undici.fetch, agent };
  }
} catch (err) {
  usePool = false;
  reason = `couldn't load the keep-alive pool: ${err.message}`;
}

/**
 * The real reason behind an error, following .cause chains ("fetch failed" is never the
 * real reason). Only names, codes and messages: no headers or request bodies, so no keys.
 */
export function errorDetails(err) {
  const chain = [];
  let e = err;
  for (let i = 0; e && i < 5; i++, e = e.cause) {
    const item = { message: String(e.message || e).slice(0, 300) };
    for (const k of ["name", "code", "errno", "syscall", "hostname", "address", "port", "status"]) {
      if (e[k] !== undefined && e[k] !== null && typeof e[k] !== "object") item[k] = e[k];
    }
    chain.push(item);
    if (typeof e !== "object") break;
  }
  return chain;
}

/** One readable line for the terminal, e.g. "fetch failed <- ENOTFOUND api.elevenlabs.io". */
export function errorSummary(err) {
  return errorDetails(err)
    .map((e) => [e.code, e.message].filter(Boolean).join(" "))
    .join("  <-  ");
}

function fallBack(err) {
  if (!usePool) return;
  usePool = false;
  reason = errorSummary(err);
  logAction("net_fallback", { note: "keep-alive pool failed; using Node's built-in fetch from now on", cause: errorDetails(err) });
  console.warn(`⚠️  Keep-alive connection pool failed (${reason}). Using Node's built-in fetch instead.`);
}

/** How requests are currently sent, for the startup self-test. */
export function connectionMode() {
  return usePool ? "keep-alive pool" : `built-in fetch${reason ? ` (${reason})` : ""}`;
}

const aborted = (init, err) => init?.signal?.aborted || err?.name === "AbortError";

/** fetch() through the shared keep-alive pool, falling back to the built-in fetch if the pool is the problem. */
export async function keepAliveFetch(url, init = {}) {
  if (usePool && pool) {
    try {
      return await pool.fetch(url, { ...init, dispatcher: pool.agent });
    } catch (err) {
      if (aborted(init, err)) throw err;
      // Was it the pool, or is the network down? Try once without the pool.
      const res = await fetch(url, init); // if this throws too, it's the network: keep the pool
      fallBack(err);
      return res;
    }
  }
  return fetch(url, init);
}

/** Tests only: swap in a different pool to check the fallback. */
export function _setPoolForTests(p) {
  pool = p;
  usePool = Boolean(p);
  reason = null;
}

const warmers = [];
let timer = null;
let idleTimer = null;
export const WARM_ACTIVE_MS = 25_000; // a page is open: keep the sockets open
export const WARM_IDLE_MS = 4 * 60_000; // nobody connected: still refresh DNS + TLS now and then

/** Register a cheap request (no credits used) that keeps a host's connection warm. */
export function addWarmer(name, fn) {
  warmers.push({ name, fn });
}

/** Touch every service once (DNS lookup, TLS handshake, a free request). Never throws. */
export function warmAll() {
  return Promise.all(warmers.map((w) => Promise.resolve().then(w.fn).catch(() => {})));
}

/** While a page is open, touch each service every 25s so the sockets stay open. */
export function setWarm(on) {
  if (on && !timer) {
    warmAll();
    timer = setInterval(warmAll, WARM_ACTIVE_MS);
    timer.unref();
  } else if (!on && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** At startup: warm everything now, then every few minutes even with no page open. */
export function startIdleWarm({ delayMs = 1500, everyMs = WARM_IDLE_MS } = {}) {
  if (idleTimer) return;
  setTimeout(() => !timer && warmAll(), delayMs).unref?.();
  idleTimer = setInterval(() => !timer && warmAll(), everyMs);
  idleTimer.unref();
}
