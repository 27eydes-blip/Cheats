// Season 2 sets, part 2: healing chamber, rebel hideout, Velka's chamber, the Green, the purge, the collapse,
// the burning creek (the season's set piece) and the rebuild chamber.
import React from 'react';
import { Ant } from '../art/Ant';
import { Dust, Embers, Fog, Smoke } from '../art/Atmosphere';
import { Kael, LordMandrosFinal, Mandros, OldWorker, Tavi, Velka } from '../art/characters';
import { smoothPath, Tunnel } from '../art/Earth';
import { FIRE, GREEN, type Palette } from '../art/palette';
import { mix } from '../lib/color';
import { clamp, ease, fbm, hash, lerp, range } from '../lib/random';
import { COLD, FIRE_GROUND, Glow, Stage, TJ_GROUND, wrap } from './scenes';
import type { SceneDef, SceneProps } from './types';

const Dim: React.FC<{ p: SceneProps }> = ({ p }) => <rect x={-300} y={-300} width={1680} height={2520} fill="#000" opacity={Math.min(0.4, 0.035 * (p.ep.n - 1))} />;
const opt = (p: SceneProps, k: string, d = '') => String(p.beat.options?.[k] ?? d);

const FUNGUS: Palette = { ...COLD, light: '#9fe8c8', rim: '#bfe8d8', fog: '#2a4a40', cavity0: '#1e3a34', cavity1: '#08120f', grade: '#4aa88a', dust: '#c8f0e0' };
const BLUE: Palette = { ...COLD, rim: '#a8c8e8', light: '#7aa8d8', fog: '#2a3a4a', cavity0: '#26323e', cavity1: '#0a0e14', grade: '#4a7aa8', dust: '#c8dcf0' };
const REBUILD: Palette = { ...FIRE, light: '#ff2a10', rim: '#ff4a2a', cavity0: '#4a0804', cavity1: '#100101', grade: '#ff1a00', fog: '#6a1008' };

const Lamp: React.FC<{ x: number; y: number; t: number; i: number; color?: string }> = ({ x, y, t, i, color = '#9fe8d8' }) => (
  <g>
    <ellipse cx={x} cy={y} rx={280} ry={200} fill="url(#lightGlow)" opacity={0.9 + 0.15 * Math.sin(t * 2 + i)} style={{ mixBlendMode: 'screen' }} />
    <path d={`M${x - 20},${y} Q${x},${y - 38} ${x + 20},${y} Z`} fill={color} />
    <rect x={x - 3} y={y} width={6} height={18} fill="#3a5a5a" />
  </g>
);

/** THE HEALING CHAMBER: small, dim, fungus-lit; Tavi on a bed of moss. options: sick (0..1), visit (Mandros at his side), table ('whole' | 'snapped'). */
const healingChamber: SceneDef = {
  pal: () => FUNGUS,
  focus: () => [600, 1050],
  render: (p) => {
    const pal = FUNGUS, floor = 1300;
    const sick = Number(p.beat.options?.sick ?? 0);
    const empty = !!p.beat.options?.empty;
    const table = opt(p, 'table');
    const snapped = table === 'snapped' && p.sinceSnap < 50 ? ease(p.sinceSnap / 0.4) : table === 'snapped' ? 1 : 0;
    const breath = 1 + 0.03 * Math.sin(p.T * (sick > 0.5 ? 0.7 : 1.6));
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="hc" pal={pal} camX={p.index * 100} t={p.t} ceil={620} floor={floor} seed={901} lights={0} solid={false} roughness={50} />
        <Lamp x={200} y={1120} t={p.T} i={0} />
        <Lamp x={900} y={1080} t={p.T} i={1} />
        {/* the moss bed */}
        <ellipse cx={560} cy={floor - 10} rx={300} ry={60} fill="#1a3a2a" />
        {range(26).map((i) => <circle key={i} cx={280 + hash(i + 900) * 560} cy={floor - 30 + hash(i + 901) * 40} r={10 + hash(i + 902) * 16} fill={mix('#2a5a3a', '#4a8a5a', hash(i + 903))} />)}
        {!empty && (
          <g transform={`translate(560 ${floor - 40}) scale(1 ${breath}) translate(-560 ${-(floor - 40)})`}>
            <Tavi t={p.T} x={500} y={floor - 60} scale={2.4} sick={sick} lie={sick > 0.3 ? 0.9 : 0.2} eyeOpen={sick > 0.6 ? 0.25 : 1} />
          </g>
        )}
        {table && (
          <g>
            <g transform={`translate(${-snapped * 60} ${snapped * 30}) rotate(${-snapped * 18} 860 1160)`}>
              <rect x={780} y={1150} width={90} height={14} fill="#5a3a20" />
              <rect x={790} y={1164} width={10} height={100} fill="#3a2410" />
            </g>
            <g transform={`translate(${snapped * 60} ${snapped * 40}) rotate(${snapped * 22} 940 1160)`}>
              <rect x={870} y={1150} width={90} height={14} fill="#5a3a20" />
              <rect x={940} y={1164} width={10} height={100} fill="#3a2410" />
            </g>
            <OldWorker t={p.T} x={1040} y={floor - TJ_GROUND * 0.9} scale={0.9} dir={-1} pitch={0.25} />
          </g>
        )}
        {empty && <Mandros episode={p.ep.n} t={p.T} x={820} y={floor - TJ_GROUND * 1.6 - 40} scale={1.6} dir={-1} pitch={0.22} jaw={p.jaw} />}
        {(p.beat.options?.visit || table) && <Mandros episode={p.ep.n} t={p.T} x={table ? 640 : 140} y={floor - TJ_GROUND * 1.5 - (table ? 110 : 60)} scale={1.5} pitch={0.18} jaw={p.jaw} />}
        <Fog t={p.t} amount={0.5} y={1100} spread={200} />
        <Dim p={p} />
        <Dust t={p.t} count={50} seed={p.index + 901} color={pal.dust} speed={0.25} />
      </Stage>
    );
  },
};

