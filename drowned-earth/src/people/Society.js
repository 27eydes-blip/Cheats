import * as THREE from 'three';
import { Person } from '../humans/Person.js';
import { personFor } from '../humans/Roster.js';

// Living NPCs: personalities, needs, moods, routines that bend, decisions
// weighed against risk, and incidents that happen on their own when a
// person's choices cross a creature's territory (the creature system does the
// rest — its normal idle/alert/warning/attack states). Memory, injury, grief,
// funerals, replacements, gossip and conversations follow.
//
// Level of detail: agents near the player get full routines, conversations
// and visible excursions (an Actor walking the route); mid-range agents get
// routines only; far ones tick coarsely and resolve excursions abstractly.
const TRAITS = ['caution', 'curiosity', 'industry', 'warmth', 'greed', 'courage', 'talk', 'superstition', 'honesty', 'temper'];
const _v = new THREE.Vector3();
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (a, r = Math.random()) => a[Math.floor(r * a.length) % a.length];

export class Society {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = ctx.data.people;
    this.agents = new Map();
    this.actors = [];
    this.state = { lastIncidentDay: -2, incidents: [], dead: {}, replaced: {}, funerals: [] };
    this.enabled = !!this.d && ctx.params.get('people') !== 'off';
    if (!this.enabled) return;
    const defs = Object.fromEntries((ctx.data.npcs.npcs || []).map((n) => [n.id, n]));
    for (const [id, p] of Object.entries(this.d.people)) {
      if (!defs[id]) continue;
      const h = hash(id), traits = {};
      TRAITS.forEach((t, i) => { traits[t] = p.traits?.[t] ?? (((h >> (i * 3)) & 7) / 7) * 0.8 + 0.1; });
      this.agents.set(id, {
        id, name: defs[id].name, def: defs[id], p, traits,
        needs: { hunger: 0.3 + (h % 5) / 20, fatigue: 0.2, social: 0.4, safety: 0.1 },
        mood: 'cheerful', drunk: 0, memory: [], knows: {}, attitude: 0, injury: null, grief: null, dead: false,
        lastOuting: -1, cooldown: 0, goal: 'routine',
      });
    }
    // everyone knows a little: the cautious and the superstitious know more about the dangerous places
    for (const a of this.agents.values()) for (const [sid, sc] of Object.entries(this.d.scenarios)) a.knows[sc.creature] = Math.min(1, a.traits.caution * 0.6 + a.traits.superstition * 0.2 + (a.p.habit && this.d.habits[a.p.habit]?.scenario === sid ? 0.3 : 0));
    ctx.events.on('tick:minute', () => this.minute());
    this.buildDebug();
    addEventListener('keydown', (e) => { if (e.code === 'F8') this.toggleDebug(); if (e.code === 'F9') this.forceNearest(); });
    ctx.creatures && (ctx.creatures.actors = this.actors);
    const test = ctx.params.get('incident'); if (test) setTimeout(() => this.forceScenario({ wolf: 'wolf_roof', netweaver: 'drunk_dive', crab: 'crab_nest' }[test] || test, true), 1500);
  }
  npcOf(id) { const com = this.ctx.state.communities?.portage; return com?.npcs.find((n) => n.def.id === id) || null; }
  get community() { return this.ctx.state.communities?.portage; }

  // ---------------------------------------------------------------- moods and needs
  moodOf(a) {
    if (a.dead) return 'dead';
    if (a.grief) return 'grieving';
    if (a.drunk > 0.5) return 'drunk';
    if (a.injury) return 'hurting';
    const n = a.needs;
    if (n.fatigue > 0.75) return 'tired';
    if (n.hunger > 0.75) return 'hungry';
    if (n.safety > 0.6 || this.ctx.weather.cur.wind > 0.7) return 'stressed';
    return a.traits.warmth > 0.5 ? 'cheerful' : 'wary';
  }
  minute() {
    // the clock: needs drift every in-game ~5 s minute tick; coarse for everyone
    const ctx = this.ctx, h = ctx.time.hour, day = ctx.time.day;
    const storm = ctx.weather.cur.wind > 0.7 || ctx.weather.cur.rain > 0.6;
    for (const a of this.agents.values()) {
      if (a.dead) { const dn = this.npcOf(a.id); if (dn && dn.override?.do !== 'away') { dn.override = { from: 0, to: 24, do: 'away' }; dn.root.visible = false; } continue; }
      const n = a.needs;
      n.hunger = Math.min(1, n.hunger + 0.012); n.fatigue = Math.min(1, n.fatigue + (h > 21 || h < 5 ? 0.02 : 0.008)); n.social = Math.min(1, n.social + 0.01 * (0.5 + a.traits.talk));
      n.safety = Math.max(0, n.safety - 0.01) + (storm ? 0.02 : 0);
      a.drunk = Math.max(0, a.drunk - 0.02);
      if (a.injury && day >= a.injury.until) { a.memory.push({ day, type: 'healed', about: a.injury.place }); a.injury = null; }
      if (a.grief && day >= a.grief.until) a.grief = null;
      a.mood = this.moodOf(a);
      this.decide(a, h, day, storm);
    }
    // funerals happen at dusk the day after
    for (const f of this.state.funerals) if (!f.held && day > f.day && h >= 18 && h < 20) { f.held = true; this.funeral(f); }
    // a dead person's job is taken up after a few days
    for (const [id, dd] of Object.entries(this.state.dead)) if (!this.state.replaced[id] && day >= dd.day + 3) this.replace(id);
  }
  // what is this person doing right now, and why
  decide(a, h, day, storm) {
    const npc = this.npcOf(a.id); const n = a.needs, t = a.traits;
    let task = null, goal = 'routine';
    if (a.excursion) { goal = `out: ${a.excursion.scenario}`; task = { do: 'away' }; }
    else if (a.injury && h > 7 && h < 21 && Math.random() < 0.7) { goal = 'resting a wound'; task = { do: 'sit', at: null }; }
    else if (a.grief && h >= 17 && h < 21) { goal = `mourning ${a.grief.who}`; task = { do: 'pray', pos: [1, 1], platform: 'chapel' }; }
    else if (storm && t.caution > 0.4) { goal = 'sheltering from the storm'; task = { do: 'sit' }; }
    else if (n.hunger > 0.7 && h > 6 && h < 21) { goal = 'eating'; task = { do: 'cook' }; n.hunger = Math.max(0, n.hunger - 0.15); }
    else if (n.fatigue > 0.85 || (h >= 22.5 || h < 5.5) && t.industry < 0.8) { goal = 'sleeping'; task = { do: 'sleep' }; if (h < 5.5 || h > 23) n.fatigue = Math.max(0, n.fatigue - 0.05); }
    else if (n.social > 0.65 && h > 17 && h < 23) { goal = 'socialising'; task = { do: 'talk' }; n.social = Math.max(0, n.social - 0.08); }
    // habits: some are risky; the decision weighs want against danger, through the person's traits
    const habit = this.d.habits[a.p.habit];
    if (!a.excursion && habit && Math.abs(h - habit.hour) < 0.5 && a.lastOuting !== day) {
      a.lastOuting = day;
      if (habit.risky) this.consider(a, habit, day);
      else { goal = habit.desc; if (habit.desc.includes('drinks')) a.drunk += 0.3; }
    }
    a.goal = goal;
    if (npc) {
      if (!npc._societyBound) { npc._societyBound = true; a._task = undefined; }
      const want = task ? `${task.do}:${task.pos || ''}` : '';
      if (want !== a._task) { a._task = want; npc.override = task ? { from: 0, to: 24, do: task.do, pos: task.pos || null } : null; }
      npc.speedK = a.injury ? 0.5 : a.drunk > 0.5 ? 0.7 : 1;
      if (task?.do === 'away') npc.root.visible = false;
    }
  }
  // the risk decision: want (greed / habit / drink) vs danger as this person sees it
  consider(a, habit, day) {
    const sc = this.d.scenarios[habit.scenario]; if (!sc) return;
    const t = a.traits;
    const known = a.knows[sc.creature] || 0;
    const perceived = sc.danger * (0.3 + known * 0.7) * (a.drunk > 0.4 ? 0.4 : 1);   // drink makes it look smaller
    const tolerance = (1 - t.caution) * 0.6 + t.courage * 0.25 + (a.injury ? -0.3 : 0) + (a.memory.some((m) => m.type === 'hurt' && m.about === sc.creature) ? (t.courage > 0.7 && t.temper > 0.5 ? 0.1 : -0.5) : 0);
    const want = habit.need === 'greed' ? t.greed : habit.need === 'social' ? a.needs.social + a.drunk : 0.5;
    const go = want + tolerance - perceived > 0.55 + Math.random() * 0.3;
    if (!go) { if (perceived > 0.3) a.memory.push({ day, type: 'avoided', about: sc.creature }); return; }
    // the incident budget: rare, spaced out, never constant
    const sinceLast = day - this.state.lastIncidentDay;
    if (sinceLast < 1.5 || this.state.incidents.filter((i) => i.day > day - 4).length >= 2) return;
    this.startExcursion(a, habit.scenario);
  }

  // ---------------------------------------------------------------- excursions and incidents
  startExcursion(a, sid, nearPlayer = false) {
    const sc = this.d.scenarios[sid], ctx = this.ctx;
    const cr = ctx.creatures?.byId(sc.creature);
    if (!cr || a.dead || a.excursion) return null;
    const day = ctx.time.day;
    this.state.lastIncidentDay = day;
    a.excursion = { scenario: sid, start: day };
    if (sid === 'drunk_dive') a.drunk = Math.max(a.drunk, 0.8);
    const npc = this.npcOf(a.id); if (npc) { npc.override = { from: 0, to: 24, do: 'away' }; npc.root.visible = false; }
    const route = sc.route.map(([x, y, z]) => new THREE.Vector3(cr.home.x + x, cr.home.y + y, cr.home.z + z));
    const near = nearPlayer || (ctx.player.position.distanceTo(cr.home) < 160 && ctx.settings.npcSim !== 'light' && this.actors.length < 2);
    this.log(`${a.name} heads out (${sid}). ${near ? 'Player nearby: simulated.' : 'Far: resolved abstractly.'}`);
    if (near) { const actor = new Actor(this, a, sc, route, cr); this.actors.push(actor); if (ctx.player.position.distanceTo(cr.home) < 90) ctx.ui.subtitle(sc.go.replace('{name}', a.name), 5, 'speech'); return actor; }
    // abstract: personality decides the odds
    const t = a.traits, careful = t.caution * 0.5 + (1 - a.drunk) * 0.2;
    const r = Math.random();
    const out = r < sc.lethal * (1 - careful) ? 'killed' : r < sc.danger * (1 - careful * 0.5) ? 'injured' : r < sc.danger + 0.15 ? 'escaped' : 'fine';
    setTimeout(() => this.resolve(a, sc, out, null), 4000);
    return null;
  }
  resolve(a, sc, outcome, actor) {
    const ctx = this.ctx, day = ctx.time.day, cr = ctx.creatures?.byId(sc.creature);
    const place = cr?.spec.habitat?.split(',')[0] || 'water', creature = cr?.spec.name.toLowerCase().replace(/ves$/, 'f').replace(/s$/, '') || 'thing';
    a.excursion = null;
    if (actor) { actor.dispose(); this.actors.splice(this.actors.indexOf(actor), 1); }
    const npc = this.npcOf(a.id);
    if (npc && outcome !== 'killed') { npc.override = null; npc.root.visible = true; a._task = ''; }
    this.state.incidents.push({ day, who: a.id, scenario: sc.creature, outcome, rescuedBy: actor?.rescuedBy || null });
    this.log(`${a.name}: ${outcome}${actor?.rescuedBy ? ' (rescued by ' + actor.rescuedBy + ')' : ''}`);
    a.knows[sc.creature] = 1;
    if (outcome === 'fine') { a.memory.push({ day, type: 'got away with it', about: sc.creature }); if (sc.loot) ctx.economy.rumours.unshift({ day, text: `${a.name} came back from the ${place} with ${sc.loot}. Lucky.` }); return; }
    if (outcome === 'escaped') {
      a.memory.push({ day, type: 'scare', about: sc.creature });
      a.traits.caution = Math.min(1, a.traits.caution + 0.15);
      this.spread(a, `${a.name} had a scare with the ${creature} at the ${place}.`, sc.creature);
    }
    if (outcome === 'injured') {
      a.injury = { until: day + 3 + Math.floor(Math.random() * 3), place: sc.creature, kind: pick(['a limp', 'a torn arm', 'cracked ribs', 'a long scar']) };
      a.memory.push({ day, type: 'hurt', about: sc.creature });
      const proud = a.traits.courage > 0.7 && a.traits.temper > 0.5;
      a.traits.caution = Math.max(0, Math.min(1, a.traits.caution + (proud ? -0.05 : 0.25)));
      if (npc) npc.root.visible = true;
      this.spread(a, `${a.name} came back from the ${place} with ${a.injury.kind}. The ${creature} did it.`, sc.creature);
    }
    if (outcome === 'killed') this.death(a, sc, creature, place);
    // they remember who helped, and who watched
    if (actor) {
      if (actor.rescuedBy === 'player' || actor.warnedBy === 'player') { a.attitude += 2; a.memory.push({ day, type: 'saved by you' }); ctx.events.emit('fame', { kind: 'legend', text: `Somebody pulled ${a.name} away from a ${creature}. Portage is buying their drinks.` }); }
      else if (actor.playerWatched && outcome !== 'fine') { a.attitude -= 1; a.memory.push({ day, type: 'you watched' }); }
    }
    ctx.events.emit('people:incident', { who: a.id, outcome, creature: sc.creature });
  }
  death(a, sc, creature, place) {
    const ctx = this.ctx, day = ctx.time.day;
    a.dead = true; a.mood = 'dead';
    this.state.dead[a.id] = { day, cause: creature, place };
    const npc = this.npcOf(a.id); if (npc) { npc.override = { from: 0, to: 24, do: 'away' }; npc.root.visible = false; }
    this.state.funerals.push({ who: a.id, name: a.name, day, held: false, cause: creature });
    // the people who loved them grieve; the rival is quiet for once
    for (const b of this.agents.values()) {
      if (b.dead || b === a) continue;
      const close = b.p.friends?.includes(a.id) || a.p.friends?.includes(b.id) || b.p.partner === a.id || b.p.family?.includes(a.id) || a.p.family?.includes(b.id);
      if (close) { b.grief = { who: a.name, until: day + (b.p.partner === a.id || b.p.family?.includes(a.id) ? 7 : 3), cause: creature }; b.memory.push({ day, type: 'lost', about: a.id }); b.knows[sc.creature] = 1; }
      if (b.p.rival === a.id) b.memory.push({ day, type: 'rival died', about: a.id });
    }
    ctx.economy.rumours.unshift({ day, text: `${a.name} died at the ${place}. The ${creature}. The Vigil will light a lantern.` });
    if (ctx.player.position.distanceTo(this.community?.rafts.get('market')?.root.position || _v) < 200) ctx.ui.whisper(`Word comes across the bridges before you see anyone's face: ${a.name} is dead. The ${creature}, at the ${place}.`);
    ctx.events.emit('fame', { kind: 'ghost', text: `${a.name} didn't come home from the ${place}.` });
    ctx.events.emit('people:death', { who: a.id });
  }
  funeral(f) {
    const ctx = this.ctx;
    // friends gather at the chapel at dusk; lanterns go on the water
    for (const b of this.agents.values()) if (b.grief?.who === f.name) { const npc = this.npcOf(b.id); if (npc) npc.override = { from: 0, to: 24, do: 'pray', pos: [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2] }; }
    if (this.community && ctx.player.position.distanceTo(this.community.rafts.get('chapel').root.position) < 120) ctx.ui.whisper(`They hold ${f.name}'s funeral at the chapel at dusk. No body to bury. The Keeper says the names of everyone the ${f.cause} has taken, and then ${f.name}'s, and a lantern goes out onto the dark water.`);
    ctx.events.emit('people:funeral', { who: f.who });
  }
  replace(id) {
    const a = this.agents.get(id); if (!a) return;
    this.state.replaced[id] = true;
    const newName = pick(['Marisol Quint', 'Deke Farrow', 'Ines Abara', 'Tobin Shaw', 'Rhee Calder', 'Opal Mensah']);
    this.ctx.economy.rumours.unshift({ day: this.ctx.time.day, text: `${newName} has taken ${a.name}'s bunk and ${a.p.job} work. People are polite to them, carefully.` });
    this.log(`${newName} replaces ${a.name}`);
  }
  // news and knowledge travel along friendships, and out to other rafts as rumour
  spread(a, text, creatureId) {
    const day = this.ctx.time.day;
    for (const b of this.agents.values()) if (!b.dead && (a.p.friends?.includes(b.id) || b.p.friends?.includes(a.id))) { b.knows[creatureId] = Math.max(b.knows[creatureId] || 0, 0.9); b.memory.push({ day, type: 'heard', about: a.id, text }); }
    this.ctx.economy.rumours.unshift({ day, text });
    this.ctx.economy.rumours.length = Math.min(this.ctx.economy.rumours.length, 14);
  }

  // ---------------------------------------------------------------- talk
  // a line for this person in their own voice, coloured by what they remember
  lineFor(npc) {
    const a = this.agents.get(npc.def.id); if (!a || a.dead) return null;
    const T = this.d.talk, mem = a.memory.slice().reverse();
    if (mem.find((m) => m.type === 'saved by you')) return pick(T.thanks);
    if (mem.find((m) => m.type === 'you watched')) return pick(T.resent);
    if (a.grief) return pick(T.grief).replaceAll('{dead}', a.grief.who).replace('{creature}', a.grief.cause);
    if (a.injury) return pick(T.injured);
    const heard = mem.find((m) => m.type === 'heard'); if (heard && Math.random() < 0.6) return this.voice(a, heard.text);
    return this.voice(a, pick(T.greet[a.p.speech] || T.greet.blunt));
  }
  voice(a, line) {
    switch (a.p.speech) {
      case 'rambling': return line + pick([' Anyway.', ' And so on, and so on.', ' Where was I.']);
      case 'nervous': return pick(['I— ', 'Um. ', 'Sorry — ']) + line;
      case 'formal': return line;
      case 'joking': return line + pick(['', ' Ha.', ' Don\'t quote me.']);
      default: return line.split('. ')[0] + (line.includes('. ') ? '.' : '');
    }
  }
  // two people near each other talk; the player overhears
  chatter(dt) {
    this.chatT = (this.chatT ?? 8) - dt;
    if (this.chatT > 0 || this.ctx.ui.panel) return;
    this.chatT = (9 + Math.random() * 10) * (this.ctx.settings.npcSim === 'light' ? 2.5 : 1);
    const com = this.community; if (!com) return;
    const pp = this.ctx.player.position;
    const near = com.npcs.filter((n) => n.root.visible && this.agents.get(n.def.id) && !this.agents.get(n.def.id).dead && n.worldPos(_v).distanceTo(pp) < 14);
    if (near.length < 2) return;
    const x = pick(near), others = near.filter((n) => n !== x && n.worldPos(_v).distanceTo(x.worldPos(new THREE.Vector3())) < 6);
    if (!others.length) return;
    const y = pick(others), A = this.agents.get(x.def.id), B = this.agents.get(y.def.id), T = this.d.talk;
    let topic = 'joke';
    if (A.p.rival === B.id || B.p.rival === A.id) topic = 'argue';
    else if (A.p.partner === B.id) topic = 'flirt';
    else if (A.grief || B.grief) topic = 'grief';
    else if (this.state.incidents.length && Math.random() < 0.5) topic = 'gossip';
    else if (this.ctx.weather.cur.wind > 0.6) topic = 'weather';
    else if (A.p.job === 'trade' || B.p.job === 'trade') topic = 'bargain';
    const inc = this.state.incidents[this.state.incidents.length - 1];
    const fill = (s) => s.replaceAll('{who}', topic === 'gossip' && inc ? this.agents.get(inc.who)?.name : B.name).replaceAll('{dead}', (A.grief || B.grief)?.who || '').replace('{creature}', inc ? this.ctx.creatures?.byId(inc.scenario)?.spec.name.toLowerCase() : 'thing').replace('{place}', 'old roofs');
    const l1 = this.voice(A, fill(pick(T[topic]))), l2 = this.voice(B, fill(pick(topic === 'argue' ? T.argue : topic === 'flirt' ? ['Get away with you.', 'Only if you carry the lantern.'] : topic === 'grief' ? T.grief : ['Mm.', 'Hah. True.', 'Don\'t start.', 'You heard that from Odile, didn\'t you.'])));
    this.ctx.ui.subtitle(`${A.name}: ${l1}`, 3.5, 'speech');
    setTimeout(() => this.ctx.ui.subtitle(`${B.name}: ${l2}`, 3.5, 'speech'), 3600);
    // conversations share knowledge (and sometimes make it worse)
    for (const [k, v] of Object.entries(A.knows)) B.knows[k] = Math.max(B.knows[k] || 0, v * 0.8);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.enabled) return;
    for (const act of [...this.actors]) act.update(dt);
    this.chatter(dt);
    if (this.debug) this.updateDebug();
  }

  // ---------------------------------------------------------------- testing
  forceScenario(sid, teleport = false) {
    const sc = this.d.scenarios[sid]; if (!sc) return;
    const who = [...this.agents.values()].find((a) => !a.dead && !a.excursion && this.d.habits[a.p.habit]?.scenario === sid) || [...this.agents.values()].find((a) => !a.dead && !a.excursion);
    const cr = this.ctx.creatures?.byId(sc.creature);
    if (teleport && cr) { const p = this.ctx.player; p.mode = sc.medium === 'water' ? 'swim' : 'foot'; p.teleport(cr.home.clone().add(new THREE.Vector3(sc.route[0][0] + 6, sc.medium === 'water' ? 5.6 : sc.medium === 'roof' ? 0.1 : 0.5, sc.route[0][2] + 6))); }
    this.state.lastIncidentDay = -99;
    return this.startExcursion(who, sid, true);
  }
  forceNearest() {
    let best = null, bd = Infinity;
    for (const [sid, sc] of Object.entries(this.d.scenarios)) { const cr = this.ctx.creatures?.byId(sc.creature); if (!cr) continue; const d = cr.home.distanceTo(this.ctx.player.position); if (d < bd) { bd = d; best = sid; } }
    if (best) { this.ctx.ui.toast(`Debug: forcing ${best}`); this.forceScenario(best); }
  }
  log(s) { (this.logLines ||= []).push(`${this.ctx.time.day}d ${this.ctx.time.hour.toFixed(1)}h ${s}`); if (this.logLines.length > 80) this.logLines.shift(); if (this.debug || this.ctx.params.has('peoplelog')) console.log('[people]', s); }
  buildDebug() {
    this.debug = this.ctx.params.get('people') === 'debug';
    this.dbgEl = document.createElement('div');
    this.dbgEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:31;font:10px ui-monospace,monospace;color:#e8f0e8;text-shadow:0 0 3px #000';
    this.dbgEl.style.display = this.debug ? 'block' : 'none';
    document.body.appendChild(this.dbgEl);
  }
  toggleDebug() { this.debug = !this.debug; this.dbgEl.style.display = this.debug ? 'block' : 'none'; }
  updateDebug() {
    const cam = this.ctx.camera, html = [];
    const show = (name, a, wp) => {
      const p = wp.clone().setY(wp.y + 2.2).project(cam); if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
      const t = a.traits;
      html.push(`<div style="position:absolute;left:${((p.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px;top:${((-p.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px;transform:translate(-50%,-100%);background:rgba(0,0,0,.55);padding:3px 5px;white-space:nowrap">
        <b>${name}</b> · ${a.mood} · ${a.goal}<br>cau ${t.caution.toFixed(1)} grd ${t.greed.toFixed(1)} brv ${t.courage.toFixed(1)} tmp ${t.temper.toFixed(1)} · risk tol ${((1 - t.caution) * 0.6 + t.courage * 0.25).toFixed(2)}<br>
        hun ${a.needs.hunger.toFixed(1)} fat ${a.needs.fatigue.toFixed(1)} soc ${a.needs.social.toFixed(1)} saf ${a.needs.safety.toFixed(1)}${a.drunk > 0.1 ? ' drunk ' + a.drunk.toFixed(1) : ''}<br>
        knows: ${Object.entries(a.knows).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ')}</div>`);
    };
    const com = this.community;
    if (com) for (const n of com.npcs) { const a = this.agents.get(n.def.id); if (a && n.root.visible && n.worldPos(_v).distanceTo(this.ctx.player.position) < 25) show(a.name, a, n.worldPos(new THREE.Vector3())); }
    for (const act of this.actors) show(`${act.a.name} [${act.react}] hp ${act.hp.toFixed(0)}`, act.a, act.pos);
    html.push(`<div style="position:absolute;left:8px;bottom:60px;max-width:46vw;background:rgba(0,0,0,.5);padding:4px">${(this.logLines || []).slice(-8).join('<br>')}<br>F8 overlay · F9 force incident near you</div>`);
    this.dbgEl.innerHTML = html.join('');
  }
  toJSON() { return { state: this.state, agents: [...this.agents.values()].map((a) => ({ id: a.id, traits: a.traits, needs: a.needs, memory: a.memory.slice(-20), knows: a.knows, attitude: a.attitude, injury: a.injury, grief: a.grief, dead: a.dead, drunk: a.drunk })) }; }
  load(o) {
    if (!o) return;
    this.state = { ...this.state, ...o.state };
    for (const s of o.agents || []) { const a = this.agents.get(s.id); if (a) Object.assign(a, s, { excursion: null, _task: undefined }); }
  }
}

