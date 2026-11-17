// The pre-race card's backdrop: a hyperspace warp (stars streaking out of the centre, faster as the
// start gets close) and a radar that sweeps for racers (one blip per racer found).
// Low Graphics: fewer stars, no streak trails. Reduce Flashing: no blip flare, steady glow.
// Runs its own frame loop only while the card is on screen; DPR capped at 1.5 (it is a backdrop).
export class WaitFx {
  constructor(canvas, { low = false, calm = false } = {}) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.low = low; this.calm = calm;
    this.stars = Array.from({ length: low ? 70 : 170 }, () => this.star(Math.random()));
    this.n = 0; this.max = 10; this.urgency = 0; this.sweep = 0; this.blips = [];
    this.raf = 0; this.last = 0; this.W = 0; this.H = 0;
  }
  star(z) {
    const a = Math.random() * Math.PI * 2, r = 0.02 + Math.random() * 0.98;
    const hue = Math.random();
    return { a, r, z, c: hue < 0.55 ? '190,240,255' : hue < 0.8 ? '200,160,255' : '255,120,210' };
  }
  // racers found so far (adds a blip for each new one) and how close the start is (0..1)
  set(n, max, urgency) {
    this.max = max || this.max;
    while (this.blips.length < n) this.blips.push({ a: (this.blips.length * 2.39996) % (Math.PI * 2), r: 0.35 + ((this.blips.length * 0.37) % 0.55), born: performance.now() });
    this.blips.length = Math.min(this.blips.length, n);
    this.n = n; this.urgency = Math.max(0, Math.min(1, urgency || 0));
  }
  start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); } }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  size() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(1.5, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
    if (W !== this.W || H !== this.H) { this.cv.width = this.W = W; this.cv.height = this.H = H; }
    this.d = d;
  }
  frame(t) {
    if (!this.cv.isConnected || this.cv.closest('[hidden]')) { this.raf = 0; return; } // (card gone: stop)
    this.raf = requestAnimationFrame((u) => this.frame(u));
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    this.size();
    const g = this.g, W = this.W, H = this.H, cx = W / 2, cy = H * 0.47, R = Math.hypot(W, H) * 0.6;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(5,8,22,' + (this.low ? 1 : 0.42) + ')'; // (a little left over = motion trails)
    g.fillRect(0, 0, W, H);
    // the warp: stars fly from the centre outwards; the closer the start, the faster
    const speed = 0.12 + this.urgency * 0.9;
    g.lineCap = 'round';
    for (const s of this.stars) {
      const z0 = s.z; s.z += dt * speed * (0.4 + s.z * 1.6);
      if (s.z > 1) { Object.assign(s, this.star(0.02)); continue; }
      const p0 = Math.pow(z0, 2.2) * R * s.r, p1 = Math.pow(s.z, 2.2) * R * s.r;
      const ca = Math.cos(s.a), sa = Math.sin(s.a), al = Math.min(1, s.z * 1.6);
      g.strokeStyle = `rgba(${s.c},${al.toFixed(3)})`;
      g.lineWidth = (0.6 + s.z * 2.2) * this.d;
      g.beginPath(); g.moveTo(cx + ca * (this.low ? p1 - 1 : p0), cy + sa * (this.low ? p1 - 1 : p0)); g.lineTo(cx + ca * p1, cy + sa * p1); g.stroke();
    }
    // the radar: rings, a sweeping beam, a blip for each racer found
    const rr = Math.min(W, H) * 0.42;
    this.sweep = (this.sweep + dt * (1.6 + this.urgency * 2.4)) % (Math.PI * 2);
    g.strokeStyle = 'rgba(52,231,255,.16)'; g.lineWidth = 1.2 * this.d;
    for (const k of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, rr * k, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - rr, cy); g.lineTo(cx + rr, cy); g.moveTo(cx, cy - rr); g.lineTo(cx, cy + rr); g.stroke();
    if (!this.low) {
      const grad = g.createConicGradient ? g.createConicGradient(this.sweep - 0.9, cx, cy) : null;
      if (grad) {
        grad.addColorStop(0, 'rgba(52,231,255,0)'); grad.addColorStop(0.14, 'rgba(52,231,255,.22)'); grad.addColorStop(0.1433, 'rgba(52,231,255,0)'); grad.addColorStop(1, 'rgba(52,231,255,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
      }
    }
    g.strokeStyle = 'rgba(120,245,255,.7)'; g.lineWidth = 2 * this.d;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(this.sweep) * rr, cy + Math.sin(this.sweep) * rr); g.stroke();
    const now = performance.now();
    this.blips.forEach((b, i) => {
      const x = cx + Math.cos(b.a) * rr * b.r, y = cy + Math.sin(b.a) * rr * b.r;
      const age = (now - b.born) / 1000, pop = this.calm ? 0 : Math.max(0, 1 - age * 1.5);
      const col = i === 0 ? '255,63,184' : '52,231,255';
      g.fillStyle = `rgba(${col},${0.25 + 0.25 * pop})`; g.beginPath(); g.arc(x, y, (7 + pop * 18) * this.d, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(x, y, 3.2 * this.d, 0, Math.PI * 2); g.fill();
    });
  }
}
