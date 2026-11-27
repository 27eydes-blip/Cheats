import * as THREE from 'three';
import { G } from '../world/WorldShader.js';

// Shader layers for people. All are MeshStandard/Physical materials patched in
// onBeforeCompile so they keep three's lighting, shadows and IBL.

// Expression blendshapes: shared per-kit texture of deltas, indexed by aFace.
const EXPR_VS_PARS = /* glsl */`
attribute float aFace;
uniform sampler2D tExpr; uniform float uExprW[34]; uniform int uExprN;
`;
const EXPR_VS = /* glsl */`
if (aFace >= 0.0) {
  int col = int(aFace);
  for (int i = 0; i < 34; i++) {
    if (i >= uExprN) break;
    float w = uExprW[i];
    if (abs(w) > 0.002) transformed += w * texelFetch(tExpr, ivec2(col, i), 0).xyz;
  }
}`;

const NOISE = /* glsl */`
float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHash(i), hHash(i + vec3(1,0,0)), f.x), mix(hHash(i + vec3(0,1,0)), hHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hHash(i + vec3(0,0,1)), hHash(i + vec3(1,0,1)), f.x), mix(hHash(i + vec3(0,1,1)), hHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

export function exprUniforms(tex, n) {
  return { tExpr: { value: tex }, uExprW: { value: new Float32Array(34) }, uExprN: { value: n } };
}

// ---------------------------------------------------------------- skin
export function skinMaterial(look, exprU, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0 });
  m.normalMap = poreTexture();
  m.normalScale = new THREE.Vector2(0.16, 0.16);
  const u = m.userData.u = {
    ...exprU,
    uTone: { value: new THREE.Color(...(look.tone || [1, 1, 1])) },
    uHairCol: { value: new THREE.Color(...(look.hairColor || [0.1, 0.08, 0.06])) },
    uBeard: { value: look.beard || 0 }, uStubble: { value: look.stubble || 0 }, uBuzz: { value: look.buzz || 0 },
    uFreckles: { value: look.freckles || 0 }, uBlush: { value: look.blush ?? 0.4 }, uUnderEye: { value: look.underEye ?? 0.5 },
    uWeather: { value: look.weathered || 0 }, uAge: { value: look.age01 || 0.3 },
    uScarA: { value: new THREE.Vector3(...(look.scar?.[0] || [0, 0, 0])) }, uScarB: { value: new THREE.Vector3(...(look.scar?.[1] || [0, 0, 0])) }, uScar: { value: look.scar ? 1 : 0 },
    uTatBone: { value: look.tattoo?.bone ?? -1 }, uTatStyle: { value: look.tattoo?.style ?? 0 },
    uWetSkin: { value: 0 }, uSweat: { value: 0 }, uSSS: { value: opts.sss === false ? 0 : 1 },
    uSunDir: G.uSunDir, uSunColor: G.uSunColor,
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${EXPR_VS_PARS}\nattribute vec4 aReg; attribute vec4 aReg2;\nvarying vec4 vReg; varying vec4 vReg2; varying vec3 vRest; varying float vTat; uniform float uTatBone;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRest = position; vReg = aReg; vReg2 = aReg2;\n${EXPR_VS}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vTat = 0.0;
        #ifdef USE_SKINNING
          if (uTatBone >= 0.0) vTat = (abs(skinIndex.x - uTatBone) < 0.5 ? skinWeight.x : 0.0) + (abs(skinIndex.y - uTatBone) < 0.5 ? skinWeight.y : 0.0);
        #endif`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}
        varying vec4 vReg; varying vec4 vReg2; varying vec3 vRest; varying float vTat;
        uniform vec3 uTone; uniform vec3 uHairCol; uniform float uBeard; uniform float uStubble; uniform float uBuzz; uniform float uFreckles;
        uniform float uBlush; uniform float uUnderEye; uniform float uWeather; uniform float uAge; uniform vec3 uScarA; uniform vec3 uScarB; uniform float uScar;
        uniform float uTatStyle; uniform float uWetSkin; uniform float uSweat; uniform float uSSS; uniform vec3 uSunDir; uniform vec3 uSunColor;
        float deSkinRough = 0.0; float deSkinWet = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb * uTone;
          c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.86); // the source skins are a little too saturated
          float beard = vReg.x, cheek = vReg.y, under = vReg.z, lips = vReg.w, scalp = vReg2.x, tz = vReg2.y;
          // sun, salt and wind: a little darker, warmer, blotchier with age and exposure
          float blotch = hNoise(vRest * 260.0) * 0.6 + hNoise(vRest * 70.0) * 0.4;
          c *= mix(1.0, 0.86 + 0.2 * blotch, uWeather * 0.8);
          c = mix(c, c * vec3(1.06, 0.97, 0.9), uWeather * 0.5);
          // blood under thin skin: cheeks, nose tip, ears
          c = mix(c, c * vec3(1.07, 0.95, 0.93), clamp(cheek * uBlush * 0.7, 0.0, 1.0));
          // tired eyes
          c = mix(c, c * vec3(0.84, 0.8, 0.84), under * uUnderEye);
          // lips: a touch more saturated, never painted
          c = mix(c, c * vec3(1.03, 0.93, 0.93), lips * 0.4);
          // freckles: sparse, irregular, mostly where the sun hits
          float fr = smoothstep(0.82, 0.9, hNoise(vRest * 950.0)) * smoothstep(0.2, 0.6, hNoise(vRest * 120.0));
          c = mix(c, c * vec3(0.72, 0.58, 0.48), fr * uFreckles * clamp(cheek * 1.6 + tz, 0.0, 1.0));
          // facial hair: individual short hairs as high-frequency noise, coverage grows to a full beard
          float strand = hNoise(vRest * vec3(1800.0, 600.0, 1800.0));
          float edge = smoothstep(0.0, 0.7, beard);                 // soft, ragged border
          float cover = clamp(uStubble * 0.5 + uBeard * 0.9, 0.0, 1.0) * edge;
          float clump = hNoise(vRest * 300.0);
          float hairMask = smoothstep(1.0 - cover, 1.0 - cover + 0.3, strand * 0.65 + clump * 0.35);
          // skin shows through: a beard is hairs over skin, never a solid fill
          c = mix(c, uHairCol * (0.6 + 0.7 * strand), hairMask * mix(0.45, 0.85, uBeard) * edge);
          deSkinRough += hairMask * beard * 0.2;
          // shaved/buzzed scalp
          c = mix(c, uHairCol * 0.9, scalp * uBuzz * smoothstep(0.35, 0.75, strand));
          // scar: a pale raised line
          if (uScar > 0.5) {
            vec3 ab = uScarB - uScarA; float t = clamp(dot((vRest - uScarA).xy, ab.xy) / dot(ab.xy, ab.xy), 0.0, 1.0);
            vec3 cp = uScarA + ab * t; float d = length((vRest - cp).xy) + max(0.0, cp.z - 0.12 - vRest.z) * 10.0;
            float sc = smoothstep(0.0035, 0.001, d) * (0.75 + 0.25 * sin(t * 60.0)) * step(0.0, t) * step(t, 1.0);
            c = mix(c, c * vec3(1.06, 1.0, 0.98) + 0.015, sc * 0.8);
            deSkinRough -= sc * 0.15;
          }
          // forearm tattoo (ink sits under the skin: dark blue-black, slightly soft)
          if (vTat > 0.4) {
            float a = vRest.y * 160.0;
            float ink = uTatStyle < 0.5 ? step(0.72, fract(a * 0.5)) * step(0.3, fract(vRest.z * 90.0 + 0.2))
                       : smoothstep(0.08, 0.0, abs(sin(a * 0.6 + sin(vRest.z * 140.0) * 1.6)) - 0.05);
            c = mix(c, vec3(0.06, 0.07, 0.1), ink * smoothstep(0.4, 0.8, vTat) * 0.8);
          }
          diffuseColor.rgb = c;
          // oil on the T-zone, glossier lips, rougher with age; rain and sweat make it shine
          deSkinRough += -0.12 * tz - 0.14 * lips + 0.1 * uAge + 0.06 * uWeather;
          deSkinWet = clamp(uWetSkin + uSweat * (tz * 0.8 + 0.2), 0.0, 1.0);
          diffuseColor.rgb *= 1.0 - 0.12 * deSkinWet;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + deSkinRough, 0.2, 0.9);
        roughnessFactor = mix(roughnessFactor, 0.14, deSkinWet * 0.85);`)
      .replace('#include <opaque_fragment>', `
        if (uSSS > 0.5) {
          // light through thin skin when backlit (ears, nostrils, fingers) and
          // a red bleed at the light/shadow boundary (scattered light under the skin)
          vec3 Nw = inverseTransformDirection(normal, viewMatrix);
          #define ndlBack(n, l) dot(n, l)
          vec3 Vw = inverseTransformDirection(normalize(vViewPosition), viewMatrix);
          float thin = 1.0 - vReg2.w;
          float back = pow(max(dot(Vw, uSunDir), 0.0), 4.0) * thin * thin * smoothstep(-0.2, 0.3, -ndlBack(Nw, uSunDir));
          float ndl = dot(Nw, uSunDir);
          float edge = smoothstep(-0.35, 0.05, ndl) * smoothstep(0.4, 0.0, ndl);
          outgoingLight += diffuseColor.rgb * uSunColor * (vec3(1.0, 0.3, 0.18) * back * 0.7 + vec3(0.12, 0.035, 0.02) * edge);
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'de-skin' + (opts.sss === false ? '0' : '1');
  return m;
}

