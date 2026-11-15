// Hunt Racers: everything a player sees and touches in a race, launched with one call:
//   const race = startRace({ mode, track, driver, room, bots, token, name, onExit });
// It opens its own full-screen layer (canvas + overlays + the creator credit), runs the
// RaceClient, renderer, HUD, controls and sound, shows the pre-race lobby, the countdown and the
// finish screen, and calls onExit({ left }) when the player goes back to the lobby.
import { RaceClient } from './net.js';
import { RaceRenderer } from './render.js';
import { Hud, fmtTime } from './hud.js';
import { Controls } from './controls.js';
import { play, engine, stopEngine } from './sound.js';
import { drawCar } from './cars.js';
import { DRIVERS, driftTier } from './physics.js';
import { RACE_MODES, FLAG } from './protocol.js';
import { ITEM_IDS } from './items.js';
import { trackName } from './tracks.js';
import { SETTINGS } from '../settings.js';
import { icon } from '../ui/icons.js';
import { levelInfo } from '../progression.js';

const CREDIT = 'Created by Sam Eyde III';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const DPR_STEPS = [2, 1.5, 1.25, 1];
const IDLE_VIEW = { tick: 0, time: 0, countdown: 0, cars: [], ents: [], boxesOff: [], hazardsOn: 0, leader: 0, ranks: [], hud: {}, me: null };

function ensureCss() {
  if (document.getElementById('raceCss')) return;
  const l = document.createElement('link'); l.id = 'raceCss'; l.rel = 'stylesheet'; l.href = new URL('./race.css', import.meta.url).href;
  document.head.appendChild(l);
}

let current = null;
export function startRace(opts = {}) {
  if (current) current.destroy();
  current = new RaceSession(opts);
  return current;
}

