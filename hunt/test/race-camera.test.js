// Race camera maths (public/race/camera.js): the joystick's screen direction -> world heading in
// every camera view (stick up = the car's forward direction in Chase / Cockpit, up the screen in
// Top-down), the inverse used by the steering hint, the CSS tilt projection, and that every moving
// part of the camera (lean into turns, boost kick, speed zoom) stays inside its bounds whatever the
// car does (so your car never leaves the safe box on screen).
import assert from 'node:assert';
import { CAM, CAM_MODES, camMode, stickToWorld, worldToStick, wrap, tiltOf, project, newCam, stepCam, anchorOf, skyGap, ZK_MIN, baseZoomOf, lookAhead, newShake, shakeKick, stepShake, SHAKE_MAX } from '../public/race/camera.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(wrap(a - b)) < eps, `${msg} ${a} vs ${b}`);
const UP = -Math.PI / 2, RIGHT = 0, DOWN = Math.PI / 2, LEFT = Math.PI;

// modes and the default
assert.deepStrictEqual(CAM_MODES, ['chase', 'top', 'cockpit']);
assert.strictEqual(camMode(undefined), 'top', 'Top-down is the default view');
assert.strictEqual(camMode('nonsense'), 'top');
assert.strictEqual(camMode('top'), 'top');

// TOP-DOWN: the stick's screen direction IS the world heading (the old contract)
for (const sa of [UP, RIGHT, DOWN, LEFT, 0.3, -2.2]) for (const h of [0, 1, -2.5]) close(stickToWorld(sa, CAM.top, h), sa, 1e-12, 'top-down');

// CHASE / COCKPIT: stick up = the camera heading; right = 90 degrees clockwise of it (screen y is down,
// like the world, so +angle = clockwise = a right turn); down = straight back; left = 90 anticlockwise
for (const m of ['chase', 'cockpit']) {
  const cfg = CAM[m];
  for (const h of [0, 0.7, -1.9, 3.1, Math.PI / 2]) {
    close(stickToWorld(UP, cfg, h), h, 1e-9, `${m} up`);
    close(stickToWorld(RIGHT, cfg, h), h + Math.PI / 2, 1e-9, `${m} right`);
    close(stickToWorld(DOWN, cfg, h), h + Math.PI, 1e-9, `${m} down`);
    close(stickToWorld(LEFT, cfg, h), h - Math.PI / 2, 1e-9, `${m} left`);
    // a diagonal: the foreshortened ground makes "up-right on screen" a little more forward than 45 degrees
    const d = wrap(stickToWorld(-Math.PI / 4, cfg, h) - h);
    assert.ok(d > 0 && d < Math.PI / 4, `${m}: up-right steers right of forward, by less than 45 degrees (${d})`);
    // the hint's inverse: world heading -> stick direction -> the same world heading
    for (const wa of [h, h + 0.4, h - 1.2, h + 2.9]) close(stickToWorld(worldToStick(wa, cfg, h), cfg, h), wa, 1e-9, `${m} round trip`);
    // the mapping is continuous and covers every heading (monotonic around the circle)
    let prev = stickToWorld(-Math.PI, cfg, h), turn = 0;
    for (let i = 1; i <= 360; i++) { const w = stickToWorld(-Math.PI + (i / 360) * 2 * Math.PI, cfg, h), dw = wrap(w - prev); assert.ok(dw > 0 && dw < 0.05, `${m}: smooth`); turn += dw; prev = w; }
    close(turn, 0, 1e-6, `${m}: one full turn`); assert.ok(Math.abs(turn - 2 * Math.PI) < 1e-6);
  }
}

