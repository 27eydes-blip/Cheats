import { Settings } from '../core/Settings.js';
import { HELP_HTML } from './Journal.js';

// Minimal diegetic-leaning HUD + menus. Everything is DOM over the canvas.
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class UI {
  constructor(ctx) {
    this.ctx = ctx;
    const root = (this.root = document.getElementById('ui'));
    this.dot = root.appendChild(el('div', 'hud-dot'));
    this.promptEl = root.appendChild(el('div', 'prompt'));
    this.subEl = root.appendChild(el('div', 'subtitle'));
    this.whisperEl = root.appendChild(el('div', 'whisper'));
    this.toastEl = root.appendChild(el('div', 'toast'));
    this.noteEl = root.appendChild(el('div', 'note'));
    this.wrist = root.appendChild(el('div', 'wrist', `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#1d3833" stroke-width="6"/><circle class="o2" cx="60" cy="60" r="50" fill="none" stroke="#6fe0be" stroke-width="6" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="0" transform="rotate(-90 60 60)"/></svg><div class="depth">0.0</div><div class="lbl">M · O₂</div>`));
    this.boatEl = root.appendChild(el('div', 'boatgauge'));
    this.fadeEl = root.appendChild(el('div', 'fade'));
    this.wristband = root.appendChild(el('div', 'wristband'));
    this.heatEl = root.appendChild(el('div', 'heatmark'));
    this.captionEl = root.appendChild(el('div', 'caption'));
    this.hintEl = root.appendChild(el('div', 'hint'));
    ctx.events.on('standing', () => this.renderWristband());
    ctx.events.on('caption', (c) => this.caption(c));
    setTimeout(() => this.renderWristband(), 0);
    this.fpsEl = ctx.params.has('stats') ? root.appendChild(el('div', 'fps')) : null;
    this.panel = null;
    this.timers = {};
    this.currentStation = null;
    this.whisperQueue = [];
  }
  get open() { return !!this.panel; }
  renderWristband() {
    const st = this.ctx.standing; if (!st) return;
    const info = st.info();
    const tally = st.shown === 7 ? '<span class="tally">' + 'I'.repeat(Math.min(12, st.dives)).replace(/(IIII)/g, '$1 ') + '</span>' : '';
    this.wristband.innerHTML = `<i style="background:${info.wristband}"></i><b>${info.short}${st.forged != null ? ' ?' : ''}</b>${tally}`;
    this.wristband.title = info.desc;
  }
  hint(t) { this.hintEl.textContent = t; this.show(this.hintEl, 'hint', 7000); }
  caption(c) {
    if (!this.ctx.settings.captions) return;
    this.captionEl.textContent = c; this.show(this.captionEl, 'cap', 2200);
  }
  // ---- HUD feedback ----
  show(elm, key, ms) { elm.style.opacity = 1; clearTimeout(this.timers[key]); if (ms) this.timers[key] = setTimeout(() => (elm.style.opacity = 0), ms); }
  whisper(text) {
    this.whisperQueue.push(text);
    if (this.whisperBusy) return;
    const next = () => {
      const t = this.whisperQueue.shift();
      if (!t) { this.whisperBusy = false; return; }
      this.whisperBusy = true;
      this.whisperEl.textContent = t;
      this.whisperEl.style.opacity = 1;
      setTimeout(() => { this.whisperEl.style.opacity = 0; setTimeout(next, 1300); }, 3200 + t.length * 45);
    };
    next();
  }
  toast(text) { this.toastEl.textContent = text; this.show(this.toastEl, 'toast', 3500); this.ctx.audio?.play('pickup'); }
  subtitle(text, dur = 4, cls = '') {
    if (!this.ctx.settings.subtitles) return;
    this.subEl.className = 'subtitle ' + cls;
    this.subEl.textContent = text;
    this.show(this.subEl, 'sub', dur * 1000 + 600);
  }
  note(text) { this.noteEl.textContent = text; this.show(this.noteEl, 'note', 9000); }
  fade(sec, mid, hold = 0.6) {
    this.fadeEl.style.transition = `opacity ${sec}s`;
    this.fadeEl.style.opacity = 1;
    setTimeout(() => { mid?.(); setTimeout(() => { this.fadeEl.style.opacity = 0; }, hold * 1000); }, sec * 1000);
  }
  update(dt) {
    const { interact, player, survival, boat, input } = this.ctx;
    const f = interact.focus;
    const p = f ? interact.promptFor(f) : '';
    // on a boat with nothing else to use, the prompt offers the way off
    const leave = !p && player.mode === 'boat' && boat.canLeave?.() && !this.open ? boat.leaveLabel() : '';
    if (leave) {
      const pad = this.ctx.pad?.device === 'pad';
      this.promptEl.innerHTML = pad ? `${this.ctx.pad.glyph('swap')}${esc(leave)}` : `<b>${input.usingTouch ? 'Use' : 'E'}</b>${esc(leave)}`;
      this.promptEl.style.opacity = 1; this.dot.classList.remove('active');
    } else if (p && !this.open) {
      const pad = this.ctx.pad?.device === 'pad';
      this.promptEl.innerHTML = pad ? `${this.ctx.pad.glyph('use')}${esc(p)}` : `<b>${input.usingTouch ? 'Use' : 'E'}</b>${esc(p)}`;
      this.promptEl.style.opacity = 1; this.dot.classList.add('active');
    } else { this.promptEl.style.opacity = 0; this.dot.classList.remove('active'); }
    this.dot.style.opacity = player.mode === 'boat' && this.ctx.rig.thirdPerson ? 0 : 1;
    // wrist gauge while diving
    const diving = player.headUnder || (player.mode === 'swim' && player.depth > 0.3);
    this.wrist.classList.toggle('on', diving);
    if (diving) {
      this.wrist.querySelector('.depth').textContent = player.depth.toFixed(1);
      this.wrist.querySelector('.lbl').textContent = (this.ctx.abyss?.zone?.name || 'depth').replace('the ', '').toUpperCase();
      const o2 = survival.oxygen / 100;
      const ring = this.wrist.querySelector('.o2');
      ring.setAttribute('stroke-dashoffset', String(314 * (1 - o2)));
      ring.setAttribute('stroke', o2 < 0.3 ? '#e07a5f' : '#6fe0be');
    }
    const aboard = player.mode === 'boat';
    this.boatEl.classList.toggle('on', aboard);
    if (aboard && (this.ctx.game.frame % 15 === 0)) {
      const bar = (v) => `<span class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
      const radio = this.ctx.radio.station ? this.ctx.radio.station.name.split('—')[0].trim() : 'off';
      this.boatEl.innerHTML = `${boat.paddling ? 'PADDLE' : 'FUEL'} ${bar((boat.fuel / boat.fuelMax) * 100)}<br>HULL ${bar(boat.hull)}<br>RADIO ${radio}${boat.tied ? '<br>TIED' : ''}`;
    }
    if (this.fpsEl && this.ctx.game.frame % 20 === 0) {
      const r = this.ctx.renderer.info.render;
      this.fpsEl.textContent = `${this.ctx.game.fps.toFixed(0)} fps · ${this.ctx.settings.label} · ${this.ctx.chunks.stats.loaded} chunks · ${this.ctx.time.clockString()} · ${this.ctx.weather.state}`;
    }
    const heat = this.ctx.heat?.value || 0;
    if (this.ctx.game.frame % 20 === 0) { this.heatEl.style.opacity = heat > 8 ? 1 : 0; this.heatEl.textContent = 'WARD ' + '▮'.repeat(Math.ceil(heat / 20)) + '▯'.repeat(5 - Math.ceil(heat / 20)) + (this.ctx.patrol?.state === 'chase' ? ' · PURSUED' : ''); }
    // hotkeys
    if (input.pressed('pause')) this.panel ? this.close() : this.openPause();
    if (!this.panel) {
      if (input.pressed('inventory')) this.openInventory();
      else if (input.pressed('journal')) this.openJournal();
      else if (input.pressed('craft')) this.openCraft(null);
    } else if (input.pressed('inventory') && this.panelKind === 'inventory') this.close();
  }
  // ---- panels ----
  openPanel(kind, html, bind) {
    this.close(true);
    const wrap = el('div', 'panel-wrap');
    const p = el('div', 'panel', html);
    wrap.appendChild(p);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) this.close(); });
    this.root.appendChild(wrap);
    this.panel = wrap; this.panelKind = kind;
    this.ctx.paused = kind !== 'shop' && kind !== 'log' ? true : this.ctx.paused;
    this.ctx.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    p.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    bind?.(p);
    this.ctx.audio?.play('page');
    return p;
  }
  close(silent) {
    if (!this.panel) return;
    this.panel.remove(); this.panel = null; this.panelKind = null; this.currentStation = null;
    if (this.ctx.state.memoryFilter) { this.ctx.state.memoryFilter = false; this.ctx.canvas.style.filter = ''; }
    this.ctx.paused = false; this.ctx.input.enabled = true;
    if (!silent) this.ctx.audio?.play('ui');
  }
  itemRow(id, n, right) {
    const d = this.ctx.data.items.items[id];
    return `<div class="row"><div class="name">${esc(d.name)}${n > 1 ? ' ×' + n : ''}${d.sealed ? '<span class="seal">HIGHMARK SEAL</span>' : ''}<small>${esc(d.desc)}</small></div>${right || ''}</div>`;
  }
  openInventory() {
    const { inventory, survival, boat } = this.ctx;
    const s = survival;
    const word = (v) => (v > 75 ? 'fine' : v > 50 ? 'okay' : v > 25 ? 'low' : 'bad');
    const render = () => {
      const atBoat = this.ctx.player.mode === 'boat' || this.ctx.survival.nearBoat();
      const locker = this.ctx.boatStorage;
      const rows = inventory.list().map(({ id, n, def }) => this.itemRow(id, n, (def.use ? `<button class="btn" data-use="${id}">Use</button>` : '') + (atBoat ? `<button class="btn" data-stow="${id}">Stow</button>` : ''))).join('') || '<div class="sub">Empty pockets.</div>';
      const lockerRows = atBoat ? (locker.list().map(({ id, n }) => this.itemRow(id, n, `<button class="btn" data-take="${id}">Take</button>`)).join('') || '<div class="sub">The boat locker is empty.</div>') : '';
      return `<button class="btn close" data-close>Close</button><h2>Pack</h2>
        <div class="sub">${inventory.weight().toFixed(1)} / ${inventory.capacity} kg · ${inventory.count('scrap')} scrap</div>
        <div class="stats"><span>Thirst <b>${word(s.thirst)}</b></span><span>Hunger <b>${word(s.hunger)}</b></span><span>Warmth <b>${word(s.warmth)}</b></span><span>Rest <b>${word(s.rest)}</b></span><span>Torch <b>${Math.round(s.battery)}%</b></span><span>Boat hull <b>${Math.round(boat.hull)}%</b></span><span>Fuel <b>${boat.fuel.toFixed(1)} L</b></span></div>
        <div class="tabs"><button class="btn" data-go="craft">Craft</button><button class="btn" data-go="journal">Journal</button></div>
        <h3>Carried</h3>${rows}${atBoat ? '<h3>Boat locker</h3>' + lockerRows : ''}`;
    };
    const bind = (p) => {
      p.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { if (this.ctx.survival.useItem(b.dataset.use)) this.toast('Used ' + inventory.def(b.dataset.use).name); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-stow]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.stow; inventory.remove(id); this.ctx.boatStorage.add(id, 1, true); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-take]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.take; this.ctx.boatStorage.remove(id); inventory.add(id, 1, true); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => (b.dataset.go === 'craft' ? this.openCraft(null) : this.openJournal())));
      p.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    };
    this.openPanel('inventory', render(), bind);
  }
  openCraft(station) {
    this.close(true);
    this.currentStation = station;
    const { crafting, inventory } = this.ctx;
    const render = () => {
      const rows = crafting.recipes.map((r) => {
        const need = Object.entries(r.in).map(([k, n]) => `${this.ctx.data.items.items[k].name} ${inventory.count(k)}/${n}`).join(', ') + (r.tool ? ` · needs ${this.ctx.data.items.items[r.tool].name}` : '');
        const where = r.station === 'workbench' ? ' · at a workbench' : '';
        return `<div class="row"><div class="name">${esc(r.name)}<small>${esc(need + where)}</small></div><button class="btn" data-craft="${r.id}" ${crafting.canCraft(r) ? '' : 'disabled'}>Make</button></div>`;
      }).join('');
      return `<button class="btn close" data-close>Close</button><h2>${station === 'workbench' ? 'Workbench' : 'Make do'}</h2><div class="sub">${station === 'workbench' ? 'Bram\'s bench on Patchwork. Vices, a drill that still turns.' : 'What you can do with your hands.'}</div>${rows}`;
    };
    const bind = (p) => {
      p.querySelectorAll('[data-craft]').forEach((b) => b.addEventListener('click', () => { crafting.craft(b.dataset.craft); const st = this.currentStation; p.innerHTML = render(); this.currentStation = st; bind(p); }));
      p.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    };
    this.openPanel('craft', render(), bind);
    this.currentStation = station;
  }
  openShop(shopId, stepId, who) {
    const { trade, inventory, data, standing } = this.ctx;
    const shop = shopId ? data.trade.shops[shopId] : null;
    const curName = (c) => ({ scrap: 'scrap', seal: 'seal', salt: 'salt', glass: 'glass' }[c] || c);
    const wallet = () => ['scrap', 'seal', 'salt', 'glass'].map((c) => `${inventory.count(c)} ${curName(c)}`).join(' · ');
    const render = () => {
      let html = `<button class="btn close" data-close>Leave</button><h2>${esc(shop ? shop.name : who)}</h2><div class="sub">${wallet()}${shop && standing.priceMod(shop) > 1.05 ? ` · <span style="color:#d99">${standing.info().short} price ×${standing.priceMod(shop).toFixed(2)}</span>` : ''}</div>`;
      if (stepId) {
        const st = data.standing.steps[stepId];
        const cost = Object.entries(st.cost).map(([k, n]) => `${n} ${curName(k)}`).join(' + ');
        const can = standing.canStep(stepId);
        const owned = standing.tier <= st.toTier;
        html += `<h3>Standing</h3><div class="row"><div class="name">${esc(data.standing.tiers[String(st.toTier)].name)} ${owned ? '(yours)' : ''}<small>${esc(st.desc)}</small></div><button class="btn" data-step="${stepId}" ${can ? '' : 'disabled'}>${owned ? 'Held' : cost}</button></div>`;
      }
      if (!shop) return html;
      const services = Object.entries(shop.services || {}).map(([sid, sv]) => `<div class="row"><div class="name">${esc(sv.name)}${sv.upgrade && this.ctx.boat.upgrades[sv.upgrade] ? ' ✓' : ''}</div><button class="btn" data-svc="${sid}" ${inventory.has('scrap', sv.price) && !(sv.upgrade && this.ctx.boat.upgrades[sv.upgrade]) ? '' : 'disabled'}>${sv.price} scrap</button></div>`).join('');
      const sells = Object.keys(shop.sells).map((id) => { const p = trade.price(shopId, id), c = trade.cur(shopId, id); return this.itemRow(id, 1, `<span style="color:var(--dim);font-size:12px">${trade.stockOf(shopId, id)} left</span><button class="btn" data-buy="${id}" ${trade.canBuy(shopId, id) ? '' : 'disabled'}>${p ? p + ' ' + curName(c) : 'take'}</button>`); }).join('');
      const buys = inventory.list().filter(({ id }) => trade.sellPrice(shopId, id) > 0).map(({ id, n }) => this.itemRow(id, n, `<button class="btn" data-sell="${id}">Sell ${trade.sellPrice(shopId, id)}</button>`)).join('') || '<div class="sub">Nothing they want.</div>';
      return html + `${services ? '<h3>Services</h3>' + services : ''}<h3>For sale</h3>${sells}<h3>They'll take</h3>${buys}`;
    };
    const bind = (p) => {
      p.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { if (trade.buy(shopId, b.dataset.buy)) this.ctx.audio?.play('pickup'); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => { trade.sell(shopId, b.dataset.sell); this.ctx.audio?.play('ui'); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-svc]').forEach((b) => b.addEventListener('click', () => { if (trade.service(shopId, b.dataset.svc)) this.toast('Done.'); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { standing.step(b.dataset.step); p.innerHTML = render(); bind(p); }));
      p.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    };
    this.openPanel('shop', render(), bind);
    this.ctx.paused = true;
  }
  showNote(title, text) { this.openPanel('log', `<button class="btn close" data-close>Close</button><h2>${esc(title)}</h2><div class="logtext hand">${esc(text)}</div>`); this.ctx.paused = true; }
  showBoard(name, lines, rumours) {
    const r = (rumours || []).slice(0, 5).map((x) => `<div class="row"><div class="name"><small>Day ${x.day}</small>${esc(x.text)}</div></div>`).join('') || '<div class="sub">No news worth chalk.</div>';
    this.openPanel('log', `<button class="btn close" data-close>Close</button><h2>${esc(name)} — ration board</h2><div class="logtext" style="font-family:ui-monospace,monospace">${lines.map(esc).join('\n')}</div><h3>Chalked underneath</h3>${r}`);
  }
  openInspection(patrol) {
    const { inventory, standing } = this.ctx;
    const H = this.ctx.heat, bcfg = H.cfg.bribe || { perStar: 12, maxStars: 3 };
    const stars = H.stars;
    const bribe = Math.max(4, 12 - (7 - standing.shown) * 2) + stars * bcfg.perStar;
    const bribable = stars <= bcfg.maxStars;
    const html = `<h2>Tide Ward inspection</h2><div class="sub">A navy launch bumps alongside. Searchlight in your eyes. "${standing.shown >= 6 ? 'Wrist. Now. Then step back from the locker.' : 'Evening. Wrist, please, and we\'ll have you on your way.'}"</div>
      <div class="tabs"><button class="btn" data-a="comply">Show your wrist and let them search</button><button class="btn" data-a="bribe" ${inventory.has('scrap', bribe) && bribable ? '' : 'disabled'}>${bribable ? `Fold ${bribe} scrap into your palm` : 'Too hot to bribe'}</button><button class="btn" data-a="flee">Open the throttle</button></div><div class="result"></div>`;
    const p = this.openPanel('inspect', html);
    const finish = (lines, outcome) => {
      p.querySelector('.tabs').remove();
      p.querySelector('.result').innerHTML = lines.map((l) => `<p class="logtext">${esc(l)}</p>`).join('') + '<button class="btn big" data-done>Carry on</button>';
      p.querySelector('[data-done]').addEventListener('click', () => { this.close(); patrol.endStop(outcome); });
    };
    p.querySelector('[data-a="comply"]').addEventListener('click', () => { const r = patrol.inspect(); finish(r.lines, r.seized.length ? 'seized' : 'clean'); });
    p.querySelector('[data-a="bribe"]').addEventListener('click', () => {
      const ok = Math.random() < (standing.shown >= 7 ? 0.55 : 0.75);
      if (ok) { inventory.remove('scrap', bribe); this.ctx.heat.bribe(bcfg.maxStars); finish(['The Warden looks at the scrap, then at the dark water, then pockets it. "Didn\'t see you."'], 'bribed'); }
      else { this.ctx.heat.crime('evade_stop', 'Attempted bribe'); const r = patrol.inspect(); finish(['"Put that away before I write it down." They search anyway.', ...r.lines], 'searched'); }
    });
    p.querySelector('[data-a="flee"]').addEventListener('click', () => { this.close(); this.ctx.heat.crime('evade_stop', 'Fled an inspection'); patrol.setState('chase'); this.ctx.boat.vel.addScaledVector(new (this.ctx.boat.pos.constructor)(-Math.sin(this.ctx.boat.heading), 0, -Math.cos(this.ctx.boat.heading)), 6); this.ctx.events.emit('music:moment', 'danger'); });
  }
  showLog(id, log, first) {
    const body = log.form === 'recording'
      ? `<div class="logtext recording"><span class="speaker">${esc(log.speaker || 'Recording')}</span>${log.lines.map((l) => '“' + esc(l) + '”').join('\n\n')}</div>`
      : `<div class="logtext">${esc(log.text)}</div>`;
    this.openPanel('log', `<button class="btn close" data-close>Close</button><h2>${esc(log.title)}</h2><div class="sub">${{ hush: 'From the years of the Hush', rise: 'From the Rise', now: 'Recent' }[log.era] || ''}</div>${body}`);
    if (log.form === 'recording') this.ctx.audio?.speak(this.ctx.player.eye.clone().addScaledVector(this.ctx.player.forward, 0.6).setY(this.ctx.player.eye.y - 1.6), Math.min(12, log.lines.join(' ').length * 0.04), 1);
    this.ctx.paused = true;
    if (first) this.ctx.events.emit('journal:new', id);
  }
  openJournal(tab = 'mind') {
    const { story, data, state } = this.ctx;
    const tabs = { mind: 'On your mind', map: 'Chart', writing: 'Writing', photos: 'Photos', people: 'People', rumours: 'Rumours', bestiary: 'Bestiary', underworld: 'Underworld', help: 'Help' };
    // the Investigation tab appears only once a case has opened (a clue found, or a lair stumbled into)
    const cases = this.ctx.killers?.board?.() || [];
    if (cases.length) { delete tabs.help; tabs.investigation = 'Investigation'; tabs.help = 'Help'; }
    let body = '';
    if (tab === 'mind') {
      const objs = story.objectives();
      const main = objs.filter((o) => !o.side), side = objs.filter((o) => o.side && !o.done);
      const cur = main.filter((o) => !o.done).slice(0, 1).map((o) => `<div class="row"><div class="name hand">${esc(o.text)}</div></div>`).join('') || '<div class="sub">Nothing pressing. The water is patient.</div>';
      const done = main.filter((o) => o.done).map((o) => `<div class="row"><div class="name hand" style="opacity:.5"><s>${esc(o.text)}</s></div></div>`).join('');
      body = `<h3>Teo</h3>${cur}${done}${side.length ? '<h3>Threads</h3>' + side.map((o) => `<div class="row"><div class="name hand">${esc(o.text)}</div></div>`).join('') : ''}
        ${(() => { const Q = data.club?.quest; if (!Q || !story.flag(Q.steps[0].flag)) return ''; const got = Q.steps.filter((st) => story.flag(st.flag)); return `<h3>${esc(Q.name)}</h3>` + got.map((st) => `<div class="row"><div class="name hand">${esc(st.text)}</div></div>`).join('') + (got.length < Q.steps.length ? '<div class="row"><div class="name hand" style="opacity:.5">…</div></div>' : ''); })()}
        <h3>Your notes</h3>${(state.notes || []).map((n) => `<div class="row"><div class="name hand">${esc(n.text)} <small>day ${n.day}</small></div></div>`).join('')}
        <div class="tabs"><input data-note placeholder="Write a note in your own hand…" maxlength="120" style="flex:1;min-width:200px;font:15px Georgia;padding:6px;background:rgba(255,255,255,.06);color:var(--ink);border:1px solid var(--line);pointer-events:auto"><button class="btn" data-addnote>Write</button></div>`;
    } else if (tab === 'map') body = '<canvas class="chart" width="720" height="620"></canvas><div class="sub">Drawn as you go. Explore to fill it in.</div>';
    else if (tab === 'writing') body = [...state.logs].map((id) => `<div class="row"><div class="name">${esc(data.logs.logs[id].title)}</div><button class="btn" data-log="${id}">Read</button></div>`).join('') || '<div class="sub">You have found nothing written down yet.</div>';
    else if (tab === 'photos') { const ph = this.ctx.photo.list(); body = ph.length ? `<div class="photos">${ph.map((p) => `<figure><img src="${p.url}"><figcaption class="hand">Day ${p.day}, ${esc(p.time)} — ${esc(p.where)}</figcaption></figure>`).join('')}</div>` : '<div class="sub">No photographs yet. Press K (or the Photo button) to take one.</div>'; }
    else if (tab === 'people') body = Object.entries(state.met || {}).map(([id, n]) => { const d = data.npcs.npcs.find((x) => x.id === id); return d ? `<div class="row"><div class="name hand">${esc(d.name)}<small>${esc(d.role)} · spoken to ${n}×${d.respect ? ' · treats you as an equal' : ''}</small></div></div>` : ''; }).join('') || '<div class="sub">You have kept to yourself.</div>';
    else if (tab === 'rumours') body = (this.ctx.economy.rumours || []).map((r) => `<div class="row"><div class="name hand">${esc(r.text)}<small>day ${r.day}</small></div></div>`).join('') || '<div class="sub">No rumours yet. Ration boards and Raft Free Voice carry them.</div>';
    else if (tab === 'investigation') {
      // a theory board: clue cards, who you think it is, and (if you saw him) who you tell. No map pin.
      const met = Object.keys(state.met || {}).map((id) => data.npcs.npcs.find((x) => x.id === id)).filter(Boolean);
      body = cases.map((c) => `<div class="board" data-case="${c.id}" style="margin:10px 0 18px;padding:10px;border:1px solid var(--line);background:rgba(60,40,20,.18)">
        <h3 style="margin-top:0">${esc(c.case)}${c.solved ? ' — solved' : ''} <small style="opacity:.6">${c.clues.length} clue${c.clues.length === 1 ? '' : 's'}${c.clues.length < c.need ? `, not enough yet` : ''}</small></h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${c.clues.map((k) => `<div class="hand" style="flex:1 1 210px;max-width:300px;padding:8px;background:#e9dfc6;color:#2a2219;transform:rotate(${((k.id.length * 37) % 7) - 3}deg);box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:13px"><b>${esc(k.title)}</b><br>${esc(k.text)}<br><small>day ${k.day}</small></div>`).join('')}</div>
        ${c.routine ? `<p class="hand" style="margin:10px 0 0">${esc(c.routine)}</p>` : ''}
        ${c.solved ? '' : `<div class="tabs" style="margin-top:10px"><span class="hand">I think it's</span> <select data-sus style="pointer-events:auto;background:#1b1712;color:var(--ink);border:1px solid var(--line);font:14px Georgia"><option value="">— nobody yet —</option>${met.map((n) => `<option value="${n.id}" ${c.theory === n.id ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select><button class="btn" data-pin>Pin it</button></div>`}
        ${c.sawHim && !c.solved ? `<div class="tabs"><span class="hand">You saw him. Tell…</span><button class="btn" data-tell="ward" ${c.told.ward ? 'disabled' : ''}>the Tide Ward</button><button class="btn" data-tell="family" ${c.told.family ? 'disabled' : ''}>a victim's family</button><button class="btn" data-tell="friends" ${c.told.friends ? 'disabled' : ''}>his friends</button></div>` : ''}
        <div class="result hand" style="margin-top:6px"></div></div>`).join('') || '<div class="sub">Nothing here yet.</div>';
    }
    else if (tab === 'underworld') { setTimeout(() => this.ctx.crews?.openBoard(), 0); body = ''; }
    else if (tab === 'bestiary') {
      const sp = data.creatures?.species || {}, cr = this.ctx.creatures;
      body = Object.entries(sp).map(([k, s]) => {
        const n = cr ? cr.known(k) : 0, e = state.bestiary?.[k];
        if (!n) return `<div class="row"><div class="name hand" style="opacity:.45">${s.stub ? '???' : '— unseen —'}<small>${esc(s.habitat || '')}</small></div></div>`;
        return `<div class="row" style="display:block"><div class="name hand">${esc(s.name)}<small>${esc(s.habitat || '')} · ${esc(s.temperament || '')}${e ? ` · seen ${e.seen}× · hurt you ${e.hurt}×` : ''}</small></div>
          ${(s.notes || []).slice(0, n).map((t) => `<p class="hand" style="margin:4px 0 0;opacity:.85">${esc(t)}</p>`).join('')}
          ${n >= 2 && s.signs ? `<p style="margin:6px 0 0;font-size:13px;opacity:.7"><b>Signs:</b> ${s.signs.map(esc).join(' · ')}</p>` : ''}
          ${n >= 3 && s.weak ? `<p style="margin:2px 0 0;font-size:13px;opacity:.7"><b>What works:</b> ${s.weak.map(esc).join(' · ')}</p>` : ''}</div>`;
      }).join('') + `<h3>Wounds</h3><div class="sub">${this.ctx.injury ? this.ctx.injury.describe() : ''}</div>`;
    }
    else body = HELP_HTML;
    this.openPanel('journal', `<button class="btn close" data-close>Close</button><h2>Journal</h2><div class="sub">${esc(this.ctx.life?.s?.name || 'Wren Calloway-Ashe')} · Day ${this.ctx.time.day}, ${this.ctx.time.clockString()} · ${this.ctx.weather.state}</div>
      <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="btn ${k === tab ? 'on' : ''}" data-jt="${k}">${v}</button>`).join('')}</div>${body}`, (p) => {
      p.querySelectorAll('[data-jt]').forEach((b) => b.addEventListener('click', () => this.openJournal(b.dataset.jt)));
      p.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', () => story.openLog(b.dataset.log)));
      const cv = p.querySelector('canvas.chart'); if (cv) this.ctx.journal.drawMap(cv, { cx: Math.max(-300, Math.min(400, this.ctx.player.position.x)), cz: Math.max(-300, Math.min(300, this.ctx.player.position.z)) });
      p.querySelector('[data-addnote]')?.addEventListener('click', () => { const i = p.querySelector('[data-note]'); if (i.value.trim()) { state.notes.push({ text: i.value.trim(), day: this.ctx.time.day }); this.openJournal('mind'); } });
      p.querySelector('[data-note]')?.addEventListener('keydown', (e) => e.stopPropagation());
      p.querySelectorAll('.board').forEach((bd) => {
        const id = bd.dataset.case, out = bd.querySelector('.result');
        bd.querySelector('[data-pin]')?.addEventListener('click', () => { const v = bd.querySelector('[data-sus]').value; if (!v) return; const fits = this.ctx.killers.pin(id, v); out.textContent = fits ? 'The pieces fit. You are sure. Being sure is not proof.' : 'You pin the name up. Some of it fits. Some of it doesn\'t.'; });
        bd.querySelectorAll('[data-tell]').forEach((b) => b.addEventListener('click', () => { out.textContent = this.ctx.killers.tell(id, b.dataset.tell); b.disabled = true; }));
      });
    });
  }
  openPause() {
    const s = this.ctx.settings;
    const html = `<h2>Paused</h2><div class="sub">Drowned Earth — Stage 1: The First Drowned District</div>
      <div class="tabs"><button class="btn" data-close>Resume</button><button class="btn" data-act="inv">Pack</button><button class="btn" data-act="journal">Journal</button><button class="btn" data-act="save">Save</button><button class="btn" data-act="load">Load last save</button><button class="btn" data-act="opts">Options</button><button class="btn" data-act="pad">Controller</button><button class="btn" data-act="craft">Craft</button><button class="btn" data-act="export">Export save</button><button class="btn" data-act="import">Import save</button><button class="btn" data-act="life">A Life on the Water</button><button class="btn" data-act="title">Title screen</button></div>
      <h3>Quality</h3><div class="tabs"><button class="btn ${s.auto ? 'on' : ''}" data-q="auto">Auto</button>${Settings.presets().map((q) => `<button class="btn ${q === s.quality && !s.auto ? 'on' : ''}" data-q="${q}">${Settings.label(q)}</button>`).join('')}</div>
      <h3>Sound</h3><div class="tabs"><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-vol style="width:220px;pointer-events:auto"></div>
      <h3>Options</h3><div class="tabs"><button class="btn ${s.subtitles ? 'on' : ''}" data-opt="subtitles">Subtitles</button><button class="btn ${s.invertY ? 'on' : ''}" data-opt="invertY">Invert look</button></div>
      <h3>Controls</h3>${this.ctx.pad?.device === 'pad' ? this.ctx.pad.layoutHTML() : ''}<div class="sub" style="font-style:normal;line-height:1.7">WASD move · mouse look · Shift sprint · C crouch / swim up · Space jump / dive · E use · F flashlight (lantern on the boat) · V boat camera · R radio · Tab pack · Q craft · J journal · Esc pause.<br>Touch: left stick, drag right side to look, buttons for the rest.</div>`;
    this.openPanel('pause', html, (p) => {
      p.querySelector('[data-act="inv"]').addEventListener('click', () => this.openInventory());
      p.querySelector('[data-act="journal"]').addEventListener('click', () => this.openJournal());
      p.querySelector('[data-act="save"]').addEventListener('click', () => { this.ctx.save.save('manual'); this.toast('Saved.'); });
      p.querySelector('[data-act="opts"]').addEventListener('click', () => this.openOptions());
      p.querySelector('[data-act="pad"]').addEventListener('click', () => this.ctx.pad?.openSettings());
      p.querySelector('[data-act="craft"]').addEventListener('click', () => this.openCraft(null));
      p.querySelector('[data-act="export"]').addEventListener('click', () => { this.ctx.save.save('manual'); const blob = new Blob([localStorage.getItem('drowned-earth.save') || '{}'], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `drowned-earth-day${this.ctx.time.day}.json`; a.click(); });
      p.querySelector('[data-act="import"]').addEventListener('click', () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { const t = await i.files[0].text(); try { JSON.parse(t); localStorage.setItem('drowned-earth.save', t); if (this.ctx.save.load()) { this.close(); this.toast('Save imported.'); } } catch { this.toast('That file is not a Drowned Earth save.'); } }; i.click(); });
      p.querySelector('[data-act="life"]').addEventListener('click', () => { this.ctx.save.save('manual'); this.close(); this.ctx.game.enterLife(); });
      p.querySelector('[data-act="title"]').addEventListener('click', () => { this.ctx.save.save('manual'); this.close(); this.titleScreen(this.ctx.save.has(), this.ctx.game.onTitleChoice); });
      p.querySelector('[data-act="load"]').addEventListener('click', () => { if (this.ctx.save.load()) { this.close(); this.toast('Loaded.'); } });
      p.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { s.set('quality', b.dataset.q); location.reload(); }));
      p.querySelector('[data-vol]').addEventListener('input', (e) => { s.set('volume', parseFloat(e.target.value)); this.ctx.audio?.setVolume(s.volume); });
      p.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => { s.set(b.dataset.opt, !s[b.dataset.opt]); b.classList.toggle('on'); }));
    });
  }
  titleScreen(hasSave, onChoice) {
    this.ctx.game.toTitle();
    const lifeSave = !!this.ctx.save.read()?.life?.alive;
    const t = this.root.appendChild(el('div', 'title'));
    t.innerHTML = `<canvas class="logo" width="900" height="200"></canvas>
      <p>The seas took the coasts. The Hush took the rest. One island stayed dry.</p>
      <div class="menu">
        ${hasSave ? '<button class="btn big" data-c="continue">Continue</button>' : ''}
        <button class="btn big" data-c="story">The Drowned District</button>
        <button class="btn big" data-c="life">${lifeSave ? 'Continue your life' : 'A Life on the Water'}</button>
        <button class="btn big ghostb" data-c="options">Options</button>
      </div>
      <div class="small">Headphones recommended. Desktop: click to look, WASD, E to use. Phone: left stick to move, drag right to look.<br><span class="dim">Stage 1 · Lantern Ward, Orrin Bay · year 41 after the Rise</span></div>`;
    drawLogo(t.querySelector('canvas'));
    const go = (choice) => {
      this.ctx.audio?.start();
      if (choice === 'options') { this.openOptions(true); return; }
      t.style.opacity = 0; setTimeout(() => t.remove(), 1200);
      onChoice(choice);
    };
    t.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => go(b.dataset.c)));
    this.titleEl = t;
  }
  openOptions(fromTitle) {
    const s = this.ctx.settings;
    const row = (label, key, opts) => `<h3>${label}</h3><div class="tabs">${opts.map(([v, n]) => `<button class="btn ${(key === 'quality' ? (s.auto ? 'auto' : s.quality) : String(s[key])) === String(v) ? 'on' : ''}" data-k="${key}" data-v="${v}">${n}</button>`).join('')}</div>`;
    const html = `<button class="btn close" data-close>Close</button><h2>Options</h2><div class="tabs"><button class="btn" data-padset>Controller settings &amp; button map</button></div>
      ${row('Quality (reloads)', 'quality', [['auto', 'Auto'], ['low', 'Light'], ['medium', 'Standard'], ['high', 'Ultra']])}
      ${row('Difficulty', 'difficulty', [['calm', 'Calm — no threats'], ['standard', 'Standard'], ['harsh', 'Harsh — scarce, permanent']])}
      ${row('Text size', 'textSize', [['1', 'Normal'], ['1.2', 'Large'], ['1.4', 'Larger']])}
      ${row('Sound captions', 'captions', [['true', 'On'], ['false', 'Off']])}
      ${row('Subtitles', 'subtitles', [['true', 'On'], ['false', 'Off']])}
      ${row('Reduce motion (no bob, sway or shake)', 'reduceMotion', [['true', 'On'], ['false', 'Off']])}
      ${row('Colour-safe indicators (labels + patterns)', 'colorSafe', [['true', 'On'], ['false', 'Off']])}
      ${row('High-contrast UI', 'highContrast', [['true', 'On'], ['false', 'Off']])}
      ${row('One-handed touch layout', 'oneHand', [['true', 'On'], ['false', 'Off']])}
      ${row('Film grain & lens effects', 'lensFx', [['true', 'On'], ['false', 'Off']])}
      ${row('Motion blur', 'motionBlur', [['false', 'Off'], ['true', 'On']])}
      ${row('NPC life simulation', 'npcSim', [['full', 'Full — incidents play out near you'], ['light', 'Light — resolved off-screen (Phone)']])}
      ${s.ageConfirmed ? row('Mature content (18+: alcohol, gambling, violence, brief artistic nudity)', 'mature', [['false', 'Off — clean versions'], ['true', 'On']]) : '<h3>Mature content</h3><div class="sub">Off. Only available after confirming you are 18 or older at the first-launch gate.</div>'}
      <h3>Sharpness <span class="dim" data-sharpv>${Math.round(s.sharpness * 100)}%</span></h3><input type="range" min="0" max="1" step="0.05" value="${s.sharpness}" data-sharp style="width:240px;pointer-events:auto">${s.q.postPipeline ? '' : '<div class="sub">Sharpen and motion blur need Standard or Ultra quality.</div>'}
      ${row('Music', 'music', [['1', 'On'], ['0.5', 'Quiet'], ['0', 'Off']])}
      ${row('Invert look', 'invertY', [['true', 'On'], ['false', 'Off']])}
      <h3>Volume</h3><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-vol style="width:240px;pointer-events:auto">
      <h3>Controls</h3>${this.ctx.pad?.device === 'pad' ? this.ctx.pad.layoutHTML() : ''}<div class="sub" style="font-style:normal;line-height:1.7">WASD move · mouse look · Shift sprint · C crouch / swim up / cut the boat engine · Space jump / dive · E use · F flashlight (lantern or spotlight on the boat) · V boat camera · R radio · Tab pack · Q craft · J journal & map · K photo mode · \` debug · Esc pause.<br>Touch: left stick, drag right to look, buttons for the rest.</div>`;
    const p = this.openPanel('options', html, (p) => {
      p.querySelector('[data-padset]')?.addEventListener('click', () => this.ctx.pad?.openSettings(fromTitle));
      p.querySelector('[data-sharp]')?.addEventListener('input', (e) => { s.set('sharpness', parseFloat(e.target.value)); p.querySelector('[data-sharpv]').textContent = Math.round(s.sharpness * 100) + '%'; });
      p.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.k; let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true'; else if (!isNaN(+v) && k !== 'quality') v = +v;
        s.set(k, v);
        if (k === 'quality') { location.reload(); return; }
        this.applyAccessibility();
        this.openOptions(fromTitle);
      }));
      p.querySelector('[data-vol]').addEventListener('input', (e) => { s.set('volume', parseFloat(e.target.value)); this.ctx.audio?.setVolume(s.volume); });
    });
    if (fromTitle) this.ctx.paused = false;
    return p;
  }
  applyAccessibility() {
    const s = this.ctx.settings, b = document.body;
    document.documentElement.style.fontSize = `${16 * (s.textSize || 1)}px`;
    document.getElementById('ui').style.zoom = s.textSize && s.textSize !== 1 ? String(s.textSize) : '';
    b.classList.toggle('hc', !!s.highContrast);
    b.classList.toggle('colorsafe', !!s.colorSafe);
    b.classList.toggle('onehand', !!s.oneHand);
  }
  endCard() {
    const e = this.root.appendChild(el('div', 'endcard', `<h2>END OF STAGE ONE</h2><p>Something under Orrin Bay has finished counting. Highmark's lighthouse is dark for the first time in living memory.<br><br>The water is waiting.</p><button class="btn big" style="margin-top:20px;opacity:.8">Keep drifting</button>`));
    requestAnimationFrame(() => e.classList.add('on'));
    e.querySelector('button').addEventListener('click', () => e.remove());
  }
}

// DROWNED EARTH, stencil-cut and water-stained, drawn procedurally.
function drawLogo(c) {
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  let size = 118;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '10px';
  do { g.font = `bold ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`; size -= 4; } while (g.measureText('DROWNED EARTH').width > w - 60 && size > 40);
  const grad = g.createLinearGradient(0, 30, 0, 170);
  grad.addColorStop(0, '#efe9d8'); grad.addColorStop(0.62, '#d9d2bf'); grad.addColorStop(0.63, '#7fa3a6'); grad.addColorStop(1, '#2f5157');
  g.fillStyle = grad;
  g.fillText('DROWNED EARTH', w / 2, h / 2 + 6);
  // stencil bridges
  g.globalCompositeOperation = 'destination-out';
  for (let x = 40; x < w; x += 23 + (x % 7)) g.fillRect(x, 0, 3, h);
  g.fillRect(0, h / 2 + 2, w, 4);
  // water line shimmer
  for (let i = 0; i < 70; i++) { g.fillRect(Math.random() * w, h / 2 + 18 + Math.random() * 45, 8 + Math.random() * 40, 1.5); }
  g.globalCompositeOperation = 'source-over';
  g.letterSpacing = '0px';
}
