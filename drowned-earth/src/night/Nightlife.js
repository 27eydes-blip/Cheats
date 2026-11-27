import * as THREE from 'three';
import { dressBar, tickBars } from './BarDress.js';
import { runGame } from './BarGames.js';
import { generatePerson } from '../humans/Roster.js';

// The night economy. Bars on the raft cities open at dusk and fill up toward
// their busy hour; each has a bartender who remembers you (visits, tab,
// favours, what you told them), regulars, a band, house games, rumours and
// work. Drinking has real costs: rations spent, a drunk wobble, hangovers,
// a slowly building habit (shown with care), brawls and pickpockets in rowdy
// rooms; the Vigil's Quiet Cup is the way back. Homebrew is a smuggling
// product: jobs carry contraband between cities under the Ward's nose.
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CROWD_NAMES = ['Tamsin Rook', 'Old Bey', 'Nadia Spurr', 'Pete the Hook', 'Rosalind Kwan', 'Two-Coat Jim', 'Esi Mensah', 'Cobb', 'Marisol Duarte', 'Little Wren (not you)', 'Aurelio Fisk', 'Hattie Sow', 'Dev Ramaswamy', 'Grandmother Iyo', 'Corwin Pale', 'Juno Achterberg'];
const BAND_GAIN = { shanty: 1, garden: 0.7, forge: 1, hymn: 0.6, smoke: 0.8, lounge: 0.8 };

