// Rarity + scoring rules. Shared by the Worker and the browser.

export const PROMPTS_PER_DAY = 7;
export const SECONDS_PER_PROMPT = 25;
export const MAX_POINTS = 100;
export const LAUNCH_DATE = '2026-11-15'; // Day #1

// How many "virtual players" the seeded estimates are worth. Real answers gradually outvote them,
// so Day 1 plays on estimates and the numbers turn real as players come in.
export const SEED_WEIGHT = 100;

// share (0..1) of players who gave this answer, blending seed estimates with real counts.
export function blendedShare({ est, estTotal, count, total }) {
  const seed = estTotal > 0 ? est / estTotal : 0;
  // Estimates are written as "% of players", but lists don't always sum to 100: the remainder is spread
  // across answers nobody listed. Normalise only if the list claims more than 100%.
  const seedShare = estTotal > 100 ? seed : est / 100;
  return (SEED_WEIGHT * seedShare + count) / (SEED_WEIGHT + total);
}

// 0% -> 100 pts, 1% -> 83, 3% -> 66, 7% -> 49, 15% -> 32, 31% -> 15. Valid answers always earn at least 5.
export function pointsForShare(share) {
  const pct = Math.max(0, share * 100);
  return Math.max(5, Math.min(MAX_POINTS, Math.round(100 - 17 * Math.log2(1 + pct))));
}

export const TIERS = [
  { id: 'legendary', min: 90, label: 'Legendary', emoji: '🌟', color: '#f5c542' },
  { id: 'rare', min: 75, label: 'Rare', emoji: '🟪', color: '#b48cff' },
  { id: 'uncommon', min: 50, label: 'Uncommon', emoji: '🟦', color: '#6cc3ff' },
  { id: 'common', min: 1, label: 'Common', emoji: '🟩', color: '#9ee0a6' },
  { id: 'miss', min: 0, label: 'Lost in the clouds', emoji: '☁️', color: '#9aa7bd' },
];

export function tierFor(points) {
  return TIERS.find((t) => points >= t.min) || TIERS[TIERS.length - 1];
}

// Sky layers the glider climbs through over a day (0-700 points).
export const LAYERS = [
  { id: 'meadows', name: 'Cloud Meadows', from: 0 },
  { id: 'reefs', name: 'Storm Reefs', from: 175 },
  { id: 'aurora', name: 'Aurora Peaks', from: 350 },
  { id: 'harbor', name: 'Star Harbor', from: 525 },
];

export function layerFor(points) {
  let l = LAYERS[0];
  for (const x of LAYERS) if (points >= x.from) l = x;
  return l;
}

export const LANDMARKS = [
  { at: 40, name: 'The Lost Balloon Graveyard', icon: '🎈' },
  { at: 95, name: 'Highest kite ever flown', icon: '🪁' },
  { at: 150, name: 'The Dandelion Ferry', icon: '🌼' },
  { at: 210, name: 'The Lightning Bakery', icon: '⚡' },
  { at: 270, name: 'Where the sky whales sleep', icon: '🐋' },
  { at: 330, name: 'The Thundercloud Choir', icon: '🎶' },
  { at: 400, name: 'Aurora laundry lines', icon: '🧣' },
  { at: 460, name: 'The upside-down waterfall', icon: '💧' },
  { at: 520, name: 'The Moon’s spare keys', icon: '🗝️' },
  { at: 590, name: 'Lighthouse of Lost Wishes', icon: '🏮' },
  { at: 650, name: 'The Comet Car Wash', icon: '☄️' },
  { at: 700, name: 'The Edge of Everything', icon: '✨' },
];

export const FEET_PER_POINT = 10;

export function dayNumber(date) {
  const ms = Date.parse(date + 'T00:00:00Z') - Date.parse(LAUNCH_DATE + 'T00:00:00Z');
  return Math.floor(ms / 86400000) + 1;
}

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
