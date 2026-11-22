/** Silent-film intertitle screens: title, career, chapter cards, results, time trial, garage, settings, pause. */
import type { App } from '../app';
import { h, btn, rule, credits, toast, ordinal, fmtTime, haptic } from './dom';
import { TRACKS, trackById } from '../track/tracks';
import { CUPS, POINTS, PRIZE, type Cup } from '../data/career';
import { CARS, PAINTS, UPGRADES, UPGRADE_MAX, statsFor, MPH, carTitle, type UpgradeKind } from '../data/cars';
import { WEATHER } from '../data/weather';
import { MODELS, carSprite, toSepia } from '../art/cars';
import type { Race, Standing } from '../game/race';
import { input } from '../core/input';
import { audio } from '../audio/audio';
import { reset } from '../save/save';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DATES = ['MAY 1, 1915', 'MAY 15, 1915', 'MAY 29, 1915', 'JUNE 12, 1915', 'JUNE 26, 1915', 'JULY 4, 1915', 'JULY 17, 1915', 'JULY 31, 1915', 'AUG. 14, 1915', 'AUG. 28, 1915', 'SEPT. 11, 1915', 'SEPT. 25, 1915'];

interface CupRun { cup: Cup; idx: number; points: Map<string, number>; coins: number }

export class Screens {
  private run: CupRun | null = null;
  constructor(private app: App) {
    app.pauseHandler = () => this.pause();
    input.anyKeyListeners.push((e) => {
      if (e.code === 'Escape' && !app.race) { const back = app.ui.querySelector<HTMLButtonElement>('.back'); back?.click(); }
    });
  }
  private get save() { return this.app.save; }
  private show(el: HTMLElement) { this.app.ui.innerHTML = ''; this.app.ui.append(el); }
  clear() { this.app.ui.innerHTML = ''; }
  private back(fn: () => void) { return h('button', { class: 'back', 'aria-label': 'Back', onclick: () => { audio.click(); fn(); } }, '←'); }
  private coins() { return h('div', { class: 'coins' }, `${this.save.coins.toLocaleString()} coins`); }
  private ensureAttract() { if (!this.app.attract) this.app.startAttract(); }

  // ---------------- title ----------------
  title() {
    this.ensureAttract();
    this.app.music('title');
    this.show(h('div', { class: 'screen clear' },
      h('div', { class: 'card' },
        h('h1', { class: 'title-logo' }, 'Motor City', h('span', {}, '1915')),
        h('p', { class: 'subtitle' }, 'A Motoring Picture in Twelve Chapters'),
        rule(),
        h('div', { class: 'menu' },
          btn('Career', () => (this.save.seenIntro ? this.career() : this.howTo(() => this.career())), { cls: 'primary', sub: 'Four cups · twelve chapters' }),
          btn('Time Trial', () => this.trial(), { sub: 'Race your own ghost' }),
          btn('Garage', () => this.garage()),
          h('div', { class: 'row' }, btn('Settings', () => this.settings(() => this.title()), { cls: 'small' }), btn('How to Drive', () => this.howTo(() => this.title()), { cls: 'small' })),
        ),
        h('div', { style: { marginTop: '10px' } }, this.coins()),
      ),
    ));
    // credits pinned to the bottom of the title screen so they are always on view
    const foot = credits(); foot.classList.add('footer');
    this.app.ui.append(foot);
    this.app.ui.firstElementChild!.classList.add('titled');
  }

