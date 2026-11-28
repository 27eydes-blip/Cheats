// The two lairs, built only when the player is within the stream radius and torn down after.
// Each builder returns { group, boxes: [[minX,minY,minZ,maxX,maxY,maxZ]] (world), spots: {...} (world points),
// flicker: [lights], stains: [meshes] } — the Killers system adds colliders and interactables.
// Cheap: shared materials, instanced bars and lanterns, one flickering lamp each. No glow outside, nothing
// that marks the place from a distance.
import * as THREE from 'three';

let M = null;
function mats() {
  if (M) return M;
  const S = (color, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  M = {
    rust: S(0x4a3426, 0.85, 0.35), rustDark: S(0x2c211b, 0.9, 0.3), tar: S(0x16130f, 0.7), wood: S(0x4b3a29), plank: S(0x3a2e22),
    rope: S(0x6f6247, 0.95), net: new THREE.MeshStandardMaterial({ color: 0x5c5848, roughness: 1, wireframe: true, side: THREE.DoubleSide }),
    concrete: S(0x3b3e3c, 0.95), concreteDark: S(0x262a2a, 0.95), brass: S(0x6b5a36, 0.5, 0.7),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c1d18, roughness: 0.25, metalness: 0.1 }),
    stain: new THREE.MeshStandardMaterial({ color: 0x1d1310, roughness: 0.4, transparent: true, opacity: 0.85, depthWrite: false }),
    blood: new THREE.MeshStandardMaterial({ color: 0x3a0b08, roughness: 0.3, transparent: true, opacity: 0.85, depthWrite: false }),
    bulb: new THREE.MeshStandardMaterial({ color: 0x2a2010, emissive: 0xffa040, emissiveIntensity: 1.6 }),
    tin: S(0x6d6a5e, 0.5, 0.6), cloth: S(0x3c3a44), shoe: S(0x2d2219),
  };
  return M;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

