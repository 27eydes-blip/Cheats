import React from 'react';
import { clamp, fbm, lerp, noise1 } from '../lib/random';

/**
 * The shared character rig. Every ant in every episode is drawn by this one component,
 * so 250 always looks the same: a dark-brown trap-jaw, identical to his sisters except
 * for the amoeba's green veins and eye glint.
 *
 * Side view, facing right. Units: ~270 from gaster tip to head, mandibles add ~95.
 * Anatomy: head – mesosoma (middle body; all six legs attach here) – petiole – gaster.
 * Each leg: coxa → femur → knee → tibia → ankle → tarsus (three visible segments).
 */
export type Species = 'trapjaw' | 'fire' | 'kesh' | 'queen' | 'tjqueen';

export type AntProps = {
  species: Species;
  /** Story time, seconds. */
  t: number;
  x: number;
  y: number;
  /** 1 = default size (~270px long). */
  scale?: number;
  /** 1 = facing right, -1 = facing left. */
  dir?: 1 | -1;
  /** Walk cycles per second (0 = standing). */
  walk?: number;
  fill?: string;
  rim?: string;
  rimOpacity?: number;
  /** 0..1 trap-jaw mandible spread (1 = cocked open, 0 = snapped shut). */
  jaw?: number;
  /** 0..1 green veins + eye glint. */
  infection?: number;
  /** 0..1 how open the eyes are (for waking up). Default 1. */
  eyeOpen?: number;
  /** 0..1 lying in the dirt (legs folded, body down, antennae limp). */
  lie?: number;
  /** Draw as a glowing outline only (hyper-senses view). */
  outline?: string;
  seed?: number;
  /** 0 full detail, 1 medium, 2 swarm. */
  lod?: 0 | 1 | 2;
  oneAntenna?: boolean;
  /** Head tilt, radians (+ = down). */
  pitch?: number;
  opacity?: number;
  /** Upside-down (walking on a ceiling). */
  flip?: boolean;
  glowId?: string;
  /** Something held in the mandibles: a crumb or a sand grain. */
  carry?: 'crumb' | 'grain' | 'twig';
};

type Geo = {
  gaster: [number, number, number, number, number];
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
  /** Coxae (on the mesosoma underside). */
  hips: [number, number][];
  /** Resting tarsus-tip x for front, mid, hind. */
  feet: number[];
  femur: number;
  tibia: number;
  tarsus: number;
  /** Femur angle (radians, screen space) for front, mid, hind: up-forward → up-back. */
  femurAng: number[];
  ground: number;
  legW: number;
  stinger: boolean;
  veins: string[];
};

const TRAPJAW: Geo = {
  gaster: [-98, -18, 46, 31, -12],
  bands: 3,
  petiole: 'spine',
  meso: 'M-34,-8 C-38,-22 -26,-30 -12,-28 C-2,-27 4,-22 12,-24 C22,-34 40,-37 50,-27 C56,-21 54,-11 46,-6 C30,-2 -10,-1 -34,-8 Z',
  head: 'M50,-24 C54,-38 72,-45 94,-42 C110,-40 122,-35 128,-28 C132,-20 128,-10 116,-7 C96,-3 72,-5 60,-9 C53,-12 49,-18 50,-24 Z',
  eye: [100, -29, 5.8],
  jawBase: [126, -19],
  jawLen: 96,
  jawKind: 'trap',
  antBase: [112, -38],
  scape: 40,
  funic: 60,
  hips: [[40, -8], [17, -6], [-10, -8]],
  feet: [108, 22, -88],
  femur: 42,
  tibia: 48,
  tarsus: 30,
  femurAng: [-0.85, -1.9, -2.3],
  ground: 46,
  legW: 5.5,
  stinger: false,
  veins: [
    'M-140,-22 C-120,-36 -96,-32 -80,-42 C-70,-48 -62,-40 -56,-32',
    'M-136,-8 C-114,-2 -96,-14 -74,-8 C-64,-4 -58,-14 -50,-20',
    'M-30,-18 C-16,-24 0,-16 14,-26 C26,-32 38,-26 48,-20',
    'M60,-20 C72,-32 84,-26 98,-36',
    'M64,-12 C80,-10 94,-16 116,-14',
  ],
};

