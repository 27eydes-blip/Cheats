import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Rigged, textured people (Quaternius Universal Base Characters + Modular
// Outfits + Universal Animation Library, all CC0). A body supplies the head,
// face, eyes and hair; an outfit is re-bound onto the body's skeleton; one
// shared AnimationMixer per person plays clips from the animation library.
//
// No morph targets ship with these bodies, so expression is carried by the
// body: a look-at on the head and neck, blinking (eye scale) and the
// talking/idle clips.

export const CLIP_FOR = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', talk: 'Idle_Talking_Loop',
  hammer: 'Fixing_Kneeling', repair: 'Fixing_Kneeling', garden: 'Fixing_Kneeling', pray: 'Crouch_Idle_Loop',
  cook: 'PickUp_Table', stir: 'PickUp_Table', laundry: 'Interact', haul: 'Push_Loop', row: 'Driving_Loop',
  watch: 'Idle_Torch_Loop', lantern: 'Idle_Torch_Loop', sell: 'Idle_Talking_Loop', trade: 'Idle_Talking_Loop',
  sit: 'Sitting_Idle_Loop', fish: 'Sitting_Idle_Loop', sleep: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop',
  festival: 'Idle_Loop', swim: 'Swim_Idle_Loop', swimFwd: 'Swim_Fwd_Loop',
};

let clips = null;
function libraryClips(assets) {
  if (clips) return clips;
  const g = assets.characters.animations;
  clips = {};
  if (!g) return clips;
  for (const c of g.animations) {
    // the library has root motion on `root`; we move people ourselves
    const k = c.clone();
    k.tracks = k.tracks.filter((t) => !/^root\.(position|quaternion|scale)$/.test(t.name));
    clips[c.name] = k;
  }
  return clips;
}

// small per-person variation in skin, cloth and hair
const SKIN = [[1, 0.93, 0.87], [0.93, 0.8, 0.7], [0.8, 0.64, 0.52], [0.62, 0.46, 0.36], [0.45, 0.33, 0.26], [0.33, 0.24, 0.2]];
const HAIR = [[0.2, 0.15, 0.11], [0.08, 0.07, 0.06], [0.42, 0.3, 0.18], [0.55, 0.52, 0.48], [0.3, 0.17, 0.1]];

