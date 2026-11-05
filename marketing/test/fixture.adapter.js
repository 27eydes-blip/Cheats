// Adapter for test/fixture-game.html — a worked example of the contract in
// config/glydrift.adapter.js. Internal resolution is 130x281 (3x pixel scale on screen).
window.__glyAdapter = {
  ready: () => !!window.game,
  startRun() {
    window.game.start();
    window.__demoBot.enabled = true;
  },
  actions: ["none", "left", "right"],
  apply(a) {
    window.game.input = a;
  },
  state() {
    const g = window.game;
    return {
      alive: g.state === "play",
      player: { ...g.player },
      hazards: g.hazards,
      bounds: { x: 3, y: 0, w: 124, h: 281 },
      realm: g.realm,
      score: g.score,
      combo: g.combo,
    };
  },
  // one 1/60s step of the fixture's player physics (mirrors step() in the page)
  predict(p, a, ms) {
    const dt = ms / 1000;
    const acc = { left: -900, right: 900, none: 0 }[a];
    const vx = (p.vx + acc * dt) * Math.pow(0.02, dt);
    return { ...p, vx, x: Math.max(3, Math.min(127, p.x + vx * dt)) };
  },
  warp(realm) {
    window.game.t = realm * 8 - 0.5;
  },
};