// THE TILT: the projection keeps the anchor point (your car) where it is; the top of the canvas
// moves down and narrows (perspective); the sky gap at the top is small enough for the fog band
for (const m of ['chase', 'cockpit']) {
  const cfg = CAM[m];
  for (const [W, H] of [[667, 375], [844, 390], [1180, 820]]) {
    const tl = tiltOf(cfg, W, H), o = {};
    assert.ok(/perspective\(\d+px\) rotateX\([\d.]+deg\) scale\([\d.]+\)/.test(tl.css), tl.css);
    project(tl, W / 2, H * cfg.anchorY, o); assert.ok(Math.abs(o.x - W / 2) < 1e-9 && Math.abs(o.y - H * cfg.anchorY) < 1e-9, 'the anchor stays put');
    const tL = project(tl, 0, 0, {}), tR = project(tl, W, 0, {}), bL = project(tl, 0, H, {});
    assert.ok(tR.x - tL.x < bL.x * -2 + W * 1.5 && tR.x - tL.x < (W - 2 * bL.x), 'the far edge is narrower than the near edge');
    assert.ok(tL.y > 0, 'tilted back: the top edge comes down');
    assert.ok(skyGap(tl) < H * (m === 'chase' ? 0.15 : 0.36), `${m} ${W}x${H}: sky gap ${skyGap(tl).toFixed(1)}`);
    // below the fog band (sky gap + 20% of the height, as the app draws it) the tilted canvas
    // covers the full width: its left edge is off screen there
    const yf = skyGap(tl) + H * 0.2, xf = tL.x + ((bL.x - tL.x) * (yf - tL.y)) / (bL.y - tL.y);
    assert.ok(xf <= 0.5, `${m} ${W}x${H}: covered under the fog (left edge ${xf.toFixed(1)} at y ${yf.toFixed(0)})`);
  }
  const top = tiltOf(CAM.top, 667, 375); assert.strictEqual(top.css, '', 'Top-down: no tilt');
}