  howTo(next: () => void) {
    this.save.seenIntro = true; this.app.persist();
    const li = (a: string, b: string) => h('p', {}, h('b', { style: { fontFamily: 'var(--head)', color: 'var(--brass)' } }, a), ' — ', b);
    this.show(h('div', { class: 'screen' }, h('div', { class: 'card' },
      h('h3', {}, 'Instructions to the Motorist'),
      h('h2', {}, 'How to Drive'), rule(),
      li('Throttle', 'is automatic. Your motor runs flat out.'),
      li('◀ ▶', 'steer. Or switch on tilt steering in Settings.'),
      li('Brake', 'slows you. Hold it while steering hard at speed to POWERSLIDE.'),
      li('Powerslides', 'fill the BOOST gauge. Tap BOOST for a nitro burst and a backfire bang.'),
      li('Slipstream', 'tuck in behind a rival to draft past.'),
      li('Ah-oo-gah!', 'sound the klaxon: rivals swerve, horses shy, pedestrians leap.'),
      h('p', { style: { fontStyle: 'italic', color: 'var(--cream2)' } }, 'Keyboard: arrows steer · Space brake · Shift boost · H horn · Esc pause'),
      h('div', { class: 'menu' }, btn('Onward!', next, { cls: 'primary' })),
    )));
  }

  // ---------------- career ----------------
  private cupUnlocked(c: Cup) { return !c.requires || !!this.save.cups[c.requires]?.done; }

  career() {
    this.ensureAttract();
    this.app.music('title');
    const tiles = CUPS.map((c, i) => {
      const prog = this.save.cups[c.id];
      const open = this.cupUnlocked(c);
      const medal = prog?.best ? ['', '🥇 Champion', '🥈 Runner-up', '🥉 Third'][prog.best] ?? `Best: ${prog.best}${ordinal(prog.best)}` : '';
      return h('div', { class: `tile ${open ? '' : 'locked'}`, onclick: () => { audio.click(); if (open) this.cupIntro(c); else toast(`Win a place in ${CUPS.find((x) => x.id === c.requires)?.name} first`); } },
        h('div', { class: 'tag' }, open ? `Cup ${ROMAN[i + 1]}` : 'LOCKED'),
        h('div', { class: 't' }, c.name),
        h('div', { class: 'd' }, c.subtitle),
        h('div', { class: 'd', style: { marginTop: '6px', fontStyle: 'normal' } }, c.races.map((r) => trackById(r.track).name).join(' · ')),
        medal ? h('div', { class: 'stars', style: { marginTop: '4px' } }, medal) : null,
      );
    });
    this.show(h('div', { class: 'screen' }, this.back(() => this.title()), h('div', { class: 'card wide' },
      h('h3', {}, 'Career'), h('h2', {}, 'The Racing Season of 1915'), this.coins(), rule(),
      h('div', { class: 'grid' }, ...tiles),
    )));
  }

  cupIntro(c: Cup) {
    this.run = { cup: c, idx: 0, points: new Map(), coins: 0 };
    this.show(h('div', { class: 'screen' }, this.back(() => this.career()), h('div', { class: 'card chapter' },
      h('div', { class: 'num' }, 'THE SEASON OF 1915 PRESENTS'),
      h('h2', {}, c.name),
      h('p', { class: 'subtitle' }, c.subtitle), rule(),
      h('p', {}, `Three races. Points for every finisher: ${POINTS.join(', ')}. The champion takes home ${c.prize} coins.`),
      h('div', { class: 'menu' }, btn('Begin', () => this.chapter(), { cls: 'primary' })),
    )));
  }

  chapter() {
    const run = this.run!;
    const race = run.cup.races[run.idx];
    const tr = trackById(race.track);
    const w = WEATHER[race.weather];
    const go = () => { if (done) return; done = true; this.startCareerRace(); };
    let done = false;
    this.app.music('title');
    const card = h('div', { class: 'screen', onclick: go }, h('div', { class: 'card chapter' },
      h('div', { class: 'num' }, `CHAPTER ${race.chapter}`),
      h('h2', {}, tr.chapterTitle),
      h('div', { class: 'meta' }, `${tr.city === 'ny' ? 'New York' : 'Detroit'} · ${w.name} · ${race.laps} laps · ${race.rivals + 1} motorists`),
      rule(),
      h('p', { style: { fontStyle: 'italic' } }, `“${tr.blurb}”`),
      h('div', { class: 'tap' }, 'TAP TO RACE'),
    ));
    this.show(card);
  }

