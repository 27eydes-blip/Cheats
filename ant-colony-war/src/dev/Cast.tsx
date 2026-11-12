// Dev-only: Season 2 cast contact sheet.  npx remotion still src/dev/index.ts Cast out.png
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AntDefs } from '../art/Ant';
import { FinalSnap, OldWorker, Pip, Rix, Snap, Sorra } from '../art/characters';
import { CAPTION_FONT, TITLE_FONT } from '../ui/fonts';

const Card: React.FC<{ title: string; sub: string; bg: string; children: React.ReactNode }> = ({ title, sub, bg, children }) => (
  <div style={{ position: 'relative', width: 960, height: 540, background: bg, overflow: 'hidden', borderRadius: 18 }}>
    <svg width={960} height={540} viewBox="0 0 960 540" style={{ position: 'absolute', inset: 0 }}>
      <AntDefs />
      {children}
    </svg>
    <div style={{ position: 'absolute', left: 28, top: 22, fontFamily: TITLE_FONT, fontSize: 48, color: '#fff', letterSpacing: '0.04em' }}>{title}</div>
    <div style={{ position: 'absolute', left: 30, top: 80, fontFamily: CAPTION_FONT, fontWeight: 700, fontSize: 20, color: 'rgba(255,220,180,0.75)', maxWidth: 560 }}>{sub}</div>
  </div>
);

export const Cast: React.FC = () => {
  const t = useCurrentFrame() / 30;
  return (
    <AbsoluteFill style={{ background: '#000', padding: 40, display: 'grid', gridTemplateColumns: '960px 960px', gap: 40, alignContent: 'start' }}>
      <Card title="PIP" sub="Little brother. Small, huge eyes, oversized jaws. Right: sick with creek rot." bg="radial-gradient(circle at 50% 70%, #6a4520, #120a04)">
        <Pip t={t} x={230} y={300} scale={2.4} />
        <Pip t={t} x={600} y={470} scale={2.4} sick={1} lie={0.4} eyeOpen={0.5} />
      </Card>
      <Card title="RIX" sub="Best friend, rebel leader. Broken antenna, scar across the head. Fast and low." bg="radial-gradient(circle at 50% 70%, #2a4a6a, #05080e)">
        <Rix t={t} x={420} y={410} scale={2.0} walk={1.4} />
      </Card>
      <Card title="GENERAL SORRA" sub="New fire ant general. Tall, sleek, always watching." bg="radial-gradient(circle at 50% 70%, #8a2a08, #120302)">
        <Sorra t={t} x={520} y={390} scale={2.0} dir={-1} />
      </Card>
      <Card title="THE OLD WORKER" sub="Fed 250 in the nursery. Gray, slow, kind." bg="radial-gradient(circle at 50% 70%, #4a4038, #0c0a08)">
        <OldWorker t={t} x={420} y={410} scale={2.0} />
      </Card>
      <Card title="THE SNAP · EP1 / EP6 / EP9" sub="Kesh's cracked red armor. The Green grows every episode: veins, then glowing through the armor, then cracks of light." bg="radial-gradient(circle at 50% 70%, #5a1806, #0a0201)">
        <Snap t={t} x={170} y={250} scale={1.0} episode={1} />
        <Snap t={t} x={460} y={340} scale={1.0} episode={6} />
        <Snap t={t} x={720} y={440} scale={1.0} episode={9} />
      </Card>
      <Card title="FINAL FORM · EP10" sub="Rebuilt in black resin. Beetle-shell blade mandibles, green light leaking from the seams, one eye fully green." bg="radial-gradient(circle at 50% 70%, #3a0a06, #020101)">
        <FinalSnap t={t} x={360} y={400} scale={2.2} />
      </Card>
    </AbsoluteFill>
  );
};
