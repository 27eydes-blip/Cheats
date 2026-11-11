// Check the soundtrack in a real god-mode run (audio on, real time, headless Chromium):
//   node scripts/music/verify-run.mjs [--seconds=200] [--port=5297]
// Reports every bridge / landing / realm title and checks that
//  · each bridge starts on the current track's bar line and lands on the next realm's beat
//  · each realm title ("ENTERING …") appears on that beat (within one frame: headless
//    Chromium draws this game slowly, so its frames are long; on a phone a frame is 16 ms)
//  · never two tracks at full volume, never a landing without its title
//  · the decoded audio really has its drop hit where the beat grid says (decoder offset)
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const SECONDS = Number(arg("seconds", 200));
const server = await createServer({
  root: new URL("../..", import.meta.url).pathname,
  logLevel: "error",
  server: { port: Number(arg("port", 5297)), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|ERR_|supabase/i.test(m.text()))
    errors.push(m.text());
});
const today = new Date().toISOString().slice(0, 10);
await page.addInitScript((T) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem(
    "glydrift.save.v1",
    JSON.stringify({
      coins: 5000,
      best: 1200,
      level: 6,
      xp: 120,
      spins: 1,
      selected: "volt",
      unlocked: { volt: true },
      login: { last: T, streak: 3, claimed: T },
      settings: { gfxChecked: true, gfxBoot: true },
      profile: { username: "TestPilot" },
      seasons: { s1: { xp: 900, claimed: {}, started: true, heroSeen: true } },
    }),
  );
}, today);
// --render-every=6 draws every 6th frame only (game logic still runs every frame): headless
// Chromium draws in software, and long frames would blur the timing being measured
const every = Number(arg("render-every", 1));
await page.goto(`${base}?god&offline${every > 1 ? `&renderEvery=${every}` : ""}`, {
  waitUntil: "load",
});
await page.waitForFunction(() => window.__glydrift?.scene?.isActive("Menu"), null, {
  timeout: 30000,
});
await page.waitForTimeout(1500);

// the game's own Music instance (Vite may add a cache-busting query to the module URL)
await page.evaluate(async () => {
  const u = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .find((n) => n.includes("/src/audio/music.js"));
  window.__music = (await import(u)).Music;
});
const press = async (label) => {
  const pt = await page.evaluate((want) => {
    const g = window.__glydrift;
    for (const sc of g.scene.getScenes(true).reverse()) {
      let hit = null;
      const walk = (l) => {
        for (const o of l) {
          if (o.list) walk(o.list);
          if (
            !hit &&
            o.type === "Text" &&
            String(o.text).trim().toUpperCase() === want &&
            o.visible
          )
            hit = o;
        }
      };
      walk(sc.children.list);
      if (hit) {
        const m = hit.getWorldTransformMatrix();
        const cam = sc.cameras.main;
        const r = g.canvas.getBoundingClientRect();
        return {
          x: r.left + ((m.tx - cam.worldView.x) * cam.zoom * r.width) / g.canvas.width,
          y: r.top + ((m.ty - cam.worldView.y) * cam.zoom * r.height) / g.canvas.height,
        };
      }
    }
    return null;
  }, label);
  if (!pt) throw new Error(`no ${label} button`);
  await page.mouse.click(pt.x, pt.y);
};

await page.mouse.click(215, 80); // first tap: unlocks audio
await page.waitForTimeout(2500);
await press("ENDLESS"); // (the home screen's play button)
await page.waitForTimeout(1500);
// record realm titles with the audio clock; then launch the run
await page.evaluate(() => {
  window.__titles = [];
  const hud = window.__glydrift.scene.getScene("Hud");
  const orig = hud.onBiome.bind(hud);
  hud.onBiome = (biome, opts) => {
    const g = window.__glydrift.scene.getScene("Game");
    window.__titles.push({
      heard: window.__music.heard(),
      biome,
      m: Math.round(g.meters),
      slam: !!opts?.slam,
      frameMs: window.__glydrift.loop.delta,
    });
    return orig(biome, opts);
  };
});
const fr = await page.evaluate(() => {
  const r = window.__glydrift.canvas.getBoundingClientRect();
  return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.6 };
});
for (let i = 0; i < 40; i++) {
  await page.mouse.click(fr.x, fr.y);
  await page.waitForTimeout(250);
  if (await page.evaluate(() => window.__glydrift.scene.getScene("Game").state === "playing"))
    break;
}
const t0 = Date.now();
let lastSeg = "";
while (Date.now() - t0 < SECONDS * 1000) {
  await page.mouse.click(fr.x, fr.y);
  await page.waitForTimeout(700);
  const s = await page.evaluate(() => {
    const g = window.__glydrift.scene.getScene("Game");
    return { state: g.state, m: Math.round(g.meters), seg: g.course.segAt(g.meters).id };
  });
  if (s.seg !== lastSeg) {
    lastSeg = s.seg;
    console.log(
      `  ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${String(s.m).padStart(5)} m  ${s.seg}`,
    );
  }
  if (s.state !== "playing") break;
}