class RaceSession {
  constructor(o) {
    ensureCss();
    this.o = { mode: 'grand', driver: 'volt', bots: true, name: 'Racer', ...o };
    if (!DRIVERS[this.o.driver]) this.o.driver = 'volt';
    this.dead = false;
    const root = (this.root = document.createElement('div'));
    root.className = 'rc-root';
    root.innerHTML = `<canvas class="rc-cv"></canvas>
      <div class="rc-wait" hidden><div class="rc-wt title">GET READY</div><div class="rc-wm"></div><div class="rc-wl"></div><div class="rc-ws"></div><div class="rc-wr"></div><button class="btn btn-md red rc-cancel">CANCEL</button></div>
      <div class="rc-menu" hidden><div class="rc-mp"><div class="title">PAUSED</div><p>The race keeps going!</p><button class="btn btn-lg rc-resume">RESUME</button><button class="btn btn-md red rc-leave">LEAVE RACE</button></div></div>
      <div class="rc-fail" hidden><div class="rc-mp"><div class="title">OOPS</div><p class="rc-fm"></p><button class="btn btn-md rc-back">BACK TO LOBBY</button></div></div>
      <div class="res rc-res" hidden></div>
      <div class="rc-rotate"><div>↻</div><p>Rotate your phone to landscape</p></div>
      <div class="rc-credit">${CREDIT}</div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    this.$ = $;
    this.cv = $('.rc-cv');
    this.renderer = new RaceRenderer(this.cv);
    this.hud = new Hud();
    this.ctrl = new Controls(this.cv, { onMenu: () => this.toggleMenu() });
    $('.rc-cancel').onclick = () => this.exit();
    $('.rc-resume').onclick = () => this.toggleMenu(false);
    $('.rc-leave').onclick = () => this.exit();
    $('.rc-back').onclick = () => this.exit();
    // safe-area insets for canvas-drawn things (CSS uses env() directly)
    this.sa = document.createElement('div');
    this.sa.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    root.appendChild(this.sa);
    this.dprStep = 0; this.frameAvg = 16.7; this.slowFor = 0; this.fastFor = 0;
    this.perf = new Float32Array(900); this.perfN = 0;
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();
    this.prev = { cd: 99, boostT: 0, spd: 0, air: false, tier: 0, rt: 0 };
    this.wrongFor = 0; this.wrong = false;
    this.startedAt = 0; this.endShown = false; this.endTimer = 0;
    this.connect();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    window.__race = this.testApi();
  }

  testApi() {
    const s = this;
    return {
      session: s, get rc() { return s.rc; }, get phase() { return s.rc?.phase; }, get view() { return s.view; },
      layout: () => ({ W: s.W, H: s.H, btn: s.ctrl.btn, mode: s.ctrl.mode }),
      dev: (k, item) => s.rc?.send({ t: 'dev', k, item }),
      perf: () => s.perfStats(), resetPerf: () => { s.perfN = 0; },
      dpr: () => s.dpr, finishShown: () => s.endShown, log: s.log = [],
      // screenshot / perf runs only: drive along the racing line (the touch tests drive for real)
      auto: (on = true, o = {}) => { s.auto = on ? { i: -1, fire: 0, ...o } : null; },
    };
  }

  connect() {
    const o = this.o;
    const params = { name: o.name, driver: o.driver, token: o.token || '', mode: o.mode, track: o.track && o.track !== 'any' ? o.track : '', bots: o.bots === false || o.bots === 0 ? 0 : 1, room: o.room || '', lobby: o.lobby || '', laps: o.laps || '' };
    const rc = (this.rc = new RaceClient({ base: o.base || location.origin.replace(/^http/, 'ws'), params }));
    rc.on('welcome', () => { this.renderer.setTrack(rc.T); this.idleCam(); this.showWait(); });
    rc.on('lobby', (m) => this.updateWait(m));
    rc.on('start', () => {
      this.$('.rc-wait').hidden = true;
      this.renderer.setTrack(rc.T);
      this.hud = new Hud();
      this.startedAt = performance.now();
      this.best = o.best ?? null;
      try { this.bestSplits = JSON.parse(localStorage.getItem('hunt-race-splits-' + rc.trackKey) || 'null'); } catch { this.bestSplits = null; }
      this.bestLapSeen = rc.mode === 'trial' ? this.bestSplits?.lap || null : null;
    });
    rc.on('end', () => { this.endTimer = 1.6; });
    rc.on('progress', (m) => this.applyProgress(m));
    rc.on('failed', () => this.fail('Lost the connection to the race.'));
    rc.on('retry', (m) => this.fail(m.reason === 'Race full' ? 'That race is full. Try another room code.' : 'That race already started. Try again in a moment.'));
    rc.on('rejoinfail', () => this.fail('Could not get back into the race.'));
    rc.connect().catch(() => this.fail('Could not reach the race server.'));
  }

  // ---------------------------------------------------------------- screens
  showWait() {
    const rc = this.rc, w = this.$('.rc-wait');
    w.hidden = false;
    this.$('.rc-wm').textContent = `${RACE_MODES[rc.mode]?.name || 'Race'} · ${trackName(rc.trackKey, rc.arena) || ''}`;
    this.$('.rc-wr').textContent = rc.room ? `ROOM ${rc.room}` : '';
  }
  updateWait(m) {
    if (this.rc.phase !== 'lobby') return;
    this.$('.rc-wait').hidden = false;
    this.$('.rc-wl').innerHTML = m.players.map(([n, d]) => `<span class="rc-chip" style="--c:${DRIVERS[d]?.color || '#fff'}"><i></i>${esc(n)}</span>`).join('');
    this.$('.rc-ws').textContent = m.startIn != null ? `${m.players.length}/${m.max} racers · starts in ${Math.ceil(m.startIn)}` : !m.bots ? 'Waiting for another racer (bots off)' : `${m.players.length}/${m.max} racers · starting soon`;
  }
  idleCam() { const g = this.rc.T.grid[0]; const c = this.renderer.cam; c.x = g.x; c.y = g.y; c.z = this.renderer.baseZoom(); c.lx = c.ly = 0; c.init = true; }
  toggleMenu(open) {
    const m = this.$('.rc-menu'), show = open ?? m.hidden;
    if (this.rc?.phase !== 'race' && show) return;
    m.hidden = !show;
    this.ctrl.enabled = !show;
    if (show) this.ctrl.reset();
    play('click');
  }
  fail(msg) {
    if (this.dead || this.endShown) return;
    this.$('.rc-fm').textContent = msg;
    this.$('.rc-fail').hidden = false;
    this.$('.rc-wait').hidden = true;
  }
  exit() {
    const left = this.rc && this.rc.phase !== 'end';
    this.destroy();
    this.o.onExit?.({ left });
  }
  again() { const o = this.o; this.destroy(); startRace(o); }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    try { if (this.rc && this.rc.phase !== 'idle') this.rc.leave(); } catch {}
    this.ctrl.destroy();
    removeEventListener('resize', this.onResize);
    stopEngine();
    this.root.remove();
    if (current === this) current = null;
  }

  // ---------------------------------------------------------------- finish screen (mirrors ui/flow.js results)
  showEnd() {
    const rc = this.rc, m = rc.results, el = this.$('.rc-res');
    this.endShown = true;
    this.$('.rc-menu').hidden = true;
    const me = m.results.find((r) => r[0] === m.you) || [];
    const battle = m.mode === 'battle', out = rc.me?.out;
    const head = battle ? `#${m.rank}` : m.rank === 1 ? '1ST!' : ORD(m.rank).toUpperCase();
    const msg = battle ? (m.rank === 1 ? 'Top of the arena!' : `${m.k} takedowns`) : m.rank === 1 ? 'You won the race!' : out ? `Knocked out in ${ORD(out)}` : me[9] ? `Finished ${ORD(m.rank)} · ${fmtTime(m.time)}` : `${ORD(m.rank)} place`;
    const rows = m.results.map((r) => {
      const right = battle ? `${r[5]} KO` : r[9] ? fmtTime(r[4]) : m.mode === 'elim' ? 'out' : 'DNF';
      return `<li class="${r[0] === m.you ? 'me' : ''}"><span class="r">${r[3]}</span><i class="rc-dot" style="background:${DRIVERS[r[2]]?.color || '#fff'}"></i>${esc(r[1])}<span class="k">${right}</span></li>`;
    }).join('');
    el.innerHTML = `<div class="left"><div class="title rank slam">${head}</div><canvas class="posecv"></canvas></div>
      <div class="right"><div class="rmsg">${esc(msg)} <small>${esc(trackName(m.track, rc.arena) || '')}</small></div>
        <div class="gain"><span class="cur">${icon('trophy')}<b class="rc-tro">…</b></span><span class="cur">${icon('coin')}<b>${m.mc}</b><small>COINS</small></span><span class="cur">${icon('skull')}<b>${m.k}</b><small>KO</small></span>${m.bestLap ? `<span class="cur">⏱<b>${fmtTime(m.bestLap)}</b><small>BEST LAP</small></span>` : ''}</div>
        <div class="xp">LV <b class="rc-lv">-</b><div class="bar shine"><i class="rc-xp" style="width:0%"></i></div><span class="rc-xpn"></span></div><div class="rc-ups"></div>
        <ol class="rlist rc-list">${rows}</ol>
        <div class="btns"><button class="btn btn-md alt rc-lobby">LOBBY</button><button class="btn btn-lg again rc-again">RACE AGAIN</button></div></div>`;
    el.hidden = false; el.classList.add('ui-screen', 'enter');
    el.querySelector('.rc-lobby').onclick = () => this.exit();
    el.querySelector('.rc-again').onclick = () => this.again();
    if (!rc.progress) el.querySelector('.rc-tro').textContent = this.o.token ? '…' : '+0';
    // the car on the podium
    const cv = el.querySelector('.posecv'), r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
    const g = cv.getContext('2d'), s = Math.min(r.width, r.height) / 70;
    g.setTransform(d * s, 0, 0, d * s, (r.width * d) / 2, (r.height * d) / 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(4, 6, 30, 20, -0.5, 0, 7); g.fill();
    g.rotate(-0.5); drawCar(g, rc.myDriver());
    play(m.rank === 1 ? 'finish' : 'lap');
    if (rc.progress) this.applyProgress(rc.progress);
  }
  applyProgress(m) {
    if (!this.endShown) return; // shown with the finish screen
    const el = this.$('.rc-res');
    const tro = el.querySelector('.rc-tro'); if (tro) tro.textContent = (m.delta >= 0 ? '+' : '') + m.delta;
    if (!m.progress) return;
    const L = levelInfo(m.progress.xp);
    el.querySelector('.rc-lv').textContent = L.level;
    el.querySelector('.rc-xpn').textContent = `+${m.xp} XP`;
    requestAnimationFrame(() => { const b = el.querySelector('.rc-xp'); if (b) { b.style.transition = 'width 1.2s cubic-bezier(.2,.8,.3,1)'; b.style.width = `${Math.round((L.into / L.need) * 100)}%`; } });
    const ups = [];
    for (const r of m.levels || []) ups.push(`LEVEL ${r.level}! +${r.coins} coins`);
    if (m.coins) ups.push(`+${m.coins} coins`);
    if (m.improved && m.best) ups.push(`NEW BEST ${fmtTime(m.best)}`);
    el.querySelector('.rc-ups').textContent = ups.join(' · ');
  }

  // ---------------------------------------------------------------- frame
  resize() {
    const cs = getComputedStyle(this.sa), n = (v) => parseFloat(v) || 0;
    this.SA = { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
    this.W = innerWidth; this.H = innerHeight;
    this.dpr = SETTINGS.lowGfx ? 1 : Math.min(DPR_STEPS[this.dprStep], devicePixelRatio || 1);
    this.renderer.resize(this.W, this.H, this.dpr);
    this.ctrl.layout(this.W, this.H, this.SA);
  }
  // render at a lower pixel ratio when frames get slow, back up when there is room
  adapt(ms) {
    this.frameAvg += (ms - this.frameAvg) * 0.05;
    if (this.frameAvg > 18.5) { this.slowFor += ms; this.fastFor = 0; } else if (this.frameAvg < 13) { this.fastFor += ms; this.slowFor = 0; } else this.slowFor = this.fastFor = 0;
    const eff = (k) => (SETTINGS.lowGfx ? 1 : Math.min(DPR_STEPS[k], devicePixelRatio || 1));
    if (this.slowFor > 1500 && this.dprStep < DPR_STEPS.length - 1) {
      this.slowFor = 0;
      while (this.dprStep < DPR_STEPS.length - 1 && eff(this.dprStep + 1) >= this.dpr - 0.01) this.dprStep++; // steps above the screen's ratio change nothing
      if (this.dprStep < DPR_STEPS.length - 1) { this.dprStep++; this.resize(); }
    } else if (this.fastFor > 8000 && this.dprStep > 0 && eff(this.dprStep - 1) > this.dpr + 0.01) { this.dprStep--; this.fastFor = 0; this.resize(); }
  }
  perfStats() {
    const n = Math.min(this.perfN, this.perf.length), a = Array.from(this.perf.subarray(0, n)).sort((x, y) => x - y);
    const q = (f) => a[Math.min(n - 1, Math.floor(n * f))] || 0;
    return { frames: n, medianMs: q(0.5), p95Ms: q(0.95), medianFps: n ? 1000 / q(0.5) : 0, dpr: this.dpr, cars: this.view ? this.view.cars.length : 0 };
  }

  frame(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const ms = now - this.last, dt = Math.min(0.1, ms / 1000);
    this.last = now;
    try { this.step(now, dt, ms); } catch (e) { console.warn('race frame error', e); }
  }
  step(now, dt, ms) {
    const rc = this.rc, R = this.renderer;
    if (!rc || !rc.T || !R.T) return;
    if (rc.phase === 'race' || rc.phase === 'end') {
      this.perf[this.perfN++ % this.perf.length] = ms;
      this.adapt(ms);
      const inp = this.auto ? this.autopilot(dt) : this.ctrl.poll(dt);
      rc.setInput(inp);
      if (this.ctrl.takeFire()) rc.fire();
      if (this.ctrl.takeItem()) rc.useItem();
      rc.frame(now);
      const v = rc.view(now);
      if (!v) return;
      this.view = v;
      const evs = rc.drainEvents();
      for (let i = 0; i < evs.length; i++) this.onEvent(evs[i], v);
      this.local(v, dt);
      R.draw(v, rc, dt, now);
      this.hud.draw(R.g, { W: this.W, H: this.H, SA: this.SA, dpr: this.dpr, view: v, me: v.me, rc, ctrl: this.ctrl, dt, t: R.t, mode: rc.mode, art: R.art, renderer: R, wrong: this.wrong, bestTime: this.best });
      if (this.endTimer > 0 && (this.endTimer -= dt) <= 0 && !this.endShown) this.showEnd();
    } else {
      // pre-race: the track behind the lobby card (also warms the chunk cache around the grid)
      R.draw(IDLE_VIEW, rc, dt, now);
    }
  }

  // own-car cues: countdown beeps, pads, walls, landings, drift tiers, wrong way, engine
  local(v, dt) {
    const rc = this.rc, p = this.prev, me = v.me, car = rc.car;
    const cd = v.countdown > 0 ? Math.ceil(v.countdown) : 0;
    if (cd !== p.cd) { if (cd > 0) play('count'); else if (p.cd > 0) { play('go'); this.hud.banner('GO!', '', '#5ef2c6', 0.01); } p.cd = cd; }
    const mine = v.cars.find((c) => c.me);
    const alive = mine && !(mine.f & FLAG.DEAD) && !(me && me.out);
    if (car && mine && mine.predicted) {
      if (car.boostT > p.boostT + 0.3 && !this.mtNow) play('pad', 0.8);
      const spd = Math.hypot(car.vx, car.vy);
      if (p.spd - spd > 260 && !(mine.f & FLAG.AIR)) { play('wall', Math.min(1, (p.spd - spd) / 600)); this.renderer.shake(Math.min(0.45, (p.spd - spd) / 1400)); }
      const air = car.airT > 0;
      if (p.air && !air) play('land', 0.8);
      const tier = car.drift ? driftTier(car.dc) : 0;
      if (tier > p.tier) play('tier', 0.7);
      p.tier = tier; p.air = air; p.spd = spd; p.boostT = car.boostT;
      // WRONG WAY: driving against the road direction for a moment (tracks only)
      const T = rc.T;
      if (T.kind === 'track' && car.pc >= 0 && spd > 150 && v.countdown <= 0) {
        const c = T.corridors[car.pc]; let lo = 0, hi = c.segs - 1; const s = car.ps;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.s[m] <= s) lo = m; else hi = m - 1; }
        const dot = (car.vx * c.tx[lo] + car.vy * c.ty[lo]) / spd;
        this.wrongFor = dot < -0.45 ? this.wrongFor + dt : Math.max(0, this.wrongFor - dt * 3);
      } else this.wrongFor = Math.max(0, this.wrongFor - dt * 3);
      this.wrong = this.wrongFor > 1;
    } else this.wrong = false;
    this.mtNow = false;
    const top = DRIVERS[rc.myDriver()]?.top || 800;
    engine(mine ? mine.spd / top : 0, car && car.drift ? 1 : 0, p.tier, mine && mine.f & FLAG.BOOST ? 1 : 0, !!alive && rc.phase === 'race' && !this.endShown);
  }

