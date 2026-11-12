// Shot types for episodes 9-10.
import React from 'react';
import { Ant } from '../art/Ant';
import { Dust, Embers, Fog, Smoke } from '../art/Atmosphere';
import { Tunnel } from '../art/Earth';
import { AMBER, FIRE, type Palette } from '../art/palette';
import { mix } from '../lib/color';
import { ease, hash, lerp, range } from '../lib/random';
import { COLD, Deep, FIRE_GROUND, FloorWalkers, Glow, Hero, Stage, TJ_GROUND, wrap } from './scenes';
import { floorAt, Foreground } from '../art/Earth';
import type { SceneDef } from './types';

const SLAVE: Palette = { ...COLD, rim: '#c8a890', light: '#d0a070', grade: '#8a7060', cavity0: '#3a3028', cavity1: '#12100c' };
const OLD_FILL = '#2a241e', OLD_RIM = '#d8c8b0';

const chainLinks = (x1: number, y1: number, x2: number, y2: number, key: string) =>
  range(10).map((i) => {
    const u = i / 9, x = lerp(x1, x2, u), y = lerp(y1, y2, u) + Math.sin(u * Math.PI) * 14;
    return <ellipse key={key + i} cx={x} cy={y} rx={7} ry={4} fill="none" stroke="#a8988a" strokeWidth={2.5} opacity={0.8} transform={`rotate(${i % 2 ? 0 : 90} ${x} ${y})`} />;
  });

/**
 * The line of chained trap-jaw workers in the cold chamber.
 * options.walker: 'kesh' (Kesh walks the line and stops at the old worker) | 'none'
 * options.focus: 'old' (close on the old worker who used to feed 250)
 */
const lineup: SceneDef = {
  pal: () => SLAVE,
  focus: () => [540, 1100],
  render: (p) => {
    const pal = SLAVE, floor = 1300;
    const focusOld = p.beat.options?.focus === 'old';
    const walker = p.beat.options?.walker ?? 'none';
    const sc = focusOld ? 2.6 : 0.9;
    const n = focusOld ? 3 : 8;
    const gap = focusOld ? 720 : 150;
    const oldIdx = focusOld ? 1 : 4;
    const kx = lerp(1250, 160 + oldIdx * gap + 140, ease(p.t / Math.max(2, p.dur * 0.75)));
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="ln" pal={pal} camX={p.index * 200} t={p.t} ceil={620} floor={floor} seed={401} lights={1} solid={false} roughness={40} />
        <Glow x={540} y={900} r={760} t={p.t} amount={0.6} />
        {/* rain dripping in from the surface */}
        {range(16).map((i) => {
          const h = hash(i + 410), fall = wrap(p.T * 1.2 + h * 3, 3) / 3;
          return <line key={'r' + i} x1={h * 1080} y1={640 + fall * 600} x2={h * 1080} y2={660 + fall * 600} stroke="#bcd3e6" strokeOpacity={0.4} strokeWidth={2} />;
        })}
        {range(n).map((i) => {
          const x = (focusOld ? -560 : 60) + i * gap;
          const old = i === oldIdx;
          const y = floor - TJ_GROUND * sc + 4;
          return (
            <g key={i}>
              {i < n - 1 && chainLinks(x + 120 * sc, y + 10 * sc, x + gap - 90 * sc, y + 4 * sc, 'c' + i)}
              <Ant species="trapjaw" t={p.T} x={x} y={y} scale={sc} pitch={0.28 + Math.sin(p.T + i) * 0.02} fill={old ? OLD_FILL : pal.antFill} rim={old ? OLD_RIM : pal.rim} rimOpacity={old ? 0.9 : 0.6} seed={i + 400} lod={focusOld ? 0 : 1} />
            </g>
          );
        })}
        {walker === 'kesh' && <Ant species="kesh" t={p.T} x={kx} y={floor - 220 - FIRE_GROUND * 1.3} scale={1.3} dir={-1} walk={p.t < p.dur * 0.75 ? 0.9 : 0} fill="#1a0402" rim="#ff8a3a" seed={17} oneAntenna={p.keshScarred} />}
        <Fog t={p.t} amount={0.5} y={1150} spread={200} />
        <Dust t={p.t} count={60} seed={p.index + 401} color={pal.dust} speed={0.3} />
      </Stage>
    );
  },
};

