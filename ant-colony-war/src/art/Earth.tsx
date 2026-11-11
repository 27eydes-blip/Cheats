import React from 'react';
import { W } from '../config';
import { mix, rgba } from '../lib/color';
import { fbm, hash2, range } from '../lib/random';
import type { Palette } from './palette';

const STEP = 18;
const samples = (camX: number, depth: number, pad = 160) => {
  const out: number[] = [];
  for (let sx = -pad; sx <= W + pad; sx += STEP) out.push(sx);
  return out.map((sx) => ({ sx, wx: sx + camX * depth }));
};

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
export const smoothPath = (pts: [number, number][], closed = false) => {
  if (pts.length < 2) return '';
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${P[1][0].toFixed(1)},${P[1][1].toFixed(1)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [x0, y0] = P[i - 1], [x1, y1] = P[i], [x2, y2] = P[i + 1], [x3, y3] = P[i + 2];
    d += ` C${(x1 + (x2 - x0) / 6).toFixed(1)},${(y1 + (y2 - y0) / 6).toFixed(1)} ${(x2 - (x3 - x1) / 6).toFixed(1)},${(y2 - (y3 - y1) / 6).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return closed ? d + 'Z' : d;
};

export type TunnelProps = {
  id: string;
  pal: Palette;
  camX: number;
  t: number;
  /** Ceiling and floor centre lines (screen y). */
  ceil: number;
  floor: number;
  depth?: number;
  seed?: number;
  roughness?: number;
  roots?: boolean;
  /** 0..1, how far this layer is faded into the fog. */
  haze?: number;
  /** World x positions of glowing light pools. */
  lights?: number;
  flicker?: number;
  /** Draw dirt above/below too (false for far layers drawn over a filled background). */
  solid?: boolean;
};

/** A cross-section of a tunnel: lit cavity, textured dirt above and below, hanging roots and pebbles. */
export const Tunnel: React.FC<TunnelProps> = (p) => {
  const depth = p.depth ?? 1, seed = p.seed ?? 1, rough = p.roughness ?? 60, haze = p.haze ?? 0;
  const S = samples(p.camX, depth);
  const top = S.map(({ sx, wx }) => [sx, p.ceil + fbm(wx / 260, seed) * rough + fbm(wx / 60, seed + 9) * rough * 0.18] as [number, number]);
  const bot = S.map(({ sx, wx }) => [sx, p.floor + fbm(wx / 300, seed + 5) * rough * 0.7 + fbm(wx / 50, seed + 13) * rough * 0.12] as [number, number]);
  const cavity = smoothPath(top) + ' L' + bot.slice().reverse().map((q) => q.join(',')).join(' L') + ' Z';
  const cavTop = mix(p.pal.cavity0, p.pal.fog, haze * 0.5), cavBot = mix(p.pal.cavity1, p.pal.fog, haze * 0.3);
  const dirt = mix(p.pal.dirt, p.pal.dirtFar, haze);
  const above = `M-200,-400 L${W + 200},-400 L${W + 200},${top[top.length - 1][1]} ` + smoothPath(top.slice().reverse()).replace('M', 'L') + ' Z';
  const below = smoothPath(bot) + ` L${W + 200},${2400} L-200,2400 Z`;
  const mid = (p.ceil + p.floor) / 2;

  // light pools along the tunnel
  const pools: { x: number; r: number; a: number }[] = [];
  const lightN = p.lights ?? 1;
  if (lightN > 0) {
    const span = 900 / lightN;
    const w0 = Math.floor((p.camX * depth - 400) / span), w1 = Math.ceil((p.camX * depth + W + 400) / span);
    for (let c = w0; c <= w1; c++) {
      const h = hash2(c, seed + 77);
      const fl = 0.85 + 0.15 * Math.sin(p.t * (7 + h * 5) + h * 10) * (p.flicker ?? 1);
      pools.push({ x: c * span + h * span * 0.6 - p.camX * depth, r: 380 + h * 260, a: (0.55 + h * 0.4) * fl });
    }
  }

  // pebbles embedded along both edges
  const pebbles: React.ReactNode[] = [];
  S.forEach(({ sx, wx }, i) => {
    if (i % 2) return;
    const cell = Math.floor(wx / (STEP * 2));
    for (const edge of [0, 1]) {
      const h = hash2(cell, seed * 7 + edge);
      if (h > 0.42) continue;
      const y = edge ? bot[i][1] + 6 + h * 30 : top[i][1] - 6 - h * 30;
      const r = 5 + hash2(cell, seed + 3 + edge) * 18;
      const ox = (hash2(cell, seed + 11) - 0.5) * STEP * 2;
      pebbles.push(
        <g key={`${edge}-${cell}`}>
          <ellipse cx={sx + ox} cy={y} rx={r * 1.3} ry={r} fill={mix(dirt, p.pal.strata, 0.55)} />
          <path d={`M${sx + ox - r},${y + (edge ? -r * 0.2 : r * 0.2)} Q${sx + ox},${y + (edge ? -r * 1.1 : r * 1.1)} ${sx + ox + r},${y + (edge ? -r * 0.2 : r * 0.2)}`} stroke={p.pal.rim} strokeOpacity={0.22 * (1 - haze)} strokeWidth={2} fill="none" />
        </g>,
      );
    }
  });

  // strata: faint wavy lines in the dirt
  const strata = range(7).map((k) => {
    const base = k < 4 ? p.ceil - 120 - k * 110 : p.floor + 120 + (k - 4) * 130;
    const pts = S.filter((_, i) => i % 3 === 0).map(({ sx, wx }) => [sx, base + fbm(wx / 400, seed + 40 + k) * 40] as [number, number]);
    return <path key={k} d={smoothPath(pts)} stroke={p.pal.strata} strokeOpacity={0.18 * (1 - haze * 0.6)} strokeWidth={2 + (k % 3)} fill="none" />;
  });

  // roots hanging from the ceiling
  const roots: React.ReactNode[] = [];
  if (p.roots !== false) {
    const span = 150;
    const w0 = Math.floor((p.camX * depth - 300) / span), w1 = Math.ceil((p.camX * depth + W + 300) / span);
    for (let c = w0; c <= w1; c++) {
      const h = hash2(c, seed + 300);
      if (h > 0.55) continue;
      const x0 = c * span + hash2(c, seed + 301) * span - p.camX * depth;
      const y0 = p.ceil + fbm((x0 + p.camX * depth) / 260, seed) * rough - 30;
      const len = 90 + hash2(c, seed + 302) * (p.floor - p.ceil) * 0.75;
      const w = 5 + hash2(c, seed + 303) * 12;
      const sway = Math.sin(p.t * 0.6 + h * 20) * 6;
      const left: [number, number][] = [], right: [number, number][] = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const cx = x0 + Math.sin(u * 3 + h * 9) * 14 * u + sway * u * u;
        const cy = y0 + u * len;
        const ww = w * (1 - u) + 0.6;
        left.push([cx - ww, cy]);
        right.push([cx + ww, cy]);
      }
      const d = smoothPath(left) + ' L' + right.slice().reverse().map((q) => q.join(',')).join(' L') + ' Z';
      roots.push(
        <g key={'r' + c}>
          <path d={d} fill={dirt} />
          <path d={smoothPath(left)} stroke={p.pal.rim} strokeOpacity={0.28 * (1 - haze)} strokeWidth={1.6} fill="none" />
          {hash2(c, seed + 304) < 0.5 && (
            <path d={smoothPath([[x0 + 4, y0 + len * 0.4], [x0 + 26, y0 + len * 0.55], [x0 + 34 + sway, y0 + len * 0.75]])} stroke={dirt} strokeWidth={2.4} fill="none" />
          )}
        </g>,
      );
    }
  }

  return (
    <g>
      <defs>
        <linearGradient id={`${p.id}-cav`} x1="0" x2="0" y1={p.ceil - 80} y2={p.floor + 60} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={cavTop} />
          <stop offset="0.55" stopColor={mix(cavTop, cavBot, 0.5)} />
          <stop offset="1" stopColor={cavBot} />
        </linearGradient>
        <radialGradient id={`${p.id}-pool`}>
          <stop offset="0" stopColor={p.pal.light} stopOpacity={0.8} />
          <stop offset="0.35" stopColor={p.pal.light} stopOpacity={0.3} />
          <stop offset="1" stopColor={p.pal.light} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`${p.id}-clip`}>
          <path d={cavity} />
        </clipPath>
      </defs>
      <path d={cavity} fill={`url(#${p.id}-cav)`} />
      <g clipPath={`url(#${p.id}-clip)`}>
        {pools.map((q, i) => (
          <ellipse key={i} cx={q.x} cy={mid + 40} rx={q.r} ry={q.r * 0.75} fill={`url(#${p.id}-pool)`} opacity={q.a * (1 - haze * 0.6)} />
        ))}
      </g>
      {p.solid !== false && (
        <>
          <path d={above} fill={dirt} />
          <path d={below} fill={dirt} />
        </>
      )}
      {depth >= 1 && strata}
      {/* rim light on the cavity edges */}
      <path d={smoothPath(top)} stroke={p.pal.rim} strokeOpacity={0.35 * (1 - haze)} strokeWidth={2.5} fill="none" />
      <path d={smoothPath(bot)} stroke={p.pal.rim} strokeOpacity={0.5 * (1 - haze)} strokeWidth={3} fill="none" />
      {pebbles}
      {roots}
    </g>
  );
};

/** Floor height of a tunnel at a screen x (so ants can walk on the uneven ground). */
export const floorAt = (sx: number, camX: number, floor: number, seed = 1, rough = 60, depth = 1) => {
  const wx = sx + camX * depth;
  return floor + fbm(wx / 300, seed + 5) * rough * 0.7 + fbm(wx / 50, seed + 13) * rough * 0.12;
};
export const ceilAt = (sx: number, camX: number, ceil: number, seed = 1, rough = 60, depth = 1) => {
  const wx = sx + camX * depth;
  return ceil + fbm(wx / 260, seed) * rough + fbm(wx / 60, seed + 9) * rough * 0.18;
};

/** Dark out-of-focus earth very close to the camera, framing the shot. */
export const Foreground: React.FC<{ pal: Palette; camX: number; t: number; seed?: number; side?: 'both' | 'bottom' | 'top' }> = ({ pal, camX, t, seed = 3, side = 'both' }) => {
  const blobs: React.ReactNode[] = [];
  const span = 520;
  const depth = 1.7;
  const w0 = Math.floor((camX * depth - 600) / span), w1 = Math.ceil((camX * depth + W + 600) / span);
  for (let c = w0; c <= w1; c++) {
    for (const edge of side === 'both' ? [0, 1] : side === 'top' ? [0] : [1]) {
      const h = hash2(c, seed + edge * 17);
      if (h > 0.7) continue;
      const x = c * span + h * span - camX * depth;
      const y = edge ? 1920 + 40 - h * 160 : -60 + h * 160;
      const r = 180 + hash2(c, seed + 5) * 220;
      blobs.push(<ellipse key={`${c}-${edge}`} cx={x} cy={y} rx={r * 1.4} ry={r} fill={pal.dirt} />);
      if (edge === 0 && hash2(c, seed + 9) < 0.6) {
        const sway = Math.sin(t * 0.5 + h * 9) * 10;
        blobs.push(<path key={`root-${c}`} d={smoothPath([[x, y], [x + 30, y + 260], [x - 10 + sway, y + 520], [x + 20 + sway * 1.5, y + 700]])} stroke={pal.dirt} strokeWidth={34 - h * 14} strokeLinecap="round" fill="none" />);
      }
    }
  }
  return <g filter="url(#fgBlur)">{blobs}</g>;
};

export const EarthDefs: React.FC<{ pal: Palette }> = ({ pal }) => (
  <defs>
    <filter id="fgBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
    <filter id="softBlur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" />
    </filter>
    <filter id="farBlur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.2" />
    </filter>
    <linearGradient id="bgGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor={pal.bg0} />
      <stop offset="0.5" stopColor={pal.bg1} />
      <stop offset="1" stopColor={pal.bg0} />
    </linearGradient>
    <radialGradient id="lightGlow">
      <stop offset="0" stopColor={pal.light} stopOpacity={0.6} />
      <stop offset="0.4" stopColor={pal.light} stopOpacity={0.16} />
      <stop offset="1" stopColor={pal.light} stopOpacity={0} />
    </radialGradient>
    <radialGradient id="fogBlob">
      <stop offset="0" stopColor={pal.fog} stopOpacity={0.5} />
      <stop offset="1" stopColor={pal.fog} stopOpacity={0} />
    </radialGradient>
    <radialGradient id="dustBokeh">
      <stop offset="0" stopColor={pal.dust} stopOpacity={0.55} />
      <stop offset="0.6" stopColor={pal.dust} stopOpacity={0.12} />
      <stop offset="1" stopColor={pal.dust} stopOpacity={0} />
    </radialGradient>
    <radialGradient id="emberGlow">
      <stop offset="0" stopColor="#fff1b0" stopOpacity={1} />
      <stop offset="0.25" stopColor="#ff9a2a" stopOpacity={0.8} />
      <stop offset="1" stopColor="#ff3a00" stopOpacity={0} />
    </radialGradient>
    <radialGradient id="smokeBlob">
      <stop offset="0" stopColor="#1a120e" stopOpacity={0.7} />
      <stop offset="1" stopColor="#1a120e" stopOpacity={0} />
    </radialGradient>
    <radialGradient id="darkPool">
      <stop offset="0" stopColor="#000" stopOpacity={0.8} />
      <stop offset="1" stopColor="#000" stopOpacity={0} />
    </radialGradient>
    <linearGradient id="shaft" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor={pal.light} stopOpacity={0.28} />
      <stop offset="1" stopColor={pal.light} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="fireRise" x1="0" x2="0" y1="1" y2="0">
      <stop offset="0" stopColor="#ff4a10" stopOpacity={0.75} />
      <stop offset="0.5" stopColor="#ff7a20" stopOpacity={0.22} />
      <stop offset="1" stopColor="#ff7a20" stopOpacity={0} />
    </linearGradient>
  </defs>
);

export const fogColor = (pal: Palette, k: number) => rgba(pal.fog, k);