// THE MOVING CAMERA stays bounded: throw everything at it (full-lock turns both ways, spins, boosts,
// teleports, huge dt, wild speed) and check every output on every frame
for (const m of CAM_MODES) {
  const cfg = CAM[m], cam = newCam(), an = {};
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let a = 0;
  for (let i = 0; i < 6000; i++) {
    const dt = i % 500 === 0 ? 0.5 : 1 / 60;
    a = wrap(a + (rnd() - 0.5) * (i % 700 < 200 ? 0.6 : 0.08));
    const s = { a, spd: rnd() * 2400, top: 900, boost: i % 90 < 30 ? 1 : 0, spin: i % 1000 < 60 ? 1 : 0, snap: i % 1500 === 0 ? 1 : 0 };
    stepCam(cam, cfg, s, dt);
    assert.ok(Number.isFinite(cam.h) && Math.abs(cam.h) <= Math.PI + 1e-9, 'heading finite');
    assert.ok(Math.abs(cam.sw) <= 1 && cam.kick >= 0 && cam.kick <= 1, 'lean and kick in range');
    assert.ok(cam.zk >= ZK_MIN - 1e-12 && cam.zk <= 1, `zoom in range ${cam.zk}`);
    if (cfg.rotate && !s.spin) assert.ok(Math.abs(wrap(a - cam.h)) <= 1.2 + 1e-6, 'never far behind the car');
    anchorOf(cfg, cam, 844, 390, an);
    if (m === 'chase') { assert.ok(an.x >= 844 * 0.4 && an.x <= 844 * 0.6, `chase x ${an.x}`); assert.ok(an.y >= 390 * 0.6 && an.y <= 390 * 0.7, `chase y ${an.y}`); }
    if (m === 'top') { assert.strictEqual(an.x, 422); assert.strictEqual(an.y, 195); }
  }
}
// a steady right turn: the car slides toward the left of the screen (the view leans into the bend),
// the heading lags a little behind the car; straight again: everything settles back
{
  const cam = newCam(), cfg = CAM.chase;
  let a = 0;
  for (let i = 0; i < 120; i++) { a += 1.5 / 60; stepCam(cam, cfg, { a, spd: 800, top: 900, boost: 0, spin: 0, snap: 0 }, 1 / 60); }
  assert.ok(cam.sw < -0.2, `leans into a right turn (${cam.sw})`);
  const lag = wrap(a - cam.h); assert.ok(lag > 0.05 && lag < 0.6, `heading lags into the turn (${lag})`);
  for (let i = 0; i < 300; i++) stepCam(cam, cfg, { a, spd: 800, top: 900, boost: 0, spin: 0, snap: 0 }, 1 / 60);
  assert.ok(Math.abs(cam.sw) < 0.02 && Math.abs(wrap(a - cam.h)) < 0.01, 'settles on a straight');
  // boost: kicks back at once, then eases out; the zoom widens while boosting
  const z0 = cam.zk;
  stepCam(cam, cfg, { a, spd: 800, top: 900, boost: 1, spin: 0, snap: 0 }, 1 / 60);
  assert.ok(cam.kick > 0.9, 'boost kick');
  for (let i = 0; i < 60; i++) stepCam(cam, cfg, { a, spd: 1100, top: 900, boost: 1, spin: 0, snap: 0 }, 1 / 60);
  assert.ok(cam.kick < 0.1 && cam.zk < z0 - 0.05, `kick eased out, wider view on boost (${z0} -> ${cam.zk})`);
  // a teleport (respawn) snaps the heading at once
  stepCam(cam, cfg, { a: a + 2.5, spd: 0, top: 900, boost: 0, spin: 0, snap: 1 }, 1 / 60);
  close(cam.h, a + 2.5, 1e-9, 'snap');
}
// FRAMING (the big upgrade): a race camera, not a minimap. Your car (~48 px long, drawn x1.18) is
// big on every screen, and stays big at full speed and on a boost
{
  const carPx = (W, H, zk = 1) => 48 * 1.18 * baseZoomOf(W, H) * zk;
  assert.ok(carPx(844, 390) >= 60, `landscape phone: car ${carPx(844, 390).toFixed(0)} px (was ~38)`);
  assert.ok(carPx(667, 375) >= 50, `small phone: car ${carPx(667, 375).toFixed(0)} px`);
  assert.ok(carPx(1180, 820) >= 75 && carPx(1440, 900) >= 75, 'tablet / desktop');
  assert.ok(carPx(844, 390, 1 - CAM.top.speedZoom - CAM.top.boostZoom) >= 45, 'still big at full speed on a boost');
  for (const [W, H] of [[320, 568], [568, 320], [3000, 2000]]) { const z = baseZoomOf(W, H); assert.ok(z >= 0.8 && z <= 1.35, `${W}x${H} zoom bounded ${z}`); }
}
// TOP-DOWN LOOK-AHEAD: at speed the view runs ahead of the car, so the car sits back toward the side
// it came from (more road ahead than behind); bounded by cfg.ahead of the screen (x1.25 on a boost
// kick) in every direction; nothing at a standstill; a snap (respawn) jumps straight to it
{
  const cfg = CAM.top, W = 844, H = 390, z = baseZoomOf(W, H);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.6, -2.4]) {
    const cam = newCam(), vx = Math.cos(a) * 800, vy = Math.sin(a) * 800;
    lookAhead(cam, cfg, vx, vy, 812, W, H, z, 1 / 60, true);
    for (let i = 0; i < 240; i++) lookAhead(cam, cfg, vx, vy, 812, W, H, z, 1 / 60, false);
    // the car's screen spot: the middle minus the look-ahead
    const sx = 0.5 - (cam.lx * z) / W, sy = 0.5 - (cam.ly * z) / H;
    const back = -(Math.cos(a) * (sx - 0.5) * W + Math.sin(a) * (sy - 0.5) * H);
    assert.ok(back > 0.15 * Math.min(W, H), `heading ${a}: the car sits back (${back.toFixed(0)} px behind the middle)`);
    assert.ok(Math.abs(sx - 0.5) <= cfg.ahead + 1e-9 && Math.abs(sy - 0.5) <= cfg.ahead + 1e-9, `heading ${a}: bounded (${sx.toFixed(3)}, ${sy.toFixed(3)})`);
    cam.kick = 1; for (let i = 0; i < 240; i++) lookAhead(cam, cfg, vx, vy, 812, W, H, z, 1 / 60, false);
    assert.ok(Math.abs(cam.lx * z / W) <= cfg.ahead * 1.25 + 1e-9 && Math.abs(cam.ly * z / H) <= cfg.ahead * 1.25 + 1e-9, 'kick bounded');
  }
  const cam = newCam(); lookAhead(cam, cfg, 0, 0, 812, W, H, z, 1 / 60, true);
  assert.ok(cam.lx === 0 && cam.ly === 0, 'standing still: centred');
  // top-down speeds up the "FOV": zooms out with speed, more on a boost, never below ZK_MIN
  const c2 = newCam();
  for (let i = 0; i < 300; i++) stepCam(c2, cfg, { a: 0, spd: 812, top: 900, boost: 0, spin: 0, snap: 0 }, 1 / 60);
  const zs = c2.zk; assert.ok(zs < 0.92, `zooms out at speed (${zs})`);
  stepCam(c2, cfg, { a: 0, spd: 1100, top: 900, boost: 1, spin: 0, snap: 0 }, 1 / 60); assert.ok(c2.kick > 0.9, 'top-down boost kick');
  for (let i = 0; i < 60; i++) stepCam(c2, cfg, { a: 0, spd: 1100, top: 900, boost: 1, spin: 0, snap: 0 }, 1 / 60);
  assert.ok(c2.zk < zs - 0.04 && c2.zk >= ZK_MIN, `wider on a boost (${zs} -> ${c2.zk})`);
}
// SHAKE + PUNCH: a hit shoves the view along the force (first move is that way), it rebounds at
// most a little, settles to exactly zero within a second, and stays bounded whatever piles up
{
  const sh = newShake(); shakeKick(sh, 0.6, 1, 0);
  let maxX = 0, minX = 0, firstSign = 0;
  for (let i = 0; i < 90; i++) { stepShake(sh, 1 / 60); if (!firstSign && Math.abs(sh.px) > 0.5) firstSign = Math.sign(sh.px); maxX = Math.max(maxX, sh.px); minX = Math.min(minX, sh.px); }
  assert.strictEqual(firstSign, 1, 'punched along the force');
  assert.ok(maxX > 6, `a real shove (${maxX.toFixed(1)} px)`);
  assert.ok(-minX < maxX * 0.45, `one small rebound (${minX.toFixed(1)})`);
  for (let i = 0; i < 30; i++) stepShake(sh, 1 / 60);
  assert.ok(sh.x === 0 && sh.y === 0 && sh.tr === 0, `settled after ~2 s (${sh.x}, ${sh.y}, ${sh.tr})`);
  // smooth, not white noise: frame to frame it moves a little, not a full swing
  const s2 = newShake(); shakeKick(s2, 1); let px = 0, jump = 0;
  for (let i = 0; i < 20; i++) { stepShake(s2, 1 / 60); if (i) jump = Math.max(jump, Math.abs(s2.x - px)); px = s2.x; }
  assert.ok(jump < 6, `smooth jitter (${jump.toFixed(2)} px per frame)`);
  // a pile of hits, huge and zero frame times: bounded, finite
  const s3 = newShake();
  for (let i = 0; i < 2000; i++) { if (i % 7 === 0) shakeKick(s3, 1, Math.cos(i), Math.sin(i)); stepShake(s3, i % 100 === 0 ? 0.5 : i % 13 === 0 ? 0 : 1 / 60); assert.ok(Number.isFinite(s3.x) && Math.abs(s3.x) <= SHAKE_MAX && Math.abs(s3.y) <= SHAKE_MAX && s3.tr <= 1.4, 'bounded'); }
}
console.log('race-camera: ok');
