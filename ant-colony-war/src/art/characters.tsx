// Shared Season 2 characters: one definition each, so they look identical in every shot.
import React from 'react';
import { Ant, type AntProps } from './Ant';

type Placement = Pick<AntProps, 't' | 'x' | 'y' | 'scale' | 'dir' | 'walk' | 'pitch' | 'jaw' | 'lie' | 'eyeOpen' | 'opacity' | 'seed' | 'lod' | 'flip'> & { glow?: boolean };

/** How far the Green has taken 250 in each Season 2 episode: veins, then glow through the armor (EP6), then cracks of light all over (EP9). */
export const greenLevel = (episode: number) => ({
  infection: Math.min(1, 0.22 + 0.08 * episode),
  cracks: episode < 5 ? 0 : Math.min(1, (episode - 4) * 0.22),
});

/** 250 as Lord Mandros (EP1-9): trap-jaw rig + Krell Dukar's cracked red armor + the Green at this episode's level. */
export const Mandros: React.FC<Placement & { episode: number; level?: number }> = ({ episode, level, ...p }) => {
  const g = greenLevel(episode);
  const k = level ?? 1;
  return <Ant species="trapjaw" fill="#0b0604" rim="#ff8a50" seed={250} armor infection={g.infection * k} cracks={g.cracks * k} glowId="veinGlow" {...p} />;
};

/** Spikes, leg blades, an eye flare and green vapour: the extra menace of the final form. */
const menace = (c: { t: number; headRot: string }) => (
  <g>
    {/* dorsal spikes along the thorax and gaster */}
    {[[-128, -46, -136, -82], [-108, -50, -112, -92], [-86, -48, -84, -86], [-20, -32, -26, -66], [6, -30, 4, -62], [32, -40, 36, -76]].map(([x1, y1, x2, y2], i) => (
      <path key={i} d={`M${x1 - 7},${y1 + 4} L${x2},${y2} L${x1 + 7},${y1 + 4} Z`} fill="#050505" stroke="#2c2c2c" strokeWidth={1.5} />
    ))}
    {/* jagged blades on the near legs */}
    {[[40, -6], [14, -4], [-12, -6]].map(([x, y], i) => (
      <path key={'b' + i} d={`M${x - 4},${y + 30} l-10,8 l12,0 Z`} fill="#050505" />
    ))}
    {/* green vapour leaking upward */}
    {[0, 1, 2, 3, 4].map((i) => {
      const age = (((c.t * 0.4 + i * 0.21) % 1) + 1) % 1;
      return <circle key={'v' + i} cx={-110 + i * 50 + Math.sin(c.t + i) * 8} cy={-50 - age * 110} r={8 + age * 16} fill="#3dff6a" opacity={(1 - age) * 0.18} />;
    })}
    {/* the burning eye */}
    <g transform={c.headRot}>
      <circle cx={100} cy={-29} r={42} fill="url(#glintGlow)" opacity={0.85 + 0.15 * Math.sin(c.t * 3)} />
      <path d="M100,-29 L160,-34 L100,-26 Z" fill="#9dffb0" opacity={0.5} />
    </g>
  </g>
);

/** The final form (EP10): black resin armor, sharpened beetle-shell blade mandibles, green light from the seams, one eye fully green. Slow and heavy. */
export const LordMandrosFinal: React.FC<Placement> = (p) => (
  <Ant species="trapjaw" fill="#020202" rim="#6a6a6a" rimOpacity={0.6} seed={250} finalForm cracks={0.45} infection={1} glowId="veinGlow" jawScale={1.25} extra={menace} {...p} walk={(p.walk ?? 0) * 0.45} />
);

/** Tavi Ren: 250's little brother. Clearly the youngest: tiny, short legs, huge eyes, oversized jaws. sick = pale shell, slow antennae. */
export const Tavi: React.FC<Placement & { sick?: number }> = ({ sick = 0, ...p }) => (
  <Ant
    species="trapjaw"
    fill={sick > 0.5 ? '#4a3e32' : '#1a120a'}
    rim={sick > 0.5 ? '#d8cbb8' : '#ffe8c8'}
    rimOpacity={1}
    eyeScale={2.8}
    jawScale={1.35}
    antennaSpeed={1 - 0.7 * sick}
    geo={{
      femur: 32,
      tibia: 38,
      tarsus: 22,
      feet: [88, 14, -70],
      ground: 36,
      gaster: [-86, -16, 40, 28, -12],
      head: 'M50,-24 C52,-44 74,-50 96,-46 C114,-42 126,-34 128,-24 C130,-14 122,-6 106,-4 C88,-2 66,-6 56,-12 C51,-15 49,-19 50,-24 Z',
    }}
    seed={7}
    {...p}
    scale={(p.scale ?? 1) * 0.5}
    pitch={(p.pitch ?? 0) + sick * 0.12}
  />
);

/** Kael Varro: the rebel leader. One broken antenna, a scar across his head, moves fast and low. */
export const Kael: React.FC<Placement> = (p) => <Ant species="trapjaw" fill="#0a0806" rim="#9fd0ff" rimOpacity={0.9} oneAntenna headScar crouch={0.7} seed={33} {...p} pitch={(p.pitch ?? 0) + 0.06} />;

/** The old worker who fed 250 in the nursery: gray, slow, kind. */
export const OldWorker: React.FC<Placement> = (p) => <Ant species="trapjaw" fill="#2a241e" rim="#d8c8b0" rimOpacity={0.9} seed={404} antennaSpeed={0.5} {...p} pitch={(p.pitch ?? 0) + 0.15} />;

/** General Velka Thrane: tall, sleek fire ant, always watching. */
export const Velka: React.FC<Placement> = (p) => <Ant species="sorra" fill="#120302" rim="#ffb060" rimOpacity={0.95} seed={91} {...p} />;
