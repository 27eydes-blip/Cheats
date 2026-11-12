import React from 'react';
import type { SceneId } from '../../script/types';
import { Amoeba } from '../art/Amoeba';
import { Beetle, Drop, Grains } from '../art/Props';
import { Ant, AntDefs } from '../art/Ant';
import { Mandros } from '../art/characters';
import { Dust, Embers, Fog, Rain, Shafts, Smoke } from '../art/Atmosphere';
import { ceilAt, EarthDefs, floorAt, Foreground, smoothPath, Tunnel } from '../art/Earth';
import { AMBER, FIRE, GREEN, NIGHT, VOID, type Palette } from '../art/palette';
import { H, W } from '../config';
import { mix } from '../lib/color';
import { clamp, ease, fbm, hash, hash2, lerp, range } from '../lib/random';
import type { SceneDef, SceneProps } from './types';

export const TJ_GROUND = 46, FIRE_GROUND = 40;
export const wrap = (v: number, m: number) => ((v % m) + m) % m;

export const Stage: React.FC<{ pal: Palette; children: React.ReactNode; bg?: string }> = ({ pal, children, bg }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
    <EarthDefs pal={pal} />
    <AntDefs />
    <rect x={-300} y={-300} width={W + 600} height={H + 600} fill={bg ?? 'url(#bgGrad)'} />
    {children}
  </svg>
);

/** A light source glow with flicker. */
export const Glow: React.FC<{ x: number; y: number; r: number; t: number; amount?: number; ry?: number }> = ({ x, y, r, t, amount = 1, ry }) => {
  const fl = 0.88 + 0.08 * Math.sin(t * 9.3) + 0.04 * Math.sin(t * 23.1);
  return <ellipse cx={x} cy={y} rx={r} ry={ry ?? r} fill="url(#lightGlow)" opacity={amount * fl} style={{ mixBlendMode: 'screen' }} />;
};

/** Ants walking along a tunnel floor that scrolls with the camera. */
export const FloorWalkers: React.FC<{
  t: number; camX: number; floor: number; seed: number; n: number; scale: number; pal: Palette;
  species?: 'trapjaw' | 'fire'; speed?: number; both?: boolean; haze?: number; depth?: number; lod?: 0 | 1 | 2; rough?: number; tseed?: number; dir?: 1 | -1;
  rim?: string; fill?: string; ceiling?: number;
}> = (p) => {
  const depth = p.depth ?? 1;
  const g = p.species === 'fire' ? FIRE_GROUND : TJ_GROUND;
  const span = 2600;
  return (
    <>
      {range(p.n).map((i) => {
        const h1 = hash2(i, p.seed), h2 = hash2(i, p.seed + 1), h3 = hash2(i, p.seed + 2);
        const dir: 1 | -1 = p.dir ?? (p.both && h2 > 0.5 ? -1 : 1);
        const sp = (p.speed ?? 55) * (0.75 + h3 * 0.5);
        const sc = p.scale * (0.85 + h1 * 0.3);
        const wx = h1 * span + p.t * sp * dir;
        const sx = wrap(wx - p.camX * depth, span) - (span - W) / 2;
        const onCeil = p.ceiling !== undefined && h3 > 0.72;
        const y = onCeil
          ? ceilAt(sx, p.camX, p.ceiling!, p.tseed ?? 1, p.rough ?? 60, depth) + g * sc + 4
          : floorAt(sx, p.camX, p.floor, p.tseed ?? 1, p.rough ?? 60, depth) - g * sc + 3;
        const fill = p.fill ?? mix(p.pal.antFill, p.pal.fog, (p.haze ?? 0) * 0.6);
        return (
          <Ant key={i} species={p.species ?? 'trapjaw'} t={p.t} x={sx} y={y} scale={sc} dir={dir} walk={(sp / 55) * 1.1} seed={i + p.seed} fill={fill} rim={p.rim ?? p.pal.rim} rimOpacity={0.8 * (1 - (p.haze ?? 0))} lod={p.lod ?? 1} flip={onCeil} />
        );
      })}
    </>
  );
};

/** A faint, deeper tunnel below the action so the lower frame has depth. */
export const Deep: React.FC<{ pal: Palette; camX: number; t: number; T: number; seed: number; species?: 'trapjaw' | 'fire'; y?: number }> = ({ pal, camX, t, T, seed, species = 'trapjaw', y = 1600 }) => (
  <>
    <Tunnel id={`deep${seed}`} pal={pal} camX={camX} t={t} ceil={y - 150} floor={y + 40} depth={0.5} seed={seed} haze={0.72} roots={false} solid={false} />
    <FloorWalkers t={T} camX={camX} floor={y + 40} seed={seed + 3} n={12} scale={0.3} pal={pal} both haze={0.65} depth={0.5} lod={2} tseed={seed} species={species} />
    <Fog t={t} camX={camX} amount={0.6} y={y - 40} spread={160} />
  </>
);

/** Big trap-jaw hero (250). */
export const Hero: React.FC<SceneProps & { x: number; y: number; scale: number; dir?: 1 | -1; walk?: number; pal: Palette; rim?: string; pitch?: number }> = (p) => (
  p.ep.season > 1 ? (
    <Mandros episode={p.ep.n} t={p.T} x={p.x} y={p.y} scale={p.scale} dir={p.dir} walk={p.walk} jaw={p.jaw} pitch={p.pitch} />
  ) : (
  <Ant species="trapjaw" t={p.T} x={p.x} y={p.y} scale={p.scale} dir={p.dir} walk={p.walk} fill={p.pal.antFill} rim={p.rim ?? p.pal.rim} jaw={p.jaw} infection={p.inf} glowId="veinGlow" seed={250} pitch={p.pitch} armor={p.armor} />
  )
);

// ---------------------------------------------------------------------------------------------

const dark: SceneDef = {
  pal: (p) => (p.ep.infection > 0.5 ? { ...VOID, fog: '#1c4a2a', dust: '#b8ffc8', light: '#3dff6a', grade: '#39ff6a' } : VOID),
  focus: () => [600, 900],
  render: (p) => {
    const pal = dark.pal(p);
    // a dim silhouette of 250's head in the dark: rim light, glinting eye, drifting particles
    const sc = 3.6, hx = 560 - 95 * sc, hy = 1060;
    return (
      <Stage pal={pal}>
        <Glow x={700} y={820} r={760} t={p.t} amount={0.55} ry={620} />
        <Fog t={p.t} amount={0.6} y={1000} />
        <g transform={`translate(0 ${Math.sin(p.t * 0.8) * 6})`}>
          <Ant species="trapjaw" t={p.T} x={hx} y={hy} scale={sc} fill="#040201" rim={pal.rim} rimOpacity={0.45} jaw={p.jaw} infection={Math.max(0.15, p.inf)} glowId="veinGlow" seed={250} armor={p.armor} />
        </g>
        <Dust t={p.t} count={80} seed={p.index + 3} color={pal.dust} speed={0.5} />
      </Stage>
    );
  },
};

