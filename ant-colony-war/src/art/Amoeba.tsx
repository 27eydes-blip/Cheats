import React from 'react';
import { hash2, range } from '../lib/random';
import { smoothPath } from './Earth';

export type AmoebaProps = {
  id: string;
  t: number;
  cx: number;
  cy: number;
  r: number;
  /** 0..1, how far the tendrils have crept out. */
  reach?: number;
  /** Where the tendrils creep toward (screen coords). Defaults to all around. */
  target?: [number, number];
  intensity?: number;
  seed?: number;
};

/** A liquid, glowing green organism: wobbling membrane, bloom, creeping tendrils, drifting motes. */
export const Amoeba: React.FC<AmoebaProps> = ({ id, t, cx, cy, r, reach = 0.4, target, intensity = 1, seed = 7 }) => {
  // periodic wobble around the membrane
  const harm = range(6).map((k) => ({ k: k + 2, a: 0.03 + hash2(k, seed) * 0.07, ph: hash2(k, seed + 1) * 6.28, w: 0.4 + hash2(k, seed + 2) * 1.1 }));
  const radius = (th: number, rr: number, tt: number) => rr * (1 + harm.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.ph + tt * h.w), 0));
  const ring = (rr: number, tt: number, n = 64): [number, number][] =>
    range(n).map((i) => {
      const th = (i / n) * Math.PI * 2;
      const q = radius(th, rr, tt);
      return [cx + Math.cos(th) * q, cy + Math.sin(th) * q * 0.86];
    });
  const membrane = smoothPath(ring(r, t), true);
  const inner = smoothPath(ring(r * 0.62, t * 1.4 + 3), true);
  const core = smoothPath(ring(r * 0.3, t * 2 + 7, 32), true);

  const baseAng = target ? Math.atan2(target[1] - cy, target[0] - cx) : 0;
  const tendrils = range(7).map((i) => {
    const h = hash2(i, seed + 20);
    const ang = target ? baseAng + (h - 0.5) * 1.4 : (i / 7) * Math.PI * 2 + h;
    const len = r * (0.6 + reach * (1.6 + h * 2.2)) * (0.85 + 0.15 * Math.sin(t * 0.8 + i));
    const L: [number, number][] = [], R: [number, number][] = [];
    const w0 = r * (0.22 + h * 0.08);
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      const wig = Math.sin(u * 7 - t * 2.4 + i * 2) * r * 0.16 * u + Math.sin(u * 13 - t * 4 + i) * r * 0.04 * u;
      const d = r * 0.7 + len * u;
      const px = cx + Math.cos(ang) * d - Math.sin(ang) * wig;
      const py = cy + Math.sin(ang) * d * 0.9 + Math.cos(ang) * wig;
      const w = w0 * Math.pow(1 - u, 1.4) + 1;
      L.push([px - Math.sin(ang) * w, py + Math.cos(ang) * w]);
      R.push([px + Math.sin(ang) * w, py - Math.cos(ang) * w]);
    }
    return smoothPath(L) + ' L' + R.slice().reverse().map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' L') + ' Z';
  });

  const motes = range(26).map((i) => {
    const h1 = hash2(i, seed + 40), h2 = hash2(i, seed + 41);
    const a = h1 * 6.28 + t * (0.2 + h2 * 0.5);
    const d = r * (1.1 + h2 * 1.8) + Math.sin(t + i) * 10;
    return <circle key={i} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d * 0.8} r={1.5 + h1 * 3} fill="#c8ffd2" opacity={0.3 + 0.5 * Math.abs(Math.sin(t * 2 + i))} />;
  });

  const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-bloom`}>
          <stop offset="0" stopColor="#6dff8a" stopOpacity={0.55 * intensity} />
          <stop offset="0.35" stopColor="#2dd860" stopOpacity={0.2 * intensity} />
          <stop offset="1" stopColor="#0a5a24" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-body`} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#e8ffe0" stopOpacity={0.95} />
          <stop offset="0.25" stopColor="#7dff9a" stopOpacity={0.9} />
          <stop offset="0.7" stopColor="#1fbf4f" stopOpacity={0.75} />
          <stop offset="1" stopColor="#065a22" stopOpacity={0.7} />
        </radialGradient>
        <linearGradient id={`${id}-tendril`} gradientUnits="userSpaceOnUse" x1={cx} y1={cy} x2={cx + Math.cos(baseAng) * r * 4} y2={cy + Math.sin(baseAng) * r * 4}>
          <stop offset="0" stopColor="#7dff9a" stopOpacity={0.9} />
          <stop offset="1" stopColor="#1fbf4f" stopOpacity={0.5} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={r * 0.12} />
        </filter>
      </defs>
      <ellipse cx={cx} cy={cy} rx={r * 4.2 * pulse} ry={r * 3.6 * pulse} fill={`url(#${id}-bloom)`} style={{ mixBlendMode: 'screen' }} />
      <g filter={`url(#${id}-glow)`} opacity={0.9 * intensity}>
        {tendrils.map((d, i) => (
          <path key={i} d={d} fill="#4dff7a" />
        ))}
        <path d={membrane} fill="#4dff7a" />
      </g>
      {tendrils.map((d, i) => (
        <path key={i} d={d} fill={`url(#${id}-tendril)`} opacity={0.9} />
      ))}
      <path d={membrane} fill={`url(#${id}-body)`} />
      <path d={membrane} fill="none" stroke="#d8ffd8" strokeOpacity={0.6} strokeWidth={2.5} />
      <path d={inner} fill="#b8ffc6" opacity={0.25} />
      <path d={core} fill="#f4fff0" opacity={0.55 * pulse} />
      {/* specular highlight */}
      <ellipse cx={cx - r * 0.35} cy={cy - r * 0.38} rx={r * 0.22} ry={r * 0.1} transform={`rotate(-30 ${cx - r * 0.35} ${cy - r * 0.38})`} fill="#fff" opacity={0.55} />
      {motes}
    </g>
  );
};
