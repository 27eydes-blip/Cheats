// node scripts/interaction-test.mjs — the interaction layer. Pickup and drop, carry weight, container loot,
// ownership and witnesses (seen vs unseen theft), pickpocket success and failure, locks (key, pick, broken
// pick), damage → knockdown → death, bounty, shop buy and sell, robbery responses, the bar weapons rule,
// save and load, and the loose-item cap and pooling.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5195, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=12&freeze=1');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 200000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, X = c.ix, I = X.items, C = X.crime, inv = c.inventory, V = c.player.position.constructor, out = {};
  c.renderer.setAnimationLoop(null);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { g.update(1 / 30); g.frame++; if (i % 15 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  c.player.mode = 'foot'; c.player.teleport(new V(318, 1, 250)); await tick(30);
  const com = c.state.communities.portage;
  const mk = com.rafts.get('market');
  const onDeck = (r, x = 0, z = 0) => r.worldPoint(new V(x, r.deck + 0.1, z));
  const stand = async (p, yaw) => { c.player.teleport(p.clone()); if (yaw != null) c.player.yaw = yaw; c.player.velocity.set(0, 0, 0); await tick(3); };
  const clear = () => { for (const k of Object.keys(inv.items)) delete inv.items[k]; inv.stolen = {}; };
  // 1. pickup and drop
  clear(); await stand(onDeck(mk, 0, 0));
  const it = I.drop('rope', 2, c.player.position.clone().add(new V(0.6, 0, 0)));
  await tick(4);
  const before = inv.count('rope'); X.pickup(it); const afterPick = inv.count('rope');
  const dropped = X.dropItem('rope', 1); await tick(20);
  out.pickupDrop = { pass: afterPick === before + 2 && inv.count('rope') === afterPick - 1 && !!dropped && I.loose.includes(dropped), detail: `rope ${before} → ${afterPick} after pickup → ${inv.count('rope')} after drop; dropped item settled at y ${dropped?.y.toFixed(2)}` };
  // hold E takes everything in reach
  for (let i = 0; i < 4; i++) I.drop('bottle', 1, c.player.position.clone().add(new V(0.4 + i * 0.2, 0, 0.3)));
  await tick(14); const nAll = X.takeAll();
  out.takeAll = { pass: nAll >= 4, detail: `${nAll} items taken by holding E` };
  // 2. carry weight: overloaded slows you
  clear(); const mf0 = c.survival.moveFactor(); inv.add('engine_parts', 40, true); const mf1 = c.survival.moveFactor(), sprint = c.survival.canSprint();
  out.weight = { pass: X.load01() > 1 && mf1 < mf0 && !sprint, detail: `load ${(X.load01() * 100).toFixed(0)} % of capacity; speed ×${mf0.toFixed(2)} → ×${mf1.toFixed(2)}; can sprint ${sprint}` };
  clear();
  // 3. a container: open, take all (unowned)
  const box = I.addContainer({ id: 'test:crate', kind: 'crate', label: 'Crate', owner: null, items: { canned_fish: 2, scrap: 5 }, rolled: true });
  await X.openContainer(box); document.querySelector('[data-all]')?.click(); c.ui.close();
  out.containerLoot = { pass: inv.count('canned_fish') === 2 && inv.count('scrap') === 5 && !Object.keys(box.items).length, detail: `took ${inv.count('canned_fish')} fish and ${inv.count('scrap')} scrap; crate now ${JSON.stringify(box.items)}` };
  // 4. ownership and witnesses: in front of the owner in daylight → seen; at night, crouched, behind → unseen
  clear();
  const oru = com.npcs.find((n) => n.def.id === 'oru'); const op = oru.worldPos(new V());
  const face = (npc, p) => { const l = npc.raft.root.worldToLocal(p.clone()); npc.heading = Math.atan2(l.x - npc.local.x, l.z - npc.local.z); npc.face = npc.heading; };
  const heat0 = c.heat.value;
  await stand(op.clone().add(new V(2.2, 0.2, 0))); face(oru, c.player.position); await tick(2);
  const owned = I.drop('salt', 1, c.player.position.clone().add(new V(-0.4, 0.2, 0)), { owner: 'oru' }); await tick(3);
  const ws = C.witnesses(); X.pickup(owned);
  const seenHeat = c.heat.value - heat0, stolenMarked = (inv.stolen.salt || 0) === 1;
  c.heat.value = 0; c.time.hour = 0.5; await tick(2);
  await stand(op.clone().add(new V(0, 0.2, 0)).add(new V(-Math.sin(oru.heading) * 3.5, 0, -Math.cos(oru.heading) * 3.5)));
  c.input.held.crouch = true; c.player.flashlight = false; face(oru, op.clone().add(new V(Math.sin(oru.heading) * 5, 0, Math.cos(oru.heading) * 5)));
  const owned2 = I.drop('salt', 1, c.player.position.clone().add(new V(0.3, 0.2, 0)), { owner: 'oru' }); await tick(3);
  for (const n of com.npcs) if (n !== oru) face(n, n.worldPos(new V()).add(n.worldPos(new V()).sub(c.player.position)));   // everyone else looking the other way
  const ws2 = C.witnesses(); const r2 = C.theft('oru', 2, 'salt');
  c.input.held.crouch = false; c.time.hour = 12;
  out.witness = { pass: ws.length > 0 && seenHeat > 0 && stolenMarked && ws2.length === 0 && !r2.seen && C.state.notices.length > 0, detail: `daylight in front of Oru: ${ws.length} witness(es), Heat +${seenHeat.toFixed(0)}, flagged stolen ${stolenMarked}; at night crouched behind: ${ws2.length} witnesses, seen ${r2.seen}, owner will notice later ${C.state.notices.length > 0}` };
  // 5. pickpocket success and failure
  clear(); c.heat.value = 0;
  const ruel = com.npcs.find((n) => n.def.id === 'ruel');
  const s0 = inv.count('scrap'); C.pickpocket(ruel, { result: true }); const s1 = inv.count('scrap');
  const mem0 = (c.society.agents.get('ruel')?.memory || []).length; C.pickpocket(ruel, { result: false }); const mem1 = (c.society.agents.get('ruel')?.memory || []).length;
  // and the mini-game itself: a hit in the window succeeds
  let mg = null; const game = C.minigame({ title: 'test', hits: 1, window: 1, onDone: (ok) => { mg = ok; } }); game.hit();
  out.pickpocket = { pass: s1 > s0 && (inv.stolen.scrap || 0) > 0 && mem1 > mem0 && mg === true, detail: `success: scrap ${s0} → ${s1} (stolen ${inv.stolen.scrap || 0}); failure: Ruel remembers it (${mem0} → ${mem1} memories); mini-game hit → ${mg}` };
  // 6. locks: key, pick, broken pick
  clear();
  const kb = I.addContainer({ id: 'test:keybox', kind: 'crate', label: 'Box', lock: { kind: 'key', key: 'raft_key' }, items: { scrap: 1 }, rolled: true });
  const noKey = await C.unlock(kb); inv.add('raft_key', 1, true); const withKey = await C.unlock(kb);
  const lk = I.addContainer({ id: 'test:locker', kind: 'locker', label: 'Locker', lock: { kind: 'pick', level: 0.4 }, items: {}, rolled: true });
  const noPick = await C.unlock(lk); inv.add('lockpick', 20, true);
  let broke = 0; for (let i = 0; i < 20; i++) { const n0 = inv.count('lockpick'); await C.unlock(lk, { result: false }); if (inv.count('lockpick') < n0) broke++; lk.unlocked = false; }
  const picked = await C.unlock(lk, { result: true });
  out.locks = { pass: !noKey && withKey && !noPick && picked && broke > 0 && broke < 20, detail: `key lock: without ${noKey}, with key ${withKey}; pick lock: no pick ${noPick}, picked ${picked}; ${broke}/20 failed attempts snapped the pick` };
  // 7. fighting: wound → knockdown → death; a seen killing creates a bounty, the shop closes
  clear(); c.heat.value = 0; C.state.bounty = 0;
  const odile = com.npcs.find((n) => n.def.id === 'odile'); const odp = odile.worldPos(new V());
  await stand(odp.clone().add(new V(1.6, 0.2, 0))); face(odile, c.player.position);
  const watcher = com.npcs.find((n) => n.def.id === 'dela'); face(watcher, c.player.position);
  const camAt = () => { c.camera.position.copy(c.player.position).setY(c.player.position.y + 1.5); c.camera.lookAt(odile.worldPos(new V()).setY(odile.worldPos(new V()).y + 1.2)); c.camera.updateMatrixWorld(); };
  camAt(); X.hitPerson(odile, 20, 0, false); const hpAfter = odile.hp;
  camAt(); X.hitPerson(odile, 40, 1, false); const downed = odile.down > performance.now() / 1000;
  camAt(); X.hitPerson(odile, 200, 0, false);
  const dead = odile.dead, agentDead = c.society.agents.get('odile')?.dead, body = X.state.bodies.odile;
  out.damageDeath = { pass: hpAfter < 100 && downed && dead && agentDead && !!body, detail: `hit → hp ${hpAfter.toFixed(0)}; heavy hit → down ${downed}; killed → dead ${dead}, Living-NPC dead ${agentDead}, body left ${!!body}` };
  out.bounty = { pass: !body.seen || C.state.bounty > 0, detail: `seen ${body.seen}; bounty ${C.state.bounty}; Heat ${c.heat.value.toFixed(0)}; shop closed ${odile.def.shop ? X.isClosed(odile.def.shop) : 'n/a (no shop)'}` };
  // 8. shops: buy and sell (and haggling moves the price)
  clear(); c.heat.value = 0; inv.add('scrap', 60, true);
  const shop = 'portage_exchange', item = Object.keys(c.data.trade.shops[shop].sells).find((i) => (c.data.trade.shops[shop].sells[i].cur || 'scrap') === 'scrap');
  const p0 = c.trade.price(shop, item), sc0 = inv.count('scrap'); const bought = c.trade.buy(shop, item); const sc1 = inv.count('scrap');
  const sellable = Object.keys(c.data.items.items).find((i) => c.trade.sellPrice(shop, i) > 0); if (sellable) inv.add(sellable, 1, true);
  const sold = sellable ? c.trade.sell(shop, sellable) : false;
  X.haggle(shop, 0); const p1 = c.trade.price(shop, item);
  out.shop = { pass: bought && sc1 < sc0 && (!sellable || sold !== false) && p1 < p0, detail: `bought ${item} for ${sc0 - sc1} scrap; sold ${sellable}: ${sold !== false}; haggled price ${p0} → ${p1}` };
  // 9. robbery: comply / alarm / hidden weapon
  clear(); c.heat.value = 0;
  const keeper = com.npcs.find((n) => n.def.id === 'oru');
  const h0 = c.injury?.health ?? 100;
  const r1 = X.rob(keeper, 'comply'); const loot = inv.count('scrap');
  const heatAfter = c.heat.value; const r2b = X.rob(keeper, 'alarm'); const heatAlarm = c.heat.value;
  const r3 = X.rob(keeper, 'hidden'); const h1 = c.injury?.health ?? 100;
  out.robbery = { pass: r1 === 'comply' && loot > 0 && heatAfter > 0 && heatAlarm > heatAfter && r3 === 'hidden' && h1 < h0, detail: `comply: ${loot} scrap from the till, Heat ${heatAfter.toFixed(0)}; alarm: Heat ${heatAlarm.toFixed(0)}; hidden weapon: health ${h0.toFixed(0)} → ${h1.toFixed(0)}` };
  if (c.injury) c.injury.health = 100;
  // 10. bars: a drawn weapon gets put away for you
  const bar = c.nightlife?.dressed && [...c.nightlife.dressed.values()][0];
  if (bar) {
    const a = bar.anchors[0], w = bar.world(a); await stand(w.clone().setY(w.y - 1.2));
    c.arms.give('fire_axe'); c.arms.draw(c.arms.state.owned.length - 1); let ruled = false; c.events.on('bar:rule', () => (ruled = true));
    for (let i = 0; i < 160 && !ruled; i++) await tick(1);
    out.barRule = { pass: ruled && !c.arms.drawn, detail: `near ${a.id}: rule enforced ${ruled}, weapon still out ${c.arms.drawn}` };
  } else out.barRule = { pass: false, detail: 'no bar dressed nearby' };
  // 11. save and load: inventory (with stolen flags), world items, containers
  clear(); inv.add('salt', 3, true, { stolen: true }); const sv = I.drop('tea', 1, onDeck(mk, 1, 1)); box.items = { rope: 1 }; box.touched = true;
  c.save.save('manual'); clear(); I.loose = I.loose.filter((x) => x !== sv); box.items = {};
  c.save.load('manual'); await tick(2);
  out.saveLoad = { pass: inv.count('salt') === 3 && (inv.stolen.salt || 0) === 3 && I.loose.some((x) => x.id === 'tea' && Math.abs(x.x - sv.x) < 0.1) && box.items.rope === 1, detail: `salt ${inv.count('salt')} (stolen ${inv.stolen.salt || 0}); dropped tea restored ${I.loose.some((x) => x.id === 'tea')}; crate contents ${JSON.stringify(box.items)}` };
  // 12. the cap and pooling: 300 items around you, never more than 40 awake, draw calls don't grow
  const calls = () => { c.renderer.info.reset(); g.render(0); return c.renderer.info.render.calls; };
  await stand(onDeck(mk, 0, 0)); await tick(10); const callsA = calls();
  for (let i = 0; i < 300; i++) I.drop(['bottle', 'scrap', 'rope', 'ration_bar', 'tea'][i % 5], 1, c.player.position.clone().add(new V((Math.random() - 0.5) * 30, 0.1, (Math.random() - 0.5) * 30)));
  await tick(20); const callsB = calls();
  const t0 = performance.now(); for (let i = 0; i < 60; i++) I.update(1 / 30); const ms = (performance.now() - t0) / 60;
  out.itemCap = { pass: I.awake.length <= 40 && callsB - callsA <= 14 && ms < 4, detail: `${I.loose.length} loose items, ${I.awake.length} awake; draw calls ${callsA} → ${callsB}; ${ms.toFixed(2)} ms per items update` };
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);
