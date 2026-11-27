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
};

export function bindWaveUniforms(waves) { Object.assign(G, waves.uniforms); }

const COMMON = /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uCaustics;
uniform float uNight; uniform float uWet; uniform sampler2D uNoiseTex; uniform float uGlow;
varying vec3 vWPos; varying vec4 vMeta; varying vec2 vUvM;
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
  const { facade = false, bob = false, noUnderwater = false } = opts;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G);
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\nattribute vec4 aMeta;\n${COMMON}\n${bob ? WAVES_GLSL : ''}`);
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\nvMeta = aMeta; vUvM = uv;`);
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
    vs = vs.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 deW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        deW = instanceMatrix * deW;
      #endif
      vWPos = (modelMatrix * deW).xyz;`);
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${COMMON}`);
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      float deWinMask = 0.0; float deBroken = 0.0; float deLit = 0.0;
      ${facade ? `
      if (vMeta.x > 0.5) {
        float curtain = step(1.5, vMeta.x);
        vec2 sp = vec2(mix(2.6, 4.4, vMeta.y), 3.4);
        vec2 cellId = floor(vUvM / sp);
        vec2 f = fract(vUvM / sp);
        float h = deHash(cellId + vMeta.w * 17.0);
        float mx = mix(mix(0.12, 0.26, fract(vMeta.y * 7.3)), 0.04, curtain), myb = mix(mix(0.22, 0.34, fract(vMeta.y * 3.1)), 0.05, curtain), myt = mix(0.85, 0.97, curtain);
        deWinMask = step(mx, f.x) * step(f.x, 1.0 - mx) * step(myb, f.y) * step(f.y, myt);
        // recess shadow around each opening + a darker spandrel band per floor
        float rim = (smoothstep(mx - 0.05, mx, f.x) - smoothstep(1.0 - mx, 1.0 - mx + 0.05, f.x)) * (smoothstep(myb - 0.06, myb, f.y) - smoothstep(myt, myt + 0.04, f.y));
        diffuseColor.rgb *= 1.0 - 0.35 * clamp(rim - deWinMask, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.82, (1.0 - curtain) * step(f.y, 0.12));
        float floorTint = deHash(vec2(cellId.y, vMeta.w * 31.0));
        deBroken = step(0.86, h) * deWinMask;
        deLit = step(0.9985, deHash(cellId * 1.7 + 3.1)) * deWinMask * (1.0 - deBroken);
        // grime streaks below windows
        float streak = texture2D(uNoiseTex, vec2(vUvM.x * 0.35, vUvM.y * 0.02)).r;
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.38 * streak, 0.7);
        vec3 glassCol = mix(vec3(0.035, 0.045, 0.05), vec3(0.08, 0.085, 0.085), h) * mix(0.7, 1.2, floorTint);
        // curtains / blinds in some windows
        float curtainIn = step(0.55, h) * step(h, 0.7) * step(0.5, f.y);
        glassCol = mix(glassCol, vec3(0.18, 0.16, 0.13), curtainIn * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, deWinMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008), deBroken);
      }` : ''}
      // vines climbing from the waterline
      if (vMeta.z > 0.01) {
        float vn = texture2D(uNoiseTex, vWPos.xz * 0.013 + vWPos.y * 0.021).g;
        float vn2 = texture2D(uNoiseTex, vec2(vWPos.x + vWPos.z, vWPos.y) * 0.09).b;
        float reach = vMeta.z * 26.0 * vn;
        float vine = smoothstep(0.0, 1.0, (reach - vWPos.y) * 0.25) * smoothstep(0.35, 0.6, vn2 + vn * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.11, 0.035) * (0.6 + vn2), vine * (1.0 - deWinMask * 0.5));
        deWinMask *= 1.0 - vine;
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
    fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.06, deWinMask * (1.0 - deBroken));
      roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet * step(-0.2, vWPos.y));`);
    fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.55, deWinMask * (1.0 - deBroken));`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.7, 0.38) * deLit * uNight * 1.6;`);
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
  mat.customProgramCacheKey = () => `de-${facade ? 'f' : ''}${bob ? 'b' : ''}${noUnderwater ? 'n' : ''}`;
  return mat;
}
