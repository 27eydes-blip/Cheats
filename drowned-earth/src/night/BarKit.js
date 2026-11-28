import * as THREE from 'three';

// The bar building, emitted into a raft's Builder (platform-local space).
// Footprint W×D centred on (x, z), open front facing +z with an awning.
// Each style changes the materials and the furniture; the dressing that
// isn't boxes (neon, bottles, string lights, glassware) is added later by
// Nightlife.dress() from the anchors pushed to out.bars.
const STYLE = {
  trader: { wall: 'wood', wallC: [0.42, 0.3, 0.22], roof: 'rust', roofC: [0.5, 0.32, 0.2], counter: 'wood', counterC: [0.36, 0.22, 0.14], top: 'metal', topC: [0.75, 0.55, 0.25], h: 3.2 },
  garden: { wall: 'wood', wallC: [0.5, 0.48, 0.38], roof: 'fabric', roofC: [0.55, 0.62, 0.5], counter: 'wood', counterC: [0.45, 0.36, 0.25], top: 'wood', topC: [0.55, 0.45, 0.3], h: 3.0, glass: true },
  forge:  { wall: 'rust', wallC: [0.38, 0.27, 0.2], roof: 'rust', roofC: [0.3, 0.22, 0.18], counter: 'metal', counterC: [0.25, 0.24, 0.23], top: 'metal', topC: [0.42, 0.4, 0.38], h: 3.4 },
  candle: { wall: 'wood', wallC: [0.55, 0.45, 0.32], roof: 'wood', roofC: [0.3, 0.24, 0.2], counter: 'wood', counterC: [0.4, 0.3, 0.2], top: 'wood', topC: [0.5, 0.38, 0.26], h: 2.8, low: true },
  smoke:  { wall: 'wood', wallC: [0.2, 0.17, 0.15], roof: 'rust', roofC: [0.2, 0.18, 0.16], counter: 'wood', counterC: [0.22, 0.13, 0.1], top: 'metal', topC: [0.55, 0.45, 0.3], h: 2.6 },
};

