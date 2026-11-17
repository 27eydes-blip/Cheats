// Procedural painting for the sky level. Every function here draws ONCE into an offscreen canvas
// (a "sprite"), which the renderer in sky.js then reuses every frame. Nothing here runs per frame.
//
// Conventions: sizes are CSS pixels; each sprite is backed at devicePixelRatio for crisp edges.
// Light comes from theme.light.side (1 = right, -1 = left) and slightly above; all shading follows it.

let DPR = 1;
export function setPaintDpr(d) { DPR = d; }

export function sprite(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * DPR));
  c.height = Math.max(1, Math.ceil(h * DPR));
  const x = c.getContext('2d');
  x.scale(DPR, DPR);
  return { c, x, w, h };
}

// ---------- randomness + noise ----------
export function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((A >> s) & 255) + ((((B >> s) & 255) - ((A >> s) & 255)) * t));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
export { hexA, mix };

// Tileable value-noise textures (fractal), made once and used as patterns for stone grain, cloud mottling, paper.
const noiseCache = {};
export function noiseTexture(size = 128, octaves = 4, seed = 1, contrastBoost = 1.4) {
  const key = `${size}:${octaves}:${seed}`;
  if (noiseCache[key]) return noiseCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const r = rng(seed);
  const lattices = [];
  for (let o = 0; o < octaves; o++) {
    const n = 4 << o;
    lattices.push({ n, v: Float32Array.from({ length: n * n }, () => r()) });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let v = 0, amp = 1, tot = 0;
      for (const L of lattices) {
        const fx = (px / size) * L.n, fy = (py / size) * L.n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = smooth(fx - x0), ty = smooth(fy - y0);
        const g = (i, j) => L.v[((j % L.n) * L.n) + (i % L.n)];
        const a = g(x0, y0), b = g(x0 + 1, y0), cc = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
        v += amp * (a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty);
        tot += amp;
        amp *= 0.55;
      }
      v = Math.max(0, Math.min(1, 0.5 + (v / tot - 0.5) * contrastBoost));
      const i = (py * size + px) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return (noiseCache[key] = c);
}

// Lay a noise texture over whatever is already drawn, only where it is drawn (source-atop), using a blend.
function texture(S, { alpha = 0.3, mode = 'overlay', seed = 1, size = 128, octaves = 4, scale = 1, ox = 0, oy = 0 } = {}) {
  const { x } = S;
  const pat = x.createPattern(noiseTexture(size, octaves, seed), 'repeat');
  pat.setTransform?.(new DOMMatrix([scale / DPR * DPR, 0, 0, scale, ox, oy]));
  x.save();
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = alpha;
  // emulate blend modes inside source-atop by drawing to a temp layer
  const t = sprite(S.w, S.h);
  t.x.fillStyle = pat;
  t.x.fillRect(0, 0, S.w, S.h);
  x.globalCompositeOperation = mode === 'multiply' ? 'multiply' : mode;
  x.drawImage(t.c, 0, 0, S.w, S.h);
  x.restore();
  // re-clip to the shape's alpha (blend modes can paint outside it)
  x.save();
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(S.mask || S.c, 0, 0, S.w, S.h);
  x.restore();
}

function keepMask(S) {
  const m = document.createElement('canvas');
  m.width = S.c.width; m.height = S.c.height;
  m.getContext('2d').drawImage(S.c, 0, 0);
  S.mask = m;
}

// Fade a finished sprite toward the atmosphere colour: further away = lighter, hazier, less contrast.
export function haze(S, color, amount) {
  if (amount <= 0) return S;
  const { x } = S;
  x.save();
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = hexA(color, Math.min(0.92, amount));
  x.fillRect(0, 0, S.w, S.h);
  x.restore();
  return S;
}

// ---------- islands ----------
// Returns { S, topY, cx } where topY is the walking surface height inside the sprite and cx its centre.
export function paintIsland(theme, { seed, width = 220, decor = null, landmark = null, distance = 0, home = false }) {
  const r = rng(seed);
  const L = theme.light;
  const side = L.side;
  const W = width;
  const depth = W * (0.42 + r() * 0.28);
  const pad = 30;
  const H = depth + 120 + pad;
  const topY = 92; // room above the surface for ruins, trees, towers
  const S = sprite(W + pad * 2, H + 60);
  const { x } = S;
  const ox = pad;
  const left = ox + 4, right = ox + W - 4;

  // --- silhouette: irregular lip, chunky jagged underside with 1-3 hanging spurs ---
  const lip = [];
  const nLip = 14;
  for (let i = 0; i <= nLip; i++) {
    const t = i / nLip;
    lip.push([left + t * (right - left), topY + (r() - 0.5) * 4 + Math.sin(t * Math.PI) * -3]);
  }
  const under = [];
  const nU = 22;
  const spurs = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ t: 0.25 + r() * 0.5, d: 0.12 + r() * 0.3, w: 0.09 + r() * 0.08 }));
  for (let i = nU; i >= 0; i--) {
    const t = i / nU;
    let d = Math.pow(Math.sin(t * Math.PI), 0.75) * depth * 0.62;
    for (const s of spurs) d += Math.max(0, 1 - Math.abs(t - s.t) / s.w) * depth * s.d;
    d += (i % 2 ? 1 : -1) * (3 + r() * 7) * Math.sin(t * Math.PI); // jagged teeth
    // broken ledge: a notch near one edge
    if (t > 0.86 && t < 0.92) d -= 10;
    under.push([left + t * (right - left) + (r() - 0.5) * 6, topY + 10 + d]);
  }
  const body = new Path2D();
  body.moveTo(lip[0][0], lip[0][1]);
  for (const p of lip) body.lineTo(p[0], p[1]);
  for (const p of under) body.lineTo(p[0], p[1]);
  body.closePath();

  // --- rock body ---
  const R = theme.rock;
  x.save();
  x.clip(body);
  const gx = x.createLinearGradient(side > 0 ? left : right, 0, side > 0 ? right : left, 0);
  gx.addColorStop(0, R.dark);
  gx.addColorStop(0.55, R.mid);
  gx.addColorStop(1, R.light);
  x.fillStyle = gx;
  x.fillRect(0, 0, S.w, S.h);
  // darker toward the hanging tips (ambient light comes from above)
  const gy = x.createLinearGradient(0, topY, 0, topY + depth * 1.2);
  gy.addColorStop(0, hexA(R.dark, 0));
  gy.addColorStop(1, hexA(R.crevice, 0.85));
  x.fillStyle = gy;
  x.fillRect(0, 0, S.w, S.h);
  // chiselled faces: a few planes catching or losing light
  for (let i = 0; i < 9; i++) {
    const cx = left + r() * (right - left), cy = topY + 14 + r() * depth * 0.6, s = 12 + r() * 26;
    x.beginPath();
    x.moveTo(cx - s, cy);
    x.lineTo(cx - s * 0.2, cy - s * 0.5);
    x.lineTo(cx + s * 0.9, cy + s * 0.1);
    x.lineTo(cx + s * 0.1, cy + s * 0.9);
    x.closePath();
    const lit = (cx - (left + right) / 2) * side > 0;
    x.fillStyle = lit ? hexA(R.light, 0.22) : hexA(R.crevice, 0.25);
    x.fill();
  }
  // strata: carved horizontal bands with a lit lower edge
  for (let i = 0; i < 6; i++) {
    const y0 = topY + 16 + i * (depth * 0.11) + r() * 6;
    x.beginPath();
    x.moveTo(left - 5, y0);
    for (let k = 0; k <= 10; k++) x.lineTo(left + (k / 10) * (right - left), y0 + Math.sin(k * 1.3 + i) * 3 + (r() - 0.5) * 3);
    x.strokeStyle = hexA(R.crevice, 0.42);
    x.lineWidth = 1.6;
    x.stroke();
    x.translate(0, 1.6);
    x.strokeStyle = hexA(R.light, 0.16);
    x.lineWidth = 1;
    x.stroke();
    x.translate(0, -1.6);
  }
  // cracks: random walks downward from the lip
  for (let i = 0; i < 6; i++) {
    let px = left + 15 + r() * (right - left - 30), py = topY + 8;
    x.beginPath();
    x.moveTo(px, py);
    const steps = 4 + Math.floor(r() * 5);
    for (let k = 0; k < steps; k++) { px += (r() - 0.5) * 12; py += 6 + r() * 10; x.lineTo(px, py); }
    x.strokeStyle = hexA(R.crevice, 0.75);
    x.lineWidth = 1.3;
    x.stroke();
    x.translate(side * 1.2, 0);
    x.strokeStyle = hexA(R.light, 0.22);
    x.lineWidth = 0.8;
    x.stroke();
    x.translate(-side * 1.2, 0);
  }
  // ambient occlusion right under the grass lip
  const ao = x.createLinearGradient(0, topY, 0, topY + 22);
  ao.addColorStop(0, hexA(R.crevice, 0.7));
  ao.addColorStop(1, hexA(R.crevice, 0));
  x.fillStyle = ao;
  x.fillRect(0, topY, S.w, 22);
  x.restore();

  // rim light along the sunward edge (inside the silhouette only)
  x.save();
  x.clip(body);
  const rg = x.createLinearGradient(side > 0 ? left : right, 0, side > 0 ? right : left, 0);
  rg.addColorStop(0, hexA(L.rim, 0));
  rg.addColorStop(0.7, hexA(L.rim, 0));
  rg.addColorStop(1, hexA(L.rim, 0.9));
  x.strokeStyle = rg;
  x.lineWidth = 5;
  x.stroke(body);
  x.restore();

  keepMask(S);
  texture(S, { alpha: 0.55, mode: 'overlay', seed: 3 + (seed % 5), size: 128, octaves: 5, ox: r() * 128, oy: r() * 128 });
  texture(S, { alpha: 0.18, mode: 'multiply', seed: 9, size: 64, octaves: 2, ox: r() * 64, oy: r() * 64 });
  S.mask = null;

  // --- hanging roots and vines ---
  const T = theme.top;
  for (let i = 0; i < 5 + Math.floor(r() * 5); i++) {
    const p = under[2 + Math.floor(r() * (under.length - 4))];
    let vx = p[0], vy = p[1] - 6;
    const len = 18 + r() * 60;
    const sway = (r() - 0.5) * 16;
    const segs = 8;
    for (let k = 0; k < segs; k++) {
      const nx = vx + sway / segs + (r() - 0.5) * 3, ny = vy + len / segs;
      x.beginPath();
      x.moveTo(vx, vy);
      x.lineTo(nx, ny);
      x.strokeStyle = k < 2 ? R.crevice : mix(R.crevice, T.grassDark, 0.5);
      x.lineWidth = 2.2 * (1 - k / segs) + 0.4;
      x.lineCap = 'round';
      x.stroke();
      if (k > 2 && r() < 0.45) {
        x.beginPath();
        x.ellipse(nx + (r() < 0.5 ? -2.5 : 2.5), ny, 2.6, 1.4, r() * 3, 0, Math.PI * 2);
        x.fillStyle = r() < 0.5 ? T.grassDark : T.moss;
        x.fill();
      }
      vx = nx; vy = ny;
    }
  }

  // --- waterfall from a notch in the lip ---
  if (r() < 0.55 || landmark === 'waterfall') {
    const wx = left + (side > 0 ? 0.15 + r() * 0.2 : 0.65 + r() * 0.2) * (right - left);
    const wlen = depth + 40;
    const wg = x.createLinearGradient(0, topY, 0, topY + wlen);
    wg.addColorStop(0, 'rgba(235,245,255,.95)');
    wg.addColorStop(0.6, 'rgba(220,235,255,.55)');
    wg.addColorStop(1, 'rgba(220,235,255,0)');
    x.fillStyle = wg;
    x.beginPath();
    x.moveTo(wx - 4, topY + 2);
    x.quadraticCurveTo(wx - 6, topY + wlen * 0.5, wx - 9, topY + wlen);
    x.lineTo(wx + 9, topY + wlen);
    x.quadraticCurveTo(wx + 6, topY + wlen * 0.5, wx + 4, topY + 2);
    x.fill();
    for (let k = 0; k < 4; k++) {
      x.beginPath();
      const sx = wx - 3 + k * 2;
      x.moveTo(sx, topY + 4);
      x.lineTo(sx + (k - 1.5) * 1.5, topY + wlen * (0.5 + r() * 0.4));
      x.strokeStyle = 'rgba(255,255,255,.6)';
      x.lineWidth = 0.8;
      x.stroke();
    }
    const mist = x.createRadialGradient(wx, topY + wlen * 0.85, 0, wx, topY + wlen * 0.85, 22);
    mist.addColorStop(0, 'rgba(255,255,255,.35)');
    mist.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = mist;
    x.fillRect(wx - 24, topY + wlen * 0.85 - 24, 48, 48);
  }

  // --- the top: soil lip, grass bed, moss drips, tufts ---
  x.beginPath();
  x.moveTo(lip[0][0], lip[0][1] + 6);
  for (const p of lip) x.lineTo(p[0], p[1] + 6);
  for (let i = lip.length - 1; i >= 0; i--) x.lineTo(lip[i][0], lip[i][1] - 2);
  x.closePath();
  x.fillStyle = T.soil;
  x.fill();
  const bed = new Path2D();
  bed.moveTo(lip[0][0] - 2, lip[0][1] + 1);
  for (const p of lip) bed.lineTo(p[0], p[1] - 1);
  bed.lineTo(lip.at(-1)[0] + 2, lip.at(-1)[1] + 1);
  for (let i = lip.length - 1; i >= 0; i--) bed.lineTo(lip[i][0], lip[i][1] - 9 - Math.sin((i / nLip) * Math.PI) * 5);
  bed.closePath();
  const bg = x.createLinearGradient(side > 0 ? left : right, 0, side > 0 ? right : left, 0);
  bg.addColorStop(0, T.grassDark);
  bg.addColorStop(1, T.grass);
  x.fillStyle = bg;
  x.fill(bed);
  // moss drips over the lip
  for (let i = 0; i < 10; i++) {
    const p = lip[1 + Math.floor(r() * (lip.length - 2))];
    x.beginPath();
    x.ellipse(p[0], p[1] + 3, 3 + r() * 5, 2 + r() * 5, 0, 0, Math.PI * 2);
    x.fillStyle = r() < 0.5 ? T.moss : T.grassDark;
    x.fill();
  }
  // tufts of grass blades, lighter on the sunward side
  for (let i = 0; i < W * 0.7; i++) {
    const t = r();
    const bx = left + t * (right - left), by = topY - 3 - Math.sin(t * Math.PI) * 4 - r() * 6;
    const h = 3 + r() * 6;
    const lit = (t - 0.5) * side > 0;
    x.beginPath();
    x.moveTo(bx, by + 2);
    x.quadraticCurveTo(bx + (r() - 0.5) * 3, by - h * 0.5, bx + (r() - 0.5) * 4, by - h);
    x.strokeStyle = lit ? mix(T.grass, L.color, 0.35) : r() < 0.5 ? T.grassDark : T.grass;
    x.lineWidth = 1.1;
    x.stroke();
  }

  // --- story details on top, each shaded for the same light and casting a soft shadow ---
  const top = (u) => topY - 6 - Math.sin(u * Math.PI) * 5;
  const props = [];
  if (home) props.push({ kind: 'tower', u: 0.62 }, { kind: 'stairs', u: 0.3 });
  else if (landmark) props.push({ kind: landmark, u: 0.5 });
  else {
    const n = W > 200 ? 2 : 1;
    for (let i = 0; i < n; i++) props.push({ kind: decor[(seed + i * 3) % decor.length], u: n === 1 ? 0.35 + r() * 0.3 : 0.22 + i * 0.5 + r() * 0.1 });
  }
  for (const p of props) paintProp(x, theme, p.kind, left + p.u * (right - left), top(p.u), r, W);

  if (distance > 0) haze(S, theme.haze, distance);
  return { S, topY, cx: ox + W / 2, padX: ox };
}

