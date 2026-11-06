// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// YARMS — two hugely muscular arms joined at the shoulders. No body, no head. Original art.
// 48x32 (wider than the 24x24 heroes so the flex reads). Four poses:
//   0 glide (arms out, hands open)   1 glide, fingers fluttered
//   2 the flop stroke (arms slammed down)   3 double-bicep flex (fists up)
import { PixelCanvas } from "./px.js";

const SKIN = 0xf0a070; // warm skin
const HI = 0xffd2a0; // highlight
const HI2 = 0xfff0d8; // specular pop on the peaks
const SH = 0xc06a3e; // shade
const DEEP = 0x8a4228; // deepest shade / creases
const VEIN = 0xa8543a;
const GOLD = 0xffd23f; // Legendary sweatbands
const GOLD_D = 0xc8901a;

const rad = (d) => (d * Math.PI) / 180;

/** A thick limb segment (capsule) a → b with radius r. */
function capsule(pc, ax, ay, bx, by, r, c) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pc.circle(ax + (bx - ax) * t, ay + (by - ay) * t, r, c);
  }
}

/** One arm: upper arm then forearm then hand. side = -1 (left) / +1 (right). */
const CX = 24; // centre of the shoulders on the 48x32 canvas
const CY = 12;

function arm(pc, side, upperDeg, foreDeg, hand) {
  const sx = CX + side * 2.6;
  const sy = CY;
  const U = 7;
  const F = 6.4;
  // angles measured from "straight out" on that side; positive = downwards
  const ua = rad(upperDeg);
  const ex = sx + side * Math.cos(ua) * U;
  const ey = sy + Math.sin(ua) * U;
  const fa = rad(foreDeg);
  const wx = ex + side * Math.cos(fa) * F;
  const wy = ey + Math.sin(fa) * F;

  // shadow pass, base, then the bulging muscles with highlights
  capsule(pc, sx, sy + 0.6, ex, ey + 0.6, 2.5, SH);
  capsule(pc, ex, ey + 0.5, wx, wy + 0.5, 1.8, SH);
  capsule(pc, sx, sy, ex, ey, 2.3, SKIN);
  capsule(pc, ex, ey, wx, wy, 1.6, SKIN);
  // biceps peak (on top of the upper arm) and triceps (under it)
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const nx = Math.sin(ua) * side; // normal pointing "up" from the upper arm
  const ny = -Math.cos(ua);
  pc.circle(mx + nx * 1.5, my + ny * 1.5, 2.3, SKIN); // the biceps peak
  pc.circle(mx + nx * 2.0 - side * 0.3, my + ny * 2.0, 1.1, HI);
  pc.set(Math.round(mx + nx * 2.6), Math.round(my + ny * 2.6), HI2);
  pc.circle(mx - nx * 1.3, my - ny * 1.3, 1.5, SKIN); // triceps
  pc.set(Math.round(mx - nx * 2.2), Math.round(my - ny * 2.2), SH);
  pc.set(Math.round(mx - nx * 0.3), Math.round(my - ny * 0.3), DEEP); // the split
  // forearm: highlight ridge + veins
  const fmx = (ex + wx) / 2;
  const fmy = (ey + wy) / 2;
  pc.set(Math.round(fmx - Math.sin(fa) * side * 1.2), Math.round(fmy - Math.cos(fa) * 1.2), HI);
  pc.set(Math.round(fmx), Math.round(fmy), VEIN);
  pc.set(
    Math.round(fmx + side * Math.cos(fa) * 1.2),
    Math.round(fmy + Math.sin(fa) * 1.2 + 1),
    VEIN,
  );
  pc.set(Math.round(fmx - side * Math.cos(fa)), Math.round(fmy - Math.sin(fa) - 1), VEIN);
  // elbow crease
  pc.set(Math.round(ex), Math.round(ey + 1), DEEP);
  // gold sweatband at the wrist
  const bx = ex + side * Math.cos(fa) * (F - 0.8);
  const by = ey + Math.sin(fa) * (F - 0.8);
  capsule(pc, bx - side * Math.cos(fa) * 0.6, by - Math.sin(fa) * 0.6, bx, by, 1.9, GOLD);
  pc.set(Math.round(bx), Math.round(by + 1.5), GOLD_D);
  pc.set(Math.round(bx), Math.round(by - 1.5), 0xfff6c0);
  // the hand
  const hx = wx + side * Math.cos(fa) * 1.6;
  const hy = wy + Math.sin(fa) * 1.6;
  if (hand === "fist") {
    pc.circle(hx, hy, 2.2, SKIN);
    pc.set(Math.round(hx - side), Math.round(hy - 1), HI);
    pc.hline(Math.round(hx - 1), Math.round(hx + 1), Math.round(hy + 1), SH); // knuckles
  } else {
    pc.circle(hx, hy, 2.2, SKIN);
    pc.set(Math.round(hx), Math.round(hy), HI);
    // four fingers fanned out along the forearm direction, plus a thumb
    const spread = hand === "flutter" ? [-54, -18, 18, 54] : [-42, -14, 14, 42];
    spread.forEach((d, i) => {
      const a = fa + rad(d);
      const L = 3.2 + (i === 1 || i === 2 ? 0.8 : 0) + (hand === "flutter" && i % 2 ? -1 : 0);
      for (let k = 1; k <= L; k++) {
        pc.set(
          Math.round(hx + side * Math.cos(a) * (1.8 + k)),
          Math.round(hy + Math.sin(a) * (1.8 + k)),
          k === Math.floor(L) ? HI : SKIN,
        );
      }
    });
    const ta = fa - rad(80);
    for (let k = 2; k <= 3; k++)
      pc.set(Math.round(hx + side * Math.cos(ta) * k), Math.round(hy + Math.sin(ta) * k), SKIN);
  }
}

const POSES = [
  { u: -28, f: 30, hand: "open" }, // 0 glide: elbows up, hands hanging out wide
  { u: -32, f: 20, hand: "flutter" }, // 1 glide, fingers fluttering
  { u: 46, f: 72, hand: "open" }, // 2 the flop stroke — hands slammed down
  { u: -6, f: -98, hand: "fist" }, // 3 double-bicep flex
];

export function yarms(f) {
  const pc = new PixelCanvas(48, 32);
  const p = POSES[f];
  // shoulders: a rounded yoke where the arms meet (no body, no head)
  pc.ellipse(CX, CY + 0.5, 4.2, 2.9, SH);
  pc.ellipse(CX, CY, 3.9, 2.6, SKIN);
  arm(pc, -1, p.u, p.f, p.hand);
  arm(pc, 1, p.u, p.f, p.hand);
  // deltoid highlights + the cleft between the shoulders
  pc.set(CX - 3, CY - 2, HI)
    .set(CX + 3, CY - 2, HI)
    .set(CX - 2, CY - 2, HI2)
    .set(CX + 2, CY - 2, HI2);
  pc.vline(CX, CY - 1, CY + 2, DEEP);
  return pc.outline(0x2a1206, 1, true);
}
