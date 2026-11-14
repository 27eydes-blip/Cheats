import { WALL, EMPTY } from '../shared.js';
export default {
  id: 'walls', name: 'SHIFTING WALLS', desc: 'Walls rise and sink!', color: '#a48ff0', duration: 15,
  start(sim) {
    const sunk = [], risen = [];
    const walls = sim.tilesInBounds(WALL, true);
    for (let i = 0; i < walls.length && sunk.length < Math.ceil(walls.length * 0.25); i++) {
      const idx = walls[Math.floor(sim.rand() * walls.length)];
      if (!sunk.includes(idx)) { sim.setTile(idx, EMPTY); sunk.push(idx); }
    }
    const empties = sim.tilesInBounds(EMPTY, true);
    for (let i = 0; i < 400 && risen.length < sunk.length; i++) {
      const idx = empties[Math.floor(sim.rand() * empties.length)];
      if (risen.includes(idx) || sim.tileOccupied(idx)) continue;
      sim.setTile(idx, WALL); risen.push(idx);
    }
    return { sunk, risen };
  },
  end(sim, p) {
    for (const idx of p.risen || []) sim.setTile(idx, EMPTY);
    for (const idx of p.sunk || []) if (!sim.tileOccupied(idx)) sim.setTile(idx, WALL);
  },
};
