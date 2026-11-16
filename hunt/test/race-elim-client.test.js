// ELIMINATION on the client (public/race/elim.js, moments.js): the black hole is drawn where the
// server says (the same point on every phone), from cached sprites (no gradient built per frame);
// the danger outline pulses but is steady under Reduce Flashing; the edges darken and the warning
// pulse speeds up as the hole closes in; the final cut is kept for the results replay (black hole
// included) even though the race ends on that very cut. Runs in Node with a fake canvas.
import assert from 'node:assert';

let grads = 0;
const ctx = () => {
  const g = { strokes: [] };
  for (const k of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'fill', 'drawImage', 'setTransform', 'translate', 'scale', 'save', 'restore', 'fillText', 'strokeText', 'closePath', 'rotate', 'ellipse']) g[k] = () => {};
  g.stroke = () => g.strokes.push([g.strokeStyle, g.globalAlpha]);
  g.measureText = (s) => ({ width: String(s).length * 8 });
  g.createRadialGradient = () => { grads++; return { addColorStop() {} }; };
  g.createLinearGradient = () => { grads++; return { addColorStop() {} }; };
  return g;
};
globalThis.document = { createElement: () => { const c = { width: 0, height: 0, _g: null }; c.getContext = () => (c._g ||= ctx()); return c; } };

const { SETTINGS } = await import('../public/settings.js');
const { ElimFx, holeAt, holeNear, ringLeft } = await import('../public/race/elim.js');
const { ELIM } = await import('../public/race/protocol.js');
const { getTrack } = await import('../public/race/tracks.js');
const { pointAt } = await import('../public/race/trackgeom.js');
const { Moments, replayView } = await import('../public/race/moments.js');

// ---------------------------------------------------------------- where the hole is drawn
for (const k of ['desert', 'frozen', 'ashlands', 'neon']) {
  const T = getTrack(k), c = T.corridors[0];
  for (const s of [0, 777, T.L / 2, T.L - 5]) {
    const a = pointAt(c, s), b = holeAt(T, s, {}), w = holeAt(T, s + 3 * T.L, {}), neg = holeAt(T, s - T.L, {});
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, `${k}: on the centre line at ${s}`);
    assert.ok(Math.hypot(w.x - b.x, w.y - b.y) < 1e-6 && Math.hypot(neg.x - b.x, neg.y - b.y) < 1e-6, `${k}: any lap, behind the line too`);
  }
}
assert.strictEqual(holeNear(null), 0);
assert.strictEqual(holeNear(ELIM.hole.warn + 100), 0, 'far: nothing');
assert.strictEqual(holeNear(ELIM.hole.reach), 1, 'touching: full');
assert.ok(holeNear(500) > holeNear(700), 'closer = darker');
assert.strictEqual(ringLeft({ nx: 9, iv: 18 }), 0.5);
assert.strictEqual(ringLeft({ nx: 0, iv: 18 }), 0);

