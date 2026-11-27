import * as THREE from 'three';
import { Human } from './Human.js';
import { retargetClips } from './Retarget.js';
import { CLIP_FOR } from '../ai/Characters.js';

// A Human that moves: retargeted clips, cross-fades, speed-matched walking,
// and procedural layers on top so nobody moves like a robot — breathing that
// lifts the chest and shoulders, a personal head tilt and shoulder set,
// idle weight shifts, head/neck look-at, and the living face.
const clipCache = new Map(); // sex → clips
const KEEP = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Idle_Talking_Loop', 'Fixing_Kneeling', 'Interact', 'PickUp_Table', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Torch_Loop', 'Push_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Crouch_Idle_Loop', 'Driving_Loop'];

export class Person {
  constructor(ctx, kit, params) {
    this.ctx = ctx;
    this.p = params;
    this.human = new Human(kit, params, { settings: ctx.settings });
    this.root = this.human.root;
    const sexKey = params.sex > 0.5 ? 'm' : 'f';
    if (!clipCache.has(sexKey)) {
      const lib = ctx.assets.characters.animations;
      clipCache.set(sexKey, lib ? retargetClips(lib, this.human, KEEP) : {});
    }
    this.clips = clipCache.get(sexKey);
    this.mixer = new THREE.AnimationMixer(this.human.body);
    this.actions = {};
    this.current = null;
    let s = params.seed || 1; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.tilt = (this.rnd() - 0.5) * 0.08;      // carries the head a little to one side
    this.shoulder = (this.rnd() - 0.5) * 0.06;  // one shoulder sits lower
    this.breathRate = 0.22 + this.rnd() * 0.08;
    this.phase = this.rnd() * 10;
    this.look = new THREE.Vector2();
    this.play('idle', 0);
    this.mixer.setTime(this.rnd() * 4);
    this.addWristband(params.tier ?? 7);
  }
  // Standing shows on the wrist: band colour by tier, tally marks for dives
  addWristband(tier) {
    const col = this.ctx.data?.standing?.tiers?.[tier]?.wristband || '#b33a32';
    const wrist = this.human.bone['wrist.L'];
    if (!wrist) return;
    const kit = this.human.kit;
    const i = kit.boneIndex['lowerarm02.L'] ?? kit.boneIndex['lowerarm01.L'];
    const h = this.human.restHeads[kit.boneIndex['wrist.L']], t = this.human.restHeads[i];
    const dir = new THREE.Vector3(t[0] - h[0], t[1] - h[1], t[2] - h[2]).normalize();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 24), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    band.position.copy(dir).multiplyScalar(0.035);
    band.scale.set(1, 0.85, 1.6);
    band.castShadow = true;
    wrist.add(band);
    this.band = band;
  }
  action(name) {
    if (!this.actions[name]) { const c = this.clips[name]; if (!c) return null; this.actions[name] = this.mixer.clipAction(c); }
    return this.actions[name];
  }
  play(activity, fade = 0.4) {
    const name = CLIP_FOR[activity] || activity;
    if (this.currentName === name) return;
    const next = this.action(name) || this.action('Idle_Loop');
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false); else if (this.current) this.current.stop();
    this.current = next; this.currentName = name;
  }
  // walking clips are matched to ground speed so feet don't slide
  setSpeed(mps) { if (this.current && /Walk|Jog/.test(this.currentName)) this.current.timeScale = mps / (/Jog/.test(this.currentName) ? 3.0 : 1.25); else if (this.current) this.current.timeScale = 1; }
  say(text, duration) { this.human.face.say(text, duration); this.play('talk'); }
  update(dt, lookAt = null) {
    this.phase += dt;
    this.mixer.update(dt);
    const b = this.human.bone;
    // breathing: chest and shoulders rise, a slower deeper breath now and then
    const br = Math.sin(this.phase * Math.PI * 2 * this.breathRate) * (1 + 0.5 * Math.max(0, Math.sin(this.phase * 0.13)));
    if (b.spine03) b.spine03.rotateX(-br * 0.012);
    if (b['clavicle.L']) b['clavicle.L'].rotateZ(br * 0.01 + this.shoulder);
    if (b['clavicle.R']) b['clavicle.R'].rotateZ(-br * 0.01);
    // idle sway: weight drifts from foot to foot
    if (b.root && /Idle|Talking|Torch/.test(this.currentName || '')) b.root.position.x += Math.sin(this.phase * 0.31) * 0.012;
    // aim the face: rotate (in world space) from where the animation points the
    // head to where the target is; neck takes 40 %, head 60 %, capped at ~65°.
    // Without a target the head is lifted slightly (the clips look a bit down).
    if (b.neck01 && b.head) {
      this.root.updateMatrixWorld(true);
      const hq = b.head.getWorldQuaternion(_q1);
      const fwd = _f.set(0, 0, 1).applyQuaternion(hq);
      let want;
      if (lookAt) {
        want = _w.copy(lookAt).sub(b.head.getWorldPosition(_v)).normalize();
        const rootFwd = _r.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q2));
        if (want.dot(rootFwd) < -0.2) want = null; // behind them: don't twist round
      }
      if (!want) want = _w.copy(fwd).setY(fwd.y + 0.12).normalize();
      this.aim = this.aim || new THREE.Vector3().copy(fwd);
      this.aim.lerp(want, 1 - Math.exp(-dt * 4)).normalize();
      const full = _q3.setFromUnitVectors(fwd, this.aim);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(full.w)));
      const capped = ang > 1.15 ? _q3.slerp(_qi, 1 - 1.15 / ang) : full;
      const neckPart = _q4.identity().slerp(capped, 0.4), headPart = _q5.identity().slerp(capped, 0.6);
      // apply world-space rotations to the bones' local frames
      applyWorld(b.neck01, neckPart);
      this.root.updateMatrixWorld(true);
      applyWorld(b.head, headPart);
      b.head.rotateZ(this.tilt + Math.sin(this.phase * 0.23) * 0.015);
    }
    this.human.face.look(lookAt);
    this.human.update(dt, { lightLevel: this.ctx.lightLevel ?? 0.6 });
  }
  dispose() { this.mixer.stopAllAction(); this.human.dispose(); }
}
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _pq = new THREE.Quaternion();
// rotate a bone by a world-space rotation: local' = parentWorld⁻¹ · R · parentWorld · local
function applyWorld(bone, R) {
  bone.parent.getWorldQuaternion(_pq);
  const inv = _q1.copy(_pq).invert();
  bone.quaternion.premultiply(_q2.copy(_pq)).premultiply(R).premultiply(inv);
}