// procedural pore/fine-wrinkle normal map, generated once
let pores = null;
function poreTexture() {
  if (pores) return pores;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const h = new Float32Array(N * N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { // pores: small pits
    const x = rnd() * N, y = rnd() * N, r = 0.8 + rnd() * 1.4;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const px = ((Math.floor(x) + dx) % N + N) % N, py = ((Math.floor(y) + dy) % N + N) % N;
      const d = Math.hypot(dx + (x % 1) - 0.5, dy + (y % 1) - 0.5) / r;
      if (d < 1) h[py * N + px] -= (1 - d * d) * 0.8;
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] += Math.sin(x * 0.9 + Math.sin(y * 0.21) * 3) * 0.06; // fine lines
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = h[y * N + ((x + N - 1) % N)], r = h[y * N + ((x + 1) % N)], u = h[((y + N - 1) % N) * N + x], d = h[((y + 1) % N) * N + x];
    let nx = (l - r) * 1.5, ny = (u - d) * 1.5, nz = 1; const k = 1 / Math.hypot(nx, ny, nz);
    const o = (y * N + x) * 4;
    img.data[o] = (nx * k * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * k * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * k * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  pores = new THREE.CanvasTexture(c);
  pores.wrapS = pores.wrapT = THREE.RepeatWrapping;
  pores.repeat.set(28, 28);
  return pores;
}

// ---------------------------------------------------------------- eyes
export function eyeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.035, ior: 1.376 });
  const u = m.userData.u = { uPupil: { value: 0.5 }, uIrisR: { value: 0.116 } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPupil; uniform float uIrisR;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          // pupil dilation: remap radii inside the iris; iris sits a little behind the cornea (parallax)
          // the atlas holds two eyes; pick this fragment's iris centre
          vec2 uIrisC = vMapUv.x > 0.5 ? vec2(0.705, 0.295) : vec2(0.29, 0.727);
          vec2 euv = vMapUv - uIrisC; float r = length(euv);
          float p0 = uIrisR * 0.31, p = uIrisR * mix(0.27, 0.58, uPupil);
          float rs = r < p ? r * (p0 / p) : (r < uIrisR ? p0 + (r - p) * (uIrisR - p0) / (uIrisR - p) : r);
          vec2 suv = uIrisC + (r > 1e-5 ? euv / r * rs : euv);
          vec3 vd = normalize(vViewPosition);
          suv += vd.xy * 0.012 * step(r, uIrisR);
          vec4 eyeTex = texture2D(map, suv);
          // sclera is never paper-white: veins, a warm tint, and a soft shadow under the lid
          vec3 Nw = inverseTransformDirection(normalize(vNormal), viewMatrix);
          float lid = smoothstep(0.1, 0.75, Nw.y);
          float inIris = 1.0 - smoothstep(uIrisR * 0.95, uIrisR * 1.05, r);
          vec3 ec = eyeTex.rgb * mix(vec3(0.74, 0.71, 0.68), vec3(0.85), inIris); // sclera: warm, never paper-white
          ec *= mix(1.0, 0.55, lid);
          diffuseColor *= vec4(ec, 1.0);
        #endif`);
  };
  m.customProgramCacheKey = () => 'de-eye';
  return m;
}

