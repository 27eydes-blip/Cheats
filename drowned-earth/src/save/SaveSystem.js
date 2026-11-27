import * as THREE from 'three';

// Versioned localStorage saves. Bump SAVE_VERSION and add a migration whenever
// the format changes; old saves are upgraded step by step on load.
export const SAVE_VERSION = 3;
const KEY = 'drowned-earth.save';
const MIGRATIONS = {
  // v1 → v2: boat storage + radio state were added
  1: (s) => ({ ...s, version: 2, boat: { ...s.boat, storage: {} }, radio: { index: -1 } }),
  // v2 → v3: Standing, economy, heat, boat upgrades, life-sim
  2: (s) => ({ ...s, version: 3, standing: null, economy: null, heat: null, boat: { ...s.boat, upgrades: {} }, life: null }),
};

export class SaveSystem {
  constructor(ctx) { this.ctx = ctx; this.autosaveT = 60; }
  has() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
  snapshot() {
    const c = this.ctx;
    return {
      version: SAVE_VERSION, savedAt: Date.now(), seed: c.worldMap.seed,
      player: { pos: c.player.position.toArray(), yaw: c.player.yaw, pitch: c.player.pitch, mode: c.player.mode === 'climb' ? 'foot' : c.player.mode },
      boat: { pos: c.boat.pos.toArray(), heading: c.boat.heading, fuel: c.boat.fuel, hull: c.boat.hull, lantern: c.boat.hasLanternRig, upgrades: c.boat.upgrades, tied: c.boat.tied ? { pos: c.boat.tied.pos.toArray(), step: c.boat.tied.step.toArray(), facing: c.boat.tied.facing } : null, storage: c.boatStorage.toJSON() },
      time: { hour: c.time.hour, day: c.time.day }, weather: { state: c.weather.state, hoursLeft: c.weather.hoursLeft, idx: c.weather.scheduleIdx },
      survival: c.survival.toJSON(), inventory: c.inventory.toJSON(),
      flags: c.state.flags, looted: [...c.state.looted], logs: [...c.state.logs], playTime: c.state.playTime, seen: c.state.seenLines,
      story: c.story.toJSON(), trade: c.trade.stock, radio: { index: c.radio.index },
      standing: c.standing.toJSON(), economy: c.economy.toJSON(), heat: c.heat.toJSON(), life: c.life?.toJSON?.() || null,
    };
  }
  save(reason = 'auto') {
    if (this.ctx.scenarioActive || this.ctx.player.mode === 'climb' || this.ctx.survival.blackout) return false;
    try { localStorage.setItem(KEY, JSON.stringify(this.snapshot())); this.ctx.events.emit('saved', reason); return true; } catch (e) { console.warn('save failed', e); return false; }
  }
  read() {
    try {
      let s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return null;
      while (s.version < SAVE_VERSION && MIGRATIONS[s.version]) s = MIGRATIONS[s.version](s);
      if (s.version !== SAVE_VERSION) { console.warn('unsupported save version', s.version); return null; }
      return s;
    } catch (e) { console.warn('corrupt save', e); return null; }
  }
  load() {
    const s = this.read();
    if (!s) return false;
    return this.apply(s);
  }
  apply(s) {
    const c = this.ctx, V = (a) => new THREE.Vector3().fromArray(a);
    c.player.teleport(V(s.player.pos), s.player.yaw); c.player.pitch = s.player.pitch; c.player.mode = s.player.mode;
    c.boat.pos.copy(V(s.boat.pos)); c.boat.heading = s.boat.heading; c.boat.fuel = s.boat.fuel; c.boat.hull = s.boat.hull; c.boat.hasLanternRig = s.boat.lantern;
    c.boat.tied = s.boat.tied ? { pos: V(s.boat.tied.pos), step: V(s.boat.tied.step), facing: s.boat.tied.facing } : null;
    c.time.hour = s.time.hour; c.time.day = s.time.day;
    c.weather.set(s.weather.state, true); c.weather.hoursLeft = s.weather.hoursLeft; c.weather.scheduleIdx = s.weather.idx;
    c.survival.load(s.survival); c.inventory.load(s.inventory); c.boatStorage.load(s.boat.storage);
    Object.keys(c.state.flags).forEach((k) => delete c.state.flags[k]); Object.assign(c.state.flags, s.flags);
    c.state.looted = new Set(s.looted); c.state.logs = new Set(s.logs); c.state.playTime = s.playTime; c.state.seenLines = s.seen || {};
    c.standing.load(s.standing); c.economy.load(s.economy); c.heat.load(s.heat);
    for (const u of Object.keys(s.boat.upgrades || {})) c.boat.applyUpgrade(u);
    if (s.life && c.life) c.life.load(s.life);
    c.events.emit('standing', c.standing.shown);
    c.story.load(s.story); c.trade.stock = s.trade || {}; c.radio.index = s.radio?.index ?? -1;
    c.chunks.update(c.player.position.x, c.player.position.z, true);
    c.events.emit('loaded');
    return true;
  }
  update(dt) {
    if (this.ctx.scenarioActive || this.ctx.mode !== 'play') return;
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 60; this.save('auto'); }
  }
}
