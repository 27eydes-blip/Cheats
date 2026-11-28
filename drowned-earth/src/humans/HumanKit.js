import * as THREE from 'three';
import { capMips } from '../assets/AssetLibrary.js';

// The human kit: MakeHuman's base mesh (hm08), targets, rig and proxies,
// packed by scripts/humans/build.mjs. Loaded once; every person is baked from it.
//
// Shared, per-kit GPU data:
//  - expression deltas (34 FACS-style units) as one float texture per mesh
//    type (body, each brow/lash set, teeth, tongue), indexed by a compact
//    "face vertex" id, so expressions cost no per-person memory;
//  - per-vertex region masks (beard, cheeks, under-eye, lips, scalp, T-zone)
//    computed from the canonical base mesh for the skin shader.
const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/humans/';
const DM = 0.1; // MakeHuman units are decimetres

export class HumanKit {
  constructor(assets) {
    this.assets = assets;
    this.ready = false;
    this.tex = new Map();
  }
  async load() {
    const [j, b] = await Promise.all([
      fetch(BASE + 'kit.json').then((r) => { if (!r.ok) throw new Error('no human kit'); return r.json(); }),
      fetch(BASE + 'kit.bin').then((r) => r.arrayBuffer()),
    ]);
    this.j = j; this.buf = b;
    const f32 = (o, n) => new Float32Array(b, o, n), u16 = (o, n) => new Uint16Array(b, o, n), u32 = (o, n) => new Uint32Array(b, o, n), u8 = (o, n) => new Uint8Array(b, o, n), i16 = (o, n) => new Int16Array(b, o, n);
    const B = j.base, NV = j.nv;
    this.NV = NV;
    this.basePos = f32(B.pos, NV * 3);
    this.body = { map: u16(B.map, B.nr), uv: f32(B.uv, B.nr * 2), idx: u32(B.idx, B.ni), nr: B.nr };
    this.skinIdx = u8(B.skinIdx, NV * 4); this.skinW = u8(B.skinW, NV * 4);
    this.thickness = u8(B.thickness, NV);
    this.bones = j.bones;
    this.boneIndex = Object.fromEntries(j.bones.map((x, i) => [x.name, i]));
    this.targets = new Map();
    for (const t of j.targets) this.targets.set(t.name, { n: t.n, scale: t.scale, idx: u16(t.idx, t.n), d: i16(t.d, t.n * 3) });
    this.proxies = {};
    for (const [k, p] of Object.entries(j.proxies)) {
      this.proxies[k] = {
        key: k, nv: p.nv, scale: p.scale, refs: u16(p.refs, p.nv * 3), w: f32(p.w, p.nv * 3), off: f32(p.off, p.nv * 3),
        map: u16(p.map, p.nr), nr: p.nr, uv: f32(p.uv, p.nr * 2), idx: u32(p.idx, p.ni), del: p.del >= 0 ? u16(p.del, p.ndel) : null,
        tex: p.tex, color: p.color, transparent: p.transparent,
      };
    }
    // KTX2 textures are stored top row first; MakeHuman UVs count v from the bottom
    const flipV = (uv) => { for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]; };
    flipV(this.body.uv);
    for (const p of Object.values(this.proxies)) flipV(p.uv);
    this.skins = j.skins; this.eyeColors = j.eyes;
    this.exprNames = [...this.targets.keys()].filter((n) => n.startsWith('expr/')).map((n) => n.slice(5));
    this.buildExpressionTextures();
    this.buildRegions();
    this.ready = true;
    return this;
  }

  // ---------------------------------------------------------------- textures
  texture(rel, srgb = true) {
    if (!rel) return null;
    const tier = this.assets.settings.q.textureTier === '2k' && /skin_/.test(rel) ? 2048 : /skin_/.test(rel) ? 1024 : (/cloth|hair/.test(rel) && !/\.(normal|ao)$/.test(rel) ? 1024 : 512);
    const sizes = /skin_/.test(rel) ? [tier, 1024] : [tier];
    const key = rel + '|' + tier;
    if (this.tex.has(key)) return this.tex.get(key);
    if (rel.endsWith('.png')) {
      const holder = { texture: null, waiting: [] };
      new THREE.TextureLoader().load(BASE + rel, (t) => {
        t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
        holder.texture = t; for (const fn of holder.waiting) fn(t); holder.waiting.length = 0;
      });
      this.tex.set(key, holder);
      return holder;
    }
    const t = new THREE.Texture();
    // placeholder until the KTX2 arrives; materials pick the real one up on load
    const holder = { texture: null, waiting: [] };
    const tryLoad = (i) => this.assets.ktx2.load(BASE + `${rel}.${sizes[i]}.ktx2`, (kt) => {
      kt.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      kt.anisotropy = this.assets.anisotropy;
      kt.wrapS = kt.wrapT = THREE.RepeatWrapping;
      capMips(kt, this.assets.settings.q.propTex || 0);   // Laptop: 512 at most
      holder.texture = kt;
      for (const fn of holder.waiting) fn(kt);
      holder.waiting.length = 0;
    }, undefined, () => { if (i + 1 < sizes.length) tryLoad(i + 1); });
    tryLoad(0);
    this.tex.set(key, holder);
    return holder;
  }
  // set material[slot] when the texture is ready
  bind(material, slot, rel, srgb = true) {
    const h = this.texture(rel, srgb);
    if (!h) return;
    const apply = (t) => { material[slot] = t; material.needsUpdate = true; };
    if (h.texture) apply(h.texture); else h.waiting.push(apply);
  }

  // ---------------------------------------------------------------- shaping
  // positions (decimetres, base vertex space) for a weight map {targetName: w}
  bake(weights) {
    const pos = new Float32Array(this.basePos);
    for (const [name, w] of Object.entries(weights)) {
      if (!w) continue;
      const t = this.targets.get(name);
      if (!t) continue;
      const k = t.scale * w, idx = t.idx, d = t.d;
      for (let i = 0; i < t.n; i++) { const o = idx[i] * 3; pos[o] += d[i * 3] * k; pos[o + 1] += d[i * 3 + 1] * k; pos[o + 2] += d[i * 3 + 2] * k; }
    }
    return pos;
  }
  // MakeHuman proxy fitting: each proxy vertex is a weighted sum of three base
  // vertices plus an offset scaled by the body's measured proportions
  fit(proxy, pos, out = new Float32Array(proxy.nv * 3)) {
    const s = proxy.scale, sc = [1, 1, 1];
    ['x', 'y', 'z'].forEach((ax, a) => { const q = s?.[ax]; if (q && q[2] > 1e-6) { const k = Math.abs(pos[q[0] * 3 + a] - pos[q[1] * 3 + a]) / q[2]; if (Number.isFinite(k) && k > 0) sc[a] = k; } });
    const r = proxy.refs, w = proxy.w, o = proxy.off;
    for (let i = 0; i < proxy.nv; i++) {
      const a = r[i * 3] * 3, b = r[i * 3 + 1] * 3, c = r[i * 3 + 2] * 3, wa = w[i * 3], wb = w[i * 3 + 1], wc = w[i * 3 + 2];
      for (let k = 0; k < 3; k++) out[i * 3 + k] = wa * pos[a + k] + wb * pos[b + k] + wc * pos[c + k] + o[i * 3 + k] * sc[k];
    }
    return out;
  }

  // ---------------------------------------------------------------- expressions
  // For each mesh type: aFace (vertex → column, -1 none) and a texture of
  // (columns × units) RGBA16F deltas in metres.
  buildExpressionTextures() {
    const units = this.exprNames.map((n) => this.targets.get('expr/' + n));
    const baseDelta = units.map((t) => { const m = new Map(); for (let i = 0; i < t.n; i++) m.set(t.idx[i], [t.d[i * 3] * t.scale * DM, t.d[i * 3 + 1] * t.scale * DM, t.d[i * 3 + 2] * t.scale * DM]); return m; });
    this.exprBaseDelta = baseDelta;
    const make = (nv, deltaOf) => {
      // which vertices move at all
      const cols = new Int32Array(nv).fill(-1);
      const per = [];
      for (let v = 0; v < nv; v++) {
        let any = false; const row = [];
        for (let u = 0; u < units.length; u++) { const d = deltaOf(v, u); row.push(d); if (d && (d[0] || d[1] || d[2])) any = true; }
        if (any) { cols[v] = per.length; per.push(row); }
      }
      const W = Math.max(1, per.length), H = units.length;
      const data = new Float32Array(W * H * 4);
      per.forEach((row, c) => row.forEach((d, u) => { if (d) { const o = (u * W + c) * 4; data[o] = d[0]; data[o + 1] = d[1]; data[o + 2] = d[2]; } }));
      const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      return { cols, tex, W, H };
    };
    // body render vertices map to base vertices
    const bodyCols = make(this.NV, (v, u) => baseDelta[u].get(v));
    this.expr = { body: bodyCols, units: units.length };
    this.exprProxy = {};
    for (const [k, p] of Object.entries(this.proxies)) {
      if (!/^(brow|lash|teeth|tongue)/.test(k)) continue;
      this.exprProxy[k] = make(p.nv, (v, u) => {
        const m = baseDelta[u]; let x = 0, y = 0, z = 0, hit = false;
        for (let j = 0; j < 3; j++) { const d = m.get(p.refs[v * 3 + j]); if (d) { const w = p.w[v * 3 + j]; x += d[0] * w; y += d[1] * w; z += d[2] * w; hit = true; } }
        return hit ? [x, y, z] : null;
      });
    }
  }

  // ---------------------------------------------------------------- regions
  // Masks on the canonical head, in head-local coordinates (decimetres).
  buildRegions() {
    const P = this.basePos, NV = this.NV;
    const jc = (name) => { const b = this.bones[this.boneIndex[name]]; return this.jointPos(b.head, P); };
    const head = jc('head'), eyeL = this.jointPos(this.bones[this.boneIndex['eye.L']].head, P), eyeR = this.jointPos(this.bones[this.boneIndex['eye.R']].head, P);
    const jawB = this.bones[this.boneIndex.jaw];
    const chin = this.jointPos(jawB.tail, P);
    // mouth centre from the lip bones
    const lipHeads = this.bones.filter((b) => /^oris/.test(b.name)).map((b) => this.jointPos(b.head, P));
    const mouth = [0, lipHeads.reduce((a, q) => a + q[1], 0) / lipHeads.length, lipHeads.reduce((a, q) => a + q[2], 0) / lipHeads.length];
    const mouthW = Math.max(...lipHeads.map((q) => Math.abs(q[0]))) || 0.25;
    const eyeY = (eyeL[1] + eyeR[1]) / 2, eyeZ = (eyeL[2] + eyeR[2]) / 2, eyeX = Math.abs(eyeL[0] - eyeR[0]) / 2;
    const faceH = eyeY - chin[1]; // eyes → chin
    this.landmarks = { head, eyeL, eyeR, chin, mouth, eyeY, eyeZ, eyeX, faceH };
    const reg = new Uint8Array(NV * 4), reg2 = new Uint8Array(NV * 4);
    const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    for (let v = 0; v < NV; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const dy = y - eyeY, ax = Math.abs(x);
      const front = ss(eyeZ - faceH * 1.3, eyeZ - faceH * 0.45, z);
      // beard/stubble: from just under the nose to under the chin, cheeks below the cheekbone, in front of the ears
      const lips = ss(1.0, 0.0, Math.hypot(ax / (mouthW * 1.15), (y - mouth[1]) / (faceH * 0.14))) * front;
      const beardY = ss(mouth[1] + faceH * 0.34, mouth[1] + faceH * 0.16, y) * ss(chin[1] - faceH * 0.3, chin[1] + faceH * 0.02, y);
      const beardX = ss(eyeX * 2.3, eyeX * 1.7, ax) * ss(eyeZ - faceH * 1.25, eyeZ - faceH * 0.7, z);
      const cheekLow = ax < mouthW * 1.4 ? 1 : ss(mouth[1] + faceH * 0.45, mouth[1] + faceH * 0.15, y);
      const beard = beardY * beardX * cheekLow;
      const cheek = ss(1.0, 0.0, Math.hypot((ax - eyeX * 1.05) / (faceH * 0.38), (y - (eyeY - faceH * 0.36)) / (faceH * 0.3))) * front;
      const underEye = ss(1.0, 0.0, Math.hypot((ax - eyeX) / (faceH * 0.33), (y - (eyeY - faceH * 0.14)) / (faceH * 0.09))) * front;
      const scalp = ss(eyeY + faceH * 0.45, eyeY + faceH * 0.85, y) + ss(eyeZ - faceH * 0.6, eyeZ - faceH * 1.6, z) * ss(chin[1] + faceH * 0.6, eyeY, y) * ss(eyeX * 1.6, eyeX * 2.2, ax) * 0;
      const tzone = (ss(faceH * 0.3, 0.0, ax) * ss(mouth[1] + faceH * 0.15, mouth[1] + faceH * 0.35, y) * ss(eyeY + faceH * 1.0, eyeY + faceH * 0.6, y)) * front;
      const brow = ss(faceH * 0.18, 0.0, Math.abs(dy - faceH * 0.22)) * ss(eyeX * 1.9, eyeX * 1.3, ax) * front;
      reg[v * 4] = Math.round(Math.min(1, beard * (1 - lips * 0.9)) * 255);
      reg[v * 4 + 1] = Math.round(Math.min(1, cheek) * 255);
      reg[v * 4 + 2] = Math.round(Math.min(1, underEye) * 255);
      reg[v * 4 + 3] = Math.round(Math.min(1, lips) * 255);
      reg2[v * 4] = Math.round(Math.min(1, scalp) * 255);
      void head;
      reg2[v * 4 + 1] = Math.round(Math.min(1, tzone) * 255);
      reg2[v * 4 + 2] = Math.round(Math.min(1, brow) * 255);
      reg2[v * 4 + 3] = this.thickness[v];
    }
    this.regions = reg; this.regions2 = reg2;
  }
  jointPos(list, P) {
    let x = 0, y = 0, z = 0;
    for (const i of list) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
    const n = list.length || 1;
    return [x / n, y / n, z / n];
  }
}
export { DM };
