// Tap-to-auto-aim target choice (shared by the game and its unit test).
// Nearest ENEMY we can actually hit: never a teammate, a spawn-protected player or someone in the
// Free Play safe hub, and for normal shots never someone behind a wall or crate.
import { lineOfSight, inHub } from './shared.js';

export function pickAimTarget(map, me, others, { reach = 600, team = 0, super: isSuper = false, free = false } = {}) {
  let best = null, bd = Infinity, any = null, ad = Infinity;
  for (const o of others) {
    if (o.fl & 16 || (o.team && o.team === team)) continue;
    if (free && inHub(o.x, o.y)) continue;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < ad) { ad = d; any = o; }
    if (d < bd && lineOfSight(map, me.x, me.y, o.x, o.y)) { bd = d; best = o; }
  }
  // area supers (worm, slam, blink) don't need a clear line
  if (!best && isSuper) { best = any; bd = ad; }
  return best && bd < Math.max(reach, 700) ? best : null;
}

// AIM ASSIST (mirror of the server's): if an enemy you can see is within 6 degrees of your aim,
// the shot bends half-way toward them. Never a lock-on; the caller skips it for snipers.
const AIM_ASSIST = (6 * Math.PI) / 180;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function assistAngle(map, me, ang, range, others, team = 0) {
  let best = null, bd = AIM_ASSIST;
  for (const o of others) {
    if (o.fl & 16 || (team && o.team === team)) continue;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d > range * 1.1 || d < 1) continue;
    const a = Math.atan2(o.y - me.y, o.x - me.x), da = Math.abs(angDiff(a, ang));
    if (da < bd && lineOfSight(map, me.x, me.y, o.x, o.y)) { bd = da; best = a; }
  }
  return best == null ? ang : ang + angDiff(best, ang) * 0.5;
}
