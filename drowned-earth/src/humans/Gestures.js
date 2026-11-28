// Procedural work and body-language layers on top of the 15 mocap clips. The clip library has no
// sweeping, carrying, net-mending, fishing, rope-hauling, crossed arms, nodding, laughing or leaning, so
// these are posed here: each layer aims the upper arm and forearm at directions in the person's own body
// frame (+Z forward, +Y up, +X their left) and blends in and out smoothly, so switching never snaps or
// T-poses. Props (seat crate, broom, crate, rod, net, mallet, rope) share one geometry and material each and
// exist only on full-detail people near the player.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _iq = new THREE.Quaternion(), _q0 = new THREE.Quaternion();

const TOUCHED = ['root', 'spine02', 'spine03', 'neck01', 'head', 'clavicle.L', 'clavicle.R', 'upperarm01.L', 'upperarm01.R', 'lowerarm01.L', 'lowerarm01.R'];

// which layer an activity wants, and whether it sits
export const LAYER_FOR = {
  sweep: 'sweep', carry: 'carry', mend: 'mend', fish: 'fish', haul: 'haul', hammer: 'hammer', repair: 'hammer',
  crossed: 'crossed', lean: 'lean', watch: 'lean', nod: 'nod', laugh: 'laugh', cook: 'stir', stir: 'stir', give: 'give',
  sit: 'sitHands', sitTalk: null, laundry: 'mend', ears: 'ears', listen: 'nod',
};
export const SITS = new Set(['sit', 'fish', 'mend', 'sitTalk']);

let P = null;   // shared prop geometry/materials
function props() {
  if (P) return P;
  const M = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const wood = M(0x6b5238), dark = M(0x3b3128), rope = M(0x8a7a55, 0.95);
  const crate = new THREE.BoxGeometry(1, 1, 1); crate.translate(0, 0.5, 0);
  const stick = new THREE.CylinderGeometry(0.016, 0.016, 1, 6); stick.translate(0, 0.5, 0); stick.rotateX(Math.PI / 2);  // along +Z, 1 m
  const bristle = new THREE.BoxGeometry(0.32, 0.05, 0.1);
  const rod = new THREE.CylinderGeometry(0.006, 0.014, 2.4, 5); rod.translate(0, 1.2, 0); rod.rotateX(Math.PI / 2);
  const net = new THREE.PlaneGeometry(0.7, 0.5, 4, 3); net.rotateX(-Math.PI / 2);
  const netMat = new THREE.MeshStandardMaterial({ color: 0x75705a, roughness: 1, wireframe: true });
  P = { wood, dark, rope, crate, stick, bristle, rod, net, netMat };
  return P;
}

// rotate a bone by a world-space rotation R
function applyWorld(bone, R) {
  bone.parent.getWorldQuaternion(_pq);
  _iq.copy(_pq).invert();
  bone.quaternion.premultiply(_pq).premultiply(R).premultiply(_iq);
  bone.updateMatrixWorld(true);
}
// turn `bone` so the segment bone→tip points along `dirBody` (body frame), by weight w
function aim(bone, tip, dirBody, w, rootQ) {
  if (!bone || !tip || w < 0.01) return;
  bone.getWorldPosition(_a); tip.getWorldPosition(_b);
  const cur = _c.subVectors(_b, _a).normalize();
  const want = _d.copy(dirBody).normalize().applyQuaternion(rootQ);
  _q.setFromUnitVectors(cur, want);
  _q.slerp(_q0.identity(), 1 - w);
  applyWorld(bone, _q);
}

