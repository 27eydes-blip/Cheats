import * as THREE from 'three';
import { DM } from './HumanKit.js';
import { skinMaterial, eyeMaterial, hairMaterial, clothMaterial, cardMaterial, exprUniforms } from './HumanShaders.js';
import { Face } from './Face.js';

// One person, baked from the kit with a parameter set (see Roster.js):
//  - macro shape (sex, age, muscle, weight, ancestry) via MakeHuman's
//    universal/race target interpolation, plus dozens of face/head dials;
//  - skeleton from the morphed joint landmarks, rest frames world-aligned so
//    retargeted animation applies directly;
//  - fitted proxies: eyes, brows, lashes, teeth, tongue, hair, clothes, shoes, hat;
//  - body triangles hidden under clothes (proxy delete lists);
//  - LOD: a 741-vertex proxy body + no small face parts beyond `lodDist`.

function macroWeights(p) {
  const out = {};
  const g = p.sex; // 0 female … 1 male
  const sexes = [['female', 1 - g], ['male', g]];
  // age in years → MakeHuman age value
  const y = p.age;
  const a = y < 25 ? Math.max(0, (y - 1) / 48) : 0.5 + (y - 25) / 130;
  const ages = a < 0.5
    ? [['child', Math.max(0, Math.min(1, 5.333 * a) - Math.max(0, (a - 0.1875) * 3.2))], ['young', Math.max(0, (a - 0.1875) * 3.2)], ['old', 0]]
    : [['child', 0], ['young', 1 - Math.max(0, a * 2 - 1)], ['old', Math.max(0, a * 2 - 1)]];
  const tri = (v, lo, mid, hi) => [[hi, Math.max(0, v * 2 - 1)], [lo, Math.max(0, 1 - v * 2)], [mid, 1 - Math.max(0, v * 2 - 1) - Math.max(0, 1 - v * 2)]];
  const mus = tri(p.muscle, 'minmuscle', 'averagemuscle', 'maxmuscle');
  const wei = tri(p.weight, 'minweight', 'averageweight', 'maxweight');
  for (const [s, ws] of sexes) for (const [ag, wa] of ages) {
    if (!ws || !wa) continue;
    for (const [m, wm] of mus) for (const [w, ww] of wei) { const k = ws * wa * wm * ww; if (k > 1e-4) out[`universal-${s}-${ag}-${m}-${w}`] = k; }
    for (const [r, wr] of Object.entries(p.race)) { const k = ws * wa * wr; if (k > 1e-4) out[`${r}-${s}-${ag}`] = k; }
  }
  return out;
}

export class Human {
  constructor(kit, p, opts = {}) {
    this.kit = kit; this.p = p;
    this.settings = opts.settings;
    const phone = opts.settings?.q.npcDetail === 0;
    this.root = new THREE.Group();
    this.root.name = 'human:' + (p.name || p.seed);
    // ---- shape
    const w = { ...macroWeights(p), ...(p.dials || {}) };
    const pos = kit.bake(w);
    // feet on the floor, metres
    let minY = Infinity; for (const i of [kit.boneIndex['toe1-1.L'], kit.boneIndex['foot.L']]) { const b = kit.bones[i]; minY = Math.min(minY, kit.jointPos(b.head, pos)[1]); }
    const bodyMin = (() => { let m = Infinity; const map = kit.body.map; for (let i = 0; i < map.length; i++) m = Math.min(m, pos[map[i] * 3 + 1]); return m; })();
    this.floor = bodyMin;
    const S = DM * (p.height || 1);
    this.S = S;
    const toM = (x, y, z, out, o) => { out[o] = x * S; out[o + 1] = (y - bodyMin) * S; out[o + 2] = z * S; };

    // ---- skeleton (world-aligned rest frames)
    const bones = [], heads = [];
    for (const b of kit.bones) {
      const h = kit.jointPos(b.head, pos); const v = new Float32Array(3); toM(h[0], h[1], h[2], v, 0); heads.push(v);
      const bone = new THREE.Bone(); bone.name = b.name.replace(/\./g, '_'); bone.userData.mh = b.name; bones.push(bone);
    }
    kit.bones.forEach((b, i) => {
      const hd = heads[i];
      if (b.parent >= 0) { const ph = heads[b.parent]; bones[i].position.set(hd[0] - ph[0], hd[1] - ph[1], hd[2] - ph[2]); bones[b.parent].add(bones[i]); }
      else bones[i].position.set(hd[0], hd[1], hd[2]);
    });
    this.bones = bones;
    this.bone = Object.fromEntries(bones.map((b) => [b.userData.mh, b]));
    this.restHeads = heads;
    this.tails = kit.bones.map((b) => { const t = kit.jointPos(b.tail, pos); const v = new THREE.Vector3(); v.set(t[0] * S, (t[1] - bodyMin) * S, t[2] * S); return v; });
    const rootBones = bones.filter((b, i) => kit.bones[i].parent < 0);
    // bind pose: bones must have their world matrices before the inverses are taken
    const holder = new THREE.Group(); for (const rb of rootBones) holder.add(rb); holder.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bones);