const colony: SceneDef = {
  pal: () => AMBER,
  focus: () => [W / 2, 1100],
  render: (p) => {
    const pal = AMBER, camX = p.T * (p.beat.options?.find250 ? 52 : 45) + p.index * 700;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="c-far1" pal={pal} camX={camX} t={p.t} ceil={330} floor={520} depth={0.45} seed={11} haze={0.65} roots={false} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={520} seed={5} n={14} scale={0.32} pal={pal} both haze={0.6} depth={0.45} lod={2} tseed={11} />
        <Tunnel id="c-far2" pal={pal} camX={camX} t={p.t} ceil={1560} floor={1730} depth={0.5} seed={17} haze={0.7} roots={false} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={1730} seed={9} n={12} scale={0.3} pal={pal} both haze={0.65} depth={0.5} lod={2} tseed={17} />
        <Fog t={p.t} camX={camX} amount={0.7} y={500} spread={300} />
        <Tunnel id="c-main" pal={pal} camX={camX} t={p.t} ceil={800} floor={1340} seed={3} lights={2} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={1340} seed={1} n={8} scale={1.15} pal={pal} both tseed={3} lod={0} />
        {p.beat.options?.find250 && (
          <>
            <Hero {...p} x={430} y={floorAt(430, camX, 1340, 3) - TJ_GROUND * 1.15 + 3} scale={1.15} walk={0.8} pal={pal} />
            <circle cx={430 + 100 * 1.15} cy={floorAt(430, camX, 1340, 3) - TJ_GROUND * 1.15 - 29 * 1.15} r={26} fill="url(#glintGlow)" opacity={0.35 + 0.2 * Math.sin(p.T * 3)} style={{ mixBlendMode: 'screen' }} />
          </>
        )}
        <FloorWalkers t={p.T} camX={camX} floor={1340} seed={41} n={4} scale={0.7} pal={pal} both tseed={3} ceiling={800} lod={1} />
        <Fog t={p.t} camX={camX} amount={0.5} y={1150} spread={200} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Dust t={p.t} camX={camX} count={80} seed={p.index} color={pal.dust} />
      </Stage>
    );
  },
};

const hero: SceneDef = {
  pal: (p) => (p.beat.fire ? FIRE : AMBER),
  focus: () => [400 + 128 * 2.1 + 70, 1300 - 46 * 2.1 - 40],
  render: (p) => {
    const pal = hero.pal(p), camX = p.T * 65 + p.index * 500;
    const sc = 2.1, hx = 400, hy = floorAt(hx, camX, 1300, 3) - TJ_GROUND * sc + 4;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="h-far" pal={pal} camX={camX} t={p.t} ceil={380} floor={600} depth={0.4} seed={21} haze={0.7} roots={false} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={600} seed={15} n={12} scale={0.32} pal={pal} both haze={0.6} depth={0.4} lod={2} tseed={21} species={p.beat.fire ? 'fire' : 'trapjaw'} />
        <Fog t={p.t} camX={camX} amount={0.6} y={560} spread={300} />
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={23} species={p.beat.fire ? 'fire' : 'trapjaw'} />
        <Tunnel id="h-main" pal={pal} camX={camX} t={p.t} ceil={760} floor={1300} seed={3} lights={2} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={1300} seed={77} n={4} scale={0.75} pal={pal} speed={40} tseed={3} haze={0.25} />
        <Hero {...p} x={hx} y={hy} scale={sc} walk={1.15} pal={pal} />
        <Fog t={p.t} camX={camX} amount={0.35} y={1250} spread={150} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Dust t={p.t} camX={camX} count={80} seed={p.index + 7} color={pal.dust} />
        {p.beat.fire && <Embers t={p.t} amount={0.5} />}
      </Stage>
    );
  },
};

const closeup: SceneDef = {
  pal: (p) => (p.beat.options?.glow === 'green' ? { ...GREEN, cavity0: '#1a4a2a' } : p.inf > 0.55 ? { ...AMBER, rim: mix(AMBER.rim, '#7dffa0', (p.inf - 0.55) * 1.2), grade: mix(AMBER.grade, '#39ff6a', (p.inf - 0.5)) } : AMBER),
  focus: () => [430 + 110 * 4.1, 930],
  render: (p) => {
    const pal = closeup.pal(p);
    const sc = 4.1, hx = 430 - 92 * sc, hy = 1010;
    const breath = Math.sin(p.t * 1.1) * 6;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <g filter="url(#softBlur)">
          <Tunnel id="cu-bg" pal={pal} camX={p.T * 10 + 400} t={p.t} ceil={520} floor={1460} seed={8} lights={1} solid={false} haze={0.35} />
        </g>
        <Glow x={820} y={760} r={760} t={p.t} amount={0.9} />
        <Fog t={p.t} amount={0.5} y={1200} />
        <g transform={`translate(0 ${breath})`}>
          <Hero {...p} x={hx} y={hy} scale={sc} pal={pal} pitch={Math.sin(p.t * 0.7) * 0.02} />
        </g>
        <Dust t={p.t} count={50} seed={p.index + 33} color={pal.dust} speed={0.6} />
      </Stage>
    );
  },
};

const surface: SceneDef = {
  pal: () => NIGHT,
  focus: () => [W / 2, 1180],
  render: (p) => {
    const pal = NIGHT;
    const rain = !!p.beat.rain;
    const lightning = rain ? Math.max(0, Math.sin(p.T * 0.9 + 1) > 0.985 ? 1 : 0, wrap(p.t, 6.3) < 0.12 ? 1 - wrap(p.t, 6.3) / 0.12 : 0) : 0;
    const ground = 1250;
    const grass = (layer: number) => {
      const n = [26, 18, 9][layer], hmin = [260, 520, 1100][layer], col = [mix(pal.bg1, pal.fog, 0.35), mix(pal.dirt, pal.bg1, 0.4), pal.dirt][layer];
      return range(n).map((i) => {
        const h1 = hash2(i, 300 + layer), h2 = hash2(i, 310 + layer);
        const x = h1 * (W + 300) - 150 - p.T * (6 + layer * 10);
        const xx = wrap(x, W + 300) - 150;
        const len = hmin * (0.6 + h2 * 0.8);
        const sway = Math.sin(p.T * (0.8 + h2) + i) * (12 + layer * 10) + (rain ? Math.sin(p.T * 6 + i) * 6 : 0);
        const lean = (h2 - 0.5) * 120;
        const w = [7, 14, 30][layer] * (0.7 + h1 * 0.6);
        const base = ground + layer * 140 - 20;
        const tipX = xx + lean + sway, tipY = base - len;
        const d = `M${xx - w},${base} Q${xx + lean * 0.4 - w * 0.4},${base - len * 0.55} ${tipX},${tipY} Q${xx + lean * 0.4 + w * 0.6},${base - len * 0.5} ${xx + w},${base} Z`;
        return <path key={`${layer}-${i}`} d={d} fill={col} />;
      });
    };
    const wx = 520 + ((p.t * 40) % 400) - 200;
    return (
      <Stage pal={pal}>
        <defs>
          <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#02040a" />
            <stop offset="0.6" stopColor="#0d1828" />
            <stop offset="1" stopColor="#1a2436" />
          </linearGradient>
          <radialGradient id="moon">
            <stop offset="0" stopColor="#e8f2ff" stopOpacity={0.9} />
            <stop offset="0.12" stopColor="#a9c4d8" stopOpacity={0.35} />
            <stop offset="1" stopColor="#a9c4d8" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="nestGlow">
            <stop offset="0" stopColor="#ffb35c" stopOpacity={0.8} />
            <stop offset="1" stopColor="#ffb35c" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={-300} y={-300} width={W + 600} height={H + 600} fill="url(#sky)" />
        <circle cx={780} cy={380} r={520} fill="url(#moon)" opacity={rain ? 0.35 : 0.8} />
        {range(5).map((i) => (
          <ellipse key={i} cx={wrap(hash(i) * 1800 + p.T * 12, 1800) - 300} cy={260 + i * 90} rx={500} ry={60 + hash(i + 9) * 50} fill="#05080f" opacity={0.7} />
        ))}
        {/* the old oak */}
        <path d="M-40,1500 C60,1200 90,900 60,560 C40,380 -20,260 -120,120 L-200,120 L-200,1500 Z M40,700 C160,560 300,500 470,470 C330,540 220,600 120,760 Z M60,520 C120,360 200,250 330,170 C220,290 160,380 110,560 Z" fill="#020306" />
        {grass(0)}
        <rect x={-300} y={ground} width={W + 600} height={H} fill={pal.dirt} />
        <path d={`M200,${ground + 4} Q540,${ground - 170} 880,${ground + 4} Z`} fill="#06080c" />
        <ellipse cx={540} cy={ground - 40} rx={240} ry={120} fill="url(#nestGlow)" opacity={0.6 + 0.1 * Math.sin(p.t * 7)} />
        <ellipse cx={540} cy={ground - 18} rx={46} ry={22} fill="#1a0c04" />
        <ellipse cx={540} cy={ground - 18} rx={30} ry={13} fill="#ffb35c" opacity={0.35} />
        <Ant species="trapjaw" t={p.T} x={wx} y={ground - 70 - TJ_GROUND * 0.8} scale={0.8} walk={1.2} fill={pal.antFill} rim="#9fb8cc" jaw={p.jaw} infection={p.inf} seed={250} />
        {grass(1)}
        <Fog t={p.t} amount={0.6} y={ground - 100} spread={200} />
        {grass(2)}
        {rain && <Rain t={p.T} />}
        <rect x={-300} y={-300} width={W + 600} height={H + 600} fill="#dfe8ff" opacity={lightning * 0.5} style={{ mixBlendMode: 'screen' }} />
      </Stage>
    );
  },
};