export class Gestures {
  constructor(person) {
    this.p = person; this.w = {}; this.want = null; this.t = person.rnd() * 10; this.props = {};
    this.fidgetT = 6 + person.rnd() * 12; this.fidget = 0;
  }
  set(layer) { this.want = layer; }
  // Bones the clips don't animate keep whatever we did to them last frame, so every procedural offset
  // (ours and the breathing/sway in Person) would pile up frame after frame. Snapshot the pose right after
  // the mixer runs, put it back before the next mixer update.
  snapshot() {
    const b = this.p.human.bone, s = this.saved || (this.saved = []);
    if (!s.length) for (const n of TOUCHED) if (b[n]) s.push([b[n], b[n].quaternion.clone(), b[n].position.clone()]);
    else for (const r of s) { r[1].copy(r[0].quaternion); r[2].copy(r[0].position); }
    this.snapped = true;
  }
  restore() { if (!this.snapped) return; for (const [bone, q, p] of this.saved) { bone.quaternion.copy(q); bone.position.copy(p); } this.snapped = false; }
  // body-frame direction helper
  static v(x, y, z) { return new THREE.Vector3(x, y, z); }
  update(dt, detail) {
    const p = this.p, b = p.human.bone; this.t += dt;
    // blend every layer toward 1 (wanted) or 0 (not), ~0.35 s either way
    const k = 1 - Math.exp(-dt * 6);
    if (this.want && this.w[this.want] == null) this.w[this.want] = 0;
    for (const n of Object.keys(this.w)) {
      this.w[n] += ((n === this.want ? 1 : 0) - this.w[n]) * k;
      if (this.w[n] < 0.005 && n !== this.want) delete this.w[n];
    }
    p.root.updateMatrixWorld(true);
    const rootQ = p.root.getWorldQuaternion(_rq);
    const t = this.t;
    const arms = (s, up, fore, w) => {
      const L = s > 0 ? '.L' : '.R';
      aim(b['upperarm01' + L], b['lowerarm01' + L], up, w, rootQ);
      aim(b['lowerarm01' + L], b['wrist' + L], fore, w, rootQ);
    };
    const V = (x, y, z) => _e.set(x, y, z).clone();
    for (const [n, w] of Object.entries(this.w)) {
      switch (n) {
        case 'crossed':   // arms folded across the chest
          arms(1, V(0.22, -0.85, 0.42), V(-0.95, 0.12, 0.28), w); arms(-1, V(-0.22, -0.85, 0.46), V(0.95, 0.18, 0.22), w); break;
        case 'lean':      // weight on one hip, one arm across, the other hanging — a lookout's slouch
          if (b.spine02) b.spine02.rotateZ(0.06 * w);
          if (b.root) b.root.position.x += 0.035 * w;
          arms(1, V(0.2, -0.85, 0.45), V(-0.9, 0.15, 0.35), w * 0.9); break;
        case 'sweep': {   // short strokes side to side, hands low on a broom
          const s = Math.sin(t * 2.6);
          if (b.spine03) b.spine03.rotateY(s * 0.12 * w);
          arms(1, V(0.08 + s * 0.15, -0.8, 0.55), V(-0.15 + s * 0.3, -0.65, 0.7), w);
          arms(-1, V(-0.12 + s * 0.15, -0.9, 0.4), V(0.1 + s * 0.3, -0.75, 0.6), w);
          break;
        }
        case 'carry':     // a crate held against the chest
          arms(1, V(0.18, -0.8, 0.55), V(-0.2, 0.1, 0.97), w); arms(-1, V(-0.18, -0.8, 0.55), V(0.2, 0.1, 0.97), w);
          if (b.spine03) b.spine03.rotateX(-0.06 * w); break;
        case 'haul': {    // hand over hand on a rope, leaning back into it
          const c = Math.sin(t * 2.2), c2 = Math.sin(t * 2.2 + Math.PI);
          if (b.spine02) b.spine02.rotateX(-0.12 * w);
          arms(1, V(0.12, -0.35 + 0.3 * c, 0.9), V(0.0, -0.1 + 0.25 * c, 1), w);
          arms(-1, V(-0.12, -0.35 + 0.3 * c2, 0.9), V(0.0, -0.1 + 0.25 * c2, 1), w); break;
        }
        case 'mend': {    // seated, net across the lap, small knotting movements
          const j = Math.sin(t * 5.1) * 0.08, j2 = Math.sin(t * 4.3 + 1) * 0.08;
          arms(1, V(0.15, -0.85, 0.45), V(-0.3 + j, -0.35, 0.85), w); arms(-1, V(-0.15, -0.85, 0.45), V(0.3 + j2, -0.35, 0.85), w); break;
        }
        case 'fish':      // seated, rod held out over the water, the odd twitch
          arms(-1, V(-0.15, -0.6, 0.75), V(0.05, 0.05 + Math.max(0, Math.sin(t * 0.7)) ** 30 * 0.4, 1), w);
          arms(1, V(0.15, -0.85, 0.4), V(-0.4, -0.3, 0.85), w); break;
        case 'hammer': {  // the kneeling clip already works; give it a striking rhythm
          const h = Math.max(0, Math.sin(t * 4)) ** 2;
          arms(-1, V(-0.2, -0.5 + h * 0.6, 0.8), V(0, -0.6 + h * 1.0, 0.75), w * 0.85); break;
        }
        case 'stir':      // one hand circling a pot
          arms(-1, V(-0.15, -0.75, 0.6), V(Math.cos(t * 3) * 0.3, -0.5, 0.8 + Math.sin(t * 3) * 0.2), w * 0.85); break;
        case 'give':      // a hand held out with something in it
          arms(-1, V(-0.1, -0.45, 0.88), V(0, 0.05, 1), w); break;
        case 'sitHands':  // seated at rest: forearms on the thighs
          arms(1, V(0.12, -0.8, 0.55), V(-0.15, -0.5, 0.85), w * 0.8); arms(-1, V(-0.12, -0.8, 0.55), V(0.15, -0.5, 0.85), w * 0.8); break;
        case 'ears':      // a bang close by: hands up over the ears, head ducked
          arms(1, V(0.75, 0.45, 0.2), V(-0.35, 0.9, -0.1), w); arms(-1, V(-0.75, 0.45, 0.2), V(0.35, 0.9, -0.1), w);
          if (b.head) b.head.rotateX(0.15 * w); break;
        case 'nod':       // listening: small slow nods
          if (b.head) b.head.rotateX(Math.max(0, Math.sin(t * 3.1)) * 0.12 * w * (0.5 + 0.5 * Math.sin(t * 0.7))); break;
        case 'laugh': {   // shoulders and chest shake, head tips back
          const s = Math.sin(t * 22) * Math.max(0, Math.sin(t * 1.3));
          if (b.spine03) b.spine03.rotateX(s * 0.03 * w);
          if (b['clavicle.L']) b['clavicle.L'].rotateZ(s * 0.04 * w);
          if (b['clavicle.R']) b['clavicle.R'].rotateZ(-s * 0.04 * w);
          if (b.head) b.head.rotateX(-0.12 * w);
          break;
        }
      }
    }
    // small fidgets so nobody stands like a statue: a shoulder roll or a shift of weight every so often
    this.fidgetT -= dt;
    if (this.fidgetT < 0) { this.fidgetT = 7 + p.rnd() * 14; this.fidget = 1; this.fidgetKind = p.rnd() < 0.5 ? 0 : 1; }
    if (this.fidget > 0) {
      this.fidget = Math.max(0, this.fidget - dt * 0.8);
      const f = Math.sin((1 - this.fidget) * Math.PI);
      if (this.fidgetKind === 0) { if (b['clavicle.L']) b['clavicle.L'].rotateZ(f * 0.07); if (b['clavicle.R']) b['clavicle.R'].rotateZ(-f * 0.05); }
      else if (b.root && /Idle|Talking|Torch/.test(p.currentName || '')) b.root.position.x += f * 0.03;
    }
    this.updateProps(detail);
  }
  // world-space props live in whatever scene the person is in (the game's, or the character viewer's)
  top() { let o = this.p.root; while (o.parent) o = o.parent; return o; }
  // props: only for full-detail people; a missing prop is never worse than a floating one
  prop(name, make) { return this.props[name] || (this.props[name] = make()); }
  updateProps(detail) {
    const p = this.p, b = p.human.bone, show = (n, on) => { if (this.props[n]) this.props[n].visible = on; };
    const w = this.w, on = (n) => detail && (w[n] || 0) > 0.5;
    // the seat goes under the hips, its top just below them, wherever the sitting clip puts them
    if (detail && p.sitting) {
      const seat = this.prop('seat', () => { const m = new THREE.Mesh(props().crate, props().wood); m.castShadow = true; p.root.add(m); return m; });
      const hips = b.pelvis_L || b['pelvis.L'];
      if (hips) {
        p.root.updateMatrixWorld(true);
        const hl = p.root.worldToLocal(b['pelvis.L'].getWorldPosition(_a).add(b['pelvis.R'].getWorldPosition(_b)).multiplyScalar(0.5));
        const hy = Math.max(0.25, hl.y - 0.1);
        seat.position.set(hl.x, 0, hl.z - 0.04); seat.scale.set(0.46, hy, 0.4);
      }
      seat.visible = true;
    } else show('seat', false);
    // broom from the hands to the deck ahead
    if (on('sweep')) {
      const br = this.prop('broom', () => { const g = new THREE.Group(); const h = new THREE.Mesh(props().stick, props().wood); const bb = new THREE.Mesh(props().bristle, props().dark); g.add(h, bb); g.userData = { h, bb }; this.top().add(g); return g; });
      const top = b['wrist.R'].getWorldPosition(_a), foot = p.root.localToWorld(_b.set(Math.sin(this.t * 2.6) * 0.25, 0.03, 0.75));
      const len = top.distanceTo(foot);
      br.position.copy(top); br.lookAt(foot);
      br.userData.h.scale.set(1, 1, len + 0.1); br.userData.bb.position.set(0, 0, len); br.userData.bb.rotation.set(Math.PI / 2, 0, 0);
      br.visible = true;
    } else show('broom', false);
    // crate between the hands
    if (on('carry')) {
      const cr = this.prop('crate', () => { const m = new THREE.Mesh(props().crate, props().wood); m.scale.set(0.42, 0.3, 0.32); m.castShadow = true; this.top().add(m); return m; });
      b['wrist.L'].getWorldPosition(_a); b['wrist.R'].getWorldPosition(_b);
      cr.position.addVectors(_a, _b).multiplyScalar(0.5); cr.position.y -= 0.12;
      cr.quaternion.copy(p.root.getWorldQuaternion(_rq)); cr.visible = true;
    } else show('crate', false);
    // fishing rod in the right hand, out over the water
    if (on('fish')) {
      const rd = this.prop('rod', () => { const m = new THREE.Mesh(props().rod, props().dark); this.top().add(m); return m; });
      b['wrist.R'].getWorldPosition(_a); rd.position.copy(_a);
      rd.lookAt(p.root.localToWorld(_b.set(0.2, 2.0, 2.4))); rd.visible = true;
    } else show('rod', false);
    // net over the lap
    if (on('mend') && p.sitting) {
      const nt = this.prop('net', () => { const m = new THREE.Mesh(props().net, props().netMat); p.root.add(m); return m; });
      const hl = p.root.worldToLocal(b['wrist.L'].getWorldPosition(_a).add(b['wrist.R'].getWorldPosition(_b)).multiplyScalar(0.5));
      nt.position.set(hl.x, hl.y - 0.08, hl.z); nt.visible = true;
    } else show('net', false);
    // rope from the hands, running forward and down to a cleat
    if (on('haul')) {
      const rp = this.prop('rope', () => { const m = new THREE.Mesh(props().stick, props().rope); this.top().add(m); return m; });
      b['wrist.L'].getWorldPosition(_a); const end = p.root.localToWorld(_b.set(0, 0.2, 3.2));
      rp.position.copy(_a); rp.lookAt(end); rp.scale.set(1.2, 1.2, _a.distanceTo(end) + 0.6); rp.visible = true;
    } else show('rope', false);
  }
  dispose() { for (const m of Object.values(this.props)) m.removeFromParent(); this.props = {}; }
}