function castShadow(x, theme, cx, gy, w) {
  const sx = cx - theme.light.side * w * 0.45;
  const g = x.createRadialGradient(sx, gy, 0, sx, gy, w);
  g.addColorStop(0, hexA(theme.light.shadow, 0.35));
  g.addColorStop(1, hexA(theme.light.shadow, 0));
  x.save();
  x.scale(1, 0.3);
  x.fillStyle = g;
  x.fillRect(sx - w, gy / 0.3 - w, w * 2, w * 2);
  x.restore();
}

// shaded vertical block (column shaft, stone, tower) with lit side, shadow side and a rim line
function shadedRect(x, theme, X, Y, w, h, base) {
  const s = theme.light.side;
  const g = x.createLinearGradient(X, 0, X + w, 0);
  const lightC = mix(base, theme.light.color, 0.35), darkC = mix(base, theme.light.shadow, 0.55);
  g.addColorStop(0, s > 0 ? darkC : lightC);
  g.addColorStop(0.5, base);
  g.addColorStop(1, s > 0 ? lightC : darkC);
  x.fillStyle = g;
  x.fillRect(X, Y, w, h);
  x.fillStyle = hexA(theme.light.rim, 0.7);
  x.fillRect(s > 0 ? X + w - 1 : X, Y, 1, h);
}

