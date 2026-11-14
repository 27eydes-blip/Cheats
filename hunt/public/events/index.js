// Environment event registry. Every 30s a random event is announced (5s warning) and then runs.
//
// To add an event: create a module in this folder and add it to EVENTS below. A module is a
// plain object, all hooks optional:
//   id, name, desc, color, duration (s), weight
//   prepare(sim)            server, at warning start -> params (JSON, sent to clients so they can show warnings)
//   start(sim, params)      server, when it hits
//   tick(sim, params, dt)   server, every tick while active
//   end(sim, params)        server, when it ends (undo map changes here)
//   mods(params)            SHARED: gameplay modifiers while active, used by server AND client prediction:
//                           { speedMul, wx, wy, ice:[{x,y,r}], vision, bulletRange, bulletSpeed, knockMul }
//   draw(ctx, params, phase, t, R)   client, world space (R = render helpers)
//   drawScreen(ctx, params, phase, t, W, H)  client, screen space
import walls from './walls.js';
import overgrowth from './overgrowth.js';
import wildfire from './wildfire.js';
import lava from './lava.js';
import ice from './ice.js';
import blackout from './blackout.js';
import supply from './supply.js';
import lowgrav from './lowgrav.js';
import wind from './wind.js';

export const EVENTS = Object.fromEntries([walls, overgrowth, wildfire, lava, ice, blackout, supply, lowgrav, wind].map((e) => [e.id, e]));
export const EVENT_IDS = Object.keys(EVENTS);

export function pickEvent(rand, last) {
  const pool = EVENT_IDS.filter((id) => id !== last);
  const total = pool.reduce((s, id) => s + (EVENTS[id].weight ?? 1), 0);
  let x = rand() * total;
  for (const id of pool) { x -= EVENTS[id].weight ?? 1; if (x <= 0) return id; }
  return pool[0];
}

export { circlesIn, inCircles } from './helpers.js';
