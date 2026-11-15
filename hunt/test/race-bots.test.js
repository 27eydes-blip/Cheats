// Hunt Racers bots: every driver laps every track in a sane time, a full 10-bot Grand Race
// finishes on every track, harder bots are faster, and a 10-car tick stays under 2 ms.
import assert from 'node:assert';
import { RaceSim, RACE_CAP } from '../src/race/sim.js';
import { DRIVER_IDS } from '../public/race/physics.js';
import { TRACK_IDS } from '../public/race/tracks.js';

const trial = (track, driver, level = 'hard') => {
  const sim = new RaceSim({ mode: 'trial', track, seed: 3, lobbyTime: 0.05, botLevel: level });
  const p = sim.players.get(sim.join('Bot', driver));
  p.bot = true;
  let n = 0, kos = 0;
  while (sim.phase !== 'end' && n++ < 30 * 300) { sim.tick(); kos += sim.events.filter((e) => e[0] === 'ko').length; }
  return { time: p.finishTime, kos, laps: p.lapTimes };
};

// every driver, every track: 3 laps, no wrecks on a clean run, within 90 s, within 8% of each other
for (const track of TRACK_IDS) {
  const times = DRIVER_IDS.map((d) => {
    const r = trial(track, d);
    assert.ok(r.time != null && r.laps.length === 3, `${d} finishes ${track}`);
    assert.ok(r.time < 90, `${d} on ${track} in ${r.time}s`);
    assert.strictEqual(r.kos, 0, `${d} on ${track}: no wrecks driving alone`);
    return r.time;
  });
  const lo = Math.min(...times), hi = Math.max(...times);
  assert.ok(hi / lo < 1.08, `${track}: drivers within 8% (${lo}..${hi})`);
}
// difficulty: easy bots are slower than hard ones
{
  const easy = trial('desert', 'volt', 'easy').time, hard = trial('desert', 'volt', 'hard').time;
  assert.ok(easy > hard * 1.04, `easy ${easy} vs hard ${hard}`);
}

// a full 10-bot Grand Race on each track finishes; also the perf budget
for (const track of TRACK_IDS) {
  const sim = new RaceSim({ mode: 'grand', track, seed: 11, lobbyTime: 0.05, fillBots: true, botLevel: 'normal' });
  const h = sim.players.get(sim.join('Host', 'volt'));
  h.bot = true;
  let n = 0;
  const times = [];
  while (sim.phase !== 'end' && n++ < 30 * (RACE_CAP + 10)) {
    const t0 = performance.now();
    sim.tick();
    if (sim.time > 5 && sim.time < 40) times.push(performance.now() - t0);
  }
  assert.strictEqual(sim.phase, 'end', `${track}: race ended`);
  assert.ok(sim.time < 150, `${track}: in a sane time (${sim.time}s)`);
  const fin = sim.order.filter((p) => p.finished);
  assert.ok(fin.length >= 3, `${track}: ${fin.length} finished`);
  assert.ok(sim.order.every((p) => p.lap >= 2), `${track}: every car got round at least twice`);
  assert.strictEqual(sim.players.size, 10);
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  assert.ok(avg < 2, `${track}: 10-car tick ${avg.toFixed(3)} ms (median ${times[times.length >> 1].toFixed(3)})`);
}
console.log('race-bots: ok');
