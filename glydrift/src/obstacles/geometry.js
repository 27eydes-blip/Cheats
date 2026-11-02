// Signed clearance helpers: distance from the player's circle edge to a shape (negative = hit).

export function rectClear(px, py, r, x0, y0, x1, y1) {
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
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) - thickness - r;
}

export function circleClear(px, py, r, cx, cy, R) {
  return Math.hypot(px - cx, py - cy) - R - r;
}