function paintProp(x, theme, kind, cx, gy, r, W) {
  const St = theme.stone, s = theme.light.side;
  castShadow(x, theme, cx, gy, 26);
  if (kind === 'columns' || kind === 'pillar') {
    const n = kind === 'columns' ? 2 + Math.floor(r() * 2) : 1;
    for (let i = 0; i < n; i++) {
      const X = cx - (n - 1) * 9 + i * 18, h = (kind === 'pillar' ? 46 : 30) + r() * 26 * (i === n - 1 ? 0.3 : 1);
      shadedRect(x, theme, X - 4, gy - h, 8, h, St.mid);
      for (let f = 1; f < 3; f++) { x.fillStyle = hexA(St.dark, 0.35); x.fillRect(X - 4 + f * 2.6, gy - h + 3, 0.8, h - 6); }
      shadedRect(x, theme, X - 6, gy - 4, 12, 4, St.light);
      // broken capital: jagged top
      x.beginPath();
      x.moveTo(X - 6, gy - h);
      x.lineTo(X - 2, gy - h - 4 - r() * 4);
      x.lineTo(X + 1, gy - h - 1);
      x.lineTo(X + 6, gy - h - 3 - r() * 3);
      x.lineTo(X + 6, gy - h + 3);
      x.lineTo(X - 6, gy - h + 3);
      x.closePath();
      x.fillStyle = St.light;
      x.fill();
      if (kind === 'pillar') { // carved bands with a trim inlay
        x.fillStyle = St.trim;
        x.fillRect(X - 4, gy - h * 0.62, 8, 1.5);
        x.fillRect(X - 4, gy - h * 0.3, 8, 1.5);
      }
    }
  } else if (kind === 'arch') {
    const w = 34, h = 34;
    shadedRect(x, theme, cx - w / 2, gy - h, 7, h, St.mid);
    shadedRect(x, theme, cx + w / 2 - 7, gy - h * 0.7, 7, h * 0.7, St.mid);
    x.beginPath();
    x.arc(cx, gy - h + 2, w / 2 - 3.5, Math.PI, Math.PI * 1.72);
    x.strokeStyle = St.light;
    x.lineWidth = 7;
    x.stroke();
    x.strokeStyle = hexA(St.dark, 0.5);
    x.lineWidth = 1;
    x.stroke();
  } else if (kind === 'stairs') {
    for (let i = 0; i < 5; i++) shadedRect(x, theme, cx - 16 + i * 4 * s, gy - 4 - i * 4, 22 - i * 2, 4, i % 2 ? St.mid : St.light);
  } else if (kind === 'statue') {
    shadedRect(x, theme, cx - 7, gy - 8, 14, 8, St.dark);
    x.beginPath();
    x.moveTo(cx - 5, gy - 8); x.lineTo(cx - 4, gy - 30); x.quadraticCurveTo(cx, gy - 40, cx + 4, gy - 30); x.lineTo(cx + 5, gy - 8); x.closePath();
    x.fillStyle = mix(St.mid, theme.light.color, 0.2); x.fill();
    x.beginPath(); x.arc(cx, gy - 36, 3.6, 0, Math.PI * 2); x.fillStyle = St.light; x.fill();
    x.fillStyle = St.trim; x.fillRect(cx - 5, gy - 24, 10, 1.4);
  } else if (kind === 'stones') {
    for (let i = 0; i < 3; i++) {
      const X = cx - 18 + i * 14, h = 18 + r() * 16;
      x.beginPath();
      x.moveTo(X - 5, gy); x.lineTo(X - 4, gy - h); x.quadraticCurveTo(X, gy - h - 5, X + 4, gy - h + 1); x.lineTo(X + 5, gy); x.closePath();
      const g = x.createLinearGradient(X - 5, 0, X + 5, 0);
      g.addColorStop(s > 0 ? 0 : 1, theme.stone.dark); g.addColorStop(s > 0 ? 1 : 0, theme.stone.light);
      x.fillStyle = g; x.fill();
      paintRune(x, theme, X, gy - h * 0.55, r);
    }
  } else if (kind === 'lantern' || kind === 'brazier') {
    if (kind === 'lantern') {
      x.fillStyle = theme.rock.crevice; x.fillRect(cx - 1, gy - 30, 2, 30); x.fillRect(cx - 1, gy - 30, 9 * s, 2);
      glowDot(x, cx + 8 * s, gy - 22, theme.glow, 16);
      x.fillStyle = theme.rock.crevice; x.fillRect(cx + 8 * s - 3, gy - 27, 6, 1.5);
      x.fillStyle = theme.glow; x.fillRect(cx + 8 * s - 2.5, gy - 25, 5, 6);
    } else {
      x.fillStyle = theme.stone.dark; x.fillRect(cx - 2, gy - 14, 4, 14);
      x.beginPath(); x.moveTo(cx - 9, gy - 16); x.lineTo(cx + 9, gy - 16); x.lineTo(cx + 5, gy - 11); x.lineTo(cx - 5, gy - 11); x.closePath();
      x.fillStyle = theme.stone.mid; x.fill();
      glowDot(x, cx, gy - 20, theme.glow, 20);
      x.beginPath(); x.moveTo(cx - 6, gy - 16); x.quadraticCurveTo(cx - 3, gy - 28, cx, gy - 30); x.quadraticCurveTo(cx + 2, gy - 22, cx + 6, gy - 16); x.closePath();
      x.fillStyle = theme.glow; x.fill();
      x.beginPath(); x.moveTo(cx - 3, gy - 16); x.quadraticCurveTo(cx, gy - 24, cx + 3, gy - 16); x.fillStyle = '#fff2c8'; x.fill();
    }
  } else if (kind === 'shrine') {
    shadedRect(x, theme, cx - 14, gy - 22, 28, 22, St.mid);
    x.beginPath(); x.moveTo(cx - 18, gy - 22); x.lineTo(cx, gy - 34); x.lineTo(cx + 18, gy - 22); x.closePath();
    x.fillStyle = St.dark; x.fill();
    x.fillStyle = theme.rock.crevice; x.fillRect(cx - 5, gy - 16, 10, 16);
    glowDot(x, cx, gy - 9, theme.glow, 12);
    paintRune(x, theme, cx - 10, gy - 12, r);
  } else if (kind === 'chains') {
    paintProp(x, theme, 'pillar', cx, gy, r, W);
    chain(x, theme, cx + 4 * s, gy - 30, cx + 40 * s, gy + 60);
  } else if (kind === 'bridge') {
    const dir = s > 0 ? -1 : 1;
    const ex = cx + dir * W * 0.5;
    x.fillStyle = theme.stone.dark; x.fillRect(cx - 2, gy - 18, 3, 18);
    x.beginPath(); x.moveTo(cx, gy - 4);
    for (let i = 1; i <= 6; i++) x.lineTo(cx + ((ex - cx) * i) / 6, gy - 4 + Math.sin((i / 6) * Math.PI) * 6 + (i === 6 ? 14 : 0));
    x.strokeStyle = '#6b4a2a'; x.lineWidth = 2.4; x.stroke();
    for (let i = 1; i < 6; i++) { const px = cx + ((ex - cx) * i) / 6; x.fillStyle = '#8a6238'; x.fillRect(px - 2, gy - 6 + Math.sin((i / 6) * Math.PI) * 6, 4, 3); }
  } else if (kind === 'tree') {
    paintTree(x, theme, cx, gy, r);
  } else if (kind === 'tower') {
    shadedRect(x, theme, cx - 12, gy - 54, 24, 54, theme.stone.mid);
    for (let i = 0; i < 4; i++) { x.fillStyle = hexA(theme.stone.dark, 0.4); x.fillRect(cx - 12, gy - 12 - i * 12, 24, 1); }
    x.beginPath(); x.moveTo(cx - 16, gy - 54); x.lineTo(cx, gy - 74); x.lineTo(cx + 16, gy - 54); x.closePath();
    const rg = x.createLinearGradient(cx - 16, 0, cx + 16, 0);
    rg.addColorStop(s > 0 ? 0 : 1, '#5a2a2a'); rg.addColorStop(s > 0 ? 1 : 0, '#b85a40');
    x.fillStyle = rg; x.fill();
    x.fillStyle = theme.rock.crevice; x.fillRect(cx - 4, gy - 40, 8, 10);
    glowDot(x, cx, gy - 35, theme.glow, 10);
    // windsock on a pole: where gliders launch from
    x.fillStyle = theme.rock.crevice; x.fillRect(cx + 20 * s, gy - 46, 1.5, 46);
    x.beginPath(); x.moveTo(cx + 21 * s, gy - 46); x.lineTo(cx + 36 * s, gy - 43); x.lineTo(cx + 21 * s, gy - 39); x.fillStyle = '#c2453a'; x.fill();
  } else if (kind === 'lighthouse') {
    shadedRect(x, theme, cx - 8, gy - 80, 16, 80, theme.stone.light);
    for (let i = 0; i < 4; i++) { x.fillStyle = hexA('#8a2f2a', 0.8); x.fillRect(cx - 8, gy - 18 - i * 18, 16, 6); }
    x.fillStyle = theme.rock.crevice; x.fillRect(cx - 10, gy - 88, 20, 8);
    glowDot(x, cx, gy - 92, theme.glow, 34);
    x.fillStyle = '#fff1c4'; x.fillRect(cx - 5, gy - 96, 10, 8);
    x.beginPath(); x.moveTo(cx - 10, gy - 96); x.lineTo(cx, gy - 106); x.lineTo(cx + 10, gy - 96); x.closePath(); x.fillStyle = theme.rock.crevice; x.fill();
  } else if (kind === 'kite') {
    paintProp(x, theme, 'stones', cx - 10, gy, r, W);
    x.beginPath(); x.moveTo(cx, gy - 18); x.quadraticCurveTo(cx + 30 * s, gy - 70, cx + 50 * s, gy - 86);
    x.strokeStyle = 'rgba(60,40,30,.7)'; x.lineWidth = 0.8; x.stroke();
    x.beginPath(); x.moveTo(cx + 50 * s, gy - 98); x.lineTo(cx + 58 * s, gy - 86); x.lineTo(cx + 50 * s, gy - 74); x.lineTo(cx + 42 * s, gy - 86); x.closePath();
    x.fillStyle = '#c2453a'; x.fill();
    x.beginPath(); x.moveTo(cx + 50 * s, gy - 98); x.lineTo(cx + 58 * s, gy - 86); x.lineTo(cx + 50 * s, gy - 86); x.closePath(); x.fillStyle = '#e8a441'; x.fill();
  } else if (kind === 'balloon') {
    // a wrecked old balloon: deflated canvas draped over its basket
    x.fillStyle = '#7a5230'; x.fillRect(cx - 9, gy - 12, 18, 12);
    x.strokeStyle = '#4a3020'; x.lineWidth = 0.8; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(cx - 9, gy - 10 + i * 3); x.lineTo(cx + 9, gy - 10 + i * 3); x.stroke(); }
    x.beginPath(); x.moveTo(cx - 6, gy - 12); x.bezierCurveTo(cx - 40, gy - 50, cx + 10, gy - 70, cx + 34, gy - 6); x.lineTo(cx + 16, gy - 4);
    x.bezierCurveTo(cx + 8, gy - 40, cx - 18, gy - 34, cx - 6, gy - 12);
    const bg = x.createLinearGradient(cx - 30, 0, cx + 30, 0);
    bg.addColorStop(s > 0 ? 0 : 1, '#6a2a3a'); bg.addColorStop(s > 0 ? 1 : 0, '#d0705a');
    x.fillStyle = bg; x.fill();
  } else if (kind === 'whale') {
    // the sky whale asleep along the island, stone-grey with barnacles
    const w = 70;
    x.beginPath();
    x.moveTo(cx - w * 0.5, gy - 4);
    x.bezierCurveTo(cx - w * 0.5, gy - 30, cx + w * 0.3, gy - 32, cx + w * 0.45, gy - 10);
    x.lineTo(cx + w * 0.62, gy - 22); x.lineTo(cx + w * 0.6, gy - 2); x.closePath();
    const wg = x.createLinearGradient(0, gy - 32, 0, gy);
    wg.addColorStop(0, mix('#6f7fa8', theme.light.color, 0.25)); wg.addColorStop(1, '#2e3656');
    x.fillStyle = wg; x.fill();
    for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(cx - w * 0.2 + r() * w * 0.4, gy - 18 - r() * 8, 1.2 + r(), 0, Math.PI * 2); x.fillStyle = '#c9c2b0'; x.fill(); }
    x.beginPath(); x.moveTo(cx - w * 0.36, gy - 12); x.quadraticCurveTo(cx - w * 0.3, gy - 10, cx - w * 0.24, gy - 12); x.strokeStyle = '#1c2038'; x.lineWidth = 1.2; x.stroke();
  }
}

