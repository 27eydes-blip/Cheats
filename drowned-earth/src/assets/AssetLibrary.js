import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { patchMaterial } from '../world/WorldShader.js';

// Loads the compressed CC0 asset set built by scripts/assets/build.mjs
// (public/assets/index.json). Everything is optional: if a file is missing or
// the device can't transcode it, the game keeps its procedural fallbacks.
//
// Textures stream in tiers: every preset gets the 1k set before play starts;
// Ultra then swaps in the 2k set in the background.
const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/';

export class AssetLibrary {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.index = null;
    this.ktx2 = new KTX2Loader().setTranscoderPath((import.meta.env?.BASE_URL || '/') + 'basis/').detectSupport(renderer);
    this.gltf = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
    this.rgbe = new RGBELoader().setDataType(THREE.HalfFloatType);
    this.surfaces = {};   // key → { map, normalMap, armMap, metres, mean, tier }
    this.hdris = {};      // key → { texture, sunU, sunV, mean }
    this.models = {};     // key → { scene, info }
    this.characters = {}; // key → gltf
    this.textureBytes = 0; // GPU estimate, for the debug overlay
    this.downloaded = 0;
    this.failed = [];
    this.anisotropy = Math.min(settings.q.anisotropy ?? 4, renderer.capabilities.getMaxAnisotropy());
  }

  // Byte-weighted progress over everything we're about to fetch.
  async load(onProgress = () => {}) {
    try {
      const r = await fetch(BASE + 'index.json');
      if (!r.ok) throw new Error('no asset index');
      this.index = await r.json();
    } catch (e) {
      console.warn('[assets] running with procedural fallbacks only:', e.message);
      onProgress(1, 'procedural fallback');
      return false;
    }
    const ix = this.index;
    const jobs = [];
    const tier = '1k';
    for (const [k, t] of Object.entries(ix.textures)) jobs.push({ bytes: t.bytes[tier], label: 'materials', run: () => this.loadSurface(k, tier) });
    for (const [k, h] of Object.entries(ix.hdris)) jobs.push({ bytes: h.bytes, label: 'skies', run: () => this.loadHdri(k) });
    for (const [k, m] of Object.entries(ix.models)) jobs.push({ bytes: m.bytes, label: 'objects', run: () => this.loadModel(k) });
    if (this.settings.q.characters !== false) for (const [k, c] of Object.entries(ix.characters)) jobs.push({ bytes: c.bytes, label: 'people', run: () => this.loadCharacter(k) });
    const total = jobs.reduce((a, j) => a + j.bytes, 0) || 1;
    let done = 0;
    onProgress(0, 'materials');
    // a few in flight at once: enough to hide latency, few enough that the
    // transcoder workers and the main thread stay responsive on phones
    const queue = [...jobs];
    const worker = async () => {
      while (queue.length) {
        const j = queue.shift();
        try { await j.run(); } catch (e) { this.failed.push(String(e.message || e)); console.warn('[assets]', e); }
        done += j.bytes; this.downloaded += j.bytes;
        onProgress(done / total, j.label);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (this.settings.q.textureTier === '2k') this.streamTier('2k');
    return true;
  }

  // Ultra: replace 1k surfaces with 2k in the background, one at a time.
  async streamTier(tier) {
    for (const k of Object.keys(this.index.textures)) {
      try { await this.loadSurface(k, tier); } catch (e) { console.warn('[assets] stream', k, e); }
    }
    this.onSurfacesChanged?.();
  }

  ktx(url, srgb) {
    return new Promise((res, rej) => this.ktx2.load(BASE + url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = this.anisotropy;
      t.needsUpdate = true;
      this.textureBytes += estimateBytes(t);
      res(t);
    }, undefined, rej));
  }

  async loadSurface(key, tier) {
    const t = this.index.textures[key];
    const [map, normalMap, armMap] = await Promise.all([
      this.ktx(`tex/${key}.albedo.${tier}.ktx2`, true),
      this.ktx(`tex/${key}.normal.${tier}.ktx2`, false),
      this.ktx(`tex/${key}.arm.${tier}.ktx2`, false),
    ]);
    for (const tx of [map, normalMap, armMap]) tx.repeat.set(1 / t.metres, 1 / t.metres);
    const old = this.surfaces[key];
    this.surfaces[key] = { map, normalMap, armMap, metres: t.metres, mean: t.mean, tier };
    if (old) {
      for (const tx of [old.map, old.normalMap, old.armMap]) { this.textureBytes -= estimateBytes(tx); tx.dispose(); }
      this.onSurface?.(key, this.surfaces[key]);
    }
  }

  async loadHdri(key) {
    const h = this.index.hdris[key];
    const tex = await this.rgbe.loadAsync(BASE + h.file);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    this.textureBytes += tex.image.width * tex.image.height * 8;
    this.hdris[key] = { texture: tex, sunU: h.sunU, sunV: h.sunV, mean: h.mean };
  }

  async loadModel(key) {
    const info = this.index.models[key];
    const g = await this.gltf.loadAsync(BASE + info.file);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      // static props: drop shape keys (they'd break instancing)
      if (Object.keys(o.geometry.morphAttributes).length) { o.geometry.morphAttributes = {}; o.morphTargetInfluences = undefined; o.morphTargetDictionary = undefined; }
      o.castShadow = true; o.receiveShadow = true;
      o.material = prepMaterial(o.material, this);
    });
    this.models[key] = { scene: g.scene, info };
  }

  async loadCharacter(key) {
    const info = this.index.characters[key];
    const g = await this.gltf.loadAsync(BASE + info.file);
    g.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; countMaterial(o.material, this); }
    });
    this.characters[key] = g;
  }

  has(key) { return !!this.models[key]; }
  // Flattened (geometry, material, local matrix) list for instancing.
  parts(key) {
    const m = this.models[key];
    if (!m) return null;
    if (!m.parts) {
      m.parts = [];
      m.scene.updateMatrixWorld(true);
      m.scene.traverse((o) => { if (o.isMesh) m.parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone(), lod: /__lod1/.test(o.name) || /__lod1/.test(o.parent?.name || '') ? 1 : 0 }); });
      // models without an LOD1 use LOD0 at every distance
      if (!m.parts.some((p) => p.lod === 1)) for (const p of [...m.parts]) m.parts.push({ ...p, lod: 1 });
    }
    return m.parts;
  }
  bounds(key) {
    const m = this.models[key];
    if (!m) return null;
    if (!m.bounds) {
      m.scene.updateMatrixWorld(true);
      const b = new THREE.Box3();
      m.scene.traverse((o) => { if (o.isMesh && !/__lod1/.test(o.name)) b.expandByObject(o, true); });
      m.bounds = { min: b.min.toArray(), max: b.max.toArray() };
    }
    return m.bounds;
  }
}