/** THE REBEL HIDEOUT: an abandoned beetle burrow, scratched maps, fungus lamps. options.mode: 'rebels' | 'visit' (Kael and Mandros in the dark) | 'empty' */
const hideout: SceneDef = {
  pal: () => BLUE,
  focus: () => [540, 1100],
  render: (p) => {
    const pal = BLUE, floor = 1300, mode = opt(p, 'mode', 'rebels');
    return (
      <Stage pal={pal} bg="#05070a">
        <g stroke="#7a8a9a" strokeOpacity={0.35} strokeWidth={3} fill="none">
          <path d={smoothPath([[120, 520], [260, 600], [380, 560], [520, 680], [700, 640], [900, 700]])} />
          <path d={smoothPath([[260, 600], [300, 760], [420, 820]])} />
          <path d={smoothPath([[700, 640], [760, 780], [900, 820]])} />
          <circle cx={900} cy={820} r={26} />
          <path d="M880,800 L920,840 M920,800 L880,840" />
        </g>
        <path d={smoothPath(range(20).map((i) => [i * 60 - 60, 470 + fbm(i * 0.4, 9) * 40] as [number, number]))} stroke="#1a2430" strokeWidth={60} fill="none" />
        {[[160, 1160], [860, 1120], [520, 1240]].map(([x, y], i) => <Lamp key={i} x={x} y={y} t={p.T} i={i} />)}
        <rect x={-300} y={floor} width={1680} height={900} fill="#03050a" />
        {mode === 'rebels' && range(18).map((i) => {
          const r = Math.floor(i / 6), x = 60 + (i % 6) * 180 + (r % 2) * 90, sc = 0.45 + r * 0.2;
          return <Ant key={i} species="trapjaw" t={p.T} x={x} y={floor - 160 + r * 80 - TJ_GROUND * sc} scale={sc} dir={x < 540 ? 1 : -1} fill="#06080c" rim="#9fc8e8" rimOpacity={0.4 + r * 0.15} seed={i + 910} lod={r < 2 ? 2 : 1} pitch={Math.sin(p.T + i) * 0.04} />;
        })}
        {mode === 'rebels' && <Kael t={p.T} x={540} y={floor - TJ_GROUND * 1.6 + 4} scale={1.6} pitch={-0.05} />}
        {mode === 'visit' && (
          <g>
            <ellipse cx={540} cy={1060} rx={520} ry={260} fill="url(#lightGlow)" opacity={0.7} style={{ mixBlendMode: 'screen' }} />
            <Kael t={p.T} x={800} y={1180 - TJ_GROUND * 1.9} scale={1.9} dir={-1} />
            <Mandros episode={p.ep.n} t={p.T} x={230} y={1180 - TJ_GROUND * 1.9} scale={1.9} pitch={0.08} jaw={p.jaw} />
          </g>
        )}
        {mode === 'empty' && (
          <g>
            <Mandros episode={p.ep.n} t={p.T} x={300} y={1180 - TJ_GROUND * 1.8} scale={1.8} pitch={0.12} jaw={p.jaw} />
            {range(6).map((i) => <circle key={i} cx={150 + i * 160} cy={floor - 6} r={8 + hash(i) * 8} fill="#1a2028" />)}
            <Smoke t={p.t} amount={0.5} y={1100} />
          </g>
        )}
        <Fog t={p.t} amount={0.5} y={1150} spread={200} />
        <Dim p={p} />
        <Dust t={p.t} count={50} seed={p.index + 911} color={pal.dust} speed={0.3} />
      </Stage>
    );
  },
};

