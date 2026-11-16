// Hologram car pad: your car on a rotating hologram pad with a scanning ring, and its stats as thin
// glowing arcs (Speed, Accel, Handling, Armour) floating around it.
// The car itself comes from a callback, so the pad works with whichever car renderer is current:
//   drawCar(g, w, h, t)  draws the car centred in a w x h box (CSS px; the pad sets the transform)
//   createHoloPad({drawCar, stats: [{label, f: 0..1, v}], title, sub})
//     -> {el, setCar(drawCar), setStats(stats), setTitle(title, sub), burst(), layout(), start(), stop(), destroy()}
// The static parts (pad disc, light cone) are painted once per size; a frame is a few blits, the
// dashed rings, the scan line and the car. Low Graphics: no cone, no scan ring, slower pad.
// Reduce Flashing: the pad holds still and the launch burst is a soft glow, not a streak.
import { onFrame } from './loop.js';
import { quality } from './quality.js';

const TAU = Math.PI * 2;
const DASH_A = [10, 6], DASH_B = [2, 7], NO_DASH = [];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// an SVG arc path (centre 100,100) from angle a0 to a1 (degrees, 0 = right, clockwise)
export function arcPath(r, a0, a1) {
  const p = (a) => [100 + r * Math.cos((a * Math.PI) / 180), 100 + r * Math.sin((a * Math.PI) / 180)].map((v) => v.toFixed(2)).join(' ');
  return `M${p(a0)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${p(a1)}`;
}
// the four readouts: two arcs on the left (bottom-up), two on the right
const ARCS = [{ r: 92, a0: 215, a1: 145, side: 'l' }, { r: 80, a0: 215, a1: 145, side: 'l' }, { r: 92, a0: -35, a1: 35, side: 'r' }, { r: 80, a0: -35, a1: 35, side: 'r' }];

