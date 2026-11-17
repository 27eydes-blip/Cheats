// Oblivion GP track scenery (scenery.js): every world has its palette and scenery; on every track
// and arena the scenery is deterministic and stands clear of the road and the walls, and a tall
// shape's leaning roof can never reach over a wall; a new world can be added from another file.
import assert from 'node:assert';
import { TRACK_IDS, getTrack } from '../public/race/tracks.js';
import { WORLD_ART, THEMES, artOf, addWorld, placeScenery, clearanceOf, GAP, WALL } from '../public/race/scenery.js';

for (const w of ['desert', 'frozen', 'ashlands', 'city']) {
  const a = WORLD_ART[w];
  assert.ok(a && a.pal && a.night && a.dusk && a.tall && a.flat.length && a.neon.length && a.crowd.length, w);
  assert.strictEqual(THEMES[w], a.pal, 'THEMES is the palette');
  for (const k of ['bg', 'road', 'wall', 'shoulder', 'line', 'curbA', 'curbB', 'mini', 'miniRoad']) assert.ok(a.pal[k], `${w}.pal.${k}`);
}
assert.strictEqual(artOf('nowhere'), WORLD_ART.desert, 'unknown world: the desert look');

// independent wall distance: brute force over every corridor segment (no grid)
function wallDist(T, x, y) {
  if (T.box) { const B = T.box; if (x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1) return -1; return Math.hypot(Math.max(B.x0 - x, x - B.x1, 0), Math.max(B.y0 - y, y - B.y1, 0)) - WALL; }
  let best = Infinity;
  for (const c of T.corridors) for (let i = 0; i < c.segs; i++) {
    const j = (i + 1) % c.n, ax = c.px[i], ay = c.py[i], dx = c.px[j] - ax, dy = c.py[j] - ay, L2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t) - Math.max(c.ww[i], c.ww[j]) - WALL);
  }
  return best;
}

let total = 0;
for (const key of TRACK_IDS) for (const arena of [false, true]) {
  const T = getTrack(key, arena);
  if (!T) continue;
  const name = `${key}${arena ? ' arena' : ''}`;
  const S = placeScenery(T), S2 = placeScenery(T);
  assert.deepStrictEqual(S2.flat.map((d) => [d.kind, d.x, d.y]), S.flat.map((d) => [d.kind, d.x, d.y]), `${name}: deterministic`);
  assert.ok(S.tall.length > 10, `${name}: has tall scenery (${S.tall.length})`);
  if (!arena) assert.ok(S.flat.some((d) => d.kind === 'stand') && S.flat.some((d) => d.kind === 'board'), `${name}: grandstands and billboards`);
  const clr = clearanceOf(T);
  for (const d of [...S.flat, ...S.tall]) {
    total++;
    const gap = d.kind === 'stand' ? GAP.stand : d.kind === 'board' ? GAP.board : d.prisms ? GAP.tall : d.gap;
    for (let k = 0; k < d.foot.length; k += 2) {
      const x = d.x + d.foot[k], y = d.y + d.foot[k + 1], wd = wallDist(T, x, y);
      assert.ok(wd >= gap - 0.5, `${name}: ${d.kind} at ${x.toFixed(0)},${y.toFixed(0)} is ${wd.toFixed(1)} px from a wall (needs ${gap})`);
      assert.ok(Math.abs(clr(x, y) - wd) < 0.5 || wd > 800, `${name}: clearance grid agrees with brute force`);
      if (d.prisms) { // the roof leans at most 0.8 x clr: every roof point stays off the walls
        assert.ok(d.clr >= GAP.tall - 0.5 && d.hMax > 0, `${name}: ${d.kind} clearance`);
        for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2, m = d.clr * 0.8; assert.ok(wallDist(T, x + Math.cos(a) * m, y + Math.sin(a) * m) > 0, `${name}: ${d.kind} roof over a wall`); }
      }
    }
  }
}
assert.ok(total > 500, 'plenty of scenery');

// a world added from another file: missing fields come from the base, the palette is registered
const w = addWorld('testworld', { pal: { road: '#123456' }, tall: 'spire' });
assert.strictEqual(artOf('testworld'), w);
assert.strictEqual(THEMES.testworld.road, '#123456');
assert.strictEqual(THEMES.testworld.wall, WORLD_ART.desert.pal.wall);
delete WORLD_ART.testworld; delete THEMES.testworld;
console.log('race-scenery: ok');