const flood: SceneDef = {
  pal: () => ({ ...AMBER, fog: '#3a6a5a' }),
  focus: () => [300, 1060],
  render: (p) => {
    const pal = flood.pal(p), camX = p.index * 300 + p.T * 8;
    const level = 1170 - ease(p.t / 8) * 60;
    const surf = range(40).map((i) => [i * 32 - 100, level + Math.sin(i * 0.7 + p.T * 2.2) * 6 + Math.sin(i * 1.9 - p.T * 3.1) * 3] as [number, number]);
    const water = smoothPath(surf) + ` L${W + 300},${H + 300} L-300,${H + 300} Z`;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <defs>
          <linearGradient id="water" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#123a34" stopOpacity={0.8} />
            <stop offset="1" stopColor="#020a08" stopOpacity={0.98} />
          </linearGradient>
        </defs>
        <Tunnel id="f-main" pal={pal} camX={camX} t={p.t} ceil={640} floor={1420} seed={31} lights={1} solid={false} />
        <Ant species="trapjaw" t={p.T} x={250} y={level - 30 - TJ_GROUND * 1.2} scale={1.2} jaw={p.jaw} infection={p.inf} fill={pal.antFill} rim={pal.rim} seed={250} pitch={-0.05} />
        <path d={`M-100,${level - 30} C100,${level - 40} 300,${level - 34} 420,${level - 10} L420,${level + 200} L-100,${level + 200} Z`} fill={pal.dirt} />
        <path d={water} fill="url(#water)" />
        <g opacity={0.7 + 0.3 * Math.sin(p.T * 1.7)}>
          <Amoeba id="fl-am" t={p.T} cx={720} cy={level + 380} r={70} reach={0.2} intensity={0.8} />
        </g>
        <path d={water} fill="#06201a" opacity={0.45} />
        <path d={smoothPath(surf)} stroke="#9fe8d0" strokeOpacity={0.35} strokeWidth={2.5} fill="none" />
        <path d={smoothPath(surf.map(([x, y]) => [x, y + 10]))} stroke="#6dff8a" strokeOpacity={0.15} strokeWidth={6} fill="none" />
        {range(14).map((i) => {
          const h = hash(i + 50);
          const x = wrap(h * 1400 + p.T * (30 + h * 40), 1400) - 160;
          return <ellipse key={i} cx={x} cy={level + 4 + Math.sin(p.T * 2 + i) * 3} rx={8 + h * 20} ry={3 + h * 4} fill="#1a110a" />;
        })}
        {range(18).map((i) => {
          const h = hash(i * 3 + 7);
          const fall = wrap(p.T * 1.4 + h * 3, 3) / 3;
          return <line key={'d' + i} x1={h * W} y1={700 + fall * (level - 700)} x2={h * W} y2={700 + fall * (level - 700) + 18} stroke="#bfe" strokeOpacity={0.4} strokeWidth={2} />;
        })}
        <Fog t={p.t} amount={0.5} y={level - 80} spread={120} />
        <Foreground pal={pal} camX={camX} t={p.t} side="top" />
        <Dust t={p.t} count={40} seed={p.index + 2} color={pal.dust} speed={0.5} />
      </Stage>
    );
  },
};

const amoeba: SceneDef = {
  pal: () => GREEN,
  focus: () => [W / 2, 1000],
  render: (p) => {
    const pal = GREEN;
    const reach = clamp(0.25 + p.t / 10);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="a-main" pal={pal} camX={p.index * 400 + p.T * 6} t={p.t} ceil={600} floor={1420} seed={51} lights={0} solid={false} />
        <Fog t={p.t} amount={0.8} y={1000} spread={500} />
        <Amoeba id="am" t={p.T} cx={p.beat.options?.close ? 540 : 500} cy={p.beat.options?.close ? 1000 : 1080} r={p.beat.options?.close ? 290 : 170} reach={reach} target={[1000, 1250]} />
        {p.beat.options?.eye && (
          <g>
            <ellipse cx={500 + Math.sin(p.T * 0.7) * 10 + 24} cy={1080} rx={44} ry={44 * (0.25 + 0.75 * ease((p.t - 0.6) / 0.8))} fill="#062a12" />
            <circle cx={500 + Math.sin(p.T * 0.7) * 10 + 34} cy={1072} r={9} fill="#e8ffe8" opacity={ease((p.t - 0.8) / 0.6)} />
          </g>
        )}
        <Ant species="trapjaw" t={p.T} x={900} y={1330 - TJ_GROUND * 1.1} scale={1.1} dir={-1} jaw={p.jaw} infection={p.inf} fill={pal.antFill} rim={pal.rim} seed={250} pitch={0.06} />
        <Foreground pal={pal} camX={p.T * 6} t={p.t} />
        <Dust t={p.t} count={70} seed={p.index + 61} color={pal.dust} speed={0.6} />
      </Stage>
    );
  },
};

const infection: SceneDef = {
  pal: () => ({ ...AMBER, fog: '#2a6a3a', grade: '#7aff8a' }),
  focus: () => [720, 1010],
  render: (p) => {
    const pal = infection.pal(p);
    const target = p.beat.infection ?? p.inf;
    const inf = lerp(Math.max(0, target - 0.25), target, ease(p.t / Math.max(1, p.dur)));
    const sc = 2.1, hx = 470, hy = 1290 - TJ_GROUND * sc;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={p.T * 10} t={p.t} T={p.T} seed={63} y={1620} />
        <Tunnel id="i-main" pal={pal} camX={p.index * 200 + p.T * 4} t={p.t} ceil={700} floor={1300} seed={61} lights={1} solid={false} />
        <Fog t={p.t} amount={0.6} y={1100} spread={300} />
        <Amoeba id="inf-am" t={p.T} cx={150} cy={1330} r={120} reach={0.4 + inf} target={[hx - 70 * sc, hy + 30 * sc]} />
        <Ant species="trapjaw" t={p.T} x={hx} y={hy} scale={sc} jaw={p.jaw} infection={inf} glowId="veinGlow" fill={pal.antFill} rim={mix(pal.rim, '#7dffa0', inf)} seed={250} pitch={Math.sin(p.T * 8) * 0.03 * inf} />
        <ellipse cx={hx - 100} cy={hy - 20} rx={500} ry={300} fill="url(#glintGlow)" opacity={inf * 0.5} style={{ mixBlendMode: 'screen' }} />
        <Foreground pal={pal} camX={p.T * 4} t={p.t} side="top" />
        <Dust t={p.t} count={50} seed={p.index + 71} color="#c8ffd2" speed={0.5} />
      </Stage>
    );
  },
};

