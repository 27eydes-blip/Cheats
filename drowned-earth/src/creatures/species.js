import * as THREE from 'three';
import { G } from '../world/WorldShader.js';

// Bodies and behaviour for each species. Each body is { group, move, animate,
// attack?, onState? }. Shapes are procedural and kept in silhouette; impact is
// shown on the player's side (screen, sound), never as gore.

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

function wanderGoal(c, r, speed = 0.15) {
  const a = c.t * speed + c.id.length;
  return _w.set(c.home.x + Math.cos(a) * r * (0.5 + 0.5 * Math.sin(a * 0.7)), c.home.y, c.home.z + Math.sin(a * 1.3) * r * (0.5 + 0.5 * Math.cos(a * 0.5)));
}

// ---------------------------------------------------------------- gullrats
export function gullrat(mgr, c) {
  const n = c.spec.count || 16;
  const rats = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.06, 0.16, 3, 6).rotateX(Math.PI / 2), mat(0x3b342e), Math.ceil(n * 0.6));
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.36, 0.02, -0.04, 0, 0, -0.14, 0, 0, 0.12, 0.36, 0.02, -0.04, 0, 0, -0.14], 3));
  wing.computeVertexNormals();
  const gulls = new THREE.InstancedMesh(wing, mat(0xd8d6cf, { side: THREE.DoubleSide }), Math.floor(n * 0.4));
  const group = new THREE.Group(); group.add(rats, gulls);
  rats.frustumCulled = gulls.frustumCulled = false;
  const members = Array.from({ length: n }, (_, i) => ({ off: new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3), p: new THREE.Vector3(), ph: Math.random() * 6.28, gull: i >= rats.count }));
  // a nest: feathers and droppings at the deck edge
  const nest = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.12, 5, 10).rotateX(Math.PI / 2), mat(0x6b5f4e));
  group.add(nest);
  return {
    group,
    move(c, dt) {
      // follow the raft they live on
      mgr.resolveHome(c);
      nest.position.copy(c.home).add(_v.set(0, 0.05, 0));
      let goal = c.state === 'attack' ? mgr.ctx.player.position : c.state === 'warning' ? _v.copy(mgr.ctx.player.position).lerp(c.home, 0.4) : wanderGoal(c, c.spec.territoryR * 0.6, 0.4);
      if (c.lure) goal = c.lure;
      if (c.state === 'return' || !c.awake) goal = c.home;
      c.steer(goal, c.spec.speed * (c.state === 'attack' ? 1 : 0.4), dt, { keepY: true, maxR: c.spec.territoryR + c.spec.leash });
      c.pos.y = c.home.y;
    },
    attack(c) { c.strike(1.4, { k: 1 }); },
    animate(c, dt) {
      const vis = c.awake;
      group.visible = vis;
      if (!vis) return;
      const agitated = c.state === 'attack' || c.state === 'warning';
      let ri = 0, gi = 0;
      for (const m of members) {
        m.ph += dt * (agitated ? 9 : 3);
        const r = agitated ? 0.9 : 1.6;
        const tx = c.pos.x + m.off.x * r + Math.sin(m.ph) * 0.25, tz = c.pos.z + m.off.z * r + Math.cos(m.ph * 1.3) * 0.25;
        m.p.x += (tx - m.p.x) * Math.min(1, dt * 6); m.p.z += (tz - m.p.z) * Math.min(1, dt * 6);
        if (m.gull) {
          const y = c.pos.y + (agitated ? 1.0 + Math.sin(m.ph * 0.5) * 0.6 : 0.15);
          _m.compose(_v.set(m.p.x, y, m.p.z), _q.setFromAxisAngle(_w.set(0, 0, 1), Math.sin(m.ph * (agitated ? 3 : 0.5)) * 0.6).premultiply(new THREE.Quaternion().setFromAxisAngle(_w.set(0, 1, 0), m.ph)), _s.setScalar(1));
          gulls.setMatrixAt(gi++, _m);
        } else {
          _m.compose(_v.set(m.p.x, c.pos.y + 0.06, m.p.z), _q.setFromAxisAngle(_w.set(0, 1, 0), m.ph), _s.setScalar(1));
          rats.setMatrixAt(ri++, _m);
        }
      }
      rats.instanceMatrix.needsUpdate = true; gulls.instanceMatrix.needsUpdate = true;
    },
    onState(c, s) { if (s === 'warning' || s === 'attack') mgr.sound('screech', c.pos); else if (s === 'alert') mgr.sound('chitter', c.pos); },
  };
}

