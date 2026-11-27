import * as THREE from 'three';

// Hybrid 3D moments. A life-sim card can launch one of these: the 3D world is
// snapshotted, staged (time, weather, place, flags), played with a small
// objective banner, judged, and then restored, and the result goes back to the
// life log. Story mode is untouched by anything that happens inside a scene.
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Scenarios {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null;
    this.banner = document.createElement('div');
    this.banner.className = 'scene-banner hidden';
    document.getElementById('ui').appendChild(this.banner);
    ctx.events.on('blackout', () => { if (this.active) this.finish('fail'); });
    ctx.events.on('patrol:evaded', () => { if (this.active?.id === 'patrol_stop') this.finish('success'); });
    ctx.events.on('patrol:stopEnded', (o) => { if (this.active?.id === 'patrol_stop') this.finish(o === 'seized' ? 'fail' : 'success'); });
  }
  defs() {
    const c = this.ctx;
    const linden = c.data.locations.landmarks.find((l) => l.kind === 'start_tower').pos;
    return {
      free: { objective: 'Go where you like. Return when you are ready.', time: 0, setup: () => { c.game.newGame(); c.time.hour = 9; c.weather.set('clear', true); }, check: () => null },
      first_dive: {
        objective: 'Dive through the hole in the lobby floor (Space), search the basement toolbox, and come back up.',
        setup: () => { c.game.newGame(); c.time.hour = 10; c.weather.set('clear', true); c.state.looted.delete('c:linden:basement'); delete c.state.flags.first_salvage; c.player.mode = 'foot'; c.player.teleport(V(linden[0] - 6.7, 0.47, linden[1] + 1.2), Math.PI); c.player.pitch = -0.5; },
        check: () => (c.state.flags.first_salvage && !c.player.headUnder ? 'success' : null),
      },
      festival: {
        objective: 'Find the lantern-bearers on the Exchange and set a lantern on the water.',
        setup: () => { c.game.newGame(); c.time.hour = 18.55; c.weather.set('clear', true); delete c.state.flags.festival_seen; c.inventory.add('festival_lantern', 1, true); c.player.mode = 'foot'; c.player.teleport(V(312, 1.2, 256), Math.PI * 0.95); },
        check: () => (c.state.flags.festival_seen ? 'success' : null),
      },
      patrol_stop: {
        objective: 'A Tide Ward launch is hunting by sound. Cut your engine (C), kill your lights, hide behind something — or face the inspection.',
        setup: () => {
          c.game.newGame(); c.time.hour = 22.4; c.weather.set('fog', true); c.boat.tied = null; c.boat.pos.set(238, 0, 352); c.boat.heading = 2.4; c.player.mode = 'boat';
          c.inventory.add('growth_sample', 1, true);
          const p = c.patrol; p.forceActive = true; p.pos.set(330, 0, 470); p.target.copy(c.boat.pos); p.setState('suspicious'); p.cooldown = 0;
        },
        check: (t) => (t > 140 ? (c.patrol.state === 'chase' ? 'fail' : 'success') : null),
      },
      storm: {
        objective: 'Low Row has torn loose. Get close in the boat, throw a tow line (E), and bring it back to Portage.',
        setup: () => { c.game.newGame(); c.time.hour = 23.7; c.weather.set('storm', true); delete c.state.flags.saved_lowrow; delete c.state.flags.lost_lowrow; c.boat.tied = null; c.boat.pos.set(270, 0, 300); c.boat.heading = 0.8; c.player.mode = 'boat'; setTimeout(() => c.state.community?.breakaway?.start(), 400); },
        check: () => (c.state.flags.saved_lowrow ? 'success' : c.state.flags.lost_lowrow ? 'fail' : null),
      },
      quarantine_dive: {
        objective: 'Climb down the service shaft into the flooded basement. Find what glows. Come back up the shaft.',
        setup: () => {
          c.game.newGame(); c.time.hour = 14; c.weather.set('overcast', true); c.state.logs.delete('teo_03');
          const h = c.data.locations.landmarks.find((l) => l.kind === 'hospital').pos;
          c.player.mode = 'foot'; c.player.teleport(V(h[0] + 20 + 15.3, 3.87, h[1] + 10 - 6.6), Math.PI); c.player.pitch = -0.6;
          c.survival.oxygen = 100;
        },
        check: () => (c.state.logs.has('teo_03') && c.player.position.y > 3 ? 'success' : null),
      },
    };
  }
  start(id, cb) {
    const c = this.ctx;
    const def = this.defs()[id];
    const meta = c.data.life.scenes[id];
    if (!def) { cb('fail'); return; }
    this.snapshot = c.save.snapshot();
    this.active = { id, cb, t: 0, limit: meta.time || 0, def };
    c.scenarioActive = true;
    document.body.classList.add('inscene');
    c.ui.fade(0.6, () => {
      def.setup();
      c.chunks.update(c.player.position.x, c.player.position.z, true);
      c.landmarks.update(c.player.position.x, c.player.position.z);
      c.paused = false; c.input.enabled = true; c.game.setMode('play');
      c.ui.whisper(meta.title);
    });
    this.banner.classList.remove('hidden');
    this.banner.innerHTML = `<b>${meta.title}</b><span>${def.objective}</span><em></em><button class="btn" data-skip>${id === 'free' ? 'Return to your life' : 'Give up'}</button>`;
    this.banner.querySelector('[data-skip]').onclick = () => this.finish(id === 'free' ? 'success' : 'fail');
  }
  update(dt) {
    const a = this.active;
    if (!a || this.ctx.paused) return;
    a.t += dt;
    if (a.limit) { const left = Math.max(0, a.limit - a.t); this.banner.querySelector('em').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; }
    const r = a.def.check(a.t);
    if (r) this.finish(r);
    else if (a.limit && a.t > a.limit) this.finish('fail');
  }
  finish(res) {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const c = this.ctx;
    this.banner.classList.add('hidden');
    document.body.classList.remove('inscene');
    c.ui.whisper(res === 'success' ? 'It is done.' : 'It goes badly.');
    c.ui.fade(1, () => {
      c.ui.close(true);
      c.save.apply(this.snapshot);
      c.patrol.forceActive = false; c.patrol.setState('patrol');
      c.scenarioActive = false;
      c.game.setMode('life');
      a.cb(res);
    }, 0.3);
  }
}
