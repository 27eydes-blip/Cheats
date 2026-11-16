// Rival AI checks on an iPhone 13 portrait viewport.
// A) 10 bots-only races (no player input): the field must finish within a few seconds of each other;
//    reports boosts, spins, cornering and how much speed bots keep while dodging trolleys and carriages.
// B) races with a robot player on each difficulty: no bot is ever more than ~8 s ahead of the player,
//    and Normal is tougher than the old tuning.
// Usage: npm run build && node tests/bots.test.mjs
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => !!window.__mc);
let failures = 0;
const check = (ok, msg, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };

// ---------- A: 10 bots-only races ----------
const part = process.argv.find((a) => a.startsWith('--part='))?.slice(7) ?? 'AB';
const races = !part.includes('A') ? [] : [['depot', 0.92], ['woodward', 0.92], ['belleisle', 0.94], ['grandblvd', 0.97], ['highland', 0.99], ['woodward', 1.0], ['wallst', 1.02], ['fifth', 1.04], ['brooklyn', 1.05], ['depot', 1.1]];
const spreads = [];
console.log('A) ten bots-only races (no player input), Normal, 3 laps, traffic on');
for (const [track, diff] of races) {
  const r = await page.evaluate(([track, diff]) => {
    const { app, screens } = window.__mc; screens.clear();
    app.startRace({ track: window.__mc.tracks(track), weather: 'clear', mode: 'quick', car: 'runabout', paint: '#a3242b', upgrades: {}, rivals: 5, difficulty: diff, laps: 3, spectate: true, level: 'normal' }, () => {});
    const race = app.race; app.race = null; app.endRace();
    race.countdown = 0.01;
    const st = race.rivals.map((v) => ({ name: v.def.name, boosts: 0, spins: 0, cornerSum: 0, cornerN: 0, trafficMin: 1, trafficN: 0, trafficSum: 0 }));
    const segs = race.track.segs, N = segs.length, L = race.track.length;
    let f = 0;
    while (race.state !== 'finished' && f < 60 * 400) {
      race.update(1 / 60, { steer: 0, brake: false, boost: false, horn: false });
      f++;
      race.rivals.forEach((v, i) => {
        if (v.boosted) st[i].boosts++;
        if (v.spinT > 0.85) st[i].spins++;
        let c = 0; const si = Math.floor(v.z / 200) % N; for (let k = 0; k < 6; k++) c += Math.abs(segs[(si + k) % N].curve); c /= 6;
        if (c > 2.5 && v.spinT <= 0 && v.boostT <= 0 && race.raceT > 5) { st[i].cornerSum += v.speed / v.top; st[i].cornerN++; }
        // speed while passing traffic (a trolley or carriage within 3 segments ahead, overlapping lanes)
        for (const t of race.traffic.list) {
          const d = ((t.z - v.z) % L + L) % L;
          if (d < 600 && Math.abs(t.x - v.x) < 0.7 && v.spinT <= 0 && race.raceT > 5) { st[i].trafficMin = Math.min(st[i].trafficMin, v.speed / v.top); st[i].trafficSum += v.speed / v.top; st[i].trafficN++; break; }
        }
      });
    }
    return { finished: race.state === 'finished', times: race.rivals.map((v, i) => ({ ...st[i], t: v.finishTime })) };
  }, [track, diff]);
  const ts = r.times.map((x) => x.t).sort((a, b) => a - b);
  const spread = ts.at(-1) - ts[0];
  spreads.push(spread);
  const order = [...r.times].sort((a, b) => a.t - b.t).map((x) => `${x.name.split(' ')[0]} ${x.t.toFixed(1)}`).join(', ');
  console.log(`   ${track.padEnd(10)} spread ${spread.toFixed(1)} s — ${order}`);
  console.log(`      boosts ${r.times.map((x) => x.name.split(' ')[0] + ':' + x.boosts).join(' ')} · spins ${r.times.map((x) => x.spins).join('/')} · corner speed ${r.times.map((x) => Math.round((x.cornerSum / Math.max(1, x.cornerN)) * 100) + '%').join('/')} · speed kept passing traffic ${r.times.map((x) => (x.trafficN ? Math.round((x.trafficSum / x.trafficN) * 100) + '%' : '–')).join('/')} (worst moment ${r.times.map((x) => (x.trafficN ? Math.round(x.trafficMin * 100) + '%' : '–')).join('/')})`);
  if (!r.finished) check(false, `${track}: bots-only race did not finish`);
  check(spread <= 7, `${track}: bots finish within a few seconds of each other`, `${spread.toFixed(1)} s first to last`);
}
const avg = spreads.reduce((a, b) => a + b, 0) / Math.max(1, spreads.length);
if (spreads.length) check(avg <= 5, 'average first-to-last spread over 10 races', `${avg.toFixed(1)} s`);