/** GENERAL VELKA THRANE'S CHAMBER. options.mode: 'watch' | 'tell' (Mandros before her) | 'smile' | 'bow' (she bows to the final form) */
const velkaChamber: SceneDef = {
  pal: () => ({ ...FIRE, light: '#ff9a40', grade: '#ff5a20' }),
  focus: () => [600, 1050],
  render: (p) => {
    const pal = velkaChamber.pal(p), floor = 1300, mode = opt(p, 'mode', 'watch');
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="vc" pal={pal} camX={p.index * 120} t={p.t} ceil={560} floor={floor} seed={921} lights={1} solid={false} roughness={40} />
        <Glow x={760} y={980} r={700} t={p.T} amount={1.1} />
        <Velka t={p.T} x={mode === 'tell' ? 820 : 640} y={floor - 56 * (mode === 'smile' ? 2.4 : 1.8)} scale={mode === 'smile' ? 2.4 : 1.8} dir={-1} pitch={mode === 'smile' ? -0.06 : mode === 'bow' ? 0.45 * ease(p.t / 1.2) : 0.02} />
        {mode === 'bow' && <LordMandrosFinal t={p.T} x={150} y={floor - TJ_GROUND * 1.7 + 4} scale={1.7} jaw={p.jaw} />}
        {mode === 'smile' && <circle cx={640 - 94 * 2.4} cy={floor - 56 * 2.4 - 36 * 2.4} r={20} fill="url(#emberGlow)" opacity={0.8} style={{ mixBlendMode: 'screen' }} />}
        {mode === 'tell' && <Mandros episode={p.ep.n} t={p.T} x={200} y={floor - TJ_GROUND * 1.5 + 4} scale={1.5} pitch={0.06} jaw={p.jaw} />}
        <Smoke t={p.t} amount={0.4} y={700} />
        <Dim p={p} />
        <Dust t={p.t} count={50} seed={p.index + 921} color={pal.dust} speed={0.3} />
      </Stage>
    );
  },
};

/** THE GREEN: never a body. Tendrils creeping in from the dark, a burning light behind his eye. options.intensity (0..1) */
const theGreen: SceneDef = {
  pal: () => ({ ...GREEN, grade: '#2aff6a' }),
  focus: () => [600, 900],
  render: (p) => {
    const k = Number(p.beat.options?.intensity ?? 0.6);
    const sc = 7.5;
    const pulse = 0.6 + 0.4 * Math.sin(p.T * 2.4);
    const tendril = (i: number) => {
      const side = i % 2 ? 1 : -1, y0 = 300 + i * 260;
      const reach = (0.3 + 0.5 * k) * (0.8 + 0.2 * Math.sin(p.T * 0.7 + i));
      const pts = range(10).map((s) => {
        const u = s / 9;
        return [side < 0 ? lerp(-100, 540 * reach, u) : lerp(1180, 1080 - 540 * reach, u), y0 + Math.sin(u * 6 + p.T * 1.5 + i) * 60 * u] as [number, number];
      });
      return <path key={i} d={smoothPath(pts)} stroke="#3dff6a" strokeWidth={26 - i * 2} strokeLinecap="round" fill="none" opacity={0.55} filter="url(#softBlur)" />;
    };
    return (
      <Stage pal={GREEN} bg="#010402">
        {range(6).map(tendril)}
        <Mandros episode={p.ep.n} t={p.T} x={600 - 100 * sc} y={900 + 29 * sc} scale={sc} jaw={1} />
        <circle cx={600} cy={900} r={120 + 140 * k * pulse} fill="url(#glintGlow)" opacity={0.7 + 0.3 * k} style={{ mixBlendMode: 'screen' }} />
        {range(3).map((i) => {
          const u = wrap(p.t / 2.2 + i / 3, 1);
          return <circle key={'r' + i} cx={600} cy={900} r={60 + u * 900} fill="none" stroke="#9dffb0" strokeOpacity={(1 - u) * 0.35} strokeWidth={3} />;
        })}
        <Dust t={p.t} count={60} seed={p.index + 931} color="#b8ffc8" speed={0.2} />
      </Stage>
    );
  },
};

