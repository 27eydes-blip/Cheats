// The Hunters: two fictional serial killers living ordinary lives among the raft-folk. By day each is a normal
// NPC with a full Living-NPC record (people.json) and nothing about him is marked. At night, on a slow tick
// (once a second, real time), each one watches, plans, waits, strikes rarely, covers his tracks, and adapts to
// the player: what you asked, where you went, what you carried, who you spoke to.
//
//   dawn(k)      watch who is alone / unliked / out at night, day after day; pick a target once he has
//                watched them long enough; choose a place he hasn't failed at and you haven't been watching;
//                arrange an alibi (seen in public with witnesses)
//   night        wait out storms, patrols, crowds and nosy players; strike only under the global incident
//                budget and his own patience (days to weeks between); a warned or escorted target can get away
//   after        a victim vanishes (Living-NPC death: grief, rumours, funerals); clues are left or washed away,
//                sometimes another person is framed; the Ward and the Concord say something useless
//   the player   suspicion builds from clues found, questions asked, nights spent near his places; he
//                befriends, misleads, hides trophies, moves the lair, scares you, or hunts you
//   witness      a few percent of events, if you're near, in the dark, with a line of sight: a silhouette
//                dragging someone off a dock, a splash, silence. Stay still, run, hide or intervene.
//   lairs        streamed only when near; a safe entrance unlocked by 5+ clues, and a second one you can
//                stumble into with none; he may be home; he notices the signs you leave
import * as THREE from 'three';
import { buildBarge, buildTower, figure } from './Lairs.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const inHours = (h, [a, b]) => (a < b ? h >= a && h < b : h >= a || h < b);

