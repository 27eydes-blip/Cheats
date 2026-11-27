// The journal: a hand-drawn chart that fills in as you explore (fog of war,
// your own route, landmark doodles in your hand, Highmark's bearing, the
// Beacon), your notes, photographs, people met, rumours, and a help page.
const CELL = 24;
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive';

export class Journal {
  constructor(ctx) {
    this.ctx = ctx;
    const st = ctx.state;
    st.explored = st.explored || new Set();
    st.route = st.route || [];
    st.discovered = st.discovered || new Set();
    st.notes = st.notes || [];
    st.met = st.met || {};
    this.last = null;
    ctx.events.on('talk', (e) => { st.met[e.npc] = (st.met[e.npc] || 0) + 1; });
  }
  update() {
    const { player, state, worldMap } = this.ctx;
    if (this.ctx.mode !== 'play' || this.ctx.scenarioActive) return;
    const p = player.position;
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 10) state.explored.add(`${cx + i},${cz + j}`);
    if (!this.last || Math.hypot(p.x - this.last.x, p.z - this.last.z) > 12) { state.route.push([Math.round(p.x), Math.round(p.z)]); if (state.route.length > 1500) state.route.shift(); this.last = { x: p.x, z: p.z }; }
    for (const l of [...worldMap.landmarks]) if (!state.discovered.has(l.id) && Math.hypot(p.x - l.pos[0], p.z - l.pos[1]) < 260) { state.discovered.add(l.id); this.ctx.ui.toast(`Added to your chart: ${l.name}`); }
  }
  // Draw the chart into a canvas. view: centre + scale in metres per px.
  drawMap(canvas, opts = {}) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const { state, player, worldMap } = this.ctx;
    const scale = opts.scale || 2.6, cx = opts.cx ?? 60, cz = opts.cz ?? 0;
    const X = (x) => W / 2 + (x - cx) / scale, Y = (z) => H / 2 + (z - cz) / scale;
    // paper
    g.fillStyle = '#e4d9bf'; g.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) { const r = 20 + rnd() * 90, sx = rnd() * W, sy = rnd() * H; const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r); gr.addColorStop(0, 'rgba(140,110,70,0.10)'); gr.addColorStop(1, 'rgba(140,110,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    // explored water wash + city sketch
    g.save();
    g.beginPath();
    for (const k of state.explored) { const [i, j] = k.split(',').map(Number); g.rect(X(i * CELL) - 1, Y(j * CELL) - 1, CELL / scale + 2, CELL / scale + 2); }
    g.clip();
    g.fillStyle = 'rgba(70,110,120,0.22)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(50,45,40,0.5)'; g.lineWidth = 1;
    // building blocks: sketchy rectangles on the street grid
    const P = 64, SW = 16;
    for (let bx = -9; bx < 9; bx++) for (let bz = -9; bz < 9; bz++) {
      const x0 = bx * P + SW / 2, z0 = bz * P + SW / 2;
      if (worldMap.cityFade(x0 + 24, z0 + 24) >= 1 || worldMap.rectClaimed(x0, z0, x0 + 48, z0 + 48)) continue;
      const j = () => (rnd() - 0.5) * 2;
      g.beginPath(); g.moveTo(X(x0) + j(), Y(z0) + j()); g.lineTo(X(x0 + 48) + j(), Y(z0) + j()); g.lineTo(X(x0 + 48) + j(), Y(z0 + 48) + j()); g.lineTo(X(x0) + j(), Y(z0 + 48) + j()); g.closePath(); g.stroke();
      g.fillStyle = 'rgba(60,55,45,0.10)'; g.fill();
    }
    g.restore();
    // route in pencil
    g.strokeStyle = 'rgba(40,35,30,0.55)'; g.setLineDash([3, 3]); g.lineWidth = 1.2;
    g.beginPath(); state.route.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke(); g.setLineDash([]);
    // landmarks in your hand
    g.font = `15px ${HAND}`; g.fillStyle = '#3a2f24'; g.strokeStyle = '#3a2f24';
    for (const l of worldMap.landmarks) {
      if (!state.discovered.has(l.id)) continue;
      const x = X(l.pos[0]), y = Y(l.pos[1]);
      g.lineWidth = 1.4;
      if (l.kind === 'sinkhole') { for (let r = 4; r < 22; r += 5) { g.beginPath(); g.arc(x, y, r, 0, 6.28); g.stroke(); } }
      else if (l.kind === 'raft_community') { for (let k = 0; k < 5; k++) g.strokeRect(x - 10 + (k % 3) * 7, y - 6 + Math.floor(k / 3) * 7, 6, 5); }
      else if (l.kind === 'cargo_ship') { g.beginPath(); g.ellipse(x, y, 22, 6, 0.6, 0, 6.28); g.stroke(); }
      else { g.beginPath(); g.moveTo(x - 6, y + 6); g.lineTo(x, y - 8); g.lineTo(x + 6, y + 6); g.closePath(); g.stroke(); }
      g.fillText(l.name, x + 12, y - 6);
    }
    // player
    const px = X(player.position.x), py = Y(player.position.z), yaw = player.mode === 'boat' ? this.ctx.boat.heading : player.yaw;
    g.save(); g.translate(px, py); g.rotate(-yaw); g.fillStyle = '#8a2a1a'; g.beginPath(); g.moveTo(0, -9); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
    // compass + bearings
    g.save(); g.translate(W - 48, 52); g.strokeStyle = '#3a2f24'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 26, 0, 6.28); g.stroke();
    g.beginPath(); g.moveTo(0, -30); g.lineTo(5, 0); g.lineTo(0, 30); g.lineTo(-5, 0); g.closePath(); g.stroke(); g.fillStyle = '#3a2f24'; g.fillText('N', -5, -34); g.restore();
    const hm = this.ctx.data.locations.farLandmarks[0].pos;
    const a = Math.atan2(hm[1] - player.position.z, hm[0] - player.position.x);
    const ex = W / 2 + Math.cos(a) * (W / 2 - 40), ey = H / 2 + Math.sin(a) * (H / 2 - 30);
    g.fillStyle = '#3a2f24'; g.font = `16px ${HAND}`; g.fillText('to Highmark & the Beacon →', Math.min(W - 230, Math.max(10, ex - 100)), Math.max(24, ey));
    g.font = `12px ${HAND}`; g.fillText(`Lantern Ward, Orrin Bay — charted by hand · day ${this.ctx.time.day}`, 14, H - 14);
    // notes pinned on the chart
    g.font = `14px ${HAND}`;
    state.notes.slice(-4).forEach((n, i) => g.fillText('— ' + n.text.slice(0, 60), 14, 26 + i * 18));
  }
  toJSON() { const s = this.ctx.state; return { explored: [...s.explored], route: s.route, discovered: [...s.discovered], notes: s.notes, met: s.met }; }
  load(o) { if (!o) return; const s = this.ctx.state; s.explored = new Set(o.explored || []); s.route = o.route || []; s.discovered = new Set(o.discovered || []); s.notes = o.notes || []; s.met = o.met || {}; }
}