/**
 * THE PURGE. options.mode:
 *  'march'   five hundred fire soldiers moving through the dark, Lord Mandros at the front
 *  'flood'   soldiers flooding the burrow in silhouette; rebels go down (impacts, flashes, never gore)
 *  'stand'   the old worker standing in front of the younger ones, facing him
 *  'vision'  the Green's vision: Tavi trapped in the crowd as soldiers flood the cold tunnels
 */
const purge: SceneDef = {
  pal: (p) => (opt(p, 'mode') === 'vision' ? { ...BLUE, grade: '#2aff6a', light: '#6dff8a' } : opt(p, 'mode') === 'stand' ? BLUE : { ...FIRE, light: '#ff3a10' }),
  focus: () => [540, 1100],
  render: (p) => {
    const mode = opt(p, 'mode', 'march'), pal = purge.pal(p), floor = 1240, camX = p.index * 300 + p.T * (mode === 'march' ? 140 : 40);
    const flashes = range(6).map((i) => { const tt = wrap(p.T * (1.4 + hash(i)) + hash(i + 3) * 9, 1.8); return tt < 0.15 ? 1 - tt / 0.15 : 0; });
    return (
      <Stage pal={pal} bg={mode === 'march' ? '#030101' : pal.dirt}>
        <Tunnel id="pg" pal={pal} camX={camX} t={p.t} ceil={700} floor={floor} seed={941} lights={mode === 'march' ? 0 : 1} solid={false} />
        {mode === 'march' && (
          <g>
            {range(36).map((i) => {
              const row = i % 3, x = wrap(hash(i + 940) * 1300 - p.T * 30, 1300) - 160, sc = 0.75 + row * 0.25;
              return <Ant key={i} species="fire" t={p.T} x={x} y={floor - row * 40 - FIRE_GROUND * sc} scale={sc} walk={1.4} fill="#0a0201" rim="#ff4a1a" rimOpacity={0.5} seed={i + 941} lod={row ? 2 : 1} />;
            })}
            <Mandros episode={p.ep.n} t={p.T} x={700} y={floor - TJ_GROUND * 2.1 + 4} scale={2.1} walk={1.2} jaw={p.jaw} />
          </g>
        )}
        {(mode === 'flood' || mode === 'vision') && (
          <g>
            {range(30).map((i) => {
              const x = wrap(hash(i + 950) * 1400 + p.T * (220 + hash(i) * 80), 1400) - 200, sc = 0.85 + hash(i + 951) * 0.5;
              return <Ant key={i} species="fire" t={p.T} x={x} y={floor - (i % 3) * 36 - FIRE_GROUND * sc} scale={sc} walk={2.4} fill="#0a0201" rim={mode === 'vision' ? '#6dff8a' : '#ff4a1a'} rimOpacity={0.55} seed={i + 951} lod={2} />;
            })}
            {mode === 'flood' && range(4).map((i) => <Ant key={'r' + i} species="trapjaw" t={0} x={200 + i * 220} y={floor - 20} scale={1.0} flip lie={1} eyeOpen={0} fill="#05070a" rim="#9fc8e8" rimOpacity={0.35} seed={i + 960} lod={1} />)}
            {mode === 'vision' && <Tavi t={p.T} x={520} y={floor - 60} scale={2.2} pitch={-0.2} />}
            {flashes.map((f, i) => <circle key={'f' + i} cx={200 + hash(i + 5) * 680} cy={1080 + hash(i + 6) * 160} r={40 + f * 120} fill="url(#emberGlow)" opacity={f} style={{ mixBlendMode: 'screen' }} />)}
          </g>
        )}
        {mode === 'stand' && (
          <g>
            {range(4).map((i) => <Ant key={i} species="trapjaw" t={p.T} x={800 + i * 80} y={floor - 30 - TJ_GROUND * 0.8} scale={0.8} dir={-1} pitch={0.2} fill="#06080c" rim="#9fc8e8" rimOpacity={0.5} seed={i + 970} lod={1} />)}
            <ellipse cx={560} cy={floor - 120} rx={460} ry={260} fill="url(#lightGlow)" opacity={0.6} style={{ mixBlendMode: 'screen' }} />
            <OldWorker t={p.T} x={680} y={floor - TJ_GROUND * 1.7 + 4} scale={1.7} dir={-1} pitch={-0.02} />
            <circle cx={680 - 100 * 1.7} cy={floor - TJ_GROUND * 1.7 - 34} r={6} fill="#cfe8ff" opacity={0.85} />
            <Mandros episode={p.ep.n} t={p.T} x={60} y={floor - TJ_GROUND * 2.0 + 4} scale={2.0} jaw={p.jaw} />
          </g>
        )}
        {mode === 'vision' && <rect x={-300} y={-300} width={1680} height={2520} fill="#3dff6a" opacity={0.1} style={{ mixBlendMode: 'screen' }} />}
        <Smoke t={p.t} amount={mode === 'march' ? 0.3 : 0.6} y={800} />
        <Dim p={p} />
        <Dust t={p.t} count={40} seed={p.index + 941} color={pal.dust} speed={0.5} />
      </Stage>
    );
  },
};

