import { SEG_LEN, ROAD_W, type Segment, type ProjPt, type WallPiece } from '../track/types';
import type { BuiltTrack } from '../track/builder';
import { groundTex, groundColor, WATER, GTEX_H, GTEX_LEN, GTEX_W } from '../art/ground';
import { FACADE_X, TUNNEL_X, RAIL_X, KERB, CLEAR, WALL_GAP } from '../track/types';
import { spr, hitHalf } from '../art/registry';
import { portals } from '../art/portals';
import { skyline, SKY_LH, type SkylineKind } from '../art/sky';
import { canvas, mix, S } from '../art/pixel';
import type { Weather } from '../data/weather';
import { clamp } from '../core/math';

export interface DrawCar {
  z: number; x: number; img: HTMLCanvasElement; upp: number;
  /** Collision half-width (road units), for the debug overlay. */
  hit?: number;
  alpha?: number; rot?: number; lift?: number; brake?: boolean; head?: boolean; shadow?: boolean;
}
export interface Particle { z: number; x: number; y: number; size: number; alpha: number; tone: string; kind: 'smoke' | 'steam' | 'spark' | 'splash' | 'paper' }
export interface PedDraw { img: HTMLCanvasElement; upp: number; dx: number; dy: number }

export interface Scene {
  track: BuiltTrack;
  playerZ: number;
  camX: number; // road units
  camBob: number; // world units
  player: DrawCar;
  cars: DrawCar[];
  particles: Particle[];
  pedSprite(i: number): PedDraw | null;
  weather: Weather;
  time: number;
  skyX: number;
  /** 0..1 how far the camera is shaking (crash / boost). */
  shake: number;
  headlamps: boolean;
}

export const CAM_H = 900;
export const CAM_DEPTH = 0.84;
export const PLAYER_OFF = CAM_H * CAM_DEPTH; // camera sits this far behind the player
const NEAR = 60;

