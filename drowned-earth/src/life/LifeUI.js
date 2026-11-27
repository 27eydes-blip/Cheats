import { STATS, STAT_LABEL } from './Life.js';
import { rememberLife } from '../world/Bottles.js';

// Mobile-first life-sim UI: one thumb, big buttons, cards readable in 5 s.
// Worn-paper event cards with tide stains; profile bar, stat bars, life log,
// people, work, activities, world; AGE UP. 3D moments launch from cards.
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FX_LABEL = { ...STAT_LABEL, scrap: 'Scrap', seal: 'Seals', salt: 'Salt', glass: 'Glass', rations: 'Rations' };

export class LifeUI {
  constructor(ctx, life) {
    this.ctx = ctx; this.life = life;
    this.root = el('div', 'life hidden');
    document.getElementById('ui').appendChild(this.root);
    this.tab = 'log';
    life.on((k) => { if (k === 'change' && this.visible && !this.card) this.render(); if (k === 'death') setTimeout(() => this.showDeath(), 600); });
  }
  get visible() { return !this.root.classList.contains('hidden'); }
  show() { this.root.classList.remove('hidden'); this.ctx.lifeActive = true; this.ctx.input.enabled = false; if (document.pointerLockElement) document.exitPointerLock(); this.life.alive ? this.render() : this.showCreate(); }
  hide() { this.root.classList.add('hidden'); this.ctx.lifeActive = false; }
  tier(t) { return this.ctx.data.standing.tiers[String(t)]; }

  // ---------- creation ----------
  showCreate() {
    const births = this.ctx.data.life.births;
    const st = { name: 'Wren Calloway-Ashe', sex: 'female', birth: 'deepborn', hair: 'salt-bleached', eyes: 'grey', seed: '' };
    const draw = () => {
      this.root.innerHTML = `<div class="life-scroll"><div class="life-create">
        <div class="life-logo">A LIFE ON THE WATER</div>
        <p class="life-sub">Born on the Drift, year 41 after the Rise. Age a year at a time. Some years you will live in full.</p>
        <label>Name<input data-k="name" value="${esc(st.name)}" maxlength="40"></label>
        <div class="life-row">${['female', 'male', 'other'].map((s) => `<button class="lbtn ${st.sex === s ? 'on' : ''}" data-sex="${s}">${s}</button>`).join('')}</div>
        <div class="life-row"><span class="lmini">Hair</span>${['black', 'brown', 'salt-bleached', 'red', 'grey-streaked'].map((h) => `<button class="lbtn sm ${st.hair === h ? 'on' : ''}" data-hair="${h}">${h}</button>`).join('')}</div>
        <div class="life-row"><span class="lmini">Eyes</span>${['brown', 'grey', 'green', 'sea-blue'].map((h) => `<button class="lbtn sm ${st.eyes === h ? 'on' : ''}" data-eyes="${h}">${h}</button>`).join('')}</div>
        <h4>Born on</h4>
        <div class="life-births">${Object.entries(births).filter(([id]) => id !== 'highmark_ring').map(([id, b]) => `<button class="birth ${st.birth === id ? 'on' : ''}" data-birth="${id}"><i style="background:${this.tier(b.standing).wristband}"></i><b>${esc(b.name)}</b><small>${esc(this.tier(b.standing).short)} · ${esc(b.intro.split('.')[0])}.</small></button>`).join('')}
          <button class="birth ${st.birth === 'random' ? 'on' : ''}" data-birth="random"><i style="background:#888"></i><b>Let the tide decide</b><small>Any raft. A small chance of Highmark's lower ring.</small></button></div>
        <label>Seed (optional — the same seed replays the same life)<input data-k="seed" value="${esc(st.seed)}" placeholder="random"></label>
        <div class="life-row"><button class="lbtn" data-rand>Randomise</button><button class="lbtn" data-daily>Today's tide</button><button class="lbtn big primary" data-go>Be born</button></div>
        <button class="lbtn ghost" data-back>Back to title</button></div></div>`;
      this.root.querySelectorAll('[data-sex]').forEach((b) => b.onclick = () => { st.sex = b.dataset.sex; draw(); });
      this.root.querySelectorAll('[data-hair]').forEach((b) => b.onclick = () => { st.hair = b.dataset.hair; draw(); });
      this.root.querySelectorAll('[data-eyes]').forEach((b) => b.onclick = () => { st.eyes = b.dataset.eyes; draw(); });
      this.root.querySelectorAll('[data-birth]').forEach((b) => b.onclick = () => { st.birth = b.dataset.birth; draw(); });
      this.root.querySelectorAll('input[data-k]').forEach((i) => i.oninput = () => { st[i.dataset.k] = i.value; });
      this.root.querySelector('[data-rand]').onclick = () => { const n = this.ctx.data.life.names; st.sex = ['female', 'male', 'other'][Math.floor(Math.random() * 3)]; st.name = `${n.any[Math.floor(Math.random() * n.any.length)]} ${n.family[Math.floor(Math.random() * n.family.length)]}`; st.birth = 'random'; draw(); };
      this.root.querySelector('[data-daily]').onclick = () => { st.seed = 'daily-' + new Date().toISOString().slice(0, 10); st.birth = 'random'; draw(); };
      this.root.querySelector('[data-go]').onclick = () => {
        this.life.create({ name: st.name.trim() || 'Wren Calloway-Ashe', sex: st.sex, birth: st.birth === 'random' ? null : st.birth, appearance: { hair: st.hair, eyes: st.eyes }, seed: st.seed.trim() || undefined });
        this.ctx.audio?.play('chimeSwell');
        this.tab = 'log'; this.render();
      };
      this.root.querySelector('[data-back]').onclick = () => { this.hide(); this.ctx.ui.titleScreen(this.ctx.save.has(), this.ctx.game.onTitleChoice); };
    };
    draw();
  }

