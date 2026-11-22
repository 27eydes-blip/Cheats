/** DOM part of the HUD: position, lap, time, big intertitle-style messages. */
import type { Race } from '../game/race';
import { ordinal, fmtTime } from './dom';

export class HudDom {
  private root = document.getElementById('hud')!;
  private place = document.getElementById('hud-place')!;
  private suffix = document.getElementById('hud-suffix')!;
  private of = document.getElementById('hud-of')!;
  private lap = document.getElementById('hud-lap')!;
  private time = document.getElementById('hud-time')!;
  private msg = document.getElementById('hud-msg')!;
  private last = { place: -1, lap: '', time: '', msgs: 0 };
  private seen = new WeakSet<object>();

  show(on: boolean, r: Race | null) {
    this.root.hidden = !on;
    this.msg.innerHTML = '';
    this.last = { place: -1, lap: '', time: '', msgs: 0 };
    const posEl = this.root.querySelector('.hud-pos') as HTMLElement;
    if (r) posEl.style.visibility = r.opts.mode === 'trial' ? 'hidden' : 'visible';
  }

  update(r: Race) {
    if (r.place !== this.last.place) {
      this.last.place = r.place;
      this.place.textContent = String(r.place);
      this.suffix.textContent = ordinal(r.place);
      this.of.textContent = `/${r.rivals.length + 1}`;
    }
    const lap = r.opts.mode === 'trial' ? `LAP ${Math.min(r.lap, r.laps)}/${r.laps}  BEST ${fmtTime(r.bestLap)}` : `LAP ${Math.min(r.lap, r.laps)}/${r.laps}`;
    if (lap !== this.last.lap) { this.last.lap = lap; this.lap.textContent = lap; }
    const t = r.opts.mode === 'trial' ? r.raceT - r.lapStart : r.raceT;
    const ts = r.state === 'countdown' ? '0:00.00' : fmtTime(r.state === 'finished' ? r.finishRaceTime() : t);
    if (ts !== this.last.time) { this.last.time = ts; this.time.textContent = ts; }
    for (const m of r.messages) {
      if (this.seen.has(m)) continue;
      this.seen.add(m);
      const el = document.createElement('span');
      el.className = m.big ? 'big' : 'small';
      el.textContent = m.text;
      if (m.big) this.msg.querySelectorAll('.big').forEach((x) => x.remove());
      else this.msg.querySelectorAll('.small').forEach((x) => x.remove());
      this.msg.append(el);
      setTimeout(() => el.remove(), m.big ? 950 : 2200);
    }
  }
}
