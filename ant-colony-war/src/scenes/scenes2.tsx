// Shot types for episodes 2-7.
import React from 'react';
import { Ant } from '../art/Ant';
import { Dust, Embers, Fog, Shafts, Smoke } from '../art/Atmosphere';
import { floorAt, Foreground, smoothPath, Tunnel } from '../art/Earth';
import { AMBER, FIRE, GREEN, NIGHT, type Palette } from '../art/palette';
import { Grains } from '../art/Props';
import { H, W } from '../config';
import { mix } from '../lib/color';
import { clamp, ease, hash, hash2, lerp, range } from '../lib/random';
import { Deep, FIRE_GROUND, FloorWalkers, Glow, Hero, Stage, TJ_GROUND, wrap } from './scenes';
import type { SceneDef } from './types';

const DAWN: Palette = { ...AMBER, light: '#ffcf8a', rim: '#ffc890', fog: '#a87a58', grade: '#ffb070', cavity0: '#8a5a32', bg0: '#1a0f0a', bg1: '#3a2418' };

/** Pale pupae and curled larvae. */
const Brood: React.FC<{ x: number; y: number; t: number; seed: number; n: number; scale?: number }> = ({ x, y, t, seed, n, scale = 1 }) => (
  <g>
    {range(n).map((i) => {
      const h = hash2(i, seed), h2 = hash2(i, seed + 1);
      const px = x + (i - n / 2) * 70 * scale + h * 20, py = y - h2 * 30 * scale;
      const sway = Math.sin(t * 0.8 + i) * 2;
      const pupa = h > 0.4;
      return pupa ? (
        <g key={i} transform={`rotate(${(h2 - 0.5) * 30 + sway} ${px} ${py})`}>
          <ellipse cx={px} cy={py - 22 * scale} rx={20 * scale} ry={34 * scale} fill="#e8d6b4" opacity={0.92} />
          <ellipse cx={px - 6 * scale} cy={py - 34 * scale} rx={7 * scale} ry={12 * scale} fill="#fff4dc" opacity={0.6} />
          <path d={`M${px - 18 * scale},${py - 12 * scale} Q${px},${py - 6 * scale} ${px + 18 * scale},${py - 12 * scale}`} stroke="#b89a70" strokeWidth={2} fill="none" />
        </g>
      ) : (
        <g key={i}>
          <path d={`M${px - 18 * scale},${py} C${px - 26 * scale},${py - 30 * scale} ${px + 18 * scale},${py - 34 * scale} ${px + 16 * scale},${py - 8 * scale}`} stroke="#f0e2c4" strokeWidth={18 * scale} strokeLinecap="round" fill="none" opacity={0.9} />
          <circle cx={px + 16 * scale} cy={py - 8 * scale} r={4 * scale} fill="#8a6a40" />
        </g>
      );
    })}
  </g>
);

const nursery: SceneDef = {
  pal: () => AMBER,
  focus: () => [540, 1150],
  render: (p) => {
    const pal = AMBER, floor = 1300, camX = p.index * 300 + p.T * 6;
    const hatch = p.beat.options?.hatch;
    const k = ease(p.t / 2.2);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={201} />
        <Tunnel id="nu" pal={pal} camX={camX} t={p.t} ceil={640} floor={floor} seed={203} lights={2} solid={false} roughness={40} />
        <Glow x={540} y={1100} r={760} t={p.t} amount={0.9} ry={420} />
        <Brood x={540} y={floor - 4} t={p.T} seed={7} n={13} scale={1.1} />
        {[160, 900].map((x, i) => (
          <Ant key={i} species="trapjaw" t={p.T} x={x} y={floor - TJ_GROUND * 1.05 - 6} scale={1.05} dir={i ? -1 : 1} pitch={0.18 + Math.sin(p.T * 1.3 + i) * 0.05} fill={pal.antFill} rim={pal.rim} seed={30 + i} />
        ))}
        {hatch ? (
          <Ant species="trapjaw" t={p.T} x={470} y={floor - TJ_GROUND * 1.2 - 40 + (1 - k) * 30} scale={1.2} lie={1 - k} fill={mix('#6a4a2a', pal.antFill, k * 0.6)} rim="#ffe0b0" rimOpacity={0.9} seed={250} jaw={0.4 + 0.6 * k} eyeOpen={k} />
        ) : (
          <Hero {...p} x={wrap(p.t * 120, 1300) - 150} y={floor - TJ_GROUND * 1.1 - 50} scale={1.1} walk={1.1} pal={pal} />
        )}
        <Fog t={p.t} amount={0.5} y={1150} spread={200} />
        <Foreground pal={pal} camX={camX} t={p.t} side="top" />
        <Dust t={p.t} count={60} seed={p.index + 211} color={pal.dust} />
      </Stage>
    );
  },
};

