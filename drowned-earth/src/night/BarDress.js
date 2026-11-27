import * as THREE from 'three';
import { LAYER_FX } from '../render/Pipeline.js';

// Dressing for a bar room, attached to its raft: the neon sign, bottles on the
// shelves, glasses on the counter and tables, string lights across the front
// and ceiling, a chalk menu, a haze of smoke, and the band + crowd sound.
// Everything brightens with the night and with how full the room is.
const _v = new THREE.Vector3();
let bottleGeo, glassGeo, mugGeo, bulbGeo;

function lathe(points, seg = 10) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function geos() {
  if (bottleGeo) return;
  // a wine/spirit bottle: punt, body, shoulder, neck, lip
  bottleGeo = lathe([[0.001, 0.01], [0.034, 0.0], [0.036, 0.02], [0.036, 0.19], [0.03, 0.225], [0.013, 0.25], [0.012, 0.31], [0.015, 0.315], [0.012, 0.32], [0.001, 0.32]], 10);
  glassGeo = lathe([[0.001, 0], [0.032, 0], [0.034, 0.005], [0.038, 0.1], [0.035, 0.1], [0.03, 0.008], [0.001, 0.008]], 10);
  mugGeo = lathe([[0.001, 0], [0.042, 0], [0.045, 0.13], [0.041, 0.13], [0.038, 0.01], [0.001, 0.01]], 10);
  bulbGeo = new THREE.SphereGeometry(0.03, 8, 6);
}