/** THE COLLAPSE on the throne room floor. options.mode: 'fall' (the green floods him) | 'rise' (he stands; soldiers back away; eyes burning) | 'scout' (a scout runs in, shaking) */
const collapse: SceneDef = {
  pal: () => ({ ...FIRE, grade: '#3aff6a' }),
  focus: () => [540, 1100],
  render: (p) => {
    const pal = collapse.pal(p), floor = 1300, mode = opt(p, 'mode', 'fall');
    const k = ease(p.t / Math.max(1.5, p.dur));
    const flood = mode === 'fall' ? k : 1;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="cl" pal={pal} camX={p.index * 100} t={p.t} ceil={420} floor={floor} seed={981} lights={1} solid={false} roughness={80} />
        <Glow x={540} y={900} r={800} t={p.T} amount={0.7} />
        {range(10).map((i) => {
          const x = 40 + i * 110, back = mode === 'rise' ? k * 60 * (x < 540 ? -1 : 1) : 0;
          return <Ant key={i} species="fire" t={p.T} x={x + back} y={floor - 230 - (i % 2) * 30 - FIRE_GROUND * 0.6} scale={0.6} dir={x < 540 ? 1 : -1} walk={mode === 'rise' && k < 1 ? 0.8 : 0} fill="#140402" rim="#ff7a2e" rimOpacity={0.5} seed={i + 980} lod={2} />;
        })}
        {mode !== 'scout' && (
          <g>
            <ellipse cx={540} cy={floor - 60} rx={400 * flood} ry={200 * flood} fill="url(#glintGlow)" opacity={0.7 * flood} style={{ mixBlendMode: 'screen' }} />
            <Ant species="trapjaw" t={p.T} x={420} y={floor - TJ_GROUND * 1.8 + 4} scale={1.8} lie={mode === 'fall' ? k : 1 - k} armor fill="#0b0604" rim="#7dffa0" infection={1} cracks={0.3 + 0.7 * flood} glowId="veinGlow" seed={250} jaw={p.jaw} pitch={mode === 'rise' ? -0.08 : 0.1} />
            {mode === 'rise' && <circle cx={420 + 100 * 1.8} cy={floor - TJ_GROUND * 1.8 - 26 * 1.8} r={50} fill="url(#emberGlow)" opacity={0.9} style={{ mixBlendMode: 'screen' }} />}
          </g>
        )}
        {mode === 'scout' && (
          <g>
            <Mandros episode={p.ep.n} t={p.T} x={760} y={floor - TJ_GROUND * 1.6 + 4} scale={1.6} dir={-1} jaw={p.jaw} />
            <g transform={`translate(${Math.sin(p.T * 40) * 3} 0)`}>
              <Ant species="fire" t={p.T} x={lerp(-60, 280, Math.min(1, k * 1.8))} y={floor - FIRE_GROUND * 0.9} scale={0.9} walk={k < 0.55 ? 3 : 0} pitch={0.25} fill="#1a0402" rim="#ff9a5a" seed={991} />
            </g>
          </g>
        )}
        <Dim p={p} />
        <Dust t={p.t} count={50} seed={p.index + 981} color="#c8ffd2" speed={0.3} />
      </Stage>
    );
  },
};

