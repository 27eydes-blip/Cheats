/** Old-film post effects on the low-res frame, deliberately subtle: grain, a gentle flicker, rare
 *  scratches and dust, vignette, slight gate weave, the odd cigarette burn.
 *  Effects advance on a 24 fps "projector" clock, not the display rate, so 120 Hz screens don't
 *  turn the grain into buzzing noise. Level 0 turns everything but a soft vignette off. */
import { canvas } from '../art/pixel';

export type FilmLevel = 0 | 1 | 2; // off, light, full

const FILM_FPS = 24;

export class Film {
  private grains: HTMLCanvasElement[] = [];
  private vig?: HTMLCanvasElement;
  private size = '';
  private scratches: { x: number; life: number; dark: boolean; y0: number; y1: number; drift: number }[] = [];
  private dust: { x: number; y: number; r: number; dark: boolean }[] = [];
  private burns: number[] = [];
  private nextBurn = 40 + Math.random() * 30;
  private t = 0;
  private tick = 0;
  private frameAcc = 0;
  private grain = 0;
  private gx = 0; private gy = 0;
  weave = { x: 0, y: 0 };

  private ensure(W: number, H: number) {
    const key = `${W}x${H}`;
    if (key === this.size) return;
    this.size = key;
    this.grains = [0, 1, 2, 3].map(() => {
      const [c, ctx] = canvas(W + 16, H + 16);
      const img = ctx.createImageData(c.width, c.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.random() < 0.1) { const v = Math.random() < 0.5 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 20 + Math.random() * 30; }
      }
      ctx.putImageData(img, 0, 0);
      return c;
    });
    const [v, vctx] = canvas(W, H);
    const g = vctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, 'rgba(20,12,6,0)'); g.addColorStop(0.7, 'rgba(20,12,6,0.26)'); g.addColorStop(1, 'rgba(8,4,2,0.7)');
    vctx.fillStyle = g; vctx.fillRect(0, 0, W, H);
    this.vig = v;
  }

  apply(ctx: CanvasRenderingContext2D, W: number, H: number, dt: number, level: FilmLevel) {
    this.ensure(W, H);
    this.t += dt;
    ctx.globalAlpha = level === 0 ? 0.5 : level === 1 ? 0.8 : 1;
    ctx.drawImage(this.vig!, 0, 0);
    ctx.globalAlpha = 1;
    if (level === 0) { this.weave.x = this.weave.y = 0; this.scratches.length = 0; this.dust.length = 0; return; }
    const full = level === 2;

    // advance the "projector" at 24 fps
    this.frameAcc += dt;
    let newFrame = false;
    while (this.frameAcc >= 1 / FILM_FPS) { this.frameAcc -= 1 / FILM_FPS; this.tick++; newFrame = true; }
    if (newFrame) {
      this.grain = (this.grain + 1 + ((Math.random() * 3) | 0)) % this.grains.length;
      this.gx = (Math.random() * 16) | 0; this.gy = (Math.random() * 16) | 0;
      for (const s of this.scratches) { s.life--; s.x += s.drift; }
      this.scratches = this.scratches.filter((s) => s.life > 0);
      if (full && Math.random() < 0.025) this.scratches.push({ x: Math.random() * W, life: 2 + ((Math.random() * 4) | 0), dark: Math.random() < 0.6, y0: Math.random() < 0.7 ? 0 : Math.random() * H, y1: H, drift: (Math.random() - 0.5) * 0.4 });
      this.dust.length = 0;
      if (Math.random() < (full ? 0.12 : 0.04)) this.dust.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 1.5, dark: Math.random() < 0.7 });
    }

    // grain
    ctx.globalAlpha = full ? 0.38 : 0.2;
    ctx.drawImage(this.grains[this.grain], -this.gx, -this.gy);
    ctx.globalAlpha = 1;
    // gentle, smooth exposure flicker (full only)
    if (full) {
      const f = Math.sin(this.t * 11) * 0.5 + Math.sin(this.t * 23.7) * 0.3 + Math.sin(this.t * 4.1) * 0.2;
      ctx.fillStyle = f < 0 ? `rgba(0,0,0,${(-f * 0.025).toFixed(3)})` : `rgba(255,245,220,${(f * 0.012).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    for (const s of this.scratches) {
      ctx.fillStyle = s.dark ? 'rgba(20,12,6,0.3)' : 'rgba(255,248,230,0.25)';
      ctx.fillRect(Math.round(s.x), s.y0, 1, s.y1 - s.y0);
    }
    for (const d of this.dust) { ctx.fillStyle = d.dark ? 'rgba(15,10,5,0.45)' : 'rgba(255,250,235,0.4)'; ctx.fillRect(Math.round(d.x), Math.round(d.y), d.r, d.r); }

    // cigarette burns (reel change cue), full only and rare: two flashes ~1 s apart
    this.nextBurn -= dt;
    if (this.nextBurn <= 0) { this.nextBurn = 60 + Math.random() * 40; if (full) this.burns.push(this.t, this.t + 1.1); }
    for (const bt of this.burns) {
      if (this.t < bt || this.t > bt + 0.2) continue;
      const cx = W * 0.86, cy = H * 0.12, r = Math.max(5, W * 0.03);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,252,240,0.8)'); gr.addColorStop(0.65, 'rgba(240,220,170,0.7)'); gr.addColorStop(0.85, 'rgba(60,30,10,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    this.burns = this.burns.filter((bt) => this.t < bt + 0.3);

    // gate weave: a slow, sub-pixel drift (full only); no sudden jumps
    if (full) {
      this.weave.x = Math.sin(this.t * 1.3) * 0.3 + Math.sin(this.t * 3.1) * 0.1;
      this.weave.y = Math.sin(this.t * 1.7) * 0.4 + Math.sin(this.t * 4.3) * 0.1;
    } else { this.weave.x = 0; this.weave.y = 0; }
  }
}
