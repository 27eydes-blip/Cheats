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
    pool = {
      fetch: undici.fetch,
      agent: new undici.Agent({
        keepAliveTimeout: 60_000, // keep idle sockets for a minute...
        keepAliveMaxTimeout: 10 * 60_000,
        connections: 16,
      }),
    };
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

/** Register a cheap request (no credits used) that keeps a host's connection warm. */
export function addWarmer(name, fn) {
  warmers.push({ name, fn });
}

/** ...and while a page is open, touch each service every 25s so the sockets stay open. */
export function setWarm(on) {
  if (on && !timer) {
    const tick = () => warmers.forEach((w) => w.fn().catch(() => {}));
    tick();
    timer = setInterval(tick, 25_000);
    timer.unref();
  } else if (!on && timer) {
    clearInterval(timer);
    timer = null;
  }
}
