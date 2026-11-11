import React from 'react';
import { clamp, fbm, noise1 } from '../lib/random';

export type Species = 'trapjaw' | 'fire' | 'kesh' | 'queen';

export type AntProps = {
  species: Species;
  /** Story time, seconds. */
  t: number;
  x: number;
  y: number;
  /** Body length in px is ~260 * scale. */
  scale?: number;
  /** 1 = facing right, -1 = facing left. */
  dir?: 1 | -1;
  /** Walk cycles per second (0 = standing). */
  walk?: number;
  /** Body colour and rim-light colour. */
  fill?: string;
  rim?: string;
  rimOpacity?: number;
  /** 0..1, trap-jaw mandible spread (1 = cocked open). */
  jaw?: number;
  /** 0..1 green veins + eye glint. */
  infection?: number;
  /** Draw as a glowing outline only (hyper-senses view). */
  outline?: string;
  /** Unique seed so ants do not move in lockstep. */
  seed?: number;
  /** Low detail for swarms. */
  lod?: 0 | 1 | 2;
  /** Kesh loses an antenna in episode 5. */
  oneAntenna?: boolean;
  /** Head tilt / lunge in radians. */
  pitch?: number;
  opacity?: number;
  /** Upside-down (walking on a ceiling). */
  flip?: boolean;
  glowId?: string;
};

type Geo = {
  gaster: [number, number, number, number, number]; // cx, cy, rx, ry, rot(deg)
  bands: number;
  petiole: 'spine' | 'double';
  meso: string;
  head: string;
  eye: [number, number, number];
  jawBase: [number, number];
  jawLen: number;
  jawKind: 'trap' | 'short';
  antBase: [number, number];
  scape: number;
  funic: number;
  hips: [number, number][];
  feet: number[];
  femur: number;
  tibia: number;
  ground: number;
  legW: number;
  stinger: boolean;
  veins: string[];
};

const TRAPJAW: Geo = {
  gaster: [-96, -16, 46, 30, -14],
  bands: 3,
  petiole: 'spine',
  meso: 'M-34,-8 C-38,-22 -26,-30 -12,-28 C-2,-27 4,-22 12,-24 C22,-34 40,-36 50,-26 C56,-20 54,-10 46,-6 C30,-2 -10,-1 -34,-8 Z',
  head: 'M50,-24 C56,-38 74,-44 96,-40 C112,-37 124,-32 128,-24 C130,-16 124,-8 110,-6 C92,-4 70,-6 58,-10 C52,-13 49,-18 50,-24 Z',
  eye: [104, -28, 5.5],
  jawBase: [126, -20],
  jawLen: 78,
  jawKind: 'trap',
  antBase: [116, -36],
  scape: 40,
  funic: 62,
  hips: [[38, -6], [12, -5], [-16, -6]],
  feet: [100, 8, -84],
  femur: 60,
  tibia: 70,
  ground: 46,
  legW: 6,
  stinger: false,
  veins: [
    'M-140,-20 C-120,-34 -96,-30 -80,-40 C-70,-46 -62,-38 -56,-30',
    'M-136,-6 C-114,0 -96,-12 -74,-6 C-64,-2 -58,-12 -50,-18',
    'M-30,-18 C-16,-24 0,-16 14,-26 C26,-32 38,-26 48,-20',
    'M60,-20 C72,-30 84,-24 96,-34',
    'M64,-12 C80,-10 92,-16 112,-14',
  ],
};

