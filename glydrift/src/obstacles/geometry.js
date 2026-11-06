// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Signed clearance helpers: distance from the player's circle edge to a shape (negative = hit).
//
// Every hazard's hitbox is a little smaller than what is drawn (HAZARD.hitbox, ~12%), applied
// here so it is the same for every hazard and every hero: circles and beams use 88% of their
// radius / thickness, rectangles are inset by 12% of their smaller half-size on each side.
import { HAZARD } from "../tuning.js";

const K = HAZARD.hitbox;

export function rectClear(px, py, r, x0, y0, x1, y1) {
  const inset = (Math.min(x1 - x0, y1 - y0) / 2) * (1 - K);
  x0 += inset;
  x1 -= inset;
  y0 += inset;
  y1 -= inset;
  const dx = Math.max(x0 - px, 0, px - x1);
  const dy = Math.max(y0 - py, 0, py - y1);
  if (dx === 0 && dy === 0) return -Math.min(px - x0, x1 - px, py - y0, y1 - py) - r;
  return Math.hypot(dx, dy) - r;
}

export function segClear(px, py, r, ax, ay, bx, by, thickness) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) - thickness * K - r;
}

export function circleClear(px, py, r, cx, cy, R) {
  return Math.hypot(px - cx, py - cy) - R * K - r;
}