export function createHoloPad({ drawCar = null, stats = [], title = '', sub = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'sp-pad';
  el.innerHTML = `<canvas class="sp-pad-cv" aria-hidden="true"></canvas>
    <svg class="sp-pad-arcs" viewBox="0 0 200 200" aria-hidden="true"></svg>
    <div class="sp-pad-reads"></div>
    <div class="sp-pad-title"><b></b><small></small></div>`;
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), svg = el.querySelector('svg'), reads = el.querySelector('.sp-pad-reads');
  let W = 0, H = 0, dpr = 1, disc = null, cone = null, off = null, burstAt = -1, now = 0, car = drawCar, q = quality();

  function paintStatic() {
    const R = Math.min(W * 0.36, H * 0.3), cx = W / 2, cy = H * 0.7;
    // pad disc: a glowing ellipse with a darker core
    disc = document.createElement('canvas');
    disc.width = Math.ceil(R * 2.4 * dpr); disc.height = Math.ceil(R * 1.0 * dpr);
    const d = disc.getContext('2d'), dw = disc.width, dh = disc.height;
    d.setTransform(dw / 2, 0, 0, dh / 2, dw / 2, dh / 2); // unit circle -> the ellipse box
    let gr = d.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(52,231,255,0.30)'); gr.addColorStop(0.62, 'rgba(52,231,255,0.12)'); gr.addColorStop(0.8, 'rgba(154,107,255,0.22)'); gr.addColorStop(1, 'rgba(154,107,255,0)');
    d.fillStyle = gr; d.beginPath(); d.arc(0, 0, 1, 0, TAU); d.fill();
    // light cone above the pad
    cone = null;
    if (!q.low) {
      cone = document.createElement('canvas');
      cone.width = Math.ceil(R * 2 * dpr); cone.height = Math.ceil(H * 0.62 * dpr);
      const c = cone.getContext('2d'), w = cone.width, h = cone.height;
      gr = c.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(52,231,255,0.22)'); gr.addColorStop(1, 'rgba(52,231,255,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.22, 0); c.lineTo(w * 0.78, 0); c.lineTo(w, h); c.closePath(); c.fill();
    }
    api.R = R; api.cx = cx; api.cy = cy;
  }

  let tick = 0;
  function frame(t, live = false) {
    now = t;
    if (!W) return;
    // the pad turns slowly: 30 redraws a second, 60 during the launch burst
    if (live && burstAt < 0 && (++tick & 1)) return;
    const R = api.R, cx = api.cx, cy = api.cy, calm = q.calm;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (cone) g.drawImage(cone, cx - R, cy - H * 0.62, R * 2, H * 0.62);
    g.drawImage(disc, cx - R * 1.2, cy - R * 0.5, R * 2.4, R * 1.0);
    // rotating rings: dashes slide around the ellipses
    const spin = calm ? 0 : t * (q.low ? 0.25 : 0.6);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(52,231,255,0.85)';
    g.setLineDash(DASH_A); g.lineDashOffset = -spin * 40;
    g.beginPath(); g.ellipse(cx, cy, R, R * 0.32, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(167,123,255,0.8)'; g.setLineDash(DASH_B); g.lineDashOffset = spin * 30;
    g.beginPath(); g.ellipse(cx, cy, R * 0.78, R * 0.25, 0, 0, TAU); g.stroke();
    g.setLineDash(NO_DASH);
    g.strokeStyle = 'rgba(52,231,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(cx, cy + 3, R * 1.12, R * 0.36, 0, 0, TAU); g.stroke();
    // the car (launch burst: it surges forward, streaks behind, then fades back in on the pad)
    const box = Math.min(W * 0.78, H * 0.62), bt = burstAt < 0 ? -1 : t - burstAt;
    let lift = 0, alpha = 1;
    if (bt >= 0 && bt < 1.1) {
      if (calm) alpha = 1;
      else if (bt < 0.55) { lift = (bt / 0.55) ** 2 * H * 0.9; alpha = 1 - bt / 0.55; }
      else { lift = 0; alpha = (bt - 0.55) / 0.55; }
    } else if (bt >= 1.1) burstAt = -1;
    if (bt >= 0 && bt < 0.6) { // glow flash on the pad (steady under Reduce Flashing)
      g.globalAlpha = calm ? 0.35 : 0.8 * (1 - bt / 0.6);
      g.drawImage(disc, cx - R * 1.6, cy - R * 0.7, R * 3.2, R * 1.4);
      g.globalAlpha = 1;
    }
    if (bt >= 0 && bt < 0.55 && !calm && !q.low) { // speed streaks
      g.strokeStyle = 'rgba(191,246,255,0.7)'; g.lineWidth = 2;
      for (let i = -3; i <= 3; i++) { const x = cx + i * box * 0.07, y = cy - box * 0.4 - lift * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + box * 0.35 * (1 - Math.abs(i) * 0.15)); g.stroke(); }
    }
    if (car) {
      g.save();
      g.globalAlpha = alpha;
      // the car stands above the pad's centre (a little hover bob unless calm)
      const bob = calm ? 0 : Math.sin(t * 1.8) * 2;
      g.translate(cx - box / 2, cy - box * 0.72 - lift + bob);
      try { car(g, box, box, calm ? 0 : t); } catch {}
      g.restore();
    }
    // scanning ring: rises through the car and fades, every 2.6 s
    if (!q.low && !calm) {
      const f = (t % 2.6) / 2.6, y = cy - f * box * 0.85, rr = R * (1 - f * 0.35);
      g.globalAlpha = Math.sin(f * Math.PI) * 0.8;
      g.strokeStyle = '#7ff3ff'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(cx, y, rr, rr * 0.3, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
  }

  const api = {
    el, R: 0, cx: 0, cy: 0,
    setCar(fn) { car = fn; if (q.calm || !off) frame(now); },
    setStats(list) {
      stats = list || [];
      svg.innerHTML = ARCS.slice(0, stats.length).map((a, i) => {
        const f = Math.max(0, Math.min(1, stats[i].f));
        return `<path class="sp-arc-bg" d="${arcPath(a.r, a.a0, a.a1)}" pathLength="100"/><path class="sp-arc" style="--f:${(f * 100).toFixed(1)}" d="${arcPath(a.r, a.a0, a.a1)}" pathLength="100"/>`;
      }).join('');
      reads.innerHTML = stats.slice(0, 4).map((s, i) => `<span class="sp-read sp-read-${ARCS[i].side}${i % 2}"><small>${esc(s.label)}</small><b class="sp-flicker">${esc(s.v ?? Math.round(s.f * 100))}</b></span>`).join('');
    },
    setTitle(t1, t2 = '') { el.querySelector('.sp-pad-title b').textContent = t1; el.querySelector('.sp-pad-title small').textContent = t2; },
    burst() {
      burstAt = now || performance.now() / 1000;
      // a still pad (Reduce Flashing) runs the loop just for the burst's glow, then rests again
      if (!off && q.calm) { off = onFrame((t) => frame(t, true)); setTimeout(() => { if (q.calm) { stopLoop(); burstAt = -1; frame(now); } }, 1200); }
    },
    layout() {
      const r = el.getBoundingClientRect();
      const d = Math.min(1.5, window.devicePixelRatio || 1); // (hologram lines: 1.5x is crisp enough, cheaper to upload)
      if (!r.width || (r.width === W && r.height === H && d === dpr && disc)) return;
      W = r.width; H = r.height; dpr = d;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      paintStatic(); frame(now);
    },
    setQuality(nq) { q = nq; if (W) { paintStatic(); frame(now); } },
    start() { start(); },
    stop() { stopLoop(); },
    destroy() { stopLoop(); el.remove(); },
  };
  // Reduce Flashing: nothing on the pad moves, so no loop at all (one frame per change)
  function start() { if (!off && !q.calm) off = onFrame((t) => frame(t, true)); else frame(now || performance.now() / 1000); }
  function stopLoop() { if (off) { off(); off = null; } }
  api.setStats(stats);
  api.setTitle(title, sub);
  return api;
}
