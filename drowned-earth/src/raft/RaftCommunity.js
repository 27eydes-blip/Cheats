import * as THREE from 'three';
import { Raft } from './Raft.js';
import { RopeBridge } from './RopeBridge.js';
import { NPC } from '../ai/NPC.js';
import { signTexture } from '../world/Textures.js';
import { LAYER_FX } from '../render/Pipeline.js';
import { G } from '../world/WorldShader.js';

// A living raft district built from data (Portage, and the small Greentide and
// Rusthold rafts in stage 1). Platforms + rope bridges, NPCs on schedules,
// Standing-gated docks with coloured lamps, a ration board, pooled lantern
// lights, smoke and sound, the dusk lantern festival and the storm breakaway.
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();

function boardTexture(lines) {
  return signTexture({ lines, bg: '#23282a', fg: '#e8e2cf', font: 'bold 34px monospace', w: 512, h: 320, seed: Math.floor(Math.random() * 1e6), age: 0.3 });
}

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
  const bridges = (cdef.bridges || []).map(([a, la, b, lb]) => {
    const ra = rafts.get(a), rb = rafts.get(b);
    const br = new RopeBridge(ctx, ra, new THREE.Vector3(la[0], ra.deckAt(la[0], la[1]) - 0.02, la[1]), rb, new THREE.Vector3(lb[0], rb.deckAt(lb[0], lb[1]) - 0.02, lb[1]));
    br.ends = [a, b];
    return br;
  });
  const interactables = [];
  const local = (raft, x, y, z) => (v) => v.set(x, y, z).applyMatrix4(raft.root.matrixWorld);
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
  // ---- docks gated by Standing, each with a coloured lamp ----
  const tiers = ctx.data.standing.tiers;
  const docks = [];
  for (const p of cdef.platforms) {
    if (!p.mooring) continue;
    const r = rafts.get(p.id), m = p.mooring;
    const max = m.standingMax ?? 7;
    const color = new THREE.Color(tiers[String(max)].dockLight);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color }));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a3028 }));
    const lx = m.x - Math.sin(m.facing) * 0.5, lz = m.z - Math.cos(m.facing) * 0.5;
    post.position.set(lx, r.deckAt(m.stepX, m.stepZ) + 1.3, lz);
    lamp.position.set(lx, r.deckAt(m.stepX, m.stepZ) + 2.7, lz);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.fx.glowMaterial.map, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    halo.scale.setScalar(2.2); halo.position.copy(lamp.position); halo.layers.set(LAYER_FX);
    r.root.add(post, lamp, halo);
    docks.push({ r, lamp, halo, color, max });
    const follow = () => ({
      pos: _v.set(m.x, 0, m.z).applyMatrix4(r.root.matrixWorld).clone().setY(0),
      step: new THREE.Vector3(m.stepX, r.deckAt(m.stepX, m.stepZ) + 0.02, m.stepZ).applyMatrix4(r.root.matrixWorld),
      facing: m.facing + r.root.rotation.y,
    });
    interactables.push({
      kind: 'mooring', mode: 'boat', radius: 12, requireLook: false, pos: (v) => v.set(m.x, 0.8, m.z).applyMatrix4(r.root.matrixWorld),
      prompt: (c) => (c.standing.canDock(max) ? `Dock at ${m.name || cdef.name}` : `${m.name || 'Dock'} — ${tiers[String(max)].short} lamp`),
      onUse: (c) => {
        if (!c.standing.canDock(max)) {
          c.events.emit('dock:refused', { community: def.id, dock: m.name });
          const npc = npcs.find((n) => n.def.role === 'dockmaster');
          c.ui.subtitle(npc ? `${npc.def.name}: Not here, diver. Deep-Born tie up at the red lamp, round the back. It's not my rule. I just get fined for it.` : 'A voice from the deck: "Not this dock. Find your own lamp."', 6, 'speech');
          if (npc) c.audio?.speak(npc.worldPos(), 5);
          c.story.setFlag('dock_refused');
          return;
        }
        if (c.standing.forged != null && c.standing.inspect()) { c.ui.whisper('The dockhand runs a thumb over your tag and laughs. "Sal\'s work?" He tears it off. Word will reach the Ward.'); return; }
        const f = follow(); f.follow = follow; c.boat.tieUp(f); c.story.setFlag('visited_' + def.id);
      },
    });
  }
  // ---- NPCs ----
  const npcs = [];
  for (const nd of ctx.data.npcs.npcs || []) {
    const r = rafts.get(nd.raft);
    if (!r) continue;
    const npc = new NPC(ctx, nd, r);
    npcs.push(npc);
    interactables.push({
      id: 'npc:' + nd.id, kind: 'npc', radius: 3.4, pos: (v) => npc.worldPos(v).setY(v.y + 1.5),
      prompt: () => (npc.activity === 'sleep' ? `${nd.name} is asleep` : `Talk to ${nd.name}`),
      onUse: (c) => (npc.activity === 'sleep' ? c.ui.whisper(`${nd.name} is asleep. Better not.`) : c.dialogue.talk(npc)),
    });
  }
  // ---- workbench, beds, notice + ration boards, lookout log ----
  const main = rafts.values().next().value;
  let rationMesh = null;
  for (const r of rafts.values()) {
    const info = r.info;
    if (info.workbench) { const w = info.workbench; interactables.push({ kind: 'workbench', radius: 2.6, pos: local(r, w.x, w.y, w.z), prompt: 'Use the workbench', onUse: (c) => c.ui.openCraft('workbench') }); }
    for (const bd of info.beds) interactables.push({ kind: 'bed', radius: 2.4, pos: local(r, bd.x, bd.y + 0.3, bd.z), prompt: 'Sleep in the bunk', onUse: (c) => c.survival.sleep(r) });
    if (info.lookoutTop && def.id === 'portage') { const t = info.lookoutTop; interactables.push({ id: 'log:kettle_02', kind: 'log', radius: 2.2, pos: local(r, t.x + 1.2, t.y + 0.3, t.z - 1), prompt: (c) => (c.story.hasLog('kettle_02') ? 'Read the logbook again' : "Read the lookout's logbook"), onUse: (c) => c.story.openLog('kettle_02') }); }
  }
  {
    // ration board on the first platform (every raft has one)
    const r = main;
    rationMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshStandardMaterial({ map: boardTexture(ctx.economy.rationText()), roughness: 0.9 }));
    const bx = r.rects[0].x0 + 0.06, bz = (r.rects[0].z0 + r.rects[0].z1) / 2 + 1.5;
    rationMesh.position.set(bx, r.deck + 1.6, bz); rationMesh.rotation.y = -Math.PI / 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3c2c })); post.position.set(bx + 0.06, r.deck + 1.2, bz);
    r.root.add(rationMesh, post);
    interactables.push({ kind: 'board', radius: 2.4, pos: local(r, bx + 0.3, r.deck + 1.5, bz), prompt: 'Read the ration board', onUse: (c) => c.ui.showBoard(cdef.name, c.economy.rationText(), c.economy.rumours) });
    if (def.id === 'portage') {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), new THREE.MeshStandardMaterial({ map: signTexture({ lines: ['PORTAGE', 'DIVERS: RED LAMP DOCK', 'NO DIVING AFTER DARK', 'FESTIVAL AT DUSK'], bg: '#cfc6b0', fg: '#2b2620', font: 'bold 40px serif', seed: 71 }), roughness: 0.9 }));
      board.position.set(bx, r.deck + 1.6, bz - 3); board.rotation.y = -Math.PI / 2;
      r.root.add(board);
      interactables.push({ id: 'log:kettle_01', kind: 'log', radius: 2.4, pos: local(r, bx + 0.3, r.deck + 1.4, bz - 3), prompt: (c) => (c.story.hasLog('kettle_01') ? 'Read the notices again' : 'Read the notice board'), onUse: (c) => c.story.openLog('kettle_01') });
    }
  }
  const refreshBoard = () => { if (rationMesh) { rationMesh.material.map = boardTexture(ctx.economy.rationText()); rationMesh.material.needsUpdate = true; } };
  const offRation = ctx.events.on('rations', refreshBoard);
  // ---- lantern light pool + smoke + sound ----
  const maxL = Math.max(2, Math.floor((ctx.settings.q.pointLights ?? ctx.settings.q.maxLights) * (def.id === 'portage' ? 0.7 : 0.3)));
  const pool = Array.from({ length: maxL }, () => { const l = new THREE.PointLight(0xffa850, 0, 16, 2); l.layers.enableAll(); group.add(l); return l; });
  const lanterns = [];
  for (const r of rafts.values()) for (const l of r.lanterns) lanterns.push({ r, l });
  const smokes = [];
  const audio = [];
  for (const r of rafts.values()) {
    for (const s of r.info.smoke) smokes.push(ctx.fx.addSmoke({ getPos: (v) => v.set(s.x, s.y, s.z).applyMatrix4(r.root.matrixWorld), kind: s.kind }));
    for (const s of r.info.sounds) audio.push({ type: s.type, pos: (v) => v.set(s.x, s.y, s.z).applyMatrix4(r.root.matrixWorld) });
    for (const f of r.info.fires) { const fl = new THREE.PointLight(0xff7a30, 0, 6, 2); fl.position.set(f.x, f.y + 0.3, f.z); fl.layers.enableAll(); r.root.add(fl); r.fireLight = fl; }
  }
  audio.push({ type: 'crowd', pos: (v) => v.set(0, 2, 0).applyMatrix4(main.root.matrixWorld), gain: def.id === 'portage' ? 1 : 0.35 });
  audio.push({ type: 'ropes', pos: (v) => v.set(cx, 1, cz) });
  if (rafts.get('chapel')) audio.push({ type: 'chimes', pos: (v) => v.set(0, 3, 2).applyMatrix4(rafts.get('chapel').root.matrixWorld) });

  // ---- the dusk lantern festival (Portage) ----
  const fest = cdef.festival ? setupFestival(ctx, cdef, main, group, interactables) : null;
  // ---- the storm breakaway (Low Row) ----
  const loose = rafts.get('sleep1') ? setupBreakaway(ctx, rafts.get('sleep1'), bridges, interactables, def) : null;

  let t = ctx.state.playTime || 0;
  let lightTimer = 0;
  const playerLocal = new THREE.Vector3();
  const updaters = [(dt) => {
    t += dt;
    for (const r of rafts.values()) { if (r.loose) loose.update(dt); else r.update(dt, t, cdef.drift); }
    for (const b of bridges) { const cut = loose && b.ends.includes('sleep1') && rafts.get('sleep1').loose; b.group.visible = !cut; b.body.disabled = cut; if (!cut) b.update(dt); }
    const night = ctx.time.out.night;
    const pp = ctx.player.position;
    for (const npc of npcs) {
      const near = npc.raft.root.position.distanceTo(pp) < 30;
      if (near) playerLocal.copy(pp).applyMatrix4(_inv.copy(npc.raft.root.matrixWorld).invert());
      npc.update(dt, near ? playerLocal : null, near);
    }
    for (const { l } of lanterns) {
      const k = 0.25 + night * 1.5;
      l.mesh.material.color.setRGB(1 * k, 0.65 * k, 0.32 * k);
      l.halo.material.opacity = night * 0.9;
      l.halo.visible = night > 0.05;
    }
    for (const d of docks) { d.halo.material.opacity = 0.35 + night * 0.65; d.lamp.material.color.copy(d.color).multiplyScalar(0.6 + night * 1.2); }
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
      // flame: slow breathing + quick gutter, never in step with its neighbours
      pl.intensity = night * 11 * flame(t, pl.id);
    }
    for (const r of rafts.values()) if (r.fireLight) r.fireLight.intensity = 2.2 * flame(t * 1.4, r.fireLight.id) * (0.4 + night);
    if (fest) fest.update(dt);
    if (main.root.position.distanceTo(pp) < 200) ctx.water.setLights([...pool.slice(0, 3).filter((p) => p.intensity > 0.1).map((p) => ({ pos: p.position, color: new THREE.Color(1, 0.6, 0.25).multiplyScalar(night) })), ...(fest?.lights() || [])]);
  }];
  ctx.state.communities = ctx.state.communities || {};
  ctx.state.communities[def.id] = { rafts, npcs, def: cdef };
  if (loose) ctx.state.communities[def.id].breakaway = loose;
  if (def.id === 'portage') ctx.state.community = ctx.state.communities[def.id];
  return {
    group, interactables, updaters, audio,
    bodies: [...[...rafts.values()].map((r) => r.body), ...bridges.map((b) => b.body)],
    dispose: () => {
      for (const b of bridges) { b.group.removeFromParent(); b.carrier.removeFromParent(); }
      for (const s of smokes) ctx.fx.removeSmoke(s);
      fest?.dispose();
      offRation();
      ctx.water.setLights([]);
      delete ctx.state.communities[def.id];
      if (def.id === 'portage') ctx.state.community = null;
    },
    rafts, npcs,
  };
}

