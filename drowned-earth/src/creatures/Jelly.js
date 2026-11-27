import * as THREE from 'three';

// The Net-Weaver's body: a giant jellyfish. No CC0 model of one exists, so it
// is built from a measured bell profile (thick mesoglea crown, thin scalloped
// margin), with translucent fresnel shading, radial canals and four glowing
// gonads inside, frilled oral arms, and long threads animated on the GPU.
// Everything pulses together; `flare` (0..1) brightens it and makes the
// threads lash toward `target` (local space).
const NOISE = /* glsl */`
  float j_hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float j_noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(j_hash(i), j_hash(i + vec3(1,0,0)), f.x), mix(j_hash(i + vec3(0,1,0)), j_hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(j_hash(i + vec3(0,0,1)), j_hash(i + vec3(1,0,1)), f.x), mix(j_hash(i + vec3(0,1,1)), j_hash(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

export function buildJelly({ radius = 1.6, threads = 6, count = 48 } = {}) {
  const group = new THREE.Group();
  const u = { uT: { value: 0 }, uPulse: { value: 0 }, uFlare: { value: 0 }, uTarget: { value: new THREE.Vector3(0, -3, 0) } };

  // ---- bell: outer exumbrella + inner subumbrella, closed at the margin
  const prof = [];
  const N = 36;
  for (let i = 0; i <= N; i++) { // outer: from apex down to margin
    const t = i / N, a = t * Math.PI * 0.5;
    prof.push(new THREE.Vector2(Math.sin(a) * radius * (1 + 0.06 * t), Math.cos(a) * radius * 0.62 * (1 - 0.12 * t * t)));
  }
  for (let i = N; i >= 0; i--) { // inner: back up, the mesoglea thinning toward the edge
    const t = i / N, a = t * Math.PI * 0.5, th = 0.32 * (1 - t) + 0.025;
    prof.push(new THREE.Vector2(Math.max(0.001, Math.sin(a) * radius * (1 + 0.06 * t) - th * 0.35), Math.cos(a) * radius * 0.62 * (1 - 0.12 * t * t) - th * radius * 0.7));
  }
  const bellG = new THREE.LatheGeometry(prof, 96);
  const bellM = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ec, roughness: 0.12, metalness: 0, transmission: 0, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.1 });
  bellM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uT, uPulse; varying vec3 vB; varying float vRim;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float r = length(position.xz) / ${radius.toFixed(3)};
      float ang = atan(position.z, position.x);
      // scalloped margin: 16 lappets
      float lap = 1.0 - smoothstep(0.82, 1.06, r) * (0.06 + 0.06 * cos(ang * 16.0));
      // swimming pulse: the margin contracts, the crown barely moves
      float k = 1.0 - uPulse * 0.16 * smoothstep(0.3, 1.0, r);
      transformed.xz *= k * lap;
      transformed.y += uPulse * 0.12 * smoothstep(0.5, 1.0, r) * ${radius.toFixed(3)};
      transformed.y += sin(ang * 16.0) * 0.015 * smoothstep(0.85, 1.0, r);
      vB = position / ${radius.toFixed(3)}; vRim = r;`);
    sh.fragmentShader = `uniform float uT, uFlare; varying vec3 vB; varying float vRim;\n${NOISE}\n` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ang = atan(vB.z, vB.x);
        // radial canals (16) and the ring canal near the rim
        float wv = ang + sin(vRim * 14.0 + ang * 3.0) * 0.04;
        float canal = smoothstep(0.985, 1.0, cos(wv * 8.0)) * smoothstep(0.2, 0.5, vRim) * 0.8 + smoothstep(0.995, 1.0, cos(wv * 24.0)) * smoothstep(0.55, 0.8, vRim) * 0.4 + smoothstep(0.012, 0.0, abs(vRim - 0.9)) * 0.6;
        // four horseshoe gonads around the centre
        float gon = smoothstep(0.55, 0.8, cos(ang * 4.0)) * smoothstep(0.12, 0.28, vRim) * smoothstep(0.55, 0.35, vRim);
        float speck = smoothstep(0.75, 0.9, j_noise(vB * 40.0));
        diffuseColor.rgb = mix(vec3(0.72, 0.86, 0.88), vec3(0.95, 0.75, 0.85), gon);
        float jA = 0.05 + canal * 0.18 + gon * 0.45 + speck * 0.06;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        diffuseColor.a = jA + pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0) * 0.5;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ang2 = atan(vB.z, vB.x);
        float gon2 = smoothstep(0.55, 0.8, cos(ang2 * 4.0)) * smoothstep(0.12, 0.28, vRim) * smoothstep(0.55, 0.35, vRim);
        float wv2 = ang2 + sin(vRim * 14.0 + ang2 * 3.0) * 0.04;
        float can2 = smoothstep(0.985, 1.0, cos(wv2 * 8.0)) * smoothstep(0.2, 0.5, vRim) + smoothstep(0.012, 0.0, abs(vRim - 0.9));
        float wave = 0.5 + 0.5 * sin(uT * (2.0 + uFlare * 9.0) - vRim * 9.0);
        totalEmissiveRadiance += vec3(0.25, 0.85, 0.95) * (gon2 * 0.6 + can2 * 0.35) * (0.25 + uFlare * 2.2 * wave);`);
  };
  bellM.customProgramCacheKey = () => 'jellybell';
  const bell = new THREE.Mesh(bellG, bellM);
  bell.renderOrder = 3;
  group.add(bell);

  // ---- oral arms: four frilled curtains hanging from the centre
  const armM = new THREE.MeshStandardMaterial({ color: 0xe8c8d4, roughness: 0.3, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  armM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uT; varying float vV;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float d = -position.y;
      transformed.x += sin(position.y * 3.0 + uT * 0.9) * 0.12 * d * 0.3 + sin(position.x * 25.0 + position.y * 8.0) * 0.06; // frills
      transformed.z += cos(position.y * 2.3 + uT * 0.7) * 0.15 * d * 0.3;
      vV = d;`);
    sh.fragmentShader = 'uniform float uFlare; varying float vV;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.9, 0.5, 0.7) * 0.1 * (1.0 + uFlare * 3.0) * exp(-vV * 0.5);');
  };
  for (let k = 0; k < 4; k++) {
    const L = radius * (2.2 + k * 0.25);
    const g = new THREE.PlaneGeometry(0.42, L, 14, 60); g.translate(0, -L / 2 - 0.15, 0);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), x = P.getX(i), t = -y / L;
      const w = 1 - 0.75 * t;                                    // taper
      const edge = Math.abs(x) / 0.21;                            // 0 at the spine, 1 at the frill
      const frill = Math.sin(y * 22 + k) * 0.07 * edge * edge;     // ruffled edges
      const tw = t * 5.5 + k;                                     // spiral twist down its length
      const xx = x * w, zz = frill + Math.sin(x * 9) * 0.03;
      P.setXYZ(i, xx * Math.cos(tw) - zz * Math.sin(tw), y, xx * Math.sin(tw) + zz * Math.cos(tw));
    }
    g.computeVertexNormals(); g.rotateY(k * Math.PI / 2 + 0.4); g.translate(Math.cos(k * 1.57) * 0.12, 0, Math.sin(k * 1.57) * 0.12);
    const arm = new THREE.Mesh(g, armM); arm.renderOrder = 2; group.add(arm);
  }

  // ---- threads: thin tubes along -Y, bent and lashed on the GPU
  const threadM = new THREE.MeshStandardMaterial({ color: 0xa8c8cc, roughness: 0.3, transparent: true, opacity: 0.38, depthWrite: false });
  threadM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uT, uFlare; uniform vec3 uTarget; attribute vec3 aRoot; varying float vF;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float L = ${(threads * 1.0).toFixed(2)};
      float f = clamp(-position.y / L, 0.0, 1.0);
      vec3 p = aRoot + vec3(position.x, 0.0, position.z);
      float ph = aRoot.x * 3.1 + aRoot.z * 2.3;
      vec3 drift = vec3(sin(uT * 0.8 + ph + f * 3.0), 0.0, cos(uT * 0.7 + ph * 1.3 + f * 3.0)) * 0.35 * f * f * L * 0.25;
      vec3 rest = p + vec3(aRoot.x, 0.0, aRoot.z) * f * 0.3 + vec3(0.0, -f * L, 0.0) + drift;
      vec3 lash = mix(p, uTarget + drift * 0.3, f);
      transformed = mix(rest, lash, uFlare * smoothstep(0.0, 0.6, f) * 0.7);
      // coiled stinging cells: small beads along each thread
      vF = f;`);
    sh.fragmentShader = 'uniform float uFlare; varying float vF;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.5, 0.95, 1.0) * (0.03 + uFlare * 0.6) * (0.6 + 0.4 * sin(vF * 80.0));');
  };
  const tube = new THREE.CylinderGeometry(0.007, 0.002, threads, 4, 64, true); tube.translate(0, -threads / 2, 0);
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, r = radius * (0.9 + 0.06 * (i % 3));
    const g = tube.clone();
    const L = 0.55 + ((i * 7919) % 100) / 220; g.scale(1, L, 1);
    const root = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < g.attributes.position.count; k++) root.set([Math.cos(a) * r, -0.05, Math.sin(a) * r], k * 3);
    g.setAttribute('aRoot', new THREE.BufferAttribute(root, 3));
    geos.push(g);
  }
  const threadGeo = mergeAll(geos);
  const threadMesh = new THREE.Mesh(threadGeo, threadM); threadMesh.frustumCulled = false; threadMesh.renderOrder = 1;
  group.add(threadMesh);

  // the inner glow lights the water around it
  const light = new THREE.PointLight(0x7fe6f0, 0.4, 9, 2); light.position.y = 0.3; group.add(light);
  return {
    group, u,
    update(dt, flare, targetLocal) {
      u.uT.value += dt;
      const rate = 0.55 + flare * 1.4;
      u.uPulse.value = Math.pow(0.5 + 0.5 * Math.sin(u.uT.value * rate * Math.PI * 2), 3);
      u.uFlare.value = flare;
      if (targetLocal) u.uTarget.value.copy(targetLocal);
      light.intensity = 0.3 + flare * 2.2;
    },
    // where does a thread pass near a local point? (CPU mirror of the shader's rest/lash curve, coarse)
    touches(local, flare, r = 0.45) {
      const t = u.uT.value;
      for (let i = 0; i < count; i += 2) {
        const a = (i / count) * Math.PI * 2, rr = radius * (0.9 + 0.06 * (i % 3));
        const L = threads * (0.55 + ((i * 7919) % 100) / 220);
        const rx = Math.cos(a) * rr, rz = Math.sin(a) * rr, ph = rx * 3.1 + rz * 2.3;
        for (let k = 1; k <= 10; k++) {
          const f = k / 10, ff = f * L / threads;
          const dx = Math.sin(t * 0.8 + ph + ff * 3) * 0.35 * ff * ff * threads * 0.25, dz = Math.cos(t * 0.7 + ph * 1.3 + ff * 3) * 0.35 * ff * ff * threads * 0.25;
          let x = rx + rx * ff * 0.3 + dx, y = -ff * threads, z = rz + rz * ff * 0.3 + dz;
          const m = flare * Math.min(1, ff / 0.6) * 0.7;
          x += (u.uTarget.value.x - x) * m; y += (u.uTarget.value.y - y) * m; z += (u.uTarget.value.z - z) * m;
          if ((x - local.x) ** 2 + (y - local.y) ** 2 + (z - local.z) ** 2 < r * r) return true;
        }
      }
      return false;
    },
  };
}
function mergeAll(geos) {
  let n = 0, ni = 0; for (const g of geos) { n += g.attributes.position.count; ni += g.index.count; }
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'aRoot']) { const arr = new Float32Array(n * 3); let o = 0; for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; } out.setAttribute(name, new THREE.BufferAttribute(arr, 3)); }
  const idx = new Uint32Array(ni); let o = 0, b = 0; for (const g of geos) { for (let k = 0; k < g.index.count; k++) idx[o++] = g.index.getX(k) + b; b += g.attributes.position.count; }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
