/** Intertitle screens (milestone 1: title, pause, simple results). */
import type { App } from '../app';
import { h, btn, rule, credits } from './dom';
import { trackById } from '../track/tracks';

export class Screens {
  constructor(private app: App) {
    app.pauseHandler = () => this.pause();
  }
  private show(el: HTMLElement) { this.app.ui.innerHTML = ''; this.app.ui.append(el); }
  clear() { this.app.ui.innerHTML = ''; }

  title() {
    const app = this.app;
    if (!app.attract) app.startAttract();
    app.music('title');
    this.show(h('div', { class: 'screen clear' },
      h('div', { class: 'card' },
        h('h1', { class: 'title-logo' }, 'Motor City', h('span', {}, '1915')),
        h('p', { class: 'subtitle' }, 'A Motoring Picture in Twelve Chapters'),
        rule(),
        h('div', { class: 'menu' }, btn('Quick Race', () => this.quick(), { cls: 'primary' })),
        credits(),
      ),
    ));
  }

  quick() {
    this.clear();
    const app = this.app;
    app.startRace({ track: trackById('depot'), weather: 'overcast', mode: 'quick', car: app.save.car, paint: app.paintHex(), upgrades: {}, rivals: 5, difficulty: 1, laps: 2 }, () => this.title());
  }

  pause() {
    const app = this.app;
    this.show(h('div', { class: 'screen' }, h('div', { class: 'card' },
      h('h2', {}, 'Intermission'), rule(),
      h('div', { class: 'menu' },
        btn('Resume', () => { this.clear(); app.unpause(); }, { cls: 'primary' }),
        btn('Quit Race', () => { app.endRace(); this.title(); }),
      ),
    )));
  }
}
