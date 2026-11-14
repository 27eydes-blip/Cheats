import { BUSH, EMPTY } from '../shared.js';
export default {
  id: 'overgrowth', name: 'OVERGROWTH', desc: 'Bushes are spreading — hide!', color: '#51cf66', duration: 18,
  start(sim) {
    const grown = [];
    const gw = sim.map.gw;
    for (const idx of sim.tilesInBounds(BUSH, true)) {
      for (const d of [1, -1, gw, -gw]) {
        const n = idx + d;
        if (sim.map.t[n] === EMPTY && sim.rand() < 0.55 && sim.inBoundsIdx(n) && !grown.includes(n)) { sim.setTile(n, BUSH); grown.push(n); }
      }
    }
    // a few brand new patches
    const empties = sim.tilesInBounds(EMPTY, true);
    for (let k = 0; k < 6; k++) {
      const c = empties[Math.floor(sim.rand() * empties.length)];
      for (const n of [c, c + 1, c + gw, c + gw + 1]) if (sim.map.t[n] === EMPTY && sim.inBoundsIdx(n)) { sim.setTile(n, BUSH); grown.push(n); }
    }
    return { grown };
  },
  end(sim, p) { for (const idx of p.grown || []) if (sim.map.t[idx] === BUSH) sim.setTile(idx, EMPTY); },
};