// ---------------------------------------------------------------- siltwolves
function wolfMesh(scale = 1) {
  const g = new THREE.Group();
  const fur = mat(0x4a4a44, { roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 10).rotateZ(Math.PI / 2), fur); body.position.y = 0.6;
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.25, 4, 8), fur); neck.position.set(0.5, 0.78, 0); neck.rotation.z = -0.9;
  const head = new THREE.Group(); head.position.set(0.68, 0.88, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fur); skull.scale.set(1.2, 0.95, 0.9);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8).rotateZ(-Math.PI / 2), fur); snout.position.x = 0.18; snout.position.y = -0.03;
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), fur); earL.position.set(-0.02, 0.14, 0.07);
  const earR = earL.clone(); earR.position.z = -0.07;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x9a8a40 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), eyeM); eyeL.position.set(0.1, 0.04, 0.07);
  const eyeR = eyeL.clone(); eyeR.position.z = -0.07;
  head.add(skull, snout, earL, earR, eyeL, eyeR);
  const legs = [];
  for (const [x, z] of [[0.32, 0.12], [0.32, -0.12], [-0.32, 0.12], [-0.32, -0.12]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.5, 6).translate(0, -0.25, 0), fur);
    leg.position.set(x, 0.52, z); legs.push(leg); g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 6).rotateZ(Math.PI / 2 + 0.6), fur); tail.position.set(-0.6, 0.7, 0);
  g.add(body, neck, head, tail);
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, head, legs, tail, ears: [earL, earR], eyeM };
}
export function siltwolf(mgr, c) {
  const group = new THREE.Group();
  const pack = Array.from({ length: c.spec.count || 3 }, (_, i) => ({ ...wolfMesh(i === 0 ? 1.1 : 0.95), off: new THREE.Vector3(Math.cos(i * 2.1) * 2.2, 0, Math.sin(i * 2.1) * 2.2), p: new THREE.Vector3(), h: 0, ph: i * 1.7 }));
  for (const w of pack) group.add(w.g);
  // the den: bones, a scraped hollow, two pups
  const den = new THREE.Group();
  const boneM = mat(0xcfc6b0);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.35 + Math.random() * 0.2, 5), boneM); b.rotation.set(Math.PI / 2, 0, Math.random() * 6); b.position.set(Math.cos(i) * (0.8 + Math.random()), 0.03, Math.sin(i * 1.7) * (0.8 + Math.random())); den.add(b); }
  const pups = [wolfMesh(0.45), wolfMesh(0.42)];
  pups.forEach((p, i) => { p.g.position.set(i ? 0.5 : -0.3, 0, i ? -0.3 : 0.4); den.add(p.g); });
  group.add(den);
  return {
    group,
    move(c, dt) {
      if (!mgr.resolveHome(c)) return;
      den.position.copy(c.home);
      const p = mgr.ctx.player.position;
      let goal;
      if (c.state === 'attack') goal = p;
      else if (c.state === 'warning') goal = _v.copy(c.home).lerp(p, 0.45); // stand between you and the den
      else if (c.state === 'alert') goal = c.pos; // freeze and watch
      else if (c.state === 'return') goal = c.home;
      else goal = wanderGoal(c, c.spec.territoryR * 0.55, 0.05);
      if (c.lure && c.state !== 'attack') goal = c.lure;
      c.steer(goal, c.spec.speed * (c.state === 'attack' ? 1 : c.state === 'warning' ? 0.35 : 0.18), dt, { keepY: true, maxR: Math.min(c.roofR ?? 99, c.spec.territoryR + c.spec.leash) });
      c.pos.y = c.home.y;
    },
    attack(c) { if (c.strike(1.7, { breaks: 0.18 })) mgr.sound('growl', c.pos, 1); },
    animate(c, dt) {
      const p = mgr.ctx.player.position;
      const moving = c.state === 'attack' ? 1 : c.state === 'idle' || c.state === 'return' ? 0.3 : 0.1;
      pack.forEach((w, i) => {
        const spread = Math.min(c.state === 'warning' ? 1.4 : 1, (c.roofR ?? 99) / 4);
        // circle when warning, otherwise loosely around the leader
        const circ = c.state === 'warning' ? c.t * 0.6 + i * 2.1 : 0;
        const tx = c.pos.x + (c.state === 'warning' ? Math.cos(circ) * Math.min(2.4, (c.roofR ?? 99) * 0.5) : w.off.x * spread), tz = c.pos.z + (c.state === 'warning' ? Math.sin(circ) * Math.min(2.4, (c.roofR ?? 99) * 0.5) : w.off.z * spread);
        const ox = w.p.x, oz = w.p.z;
        w.p.x += (tx - w.p.x) * Math.min(1, dt * 3); w.p.z += (tz - w.p.z) * Math.min(1, dt * 3); w.p.y = c.pos.y;
        const vx = w.p.x - ox, vz = w.p.z - oz;
        const look = c.state === 'idle' ? Math.atan2(vx, vz) : Math.atan2(p.x - w.p.x, p.z - w.p.z);
        if (Math.hypot(vx, vz) > 1e-4 || c.state !== 'idle') w.h += (((look - Math.PI / 2 - w.h + Math.PI) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 5);
        w.g.position.copy(w.p); w.g.rotation.y = -w.h;
        w.ph += dt * (2 + moving * 10);
        w.legs.forEach((l, k) => { l.rotation.z = Math.sin(w.ph + (k % 2 ? Math.PI : 0) + (k > 1 ? 0.6 : 0)) * 0.5 * moving; });
        // alert: head up, ears forward; warning: head low, hackles, tail stiff
        w.head.rotation.z = c.state === 'warning' ? -0.45 : c.state === 'alert' ? 0.25 : Math.sin(c.t * 0.4 + i) * 0.15 - 0.2;
        w.tail.rotation.z = c.state === 'warning' ? 0.3 : c.state === 'idle' ? Math.sin(c.t * 2 + i) * 0.2 : 0;
        w.ears.forEach((e) => { e.rotation.z = c.state === 'warning' ? -0.7 : 0; });
        w.eyeM.color.setHex(c.state === 'warning' || c.state === 'attack' ? 0xe0c050 : 0x9a8a40);
      });
      pups.forEach((pp, i) => { pp.g.rotation.y = Math.sin(c.t * 0.5 + i) * 0.8; });
    },
    onState(c, s) { if (s === 'warning') mgr.sound('growl', c.pos, 0.7); else if (s === 'alert') mgr.sound('huff', c.pos, 0.4); },
  };
}

