// Oblivion GP: everything a player sees and touches in a race, launched with one call:
//   const race = startRace({ mode, track, driver, room, bots, token, name, onExit });
// It opens its own full-screen layer (canvas + overlays + the creator credit), runs the
// RaceClient, renderer, HUD, controls and sound, shows the pre-race lobby, the countdown and the
// finish screen, and calls onExit({ left }) when the player goes back to the lobby.
import { RaceClient } from './net.js';
import { RaceRenderer } from './render.js';
import { Hud, fmtTime } from './hud.js';
import { Controls } from './controls.js';
import { play, engine, stopEngine } from './sound.js';
import { DRIVERS, driftTier } from './physics.js';
import { BASE_LOOKS, carName, isNewCar } from './looks2.js'; // (every car: the six starters + the 8 unlockable ones)
import { engine2, stopEngine2 } from './sound2.js';
import { RACE_MODES, FLAG, EMOTES } from './protocol.js';
import { ElimFx } from './elim.js';
import { ITEM_IDS, itemLabel } from './items.js';
import { combatBus, HIT_STOP, HIT_STOP_BIG } from './weapons-fx.js';
import { trackName } from './tracks.js';
import { SETTINGS, setSetting } from '../settings.js';
import { Tutorial, flag, setFlag, evRow, tutStep, TUT_FLAG, STEER_FLAG } from './tutorial.js';
import { mountHorn, hornEvent } from './horn.js';
import { wordmarkSvg } from '../brand/wordmark.js';
import { inviteText } from '../brand/name.js';
import { CAM_MODES, CAM_NAMES, camMode, stickToWorld, worldToStick, skyGap } from './camera.js';
import { SpeedFx, drawHood } from './speedfx.js';
import { haptic, hapticsOff } from './haptics.js';
import { startRaceMusic, stopRaceMusic, setMusicIntensity, duckRaceMusic, raceMusicState } from './audio-mix.js';
import { Moments, passBys, revCurve } from './moments.js';
import { engineOn } from './sound.js';
import { THEMES } from './trackart.js';
import { WaitFx } from './waitfx.js';
import { loadSpaceFonts } from '../ui/space/fonts.js';
import { showResults, resultsProgress } from './results.js';

