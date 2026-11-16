// Play-feel checks on an iPhone 13 portrait viewport: sidewalk run-off, soft walls, object hits,
// car contact without teleports, rival spacing/jitter, corners holdable at full speed, smooth interpolation.
// Usage: npm run build && node tests/feel.test.mjs [--shots]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'dist');
const out = join(here, 'out');
const shots = process.argv.includes('--shots');
await mkdir(out, { recursive: true });
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

// Runs a race headlessly (detached from the live loop) with a scripted driver; returns per-step samples.
const sim = (opts) => page.evaluate((o) => {
  const { app } = window.__mc; window.__mc.screens.clear();
  app.startRace({ track: window.__mc.tracks(o.track), weather: o.weather ?? 'clear', mode: 'quick', car: o.car ?? 'runabout', paint: '#a3242b', upgrades: o.upgrades ?? {}, rivals: o.rivals ?? 0, difficulty: 1, laps: 3, traffic: o.traffic ?? 0 }, () => {});
  const r = app.race; app.race = null; app.endRace();
  r.countdown = 0.01;
  for (let i = 0; i < 2; i++) r.update(1 / 60, { steer: 0, brake: false, boost: false, horn: false });
  if (o.setup) new Function('r', o.setup)(r);
  const samples = []; const events = [];
  const pl = r.player; const ev0 = pl.ev; const origPush = ev0.push.bind(ev0);
  pl.ev.push = (...a) => { events.push(...a.map((e) => [Math.round(r.t * 100) / 100, e])); return origPush(...a); };
  for (let i = 0; i < o.steps; i++) {
    const inp = new Function('r', 'i', o.input ?? 'return { steer: 0, brake: false, boost: false, horn: false }')(r, i);
    r.update(1 / 60, inp);
    samples.push({ z: pl.z, x: pl.x, v: pl.speed, top: pl.stats.top, spin: pl.spinT, off: pl.offroad, rivals: r.rivals.map((v) => [v.z, v.x, v.vx, v.half, v.len]) });
    if (o.scenes) { const a = r.scene(0), b = r.scene(0.5), c = r.scene(1); samples[i].interp = [a.playerZ, b.playerZ, c.playerZ]; }
  }
  return { samples, events, L: r.track.length };
}, opts);

