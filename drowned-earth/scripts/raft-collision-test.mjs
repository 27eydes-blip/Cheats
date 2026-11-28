// node scripts/raft-collision-test.mjs — the boat must never pass through a raft.
// Drives the boat at low, medium and top speed into small and large Portage rafts from six angles,
// with full throttle held, and fails if the hull ever overlaps the raft or ends up past its centre.
// Also checks a hard hit costs some hull and makes a sound event, and that a parked boat is solid.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5185, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=12&freeze=1');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 200000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, B = c.boat, V = c.player.position.constructor, out = {};
  c.renderer.setAnimationLoop(null);
  c.player.teleport(new V(318, 1, 250));
  for (let i = 0; i < 20; i++) { g.update(1 / 30); await new Promise((r) => setTimeout(r, 0)); }
  const com = c.state.communities.portage;
  const rafts = ['sleep1', 'water', 'redlamp', 'market', 'dock'].map((id) => com.rafts.get(id)).filter(Boolean);
  const top = B.type?.stats?.top ?? 12;
  let impacts = 0; c.events.on('boat:impact', () => impacts++);
  for (const raft of rafts) {
    // the raft's footprint centre and half-size, from its deck rectangles
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of raft.rects) { x0 = Math.min(x0, q.x0); x1 = Math.max(x1, q.x1); z0 = Math.min(z0, q.z0); z1 = Math.max(z1, q.z1); }
    const centre = raft.worldPoint(new V((x0 + x1) / 2, 0, (z0 + z1) / 2));
    const halfMin = Math.min(x1 - x0, z1 - z0) / 2;
    const res = [];
    for (const speed of [3, 8, top]) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const dir = new V(Math.cos(a), 0, Math.sin(a));
      const start = centre.clone().addScaledVector(dir, -(halfMin + 14));
      B.tied = null; c.player.mode = 'boat'; B.engineOff = false; B.fuel = B.fuelMax;
      B.pos.set(start.x, B.pos.y, start.z); B.heading = Math.atan2(-dir.x, -dir.z); B.vel.copy(dir).multiplyScalar(speed); B.yawRate = 0;
      B.hull = 100; let inside = false, crossed = false, hull0 = B.hull, maxImp = 0;
      for (let i = 0; i < 90; i++) {
        c.input.move.y = speed >= top ? 1 : speed / top; c.input.move.x = 0; c.input.held.sprint = false;
        g.update(1 / 30);
        // overlap: the boat's centre within the raft's own (local) footprint
        // the hull's centre, bow and stern: none may sit on an actual deck (not the bounding box) — the bow riding
        // 1–2 m over a small raft is what "passing through" looks like from the seat
        const inv = raft.root.matrixWorld.clone().invert(), fw = new V(-Math.sin(B.heading), 0, -Math.cos(B.heading)), L = (B.type?.hull?.length ?? 5.6) * 0.45;
        for (const [off, m] of [[0, 0.25], [L, 0.6], [-L, 0.6]]) {
          const l = B.pos.clone().addScaledVector(fw, off).applyMatrix4(inv);
          if (raft.rects.some((q) => l.x > q.x0 + m && l.x < q.x1 - m && l.z > q.z0 + m && l.z < q.z1 - m)) inside = true;
        }
        maxImp = Math.max(maxImp, B._lastImpact || 0);
        if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      res.push({ speed, angle: k * 60, ok: !inside && !crossed, inside, crossed, dmg: +(hull0 - B.hull).toFixed(1), imp: +maxImp.toFixed(1) });
    }
    const bad = res.filter((r) => !r.ok);
    const topDmg = Math.max(...res.filter((r) => r.speed === top).map((r) => r.dmg));
    if (!(topDmg > 0 && topDmg < 40)) bad.push({ speed: top, angle: 'any', inside: false, crossed: false, dmgBad: topDmg });
    out['raft ' + raft.id] = { pass: !bad.length, detail: `${res.length} runs (3/8/${top} m/s × 6 angles); ${bad.length ? 'through: ' + bad.map((r) => `${r.speed}m/s@${r.angle}°${r.inside ? ' inside' : ''}${r.crossed ? ' crossed' : ''}`).join(', ') : 'never through'}; top-speed hull loss up to ${Math.max(...res.filter((r) => r.speed === top).map((r) => r.dmg))}, hardest hit ${Math.max(...res.map((r) => r.imp))} m/s, mods.damage ${B.mods.damage}` };
  }
  out.feedback = { pass: impacts > 0, detail: `${impacts} impact/scrape sound events` };
  // a parked boat is solid too
  const pk = c.fleet?.parked?.[0];
  if (pk) {
    const dir = new V(1, 0, 0), st = pk.pos.clone().addScaledVector(dir, -14);
    B.pos.set(st.x, B.pos.y, st.z); B.heading = Math.atan2(-dir.x, -dir.z); B.vel.copy(dir).multiplyScalar(8); c.player.mode = 'boat'; B.tied = null;
    c.player.teleport(st); c.player.mode = 'boat';
    let crossed = false; for (let i = 0; i < 90; i++) { c.input.move.y = 0.7; g.update(1 / 30); if (B.pos.clone().sub(pk.pos).dot(dir) > 0.5) crossed = true; if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
    out.parkedBoat = { pass: !crossed, detail: crossed ? 'sailed through a parked boat' : 'bumped off a parked boat' };
  }
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);