// ---------------------------------------------------------------- an NPC out in the world
// Walks (or swims, or wades) the scenario's route. Creatures perceive it like
// they perceive the player. Its reactions come from its personality: freeze,
// back away, panic and flee, fight, or call for help. The player can warn it,
// distract the creature, or pull it clear when it's down.
class Actor {
  constructor(soc, a, sc, route, creature) {
    this.soc = soc; this.ctx = soc.ctx; this.a = a; this.sc = sc; this.route = route; this.cr = creature;
    this.name = a.name; this.pos = route[0].clone(); this.leg = 1; this.hp = 100; this.alive = true; this.safe = false;
    this.noise = 0.15 + (a.drunk > 0.4 ? 0.3 : 0) + a.traits.talk * 0.1; this.light = sc.medium === 'water' ? 0 : a.traits.caution > 0.6 ? 1 : 0; this.food = 0; this.blood = 0; this.running = false;
    this.react = 'walking'; this.t = 0; this.dwell = 0; this.downed = false; this.playerWatched = false;
    this.heading = 0;
    if (soc.ctx.humans) {
      this.person = new Person(this.ctx, this.ctx.humans, personFor(a.id, { name: a.name, presents: a.def?.presents, role: a.def?.role }));
      this.ctx.scene.add(this.person.root);
    }
    const I = this.ctx.interact;
    this.ids = [
      I.add({ kind: 'npc', mode: 'any', radius: 16, requireLook: false, pos: (v) => v.copy(this.pos).setY(this.pos.y + 1.6), enabled: () => this.alive && !this.safe && !this.downed && this.cr.prey === this && this.cr.state !== 'idle', prompt: `Shout a warning to ${this.name}`, onUse: () => this.warn() }),
      I.add({ kind: 'npc', mode: 'any', radius: 2.6, requireLook: false, pos: (v) => v.copy(this.pos).setY(this.pos.y + 0.6), enabled: () => this.alive && this.downed, prompt: `Pull ${this.name} clear`, onUse: () => this.rescue() }),
    ];
  }
  // personality decides how they react to a creature that has noticed them
  chooseReaction() {
    const t = this.a.traits, drunk = this.a.drunk;
    if (drunk > 0.6) return Math.random() < 0.5 ? 'stumble' : 'freeze';
    if (t.courage > 0.7 && t.temper > 0.55) return 'fight';
    if (t.courage < 0.35) return 'panic';
    if (t.caution > 0.6) return 'back away';
    return Math.random() < 0.5 ? 'freeze' : 'back away';
  }
  bark(text) { if (this.pos.distanceTo(this.ctx.player.position) < 45) this.ctx.ui.subtitle(`${this.name}: ${text}`, 3, 'speech'); }
  warn() {
    this.warnedBy = 'player';
    this.react = 'back away'; this.a.knows[this.sc.creature] = 1;
    this.ctx.events.emit('noise', { level: 0.6, pos: this.ctx.player.position.clone() }); // a shout carries: it may turn on you instead
    this.bark(pick(['I hear you! Going, going!', 'Alright! I\'m backing off!', 'Damn it — thanks!']));
  }
  rescue() {
    this.rescuedBy = 'player'; this.downed = false; this.safe = true; this.react = 'carried';
    if (Math.random() < 0.5) this.ctx.injury?.hit(6, { source: this.sc.creature, what: 'the ' + this.cr.spec.name.toLowerCase() });
    this.ctx.ui.whisper(`You get an arm under ${this.name} and haul. They're heavy, and shaking, and alive.`);
    this.finish(this.hp < 60 ? 'injured' : 'escaped');
  }
  hit(amount, opts = {}) {
    if (!this.alive || this.safe) return;
    const armour = this.react === 'fight' ? 0.75 : 1;
    this.hp -= amount * armour * (opts.lethal ? 3 : 1);
    if (this.ctx.player.position.distanceTo(this.pos) < 25) this.playerWatched = true; // you were right there
    this.ctx.events.emit('people:hit', { who: this.a.id, hp: this.hp });
    if (this.react !== 'fight' && Math.random() < 0.6) this.bark(pick(['Ah! Get off!', 'Help! Somebody!', 'No no no—', 'It\'s got me!']));
    if (this.hp <= 0) { this.alive = false; this.finish('killed'); return; }
    if (this.hp < 35 && !this.downed) { this.downed = true; this.react = 'down'; this.bark('I can\'t— my leg— help me!'); this.downT = 0; }
  }
  finish(outcome) { if (this.done) return; this.done = true; setTimeout(() => this.soc.resolve(this.a, this.sc, outcome, this), outcome === 'killed' ? 2500 : 500); }
  dispose() { for (const id of this.ids) this.ctx.interact.remove(id); if (this.person) { this.ctx.scene.remove(this.person.root); this.person.dispose(); } }
  update(dt) {
    if (this.done) { if (this.person) this.person.root.visible = this.alive || this.t < 2; return; }
    this.t += dt;
    const cr = this.cr, p = this.ctx.player.position;
    const threatened = cr.prey === this && (cr.state === 'warning' || cr.state === 'attack' || cr.state === 'alert');
    if (threatened && this.react === 'walking' && !this.pushedOn) { this.pushedOn = cr.state !== 'attack'; this.reactT = 0; this.react = cr.state === 'attack' ? this.chooseReaction() : (this.a.traits.courage > 0.7 ? 'fight' : this.chooseReaction()); this.bark({ freeze: 'Don\'t move. Don\'t move.', 'back away': 'Easy… easy… I\'m going.', panic: 'Oh no. Oh no no no—', fight: 'Come on, then! Come on!', stumble: 'Wha— who\'s there?' }[this.react] || '…'); if (this.react === 'panic') this.running = true; }
    let speed = (this.sc.medium === 'water' ? 1.1 : 1.4) * (this.a.drunk > 0.5 ? 0.7 : 1) * (this.a.traits.caution < 0.3 ? 1.25 : 1);
    let target = this.route[Math.min(this.leg, this.route.length - 1)];
    const away = _v.copy(this.pos).sub(cr.pos).setY(0).normalize();
    this.reactT = (this.reactT || 0) + dt;
    if (['freeze', 'fight', 'stumble'].includes(this.react) && cr.state !== 'attack' && this.reactT > 4) {
      // nothing came: the bold push on, the careful think better of it
      this.react = this.a.traits.caution < 0.4 || this.a.drunk > 0.5 ? 'walking' : 'back away'; this.reactT = 0;
      if (this.react === 'walking') this.bark(pick(['It\'s just watching. Fine. I\'m going through.', 'Stay. Stay. Good dog.', 'Not tonight, you ugly thing.']));
    }
    if (this.react === 'walking' && cr.state === 'attack' && cr.prey === this) { this.react = this.chooseReaction(); this.reactT = 0; }
    switch (this.react) {
      case 'freeze': speed = 0; this.noise = 0.02; if (this.t % 6 > 4 && cr.state !== 'attack') this.react = 'back away'; break;
      case 'back away': target = this.pos.clone().addScaledVector(away, 5); speed *= 0.55; this.noise = 0.05; break;
      case 'panic': target = this.pos.clone().addScaledVector(away, 8); speed *= 2.2; this.noise = 0.7; break;
      case 'fight': speed = 0; this.noise = 0.5; if (cr.pos.distanceTo(this.pos) > 4 && this.reactT > 6) { this.react = 'back away'; this.reactT = 0; this.bark('Yeah. That\'s what I thought.'); } if (cr.state === 'attack' && cr.pos.distanceTo(this.pos) < 2.5 && (this.swingT = (this.swingT || 0) - dt) <= 0) { this.swingT = 1.2; cr.takeDamage(8); if (cr.health < cr.spec.health * 0.5 && cr.state === 'attack') { cr.setState('return', `driven off by ${this.name}`); this.react = 'back away'; this.bark('That\'s right! Go on!'); } } break;
      case 'stumble': target = this.pos.clone().add(new THREE.Vector3(Math.sin(this.t * 1.3) * 3, 0, Math.cos(this.t) * 3)).add(target.clone().sub(this.pos).setLength(1)); speed *= 0.5; break;
      case 'down': speed = 0; this.noise = 0.3; this.downT += dt;
        if (this.sc.medium === 'water') this.pos.y = Math.min(cr.home.y + 5.6, this.pos.y + dt * 0.7); // a limp body floats up out of the threads
        if (this.downT > 12 && Math.random() < dt * 0.15) { this.rescuedBy = 'a friend'; this.downed = false; this.safe = true; this.finish('injured'); } break;
      default: break;
    }
    if (speed > 0) {
      const dir = target.clone().sub(this.pos); const L = dir.length();
      if (L < 0.4 && this.react === 'walking') {
        if (this.leg === 2 && !this.dwelt) { this.dwell += dt; speed = 0; if (this.dwell > 4) this.dwelt = true; } // the thing they came for
        else this.leg++;
      } else if (L > 0.01) { this.pos.addScaledVector(dir, Math.min(L, speed * dt) / L); this.heading = Math.atan2(dir.x, dir.z); }
    }
    // made it out of the territory
    if (this.leg >= this.route.length || (this.react !== 'walking' && this.react !== 'down' && Math.hypot(this.pos.x - cr.home.x, this.pos.z - cr.home.z) > cr.spec.territoryR + cr.spec.leash + 4)) {
      this.safe = true; this.finish(this.hp < 60 ? 'injured' : this.react === 'walking' ? 'fine' : 'escaped'); return;
    }
    if (this.person) {
      const pr = this.person; pr.root.position.copy(this.pos); pr.root.rotation.y = this.heading;
      if (this.sc.medium === 'water') pr.root.position.y -= 1.2;
      pr.play(this.downed ? 'Sitting_Idle_Loop' : this.sc.medium === 'water' ? (speed > 0 ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop') : speed > 2.5 ? 'Jog_Fwd_Loop' : speed > 0.2 ? 'Walk_Loop' : this.react === 'fight' ? 'Push_Loop' : 'Idle_Loop', 0.3);
      pr.update(dt, this.react !== 'walking' ? cr.pos : null);
    }
  }
}