/**
 * Kesh over the old worker. options.phase: 'raise' (stinger up, 250 lunges) | 'fallen' (Kesh dead, the chamber silent)
 */
const execution: SceneDef = {
  pal: () => FIRE,
  focus: () => [640, 1080],
  render: (p) => {
    const pal = FIRE, floor = 1300;
    const fallen = p.beat.options?.phase === 'fallen';
    const rear = fallen ? 0 : ease(p.t / 1.2);
    const lunge = fallen ? 0 : ease((p.t - p.dur * 0.55) / 0.35);
    const kx = 760, ky = floor - FIRE_GROUND * 2.2 + 4;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={p.T * 6} t={p.t} T={p.T} seed={421} species="fire" />
        <Tunnel id="ex" pal={pal} camX={p.index * 200} t={p.t} ceil={600} floor={floor} seed={423} lights={1} solid={false} />
        <Glow x={640} y={1000} r={760} t={p.T} amount={fallen ? 0.6 : 1.1} />
        {/* the onlookers */}
        {range(14).map((i) => (
          <Ant key={i} species="fire" t={fallen ? 0 : p.T} x={40 + i * 76} y={floor - 240 - hash(i + 3) * 40} scale={0.34} dir={i < 7 ? 1 : -1} fill={mix('#160402', pal.fog, 0.4)} rim="#ff7a2e" rimOpacity={0.4} seed={i} lod={2} />
        ))}
        <Ant species="trapjaw" t={p.T} x={430} y={floor - TJ_GROUND * 1.3 + 8} scale={1.3} lie={0.5} pitch={0.35} fill={OLD_FILL} rim={OLD_RIM} seed={404} />
        {fallen ? (
          <Ant species="kesh" t={0} x={kx} y={floor - 30} scale={2.2} dir={-1} flip lie={1} eyeOpen={0} fill="#140302" rim="#ff8a3a" rimOpacity={0.6} seed={17} oneAntenna={p.keshScarred} />
        ) : (
          <g transform={`rotate(${-rear * 22} ${kx + 40} ${floor})`}>
            <Ant species="kesh" t={p.T} x={kx} y={ky} scale={2.2} dir={-1} fill="#1a0402" rim="#ff8a3a" seed={17} oneAntenna={p.keshScarred} pitch={0.1} />
            <path d={`M${kx + 130 * 2.2},${ky - 20} q60,-120 -10,-${120 + rear * 60}`} stroke="#1a0402" strokeWidth={14} fill="none" strokeLinecap="round" />
            <path d={`M${kx + 130 * 2.2},${ky - 20} q60,-120 -10,-${120 + rear * 60}`} stroke="#ff8a3a" strokeOpacity={0.6} strokeWidth={3} fill="none" transform="translate(-3,-3)" />
          </g>
        )}
        {!fallen && (
          <g>
            {lunge > 0 && lunge < 1 && range(8).map((i) => <line key={i} x1={lerp(60, 380, lunge) - 200} y1={1180 + i * 12} x2={lerp(60, 380, lunge) + 40} y2={1180 + i * 12} stroke="#c8ffd2" strokeOpacity={0.35 * (1 - lunge)} strokeWidth={3} />)}
            <Ant species="trapjaw" t={p.T} x={lerp(-60, 330, lunge)} y={floor - TJ_GROUND * 1.5 - 40 - Math.sin(lunge * Math.PI) * 80} scale={1.5} walk={lunge > 0 && lunge < 1 ? 3 : 0} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim="#ffb066" seed={250} jaw={p.jaw} armor={p.armor} />
          </g>
        )}
        <Smoke t={p.t} amount={0.5} y={800} />
        <Embers t={p.T} amount={fallen ? 0.2 : 0.6} />
        <Dust t={p.t} count={50} seed={p.index + 421} color={pal.dust} speed={fallen ? 0.15 : 0.4} />
      </Stage>
    );
  },
};