/** A single-file line of identical ants; 250 is the one in the middle. */
const antLine: SceneDef = {
  pal: () => AMBER,
  focus: () => [540, 1150],
  render: (p) => {
    const pal = AMBER, floor = 1290, sp = 70, camX = p.index * 500 + p.T * sp;
    const carry = p.beat.options?.carry ? 'crumb' : undefined;
    const sc = 0.95, gap = 330;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={221} />
        <Tunnel id="al" pal={pal} camX={camX} t={p.t} ceil={720} floor={floor} seed={223} lights={2} solid={false} />
        {/* the scent trail they all follow */}
        <path d={smoothPath(range(30).map((i) => [i * 45 - 100, floorAt(i * 45 - 100, camX, floor, 223) - 4] as [number, number]))} stroke="#ffe0a0" strokeOpacity={0.35} strokeWidth={4} strokeDasharray="4 16" fill="none" />
        {range(7).map((i) => {
          const x = 540 + (i - 3) * gap + Math.sin(p.T * 0.7 + i) * 6;
          const y = floorAt(x, camX, floor, 223) - TJ_GROUND * sc + 4;
          return i === 3 ? (
            <Hero key={i} {...p} x={x - 100} y={y} scale={sc} walk={1.2} pal={pal} />
          ) : (
            <Ant key={i} species="trapjaw" t={p.T} x={x - 100} y={y} scale={sc} walk={1.2} fill={pal.antFill} rim={pal.rim} seed={i * 7} carry={carry as 'crumb' | undefined} />
          );
        })}
        {carry && <Hero {...p} x={440} y={floorAt(540, camX, floor, 223) - TJ_GROUND * sc + 4} scale={sc} walk={1.2} pal={pal} />}
        <Fog t={p.t} amount={0.45} y={1180} spread={160} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Dust t={p.t} count={60} seed={p.index + 231} color={pal.dust} />
      </Stage>
    );
  },
};

const rootWall: SceneDef = {
  pal: () => DAWN,
  focus: () => [540, 1150],
  render: (p) => {
    const pal = DAWN, floor = 1300;
    const roots = range(7).map((i) => {
      const x = 60 + i * 165 + hash(i + 5) * 40, w = 46 + hash(i + 9) * 50;
      const pts: [number, number][] = range(8).map((k) => [x + Math.sin(k * 0.9 + i) * 40 + Math.sin(p.T * 0.3 + i) * 3, -100 + k * 200]);
      return { d: smoothPath(pts), w, x };
    });
    const hx = lerp(-120, 560, ease(p.t / Math.max(2, p.dur)));
    return (
      <Stage pal={pal}>
        <rect x={-300} y={-300} width={W + 600} height={H + 600} fill="url(#bgGrad)" />
        <Glow x={620} y={760} r={900} t={p.t} amount={1.3} ry={800} />
        <Shafts t={p.t} x={600} amount={0.9} angle={-12} />
        {roots.map((r, i) => (
          <g key={i} opacity={i % 2 ? 0.55 : 1}>
            <path d={r.d} stroke={i % 2 ? mix(pal.dirt, pal.fog, 0.4) : pal.dirt} strokeWidth={r.w} strokeLinecap="round" fill="none" />
            {i % 2 === 0 && <path d={r.d} stroke={pal.rim} strokeOpacity={0.3} strokeWidth={3} fill="none" transform={`translate(${-r.w / 2 + 2},0)`} />}
          </g>
        ))}
        <rect x={-300} y={floor} width={W + 600} height={900} fill={pal.dirt} />
        <Grains seed={41} n={30} x0={-60} x1={1140} y0={floor - 10} y1={floor + 50} rMin={8} rMax={26} fill={mix(pal.dirt, pal.strata, 0.4)} rim={pal.rim} rimOpacity={0.5} />
        <Hero {...p} x={hx} y={floor - TJ_GROUND * 1.3 + 2} scale={1.3} walk={1.1} pal={pal} />
        <Fog t={p.t} amount={0.7} y={1150} spread={300} />
        <Dust t={p.t} count={80} seed={p.index + 241} color={pal.dust} />
      </Stage>
    );
  },
};

