import * as THREE from 'three';
import { BODIES as BASIC } from './species.js';
import { quadruped, gullModel, needlefishGeometry, needlefishMaterial, SILTWOLF, GULLRAT } from './Models.js';
import { buildJelly } from './Jelly.js';
import { spikeGeometry, bloomCluster, setBloomGlow, attachAtVertex, pickVertices, tickGrowths, weed, mutantMaterial, spike, barnacles, glowEye } from './Mutate.js';
import { Person } from '../humans/Person.js';
import { generatePerson } from '../humans/Roster.js';
import { extraArms, deadSkin } from './HumanMutate.js';

// Model-based bodies. Behaviour (move / attack / onState) is the species'
// own, unchanged, from species.js; only what you see is replaced here.
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const angTo = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };
const quality = (mgr) => mgr.ctx.settings.quality; // low | medium | high

// state → clip, for the quadruped rigs
function quadClip(state, speed, near) {
  if (state === 'attack') return near ? ['Attack', 1.2] : speed > 2.2 ? ['Gallop', Math.min(1.8, speed / 6)] : ['Walk', Math.max(0.6, speed / 1.3)];
  if (speed > 2.2) return ['Gallop', Math.min(1.8, speed / 6)];
  if (speed > 0.25) return ['Walk', Math.max(0.5, speed / 1.3)];
  if (state === 'warning') return ['Idle_2_HeadLow', 1];
  if (state === 'alert') return ['Idle_2', 0.8];
  return ['Idle', 1];
}

