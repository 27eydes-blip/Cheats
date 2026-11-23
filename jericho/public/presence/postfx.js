// The look of the final image: HDR rendering, antialiasing, bloom, light shafts, lens
// flare, chromatic aberration and film grain, in four quality levels.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

export const TIER_ORDER = ["low", "medium", "high", "ultra"];

/** What each quality level turns on. */
export const TIERS = {
  low: { maxRatio: 1.25, samples: 0, bloom: "none", rays: 0, flare: 0, ca: 0, grain: 0.03, particles: 0.35, dof: 0.6, octaves: 2 },
  medium: { maxRatio: 1.5, samples: 4, bloom: "single", rays: 0, flare: 0.6, ca: 0.6, grain: 0.025, particles: 0.65, dof: 1, octaves: 3 },
  high: { maxRatio: 2, samples: 4, bloom: "dual", rays: 18, flare: 1, ca: 1, grain: 0.022, particles: 1, dof: 1, octaves: 4 },
  ultra: { maxRatio: 2, samples: 8, bloom: "dual", rays: 36, flare: 1, ca: 1, grain: 0.02, particles: 1.4, dof: 1, octaves: 5 },
};

const MAX_PIXELS = 3840 * 2160; // never draw more than native 4K

/** Full device pixel ratio up to the level's limit, and never beyond 4K. */
export function pixelRatioFor(tier, width, height) {
  const dpr = window.devicePixelRatio || 1;
  const budget = Math.sqrt(MAX_PIXELS / Math.max(1, width * height));
  return Math.max(0.5, Math.min(dpr, TIERS[tier].maxRatio, budget));
}

