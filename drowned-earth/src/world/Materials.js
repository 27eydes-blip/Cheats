import * as THREE from 'three';
import { getTexture, signTexture } from './Textures.js';
import { patchMaterial } from './WorldShader.js';

// Shared material library. Geometry is merged per material key per chunk, so
// the draw-call count stays proportional to (chunks x materials), not objects.
const lib = new Map();

function std(params, patch = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
  return patchMaterial(m, patch);
}

export function initMaterials() {
  const T = getTexture;
  const rep = (name, x, y = x) => { const t = T(name).clone(); t.needsUpdate = true; t.repeat.set(x, y); return t; };
  lib.set('facade', std({ map: rep('concrete', 0.12), normalMap: rep('concreteN', 0.25), roughness: 0.9, metalness: 0.0 }, { facade: true }));
  lib.set('concrete', std({ map: rep('concrete', 0.25), normalMap: rep('concreteN', 0.25), roughness: 0.92 }));
  lib.set('asphalt', std({ map: rep('asphalt', 0.08), roughness: 0.95 }));
  lib.set('mud', std({ map: rep('mud', 0.06), roughness: 1 }));
  lib.set('tile', std({ map: rep('tile', 0.4), roughness: 0.5 }));
  lib.set('rust', std({ map: rep('rust', 0.3), roughness: 0.8, metalness: 0.35 }));
  lib.set('metal', std({ map: rep('rust', 0.15), roughness: 0.55, metalness: 0.6 }));
  lib.set('container', std({ map: rep('corrugated', 0.25), normalMap: rep('corrugatedN', 0.25), roughness: 0.7, metalness: 0.3 }));
  lib.set('wood', std({ map: rep('wood', 0.4), roughness: 0.85 }));
  lib.set('fabric', std({ map: rep('fabric', 0.8), roughness: 1, side: THREE.DoubleSide }));
  lib.set('foliage', std({ map: rep('foliage', 0.5), roughness: 0.9, side: THREE.DoubleSide }));
  lib.set('plastic', std({ roughness: 0.45, metalness: 0 }));
  lib.set('rope', std({ map: rep('fabric', 2), roughness: 1 }));
  lib.set('glass', patchMaterial(new THREE.MeshStandardMaterial({ color: 0x7d8f95, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.35 })));
  lib.set('emissiveWarm', new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: true }));
  lib.set('emissiveCold', new THREE.MeshBasicMaterial({ color: 0xbfe6ff }));
  lib.set('black', new THREE.MeshBasicMaterial({ color: 0x020303 }));
  // floating debris variants: displaced by waves on the GPU
  lib.set('woodFloat', std({ map: rep('wood', 0.5), roughness: 0.9 }, { bob: true }));
  lib.set('plasticFloat', std({ roughness: 0.5 }, { bob: true }));
  lib.set('fabricFloat', std({ map: rep('fabric', 0.8), roughness: 1 }, { bob: true }));
  lib.set('glow', new THREE.MeshBasicMaterial({ color: 0x66ffd8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
}

export function mat(key) {
  const m = lib.get(key);
  if (!m) throw new Error('unknown material ' + key);
  return m;
}

export function setWetness(rain) {
  // handled through G.uWet; kept for API symmetry
  return rain;
}

const signMats = new Map();
export function signMaterial(def) {
  const key = JSON.stringify(def);
  if (!signMats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ map: signTexture(def), roughness: 0.85, transparent: !def.bg, alphaTest: def.bg ? 0 : 0.3, side: THREE.DoubleSide });
    patchMaterial(m);
    signMats.set(key, m);
  }
  return signMats.get(key);
}