    // ---- what they wear decides which body triangles are hidden
    const outfit = [...(p.clothes || [])].map((c) => kit.proxies['cloth:' + c]).filter(Boolean);
    const deleted = new Uint8Array(kit.NV);
    for (const c of outfit) if (c.del) for (const v of c.del) deleted[v] = 1;

    // ---- body
    const look = { ...p.look, hairColor: srgb(p.look?.hairColor || [0.1, 0.08, 0.06]), age01: Math.min(1, Math.max(0, (p.age - 15) / 60)) };
    // scars are given relative to the point between the eyes; tattoos by bone name
    const eL = heads[kit.boneIndex['eye.L']], eR = heads[kit.boneIndex['eye.R']];
    const mid = [(eL[0] + eR[0]) / 2, (eL[1] + eR[1]) / 2, (eL[2] + eR[2]) / 2];
    if (p.look?.scar) look.scar = p.look.scar.map(([x, y]) => [mid[0] + x, mid[1] + y, mid[2]]);
    if (p.look?.tattoo) look.tattoo = { ...p.look.tattoo, bone: kit.boneIndex[p.look.tattoo.bone] ?? -1 };
    const exprBody = exprUniforms(kit.expr.body.tex, kit.expr.units);
    this.exprSets = [exprBody.uExprW.value];
    const bodyGeo = this.bodyGeometry(pos, toM, deleted);
    this.skinMat = skinMaterial(look, exprBody, { sss: !phone });
    const skinRec = kit.skins.find((s) => s.name === p.skin) || kit.skins[0];
    kit.bind(this.skinMat, 'map', skinRec.tex, true);
    this.body = new THREE.SkinnedMesh(bodyGeo, this.skinMat);
    this.body.name = 'body';
    for (const rb of rootBones) this.body.add(rb);
    this.body.bind(this.skeleton, new THREE.Matrix4());
    this.root.add(this.body);
    this.meshes = [this.body];
    this.detail = []; // hidden at LOD1