// a neon sign: tubes bent into hand-lettered words on a dark painted board
function neonTexture(text, c1, c2) {
  const W = 1024, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  let size = 120; x.font = `italic 700 ${size}px Georgia, 'Times New Roman', serif`;
  while (x.measureText(text).width > W * 0.9 && size > 40) { size -= 4; x.font = `italic 700 ${size}px Georgia, 'Times New Roman', serif`; }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineCap = 'round';
  const tx = W / 2, ty = H * 0.52;
  // glass tube housing (dark), then the glow, then the hot core
  x.strokeStyle = 'rgba(40,40,40,0.9)'; x.lineWidth = 16; x.strokeText(text, tx, ty);
  x.shadowColor = c1; x.shadowBlur = 40; x.strokeStyle = c1; x.lineWidth = 9; x.strokeText(text, tx, ty);
  x.shadowBlur = 14; x.strokeStyle = c1; x.lineWidth = 6; x.strokeText(text, tx, ty);
  x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2; x.strokeText(text, tx, ty);
  // an underline flourish in the second colour
  x.shadowColor = c2; x.shadowBlur = 24; x.strokeStyle = c2; x.lineWidth = 6;
  x.beginPath(); x.moveTo(W * 0.18, H * 0.86); x.bezierCurveTo(W * 0.4, H * 0.94, W * 0.6, H * 0.78, W * 0.82, H * 0.86); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function boardTexture(w, h, tint) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = tint; x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.15})`; x.fillRect(0, i * 26, 512, 2); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 512, Math.random() * 128, 2 + Math.random() * 30, 1); }
  for (const [bx, by] of [[12, 12], [500, 12], [12, 116], [500, 116]]) { x.fillStyle = '#777'; x.beginPath(); x.arc(bx, by, 5, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function menuTexture(bar, drinks) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640; const x = c.getContext('2d');
  x.fillStyle = '#1d211e'; x.fillRect(0, 0, 512, 640);
  for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; x.fillRect(Math.random() * 512, Math.random() * 640, 1 + Math.random() * 3, 1); }
  x.fillStyle = '#efe9da'; x.textAlign = 'center'; x.font = 'italic 44px Georgia'; x.fillText(bar.dry ? 'Tea' : 'Tonight', 256, 70);
  x.font = '26px Georgia'; x.textAlign = 'left';
  bar.drinks.forEach((id, i) => {
    const d = drinks[id]; if (!d) return;
    const y = 140 + i * 82;
    x.fillStyle = d.banned ? '#f0b0a0' : '#efe9da'; x.fillText(d.name.slice(0, 22), 36, y);
    x.textAlign = 'right'; x.fillText(d.price ? `${d.price} ${d.cur}` : 'free', 476, y); x.textAlign = 'left';
    if (d.banned) { x.font = 'italic 18px Georgia'; x.fillStyle = '#c99'; x.fillText('(ask quietly)', 40, y + 26); x.font = '26px Georgia'; }
  });
  x.font = 'italic 20px Georgia'; x.fillStyle = '#bdb6a6'; x.textAlign = 'center';
  x.fillText(bar.dry ? 'Pay what you can. Or don\'t.' : 'No fighting. (Fighting outside: 1 scrap)', 256, 610);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function dressBar(ctx, raft, anchors, bars) {
  geos();
  const out = { anchors, signs: [], bulbs: [], hazes: [], lights: [], world: (a) => _v.set(a.x, a.y + 1.5, a.z).applyMatrix4(raft.root.matrixWorld).clone() };
  const glassM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.82, depthWrite: false });
  const mugM = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.5, metalness: 0.3 });
  for (const a of anchors) {
    const bar = bars[a.id]; if (!bar) continue;
    const g = new THREE.Group(); g.name = 'bar:' + a.id;
    // ---- neon sign on a painted board above the awning
    const sw = a.sign.w, sh = sw * 0.25;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sw + 0.3, sh + 0.2), new THREE.MeshStandardMaterial({ map: boardTexture(sw, sh, a.style === 'smoke' ? '#1b1a1d' : a.style === 'garden' ? '#2a3a2c' : a.style === 'forge' ? '#2a1d18' : '#2b211a'), roughness: 0.85 }));
    board.position.set(a.sign.x, a.sign.y, a.sign.z - 0.02);
    const neonM = new THREE.MeshBasicMaterial({ map: neonTexture(bar.sign, bar.signColor, bar.signColor2), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1, 1, 1) });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), neonM);
    neon.position.set(a.sign.x, a.sign.y, a.sign.z + 0.01);
    g.add(board, neon);
    // the sign's own coloured light on the deck below
    const sl = new THREE.PointLight(new THREE.Color(bar.signColor), 0, 9, 2); sl.position.set(a.sign.x, a.sign.y - 0.6, a.sign.z + 1.2); g.add(sl);
    out.signs.push({ m: neonM, light: sl, bar, flick: Math.random() * 10 });
    // ---- bottles along the shelves (amber, green, clear, a few blue)
    const cols = [0x6b3a12, 0x1f4a22, 0xc8d8d0, 0x3a2810, 0x23406a, 0x7a1f1a];
    const nb = a.shelves.reduce((s, sh2) => s + Math.floor((sh2.x1 - sh2.x0) / 0.095), 0);
    const bottles = new THREE.InstancedMesh(bottleGeo, glassM, nb);
    let k = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    for (const shf of a.shelves) for (let xx = shf.x0; xx < shf.x1 - 0.05 && k < nb; xx += 0.095) {
      const s = 0.8 + Math.random() * 0.45;
      m4.compose(p.set(xx + (Math.random() - 0.5) * 0.02, shf.y, shf.z + (Math.random() - 0.5) * 0.06), q.setFromAxisAngle(_v.set(0, 1, 0), Math.random() * 6), sc.set(s, s * (0.85 + Math.random() * 0.4), s));
      bottles.setMatrixAt(k, m4); bottles.setColorAt(k, col.setHex(cols[Math.floor(Math.random() * cols.length)])); k++;
    }
    bottles.count = k; g.add(bottles);
    // ---- glasses and mugs on the counter and tables
    const spots = [];
    for (let i = 0; i < 6; i++) spots.push([a.counter.x0 + 0.4 + Math.random() * (a.counter.x1 - a.counter.x0 - 0.8), a.counter.y, a.counter.z + (Math.random() - 0.5) * 0.3]);
    for (const tb of a.tables) for (let i = 0; i < 3; i++) spots.push([tb.x + (Math.random() - 0.5) * 0.6, tb.y, tb.z + (Math.random() - 0.5) * 0.5]);
    const glasses = new THREE.InstancedMesh(glassGeo, glassM, spots.length), mugs = new THREE.InstancedMesh(mugGeo, mugM, spots.length);
    let gi = 0, mi = 0;
    for (const [sx, sy, sz] of spots) { m4.compose(p.set(sx, sy, sz), q.identity(), sc.set(1, 1, 1)); if (a.style === 'forge' || Math.random() < 0.4) mugs.setMatrixAt(mi++, m4); else glasses.setMatrixAt(gi++, m4); }
    glasses.count = gi; mugs.count = mi; g.add(glasses, mugs);
    // ---- chalk menu on the back wall
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: menuTexture(bar, ctx.data.nightlife.drinks), roughness: 0.9 }));
    menu.position.set(a.counter.x1 + 0.6, a.y + 1.7, a.counter.z - 1.0 + 0.02); g.add(menu);
    // ---- string lights: catenaries across the awning and the ceiling
    const runs = [
      [[a.x - a.W / 2 + 0.2, a.y + a.H - 0.35, a.front + 1.8], [a.x + a.W / 2 - 0.2, a.y + a.H - 0.35, a.front + 1.8], 0.35],
      [[a.x - a.W / 2 + 0.3, a.y + a.H - 0.15, a.z - a.D / 2 + 0.6], [a.x + a.W / 2 - 0.3, a.y + a.H - 0.15, a.front - 0.2], 0.4],
      [[a.x + a.W / 2 - 0.3, a.y + a.H - 0.15, a.z - a.D / 2 + 0.6], [a.x - a.W / 2 + 0.3, a.y + a.H - 0.15, a.front - 0.2], 0.4],
    ];
    const bulbCol = a.style === 'smoke' ? 0x7fffe0 : a.style === 'candle' ? 0xffc070 : a.style === 'garden' ? 0xfff0b0 : 0xffb050;
    const bulbM = new THREE.MeshBasicMaterial({ color: bulbCol, toneMapped: false }); bulbM.userData.base = new THREE.Color(bulbCol);
    const wireM = new THREE.LineBasicMaterial({ color: 0x1a1612 });
    const nBulbs = runs.reduce((s, [p0, p1]) => s + Math.floor(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / 0.45), 0);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbM, nBulbs);
    let bi = 0;
    const haloM = ctx.fx.glowMaterial.clone(); haloM.color = new THREE.Color(bulbCol); out.bulbs.push(haloM);
    for (const [p0, p1, sag] of runs) {
      const n = Math.floor(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / 0.45);
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - Math.sin(t * Math.PI) * sag, p0[2] + (p1[2] - p0[2]) * t)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
      for (let i = 1; i < n; i++) { const t = i / n; m4.makeTranslation(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - Math.sin(t * Math.PI) * sag - 0.05, p0[2] + (p1[2] - p0[2]) * t); bulbs.setMatrixAt(bi++, m4); }
      // a soft glow sprite every few bulbs, for the bloom to catch
      for (let i = 1; i < n; i += 3) { const t = i / n; const h = new THREE.Sprite(haloM); h.scale.setScalar(0.28); h.position.set(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - Math.sin(t * Math.PI) * sag - 0.05, p0[2] + (p1[2] - p0[2]) * t); h.layers.set(LAYER_FX); g.add(h); }
    }
    bulbs.count = bi; g.add(bulbs);
    out.bulbs.push(bulbM);
    // ---- haze: a few big soft sprites inside, warm at night
    for (let i = 0; i < 3; i++) {
      const hz = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.fx.glowMaterial.map, color: a.style === 'smoke' ? 0x9fb8b0 : 0xd9b48a, transparent: true, opacity: 0, depthWrite: false }));
      hz.scale.set(4, 2.2, 1); hz.position.set(a.x - 2.5 + i * 2.5, a.y + 2.1, a.z); hz.layers.set(LAYER_FX); g.add(hz); out.hazes.push(hz);
    }
    // ---- a warm fill light inside (the pooled lantern lights do the rest)
    const fill = new THREE.PointLight(a.style === 'smoke' ? 0x9fffe6 : a.style === 'forge' ? 0xff7a30 : 0xffb070, 0, 10, 1.6); fill.position.set(a.x, a.y + 2.2, a.z + 0.4); g.add(fill); out.lights.push({ l: fill, bar, base: a.style === 'forge' ? 6 : 4 });
    raft.root.add(g);
    // ---- the band and the crowd, as positional sound
    const posFn = (v) => v.set(a.stage.x, a.y + 1.2, a.stage.z).applyMatrix4(raft.root.matrixWorld);
    const nl = ctx.nightlife;
    if (!bar.dry) ctx.audio?.addEmitter({ type: 'band', style: bar.band, seed: a.id.length * 7, pos: posFn, gainFn: () => (nl.isOpen(bar) ? 0.35 + nl.crowd(bar) * 0.65 : 0) });
    else ctx.audio?.addEmitter({ type: 'band', style: 'hymn', seed: 3, pos: posFn, gainFn: () => (nl.isOpen(bar) ? 0.4 : 0) });
    ctx.audio?.addEmitter({ type: 'barCrowd', pos: (v) => v.set(a.x, a.y + 1.4, a.z + 1).applyMatrix4(raft.root.matrixWorld), gainFn: () => nl.crowd(bar) * (bar.dry ? 0.25 : 1) });
  }
  return out;
}

export function tickBars(ctx, nl, dt) {
  const night = ctx.time.out.night, t = ctx.state.playTime || 0;
  for (const d of nl.dressed.values()) {
    for (const s of d.signs) {
      const open = nl.isOpen(s.bar);
      // neon: off by day; at night a hum and the odd flicker of a tired tube
      s.flick -= dt;
      let k = open ? 0.35 + night * 1.5 : 0.05;
      if (open && s.flick < 0) { if (s.flick < -0.15) s.flick = 3 + Math.random() * 12; else k *= Math.random() < 0.5 ? 0.25 : 0.9; }
      s.m.color.setScalar(k);
      s.light.intensity = open ? night * 3.5 * (k / 1.85) : 0;
    }
    for (const b of d.bulbs) { if (b.isSpriteMaterial) b.opacity = night * 0.55; else b.color.copy(b.userData.base).multiplyScalar(0.25 + night * 1.1); }
    for (const L of d.lights) L.l.intensity = nl.isOpen(L.bar) ? L.base * (0.3 + night * 0.9) * (0.92 + Math.sin(t * 7 + L.base) * 0.04) : 0;
    for (const hz of d.hazes) hz.material.opacity = night * 0.08;
  }
}
