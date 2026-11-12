// Season 2 sets. Darker and more intense as the season goes on (see `dim`).
import React from 'react';
import { Ant } from '../art/Ant';
import { Dust, Embers, Fog, Smoke } from '../art/Atmosphere';
import { Kael, Mandros, Tavi } from '../art/characters';
import { smoothPath, Tunnel } from '../art/Earth';
import { FIRE, type Palette } from '../art/palette';
import { mix } from '../lib/color';
import { clamp, ease, hash, hash2, lerp, range } from '../lib/random';
import { COLD, FIRE_GROUND, Glow, Stage, TJ_GROUND, wrap } from './scenes';
import type { SceneDef, SceneProps } from './types';

/** Each Season 2 episode is a little darker than the last. */
const Dim: React.FC<{ p: SceneProps }> = ({ p }) => <rect x={-300} y={-300} width={1680} height={2520} fill="#000" opacity={Math.min(0.4, 0.035 * (p.ep.n - 1))} />;

const THRONE: Palette = { ...FIRE, cavity0: '#7a2006', cavity1: '#200602', grade: '#ff3a10' };
const COLD_BLUE: Palette = { ...COLD, rim: '#a8c8e8', light: '#7aa8d8', fog: '#2a3a4a', cavity0: '#26323e', cavity1: '#0a0e14', grade: '#4a7aa8', dust: '#c8dcf0' };

/** The throne: a great root, carved into a seat. */
const Throne: React.FC<{ x: number; y: number; s: number; rim: string }> = ({ x, y, s, rim }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-260,40 C-250,-80 -200,-220 -120,-300 C-90,-330 -60,-320 -70,-280 C-100,-200 -110,-120 -90,-60 L110,-60 C130,-120 120,-220 90,-290 C80,-320 120,-330 150,-300 C230,-220 260,-80 270,40 Z" fill="#0c0503" />
    <path d="M-260,40 C-250,-80 -200,-220 -120,-300 M270,40 C260,-80 230,-220 150,-300" stroke={rim} strokeOpacity={0.5} strokeWidth={4} fill="none" />
    <path d="M-150,-60 L170,-60 L190,40 L-170,40 Z" fill="#140805" stroke={rim} strokeOpacity={0.35} strokeWidth={3} />
    {range(6).map((i) => <path key={i} d={`M${-200 + i * 80},${40 + (i % 2) * 10} C${-210 + i * 80},90 ${-240 + i * 80},130 ${-280 + i * 90},170`} stroke="#0c0503" strokeWidth={22 - i * 2} strokeLinecap="round" fill="none" />)}
  </g>
);

/** Rows of fire soldiers bowing (heads lowered), smaller and hazier with distance. */
const Bowing: React.FC<{ t: number; bow: number; rows?: number; y0?: number }> = ({ t, bow, rows = 4, y0 = 1000 }) => (
  <g>
    {range(rows).map((r) => {
      const sc = 0.35 + r * 0.18, y = y0 + r * 95 + r * r * 14, n = 12 - r * 2;
      return (
        <g key={r}>
          {range(n).map((i) => {
            const x = 30 + (i + (r % 2) * 0.5) * (1040 / n);
            return <Ant key={i} species="fire" t={t} x={x} y={y - FIRE_GROUND * sc} scale={sc} dir={x < 540 ? 1 : -1} pitch={bow * (0.35 + 0.05 * Math.sin(i))} fill={mix('#160402', '#5a1606', (3 - r) * 0.12)} rim="#ff7a2e" rimOpacity={0.35 + r * 0.15} seed={i + r * 20} lod={r < 2 ? 2 : 1} />;
          })}
        </g>
      );
    })}
  </g>
);

/**
 * THE THRONE ROOM. options.phase:
 *  'wide'  Lord Mandros on the root throne above thousands of bowing soldiers
 *  'walk'  he walks between the rows; every head lowers as he passes
 *  'night' the room dark; the green in his veins is the only light
 *  'run'   a young trap-jaw breaks from the line and runs toward him
 *  'grab'  his guards seize the young trap-jaw
 */
