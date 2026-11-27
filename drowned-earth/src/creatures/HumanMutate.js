import * as THREE from 'three';

// Mutations for the sculpted MakeHuman bodies (Listeners, Bloomwalkers).
//
// extraArms(): grows a second (third…) arm out of the torso. It cuts the arm
// out of the body mesh itself (every triangle skinned to the arm chain), clones
// the arm's bone chain under a spine bone at an offset, and rebinds the cut
// mesh to the clone — so the extra limb is the same sculpted arm, with the same
// skin shader, and it animates (it follows the real arm with a lag and its own
// writhing).
const ARM = /^(upperarm|lowerarm|wrist|finger|metacarpal)/;

export function extraArms(human, side, spineName, offset, { splay = 0.35, scale = 1, lag = 0.6 } = {}) {
  const sk = human.skeleton, bones = sk.bones;
  const chainIdx = bones.map((b, i) => (ARM.test(b.userData.mh) && b.userData.mh.endsWith('.' + side) ? i : -1)).filter((i) => i >= 0);
  const chain = new Set(chainIdx);
  const spine = human.bone[spineName];
  if (!spine || !chainIdx.length) return null;
  // rest world positions (frames are world-aligned at rest)
  human.root.updateMatrixWorld(true);
  const restW = (i) => new THREE.Vector3().setFromMatrixPosition(_m.copy(sk.boneInverses[i]).invert());
  const spineI = bones.indexOf(spine);
  const spineW = restW(spineI);
  const map = new Map(); // old index -> new bone
  const newBones = [];
  for (const i of chainIdx) {
    const b = bones[i];
    const nb = new THREE.Bone(); nb.name = b.name + '_x' + spineName; nb.userData.src = b;
    const parentOld = bones.indexOf(b.parent);
    if (map.has(parentOld)) { nb.position.copy(b.position); map.get(parentOld).add(nb); }
    else { const w = restW(i).add(offset); nb.position.copy(w.sub(spineW)); nb.scale.setScalar(scale); spine.add(nb); }
    map.set(i, nb); newBones.push(nb);
  }
  // skeleton = all old bones + the new chain
  const all = bones.concat(newBones);
  const inv = sk.boneInverses.slice();
  for (const nb of newBones) { nb.updateMatrixWorld(true); }
  // rest-pose inverses for the new bones: their world rest = source rest + offset (scaled about the root)
  const rootOld = chainIdx[0], rootW = restW(rootOld);
  for (const i of chainIdx) {
    const w = restW(i).sub(rootW).multiplyScalar(scale).add(rootW).add(offset);
    inv.push(new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(w).invert());
  }
  const newSk = new THREE.Skeleton(all, inv);
  // cut the arm out of the body mesh: triangles whose vertices are (almost) all arm
  const src = human.body.geometry;
  const I = src.attributes.skinIndex, W = src.attributes.skinWeight, idx = src.index;
  const armW = new Float32Array(I.count);
  for (let v = 0; v < I.count; v++) { let s = 0; for (let c = 0; c < 4; c++) if (chain.has(I.getComponent(v, c))) s += W.getComponent(v, c); armW[v] = s; }
  const tris = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (armW[a] > 0.55 && armW[b] > 0.55 && armW[c] > 0.55) tris.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) if (!/^skin/.test(name)) g.setAttribute(name, src.attributes[name]);
  // new skinning: only the cloned chain, renormalized
  const si = new Uint16Array(I.count * 4), sw = new Float32Array(I.count * 4);
  const base = bones.length;
  const order = chainIdx;
  for (let v = 0; v < I.count; v++) {
    let s = 0;
    for (let c = 0; c < 4; c++) { const bi = I.getComponent(v, c), w = W.getComponent(v, c); if (chain.has(bi)) { si[v * 4 + c] = base + order.indexOf(bi); sw[v * 4 + c] = w; s += w; } }
    if (s > 0) for (let c = 0; c < 4; c++) sw[v * 4 + c] /= s; else { si[v * 4] = base; sw[v * 4] = 1; }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(tris);
  const mesh = new THREE.SkinnedMesh(g, human.skinMat);
  mesh.bind(newSk, new THREE.Matrix4());
  mesh.frustumCulled = false; mesh.castShadow = true;
  human.root.add(mesh);
  const phase = Math.random() * 6;
  const splayQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (side === 'L' ? 1 : -1) * splay);
  const hist = newBones.map((nb) => nb.userData.src.quaternion.clone());
  return {
    mesh,
    // follow the real arm, late and loose, with a writhe of its own
    update(t, dt) {
      newBones.forEach((nb, k) => {
        const s = nb.userData.src;
        hist[k].slerp(s.quaternion, Math.min(1, dt * (3 - lag * 2)));
        nb.quaternion.copy(hist[k]);
        if (k === 0) nb.quaternion.premultiply(splayQ);
        const n = nb.userData.src.userData.mh;
        if (/lowerarm01/.test(n)) nb.rotateX(Math.sin(t * 1.3 + phase) * 0.35);
        if (/wrist/.test(n)) nb.rotateZ(Math.sin(t * 1.9 + phase) * 0.3);
        if (/finger.-2/.test(n)) nb.rotateX(0.3 + Math.sin(t * 2.3 + phase + k) * 0.3);
      });
    },
  };
}
const _m = new THREE.Matrix4();

// dead skin: desaturated, translucent-looking, veined, wet. Chains onto the
// human skin material's own shader patch. `tint` is the colour it fades to.
export function deadSkin(mat, { tint = [0.78, 0.82, 0.84], veins = 0.6, wet = 0.7, algae = 0 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = 'varying vec3 vDS;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDS = position;');
    sh.fragmentShader = `varying vec3 vDS;
      float ds_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float ds_n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(ds_h(i), ds_h(i + vec3(1,0,0)), f.x), mix(ds_h(i + vec3(0,1,0)), ds_h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(ds_h(i + vec3(0,0,1)), ds_h(i + vec3(1,0,1)), f.x), mix(ds_h(i + vec3(0,1,1)), ds_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      ` + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `
        { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 dead = vec3(l) * vec3(${tint.map((x) => x.toFixed(3)).join(',')}) * 0.95;
          // veins under thin skin: branching dark-blue lines
          float v1 = 1.0 - abs(ds_n(vDS * 14.0) * 2.0 - 1.0), v2 = 1.0 - abs(ds_n(vDS * 31.0 + 3.0) * 2.0 - 1.0);
          float vein = (pow(v1, 18.0) + pow(v2, 26.0) * 0.6) * ${veins.toFixed(2)};
          dead = mix(dead, vec3(0.16, 0.2, 0.3), clamp(vein, 0.0, 0.8));
          // blotches: lividity, bruising where blood settled
          dead *= 0.85 + 0.3 * ds_n(vDS * 5.0);
          ${algae ? `dead = mix(dead, vec3(0.16, 0.22, 0.12), smoothstep(0.55, 0.75, ds_n(vDS * 7.0 + 9.0)) * ${algae.toFixed(2)});` : ''}
          diffuseColor.rgb = dead; }
        #include <roughnessmap_fragment>
        roughnessFactor = min(roughnessFactor, ${(1 - wet * 0.55).toFixed(2)});`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + 'dead' + tint.join() + veins + wet + algae;
  mat.needsUpdate = true;
}
