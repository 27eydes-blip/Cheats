import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Lofted boat hulls. A hull is swept from stern (u=0) to bow (u=1): each
// station is a smooth cross-section from the keel up to the gunwale, shaped by
// deadrise (V-ness), flare and beam; the sheer line rises toward the bow; the
// stern ends in a transom. Vertex colours paint the bottom, boot stripe and
// topsides. Parts (cabin, windshield, tires, foils, light bar…) are added on
// top. Boats face -z (bow at -z), matching the player's boat.
const NU = 44, NV = 9;

function section(h, u) {
  const L = h.length, B = h.beam / 2, D = h.depth;
  // half-beam along the length: transom → full at 40% → bow point
  let b;
  if (u < 0.42) b = B * (h.transom + (1 - h.transom) * Math.sin((u / 0.42) * Math.PI / 2));
  else b = B * Math.cos(Math.pow((u - 0.42) / 0.58, 1.2 + h.bow * 1.4) * Math.PI / 2);
  b = Math.max(0.002, b);
  const keel = -D * 0.55 * (1 - 0.65 * Math.pow(Math.max(0, (u - 0.7) / 0.3), 1.6));
  const sheer = D * 0.45 + h.sheer * D * Math.pow(u, 2.2);
  return { b, keel, sheer, z: (0.5 - u) * L };
}

