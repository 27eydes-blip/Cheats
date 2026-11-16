// Oblivion GP crash replay on the results screen: the best crash clip moments.js kept (3.4 s around
// your wreck, your takedown or a big crash next to you), looped at 60% speed through its own small
// renderer in the Chase view, explosions set off again at their moment. Draws only while the
// results screen is up (the race renderer stops drawing then).
import { RaceRenderer } from './render.js';
import { replayView } from './moments.js';
import { ElimFx } from './elim.js';

const RATE = 0.6, HOLD = 0.7;
export class ReplayPlayer {
  // box: the element to fill; clip: a moments.js clip; rc: the race client (roster, track)
  constructor(box, clip, rc) {
    this.box = box; this.clip = clip;
    box.innerHTML = '<canvas></canvas><b class="rc-rplabel"></b>';
    box.querySelector('.rc-rplabel').textContent = `REPLAY · ${clip.label || 'BIG CRASH'}`;
    this.cv = box.querySelector('canvas');
    this.R = new RaceRenderer(this.cv);
    this.R.setTrack(rc.T);
    if (clip.cut) this.R.elim = new ElimFx(); // Elimination's final cut: the black hole and the red outline too
    this.rc = { roster: rc.roster, car: null, carEp: 0, T: rc.T, myDriver: () => rc.myDriver() };
    this.v = replayView();
    this.t0 = clip.first(); this.t1 = clip.last(); this.t = this.t0; this.hold = 0; this.bi = 0;
    this.size();
  }
  size() {
    const r = this.box.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(40, Math.round(r.width)), H = Math.max(30, Math.round(r.height));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.R.resize(W, H, d);
    const tl = this.R.setCamera('chase');
    this.cv.style.transform = tl.css; this.cv.style.transformOrigin = tl.origin;
  }
  frame(dt) {
    const c = this.clip;
    if (this.hold > 0) { this.hold -= dt; if (this.hold <= 0) { this.t = this.t0; this.bi = 0; this.R.cm.init = false; this.R.parts.n = 0; } }
    else this.t += dt * RATE;
    if (this.t >= this.t1 && this.hold <= 0) { this.t = this.t1; this.hold = HOLD; }
    const v = c.viewAt(this.t, this.v);
    for (const car of v.cars) car.me = car.id === c.focus; // the camera follows the crash
    if (c.cut) { v.hud.dg = c.focus; v.hud.nx = 0; v.hud.iv = 0; } // (the car about to be cut, outlined)
    // explosions at their moment
    const B = c.booms || [];
    while (this.bi < B.length && B[this.bi].t <= this.t) { const b = B[this.bi++]; if (b.cut && this.R.elim) this.R.elim.implode(b.x, b.y); else this.R.explode(b.x, b.y, b.big); }
    this.R.draw(v, this.rc, this.hold > 0 ? dt * 0.3 : dt * RATE, performance.now());
  }
}
