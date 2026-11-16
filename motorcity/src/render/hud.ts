/** In-canvas HUD: brass speedometer, boost gauge, mini track map. (Text readouts live in the DOM.) */
import { canvas, S, text, textCentered } from '../art/pixel';
import type { BuiltTrack } from '../track/builder';

export interface HudState {
  mph: number; maxMph: number; boost: number; boosting: boolean; slip: number;
  track: BuiltTrack; dots: { z: number; player?: boolean; ghost?: boolean }[]; portrait: boolean;
}

const R = 21;

function dialFace(maxMph: number) {
  const n = R * 2 + 4;
  const [c, ctx] = canvas(n, n);
  const cx = n / 2, cy = n / 2;
  // brass bezel
  for (let r = R + 2; r >= R - 2; r--) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = ['#5a3d12', '#a87b2c', '#e8c46a', '#c99a3c', '#7a5418'][R + 2 - r]; ctx.fill();
  }
  // enamel face
  ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, Math.PI * 2); ctx.fillStyle = '#efe3c4'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R - 3, Math.PI * 0.75, Math.PI * 2.25); ctx.strokeStyle = '#b8a888'; ctx.lineWidth = 1; ctx.stroke();
  // ticks + numerals
  const steps = Math.ceil(maxMph / 10);
  for (let i = 0; i <= steps * 2; i++) {
    const v = (i / (steps * 2)) * steps * 10;
    const a = Math.PI * 0.75 + (v / (steps * 10)) * Math.PI * 1.5;
    const r0 = i % 2 ? R - 5 : R - 7;
    ctx.strokeStyle = v > maxMph * 0.85 ? '#9a2a1a' : '#2a1c10';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (R - 3.5), cy + Math.sin(a) * (R - 3.5)); ctx.stroke();
    if (i % 4 === 0) { const t = String(Math.round(v)); textCentered(ctx, t, cx + Math.cos(a) * (R - 11), cy + Math.sin(a) * (R - 11) - 2, '#2a1c10'); }
  }
  textCentered(ctx, 'MPH', cx, cy + 7, '#6a5030');
  return c;
}

export class Hud {
  private face?: HTMLCanvasElement; private faceMax = 0;
  private map?: HTMLCanvasElement; private mapTrack?: BuiltTrack;
  private needle = 0;

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, st: HudState) {
    if (!this.face || this.faceMax !== st.maxMph) { this.face = dialFace(Math.ceil(st.maxMph / 10) * 10); this.faceMax = st.maxMph; }
    const top = 4;
    const dx = 4, dy = top + 18;
    ctx.drawImage(this.face, dx, dy);
    const cx = dx + this.face.width / 2, cy = dy + this.face.height / 2;
    this.needle += (st.mph - this.needle) * 0.25;
    const maxV = Math.ceil(st.maxMph / 10) * 10;
    const jitter = st.mph > 5 ? (Math.random() - 0.5) * 0.8 : 0;
    const a = Math.PI * 0.75 + (Math.min(maxV * 1.08, this.needle + jitter) / maxV) * Math.PI * 1.5;
    ctx.strokeStyle = '#8a1c10'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 3, cy - Math.sin(a) * 3); ctx.lineTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5)); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#c99a3c'; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    // digital-ish odometer drum
    const v = String(Math.round(st.mph)).padStart(2, '0');
    ctx.fillStyle = '#1a120a'; ctx.fillRect(cx - 7, cy + 14, 15, 7);
    text(ctx, v, cx - 5, cy + 15, '#efe3c4');

    // boost gauge: 3 brass-rimmed cells under the dial
    const bx = dx, by = dy + this.face.height + 3;
    for (let i = 0; i < 3; i++) {
      const x = bx + i * 15;
      ctx.fillStyle = '#5a3d12'; ctx.fillRect(x, by, 14, 7);
      ctx.fillStyle = '#1a120a'; ctx.fillRect(x + 1, by + 1, 12, 5);
      const fill = Math.max(0, Math.min(1, st.boost - i));
      if (fill > 0) {
        const full = fill >= 1;
        ctx.fillStyle = st.boosting && full ? (Math.random() < 0.5 ? '#ffd27a' : '#ff9a3a') : full ? '#e8b048' : '#8a6a30';
        ctx.fillRect(x + 1, by + 1, Math.round(12 * fill), 5);
        if (full) { ctx.fillStyle = 'rgba(255,255,220,0.6)'; ctx.fillRect(x + 1, by + 1, 12, 1); }
      }
    }
    text(ctx, 'BOOST', bx + 2, by + 9, '#e8d8b0');
    if (st.slip > 0.3) { ctx.globalAlpha = Math.min(1, st.slip); text(ctx, 'DRAFT', bx + 26, by + 9, '#ffd27a'); ctx.globalAlpha = 1; }

    // mini map (top-right)
    if (!this.map || this.mapTrack !== st.track) this.map = this.buildMap(st.track);
    const ms = this.map.width;
    const mx = W - ms - 4, my = top + 18;
    ctx.drawImage(this.map, mx, my);
    const pts = st.track.map;
    for (const d of st.dots) {
      const f = (((d.z / st.track.length) % 1) + 1) % 1;
      const i = Math.floor(f * pts.length) % pts.length;
      const p = pts[i];
      const x = mx + 4 + p.x * (ms - 8), y = my + 4 + p.y * (ms - 8);
      ctx.fillStyle = d.player ? '#e0402a' : d.ghost ? 'rgba(255,255,255,0.6)' : '#1a120a';
      const r = d.player ? 3 : 2;
      ctx.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), r, r);
      if (d.player) { ctx.fillStyle = '#fff3d0'; ctx.fillRect(Math.round(x - 0.5), Math.round(y - 0.5), 1, 1); }
    }
    void H;
  }

  private buildMap(t: BuiltTrack) {
    this.mapTrack = t;
    const n = 52;
    const [c, ctx] = canvas(n, n);
    ctx.fillStyle = 'rgba(20,12,6,0.55)'; ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = '#a87b2c'; ctx.strokeRect(0.5, 0.5, n - 1, n - 1);
    const pts = t.map;
    ctx.lineWidth = 3; ctx.strokeStyle = '#1a120a';
    const path = () => { ctx.beginPath(); pts.forEach((p, i) => { const x = 4 + p.x * (n - 8), y = 4 + p.y * (n - 8); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); };
    path();
    ctx.lineWidth = 1; ctx.strokeStyle = '#e6d1ad'; path();
    const p0 = pts[0];
    ctx.fillStyle = S[12]; ctx.fillRect(Math.round(4 + p0.x * (n - 8)) - 1, Math.round(4 + p0.y * (n - 8)) - 1, 3, 3);
    return c;
  }
}