export const HELP_HTML = `<h3>Controls</h3><div class="sub" style="font-style:normal;line-height:1.75">
<b>Desktop</b>: WASD move / steer · mouse look (click to capture) · Shift sprint / boost · C crouch, swim up, cut the boat engine · Space jump, dive, swim down · E use / talk / tie up / board · F flashlight (lantern or spotlight on the boat) · V boat camera · R radio · Tab pack · Q craft · J journal · K photo mode · \` debug · Esc pause.<br>
<b>Touch</b>: left stick to move, drag the right half to look, buttons for the rest (Options → one-handed layout puts everything on the right).</div>
<h3>Surviving</h3><div class="sub" style="font-style:normal;line-height:1.7">Drink, eat, stay warm (fires and coats), sleep in a bunk. Underwater, watch the gauge on your wrist: deeper zones drain air faster. Things below hunt by <i>sound</i>: swim slowly, don't sprint, and they let you pass.<br>
Tide Ward patrols hunt by engine noise and light at night. Cut your engine (C), kill your lamp, put a building between you and the beam. If they board you, your wristband decides how it goes.</div>
<h3>Standing</h3><div class="sub" style="font-style:normal;line-height:1.7">Your wrist shows your place in the Order: Deep-Born (red) docks at the red lamp and pays more. Sal sells a Drifter tag; Madam Vance brokers a Trader permit. Forged tags work until someone checks.</div>`;