// ---------------------------------------------------------------- drawing: cached sprites, danger outline
const T = getTrack('desert');
const R = {
  T, t: 0, view: { x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 },
  at() {}, base() {}, toScreen: (x, y, o) => { o.x = 400; o.y = 200; return o; },
  carAt: (v, id) => v.cars.find((c) => c.id === id) || null,
};
const view = (o = {}) => ({ countdown: 0, cars: [{ id: 3, x: 900, y: 650, a: 0, f: 0 }], ranks: [1, 3], hud: { dg: 3, nx: 6, iv: 18, bh: 300, left: 2 }, hole: 300, me: { bg: 400, out: 0 }, ...o });
const fx = new ElimFx();
const built = grads;
assert.ok(built > 0, 'the sprites are painted once');
const g = ctx(), plays = [];
const S = { W: 844, H: 390, SA: { t: 0, r: 0, b: 0, l: 0 }, dpr: 2, R, rc: { id: 1 }, dt: 1 / 60, play: (id, v) => plays.push([id, v]), name: () => 'Ann' };
const outline = (steady) => {
  SETTINGS.reduceFlash = steady;
  const alphas = new Set();
  for (let i = 0; i < 40; i++) { R.t = i * 0.037; g.strokes.length = 0; fx.world(g, R, view(), {}, 1 / 60); const red = g.strokes.find((s) => s[0] === '#ff3b4f'); assert.ok(red, 'the racer in danger gets the red outline'); alphas.add(red[1].toFixed(3)); }
  return alphas.size;
};
assert.ok(outline(false) > 5, 'the outline pulses');
assert.strictEqual(outline(true), 1, 'steady under Reduce Flashing');
SETTINGS.reduceFlash = false;
// the countdown ring: a gold arc while there is time, red near the cut
g.strokes.length = 0; fx.world(g, R, view({ hud: { dg: 3, nx: 2, iv: 18, bh: 300 } }), {}, 1 / 60);
assert.ok(g.strokes.some((s) => s[0] === '#ff3b4f' && s[1] > 0.9), 'red ring near the cut');
g.strokes.length = 0; fx.world(g, R, view({ hud: { dg: 0, nx: 6, iv: 18, bh: 300 } }), {}, 1 / 60);
assert.ok(!g.strokes.some((s) => s[0] === '#ff3b4f'), 'nobody in danger: no outline');
// the screen layer: dark edges + warning when close, nothing when far; no gradients per frame
for (let i = 0; i < 120; i++) { R.t += 1 / 60; fx.screen(g, { ...S, view: view(), me: { bg: 300, out: 0 } }); }
assert.ok(fx.near > 0.6, 'the edges darken');
assert.ok(plays.filter((p) => p[0] === 'holewarn').length >= 2, 'the warning pulse sounds');
const nWarn = plays.length;
for (let i = 0; i < 300; i++) fx.screen(g, { ...S, view: view(), me: { bg: 3000, out: 0 } });
assert.ok(fx.near < 0.02, 'far away: the edges clear');
assert.strictEqual(plays.length, nWarn, 'and no warning');
const afterOne = grads;
for (let i = 0; i < 200; i++) { R.t += 1 / 60; fx.world(g, R, view(), {}, 1 / 60); fx.screen(g, { ...S, view: view(), me: { bg: 250, out: 0 } }); }
assert.strictEqual(grads, afterOne, 'no gradient is built per frame (only once per screen size)');
fx.screen(g, { ...S, W: 1180, H: 820, view: view(), me: { bg: 250, out: 0 } });
assert.strictEqual(grads, afterOne + 1, 'a new screen size paints the edge image once');
// implosions run out
fx.implode(10, 10); fx.implode(20, 20);
for (let i = 0; i < 60; i++) fx.world(g, R, view(), {}, 1 / 60);
assert.strictEqual(fx.booms.length, 0);

// ---------------------------------------------------------------- the final cut replay
{
  const m = new Moments();
  for (let i = 0; i < 150; i++) m.frame({ time: i / 30, cars: [{ id: 1, x: i * 10, y: 0, a: 0, f: 0, spd: 300, hp: 100, me: false }, { id: 2, x: i * 10 + 400, y: 0, a: 0, f: 0, spd: 300, hp: 100, me: true }], ents: [], leader: 2, hole: 100 + i * 5 });
  m.event(['ko', 1, 2, 'missile'], 2, 4.0, true, { x: 1, y: 2 }); // a crash first
  m.event(['elim', 1, 2, 'cut', 1490, 0], 2, 4.97, false, { x: 1490, y: 0 });
  m.markCut(4.97, 1);
  m.flush(); // the race ended on the cut: no more frames come
  assert.ok(m.best, 'kept');
  assert.deepStrictEqual([m.best.label, m.best.cut, m.best.focus], ['FINAL CUT', 1, 1], 'the final cut beats any crash');
  assert.ok(m.best.n > 30, 'about 3 s of it');
  const v = m.best.viewAt(4.5, replayView());
  assert.ok(Math.abs(v.hole - (100 + 4.5 * 30 * 5)) < 6, 'the black hole is in the replay');
  assert.ok(m.best.booms.some((b) => b.cut === 1 && b.x === 1490), 'the cut itself goes off again in the replay');
}
console.log('race-elim-client: ok');
