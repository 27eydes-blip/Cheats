// The interaction layer: what the player can DO to the world, and how the world answers.
// Items.js holds loose items and containers; Crime.js decides who saw what. This file ties them to the game:
//   pickup (E, hold E for everything in reach), containers (open / pick / key, take or take all), the new
//   inventory (categories, weight and slots, stolen markers, use / equip / drop / throw / inspect / compare,
//   hotbar 5–9 and D-pad), overload, boat hold and safehouse chest; fighting people (hit zones from the aim
//   ray, bleeding, stagger, knockdown, knock-outs from behind, death), bodies (search, drag, hide, dump), found
//   bodies, revenge; surrender at weapon-point and robbery (comply / resist / alarm / hidden weapon); shops
//   (haggle, closed when the owner is dead, till), the fence, cash on the HUD; the bar weapons rule.
import * as THREE from 'three';
import { Items, MAX_LOOSE } from './Items.js';
import { Crime } from './Crime.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SLOTS = 24, HOTKEYS = ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

export class Interaction {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = new Items(ctx);
    this.crime = new Crime(ctx, this);
    this.state = { hotbar: [null, null, null, null, null], haggle: {}, closed: {}, bodies: {}, stash: {} };
    this.hostiles = []; this.drag = null; this.aimT = 0; this.holdT = 0; this.tookAll = false;
    this.inv = ctx.inventory;
    this.patchInventory(ctx.inventory); this.patchInventory(ctx.boatStorage);
    this.patchGame();
    this.registerInteractables();
    addEventListener('keydown', (e) => {
      if (ctx.mode !== 'play' || ctx.ui.open || this.crime.inGame) return;
      const i = HOTKEYS.indexOf(e.code); if (i >= 0) this.useHotbar(i);
    });
    // the controller's quick items (D-pad left/right to pick, down to use; G on the keyboard) start with the hotbar
    const pad = ctx.pad;
    if (pad?.quickItems) { const q = pad.quickItems.bind(pad); pad.quickItems = () => [...new Set([...this.state.hotbar.filter((id) => id && this.inv.has(id)), ...q()])]; }
    // crimes make the news: the feed the radio reads from, and the rumour boards
    ctx.events.on('people:killed', (e) => { if (e.seen) ctx.events.emit('fame', { kind: 'villain', text: `A killing on ${this.crime.where(ctx.player.position)}, in front of witnesses. The Ward has a description.` }); });
    ctx.events.on('crime', (e) => {
      if (e.id === 'robbery_shop') ctx.events.emit('fame', { kind: 'villain', text: `A shop on ${this.crime.where(ctx.player.position)} was held up at weapon-point. The till's empty and the owner's shaking.` });
      if (e.id === 'theft_seen' && this.crime.state.thief === 3) ctx.events.emit('fame', { kind: 'villain', text: 'Market folk are passing a description around: a thief with a Deep-Born wristband. Hold on to your purses.' });
    });
    this.buildHud();
  }
  // ---------------------------------------------------------------- inventory: stolen counts, slots, weight
  patchInventory(inv) {
    if (!inv || inv._ix) return; inv._ix = true;
    inv.stolen = inv.stolen || {};
    const add = inv.add.bind(inv), remove = inv.remove.bind(inv), toJSON = inv.toJSON.bind(inv), load = inv.load.bind(inv);
    inv.add = (id, n = 1, silent = false, o = {}) => { const r = add(id, n, silent); if (r && o.stolen) inv.stolen[id] = (inv.stolen[id] || 0) + n; return r; };
    // clean goods go first, unless the stolen ones are asked for (fence, confiscation)
    inv.remove = (id, n = 1, o = {}) => {
      const before = inv.count(id); if (!remove(id, n)) return false;
      const st = inv.stolen[id] || 0, clean = before - st;
      const fromStolen = o.stolen ? Math.min(st, n) : Math.max(0, n - clean);
      if (fromStolen) { inv.stolen[id] = st - fromStolen; if (inv.stolen[id] <= 0) delete inv.stolen[id]; }
      return true;
    };
    inv.toJSON = () => ({ ...toJSON(), __stolen: { ...inv.stolen } });
    inv.load = (o) => { const { __stolen, ...rest } = o || {}; load(rest); inv.stolen = { ...(__stolen || {}) }; };
    inv.slotsUsed = () => Object.keys(inv.items).length;
  }
  give(id, n = 1, o = {}) {
    const inv = this.inv, d = this.items.def(id); if (!d) return 0;
    if (!inv.items[id] && inv.slotsUsed() >= SLOTS) { this.ctx.ui.toast('No room in your pack.'); return 0; }
    return inv.add(id, n, true, o);
  }
  load01() { return this.inv.weight() / (this.inv.capacity || 25); }   // >1 = overloaded

  // ---------------------------------------------------------------- hooks into existing systems
  patchGame() {
    const c = this.ctx;
    // overload slows you; badly overloaded, no running
    const sv = c.survival;
    if (sv) {
      const mf = sv.moveFactor.bind(sv), cs = sv.canSprint.bind(sv);
      sv.moveFactor = () => mf() * (this.load01() > 1 ? Math.max(0.45, 1 - (this.load01() - 1) * 1.1) : 1);
      sv.canSprint = () => cs() && this.load01() <= 1.25;
    }
    // shops: haggled prices, closed shops
    const tr = c.trade;
    if (tr) {
      const price = tr.price.bind(tr), buy = tr.buy.bind(tr);
      tr.price = (shopId, item) => Math.max(1, Math.round(price(shopId, item) * (this.state.haggle[shopId]?.day === c.time.day ? this.state.haggle[shopId].k : 1) * (this.crime.state.thief >= 3 ? 1.2 : 1)));
      tr.buy = (shopId, item) => { if (this.isClosed(shopId)) { c.ui.toast('Shuttered. Nobody is serving.'); return false; } return buy(shopId, item); };
    }
    // the new inventory screen; the shop screen gets Haggle and Hold up
    c.ui.openInventory = () => this.openInventory();
    const openShop = c.ui.openShop.bind(c.ui);
    c.ui.openShop = (shopId, stepId, who) => {
      if (shopId && this.isClosed(shopId)) { c.ui.showNote('Closed', 'The shutters are down and nobody answers. A chalk line on the board: CLOSED — FAMILY.'); return; }
      openShop(shopId, stepId, who); if (shopId) this.decorateShop(shopId);
    };
    // fighting people: Arms calls this for every hit on an NPC
    if (c.arms) c.arms.hitNPC = (npc, dmg, stun, heavy) => this.hitPerson(npc, dmg, stun, heavy);
  }
  isClosed(shopId) { return (this.state.closed[shopId] || -1) > this.ctx.time.day; }

  // ---------------------------------------------------------------- interactables
  registerInteractables() {
    const c = this.ctx, I = c.interact;
    // the loose item you're looking at
    I.add({ id: 'ix:item', kind: 'pickup', mode: 'foot', radius: 2.8, requireLook: false, priority: 2,
      pos: (v) => (this.lookItem ? v.set(this.lookItem.x, this.lookItem.y + 0.05, this.lookItem.z) : v.set(0, -999, 0)),
      enabled: () => !!this.lookItem && !this.drag,
      prompt: () => { const it = this.lookItem; if (!it) return ''; const owned = it.owner && it.owner !== 'player'; return `${owned ? 'Steal' : 'Pick up'} ${this.items.label(it)}`; },
      onUse: () => { if (this.lookItem) this.pickup(this.lookItem); return true; } });
    // crouched behind (or beside a busy) someone: their pocket
    I.add({ id: 'ix:pocket', kind: 'crime', mode: 'foot', radius: 2, requireLook: false, priority: 3,
      pos: (v) => (this.ppTarget ? this.ppTarget.worldPos(v).setY(this.ppTarget.worldPos(_w).y + 1) : v.set(0, -999, 0)),
      enabled: () => !!this.ppTarget, prompt: () => `Pickpocket ${this.ppTarget?.def.name}`, onUse: () => { if (this.ppTarget) this.crime.pickpocket(this.ppTarget); return true; } });
    // someone with their hands up
    I.add({ id: 'ix:robbed', kind: 'crime', mode: 'foot', radius: 2.4, requireLook: false, priority: 4,
      pos: (v) => (this.surrendered ? this.surrendered.worldPos(v).setY(this.surrendered.worldPos(_w).y + 1.2) : v.set(0, -999, 0)),
      enabled: () => !!this.surrendered && this.surrendered.surrender > performance.now() / 1000,
      prompt: () => (this.surrendered?.def.shop || this.isBartender(this.surrendered) ? `Empty the till (${this.surrendered.def.name})` : `Take ${this.surrendered?.def.name}'s valuables`),
      onUse: () => { this.rob(this.surrendered); return true; } });
    // a body you're next to
    I.add({ id: 'ix:body', kind: 'body', mode: 'foot', radius: 2.2, requireLook: false, priority: 3,
      pos: (v) => (this.nearBody ? this.nearBody.npc.worldPos(v).setY(this.nearBody.npc.worldPos(_w).y + 0.3) : v.set(0, -999, 0)),
      enabled: () => !!this.nearBody && !this.drag, prompt: () => (this.nearBody.down && !this.nearBody.dead ? (this.inv.has('rope') && !this.nearBody.npc.tied ? `Tie up ${this.nearBody.npc.def.name}` : `${this.nearBody.npc.def.name} — out cold`) : `Search ${this.nearBody?.npc.def.name}`),
      onUse: () => { const b = this.nearBody; if (b.dead) this.openContainer(this.bodyContainer(b)); else if (this.inv.has('rope') && !b.npc.tied) this.tie(b.npc); return true; } });
    // the fence: Sal on the Portage dock
    I.add({ id: 'ix:fence', kind: 'talk', mode: 'foot', radius: 2.6, requireLook: true,
      pos: (v) => { const n = this.crime.allNPCs().find((x) => x.def.id === 'sal'); return n ? n.worldPos(v).setY(n.worldPos(_w).y + 1.3).add(_d.set(0.4, 0, 0)) : v.set(0, -999, 0); },
      enabled: () => Object.values(this.inv.stolen || {}).some((n) => n > 0) && this.crime.allNPCs().some((x) => x.def.id === 'sal' && !x.dead),
      prompt: 'Quiet word with Sal (fence)', onUse: () => { this.openFence(); return true; } });
    // the safehouse: a bunk and a chest on the Portage sleeping pontoon
    I.add({ id: 'ix:bunk', kind: 'rest', mode: 'foot', radius: 2.2,
      pos: (v) => { const r = c.state.communities?.portage?.rafts.get('sleep1'); return r ? r.worldPoint(v.set(1.6, r.deck + 0.5, -1.4), v) : v.set(0, -999, 0); },
      prompt: 'Your bunk — rest, heal, save', onUse: () => { this.rest(); return true; } });
    this.items.addContainer({ id: 'safehouse', kind: 'chest', label: 'Your chest', owner: 'player', lock: null, items: {} });
    I.add({ id: 'ix:chest', kind: 'container', mode: 'foot', radius: 2.2,
      pos: (v) => { const r = c.state.communities?.portage?.rafts.get('sleep1'); return r ? r.worldPoint(v.set(2.4, r.deck + 0.4, -1.4), v) : v.set(0, -999, 0); },
      prompt: 'Your chest (stash)', onUse: () => { this.openContainer(this.items.containers.get('safehouse')); return true; } });
  }
  // world containers and stocked shelves, built once per community as it streams in
  seedCommunity(id, com) {
    if (!com || com._ixSeeded) return; com._ixSeeded = true;
    const c = this.ctx, npcs = c.data.npcs.npcs;
    const residentOf = (raftId) => npcs.find((n) => n.raft === raftId && !n.shop)?.id || npcs.find((n) => n.raft === raftId)?.id || null;
    const at = (raftId, x, y, z) => (v) => { const r = c.state.communities?.[id]?.rafts.get(raftId); return r ? r.worldPoint(v.set(x, r.deck + y, z), v) : v.set(0, -999, 0); };
    let n = 0;
    for (const [rid, r] of com.rafts) {
      const spots = r.info?.spots || [];
      const owner = residentOf(rid);
      // a crate on every working raft; a locker where there's a workbench; a cupboard by the cooking spot
      const choose = spots.filter((s) => /stall|cook|workbench|container|laundry|garden/.test(s.kind)).slice(0, 2);
      if (r.info?.workbench) choose.push({ kind: 'locker', x: r.info.workbench.x + 0.9, z: r.info.workbench.z });
      for (const s of choose) {
        const kind = s.kind === 'cook' ? 'cupboard' : s.kind === 'locker' || s.kind === 'workbench' ? 'locker' : 'crate';
        const cid = `${id}:${rid}:${kind}:${n++}`;
        const shopNpc = npcs.find((x) => x.raft === rid && x.shop);
        const cont = this.items.addContainer({ id: cid, kind, label: { crate: 'Crate', locker: 'Locker', cupboard: 'Cupboard' }[kind], owner: shopNpc ? 'shop:' + shopNpc.shop : owner,
          lock: kind === 'locker' ? { kind: 'pick', level: 0.45 } : kind === 'crate' && n % 3 === 0 ? { kind: 'key', key: 'raft_key' } : null,
          table: kind === 'cupboard' ? 'cabinet' : kind === 'locker' ? 'locker' : 'crate', pos: at(rid, s.x + 0.6, 0.45, s.z + 0.6) });
        const p = this.items.pendingContainers?.[cid]; if (p) Object.assign(cont, { items: p.items, opened: p.opened, unlocked: p.unlocked, touched: true, rolled: true });
        c.interact.add({ id: 'ix:c:' + cid, kind: 'container', mode: 'foot', radius: 2, pos: cont.pos,
          prompt: () => `${cont.lock && !cont.unlocked ? (cont.lock.kind === 'key' ? 'Locked ' : 'Pick the lock: ') : 'Open '}${cont.label.toLowerCase()}${cont.owner && cont.owner !== 'player' ? ' (not yours)' : ''}`,
          onUse: () => { this.openContainer(cont); return true; } });
      }
      // a few things lying about on decks (somebody's), some unowned driftwood finds at the edges
      if (n % 2 === 0) { const s0 = spots[0] || { x: 0, z: 0 }; this.items.drop(pick(['bottle', 'rope', 'cloth', 'tea', 'scrap']), 1, at(rid, s0.x - 0.7, 0.02, s0.z)(new THREE.Vector3()), { owner, isStatic: true }).rl = { com: id, raft: rid, x: s0.x - 0.7, y: 0.02, z: s0.z }; }
    }
    // the market stall's display: the shop's own goods, watched by the shopkeeper (shoplifting)
    if (id === 'portage') {
      const mk = 'market';
      ['ration_bar', 'canned_fish', 'oil', 'salt'].forEach((it, i) => { const pos = at(mk, 1.2 + i * 0.35, 1.0, 0.4)(new THREE.Vector3()); const o = this.items.drop(it, 1, pos, { owner: 'shop:portage_exchange', isStatic: true }); o.rl = { com: id, raft: mk, x: 1.2 + i * 0.35, y: 1.0, z: 0.4 }; o.sid = `${id}:display:${i}`; });
    }
    for (const it of this.items.loose) if (it.rl && !it.sid) it.sid = `${it.rl.com}:${it.rl.raft}:${it.id}`;
    this.items.loose = this.items.loose.filter((it) => !(it.sid && this.items.takenStatic?.has(it.sid)));
  }
  // unowned finds: the start tower and floating salvage around the city
  seedWorld() {
    if (this.seeded) return; this.seeded = true;
    const c = this.ctx, lc = c.worldMap?.landmarks.find((l) => l.kind === 'start_tower')?.pos || [-262, 222];
    const ground = (x, z) => { const g = c.collision.groundAt(x, z); return Number.isFinite(g) && g > -50 ? g : 0; };
    [['lockpick', 1, 1.5, 9], ['bandage', 1, -1.2, 10], ['ration_bar', 1, 0.5, 8.4], ['silver_ring', 1, -0.4, 11]].forEach(([id, n, dx, dz], i) => { const it = this.items.drop(id, n, new THREE.Vector3(lc[0] + dx, ground(lc[0] + dx, lc[1] + dz) + 0.02, lc[1] + dz), { isStatic: true }); it.sid = `start:${i}`; });
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 30; i++) { const x = (r() - 0.5) * 900, z = (r() - 0.5) * 900; const it = this.items.drop(pick(['bottle', 'scrap', 'rope', 'canned_fish', 'fuel_can', 'old_book', 'clean_water']), 1, new THREE.Vector3(x, 0, z), { isStatic: true }); it.floating = true; it.sid = `drift:${i}`; }
    this.items.loose = this.items.loose.filter((it) => !(it.sid && this.items.takenStatic?.has(it.sid)));
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const c = this.ctx; if (c.mode !== 'play') return;
    this.seedWorld();
    for (const [id, com] of Object.entries(c.state.communities || {})) this.seedCommunity(id, com);
    // raft-bound items ride their raft
    for (const it of this.items.awake) if (it.rl && !it.vel) { const r = c.state.communities?.[it.rl.com]?.rafts.get(it.rl.raft); if (r) { r.worldPoint(_v.set(it.rl.x, r.deck + it.rl.y, it.rl.z), _v); it.x = _v.x; it.y = _v.y; it.z = _v.z; } }
    this.items.update(dt);
    this.crime.update(dt);
    const eye = c.player.eye, fwd = c.player.forward;
    this.lookItem = c.player.mode === 'boat' || c.ui.open ? null : this.items.looked(eye, fwd);
    // hold E: take everything in reach (once per hold)
    if (c.input.held.use && !c.ui.open && c.player.mode !== 'boat') { this.holdT += dt; if (this.holdT > 0.55 && !this.tookAll) { this.tookAll = true; this.takeAll(); } } else { this.holdT = 0; this.tookAll = false; }
    // who could be pickpocketed right now (crouched, close, from behind or while they're busy)
    this.ppTarget = null;
    if (c.input.held.crouch && !c.arms?.drawn) { let bd = 1.7; for (const n of this.crime.allNPCs()) { const d = n.worldPos(_v).distanceTo(c.player.position); if (d < bd && !n.dead && !n.down && this.crime.canPickpocket(n)) { bd = d; this.ppTarget = n; } } }
    this.updateCombat(dt);
    this.updateBodies(dt);
    this.updateBarRule(dt);
    this.updateHud();
  }

  // ---------------------------------------------------------------- pickup / drop / throw
  pickup(it, quiet = false) {
    const c = this.ctx, d = this.items.def(it.id);
    if (this.inv.weight() + (d?.weight || 0) * it.n > (this.inv.capacity || 25) * 1.6) { c.ui.toast('Too heavy to carry any more.'); return false; }
    const owned = it.owner && it.owner !== 'player';
    const got = this.give(it.id, it.n, { stolen: owned || it.stolen }); if (!got) return false;
    this.items.remove(it); if (it.sid) (this.items.takenStatic ||= new Set()).add(it.sid);
    if (!quiet) { c.ui.toast(`${owned ? 'Took' : 'Picked up'} ${d?.name}${it.n > 1 ? ' ×' + it.n : ''}`); c.audio?.play('pickup'); }
    if (owned) this.crime.theft(it.owner, (d?.value || 1) * it.n, d?.name || it.id, new THREE.Vector3(it.x, it.y, it.z));
    c.events.emit('item:pickup', { id: it.id, n: it.n, stolen: owned });
    return true;
  }
  takeAll() {
    const near = this.items.inReach(this.ctx.player.position, 2.6); if (!near.length) return 0;
    let n = 0; for (const it of near) if (this.pickup(it, true)) n++;
    if (n) { this.ctx.ui.toast(`Took ${n} thing${n > 1 ? 's' : ''}.`); this.ctx.audio?.play('pickup'); }
    return n;
  }
  dropItem(id, n = 1, throwIt = false) {
    const c = this.ctx; if (!this.inv.has(id, n)) return null;
    const stolen = Math.min(n, this.inv.stolen[id] || 0);
    this.inv.remove(id, n, { stolen: stolen > 0 });
    const fwd = c.player.forward, pos = c.player.eye.clone().addScaledVector(fwd, 0.5); pos.y -= 0.3;
    const it = this.items.drop(id, n, pos, { stolen: stolen > 0, vel: throwIt ? fwd.clone().multiplyScalar(9).setY(fwd.y * 9 + 3) : new THREE.Vector3(fwd.x * 0.6, 0.5, fwd.z * 0.6) });
    it.awake = true; this.items.awake.push(it); if (this.items.awake.length > MAX_LOOSE) { const old = this.items.awake.shift(); old.awake = false; old.vel = null; }
    if (throwIt) { c.events.on && setTimeout(() => c.events.emit('noise', { pos: new THREE.Vector3(it.x, it.y, it.z), level: 0.6 }), 700); }
    return it;
  }
  useHotbar(i) { const id = this.state.hotbar[i]; if (!id) return; if (!this.inv.has(id)) { this.ctx.ui.toast('None left.'); return; } this.useItem(id); }
  throwHotbar() { const id = this.state.hotbar.find((x) => x && this.inv.has(x)); if (id) this.dropItem(id, 1, true); }
  useItem(id) {
    const c = this.ctx, d = this.items.def(id);
    if (d?.use?.intox) { c.inventory.remove(id); c.nightlife?.drink?.(d.use.intox) ?? null; if (d.use.thirst) c.survival.apply({ thirst: d.use.thirst }); c.ui.toast(`${d.name}. Warm going down.`); return true; }
    if (d?.use?.heal) { c.inventory.remove(id); if (c.injury) c.injury.health = Math.min(100, c.injury.health + d.use.heal); c.ui.toast(`${d.name}: a little better.`); return true; }
    if (d?.use?.mood) { c.inventory.remove(id); c.survival.apply({ fatigue: d.use.mood }); c.ui.toast(`${d.name}.`); return true; }
    const ok = c.survival.useItem(id); if (!ok && !d?.use) c.ui.toast('You can\'t use that.');
    return ok;
  }

  // ---------------------------------------------------------------- containers
  rollContainer(cont) {
    if (cont.rolled) return; cont.rolled = true;
    const tabs = this.ctx.data.lootTables || {}, t = tabs[cont.table] ? cont.table : Object.keys(tabs)[0];
    for (const { item, n } of this.ctx.loot.roll(cont.id, t)) if (this.items.def(item)) cont.items[item] = (cont.items[item] || 0) + n;
    if (cont.owner && /^shop:/.test(cont.owner) && cont.kind === 'till') cont.items.scrap = (cont.items.scrap || 0) + 15;
  }
  async openContainer(cont) {
    const c = this.ctx;
    if (cont.lock && !cont.unlocked) { const ok = await this.crime.unlock(cont); if (!ok) return; }
    this.rollContainer(cont); cont.opened = true; cont.touched = true;
    c.audio?.started && c.audio.synth.creak?.(c.audio.world, false);
    const owned = cont.owner && cont.owner !== 'player';
    const watched = owned ? this.crime.witnesses().filter((w) => !w.friend).length : 0;
    const render = () => {
      const rows = Object.entries(cont.items).filter(([, n]) => n > 0).map(([id, n]) => c.ui.itemRow(id, n, `<button class="btn" data-take="${id}">Take</button>`)).join('') || '<div class="sub">Empty.</div>';
      const mine = cont.owner === 'player' ? `<h3>Put in</h3>${this.inv.list().map(({ id, n }) => c.ui.itemRow(id, n, `<button class="btn" data-put="${id}">Put</button>`)).join('') || '<div class="sub">Nothing to put in.</div>'}` : '';
      const body = cont.kind === 'body' ? `<div class="tabs"><button class="btn" data-drag>Drag the body</button><button class="btn" data-hide>Hide it here</button><button class="btn" data-dump ${this.overWater() ? '' : 'disabled'}>Into the water${this.overWater() ? '' : ' (get to the edge)'}</button></div>` : '';
      return `<button class="btn close" data-close>Close</button><h2>${esc(cont.label)}</h2><div class="sub">${owned ? `Not yours${watched ? ` · <span style="color:#e89070">someone can see you</span>` : ''}` : cont.kind === 'body' ? 'Their pockets, their bag.' : 'Yours.'}</div>${rows}<div class="tabs"><button class="btn" data-all>Take all</button></div>${body}${mine}`;
    };
    const take = (id, n) => {
      const got = this.give(id, n, { stolen: owned }); if (!got) return;
      cont.items[id] -= n; if (cont.items[id] <= 0) delete cont.items[id];
      if (owned) this.crime.theft(cont.owner, (this.items.def(id)?.value || 1) * n, this.items.def(id)?.name || id);
    };
    c.ui.openPanel('container', render(), (p) => {
      const bind = (q) => {
        q.querySelectorAll('[data-take]').forEach((b) => b.addEventListener('click', () => { take(b.dataset.take, cont.items[b.dataset.take]); c.audio?.play('pickup'); q.innerHTML = render(); bind(q); }));
        q.querySelector('[data-all]')?.addEventListener('click', () => { for (const [id, n] of Object.entries(cont.items)) take(id, n); c.audio?.play('pickup'); q.innerHTML = render(); bind(q); });
        q.querySelectorAll('[data-put]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.put, n = this.inv.count(id); this.inv.remove(id, n); cont.items[id] = (cont.items[id] || 0) + n; q.innerHTML = render(); bind(q); }));
        q.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => c.ui.close()));
        const npc = cont.kind === 'body' ? this.deadNPCs().find((x) => x.def.id === cont.owner) : null;
        q.querySelector('[data-drag]')?.addEventListener('click', () => { c.ui.close(); if (npc) this.startDrag(npc); });
        q.querySelector('[data-hide]')?.addEventListener('click', () => { c.ui.close(); if (npc) this.hide(npc); });
        q.querySelector('[data-dump]')?.addEventListener('click', () => { c.ui.close(); if (npc) this.dump(npc); });
      };
      bind(p);
    });
    c.events.emit('container:open', { id: cont.id });
    return cont;
  }

  // ---------------------------------------------------------------- fighting people
  isBartender(npc) { return !!npc && /bar|tender/.test(npc.def.role || '') || !!this.ctx.data.nightlife?.bars?.some?.((b) => b.bartender?.id === npc?.def.id); }
  hitPerson(npc, dmg, stun = 0, heavy = false) {
    const c = this.ctx, a = c.society?.agents.get(npc.def.id), now = performance.now() / 1000;
    if (npc.dead) return;
    // where did it land? the aim ray's closest point to their body axis
    const eye = c.camera.getWorldPosition(new THREE.Vector3()), fwd = c.camera.getWorldDirection(new THREE.Vector3());
    const base = npc.worldPos(new THREE.Vector3()), toB = base.clone().sub(eye);
    const t = Math.max(0, toB.dot(fwd)); const hitP = eye.clone().addScaledVector(fwd, t);
    const h = hitP.y - base.y, lateral = Math.hypot(hitP.x - base.x, hitP.z - base.z);
    const zone = h > 1.5 ? 'head' : h > 0.95 ? (lateral > 0.24 ? 'arm' : 'torso') : 'leg';
    const mult = { head: 2.2, torso: 1, arm: 0.6, leg: 0.7 }[zone];
    // from behind, unaware, a heavy blow: a knock-out instead of a wound
    const behind = (() => { const hh = npc.heading + (npc.raft?.root.rotation.y || 0); _d.copy(eye).sub(base).setY(0).normalize(); return Math.sin(hh) * _d.x + Math.cos(hh) * _d.z < -0.3; })();
    const seen = this.crime.witnesses(c.player.position, { exclude: npc }).filter((w) => !w.friend);
    if (behind && heavy && !npc.alerted && zone !== 'leg') { this.knockDown(npc, 60, true); this.react(npc, a, seen, 'ko'); return; }
    npc.hp = (npc.hp ?? a?.hp ?? 100) - dmg * mult; if (a) a.hp = npc.hp;
    npc.alerted = now;
    if (dmg * mult > 14 && Math.random() < 0.5) npc.bleed = { until: now + 20, rate: 1.5 + dmg * 0.03 };
    if (c.settings.mature) this.bloodAt(hitP);
    c.events.emit('weapon:hit', { kind: 'npc', id: npc.def.id, dmg: dmg * mult, zone });
    if (npc.hp <= 0) { this.kill(npc, a, seen, zone); return; }
    if (dmg * mult > 35 || Math.random() < stun) this.knockDown(npc, 8 + Math.random() * 10);
    else { c.ui.subtitle(`${npc.def.name}: ${pick(['Agh—!', 'You—!', 'Stop!', 'What are you doing?!'])}`, 2, 'speech'); npc.stagger = now + 0.6; }
    if (a) { a.attitude -= 3; a.memory.push({ day: c.time.day, type: 'attacked by you' }); }
    this.react(npc, a, seen, 'assault');
  }
  knockDown(npc, secs, ko = false) {
    const now = performance.now() / 1000;
    npc.down = now + secs; npc.ko = ko; npc.override = { from: 0, to: 24, do: 'pray', pos: [npc.local.x, npc.local.z] };
    this.ctx.ui.subtitle(ko ? `${npc.def.name} folds up without a sound.` : `${npc.def.name} goes down hard.`, 2.5, 'speech');
    this.ctx.events.emit('people:subdued', { who: npc.def.id, ko });
  }
  tie(npc) { if (!this.inv.remove('rope')) return; npc.tied = true; npc.down = Infinity; this.ctx.ui.toast(`You tie ${npc.def.name}'s wrists and ankles.`); this.ctx.events.emit('people:tied', { who: npc.def.id }); }
  // the people around answer what they saw: scream, run, hide, fight, call the Ward; friends protect friends
  react(victim, va, seen, what) {
    const c = this.ctx;
    if (seen.length) {
      this.crime.eye();
      c.heat?.add(what === 'murder' ? 45 : what === 'ko' ? 14 : 10, what === 'murder' ? `Seen killing ${victim.def.name}` : `Seen attacking ${victim.def.name}`);
      c.standing?.addRep?.('raftfolk', what === 'murder' ? -15 : -4);
    }
    for (const w of seen.slice(0, 5)) {
      const t = w.agent?.traits || { courage: 0.5, temper: 0.5, warmth: 0.5, caution: 0.5 };
      const loyal = va && (w.agent?.p.friends?.includes(va.id) || va.p.friends?.includes(w.agent?.id) || w.agent?.p.partner === va.id);
      const r = loyal && t.courage > 0.45 ? 'protect' : t.courage > 0.78 && t.temper > 0.55 ? 'fight' : t.courage < 0.35 ? 'run' : t.caution > 0.7 ? 'hide' : t.warmth > 0.5 ? 'call' : 'scream';
      const line = { protect: `Get away from ${victim.def.name}!`, fight: 'Right. You and me.', run: '—!', hide: '', call: 'WARD! Somebody get the Ward!', scream: pick(['No— NO!', 'Oh gods—', 'Somebody help!']) }[r];
      if (line) { c.ui.subtitle(`${w.npc.def.name}: ${line}`, 2.6, 'speech'); c.audio?.speak?.(w.npc.worldPos(new THREE.Vector3()), 1.2, 0.9); }
      if (r === 'protect' || r === 'fight') this.npcAttacks(w.npc, 1);
      if (r === 'run' || r === 'hide') this.crime.flee(w.npc);
      if (r === 'call') c.heat?.add(8, 'Someone called the Ward');
      w.agent?.memory.push({ day: c.time.day, type: what === 'murder' ? 'saw you kill' : 'saw you attack', about: victim.def.id });
      if (w.agent) w.agent.attitude -= what === 'murder' ? 5 : 2;
    }
    if (seen.length && what === 'murder') c.economy?.rumours?.unshift({ day: c.time.day, text: `${victim.def.name} was killed in front of witnesses on ${this.crime.where(c.player.position)}. They all describe the same wristband.` });
    c.events.emit('people:violence', { who: victim.def.id, what, seen: seen.length });
  }
  kill(npc, a, seen, zone) {
    const c = this.ctx, day = c.time.day;
    npc.dead = true; npc.down = Infinity; npc.bleed = null;
    if (a && !a.dead) { c.society.death(a, { creature: 'you' }, seen.length ? 'you' : 'someone', 'raft'); }
    // the society hides the dead; a body stays where it fell
    npc.isBody = true; npc.override = { from: 0, to: 24, do: 'idle', pos: [npc.local.x, npc.local.z] }; npc.root.visible = true;
    if (npc.rig?.root) { npc.rig.root.rotation.x = -Math.PI / 2; npc.rig.root.position.y = 0.18; }
    const body = this.state.bodies[npc.def.id] = { id: npc.def.id, day, seen: seen.length > 0, found: seen.length > 0, hidden: false, dumped: false };
    if (!c.settings.mature) this.crime.minigame && this.cutAway(); else this.bloodAt(npc.worldPos(new THREE.Vector3()), 1.4);
    if (seen.length) { this.crime.state.bounty += npc.def.shop || this.isBartender(npc) ? 120 : 60; c.ui.toast(`Bounty: ${this.crime.state.bounty} scrap on your head.`); }
    // a dead shopkeeper's shop closes; their till and back room are there for the taking
    if (npc.def.shop) { this.state.closed[npc.def.shop] = day + 5; this.addTill(npc); }
    for (const k of Object.keys(c.crews?.state.standing || {})) c.crews.bump?.(k, seen.length ? -10 : -2);
    this.react(npc, a, seen, 'murder');
    c.events.emit('people:killed', { who: npc.def.id, seen: seen.length > 0, zone });
    return body;
  }
  addTill(npc) {
    const id = 'till:' + npc.def.id; if (this.items.containers.has(id)) return;
    const cont = this.items.addContainer({ id, kind: 'till', label: `${npc.def.name}'s till and back room`, owner: 'shop:' + npc.def.shop, table: 'crate', items: { scrap: 25 } });
    this.ctx.interact.add({ id: 'ix:c:' + id, kind: 'container', mode: 'foot', radius: 2.4, pos: (v) => npc.worldPos(v).setY(npc.worldPos(_w).y + 1).add(_d.set(0.8, 0, 0)), prompt: 'The till (unattended)', onUse: () => { this.openContainer(cont); return true; } });
  }
  bodyContainer(b) {
    const id = 'body:' + b.npc.def.id; let cont = this.items.containers.get(id);
    if (!cont) { cont = this.items.addContainer({ id, kind: 'body', label: b.npc.def.name, owner: b.npc.def.id, items: { ...this.crime.pocketsOf(b.npc) } }); cont.rolled = true; }
    return cont;
  }
  cutAway() { const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity .2s;pointer-events:none;z-index:40'; document.body.appendChild(el); requestAnimationFrame(() => (el.style.opacity = '0.8')); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 500); }
  bloodAt(p, s = 0.4) {
    const m = this.bloodMat || (this.bloodMat = new THREE.MeshStandardMaterial({ color: 0x3a0b08, roughness: 0.3, transparent: true, opacity: 0.8, depthWrite: false }));
    const g = this.bloodGeo || (this.bloodGeo = new THREE.CircleGeometry(1, 12));
    const st = new THREE.Mesh(g, m); st.scale.setScalar(s); st.rotation.x = -Math.PI / 2;
    const gy = this.ctx.collision.groundAt(p.x, p.z, p.y + 0.5); st.position.set(p.x, (Number.isFinite(gy) ? gy : p.y) + 0.02, p.z);
    this.ctx.scene.add(st); (this.stains ||= []).push(st); if (this.stains.length > 12) this.stains.shift().removeFromParent();
  }
  // an NPC comes at you for a while
  npcAttacks(npc, mins = 1) { if (npc.dead || npc.down) return; if (!this.hostiles.some((h) => h.npc === npc)) this.hostiles.push({ npc, until: performance.now() / 1000 + 12 * mins, cd: 0.8 }); }
  updateCombat(dt) {
    const c = this.ctx, now = performance.now() / 1000, p = c.player.position;
    for (const h of this.hostiles) {
      const n = h.npc; if (n.dead || n.down > now) { h.until = 0; continue; }
      const np = n.worldPos(_v), d = np.distanceTo(p);
      if (n.raft) { const l = n.raft.root.worldToLocal(_w.copy(p)); n.override = { from: 0, to: 24, do: 'walk', pos: [l.x, l.z] }; n.speedK = 2.2; }
      h.cd -= dt; if (d < 1.6 && h.cd <= 0) { h.cd = 1.2; c.injury?.hit?.(9, { source: n.def.id }); c.events.emit('shake', 0.3); c.ui.subtitle(`${n.def.name} hits you.`, 1.2); }
      if (d > 25) h.until = 0;
    }
    this.hostiles = this.hostiles.filter((h) => h.until > now || (h.npc.override = null, h.npc.speedK = 1, false));
    // bleeding, getting up again
    for (const n of this.crime.allNPCs()) {
      if (n.bleed && !n.dead) { if (now > n.bleed.until) n.bleed = null; else { n.hp -= n.bleed.rate * dt; if (c.settings.mature && Math.random() < dt * 0.6) this.bloodAt(n.worldPos(_v), 0.15); if (n.hp <= 0) this.kill(n, c.society?.agents.get(n.def.id), this.crime.witnesses(p, { exclude: n }).filter((w) => !w.friend), 'bleeding'); } }
      if (n.down && !n.dead && !n.tied && now > n.down) { n.down = 0; n.ko = false; n.override = null; n.alerted = now; if ((c.society?.agents.get(n.def.id)?.traits.courage ?? 0) > 0.7) this.npcAttacks(n, 1); else this.crime.flee(n); }
    }
    // weapon-point: hold a drawn weapon on someone for a moment and they put their hands up
    this.surrendered = this.surrendered?.surrender > now ? this.surrendered : null;
    if (c.arms?.drawn && !c.ui.open) {
      const eye = c.camera.getWorldPosition(_w), fwd = c.camera.getWorldDirection(_d.clone());
      let tgt = null; for (const n of this.crime.allNPCs()) { if (n.dead || n.down) continue; const np = n.worldPos(new THREE.Vector3()).setY(n.worldPos(_v).y + 1.2); const to = np.sub(eye); const L = to.length(); if (L < 7 && to.normalize().dot(fwd) > 0.96) tgt = n; }
      if (tgt && tgt === this.aimAt) { this.aimT += dt; if (this.aimT > 1.2 && !(tgt.surrender > now) && !this.hostiles.some((h) => h.npc === tgt)) this.surrender(tgt); } else { this.aimT = 0; this.aimAt = tgt; }
    }
  }
  surrender(npc) {
    const c = this.ctx, a = c.society?.agents.get(npc.def.id), t = a?.traits || { courage: 0.5, temper: 0.5 };
    const now = performance.now() / 1000;
    // the brave and the angry don't always put their hands up
    if (t.courage > 0.85 && t.temper > 0.6) { c.ui.subtitle(`${npc.def.name}: You'll have to use it.`, 2.5, 'speech'); this.npcAttacks(npc, 1); return 'resist'; }
    npc.surrender = now + 25; this.surrendered = npc; npc.forcedLayer = 'ears';
    setTimeout(() => { if (!(npc.surrender > performance.now() / 1000)) npc.forcedLayer = null; }, 25500);
    c.ui.subtitle(`${npc.def.name}: ${pick(['Alright! Alright. Don\'t.', 'Easy — easy. Take what you want.', 'Please. I\'ve got nothing worth this.'])}`, 3, 'speech');
    const seen = this.crime.witnesses(c.player.position, { exclude: npc }).filter((w) => !w.friend); if (seen.length) { this.crime.eye(); c.heat?.add(10, 'Seen threatening someone'); }
    a?.memory.push({ day: c.time.day, type: 'held at weapon-point by you' }); if (a) a.attitude -= 3;
    return 'surrender';
  }
  // the shopkeeper or bartender with their hands up: comply, resist, the alarm, or the thing under the counter
  rob(npc, forced = null) {
    const c = this.ctx, a = c.society?.agents.get(npc.def.id), t = a?.traits || { courage: 0.5, temper: 0.5, caution: 0.5 };
    const isShop = !!npc.def.shop || this.isBartender(npc);
    const roll = forced || (isShop && t.courage > 0.6 && t.temper > 0.55 && Math.random() < 0.35 ? 'hidden' : isShop && t.caution > 0.6 && Math.random() < 0.5 ? 'alarm' : 'comply');
    npc.surrender = 0; npc.forcedLayer = null; this.surrendered = null;
    if (roll === 'hidden') { c.ui.subtitle(`${npc.def.name} comes up from under the counter with a flare pistol.`, 3, 'speech'); c.injury?.hit?.(28, { source: npc.def.id }); c.events.emit('shake', 0.8); this.npcAttacks(npc, 1); c.heat?.add(10, 'Armed robbery'); return roll; }
    let loot;
    if (isShop) { const shop = c.data.trade.shops?.[npc.def.shop]; loot = { scrap: 15 + Math.floor(Math.random() * 25) }; const goods = Object.keys(shop?.sells || {}); for (let i = 0; i < 2 && goods.length; i++) { const g = pick(goods); loot[g] = (loot[g] || 0) + 1; } }
    else loot = this.crime.pocketsOf(npc);
    for (const [id, n] of Object.entries(loot)) this.give(id, n, { stolen: true });
    c.audio?.started && (c.audio.synth.click?.(c.audio.ui, 2200), c.audio.synth.click?.(c.audio.ui, 2600, 0.08));
    c.ui.toast(`Took: ${Object.entries(loot).map(([id, n]) => `${this.items.def(id)?.name} ×${n}`).join(', ')}`);
    c.heat?.add(isShop ? 22 : 14, isShop ? 'Robbed a shop' : 'Robbed someone at weapon-point');
    this.crime.state.thief += 2;
    if (roll === 'alarm') { c.audio?.play('chimeSwell'); c.heat?.add(18, 'An alarm bell'); c.ui.subtitle('A bell starts clanging somewhere behind the counter.', 3); }
    a?.memory.push({ day: c.time.day, type: 'robbed by you' }); c.society?.spread?.(a || { id: npc.def.id, name: npc.def.name, p: {} }, `${npc.def.name} was robbed at weapon-point. They say they'd know the face anywhere.`, 'thief');
    c.events.emit('crime', { id: isShop ? 'robbery_shop' : 'robbery', who: npc.def.id, roll });
    return roll;
  }
  // ---------------------------------------------------------------- bodies
  updateBodies(dt) {
    const c = this.ctx, p = c.player.position;
    this.nearBody = null;
    let bd = 2.2;
    for (const n of this.crime.allNPCs().concat(this.deadNPCs())) { if (!(n.dead || n.down > performance.now() / 1000)) continue; const d = n.worldPos(_v).distanceTo(p); if (d < bd) { bd = d; this.nearBody = { npc: n, dead: n.dead, down: !n.dead }; } }
    // dragging: the body follows a step behind you
    if (this.drag) {
      const n = this.drag, back = p.clone().addScaledVector(c.player.forward.clone().setY(0).normalize(), -1.1);
      if (n.raft) { const l = n.raft.root.worldToLocal(back.clone()); n.local.x = l.x; n.local.z = l.z; n.root.position.x = l.x; n.root.position.z = l.z; }
      if (c.input.pressed?.('crouch')) this.drag = null;
      else if (c.input.pressed?.('use')) { if (this.overWater()) this.dump(n); else this.hide(n); }
    }
    // revenge: a brave friend of someone you were seen killing may come for you when you're close (once a day)
    this.revT = (this.revT || 0) - dt;
    if (this.revT <= 0) {
      this.revT = 3;
      const killed = Object.values(this.state.bodies).filter((b) => b.seen).map((b) => b.id);
      if (killed.length) for (const n of this.crime.allNPCs()) {
        if (n.dead || n.down || n.worldPos(_v).distanceTo(p) > 6) continue;
        const a = c.society?.agents.get(n.def.id); if (!a || a.revengeDay === c.time.day || (a.traits?.courage ?? 0) < 0.6) continue;
        if (a.memory.some((m) => m.type === 'lost' && killed.includes(m.about))) { a.revengeDay = c.time.day; c.ui.subtitle(`${n.def.name}: You. I know what you did.`, 3, 'speech'); this.npcAttacks(n, 1); break; }
      }
    }
    // somebody finds a body nobody was meant to find
    this.findT = (this.findT || 0) - dt; if (this.findT > 0) return; this.findT = 1;
    for (const [id, b] of Object.entries(this.state.bodies)) {
      if (b.found || b.hidden || b.dumped) continue;
      const n = this.deadNPCs().find((x) => x.def.id === id); if (!n) continue;
      const bp = n.worldPos(new THREE.Vector3());
      const finder = this.crime.allNPCs().find((x) => !x.dead && !x.down && x.worldPos(_v).distanceTo(bp) < 9);
      if (finder) {
        b.found = true;
        c.ui.subtitle(`${finder.def.name}: ${pick(['Oh no. Oh no no no.', 'Somebody— somebody come quick!', 'Is that…?'])}`, 3, 'speech');
        c.economy?.rumours?.unshift({ day: c.time.day, text: `${n.def.name} was found dead on ${this.crime.where(bp)}. The Ward is investigating, or says it is.` });
        if (p.distanceTo(bp) < 30) c.heat?.add(6, 'Near a body');
        c.events.emit('body:found', { who: id, by: finder.def.id });
      }
    }
  }
  deadNPCs() { const out = []; for (const com of Object.values(this.ctx.state.communities || {})) for (const n of com.npcs || []) if (n.dead) out.push(n); return out; }
  // is there open water just in front of you (the deck edge)?
  overWater() { const c = this.ctx, p = c.player.position, f = c.player.forward; const x = p.x + f.x * 1.6, z = p.z + f.z * 1.6; const g = c.collision.groundAt(x, z, p.y + 1); return !Number.isFinite(g) || g < p.y - 1.2; }
  startDrag(npc) { this.drag = npc; this.ctx.ui.toast('Dragging. Crouch to let go.'); }
  dump(npc) {
    const c = this.ctx, b = this.state.bodies[npc.def.id]; if (!b) return false;
    b.dumped = true; npc.root.visible = false; this.drag = null;
    c.events.emit('splash', { pos: npc.worldPos(new THREE.Vector3()), big: true });
    if (Math.random() < 0.2) setTimeout(() => c.economy?.rumours?.unshift({ day: c.time.day, text: `Something washed up under the ${pick(['market', 'dock', 'chapel'])} raft this morning. The Ward is investigating.` }), 60000);
    return true;
  }
  hide(npc) { const b = this.state.bodies[npc.def.id]; if (!b) return false; b.hidden = true; npc.root.visible = false; this.drag = null; this.ctx.ui.toast('Hidden, for now.'); return true; }

  // ---------------------------------------------------------------- bars: no weapons
  updateBarRule(dt) {
    const c = this.ctx, bar = c.nightlife?.nearestBar?.(9);
    if (!bar || !c.arms?.drawn) { this.barT = 0; return; }
    this.barT = (this.barT || 0) + dt;
    if (this.barT > 0.2 && !this.barWarned) { this.barWarned = true; c.ui.subtitle(`${bar.bar?.bouncer?.name || 'The bouncer'}: ${c.data.weapons?.law?.barRule || 'Put it away.'}`, 3, 'speech'); }
    if (this.barT > 4) { c.arms.holster(); c.heat?.add(3, 'Drew a weapon in a bar'); c.ui.whisper('A big hand closes over your wrist and pushes the weapon down, firmly. "Last warning."'); this.barT = 0; this.barWarned = false; c.events.emit('bar:rule', { bar: bar.bar?.id }); }
  }

  // ---------------------------------------------------------------- shops: haggle, hold up
  decorateShop(shopId) {
    const c = this.ctx, p = c.ui.panel?.querySelector('.panel'); if (!p) return;
    const row = document.createElement('div'); row.className = 'tabs';
    const h = this.state.haggle[shopId];
    row.innerHTML = `<button class="btn" data-haggle ${h?.day === c.time.day ? 'disabled' : ''}>${h?.day === c.time.day ? (h.k < 1 ? 'Haggled ✓' : 'They won\'t haggle today') : 'Haggle'}</button>${c.arms?.drawn ? '<button class="btn" data-holdup>Hold them up</button>' : ''}`;
    p.insertBefore(row, p.children[3] || null);
    row.querySelector('[data-haggle]')?.addEventListener('click', () => { const r = this.haggle(shopId); c.ui.toast(r ? 'They knock a bit off. Grudgingly.' : 'They put the price up and look at you differently.'); c.ui.close(); c.ui.openShop(shopId); });
    row.querySelector('[data-holdup]')?.addEventListener('click', () => { c.ui.close(); const keeper = this.crime.allNPCs().find((n) => n.def.shop === shopId); if (keeper) { const r = this.surrender(keeper); if (r === 'surrender') this.rob(keeper); } });
  }
  haggle(shopId, roll = Math.random()) {
    const c = this.ctx, keeper = c.data.npcs.npcs.find((n) => n.shop === shopId), a = keeper && c.society?.agents.get(keeper.id);
    const chance = 0.3 + (a?.traits.warmth ?? 0.5) * 0.3 + (7 - (c.standing?.shown ?? 7)) * 0.05 + Math.max(-0.2, (a?.attitude ?? 0) * 0.03) - (this.crime.state.thief >= 3 ? 0.2 : 0);
    const ok = roll < chance;
    this.state.haggle[shopId] = { day: c.time.day, k: ok ? 0.85 : 1.1 };
    return ok;
  }
  openFence() {
    const c = this.ctx;
    const render = () => { const rows = Object.entries(this.inv.stolen).filter(([, n]) => n > 0).map(([id, n]) => c.ui.itemRow(id, n, `<button class="btn" data-fence="${id}">Sell 1 for ${this.crime.fenceOffer(id, 1)}</button>`)).join('') || '<div class="sub">Nothing hot on you.</div>';
      return `<button class="btn close" data-close>Leave</button><h2>Sal</h2><div class="sub">"Don't wave it about. Show me under the table." · trust ${this.crime.state.fenceTrust}</div>${rows}`; };
    c.ui.openPanel('shop', render(), (p) => { const bind = (q) => { q.querySelectorAll('[data-fence]').forEach((b) => b.addEventListener('click', () => { const pay = this.crime.fence(b.dataset.fence, 1); if (pay) { c.ui.toast(`+${pay} scrap`); c.audio?.started && c.audio.synth.click?.(c.audio.ui, 2400); } q.innerHTML = render(); bind(q); })); q.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => c.ui.close())); }; bind(p); });
  }
  rest() {
    const c = this.ctx;
    if ((c.heat?.stars ?? 0) >= 2) { c.ui.toast('Not with the Ward this close.'); return false; }
    c.survival.apply({ fatigue: 60 }); if (c.injury) { c.injury.health = Math.min(100, c.injury.health + 35); c.injury.bleeding = 0; }
    c.time.hour += 6; if (c.time.hour >= 24) { c.time.hour -= 24; c.time.day++; }
    try { c.save?.save('manual'); } catch { /* saving can fail mid-scene */ }
    c.ui.whisper('You sleep with your back to the wall and your hand on the chest. Six hours. Nobody comes.');
    return true;
  }

  // ---------------------------------------------------------------- the new inventory screen
  openInventory(cat = 'all') {
    const c = this.ctx, inv = this.inv, atBoat = c.player.mode === 'boat' || c.survival.nearBoat(), hold = c.boatStorage;
    const cats = ['all', 'food', 'drink', 'medical', 'tool', 'ammo', 'material', 'valuable', 'key', 'book', 'clothing', 'fuel', 'misc'];
    const render = () => {
      const list = inv.list().filter(({ def }) => cat === 'all' || def?.cat === cat);
      const w = inv.weight(), cap = inv.capacity || 25;
      const hot = this.state.hotbar.map((id, i) => `<span class="btn ${id ? 'on' : ''}" style="min-width:64px">${5 + i}: ${id ? esc(this.items.def(id)?.name || id) : '—'}</span>`).join('');
      const rows = list.map(({ id, n, def }) => {
        const st = inv.stolen[id] || 0;
        return `<div class="row"><div class="name">${esc(def.name)}${n > 1 ? ' ×' + n : ''}${st ? ` <span style="color:#e88a6a;font-size:11px">STOLEN${st < n ? ' ×' + st : ''}</span>` : ''}${def.legal === 'contraband' ? ' <span style="color:#d9b36a;font-size:11px">CONTRABAND</span>' : ''}<small>${esc(def.cat)} · ${(def.weight * n).toFixed(1)} kg · worth ${def.value * n}</small></div>
          ${def.use ? `<button class="btn" data-use="${id}">Use</button>` : ''}<button class="btn" data-hot="${id}">Hotbar</button><button class="btn" data-drop="${id}">Drop</button><button class="btn" data-throw="${id}">Throw</button><button class="btn" data-insp="${id}">Inspect</button>${atBoat ? `<button class="btn" data-stow="${id}">Stow</button>` : ''}</div>`;
      }).join('') || '<div class="sub">Nothing here.</div>';
      const holdRows = atBoat ? `<h3>Boat hold</h3>${hold.list().map(({ id, n }) => c.ui.itemRow(id, n, `<button class="btn" data-take="${id}">Take</button>`)).join('') || '<div class="sub">The hold is empty.</div>'}` : '';
      return `<button class="btn close" data-close>Close</button><h2>Pack</h2>
        <div class="sub">${w.toFixed(1)} / ${cap} kg${w > cap ? ' — <span style="color:#e88a6a">overloaded, you\'re slow</span>' : ''} · ${inv.slotsUsed()} / ${SLOTS} slots · ${inv.count('scrap')} scrap</div>
        <div style="height:6px;background:#2a2622;margin:4px 0 8px"><div style="height:6px;width:${Math.min(100, (w / cap) * 100)}%;background:${w > cap ? '#c0603c' : '#b89a5a'}"></div></div>
        <div class="tabs">${cats.map((k) => `<button class="btn ${k === cat ? 'on' : ''}" data-cat="${k}">${k}</button>`).join('')}</div>
        <div class="tabs" style="opacity:.85">Hotbar (keys 5–9, D-pad): ${hot}</div>${rows}${holdRows}<div class="insp sub" style="margin-top:8px"></div>`;
    };
    c.ui.openPanel('inventory', render(), (p) => {
      const bind = (q) => {
        const redo = () => { q.innerHTML = render(); bind(q); };
        q.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => c.ui.close()));
        q.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; redo(); }));
        q.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { this.useItem(b.dataset.use); redo(); }));
        q.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => { this.dropItem(b.dataset.drop, 1); redo(); }));
        q.querySelectorAll('[data-throw]').forEach((b) => b.addEventListener('click', () => { c.ui.close(); this.dropItem(b.dataset.throw, 1, true); }));
        q.querySelectorAll('[data-hot]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.hot, i = this.state.hotbar.indexOf(id); if (i >= 0) this.state.hotbar[i] = null; else { const e = this.state.hotbar.indexOf(null); this.state.hotbar[e >= 0 ? e : 4] = id; } redo(); }));
        q.querySelectorAll('[data-stow]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.stow, n = inv.count(id), st = inv.stolen[id] || 0; inv.remove(id, n); hold.add(id, n, true, { stolen: st > 0 }); redo(); }));
        q.querySelectorAll('[data-take]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.take, n = hold.count(id), st = hold.stolen?.[id] || 0; hold.remove(id, n); this.give(id, n, { stolen: st > 0 }); redo(); }));
        q.querySelectorAll('[data-insp]').forEach((b) => b.addEventListener('click', () => {
          const d = this.items.def(b.dataset.insp), same = Object.values(this.items.defs).filter((x) => x.cat === d.cat && x !== d), avg = same.length ? same.reduce((s, x) => s + x.value / Math.max(0.05, x.weight), 0) / same.length : 0;
          q.querySelector('.insp').innerHTML = `<b>${esc(d.name)}</b> — ${esc(d.desc || '')}<br>${d.weight} kg · worth ${d.value} · ${d.legal}${inv.stolen[d.id] ? ' · stolen goods: a fence will take them, the Ward will take them off you' : ''}<br>Compared with other ${d.cat}: ${avg ? ((d.value / Math.max(0.05, d.weight)) / avg > 1 ? 'better' : 'worse') + ' value for its weight' : 'nothing to compare'}`;
        }));
      };
      bind(p);
    });
  }

  // ---------------------------------------------------------------- HUD: cash, hotbar
  buildHud() {
    const el = this.hud = document.createElement('div');
    el.style.cssText = 'position:fixed;right:16px;top:14px;z-index:20;pointer-events:none;font:13px ui-monospace,monospace;color:#efe5d0;text-shadow:0 1px 3px #000;text-align:right';
    document.body.appendChild(el);
  }
  updateHud() {
    const c = this.ctx, inv = this.inv;
    const key = `${inv.count('scrap')}|${this.crime.state.bounty}|${this.state.hotbar.join(',')}|${c.mode}|${!!c.ui.open}`;
    if (key === this.hudKey) return; this.hudKey = key;
    this.hud.style.display = c.mode === 'play' && !c.ui.open ? 'block' : 'none';
    this.hud.innerHTML = `${inv.count('scrap')} scrap${this.crime.state.bounty ? ` · <span style="color:#ff8a6a">bounty ${this.crime.state.bounty}</span>` : ''}<div style="opacity:.8;font-size:11px;margin-top:2px">${this.state.hotbar.map((id, i) => (id ? `${5 + i}:${esc(this.items.def(id)?.name.split(' ')[0] || id)}` : '')).filter(Boolean).join(' ')}</div>`;
  }

  // ---------------------------------------------------------------- save
  toJSON() { return { state: this.state, items: this.items.toJSON(), crime: this.crime.toJSON() }; }
  load(o) {
    this.state = { hotbar: [null, null, null, null, null], haggle: {}, closed: {}, bodies: {}, stash: {}, ...(o?.state || {}) };
    this.items.load(o?.items); this.crime.load(o?.crime);
  }
  reset() { this.load(null); this.seeded = false; this.items.loose = []; }
}