const throneRoom: SceneDef = {
  pal: (p) => (p.beat.options?.phase === 'night' ? { ...THRONE, light: '#3dff6a', grade: '#1a8a3a' } : THRONE),
  focus: () => [540, 760],
  render: (p) => {
    const pal = throneRoom.pal(p);
    const phase = String(p.beat.options?.phase ?? 'wide');
    const k = ease(p.t / Math.max(2, p.dur));
    const night = phase === 'night';
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="tr" pal={pal} camX={p.index * 120} t={p.t} ceil={260} floor={1420} seed={801} lights={night ? 0 : 3} solid={false} roughness={90} roots />
        {!night && <Glow x={540} y={640} r={900} t={p.T} amount={1.1} ry={700} />}
        {!night && <Embers t={p.T} amount={0.5} />}
        {(phase === 'wide' || phase === 'night') && (
          <g>
            <Throne x={540} y={820} s={1.2} rim={night ? '#3dff6a' : '#ff9a50'} />
            <Mandros episode={p.ep.n} t={p.T} x={540 - 30} y={700} scale={1.35} pitch={0.05} jaw={p.jaw} />
            {night && <ellipse cx={540} cy={680} rx={360} ry={220} fill="url(#glintGlow)" opacity={0.55} style={{ mixBlendMode: 'screen' }} />}
            {!night && <Bowing t={p.T} bow={1} y0={1040} />}
          </g>
        )}
        {phase === 'walk' && (
          <g>
            <Bowing t={p.T} bow={1} rows={2} y0={980} />
            <Mandros episode={p.ep.n} t={p.T} x={lerp(-140, 520, k)} y={1180 - TJ_GROUND * 1.6} scale={1.6} walk={0.7} jaw={p.jaw} />
            {range(5).map((i) => {
              const x = 120 + i * 220, near = Math.max(0, 1 - Math.abs(x - lerp(-140, 520, k) - 180) / 260);
              return <Ant key={i} species="fire" t={p.T} x={x} y={1330 - FIRE_GROUND * 0.95} scale={0.95} dir={-1} pitch={0.1 + 0.4 * near} fill="#140402" rim="#ff7a2e" seed={i + 830} lod={1} />;
            })}
          </g>
        )}
        {(phase === 'run' || phase === 'grab') && (
          <g>
            <Throne x={820} y={760} s={0.8} rim="#ff9a50" />
            <Mandros episode={p.ep.n} t={p.T} x={820 - 30} y={680} scale={0.95} jaw={p.jaw} dir={-1} />
            <Bowing t={p.T} bow={1} rows={2} y0={1000} />
            {phase === 'run' ? (
              <Tavi t={p.T} x={lerp(-80, 420, k)} y={1300 - 36 * 0.5 * 2.2} scale={2.2} walk={3.2} pitch={-0.05} />
            ) : (
              <g>
                <Tavi t={p.T} x={420} y={1300 - 36 * 0.5 * 2.2 + 6} scale={2.2} lie={0.3 * ease(p.t / 0.6)} pitch={-0.15} />
                <Ant species="fire" t={p.T} x={lerp(160, 300, ease(p.t / 0.5))} y={1300 - FIRE_GROUND * 1.25} scale={1.25} walk={p.t < 0.5 ? 2 : 0} pitch={0.15} fill="#160402" rim="#ff7a2e" seed={841} />
                <Ant species="fire" t={p.T} x={lerp(900, 680, ease(p.t / 0.5))} y={1300 - FIRE_GROUND * 1.25} scale={1.25} dir={-1} walk={p.t < 0.5 ? 2 : 0} pitch={0.15} fill="#160402" rim="#ff7a2e" seed={842} />
              </g>
            )}
          </g>
        )}
        <Smoke t={p.t} amount={night ? 0.2 : 0.45} y={500} />
        <Fog t={p.t} amount={0.4} y={1100} spread={300} />
        <Dim p={p} />
        <Dust t={p.t} count={60} seed={p.index + 801} color={night ? '#b8ffc8' : pal.dust} speed={0.4} />
      </Stage>
    );
  },
};

