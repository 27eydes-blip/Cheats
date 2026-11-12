import React from 'react';
import { Ant, AntDefs } from '../art/Ant';
import { H, SERIES, W } from '../config';
import { clamp, easeOut, hash2, range } from '../lib/random';
import { CAPTION_FONT, TITLE_FONT } from './fonts';

/** Glitchy text: RGB split + horizontal slice displacement, strength 0..1. */
const GlitchText: React.FC<{ text: string; size: number; frame: number; strength: number; color?: string; spacing?: string; weight?: number; font?: string }> = ({ text, size, frame, strength, color = '#fff', spacing = '0.04em', weight = 400, font = TITLE_FONT }) => {
  const style: React.CSSProperties = { fontFamily: font, fontSize: size, letterSpacing: spacing, fontWeight: weight, lineHeight: 1, whiteSpace: 'nowrap', textTransform: 'uppercase' };
  const j = (k: number) => (hash2(frame, k) - 0.5) * 2 * strength;
  const slices = strength > 0.02 ? 6 : 0;
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ ...style, color: 'transparent' }}>{text}</div>
      <div style={{ ...style, position: 'absolute', inset: 0, color: '#ff2a3a', mixBlendMode: 'screen', transform: `translate(${j(1) * 22 - strength * 6}px, ${j(2) * 4}px)`, opacity: 0.85 }}>{text}</div>
      <div style={{ ...style, position: 'absolute', inset: 0, color: '#2affd5', mixBlendMode: 'screen', transform: `translate(${j(3) * 22 + strength * 6}px, ${j(4) * 4}px)`, opacity: 0.85 }}>{text}</div>
      <div style={{ ...style, position: 'absolute', inset: 0, color, textShadow: '0 0 40px rgba(255,190,120,0.25)' }}>{text}</div>
      {range(slices).map((i) => {
        const y0 = hash2(frame, 10 + i) * 100, h = 4 + hash2(frame, 20 + i) * 14;
        if (hash2(frame, 30 + i) > strength * 1.4) return null;
        return (
          <div key={i} style={{ ...style, position: 'absolute', inset: 0, color, clipPath: `inset(${y0}% 0 ${Math.max(0, 100 - y0 - h)}% 0)`, transform: `translateX(${j(40 + i) * 60}px)`, background: 'transparent' }}>
            {text}
          </div>
        );
      })}
    </div>
  );
};

/** "ANT COLONY WAR — EP X: TITLE" with a glitchy cinematic reveal. t = seconds since the episode started. */
export const TitleCard: React.FC<{ n: number; title: string; t: number; frame: number; lead: number }> = ({ n, title, t, frame, lead }) => {
  const out = lead + 0.15;
  if (t > out + 0.7) return null;
  const inK = easeOut(t / 0.7);
  const glitchIn = Math.max(0, 1 - t / 0.9);
  const glitchOut = clamp((t - out) / 0.5);
  const flick = t < 0.9 ? (hash2(frame, 99) > 0.25 + glitchIn * 0.5 ? 1 : 0.25) : t > out ? (hash2(frame, 98) > glitchOut * 0.8 ? 1 : 0) : 1;
  const strength = Math.max(glitchIn, glitchOut, 0.04 + (hash2(Math.floor(frame / 9), 5) > 0.88 ? 0.5 : 0));
  const opacity = flick * (1 - glitchOut);
  const bar = easeOut((t - 0.25) / 0.6);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.35), rgba(0,0,0,0.85))', opacity: 1 - glitchOut }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity, transform: `scale(${0.92 + 0.08 * inK + glitchOut * 0.15})` }}>
        <GlitchText text={SERIES} size={156} frame={frame} strength={strength} spacing="0.03em" />
        <div style={{ width: 760 * bar, height: 3, background: 'linear-gradient(90deg, transparent, #ffb35c, transparent)', margin: '34px 0' }} />
        <GlitchText text={`EP ${n}: ${title}`} size={74} frame={frame + 3} strength={strength * 0.8} color="#ffcf94" spacing="0.08em" />
      </div>
      {/* scanlines, only while the title is up */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, height: 520, background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 5px)', opacity: 0.5 * (1 - glitchOut) }} />
    </div>
  );
};

/** "FOLLOW FOR PART X+1" with 250's silhouette. t = seconds since the end card started. */
export const EndCard: React.FC<{ text: string; t: number; frame: number; infection: number }> = ({ text, t, frame, infection }) => {
  if (t < 0) return null;
  const fade = clamp(t / 0.6);
  const k = easeOut((t - 0.35) / 0.6);
  const pulse = 1 + 0.03 * Math.sin(t * 6);
  return (
    <div style={{ position: 'absolute', inset: 0, background: `rgba(3,2,1,${0.9 * fade})` }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 30% at 50% 50%, rgba(255,160,70,0.22), transparent 70%)', opacity: fade }} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, opacity: fade }}>
        <AntDefs />
        <ellipse cx={W / 2} cy={1030} rx={420} ry={40} fill="rgba(255,170,80,0.18)" />
        <Ant species="trapjaw" t={t + 3} x={W / 2 - 40} y={980} scale={2.4 + t * 0.04} fill="#050302" rim="#ffb066" infection={infection} glowId="veinGlow" seed={250} walk={0} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', opacity: k, transform: `translateY(${(1 - k) * 40}px)` }}>
        <GlitchText text={SERIES} size={64} frame={frame} strength={Math.max(0, 0.5 - t)} color="#ffcf94" spacing="0.12em" />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1170, display: 'flex', justifyContent: 'center', opacity: k, transform: `scale(${(0.8 + 0.2 * k) * pulse})` }}>
        <div style={{ padding: '26px 46px', border: '4px solid #fff', borderRadius: 18, background: 'rgba(0,0,0,0.35)', boxShadow: '0 0 60px rgba(255,170,80,0.35)' }}>
          <GlitchText text={text} size={92} frame={frame} strength={Math.max(0, 0.6 - t * 0.8)} spacing="0.03em" />
        </div>
      </div>
    </div>
  );
};