// ---------------------------------------------------------------- needlefish
export function needlefish(mgr, c) {
  const n = c.spec.count || 40;
  const geo = new THREE.ConeGeometry(0.025, 0.32, 4).rotateX(Math.PI / 2);
  const fish = new THREE.InstancedMesh(geo, mat(0xb8c8c8, { metalness: 0.6, roughness: 0.3 }), n);
  fish.frustumCulled = false;
  const group = new THREE.Group(); group.add(fish);
  const m = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), ph: Math.random() * 6.28, r: 0.6 + Math.random() * 2.4, y: Math.random() }));
  return {
    group,
    move(c, dt) {
      const p = mgr.ctx.player.position;
      let goal = c.state === 'attack' ? p : c.lure || wanderGoal(c, c.spec.territoryR * 0.6, 0.2);
      // slow swimmers make them scatter away
      if (c.state === 'alert' && c.perceived.d < 6 && mgr.senses.noise < 0.1) goal = _v.copy(c.pos).add(_w.copy(c.pos).sub(p).setLength(4));
      if (c.state === 'return') goal = c.home;
      c.steer(goal, c.spec.speed * (c.state === 'attack' ? 1 : 0.3), dt, { maxR: c.spec.territoryR + c.spec.leash });
      c.pos.y = Math.min(-0.4, Math.max(c.home.y - 1.5, c.state === 'attack' ? p.y : c.home.y));
    },
    attack(c) { c.strike(1.2); },
    animate(c, dt) {
      const frenzy = c.state === 'attack' ? 1 : c.state === 'warning' ? 0.5 : 0;
      group.visible = c.perceived?.d < 60;
      m.forEach((f, i) => {
        f.ph += dt * (1.5 + frenzy * 6);
        const r = f.r * (1 - frenzy * 0.5);
        const tx = c.pos.x + Math.cos(f.ph) * r, tz = c.pos.z + Math.sin(f.ph) * r, ty = c.pos.y + (f.y - 0.5) * (0.8 + frenzy);
        const ox = f.p.x, oz = f.p.z;
        f.p.set(f.p.x + (tx - f.p.x) * Math.min(1, dt * 4), f.p.y + (ty - f.p.y) * Math.min(1, dt * 4), f.p.z + (tz - f.p.z) * Math.min(1, dt * 4));
        _m.compose(f.p, _q.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(f.p.x - ox, f.p.z - oz)), _s.setScalar(1));
        fish.setMatrixAt(i, _m);
      });
      fish.instanceMatrix.needsUpdate = true;
    },
    onState(c, s) { if (s === 'attack') mgr.ctx.water.ripple(c.pos.x, c.pos.z, 1.2, 2.5); },
  };
}