export class Renderer {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 240; H = 400;
  horizon = 200;
  k = 100;
  portrait = true;
  drawDist = 220;
  private glowImg: HTMLCanvasElement;
  private reflImg: HTMLCanvasElement;
  private beamImg: HTMLCanvasElement;
  private tunnelTex: HTMLCanvasElement;
  private skyCache = new Map<string, HTMLCanvasElement>();
  private glows: { x: number; y: number; r: number; a: number }[] = [];
  private rain: { x: number; y: number; l: number; v: number }[] = [];
  quality = 1;
  /** Draw hitboxes and wall limits (toggle with D). */
  debug = false;
  private curDraw = 0;
  /** 0..1 fade for sprites near the end of the draw distance, so nothing pops in. */
  private edge = 1;

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.ctx = cv.getContext('2d', { alpha: false })!;
    this.glowImg = this.makeGlow(64, [255, 226, 160]);
    this.reflImg = this.makeRefl();
    this.beamImg = this.makeBeam();
    this.tunnelTex = this.makeTunnelTex();
    this.resize();
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.portrait = vh >= vw;
    const short = 240;
    if (this.portrait) { this.W = short; this.H = Math.round((short * vh) / vw); }
    else { this.H = short; this.W = Math.round((short * vw) / vh); }
    this.H = clamp(this.H, 200, 560); this.W = clamp(this.W, 200, 600);
    this.cv.width = this.W; this.cv.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
    const horizonFrac = this.portrait ? 0.45 : 0.46;
    const carFrac = this.portrait ? 0.71 : 0.94;
    this.horizon = Math.round(this.H * horizonFrac);
    const offset = (carFrac - horizonFrac) * this.H;
    this.k = offset * CAM_DEPTH; // screen px per (world unit / camera-space z), see PLAN.md
    this.rain = Array.from({ length: 90 }, () => ({ x: Math.random() * this.W, y: Math.random() * this.H, l: 4 + Math.random() * 8, v: 300 + Math.random() * 200 }));
  }

  // ---------- helpers ----------
  private makeGlow(n: number, rgb: number[]) {
    const [c, ctx] = canvas(n, n);
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(0.25, `rgba(${rgb},0.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
    return c;
  }
  private makeRefl() {
    const [c, ctx] = canvas(16, 64);
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,220,150,0.6)'); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    for (let y = 0; y < 64; y += 2) { const w = 6 + Math.sin(y * 0.7) * 3; ctx.fillRect(8 - w / 2, y, w, 1); }
    return c;
  }
  private makeBeam() {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 64, 0, 32, 64, 64);
    g.addColorStop(0, 'rgba(255,236,190,0.55)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(26, 64); ctx.lineTo(0, 0); ctx.lineTo(64, 0); ctx.lineTo(38, 64); ctx.fill();
    return c;
  }
  private makeTunnelTex() {
    const [c, ctx] = canvas(32, 104);
    ctx.fillStyle = S[3]; ctx.fillRect(0, 0, 32, 104);
    for (let y = 0; y < 104; y += 3) {
      ctx.fillStyle = S[2]; ctx.fillRect(0, y + 2, 32, 1);
      for (let x = (y / 3) % 2 ? 0 : 3; x < 32; x += 6) { ctx.fillStyle = (x * 7 + y) % 5 ? S[4] : S[3]; ctx.fillRect(x, y, 5, 2); }
    }
    ctx.fillStyle = S[1]; ctx.fillRect(0, 96, 32, 8);
    return c;
  }

  private skyGrad(w: Weather) {
    const key = `${w.id}|${this.W}|${this.H}`;
    let c = this.skyCache.get(key);
    if (!c) {
      const [cc, ctx] = canvas(this.W, this.H);
      const g = ctx.createLinearGradient(0, 0, 0, this.horizon);
      g.addColorStop(0, w.skyTop); g.addColorStop(1, w.skyBot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
      if (w.id === 'night') for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,250,230,${Math.random() * 0.7})`; ctx.fillRect(Math.random() * this.W, Math.random() * this.horizon * 0.8, 1, 1); }
      if (w.id === 'night') { ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(this.W * 0.78, this.horizon * 0.22, 7, 0, 7); ctx.fill(); ctx.fillStyle = w.skyTop; ctx.beginPath(); ctx.arc(this.W * 0.78 + 3, this.horizon * 0.22 - 2, 6, 0, 7); ctx.fill(); }
      c = cc; this.skyCache.set(key, c);
    }
    return c;
  }

  private project(p: ProjPt, wx: number, wy: number, zc: number, camY: number) {
    const s = this.k / zc;
    p.s = s; p.z = zc;
    p.x = this.W / 2 + wx * s;
    p.y = this.horizon - (wy - camY) * s;
    p.w = ROAD_W * s;
  }

  // ---------- main ----------
  render(sc: Scene) {
    const { ctx, W, H } = this;
    const tr = sc.track;
    const segs = tr.segs, N = segs.length;
    const w = sc.weather;
    const camZ = ((sc.playerZ - PLAYER_OFF) % tr.length + tr.length) % tr.length;
    const baseI = Math.floor(camZ / SEG_LEN) % N;
    const base = segs[(baseI + N) % N];
    const basePct = (((camZ % SEG_LEN) + SEG_LEN) % SEG_LEN) / SEG_LEN;
    const pSeg = segs[Math.floor(sc.playerZ / SEG_LEN) % N];
    const pPct = ((sc.playerZ % SEG_LEN) + SEG_LEN) % SEG_LEN / SEG_LEN;
    const playerY = pSeg.y1 + (pSeg.y2 - pSeg.y1) * pPct;
    const camY = playerY + CAM_H + sc.camBob;
    const camXw = sc.camX * ROAD_W;
    // draw distance changes (adaptive quality) glide instead of jumping
    const want = this.drawDist * w.view * this.quality;
    this.curDraw = this.curDraw ? this.curDraw + Math.max(-1, Math.min(1, want - this.curDraw)) : want;
    const drawDist = Math.round(this.curDraw);
    const night = w.id === 'night';
    const lampsOn = w.lamps;
    this.glows.length = 0;

    // shake: offset whole frame by a pixel or two
    // smooth, decaying shake built from sines (no per-frame randomness)
    const shx = sc.shake > 0 ? Math.round((Math.sin(sc.time * 53) * 0.6 + Math.sin(sc.time * 37 + 1.3) * 0.4) * sc.shake * 3) : 0;
    const shy = sc.shake > 0 ? Math.round((Math.sin(sc.time * 47 + 0.7) * 0.6 + Math.sin(sc.time * 29) * 0.4) * sc.shake * 2) : 0;
    ctx.save();
    ctx.translate(shx, shy);

    // --- sky + skyline (parallax with curves)
    ctx.drawImage(this.skyGrad(w), 0, 0);
    const sky = skyline(tr.def.skyline as SkylineKind);
    const hz = this.horizon;
    if (w.cloud > 0) { ctx.globalAlpha = w.cloud; this.tileX(sky.clouds, sc.skyX * 0.2 + sc.time * 2, hz - sky.clouds.height - 30 - Math.round(this.H * 0.12), 1); ctx.globalAlpha = 1; }
    const skyScale = this.portrait ? 1 : 1;
    this.tileX(sky.far, sc.skyX * 0.5, hz - SKY_LH * skyScale + 12, skyScale);
    if (w.haze > 0.5) { ctx.globalAlpha = (w.haze - 0.5) * 0.9; ctx.fillStyle = w.fog; ctx.fillRect(0, hz - SKY_LH, W, SKY_LH + 14); ctx.globalAlpha = 1; }
    this.tileX(sky.near, sc.skyX, hz - SKY_LH * skyScale + 18, skyScale);
    ctx.globalAlpha = 0.5 * w.haze; ctx.fillStyle = w.fog; ctx.fillRect(0, hz - 30, W, 40); ctx.globalAlpha = 1;
    // below-horizon default ground
    ctx.fillStyle = mix(groundColor[pSeg.ground], w.fog, 0.6); ctx.fillRect(0, hz + 10, W, H - hz);

    // --- projection
    let x = 0, dx = -(base.curve * basePct);
    const loopLen = tr.length;
    for (let n = 0; n < drawDist; n++) {
      const seg = segs[(baseI + n) % N];
      const looped = baseI + n >= N ? loopLen : 0;
      let z1 = seg.z1 + looped - camZ, z2 = seg.z2 + looped - camZ;
      seg.vis = z2 > NEAR;
      if (!seg.vis) { x += dx; dx += seg.curve; continue; }
      if (z1 < NEAR) z1 = NEAR;
      this.project(seg.p1, x - camXw, seg.y1, z1, camY);
      this.project(seg.p2, x + dx - camXw, seg.y2, z2, camY);
      x += dx; dx += seg.curve;
      const f = n / drawDist;
      seg.fog = clamp(Math.pow(f, w.id === 'fog' ? 0.75 : 1.6) * w.haze, 0, 1);
    }

    // --- draw back to front
    const playerN = Math.floor((((sc.playerZ - camZ) % loopLen + loopLen) % loopLen) / SEG_LEN + basePct);
    const carsBySeg = new Map<number, DrawCar[]>();
    for (const c of sc.cars) {
      let rel = c.z - camZ; if (rel < -SEG_LEN) rel += loopLen; if (rel > loopLen - SEG_LEN) rel -= loopLen;
      const n = Math.floor(rel / SEG_LEN + basePct);
      if (n < 0 || n >= drawDist) continue;
      (carsBySeg.get(n) ?? carsBySeg.set(n, []).get(n)!).push(c);
    }
    const parts = new Map<number, Particle[]>();
    for (const p of sc.particles) {
      let rel = p.z - camZ; if (rel < -SEG_LEN) rel += loopLen; if (rel > loopLen - SEG_LEN) rel -= loopLen;
      const n = Math.floor(rel / SEG_LEN + basePct);
      if (n < 0 || n >= drawDist) continue;
      (parts.get(n) ?? parts.set(n, []).get(n)!).push(p);
    }
    const wire: Record<string, { x: number; y: number; n: number; xs?: number[] } | undefined> = {};
    let lastCable: { l: number; r: number; y: number; n: number } | undefined;

    for (let n = drawDist - 1; n >= 0; n--) {
      const seg = segs[(baseI + n) % N];
      if (!seg.vis) continue;
      const p1 = seg.p1, p2 = seg.p2;
      const backface = p2.y >= p1.y;
      this.edge = clamp((drawDist - 1 - n) / 14, 0, 1);
      if (this.edge < 1) ctx.globalAlpha = this.edge;
      // ground band (grass / water / cobble beyond sidewalks)
      if (!backface && p1.y > 0 && p2.y < H) {
        const y2 = Math.max(0, Math.floor(p2.y)), y1 = Math.min(H, Math.ceil(p1.y));
        if (seg.waterL || seg.waterR) {
          const wc = WATER[(seg.i >> 1) % 2 ? 1 : 2];
          ctx.fillStyle = seg.fog > 0.02 ? mix(wc, w.fog, seg.fog) : wc;
          const lx = seg.waterL ? 0 : p1.x, rx = seg.waterR ? W : p1.x;
          ctx.fillRect(lx, y2, rx - lx, y1 - y2);
          if (!seg.waterL || !seg.waterR) { ctx.fillStyle = mix(groundColor[seg.ground], w.fog, seg.fog); ctx.fillRect(seg.waterL ? p1.x : 0, y2, seg.waterL ? W - p1.x : p1.x, y1 - y2); }
          // sparkles
          if (seg.fog < 0.6) { ctx.fillStyle = night ? '#8a7a50' : '#dcd6c4'; for (let i = 0; i < 2; i++) { const sx = ((seg.i * 37 + i * 101 + Math.floor(sc.time * 3)) * 53) % W; ctx.fillRect(sx, y2 + ((i * 7) % Math.max(1, y1 - y2)), 2, 1); } }
        } else {
          const gc = groundColor[seg.ground];
          ctx.fillStyle = seg.fog > 0.02 ? mix(gc, w.fog, seg.fog) : gc;
          ctx.fillRect(0, y2, W, y1 - y2);
        }
        this.roadRows(seg, w);
      }
      ctx.globalAlpha = 1;
      if (seg.tunnel) this.tunnelSeg(seg, w);
      // facades
      if (seg.wallL) this.wall(seg, seg.wallL, -1, night, w);
      if (seg.wallR) this.wall(seg, seg.wallR, 1, night, w);
      // cars (player included) and particles inside this segment, far to near: they sit behind
      // everything standing on the segment's near edge (sprites, portals) and in front of farther segments
      const cs = carsBySeg.get(n) ?? [];
      if (n === playerN) cs.push(sc.player);
      if (cs.length) {
        const rz = (c: DrawCar) => { let r = c.z - camZ; if (r < -SEG_LEN) r += loopLen; if (r > loopLen - SEG_LEN) r -= loopLen; return r; };
        cs.sort((a, b) => rz(b) - rz(a));
        for (const c of cs) this.car(c, seg, sc, w, c === sc.player);
      }
      const ps = parts.get(n);
      if (ps) for (const p of ps) this.particle(p, seg);
      // bridge cables
      if (seg.cable && (seg.i & 1) === 0) {
        const yy = p1.y - seg.cable * p1.s;
        const lxx = p1.x - RAIL_X * p1.w, rxx = p1.x + RAIL_X * p1.w;
        ctx.strokeStyle = night ? '#2a2420' : mix(S[2], w.fog, seg.fog); ctx.lineWidth = Math.max(1, p1.s * 60);
        if (lastCable && lastCable.n - n <= 3) {
          ctx.beginPath(); ctx.moveTo(lastCable.l, lastCable.y); ctx.lineTo(lxx, yy); ctx.moveTo(lastCable.r, lastCable.y); ctx.lineTo(rxx, yy); ctx.stroke();
        }
        ctx.lineWidth = 1;
        if (seg.i % 4 === 0 && seg.fog < 0.9) { ctx.beginPath(); ctx.moveTo(lxx, yy); ctx.lineTo(lxx, p1.y - 300 * p1.s); ctx.moveTo(rxx, yy); ctx.lineTo(rxx, p1.y - 300 * p1.s); ctx.stroke(); }
        lastCable = { l: lxx, r: rxx, y: yy, n };
      }
      // bunting across the street
      if (seg.bunting && seg.i % 5 === 0 && seg.fog < 0.95) this.bunting(seg, sc.time);
      // sprites, outer first
      const list = seg.sprites;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.ped !== undefined) {
          const pd = sc.pedSprite(s.ped);
          if (!pd) continue;
          this.sprite(pd.img, pd.upp, p1.x + (s.x + pd.dx) * p1.w, p1.y - pd.dy * p1.s, p1.s, seg.fog);
          continue;
        }
        const sp = spr(s.id, s.seed ?? 0);
        if (!sp) continue;
        const img = s.flip && sp.flip ? sp.flip : sp.img;
        const sx = p1.x + s.x * p1.w;
        const sy = p1.y - (s.y ?? 0) * p1.s;
        const r = this.sprite(img, sp.upp, sx, sy, p1.s, seg.fog);
        if (!r) continue;
        if (this.debug && s.hit) {
          const hh = hitHalf(s.id, s.seed ?? 0);
          ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(sx - hh * p1.w) + 0.5, r.y + 0.5, Math.max(1, Math.round(hh * 2 * p1.w)), r.h);
        }
        if (s.lamp && lampsOn) {
          const ty = r.y + (sp.topY ?? 2) * (r.h / img.height);
          const tops = sp.topX ?? [img.width / 2];
          for (const tx of tops) this.glows.push({ x: r.x + (s.flip ? img.width - tx : tx) * (r.w / img.width), y: ty, r: Math.max(6, r.h * 0.45), a: 1 - seg.fog * 0.6 });
        }
        if (s.pole) {
          const key = s.pole + (s.x < 0 ? 'L' : 'R');
          const ty = r.y + (sp.topY ?? 2) * (r.h / img.height);
          const xs = (sp.topX ?? [img.width / 2]).map((tx) => r.x + (s.flip ? img.width - tx : tx) * (r.w / img.width));
          const prev = wire[key];
          if (prev && prev.n - n < 40 && seg.fog < 0.95) {
            ctx.strokeStyle = night ? '#100c0a' : mix(S[1], w.fog, seg.fog * 0.8); ctx.lineWidth = 1;
            ctx.beginPath();
            const pxs = prev.xs ?? [prev.x];
            for (let k = 0; k < xs.length; k++) {
              const ax = pxs[Math.min(k, pxs.length - 1)], ay = prev.y, bx = xs[k], by = ty;
              ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + Math.abs(by - ay) * 0.15 + 2, bx, by);
            }
            ctx.stroke();
          }
          wire[key] = { x: xs[0], y: ty, n, xs };
          if (s.pole === 'trolley' && s.x > 0 && wire.trolleyL && wire.trolleyL.n === n) {
            // span wire across + contact wire along the centre
            ctx.strokeStyle = night ? '#100c0a' : mix(S[1], w.fog, seg.fog * 0.8);
            ctx.beginPath(); ctx.moveTo(wire.trolleyL.x, wire.trolleyL.y); ctx.quadraticCurveTo(p1.x, ty + 4, xs[0], ty); ctx.stroke();
          }
        }
      }
      // portal
      if (seg.portal) this.portal(seg, night, w);
      if (this.debug) this.debugSeg(seg, sc);
    }
    if (this.debug) this.debugCar(sc.player, segs[Math.floor(sc.playerZ / SEG_LEN) % N], sc, true);

    // --- weather + light
    if (w.tint || pSeg.tunnel) {
      ctx.globalCompositeOperation = 'multiply';
      if (w.tint) { ctx.fillStyle = w.tint; ctx.fillRect(0, 0, W, H); }
      if (pSeg.tunnel) { ctx.fillStyle = '#7a6e62'; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (w.id === 'fog') { ctx.globalAlpha = 0.18; ctx.fillStyle = w.fog; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (this.glows.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const g of this.glows) {
        ctx.globalAlpha = g.a * (0.85 + Math.sin(sc.time * 9 + g.x) * 0.05);
        ctx.drawImage(this.glowImg, g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
        if (w.wet) { ctx.globalAlpha = g.a * 0.5; ctx.drawImage(this.reflImg, g.x - g.r * 0.25, g.y + g.r * 1.2, g.r * 0.5, g.r * 4); }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (w.rain) this.rainFx(sc);
    ctx.restore();
  }

  private tileX(img: HTMLCanvasElement, off: number, y: number, scale: number) {
    const w = img.width * scale;
    let x = -(((off % w) + w) % w);
    for (; x < this.W; x += w) this.ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(img.height * scale));
  }

  private roadRows(seg: Segment, w: Weather) {
    const { ctx, H } = this;
    const p1 = seg.p1, p2 = seg.p2;
    const gt = groundTex(seg.finish ? 'finish' : seg.ground, seg.rails, w.wet && !seg.tunnel);
    const yTop = Math.max(0, Math.ceil(p2.y)), yBot = Math.min(H, Math.ceil(p1.y));
    const dy = p1.y - p2.y;
    if (dy <= 0) return;
    const iz1 = 1 / p1.z, iz2 = 1 / p2.z;
    const mip = p2.z > 9000 ? 2 : p2.z > 4000 ? 1 : 0;
    const tex = gt.mips[mip];
    const texH = tex.height;
    const span = FACADE_X;
    for (let y = yTop; y < yBot; y++) {
      const t = (y + 0.5 - p2.y) / dy; // 0 far -> 1 near
      const iz = iz2 + (iz1 - iz2) * t;
      const zc = 1 / iz;
      const wz = seg.z2 - (p2.z - zc);
      let v = Math.floor(((wz % GTEX_LEN) / GTEX_LEN) * texH);
      if (v < 0) v += texH;
      const cx = p2.x + (p1.x - p2.x) * t;
      const hw = (p2.w + (p1.w - p2.w) * t) * span;
      ctx.drawImage(tex, 0, v, GTEX_W, 1, Math.floor(cx - hw), y, Math.ceil(hw * 2) + 1, 1);
    }
    if (seg.fog > 0.02) {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = seg.fog * ga;
      ctx.fillStyle = w.fog;
      ctx.fillRect(0, yTop, this.W, yBot - yTop);
      ctx.globalAlpha = ga;
    }
    void GTEX_H;
  }

  private wall(seg: Segment, wp: WallPiece, side: -1 | 1, night: boolean, w: Weather) {
    const { ctx, W } = this;
    const p1 = seg.p1, p2 = seg.p2;
    const f = wp.f;
    const tex = night && f.night ? f.night : f.tex;
    const X = wp.x * side;
    const xA = p1.x + X * p1.w, xB = p2.x + X * p2.w;
    const tA = p1.y - f.height * p1.s, tB = p2.y - f.height * p2.s;
    const bA = p1.y, bB = p2.y;
    const lo = Math.max(0, Math.floor(Math.min(xA, xB))), hi = Math.min(W, Math.ceil(Math.max(xA, xB)));
    const span = xB - xA;
    if (this.edge < 1) ctx.globalAlpha = this.edge;
    if (Math.abs(span) < 0.01 || hi <= lo) { /* still may draw cap */ }
    else {
      const iz1 = 1 / p1.z, iz2 = 1 / p2.z;
      const uz1 = wp.u0 * iz1, uz2 = wp.u1 * iz2;
      const th = tex.height;
      for (let c = lo; c < hi; c++) {
        const t = clamp((c + 0.5 - xA) / span, 0, 1);
        const iz = iz1 + (iz2 - iz1) * t;
        let u = Math.floor((uz1 + (uz2 - uz1) * t) / iz);
        if (u >= tex.width) u = tex.width - 1; if (u < 0) u = 0;
        const top = tA + (tB - tA) * t, bot = bA + (bB - bA) * t;
        if (bot - top < 0.5) continue;
        ctx.drawImage(tex, u, 0, 1, th, c, Math.floor(top), 1, Math.ceil(bot - top) + 1);
      }
      if (seg.fog > 0.02) {
        ctx.globalAlpha = seg.fog; ctx.fillStyle = w.fog;
        ctx.beginPath(); ctx.moveTo(xA, tA); ctx.lineTo(xB, tB); ctx.lineTo(xB, bB); ctx.lineTo(xA, bA); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // end cap facing the camera at the start of a building
    if (wp.start && f.side) {
      const depth = 1.6;
      const xo = p1.x + (X + side * depth) * p1.w;
      const l = Math.min(xA, xo), r = Math.max(xA, xo);
      if (r > 0 && l < W && r - l > 0.5) {
        ctx.drawImage(night && f.sideNight ? f.sideNight : f.side, Math.floor(l), Math.floor(tA), Math.ceil(r - l), Math.ceil(bA - tA));
        ctx.globalAlpha = 0.25 + seg.fog * 0.75; ctx.fillStyle = seg.fog > 0.05 ? w.fog : '#000';
        ctx.fillRect(Math.floor(l), Math.floor(tA), Math.ceil(r - l), Math.ceil(bA - tA)); ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  private tunnelSeg(seg: Segment, w: Weather) {
    const { ctx } = this;
    const p1 = seg.p1, p2 = seg.p2;
    const hgt = 2600, X = TUNNEL_X;
    for (const side of [-1, 1]) {
      const xA = p1.x + side * X * p1.w, xB = p2.x + side * X * p2.w;
      const tA = p1.y - hgt * p1.s, tB = p2.y - hgt * p2.s;
      const lo = Math.max(0, Math.floor(Math.min(xA, xB))), hi = Math.min(this.W, Math.ceil(Math.max(xA, xB)));
      const span = xB - xA;
      for (let c = lo; c < hi; c++) {
        const t = clamp((c + 0.5 - xA) / span, 0, 1);
        const top = tA + (tB - tA) * t, bot = p1.y + (p2.y - p1.y) * t;
        const u = Math.floor(t * 31);
        ctx.drawImage(this.tunnelTex, u, 0, 1, 104, c, Math.floor(top), 1, Math.ceil(bot - top) + 1);
      }
      // outside the wall: dark rock
      ctx.fillStyle = '#0d0a08';
      if (side < 0) ctx.fillRect(0, Math.floor(Math.min(tA, tB)), Math.max(0, Math.floor(Math.min(xA, xB))), Math.ceil(Math.max(p1.y, p2.y) - Math.min(tA, tB)));
      else ctx.fillRect(Math.ceil(Math.max(xA, xB)), Math.floor(Math.min(tA, tB)), this.W, Math.ceil(Math.max(p1.y, p2.y) - Math.min(tA, tB)));
    }
    // ceiling
    const lA = p1.x - X * p1.w, rA = p1.x + X * p1.w, lB = p2.x - X * p2.w, rB = p2.x + X * p2.w;
    const tA = p1.y - hgt * p1.s, tB = p2.y - hgt * p2.s;
    ctx.fillStyle = seg.i % 6 < 1 ? S[3] : S[1];
    ctx.beginPath(); ctx.moveTo(lA, tA); ctx.lineTo(rA, tA); ctx.lineTo(rB, tB); ctx.lineTo(lB, tB); ctx.fill();
    void w;
  }

  private portal(seg: Segment, night: boolean, w: Weather) {
    const p = portals()[seg.portal!.kind];
    if (!p) return;
    const p1 = seg.p1;
    const wpx = p.halfW * 2 * p1.w;
    const hpx = p.h * p1.s;
    const x = p1.x - wpx / 2, y = p1.y - hpx;
    if (x > this.W || x + wpx < 0) return;
    this.ctx.globalAlpha = (1 - seg.fog * 0.9) * this.edge;
    this.ctx.drawImage(night ? p.night : p.img, Math.floor(x), Math.floor(y), Math.ceil(wpx), Math.ceil(hpx));
    this.ctx.globalAlpha = 1;
    void w;
  }

  private box(cx: number, yb: number, half: number, h: number, col: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(cx - half) + 0.5, Math.round(yb - h) + 0.5, Math.max(1, Math.round(half * 2)), Math.round(h));
  }
  /** Debug overlay: kerb line (yellow) and the soft invisible wall (cyan) on each segment. */
  private debugSeg(seg: Segment, sc: Scene) {
    const ctx = this.ctx, p1 = seg.p1;
    if (p1.y > this.H || p1.y < 0) return;
    const wall = seg.tunnel ? TUNNEL_X : FACADE_X;
    const marks: [number, string][] = [[-KERB, '#ffe040'], [KERB, '#ffe040'], [-(seg.waterL ? RAIL_X : wall) + WALL_GAP, '#20e0ff'], [(seg.waterR ? RAIL_X : wall) - WALL_GAP, '#20e0ff'], [-CLEAR, '#ff60ff'], [CLEAR, '#ff60ff']];
    for (const [u, col] of marks) { ctx.fillStyle = col; ctx.fillRect(Math.round(p1.x + u * p1.w), Math.round(p1.y) - 1, 1, 2); }
    void sc;
  }
  private debugCar(c: DrawCar, seg: Segment, sc: Scene, isPlayer: boolean) {
    const pct = ((c.z % SEG_LEN) + SEG_LEN) % SEG_LEN / SEG_LEN;
    const ww = seg.p1.w + (seg.p2.w - seg.p1.w) * pct;
    const y = seg.p1.y + (seg.p2.y - seg.p1.y) * pct;
    const x = isPlayer ? this.W / 2 + (c.x - sc.camX) * ww : seg.p1.x + c.x * ww;
    this.box(x, y, (c.hit ?? 0.2) * ww, ww * 0.35, '#20ff60');
  }

  private bunting(seg: Segment, t: number) {
    const { ctx } = this;
    const p1 = seg.p1;
    const h = 3300;
    const lx = p1.x - FACADE_X * p1.w, rx = p1.x + FACADE_X * p1.w, y = p1.y - h * p1.s;
    const sag = 500 * p1.s;
    ctx.strokeStyle = S[1]; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, y); ctx.quadraticCurveTo((lx + rx) / 2, y + sag * 2, rx, y); ctx.stroke();
    const n = 14;
    const fs = Math.max(1, 110 * p1.s);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const fx = lx + (rx - lx) * f;
      const fy = y + sag * 4 * f * (1 - f) + Math.sin(t * 6 + i) * 0.5;
      ctx.fillStyle = i % 3 === 0 ? S[12] : i % 3 === 1 ? S[2] : S[8];
      ctx.beginPath(); ctx.moveTo(fx - fs, fy); ctx.lineTo(fx + fs, fy); ctx.lineTo(fx, fy + fs * 2.2); ctx.fill();
    }
  }

  /** Draws a bottom-centred sprite; returns its screen rect. */
  private sprite(img: HTMLCanvasElement, upp: number, x: number, yb: number, s: number, fog: number) {
    const dw = img.width * upp * s, dh = img.height * upp * s;
    if (dw < 0.5 || dh < 0.5) return null;
    const dx = x - dw / 2, dy = yb - dh;
    if (dx > this.W || dx + dw < 0 || dy > this.H || yb < 0) return null;
    const a = (1 - fog * 0.92) * this.edge;
    if (a <= 0.02) return null;
    if (a < 1) this.ctx.globalAlpha = a;
    // round the edges (not position and size separately) so sprites don't shimmer by a pixel as they scale
    const x0 = Math.round(dx), x1 = Math.round(dx + dw), y0 = Math.round(dy), y1 = Math.round(yb);
    this.ctx.drawImage(img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    if (a < 1) this.ctx.globalAlpha = 1;
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  private car(c: DrawCar, seg: Segment, sc: Scene, w: Weather, isPlayer = false) {
    const { ctx } = this;
    const pct = ((c.z % SEG_LEN) + SEG_LEN) % SEG_LEN / SEG_LEN;
    const p1 = seg.p1, p2 = seg.p2;
    const s = p1.s + (p2.s - p1.s) * pct;
    const cx = p1.x + (p2.x - p1.x) * pct;
    const cy = p1.y + (p2.y - p1.y) * pct;
    const ww = p1.w + (p2.w - p1.w) * pct;
    let x = cx + c.x * ww;
    if (isPlayer) x = this.W / 2 + (c.x - sc.camX) * ww;
    const y = cy - (c.lift ?? 0) * s;
    const dw = c.img.width * c.upp * s, dh = c.img.height * c.upp * s;
    if (dw < 0.6) return;
    const fog = isPlayer ? 0 : seg.fog;
    const a = (c.alpha ?? 1) * (1 - fog * 0.9) * (isPlayer ? 1 : this.edge);
    if (a <= 0.02) return;
    ctx.globalAlpha = a;
    if (c.rot) {
      ctx.save(); ctx.translate(x, y - dh / 2); ctx.rotate(c.rot);
      ctx.drawImage(c.img, -dw / 2, -dh / 2, dw, dh); ctx.restore();
    } else { const x0 = Math.round(x - dw / 2), x1 = Math.round(x + dw / 2), y0 = Math.round(y - dh), y1 = Math.round(y); ctx.drawImage(c.img, x0, y0, x1 - x0, y1 - y0); }
    if (this.debug && c.hit && !isPlayer) this.box(x, y, c.hit * ww, dh * 0.6, '#ffd000');
    ctx.globalAlpha = 1;
    if (c.brake || (w.lamps && !isPlayer)) {
      // tail lamp glow
      const gy = y - dh * 0.16, gr = Math.max(3, dw * (c.brake ? 0.16 : 0.08));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (c.brake ? 0.8 : 0.4) * a;
      for (const sd of [-0.24, 0.24]) ctx.drawImage(this.glowRed(), x + sd * dw - gr, gy - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (isPlayer && sc.headlamps) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      const bw = dw * 2.6, bh = dh * 2.2;
      ctx.drawImage(this.beamImg, x - bw / 2, y - dh * 0.55 - bh, bw, bh);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  private redGlow?: HTMLCanvasElement;
  private glowRed() { return (this.redGlow ??= this.makeGlow(32, [255, 70, 40])); }

  private particle(p: Particle, seg: Segment) {
    const { ctx } = this;
    const pct = ((p.z % SEG_LEN) + SEG_LEN) % SEG_LEN / SEG_LEN;
    const p1 = seg.p1, p2 = seg.p2;
    const s = p1.s + (p2.s - p1.s) * pct;
    const x = p1.x + (p2.x - p1.x) * pct + p.x * (p1.w + (p2.w - p1.w) * pct);
    const y = p1.y + (p2.y - p1.y) * pct - p.y * s;
    const r = Math.max(1, p.size * s);
    ctx.globalAlpha = p.alpha * (1 - seg.fog);
    ctx.fillStyle = p.tone;
    if (p.kind === 'spark' || p.kind === 'paper') ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(r)), Math.max(1, Math.round(r * (p.kind === 'paper' ? 0.7 : 1))));
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  private rainFx(sc: Scene) {
    const { ctx, W, H } = this;
    ctx.strokeStyle = 'rgba(230,230,225,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    const dt = 1 / 60;
    for (const r of this.rain) {
      r.y += r.v * dt; r.x -= r.v * dt * 0.15;
      if (r.y > H) { r.y = -r.l; r.x = Math.random() * W * 1.2; }
      ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.l * 0.15, r.y + r.l);
    }
    ctx.stroke();
    void sc;
  }
}