export class Nightlife {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = ctx.data.nightlife;
    this.bars = Object.fromEntries((this.data?.bars || []).map((b) => [b.id, b]));
    this.state = { bars: {}, drunk: 0, habit: 0, hangover: false, job: null, jobsDone: 0, knowsCode: false, counsel: 0, seenRumours: {} };
    this.dressed = new Map(); // raft id -> dressing
    this.enabled = ctx.params.get('nightlife') !== 'off';
    if (this.enabled) this.addPeople();
    ctx.events.on('slept', () => this.onSlept());
    ctx.events.on('tick:minute', () => this.minute());
  }
  bs(id) { return (this.state.bars[id] ||= { visits: 0, tab: 0, favour: 0, lastDay: -1, told: [] }); }
  isOpen(bar, h = this.ctx.time.hour) { const [a, b] = bar.open; return a < b ? h >= a && h < b : h >= a || h < b; }
  // how full the room is, 0..1, peaking at the busy hour
  crowd(bar) {
    if (!this.isOpen(bar)) return 0;
    const h = this.ctx.time.hour; let d = Math.abs(h - bar.busy); d = Math.min(d, 24 - d);
    return Math.max(0.15, 1 - d / 5);
  }

  // ---------------------------------------------------------------- people
  // bartenders, regulars, a band and a crowd, as raft NPCs with schedules
  addPeople() {
    const list = this.ctx.data.npcs.npcs;
    for (const bar of Object.values(this.bars)) {
      const [o, c] = bar.open;
      const at = (k) => `bar:${bar.id}:${k}`;
      const bt = bar.bartender;
      list.push({ id: 'bt_' + bt.id, name: bt.name, raft: bar.platform, role: 'bartender', bar: bar.id, sex: bt.sex, age: bt.age,
        schedule: [{ from: o - 0.5, to: c, do: 'talk', at: at('counter'), face: 0 }, { from: c, to: o - 0.5, do: 'away' }], talk: [{ text: bt.intro }] });
      (bar.regulars || []).forEach((r, i) => {
        const seat = r.seat === 'bar' ? `seat${i % 5}` : r.seat === 'corner' ? 'seat9' : r.seat === 'cards' || r.seat === 'table' ? `seat${5 + (i % 2)}` : r.seat === 'booth' ? 'seat8' : `seat${6 + (i % 4)}`;
        const arrive = (o + 1 + i * 0.7) % 24, leave = (c - 0.5 + 24) % 24;
        list.push({ id: 'rg_' + r.id, name: r.name, raft: bar.platform, role: r.role, regular: bar.id, lead: r.leads,
          schedule: [{ from: arrive, to: leave, do: /seat[0-4]$/.test(seat) ? 'talk' : i % 2 ? 'sitTalk' : 'sit', at: at(seat) }, { from: leave, to: arrive, do: 'away' }],
          talk: r.lines.map((t) => ({ text: t })) });
      });
      // the band: two players on the riser
      if (!bar.dry) for (let k = 0; k < 2; k++) list.push({ id: `bd_${bar.id}_${k}`, name: k ? `${bar.bandName}` : `${bar.bandName}`, raft: bar.platform, role: 'musician', schedule: [{ from: o + 1, to: c - 0.3, do: k ? 'sit' : 'talk', at: at(k ? 'stage2' : 'stage') }, { from: c - 0.3, to: o + 1, do: 'away' }], talk: [{ text: 'We take requests. We ignore them, but we take them.' }] });
      // a crowd that comes and goes around the busy hour
      const n = bar.dry ? 3 : 5;
      for (let k = 0; k < n; k++) {
        const arrive = (bar.busy - 2.5 + k * 0.6 + 24) % 24, leave = (bar.busy + 1.5 + k * 0.5) % 24;
        list.push({ id: `cr_${bar.id}_${k}`, name: CROWD_NAMES[(bar.id.length * 3 + k * 5) % CROWD_NAMES.length], raft: bar.platform, role: 'patron', crowd: bar.id,
          schedule: [{ from: arrive, to: leave, do: ((k * 3 + 1) % 11) < 5 ? 'talk' : 'sitTalk', at: at(`seat${(k * 3 + 1) % 11}`) }, { from: leave, to: arrive, do: 'away' }],
          talk: [{ text: this.data.crowdLines[(k * 7) % this.data.crowdLines.length] }] });
      }
    }
  }

  // ---------------------------------------------------------------- the room
  dress(raft, anchors) { if (!this.enabled) return; const d = dressBar(this.ctx, raft, anchors, this.bars); this.dressed.set(raft.id, d); }
  prompt(id) {
    const bar = this.bars[id]; if (!bar) return 'The bar';
    if (!this.isOpen(bar)) return `${bar.name} — closed (opens ${bar.open[0]}:00)`;
    return `Talk to ${bar.bartender.name} — ${bar.name}`;
  }
  update(dt) {
    if (!this.enabled) return;
    const v = this.data.vice;
    // sobering up; the drunk wobble feeds the camera sway
    this.state.drunk = Math.max(0, this.state.drunk - dt / 3600 * v.soberPerHour * 60);
    tickBars(this.ctx, this, dt);
    // overheard: snatches of conversation near a busy bar
    this.overT = (this.overT || 6) - dt;
    if (this.overT <= 0) {
      this.overT = 7 + Math.random() * 9;
      const near = this.nearestBar(14);
      if (near && this.crowd(near.bar) > 0.35 && !this.ctx.ui.panel) this.ctx.ui.subtitle(this.data.crowdLines[Math.floor(Math.random() * this.data.crowdLines.length)], 3.2, 'speech');
    }
  }
  nearestBar(r) {
    const p = this.ctx.player.position; let best = null;
    for (const d of this.dressed.values()) for (const a of d.anchors) { const w = d.world(a); const dd = w.distanceTo(p); if (dd < r && (!best || dd < best.d)) best = { bar: this.bars[a.id], d: dd, pos: w }; }
    return best;
  }
  minute() {
    // the habit eases off a little each in-game day without a drink
    const day = this.ctx.time.day;
    if (this.lastDay !== day) { this.lastDay = day; this.state.habit = Math.max(0, this.state.habit - this.data.vice.habitDecayPerDay * (1 + this.state.counsel)); }
  }
  onSlept() {
    if (this.state.drunk > this.data.vice.hangoverAt) {
      this.state.hangover = true;
      const s = this.ctx.survival; s.rest = Math.max(30, s.rest - 25); s.thirst = Math.max(0, s.thirst - 20);
      this.ctx.ui.whisper(this.data.hangover[Math.floor(Math.random() * this.data.hangover.length)]);
      setTimeout(() => (this.state.hangover = false), 60000 * 4);
    }
    this.state.drunk = 0;
  }
  sway() { return this.state.drunk * 0.9 + (this.state.hangover ? 0.15 : 0); }

  // ---------------------------------------------------------------- the bartender
  open(id) {
    const bar = this.bars[id];
    if (!bar) return;
    const ui = this.ctx.ui;
    if (!this.isOpen(bar)) { ui.whisper(`${bar.name} is shut. Chairs up on the tables. Somebody's mopping in the dark.`); return; }
    const s = this.bs(id);
    if (s.lastDay !== this.ctx.time.day) { s.visits++; s.lastDay = this.ctx.time.day; this.ctx.events.emit('night:visit', { bar: id, visits: s.visits }); }
    this.ctx.events.emit('talk', { npc: 'bt_' + bar.bartender.id });
    this.node(bar, 'start');
  }
  greet(bar) {
    const bt = bar.bartender, s = this.bs(bar.id);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (s.visits <= 1 && !s.met) { s.met = true; return bt.intro; }
    if (s.tab > 0 && Math.random() < 0.6) return pick(bt.greetsTab);
    if (s.visits >= 5 && Math.random() < 0.5) return pick(bt.greetsRegular);
    return pick(bt.greets);
  }
  fill(bar, t) { const s = this.bs(bar.id); return t.replace('{greet}', this.greet(bar)).replace('{tab}', s.tab).replace('{visits}', s.visits).replace('{name}', bar.bartender.name); }
  cond(bar, c) {
    const s = this.bs(bar.id), st = this.state;
    switch (c) {
      case 'tabOpen': return s.visits >= 3 && s.tab < 20;
      case 'owes': return s.tab > 0;
      case 'heat1': return (this.ctx.heat?.value || 0) >= 10 || s.visits >= 3;
      case 'habit': return st.habit > this.data.vice.habitWarn * 0.6;
      case 'knowsCode': return st.knowsCode;
      default: return true;
    }
  }
  node(bar, key, extra = '') {
    const ui = this.ctx.ui, bt = bar.bartender;
    const n = bt.tree[key]; if (!n) return;
    const opts = n.options.filter((o) => (!o.if || this.cond(bar, o.if)) && (!o.ifNot || !this.cond(bar, o.ifNot)));
    // carrying a job's cargo to this city? deliver it here
    const job = this.state.job;
    if (key === 'start' && job && job.to === bar.community) opts.unshift({ text: `I've got something for you. (${this.data.cargo[this.data.jobs[job.id].cargo]?.name || 'delivery'})`, do: 'deliver' });
    const html = `<button class="btn close" data-close>Leave</button><h2>${esc(bar.name)}</h2>
      <div class="sub">${esc(bt.name)} · ${esc(bar.blurb)}</div>
      ${extra}<div class="row"><div class="name hand" style="font-size:16px">“${esc(this.fill(bar, n.text))}”</div></div>
      <h3>${this.walletLine(bar)}</h3>
      ${opts.map((o, i) => `<div class="row"><button class="btn" data-o="${i}" style="flex:1;text-align:left">${esc(this.fill(bar, o.text))}</button></div>`).join('')}`;
    const p = ui.openPanel('bar', html, (el) => {
      el.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => { const o = opts[+b.dataset.o]; if (o.go) this.node(bar, o.go); else this.act(bar, o.do); }));
    });
    this.ctx.paused = true;
    return p;
  }
  walletLine(bar) {
    const inv = this.ctx.inventory, s = this.bs(bar.id);
    return `${inv.count('scrap')} scrap · ${inv.count('salt')} salt · ${inv.count('seal')} seals${s.tab ? ` · <span style="color:#e0a070">tab ${s.tab}</span>` : ''}${this.state.drunk > 0.15 ? ` · <span style="color:#c9a">${this.state.drunk > 0.7 ? 'very drunk' : this.state.drunk > 0.4 ? 'drunk' : 'tipsy'}</span>` : ''}`;
  }
  say(bar, text, back = 'start') { this.node(bar, back, `<div class="row"><div class="name" style="color:var(--accent)">${esc(text)}</div></div>`); }

  act(bar, what) {
    const [kind, arg] = what.split(':');
    const ui = this.ctx.ui;
    if (kind === 'leave') { ui.close(); return; }
    if (kind === 'order') return this.menu(bar);
    if (kind === 'rumour') return this.rumour(bar);
    if (kind === 'tab') { this.bs(bar.id).tab += 3; this.state.drunk = Math.min(1, this.state.drunk + 0.1); return this.say(bar, 'On the tab. The tab grows. The tab is a living thing.'); }
    if (kind === 'paytab') return this.payTab(bar);
    if (kind === 'game') return runGame(this, bar, arg, (msg) => this.say(bar, msg));
    if (kind === 'job') return this.offerJob(bar, arg);
    if (kind === 'deliver') return this.deliver(bar);
    if (kind === 'door') return this.backRoom(bar);
    if (kind === 'counsel') { this.state.counsel = Math.min(2, this.state.counsel + 1); this.state.habit = Math.max(0, this.state.habit - 0.25); this.ctx.story.setFlag('vigil_circle'); ui.close(); ui.whisper('You sit in the circle at the second bell. Nobody makes a speech. Someone pours you tea and leaves the pot. It helps more than you expected.'); return; }
    return this.say(bar, '…');
  }

  // the Drowned Rat's back room: charts, a password, and (for those who've run for Lowlight) a brass fish
  backRoom(bar) {
    const st = this.ctx.story;
    st.setFlag('rat_backroom');
    this.ctx.events.emit('night:door', bar.id);
    let msg = 'Fenn looks at you for a long moment, then sets down a glass with no ice in it. Behind you, the bookcase clicks. "Back room. Don\'t touch the maps."';
    if (st.flag('lamp_rumour') && !st.flag('lamp_map')) { st.setFlag('lamp_map'); msg += ' — On the wall, a sea chart of the old coast. Cape Orrin Light is circled in amber ink. In the margin someone has drawn a small brass fish.'; (this.ctx.state.notes ||= []).push({ text: 'The Rat\'s back room: Cape Orrin Light circled in amber. A brass fish in the margin.', day: this.ctx.time.day }); }
    else if (st.flag('lamp_map') && st.flag('coded_pin') && !st.flag('has_pin')) {
      if (this.state.jobsDone >= 1) { st.setFlag('has_pin'); this.ctx.inventory.add('brass_fish_pin', 1, true); msg = 'Fenn takes something from his waistcoat and puts it in your hand: a brass fish, warm from his pocket. "You\'ve carried for us. The fish chooses who carries. Don\'t lose it, and don\'t tell me where it takes you."'; }
      else msg += ' — "The fish is for people who carry. Carry something for Lowlight first."';
    }
    return this.say(bar, msg);
  }
  // ---------------------------------------------------------------- drinks
  price(id) { const d = this.data.drinks[id]; let p = d.price; if (d.banned && (this.ctx.heat?.value || 0) > 40) p += 1; return p; }
  menu(bar) {
    const ui = this.ctx.ui, inv = this.ctx.inventory, D = this.data.drinks;
    const html = `<button class="btn close" data-close>Leave</button><h2>${esc(bar.name)} — what's pouring</h2><div class="sub">${this.walletLine(bar)}</div>
      ${bar.drinks.map((id) => { const d = D[id], p = this.price(id); const can = p === 0 || inv.has(d.cur, p); return `<div class="row"><div class="name">${esc(d.name)}${d.banned ? ' <span style="color:#d77;font-size:11px">HIGHMARK-BANNED</span>' : d.homebrew ? ' <span style="color:#9c8;font-size:11px">homebrew</span>' : ''}<small>${esc(d.desc)}</small></div><button class="btn" data-d="${id}" ${can || this.cond(bar, 'tabOpen') ? '' : 'disabled'}>${p ? `${p} ${d.cur}` : 'free'}${!can && p ? ' (tab)' : ''}</button></div>`; }).join('')}
      <div class="row"><button class="btn" data-back>Back</button></div>`;
    ui.openPanel('bar', html, (el) => {
      el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => this.drink(bar, b.dataset.d)));
      el.querySelector('[data-back]').addEventListener('click', () => this.node(bar, 'start'));
    });
    this.ctx.paused = true;
  }
  drink(bar, id) {
    const d = this.data.drinks[id], v = this.data.vice, inv = this.ctx.inventory, s = this.bs(bar.id), st = this.state;
    const p = this.price(id);
    if (p > 0) { if (inv.has(d.cur, p)) inv.remove(d.cur, p); else { s.tab += p; } }
    // what it does to you
    st.drunk = Math.min(1.2, st.drunk + d.strength * v.drunkPerStrength);
    if (d.strength > 0) st.habit = Math.min(1, st.habit + v.habitPerDrink * (0.5 + d.strength));
    const sv = this.ctx.survival;
    sv.warmth = Math.min(100, sv.warmth + 4 + d.strength * 6);
    sv.thirst = Math.min(100, sv.thirst + (d.strength ? 4 : 10));
    if (!d.strength) sv.rest = Math.min(100, sv.rest + 3);
    this.ctx.events.emit('night:drink', { bar: bar.id, drink: id, drunk: st.drunk });
    this.ctx.audio?.play('pickup');
    // what happens around you
    const r = Math.random();
    let msg = `${d.name}. ${d.desc}`;
    if (st.habit > v.habitHard && !st.warnedHard) { st.warnedHard = true; msg += ' — Your hands were already reaching for the next one before you finished this one. You notice that. Someone at the Vigil once said noticing is the hard part.'; }
    else if (st.habit > v.habitWarn && !st.warned) { st.warned = true; msg += ' — It\'s the fourth night running. The Quiet Cup on the Vigil is open till dawn, and they don\'t serve anything stronger than tea.'; }
    if (bar.rowdy > 0 && st.drunk > 0.45 && r < v.brawlChance * bar.rowdy * 2) return this.brawl(bar, msg);
    if (st.drunk > 0.8 && r > 1 - v.robChance * 2) {
      const lost = Math.min(inv.count('scrap'), 2 + Math.floor(Math.random() * 6));
      if (lost) { inv.remove('scrap', lost); msg += ` — Later you notice your pocket is ${lost} scrap lighter. Nobody near you looks guilty. Everybody near you looks guilty.`; }
    }
    if (st.drunk > 0.3 && r < v.recruitChance && !this.ctx.story.flag('recruit_offer')) { this.ctx.story.setFlag('recruit_offer'); msg += ' — A stranger slides onto the next stool. "You\'ve got a boat and a face nobody remembers. Lowlight could use both. Ask Fenn at the Rat."'; }
    this.say(bar, msg);
  }
  brawl(bar, prefix) {
    const B = this.data.brawl, pick = (a) => a[Math.floor(Math.random() * a.length)];
    const out = pick(B.outcomes);
    this.ctx.injury?.hit(6, { source: 'brawl', what: 'a bar brawl', bleed: 0.05 });
    this.ctx.events.emit('shake', 0.6);
    this.ctx.heat?.add(3, 'Brawl at ' + bar.name);
    this.ctx.events.emit('night:brawl', { bar: bar.id });
    this.say(bar, `${prefix} — ${pick(B.starts)} ${out}`);
  }
  payTab(bar) {
    const s = this.bs(bar.id), inv = this.ctx.inventory;
    const pay = Math.min(s.tab, inv.count('scrap'));
    if (!pay) return this.say(bar, 'You turn out your pockets. Lint, a button, a tooth (not yours). The tab stays where it is.');
    inv.remove('scrap', pay); s.tab -= pay; s.favour++;
    return this.say(bar, s.tab ? `You pay ${pay}. ${s.tab} to go.` : 'Paid in full. The bartender crosses your name off the slate with a flourish.');
  }
  rumour(bar) {
    const seen = (this.state.seenRumours[bar.id] ||= []);
    const pool = bar.rumours.map((t, i) => ({ t, i })).filter((r) => !seen.includes(r.i));
    const r = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { t: bar.rumours[Math.floor(Math.random() * bar.rumours.length)], i: -1 };
    if (r.i >= 0) seen.push(r.i);
    this.ctx.economy.rumours.unshift({ day: this.ctx.time.day, text: r.t });
    this.ctx.economy.rumours.length = Math.min(this.ctx.economy.rumours.length, 12);
    // rumours that open doors
    if (/lighthouse|three short|under the lamp/i.test(r.t)) this.ctx.story.setFlag('lamp_rumour');
    if (/stirred twice|fog gin/i.test(r.t)) this.state.knowsCode = true;
    this.ctx.events.emit('night:rumour', { bar: bar.id, text: r.t });
    this.say(bar, r.t);
  }

  // ---------------------------------------------------------------- work
  offerJob(bar, id) {
    const J = this.data.jobs[id]; if (!J) return this.say(bar, 'Nothing tonight.');
    if (J.hours) { // a shift: time passes, you earn, you overhear things
      const pay = J.pay[0] + Math.floor(Math.random() * (J.pay[1] - J.pay[0] + 1));
      this.ctx.ui.close();
      this.ctx.ui.fade(1.2, () => { this.ctx.time.hour = (this.ctx.time.hour + J.hours) % 24; this.ctx.inventory.add('scrap', pay); this.bs(bar.id).favour += 2; this.rumour(bar); this.ctx.ui.whisper(`Four hours of pouring. ${pay} scrap, sore feet, and you heard something.`); });
      return;
    }
    if (this.state.job) return this.say(bar, 'Finish what you\'re carrying first. Nobody trusts a courier with two masters.');
    if (J.from && J.from !== bar.community) return this.say(bar, `Not from here. Ask at ${this.cityName(J.from)}.`);
    this.state.job = { id, to: J.to, from: bar.community, taken: this.ctx.time.day };
    if (J.cargo) this.ctx.inventory.add(J.cargo, 1, true);
    if (J.heat) this.ctx.heat?.add(Math.round(J.heat * 0.3), 'Carrying contraband');
    this.ctx.events.emit('night:job', { id, from: bar.community, to: J.to });
    this.say(bar, `${J.name}. ${J.desc} Pays ${J.pay[0]} on delivery to ${this.cityName(J.to)}.`);
  }
  deliver(bar) {
    const job = this.state.job, J = this.data.jobs[job.id];
    if (J.cargo && !this.ctx.inventory.has(J.cargo)) return this.say(bar, '"Delivery of what, exactly? Your empty hands?"');
    if (J.cargo) this.ctx.inventory.remove(J.cargo, 1);
    this.ctx.inventory.add('scrap', J.pay[0]);
    this.state.job = null; this.state.jobsDone++;
    this.bs(bar.id).favour += 3;
    this.ctx.events.emit('night:delivered', { id: job.id, to: job.to });
    this.ctx.events.emit('fame', { kind: 'smuggle', text: `A ${J.cargo ? this.data.cargo[J.cargo].name.toLowerCase() : 'job'} made it to ${this.cityName(job.to)} under the Ward's nose.` });
    this.say(bar, `They count it, twice. ${J.pay[0]} scrap slides across the counter. "Pleasure. Don't make it a habit. Make it a career."`);
  }
  cityName(id) { return { portage: 'Portage', greentide_barge: 'Greentide', rusthold_tender: 'Rusthold', vigil: 'the Vigil', lowlight: 'Lowlight' }[id] || id; }

  toJSON() { return this.state; }
  load(o) { if (o) this.state = { ...this.state, ...o }; }
}
export { generatePerson };
void THREE;