// ---------------------------------------------------------------- siltwolves
function siltwolf(mgr, c) {
  const base = BASIC.siltwolf(mgr, c);
  const lib = mgr.ctx.creatureModels;
  const q = quality(mgr);
  const group = new THREE.Group();
  const pack = Array.from({ length: c.spec.count || 3 }, (_, i) => {
    const m = quadruped(lib, { ...SILTWOLF, levels: q === 'low' ? 0 : 2, shells: q === 'high' ? 5 : q === 'medium' ? 2 : 0, scale: SILTWOLF.scale * (i === 0 ? 1.08 : 0.93 + i * 0.03) });
    group.add(m.root);
    m.anim.play('Idle', 0); m.anim.mixer.setTime(i * 1.3);
    return { ...m, off: new THREE.Vector3(Math.cos(i * 2.1) * 2.2, 0, Math.sin(i * 2.1) * 2.2), p: new THREE.Vector3(), h: 0, speed: 0 };
  });
  // the den: picked bones and two pups
  const den = new THREE.Group();
  const boneM = new THREE.MeshStandardMaterial({ color: 0x8f846c, roughness: 0.75 });
  boneM.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position;');
    sh.fragmentShader = 'varying vec3 vP;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.55 + 0.45 * fract(sin(dot(floor(vP * 180.0), vec3(12.9, 78.2, 37.7))) * 43758.5) * 0.6 + 0.25 * sin(vP.y * 90.0);');
  };
  for (let i = 0; i < 14; i++) {
    // gnawed long bones and rib arcs: thin, broken, half-buried in the silt
    let geo;
    if (i % 3 === 0) { geo = new THREE.TorusGeometry(0.11 + Math.random() * 0.05, 0.006, 4, 12, 1.6 + Math.random()); }
    else {
      const L = 0.1 + Math.random() * 0.16, r = 0.007 + Math.random() * 0.005, broken = Math.random() < 0.5;
      const prof = []; for (let k = 0; k <= 10; k++) { const t = k / 10; const end = Math.exp(-((t - 0.02) ** 2) * 900) * 0.7 + (broken ? 0 : Math.exp(-((t - 0.98) ** 2) * 900) * 0.6); prof.push(new THREE.Vector2(r * (1 + end) * (1 + 0.15 * Math.sin(t * 19)), t * L)); }
      geo = new THREE.LatheGeometry(prof, 6);
    }
    const b = new THREE.Mesh(geo, boneM);
    b.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, Math.random() * 6.28);
    b.position.set((Math.random() - 0.5) * 1.8, -0.004, (Math.random() - 0.5) * 1.8);
    b.castShadow = true; den.add(b);
  }
  // a scrape of silt and matted fur where they sleep
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x2a261e, roughness: 1, transparent: true, depthWrite: false, alphaMap: denStain() }));
  bed.rotation.x = -Math.PI / 2; bed.position.y = 0.008; den.add(bed);
  // a skull-like curl of spine: vertebrae from the spike profile
  const pups = [0, 1].map((i) => { const m = quadruped(lib, { ...SILTWOLF, mutate: null, levels: q === 'low' ? 0 : 1, shells: 0, scale: SILTWOLF.scale * 0.42, eyeR: 0.05 }); m.root.position.set(i ? 0.5 : -0.3, 0, i ? -0.3 : 0.4); m.anim.play(i ? 'Idle' : 'Eating', 0); den.add(m.root); return m; });
  group.add(den);
  return {
    group,
    focus: () => _v.copy(pack[0].root.position).setY(pack[0].root.position.y + 0.55),
    move(cc, dt) { base.move(cc, dt); },
    attack: base.attack,
    onState: base.onState,
    animate(cc, dt) {
      den.position.copy(cc.home);
      const p = (c.prey ? c.prey.pos : mgr.ctx.player.position);
      const t = cc.t;
      pack.forEach((w, i) => {
        const roofK = Math.min(1, (cc.roofR ?? 99) / 4);
        const circ = t * 0.6 + i * 2.1;
        const tx = cc.pos.x + (cc.state === 'warning' ? Math.cos(circ) * 2.4 * roofK : w.off.x * roofK), tz = cc.pos.z + (cc.state === 'warning' ? Math.sin(circ) * 2.4 * roofK : w.off.z * roofK);
        if (Math.hypot(tx - w.p.x, tz - w.p.z) > 12) w.p.set(tx, cc.pos.y, tz); // first sight: start in place
        const ox = w.p.x, oz = w.p.z;
        w.p.x += (tx - w.p.x) * Math.min(1, dt * 3); w.p.z += (tz - w.p.z) * Math.min(1, dt * 3); w.p.y = cc.pos.y;
        const vx = w.p.x - ox, vz = w.p.z - oz;
        w.speed += (Math.hypot(vx, vz) / Math.max(dt, 1e-3) - w.speed) * Math.min(1, dt * 6);
        // face where it's going; when watching you, face you
        const look = cc.state === 'idle' || cc.state === 'return' ? (w.speed > 0.2 ? Math.atan2(vx, vz) : w.h) : Math.atan2(p.x - w.p.x, p.z - w.p.z);
        w.h += angTo(w.h, look) * Math.min(1, dt * 4);
        w.root.position.copy(w.p); w.root.rotation.y = w.h;
        const near = w.p.distanceTo(p) < 2.4;
        const [clip, sp] = quadClip(cc.state, w.speed, near);
        w.anim.play(clip, 0.35, { speed: sp });
        w.anim.update(dt * (cc.state === 'warning' ? 0.85 : 1));
        // when it watches you, the head follows you
        if (cc.state !== 'idle' && cc.state !== 'return') {
          const want = Math.max(-0.9, Math.min(0.9, angTo(w.h, Math.atan2(p.x - w.p.x, p.z - w.p.z))));
          w.look = (w.look || 0) + (want - (w.look || 0)) * Math.min(1, dt * 5);
          w.root.updateMatrixWorld(true);
          w.anim.turnBone(w.neck ||= w.skeleton.bones.find((b) => b.name === 'Neck2'), w.look * 0.45);
          w.anim.turnBone(w.headB ||= w.skeleton.bones.find((b) => b.name === 'Head'), w.look * 0.55);
        } else w.look = 0;
        // warning: crouch, head low; the glow comes up in its veins
        w.root.position.y -= cc.state === 'warning' ? 0.05 : 0;
        w.setGlow(cc.state === 'attack' ? 1 : cc.state === 'warning' ? 0.6 : cc.state === 'alert' ? 0.2 : 0);
        w.mat.userData.u.uTime.value = t;
        const close = w.p.distanceTo(mgr.ctx.camera.position) < 14;
        for (const s of w.shells) s.visible = close;
      });
      for (const pp of pups) pp.anim.update(dt);
      tickGrowths(t);
    },
  };
}

