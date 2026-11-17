// The sky level renderer. Purely visual: gameplay never reads anything from here.
//
// How it stays fast and crisp:
// - Everything detailed (islands, clouds, moons, ruins) is painted ONCE into offscreen sprites by paint.js,
//   lazily as it comes near the screen, then only blitted each frame.
// - Canvases are backed at devicePixelRatio (capped at 2), sprites are blitted 1:1 at positions snapped to
//   whole device pixels, so nothing is resampled or blurred while it scrolls.
// - One rAF loop draws both canvases; it sleeps with the tab, and with reduced motion it only redraws
//   when the altitude changes.
//
// Layers, back to front (parallax factor in brackets):
//   sky gradient, stars (.04), sun/moons/planet + light shafts (.06), storied far feature (.08), giant creature,
//   far island strips (.15, .25), atmospheric haze, far clouds (.3), mid islands (.55), mid clouds (.65),
//   birds, landmark islands (1), particles   |   front canvas, above the glider: edge clouds + mist (1.35)
import { LANDMARKS } from '../shared/score.js';
import { THEMES, at, readability, resolveThemeId } from '../themes.js';
import {
  setPaintDpr, paintIsland, paintCloud, paintFarStrip, paintCelestial, paintFeature, paintGiant, paintRays,
  paintStars, paintParticle, paintBird, paintWisp, paperTexture, rng, hexA,
} from './paint.js';

const PX = 2.7; // screen pixels of climb per point (same as the original level)
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let back, front, bx, fx; // canvases + contexts
let W = 0, H = 0, dpr = 1;
let theme = null, themeId = null;
let target = 0; // altitude in points the game asked for
let cam = 0; // eased altitude the camera shows
let night = false;
const t0 = performance.now();
let lastT = 0;
let assets = null; // baked sprites for the current theme
let scene = null; // placed objects
const particles = [];
const bursts = [];
let flock = null;
let giant = null;
let dirty = true;

