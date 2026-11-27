import * as THREE from 'three';

// Turns low-poly CC0 animal rigs into wet, diseased, glow-touched mutants:
//  - merges a model's parts into one skinned geometry (part id kept per vertex)
//  - Loop-subdivides it (positions smoothed, skin weights carried) so the
//    silhouette stops reading as facets
//  - a skin/fur shader: mottled pelt, mange, algae on the underside, wet
//    sheen, procedural bump, glow veins that pulse with the creature's anger
//  - fur shells (skinned, sharing the skeleton) on Standard/Ultra
//  - bone-attached growths: bone spikes, barnacle clusters, weed strands
//  - glowing eyes

// ---------------------------------------------------------------- geometry
export function mergeSkinned(meshes, partOf) {
  const parts = [];
  let nv = 0;
  for (const m of meshes) { const g = m.geometry; parts.push({ g, part: partOf(m), base: nv }); nv += g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), si = new Float32Array(nv * 4), sw = new Float32Array(nv * 4), part = new Float32Array(nv);
  const idx = [];
  for (const { g, part: p, base } of parts) {
    const P = g.attributes.position, N = g.attributes.normal, I = g.attributes.skinIndex, W = g.attributes.skinWeight;
    for (let i = 0; i < P.count; i++) {
      pos.set([P.getX(i), P.getY(i), P.getZ(i)], (base + i) * 3);
      if (N) nor.set([N.getX(i), N.getY(i), N.getZ(i)], (base + i) * 3);
      si.set([I.getX(i), I.getY(i), I.getZ(i), I.getW(i)], (base + i) * 4);
      sw.set([W.getX(i), W.getY(i), W.getZ(i), W.getW(i)], (base + i) * 4);
      part[base + i] = p;
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + base);
    else for (let k = 0; k < P.count; k++) idx.push(k + base);
  }
  return { pos, nor, si, sw, part, idx };
}

// weld coincident vertices (parts and flat-shading splits), keeping the first vertex's skin
function weld(d) {
  const map = new Map(), remap = new Int32Array(d.pos.length / 3);
  const out = { pos: [], si: [], sw: [], part: [] };
  let n = 0;
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.round(d.pos[i * 3] * 2e3)},${Math.round(d.pos[i * 3 + 1] * 2e3)},${Math.round(d.pos[i * 3 + 2] * 2e3)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = n++; map.set(k, j);
      out.pos.push(d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]);
      for (let c = 0; c < 4; c++) { out.si.push(d.si[i * 4 + c]); out.sw.push(d.sw[i * 4 + c]); }
      out.part.push(d.part[i]);
    } else out.part[j] = Math.max(out.part[j], d.part[i]); // a seam belongs to the "darker"/higher part
    remap[i] = j;
  }
  const idx = [];
  for (let t = 0; t < d.idx.length; t += 3) {
    const a = remap[d.idx[t]], b = remap[d.idx[t + 1]], c = remap[d.idx[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { pos: out.pos, si: out.si, sw: out.sw, part: out.part, idx };
}

// blend two (or more) 4-bone skin sets, keep the strongest four
function mixSkin(sets) {
  const acc = new Map();
  for (const [si, sw, k] of sets) for (let c = 0; c < 4; c++) if (sw[c] > 0) acc.set(si[c], (acc.get(si[c]) || 0) + sw[c] * k);
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, e) => s + e[1], 0) || 1;
  const i = [0, 0, 0, 0], w = [0, 0, 0, 0];
  top.forEach(([b, v], c) => { i[c] = b; w[c] = v / sum; });
  return [i, w];
}

