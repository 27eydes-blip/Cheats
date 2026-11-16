// Unlockable cars art (race/cars2.js, looks2.js, showcase2.js, sound2.js): the API has the shape of
// cars.js / looks.js so integration is an import swap; every one of the 8 cars draws (sprite
// atlas, live draw, preview, underglow, trail) with finite coordinates; a frame costs a few blits
// and builds no canvases once warm; Reduce Flashing holds glows steady; GRAVITON has no wheels;
// every car has its own engine voice. Canvas and Web Audio are small recording fakes.
import assert from 'node:assert';

// ---- fakes: a 2D context that records calls and checks every number is finite
let created = 0, bad = [];
const ops = [];
function ctx2d(cv) {
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1) || typeof c !== 'string' || /NaN|undefined/.test(c)) bad.push(['stop', o, c]); } });
  const target = {
    canvas: cv, globalAlpha: 1, globalCompositeOperation: 'source-over',
    getTransform: () => ({ ...m }),
    setTransform(a, b, c, d, e, f) { m = { a, b, c, d, e, f }; },
    scale(x, y) { m = { ...m, a: m.a * x, b: m.b * x, c: m.c * y, d: m.d * y }; },
    createLinearGradient: grad, createRadialGradient: grad,
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => { ops.push(k); for (const v of args) if (typeof v === 'number' && !Number.isFinite(v)) bad.push([k, args]); };
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push([k, v]); if (typeof v === 'string' && /NaN|undefined/.test(v)) bad.push([k, v]); t[k] = v; return true; },
  });
}
const canvas = () => { created++; const cv = { width: 0, height: 0 }; const g = ctx2d(cv); cv.getContext = () => g; return cv; };
globalThis.document = { createElement: (t) => (t === 'canvas' ? canvas() : {}), addEventListener() {} };
globalThis.addEventListener = () => {};

const C1 = await import('../public/race/cars.js');
const C2 = await import('../public/race/cars2.js');
const L1 = await import('../public/race/looks.js');
const L2 = await import('../public/race/looks2.js');
const { Showcase, spinInPose, SPIN_IN_S, drawRarityGlow } = await import('../public/race/showcase2.js');
const S2 = await import('../public/race/sound2.js');

const NEW = ['void', 'fang', 'frost', 'grav', 'vx', 'redline', 'helix', 'prime'];

// ---- API shape
for (const k of Object.keys(C1)) assert.strictEqual(typeof C2[k], typeof C1[k], `cars2 exports ${k} like cars.js`);
for (const k of Object.keys(L1)) assert.strictEqual(typeof L2[k], typeof L1[k], `looks2 exports ${k} like looks.js`);
assert.deepStrictEqual(C2.CAR2_IDS, NEW);
assert.deepStrictEqual(L2.NEW_CAR_IDS, NEW);
assert.deepStrictEqual(C2.CAR_IDS, [...C1.CAR_IDS, ...NEW], 'old six first, then the new eight');
assert.strictEqual(C2.BUCKETS, C1.BUCKETS);
assert.strictEqual(L2.NEON_GLOW, L1.NEON_GLOW);

