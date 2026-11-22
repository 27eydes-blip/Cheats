/**
 * The one door to Finnhub. Every call (quotes and candles) spends a token
 * from a shared per-minute budget (FINNHUB_CALLS_PER_MIN, default 50, under
 * the free tier's 60), and a 429 pauses all calls for a minute. Callers get
 * `null` instead of waiting when the budget is spent.
 */
const perMin = () => Math.max(1, Math.min(600, Number(process.env.FINNHUB_CALLS_PER_MIN) || 50));

const state = { tokens: -1, last: 0, pausedUntil: 0, calls: 0, limited: 0, errors: 0 };

export function resetFinnhub() {
  Object.assign(state, { tokens: -1, last: 0, pausedUntil: 0, calls: 0, limited: 0, errors: 0 });
}

/** Take one call from the budget (refills continuously). */
export function takeToken(now = Date.now()): boolean {
  const cap = perMin();
  if (state.tokens < 0) (state.tokens = cap), (state.last = now);
  state.tokens = Math.min(cap, state.tokens + ((now - state.last) / 60_000) * cap);
  state.last = now;
  if (now < state.pausedUntil || state.tokens < 1) return false;
  state.tokens -= 1;
  return true;
}

export const tokensLeft = (now = Date.now()) => (state.tokens < 0 ? perMin() : Math.min(perMin(), state.tokens + ((now - state.last) / 60_000) * perMin()));

export type FinnhubResult<T> = { ok: true; data: T } | { ok: false; reason: "budget" | "limited" | "http" | "network"; status?: number };

/** GET a Finnhub path (e.g. "/quote?symbol=AAPL"). Times out after `timeoutMs`. */
export async function finnhub<T>(path: string, now = Date.now(), timeoutMs = 4000): Promise<FinnhubResult<T>> {
  if (!takeToken(now)) return { ok: false, reason: "budget" };
  state.calls++;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`https://finnhub.io/api/v1${path}${sep}token=${encodeURIComponent(process.env.FINNHUB_API_KEY ?? "")}`, { cache: "no-store", signal: ctl.signal });
    if (res.status === 429) {
      state.limited++;
      state.pausedUntil = Date.now() + 60_000;
      return { ok: false, reason: "limited", status: 429 };
    }
    if (!res.ok) return (state.errors++, { ok: false, reason: "http", status: res.status });
    return { ok: true, data: (await res.json()) as T };
  } catch {
    state.errors++;
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export const finnhubStats = () => ({ ...state, perMin: perMin() });
