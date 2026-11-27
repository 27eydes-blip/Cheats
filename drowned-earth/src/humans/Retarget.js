import * as THREE from 'three';

// Retargets the Universal Animation Library (Quaternius, CC0; UE-mannequin
// names, T-pose rest) onto the MakeHuman default rig (A-pose rest, our rest
// frames world-aligned). For each mapped bone:
//   world_target(t) = [world_source(t) · world_source_rest⁻¹] · A
// where A rotates the target bone's rest direction onto the source bone's rest
// direction. Unmapped target bones follow their parent (local identity), so
// only mapped bones get tracks. Hips translation is scaled by leg length.
const MAP = {
  pelvis: 'root', spine_01: 'spine05', spine_02: 'spine03', spine_03: 'spine01', neck_01: 'neck01', Head: 'head',
};
for (const [s, t] of [['l', 'L'], ['r', 'R']]) Object.assign(MAP, {
  [`clavicle_${s}`]: `clavicle.${t}`, [`upperarm_${s}`]: `upperarm01.${t}`, [`lowerarm_${s}`]: `lowerarm01.${t}`, [`hand_${s}`]: `wrist.${t}`,
  [`thigh_${s}`]: `upperleg01.${t}`, [`calf_${s}`]: `lowerleg01.${t}`, [`foot_${s}`]: `foot.${t}`,
  [`thumb_01_${s}`]: `finger1-1.${t}`, [`thumb_02_${s}`]: `finger1-2.${t}`, [`thumb_03_${s}`]: `finger1-3.${t}`,
  [`index_01_${s}`]: `finger2-1.${t}`, [`index_02_${s}`]: `finger2-2.${t}`, [`index_03_${s}`]: `finger2-3.${t}`,
  [`middle_01_${s}`]: `finger3-1.${t}`, [`middle_02_${s}`]: `finger3-2.${t}`, [`middle_03_${s}`]: `finger3-3.${t}`,
  [`ring_01_${s}`]: `finger4-1.${t}`, [`ring_02_${s}`]: `finger4-2.${t}`, [`ring_03_${s}`]: `finger4-3.${t}`,
  [`pinky_01_${s}`]: `finger5-1.${t}`, [`pinky_02_${s}`]: `finger5-2.${t}`, [`pinky_03_${s}`]: `finger5-3.${t}`,
});
// source "child" that defines each source bone's direction
const SRC_CHILD = { pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'Head' };
for (const s of ['l', 'r']) Object.assign(SRC_CHILD, {
  [`clavicle_${s}`]: `upperarm_${s}`, [`upperarm_${s}`]: `lowerarm_${s}`, [`lowerarm_${s}`]: `hand_${s}`, [`hand_${s}`]: `middle_01_${s}`,
  [`thigh_${s}`]: `calf_${s}`, [`calf_${s}`]: `foot_${s}`, [`foot_${s}`]: `ball_${s}`,
  [`thumb_01_${s}`]: `thumb_02_${s}`, [`thumb_02_${s}`]: `thumb_03_${s}`, [`index_01_${s}`]: `index_02_${s}`, [`index_02_${s}`]: `index_03_${s}`,
  [`middle_01_${s}`]: `middle_02_${s}`, [`middle_02_${s}`]: `middle_03_${s}`, [`ring_01_${s}`]: `ring_02_${s}`, [`ring_02_${s}`]: `ring_03_${s}`,
  [`pinky_01_${s}`]: `pinky_02_${s}`, [`pinky_02_${s}`]: `pinky_03_${s}`,
});

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export function retargetClips(gltf, human, keep) {
  const src = gltf.scene.clone(true);
  src.updateMatrixWorld(true);
  const node = {}; src.traverse((o) => { node[o.name] = o; });
  // source rest
  const restQ = {}, restP = {};
  for (const n of Object.keys(MAP)) if (node[n]) { restQ[n] = node[n].getWorldQuaternion(new THREE.Quaternion()); restP[n] = node[n].getWorldPosition(new THREE.Vector3()); }
  const srcDir = (n) => { const c = node[SRC_CHILD[n]]; if (!c || !node[n]) return null; return c.getWorldPosition(new THREE.Vector3()).sub(node[n].getWorldPosition(new THREE.Vector3())).normalize(); };
  const restDirs = {}; for (const n of Object.keys(MAP)) restDirs[n] = srcDir(n);
  // target rest
  const kit = human.kit;
  const tIndex = (mh) => kit.boneIndex[mh];
  const align = {};
  for (const [s, t] of Object.entries(MAP)) {
    const i = tIndex(t);
    if (i === undefined || !restDirs[s]) { align[s] = new THREE.Quaternion(); continue; }
    // direction toward the next *mapped* joint (MakeHuman splits limbs into twist segments)
    const head = human.restHeads[i];
    const nextT = MAP[SRC_CHILD[s]] !== undefined ? tIndex(MAP[SRC_CHILD[s]]) : undefined;
    const end = nextT !== undefined ? human.restHeads[nextT] : [human.tails[i].x, human.tails[i].y, human.tails[i].z];
    const td = _v.set(end[0] - head[0], end[1] - head[1], end[2] - head[2]).normalize();
    align[s] = new THREE.Quaternion().setFromUnitVectors(td, restDirs[s]);
  }
  const srcHipH = restP.pelvis ? restP.pelvis.y : 1;
  const tgtHip = human.restHeads[tIndex('root')];
  const legScale = tgtHip[1] / Math.max(0.1, srcHipH);
  // target parent chain (for world → local)
  const parentOf = kit.bones.map((b) => b.parent);
  const mappedT = new Map(Object.entries(MAP).map(([s, t]) => [tIndex(t), s]).filter(([i]) => i !== undefined));

  const mixer = new THREE.AnimationMixer(src);
  const clips = {};
  for (const clip of gltf.animations) {
    if (keep && !keep.includes(clip.name)) continue;
    const c = clip.clone();
    c.tracks = c.tracks.filter((t) => !/^root\./.test(t.name));
    const act = mixer.clipAction(c); act.play();
    const fps = 30, n = Math.max(2, Math.round(c.duration * fps) + 1);
    const times = new Float32Array(n);
    const qTracks = new Map(); for (const i of mappedT.keys()) qTracks.set(i, new Float32Array(n * 4));
    const hip = new Float32Array(n * 3);
    const world = new Array(kit.bones.length);
    for (let f = 0; f < n; f++) {
      const t = Math.min(c.duration, f / fps);
      times[f] = t;
      mixer.setTime(t);
      src.updateMatrixWorld(true);
      // world rotations for every target bone, parents first (kit order)
      for (let i = 0; i < kit.bones.length; i++) {
        const p = parentOf[i];
        const s = mappedT.get(i);
        if (s && node[s]) {
          const qs = node[s].getWorldQuaternion(_q);
          world[i] = new THREE.Quaternion().copy(qs).multiply(_q2.copy(restQ[s]).invert()).multiply(align[s]);
        } else world[i] = p >= 0 ? world[p] : new THREE.Quaternion();
        if (s) {
          const local = p >= 0 ? _q2.copy(world[p]).invert().multiply(world[i]) : _q2.copy(world[i]);
          qTracks.get(i).set([local.x, local.y, local.z, local.w], f * 4);
        }
      }
      if (node.pelvis) {
        const wp = node.pelvis.getWorldPosition(_v2);
        hip[f * 3] = tgtHip[0] + (wp.x - restP.pelvis.x) * legScale;
        hip[f * 3 + 1] = tgtHip[1] + (wp.y - restP.pelvis.y) * legScale;
        hip[f * 3 + 2] = tgtHip[2] + (wp.z - restP.pelvis.z) * legScale;
      }
    }
    const tracks = [];
    for (const [i, arr] of qTracks) {
      // keep quaternions on one hemisphere so interpolation doesn't spin
      for (let f = 1; f < n; f++) { const d = arr[f * 4] * arr[f * 4 - 4] + arr[f * 4 + 1] * arr[f * 4 - 3] + arr[f * 4 + 2] * arr[f * 4 - 2] + arr[f * 4 + 3] * arr[f * 4 - 1]; if (d < 0) for (let k = 0; k < 4; k++) arr[f * 4 + k] *= -1; }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${kit.bones[i].name.replace(/\./g, '_')}.quaternion`, times, arr));
    }
    tracks.push(new THREE.VectorKeyframeTrack('root.position', times, hip));
    clips[clip.name] = new THREE.AnimationClip(clip.name, c.duration, tracks);
    act.stop(); mixer.uncacheAction(c);
  }
  return clips;
}
