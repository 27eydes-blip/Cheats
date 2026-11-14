// Simple bot brains. Returns one input per tick, same shape a human client sends.
import { BRAWLERS, DT, TILE, PLAYER_R, HUB, tileAt, blocksMove, lineOfSight } from '../public/shared.js';
import { inCircles } from '../public/events/helpers.js';

const rand = (a, b) => a + Math.random() * (b - a);

// tiles, lava, burning bushes, the hub (bots stay out) and zone edges all count as blocked
function blocked(m, x, y, self) {
  if (blocksMove(tileAt(m.map, x, y))) return true;
  if (m.hub && Math.hypot(x - HUB.x, y - HUB.y) < HUB.r + 30) return true;
  if (m.hub && !m.inBounds(x, y, -30)) return true;
  const e = m.event;
  if (e && e.id === 'lava' && inCircles(e.params.pools, x, y)) return true;
  // armed enemy mines are visible to everyone: step around them
  if (self) for (const mn of m.mines) if (mn.owner !== self.id && !m.mineVisible(self, mn) ? false : mn.owner !== self.id && mn.arm <= 0 && (!self.team || mn.team !== self.team) && Math.hypot(mn.x - x, mn.y - y) < 70) return true;
  return false;
}

// Rotate the wanted direction until the path ahead is clear.
function steer(m, p, mx, my) {
  const len = Math.hypot(mx, my);
  if (len < 0.1) return [0, 0];
  const base = Math.atan2(my, mx);
  const ai = p.ai;
  const offs = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI];
  for (const o of offs) {
    const a = base + o * ai.side;
    const c = Math.cos(a), s = Math.sin(a);
    const look = PLAYER_R + 26;
    const px = -s * PLAYER_R * 0.8, py = c * PLAYER_R * 0.8;
    const fx = p.x + c * look, fy = p.y + s * look;
    if (!blocked(m, fx, fy, p) && !blocked(m, fx + px, fy + py, p) && !blocked(m, fx - px, fy - py, p)) {
      return [c * Math.min(1, len), s * Math.min(1, len)];
    }
  }
  return [Math.cos(base), Math.sin(base)];
}

function randomSafePoint(m) {
  const z = m.zoneInset + 120, b = m.bounds;
  for (let i = 0; i < 20; i++) {
    const x = rand(b.x0 + Math.max(80, z), b.x1 - Math.max(80, z));
    const y = rand(b.y0 + Math.max(80, z), b.y1 - Math.max(80, z));
    if (!blocked(m, x, y)) return { x, y };
  }
  return { ...m.center };
}

