// Bot brains. One input per tick, the same shape a human client sends.
//
// FAIR PLAY: bots only know what a human in their place would know:
//   - players they can see right now (m.canSee: bushes, cloak and blackout fog apply), and
//   - public radar pings, remembered as "last known position" for a few seconds.
// They never read hidden players' live positions.
import { BRAWLERS, DT, TILE, PLAYER_R, HUB, BUSH, tileAt, blocksMove, lineOfSight, touchingBorder } from '../public/shared.js';
import { inCircles } from '../public/events/helpers.js';

const rand = (a, b) => a + Math.random() * (b - a);

export const BOT_LEVELS = {
  easy: { aimErr: 0.55, lead: 0.3, react: [0.6, 1.1], gap: [0.8, 1.5], cover: false, hide: false, dodgeWarn: false, smartSuper: false, sight: 0.8 },
  normal: { aimErr: 0.28, lead: 0.65, react: [0.35, 0.7], gap: [0.5, 1.1], cover: true, hide: true, dodgeWarn: true, smartSuper: true, sight: 1 },
  hard: { aimErr: 0.12, lead: 0.95, react: [0.18, 0.4], gap: [0.35, 0.8], cover: true, hide: true, dodgeWarn: true, smartSuper: true, sight: 1.1 },
};
// trophies on the human players -> bot difficulty
export function levelForTrophies(t) { return t < 150 ? 'easy' : t < 500 ? 'normal' : 'hard'; }

// ---------------------------------------------------------------- hazards
// Telegraphed dangers a human can see coming. Returns a push-away vector (0,0 if safe).
function hazardAt(m, x, y, L, self) {
  let hx = 0, hy = 0;
  const e = m.event;
  if (e && (e.ph === 'on' || L.dodgeWarn)) {
    if (e.id === 'lava') for (const c of e.params.pools) { const d = Math.hypot(x - c.x, y - c.y); if (d < c.r + 30) { hx += (x - c.x) / (d || 1); hy += (y - c.y) / (d || 1); } }
    if (e.id === 'wildfire' && (e.params.burnT ?? 0) < 4) {
      const idx = Math.floor(y / TILE) * m.map.gw + Math.floor(x / TILE);
      if (e.params.burn.includes(idx)) { const cx = (idx % m.map.gw) * TILE + 25, cy = Math.floor(idx / m.map.gw) * TILE + 25; hx += x - cx + 0.1; hy += y - cy; }
    }
  }
  for (const d of m.delayed) if (d.kind === 'worm' && d.owner !== self.id) { const r = Math.hypot(x - d.x, y - d.y); if (r < d.r + 40) { hx += (x - d.x) / (r || 1); hy += (y - d.y) / (r || 1); } }
  return [hx, hy];
}

// tiles, hazards, the hub (bots stay out), zone edges and visible enemy mines count as blocked
function blocked(m, x, y, self, L) {
  if (blocksMove(tileAt(m.map, x, y))) return true;
  if (m.hub && Math.hypot(x - HUB.x, y - HUB.y) < HUB.r + 30) return true;
  if (m.hub && !m.inBounds(x, y, -30)) return true;
  if (touchingBorder(m.map, x, y, 14)) return true; // keep off the spiked border
  if (self) {
    const [hx, hy] = hazardAt(m, x, y, L, self);
    if (hx || hy) return true;
    for (const mn of m.mines) {
      if (mn.owner === self.id || mn.arm > 0 || (self.team && mn.team === self.team) || !m.mineVisible(self, mn)) continue;
      if (Math.hypot(mn.x - x, mn.y - y) < 70) return true;
    }
  } else {
    const e = m.event;
    if (e && e.id === 'lava' && inCircles(e.params.pools, x, y)) return true;
  }
  return false;
}

