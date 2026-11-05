// Quick seed check (no rendering, ~10 s): does the bot reach the Abyss and end on NEW BEST?
//   node marketing/bottest.cjs [seed]
const path = require("node:path");
const { serve } = require("./lib/server.cjs");
const { openDemo } = require("./lib/page.cjs");
(async () => {
  const seed = +(process.argv[2] || 20261102);
  const srv = await serve(path.join(__dirname, "..", "dist-test"));
  const { browser, page, G, errors } = await openDemo(srv.url);
  page.on("crash", () => console.log("PAGE CRASHED"));
  page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });
  const t0 = Date.now();
  await G((seed) => { const D = window.__demo; D.runSeed = seed; D.run(60, false); D.act.play();
    Object.assign(D.bot, { on: true, mode: "drama", startAt: D.frame + 40, killDelay: 6, dramaGap: 3 }); }, seed);
  let last = 0;
  for (let i = 0; i < 80; i++) {
    const st = await G(() => { const D = window.__demo; const t = performance.now(); D.run(120, false); const s = window.__glydrift.scene.getScene("Game");
      return { f: D.frame, ms: Math.round(performance.now() - t), m: s ? Math.round(s.meters) : -1, state: s?.state, ev: D.events.length, heap: Math.round(performance.memory.usedJSHeapSize / 1e6) }; });
    if (i % 5 === 0 || st.state !== "playing") console.log(JSON.stringify(st));
    if (false && st.state !== "playing") { for (const e of await G(() => window.__demo.events)) console.log(JSON.stringify(e)); console.log(JSON.stringify(await G(() => { const s = window.__glydrift.scene.getScene("Game"); return { trace: window.__demo.trace.slice(-40).map(t => t.join(' ')), near: s.obstacles.active.filter(o => Math.abs(o.x - s.player.x) < 150).map(o => ({ t: o.type, x: Math.round(o.x), st: o.state, y: Math.round(o.y ?? -1), L: Math.round(o.L ?? -1), top: o.top, cl: Math.round(o.clearance(s.player.x, s.player.y, s.player.radius)) })), y: Math.round(s.player.y), vy: Math.round(s.player.vy), dir: s.player.gravityDir, obs: s.obstacles.active.map(o => [o.type, Math.round(o.x), Math.round(o.left), Math.round(o.right)]) }; }))); break; }
    const over = await G(() => { const D = window.__demo; const g = D.events.find((e) => e.type === "gameover"); return g && D.frame > g.frame + 60; });
    if (over) break;
  }
  console.log("sim secs", ((Date.now() - t0) / 1000).toFixed(0));
  for (const e of await G(() => window.__demo.events)) console.log(JSON.stringify(e));
  if (errors.length) console.log("errors", errors);
  await browser.close();
  srv.close();
})();