const snap = (v) => Math.round(v * dpr) / dpr;
function blit(ctx, S, x, y, alpha = 1) {
  if (!S) return;
  const w = S.c.width / dpr, h = S.c.height / dpr;
  if (x > W || y > H || x + w < 0 || y + h < 0) return;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(S.c, snap(x), snap(y), w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// ---------- baking ----------
const queue = [];
function lazy(make) {
  const job = { S: null, make };
  queue.push(job);
  return job;
}
function ensure(job) {
  if (!job.S) job.S = job.make();
  return job.S;
}
// Bake queued sprites in small slices while the browser is idle, so nothing stutters.
function pump() {
  const start = performance.now();
  while (queue.length && performance.now() - start < 8) {
    const j = queue.shift();
    if (!j.S) j.S = j.make();
  }
  if (queue.length) (window.requestIdleCallback || setTimeout)(pump, { timeout: 200 });
}

function bakeTheme() {
  setPaintDpr(dpr);
  queue.length = 0;
  const T = theme;
  assets = {
    celestial: paintCelestial(T),
    stars: paintStars(Math.max(W, 420), Math.max(H, 900)),
    rays: paintRays(T, Math.max(W, 420), Math.max(H, 900)),
    feature: paintFeature(T),
    particles: T.particles.map((p) => paintParticle(p.kind, p.color)),
    burst: paintParticle('mote', T.glow),
    birds: [paintBird(T.creatures.flock, 0), paintBird(T.creatures.flock, 1)],
    farA: lazy(() => paintFarStrip(T, { seed: 3, width: 900, height: 240, distance: 0.75 })),
    farB: lazy(() => paintFarStrip(T, { seed: 8, width: 1100, height: 280, distance: 0.45, dark: true })),
    giant: T.creatures.giant && T.feature !== 'whale' ? lazy(() => paintGiant(T, 0.8)) : null,
    clouds: [0, 1, 2].map((depth) => Array.from({ length: 3 }, (_, i) =>
      lazy(() => paintCloud(T, { seed: 100 + depth * 10 + i, width: [190, 290, 420][depth] * (0.85 + (i % 2) * 0.3), distance: [0.55, 0.22, 0][depth] })))),
    wisps: [lazy(() => paintWisp(T, 4)), lazy(() => paintWisp(T, 9))],
  };
}

function placeScene() {
  const T = theme;
  const r = rng(4242);
  const S = { landmarks: [], mid: [], clouds: [[], [], []], near: [] };
  // landmark islands at the same altitudes and sides as the original level (gameplay landmarks unchanged)
  const special = { '🎈': 'balloon', '🪁': 'kite', '🐋': 'whale', '🏮': 'lighthouse' };
  S.home = lazy(() => paintIsland(T, { seed: 3, width: 250, home: true }));
  LANDMARKS.forEach((lm, i) => {
    S.landmarks.push({
      at: lm.at, side: i % 2 ? 0.76 : 0.24, bob: i * 1.3,
      job: lazy(() => paintIsland(T, { seed: 17 + i * 7, width: 150 + ((i * 37) % 70), decor: T.details, landmark: special[lm.icon] || null })),
    });
  });
  // smaller, hazier islands in the middle distance, spread over the whole climb
  for (let i = 0; i < 8; i++) {
    const w = 64 + r() * 56, dist = 0.5 + r() * 0.12;
    S.mid.push({ at: -40 + i * 105 + r() * 40, x: r(), drift: 1.5 + r() * 2.5,
      job: lazy(() => paintIsland(T, { seed: 300 + i * 11, width: w, decor: T.details, distance: dist })) });
  }
  // clouds per depth, placed in world space so you climb past them
  // density is tuned per screen: each depth shows about 2-3 clouds at a time
  const counts = [5, 8];
  const spans = [1250, 950];
  for (let d = 0; d < 2; d++) {
    for (let i = 0; i < counts[d]; i++) {
      S.clouds[d].push({ at: -120 + (i / counts[d]) * spans[d] + r() * 50, x: r(), v: [3, 6][d] * (0.7 + r() * 0.6), k: i % 3 });
    }
  }
  // foreground clouds hug the screen edges, so the middle (where you read and play) stays calm
  for (let i = 0; i < 7; i++) S.near.push({ at: i * 120 + 40 + r() * 40, left: i % 2 === 0, k: i % 3 });
  scene = S;
  particles.length = 0;
  T.particles.forEach((p, pi) => {
    for (let i = 0; i < (quality >= 2 ? Math.ceil(p.count / 2) : p.count); i++) particles.push(newParticle(p.kind, pi, true));
  });
  flock = { x: -999, y: 0, next: 4 + Math.random() * 6, n: 6, phase: 0 };
  giant = { x: -999, y: 0, next: 8 + Math.random() * 10 };
}

function newParticle(kind, si, anywhere) {
  return {
    kind, si,
    x: Math.random() * W, y: anywhere ? Math.random() * H : (kind === 'leaf' || kind === 'ash' ? -10 : H + 10),
    vx: (Math.random() - 0.3) * 10, vy: { mote: -6, leaf: 22, spore: -5, ember: -18, ash: 12 }[kind] * (0.6 + Math.random() * 0.8),
    a: 0.5 + Math.random() * 0.5, ph: Math.random() * 6.28, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2,
  };
}

// ---------- theme + altitude ----------
export function applyTheme(id) {
  themeId = resolveThemeId(id);
  theme = THEMES[themeId];
  document.body.dataset.theme = themeId;
  root.style.setProperty('--g-dark', theme.glider.outlineDark);
  root.style.setProperty('--g-light', theme.glider.outlineLight);
  root.style.setProperty('--g-rim', theme.light.rim);
  root.style.setProperty('--g-shadow-x', `${-theme.light.side * 6}px`);
  root.style.setProperty('--spark', theme.glow);
  root.style.setProperty('--vignette', hexA(theme.vignette, 0.6));
  if (W) { bakeTheme(); placeScene(); pump(); }
  backdropDirty = true;
  updateReadability();
  dirty = true;
  document.dispatchEvent(new CustomEvent('sky-theme', { detail: { id: themeId } }));
}
export function getThemeId() { return themeId; }

function updateReadability() {
  if (!theme) return;
  const read = readability(theme, target);
  night = read.night;
  document.body.classList.toggle('night', night);
  root.style.setProperty('--sky-halo', read.halo + 'b3');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', read.colors[0]);
}

export function setAltitude(points, { instant = false } = {}) {
  target = points;
  if (instant || reduceMotion.matches) cam = points;
  backdropDirty = true;
  updateReadability();
  dirty = true;
}
export function getAltitude() { return target; }
export function isNight() { return night; }

// ---------- drawing ----------
let backdrop = null, bdx = null, bdCam = -1, bdT = -1, backdropDirty = true;
function paintBackdrop(t) {
  const T = theme, x = bdx;
  const camPx = cam * PX;
  const still = reduceMotion.matches;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [zen, mid, hor] = at(T.sky, cam);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, zen);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, hor);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const starA = at(T.stars, cam);
  if (starA > 0.01) blit(x, assets.stars, 0, ((camPx * 0.04) % 100) - 50, starA);
  const c = T.celestial;
  const cA = at(c.alpha, cam);
  const cs = assets.celestial;
  blit(x, cs, c.x * W - cs.w / 2, c.y * H - cs.h / 2 + camPx * c.sink, cA);
  x.globalCompositeOperation = 'lighter';
  const breathe = still ? 1 : 0.8 + 0.2 * Math.sin(t * 0.35);
  blit(x, assets.rays, 0, camPx * c.sink, T.rays.alpha * breathe * cA);
  x.globalCompositeOperation = 'source-over';
  if (assets.feature) {
    const F = assets.feature;
    const fxp = T.feature === 'whale' ? W - ((t * 4) % (W + F.w + 200)) : T.feature === 'spires' ? -W * 0.08 : W * 0.02;
    const fyp = (T.feature === 'spires' ? H * 0.42 : H * 0.22) + camPx * 0.08;
    blit(x, F, fxp, fyp, 0.9);
  }
  // atmospheric haze: thickest low down, where the distance is greatest
  const hz = x.createLinearGradient(0, H * 0.35, 0, H);
  hz.addColorStop(0, hexA(T.haze, 0));
  hz.addColorStop(1, hexA(T.haze, 0.38));
  x.fillStyle = hz;
  x.fillRect(0, H * 0.35, W, H * 0.65);
}

