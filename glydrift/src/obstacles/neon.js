// Vector neon drawing helpers for hazards: crisp at any pixel ratio (Graphics are
// tessellated at render resolution), thick saturated outline + soft outer glow + white core.

/** Run `draw(g)` several times with stacked line styles to get a glowing neon stroke. */
export function glowStroke(g, color, width, draw, { core = true } = {}) {
  g.lineStyle(width * 3.2, color, 0.1);
  draw(g);
  g.lineStyle(width * 1.8, color, 0.3);
  draw(g);
  g.lineStyle(width, color, 1);
  draw(g);
  if (core) {
    g.lineStyle(Math.max(1.5, width * 0.32), 0xffffff, 0.9);
    draw(g);
  }
}

/** Dark body + tinted inner glow for a polygon. */
export function neonPoly(
  g,
  pts,
  color,
  width = 5,
  { fill = 0x14030a, fillAlpha = 0.92, inner = 0.16 } = {},
) {
  g.fillStyle(fill, fillAlpha);
  g.fillPoints(pts, true);
  g.fillStyle(color, inner);
  g.fillPoints(pts, true);
  glowStroke(g, color, width, (gg) => gg.strokePoints(pts, true, true));
}

export function neonCircle(
  g,
  x,
  y,
  r,
  color,
  width = 4,
  { fill = 0x14030a, fillAlpha = 0.92, inner = 0.16 } = {},
) {
  if (fillAlpha > 0) {
    g.fillStyle(fill, fillAlpha);
    g.fillCircle(x, y, r);
    g.fillStyle(color, inner);
    g.fillCircle(x, y, r);
  }
  glowStroke(g, color, width, (gg) => gg.strokeCircle(x, y, r));
}

export function neonRect(g, x, y, w, h, color, width = 5, opts = {}) {
  neonPoly(
    g,
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    color,
    width,
    opts,
  );
}

/** Diagonal warning stripes inside a rectangle. */
export function hazardStripes(g, x, y, w, h, color, alpha = 0.85) {
  g.fillStyle(color, alpha);
  const step = 22;
  for (let sx = x - h; sx < x + w; sx += step) {
    // parallelogram clamped to the rect (ends are slightly sheared, reads as tape)
    const a = { x: Math.max(x, Math.min(x + w, sx)), y: y + h };
    const b = { x: Math.max(x, Math.min(x + w, sx + 11)), y: y + h };
    const c = { x: Math.max(x, Math.min(x + w, sx + 11 + h)), y };
    const d = { x: Math.max(x, Math.min(x + w, sx + h)), y };
    if (c.x - a.x > 1) g.fillPoints([a, b, c, d], true);
  }
}