// ---------------------------------------------------------------- gullrats
function gullrat(mgr, c) {
  const base = BASIC.gullrat(mgr, c), q = quality(mgr);
  const lib = mgr.ctx.creatureModels;
  const n = c.spec.count || 16;
  const nRats = Math.min(9, Math.ceil(n * 0.6)), nGulls = Math.min(5, n - Math.ceil(n * 0.6));
  const group = new THREE.Group();
  const members = [];
  for (let i = 0; i < nRats + nGulls; i++) {
    const gull = i >= nRats;
    const m = gull ? gullModel(lib) : quadruped(lib, { ...GULLRAT, levels: q === 'low' ? 0 : 1, shells: 0, scale: GULLRAT.scale * (0.85 + Math.random() * 0.3), mutate: i % 3 === 0 ? GULLRAT.mutate : null });
    if (!m) continue;
    group.add(m.root);
    m.anim.play('Idle', 0); m.anim.mixer.setTime(Math.random() * 3);
    members.push({ ...m, gull, off: new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3), p: new THREE.Vector3(), ph: Math.random() * 6.28, h: Math.random() * 6, y: 0, speed: 0 });
  }
  return {
    group,
    focus: () => _v.copy(members[0].root.position).setY(members[0].root.position.y + 0.1),
    move: base.move, attack: base.attack, onState: base.onState,
    animate(cc, dt) {
      group.visible = cc.awake;
      if (!cc.awake) return;
      const agitated = cc.state === 'attack' || cc.state === 'warning';
      const pl = (c.prey ? c.prey.pos : mgr.ctx.player.position);
      for (const m of members) {
        m.ph += dt * (agitated ? 4 : 1);
        const r = agitated ? 0.9 : 1.6;
        const tx = cc.pos.x + m.off.x * r + Math.sin(m.ph) * 0.4, tz = cc.pos.z + m.off.z * r + Math.cos(m.ph * 1.3) * 0.4;
        if (Math.hypot(tx - m.p.x, tz - m.p.z) > 12) m.p.set(tx, cc.pos.y, tz);
        const ox = m.p.x, oz = m.p.z;
        m.p.x += (tx - m.p.x) * Math.min(1, dt * (agitated ? 5 : 1.5)); m.p.z += (tz - m.p.z) * Math.min(1, dt * (agitated ? 5 : 1.5));
        const vx = m.p.x - ox, vz = m.p.z - oz;
        m.speed += (Math.hypot(vx, vz) / Math.max(dt, 1e-3) - m.speed) * Math.min(1, dt * 6);
        const look = agitated && !m.gull ? Math.atan2(pl.x - m.p.x, pl.z - m.p.z) : m.speed > 0.05 ? Math.atan2(vx, vz) : m.h;
        m.h += angTo(m.h, look) * Math.min(1, dt * 6);
        if (m.gull) {
          // gulls lift off and wheel when the swarm is up
          const wantY = agitated ? 3.2 + Math.sin(m.ph * 0.7) * 0.8 : 0; // wheel overhead, out of reach
          m.y += (wantY - m.y) * Math.min(1, dt * 2);
          m.anim.play(agitated ? 'Run' : m.speed > 0.1 ? 'Walk' : 'Idle', 0.25, { speed: agitated ? 1.6 : 1 });
        } else m.anim.play(agitated && m.p.distanceTo(pl) < 0.8 ? 'Attack' : m.speed > 1.2 ? 'Gallop' : m.speed > 0.08 ? 'Walk' : m.ph % 6 < 2 ? 'Eating' : 'Idle', 0.2, { speed: m.speed > 1.2 ? 2.2 : 1.6 });
        m.root.position.set(m.p.x, cc.pos.y + (m.gull ? m.y : 0), m.p.z);
        m.root.rotation.y = m.h;
        m.anim.update(dt);
        if (!m.gull) m.setGlow?.(agitated ? 0.8 : 0.1);
      }
    },
  };
}

