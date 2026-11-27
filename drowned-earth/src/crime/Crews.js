// Rival crews, the city feed, property and heists (data/crews.json).
// - Crews: your standing with each (-100..100) and their relations to each
//   other drift with weekly politics; your actions push both.
// - Feed: the city's chalk, pamphlets and radio report what you do. Your
//   reputation leans legend / villain / ghost by what you keep doing.
// - Property: safehouses, a raft club, a boat yard, a smuggling front; daily
//   income, daily risk (a rival hits it).
// - Heists: multi-stage jobs with reach / talk / hire / swap / escape / deliver goals.
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class Crews {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = ctx.data.crews;
    this.state = { standing: {}, rel: { ...(this.d?.relations || {}) }, rep: { legend: 0, villain: 0, ghost: 0 }, owned: {}, crew: [], heist: null, done: {}, lastDay: 0 };
    if (!this.d) return;
    for (const k of Object.keys(this.d.crews)) this.state.standing[k] = 0;
    const ev = ctx.events;
    ev.on('fame', (f) => this.report(f.kind, f.text));
    ev.on('night:delivered', () => { this.bump('lowlight', 6); this.state.rep.ghost += 1; });
    ev.on('boat:swap', (e) => { if (e.stolen) this.state.rep.villain += 1; });
    ev.on('heat:lost', () => { if (this.ctx.heat.peak >= 2) this.state.rep.ghost += 2; });
    ev.on('crime', (e) => { this.state.rep.villain += 1; if (e.id === 'heist') this.bump('sundials', -15); });
    ev.on('night:win', () => (this.state.rep.legend += 0.5));
    ev.on('tick:minute', () => this.minute());
  }
  bump(crew, v) { if (crew in this.state.standing) this.state.standing[crew] = Math.max(-100, Math.min(100, this.state.standing[crew] + v)); }
  get reputation() { const r = this.state.rep; return Object.entries(r).sort((a, b) => b[1] - a[1])[0][1] > 2 ? Object.entries(r).sort((a, b) => b[1] - a[1])[0][0] : 'nobody'; }
  relation(a, b) { return this.state.rel[`${a}|${b}`] ?? this.state.rel[`${b}|${a}`] ?? 0; }
  relLabel(v) { return v < -50 ? 'at war' : v < 0 ? 'cold' : v < 50 ? 'trading' : 'allied'; }

  // ---- the feed: chalk, pamphlets, radio news (Radio reads state.feed for {feed})
  report(kind, text) {
    const feed = (this.ctx.state.feed ||= []);
    const pool = this.d?.feed?.[kind] || [];
    const chalk = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    feed.unshift({ day: this.ctx.time.day, kind, text, chalk, short: text.replace(/^Somebody /i, '').replace(/\.$/, '') });
    feed.length = Math.min(feed.length, 20);
    if (kind in this.state.rep) this.state.rep[kind] += 1;
    if (chalk) setTimeout(() => this.ctx.ui.subtitle(chalk, 4, 'speech'), 4000);
  }

  minute() {
    const day = this.ctx.time.day;
    if (day === this.state.lastDay) return;
    this.state.lastDay = day;
    // weekly-ish crew politics
    if (Math.random() < 0.35 && this.d.events.length) {
      const e = this.d.events[Math.floor(Math.random() * this.d.events.length)];
      const k = this.state.rel[e.pair] !== undefined ? e.pair : e.pair.split('|').reverse().join('|');
      this.state.rel[k] = Math.max(-100, Math.min(100, (this.state.rel[k] || 0) + e.delta));
      this.ctx.economy.rumours.unshift({ day, text: e.text });
    }
    // property income and risk
    for (const id of Object.keys(this.state.owned)) {
      const p = this.d.property[id]; if (!p) continue;
      if (Math.random() < p.risk) { this.ctx.ui.whisper(`Trouble at ${p.name}: a rival crew paid it a visit. No income today.`); continue; }
      if (p.income) this.ctx.inventory.add('scrap', p.income, true);
    }
    const crewCost = this.state.crew.length * 3;
    if (crewCost) this.ctx.inventory.remove('scrap', Math.min(crewCost, this.ctx.inventory.count('scrap')));
  }
  has(role) { return this.state.crew.includes(role); }

  // ---- the crew board (opened from the journal or a bar)
  openBoard() {
    const ui = this.ctx.ui, d = this.d, st = this.state, inv = this.ctx.inventory;
    const crews = Object.entries(d.crews).map(([k, c]) => `<div class="row"><div class="name"><span style="color:${c.color}">${esc(c.name)}</span><small>${esc(c.boss)} · your standing ${st.standing[k] > 0 ? '+' : ''}${st.standing[k]}</small></div></div>`).join('');
    const rels = Object.entries(st.rel).map(([k, v]) => { const [a, b] = k.split('|'); return `<div class="row"><div class="name" style="font-size:12px">${esc(d.crews[a].name)} ↔ ${esc(d.crews[b].name)}: <b>${this.relLabel(v)}</b></div></div>`; }).join('');
    const roles = Object.entries(d.roles).map(([k, r]) => `<div class="row"><div class="name">${esc(r.name)} — ${esc(r.role)}<small>${esc(r.skill)}</small></div><button class="btn" data-hire="${k}" ${st.crew.includes(k) || !inv.has('scrap', r.cost) ? 'disabled' : ''}>${st.crew.includes(k) ? 'Hired' : r.cost + ' scrap'}</button></div>`).join('');
    const props = Object.entries(d.property).filter(([, p]) => p.cost).map(([k, p]) => `<div class="row"><div class="name">${esc(p.name)}<small>${esc(p.desc)} · +${p.income}/day · risk ${Math.round(p.risk * 100)}%</small></div><button class="btn" data-buy="${k}" ${st.owned[k] || !inv.has('scrap', p.cost) ? 'disabled' : ''}>${st.owned[k] ? 'Yours' : p.cost + ' scrap'}</button></div>`).join('');
    const heists = Object.entries(d.heists).map(([k, h]) => { const avail = this.ctx.story.flag(h.needs); const cur = st.heist?.id === k; return `<div class="row"><div class="name">${esc(h.name)}<small>${avail ? esc(h.pitch) : 'You need a lead before anyone will talk about this one.'}${cur ? ` <b>Now: ${esc(h.stages[st.heist.stage].text)}</b>` : st.done[k] ? ' (done)' : ''}</small></div><button class="btn" data-heist="${k}" ${!avail || st.heist || st.done[k] ? 'disabled' : ''}>Plan it</button></div>`; }).join('');
    const feed = (this.ctx.state.feed || []).slice(0, 6).map((f) => `<div class="row"><div class="name hand">${esc(f.chalk || f.text)}<small>day ${f.day}</small></div></div>`).join('') || '<div class="sub">The city hasn\'t noticed you yet.</div>';
    ui.openPanel('crews', `<button class="btn close" data-close>Close</button><h2>The Drift's underworld</h2><div class="sub">Your name on the water: <b>${this.reputation}</b> (legend ${st.rep.legend.toFixed(0)} · villain ${st.rep.villain.toFixed(0)} · ghost ${st.rep.ghost.toFixed(0)})</div>
      <h3>Crews</h3>${crews}<h3>Who's at war</h3>${rels}<h3>Hire</h3>${roles}<h3>Property</h3>${props}<h3>Heists</h3>${heists}<h3>The feed</h3>${feed}`, (el) => {
      el.querySelectorAll('[data-hire]').forEach((b) => b.addEventListener('click', () => { const r = d.roles[b.dataset.hire]; inv.remove('scrap', r.cost); st.crew.push(b.dataset.hire); ui.toast(`${r.name}: "${r.line}"`); this.bump(r.crew, 5); this.openBoard(); }));
      el.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { const p = d.property[b.dataset.buy]; inv.remove('scrap', p.cost); st.owned[b.dataset.buy] = true; if (p.crew) this.bump(p.crew, 8); this.report('legend', `Somebody bought ${p.name.toLowerCase()}.`); this.openBoard(); }));
      el.querySelectorAll('[data-heist]').forEach((b) => b.addEventListener('click', () => { st.heist = { id: b.dataset.heist, stage: 0 }; ui.close(); ui.whisper(`${d.heists[b.dataset.heist].name}: ${d.heists[b.dataset.heist].stages[0].text}`); }));
    });
  }

  // ---- heist progress, checked every frame (cheap)
  update(dt) {
    const h = this.state.heist; if (!h || !this.d) return;
    const H = this.d.heists[h.id], S = H.stages[h.stage], ctx = this.ctx, p = ctx.player.position;
    let done = false;
    if (S.goal === 'reach') done = Math.hypot(p.x - S.at[0], p.z - S.at[1]) < S.radius && (!S.night || ctx.time.out.night > 0.5);
    else if (S.goal === 'talk') done = !!ctx.nightlife?.state.bars[S.bar]?.visits && ctx.ui.panel && ctx.ui.panelKind === 'bar';
    else if (S.goal === 'hire') done = S.roles.every((r) => this.has(r));
    else if (S.goal === 'swap') done = ctx.boat.typeId === S.type;
    else if (S.goal === 'escape') done = ctx.heat.stars === 0 && (this.escT = (this.escT || 0) + dt) > 3;
    else if (S.goal === 'deliver') done = ctx.ui.panelKind === 'bar' && ctx.nightlife?.bars && Object.values(ctx.nightlife.bars).some((b) => b.community === S.to && ctx.ui.panel);
    if (!done) return;
    if (S.heat) ctx.heat.crime('heist', `${H.name}: ${S.id}`);
    if (S.goal === 'reach' && S.id === 'hit') ctx.inventory.add('seal', 12, true);
    h.stage++; this.escT = 0;
    if (h.stage >= H.stages.length) {
      this.state.done[h.id] = true; this.state.heist = null;
      ctx.inventory.add('scrap', H.reward, true); this.bump(H.crew, 25);
      this.report(H.fame, `${H.name}: done. ${H.after}`);
      ctx.ui.whisper(H.after);
      ctx.events.emit('heist:done', h.id);
    } else ctx.ui.whisper(`${H.name} — ${H.stages[h.stage].text}`);
  }
  toJSON() { return this.state; }
  load(o) { if (o) this.state = { ...this.state, ...o }; }
}