export class Killers {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = ctx.data.killers;
    this.enabled = !!this.d && !!ctx.society?.enabled && ctx.params.get('killers') !== 'off';
    this.R = this.d?.rules || {};
    this.state = this.fresh();
    this.k = {};
    this.items = new Map();   // spawned clue items in the world: id → { mesh, pos, clue, killer }
    this.lairs = {};          // streamed lair records by killer id
    this.figures = [];        // silhouettes that can be hit (hunters)
    this.acc = 0; this.streamT = 0; this.radioT = 0;
    if (!this.d) return;
    for (const [id, d] of Object.entries(this.d.killers)) this.k[id] = { id, d };
    // keep the city generator from building over the lairs (no chart entry, no marker: these are plain claims)
    const wm = ctx.worldMap;
    if (wm) {
      wm.extraClaims = wm.extraClaims || [];
      for (const k of Object.values(this.k)) for (const l of Object.values(k.d.lairs)) wm.extraClaims.push({ id: `quiet_${l.pos[0]}_${l.pos[1]}`, pos: l.pos, clear: 22 });
    }
    if (!this.enabled) return;
    ctx.events.on('talk', (e) => this.onTalk(e?.npc));
    ctx.events.on('weapon:fire', () => this.onNoise(1));
    ctx.events.on('noise', (e) => this.onNoise(e?.level ?? 0.7));
    this.buildDebug();
    addEventListener('keydown', (e) => { if (e.code === 'F6') this.toggleDebug(); });
    // the report-the-proof spot: the Ward clerk's table on Portage market
    ctx.interact.add({ id: 'killers:report', kind: 'talk', mode: 'foot', radius: 2.2,
      pos: (v) => { const r = ctx.state.communities?.portage?.rafts.get('market'); return r ? r.worldPoint(v.set(-2.5, r.deck + 1, 1.5), v) : v.set(0, -999, 0); },
      prompt: 'Lay the proof before the Ward clerk', enabled: () => Object.values(this.k).some((k) => k.s.proof && !k.s.caught), onUse: () => { for (const k of Object.values(this.k)) if (k.s.proof && !k.s.caught) this.solve(k); return true; } });
    const dbg = ctx.params.get('killer'); if (dbg && this.k[dbg]) setTimeout(() => this.teleportTo(dbg), 1200);
  }
  fresh() {
    const st = { lastGlobal: -99, clues: {}, theory: {}, opened: {}, solved: {}, stats: { events: 0, witnessed: 0, rolls: 0 }, killers: {} };
    for (const id of Object.keys(this.d?.killers || {})) st.killers[id] = this.freshK();
    return st;
  }
  freshK() {
    return { mode: 'day', stress: 0.1, caution: 0.5, lastEvent: -99, nextEarliest: 3 + Math.random() * 4, watch: {}, plan: null, failedSpots: [], watchedSpots: [],
      lair: 'main', trophiesHidden: false, events: [], noticed: { asked: 0, nearLair: 0, lights: 0, talkedTo: {}, places: {}, carried: 0, met: 0 }, suspicion: 0,
      hunting: false, sawPlayer: false, playerSaw: false, wound: -1, hp: this.R?.hunterHp ?? 320, caught: false, dead: false, proof: false, framed: null, lieLow: 0, lairDisturbed: false, homeT: 0, told: {} };
  }
  get society() { return this.ctx.society; }
  agentOf(k) { return this.society?.agents.get(k.d.npc); }
  npcOf(id) { for (const com of Object.values(this.ctx.state.communities || {})) { const n = com.npcs?.find((x) => x.def.id === id); if (n) return n; } return null; }
  bind() { for (const [id, k] of Object.entries(this.k)) k.s = this.state.killers[id] || (this.state.killers[id] = this.freshK()); }

  // ---------------------------------------------------------------- per frame (cheap) and the slow tick
  update(dt) {
    if (!this.enabled) return;
    if (!this.k.netmaker?.s) this.bind();
    this.acc += dt;
    const step = this.R.tickSeconds || 1;
    if (this.acc >= step) { const n = this.acc; this.acc = 0; this.tick(n); }
    this.streamT -= dt; if (this.streamT <= 0) { this.streamT = 0.5; this.stream(); }
    if (this.witness) this.updateWitness(dt);
    for (const f of this.figures) f.update(dt);
    if (this.inLair) this.updateLair(dt);
    if (this.debug) this.updateDebug();
  }
  tick(dt) {
    const c = this.ctx, day = c.time.day, h = c.time.hour;
    for (const k of Object.values(this.k)) {
      const s = k.s; if (s.caught || s.dead) continue;
      if (s.lastDawn !== day && h >= 5.5) { s.lastDawn = day; this.dawn(k); }
      this.watchPlayer(k, dt);
      if (inHours(h, this.R.eventHours || [22.5, 3.5])) this.night(k);
      else if (s.mode !== 'day' && h > 6 && h < 20) s.mode = s.wound > day ? 'healing' : 'day';
      this.maybeHunt(k);
    }
    this.clueChecks(dt);
  }

  // ---------------------------------------------------------------- planning
  // how attractive a target someone is, to this killer: alone, unliked, out at night; never his friends
  score(k, a) {
    const me = this.agentOf(k); if (!a || a.dead || a.id === k.d.npc || Object.values(this.k).some((o) => o.d.npc === a.id)) return 0;
    if (me?.p.friends?.includes(a.id) || a.p.friends?.includes(k.d.npc)) return 0;
    const friends = (a.p.friends || []).length + [...this.society.agents.values()].filter((b) => b.p.friends?.includes(a.id)).length;
    const disliked = [...this.society.agents.values()].filter((b) => b.p.rival === a.id).length;
    const habit = this.society.d.habits[a.p.habit];
    const night = habit && (habit.hour >= 20 || habit.hour < 4) ? 1 : 0;
    const prefers = k.d.planning.prefers;
    let s = 0.2;
    if (prefers.includes('alone')) s += (1 - Math.min(friends, 6) / 6) * 0.45;
    if (prefers.includes('unliked')) s += disliked * 0.15 + (1 - a.traits.warmth) * 0.15;
    if (prefers.includes('night')) s += night * 0.25;
    if (prefers.includes('travelling')) s += (habit?.risky || /fish|running/.test(a.p.habit || '') ? 0.3 : 0);
    if (this.warned(a)) s *= 0.3;
    return s;
  }
  warned(a) { return a.memory?.some((m) => m.type === 'warned of the killings' && m.day > this.ctx.time.day - 7); }
  dawn(k) {
    const s = k.s, day = this.ctx.time.day, light = this.ctx.settings.npcSim === 'light';
    s.stress = Math.max(0, s.stress - 0.05);
    if (s.wound > day) { s.mode = 'healing'; return; }
    // watch: day by day he notices who is alone at night (Light simulation watches fewer people)
    const pool = [...this.society.agents.values()].filter((a) => !a.dead);
    const watchList = light ? pool.sort(() => Math.random() - 0.5).slice(0, 5) : pool;
    for (const a of watchList) { const sc = this.score(k, a); if (sc > 0.45) s.watch[a.id] = (s.watch[a.id] || 0) + 1; else if (s.watch[a.id]) s.watch[a.id] = Math.max(0, s.watch[a.id] - 1); }
    // counterintelligence: what are people saying, and has the Ward said anything?
    const talk = (this.ctx.economy?.rumours || []).slice(0, 6).map((r) => r.text).join(' ');
    if (/Ward .*(investigat|search|patrol)/i.test(talk) && s.lieLow < day) { s.lieLow = day + 7 + Math.random() * 7; s.plan = null; this.log(k, 'the Ward is talking; he lies low'); }
    this.adapt(k);
    if (s.plan && (s.plan.day < day - 3 || this.society.agents.get(s.plan.target)?.dead)) s.plan = null;
    if (s.plan || day < s.nextEarliest || day < s.lieLow) return;
    // a target he's watched long enough
    const need = this.R.observeDaysNeeded ?? 3;
    const cand = pool.filter((a) => (s.watch[a.id] || 0) >= need).sort((x, y) => this.score(k, y) - this.score(k, x));
    if (!cand.length) return;
    const target = cand[0];
    const spot = this.chooseSpot(k);
    if (!spot) { this.log(k, 'every place is watched or burned; he waits'); return; }
    // the alibi: be seen in public, with people who'll say so
    const me = this.agentOf(k);
    const friends = (me?.p.friends || []).map((id) => this.society.agents.get(id)).filter((a) => a && !a.dead);
    const with_ = (friends.length >= 2 ? friends : pool.filter((a) => a.id !== target.id && a.id !== k.d.npc)).slice(0, 2);
    s.plan = { target: target.id, spot: spot.id, day, alibi: { place: k.d.planning.alibiPlace, with: with_.map((a) => a.id), names: with_.map((a) => a.name) } };
    this.log(k, `plans: ${target.name} at ${spot.name}; alibi ${s.plan.alibi.place} with ${s.plan.alibi.names.join(' and ')}`);
  }
  chooseSpot(k) {
    const s = k.s, day = this.ctx.time.day;
    const ok = k.d.planning.spots.filter((sp) => !s.failedSpots.includes(sp.id) && !s.watchedSpots.some((w) => w.id === sp.id && w.until > day));
    return ok.length ? pick(ok) : null;
  }
  spotPos(k, sp, out = new THREE.Vector3()) {
    const com = this.ctx.state.communities?.portage;
    if (sp.lure) { const r = com?.rafts.get('market'); const c = r ? r.root.getWorldPosition(_w) : _w.set(318, 0, 250); return out.set(c.x + sp.lure[0], 0, c.z + sp.lure[1]); }
    const r = com?.rafts.get(sp.raft);
    if (!r) { const base = this.ctx.worldMap?.landmarks.find((l) => l.id === 'portage')?.pos || [318, 250]; return out.set(base[0], 0.6, base[1]); }
    let x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of r.rects) { x1 = Math.max(x1, q.x1); z0 = Math.min(z0, q.z0); z1 = Math.max(z1, q.z1); }
    return r.worldPoint(out.set(x1 - 0.6, r.deck, (z0 + z1) / 2), out);
  }

  // ---------------------------------------------------------------- the night
  night(k) {
    const c = this.ctx, s = k.s, day = c.time.day, plan = s.plan;
    if (!plan || plan.done === day || day < s.nextEarliest || s.wound > day || day < s.lieLow) return;
    s.mode = 'stalking';
    const w = c.weather.cur;
    if (w.rain > 0.6 || w.wind > 0.7) { if (plan.waited !== day) { plan.waited = day; this.log(k, 'waits out the storm'); } return; }
    const sp = k.d.planning.spots.find((x) => x.id === plan.spot);
    const pos = this.spotPos(k, sp, new THREE.Vector3());
    const pp = c.player.position, dP = pp.distanceTo(pos);
    const a = this.society.agents.get(plan.target);
    if (!a || a.dead) { s.plan = null; return; }
    // the target with people round them, or the player escorting them: not tonight, and not there again
    const tnpc = this.npcOf(a.id);
    if (tnpc && tnpc.worldPos(_v).distanceTo(pp) < 12) {
      s.failedSpots.push(sp.id); s.stress = Math.min(1, s.stress + 0.15); s.plan = null; plan.done = day;
      this.log(k, `${a.name} is being looked after; he drops it and burns ${sp.name}`); return;
    }
    // a nosy player near the place, or a lantern lit there: wait, and remember the place is watched
    if (dP < 60 && (c.player.flashlight || dP < 25)) {
      if (!s.watchedSpots.some((x) => x.id === sp.id)) s.watchedSpots.push({ id: sp.id, until: day + 6 });
      if (plan.waitedPlayer !== day) { plan.waitedPlayer = day; this.log(k, `someone is watching ${sp.name}; he waits`); }
      return;
    }
    // the global budget: rare, never back to back, never on top of other incidents
    const minGap = this.R.minDaysBetweenEvents ?? 4;
    const recent = this.society.state.incidents.filter((i) => i.day > day - 4).length;
    if (day - this.state.lastGlobal < minGap || recent >= 2) return;
    plan.done = day;
    this.strike(k, a, sp, pos);
  }
  strike(k, a, sp, pos, forceWitness = null) {
    const c = this.ctx, s = k.s, day = c.time.day;
    this.state.lastGlobal = day; s.lastEvent = day; this.state.stats.events++; s.lastAlibi = s.plan?.alibi || null;
    const [g0, g1] = this.R.extraGapDays || [0, 9];
    s.nextEarliest = day + (this.R.minDaysBetweenEvents ?? 4) + g0 + Math.random() * (g1 - g0) + s.stress * 7;
    // could the player see it? near, dark, a line of sight, and only a few percent of the time
    const pp = c.player.eye || c.player.position, d = pp.distanceTo(pos);
    const dark = c.time.out?.night > 0.5 || c.time.hour > 21 || c.time.hour < 5;
    let los = d < (this.R.witnessRange ?? 45) && dark;
    if (los) { const dir = _v.copy(pos).setY(pos.y + 1).sub(pp); const L = dir.length(); los = c.collision.raycast(pp, dir.normalize(), L) >= L - 1; }
    this.state.stats.rolls += los ? 1 : 0;
    const witnessed = forceWitness ?? (los && this.rollWitness());
    this.log(k, `strikes at ${sp.name}: ${a.name}${witnessed ? ' — the player is watching' : ''}`);
    if (witnessed) { this.state.stats.witnessed++; this.startWitness(k, a, sp, pos); return 'witness'; }
    const escaped = this.warned(a) && Math.random() < 0.45;
    this.resolve(k, a, sp, pos, escaped ? 'escaped' : 'taken');
    return escaped ? 'escaped' : 'taken';
  }
  rollWitness() { return Math.random() < (this.R.witnessChance ?? 0.04); }
  resolve(k, a, sp, pos, outcome) {
    const c = this.ctx, s = k.s, day = c.time.day, soc = this.society;
    s.plan = null; s.mode = 'covering';
    if (outcome === 'escaped' || outcome === 'saved') {
      s.failedSpots.push(sp.id); s.stress = Math.min(1, s.stress + 0.25); s.nextEarliest += 5;
      a.memory.push({ day, type: outcome === 'saved' ? 'saved by you' : 'scare', about: 'the docks' });
      if (outcome === 'saved') { a.attitude += 2; a.injury = { until: day + 4, place: 'docks', kind: 'rope burns round both wrists' }; }
      soc.spread(a, outcome === 'saved' ? `${a.name} says someone dragged them toward the water last night, and somebody else came running.` : `${a.name} swears something grabbed at them at ${sp.name} in the dark. They got loose. Nobody saw who.`, 'docks');
      s.events.push({ day, victim: a.id, spot: sp.id, outcome });
      return;
    }
    // taken: a Living-NPC death with no body and no cause anyone can name
    this.vanish(k, a, sp);
    s.events.push({ day, victim: a.id, spot: sp.id, outcome: 'taken', alibi: s.lastAlibi });
    // cover: careful killers wash the place; a pressured one leaves something, or frames someone
    const covered = Math.random() < s.caution * 0.4 + (s.suspicion > 0.5 ? 0.3 : 0);
    if (!covered) this.spawnItem(k, k.d.clues.find((x) => x.kind === 'item'), pos, a);
    if (covered && s.suspicion > 0.45) this.frame(k);
    this.spawnNotice(k, a, sp);
    s.witnessReady = true;
    // radio and city talk carry it
    const st = c.data.radio?.stations?.find((x) => x.id === (k.id === 'netmaker' ? 'freevoice' : 'nightsongs'));
    const line = k.d.clues.find((x) => x.kind === 'radio')?.text.replace(/^On [^:]+: '?/, '').replace(/'$/, '');
    if (st && line) { (st.news ||= []).unshift(line); (st.talk ||= []).unshift(line); }
    // the authorities: deny it, take the credit, or bury it
    if (s.events.filter((e) => e.outcome === 'taken').length >= 2) {
      const say = pick([
        'The Tide Ward says there is no pattern to the disappearances, and that rafts lose people to the water every season.',
        'The Concord announces extra patrols on the Portage channel "in response to public concern". Nobody sees any patrols.',
        'A Ward notice asks residents not to spread "unhelpful stories" about the missing.',
        'The Tide Ward says it is investigating the missing raft-folk and asks for calm.',
      ]);
      c.economy.rumours.unshift({ day, text: say });
    }
  }
  vanish(k, a, sp) {
    const c = this.ctx, soc = this.society, day = c.time.day;
    a.dead = true; a.mood = 'dead';
    soc.state.dead[a.id] = { day, cause: 'the water', place: sp.name, missing: true };
    soc.state.funerals.push({ who: a.id, name: a.name, day, held: false, cause: 'water' });
    soc.state.incidents.push({ day, who: a.id, scenario: 'missing', outcome: 'killed' });
    const npc = this.npcOf(a.id); if (npc) { npc.override = { from: 0, to: 24, do: 'away' }; npc.root.visible = false; }
    for (const b of soc.agents.values()) {
      if (b.dead || b === a) continue;
      const close = b.p.friends?.includes(a.id) || a.p.friends?.includes(b.id) || b.p.partner === a.id || b.p.family?.includes(a.id) || a.p.family?.includes(b.id);
      if (close) { b.grief = { who: a.name, until: day + 4, cause: 'the water' }; b.memory.push({ day, type: 'lost', about: a.id }); }
    }
    c.economy.rumours.unshift({ day, text: `${a.name} never came home last night. Last seen near ${sp.name}. The Vigil will light a lantern.` });
    c.events.emit('people:death', { who: a.id, missing: true });
    c.events.emit('killer:event', { killer: k.id, victim: a.id });
  }
  // a disliked person takes the blame: talk turns on them, and sometimes it ends badly
  frame(k) {
    const soc = this.society, me = this.agentOf(k), day = this.ctx.time.day;
    const cand = [...soc.agents.values()].filter((a) => !a.dead && a.id !== k.d.npc && !Object.values(this.k).some((o) => o.d.npc === a.id))
      .sort((x, y) => (x.id === me?.p.rival ? -1 : 0) - (y.id === me?.p.rival ? -1 : 0) || (x.p.friends?.length || 0) - (y.p.friends?.length || 0));
    const f = cand[0]; if (!f) return;
    k.s.framed = { who: f.id, day };
    this.ctx.economy.rumours.unshift({ day, text: `People are saying ${f.name} was seen on the docks the night someone went missing. ${f.name} says that's a lie.` });
    for (const b of soc.agents.values()) if (!b.dead && b !== f) b.memory.push({ day, type: 'suspects', about: f.id });
    this.log(k, `frames ${f.name}`);
  }

  // ---------------------------------------------------------------- the player, through his eyes
  watchPlayer(k, dt) {
    const c = this.ctx, s = k.s, day = c.time.day, pp = c.player.position, h = c.time.hour;
    const lp = this.lairPos(k);
    const dl = Math.hypot(pp.x - lp[0], pp.z - lp[1]);
    if (dl < 60) s.noticed.nearLair += dt;
    const night = h > 21 || h < 5;
    if (night && c.player.flashlight && dl < 120) s.noticed.lights += dt;
    // a player who sits at night near one of his places is watching it: he notices, and stops using it
    for (const sp of k.d.planning.spots) {
      if (!night) break;
      if (this.spotPos(k, sp, _v).distanceTo(pp) < 25) {
        s.noticed.places[sp.id] = (s.noticed.places[sp.id] || 0) + dt;
        if (s.noticed.places[sp.id] > 60 && !s.watchedSpots.some((w) => w.id === sp.id && w.until > day)) { s.watchedSpots.push({ id: sp.id, until: day + 10 }); this.log(k, `notices you keep watch at ${sp.name}`); }
      }
    }
    s.noticed.carried = Object.keys(this.state.clues).filter((id) => this.clueKiller(id) === k.id && /item/.test(this.clueDef(id)?.kind || '')).length;
    s.suspicion = Math.min(1, this.cluesFor(k.id) * 0.07 + Math.min(1, s.noticed.asked / 8) * 0.2 + Math.min(1, s.noticed.nearLair / 300) * 0.2 + Math.min(1, s.noticed.lights / 200) * 0.1 + s.noticed.carried * 0.05 + (s.playerSaw ? 0.3 : 0) + (s.lairDisturbed ? 0.3 : 0));
    if (s.sawPlayer || s.lairDisturbed || s.suspicion > 0.85) s.hunting = true;
  }
  // how he answers being investigated
  adapt(k) {
    const s = k.s, day = this.ctx.time.day;
    const prev = s.response;
    s.response = s.hunting ? 'hunt' : s.suspicion > 0.7 ? 'scare' : s.suspicion > 0.5 ? 'mislead' : s.suspicion > 0.3 ? 'befriend' : 'ignore';
    if (s.suspicion > 0.5 && !s.trophiesHidden) { s.trophiesHidden = true; this.log(k, 'hides his trophies'); this.rebuildLair(k); }
    if ((s.suspicion > 0.7 && s.noticed.nearLair > 90 || s.lairDisturbed) && s.lair === 'main') { s.lair = 'moved'; s.movedDay = day; this.log(k, 'moves his lair'); this.rebuildLair(k); }
    if (s.response === 'scare' && prev !== 'scare') {
      this.ctx.ui.whisper(k.id === 'netmaker' ? 'Tied to your mooring line when you come back to it: a little charm of knotted net. Seven turns. It was not there this morning.' : 'On the water by your mooring, a lantern, lit, bobbing. When you reach it, it goes out.');
    }
    if (s.response === 'mislead' && prev !== 'mislead' && !s.framed) this.frame(k);
  }
  onTalk(id) {
    if (!id || !this.enabled) return;
    const c = this.ctx;
    for (const k of Object.values(this.k)) {
      const s = k.s; if (!s || s.caught || s.dead) continue;
      s.noticed.talkedTo[id] = (s.noticed.talkedTo[id] || 0) + 1;
      if (this.cluesFor(k.id) > 0 && id !== k.d.npc) s.noticed.asked++;
      if (id === k.d.npc) {
        s.noticed.met++;
        const D = k.d.dialogue;
        // he acts normal; what changes is only what you can now notice, and what he lets you hear
        setTimeout(() => {
          if (s.hunting || s.playerSaw) c.ui.subtitle(`${this.agentOf(k)?.name}: ${pick(D.knows)}`, 4, 'speech');
          else if (s.response === 'befriend' && Math.random() < 0.5) { c.ui.subtitle(`${this.agentOf(k)?.name}: ${pick(D.befriend)}`, 4, 'speech'); c.inventory?.add?.('scrap', 2); }
          if (this.cluesFor(k.id) >= 1 && Math.random() < 0.35) { c.ui.whisper(pick(D.tell)); this.giveClue(k, k.d.clues.find((x) => x.kind === 'tell')); }
        }, 3200);
      }
      // a frightened witness, once something has happened
      const wc = k.d.clues.find((x) => x.kind === 'witness');
      if (wc && wc.who === id && s.witnessReady && !this.state.clues[wc.id]) setTimeout(() => { c.ui.subtitle(wc.text, 7, 'speech'); this.giveClue(k, wc); }, 3400);
    }
  }
  onNoise(level) {
    if (this.inLair && level > 0.5) { const s = this.k[this.inLair.k].s; s.lairDisturbed = true; this.inLair.noise += level; }
  }

  // ---------------------------------------------------------------- clues
  clueDef(id) { for (const k of Object.values(this.k)) { const x = k.d.clues.find((c) => c.id === id) || (id === `${k.id}_seen` ? { id, kind: 'seen', title: 'What you saw' } : null); if (x) return x; } return null; }
  clueKiller(id) { for (const k of Object.values(this.k)) if (k.d.clues.some((c) => c.id === id) || id === `${k.id}_seen`) return k.id; return null; }
  cluesFor(kid) { return Object.keys(this.state.clues).filter((id) => this.clueKiller(id) === kid).length; }
  giveClue(k, def, extra = {}) {
    if (!def || this.state.clues[def.id]) return false;
    if (this.inLair?.blind) { this.inLair.pending.push([k, def, extra]); return false; }   // stumbled in: no help until you're out
    this.state.clues[def.id] = { day: this.ctx.time.day, text: (extra.text || def.text), title: def.title };
    this.state.opened[k.id] = true;
    this.ctx.ui.toast(`Investigation: ${def.title}`);
    if (this.cluesFor(k.id) === (this.R.cluesToUnlock ?? 5)) this.ctx.ui.whisper(`${k.d.case}: the pieces are starting to make a shape. You know his habits now — and a safer way in.`);
    return true;
  }
  spawnItem(k, def, pos, victim) {
    if (!def) return;
    const id = `kitem_${k.id}_${this.ctx.time.day}`;
    const geo = k.id === 'netmaker' ? new THREE.TorusKnotGeometry(0.06, 0.02, 32, 5) : new THREE.CylinderGeometry(0.09, 0.11, 0.26, 8);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: k.id === 'netmaker' ? 0x4a4436 : 0x1c1d18, roughness: 0.8 }));
    mesh.position.copy(pos).add(_v.set(0.3, 0.06, 0.2)); this.ctx.scene.add(mesh);
    const text = def.text.replace('{victim}', victim.name);
    this.items.set(id, { mesh, pos: mesh.position.clone(), killer: k.id, clue: def.id });
    this.ctx.interact.add({ id, kind: 'pickup', mode: 'any', radius: 2.2, pos: (v) => v.copy(mesh.position), prompt: 'Something small, left behind',
      onUse: () => { this.giveClue(k, def, { text }); this.ctx.ui.showNote(def.title, text); mesh.removeFromParent(); this.ctx.interact.remove(id); this.items.delete(id); return true; } });
  }
  spawnNotice(k, victim, sp) {
    const def = k.d.clues.find((x) => x.kind === 'notice'); if (!def) return;
    const id = `knotice_${k.id}`;
    const text = def.text.replace('{victim}', victim.name).replace('{spot}', sp.name);
    this.ctx.interact.remove(id);
    this.ctx.interact.add({ id, kind: 'read', mode: 'foot', radius: 2,
      pos: (v) => { const r = this.ctx.state.communities?.portage?.rafts.get(k.id === 'netmaker' ? 'market' : 'chapel'); return r ? r.worldPoint(v.set(k.id === 'netmaker' ? 2.6 : -1.8, r.deck + 1.3, -1.8), v) : v.set(0, -999, 0); },
      prompt: k.id === 'netmaker' ? 'A notice on the ration board' : 'Chalk on the chapel post',
      onUse: () => { this.giveClue(k, def, { text }); this.ctx.ui.showNote(def.title, text); return true; } });
  }
  clueChecks(dt) {
    const c = this.ctx, pp = c.player.position, h = c.time.hour;
    for (const k of Object.values(this.k)) {
      const s = k.s; if (s.caught) continue;
      const lp = this.lairPos(k), dl = Math.hypot(pp.x - lp[0], pp.z - lp[1]);
      if (dl < 45 && !this.inLair) this.giveClue(k, k.d.clues.find((x) => x.kind === 'creature'));
      const L = this.lairs[`${k.id}:${s.lair === 'moved' ? 'moved' : 'main'}`];
      if (L?.spots && L.spots.secondOut.distanceTo(pp) < 14 && !this.inLair) this.giveClue(k, k.d.clues.find((x) => x.kind === 'tide'));
      if (s.events.length && (h > 23 || h < 3)) {
        const home = k.d.home === 'rusthold_tender' ? [470, 560] : [318, 250];
        if (Math.hypot(pp.x - home[0], pp.z - home[1]) < 90 && s.mode === 'stalking') this.giveClue(k, k.d.clues.find((x) => x.kind === 'routine'));
      }
    }
    // the radio, if you listen after something has happened
    if (c.audio?.radioOn && Object.values(this.k).some((k) => k.s.events.length)) {
      this.radioT += dt;
      if (this.radioT > 40) { this.radioT = 0; const k = Object.values(this.k).find((x) => x.s.events.length && !this.state.clues[x.d.clues.find((y) => y.kind === 'radio')?.id]); if (k) { const def = k.d.clues.find((y) => y.kind === 'radio'); c.ui.subtitle(def.text, 6, 'speech'); this.giveClue(k, def); } }
    }
  }

  // ---------------------------------------------------------------- witnessing
  startWitness(k, a, sp, pos) {
    const c = this.ctx;
    const killer = figure(k.id), victim = figure('victim');
    const toWater = new THREE.Vector3(Math.cos(sp.id.length) * 1.8, 0, Math.sin(sp.id.length) * 1.8);
    killer.position.copy(pos); victim.position.copy(pos).add(_v.set(0.6, 0, 0)); victim.rotation.z = Math.PI / 2.4;
    c.scene.add(killer, victim);
    this.witness = { k, a, sp, pos: pos.clone(), toWater, t: 0, killer, victim, start: c.player.position.clone(), lightAtStart: !!c.player.flashlight, state: null, minD: 1e9, stain: null };
    this.ctx.audio?.synth?.thud?.(this.ctx.audio.master, 0.4);
  }
  updateWitness(dt) {
    const W = this.witness, c = this.ctx; W.t += dt;
    const pp = c.player.position, d = pp.distanceTo(W.pos); W.minD = Math.min(W.minD, d);
    // the drag: slow, toward the edge; then the splash; then nothing
    if (W.t < 4 && !W.state) {
      const k = Math.min(1, W.t / 4);
      W.killer.position.copy(W.pos).addScaledVector(W.toWater, k); W.victim.position.copy(W.killer.position).add(_v.set(-0.5, 0.1, 0));
      W.killer.rotation.y = Math.atan2(W.toWater.x, W.toWater.z) + Math.PI;
      if (d < 8) {   // you ran at him: he lets go and is gone
        W.state = 'intervened'; W.victim.rotation.z = 0;
        this.ctx.ui.whisper('He lets go. For a moment you see the shape of him against the water — and then he is over the edge and gone, and someone at your feet is coughing.');
        this.finishWitness('saved'); return;
      }
    }
    if (W.t >= 4 && !W.splashed) {
      W.splashed = true; W.victim.visible = false;
      c.events.emit('splash', { pos: W.killer.position.clone().add(W.toWater.clone().multiplyScalar(0.5)), big: true });
      // the mature gate: with it on, the deck keeps the stain; with it off, the moment cuts away
      if (c.settings.mature) {
        const st = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), new THREE.MeshStandardMaterial({ color: 0x3a0b08, roughness: 0.3, transparent: true, opacity: 0.8, depthWrite: false }));
        st.rotation.x = -Math.PI / 2; st.position.copy(W.pos).setY(W.pos.y + 0.02); c.scene.add(st); W.stain = st; this.lastStain = st;
      } else { this.cutAway(); this.lastStain = null; }
    }
    if (W.t >= 4.4 && W.killer.visible) W.killer.visible = W.t < 5;   // he goes into the water after
    if (W.t >= 6) this.finishWitness('taken');
  }
  cutAway() {
    const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity .25s;pointer-events:none;z-index:40';
    document.body.appendChild(el); requestAnimationFrame(() => (el.style.opacity = '0.85')); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 900);
  }
  finishWitness(outcome) {
    const W = this.witness, c = this.ctx, k = W.k, s = k.s;
    const pp = c.player.position, moved = Math.hypot(pp.x - W.start.x, pp.z - W.start.z), d = pp.distanceTo(W.pos);   // sinking or bobbing isn't moving
    // what did you do?
    let state = W.state;
    if (!state) state = moved > 8 && d > W.start.distanceTo(W.pos) ? 'ran' : (d > 35 ? 'hid' : (!c.player.flashlight && moved < 2.5 ? 'silent' : 'watched'));
    W.state = state;
    // did he see you?
    const p = state === 'intervened' ? 1 : Math.max(0, 0.15 + (c.player.flashlight ? 0.4 : 0) + (d < 20 ? 0.25 : 0) + (state === 'ran' ? 0.15 : 0) - (state === 'silent' ? 0.1 : 0) - (state === 'hid' ? 0.2 : 0));
    W.noticed = this.forceNotice ?? Math.random() < p;
    if (W.noticed) { s.sawPlayer = true; s.hunting = true; }
    // did you see him? a major clue — but no proof
    if (W.minD < 25) { s.playerSaw = true; this.giveClue(k, this.clueDef(`${k.id}_seen`), { text: k.id === 'netmaker' ? 'A broad shape on the dock, a hook at its hip, dragging someone to the edge by the collar like a sack of net. The way he moved — you have seen that walk somewhere. In daylight. Mending.' : 'A light on the water, and under it a brass helmet, and under that a man, pulling someone down. You could not see a face. You know that lamp.' }); }
    c.ui.whisper(state === 'silent' ? 'You stay very still. The water closes. Nothing moves on the dock again.' : state === 'ran' ? 'You run, and you do not look back, and that is its own kind of answer.' : state === 'hid' ? 'You keep to the dark until your heart slows. When you look again, there is nothing to see.' : state === 'intervened' ? '' : 'Then silence, and the slap of water under the planks.');
    W.killer.removeFromParent(); W.victim.removeFromParent();
    this.witness = null; this.lastWitness = { state, noticed: W.noticed, outcome, sawHim: W.minD < 25 };
    this.resolve(k, W.a, W.sp, W.pos, outcome === 'saved' ? 'saved' : 'taken');
  }

  // ---------------------------------------------------------------- the hunt: him, after you, at night
  maybeHunt(k) {
    const c = this.ctx, s = k.s, h = c.time.hour;
    if (!s.hunting || s.wound > c.time.day || this.figures.some((f) => f.k === k) || this.witness || this.inLair) return;
    if (!(h > 22 || h < 4)) return;
    const pp = c.player.position;
    const settled = [[318, 250], [470, 560], [640, 150], [560, -200], [-520, 380]].some(([x, z]) => Math.hypot(pp.x - x, pp.z - z) < 70);
    if (settled || Math.random() > 1 / 90) return;
    this.spawnHunter(k);
  }
  spawnHunter(k, at = null) {
    const c = this.ctx, fwd = c.player.forward || _v.set(0, 0, -1);
    const pos = at || c.player.position.clone().addScaledVector(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), -30);
    const g = figure(k.id); g.position.copy(pos); g.position.y = c.player.position.y; c.scene.add(g);
    const self = this;
    const f = {
      k, g, alive: true, hp: k.s.hp, still: 0, atkT: 0, get pos() { return g.position; },
      hit(dmg) {
        this.hp -= dmg; k.s.hp = this.hp;
        if (this.hp <= 0) { k.s.dead = true; self.ctx.ui.whisper('He goes down into the water and does not come up. Nobody will believe you. You are not sure you believe you.'); self.dropFigure(this); return; }
        if (this.hp < (self.R.hunterHp ?? 320) * 0.4) { k.s.wound = self.ctx.time.day + 3; k.s.caution = Math.min(1, k.s.caution + 0.2); k.s.hp = (self.R.hunterHp ?? 320) * 0.8; self.log(k, 'wounded; he retreats to heal and will come back more careful'); self.ctx.ui.whisper('He staggers back out of the light, and is gone. You hurt him. He will remember it.'); self.dropFigure(this); }
      },
      update(dt) {
        const p = c.player.position, to = _w.copy(p).sub(g.position).setY(0), d = to.length();
        const look = c.camera.getWorldDirection(_v).setY(0).normalize().dot(to.clone().normalize().negate());
        // he closes in when you aren't looking, and slows to a walk when you are
        const sp = look > 0.6 ? 0.9 : 3.4;
        if (d > 1.8) { g.position.addScaledVector(to.normalize(), Math.min(d - 1.8, sp * dt)); g.rotation.y = Math.atan2(to.x, to.z); }
        else { this.atkT -= dt; if (this.atkT <= 0) { this.atkT = 1.3; c.injury?.hit?.(16, { source: k.id }); c.events.emit('shake', 0.4); } }
        g.position.y = p.y + Math.sin(performance.now() / 300) * 0.02;
        // hiding works: light off, still, and far enough; so does reaching people
        const movingP = c.player.velocity.length() > 0.5;
        this.still = !c.player.flashlight && !movingP && d > 12 ? this.still + dt : 0;
        const settled = [[318, 250], [470, 560]].some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 70);
        if (this.still > 6 || d > 60 || settled || !(c.time.hour > 21 || c.time.hour < 5)) { self.log(k, this.still > 6 ? 'loses you in the dark' : 'lets you go, for now'); self.dropFigure(this); }
      },
    };
    this.figures.push(f);
    return f;
  }
  dropFigure(f) { f.alive = false; f.g.removeFromParent(); this.figures.splice(this.figures.indexOf(f), 1); }
  hittable() { return this.figures.filter((f) => f.alive); }

  // ---------------------------------------------------------------- lairs
  lairPos(k) { return k.d.lairs[k.s?.lair === 'moved' ? 'moved' : 'main'].pos; }
  stream() {
    const pp = this.ctx.player.position, R = this.R.lairStreamRadius ?? 140;
    for (const k of Object.values(this.k)) {
      if (!k.s) continue;
      for (const which of ['main', 'moved']) {
        const L = k.d.lairs[which], key = `${k.id}:${which}`, d = Math.hypot(pp.x - L.pos[0], pp.z - L.pos[1]);
        // the moved lair only exists once he's moved; the old one stays, emptied
        if (which === 'moved' && k.s.lair !== 'moved') { if (this.lairs[key]) this.unloadLair(key); continue; }
        if (d < R && !this.lairs[key]) this.loadLair(k, which);
        else if (d > R + 30 && this.lairs[key] && !(this.inLair?.key === key)) this.unloadLair(key);
      }

    }
  }
  loadLair(k, which) {
    const c = this.ctx, L = k.d.lairs[which], key = `${k.id}:${which}`;
    const empty = which === 'main' && k.s.lair === 'moved';
    const names = k.s.events.filter((e) => e.outcome === 'taken').map((e) => this.society.agents.get(e.victim)?.name).filter(Boolean);
    const out = L.kind === 'barge' ? buildBarge(L.pos, { empty, trophiesHidden: k.s.trophiesHidden, mature: c.settings.mature, yaw: which === 'moved' ? -0.9 : 0.4 })
      : buildTower(L.pos, { empty, mature: c.settings.mature, names, yaw: which === 'moved' ? 0.6 : -0.3 });
    c.scene.add(out.group);
    const ids = out.boxes.map((b) => c.collision.addBox(...b));
    const rec = { key, k, which, empty, ...out, ids, interacts: [] };
    const I = (def) => { c.interact.add(def); rec.interacts.push(def.id); };
    const known = () => this.cluesFor(k.id) >= (this.R.cluesToUnlock ?? 5);
    I({ id: `${key}:safe`, kind: 'enter', mode: 'any', radius: L.kind === 'tower' ? 3 : 3.2, pos: (v) => v.copy(out.spots.safeOut), prompt: L.safe.replace(/^./, (x) => x.toUpperCase()),
      enabled: () => !this.inLair && known(), onUse: () => { this.enterLair(rec, 'safe'); return true; } });
    I({ id: `${key}:second`, kind: 'enter', mode: 'any', radius: 2.4, requireLook: true, pos: (v) => v.copy(out.spots.secondOut), prompt: L.second.replace(/^./, (x) => x.toUpperCase()),
      enabled: () => !this.inLair, onUse: () => { this.enterLair(rec, 'second'); return true; } });
    I({ id: `${key}:leave`, kind: 'exit', mode: 'any', radius: 2.2, requireLook: false, pos: (v) => v.copy(this.inLair?.via === 'safe' ? out.spots.safeIn : out.spots.secondIn), prompt: 'Leave, quietly',
      enabled: () => this.inLair?.key === key, onUse: () => { this.leaveLair(); return true; } });
    if (!empty) {
      const P = L.kind === 'barge' ? out.spots.proof : out.spots.door;
      I({ id: `${key}:proof`, kind: 'search', mode: 'any', radius: 2.2, pos: (v) => v.copy(P), prompt: L.kind === 'barge' ? 'A tin box under the workbench' : 'A locked iron door',
        enabled: () => this.inLair?.key === key && !k.s.proof,
        onUse: () => {
          if (L.kind === 'tower' && !known()) { c.ui.whisper('Locked. A combination wheel, and scratched beside it, in the same hand as the wall: "the first of them". You don\'t know enough yet to know what that means.'); return true; }
          k.s.proof = true; if (out.door) out.door.visible = false;
          this.giveClue(k, k.d.clues.find((x) => x.kind === 'lair')); c.ui.showNote('Proof', k.d.lairText.proof + '\n\n' + k.d.reason);
          return true;
        } });
    }
    if (L.kind === 'tower') I({ id: `${key}:wall`, kind: 'read', mode: 'any', radius: 3, pos: (v) => v.copy(out.spots.wall), prompt: 'The wall of names', enabled: () => this.inLair?.key === key,
      onUse: () => { c.ui.showNote('The wall of names', `Hundreds of names, scratched with something sharp. The oldest are worn almost smooth.${names.length ? ' The newest are bright and fresh: ' + names.join(', ') + '.' : ''}`); return true; } });
    this.lairs[key] = rec;
    return rec;
  }
  unloadLair(key) {
    const rec = this.lairs[key], c = this.ctx; if (!rec) return;
    c.scene.remove(rec.group); c.collision.remove(rec.ids); for (const id of rec.interacts) c.interact.remove(id);
    rec.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); });
    delete this.lairs[key];
  }
  rebuildLair(k) { for (const key of Object.keys(this.lairs)) if (key.startsWith(k.id + ':') && this.inLair?.key !== key) this.unloadLair(key); }
  enterLair(rec, via) {
    const c = this.ctx, k = rec.k, s = k.s, h = c.time.hour;
    // came in without the detective's unlock (only what you picked up outside, if anything): full horror, no help
    const blind = via === 'second' && this.cluesFor(k.id) < (this.R.cluesToUnlock ?? 5);
    const home = !rec.empty && (h > 23 || h < 5 || s.wound > c.time.day);
    this.inLair = { key: rec.key, k: k.id, via, t: 0, noise: 0, blind, pending: [], home, comeAt: 10 + Math.random() * 15, lightT: 0 };
    c.state.inLair = true;
    const p = via === 'safe' ? rec.spots.safeIn : rec.spots.secondIn;
    c.player.mode = rec.k.d.lairs[rec.which].kind === 'tower' ? 'swim' : 'foot';
    c.player.teleport(p.clone().setY(p.y + (c.player.mode === 'foot' ? 0.1 : 0)));
    c.ui.whisper(rec.empty ? k.d.lairText.empty : k.d.lairText.enter + (home ? ' ' + k.d.lairText.home : ''));
    this.log(k, `player enters the ${rec.which} lair by the ${via}${blind ? ' (no clues)' : ''}${home ? ' — he is home' : ''}`);
  }
  updateLair(dt) {
    const L = this.inLair, c = this.ctx, rec = this.lairs[L.key]; if (!rec) { this.inLair = null; c.state.inLair = false; return; }
    L.t += dt;
    // no music down here: the heart, the drip, a lamp that won't stay lit
    L.hb = (L.hb ?? 0) - dt; if (L.hb <= 0) { L.hb = 0.85; c.audio?.started && c.audio.synth.heartbeat?.(c.audio.master); }
    for (const l of rec.flicker || []) l.intensity = (l.userData.base ??= l.intensity) * (Math.random() < 0.08 ? 0.15 : 0.85 + Math.random() * 0.3);
    if (c.player.flashlight) { L.lightT += dt; if (L.lightT > 8) rec.k.s.lairDisturbed = true; }
    // he's home: sooner or later — sooner if you're loud — he comes
    if (L.home && !L.came && (L.t > L.comeAt || L.noise > 1)) { L.came = true; rec.k.s.lairDisturbed = true; this.spawnHunter(rec.k, rec.spots.far.clone()); c.ui.whisper('Behind the nets, something stands up.'); }
  }
  leaveLair() {
    const L = this.inLair, c = this.ctx, rec = this.lairs[L.key];
    const p = L.via === 'safe' ? rec.spots.safeOut : rec.spots.secondOut;
    this.inLair = null; c.state.inLair = false;
    c.player.mode = rec.k.d.lairs[rec.which].kind === 'tower' ? 'swim' : 'foot';
    c.player.teleport(p.clone().setY(Math.max(p.y, rec.k.d.lairs[rec.which].kind === 'tower' ? -2 : 0.6)));
    for (const f of [...this.figures]) if (f.k === rec.k) this.dropFigure(f);
    // stumbling in still opens the case, once you're out and can think
    for (const [k, def, extra] of L.pending) this.giveClue(k, def, extra);
    if (L.blind) { this.state.opened[rec.k.id] = true; this.giveClue(rec.k, rec.k.d.clues.find((x) => x.kind === 'lair')); c.ui.whisper('Out. Breathing. You know where he lives now — and you went in with nothing. Whatever you left behind in there, he will find it.'); }
    if (L.blind || L.lightT > 3 || L.noise > 0) rec.k.s.lairDisturbed = true;
  }
  teleportTo(id) {
    const k = this.k[id]; if (!k) return;
    if (!k.s) this.bind();
    const L = k.d.lairs[k.s.lair === 'moved' ? 'moved' : 'main'];
    const rec = this.loadLair(k, k.s.lair === 'moved' ? 'moved' : 'main');
    const p = rec.spots.secondOut;
    this.ctx.player.mode = L.kind === 'tower' ? 'swim' : 'foot';
    this.ctx.player.teleport(p.clone().add(_v.set(1.2, L.kind === 'tower' ? 0 : 0.4, 0)));
  }

  // ---------------------------------------------------------------- telling people, and the end
  tell(kid, whom) {
    const c = this.ctx, k = this.k[kid], s = k.s, me = this.agentOf(k);
    const liked = (me?.p.friends?.length || 0) >= 2;
    s.told[whom] = true;
    if (whom === 'ward') {
      c.standing?.addRep?.('tide_wardens', liked ? -6 : -2); s.suspicion = Math.min(1, s.suspicion + 0.2); s.noticed.asked += 3;
      return liked ? `The Ward clerk writes it down, slowly, and asks whether you've been drinking. ${me?.name} mended half the nets on this channel. One witness, at night, at a distance. They will not act on it.` : 'The Ward clerk writes it down. "One witness," she says. "At night." She does not look up again.';
    }
    if (whom === 'family') {
      c.standing?.addRep?.('raftfolk', 3);
      this.giveClue(k, k.d.clues.find((x) => x.kind === 'routine'));
      return 'They believe you — they want to. They tell you what they noticed and never said: the nights he wasn\'t where he said he was.';
    }
    if (whom === 'friends') {
      s.hunting = true; s.noticed.asked += 4;
      c.injury?.hit?.(10, { source: 'fist' }); c.standing?.addRep?.('raftfolk', -5);
      const fr = (me?.p.friends || []).map((id) => this.society.agents.get(id)?.name).filter(Boolean)[0] || 'His friend';
      return `${fr} hears you out, and then hits you, once, hard. "He pulled my boy out of the water. Say it again and I'll tell him you said it." By night, he knows.`;
    }
    return '';
  }
  // the theory board: who you think it is, for each case
  pin(kid, npcId) { this.state.theory[kid] = npcId; return this.k[kid].d.npc === npcId && this.cluesFor(kid) >= (this.R.cluesToUnlock ?? 5); }
  solve(k) {
    const c = this.ctx, s = k.s, day = c.time.day;
    s.caught = true; this.state.solved[k.id] = day;
    const npc = this.npcOf(k.d.npc); if (npc) { npc.override = { from: 0, to: 24, do: 'away' }; npc.root.visible = false; }
    const a = this.agentOf(k); if (a) { a.dead = true; a.memory.push({ day, type: 'taken by the Ward' }); }
    if (s.framed) c.economy.rumours.unshift({ day, text: `Nobody's saying sorry to ${this.society.agents.get(s.framed.who)?.name}. Nobody ever does.` });
    const victims = s.events.filter((e) => e.outcome === 'taken').map((e) => this.society.agents.get(e.victim)?.name).filter(Boolean);
    c.standing?.addRep?.('tide_wardens', 15); c.standing?.addRep?.('raftfolk', 20);
    c.inventory?.add?.('scrap', 80);
    if (c.arms && !c.arms.state?.owned?.some?.((o) => (o.id || o) === 'bolt_rifle')) c.arms.give?.('bolt_rifle');
    const reaction = pick(['The Concord announces that "a Concord-led inquiry" has caught a killer. Nobody from the Concord was there.', 'The Tide Ward says the matter is closed and that there was never any danger to the public.', 'The Ward takes him away on a grey boat at dawn. There is no notice, no trial, nothing on the radio. It is simply never mentioned again.']);
    c.economy.rumours.unshift({ day, text: `${a?.name || 'A man'} — ${k.d.case.toLowerCase()} — taken by the Ward. ${reaction}` });
    c.events.emit('fame', { kind: 'legend', text: `Somebody found out who was behind ${k.d.case.toLowerCase()}.` });
    c.ui.showNote(k.d.case + ': solved', `The Ward takes ${a?.name || 'him'}. ${reaction}\n\nAt the chapel, at dusk, they hold a funeral for everyone at once: ${victims.join(', ') || 'the missing'}. The lanterns go out onto the water, one by one, and for once nobody follows them.\n\nYou are given a bolt rifle from a Ward locker, eighty scrap, and a great many drinks.`);
    for (const f of this.society.state.funerals) if (victims.includes(f.name)) f.held = false;
  }

  // ---------------------------------------------------------------- investigation tab data
  board() {
    return Object.values(this.k).filter((k) => this.state.opened[k.id]).map((k) => ({
      id: k.id, case: k.d.case, solved: !!this.state.solved[k.id], clues: Object.entries(this.state.clues).filter(([id]) => this.clueKiller(id) === k.id).map(([id, c]) => ({ id, ...c })),
      need: this.R.cluesToUnlock ?? 5, theory: this.state.theory[k.id] || null, sawHim: !!k.s.playerSaw, told: k.s.told,
      routine: this.cluesFor(k.id) >= (this.R.cluesToUnlock ?? 5) ? `He is out between ${this.R.eventHours[0]}:00 and ${Math.floor(this.R.eventHours[1])}:30 on the nights he hunts; he goes home to ${k.d.lairs.main.kind === 'barge' ? 'the water off Rusthold' : 'the drowned tower east of Portage'}.` : null,
    }));
  }

  // ---------------------------------------------------------------- debug
  log(k, s) { (this.logLines ||= []).push(`d${this.ctx.time.day} ${this.ctx.time.hour.toFixed(1)}h ${k.id}: ${s}`); if (this.logLines.length > 60) this.logLines.shift(); if (this.ctx.params.has('killerlog')) console.log('[killers]', k.id, s); }
  buildDebug() {
    this.debug = this.ctx.params.has('killerdebug');
    this.dbg = document.createElement('div'); this.dbg.style.cssText = 'position:fixed;right:8px;top:60px;max-width:44vw;font:10px ui-monospace,monospace;color:#f0e8e0;background:rgba(0,0,0,.6);padding:6px;z-index:31;pointer-events:none;white-space:pre-wrap';
    this.dbg.style.display = this.debug ? 'block' : 'none'; document.body.appendChild(this.dbg);
  }
  toggleDebug() { this.debug = !this.debug; this.dbg.style.display = this.debug ? 'block' : 'none'; }
  updateDebug() {
    if ((this._dbgT = (this._dbgT || 0) + 1) % 15) return;
    const lines = Object.values(this.k).map((k) => { const s = k.s, a = this.agentOf(k), p = s.plan; return `${k.id.toUpperCase()} = ${a?.name} (${a?.mood}) mode ${s.mode} · stress ${s.stress.toFixed(2)} · suspicion ${s.suspicion.toFixed(2)} · ${s.response || ''}${s.hunting ? ' · HUNTING YOU' : ''}
  plan: ${p ? `${this.society.agents.get(p.target)?.name} at ${p.spot}, alibi ${p.alibi.place} with ${p.alibi.names.join(', ')}` : 'none'} · next ≥ day ${s.nextEarliest.toFixed(1)}${s.lieLow > this.ctx.time.day ? ' · lying low' : ''}
  failed ${s.failedSpots.join(',') || '-'} · watched ${s.watchedSpots.map((w) => w.id).join(',') || '-'} · lair ${s.lair}${s.trophiesHidden ? ' (trophies hidden)' : ''} · events ${s.events.length} · clues ${this.cluesFor(k.id)}`; });
    this.dbg.textContent = `F6 killers\n${lines.join('\n')}\n${(this.logLines || []).slice(-6).join('\n')}`;
  }

  toJSON() { return this.state; }
  load(o) { this.state = o ? { ...this.fresh(), ...o, killers: { ...this.fresh().killers, ...(o.killers || {}) } } : this.fresh(); this.bind(); for (const key of Object.keys(this.lairs)) this.unloadLair(key); }
  reset() { this.load(null); }
}
