import { RNG, hashString } from '../core/rng.js';

// The life simulation: one character, aged a year at a time. Event cards from
// data/life_*.json are filtered by age, birth raft, Standing, career, stats and
// flags, rolled with a seeded RNG (so a life can be replayed from its seed),
// and resolved into stat changes, careers, relationships, Standing moves,
// 3D scenes and death. The wider world (glow, rations, the uprising, the
// leaders) is simulated forward alongside the life.
export const STATS = ['health', 'happiness', 'smarts', 'looks', 'strength', 'stamina', 'nerve', 'charm', 'luck', 'karma', 'deepsense', 'faith'];
export const STAT_LABEL = { health: 'Health', happiness: 'Happiness', smarts: 'Smarts', looks: 'Looks', strength: 'Strength', stamina: 'Stamina', nerve: 'Nerve', charm: 'Charm', luck: 'Luck', karma: 'Karma', deepsense: 'Deep-Sense', faith: 'Faith in the Tide' };
const RES = ['scrap', 'seal', 'salt', 'glass', 'rations'];
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export class Life {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = ctx.data.life;
    this.s = null;
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, data) { for (const f of this.listeners) f(kind, data); }
  get alive() { return this.s && this.s.alive; }
  rng(salt) { return new RNG(hashString(`${this.s.seed}:${this.s.age}:${salt}:${this.s.rolls}`)); }

  // ---------- creation ----------
  create(opts = {}) {
    const seed = opts.seed || Math.floor(Math.random() * 1e9).toString(36);
    const r = new RNG(hashString(seed + ':birth'));
    const births = this.d.births;
    let birth = opts.birth && births[opts.birth] ? opts.birth : null;
    if (!birth) birth = r.chance(0.04) ? 'highmark_ring' : r.pick(Object.keys(births).filter((b) => b !== 'highmark_ring'));
    const B = births[birth];
    const sex = opts.sex || r.pick(['female', 'male', 'female', 'male', 'other']);
    const first = opts.name?.split(' ')[0] || r.pick(this.d.names[sex === 'male' ? 'male' : sex === 'female' ? 'female' : 'any']);
    const family = opts.name?.split(' ').slice(1).join(' ') || r.pick(this.d.names.family);
    const stats = {};
    for (const k of STATS) stats[k] = clamp(Math.round(r.range(25, 75) + (B.stats?.[k] || 0)));
    stats.health = clamp(stats.health + 20);
    this.s = {
      seed, rolls: 0, name: `${first} ${family}`, first, family, sex, appearance: opts.appearance || { hair: r.pick(['black', 'brown', 'salt-bleached', 'red', 'grey-streaked']), eyes: r.pick(['brown', 'grey', 'green', 'sea-blue']) },
      birth, age: 0, alive: true, cause: null, stats,
      res: { scrap: B.scrap ?? 2, seal: 0, salt: 1, glass: 0, rations: 50 },
      rep: Object.fromEntries(['portage', 'greentide', 'rusthold', 'vigil', 'lowlight', 'highmark', 'tide_ward', 'deep_born'].map((k) => [k, B.rep?.[k] || 0])),
      standing: B.standing, peakStanding: B.standing,
      career: null, careerHistory: [], education: 0,
      people: [], flags: {}, seen: {}, log: [], best: null, actionsLeft: 3, sceneResults: [],
      world: { year: 41, glow: 0.12, rations: 1, uprising: 0.1, leaders: { portage: 'Madam Oru Vance', greentide: 'Elder Tamsin Koa', rusthold: 'Bram Hollis', vigil: 'the Keeper', lowlight: 'Captain Sef Marlow', highmark: 'Chancellor Idris Calloway' } },
      generation: opts.generation || 1, inherited: opts.inherited || null,
    };
    const S = this.s;
    // family
    const parentJobs = B.parentJobs || ['deckhand'];
    for (const role of ['mother', 'father']) {
      if (r.chance(B.orphanChance || 0.08)) continue;
      S.people.push(this.person(r, role, role === 'mother' ? 'female' : 'male', r.int(19, 38), { job: r.pick(parentJobs), meter: r.int(55, 90) }));
    }
    const sibs = r.int(0, 2);
    for (let i = 0; i < sibs; i++) S.people.push(this.person(r, r.chance(0.5) ? 'brother' : 'sister', null, r.int(1, 9), { meter: r.int(40, 85) }));
    S.people.push(this.person(r, 'mentor', null, r.int(35, 60), { job: r.pick(B.mentorJobs || ['diver']), meter: 40, note: 'mentor' }));
    if (opts.inherited) {
      for (const [k, v] of Object.entries(opts.inherited.stats || {})) S.stats[k] = clamp(S.stats[k] + v);
      S.res.scrap += opts.inherited.scrap || 0;
      for (const [k, v] of Object.entries(opts.inherited.rep || {})) S.rep[k] += v;
      if (opts.inherited.world) S.world = { ...opts.inherited.world, year: opts.inherited.world.year };
      if (opts.inherited.parent) S.people.push({ ...opts.inherited.parent });
    }
    this.log(`Born ${B.prep || 'on'} ${B.name}. ${B.intro}`);
    if (S.people.some((p) => p.role === 'mother' || p.role === 'father')) this.log(`Your ${S.people.filter((p) => p.role === 'mother' || p.role === 'father').map((p) => `${p.role} ${p.name} (${p.job})`).join(' and your ')} hold you up to the wind.`);
    else this.log('Nobody claims you. A crew raises you between shifts.');
    this.emit('change');
    return S;
  }
  person(r, role, sex, age, extra = {}) {
    sex = sex || r.pick(['female', 'male']);
    const names = this.d.names;
    const first = r.pick(names[sex === 'male' ? 'male' : 'female']);
    const traits = [r.pick(this.d.relationships.traits), r.pick(this.d.relationships.traits)].filter((v, i, a) => a.indexOf(v) === i);
    return { id: `${role}-${first}-${Math.floor(r.next() * 1e6)}`, role, name: `${first} ${role === 'mother' || role === 'father' || role === 'brother' || role === 'sister' ? this.s?.family || '' : r.pick(names.family)}`.trim(), sex, age, alive: true, meter: 50, traits, job: null, ...extra };
  }
  log(text, kind = '') { this.s.log.push({ age: this.s.age, text, kind }); this.emit('log', text); }

  // ---------- effects ----------
  fx(fx = {}) {
    const S = this.s;
    const changes = [];
    for (const [k, v] of Object.entries(fx)) {
      if (STATS.includes(k)) { S.stats[k] = clamp(S.stats[k] + v); changes.push([k, v]); }
      else if (RES.includes(k)) { S.res[k] = Math.max(0, (S.res[k] || 0) + v); changes.push([k, v]); }
      else if (k.startsWith('rep.')) { const f = k.slice(4); S.rep[f] = clamp((S.rep[f] || 0) + v, -100, 100); changes.push([k, v]); }
      else if (k.startsWith('world.')) { const w = k.slice(6); S.world[w] = Math.max(0, Math.min(1, (S.world[w] || 0) + v)); }
    }
    return changes;
  }
  meets(req = {}) {
    const S = this.s;
    if (req.birth && !req.birth.includes(S.birth)) return false;
    if (req.notBirth && req.notBirth.includes(S.birth)) return false;
    if (req.standingMax && S.standing > req.standingMax) return false;
    if (req.standingMin && S.standing < req.standingMin) return false;
    if (req.career && !(S.career && req.career.includes(S.career.id))) return false;
    if (req.careerTag && !(S.career && this.d.careers[S.career.id]?.tags?.includes(req.careerTag))) return false;
    if (req.hasCareer === true && !S.career) return false;
    if (req.hasCareer === false && S.career) return false;
    if (req.flag && !S.flags[req.flag]) return false;
    if (req.notFlag && S.flags[req.notFlag]) return false;
    if (req.hasPartner === true && !this.partner()) return false;
    if (req.hasPartner === false && this.partner()) return false;
    if (req.hasKids === true && !S.people.some((p) => p.role === 'child' && p.alive)) return false;
    if (req.hasParent === true && !S.people.some((p) => (p.role === 'mother' || p.role === 'father') && p.alive)) return false;
    if (req.sex && !req.sex.includes(S.sex)) return false;
    for (const [k, [a, b]] of Object.entries(req.stat || {})) { const v = S.stats[k] ?? S.res[k]; if (v < a || v > b) return false; }
    if (req.world) for (const [k, [a, b]] of Object.entries(req.world)) if (S.world[k] < a || S.world[k] > b) return false;
    if (req.res) for (const [k, n] of Object.entries(req.res)) if ((S.res[k] || 0) < n) return false;
    return true;
  }
  partner() { return this.s.people.find((p) => (p.role === 'partner' || p.role === 'spouse') && p.alive); }
  textFill(t) {
    const S = this.s, p = this.partner(), mentor = S.people.find((x) => x.role === 'mentor');
    const friend = S.people.find((x) => x.role === 'friend' && x.alive), rival = S.people.find((x) => x.role === 'rival' && x.alive);
    return t.replace(/\{name\}/g, S.first).replace(/\{raft\}/g, this.d.births[S.birth].short)
      .replace(/\{partner\}/g, p ? p.name.split(' ')[0] : 'someone').replace(/\{mentor\}/g, mentor ? mentor.name.split(' ')[0] : 'old Hesk')
      .replace(/\{friend\}/g, friend ? friend.name.split(' ')[0] : 'your friend').replace(/\{rival\}/g, rival ? rival.name.split(' ')[0] : 'that kid from the Stacks')
      .replace(/\{job\}/g, S.career ? this.d.careers[S.career.id].ranks[S.career.rank] : 'odd jobs')
      .replace(/\{leader_highmark\}/g, S.world.leaders.highmark).replace(/\{leader_portage\}/g, S.world.leaders.portage);
  }

  // ---------- events ----------
  eligible() {
    const S = this.s;
    return this.d.events.filter((e) => {
      if (S.age < e.ages[0] || S.age > e.ages[1]) return false;
      if (e.once !== false && S.seen[e.id]) return false;
      if (e.cooldown && S.seen[e.id] && S.age - S.seen[e.id] < e.cooldown) return false;
      return this.meets(e.req);
    });
  }
  pickEvent() {
    const r = this.rng('event');
    const list = this.eligible();
    if (!list.length) return null;
    const ev = r.weighted(list.map((e) => ({ w: (e.weight || 1) * (e.rare ? 0.15 : 1), v: e })));
    this.s.seen[ev.id] = this.s.age || 0.01;
    return ev;
  }
  // Resolve a choice → outcome (seeded). Returns the outcome object (may include a scene).
  choose(ev, idx) {
    const S = this.s;
    S.rolls++;
    const c = ev.choices[idx];
    const r = this.rng(ev.id + ':' + idx);
    // stat checks bias the weights
    const outs = c.out.map((o) => {
      let w = o.w ?? 1;
      if (o.check) { const v = S.stats[o.check] ?? 50; w *= o.good ? 0.3 + v / 50 : 1.7 - v / 70; }
      return { w: Math.max(0.05, w), v: o };
    });
    const o = r.weighted(outs);
    return o;
  }
  applyOutcome(ev, o, label) {
    const S = this.s;
    const text = this.textFill(o.text || '');
    const changes = this.fx(o.fx);
    if (o.flag) for (const f of [].concat(o.flag)) S.flags[f] = true;
    if (o.career !== undefined) this.setCareer(o.career, true);
    if (o.standing) this.setStanding(o.standing);
    if (o.person) this.addPerson(o.person);
    if (o.lose) this.losePerson(o.lose);
    if (o.best) S.best = { age: S.age, text: this.textFill(o.best) };
    this.log(`${this.textFill(ev.title || '')}${ev.title ? ': ' : ''}${label ? `(${label}) ` : ''}${text}`, ev.kind || '');
    if (o.death) this.die(o.death);
    this.emit('change');
    return { text, changes };
  }
  setStanding(t) {
    const S = this.s;
    const before = S.standing;
    S.standing = Math.max(1, Math.min(7, t));
    S.peakStanding = Math.min(S.peakStanding, S.standing);
    if (before !== S.standing) this.log(`Your wrist changes: ${this.ctx.data.standing.tiers[String(S.standing)].name}.`, 'standing');
  }
  setCareer(id, silent) {
    const S = this.s;
    if (S.career) S.careerHistory.push({ ...S.career, until: S.age });
    if (!id) { S.career = null; if (!silent) this.log('You leave your work.'); return; }
    const c = this.d.careers[id];
    S.career = { id, rank: 0, years: 0, perf: 50 };
    if (c.standing && (c.standing < S.standing || c.forceStanding)) this.setStanding(c.standing);
    for (const [f, v] of Object.entries(c.rep || {})) S.rep[f] = clamp((S.rep[f] || 0) + v, -100, 100);
    this.log(`You start as ${/^[aeiou]/i.test(c.ranks[0]) ? 'an' : 'a'} ${c.ranks[0]} (${c.name}).`, 'career');
  }
  addPerson(def) {
    const r = this.rng('person:' + def.role);
    const p = this.person(r, def.role, def.sex, def.age ?? Math.max(0, this.s.age + r.int(-3, 3)), { meter: def.meter ?? 55 });
    if (def.role === 'child') { p.name = `${r.pick(this.d.names[p.sex === 'male' ? 'male' : 'female'])} ${this.s.family}`; p.age = 0; }
    this.s.people.push(p);
    return p;
  }
  losePerson(role) {
    const p = this.s.people.find((x) => x.role === role && x.alive);
    if (p) { p.alive = false; p.diedAge = this.s.age; this.log(`${p.name} is gone.`, 'loss'); }
  }

  // ---------- the year ----------
  ageUp() {
    const S = this.s;
    if (!S.alive) return null;
    S.age++;
    S.actionsLeft = 3;
    const r = this.rng('year');
    this.yearly(r);
    if (!S.alive) return null;
    const ev = this.pickEvent();
    if (!ev) this.log(this.textFill(r.pick(this.d.world.quietYears)), 'quiet');
    this.emit('change');
    return ev;
  }
  yearly(r) {
    const S = this.s, st = S.stats, W = S.world;
    // body
    if (S.age > 40) { st.health = clamp(st.health - r.int(0, Math.ceil((S.age - 35) / 12))); st.looks = clamp(st.looks - (r.chance(0.4) ? 1 : 0)); }
    if (S.age > 50) { st.strength = clamp(st.strength - r.int(0, 2)); st.stamina = clamp(st.stamina - r.int(0, 2)); }
    if (S.age < 18) { st.strength = clamp(st.strength + r.int(0, 3)); st.stamina = clamp(st.stamina + r.int(0, 2)); }
    // rations by standing and the Highmark ration level
    const ration = (18 + (7 - S.standing) * 6) * W.rations + (S.career ? 12 : 0) + (S.age < 14 ? 10 : 0);
    S.res.rations = clamp(S.res.rations * 0.4 + ration + r.int(-5, 5));
    if (S.age < 45) st.health = clamp(st.health + 3);
    if (S.res.rations < 20) { st.health = clamp(st.health - 3); st.happiness = clamp(st.happiness - 3); if (r.chance(0.3)) this.log('A thin year. You learn what hunger sounds like at night.'); }
    // career
    if (S.career) {
      const c = this.d.careers[S.career.id];
      S.career.years++;
      const pay = c.pay[S.career.rank] || c.pay[c.pay.length - 1];
      S.res.scrap += pay;
      if (c.payCur) S.res[c.payCur] = (S.res[c.payCur] || 0) + 1;
      const skill = c.skill ? st[c.skill] : 50;
      if (S.career.rank < c.ranks.length - 1 && S.career.years >= 2 && r.chance(0.12 + skill / 400 + S.career.perf / 500)) {
        S.career.rank++;
        this.log(`Promoted: ${c.ranks[S.career.rank]}.`, 'career');
        if (c.rankStanding?.[S.career.rank]) this.setStanding(c.rankStanding[S.career.rank]);
        st.happiness = clamp(st.happiness + 6);
      }
      if (c.risk && r.chance(c.risk)) { const hurt = r.int(4, 14); st.health = clamp(st.health - hurt); this.log(this.textFill(r.pick(c.hazards || ['An accident at work. You heal, mostly.'])), 'hurt'); }
      if (S.career.perf < 25 && r.chance(0.3)) { this.log(`You lose your place as ${c.ranks[S.career.rank]}.`, 'career'); this.setCareer(null, true); }
    }
    if (S.age >= 18 && !S.career && r.chance(0.5)) st.happiness = clamp(st.happiness - 2);
    // people age and live their lives
    for (const p of S.people) {
      if (!p.alive) continue;
      p.age++;
      p.meter = clamp(p.meter - r.int(0, 3));
      const risk = p.age > 60 ? ((p.age - 60) / 35) ** 2 * 0.5 : 0.004;
      if (r.chance(risk)) { p.alive = false; p.diedAge = S.age; this.log(`${this.relLabel(p)} ${p.name} dies${p.age > 60 ? ', old and tired of the damp' : ' in a bad year'}. ${p.meter > 60 ? 'You were there at the end.' : 'You hear about it later.'}`, 'loss'); st.happiness = clamp(st.happiness - (p.meter > 60 ? 12 : 4)); }
    }
    // the world moves on
    W.year++;
    W.glow = Math.min(1, W.glow + r.range(0.004, 0.018) + (S.flags.cathedral_fed ? 0.01 : 0));
    W.rations = Math.max(0.4, Math.min(1.3, W.rations + r.range(-0.08, 0.06) - W.uprising * 0.03));
    W.uprising = Math.max(0, Math.min(1, W.uprising + r.range(-0.03, 0.04) + (W.rations < 0.7 ? 0.03 : 0)));
    if (r.chance(0.025)) {
      const raft = r.pick(['portage', 'greentide', 'rusthold', 'vigil', 'lowlight']);
      const old = W.leaders[raft];
      const heir = this.textFill(r.pick(this.d.world.heirs));
      W.leaders[raft] = heir;
      this.log(`News on the wind: ${old} of ${this.d.births[raft]?.short || raft} has died. ${heir} leads now.`, 'world');
    }
    if (r.chance(0.08)) this.log(this.textFill(r.pick(this.d.world.worldNews)), 'world');
    // death
    const oldAge = S.age > 68 ? ((S.age - 68) / 32) ** 2 : 0;
    if (st.health <= 0) this.die('illness');
    else if (r.chance(oldAge * 0.6)) this.die('old age');
  }
  relLabel(p) { return { mother: 'Your mother', father: 'Your father', brother: 'Your brother', sister: 'Your sister', partner: 'Your partner', spouse: 'Your spouse', child: 'Your child', friend: 'Your friend', rival: 'Your rival', mentor: 'Your mentor', nemesis: 'Your nemesis' }[p.role] || p.role; }
  die(cause) {
    const S = this.s;
    if (!S.alive) return;
    S.alive = false; S.cause = cause;
    this.log(this.textFill(this.d.world.deaths[cause] || `You die. (${cause})`), 'death');
    this.emit('death');
  }

  // ---------- player actions ----------
  act(kind, arg) {
    const S = this.s, r = this.rng('act:' + kind + ':' + (arg || '') + ':' + S.actionsLeft);
    if (!S.alive || S.actionsLeft <= 0) return 'You have done what you can this year. Age up.';
    S.actionsLeft--; S.rolls++;
    const A = this.d.activities[kind];
    if (A) {
      if (A.req && !this.meets(A.req)) { S.actionsLeft++; return A.refuse || 'Not for you. Not yet.'; }
      if (A.cost) for (const [k, n] of Object.entries(A.cost)) if ((S.res[k] || 0) < n) { S.actionsLeft++; return `You need ${n} ${k}.`; }
      if (A.cost) this.fx(Object.fromEntries(Object.entries(A.cost).map(([k, n]) => [k, -n])));
      const o = r.weighted(A.out.map((x) => ({ w: x.check ? Math.max(0.05, (x.w ?? 1) * (x.good ? 0.3 + S.stats[x.check] / 50 : 1.7 - S.stats[x.check] / 70)) : x.w ?? 1, v: x })));
      const res = this.applyOutcome({ title: A.name }, o);
      return res.text;
    }
    return '';
  }
  personAct(id, kind) {
    const S = this.s, p = S.people.find((x) => x.id === id);
    if (!p || !p.alive || S.actionsLeft <= 0) return S.actionsLeft <= 0 ? 'You have done what you can this year.' : '';
    const r = this.rng('p:' + id + kind);
    S.actionsLeft--; S.rolls++;
    const first = p.name.split(' ')[0];
    const T = this.d.relationships.lines;
    let text = '';
    const warm = p.traits.includes('warm') ? 1.3 : p.traits.includes('cold') ? 0.7 : 1;
    switch (kind) {
      case 'talk': p.meter = clamp(p.meter + r.int(2, 9) * warm); text = r.pick(T.talk); S.stats.happiness = clamp(S.stats.happiness + 2); break;
      case 'gift': if (S.res.scrap < 2) { S.actionsLeft++; return 'You have nothing to give.'; } S.res.scrap -= 2; p.meter = clamp(p.meter + r.int(6, 14) * warm); text = r.pick(T.gift); break;
      case 'argue': p.meter = clamp(p.meter - r.int(8, 20)); text = r.pick(T.argue); S.stats.happiness = clamp(S.stats.happiness - 3); if (p.meter < 10 && p.role === 'friend') p.role = 'rival'; break;
      case 'share': if (S.res.rations < 15) { S.actionsLeft++; return 'You barely have enough for yourself.'; } S.res.rations -= 10; p.meter = clamp(p.meter + 12); S.stats.karma = clamp(S.stats.karma + 4); text = r.pick(T.share); break;
      case 'romance':
        if (r.chance((S.stats.looks + S.stats.charm + p.meter) / 260)) { p.role = 'partner'; p.meter = clamp(p.meter + 15); text = r.pick(T.romanceYes); S.stats.happiness = clamp(S.stats.happiness + 10); }
        else { p.meter = clamp(p.meter - 6); text = r.pick(T.romanceNo); S.stats.happiness = clamp(S.stats.happiness - 5); }
        break;
      case 'marry':
        if (p.meter > 60 && r.chance(0.75)) { p.role = 'spouse'; text = this.textFill(r.pick(T.marry)).replace('%', first); S.stats.happiness = clamp(S.stats.happiness + 15); S.best = S.best || { age: S.age, text: `Married ${first} on the water.` }; }
        else { p.meter = clamp(p.meter - 10); text = r.pick(T.romanceNo); }
        break;
      case 'child':
        if (r.chance(0.6)) { const c = this.addPerson({ role: 'child' }); text = `A child: ${c.name}. ${r.pick(T.child)}`; S.stats.happiness = clamp(S.stats.happiness + 12); }
        else text = 'Not this year. Maybe not ever. You hold each other anyway.';
        break;
      case 'leave': p.role = p.role === 'spouse' ? 'ex' : 'ex'; p.meter = clamp(p.meter - 30); text = r.pick(T.leave); S.stats.happiness = clamp(S.stats.happiness - 8); break;
      case 'reconcile': if (r.chance(p.meter / 80 + 0.2)) { p.meter = clamp(p.meter + 20); if (p.role === 'rival') p.role = 'friend'; text = r.pick(T.reconcile); } else text = r.pick(T.argue); break;
      case 'betray': p.meter = 0; p.role = 'nemesis'; S.stats.karma = clamp(S.stats.karma - 12); S.res.scrap += r.int(3, 10); text = r.pick(T.betray); break;
      default: break;
    }
    this.log(`${first}: ${this.textFill(text).replace('%', first)}`, 'people');
    this.emit('change');
    return text.replace('%', first);
  }
  findFriend() {
    const S = this.s;
    if (S.actionsLeft <= 0) return 'You have done what you can this year.';
    S.actionsLeft--;
    const r = this.rng('friend');
    const p = this.addPerson({ role: S.age >= 16 && r.chance(0.3) ? 'crush' : 'friend', age: S.age + r.int(-2, 3), meter: 40 });
    const t = `You meet ${p.name}. ${r.pick(this.d.relationships.lines.meet)}`;
    this.log(t, 'people');
    this.emit('change');
    return t;
  }
  jobsAvailable() {
    const S = this.s;
    return Object.entries(this.d.careers).filter(([id, c]) => S.age >= (c.minAge || 16) && this.meets(c.req || {}) && S.career?.id !== id).map(([id, c]) => ({ id, ...c }));
  }
  applyJob(id) {
    const S = this.s, c = this.d.careers[id];
    if (S.actionsLeft <= 0) return 'You have done what you can this year.';
    S.actionsLeft--; S.rolls++;
    const r = this.rng('job:' + id);
    const skill = c.skill ? S.stats[c.skill] : 50;
    if (r.chance(0.35 + skill / 160 + (c.easy || 0))) { this.setCareer(id); this.emit('change'); return `They take you on. ${c.ranks[0]}.`; }
    this.log(`${c.name}: they don't take you on this year.`);
    this.emit('change');
    return 'Not this year.';
  }
  workHard() {
    const S = this.s;
    if (!S.career || S.actionsLeft <= 0) return '';
    S.actionsLeft--;
    S.career.perf = clamp(S.career.perf + 12);
    S.stats.stamina = clamp(S.stats.stamina - 2);
    this.emit('change');
    return 'You work until your hands remember the shape of it.';
  }

  // ---------- summary / legacy ----------
  summary() {
    const S = this.s, T = this.ctx.data.standing.tiers;
    const spouse = S.people.find((p) => p.role === 'spouse');
    const kids = S.people.filter((p) => p.role === 'child');
    const ending = S.flags.ending || (S.world.uprising > 0.7 ? 'The rafts rose in your lifetime.' : S.world.glow > 0.7 ? 'The glow reached the surface in your lifetime.' : 'The water kept its secrets a while longer.');
    return {
      name: S.name, age: S.age, raft: this.d.births[S.birth].name, peak: T[String(S.peakStanding)].name, standing: T[String(S.standing)].name,
      job: S.career ? this.d.careers[S.career.id].ranks[S.career.rank] : S.careerHistory.length ? this.d.careers[S.careerHistory[S.careerHistory.length - 1].id].ranks[S.careerHistory[S.careerHistory.length - 1].rank] : 'none',
      spouse: spouse ? spouse.name : 'none', children: kids.map((k) => k.name), best: S.best?.text || 'A quiet morning, once, that nobody else remembers.', cause: S.cause, ending,
      karma: S.stats.karma, seed: S.seed,
    };
  }
  continueAsChild() {
    const S = this.s;
    const kid = S.people.find((p) => p.role === 'child' && p.alive);
    if (!kid) return null;
    const inherited = {
      stats: { karma: Math.round((S.stats.karma - 50) / 5), deepsense: Math.round((S.stats.deepsense - 50) / 6), luck: 3 },
      scrap: Math.floor(S.res.scrap * 0.6), rep: Object.fromEntries(Object.entries(S.rep).map(([k, v]) => [k, Math.round(v * 0.3)])),
      world: S.world, parent: { id: 'parent-ghost', role: S.sex === 'male' ? 'father' : 'mother', name: S.name, sex: S.sex, age: S.age, alive: false, meter: 80, traits: [], diedAge: 0 },
    };
    const birth = S.birth;
    this.create({ name: `${kid.name}`, sex: kid.sex, birth, generation: S.generation + 1, inherited, seed: S.seed + 'g' + (S.generation + 1) });
    this.s.age = 0;
    return this.s;
  }
  toJSON() { return this.s; }
  load(o) { this.s = o; this.emit('change'); }
}
