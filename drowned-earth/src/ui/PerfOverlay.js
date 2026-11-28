// Frame-time recorder.
//   F3 — overlay: fps, 1% low, average / worst frame, draw calls, triangles, what's streaming.
//   F4 — download the log (JSON): every recent frame's ms, draw calls, triangles, shader compiles,
//        texture uploads, chunk / landmark loads, likely GC pauses, and what the player was doing,
//        plus the 10 worst spikes with their likely cause.
// Numbers are also kept on window.__perf (menu and play) for tests.
const KEEP = 5400;   // ~3 minutes at 30 fps

export class PerfOverlay {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:200;font:12px/1.4 ui-monospace,monospace;color:#e8f0e8;background:rgba(0,0,0,.65);padding:4px 8px;border-radius:4px;pointer-events:none;display:none;white-space:pre';
    document.body.appendChild(this.el);
    this.on = false;
    this.frames = []; this.win = [];
    this.acc = 0; this.n = 0; this.work = 0; this.worst = 0;
    this.pending = { chunks: 0, landmarks: [] };
    this.lastProg = 0; this.lastTex = 0; this.lastHeap = 0;
    window.__perf = { fps: 0, low1: 0, frameMs: 0, workMs: 0, worstMs: 0, where: '' };
    addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.toggle(); }
      if (e.code === 'F4') { e.preventDefault(); this.download(); }
    });
  }
  // world events that explain spikes (called once the world exists)
  watch(events) {
    events.on('chunk:built', () => { this.pending.chunks++; });
    events.on('landmark:loaded', (x) => { this.pending.landmarks.push(x?.def?.id || '?'); });
  }
  toggle() { this.on = !this.on; this.el.style.display = this.on ? 'block' : 'none'; }
  activity() {
    const c = this.ctx, p = c.player;
    if (!p) return c.mode || 'menu';
    const m = p.mode === 'boat' ? `boat ${c.boat.vel.length().toFixed(1)} m/s` : p.mode === 'swim' ? (p.headUnder ? 'diving' : 'swimming') : `on foot${c.input.move.y || c.input.move.x ? ' (moving)' : ''}`;
    return m;
  }
  area() {
    const c = this.ctx, p = c.player; if (!p || !c.worldMap) return '';
    if (this._areaT && performance.now() - this._areaT < 1000) return this._area;
    let best = 'open water', bd = 300;
    for (const l of c.worldMap.landmarks) { const d = Math.hypot(p.position.x - l.pos[0], p.position.z - l.pos[1]); if (d < bd) { bd = d; best = l.name; } }
    this._areaT = performance.now(); this._area = best;
    return best;
  }
  // dt = wall time since the last frame (s); workMs = time spent in our code this frame
  sample(dt, workMs, where) {
    const c = this.ctx, r = c.renderer, info = r?.info;
    const progs = info?.programs?.length || 0, tex = info?.memory?.textures || 0;
    const heap = performance.memory?.usedJSHeapSize || 0;
    const rec = {
      t: +(performance.now() / 1000).toFixed(2), ms: +(dt * 1000).toFixed(1), work: +workMs.toFixed(1), where,
      calls: info?.render?.calls || 0, tris: info?.render?.triangles || 0,
      shaders: Math.max(0, progs - this.lastProg), textures: Math.max(0, tex - this.lastTex),
      chunks: this.pending.chunks, landmarks: this.pending.landmarks.join(' '),
      gcMB: this.lastHeap && heap && heap < this.lastHeap - 2e6 ? +((this.lastHeap - heap) / 1e6).toFixed(1) : 0,
      doing: this.activity(), area: this.area(),
    };
    if (rec.shaders && info?.programs) rec.newShaders = info.programs.slice(-rec.shaders).map((pr) => pr.name || pr.type || '?').join(', ');
    this.lastProg = progs; this.lastTex = tex; this.lastHeap = heap;
    this.pending.chunks = 0; this.pending.landmarks = [];
    this.frames.push(rec); if (this.frames.length > KEEP) this.frames.shift();
    this.win.push(rec.ms); if (this.win.length > 300) this.win.shift();
    this.acc += dt; this.n++; this.work += workMs; this.worst = Math.max(this.worst, dt * 1000);
    if (this.acc < 1) return;
    const P = window.__perf, sorted = [...this.win].sort((a, b) => b - a), k = Math.max(1, Math.floor(sorted.length / 100));
    P.fps = +(this.n / this.acc).toFixed(1); P.frameMs = +((this.acc / this.n) * 1000).toFixed(1);
    P.low1 = +(1000 / (sorted.slice(0, k).reduce((a, b) => a + b, 0) / k)).toFixed(1);   // 1% low over the last ~300 frames
    P.workMs = +(this.work / this.n).toFixed(1); P.worstMs = Math.round(this.worst); P.where = where;
    this.acc = 0; this.n = 0; this.work = 0; this.worst = 0;
    if (this.on) {
      this.el.textContent = `${where} · ${rec.doing} · ${rec.area}\n${P.fps} fps (1% low ${P.low1})\nframe ${P.frameMs} ms · worst ${P.worstMs} ms · work ${P.workMs} ms\n${rec.calls} draws · ${(rec.tris / 1000).toFixed(0)}k tris · scale ${Math.round((c.pipeline?.scale ?? 1) * 100)}%\nF4: save log`;
      console.log(`[perf] ${where} ${P.fps} fps · 1% low ${P.low1} · ${P.frameMs} ms avg · ${P.worstMs} ms worst`);
    }
  }
  // the ten worst frames and what was happening on each
  spikes(n = 10) {
    return [...this.frames].sort((a, b) => b.ms - a.ms).slice(0, n).map((f) => ({ ...f, cause: f.shaders ? `${f.shaders} shader compile(s)` : f.landmarks ? `landmark loaded: ${f.landmarks}` : f.chunks ? `${f.chunks} chunk(s) built` : f.textures ? `${f.textures} texture upload(s)` : f.gcMB ? `garbage collection (~${f.gcMB} MB)` : f.work > f.ms * 0.6 ? 'game logic' : 'rendering' }));
  }
  download() {
    const log = { when: new Date().toISOString(), quality: this.ctx.settings?.quality, gpu: this.ctx.settings?.gpu, perf: window.__perf, worst: this.spikes(10), frames: this.frames };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(log)], { type: 'application/json' }));
    a.download = `drowned-earth-frames-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.ctx.ui?.toast('Frame log saved (F4).');
  }
}