// ---------------------------------------------------------------- the Netmaker: a half-sunk barge hull
// interior floor at y 0.6 (above the outside water, below the hull's rim — "under the waterline" of the
// deck above), 6 m wide × 16 m long, closed by the deck at y 2.6
export function buildBarge(pos, opts = {}) {
  const m = mats(), g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); g.rotation.y = opts.yaw ?? 0.4;
  const W = 6, L = 16, floorY = 0.6, deckY = 2.6;
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // hull: sides down into the water, a rolled rim, the deck with a hatch
  add(box(0.3, 4.4, L, m.rust), -W / 2, 0.6, 0); add(box(0.3, 4.4, L, m.rust), W / 2, 0.6, 0);
  add(box(W, 4.4, 0.3, m.rust), 0, 0.6, -L / 2); add(box(W, 4.4, 0.3, m.rust), 0, 0.6, L / 2);
  add(box(W + 0.6, 0.25, L + 0.6, m.rustDark), 0, deckY + 0.12, 0);
  add(box(1.2, 0.08, 1.2, m.tar), 0, deckY + 0.28, -5);          // the hatch, wired shut
  add(box(W - 0.4, 0.2, L - 0.4, m.plank), 0, floorY - 0.1, 0);   // the floor inside
  // the loose grate: a dark square at the waterline on the starboard side
  const grate = add(box(0.1, 0.9, 1.1, m.rustDark), W / 2 + 0.18, 0.35, 4.5);
  for (let i = -2; i <= 2; i++) add(box(0.12, 0.85, 0.04, m.rust), W / 2 + 0.22, 0.35, 4.5 + i * 0.2);
  const inside = new THREE.Group(); g.add(inside);
  const flicker = [];
  if (!opts.empty) {
    // nets hung like curtains from the beams
    for (let i = 0; i < 9; i++) {
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + (i % 3) * 0.5, 1.8, 6, 5), m.net);
      net.position.set(-1.6 + (i % 3) * 1.6, deckY - 1.0, -6 + i * 1.5); net.rotation.y = (i % 2 ? 0.3 : -0.2);
      const p = net.geometry.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 2 + i) * 0.15 + (p.getY(k) < 0 ? -p.getY(k) * 0.2 : 0));
      inside.add(net);
    }
    // rope cages: one instanced set of bars for all three cages
    const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 4), m.rope, 3 * 12);
    const dm = new THREE.Matrix4(); let n = 0;
    for (const [cx, cz] of [[-1.7, 3.5], [1.7, 3.5], [-1.7, 6.2]]) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; dm.makeTranslation(cx + Math.cos(a) * 0.55, floorY + 0.95, cz + Math.sin(a) * 0.55); bars.setMatrixAt(n++, dm); }
    inside.add(bars);
    for (const [cx, cz] of [[-1.7, 3.5], [1.7, 3.5], [-1.7, 6.2]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 4, 16), m.rope); ring.rotation.x = Math.PI / 2; ring.position.set(cx, floorY + 1.9, cz); inside.add(ring); }
    // the trophy shelf: found things, each tied with the same knots
    if (!opts.trophiesHidden) {
      add(box(0.4, 0.06, 3.2, m.wood), W / 2 - 0.45, floorY + 1.2, -2.6);
      const things = [[box(0.12, 0.08, 0.26, m.shoe), 0], [box(0.1, 0.02, 0.07, m.tin), 0.5], [box(0.2, 0.03, 0.05, m.cloth), 0.9], [new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 10), m.cloth), 1.3], [box(0.08, 0.14, 0.08, m.glass), 1.7], [box(0.16, 0.04, 0.12, m.tin), 2.1]];
      for (const [mesh, dz] of things) { mesh.position.set(W / 2 - 0.45, floorY + 1.28, -3.9 + dz); inside.add(mesh); }
    }
    // the workbench, tools, and the tin box underneath it
    add(box(1.6, 0.08, 0.7, m.wood), -W / 2 + 0.6, floorY + 0.9, -5.6);
    for (const [x, z] of [[-W / 2 + 0.1, -5.9], [-W / 2 + 1.1, -5.9], [-W / 2 + 0.1, -5.3], [-W / 2 + 1.1, -5.3]]) add(box(0.06, 0.9, 0.06, m.wood), x, floorY + 0.45, z);
    add(box(0.28, 0.16, 0.2, m.tin), -W / 2 + 0.6, floorY + 0.08, -5.6);
  } else {
    // empty: bare hooks, a dragged-out path, the stove left warm
    for (let i = 0; i < 6; i++) add(box(0.04, 0.25, 0.04, m.rust), -1.6 + (i % 3) * 1.6, deckY - 0.2, -5 + i * 2);
    add(box(0.7, 0.01, 6, m.stain), 0.4, floorY + 0.01, 1);
  }
  // one lamp, swinging, guttering
  add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.bulb), 0.3, deckY - 0.5, -4.5);
  const lamp = new THREE.PointLight(0xffa04a, 2.2, 9, 2); lamp.position.set(0.3, deckY - 0.6, -4.5); g.add(lamp); flicker.push(lamp);
  // stains: dark and old with mature content off; with it on, some are red and newer
  const stains = [];
  for (const [x, z, s] of [[-1.7, 3.5, 1.1], [1.7, 3.5, 0.8], [0.2, -1.5, 1.4], [-1.5, -5.2, 0.6]]) {
    const st = new THREE.Mesh(new THREE.CircleGeometry(s * 0.5, 14), opts.mature ? m.blood : m.stain); st.rotation.x = -Math.PI / 2; st.position.set(x, floorY + 0.012, z); g.add(st); stains.push(st);
  }
  g.updateMatrixWorld(true);
  const W2 = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  // colliders (world AABBs of the rotated hull, approximated per wall segment)
  const boxes = [];
  const seg = (x0, z0, x1, z1, y0, y1, t = 0.35) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5); for (let i = 0; i < n; i++) { const a = W2(x0 + (x1 - x0) * (i + 0.5) / n, 0, z0 + (z1 - z0) * (i + 0.5) / n); boxes.push([a.x - t - 0.4, y0, a.z - t - 0.4, a.x + t + 0.4, y1, a.z + t + 0.4]); } };
  seg(-W / 2, -L / 2, -W / 2, L / 2, -2, deckY + 0.3); seg(W / 2, -L / 2, W / 2, L / 2, -2, deckY + 0.3); seg(-W / 2, -L / 2, W / 2, -L / 2, -2, deckY + 0.3); seg(-W / 2, L / 2, W / 2, L / 2, -2, deckY + 0.3);
  // floor and deck, as a grid of small boxes so the rotation doesn't matter much
  for (let x = -W / 2 + 0.75; x < W / 2; x += 1.5) for (let z = -L / 2 + 0.75; z < L / 2; z += 1.5) {
    const c = W2(x, 0, z); boxes.push([c.x - 0.8, floorY - 0.3, c.z - 0.8, c.x + 0.8, floorY, c.z + 0.8]); boxes.push([c.x - 0.8, deckY, c.z - 0.8, c.x + 0.8, deckY + 0.25, c.z + 0.8]);
  }
  return {
    group: g, boxes, flicker, stains, inside,
    spots: {
      safeOut: W2(0, deckY + 0.4, -5), secondOut: W2(W / 2 + 0.9, 0.3, 4.5),
      safeIn: W2(0, floorY + 0.1, -4.2), secondIn: W2(W / 2 - 1.2, floorY + 0.1, 4.5),
      proof: W2(-W / 2 + 0.6, floorY + 0.2, -5.6), shelf: W2(W / 2 - 0.6, floorY + 1.2, -2.6), far: W2(0, floorY + 0.1, 7), centre: W2(0, floorY + 1.4, 0),
      inside: (p) => { const l = g.worldToLocal(p.clone()); return Math.abs(l.x) < W / 2 && Math.abs(l.z) < L / 2 && l.y > floorY - 0.5 && l.y < deckY; },
    },
  };
}