function paintRune(x, theme, X, Y, r) {
  const glyphs = [[[0, -4], [0, 4], [3, 0]], [[-2, -4], [2, 0], [-2, 4]], [[-3, -3], [3, 3], [0, 0], [3, -3]], [[0, -4], [-3, 0], [0, 4], [3, 0], [0, -4]]];
  const g = glyphs[Math.floor(r() * glyphs.length)];
  glowDot(x, X, Y, theme.glow, 7, 0.35);
  x.beginPath();
  g.forEach(([a, b], i) => (i ? x.lineTo(X + a, Y + b) : x.moveTo(X + a, Y + b)));
  x.strokeStyle = theme.glow;
  x.lineWidth = 1;
  x.stroke();
}

function glowDot(x, X, Y, color, rad, a = 0.45) {
  const g = x.createRadialGradient(X, Y, 0, X, Y, rad);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(1, hexA(color, 0));
  x.fillStyle = g;
  x.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
}

function chain(x, theme, x0, y0, x1, y1) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 10;
    x.beginPath();
    x.ellipse(px, py, i % 2 ? 1.4 : 2.6, i % 2 ? 2.6 : 1.4, 0, 0, Math.PI * 2);
    x.strokeStyle = '#2a2228';
    x.lineWidth = 1.2;
    x.stroke();
    x.strokeStyle = hexA(theme.light.rim, 0.5);
    x.lineWidth = 0.5;
    x.stroke();
  }
}

