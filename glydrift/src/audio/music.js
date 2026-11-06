// Glydrift's music player: the reggae soundtrack, pre-rendered at build time (./reggae/) and
// played back here with plain Web Audio, with no synthesis at run time, so it costs almost
// nothing per frame.
//
//  stems:   every realm track is four looping mono stems (drums · bass · skank · lead) that
//           fade in with speed: drums + bass first, then the skank, then the lead
//  bridges: every realm boundary has its own pre-rendered bridge (tempo ramp, the next realm's
//           drums + bass fading in, one bass swap on a downbeat, echo throw, filter sweep,
//           riser). It is started on the current track's bar grid so that it lands on the
//           next realm's first beat (its drop) as the player crosses the border
//  cues:    the game asks `cue(realm, fn)`, so the realm title appears exactly on that beat
//  master:  decks → bus → EQ → low-pass (death / pause) → limiter → volume → speakers,
//           with a shared tape-style dub echo
import manifest from "./reggae/manifest.json";
import { speedForMeters, WORLD } from "../config.js";
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";

const BASE = import.meta.env.BASE_URL || "./";
const STEMS = ["drums", "bass", "skank", "lead"];
const LEAD_TIME = 0.12; // seconds of scheduling headroom
const FADE = 0.012; // click-free starts / stops
const SKANK_AT = 0.22; // intensity where the skank comes in
const LEAD_AT = 0.4; // … and the lead
const FALLBACK_BPM = 124; // silent builds keep their old visual beat clock
const JOURNEY = ["void", "solar", "frozen", "glitch", "abyss", "valley", "hurricane"].concat([
  "prism",
  "tidal",
  "chrono",
  "mirror",
]);

const echoTime = (bpm) => (60 / bpm) * 0.75;
const mod = (a, n) => ((a % n) + n) % n;

class MusicEngine {
  constructor() {
    this.unlocked = false;
    this.ready = false;
    this.ctx = null;
    this.deck = null; // the realm track playing now (or about to start)
    this.plan = null; // a bridge in flight: { to, S, L, bridge, deckA, deckB }
    this.bridge = null;
    this.cues = [];
    this.quickCues = [];
    this.buffers = new Map(); // file → Promise<AudioBuffer> (with .value once decoded)
    this.intensity = 0;
    this.intensityAt = -9;
    this.wanted = null;
    this.calm = null;
    this.dropAt = null;
    this.journeyState = null;
    this.log = [];
    this.v = null; // smoothed player speed (m per second of real time)
  }

