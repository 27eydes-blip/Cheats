// Garage showcase for the unlockable cars: the rarity glow (soft rays in the rarity colour) and the
// spin-in, where a car drops onto the pad spinning, lands with a ring and settles into a slow turn.
// Reduce Flashing: no flash, no pulsing, the rays hold still and the car simply fades and turns in.
// Low Graphics: no sparks, no ray turning. Every sprite is cached; a frame is a handful of blits.
import { CarSprites, blitCar, drawUnderglow, glowDot, rgba } from './cars2.js';
import { makeLook, RARITY } from './looks2.js';

const TAU = Math.PI * 2;
export const SPIN_IN_S = 1.5; // the spin-in's length; after it the car idles on the turntable
export const REST_ANGLE = -0.5;

const rays = new Map();
// soft rays + halo in the rarity colour (256 px, cached per rarity)
function raySprite(rarity) {
  let cv = rays.get(rarity);
  if (cv) return cv;
  const R = RARITY[rarity] || RARITY.rare, s = 256;
  cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d'); g.translate(s / 2, s / 2);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  halo.addColorStop(0, rgba(R.glow, 0.7)); halo.addColorStop(0.3, rgba(R.glow, 0.28)); halo.addColorStop(1, rgba(R.glow, 0));
  g.fillStyle = halo; g.fillRect(-s / 2, -s / 2, s, s);
  const n = rarity === 'legendary' ? 16 : rarity === 'epic' ? 12 : 10;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, w = k & 1 ? 0.06 : 0.11, gr = g.createRadialGradient(0, 0, 8, 0, 0, s / 2);
    gr.addColorStop(0, rgba(R.light, 0.55)); gr.addColorStop(0.5, rgba(R.color, 0.22)); gr.addColorStop(1, rgba(R.color, 0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s / 2, a - w, a + w); g.closePath(); g.fill();
  }
  rays.set(rarity, cv);
  return cv;
}

// the rarity glow at the origin, radius r; steady (Reduce Flashing): fixed brightness, no turning
export function drawRarityGlow(ctx, rarity, r, t = 0, steady = false, low = false) {
  const ga = ctx.globalAlpha, a = steady ? 0.85 : 0.75 + 0.25 * Math.sin(t * 2.2), rot = steady || low ? 0 : t * 0.22;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * a;
  ctx.rotate(rot); ctx.drawImage(raySprite(rarity in RARITY ? rarity : 'rare'), -r, -r, r * 2, r * 2); ctx.rotate(-rot);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = 'source-over';
}

// a dark floor pool under the car so see-through and dark bodies stay readable over the bright rays
let shade = null;
function shadeSprite() {
  if (shade) return shade;
  shade = document.createElement('canvas'); shade.width = shade.height = 128;
  const g = shade.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(3,2,12,0.92)'); gr.addColorStop(0.55, 'rgba(3,2,12,0.75)'); gr.addColorStop(1, 'rgba(3,2,12,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return shade;
}

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
// the spin-in pose at p seconds: {scale, angle, alpha, lift, ring, flash}; pure, so tests can check it
export function spinInPose(p, steady = false) {
  if (steady) {
    const e = ease(p / 0.7);
    return { scale: 0.92 + 0.08 * e, angle: REST_ANGLE - (1 - e) * 0.6 + Math.max(0, p - SPIN_IN_S) * 0.35, alpha: e, lift: 0, ring: 0, flash: 0 };
  }
  const land = 1.05, e = ease(p / land);
  const settle = p > land ? Math.sin(Math.min(1, (p - land) / 0.35) * Math.PI) * 0.05 : 0; // a little squash on landing
  return {
    scale: (0.35 + 0.65 * e) * (1 - settle),
    angle: REST_ANGLE - (1 - e) * 3 * TAU + Math.max(0, p - SPIN_IN_S) * 0.35,
    alpha: Math.min(1, p / 0.25),
    lift: (1 - e) * 1,
    ring: p >= land && p < land + 0.6 ? (p - land) / 0.6 : 0,
    flash: p >= land && p < land + 0.18 ? 1 - (p - land) / 0.18 : 0,
  };
}

// one showcase: own sprite cache at the final size (the car scales while it spins in, the cache
// never rebuilds), pad, rays, landing ring and sparks
export class Showcase {
  constructor() { this.spr = new CarSprites(); this.px = 0; }
  // draw at the origin of ctx; size: the car length in CSS px at rest; p: seconds since the spin-in began
  draw(ctx, id, look, p, t, { size = 160, steady = false, low = false, rarity = null } = {}) {
    const L = look && typeof look === 'object' ? look : makeLook(id), m = ctx.getTransform(), k = size / 62;
    const px = Math.max(1, Math.min(4, Math.ceil(Math.hypot(m.a, m.b) * k * 2) / 2));
    if (px !== this.px) { this.px = px; this.spr.setScale(px); }
    const P = spinInPose(p, steady), R = RARITY[rarity || L.rarity] || null;
    ctx.save(); ctx.scale(k, k);
    if (R) { ctx.globalAlpha = Math.min(1, p / 0.6); drawRarityGlow(ctx, rarity || L.rarity, 70, t, steady, low); ctx.globalAlpha = 1; }
    // the pad: a neon ring on the floor in the rarity colour
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.lineWidth = 1.6; ctx.strokeStyle = R ? rgba(R.color, 0.85) : 'rgba(120,200,255,0.7)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.lineWidth = 0.7; ctx.strokeStyle = R ? rgba(R.light, 0.5) : 'rgba(200,230,255,0.4)'; ctx.stroke();
    if (P.ring > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - P.ring;
      ctx.beginPath(); ctx.arc(0, 0, 30 + P.ring * 34, 0, TAU); ctx.lineWidth = 3 * (1 - P.ring) + 0.8; ctx.strokeStyle = R ? R.light : '#ffffff'; ctx.stroke();
      if (!low) sparks(ctx, P.ring, R ? R.light : '#ffffff');
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(shadeSprite(), -46, -46, 92, 92);
    // the car: underglow on the floor, then the body lifted toward the camera while it falls
    ctx.globalAlpha = P.alpha;
    ctx.save(); ctx.rotate(P.angle); ctx.scale(P.scale, P.scale); drawUnderglow(ctx, L, t, 1 - P.lift * 0.7, steady, low); ctx.restore();
    const s = P.scale * (1 + P.lift * 0.5), spr = this.spr.get(L, P.angle);
    ctx.save(); ctx.translate(0, -P.lift * 26); ctx.rotate(P.angle - spr.ang); ctx.scale(s, s); blitCar(ctx, spr, t, steady, low); ctx.restore();
    ctx.globalAlpha = 1;
    if (P.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = P.flash * 0.8; ctx.drawImage(glowDot('#ffffff'), -60, -60, 120, 120); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    return p >= SPIN_IN_S;
  }
}
// 14 sparks flying out from the landing (positions from the ring phase: nothing allocated)
function sparks(ctx, f, c) {
  ctx.fillStyle = c;
  for (let i = 0; i < 14; i++) { const a = i * 2.39996, d = 34 + f * (40 + (i % 4) * 10), z = 2.4 * (1 - f) + 0.4; ctx.fillRect(Math.cos(a) * d - z / 2, Math.sin(a) * d - z / 2, z, z); }
}