/** THE COLD TUNNELS: blue-gray, dripping water, chained trap-jaws digging. */
const coldTunnels: SceneDef = {
  pal: () => COLD_BLUE,
  focus: () => [540, 1100],
  render: (p) => {
    const pal = COLD_BLUE, floor = 1300;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="ct" pal={pal} camX={p.index * 150 + p.T * 6} t={p.t} ceil={640} floor={floor} seed={821} lights={1} solid={false} />
        <Glow x={300} y={900} r={700} t={p.t} amount={0.55} />
        {range(20).map((i) => {
          const h = hash(i + 820), fall = wrap(p.T * 1.1 + h * 3, 3) / 3;
          return <line key={'d' + i} x1={h * 1080} y1={660 + fall * 640} x2={h * 1080} y2={684 + fall * 640} stroke="#c8dcf0" strokeOpacity={0.45} strokeWidth={2} />;
        })}
        {range(5).map((i) => {
          const x = 80 + i * 210, dig = Math.max(0, Math.sin(p.T * 3 + i * 1.3));
          return (
            <g key={i}>
              <Ant species="trapjaw" t={p.T} x={x} y={floor - TJ_GROUND * 0.95 + 4} scale={0.95} pitch={0.25 + dig * 0.15} jaw={0.3 + 0.7 * dig} fill="#0a0c10" rim={pal.rim} rimOpacity={0.6} seed={i + 822} lod={1} />
              {i < 4 && range(9).map((c) => {
                const u = c / 8, cx = lerp(x + 100, x + 150, u), cy = floor - 40 + Math.sin(u * Math.PI) * 14;
                return <ellipse key={c} cx={cx} cy={cy} rx={6} ry={3.5} fill="none" stroke="#8a98a8" strokeWidth={2} transform={`rotate(${c % 2 ? 0 : 90} ${cx} ${cy})`} />;
              })}
              {dig > 0.8 && <circle cx={x + 170} cy={floor - 30 - (dig - 0.8) * 200} r={6} fill="#3a4250" />}
            </g>
          );
        })}
        <Fog t={p.t} amount={0.6} y={1150} spread={250} />
        <Dim p={p} />
        <Dust t={p.t} count={50} seed={p.index + 821} color={pal.dust} speed={0.3} />
      </Stage>
    );
  },
};

/** Tavi up close: tiny, huge eyes looking up. options.sick (0..1), options.bed (lying in moss). */
const taviClose: SceneDef = {
  pal: () => ({ ...FIRE, light: '#ffb070', grade: '#ff8a40' }),
  focus: () => [540, 900],
  render: (p) => {
    const pal = taviClose.pal(p);
    const sick = Number(p.beat.options?.sick ?? 0);
    const sc = 4.6;
    return (
      <Stage pal={pal} bg="#0c0402">
        <Glow x={620} y={600} r={900} t={p.t} amount={0.9} ry={700} />
        <Glow x={560} y={1020} r={560} t={p.t + 1} amount={1.5} ry={360} />
        <g filter="url(#softBlur)" opacity={0.7}>
          {range(6).map((i) => <Ant key={i} species="fire" t={p.T} x={120 + i * 170} y={560 + (i % 2) * 40} scale={0.7} dir={i % 2 ? -1 : 1} pitch={0.3} fill="#160402" rim="#ff7a2e" rimOpacity={0.4} seed={i + 850} lod={2} />)}
        </g>
        {/* the shadow of Lord Mandros, looming over him */}
        <ellipse cx={540} cy={260} rx={760} ry={300} fill="#000" opacity={0.55} />
        <Tavi t={p.T} x={540 - 96 * sc * 0.5} y={1130} scale={sc} pitch={-0.32} sick={sick} eyeOpen={1} />
        <Dust t={p.t} count={50} seed={p.index + 851} color={pal.dust} speed={0.3} />
        <Dim p={p} />
      </Stage>
    );
  },
};

/**
 * Kael Varro. options.mode:
 *  'memory' a remembered face, cold blue and soft     'fall' the night the colony fell: he drops into fire and smoke
 *  'alive'  in the rebel hideout (an old beetle burrow: scratched maps, fungus lamps), alive
 */
