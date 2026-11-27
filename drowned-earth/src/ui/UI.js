import { Settings } from '../core/Settings.js';

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
    if (p && !this.open) {
      const key = input.usingTouch ? 'Use' : 'E';
      this.promptEl.innerHTML = `<b>${key}</b>${esc(p)}`;
      this.promptEl.style.opacity = 1; this.dot.classList.add('active');
    } else { this.promptEl.style.opacity = 0; this.dot.classList.remove('active'); }
    this.dot.style.opacity = player.mode === 'boat' && this.ctx.rig.thirdPerson ? 0 : 1;
    // wrist gauge while diving
    const diving = player.headUnder || (player.mode === 'swim' && player.depth > 0.3);
    this.wrist.classList.toggle('on', diving);
    if (diving) {
      this.wrist.querySelector('.depth').textContent = player.depth.toFixed(1);
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
      this.fpsEl.textContent = `${this.ctx.game.fps.toFixed(0)} fps · ${this.ctx.settings.quality} · ${this.ctx.chunks.stats.loaded} chunks · ${this.ctx.time.clockString()} · ${this.ctx.weather.state}`;
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
  showBoard(name, lines, rumours) {
    const r = (rumours || []).slice(0, 5).map((x) => `<div class="row"><div class="name"><small>Day ${x.day}</small>${esc(x.text)}</div></div>`).join('') || '<div class="sub">No news worth chalk.</div>';
    this.openPanel('log', `<button class="btn close" data-close>Close</button><h2>${esc(name)} — ration board</h2><div class="logtext" style="font-family:ui-monospace,monospace">${lines.map(esc).join('\n')}</div><h3>Chalked underneath</h3>${r}`);
  }
  openInspection(patrol) {
    const { inventory, standing } = this.ctx;
    const bribe = Math.max(4, 12 - (7 - standing.shown) * 2);
    const html = `<h2>Tide Ward inspection</h2><div class="sub">A navy launch bumps alongside. Searchlight in your eyes. "${standing.shown >= 6 ? 'Wrist. Now. Then step back from the locker.' : 'Evening. Wrist, please, and we\'ll have you on your way.'}"</div>
      <div class="tabs"><button class="btn" data-a="comply">Show your wrist and let them search</button><button class="btn" data-a="bribe" ${inventory.has('scrap', bribe) ? '' : 'disabled'}>Fold ${bribe} scrap into your palm</button><button class="btn" data-a="flee">Open the throttle</button></div><div class="result"></div>`;
    const p = this.openPanel('inspect', html);
    const finish = (lines, outcome) => {
      p.querySelector('.tabs').remove();
      p.querySelector('.result').innerHTML = lines.map((l) => `<p class="logtext">${esc(l)}</p>`).join('') + '<button class="btn big" data-done>Carry on</button>';
      p.querySelector('[data-done]').addEventListener('click', () => { this.close(); patrol.endStop(outcome); });
    };
    p.querySelector('[data-a="comply"]').addEventListener('click', () => { const r = patrol.inspect(); finish(r.lines, r.seized.length ? 'seized' : 'clean'); });
    p.querySelector('[data-a="bribe"]').addEventListener('click', () => {
      const ok = Math.random() < (standing.shown >= 7 ? 0.55 : 0.75);
      if (ok) { inventory.remove('scrap', bribe); this.ctx.heat.add(4, 'bribe'); finish(['The Warden looks at the scrap, then at the dark water, then pockets it. "Didn\'t see you."'], 'bribed'); }
      else { this.ctx.heat.add(12, 'attempted bribe'); const r = patrol.inspect(); finish(['"Put that away before I write it down." They search anyway.', ...r.lines], 'searched'); }
    });
    p.querySelector('[data-a="flee"]').addEventListener('click', () => { this.close(); this.ctx.heat.add(30, 'fled an inspection'); patrol.setState('chase'); this.ctx.boat.vel.addScaledVector(new (this.ctx.boat.pos.constructor)(-Math.sin(this.ctx.boat.heading), 0, -Math.cos(this.ctx.boat.heading)), 6); this.ctx.events.emit('music:moment', 'danger'); });
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
  openJournal() {
    const { story, data, state } = this.ctx;
    const objs = story.objectives();
    const cur = objs.filter((o) => !o.done).slice(0, 1).map((o) => `<div class="row"><div class="name"><i>${esc(o.text)}</i></div></div>`).join('') || '<div class="sub">Nothing pressing. The water is patient.</div>';
    const done = objs.filter((o) => o.done).map((o) => `<div class="row"><div class="name" style="opacity:.5"><s>${esc(o.text)}</s></div></div>`).join('');
    const logs = [...state.logs].map((id) => `<div class="row"><div class="name">${esc(data.logs.logs[id].title)}</div><button class="btn" data-log="${id}">Read</button></div>`).join('') || '<div class="sub">You have found nothing written down yet.</div>';
    this.openPanel('journal', `<button class="btn close" data-close>Close</button><h2>Journal</h2><div class="sub">Day ${this.ctx.time.day}, ${this.ctx.time.clockString()} · ${this.ctx.weather.state}</div><h3>On your mind</h3>${cur}${done}<h3>Found writing &amp; recordings</h3>${logs}`, (p) => {
      p.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', () => story.openLog(b.dataset.log)));
    });
  }
  openPause() {
    const s = this.ctx.settings;
    const html = `<h2>Paused</h2><div class="sub">Drowned Earth — Stage 1: The First Drowned District</div>
      <div class="tabs"><button class="btn" data-close>Resume</button><button class="btn" data-act="inv">Pack</button><button class="btn" data-act="journal">Journal</button><button class="btn" data-act="save">Save</button><button class="btn" data-act="load">Load last save</button></div>
      <h3>Quality</h3><div class="tabs">${Settings.presets().map((q) => `<button class="btn ${q === s.quality ? 'on' : ''}" data-q="${q}">${q}</button>`).join('')}</div>
      <h3>Sound</h3><div class="tabs"><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-vol style="width:220px;pointer-events:auto"></div>
      <h3>Options</h3><div class="tabs"><button class="btn ${s.subtitles ? 'on' : ''}" data-opt="subtitles">Subtitles</button><button class="btn ${s.invertY ? 'on' : ''}" data-opt="invertY">Invert look</button></div>
      <h3>Controls</h3><div class="sub" style="font-style:normal;line-height:1.7">WASD move · mouse look · Shift sprint · C crouch / swim up · Space jump / dive · E use · F flashlight (lantern on the boat) · V boat camera · R radio · Tab pack · Q craft · J journal · Esc pause.<br>Touch: left stick, drag right side to look, buttons for the rest.</div>`;
    this.openPanel('pause', html, (p) => {
      p.querySelector('[data-act="inv"]').addEventListener('click', () => this.openInventory());
      p.querySelector('[data-act="journal"]').addEventListener('click', () => this.openJournal());
      p.querySelector('[data-act="save"]').addEventListener('click', () => { this.ctx.save.save('manual'); this.toast('Saved.'); });
      p.querySelector('[data-act="load"]').addEventListener('click', () => { if (this.ctx.save.load()) { this.close(); this.toast('Loaded.'); } });
      p.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { s.set('quality', b.dataset.q); location.reload(); }));
      p.querySelector('[data-vol]').addEventListener('input', (e) => { s.set('volume', parseFloat(e.target.value)); this.ctx.audio?.setVolume(s.volume); });
      p.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => { s.set(b.dataset.opt, !s[b.dataset.opt]); b.classList.toggle('on'); }));
    });
  }
  titleScreen(hasSave, onStart) {
    const t = this.root.appendChild(el('div', 'title', `<h1>DROWNED EARTH</h1><p>The seas took the coasts. The Hush took the rest. One island stayed dry.</p>
      ${hasSave ? '<button class="btn big" data-c>Continue</button>' : ''}<button class="btn big" data-n>${hasSave ? 'New game' : 'Begin'}</button>
      <div class="small">Headphones recommended. Desktop: click to look, WASD, E to use. Phone: left stick to move, drag right to look.<br>Quality: <b>${this.ctx.settings.quality}</b> (change in the pause menu)</div>`));
    const go = (cont) => { this.ctx.audio?.start(); t.style.opacity = 0; setTimeout(() => t.remove(), 1500); onStart(cont); };
    t.querySelector('[data-n]').addEventListener('click', () => go(false));
    t.querySelector('[data-c]')?.addEventListener('click', () => go(true));
  }
  endCard() {
    const e = this.root.appendChild(el('div', 'endcard', `<h2>END OF STAGE ONE</h2><p>Something under Orrin Bay has finished counting. Highmark's lighthouse is dark for the first time in living memory.<br><br>The water is waiting.</p><button class="btn big" style="margin-top:20px;opacity:.8">Keep drifting</button>`));
    requestAnimationFrame(() => e.classList.add('on'));
    e.querySelector('button').addEventListener('click', () => e.remove());
  }
}
