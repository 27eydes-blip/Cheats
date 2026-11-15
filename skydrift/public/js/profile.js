// Local player profile (collection, streak, history). Mirrored to the server, keyed by an anonymous id.
const KEY = 'skydrift.profile.v1';

function newId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return 'p_' + [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fresh() {
  return {
    id: newId(), created: Date.now(), muted: false, premium: false,
    days: {}, creatures: {}, fragments: 0, stardust: 0, streak: 0, best: 0, lastDone: null,
  };
}

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && p.id) return { ...fresh(), ...p };
  } catch {}
  const p = fresh();
  saveProfile(p, false);
  return p;
}

let syncTimer = null;
export function saveProfile(p, sync = true) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  if (!sync) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { id, ...rest } = p;
    fetch(`/api/profile?player=${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: rest }),
    }).catch(() => {});
  }, 800);
}

export function localDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function yesterday(date) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return localDate(d);
}

// The streak still counts if your last finished day was today or yesterday.
export function liveStreak(p, today) {
  return p.lastDone === today || p.lastDone === yesterday(today) ? p.streak : 0;
}

export function completeDay(p, date) {
  if (p.lastDone === date) return;
  p.streak = p.lastDone === yesterday(date) ? p.streak + 1 : 1;
  p.best = Math.max(p.best, p.streak);
  p.lastDone = date;
}
