// Draws the OBLIVION GP app icon (original art: a neon race car seen from behind, launching down a
// glowing track into a black hole with a magenta/cyan accretion ring) and saves every PNG size.
// Run from hunt/: node scripts/brand-icon.mjs   (needs the Playwright Chromium that the e2e tests use)
// Also writes docs/brand/icon-sizes.png (the icon at 1024, 180 and 60 px side by side).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outIcons = fileURLToPath(new URL('../public/icons/', import.meta.url));
const outDocs = fileURLToPath(new URL('../docs/brand/', import.meta.url));
mkdirSync(outIcons, { recursive: true });
mkdirSync(outDocs, { recursive: true });

// Seeded random so the star field is identical on every run (stable diffs).
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const f = (n) => n.toFixed(1);

// The black hole sits above centre; the track's vanishing point is just under it.
const HX = 512, HY = 392, HR = 128; // horizon centre and radius
const TILT = -9, SQUASH = 0.4; // accretion disk seen at a low angle, slightly banked

function stars(dim) {
  const r = rng(7);
  let s = '';
  for (let i = 0; i < 80; i++) {
    const x = r() * 1024, y = r() * 700, rad = 1.2 + r() * 2.8, a = (0.35 + r() * 0.6) * (dim ? 0.55 : 1);
    if (Math.hypot(x - HX, (y - HY) / 0.6) < 470) continue; // keep the disk area clean
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="#fff" opacity="${a.toFixed(2)}"/>`;
  }
  return s;
}

// Light streaks far out that bend in toward the hole (gravity curving the light).
function streaks() {
  const P = [
    ['M-40 150 C 200 70, 340 170, 400 290', '#7ff6ff', 8],
    ['M1064 120 C 830 50, 690 160, 628 288', '#ff5bd8', 8],
    ['M-40 560 C 120 600, 260 560, 330 470', '#ff5bd8', 6],
    ['M1064 590 C 900 620, 760 570, 700 474', '#7ff6ff', 6],
    ['M250 -30 C 290 110, 380 190, 446 262', '#d9ccff', 5],
    ['M790 -30 C 750 100, 660 190, 584 260', '#d9ccff', 5],
  ];
  let defs = '', paths = '';
  P.forEach(([d, c, w], i) => {
    const [x1, y1] = d.match(/^M(-?\d+) (-?\d+)/).slice(1).map(Number);
    defs += `<linearGradient id="st${i}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${HX}" y2="${HY}"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".6" stop-color="${c}" stop-opacity=".8"/><stop offset=".85" stop-color="#fff"/></linearGradient>`;
    paths += `<path d="${d}" stroke="url(#st${i})" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  });
  return `<defs>${defs}</defs>${paths}`;
}

// Spiral arms of the accretion disk in disk space (a flat circle; the caller squashes and banks it).
// Each arm is split into segments that get thicker and brighter as they wind inward.
function arms(core) {
  const N = 8, SEG = 14, R0 = 480, R1 = HR + 22, TURN = 2.3;
  let s = '';
  for (let k = 0; k < N; k++) {
    const col = k % 2 ? '#22e6ff' : '#ff2fc8', th0 = (k / N) * Math.PI * 2;
    for (let j = 0; j < SEG; j++) {
      const pt = (u) => { const r = R0 + (R1 - R0) * Math.pow(u, 0.8), th = th0 + TURN * u; return [HX + r * Math.cos(th), HY + r * Math.sin(th)]; };
      const u0 = j / SEG, u1 = (j + 1) / SEG, um = (u0 + u1) / 2, [x0, y0] = pt(u0), [xm, ym] = pt(um), [x1, y1] = pt(u1);
      // quadratic through the midpoint: control = 2*mid - (start+end)/2
      const cx = 2 * xm - (x0 + x1) / 2, cy = 2 * ym - (y0 + y1) / 2;
      const w = (core ? 6 : 22) + (core ? 14 : 46) * u1, o = 0.15 + 0.85 * u1;
      s += `<path d="M${f(x0)} ${f(y0)}Q${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}" stroke="${core && u1 > 0.7 ? '#fff' : col}" stroke-opacity="${o.toFixed(2)}" stroke-width="${f(w)}" fill="none" stroke-linecap="round"/>`;
    }
  }
  return s;
}