function paintTree(x, theme, cx, gy, r) {
  const s = theme.light.side, T = theme.top;
  const h = 26 + r() * 18;
  const bend = (r() - 0.5) * 10;
  x.beginPath();
  x.moveTo(cx - 2.5, gy);
  x.quadraticCurveTo(cx + bend, gy - h * 0.5, cx + bend * 0.6, gy - h);
  x.lineTo(cx + bend * 0.6 + 2, gy - h);
  x.quadraticCurveTo(cx + bend + 3, gy - h * 0.5, cx + 2.5, gy);
  x.fillStyle = theme.rock.crevice;
  x.fill();
  // foliage: dark clusters first, then lit clusters offset toward the light
  const fx = cx + bend * 0.6, fy = gy - h;
  const clusters = Array.from({ length: 7 }, () => [fx + (r() - 0.5) * 26, fy + (r() - 0.6) * 16, 6 + r() * 6]);
  for (const [a, b, q] of clusters) { x.beginPath(); x.arc(a, b, q, 0, Math.PI * 2); x.fillStyle = mix(T.grassDark, theme.light.shadow, 0.35); x.fill(); }
  for (const [a, b, q] of clusters) { x.beginPath(); x.arc(a + s * q * 0.3, b - q * 0.3, q * 0.7, 0, Math.PI * 2); x.fillStyle = T.grassDark; x.fill(); }
  for (const [a, b, q] of clusters) { x.beginPath(); x.arc(a + s * q * 0.5, b - q * 0.45, q * 0.38, 0, Math.PI * 2); x.fillStyle = mix(T.grass, theme.light.color, 0.3); x.fill(); }
}