export function botInput(m, p) {
  const ai = p.ai || (p.ai = {
    side: Math.random() < 0.5 ? 1 : -1, strafe: 1, strafeT: 0, fireCd: rand(0.8, 1.6),
    target: null, retargetT: 0, wander: null, wanderT: 0, stuckT: 0,
    skill: rand(0.45, 0.95), aggro: rand(0.6, 1.1),
  });
  ai.fireCd -= DT; ai.strafeT -= DT; ai.retargetT -= DT; ai.wanderT -= DT;
  if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? 1 : -1; ai.strafeT = rand(0.5, 1.4); }
  if (Math.hypot(p.vx, p.vy) < 20) ai.stuckT += DT; else ai.stuckT = 0;
  if (ai.stuckT > 0.8) { ai.side *= -1; ai.wander = null; ai.stuckT = 0; }

  const B = BRAWLERS[p.brawler];
  const range = B.attack.range;
  const inp = { s: 0, mx: 0, my: 0, ax: 0, ay: 0, f: null, u: null };

  // pick a target
  if (ai.retargetT <= 0) {
    ai.retargetT = rand(0.3, 0.6);
    let best = null, bd = Infinity;
    for (const o of m.players.values()) {
      if (o === p || !o.alive || !m.enemies(p, o) || !m.canSee(p, o)) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      const score = d - (o.hp / o.maxHp) * 120;
      // early game: loot first, only fight what's close (or whoever is shooting us)
      const sight = m.time < 20 ? 260 : 450 * ai.aggro + 220;
      const angry = p.lastHitBy === o.id && m.time - p.lastCombat < 3;
      if ((d < sight || (angry && d < 900)) && score < bd) { bd = score; best = o; }
    }
    const nt = best ? best.id : null;
    if (nt !== ai.target && nt != null) ai.fireCd = Math.max(ai.fireCd, rand(0.4, 0.9)); // reaction time
    ai.target = nt;
  }
  const goal = m.mode.botGoal?.(m, p) || null;
  if (goal && goal.targetId) { const g = m.players.get(goal.targetId); if (g && g.alive && g.spawnProt <= 0 && m.enemies(p, g)) ai.target = g.id; }
  let tgt = ai.target != null ? m.players.get(ai.target) : null;
  if (tgt && (!tgt.alive || tgt.spawnProt > 0 || m.isSafe(tgt.x, tgt.y))) tgt = null;
  // the hunted target can always be found (it pings the radar)
  if (tgt && !m.canSee(p, tgt) && !(goal && goal.targetId === tgt.id)) tgt = null;
  const amTarget = m.targetId === p.id;

  const z = m.zoneInset;
  const margin = z + 110, B0 = m.bounds;
  const inDanger = z > 0 && (p.x < margin || p.y < margin || p.x > B0.x1 - margin || p.y > B0.y1 - margin);
  const ev = m.event && m.event.ph === 'on' ? m.event : null;
  const onFire = ev && ev.id === 'wildfire' && (ev.params.burnT ?? 0) < 4 && ev.params.burn.includes(Math.floor(p.y / TILE) * m.map.gw + Math.floor(p.x / TILE));
  let mx = 0, my = 0;

  if (inDanger && !(tgt && Math.hypot(tgt.x - p.x, tgt.y - p.y) < range * 0.6)) {
    mx = m.center.x - p.x; my = m.center.y - p.y;
  } else if (onFire) {
    mx = Math.cos(p.facing + 2); my = Math.sin(p.facing + 2);
  } else if (goal && goal.x != null && (!tgt || Math.hypot(tgt.x - p.x, tgt.y - p.y) > range * 0.7)) {
    mx = goal.x - p.x; my = goal.y - p.y;
  } else if (tgt) {
    const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const want = range * ({ brick: 0.55, flicker: 0.45, rook: 0.75, dune: 0.7 }[p.brawler] ?? 0.72);
    let fwd = d > want + 60 ? 1 : d < want - 90 ? -1 : 0;
    if ((p.hp < p.maxHp * 0.3 && tgt.hp > p.hp && p.brawler !== 'brick') || (amTarget && d < range)) fwd = -1;
    const los = lineOfSight(m.map, p.x, p.y, tgt.x, tgt.y);
    if (!los) { mx = nx; my = ny; } else {
      mx = nx * fwd - ny * ai.strafe * 0.75;
      my = ny * fwd + nx * ai.strafe * 0.75;
    }
    inp.ax = nx; inp.ay = ny;
    const myMines = B.attack.kind === 'mine' ? m.mines.filter((q) => q.owner === p.id).length : 0;
    const mineOk = B.attack.kind !== 'mine' || myMines < B.attack.max || d < 260;
    if (los && d < range * 0.95 && p.ammo >= 1 && ai.fireCd <= 0 && mineOk) {
      const lead = (d / B.attack.speed) * ai.skill;
      const aimX = tgt.x + tgt.vx * lead, aimY = tgt.y + tgt.vy * lead;
      inp.f = Math.atan2(aimY - p.y, aimX - p.x) + (Math.random() - 0.5) * 0.4 * (1.25 - ai.skill);
      if (B.attack.kind === 'mine') {
        // lay it where they'll be once it arms (1s), between us when they're closing in
        const fx = tgt.x + tgt.vx * B.attack.arm * ai.skill, fy = tgt.y + tgt.vy * B.attack.arm * ai.skill;
        const mx2 = (fx + p.x * 0.25) / 1.25, my2 = (fy + p.y * 0.25) / 1.25;
        inp.f = Math.atan2(my2 - p.y, mx2 - p.x) + (Math.random() - 0.5) * 0.2;
        inp.fd = Math.min(1, Math.hypot(mx2 - p.x, my2 - p.y) / range);
      }
      if (B.attack.kind === 'slash') ai.fireCd = rand(0.15, 0.4);
      else ai.fireCd = rand(0.5, 1.2) / ai.aggro;
    }
    if (p.superC >= 1) {
      const sk = B.super.kind;
      if (sk === 'dash' && los && d < B.super.dist + 20) inp.u = Math.atan2(dy, dx);
      else if (sk === 'slam' && d < B.super.radius * 0.9) inp.u = 0;
      else if (sk === 'cloak' && (p.hp < p.maxHp * 0.6 || d < 450)) inp.u = 0;
      else if (sk === 'worm' && d < B.super.range * 0.9) inp.u = Math.atan2(dy, dx);
      else if (sk === 'cage' && los && d < B.super.range * 0.8) inp.u = Math.atan2(dy + tgt.vy * d / B.super.speed, dx + tgt.vx * d / B.super.speed);
      else if (sk === 'blink' && d > 160 && d < B.super.range && tgt.hp < tgt.maxHp * 0.8) inp.u = Math.atan2(dy, dx);
    }
  } else {
    // loot: nearest cube, then nearest crate, else wander
    let goal = null, gd = Infinity;
    for (const c of m.cubes) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 700 && d < gd) { gd = d; goal = c; }
    }
    if (goal) { mx = goal.x - p.x; my = goal.y - p.y; }
    else {
      let ci = null; gd = Infinity;
      for (const idx of m.crates.keys()) {
        const x = (idx % m.map.gw) * TILE + TILE / 2, y = Math.floor(idx / m.map.gw) * TILE + TILE / 2;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < 650 && d < gd && x > B0.x0 + margin && y > B0.y0 + margin && x < B0.x1 - margin && y < B0.y1 - margin) { gd = d; ci = { x, y }; }
      }
      if (ci) {
        const dx = ci.x - p.x, dy = ci.y - p.y;
        if (gd > Math.min(range * 0.8, 300)) { mx = dx; my = dy; }
        if (gd < range * 0.9 && p.ammo >= 1 && ai.fireCd <= 0 && lineOfSight(m.map, p.x, p.y, ci.x - Math.sign(dx) * 30, ci.y - Math.sign(dy) * 30)) {
          inp.f = Math.atan2(dy, dx);
          ai.fireCd = rand(0.5, 1.0);
        }
        inp.ax = dx; inp.ay = dy;
      } else {
        if (!ai.wander || ai.wanderT <= 0 || Math.hypot(ai.wander.x - p.x, ai.wander.y - p.y) < 60) {
          ai.wander = randomSafePoint(m);
          ai.wanderT = rand(3, 6);
        }
        mx = ai.wander.x - p.x; my = ai.wander.y - p.y;
      }
    }
  }
  const l = Math.hypot(mx, my);
  if (l > 0.01) { mx /= l; my /= l; }
  [inp.mx, inp.my] = steer(m, p, mx, my);
  const al = Math.hypot(inp.ax, inp.ay);
  if (al > 0) { inp.ax /= al; inp.ay /= al; }
  return inp;
}
