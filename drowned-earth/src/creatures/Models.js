import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeSkinned, smoothGeometry, boneMask, mutantMaterial, furShellMaterial, spike, barnacles, weed, glowEye, attachAtVertex, pickVertices } from './Mutate.js';

// Sculpted bases for the bestiary (all CC0 / CC-BY, see CREDITS.md):
//   wolf, fox  — Quaternius "Ultimate Animated Animals" (CC0), rigged, 12 clips
//   vulture    — "Turkey vulture", Poly by Google (CC-BY 3.0), rig + clips by the JGengine authors (Apache-2.0)
//   fish1      — Quaternius "Animated Fish" (CC0)
// They're loaded once, then mutated per species (Mutate.js).
const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/creatures/';
const FILES = { wolf: 'wolf.glb', fox: 'fox.glb', vulture: 'vulture.glb', fish1: 'fish1.glb', fish2: 'fish2.glb' };

export async function loadCreatureModels(ctx) {
  const lib = {};
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    try { lib[k] = await ctx.assets.gltf.loadAsync(BASE + f); } catch (e) { console.warn('[creatures] model missing', f, e.message); }
  }));
  return lib;
}

const geoCache = new Map();
const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _upv = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- quadrupeds (siltwolf, gullrat)
// spec: { model, levels, shells, look, scale, mutate(skinned, geo), boneScale:{name:[x,y,z]}, bare:[bone names] }
export function quadruped(lib, spec) {
  const src = lib[spec.model];
  if (!src) return null;
  const root = cloneSkinned(src.scene);
  const parts = [];
  root.traverse((o) => { if (o.isSkinnedMesh) parts.push(o); });
  const eyeParts = parts.filter((p) => /eye/i.test(p.material.name));
  const bodyParts = parts.filter((p) => !eyeParts.includes(p));
  const sk = bodyParts[0].skeleton;
  const key = spec.model + ':' + spec.levels + ':' + (spec.bare || []).join();
  let geo = geoCache.get(key);
  if (!geo) {
    const partId = (m) => (/light/i.test(m.material.name) ? 2 : /nose|black/i.test(m.material.name) ? 1 : /grey/i.test(m.material.name) ? 3 : 0);
    geo = smoothGeometry(mergeSkinned(bodyParts, partId), spec.levels);
    if (spec.bare) boneMask(geo, spec.bare.map((n) => sk.bones.findIndex((b) => b.name === n)).filter((i) => i >= 0), 'aMask');
    geoCache.set(key, geo);
  }
  const look = { bump: 0.035 * spec.scale / 0.37, ...spec.look, bareMask: !!spec.bare };
  const mat = mutantMaterial(look);
  const body = new THREE.SkinnedMesh(geo, mat);
  body.bind(sk, bodyParts[0].bindMatrix);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  const holder = bodyParts[0].parent;
  holder.add(body);
  for (const p of bodyParts) p.parent.remove(p);
  const shells = [];
  for (let i = 0; i < (spec.shells || 0); i++) {
    const s = new THREE.SkinnedMesh(geo, furShellMaterial(look, i, spec.shells));
    s.bind(sk, bodyParts[0].bindMatrix); s.frustumCulled = false; s.receiveShadow = true;
    holder.add(s); shells.push(s);
  }
  // eyes: the model's eye meshes stay (dark) and a glowing bead sits on each
  const eyes = [];
  for (const e of eyeParts) {
    e.material = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05 });
    const P = e.geometry.attributes.position;
    if (!e.geometry.attributes.normal) e.geometry.computeVertexNormals();
    for (const side of [-1, 1]) {
      const c = new THREE.Vector3(); let n = 0;
      for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === side) { c.x += P.getX(i); c.y += P.getY(i); c.z += P.getZ(i); n++; }
      if (!n) continue;
      c.divideScalar(n);
      let best = 0, bd = Infinity;
      for (let i = 0; i < P.count; i++) { const d = (P.getX(i) - c.x) ** 2 + (P.getY(i) - c.y) ** 2 + (P.getZ(i) - c.z) ** 2; if (d < bd) { bd = d; best = i; } }
      const eye = glowEye(spec.eyeR || 0.05, spec.look.eye || 0xc8ff60);
      const bone = attachAtVertex(e, best, eye, {});
      const bi = e.skeleton.bones.indexOf(bone);
      eye.position.copy(c).applyMatrix4(e.bindMatrix).applyMatrix4(e.skeleton.boneInverses[bi]);
      eyes.push(eye);
    }
  }
  // bone proportions (a fox rig becomes a rat)
  for (const [n, s] of Object.entries(spec.boneScale || {})) { const b = sk.bones.find((x) => x.name === n); if (b) b.userData.fixScale = new THREE.Vector3(...s); }
  // growths
  spec.mutate?.(body, geo);
  root.scale.setScalar(spec.scale);
  root.traverse((o) => { if (o.isMesh && o !== body && !shells.includes(o)) { o.castShadow = o.castShadow || false; } });
  // animation
  const mixer = new THREE.AnimationMixer(root);
  const clips = Object.fromEntries(src.animations.map((c) => [c.name.replace(/^.*\|/, ''), c]));
  const anim = new Animator(mixer, clips, sk);
  return { root, body, shells, eyes, mat, skeleton: sk, anim, setGlow: (g) => { mat.userData.u.uGlow.value = g; for (const e of eyes) { e.userData.halo.material.opacity = 0.2 + g * 0.35; e.userData.halo.scale.setScalar((spec.eyeR || 0.05) * (3 + g * 2.5)); } } };
}

