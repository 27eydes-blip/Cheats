import React from 'react';
import { H, W } from '../config';
import { clamp, easeOut, hash, hash2, range } from '../lib/random';
import { Embers, Smoke } from '../art/Atmosphere';
import { EarthDefs } from '../art/Earth';
import { FIRE } from '../art/palette';
import { SNAP_FREEZE } from '../timeline/remap';

/** Trap-jaw SNAP: white flash during the freeze, then a double shockwave and speed lines. */
export const SnapFx: React.FC<{ snaps: { at: number; focus: [number, number] }[]; time: number; color?: string }> = ({ snaps, time, color = '#fff' }) => (
  <>
    {snaps.map((s, i) => {
      const d = time - s.at;
      if (d < 0 || d > 1.2) return null;
      const flash = d < 0.05 ? 0.92 : d < SNAP_FREEZE ? 0.45 : Math.max(0, 0.45 - (d - SNAP_FREEZE) / 0.3);
      const w = Math.max(0, d - SNAP_FREEZE * 0.6);
      const r1 = easeOut(w / 0.7) * 1300, r2 = easeOut(Math.max(0, w - 0.08) / 0.8) * 900;
      const op = clamp(1 - w / 0.75);
      const [fx, fy] = s.focus;
      return (
        <React.Fragment key={i}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <radialGradient id={`snapCore${i}`}>
                <stop offset="0" stopColor="#fff" stopOpacity={1} />
                <stop offset="0.3" stopColor="#fff6d8" stopOpacity={0.6} />
                <stop offset="1" stopColor="#fff" stopOpacity={0} />
              </radialGradient>
            </defs>
            {d < 0.5 && <circle cx={fx} cy={fy} r={60 + d * 500} fill={`url(#snapCore${i})`} opacity={clamp(1 - d / 0.5)} />}
            {w > 0 && (
              <>
                <circle cx={fx} cy={fy} r={r1} fill="none" stroke="#fff" strokeWidth={26 * op + 2} strokeOpacity={0.85 * op} />
                <circle cx={fx} cy={fy} r={r1 * 0.97} fill="none" stroke="#ffd9a0" strokeWidth={60 * op} strokeOpacity={0.2 * op} />
                <circle cx={fx} cy={fy} r={r2} fill="none" stroke="#fff" strokeWidth={8 * op} strokeOpacity={0.6 * op} />
                {range(28).map((k) => {
                  const a = (k / 28) * Math.PI * 2 + hash(k + i * 31) * 0.2;
                  const r0 = 120 + r1 * 0.35, len = 120 + hash(k + 7) * 360;
                  return <line key={k} x1={fx + Math.cos(a) * r0} y1={fy + Math.sin(a) * r0} x2={fx + Math.cos(a) * (r0 + len)} y2={fy + Math.sin(a) * (r0 + len)} stroke="#fff" strokeWidth={2 + hash(k) * 4} strokeOpacity={op * 0.7} strokeLinecap="round" />;
                })}
              </>
            )}
          </svg>
          <div style={{ position: 'absolute', inset: 0, background: color, opacity: flash, mixBlendMode: 'screen' }} />
        </React.Fragment>
      );
    })}
  </>
);