function drawBack(t, dt) {
  const T = theme, x = bx;
  const camPx = cam * PX;
  const still = reduceMotion.matches;
  const swayX = still ? 0 : Math.sin(t * 0.21) * 5, swayY = still ? 0 : Math.sin(t * 0.17) * 3;
  // (the cached backdrop layers sit so far away that camera sway would move them by under half a pixel)
  const sx = (p) => swayX * p, sy = (p) => swayY * p;

  // sky, stars, light source, shafts and the storied far feature: cached, repainted only when the camera
  // moves or ~7 times a second (for the slow breathing of the light), then copied in one draw
  if (backdropDirty || Math.abs(cam - bdCam) > 0.3 || t - bdT > 0.15) paintBackdrop(t), bdCam = cam, bdT = t, backdropDirty = false;
  x.drawImage(backdrop, 0, 0, W, H);

  // a giant creature crossing very far away now and then
  if (assets.giant && !still) {
    const G = ensure(assets.giant);
    if (giant.x < -900) { giant.next -= dt; if (giant.next <= 0) { giant.x = W + 40; giant.y = H * (0.18 + Math.random() * 0.2); } }
    else {
      giant.x -= 9 * dt;
      blit(x, G, giant.x, giant.y + camPx * 0.1, 0.55);
      if (giant.x < -G.w - 20) { giant.x = -999; giant.next = 45 + Math.random() * 40; }
    }
  }

  // far island strips, tiled and drifting
  const strip = (job, p, base, speed) => {
    const S = ensure(job);
    const y = base + camPx * p + sy(p);
    if (y > H) return;
    const off = still ? 0 : -((t * speed) % S.w);
    for (let xx = off; xx < W; xx += S.w) blit(x, S, xx + sx(p), y);
  };
  strip(assets.farA, 0.15, H * 0.5, 3);
  strip(assets.farB, 0.25, H * 0.66, 5);

  // far clouds, mid islands, mid clouds
  const clouds = (d, p) => {
    for (const cl of scene.clouds[d]) {
      const y = H * 0.6 - (cl.at - cam) * PX * p + sy(p);
      if (y < -60 || y > H + 300) continue;
      const S = ensure(assets.clouds[d][cl.k]);
      const span = W + S.w;
      const xx = ((((cl.x * span - (still ? 0 : t * cl.v)) % span) + span) % span) - S.w;
      blit(x, S, xx + sx(p), y - S.h);
    }
  };
  clouds(0, 0.3);
  for (const m of scene.mid) {
    const y = H * 0.6 - (m.at - cam) * PX * 0.55 + sy(0.55);
    if (y < -200 || y > H + 200) continue;
    const I = ensure(m.job);
    const span = W + I.S.w;
    const xx = ((((m.x * span - (still ? 0 : t * m.drift)) % span) + span) % span) - I.S.w;
    blit(x, I.S, xx + sx(0.55), y - I.topY);
  }
  clouds(1, 0.65);

  // distant flock
  if (!still) {
    const f = flock;
    if (f.x < -900) { f.next -= dt; if (f.next <= 0) { f.x = W + 30; f.y = H * (0.12 + Math.random() * 0.22); f.phase = 0; } }
    else {
      f.x -= 26 * dt; f.phase += dt;
      for (let i = 0; i < f.n; i++) {
        const fr = Math.floor(f.phase * 5 + i) % 2;
        blit(x, assets.birds[fr], f.x + i * 13 + (i % 2) * 6, f.y + (i % 3) * 7 + Math.sin(f.phase + i) * 2, 0.85);
      }
      if (f.x < -120) { f.x = -999; f.next = 20 + Math.random() * 25; }
    }
  }

  // landmark islands (parallax 1, same altitudes and sides as the original level) and the home island
  const bob = (k) => (still ? 0 : Math.sin(t * 0.55 + k) * 5);
  const home = ensure(scene.home);
  blit(x, home.S, W * 0.5 - home.cx + sx(1), H * 0.6 + 46 - home.topY + camPx + bob(0) + sy(1));
  for (const L of scene.landmarks) {
    const surfaceY = H * 0.6 - 30 - (L.at - cam) * PX - 50;
    if (surfaceY < -260 || surfaceY > H + 160) continue;
    const I = ensure(L.job);
    blit(x, I.S, W * L.side - I.cx + sx(1), surfaceY - I.topY + bob(L.bob) + sy(1));
  }

  // particles: pollen, spores, leaves, embers, ash; plus answer bursts
  if (!still) {
    for (const p of particles) {
      p.ph += dt;
      p.x += (p.vx + (p.kind === 'leaf' ? Math.sin(p.ph * 1.6) * 18 : Math.sin(p.ph) * 4)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y < -20 || p.y > H + 20 || p.x < -20 || p.x > W + 20) Object.assign(p, newParticle(p.kind, p.si, false));
      const S = assets.particles[p.si];
      const a = p.a * (p.kind === 'spore' || p.kind === 'mote' ? 0.55 + 0.45 * Math.sin(p.ph * 1.3) : 1);
      if (p.kind === 'leaf') {
        x.save(); x.translate(snap(p.x), snap(p.y)); x.rotate(p.rot); x.globalAlpha = a;
        x.drawImage(S.c, -8, -8, 16, 16); x.restore();
      } else blit(x, S, p.x - 8, p.y - 8, a);
    }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) { bursts.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.96; b.vy = b.vy * 0.96 + 14 * dt;
    blit(x, assets.burst, b.x - 8, b.y - 8, Math.min(1, b.life * 1.6));
  }
}

