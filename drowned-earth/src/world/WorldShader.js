import * as THREE from 'three';
import { WAVES_GLSL } from '../water/Waves.js';

// Global uniforms shared by every patched material (by reference, so one update
// per frame reaches all of them).
export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uCaustics: { value: 1 },
  uNight: { value: 0 },
  uWet: { value: 0 },
  uGlow: { value: 0 },          // deep-structure pulse (finale)
  uNoiseTex: { value: null },
  uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) }, // light falling into rooms through windows
};

export function bindWaveUniforms(waves) { Object.assign(G, waves.uniforms); }

const COMMON = /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uCaustics;
uniform float uNight; uniform float uWet; uniform sampler2D uNoiseTex; uniform float uGlow; uniform vec3 uAmbient;
varying vec3 vWPos; varying vec4 vMeta; varying vec2 vUvM; varying vec3 vNW;
float deHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float causticField(vec2 p, float t) {
  p = mod(p, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}
`;

export function patchMaterial(mat, opts = {}) {
  // aMeta: x = window style (0 none, 1 punched, 2 curtain wall), y = spacing var, z = vines, w = seed
  const { facade = false, bob = false, noUnderwater = false, antiTile = false, cloth = false } = opts;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G);
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\nattribute vec4 aMeta;\n${COMMON}\n${bob ? WAVES_GLSL : ''}`);
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\nvMeta = aMeta; vUvM = uv; vNW = normalize(mat3(modelMatrix) * objectNormal);`);
    if (bob) {
      // floating instanced debris: offset by the wave height at the instance origin + a slow tilt
      vs = vs.replace('#include <project_vertex>', `
        #ifdef USE_INSTANCING
          vec3 iOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 iOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
          vec3 ws = waveSample(iOrigin.xz);
          vec3 tiltP = transformed;
          transformed.y += ws.x - tiltP.x * ws.y - tiltP.z * ws.z;
        #include <project_vertex>`);
    }
    if (cloth) {
      // tarps and laundry move in the wind: travelling flutter, stronger at free edges
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 clW = (modelMatrix * vec4(position, 1.0)).xyz;
        #ifdef USE_INSTANCING
          clW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #endif
        vec3 cn = abs(objectNormal); vec3 ax = cn.x > cn.y && cn.x > cn.z ? vec3(1.0, 0.0, 0.0) : cn.y > cn.z ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
        float fl = sin(dot(clW.xz, vec2(1.7, 1.1)) - uTime * 4.3) * 0.045 + sin(clW.y * 3.1 + clW.x * 2.3 - uTime * 7.1) * 0.02;
        transformed += ax * fl * (0.6 + 0.4 * sin(uTime * 0.7 + clW.z));`);
    }
    vs = vs.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 deW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        deW = instanceMatrix * deW;
      #endif
      vWPos = (modelMatrix * deW).xyz;`);
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${COMMON}`);
    if (antiTile) {
      // Break up the repeat of scanned tiling materials: a second sample, rotated
      // and rescaled, blended in by low-frequency noise. Same for roughness/AO.
      fs = fs.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        float deTile = smoothstep(0.3, 0.7, texture2D(uNoiseTex, vMapUv * 0.031 + 0.17).r);
        vec2 deUv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.61 + vec2(0.37, 0.71);
        vec4 deS = mix(texture2D(map, vMapUv), texture2D(map, deUv2), deTile);
        deS.rgb *= 0.88 + 0.24 * texture2D(uNoiseTex, vMapUv * 0.09 + 0.5).g;
        diffuseColor *= deS;
      #endif`);
    }
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      float deWinMask = 0.0; float deBroken = 0.0; float deLit = 0.0; float deGlassR = 0.05; float deCurtain = 0.0;
      vec3 deInterior = vec3(0.0); float deTrans = 0.0;
      ${facade ? `
      vec3 dn = normalize(vNW);
      if (vMeta.x > 0.5) {
        float curtain = step(1.5, vMeta.x); deCurtain = curtain;
        vec2 sp = vec2(mix(2.6, 4.4, vMeta.y), 3.4);
        vec2 q = vUvM / sp;
        vec2 cellId = floor(q); vec2 f = fract(q);
        float h = deHash(cellId + vMeta.w * 17.0);
        float h2 = deHash(cellId.yx * 1.31 + vMeta.w * 5.0);
        float wall = step(abs(dn.y), 0.5);
        // ---- large-scale weathering: patchy tone, long rain streaks, grime low, bleaching high
        float big = texture2D(uNoiseTex, vUvM * 0.011 + vMeta.w).r;
        float streakL = texture2D(uNoiseTex, vec2(vUvM.x * 0.13 + vMeta.w, vUvM.y * 0.0045)).g;
        float streakS = texture2D(uNoiseTex, vec2(vUvM.x * 0.6, vUvM.y * 0.03)).b;
        diffuseColor.rgb *= 0.8 + 0.34 * big;
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.38 * smoothstep(0.25, 0.75, streakL), 0.55 * wall);
        diffuseColor.rgb *= mix(1.0, 0.8 + 0.2 * streakS, 0.4 * wall);
        float hgt = clamp(vWPos.y / 70.0, 0.0, 1.0);
        diffuseColor.rgb *= mix(0.74, 1.06, hgt);
        // street-canyon occlusion: the bottom of every tower sees less sky
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 16.0, vWPos.y));
        // ---- openings, anti-aliased
        float mx = mix(mix(0.13, 0.26, fract(vMeta.y * 7.3)), 0.03, curtain);
        float myb = mix(mix(0.22, 0.34, fract(vMeta.y * 3.1)), 0.07, curtain);
        float myt = mix(0.86, 0.95, curtain);
        vec2 aa = fwidth(q) * 1.2 + 0.001;
        float wx = smoothstep(mx - aa.x, mx + aa.x, f.x) * smoothstep(1.0 - mx + aa.x, 1.0 - mx - aa.x, f.x);
        float wy = smoothstep(myb - aa.y, myb + aa.y, f.y) * smoothstep(myt + aa.y, myt - aa.y, f.y);
        deWinMask = wx * wy * wall;
        // floor-slab seam, panel joints, sill, reveal shadow
        float seam = (1.0 - smoothstep(0.0, 0.012 + aa.y, f.y)) * wall;
        float joint = (1.0 - smoothstep(0.0, 0.01 + aa.x, abs(f.x - 0.5) - 0.49)) * 0.0;
        diffuseColor.rgb *= 1.0 - 0.35 * seam;
        float sill = smoothstep(myb - 0.07, myb - 0.05, f.y) * (1.0 - smoothstep(myb - 0.012, myb, f.y)) * step(mx - 0.04, f.x) * step(f.x, 1.0 - mx + 0.04) * (1.0 - curtain) * wall;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + 0.025, sill);
        float reveal = smoothstep(mx - 0.06, mx, f.x) * (1.0 - smoothstep(1.0 - mx, 1.0 - mx + 0.06, f.x)) * smoothstep(myb - 0.03, myb, f.y) * (1.0 - smoothstep(myt, myt + 0.07, f.y));
        diffuseColor.rgb *= 1.0 - 0.45 * clamp(reveal - deWinMask, 0.0, 1.0) * wall;
        // stain dripping from each sill
        float drip = step(mx, f.x) * step(f.x, 1.0 - mx) * (1.0 - smoothstep(0.0, myb - 0.06, myb - 0.06 - f.y + 0.0)) * step(f.y, myb - 0.06) * texture2D(uNoiseTex, vec2(vUvM.x * 1.7, vUvM.y * 0.05)).r;
        diffuseColor.rgb *= 1.0 - 0.3 * drip * (1.0 - curtain) * wall;
        // ---- window frame, mullion, transom
        float wf = fract((f.x - mx) / (1.0 - 2.0 * mx));
        float hf = (f.y - myb) / (myt - myb);
        float fw = 0.05 / max(sp.x * (1.0 - 2.0 * mx), 0.5);
        float frame = 1.0 - smoothstep(fw, fw + 0.01, min(min(wf, 1.0 - wf), min(hf, 1.0 - hf) * 0.6));
        float mull = (1.0 - smoothstep(fw * 0.5, fw * 0.5 + 0.01, abs(wf - 0.5))) * step(0.42, h2);
        float tran = (1.0 - smoothstep(0.025, 0.035, abs(hf - 0.74))) * step(0.3, fract(h2 * 7.0)) * (1.0 - curtain);
        float frameAll = clamp(frame + mull + tran, 0.0, 1.0) * deWinMask;
        vec3 frameCol = mix(vec3(0.1, 0.105, 0.11), vec3(0.42, 0.4, 0.36), step(0.65, fract(vMeta.w * 13.0)));
        deBroken = step(0.84, h) * deWinMask;
        deLit = step(0.9985, deHash(cellId * 1.7 + 3.1)) * deWinMask * (1.0 - deBroken);
        float pane = deWinMask * (1.0 - frameAll * (1.0 - deBroken * 0.7));
        // ---- interior mapping: a room behind every window
        if (pane > 0.001) {
          vec3 tg = normalize(cross(vec3(0.0, 1.0, 0.0), dn));
          vec3 V = normalize(vWPos - cameraPosition);
          vec3 d = vec3(dot(V, tg), V.y, -dot(V, dn));
          d = sign(d) * max(abs(d), vec3(1e-4));
          float D = mix(4.5, 9.0, h2);
          vec3 o = vec3(f.x * sp.x, f.y * sp.y, 0.0);
          vec3 bmax = vec3(sp.x, sp.y, D);
          vec3 tp = (step(0.0, d) * bmax - o) / d;
          float tt = min(min(tp.x, tp.y), tp.z);
          vec3 hp = o + d * tt;
          float tone = deHash(cellId * 3.7 + 1.0);
          vec3 wallC = mix(vec3(0.42, 0.38, 0.32), vec3(0.5, 0.5, 0.47), tone) * mix(0.55, 1.0, h);
          if (deHash(cellId * 9.1) > 0.75) wallC *= vec3(0.75, 0.85, 0.95);
          vec3 room;
          if (tt == tp.z) room = wallC * (0.8 + 0.2 * texture2D(uNoiseTex, hp.xy * 0.3).r);
          else if (tt == tp.x) room = wallC * 0.62;
          else if (d.y < 0.0) room = vec3(0.2, 0.15, 0.1) * (0.6 + 0.5 * deHash(floor(vec2(hp.x * 3.0, hp.z)) + cellId));
          else room = vec3(0.5, 0.49, 0.46) * 0.8;
          // a piece of furniture against the back wall, a door, a lamp shade
          float furnX = sp.x * (0.25 + 0.5 * h);
          float furn = step(0.45, h2) * step(abs(hp.x - furnX), sp.x * 0.18) * step(hp.y, mix(0.8, 1.9, fract(h2 * 3.0))) * step(D - 0.9, hp.z);
          room = mix(room, vec3(0.12, 0.09, 0.07), furn);
          float door = step(0.7, fract(h * 5.0)) * step(abs(hp.x - sp.x * 0.8), 0.45) * step(hp.y, 2.1) * step(D - 0.01, hp.z);
          room = mix(room, vec3(0.05), door * 0.8);
          // light only comes in through the window: falls off with depth
          room *= exp(-hp.z * 0.22) * 0.95 + 0.04;
          // flooded rooms below the waterline
          float hy = cellId.y * sp.y + hp.y;
          if (hy < 0.15) room = mix(room, vec3(0.02, 0.05, 0.045), 0.9);
          // curtains drawn in some
          float cur = step(0.55, h) * step(h, 0.72) * (1.0 - curtain);
          float curMask = cur * smoothstep(0.35 + 0.25 * fract(h * 11.0), 0.3 + 0.25 * fract(h * 11.0), abs(f.x - 0.5) * 2.0 - 0.0);
          room = mix(room, mix(vec3(0.55, 0.5, 0.42), vec3(0.42, 0.3, 0.26), step(0.63, h)) * (0.72 + 0.28 * sin(f.x * 70.0 + h * 9.0)), cur * 0.85);
          deInterior = room;
          deTrans = pane * mix(0.75, 0.45, curtain);
          if (deLit > 0.5) deInterior = mix(room, vec3(1.0, 0.62, 0.3), 0.6) * 3.0;
        }
        // glass is dark and reflective; dirt makes it hazy at the bottom
        float dirt = texture2D(uNoiseTex, vUvM * 0.4).g * (0.6 + 0.4 * (1.0 - hf));
        deGlassR = mix(0.03, 0.22, dirt * dirt) + curtain * 0.0;
        vec3 glassCol = mix(vec3(0.012, 0.016, 0.018), vec3(0.04, 0.05, 0.05), curtain);
        diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, pane);
        diffuseColor.rgb = mix(diffuseColor.rgb, frameCol, frameAll * (1.0 - deBroken));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006), deBroken * (1.0 - frameAll) * 0.0);
        deWinMask = pane;
      }` : ''}
      // vines climbing from the waterline
      if (vMeta.z > 0.01) {
        float vn = texture2D(uNoiseTex, vWPos.xz * 0.013 + vWPos.y * 0.021).g;
        float vn2 = texture2D(uNoiseTex, vec2(vWPos.x + vWPos.z, vWPos.y) * 0.09).b;
        float reach = vMeta.z * 26.0 * vn;
        float vine = smoothstep(0.0, 1.0, (reach - vWPos.y) * 0.25) * smoothstep(0.42, 0.7, vn2 + vn * 0.3) * 0.85;
        vec3 leaf = mix(vec3(0.05, 0.08, 0.03), vec3(0.11, 0.13, 0.05), vn2) * (0.5 + texture2D(uNoiseTex, vWPos.xy * 0.9 + vWPos.zy * 0.7).r);
        diffuseColor.rgb = mix(diffuseColor.rgb, leaf, vine * (1.0 - deWinMask * 0.5));
        deWinMask *= 1.0 - vine; deTrans *= 1.0 - vine;
      }
      ${noUnderwater ? '' : `
      // high-water stains, algae band and silt below the surface
      float deN = texture2D(uNoiseTex, vWPos.xz * 0.05 + vWPos.y * 0.1).r;
      float band = smoothstep(2.4 + deN * 1.2, 0.2, vWPos.y) * step(-0.5, vWPos.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.6, 0.45), band * 0.8);
      float under = smoothstep(0.1, -0.4, vWPos.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.52, 0.4) + vec3(0.02, 0.035, 0.02), under * 0.85);
      float splash = smoothstep(0.6, 0.0, abs(vWPos.y - 0.25));
      diffuseColor.rgb *= 1.0 - 0.35 * max(splash, uWet * 0.8);
      `}`);
    // glass is flat: drop the concrete normal map inside window panes (kills env-map glitter)
    fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(mix(normal, nonPerturbedNormal, clamp(deWinMask * 1.5, 0.0, 1.0)));`);
    fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, deGlassR, deWinMask * (1.0 - deBroken));
      roughnessFactor = mix(roughnessFactor, 1.0, deBroken);
      roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet * step(-0.2, vWPos.y));`);
    fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, mix(0.0, 0.35, deCurtain), deWinMask * (1.0 - deBroken));`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      // rooms seen through the glass are lit by the daylight that falls into them
      totalEmissiveRadiance += deInterior * deTrans * mix(uAmbient * 0.32, vec3(1.0), deLit * uNight);`);
    if (!noUnderwater) {
      fs = fs.replace('#include <opaque_fragment>', `
      if (vWPos.y < 0.0) {
        float depthB = -vWPos.y;
        float sunUp = clamp(uSunDir.y * 2.0, 0.0, 1.0);
        float ca = causticField(vWPos.xz * 0.45 + vec2(uTime * 0.03), uTime * 0.6);
        float ca2 = causticField(vWPos.xz * 0.9 - vec2(uTime * 0.02), uTime * 0.45 + 1.7);
        float caustic = (ca * 0.65 + ca2 * 0.35) * exp(-depthB * 0.18) * smoothstep(0.0, 0.6, depthB);
        outgoingLight += diffuseColor.rgb * uSunColor * caustic * sunUp * uCaustics * 1.6;
        // light reaching this depth is absorbed: red first, then green
        vec3 absorb = exp(-vec3(0.32, 0.09, 0.07) * depthB);
        outgoingLight *= mix(vec3(1.0), absorb, 0.92);
      }
      outgoingLight += vec3(0.05, 0.5, 0.45) * uGlow * smoothstep(-30.0, -70.0, vWPos.y);
      #include <opaque_fragment>`);
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `de-${facade ? 'f' : ''}${bob ? 'b' : ''}${noUnderwater ? 'n' : ''}${antiTile ? 't' : ''}${cloth ? 'c' : ''}`;
  return mat;
}
