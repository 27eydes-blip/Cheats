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
  col += nebCol * neb * 0.48;
  col += uNeb1 * pow(neb, 3.0) * 0.4;
  col *= 0.72 + 0.5 * n;
  // horizon glow band
  col += uNeb0 * 0.18 * exp(-pow((uv.y - 0.3) * 4.0, 2.0));
  // abyss heartbeat
  col += vec3(0.55, 0.0, 0.04) * uPulse * (0.25 + 0.75 * neb);
  // glitch realm flicker bands
  if (uGlitch > 0.0) {
    float band = hash(vec2(floor(uTime * 9.0), floor(uv.y * 24.0)));
    float g = step(1.0 - 0.06 * uGlitch, band);
    col = mix(col, col.gbr * 1.6, g);
    col += vec3(0.0, 0.08, 0.04) * uGlitch * step(0.5, fract(uv.y * 90.0));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const POST_FRAG = `
#define SHADER_NAME GLY_POST_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAberration;
uniform float uGlitch;
uniform float uFlash;
uniform float uVignette;
uniform float uBloom;
uniform float uPulse;
uniform vec3 uPulseColor;
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
  vec3 col;
  if (ab > 0.0005) {
    col.r = texture2D(uMainSampler, uv + dir * ab).r;
    col.g = texture2D(uMainSampler, uv).g;
    col.b = texture2D(uMainSampler, uv - dir * ab).b;
  } else {
    col = texture2D(uMainSampler, uv).rgb;
  }
  if (uBloom > 0.0) {
    vec2 px = 1.0 / uResolution;
    vec3 b = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472 + 0.3;
      vec2 o = vec2(cos(a), sin(a));
      b += max(texture2D(uMainSampler, uv + o * px * 6.0).rgb - 0.6, 0.0);
      b += max(texture2D(uMainSampler, uv + o.yx * px * 15.0).rgb - 0.6, 0.0) * 0.7;
    }
    col += b * (uBloom / 9.0);
  }
  float d = length(dir * vec2(1.0, 0.85));
  float vig = smoothstep(0.35, 0.95, d);
  col *= 1.0 - vig * (uVignette + uPulse * 0.35);
  col += uPulseColor * vig * uPulse * 0.6;
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class GlyPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, name: "GlyPostFX", fragShader: POST_FRAG });
    this.params = {
      aberration: 0,
      glitch: 0,
      flash: 0,
      vignette: 0.45,
      bloom: 1,
      pulse: 0,
      pulseColor: [0.7, 0.0, 0.05],
    };
  }

  onPreRender() {
    const p = this.params;
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set1f("uAberration", p.aberration);
    this.set1f("uGlitch", p.glitch);
    this.set1f("uFlash", p.flash);
    this.set1f("uVignette", p.vignette);
    this.set1f("uBloom", p.bloom);
    this.set1f("uPulse", p.pulse);
    this.set3f("uPulseColor", p.pulseColor[0], p.pulseColor[1], p.pulseColor[2]);
  }

  onDraw(target) {
    this.set2f("uResolution", target.width, target.height);
    this.bindAndDraw(target);
  }
}