// The disk itself: spiral arms on a hot glowing ring, drawn in disk space.
function disk(id) {
  return `<g filter="url(#glow)">${arms(false)}</g>${arms(true)}
    <circle cx="${HX}" cy="${HY}" r="${HR + 60}" fill="none" stroke="url(#${id})" stroke-width="70" filter="url(#glow)"/>
    <circle cx="${HX}" cy="${HY}" r="${HR + 56}" fill="none" stroke="url(#${id})" stroke-width="30"/>
    <circle cx="${HX}" cy="${HY}" r="${HR + 52}" fill="none" stroke="#fff" stroke-width="7" opacity=".85"/>`;
}

// Speed streaks rushing past the car toward the vanishing point inside the hole.
function speed() {
  const L = [[-0.82, 600, 240, 7], [-0.95, 560, 200, 5], [-1.06, 640, 260, 4], [0.8, 620, 250, 7], [0.93, 560, 200, 5], [1.05, 650, 260, 4]];
  let defs = '', s = '';
  L.forEach(([a, r0, len, w], i) => {
    const ang = Math.PI / 2 + a * 1.25, r1 = r0 - len;
    const x0 = HX + r0 * Math.cos(ang), y0 = HY + 60 + r0 * Math.sin(ang), x1 = HX + r1 * Math.cos(ang), y1 = HY + 60 + r1 * Math.sin(ang);
    defs += `<linearGradient id="sp${i}" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient>`;
    s += `<path d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}" stroke="url(#sp${i})" stroke-width="${w}" stroke-linecap="round"/>`;
  });
  return `<defs>${defs}</defs>${s}`;
}

