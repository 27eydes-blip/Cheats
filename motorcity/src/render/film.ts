/** Old-film post effects on the low-res frame: grain, flicker, scratches, dust, vignette, gate weave, cigarette burns. */
import { canvas } from '../art/pixel';

export type FilmLevel = 0 | 1 | 2; // off, reduced, full

export class Film {
  private grains: HTMLCanvasElement[] = [];
  private vig?: HTMLCanvasElement;
  private size = '';
  private scratches: { x: number; life: number; dark: boolean; y0: number; y1: number; drift: number }[] = [];
  private burns: number[] = [];
  private nextBurn = 22 + Math.random() * 20;
  private t = 0;
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
        const r = Math.random();
        if (r < 0.14) { const v = Math.random() < 0.5 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 30 + Math.random() * 50; }
      }
      ctx.putImageData(img, 0, 0);
      return c;
    });
    const [v, vctx] = canvas(W, H);
    const g = vctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, 'rgba(20,12,6,0)'); g.addColorStop(0.7, 'rgba(20,12,6,0.32)'); g.addColorStop(1, 'rgba(8,4,2,0.82)');
    vctx.fillStyle = g; vctx.fillRect(0, 0, W, H);
    this.vig = v;
  }

  apply(ctx: CanvasRenderingContext2D, W: number, H: number, dt: number, level: FilmLevel) {
    this.ensure(W, H);
    this.t += dt;
    // vignette always (part of the look), lighter when reduced/off
    ctx.globalAlpha = level === 0 ? 0.55 : level === 1 ? 0.8 : 1;
    ctx.drawImage(this.vig!, 0, 0);
    ctx.globalAlpha = 1;
    if (level === 0) { this.weave.x = this.weave.y = 0; return; }
    const full = level === 2;
    // grain
    const g = this.grains[(Math.random() * this.grains.length) | 0];
    ctx.globalAlpha = full ? 0.9 : 0.45;
    ctx.drawImage(g, -((Math.random() * 16) | 0), -((Math.random() * 16) | 0));
    ctx.globalAlpha = 1;
    // flicker
    const fl = Math.random();
    if (full) {
      ctx.fillStyle = fl < 0.5 ? `rgba(0,0,0,${fl * 0.09})` : `rgba(255,245,220,${(fl - 0.5) * 0.05})`;
      ctx.fillRect(0, 0, W, H);
    }
    // scratches
    if (Math.random() < (full ? 0.05 : 0.015)) this.scratches.push({ x: Math.random() * W, life: 2 + ((Math.random() * 10) | 0), dark: Math.random() < 0.6, y0: Math.random() < 0.7 ? 0 : Math.random() * H, y1: H, drift: (Math.random() - 0.5) * 0.6 });
    for (const s of this.scratches) {
      s.life--; s.x += s.drift;
      ctx.fillStyle = s.dark ? 'rgba(20,12,6,0.55)' : 'rgba(255,248,230,0.45)';
      ctx.fillRect(Math.round(s.x), s.y0, 1, s.y1 - s.y0);
    }
    this.scratches = this.scratches.filter((s) => s.life > 0);
    // dust specks / hairs
    if (Math.random() < (full ? 0.35 : 0.1)) {
      ctx.fillStyle = Math.random() < 0.7 ? 'rgba(15,10,5,0.7)' : 'rgba(255,250,235,0.6)';
      const x = Math.random() * W, y = Math.random() * H, r = 1 + Math.random() * 2;
      ctx.fillRect(x, y, r, r);
      if (Math.random() < 0.2) { ctx.beginPath(); ctx.strokeStyle = 'rgba(15,10,5,0.5)'; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 4, x + 10, y + 3); ctx.stroke(); }
    }
    // cigarette burns (reel change cue): two flashes ~1 s apart
    this.nextBurn -= dt;
    if (this.nextBurn <= 0) { this.nextBurn = 35 + Math.random() * 30; if (full) this.burns.push(this.t, this.t + 1.1); }
    for (const bt of this.burns) {
      if (this.t < bt || this.t > bt + 0.2) continue;
      const cx = W * 0.86, cy = H * 0.12, r = Math.max(5, W * 0.03);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,252,240,0.95)'); gr.addColorStop(0.65, 'rgba(240,220,170,0.85)'); gr.addColorStop(0.85, 'rgba(60,30,10,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    this.burns = this.burns.filter((bt) => this.t < bt + 0.3);
    // gate weave (applied as CSS transform on the canvas)
    const jump = Math.random() < 0.004 ? (Math.random() - 0.5) * 6 : 0;
    this.weave.x = Math.sin(this.t * 1.7) * 0.6 + Math.sin(this.t * 7.3) * 0.25;
    this.weave.y = Math.sin(this.t * 2.3) * 0.8 + Math.sin(this.t * 11.1) * 0.3 + jump;
    if (!full) { this.weave.x *= 0.4; this.weave.y *= 0.4; }
  }
}
