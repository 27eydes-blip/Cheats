// node scripts/killers-test.mjs — the Hunters. Routine runs; the disguise holds (no data, model or UI tell);
// a killer watches, picks a target and builds an alibi; he adapts when investigated (hides trophies, moves the
// lair); he never reuses a failed ambush spot; clues spawn; the lair streams in; victims come only at a low
// rate; the witness roll fires at the expected low rate; witnessing leads to the right states; the stumbled-on
// entrance works with no clues (and gives no help until you're out); the mature gate controls the stain;
// and the slow tick is cheap.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5189, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=12&freeze=1');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 200000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, K = c.killers, S = c.society, out = {}, V = c.player.position.constructor;
  c.renderer.setAnimationLoop(null);
  const tick = async (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { g.update(dt); g.frame++; if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  c.player.mode = 'foot'; c.player.teleport(new V(318, 1, 250)); await tick(20);
  K.bind();
  const nm = K.k.netmaker, ll = K.k.lamplighter;
  const fresh = () => { K.load(null); };
  // 1. routine: full Living-NPC records and a daily schedule
  const ag = [nm, ll].map((k) => K.agentOf(k));
  const npcs = [nm, ll].map((k) => K.npcOf(k.d.npc));
  out.routine = { pass: ag.every((a) => a && Object.keys(a.traits).length === 10 && a.p.job && a.p.bunk && a.p.friends?.length && a.p.rival && a.p.habit && a.p.fear && a.p.want && a.p.secret && a.p.speech) && npcs.every((n) => n && n.def.schedule.length >= 3),
    detail: ag.map((a, i) => `${a?.name}: ${a?.p.job}, bunk ${a?.p.bunk}, friends ${a?.p.friends?.join('/')}, rival ${a?.p.rival}, ${a?.p.speech} — NPC ${npcs[i] ? 'present, ' + npcs[i].def.schedule.length + ' schedule entries' : 'MISSING'}`).join('; ') };
  // 2. the disguise: same data shape as everyone else, nothing emissive on him, nothing in the UI
  const keysOf = (o) => Object.keys(o).sort().join(',');
  const others = c.data.npcs.npcs.filter((d) => !['garrick', 'quillon'].includes(d.id));
  const allowed = new Set(others.flatMap((d) => Object.keys(d)));
  const dataTell = [nm, ll].some((k) => Object.keys(c.data.npcs.npcs.find((d) => d.id === k.d.npc)).some((key) => !allowed.has(key)));
  let glow = false; for (const n of npcs) n?.root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) glow = true; });
  const talkItem = [...c.interact.items.values()].find((i) => /Garrick|Quillon/.test(typeof i.prompt === 'function' ? i.prompt(c) : i.prompt || ''));
  const prompt = talkItem ? (typeof talkItem.prompt === 'function' ? talkItem.prompt(c) : talkItem.prompt) : '';
  c.state.met = { ...(c.state.met || {}), garrick: 3, quillon: 2 };
  c.ui.openJournal('people'); const peopleTxt = document.querySelector('.panel')?.textContent || document.body.textContent; c.ui.close?.();
  const words = /killer|netmaker|lamplighter|murder|hunter/i;
  // talking to him with no clues: ordinary lines only, no tells
  const said = []; const sub = c.ui.subtitle.bind(c.ui), wh = c.ui.whisper.bind(c.ui);
  c.ui.subtitle = (t, ...a) => { said.push(t); return sub(t, ...a); }; c.ui.whisper = (t, ...a) => { said.push(t); return wh(t, ...a); };
  for (let i = 0; i < 6; i++) c.events.emit('talk', { npc: 'garrick' });
  await new Promise((r) => setTimeout(r, 3600));
  const tells = said.filter((t) => nm.d.dialogue.tell.includes(t) || nm.d.dialogue.knows.some((x) => t.includes(x)));
  out.disguise = { pass: !dataTell && !glow && /^Talk to /.test(prompt) && !words.test(peopleTxt) && !tells.length, detail: `data keys ordinary: ${!dataTell}; emissive on body: ${glow}; prompt "${prompt}"; journal mentions: ${words.test(peopleTxt)}; tells with no clues: ${tells.length}` };
  // 3. he watches for days, picks a target, and arranges an alibi
  fresh(); K.bind(); const day0 = c.time.day;
  nm.s.nextEarliest = 0;
  for (let d = 1; d <= 6 && !nm.s.plan; d++) { c.time.day = day0 + d; c.time.hour = 6; K.dawn(nm); }
  const plan = nm.s.plan;
  out.plan = { pass: !!plan && !!plan.target && plan.alibi.with.length === 2 && !plan.alibi.with.includes(plan.target), detail: plan ? `target ${S.agents.get(plan.target)?.name} (watched ${nm.s.watch[plan.target]} days) at ${plan.spot}; alibi: ${plan.alibi.place} with ${plan.alibi.names.join(' and ')}` : 'no plan after 6 days' };
  // 4. investigated: he hides his trophies and moves the lair
  for (const cl of nm.d.clues.slice(0, 5)) K.state.clues[cl.id] = { day: c.time.day, title: cl.title, text: cl.text };
  nm.s.noticed.nearLair = 200; nm.s.noticed.asked = 8; K.watchPlayer(nm, 0); K.adapt(nm);
  out.adapts = { pass: nm.s.trophiesHidden && nm.s.lair === 'moved' && ['scare', 'hunt'].includes(nm.s.response), detail: `suspicion ${nm.s.suspicion.toFixed(2)} → response ${nm.s.response}; trophies hidden ${nm.s.trophiesHidden}; lair ${nm.s.lair}` };
  // 5. a failed ambush spot is never used again
  fresh(); K.bind(); nm.s.nextEarliest = 0; K.state.lastGlobal = -99; S.state.incidents.length = 0;
  for (let d = 1; d <= 6 && !nm.s.plan; d++) { c.time.day = day0 + d; c.time.hour = 6; K.dawn(nm); }
  const p5 = nm.s.plan, tgt = K.npcOf(p5?.target);
  if (p5 && tgt) {
    c.time.hour = 23.6; c.weather.cur.rain = 0; c.weather.cur.wind = 0; tgt.root.visible = true;
    c.player.teleport(tgt.worldPos(new V()).add(new V(2, 0.3, 0))); await tick(2); K.night(nm);
    const burned = p5.spot; let reused = 0; for (let i = 0; i < 60; i++) if (K.chooseSpot(nm)?.id === burned) reused++;
    out.noRepeat = { pass: nm.s.failedSpots.includes(burned) && reused === 0, detail: `escorted ${S.agents.get(p5.target)?.name}: ${burned} burned (${nm.s.failedSpots.join(',')}); chosen again ${reused}/60` };
  } else out.noRepeat = { pass: false, detail: 'no plan / target NPC not present' };
  // 6. clues spawn after an event (careless killer, no suspicion)
  fresh(); K.bind(); nm.s.caution = 0; nm.s.suspicion = 0;
  c.player.teleport(new V(318, 1, 250)); await tick(2);
  const victimA = [...S.agents.values()].find((a) => !a.dead && K.score(nm, a) > 0);
  const sp = nm.d.planning.spots[0], spos = K.spotPos(nm, sp, new V());
  c.player.teleport(new V(spos.x + 200, 1, spos.z)); await tick(2);
  const r6 = K.strike(nm, victimA, sp, spos, false);
  const item = [...K.items.values()].find((i) => i.killer === 'netmaker'), notice = c.interact.items.get('knotice_netmaker');
  out.cluesSpawn = { pass: r6 === 'taken' && !!item && !!notice && nm.s.witnessReady && victimA.dead && S.state.funerals.some((f) => f.who === victimA.id), detail: `${victimA.name}: ${r6}; item at the spot ${!!item}; missing notice ${!!notice}; witness NPC primed ${!!nm.s.witnessReady}; funeral queued ${S.state.funerals.some((f) => f.who === victimA.id)}` };
  // 7. the lair streams in when near, and only then
  fresh(); K.bind();
  const lp = nm.d.lairs.main.pos; const before = !!K.lairs['netmaker:main'];
  c.player.teleport(new V(lp[0] + 30, 1, lp[1])); await tick(24);
  const rec = K.lairs['netmaker:main']; let meshes = 0; rec?.group.traverse((o) => { if (o.isMesh) meshes++; });
  c.player.teleport(new V(318, 1, 250)); await tick(24); const after = !!K.lairs['netmaker:main'];
  out.lairStreams = { pass: !before && !!rec && meshes > 20 && rec.ids.length > 20 && !after, detail: `far: ${before}; near: ${meshes} meshes, ${rec?.ids.length} colliders, entrances ${rec?.interacts.filter((x) => /safe|second/.test(x)).length}; far again: ${after}` };
  // 8. victims are rare: 120 simulated nights for both killers
  fresh(); K.bind(); K.state.lastGlobal = -99; let killed = 0; const days = [];
  const alive0 = [...S.agents.values()].filter((a) => !a.dead).length;
  c.player.teleport(new V(-200, 1, -200)); await tick(2);
  const t0 = performance.now(); let ticks = 0;
  for (let d = 1; d <= 120; d++) {
    c.time.day = day0 + 10 + d; S.state.incidents = S.state.incidents.filter((i) => i.day > c.time.day - 6);
    c.time.hour = 6; K.tick(1); ticks++; c.time.hour = 23.6; c.weather.cur.rain = 0; c.weather.cur.wind = 0; K.tick(1); ticks++;
    const n = nm.s.events.length + ll.s.events.length; if (n > killed) { days.push(c.time.day); killed = n; }
  }
  const tickMs = (performance.now() - t0) / ticks;
  let gapsOk = true; for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] < (K.R.minDaysBetweenEvents ?? 4)) gapsOk = false;
  out.lowRate = { pass: killed >= 3 && killed <= 120 / 4 && gapsOk, detail: `${killed} events in 120 nights (both killers; budget allows ≤ 30), days ${days.join(',')}; min gap respected ${gapsOk}; ${alive0} people at the start` };
  // 9. the witness roll: a few percent
  let hits = 0; for (let i = 0; i < 20000; i++) if (K.rollWitness()) hits++;
  out.witnessRate = { pass: hits / 20000 > 0.03 && hits / 20000 < 0.05, detail: `${(hits / 200).toFixed(2)} % of 20000 rolls (target ${(K.R.witnessChance * 100).toFixed(0)} %)` };
  // 10. witnessing: still and dark → silent; running in → intervened, victim lives, he knows you
  const startW = async (dist, light) => {
    fresh(); K.bind(); c.settings.mature = false; c.time.hour = 0.5;
    const a = [...S.agents.values()].find((x) => !x.dead && K.score(nm, x) > 0);
    const pos = K.spotPos(nm, nm.d.planning.spots[1], new V());
    c.player.mode = 'foot'; c.player.teleport(pos.clone().add(new V(dist, 0.5, 0))); c.player.flashlight = light; await tick(2);
    K.strike(nm, a, nm.d.planning.spots[1], pos, true); return { a, pos };
  };
  let w1 = await startW(28, false); K.forceNotice = null; for (let i = 0; i < 200 && K.witness; i++) { c.player.velocity.set(0, 0, 0); await tick(1); }
  const s1 = K.lastWitness;
  const w2 = await startW(14, false); for (let i = 0; i < 200 && K.witness; i++) { if (i > 20) c.player.position.lerp(K.witness?.killer.position || c.player.position, 0.2); await tick(1); }
  const s2 = K.lastWitness;
  out.witness = { pass: s1?.state === 'silent' && s1?.outcome === 'taken' && s2?.state === 'intervened' && !w2.a.dead && nm.s.sawPlayer && nm.s.hunting, detail: `still in the dark at 28 m: ${s1?.state} (${s1?.outcome}, he ${s1?.noticed ? 'saw' : 'did not see'} you); ran in from 14 m: ${s2?.state}, ${w2.a.name} ${w2.a.dead ? 'died' : 'lives'}, he saw you ${nm.s.sawPlayer}, hunting ${nm.s.hunting}` };
  // 11. stumbling in with no clues: full horror, no help, until you're out
  fresh(); K.bind(); c.time.hour = 13;
  K.teleportTo('netmaker'); await tick(6);
  const recS = K.lairs['netmaker:main'], second = c.interact.items.get('netmaker:main:second');
  const okSecond = !!second && second.enabled(c);
  const safeLocked = !c.interact.items.get('netmaker:main:safe').enabled(c);
  const cluesBefore = Object.keys(K.state.clues).length;
  second?.onUse(c); await tick(4);
  const inside = !!K.inLair && recS.spots.inside(c.player.position);
  c.interact.items.get('netmaker:main:proof')?.onUse(c);
  const cluesInside = Object.keys(K.state.clues).length - cluesBefore;
  c.interact.items.get('netmaker:main:leave')?.onUse(c); await tick(2);
  const opened = !!K.state.opened.netmaker, cluesAfter = Object.keys(K.state.clues).length;
  out.stumble = { pass: okSecond && safeLocked && inside && cluesInside === 0 && opened && cluesAfter > cluesBefore && nm.s.lairDisturbed, detail: `second entrance usable without the clues ${okSecond} (${cluesBefore} picked up outside); safe entrance locked ${safeLocked}; inside ${inside}; journal entries while inside ${cluesInside}; after leaving: case open ${opened}, clues ${cluesAfter}, he knows someone was there ${nm.s.lairDisturbed}` };
  // 12. the mature gate: a stain stays only with mature content on
  const matureRun = async (on) => { fresh(); K.bind(); c.settings.mature = on; c.time.hour = 0.5; const a = [...S.agents.values()].find((x) => !x.dead && K.score(nm, x) > 0); const pos = K.spotPos(nm, nm.d.planning.spots[2], new V()); c.player.teleport(pos.clone().add(new V(30, 0.5, 0))); await tick(1); K.strike(nm, a, nm.d.planning.spots[2], pos, true); for (let i = 0; i < 220 && K.witness; i++) await tick(1); return !!K.lastStain; };
  const off = await matureRun(false), on = await matureRun(true); c.settings.mature = false;
  out.matureGate = { pass: !off && on, detail: `stain with mature off: ${off}; with mature on: ${on}` };
  out.cost = { pass: tickMs < 5, detail: `${tickMs.toFixed(2)} ms per killer tick (both killers, once a second)` };
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);
