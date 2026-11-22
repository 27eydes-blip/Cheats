// Phantom-collision audit on an iPhone 13 portrait viewport.
// A robot drives a full lap of every course, weaving through traffic and rivals to provoke contact.
// Every frame is rendered; for each collision we look at the frame drawn from the same positions the
// collision used: was the thing we hit drawn at all, and was its base on the player's car? Anything else is a
// phantom ("crashed into something that isn't there"). Also checks no hit costs more than ~40% speed,
// no stacked repeat hits on the same object within 0.75 s, and the car never stops dead.
// Usage: npm run build && node tests/collisions.test.mjs [--verbose] [--tracks=a,b]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'dist');
const verbose = process.argv.includes('--verbose');
const only = process.argv.find((a) => a.startsWith('--tracks='))?.slice(9).split(',');
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

const TRACKS = only ?? ['depot', 'woodward', 'belleisle', 'grandblvd', 'highland', 'wallst', 'fifth', 'brooklyn'];
let phantomTotal = 0, hitTotal = 0, failures = 0;
const fail = (m) => { failures++; console.log('FAIL ' + m); };

for (const track of TRACKS) {
  const res = await page.evaluate((track) => {
    const { app } = window.__mc; window.__mc.screens.clear();
    app.startRace({ track: window.__mc.tracks(track), weather: 'clear', mode: 'quick', car: 'mercer', paint: '#a3242b', upgrades: {}, rivals: 5, difficulty: 1, laps: 1, traffic: 9 }, () => {});
    const r = app.race; app.race = null; app.endRace();
    const R = app.renderer; R.record = true;
    r.countdown = 0.01;
    const out = []; let minPct = 1, frames = 0, stoppedFrames = 0;
    let shown = new Map(); // object -> rect drawn on the previous frame
    let seen = 0;
    const ids = new WeakMap(); let nextId = 1; const oid = (o) => { if (!ids.has(o)) ids.set(o, nextId++); return ids.get(o); };
    while (r.state !== 'finished' && frames < 60 * 150) {
      frames++;
      const d = r.drive();
      const weave = Math.sin(r.t * 0.9) * 0.9 + Math.sin(r.t * 2.3) * 0.3;
      r.update(1 / 60, { steer: Math.max(-1, Math.min(1, d.steer * 0.5 + weave)), brake: false, boost: r.player.boost >= 1 && Math.random() < 0.01, horn: false });
      const pl = r.player;
      if (r.state === 'racing' && r.raceT > 3) { minPct = Math.min(minPct, pl.speed / pl.stats.top); if (pl.speed < 200) stoppedFrames++; }
      // judge new hits against the frame drawn from the same positions the collision used
      R.render(r.scene(1));
      shown = new Map(R.drawn);
      for (; seen < r.hits.length; seen++) {
        const h = r.hits[seen];
        const o = shown.get(h.ref), me = shown.get(pl);
        let visible = false, touching = false;
        if (o && me) {
          visible = true;
          // rectangles are the painted (opaque) part of each sprite, as drawn on the previous frame
          const xOverlap = o.x < me.x + me.w && o.x + o.w > me.x;
          const base = o.y + o.h; // where the object meets the road
          // touching = the painted bodies overlap on screen, and its base is not above our car's roof
          // (i.e. no road visible between the two)
          const yOverlap = o.y < me.y + me.h && base > me.y;
          touching = xOverlap && yOverlap;
        }
        out.push({ oid: oid(h.ref), kind: h.kind, id: h.id, lane: h.lane, dz: h.dz, dx: h.dx, effect: h.effect, before: h.speedBefore, after: h.speedAfter, t: h.t, visible, touching, objZ: h.objZ });
      }
    }
    R.record = false;
    return { out, minPct, stoppedFrames, frames, finished: r.state === 'finished' };
  }, track);

  // group consecutive repeats on the same object (stacking)
  const events = [];
  for (const h of res.out) {
    const prev = events.findLast((e) => e.oid === h.oid && h.t - e.tEnd < 0.1);
    if (prev) { prev.frames++; prev.tEnd = h.t; prev.after = h.after; prev.anyTouch ||= h.touching; prev.anyVisible ||= h.visible; prev.minDz = Math.min(prev.minDz, Math.abs(h.dz)); prev.effects.add(h.effect); continue; }
    events.push({ ...h, frames: 1, tEnd: h.t, anyTouch: h.touching, anyVisible: h.visible, minDz: Math.abs(h.dz), effects: new Set([h.effect]) });
  }
  const phantoms = events.filter((e) => !e.anyTouch);
  const stacked = events.filter((e) => e.frames > 1 && e.effect !== 'side');
  const bigLoss = events.filter((e) => e.after < e.before * 0.58 && e.before > 1500);
  phantomTotal += phantoms.length; hitTotal += events.length;
  console.log(`\n${track}: ${events.length} collisions, ${phantoms.length} with nothing visibly touching, ${stacked.length} firing on several frames in a row, ${bigLoss.length} costing >40% speed; lowest speed ${(res.minPct * 100).toFixed(0)}% of top, ${res.stoppedFrames} stopped frames${res.finished ? '' : ' (lap not finished)'}`);
  for (const e of verbose ? events : phantoms) console.log(`   ${e.anyTouch ? '        ' : 'PHANTOM '} t=${e.t.toFixed(2)}s ${e.kind.padEnd(7)} ${String(e.id).padEnd(22)} ${e.lane.padEnd(14)} gap dz=${String(e.dz).padStart(5)} (closest ${String(e.minDz).padStart(4)}) dx=${e.dx.toFixed(2).padStart(5)} ${e.anyVisible ? 'drawn    ' : 'NOT DRAWN'} ${[...e.effects].join('+')} ×${e.frames} frames, speed ${e.before}→${e.after}`);
  if (phantoms.length) fail(`${track}: ${phantoms.length} collision(s) with nothing visibly touching`);
  if (stacked.length) fail(`${track}: ${stacked.length} collision(s) firing repeatedly and stacking`);
  if (bigLoss.length) fail(`${track}: ${bigLoss.length} hit(s) cost more than 40% of speed`);
  if (res.stoppedFrames) fail(`${track}: car stopped dead for ${res.stoppedFrames} frames`);
}
if (errors.length) fail('page errors: ' + errors.join(' | '));
console.log(`\n${hitTotal} collisions over ${TRACKS.length} courses, ${phantomTotal} phantom.`);
await browser.close();
server.close();
if (failures) { console.error(`${failures} collision check(s) failed`); process.exit(1); }
console.log('collisions OK');