export function hullGeometry(h, colors) {
  const pos = [], col = [], idx = [];
  const cH = new THREE.Color(...colors.hull), cS = new THREE.Color(...colors.stripe), cB = new THREE.Color(0.42, 0.14, 0.1);
  const row = NV * 2 + 1; // port gunwale → keel → starboard gunwale
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, s = section(h, u);
    for (let j = 0; j < row; j++) {
      const t = Math.abs(j - NV) / NV; // 0 at keel, 1 at gunwale
      const side = j < NV ? -1 : 1;
      // quadratic curve keel → chine (deadrise) → gunwale (flare)
      const p0 = [0, s.keel], p1 = [s.b * (0.75 + h.flare * 0.2), s.keel + s.b * (0.12 + h.deadrise * 0.55)], p2 = [s.b * (1 + h.flare * 0.12), s.sheer];
      const a = (1 - t) * (1 - t), bq = 2 * (1 - t) * t, c = t * t;
      const x = (a * p0[0] + bq * p1[0] + c * p2[0]) * side, y = a * p0[1] + bq * p1[1] + c * p2[1];
      pos.push(x, y, s.z);
      // paint: antifouling below the waterline, a stripe under the gunwale, topsides above
      const k = y < -0.02 ? cB : t > 0.86 && t < 0.95 ? cS : cH;
      col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < row - 1; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // transom: a fan at the stern
  const tc = pos.length / 3; const s0 = section(h, 0);
  pos.push(0, (s0.keel + s0.sheer) / 2, s0.z); col.push(cH.r, cH.g, cH.b);
  for (let j = 0; j < row - 1; j++) idx.push(tc, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// the deck: a flat inset following the gunwale outline
export function deckGeometry(h, inset = 0.08) {
  const shape = new THREE.Shape();
  const pts = [];
  for (let i = 0; i <= NU; i++) { const s = section(h, i / NU); pts.push([Math.max(0.01, s.b - inset), s.z]); }
  shape.moveTo(-pts[0][0], pts[0][1]);
  for (const [b, z] of pts) shape.lineTo(-b, z);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(Math.PI / 2);
  // follow the sheer (slightly below it)
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const z = P.getZ(i); const u = 0.5 - z / h.length; const s = section(h, Math.min(1, Math.max(0, u))); P.setY(i, s.sheer - 0.12); }
  g.computeVertexNormals();
  return g;
}

function rounded(w, hgt, d, r = 0.12) {
  const s = new THREE.Shape(); const x = -w / 2, y = 0;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + hgt - r); s.quadraticCurveTo(x + w, y + hgt, x + w - r, y + hgt);
  s.lineTo(x + r, y + hgt); s.quadraticCurveTo(x, y + hgt, x, y + hgt - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  return g;
}
const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; };

// a complete boat mesh group for a type def (from data/boats.json)
export function buildBoat(def) {
  const h = def.hull, C = def.colors;
  const group = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.1 });
  // a working hull, not a toy: patched panels, a grime band at the waterline, rust bleeding from the gunwale,
  // paint worn through along the top edge (all in the shader, in the hull's own coordinates)
  hullM.onBeforeCompile = (sh) => {
    sh.uniforms.uSheer = { value: h.depth * 0.5 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHullP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vHullP; uniform float uSheer;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 P = vHullP;
        float n = vn(P.zx * 3.0) * 0.6 + vn(P.zy * 9.0) * 0.4;
        // patched panels: a few rectangles in a slightly different paint
        vec2 cell = floor(vec2(P.z * 1.3, P.y * 2.6));
        float patchP = step(0.78, hh(cell + floor(P.x * 2.0)));
        diffuseColor.rgb *= mix(1.0, 0.8 + 0.35 * hh(cell * 1.7), patchP);
        // grime and weed at and below the waterline
        float wl = smoothstep(0.05, -0.12, P.y + (n - 0.5) * 0.08);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.5, 0.38) + vec3(0.02, 0.03, 0.015), wl * 0.85);
        // rust bleeding down from the gunwale fixings
        float stripe = step(0.72, hh(vec2(floor(P.z * 7.0), 3.0)));
        float runD = smoothstep(uSheer + 0.05, uSheer - 0.45 - n * 0.25, P.y) * smoothstep(-0.05, 0.2, P.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 0.65, 0.42) + vec3(0.05, 0.015, 0.0), stripe * (1.0 - runD) * 0.0 + stripe * runD * 0.55 * smoothstep(0.3, 0.7, vn(vec2(P.z * 20.0, P.y * 2.0))));
        // paint worn through along the top edge and in scuffs
        float wear = smoothstep(0.55, 0.85, n) * smoothstep(uSheer - 0.25, uSheer + 0.05, P.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.3, 0.27), wear * 0.6);
        diffuseColor.rgb *= 0.9 + 0.2 * n;
      }`);
  };
  hullM.customProgramCacheKey = () => 'de-hull';
  const hull = new THREE.Mesh(hullGeometry(h, C), hullM); hull.castShadow = true; hull.receiveShadow = true;
  const deckM = new THREE.MeshStandardMaterial({ color: new THREE.Color(...C.deck), roughness: 0.8 });
  const deck = new THREE.Mesh(deckGeometry(h), deckM); deck.receiveShadow = true;
  group.add(hull, deck);
  const parts = [];
  const sMid = section(h, 0.5), sSt = section(h, 0.15), sBow = section(h, 0.75);
  const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
  const lights = {};
  for (const p of def.parts || []) {
    if (p === 'cabin') {
      const w = h.beam * 0.62, len = h.length * 0.3, ht = h.depth * 1.2 + 0.5;
      parts.push(paint(at(rounded(w, ht, len, 0.18), 0, sMid.sheer - 0.1, sMid.z + len * 0.1), C.hull.map((c) => Math.min(1, c * 1.15 + 0.05))));
      // windows: a dark band around the cabin
      parts.push(paint(at(rounded(w + 0.02, ht * 0.28, len + 0.02, 0.1), 0, sMid.sheer - 0.1 + ht * 0.55, sMid.z + len * 0.1), [0.06, 0.08, 0.1]));
    }
    if (p === 'windshield') {
      const w = h.beam * 0.78;
      const g = new THREE.CylinderGeometry(w * 0.6, w * 0.6, 0.42, 16, 1, true, -Math.PI * 0.35, Math.PI * 0.7);
      g.scale(1, 1, 0.45); g.rotateY(Math.PI);
      const ws = new THREE.Mesh(at(g, 0, sMid.sheer + 0.18, sMid.z - h.length * 0.06, -0.35), new THREE.MeshStandardMaterial({ color: 0x9fb8c0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      group.add(ws);
    }
    if (p === 'seats' || p === 'benches' || p === 'seat') {
      const n = p === 'seat' ? 1 : 2;
      for (let k = 0; k < n; k++) parts.push(paint(at(rounded(p === 'seat' ? 0.4 : h.beam * 0.6, 0.18, p === 'seat' ? 1.1 : 0.45, 0.07), 0, sSt.sheer - 0.18, sSt.z + 0.3 - k * 1.2), p === 'seat' ? [0.08, 0.08, 0.09] : [0.55, 0.42, 0.3]));
    }
    if (p === 'handlebars') parts.push(paint(at(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), 0, sMid.sheer + 0.35, sMid.z - 0.4, 0, 0, Math.PI / 2), [0.1, 0.1, 0.1]));
    if (p === 'outboard') {
      const cowl = new THREE.LatheGeometry([[0.001, 0], [0.18, 0.02], [0.24, 0.2], [0.22, 0.42], [0.12, 0.52], [0.001, 0.53]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
      cowl.scale(1, 1, 1.4);
      parts.push(paint(at(cowl, 0, sSt.sheer - 0.05, sSt.z + h.length * 0.18), [0.18, 0.19, 0.2]));
      parts.push(paint(at(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8), 0, sSt.sheer - 0.45, sSt.z + h.length * 0.2), [0.15, 0.15, 0.15]));
    }
    if (p === 'inboard') parts.push(paint(at(rounded(h.beam * 0.5, 0.25, h.length * 0.18, 0.1), 0, sSt.sheer - 0.12, sSt.z + 0.2), C.stripe));
    if (p === 'canopy') {
      // the canopy is its own group so the first-person driving view can hide it (from the seat it's just
      // four posts across the windscreen); weathered steel posts + a two-sided canvas tarp
      const canopy = new THREE.Group(); canopy.name = 'canopy'; group.add(canopy);
      const posts = [];
      for (const [x, z] of [[-0.75, -0.6], [0.75, -0.6], [-0.75, 0.5], [0.75, 0.5]]) posts.push(at(new THREE.CylinderGeometry(0.03, 0.035, 1.9, 8), x, sMid.sheer + 0.85, z));
      canopy.add(new THREE.Mesh(mergeGeometries(posts.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x3a3d3c, roughness: 0.6, metalness: 0.5 })));
      const tarp = new THREE.CylinderGeometry(1.2, 1.2, 1.4, 12, 1, true, -0.7, 1.4); tarp.rotateX(Math.PI / 2); tarp.rotateZ(Math.PI / 2);
      // the tarp is seen from underneath when you sit in the boat: two-sided, or only its bare posts show
      canopy.add(new THREE.Mesh(at(tarp, 0, sMid.sheer + 0.65, -0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.36, 0.25), roughness: 0.92, side: THREE.DoubleSide })));
    }
    if (p === 'tires') for (let k = 0; k < 6; k++) { const s = section(h, 0.1 + k * 0.15); for (const sd of [-1, 1]) parts.push(paint(at(new THREE.TorusGeometry(0.28, 0.11, 6, 12), sd * (s.b + 0.08), s.sheer - 0.35, s.z, 0, Math.PI / 2), [0.07, 0.07, 0.07])); }
    if (p === 'stack') parts.push(paint(at(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 10), 0, sMid.sheer + h.depth * 1.2 + 1.1, sMid.z + 0.8), [0.75, 0.55, 0.12]));
    if (p === 'foils') {
      for (const [u, span] of [[0.78, h.beam * 1.3], [0.18, h.beam * 1.1]]) {
        const s = section(h, u);
        const wing = new THREE.BoxGeometry(span, 0.05, 0.42); wing.translate(0, s.keel - 0.75, s.z);
        parts.push(paint(wing, [0.25, 0.25, 0.26]));
        for (const sd of [-1, 1]) parts.push(paint(at(new THREE.BoxGeometry(0.06, 0.85, 0.3), sd * span * 0.35, s.keel - 0.35, s.z), [0.25, 0.25, 0.26]));
      }
    }
    if (p === 'lightbar') {
      const s = section(h, 0.5);
      const y = s.sheer + h.depth * 1.2 + 0.62;
      parts.push(paint(at(new THREE.BoxGeometry(h.beam * 0.6, 0.1, 0.22), 0, y, s.z + 0.2), [0.12, 0.12, 0.13]));
      const red = new THREE.Mesh(new THREE.BoxGeometry(h.beam * 0.26, 0.1, 0.18), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
      const blue = new THREE.Mesh(new THREE.BoxGeometry(h.beam * 0.26, 0.1, 0.18), new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false }));
      red.position.set(-h.beam * 0.16, y + 0.08, s.z + 0.2); blue.position.set(h.beam * 0.16, y + 0.08, s.z + 0.2);
      group.add(red, blue); lights.red = red; lights.blue = blue;
    }
    if (p === 'searchlight') {
      const s = section(h, 0.55);
      const lamp = new THREE.LatheGeometry([[0.001, 0], [0.16, 0], [0.2, 0.12], [0.2, 0.32], [0.001, 0.32]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
      lamp.rotateX(-Math.PI / 2);
      parts.push(paint(at(lamp, 0, s.sheer + h.depth * 1.2 + 0.55, s.z - 0.9), [0.3, 0.3, 0.3]));
      lights.lamp = new THREE.Vector3(0, s.sheer + h.depth * 1.2 + 0.55, s.z - 1.2);
    }
    if (p === 'hiddenHold') parts.push(paint(at(new THREE.BoxGeometry(h.beam * 0.5, 0.02, 0.9), 0, sBow.sheer - 0.1, sBow.z + 0.6), C.deck.map((c) => c * 0.8)));
  }
  if (parts.length) {
    const pm = new THREE.Mesh(mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(a)) n.deleteAttribute(a); if (!n.attributes.normal) n.computeVertexNormals(); return n; }), false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 }));
    pm.castShadow = true; group.add(pm);
  }
  group.userData.lights = lights;
  group.userData.section = (u) => section(h, u);
  return group;
}