const seen = new WeakSet();
function countMaterial(m, lib) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
    const t = m[k];
    if (t && !seen.has(t)) { seen.add(t); lib.textureBytes += estimateBytes(t); t.anisotropy = lib.anisotropy; }
  }
}
// glTF props share the world's lighting model: patched for wetness, caustics,
// waterline staining and underwater absorption like every other surface.
function prepMaterial(m, lib) {
  countMaterial(m, lib);
  if (m.isMeshStandardMaterial) {
    m.envMapIntensity = 1;
    if (m.transparent && m.alphaTest === 0 && m.map) { m.transparent = false; m.alphaTest = 0.45; }
    if (m.alphaTest > 0) m.side = THREE.DoubleSide;
    patchMaterial(m, { prop: true });
  }
  return m;
}

// Rough GPU footprint of a texture including its mip chain.
export function estimateBytes(t) {
  const img = t.image || (t.mipmaps && t.mipmaps[0]);
  if (!img) return 0;
  const w = img.width || 0, h = img.height || 0;
  let bpp = 4;
  if (t.isCompressedTexture) bpp = t.format === THREE.RGBA_ASTC_4x4_Format || t.format === THREE.RGBA_BPTC_Format || t.format === THREE.RGBA_ETC2_EAC_Format || t.format === THREE.RGBA_S3TC_DXT5_Format ? 1 : 0.5;
  return Math.round(w * h * bpp * 1.333);
}
