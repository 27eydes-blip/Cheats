// Arenas: every world has 2+ layouts; sizes scale with players; every spawn is reachable and covered.
import assert from 'node:assert';
import { WORLDS, generateArena, arenaSizeFor, arenaLayout, spawnHasCover, blocksMove, TILE, PLAYER_R, poisonInset, LAYOUTS } from '../public/shared.js';

// can a full-size player (radius PLAYER_R) walk from the centre to (x,y)? flood fill on a 25px grid
export function reachable(m, from, targets, r = PLAYER_R - 1) {
  const S = 25, W = Math.floor(m.gw * TILE / S), H = Math.floor(m.gh * TILE / S);
  const free = (gx, gy) => {
    const x = gx * S + S / 2, y = gy * S + S / 2;
    for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      if (tx < 0 || ty < 0 || tx >= m.gw || ty >= m.gh || !blocksMove(m.t[ty * m.gw + tx])) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE)), cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
    }
    return true;
  };
  const seen = new Uint8Array(W * H), q = [];
  const start = [Math.floor(from.x / S), Math.floor(from.y / S)];
  // nudge the start to the nearest free cell (the centre holds crates)
  let best = null;
  for (let d = 0; d < 20 && !best; d++) for (let dy = -d; dy <= d && !best; dy++) for (let dx = -d; dx <= d; dx++) if (free(start[0] + dx, start[1] + dy)) { best = [start[0] + dx, start[1] + dy]; break; }
  q.push(best); seen[best[1] * W + best[0]] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !free(nx, ny)) continue;
      seen[ny * W + nx] = 1; q.push([nx, ny]);
    }
  }
  return targets.map((t) => !!seen[Math.floor(t.y / S) * W + Math.floor(t.x / S)]);
}

assert.equal(arenaSizeFor(10), 3000, '10 players: 3000');
assert.equal(arenaSizeFor(20), 5000, 'Big Hunt: 5000');
assert(poisonInset(400, 5000) > poisonInset(400, 3000), 'bigger arena: poison closes further');
const arenaWorlds = WORLDS.filter((w) => w.arena);
let n = 0, t0 = Date.now(), worst = 0;
for (const w of arenaWorlds) {
  assert((w.layouts || []).length >= 2, `${w.key}: at least 2 layouts`);
  for (const L of w.layouts) assert(LAYOUTS[L], `${w.key}: known layout ${L}`);
  const seen = new Set();
  for (const players of [6, 10, 20]) for (let seed = 1; seed <= 6; seed++) {
    const ts = Date.now();
    const m = generateArena(seed * 7919, w.key, players);
    worst = Math.max(worst, Date.now() - ts);
    n++;
    seen.add(m.layout);
    assert.equal(m.layout, arenaLayout(seed * 7919, w.key));
    assert.equal(m.gw * TILE, arenaSizeFor(players));
    assert.equal(m.spawns.length, players);
    for (const sp of m.spawns) assert(spawnHasCover(m, sp), `${w.key}/${m.layout}/${players}#${seed}: spawn has cover`);
    const ok = reachable(m, { x: m.size / 2, y: m.size / 2 }, m.spawns);
    assert(ok.every(Boolean), `${w.key}/${m.layout}/${players}#${seed}: every spawn reachable from the centre (${ok})`);
    assert(m.pieces.length > 10, 'has cover');
  }
  assert.equal(seen.size, w.layouts.length, `${w.key}: all layouts get used`);
}
console.log(`ARENAS OK: ${n} arenas, ${arenaWorlds.length} worlds, slowest generation ${worst}ms (${Date.now() - t0}ms total)`);