// one level of Loop subdivision on a welded indexed mesh
function loop(m) {
  const nv = m.pos.length / 3;
  const P = (i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
  const S = (i) => [m.si.slice(i * 4, i * 4 + 4), m.sw.slice(i * 4, i * 4 + 4)];
  const edges = new Map();
  const ek = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  const nbr = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) {
    const tri = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3];
      const k = ek(a, b);
      let E = edges.get(k);
      if (!E) { E = { a, b, opp: [], id: -1 }; edges.set(k, E); }
      E.opp.push(c);
      nbr[a].add(b); nbr[b].add(a);
    }
  }
  const pos = [], si = [], sw = [], part = [];
  // even (old) vertices
  const boundaryNbr = Array.from({ length: nv }, () => []);
  for (const E of edges.values()) if (E.opp.length === 1) { boundaryNbr[E.a].push(E.b); boundaryNbr[E.b].push(E.a); }
  for (let i = 0; i < nv; i++) {
    const p = P(i);
    let q;
    if (boundaryNbr[i].length === 2) {
      const [x, y] = boundaryNbr[i].map(P);
      q = p.map((v, c) => v * 0.75 + (x[c] + y[c]) * 0.125);
    } else {
      const n = nbr[i].size;
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      q = p.map((v) => v * (1 - n * beta));
      for (const j of nbr[i]) { const r = P(j); for (let c = 0; c < 3; c++) q[c] += r[c] * beta; }
    }
    pos.push(...q);
    for (let c = 0; c < 4; c++) { si.push(m.si[i * 4 + c]); sw.push(m.sw[i * 4 + c]); }
    part.push(m.part[i]);
  }
  // odd (edge) vertices
  let next = nv;
  for (const E of edges.values()) {
    const a = P(E.a), b = P(E.b);
    let q;
    if (E.opp.length === 2) { const c = P(E.opp[0]), d = P(E.opp[1]); q = a.map((v, k) => (v + b[k]) * 0.375 + (c[k] + d[k]) * 0.125); }
    else q = a.map((v, k) => (v + b[k]) * 0.5);
    pos.push(...q);
    const [i4, w4] = mixSkin([[...S(E.a), 0.5], [...S(E.b), 0.5]]);
    si.push(...i4); sw.push(...w4);
    part.push(Math.max(m.part[E.a], m.part[E.b]));
    E.id = next++;
  }
  const idx = [];
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    const ab = edges.get(ek(a, b)).id, bc = edges.get(ek(b, c)).id, ca = edges.get(ek(c, a)).id;
    idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { pos, si, sw, part, idx };
}

export function smoothGeometry(merged, levels = 2) {
  let m = weld(merged);
  for (let l = 0; l < levels; l++) m = loop(m);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.sw, 4));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(m.part, 1));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// per-vertex weight on a set of bones (e.g. "how much is this vertex tail")
export function boneMask(geo, boneIdx, name = 'aMask') {
  const I = geo.attributes.skinIndex, W = geo.attributes.skinWeight, out = new Float32Array(I.count);
  const set = new Set(boneIdx);
  for (let i = 0; i < I.count; i++) { let s = 0; for (let c = 0; c < 4; c++) if (set.has(I.getComponent(i, c))) s += W.getComponent(i, c); out[i] = s; }
  geo.setAttribute(name, new THREE.BufferAttribute(out, 1));
}

// ---------------------------------------------------------------- shaders
const NOISE = /* glsl */`
  float m_hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float m_noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(m_hash(i), m_hash(i + vec3(1,0,0)), f.x), mix(m_hash(i + vec3(0,1,0)), m_hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(m_hash(i + vec3(0,0,1)), m_hash(i + vec3(1,0,1)), f.x), mix(m_hash(i + vec3(0,1,1)), m_hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float m_fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * m_noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
`;

