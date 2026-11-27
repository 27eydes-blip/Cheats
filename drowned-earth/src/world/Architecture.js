import * as THREE from 'three';
import { boxGeometry } from './Builder.js';

// Reusable architectural pieces shared by procedural chunks and landmarks.
export const FLOOR_H = 3.4;
const PALETTE = [
  [0.62, 0.6, 0.56], [0.7, 0.66, 0.58], [0.52, 0.5, 0.48], [0.6, 0.45, 0.38], [0.75, 0.74, 0.7],
  [0.45, 0.47, 0.5], [0.66, 0.58, 0.48], [0.56, 0.55, 0.5],
];
const GLASS = [[0.28, 0.33, 0.36], [0.22, 0.26, 0.27], [0.32, 0.34, 0.3]];

export function facadeStyle(rng, h) {
  const curtain = h > 55 && rng.chance(0.45);
  return {
    color: curtain ? rng.pick(GLASS) : rng.pick(PALETTE),
    meta: [curtain ? 2 : 1, rng.next(), rng.range(0.2, 1), rng.next()],
  };
}

// A solid tower with ledges and roof clutter. Returns roof height.
export function tower(b, rng, s, near, inst) {
  const { x0, z0, x1, z1, base, h } = s;
  const style = s.style || facadeStyle(rng, h);
  const top = h;
  const faces = ['px', 'nx', 'pz', 'nz', 'py'];
  if (s.enterable && near) {
    enterableFloors(b, rng, s, style);
  } else {
    b.box(x0, base, z0, x1, top, z1, 'facade', { color: style.color, meta: style.meta, faces, uvWorld: false });
  }
  if (!near) return top;
  // cornices every few floors
  const every = rng.int(3, 6) * FLOOR_H;
  const cc = style.color.map((c) => c * 0.85);
  for (let y = every; y < top - 2; y += every) b.box(x0 - 0.25, y, z0 - 0.25, x1 + 0.25, y + 0.35, z1 + 0.25, 'concrete', { color: cc, collide: false, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  // parapet
  const p = 0.3, ph = 1.1;
  const pc = style.color.map((c) => c * 0.9);
  b.box(x0, top, z0, x1, top + ph, z0 + p, 'concrete', { color: pc });
  b.box(x0, top, z1 - p, x1, top + ph, z1, 'concrete', { color: pc });
  b.box(x0, top, z0 + p, x0 + p, top + ph, z1 - p, 'concrete', { color: pc });
  b.box(x1 - p, top, z0 + p, x1, top + ph, z1 - p, 'concrete', { color: pc });
  // roof clutter
  const w = x1 - x0, d = z1 - z0;
  if (w > 8 && d > 8) {
    const hx = rng.range(x0 + 2, x1 - 6), hz = rng.range(z0 + 2, z1 - 6);
    b.box(hx, top, hz, hx + 4, top + 3, hz + 3.5, 'concrete', { color: pc }); // stair hut
    if (rng.chance(0.5)) inst.add('waterTank', 'wood', rng.range(x0 + 3, x1 - 3), top, rng.range(z0 + 3, z1 - 3), { ry: rng.range(0, 6) });
    const ac = rng.int(0, 4);
    for (let i = 0; i < ac; i++) inst.add('acUnit', 'metal', rng.range(x0 + 1.5, x1 - 1.5), top, rng.range(z0 + 1.5, z1 - 1.5), { ry: rng.pick([0, Math.PI / 2]) });
    if (rng.chance(0.35)) inst.add('antenna', 'metal', rng.range(x0 + 2, x1 - 2), top, rng.range(z0 + 2, z1 - 2), { rz: rng.range(-0.15, 0.15) });
    if (h > 40 && rng.chance(0.6)) for (let i = 0; i < 3; i++) inst.add('nest', 'wood', rng.pick([x0 + 0.4, x1 - 0.4]), top + ph, rng.range(z0 + 1, z1 - 1));
  }
  return top;
}

// Building whose first floor above water is hollow and walkable (optionally a
// flooded floor below). The rest is a solid facade shell.
export function enterableFloors(b, rng, s, style) {
  const { x0, z0, x1, z1, base, h } = s;
  const fy = 0.45, cy = fy + 3.3, t = 0.35;
  const flooded = s.flooded;
  const lowY = -3.1;
  const dark = [0.36, 0.36, 0.35];
  const darker = [0.22, 0.24, 0.23];
  // below
  if (flooded) {
    b.box(x0, base, z0, x1, lowY, z1, 'facade', { color: style.color, meta: style.meta, faces: ['px', 'nx', 'pz', 'nz'] });
    b.box(x0 + t, lowY - 0.3, z0 + t, x1 - t, lowY, z1 - t, 'tile', { color: darker });
    const lowOps = [];
    for (let a = x0 + 3; a < x1 - 2; a += 5) lowOps.push({ at: a, w: 1.6, h: 1.4, bottom: 0.9 });
    b.wall('x', x0, x1, z0 + t / 2, lowY, fy - 0.3, t, 'concrete', lowOps, { color: dark });
    b.wall('x', x0, x1, z1 - t / 2, lowY, fy - 0.3, t, 'concrete', [], { color: dark });
    b.wall('z', z0 + t, z1 - t, x0 + t / 2, lowY, fy - 0.3, t, 'concrete', [], { color: dark });
    b.wall('z', z0 + t, z1 - t, x1 - t / 2, lowY, fy - 0.3, t, 'concrete', [], { color: dark });
    // slab with a hole to dive through
    const hx = (x0 + x1) / 2 + rng.range(-2, 2), hz = (z0 + z1) / 2 + rng.range(-2, 2);
    slabWithHole(b, x0, z0, x1, z1, fy - 0.3, fy, hx - 1.2, hz - 1.2, hx + 1.2, hz + 1.2, 'tile', dark);
    s.diveHole = [hx, hz];
  } else {
    b.box(x0, base, z0, x1, fy, z1, 'facade', { color: style.color, meta: style.meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  }
  // walkable floor walls with window holes and one breach on the mooring side
  const ops = (a0, a1, breachAt) => {
    const o = [];
    for (let a = a0 + 2.2; a < a1 - 1.5; a += 4.2) {
      if (breachAt !== null && Math.abs(a - breachAt) < 2.8) continue;
      o.push({ at: a, w: 1.7, h: 1.5, bottom: 0.95 });
    }
    if (breachAt !== null) o.push({ at: breachAt, w: 2.3, h: 2.5, bottom: 0 });
    return o;
  };
  const side = s.breachSide || 'pz';
  const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2;
  b.wall('x', x0, x1, z0 + t / 2, fy, cy, t, 'concrete', ops(x0, x1, side === 'nz' ? bx : null), { color: style.color });
  b.wall('x', x0, x1, z1 - t / 2, fy, cy, t, 'concrete', ops(x0, x1, side === 'pz' ? bx : null), { color: style.color });
  b.wall('z', z0 + t, z1 - t, x0 + t / 2, fy, cy, t, 'concrete', ops(z0, z1, side === 'nx' ? bz : null), { color: style.color });
  b.wall('z', z0 + t, z1 - t, x1 - t / 2, fy, cy, t, 'concrete', ops(z0, z1, side === 'px' ? bz : null), { color: style.color });
  // ceiling + upper shell
  b.box(x0 + t, cy - 0.05, z0 + t, x1 - t, cy + 0.3, z1 - t, 'concrete', { color: darker, faces: ['ny'] });
  b.box(x0, cy, z0, x1, h, z1, 'facade', { color: style.color, meta: style.meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  // interior columns
  for (let x = x0 + 6; x < x1 - 4; x += 7) for (let z = z0 + 6; z < z1 - 4; z += 7) {
    if (s.diveHole && Math.hypot(x - s.diveHole[0], z - s.diveHole[1]) < 2.5) continue;
    b.box(x - 0.3, fy, z - 0.3, x + 0.3, cy, z + 0.3, 'concrete', { color: dark });
  }
  s.floorY = fy; s.ceilY = cy;
  const mid = { pz: [bx, z1], nz: [bx, z0], px: [x1, bz], nx: [x0, bz] }[side];
  const n = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] }[side];
  s.mooring = { pos: new THREE.Vector3(mid[0] + n[0] * 2.6, 0, mid[1] + n[1] * 2.6), step: new THREE.Vector3(mid[0] - n[0] * 1.4, fy, mid[1] - n[1] * 1.4), facing: Math.atan2(n[0], n[1]) };
}

export function slabWithHole(b, x0, z0, x1, z1, y0, y1, hx0, hz0, hx1, hz1, key, color) {
  b.box(x0, y0, z0, x1, y1, hz0, key, { color });
  b.box(x0, y0, hz1, x1, y1, z1, key, { color });
  b.box(x0, y0, hz0, hx0, y1, hz1, key, { color });
  b.box(hx1, y0, hz0, x1, y1, hz1, key, { color });
}

// Ladder geometry + climb interactable. facing = direction the climber faces (towards the wall).
export function ladder(b, x, z, y0, y1, ry, { id, prompt = 'Climb', topStep = null, bottomStep = null } = {}) {
  const len = y1 - y0;
  const dx = Math.cos(ry) * 0.25, dz = -Math.sin(ry) * 0.25;
  b.box(x - dx - 0.03, y0, z - dz - 0.03, x - dx + 0.03, y1 + 1, z - dz + 0.03, 'rust', { collide: false, color: [0.6, 0.55, 0.5] });
  b.box(x + dx - 0.03, y0, z + dz - 0.03, x + dx + 0.03, y1 + 1, z + dz + 0.03, 'rust', { collide: false, color: [0.6, 0.55, 0.5] });
  for (let y = y0 + 0.3; y < y1 + 0.9; y += 0.35) b.boxR(x, y, z, 0.5, 0.035, 0.035, ry, 'rust', { color: [0.6, 0.55, 0.5] });
  const bottom = new THREE.Vector3(x, y0, z), top = new THREE.Vector3(x, y1, z);
  b.interact({
    id: id && id + ':up', kind: 'ladder', pos: bottom.clone().setY(Math.max(y0, 0) + 1.2), radius: 2.6, prompt,
    onUse: (ctx) => ctx.player.climb(bottom, top, topStep),
  });
  b.interact({
    id: id && id + ':down', kind: 'ladder', pos: top.clone().setY(y1 + 0.8), radius: 2.0, prompt: 'Climb down',
    onUse: (ctx) => ctx.player.climb(top, bottom, bottomStep, true),
  });
}

export function mooring(b, m, label = 'Tie up and climb off') {
  b.interact({
    kind: 'mooring', mode: 'boat', pos: m.pos.clone().setY(0.8), radius: 9, requireLook: false,
    prompt: label,
    onUse: (ctx) => ctx.boat.tieUp(m),
  });
}

// A searchable container. type → loot table id in data/loot.json
export function container(b, id, type, x, y, z, ry = 0, size = [0.9, 0.8, 0.6], key = 'metal', color = [0.45, 0.48, 0.44]) {
  b.boxR(x, y + size[1] / 2, z, size[0], size[1], size[2], ry, key, { color, collide: true });
  b.interact({
    id, kind: 'container', pos: new THREE.Vector3(x, y + size[1] * 0.7, z), radius: 2.2,
    prompt: (ctx) => (ctx.loot.isLooted(id) ? '' : 'Search ' + (ctx.data.lootTables[type]?.label || type)),
    enabled: (ctx) => !ctx.loot.isLooted(id),
    onUse: (ctx) => ctx.loot.open(id, type),
  });
}

// A readable / audible log placed in the world
export function logItem(b, logId, x, y, z, ry = 0, form = 'note') {
  const col = form === 'recorder' ? [0.15, 0.15, 0.14] : [0.86, 0.83, 0.74];
  const g = form === 'recorder' ? [0.18, 0.06, 0.11] : [0.22, 0.01, 0.3];
  b.boxR(x, y + g[1] / 2, z, g[0], g[1], g[2], ry, form === 'recorder' ? 'plastic' : 'fabric', { color: col });
  b.interact({
    id: 'log:' + logId, kind: 'log', pos: new THREE.Vector3(x, y + 0.1, z), radius: 2.2,
    prompt: (ctx) => (ctx.story.hasLog(logId) ? 'Read again' : form === 'recorder' ? 'Play recording' : 'Read'),
    onUse: (ctx) => ctx.story.openLog(logId),
  });
}

// Wall-mounted sign. Normal faces +z rotated by ry.
export function sign(b, x, y, z, w, h, ry, def, inst) {
  const geom = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geom, inst.signMaterial(def));
  mesh.position.set(x - b.origin.x, y - b.origin.y, z - b.origin.z);
  mesh.rotation.y = ry;
  mesh.receiveShadow = true;
  b.object(mesh);
  return mesh;
}

export { boxGeometry };

// Hollow storey: perimeter walls with openings per side, optional floor slab.
// openings: { nz:[{at,w,h,bottom}], pz:[], nx:[], px:[] } — `at` is the world coordinate along the wall.
export function storey(b, x0, z0, x1, z1, y0, y1, o = {}) {
  const t = o.t ?? 0.35, key = o.wallKey || 'concrete', color = o.color || [0.6, 0.6, 0.58];
  const op = o.openings || {};
  if (o.floor !== false) {
    if (o.hole) slabWithHole(b, x0, z0, x1, z1, y0 - 0.3, y0, ...o.hole, o.floorKey || 'tile', o.floorColor || [0.45, 0.44, 0.42]);
    else b.box(x0, y0 - 0.3, z0, x1, y0, z1, o.floorKey || 'tile', { color: o.floorColor || [0.45, 0.44, 0.42] });
  }
  b.wall('x', x0, x1, z0 + t / 2, y0, y1, t, key, op.nz || [], { color });
  b.wall('x', x0, x1, z1 - t / 2, y0, y1, t, key, op.pz || [], { color });
  b.wall('z', z0 + t, z1 - t, x0 + t / 2, y0, y1, t, key, op.nx || [], { color });
  b.wall('z', z0 + t, z1 - t, x1 - t / 2, y0, y1, t, key, op.px || [], { color });
}

export function windowsAlong(a0, a1, every = 4, w = 1.6, h = 1.5, bottom = 0.95, skip = []) {
  const out = [];
  for (let a = a0 + every / 2; a < a1 - 1; a += every) {
    if (skip.some((s) => Math.abs(s - a) < w + 0.6)) continue;
    out.push({ at: a, w, h, bottom });
  }
  return out;
}