/** Night: twenty assassins creep through the tunnel toward 250, who lies still. */
const assassins: SceneDef = {
  pal: () => ({ ...FIRE, light: '#a03010', cavity0: '#3a0e06', grade: '#a02a10' }),
  focus: () => [300, 1150],
  render: (p) => {
    const pal = assassins.pal(p), floor = 1300;
    const creep = ease(p.t / Math.max(2, p.dur));
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Tunnel id="as" pal={pal} camX={p.index * 200} t={p.t} ceil={700} floor={floor} seed={441} lights={1} solid={false} flicker={0.3} />
        <Glow x={300} y={1150} r={420} t={p.t} amount={0.35} />
        <Ant species="trapjaw" t={p.T} x={230} y={floor - TJ_GROUND * 1.4 + 4} scale={1.4} lie={0.85} eyeOpen={0.15} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim="#ff9a60" rimOpacity={0.5} seed={250} armor={p.armor} />
        {range(9).map((i) => {
          const row = i % 3;
          const x = lerp(1180, 620, creep) + Math.floor(i / 3) * 170 + row * 40;
          const sc = 0.75 - row * 0.12;
          return (
            <g key={i}>
              <Ant species="fire" t={p.T * 0.6} x={x} y={floor - row * 40 - FIRE_GROUND * sc} scale={sc} dir={-1} walk={0.7} pitch={0.12} fill="#0c0201" rim="#ff5a2a" rimOpacity={0.5} seed={i + 440} lod={1} />
              <circle cx={x - 86 * sc} cy={floor - row * 40 - FIRE_GROUND * sc - 28 * sc} r={4 + sc * 4} fill="#ff7a3a" opacity={0.8} />
            </g>
          );
        })}
        <rect x={-300} y={-300} width={1680} height={2520} fill="#000" opacity={0.25} />
        <Dust t={p.t} count={40} seed={p.index + 441} color="#ffb070" speed={0.2} />
      </Stage>
    );
  },
};

/**
 * The royal chamber. options.phase: 'walkIn' (250 walks in alone, covered in red) | 'confront' (face to face) | 'claim' (250 lit, the queen lowered)
 */
const royalChamber: SceneDef = {
  pal: () => ({ ...FIRE, grade: '#ff2a00' }),
  focus: () => [420, 1100],
  render: (p) => {
    const pal = royalChamber.pal(p), floor = 1300;
    const phase = p.beat.options?.phase ?? 'walkIn';
    const hx = phase === 'walkIn' ? lerp(-150, 260, ease(p.t / Math.max(2, p.dur))) : 330;
    const qBow = phase === 'claim' ? ease(p.t / 2) : 0;
    return (
      <Stage pal={pal} bg="#050101">
        <ellipse cx={540} cy={1360} rx={900} ry={300} fill="url(#lightGlow)" opacity={0.45 + 0.08 * Math.sin(p.T * 5)} />
        <Smoke t={p.t} amount={0.8} y={700} />
        <Ant species="queen" t={p.T * 0.3} x={900} y={1150 + qBow * 40} scale={3} dir={-1} pitch={0.1 + qBow * 0.25} fill="#060101" rim="#ff4a1a" rimOpacity={0.5} seed={99} />
        <circle cx={900 - 86 * 3} cy={1150 + qBow * 40 - 28 * 3} r={22} fill="url(#emberGlow)" opacity={0.6} style={{ mixBlendMode: 'screen' }} />
        {phase === 'claim' && <ellipse cx={hx + 150} cy={floor - 60} rx={460} ry={300} fill="url(#glintGlow)" opacity={0.35} style={{ mixBlendMode: 'screen' }} />}
        <Ant species="trapjaw" t={p.T} x={hx} y={floor - TJ_GROUND * 1.6 + 4} scale={1.6} walk={phase === 'walkIn' ? 0.9 : 0} infection={p.inf} glowId="veinGlow" fill="#2a0503" rim="#ff5a3a" seed={250} jaw={p.jaw} armor={p.armor} pitch={phase === 'claim' ? -0.06 : 0} />
        <ellipse cx={540} cy={500} rx={800} ry={600} fill="url(#darkPool)" opacity={0.6} />
        <Embers t={p.T} amount={0.3} />
      </Stage>
    );
  },
};