const senses: SceneDef = {
  pal: () => ({ ...GREEN, grade: '#2aff6a' }),
  focus: () => [W / 2, 1000],
  render: (p) => {
    const pal = senses.pal(p);
    const fireNear = p.ep.n >= 4 || !!p.beat.tense;
    const tunnels = range(9).map((k) => {
      const y = 200 + k * 200 + hash(k + 3) * 60;
      const pts = range(14).map((i) => [i * 100 - 100, y + fbm(i * 0.4 + k, 5) * 70] as [number, number]);
      return { y, d: smoothPath(pts) };
    });
    const ring = (k: number) => {
      const u = wrap(p.t / 2.2 + k / 4, 1);
      return <circle key={k} cx={W / 2} cy={1000} r={60 + u * 1100} fill="none" stroke="#9dffb0" strokeOpacity={(1 - u) * 0.5} strokeWidth={3 + (1 - u) * 5} />;
    };
    return (
      <Stage pal={pal} bg="#020604">
        {tunnels.map((tn, k) => (
          <g key={k}>
            <path d={tn.d} stroke="#1e5a34" strokeOpacity={0.5} strokeWidth={70} fill="none" strokeLinecap="round" />
            <path d={tn.d} stroke="#3dff6a" strokeOpacity={0.18} strokeWidth={2} fill="none" />
          </g>
        ))}
        {range(4).map(ring)}
        {range(26).map((i) => {
          const k = i % tunnels.length;
          if (k === 4) return null;
          const h = hash2(i, 9);
          const fire = fireNear && (k >= 6 || (k <= 1 && h > 0.6));
          const x = wrap(h * 1400 + p.T * (fire ? 45 : 20) * (h > 0.5 ? 1 : -1), 1400) - 160;
          const pulse = 0.55 + 0.45 * Math.sin(p.T * 3 + i);
          return (
            <g key={i} opacity={pulse}>
              <Ant species={fire ? 'fire' : 'trapjaw'} t={p.T} x={x} y={tunnels[k].y - 6} scale={fire ? 0.38 : 0.45} dir={h > 0.5 ? 1 : -1} walk={fire ? 2 : 1} outline={fire ? '#ff8a3a' : '#7dffa0'} seed={i} lod={1} />
            </g>
          );
        })}
        {p.beat.options?.reveal === 'beetle' && (
          <g>
            {range(4).map((k) => {
              const u = wrap(p.t / 1.4 + k / 4, 1);
              return <circle key={'br' + k} cx={300} cy={tunnels[2].y - 20} r={30 + u * 380} fill="none" stroke="#ffd28a" strokeOpacity={(1 - u) * 0.5} strokeWidth={2 + (1 - u) * 4} />;
            })}
            <Beetle t={p.T} x={300} y={tunnels[2].y - 60} scale={1.7} outline="#ffd28a" />
            {range(14).map((k) => {
              const h = hash(k + 300), age = wrap(p.T * 1.5 + h, 1);
              return <circle key={'bd' + k} cx={300 + 200 + age * 90 * (h - 0.3)} cy={tunnels[2].y - age * 70} r={2 + h * 3} fill="#ffd28a" opacity={(1 - age) * 0.8} />;
            })}
          </g>
        )}
        {p.beat.options?.reveal === 'queen' && (
          <g>
            {range(3).map((k) => {
              const u = wrap(p.t / 2.4 + k / 3, 1);
              return <ellipse key={'qr' + k} cx={560} cy={1400} rx={80 + u * 520} ry={40 + u * 260} fill="none" stroke="#ffd28a" strokeOpacity={(1 - u) * 0.45} strokeWidth={2 + (1 - u) * 4} />;
            })}
            <g transform={`translate(560 1400) scale(${1 + 0.03 * Math.sin(p.T * 1.6)}) translate(-560 -1400)`}>
              <Ant species="tjqueen" t={p.T * 0.3} x={600} y={1400} scale={1.15} outline="#ffd28a" seed={3} />
            </g>
          </g>
        )}
        {p.beat.options?.reveal === 'vask' && (
          <g>
            {range(5).map((i) => <Ant key={'vf' + i} species="fire" t={p.T} x={180 + i * 170} y={tunnels[1].y - 10 + Math.abs(Math.sin(p.T * 5 + i)) * -10} scale={0.5} dir={i % 2 ? -1 : 1} outline="#ff8a3a" seed={i + 90} lod={1} />)}
            <Ant species="trapjaw" t={p.T} x={520} y={tunnels[1].y - 16 + Math.abs(Math.sin(p.T * 6)) * -12} scale={0.65} outline="#ffd27a" seed={61} />
          </g>
        )}
        {p.beat.options?.reveal === 'kael' && (
          <g>
            {range(3).map((k) => {
              const u = wrap(p.t / 1.6 + k / 3, 1);
              return <ellipse key={'kr' + k} cx={300} cy={tunnels[2].y - 20} rx={30 + u * 360} ry={20 + u * 240} fill="none" stroke="#9fd0ff" strokeOpacity={(1 - u) * 0.5} strokeWidth={2 + (1 - u) * 4} />;
            })}
            <Ant species="trapjaw" t={p.T} x={300} y={tunnels[2].y - 30} scale={0.8} outline="#9fd0ff" oneAntenna crouch={0.7} seed={33} />
          </g>
        )}
        {p.beat.options?.reveal === 'ghosts' && range(12).map((i) => {
          const h = hash2(i, 77), x = 60 + h * 960, y = 300 + hash2(i, 78) * 1250;
          const fade = 0.5 + 0.4 * Math.abs(Math.sin(p.T * 0.6 + i));
          return (
            <g key={'gh' + i} opacity={fade} transform={`rotate(${(hash2(i, 79) - 0.5) * 120} ${x} ${y})`}>
              <Ant species="trapjaw" t={0} x={x} y={y} scale={0.55 + h * 0.3} flip lie={1} eyeOpen={0} outline="#d0e8dc" seed={i} lod={1} />
            </g>
          );
        })}
        <ellipse cx={W / 2} cy={1000} rx={340} ry={220} fill="url(#glintGlow)" opacity={0.35} />
        <Ant species="trapjaw" t={p.T} x={W / 2 - 20} y={1000} scale={1.25} jaw={p.jaw} infection={Math.max(0.5, p.inf)} glowId="veinGlow" fill="#010302" rim="#7dffa0" seed={250} />
        <Dust t={p.t} count={60} seed={p.index + 81} color="#c8ffd2" speed={0.3} />
      </Stage>
    );
  },
};

