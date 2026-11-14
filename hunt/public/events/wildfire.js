import { BUSH, EMPTY, TILE } from '../shared.js';
// Bushes catch fire (warning shows which), burn for a few seconds hurting anyone inside, then turn to ash.
export default {
  id: 'wildfire', name: 'WILDFIRE', desc: 'Get out of the bushes!', color: '#ff6b2b', duration: 14,
  prepare(sim) {
    const bushes = sim.tilesInBounds(BUSH, true);
    const burn = bushes.filter(() => sim.rand() < 0.45);
    return { burn };
  },
  start(sim, p) { p.burnT = 0; },
  tick(sim, p, dt) {
    p.burnT = (p.burnT || 0) + dt;
    if (p.burnT < 4) {
      const set = new Set(p.burn);
      for (const pl of sim.players.values()) {
        if (!pl.alive) continue;
        const idx = Math.floor(pl.y / TILE) * sim.map.gw + Math.floor(pl.x / TILE);
        if (set.has(idx)) sim.hazard(pl, 'fire', 450 * dt);
      }
    } else if (!p.ashed) {
      p.ashed = true;
      for (const idx of p.burn) if (sim.map.t[idx] === BUSH) sim.setTile(idx, EMPTY);
    }
  },
  end(sim, p) { for (const idx of p.burn || []) if (sim.map.t[idx] === EMPTY && !sim.tileOccupied(idx)) sim.setTile(idx, BUSH); },
  draw(ctx, p, phase, t, R) {
    const gw = R.map.gw;
    for (const idx of p.burn || []) {
      const x = (idx % gw) * TILE + TILE / 2, y = Math.floor(idx / gw) * TILE + TILE / 2;
      if (!R.visible(x, y)) continue;
      if (phase === 'warn') { R.warnTile(x, y, '#ff6b2b', t); continue; }
      if ((p.burnT ?? 0) > 4) continue;
      R.flame(x, y, t + idx);
    }
  },
};