// ---------- clouds: dense, sculpted, lit from one side, shadowed undersides ----------
export function paintCloud(theme, { seed, width = 300, distance = 0 }) {
  const r = rng(seed);
  const C = theme.clouds, s = theme.light.side;
  const W = width, H = width * 0.48;
  const S = sprite(W, H);
  const { x } = S;
  const base = H * 0.8;
  const puffs = [];
  const n = 9 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const dome = Math.sin(t * Math.PI);
    const rad = W * (0.07 + 0.1 * dome) * (0.8 + r() * 0.4);
    puffs.push([W * 0.08 + t * W * 0.84 + (r() - 0.5) * 10, base - rad * 0.55 - dome * H * 0.32 * r(), rad]);
  }
  for (let i = 0; i < 5; i++) {
    const t = 0.25 + r() * 0.5;
    const rad = W * (0.1 + r() * 0.08);
    puffs.push([W * t, base - H * 0.42 - r() * H * 0.12, rad]);
  }
  const silhouette = () => {
    x.beginPath();
    for (const [a, b, q] of puffs) { x.moveTo(a + q, b); x.arc(a, b, q, 0, Math.PI * 2); }
    x.rect(W * 0.08, base - H * 0.12, W * 0.84, H * 0.12);
  };
  // 1. shadow mass
  silhouette();
  x.fillStyle = C.shadow;
  x.fill();
  // 2. mid tones, shifted up and toward the light
  x.save();
  silhouette();
  x.clip();
  for (const [a, b, q] of puffs) {
    x.beginPath();
    x.arc(a + s * q * 0.14, b - q * 0.2, q * 0.88, 0, Math.PI * 2);
    x.fillStyle = C.mid;
    x.fill();
  }
  // 3. lit crowns
  for (const [a, b, q] of puffs) {
    const lx = a + s * q * 0.35, ly = b - q * 0.42;
    const g = x.createRadialGradient(lx, ly, 0, lx, ly, q * 0.78);
    g.addColorStop(0, C.lit);
    g.addColorStop(0.55, hexA(C.lit, 0.75));
    g.addColorStop(1, hexA(C.lit, 0));
    x.fillStyle = g;
    x.fillRect(lx - q, ly - q, q * 2, q * 2);
  }
  // 4. heavy underside
  const ug = x.createLinearGradient(0, base - H * 0.3, 0, base + 2);
  ug.addColorStop(0, hexA(C.under, 0));
  ug.addColorStop(1, hexA(C.under, 0.9));
  x.fillStyle = ug;
  x.fillRect(0, base - H * 0.3, W, H * 0.32);
  x.restore();
  keepMask(S);
  texture(S, { alpha: 0.35, mode: 'soft-light', seed: 21, size: 128, octaves: 4, ox: r() * 128, oy: r() * 128 });
  S.mask = null;
  if (distance > 0) haze(S, theme.haze, distance);
  return S;
}

// Long low bank of distant islands and spires: one horizontally tiling strip, very hazed.
export function paintFarStrip(theme, { seed, width = 900, height = 260, distance = 0.7, dark = false }) {
  const r = rng(seed);
  const S = sprite(width, height);
  const { x } = S;
  const color = mix(theme.farTint, dark ? theme.rock.dark : theme.haze, dark ? 0.35 : 0.2);
  const shapes = 5 + Math.floor(r() * 3);
  for (let i = 0; i < shapes; i++) {
    const cx = ((i + r() * 0.6) / shapes) * width, w = 60 + r() * 140, y = height * (0.35 + r() * 0.35);
    // keep shapes away from the tile edges so the strip repeats cleanly
    if (cx - w / 2 < 8 || cx + w / 2 > width - 8) continue;
    x.beginPath();
    x.moveTo(cx - w / 2, y);
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      x.lineTo(cx - w / 2 + t * w, y + Math.sin(t * Math.PI) * w * (0.35 + r() * 0.15) + (k % 2 ? 6 : -2));
    }
    x.lineTo(cx + w / 2, y);
    // spires and ruins on top
    const spires = Math.floor(r() * 3);
    for (let k = 0; k < spires; k++) {
      const sx = cx - w * 0.3 + r() * w * 0.6, sh = 14 + r() * 40;
      x.lineTo(sx + 4, y); x.lineTo(sx + 2, y - sh); x.lineTo(sx - 2, y - sh); x.lineTo(sx - 4, y);
    }
    x.closePath();
    const sg = x.createLinearGradient(0, y - 40, 0, y + w * 0.5);
    sg.addColorStop(0, mix(color, theme.light.rim, 0.12));
    sg.addColorStop(1, mix(color, theme.haze, 0.55));
    x.fillStyle = sg;
    x.fill();
    // a lit top edge
    x.beginPath();
    x.moveTo(cx - w / 2, y);
    x.lineTo(cx + w / 2, y);
    x.strokeStyle = hexA(theme.light.rim, 0.35);
    x.lineWidth = 1.2;
    x.stroke();
  }
  if (distance > 0) haze(S, theme.haze, distance * 0.5);
  return S;
}