// state-driven clip blending: idle / walk / run / attack / alert / warning
export class Animator {
  constructor(mixer, clips, skeleton) {
    this.mixer = mixer; this.clips = clips; this.actions = {}; this.cur = null; this.curName = '';
    this.fix = skeleton ? skeleton.bones.filter((b) => b.userData.fixScale) : [];
  }
  act(n) { if (!this.clips[n]) return null; return (this.actions[n] ||= this.mixer.clipAction(this.clips[n])); }
  play(n, fade = 0.3, { once = false, speed = 1 } = {}) {
    if (this.curName === n) { if (this.cur) this.cur.timeScale = speed; return; }
    const a = this.act(n); if (!a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.timeScale = speed; a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a; this.curName = n;
  }
  update(dt) { this.mixer.update(dt); for (const b of this.fix) b.scale.copy(b.userData.fixScale); }
  // turn a bone (and its children) about world-up by an angle, after the clip
  turnBone(bone, ang) {
    if (!bone || !ang) return;
    bone.parent.updateWorldMatrix(true, false);
    const pq = bone.parent.getWorldQuaternion(_pq);
    _rq.setFromAxisAngle(_upv, ang);
    bone.quaternion.premultiply(pq).premultiply(_rq).premultiply(pq.invert());
  }
}

// ---------------------------------------------------------------- looks
export const SILTWOLF = {
  model: 'wolf', scale: 0.37, eyeR: 0.055,
  look: { fur: 0x4f4b42, furLight: 0x77705f, dark: 0x16130f, skin: 0x6a5850, algae: 0x3d4a24, glow: 0x6effc8, eye: 0xd8ff70, wet: 0.65, mange: 0.35, algaeAmt: 0.6, veins: 0.5, noiseScale: 1, furLen: 0.12, furDensity: 42, lightPart: 2, darkPart: 1 },
  mutate(body, geo) {
    const P = geo.attributes.position;
    let zmin = Infinity, zmax = -Infinity, ymax = -Infinity;
    for (let i = 0; i < P.count; i++) { zmin = Math.min(zmin, P.getZ(i)); zmax = Math.max(zmax, P.getZ(i)); ymax = Math.max(ymax, P.getY(i)); }
    // a ridge of bone breaking through along the spine, biggest over the shoulders
    const ridge = pickVertices(geo, (p, n) => n.y > 0.7 && Math.abs(p.x) < 0.12 && p.z > -0.9 && p.z < 1.0 && p.y > ymax * 0.55, 7, 0.24, 3);
    ridge.forEach((vi, k) => {
      const z = P.getZ(vi), big = 1 - Math.abs(z - 0.45) / 1.6;
      attachAtVertex(body, vi, spike(0.22 + big * 0.42, 0.05 + big * 0.05, 0.45, k + 1), { along: -0.04, tilt: new THREE.Vector3(0, 0, -0.5) });
    });
    // two shoulder spurs, splayed
    for (const side of [-1, 1]) {
      const v = pickVertices(geo, (p, n) => n.x * side > 0.75 && p.z > 0.4 && p.z < 1.0 && p.y > ymax * 0.5, 1, 0, 5 + side);
      v.forEach((vi) => attachAtVertex(body, vi, spike(0.3, 0.05, 0.3, 9 + side), { along: -0.04, tilt: new THREE.Vector3(0, 0.6, -0.4) }));
    }
    // barnacle crust on the flanks and haunches, weed from the belly and jaw
    pickVertices(geo, (p, n) => Math.abs(n.x) > 0.6 && p.y < ymax * 0.62 && p.y > ymax * 0.3, 4, 0.5, 7).forEach((vi, k) => attachAtVertex(body, vi, barnacles(0.2, 9, k + 2), { along: -0.02 }));
    pickVertices(geo, (p, n) => n.y < -0.7 && p.y > ymax * 0.35, 3, 0.4, 11).forEach((vi, k) => { const w = weed(0.45, 7, k + 4); attachAtVertex(body, vi, w, {}); w.quaternion.identity(); });
  },
};
export const GULLRAT = {
  model: 'fox', scale: 0.062, eyeR: 0.07,
  bare: ['Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7', 'Tail8'],
  boneScale: { 'Tail1': [0.42, 1.25, 0.42], 'Ear1.L': [0.55, 0.55, 0.55], 'Ear1.R': [0.55, 0.55, 0.55], 'FrontUpperLeg.L': [1, 0.72, 1], 'FrontUpperLeg.R': [1, 0.72, 1], 'BackUpperLeg.L': [1, 0.72, 1], 'BackUpperLeg.R': [1, 0.72, 1], 'Head': [0.95, 0.95, 1.12] },
  look: { fur: 0x2e2822, furLight: 0x4a4138, dark: 0x15110e, skin: 0x5c4440, algae: 0x2e3620, glow: 0xffb050, eye: 0xff7040, wet: 0.7, mange: 0.35, algaeAmt: 0.3, veins: 0.2, noiseScale: 2, lightPart: 2, darkPart: 1 },
  mutate(body, geo) {
    const P = geo.attributes.position; let ymax = -Infinity; for (let i = 0; i < P.count; i++) ymax = Math.max(ymax, P.getY(i));
    pickVertices(geo, (p, n) => n.y > 0.6 && Math.abs(p.x) < 0.2 && p.z > -0.6 && p.z < 0.9 && p.y > ymax * 0.5, 5, 0.25, 2).forEach((vi, k) => attachAtVertex(body, vi, spike(0.32, 0.05, 0.6, k + 20), { along: -0.03, tilt: new THREE.Vector3(0, 0, -0.7) }));
  },
};

// gulls: the vulture rig, smoothed, recoloured as a gull — white, grey mantle,
// black wingtips — with a raw featherless head and a glowing eye
export function gullModel(lib) {
  const src = lib.vulture; if (!src) return null;
  const root = cloneSkinned(src.scene);
  let mesh; root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  let geo = geoCache.get('gull');
  if (!geo) { geo = smoothGeometry(mergeSkinned([mesh], () => 0), 1); geo.computeBoundingBox(); geoCache.set('gull', geo); }
  const bb = geo.boundingBox;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMin = { value: bb.min }; sh.uniforms.uMax = { value: bb.max };
    sh.vertexShader = 'varying vec3 vRest; varying vec3 vRestN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = position; vRestN = normal;');
    sh.fragmentShader = `uniform vec3 uMin, uMax; varying vec3 vRest; varying vec3 vRestN;
      float g_h(vec3 p){ return fract(sin(dot(p, vec3(12.9, 78.2, 37.7))) * 43758.5); }\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 r = (vRest - uMin) / (uMax - uMin);
      vec3 c = vec3(0.82, 0.83, 0.84);                                                     // white
      c = mix(c, vec3(0.42, 0.45, 0.48), smoothstep(0.2, 0.6, vRestN.y) * smoothstep(0.75, 0.55, r.y)); // grey mantle
      float tip = smoothstep(0.32, 0.45, abs(r.x - 0.5)) + smoothstep(0.25, 0.05, r.z) * smoothstep(0.4, 0.6, r.y);
      c = mix(c, vec3(0.06, 0.06, 0.07), clamp(tip, 0.0, 1.0));                            // black tips and tail
      float head = smoothstep(0.78, 0.88, r.y) * smoothstep(0.55, 0.7, r.z);
      c = mix(c, vec3(0.55, 0.36, 0.34), head);                                            // raw, featherless head
      c *= 0.85 + 0.3 * g_h(floor(vRest * 6.0));                                           // feather variation
      diffuseColor.rgb = c;`);
  };
  m.customProgramCacheKey = () => 'gull';
  const body = new THREE.SkinnedMesh(geo, m);
  body.bind(mesh.skeleton, mesh.bindMatrix);
  body.castShadow = true; body.frustumCulled = false;
  mesh.parent.add(body); mesh.parent.remove(mesh);
  root.scale.setScalar(0.032);
  const mixer = new THREE.AnimationMixer(root);
  const clips = Object.fromEntries(src.animations.map((c) => [c.name, c]));
  // glowing eyes on the head (the neck bone carries the head)
  const P = geo.attributes.position; let top = 0; for (let i = 0; i < P.count; i++) if (P.getY(i) + P.getZ(i) * 0.5 > P.getY(top) + P.getZ(top) * 0.5) top = i;
  for (const side of [-1, 1]) {
    const e = glowEye(0.09, 0xff6a3a);
    attachAtVertex(body, top, e, {});
    e.position.x += side * 0.12 * e.scale.x;
  }
  return { root, anim: new Animator(mixer, clips, null), mesh: body };
}

