// Quality presets. Every system reads its budget from here so a single toggle
// scales the whole game from a mid-range phone up to a desktop GPU.
const PRESETS = {
  low: {
    pixelRatio: 1, postPipeline: false, shadows: false, shadowMapSize: 0,
    chunkNearRadius: 200, chunkFarRadius: 900, waterRings: 80, waterSegments: 96,
    debrisDensity: 0.45, particleCount: 250, rainCount: 1500, envMapUpdates: false,
    maxLights: 3, npcDetail: 0, birdCount: 10, renderScale: 1, reflections: 0,
    label: 'Phone', targetFps: 30, minScale: 0.6, mipBias: 0, textureTier: '1k', anisotropy: 2,
    ssao: false, taa: false, ssr: false, motionBlur: false, volumetric: false, csm: false, pointLights: 2, propDensity: 0.5, characters: true,
  },
  medium: {
    pixelRatio: 1.5, postPipeline: true, shadows: true, shadowMapSize: 2048, shadowRange: 110,
    chunkNearRadius: 260, chunkFarRadius: 1200, waterRings: 72, waterSegments: 96,
    debrisDensity: 0.75, particleCount: 600, rainCount: 3500, envMapUpdates: true,
    maxLights: 6, npcDetail: 1, birdCount: 18, renderScale: 1, reflections: 0.35,
    label: 'Standard', targetFps: 60, minScale: 0.65, mipBias: -0.25, textureTier: '1k', anisotropy: 8,
    ssao: true, taa: false, ssr: false, motionBlur: false, volumetric: false, csm: false, pointLights: 6, propDensity: 0.8, characters: true,
  },
  high: {
    pixelRatio: 2, postPipeline: true, shadows: true, shadowMapSize: 4096, shadowRange: 180,
    chunkNearRadius: 320, chunkFarRadius: 1500, waterRings: 96, waterSegments: 128,
    debrisDensity: 1, particleCount: 1200, rainCount: 6000, envMapUpdates: true,
    maxLights: 10, npcDetail: 2, birdCount: 28, renderScale: 1, reflections: 0.5,
    label: 'Ultra', targetFps: 60, minScale: 0.85, mipBias: -0.4, textureTier: '2k', anisotropy: 16,
    ssao: true, taa: true, ssr: true, motionBlur: true, volumetric: true, csm: true, pointLights: 12, propDensity: 1, characters: true,
  },
};

const KEY = 'drowned-earth.settings';
const ALIAS = { phone: 'low', standard: 'medium', ultra: 'high' };

// Pick a preset from what the GPU says it is. Coarse on purpose: dynamic
// resolution does the fine tuning at runtime.
export function detectPreset(isMobile) {
  if (isMobile) return { preset: 'low', gpu: 'mobile' };
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { gpu = 'unknown'; }
  const g = gpu.toLowerCase();
  if (!g || g === 'none') return { preset: 'low', gpu };
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return { preset: 'low', gpu };
  // integrated / low-power GPUs: the light preset (laptops with Intel or APU graphics, MX parts)
  if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|radeon graphics|vega \d|\bmx\s?\d{3}|gt \d{3}\b/.test(g)) return { preset: 'low', gpu };
  // discrete GPUs start on Standard; Ultra is opt-in from Options
  if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m[1-9]|apple gpu|arc\(/.test(g)) return { preset: 'medium', gpu };
  return { preset: 'low', gpu };
}

export class Settings {
  constructor() {
    const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }
    const params = new URLSearchParams(location.search);
    const det = detectPreset(isMobile);
    this.gpu = det.gpu;
    // every new player starts on the Light preset; a preset picked in Options (or set by safe mode) is remembered
    this.qualityChosen = !!stored.qualityChosen;
    let q = params.get('quality') || (this.qualityChosen ? stored.quality : null) || 'low';
    q = ALIAS[q] || q;
    this.auto = q === 'auto';
    this.autoCap = stored.autoCap ?? null; // set when auto quality had to step down on this machine
    const order = ['low', 'medium', 'high'];
    const autoPick = this.autoCap && order.indexOf(this.autoCap) < order.indexOf(det.preset) ? this.autoCap : det.preset;
    this.quality = this.auto ? autoPick : q;
    if (!PRESETS[this.quality]) this.quality = 'medium';
    this.volume = stored.volume ?? 0.8;
    this.invertY = stored.invertY ?? false;
    this.lookSensitivity = stored.lookSensitivity ?? 1;
    this.subtitles = stored.subtitles ?? true;
    this.difficulty = stored.difficulty ?? 'standard';
    this.captions = stored.captions ?? false;
    this.textSize = stored.textSize ?? 1;
    this.reduceMotion = stored.reduceMotion ?? false;
    this.colorSafe = stored.colorSafe ?? false;
    this.highContrast = stored.highContrast ?? false;
    this.oneHand = stored.oneHand ?? false;
    this.lensFx = stored.lensFx ?? true;
    this.music = stored.music ?? 1;
    this.sharpness = params.has('sharp') ? +params.get('sharp') : stored.sharpness ?? 0.5;     // CAS-style sharpen, 0 = off
    this.motionBlur = stored.motionBlur ?? false; // camera motion blur (Standard/Ultra)
    // mature content: decided at the first-launch age gate; null = not asked yet
    this.ageConfirmed = stored.ageConfirmed ?? null;
    this.mature = stored.mature ?? false;
    // living-NPC simulation: full (visible incidents, conversations) or light (abstract incidents) — Phone defaults to light
    this.pad = stored.pad ?? null; // controller: deadzone, curve, sensitivity, aim assist, extras, button map
    this.npcSim = stored.npcSim ?? (this.quality === 'low' ? 'light' : 'full');
  }
  get q() { return PRESETS[this.quality]; }
  get label() { return PRESETS[this.quality].label + (this.auto ? ' (auto)' : ''); }
  static presets() { return Object.keys(PRESETS); }
  set(key, value) { if (key === 'quality') { this.auto = value === 'auto'; this.qualityChosen = true; } this[key] = value; this.save(); }
  static label(q) { return PRESETS[q]?.label || q; }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        quality: this.auto ? 'auto' : this.quality, volume: this.volume, invertY: this.invertY,
        lookSensitivity: this.lookSensitivity, subtitles: this.subtitles, difficulty: this.difficulty, captions: this.captions, textSize: this.textSize,
        reduceMotion: this.reduceMotion, colorSafe: this.colorSafe, highContrast: this.highContrast, oneHand: this.oneHand, lensFx: this.lensFx, music: this.music, sharpness: this.sharpness, motionBlur: this.motionBlur, ageConfirmed: this.ageConfirmed, mature: this.mature, npcSim: this.npcSim,
      pad: this.pad, autoCap: this.autoCap, qualityChosen: this.qualityChosen,
      }));
    } catch { /* storage may be unavailable */ }
  }
}