// ---------------------------------------------------------------- hair
export function hairMaterial(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, alphaTest: 0.42, side: THREE.DoubleSide, transparent: false });
  const u = m.userData.u = {
    uHairCol: { value: new THREE.Color(...color) }, uWetHair: { value: 0 }, uWind: { value: new THREE.Vector3(0.4, 0, 0.2) },
    uTime: G.uTime, uSunDir: G.uSunDir, uSunColor: G.uSunColor, uSway: { value: opts.sway ?? 1 },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway; uniform vec3 uWind; uniform float uTime; uniform float uWetHair; uniform float uSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // tips move in the wind, roots don't; wet hair hangs heavy
        float sw = aSway * aSway * uSway * (1.0 - uWetHair * 0.7);
        transformed += uWind * sw * (0.6 + 0.4 * sin(uTime * 2.3 + position.y * 30.0 + position.x * 17.0)) * 0.035;
        transformed.y -= uWetHair * aSway * 0.012;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHairCol; uniform float uWetHair; uniform vec3 uSunDir; uniform vec3 uSunColor;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        // keep the texture's strand detail, take the colour from the person
        float hl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = uHairCol * (0.45 + hl * 1.6) * (1.0 - uWetHair * 0.35);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, uWetHair);')
      .replace('#include <opaque_fragment>', `
        {
          // Kajiya-Kay: two shifted highlights along the strand direction (cards run along v)
          vec3 dpx = dFdx(vViewPosition), dpy = dFdy(vViewPosition);
          vec2 dux = dFdx(vMapUv), duy = dFdy(vMapUv);
          vec3 T = normalize(dpx * duy.x - dpy * dux.x);
          vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 V = normalize(vViewPosition) * -1.0;
          vec3 H = normalize(L + V);
          vec3 Nn = normalize(normal);
          vec3 T1 = normalize(T + Nn * 0.08), T2 = normalize(T - Nn * 0.12);
          float s1 = pow(sqrt(max(0.0, 1.0 - pow(dot(T1, H), 2.0))), mix(90.0, 160.0, uWetHair));
          float s2 = pow(sqrt(max(0.0, 1.0 - pow(dot(T2, H), 2.0))), 30.0);
          float lit = smoothstep(-0.1, 0.3, dot(Nn, L));
          outgoingLight += uSunColor * lit * (s1 * mix(0.12, 0.3, uWetHair) + s2 * 0.08 * diffuseColor.rgb * 3.0);
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'de-hair';
  return m;
}

// ---------------------------------------------------------------- clothes
export function clothMaterial(tint, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  const u = m.userData.u = {
    uTint: { value: new THREE.Color(...tint) }, uWetCloth: { value: 0 }, uSalt: { value: opts.salt ?? 0.5 }, uWear: { value: opts.wear ?? 0.5 },
    uPatch: { value: opts.patch ?? 0 }, uSeed: { value: opts.seed ?? 0 },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRestC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestC = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}\nvarying vec3 vRestC; uniform vec3 uTint; uniform float uWetCloth; uniform float uSalt; uniform float uWear; uniform float uPatch; uniform float uSeed;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float l = dot(c, vec3(0.3, 0.59, 0.11));
          c = mix(c, uTint * (0.35 + l * 1.3), 0.78);            // re-dyed by whoever wears it
          float n = hNoise(vRestC * 22.0 + uSeed) * 0.6 + hNoise(vRestC * 90.0 + uSeed) * 0.4;
          c *= mix(1.0, 0.9 + 0.16 * n, uWear);                    // fading, grime (subtle)
          // salt: dried white tide-lines, mostly low on the garment and at the cuffs
          float tide = smoothstep(0.62, 0.8, hNoise(vRestC * vec3(30.0, 90.0, 30.0) + uSeed * 3.0)) * smoothstep(0.55, 0.15, vRestC.y) * smoothstep(0.35, 0.7, hNoise(vRestC * 6.0 + uSeed));
          c = mix(c, c * 0.6 + vec3(0.32, 0.31, 0.29), tide * uSalt * 0.35);
          // a patch sewn over a worn spot
          if (uPatch > 0.5) {
            vec3 pc = vec3(0.09 * sign(sin(uSeed * 7.0)), 0.55, 0.1);
            vec2 dd = abs(vRestC.xy - pc.xy);
            float patchM = (1.0 - smoothstep(0.04, 0.045, dd.x)) * (1.0 - smoothstep(0.05, 0.055, dd.y)) * step(0.0, vRestC.z);
            float stitch = patchM * (1.0 - smoothstep(0.034, 0.04, max(dd.x - 0.006, dd.y - 0.016))) ;
            c = mix(c, c * vec3(0.72, 0.7, 0.66), patchM);
            c = mix(c, c * 0.5, (patchM - stitch) * step(0.5, fract((vRestC.x + vRestC.y) * 180.0)));
          }
          c *= 1.0 - 0.38 * uWetCloth;                              // soaked cloth goes dark
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, uWetCloth);');
  };
  m.customProgramCacheKey = () => 'de-cloth';
  return m;
}

export function cardMaterial(color, alphaTest = 0.05) {
  // brows and lashes: soft-edged hair cards (blended, drawn after the face)
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...color), roughness: 0.75, alphaTest, side: THREE.DoubleSide, transparent: true, depthWrite: false });
  m.userData.u = {};
  return m;
}
