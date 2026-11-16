// The two player settings every space piece follows (see public/settings.js):
//   low  (Low Graphics)    no nebula, no shooting stars, no parallax, no blur or glow layers
//   calm (Reduce Flashing, on by default with the system's reduce-motion) no flicker, no strobes,
//        no sweeping or bouncing motion; glows stay steady
import { SETTINGS } from '../../settings.js';

export const quality = () => ({ low: !!SETTINGS.lowGfx, calm: !!SETTINGS.reduceFlash });
// mirror them as classes on a root element so space.css can follow without JS per frame
export function applyQuality(root, q = quality()) {
  root.classList.toggle('sp-low', q.low);
  root.classList.toggle('sp-calm', q.calm);
  return q;
}