// The whole icon on a 1024 canvas. `pad` shrinks the art toward the centre (maskable safe zone);
// `round` clips the corners (favicon); `mode` 'dark' drops the violet nebula for the iOS dark icon.
function iconSvg({ pad = 1, mode = 'color', round = 0 } = {}) {
  const dark = mode === 'dark';
  const t = pad === 1 ? '' : `transform="translate(${512 * (1 - pad)} ${512 * (1 - pad)}) scale(${pad})"`;
  const diskT = `translate(${HX} ${HY}) rotate(${TILT}) scale(1 ${SQUASH}) translate(${-HX} ${-HY})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <radialGradient id="space" cx="${HX}" cy="${HY}" r="820" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${dark ? '#0c0418' : '#3a0f6e'}"/>
    <stop offset=".5" stop-color="${dark ? '#06020e' : '#1e0840'}"/>
    <stop offset="1" stop-color="#020006"/>
  </radialGradient>
  <radialGradient id="halo" cx="${HX}" cy="${HY}" r="420" gradientUnits="userSpaceOnUse">
    <stop offset=".25" stop-color="#ff3fd0" stop-opacity="${dark ? .3 : .5}"/>
    <stop offset=".6" stop-color="#7a2cff" stop-opacity="${dark ? .15 : .28}"/>
    <stop offset="1" stop-color="#7a2cff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ringF" x1="${HX - 200}" y1="0" x2="${HX + 200}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff2fc8"/><stop offset=".5" stop-color="#ffe6fb"/><stop offset="1" stop-color="#1fe3ff"/>
  </linearGradient>
  <linearGradient id="ringB" x1="${HX - 200}" y1="0" x2="${HX + 200}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff2fc8"/><stop offset=".5" stop-color="#d8c4ff"/><stop offset="1" stop-color="#1fe3ff"/>
  </linearGradient>
  <linearGradient id="track" x1="0" y1="1024" x2="0" y2="${HY + 150}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1c0b38"/><stop offset="1" stop-color="#05020c"/>
  </linearGradient>
  <linearGradient id="edgeL" x1="0" y1="1024" x2="0" y2="${HY + 160}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff3fd0"/><stop offset="1" stop-color="#ff3fd0" stop-opacity=".2"/>
  </linearGradient>
  <linearGradient id="edgeR" x1="0" y1="1024" x2="0" y2="${HY + 160}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#22e6ff"/><stop offset="1" stop-color="#22e6ff" stop-opacity=".2"/>
  </linearGradient>
  <linearGradient id="body" x1="0" y1="610" x2="0" y2="900" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#4b2f92"/><stop offset=".4" stop-color="#231545"/><stop offset="1" stop-color="#0b0619"/>
  </linearGradient>
  <linearGradient id="tail" x1="250" y1="0" x2="774" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff2fc8"/><stop offset=".5" stop-color="#ff9cec"/><stop offset="1" stop-color="#ff2fc8"/>
  </linearGradient>
  <radialGradient id="flame" cx="512" cy="880" r="150" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#8ff8ff"/><stop offset="1" stop-color="#1fe3ff" stop-opacity="0"/>
  </radialGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="glowS" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
  <clipPath id="front"><rect x="0" y="${HY}" width="1024" height="700"/></clipPath>
  <clipPath id="back"><rect x="0" y="-300" width="1024" height="${HY + 300}"/></clipPath>
  <clipPath id="corner"><rect width="1024" height="1024" rx="${round}"/></clipPath>
</defs>
<g ${round ? 'clip-path="url(#corner)"' : ''}>
<rect width="1024" height="1024" fill="url(#space)"/>
<g ${t}>
  ${stars(dark)}
  <circle cx="${HX}" cy="${HY}" r="420" fill="url(#halo)"/>
  ${streaks()}
  <!-- far half of the accretion disk, behind the hole -->
  <g transform="${diskT}"><g clip-path="url(#back)">${disk('ringB')}</g></g>
  <!-- light from the far side bent up over the top of the hole -->
  <path d="M${HX - HR - 34} ${HY + 6} A ${HR + 36} ${HR + 40} 0 0 1 ${HX + HR + 34} ${HY - 6}" fill="none" stroke="url(#ringB)" stroke-width="40" filter="url(#glow)"/>
  <path d="M${HX - HR - 26} ${HY + 4} A ${HR + 28} ${HR + 30} 0 0 1 ${HX + HR + 26} ${HY - 4}" fill="none" stroke="url(#ringB)" stroke-width="12"/>
  <!-- event horizon with its thin photon ring -->
  <circle cx="${HX}" cy="${HY}" r="${HR + 6}" fill="none" stroke="#ffe0fb" stroke-width="16" filter="url(#glowS)"/>
  <circle cx="${HX}" cy="${HY}" r="${HR}" fill="#000"/>
  <circle cx="${HX}" cy="${HY}" r="${HR + 3}" fill="none" stroke="#fff" stroke-width="4"/>
  <!-- the track: neon edges running into the hole -->
  <path d="M-255 1400 L${HX - 8} ${HY + 40} L${HX + 8} ${HY + 40} L1279 1400Z" fill="url(#track)"/>
  <path d="M-255 1400 L${HX - 8} ${HY + 40}" stroke="url(#edgeL)" stroke-width="30" filter="url(#glowS)"/>
  <path d="M-255 1400 L${HX - 8} ${HY + 40}" stroke="url(#edgeL)" stroke-width="10"/>
  <path d="M1279 1400 L${HX + 8} ${HY + 40}" stroke="url(#edgeR)" stroke-width="30" filter="url(#glowS)"/>
  <path d="M1279 1400 L${HX + 8} ${HY + 40}" stroke="url(#edgeR)" stroke-width="10"/>

  <!-- near half of the disk, in front of the hole -->
  <g transform="${diskT}"><g clip-path="url(#front)">${disk('ringF')}</g></g>

  <!-- the car from behind: a low, wide hypercar with a full-width light bar -->
  <ellipse cx="512" cy="930" rx="330" ry="44" fill="#22e6ff" opacity=".45" filter="url(#glow)"/>
  <ellipse cx="512" cy="905" rx="120" ry="70" fill="url(#flame)" filter="url(#glowS)"/>
  ${speed()}
  <!-- wide rear tyres with neon sidewall glints -->
  <rect x="164" y="770" width="168" height="176" rx="34" fill="#05030b"/>
  <rect x="692" y="770" width="168" height="176" rx="34" fill="#05030b"/>
  <path d="M176 812 v96" stroke="#ff3fd0" stroke-width="8" stroke-linecap="round"/>
  <path d="M848 812 v96" stroke="#22e6ff" stroke-width="8" stroke-linecap="round"/>
  <!-- body: haunches over the wheels, a teardrop cabin, a ducktail -->
  <path d="M250 900 L774 900 Q826 896 834 846 L842 774 Q846 726 800 712 L690 686 Q660 600 512 588 Q364 600 334 686 L224 712 Q178 726 182 774 L190 846 Q198 896 250 900Z" fill="url(#body)"/>
  <!-- rim light from the disk along the roofline and haunches -->
  <path d="M184 770 Q178 726 224 712 L334 686 Q364 600 512 588 Q660 600 690 686 L800 712 Q846 726 840 770" fill="none" stroke="#7ff6ff" stroke-width="12" stroke-linejoin="round" filter="url(#glowS)"/>
  <path d="M184 770 Q178 726 224 712 L334 686 Q364 600 512 588 Q660 600 690 686 L800 712 Q846 726 840 770" fill="none" stroke="#effeff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- rear window -->
  <path d="M398 686 Q420 628 512 620 Q604 628 626 686Z" fill="#07040f"/>
  <path d="M414 680 Q436 638 512 632 Q588 638 610 680" fill="none" stroke="#ff8be6" stroke-width="5" opacity=".75"/>
  <!-- low rear wing on two struts, wider than the body -->
  <path d="M440 700 V676 M584 700 V676" stroke="#0b0619" stroke-width="16"/>
  <path d="M206 652 L818 652 L810 680 L214 680Z" fill="#160d30"/>
  <path d="M206 652 L818 652" stroke="#7ff6ff" stroke-width="10" filter="url(#glowS)"/>
  <path d="M206 652 L818 652" stroke="#effeff" stroke-width="4" stroke-linecap="round"/>
  <rect x="196" y="636" width="22" height="70" rx="6" fill="#0b0619"/>
  <rect x="806" y="636" width="22" height="70" rx="6" fill="#0b0619"/>
  <path d="M207 642 v56" stroke="#ff3fd0" stroke-width="6" stroke-linecap="round"/>
  <path d="M817 642 v56" stroke="#22e6ff" stroke-width="6" stroke-linecap="round"/>
  <!-- light bar -->
  <rect x="210" y="742" width="604" height="44" rx="22" fill="#ff2fc8" filter="url(#glow)"/>
  <rect x="216" y="748" width="592" height="32" rx="16" fill="url(#tail)"/>
  <rect x="248" y="757" width="528" height="12" rx="6" fill="#fff"/>
  <!-- diffuser and exhaust -->
  <path d="M370 820 v64 M440 820 v72 M584 820 v72 M654 820 v64" stroke="#2c1b56" stroke-width="12" stroke-linecap="round"/>
  <circle cx="512" cy="856" r="30" fill="#07040f"/>
  <circle cx="512" cy="856" r="20" fill="#dcfdff"/>
</g>
</g>
</svg>`;
}