const fireColony: SceneDef = {
  pal: () => FIRE,
  focus: () => [W / 2, 1000],
  render: (p) => {
    const pal = FIRE;
    const drift = p.T * 14;
    const chambers = [
      [300, 420, 260, 140], [790, 560, 220, 120], [520, 860, 330, 170], [230, 1230, 230, 120], [800, 1260, 260, 140], [520, 1600, 300, 150],
    ];
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <defs>
          <radialGradient id="chamberFire" cx="0.5" cy="0.75">
            <stop offset="0" stopColor="#ffb040" />
            <stop offset="0.35" stopColor="#ff5a14" />
            <stop offset="0.75" stopColor="#7a1404" />
            <stop offset="1" stopColor="#2a0502" />
          </radialGradient>
        </defs>
        <g transform={`translate(0 ${-drift + 60})`}>
          {chambers.slice(0, -1).map(([x, y], i) => {
            const [x2, y2] = chambers[i + 1];
            return <path key={'tn' + i} d={`M${x},${y} C${x},${(y + y2) / 2} ${x2},${(y + y2) / 2} ${x2},${y2}`} stroke="#3a0c04" strokeWidth={60} fill="none" />;
          })}
          {chambers.map(([x, y, rx, ry], i) => {
            const fl = 0.85 + 0.15 * Math.sin(p.T * (6 + i) + i * 2);
            return (
              <g key={i}>
                <ellipse cx={x} cy={y} rx={rx * 1.6} ry={ry * 1.6} fill="url(#lightGlow)" opacity={0.5 * fl} style={{ mixBlendMode: 'screen' }} />
                <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="url(#chamberFire)" opacity={fl} />
                <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke="#ffa050" strokeOpacity={0.4} strokeWidth={3} />
                {range(Math.round(rx / 26)).map((k) => {
                  const h = hash2(k, i * 10);
                  const a = (h * 2 + p.T * (0.08 + h * 0.08) * (h > 0.5 ? 1 : -1)) * Math.PI;
                  const ax = x + Math.cos(a) * rx * 0.92, ay = y + Math.sin(a) * ry * 0.92;
                  const onFloor = Math.sin(a) > 0.3;
                  return (
                    <g key={k} transform={`rotate(${onFloor ? 0 : (a * 180) / Math.PI + 90} ${ax} ${ay})`}>
                      <Ant species="fire" t={p.T} x={ax} y={ay - FIRE_GROUND * 0.32} scale={0.32} dir={h > 0.5 ? 1 : -1} walk={1.8} fill="#1a0502" rim="#ffb070" seed={k + i * 10} lod={2} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
        <Smoke t={p.t} amount={0.8} y={400} />
        <Embers t={p.T} amount={0.9} />
        <Fog t={p.t} amount={0.4} y={900} spread={800} />
      </Stage>
    );
  },
};

const swarm: SceneDef = {
  pal: () => FIRE,
  focus: () => [W / 2, 1150],
  render: (p) => {
    const pal = FIRE, camX = p.index * 900 + p.T * 20;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={73} species="fire" />
        <Tunnel id="s-main" pal={pal} camX={camX} t={p.t} ceil={720} floor={1360} seed={71} lights={1} solid={false} />
        <Glow x={1100} y={1040} r={900} t={p.T} amount={1.2} ry={600} />
        <FloorWalkers t={p.T} camX={camX} floor={1360} seed={200} n={30} scale={0.55} pal={pal} species="fire" speed={170} dir={-1} tseed={71} haze={0.4} lod={2} />
        <FloorWalkers t={p.T} camX={camX} floor={1360} seed={300} n={24} scale={0.75} pal={pal} species="fire" speed={190} dir={-1} tseed={71} ceiling={720} lod={1} />
        <FloorWalkers t={p.T} camX={camX} floor={1380} seed={400} n={12} scale={1.05} pal={pal} species="fire" speed={210} dir={-1} tseed={71} lod={1} />
        <Smoke t={p.t} amount={0.6} y={700} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Embers t={p.T} amount={0.8} />
      </Stage>
    );
  },
};

const battle: SceneDef = {
  pal: () => FIRE,
  focus: () => [W / 2, 1180],
  render: (p) => {
    const pal = FIRE, camX = p.index * 600 + p.T * 6;
    const floor = 1330;
    const clash = (i: number) => {
      const h = hash2(i, 500);
      const tt = wrap(p.T * (1.2 + h) + h * 9, 2.2);
      return tt < 0.18 ? 1 - tt / 0.18 : 0;
    };
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={83} species="fire" y={1640} />
        <Tunnel id="b-main" pal={pal} camX={camX} t={p.t} ceil={720} floor={floor} seed={81} lights={1} solid={false} />
        <Glow x={900} y={1000} r={800} t={p.T} amount={0.9} />
        <Glow x={150} y={1050} r={500} t={p.T + 3} amount={0.4} />
        {/* the fallen */}
        {range(5).map((i) => {
          const x = 120 + i * 210 + hash(i) * 60;
          return <Ant key={'dead' + i} species={i % 2 ? 'fire' : 'trapjaw'} t={0} x={x} y={floorAt(x, camX, floor, 81) + (i % 2 ? 0.45 : 0.55) * 30} scale={i % 2 ? 0.45 : 0.55} flip fill="#120302" rim={pal.rim} rimOpacity={0.4} lod={1} seed={i} />;
        })}
        {range(7).map((i) => {
          const h = hash2(i, 600);
          const lunge = Math.max(0, Math.sin(p.T * (3 + h * 2) + i * 2)) * 40;
          const x = 60 + i * 55 + lunge;
          const sc = 1.0 + h * 0.3;
          return <Ant key={'tj' + i} species="trapjaw" t={p.T} x={x} y={floorAt(x, camX, floor, 81) - TJ_GROUND * sc + 4 - (i % 3) * 30} scale={sc} walk={0.6} jaw={Math.sin(p.T * 5 + i) > 0.7 ? 0 : 1} fill="#0d0603" rim="#ffb066" seed={i} lod={1} />;
        })}
        {range(16).map((i) => {
          const h = hash2(i, 700);
          const x = 600 + h * 560 - Math.max(0, Math.sin(p.T * (4 + h * 3) + i)) * 50;
          const sc = 0.6 + h * 0.35;
          return <Ant key={'fa' + i} species="fire" t={p.T} x={x} y={floorAt(x, camX, floor, 81) - FIRE_GROUND * sc + 4 - (i % 4) * 26} scale={sc} dir={-1} walk={1.6} fill="#1c0502" rim="#ff7a2e" seed={i + 40} lod={i % 3 ? 2 : 1} />;
        })}
        {range(6).map((i) => (
          <circle key={'c' + i} cx={480 + hash(i + 3) * 240} cy={1180 + hash(i + 8) * 120} r={30 + clash(i) * 90} fill="url(#emberGlow)" opacity={clash(i)} style={{ mixBlendMode: 'screen' }} />
        ))}
        <Smoke t={p.t} amount={0.75} y={760} />
        <Foreground pal={pal} camX={camX} t={p.t} side="bottom" />
        <Embers t={p.T} amount={1} />
      </Stage>
    );
  },
};

const kesh: SceneDef = {
  pal: () => FIRE,
  focus: () => [420, 960],
  render: (p) => {
    const pal = FIRE;
    const sc = 3.3, kx = 760, ky = 1260 - FIRE_GROUND * sc;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={p.T * 15} t={p.t} T={p.T} seed={93} species="fire" y={1660} />
        <Tunnel id="k-bg" pal={pal} camX={p.index * 300 + p.T * 4} t={p.t} ceil={640} floor={1300} seed={91} lights={0} solid={false} haze={0.2} />
        <Smoke t={p.t} amount={0.6} y={700} />
        <Glow x={620} y={1080} r={760} t={p.T} amount={1.6} ry={520} />
        <Glow x={560} y={1150} r={380} t={p.T + 1} amount={1.4} ry={260} />
        {p.beat.options?.general ? (
          <g>
            <Ant species="fire" t={p.T} x={kx} y={ky} scale={sc * 1.1} dir={-1} fill="#140302" rim="#ffcf70" rimOpacity={0.95} seed={23} pitch={Math.sin(p.t * 0.6) * 0.03 + 0.05} />
            <circle cx={kx - 86 * sc * 1.1} cy={ky - 28 * sc * 1.1} r={18} fill="url(#emberGlow)" opacity={0.7} style={{ mixBlendMode: 'screen' }} />
          </g>
        ) : (
          <Ant species="kesh" t={p.T} x={kx} y={ky} scale={sc} dir={-1} fill="#1a0402" rim="#ff8a3a" rimOpacity={0.95} oneAntenna={p.keshScarred} seed={17} pitch={Math.sin(p.t * 0.6) * 0.03} />
        )}
        <Smoke t={p.t + 20} amount={0.3} y={1400} />
        <Foreground pal={pal} camX={p.T * 4} t={p.t} side="bottom" />
        <Embers t={p.T} amount={0.8} />
      </Stage>
    );
  },
};

const duel: SceneDef = {
  pal: (p) => (p.beat.with === 'elder' ? AMBER : FIRE),
  focus: (p) => [300 + 128 * 1.6 * Math.cos(0) + 40, 1150],
  render: (p) => {
    const elder = p.beat.with === 'elder';
    const pal = duel.pal(p);
    const floor = 1300;
    const circle = Math.sin(p.t * 0.5) * 30;
    const hsc = 1.6, osc = elder ? 1.75 : 2.0;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={p.T * 15} t={p.t} T={p.T} seed={103} species={p.beat.with === 'elder' ? 'trapjaw' : 'fire'} y={1640} />
        <Tunnel id="d-main" pal={pal} camX={p.index * 300} t={p.t} ceil={600} floor={floor} seed={101} lights={0} solid={false} roughness={40} />
        <Glow x={W / 2} y={1100} r={700} t={p.T} amount={1} ry={500} />
        {/* the ring of onlookers */}
        {range(16).map((i) => {
          const h = hash2(i, 800);
          const x = 40 + i * 66 + h * 20;
          return <Ant key={i} species={elder ? 'trapjaw' : 'fire'} t={p.T} x={x} y={floor - 230 - h * 40} scale={0.36} dir={x < W / 2 ? 1 : -1} fill={mix(pal.antFill, pal.fog, 0.35)} rim={pal.rim} rimOpacity={0.4} seed={i} lod={2} />;
        })}
        <Fog t={p.t} amount={0.5} y={1100} spread={200} />
        <Hero {...p} x={260 + circle} y={floor - TJ_GROUND * hsc} scale={hsc} pal={pal} rim={elder ? pal.rim : '#ffa060'} walk={0.15} />
        {elder ? (
          <Ant species="trapjaw" t={p.T} x={820 - circle} y={floor - TJ_GROUND * osc} scale={osc} dir={-1} fill="#100905" rim="#ffc27a" seed={3} walk={0.1} />
        ) : p.beat.options?.opponent ? (
          <Ant species="fire" t={p.T} x={820 - circle} y={floor - FIRE_GROUND * osc} scale={osc} dir={-1} fill="#1a0402" rim={p.beat.options.opponent === 'general' ? '#ffcf70' : '#ff8a3a'} seed={29} walk={0.2} jaw={0.5} lie={p.sinceSnap < 30 ? Math.min(1, p.sinceSnap / 0.5) : 0} flip={p.sinceSnap < 30 && p.sinceSnap > 0.5} />
        ) : (
          <Ant species="kesh" t={p.T} x={820 - circle} y={floor - FIRE_GROUND * osc} scale={osc} dir={-1} fill="#1a0402" rim="#ff8a3a" oneAntenna={p.keshScarred} seed={17} walk={0.2} />
        )}
        <Foreground pal={pal} camX={0} t={p.t} side="bottom" />
        <Dust t={p.t} count={50} seed={p.index + 91} color={pal.dust} />
        {!elder && <Embers t={p.T} amount={0.5} />}
      </Stage>
    );
  },
};

const queen: SceneDef = {
  pal: () => ({ ...FIRE, grade: '#ff2a00' }),
  focus: () => [W / 2, 900],
  render: (p) => {
    const pal = queen.pal(p);
    const sc = 3.4, qx = 700, qy = 1180;
    const breath = Math.sin(p.t * 0.5) * 8;
    return (
      <Stage pal={pal} bg="#050101">
        <ellipse cx={540} cy={1400} rx={900} ry={300} fill="url(#lightGlow)" opacity={0.45 + 0.08 * Math.sin(p.T * 5)} />
        <ellipse cx={760} cy={760} rx={700} ry={520} fill="url(#lightGlow)" opacity={0.22 + 0.05 * Math.sin(p.T * 3)} />
        <Smoke t={p.t} amount={1} y={700} />
        <g transform={`translate(0 ${breath})`}>
          <Ant species="queen" t={p.T * 0.3} x={qx} y={qy} scale={sc} dir={-1} fill="#060101" rim="#ff4a1a" rimOpacity={0.5 + 0.12 * Math.sin(p.T * 3)} seed={99} />
          {/* her eye, burning in the dark */}
          <circle cx={qx - 86 * sc} cy={qy - 28 * sc} r={26} fill="url(#emberGlow)" opacity={0.5 + 0.2 * Math.sin(p.T * 2)} style={{ mixBlendMode: 'screen' }} />
        </g>
        {range(8).map((i) => {
          const x = 80 + i * 130 + hash(i) * 40;
          return <Ant key={i} species="fire" t={p.T} x={x} y={1500 - hash(i + 4) * 60} scale={0.42} dir={x < 540 ? 1 : -1} walk={0.4} fill="#160402" rim="#ff7a2e" rimOpacity={0.7} seed={i + 5} lod={1} />;
        })}
        <ellipse cx={540} cy={600} rx={800} ry={700} fill="url(#darkPool)" opacity={0.6} />
        <Embers t={p.T} amount={0.35} />
      </Stage>
    );
  },
};

const council: SceneDef = {
  pal: () => AMBER,
  focus: () => [870 - 128 * 1.5, 1150],
  render: (p) => {
    const pal = AMBER, floor = 1320;
    const rows = [
      { n: 7, sc: 0.55, y: floor - 220, haze: 0.55 },
      { n: 6, sc: 0.75, y: floor - 120, haze: 0.3 },
      { n: 5, sc: 1.1, y: floor, haze: 0 },
    ];
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={p.T * 20} t={p.t} T={p.T} seed={113} y={1660} />
        <Tunnel id="co-main" pal={pal} camX={p.index * 200} t={p.t} ceil={560} floor={floor + 40} seed={111} lights={1} solid={false} roughness={40} />
        <Glow x={320} y={900} r={700} t={p.T} amount={0.8} />
        {rows.map((r, ri) => (
          <g key={ri}>
            {range(r.n).map((i) => {
              const x = 40 + i * (560 / r.n) + hash2(i, ri) * 30;
              const sc = r.sc * (0.9 + hash2(i, ri + 5) * 0.2);
              return <Ant key={i} species="trapjaw" t={p.T} x={x} y={r.y - TJ_GROUND * sc} scale={sc} fill={mix(pal.antFill, pal.fog, r.haze * 0.6)} rim={pal.rim} rimOpacity={0.8 - r.haze} seed={i + ri * 10} lod={ri === 2 ? 0 : 1} pitch={Math.sin(p.T * 0.8 + i) * 0.03} />;
            })}
          </g>
        ))}
        <Glow x={880} y={floor - 120} r={420} t={p.T + 2} amount={0.9} ry={260} />
        <Hero {...p} x={880} y={floor - TJ_GROUND * 1.7 - 10} scale={1.7} dir={-1} pal={pal} />
        <ellipse cx={760} cy={floor - 60} rx={220} ry={160} fill="url(#glintGlow)" opacity={p.inf * 0.35} style={{ mixBlendMode: 'screen' }} />
        <Fog t={p.t} amount={0.5} y={1150} spread={200} />
        <Foreground pal={pal} camX={0} t={p.t} side="bottom" />
        <Dust t={p.t} count={60} seed={p.index + 101} color={pal.dust} />
      </Stage>
    );
  },
};

const army: SceneDef = {
  pal: () => ({ ...FIRE, grade: '#ff6a20' }),
  focus: () => [640 + 128 * 1.8, 1180],
  render: (p) => {
    const pal = army.pal(p), camX = p.index * 400 + p.T * 90;
    const sc = 1.8, hx = 600, hy = floorAt(hx, camX, 1340, 121) - TJ_GROUND * sc + 4;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={123} species="fire" />
        <Tunnel id="ar-main" pal={pal} camX={camX} t={p.t} ceil={700} floor={1340} seed={121} lights={2} solid={false} />
        <Smoke t={p.t} amount={0.6} y={760} />
        {range(40).map((i) => {
          const h1 = hash2(i, 900), h2 = hash2(i, 901);
          const x = hx - 160 - h1 * 900 + Math.sin(p.T * 2 + i) * 10;
          const s2 = 0.45 + h2 * 0.35;
          const row = i % 3;
          return <Ant key={i} species="fire" t={p.T} x={x} y={floorAt(x, camX, 1340, 121) - FIRE_GROUND * s2 + 4 - row * 34} scale={s2} walk={1.4} fill={mix('#1a0502', pal.fog, row * 0.15)} rim="#ff7a2e" rimOpacity={0.8 - row * 0.15} seed={i} lod={row ? 2 : 1} />;
        })}
        {p.ep.n >= 9 && <Ant species="kesh" t={p.T} x={hx - 260} y={floorAt(hx - 260, camX, 1340, 121) - FIRE_GROUND * 1.3 - 40} scale={1.3} walk={1.15} fill="#1a0402" rim="#ff8a3a" oneAntenna={p.keshScarred} seed={17} />}
        <ellipse cx={hx + 180} cy={hy} rx={420} ry={260} fill="url(#glintGlow)" opacity={0.25 + p.inf * 0.25} style={{ mixBlendMode: 'screen' }} />
        <Hero {...p} x={hx} y={hy} scale={sc} walk={1.15} pal={pal} rim={mix('#ff8a3a', '#7dffa0', p.inf * 0.6)} />
        <Foreground pal={pal} camX={camX} t={p.t} side="bottom" />
        <Embers t={p.T} amount={0.9} />
      </Stage>
    );
  },
};

export const COLD: Palette = { ...AMBER, rim: '#9aa8b4', light: '#8fa3b5', fog: '#3a4450', dust: '#c8d4de', cavity0: '#2a2f36', cavity1: '#0e1114', grade: '#6a8aa8', antFill: '#07080a' };

const dirtMacro: SceneDef = {
  pal: () => AMBER,
  focus: () => [560, 1100],
  render: (p) => {
    const pal = AMBER, ground = 1250, sc = 3.6;
    const focus = ease((p.t - 0.6) / 2.6);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <defs>
          <filter id="rack" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={(1 - focus) * 14} /></filter>
          <filter id="lens" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={10 + focus * 8} /></filter>
        </defs>
        <rect x={-300} y={-300} width={W + 600} height={ground + 300} fill="url(#bgGrad)" />
        <Glow x={700} y={900} r={900} t={p.t} amount={1.25} ry={600} />
        <Shafts t={p.t} x={760} amount={0.5} angle={18} />
        <Grains seed={5} n={40} x0={-100} x1={1180} y0={ground - 300} y1={ground - 60} rMin={6} rMax={26} fill={mix(pal.dirt, pal.strata, 0.5)} rim={pal.rim} blur="rack" rimOpacity={0.3} />
        <rect x={-300} y={ground} width={W + 600} height={900} fill={pal.dirt} />
        <path d={smoothPath(range(30).map((i) => [i * 45 - 100, ground + fbm(i * 0.5, 4) * 16] as [number, number]))} stroke={pal.rim} strokeOpacity={0.35} strokeWidth={3} fill="none" />
        <g filter="url(#rack)">
          <Ant species="trapjaw" t={p.T} x={560 - 95 * sc} y={ground - TJ_GROUND * sc} scale={sc} lie={1} eyeOpen={0} infection={p.inf * 0.6} fill={pal.antFill} rim={pal.rim} rimOpacity={1} jaw={0.8} seed={250} />
        </g>
        <Grains seed={9} n={26} x0={-60} x1={1140} y0={ground - 30} y1={ground + 80} rMin={10} rMax={36} fill={mix(pal.dirt, pal.strata, 0.35)} rim={pal.rim} rimOpacity={0.6} />
        <Grains seed={13} n={9} x0={-200} x1={1280} y0={ground + 60} y1={ground + 380} rMin={90} rMax={190} fill="#070402" rim={pal.rim} blur="lens" drift={-6} t={p.t} rimOpacity={0.25} />
        <Grains seed={17} n={5} x0={-200} x1={1280} y0={-80} y1={260} rMin={70} rMax={150} fill="#070402" rim={pal.rim} blur="lens" drift={4} t={p.t} rimOpacity={0.15} />
        <Dust t={p.t} count={70} seed={p.index + 11} color={pal.dust} speed={0.35} />
      </Stage>
    );
  },
};

