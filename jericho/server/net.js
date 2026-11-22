// Keeps connections to Claude, ElevenLabs and Twilio open between requests, so the
// first reply after a pause doesn't pay for a fresh DNS lookup + TLS handshake.
import { Agent } from "undici";

export const dispatcher = new Agent({
  keepAliveTimeout: 60_000, // keep idle sockets for a minute...
  keepAliveMaxTimeout: 10 * 60_000,
  connections: 16,
});

/** fetch() through the shared keep-alive pool. */
export function keepAliveFetch(url, init = {}) {
  return fetch(url, { ...init, dispatcher });
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
