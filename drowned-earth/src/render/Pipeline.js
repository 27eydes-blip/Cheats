import * as THREE from 'three';

// Rendering pipeline.
//  low:        far layer → clear depth → everything, straight to the screen.
//  medium/high: far layer + opaque world into an HDR target (color + depth),
//              [SSAO half-res] → compose to B (AO, SSR on wet ground) →
//              water + FX → [volumetric sun, half-res] → [TAA resolve] →
//              bloom → final (FXAA or TAA, motion blur, mist, grade).
//              composite to screen (tonemap, grade, underwater shafts) while
//              restoring depth via gl_FragDepth, then water + transparent FX on
//              top. The water samples the opaque color/depth for refraction,
//              depth tint and shoreline foam.
// LAYER_DETAIL: small props — drawn in the main pass, skipped by water reflections
export const LAYER_WORLD = 0, LAYER_WATER = 1, LAYER_FX = 2, LAYER_DETAIL = 3;

const compositeVS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Pass 1: copy the opaque HDR scene into the second target and restore its depth.
const copyFS = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); gl_FragDepth = texture2D(tDepth, vUv).x; }`;

// Bloom: bright-pass downsample, then separable gaussian blurs at low resolution.
const brightFS = /* glsl */`
uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb;  c += texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0); k = k * k / (k + 0.5);
  gl_FragColor = vec4(min(c * (k / max(l, 1e-4)), vec3(40.0)), 1.0);
}`;
const blurFS = /* glsl */`
uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * 0.227;
  c += (texture2D(tColor, vUv + uDir * 1.385).rgb + texture2D(tColor, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(tColor, vUv + uDir * 3.231).rgb + texture2D(tColor, vUv - uDir * 3.231).rgb) * 0.07;
  gl_FragColor = vec4(c, 1.0);
}`;


// ---- Screen-space ambient occlusion (Alchemy/SAO style), half resolution.
// View-space positions are rebuilt from depth; normals from neighbouring depth.
const aoFS = /* glsl */`
#include <common>
uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uProj; uniform vec2 uTexel; uniform float uRadius; uniform float uTime; uniform int uSamples;
varying vec2 vUv;
vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = vpos(vUv);
  vec3 px = vpos(vUv + vec2(uTexel.x, 0.0)), nx = vpos(vUv - vec2(uTexel.x, 0.0));
  vec3 py = vpos(vUv + vec2(0.0, uTexel.y)), ny = vpos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(px.z - P.z) < abs(nx.z - P.z) ? px - P : P - nx;
  vec3 dy = abs(py.z - P.z) < abs(ny.z - P.z) ? py - P : P - ny;
  vec3 N = normalize(cross(dx, dy));
  float screenR = uRadius * uProj[1][1] / max(-P.z, 0.1) * 0.5;
  screenR = min(screenR, 0.12);
  float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.618) * 6.2831853;
  float ao = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSamples) break;
    float fi = (float(i) + 0.5) / float(uSamples);
    float a = ang + fi * 6.2831853 * 7.0 / 3.0 * 3.0 + float(i) * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * fi * screenR;
    vec3 S = vpos(vUv + o);
    vec3 v = S - P;
    float vv = dot(v, v);
    float vn = dot(v, N);
    ao += max(0.0, vn - 0.02 * -P.z * 0.02) / (vv + 0.02) * smoothstep(uRadius * uRadius * 4.0, 0.0, vv);
  }
  ao = 1.0 - ao * 1.6 / float(uSamples);
  ao = clamp(ao, 0.0, 1.0);
  ao = mix(1.0, ao, smoothstep(140.0, 40.0, -P.z));
  gl_FragColor = vec4(ao, -P.z, 0.0, 1.0);
}`;
// depth-aware blur (r = AO, g = linear depth)
const aoBlurFS = /* glsl */`
uniform sampler2D tAO; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec2 c = texture2D(tAO, vUv).rg;
  float acc = c.r, w = 1.0;
  for (int i = -3; i <= 3; i++) {
    if (i == 0) continue;
    vec2 s = texture2D(tAO, vUv + uDir * float(i)).rg;
    float k = exp(-abs(s.g - c.g) / max(c.g * 0.05, 0.05)) * (1.0 - abs(float(i)) / 4.0);
    acc += s.r * k; w += k;
  }
  gl_FragColor = vec4(acc / w, c.g, 0.0, 1.0);
}`;

// Copy opaque HDR → target B: applies AO and (Ultra) screen-space reflections on
// wet, upward-facing surfaces, and restores depth for the water/FX pass.
const composeOpaqueFS = /* glsl */`
#include <common>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tAO; uniform float uAO;
uniform float uSSR; uniform float uWet; uniform mat4 uInvProj; uniform mat4 uProj; uniform mat4 uCamWorld; uniform vec2 uTexel; uniform float uTime;
varying vec2 vUv;
vec3 vpos(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uAO > 0.5 && d < 0.99999) {
    float ao = texture2D(tAO, vUv).r;
    col *= mix(1.0, ao, 0.85);
  }
  if (uSSR > 0.5 && uWet > 0.02 && d < 0.99999) {
    vec3 P = vpos(vUv, d);
    vec3 px = vpos(vUv + vec2(uTexel.x, 0.0), texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).x);
    vec3 py = vpos(vUv + vec2(0.0, uTexel.y), texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).x);
    vec3 N = normalize(cross(px - P, py - P));
    vec3 Nw = normalize((uCamWorld * vec4(N, 0.0)).xyz);
    vec3 Pw = (uCamWorld * vec4(P, 1.0)).xyz;
    // puddles: wet flat ground above the waterline, patchy
    float puddle = smoothstep(0.86, 0.97, Nw.y) * step(0.05, Pw.y);
    float patchy = smoothstep(0.35, 0.65, fract(sin(dot(floor(Pw.xz * 0.6), vec2(12.9898, 78.233))) * 43758.5453) * 0.5 + 0.5 * sin(Pw.x * 0.7 + sin(Pw.z * 0.5) * 2.0));
    float k = puddle * uWet * mix(0.45, 1.0, patchy);
    if (k > 0.01 && -P.z < 120.0) {
      vec3 V = normalize(P);
      vec3 R = normalize(reflect(V, N));
      vec3 hit = vec3(0.0); float found = 0.0;
      float stepLen = 0.25 + -P.z * 0.02;
      vec3 Q = P + N * 0.05;
      float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(41.3, 289.1)) + uTime) * 43758.5);
      Q += R * stepLen * jitter;
      for (int i = 0; i < 28; i++) {
        Q += R * stepLen; stepLen *= 1.12;
        vec4 c = uProj * vec4(Q, 1.0); vec2 uv = c.xy / c.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
        float sd = texture2D(tDepth, uv).x;
        vec3 S = vpos(uv, sd);
        float dz = S.z - Q.z;
        if (dz > 0.0 && dz < stepLen * 2.5 + 0.2) {
          // refine
          vec3 a = Q - R * stepLen, b = Q;
          for (int j = 0; j < 4; j++) { vec3 m = (a + b) * 0.5; vec4 cm = uProj * vec4(m, 1.0); vec2 um = cm.xy / cm.w * 0.5 + 0.5; if (vpos(um, texture2D(tDepth, um).x).z > m.z) b = m; else a = m; }
          vec4 cb = uProj * vec4(b, 1.0); uv = cb.xy / cb.w * 0.5 + 0.5;
          hit = texture2D(tColor, uv).rgb;
          vec2 e = smoothstep(0.0, 0.12, uv) * smoothstep(1.0, 0.88, uv);
          found = e.x * e.y * smoothstep(0.0, 0.15, R.y + 0.15);
          break;
        }
      }
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
      col = mix(col, hit, found * k * mix(0.25, 0.9, fres));
      col *= 1.0 - k * 0.25; // wet surfaces are darker
    }
  }
  gl_FragColor = vec4(col, 1.0);
  gl_FragDepth = d;
}`;

// Volumetric sunlight (Ultra): march the view ray through height fog, testing
// the sun's shadow map at each step, half resolution, dithered (TAA resolves it).
const volFS = /* glsl */`
#include <common>
#include <packing>
uniform sampler2D tDepth; uniform sampler2D tShadow; uniform mat4 uShadowMatrix; uniform mat4 uInvProj; uniform mat4 uCamWorld;
uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uDensity; uniform float uTime; uniform float uHasShadow;
varying vec2 vUv;
float shadowAt(vec3 wp) {
  vec4 sc = uShadowMatrix * vec4(wp, 1.0); sc.xyz /= sc.w;
  if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return step(sc.z - 0.0015, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
}
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
  vec3 wp = (uCamWorld * vec4(v.xyz, 1.0)).xyz;
  vec3 rd = wp - uCamPos; float dist = min(length(rd), 160.0); rd = normalize(rd);
  const int N = 24;
  float stepL = dist / float(N);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.7);
  float mu = dot(rd, uSunDir);
  // Henyey-Greenstein forward scattering, plus a little isotropic
  float g = 0.6; float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.0796;
  float phase = hg + 0.03;
  vec3 acc = vec3(0.0); float trans = 1.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + jitter) * stepL;
    vec3 p = uCamPos + rd * t;
    float dens = uDensity * exp(-max(p.y, 0.0) / 14.0);
    float sh = uHasShadow > 0.5 ? shadowAt(p) : 1.0;
    acc += trans * dens * stepL * sh * phase;
    trans *= exp(-dens * stepL);
  }
  gl_FragColor = vec4(uSunCol * acc, trans);
}`;

// Temporal anti-aliasing: reproject last frame by depth, clamp it to this
// frame's neighbourhood (YCoCg), blend.
const taaFS = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tHistory; uniform sampler2D tDepth;
uniform mat4 uInvViewProj; uniform mat4 uPrevViewProj; uniform vec2 uTexel; uniform float uReset;
varying vec2 vUv;
vec3 toY(vec3 c) { c = c / (1.0 + max(c.r, max(c.g, c.b))); return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 fromY(vec3 y) { vec3 c = vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-4); }
void main() {
  vec3 cur = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  vec4 wp = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); wp /= wp.w;
  vec4 pp = uPrevViewProj * wp; vec2 puv = pp.xy / pp.w * 0.5 + 0.5;
  vec3 mn = vec3(1e9), mx = vec3(-1e9), m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 s = toY(texture2D(tColor, vUv + vec2(x, y) * uTexel).rgb);
    mn = min(mn, s); mx = max(mx, s); m1 += s; m2 += s * s;
  }
  // variance clipping tightens the box
  m1 /= 9.0; vec3 sig = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
  mn = max(mn, m1 - sig * 1.25); mx = min(mx, m1 + sig * 1.25);
  vec3 hist = toY(texture2D(tHistory, puv).rgb);
  hist = clamp(hist, mn, mx);
  float off = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
  float vel = length((puv - vUv) / uTexel);
  float k = mix(0.9, 0.75, clamp(vel / 24.0, 0.0, 1.0)) * off * (1.0 - uReset);
  gl_FragColor = vec4(fromY(mix(toY(cur), hist, k)), 1.0);
}`;