// needlefish: a merged, smoothed, stretched fish with a needle jaw, instanced
export function needlefishGeometry(lib) {
  const src = lib.fish1; if (!src) return null;
  if (geoCache.has('needle')) return geoCache.get('needle');
  const parts = []; src.scene.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) parts.push(o); });
  const id = (m) => (/top/i.test(m.material.name) ? 1 : /fin/i.test(m.material.name) ? 2 : 0);
  const merged = mergeSkinned(parts.map((p) => { if (!p.geometry.attributes.skinIndex) { const n = p.geometry.attributes.position.count; p.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4)); p.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4)); } return p; }), id);
  const g = smoothGeometry(merged, 1);
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  { const P0 = g.attributes.position, A0 = g.attributes.aPart; for (let i = 0; i < P0.count; i++) if (A0.getX(i) > 1.5) { P0.setX(i, P0.getX(i) * 0.35); P0.setY(i, P0.getY(i) * 0.55); } }
  g.scale(0.32, 0.36, 1.9);
  // the needle: a long tapered jaw out of the face
  const P = g.attributes.position; let zmax = -Infinity, yAt = 0; for (let i = 0; i < P.count; i++) if (P.getZ(i) > zmax) { zmax = P.getZ(i); yAt = P.getY(i); }
  const jaw = new THREE.ConeGeometry(0.12, 5.5, 8, 6); jaw.rotateX(Math.PI / 2); jaw.translate(0, yAt - 0.05, zmax + 2.55);
  const JP = jaw.attributes.position; for (let i = 0; i < JP.count; i++) JP.setY(i, JP.getY(i) - Math.pow(Math.max(0, JP.getZ(i) - zmax) / 5.5, 2) * 0.25);
  const jn = JP.count;
  const out = new THREE.BufferGeometry();
  const pos = new Float32Array((P.count + jn) * 3); pos.set(P.array); pos.set(JP.array, P.count * 3);
  const part = new Float32Array(P.count + jn); part.set(g.attributes.aPart.array); part.fill(3, P.count);
  const idx = [...g.index.array, ...jaw.index.array.map((v) => v + P.count)];
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('aPart', new THREE.BufferAttribute(part, 1)); out.setIndex(idx);
  out.computeVertexNormals(); out.computeBoundingBox();
  geoCache.set('needle', out);
  return out;
}
export function needlefishMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.45 });
  const u = { uT: { value: 0 }, uFrenzy: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aPart; uniform float uT, uFrenzy; varying float vPart; varying vec3 vRest;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPart = aPart; vRest = position;
        float ph = float(gl_InstanceID) * 1.7;
        float tail = smoothstep(2.0, -7.0, position.z);
        transformed.x += sin(position.z * 0.9 - uT * (7.0 + uFrenzy * 10.0) + ph) * tail * (0.5 + uFrenzy * 0.5);`);
    sh.fragmentShader = 'varying float vPart; varying vec3 vRest;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 back = vec3(0.08, 0.14, 0.16), belly = vec3(0.78, 0.8, 0.8);
      vec3 c = mix(belly, back, smoothstep(-0.2, 0.5, vRest.y));
      c = mix(c, vec3(0.5, 0.55, 0.55), step(1.5, vPart) * (1.0 - step(2.5, vPart)));       // fins
      c = mix(c, vec3(0.75, 0.72, 0.6), step(2.5, vPart));                                  // bone needle
      c += vec3(0.1, 0.25, 0.3) * smoothstep(0.03, 0.0, abs(vRest.y - 0.05)) * (1.0 - step(2.5, vPart)); // lateral line sheen
      diffuseColor.rgb = c;`);
  };
  m.customProgramCacheKey = () => 'needlefish';
  return m;
}

// ambient schooling fish (ai/Fish.js): Quaternius Fish2, smoothed, x-forward, 0.33 m
export function ambientFishGeometry(lib) {
  const src = lib.fish1; if (!src) return null;
  const parts = []; src.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
  for (const p of parts) if (!p.geometry.attributes.skinIndex) { const n = p.geometry.attributes.position.count; p.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4)); p.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4)); }
  const g = smoothGeometry(mergeSkinned(parts, (m) => (/fin/i.test(m.material.name) ? 2 : 0)), 1);
  { const P = g.attributes.position, A = g.attributes.aPart; for (let i = 0; i < P.count; i++) if (A.getX(i) > 1.5) { P.setX(i, P.getX(i) * 0.4); P.setY(i, P.getY(i) * 0.7); } }
  g.scale(1.25, 0.8, 1); // a fuller body, smaller fins
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.deleteAttribute('aPart');
  g.rotateY(Math.PI / 2);
  g.computeBoundingBox();
  const bb = g.boundingBox, L = bb.max.x - bb.min.x;
  g.translate(-bb.max.x, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
  g.scale(0.33 / L, 0.33 / L * 0.8, 0.33 / L * 0.8);
  g.translate(0.16, 0, 0);
  g.computeVertexNormals();
  return g;
}