    // ---- proxies
    const add = (key, material, { detail = false, exprKey = null, sway = false } = {}) => {
      const px = kit.proxies[key];
      if (!px) return null;
      const g = this.proxyGeometry(px, pos, toM, { exprKey, sway });
      if (exprKey) {
        const eu = exprUniforms(kit.exprProxy[exprKey].tex, kit.expr.units);
        withExpr(material, eu);
        this.exprSets.push(eu.uExprW.value);
      }
      const m = new THREE.SkinnedMesh(g, material);
      m.name = key;
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false; this.body.frustumCulled = false;
      m.castShadow = !/^(lash|brow)/.test(key); m.receiveShadow = true;
      this.root.add(m);
      this.meshes.push(m);
      if (detail) this.detail.push(m);
      return m;
    };
    // eyes: high-poly near, low-poly at distance
    this.eyeMat = eyeMaterial();
    const iris = kit.eyeColors.find((e) => e.name === p.eyes) || kit.eyeColors[0];
    kit.bind(this.eyeMat, 'map', iris.tex, true);
    this.eyes = add('eyes', this.eyeMat); // high-poly eyes everywhere: ~1k verts, and the eyes are what people look at
    if (this.eyes) {
      // the eye proxy includes a cornea shell (mapped to the atlas corner): make it a clear, wet layer
      const g = this.eyes.geometry, uv = g.attributes.uv, ix = g.index;
      const opaque = [], cornea = [];
      for (let t = 0; t < ix.count; t += 3) {
        const a = ix.getX(t);
        (uv.getX(a) > 0.86 && uv.getY(a) > 0.85 ? cornea : opaque).push(ix.getX(t), ix.getX(t + 1), ix.getX(t + 2));
      }
      g.setIndex([...opaque, ...cornea]);
      g.clearGroups(); g.addGroup(0, opaque.length, 0); g.addGroup(opaque.length, cornea.length, 1);
      // cornea: only its reflection (wet highlight, the sky in the eye) is added on top of the iris
      this.corneaMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, envMapIntensity: 0.7 });
      this.eyes.material = [this.eyeMat, this.corneaMat];
      this.eyes.castShadow = false;
    }
    const hairCol = srgb(p.look?.hairColor || [0.1, 0.08, 0.06]);
    const browMat = cardMaterial(hairCol.map((c) => Math.min(1, c * 1.6 + 0.02)), 0.05);
    const brow = kit.proxies[p.brow] ? p.brow : 'brow1';
    if (kit.proxies[brow].tex.map) kit.bind(browMat, 'map', kit.proxies[brow].tex.map, true);
    add(brow, browMat, { detail: true, exprKey: brow });
    if (!phone) {
      const lashMat = cardMaterial([0.02, 0.018, 0.016], 0.05);
      const lash = kit.proxies[p.lash] ? p.lash : 'lash1';
      if (kit.proxies[lash].tex.map) kit.bind(lashMat, 'map', kit.proxies[lash].tex.map, true);
      add(lash, lashMat, { detail: true, exprKey: lash });
      const teethMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.86, 0.82, 0.72).multiplyScalar(p.age > 55 ? 0.85 : 1), roughness: 0.35 });
      if (kit.proxies.teeth.tex.map) kit.bind(teethMat, 'map', kit.proxies.teeth.tex.map, true);
      add('teeth', teethMat, { detail: true, exprKey: 'teeth' });
      const tongueMat = new THREE.MeshStandardMaterial({ color: 0xb06060, roughness: 0.4 });
      add('tongue', tongueMat, { detail: true, exprKey: 'tongue' });
    }
    // hair
    if (p.hair && kit.proxies['hair:' + p.hair]) {
      this.hairMat = hairMaterial(hairCol, { alphaTest: 0.55, sway: /long|ponytail|braid/.test(p.hair) ? 1.4 : /afro/.test(p.hair) ? 0.25 : 0.6 });
      const hp = kit.proxies['hair:' + p.hair];
      if (hp.tex.map) kit.bind(this.hairMat, 'map', hp.tex.map, true);
      if (hp.tex.normalMap) kit.bind(this.hairMat, 'normalMap', hp.tex.normalMap, false);
      const core = add('hair:' + p.hair, this.hairMat, { sway: true });
      // soft fringe: the same cards again, alpha-blended, drawn after the opaque core
      if (core && !phone) {
        const fringe = this.hairMat.clone();
        fringe.userData.u = this.hairMat.userData.u;
        fringe.onBeforeCompile = this.hairMat.onBeforeCompile;
        fringe.customProgramCacheKey = this.hairMat.customProgramCacheKey;
        fringe.alphaTest = 0.04; fringe.transparent = true; fringe.depthWrite = false;
        const soft = new THREE.SkinnedMesh(core.geometry, fringe);
        soft.bind(this.skeleton, new THREE.Matrix4()); soft.frustumCulled = false; soft.renderOrder = 2;
        this.root.add(soft); this.meshes.push(soft);
        const sync = () => { fringe.map = this.hairMat.map; fringe.normalMap = this.hairMat.normalMap; fringe.needsUpdate = true; };
        const h = kit.texture(kit.proxies['hair:' + p.hair].tex.map, true);
        if (h?.texture) sync(); else h?.waiting.push(sync);
      }
    }
    // clothes, shoes, hat
    this.clothMats = [];
    (p.clothes || []).forEach((c, i) => {
      const cp = kit.proxies['cloth:' + c];
      if (!cp) return;
      // sun-faded: dyes out here never stay bright
      const tint = fade(srgb((p.clothTints || [])[i] || [0.7, 0.66, 0.6]), 0.4);
      const cm = clothMaterial(tint, { salt: p.look?.salt ?? 0.5, wear: p.look?.wear ?? 0.5, patch: (p.look?.patches || 0) > i ? 1 : 0, seed: (p.seed || 1) * 0.37 + i, double: /fedora/.test(c) });
      if (cp.tex.map) kit.bind(cm, 'map', cp.tex.map, true);
      if (cp.tex.normalMap) kit.bind(cm, 'normalMap', cp.tex.normalMap, false);
      if (cp.tex.aoMap) kit.bind(cm, 'aoMap', cp.tex.aoMap, false);
      this.clothMats.push(cm);
      add('cloth:' + c, cm);
    });
    // LOD body (shares the skeleton)
    if (kit.proxies.lod) {
      const lodMat = skinMaterial(look, exprUniforms(kit.expr.body.tex, 0), { sss: false });
      kit.bind(lodMat, 'map', skinRec.tex, true);
      const g = this.proxyGeometry(kit.proxies.lod, pos, toM, {});
      this.lodBody = new THREE.SkinnedMesh(g, lodMat);
      this.lodBody.bind(this.skeleton, new THREE.Matrix4());
      this.lodBody.visible = false; this.lodBody.frustumCulled = false;
      this.root.add(this.lodBody);
    }
    this.lod = 0;
    this.height = this.restHeads[kit.boneIndex.head][1] + 0.12;
    this.face = new Face(this, p);
  }

  // body render geometry: positions in metres, smooth normals across UV seams
  bodyGeometry(pos, toM, deleted) {
    const kit = this.kit, map = kit.body.map, nr = map.length;
    const P = new Float32Array(nr * 3), N = new Float32Array(nr * 3);
    const baseN = new Float32Array(kit.NV * 3), tmpP = new Float32Array(kit.NV * 3);
    for (let v = 0; v < kit.NV; v++) toM(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], tmpP, v * 3);
    const idx = kit.body.idx, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = map[idx[t]], b = map[idx[t + 1]], c = map[idx[t + 2]];
      const ux = tmpP[b * 3] - tmpP[a * 3], uy = tmpP[b * 3 + 1] - tmpP[a * 3 + 1], uz = tmpP[b * 3 + 2] - tmpP[a * 3 + 2];
      const vx = tmpP[c * 3] - tmpP[a * 3], vy = tmpP[c * 3 + 1] - tmpP[a * 3 + 1], vz = tmpP[c * 3 + 2] - tmpP[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { baseN[k * 3] += nx; baseN[k * 3 + 1] += ny; baseN[k * 3 + 2] += nz; }
      if (!(deleted[a] && deleted[b] && deleted[c])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const skinI = new Uint16Array(nr * 4), skinW = new Float32Array(nr * 4), face = new Float32Array(nr), reg = new Uint8Array(nr * 4), reg2 = new Uint8Array(nr * 4);
    const cols = kit.expr.body.cols;
    for (let r = 0; r < nr; r++) {
      const v = map[r];
      P[r * 3] = tmpP[v * 3]; P[r * 3 + 1] = tmpP[v * 3 + 1]; P[r * 3 + 2] = tmpP[v * 3 + 2];
      const l = Math.hypot(baseN[v * 3], baseN[v * 3 + 1], baseN[v * 3 + 2]) || 1;
      N[r * 3] = baseN[v * 3] / l; N[r * 3 + 1] = baseN[v * 3 + 1] / l; N[r * 3 + 2] = baseN[v * 3 + 2] / l;
      for (let k = 0; k < 4; k++) { skinI[r * 4 + k] = kit.skinIdx[v * 4 + k]; skinW[r * 4 + k] = kit.skinW[v * 4 + k] / 255; reg[r * 4 + k] = kit.regions[v * 4 + k]; reg2[r * 4 + k] = kit.regions2[v * 4 + k]; }
      face[r] = cols[v];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(kit.body.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    g.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
    g.setAttribute('aReg', new THREE.BufferAttribute(reg, 4, true));
    g.setAttribute('aReg2', new THREE.BufferAttribute(reg2, 4, true));
    g.setIndex(keep);
    g.computeBoundingSphere();
    return g;
  }

  // a fitted proxy: positions from the body, skin weights from its reference vertices
  proxyGeometry(px, pos, toM, { exprKey, sway }) {
    const kit = this.kit;
    const fitted = kit.fit(px, pos);
    const nr = px.nr, P = new Float32Array(nr * 3), skinI = new Uint16Array(nr * 4), skinW = new Float32Array(nr * 4);
    const face = exprKey ? new Float32Array(nr) : null, swayA = sway ? new Float32Array(nr) : null;
    const cols = exprKey ? kit.exprProxy[exprKey].cols : null;
    const headTop = this.restHeads[kit.boneIndex.head][1] + 0.2, neckY = this.restHeads[kit.boneIndex.neck01][1];
    for (let r = 0; r < nr; r++) {
      const v = px.map[r];
      toM(fitted[v * 3], fitted[v * 3 + 1], fitted[v * 3 + 2], P, r * 3);
      // dominant reference vertex supplies the bone weights
      let best = 0; for (let j = 1; j < 3; j++) if (px.w[v * 3 + j] > px.w[v * 3 + best]) best = j;
      const ref = px.refs[v * 3 + best];
      for (let k = 0; k < 4; k++) { skinI[r * 4 + k] = kit.skinIdx[ref * 4 + k]; skinW[r * 4 + k] = kit.skinW[ref * 4 + k] / 255; }
      if (face) face[r] = cols[v];
      if (swayA) swayA[r] = Math.min(1, Math.max(0, (headTop - P[r * 3 + 1]) / Math.max(0.2, headTop - neckY + 0.25)));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(px.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    if (face) g.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
    if (swayA) g.setAttribute('aSway', new THREE.BufferAttribute(swayA, 1));
    g.setIndex(new THREE.BufferAttribute(px.idx, 1));
    if (sway) {
      // hair cards: light them like the volume they form, not as separate flat cards
      const hc = this.restHeads[kit.boneIndex.head];
      const c = [hc[0], hc[1] + 0.06, hc[2] - 0.01];
      const N = new Float32Array(nr * 3);
      for (let r = 0; r < nr; r++) {
        const x = P[r * 3] - c[0], y = (P[r * 3 + 1] - c[1]) * 0.8, z = P[r * 3 + 2] - c[2];
        const l = Math.hypot(x, y, z) || 1; N[r * 3] = x / l; N[r * 3 + 1] = y / l; N[r * 3 + 2] = z / l;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    } else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  setLod(level) {
    if (level === this.lod) return;
    this.lod = level;
    for (const m of this.detail) m.visible = level === 0;
    if (this.lodBody) { this.lodBody.visible = level >= 1; this.body.visible = level === 0; }
  }
  // weather/effort state → shader inputs
  setWet(rainWet, sweat = 0) {
    this.skinMat.userData.u.uWetSkin.value = rainWet;
    this.skinMat.userData.u.uSweat.value = sweat;
    if (this.hairMat) this.hairMat.userData.u.uWetHair.value = rainWet;
    for (const m of this.clothMats) m.userData.u.uWetCloth.value = rainWet;
  }
  update(dt, ctx) { this.face.update(dt, ctx); }
  dispose() {
    for (const m of [...this.meshes, this.lodBody].filter(Boolean)) { m.geometry.dispose(); m.material.dispose?.(); }
  }
}

// colours in the roster are authored as sRGB; shaders work in linear
const _c = new THREE.Color();
function fade(rgb, k) { const l = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11; return rgb.map((c) => (c * (1 - k) + l * k) * 0.82 + 0.015); }
function srgb(rgb) { _c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); return [_c.r, _c.g, _c.b]; }

// add expression deltas to any material (brows, lashes, teeth, tongue)
function withExpr(m, eu) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    Object.assign(s.uniforms, eu);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFace; uniform sampler2D tExpr; uniform float uExprW[34]; uniform int uExprN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (aFace >= 0.0) { int col = int(aFace); for (int i = 0; i < 34; i++) { if (i >= uExprN) break; float w = uExprW[i]; if (abs(w) > 0.002) transformed += w * texelFetch(tExpr, ivec2(col, i), 0).xyz; } }`);
  };
  const key = m.customProgramCacheKey?.() || '';
  m.customProgramCacheKey = () => key + '+expr';
}
