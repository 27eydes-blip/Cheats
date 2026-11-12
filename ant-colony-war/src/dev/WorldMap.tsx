// Dev-only: "World Map" reference sheet of all 22 colonies, ranked.  npx remotion still src/dev/index.ts WorldMap out.png
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AntDefs } from '../art/Ant';
import { COLONIES, ColonyAnt } from '../art/species';
import { CAPTION_FONT, TITLE_FONT } from '../ui/fonts';

const TIER = (rank: number) => (rank <= 8 ? { label: 'THE GIANTS', color: '#ff5a3a' } : rank === 9 ? { label: 'THE BULLIES', color: '#ff8a2a' } : { label: 'THE WEAK', color: '#9fd0ff' });

export const WorldMap: React.FC = () => {
  const t = useCurrentFrame() / 30 + 0.7;
  return (
    <AbsoluteFill style={{ background: '#050403', padding: '40px 40px', fontFamily: CAPTION_FONT }}>
      <div style={{ fontFamily: TITLE_FONT, fontSize: 92, color: '#fff', letterSpacing: '0.04em' }}>THE WORLD · 22 COLONIES</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,220,180,0.7)', marginBottom: 30 }}>Ranked strongest to weakest. Every colony is a real ant species.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 560px)', gap: 24 }}>
        {COLONIES.map((c) => {
          const tier = TIER(c.rank);
          const sc = 0.85 * Math.min(1.25, Math.max(0.6, c.size));
          return (
            <div key={c.id} style={{ position: 'relative', height: 400, borderRadius: 16, overflow: 'hidden', background: `radial-gradient(circle at 50% 75%, ${c.home[0]}, ${c.home[1]})`, border: c.id === 'trapjaw' || c.id === 'fire' ? `3px solid ${tier.color}` : '1px solid rgba(255,255,255,0.08)' }}>
              <svg width={560} height={400} viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }}>
                <AntDefs />
                {c.id === 'argentine' && [0, 1].map((i) => <ColonyAnt key={i} id={c.id} t={t + i} x={170 + i * 150} y={185 - i * 25} scale={sc * 0.8} opacity={0.35} lod={1} />)}
                <ColonyAnt id={c.id} t={t} x={c.id === 'leafcutter' || c.id === 'weaver' ? 230 : 270} y={c.id === 'acrobat' ? 245 : 205} scale={sc} />
              </svg>
              <div style={{ position: 'absolute', left: 18, top: 12, fontFamily: TITLE_FONT, fontSize: 64, color: tier.color, opacity: 0.9 }}>#{c.rank}</div>
              <div style={{ position: 'absolute', right: 18, top: 18, fontSize: 15, fontWeight: 800, letterSpacing: '0.2em', color: tier.color }}>{tier.label}</div>
              <div style={{ position: 'absolute', left: 18, bottom: (c.role.length + c.blurb.length) > 100 ? 86 : 64, fontFamily: TITLE_FONT, fontSize: 36, color: '#fff' }}>
                {c.name.toUpperCase()} <span style={{ fontFamily: CAPTION_FONT, fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>{c.latin}</span>
              </div>
              <div style={{ position: 'absolute', left: 18, right: 18, bottom: 14, fontSize: 17, fontWeight: 700, color: 'rgba(255,230,200,0.82)', lineHeight: 1.25 }}>
                <b style={{ color: tier.color }}>{c.role}.</b> {c.blurb}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
