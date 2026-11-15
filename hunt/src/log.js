// One short line per caught server error, so a "black page" or "old version" report can be looked
// up in Workers Logs afterwards (observability is on in wrangler.preview.jsonc).
// A line says what failed, where (match / zone / route), the mode or zone, and the build id.
// It never carries player names, tokens or ids: only the fields listed in CTX are passed through
// and the error text is scrubbed.
import { VERSION } from '../public/version.js';

const CTX = ['where', 'mode', 'zone'];
const QUIET_MS = 10000; // the same error again within this window is counted, not logged (a tick runs 20x a second)
const recent = new Map(); // what|where|msg -> { at, n }

const scrub = (s) => String(s).replace(/\s+/g, ' ')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
  .replace(/\b(token|name|pin|pass(word)?)=[^&\s"']*/gi, '$1=<hidden>')
  .replace(/[A-Za-z0-9_-]{24,}/g, '<id>')
  .slice(0, 160);

// Returns the line it logged, or null when the error was a repeat inside the quiet window.
export function logError(what, ctx, e, now = Date.now()) {
  try {
    const msg = scrub((e && e.message) || e || 'unknown');
    const out = { what: String(what).slice(0, 40) };
    for (const k of CTX) if (ctx && ctx[k] != null) out[k] = scrub(ctx[k]).slice(0, 40);
    const key = out.what + '|' + (out.where || '') + '|' + msg;
    const seen = recent.get(key);
    if (seen && now - seen.at < QUIET_MS) { seen.n++; return null; }
    if (recent.size > 100) recent.clear();
    recent.set(key, { at: now, n: 0 });
    out.msg = msg;
    const frame = e && typeof e.stack === 'string' ? e.stack.split('\n')[1] : '';
    if (frame) out.at = scrub(frame.trim().replace(/^at /, '').replace(/\(?[^\s(]*[\\/]/, '(')).slice(0, 80);
    if (seen && seen.n) out.repeats = seen.n;
    out.v = VERSION;
    const line = 'hunt-error ' + JSON.stringify(out);
    console.error(line);
    return line;
  } catch { return null; } // logging must never break the game
}

// Wraps an event handler: an exception is logged with the room's context instead of vanishing.
export const guard = (fn, what, ctx) => (...a) => { try { return fn(...a); } catch (e) { logError(what, ctx(), e); } };
