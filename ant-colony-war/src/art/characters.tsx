// Shared Season 2 characters: one definition each, so they look identical in every shot.
import React from 'react';
import { Ant, type AntProps } from './Ant';

type Placement = Pick<AntProps, 't' | 'x' | 'y' | 'scale' | 'dir' | 'walk' | 'pitch' | 'jaw' | 'lie' | 'eyeOpen' | 'opacity' | 'seed'> & { glow?: boolean };

/** How far the Green has taken 250 in each Season 2 episode: veins, then glow through the armor (EP6), then cracks of light all over (EP9). */
export const greenLevel = (episode: number) => ({
  infection: Math.min(1, 0.22 + 0.08 * episode),
  cracks: episode < 5 ? 0 : Math.min(1, (episode - 4) * 0.22),
});

/** 250 as the Snap: trap-jaw rig + Kesh's cracked red armor + the Green at this episode's level. */
export const Snap: React.FC<Placement & { episode: number; level?: number }> = ({ episode, level, ...p }) => {
  const g = greenLevel(episode);
  const k = level ?? 1;
  return <Ant species="trapjaw" fill="#0b0604" rim="#ff8a50" seed={250} armor infection={g.infection * k} cracks={g.cracks * k} glowId="veinGlow" {...p} />;
};

/** The final form (EP10): black resin armor, blade mandibles, green seams, one eye fully green. Moves slowly. */
export const FinalSnap: React.FC<Placement> = (p) => (
  <Ant species="trapjaw" fill="#020202" rim="#5a5a5a" rimOpacity={0.6} seed={250} finalForm cracks={0.35} infection={1} glowId="veinGlow" jawScale={1.15} {...p} walk={(p.walk ?? 0) * 0.5} />
);

/** Pip: 250's little brother. Small, big eyes, oversized jaws. sick = pale shell, slow antennae. */
export const Pip: React.FC<Placement & { sick?: number }> = ({ sick = 0, ...p }) => (
  <Ant
    species="trapjaw"
    fill={sick > 0.5 ? '#4a3e32' : '#140c06'}
    rim={sick > 0.5 ? '#d8cbb8' : '#ffd8a0'}
    rimOpacity={0.95}
    eyeScale={2.6}
    jawScale={1.3}
    antennaSpeed={1 - 0.7 * sick}
    seed={7}
    {...p}
    scale={(p.scale ?? 1) * 0.62}
    pitch={(p.pitch ?? 0) + sick * 0.12}
  />
);

/** Rix: the rebel leader. One broken antenna, a scar across his head, moves fast and low. */
export const Rix: React.FC<Placement> = (p) => <Ant species="trapjaw" fill="#0a0806" rim="#9fd0ff" rimOpacity={0.9} oneAntenna headScar crouch={0.7} seed={33} {...p} pitch={(p.pitch ?? 0) + 0.06} />;

/** The old worker who fed 250 in the nursery: gray, slow, kind. */
export const OldWorker: React.FC<Placement> = (p) => <Ant species="trapjaw" fill="#2a241e" rim="#d8c8b0" rimOpacity={0.9} seed={404} antennaSpeed={0.5} {...p} pitch={(p.pitch ?? 0) + 0.15} />;

/** General Sorra: tall, sleek fire ant, always watching. */
export const Sorra: React.FC<Placement> = (p) => <Ant species="sorra" fill="#120302" rim="#ffb060" rimOpacity={0.95} seed={91} {...p} />;