function drawFront(t) {
  const x = fx;
  x.clearRect(0, 0, W, H);
  const still = reduceMotion.matches;
  // foreground clouds at the screen edges only, moving faster than everything behind them
  for (const n of scene.near) {
    const y = H * 0.75 - (n.at - cam) * PX * 1.35;
    if (y < -200 || y > H + 300) continue;
    const S = ensure(assets.clouds[2][n.k]);
    const bobX = still ? 0 : Math.sin(t * 0.12 + n.at) * 14;
    blit(x, S, (n.left ? -S.w * 0.6 : W - S.w * 0.4) + bobX, y - S.h, 0.95);
  }
  // wind-blown mist low on the screen
  if (!still) {
    for (let i = 0; i < 2; i++) {
      const S = ensure(assets.wisps[i]);
      const span = W + S.w;
      const xx = ((((t * (14 + i * 8) + i * 300) % span) + span) % span) - S.w;
      blit(x, S, W - xx - S.w, H * (0.72 + i * 0.12));
    }
  }
}

// Pacing: 60 fps while the sky is climbing or a burst is flying, 30 fps otherwise (everything else moves
// slowly, so the difference can't be seen). If frames still run long, step the canvas resolution down.
let quality = 0; // 0: up to 2x, 1: 1.5x, 2: 1.25x and half the particles
let skip = false;
let slowFor = 0;
let lastDraw = 0;
// read-only numbers for checking performance from the console: skyStats()
const stats = { draws: 0, drawMs: 0 };
export function skyStats() { return { ...stats, quality, dpr, avgDrawMs: +(stats.drawMs / Math.max(1, stats.draws)).toFixed(2) }; }
function frame(now) {
  requestAnimationFrame(frame);
  const t = (now - t0) / 1000;
  const dt = Math.min(0.1, lastT ? t - lastT : 0.016);
  lastT = t;
  const still = reduceMotion.matches;
  if (!still) {
    const d = target - cam;
    cam = Math.abs(d) < 0.05 ? target : cam + d * (1 - Math.exp(-dt * 2.4));
  }
  const busy = cam !== target || bursts.length > 0;
  if (still ? !dirty : !busy && (skip = !skip)) return;
  const gap = t - lastDraw;
  lastDraw = t;
  // adaptive quality: sustained frames much slower than the pace we asked for
  if (!still && gap < 0.5) {
    slowFor = gap > (busy ? 1 / 60 : 1 / 30) * 1.6 ? slowFor + gap : Math.max(0, slowFor - gap * 0.5);
    if (slowFor > 2 && quality < 2) { quality += 1; slowFor = 0; W = 0; resize(); }
  }
  bx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d0 = performance.now();
  drawBack(t, busy || still ? dt : gap);
  drawFront(t);
  stats.draws += 1;
  stats.drawMs += performance.now() - d0;
  dirty = false;
}