  // ------------------------------------------------------------------ setup

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    if (this.unlocked || TEST.noaudio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: "interactive" });
    } catch {
      return;
    }
    this.unlocked = true;
    this.ctx.resume?.().catch(() => {});
    this.build();
    // the MP3 decoder may add a little silence in front of every file: measure it once
    this.calib = this.load(manifest.calib.file).then((buf) => {
      const d = buf.getChannelData(0);
      let at = 0;
      for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[at])) at = i;
      this.offset = Math.max(0, at / buf.sampleRate - manifest.calib.mark);
      return this.offset;
    });
    if (this.wanted) this.play(this.wanted.id, this.wanted.opts);
  }

  /**
   * Bring sound back after iOS suspended or "interrupted" the context (app switch, a phone
   * call, Siri, the silent switch). Safe to call often; must run in a gesture to work on iOS.
   */
  revive() {
    const ctx = this.ctx;
    if (!this.unlocked || !ctx) return;
    try {
      if (ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
    } catch {
      /* no audio on this device */
    }
  }

  build() {
    const c = this.ctx;
    this.out = c.createGain();
    this.out.connect(c.destination);
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.limiter.connect(this.out);
    this.lpf = c.createBiquadFilter();
    this.lpf.type = "lowpass";
    this.lpf.frequency.value = 20000;
    this.lpf.connect(this.limiter);
    // a small dip where the sound effects live, so they always cut through the music
    this.eq = c.createBiquadFilter();
    this.eq.type = "peaking";
    this.eq.frequency.value = 2600;
    this.eq.Q.value = 0.9;
    this.eq.gain.value = -2.5;
    this.eq.connect(this.lpf);
    this.bus = c.createGain();
    this.bus.connect(this.eq);
    // the shared dub echo (throws on death, quick changes, the Calm)
    this.sendBus = c.createGain();
    this.delay = c.createDelay(2);
    this.delay.delayTime.value = echoTime(manifest.tracks.menu.bpm);
    const fbLp = c.createBiquadFilter();
    fbLp.type = "lowpass";
    fbLp.frequency.value = 2600;
    const fbHp = c.createBiquadFilter();
    fbHp.type = "highpass";
    fbHp.frequency.value = 250;
    this.feedback = c.createGain();
    this.feedback.gain.value = 0.4;
    this.sendBus.connect(this.delay);
    this.delay.connect(fbLp);
    fbLp.connect(fbHp);
    fbHp.connect(this.feedback);
    this.feedback.connect(this.delay);
    fbHp.connect(this.eq);
    this.ready = true;
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ready) return;
    const st = Save.data.settings;
    const v = st.musicVol ?? 0.7;
    const muted = !!st.muted || v <= 0.001;
    const g = this.out.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(muted ? 0 : v * (this.muffled ? 0.35 : 1), now, 0.04);
  }

  rawContext() {
    return this.ctx;
  }

  // ------------------------------------------------------------------ loading

  load(file) {
    if (!this.buffers.has(file)) {
      const p = fetch(`${BASE}music/${file}`)
        .then((r) => {
          if (!r.ok) throw new Error(`music ${file}: ${r.status}`);
          return r.arrayBuffer();
        })
        .then(
          (ab) =>
            new Promise((res, rej) => {
              // the callback form works on every Safari
              const q = this.ctx.decodeAudioData(ab, res, rej);
              q?.catch?.(() => {});
            }),
        );
      p.then((b) => {
        p.value = b;
      }).catch(() => this.buffers.delete(file));
      this.buffers.set(file, p);
    }
    return this.buffers.get(file);
  }

  filesOf(kind, id) {
    if (kind === "track") return Object.values(manifest.tracks[id].files);
    if (kind === "intro") return Object.values(manifest.tracks[id].intro.files);
    if (kind === "bridge") return Object.values(manifest.bridges[id].files);
    return Object.values(manifest.calm.files);
  }

  /** Start loading a clip; resolves true once every stem is decoded. */
  preload(kind, id) {
    if (!this.ready) return Promise.resolve(false);
    if (kind === "bridge" && !manifest.bridges[id]) return Promise.resolve(false);
    if ((kind === "track" || kind === "intro") && !manifest.tracks[id])
      return Promise.resolve(false);
    return Promise.all([this.calib, ...this.filesOf(kind, id).map((f) => this.load(f))]).then(
      () => true,
      () => false,
    );
  }

  isLoaded(kind, id) {
    if (this.offset === undefined) return false;
    if (kind === "bridge" && !manifest.bridges[id]) return false;
    return this.filesOf(kind, id).every((f) => this.buffers.get(f)?.value);
  }

  /** Keep memory low: forget decoded clips the player has left behind. */
  prune(keepIds) {
    const keep = new Set([manifest.calib.file]);
    for (const id of keepIds) {
      if (manifest.tracks[id]) for (const f of this.filesOf("track", id)) keep.add(f);
      else if (manifest.bridges[id]) for (const f of this.filesOf("bridge", id)) keep.add(f);
      else if (id === "calm") for (const f of this.filesOf("calm")) keep.add(f);
    }
    for (const f of this.filesOf("intro", "menu")) keep.add(f);
    for (const f of [...this.buffers.keys()]) if (!keep.has(f)) this.buffers.delete(f);
  }

  // ------------------------------------------------------------------ clocks

  /** Context time the listener is hearing right now (scheduling time minus output latency). */
  heard() {
    const c = this.ctx;
    const ts = c.getOutputTimestamp?.();
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
      // the timestamp can be a few hundred ms old: carry it forward on the page clock
      const t = ts.contextTime + Math.max(0, performance.now() - ts.performanceTime) / 1000;
      return Math.min(c.currentTime, Math.max(c.currentTime - 0.5, t));
    }
    return c.currentTime - (c.outputLatency || c.baseLatency || 0);
  }

  /** The next bar (or beat) line of a deck at or after time t. */
  nextBoundary(deck, t, unit = deck.bar) {
    return deck.anchor + Math.ceil((t - deck.anchor - 1e-4) / unit) * unit;
  }

  // ------------------------------------------------------------------ decks

  /** Start realm track `id` at context time `when`, from bar `bar` of its loop (or its intro). */
  startDeck(id, when, bar = 0, { intro = false } = {}) {
    const c = this.ctx;
    const t = manifest.tracks[id];
    const off = this.offset + (t.pad || 0); // where the loop starts in the decoded file
    const introLen = intro ? t.intro.length : 0;
    const deck = {
      id,
      bar: t.bar,
      beat: t.bar / 4,
      bpm: t.bpm,
      length: t.length,
      anchor: when + introLen - bar * t.bar,
      start: when,
      sources: [],
      gains: {},
      levels: {},
    };
    deck.gain = c.createGain();
    deck.gain.gain.setValueAtTime(0, c.currentTime);
    deck.gain.gain.setValueAtTime(0, when);
    deck.gain.gain.linearRampToValueAtTime(1, when + FADE);
    deck.filter = c.createBiquadFilter();
    deck.filter.type = "lowpass";
    deck.filter.frequency.value = 20000;
    deck.filter.connect(deck.gain);
    deck.gain.connect(this.bus);
    deck.send = c.createGain();
    deck.send.gain.value = 0;
    deck.gain.connect(deck.send);
    deck.send.connect(this.sendBus);
    const lv = this.layerTargets(id, null);
    for (const stem of STEMS) {
      const g = c.createGain();
      g.gain.value = lv[stem];
      deck.levels[stem] = lv[stem];
      g.connect(deck.filter);
      deck.gains[stem] = g;
      const buf = this.buffers.get(t.files[stem]).value;
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = off;
      s.loopEnd = Math.min(buf.duration, off + t.length);
      s.connect(g);
      if (intro) {
        const si = c.createBufferSource();
        si.buffer = this.buffers.get(t.intro.files[stem]).value;
        si.connect(g);
        si.start(when, this.offset);
        deck.sources.push(si);
        s.start(deck.anchor, off);
      } else s.start(when, off + bar * t.bar);
      deck.sources.push(s);
    }
    this.event("deck", id, when);
    return deck;
  }

  stopDeck(deck, at, fade = FADE) {
    if (!deck || deck.stopped) return;
    deck.stopped = true;
    const g = deck.gain.gain;
    const t = Math.max(this.ctx.currentTime, at);
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, fade / 3);
    for (const s of deck.sources) {
      try {
        s.stop(t + fade * 4 + 0.02);
      } catch {
        /* already stopped */
      }
    }
  }

  startBridge(key, when) {
    const c = this.ctx;
    const b = manifest.bridges[key];
    const br = { key, start: when, land: when + b.land, beats: b.beats, sources: [], gains: {} };
    br.gain = c.createGain();
    br.gain.gain.setValueAtTime(0, c.currentTime);
    br.gain.gain.setValueAtTime(0, when);
    br.gain.gain.linearRampToValueAtTime(1, when + FADE);
    br.gain.connect(this.bus);
    const lv = this.layerTargets(key.split(">")[0], this.deck);
    for (const stem of ["drums", "bass", "music"]) {
      const g = c.createGain();
      g.gain.value = stem === "music" ? lv.skank : 1;
      g.connect(br.gain);
      br.gains[stem] = g;
      const s = c.createBufferSource();
      s.buffer = this.buffers.get(b.files[stem]).value;
      s.connect(g);
      s.start(when, this.offset);
      br.sources.push(s);
    }
    this.event("bridge", key, when);
    return br;
  }

  // ------------------------------------------------------------------ layers

  /** Stem levels for the current speed (menus and the test page play everything). */
  layerTargets(id, deck = this.deck) {
    const live = this.ctx && this.ctx.currentTime - this.intensityAt < 0.6 && id !== "menu";
    const I = live ? this.intensity : 1;
    const up = (at, cur) => (I >= at || (cur === 1 && I >= at - 0.04) ? 1 : 0);
    return {
      drums: 1,
      bass: 1,
      skank: up(SKANK_AT, deck?.levels.skank),
      lead: up(LEAD_AT, deck?.levels.lead),
    };
  }

  /** Bring layers in / out on the next bar line, over half a bar. */
  updateLayers() {
    const d = this.deck;
    const now = this.ctx.currentTime;
    if (!d || this.calm || d.stopped || now < d.start) return;
    const lv = this.layerTargets(d.id, d);
    for (const stem of STEMS) {
      if (lv[stem] === d.levels[stem]) continue;
      d.levels[stem] = lv[stem];
      const at = this.nextBoundary(d, now + 0.05);
      d.gains[stem].gain.setTargetAtTime(lv[stem], at, d.bar / 8);
      this.event("layer", `${d.id}:${stem}=${lv[stem]}`, at);
    }
  }

  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, x));
    if (this.ctx) this.intensityAt = this.ctx.currentTime;
  }

  // ------------------------------------------------------------------ public: play

  /**
   * Play a track: realm tracks start on their drop (`startBar` ≥ 16) or their groove;
   * `{ intro: true }` plays the intro first. Changing tracks goes through a quick dub echo
   * on the current beat. Playing what's already playing (or about to land) changes nothing:
   * so a RETRY in the realm you died in keeps the groove going, while a retry from anywhere
   * else (or mid-bridge) cleanly resets to the first realm.
   */
  play(id, opts = {}) {
    this.wanted = { id, opts };
    if (!this.ready || !manifest.tracks[id]) return;
    if (this.dropAt && id === "abyss") return;
    if (this.plan && this.plan.to === id) return;
    if (!opts.journey) this.journeyState = null;
    if (!this.plan && this.deck?.id === id && !this.deck.stopped && !opts.restart) return;
    this.cancelPlan();
    this.quickTo(id, opts);
  }

  /** Change track on the next beat: echo throw + filter dive on the old one, then the new one. */
  quickTo(id, opts = {}) {
    const token = {};
    this.quickToken = token;
    this.quickPending = true;
    const section = opts.startBar >= 16 ? "drop" : "groove";
    const loads = [this.preload("track", id)];
    if (opts.intro) loads.push(this.preload("intro", id));
    Promise.all(loads).then((ok) => {
      if (token !== this.quickToken) return;
      this.quickPending = false;
      if (!ok.every(Boolean)) return;
      const c = this.ctx;
      const t = manifest.tracks[id];
      const bar = section === "drop" ? t.sections.drop[0] : 0;
      const old = this.deck;
      let L = c.currentTime + LEAD_TIME;
      if (old && !old.stopped && c.currentTime >= old.start) {
        const t1 = this.nextBoundary(old, c.currentTime + LEAD_TIME * 0.5, old.beat);
        this.throwEcho(old, t1, old.beat);
        old.filter.frequency.setValueAtTime(20000, t1);
        old.filter.frequency.exponentialRampToValueAtTime(500, t1 + old.beat);
        this.stopDeck(old, t1 + old.beat * 0.5, old.beat * 0.6);
        L = t1 + old.beat;
      } else if (old) this.stopDeck(old, c.currentTime);
      this.deck = this.startDeck(id, L, bar, { intro: !!opts.intro });
      this.retimeEcho(t.bpm, L);
      this.lastLand = { id, at: L };
      this.event("land", id, L);
      this.prune([id]);
      for (const fn of this.quickCues) this.cues.push({ id, at: L, fn });
      this.quickCues = [];
    });
  }

  throwEcho(deck, at, len) {
    const g = deck.send.gain;
    const t = Math.max(this.ctx.currentTime, at - 0.01);
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.9, at + 0.01);
    g.setTargetAtTime(0, at + len, len);
    this.feedback.gain.setTargetAtTime(0.55, at, 0.05);
    this.feedback.gain.setTargetAtTime(0.4, at + len * 4, 0.5);
  }

  retimeEcho(bpm, at) {
    this.delay.delayTime.setTargetAtTime(echoTime(bpm), Math.max(this.ctx.currentTime, at), 0.15);
  }

  /** Drop a bridge in flight (a retry, the home screen, the Abyss): a short fade, no click. */
  cancelPlan() {
    const p = this.plan;
    if (!p) return;
    this.plan = null;
    const now = this.ctx.currentTime;
    const g = p.bridge.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, 0.04);
    for (const s of p.bridge.sources) this.stopSource(s, now + 0.25);
    this.bridge = null;
    this.killDeck(p.deckB, now, 0.04);
    this.killDeck(p.deckA, now, 0.04);
    this.deck = null;
    this.cues = this.cues.filter((q) => q.id !== p.to);
    this.event("cancel", p.to, now);
  }

  /** Fade a deck out now, even if it was already scheduled to stop later. */
  killDeck(deck, at, tau) {
    if (!deck) return;
    deck.stopped = true;
    const g = deck.gain.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(0, at, tau);
    for (const s of deck.sources) this.stopSource(s, at + tau * 6);
  }

  stopSource(s, at) {
    try {
      s.stop(at);
    } catch {
      /* stopped already */
    }
  }

  stop() {
    this.wanted = null;
    this.journeyState = null;
    if (!this.ready) return;
    this.cancelPlan();
    if (this.deck) this.stopDeck(this.deck, this.ctx.currentTime, 0.6);
    this.deck = null;
    this.cues = [];
    this.endCalm(true);
  }

  // ------------------------------------------------------------------ public: the run

  /**
   * Called every frame while a run is on: watches the distance to the next realm, preloads
   * it, and starts the bridge so it lands on the realm's first beat as the player arrives.
   */
  follow(course, meters, playing) {
    if (!this.ready) return;
    this.tick();
    if (!playing || this.dropAt || this.journeyState) {
      this.hist = [];
      this.v = null;
      return;
    }
    const now = this.ctx.currentTime;
    // player pace: the game's speed curve, scaled by how fast the player really progressed
    // over the last 1.5 s of page time (boosts, slow-mo, time zones, frame hiccups)
    const wall = performance.now() / 1000;
    const prev = this.hist?.[this.hist.length - 1];
    if (prev && (meters < prev[1] || wall - prev[0] > 0.25)) {
      this.hist = []; // a new run, or back from a pause
      this.v = null;
    }
    const hist = (this.hist ||= []);
    hist.push([wall, meters]);
    while (hist.length > 2 && wall - hist[1][0] > 1.5) hist.shift();
    const [w0, m0] = hist[0];
    const model = speedForMeters(meters) / WORLD.pxPerMeter;
    if (wall - w0 > 0.5 && meters >= m0) {
      const ratio =
        (meters - m0) / (wall - w0) / (speedForMeters((meters + m0) / 2) / WORLD.pxPerMeter);
      this.v = model * Math.max(0.5, Math.min(3, ratio));
    } else this.v = this.v ?? model;
    const seg = course.segAt(meters);
    const nxt = course.next(seg);
    const key = `${seg.id}>${nxt.id}`;
    const deck = this.deck;
    if (seg.id === "glitch") {
      this.preload("calm");
      this.preload("track", "abyss");
    }
    if (!deck || deck.id !== seg.id || deck.stopped || this.plan || this.calm) return;
    if (!manifest.bridges[key]) return;
    this.preload("track", nxt.id);
    this.preload("bridge", key);
    if (!this.isLoaded("track", nxt.id) || !this.isLoaded("bridge", key) || !this.v) return;
    // where the screen switches realm: halfway through the colour morph (or at a rift)
    const blend = !seg.dimension && !nxt.dimension ? WORLD.biomeBlend / 2 : 0;
    const Tc = now + this.timeToTravel(meters, seg.end - blend);
    const S = this.nextBoundary(deck, now + LEAD_TIME);
    // commit on the bar whose landing falls closest to the crossing
    const land = manifest.bridges[key].land;
    // (only once the border is in reach of this bridge: never on a stale estimate)
    if (Tc - now < land + 2 * deck.bar && S + land >= Tc - deck.bar / 2) {
      this.commit(key, S);
      this.event("predict", `${key} v=${this.v.toFixed(1)} m=${meters.toFixed(0)}`, Tc);
    }
  }

  /** Seconds to travel from `m` to `m2` at the current pace, following the speed curve. */
  timeToTravel(m, m2) {
    if (m2 <= m || !this.v) return 0;
    const n = 24;
    const f0 = speedForMeters(m);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const a = m + ((m2 - m) * (i + 0.5)) / n;
      t += (m2 - m) / n / (this.v * (speedForMeters(a) / f0));
    }
    return t;
  }

  /** Schedule the bridge `a>b` at bar line S, and the next realm's drop right after it. */
  commit(key, S) {
    const [a, to] = key.split(">");
    const deckA = this.deck;
    const L = S + manifest.bridges[key].land;
    this.stopDeck(deckA, S);
    const bridge = this.startBridge(key, S);
    const t = manifest.tracks[to];
    const deckB = this.startDeck(to, L, t.sections.drop[0]);
    this.plan = { from: a, to, key, S, L, bridge, deckA, deckB };
    this.bridge = bridge;
    this.retimeEcho(t.bpm, L);
    this.event("commit", key, S);
  }

  /**
   * Run `fn` on the first beat of realm `id` (the realm title). If the music isn't already
   * on its way there (or there already), it changes over on the next beat and fires then.
   */
  cue(id, fn) {
    if (!this.ready || !this.deck || !manifest.tracks[id]) return void fn();
    const now = this.heard();
    if (this.plan && this.plan.to === id) {
      this.cues.push({ id, at: this.plan.L, fn });
      return;
    }
    const d = this.deck;
    if (d.id === id && !d.stopped) {
      // landed a little before the border: the title waits for the next beat
      const at = this.lastLand?.id === id && this.lastLand.at > now ? this.lastLand.at : null;
      this.cues.push({ id, at: at ?? this.nextBoundary(d, now + 0.02, d.beat), fn });
      return;
    }
    // not planned (the player got here faster than predicted, a test build, …)
    this.quickCues.push(fn);
    this.cancelPlan();
    this.quickTo(id, { startBar: 16 });
  }

  /**
   * Has the music just landed on realm `id` (its first beat is playing now)? The game shows
   * the realm title at that moment if the border is near (`metersLeft`).
   */
  landedOn(id, metersLeft) {
    if (!this.ready || !this.lastLand || this.lastLand.id !== id || metersLeft > 140) return false;
    const h = this.heard();
    return h >= this.lastLand.at - 0.008 && h < this.lastLand.at + 4;
  }

  /** Fire due cues, finish landings, move layers. Called every frame by the game / test page. */
  tick() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const p = this.plan;
    if (p && now >= p.L) {
      this.deck = p.deckB;
      this.lastLand = { id: p.to, at: p.L };
      this.plan = null;
      this.event("land", p.to, p.L);
      this.prune([p.to, p.key]);
    }
    if (this.bridge && !this.plan && now > this.bridge.land + 4) this.bridge = null;
    if (this.dropAt && this.heard() > this.dropAt + 0.5) this.dropAt = null;
    if (this.cues.length) {
      const h = this.heard();
      const due = this.cues.filter((q) => h >= q.at - 0.008);
      if (due.length) {
        this.cues = this.cues.filter((q) => !due.includes(q));
        for (const q of due) {
          this.event("cue", q.id, q.at, h);
          q.fn();
        }
      }
    }
    this.updateLayers();
    this.journeyTick();
  }

  /** The Abyss: one bar of silence, then the heavy drop. Returns the seconds until the drop. */
  abyssDrop(fallback = 0.5) {
    if (!this.ready || !this.isLoaded("track", "abyss")) {
      this.preload("track", "abyss");
      return fallback;
    }
    const c = this.ctx;
    const now = c.currentTime;
    this.cancelPlan();
    this.endCalm(true);
    if (this.deck) this.stopDeck(this.deck, now, 0.03);
    // the echo goes too: true silence
    for (const g of [this.sendBus.gain, this.feedback.gain]) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, 0.01);
    }
    this.sendBus.gain.setTargetAtTime(1, now + 0.5, 0.05);
    this.feedback.gain.setTargetAtTime(0.4, now + 0.7, 0.1);
    const t = manifest.tracks.abyss;
    const D = now + 0.06 + t.bar;
    this.deck = this.startDeck("abyss", D, t.sections.drop[0]);
    this.retimeEcho(t.bpm, D);
    this.lastLand = { id: "abyss", at: D };
    this.dropAt = D;
    this.event("abyss-drop", "abyss", D);
    this.prune(["abyss"]);
    return Math.max(0.05, D - this.heard());
  }

  /** The blackout timer, driven by the audio clock while the Abyss drop is on its way. */
  syncBlackout(t) {
    if (!this.ready || !this.dropAt) return t;
    return Math.max(0, this.dropAt - this.heard());
  }

  /**
   * The Calm (0..1): starts on a dub drop-out (skank + lead out, an echo throw) at the next
   * bar, then the track dissolves into echo while a heartbeat rises. Safe to call every frame.
   */
  setCalm(level) {
    if (!this.ready || !this.deck) return;
    level = Math.max(0, Math.min(1, level));
    const c = this.ctx;
    if (!this.calm) {
      const d = this.deck;
      if (!this.isLoaded("calm")) {
        this.preload("calm");
        return;
      }
      if (this.plan || d.stopped) return;
      const Tb = this.nextBoundary(d, c.currentTime + 0.05);
      for (const stem of ["skank", "lead"]) d.gains[stem].gain.setTargetAtTime(0, Tb, 0.03);
      this.throwEcho(d, Tb, d.beat * 2);
      // the heartbeat loop, on the track's own bar line (the Glitch Realm shares its 70 BPM)
      const heart = { gain: c.createGain(), sources: [] };
      heart.gain.gain.value = 0;
      heart.gain.connect(this.bus);
      for (const f of this.filesOf("calm")) {
        const s = c.createBufferSource();
        s.buffer = this.buffers.get(f).value;
        s.loop = true;
        const off = this.offset + (manifest.calm.pad || 0);
        s.loopStart = off;
        s.loopEnd = Math.min(s.buffer.duration, off + manifest.calm.length);
        s.connect(heart.gain);
        s.start(Tb, off);
        heart.sources.push(s);
      }
      this.calm = { level: -1, heart, deck: d, start: Tb };
      this.event("calm", d.id, Tb);
    }
    const k = this.calm;
    if (Math.abs(level - k.level) < 0.02) return;
    k.level = level;
    const at = Math.max(c.currentTime, k.start);
    k.deck.gain.gain.setTargetAtTime((1 - level) ** 1.6, at, 0.25);
    k.deck.send.gain.setTargetAtTime(0.25 + 0.5 * (1 - level), at + k.deck.beat * 2, 0.3);
    k.deck.filter.frequency.setTargetAtTime(Math.max(320, 20000 * (1 - level) ** 3), at, 0.3);
    this.feedback.gain.setTargetAtTime(0.45 + 0.2 * level, at, 0.3);
    k.heart.gain.gain.setTargetAtTime(0.3 + 0.7 * level, at, 0.3);
  }

  /** End the Calm. `silence`: cut it (the blackout before the Abyss, or a death). */
  endCalm(silence = false) {
    const k = this.calm;
    if (!this.ready || !k) return;
    this.calm = null;
    const now = this.ctx.currentTime;
    k.heart.gain.gain.cancelScheduledValues(now);
    k.heart.gain.gain.setTargetAtTime(0, now, silence ? 0.01 : 0.2);
    for (const s of k.heart.sources) s.stop(now + (silence ? 0.08 : 1.2));
    if (!silence && !k.deck.stopped) {
      for (const g of [k.deck.gain.gain, k.deck.send.gain, k.deck.filter.frequency])
        g.cancelScheduledValues(now);
      k.deck.gain.gain.setTargetAtTime(1, now, 0.2);
      k.deck.send.gain.setTargetAtTime(0, now, 0.2);
      k.deck.filter.frequency.setTargetAtTime(20000, now, 0.2);
      for (const stem of STEMS) k.deck.levels[stem] = -1; // the layers settle again
    }
    this.feedback.gain.setTargetAtTime(0.4, now, 0.2);
  }

  // ------------------------------------------------------------------ public: effects

  /** Death: a dub echo tail and a filter sweep down. Pending realm titles are dropped. */
  deathSweep() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.cues = [];
    this.quickCues = [];
    if (this.deck && !this.deck.stopped) this.throwEcho(this.deck, now + 0.01, 0.5);
    this.feedback.gain.setTargetAtTime(0.58, now, 0.05);
    this.bus.gain.setTargetAtTime(0.3, now + 0.05, 0.15);
    const f = this.lpf.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(300, now + 0.7);
  }

  /** Back to full range (retry / resume / home). */
  restore(time = 0.35) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const f = this.lpf.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(20000, now + time);
    this.bus.gain.setTargetAtTime(1, now, time / 3);
    this.feedback.gain.setTargetAtTime(0.4, now, 0.3);
  }

  /** Muffle while paused. */
  muffle(on) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const f = this.lpf.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(on ? 700 : 20000, now + 0.25);
    this.muffled = on;
    this.applyVolume();
  }

  /** Chrono Fracture's time zones: golden (slow) muffles the music, red (fast) opens it up. */
  setTempoScale(k) {
    if (!this.ready || !this.deck || this.calm) return;
    if (Math.abs(k - (this.tempoK ?? 1)) < 0.02) return;
    this.tempoK = k;
    const f = k < 1 ? Math.max(900, 20000 * k ** 6) : 20000;
    this.deck.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.12);
  }

  // ------------------------------------------------------------------ visuals & info

  /**
   * Beat clock for visuals: 0..1 position inside the current quarter note of what is
   * audible right now (falls back to a free-running 124 BPM clock before audio starts,
   * so silent test builds keep their timing).
   */
  beatPhase(fallbackSec = 0) {
    if (this.ready && (this.deck || this.bridge)) {
      const h = this.heard();
      const br = this.bridge;
      if (br && h >= br.start && h < br.land) {
        const x = h - br.start;
        const beats = br.beats;
        let i = 0;
        while (i < beats.length - 2 && beats[i + 1] <= x) i++;
        return Math.max(0, Math.min(0.999, (x - beats[i]) / (beats[i + 1] - beats[i])));
      }
      const d = this.deck;
      if (d) return mod((h - d.anchor) / d.beat, 1);
    }
    return (fallbackSec * (FALLBACK_BPM / 60)) % 1;
  }

  section(deck, t) {
    if (t < deck.anchor) return "intro";
    const bar = Math.floor(mod(t - deck.anchor, deck.length) / deck.bar + 1e-6);
    for (const [name, span] of Object.entries(manifest.tracks[deck.id].sections))
      if (name !== "total" && bar >= span[0] && bar < span[1]) return name;
    return "-";
  }

  status() {
    const d = this.deck;
    const h = this.ready ? this.heard() : 0;
    const br = this.bridge;
    const inBridge = br && h >= br.start && h < br.land;
    return {
      id: d && !d.stopped && h >= d.start - 0.05 ? d.id : (this.plan?.from ?? null),
      pending: this.plan?.to ?? null,
      section: this.calm ? "calm" : inBridge ? "bridge" : d ? this.section(d, h) : "-",
      bar: d ? Math.floor(mod(h - d.anchor, d.length) / d.bar) : 0,
      bpm: d ? d.bpm : 0,
      unlocked: this.unlocked,
      running: !!d,
      skipped: 0,
    };
  }

  event(type, id, at, heard) {
    this.log.push({ type, id, at: +at.toFixed(4), heard: heard ? +heard.toFixed(4) : undefined });
    if (this.log.length > 400) this.log.splice(0, 100);
  }

  // ------------------------------------------------------------------ the full journey

  /**
   * Test page: the whole run as one continuous mix: Menu → every realm in order (the Calm and
   * the Abyss drop included) → the four dimensions, through the real bridges. `onEnter(id)`
   * fires on each realm's first beat (null at the end). Speed rises, so the layers build.
   */
  journey(onEnter) {
    if (!this.ready) return false;
    this.stop();
    this.play("menu", { journey: true, restart: true });
    this.journeyState = { i: -1, onEnter, next: null, calmEnd: null };
    for (const id of JOURNEY) this.preload("track", id);
    return true;
  }

  journeyTick() {
    const J = this.journeyState;
    const d = this.deck;
    if (!J || !d || this.plan || this.quickPending) return;
    const now = this.ctx.currentTime;
    // speed rises across the journey (the layers build), then holds
    this.intensity = Math.min(1, 0.12 + Math.max(0, J.i) * 0.11);
    this.intensityAt = now;
    if (J.next === null) {
      // stay a few bars in each realm (from its first beat), then move on
      const hold = J.i < 0 ? 3 : d.bar < 2 ? 8 : 4;
      J.next = Math.max(d.start, d.anchor) + hold * d.bar;
      if (J.i >= 0) J.next = (this.lastLand?.at ?? d.start) + hold * d.bar;
    }
    const cur = J.i >= 0 ? JOURNEY[J.i] : "menu";
    if (J.calmEnd !== null) {
      // the Calm: two bars dissolving, then one bar of silence and the Abyss drop
      this.setCalm(Math.min(1, (now - this.calm.start) / (J.calmEnd - this.calm.start)));
      if (now < J.calmEnd - LEAD_TIME) return;
      J.calmEnd = null;
      this.abyssDrop();
      J.i += 1;
      this.cues.push({ id: "abyss", at: this.dropAt, fn: () => J.onEnter?.("abyss") });
      J.next = null;
      return;
    }
    if (now < J.next - LEAD_TIME) return;
    const nextId = JOURNEY[J.i + 1];
    if (!nextId) {
      this.journeyState = null;
      this.stop();
      J.onEnter?.(null);
      return;
    }
    if (cur === "menu") {
      J.i = 0;
      this.quickCues.push(() => J.onEnter?.(nextId));
      this.quickTo(nextId, { startBar: 16 });
      J.next = null;
      this.lastLand = null;
      return;
    }
    if (cur === "glitch") {
      if (!this.isLoaded("calm") || !this.isLoaded("track", "abyss")) {
        this.preload("calm");
        this.preload("track", "abyss");
        return;
      }
      this.setCalm(0);
      if (this.calm) J.calmEnd = this.calm.start + 2 * d.bar;
      return;
    }
    const key = `${cur}>${nextId}`;
    this.preload("bridge", key);
    this.preload("track", nextId);
    if (!this.isLoaded("bridge", key) || !this.isLoaded("track", nextId)) return;
    this.commit(key, this.nextBoundary(d, now + LEAD_TIME));
    J.i += 1;
    this.cues.push({ id: nextId, at: this.plan.L, fn: () => J.onEnter?.(nextId) });
    J.next = null;
  }
}

export const Music = new MusicEngine();

/** Shared raw AudioContext so SFX and music use a single context (important on iOS). */
export function rawAudioContext() {
  return Music.rawContext();
}

/** Name, style, key and tempo of every reggae track (for the music test page). */
export const TRACK_INFO = manifest.tracks;
export const CALM_INFO = manifest.calm;
export const JOURNEY_ROUTE = JOURNEY;
