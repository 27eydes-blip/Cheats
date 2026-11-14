import { circlesIn, inCircles } from './helpers.js';
export default {
  id: 'lava', layer: 'ground', name: 'LAVA FLOW', desc: 'Lava pools are erupting!', color: '#ff4d2e', duration: 15,
  prepare(sim) { return { pools: circlesIn(sim, sim.areaScale(4), 110, 180) }; },
  tick(sim, p, dt) {
    for (const pl of sim.players.values()) if (pl.alive && inCircles(p.pools, pl.x, pl.y)) sim.hazard(pl, 'lava', 900 * dt);
  },
  draw(ctx, p, phase, t, R) { for (const c of p.pools) R.pool(c, phase, t, 'lava'); },
};
