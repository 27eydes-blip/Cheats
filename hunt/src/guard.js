// Small guards shared by the Durable Objects in worker.js. (They live here because a Worker's
// entry module may only export handlers and Durable Object classes.)

// FAIL SAFE: whatever a client sends and whatever breaks, a room keeps ticking for everyone else.
// Every caught error is counted (tests read faults) and logged as one scrubbed line with the room's
// context (log.js: no names or tokens; a repeat inside its quiet window is counted, not logged).
import { logError } from './log.js';

export const faults = { n: 0, last: null };
export function fault(what, e, ctx) {
  faults.n++; faults.last = e;
  logError(what, ctx, e);
}
// a client frame -> a message object, or null (not text, not JSON, too big, or JSON that isn't an object)
export function parseMsg(data) {
  if (typeof data !== 'string' || data.length > 16384) return null;
  let m;
  try { m = JSON.parse(data); } catch { return null; }
  return m && typeof m === 'object' && !Array.isArray(m) ? m : null;
}

// Free Play: people who can join one zone directly. The tick and every snapshot grow with the
// crowd (about 4 ms a tick at 60 people, 9 ms at 100, past the 50 ms budget near 200).
export const ZONE_HUMANS = 80;