// ---------------------------------------------------------------- the Lamplighter: a drowned tower's sealed floor
// flooded floor between y -8 (floor) and -3 (the sealed ceiling); the tower's broken top stands 4 m out of the water
export function buildTower(pos, opts = {}) {
  const m = mats(), g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); g.rotation.y = opts.yaw ?? -0.3;
  const S = 12, floorY = -8, ceilY = -3, top = 4;
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const H = top - floorY + 1;
  add(box(0.5, H, S, m.concrete), -S / 2, (top + floorY - 1) / 2, 0); add(box(0.5, H, S, m.concrete), S / 2, (top + floorY - 1) / 2, 0);
  add(box(S, H, 0.5, m.concrete), 0, (top + floorY - 1) / 2, -S / 2); add(box(S, H, 0.5, m.concrete), 0, (top + floorY - 1) / 2, S / 2);
  add(box(S, 0.4, S, m.concreteDark), 0, floorY - 0.2, 0); add(box(S, 0.4, S, m.concreteDark), 0, ceilY + 0.2, 0);
  // the broken top: a few beams and a dead lamp on a pole
  for (let i = 0; i < 3; i++) add(box(S * 0.8, 0.3, 0.3, m.rustDark), (i - 1) * 0.8, top - 0.3, -2 + i * 2.5).rotation.y = 0.1 * i;
  add(box(0.08, 2.2, 0.08, m.rustDark), S / 2 - 1, top + 1.1, S / 2 - 1);
  add(box(0.3, 0.4, 0.3, m.glass), S / 2 - 1, top + 2.3, S / 2 - 1);
  // the dive route: a buoy at the surface off the east wall, a lamp chained below it at diving depth
  add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), m.rustDark), S / 2 + 2.5, 0.05, 1.5);
  add(box(0.04, 4.2, 0.04, m.rope), S / 2 + 2.5, -2.1, 1.5);
  add(box(0.22, 0.32, 0.22, m.glass), S / 2 + 2.5, -4.3, 1.5);
  // the second way in: a gap in the rubble on the west side, low down
  for (let i = 0; i < 7; i++) add(box(0.8 + Math.random() * 0.8, 0.5 + Math.random() * 0.6, 0.8 + Math.random(), m.concreteDark), -S / 2 - 1 - Math.random() * 1.5, floorY + 0.3 + Math.random() * 0.6, -3 + i * 0.9).rotation.set(Math.random(), Math.random(), Math.random());
  // hundreds of dead lanterns: shelves on three walls and clusters on the floor, all one instanced mesh
  const lgeo = new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8); lgeo.translate(0, 0.15, 0);
  const shelves = [];
  const want = opts.empty ? 140 : 340;
  const lan = new THREE.InstancedMesh(lgeo, m.glass, want), cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.11, 0.08, 8), m.brass, want);
  const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let n = 0;
  const put = (x, y, z, tilt = 0) => { if (n >= want) return; q.setFromEuler(new THREE.Euler(tilt, Math.random() * 6, tilt * 0.5)); mt.compose(p.set(x, y, z), q, sc); lan.setMatrixAt(n, mt); mt.compose(p.set(x, y + 0.32, z), q, sc); cap.setMatrixAt(n, mt); n++; };
  for (const [wx, wz, ax] of [[-S / 2 + 0.6, 0, 'z'], [S / 2 - 0.6, 0, 'z'], [0, -S / 2 + 0.6, 'x']]) for (let row = 0; row < 4; row++) {
    const y = floorY + 0.5 + row * 1.1;
    const sh = box(ax === 'z' ? 0.7 : S - 2, 0.06, ax === 'z' ? S - 2 : 0.7, m.plank); sh.position.set(wx, y - 0.03, wz); g.add(sh); shelves.push(sh);
    for (let k = 0; k < 24; k++) { const t = -S / 2 + 1.3 + k * ((S - 2.6) / 23); put(ax === 'z' ? wx : t, y, ax === 'z' ? t : wz); }
  }
  while (n < want) put((Math.random() - 0.5) * (S - 4), floorY, (Math.random() - 0.5) * (S - 5) + 1, Math.random() < 0.3 ? 1.4 : 0);
  lan.count = cap.count = n; g.add(lan, cap);
  // the wall of names (south wall, inside)
  const names = nameWall(opts.names || []);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(S - 1.2, ceilY - floorY - 0.4), new THREE.MeshStandardMaterial({ map: names, roughness: 0.95, color: 0x8c8c86 }));
  wall.position.set(0, (floorY + ceilY) / 2, S / 2 - 0.27); wall.rotation.y = Math.PI; g.add(wall);
  // the locked inner room in the north-east corner, with the helmet behind its door
  add(box(0.25, ceilY - floorY, 3.6, m.concreteDark), S / 2 - 3.8, (floorY + ceilY) / 2, -S / 2 + 2);
  add(box(3.6, ceilY - floorY, 0.25, m.concreteDark), S / 2 - 2, (floorY + ceilY) / 2, -S / 2 + 3.8);
  const door = add(box(0.12, 2, 1.1, m.rust), S / 2 - 3.8, floorY + 1, -S / 2 + 2.6);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), m.brass), S / 2 - 1.6, floorY + 1.4, -S / 2 + 1.6);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.bulb), S / 2 - 1.6, floorY + 1.5, -S / 2 + 1.35);
  add(box(0.08, 1.2, 0.08, m.rustDark), S / 2 - 1.6, floorY + 0.6, -S / 2 + 1.6);
  // a faint cold light from the helmet's lamp through the door crack, and nothing else
  const glow = new THREE.PointLight(0x9fc4d8, 1.2, 10, 2); glow.position.set(S / 2 - 2.2, floorY + 1.5, -S / 2 + 2.2); g.add(glow);
  const stains = [];
  for (const [x, z] of [[-1, 1], [2, -1.5]]) { const st = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14), opts.mature ? m.blood : m.stain); st.rotation.x = -Math.PI / 2; st.position.set(x, floorY + 0.02, z); g.add(st); stains.push(st); }
  g.updateMatrixWorld(true);
  const W2 = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  const boxes = [];
  const seg = (x0, z0, x1, z1, y0, y1) => { const n2 = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5); for (let i = 0; i < n2; i++) { const a = W2(x0 + (x1 - x0) * (i + 0.5) / n2, 0, z0 + (z1 - z0) * (i + 0.5) / n2); boxes.push([a.x - 0.7, y0, a.z - 0.7, a.x + 0.7, y1, a.z + 0.7]); } };
  seg(-S / 2, -S / 2, -S / 2, S / 2, floorY - 1, top); seg(S / 2, -S / 2, S / 2, S / 2, floorY - 1, top); seg(-S / 2, -S / 2, S / 2, -S / 2, floorY - 1, top); seg(-S / 2, S / 2, S / 2, S / 2, floorY - 1, top);
  for (let x = -S / 2 + 0.75; x < S / 2; x += 1.5) for (let z = -S / 2 + 0.75; z < S / 2; z += 1.5) { const c = W2(x, 0, z); boxes.push([c.x - 0.8, floorY - 0.4, c.z - 0.8, c.x + 0.8, floorY, c.z + 0.8]); boxes.push([c.x - 0.8, ceilY, c.z - 0.8, c.x + 0.8, ceilY + 0.4, c.z + 0.8]); }
  return {
    group: g, boxes, flicker: [glow], stains, door, lanterns: n,
    spots: {
      safeOut: W2(S / 2 + 2.5, -3.6, 1.5), secondOut: W2(-S / 2 - 1.6, floorY + 0.8, 0),
      safeIn: W2(S / 2 - 1.5, -5, 1.5), secondIn: W2(-S / 2 + 1.5, floorY + 1, 0),
      door: W2(S / 2 - 4.2, floorY + 1, -S / 2 + 2.6), proof: W2(S / 2 - 1.6, floorY + 1.2, -S / 2 + 1.6),
      wall: W2(0, floorY + 2.5, S / 2 - 1.2), far: W2(-3, floorY + 1, -3), centre: W2(0, floorY + 2.4, -1),
      inside: (pt) => { const l = g.worldToLocal(pt.clone()); return Math.abs(l.x) < S / 2 && Math.abs(l.z) < S / 2 && l.y > floorY - 0.5 && l.y < ceilY; },
    },
  };
}