// ---- PNG writer (RGB when opaque, so the App Store icon has no alpha channel) ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(rgba, w, h, alpha) {
  const ch = alpha ? 4 : 3, raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * ch + 1);
    raw[o] = 0;
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) raw[o + 1 + x * ch + c] = rgba[(y * w + x) * 4 + c];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Rasterise an SVG at `size` px in Chromium (vector, so every size is drawn crisp, not scaled down).
// `gray` turns it into a luminance-only image for the iOS tinted icon.
async function raster(page, svg, size, { gray = false } = {}) {
  const b64 = await page.evaluate(async ({ svg, size, gray }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, size, size);
    const d = g.getImageData(0, 0, size, size).data;
    if (gray) for (let i = 0; i < d.length; i += 4) {
      // Luminance, lifted a little so the glow reads strongly once iOS applies its tint.
      const l = Math.min(255, Math.pow((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255, 0.8) * 255);
      d[i] = d[i + 1] = d[i + 2] = l;
    }
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) s += String.fromCharCode.apply(null, d.subarray(i, i + CH));
    return btoa(s);
  }, { svg, size, gray });
  return Buffer.from(b64, 'base64');
}

const ICONS = [
  // [file, size, svg options, raster options, keep alpha]
  ['oblivion-1024.png', 1024, {}, {}, false], // App Store / master: square corners, no alpha
  ['oblivion-180.png', 180, {}, {}, false], // iPhone apple-touch-icon
  ['oblivion-167.png', 167, {}, {}, false], // iPad Pro
  ['oblivion-152.png', 152, {}, {}, false], // iPad
  ['oblivion-120.png', 120, {}, {}, false], // iPhone (older)
  ['oblivion-87.png', 87, {}, {}, false], // iPhone settings @3x
  ['oblivion-192.png', 192, { round: 200 }, {}, true], // manifest "any"
  ['oblivion-512.png', 512, { round: 200 }, {}, true], // favicon + manifest "any"
  ['oblivion-maskable-512.png', 512, { pad: 0.72 }, {}, false], // launchers crop to the middle 80% circle
  ['oblivion-dark-1024.png', 1024, { mode: 'dark' }, {}, false], // iOS dark appearance
  ['oblivion-tinted-1024.png', 1024, { mode: 'dark' }, { gray: true }, false], // iOS tinted appearance
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body style="margin:0;background:#000"></body>');
for (const [name, size, so, ro, alpha] of ICONS) {
  const px = await raster(page, iconSvg(so), size, ro);
  writeFileSync(outIcons + name, encodePng(px, size, size, alpha));
  console.log('wrote public/icons/' + name);
}

// Side-by-side comparison for the owner: 1024, 180 and 60 px at true size on a neutral dark board.
const src = 'data:image/png;base64,' + encodePng(await raster(page, iconSvg(), 1024), 1024, 1024, false).toString('base64');
const s180 = 'data:image/png;base64,' + encodePng(await raster(page, iconSvg(), 180), 180, 180, false).toString('base64');
const s60 = 'data:image/png;base64,' + encodePng(await raster(page, iconSvg(), 60), 60, 60, false).toString('base64');
const board = await browser.newPage({ viewport: { width: 1560, height: 1180 }, deviceScaleFactor: 1 });
await board.setContent(`<!doctype html><style>
  body{margin:0;background:#1d1f24;font:600 26px system-ui,sans-serif;color:#c9ccd3;display:flex;align-items:flex-end;gap:72px;padding:56px 64px;height:1180px;box-sizing:border-box}
  figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:22px}
  img{display:block;image-rendering:auto}
  .r180{border-radius:40px}.r60{border-radius:13px}
  figcaption{font-variant-numeric:tabular-nums}
</style>
<figure><img src="${src}" width="1024" height="1024"><figcaption>1024 px</figcaption></figure>
<figure><img class="r180" src="${s180}" width="180" height="180"><figcaption>180 px</figcaption></figure>
<figure><img class="r60" src="${s60}" width="60" height="60"><figcaption>60 px</figcaption></figure>`);
await board.screenshot({ path: outDocs + 'icon-sizes.png' });
console.log('wrote docs/brand/icon-sizes.png');
await browser.close();
