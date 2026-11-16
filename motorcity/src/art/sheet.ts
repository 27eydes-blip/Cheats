/** Debug contact sheet of sprites (window.__mc.sheet()) used by visual checks. */
import { MODELS, carSprite } from './cars';
import { spr } from './registry';
import { PED_KINDS } from './people';

export function sheet(scale = 3): string {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 700;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#6b5539'; ctx.fillRect(0, 0, c.width, c.height);
  let x = 4, y = 4;
  const put = (img: HTMLCanvasElement, s = scale) => {
    if (x + img.width * s > c.width) { x = 4; y += 62 * s / 1.5; }
    ctx.drawImage(img, x, y, img.width * s, img.height * s); x += img.width * s + 4;
  };
  put(carSprite(MODELS.special, 'rear', { yaw: -1, wheel: 0, brake: false, scarf: 0, colour: true, paint: '#a3242b' }), 2);
  put(carSprite(MODELS.runabout, 'rear', { yaw: 0, wheel: 1, brake: true, scarf: 1, colour: true, paint: '#2b4a8c' }), 2);
  put(carSprite(MODELS.mercer, 'rear', { yaw: 1, wheel: 2, brake: false, scarf: 2, colour: true, paint: '#d9b02a' }), 2);
  for (const id of ['modelT', 'stutz', 'mercer', 'buick', 'packard'] as const) put(carSprite(MODELS[id], 'rear', { yaw: 0, wheel: 0, brake: false, scarf: 0, colour: false }), 2);
  put(carSprite(MODELS.runabout, 'side', { yaw: 0, wheel: 0, brake: false, scarf: 0, colour: true, paint: '#a3242b' }), 2);
  put(carSprite(MODELS.runabout, 'front', { yaw: 0, wheel: 0, brake: false, scarf: 0, colour: true, paint: '#a3242b' }), 2);
  x = 4; y += 130;
  for (const k of PED_KINDS) for (let f = 0; f < 6; f++) { const s = spr(`ped:${k}:0`, f); if (s) put(s.img, 3); }
  x = 4; y += 110;
  for (const id of ['carriage:0', 'wagon:1', 'truck:0', 'trolley:0', 'lamp', 'telePole', 'elm', 'oak', 'flagman', 'hydrant']) { const s = spr(id); if (s) put(s.img, 2); }
  return c.toDataURL();
}
