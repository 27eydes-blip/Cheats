import { TILE, CRATE } from '../shared.js';
// A marked supply crate drops from the sky. Break it for 3 power cubes.
export default {
  id: 'supply', name: 'SUPPLY DROP', desc: 'Supplies incoming — grab the crate!', color: '#ffd23f', duration: 6,
  prepare(sim) {
    for (let i = 0; i < 50; i++) {
      const pt = sim.randomPoint(160);
      const idx = Math.floor(pt.y / TILE) * sim.map.gw + Math.floor(pt.x / TILE);
      if (sim.map.t[idx] === 0 && !sim.tileOccupied(idx) && !sim.isSafe(pt.x, pt.y)) return { idx, x: (idx % sim.map.gw) * TILE + TILE / 2, y: Math.floor(idx / sim.map.gw) * TILE + TILE / 2 };
    }
    return {};
  },
  start(sim, p) {
    if (p.idx == null) return;
    if (sim.tileOccupied(p.idx)) return;
    sim.addCrate(p.idx, true);
    sim.fx.push(['slam', p.x, p.y, 120, 0]);
  },
  draw(ctx, p, phase, t, R) { if (phase === 'warn' && p.x) R.target(p.x, p.y, t); },
};
