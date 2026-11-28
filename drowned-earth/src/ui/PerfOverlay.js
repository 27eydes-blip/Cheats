// F3: a small frame-rate overlay — fps, average and worst frame time over the
// last second, and where you are (menu / play / life). The same numbers are
// kept on window.__perf for tests and logged once a second while it's open
// (console: "[perf] menu 30 fps · 3.1 ms avg · 5.0 ms worst").
export class PerfOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:200;font:12px/1.4 ui-monospace,monospace;color:#e8f0e8;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:4px;pointer-events:none;display:none;white-space:pre';
    document.body.appendChild(this.el);
    this.on = false;
    this.acc = 0; this.n = 0; this.work = 0; this.worst = 0;
    window.__perf = { fps: 0, frameMs: 0, workMs: 0, worstMs: 0, where: '' };
    addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.toggle(); } });
  }
  toggle() { this.on = !this.on; this.el.style.display = this.on ? 'block' : 'none'; }
  // dt = wall time since the last frame (s); workMs = time this frame spent in our code
  sample(dt, workMs, where) {
    this.acc += dt; this.n++; this.work += workMs; this.worst = Math.max(this.worst, dt * 1000);
    if (this.acc < 1) return;
    const P = window.__perf;
    P.fps = +(this.n / this.acc).toFixed(1); P.frameMs = +((this.acc / this.n) * 1000).toFixed(1);
    P.workMs = +(this.work / this.n).toFixed(1); P.worstMs = Math.round(this.worst); P.where = where;
    this.acc = 0; this.n = 0; this.work = 0; this.worst = 0;
    if (this.on) {
      this.el.textContent = `${where}  ${P.fps} fps\nframe ${P.frameMs} ms (worst ${P.worstMs})\nwork ${P.workMs} ms`;
      console.log(`[perf] ${where} ${P.fps} fps · ${P.frameMs} ms avg · ${P.worstMs} ms worst · ${P.workMs} ms work`);
    }
  }
}