// ---------------------------------------------------------------- net-weavers
export function netweaver(mgr, c) {
  const group = new THREE.Group();
  const bellM = new THREE.MeshStandardMaterial({ color: 0xbfd8e0, emissive: 0x5fa8b8, emissiveIntensity: 0.25, roughness: 0.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), bellM);
  bell.scale.set(1.3, 0.8, 1.3);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9ee4e8, transparent: true, opacity: 0.25, depthWrite: false }));
  inner.position.y = 0.3;
  group.add(bell, inner);
  // threads: long thin strands hanging below the bell
  const N = 26, L = c.spec.threads || 6, seg = 10;
  const threadM = new THREE.LineBasicMaterial({ color: 0xd8f0f0, transparent: true, opacity: 0.55 });
  const threads = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 6.28, r = 0.4 + (i % 5) * 0.25;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg * 3), 3));
    const line = new THREE.Line(g, threadM); line.frustumCulled = false;
    threads.push({ line, a, r, len: L * (0.6 + Math.random() * 0.5) }); group.add(line);
  }
  let flare = 0;
  return {
    group,
    move(c, dt) {
      // drifts slowly on its own current, never far
      const goal = c.state === 'return' ? c.home : wanderGoal(c, c.spec.territoryR * 0.4, 0.03);
      c.steer(goal, c.spec.speed * 0.3, dt, { maxR: c.spec.territoryR });
      c.pos.y = c.home.y + Math.sin(c.t * 0.3) * 0.4;
    },
    // it doesn't chase: the threads lash at whatever is near and stings what they touch
    attack(c) { /* stinging is handled in animate by thread contact */ },
    animate(c, dt) {
      const p = mgr.ctx.player.position;
      const want = c.state === 'attack' ? 1 : c.state === 'warning' ? 0.6 : c.state === 'alert' ? 0.25 : 0;
      flare += (want - flare) * Math.min(1, dt * 3);
      group.position.copy(c.pos);
      const pulse = Math.sin(c.t * (1.2 + flare * 4)) * 0.08;
      bell.scale.set(1.3 + pulse, 0.8 - pulse * 0.6, 1.3 + pulse);
      bellM.emissiveIntensity = 0.25 + flare * 1.6 + (Math.sin(c.t * 9) > 0.6 ? flare * 0.8 : 0);
      bellM.emissive.setHex(flare > 0.5 ? 0x8fe8f0 : 0x5fa8b8);
      // threads: hang, sway, and lash toward the player when flared
      let touched = false;
      const lx = p.x - c.pos.x, ly = p.y - c.pos.y, lz = p.z - c.pos.z;
      for (const th of threads) {
        const pos = th.line.geometry.attributes.position;
        for (let k = 0; k < seg; k++) {
          const f = k / (seg - 1);
          let x = Math.cos(th.a) * th.r * (1 + f * 0.3) + Math.sin(c.t * 0.8 + th.a + f * 3) * 0.3 * f;
          let z = Math.sin(th.a) * th.r * (1 + f * 0.3) + Math.cos(c.t * 0.7 + th.a * 2 + f * 3) * 0.3 * f;
          let y = -f * th.len;
          if (flare > 0.4) { x += (lx - x) * f * flare * 0.35; z += (lz - z) * f * flare * 0.35; y += (ly - y) * f * flare * 0.2; }
          pos.setXYZ(k, x, y, z);
          if (!touched && Math.hypot(lx - x, ly - y, lz - z) < 0.45) touched = true;
        }
        pos.needsUpdate = true;
      }
      threadM.opacity = 0.45 + flare * 0.4;
      // brushing the threads always stings, whatever its state
      if (touched && c.cool <= 0) {
        c.cool = c.spec.rate;
        mgr.ctx.injury.hit(c.spec.damage * (c.state === 'attack' ? 1 : 0.6), { source: 'netweaver', what: 'a net-weaver' });
        mgr.ctx.survival.oxygen = Math.max(0, mgr.ctx.survival.oxygen - 22); // the sting stops your breath
        mgr.sound('sting', p, 1);
        if (c.state !== 'attack') c.setState('attack', 'touched');
        mgr.noteSeen(c, 'hurt');
      }
    },
  };
}