export function buildBar(b, st, y, rng, out) {
  const S = STYLE[st.style] || STYLE.trader;
  const W = st.w || 11, D = st.d || 6.4, H = S.h;
  const x0 = st.x - W / 2, x1 = st.x + W / 2, z0 = st.z - D / 2, z1 = st.z + D / 2;
  const t = 0.12;
  // floor: darker boards over the deck
  for (let i = 0; i < Math.round(W / 0.32); i++) {
    const xa = x0 + i * 0.32, v = 0.75 + rng.next() * 0.3;
    b.box(xa, y, z0, xa + 0.3, y + 0.04, z1, 'wood', { color: [0.28 * v, 0.2 * v, 0.15 * v], collide: false });
  }
  // back wall, side walls with windows (garden: glass panes; smoke: none — fog and painted boards)
  b.wall('x', x0, x1, z0, y, y + H, t, S.wall, st.style === 'smoke' ? [{ at: st.x + W / 2 - 1.2, w: 1.1, h: 2.1, bottom: 0 }] : [], { color: S.wallC });
  const win = st.style === 'smoke' ? [] : [{ at: st.z - 0.6, w: 1.8, h: 1.1, bottom: 1.1 }];
  b.wall('z', z0, z1, x0, y, y + H, t, S.wall, win, { color: S.wallC });
  b.wall('z', z0, z1, x1, y, y + H, t, S.wall, win, { color: S.wallC });
  // plank / panel detail on the walls: battens
  for (let i = 0; i <= Math.round(W / 1.1); i++) {
    const xa = x0 + i * (W / Math.round(W / 1.1));
    b.box(xa - 0.04, y, z0 + t / 2, xa + 0.04, y + H, z0 + t / 2 + 0.05, S.wall, { color: S.wallC.map((c) => c * 0.75), collide: false });
  }
  if (S.glass) for (const xs of [x0, x1]) b.box(xs - 0.02, y + 1.1, st.z - 1.5, xs + 0.02, y + 2.2, st.z + 0.3, 'tile', { color: [0.55, 0.7, 0.6], collide: false, meta: { glass: true } });
  // roof with a slight pitch and an awning out over the front
  b.boxR(st.x, y + H + 0.06, st.z, W + 0.5, 0.1, D + 0.4, 0, S.roof, { color: S.roofC, rx: -0.04 });
  b.boxR(st.x, y + H - 0.25, z1 + 0.95, W + 0.3, 0.06, 1.9, 0, st.style === 'candle' ? 'fabric' : S.roof, { color: st.style === 'candle' ? [0.6, 0.18, 0.12] : S.roofC.map((c) => c * 1.15), rx: 0.22 });
  for (const xs of [x0 + 0.2, x1 - 0.2]) b.box(xs - 0.06, y, z1 + 1.75, xs + 0.06, y + H - 0.3, z1 + 1.87, 'wood', { color: [0.3, 0.22, 0.16], collide: false });
  // front: a low half-wall each side of a wide opening
  b.box(x0, y, z1 - t / 2, x0 + 2.2, y + 1.05, z1 + t / 2, S.wall, { color: S.wallC });
  b.box(x1 - 2.2, y, z1 - t / 2, x1, y + 1.05, z1 + t / 2, S.wall, { color: S.wallC });
  // the counter along the back, a bar top, a foot rail
  const cz = z0 + 1.55, cx0 = x0 + 1.2, cx1 = x1 - (st.style === 'smoke' ? 2.2 : 1.2);
  if (st.style === 'forge') {
    // an I-beam: two flanges and a web, still warm
    b.box(cx0, y, cz - 0.08, cx1, y + 1.0, cz + 0.08, 'metal', { color: S.counterC });
    b.box(cx0, y + 1.0, cz - 0.32, cx1, y + 1.1, cz + 0.32, 'metal', { color: S.topC, collide: false });
    b.box(cx0, y, cz - 0.3, cx1, y + 0.08, cz + 0.3, 'metal', { color: S.counterC, collide: false });
  } else {
    b.box(cx0, y, cz - 0.28, cx1, y + 1.02, cz + 0.28, S.counter, { color: S.counterC });
    b.box(cx0 - 0.05, y + 1.02, cz - 0.36, cx1 + 0.05, y + 1.09, cz + 0.36, S.top, { color: S.topC, collide: false });
  }
  b.box(cx0, y + 0.18, cz + 0.42, cx1, y + 0.22, cz + 0.46, 'metal', { color: [0.7, 0.55, 0.3], collide: false }); // foot rail
  // back bar: shelves (bottles are dressing)
  for (const sh of [1.25, 1.7, 2.15]) b.box(cx0, y + sh, z0 + t / 2, cx1, y + sh + 0.04, z0 + 0.36, 'wood', { color: [0.3, 0.2, 0.14], collide: false });
  b.box(cx0, y, z0 + t / 2, cx1, y + 0.95, z0 + 0.5, 'wood', { color: S.counterC.map((c) => c * 0.85) }); // back cabinet
  // seats: stools at the counter, tables with chairs / cushions
  const seats = [];
  for (let i = 0; i < 5; i++) {
    const sx = cx0 + 0.6 + i * ((cx1 - cx0 - 1.2) / 4);
    stool(b, sx, y, cz + 0.85, S, st.style);
    seats.push({ x: sx + 0.3, z: cz + 0.75, face: Math.PI, kind: 'bar' }); // people lean at the counter
  }
  const tables = st.style === 'candle' ? [[-3, 1.6], [0, 1.9], [3, 1.6]] : [[-3.3, 1.5], [0.2, 2.0], [3.4, 1.3]];
  for (const [tx, tz] of tables) {
    const X = st.x + tx, Z = st.z + tz;
    table(b, X, y, Z, S, st.style);
    for (const a of [0, Math.PI]) {
      const sx = X + Math.sin(a) * 0.8, sz = Z + Math.cos(a) * 0.8;
      // floor cushions: a worn base, a softer top, a button — not a red slab
      if (st.style === 'candle') { b.box(sx - 0.27, y, sz - 0.27, sx + 0.27, y + 0.08, sz + 0.27, 'fabric', { color: [0.3, 0.13, 0.11], collide: false }); b.boxR(sx, y + 0.12, sz, 0.5, 0.08, 0.5, a * 0.3 + 0.2, 'fabric', { color: [0.46, 0.22, 0.17], collide: false }); b.box(sx - 0.03, y + 0.16, sz - 0.03, sx + 0.03, y + 0.175, sz + 0.03, 'fabric', { color: [0.2, 0.1, 0.08], collide: false }); }
      else stool(b, sx, y, sz, S, st.style, 0.46);
      seats.push({ x: sx, z: sz, face: a + Math.PI, kind: 'table' });
    }
  }
  // band corner (left-front), a low riser
  const stage = { x: x0 + 1.4, z: z1 - 1.3 };
  if (st.style !== 'candle') b.box(x0 + 0.2, y, z1 - 2.4, x0 + 2.6, y + 0.18, z1 - 0.2, 'wood', { color: [0.25, 0.17, 0.12], collide: false });
  // special pieces
  if (st.style === 'forge') {
    // arm-wrestling table by the door: an old cask on its end (staves and iron hoops), a scarred top, two grip pegs
    const ax = x1 - 1.6, az = z1 - 1.1;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.boxR(ax + Math.cos(a) * 0.3, y + 0.42, az + Math.sin(a) * 0.3, 0.24, 0.84, 0.06, -a + Math.PI / 2, 'wood', { color: [0.3 + (k % 3) * 0.03, 0.2, 0.13], collide: false }); }
    for (const hy of [0.16, 0.7]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.boxR(ax + Math.cos(a) * 0.335, y + hy, az + Math.sin(a) * 0.335, 0.26, 0.05, 0.02, -a + Math.PI / 2, 'rust', { color: [0.22, 0.2, 0.19], collide: false }); }
    b.collider(ax - 0.36, y, az - 0.36, ax + 0.36, y + 0.86, az + 0.36);
    b.boxR(ax, y + 0.88, az, 0.82, 0.05, 0.6, 0.08, 'wood', { color: [0.33, 0.24, 0.17], collide: false });
    for (const dx of [-0.28, 0.28]) { b.box(ax + dx - 0.02, y + 0.9, az - 0.02, ax + dx + 0.02, y + 1.04, az + 0.02, 'metal', { color: [0.35, 0.33, 0.3], collide: false }); b.box(ax + dx * 0.45 - 0.08, y + 0.905, az - 0.1, ax + dx * 0.45 + 0.08, y + 0.92, az + 0.1, 'fabric', { color: [0.25, 0.2, 0.16], collide: false }); }
  }
  if (st.style === 'smoke') {
    // the bookcase that is very obviously a door
    b.box(x1 - 2.0, y, z0 + t / 2, x1 - 0.4, y + 2.3, z0 + 0.45, 'wood', { color: [0.25, 0.16, 0.1] });
    for (const sh of [0.5, 1.0, 1.5, 2.0]) b.box(x1 - 1.95, y + sh, z0 + 0.1, x1 - 0.45, y + sh + 0.25, z0 + 0.42, 'fabric', { color: [0.3 + rng.next() * 0.3, 0.15, 0.12], collide: false });
  }
  if (st.style === 'trader') {
    // the bargaining pit: a sunken ring of benches in the middle of the room
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.boxR(st.x + Math.cos(a) * 1.3, y + 0.22, st.z + 0.9 + Math.sin(a) * 0.9, 0.9, 0.44, 0.3, -a + Math.PI / 2, 'wood', { color: [0.33, 0.22, 0.15] }); }
  }
  // lanterns inside (the community's pooled lights pick them up at night)
  out.lanterns.push({ x: st.x - W / 4, y: y + H - 0.4, z: st.z, small: true }, { x: st.x + W / 4, y: y + H - 0.4, z: st.z, small: true }, { x: st.x, y: y + H - 0.6, z: z1 + 1.2, small: true });
  // NPC spots by name: counter, seats, stage, the door
  out.spots.push({ x: st.x, z: cz - 0.55, kind: `bar:${st.bar}:counter` });
  seats.forEach((s, i) => out.spots.push({ x: s.x, z: s.z, kind: `bar:${st.bar}:seat${i}`, face: s.face }));
  out.spots.push({ x: stage.x, z: stage.z, kind: `bar:${st.bar}:stage` }, { x: stage.x + 0.8, z: stage.z - 0.2, kind: `bar:${st.bar}:stage2` });
  out.spots.push({ x: st.x + 1.2, z: z1 + 1.3, kind: `bar:${st.bar}:door` });
  (out.bars ||= []).push({ id: st.bar, style: st.style, x: st.x, y, z: st.z, W, D, H, counter: { x0: cx0, x1: cx1, y: y + 1.09, z: cz }, shelves: [1.29, 1.74, 2.19].map((h) => ({ y: y + h, z: z0 + 0.25, x0: cx0 + 0.1, x1: cx1 - 0.1 })), tables: tables.map(([tx, tz]) => ({ x: st.x + tx, y: y + 0.78, z: st.z + tz })), stage, front: z1, sign: { x: st.x, y: y + H + 0.55, z: z1 + 0.4, w: Math.min(W - 1, 7.5) } });
  // talk to the bartender from across the counter
  b.interact({ kind: 'bar', id: 'bar:' + st.bar, radius: 2.6, pos: new THREE.Vector3(st.x, y + 1.3, cz + 0.6), prompt: (c) => c.nightlife?.prompt(st.bar) || 'The bar', onUse: (c) => c.nightlife?.open(st.bar) });
}

