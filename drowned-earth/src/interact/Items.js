// World items and containers: the things the player can pick up, carry, drop, throw, and take out of crates.
//   - loose items in the world: pooled, drawn as instanced shapes by category (one draw call per shape), with a
//     faint glint on the ones in reach; at most MAX_LOOSE are "awake" (meshed, simulated) near the player, the
//     rest sleep as plain data and wake when you come close
//   - E on an item picks it up; holding E takes everything in reach; a small list of what's in reach
//   - containers (crates, lockers, cupboards, fridges, tills, bodies): owner, lock (none / pick / key), contents
//   - every item and container has an owner (a person id, a shop id, a crew, or null): taking owned things is
//     theft (Crime.js decides who saw it)
//   - world item and container state saves and loads
import * as THREE from 'three';

export const MAX_LOOSE = 40;
const WAKE_R = 30, SLEEP_R = 40;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

// item category from its data (explicit `cat`, else from tags)
export function catOf(def) {
  if (!def) return 'misc';
  if (def.cat) return def.cat;
  const t = def.tags || [];
  for (const [c, keys] of Object.entries({ weapon: ['weapon'], ammo: ['ammo'], food: ['food'], drink: ['drink'], medical: ['medical'], fuel: ['fuel'], key: ['key'], valuable: ['valuable', 'keepsake', 'relic', 'currency'], book: ['book', 'note'], clothing: ['clothing'], tool: ['tool', 'gear', 'repair'], material: ['material', 'salvage'] })) if (keys.some((k) => t.includes(k))) return c;
  return 'misc';
}
// fill in the fields every item needs (data can override any of them)
export function normalizeItems(items) {
  for (const [id, d] of Object.entries(items)) {
    d.id = id; d.cat = catOf(d);
    if (d.weight == null) d.weight = 0.2;
    if (d.value == null) d.value = 1;
    if (d.stackable == null) d.stackable = !['weapon', 'clothing'].includes(d.cat);
    if (d.legal == null) d.legal = (d.tags || []).includes('contraband') ? 'contraband' : 'legal';
  }
  return items;
}

// one shared geometry per shape; one InstancedMesh per shape for all awake items
const SHAPE = { food: 'can', drink: 'bottle', medical: 'box', fuel: 'jerry', ammo: 'box', key: 'key', valuable: 'coin', book: 'book', clothing: 'bundle', tool: 'box', material: 'lump', weapon: 'long', misc: 'box' };
function shapeGeo(kind) {
  switch (kind) {
    case 'can': { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.11, 10); g.translate(0, 0.055, 0); return g; }
    case 'bottle': { const g = new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8); g.translate(0, 0.12, 0); return g; }
    case 'jerry': { const g = new THREE.BoxGeometry(0.22, 0.3, 0.1); g.translate(0, 0.15, 0); return g; }
    case 'key': { const g = new THREE.TorusGeometry(0.025, 0.007, 4, 10); g.rotateX(Math.PI / 2); g.translate(0, 0.008, 0); return g; }
    case 'coin': { const g = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10); g.translate(0, 0.006, 0); return g; }
    case 'book': { const g = new THREE.BoxGeometry(0.16, 0.035, 0.22); g.translate(0, 0.018, 0); return g; }
    case 'bundle': { const g = new THREE.SphereGeometry(0.14, 8, 6); g.scale(1, 0.45, 0.8); g.translate(0, 0.06, 0); return g; }
    case 'lump': { const g = new THREE.DodecahedronGeometry(0.07, 0); g.translate(0, 0.05, 0); return g; }
    case 'long': { const g = new THREE.BoxGeometry(0.06, 0.05, 0.7); g.translate(0, 0.025, 0); return g; }
    default: { const g = new THREE.BoxGeometry(0.16, 0.1, 0.12); g.translate(0, 0.05, 0); return g; }
  }
}
const COLOR = { food: 0x8a7a5a, drink: 0x4f6e64, medical: 0xd8d2c2, fuel: 0x8a2c1e, ammo: 0x5a5244, key: 0x9a8550, valuable: 0xc8a850, book: 0x5a3a2a, clothing: 0x4a4a52, tool: 0x60605a, material: 0x6a5e52, weapon: 0x3a3632, misc: 0x6a625a };

