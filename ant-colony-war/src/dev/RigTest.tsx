// Dev-only: renders the character rig in several poses. `npx remotion still src/dev/index.ts Rig out.png`
import React from 'react';
import { AbsoluteFill, Composition, useCurrentFrame } from 'remotion';
import { Ant, AntDefs } from '../art/Ant';
import { Cast } from './Cast';
import { WorldMap } from './WorldMap';
const Rig: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(#6a4018, #140a04)' }}>
      <svg viewBox="0 0 1080 1920" width={1080} height={1920}>
        <AntDefs />
        {[0, 1, 2].map((k) => <Ant key={k} species="trapjaw" t={(f + k * 7) / 30} x={430} y={260 + k * 300} scale={2.3} walk={1.1} />)}
        <Ant species="trapjaw" t={f / 30} x={430} y={1180} scale={2.3} infection={0.2} jaw={0} glowId="veinGlow" />
        <Ant species="trapjaw" t={f / 30} x={430} y={1480} scale={2.3} lie={1} eyeOpen={0.2} infection={0.15} />
        <Ant species="fire" t={f / 30} x={300} y={1750} scale={1.8} walk={1.6} fill="#2a0904" rim="#ff7b2e" />
        <Ant species="kesh" t={f / 30} x={800} y={1750} scale={1.8} dir={-1} fill="#240803" rim="#ff6a22" />
      </svg>
    </AbsoluteFill>
  );
};
export const RigRoot: React.FC = () => (
  <>
    <Composition id="Rig" component={Rig} width={1080} height={1920} fps={30} durationInFrames={60} />
    <Composition id="Cast" component={Cast} width={2040} height={1800} fps={30} durationInFrames={60} />
    <Composition id="WorldMap" component={WorldMap} width={2400} height={2840} fps={30} durationInFrames={60} />
  </>
);
