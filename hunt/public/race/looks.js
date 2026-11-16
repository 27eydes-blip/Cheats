// Hunt Racers car looks: the neon night-tuner style of each car, and the cosmetic overrides
// (skin, underglow, wheels, boost flame, boost trail) layered on top. Every renderer (race, lobby,
// store preview) draws from a frozen look object made here, so one look = one sprite cache key.
//
// Internal driver ids (volt brick wisp dune rook flicker) never change: saves, stats, weapons,
// hitboxes and the protocol keep using them. Only the display name and the look live here.

// one signature neon colour per car, so they are easy to tell apart in a pack
export const BASE_LOOKS = {
  volt: { name: 'ARCWIRE', neon: '#2f8dff', neon2: '#b8e4ff', body: '#0b1426', pattern: 'none', glow: { color: '#2f8dff', style: 'pool' }, wheel: { rim: '#6fc4ff', spokes: 5 }, flame: { core: '#e8f6ff', outer: '#2f8dff' }, trail: { color: '#4fa8ff', style: 'line' } },
  brick: { name: 'WARHOG', neon: '#ff7a1a', neon2: '#ffd28a', body: '#1a110b', pattern: 'none', glow: { color: '#ff7a1a', style: 'pool' }, wheel: { rim: '#ffa04a', spokes: 6 }, flame: { core: '#fff0b0', outer: '#ff6a10' }, trail: { color: '#ff8a2a', style: 'ribbon' } },
  wisp: { name: 'PHANTOM', neon: '#8ff8ff', neon2: '#ffffff', body: '#0a1418', pattern: 'none', glow: { color: '#7ff4ff', style: 'mist' }, wheel: { rim: '#d8fdff', spokes: 3 }, flame: { core: '#ffffff', outer: '#5fe8ff' }, trail: { color: '#aef9ff', style: 'line' } },
  dune: { name: 'SANDVIPER', neon: '#b8f03a', neon2: '#ffd23f', body: '#11160a', pattern: 'none', glow: { color: '#b8f03a', style: 'pool' }, wheel: { rim: '#ffd23f', spokes: 4 }, flame: { core: '#fff6b0', outer: '#9be02a' }, trail: { color: '#c8f04a', style: 'sparks' } },
  rook: { name: 'COBRA', neon: '#b04dff', neon2: '#e8c4ff', body: '#140b20', pattern: 'none', glow: { color: '#a040ff', style: 'pool' }, wheel: { rim: '#d29aff', spokes: 5 }, flame: { core: '#f6e0ff', outer: '#a040ff' }, trail: { color: '#b45cff', style: 'ribbon' } },
  flicker: { name: 'RAZOR', neon: '#ff2fa0', neon2: '#ffc4e8', body: '#1a0913', pattern: 'none', glow: { color: '#ff2fa0', style: 'twin' }, wheel: { rim: '#ff8acb', spokes: 3 }, flame: { core: '#fff0f8', outer: '#ff2fa0' }, trail: { color: '#ff4fb4', style: 'line' } },
};
export const LOOK_IDS = Object.keys(BASE_LOOKS);
export const PATTERNS = ['none', 'pulse', 'scales', 'circuit', 'flow'];
const GLOW_STYLES = ['pool', 'mist', 'twin'];
const TRAIL_STYLES = ['line', 'ribbon', 'sparks'];

// the car's display name (ARCWIRE, WARHOG, ...) for a driver id
export function carName(id) {
  return (BASE_LOOKS[id] || BASE_LOOKS.volt).name;
}

const HEX = /^#[0-9a-f]{6}$/i;
const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const obj = (o) => (o && typeof o === 'object' ? o : null);

// Looks are memoised by their key, so the same cosmetics always give the same object (renderers
// cache sprites per look.id and never rebuild for an equal look).
const memo = new Map();
// makeLook('volt', {skin, glow, wheel, flame, trail}): each option is a plain object from the
// cosmetic catalog or null for the car's default. Unknown fields and bad colours are ignored.
export function makeLook(driverId, opts = null) {
  const id = BASE_LOOKS[driverId] ? driverId : 'volt', B = BASE_LOOKS[id], o = obj(opts) || {};
  const skin = obj(o.skin) || {}, glow = obj(o.glow) || {}, wheel = obj(o.wheel) || {}, flame = obj(o.flame) || {}, trail = obj(o.trail) || {};
  const own = col(skin.neon, null), neon = own || B.neon; // a valid skin colour also tints neon2 and the glow
  const L = {
    driver: id, name: B.name,
    neon, neon2: col(skin.neon2, own ? '#ffffff' : B.neon2), body: col(skin.body, B.body),
    pattern: pick(skin.pattern, PATTERNS, B.pattern),
    glow: col(glow.color, own || B.glow.color), glowStyle: pick(glow.style, GLOW_STYLES, B.glow.style),
    rim: col(wheel.rim, B.wheel.rim), spokes: Math.max(2, Math.min(8, (wheel.spokes | 0) || B.wheel.spokes)),
    flame: { core: col(flame.core, B.flame.core), outer: col(flame.outer, B.flame.outer) },
    trail: { color: col(trail.color, B.trail.color), style: pick(trail.style, TRAIL_STYLES, B.trail.style) },
  };
  // sprite key: everything the car sprite depends on (glow / flame / trail are drawn live)
  L.sprite = `${id}|${L.neon}|${L.neon2}|${L.body}|${L.rim}|${L.spokes}|${L.pattern}`;
  L.id = `${L.sprite}|${L.glow}|${L.glowStyle}|${L.flame.core}|${L.flame.outer}|${L.trail.color}|${L.trail.style}`;
  const hit = memo.get(L.id);
  if (hit) return hit;
  Object.freeze(L.flame); Object.freeze(L.trail); Object.freeze(L);
  if (memo.size > 256) memo.clear();
  memo.set(L.id, L);
  return L;
}

// The store registers how equipped cosmetic ids become makeLook options (garage.js: resolveCos).
let cosResolver = null;
export function setCosResolver(fn) { cosResolver = typeof fn === 'function' ? fn : null; }
// the look for a race roster entry {driver, cos?}: cos = the racer's equipped cosmetic ids
export function lookForRacer(rd) {
  const d = rd && rd.driver;
  let opts = null;
  if (rd && rd.cos && cosResolver) { try { opts = cosResolver(rd.cos, d); } catch { opts = null; } }
  return makeLook(d, opts);
}