  // ---------- main screen ----------
  render() {
    const L = this.life, S = L.s;
    if (!S) return this.showCreate();
    const t = this.tier(S.standing);
    const job = S.career ? this.ctx.data.life.careers[S.career.id].ranks[S.career.rank] : S.age < 14 ? 'child' : 'no work';
    const tabs = { log: 'Life', stats: 'You', people: 'People', work: 'Work', do: 'Do', world: 'World' };
    this.root.innerHTML = `<div class="life-main">
      <div class="life-profile"><div class="lp-name">${esc(S.name)}<small>${S.generation > 1 ? `Generation ${S.generation} · ` : ''}${esc(this.ctx.data.life.births[S.birth].name)}</small></div>
        <div class="lp-age"><b>${S.age}</b><small>years</small></div>
        <div class="lp-band"><i style="background:${t.wristband}"></i>${esc(t.short)}${S.standing === 7 ? ` · ${'I'.repeat(Math.min(10, 1 + Math.floor(S.age / 6)))}` : ''}<small>${esc(job)}</small></div></div>
      <div class="life-bars">${['health', 'happiness', 'smarts', 'looks'].map((k) => this.bar(k, S.stats[k])).join('')}</div>
      <div class="life-tabs">${Object.entries(tabs).map(([k, v]) => `<button class="${this.tab === k ? 'on' : ''}" data-tab="${k}">${v}</button>`).join('')}</div>
      <div class="life-body">${this['tab_' + this.tab]()}</div>
      <div class="life-foot"><button class="lbtn ghost" data-menu>☰</button><button class="lbtn huge primary" data-age ${S.alive ? '' : 'disabled'}>AGE UP</button><span class="lp-act">${S.actionsLeft} action${S.actionsLeft === 1 ? '' : 's'} left</span></div></div>`;
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { this.tab = b.dataset.tab; this.render(); });
    this.root.querySelector('[data-age]').onclick = () => this.ageUp();
    this.root.querySelector('[data-menu]').onclick = () => this.menu();
    const body = this.root.querySelector('.life-body');
    if (this.tab === 'log') body.scrollTop = body.scrollHeight;
    this.bindTab(body);
  }
  bar(k, v) { return `<div class="lbar"><span>${STAT_LABEL[k]}</span><div><i style="width:${v}%;background:${v < 25 ? '#c0573f' : v < 50 ? '#c9a46a' : '#6fae8f'}"></i></div><b>${Math.round(v)}</b></div>`; }
  tab_log() {
    const S = this.life.s;
    let html = '', lastAge = -1;
    for (const e of S.log.slice(-160)) {
      if (e.age !== lastAge) { html += `<div class="ll-age">Age ${e.age}</div>`; lastAge = e.age; }
      html += `<p class="ll ${e.kind}">${esc(e.text)}</p>`;
    }
    return `<div class="life-log">${html}</div>`;
  }
  tab_stats() {
    const S = this.life.s;
    const res = ['scrap', 'seal', 'salt', 'glass', 'rations'].map((k) => `<span>${FX_LABEL[k]} <b>${Math.round(S.res[k] || 0)}</b></span>`).join('');
    const rep = Object.entries(S.rep).map(([k, v]) => `<span>${k.replace('_', ' ')} <b style="color:${v > 0 ? '#9c9' : v < 0 ? '#d99' : 'inherit'}">${v > 0 ? '+' : ''}${Math.round(v)}</b></span>`).join('');
    return `<div class="life-bars full">${STATS.map((k) => this.bar(k, S.stats[k])).join('')}</div><h4>Pockets</h4><div class="lgrid">${res}</div><h4>Reputation</h4><div class="lgrid">${rep}</div>
      <p class="lmini">Seed ${esc(S.seed)} · ${esc(S.appearance.hair)} hair, ${esc(S.appearance.eyes)} eyes</p>`;
  }
  tab_people() {
    const S = this.life.s;
    const actions = (p) => {
      const a = [['talk', 'Talk'], ['gift', 'Gift'], ['share', 'Share rations'], ['argue', 'Argue']];
      if (S.age >= 16 && ['friend', 'crush', 'ex'].includes(p.role)) a.push(['romance', 'Ask out']);
      if (p.role === 'partner') a.push(['marry', 'Propose']);
      if ((p.role === 'partner' || p.role === 'spouse') && S.age >= 18) a.push(['child', 'Have a child'], ['leave', 'Leave']);
      if (['rival', 'nemesis', 'ex'].includes(p.role) || p.meter < 25) a.push(['reconcile', 'Make peace']);
      if (S.age >= 14 && !['mother', 'father', 'child'].includes(p.role)) a.push(['betray', 'Betray']);
      return a.map(([k, v]) => `<button class="lbtn sm" data-p="${p.id}" data-a="${k}">${v}</button>`).join('');
    };
    const alive = S.people.filter((p) => p.alive);
    const dead = S.people.filter((p) => !p.alive);
    return `${alive.map((p) => `<div class="lperson"><div><b>${esc(p.name)}</b> <small>${esc(this.life.relLabel(p).replace('Your ', ''))} · ${p.age} · ${esc(p.traits.join(', '))}${p.job ? ' · ' + esc(p.job) : ''}</small><div class="lmeter"><i style="width:${p.meter}%"></i></div></div><div class="lacts">${actions(p)}</div></div>`).join('')}
      <button class="lbtn" data-friend>Look for a friend</button>
      ${dead.length ? `<h4>Remembered</h4>${dead.map((p) => `<p class="lmini">${esc(p.name)} — ${esc(this.life.relLabel(p).replace('Your ', ''))}</p>`).join('')}` : ''}`;
  }
  tab_work() {
    const L = this.life, S = L.s, C = this.ctx.data.life.careers;
    if (S.age < 13) return '<p class="lmini">Too young for work, officially. You help where you can.</p>';
    const cur = S.career ? `<div class="lperson"><div><b>${esc(C[S.career.id].ranks[S.career.rank])}</b> <small>${esc(C[S.career.id].name)} · ${S.career.years} yrs · ${C[S.career.id].pay[S.career.rank]} scrap/yr</small><div class="lmeter"><i style="width:${S.career.perf}%"></i></div></div><div class="lacts"><button class="lbtn sm" data-work>Work hard</button><button class="lbtn sm" data-quit>Quit</button></div></div>` : '<p class="lmini">No work. The raft notices.</p>';
    const jobs = L.jobsAvailable().map((c) => `<div class="lperson"><div><b>${esc(c.name)}</b> <small>${esc(c.ranks.join(' → '))} · from ${c.pay[0]} scrap/yr${c.standing ? ` · ${esc(this.tier(c.standing).short)}` : ''}${c.tags?.includes('outlaw') ? ' · outlaw' : ''}</small></div><div class="lacts"><button class="lbtn sm" data-job="${c.id}">Apply</button></div></div>`).join('');
    return `${cur}<h4>Work you could try for</h4>${jobs || '<p class="lmini">Nobody is hiring someone like you. Yet.</p>'}`;
  }
  tab_do() {
    const A = this.ctx.data.life.activities;
    return Object.entries(A).map(([k, a]) => `<button class="lbtn wide" data-do="${k}">${esc(a.name)}${a.cost ? ` <small>(${Object.entries(a.cost).map(([c, n]) => n + ' ' + c).join(', ')})</small>` : ''}</button>`).join('') + '<p class="lmini">Three actions a year. Then AGE UP.</p>';
  }
  tab_world() {
    const W = this.life.s.world;
    const pct = (v) => Math.round(v * 100);
    return `<div class="life-bars full">${[['Glow from the Deep', W.glow], ['Ration level', W.rations / 1.3], ['Raft uprising', W.uprising]].map(([n, v]) => `<div class="lbar"><span>${n}</span><div><i style="width:${pct(v)}%;background:#7fb6c9"></i></div><b>${pct(v)}</b></div>`).join('')}</div>
      <h4>Year ${W.year} after the Rise</h4><div class="lgrid">${Object.entries(W.leaders).map(([k, v]) => `<span>${esc(k)}<b>${esc(v)}</b></span>`).join('')}</div>`;
  }
  bindTab(body) {
    const L = this.life;
    const say = (t) => { if (t) this.toast(t); this.render(); };
    body.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => say(L.personAct(b.dataset.p, b.dataset.a)));
    body.querySelector('[data-friend]')?.addEventListener('click', () => say(L.findFriend()));
    body.querySelectorAll('[data-job]').forEach((b) => b.onclick = () => say(L.applyJob(b.dataset.job)));
    body.querySelector('[data-work]')?.addEventListener('click', () => say(L.workHard()));
    body.querySelector('[data-quit]')?.addEventListener('click', () => { L.setCareer(null); say(''); });
    body.querySelectorAll('[data-do]').forEach((b) => b.onclick = () => {
      const a = this.ctx.data.life.activities[b.dataset.do];
      if (a.scene) { this.playScene(a.scene, (res) => say(L.act(b.dataset.do))); return; }
      say(L.act(b.dataset.do));
    });
  }
  toast(t) { const d = el('div', 'life-toast', esc(t)); this.root.appendChild(d); setTimeout(() => d.remove(), 3200); }
  menu() {
    const d = el('div', 'life-card-wrap', `<div class="life-card"><h3>Menu</h3><button class="lbtn wide" data-save>Save</button><button class="lbtn wide" data-water>Go to the water (story mode)</button><button class="lbtn wide" data-new>Start a new life</button><button class="lbtn wide" data-title>Title screen</button><button class="lbtn wide ghost" data-x>Close</button></div>`);
    this.root.appendChild(d);
    d.querySelector('[data-x]').onclick = () => d.remove();
    d.querySelector('[data-save]').onclick = () => { this.ctx.save.save('life'); this.toast('Saved.'); d.remove(); };
    d.querySelector('[data-new]').onclick = () => { d.remove(); this.life.s = null; this.showCreate(); };
    d.querySelector('[data-water]').onclick = () => { d.remove(); this.hide(); this.ctx.game.enterStory(); };
    d.querySelector('[data-title]').onclick = () => { d.remove(); this.hide(); this.ctx.ui.titleScreen(this.ctx.save.has(), this.ctx.game.onTitleChoice); };
  }

  // ---------- the year ----------
  ageUp() {
    const ev = this.life.ageUp();
    this.ctx.audio?.play('ui');
    if (!this.life.alive) return;
    if (ev) this.showCard(ev); else this.render();
    if (this.life.s.age % 3 === 0) this.ctx.save.save('life');
  }
  showCard(ev) {
    const L = this.life;
    this.card = ev;
    const d = el('div', 'life-card-wrap', `<div class="life-card paper"><div class="lc-age">Age ${L.s.age}</div><h3>${esc(L.textFill(ev.title || ''))}</h3><p>${esc(L.textFill(ev.text))}</p>
      <div class="lc-choices">${ev.choices.map((c, i) => `<button class="lbtn wide" data-c="${i}">${esc(L.textFill(c.label))}</button>`).join('')}</div></div>`);
    this.root.appendChild(d);
    d.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => {
      const idx = +b.dataset.c, choice = ev.choices[idx];
      const skillOut = choice.out.find((o) => o.check && o.good);
      if (skillOut && choice.out.length > 1) this.offerMinigame(d, ev, idx, skillOut);
      else this.resolve(d, ev, L.choose(ev, idx), choice.label);
    });
  }
  offerMinigame(d, ev, idx, goodOut) {
    const card = d.querySelector('.life-card');
    const kind = { nerve: 'Steady your nerve', deepsense: 'Hold your breath', strength: 'Pull', charm: 'Strike the bargain', luck: 'Roll with it', smarts: 'Work it out', looks: 'Catch their eye', health: 'Endure' }[goodOut.check] || 'Try';
    card.querySelector('.lc-choices').innerHTML = `<p class="lmini">${esc(kind)}: tap when the needle is in the light. Or let fate decide.</p><button class="lbtn wide primary" data-mg>Try it yourself</button><button class="lbtn wide" data-auto>Auto</button>`;
    card.querySelector('[data-auto]').onclick = () => this.resolve(d, ev, this.life.choose(ev, idx), ev.choices[idx].label);
    card.querySelector('[data-mg]').onclick = () => this.minigame(card, goodOut.check, (ok) => {
      const choice = ev.choices[idx];
      const o = ok ? goodOut : (choice.out.find((x) => x !== goodOut) || goodOut);
      this.life.s.rolls++;
      this.resolve(d, ev, o, choice.label);
    });
  }
  // Timing needle: zone width scales with the relevant stat.
  minigame(card, stat, done) {
    const v = this.life.s.stats[stat] ?? 50;
    const zone = 0.12 + v / 600;
    const center = 0.25 + Math.random() * 0.5;
    card.querySelector('.lc-choices').innerHTML = `<div class="mg"><div class="mg-zone" style="left:${(center - zone / 2) * 100}%;width:${zone * 100}%"></div><div class="mg-needle"></div></div><button class="lbtn wide primary" data-tap>TAP</button>`;
    const needle = card.querySelector('.mg-needle');
    let t = 0, x = 0, live = true;
    const speed = 0.9 + Math.random() * 0.5;
    const loop = (now) => { if (!live) return; t += 0.016 * speed; x = 0.5 + 0.5 * Math.sin(t * 3.2); needle.style.left = x * 100 + '%'; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    card.querySelector('[data-tap]').onclick = () => { live = false; const ok = Math.abs(x - center) < zone / 2; this.ctx.audio?.play(ok ? 'pickup' : 'ui'); setTimeout(() => done(ok), 250); };
  }
  resolve(d, ev, o, label) {
    const L = this.life;
    if (o.scene) {
      const card = d.querySelector('.life-card');
      const sc = this.ctx.data.life.scenes[o.scene];
      card.querySelector('.lc-choices').innerHTML = `<div class="lc-scene"><b>${esc(sc.title)}</b><p class="lmini">${esc(sc.desc)}</p></div><button class="lbtn wide primary" data-play>Live it (3D)</button><button class="lbtn wide" data-skip>Skip — let fate decide</button>`;
      card.querySelector('[data-play]').onclick = () => { d.remove(); this.playScene(o.scene, (res) => { const sub = res === 'success' ? o.success : o.fail; this.showResult(ev, sub, label, res); }); };
      card.querySelector('[data-skip]').onclick = () => {
        const skill = L.s.stats[sc.skill] ?? 50;
        const ok = L.rng('skip:' + o.scene).chance(0.3 + skill / 150);
        d.remove(); this.showResult(ev, ok ? o.success : o.fail, label, ok ? 'success' : 'fail');
      };
      return;
    }
    d.remove();
    this.showResult(ev, o, label);
  }
  showResult(ev, o, label, sceneRes) {
    const L = this.life;
    const { text, changes } = L.applyOutcome(ev, o, label);
    L.s.sceneResults = L.s.sceneResults || [];
    if (sceneRes) L.s.sceneResults.push({ age: L.s.age, scene: ev.id, res: sceneRes });
    const chips = changes.filter(([, v]) => v).map(([k, v]) => `<span class="${v > 0 ? 'up' : 'down'}">${esc(FX_LABEL[k] || k.replace('rep.', ''))} ${v > 0 ? '+' : ''}${v}</span>`).join('');
    const r = el('div', 'life-card-wrap', `<div class="life-card paper"><div class="lc-age">${sceneRes ? (sceneRes === 'success' ? 'You lived it well' : 'It went badly') : 'Age ' + L.s.age}</div><p>${esc(text)}</p><div class="lc-chips">${chips}</div><button class="lbtn wide primary" data-ok>Continue</button></div>`);
    this.root.appendChild(r);
    r.querySelector('[data-ok]').onclick = () => { r.remove(); this.card = null; if (L.alive) this.render(); };
  }
  playScene(id, cb) {
    this.hide();
    this.ctx.scenarios.start(id, (res) => { this.show(); cb(res); });
  }

  // ---------- death & legacy ----------
  showDeath() {
    const L = this.life, s = L.summary();
    this.card = null;
    rememberLife(s);
    this.root.querySelectorAll('.life-card-wrap').forEach((n) => n.remove());
    const kids = L.s.people.some((p) => p.role === 'child' && p.alive);
    const d = el('div', 'life-card-wrap', `<div class="life-card paper death"><div class="lc-age">${esc(s.name)} · ${s.age}</div><h3>${esc(s.cause === 'old age' ? 'A long life' : 'The water took you')}</h3>
      <div class="lgrid summary"><span>Born<b>${esc(s.raft)}</b></span><span>Peak standing<b>${esc(s.peak)}</b></span><span>Work<b>${esc(s.job)}</b></span><span>Spouse<b>${esc(s.spouse)}</b></span><span>Children<b>${esc(s.children.join(', ') || 'none')}</b></span><span>Died of<b>${esc(s.cause)}</b></span></div>
      <p><i>Best moment:</i> ${esc(s.best)}</p><p class="lmini">${esc(s.ending)}</p>
      ${kids ? '<button class="lbtn wide primary" data-child>Continue as your child</button>' : ''}<button class="lbtn wide" data-new>A new life</button><button class="lbtn wide ghost" data-title>Title screen</button></div>`);
    this.root.appendChild(d);
    d.querySelector('[data-child]')?.addEventListener('click', () => { L.continueAsChild(); d.remove(); this.render(); });
    d.querySelector('[data-new]').onclick = () => { d.remove(); L.s = null; this.showCreate(); };
    d.querySelector('[data-title]').onclick = () => { d.remove(); this.hide(); this.ctx.ui.titleScreen(this.ctx.save.has(), this.ctx.game.onTitleChoice); };
    this.ctx.save.save('death');
  }
}
