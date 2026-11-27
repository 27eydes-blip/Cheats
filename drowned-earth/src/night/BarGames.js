// House games, played in the bar panel. Each is short, readable and fair-ish
// (the house edge is honest and stated). They spend and win real currency.
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function runGame(nl, bar, id, done) {
  const G = nl.data.games[id];
  if (!G) return done('Not tonight.');
  const ui = nl.ctx.ui, inv = nl.ctx.inventory;
  const head = (sub = '') => `<button class="btn close" data-close>Leave</button><h2>${esc(G.name)}</h2><div class="sub">${esc(G.desc)}</div><h3>${nl.walletLine(bar)}</h3>${sub}`;
  const panel = (html, bind) => { ui.openPanel('bar', html, bind); nl.ctx.paused = true; };
  const back = (msg) => done(msg);
  const cur = G.cur || 'scrap';
  const stakeRow = (fn) => `<div class="row"><div class="name">Stake</div>${[G.stake[0], Math.round((G.stake[0] + G.stake[1]) / 2), G.stake[1]].filter((v, i, a) => a.indexOf(v) === i).map((s) => `<button class="btn" data-s="${s}" ${inv.has(cur, s) ? '' : 'disabled'}>${s} ${cur}</button>`).join('')}<button class="btn" data-back>Back</button></div>`;
  const bindStake = (el, fn) => { el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => fn(+b.dataset.s))); el.querySelector('[data-back]')?.addEventListener('click', () => back('Maybe later.')); };
  nl.ctx.events.emit('night:game', { bar: bar.id, game: id });

  if (id === 'tide_cards') {
    // high-low: call the next card; each right call doubles the pot; bank whenever
    const deck = []; for (const s of SUITS) for (let r = 0; r < 13; r++) deck.push({ r, s }); deck.sort(() => Math.random() - 0.5);
    const card = (c) => `<span style="display:inline-block;min-width:44px;padding:8px 6px;margin:2px;border:1px solid var(--line);background:#f3ead8;color:${c.s === '♥' || c.s === '♦' ? '#a22' : '#111'};font:18px Georgia;text-align:center">${RANKS[c.r]}${c.s}</span>`;
    const start = (stake) => {
      inv.remove(cur, stake);
      let pot = stake, cur0 = deck.pop(), shown = [cur0];
      const round = (msg = '') => {
        const html = head(`<div class="row"><div class="name">${shown.map(card).join('')}<small>${esc(msg)}</small></div></div><div class="row"><div class="name">Pot: <b>${pot}</b> ${cur}</div><button class="btn" data-h>Higher</button><button class="btn" data-l>Lower</button><button class="btn" data-bank>Bank it</button></div>`);
        const lost = (tie) => {
          const msg2 = tie ? 'A tie goes to the house. Quill shrugs, apologetically, the way a shark apologises.' : 'Wrong call. The pot goes back across the table.';
          panel(head(`<div class="row"><div class="name">${shown.map(card).join('')}<small>${msg2}</small></div></div><div class="row"><button class="btn" data-again>Again</button><button class="btn" data-back>Back</button></div>`), (e2) => {
            e2.querySelector('[data-again]').addEventListener('click', () => runGame(nl, bar, id, done));
            e2.querySelector('[data-back]').addEventListener('click', () => back('You lost the pot.'));
          });
        };
        const call = (hi) => {
          const nx = deck.pop(); const prev = cur0; shown.push(nx); cur0 = nx;
          const win = nx.r !== prev.r && (hi ? nx.r > prev.r : nx.r < prev.r);
          if (!win) { nl.ctx.events.emit('night:lose', { bar: bar.id, amount: stake }); lost(nx.r === prev.r); return; }
          pot *= 2;
          if (shown.length > 6) { inv.add(cur, pot); back(`Six cards running. The table actually claps. You bank ${pot} ${cur}.`); return; }
          round('Right. Keep going, or bank it.');
        };
        panel(html, (el) => {
          el.querySelector('[data-h]').addEventListener('click', () => call(true));
          el.querySelector('[data-l]').addEventListener('click', () => call(false));
          el.querySelector('[data-bank]').addEventListener('click', () => { inv.add(cur, pot); nl.ctx.events.emit('night:win', { bar: bar.id, amount: pot - stake }); back(`You bank ${pot} ${cur}. Quill nods slowly, memorising your face.`); });
        });
      };
      round('First card is up.');
    };
    return panel(head(stakeRow()), (el) => bindStake(el, start));
  }

  if (id === 'bones') {
    const roll = () => [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6));
    const score = (r) => { const s = [...r].sort(); if (s[0] === s[2]) return 100 + s[0]; if (s[0] === s[1] || s[1] === s[2]) return 50 + s[1]; return r[0] + r[1] + r[2]; };
    const pips = (r) => r.map((n) => `<span style="font-size:26px;margin:0 4px">${'⚀⚁⚂⚃⚄⚅'[n - 1]}</span>`).join('');
    const start = (stake) => {
      inv.remove(cur, stake);
      const you = roll(), house = roll(), a = score(you), b = score(house);
      const win = a > b;
      if (win) inv.add(cur, stake * 2);
      else if (a === b) inv.add(cur, stake);
      nl.ctx.events.emit(win ? 'night:win' : 'night:lose', { bar: bar.id, amount: stake });
      panel(head(`<div class="row"><div class="name">You ${pips(you)}</div></div><div class="row"><div class="name">House ${pips(house)}</div></div><div class="row"><div class="name">${win ? `You take ${stake * 2} ${cur}.` : a === b ? 'A push. Stakes back.' : 'The house takes it. The house always looks so surprised.'}<small>Triples beat pairs beat sums.</small></div><button class="btn" data-again>Again</button><button class="btn" data-back>Back</button></div>`), (el) => { el.querySelector('[data-again]').addEventListener('click', () => runGame(nl, bar, id, done)); el.querySelector('[data-back]').addEventListener('click', () => back('You step away from the bones.')); });
    };
    return panel(head(stakeRow()), (el) => bindStake(el, start));
  }

  if (id === 'last_rope') {
    // drink when the rope creaks; every round others drop out. Stay standing.
    let left = 5, round = 1;
    const step = () => {
      nl.state.drunk = Math.min(1.3, nl.state.drunk + 0.12);
      nl.ctx.audio?.synth && nl.ctx.audio.started && nl.ctx.audio.synth.creak(nl.ctx.audio.master, false);
      const fallChance = Math.max(0, nl.state.drunk - 0.55) * 0.9;
      if (Math.random() < fallChance) { nl.state.drunk = Math.min(1.3, nl.state.drunk + 0.2); nl.ctx.events.emit('night:lose', { bar: bar.id }); return back(`Round ${round}. The rope creaks, you drink, and the floor comes up to meet you like an old friend. Someone puts your coat over you. You'll feel this tomorrow.`); }
      left -= Math.random() < 0.6 ? 1 : 0;
      if (left <= 0) { const pot = 6 + round; inv.add('scrap', pot); nl.ctx.events.emit('night:win', { bar: bar.id, amount: pot }); nl.ctx.events.emit('fame', { kind: 'legend', text: `Somebody outlasted the whole Last Rope table at ${bar.name}. Round ${round}.` }); return back(`Round ${round}. Last one standing. The pot is yours: ${pot} scrap and a standing ovation from the people still able to stand.`); }
      panel(head(`<div class="row"><div class="name">Round ${round}. ${left} others still standing.<small>You feel ${nl.state.drunk > 0.9 ? 'like the room is a boat in a storm' : nl.state.drunk > 0.6 ? 'very, very warm' : 'fine. Fine!'}.</small></div><button class="btn" data-d>The rope creaks — drink</button><button class="btn" data-q>Bow out</button></div>`), (el) => { el.querySelector('[data-d]').addEventListener('click', () => { round++; step(); }); el.querySelector('[data-q]').addEventListener('click', () => back('You bow out with dignity, or a version of it.')); });
    };
    return step();
  }

  if (id === 'bargain_pit' || id === 'arm_wrestle') {
    // a timing bar: press when the marker is in the window. Arm-wrestling needs three in a row.
    const need = id === 'arm_wrestle' ? 3 : 1;
    const start = (stake) => {
      inv.remove(cur, stake);
      let hits = 0, t0 = performance.now(), raf = 0;
      const speed = id === 'arm_wrestle' ? 1.6 + nl.state.drunk : 1.1;
      const w = Math.max(0.08, 0.22 - nl.state.drunk * 0.1);
      const html = head(`<div class="row"><div class="name">${id === 'arm_wrestle' ? `Big Marta's arm is a hydraulic press. Hit the window ${need} times.` : 'The price board spins. Shout when it hits the sweet spot.'}</div></div>
        <div style="position:relative;height:26px;border:1px solid var(--line);margin:10px 0;background:rgba(255,255,255,.05)"><div class="win" style="position:absolute;top:0;bottom:0;background:rgba(240,200,90,.35)"></div><div class="mk" style="position:absolute;top:-4px;bottom:-4px;width:4px;background:#fff"></div></div>
        <div class="row"><div class="name hits">0 / ${need}</div><button class="btn" data-go>${id === 'arm_wrestle' ? 'PUSH' : 'SHOUT'}</button></div>`);
      panel(html, (el) => {
        const win = el.querySelector('.win'), mk = el.querySelector('.mk');
        let wx = 0.3 + Math.random() * 0.4;
        win.style.left = (wx - w / 2) * 100 + '%'; win.style.width = w * 100 + '%';
        const pos = () => (Math.sin((performance.now() - t0) / 1000 * speed * Math.PI) * 0.5 + 0.5);
        const loop = () => { mk.style.left = pos() * 100 + '%'; if (document.body.contains(mk)) raf = requestAnimationFrame(loop); };
        loop();
        el.querySelector('[data-go]').addEventListener('click', () => {
          const p = pos();
          if (Math.abs(p - wx) < w / 2) {
            hits++; el.querySelector('.hits').textContent = `${hits} / ${need}`;
            wx = 0.25 + Math.random() * 0.5; win.style.left = (wx - w / 2) * 100 + '%';
            if (hits >= need) { cancelAnimationFrame(raf); inv.add(cur, stake * 2); nl.ctx.events.emit('night:win', { bar: bar.id, amount: stake }); if (id === 'arm_wrestle') nl.ctx.events.emit('fame', { kind: 'legend', text: 'Someone beat Big Marta at the Hot Rivet. She bought them a Slag and then a second Slag as a threat.' }); back(id === 'arm_wrestle' ? `Marta's knuckles kiss the wood. The room goes silent, then explodes. ${stake * 2} ${cur}, and she wants a rematch.` : `Your price lands. Three traders swear at you at once. You walk out with ${stake * 2} ${cur}.`); }
          } else { cancelAnimationFrame(raf); nl.ctx.events.emit('night:lose', { bar: bar.id, amount: stake }); if (id === 'arm_wrestle') nl.ctx.injury?.hit(2, { source: 'arm', what: 'Big Marta' }); back(id === 'arm_wrestle' ? 'Your arm goes down like a drawbridge. Marta pats your head. It is the worst part.' : 'Too early. Somebody undercuts you and the pit laughs.'); }
        });
      });
    };
    return panel(head(stakeRow()), (el) => bindStake(el, start));
  }

  if (id === 'seed_count') {
    const n = 40 + Math.floor(Math.random() * 60);
    const opts = [n, n + 7 + Math.floor(Math.random() * 10), n - 6 - Math.floor(Math.random() * 10)].sort(() => Math.random() - 0.5);
    return panel(head(`<div class="row"><div class="name">A jar of beans, bright as coins. How many?</div>${opts.map((o) => `<button class="btn" data-g="${o}">${o}</button>`).join('')}</div>`), (el) => el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { if (+b.dataset.g === n) { inv.add('seed_packet', 1, true); back(`${n}. Exactly. Sorrel gives you a cutting wrapped in damp cloth. "Plant it somewhere stubborn."`); } else back(`It was ${n}. Nobody minds. That's the point of this game.`); })));
  }

  if (id === 'confess') {
    const C = [
      ['I left someone behind in the water.', 'Brother Amon nods, and doesn\'t say it wasn\'t your fault. He says: "And you have carried them every day since. That counts for something."'],
      ['I steal. Not much. Enough.', '"Enough is a hard word. Come back when you know what it means to you."'],
      ['I like it, sometimes. The danger.', '"So did the sea, once. Be careful what you share a liking with."'],
      ['I don\'t believe Teo is gone.', 'He is quiet for a long time. "Then don\'t. Belief is the only thing out here nobody can tax."'],
    ];
    return panel(head(`<div class="row"><div class="name">Say one thing, once.</div></div>${C.map(([t], i) => `<div class="row"><button class="btn" data-c="${i}" style="flex:1;text-align:left">${esc(t)}</button></div>`).join('')}`), (el) => el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { const [t, r] = C[+b.dataset.c]; nl.state.habit = Math.max(0, nl.state.habit - 0.05); nl.ctx.story.setFlag('confessed'); (nl.ctx.state.notes ||= []).push({ text: `At the Quiet Cup I said: "${t}"`, day: nl.ctx.time.day }); nl.ctx.events.emit('night:confess', { text: t }); back(r); })));
  }
  return done('…');
}
