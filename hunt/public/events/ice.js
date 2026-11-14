import { circlesIn } from './helpers.js';
export default {
  id: 'ice', layer: 'ground', name: 'FLASH FREEZE', desc: 'Ice patches — slippery!', color: '#8ee8ff', duration: 18,
  prepare(sim) { return { ice: circlesIn(sim, sim.areaScale(5), 170, 260) }; },
  mods: (p) => ({ ice: p.ice }),
  draw(ctx, p, phase, t, R) { for (const c of p.ice) R.pool(c, phase, t, 'ice'); },
};