// ---------- sky features ----------
export function paintCelestial(theme) {
  const c = theme.celestial;
  const size = c.r * 5;
  const S = sprite(size, size);
  const { x } = S;
  const m = size / 2;
  // bloom: only around the bright body
  const bloom = x.createRadialGradient(m, m, c.r * 0.6, m, m, size / 2);
  bloom.addColorStop(0, hexA(c.glow, 0.55));
  bloom.addColorStop(0.35, hexA(c.glow, 0.18));
  bloom.addColorStop(1, hexA(c.glow, 0));
  x.fillStyle = bloom;
  x.fillRect(0, 0, size, size);
  if (c.kind === 'sun') {
    const g = x.createRadialGradient(m, m, 0, m, m, c.r);
    g.addColorStop(0, c.core);
    g.addColorStop(0.75, c.color);
    g.addColorStop(1, hexA(c.color, 0.85));
    x.beginPath(); x.arc(m, m, c.r, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  } else if (c.kind === 'moons') {
    moon(x, m, m, c.r, c.core, c.color, theme.light.shadow, theme.light.side, 31);
    const s2 = c.second;
    const sx = m + s2.dx * size * 0.5, sy = m + s2.dy * size * 0.5;
    glowDot(x, sx, sy, s2.color, s2.r * 2.4, 0.35);
    moon(x, sx, sy, s2.r, mix(s2.color, '#ffffff', 0.4), s2.color, theme.light.shadow, theme.light.side, 47);
  } else if (c.kind === 'planet') {
    const R = c.r;
    // far half of the ring (behind the planet)
    ring(x, m, m, R, theme, true);
    x.save();
    x.beginPath(); x.arc(m, m, R, 0, Math.PI * 2); x.clip();
    const pg = x.createLinearGradient(m - R, 0, m + R, 0);
    pg.addColorStop(0, mix(c.color, theme.light.shadow, 0.7));
    pg.addColorStop(0.6, c.color);
    pg.addColorStop(1, c.core);
    x.fillStyle = pg; x.fillRect(m - R, m - R, R * 2, R * 2);
    const r = rng(77);
    for (let i = 0; i < 9; i++) {
      x.fillStyle = hexA(i % 2 ? '#7a3a3a' : '#ffd2a8', 0.12 + r() * 0.12);
      x.fillRect(m - R, m - R + (i / 9) * R * 2 + r() * 6, R * 2, 4 + r() * 10);
    }
    // night side terminator
    const tg = x.createRadialGradient(m + R * 0.6, m - R * 0.2, R * 0.4, m + R * 0.2, m, R * 1.4);
    tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(1, hexA(theme.light.shadow, 0.7));
    x.fillStyle = tg; x.fillRect(m - R, m - R, R * 2, R * 2);
    // ring shadow across the planet
    x.beginPath(); x.ellipse(m, m + R * 0.22, R * 1.9, R * 0.16, -0.18, 0, Math.PI * 2);
    x.fillStyle = hexA(theme.light.shadow, 0.35); x.fill();
    x.restore();
    ring(x, m, m, R, theme, false);
  }
  return S;
}

function moon(x, X, Y, R, core, color, shadow, side, seed) {
  x.save();
  x.beginPath(); x.arc(X, Y, R, 0, Math.PI * 2); x.clip();
  const g = x.createRadialGradient(X + side * R * 0.3, Y - R * 0.3, 0, X, Y, R * 1.1);
  g.addColorStop(0, core); g.addColorStop(1, color);
  x.fillStyle = g; x.fillRect(X - R, Y - R, R * 2, R * 2);
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const cx = X + (r() - 0.5) * R * 1.5, cy = Y + (r() - 0.5) * R * 1.5, cr = R * (0.06 + r() * 0.14);
    x.beginPath(); x.arc(cx, cy, cr, 0, Math.PI * 2); x.fillStyle = hexA(shadow, 0.12); x.fill();
    x.beginPath(); x.arc(cx + side * cr * 0.25, cy - cr * 0.25, cr * 0.75, 0, Math.PI * 2); x.fillStyle = hexA('#ffffff', 0.08); x.fill();
  }
  const t = x.createLinearGradient(X + side * R, 0, X - side * R, 0);
  t.addColorStop(0, 'rgba(0,0,0,0)'); t.addColorStop(0.6, 'rgba(0,0,0,0)'); t.addColorStop(1, hexA(shadow, 0.6));
  x.fillStyle = t; x.fillRect(X - R, Y - R, R * 2, R * 2);
  x.restore();
}

function ring(x, m, my, R, theme, back) {
  x.save();
  x.beginPath();
  x.rect(0, back ? 0 : my, m * 2, back ? my : m * 2);
  x.clip();
  x.translate(m, my);
  x.rotate(-0.18);
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.ellipse(0, 0, R * (1.45 + i * 0.13), R * (0.24 + i * 0.022), 0, 0, Math.PI * 2);
    x.strokeStyle = hexA(i === 2 ? theme.light.shadow : '#f3c79a', i === 2 ? 0.25 : 0.55 - i * 0.08);
    x.lineWidth = i === 2 ? 2 : 5;
    x.stroke();
  }
  x.restore();
}

// Distant shapes that give the sky a story: a floating mega-island, a sky whale, black spires.
export function paintFeature(theme) {
  const f = theme.feature;
  if (f === 'megaisland') {
    const S = sprite(420, 260);
    const { x } = S;
    const col = mix(theme.farTint, theme.haze, 0.25);
    x.beginPath();
    x.moveTo(40, 120);
    x.bezierCurveTo(80, 230, 300, 250, 380, 120);
    x.closePath();
    x.fillStyle = col; x.fill();
    // temple city on top: domes, colonnades, a tower
    x.fillStyle = mix(col, theme.light.shadow, 0.12);
    x.fillRect(120, 92, 160, 28);
    for (let i = 0; i < 9; i++) x.fillRect(124 + i * 18, 78, 6, 16);
    x.fillRect(118, 72, 166, 8);
    x.beginPath(); x.arc(200, 72, 22, Math.PI, 0); x.fill();
    x.fillRect(296, 40, 16, 80);
    x.beginPath(); x.moveTo(292, 40); x.lineTo(304, 20); x.lineTo(316, 40); x.fill();
    x.fillRect(70, 100, 40, 20);
    // lit rim along the sunward edges
    x.strokeStyle = hexA(theme.light.rim, 0.5); x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(118, 72); x.lineTo(284, 72); x.moveTo(312, 40); x.lineTo(312, 120); x.moveTo(222, 72); x.arc(200, 72, 22, 0, -0.9, true); x.stroke();
    // twin waterfalls
    for (const wx of [150, 260]) {
      const g = x.createLinearGradient(0, 120, 0, 250);
      g.addColorStop(0, 'rgba(255,240,220,.55)'); g.addColorStop(1, 'rgba(255,240,220,0)');
      x.fillStyle = g; x.fillRect(wx, 118, 5, 130);
    }
    return haze(S, theme.haze, 0.25);
  }
  if (f === 'whale') return paintGiant(theme, 1.4);
  if (f === 'spires') {
    const S = sprite(300, 320);
    const { x } = S;
    const col = mix(theme.farTint, theme.rock.dark, 0.25);
    const r = rng(5);
    for (let i = 0; i < 5; i++) {
      const cx = 40 + i * 52 + r() * 10, h = 120 + r() * 160, w = 18 + r() * 16;
      x.beginPath();
      x.moveTo(cx - w, 320); x.lineTo(cx - w * 0.5, 320 - h * 0.6); x.lineTo(cx - 3, 320 - h); x.lineTo(cx + 3, 320 - h); x.lineTo(cx + w * 0.5, 320 - h * 0.6); x.lineTo(cx + w, 320);
      x.fillStyle = col; x.fill();
      x.strokeStyle = hexA(theme.light.rim, 0.45); x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(cx + 3, 320 - h); x.lineTo(cx + w * 0.5, 320 - h * 0.6); x.stroke();
    }
    return haze(S, theme.haze, 0.2);
  }
  return null;
}

