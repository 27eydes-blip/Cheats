// The 22 colonies of the world, strongest to weakest. Reusable character designs for future seasons.
// Each is built on the shared ant rig and modelled on the real species: body shape, colour, size and
// its signature trait, with a silhouette you can tell apart at a glance.
import React from 'react';
import { Ant, type AntProps } from './Ant';

export type Colony = {
  rank: number;
  id: string;
  name: string;
  latin: string;
  role: string;
  /** One-line description for reference sheets. */
  blurb: string;
  /** Background tint of their home. */
  home: [string, string];
  /** Relative body size vs. a trap-jaw (1). */
  size: number;
  ant: Partial<AntProps>;
};

const leaf = (c: { t: number }) => (
  <g transform={`translate(160,-120) rotate(${-20 + Math.sin(c.t * 2) * 4})`}>
    <path d="M0,0 C30,-70 110,-80 150,-40 C110,10 40,30 0,0 Z" fill="#3c8a2c" stroke="#9be07a" strokeWidth={2.5} />
    <path d="M0,0 C50,-30 100,-40 150,-40" stroke="#9be07a" strokeWidth={2} fill="none" />
    <path d="M-10,10 L4,-4" stroke="#3c8a2c" strokeWidth={6} />
  </g>
);
const spines = (pts: [number, number, number, number][]) => (c: { rim: string }) => (
  <g stroke={c.rim} strokeWidth={4} strokeLinecap="round">{pts.map(([x1, y1, x2, y2], i) => <path key={i} d={`M${x1},${y1} L${x2},${y2}`} />)}</g>
);

