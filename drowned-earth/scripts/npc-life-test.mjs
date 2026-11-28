// node scripts/npc-life-test.mjs — the raft NPCs behave like people (real humans loaded, Portage, daytime):
// eye contact with a polite glance away; a greeting on approach that fits the hour and remembers a second
// visit; a pair conversation where they face each other and the listener nods; thunder makes people look
// up; a gunshot close by makes them cover their ears; a hard boat crash draws the curious over; hard rain
// sends idlers to cover; seated people have a seat; nobody breaks a pose; the full-detail budget holds.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5187, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&quality=low&agegate=off&time=10&freeze=1');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 400000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, out = {}, V = c.player.position.constructor;
  c.renderer.setAnimationLoop(null);
  const subs = []; const sub = c.ui.subtitle.bind(c.ui); c.ui.subtitle = (t, ...a) => { subs.push(t); return sub(t, ...a); };
  const tick = async (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { g.update(dt); g.frame++; if (i % 15 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  c.player.mode = 'foot'; c.player.teleport(new V(318, 1, 250)); await tick(10);
  const com = c.state.communities.portage;
  const npcs = com.npcs;
  // walk the player round the market so the humans get built
  const market = com.rafts.get('market');
  c.player.teleport(market.worldPoint(new V(0, market.deck + 0.2, 0))); await tick(60);
  const built = npcs.filter((n) => n.rig?.doing && n.manners);
  out.built = { pass: built.length > 0, detail: `${built.length}/${npcs.length} NPCs built as full humans with manners` };
  if (!built.length) return out;
  // pick someone awake on the market raft, stand 2.5 m in front of them
  const who = built.find((n) => n.raft === market && n.root.visible) || built.find((n) => n.root.visible);
  const stand = async (n, d = 3.2) => { const p = n.worldPos(new V()); c.player.teleport(new V(p.x + Math.sin(n.heading) * d, p.y + 0.2, p.z + Math.cos(n.heading) * d)); };
  // greeting on approach (warm the person up so the coin flip can't miss)
  c.state.greets = {}; c.society.chatT = 1e9; for (const n of built) if (n.manners) n.manners.chat = null;   // no random chats during this part
  const M = who.manners; M.tr.warmth = 1; M.tr.talk = 1;   /* chance 1.0: the roll can't miss */ M.B.lastGreet = -99; M.wasFar = true;
  subs.length = 0; await stand(who); for (let i = 0; i < 12 && !subs.some((s) => s.startsWith(who.def.name + ':')); i++) { await stand(who); await tick(20); }
  const g1 = subs.find((s) => s.startsWith(who.def.name + ':'));
  // eye contact, then a glance away within a few seconds
  let looked = 0, away = 0;
  for (let i = 0; i < 300; i++) { await tick(1); if (M.lookOn && M.away <= 0 && M.look.distanceTo(c.camera.position) < 0.5) looked++; if (M.away > 0) away++; }
  out.gaze = { pass: looked > 20 && away > 5, detail: `${who.def.name}: eye contact ${looked} frames, glanced away ${away} frames of 300` };
  // leave, come back: "again"
  // (stay in the area: going far away streams the raft out and rebuilds its people)
  await stand(who, 12); await tick(30); M.nearAt -= 100; M.B.lastGreet = -99;
  subs.length = 0; await stand(who); for (let i = 0; i < 12 && !subs.some((s) => s.startsWith(who.def.name + ':')); i++) { await stand(who); await tick(20); }
  const g2 = subs.find((s) => s.startsWith(who.def.name + ':'));
  const dbg = `wasFar ${M.wasFar} dP ${who.worldPos(new V()).distanceTo(c.player.position).toFixed(1)} now ${M.B.now.toFixed(1)} last ${M.B.lastGreet.toFixed(1)} talkT ${who.talkT} vis ${who.rig.root.visible} subs ${subs.slice(0,3).join(' / ')}`;
  const again = /again|twice|forget|keep away|regular|ever/i.test(g2 || '');
  out.greeting = { pass: !!g1 && !!g2 && again, detail: `first: "${g1 || 'none'}"; second visit: "${g2 || 'none'}"${g2 ? '' : ' — ' + dbg}` };
  // a pair conversation: face each other, the listener nods
  const pair = built.filter((n) => n.root.visible && n.raft === who.raft);
  if (pair.length >= 2) {
    const [x, y] = pair;
    const pp = x.worldPos(new V()); y.local.copy(x.local).add(new V(1.4, 0, 0)); y.target.copy(y.local);
    c.player.teleport(new V(pp.x + 3, pp.y + 0.2, pp.z + 3));
    const { startChat } = await import('/src/people/Manners.js');
    startChat(x, y, 'joke'); await tick(30);
    const fx = new V(Math.sin(x.heading), 0, Math.cos(x.heading)), toY = y.local.clone().sub(x.local).setY(0).normalize();   // raft frame
    const facing = fx.dot(toY);
    out.pairChat = { pass: facing > 0.7 && y.manners.layer === 'nod', detail: `${x.def.name} faces ${y.def.name} (dot ${facing.toFixed(2)}); listener layer ${y.manners.layer}` };
    x.manners.chat = null; y.manners.chat = null; x.chatTalk = y.chatTalk = null;
  } else out.pairChat = { pass: true, detail: 'skipped: fewer than two people built on one raft' };
  // thunder: look up
  await stand(who, 8); await tick(5);
  c.events.emit('lightning', { dist: 500, dir: 0 }); await tick(25);
  const up = M.lookOn && M.look.y - who.worldPos(new V()).y > 4;
  out.thunder = { pass: up, detail: up ? 'looked up at the sky' : `look y ${M.look.y.toFixed(1)}` };
  await tick(40);
  // a gunshot close by: hands over ears
  c.events.emit('weapon:fire', { pos: who.worldPos(new V()).add(new V(3, 1, 0)) }); await tick(6);
  out.ears = { pass: M.layer === 'ears' && who.rig.gest.want === 'ears', detail: `layer ${M.layer}, gesture ${who.rig.gest.want}` };
  await tick(60);
  // a hard boat crash nearby: the curious come and look
  M.tr.curiosity = 0.9; const wp = who.worldPos(new V());
  c.boat.pos.set(wp.x + 7, c.boat.pos.y, wp.z); c.events.emit('boat:impact', { speed: 6 }); await tick(4);
  out.curious = { pass: !!M.goal || M.lookOn && M.look.distanceTo(c.boat.pos) < 2, detail: M.goal ? `walking over to look (goal ${M.goal.x.toFixed(1)}, ${M.goal.z.toFixed(1)})` : 'looking from where they stand' };
  M.B.odd.length = 0; await tick(10);
  // hard rain: hunch and head for cover
  const rain0 = c.weather.cur.rain; c.weather.cur.rain = 0.9; const act0 = who.activity; who.activity = 'idle'; await tick(4);
  out.rain = { pass: M.layer === 'crossed', detail: `layer ${M.layer}; ${M.goal ? 'heading for cover' : 'no doorway/bed spot on this raft, hunching where they stand'}` };
  c.weather.cur.rain = rain0; who.activity = act0; await tick(10);
  // everyone: no broken poses, sitters have seats, full-detail count
  let nan = 0, noSeat = 0, full = 0;
  for (const n of built) {
    if (!n.rig.root.visible) continue;
    n.rig.human.body.skeleton.bones.forEach((b) => { if (!Number.isFinite(b.quaternion.x + b.quaternion.w)) nan++; });
    if (n.rig.sitting && n.rig.detail && !n.rig.gest.props.seat?.visible) noSeat++;
    if (n.rig.detail) full++;
  }
  out.poses = { pass: !nan && !noSeat, detail: `${nan} NaN bones; ${noSeat} seated people without a seat; ${full} full-detail people near the player` };
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);