// A giant creature far away: sky whale (or winged drake for Ember). Silhouette with a faint lit edge.
export function paintGiant(theme, scale = 1) {
  const S = sprite(260 * scale, 110 * scale);
  const { x } = S;
  x.scale(scale, scale);
  const col = theme.creatures.giant || mix(theme.farTint, theme.light.shadow, 0.3);
  if (theme.creatures.winged) {
    x.beginPath();
    x.moveTo(30, 60); x.quadraticCurveTo(90, 50, 130, 58); x.quadraticCurveTo(170, 50, 210, 54); x.lineTo(240, 46); x.lineTo(222, 60);
    x.quadraticCurveTo(180, 70, 130, 66); x.quadraticCurveTo(80, 74, 30, 60);
    x.moveTo(110, 58); x.lineTo(70, 6); x.lineTo(100, 30); x.lineTo(120, 10); x.lineTo(140, 58);
    x.fillStyle = col; x.fill();
  } else {
    x.beginPath();
    x.moveTo(20, 60);
    x.bezierCurveTo(30, 20, 150, 18, 200, 48);
    x.lineTo(240, 30); x.lineTo(232, 56); x.lineTo(246, 78); x.lineTo(204, 64);
    x.bezierCurveTo(150, 92, 40, 92, 20, 60);
    x.fillStyle = col; x.fill();
    x.beginPath(); x.moveTo(80, 70); x.quadraticCurveTo(96, 100, 120, 94); x.quadraticCurveTo(108, 84, 104, 72); x.fill();
    x.strokeStyle = hexA(theme.light.rim, 0.35); x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(26, 46); x.bezierCurveTo(40, 22, 150, 20, 198, 46); x.stroke();
  }
  return haze(S, theme.haze, 0.35);
}

// Light shafts falling from the light source. Drawn additively at low alpha.
export function paintRays(theme, w, h) {
  const S = sprite(w, h);
  const { x } = S;
  const c = theme.celestial;
  const sx = c.x * w, sy = c.y * h;
  // shafts fan away from the light toward the open middle of the sky
  const toward = Math.atan2(h * 0.35 - sy, w * 0.5 - sx);
  const r = rng(13);
  for (let i = 0; i < 6; i++) {
    const a = toward + (i / 5 - 0.5) * 1.6 + (r() - 0.5) * 0.15;
    const len = Math.max(w, h) * 1.3, spread = 0.035 + r() * 0.04;
    // three nested wedges of falling strength give each shaft soft edges without any blur
    for (const [k, alpha] of [[1, 0.18], [0.6, 0.22], [0.3, 0.3]]) {
      const g = x.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      g.addColorStop(0, hexA(theme.rays.color, alpha));
      g.addColorStop(0.7, hexA(theme.rays.color, alpha * 0.25));
      g.addColorStop(1, hexA(theme.rays.color, 0));
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx + Math.cos(a - spread * k) * len, sy + Math.sin(a - spread * k) * len);
      x.lineTo(sx + Math.cos(a + spread * k) * len, sy + Math.sin(a + spread * k) * len);
      x.closePath();
      x.fillStyle = g;
      x.fill();
    }
  }
  return S;
}

export function paintStars(w, h, seed = 3) {
  const S = sprite(w, h);
  const { x } = S;
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 2600; i++) {
    const a = r();
    x.fillStyle = a < 0.15 ? 'rgba(255,236,196,.95)' : `rgba(255,255,255,${0.35 + r() * 0.6})`;
    const s = a < 0.06 ? 1.6 : 0.6 + r() * 0.7;
    x.fillRect(r() * w, r() * h * 0.75, s, s);
  }
  return S;
}

// Tiny particle sprites (one each), and two wing frames for distant birds.
export function paintParticle(kind, color) {
  const S = sprite(16, 16);
  const { x } = S;
  if (kind === 'leaf') {
    x.translate(8, 8);
    x.beginPath(); x.ellipse(0, 0, 5, 2.4, 0.4, 0, Math.PI * 2);
    x.fillStyle = color; x.fill();
    x.strokeStyle = 'rgba(60,30,10,.6)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-4, -1.6); x.lineTo(4, 1.6); x.stroke();
  } else if (kind === 'ash') {
    x.fillStyle = hexA(color, 0.8); x.fillRect(6, 7, 3, 1.6);
  } else {
    // mote / spore / ember: bright core with a small soft halo (the only "bloom" particles get)
    glowDot(x, 8, 8, color, 7, kind === 'ember' ? 0.6 : 0.4);
    x.beginPath(); x.arc(8, 8, kind === 'mote' ? 1.3 : 1.6, 0, Math.PI * 2);
    x.fillStyle = kind === 'ember' ? '#fff0c8' : color; x.fill();
  }
  return S;
}

export function paintBird(color, frame) {
  const S = sprite(16, 10);
  const { x } = S;
  x.beginPath();
  if (frame === 0) { x.moveTo(1, 3); x.quadraticCurveTo(5, 1, 8, 6); x.quadraticCurveTo(11, 1, 15, 3); }
  else { x.moveTo(1, 8); x.quadraticCurveTo(5, 4, 8, 6); x.quadraticCurveTo(11, 4, 15, 8); }
  x.strokeStyle = color;
  x.lineWidth = 1.5;
  x.lineCap = 'round';
  x.stroke();
  return S;
}

// Soft mist wisp for the foreground (wind-blown mist).
export function paintWisp(theme, seed) {
  const r = rng(seed);
  const S = sprite(360, 90);
  const { x } = S;
  for (let i = 0; i < 6; i++) {
    const cx = 60 + r() * 240, cy = 45 + (r() - 0.5) * 20, rx = 60 + r() * 80, ry = 10 + r() * 10;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, hexA(theme.clouds.lit, 0.22));
    g.addColorStop(1, hexA(theme.clouds.lit, 0));
    x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy);
    x.fillStyle = g; x.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
    x.restore();
  }
  return S;
}

// Paper grain for the parchment UI panels (a small tile, used as a CSS background).
export function paperTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#f2e4c4';
  x.fillRect(0, 0, 160, 160);
  x.globalAlpha = 0.16;
  x.globalCompositeOperation = 'multiply';
  x.drawImage(noiseTexture(160, 5, 99, 1.6), 0, 0);
  x.globalAlpha = 0.08;
  x.drawImage(noiseTexture(80, 2, 7, 1.2), 0, 0, 160, 160);
  return c.toDataURL('image/png');
}
