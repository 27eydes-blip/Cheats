import React from 'react';
import { H, W } from '../config';
import { hash, hash2, range } from '../lib/random';
import type { Palette } from './palette';

const wrap = (v: number, m: number) => ((v % m) + m) % m;

/** Slow drifting banks of depth fog. */
export const Fog: React.FC<{ t: number; camX?: number; amount?: number; y?: number; spread?: number }> = ({ t, camX = 0, amount = 1, y = H * 0.55, spread = 900 }) => (
  <g opacity={amount} style={{ mixBlendMode: 'screen' }}>
    {range(7).map((i) => {
      const h = hash(i * 13 + 5);
      const x = wrap(h * 2400 + t * (8 + h * 14) - camX * (0.3 + h * 0.5), 2400) - 600;
      const yy = y + (hash(i * 7 + 1) - 0.5) * spread + Math.sin(t * 0.2 + i) * 30;
      return <ellipse key={i} cx={x} cy={yy} rx={420 + h * 380} ry={140 + h * 120} fill="url(#fogBlob)" opacity={0.45 + h * 0.4} />;
    })}
  </g>
);

/** Floating dust motes, with a few big out-of-focus ones near the lens. */
export const Dust: React.FC<{ t: number; camX?: number; count?: number; seed?: number; color?: string; speed?: number }> = ({ t, camX = 0, count = 70, seed = 1, color, speed = 1 }) => (
  <g>
    {range(count).map((i) => {
      const h1 = hash2(i, seed), h2 = hash2(i, seed + 1), h3 = hash2(i, seed + 2);
      const near = h3 > 0.9;
      const z = near ? 2 : 0.3 + h3;
      const x = wrap(h1 * (W + 200) + (t * (6 + h2 * 10) * speed - camX) * z + Math.sin(t * (0.3 + h2) + i) * 20, W + 200) - 100;
      const y = wrap(h2 * (H + 200) - t * (5 + h1 * 12) * speed + Math.cos(t * (0.4 + h1) + i) * 25, H + 200) - 100;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + h1 * 3) + i * 3);
      if (near) return <circle key={i} cx={x} cy={y} r={10 + h1 * 22} fill="url(#dustBokeh)" opacity={0.35 + 0.3 * tw} />;
      return <circle key={i} cx={x} cy={y} r={0.8 + h3 * 2.4} fill={color ?? '#ffe2b8'} opacity={(0.15 + 0.55 * tw) * (0.4 + h3 * 0.6)} />;
    })}
  </g>
);

/** Rising embers with glow; amount 0..1 scales the count and brightness. */
export const Embers: React.FC<{ t: number; amount?: number; seed?: number; from?: number }> = ({ t, amount = 1, seed = 4, from = H + 40 }) => {
  const n = Math.round(90 * amount);
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      {range(n).map((i) => {
        const h1 = hash2(i, seed), h2 = hash2(i, seed + 1), h3 = hash2(i, seed + 2);
        const life = 3 + h1 * 4;
        const age = wrap(t + h2 * life, life) / life;
        const x = h3 * W + Math.sin(t * (1 + h1 * 2) + i) * 40 + age * (h2 - 0.4) * 300;
        const y = from - age * (from + 200) * (0.6 + h1 * 0.6);
        const r = 1.6 + h2 * 3.4;
        const fl = 0.6 + 0.4 * Math.sin(t * (12 + h3 * 10) + i);
        const op = Math.sin(Math.PI * age) * fl;
        return (
          <g key={i} opacity={op}>
            <circle cx={x} cy={y} r={r * 6} fill="url(#emberGlow)" opacity={0.5} />
            <circle cx={x} cy={y} r={r} fill="#fff0c0" />
          </g>
        );
      })}
    </g>
  );
};

/** Slow rolling smoke. */
export const Smoke: React.FC<{ t: number; amount?: number; y?: number; color?: string }> = ({ t, amount = 1, y = H * 0.35 }) => (
  <g opacity={amount}>
    {range(9).map((i) => {
      const h = hash(i * 31 + 7);
      const x = wrap(h * 2000 + t * (12 + h * 20), 2000) - 400;
      const yy = y + (hash(i * 3 + 2) - 0.5) * 900 - t * (6 + h * 8);
      const r = 260 + h * 300 + Math.sin(t * 0.3 + i) * 30;
      return <ellipse key={i} cx={x} cy={wrap(yy + 400, H + 800) - 400} rx={r * 1.3} ry={r} fill="url(#smokeBlob)" />;
    })}
  </g>
);

export const Rain: React.FC<{ t: number; amount?: number }> = ({ t, amount = 1 }) => (
  <g opacity={0.45 * amount}>
    {range(Math.round(160 * amount)).map((i) => {
      const h1 = hash2(i, 91), h2 = hash2(i, 92), h3 = hash2(i, 93);
      const sp = 2200 + h1 * 900;
      const len = 40 + h2 * 70;
      const y = wrap(h2 * H * 2 + t * sp, H + 200) - 100;
      const x = wrap(h1 * W + y * 0.18, W);
      return <line key={i} x1={x} y1={y} x2={x - len * 0.18} y2={y - len} stroke="#bcd3e6" strokeWidth={1 + h3 * 1.6} strokeOpacity={0.25 + h3 * 0.5} strokeLinecap="round" />;
    })}
  </g>
);

/** Light shafts (god rays) from above. */
export const Shafts: React.FC<{ t: number; x?: number; amount?: number; angle?: number }> = ({ t, x = W * 0.6, amount = 1, angle = 14 }) => (
  <g opacity={amount} style={{ mixBlendMode: 'screen' }} transform={`rotate(${angle} ${x} 0)`}>
    {range(5).map((i) => {
      const h = hash(i * 17 + 3);
      const w = 50 + h * 140;
      const xx = x + (i - 2) * 120 + Math.sin(t * 0.3 + i) * 20;
      return <rect key={i} x={xx - w / 2} y={-200} width={w} height={H * 1.2} fill="url(#shaft)" opacity={(0.35 + h * 0.5) * (0.75 + 0.25 * Math.sin(t * 0.7 + i * 2))} />;
    })}
  </g>
);

/** Full-frame finishing layers: colour grade, vignette, film grain. Rendered as HTML on top of the scene. */
export const Finish: React.FC<{ frame: number; pal: Palette; vignette?: number; grade?: number }> = ({ frame, pal, vignette = 1, grade = 0.18 }) => (
  <>
    <div style={{ position: 'absolute', inset: 0, background: pal.grade, opacity: grade, mixBlendMode: 'soft-light' }} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 40%, rgba(0,0,0,${0.55 * vignette}) 78%, rgba(0,0,0,${0.92 * vignette}) 100%)`,
      }}
    />
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.22 }} viewBox={`0 0 ${W / 2} ${H / 2}`} preserveAspectRatio="none">
      <filter id={`grain${frame % 8}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain${frame % 8})`} />
    </svg>
  </>
);