function resize() {
  const ndpr = Math.min([2, 1.5, 1.25][quality], window.devicePixelRatio || 1);
  const nW = window.innerWidth, nH = window.innerHeight;
  if (nW === W && nH === H && ndpr === dpr) return;
  const rebake = ndpr !== dpr || !assets || Math.abs(nW - W) > 80 || Math.abs(nH - H) > 160;
  W = nW; H = nH; dpr = ndpr;
  for (const c of [back, front, backdrop]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
  }
  if (rebake && theme) { bakeTheme(); placeScene(); pump(); }
  backdropDirty = true;
  dirty = true;
}

export function initSky(id) {
  const sky = document.getElementById('sky');
  sky.innerHTML = '';
  back = document.createElement('canvas');
  back.className = 'sky-canvas';
  front = document.createElement('canvas');
  front.className = 'sky-canvas front';
  const wrap = document.createElement('div');
  wrap.id = 'glider-wrap';
  wrap.innerHTML = '<div id="glider"></div><div id="trail"></div>';
  const vignette = document.createElement('div');
  vignette.className = 'sky-vignette';
  sky.append(back, wrap, front, vignette);
  backdrop = document.createElement('canvas');
  bdx = backdrop.getContext('2d', { alpha: false });
  bx = back.getContext('2d', { alpha: false });
  fx = front.getContext('2d');
  applyTheme(id);
  resize();
  window.addEventListener('resize', resize);
  reduceMotion.addEventListener?.('change', () => { dirty = true; });
  // parchment grain for the UI panels, painted once from the same noise as the islands
  try { root.style.setProperty('--paper', `url(${paperTexture()})`); } catch {}
  requestAnimationFrame(frame);
}

// ---------- glider ----------
// A soft burst of motes from the glider when an answer lands (bigger for rarer answers).
export function sparkle(count = 14) {
  const g = document.getElementById('glider');
  const rect = g?.getBoundingClientRect();
  if (rect && !reduceMotion.matches) {
    const ox = rect.left + rect.width * 0.4, oy = rect.top + rect.height * 0.55;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
      bursts.push({ x: ox, y: oy, vx: Math.cos(a) * v - 30, vy: Math.sin(a) * v, life: 0.8 + Math.random() * 0.7 });
    }
  }
  if (!g) return;
  g.classList.remove('climb');
  void g.offsetWidth;
  g.classList.add('climb');
  setTimeout(() => g.classList.remove('climb'), 1700);
}

export async function mountGlider() {
  try {
    const svg = await (await fetch('art/glider.svg')).text();
    document.getElementById('glider').innerHTML = svg;
  } catch {
    document.getElementById('glider').innerHTML = '<img src="art/glider.svg" alt="" style="width:100%">';
  }
}
