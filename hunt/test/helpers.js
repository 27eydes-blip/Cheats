// Shared test helpers.
import { blocksMove, TILE, PLAYER_R } from '../public/shared.js';

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