const faceInDirt: SceneDef = {
  pal: () => AMBER,
  focus: () => [560, 1000],
  render: (p) => {
    const pal = AMBER, ground = 1230, sc = 7.4;
    const eyes = p.beat.options?.eyes;
    const eyeOpen = eyes === 'opening' ? ease((p.t - 1.2) / 2.8) : eyes === 'open' ? 1 : 0;
    const beatK = Math.pow(Math.max(0, Math.sin(p.T * Math.PI * 2 * 1.2)), 10);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <defs><filter id="lens2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={16} /></filter></defs>
        <rect x={-300} y={-300} width={W + 600} height={ground + 300} fill="url(#bgGrad)" />
        <Glow x={560} y={760} r={980} t={p.t} amount={1.3} ry={660} />
        <Fog t={p.t} amount={0.5} y={900} />
        <rect x={-300} y={ground} width={W + 600} height={900} fill={pal.dirt} />
        <g transform={`translate(560 ${ground}) scale(${1 + beatK * 0.01}) translate(-560 ${-ground})`}>
          <Ant species="trapjaw" t={p.T} x={560 - 95 * sc} y={ground - TJ_GROUND * sc} scale={sc} lie={1} eyeOpen={eyeOpen} infection={p.inf * (0.7 + 0.6 * beatK)} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} jaw={0.8} seed={250} />
        </g>
        <Grains seed={21} n={22} x0={-60} x1={1140} y0={ground - 20} y1={ground + 60} rMin={12} rMax={40} fill={mix(pal.dirt, pal.strata, 0.35)} rim={pal.rim} rimOpacity={0.55} />
        <Grains seed={23} n={6} x0={-200} x1={1280} y0={ground + 80} y1={ground + 360} rMin={110} rMax={200} fill="#060302" rim={pal.rim} blur="lens2" drift={-5} t={p.t} rimOpacity={0.2} />
        <Dust t={p.t} count={50} seed={p.index + 13} color={pal.dust} speed={0.3} />
      </Stage>
    );
  },
};

