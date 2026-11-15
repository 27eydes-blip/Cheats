// Shared helpers for the Hunt Racers tests (test/race-*.test.js).
import { RaceSim } from '../src/race/sim.js';
import { newCar, stepCar } from '../public/race/physics.js';
import { pointAt } from '../public/race/trackgeom.js';

export function mkRace(o = {}) {
  return new RaceSim({ mode: 'grand', track: 'desert', seed: 5, lobbyTime: 0.05, fillBots: false, ...o });
}
export const ticks = (sim, n = 1) => { for (let i = 0; i < n; i++) sim.tick(); };
// join humans and run until the grid countdown is over
export function startRace(sim, drivers = ['volt', 'volt']) {
  const ids = drivers.map((d, i) => sim.join('P' + i, d));
  let n = 0;
  while (sim.phase === 'lobby' && n++ < 100) sim.tick();
  return ids.map((id) => sim.players.get(id));
}
export const toGo = (sim) => { while (sim.time <= 0) sim.tick(); };
// put a car somewhere on a corridor (s px along, d px across) facing along the road at speed v
export function place(sim, p, s, d = 0, v = 0, c = 0, back = false) {
  const pt = pointAt(sim.T.corridors[c], s, d), a = back ? pt.a + Math.PI : pt.a;
  p.car = newCar(pt.x, pt.y, a);
  p.car.vx = Math.cos(a) * v; p.car.vy = Math.sin(a) * v;
  stepCar(p.car, { st: 0, th: 0, dr: 0 }, p.st, sim.T, 0);
  p.ai = null;
  return p.car;
}
// a human input stream: call each tick before sim.tick()
export function driver(sim, p) {
  let s = 0;
  return (inp = {}) => sim.input(p.id, { t: 'in', s: ++s, st: 0, th: 0, dr: 0, ...inp });
}
export function drive(sim, p, inp, n) { const d = driver(sim, p); for (let i = 0; i < n; i++) { d(inp); sim.tick(); } }
export function collectEvents(sim) {
  const all = [];
  const orig = sim.snapshots.bind(sim);
  sim.snapshots = () => { for (const e of sim.events) all.push([sim.time, ...e]); orig(); };
  return all;
}
