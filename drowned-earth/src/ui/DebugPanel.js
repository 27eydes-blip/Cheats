// Developer panel (backtick): FPS, draw calls, memory, time, weather,
// Standing, heat, glow, patrol state, and a teleport menu.
export class DebugPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'debugpanel hidden';
    document.body.appendChild(this.el);
    ctx.events.on('key', (code) => { if (code === 'Backquote') this.toggle(); });
    if (ctx.params.has('debug')) this.toggle();
    this.t = 0;
  }
  toggle() { this.el.classList.toggle('hidden'); this.build(); }
  build() {
    if (this.el.classList.contains('hidden')) return;
    const c = this.ctx;
    const tp = [...c.worldMap.landmarks.map((l) => [l.name, l.pos[0], l.pos[1]]), ['Open water', 700, 700]];
    this.el.innerHTML = `<pre class="dbg"></pre><div class="dbgbtns">${tp.map(([n, x, z], i) => `<button data-tp="${i}">${n}</button>`).join('')}</div>
      <div class="dbgbtns"><button data-a="hour">+1 h</button><button data-a="night">22:00</button><button data-a="weather">weather ▸</button><button data-a="heat">heat +20</button><button data-a="scrap">+20 scrap</button><button data-a="glow">glow +0.1</button><button data-a="tier">tier −1</button><button data-a="finale">finale</button></div>`;
    this.el.querySelectorAll('[data-tp]').forEach((b) => (b.onclick = () => {
      const [, x, z] = tp[+b.dataset.tp];
      c.boat.tied = null; c.boat.pos.set(x + 25, 0, z + 25); c.player.mode = 'boat';
      c.chunks.update(x, z, true);
    }));
    const states = Object.keys(c.data.weather.states);
    this.el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'hour') c.time.hour = (c.time.hour + 1) % 24;
      if (a === 'night') c.time.hour = 22;
      if (a === 'weather') c.weather.set(states[(states.indexOf(c.weather.state) + 1) % states.length], true);
      if (a === 'heat') c.heat.add(20, 'debug');
      if (a === 'scrap') c.inventory.add('scrap', 20);
      if (a === 'glow') c.abyss.addGlow(0.1);
      if (a === 'tier') { c.standing.tier = Math.max(1, c.standing.tier - 1); c.events.emit('standing', c.standing.tier); }
      if (a === 'finale') { c.story.setFlag('signal_decoded'); c.story.startFinale(); }
    }));
  }
  update(dt) {
    if (this.el.classList.contains('hidden')) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.25;
    const c = this.ctx, r = c.renderer.info, p = c.player.position;
    const mem = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB heap` : 'n/a';
    this.el.querySelector('.dbg').textContent =
`${c.game.fps.toFixed(0)} fps · ${r.render.calls} calls · ${(r.render.triangles / 1000).toFixed(0)}k tris · ${r.memory.geometries} geo · ${r.memory.textures} tex · ${mem}
${c.settings.quality} · chunks ${c.chunks.stats.loaded} · mode ${c.mode}/${c.player.mode}
day ${c.time.day} ${c.time.clockString()} · ${c.weather.state} · wind ${c.weather.cur.wind.toFixed(2)}
standing ${c.standing.shown}${c.standing.forged != null ? ' (forged)' : ''} · heat ${c.heat.value.toFixed(0)} · glow ${c.state.glow.toFixed(2)} · patrol ${c.patrol.state}
pos ${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)} · depth ${c.player.depth.toFixed(1)} · zone ${c.abyss.zone.id}`;
  }
}