/** Short flashes for impacts (orange) and lightning (white). */
export const FlashFx: React.FC<{ cues: { type: string; at: number }[]; time: number }> = ({ cues, time }) => {
  let white = 0, orange = 0;
  for (const c of cues) {
    const d = time - c.at;
    if (d < 0 || d > 0.6) continue;
    if (c.type === 'flash') white = Math.max(white, d < 0.06 ? 1 : d < 0.12 ? 0.3 : d < 0.18 ? 0.85 : clamp(0.85 - (d - 0.18) / 0.4));
    if (c.type === 'impact') orange = Math.max(orange, clamp(0.6 - d / 0.3));
  }
  return (
    <>
      {white > 0 && <div style={{ position: 'absolute', inset: 0, background: '#e9f0ff', opacity: white * 0.85, mixBlendMode: 'screen' }} />}
      {orange > 0 && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, #fff2c8, #ff7a2a 40%, rgba(255,60,0,0) 75%)', opacity: orange, mixBlendMode: 'screen' }} />}
    </>
  );
};

/** Hyper senses: sound waves rippling outward, a green tint and a slowed-down feel. */
export const SensesFx: React.FC<{ k: number; t: number; focus: [number, number] }> = ({ k, t, focus }) => {
  if (k <= 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: k }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(40,255,120,0) 35%, rgba(20,120,60,0.45) 100%)', mixBlendMode: 'screen' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {range(5).map((i) => {
          const u = (((t / 2.6 + i / 5) % 1) + 1) % 1;
          return <ellipse key={i} cx={focus[0]} cy={focus[1]} rx={40 + u * 1200} ry={30 + u * 1000} fill="none" stroke="#b8ffc8" strokeWidth={2 + (1 - u) * 5} strokeOpacity={(1 - u) * 0.45} />;
        })}
      </svg>
    </div>
  );
};

/** Fire attack: embers, smoke and an orange glow taking over the screen. k = 0..1 intensity. */
export const FireFx: React.FC<{ k: number; t: number }> = ({ k, t }) => {
  if (k <= 0) return null;
  const heat = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: k }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(255,80,10,0.55) 0%, rgba(255,120,30,0.18) 35%, rgba(255,120,30,0) 60%)', mixBlendMode: 'screen', opacity: heat }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 100%, rgba(255,90,20,0.35), transparent 70%)', mixBlendMode: 'overlay' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <EarthDefs pal={FIRE} />
        <Smoke t={t + 7} amount={0.35} y={300} />
        <Embers t={t + 11} amount={0.6} seed={19} />
      </svg>
    </div>
  );
};

/** Camera shake offsets from cue times (real seconds). */
export const shakeAt = (time: number, cues: { type: string; at: number }[]) => {
  let amp = 0;
  for (const c of cues) {
    const d = time - c.at - (c.type === 'snap' ? SNAP_FREEZE : 0);
    if (d < 0 || d > 1) continue;
    const a = c.type === 'snap' ? 34 : c.type === 'impact' ? 26 : c.type === 'shake' ? 18 : 8;
    amp += a * Math.exp(-d * 6);
  }
  const f = Math.floor(time * 60);
  return { x: (hash2(f, 1) - 0.5) * 2 * amp, y: (hash2(f, 2) - 0.5) * 2 * amp, r: (hash2(f, 3) - 0.5) * amp * 0.03 };
};

/** The Green speaking: the screen breathes, the edges pulse green, ripples pass through everything. */
export const GreenFx: React.FC<{ k: number; t: number }> = ({ k, t }) => {
  if (k <= 0) return null;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: k }}>
      <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 ${160 + pulse * 140}px ${40 + pulse * 40}px rgba(40,255,110,${0.35 + 0.25 * pulse})` }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 40%, rgba(10,60,30,0.55) 100%)', mixBlendMode: 'multiply' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, mixBlendMode: 'screen' }}>
        {range(4).map((i) => {
          const u = (((t / 3 + i / 4) % 1) + 1) % 1;
          return <ellipse key={i} cx={W / 2} cy={H * 0.42} rx={60 + u * 900} ry={40 + u * 1100} fill="none" stroke="#7dffa0" strokeWidth={2 + (1 - u) * 6} strokeOpacity={(1 - u) * 0.4} />;
        })}
      </svg>
    </div>
  );
};

/** The purge: hard red/green strobing. */
export const StrobeFx: React.FC<{ on: boolean; frame: number }> = ({ on, frame }) => {
  if (!on) return null;
  const phase = Math.floor(frame / 3) % 4;
  const c = phase === 0 ? 'rgba(255,30,20,0.32)' : phase === 2 ? 'rgba(40,255,100,0.26)' : 'rgba(0,0,0,0)';
  return <div style={{ position: 'absolute', inset: 0, background: c, mixBlendMode: 'screen' }} />;
};