export const COLONIES: Colony[] = [
  {
    rank: 1, id: 'army', name: 'Army Ants', latin: 'Eciton burchellii', role: 'The apocalypse',
    blurb: 'Millions strong, no home, always marching. They devour everything in their path.',
    home: ['#3a1a0a', '#0a0402'], size: 1.15,
    ant: {
      species: 'trapjaw', fill: '#4a2410', rim: '#ffb070', jawFill: '#e8d6b0', eyeScale: 0.2,
      geo: { jawKind: 'sickle', jawLen: 82, feet: [120, 24, -104], femur: 52, tibia: 66, gaster: [-96, -18, 40, 28, -12], head: 'M50,-24 C54,-44 76,-50 98,-46 C118,-42 128,-30 126,-18 C122,-6 100,-4 80,-4 C64,-4 52,-12 50,-24 Z' },
    },
  },
  {
    rank: 2, id: 'argentine', name: 'Argentine Ants', latin: 'Linepithema humile', role: 'The endless empire',
    blurb: 'One supercolony stretching across countries. Billions of ants, one empire.',
    home: ['#3a2a1a', '#0a0805'], size: 0.55,
    ant: { species: 'fire', fill: '#3a2414', rim: '#e0b080', geo: { stinger: false, petiole: 'spine', gaster: [-80, -14, 40, 26, -10], jawLen: 18 } },
  },
  {
    rank: 3, id: 'bullet', name: 'Bullet Ants', latin: 'Paraponera clavata', role: 'Elite warriors',
    blurb: 'The most painful sting of any insect. Even the biggest colonies avoid them.',
    home: ['#2a0a06', '#060101'], size: 1.6,
    ant: {
      species: 'fire', fill: '#120604', rim: '#d04a2a',
      geo: { stinger: true, gaster: [-92, -14, 48, 34, -6], head: 'M42,-26 C42,-48 66,-56 90,-50 C110,-44 118,-28 114,-14 C110,-2 94,2 76,2 C56,2 42,-10 42,-26 Z', petiole: 'spine', jawLen: 30 },
      extra: () => <path d="M-142,-4 L-176,6 L-140,10 Z" fill="#120604" stroke="#ff6a3a" strokeWidth={2} />,
    },
  },
  {
    rank: 4, id: 'leafcutter', name: 'Leafcutter Ants', latin: 'Atta cephalotes', role: 'The food empire',
    blurb: 'Underground fungus farms and millions of workers. The richest empire in the world.',
    home: ['#1a2a10', '#040802'], size: 1.05,
    ant: {
      species: 'fire', fill: '#5a2a12', rim: '#ffb070', geo: { stinger: false, head: 'M44,-30 C40,-56 70,-64 92,-56 C112,-48 118,-30 112,-14 C106,-2 90,2 74,0 C56,-2 46,-12 44,-30 Z', gaster: [-80, -14, 34, 26, -10] },
      extra: (c) => <>{spines([[0, -32, -6, -54], [22, -36, 26, -58], [40, -34, 52, -52]])(c)}{leaf(c)}</>,
    },
  },
  {
    rank: 5, id: 'bulldog', name: 'Bulldog Ants', latin: 'Myrmecia gulosa', role: 'Brutal fighters',
    blurb: 'Huge, jumping, aggressive. Giant eyes and long serrated jaws.',
    home: ['#3a1206', '#0a0301'], size: 1.7,
    ant: {
      species: 'trapjaw', fill: '#0c0604', headFill: '#8a2a0c', jawFill: '#d8a040', rim: '#ff9a4a', eyeScale: 2.2,
      geo: { jawLen: 86, jawKind: 'blade', feet: [116, 22, -100], femur: 54, tibia: 66, gaster: [-100, -18, 44, 30, -10] },
    },
  },
  {
    rank: 6, id: 'weaver', name: 'Weaver Ants', latin: 'Oecophylla smaragdina', role: 'The sky kingdom',
    blurb: 'Fortresses of leaves sewn together with silk, high in the trees.',
    home: ['#2a3a1a', '#06080a'], size: 1.0,
    ant: {
      species: 'fire', fill: '#a8601c', rim: '#ffe0a0', geo: { stinger: false, femur: 50, tibia: 64, feet: [112, 20, -98], gaster: [-80, -14, 32, 22, -14] },
      extra: (c) => <g opacity={0.9}>{leaf(c)}<path d="M160,-120 C140,-70 120,-50 108,-20" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1.5} fill="none" strokeDasharray="3 4" /></g>,
    },
  },
  {
    rank: 7, id: 'crazy', name: 'Yellow Crazy Ants', latin: 'Anoplolepis gracilipes', role: 'Chaos',
    blurb: 'Chaotic swarms that spray acid. Unpredictable, impossible to reason with.',
    home: ['#3a3208', '#0a0802'], size: 0.85,
    ant: {
      species: 'fire', fill: '#8a7018', rim: '#ffe870', antennaSpeed: 3,
      geo: { stinger: false, femur: 56, tibia: 74, feet: [124, 24, -110], scape: 56, funic: 74, gaster: [-78, -12, 30, 20, -10] },
      extra: (c) => <g>{[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={-120 - i * 18} cy={-6 + Math.sin(c.t * 9 + i) * 6 + i * 4} r={5 - i * 0.6} fill="#e8f060" opacity={0.85 - i * 0.12} />)}</g>,
    },
  },
  {
    rank: 8, id: 'slavemaker', name: 'Slave-Maker Ants', latin: 'Polyergus breviceps', role: 'Cold, smart villains',
    blurb: 'They raid other colonies and steal their young to work for them.',
    home: ['#2a0a0a', '#060101'], size: 1.1,
    ant: {
      species: 'fire', fill: '#5a160c', rim: '#ff7a5a', jawFill: '#2a0806',
      geo: { stinger: false, jawKind: 'saber', jawLen: 52, gaster: [-82, -14, 38, 28, -10] },
      extra: () => (
        <g transform="translate(176,-6) rotate(15)">
          <ellipse cx={0} cy={0} rx={24} ry={14} fill="#f0e2c4" />
          <path d="M-18,4 Q0,12 18,4" stroke="#b89a70" strokeWidth={2} fill="none" />
        </g>
      ),
    },
  },
  {
    rank: 9, id: 'fire', name: 'Fire Ants', latin: 'Solenopsis invicta', role: 'The bullies',
    blurb: 'Venom that burns for days. They bully every colony below them and fear the eight above. 250 rules them now.',
    home: ['#5a1606', '#0a0201'], size: 0.9,
    ant: { species: 'fire', fill: '#2a0904', rim: '#ff7a2e' },
  },
  {
    rank: 10, id: 'harvester', name: 'Harvester Ants', latin: 'Pogonomyrmex barbatus', role: 'Farmers who fight back',
    blurb: 'Seed hoarders with a strong sting.',
    home: ['#4a2a10', '#0a0602'], size: 1.05,
    ant: {
      species: 'fire', fill: '#6a1e0c', rim: '#ffa060', geo: { head: 'M44,-34 L104,-36 C114,-30 114,-10 104,-4 L46,-4 C40,-12 40,-28 44,-34 Z' },
      extra: (c) => (
        <g>
          <g transform={c.headRot} stroke="#ffd8a0" strokeWidth={1.5} strokeOpacity={0.8}>{[50, 60, 70, 80, 90].map((x) => <path key={x} d={`M${x},-4 l-2,10`} />)}</g>
          <ellipse cx={136} cy={-8} rx={16} ry={11} fill="#d8b070" stroke="#8a6030" strokeWidth={2} />
        </g>
      ),
    },
  },
  {
    rank: 11, id: 'honeypot', name: 'Honeypot Ants', latin: 'Myrmecocystus mexicanus', role: 'The treasure vault',
    blurb: 'Some workers swell into living food storage. Everyone wants to raid them.',
    home: ['#5a3a10', '#0a0602'], size: 1.0,
    ant: {
      species: 'fire', fill: '#3a2410', rim: '#ffd080', gasterFill: '#e8a020',
      geo: { stinger: false, gaster: [-112, -20, 72, 62, -4], bands: 4 },
      extra: () => <ellipse cx={-96} cy={-44} rx={28} ry={14} fill="#fff4c0" opacity={0.6} />,
    },
  },
  {
    rank: 12, id: 'carpenter', name: 'Carpenter Ants', latin: 'Camponotus pennsylvanicus', role: 'Engineers',
    blurb: 'Big ants that tunnel through wood. Builders.',
    home: ['#3a2814', '#080604'], size: 1.35,
    ant: {
      species: 'fire', fill: '#0a0908', rim: '#c8c0b0',
      geo: { stinger: false, meso: 'M-30,-8 C-34,-30 -10,-46 14,-46 C34,-46 46,-34 46,-20 C46,-10 38,-5 26,-4 C6,-2 -16,-2 -30,-8 Z', head: 'M42,-26 C40,-50 66,-58 90,-52 C112,-46 120,-30 116,-14 C112,-2 94,2 76,2 C56,2 44,-10 42,-26 Z' },
      extra: () => <g fill="#c89a5a">{[[150, 30], [170, 20], [160, 40]].map(([x, y], i) => <rect key={i} x={x} y={y} width={14} height={5} transform={`rotate(${i * 40} ${x} ${y})`} />)}</g>,
    },
  },
  {
    rank: 13, id: 'jackjumper', name: 'Jack Jumper Ants', latin: 'Myrmecia pilosula', role: 'Assassins',
    blurb: 'Leaping hunters with a nasty sting.',
    home: ['#1a1a1a', '#040404'], size: 1.1,
    ant: {
      species: 'trapjaw', fill: '#050505', rim: '#ffcf40', jawFill: '#f0c030', eyeScale: 1.9, pitch: -0.12,
      geo: { jawKind: 'blade', jawLen: 60, gaster: [-96, -18, 40, 28, -14] },
    },
  },
  {
    rank: 14, id: 'silver', name: 'Silver Ants', latin: 'Cataglyphis bombycina', role: 'Desert raiders',
    blurb: 'The fastest-running ants on Earth, shining silver on scorching sand.',
    home: ['#6a5a3a', '#1a1408'], size: 0.95,
    ant: {
      species: 'fire', fill: '#a8b0b8', rim: '#ffffff', walk: 3,
      geo: { stinger: false, femur: 58, tibia: 76, feet: [126, 24, -112], ground: 64, gaster: [-78, -26, 30, 22, -32] },
      extra: () => <g stroke="#ffffff" strokeOpacity={0.5} strokeWidth={3}>{[-30, -10, 10].map((y) => <path key={y} d={`M-150,${y} L-230,${y}`} />)}</g>,
    },
  },
  {
    rank: 15, id: 'exploding', name: 'Exploding Ants', latin: 'Colobopsis explodens', role: 'Fearless defenders',
    blurb: 'They burst open to protect their colony. Tragic and fearless.',
    home: ['#3a2a0a', '#080602'], size: 0.95,
    ant: {
      species: 'fire', fill: '#3a1e0c', rim: '#ffd060', gasterFill: '#d8b020',
      geo: { stinger: false, gaster: [-90, -18, 50, 40, -8] },
      extra: (c) => <g>{[0, 1, 2, 3, 4, 5].map((i) => { const a = i * 1.05 + c.t; return <circle key={i} cx={-90 + Math.cos(a) * 64} cy={-18 + Math.sin(a) * 52} r={6} fill="#f0d030" opacity={0.7} />; })}</g>,
    },
  },
  {
    rank: 16, id: 'turtle', name: 'Turtle Ants', latin: 'Cephalotes varians', role: 'The living shield',
    blurb: 'Flat armored heads that plug their doors like shields.',
    home: ['#2a2018', '#060404'], size: 1.0,
    ant: {
      species: 'fire', fill: '#0c0a08', rim: '#c8b090',
      geo: { stinger: false, gaster: [-86, -16, 46, 32, -8] },
      extra: (c) => (
        <g transform={c.headRot}>
          <ellipse cx={84} cy={-26} rx={46} ry={14} fill="#0c0a08" stroke={c.rim} strokeWidth={3} transform="rotate(-70 84 -26)" />
          {spines([[-10, -30, -24, -52], [30, -34, 34, -56]])(c)}
        </g>
      ),
    },
  },
  {
    rank: 17, id: 'dracula', name: 'Dracula Ants', latin: 'Mystrium camillae', role: 'The rival',
    blurb: 'Their jaw snap is the fastest movement of any animal, faster than a trap-jaw. Secretive, underground.',
    home: ['#2a1606', '#050201'], size: 1.0,
    ant: {
      species: 'trapjaw', fill: '#a8702c', rim: '#ffd08a', eyeScale: 0.35, jaw: 0.15,
      geo: { jawKind: 'blade', jawLen: 70, gaster: [-96, -16, 42, 30, -10] },
    },
  },
  {
    rank: 18, id: 'gliding', name: 'Gliding Ants', latin: 'Cephalotes atratus', role: 'The air force',
    blurb: 'They fall out of trees and steer through the air.',
    home: ['#1a2a2a', '#040606'], size: 1.05,
    ant: {
      species: 'fire', fill: '#060606', rim: '#a8d8e0', pitch: 0.2,
      geo: { stinger: false, feet: [130, 24, -120], femur: 50, tibia: 70, ground: 30 },
      extra: (c) => <>{spines([[-6, -30, -18, -52], [24, -36, 28, -60], [46, -30, 58, -48]])(c)}<g stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2}>{[-80, -40, 0].map((x) => <path key={x} d={`M${x},-90 l-20,-60`} />)}</g></>,
    },
  },
  {
    rank: 19, id: 'acrobat', name: 'Acrobat Ants', latin: 'Crematogaster scutellaris', role: 'Tricksters',
    blurb: 'They raise their heart-shaped abdomen over their head and spray chemicals.',
    home: ['#2a1a10', '#060402'], size: 0.85,
    ant: {
      species: 'fire', fill: '#2a0a06', headFill: '#7a2410', rim: '#ff9a6a',
      geo: { stinger: false, gaster: [-40, -92, 40, 30, 60], petiole: 'double' },
      extra: (c) => <g>{[0, 1, 2].map((i) => <circle key={i} cx={-6 + i * 20} cy={-138 - i * 12 + Math.sin(c.t * 6 + i) * 4} r={5} fill="#f0f0d0" opacity={0.7 - i * 0.15} />)}</g>,
    },
  },
  {
    rank: 20, id: 'ghost', name: 'Ghost Ants', latin: 'Tapinoma melanocephalum', role: 'Perfect spies',
    blurb: 'Tiny and nearly see-through.',
    home: ['#1a1a20', '#040406'], size: 0.5,
    ant: { species: 'fire', fill: '#1a1410', gasterFill: 'rgba(240,230,210,0.25)', rim: '#e8e0d0', rimOpacity: 0.5, geo: { stinger: false, gaster: [-78, -14, 34, 24, -10] } },
  },
  {
    rank: 21, id: 'pharaoh', name: 'Pharaoh Ants', latin: 'Monomorium pharaonis', role: 'Palace intrigue',
    blurb: 'Many queens in one colony. Constant political backstabbing.',
    home: ['#3a2a10', '#080602'], size: 0.5,
    ant: {
      species: 'fire', fill: '#b07a30', gasterFill: '#3a2410', rim: '#ffd890', geo: { stinger: false },
      extra: () => <g fill="#ffd060" opacity={0.85}>{[0, 1, 2].map((i) => <path key={i} d={`M${60 + i * 26},-78 l6,-14 l6,10 l6,-10 l6,14 Z`} />)}</g>,
    },
  },
  {
    rank: 22, id: 'trapjaw', name: 'Trap-Jaw Ants', latin: 'Odontomachus bauri', role: "250's home",
    blurb: 'Dead last. Small, overlooked, picked on by everyone. Which makes his rise even crazier.',
    home: ['#4a2c12', '#0a0603'], size: 1.0,
    ant: { species: 'trapjaw', fill: '#0d0805', rim: '#ffb066' },
  },
];

export const colony = (id: string) => COLONIES.find((c) => c.id === id)!;

/** Draw a member of any colony. */
export const ColonyAnt: React.FC<{ id: string } & Partial<AntProps> & Pick<AntProps, 't' | 'x' | 'y'>> = ({ id, ...p }) => {
  const c = colony(id);
  return <Ant {...(c.ant as AntProps)} {...p} />;
};