// Final pass: lens, depth of field, mist hugging the water, sun shafts,
// underwater rays, bloom, filmic tonemap and grade, vignette, grain.
const compositeFS = /* glsl */`
#include <common>
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform sampler2D tBloom2;
uniform float uNear; uniform float uFar; uniform float uTime;
uniform float uUnder; uniform vec2 uSunScreen; uniform float uSunVis; uniform vec3 uUnderColor;
uniform float uVignette; uniform float uGrain; uniform float uSat; uniform float uFlash; uniform float uFade;
uniform float uCamDepth; uniform float uIndoor;
uniform float uWetLens; uniform float uTunnel; uniform float uDof; uniform float uBloom; uniform vec2 uTexel; uniform float uCondense; uniform float uSharp;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform float uMist; uniform vec3 uMistCol; uniform vec2 uSunUV; uniform float uShaft; uniform float uLens;
uniform float uDofAmt; uniform float uFXAA; uniform float uMotion; uniform mat4 uInvViewProj; uniform mat4 uPrevViewProj; uniform sampler2D tVol; uniform float uVol; uniform float uFocus;
varying vec2 vUv;
float lumaT(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
// FXAA (quality-lite), on the HDR input with tonemapped luma
vec3 fxaa(vec2 uv) {
  vec3 cM = texture2D(tColor, uv).rgb;
  float lM = lumaT(cM);
  float lN = lumaT(texture2D(tColor, uv + vec2(0.0, uTexel.y)).rgb), lS = lumaT(texture2D(tColor, uv - vec2(0.0, uTexel.y)).rgb);
  float lE = lumaT(texture2D(tColor, uv + vec2(uTexel.x, 0.0)).rgb), lW = lumaT(texture2D(tColor, uv - vec2(uTexel.x, 0.0)).rgb);
  float mn = min(lM, min(min(lN, lS), min(lE, lW))), mx = max(lM, max(max(lN, lS), max(lE, lW)));
  float range = mx - mn;
  if (range < max(0.0312, mx * 0.125)) return cM;
  float lNW = lumaT(texture2D(tColor, uv + vec2(-uTexel.x, uTexel.y)).rgb), lNE = lumaT(texture2D(tColor, uv + uTexel).rgb);
  float lSW = lumaT(texture2D(tColor, uv - uTexel).rgb), lSE = lumaT(texture2D(tColor, uv + vec2(uTexel.x, -uTexel.y)).rgb);
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);
  float lb = lumaT(b);
  return (lb < mn || lb > mx) ? a : b;
}
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 worldAt(vec2 uv, float d) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
  return (uCamWorld * vec4(v.xyz, 1.0)).xyz;
}
void main() {
  vec2 uv = vUv;
  if (uWetLens > 0.01) {
    vec2 cell = floor(vUv * vec2(18.0, 10.0)); vec2 f = fract(vUv * vec2(18.0, 10.0)) - 0.5;
    float h = rnd(cell); vec2 c = (vec2(rnd(cell + 3.1), rnd(cell + 7.7)) - 0.5) * 0.6;
    float r = 0.12 + 0.22 * h; float dd = length(f - c);
    float drop = smoothstep(r, r * 0.6, dd) * step(1.0 - uWetLens, h);
    uv += (f - c) * drop * 0.012; // a drop bends what's behind it — gently
  }
  float d = texture2D(tDepth, uv).x;
  // subtle chromatic aberration toward the frame edges
  // lens fringing: faint, and only toward the corners (it reads as fake mid-frame)
  vec2 cq = uv - 0.5; vec2 ca = cq * dot(cq, cq) * uLens * 0.004;
  vec3 col = uFXAA > 0.5 ? fxaa(uv) : texture2D(tColor, uv).rgb;
  if (uLens > 0.5) { col.r = mix(col.r, texture2D(tColor, uv + ca).r, 0.85); col.b = mix(col.b, texture2D(tColor, uv - ca).b, 0.85); }
  // camera motion blur: reproject this pixel into last frame and smear along the difference
  if (uMotion > 0.001 && d < 0.99999) {
    vec4 wp = uInvViewProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); wp /= wp.w;
    vec4 pp = uPrevViewProj * wp; vec2 vel = (uv - (pp.xy / pp.w * 0.5 + 0.5)) * uMotion;
    float vl = length(vel); if (vl > 0.03) vel *= 0.03 / vl;
    if (vl > uTexel.x * 1.5) {
      vec3 acc = col;
      for (int i = 1; i < 6; i++) acc += texture2D(tColor, uv - vel * (float(i) / 6.0 - 0.5)).rgb;
      col = acc / 6.0;
    }
  }
  if (uDof > 0.5) {
    float fz = uFocus > 0.0 ? uFocus : -perspectiveDepthToViewZ(texture2D(tDepth, vec2(0.5)).x, uNear, uFar);
    float vz = -perspectiveDepthToViewZ(d, uNear, uFar);
    float coc = clamp(abs(vz - fz) / max(fz, 1.0), 0.0, 1.0) * uDofAmt;
    vec3 acc = col; float wsum = 1.0;
    for (int i = 0; i < 16; i++) { float a = float(i) * 2.399; float rr = sqrt(float(i) + 0.5) * 2.2 * coc; vec2 o = vec2(cos(a), sin(a)) * rr * uTexel * 2.0; acc += texture2D(tColor, uv + o).rgb; wsum += 1.0; }
    col = acc / wsum;
  }
  float viewZ = -perspectiveDepthToViewZ(d, uNear, uFar);
  if (uUnder > 0.5) {
    vec2 dir = vUv - uSunScreen;
    float ang = atan(dir.y, dir.x);
    float rays = sin(ang * 23.0 + uTime * 0.3) * sin(ang * 41.0 - uTime * 0.21) * 0.5 + 0.5;
    rays = pow(rays, 3.0) * smoothstep(1.2, 0.0, length(dir)) * uSunVis * (1.0 - uIndoor);
    float distFade = 1.0 - exp(-viewZ * 0.09);
    col += uUnderColor * rays * 2.4 * distFade * exp(-uCamDepth * 0.13);
    col += uUnderColor * (rnd(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.012; // fine silt grain, per pixel
  } else {
    // low mist that hugs the water: exponential height fog integrated along the view ray
    vec3 wp = d >= 0.99999 ? uCamPos + normalize(worldAt(uv, 0.5) - uCamPos) * 2500.0 : worldAt(uv, d);
    vec3 rd = wp - uCamPos; float dist = length(rd); rd /= dist;
    float H = 7.0;
    float y0 = max(uCamPos.y, 0.0), y1 = max(wp.y, 0.0);
    float dy = y1 - y0;
    float avg = abs(dy) > 0.05 ? H * (exp(-y0 / H) - exp(-y1 / H)) / dy : exp(-y0 / H);
    float mist = 1.0 - exp(-uMist * min(dist, 2500.0) * avg);
    float toSun = pow(max(dot(rd, uSunDir), 0.0), 6.0);
    vec3 mcol = uMistCol + uSunCol * toSun * 0.9;
    col = mix(col, mcol, clamp(mist, 0.0, 0.92));
    // volumetric sunlight (Ultra): in-scattered light through the shadow map
    if (uVol > 0.5) { vec4 vs = texture2D(tVol, vUv); col = col * mix(1.0, vs.a, 0.2) + vs.rgb * 0.55; }
    // god rays: march toward the sun, gathering open sky between the towers
    if (uShaft > 0.001) {
      vec2 delta = (uSunUV - uv) / 36.0;
      vec2 suv = uv; float illum = 0.0, decay = 1.0;
      for (int i = 0; i < 36; i++) {
        suv += delta;
        if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) break;
        float sky = step(0.99999, texture2D(tDepth, suv).x);
        illum += sky * decay; decay *= 0.955;
      }
      float fall = smoothstep(1.1, 0.0, length((uv - uSunUV) * vec2(uTexel.y / uTexel.x, 1.0)));
      col += uSunCol * illum / 36.0 * uShaft * fall * (0.6 + 0.4 * step(d, 0.99999));
    }
  }
  // contrast-adaptive sharpen (after AMD FidelityFX CAS): a cross of 5 taps,
  // sharpening weight scaled down where local contrast is already high
  if (uSharp > 0.001) {
    vec3 n = texture2D(tColor, uv + vec2(0.0, uTexel.y)).rgb, s2 = texture2D(tColor, uv - vec2(0.0, uTexel.y)).rgb;
    vec3 e = texture2D(tColor, uv + vec2(uTexel.x, 0.0)).rgb, w = texture2D(tColor, uv - vec2(uTexel.x, 0.0)).rgb;
    // work on tonemapped values so bright HDR edges don't ring
    vec3 cT = col / (1.0 + col), nT = n / (1.0 + n), sT = s2 / (1.0 + s2), eT = e / (1.0 + e), wT = w / (1.0 + w);
    vec3 mn = min(cT, min(min(nT, sT), min(eT, wT))), mx = max(cT, max(max(nT, sT), max(eT, wT)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
    vec3 wgt = -amp / mix(16.0, 8.0, uSharp);
    vec3 r = (cT + (nT + sT + eT + wT) * wgt) / (1.0 + 4.0 * wgt);
    r = clamp(r, mn, mx); // never past the neighbourhood: no halos
    r = clamp(r, 0.0, 0.999);
    col = r / (1.0 - r);
  }
  // bloom: tight + wide
  col += (texture2D(tBloom, vUv).rgb * 0.7 + texture2D(tBloom2, vUv).rgb * 0.9) * uBloom * 0.22;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col += uFlash * vec3(0.75, 0.8, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // filmic grade: cool, slightly lifted shadows; warm highlights; gentle S-curve
  vec3 g = gl_FragColor.rgb;
  float lum = dot(g, vec3(0.299, 0.587, 0.114));
  g += vec3(-0.012, 0.004, 0.018) * (1.0 - smoothstep(0.0, 0.45, lum));
  g += vec3(0.02, 0.008, -0.018) * smoothstep(0.55, 1.0, lum);
  g = mix(g, g * g * (3.0 - 2.0 * g), 0.22);
  vec2 q = vUv - 0.5;
  g *= 1.0 - dot(q, q) * (uVignette + uTunnel * 3.5);
  g = mix(g, vec3(0.75, 0.78, 0.8) * (0.4 + 0.6 * g), uCondense * smoothstep(0.15, 0.6, length(q)) * 0.6);
  g += (rnd(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
  g *= 1.0 - uFade;
  gl_FragColor.rgb = g;
}`;