const fall: SceneDef = {
  pal: () => GREEN,
  focus: () => [540, 1000],
  render: (p) => {
    const pal = { ...AMBER, fog: '#2a6a3a' };
    const floor = 1300, sc = 2.0;
    const k = ease(p.t / Math.max(1.6, p.dur * 0.8));
    const ang = -k * 160;
    const y = lerp(1000, floor - 50, k * k);
    const hit = clamp((p.t - p.dur * 0.8) / 0.6);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="fa" pal={pal} camX={p.index * 300} t={p.t} ceil={600} floor={floor} seed={251} lights={1} solid={false} />
        <ellipse cx={540} cy={1000} rx={520} ry={400} fill="url(#glintGlow)" opacity={0.4} style={{ mixBlendMode: 'screen' }} />
        <g transform={`rotate(${ang} 540 ${y})`}>
          <Ant species="trapjaw" t={p.T} x={540 - 10 * sc} y={y} scale={sc} infection={Math.max(0.6, p.inf)} glowId="veinGlow" fill={pal.antFill} rim="#9dffb0" seed={250} jaw={0.6} eyeOpen={1 - k * 0.7} walk={0.4} />
        </g>
        {hit > 0 && range(16).map((i) => {
          const a = Math.PI + (i / 15) * Math.PI;
          return <circle key={i} cx={540 + Math.cos(a) * hit * (120 + hash(i) * 120)} cy={floor - 10 + Math.sin(a) * hit * (40 + hash(i + 3) * 60)} r={6 + hash(i + 7) * 10} fill="#3a2a1a" opacity={(1 - hit) * 0.8} />;
        })}
        <Dust t={p.t} count={60} seed={p.index + 251} color="#c8ffd2" speed={0.3} />
      </Stage>
    );
  },
};