// death in the middle of a transition: wait for a bridge in flight, then die + retry
let midBridge = null;
for (let i = 0; i < 80 && !midBridge; i++) {
  await page.waitForTimeout(500);
  midBridge = await page.evaluate(() => {
    const M = window.__music;
    if (!M.plan || M.ctx.currentTime < M.plan.S) return null;
    const from = M.plan.key;
    // what die() + GameOver RETRY do (god mode can't die)
    M.deathSweep();
    M.restore();
    window.__glydrift.scene.getScene("Game").resetRun(true);
    return from;
  });
}
await page.waitForTimeout(3000);
const afterRetry = await page.evaluate(() => {
  const M = window.__music;
  const g = window.__glydrift.scene.getScene("Game");
  return { status: M.status(), plan: !!M.plan, bridge: !!M.bridge, m: g.meters, state: g.state };
});

const res = await page.evaluate(async () => {
  const M = window.__music;
  // decoder check: the drop's impact must sit on the drop's first beat in the decoded file
  const { default: manifest } = await import(
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .find((n) => n.includes("manifest.json")) || "/src/audio/reggae/manifest.json"
  );
  const onsets = [];
  for (const id of ["void", "abyss", "hurricane"]) {
    const t = manifest.tracks[id];
    const buf = await M.load(t.files.drums);
    const d = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const want = M.offset + (t.pad || 0) + t.sections.drop[0] * t.bar;
    const from = Math.round((want - 0.08) * sr);
    const to = Math.round((want + 0.08) * sr);
    let base = 0;
    for (let i = from - 2000; i < from; i++) base = Math.max(base, Math.abs(d[i] || 0));
    let at = -1;
    for (let i = from; i < to; i++)
      if (Math.abs(d[i]) > Math.max(0.15, base * 2)) {
        at = i;
        break;
      }
    onsets.push({ id, errMs: at < 0 ? null : +((at / sr - want) * 1000).toFixed(1) });
  }
  return { log: M.log, titles: window.__titles, offset: M.offset, onsets };
});

const ok = [];
const bad = [];
const check = (cond, msg) => (cond ? ok : bad).push(msg);
console.log(`\ndecoder offset ${(res.offset * 1000).toFixed(1)} ms`);
for (const o of res.onsets)
  check(
    o.errMs !== null && Math.abs(o.errMs) < 6,
    `${o.id} drop hit decodes ${o.errMs} ms from its beat`,
  );
const lands = res.log.filter((e) => e.type === "land" || e.type === "abyss-drop");
const commits = res.log.filter((e) => e.type === "commit");
console.log("\nbridges:");
for (const c of commits) {
  const pr = res.log.find(
    (e) => e.type === "predict" && e.id.startsWith(c.id) && e.at >= c.at - 1e-6 - 30,
  );
  console.log(
    `  ${c.id.padEnd(18)} starts ${c.at.toFixed(3)}${pr ? `  (crossing predicted ${pr.at.toFixed(3)}, ${pr.id.split(" ").slice(1).join(" ")})` : ""}`,
  );
}
console.log("\nrealm entries (music landing vs. title):");
for (const t of res.titles) {
  const land = [...lands].reverse().find((l) => l.at <= t.heard + 0.05);
  const err = land ? (t.heard - land.at) * 1000 : NaN;
  console.log(
    `  biome ${String(t.biome).padStart(2)} at ${String(t.m).padStart(5)} m  ${t.slam ? "(slam) " : ""}` +
      `title ${t.heard.toFixed(3)}  landing ${land?.id ?? "?"} ${land?.at.toFixed(3) ?? "?"}  → ${err.toFixed(1)} ms` +
      `  (frame ${t.frameMs.toFixed(0)} ms)`,
  );
  // a title can only appear on a frame: on the beat = within one frame of it
  const tol = Math.max(20, t.frameMs * 1.5 + 10); // the frame before may have been longer
  check(
    err >= -10 && err <= tol,
    `title of biome ${t.biome} on its beat (${err.toFixed(1)} ms, frame ${t.frameMs.toFixed(0)} ms)`,
  );
}
check(commits.length >= 4, `${commits.length} bridges scheduled`);
check(
  res.titles.some((t) => t.slam),
  "the Abyss entrance slam happened",
);
check(res.titles.length >= 6, `${res.titles.length} realm titles`);
check(
  midBridge && afterRetry.status.id === "void" && !afterRetry.plan && !afterRetry.bridge,
  `death mid-bridge (${midBridge}) → retry plays Neon Void cleanly (${JSON.stringify(afterRetry.status)})`,
);
check(
  errors.length === 0,
  `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" / ")}` : ""}`,
);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
for (const b of bad) console.log(`  FAIL ${b}`);
await browser.close();
await server.close();
process.exit(bad.length ? 1 : 0);
