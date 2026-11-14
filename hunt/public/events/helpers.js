// helpers shared by event modules
export function circlesIn(sim, n, rMin, rMax, nearPlayers = true) {
  const out = [];
  const players = [...sim.players.values()].filter((p) => p.alive);
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    let x, y;
    if (nearPlayers && players.length && sim.rand() < 0.6) {
      const p = players[Math.floor(sim.rand() * players.length)];
      x = p.x + (sim.rand() - 0.5) * 700; y = p.y + (sim.rand() - 0.5) * 700;
    } else { const pt = sim.randomPoint(); x = pt.x; y = pt.y; }
    const r = rMin + sim.rand() * (rMax - rMin);
    const b = sim.bounds;
    if (x < b.x0 + r * 0.5 || y < b.y0 + r * 0.5 || x > b.x1 - r * 0.5 || y > b.y1 - r * 0.5) continue;
    if (sim.isSafe(x, y) || (sim.hub && Math.hypot(x - sim.hub.x, y - sim.hub.y) < sim.hub.r + r)) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r)) continue;
    out.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r) });
  }
  return out;
}
export const inCircles = (cs, x, y) => cs.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r);