function tinted(m, rgb, k = 1) {
  const c = m.clone();
  c.color = new THREE.Color().setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k);
  return c;
}
// push cloth out along its normals a few millimetres so the body never pokes through
function inflate(m, amount) {
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>\ntransformed += normalize(objectNormal) * ${amount.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'inflate' + amount;
  return m;
}

export function charactersAvailable(assets) {
  const c = assets?.characters || {};
  return !!(c.bodyMale && c.bodyFemale && c.outfitMalePeasant && c.animations);
}

export class Character {
  // opts: { female, outfit: 'Peasant'|'Ranger', skin: 0..5 | [r,g,b], cloth: [r,g,b], cloth2, hair: 0..4, seed }
  constructor(assets, opts = {}) {
    const rnd = mulberry(opts.seed ?? 1);
    const female = opts.female ?? rnd() < 0.5;
    const outfitName = (female ? 'outfitFemale' : 'outfitMale') + (opts.outfit || (rnd() < 0.75 ? 'Peasant' : 'Ranger'));
    const body = assets.characters[female ? 'bodyFemale' : 'bodyMale'];
    const outfit = assets.characters[outfitName] || assets.characters[female ? 'outfitFemalePeasant' : 'outfitMalePeasant'];

    this.root = new THREE.Group();
    this.model = cloneSkinned(body.scene);
    this.root.add(this.model);
    const skinRGB = Array.isArray(opts.skin) ? opts.skin : SKIN[(opts.skin ?? Math.floor(rnd() * SKIN.length)) % SKIN.length];
    const hairRGB = HAIR[(opts.hair ?? Math.floor(rnd() * HAIR.length)) % HAIR.length];
    this.eyes = [];
    this.bones = {};
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (!o.isMesh) return;
      const n = o.material.name || '';
      if (/Hair/i.test(n)) o.material = tinted(o.material, hairRGB, 2.2);
      else if (/Eye/i.test(n)) this.eyes.push(o);
      else o.material = tinted(o.material, skinRGB);
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    });

    // outfit: clone, then bind every skinned mesh to the body's bones by name
    const oc = cloneSkinned(outfit.scene);
    const clothRGB = opts.cloth || [0.75 + rnd() * 0.35, 0.7 + rnd() * 0.3, 0.6 + rnd() * 0.35];
    const parts = [];
    oc.traverse((o) => { if (o.isSkinnedMesh) parts.push(o); });
    const bodyMesh = this.model.getObjectByProperty('isSkinnedMesh', true);
    for (const p of parts) {
      const bones = p.skeleton.bones.map((b) => this.bones[b.name] || b);
      const sk = new THREE.Skeleton(bones, p.skeleton.boneInverses);
      const n = p.material.name || '';
      p.material = /Regular/i.test(n) ? tinted(p.material, skinRGB) : inflate(tinted(p.material, clothRGB), 0.004);
      p.bind(sk, p.bindMatrix);
      p.castShadow = true; p.receiveShadow = true; p.frustumCulled = false;
      (bodyMesh?.parent || this.model).add(p);
    }
    // the outfit covers the torso, arms and legs: hide the body's own copy of
    // those triangles by drawing only the head region of the base mesh
    if (bodyMesh) hideBelowNeck(bodyMesh, this.bones.neck_01);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = libraryClips(assets);
    this.actions = {};
    this.current = null;
    this.blinkT = 1 + rnd() * 3;
    this.lookTarget = null;
    this.look = new THREE.Vector2();
    this.speed = 1;
    this.play('idle', 0);
    // desync loops so a crowd doesn't move in lockstep
    this.mixer.setTime(rnd() * 5);
  }

  action(name) {
    if (!this.actions[name]) {
      const clip = this.clips[name];
      if (!clip) return null;
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }
  play(activity, fade = 0.35) {
    const name = CLIP_FOR[activity] || activity;
    if (this.currentName === name) return;
    const next = this.action(name) || this.action('Idle_Loop');
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next; this.currentName = name;
  }

  // worldTarget: Vector3 to look at (or null)
  update(dt, worldTarget = null) {
    this.mixer.update(dt * this.speed);
    // blink
    this.blinkT -= dt;
    const closed = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    for (const e of this.eyes) e.visible = !closed;
    // look-at on head + neck, layered over the animation
    const head = this.bones.Head, neck = this.bones.neck_01;
    let yaw = 0, pitch = 0;
    if (worldTarget && head) {
      const hp = head.getWorldPosition(_v);
      const local = this.root.worldToLocal(_t.copy(worldTarget)).sub(this.root.worldToLocal(hp.clone()));
      yaw = Math.atan2(local.x, local.z);
      pitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      if (Math.abs(yaw) > 1.6) yaw = 0, pitch = 0;
      yaw = THREE.MathUtils.clamp(yaw, -1.1, 1.1); pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.4);
    }
    const k = 1 - Math.exp(-dt * 5);
    this.look.x += (yaw - this.look.x) * k; this.look.y += (pitch - this.look.y) * k;
    if (head && neck) {
      neck.rotateOnWorldAxis(_up, this.look.x * 0.4);
      head.rotateOnWorldAxis(_up, this.look.x * 0.6);
      head.rotateX(this.look.y * 0.7);
    }
  }
  dispose() { this.mixer.stopAllAction(); }
}

// Collapse every body vertex that is mostly skinned below the neck to a single
// point (degenerate triangles are culled by the rasteriser), so the outfit is
// the only surface you see there. Done once per body geometry.
const hiddenCache = new WeakMap();
function hideBelowNeck(mesh, neck) {
  const src = mesh.geometry;
  if (hiddenCache.has(src)) { mesh.geometry = hiddenCache.get(src); return; }
  const g = src.clone();
  const sk = mesh.skeleton;
  const keepIdx = new Set();
  sk.bones.forEach((b, i) => { if (/^(Head|neck_01|neck|head|.*eye.*|.*jaw.*|.*ear.*)$/i.test(b.name)) keepIdx.add(i); });
  const ji = g.attributes.skinIndex, jw = g.attributes.skinWeight, pos = g.attributes.position;
  if (!ji || !jw) { hiddenCache.set(src, src); return; }
  // copy positions into a plain float array so we can edit them
  const p = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
  // the "hidden" vertex goes to the neck so stretched tris never show
  let hid = 0;
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (keepIdx.has(ji.getComponent(i, k))) w += jw.getComponent(i, k);
    if (w < 0.25) {
      // mark by zero-length triangles: move to the vertex's own first bone origin in bind space later; simplest: tag
      hid++;
      p[i * 3 + 0] = NaN;
    }
  }
  // rebuild index without triangles that touch a hidden vertex
  const idx = g.index;
  if (idx) {
    const out = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (Number.isNaN(p[a * 3]) || Number.isNaN(p[b * 3]) || Number.isNaN(p[c * 3])) continue;
      out.push(a, b, c);
    }
    g.setIndex(out);
  }
  hiddenCache.set(src, g);
  mesh.geometry = g;
}

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