/** Looking up at the sky from the ground (grass towering overhead). `watch`: night sky with one green star. */
const sky: SceneDef = {
  pal: () => NIGHT,
  focus: () => [540, 700],
  render: (p) => {
    const watch = !!p.beat.options?.watch;
    const fade = p.beat.options?.closing ? ease((p.t - p.dur * 0.4) / (p.dur * 0.6)) : 0;
    const blades = range(14).map((i) => {
      const h = hash(i + 61), left = i % 2 === 0;
      const bx = left ? -80 + h * 380 : 760 + h * 400, w = 50 + h * 70;
      const tipX = 540 + (h - 0.5) * 500 + Math.sin(p.T * 0.6 + i) * 20, tipY = 120 + h * 500;
      return `M${bx - w},${H + 100} Q${(bx + tipX) / 2 - w * 0.3},${(H + tipY) / 2} ${tipX},${tipY} Q${(bx + tipX) / 2 + w * 0.5},${(H + tipY) / 2} ${bx + w},${H + 100} Z`;
    });
    return (
      <Stage pal={NIGHT}>
        <defs>
          <linearGradient id="skyUp" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={watch ? '#02040c' : '#1c3a5e'} />
            <stop offset="0.6" stopColor={watch ? '#081528' : '#e8a070'} />
            <stop offset="1" stopColor={watch ? '#1a2a3a' : '#ffcf8a'} />
          </linearGradient>
        </defs>
        <rect x={-300} y={-300} width={W + 600} height={H + 600} fill="url(#skyUp)" />
        {range(watch ? 90 : 0).map((i) => <circle key={i} cx={hash2(i, 1) * W} cy={hash2(i, 2) * 1300} r={0.8 + hash2(i, 3) * 2} fill="#e8f0ff" opacity={0.3 + 0.6 * Math.abs(Math.sin(p.T * (0.5 + hash2(i, 4)) + i))} />)}
        {watch && (
          <g>
            <circle cx={560} cy={520} r={90 + 20 * Math.sin(p.T * 1.5)} fill="url(#glintGlow)" opacity={0.8} />
            <circle cx={560} cy={520} r={6} fill="#d8ffe0" />
          </g>
        )}
        {!watch && range(4).map((i) => <ellipse key={i} cx={wrap(hash(i + 3) * 1600 + p.T * 15, 1600) - 260} cy={280 + i * 120} rx={300} ry={40} fill="#fff1e0" opacity={0.25} />)}
        {blades.map((d, i) => <path key={i} d={d} fill={i % 3 ? '#050608' : '#0b0e14'} />)}
        <rect x={-300} y={-300} width={W + 600} height={H * 0.5 * fade + 300} fill="#000" />
        <rect x={-300} y={H - H * 0.5 * fade} width={W + 600} height={H} fill="#000" />
        <Dust t={p.t} count={50} seed={p.index + 261} color="#e8f0ff" speed={0.3} />
      </Stage>
    );
  },
};

/** The waste chamber: a heap of dead ants. options.action: 'dump' | 'climb'. */
const wasteChamber: SceneDef = {
  pal: () => ({ ...AMBER, light: '#c89a6a', rim: '#d0a070', grade: '#a08060' }),
  focus: () => [540, 1100],
  render: (p) => {
    const pal = wasteChamber.pal(p), floor = 1320;
    const action = p.beat.options?.action;
    const pile = range(26).map((i) => {
      const h1 = hash2(i, 71), h2 = hash2(i, 72);
      const row = Math.floor(i / 8);
      const x = 540 + (h1 - 0.5) * (560 - row * 140), y = floor - row * 50 - h2 * 20;
      return { x, y, rot: (h2 - 0.5) * 70, sc: 0.75 + h1 * 0.3, dir: (h1 > 0.5 ? 1 : -1) as 1 | -1 };
    });
    const climbK = ease(p.t / Math.max(2, p.dur * 0.8));
    const carryX = lerp(1250, 760, ease(p.t / Math.max(2, p.dur)));
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="wc" pal={pal} camX={p.index * 300} t={p.t} ceil={520} floor={floor} seed={271} lights={1} solid={false} roughness={50} />
        <Glow x={540} y={900} r={720} t={p.t} amount={0.7} ry={520} />
        {pile.map((b, i) => (
          <g key={i} transform={`rotate(${b.rot} ${b.x} ${b.y})`}>
            <Ant species="trapjaw" t={0} x={b.x} y={b.y - 20} scale={b.sc} dir={b.dir} flip lie={1} eyeOpen={0} fill={mix(pal.antFill, '#2a1e14', 0.3)} rim={pal.rim} rimOpacity={0.45} seed={i} lod={1} />
          </g>
        ))}
        {action === 'under' && (
          <g>
            <Ant species="trapjaw" t={p.T} x={480} y={floor - 110} scale={1.3} lie={1} eyeOpen={ease(p.t / 2)} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim="#ffc890" seed={250} jaw={0.8} />
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`rotate(${170 + i * 12} ${400 + i * 120} ${floor - 150 - i * 10})`}>
                <Ant species="trapjaw" t={0} x={400 + i * 120} y={floor - 150 - i * 10} scale={1.0} lie={1} eyeOpen={0} fill={mix(pal.antFill, '#2a1e14', 0.3)} rim={pal.rim} rimOpacity={0.45} seed={i + 90} lod={1} />
              </g>
            ))}
          </g>
        )}
        {action === 'climb' && (
          <Ant species="trapjaw" t={p.T} x={500} y={lerp(floor - 120, floor - 230, climbK)} scale={1.3} lie={1 - climbK} pitch={-0.15} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim="#ffc890" seed={250} jaw={p.jaw} walk={0.5} />
        )}
        {action === 'dump' && (
          <g>
            <Ant species="trapjaw" t={p.T} x={carryX} y={floor - TJ_GROUND * 1.2 - 140} scale={1.2} dir={-1} walk={1} fill={pal.antFill} rim={pal.rim} seed={5} />
            <g transform={`rotate(${Math.sin(p.T * 4) * 4} ${carryX - 160} ${floor - 300})`}>
              <Ant species="trapjaw" t={0} x={carryX - 150} y={floor - 290} scale={1.0} flip lie={1} eyeOpen={0} fill={mix(pal.antFill, '#2a1e14', 0.3)} rim={pal.rim} rimOpacity={0.5} seed={8} />
            </g>
          </g>
        )}
        <Fog t={p.t} amount={0.5} y={1150} spread={200} />
        <Dust t={p.t} count={70} seed={p.index + 271} color={pal.dust} speed={0.3} />
      </Stage>
    );
  },
};

