// Heat: the Tide Ward's interest in you, 0..100, shown as 0–5 stars.
// Crimes add to it (data/boats.json heat.crimes); being seen by the Ward holds
// it; once you've been out of sight long enough for your star level it drains.
// Each star brings a bigger response (crime/Ward.js): a warning boat,
// searchlight patrols, boarding crews, a blockade, a drone hunt.
// Ways out: hide (under bridges, inside, in fog), dive, swap hulls unseen,
// bribe a stop (up to 3 stars), or lie low in a safehouse.
export class Heat {
  constructor(ctx) {
    this.ctx = ctx; this.value = 0; this.log = []; this.unseen = 0; this.peak = 0;
    this.cfg = ctx.data.boats?.heat || { stars: [10, 28, 46, 66, 85], cool: [10, 14, 20, 26, 34], drain: 3.5, crimes: {}, response: [] };
    this.buildHud();
  }
  get stars() { let s = 0; for (const t of this.cfg.stars) if (this.value >= t) s++; return s; }
  get hunted() { return this.stars >= 3; }
  add(v, why) {
    if (this.ctx.settings.difficulty === 'calm' && v > 0) v *= 0.4;
    const before = this.stars;
    this.value = Math.max(0, Math.min(100, this.value + v));
    if (why) { this.log.unshift(why); this.log.length = Math.min(this.log.length, 6); }
    if (v > 0) this.unseen = 0;
    const now = this.stars;
    if (now > before) { this.flash = 1.5; const r = this.cfg.response[now - 1]; if (r) this.ctx.ui.toast(`Heat ${'★'.repeat(now)} — ${r.label}`); this.ctx.events.emit('heat:star', now); if (now >= 3) this.ctx.events.emit('fame', { kind: 'villain', text: `The Ward put ${now} stars on a boat nobody can describe.` }); }
    if (now < before && now === 0) this.ctx.events.emit('heat:lost');
    this.peak = Math.max(this.peak, now);
    this.ctx.events.emit('heat', this.value);
  }
  crime(id, why) { const v = this.cfg.crimes[id] ?? 10; this.add(v, why || id); this.ctx.events.emit('crime', { id, why }); }
  clear(reason) { const had = this.stars; this.value = 0; this.unseen = 0; this.ctx.events.emit('heat:lost', reason); if (had >= 2) this.ctx.events.emit('fame', { kind: 'ghost', text: 'The Ward lost a boat tonight. Searchlights swept the channel till dawn and found nothing.' }); }
  bribe(stars) { // pay off a stop: drop up to N stars
    const t = this.cfg.stars;
    const target = Math.max(0, this.stars - stars);
    this.value = target === 0 ? 0 : t[target - 1] + 1;
  }
  update(dt) {
    const seen = this.ctx.ward?.seen || this.ctx.patrol?.state === 'chase';
    if (seen) this.unseen = 0; else this.unseen += dt;
    const s = this.stars;
    if (this.value > 0 && !seen) {
      const wait = s ? this.cfg.cool[s - 1] : 4;
      if (this.unseen > wait) this.add(-dt * this.cfg.drain * (this.ctx.atmosphere.underwater ? 1.6 : 1), null);
    }
    this.updateHud(dt, seen);
  }
  // ---- HUD: stars under the compass; they pulse while you're seen, dim while they search
  buildHud() {
    const el = document.createElement('div');
    el.className = 'heat-hud';
    el.innerHTML = '<div class="stars"></div><div class="lbl"></div>';
    document.body.appendChild(el);
    const st = document.createElement('style');
    st.textContent = `.heat-hud{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:20;pointer-events:none;text-align:center;font:12px ui-monospace,monospace;color:#f2e6d0;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .4s}
      .heat-hud .stars{font-size:26px;letter-spacing:4px}.heat-hud .stars b{color:#ffcf4a}.heat-hud .stars i{font-style:normal;color:rgba(255,255,255,.22)}
      .heat-hud.seen .stars b{color:#ff5a3c;text-shadow:0 0 10px #ff3a1a}.heat-hud.search .stars b{color:#ffcf4a;opacity:.55}`;
    document.head.appendChild(st);
    this.hud = el; this.hudStars = el.querySelector('.stars'); this.hudLbl = el.querySelector('.lbl');
  }
  updateHud(dt, seen) {
    const s = this.stars;
    this.hud.style.opacity = this.value > 0.5 && this.ctx.mode === 'play' ? 1 : 0;
    const key = s + (seen ? 's' : 'u') + Math.floor(this.unseen);
    if (key === this.hudKey) return; this.hudKey = key;
    this.hudStars.innerHTML = [0, 1, 2, 3, 4].map((i) => (i < s ? '<b>★</b>' : '<i>★</i>')).join('');
    this.hud.classList.toggle('seen', !!seen); this.hud.classList.toggle('search', !seen && s > 0);
    const r = this.cfg.response[s - 1];
    this.hudLbl.textContent = !s ? '' : seen ? (r?.label || '') : `searching · ${Math.max(0, Math.ceil(this.cfg.cool[s - 1] - this.unseen))}s`;
  }
  toJSON() { return { value: this.value, peak: this.peak }; }
  load(o) { this.value = o?.value || 0; this.peak = o?.peak || 0; }
}