const FIRE: Geo = {
  gaster: [-84, -16, 44, 33, -10],
  bands: 3,
  petiole: 'double',
  meso: 'M-30,-8 C-34,-22 -22,-30 -8,-28 C4,-26 10,-30 20,-34 C34,-38 46,-30 46,-20 C46,-10 38,-5 26,-4 C6,-2 -16,-2 -30,-8 Z',
  head: 'M44,-22 C46,-40 66,-48 86,-44 C104,-40 112,-28 110,-16 C108,-6 96,-2 80,-2 C62,-2 48,-8 44,-22 Z',
  eye: [86, -28, 4.8],
  jawBase: [108, -12],
  jawLen: 26,
  jawKind: 'short',
  antBase: [96, -40],
  scape: 34,
  funic: 46,
  hips: [[34, -8], [12, -6], [-12, -8]],
  feet: [92, 18, -76],
  femur: 36,
  tibia: 40,
  tarsus: 24,
  femurAng: [-0.85, -1.9, -2.3],
  ground: 40,
  legW: 5,
  stinger: true,
  veins: [],
};

const QUEEN: Geo = {
  ...FIRE,
  gaster: [-150, -30, 110, 72, -8],
  bands: 5,
  meso: 'M-40,-6 C-50,-30 -30,-52 -6,-54 C16,-56 26,-58 40,-56 C58,-52 66,-38 64,-22 C62,-8 50,-2 30,-2 C0,0 -24,0 -40,-6 Z',
  hips: [[44, -8], [18, -6], [-14, -8]],
  feet: [116, 22, -96],
  femur: 50,
  tibia: 56,
  tarsus: 32,
  ground: 52,
  legW: 7,
};

/** The trap-jaw queen: same family look as 250, but a huge gaster and broad thorax. */
const TJQUEEN: Geo = {
  ...TRAPJAW,
  gaster: [-150, -30, 100, 64, -8],
  bands: 5,
  meso: 'M-40,-6 C-50,-30 -30,-50 -6,-52 C16,-54 30,-56 46,-50 C58,-44 60,-30 56,-16 C52,-6 40,-2 24,-2 C0,0 -24,0 -40,-6 Z',
  hips: [[44, -8], [16, -6], [-14, -8]],
  feet: [116, 22, -100],
  femur: 48,
  tibia: 54,
  legW: 6.5,
};

const GEO: Record<Species, Geo> = { trapjaw: TRAPJAW, fire: FIRE, kesh: FIRE, queen: QUEEN, tjqueen: TJQUEEN };

type P = [number, number];