/** The burning creek: banks on fire, glowing sap like rivers of light, cracked mud, smoke, and a tall root arching over it. */
const CreekWorld: React.FC<{ t: number; camX: number; heat?: number; children?: React.ReactNode; root?: boolean }> = ({ t, camX, heat = 1, children, root = true }) => {
  const mud = 1180;
  const sap = (y: number, w: number, seed: number) => {
    const pts = range(26).map((i) => [i * 50 - 100, y + fbm((i * 50 + camX) / 300, seed) * 40] as [number, number]);
    return (
      <g key={seed}>
        <path d={smoothPath(pts)} stroke="#ff6a10" strokeWidth={w * 2.2} strokeLinecap="round" fill="none" opacity={0.35 * heat} filter="url(#softBlur)" />
        <path d={smoothPath(pts)} stroke="#ffb040" strokeWidth={w} strokeLinecap="round" fill="none" opacity={0.85 * heat} />
        <path d={smoothPath(pts)} stroke="#fff1b0" strokeWidth={w * 0.25} strokeLinecap="round" fill="none" opacity={0.6 * heat} strokeDasharray={`${20 + (t * 40) % 30} 30`} />
      </g>
    );
  };
  return (
    <g>
      <rect x={-300} y={-300} width={1680} height={2520} fill="url(#bgGrad)" />
      <Glow x={540} y={1000} r={1100} t={t} amount={1.7} ry={700} />
      <Glow x={540} y={1180} r={700} t={t + 2} amount={1.2} ry={220} />
      {/* the giant root arching over the creek */}
      {root && (
        <g>
          <path d="M-120,1290 C60,700 360,380 640,360 C900,350 1080,560 1200,980" stroke="#0a0302" strokeWidth={110} fill="none" strokeLinecap="round" />
          <path d="M-120,1290 C60,700 360,380 640,360 C900,350 1080,560 1200,980" stroke="#ffb060" strokeOpacity={0.65} strokeWidth={6} fill="none" transform="translate(0,-52)" />
        </g>
      )}
      <Smoke t={t} amount={0.8} y={600} />
      <rect x={-300} y={mud} width={1680} height={900} fill="#120502" />
      {/* cracked mud */}
      <g stroke="#ff5a10" strokeOpacity={0.45 * heat} strokeWidth={3} fill="none">
        {range(12).map((i) => <path key={i} d={`M${hash(i + 70) * 1080},${mud + 20 + hash(i + 71) * 300} l${(hash(i + 72) - 0.5) * 160},${hash(i + 73) * 80} l${(hash(i + 74) - 0.5) * 120},${hash(i + 75) * 60}`} />)}
      </g>
      {sap(mud + 70, 24, 1)}
      {sap(mud + 190, 36, 2)}
      {range(12).map((i) => {
        const x = hash(i + 80) * 1080;
        return <path key={'fl' + i} d={`M${x - 40},${mud + 6} Q${x + Math.sin(t * 6 + i) * 18},${mud - 140 - hash(i) * 160} ${x + 40},${mud + 6} Z`} fill="#ff7a20" opacity={0.6 + 0.3 * Math.sin(t * 9 + i)} />;
      })}
      {children}
      <Embers t={t} amount={1} />
      <Smoke t={t + 13} amount={0.35} y={1300} />
    </g>
  );
};

/**
 * THE BURNING CREEK. options.mode:
 *  'wide'      establishing: the creek on fire, sap glowing in the mud
 *  'standoff'  Kael on the far bank with Tavi hiding behind him; Lord Mandros on the near bank
 *  'clash'     two trap-jaws snapping, sparks off their shells (pair with slowmo / whip)
 *  'smoke'     fighting blind through smoke; only heartbeats
 *  'climb'     Kael climbs the giant root
 *  'jump'      Lord Mandros leaps up at him
 *  'fallen'    the burning mud swallows half his body; Kael above him, crying
 *  'leave'     Kael carries Tavi into the smoke and never looks back
 */
