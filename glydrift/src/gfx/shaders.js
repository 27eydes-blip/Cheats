// WebGL shaders: the living sky (rendered at low-res then upscaled) and a single-pass
// camera post-FX (bloom, chromatic aberration, glitch, heartbeat vignette, flash).
import Phaser from "phaser";

export const SKY_FRAG = `
precision mediump float;
uniform vec2 resolution;
uniform float uTime;
uniform float uScroll;
uniform vec3 uSky0;
uniform vec3 uSky1;
uniform vec3 uSky2;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform float uPulse;
uniform float uGlitch;
uniform float uDetail;
varying vec2 outTexCoord;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= 3.0 + uDetail * 2.0) break;
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = outTexCoord;
  float aspect = resolution.y / resolution.x;
  vec3 col = uv.y > 0.5 ? mix(uSky1, uSky0, (uv.y - 0.5) * 2.0) : mix(uSky2, uSky1, uv.y * 2.0);
  float t = uTime * 0.025;
  vec2 p = vec2(uv.x * 1.8 + uScroll, uv.y * 1.8 * aspect * 0.55);
  float n = fbm(p + vec2(t, -t * 0.6));
  float n2 = fbm(p * 1.6 + vec2(n * 1.8, t * 1.3));
  float neb = smoothstep(0.32, 0.92, n2);
  // slow colour drift so the sky never sits still
  float drift = 0.5 + 0.5 * sin(uTime * 0.07 + uv.x * 2.0);
  vec3 nebCol = mix(uNeb0, uNeb1, drift * 0.6);
  // nebula is subtle atmosphere only: ~70% dimmer than before, never the brightest thing
  col += nebCol * neb * 0.15;
  col += uNeb1 * pow(neb, 3.0) * 0.1;
  col *= 0.8 + 0.35 * n;
  // faint horizon band (halved again so no bright central streak)
  col += uNeb0 * 0.02 * exp(-pow((uv.y - 0.3) * 4.0, 2.0));
  // abyss heartbeat
  col += vec3(0.3, 0.0, 0.03) * uPulse * (0.3 + 0.7 * neb);
  // glitch realm flicker bands
  if (uGlitch > 0.0) {
    float band = hash(vec2(floor(uTime * 9.0), floor(uv.y * 24.0)));
    float g = step(1.0 - 0.06 * uGlitch, band);
    col = mix(col, col.gbr * 1.3, g * 0.5);
    col += vec3(0.0, 0.015, 0.008) * uGlitch * step(0.5, fract(uv.y * 90.0));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// Post-FX for the gameplay layer only. The gameplay camera is transparent and drawn on top
// of the Backdrop scene, so alpha is preserved and bloom never touches the background.
const POST_FRAG = `
#define SHADER_NAME GLY_POST_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAberration;
uniform float uGlitch;
uniform float uFlash;
uniform float uBloom;
uniform float uPxScale;
varying vec2 outTexCoord;

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = outTexCoord;
  if (uGlitch > 0.001) {
    float row = floor(uv.y * 48.0);
    float tt = floor(uTime * 18.0);
    float h = hash(row * 13.1 + tt);
    if (h < uGlitch * 0.22) uv.x += (hash(row + tt * 3.7) - 0.5) * 0.09 * uGlitch;
    if (hash(tt * 1.3) < uGlitch * 0.08) {
      vec2 px = vec2(90.0, 180.0);
      uv = floor(uv * px) / px;
    }
  }
  vec2 dir = uv - 0.5;
  float ab = uAberration + uGlitch * 0.007;
  vec4 base = texture2D(uMainSampler, uv);
  vec3 col = base.rgb;
  float alpha = base.a;
  if (ab > 0.0005) {
    vec4 r = texture2D(uMainSampler, uv + dir * ab);
    vec4 b = texture2D(uMainSampler, uv - dir * ab);
    col = vec3(r.r, base.g, b.b);
    alpha = max(alpha, max(r.a, b.a));
  }
  if (uBloom > 0.0) {
    vec2 px = uPxScale / uResolution;
    vec3 g = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472 + 0.3;
      vec2 o = vec2(cos(a), sin(a));
      g += max(texture2D(uMainSampler, uv + o * px * 5.0).rgb - 0.35, 0.0);
      g += max(texture2D(uMainSampler, uv + o.yx * px * 12.0).rgb - 0.35, 0.0) * 0.6;
    }
    // premultiplied output: glow added to rgb (alpha unchanged) composites additively
    col += g * (uBloom / 8.0);
  }
  col = mix(col, vec3(1.0), uFlash);
  alpha = mix(alpha, 1.0, uFlash);
  gl_FragColor = vec4(col, alpha);
}
`;

export class GlyPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, name: "GlyPostFX", fragShader: POST_FRAG });
    this.params = {
      aberration: 0,
      glitch: 0,
      flash: 0,
      bloom: 1,
      pxScale: 1,
      // kept for API compatibility; vignette/heartbeat now live in the Backdrop scene
      vignette: 0,
      pulse: 0,
    };
  }

  onPreRender() {
    const p = this.params;
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set1f("uAberration", p.aberration);
    this.set1f("uGlitch", p.glitch);
    this.set1f("uFlash", p.flash);
    this.set1f("uBloom", p.bloom);
    this.set1f("uPxScale", p.pxScale);
  }

  onDraw(target) {
    this.set2f("uResolution", target.width, target.height);
    this.bindAndDraw(target);
  }
}
