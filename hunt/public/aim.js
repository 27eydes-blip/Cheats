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