function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

// Planar reflection camera for the water (adapted from the standard oblique-clip reflector).
const _n = new THREE.Vector3(0, 1, 0), _rp = new THREE.Vector3(), _cp = new THREE.Vector3(), _rot = new THREE.Matrix4();
const _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _view = new THREE.Vector3(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();

export class Pipeline {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.size = new THREE.Vector2();
    this.target = null;
    this.uniforms = {
      tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 2000 },
      uTime: { value: 0 }, uUnder: { value: 0 }, uSunScreen: { value: new THREE.Vector2(0.5, 1) }, uSunVis: { value: 0 },
      uUnderColor: { value: new THREE.Color(0.1, 0.3, 0.3) }, uVignette: { value: 0.9 }, uGrain: { value: 0.025 }, uSat: { value: 1 },
      uFlash: { value: 0 }, uFade: { value: 0 }, uCamDepth: { value: 0 }, uIndoor: { value: 0 }, uWetLens: { value: 0 }, uTunnel: { value: 0 }, uDof: { value: 0 }, uBloom: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uCondense: { value: 0 },
      tBloom: { value: null }, tBloom2: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uMist: { value: 0 }, uMistCol: { value: new THREE.Color() },
      uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uShaft: { value: 0 }, uLens: { value: 1 },
      uFXAA: { value: 0 }, uMotion: { value: 0 }, uInvViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      tVol: { value: null }, uVol: { value: 0 }, uFocus: { value: 0 }, uSharp: { value: 0.5 }, uDofAmt: { value: 1 },
    };
    this.scale = 1;          // dynamic resolution multiplier (set by the frame governor)
    this.frameIndex = 0;
    this.prevViewProj = new THREE.Matrix4();
    this.viewProj = new THREE.Matrix4();
    this.jitter = new THREE.Vector2();
    this.historyValid = false;
    this.stats = { passes: 0 };
    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: compositeVS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
    this.copyMat = mk(copyFS, { tColor: { value: null }, tDepth: { value: null } }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    this.brightMat = mk(brightFS, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } });
    this.blurMat = mk(blurFS, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.aoMat = mk(aoFS, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.9 }, uTime: { value: 0 }, uSamples: { value: 8 } });
    this.aoBlurMat = mk(aoBlurFS, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.composeMat = mk(composeOpaqueFS, {
      tColor: { value: null }, tDepth: { value: null }, tAO: { value: null }, uAO: { value: 0 }, uSSR: { value: 0 }, uWet: { value: 0 },
      uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 },
    }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    this.volMat = mk(volFS, {
      tDepth: { value: null }, tShadow: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uDensity: { value: 0.01 }, uTime: { value: 0 }, uHasShadow: { value: 0 },
    });
    this.taaMat = mk(taaFS, { tColor: { value: null }, tHistory: { value: null }, tDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uReset: { value: 1 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: compositeVS, fragmentShader: compositeFS, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, toneMapped: true,
    }));
    this.quad.frustumCulled = false;
    this.finalMat = this.quad.material;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflMatrix = new THREE.Matrix4();
    this.reflTarget = null;
    this.configure();
  }
  updateReflection(world) {
    const { camera, scene, renderer } = { ...world, renderer: this.renderer };
    const vc = this.reflCam;
    _cp.setFromMatrixPosition(camera.matrixWorld);
    _rp.set(_cp.x, 0, _cp.z);
    _rot.extractRotation(camera.matrixWorld);
    _view.subVectors(_rp, _cp).reflect(_n).negate().add(_rp);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _tgt.subVectors(_rp, _look).reflect(_n).negate().add(_rp);
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    vc.lookAt(_tgt);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _rp).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + pm[8]) / pm[0], (Math.sign(_clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pm[2] = _clip.x; pm[6] = _clip.y; pm[10] = _clip.z + 1 - 0.003; pm[14] = _clip.w;
    vc.layers.set(LAYER_WORLD);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.reflTarget);
    renderer.setClearAlpha(0);
    renderer.clear(true, true, true);
    renderer.render(scene, vc);
    renderer.setClearAlpha(prevAlpha);
  }
  get usePost() { return this.settings.q.postPipeline; }
  // dynamic resolution: re-allocate targets at the new scale
  setScale(s) {
    s = Math.round(s * 20) / 20;
    if (Math.abs(s - this.scale) < 0.01) return;
    this.scale = s;
    this.historyValid = false;
    this.configure();
  }
  get q() { return this.settings.q; }
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  configure() {
    const r = this.renderer;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, this.settings.q.pixelRatio, 2);
    r.setPixelRatio(this.basePixelRatio * this.scale);
    this.resize();
  }
  resize() {
    const r = this.renderer;
    const w = window.innerWidth, h = window.innerHeight;
    r.setSize(w, h, false);
    r.getDrawingBufferSize(this.size);
    if (this.usePost) {
      if (!this.target) {
        this.target = new THREE.WebGLRenderTarget(this.size.x, this.size.y, {
          type: THREE.HalfFloatType, depthBuffer: true,
          depthTexture: new THREE.DepthTexture(this.size.x, this.size.y, THREE.UnsignedIntType),
        });
        this.target.texture.generateMipmaps = false;
      } else this.target.setSize(this.size.x, this.size.y);
      const hdr = (w, h, depth) => { const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: !!depth, depthTexture: depth ? new THREE.DepthTexture(w, h, THREE.UnsignedIntType) : null }); t.texture.generateMipmaps = false; return t; };
      const W = this.size.x, H = this.size.y;
      if (!this.targetB) { this.targetB = hdr(W, H, true); this.bloomA = hdr(W >> 1, H >> 1); this.bloomB = hdr(W >> 2, H >> 2); this.bloomC = hdr(W >> 2, H >> 2); this.bloomD = hdr(W >> 3, H >> 3); this.bloomE = hdr(W >> 3, H >> 3); }
      else { this.targetB.setSize(W, H); this.bloomA.setSize(W >> 1, H >> 1); this.bloomB.setSize(W >> 2, H >> 2); this.bloomC.setSize(W >> 2, H >> 2); this.bloomD.setSize(W >> 3, H >> 3); this.bloomE.setSize(W >> 3, H >> 3); }
      this.copyMat.uniforms.tColor.value = this.target.texture; this.copyMat.uniforms.tDepth.value = this.target.depthTexture;
      this.uniforms.tColor.value = this.targetB.texture;
      this.uniforms.tDepth.value = this.targetB.depthTexture;
      this.uniforms.tBloom.value = this.bloomC.texture; this.uniforms.tBloom2.value = this.bloomE.texture;
      this.uniforms.uTexel.value.set(1 / W, 1 / H);
      const low = (w, h, type = THREE.UnsignedByteType) => { const t = new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false }); t.texture.generateMipmaps = false; return t; };
      const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
      if (this.q.ssao) {
        if (!this.aoA) { this.aoA = low(hw, hh, THREE.HalfFloatType); this.aoB = low(hw, hh, THREE.HalfFloatType); } else { this.aoA.setSize(hw, hh); this.aoB.setSize(hw, hh); }
      }
      if (this.q.volumetric) {
        if (!this.volT) this.volT = low(hw, hh, THREE.HalfFloatType); else this.volT.setSize(hw, hh);
        this.uniforms.tVol.value = this.volT.texture;
      }
      if (this.q.taa) {
        if (!this.histA) { this.histA = hdr(W, H); this.histB = hdr(W, H); } else { this.histA.setSize(W, H); this.histB.setSize(W, H); }
        this.historyValid = false;
      }
    } else if (this.target) { this.target.dispose(); this.target = null; }
    const rs = this.settings.q.reflections;
    if (rs && this.usePost) {
      const w2 = Math.max(64, Math.floor(this.size.x * rs)), h2 = Math.max(64, Math.floor(this.size.y * rs));
      if (!this.reflTarget) { this.reflTarget = new THREE.WebGLRenderTarget(w2, h2, { type: THREE.HalfFloatType }); this.reflTarget.texture.generateMipmaps = false; }
      else this.reflTarget.setSize(w2, h2);
    }
  }

  render(world) {
    const { scene, camera, farScene, farCamera } = world;
    const r = this.renderer;
    r.autoClear = false;
    if (this.usePost && this.target) {
      const q = this.q;
      const W = this.size.x, H = this.size.y;
      // --- TAA: sub-pixel jitter (Halton 2,3) on both cameras
      const taa = q.taa;
      camera.updateMatrixWorld();
      this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (taa) {
        const i = (this.frameIndex++ % 8) + 1;
        this.jitter.set(halton(i, 2) - 0.5, halton(i, 3) - 0.5);
        for (const c of [camera, farCamera]) {
          c.projectionMatrix.elements[8] += (this.jitter.x * 2) / W;
          c.projectionMatrix.elements[9] += (this.jitter.y * 2) / H;
          c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
        }
      }
      if (this.reflTarget && !world.atmosphere.underwater) { this.updateReflection(world); this.reflActive = true; } else this.reflActive = false;
      r.setRenderTarget(this.target);
      // underwater the far layer is replaced by the murk itself
      const under = world.atmosphere.underwater;
      if (under) r.setClearColor(world.scene.fog.color, 1);
      r.clear(true, true, true);
      if (under) r.setClearColor(0x000000, 1); else r.render(farScene, farCamera);
      r.clearDepth();
      camera.layers.set(LAYER_WORLD);
      camera.layers.enable(LAYER_DETAIL);
      r.render(scene, camera);
      this.uniforms.uNear.value = camera.near; this.uniforms.uFar.value = camera.far;
      // --- SSAO (half res) on the opaque depth
      const t = this.uniforms.uTime.value;
      if (q.ssao && this.aoA) {
        const a = this.aoMat.uniforms;
        a.tDepth.value = this.target.depthTexture; a.uInvProj.value.copy(camera.projectionMatrixInverse); a.uProj.value.copy(camera.projectionMatrix);
        a.uTexel.value.set(2 / W, 2 / H); a.uTime.value = taa ? t : 0; a.uSamples.value = taa ? 8 : 12;
        this.pass(this.aoMat, this.aoA);
        const b = this.aoBlurMat.uniforms;
        b.tAO.value = this.aoA.texture; b.uDir.value.set(2 / W, 0); this.pass(this.aoBlurMat, this.aoB);
        b.tAO.value = this.aoB.texture; b.uDir.value.set(0, 2 / H); this.pass(this.aoBlurMat, this.aoA);
      }
      // --- opaque → B with AO + SSR, depth restored; then water + effects on top
      const c = this.composeMat.uniforms;
      c.tColor.value = this.target.texture; c.tDepth.value = this.target.depthTexture;
      c.tAO.value = this.aoA?.texture || null; c.uAO.value = q.ssao && this.aoA && !under ? 1 : 0;
      c.uSSR.value = q.ssr && !under ? 1 : 0; c.uWet.value = world.ssrWet ?? 0; c.uTime.value = t;
      c.uInvProj.value.copy(camera.projectionMatrixInverse); c.uProj.value.copy(camera.projectionMatrix); c.uCamWorld.value.copy(camera.matrixWorld);
      c.uTexel.value.set(1 / W, 1 / H);
      r.setRenderTarget(this.targetB);
      r.clear(true, true, true);
      this.pass(this.composeMat, this.targetB);
      camera.layers.disableAll(); camera.layers.enable(LAYER_WATER); camera.layers.enable(LAYER_FX);
      r.render(scene, camera);
      camera.layers.enableAll(); camera.layers.disable(31); // 31 = virtual lights (see LightPool)
      // --- volumetric sunlight through the shadow map (half res)
      const sun = world.atmosphere?.sun;
      const u = this.uniforms;
      u.uVol.value = 0;
      if (q.volumetric && this.volT && !under && sun) {
        const v = this.volMat.uniforms;
        v.tDepth.value = this.targetB.depthTexture;
        v.tShadow.value = sun.shadow?.map?.texture || null; v.uHasShadow.value = v.tShadow.value ? 1 : 0;
        if (sun.shadow) v.uShadowMatrix.value.copy(sun.shadow.matrix);
        v.uInvProj.value.copy(camera.projectionMatrixInverse); v.uCamWorld.value.copy(camera.matrixWorld); v.uCamPos.value.copy(camera.position);
        v.uSunDir.value.copy(u.uSunDir.value); v.uSunCol.value.copy(u.uSunCol.value); v.uTime.value = t;
        v.uDensity.value = world.volDensity ?? 0.006;
        if (v.uDensity.value > 1e-5) { this.pass(this.volMat, this.volT); u.uVol.value = 1; }
      }
      // --- TAA resolve (HDR, before bloom and tonemap)
      let colorTex = this.targetB.texture;
      if (taa && this.histA) {
        const m = this.taaMat.uniforms;
        m.tColor.value = this.targetB.texture; m.tDepth.value = this.targetB.depthTexture; m.tHistory.value = this.histB.texture;
        m.uInvViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
        m.uPrevViewProj.value.copy(this.prevViewProj); m.uTexel.value.set(1 / W, 1 / H); m.uReset.value = this.historyValid ? 0 : 1;
        this.pass(this.taaMat, this.histA);
        colorTex = this.histA.texture;
        [this.histA, this.histB] = [this.histB, this.histA];
        this.historyValid = true;
      }
      u.tColor.value = colorTex;
      // --- bloom chain
      const bm = this.blurMat.uniforms;
      this.brightMat.uniforms.tColor.value = colorTex; this.brightMat.uniforms.uTexel.value.set(1 / W, 1 / H);
      this.pass(this.brightMat, this.bloomA);
      bm.tColor.value = this.bloomA.texture; bm.uDir.value.set(2 / W, 0); this.pass(this.blurMat, this.bloomB);
      bm.tColor.value = this.bloomB.texture; bm.uDir.value.set(0, 4 / H); this.pass(this.blurMat, this.bloomC);
      bm.tColor.value = this.bloomC.texture; bm.uDir.value.set(8 / W, 0); this.pass(this.blurMat, this.bloomD);
      bm.tColor.value = this.bloomD.texture; bm.uDir.value.set(0, 8 / H); this.pass(this.blurMat, this.bloomE);
      // --- final
      u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uCamPos.value.copy(camera.position);
      u.uFXAA.value = taa ? 0 : 1;
      u.uMotion.value = this.settings.motionBlur && !this.settings.reduceMotion && this.prevValid ? (world.motionBlur ?? 0.5) : 0;
      // sharpen: user amount, a touch more when TAA softens or resolution drops
      u.uSharp.value = this.settings.sharpness > 0 ? Math.min(1, this.settings.sharpness * (taa ? 1.15 : 1) + (1 - this.scale) * 0.6) : 0;
      u.uInvViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
      u.uPrevViewProj.value.copy(this.prevViewProj);
      r.setRenderTarget(null);
      r.clear(true, true, true);
      this.pass(this.finalMat, null);
      // restore unjittered projections; remember this frame for reprojection
      if (taa) { camera.updateProjectionMatrix(); farCamera.updateProjectionMatrix(); }
      this.prevViewProj.copy(this.viewProj);
      this.prevValid = true;
    } else {
      r.setRenderTarget(null);
      const under = world.atmosphere.underwater;
      if (under) r.setClearColor(world.scene.fog.color, 1);
      r.clear(true, true, true);
      if (under) r.setClearColor(0x000000, 1); else r.render(farScene, farCamera);
      r.clearDepth();
      camera.layers.enableAll(); camera.layers.disable(31); // 31 = virtual lights (see LightPool)
      r.render(scene, camera);
    }
  }
}