function stool(b, x, y, z, S, style, h = 0.66) {
  if (style === 'forge') { // an upturned bucket on a pipe
    b.box(x - 0.03, y, z - 0.03, x + 0.03, y + h - 0.06, z + 0.03, 'metal', { color: [0.3, 0.3, 0.3], collide: false });
    b.box(x - 0.19, y + h - 0.06, z - 0.19, x + 0.19, y + h + 0.02, z + 0.19, 'rust', { color: [0.45, 0.3, 0.2], collide: false });
    return;
  }
  for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) b.box(x + dx - 0.02, y, z + dz - 0.02, x + dx + 0.02, y + h, z + dz + 0.02, 'wood', { color: [0.3, 0.2, 0.14], collide: false });
  b.box(x - 0.18, y + h, z - 0.18, x + 0.18, y + h + 0.06, z + 0.18, 'wood', { color: S.topC.map((c) => c * 0.8), collide: false });
}
function table(b, x, y, z, S, style) {
  const h = style === 'candle' ? 0.38 : 0.76;
  if (style === 'forge') { // a cable drum
    b.box(x - 0.42, y, z - 0.42, x + 0.42, y + 0.06, z + 0.42, 'wood', { color: [0.4, 0.3, 0.2], collide: false });
    b.box(x - 0.15, y, z - 0.15, x + 0.15, y + h, z + 0.15, 'wood', { color: [0.35, 0.25, 0.17] });
    b.box(x - 0.5, y + h - 0.06, z - 0.5, x + 0.5, y + h, z + 0.5, 'wood', { color: [0.42, 0.32, 0.22], collide: false });
    return;
  }
  b.box(x - 0.05, y, z - 0.05, x + 0.05, y + h, z + 0.05, 'wood', { color: [0.25, 0.18, 0.12] });
  b.box(x - 0.45, y + h - 0.05, z - 0.4, x + 0.45, y + h, z + 0.4, style === 'smoke' ? 'metal' : 'wood', { color: S.topC.map((c) => c * 0.9), collide: false });
}
export const BAR_STYLES = Object.keys(STYLE);
void THREE;