// scratched names, floor to ceiling, oldest at the top; the newest (victims) low and fresh
function nameWall(recent) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#3c3f3c'; x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${20 + Math.random() * 30},${22 + Math.random() * 30},${20 + Math.random() * 25},0.25)`; x.fillRect(Math.random() * 1024, Math.random() * 512, 2 + Math.random() * 8, 2 + Math.random() * 8); }
  const first = ['Ada', 'Bel', 'Cato', 'Dov', 'Esme', 'Finn', 'Gale', 'Hob', 'Ivy', 'Jory', 'Kes', 'Lark', 'Mabe', 'Ned', 'Ona', 'Pim', 'Quin', 'Rue', 'Sol', 'Tam', 'Una', 'Vik', 'Wynn', 'Yara', 'Zeb'];
  const last = ['Ashby', 'Brack', 'Cole', 'Dunmore', 'Ell', 'Fenn', 'Grey', 'Hale', 'Inch', 'Joss', 'Kerr', 'Lowe', 'Marsh', 'Nye', 'Orme', 'Pike', 'Reed', 'Shaw', 'Teal', 'Vane', 'Wade'];
  x.font = '15px Georgia'; x.textBaseline = 'top';
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 26; row++) for (let col = 0; col < 7; col++) {
    x.fillStyle = `rgba(200,200,190,${0.25 + r() * 0.35})`;
    x.fillText(`${first[Math.floor(r() * first.length)]} ${last[Math.floor(r() * last.length)]}`, 12 + col * 145 + r() * 10, 6 + row * 17 + r() * 3);
  }
  x.font = '17px Georgia';
  recent.forEach((nm, i) => { x.fillStyle = 'rgba(235,232,220,0.85)'; x.fillText(nm, 40 + (i % 5) * 190, 470 - Math.floor(i / 5) * 20); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- figures: silhouettes, never faces
export function figure(kind) {
  const m = mats(), g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: kind === 'victim' ? 0x3a3630 : 0x0b0c0d, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.0, 4, 8), dark); body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(kind === 'lamplighter' ? 0.3 : 0.15, 10, 8), kind === 'lamplighter' ? m.brass : dark); head.position.y = 1.72; g.add(head);
  if (kind === 'lamplighter') {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.bulb); lamp.position.set(0, 1.78, 0.28); g.add(lamp);
    const l = new THREE.PointLight(0xffc070, 2.5, 14, 2); l.position.set(0, 1.8, 0.4); g.add(l);
  }
  if (kind === 'netmaker') { const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 10, Math.PI * 1.4), m.rustDark); hook.position.set(0.32, 0.9, 0.1); g.add(hook); }
  g.userData.body = body; g.userData.head = head;
  return g;
}
