import React from 'react';
import { hash2, range } from '../lib/random';
import { smoothPath } from './Earth';

/** A ground beetle in side view, digging (front legs scrape, body rocks). Can be drawn as a glowing outline. */
export const Beetle: React.FC<{ t: number; x: number; y: number; scale?: number; dir?: 1 | -1; fill?: string; rim?: string; outline?: string; dig?: number }> = ({ t, x, y, scale = 1, dir = 1, fill = '#0b0705', rim = '#ffb066', outline, dig = 1 }) => {
  const rock = Math.sin(t * 6) * 0.04 * dig;
  const st = outline ?? 'none';
  const f = outline ? 'none' : fill;
  const sw = outline ? 3 : 0;
  const legs = range(3).map((i) => {
    const ph = t * 6 * dig + i * 2.1;
    const hx = 30 - i * 34, hy = 6;
    const kx = hx + [28, 6, -24][i] + (i === 0 ? Math.cos(ph) * 18 * dig : 0), ky = hy + 22 - (i === 0 ? Math.max(0, Math.sin(ph)) * 14 * dig : 0);
    const fx = hx + [52, 12, -46][i] + (i === 0 ? Math.cos(ph) * 30 * dig : 0), fy = 52 - (i === 0 ? Math.max(0, Math.sin(ph)) * 20 * dig : 0);
    return `M${hx},${hy} L${kx},${ky} L${fx},${fy}`;
  });
  const body = (color: string, stroke: string, w: number) => (
    <g>
      {legs.map((d, i) => <path key={i} d={d} stroke={outline ?? color} strokeWidth={outline ? 2.6 : 7} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
      <path d="M-80,10 C-84,-40 -40,-62 4,-60 C40,-58 58,-36 58,0 C58,18 30,26 -10,26 C-50,26 -78,24 -80,10 Z" fill={color} stroke={stroke} strokeWidth={w} />
      <path d="M52,-20 C64,-34 88,-32 94,-14 C98,0 88,14 66,14 C56,14 50,4 52,-20 Z" fill={color} stroke={stroke} strokeWidth={w} />
      <path d="M90,-10 C102,-18 116,-12 118,0 C118,10 108,14 96,10 Z" fill={color} stroke={stroke} strokeWidth={w} />
      <path d="M114,-2 L134,-8 L128,2 Z M114,6 L134,10 L126,0 Z" fill={color} stroke={stroke} strokeWidth={w} />
      <path d={`M108,-12 L120,-30 L132,${-34 + Math.sin(t * 5) * 3}`} stroke={outline ?? color} strokeWidth={outline ? 2 : 3.5} fill="none" strokeLinecap="round" />
      <path d="M-78,4 C-40,-6 10,-8 54,-4" stroke={outline ?? rim} strokeOpacity={outline ? 0.8 : 0.25} strokeWidth={1.6} fill="none" />
    </g>
  );
  return (
    <g transform={`translate(${x},${y}) scale(${scale * dir},${scale}) rotate(${rock * 57.3})`}>
      {outline ? (
        <>
          <g opacity={0.35} style={{ filter: 'blur(4px)' }}>{body('none', outline, 6)}</g>
          {body('none', outline, sw)}
        </>
      ) : (
        <>
          <g transform="translate(-2.5,-3)" opacity={0.8}>{body(rim, 'none', 0)}</g>
          {body(f, st, 0)}
        </>
      )}
    </g>
  );
};

/** Rounded dirt grains; big ones near the lens are blurred. */
export const Grains: React.FC<{ seed: number; n: number; x0: number; x1: number; y0: number; y1: number; rMin: number; rMax: number; fill: string; rim: string; drift?: number; t?: number; blur?: string; rimOpacity?: number }> = (p) => (
  <g filter={p.blur ? `url(#${p.blur})` : undefined}>
    {range(p.n).map((i) => {
      const h1 = hash2(i, p.seed), h2 = hash2(i, p.seed + 1), h3 = hash2(i, p.seed + 2);
      const r = p.rMin + (p.rMax - p.rMin) * h3 * h3;
      const cx = p.x0 + (p.x1 - p.x0) * h1 + (p.t ?? 0) * (p.drift ?? 0) * (0.5 + h2);
      const cy = p.y0 + (p.y1 - p.y0) * h2;
      const pts = range(9).map((k) => {
        const a = (k / 9) * Math.PI * 2;
        const rr = r * (0.75 + 0.35 * hash2(i * 13 + k, p.seed + 5));
        return [cx + Math.cos(a) * rr * 1.15, cy + Math.sin(a) * rr * 0.85] as [number, number];
      });
      return (
        <g key={i}>
          <path d={smoothPath(pts, true)} fill={p.fill} />
          <path d={smoothPath(pts.slice(4, 8))} stroke={p.rim} strokeOpacity={(p.rimOpacity ?? 0.5) * (0.4 + 0.6 * h2)} strokeWidth={Math.max(1.5, r * 0.08)} fill="none" strokeLinecap="round" />
        </g>
      );
    })}
  </g>
);

/** A water drop hanging from a root tip: swelling, trembling, catching the light. grow 0..1. */
export const Drop: React.FC<{ x: number; y: number; r: number; grow: number; t: number; light: string }> = ({ x, y, r, grow, t, light }) => {
  const rr = r * (0.55 + 0.45 * grow);
  const neck = rr * (0.35 + 0.9 * grow);
  const wob = Math.sin(t * 9) * 0.03 * grow;
  const cy = y + neck + rr;
  const d = `M${x - 3},${y} C${x - 4},${y + neck * 0.6} ${x - rr * (1 + wob)},${cy - rr * 0.9} ${x - rr * (1 + wob)},${cy} A${rr * (1 + wob)},${rr * (1 - wob)} 0 1,0 ${x + rr * (1 + wob)},${cy} C${x + rr * (1 + wob)},${cy - rr * 0.9} ${x + 4},${y + neck * 0.6} ${x + 3},${y} Z`;
  return (
    <g>
      <defs>
        <radialGradient id="dropFill" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
          <stop offset="0.25" stopColor={light} stopOpacity={0.55} />
          <stop offset="0.8" stopColor="#1a2a26" stopOpacity={0.7} />
          <stop offset="1" stopColor={light} stopOpacity={0.9} />
        </radialGradient>
      </defs>
      <ellipse cx={x} cy={cy} rx={rr * 3.2} ry={rr * 3.2} fill="url(#lightGlow)" opacity={0.5} style={{ mixBlendMode: 'screen' }} />
      <path d={d} fill="url(#dropFill)" />
      <path d={d} fill="none" stroke={light} strokeOpacity={0.7} strokeWidth={2} />
      <ellipse cx={x - rr * 0.35} cy={cy - rr * 0.35} rx={rr * 0.22} ry={rr * 0.14} fill="#fff" opacity={0.9} transform={`rotate(-35 ${x - rr * 0.35} ${cy - rr * 0.35})`} />
      <ellipse cx={x + rr * 0.3} cy={cy + rr * 0.45} rx={rr * 0.3} ry={rr * 0.08} fill="#fff" opacity={0.35} />
    </g>
  );
};