// ---------------------------------------------------------------- listeners
export function listener(mgr, c) {
  const g = new THREE.Group();
  const pale = new THREE.MeshStandardMaterial({ color: 0xbcc6c2, roughness: 0.55, transparent: true, opacity: 0.92 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.6, 4, 10), pale); body.position.y = 1.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), pale); head.scale.set(1, 1.4, 0.8); head.position.y = 3.3;
  g.add(body, head);
  const limbs = [];
  for (let k = 0; k < 12; k++) {
    const lg = new THREE.CylinderGeometry(0.025, 0.08, 3.6, 5); lg.translate(0, -1.8, 0);
    const limb = new THREE.Mesh(lg, pale);
    const a = (k / 12) * 6.28;
    limb.position.set(Math.cos(a) * 0.35, 2.4 - (k % 3) * 0.5, Math.sin(a) * 0.35);
    g.add(limb); limbs.push({ limb, a });
  }
  return {
    group: g,
    move(c, dt) {
      const S = mgr.senses;
      let goal;
      if (c.state === 'attack' || c.state === 'warning') goal = S.noisePos; // it hunts the sound, not you
      else if (c.lure) goal = c.lure;
      else if (c.state === 'return') goal = c.home;
      else goal = wanderGoal(c, c.spec.territoryR * 0.6, 0.02);
      const sp = c.state === 'attack' ? c.spec.speed : c.state === 'warning' ? 1.2 : 0.5;
      c.steer(goal, sp, dt, { maxR: c.spec.territoryR + c.spec.leash });
      c.pos.y = Math.min(-2.5, Math.max(c.home.y - 6, c.pos.y));
    },
    attack(c) { c.strike(2.4); },
    animate(c, dt) {
      const d = c.perceived?.d ?? 99;
      g.position.copy(c.pos); g.position.y -= 1.6; g.rotation.y = c.heading;
      // mostly unseen: only near, only underwater, only as a shape
      g.visible = mgr.ctx.atmosphere.underwater && d < 26;
      pale.opacity = Math.min(0.92, Math.max(0, (26 - d) / 18));
      const k = c.state === 'attack' ? 3 : c.state === 'warning' ? 1.6 : 0.6;
      limbs.forEach(({ limb, a }, i) => { limb.rotation.x = Math.sin(c.t * k + i) * 0.5; limb.rotation.z = Math.cos(c.t * k * 0.7 + a) * 0.5 + Math.cos(a) * 0.3; });
      head.rotation.z = c.state === 'alert' || c.state === 'warning' ? Math.sin(c.t * 0.8) * 0.4 : 0; // tilting to listen
      mgr.ctx.audio && (mgr.ctx.audio.listenerNear = Math.max(mgr.ctx.audio.listenerNear || 0, mgr.ctx.atmosphere.underwater ? Math.max(0, 1 - (d - 8) / 25) : 0));
    },
    onState(c, s) { if (s === 'alert') mgr.sound('scrape', c.pos, 0.8); if (s === 'warning') mgr.sound('clicks', c.pos, 1); if (s === 'attack') mgr.ctx.audio?.silence?.(2); },
  };
}

