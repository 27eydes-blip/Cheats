// Quality presets. Every system reads its budget from here so a single toggle
// scales the whole game from a mid-range phone up to a desktop GPU.
const PRESETS = {
  low: {
    pixelRatio: 1, postPipeline: false, shadows: false, shadowMapSize: 0,
    chunkNearRadius: 200, chunkFarRadius: 900, waterRings: 48, waterSegments: 64,
    debrisDensity: 0.45, particleCount: 250, rainCount: 1500, envMapUpdates: false,
    maxLights: 3, npcDetail: 0, birdCount: 10, renderScale: 1, reflections: 0,
  },
  medium: {
    pixelRatio: 1.5, postPipeline: true, shadows: true, shadowMapSize: 2048, shadowRange: 110,
    chunkNearRadius: 260, chunkFarRadius: 1200, waterRings: 72, waterSegments: 96,
    debrisDensity: 0.75, particleCount: 600, rainCount: 3500, envMapUpdates: true,
    maxLights: 6, npcDetail: 1, birdCount: 18, renderScale: 1, reflections: 0.35,
  },
  high: {
    pixelRatio: 2, postPipeline: true, shadows: true, shadowMapSize: 4096, shadowRange: 180,
    chunkNearRadius: 320, chunkFarRadius: 1500, waterRings: 96, waterSegments: 128,
    debrisDensity: 1, particleCount: 1200, rainCount: 6000, envMapUpdates: true,
    maxLights: 10, npcDetail: 2, birdCount: 28, renderScale: 1, reflections: 0.5,
  },
};

const KEY = 'drowned-earth.settings';

export class Settings {
  constructor() {
    const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }
    const params = new URLSearchParams(location.search);
    this.quality = params.get('quality') || stored.quality || (isMobile ? 'low' : 'medium');
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
  }
  get q() { return PRESETS[this.quality]; }
  static presets() { return Object.keys(PRESETS); }
  set(key, value) { this[key] = value; this.save(); }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        quality: this.quality, volume: this.volume, invertY: this.invertY,
        lookSensitivity: this.lookSensitivity, subtitles: this.subtitles, difficulty: this.difficulty, captions: this.captions, textSize: this.textSize,
        reduceMotion: this.reduceMotion, colorSafe: this.colorSafe, highContrast: this.highContrast, oneHand: this.oneHand, lensFx: this.lensFx, music: this.music,
      }));
    } catch { /* storage may be unavailable */ }
  }
}