const FIRE: Geo = {
  gaster: [-84, -14, 46, 34, -10],
  bands: 3,
  petiole: 'double',
  meso: 'M-30,-8 C-34,-22 -22,-30 -8,-28 C4,-26 10,-30 20,-34 C34,-38 46,-30 46,-20 C46,-10 38,-5 26,-4 C6,-2 -16,-2 -30,-8 Z',
  head: 'M44,-22 C46,-40 66,-48 86,-44 C104,-40 112,-28 110,-16 C108,-6 96,-2 80,-2 C62,-2 48,-8 44,-22 Z',
  eye: [86, -28, 4.5],
  jawBase: [108, -12],
  jawLen: 24,
  jawKind: 'short',
  antBase: [98, -38],
  scape: 40,
  funic: 46,
  hips: [[34, -6], [8, -5], [-18, -6]],
  feet: [88, 4, -74],
  femur: 48,
  tibia: 56,
  ground: 40,
  legW: 5.5,
  stinger: true,
  veins: [],
};

const QUEEN: Geo = {
  ...FIRE,
  gaster: [-150, -30, 110, 72, -8],
  bands: 5,
  meso: 'M-40,-6 C-50,-30 -30,-52 -6,-54 C16,-56 26,-58 40,-56 C58,-52 66,-38 64,-22 C62,-8 50,-2 30,-2 C0,0 -24,0 -40,-6 Z',
  hips: [[44, -8], [14, -6], [-20, -8]],
  feet: [112, 6, -96],
  femur: 62,
  tibia: 74,
  ground: 50,
  legW: 7,
};

const GEO: Record<Species, Geo> = { trapjaw: TRAPJAW, fire: FIRE, kesh: FIRE, queen: QUEEN };

/** Two-bone IK. Returns the knee, preferring the solution above the hip→foot line. */
export function knee(hx: number, hy: number, fx: number, fy: number, a: number, b: number, back: boolean): [number, number] {
  const dx = fx - hx, dy = fy - hy;
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const base = Math.atan2(dy, dx), off = Math.acos(cosA);
  const k1: [number, number] = [hx + Math.cos(base - off) * a, hy + Math.sin(base - off) * a];
  const k2: [number, number] = [hx + Math.cos(base + off) * a, hy + Math.sin(base + off) * a];
  // the knee arches above the body line; hind legs bend backwards, front legs forwards
  const pickHigh = k1[1] < k2[1] ? k1 : k2;
  if (Math.abs(k1[1] - k2[1]) < 4) return back ? (k1[0] < k2[0] ? k1 : k2) : k1[0] > k2[0] ? k1 : k2;
  return pickHigh;
}

