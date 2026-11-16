// Hunt Racers neon looks: display names, one signature colour per car, look objects for cosmetics,
// and the car art data the renderer reads (exhausts, taillights) for every driver.
import assert from 'node:assert';
import { BASE_LOOKS, makeLook, carName, lookForRacer, setCosResolver, PATTERNS, drawCarPreview } from '../public/race/looks.js';
import { CAR_IDS, exhaustsOf, taillightsOf, headOf, patternMix } from '../public/race/cars.js';
import { DRIVER_IDS } from '../public/race/physics.js';
import { PC, colorIdx } from '../public/race/fx.js';

// names: the single source the store and lobby show; internal ids stay the same
assert.deepStrictEqual(DRIVER_IDS.map(carName), ['ARCWIRE', 'WARHOG', 'PHANTOM', 'SANDVIPER', 'COBRA', 'RAZOR']);
assert.strictEqual(carName('nope'), 'ARCWIRE', 'unknown ids fall back');
assert.deepStrictEqual(Object.keys(BASE_LOOKS).sort(), [...DRIVER_IDS].sort());

assert.strictEqual(typeof drawCarPreview, 'function', 'the store imports drawCarPreview from looks.js');

// one signature neon colour per car, all different
const neons = DRIVER_IDS.map((d) => BASE_LOOKS[d].neon);
assert.strictEqual(new Set(neons).size, 6, 'six distinct neon colours');

// makeLook: frozen, memoised, defaults from the base look
{
  const a = makeLook('rook'), b = makeLook('rook', null);
  assert.strictEqual(a, b, 'same look -> same object (sprite caches stay flat)');
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.flame) && Object.isFrozen(a.trail));
  for (const k of ['name', 'neon', 'neon2', 'body', 'pattern', 'glow', 'glowStyle', 'rim', 'flame', 'trail']) assert.ok(a[k] !== undefined, k);
  assert.strictEqual(a.neon, BASE_LOOKS.rook.neon);
  assert.strictEqual(a.name, 'COBRA');
}
// cosmetics: every option kind changes what it should and nothing else
{
  const base = makeLook('volt');
  const skin = makeLook('volt', { skin: { neon: '#FF0000', pattern: 'circuit' } });
  assert.strictEqual(skin.neon, '#ff0000');
  assert.strictEqual(skin.pattern, 'circuit');
  assert.notStrictEqual(skin.sprite, base.sprite, 'a skin is a new sprite');
  const glow = makeLook('volt', { glow: { color: '#00ff00', style: 'mist' } });
  assert.strictEqual(glow.sprite, base.sprite, 'underglow is drawn live: same sprite');
  assert.strictEqual(glow.glowStyle, 'mist');
  assert.notStrictEqual(glow.id, base.id);
  const w = makeLook('volt', { wheel: { rim: '#123456', spokes: 99 } });
  assert.strictEqual(w.rim, '#123456'); assert.ok(w.spokes <= 8);
  const f = makeLook('volt', { flame: { core: '#ffffff', outer: '#00ffaa' }, trail: { color: '#abcdef', style: 'sparks' } });
  assert.strictEqual(f.flame.outer, '#00ffaa'); assert.strictEqual(f.trail.style, 'sparks');
  // garbage in: defaults out, never a crash or a bad colour string reaching the canvas
  const bad = makeLook('volt', { skin: { neon: 'red; x', pattern: 'evil' }, glow: 5, wheel: 'x', flame: null, trail: { style: 'nope' } });
  assert.strictEqual(bad, base);
  assert.strictEqual(makeLook('nope').driver, 'volt');
  for (const p of PATTERNS) assert.strictEqual(makeLook('dune', { skin: { pattern: p } }).pattern, p);
}
// racers: the store's resolver turns equipped ids into options; failures fall back to the base look
{
  assert.strictEqual(lookForRacer({ driver: 'wisp', cos: { skin: 'x' } }), makeLook('wisp'), 'no resolver yet');
  setCosResolver((ids) => (ids.skin === 'red' ? { skin: { neon: '#ff0000' } } : null));
  assert.strictEqual(lookForRacer({ driver: 'wisp', cos: { skin: 'red' } }).neon, '#ff0000');
  setCosResolver(() => { throw new Error('boom'); });
  assert.strictEqual(lookForRacer({ driver: 'wisp', cos: { skin: 'red' } }), makeLook('wisp'));
  setCosResolver(null);
  assert.strictEqual(lookForRacer(undefined), makeLook('volt'));
}
// car art data for every driver
assert.deepStrictEqual([...CAR_IDS].sort(), [...DRIVER_IDS].sort());
for (const d of DRIVER_IDS) {
  assert.ok(exhaustsOf(d).length >= 1 && taillightsOf(d).length === 2 && headOf(d) > 20, d);
  for (const [x] of exhaustsOf(d)) assert.ok(x < -20, `${d} exhausts at the tail`);
}
// Reduce Flashing: animated skins hold still
assert.strictEqual(patternMix(0, true), patternMix(3.7, true));
assert.notStrictEqual(patternMix(0, false), patternMix(0.6, false));

// particle colours: car colours get a slot once, the table stays bounded
{
  const i = colorIdx('#2f8dff');
  assert.strictEqual(colorIdx('#2f8dff'), i);
  for (let k = 0; k < 200; k++) colorIdx('#' + k.toString(16).padStart(6, '0'));
  assert.ok(PC.length <= 64, 'bounded colour table');
}
console.log('race-looks: ok');