// ---------------------------------------------------------------- needlefish
function needlefish(mgr, c) {
  const base = BASIC.needlefish(mgr, c);
  const geo = needlefishGeometry(mgr.ctx.creatureModels);
  if (!geo) return base;
  const n = c.spec.count || 40;
  const mat = needlefishMaterial();
  const fish = new THREE.InstancedMesh(geo, mat, n);
  fish.frustumCulled = false; fish.castShadow = false;
  const group = new THREE.Group(); group.add(fish);
  const m = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), ph: Math.random() * 6.28, r: 0.6 + Math.random() * 2.4, y: Math.random(), s: 0.016 + Math.random() * 0.006, h: 0 }));
  return {
    group, move: base.move, attack: base.attack, onState: base.onState,
    animate(cc, dt) {
      const frenzy = cc.state === 'attack' ? 1 : cc.state === 'warning' ? 0.5 : 0;
      group.visible = (cc.perceived?.d ?? 99) < 60;
      mat.userData.u.uT.value += dt; mat.userData.u.uFrenzy.value += (frenzy - mat.userData.u.uFrenzy.value) * Math.min(1, dt * 3);
      m.forEach((f, i) => {
        f.ph += dt * (0.8 + frenzy * 3) * (0.8 + (i % 5) * 0.08);
        const r = f.r * (1 - frenzy * 0.5);
        const tx = cc.pos.x + Math.cos(f.ph) * r, tz = cc.pos.z + Math.sin(f.ph) * r, ty = cc.pos.y + (f.y - 0.5) * (0.8 + frenzy);
        if (Math.hypot(tx - f.p.x, tz - f.p.z) > 12) f.p.set(tx, ty, tz);
        const ox = f.p.x, oz = f.p.z, oy = f.p.y;
        f.p.set(f.p.x + (tx - f.p.x) * Math.min(1, dt * 4), f.p.y + (ty - f.p.y) * Math.min(1, dt * 4), f.p.z + (tz - f.p.z) * Math.min(1, dt * 4));
        const dx = f.p.x - ox, dz = f.p.z - oz;
        if (Math.hypot(dx, dz) > 1e-5) f.h += angTo(f.h, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
        _q.setFromEuler(new THREE.Euler(-Math.atan2(f.p.y - oy, Math.hypot(dx, dz) + 1e-4) * 0.5, f.h, 0, 'YXZ'));
        _m.compose(f.p, _q, _s.setScalar(f.s));
        fish.setMatrixAt(i, _m);
      });
      fish.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- net-weaver
function netweaver(mgr, c) {
  const jelly = buildJelly({ radius: 1.5, threads: c.spec.threads || 4.5 });
  let flare = 0;
  return {
    group: jelly.group,
    move: BASIC.netweaver(mgr, c).move,
    attack() {},
    animate(cc, dt) {
      const p = (c.prey ? c.prey.pos : mgr.ctx.player.position);
      const want = cc.state === 'attack' ? 1 : cc.state === 'warning' ? 0.6 : cc.state === 'alert' ? 0.25 : 0;
      flare += (want - flare) * Math.min(1, dt * 3);
      jelly.group.position.copy(cc.pos);
      jelly.group.rotation.y = cc.t * 0.05;
      const local = jelly.group.worldToLocal(_v.copy(p));
      jelly.update(dt, flare, local);
      // brushing the threads always stings, whatever its state (same rule as before)
      if (cc.cool <= 0 && (jelly.touches(local, flare) || (flare > 0.8 && local.length() < 3.2))) {
        cc.cool = cc.spec.rate;
        if (cc.prey) cc.prey.hit(cc.spec.damage * (cc.state === 'attack' ? 1 : 0.6), { source: 'netweaver', creature: cc });
        else { mgr.ctx.injury.hit(cc.spec.damage * (cc.state === 'attack' ? 1 : 0.6), { source: 'netweaver', what: 'a net-weaver' });
        mgr.ctx.survival.oxygen = Math.max(0, mgr.ctx.survival.oxygen - 22); }
        mgr.sound('sting', p, 1);
        if (cc.state !== 'attack') cc.setState('attack', 'touched');
        mgr.noteSeen(cc, 'hurt');
      }
    },
  };
}

// ---------------------------------------------------------------- humans, changed
function milkyEyes(h) {
  const m = new THREE.MeshStandardMaterial({ color: 0xcfd6d2, roughness: 0.25 });
  if (h.eyes) h.eyes.material = m;
}
function stretch(h, map) { for (const [n, s] of Object.entries(map)) { const b = h.bone[n]; if (b) b.userData.fixScale = s; } }
function applyStretch(h) { for (const b of h.bones) if (b.userData.fixScale) b.scale.setScalar(b.userData.fixScale); }

function listener(mgr, c) {
  const base = BASIC.listener(mgr, c);
  const kit = mgr.ctx.humans;
  if (!kit) return base;
  const p = generatePerson(9001, { sex: 1, age: 45, hair: null, outdoors: 0 });
  Object.assign(p, { height: 1.3, weight: 0.0, muscle: 0.0, clothes: [], emotion: 'calm' });
  p.look = { ...p.look, tone: [1.22, 1.3, 1.34], beard: 0, stubble: 0, buzz: 0, weathered: 0, freckles: 0, blush: 0, underEye: 1, salt: 0, scar: null, tattoo: null };
  const person = new Person(mgr.ctx, kit, p);
  person.band?.parent?.remove(person.band);
  milkyEyes(person.human);
  // too-long forearms and hands, a long neck
  stretch(person.human, { 'lowerarm01.L': 1.16, 'lowerarm01.R': 1.16, 'wrist.L': 1.4, 'wrist.R': 1.4, 'neck01': 1.18 });
  deadSkin(person.human.skinMat, { tint: [0.86, 0.9, 0.93], veins: 0.9, wet: 0.85 });
  // more arms, lower on the torso, each a little smaller
  const limbs = [];
  for (const [spineName, dy, sc, splay] of [['spine03', -0.2, 0.92, 0.9], ['spine02', -0.38, 0.85, 1.25]]) for (const side of ['L', 'R']) {
    const x = extraArms(person.human, side, spineName, new THREE.Vector3(0, dy, -0.03), { splay, scale: sc, lag: 0.5 + Math.random() * 0.4 });
    if (x) limbs.push(x);
  }
  const group = new THREE.Group(); group.add(person.root);
  person.play('Swim_Idle_Loop', 0);
  return {
    group, move: base.move, attack: base.attack, onState: base.onState,
    focus: () => person.human.bone.head.getWorldPosition(_v),
    animate(cc, dt) {
      const d = cc.perceived?.d ?? 99;
      group.visible = mgr.ctx.atmosphere.underwater && d < 30;
      group.position.copy(cc.pos); group.position.y -= 1.4;
      group.rotation.y = cc.heading;
      // it hangs upright in the water, hunched, until it goes for a sound
      const clip = cc.state === 'attack' ? ['Swim_Fwd_Loop', 1.5] : cc.state === 'warning' ? ['Crouch_Idle_Loop', 0.3] : ['Idle_Loop', 0.25];
      person.play(clip[0], 0.6); if (person.current) person.current.timeScale = clip[1];
      // it listens: head tilted, turned toward the sound, never toward you
      person.update(dt, cc.state === 'idle' ? null : mgr.senses.noisePos);
      if (cc.state === 'alert' || cc.state === 'warning') person.human.bone.head?.rotateZ(Math.sin(cc.t * 0.7) * 0.35);
      applyStretch(person.human);
      for (const l of limbs) l.update(cc.t, dt);
      mgr.ctx.audio && (mgr.ctx.audio.listenerNear = Math.max(mgr.ctx.audio.listenerNear || 0, mgr.ctx.atmosphere.underwater ? Math.max(0, 1 - (d - 8) / 25) : 0));
    },
  };
}

function bloomwalker(mgr, c) {
  const base = BASIC.bloomwalker(mgr, c);
  const kit = mgr.ctx.humans;
  if (!kit) return base;
  const seed = [...c.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const p = generatePerson(seed, {});
  p.look = { ...p.look, tone: p.look.tone.map((t, i) => t * [0.78, 0.9, 0.9][i]), weathered: 1, underEye: 1, blush: 0, salt: 1, wear: 1 };
  p.emotion = 'tired';
  const person = new Person(mgr.ctx, kit, p);
  person.band?.parent?.remove(person.band);
  milkyEyes(person.human);
  deadSkin(person.human.skinMat, { tint: [0.72, 0.84, 0.8], veins: 0.45, wet: 0.95, algae: 0.55 });
  // the bloom: glowing growth on the shoulders, neck, a cheek, the back of a hand
  const body = person.human.body;
  const geo = body.geometry;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const H = person.human.height;
  const spots = pickVertices(geo, (q, n) => q.y > H * 0.35 && (n.y > 0.1 || Math.abs(n.x) > 0.5 || n.z < -0.4), 16, 0.07, seed % 97);
  spots.forEach((vi, k) => attachAtVertex(body, vi, bloomCluster(0.025 + (k % 3) * 0.012, 4 + (k % 5), k + 3), { along: -0.006 }));
  // waterlogged clothes: dark, silted, green at the hems; weed trailing from the body
  for (const m of person.human.clothMats || []) {
    const u = m.uniforms || m.userData?.u;
    if (m.color) m.color.multiplyScalar(0.4).lerp(new THREE.Color(0x26301e), 0.35);
    m.roughness = 0.55;
    if (u?.uTint?.value) u.uTint.value.multiplyScalar(0.42).lerp(new THREE.Color(0.1, 0.13, 0.08), 0.3);
    if (u?.uSalt) u.uSalt.value = 0; if (u?.uWear) u.uWear.value = 1;
  }
  pickVertices(geo, (q, n) => q.y > H * 0.25 && q.y < H * 0.8 && n.y < 0.2, 6, 0.15, seed % 31).forEach((vi, k) => { const w = weed(0.35, 6, k + 9); attachAtVertex(body, vi, w, {}); w.quaternion.identity(); });
  const light = new THREE.PointLight(0x3affd0, 0.6, 5, 2); light.position.y = 1.3;
  const group = new THREE.Group(); group.add(person.root, light);
  person.play('Idle_Loop', 0);
  return {
    group, move: base.move, attack: base.attack, onState: base.onState,
    focus: () => person.human.bone.head.getWorldPosition(_v),
    animate(cc, dt) {
      group.position.copy(cc.pos); group.position.y -= 1.0;
      group.rotation.y = cc.heading;
      group.rotation.z = Math.sin(cc.t * 0.3) * 0.06;
      const reach = cc.state === 'attack' || cc.state === 'warning';
      // drifting upright, arms loose; when it wants you it reaches
      person.play(reach ? 'Push_Loop' : 'Idle_Loop', 1.2);
      if (person.current) person.current.timeScale = reach ? 0.35 : 0.18;
      person.update(dt, cc.state === 'idle' ? null : (c.prey ? c.prey.pos : mgr.ctx.player.position));
      const glow = 0.8 + Math.sin(cc.t * 1.3) * 0.2 + (cc.state === 'attack' ? 0.9 : 0) - (cc.saltT > 0 ? 0.6 : 0);
      setBloomGlow(glow); tickGrowths(cc.t);
      light.intensity = cc.state === 'idle' ? 0.5 : 1.2;
      group.visible = (cc.perceived?.d ?? 99) < 70;
    },
  };
}

// an irregular stain of silt, fur and droppings (alpha only)
let _stain;
function denStain() {
  if (_stain) return _stain;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * 6.28, r = Math.pow(Math.random(), 0.7) * 50;
    const g = x.createRadialGradient(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 0, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 4 + Math.random() * 10);
    const v = Math.round(40 + Math.random() * 60 * (1 - r / 60));
    g.addColorStop(0, `rgb(${v},${v},${v})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.globalCompositeOperation = 'lighter'; x.fillRect(0, 0, 128, 128);
  }
  _stain = new THREE.CanvasTexture(c);
  return _stain;
}

// ---------------------------------------------------------------- tide crabs
// An armoured scavenger the size of a car: a ridged, barnacled carapace, eight
// jointed legs that walk in alternating sets, and two heavy claws that rise in
// warning and snap when it attacks. It guards a nest of sea-glass.
function tide_crab(mgr, c) {
  const g = new THREE.Group();
  const look = { fur: 0x5a3a2a, furLight: 0x8a6a4a, dark: 0x22140e, skin: 0x7a4a3a, algae: 0x3a4a24, glow: 0xff8040, wet: 0.8, mange: 0, algaeAmt: 0.7, veins: 0.3, noiseScale: 1.6, bump: 0.03, lightPart: 9, darkPart: 9 };
  const shellM = mutantMaterial(look);
  const withPart = (geo) => { geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1)); return geo; };
  // carapace: a wide flattened dome with a ridged front edge and spines
  const cg = new THREE.SphereGeometry(1, 40, 20); const P = cg.attributes.position;
  for (let i = 0; i < P.count; i++) { let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const a = Math.atan2(z, x); const rim = 1 + 0.06 * Math.sin(a * 11) * Math.max(0, 1 - Math.abs(y) * 3); P.setXYZ(i, x * 1.25 * rim, y * (y > 0 ? 0.42 : 0.22), z * 0.95 * rim - (z > 0.6 ? (z - 0.6) * 0.3 : 0)); }
  cg.computeVertexNormals();
  const shell = new THREE.Mesh(withPart(cg), shellM); shell.position.y = 0.7; shell.castShadow = true; g.add(shell);
  for (let k = 0; k < 4; k++) { const s = spike(0.25, 0.06, 0.2, k + 70); s.position.set(-0.6 + k * 0.4, 1.0, -0.6); s.rotation.x = -0.6; g.add(s); }
  for (let k = 0; k < 3; k++) { const b = barnacles(0.3, 8, k + 80); b.position.set(-0.6 + k * 0.6, 1.05, 0.2 - k * 0.15); g.add(b); }
  // eyes on stalks
  for (const sx of [-0.22, 0.22]) { const st = new THREE.Mesh(withPart(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6)), shellM); st.position.set(sx, 1.0, -0.85); g.add(st); const e = glowEye(0.05, 0xffa040); e.position.set(sx, 1.17, -0.85); g.add(e); }
  // legs: two tapered segments per leg, hinged at the knee
  const legs = [];
  const seg = (len, r0, r1) => { const gg = new THREE.CylinderGeometry(r1, r0, len, 8, 4); gg.translate(0, -len / 2, 0); return withPart(gg); };
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const hip = new THREE.Group(); hip.position.set(side * 1.05, 0.7, -0.45 + k * 0.32);
    const upper = new THREE.Mesh(seg(0.75, 0.09, 0.07), shellM); upper.rotation.z = side * -1.1; hip.add(upper);
    const knee = new THREE.Group(); knee.position.set(side * 0.66, -0.34, 0); hip.add(knee);
    const lower = new THREE.Mesh(seg(0.85, 0.065, 0.02), shellM); lower.rotation.z = side * -0.25; knee.add(lower);
    g.add(hip); legs.push({ hip, knee, side, k });
  }
  // claws: an arm and a heavy two-part pincer
  const claws = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.75, 0.75, -0.8);
    const fore = new THREE.Mesh(seg(0.6, 0.12, 0.1), shellM); fore.rotation.x = Math.PI / 2 + 0.3; arm.add(fore);
    const hand = new THREE.Group(); hand.position.set(0, -0.15, -0.6); arm.add(hand);
    const palm = new THREE.Mesh(withPart(new THREE.SphereGeometry(0.22, 16, 10).scale(1, 0.75, 1.5)), shellM); hand.add(palm);
    const fixedF = new THREE.Mesh(seg(0.5, 0.09, 0.015), shellM); fixedF.rotation.x = Math.PI / 2; fixedF.position.set(0, -0.05, -0.25); hand.add(fixedF);
    const dactyl = new THREE.Group(); dactyl.position.set(0, 0.08, -0.25); hand.add(dactyl);
    const df = new THREE.Mesh(seg(0.45, 0.07, 0.012), shellM); df.rotation.x = Math.PI / 2; dactyl.add(df);
    g.add(arm); claws.push({ arm, dactyl, side });
  }
  g.scale.setScalar(c.spec.size || 1.1);
  // the nest: sea-glass in a scraped hollow
  const nest = new THREE.Group();
  const glassM = new THREE.MeshStandardMaterial({ color: 0x7ac0a8, roughness: 0.15, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 26; i++) { const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + Math.random() * 0.06, 0), glassM); sh.position.set((Math.random() - 0.5) * 1.6, 0.03, (Math.random() - 0.5) * 1.6); sh.rotation.set(Math.random() * 3, Math.random() * 3, 0); nest.add(sh); }
  const group = new THREE.Group(); group.add(g, nest);
  let walk = 0, snap = 0, last = new THREE.Vector3();
  return {
    group,
    focus: () => _v.copy(g.position).setY(g.position.y + 0.8),
    move(cc, dt) {
      const p = cc.preyPos();
      let goal = cc.state === 'attack' ? p : cc.state === 'warning' ? _v.copy(cc.home).lerp(p, 0.3) : cc.state === 'return' ? cc.home : _v.copy(cc.home).add(_w.set(Math.sin(cc.t * 0.07) * 2, 0, Math.cos(cc.t * 0.05) * 2));
      cc.steer(goal, (cc.spec.speed || 1.6) * (cc.state === 'attack' ? 1 : 0.35), dt, { keepY: true, maxR: cc.spec.territoryR + cc.spec.leash });
    },
    attack(cc) { if (cc.strike(1.9, { breaks: 0.3 })) { snap = 1; mgr.sound('huff', cc.pos, 0.8); } },
    onState(cc, s) { if (s === 'warning') mgr.sound('chitter', cc.pos, 1); },
    animate(cc, dt) {
      nest.position.copy(cc.home);
      g.position.copy(cc.pos); g.position.y = cc.home.y;
      const sp = last.distanceTo(cc.pos) / Math.max(dt, 1e-3); last.copy(cc.pos);
      walk += dt * (1 + sp * 4);
      // crabs walk sideways: face the threat, scuttle across it
      const p = cc.preyPos();
      const want = cc.state === 'idle' || cc.state === 'return' ? cc.heading : Math.atan2(p.x - cc.pos.x, p.z - cc.pos.z) + Math.PI;
      g.rotation.y += Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y)) * Math.min(1, dt * 3);
      for (const L of legs) { const ph = walk * 6 + (L.k % 2 ? Math.PI : 0) + (L.side > 0 ? Math.PI / 2 : 0); const m = Math.min(1, sp * 0.8); L.hip.rotation.y = Math.sin(ph) * 0.35 * m; L.hip.rotation.z = Math.max(0, Math.cos(ph)) * 0.25 * m * L.side; L.knee.rotation.z = -Math.max(0, Math.cos(ph)) * 0.3 * m * L.side; }
      const raise = cc.state === 'warning' ? 1 : cc.state === 'attack' ? 0.8 : cc.state === 'alert' ? 0.4 : 0;
      snap = Math.max(0, snap - dt * 3);
      for (const C of claws) { C.arm.rotation.x = -raise * 0.9 + Math.sin(cc.t * 2 + C.side) * 0.05; C.dactyl.rotation.x = -0.35 * (raise > 0.5 ? 0.5 + 0.5 * Math.sin(cc.t * 9) : 0.2) + snap * 0.5; }
      shellM.userData.u.uTime.value = cc.t;
    },
  };
}

const MODEL = { tide_crab, siltwolf, gullrat, needlefish, netweaver, listener, bloomwalker };
// pick the model body when the models loaded, else the simple one
export function makeBody(mgr, c) {
  const k = c.kind;
  const lib = mgr.ctx.creatureModels;
  try { if (MODEL[k] && (lib || k === 'netweaver' || k === 'tide_crab')) return MODEL[k](mgr, c); } catch (e) { console.warn('[creatures] model body failed for', k, e); }
  return BASIC[k] ? BASIC[k](mgr, c) : MODEL[k](mgr, c);
}
void _w; void _y;