/** A grain of sand falling in slow motion. options.catch: 250 catches it in his jaws. */
const sandGrain: SceneDef = {
  pal: () => AMBER,
  focus: () => [600, 1050],
  render: (p) => {
    const pal = AMBER, floor = 1300, sc = 2.2;
    const catchIt = !!p.beat.options?.catch;
    const caught = catchIt && p.t > 0.9;
    const fallK = catchIt ? clamp(p.t / 0.9) : clamp(p.t / Math.max(2, p.dur * 1.4));
    const gx = catchIt ? lerp(640, 330 + 170 * sc, fallK) : 600, gy = catchIt ? lerp(600, 1010, fallK) : lerp(640, 1180, fallK);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="sg" pal={pal} camX={p.index * 400} t={p.t} ceil={600} floor={floor} seed={281} lights={1} solid={false} />
        <Glow x={600} y={900} r={700} t={p.t} amount={0.9} />
        {!caught && (
          <g>
            <line x1={gx} y1={gy - 140} x2={gx} y2={gy - 10} stroke="#ffe0b0" strokeOpacity={0.25} strokeWidth={10} strokeLinecap="round" />
            <circle cx={gx} cy={gy} r={18} fill="#cfb48a" />
            <circle cx={gx - 5} cy={gy - 6} r={6} fill="#fff1d0" opacity={0.7} />
          </g>
        )}
        <Ant species="trapjaw" t={p.T} x={330} y={floor - TJ_GROUND * sc + 4} scale={sc} pitch={catchIt ? -0.12 : -0.25} jaw={caught ? 0.05 : p.jaw} carry={caught ? 'grain' : undefined} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} seed={250} />
        <Dust t={p.t} count={60} seed={p.index + 281} color={pal.dust} speed={0.25} />
      </Stage>
    );
  },
};