// ---- looks: names, rarity, unique colour / fx / trail / voice, frozen + memoised, old cars passed through
assert.deepStrictEqual(NEW.map(L2.carName), ['VOIDRUNNER', 'SOLAR FANG', 'FROSTBYTE', 'GRAVITON', 'PHANTOM VX', 'REDLINE ZERO', 'HELIX', 'OBLIVION PRIME']);
assert.deepStrictEqual(NEW.map(L2.rarityOf), ['rare', 'rare', 'rare', 'epic', 'epic', 'epic', 'legendary', 'legendary']);
assert.strictEqual(L2.carName('volt'), 'ARCWIRE');
assert.strictEqual(L2.rarityOf('volt'), null);
assert.strictEqual(L2.RARITY.rare.color, '#3a8bff'); assert.strictEqual(L2.RARITY.epic.color, '#b04dff'); assert.strictEqual(L2.RARITY.legendary.color, '#ffc23a');
const allNeon = Object.values(L2.ALL_LOOKS).map((b) => b.neon);
assert.strictEqual(new Set(allNeon).size, 14, 'fourteen distinct signature colours');
for (const f of ['fx', 'voice']) assert.strictEqual(new Set(NEW.map((id) => L2.BASE_LOOKS2[id][f])).size, 8, `unique ${f}`);
assert.strictEqual(new Set(NEW.map((id) => L2.BASE_LOOKS2[id].trail.color)).size, 8, 'unique trail colours');
assert.strictEqual(L2.BASE_LOOKS2.fang.trail.style, 'flame', 'SOLAR FANG has the flame trail');
assert.strictEqual(L2.BASE_LOOKS2.prime.glow.style, 'blackhole', 'OBLIVION PRIME has the black hole');
for (const id of NEW) {
  const a = L2.makeLook(id), b = L2.makeLook(id, null);
  assert.strictEqual(a, b, 'memoised');
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.trail) && Object.isFrozen(a.flame));
  for (const k of ['driver', 'name', 'neon', 'neon2', 'body', 'pattern', 'glow', 'glowStyle', 'rim', 'spokes', 'flame', 'trail', 'sprite', 'id', 'rarity', 'fx', 'voice']) assert.ok(a[k] !== undefined, `${id}.${k}`);
  assert.ok(L2.GLOW_STYLES.includes(a.glowStyle) && L2.TRAIL_STYLES.includes(a.trail.style));
  assert.strictEqual(L2.makeLook(id, { skin: { neon: 'evil' }, glow: 3, trail: { style: 'nope' } }), a, 'garbage options fall back');
}
assert.strictEqual(L2.makeLook('volt'), L1.makeLook('volt'), 'old cars are the looks.js objects');
assert.strictEqual(L2.lookForRacer({ driver: 'helix' }), L2.makeLook('helix'));
L2.setCosResolver((ids) => (ids.skin === 'red' ? { skin: { neon: '#ff0000' } } : null));
assert.strictEqual(L2.lookForRacer({ driver: 'prime', cos: { skin: 'red' } }).neon, '#ff0000');
assert.strictEqual(L2.lookForRacer({ driver: 'wisp', cos: { skin: 'red' } }).neon, '#ff0000', 'one resolver for old and new cars');
L2.setCosResolver(null);

// ---- attachment points
for (const id of NEW) {
  assert.ok(C2.exhaustsOf(id).length >= 1 && C2.taillightsOf(id).length === 2 && C2.headOf(id) > 20, id);
  for (const [x] of C2.exhaustsOf(id)) assert.ok(x < -10, `${id} exhausts at the tail`);
}
assert.deepStrictEqual(C2.exhaustsOf('volt'), C1.exhaustsOf('volt'));
assert.strictEqual(C2.hasWheels('grav'), false, 'GRAVITON floats: no wheels');
for (const id of NEW.filter((x) => x !== 'grav')) assert.ok(C2.hasWheels(id), id);
assert.ok(C2.spinOf('helix') && C2.spinOf('grav'), 'HELIX core and GRAVITON ring lights spin');

// ---- every car draws: live, through the sprite cache at every heading, in previews
const g = canvas().getContext('2d');
for (const id of [...NEW, 'volt']) {
  ops.length = 0; C2.drawCar(g, id, null, 1.3);
  assert.ok(ops.filter((o) => o === 'stroke' || o === 'fill').length > 20, `${id} draws`);
}
const spr = new C2.CarSprites();
spr.setScale(1.5);
for (const id of [...NEW, ...C1.CAR_IDS]) {
  for (let b = 0; b < C2.BUCKETS; b++) {
    const s = spr.get(L2.makeLook(id), (b / C2.BUCKETS) * Math.PI * 2);
    for (const k of ['cv', 'sx', 'sy', 'px', 'ang', 'half']) assert.ok(s[k] !== undefined, `${id} sprite.${k}`);
  }
}
// per frame: a few blits and no new canvases once warm
for (const id of NEW) {
  const s = spr.get(id, 0.3), L = L2.makeLook(id);
  let n0 = created;
  for (let pass = 0; pass < 2; pass++) for (const [steady, low] of [[false, false], [true, false], [false, true]]) {
    if (pass === 1 && steady === false && low === false) n0 = created; // first pass warms the shared light sprites
    ops.length = 0; C2.blitCar(g, s, 2.2, steady, low);
    assert.ok(ops.filter((o) => o === 'drawImage').length <= 4, `${id}: at most 4 blits a frame`);
    C2.drawUnderglow(g, L, 2.2, 1, steady, low);
    C2.drawBoostTrail(g, L, new Float32Array(32).map((_, i) => (i & 1 ? Math.sin(i) * 4 : -i * 7)), 5, 14, 2.2, steady, low);
  }
  assert.strictEqual(created, n0, `${id}: nothing built per frame`);
  assert.strictEqual(g.globalAlpha, 1, 'blit restores alpha');
}
// Reduce Flashing: steady blits and underglow are the same at any time (no pulsing)
for (const id of NEW) {
  const s = spr.get(id, 0.3), L = L2.makeLook(id);
  const rec = (t) => { const out = []; const p = new Proxy(g, { get: (tg, k) => (typeof tg[k] === 'function' && k !== 'getTransform' ? (...a) => { if (k !== 'rotate') out.push(k, ...a.filter((v) => typeof v === 'number')); return tg[k](...a); } : tg[k]), set: (tg, k, v) => { if (k === 'globalAlpha') out.push('a', v); tg[k] = v; return true; } }); C2.blitCar(p, s, t, true); if (L.glowStyle !== 'blackhole') C2.drawUnderglow(p, L, t, 1, true); return out.join(','); };
  assert.strictEqual(rec(0.4), rec(3.1), `${id} holds still under Reduce Flashing`);
}
for (const st of L2.TRAIL_STYLES) C2.drawBoostTrail(g, L2.makeLook('prime', { trail: { style: st } }), new Float32Array(32).map((_, i) => i * 3), 3, 16, 1, false, false);
for (const st of L2.GLOW_STYLES) C2.drawUnderglow(g, L2.makeLook('void', { glow: { style: st } }), 1, 1, false, false);
for (const id of [...NEW, 'rook']) C2.drawCarPreview(g, id, null, -0.5, 1.7, { steady: false });
assert.deepStrictEqual(bad, [], 'no NaN / undefined reached the canvas');