// look: { fur, furLight, skin, algae, glow, nose, partColors:{id:color}, scale (model units per metre), mange, algaeAmt, wet, bare:'aMask' attr name or null }
export function mutantMaterial(look) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const u = {
    uFur: { value: new THREE.Color(look.fur) }, uFurLight: { value: new THREE.Color(look.furLight ?? look.fur) },
    uSkin: { value: new THREE.Color(look.skin ?? 0x6e5a55) }, uAlgae: { value: new THREE.Color(look.algae ?? 0x3a4a22) },
    uDark: { value: new THREE.Color(look.dark ?? 0x1a1816) }, uGlowC: { value: new THREE.Color(look.glow ?? 0x4fffd0) },
    uGlow: { value: 0 }, uWet: { value: look.wet ?? 0.6 }, uMange: { value: look.mange ?? 0.3 }, uAlgaeAmt: { value: look.algaeAmt ?? 0.5 },
    uScale: { value: look.noiseScale ?? 1 }, uVein: { value: look.veins ?? 0.6 }, uLightPart: { value: look.lightPart ?? 2 }, uDarkPart: { value: look.darkPart ?? 1 },
    uBare: { value: look.bareMask ? 1 : 0 }, uTime: { value: 0 }, uBump: { value: look.bump ?? 0.035 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aPart;\n' + (look.bareMask ? 'attribute float aMask;\n' : 'float aMask = 0.0;\n') + 'varying vec3 vRest; varying vec3 vRestN; varying float vPart; varying float vBare;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = position; vRestN = normal; vPart = aPart; vBare = aMask;');
    sh.fragmentShader = `uniform vec3 uFur, uFurLight, uSkin, uAlgae, uDark, uGlowC; uniform float uGlow, uWet, uMange, uAlgaeAmt, uScale, uVein, uLightPart, uDarkPart, uBare, uTime, uBump;
      varying vec3 vRest; varying vec3 vRestN; varying float vPart; varying float vBare;\n${NOISE}
      vec3 m_bump(vec3 n, float h, float k, vec3 vp){ vec3 dpx = dFdx(-vp), dpy = dFdy(-vp); float dhx = dFdx(h), dhy = dFdy(h);
        vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2) * k; return normalize(abs(det) * n - g); }
      ` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 q = vRest * uScale;
        float fb = m_fbm(q * 3.0), fine = m_fbm(q * 18.0 + 3.1);
        // pelt: base, lighter underside part, dark parts (nose, paws)
        vec3 pelt = mix(uFur, uFurLight, smoothstep(0.35, 0.65, 1.0 - abs(vPart - uLightPart)) * 0.85);
        pelt *= 0.72 + fb * 0.5;                                    // mottling
        pelt *= 0.85 + 0.3 * smoothstep(0.3, 0.7, m_noise(q * vec3(6.0, 40.0, 6.0))); // streaks along the fur
        pelt = mix(pelt, uDark, smoothstep(0.4, 0.6, 1.0 - abs(vPart - uDarkPart)));
        // mange: patches of grey-pink skin; bare parts (rat tails) are all skin
        float mange = smoothstep(0.62, 0.7, m_fbm(q * 2.2 + 7.0) + uMange * 0.25) * uMange;
        mange = max(mange, vBare * uBare);
        vec3 skin = uSkin * (0.75 + fine * 0.5);
        pelt = mix(pelt, skin, mange);
        // algae and silt: underside, legs, and drips down the flanks
        float under = smoothstep(0.1, -0.7, vRestN.y) + smoothstep(0.35, 0.0, (vRest.y * uScale) * 0.6);
        float algae = clamp(under * smoothstep(0.35, 0.6, m_fbm(q * 4.0 + 11.0)) * uAlgaeAmt * 1.6, 0.0, 1.0);
        pelt = mix(pelt, uAlgae * (0.7 + fine * 0.6), algae);
        diffuseColor.rgb = pelt;
        float wetMask = clamp(uWet * (0.5 + under * 0.7 + mange * 0.5), 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - wetMask * 0.35;                   // wet fur goes darker
        float mHeight = fine * 0.6 + fb * 0.4 + mange * 0.3;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.93, 0.6, wetMask) - algae * 0.05;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = m_bump(normal, mHeight, uBump * (1.0 + mange), vViewPosition);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // glow veins: ridged noise lines that brighten when it is angry
        float vein = 1.0 - abs(m_noise(q * 5.0 + vec3(0.0, uTime * 0.05, 0.0)) * 2.0 - 1.0);
        vein = pow(vein, 22.0) * smoothstep(0.55, 0.75, m_fbm(q * 1.3 + 5.0)) * smoothstep(0.4, 0.6, m_noise(q * 14.0)) * uVein;
        totalEmissiveRadiance += uGlowC * vein * (0.1 + uGlow * 1.6) * (0.7 + 0.3 * sin(uTime * 3.0 + q.x * 4.0));`);
  };
  m.customProgramCacheKey = () => 'mutant' + (look.bareMask ? 'b' : '');
  return m;
}

// fur shells: offset along the skinned normal, strands cut by noise
export function furShellMaterial(look, i, n) {
  const h = (i + 1) / n;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: false, alphaTest: 0.5 });
  const u = { uH: { value: h }, uLen: { value: look.furLen ?? 0.04 }, uFur: { value: new THREE.Color(look.fur) }, uFurLight: { value: new THREE.Color(look.furLight ?? look.fur) },
    uDense: { value: look.furDensity ?? 260 }, uScale: { value: look.noiseScale ?? 1 }, uLightPart: { value: look.lightPart ?? 2 }, uDarkPart: { value: look.darkPart ?? 1 }, uWet: { value: look.wet ?? 0.6 }, uAlgae: { value: new THREE.Color(look.algae ?? 0x3a4a22) }, uAlgaeAmt: { value: look.algaeAmt ?? 0.5 }, uMange: { value: look.mange ?? 0.3 }, uSway: { value: new THREE.Vector3() } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aPart;\n' + (look.bareMask ? 'attribute float aMask;\n' : 'float aMask = 0.0;\n') + 'uniform float uH, uLen; uniform vec3 uSway; varying vec3 vRest; varying vec3 vRestN; varying float vPart; varying float vBare;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = position; vRestN = normal; vPart = aPart; vBare = aMask;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        // wet fur clumps and droops: strands lean down and back with height
        float lenK = (1.0 - aMask) * (1.0 - smoothstep(0.6, 0.9, 1.0 - abs(aPart - ${(look.darkPart ?? 1).toFixed(1)})));
        transformed += normalize(objectNormal) * uLen * uH * lenK + vec3(0.0, -uLen * 0.6, 0.0) * uH * uH * lenK;`);
    sh.fragmentShader = `uniform float uH, uDense, uScale, uLightPart, uDarkPart, uWet, uAlgaeAmt, uMange; uniform vec3 uFur, uFurLight, uAlgae; varying vec3 vRest; varying vec3 vRestN; varying float vPart; varying float vBare;\n${NOISE}` + sh.fragmentShader
      .replace('#include <alphatest_fragment>', `
        vec3 q = vRest * uScale;
        // clumped strands: cells of fur, each clump with its own length
        // tapered strands: each cell holds one strand whose radius shrinks with height
        vec3 cq = q * uDense;
        vec3 cell = floor(cq), fc = fract(cq) - 0.5;
        float strand = m_hash(cell);
        float clump = m_fbm(q * 9.0);
        float len = (0.35 + strand * 0.65) * (0.55 + clump * 0.7);
        float rad = 0.5 * (1.0 - uH / max(len, 0.01));
        if (length(fc) > rad) discard;
        float mange = smoothstep(0.62, 0.7, m_fbm(q * 2.2 + 7.0) + uMange * 0.25) * uMange;
        if (len < uH || vBare > 0.5 || mange > 0.5) discard;
        diffuseColor.a = 1.0;
        #include <alphatest_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 q2 = vRest * uScale; float fb = m_fbm(q2 * 3.0);
          vec3 c = mix(uFur, uFurLight, smoothstep(0.35, 0.65, 1.0 - abs(vPart - uLightPart)) * 0.85) * (0.72 + fb * 0.5);
          float under = smoothstep(0.1, -0.7, vRestN.y);
          c = mix(c, uAlgae, clamp(under * smoothstep(0.35, 0.6, m_fbm(q2 * 4.0 + 11.0)) * uAlgaeAmt * 1.6, 0.0, 1.0));
          diffuseColor.rgb = c * mix(0.35, 0.9, uH) * (1.0 - uWet * 0.35); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.96, 0.7, uWet * uH);');
  };
  m.customProgramCacheKey = () => 'furshell' + (look.bareMask ? 'b' : '') + (look.darkPart ?? 1);
  return m;
}

// ---------------------------------------------------------------- growths
const boneMat = () => {
  const m = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.55 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vP; varying float vT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position; vT = uv.y;');
    sh.fragmentShader = `varying vec3 vP; varying float vT;\n${NOISE}` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float n = m_fbm(vP * 40.0);
      // ivory tip, stained base where it breaks through the skin, growth rings
      vec3 c = mix(vec3(0.16, 0.11, 0.08), vec3(0.62, 0.55, 0.42), smoothstep(0.05, 0.7, vT)) * mix(vec3(1.0), vec3(0.85, 0.95, 0.8), smoothstep(0.5, 0.8, m_fbm(vP * 15.0)));
      c *= 0.8 + n * 0.35 - 0.12 * smoothstep(0.7, 0.95, fract(vT * 9.0 + n * 0.6));
      diffuseColor.rgb = c;`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.85, 0.35, vT);');
  };
  m.customProgramCacheKey = () => 'bonespike';
  return m;
};
let _boneMat, _barnMat, _weedMat;
export function spikeGeometry(len, r, bend = 0.25, seed = 1) {
  // a lathe profile: thick ridged base tapering to a sharp, slightly hooked point
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2(Math.max(0.0005, r * Math.pow(1 - t, 0.85) * (1 + 0.12 * Math.sin(t * 30 + seed))), t * len)); }
  const g = new THREE.LatheGeometry(pts, 9);
  const P = g.attributes.position, UV = g.attributes.uv;
  let s = seed * 9301 % 233280;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const ph = rnd() * 6.28;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i), t = y / len;
    // hook backward and add knobbly noise
    P.setZ(i, P.getZ(i) - bend * len * t * t);
    const k = 1 + 0.18 * Math.sin(P.getX(i) * 90 + ph) * Math.sin(y * 70) * (1 - t);
    P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * (P.getZ(i) < 0 ? 1 : k));
    UV.setY(i, t);
  }
  g.computeVertexNormals();
  return g;
}
export function spike(len, r, bend, seed) { return new THREE.Mesh(spikeGeometry(len, r, bend, seed), (_boneMat ||= boneMat())); }

