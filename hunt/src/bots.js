// Simple bot brains. Returns one input per tick, same shape a human client sends.
import { BRAWLERS, DT, MAP_SIZE, TILE, GRID, PLAYER_R, tileAt, isSolidTile, lineOfSight } from '../public/shared.js';

const rand = (a, b) => a + Math.random() * (b - a);

function blocked(m, x, y) {
  return isSolidTile(tileAt(m.tiles, x, y));
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
    if (!blocked(m, fx, fy) && !blocked(m, fx + px, fy + py) && !blocked(m, fx - px, fy - py)) {
      return [c * Math.min(1, len), s * Math.min(1, len)];
    }
  }
  return [Math.cos(base), Math.sin(base)];
}

function randomSafePoint(m) {
  const z = m.zoneInset + 120;
  for (let i = 0; i < 20; i++) {
    const x = rand(Math.max(80, z), Math.min(MAP_SIZE - 80, MAP_SIZE - z));
    const y = rand(Math.max(80, z), Math.min(MAP_SIZE - 80, MAP_SIZE - z));
    if (!blocked(m, x, y)) return { x, y };
  }
  return { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
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
      if (o === p || !o.alive || !m.canSee(p, o)) continue;
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
  let tgt = ai.target != null ? m.players.get(ai.target) : null;
  if (tgt && (!tgt.alive || !m.canSee(p, tgt))) tgt = null;

  const z = m.zoneInset;
  const margin = z + 110;
  const inDanger = z > 0 && (p.x < margin || p.y < margin || p.x > MAP_SIZE - margin || p.y > MAP_SIZE - margin);
  let mx = 0, my = 0;

  if (inDanger && !(tgt && Math.hypot(tgt.x - p.x, tgt.y - p.y) < range * 0.6)) {
    mx = MAP_SIZE / 2 - p.x; my = MAP_SIZE / 2 - p.y;
  } else if (tgt) {
    const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const want = range * (p.brawler === 'brick' ? 0.55 : 0.72);
    let fwd = d > want + 60 ? 1 : d < want - 90 ? -1 : 0;
    if (p.hp < p.maxHp * 0.3 && tgt.hp > p.hp && p.brawler !== 'brick') fwd = -1;
    const los = lineOfSight(m.tiles, p.x, p.y, tgt.x, tgt.y);
    if (!los) { mx = nx; my = ny; } else {
      mx = nx * fwd - ny * ai.strafe * 0.75;
      my = ny * fwd + nx * ai.strafe * 0.75;
    }
    inp.ax = nx; inp.ay = ny;
    if (los && d < range * 0.95 && p.ammo >= 1 && ai.fireCd <= 0) {
      const lead = (d / B.attack.speed) * ai.skill;
      const aimX = tgt.x + tgt.vx * lead, aimY = tgt.y + tgt.vy * lead;
      inp.f = Math.atan2(aimY - p.y, aimX - p.x) + (Math.random() - 0.5) * 0.4 * (1.25 - ai.skill);
      ai.fireCd = rand(0.5, 1.2) / ai.aggro;
    }
    if (p.superC >= 1) {
      const sk = B.super.kind;
      if (sk === 'dash' && los && d < B.super.dist + 20) inp.u = Math.atan2(dy, dx);
      else if (sk === 'slam' && d < B.super.radius * 0.9) inp.u = 0;
      else if (sk === 'cloak' && (p.hp < p.maxHp * 0.6 || d < 450)) inp.u = 0;
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
        const x = (idx % GRID) * TILE + TILE / 2, y = Math.floor(idx / GRID) * TILE + TILE / 2;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < 650 && d < gd && x > margin && y > margin && x < MAP_SIZE - margin && y < MAP_SIZE - margin) { gd = d; ci = { x, y }; }
      }
      if (ci) {
        const dx = ci.x - p.x, dy = ci.y - p.y;
        if (gd > Math.min(range * 0.8, 300)) { mx = dx; my = dy; }
        if (gd < range * 0.9 && p.ammo >= 1 && ai.fireCd <= 0 && lineOfSight(m.tiles, p.x, p.y, ci.x - Math.sign(dx) * 30, ci.y - Math.sign(dy) * 30)) {
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