  autopilot(dt) {
    const rc = this.rc, car = rc.car, A = this.auto, out = (A.out ||= { st: 0, th: 1, dr: 0 });
    if (!car || !rc.T.corridors.length) { out.st = 0; return out; }
    const c = rc.T.corridors[0], L = c.line || { x: c.px, y: c.py }, n = c.n;
    let best = Infinity, bi = A.i;
    const from = A.i < 0 ? 0 : A.i - 6, to = A.i < 0 ? n : A.i + 12;
    for (let k = from; k < to; k++) { const i = ((k % n) + n) % n, d = (L.x[i] - car.x) ** 2 + (L.y[i] - car.y) ** 2; if (d < best) { best = d; bi = i; } }
    A.i = bi;
    const spd = Math.hypot(car.vx, car.vy), j = (bi + 4 + Math.round(spd / 140)) % n;
    let da = Math.atan2(L.y[j] - car.y, L.x[j] - car.x) - car.a;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    out.st = Math.max(-1, Math.min(1, da * 2.6)); out.th = Math.abs(da) > 1.2 && spd > 500 ? -0.4 : 1;
    out.dr = A.drift !== false && Math.abs(da) > 0.32 && spd > 420 ? 1 : car.drift && Math.abs(da) > 0.12 ? 1 : 0;
    if (A.fire && (A.fire -= dt) <= 0) { A.fire = A.every || 1.5; rc.fire(); if (rc.me && rc.me.it >= 0) rc.useItem(); }
    return out;
  }
  name(id) { return this.rc.roster.get(id)?.name || 'Racer'; }
  onEvent(e, v) {
    const rc = this.rc, meId = rc.id, R = this.renderer, H = this.hud;
    R.fx(e, v, meId);
    this.log.push(e[0] === 'ko' || e[0] === 'rs' ? [e[0], e[1], performance.now()] : [e[0], e[1]]);
    if (this.log.length > 400) this.log.splice(0, 200);
    const fall = (id) => { const c = R.carAt(v, id), m = R.meCar; if (!c || !m) return 0.3; return Math.max(0, 1 - Math.hypot(c.x - m.x, c.y - m.y) / 1300); };
    switch (e[0]) {
      case 'ko': {
        if (e[1] === meId) play('wreck'); else play('boom', fall(e[1]));
        if (e[2] === meId && e[1] !== meId) { H.banner('TAKEDOWN!', this.name(e[1]), '#ff9f43', 1.4); }
        H.log(e[2] && e[2] !== e[1] ? `${this.name(e[2])} wrecked ${this.name(e[1])}` : `${this.name(e[1])} wrecked`, e[1] === meId || e[2] === meId ? '#ffd23f' : '#ffffff');
        break;
      }
      case 'rs': if (e[1] === meId) play('respawn'); break;
      case 'hit': if (e[1] === meId) play('hit'); else if (e[2] === meId) play('hit', 0.5); break;
      case 'shield': play('shieldpop', fall(e[1])); break;
      case 'steal':
        if (e[1] === meId) { H.banner('BOUNTY STOLEN!', `+${e[3]} coins and a boost`, '#ffd23f', 2); play('steal'); }
        else if (e[2] === meId) { H.banner('BOUNTY LOST', `${this.name(e[1])} took ${e[3]} coins`, '#ff5f5f', 2); play('out'); }
        else H.log(`${this.name(e[1])} stole the bounty`, '#ffd23f');
        break;
      case 'box': if (e[1] === meId) { play('box'); if (e[3] >= 0) { H.roll = 0.55; play('roll'); } } break;
      case 'use': { const it = ITEM_IDS[e[2]]; play(it === 'rockets' ? 'rockets' : it, e[1] === meId ? 1 : fall(e[1])); break; }
      case 'emp': play('emp', fall(e[1]) + 0.2); break;
      case 'spin': if (e[1] === meId) { play('spin'); H.banner('SPUN OUT!', '', '#c9b8ff', 1); } break;
      case 'arc': play('arc', e[1] === meId ? 1 : fall(e[1])); break;
      case 'pulse': play('pulse', e[1] === meId ? 1 : fall(e[1])); break;
      case 'rail': play('rail', e[1] === meId ? 1 : fall(e[1])); break;
      case 'blink': play('blink', e[1] === meId ? 1 : fall(e[1])); break;
      case 'boom': play('boom', 0.6); break;
      case 'jump': if (e[1] === meId) play('jump'); break;
      case 'mt': if (e[1] === meId) { play('mt' + Math.min(3, Math.max(1, e[2]))); this.mtNow = true; } break;
      case 'bump': if (e[1] === meId || e[2] === meId) play('bump', Math.min(1, e[3] / 700)); break;
      case 'lap': {
        if (e[1] !== meId) break;
        const n = e[2], laps = v.hud?.laps || 0;
        if (e[3] != null) this.lapSplit(e[3]);
        if (laps && n > 1 && n <= laps) { H.banner(n === laps ? 'FINAL LAP!' : `LAP ${n}`, '', n === laps ? '#ff9f43' : '#ffffff', 1.6); play(n === laps ? 'final' : 'lap'); }
        break;
      }
      case 'fin':
        if (e[1] === meId) { H.banner('FINISH!', `${ORD(e[2])} · ${fmtTime(e[3])}`, '#ffd23f', 3); play('finish'); }
        else H.log(`${this.name(e[1])} finished ${ORD(e[2])}`, '#c9b8ff');
        break;
      case 'elim':
        if (e[1] === meId) { H.banner('KNOCKED OUT', `${ORD(e[2])} place`, '#ff5f5f', 3); play('out'); }
        else H.log(`${this.name(e[1])} knocked out`, '#ff9f43');
        break;
    }
  }
  // lap / Time Trial split vs the best lap
  lapSplit(lapTime) {
    const best = this.rc.me?.bl, prev = this.bestLapSeen;
    if (prev && lapTime) {
      const d = lapTime - prev;
      this.hud.split = { text: `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}  ${fmtTime(lapTime)}`, col: d <= 0 ? '#5ef2c6' : '#ff7a7a', t: 0 };
    } else if (lapTime) this.hud.split = { text: `LAP ${fmtTime(lapTime)}`, col: '#ffffff', t: 0 };
    this.bestLapSeen = Math.min(prev || Infinity, lapTime || Infinity, best || Infinity);
    if (this.rc.mode === 'trial') try { localStorage.setItem('hunt-race-splits-' + this.rc.trackKey, JSON.stringify({ lap: this.bestLapSeen })); } catch {}
  }
}
