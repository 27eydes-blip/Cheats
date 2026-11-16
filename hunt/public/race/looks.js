// Car looks for the neon night-tuner style: each car's display name, signature neon colour and
// default underglow / rims / boost flame / trail, and makeLook() which merges store cosmetics on
// top. Every car drawing (race, lobby, store) draws from a look object. Internal driver ids
// (volt brick wisp dune rook flicker) never change: saves, stats and the protocol use them.
import { drawCar } from './cars.js';

export const BASE_LOOKS = {
  volt: { name: 'ARCWIRE', neon: '#2f9bff', neon2: '#bfe6ff', body: '#0d1426', glowStyle: 'pool' },
  brick: { name: 'WARHOG', neon: '#ff7a1a', neon2: '#ffd08a', body: '#1a120c', glowStyle: 'pool' },
  wisp: { name: 'PHANTOM', neon: '#9ffcff', neon2: '#ffffff', body: '#0c1418', glowStyle: 'mist' },
  dune: { name: 'SANDVIPER', neon: '#b6e62e', neon2: '#ffd23f', body: '#121608', glowStyle: 'pool' },
  rook: { name: 'COBRA', neon: '#a64dff', neon2: '#e0b3ff', body: '#120c1c', glowStyle: 'pool' },
  flicker: { name: 'RAZOR', neon: '#ff3fa4', neon2: '#ffc2e2', body: '#1a0a14', glowStyle: 'pool' },
};
export const carName = (id) => (BASE_LOOKS[id] || BASE_LOOKS.volt).name;

// opts = {skin, glow, wheel, flame, trail}: plain option objects or null (null = the car's default)
export function makeLook(driverId, opts = {}) {
  const B = BASE_LOOKS[driverId] || BASE_LOOKS.volt, o = opts || {};
  const sk = o.skin || {}, gl = o.glow || {}, wh = o.wheel || {}, fl = o.flame || {}, tr = o.trail || {};
  const neon = sk.neon || B.neon;
  const look = {
    name: B.name, neon, neon2: sk.neon2 || (sk.neon ? '#ffffff' : B.neon2), body: sk.body || B.body, pattern: sk.pattern || 'none',
    glow: gl.color || neon, glowStyle: gl.style || B.glowStyle, rim: wh.rim || B.neon2, spokes: wh.spokes || 5,
    flame: { core: fl.core || '#fff3c4', outer: fl.outer || neon }, trail: tr.color || neon, trailStyle: tr.style || 'line',
  };
  look.id = [driverId, look.neon, look.neon2, look.body, look.pattern, look.glow, look.glowStyle, look.rim, look.spokes, look.flame.core, look.flame.outer, look.trail, look.trailStyle].join('|');
  Object.freeze(look.flame);
  return Object.freeze(look);
}

// a car for menus at the origin, nose along `angle`: the current car art with a neon glow in the
// look's colour (animated skins breathe with time t)
export function drawCarPreview(ctx, driverId, look, angle = 0, t = 0) {
  const L = look || makeLook(driverId);
  ctx.save();
  ctx.rotate(angle);
  ctx.shadowColor = L.neon;
  ctx.shadowBlur = L.pattern === 'none' ? 12 : 10 + 8 * (0.5 + 0.5 * Math.sin(t * 3));
  drawCar(ctx, driverId);
  ctx.restore();
}
