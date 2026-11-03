// Small seeded RNG (mulberry32) so the Daily Challenge is identical for everyone.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = Date.now()) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  /** weights: { key: weight } */
  weighted(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = this.next() * total;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0];
  }
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayDiff(a, b) {
  const pa = new Date(`${a}T12:00:00`);
  const pb = new Date(`${b}T12:00:00`);
  return Math.round((pb - pa) / 86400000);
}

/** Daily challenge number since launch day — shown on share cards. */
export function dailyNumber(key = todayKey()) {
  return Math.max(1, dayDiff("2026-01-01", key) + 1);
}

export function dailySeed(key = todayKey()) {
  return hashString(`glydrift-daily-${key}`);
}