/** The twig. options.who: 'four' (four soldiers straining) | 'alone' (250 snaps it; it breaks on the {snap}). */
const twig: SceneDef = {
  pal: () => AMBER,
  focus: () => [540 + 40, 1110],
  render: (p) => {
    const pal = AMBER, floor = 1300;
    const alone = p.beat.options?.who === 'alone';
    const broken = alone && p.sinceSnap < 50 ? ease(p.sinceSnap / 0.6) : 0;
    const ty = 1150;
    const half = (side: -1 | 1) => {
      const a = side * broken * 28, dx = side * broken * 120, dy = broken * 60;
      return (
        <g transform={`translate(${dx} ${dy}) rotate(${a} 540 ${ty})`}>
          <path d={side < 0 ? `M60,${ty - 30} L540,${ty - 6} L540,${ty + 22} L60,${ty + 6} Z` : `M540,${ty - 6} L1020,${ty - 40} L1020,${ty - 8} L540,${ty + 22} Z`} fill="#2a1a0c" />
          <path d={side < 0 ? `M60,${ty - 30} L540,${ty - 6}` : `M540,${ty - 6} L1020,${ty - 40}`} stroke={pal.rim} strokeOpacity={0.6} strokeWidth={4} />
        </g>
      );
    };
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={p.T * 10} t={p.t} T={p.T} seed={291} />
        <Tunnel id="tw" pal={pal} camX={p.index * 300} t={p.t} ceil={620} floor={floor} seed={293} lights={1} solid={false} />
        <Glow x={540} y={980} r={720} t={p.t} amount={0.9} />
        {half(-1)}
        {half(1)}
        {broken > 0 && broken < 1 && range(14).map((i) => <circle key={i} cx={540 + (hash(i) - 0.5) * 200 * broken} cy={ty - 40 * broken + hash(i + 5) * 60} r={3 + hash(i + 9) * 5} fill="#c8a272" opacity={1 - broken} />)}
        {alone ? (
          <Hero {...p} x={540 - 230 * 1.7} y={floor - TJ_GROUND * 1.7 - 40} scale={1.7} pal={pal} pitch={0.1} />
        ) : (
          [140, 380, 700, 940].map((x, i) => (
            <Ant key={i} species="trapjaw" t={p.T} x={x - (i < 2 ? 160 : -160)} y={floor - TJ_GROUND * 1.3 - 30} scale={1.3} dir={i < 2 ? 1 : -1} jaw={0.1} pitch={0.12 + Math.sin(p.T * 9 + i) * 0.04} walk={0.25} fill={pal.antFill} rim={pal.rim} seed={i + 40} />
          ))
        )}
        <Fog t={p.t} amount={0.4} y={1200} spread={150} />
        <Dust t={p.t} count={60} seed={p.index + 291} color={pal.dust} />
      </Stage>
    );
  },
};

/** A fire-ant scout hiding in a crack in the wall, watching trap-jaws pass. */
const scout: SceneDef = {
  pal: () => AMBER,
  focus: () => [700, 840],
  render: (p) => {
    const pal = AMBER, floor = 1300, camX = p.index * 300 + p.T * 4;
    const look = Math.sin(p.T * 0.9) * 0.15;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="sc" pal={pal} camX={camX} t={p.t} ceil={960} floor={floor} seed={301} lights={2} solid={false} />
        <Glow x={700} y={820} r={520} t={p.t} amount={0.55} ry={300} />
        <FloorWalkers t={p.T} camX={camX} floor={floor} seed={303} n={6} scale={0.95} pal={pal} both tseed={301} lod={1} />
        {/* the crack */}
        <path d="M470,700 C560,640 800,650 920,720 C980,770 930,880 820,920 C700,960 560,950 490,900 C430,850 420,760 470,700 Z" fill="#020101" />
        <path d="M470,700 C560,640 800,650 920,720" stroke="#ffb066" strokeOpacity={0.35} strokeWidth={3} fill="none" />
        <ellipse cx={700} cy={820} rx={240} ry={150} fill="url(#emberGlow)" opacity={0.35} style={{ mixBlendMode: 'screen' }} />
        <g transform={`rotate(${look * 57} 720 840)`}>
          <Ant species="fire" t={p.T} x={800} y={850} scale={1.8} dir={-1} pitch={0.25} fill="#120302" rim="#ff7a2e" rimOpacity={0.9} seed={77} />
          <circle cx={800 - 86 * 1.8} cy={850 - 28 * 1.8 + 8} r={22} fill="url(#emberGlow)" opacity={0.9} style={{ mixBlendMode: 'screen' }} />
        </g>
        <Fog t={p.t} amount={0.4} y={1150} spread={150} />
        <Dust t={p.t} count={60} seed={p.index + 301} color={pal.dust} />
      </Stage>
    );
  },
};