// 1. Sidewalk: hold right into the sidewalk for 5 s at speed. Must slow a little, rumble, never stop, never crash.
{
  const { samples, events } = await sim({ track: 'woodward', setup: 'r.player.speed = r.player.stats.top; r.player.z = 200 * 120;', steps: 300, input: 'return { steer: 1, brake: false, boost: false, horn: false }' });
  const after = samples.slice(60);
  const minPct = Math.min(...after.map((s) => s.v / s.top));
  const maxX = Math.max(...samples.map((s) => Math.abs(s.x)));
  check(minPct > 0.6, 'sidewalk slows but never stops', `min speed ${(minPct * 100).toFixed(0)}% of top`);
  check(maxX <= 2.0 - 0.27 + 1e-6, 'soft wall stops the car before the buildings', `max |x| ${maxX.toFixed(3)}`);
  check(!events.some(([, e]) => e === 'crash'), 'no crash from kerb, sidewalk or wall', events.map((e) => e[1]).join(','));
}
// 2. Sidewalk assist: release steering on the sidewalk; the car drifts back toward the road.
{
  const { samples } = await sim({ track: 'woodward', setup: 'r.player.speed = r.player.stats.top * 0.8; r.player.z = 200 * 130; r.player.x = 1.4;', steps: 180 });
  check(Math.abs(samples.at(-1).x) < 1.25, 'steering assist eases you off the sidewalk', `x ${samples[0].x.toFixed(2)} -> ${samples.at(-1).x.toFixed(2)}`);
}
// 3a. Street furniture: steer hard at the lamp line. The soft wall keeps the car's visible edge clear of the poles.
{
  const { samples, events } = await sim({ track: 'woodward', setup: `
    const segs = r.track.segs; let i = 130; while (!segs[i].sprites.some((s) => s.id === 'lamp' && s.x > 0)) i++;
    r.player.z = (i - 25) * 200; r.player.x = 1.3; r.player.speed = r.player.stats.top;`, steps: 300, input: 'return { steer: 1, brake: false, boost: false, horn: false }' });
  const maxX = Math.max(...samples.map((s) => s.x));
  check(maxX + 0.23 < 1.66 - 0.03, "car's visible edge stops short of the lamp poles", `edge at ${(maxX + 0.23).toFixed(2)}, poles at 1.66`);
  check(!events.some(([, e]) => e === 'crash'), 'hugging the lamp line never crashes');
}
// 3b. A real knock (rear-ending slow traffic hard): short wobble + speed loss, then recovery; no dead stop.
{
  const { samples, events } = await sim({ track: 'woodward', traffic: 1, setup: `
    const v = r.traffic.list[0]; r.player.z = 200 * 100; r.player.x = 0.5; r.player.speed = r.player.stats.top;
    v.z = r.player.z + 2500; v.x = 0.5; v.base = 2800; v.speed = 2800; v.kind = 'truck';`, steps: 420,
    input: 'return { steer: i > 50 && r.player.x > -0.3 ? -1 : 0, brake: false, boost: false, horn: false }' });
  const hit = events.find(([, e]) => e === 'crash');
  const minPct = Math.min(...samples.map((s) => s.v / s.top));
  const end = samples.at(-1).v / samples.at(-1).top;
  const maxWobble = Math.max(...samples.map((s) => s.spin));
  check(!!hit, 'a hard knock causes a crash wobble');
  check(minPct > 0.25, 'crash costs speed but is never a dead stop', `min ${(minPct * 100).toFixed(0)}% of top`);
  check(end > 0.85, 'car recovers after the wobble', `back to ${(end * 100).toFixed(0)}% after 7 s`);
  check(maxWobble <= 0.8, 'wobble is short', `${maxWobble.toFixed(2)} s`);
}
// 4. Car contact: rear-end a slower rival. No backward teleports; speed matched smoothly.
{
  const { samples, L } = await sim({ track: 'woodward', rivals: 1, scenes: true, setup: `
    const v = r.rivals[0]; r.player.z = 200 * 100; r.player.x = 0; r.player.speed = r.player.stats.top;
    v.z = r.player.z + 1400; v.x = 0; v.speed = r.player.stats.top * 0.55; v.top = v.speed; v.update = function (dt) { this.z += this.speed * dt; };`, steps: 240 });
  let worstBack = 0, worstDv = 0;
  for (let i = 1; i < samples.length; i++) {
    let dz = samples[i].z - samples[i - 1].z; if (dz < -L / 2) dz += L;
    worstBack = Math.min(worstBack, dz);
    worstDv = Math.max(worstDv, samples[i - 1].v - samples[i].v);
  }
  check(worstBack > -10, 'no backward teleport on car contact', `worst step ${worstBack.toFixed(1)} units`);
  check(worstDv < 700, 'speed matched smoothly, not snapped', `largest one-step drop ${worstDv.toFixed(0)} u/s`);
  let interpOk = true;
  for (const s of samples) { const [a, b, c] = s.interp; let d1 = b - a, d2 = c - b; if (d1 < -L / 2) d1 += L; if (d2 < -L / 2) d2 += L; if (d1 < -1 || d2 < -1) interpOk = false; }
  check(interpOk, 'interpolated camera moves forward smoothly between steps');
}
// 5. Rivals: a full field for 60 s. No overlaps, no lateral jitter.
{
  const { samples, L } = await sim({ track: 'woodward', rivals: 6, traffic: 6, steps: 3600, setup: 'r.autopilot = true;', input: 'return r.drive ? { ...r.drive(), boost: false, horn: false } : { steer: 0, brake: false, boost: false, horn: false }' });
  let overlapFrames = 0, flips = 0;
  for (const s of samples) {
    const rv = s.rivals;
    let over = false;
    for (let a = 0; a < rv.length; a++) for (let b = a + 1; b < rv.length; b++) {
      let dz = rv[b][0] - rv[a][0]; dz = ((dz + L / 2) % L + L) % L - L / 2;
      if (Math.abs(dz) < (rv[a][4] + rv[b][4]) / 2 * 0.5 && Math.abs(rv[a][1] - rv[b][1]) < (rv[a][3] + rv[b][3]) * 0.8) over = true;
    }
    if (over) overlapFrames++;
  }
  // swerve jitter = visible left-right reversals (sideways speed ≥ 0.12 lane-widths/s on both sides) < 0.4 s apart
  for (let k = 0; k < samples[0].rivals.length; k++) {
    let lastRev = -1e9, sgn = 0, peak = 0, prevPeak = 0;
    for (let i = 0; i < samples.length; i++) {
      const vx = samples[i].rivals[k][2];
      const sg = Math.sign(vx);
      if (sg && sgn && sg !== sgn) {
        if (prevPeak >= 0.12 && peak >= 0.12 && i - lastRev < 24) flips++;
        lastRev = i; prevPeak = peak; peak = 0;
      }
      if (sg) sgn = sg;
      peak = Math.max(peak, Math.abs(vx));
    }
  }
  check(overlapFrames < 30, 'rivals keep their spacing (no overlapping sprites)', `${overlapFrames} overlapping frames of ${samples.length}`);
  check(flips < 6, 'rival lane changes are smooth (no swerve jitter)', `${flips} quick left-right reversals in 60 s for 6 cars`);
}
// 6. Every corner on every course can be held at full speed with normal steering (fair corners).
{
  const res = await page.evaluate(() => {
    const out = [];
    for (const id of ['depot', 'woodward', 'belleisle', 'grandblvd', 'highland', 'wallst', 'fifth', 'brooklyn']) {
      const segs = window.__mc.tracks(id).sections;
      const maxC = Math.max(...segs.map((s) => Math.abs(s.curve ?? 0)));
      out.push([id, maxC]);
    }
    return out;
  });
  // physics (player.ts): steering = 2*pct*(1.35-0.4*pct)*(0.8+0.2*handling); pull = 2*pct^2*curve*0.27/grip
  const need = (pct, curve, grip, handling) => (2 * pct * pct * curve * 0.27 / grip) / (2 * pct * (1.35 - 0.4 * pct) * (0.8 + 0.2 * handling));
  const starter = Math.max(...res.map(([, c]) => need(62 / 100, c, 0.95, 1.0)));
  const fastest = Math.max(...res.map(([, c]) => need(1.0, c, 1.2 * 1.24, 1.2 * 1.24)));
  check(starter < 0.8, 'starter car holds the hardest corner with part lock', `needs ${(starter * 100).toFixed(0)}% lock`);
  check(fastest <= 1.0, 'fully tuned top car can just hold the hardest corner flat out', `needs ${(fastest * 100).toFixed(0)}% lock`);
}
// 7. Hitbox overlay renders (press D) — visual check screenshot.
{
  await page.evaluate(() => {
    const { app, screens } = window.__mc; screens.clear();
    app.startRace({ track: window.__mc.tracks('woodward'), weather: 'clear', mode: 'quick', car: 'runabout', paint: '#a3242b', upgrades: {}, rivals: 5, difficulty: 1, laps: 3 }, () => {});
    const r = app.race; r.countdown = 0.01; r.player.z = 200 * 140; r.rivals.forEach((v, i) => { v.z = r.player.z + 700 + i * 450; });
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyD');
  await page.waitForTimeout(1500);
  const dbg = await page.evaluate(() => window.__mc.app.renderer.debug);
  check(dbg === true, 'D toggles the hitbox overlay');
  if (shots) await page.screenshot({ path: join(out, 'feel-hitboxes.png') });
  await page.keyboard.press('KeyD');
}
// 8. Two thumbs: hold steer and brake together via touch, then slide off the steer button: nothing sticks.
{
  const r = await page.evaluate(async () => {
    const { app } = window.__mc; const inp = window.__mc.input;
    const btn = (k) => document.querySelector(`[data-btn="${k}"]`).getBoundingClientRect();
    const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
    const L = btn('left'), B = btn('brake');
    fire('pointerdown', 1, L.x + L.width / 2, L.y + L.height / 2);
    fire('pointerdown', 2, B.x + B.width / 2, B.y + B.height / 2);
    inp.poll();
    const both = inp.held.left && inp.held.brake;
    fire('pointermove', 1, L.x + L.width / 2, L.y - 120); // finger slides off upwards
    inp.poll();
    const released = !inp.held.left && inp.held.brake;
    fire('pointerup', 2, B.x + 5, B.y + 5);
    inp.poll();
    const none = !inp.held.left && !inp.held.brake && !document.querySelector('.ctl.down');
    app.endRace();
    return { both, released, none };
  });
  check(r.both, 'steer and brake work together (two thumbs)');
  check(r.released, 'sliding a finger off a button releases it');
  check(r.none, 'no button left stuck down');
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
server.close();
if (failures) { console.error(`${failures} feel check(s) failed`); process.exit(1); }
console.log('feel OK');
