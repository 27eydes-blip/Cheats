import * as THREE from 'three';

// URL parameters for testing and screenshots, e.g.
//   ?time=12&weather=clear&pos=-262,0,240&yaw=0.5&pitch=0&mode=foot&quality=high
//   &freeze=1 (stop the clock)  &stats=1 (fps overlay)  &skipintro=1
export function applyDebugParams(ctx) {
  const p = ctx.params;
  if (p.has('time')) { ctx.time.hour = parseFloat(p.get('time')); ctx.time.update(0); }
  if (p.has('freeze')) ctx.time.frozen = true;
  if (p.has('weather')) ctx.weather.set(p.get('weather'), true), (ctx.weather.locked = true);
  if (p.has('boat')) {
    const [x, z, h] = p.get('boat').split(',').map(Number);
    ctx.boat.pos.set(x, 0, z); ctx.boat.heading = h || 0; ctx.boat.tied = null;
  }
  if (p.has('pos')) {
    const [x, y, z] = p.get('pos').split(',').map(Number);
    const mode = p.get('mode') || 'foot';
    ctx.player.mode = mode;
    ctx.player.teleport(new THREE.Vector3(x, y, z));
  }
  if (p.has('yaw')) ctx.player.yaw = parseFloat(p.get('yaw'));
  if (p.has('pitch')) ctx.player.pitch = parseFloat(p.get('pitch'));
  if (p.has('tp')) ctx.rig.thirdPerson = true;
  if (p.has('flashlight')) ctx.player.flashlight = true;
}