const kael: SceneDef = {
  pal: (p) => (p.beat.options?.mode === 'fall' ? FIRE : COLD_BLUE),
  focus: () => [540, 1000],
  render: (p) => {
    const mode = String(p.beat.options?.mode ?? 'memory');
    const pal = kael.pal(p);
    const sc = 2.6;
    if (mode === 'fall') {
      const k = ease(p.t / Math.max(1.5, p.dur));
      return (
        <Stage pal={pal} bg={pal.dirt}>
          <Glow x={540} y={1100} r={900} t={p.T} amount={1.3} />
          <Smoke t={p.t} amount={1} y={700} />
          <g transform={`rotate(${-k * 70} 540 ${lerp(820, 1120, k)})`} opacity={1 - k * 0.6}>
            <Kael t={p.T} x={540 - 30 * sc} y={lerp(820, 1120, k)} scale={sc} walk={0.4} />
          </g>
          <Smoke t={p.t + 9} amount={0.8 * k} y={1100} />
          <Embers t={p.T} amount={1} />
          <rect x={-300} y={-300} width={1680} height={2520} fill="#4a5a6a" opacity={0.25} style={{ mixBlendMode: 'color' }} />
        </Stage>
      );
    }
    const alive = mode === 'alive';
    return (
      <Stage pal={pal} bg={alive ? '#05070a' : pal.dirt}>
        {alive ? (
          <g>
            {/* scratched maps on the burrow wall */}
            <g stroke="#7a8a9a" strokeOpacity={0.35} strokeWidth={3} fill="none">
              <path d={smoothPath([[120, 520], [260, 600], [380, 560], [520, 680], [700, 640]])} />
              <path d={smoothPath([[260, 600], [300, 760], [420, 820]])} />
              <path d={smoothPath([[520, 680], [600, 800], [820, 860]])} />
              <circle cx={820} cy={860} r={26} /><path d="M800,840 L840,880 M840,840 L800,880" />
            </g>
            {/* fungus lamps */}
            {[[180, 1180], [880, 1120], [520, 1260]].map(([x, y], i) => (
              <g key={i}>
                <ellipse cx={x} cy={y} rx={300} ry={220} fill="url(#lightGlow)" opacity={1 + 0.15 * Math.sin(p.T * 2 + i)} style={{ mixBlendMode: 'screen' }} />
                <path d={`M${x - 18},${y} Q${x},${y - 34} ${x + 18},${y} Z`} fill="#9fe8d8" />
                <rect x={x - 3} y={y} width={6} height={18} fill="#4a6a6a" />
              </g>
            ))}
            <rect x={-300} y={1300} width={1680} height={900} fill="#03050a" />
            <Kael t={p.T} x={600} y={1300 - TJ_GROUND * sc} scale={sc} dir={-1} pitch={-0.05 + Math.sin(p.t * 0.8) * 0.04} />
            <ellipse cx={600} cy={1000} rx={480} ry={300} fill="url(#lightGlow)" opacity={0.6} style={{ mixBlendMode: 'screen' }} />
          </g>
        ) : (
          <g>
            <Glow x={540} y={900} r={760} t={p.t} amount={0.8} />
            <Kael t={p.T} x={540 - 40 * sc} y={1120} scale={sc} pitch={0.02} />
            <rect x={-300} y={-300} width={1680} height={2520} fill="#6a8aa8" opacity={0.18} style={{ mixBlendMode: 'color' }} />
            <ellipse cx={540} cy={960} rx={760} ry={1000} fill="none" stroke="#000" strokeOpacity={0.7} strokeWidth={500} />
          </g>
        )}
        <Fog t={p.t} amount={0.5} y={1100} spread={250} />
        <Dust t={p.t} count={50} seed={p.index + 861} color="#c8dcf0" speed={0.3} />
        <Dim p={p} />
      </Stage>
    );
  },
};

export const SCENES_S2: Record<string, SceneDef> = { throneRoom, coldTunnels, taviClose, kael };
void clamp; void hash2;
