import React from 'react';
import type { SceneId } from '../../script/types';
import { Amoeba } from '../art/Amoeba';
import { Ant, AntDefs } from '../art/Ant';
import { Dust, Embers, Fog, Rain, Shafts, Smoke } from '../art/Atmosphere';
import { ceilAt, EarthDefs, floorAt, Foreground, smoothPath, Tunnel } from '../art/Earth';
import { AMBER, FIRE, GREEN, NIGHT, VOID, type Palette } from '../art/palette';
import { H, W } from '../config';
import { mix } from '../lib/color';
import { clamp, ease, fbm, hash, hash2, lerp, range } from '../lib/random';
import type { SceneDef, SceneProps } from './types';

const TJ_GROUND = 46, FIRE_GROUND = 40;
const wrap = (v: number, m: number) => ((v % m) + m) % m;

const Stage: React.FC<{ pal: Palette; children: React.ReactNode; bg?: string }> = ({ pal, children, bg }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
    <EarthDefs pal={pal} />
    <AntDefs />
    <rect x={-300} y={-300} width={W + 600} height={H + 600} fill={bg ?? 'url(#bgGrad)'} />
    {children}
  </svg>
);

/** A light source glow with flicker. */
const Glow: React.FC<{ x: number; y: number; r: number; t: number; amount?: number; ry?: number }> = ({ x, y, r, t, amount = 1, ry }) => {
  const fl = 0.88 + 0.08 * Math.sin(t * 9.3) + 0.04 * Math.sin(t * 23.1);
  return <ellipse cx={x} cy={y} rx={r} ry={ry ?? r} fill="url(#lightGlow)" opacity={amount * fl} style={{ mixBlendMode: 'screen' }} />;
};

/** Ants walking along a tunnel floor that scrolls with the camera. */
const FloorWalkers: React.FC<{
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
const Deep: React.FC<{ pal: Palette; camX: number; t: number; T: number; seed: number; species?: 'trapjaw' | 'fire'; y?: number }> = ({ pal, camX, t, T, seed, species = 'trapjaw', y = 1600 }) => (
  <>
    <Tunnel id={`deep${seed}`} pal={pal} camX={camX} t={t} ceil={y - 150} floor={y + 40} depth={0.5} seed={seed} haze={0.72} roots={false} solid={false} />
    <FloorWalkers t={T} camX={camX} floor={y + 40} seed={seed + 3} n={12} scale={0.3} pal={pal} both haze={0.65} depth={0.5} lod={2} tseed={seed} species={species} />
    <Fog t={t} camX={camX} amount={0.6} y={y - 40} spread={160} />
  </>
);

/** Big trap-jaw hero (250). */
const Hero: React.FC<SceneProps & { x: number; y: number; scale: number; dir?: 1 | -1; walk?: number; pal: Palette; rim?: string; pitch?: number }> = (p) => (
  <Ant species="trapjaw" t={p.T} x={p.x} y={p.y} scale={p.scale} dir={p.dir} walk={p.walk} fill={p.pal.antFill} rim={p.rim ?? p.pal.rim} jaw={p.jaw} infection={p.inf} glowId="veinGlow" seed={250} pitch={p.pitch} />
);

// ---------------------------------------------------------------------------------------------

const black: SceneDef = {
  pal: (p) => (p.ep.infection > 0.5 ? { ...VOID, fog: '#1c4a2a', dust: '#b8ffc8', light: '#3dff6a', grade: '#39ff6a' } : VOID),
  focus: () => [W / 2, H * 0.48],
  render: (p) => {
    const pal = black.pal(p);
    return (
      <Stage pal={pal}>
        <Glow x={W / 2} y={H * 0.5} r={700} t={p.t} amount={0.35} ry={900} />
        <Fog t={p.t} amount={0.5} />
        <Dust t={p.t} count={60} seed={p.index + 3} color={pal.dust} speed={0.5} />
        {p.ep.n > 1 && (
          <g opacity={0.25 + 0.75 * p.inf}>
            <circle cx={W / 2 + 40} cy={H * 0.47} r={6 + p.inf * 6} fill="url(#glintGlow)" />
            <circle cx={W / 2 + 40} cy={H * 0.47} r={1.5 + p.inf * 2} fill="#c8ffd2" opacity={0.4 + 0.5 * Math.abs(Math.sin(p.t * 1.5))} />
          </g>
        )}
      </Stage>
    );
  },
};

const colony: SceneDef = {
  pal: () => AMBER,
  focus: () => [W / 2, 1100],
  render: (p) => {
    const pal = AMBER, camX = p.T * 45 + p.index * 700;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="c-far1" pal={pal} camX={camX} t={p.t} ceil={330} floor={520} depth={0.45} seed={11} haze={0.65} roots={false} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={520} seed={5} n={14} scale={0.32} pal={pal} both haze={0.6} depth={0.45} lod={2} tseed={11} />
        <Tunnel id="c-far2" pal={pal} camX={camX} t={p.t} ceil={1560} floor={1730} depth={0.5} seed={17} haze={0.7} roots={false} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={1730} seed={9} n={12} scale={0.3} pal={pal} both haze={0.65} depth={0.5} lod={2} tseed={17} />
        <Fog t={p.t} camX={camX} amount={0.7} y={500} spread={300} />
        <Tunnel id="c-main" pal={pal} camX={camX} t={p.t} ceil={800} floor={1340} seed={3} lights={2} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={1340} seed={1} n={8} scale={1.15} pal={pal} both tseed={3} lod={0} />
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
  pal: (p) => (p.inf > 0.55 ? { ...AMBER, rim: mix(AMBER.rim, '#7dffa0', (p.inf - 0.55) * 1.2), grade: mix(AMBER.grade, '#39ff6a', (p.inf - 0.5)) } : AMBER),
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
        <Amoeba id="am" t={p.T} cx={500} cy={1080} r={170} reach={reach} target={[1000, 1250]} />
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
        <Ant species="kesh" t={p.T} x={kx} y={ky} scale={sc} dir={-1} fill="#1a0402" rim="#ff8a3a" rimOpacity={0.95} oneAntenna={p.keshScarred} seed={17} pitch={Math.sin(p.t * 0.6) * 0.03} />
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

export const SCENES: Record<SceneId, SceneDef> = {
  black, colony, hero, closeup, surface, flood, amoeba, infection, senses, fireColony, swarm, battle, kesh, duel, queen, council, army,
};