const burningCreek: SceneDef = {
  pal: () => ({ ...FIRE, grade: '#ff5a10', light: '#ff8a30' }),
  focus: (p) => (opt(p, 'mode') === 'clash' ? [540, 1180] : [540, 1050]),
  render: (p) => {
    const mode = opt(p, 'mode', 'wide'), floor = 1180, k = ease(p.t / Math.max(1.2, p.dur));
    const camX = p.index * 200 + p.T * 10;
    const sparks = (x: number, y: number, on: number) =>
      range(14).map((i) => {
        const a = hash(i + 990) * Math.PI * 2, d = on * (40 + hash(i + 991) * 140);
        return <line key={i} x1={x + Math.cos(a) * d * 0.5} y1={y + Math.sin(a) * d * 0.5} x2={x + Math.cos(a) * d} y2={y + Math.sin(a) * d} stroke="#fff1b0" strokeWidth={3} strokeOpacity={1 - on} strokeLinecap="round" />;
      });
    const hit = (rate: number) => { const tt = wrap(p.T * rate, 1); return tt < 0.25 ? tt / 0.25 : 0; };
    return (
      <Stage pal={FIRE} bg="#0a0201">
        <CreekWorld t={p.T} camX={camX} root={mode !== 'smoke'}>
          {mode === 'standoff' && (
            <g>
              <Kael t={p.T} x={760} y={floor - TJ_GROUND * 1.7 - 40} scale={1.7} dir={-1} />
              <Tavi t={p.T} x={980} y={floor - 90} scale={2.0} dir={-1} pitch={0.1} />
              <Mandros episode={p.ep.n} t={p.T} x={110} y={floor - TJ_GROUND * 2.0 + 6} scale={2.0} jaw={p.jaw} />
            </g>
          )}
          {mode === 'clash' && (
            <g>
              <Mandros episode={p.ep.n} t={p.T} x={250 + Math.sin(p.T * 5) * 40} y={floor - TJ_GROUND * 2.4 + 6} scale={2.4} jaw={hit(1.6) > 0 ? 0 : 1} pitch={Math.sin(p.T * 7) * 0.05} />
              <Kael t={p.T} x={830 - Math.sin(p.T * 5) * 40} y={floor - TJ_GROUND * 2.4 + 6} scale={2.4} dir={-1} jaw={hit(1.6) > 0 ? 0 : 1} />
              {sparks(540, floor - 150, hit(1.6))}
              <circle cx={540} cy={floor - 150} r={40 + hit(1.6) * 140} fill="url(#emberGlow)" opacity={hit(1.6) > 0 ? 1 - hit(1.6) : 0} style={{ mixBlendMode: 'screen' }} />
            </g>
          )}
          {mode === 'smoke' && (
            <g>
              <rect x={-300} y={-300} width={1680} height={2520} fill="#2a1a14" opacity={0.5} />
              <Ant species="trapjaw" t={p.T} x={220} y={floor - TJ_GROUND * 2.1} scale={2.1} outline="#7dffa0" seed={250} walk={0.8} />
              <Ant species="trapjaw" t={p.T} x={860} y={floor - TJ_GROUND * 2.1} scale={2.1} dir={-1} outline="#9fd0ff" oneAntenna seed={33} walk={0.8} />
              {range(3).map((i) => {
                const u = wrap(p.t / 0.8 + i / 3, 1);
                return <circle key={i} cx={760} cy={floor - 120} r={20 + u * 300} fill="none" stroke="#ff9a9a" strokeOpacity={(1 - u) * 0.5} strokeWidth={3} />;
              })}
            </g>
          )}
          {mode === 'climb' && <g transform={`rotate(-38 ${lerp(200, 420, k)} ${lerp(980, 700, k)})`}><Kael t={p.T} x={lerp(160, 420, k)} y={lerp(1000, 640, k)} scale={1.6} walk={1.6} /></g>}
          {mode === 'jump' && (
            <g>
              <Kael t={p.T} x={600} y={440} scale={1.1} pitch={0.2} />
              <g transform={`rotate(${-30 * k} ${lerp(200, 520, k)} ${lerp(1100, 560, Math.sin(k * Math.PI / 2))})`}>
                <Mandros episode={p.ep.n} t={p.T} x={lerp(200, 520, k)} y={lerp(1100, 560, Math.sin(k * Math.PI / 2))} scale={1.4} walk={0.3} jaw={k > 0.9 ? 0 : 1} />
              </g>
            </g>
          )}
          {mode === 'fallen' && (
            <g>
              <Kael t={p.T} x={660} y={480} scale={1.5} dir={-1} pitch={0.35} />
              {range(4).map((i) => <circle key={i} cx={660 - 150 + Math.sin(i) * 4} cy={420 + ((p.T * 120 + i * 60) % 260)} r={4} fill="#cfe8ff" opacity={0.8} />)}
              <g>
                <ellipse cx={500} cy={floor - 20} rx={360} ry={160} fill="url(#glintGlow)" opacity={0.35} style={{ mixBlendMode: 'screen' }} />
                <Mandros episode={p.ep.n} t={p.T} x={340} y={floor - 85} scale={2.0} lie={0.7} pitch={0.25} jaw={0.1} />
                <rect x={-300} y={floor - 8} width={1680} height={600} fill="#120502" />
                <path d={smoothPath(range(26).map((i) => [i * 50 - 100, floor - 8 + Math.sin(i + p.T * 2) * 6] as [number, number]))} stroke="#ffb040" strokeWidth={14} fill="none" opacity={0.9} />
              </g>
            </g>
          )}
          {mode === 'leave' && (
            <g opacity={1 - k * 0.7}>
              <Kael t={p.T} x={lerp(380, 900, k)} y={floor - TJ_GROUND * 1.8 - 10} scale={1.8} walk={0.7} />
              <Tavi t={p.T} x={lerp(380, 900, k) + 80} y={floor - TJ_GROUND * 1.8 - 80} scale={1.7} lie={0.6} />
            </g>
          )}
        </CreekWorld>
        {mode === 'leave' && <Smoke t={p.t + 30} amount={k} y={1000} />}
        <Dim p={p} />
      </Stage>
    );
  },
};