// ---------- B: robot player on each difficulty ----------
console.log('\nB) races with a robot player that only steers (no drifting, so no boosts)');
const results = {};
for (const level of part.includes('B') ? ['easy', 'normal', 'hard'] : []) {
  results[level] = [];
  for (const [track, diff] of [['woodward', 0.92], ['belleisle', 0.94], ['wallst', 1.02], ['depot', 1.1]]) {
    for (const effort of ['steering only']) {
      const r = await page.evaluate(([track, diff, level, effort]) => {
        const { app, screens } = window.__mc; screens.clear();
        app.startRace({ track: window.__mc.tracks(track), weather: 'clear', mode: 'quick', car: 'runabout', paint: '#a3242b', upgrades: {}, rivals: 5, difficulty: diff, laps: 3, level }, () => {});
        const race = app.race; app.race = null; app.endRace();
        race.countdown = 0.01;
        const p = race.player; let maxLead = 0, f = 0;
        while (race.state !== 'finished' && f < 60 * 400) {
          const d = race.drive();
          // the robot only steers and brakes: it never drifts, so it never earns boost (a player who isn't trying)
          race.update(1 / 60, { steer: d.steer, brake: d.brake, boost: false, horn: false });
          f++;
          if (race.raceT > 6 && race.state === 'racing') for (const v of race.rivals) {
            const lead = (v.total - race.totalP) / Math.max(p.speed, v.base * 0.6);
            maxLead = Math.max(maxLead, lead);
          }
        }
        return { place: race.place, maxLead, fieldTop: race.fieldTop, playerTop: p.stats.top / 120 };
      }, [track, diff, level, effort]);
      results[level].push({ track, effort, ...r });
      console.log(`   ${level.padEnd(6)} ${track.padEnd(10)} ${effort.padEnd(8)} finished ${r.place} of 6 · worst bot lead ${r.maxLead.toFixed(1)} s · fastest bot ${r.fieldTop.toFixed(0)} mph vs player ${r.playerTop.toFixed(0)} mph`);
      check(r.maxLead <= 8.6, `${level} ${track} ${effort}: no bot more than ~8 s ahead`, `${r.maxLead.toFixed(1)} s`);
    }
  }
}
if (part.includes('B')) {
const winsCoasting = results.normal.filter((x) => x.place === 1).length;
check(winsCoasting <= 1, 'on Normal, a player who just steers rarely wins', `${winsCoasting} of 4 races won without boosting`);
const meanPlace = (lv, ef) => results[lv].filter((x) => x.effort === ef).reduce((a, x) => a + x.place, 0) / 4;
check(meanPlace('hard', 'steering only') > meanPlace('easy', 'steering only'), 'Hard is harder than Easy', `average place easy ${meanPlace('easy', 'steering only').toFixed(1)}, normal ${meanPlace('normal', 'steering only').toFixed(1)}, hard ${meanPlace('hard', 'steering only').toFixed(1)}`);
const fastBot = results.normal[0];
check(Math.abs(fastBot.fieldTop - fastBot.playerTop) < 1, 'on Normal the fastest bot matches the player car on straights', `${fastBot.fieldTop.toFixed(1)} vs ${fastBot.playerTop.toFixed(1)} mph`);

}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
server.close();
if (failures) { console.error(`${failures} bot check(s) failed`); process.exit(1); }
console.log('bots OK');
