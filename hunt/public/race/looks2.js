// Oblivion GP unlockable cars: the looks of the 8 new cars (rare / epic / legendary), in the same
// frozen look-object shape as looks.js, plus rarity colours. Old cars are passed straight through to
// looks.js, so a caller can import makeLook / carName / lookForRacer from here for every car.
//
// The new driver ids are short and permanent (saves and the protocol will use them):
//   void VOIDRUNNER · fang SOLAR FANG · frost FROSTBYTE · grav GRAVITON
//   vx PHANTOM VX · redline REDLINE ZERO · helix HELIX · prime OBLIVION PRIME
import * as L1 from './looks.js';

export const { NEON_GLOW, glowA, PATTERNS, solidBody } = L1;

// rarity: tag colour, a lighter tint for text and a glow colour (garage cards, unlock screen)
export const RARITY = {
  rare: { name: 'RARE', color: '#3a8bff', light: '#a9cdff', glow: '#3a8bff' },
  epic: { name: 'EPIC', color: '#b04dff', light: '#e2bcff', glow: '#a640ff' },
  legendary: { name: 'LEGENDARY', color: '#ffc23a', light: '#fff0b8', glow: '#ffb020' },
};
export const RARITY_IDS = Object.keys(RARITY);

// fx: the car's special animated part (cars2.js draws it from cached sprites)
//   voidslits | sunfire | frost | ring | ghost | stripes | core | galaxy
// voice: the engine voice in sound2.js
export const BASE_LOOKS2 = {
  void: { name: 'VOIDRUNNER', rarity: 'rare', neon: '#8a3dff', neon2: '#dcbcff', body: '#07040f', fx: 'voidslits', voice: 'void', glow: { color: '#7a2cff', style: 'void' }, wheel: { rim: '#b07bff', spokes: 4 }, flame: { core: '#f2e6ff', outer: '#7a2cff' }, trail: { color: '#9b5cff', style: 'void' } },
  fang: { name: 'SOLAR FANG', rarity: 'rare', neon: '#ff8c14', neon2: '#ffe27a', body: '#1c0d03', fx: 'sunfire', voice: 'fang', glow: { color: '#ff8a10', style: 'pool' }, wheel: { rim: '#ffc04a', spokes: 6 }, flame: { core: '#fff6c8', outer: '#ff5a00' }, trail: { color: '#ffa424', style: 'flame' } },
  frost: { name: 'FROSTBYTE', rarity: 'rare', neon: '#56d6ff', neon2: '#eafcff', body: '#061420', fx: 'frost', voice: 'frost', glow: { color: '#7fe6ff', style: 'frost' }, wheel: { rim: '#bff2ff', spokes: 6 }, flame: { core: '#ffffff', outer: '#46c8ff' }, trail: { color: '#a8f0ff', style: 'crystal' } },
  grav: { name: 'GRAVITON', rarity: 'epic', neon: '#2bffb0', neon2: '#d0fff0', body: '#06110f', fx: 'ring', voice: 'grav', glow: { color: '#2bffb0', style: 'hover' }, wheel: { rim: '#2bffb0', spokes: 2 }, flame: { core: '#eafff8', outer: '#20e8a0' }, trail: { color: '#4affc4', style: 'ring' } },
  vx: { name: 'PHANTOM VX', rarity: 'epic', neon: '#a9b6ff', neon2: '#ffffff', body: '#0c1030', fx: 'ghost', voice: 'vx', glow: { color: '#8f9fff', style: 'ghost' }, wheel: { rim: '#d6dcff', spokes: 3 }, flame: { core: '#ffffff', outer: '#8f9fff' }, trail: { color: '#c4ccff', style: 'ghost' } },
  redline: { name: 'REDLINE ZERO', rarity: 'epic', neon: '#ff2438', neon2: '#ffffff', body: '#2a050b', fx: 'stripes', voice: 'redline', glow: { color: '#ff2038', style: 'streak' }, wheel: { rim: '#ff6a78', spokes: 5 }, flame: { core: '#ffffff', outer: '#ff2a3a' }, trail: { color: '#ff3a4a', style: 'streak' } },
  helix: { name: 'HELIX', rarity: 'legendary', neon: '#ff4fd8', neon2: '#46f4ff', body: '#0d0618', fx: 'core', voice: 'helix', glow: { color: '#c04dff', style: 'twin' }, wheel: { rim: '#ffffff', spokes: 4 }, flame: { core: '#ffffff', outer: '#ff4fd8' }, trail: { color: '#ff6ae0', style: 'helix' } },
  prime: { name: 'OBLIVION PRIME', rarity: 'legendary', neon: '#e6e2ff', neon2: '#ff5ad1', body: '#050507', fx: 'galaxy', voice: 'prime', glow: { color: '#9a5cff', style: 'blackhole' }, wheel: { rim: '#ffd36a', spokes: 5 }, flame: { core: '#ffffff', outer: '#9a5cff' }, trail: { color: '#b98cff', style: 'galaxy' } },
};
export const NEW_CAR_IDS = Object.keys(BASE_LOOKS2);
export const isNewCar = (id) => Object.prototype.hasOwnProperty.call(BASE_LOOKS2, id);
// every look, old and new (the old six first, in their usual order)
export const ALL_LOOKS = Object.freeze({ ...L1.BASE_LOOKS, ...BASE_LOOKS2 });
// BASE_LOOKS: same name as looks.js, every car (so a caller can swap the import)
export const BASE_LOOKS = ALL_LOOKS;
export const LOOK_IDS = Object.keys(ALL_LOOKS);