const lyingInChamber: SceneDef = {
  pal: () => AMBER,
  focus: () => [520, 1200],
  render: (p) => {
    const pal = AMBER, camX = p.index * 300, floor = 1300;
    const day = 0.5 + 0.5 * Math.sin(p.t * 1.7 - 1.2); // time passing
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={41} />
        <Tunnel id="lc-main" pal={pal} camX={camX} t={p.t} ceil={720} floor={floor} seed={43} lights={2} solid={false} flicker={0.4} />
        <Glow x={540} y={1050} r={700} t={p.t} amount={0.35 + 0.65 * day} ry={420} />
        <FloorWalkers t={p.T} camX={camX} floor={floor - 30} seed={402} n={4} scale={0.8} pal={pal} speed={70} haze={0.35} tseed={43} both />
        <Ant species="trapjaw" t={0} x={460} y={floorAt(460, camX, floor, 43) - TJ_GROUND * 1.6 + 4} scale={1.6} lie={1} eyeOpen={0} fill={pal.antFill} rim={pal.rim} seed={250} jaw={0.8} />
        <FloorWalkers t={p.T} camX={camX} floor={floor + 10} seed={404} n={3} scale={1.05} pal={pal} speed={85} tseed={43} dir={-1} lod={0} />
        <rect x={-300} y={-300} width={W + 600} height={H + 600} fill="#000" opacity={0.35 * (1 - day)} />
        <Fog t={p.t} amount={0.5} y={1150} spread={200} />
        <Foreground pal={pal} camX={camX} t={p.t} side="top" />
        <Dust t={p.t} count={60} seed={p.index + 17} color={pal.dust} />
      </Stage>
    );
  },
};

