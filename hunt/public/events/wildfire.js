import { BUSH, EMPTY, TILE } from '../shared.js';
// Bushes catch fire (warning shows which), burn for a few seconds hurting anyone inside, then turn to ash.
// One clock for both sides: the server's burn time and the client's flames both come from the time the
// event has been on (the client knows it from the event's time left, sent in every snapshot).
export const BURN_S = 4;
const wildfire = {
  id: 'wildfire', name: 'WILDFIRE', desc: 'Get out of the bushes!', color: '#ff6b2b', duration: 14,
  prepare(sim) {
    const bushes = sim.tilesInBounds(BUSH, true);
    const burn = bushes.filter(() => sim.rand() < 0.45);
    return { burn };
  },
  start(sim, p) { p.burnT = 0; },
  tick(sim, p, dt) {
    p.burnT = (p.burnT || 0) + dt;
    if (p.burnT < BURN_S) {
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
  draw(ctx, p, phase, t, R, tl) {
    // (p is the params as sent when the fire started: its burnT never moves on the client)
    if (phase === 'on' && (tl != null ? wildfire.duration - tl : p.burnT ?? 0) >= BURN_S) return; // ash now
    const gw = R.map.gw;
    for (const idx of p.burn || []) {
      const x = (idx % gw) * TILE + TILE / 2, y = Math.floor(idx / gw) * TILE + TILE / 2;
      if (!R.visible(x, y)) continue;
      if (phase === 'warn') { R.warnTile(x, y, '#ff6b2b', t); continue; }
      if (R.map.t[idx] !== BUSH) continue; // (burnt out or cut down: nothing left to burn)
      R.flame(x, y, t + idx);
    }
  },
};
export default wildfire;