export const GLOW_STYLES = ['pool', 'mist', 'twin', 'void', 'frost', 'hover', 'ghost', 'streak', 'blackhole'];
export const TRAIL_STYLES = ['line', 'ribbon', 'sparks', 'void', 'flame', 'crystal', 'ring', 'ghost', 'streak', 'helix', 'galaxy'];

export function carName(id) {
  return isNewCar(id) ? BASE_LOOKS2[id].name : L1.carName(id);
}
// the rarity id of a car (null for the six starter cars)
export const rarityOf = (id) => (isNewCar(id) ? BASE_LOOKS2[id].rarity : null);

const HEX = /^#[0-9a-f]{6}$/i;
const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const obj = (o) => (o && typeof o === 'object' ? o : null);

const memo = new Map();
// makeLook(id, {skin, glow, wheel, flame, trail}): looks.js rules for the old six; for the new
// cars the same fields plus rarity, fx and voice. Frozen and memoised (one look = one sprite key).
export function makeLook(driverId, opts = null) {
  if (!isNewCar(driverId)) return L1.makeLook(driverId, opts);
  const id = driverId, B = BASE_LOOKS2[id], o = obj(opts) || {};
  const skin = obj(o.skin) || {}, glow = obj(o.glow) || {}, wheel = obj(o.wheel) || {}, flame = obj(o.flame) || {}, trail = obj(o.trail) || {};
  const own = col(skin.neon, null), neon = own || B.neon;
  const L = {
    driver: id, name: B.name, rarity: B.rarity, fx: B.fx, voice: B.voice,
    neon, neon2: col(skin.neon2, own ? '#ffffff' : B.neon2), body: L1.solidBody(col(skin.body, B.body), neon),
    pattern: 'none', // the new cars animate their own fx layers instead of skin patterns
    glow: col(glow.color, own || B.glow.color), glowStyle: pick(glow.style, GLOW_STYLES, B.glow.style),
    rim: col(wheel.rim, B.wheel.rim), spokes: Math.max(2, Math.min(8, (wheel.spokes | 0) || B.wheel.spokes)),
    flame: { core: col(flame.core, B.flame.core), outer: col(flame.outer, B.flame.outer) },
    trail: { color: col(trail.color, B.trail.color), style: pick(trail.style, TRAIL_STYLES, B.trail.style) },
  };
  L.sprite = `${id}|${L.neon}|${L.neon2}|${L.body}|${L.rim}|${L.spokes}|${L.pattern}`;
  L.id = `${L.sprite}|${L.glow}|${L.glowStyle}|${L.flame.core}|${L.flame.outer}|${L.trail.color}|${L.trail.style}`;
  const hit = memo.get(L.id);
  if (hit) return hit;
  Object.freeze(L.flame); Object.freeze(L.trail); Object.freeze(L);
  if (memo.size > 256) memo.clear();
  memo.set(L.id, L);
  return L;
}

// equipped cosmetics: the same resolver looks.js uses (registered once for both)
let cosResolver = null;
export function setCosResolver(fn) { cosResolver = typeof fn === 'function' ? fn : null; L1.setCosResolver(fn); }
export function lookForRacer(rd) {
  const d = rd && rd.driver;
  if (!isNewCar(d)) return L1.lookForRacer(rd);
  let opts = null;
  if (rd.cos && cosResolver) { try { opts = cosResolver(rd.cos, d); } catch { opts = null; } }
  return makeLook(d, opts);
}

export { drawCarPreview } from './cars2.js';