const deadStill: SceneDef = {
  pal: () => COLD,
  focus: () => [540, 1100],
  render: (p) => {
    const pal = COLD, ground = 1260, sc = 3.2;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <rect x={-300} y={-300} width={W + 600} height={ground + 300} fill="url(#bgGrad)" />
        <Glow x={560} y={980} r={760} t={0} amount={0.6} ry={480} />
        <rect x={-300} y={ground} width={W + 600} height={900} fill="#06070a" />
        <Ant species="trapjaw" t={0} x={540 - 30 * sc} y={ground - TJ_GROUND * sc} scale={sc} lie={1} eyeOpen={0} fill={pal.antFill} rim={pal.rim} rimOpacity={0.6} seed={250} jaw={0.8} />
        <Grains seed={31} n={24} x0={-60} x1={1140} y0={ground - 10} y1={ground + 60} rMin={10} rMax={30} fill="#0c0e12" rim={pal.rim} rimOpacity={0.4} />
        <Dust t={p.t} count={90} seed={p.index + 19} color={pal.dust} speed={0.25} />
      </Stage>
    );
  },
};

const eyeOpen: SceneDef = {
  pal: () => ({ ...AMBER, grade: '#5aff8a' }),
  focus: () => [540, 880],
  render: (p) => {
    const pal = AMBER, sc = 11;
    const open = ease((p.t - 0.15) / 0.35);
    const flare = Math.max(0, 1 - Math.abs(p.t - 0.5) / 0.5);
    const inf = Math.max(p.inf, 0.35);
    return (
      <Stage pal={pal} bg="#050302">
        <Glow x={420} y={600} r={900} t={p.t} amount={0.55} ry={700} />
        <Ant species="trapjaw" t={p.T} x={540 - 100 * sc} y={880 + 29 * sc} scale={sc} eyeOpen={open} infection={inf} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} seed={250} jaw={1} armor={p.armor} />
        <circle cx={540} cy={880} r={60 + flare * 260} fill="url(#glintGlow)" opacity={flare * 0.9} style={{ mixBlendMode: 'screen' }} />
        <line x1={540 - flare * 520} y1={880} x2={540 + flare * 520} y2={880} stroke="#c8ffd2" strokeWidth={3} strokeOpacity={flare * 0.8} />
        <Dust t={p.t} count={50} seed={p.index + 23} color="#c8ffd2" speed={0.2} />
      </Stage>
    );
  },
};

const waterDrop: SceneDef = {
  pal: () => AMBER,
  focus: () => [560, 900],
  render: (p) => {
    const pal = AMBER, camX = p.index * 500;
    const grow = ease(p.t / Math.max(1.5, p.dur));
    const rootTip = 820;
    const sway = Math.sin(p.T * 0.6) * 4;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="wd-main" pal={pal} camX={camX} t={p.t} ceil={560} floor={1330} seed={53} lights={1} solid={false} roots={false} />
        <Fog t={p.t} amount={0.5} y={1000} />
        <path d={smoothPath([[520, 480], [548, 620], [552 + sway, 740], [560 + sway, rootTip]])} stroke={pal.dirt} strokeWidth={30} strokeLinecap="round" fill="none" />
        <path d={smoothPath([[520, 480], [548, 620], [552 + sway, 740], [560 + sway, rootTip]])} stroke={pal.rim} strokeOpacity={0.35} strokeWidth={3} fill="none" transform="translate(-10,0)" />
        {range(3).map((k) => {
          const u = wrap(p.t / 1.8 + k / 3, 1);
          return <ellipse key={k} cx={560 + sway} cy={rootTip + 70} rx={20 + u * 420} ry={14 + u * 300} fill="none" stroke="#c8ffd2" strokeOpacity={(1 - u) * 0.35} strokeWidth={2 + (1 - u) * 3} />;
        })}
        <Drop x={560 + sway} y={rootTip} r={44} grow={grow} t={p.T} light="#ffd59a" />
        <Ant species="trapjaw" t={p.T} x={470} y={floorAt(470, camX, 1330, 53) - TJ_GROUND * 1.2 + 4} scale={1.2} pitch={-0.35} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} seed={250} jaw={p.jaw} />
        <Dust t={p.t} count={60} seed={p.index + 29} color={pal.dust} speed={0.25} />
      </Stage>
    );
  },
};

const rise: SceneDef = {
  pal: () => AMBER,
  focus: () => [380 + 150 * 2.2, 1100],
  render: (p) => {
    const pal = AMBER, camX = p.index * 400 + p.T * 4, floor = 1300, sc = 2.2;
    const lie = 1 - ease(p.t / 1.6);
    const jaw = Math.min(p.jaw, 0.25 + 0.75 * ease((p.t - 1.3) / 0.5));
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={61} />
        <Tunnel id="ri-main" pal={pal} camX={camX} t={p.t} ceil={700} floor={floor} seed={63} lights={1} solid={false} />
        <Glow x={620} y={1000} r={760} t={p.t} amount={0.6 + 0.6 * ease(p.t / 2)} ry={500} />
        <Ant species="trapjaw" t={p.T} x={380} y={floorAt(380, camX, floor, 63) - TJ_GROUND * sc + 4} scale={sc} lie={lie} jaw={jaw} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} rimOpacity={0.6 + 0.35 * ease(p.t / 2)} seed={250} />
        <Fog t={p.t} amount={0.4} y={1200} spread={160} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Dust t={p.t} count={70} seed={p.index + 31} color={pal.dust} />
      </Stage>
    );
  },
};

const vast: SceneDef = {
  pal: () => AMBER,
  focus: () => [540, 1000],
  render: (p) => {
    const pal = AMBER, camX = p.T * 20;
    const k = ease(p.t / Math.max(2, p.dur));
    const zoom = lerp(2.6, 1, k);
    const rows = [300, 560, 820, 1080, 1340, 1600, 1860];
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <g transform={`translate(540 1000) scale(${zoom}) translate(-540 -1000)`}>
          {rows.map((y, i) => (
            <g key={i}>
              <Tunnel id={`va${i}`} pal={pal} camX={camX * (0.5 + (i % 3) * 0.2)} t={p.t} ceil={y - 120} floor={y + 30} depth={0.6} seed={70 + i} haze={i === 3 ? 0.1 : 0.45} roots={i % 2 === 0} solid={false} roughness={34} />
              <FloorWalkers t={p.T} camX={camX * (0.5 + (i % 3) * 0.2)} floor={y + 30} seed={700 + i} n={i === 3 ? 10 : 14} scale={0.3} pal={pal} both haze={i === 3 ? 0.1 : 0.4} depth={0.6} lod={2} tseed={70 + i} rough={34} />
            </g>
          ))}
          <Ant species="trapjaw" t={p.T} x={540} y={floorAt(540, camX * 0.5, 1110, 73, 34, 0.6) - TJ_GROUND * 0.3 + 2} scale={0.3} walk={1} infection={p.inf} fill={pal.antFill} rim={pal.rim} seed={250} lod={1} opacity={p.beat.options?.fade ? 1 - 0.85 * ease(p.t / Math.max(2, p.dur)) : 1} />
          <circle cx={540 + 30} cy={floorAt(540, camX * 0.5, 1110, 73, 34, 0.6) - 22} r={14} fill="url(#glintGlow)" opacity={0.5 + 0.3 * Math.sin(p.T * 2.5)} style={{ mixBlendMode: 'screen' }} />
        </g>
        <Fog t={p.t} amount={0.5} y={1000} spread={700} />
        <Dust t={p.t} count={60} seed={p.index + 37} color={pal.dust} speed={0.4} />
      </Stage>
    );
  },
};

export const SCENES: Partial<Record<SceneId, SceneDef>> = {
  dark, colony, hero, closeup, surface, flood, amoeba, infection, senses, fireColony, swarm, battle, kesh, duel, queen, council, army,
  dirtMacro, faceInDirt, lyingInChamber, deadStill, eyeOpen, waterDrop, rise, vast,
};