export const Ant: React.FC<AntProps> = (p) => {
  const g = GEO[p.species];
  const s = p.scale ?? 1;
  const dir = p.dir ?? 1;
  const t = p.t;
  const seed = p.seed ?? 0;
  const walk = p.walk ?? 0;
  const lod = p.lod ?? 0;
  const inf = clamp(p.infection ?? 0);
  const fill = p.fill ?? '#0e0805';
  const rim = p.rim ?? '#ffae55';
  const rimOp = p.rimOpacity ?? 0.85;
  const outline = p.outline;
  const phase = t * walk * Math.PI * 2 + seed * 1.7;
  const bob = walk ? -Math.abs(Math.sin(phase)) * 2.2 : Math.sin(t * 1.3 + seed) * 0.8;
  const breathe = 1 + Math.sin(t * 1.6 + seed) * 0.012;
  const pitch = (p.pitch ?? 0) + (walk ? Math.sin(phase * 2) * 0.015 : 0);

  // legs: tripod gait; side 0 = near (in front of the body), 1 = far
  const legs: { pts: [number, number][]; far: boolean }[] = [];
  for (const side of [1, 0]) {
    g.hips.forEach(([hx, hy], i) => {
      const group = (i + side) % 2;
      const u = (((phase + group * Math.PI) / (Math.PI * 2)) % 1 + 1) % 1;
      const stride = walk ? 34 : 0;
      let fx = g.feet[i], fy = g.ground, lift = 0;
      if (walk) {
        if (u < 0.5) fx += stride * (0.5 - u * 2);
        else {
          const k = (u - 0.5) * 2;
          fx += stride * (-0.5 + k * k * (3 - 2 * k));
          lift = Math.sin(Math.PI * k) * 12;
        }
      } else fx += noise1(t * 0.4 + i * 3 + side * 7, seed) * 3;
      fy -= lift;
      const ox = side ? 7 : 0, oy = side ? -4 : 0;
      const H: [number, number] = [hx + ox, hy + oy];
      const F: [number, number] = [fx + ox * 1.6, fy + oy];
      // arched knee above the hip (stylised, slightly spider-like)
      const K: [number, number] = [H[0] + (F[0] - H[0]) * 0.4 + [14, 4, -14][i], H[1] - g.femur * [0.7, 0.6, 0.72][i] + lift * 0.4];
      const tarsus: [number, number] = [F[0] + (i === 2 ? -10 : 10), F[1] + 2];
      legs.push({ pts: [H, K, F, tarsus], far: !!side });
    });
  }

  // antennae: elbowed, twitching
  const antennae = (oneAntenna: boolean) => {
    const out: { pts: [number, number][]; far: boolean; stub: boolean }[] = [];
    for (const side of [1, 0]) {
      const tw = fbm(t * 1.8 + side * 9 + seed, 31) * 0.35 + Math.sin(t * 7 + seed + side) * 0.04;
      const [bx, by] = [g.antBase[0] + (side ? 5 : 0), g.antBase[1] - (side ? 3 : 0)];
      const a1 = -2.25 + (side ? 0.15 : 0) + tw * 0.25;
      const ex = bx + Math.cos(a1) * g.scape, ey = by + Math.sin(a1) * g.scape;
      const stub = oneAntenna && side === 0;
      const a2 = -0.62 + tw * 0.8 + (side ? -0.14 : 0);
      const len = stub ? g.funic * 0.18 : g.funic;
      const mx = ex + Math.cos(a2) * len * 0.55, my = ey + Math.sin(a2) * len * 0.55;
      const a3 = a2 + 0.25 + tw * 0.4;
      const tx = mx + Math.cos(a3) * len * 0.45, ty = my + Math.sin(a3) * len * 0.45;
      out.push({ pts: stub ? [[bx, by], [ex, ey], [mx, my]] : [[bx, by], [ex, ey], [mx, my], [tx, ty]], far: !!side, stub });
    }
    return out;
  };
  const ants = antennae(!!p.oneAntenna);

  const jawOpen = clamp(p.jaw ?? 1);
  const jaw = (upper: boolean) => {
    const [jx, jy] = g.jawBase;
    if (g.jawKind === 'short') {
      const a = upper ? -0.2 : 0.35;
      return `M${jx - 6},${jy - 3} Q${jx + 18 * Math.cos(a)},${jy + 18 * Math.sin(a) - 4} ${jx + g.jawLen},${jy + (upper ? -2 : 8)} Q${jx + 14},${jy + 6} ${jx - 4},${jy + 5} Z`;
    }
    const spread = (upper ? -1 : 1) * (0.05 + 0.32 * jawOpen);
    const L = g.jawLen, c = Math.cos(spread), sn = Math.sin(spread);
    const P = (u: number, v: number): string => `${jx + u * c - v * sn},${jy + u * sn + v * c}`;
    const hook = upper ? 1 : -1;
    // long straight blade, teeth at the tip curling inward
    return `M${P(-4, -3.2)} L${P(L - 8, -2.2)} L${P(L, 4 * hook)} L${P(L - 4, 9 * hook)} L${P(L - 10, 2.4 * hook)} L${P(L - 14, 6 * hook)} L${P(L - 18, 2)} L${P(-4, 3.2)} Z`;
  };

  const [gcx, gcy, grx, gry, grot] = g.gaster;
  const gaster = `M${gcx - grx},${gcy} a${grx},${gry * breathe} 0 1,0 ${grx * 2},0 a${grx},${gry * breathe} 0 1,0 ${-grx * 2},0`;
  const isFire = p.species !== 'trapjaw';
  const petiole =
    g.petiole === 'spine'
      ? 'M-50,-10 C-50,-20 -46,-34 -42,-40 C-38,-34 -34,-22 -32,-10 C-38,-6 -46,-6 -50,-10 Z'
      : 'M-48,-12 C-48,-24 -40,-28 -36,-20 C-34,-14 -38,-8 -44,-8 Z M-36,-12 C-34,-22 -26,-26 -24,-16 C-24,-10 -28,-6 -34,-8 Z';
  const stinger = g.stinger ? `M${gcx - grx + 4},${gcy + 6} L${gcx - grx - 16},${gcy + 14} L${gcx - grx + 6},${gcy + 14} Z` : '';

  const legW = g.legW;
  const polyline = (pts: [number, number][]) => 'M' + pts.map((q) => q.join(',')).join(' L');

  /** One full drawing pass of the ant (used for the rim light and the body). */
  const body = (color: string, legColor: string, pass: 'rim' | 'body' | 'outline') => {
    const strokeOnly = pass === 'outline';
    const f = strokeOnly ? 'none' : color;
    const st = strokeOnly ? color : 'none';
    const sw = strokeOnly ? 2.4 : 0;
    const legEls = (far: boolean) =>
      legs
        .filter((l) => l.far === far)
        .map((l, i) => (
          <g key={'l' + far + i}>
            <path d={polyline(l.pts.slice(0, 2))} stroke={legColor} strokeWidth={strokeOnly ? 2.4 : legW * 1.15} strokeLinecap="round" fill="none" />
            <path d={polyline(l.pts.slice(1, 3))} stroke={legColor} strokeWidth={strokeOnly ? 2 : legW * 0.8} strokeLinecap="round" fill="none" />
            {lod < 2 && <path d={polyline(l.pts.slice(2, 4))} stroke={legColor} strokeWidth={strokeOnly ? 1.6 : legW * 0.5} strokeLinecap="round" fill="none" />}
          </g>
        ));
    const antEls = (far: boolean) =>
      ants
        .filter((a) => a.far === far)
        .map((a, i) => (
          <g key={'a' + far + i}>
            <path d={polyline(a.pts)} stroke={legColor} strokeWidth={strokeOnly ? 2 : legW * 0.55} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {!a.stub && <circle cx={a.pts[3][0]} cy={a.pts[3][1]} r={strokeOnly ? 3 : legW * 0.75} fill={f} stroke={st} strokeWidth={sw} />}
          </g>
        ));
    return (
      <g>
        {legEls(true)}
        {antEls(true)}
        <path d={gaster} transform={`rotate(${grot} ${gcx} ${gcy})`} fill={f} stroke={st} strokeWidth={sw} />
        {stinger && <path d={stinger} fill={f} stroke={st} strokeWidth={sw} />}
        <path d={petiole} fill={f} stroke={st} strokeWidth={sw} />
        <path d={g.meso} fill={f} stroke={st} strokeWidth={sw} />
        <g transform={`rotate(${pitch * 57.3} 52 -18)`}>
          {g.jawKind === 'trap' && <path d={jaw(false)} fill={f} stroke={st} strokeWidth={sw} />}
          <path d={g.head} fill={f} stroke={st} strokeWidth={sw} />
          {g.jawKind === 'trap' ? <path d={jaw(true)} fill={f} stroke={st} strokeWidth={sw} /> : <path d={jaw(true)} fill={f} stroke={st} strokeWidth={sw} />}
          {antEls(false)}
        </g>
        {legEls(false)}
      </g>
    );
  };

  const rimDx = -2.6 / Math.max(0.4, s), rimDy = -3 / Math.max(0.4, s);
  const pulse = 0.55 + 0.45 * Math.sin(t * 3.1 + seed);
  const glintR = g.eye[2] * (0.35 + 0.5 * inf);
  const flipY = p.flip ? -1 : 1;

  return (
    <g transform={`translate(${p.x},${p.y}) scale(${s * dir},${s * flipY}) translate(0,${bob})`} opacity={p.opacity ?? 1}>
      {outline ? (
        <g>
          <g opacity={0.35} style={{ filter: 'blur(3px)' }}>{body(outline, outline, 'outline')}</g>
          {body(outline, outline, 'outline')}
        </g>
      ) : (
        <>
          {lod < 2 && rimOp > 0 && (
            <g transform={`translate(${rimDx},${rimDy})`} opacity={rimOp}>
              {body(rim, rim, 'rim')}
            </g>
          )}
          {body(fill, fill, 'body')}
          {lod === 0 && (
            <>
              {/* gaster sheen and segment bands */}
              <ellipse cx={gcx + 10} cy={gcy - gry * 0.45} rx={grx * 0.55} ry={gry * 0.22} transform={`rotate(${grot} ${gcx} ${gcy})`} fill={rim} opacity={0.13} />
              {Array.from({ length: g.bands }, (_, i) => {
                const bx = gcx + grx * (0.55 - i * 0.38);
                return <path key={i} d={`M${bx},${gcy - gry * 0.92} Q${bx - 9},${gcy} ${bx},${gcy + gry * 0.92}`} stroke={rim} strokeOpacity={0.16} strokeWidth={1.6} fill="none" transform={`rotate(${grot} ${gcx} ${gcy})`} />;
              })}
              {/* body texture: tiny pits catching the light */}
              <path d={g.meso} fill="none" stroke={rim} strokeOpacity={0.1} strokeWidth={1.2} />
              {p.species === 'kesh' && (
                <g stroke="#e8c9a8" strokeOpacity={0.55} strokeWidth={2.2} strokeLinecap="round" fill="none">
                  <path d="M64,-40 L80,-18 M70,-42 L74,-34" />
                  <path d="M-6,-28 L10,-10" />
                  <path d="M-110,-40 L-86,-6 M-96,-42 L-90,-30" />
                  <path d="M88,-6 L100,-20" strokeOpacity={0.4} />
                </g>
              )}
            </>
          )}
          {/* infection: veins under the shell */}
          {inf > 0.01 && g.veins.length > 0 && lod < 2 && (
            <g stroke="#6dff8a" fill="none" strokeLinecap="round" opacity={inf * (0.35 + 0.5 * pulse)} filter={p.glowId ? `url(#${p.glowId})` : undefined}>
              {g.veins.map((d, i) => (
                <path key={i} d={d} strokeWidth={1.4 + inf * 1.2} strokeDasharray={inf < 0.4 ? '18 10' : undefined} />
              ))}
            </g>
          )}
          {/* eye */}
          <g transform={`rotate(${pitch * 57.3} 52 -18)`}>
            <ellipse cx={g.eye[0]} cy={g.eye[1]} rx={g.eye[2]} ry={g.eye[2] * 0.8} fill="#030201" />
            <circle cx={g.eye[0] + 1.5} cy={g.eye[1] - 1.5} r={g.eye[2] * 0.3} fill={rim} opacity={0.5} />
            {inf > 0.01 && (
              <>
                <circle cx={g.eye[0] + 1} cy={g.eye[1] - 0.5} r={glintR * 5} fill="url(#glintGlow)" opacity={Math.min(1, inf * 1.2) * (0.6 + 0.4 * pulse)} />
                <circle cx={g.eye[0] + 1} cy={g.eye[1] - 0.5} r={glintR} fill="#b8ffc6" opacity={Math.min(1, 0.4 + inf)} />
              </>
            )}
          </g>
        </>
      )}
    </g>
  );
};

/** Shared SVG defs every scene needs once (glows used by ants and effects). */
export const AntDefs: React.FC = () => (
  <defs>
    <radialGradient id="glintGlow">
      <stop offset="0" stopColor="#9dffb0" stopOpacity={0.9} />
      <stop offset="0.4" stopColor="#3dff6a" stopOpacity={0.35} />
      <stop offset="1" stopColor="#3dff6a" stopOpacity={0} />
    </radialGradient>
    <filter id="veinGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.2" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);