// Light shafts: blur bright light outward from the core, in HDR before tone mapping.
const RaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLight: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uSamples: { value: 18 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uLight, uRes; uniform float uStrength, uAspect; uniform int uSamples;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 toLight = vUv - uLight;
      float reach = 1.0 - smoothstep(0.05, 0.55, length(toLight * vec2(uAspect, 1.0))); // shafts stay near the core
      if (uStrength <= 0.001 || reach <= 0.0) { gl_FragColor = base; return; }
      // march toward the core, starting at a random offset per pixel so there are no bands
      vec2 delta = toLight * (0.9 / float(uSamples));
      vec2 uv = vUv - delta * hash(vUv * uRes);
      float decay = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < 48; i++) {
        if (i >= uSamples) break;
        uv -= delta;
        vec3 s = texture2D(tDiffuse, uv).rgb;
        float l = max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 1.4, 0.0);   // only the brightest light (the core) casts shafts
        acc += s * min(l, 4.0) * decay;
        decay *= 0.94;
      }
      gl_FragColor = vec4(base.rgb + acc * (uStrength * reach / float(uSamples)), base.a);
    }`,
};

// Lens: chromatic aberration on bright areas, a faint flare from the core, grain, vignette.
// Runs last, on the tone-mapped image.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLight: { value: new THREE.Vector2(0.5, 0.5) },
    uFlare: { value: 0 },
    uCA: { value: 0 },
    uGrain: { value: 0.02 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uLight, uRes; uniform float uFlare, uCA, uGrain, uTime, uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float disc(vec2 uv, vec2 c, float r){ vec2 d = uv - c; d.x *= uAspect; return smoothstep(r, r * 0.35, length(d)); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // chromatic aberration, only where it's bright, stronger toward the edges
      vec2 off = (vUv - 0.5) * 0.006 * uCA;
      vec3 split = vec3(texture2D(tDiffuse, vUv + off).r, col.g, texture2D(tDiffuse, vUv - off).b);
      float bright = smoothstep(0.45, 0.9, max(lum, dot(split, vec3(0.333))));
      col = mix(col, split, bright);
      // a faint lens flare: an anamorphic streak through the core and a few ghosts across the centre
      if (uFlare > 0.001) {
        vec2 d = vUv - uLight;
        float streak = exp(-abs(d.y) * 900.0) * exp(-abs(d.x * uAspect) * 2.8);
        vec2 axis = vec2(0.5) - uLight;
        float ghosts = disc(vUv, uLight + axis * 1.35, 0.035) * 0.5 + disc(vUv, uLight + axis * 1.75, 0.06) * 0.3 + disc(vUv, uLight + axis * 2.4, 0.02) * 0.6;
        col += (vec3(1.0, 0.72, 0.38) * streak * 0.35 + vec3(0.55, 0.75, 0.7) * ghosts * 0.05) * uFlare;
      }
      // subtle vignette and film grain (the grain also stops banding in the dark gradients)
      vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
      col *= 1.0 - dot(v, v) * 0.18;
      float n = hash(vUv * uRes + fract(uTime * 7.3) * 100.0) - 0.5;
      col += n * uGrain * (1.0 - smoothstep(0.0, 0.8, lum) * 0.7);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Builds the post-processing chain for one quality level.
 * Render (HDR, MSAA) -> bloom (tight + wide) -> light shafts -> tone map -> FXAA? -> lens + grain.
 */
export function createPipeline(renderer, scene, camera, tier, width, height) {
  const cfg = TIERS[tier];
  const ratio = renderer.getPixelRatio();
  const gl2 = renderer.capabilities.isWebGL2;
  const maxSamples = gl2 ? renderer.capabilities.maxSamples || 4 : 0;
  const samples = Math.min(cfg.samples, maxSamples);
  const target = new THREE.WebGLRenderTarget(width * ratio, height * ratio, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(ratio);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));

  // Bloom with a tight bright core and a wide soft falloff.
  let tight = null;
  if (cfg.bloom !== "none") {
    tight = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.08, 0.55);
    composer.addPass(tight);
  }
  let wide = null;
  if (cfg.bloom === "dual") {
    wide = new UnrealBloomPass(new THREE.Vector2(width, height), 0.4, 1.0, 0.12);
    composer.addPass(wide);
  }

  let rays = null;
  if (cfg.rays > 0) {
    rays = new ShaderPass(RaysShader);
    rays.uniforms.uSamples.value = cfg.rays;
    composer.addPass(rays);
  }

  composer.addPass(new OutputPass()); // ACES filmic tone mapping + sRGB

  let fxaa = null;
  if (samples === 0) {
    fxaa = new ShaderPass(FXAAShader); // no MSAA available at this level: smooth edges here instead
    composer.addPass(fxaa);
  }
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  function setSize(w, h) {
    const r = renderer.getPixelRatio();
    composer.setPixelRatio(r);
    composer.setSize(w, h);
    if (fxaa) fxaa.uniforms.resolution.value.set(1 / (w * r), 1 / (h * r));
    finish.uniforms.uRes.value.set(w * r, h * r);
    if (rays) {
      rays.uniforms.uRes.value.set(w * r, h * r);
      rays.uniforms.uAspect.value = w / h;
    }
    finish.uniforms.uAspect.value = w / h;
  }
  setSize(width, height);

  return {
    tier,
    samples,
    bloom: cfg.bloom !== "none",
    setSize,
    /** p: { bloom, light (Vector2 in 0..1), lightVisible, flare, rays, time } */
    render(p) {
      if (tight) tight.strength = wide ? p.bloom * 0.55 : p.bloom * 0.8;
      if (wide) wide.strength = p.bloom * 0.45;
      if (rays) {
        rays.uniforms.uLight.value.copy(p.light);
        rays.uniforms.uStrength.value = p.rays * p.lightVisible;
      }
      finish.uniforms.uLight.value.copy(p.light);
      finish.uniforms.uFlare.value = cfg.flare * p.flare * p.lightVisible;
      finish.uniforms.uCA.value = cfg.ca;
      finish.uniforms.uGrain.value = cfg.grain;
      finish.uniforms.uTime.value = p.time;
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
      tight?.dispose();
      wide?.dispose();
    },
  };
}