const CREDIT = 'Made by Gleyde Technologies';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const DPR_STEPS = [2, 1.5, 1.25, 1];
// shown on the pre-race card while you wait
export const RACE_TIPS = [
  'Hold DRIFT through a bend: blue, then orange, then purple sparks. Let go for a turbo.',
  'The leader glows gold. Wreck them to steal their coins and get a boost.',
  'Further back = better items. A bad start is not the end.',
  'Ramps launch you into the air. Nothing on the ground can hit you mid-air.',
  'Shortcuts are narrow. Some only work with a boost.',
  'Wrecked? You are back on track in 2 seconds, laps kept.',
  'FIRE is your car\'s own weapon. It recharges; use it often.',
  'A shield blocks one hit. Save it for when someone is right behind you.',
  'Hug the inside of a bend and hold DRIFT: the tightest line is the fastest.',
];
const HORIZON = { desert: 'rgba(255,122,90,0.45)', frozen: 'rgba(127,216,255,0.4)', ashlands: 'rgba(255,106,26,0.5)', city: 'rgba(255,63,164,0.45)' }; // camera views: the far glow
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
    ensureCss(); loadSpaceFonts();
    this.o = { mode: 'grand', driver: 'volt', bots: true, name: 'Racer', ...o };
    if (!DRIVERS[this.o.driver]) this.o.driver = 'volt';
    this.dead = false;
    const root = (this.root = document.createElement('div'));
    root.className = 'rc-root' + (SETTINGS.lowGfx ? ' rc-low' : '') + (SETTINGS.reduceFlash ? ' rc-calm' : '');
    root.innerHTML = `<div class="rc-world"><canvas class="rc-cv"></canvas></div><div class="rc-fog"></div><canvas class="rc-hud"></canvas>
      <div class="rc-wait" hidden><canvas class="rc-wfx" aria-hidden="true"></canvas><div class="rc-brand">${wordmarkSvg({ id: 'rcwm' })}</div><div class="rc-wt">GET READY</div><div class="rc-wm"></div><div class="rc-slots" aria-hidden="true"></div><div class="rc-wl"></div><div class="rc-wrow"><div class="rc-cd" hidden><b></b><small>START</small></div><div class="rc-ws"></div></div><div class="rc-tip"></div>
        <div class="card-a rc-room" hidden><small>ROOM CODE</small><div class="mmcode"><b class="rc-code"></b><button class="btn btn-sm alt rc-copy">COPY</button></div>
          <ol class="mmlist rc-list"></ol><div class="mmhost rc-host" hidden><button type="button" class="fillbots rc-bots" role="switch" aria-checked="true"><span class="cb"></span> FILL WITH BOTS</button><button class="btn btn-md rc-start" data-sfx="play">START</button></div>
          <div class="mmwait rc-hw"></div></div>
        <button class="rc-cancel">CANCEL</button></div>
      <div class="rc-toast" hidden></div>
      <div class="rc-menu" hidden><div class="rc-mp"><div class="title">PAUSED</div><p>The race keeps going!</p><button class="btn btn-lg rc-resume">RESUME</button><button class="btn btn-md alt rc-cam"></button><button class="btn btn-md red rc-leave">LEAVE RACE</button></div></div>
      <div class="rc-fail" hidden><div class="rc-mp"><div class="title">OOPS</div><p class="rc-fm"></p><button class="btn btn-md rc-back">BACK TO LOBBY</button></div></div>
      <div class="res rc-res" hidden></div>
      <div class="rc-rotate"><div>↻</div><p>Rotate your phone to landscape</p></div>
      <div class="rc-credit">${CREDIT}</div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    this.$ = $;
    this.wfx = new WaitFx($('.rc-wfx'), { low: !!SETTINGS.lowGfx, calm: !!SETTINGS.reduceFlash }); this.$$ = (s) => root.querySelectorAll(s);
    this.cv = $('.rc-cv');
    // the HUD, minimap, joystick and buttons live on their own canvas over the (tilted) world
    this.hcv = $('.rc-hud'); this.hg = this.hcv.getContext('2d'); this.fog = $('.rc-fog');
    this.renderer = new RaceRenderer(this.cv);
    this.speed = this.renderer.sfx = new SpeedFx();
    this.mom = new Moments({ record: !SETTINGS.lowGfx }); // (Low Graphics: no replay recording)
    this.hud = new Hud();
    this.ctrl = new Controls(this.hcv, { onMenu: () => this.toggleMenu() });
    // a rotating camera: the stick's screen direction -> world heading (camera.js)
    this.ctrl.toWorld = (sa) => stickToWorld(sa, this.renderer.cfg, this.renderer.cm.h);
    this.camName = camMode(SETTINGS.raceView);
    $('.rc-cam').onclick = () => { const i = CAM_MODES.indexOf(this.camName); this.setCam(CAM_MODES[(i + 1) % CAM_MODES.length], true); play('click'); };
    this.seen = new Map(); this.pb = []; this.sp = { W: 0, H: 0, x: 0, y: 0, fx: 0, fy: -1, far: 0, world: 'desert' };
    this.horn = mountHorn(this);
    $('.rc-cancel').onclick = () => this.exit();
    // tutorial: SKIP is always on screen; LET'S RACE goes on to the race the player picked
    this.tut = this.o.tutorial ? new Tutorial(root, {
      next: !!this.o.next, onSkip: () => this.finishTut(true), onGo: () => this.finishTut(false),
      onStep: (step, last) => { play('tut'); this.hud.banner(last ? 'GREAT!' : 'NICE!', '', '#5ef2c6', 1.1); },
      onReady: () => { this.ctrl.enabled = false; this.ctrl.reset(); play('finish'); },
    }) : null;
    // first races: SLIDE TO STEER until the player has steered for a moment
    this.hintOn = !flag(STEER_FLAG); this.hintA = this.hintOn ? 1 : 0; this.steerT = 0;
    this.resetOk = false; this.resetCd = 0; this.stuck = 0;
    $('.rc-resume').onclick = () => this.toggleMenu(false);
    $('.rc-leave').onclick = () => this.exit();
    $('.rc-back').onclick = () => this.exit();
    // friend room: COPY the invite, and the host's START / FILL WITH BOTS
    $('.rc-copy').onclick = () => this.copyRoom();
    $('.rc-start').onclick = () => { this.rc?.host({ start: 1 }); play('click'); };
    $('.rc-bots').onclick = () => { const on = !(this.rc?.lobby?.bots); this.rc?.host({ bots: on }); this.o.onBots?.(on); play('click'); };
    // safe-area insets for canvas-drawn things (CSS uses env() directly)
    this.sa = document.createElement('div');
    this.sa.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    root.appendChild(this.sa);
    this.dprStep = 0; this.frameAvg = 16.7; this.slowFor = 0; this.fastFor = 0;
    this.perf = new Float32Array(900); this.perfN = 0;
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();
    this.prev = { cd: 99, boostT: 0, spd: 0, air: false, tier: 0, rt: 0, drift: 0, hot: 0 };
    this.wrongFor = 0; this.wrong = false;
    this.stopT = 0; this.stopView = null; // hit-stop
    this.startedAt = 0; this.endShown = false; this.endAt = 0;
    this.connect();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    window.__race = this.testApi();
  }

  testApi() {
    const s = this;
    return {
      session: s, get rc() { return s.rc; }, get phase() { return s.rc?.phase; }, get view() { return s.view; },
      layout: () => ({ W: s.W, H: s.H, btn: s.ctrl.btn, mode: s.ctrl.mode, gauge: s.hud.gauge || null, stick: { cx: s.ctrl.stick.cx, cy: s.ctrl.stick.cy, r: s.ctrl.stick.r } }),
      // what the controls hand to RaceClient.setInput this frame, and the tutorial / hint state
      // (out: the last frame's; the rest: the fingers right now)
      input: () => { const c = s.ctrl, k = c.stick; return { out: { ...c.out }, stickHeld: k.id != null, ha: k.ha, hm: k.hm, fire: c.btn.fire.down, drift: c.btn.drift.down }; },
      tut: () => s.tut && s.tut.state(),
      hintOn: () => s.hintA > 0,
      // where your car is drawn on screen (CSS px), for the camera safe-box test
      carOnScreen: () => { const R = s.renderer, c = R.meCar; if (!c || !R.M) return null; const p = R.toScreen(c.x, c.y, {}); return { x: p.x, y: p.y, f: c.f, W: R.W, H: R.H }; },
      // the camera: mode, heading, lean / kick / zoom state, the CSS tilt; set it like the Settings row
      camera: () => { const R = s.renderer; return { mode: R.camName, rotate: R.cfg.rotate, h: R.cm.h, sw: R.cm.sw, kick: R.cm.kick, zk: R.cm.zk, css: s.cv.style.transform, stickUp: stickToWorld(-Math.PI / 2, R.cfg, R.cm.h) }; },
      setCamera: (m) => s.setCam(m, false),
      // moments: slow-mo running, the crash clip kept for the replay, frames recorded; slowmo(): force one
      moments: () => ({ slow: !!s.mom.slow, clip: s.mom.best ? { n: s.mom.best.n, label: s.mom.best.label, score: s.mom.best.score } : null, rec: s.mom.rec.n, replay: !!s.replay }),
      slowmo: () => s.mom.finish(s.view ? s.view.time : 0, true),
      audio: () => ({ engine: engineOn(), music: raceMusicState() }),
      dev: (k, item, lv) => s.rc?.send({ t: 'dev', k, item, ...(lv ? { lv } : {}) }),
      hitStop: () => s.stopT || 0, bus: combatBus,
      // Elimination: what this phone shows (danger, hole, duel, spectating) and the emote buttons
      elim: () => { const v = s.view, md = (v && v.hud) || {}; return v ? { dg: md.dg || 0, nx: md.nx, iv: md.iv, left: md.left, duel: md.duel || 0, bh: md.bh, hole: v.hole, bg: v.me ? v.me.bg : null, out: v.me ? v.me.out || 0 : 0, near: s.elim ? s.elim.near : 0, spec: !!(s.spec && !s.spec.hidden), ranks: v.ranks.slice(), cars: v.cars.length } : null; },
      emote: (k) => s.emote(k),
      perf: () => s.perfStats(), resetPerf: () => { s.perfN = 0; },
      dpr: () => s.dpr, finishShown: () => s.endShown, mine: s.mine = {},
      // screenshot / perf runs only: drive along the racing line (the touch tests drive for real)
      auto: (on = true, o = {}) => { s.auto = on ? { i: -1, fire: 0, ...o } : null; },
      // ha: the world heading the hint steers toward (the joystick direction), rev: backing off
      // (ha is the SCREEN direction to point the stick at, wha the world heading: the same in Top-down)
      hint: () => { const A = s.hintS || (s.hintS = { i: -1 }), h = s.pursuit(A), R = s.renderer; return { st: h.st, th: h.th, dr: h.dr, spd: h.spd, ha: h.hd == null ? h.hd : worldToStick(h.hd, R.cfg, R.cm.h), wha: h.hd, rev: A.rev > 0 }; },
    };
  }

  connect() {
    const o = this.o;
    // sens: the steering sensitivity setting (the server scales the turn rate by it, like the prediction)
    const sens = Math.min(1.5, Math.max(0.5, SETTINGS.raceSens ?? 1));
    const params = o.tutorial
      ? { name: o.name, driver: o.driver, token: o.token || '', mode: 'tutorial', bots: 0, sens }
      : { name: o.name, driver: o.driver, token: o.token || '', mode: o.mode, track: o.track && o.track !== 'any' ? o.track : '', bots: o.bots === false || o.bots === 0 ? 0 : 1, room: o.room || '', lobby: o.lobby || '', laps: o.laps || '', sens };
    const rc = (this.rc = new RaceClient({ base: o.base || location.origin.replace(/^http/, 'ws'), params }));
    rc.on('welcome', () => { this.renderer.setTrack(rc.T); this.idleCam(); this.showWait(); });
    rc.on('lobby', (m) => this.updateWait(m));
    rc.on('roomwait', (m) => this.showRoomWait(m));
    rc.on('start', () => {
      this.$('.rc-wait').hidden = true;
      this.root.classList.add('racing');
      this.renderer.setTrack(rc.T);
      this.hud = new Hud();
      this.startedAt = performance.now();
      this.renderer.top = DRIVERS[rc.myDriver()]?.top || 900;
      // ELIMINATION: the black hole / danger layer, and the spectator bar (shown once you are out)
      this.elim = this.renderer.elim = rc.mode === 'elim' ? new ElimFx() : null;
      if (this.elim) this.specBar(); else this.spec = null;
      this.root.style.setProperty('--rc-bg', (THEMES[rc.T.world] || THEMES.desert).bg);
      if (!this.tut) startRaceMusic();
      this.best = o.best ?? null;
      try { this.bestSplits = JSON.parse(localStorage.getItem('hunt-race-splits-' + rc.trackKey) || 'null'); } catch { this.bestSplits = null; }
      this.bestLapSeen = rc.mode === 'trial' ? this.bestSplits?.lap || null : null;
    });
    // the results come up 1.6 s after the finish in real time (frame time is capped per frame, so
    // counting it would hold them back for ages on a device that drops to a few frames a second)
    rc.on('end', () => { if (this.tut) this.tut.ready(); else this.endAt = performance.now() + 1600; setMusicIntensity(0); });
    rc.on('progress', (m) => { this.o.onProgress?.(m); this.applyProgress(m); });
    // UNLOCKS: the car we asked for is locked on this account: the server put us in another one
    rc.on('car', (m) => { this.o.driver = m.driver; this.o.onCar?.(m); this.toast(`${carName(m.want)} is locked. Racing in ${carName(m.driver)}.`); });
    rc.on('failed', () => this.fail('Lost the connection to the race.'));
    rc.on('retry', (m) => this.fail(m.reason === 'Race full' ? 'That race is full. Try another room code.' : 'That race already started. Try again in a moment.'));
    rc.on('rejoinfail', () => this.fail('Could not get back into the race.'));
    rc.connect().catch(() => this.fail('Could not reach the race server.'));
  }

  // ---------------------------------------------------------------- screens
  // the pre-race card: mode + track, who is in, a rotating tip, and for a friend room the room card
  // (code + COPY always on screen; the host gets FILL WITH BOTS and START)
  showWait() {
    const rc = this.rc, w = this.$('.rc-wait');
    w.hidden = false; this.wfx.start();
    if (this.tut) {
      this.$('.rc-wt').textContent = 'HOW TO DRIVE';
      this.$('.rc-wm').textContent = 'A 20-second drive to learn the controls';
      this.roomCard('');
      return;
    }
    this.$('.rc-wt').textContent = rc.room ? 'FRIENDS ROOM' : rc.mode === 'trial' ? 'TIME TRIAL' : 'FINDING RACERS';
    this.$('.rc-wt').classList.toggle('scan', !rc.room);
    this.modeLine(RACE_MODES[rc.mode]?.name || 'Race', trackName(rc.trackKey, rc.arena) || '');
    this.roomCard(rc.room);
    this.tips();
  }
  // "ELIMINATION RACE" tag + the track name
  modeLine(mode, track) {
    this.$('.rc-wm').innerHTML = `<span class="rc-mtag">${esc(mode)}</span>${track ? `<span class="rc-mtrack">${esc(track)}</span>` : ''}`;
  }
  // the racer slots (lit = found), the radar blips and the start countdown
  waitMeter(n, max, startIn) {
    const sl = this.$('.rc-slots');
    if (sl.childElementCount !== max) sl.innerHTML = '<i></i>'.repeat(max);
    [...sl.children].forEach((e, i) => e.classList.toggle('on', i < n));
    if (this.lastN != null && n > this.lastN) play('pickup');
    this.lastN = n;
    const cd = this.$('.rc-cd');
    cd.hidden = startIn == null;
    if (startIn != null) { const s = String(Math.max(0, Math.ceil(startIn))); if (cd.firstChild.textContent !== s) { cd.firstChild.textContent = s; cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); } }
    this.wfx.set(n, max, startIn == null ? 0 : 1 - Math.min(1, startIn / 10));
    this.wfx.start();
  }
  roomCard(code) {
    const w = this.$('.rc-wait');
    w.classList.toggle('room', !!code);
    this.$('.rc-room').hidden = !code;
    this.$('.rc-code').textContent = code || '';
  }
  tips() {
    if (this.tipTimer) return;
    let i = Math.floor(Math.random() * RACE_TIPS.length);
    const el = this.$('.rc-tip'), next = () => { el.textContent = RACE_TIPS[i++ % RACE_TIPS.length]; };
    next();
    this.tipTimer = setInterval(next, 4500);
  }
  updateWait(m) {
    if (this.rc.phase !== 'lobby') return;
    const rc = this.rc;
    this.$('.rc-wait').hidden = false;
    if (this.tut) { this.$('.rc-ws').textContent = 'Starting…'; return; }
    const chips = m.players.map(([n, d]) => `<span class="rc-chip" style="--c:${(BASE_LOOKS[d] || BASE_LOOKS.volt).neon}" title="${carName(d)}"><i></i>${esc(n)}<small>${esc(carName(d))}</small></span>`).join('');
    if (chips !== this.chipsHtml) this.$('.rc-wl').innerHTML = this.chipsHtml = chips; // (only on a change: chips animate in)
    const n = `${m.players.length}/${m.max} racers`;
    this.waitMeter(m.players.length, m.max, m.startIn);
    if (rc.room && m.ids) {
      // host-run friend room
      const amHost = m.host === rc.id, hi = m.ids.indexOf(m.host), hostName = hi >= 0 ? m.players[hi][0] : 'the host';
      this.$('.rc-wt').textContent = 'FRIENDS ROOM';
      this.$('.rc-list').innerHTML = m.players.map(([nm], i) => `<li class="${m.ids[i] === m.host ? 'host' : ''}${m.ids[i] === rc.id ? ' me' : ''}">${esc(nm)}${m.ids[i] === m.host ? ' <small>HOST</small>' : ''}${m.ids[i] === rc.id ? ' <small>YOU</small>' : ''}</li>`).join('');
      this.$('.rc-host').hidden = !amHost;
      const bots = this.$('.rc-bots');
      bots.setAttribute('aria-checked', String(!!m.bots)); bots.querySelector('.cb').classList.toggle('on', !!m.bots);
      this.$('.rc-start').disabled = !m.can;
      this.$('.rc-ws').textContent = `${n} in the room${m.startIn != null ? ` · starts by itself in ${Math.ceil(m.startIn)}` : ''}`;
      this.$('.rc-hw').textContent = amHost ? (m.can ? 'Press START when everyone is here.' : 'Bots are off: waiting for a friend to join.') : `Waiting for ${hostName} to start.`;
      return;
    }
    this.$('.rc-list').innerHTML = ''; this.$('.rc-host').hidden = true; this.$('.rc-hw').textContent = '';
    this.$('.rc-ws').textContent = m.startIn != null ? `${n} · starts in ${Math.ceil(m.startIn)}` : !m.bots ? `${n} · waiting for another racer (bots are off)` : `${n} · starting soon`;
  }
  // a friend room that is mid-race: we are held for its next race
  showRoomWait(m) {
    this.$('.rc-wait').hidden = false; this.wfx.start();
    this.$('.rc-wt').textContent = 'FRIENDS ROOM'; this.$('.rc-wt').classList.remove('scan');
    this.modeLine(RACE_MODES[m.mode]?.name || 'Race', m.track ? trackName(m.track, RACE_MODES[m.mode]?.arena) || '' : '');
    this.roomCard(m.room || this.o.room || '');
    this.$('.rc-wl').innerHTML = this.chipsHtml = '';
    this.$('.rc-list').innerHTML = ''; this.$('.rc-host').hidden = true;
    this.$('.rc-ws').textContent = `Your friends are mid-race${m.left != null ? ` (about ${Math.floor(m.left / 60)}:${String(m.left % 60).padStart(2, '0')} left)` : ''}`;
    this.$('.rc-hw').textContent = "You'll join their next race. Stay here, or CANCEL.";
    this.tips();
  }
  async copyRoom() {
    const code = this.rc?.room || this.o.room || '';
    if (!code) return;
    const link = `${location.origin}/?room=${encodeURIComponent(code)}`;
    let ok = false;
    try { await navigator.clipboard.writeText(inviteText(link)); ok = true; } catch {}
    this.toast(ok ? 'Invite copied' : `Room code: ${code}`);
  }
  toast(msg) {
    const t = this.$('.rc-toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.hidden = true; }, 1800);
  }
  idleCam() { const g = this.rc.T.grid[0]; const c = this.renderer.cam; c.x = g.x; c.y = g.y; c.z = this.renderer.baseZoom(); c.lx = c.ly = 0; c.init = true; this.renderer.cm.h = g.a; this.root.style.setProperty('--rc-bg', (THEMES[this.rc.T.world] || THEMES.desert).bg); this.setCam(this.camName, false); }
  // the camera view (Settings > Camera, or the pause menu): the world canvas gets that view's tilt
  setCam(name, save) {
    this.camName = camMode(name);
    if (save) setSetting('raceView', this.camName);
    const R = this.renderer, tl = R.setCamera(this.camName);
    this.cv.style.transform = tl.css; this.cv.style.transformOrigin = tl.origin;
    // Top-down (no tilt): the HUD draws straight onto the world canvas like it always did, and the
    // HUD canvas keeps a 1 px backing store (it still takes the touches): a second full-screen
    // canvas to clear, redraw and composite every frame cost phones ~8 fps for nothing
    this.flat = !tl.css;
    const hw = this.flat ? 1 : Math.round(this.W * this.dpr), hh = this.flat ? 1 : Math.round(this.H * this.dpr);
    if (this.hcv.width !== hw || this.hcv.height !== hh) { this.hcv.width = hw; this.hcv.height = hh; }
    else if (this.flat) this.hg.clearRect(0, 0, 1, 1);
    // the sky the tilt leaves at the top fades into the track through a fog band
    const gap = Math.round(skyGap(tl));
    this.fog.style.height = tl.css ? `${gap + Math.round(this.H * 0.2)}px` : '0px';
    // (with a faint glow of the world's lights along the horizon)
    const glow = HORIZON[this.rc?.T?.world] || HORIZON.desert;
    this.fog.style.background = tl.css ? `linear-gradient(var(--rc-bg, #1b1033) 0 ${Math.max(0, gap - 26)}px, ${glow} ${gap - 2}px, var(--rc-bg, #1b1033) ${gap + 6}px, transparent)` : '';
    this.fog.hidden = !tl.css;
    R.hideMe = this.camName === 'cockpit';
    this.root.dataset.cam = this.camName;
    const b = this.$('.rc-cam'); if (b) b.textContent = `CAMERA: ${CAM_NAMES[this.camName]}`;
  }
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

  // ---------------------------------------------------------------- tutorial
  // done or skipped: remember it, then the race the player picked (or back to the lobby for a replay)
  finishTut(skipped) {
    if (!this.tut || this.dead) return;
    setFlag(TUT_FLAG);
    const next = this.o.next;
    this.o.onTutorial?.({ skipped });
    this.destroy();
    if (next) startRace({ ...next, tutorial: false }); else this.o.onExit?.({ left: false });
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.tipTimer); clearTimeout(this.toastT); this.wfx.stop();
    try { if (this.rc && this.rc.phase !== 'idle') this.rc.leave(); } catch {}
    this.ctrl.destroy();
    this.horn.destroy();
    removeEventListener('resize', this.onResize);
    if (this.resKey) removeEventListener('keydown', this.resKey);
    stopEngine(); stopEngine2(); stopRaceMusic(); hapticsOff();
    this.root.remove();
    if (current === this) current = null;
  }

  // ---------------------------------------------------------------- finish screen (mirrors ui/flow.js results)
  showEnd() {
    this.endShown = true; this.endAt = 0;
    this.root.classList.remove('racing'); // (the finish screen works upright)
    this.$('.rc-menu').hidden = true;
    if (this.rc.results.mode === 'elim') { this.mom.flush(); if (this.spec) this.spec.hidden = true; }
    showResults(this); // (race/results.js)
    if (this.rc.progress) this.applyProgress(this.rc.progress);
  }
  applyProgress(m) {
    if (!this.endShown) return; // shown with the finish screen
    resultsProgress(this, m);
  }

  // ---------------------------------------------------------------- frame
  resize() {
    const cs = getComputedStyle(this.sa), n = (v) => parseFloat(v) || 0;
    this.SA = { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
    this.W = innerWidth; this.H = innerHeight;
    this.dpr = SETTINGS.lowGfx ? 1 : Math.min(DPR_STEPS[this.dprStep], devicePixelRatio || 1);
    this.renderer.resize(this.W, this.H, this.dpr);
    this.setCam(this.camName, false);
    this.ctrl.layout(this.W, this.H, this.SA);
    if (this.tut) this.tut.box = null;
  }
  // render at a lower pixel ratio when frames get slow, back up when there is room
  adapt(ms) {
    // (one long frame - a GC, a tab switch, the GPU catching up - is not slowness: counted as at
    // most 50 ms in the average, or a single hitch dropped the resolution, and the rebuild at the new
    // size hitched again)
    // (the time spent slow counts up to 250 ms a frame: a really slow phone steps down as soon as before)
    this.frameAvg += (Math.min(ms, 50) - this.frameAvg) * 0.05;
    if (this.frameAvg > 18.5) { this.slowFor += Math.min(ms, 250); this.fastFor = 0; } else if (this.frameAvg < 13) { this.fastFor += ms; this.slowFor = 0; } else this.slowFor = this.fastFor = 0;
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
      const inp = this.auto ? this.autopilot(dt) : this.ctrl.poll(dt, rc.car ? rc.car.a : null);
      rc.setInput(inp);
      if (this.ctrl.takeFire()) rc.fire();
      if (this.ctrl.takeItem()) rc.useItem();
      if (this.ctrl.takeReset() && this.resetOk && this.resetCd <= 0 && rc.phase === 'race') { this.resetCd = 3; rc.reset(); play('click'); }
      // the server's reset cooldown (me.rcd) when it sends one, else our own 3 s
      if (rc.me && rc.me.rcd != null) this.resetCd = rc.me.rcd; else if (this.resetCd > 0) this.resetCd -= dt;
      rc.frame(now);
      const v = rc.view(now);
      if (!v) return;
      this.view = v;
      const evs = rc.drainEvents();
      for (let i = 0; i < evs.length; i++) { const e = evRow(evs[i]); if (e) this.onEvent(e, v); }
      this.mom.frame(v);
      if (v.me) this.mom.place(v.me.fin || v.me.rk, v.time);
      this.local(v, dt);
      this.guide(v, dt, inp);
      if (this.spec) this.spectate(v);
      R.meBrake = !!(inp && inp.th < 0);
      // (before any drawing: a drawing error can never hold the results back)
      if (this.endAt && now >= this.endAt && !this.endShown && !this.mom.slow) this.showEnd();
      if (this.endShown && this.replay) { this.replay.frame(dt); return; } // results: only the crash replay draws
      // slow-mo (presentation only): the last moments before your finish replayed at 40% speed
      const sv = this.mom.slowView(dt);
      // HIT-STOP: a hit you dealt or took freezes the world picture for 0.08 s (inputs and the
      // network keep running underneath; the HUD keeps drawing)
      if (sv) { sv.countdown = 0; sv.me = v.me; sv.hud = v.hud; sv.ranks = v.ranks; R.draw(sv, rc, dt * 0.4, now); }
      else if (this.stopT > 0) { this.stopT -= dt; R.draw(this.stopView || v, rc, 0, now); } else R.draw(v, rc, dt, now);
      this.screenLayer(v, dt, !!sv);
    } else {
      // pre-race: the track behind the lobby card (also warms the chunk cache around the grid)
      R.draw(IDLE_VIEW, rc, dt, now);
      if (!this.flat) { const hg = this.hg; hg.setTransform(1, 0, 0, 1, 0, 0); hg.clearRect(0, 0, this.hcv.width, this.hcv.height); }
    }
  }
  // the un-tilted screen layer: speed lines / blur / streaks, the cockpit bonnet, then the HUD
  screenLayer(v, dt, slow) {
    const rc = this.rc, R = this.renderer, g = this.flat ? R.g : this.hg, S = this.sp, car = R.meCar;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (!this.flat) g.clearRect(0, 0, this.hcv.width, this.hcv.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const c = rc.car, spd = car ? car.spd : 0;
    this.speed.level(car && !(car.f & FLAG.DEAD) && v.countdown <= 0 ? spd : 0, R.top || 900, car && car.f & FLAG.BOOST ? 1 : 0, dt);
    if (car) {
      const p = R.toScreen(car.x, car.y, S);
      S.W = this.W; S.H = this.H; S.world = rc.T.world; S.x = p.x; S.y = p.y;
      if (R.cfg.rotate) { S.fx = 0; S.fy = -1; S.far = this.H * 0.8; } // (the flow fans out from just over the horizon)
      else { const vx = c && car.predicted ? c.vx : Math.cos(car.a) * spd, vy = c && car.predicted ? c.vy : Math.sin(car.a) * spd, m = Math.hypot(vx, vy) || 1; S.fx = vx / m; S.fy = vy / m; S.far = Math.max(this.W, this.H) * 0.7; }
      this.speed.screen(g, S, slow ? dt * 0.4 : dt);
    }
    if (R.hideMe && car && !(car.f & FLAG.DEAD)) drawHood(g, this.W, this.H, this.SA, R.carLook(car.id, rc), R.cm.sw, R.t);
    this.hud.draw(g, { W: this.W, H: this.H, SA: this.SA, dpr: this.dpr, view: v, me: v.me, rc, ctrl: this.ctrl, dt, t: R.t, mode: rc.mode, art: R.art, renderer: R, wrong: this.wrong, bestTime: this.best,
      tut: !!this.tut, focus: this.focus, hint: this.hintA, canReset: this.resetOk && this.resetCd <= 0 });
    if (this.elim) this.elim.screen(g, { W: this.W, H: this.H, SA: this.SA, dpr: this.dpr, view: v, me: v.me, R, rc, dt, play, name: (id) => this.name(id) });
  }
  // ---------------------------------------------------------------- elimination: spectating
  // knocked out: the camera follows the leader (render.js), four emotes, LEAVE and NEXT RACE
  specBar() {
    const el = (this.spec = document.createElement('div'));
    el.className = 'rc-spec'; el.hidden = true;
    el.innerHTML = `<div class="rc-emos">${EMOTES.map((t, i) => `<button class="btn btn-sm alt rc-emo" data-e="${i}">${esc(t)}</button>`).join('')}</div>
      <div class="rc-sbtns"><button class="btn btn-md red rc-sleave">LEAVE</button><button class="btn btn-md rc-snext" data-sfx="play">NEXT RACE</button></div>`;
    this.root.insertBefore(el, this.$('.rc-credit'));
    for (const b of el.querySelectorAll('.rc-emo')) b.onclick = () => this.emote(+b.dataset.e);
    el.querySelector('.rc-sleave').onclick = () => this.exit();
    el.querySelector('.rc-snext').onclick = () => this.again();
  }
  emote(k) {
    if (!this.rc || !this.rc.me || !this.rc.me.out || !(k >= 0 && k < EMOTES.length)) return;
    if (performance.now() - (this.emoAt || 0) < 1500) return; // (the server allows one every 1.5 s too)
    this.emoAt = performance.now();
    this.rc.send({ t: 'emote', e: k });
    play('click');
  }
  spectate(v) {
    const out = !!(v.me && v.me.out) && this.rc.phase === 'race' && !this.endShown;
    if (!this.spec || out === !this.spec.hidden) return;
    this.spec.hidden = !out;
    this.ctrl.enabled = !out; if (out) this.ctrl.reset();
    this.root.classList.toggle('spectating', out);
  }

  // the first-race steering hint, the tutorial prompt and focus, and RESET (stuck seconds from the server)
  guide(v, dt, inp) {
    const rc = this.rc, me = v.me, c = this.ctrl, T = this.tut;
    const racing = v.countdown <= 0 && rc.phase === 'race' && me && !me.rt;
    const steering = c.mode === 'touch' ? c.stick.id != null && c.stick.hm > 0.35 : Math.abs(inp.st) > 0.3;
    if (this.hintOn && racing && steering && (this.steerT += dt) > 1.2) { this.hintOn = false; setFlag(STEER_FLAG); }
    const want = (this.hintOn || (T && T.step === 0)) && !(T && T.shown);
    this.hintA = want ? Math.min(1, this.hintA + dt * 4) : Math.max(0, this.hintA - dt * 1.7);
    if (T) {
      if (v.hud && v.hud.tut) T.sync(v.hud.tut);
      T.prompt(c.mode !== 'touch'); this.focus = T.focus(me); T.tick(dt);
      const R = this.renderer, mc = R.meCar;
      if (mc && R.M) { const p = R.toScreen(mc.x, mc.y); T.see(p.x, p.y); }
    } else this.focus = null;
    // stuck: the server's per-car `stuck` seconds (on `me`, or the 9th field of our car row)
    const row = rc.latest && rc.latest.c.find((r) => r[0] === rc.id);
    const st = me && me.stuck != null ? me.stuck : row && row.length > 8 ? row[8] : undefined;
    if (st !== undefined) this.resetOk = true;
    this.stuck = +st || 0;
    const b = c.btn.reset, big = this.stuck > 1 && this.resetCd <= 0;
    if (big !== !!b.big) { b.big = big; b.r = big ? b.r1 : b.r0; }
  }

  // own-car cues: countdown beeps, pads, walls, landings, drift tiers, wrong way, engine
  local(v, dt) {
    const rc = this.rc, p = this.prev, me = v.me, car = rc.car;
    const cd = v.countdown > 0 ? Math.ceil(v.countdown) : 0;
    if (cd !== p.cd) { if (cd > 0) play('count'); else if (p.cd > 0) { play('go'); this.hud.banner('GO!', '', '#5ef2c6', 0.01); } p.cd = cd; }
    const mine = v.cars.find((c) => c.me);
    const alive = mine && !(mine.f & FLAG.DEAD) && !(me && me.out);
    if (car && mine && mine.predicted) {
      if (car.boostT > p.boostT + 0.3) { if (!this.mtNow) play('pad', 0.8); play('roar', 0.8); haptic('boost'); }
      const spd = Math.hypot(car.vx, car.vy);
      if (p.spd - spd > 260 && !(mine.f & FLAG.AIR)) {
        const k = Math.min(1, (p.spd - spd) / 600);
        play(k > 0.8 ? 'thud' : 'wall', k); haptic('wall', k); this.renderer.shake(Math.min(0.6, (p.spd - spd) / 1100), -(p.vx || 0), -(p.vy || 0)); // (the wall shoves the view back against your travel)
        if (k > 0.8) duckRaceMusic(0.8, 0.45);
      } else if (car.wh < 0.07 && spd > 150 && v.countdown <= 0) haptic('scrape', 0.5); // scraping a guard wall
      const air = car.airT > 0;
      if (p.air && !air) { play('land', 0.8); haptic('land'); }
      const tier = car.drift ? driftTier(car.dc) : 0;
      if (car.drift && !p.drift) haptic('drift');
      if (tier > p.tier) { play('tier' + tier, 0.8); haptic('tier'); }
      p.tier = tier; p.air = air; p.spd = spd; p.vx = car.vx; p.vy = car.vy; p.boostT = car.boostT; p.drift = car.drift;
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
    // on the grid the engine revs with the count (presentation only: no input is sent for it)
    const revs = v.countdown > 0 ? revCurve(v.countdown) : 0;
    // the unlockable cars have their own engine voice (sound2.js); the starters keep sound.js
    const eOn = !!alive && rc.phase === 'race' && !this.endShown, eSpd = revs || (mine ? mine.spd / top : 0), eBoost = mine && mine.f & FLAG.BOOST ? 1 : 0, eDrift = car && car.drift ? 1 : 0;
    if (isNewCar(rc.myDriver())) { stopEngine(); engine2(rc.myDriver(), eSpd, eDrift, p.tier, eBoost, eOn); } else { stopEngine2(); engine(eSpd, eDrift, p.tier, eBoost, eOn); }
    // the music gets hotter on the final lap (Elimination: the last three; Battle: the last 30 s)
    const md = v.hud || {}, hot = me && !me.fin && !me.out && ((md.laps && me.lap >= md.laps) || (rc.mode === 'elim' && md.left <= 3) || (rc.mode === 'battle' && md.tl != null && md.tl < 30)) ? 1 : 0;
    if (hot !== p.hot) { setMusicIntensity(hot); p.hot = hot; }
    // cars rushing past you: a whoosh from their side of the screen
    if (alive && v.countdown <= 0) for (const b of passBys(mine, v.cars, this.seen, performance.now() / 1000, this.pb)) play('whoosh', b.v, this.pan(b.id));
  }
  // where a car is across the screen, -1 (left) .. 1 (right), for positional sound
  pan(id) {
    const R = this.renderer, c = R.carAt(this.view || IDLE_VIEW, id), m = R.meCar;
    if (!c || !m) return 0;
    const a = R.toScreen(c.x, c.y, this.panA || (this.panA = {})).x, b = R.toScreen(m.x, m.y, this.panB || (this.panB = {})).x;
    return Math.max(-1, Math.min(1, (a - b) / (this.W * 0.4)));
  }

  // pure pursuit along the racing line (test/screenshot autopilot, and the steering hint the
  // touch / keyboard browser tests turn into real finger and key input)
  pursuit(A) {
    const rc = this.rc, car = rc.car, out = A.out || (A.out = { st: 0, th: 1, dr: 0, spd: 0 });
    if (!car || !rc.T) { out.st = 0; out.dr = 0; return out; }
    if (!rc.T.corridors.length) { // arena: chase the nearest car, keep off the walls
      let tx = (rc.T.box.x0 + rc.T.box.x1) / 2, ty = (rc.T.box.y0 + rc.T.box.y1) / 2, bd = Infinity;
      for (const c of this.view?.cars || []) { if (c.me || c.f & FLAG.DEAD) continue; const d = Math.hypot(c.x - car.x, c.y - car.y); if (d < bd) { bd = d; tx = c.x; ty = c.y; } }
      let da = Math.atan2(ty - car.y, tx - car.x) - car.a;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const fwd = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a), dt = 1 / 60;
      out.st = Math.max(-1, Math.min(1, da * 2.2)); out.th = 1; out.dr = 0; out.spd = Math.abs(fwd); out.hd = car.a + da;
      if (A.rev > 0) { A.rev -= dt; out.th = -1; out.st = -out.st; return out; }
      A.slow = Math.abs(fwd) < 70 ? (A.slow || 0) + dt : 0;
      if (A.slow > 1) { A.slow = 0; A.rev = 0.8; }
      return out;
    }
    const now = performance.now(), dt = Math.min(0.2, (now - (A.at || now)) / 1000); A.at = now;
    const T = rc.T, c = T.corridors[0], L = c.line || { x: c.px, y: c.py, k: new Float64Array(c.n) }, n = c.n, st = DRIVERS[rc.myDriver()];
    // corner speed per line sample (same rule of thumb the bots use), cached per track + driver
    const key = 'vmax_' + rc.myDriver();
    const vmax = T[key] || (T[key] = Float64Array.from(L.k, (k) => { let v = st.top; for (let it = 0; it < 4; it++) v = Math.min(st.top * 1.3, ((st.handling * (1 - 0.3 * Math.min(1, Math.max(0, (v - 450) / 450)))) / Math.max(k, 1e-5)) * 0.9); return Math.max(260, v); }));
    let best = Infinity, bi = A.i;
    const from = A.i < 0 ? 0 : A.i - 6, to = A.i < 0 ? n : A.i + 12;
    for (let k = from; k < to; k++) { const i = ((k % n) + n) % n, d = (L.x[i] - car.x) ** 2 + (L.y[i] - car.y) ** 2; if (d < best) { best = d; bi = i; } }
    A.i = best > 400 * 400 ? -1 : bi; // far off the line (respawn): search everything next time
    const spd = Math.hypot(car.vx, car.vy), fwd = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
    const j = (bi + Math.round((90 + Math.max(0, fwd) * 0.38) / 32)) % n;
    let da = Math.atan2(L.y[j] - car.y, L.x[j] - car.x) - car.a;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    out.st = Math.max(-1, Math.min(1, da * 2.6)); out.spd = spd; out.th = 1; out.dr = 0; out.hd = car.a + da;
    // brake for the slowest bend within braking distance
    let target = st.top * (car.boostT > 0 ? car.boostP : 1);
    for (let k = 0, dist = 0; dist < fwd * 1.2 + 260 && k < n; k++) { const i = (bi + k) % n, allow = Math.sqrt(vmax[i] ** 2 + 2 * 1050 * dist); if (allow < target) target = allow; dist += 32; }
    if (fwd > target + 45) out.th = -1; else if (fwd > target) out.th = 0;
    if (A.drift !== false && car.airT <= 0) {
      // drift only through real bends (curvature ahead), let go once the nose is round
      let kAhead = 0;
      for (let k = 0; k < 14; k++) kAhead = Math.max(kAhead, L.k[(bi + k) % n]);
      if (car.drift) out.dr = Math.abs(da) > 0.15 && Math.sign(da) === car.drift && kAhead > 1 / 1100 ? 1 : 0;
      else if (fwd > 470 && Math.abs(da) > 0.4 && kAhead > 1 / 650) out.dr = 1;
      if (out.dr) out.th = 1;
    }
    // stuck against something (or facing the wrong way): back off, steering the other way
    if (A.rev > 0) { A.rev -= dt; out.th = -1; out.st = -out.st; out.dr = 0; return out; }
    if (rc.latest && rc.latest.tm > 1 && (Math.abs(fwd) < 70 || (Math.abs(da) > 2.2 && fwd < 150)) && car.spinT <= 0) A.slow = (A.slow || 0) + dt; else A.slow = 0;
    if (A.slow > 1.1) { A.slow = 0; A.rev = 0.9; }
    return out;
  }
  autopilot(dt) {
    const A = this.auto, out = this.pursuit(A), rc = this.rc;
    if (A.stop) { out.th = -1; out.dr = 0; } // (tests: stand still, e.g. to let the other car get well ahead)
    if (A.fire && (A.fire -= dt) <= 0) { A.fire = A.every || 1.5; rc.fire(); if (rc.me && rc.me.it >= 0) rc.useItem(); }
    return out;
  }
  name(id) { return this.rc.roster.get(id)?.name || 'Racer'; }
  onEvent(e, v) {
    const rc = this.rc, meId = rc.id, R = this.renderer, H = this.hud;
    R.fx(e, v, meId);
    if (e[1] === meId) (this.mine[e[0]] ||= []).push(performance.now()); // own events by kind (tests)
    const fall = (id) => { const c = R.carAt(v, id), m = R.meCar; if (!c || !m) return 0.3; return Math.max(0, 1 - Math.hypot(c.x - m.x, c.y - m.y) / 1300); };
    const pan = (id) => (id === meId ? 0 : this.pan(id));
    { const c = e[0] === 'ko' ? R.carAt(v, e[1]) : null; this.mom.event(e, meId, v.time, (e[0] === 'ko' || e[0] === 'bump') && fall(e[1]) > 0.55, c || (e[0] === 'boom' ? { x: e[1], y: e[2] } : e[0] === 'elim' && e[5] != null ? { x: e[5], y: e[6] } : null)); }
    switch (e[0]) {
      case 'ko': {
        if (e[1] === meId) { play('wreck'); play('thud'); haptic('crash'); duckRaceMusic(1.6); }
        else { play('boom', fall(e[1]), pan(e[1])); if (fall(e[1]) > 0.6) { play('thud', fall(e[1]) * 0.7, pan(e[1])); duckRaceMusic(0.9, 0.5); } }
        if (e[2] === meId && e[1] !== meId) { H.banner('TAKEDOWN!', this.name(e[1]), '#ff9f43', 1.4); if (this.stopT <= 0) { this.stopT = HIT_STOP_BIG; this.stopView = v; combatBus.emit('hitstop', { t: HIT_STOP_BIG }); } }
        // kill-cam callout: NAME TOOK OUT NAME
        if (e[2] && e[2] !== e[1]) { H.callout(`${this.name(e[2]).toUpperCase()} TOOK OUT ${this.name(e[1]).toUpperCase()}`, e[1] === meId || e[2] === meId ? '#ffd23f' : '#ffffff'); combatBus.emit('takedown', { victim: e[1], by: e[2], me: e[1] === meId || e[2] === meId }); }
        { const c = R.carAt(v, e[1]); if (c) combatBus.emit('explode', { x: c.x, y: c.y, r: 180 }); }
        H.log(e[2] && e[2] !== e[1] ? `${this.name(e[2])} wrecked ${this.name(e[1])}` : `${this.name(e[1])} wrecked`, e[1] === meId || e[2] === meId ? '#ffd23f' : '#ffffff');
        break;
      }
      case 'rs': if (e[1] === meId) play('respawn'); break;
      case 'reset': if (e[1] === meId) { play('reset'); H.banner('BACK ON TRACK', '', '#5ff4ff', 1); } break;
      case 'nudge': if (e[1] === meId) play('reset', 0.4); break; // the server eased us off a wall
      case 'tut': if (this.tut) this.tut.event(tutStep(e)); break;
      case 'hit': {
        const mine = e[1] === meId || e[2] === meId;
        if (e[1] === meId) { play('hit'); haptic('hit'); } else if (e[2] === meId) play('hit', 0.5, pan(e[1]));
        if (e[5]) play('boom', e[1] === meId ? 0.9 : fall(e[1]), pan(e[1])); // a big hit
        if (mine && this.stopT <= 0) { const t = e[5] ? HIT_STOP_BIG : HIT_STOP; this.stopT = t; this.stopView = v; combatBus.emit('hitstop', { t }); }
        combatBus.emit('hit', { id: e[1], src: e[2], kind: e[3], dmg: e[4], big: !!e[5], me: mine });
        break;
      }
      // WEAPONS: lock-on, dodges, combos, sticky bombs, drones, ghosts
      case 'lock': if (e[1] === meId) play('lock'); combatBus.emit('lockon', { target: e[1], src: e[2], kind: e[4], me: e[1] === meId }); break;
      case 'dodge': if (e[1] === meId) { play('dodge'); H.banner('DODGED!', '', '#5ef2c6', 1); } else play('dodge', fall(e[1]) * 0.6, pan(e[1])); combatBus.emit('dodge', { id: e[1], me: e[1] === meId }); break;
      case 'combo': {
        play('combo', e[1] === meId || e[3] === meId ? 1 : 0.5);
        if (e[1] === meId) H.banner('COMBO!', e[2] === 'trap' ? 'Oil + spikes: a bigger trap' : 'EMP + missile: bonus damage', '#ffd23f', 1.4);
        break;
      }
      case 'stick': play('sticky', e[1] === meId ? 1 : fall(e[1]), pan(e[1])); if (e[1] === meId) H.banner('STICKY BOMB!', 'Bump someone to pass it on', '#7dff5a', 1.6); break;
      case 'pass': play('pass', e[1] === meId || e[2] === meId ? 1 : fall(e[2]), pan(e[2])); if (e[2] === meId) H.banner('BOMB PASSED TO YOU!', 'Bump someone', '#7dff5a', 1.4); else if (e[1] === meId) H.banner('PASSED IT ON!', '', '#5ef2c6', 1); break;
      case 'swat': play('swat', e[1] === meId ? 1 : fall(e[1]), pan(e[1])); if (e[1] === meId) H.banner('SWATTED!', '', '#5ef2c6', 1); break;
      case 'unghost': if (e[1] === meId) { play('shieldpop'); H.banner('GHOST BROKEN', '', '#5ff4ff', 1); } break;
      case 'fizzle': play('pass', 0.4); break;
      case 'shield': play('shieldpop', fall(e[1]), pan(e[1])); break;
      case 'steal':
        if (e[1] === meId) { H.banner('BOUNTY STOLEN!', `+${e[3]} coins and a boost`, '#ffd23f', 2); play('steal'); }
        else if (e[2] === meId) { H.banner('BOUNTY LOST', `${this.name(e[1])} took ${e[3]} coins`, '#ff5f5f', 2); play('out'); }
        else H.log(`${this.name(e[1])} stole the bounty`, '#ffd23f');
        break;
      case 'box':
        if (e[1] === meId) {
          play('box'); haptic('item');
          if (e[5]) { play('levelup'); H.banner(`LEVEL ${e[4]}!`, itemLabel(ITEM_IDS[e[3]], e[4]), e[4] === 3 ? '#ffd23f' : '#5ff4ff', 1.2); } // the same item again
          else if (e[3] >= 0) { H.roll = 0.55; play('roll'); }
        }
        if (e[3] >= 0) combatBus.emit('pickup', { id: e[1], item: ITEM_IDS[e[3]], lvl: e[4] || 1, up: !!e[5], me: e[1] === meId });
        break;
      case 'use': { const it = ITEM_IDS[e[2]]; play(it === 'rockets' ? 'rockets' : it, e[1] === meId ? 1 : fall(e[1]), pan(e[1])); if (it === 'turbo' && e[1] === meId) haptic('boost'); break; }
      case 'emp': play('emp', fall(e[1]) + 0.2, pan(e[1])); break;
      case 'spin': if (e[1] === meId) { play('spin'); H.banner('SPUN OUT!', '', '#c9b8ff', 1); } break;
      case 'arc': play('arc', e[1] === meId ? 1 : fall(e[1]), pan(e[1])); break;
      case 'pulse': play('pulse', e[1] === meId ? 1 : fall(e[1]), pan(e[1])); break;
      case 'rail': play('rail', e[1] === meId ? 1 : fall(e[1]), pan(e[1])); break;
      case 'blink': play('blink', e[1] === meId ? 1 : fall(e[1]), pan(e[1])); break;
      case 'boom': play('boom', 0.6); combatBus.emit('explode', { x: e[1], y: e[2], r: e[3] === 8 ? 200 : 120 }); break;
      case 'jump': if (e[1] === meId) play('jump'); break;
      case 'mt': if (e[1] === meId) { play('mt' + Math.min(3, Math.max(1, e[2]))); this.mtNow = true; } break;
      case 'bump': if (e[1] === meId || e[2] === meId) { play('bump', Math.min(1, e[3] / 700)); haptic('bump', Math.min(1, e[3] / 900)); } break;
      case 'horn': hornEvent(rc, e[1], fall(e[1])); break;
      case 'lap': {
        if (e[1] !== meId) break;
        const n = e[2], laps = v.hud?.laps || 0;
        if (e[3] != null) this.lapSplit(e[3]);
        if (laps && n > 1 && n <= laps) { H.banner(n === laps ? 'FINAL LAP!' : `LAP ${n}`, '', n === laps ? '#ff9f43' : '#ffffff', 1.6); play(n === laps ? 'final' : 'lap'); }
        break;
      }
      case 'fin':
        if (e[1] === meId) {
          H.banner('FINISH!', `${ORD(e[2])} · ${fmtTime(e[3])}`, '#ffd23f', 3); play('finish');
          // passed someone just before the line: the last moments again, in slow motion
          if (this.mom.finish(v.time)) H.banner('PHOTO FINISH!', 'what a pass', '#5ff4ff', 3.2);
        }
        else H.log(`${this.name(e[1])} finished ${ORD(e[2])}`, '#c9b8ff');
        break;
      case 'elim': {
        // e: ['elim', id, place, cause ('cut' | 'hole' | 'left'), x, y]
        if (e[5] != null && this.elim) this.elim.implode(e[5], e[6]);
        // (you: the HUD keeps KNOCKED OUT · place on screen; the feed says how)
        if (e[1] === meId) { H.log(e[3] === 'hole' ? 'The black hole got you' : 'You were cut', '#ff5f5f'); play('out'); play('cut'); haptic('crash'); }
        else { H.log(`${this.name(e[1])} ${e[3] === 'hole' ? 'fell into the black hole' : 'was cut'}`, '#ff9f43'); play('cut', fall(e[1]) * 0.6 + 0.3, pan(e[1])); }
        if (e[2] === 2) this.mom.markCut(v.time, e[1]); // the final cut: replayed on the results screen
        break;
      }
      case 'duel':
        H.banner('FINAL DUEL', `${this.name(e[1])} vs ${this.name(e[2])}`, '#ffd23f', 2.6); play('duel');
        // slow-mo on the cut that made it (presentation only); a two-racer race starts as a duel
        // (short for the two still driving: they keep steering underneath it)
        if (v.time > 3 && !this.mom.slow) { const racing = e[1] === meId || e[2] === meId; this.mom.finish(v.time, true, racing ? 0.7 : 1.5, racing ? 0.1 : 0.35); }
        break;
      case 'burst':
        if (e[1] === meId) { H.banner('TAKEDOWN BOOST!', e[2] === 'danger' ? 'You hit the racer in danger' : '2 s of speed', '#5ff4ff', 1.4); play('roar'); haptic('boost'); }
        break;
      case 'emo': H.log(`${this.name(e[1])}: ${EMOTES[e[2]] || ''}`, '#5ff4ff'); play('emote', e[1] === meId ? 1 : 0.6); break;
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
