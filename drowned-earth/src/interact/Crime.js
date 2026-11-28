// Crime: who owns what, who saw what, and what happens next.
//   witnesses(pos)   NPCs who can see the player: distance (shorter at night without a light, shorter still
//                    crouched), a clear line of sight, and facing the player (or close enough to hear)
//   theft(...)       unseen: nothing now, but the owner notices later and talk spreads. Seen: each witness
//                    reacts by personality and role — the owner confronts, the tough attack, the warm shout
//                    for the Ward, the nervous run, the player's friends look away. Heat, Standing, the thief
//                    mark, memory and rumour follow.
//   pickpocket       from behind or while they're busy: a timing mini-game; failure alerts them
//   lockpick         a tension mini-game; picks can snap; some locks need a key instead
//   fence            Sal at the Portage dock buys stolen goods at a discount, with a trust/risk model
//   caught           with enough Heat a Ward crew can stop you: pay the fine, do the time, or fight
//   bounty           a seen killing puts a price on you until it's paid
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Crime {
  constructor(ctx, ix) {
    this.ctx = ctx; this.ix = ix;
    this.state = { thief: 0, bounty: 0, robbed: {}, fenceTrust: 0, notices: [], jail: 0 };
    this.buildEye();
  }
  // ---------------------------------------------------------------- who sees
  allNPCs() { const out = []; for (const com of Object.values(this.ctx.state.communities || {})) for (const n of com.npcs || []) if (n.root.visible && !n.dead) out.push(n); return out; }
  agentOf(npc) { return this.ctx.society?.agents.get(npc.def.id); }
  witnesses(pos = this.ctx.player.position, { exclude = null, range = 16 } = {}) {
    const c = this.ctx, eyeP = _w.copy(pos).setY(pos.y + 1.4);
    const night = (c.time.out?.night ?? 0) > 0.5;
    const crouch = c.input.held.crouch || c.player.crouching;
    let R = range * (night && !c.player.flashlight ? 0.5 : 1) * (crouch ? 0.6 : 1) * (c.atmosphere?.indoor > 0.5 ? 0.8 : 1);
    const out = [];
    for (const n of this.allNPCs()) {
      if (n === exclude || n.activity === 'sleep' || n.down) continue;
      const np = n.worldPos(_v).setY(n.worldPos(_v).y + 1.6); const d = np.distanceTo(eyeP);
      if (d > R) continue;
      // facing: the NPC's forward vs the direction to the player; close enough and they hear it anyway
      const h = n.heading + (n.raft?.root.rotation.y || 0), fwdx = Math.sin(h), fwdz = Math.cos(h);
      _d.copy(eyeP).sub(np); const L = _d.length(); _d.normalize();
      const facing = fwdx * _d.x + fwdz * _d.z;
      if (facing < 0.15 && d > 3) continue;
      if (c.collision.raycast(np, _d, L) < L - 0.5) continue;
      const a = this.agentOf(n);
      out.push({ npc: n, agent: a, d, friend: (a?.attitude ?? 0) >= 3 });
    }
    return out;
  }
  // ---------------------------------------------------------------- theft
  // owner: a person id, a shop id ('shop:<id>'), a crew ('crew:<id>'), or null. value: in scrap.
  theft(owner, value, what, pos = this.ctx.player.position) {
    if (!owner || owner === 'player') return { seen: false };
    const c = this.ctx, ws = this.witnesses(pos).filter((w) => !w.friend);
    const ownerNpc = this.ownerNPC(owner);
    if (!ws.length) {
      // unseen: they'll notice later, and talk
      this.state.notices.push({ owner, what, value, day: c.time.day, at: c.time.hour, pos: pos.clone(), noticed: false });
      c.events.emit('crime', { id: 'theft_unseen', owner, what });
      return { seen: false };
    }
    this.eye();
    const heat = Math.min(30, 6 + value / 3);
    c.heat?.add(heat, `Seen stealing ${what}`);
    c.standing?.addRep?.('raftfolk', -Math.min(6, 1 + value / 10));
    this.state.thief += 1;
    const day = c.time.day, reactions = [];
    for (const w of ws.slice(0, 4)) {
      const a = w.agent, t = a?.traits || { courage: 0.5, temper: 0.5, warmth: 0.5 };
      const isOwner = ownerNpc && w.npc === ownerNpc;
      const r = isOwner ? (t.courage > 0.75 && t.temper > 0.55 ? 'attack' : 'confront') : t.courage > 0.8 && t.temper > 0.6 ? 'attack' : t.courage < 0.35 ? 'run' : t.warmth > 0.55 ? 'shout' : 'confront';
      reactions.push({ who: w.npc.def.id, r });
      const name = w.npc.def.name;
      const line = { confront: isOwner ? 'That\'s mine. Put it back. Now.' : 'I saw that. Put it back.', attack: 'Thief! You little—', shout: 'Thief! THIEF! Somebody get the Ward!', run: '—' }[r];
      if (r !== 'run') { c.ui.subtitle(`${name}: ${line}`, 3, 'speech'); c.audio?.speak?.(w.npc.worldPos(new THREE.Vector3()), 1.3, 0.9); }
      if (r === 'shout') c.heat?.add(6, 'Someone called the Ward');
      if (r === 'run') this.flee(w.npc);
      if (r === 'attack') this.ix.npcAttacks(w.npc, 1);
      if (a) { a.memory.push({ day, type: isOwner ? 'robbed by you' : 'saw you steal', about: what }); a.attitude -= isOwner ? 3 : 1; }
    }
    if (ownerNpc) { const a = this.agentOf(ownerNpc); if (a) { this.state.robbed[a.id] = (this.state.robbed[a.id] || 0) + 1; c.society?.spread(a, `${a.name} says the newcomer with the wristband robbed them in broad view.`, 'thief'); } }
    else c.economy?.rumours?.unshift({ day, text: `Somebody was seen lifting ${what} on ${this.where(pos)}. Watch your pockets.` });
    c.events.emit('crime', { id: 'theft_seen', owner, what, reactions });
    return { seen: true, reactions };
  }
  // the owner (person or shopkeeper) as an NPC, if one is around
  ownerNPC(owner) {
    const id = owner.startsWith('shop:') ? this.ctx.data.npcs.npcs.find((n) => n.shop === owner.slice(5))?.id : owner.startsWith('crew:') ? null : owner;
    return id ? this.allNPCs().find((n) => n.def.id === id) || null : null;
  }
  where(p) { let best = 'the water', bd = 300; for (const l of this.ctx.worldMap?.landmarks || []) { const d = Math.hypot(p.x - l.pos[0], p.z - l.pos[1]); if (d < bd) { bd = d; best = l.name; } } return best; }
  flee(npc) { npc.fleeing = true; npc.override = { from: 0, to: 24, do: 'walk', pos: [npc.local.x + 6 * Math.sign(npc.local.x || 1), npc.local.z] }; setTimeout(() => { npc.override = null; npc.fleeing = false; }, 15000); }
  // unseen thefts get noticed a while later: the owner talks, and if you're still close, they look at you
  update(dt) {
    const c = this.ctx;
    this.nT = (this.nT || 0) - dt; if (this.nT > 0) return; this.nT = 2;
    for (const n of this.state.notices) {
      if (n.noticed) continue;
      const hours = (c.time.day - n.day) * 24 + (c.time.hour - n.at);
      if (hours < 0.6) continue;
      n.noticed = true;
      const o = this.ownerNPC(n.owner), a = o && this.agentOf(o);
      if (a) { a.memory.push({ day: c.time.day, type: 'robbed', about: n.what }); c.society?.spread(a, `${a.name} is missing ${n.what}. Nobody saw anything. Nobody ever does.`, 'thief'); }
      if (n.owner.startsWith('shop:')) { c.audio?.play('chimeSwell'); if (c.player.position.distanceTo(n.pos) < 25) { c.ui.whisper('Behind you, a bell starts ringing: the shopkeeper has counted the shelf.'); c.heat?.add(5, 'Shop alarm'); } }
    }
    this.state.notices = this.state.notices.filter((n) => !n.noticed || c.time.day - n.day < 3);
    // a bounty keeps the Ward warm until it's paid
    if (this.state.bounty > 0 && (c.heat?.value ?? 0) < 12) c.heat?.add(12 - c.heat.value, null);
  }
  // ---------------------------------------------------------------- the eye: "someone saw you"
  buildEye() {
    const el = this.eyeEl = document.createElement('div');
    el.innerHTML = '<svg width="34" height="20" viewBox="0 0 34 20"><path d="M2 10 Q17 -4 32 10 Q17 24 2 10Z" fill="none" stroke="#f3d6a0" stroke-width="2"/><circle cx="17" cy="10" r="4.5" fill="#f3d6a0"/></svg>';
    el.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:22;opacity:0;transition:opacity .25s;pointer-events:none;filter:drop-shadow(0 0 6px #000)';
    document.body.appendChild(el);
  }
  eye() { this.eyeEl.style.opacity = 1; clearTimeout(this.eyeT); this.eyeT = setTimeout(() => (this.eyeEl.style.opacity = 0), 1800); this.ctx.events.emit('crime:seen'); }

  // ---------------------------------------------------------------- mini-games (DOM overlays; keyboard E/Space, pad Square/Cross, click)
  // a needle sweeps a bar; stop it in the window. hits = how many windows in a row; window shrinks with level.
  minigame({ title, hits = 1, window = 0.18, speed = 1.6, onDone }) {
    const c = this.ctx; c.paused = true; c.input.enabled = false; this.inGame = true;
    const el = document.createElement('div');
    el.className = 'minigame';
    el.style.cssText = 'position:fixed;left:50%;top:58%;transform:translate(-50%,-50%);z-index:60;width:340px;padding:12px 14px;background:rgba(12,12,12,.85);border:1px solid rgba(230,200,140,.5);font:14px Georgia;color:#efe5d0;text-align:center';
    el.innerHTML = `<div>${title}</div><div style="position:relative;height:18px;margin:10px 0;background:#2a2622;border:1px solid #555"><div class="win" style="position:absolute;top:0;bottom:0;background:rgba(120,180,110,.6)"></div><div class="nd" style="position:absolute;top:-3px;bottom:-3px;width:3px;background:#f3e3c0"></div></div><div class="hint" style="opacity:.7;font-size:12px">${c.input.usingPad ? '□' : 'E / click'} to stop · Esc to give up · <span class="cnt"></span></div>`;
    document.body.appendChild(el);
    const win = el.querySelector('.win'), nd = el.querySelector('.nd'), cnt = el.querySelector('.cnt');
    let t = Math.random() * 3, got = 0, w0 = 0.15 + Math.random() * (0.85 - window - 0.15), done = false;
    const place = () => { w0 = 0.08 + Math.random() * (0.92 - window - 0.08); win.style.left = w0 * 100 + '%'; win.style.width = window * 100 + '%'; cnt.textContent = `${got}/${hits}`; };
    place();
    const finish = (ok) => { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('keydown', key, true); el.remove(); c.paused = false; c.input.enabled = true; this.inGame = false; onDone(ok); };
    const hit = () => { c.audio?.started && c.audio.synth.click?.(c.audio.ui, 700 + Math.random() * 400); const x = (Math.sin(t * speed * 2) + 1) / 2; if (x >= w0 && x <= w0 + window) { got++; c.audio?.started && c.audio.synth.click?.(c.audio.ui, 1600); if (got >= hits) finish(true); else place(); } else finish(false); };
    const key = (e) => { if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); hit(); } if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
    addEventListener('keydown', key, true); el.addEventListener('pointerdown', hit);
    let last = performance.now(), raf = 0, padHeld = false;
    const loop = (now) => { t += (now - last) / 1000; last = now; nd.style.left = ((Math.sin(t * speed * 2) + 1) / 2) * 100 + '%';
      const gp = navigator.getGamepads?.()[0]; const b = gp?.buttons?.[2]?.pressed || gp?.buttons?.[0]?.pressed; if (b && !padHeld) hit(); padHeld = !!b;
      raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    this.activeGame = { hit, finish };   // tests drive it directly
    return this.activeGame;
  }
  // ---------------------------------------------------------------- pickpocketing
  canPickpocket(npc) {
    const c = this.ctx, p = c.player.position, np = npc.worldPos(_v);
    if (np.distanceTo(p) > 1.6 || npc.activity === 'sleep' || npc.down) return false;
    const h = npc.heading + (npc.raft?.root.rotation.y || 0), fx = Math.sin(h), fz = Math.cos(h);
    _d.copy(p).sub(np).setY(0).normalize();
    const behind = fx * _d.x + fz * _d.z < -0.2;
    const busy = npc.talkT > 0 || npc.chatTalk || /cook|repair|hammer|mend|haul|garden|laundry|sell/.test(npc.activity || '');
    return behind || busy;
  }
  pickpocket(npc, { result = null } = {}) {
    const c = this.ctx, a = this.agentOf(npc), name = npc.def.name;
    const hard = (a?.traits.caution ?? 0.5);
    const done = (ok) => {
      if (ok === null) return;
      if (ok) {
        const loot = this.pocketsOf(npc);
        for (const [id, n] of Object.entries(loot)) this.ix.give(id, n, { stolen: true });
        c.ui.toast(`Lifted: ${Object.entries(loot).map(([id, n]) => `${this.ix.items.def(id)?.name}${n > 1 ? ' ×' + n : ''}`).join(', ')}`);
        const seen = this.witnesses(c.player.position, { exclude: npc }).filter((w) => !w.friend);
        if (seen.length) this.theft(npc.def.id, 6, `${name}'s pocket`);
        else { this.state.notices.push({ owner: npc.def.id, what: 'coin from a pocket', value: 4, day: c.time.day, at: c.time.hour, pos: c.player.position.clone(), noticed: false }); }
        c.events.emit('crime', { id: 'pickpocket', who: npc.def.id, ok: true });
      } else {
        c.ui.subtitle(`${name}: Oi — hands! I felt that!`, 3, 'speech');
        if (a) { a.memory.push({ day: c.time.day, type: 'pickpocketed by you' }); a.attitude -= 2; }
        npc.heading = Math.atan2(c.player.position.x - npc.worldPos(_v).x, c.player.position.z - npc.worldPos(_v).z) - (npc.raft?.root.rotation.y || 0);
        this.theft(npc.def.id, 4, `${name}'s pocket`);
        if ((a?.traits.courage ?? 0) > 0.75) this.ix.npcAttacks(npc, 1);
        c.events.emit('crime', { id: 'pickpocket', who: npc.def.id, ok: false });
      }
    };
    if (result !== null) { done(result); return result; }
    return this.minigame({ title: `Pickpocketing ${name}…`, hits: 1, window: 0.22 - hard * 0.1, speed: 1.4 + hard, onDone: done });
  }
  pocketsOf(npc) {
    let s = 0; for (const ch of npc.def.id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const day = this.ctx.time.day; if ((this.state.robbed[npc.def.id + ':pocket'] || -1) === day) return { scrap: 1 };
    this.state.robbed[npc.def.id + ':pocket'] = day;
    const out = { scrap: 2 + (s % 6) };
    if (s % 3 === 0) out.ration_bar = 1;
    if (s % 5 === 0) out.silver_ring = 1;
    if (s % 7 === 0) out.lockpick = 1;
    return out;
  }
  // ---------------------------------------------------------------- locks
  // container.lock = { kind: 'pick', level: 0..1 } | { kind: 'key', key: '<item id>' }
  unlock(cont, { result = null } = {}) {
    const c = this.ctx, L = cont.lock;
    if (!L || cont.unlocked) return Promise.resolve(true);
    if (L.kind === 'key') {
      if (c.inventory.has(L.key)) { cont.unlocked = true; cont.touched = true; c.ui.toast(`Unlocked with ${this.ix.items.def(L.key)?.name}.`); return Promise.resolve(true); }
      c.ui.toast('Locked. It needs a key.'); return Promise.resolve(false);
    }
    if (!c.inventory.has('lockpick')) { c.ui.toast('Locked. You need a lockpick.'); return Promise.resolve(false); }
    return new Promise((res) => {
      const done = (ok) => {
        if (ok) { cont.unlocked = true; cont.touched = true; c.audio?.started && c.audio.synth.click?.(c.audio.ui, 900); c.ui.toast('The lock gives.'); }
        else if (ok === false) { if (Math.random() < 0.45) { c.inventory.remove('lockpick'); c.ui.toast('Snap. The pick breaks in the lock.'); } else c.ui.toast('The pins drop. Try again.'); this.ctx.events.emit('noise', { pos: c.player.position.clone(), level: 0.35 }); }
        res(!!ok);
      };
      if (result !== null) { done(result); return; }
      this.minigame({ title: 'Picking the lock — feel for the pins', hits: 2 + Math.round((L.level || 0.3) * 2), window: 0.2 - (L.level || 0.3) * 0.08, speed: 1.2 + (L.level || 0.3), onDone: done });
    });
  }
  // ---------------------------------------------------------------- the fence
  fenceOffer(id, n = 1) {
    const d = this.ix.items.def(id); const trust = Math.min(1, this.state.fenceTrust / 10);
    return Math.max(1, Math.floor((d?.value || 1) * n * (0.35 + trust * 0.2) * (this.state.thief > 6 ? 0.85 : 1)));
  }
  fence(id, n = 1) {
    const inv = this.ctx.inventory, st = inv.stolen?.[id] || 0; if (st < n) return 0;
    const pay = this.fenceOffer(id, n);
    inv.remove(id, n, { stolen: true }); inv.add('scrap', pay, true);
    this.state.fenceTrust += 1;
    // a fence is a risk: now and then the Ward is watching him
    if (Math.random() < 0.05 * Math.max(0, 3 - this.state.fenceTrust / 4)) { this.ctx.heat?.add(10, 'The fence was being watched'); this.ctx.ui.whisper('Sal goes very still and looks past your shoulder. "Don\'t turn around. Walk away slowly."'); }
    return pay;
  }
  // ---------------------------------------------------------------- caught
  // a Ward crew stops you: fine, time, or fight
  caught(reason = 'theft') {
    const c = this.ctx, inv = c.inventory;
    const fine = Math.max(5, Math.round((c.heat?.value || 10) / 2 + this.state.bounty));
    return new Promise((res) => {
      c.ui.openPanel?.('caught', `<h2>The Ward</h2><div class="sub">Two Wardens and a hook-pole. "${reason === 'murder' ? 'You\'re coming with us.' : 'Turn out your pockets.'}"</div>
        <div class="tabs"><button class="btn" data-a="pay" ${inv.has('scrap', fine) ? '' : 'disabled'}>Pay the fine (${fine} scrap)</button><button class="btn" data-a="time">Do the time</button><button class="btn" data-a="fight">Fight your way out</button></div>`, (p) => {
        p.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { c.ui.close(); res(this.resolveCaught(b.dataset.a, fine)); }));
      });
    });
  }
  resolveCaught(choice, fine) {
    const c = this.ctx, inv = c.inventory;
    const confiscate = () => { let n = 0; for (const [id, k] of Object.entries(inv.stolen || {})) { if (k > 0) { inv.remove(id, k, { stolen: true }); n += k; } } if ((inv.items.lockpick || 0) > 0) inv.remove('lockpick', inv.items.lockpick); return n; };
    if (choice === 'pay') { inv.remove('scrap', fine); const n = confiscate(); c.heat?.clear('fined'); this.state.bounty = 0; c.ui.whisper(`They count your scrap twice, take ${n ? 'the stolen goods and ' : ''}the fine, and let you go with a warning you won't remember.`); }
    else if (choice === 'time') { const n = confiscate(); c.time.hour += 12; if (c.time.hour >= 24) { c.time.hour -= 24; c.time.day++; } this.state.jail++; c.heat?.clear('served'); this.state.bounty = 0; c.standing?.addRep?.('tide_wardens', 2); c.ui.whisper(`Twelve hours in a flooded cell on a Ward hulk. They keep ${n ? 'everything you stole' : 'your belt'}. You come out stiff, cold and square with them.`); }
    else { c.heat?.add(25, 'Fought the Ward'); c.ui.whisper('You go for the nearest one. Whistles, shouting — now it is a real fight.'); }
    c.events.emit('crime:caught', { choice });
    return choice;
  }
  toJSON() { return { ...this.state, notices: this.state.notices.map(({ pos, ...n }) => n) }; }
  load(o) { this.state = { thief: 0, bounty: 0, robbed: {}, fenceTrust: 0, notices: [], jail: 0, ...(o || {}) }; for (const n of this.state.notices) n.pos ||= new THREE.Vector3(); }
}