/** Rows on rows of fire ants, all facing our way. */
const ranks: SceneDef = {
  pal: () => FIRE,
  focus: () => [540, 1000],
  render: (p) => {
    const pal = FIRE;
    const rows = [
      { y: 720, sc: 0.42, n: 12, haze: 0.7 },
      { y: 860, sc: 0.62, n: 9, haze: 0.5 },
      { y: 1040, sc: 0.88, n: 6, haze: 0.3 },
      { y: 1290, sc: 1.25, n: 4, haze: 0 },
    ];
    return (
      <Stage pal={pal}>
        <Glow x={760} y={700} r={1000} t={p.T} amount={1.2} ry={500} />
        <Smoke t={p.t} amount={0.6} y={600} />
        {rows.map((r, ri) => (
          <g key={ri}>
            {range(r.n).map((i) => {
              const x = 40 + (i + (ri % 2) * 0.5) * (1060 / r.n);
              const fx = x + 86 * r.sc * -1;
              return (
                <g key={i}>
                  <Ant species="fire" t={p.T} x={x + 80 * r.sc} y={r.y - FIRE_GROUND * r.sc} scale={r.sc} dir={-1} pitch={p.beat.options?.bow ? 0.35 * ease(p.t / 1.5) : 0} fill={mix('#160402', pal.fog, r.haze * 0.6)} rim="#ff7a2e" rimOpacity={0.8 - r.haze * 0.6} seed={i + ri * 20} lod={ri < 2 ? 2 : 1} />
                  <circle cx={fx + 80 * r.sc} cy={r.y - FIRE_GROUND * r.sc - 28 * r.sc} r={5 * r.sc + 2} fill="#ffb050" opacity={0.5 + 0.4 * Math.sin(p.T * 2 + i + ri)} />
                </g>
              );
            })}
          </g>
        ))}
        <Embers t={p.T} amount={0.6} />
        <Fog t={p.t} amount={0.5} y={900} spread={400} />
      </Stage>
    );
  },
};

/** 250 running flat out. options.shout: sound waves pour out of him. */
const run: SceneDef = {
  pal: (p) => (p.beat.options?.night ? NIGHT : AMBER),
  focus: () => [600, 1150],
  render: (p) => {
    const pal = run.pal(p), floor = 1300, camX = p.index * 900 + p.T * (p.beat.options?.shout ? 120 : 420), sc = 1.6;
    const hx = 460, hy = floorAt(hx, camX, floor, 311) - TJ_GROUND * sc + 4;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={313} />
        <Tunnel id="ru" pal={pal} camX={camX} t={p.t} ceil={720} floor={floor} seed={311} lights={2} solid={false} />
        {!p.beat.options?.shout && range(18).map((i) => {
          const y = 760 + hash(i) * 520, x = wrap(hash(i + 9) * 1400 - p.T * 2400, 1400) - 160;
          return <line key={i} x1={x} y1={y} x2={x + 160 + hash(i + 4) * 200} y2={y} stroke={pal.dust} strokeOpacity={0.25} strokeWidth={2 + hash(i) * 3} strokeLinecap="round" />;
        })}
        {p.beat.options?.shout && range(4).map((k) => {
          const u = wrap(p.t / 1.2 + k / 4, 1);
          return <circle key={k} cx={hx + 130 * sc} cy={hy - 30} r={40 + u * 700} fill="none" stroke="#fff1d0" strokeOpacity={(1 - u) * 0.5} strokeWidth={3 + (1 - u) * 6} />;
        })}
        <Hero {...p} x={hx} y={hy} scale={sc} walk={p.beat.options?.shout ? 1.4 : 3.2} pal={pal} pitch={p.beat.options?.shout ? -0.15 : 0.05} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Dust t={p.t} camX={camX} count={60} seed={p.index + 311} color={pal.dust} />
      </Stage>
    );
  },
};

