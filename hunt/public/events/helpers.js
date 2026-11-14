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
    const m = r + 60; // whole pool inside the playable area (outer walls are 50px)
    if (x < b.x0 + m || y < b.y0 + m || x > b.x1 - m || y > b.y1 - m) continue;
    if (sim.isSafe(x, y) || (sim.hub && Math.hypot(x - sim.hub.x, y - sim.hub.y) < sim.hub.r + r)) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r)) continue;
    out.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r) });
  }
  return out;
}
export const inCircles = (cs, x, y) => cs.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r);