export class Items {
  constructor(ctx) {
    this.ctx = ctx;
    this.defs = normalizeItems(ctx.data.items.items);
    this.loose = [];         // { uid, id, n, x, y, z, ry, owner, stolen, vel?, awake, static }
    this.containers = new Map();   // id → { id, kind, owner, lock: null|{ kind: 'pick'|'key', key, level }, items: {id:n}, stolen: bool, pos: fn|Vector3, label }
    this.uid = 1;
    this.group = new THREE.Group(); this.group.name = 'world-items'; ctx.scene.add(this.group);
    this.meshes = {};
    for (const kind of new Set(Object.values(SHAPE))) {
      const im = new THREE.InstancedMesh(shapeGeo(kind), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: kind === 'coin' || kind === 'key' ? 0.7 : 0.1 }), MAX_LOOSE);
      im.count = 0; im.frustumCulled = false; im.castShadow = false; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LOOSE * 3), 3);
      this.meshes[kind] = im; this.group.add(im);
    }
    // glints: one Points object, a soft additive sparkle on items in reach
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LOOSE * 3), 3));
    this.glint = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xfff2c8, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glint.frustumCulled = false; this.group.add(this.glint);
    this.awake = [];
    this.holdT = 0; this.focus = null; this.t = 0;
    this.buildPopup();
    // the focus item is picked by looking at it; E is handled by Interaction (so containers, NPCs etc. compete fairly)
  }
  def(id) { return this.defs[id]; }
  // ---------------------------------------------------------------- loose items
  drop(id, n = 1, pos, { owner = null, stolen = false, vel = null, ry = Math.random() * 6.28, isStatic = false } = {}) {
    const it = { uid: this.uid++, id, n, x: pos.x, y: pos.y, z: pos.z, ry, owner, stolen, vel: vel ? vel.clone() : null, awake: false, static: isStatic };
    this.loose.push(it);
    return it;
  }
  remove(it) { const i = this.loose.indexOf(it); if (i >= 0) this.loose.splice(i, 1); this.awake = this.awake.filter((a) => a !== it); }
  // items within reach (for the popup and hold-E), nearest first
  inReach(p, r = 2.4) { return this.awake.filter((it) => Math.hypot(it.x - p.x, it.y + 0.3 - p.y, it.z - p.z) < r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); }
  // which item is the player looking at (within 2.4 m, within a narrow cone)
  looked(eye, fwd) {
    let best = null, bs = 0.9;
    for (const it of this.awake) {
      _v.set(it.x - eye.x, it.y + 0.05 - eye.y, it.z - eye.z); const d = _v.length(); if (d > 2.6) continue;
      const s = _v.normalize().dot(fwd) + (1 - d / 2.6) * 0.05;
      if (s > bs) { bs = s; best = it; }
    }
    return best;
  }
  label(it) { const d = this.def(it.id); return `${d?.name || it.id}${it.n > 1 ? ' ×' + it.n : ''}${it.owner ? ' ' + this.ownerTag(it.owner) : ''}`; }
  ownerTag(owner) { return owner === 'player' ? '' : '(not yours)'; }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const c = this.ctx, p = c.player.position;
    this.t += dt;
    // wake the nearest sleeping items, sleep the far ones; never more than MAX_LOOSE awake
    this.wakeT = (this.wakeT || 0) - dt;
    if (this.wakeT <= 0) {
      this.wakeT = 0.4;
      for (const it of this.awake) if (Math.hypot(it.x - p.x, it.z - p.z) > SLEEP_R) { it.awake = false; it.vel = null; }
      this.awake = this.awake.filter((it) => it.awake);
      if (this.awake.length < MAX_LOOSE) {
        const cand = this.loose.filter((it) => !it.awake && Math.hypot(it.x - p.x, it.z - p.z) < WAKE_R).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        for (const it of cand) { if (this.awake.length >= MAX_LOOSE) break; it.awake = true; this.awake.push(it); }
      }
    }
    // simple physics for thrown and dropped items: fall, bounce on whatever is below, float on water, then sleep
    for (const it of this.awake) {
      if (!it.vel) continue;
      it.vel.y -= 9.8 * dt;
      it.x += it.vel.x * dt; it.y += it.vel.y * dt; it.z += it.vel.z * dt;
      const ground = c.collision.groundAt(it.x, it.z, it.y + 0.5), water = c.waves?.height(it.x, it.z) ?? 0;
      const floor = Math.max(ground, water - 0.04);
      if (it.y <= floor) {
        it.y = floor;
        if (floor === ground && Math.abs(it.vel.y) > 2) { it.vel.y *= -0.3; it.vel.x *= 0.5; it.vel.z *= 0.5; c.events.emit('item:thud', { id: it.id, speed: -it.vel.y }); }
        else { it.vel = null; if (floor !== ground) it.floating = true; }
      }
    }
    for (const it of this.awake) if (it.floating) { it.y = (c.waves?.height(it.x, it.z) ?? 0) - 0.03; it.x += 0.05 * dt; }
    this.draw();
    this.updatePopup();
  }
  draw() {
    const count = {};
    const gp = this.glint.geometry.attributes.position; let gi = 0;
    const p = this.ctx.player.position, col = new THREE.Color();
    for (const it of this.awake) {
      const kind = SHAPE[this.def(it.id)?.cat] || 'box', im = this.meshes[kind]; const i = count[kind] || 0; count[kind] = i + 1;
      _e.set(0, it.ry, 0); _m.compose(_v.set(it.x, it.y, it.z), _q.setFromEuler(_e), _s);
      im.setMatrixAt(i, _m); im.setColorAt(i, col.setHex(COLOR[this.def(it.id)?.cat] || COLOR.misc));
      if (Math.hypot(it.x - p.x, it.y - p.y, it.z - p.z) < 3.2) { const tw = 0.7 + 0.3 * Math.sin(this.t * 3 + it.uid); gp.setXYZ(gi++, it.x, it.y + 0.12 + tw * 0.02, it.z); }
    }
    for (const [kind, im] of Object.entries(this.meshes)) { im.count = count[kind] || 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.glint.geometry.setDrawRange(0, gi); gp.needsUpdate = true;
    this.glint.material.opacity = 0.35 + 0.2 * Math.sin(this.t * 2);
  }
  // ---------------------------------------------------------------- containers
  addContainer(c) {
    const rec = { items: {}, owner: null, lock: null, opened: false, ...c };
    this.containers.set(rec.id, rec);
    return rec;
  }
  // ---------------------------------------------------------------- popup: what's in reach
  buildPopup() {
    const el = this.popup = document.createElement('div');
    el.className = 'reach-pop';
    el.style.cssText = 'position:fixed;right:18px;bottom:120px;z-index:21;pointer-events:none;font:13px Georgia;color:#efe5d0;text-shadow:0 1px 3px #000;background:rgba(10,12,12,.45);padding:6px 10px;border-left:2px solid rgba(230,200,140,.6);display:none;max-width:280px';
    document.body.appendChild(el);
  }
  updatePopup() {
    const c = this.ctx;
    if (c.mode !== 'play' || c.ui.open || c.player.mode === 'boat') { this.popup.style.display = 'none'; return; }
    const near = this.inReach(c.player.position, 2.6).slice(0, 6);
    const key = near.map((it) => it.uid + ':' + it.n).join(',');
    if (key === this.popKey) return; this.popKey = key;
    if (!near.length) { this.popup.style.display = 'none'; return; }
    this.popup.style.display = 'block';
    const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    this.popup.innerHTML = near.map((it) => `<div>${esc(this.def(it.id)?.name || it.id)}${it.n > 1 ? ' ×' + it.n : ''}${it.owner && it.owner !== 'player' ? ' <span style="color:#e88a6a">· not yours</span>' : ''}</div>`).join('') + `<div style="opacity:.6;font-size:11px;margin-top:3px">hold ${c.input.usingPad ? '□' : 'E'}: take all</div>`;
  }
  // ---------------------------------------------------------------- save
  toJSON() {
    return { loose: this.loose.filter((it) => !it.static || it.taken).map(({ uid, id, n, x, y, z, ry, owner, stolen }) => ({ uid, id, n, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(2), owner, stolen })), takenStatic: [...(this.takenStatic || [])],
      containers: [...this.containers.values()].filter((c) => c.touched).map((c) => ({ id: c.id, items: c.items, opened: c.opened, unlocked: c.unlocked || false })) };
  }
  load(o) {
    this.loose = this.loose.filter((it) => it.static && !(o?.takenStatic || []).includes(it.sid));
    this.takenStatic = new Set(o?.takenStatic || []);
    for (const it of o?.loose || []) this.loose.push({ ...it, uid: this.uid++, awake: false, vel: null });
    for (const s of o?.containers || []) { const c = this.containers.get(s.id); if (c) Object.assign(c, { items: { ...s.items }, opened: s.opened, unlocked: s.unlocked, touched: true }); else (this.pendingContainers ||= {})[s.id] = s; }
    this.awake = []; for (const it of this.loose) it.awake = false;
  }
}