  private raceOpts(track: string, weather: keyof typeof WEATHER, laps: number, rivals: number, difficulty: number, mode: 'career' | 'trial' | 'quick') {
    const s = this.save;
    return { track: trackById(track), weather, mode, car: s.car, paint: this.app.paintHex(), upgrades: s.upgrades[s.car] ?? {}, rivals, difficulty, level: s.settings.difficulty, laps, ghost: mode === 'trial' ? s.ghosts[track] ?? null : null } as const;
  }

  private startCareerRace() {
    const run = this.run!;
    const r = run.cup.races[run.idx];
    this.clear();
    this.app.startRace({ ...this.raceOpts(r.track, r.weather, r.laps, r.rivals, r.difficulty, 'career') }, (race) => this.careerResult(race));
  }

  private careerResult(race: Race) {
    const run = this.run!;
    const st = race.standings();
    const place = st.findIndex((s) => s.player) + 1;
    st.forEach((s, i) => run.points.set(s.name, (run.points.get(s.name) ?? 0) + (POINTS[i] ?? 0)));
    const diffMul = run.cup.races[run.idx].difficulty;
    const bonus = race.stats.drifts * 5 + race.stats.overtakes * 10 + (race.stats.crashes === 0 ? 75 : 0);
    const earned = Math.round((PRIZE[place - 1] ?? 50) * diffMul + bonus);
    run.coins += earned;
    this.bank(earned, race, place);
    const last = run.idx === run.cup.races.length - 1;
    this.results(race, st, place, earned, {
      label: last ? 'Final Standings' : 'Next Chapter',
      next: () => { if (last) this.cupFinal(); else { run.idx++; this.chapter(); } },
      retry: () => { st.forEach((s, i) => run.points.set(s.name, (run.points.get(s.name) ?? 0) - (POINTS[i] ?? 0))); this.save.coins -= earned; run.coins -= earned; this.app.persist(); this.startCareerRace(); },
      chapter: run.cup.races[run.idx].chapter,
    });
  }

  private bank(earned: number, race: Race, place: number) {
    const s = this.save;
    s.coins += earned;
    s.stats.races++; if (place === 1) s.stats.wins++;
    s.stats.drifts += race.stats.drifts; s.stats.horns += race.stats.horns;
    if (!s.raced.includes(race.opts.track.id)) s.raced.push(race.opts.track.id);
    if (race.bestLap && (!s.bestLaps[race.opts.track.id] || race.bestLap < s.bestLaps[race.opts.track.id])) s.bestLaps[race.opts.track.id] = race.bestLap;
    this.app.persist();
  }