// a barnacle cluster: volcano-shaped plates with dark openings, crusted with algae
export function barnacles(radius, count, seed = 1) {
  let s = seed * 7919 % 233280; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const geos = [];
  for (let i = 0; i < count; i++) {
    const r = radius * (0.18 + rnd() * 0.22), h = r * (0.7 + rnd() * 0.6);
    const prof = [new THREE.Vector2(r, 0), new THREE.Vector2(r * 0.92, h * 0.35), new THREE.Vector2(r * 0.62, h * 0.85), new THREE.Vector2(r * 0.45, h), new THREE.Vector2(r * 0.3, h * 0.82), new THREE.Vector2(0.001, h * 0.6)];
    const g = new THREE.LatheGeometry(prof, 7);
    const P = g.attributes.position;
    for (let k = 0; k < P.count; k++) { const a = Math.atan2(P.getZ(k), P.getX(k)); const f = 1 + 0.15 * Math.cos(a * 6); P.setX(k, P.getX(k) * f); P.setZ(k, P.getZ(k) * f); }
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * radius;
    g.rotateX((rnd() - 0.5) * 0.5); g.rotateZ((rnd() - 0.5) * 0.5);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    geos.push(g);
  }
  const g = mergeGeos(geos);
  g.computeVertexNormals();
  if (!_barnMat) {
    _barnMat = new THREE.MeshStandardMaterial({ color: 0xbab3a2, roughness: 0.8 });
    _barnMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position;');
      sh.fragmentShader = `varying vec3 vP;\n${NOISE}` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float n = m_fbm(vP * 60.0);
        vec3 c = mix(vec3(0.72, 0.69, 0.6), vec3(0.3, 0.36, 0.2), smoothstep(0.45, 0.7, n)); // algae crust
        c *= 0.75 + 0.4 * m_noise(vP * 300.0);
        diffuseColor.rgb = c;`);
    };
    _barnMat.customProgramCacheKey = () => 'barnacle';
  }
  return new THREE.Mesh(g, _barnMat);
}
// strands of weed hanging off a body; swayed in the vertex shader
export function weed(len, count, seed = 1) {
  let s = seed * 3571 % 233280; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const geos = [];
  for (let i = 0; i < count; i++) {
    const L = len * (0.5 + rnd()), w = 0.006 + rnd() * 0.01;
    const g = new THREE.PlaneGeometry(w, L, 1, 8); g.translate((rnd() - 0.5) * len * 0.5, -L / 2, (rnd() - 0.5) * len * 0.5); g.rotateY(rnd() * 3);
    geos.push(g);
  }
  const g = mergeGeos(geos);
  if (!_weedMat) {
    _weedMat = new THREE.MeshStandardMaterial({ color: 0x18200f, roughness: 0.75, side: THREE.DoubleSide });
    _weedMat.userData.t = { value: 0 };
    _weedMat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = _weedMat.userData.t;
      sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float dn = -position.y; transformed.x += sin(uT * 1.7 + position.x * 30.0) * dn * dn * 0.6; transformed.z += cos(uT * 1.3 + position.z * 30.0) * dn * dn * 0.4;');
    };
  }
  return new THREE.Mesh(g, _weedMat);
}
export function tickGrowths(t) { if (_weedMat) _weedMat.userData.t.value = t; }

function mergeGeos(geos) {
  let n = 0, ni = 0; for (const g of geos) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[oi++] = g.index.getX(k) + o; else for (let k = 0; k < g.attributes.position.count; k++) idx[oi++] = k + o;
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// glowing eye: a small emissive bead + a soft additive halo the bloom picks up
let _haloTex;
export function glowEye(r, color) {
  const g = new THREE.Group();
  const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }));
  if (!_haloTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); _haloTex = new THREE.CanvasTexture(c);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: _haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  halo.scale.setScalar(r * 3.5);
  g.add(bead, halo);
  g.userData.bead = bead; g.userData.halo = halo;
  return g;
}

// attach an object to the bone that most influences a rest-pose vertex,
// placed at that vertex and aimed along its normal (bind pose)
export function attachAtVertex(skinned, vi, obj, { along = 0, tilt = null } = {}) {
  const geo = skinned.geometry, sk = skinned.skeleton;
  const I = geo.attributes.skinIndex, W = geo.attributes.skinWeight;
  let best = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = W.getComponent(vi, c); if (w > bw) { bw = w; best = I.getComponent(vi, c); } }
  const bone = sk.bones[best];
  const p = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, vi);
  const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, vi);
  if (tilt) n.add(tilt).normalize();
  p.addScaledVector(n, along);
  // bind space → bone local: boneInverse maps mesh bind space to bone space
  const inv = sk.boneInverses[best];
  const bindM = skinned.bindMatrix;
  const lp = p.clone().applyMatrix4(bindM).applyMatrix4(inv);
  const ln = n.clone().transformDirection(_m4.copy(inv).multiply(bindM));
  obj.position.copy(lp);
  obj.quaternion.setFromUnitVectors(_up, ln);
  // undo the bone's world scale so the growth keeps its size in mesh space
  const s = new THREE.Vector3().setFromMatrixScale(_m4.copy(inv).multiply(bindM));
  obj.scale.multiply(s);
  bone.add(obj);
  return bone;
}
const _up = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4();

// pick rest-pose vertices by a predicate, spaced apart
export function pickVertices(geo, pred, count, minDist, seed = 1) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  const cand = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); if (pred(p, n, i)) cand.push(i); }
  let s = seed * 7 + 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [], pts = [];
  for (let tries = 0; tries < cand.length * 2 && out.length < count; tries++) {
    const i = cand[Math.floor(rnd() * cand.length)]; if (i === undefined) break;
    p.fromBufferAttribute(P, i);
    if (pts.every((q) => q.distanceTo(p) > minDist)) { out.push(i); pts.push(p.clone()); }
  }
  return out;
}

// bloom: lumpy, softly glowing fungal growth (Bloomwalkers, the glow edges)
let _bloomMat;
export function bloomCluster(radius, count, seed = 1) {
  let s = seed * 4513 % 233280; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const geos = [];
  for (let i = 0; i < count; i++) {
    const r = radius * (0.25 + rnd() * 0.45);
    const g = new THREE.IcosahedronGeometry(r, 2);
    const P = g.attributes.position;
    const ph = rnd() * 10;
    for (let k = 0; k < P.count; k++) { const x = P.getX(k), y = P.getY(k), z = P.getZ(k); const f = 1 + 0.22 * Math.sin(x / r * 3 + ph) * Math.sin(y / r * 4 + ph) * Math.sin(z / r * 3.5); P.setXYZ(k, x * f, y * f * 0.8, z * f); }
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * radius;
    g.translate(Math.cos(a) * d, r * 0.4, Math.sin(a) * d);
    geos.push(g.index ? g : mergeGeos([g]));
  }
  const g = mergeGeos(geos);
  if (!_bloomMat) {
    _bloomMat = new THREE.MeshStandardMaterial({ color: 0x1d2a20, roughness: 0.4, emissive: 0x2fe0b0, emissiveIntensity: 0.6 });
    _bloomMat.userData.k = { value: 1 };
    _bloomMat.onBeforeCompile = (sh) => {
      sh.uniforms.uK = _bloomMat.userData.k;
      sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position;');
      sh.fragmentShader = `uniform float uK; varying vec3 vP;\n${NOISE}` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float n = m_fbm(vP * 50.0);
        float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 1.5);
        totalEmissiveRadiance *= (smoothstep(0.45, 0.75, n) * 1.2 + fres * 0.25) * uK;
        diffuseColor.rgb *= 0.6 + n * 0.6;`);
    };
    _bloomMat.customProgramCacheKey = () => 'bloom';
  }
  return new THREE.Mesh(g, _bloomMat);
}
export function setBloomGlow(k) { if (_bloomMat) _bloomMat.userData.k.value = k; }