/** A soldier shoves 250 into the dirt on the {impact}. */
const shove: SceneDef = {
  pal: () => AMBER,
  focus: () => [430, 1150],
  render: (p) => {
    const pal = AMBER, floor = 1300;
    const k = p.sinceImpact < 50 ? ease(p.sinceImpact / 0.5) : 0;
    const hx = 420 - k * 120;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="sh" pal={pal} camX={p.index * 300} t={p.t} ceil={640} floor={floor} seed={321} lights={1} solid={false} />
        <Glow x={620} y={1000} r={700} t={p.t} amount={0.9} />
        <Ant species="trapjaw" t={p.T} x={hx} y={floor - TJ_GROUND * 1.5 + 4} scale={1.5} lie={k} pitch={k * 0.2} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} seed={250} jaw={p.jaw} />
        <Ant species="trapjaw" t={p.T} x={860 - k * 60} y={floor - TJ_GROUND * 2.1 + 4} scale={2.1} dir={-1} pitch={-0.08 + k * 0.1} fill="#0a0503" rim="#ffc27a" seed={12} walk={k > 0 && k < 1 ? 0.6 : 0} />
        {k > 0 && k < 1 && range(16).map((i) => <circle key={i} cx={hx + (hash(i) - 0.3) * 300 * k} cy={floor - hash(i + 3) * 120 * k} r={4 + hash(i + 5) * 9} fill="#3a2614" opacity={1 - k} />)}
        <Fog t={p.t} amount={0.4} y={1200} spread={150} />
        <Dust t={p.t} count={60} seed={p.index + 321} color={pal.dust} />
      </Stage>
    );
  },
};

/** The trap-jaw queen dragged away in chains by fire ants; 250 watches in the foreground. */
const chains: SceneDef = {
  pal: () => FIRE,
  focus: () => [600, 1000],
  render: (p) => {
    const pal = FIRE, floor = 1300;
    const drag = p.T * 30 % 300;
    const qx = 560 + drag * 0.2, qy = floor - TJ_GROUND * 1.5 + 4;
    const pullers = [0, 1, 2].map((i) => ({ x: 860 + i * 70 + drag * 0.2, y: floor - 40 * 0.8 - i * 26 }));
    const chain = (x1: number, y1: number, x2: number, y2: number, k: number) =>
      range(14).map((i) => {
        const u = i / 13, x = lerp(x1, x2, u), y = lerp(y1, y2, u) + Math.sin(u * Math.PI) * 26;
        return <ellipse key={k + '-' + i} cx={x} cy={y} rx={9} ry={5} fill="none" stroke="#b8a08a" strokeWidth={3} transform={`rotate(${i % 2 ? 0 : 90} ${x} ${y})`} opacity={0.85} />;
      });
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="ch" pal={pal} camX={p.index * 300} t={p.t} ceil={600} floor={floor} seed={331} lights={1} solid={false} />
        <Glow x={780} y={950} r={800} t={p.T} amount={1.2} />
        <Smoke t={p.t} amount={0.6} y={700} />
        <Ant species="tjqueen" t={p.T * 0.4} x={qx} y={qy} scale={1.5} walk={0.25} pitch={0.22} fill="#0d0603" rim="#ffc27a" seed={3} />
        {pullers.map((f, i) => (
          <g key={i}>
            {chain(qx + 130 * 1.5, qy - 20, f.x - 100 * 0.8, f.y - 10, i)}
            <Ant species="fire" t={p.T} x={f.x} y={f.y} scale={0.8} walk={1.2} pitch={0.1} fill="#1a0502" rim="#ff7a2e" seed={i + 60} />
          </g>
        ))}
        <Ant species="trapjaw" t={p.T} x={-40} y={1420} scale={3.2} pitch={-0.05} infection={p.inf} glowId="veinGlow" fill="#030201" rim="#ff9a50" rimOpacity={0.7} seed={250} jaw={p.jaw} />
        <Embers t={p.T} amount={0.8} />
      </Stage>
    );
  },
};

export const SCENES2: Record<string, SceneDef> = { nursery, antLine, rootWall, fall, sky, wasteChamber, sandGrain, twig, scout, ranks, run, shove, chains };
