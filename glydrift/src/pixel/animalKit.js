// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Drawing helpers shared by the animal hero sprites.

// ------------------------------------------------------------------ shared drawing helpers
/** Bright eye with a highlight (2x2). */
export function eye(pc, x, y, iris = 0x1a0636) {
  pc.rect(x, y, 2, 2, iris).set(x, y, 0xffffff);
  return pc;
}
/** A sleepy / content closed eye. */
export function shut(pc, x, y, c = 0x2a1a10) {
  pc.hline(x, x + 1, y, c);
  return pc;
}
/** Darken the lower-right edge of a body colour for volume. */
export function shadeEdges(pc, col, dark) {
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++)
      if (pc.get(x, y) === col && (pc.get(x, y + 1) === null || pc.get(x + 1, y + 1) === null))
        pc.set(x, y, dark);
  return pc;
}
/** Lighten the upper-left edge of a body colour. */
export function lightEdges(pc, col, light) {
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++)
      if (pc.get(x, y) === col && (pc.get(x, y - 1) === null || pc.get(x - 1, y) === null))
        pc.set(x, y, light);
  return pc;
}
/** Three-pose bird/bat wing hinged at (hx, hy): 0 up, 1 level, 2 down. */
export function wing(pc, pose, hx, hy, col, tip, span = 1) {
  const s = span;
  const poses = [
    [
      [hx, hy],
      [hx - 5 * s, hy - 8 * s],
      [hx - 1, hy - 5 * s],
      [hx + 2, hy - 9 * s],
      [hx + 4, hy - 1],
    ],
    [
      [hx, hy],
      [hx - 8 * s, hy - 3 * s],
      [hx - 5 * s, hy - 1],
      [hx - 7 * s, hy + 1],
      [hx + 4, hy + 1],
    ],
    [
      [hx, hy + 1],
      [hx - 5 * s, hy + 7 * s],
      [hx - 1, hy + 5 * s],
      [hx + 2, hy + 8 * s],
      [hx + 4, hy + 2],
    ],
  ];
  pc.poly(poses[pose], col);
  if (tip !== undefined) {
    const p = poses[pose][1];
    pc.set(p[0] + (pose === 1 ? 1 : 0), p[1] + (pose === 0 ? 1 : pose === 2 ? -1 : 0), tip);
  }
  return pc;
}
/** Finish a sprite: shade + bold dark outline (diagonal corners filled). */
export function finish(pc, outline) {
  return pc.outline(outline, 1, true);
}
/** A thick rounded limb from (x0, y0) to (x1, y1). */
export function limb(pc, x0, y0, x1, y1, r, col) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pc.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, col);
  }
  return pc;
}