/**
 * THE REBUILD CHAMBER: deep underground, red light; fire workers seal him into black resin armor.
 * options.mode: 'carry' (soldiers carry him in) | 'seal' (pieces clamp on one by one) | 'reveal' (the final form stands) | 'scream'
 */
const rebuild: SceneDef = {
  pal: () => REBUILD,
  focus: () => [540, 1000],
  render: (p) => {
    const mode = opt(p, 'mode', 'seal'), floor = 1300, pal = REBUILD;
    const k = ease(p.t / Math.max(1.5, p.dur));
    const pieces = 5, placed = mode === 'seal' ? Math.floor(clamp(p.t / Math.max(1, p.dur)) * pieces + 0.5) : mode === 'carry' ? 0 : pieces;
    const final = mode === 'reveal' || mode === 'scream';
    return (
      <Stage pal={pal} bg="#060000">
        <Tunnel id="rb" pal={pal} camX={p.index * 60} t={p.t} ceil={520} floor={floor} seed={1001} lights={1} solid={false} roughness={40} flicker={2} />
        <Glow x={540} y={980} r={700} t={p.T} amount={1.2} />
        {!final && <rect x={180} y={floor - 60} width={720} height={60} fill="#1a0302" stroke="#ff4a2a" strokeOpacity={0.4} />}
        {!final && (
          <g>
            <Ant species="trapjaw" t={p.T} x={mode === 'carry' ? lerp(-200, 420, k) : 420} y={floor - 100} scale={1.8} lie={1} armor fill="#0b0604" rim="#ff6a4a" cracks={1} infection={1} glowId="veinGlow" seed={250} pitch={0.15} />
            {range(placed).map((i) => (
              <rect key={i} x={240 + i * 110} y={floor - 175 + (i % 2) * 20} width={100} height={46} rx={14} fill="#050505" stroke="#3a3a3a" strokeWidth={2} />
            ))}
            {range(4).map((i) => <Ant key={i} species="fire" t={p.T} x={150 + i * 260} y={floor - 230 - (i % 2) * 40} scale={0.7} dir={i % 2 ? -1 : 1} pitch={0.35 + Math.sin(p.T * 6 + i) * 0.08} fill="#140302" rim="#ff4a2a" seed={i + 1010} lod={1} />)}
          </g>
        )}
        {final && (
          <g>
            <ellipse cx={560} cy={floor - 100} rx={420} ry={260} fill="url(#glintGlow)" opacity={0.25 + 0.15 * Math.sin(p.T * 1.2)} style={{ mixBlendMode: 'screen' }} />
            <LordMandrosFinal t={p.T} x={330} y={floor - TJ_GROUND * 2.1 + 4 + (mode === 'reveal' ? (1 - k) * 60 : 0)} scale={2.1} lie={mode === 'reveal' ? 1 - k : 0} pitch={-0.05} jaw={p.jaw} />
            {mode === 'scream' && range(3).map((i) => {
              const u = wrap(p.t / 1.1 + i / 3, 1);
              return <circle key={i} cx={560} cy={floor - 140} r={60 + u * 1100} fill="none" stroke="#fff" strokeOpacity={(1 - u) * 0.5} strokeWidth={6} />;
            })}
          </g>
        )}
        <Smoke t={p.t} amount={0.5} y={700} />
        <Dim p={p} />
        <Dust t={p.t} count={50} seed={p.index + 1001} color="#ffb0a0" speed={0.25} />
      </Stage>
    );
  },
};

export const SCENES_S2B: Record<string, SceneDef> = { healingChamber, hideout, velkaChamber, theGreen, purge, collapse, burningCreek, rebuild };
void TJ_GROUND; void Velka;
