import './style.css';
import { buildProps } from './art/props';
import { buildPeople } from './art/people';
import { buildVehicles } from './art/vehicles';
import { App } from './app';
import { Screens } from './ui/screens';
import { startLoop } from './core/loop';
import { trackById } from './track/tracks';
import { sheet } from './art/sheet';
import { input } from './core/input';
import { audio } from './audio/audio';

function boot() {
  buildProps();
  buildPeople();
  buildVehicles();
  const app = new App();
  const screens = new Screens(app);
  (window as any).__mc = { app, screens, tracks: trackById, sheet, input, audio };
  screens.title();
  startLoop((dt) => app.update(dt), (dt, alpha) => app.render(dt, alpha));
}

const go = () => { try { boot(); } catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#efe3c4;padding:20px;white-space:pre-wrap">${String((e as Error)?.stack ?? e)}</pre>`); } };
if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(go); else go();