// ---- showcase: spin-in poses, rarity glow
{
  const end = spinInPose(SPIN_IN_S, false);
  assert.ok(Math.abs(end.scale - 1) < 1e-6 && end.alpha === 1 && end.lift < 1e-6, 'lands at full size');
  for (let p = 0; p < 4; p += 0.05) { const q = spinInPose(p, true); assert.strictEqual(q.flash, 0); assert.strictEqual(q.ring, 0); }
  assert.ok([...Array(40)].some((_, i) => spinInPose(i * 0.05, false).flash > 0), 'a landing flash without Reduce Flashing');
  const sh = new Showcase();
  for (const id of NEW) for (const p of [0, 0.6, 1.1, 2.5]) sh.draw(g, id, null, p, p, { size: 120, steady: p > 2, low: p === 0.6 });
  const n0 = created; sh.draw(g, 'prime', null, 3, 3, { size: 120 }); assert.strictEqual(created, n0, 'showcase frame builds nothing');
  const rec = (t) => { const a = []; const p = new Proxy(g, { set: (tg, k, v) => { if (k === 'globalAlpha') a.push(v); tg[k] = v; return true; }, get: (tg, k) => (typeof tg[k] === 'function' ? tg[k].bind(tg) : tg[k]) }); drawRarityGlow(p, 'legendary', 50, t, true); return a.join(); };
  assert.strictEqual(rec(0), rec(2.7), 'rarity glow steady under Reduce Flashing');
  assert.deepStrictEqual(bad, []);
}

// ---- engine voices: one per car, all different, the graph builds and takes values
{
  assert.deepStrictEqual(S2.VOICE_IDS.sort(), [...NEW].sort());
  const sig = S2.VOICE_IDS.map((v) => JSON.stringify([0.2, 0.6, 1].map((s) => S2.voiceTargets(v, s, 0))));
  assert.strictEqual(new Set(sig).size, 8, 'eight different voices');
  const param = () => ({ value: 0, setTargetAtTime(v, t) { if (!Number.isFinite(v) || !Number.isFinite(t)) bad.push(['param', v]); } });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, start() {}, stop() {}, frequency: param(), detune: param(), gain: param(), Q: param(), ...extra });
  const fakeAc = { sampleRate: 8000, currentTime: 0, createGain: () => node(), createOscillator: () => node(), createBiquadFilter: () => node(), createBufferSource: () => node(), createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  for (const v of S2.VOICE_IDS) {
    const voice = S2.makeEngineVoice(fakeAc, node(), v);
    for (const s of [0, 0.5, 1.2]) voice.set(1, s, s > 1, 2, s > 1, 0.8);
    voice.stop(2);
  }
  assert.deepStrictEqual(bad, []);
  for (const r of L2.RARITY_IDS) assert.ok(S2.JINGLES[r].length >= 3, `${r} jingle`);
}
console.log('super-cars-art: ok');