// Paper lanterns set adrift at dusk; the player can release one for Teo.
function setupFestival(ctx, cdef, main, group, interactables) {
  const f = cdef.festival;
  const n = f.boats;
  // a folded paper lantern: open-topped square body, a little taller than wide,
  // lit from inside so it glows brightest at the base and fades to the rim
  const geo = new THREE.CylinderGeometry(0.17, 0.21, 0.34, 4, 3, true); geo.rotateY(Math.PI / 4); geo.translate(0, 0.17, 0);
  { const p = geo.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 1.15 - (p.getY(i) / 0.34) * 0.75 + Math.sin(i * 12.9) * 0.04; c.set([k, k * 0.92, k * 0.8], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const paper = new THREE.MeshBasicMaterial({ color: 0xffb466, vertexColors: true, transparent: true, opacity: 0.92, side: THREE.DoubleSide, fog: true });
  const boats = new THREE.InstancedMesh(geo, paper, n + 1);
  boats.frustumCulled = false;
  boats.layers.set(LAYER_FX);
  group.add(boats);
  const halos = [];
  for (let i = 0; i <= n; i++) {
    const h = new THREE.Sprite(ctx.fx.glowMaterial); h.scale.setScalar(1.5); h.layers.set(LAYER_FX); h.visible = false; group.add(h); halos.push(h);
  }
  const state = Array.from({ length: n + 1 }, (_, i) => ({ born: null, a: -Math.PI * 0.5 + ((i / n) - 0.5) * Math.PI * 1.4 + Math.random() * 0.3, sp: 0.07 + Math.random() * 0.12, pos: new THREE.Vector3() }));
  let released = 0, mine = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const active = () => { const h = ctx.time.hour; return h >= f.from && h < f.to; };
  interactables.push({
    kind: 'festival', radius: 4, requireLook: false,
    pos: (v) => v.set(f.center[0], main.deck + 1, f.center[1] + 9).applyMatrix4(main.root.matrixWorld),
    enabled: () => active() && !mine,
    prompt: (c) => (c.inventory.has('festival_lantern') || !c.story.flag('festival_seen') ? 'Release a paper lantern for Teo' : 'Buy a paper lantern from Odile'),
    onUse: (c) => {
      if (c.story.flag('festival_seen') && !c.inventory.has('festival_lantern')) { c.ui.whisper('Odile sells them. Two scrap.'); return; }
      c.inventory.remove('festival_lantern');
      mine = true;
      const st = state[n]; st.born = ctx.state.playTime; st.a = Math.atan2(c.player.position.z - main.root.position.z, c.player.position.x - main.root.position.x);
      st.pos.copy(c.player.position);
      c.story.setFlag('festival_seen');
      c.events.emit('music:moment', 'festival');
      c.ui.whisper('You write T on the paper with a burnt match. It drifts out to join the others. Nobody says anything, and that is the kindness.');
      c.standing.addRep('portage', 6);
      c.audio?.play('chimeSwell');
    },
  });
  return {
    lights: () => (active() ? [{ pos: state[0].pos, color: new THREE.Color(1, 0.55, 0.2) }] : []),
    update: (dt) => {
      const on = active();
      const now = ctx.state.playTime;
      const center = _v.set(f.center[0], 0, f.center[1]).applyMatrix4(main.root.matrixWorld).clone();
      if (on && released === 0) { const into = Math.min(1, (ctx.time.hour - f.from) / 0.6); const k = Math.floor(n * 0.8 * into); for (; released < k; released++) { state[released].born = now - Math.random() * 140; state[released].pos.copy(center); } }
      if (on && released < n && Math.random() < dt * 0.9) { const st = state[released++]; st.born = now; st.pos.copy(center); }
      if (!on && released > 0 && ctx.time.hour > f.to) { released = 0; mine = false; state.forEach((st) => (st.born = null)); }
      state.forEach((st, i) => {
        const alive = st.born !== null && now - st.born < 900;
        halos[i].visible = alive && ctx.time.out.night > 0.1;
        if (!alive) { m.makeScale(0, 0, 0); boats.setMatrixAt(i, m); return; }
        const age = now - st.born;
        if (i < n) st.pos.set(center.x + Math.cos(st.a) * (3 + age * st.sp) + Math.sin(age * 0.1 + i) * 1.5, 0, center.z + Math.sin(st.a) * (3 + age * st.sp));
        else st.pos.set(st.pos.x + Math.cos(st.a) * st.sp * dt, 0, st.pos.z + Math.sin(st.a) * st.sp * dt);
        st.pos.y = ctx.waves.height(st.pos.x, st.pos.z) + 0.02;
        m.compose(st.pos, q.setFromAxisAngle(s.set(0, 1, 0), st.a), s.set(1, 1, 1));
        boats.setMatrixAt(i, m);
        halos[i].position.copy(st.pos).setY(st.pos.y + 0.75);
        
      });
      boats.instanceMatrix.needsUpdate = true;
      paper.color.setRGB(1, 0.55, 0.24).multiplyScalar(0.22 + ctx.time.out.night * 0.5); // warm, not blown out to white
    },
    dispose: () => {},
  };
}

// At midnight in a storm, Low Row's lines part and it drifts. Tow it back.
function setupBreakaway(ctx, raft, bridges, interactables, def) {
  let towing = false;
  const home = raft.anchor.clone();
  const vel = new THREE.Vector3();
  const check = () => {
    const h = ctx.time.hour;
    const storm = ctx.weather.cur.rain > 0.7 && ctx.weather.cur.wind > 0.75;
    return storm && (h >= 23.5 || h < 3) && !ctx.story.flag('saved_lowrow') && !ctx.story.flag('lost_lowrow');
  };
  const api = {
    update: (dt) => {
      const pp = ctx.player.position;
      if (towing) {
        const bp = ctx.boat.pos;
        const d = raft.root.position.distanceTo(bp);
        if (d > 14) vel.copy(bp).sub(raft.root.position).setY(0).normalize().multiplyScalar(Math.min(4, (d - 14) * 0.8));
        else vel.multiplyScalar(0.95);
        if (raft.root.position.distanceTo(home) < 14) {
          towing = false; raft.loose = false; raft.anchor.copy(home);
          ctx.story.setFlag('saved_lowrow'); ctx.standing.addRep('portage', 20);
          ctx.ui.whisper('Hands reach from the Exchange and take the line. Low Row is lashed home. Maud is crying and laughing at once.');
          ctx.events.emit('music:moment', 'relief');
          ctx.inventory.add('seal', 1, true); ctx.ui.toast('Maud presses a ration seal into your hand.');
        }
      } else {
        const w = ctx.weather.windVec;
        vel.lerp(new THREE.Vector3(w.x, 0, w.y).multiplyScalar(1.4 * ctx.weather.cur.wind), dt * 0.3);
        if (raft.root.position.distanceTo(home) > 420) { raft.loose = false; ctx.story.setFlag('lost_lowrow'); ctx.ui.whisper('Somewhere in the dark, Low Row is gone. Six bunks. Maud\'s laundry line.'); raft.anchor.copy(home); }
      }
      raft.anchor.addScaledVector(vel, dt);
      raft.update(dt, ctx.state.playTime, { radius: 0, period: 600 });
      raft.root.rotation.y += Math.sin(ctx.state.playTime * 0.4) * 0.002;
    },
  };
  raft.loose = false;
  api.start = () => { raft.loose = true; towing = false; vel.set(1, 0, 0.5); ctx.ui.whisper('A crack like a gunshot over the wind. Low Row has torn loose and is drifting into the dark.'); ctx.audio?.play('ropeSnap'); };
  ctx.events.on('tick:minute', () => {
    if (!raft.loose && check()) {
      raft.loose = true;
      ctx.ui.whisper('A crack like a gunshot over the wind. Shouting from Portage. Low Row has torn loose and is drifting into the dark.');
      ctx.audio?.play('ropeSnap');
      ctx.events.emit('music:moment', 'danger');
    }
  });
  interactables.push({
    kind: 'tow', mode: 'boat', radius: 14, requireLook: false,
    pos: (v) => v.copy(raft.root.position).setY(1),
    enabled: () => raft.loose && !towing,
    prompt: 'Throw Low Row a tow line',
    onUse: (c) => { towing = true; c.ui.whisper('Someone on Low Row catches the line and makes it fast. Bring her home slowly.'); c.story.setFlag('towing_lowrow'); },
  });
  return api;
}

// Layered flicker for a small flame: a slow breath, a faster waver and the
// occasional gutter. Deterministic per light id so neighbours never pulse together.
function flame(t, id) {
  const a = Math.sin(t * 1.7 + id * 1.3) * 0.05;
  const b = Math.sin(t * 7.9 + id * 2.1) * Math.sin(t * 5.3 + id) * 0.07;
  const c = Math.sin(t * 17.3 + id * 0.7) * 0.03;
  const gutter = Math.max(0, Math.sin(t * 0.37 + id * 4.1) - 0.93) * 2.2;
  return 0.9 + a + b + c - gutter;
}