// ---------------------------------------------------------------- bloomwalkers
export function bloomwalker(mgr, c) {
  const g = new THREE.Group();
  const skin = mat(0x1c2624, { roughness: 0.9 });
  const glowM = new THREE.MeshStandardMaterial({ color: 0x0a1f1c, emissive: 0x1fb89a, emissiveIntensity: 0.9, roughness: 0.4 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 8), skin); torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin); head.position.y = 1.62; head.rotation.x = 0.5;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 4, 6), skin); legs.position.y = 0.45;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 3, 6), skin); armL.position.set(0.26, 1.05, 0.05); armL.rotation.z = 0.2;
  const armR = armL.clone(); armR.position.x = -0.26; armR.rotation.z = -0.2;
  g.add(torso, head, legs, armL, armR);
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 6, 5), glowM);
    b.position.set((Math.random() - 0.5) * 0.35, 0.4 + Math.random() * 1.3, (Math.random() - 0.5) * 0.3); g.add(b);
  }
  const light = new THREE.PointLight(0x3affd0, 0.6, 5, 2); light.position.y = 1.2; g.add(light);
  return {
    group: g,
    move(c, dt) {
      const p = mgr.ctx.player.position, S = mgr.senses;
      // turns toward light and warmth; otherwise drifts upright in place
      let goal = c.state === 'attack' || (c.state === 'warning' && S.light > 0) ? p : c.state === 'return' ? c.home : wanderGoal(c, 2, 0.02);
      c.steer(goal, c.spec.speed * (c.state === 'attack' ? 1.1 : 0.4), dt, { maxR: c.spec.territoryR + c.spec.leash });
      c.pos.y = c.home.y + Math.sin(c.t * 0.4) * 0.3;
    },
    attack(c) {
      const d = c.pos.distanceTo(mgr.ctx.player.position);
      if (d < 1.4 && !mgr.struggle && c.cool <= 0) mgr.startStruggle(c);
    },
    animate(c, dt) {
      g.position.copy(c.pos); g.position.y -= 0.9;
      g.rotation.y = c.heading;
      g.rotation.z = Math.sin(c.t * 0.3) * 0.08;
      const reach = c.state === 'attack' || c.state === 'warning' ? 1 : 0;
      armL.rotation.x = -reach * 1.2 + Math.sin(c.t * 0.5) * 0.1; armR.rotation.x = -reach * 1.1 + Math.sin(c.t * 0.45) * 0.1;
      glowM.emissiveIntensity = 0.7 + Math.sin(G.uTime.value * 1.3 + c.t) * 0.2 + (c.state === 'attack' ? 0.8 : 0) - (c.saltT > 0 ? 0.6 : 0);
      light.intensity = c.state === 'idle' ? 0.5 : 1.2;
      g.visible = (c.perceived?.d ?? 99) < 70;
    },
    onState(c, s) { if (s === 'alert') mgr.sound('moanSoft', c.pos, 0.5); },
  };
}

export const BODIES = { gullrat, siltwolf, needlefish, netweaver, listener, bloomwalker };