export const Ant: React.FC<AntProps> = (p) => {
  const g = GEO[p.species];
  const s = p.scale ?? 1;
  const dir = p.dir ?? 1;
  const t = p.t;
  const seed = p.seed ?? 0;
  const lie = clamp(p.lie ?? 0);
  const walk = (p.walk ?? 0) * (1 - lie);
  const lod = p.lod ?? 0;
  const inf = clamp(p.infection ?? 0);
  const eyeOpen = clamp(p.eyeOpen ?? 1);
  const fill = p.fill ?? '#0e0805';
  const rim = p.rim ?? '#ffae55';
  const rimOp = p.rimOpacity ?? 0.85;
  const outline = p.outline;
  const phase = t * walk * Math.PI * 2 + seed * 1.7;
  const bob = walk ? -Math.abs(Math.sin(phase)) * 2 : Math.sin(t * 1.3 + seed) * 0.6 * (1 - lie);
  const breathe = 1 + Math.sin(t * (lie > 0.5 ? 0.6 : 1.6) + seed) * 0.012;
  const sink = lie * (g.ground - 6); // body settles onto the dirt
  const pitch = (p.pitch ?? 0) + lie * 0.12 + (walk ? Math.sin(phase * 2) * 0.012 : 0);

  // ---- legs: three segments, tripod gait ----
  const legs: { pts: P[]; far: boolean }[] = [];
  const stride = 30;
  for (const side of [1, 0]) {
    g.hips.forEach(([hx, hy], i) => {
      const group = (i + side) % 2;
      const u = ((((phase + group * Math.PI) / (Math.PI * 2)) % 1) + 1) % 1;
      let tipX = g.feet[i], lift = 0, swing = 0;
      if (walk) {
        if (u < 0.5) swing = 0.5 - u * 2; // stance: foot slides back
        else {
          const k = (u - 0.5) * 2;
          swing = -0.5 + k * k * (3 - 2 * k);
          lift = Math.sin(Math.PI * k) * 11;
        }
        tipX += stride * swing;
      } else tipX += noise1(t * 0.35 + i * 3 + side * 7, seed) * 2.5;
      // lying: feet tuck in under the body
      tipX = lerp(tipX, hx + [16, 2, -14][i], lie);
      const ox = side ? 6 : 0, oy = side ? -4 : 0;
      const ground = g.ground - sink;
      const H: P = [hx + ox, hy + oy];
      const tip: P = [tipX + ox * 1.5, ground - lift + oy * 0.5];
      // tarsus points out and down from the ankle
      const tdir = [0.62, 0.15, -0.62][i];
      const tlen = g.tarsus * lerp(1, 0.7, lie);
      const ankle: P = [tip[0] - tdir * tlen, tip[1] - Math.sqrt(1 - tdir * tdir) * tlen * 0.75];
      // femur from the coxa, angled up so the knee arches above the body line
      const fa = g.femurAng[i] + swing * 0.28 * (i === 2 ? -1 : 1) - lift * 0.01 + lie * [0.75, 1.75, -0.75][i];
      const fl = g.femur * lerp(1, 0.8, lie);
      const knee: P = [H[0] + Math.cos(fa) * fl, H[1] + Math.sin(fa) * fl];
      legs.push({ pts: [H, knee, ankle, tip], far: !!side });
    });
  }

  // ---- antennae: elbowed (scape + funiculus with a club), twitching ----
  const ants: { pts: P[]; far: boolean; stub: boolean }[] = [];
  for (const side of [1, 0]) {
    const tw = (fbm(t * 1.7 + side * 9 + seed, 31) * 0.35 + Math.sin(t * 7 + seed + side) * 0.04) * (1 - lie * 0.8);
    const [bx, by] = [g.antBase[0] + (side ? 5 : 0), g.antBase[1] - (side ? 3 : 0)];
    const a1 = -2.2 + (side ? 0.14 : 0) + tw * 0.25 + lie * 1.1;
    const ex = bx + Math.cos(a1) * g.scape, ey = by + Math.sin(a1) * g.scape;
    const stub = !!p.oneAntenna && side === 0;
    const a2 = -0.5 + tw * 0.8 + (side ? -0.14 : 0) + lie * 1.25;
    const len = stub ? g.funic * 0.18 : g.funic;
    const mx = ex + Math.cos(a2) * len * 0.55, my = ey + Math.sin(a2) * len * 0.55;
    const a3 = a2 + 0.22 + tw * 0.4 + lie * 0.3;
    const tx = mx + Math.cos(a3) * len * 0.45, ty = my + Math.sin(a3) * len * 0.45;
    ants.push({ pts: stub ? [[bx, by], [ex, ey], [mx, my]] : [[bx, by], [ex, ey], [mx, my], [tx, ty]], far: !!side, stub });
  }

  // ---- mandibles ----
  const jawOpen = clamp(p.jaw ?? 1);
  const jaw = (upper: boolean) => {
    const [jx, jy] = g.jawBase;
    if (g.jawKind === 'short') {
      const a = upper ? -0.2 : 0.35;
      return `M${jx - 6},${jy - 3} Q${jx + 18 * Math.cos(a)},${jy + 18 * Math.sin(a) - 4} ${jx + g.jawLen},${jy + (upper ? -2 : 8)} Q${jx + 14},${jy + 6} ${jx - 4},${jy + 5} Z`;
    }
    // trap-jaw: long, thick, dead-straight blades with hooked teeth at the tip
    const spread = (upper ? -1 : 1) * (0.03 + 0.3 * jawOpen);
    const L = g.jawLen, c = Math.cos(spread), sn = Math.sin(spread);
    const P = (u: number, v: number) => `${(jx + u * c - v * sn).toFixed(1)},${(jy + u * sn + v * c).toFixed(1)}`;
    const k = upper ? 1 : -1; // teeth hook toward the other jaw
    return `M${P(-6, -5.5 * k)} L${P(L - 10, -3 * k)} L${P(L, 2 * k)} L${P(L - 2, 12 * k)} L${P(L - 9, 4 * k)} L${P(L - 13, 10 * k)} L${P(L - 18, 3.5 * k)} L${P(L - 24, 7 * k)} L${P(L - 28, 4 * k)} L${P(-6, 5.5 * k)} Z`;
  };
  const jawRim = (upper: boolean) => {
    const [jx, jy] = g.jawBase;
    const spread = (upper ? -1 : 1) * (0.03 + 0.3 * jawOpen);
    const L = g.jawLen, k = upper ? 1 : -1;
    const x1 = jx - 2, y1 = jy - 5 * k, x2 = jx + (L - 10) * Math.cos(spread) + 3 * k * Math.sin(spread), y2 = jy + (L - 10) * Math.sin(spread) - 3 * k * Math.cos(spread);
    return `M${x1},${y1} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  };

  const [gcx, gcy, grx, gry, grot] = g.gaster;
  const gaster = `M${gcx - grx},${gcy} a${grx},${gry * breathe} 0 1,0 ${grx * 2},0 a${grx},${gry * breathe} 0 1,0 ${-grx * 2},0`;
  const petiole =
    g.petiole === 'spine'
      ? 'M-50,-10 C-50,-20 -46,-34 -42,-40 C-38,-34 -34,-22 -32,-10 C-38,-6 -46,-6 -50,-10 Z'
      : 'M-48,-12 C-48,-24 -40,-28 -36,-20 C-34,-14 -38,-8 -44,-8 Z M-36,-12 C-34,-22 -26,-26 -24,-16 C-24,-10 -28,-6 -34,-8 Z';
  const stinger = g.stinger ? `M${gcx - grx + 4},${gcy + 6} L${gcx - grx - 18},${gcy + 14} L${gcx - grx + 6},${gcy + 14} Z` : '';
  const legW = g.legW;
  const line = (a: P, b: P) => `M${a[0].toFixed(1)},${a[1].toFixed(1)} L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  const polyline = (pts: P[]) => 'M' + pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' L');
  const headRot = `rotate(${(pitch * 57.3).toFixed(2)} 52 -18)`;

  /** One drawing pass (rim light, body, or outline). */
  const body = (color: string, pass: 'rim' | 'body' | 'outline') => {
    const strokeOnly = pass === 'outline';
    const f = strokeOnly ? 'none' : color;
    const st = strokeOnly ? color : 'none';
    const sw = strokeOnly ? 2.4 : 0;
    const legEls = (far: boolean) =>
      legs
        .filter((l) => l.far === far)
        .map((l, i) => {
          const [H, K, A, T] = l.pts;
          return (
            <g key={'l' + far + i} stroke={color} strokeLinecap="round" fill="none">
              {!strokeOnly && <ellipse cx={H[0]} cy={H[1]} rx={legW * 1.2} ry={legW * 0.9} fill={color} stroke="none" />}
              <path d={line(H, K)} strokeWidth={strokeOnly ? 2.4 : legW * 1.35} />
              <path d={line(K, A)} strokeWidth={strokeOnly ? 2 : legW * 0.95} />
              {lod < 2 && <path d={line(A, T)} strokeWidth={strokeOnly ? 1.6 : legW * 0.6} />}
              {!strokeOnly && lod === 0 && <circle cx={K[0]} cy={K[1]} r={legW * 0.85} fill={color} stroke="none" />}
              {!strokeOnly && lod === 0 && <path d={`M${T[0]},${T[1]} l${(T[0] - A[0]) * 0.18},2`} strokeWidth={legW * 0.4} />}
            </g>
          );
        });
    const antEls = (far: boolean) =>
      ants
        .filter((a) => a.far === far)
        .map((a, i) => (
          <g key={'a' + far + i}>
            <path d={polyline(a.pts)} stroke={color} strokeWidth={strokeOnly ? 2 : legW * 0.55} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {!a.stub && <ellipse cx={a.pts[3][0]} cy={a.pts[3][1]} rx={strokeOnly ? 3.5 : legW * 1.0} ry={strokeOnly ? 2.5 : legW * 0.7} fill={f} stroke={st} strokeWidth={sw} />}
          </g>
        ));
    return (
      <g>
        {legEls(true)}
        <g transform={headRot}>{antEls(true)}</g>
        <path d={gaster} transform={`rotate(${grot} ${gcx} ${gcy})`} fill={f} stroke={st} strokeWidth={sw} />
        {stinger && <path d={stinger} fill={f} stroke={st} strokeWidth={sw} />}
        <path d={petiole} fill={f} stroke={st} strokeWidth={sw} />
        <path d={g.meso} fill={f} stroke={st} strokeWidth={sw} />
        <g transform={headRot}>
          {g.jawKind === 'trap' && <path d={jaw(false)} fill={f} stroke={st} strokeWidth={sw} />}
          <path d={g.head} fill={f} stroke={st} strokeWidth={sw} />
          <path d={jaw(true)} fill={f} stroke={st} strokeWidth={sw} />
          {p.carry && pass !== 'outline' && (
            p.carry === 'twig'
              ? <path d={`M${g.jawBase[0] + 30},${g.jawBase[1] - 60} L${g.jawBase[0] + 50},${g.jawBase[1] + 50}`} stroke={pass === 'rim' ? color : '#2a1a0c'} strokeWidth={12} strokeLinecap="round" />
              : <ellipse cx={g.jawBase[0] + g.jawLen * 0.55} cy={g.jawBase[1] + 2} rx={p.carry === 'crumb' ? 22 : 9} ry={p.carry === 'crumb' ? 16 : 8} fill={pass === 'rim' ? color : p.carry === 'crumb' ? '#c8a272' : '#8a7a62'} />
          )}
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
    <g transform={`translate(${p.x},${p.y}) scale(${s * dir},${s * flipY}) translate(0,${(bob + sink).toFixed(2)})`} opacity={p.opacity ?? 1}>
      {outline ? (
        <g>
          <g opacity={0.35} style={{ filter: 'blur(3px)' }}>{body(outline, 'outline')}</g>
          {body(outline, 'outline')}
        </g>
      ) : (
        <>
          {lod < 2 && rimOp > 0 && (
            <g transform={`translate(${rimDx},${rimDy})`} opacity={rimOp}>
              {body(rim, 'rim')}
            </g>
          )}
          {body(fill, 'body')}
          {lod === 0 && (
            <>
              <ellipse cx={gcx + 10} cy={gcy - gry * 0.45} rx={grx * 0.55} ry={gry * 0.22} transform={`rotate(${grot} ${gcx} ${gcy})`} fill={rim} opacity={0.13} />
              {Array.from({ length: g.bands }, (_, i) => {
                const bx = gcx + grx * (0.55 - i * 0.38);
                return <path key={i} d={`M${bx},${gcy - gry * 0.92} Q${bx - 9},${gcy} ${bx},${gcy + gry * 0.92}`} stroke={rim} strokeOpacity={0.16} strokeWidth={1.6} fill="none" transform={`rotate(${grot} ${gcx} ${gcy})`} />;
              })}
              <path d={g.meso} fill="none" stroke={rim} strokeOpacity={0.1} strokeWidth={1.2} />
              {g.jawKind === 'trap' && (
                <g transform={headRot} stroke={rim} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round">
                  <path d={jawRim(true)} />
                  <path d={jawRim(false)} strokeOpacity={0.3} />
                </g>
              )}
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
          {inf > 0.01 && g.veins.length > 0 && lod < 2 && (
            <g stroke="#6dff8a" fill="none" strokeLinecap="round" opacity={inf * (0.35 + 0.5 * pulse)} filter={p.glowId ? `url(#${p.glowId})` : undefined}>
              {g.veins.map((d, i) => (
                <path key={i} d={d} strokeWidth={1.4 + inf * 1.2} strokeDasharray={inf < 0.4 ? '18 10' : undefined} transform={i >= 3 ? headRot : undefined} />
              ))}
            </g>
          )}
          <g transform={headRot}>
            <ellipse cx={g.eye[0]} cy={g.eye[1]} rx={g.eye[2]} ry={g.eye[2] * 0.8 * Math.max(0.15, eyeOpen)} fill="#030201" />
            {eyeOpen > 0.3 && <circle cx={g.eye[0] + 1.5} cy={g.eye[1] - 1.5} r={g.eye[2] * 0.3} fill={rim} opacity={0.5 * eyeOpen} />}
            {inf > 0.01 && eyeOpen > 0.05 && (
              <>
                <circle cx={g.eye[0] + 1} cy={g.eye[1] - 0.5} r={glintR * 5} fill="url(#glintGlow)" opacity={Math.min(1, inf * 1.2) * (0.6 + 0.4 * pulse) * eyeOpen} />
                <circle cx={g.eye[0] + 1} cy={g.eye[1] - 0.5} r={glintR * eyeOpen} fill="#b8ffc6" opacity={Math.min(1, 0.4 + inf)} />
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