  private cupFinal() {
    const run = this.run!;
    const table = [...run.points.entries()].sort((a, b) => b[1] - a[1]);
    const place = table.findIndex(([n]) => n === 'You') + 1;
    const prize = place === 1 ? run.cup.prize : place === 2 ? Math.round(run.cup.prize * 0.5) : place === 3 ? Math.round(run.cup.prize * 0.25) : 0;
    const prog = this.save.cups[run.cup.id] ?? { results: [], points: 0, done: false, best: 0 };
    prog.results.push(place);
    prog.points = Math.max(prog.points, run.points.get('You') ?? 0);
    if (place <= 3) prog.done = true;
    prog.best = prog.best ? Math.min(prog.best, place) : place;
    this.save.cups[run.cup.id] = prog;
    this.save.coins += prize;
    const gatsbyNow = this.app.grantGatsbyIfEarned();
    this.app.persist();
    if (prize) { audio.coin(); audio.cheer(); }
    this.app.music(place === 1 ? 'results' : 'garage');
    const nextCup = CUPS[CUPS.indexOf(run.cup) + 1];
    const unlockedNow = place <= 3 && nextCup;
    this.show(h('div', { class: 'screen' }, h('div', { class: 'card chapter' },
      h('div', { class: 'num' }, run.cup.name.toUpperCase()),
      h('h2', {}, place === 1 ? 'Champion!' : place <= 3 ? `${place}${ordinal(place)} in the Cup` : 'Better Luck Next Season'),
      h('div', { class: 'trophy', style: { fontSize: '64px', lineHeight: '1', margin: '8px 0' } }, place === 1 ? '🏆' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🔧'),
      rule(),
      h('table', { style: { width: '100%', fontFamily: 'var(--head)', fontSize: '14px', letterSpacing: '1px' } },
        ...table.map(([n, p], i) => h('tr', { style: n === 'You' ? { color: '#f2d68a' } : {} }, h('td', { style: { textAlign: 'left' } }, `${i + 1}. ${n}`), h('td', { style: { textAlign: 'right' } }, `${p} pts`)))),
      prize ? h('p', { class: 'earned coins' }, `Cup prize: ${prize} coins`) : h('p', {}, 'Finish in the top three to advance.'),
      unlockedNow ? h('p', { style: { fontFamily: 'var(--head)', color: 'var(--brass)' } }, `${nextCup.name} is now open!`) : null,
      place === 1 && run.cup.id === 'grandprix' ? h('p', { class: 'subtitle' }, 'The greatest motorist of 1915. The End… or is it?') : null,
      gatsbyNow ? h('p', { class: 'earned', style: { color: '#f2d68a', fontFamily: 'var(--title)' } }, 'Every cup is yours. The Gatsby — Legendary — awaits in the garage!') : null,
      h('div', { class: 'menu' }, btn('Continue', () => this.career(), { cls: 'primary' }), btn('Garage', () => this.garage())),
      credits(),
    )));
  }

  // ---------------- results / newspaper ----------------
  results(race: Race, st: Standing[], place: number, earned: number, o: { label: string; next: () => void; retry: () => void; chapter?: string }) {
    this.ensureAttract();
    this.app.music(place <= 3 ? 'results' : 'garage');
    if (earned > 0) setTimeout(() => audio.coin(), 700);
    if (place === 1) audio.cheer();
    const tr = race.opts.track;
    const ny = tr.city === 'ny';
    const winner = st[0];
    const street = tr.name.toUpperCase();
    const car = (MODELS[race.opts.car]?.name ?? 'MOTOR').toUpperCase();
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const headline = place === 1
      ? pick([`LOCAL LAD WINS ${street} GRAND PRIX!`, `${car} TRIUMPHS ON ${street}!`, `DAREDEVIL DRIVER CONQUERS ${street}!`, `“AH-OO-GAH!” — AND VICTORY!`])
      : place <= 3 ? pick([`PLUCKY MOTORIST TAKES ${place}${ordinal(place).toUpperCase()} AT ${street}`, `GALLANT ${place}${ordinal(place).toUpperCase()} FOR HOMETOWN DRIVER`, `CLOSE FINISH THRILLS ${street} CROWD`])
      : pick([`${winner.name.toUpperCase()} VICTORIOUS; OUR MAN ${place}${ordinal(place).toUpperCase()}`, `DUST AND DISAPPOINTMENT ON ${street}`, `${street} RACE A ROUT FOR ${winner.name.split(' ')[0].toUpperCase()}`]);
    const s = race.stats;
    const deck = [
      `Reached ${Math.round(s.topMph)} m.p.h. before a crowd of thousands`,
      s.drifts ? `executed ${s.drifts} daring powerslide${s.drifts > 1 ? 's' : ''}` : null,
      s.horns ? `sounded the klaxon ${s.horns} time${s.horns > 1 ? 's' : ''}, scattering carriages` : null,
      s.crashes ? `survived ${s.crashes} mishap${s.crashes > 1 ? 's' : ''}` : 'drove without a scratch',
    ].filter(Boolean).join('; ') + '.';
    const podium = h('div', { class: 'podium' }, ...[1, 0, 2].map((i) => {
      const e = st[i];
      if (!e) return h('div', {});
      const m = e.player ? MODELS[race.opts.car] : MODELS[race.rivals.find((r) => r.def.name === e.name)?.def.model ?? 'modelT'];
      const img = carSprite(m ?? MODELS.runabout, 'rear', { yaw: 0, wheel: 0, brake: false, scarf: 0, colour: e.player, paint: e.player ? race.opts.paint : undefined });
      const cv = h('canvas', { width: img.width, height: img.height }) as HTMLCanvasElement;
      cv.getContext('2d')!.drawImage(img, 0, 0);
      return h('div', { class: `p${i + 1}` }, cv, `${i + 1}`, h('span', {}, e.player ? 'YOU' : e.name.split(' ').slice(-1)[0]));
    }));
    const rows = st.map((e, i) => h('tr', { class: e.player ? 'me' : '' }, h('td', {}, `${i + 1}. ${e.player ? 'You' : e.name}`), h('td', {}, e.finished && e.time ? fmtTime(e.time) : 'still racing')));
    this.show(h('div', { class: 'screen' },
      h('div', { class: 'paper' },
        h('div', { class: 'mast' }, ny ? 'The Gotham Evening Herald' : 'The Motor City Gazette'),
        h('div', { class: 'dateline' }, h('span', {}, o.chapter ? `CHAPTER ${o.chapter}` : 'EXTRA!'), h('span', {}, DATES[Math.max(0, ROMAN.indexOf(o.chapter ?? '') - 1)] ?? '1915'), h('span', {}, 'ONE CENT')),
        h('div', { class: 'headline' }, headline),
        h('div', { class: 'deck' }, deck),
        podium,
        h('table', {}, ...rows),
        h('div', { class: 'earned coins', style: { color: '#7a5418' } }, `+${earned} coins`),
        h('div', { class: 'credits', style: { color: '#3a2a10' } }, h('b', { style: { color: '#5a3d12' } }, 'Gleyde Technologies, LLC'), ' · Created by Sam Eyde III', h('br', {}), 'Juwon Shon, COO'),
      ),
      h('div', { class: 'menu', style: { marginTop: '18px' } }, btn(o.label, o.next, { cls: 'primary' }), h('div', { class: 'row' }, btn('Race Again', o.retry, { cls: 'small' }), btn('Garage', () => this.garage(), { cls: 'small' }))),
    ));
  }

  // ---------------- time trial ----------------
  trial() {
    this.ensureAttract();
    this.app.music('garage');
    const unlocked = (id: string) => this.save.raced.includes(id) || CUPS[0].races.some((r) => r.track === id);
    const tiles = TRACKS.map((t) => {
      const open = unlocked(t.id);
      const best = this.save.bestLaps[t.id];
      return h('div', { class: `tile ${open ? '' : 'locked'}`, onclick: () => { audio.click(); if (open) this.startTrial(t.id); else toast('Race this course in the Career first'); } },
        h('div', { class: 'tag' }, this.save.ghosts[t.id] ? '👻 ghost' : open ? '' : 'LOCKED'),
        h('div', { class: 't' }, t.name), h('div', { class: 'd' }, t.city === 'ny' ? 'New York' : 'Detroit'),
        h('div', { class: 'd', style: { fontStyle: 'normal' } }, `Best lap: ${best ? fmtTime(best) : '—'}`));
    });
    this.show(h('div', { class: 'screen' }, this.back(() => this.title()), h('div', { class: 'card wide' },
      h('h3', {}, 'Time Trial'), h('h2', {}, 'Against the Clock'),
      h('p', { class: 'subtitle' }, 'Three laps, an empty road, and the ghost of your best lap.'), rule(),
      h('div', { class: 'grid' }, ...tiles))));
  }

  private startTrial(id: string) {
    this.clear();
    const weather = id === 'belleisle' ? 'clear' : 'overcast';
    this.app.startRace({ ...this.raceOpts(id, weather, 3, 0, 1, 'trial'), traffic: 0 }, (race) => {
      const s = this.save;
      let earned = 0;
      const oldBest = s.bestLaps[id];
      if (race.newGhost && (!s.ghosts[id] || race.newGhost.time < s.ghosts[id].time)) s.ghosts[id] = race.newGhost;
      if (race.bestLap && (!oldBest || race.bestLap < oldBest)) { earned = oldBest ? 150 : 60; s.bestLaps[id] = race.bestLap; }
      s.coins += earned;
      if (!s.raced.includes(id)) s.raced.push(id);
      this.app.persist();
      if (earned) { audio.coin(); audio.cheer(); }
      this.app.music('results');
      this.show(h('div', { class: 'screen' }, h('div', { class: 'card chapter' },
        h('div', { class: 'num' }, 'TIME TRIAL'), h('h2', {}, trackById(id).name), rule(),
        ...race.lapTimes.map((t, i) => h('p', { style: { fontFamily: 'var(--head)', letterSpacing: '1px', color: t === race.bestLap ? '#f2d68a' : undefined } }, `Lap ${i + 1}: ${fmtTime(t)}${t === race.bestLap ? '  ★' : ''}`)),
        h('p', { style: { fontFamily: 'var(--head)' } }, `Record: ${fmtTime(s.bestLaps[id])}`),
        earned ? h('p', { class: 'earned coins' }, `${oldBest ? 'NEW RECORD! ' : ''}+${earned} coins`) : h('p', { class: 'subtitle' }, 'The ghost holds its record… for now.'),
        h('div', { class: 'menu' }, btn('Try Again', () => this.startTrial(id), { cls: 'primary' }), btn('Choose Course', () => this.trial())),
        credits(),
      )));
    });
  }

  // ---------------- garage ----------------
  garage(tab: 'cars' | 'tune' | 'paint' = 'cars', view?: string) {
    this.ensureAttract();
    this.app.music('garage');
    const s = this.save;
    const sel = (view ?? s.car) as typeof s.car;
    const spec = CARS.find((c) => c.id === sel)!;
    const owned = s.owned.includes(sel);
    const ups = s.upgrades[sel] ?? {};
    const st = statsFor(sel, ups);
    const base = statsFor(sel, {});
    const preview = h('canvas', { width: 80, height: 58 }) as HTMLCanvasElement;
    const pctx = preview.getContext('2d')!;
    const paintHex = owned ? this.app.paintHex(sel) : MODELS[sel].paint;
    let frame = 0;
    const anim = setInterval(() => {
      if (!preview.isConnected) { clearInterval(anim); return; }
      frame++;
      const yaw = ([0, 0, 1, 1, 0, 0, -1, -1] as const)[Math.floor(frame / 6) % 8];
      // legendary cars also show off their front (the Gatsby's grille and gold "G") every few seconds
      const showFront = !!MODELS[sel].luxe && Math.floor(frame / 48) % 3 === 2;
      const img = carSprite(MODELS[sel], showFront ? 'front' : 'rear', { yaw: showFront ? 0 : yaw, wheel: frame, brake: Math.floor(frame / 12) % 5 === 0, scarf: Math.floor(frame / 3) % 3, colour: true, paint: paintHex });
      pctx.clearRect(0, 0, 80, 58); pctx.drawImage(img, 0, 0);
    }, 70);
    const bar = (label: string, v: number, b: number, max: number) => h('div', { class: 'stat' }, h('span', {}, label),
      h('div', { class: 'bar' }, h('b', { style: { width: `${Math.min(100, (v / max) * 100)}%` } }), h('i', { style: { width: `${Math.min(100, (b / max) * 100)}%` } })),
      h('span', {}, label === 'Top speed' ? `${Math.round(v / MPH)} mph` : v.toFixed(2)));
    const stats = h('div', {},
      bar('Top speed', st.top, base.top, 104 * MPH), bar('Pick-up', st.accel, base.accel, 1.6), bar('Grip', st.grip, base.grip, 1.6), bar('Steering', st.handling, base.handling, 1.6));
    const tabs = h('div', { class: 'tabs' }, ...(['cars', 'tune', 'paint'] as const).map((t) => btn(t === 'cars' ? 'Motor Cars' : t === 'tune' ? 'Tuning' : 'Paint', () => this.garage(t, sel), { cls: `small ${t === tab ? 'on' : ''}` })));
    let body: HTMLElement;
    if (tab === 'cars') {
      body = h('div', { class: 'grid' }, ...CARS.map((c) => {
        const have = s.owned.includes(c.id);
        return h('div', { class: `tile ${c.id === sel ? 'sel' : ''}`, onclick: () => { audio.click(); this.garage('cars', c.id); } },
          h('div', { class: 'tag' }, have ? (s.car === c.id ? 'DRIVING' : 'OWNED') : `${c.price.toLocaleString()}c`),
          h('div', { class: `t ${c.tier ? 'legendary' : ''}` }, carTitle(c)), h('div', { class: 'd' }, `${c.year} · ${c.top} mph${c.unlockAllCups && !have ? ' · or win every cup' : ''}`));
      }));
    } else if (tab === 'tune') {
      body = h('div', {}, ...(Object.keys(UPGRADES) as UpgradeKind[]).map((k) => {
        const lvl = ups[k] ?? 0;
        const u = UPGRADES[k];
        const cost = u.cost[lvl];
        return h('div', { class: 'setting' }, h('div', {}, `${u.name} ${'●'.repeat(lvl)}${'○'.repeat(UPGRADE_MAX - lvl)}`, h('div', { style: { fontFamily: 'var(--body)', fontStyle: 'italic', fontSize: '13px', letterSpacing: '0', color: 'var(--cream2)' } }, u.desc)),
          lvl >= UPGRADE_MAX ? h('span', { class: 'stars' }, 'MAX') : btn(`${cost}c`, () => {
            if (!owned) return toast('Buy this motor car first');
            if (s.coins < cost) return toast('Not enough coins');
            s.coins -= cost; (s.upgrades[sel] ??= {})[k] = lvl + 1; this.app.persist(); audio.coin(); haptic(20); this.garage('tune', sel);
          }, { cls: 'small', disabled: !owned || s.coins < cost }));
      }));
    } else if (MODELS[sel].luxe) {
      body = h('p', { class: 'subtitle' }, 'The Gatsby comes only in its own rich cream-yellow, hand-tinted against the sepia city.');
    } else {
      const cur = s.paints[sel] ?? 'carmine';
      body = h('div', {}, h('div', { class: 'swatches' }, ...PAINTS.map((p) => {
        const have = s.paintsOwned.includes(p.id);
        return h('div', { class: `swatch ${p.id === cur ? 'sel' : ''} ${have ? '' : 'locked'}`, title: p.name, style: { background: p.hex }, onclick: () => {
          audio.click();
          if (!owned) return toast('Buy this motor car first');
          if (!have) { if (s.coins < p.price) return toast(`${p.name}: ${p.price} coins`); s.coins -= p.price; s.paintsOwned.push(p.id); audio.coin(); toast(`${p.name} purchased`); }
          s.paints[sel] = p.id; this.app.persist(); this.garage('paint', sel);
        } });
      })), h('p', { class: 'subtitle' }, `${(PAINTS.find((p) => p.id === cur) ?? PAINTS[0]).name} — hand-tinted, like a colourised photograph. Locked colours show their price when tapped.`));
    }
    const action = owned
      ? (s.car === sel ? h('p', { style: { fontFamily: 'var(--head)', color: 'var(--brass)' } }, 'Your current motor car') : btn('Drive This Car', () => { s.car = sel; this.app.persist(); this.app.attract = null; this.garage(tab, sel); }, { cls: 'primary' }))
      : btn(`Buy for ${spec.price.toLocaleString()} coins`, () => {
        if (s.coins < spec.price) return toast('Not enough coins — win some races!');
        s.coins -= spec.price; s.owned.push(sel); s.car = sel; s.paints[sel] ??= 'carmine'; this.app.persist(); audio.coin(); audio.backfire(); haptic(30); toast(`The ${carTitle(spec)} is yours!`); this.app.attract = null; this.garage(tab, sel);
      }, { cls: 'primary', disabled: s.coins < spec.price, sub: spec.unlockAllCups ? 'or win every career cup to earn it free' : undefined });
    this.show(h('div', { class: 'screen' }, this.back(() => this.title()), h('div', { class: 'card wide' },
      h('h3', {}, 'The Garage'), h('h2', { class: spec.tier ? 'legendary' : '' }, carTitle(spec)), this.coins(),
      h('div', { class: 'garage-view' }, preview),
      h('p', { class: 'subtitle' }, spec.blurb),
      stats, h('div', { class: 'menu' }, action), tabs, body,
    )));
    void toSepia;
  }

  // ---------------- settings ----------------
  settings(back: () => void) {
    const s = this.save.settings;
    const slider = (label: string, key: 'master' | 'sfx' | 'music') => {
      const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]) }) as HTMLInputElement;
      inp.addEventListener('input', () => { s[key] = +inp.value; this.app.applyVolumes(); this.app.persist(); });
      inp.addEventListener('change', () => audio.click());
      return h('div', { class: 'setting' }, h('span', {}, label), inp);
    };
    const seg = <T extends string | number | boolean>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const wrap = h('div', { class: 'seg' });
      const draw = () => { wrap.innerHTML = ''; for (const [v, l] of opts) wrap.append(h('button', { class: get() === v ? 'on' : '', onclick: () => { audio.click(); set(v); this.app.persist(); draw(); } }, l)); };
      draw();
      return h('div', { class: 'setting' }, h('span', {}, label), wrap);
    };
    this.show(h('div', { class: 'screen' }, this.back(back), h('div', { class: 'card' },
      h('h3', {}, 'Settings'), h('h2', {}, 'The Projection Booth'), rule(),
      slider('Master volume', 'master'), slider('Sound effects', 'sfx'), slider('Ragtime music', 'music'),
      seg('Music', [[true, 'On'], [false, 'Off']], () => audio.musicEnabled, (v) => { audio.musicEnabled = v; }),
      seg('Film grain & flicker', [[2, 'Full'], [1, 'Light'], [0, 'Off']], () => s.film, (v) => (s.film = v)),
      seg('Steering', [[false, 'Buttons'], [true, 'Tilt']], () => s.tilt, async (v) => {
        if (v) { const ok = await input.requestTilt(); if (!ok) { toast('Tilt is not available on this device'); return; } }
        s.tilt = v; input.tiltEnabled = v; this.app.persist(); this.settings(back);
      }),
      seg('Difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], () => s.difficulty, (v) => (s.difficulty = v)),
      h('div', { class: 'menu' }, btn('Reset All Progress', () => {
        if (!confirm('Erase all progress, cars and coins?')) return;
        const keep = { ...s };
        this.app.save = reset(); this.app.save.settings = keep; this.app.persist(); toast('Progress erased'); this.title();
      }, { cls: 'small' })),
      credits(),
    )));
  }

  // ---------------- pause ----------------
  pause() {
    const app = this.app;
    const r = app.race;
    this.show(h('div', { class: 'screen' }, h('div', { class: 'card' },
      h('h3', {}, r ? `${r.opts.track.name} · Lap ${Math.min(r.lap, r.laps)}/${r.laps}` : ''),
      h('h2', {}, 'Intermission'), h('p', { class: 'subtitle' }, 'Please do not adjust your seat.'), rule(),
      h('div', { class: 'menu' },
        btn('Resume', () => { this.clear(); app.unpause(); }, { cls: 'primary' }),
        btn('Restart Race', () => { const o = r!.opts; const cb = app.onRaceEnd!; app.endRace(); this.clear(); app.startRace(o, cb); }),
        btn('Settings', () => this.settings(() => this.pause())),
        btn('Quit Race', () => { app.endRace(); this.run = null; this.title(); }),
      ),
    )));
  }

  quick() { this.clear(); this.app.startRace({ ...this.raceOpts('depot', 'overcast', 2, 5, 0.92, 'quick') }, () => this.title()); }
}