/** 250 lying in the dirt, all six legs suddenly kicking too fast. */
const legs: SceneDef = {
  pal: () => AMBER,
  focus: () => [540, 1100],
  render: (p) => {
    const pal = AMBER, ground = 1260, sc = 3.4;
    const kick = 0.6 + 0.4 * Math.sin(p.T * 3);
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <rect x={-300} y={-300} width={1680} height={ground + 300} fill="url(#bgGrad)" />
        <Glow x={560} y={860} r={900} t={p.t} amount={1.1} ry={600} />
        <rect x={-300} y={ground} width={1680} height={900} fill={pal.dirt} />
        <g transform={`translate(${Math.sin(p.T * 40) * 2 * kick} 0)`}>
          <Ant species="trapjaw" t={p.T} x={540 - 20 * sc} y={ground - TJ_GROUND * sc} scale={sc} lie={0.55} walk={4.5 * kick} eyeOpen={0.6} infection={p.inf} glowId="veinGlow" fill={pal.antFill} rim={pal.rim} seed={250} jaw={0.8} />
        </g>
        {range(18).map((i) => {
          const age = wrap(p.T * 2 + hash(i) * 3, 1);
          return <circle key={i} cx={260 + hash(i + 4) * 560} cy={ground - age * 160} r={3 + hash(i + 8) * 6} fill="#5a3a1c" opacity={1 - age} />;
        })}
        <Dust t={p.t} count={50} seed={p.index + 501} color={pal.dust} />
      </Stage>
    );
  },
};

/** The trap-jaw queen in her chamber: the first-born at her side, grooming her. */
const colonyQueen: SceneDef = {
  pal: () => AMBER,
  focus: () => [600, 1000],
  render: (p) => {
    const pal = AMBER, floor = 1300;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Glow x={620} y={980} r={900} t={p.t} amount={1.2} ry={600} />
        <Fog t={p.t} amount={0.5} y={1000} spread={300} />
        <Ant species="tjqueen" t={p.T * 0.4} x={700} y={floor - TJ_GROUND * 1.7} scale={1.7} dir={-1} fill="#0c0704" rim="#ffc27a" seed={3} pitch={0.04} />
        {[[180, 1], [330, 1], [1000, -1]].map(([x, d], i) => (
          <Ant key={i} species="trapjaw" t={p.T} x={x} y={floor - TJ_GROUND * 1.0 + 4 - (i === 2 ? 220 : 0)} scale={1.0} dir={d as 1 | -1} pitch={0.15 + Math.sin(p.T * 1.4 + i) * 0.05} fill={pal.antFill} rim="#ffd8a0" rimOpacity={0.95} seed={i + 510} />
        ))}
        <Dust t={p.t} count={70} seed={p.index + 511} color={pal.dust} />
      </Stage>
    );
  },
};

/** Soldiers march past; 250 presses against the wall to let them by. */
const stepAside: SceneDef = {
  pal: () => AMBER,
  focus: () => [300, 1150],
  render: (p) => {
    const pal = AMBER, floor = 1300, camX = p.index * 300;
    return (
      <Stage pal={pal} bg={pal.dirt}>
        <Deep pal={pal} camX={camX} t={p.t} T={p.T} seed={521} />
        <Tunnel id="sa" pal={pal} camX={camX} t={p.t} ceil={640} floor={floor} seed={523} lights={2} solid={false} />
        <FloorWalkers t={p.T} camX={camX} floor={floor} seed={525} n={6} scale={1.45} pal={pal} speed={90} dir={-1} tseed={523} lod={0} fill="#080402" rim="#ffc27a" />
        <Hero {...p} x={140} y={floorAt(140, camX, floor, 523) - TJ_GROUND * 0.9 - 150} scale={0.9} pal={pal} pitch={0.25} />
        <Fog t={p.t} amount={0.4} y={1200} spread={150} />
        <Foreground pal={pal} camX={camX} t={p.t} />
        <Dust t={p.t} count={60} seed={p.index + 521} color={pal.dust} />
      </Stage>
    );
  },
};

export const SCENES3: Record<string, SceneDef> = { lineup, execution, assassins, royalChamber, legs, colonyQueen, stepAside };
