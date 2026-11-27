import * as THREE from 'three';
import { Raft } from './Raft.js';
import { RopeBridge } from './RopeBridge.js';
import { NPC } from '../ai/NPC.js';
import { signTexture } from '../world/Textures.js';

// A living raft district (stage 1: Kettle Drift). Builds platforms from data,
// joins them with rope bridges, populates NPCs, pools lantern lights, emits
// smoke and sound, and exposes docking, trading, crafting and sleeping.
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();

export function buildRaftCommunity(ctx, def) {
  const cdef = ctx.data.rafts.communities?.[def.id];
  if (!cdef) return {};
  const pieces = ctx.data.raftPieces.pieces;
  const [cx, cz] = def.pos;
  const group = new THREE.Group();
  group.name = 'community:' + def.id;
  const rafts = new Map();
  for (const p of cdef.platforms) {
    const r = new Raft(ctx, JSON.parse(JSON.stringify(p)), new THREE.Vector3(cx + p.pos[0], 0, cz + p.pos[1]), pieces);
    rafts.set(p.id, r);
    group.add(r.root);
    r.update(0, 0, cdef.drift);
  }
  const bridges = cdef.bridges.map(([a, la, b, lb]) => {
    const ra = rafts.get(a), rb = rafts.get(b);
    return new RopeBridge(ctx, ra, new THREE.Vector3(la[0], ra.deckAt(la[0], la[1]) - 0.02, la[1]), rb, new THREE.Vector3(lb[0], rb.deckAt(lb[0], lb[1]) - 0.02, lb[1]));
  });
  const interactables = [];
  const local = (raft, x, y, z) => (v) => v.set(x, y, z).applyMatrix4(raft.root.matrixWorld);
  // raft-local interactables (ladders) → world-space wrappers
  for (const r of rafts.values()) {
    for (const it of r.localInteract) {
      const lp = it.pos.clone();
      const orig = it.onUse;
      interactables.push({
        ...it, pos: (v) => v.copy(lp).applyMatrix4(r.root.matrixWorld),
        onUse: (c) => {
          const p = c.player; const real = p.climb.bind(p);
          const W = (q) => (q ? q.clone().applyMatrix4(r.root.matrixWorld) : q);
          p.climb = (a, b2, st, down) => real(W(a), W(b2), W(st), down);
          try { orig(c); } finally { p.climb = real; }
        },
      });
    }
  }
  // docking at the visitor dock (the boat follows the raft while tied)
  for (const p of cdef.platforms) {
    if (!p.mooring) continue;
    const r = rafts.get(p.id), m = p.mooring;
    const follow = () => ({
      pos: _v.set(m.x, 0, m.z).applyMatrix4(r.root.matrixWorld).clone().setY(0),
      step: new THREE.Vector3(m.stepX, r.deckAt(m.stepX, m.stepZ) + 0.02, m.stepZ).applyMatrix4(r.root.matrixWorld),
      facing: m.facing + r.root.rotation.y,
    });
    interactables.push({
      kind: 'mooring', mode: 'boat', radius: 12, requireLook: false, pos: (v) => v.set(m.x, 0.8, m.z).applyMatrix4(r.root.matrixWorld),
      prompt: 'Dock at ' + cdef.name, onUse: (c) => { const f = follow(); f.follow = follow; c.boat.tieUp(f); c.story.setFlag('visited_kettle'); },
    });
  }
  // NPCs
  const npcs = [];
  for (const nd of ctx.data.npcs.npcs || []) {
    const r = rafts.get(nd.raft);
    if (!r) continue;
    const npc = new NPC(ctx, nd, r);
    npcs.push(npc);
    interactables.push({
      id: 'npc:' + nd.id, kind: 'npc', radius: 3.2, pos: (v) => npc.worldPos(v).setY(v.y + 1.5),
      prompt: () => (npc.activity === 'sleep' ? `${nd.name} is asleep` : `Talk to ${nd.name}`),
      enabled: () => true,
      onUse: (c) => (npc.activity === 'sleep' ? c.ui.whisper(`${nd.name} is asleep. Better not.`) : c.dialogue.talk(npc)),
    });
  }
  // workbench, beds, notice board, lookout log
  for (const r of rafts.values()) {
    const info = r.info;
    if (info.workbench) {
      const w = info.workbench;
      interactables.push({ kind: 'workbench', radius: 2.6, pos: local(r, w.x, w.y, w.z), prompt: 'Use the workbench', onUse: (c) => c.ui.openCraft('workbench') });
    }
    for (const bd of info.beds) interactables.push({ kind: 'bed', radius: 2.4, pos: local(r, bd.x, bd.y + 0.3, bd.z), prompt: 'Sleep in the bunk', onUse: (c) => c.survival.sleep(r) });
    if (r.id === 'market') {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), new THREE.MeshStandardMaterial({ map: signTexture({ lines: ['KETTLE DRIFT', 'RATIONS: 3RD DAY', 'NO DIVING AFTER DARK', 'WARDENS — BE CIVIL'], bg: '#cfc6b0', fg: '#2b2620', font: 'bold 40px serif', seed: 71 }), roughness: 0.9 }));
      board.position.set(-9.05, 2.2, -2.5); board.rotation.y = -Math.PI / 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3c2c }));
      post.position.set(-9, 1.3 + r.deck - 1, -2.5);
      board.position.y += r.deck - 1;
      r.root.add(board, post);
      interactables.push({ id: 'log:kettle_01', kind: 'log', radius: 2.4, pos: local(r, -8.9, r.deck + 1.2, -2.5), prompt: (c) => (c.story.hasLog('kettle_01') ? 'Read the notices again' : 'Read the notice board'), onUse: (c) => c.story.openLog('kettle_01') });
    }
    if (info.lookoutTop) {
      const t = info.lookoutTop;
      interactables.push({ id: 'log:kettle_02', kind: 'log', radius: 2.2, pos: local(r, t.x + 1.2, t.y + 0.3, t.z - 1), prompt: (c) => (c.story.hasLog('kettle_02') ? 'Read the logbook again' : "Read the lookout's logbook"), onUse: (c) => c.story.openLog('kettle_02') });
    }
  }
  // lantern light pool + smoke + sound
  const maxL = Math.max(2, Math.floor(ctx.settings.q.maxLights * 0.6));
  const pool = Array.from({ length: maxL }, () => { const l = new THREE.PointLight(0xffa850, 0, 14, 1.8); l.layers.enableAll(); group.add(l); return l; });
  const lanterns = [];
  for (const r of rafts.values()) for (const l of r.lanterns) lanterns.push({ r, l });
  const smokes = [];
  const audio = [];
  for (const r of rafts.values()) {
    for (const s of r.info.smoke) smokes.push(ctx.fx.addSmoke({ getPos: (v) => v.set(s.x, s.y, s.z).applyMatrix4(r.root.matrixWorld), kind: s.kind }));
    for (const s of r.info.sounds) audio.push({ type: s.type, pos: (v) => v.set(s.x, s.y, s.z).applyMatrix4(r.root.matrixWorld) });
    for (const f of r.info.fires) {
      const fl = new THREE.PointLight(0xff7a30, 0, 6, 2); fl.position.set(f.x, f.y + 0.3, f.z); fl.layers.enableAll(); r.root.add(fl); r.fireLight = fl;
    }
  }
  const market = rafts.get('market');
  audio.push({ type: 'crowd', pos: (v) => v.set(0, 2, 0).applyMatrix4(market.root.matrixWorld) });
  audio.push({ type: 'ropes', pos: (v) => v.set(cx, 1, cz) });
  audio.push({ type: 'chimes', pos: (v) => v.set(0, 3, 2).applyMatrix4(rafts.get('chapel').root.matrixWorld) });
  let t = ctx.state.playTime || 0;
  let lightTimer = 0;
  const playerLocal = new THREE.Vector3();
  const updaters = [(dt) => {
    t += dt;
    for (const r of rafts.values()) r.update(dt, t, cdef.drift);
    for (const b of bridges) b.update(dt);
    const night = ctx.time.out.night;
    const pp = ctx.player.position;
    for (const npc of npcs) {
      const near = npc.raft.root.position.distanceTo(pp) < 30;
      if (near) playerLocal.copy(pp).applyMatrix4(_inv.copy(npc.raft.root.matrixWorld).invert());
      npc.update(dt, near ? playerLocal : null, near);
    }
    // lanterns: emissive always (dim by day), real lights only for the nearest few at night
    for (const { l } of lanterns) {
      const k = 0.25 + night * 1.5;
      l.mesh.material.color.setRGB(1 * k, 0.65 * k, 0.32 * k);
      l.halo.material.opacity = night * 0.9;
      l.halo.visible = night > 0.05;
    }
    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 0.5;
      const sorted = lanterns.map((e) => ({ e, d: e.r.worldPoint(e.l.local, _v).distanceTo(pp) })).sort((a, b) => a.d - b.d);
      pool.forEach((pl, i) => { pl.userData.e = sorted[i]?.e; });
    }
    for (const pl of pool) {
      const e = pl.userData.e;
      if (!e) { pl.intensity = 0; continue; }
      e.r.worldPoint(e.l.local, pl.position);
      pl.intensity = night * 9 * (0.92 + Math.sin(t * 9 + pl.id) * 0.08);
    }
    for (const r of rafts.values()) if (r.fireLight) r.fireLight.intensity = (1.5 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.4) * (0.4 + night);
    // water reflections of the nearest lanterns
    ctx.water.setLights(pool.slice(0, 4).filter((p) => p.intensity > 0.1).map((p) => ({ pos: p.position, color: new THREE.Color(1, 0.6, 0.25).multiplyScalar(night) })));
  }];
  ctx.state.community = { rafts, npcs, def: cdef };
  return {
    group, interactables, updaters, audio,
    bodies: [...[...rafts.values()].map((r) => r.body), ...bridges.map((b) => b.body)],
    dispose: () => {
      for (const b of bridges) { b.group.removeFromParent(); b.carrier.removeFromParent(); }
      for (const s of smokes) ctx.fx.removeSmoke(s);
      ctx.water.setLights([]);
      ctx.state.community = null;
    },
    rafts, npcs,
  };
}