// Rotate the wanted direction until the path ahead is clear.
function steer(m, p, mx, my, L) {
  const len = Math.hypot(mx, my);
  if (len < 0.1) return [0, 0];
  const base = Math.atan2(my, mx);
  const ai = p.ai;
  for (const o of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
    const a = base + o * ai.side;
    const c = Math.cos(a), s = Math.sin(a);
    const look = PLAYER_R + 26;
    const px = -s * PLAYER_R * 0.8, py = c * PLAYER_R * 0.8;
    const fx = p.x + c * look, fy = p.y + s * look;
    if (!blocked(m, fx, fy, p, L) && !blocked(m, fx + px, fy + py, p, L) && !blocked(m, fx - px, fy - py, p, L)) return [c * Math.min(1, len), s * Math.min(1, len)];
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

// a nearby open spot the threat has no line of sight to
function findCover(m, p, threat) {
  let best = null, bd = Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = 90 + (i % 3) * 60;
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    if (blocked(m, x, y) || lineOfSight(m.map, threat.x, threat.y, x, y)) continue;
    const d = r + Math.hypot(x - threat.x, y - threat.y) * -0.2; // prefer close, slightly away from the threat
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}
function nearestBush(m, p, avoid) {
  const gw = m.map.gw, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  let best = null, bd = Infinity;
  for (let y = ty - 12; y <= ty + 12; y++) for (let x = tx - 12; x <= tx + 12; x++) {
    if (x < 0 || y < 0 || x >= gw || y >= m.map.gh || m.map.t[y * gw + x] !== BUSH) continue;
    const cx = x * TILE + 25, cy = y * TILE + 25;
    if (!m.inBounds(cx, cy, -20)) continue;
    let d = Math.hypot(cx - p.x, cy - p.y);
    if (avoid) d += Math.max(0, 400 - Math.hypot(cx - avoid.x, cy - avoid.y)) * 2;
    if (d < bd) { bd = d; best = { x: cx, y: cy }; }
  }
  return bd < 650 ? best : null;
}

export function botInput(m, p) {
  const L = BOT_LEVELS[p.botLevel || m.botLevel] || BOT_LEVELS.normal;
  const ai = p.ai || (p.ai = {
    side: Math.random() < 0.5 ? 1 : -1, strafe: 1, strafeT: 0, fireCd: rand(0.8, 1.6),
    target: null, retargetT: 0, wander: null, wanderT: 0, stuckT: 0, mem: new Map(),
    aggro: rand(0.75, 1.1),
  });
  ai.skill = 1 - L.aimErr;
  ai.fireCd -= DT; ai.strafeT -= DT; ai.retargetT -= DT; ai.wanderT -= DT;
  if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? 1 : -1; ai.strafeT = rand(0.5, 1.4); }
  if (Math.hypot(p.vx, p.vy) < 20) ai.stuckT += DT; else ai.stuckT = 0;
  if (ai.stuckT > 0.8) { ai.side *= -1; ai.wander = null; ai.stuckT = 0; }

  // memory: radar pings are public (humans see them too)
  for (const [id, x, y] of m.pingLog) ai.mem.set(id, { x, y, t: m.time });

  const B = BRAWLERS[p.brawler];
  const range = B.attack.range;
  const inp = { s: 0, mx: 0, my: 0, ax: 0, ay: 0, f: null, u: null };
  const hpF = p.hp / p.maxHp;

  // ---- choose a visible target (bounty makes a target more attractive)
  if (ai.retargetT <= 0) {
    ai.retargetT = rand(0.3, 0.6);
    let best = null, bd = Infinity;
    for (const o of m.players.values()) {
      if (o === p || !o.alive || !m.enemies(p, o) || !m.canSee(p, o) || o.spawnProt > 0) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      ai.mem.set(o.id, { x: o.x, y: o.y, t: m.time });
      const score = d - (1 - o.hp / o.maxHp) * 150 - Math.min(8, o.bounty) * 55;
      const sight = (m.time < 20 ? 260 : 450 * ai.aggro + 220 + Math.min(8, o.bounty) * 40) * L.sight;
      const angry = p.lastHitBy === o.id && m.time - p.lastCombat < 3;
      if ((d < sight || (angry && d < 900)) && score < bd) { bd = score; best = o; }
    }
    const nt = best ? best.id : null;
    if (nt !== ai.target && nt != null) ai.fireCd = Math.max(ai.fireCd, rand(...L.react)); // reaction time
    ai.target = nt;
  }
  let tgt = ai.target != null ? m.players.get(ai.target) : null;
  if (tgt && (!tgt.alive || tgt.spawnProt > 0 || m.isSafe(tgt.x, tgt.y) || !m.canSee(p, tgt))) tgt = null;

  // ---- mode goal: positions only through vision or remembered pings
  let goal = m.mode.botGoal?.(m, p) || null;
  if (goal && goal.targetId) {
    const g = m.players.get(goal.targetId);
    if (g && g.alive && m.enemies(p, g)) {
      if (m.canSee(p, g)) { if (!tgt) { tgt = g; ai.target = g.id; } goal = null; }
      else { const mm = ai.mem.get(g.id); goal = mm && m.time - mm.t < 6 ? { x: mm.x, y: mm.y } : null; }
    } else goal = null;
  }
  const amTarget = m.targetId === p.id;

  const z = m.zoneInset;
  const margin = z + 110, B0 = m.bounds;
  const inPoison = z > 0 && (p.x < margin || p.y < margin || p.x > B0.x1 - margin || p.y > B0.y1 - margin);
  const [hx, hy] = hazardAt(m, p.x, p.y, L, p);
  let mx = 0, my = 0;
  const d = tgt ? Math.hypot(tgt.x - p.x, tgt.y - p.y) || 1 : Infinity;
  const los = tgt ? lineOfSight(m.map, p.x, p.y, tgt.x, tgt.y) : false;

  if (hx || hy) { mx = hx; my = hy; } // get out of a telegraphed hazard first
  else if (inPoison && !(tgt && d < range * 0.6)) { mx = m.center.x - p.x; my = m.center.y - p.y; }
  else if (L.hide && hpF < 0.35 && !amTarget && (!tgt || d > 260)) {
    // low: slip into a bush away from danger and lay low until healed
    const bush = nearestBush(m, p, tgt);
    if (bush) { mx = bush.x - p.x; my = bush.y - p.y; if (Math.hypot(mx, my) < 18) { mx = 0; my = 0; } }
    else if (tgt) { mx = p.x - tgt.x; my = p.y - tgt.y; }
  } else if (goal && goal.x != null && (!tgt || d > range * 0.7)) {
    mx = goal.x - p.x; my = goal.y - p.y;
  } else if (tgt) {
    const nx = (tgt.x - p.x) / d, ny = (tgt.y - p.y) / d;
    const want = range * ({ brick: 0.55, flicker: 0.45, rook: 0.75, dune: 0.7 }[p.brawler] ?? 0.72);
    let fwd = d > want + 60 ? 1 : d < want - 90 ? -1 : 0;
    if ((hpF < 0.3 && tgt.hp > p.hp && p.brawler !== 'brick') || (amTarget && d < range)) fwd = -1;
    // reloading or hurt while exposed: duck behind cover
    const cover = L.cover && los && (p.ammo < 1 || (hpF < 0.45 && tgt.hp / tgt.maxHp > hpF)) && p.brawler !== 'flicker' ? findCover(m, p, tgt) : null;
    if (cover) { mx = cover.x - p.x; my = cover.y - p.y; }
    else if (!los) { mx = nx; my = ny; }
    else { mx = nx * fwd - ny * ai.strafe * 0.75; my = ny * fwd + nx * ai.strafe * 0.75; }
    inp.ax = nx; inp.ay = ny;

    const myMines = B.attack.kind === 'mine' ? m.mines.filter((q) => q.owner === p.id).length : 0;
    const mineOk = B.attack.kind !== 'mine' || myMines < B.attack.max || d < 260;
    if (los && d < range * 0.95 && p.ammo >= 1 && ai.fireCd <= 0 && mineOk) {
      const lead = (d / B.attack.speed) * L.lead;
      const aimX = tgt.x + tgt.vx * lead, aimY = tgt.y + tgt.vy * lead;
      inp.f = Math.atan2(aimY - p.y, aimX - p.x) + (Math.random() - 0.5) * L.aimErr;
      if (B.attack.kind === 'mine') {
        // lay it where they'll be once it arms, between us when they're closing in
        const fx = tgt.x + tgt.vx * B.attack.arm * L.lead, fy = tgt.y + tgt.vy * B.attack.arm * L.lead;
        const mx2 = (fx + p.x * 0.25) / 1.25, my2 = (fy + p.y * 0.25) / 1.25;
        inp.f = Math.atan2(my2 - p.y, mx2 - p.x) + (Math.random() - 0.5) * L.aimErr * 0.5;
        inp.fd = Math.min(1, Math.hypot(mx2 - p.x, my2 - p.y) / range);
      }
      ai.fireCd = B.attack.kind === 'slash' ? rand(0.15, 0.4) : rand(...L.gap) / ai.aggro;
    }
    if (p.superC >= 1) inp.u = useSuper(m, p, tgt, d, los, L);
  } else {
    // nobody visible: follow a remembered ping (bounty hunting), else loot
    let chase = null;
    for (const [id, mm] of ai.mem) {
      const o = m.players.get(id);
      if (!o || !o.alive || !m.enemies(p, o) || m.time - mm.t > 5 || o.bounty < 2) continue;
      if (!chase || o.bounty > chase.b) chase = { x: mm.x, y: mm.y, b: o.bounty };
    }
    if (chase && m.time > 20 && Math.hypot(chase.x - p.x, chase.y - p.y) > 60) { mx = chase.x - p.x; my = chase.y - p.y; }
    else loot(m, p, ai, inp, range, B0, margin, (x, y) => { mx = x; my = y; });
    if (p.superC >= 1 && B.super.kind === 'cloak' && hpF < 0.5) inp.u = 0;
  }
  const l = Math.hypot(mx, my);
  if (l > 0.01) { mx /= l; my /= l; }
  [inp.mx, inp.my] = steer(m, p, mx, my, L);
  const al = Math.hypot(inp.ax, inp.ay);
  if (al > 0) { inp.ax /= al; inp.ay /= al; }
  return inp;
}

function useSuper(m, p, tgt, d, los, L) {
  const S = BRAWLERS[p.brawler].super, sk = S.kind;
  const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
  const tF = tgt.hp / tgt.maxHp, hpF = p.hp / p.maxHp;
  if (!L.smartSuper) { // easy: fire it as soon as it's vaguely in range
    if (sk === 'slam') return d < S.radius ? 0 : null;
    if (sk === 'cloak' || sk === 'blink') return d < 600 ? ang : null;
    return d < (S.dist || S.range || 500) ? ang : null;
  }
  const near = [...m.players.values()].filter((o) => o.alive && m.enemies(p, o) && m.canSee(p, o) && Math.hypot(o.x - p.x, o.y - p.y) < (S.radius || 0) + 20).length;
  switch (sk) {
    case 'dash': if (hpF < 0.3 && d < 300) return ang + Math.PI; // escape
      return los && d < S.dist + 20 && (tF < 0.5 || d < 200) ? ang : null;
    case 'slam': return near >= 2 || (near === 1 && (tF < 0.45 || d < S.radius * 0.7)) ? 0 : null;
    case 'cloak': return hpF < 0.45 || (d < 500 && tF < 0.6) ? 0 : null;
    case 'worm': return d < S.range * 0.9 && (tgt.stun > 0 || Math.hypot(tgt.vx, tgt.vy) < 120 || tF < 0.5) ? ang : null;
    case 'cage': return los && d < S.range * 0.75 ? Math.atan2(tgt.y + tgt.vy * d / S.speed - p.y, tgt.x + tgt.vx * d / S.speed - p.x) : null;
    case 'blink': return d > 160 && d < S.range && (tF < 0.55 || tgt.bounty >= 3) ? ang : null;
  }
  return null;
}

function loot(m, p, ai, inp, range, B0, margin, move) {
  let goal = null, gd = Infinity;
  for (const c of [...m.cubes, ...m.crystals]) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < 700 && d < gd) { gd = d; goal = c; }
  }
  if (goal) return move(goal.x - p.x, goal.y - p.y);
  let ci = null; gd = Infinity;
  for (const idx of m.crates.keys()) {
    const x = (idx % m.map.gw) * TILE + TILE / 2, y = Math.floor(idx / m.map.gw) * TILE + TILE / 2;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 650 && d < gd && x > B0.x0 + margin && y > B0.y0 + margin && x < B0.x1 - margin && y < B0.y1 - margin) { gd = d; ci = { x, y }; }
  }
  if (ci) {
    const dx = ci.x - p.x, dy = ci.y - p.y;
    if (gd > Math.min(range * 0.8, 300)) move(dx, dy);
    if (gd < range * 0.9 && p.ammo >= 1 && ai.fireCd <= 0 && lineOfSight(m.map, p.x, p.y, ci.x - Math.sign(dx) * 30, ci.y - Math.sign(dy) * 30)) {
      inp.f = Math.atan2(dy, dx); inp.fd = Math.min(1, gd / range);
      ai.fireCd = rand(0.5, 1.0);
    }
    inp.ax = dx; inp.ay = dy;
    return;
  }
  if (!ai.wander || ai.wanderT <= 0 || Math.hypot(ai.wander.x - p.x, ai.wander.y - p.y) < 60) { ai.wander = randomSafePoint(m); ai.wanderT = rand(3, 6); }
  move(ai.wander.x - p.x, ai.wander.y - p.y);
}
