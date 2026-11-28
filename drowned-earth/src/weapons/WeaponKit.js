import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Builds weapons from mismatched parts (data/weapons.json `parts` + the mods
// in each slot). Everything points down -z from a grip at the origin, metres.
// Materials are shared per (role, style): steel, wood, brass, rubber/tape,
// rope, glass — each with a wear layer (rust patches, salt crust, chipped
// paint, oil sheen) driven by the weapon's condition and salt, so the look
// changes as it's used and repaired. Geometries are cached per part.
const NOISE = /* glsl */`
  float w_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float w_n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(w_h(i), w_h(i + vec3(1,0,0)), f.x), mix(w_h(i + vec3(0,1,0)), w_h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(w_h(i + vec3(0,0,1)), w_h(i + vec3(1,0,1)), f.x), mix(w_h(i + vec3(0,1,1)), w_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float w_f(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * w_n(p); p *= 2.07; a *= 0.5; } return s; }`;
const matCache = new Map(), geoCache = new Map();
const L = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const along = (g) => { g.rotateX(-Math.PI / 2); return g; }; // lathe/cylinder +y → -z

// a wear-aware PBR material for one role, shared by all weapons of a style
export function wearMaterial(role, style, S) {
  const key = role + ':' + style;
  if (matCache.has(key)) return matCache.get(key);
  const base = { steel: S.metal, iron: S.metal.map((c) => c * 0.8), paint: S.paint, wood: [0.42, 0.28, 0.17], brass: [0.78, 0.6, 0.3], tape: [0.12, 0.12, 0.12], rope: [0.62, 0.52, 0.36], rubber: [0.08, 0.08, 0.08], glass: [0.45, 0.75, 0.65], leather: [0.32, 0.18, 0.1], bone: [0.82, 0.76, 0.64], accent: S.accent, white: [0.92, 0.9, 0.84] }[role] || S.metal;
  const metal = ['steel', 'iron', 'brass'].includes(role) ? 0.85 : role === 'paint' || role === 'accent' ? 0.35 : 0;
  const rough = { steel: 0.42, iron: 0.55, brass: 0.32, glass: 0.06, rubber: 0.8, tape: 0.7, rope: 0.95, wood: 0.75, leather: 0.6, paint: 0.5, accent: 0.45, bone: 0.5, white: 0.6 }[role] ?? 0.6;
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...base), metalness: metal, roughness: rough, transparent: role === 'glass', opacity: role === 'glass' ? 0.75 : 1 });
  const u = { uWear: { value: 0.3 }, uSalt: { value: 0.1 }, uRust: { value: S.rust ?? 0.4 }, uKind: { value: ['steel', 'iron', 'brass'].includes(role) ? 1 : role === 'paint' || role === 'accent' ? 2 : role === 'wood' ? 3 : 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = position; vWN = normal;');
    sh.fragmentShader = `uniform float uWear, uSalt, uRust, uKind; varying vec3 vWP; varying vec3 vWN;\n${NOISE}\n` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 q = vWP * 40.0;
        float fb = w_f(q), fine = w_n(q * 6.0);
        float rust = 0.0, salt = 0.0, chip = 0.0;
        if (uKind > 0.5 && uKind < 1.5) {          // metal: rust blooms where wear and the sea get in
          rust = smoothstep(0.62 - uWear * 0.35 - uRust * 0.2, 0.75, fb + fine * 0.15) * (0.3 + uRust);
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + fine * 0.3), vec3(0.36, 0.16, 0.07) * (0.7 + fine * 0.6), clamp(rust, 0.0, 1.0));
        } else if (uKind > 1.5 && uKind < 2.5) {   // paint: chips down to bare steel at edges and with wear
          chip = smoothstep(0.7 - uWear * 0.45, 0.78, fb + fine * 0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.29, 0.28) * (0.8 + fine * 0.4), chip);
        } else if (uKind > 2.5) {                  // wood: grain, grime where hands go
          float grain = sin(dot(vWP, vec3(9.0, 23.0, 7.0)) + w_n(vWP * 18.0) * 3.0) * 0.5 + 0.5;  // soft, low-contrast figure, not stripes
          diffuseColor.rgb *= 0.88 + grain * 0.12 + (fine - 0.5) * 0.08;
          diffuseColor.rgb *= 1.0 - uWear * 0.3 * smoothstep(0.4, 0.8, fb);
        } else diffuseColor.rgb *= 0.85 + fine * 0.3;
        salt = smoothstep(0.66 - uSalt * 0.45, 0.8, w_f(q * 0.7 + 3.0)) * uSalt;  // white salt crust in the crevices
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.8), salt);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + rust * 0.4 + salt * 0.5 + chip * 0.15, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= 1.0 - clamp(rust * 1.2 + salt, 0.0, 1.0); metalnessFactor = max(metalnessFactor, chip * 0.8);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // oil sheen on clean metal: a faint thin-film rainbow at grazing angles
        if (uKind > 0.5 && uKind < 1.5) { float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0); float ph = w_n(q * 0.3) * 6.28; totalEmissiveRadiance += vec3(0.5 + 0.5 * sin(ph), 0.5 + 0.5 * sin(ph + 2.1), 0.5 + 0.5 * sin(ph + 4.2)) * fr * 0.04 * (1.0 - rust); }`);
  };
  m.customProgramCacheKey = () => 'wear' + role;
  matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- parts
function cached(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }
function helix(r, len, turns, tube, z0 = 0) {
  const pts = []; for (let i = 0; i <= turns * 24; i++) { const t = i / (turns * 24); const a = t * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z0 - t * len)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, turns * 24), tube, 5, false);
}
function bands(r, z0, len, n, w) { // wrapped grip: overlapping bands
  const gs = []; for (let i = 0; i < n; i++) { const g = along(new THREE.CylinderGeometry(r, r, w, 14, 1, true)); g.translate(0, 0, z0 - i * (len / n) - w / 2); gs.push(g); }
  return mergeGeometries(gs);
}
function decalTexture(kind, S) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 64);
  if (kind === 'tally') { x.strokeStyle = 'rgba(235,230,215,0.9)'; x.lineWidth = 5; for (let g = 0; g < 3; g++) { for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(20 + g * 70 + i * 12, 12); x.lineTo(18 + g * 70 + i * 12, 52); x.stroke(); } x.beginPath(); x.moveTo(12 + g * 70, 40); x.lineTo(70 + g * 70, 20); x.stroke(); } }
  if (kind === 'scripture') { x.fillStyle = 'rgba(240,232,210,0.92)'; x.font = 'italic 22px Georgia'; x.fillText('and the sea gave up the dead', 6, 40); }
  if (kind === 'stencil') { x.fillStyle = 'rgba(235,235,225,0.95)'; x.font = 'bold 26px monospace'; x.fillText('T.W. 0417  ISSUED', 6, 42); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWeapon(id, def, mods, styles, kind) {
  const S = styles[def.style] || styles.drift;
  const M = (role) => wearMaterial(role, def.style, S);
  const g = new THREE.Group(); g.name = 'weapon:' + id;
  const add = (geo, role, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, M(role)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  const P = def.parts, grip = mods.grip, head = mods.head || mods.barrel, wrap = mods.wrap;
  const gripRole = { tape: 'tape', rope: 'rope', cork: 'wood', leather: 'leather', rubber: 'rubber', cord: 'rope', bakelite: 'rubber', pistol_grip: 'rubber', wood_stock: 'wood' }[grip] || 'tape';
  let tip = -1.0; // where the business end is, for hit effects
  if (kind === 'melee') {
    // ---- shaft
    const len = { rebar: 1.55, wood_pole: 1.7, wood_haft: 0.85, short_handle: 0.16, wrench: 0.55, oar: 1.1, bone_handle: 0.12 }[P.shaft] || 0.8;
    const r = { rebar: 0.011, wood_pole: 0.017, wood_haft: 0.019, short_handle: 0.014, wrench: 0.016, oar: 0.018, bone_handle: 0.012 }[P.shaft] || 0.015;
    const shaftRole = P.shaft === 'rebar' || P.shaft === 'wrench' ? 'iron' : P.shaft === 'bone_handle' ? 'bone' : 'wood';
    const shaft = cached('shaft:' + P.shaft, () => {
      if (P.shaft === 'rebar') { const gg = along(new THREE.CylinderGeometry(r, r, len, 10, 40)); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); const a = Math.atan2(p.getY(i), p.getX(i)); const k = 1 + 0.18 * Math.max(0, Math.sin(a * 2 + z * 120)); p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k); } gg.computeVertexNormals(); gg.translate(0, 0, -len / 2 + 0.25); return gg; } // ribbed rebar
      if (P.shaft === 'wrench') { const gg = new THREE.BoxGeometry(0.028, 0.02, len, 1, 1, 8); gg.translate(0, 0, -len / 2 + 0.1); return gg; }
      if (P.shaft === 'oar') { const gg = along(new THREE.CylinderGeometry(r * 0.9, r * 1.1, len, 12)); gg.translate(0, 0, -len / 2 + 0.2); return gg; }
      const gg = along(L([[r * 0.95, 0], [r * 1.05, len * 0.1], [r, len * 0.6], [r * 0.9, len]], 12)); gg.translate(0, 0, 0.2); return gg;
    });
    add(shaft, shaftRole);
    tip = -len + 0.2;
    // ---- head
    const hk = head || P.head;
    const H = cached('head:' + hk, () => {
      switch (hk) {
        case 'spear_point': case 'barbed': { const gg = along(L([[0.016, 0], [0.026, 0.04], [0.02, 0.18], [0.001, 0.26]], 6)); if (hk === 'barbed') { const b = new THREE.ConeGeometry(0.008, 0.06, 4); b.rotateX(Math.PI / 1.6); for (const s of [-1, 1]) { const bb = b.clone(); bb.translate(s * 0.02, 0, -0.08); gg.merge?.(bb); } } return gg; }
        case 'glass_tip': return along(L([[0.014, 0], [0.022, 0.03], [0.012, 0.16], [0.001, 0.22]], 5));
        case 'hook': case 'double_hook': { const t = new THREE.TorusGeometry(0.06, 0.008, 8, 20, Math.PI * 1.3); t.rotateZ(Math.PI * 0.2); t.translate(0, 0.04, -0.06); const sp = along(L([[0.012, 0], [0.01, 0.16], [0.001, 0.2]], 6)); return mergeGeometries([t.toNonIndexed(), sp.toNonIndexed()]); }
        case 'axe': case 'axe_spike': { const s = new THREE.Shape(); s.moveTo(0, -0.02); s.lineTo(0.06, -0.035); s.quadraticCurveTo(0.17, -0.06, 0.2, -0.1); s.quadraticCurveTo(0.21, 0.0, 0.2, 0.1); s.quadraticCurveTo(0.17, 0.06, 0.06, 0.035); s.lineTo(0, 0.02); if (hk === 'axe_spike') { s.lineTo(-0.12, 0.005); s.lineTo(-0.12, -0.005); } s.lineTo(0, -0.02); const gg = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }); gg.translate(0, 0, -0.006); gg.rotateY(Math.PI / 2); gg.rotateX(Math.PI / 2); return gg; }
        case 'cleaver': case 'serrated': { const s = new THREE.Shape(); s.moveTo(0, -0.02); s.lineTo(0.24, -0.02); s.lineTo(0.25, 0.07); for (let i = 0; i < (hk === 'serrated' ? 12 : 1); i++) s.lineTo(0.24 - i * 0.02, hk === 'serrated' && i % 2 ? 0.065 : 0.075); s.lineTo(0.0, 0.075); s.lineTo(0, -0.02); const gg = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002 }); gg.rotateY(Math.PI / 2); return gg; }
        case 'harpoon': return mergeGeometries([along(L([[0.014, 0], [0.03, 0.05], [0.006, 0.08], [0.02, 0.1], [0.001, 0.22]], 6)).toNonIndexed()]);
        case 'wrench_jaw': case 'spiked_jaw': { const s = new THREE.Shape(); s.moveTo(-0.03, 0); s.lineTo(0.03, 0); s.lineTo(0.05, 0.06); s.lineTo(0.05, 0.11); s.lineTo(0.015, 0.11); s.lineTo(0.015, 0.07); s.lineTo(-0.015, 0.07); s.lineTo(-0.015, 0.11); s.lineTo(-0.05, 0.11); s.lineTo(-0.05, 0.06); s.lineTo(-0.03, 0); const gg = new THREE.ExtrudeGeometry(s, { depth: 0.024, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003 }); gg.translate(0, 0, -0.012); gg.rotateX(-Math.PI / 2); return gg; }
        case 'oar_blade': case 'nailed_blade': { const gg = new THREE.CylinderGeometry(0.075, 0.06, 0.42, 16, 6); gg.scale(1, 1, 0.18); return along(gg); }
        case 'glass_blade': case 'steel_blade': { const s = new THREE.Shape(); s.moveTo(-0.012, 0); s.quadraticCurveTo(-0.016, 0.1, 0, 0.18); s.quadraticCurveTo(0.014, 0.08, 0.012, 0); s.lineTo(-0.012, 0); const gg = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.003, curveSegments: 10 }); gg.rotateX(-Math.PI / 2); return gg; }
        default: return along(L([[0.015, 0], [0.001, 0.2]], 6));
      }
    });
    const headRole = hk === 'glass_tip' || hk === 'glass_blade' ? 'glass' : hk.includes('oar') || hk.includes('nailed') ? 'paint' : 'steel';
    const hm = add(H, headRole, 0, 0, tip);
    if (hk === 'oar_blade' || hk === 'nailed_blade') hm.position.z = tip - 0.18;
    if (hk === 'nailed_blade') for (let i = 0; i < 9; i++) add(cached('nail', () => along(new THREE.CylinderGeometry(0.0025, 0.0025, 0.08, 4))), 'iron', (Math.random() - 0.5) * 0.1, 0.03, tip - 0.05 - i * 0.04, Math.PI / 2 + (Math.random() - 0.5) * 0.4);
    tip -= 0.25;
  } else {
    // ---- ranged bodies
    const B = P.body;
    const body = cached('body:' + B, () => {
      switch (B) {
        case 'speargun': { const tube = along(L([[0.018, 0], [0.02, 0.02], [0.018, 0.85], [0.022, 0.88], [0.001, 0.9]], 14)); tube.translate(0, 0.025, 0.05); return tube; }
        case 'flare_pistol': { const br = along(L([[0.022, 0], [0.024, 0.02], [0.02, 0.2], [0.024, 0.22], [0.018, 0.22]], 16)); br.translate(0, 0.06, 0.02); const fr = new THREE.BoxGeometry(0.03, 0.05, 0.12); fr.translate(0, 0.045, 0.05); return mergeGeometries([br.toNonIndexed(), fr.toNonIndexed()]); }
        case 'nail_rifle': { const rcv = new THREE.BoxGeometry(0.05, 0.08, 0.36, 2, 2, 6); rcv.translate(0, 0.05, -0.12); const br = along(L([[0.012, 0], [0.012, 0.4], [0.016, 0.42], [0.001, 0.42]], 10)); br.translate(0, 0.06, -0.3); return mergeGeometries([rcv.toNonIndexed(), br.toNonIndexed()]); }
        case 'crossbow': { const st = new THREE.BoxGeometry(0.035, 0.04, 0.7); st.translate(0, 0.035, -0.25); return st; }
        case 'sling': { const t = new THREE.TorusGeometry(0.05, 0.006, 6, 20); return t; }
        case 'double_pipe': { const a = along(L([[0.022, 0], [0.022, 0.62], [0.025, 0.63], [0.019, 0.63]], 14)); const b = a.clone(); a.translate(-0.022, 0.055, -0.1); b.translate(0.022, 0.055, -0.1); const br = new THREE.BoxGeometry(0.1, 0.07, 0.2, 2, 2, 3); br.translate(0, 0.05, -0.02); return mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), br.toNonIndexed()]); }
        case 'bolt_rifle': { const rcv = along(L([[0.018, 0], [0.018, 0.22], [0.012, 0.24], [0.011, 0.9], [0.014, 0.92], [0.001, 0.92]], 12)); rcv.translate(0, 0.06, 0.05); return rcv; }
        default: return new THREE.BoxGeometry(0.04, 0.05, 0.4);
      }
    });
    add(body, B === 'crossbow' || B === 'sling' ? 'wood' : 'steel');
    tip = { speargun: -0.85, flare_pistol: -0.18, nail_rifle: -0.72, crossbow: -0.6, sling: -0.1, double_pipe: -0.73, bolt_rifle: -0.87 }[B] ?? -0.5;
    // grips and stocks
    if (grip === 'wood_stock') add(cached('stock', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.3, 0.02); s.quadraticCurveTo(0.34, -0.06, 0.3, -0.13); s.lineTo(0.18, -0.08); s.lineTo(0.06, -0.06); s.lineTo(0, 0); const gg = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }); gg.translate(0, 0, -0.02); gg.rotateY(-Math.PI / 2); return gg; }), 'wood', 0, 0.06, 0.06);
    else add(cached('pgrip', () => { const gg = new THREE.CapsuleGeometry(0.016, 0.08, 4, 8); gg.rotateX(0.35); return gg; }), gripRole, 0, -0.03, 0.04);
    if (B === 'crossbow') { // the truck leaf-spring bow and its cable
      const spring = cached('leaf', () => { const gs = []; for (let k = 0; k < 3; k++) { const c = new THREE.TorusGeometry(0.55 - k * 0.04, 0.008, 4, 30, Math.PI * 0.42); c.rotateZ(Math.PI * 0.29); c.scale(1, 0.35, 1); c.translate(0, -0.12 - k * 0.012 + 0.2, 0); gs.push(c.toNonIndexed()); } const m = mergeGeometries(gs); m.rotateX(Math.PI / 2); m.translate(0, 0.04, -0.62 + 0.2); return m; });
      add(spring, 'paint');
      add(cached('cable', () => new THREE.CylinderGeometry(0.002, 0.002, 0.62, 4).rotateZ(Math.PI / 2).translate(0, 0.045, -0.2)), 'iron');
    }
    if (B === 'speargun') { add(cached('band', () => { const t = new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI); t.translate(0, 0.025, -0.7); return t; }), 'rubber'); add(cached('spear', () => along(L([[0.004, 0], [0.004, 0.95], [0.008, 0.96], [0.001, 1.02]], 6)).translate(0, 0.05, 0.05)), 'steel'); }
    if (B === 'nail_rifle') add(cached('tank', () => along(L([[0.001, 0], [0.03, 0.01], [0.032, 0.18], [0.02, 0.2], [0.001, 0.2]], 14)).translate(0, -0.02, -0.02)), 'paint');
    if (B === 'double_pipe') for (const z of [-0.25, -0.55]) add(cached('clamp', () => { const t = new THREE.TorusGeometry(0.048, 0.006, 6, 18); t.scale(1, 0.6, 1); return t; }), 'steel', 0, 0.055, z);
    if (head === 'baffle') add(cached('baffle', () => along(L([[0.02, 0], [0.028, 0.01], [0.028, 0.16], [0.012, 0.17]], 14))), 'paint', 0, 0.06, tip);
    if (head === 'long') add(cached('ext', () => along(L([[0.013, 0], [0.013, 0.18]], 10))), 'steel', 0, 0.06, tip);
    if (head === 'scope' || P.extras?.includes('scope')) add(cached('scope', () => along(L([[0.016, 0], [0.02, 0.02], [0.014, 0.05], [0.014, 0.22], [0.02, 0.25], [0.018, 0.26]], 14)).translate(0, 0.11, 0.0)), 'steel');
  }
  // ---- grip wrap
  const gripMesh = cached('gripwrap:' + grip + kind, () => (grip === 'rope' || grip === 'cord' ? helix(0.021, 0.2, 9, 0.006, 0.1) : bands(0.021, 0.1, 0.2, 6, 0.038)));
  if (kind === 'melee') add(gripMesh, gripRole);
  // ---- wrap slot: wire, chain, cloth
  if (wrap === 'wire' || P.extras?.includes('wire_lashing')) add(cached('wire', () => helix(0.022, 0.14, 7, 0.0018, -0.3)), 'steel');
  if (wrap === 'chain' || P.extras?.includes('chain_wrap')) add(cached('chain', () => { const gs = []; for (let i = 0; i < 22; i++) { const t = new THREE.TorusGeometry(0.011, 0.003, 4, 10); t.rotateY(i % 2 ? Math.PI / 2 : 0); const a = i * 0.9; t.translate(Math.cos(a) * 0.026, Math.sin(a) * 0.026, -0.12 - i * 0.017); gs.push(t.toNonIndexed()); } return mergeGeometries(gs); }), 'iron');
  if (wrap === 'cloth' || wrap === 'tape') add(cached('cloth', () => bands(0.024, -0.35, 0.1, 3, 0.03)), wrap === 'cloth' ? 'rope' : 'tape');
  // ---- extras: brass, welds, glass, decals, tags
  for (const x of P.extras || []) {
    if (x === 'brass_ferrule' || x === 'brass_fittings' || x === 'brass_pommel') add(cached('ferrule', () => along(L([[0.024, 0], [0.026, 0.01], [0.026, 0.04], [0.023, 0.05]], 14))), 'brass', 0, kind === 'ranged' ? 0.06 : 0, kind === 'ranged' ? -0.3 : 0.12);
    if (x === 'weld_beads') add(cached('welds', () => { const gs = []; for (let i = 0; i < 16; i++) { const s = new THREE.SphereGeometry(0.006 + Math.random() * 0.003, 6, 4); s.translate(0.018 + Math.random() * 0.004, 0.0 + Math.random() * 0.006, -0.15 - i * 0.012); gs.push(s); } return mergeGeometries(gs); }), 'iron');
    if (x === 'sea_glass_inlay') for (let i = 0; i < 3; i++) add(cached('glassbead', () => new THREE.SphereGeometry(0.008, 10, 8).scale(1, 0.6, 1.3)), 'glass', 0.018, 0.01, -0.02 - i * 0.03);
    if (x === 'rivets' || x === 'nails') for (let i = 0; i < 3; i++) add(cached('rivet', () => new THREE.SphereGeometry(0.004, 6, 4)), 'brass', 0.016, 0, 0.05 - i * 0.04);
    if (x === 'crew_tag') { const tag = add(cached('tag', () => new THREE.BoxGeometry(0.028, 0.045, 0.002, 1, 1, 1)), 'accent', 0.03, -0.04, 0.12); tag.rotation.z = 0.3; }
    if (x === 'air_tank' || x === 'hose_clamps' || x === 'rubber_bands' || x === 'lanyard' || x === 'braid' || x === 'cable' || x === 'leaf_spring') continue;
    if (x === 'tally' || x === 'scripture' || x === 'stencil') {
      const t = decalTexture(x, S);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(x === 'tally' ? 0.07 : 0.2, x === 'tally' ? 0.018 : 0.03), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      d.position.set(kind === 'melee' ? 0.026 : 0.027, kind === 'ranged' ? 0.06 : 0, x === 'scripture' ? -0.55 : -0.06); d.rotation.y = Math.PI / 2; d.rotation.z = Math.PI / 2;
      g.add(d);
    }
    if (x === 'chipped_paint') { /* the paint role's chip mask handles it */ }
  }
  g.userData.tip = new THREE.Vector3(0, kind === 'ranged' ? 0.06 : 0, tip);
  g.userData.mats = [...new Set(g.children.map((m) => m.material))].filter((m) => m.userData?.u);
  return g;
}
export function setWear(group, cond, salt) { for (const m of group.userData.mats || []) { m.userData.u.uWear.value = 1 - cond; m.userData.u.uSalt.value = salt; } }
