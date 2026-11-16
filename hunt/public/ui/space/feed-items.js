// Ticker items from real data only (pure: no DOM, tested in test/space-ticker.test.js).
//   feed       the /api/space/feed answer ({online, top, records}) or null
//   opts.now               ms clock
//   opts.shopResetAt       ms when the daily shop resets (only when a daily shop exists)
//   opts.events            live events [{id, label, value, target, endsAt}] (only real, running ones)
//   opts.trackName(id)     track id -> display name
//   opts.targets           screen keys for taps, e.g. {online: 'crew', top: 'leaderboard'}
// Returns [{id, label, value, target, until?, track?}]; empty when there is nothing true to say.
export const fmtCount = (n) => String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// "03:12" (hours:minutes) under a day, "1D 04H" beyond; never negative
export function fmtCountdown(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)}D ${String(h % 24).padStart(2, '0')}H`;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
// race time in seconds -> "1:23.45"
export function fmtLap(s) {
  if (!(s > 0)) return '--:--';
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
}
const clean = (s, n = 16) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

export function tickerItems(feed, { now = Date.now(), shopResetAt = null, events = [], trackName = (k) => k, targets = {} } = {}) {
  const out = [];
  const f = feed && typeof feed === 'object' ? feed : {};
  if (Number.isFinite(f.online) && f.online > 0) out.push({ id: 'online', label: 'PLAYERS ONLINE', value: fmtCount(f.online), target: targets.online ?? null });
  if (f.top && f.top.name && f.top.wins > 0) out.push({ id: 'top', label: 'TOP RACER', value: `${clean(f.top.name)} · ${fmtCount(f.top.wins)} ${f.top.wins === 1 ? 'WIN' : 'WINS'}`, target: targets.top ?? null });
  if (Number.isFinite(shopResetAt) && shopResetAt > now) out.push({ id: 'shop', label: 'DAILY SHOP RESETS IN', value: fmtCountdown(shopResetAt - now), target: targets.shop ?? 'shop', until: shopResetAt });
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || !e.label || (Number.isFinite(e.endsAt) && e.endsAt <= now)) continue;
    out.push({ id: 'ev-' + clean(e.id || e.label, 24), label: clean(e.label, 32), value: e.endsAt ? `ENDS IN ${fmtCountdown(e.endsAt - now)}` : clean(e.value || '', 32), target: e.target ?? null, ...(e.endsAt ? { until: e.endsAt, prefix: 'ENDS IN ' } : {}) });
  }
  for (const r of Array.isArray(f.records) ? f.records : []) {
    if (!r || !r.name || !(r.time > 0)) continue;
    out.push({ id: 'rec-' + r.track, label: 'TRIAL RECORD', value: `${trackName(r.track)} · ${clean(r.name)} ${fmtLap(r.time)}`, target: targets.record ?? 'trial', track: r.track });
  }
  return out;
}
// refresh the countdown values in place (the ticker calls this every 30 s; same ids, same order)
export function tickItems(items, now = Date.now()) {
  return items.filter((it) => !it.until || it.until > now).map((it) => (it.until ? { ...it, value: (it.prefix || '') + fmtCountdown(it.until - now) } : it));
}
