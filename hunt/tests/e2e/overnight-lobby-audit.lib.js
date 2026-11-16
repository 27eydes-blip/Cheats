// Phone layout audit shared by overnight-lobby-audit.spec.js: the list of menu screens and the
// in-page checks (tap-target size, text size, primary actions in view, page scroll, credit clear).

// Every out-of-match screen: how to open it from a fresh lobby and which controls must be in view.
export const SCREENS = [
  { name: 'lobby play', open: async () => {}, primary: ['#playBtn', '#rail_road', '#passBtn', '#npPower', '#rail_settings', '#tab_profile', '#rail_friends'] },
  { name: 'lobby profile tab', open: async (p) => { await p.click('#tab_profile'); await p.waitForSelector('.pg-profile .stile'); }, primary: ['#tab_play'] },
  { name: 'lobby locker tab', open: async (p) => { await p.click('#rail_locker'); await p.waitForSelector('.lsec'); }, primary: ['#tab_play'] },
  { name: 'brawlers', open: async (p) => { await p.click('.nameplate #stage'); await p.waitForSelector('.bcard'); }, primary: ['.ui-screen .back'] },
  { name: 'brawler detail', open: async (p) => { await p.click('.nameplate #stage'); await p.click('.bcard[data-b="rook"]'); await p.waitForSelector('.detail [data-sel]'); }, primary: ['.detail [data-sel]', '.detail [data-x]:not([data-sel])', '.detail [data-power]'] },
  { name: 'power', open: async (p) => { await p.click('#npPower'); await p.waitForSelector('#pwBody .pwpick'); }, primary: ['.ui-pop [data-close]', '#pwUp'] },
  { name: 'locker skins', open: async (p) => { await p.click('#rail_locker'); await p.click('.lsec[data-open="skins"] .ribbonhead'); await p.waitForSelector('#lkItems .ped'); }, primary: ['.ui-screen .back'] },
  { name: 'locker kill effects', open: async (p) => { await p.click('#rail_locker'); await p.click('.lsec[data-open="fx"] .ribbonhead'); await p.waitForSelector('#lkItems .ped'); }, primary: ['.ui-screen .back', '#lkFx'] },
  { name: 'locker titles', open: async (p) => { await p.click('#rail_locker'); await p.click('.lsec[data-open="titles"] .ribbonhead'); await p.waitForSelector('#lkItems .ped'); }, primary: ['.ui-screen .back'] },
  { name: 'armory', open: async (p) => { await p.click('#rail_armory'); await p.waitForSelector('#arInfo .ar-actions'); }, primary: ['.ui-screen .back', '#arInfo .ar-actions .btn'] },
  { name: 'gp pass', open: async (p) => { await p.click('#rail_pass'); await p.waitForSelector('.track .tier'); }, primary: ['.ui-screen .back', '#premBtn'] },
  { name: 'trophy road', open: async (p) => { await p.click('#rail_road'); await p.waitForSelector('.road-wrap .node'); }, primary: ['.ui-screen .back'] },
  { name: 'missions', open: async (p) => { await p.click('#tbMissions'); await p.waitForSelector('.mission'); }, primary: ['.ui-pop [data-close]'] },
  { name: 'friends', open: async (p) => { await p.click('#rail_friends'); await p.waitForSelector('#roomPlay'); }, primary: ['#roomPlay', '.ui-pop [data-close]'] },
  { name: 'account', open: async (p) => { await p.click('#tab_profile'); await p.click('#pgAccount'); await p.waitForSelector('#regF'); }, primary: ['.ui-screen .back'] },
  { name: 'settings', open: async (p) => { await p.click('#rail_settings'); await p.waitForSelector('#volMusic'); }, primary: ['.ui-screen .back'] },
  { name: 'earn info', open: async (p) => { await p.click('#coinPlus'); await p.waitForSelector('.ui-pop [data-close]'); }, primary: ['.ui-pop [data-close]'] },
  // not wired to a lobby button today, but still shipped: opened straight from its module
  { name: 'mode picker', open: async (p) => { await p.evaluate(() => import('/ui/screens.js').then((m) => m.openModePicker('quick', () => {}))); await p.waitForSelector('.mcard'); }, primary: ['.ui-screen .back', '.mcard[data-m="free"]'] },
  { name: 'match intro', open: async (p) => { await p.evaluate(() => import('/ui/flow.js').then((m) => m.showIntro({ world: 'meadow', modeName: 'BOUNTY RUSH', brawler: 'volt', skin: null }))); await p.waitForSelector('.intro .imode'); }, primary: [] },
  // bots off: the waiting screen stays up instead of starting a match
  { name: 'matchmaking', open: async (p) => { await p.click('.fillbots'); await p.click('#playBtn'); await p.waitForSelector('.mm:not([hidden]) #mmCancel'); }, primary: ['#mmCancel'] },
  // a finished 10-player match with a level-up, pushed in the way the server would send it
  { name: 'results', open: async (p) => {
    await p.goto('/?world=meadow&mode=bounty');
    await p.waitForFunction(() => window.__hunt && window.__hunt.me, null, { timeout: 30_000 });
    await p.evaluate(() => {
      const G = window.__hunt;
      const rows = Array.from({ length: 10 }, (_, i) => (i === 1 ? ['Me', G.brawler, 2, 3, 0, G.myId, 6, 6] : [`Hunter${i}`, 'volt', i + 1, 9 - i, 1, 100 + i, 12 - i, 12 - i]));
      window.__huntMsg({ t: 'end', mode: 'bounty', rank: 2, kills: 3, bounty: 6, winner: 'Hunter0', results: rows });
      window.__huntMsg({ t: 'progress', delta: 8, xp: 160, coins: 40, levels: [{ level: 2, coins: 50, weapons: [], emotes: [] }], progress: { xp: 160, trophies: {}, owned: [], equipped: {} } });
    });
    await p.waitForSelector('.res:not([hidden]) #rsAgain');
    await p.waitForTimeout(1600); // unlock cards flip in
  }, primary: ['#rsAgain', '#rsLobby'] },
];

// HUNT RACERS (the main lobby at /): every screen a racer can reach before and around a race.
const roomCode = () => 'AU' + Math.random().toString(36).slice(2, 8).toUpperCase();
export const RACE_SCREENS = [
  // the space lobby: LAUNCH, the dock (Profile, Garage, Race, Pass, Crew), the mode strip and carousel arrow, track, bots,
  // your car (Garage), missions orbit, trophies, currencies, STORE and settings
  { name: 'racing play', open: async () => {}, primary: ['#playBtn', '#rail_road', '#rail_pass', '#rail_garage', '#tab_play', '#trackBtn', '#fillBots', '.modebtn[data-m="grand"]', '.modebtn[data-m="trial"]', '.sp-car-arrow.next', '.nameplate #stage', '#tbMissions', '#coinPlus', '#rail_settings', '#tab_profile', '#rail_friends', '#rail_store'] },
  { name: 'racing play, time trial picked', open: async (p) => { await p.click('.modebtn[data-m="trial"]'); }, primary: ['#playBtn', '#trackBtn', '.modebtn[data-m="trial"]'] },
  { name: 'racing profile tab', open: async (p) => { await p.click('#tab_profile'); await p.waitForSelector('.pg-profile .race-times'); }, primary: ['#tab_play'] },
  // the STORE (it replaced the Locker in the racing lobby): every tab, a card tried on, BUY / EQUIP always in reach
  ...['daily', 'cars', 'skin', 'glow', 'wheel', 'flame', 'horn', 'trail'].map((t) => ({ name: `store ${t}`, open: async (p) => {
    await p.click('#rail_store'); await p.waitForSelector('.st-card');
    await p.click(`.st-tab[data-t="${t}"]`); await p.waitForSelector(`.st-grid[data-tab="${t}"] .st-card`);
    await p.click('.st-grid .st-card >> nth=1'); await p.waitForSelector('.st-card.sel');
  }, primary: ['.st-buy', '.ui-screen .back', '#stPrev', '#stNext', '.st-grid .st-card.sel'] })),
  // the last card of the list scrolled into view: still nothing over the buy button
  { name: 'store, scrolled to the end', open: async (p) => { await p.click('#rail_store'); await p.click('.st-tab[data-t="glow"]'); await p.locator('.st-grid .st-card').last().click(); }, primary: ['.st-buy', '.st-grid .st-card.sel', '.ui-screen .back'] },
  { name: 'drivers', open: async (p) => { await p.click('.nameplate #stage'); await p.waitForSelector('.dcard'); }, primary: ['.ui-screen .back', '.dcard[data-b="volt"]', '.dcard[data-b="flicker"]'] },
  { name: 'driver detail', open: async (p) => { await p.click('.nameplate #stage'); await p.click('.dcard[data-b="rook"]'); await p.waitForSelector('.detail [data-sel]'); }, primary: ['.detail [data-sel]', '.detail [data-x]:not([data-sel])'] },
  { name: 'track picker', open: async (p) => { await p.click('#trackBtn'); await p.waitForSelector('.tcard'); }, primary: ['.ui-screen .back', '.tcard[data-k="any"]', '.tcard[data-k="desert"]'] },
  { name: 'arena picker', open: async (p) => { await p.click('.modebtn[data-m="battle"]'); await p.click('#trackBtn'); await p.waitForSelector('.tcard'); }, primary: ['.ui-screen .back', '.tcard[data-k="any"]'] },
  { name: 'race friends', open: async (p) => { await p.click('#rail_friends'); await p.waitForSelector('#roomPlay'); }, primary: ['#roomPlay', '#shareCode', '#rfBots', '#newCode', '.ui-pop [data-close]'] },
  { name: 'gp pass', open: async (p) => { await p.click('#rail_pass'); await p.waitForSelector('.track .tier'); }, primary: ['.ui-screen .back', '#premBtn'] },
  { name: 'trophy road', open: async (p) => { await p.click('#rail_road'); await p.waitForSelector('.road-wrap .node'); }, primary: ['.ui-screen .back'] },
  { name: 'missions', open: async (p) => { await p.click('#tbMissions'); await p.waitForSelector('.mission'); }, primary: ['.ui-pop [data-close]'] },
  { name: 'account', open: async (p) => { await p.click('#tab_profile'); await p.click('#pgAccount'); await p.waitForSelector('#regF'); }, primary: ['.ui-screen .back'] },
  { name: 'settings', open: async (p) => { await p.click('#rail_settings'); await p.waitForSelector('#volMusic'); }, primary: ['.ui-screen .back'] },
  { name: 'earn info', open: async (p) => { await p.click('#coinPlus'); await p.waitForSelector('.ui-pop [data-close]'); }, primary: ['.ui-pop [data-close]'] },
  // bots off: the public race waits for a second racer, so the waiting card stays up
  { name: 'race waiting (bots off)', open: async (p) => { await p.click('.fillbots'); await p.click('#playBtn'); await p.waitForSelector('.rc-wait:not([hidden]) .rc-cancel'); await p.waitForFunction(() => window.__race && window.__race.phase === 'lobby'); }, primary: ['.rc-cancel'] },
  // a friend room you host: room code + COPY, FILL WITH BOTS, START, CANCEL
  { name: 'race room (host)', open: async (p) => { if (await p.getAttribute('#fillBots', 'aria-checked') === 'false') await p.click('#fillBots'); await p.click('#rail_friends'); await p.fill('#room', roomCode()); await p.click('#roomPlay'); await p.waitForSelector('.rc-room:not([hidden]) .rc-start'); await p.waitForFunction(() => window.__race && window.__race.rc.lobby); }, primary: ['.rc-start', '.rc-copy', '.rc-bots', '.rc-cancel'] },
  // the finish screen: a Time Trial with its end message pushed in the way the server sends it
  { name: 'race results', open: async (p) => {
    await p.click('.modebtn[data-m="trial"]'); await p.click('#playBtn');
    await p.waitForFunction(() => window.__race && window.__race.phase === 'race', null, { timeout: 30_000 });
    await p.evaluate(() => {
      const rc = window.__race.rc;
      rc.onMsg({ t: 'end', mode: 'trial', track: rc.trackKey, rank: 1, you: rc.id, n: 1, time: 95.4, bestLap: 30.1, mc: 0, k: 0, results: [[rc.id, 'Racer', 'volt', 1, 95.4, 0, 0, 0, 30.1, 1, 0]] });
      rc.onMsg({ t: 'progress', delta: 0, xp: 0, coins: 0, levels: [], progress: null, best: 95.4, improved: true });
    });
    await p.waitForFunction(() => window.__race.finishShown(), null, { timeout: 30_000 }); // (1.6 s after the end, on the next frame: slow machines draw few)
    await p.waitForTimeout(400);
  }, primary: ['.rc-again', '.rc-lobby'] },
];

// Runs inside the page. Looks only at the top-most layer (popup > detail > screen > lobby), the
// way a player does, and returns a list of problems (empty = clean).
export function auditPage(primary) {
  const MIN_TAP = 44, MIN_TEXT = 11, EPS = 0.6;
  const out = [];
  const vis = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const shown = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { if (e.hidden || !vis(e)) return false; } return true; };
  const layers = ['.ui-pop', '.detail', '.intro', '.res', '.mm', '.ui-screen', '#lobby', '.rc-root'];
  let root = null, rootZ = -1;
  for (const sel of layers) for (const el of document.querySelectorAll(sel)) {
    if (!shown(el) || el.classList.contains('leave')) continue;
    const z = +getComputedStyle(el).zIndex || 0;
    if (z > rootZ) { root = el; rootZ = z; }
  }
  if (!root) return ['no visible screen'];
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
  const fmt = (r) => `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}@${Math.round(r.left)},${Math.round(r.top)}`;
  // the part of an element a player can actually see: clipped by scrolling ancestors and the screen
  const clip = (el) => {
    const r = el.getBoundingClientRect();
    let l = Math.max(0, r.left), t = Math.max(0, r.top), rt = Math.min(innerWidth, r.right), b = Math.min(innerHeight, r.bottom);
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const c = e.getBoundingClientRect(); l = Math.max(l, c.left); t = Math.max(t, c.top); rt = Math.min(rt, c.right); b = Math.min(b, c.bottom); }
    }
    return { full: r, w: rt - l, h: b - t, left: l, top: t, right: rt, bottom: b, whole: rt - l >= r.width - 1 && b - t >= r.height - 1 };
  };
  const hits = (el, x, y) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const h = document.elementFromPoint(x, y);
    if (!h) return false;
    if (h === el || el.contains(h)) return true;
    const lab = el.closest('label');
    return !!lab && (h === lab || lab.contains(h)); // a checkbox is hit through its label
  };
  // how far the real hit area reaches from the centre (covers padded ::after hit areas)
  const reach = (el, r, dx, dy) => {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let n = 0;
    for (let d = 1; d <= 30; d++) { if (hits(el, cx + dx * d, cy + dy * d)) n = d; else break; }
    return n;
  };

  // ---- tap targets
  const TAPS = 'button, a[href], input, select, textarea, summary, [role="button"], .tap, .fillbots, label.opt, .sk, .ped, .bcard, .mcard';
  const taps = [...root.querySelectorAll(TAPS)].filter((el) => shown(el) && !el.disabled && getComputedStyle(el).pointerEvents !== 'none');
  for (const el of taps) {
    const c = clip(el), r = c.full;
    if (r.width < 1 || r.height < 1 || c.w < 1 || c.h < 1) continue;
    if (!c.whole) continue; // half-scrolled items are checked once scrolled into view
    if (el.matches('input[type="checkbox"]') && el.closest('label')) continue; // the label is the target
    let w = r.width, h = r.height;
    if (w < MIN_TAP - EPS) w = Math.max(w, reach(el, r, -1, 0) + reach(el, r, 1, 0) + 1);
    if (h < MIN_TAP - EPS) h = Math.max(h, reach(el, r, 0, -1) + reach(el, r, 0, 1) + 1);
    if (w < MIN_TAP - EPS || h < MIN_TAP - EPS) out.push(`tap target ${name(el)} is ${fmt(r)} (hit area ${Math.round(w)}x${Math.round(h)})`);
  }

  // ---- text size
  const seen = new Set();
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const textRects = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || !shown(el) || el.closest('script, style')) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const c = clip(el);
    if (c.w < 1 || c.h < 1) continue;
    let px = parseFloat(getComputedStyle(el).fontSize);
    if (el instanceof SVGElement && el.getScreenCTM) px *= Math.abs(el.getScreenCTM().d); // SVG text scales with its viewBox
    textRects.push({ el, r: { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) } });
    if (px < MIN_TEXT - 0.05 && !seen.has(el)) { seen.add(el); out.push(`text "${n.nodeValue.trim().slice(0, 24)}" in ${name(el)} is ${Math.round(px * 10) / 10}px`); }
  }

  // ---- primary actions fully in view and on top
  for (const sel of primary || []) {
    const list = [...document.querySelectorAll(sel)].filter(shown);
    if (!list.length) { out.push(`primary action ${sel} is missing or hidden`); continue; }
    for (const el of list) {
      const c = clip(el), r = c.full;
      if (!c.whole || r.left < -EPS || r.top < -EPS || r.right > innerWidth + EPS || r.bottom > innerHeight + EPS) out.push(`primary action ${sel} is not fully in view (${fmt(r)}, screen ${innerWidth}x${innerHeight})`);
      else if (!hits(el, r.left + r.width / 2, r.top + r.height / 2)) out.push(`primary action ${sel} is covered by ${name(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))}`);
    }
  }

  // ---- no sideways page scroll
  const se = document.scrollingElement;
  if (se.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways (${se.scrollWidth} > ${innerWidth})`);
  if (root.scrollWidth > root.clientWidth + 1) out.push(`${name(root)} scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`);

  // ---- the credit stays readable: on screen, nothing drawn over it
  // (the lobby's credit line, or the race layer's: it stays on top of every race screen)
  const credit = root.id === 'lobby' ? root.querySelector('#credit') : root.classList.contains('rc-root') ? root.querySelector('.rc-credit') : root.querySelector('.st-credit');
  if (credit || root.id === 'lobby') {
    if (!credit || !shown(credit)) out.push('credit line is hidden');
    else {
      const k = credit.getBoundingClientRect();
      if (k.left < 0 || k.top < 0 || k.right > innerWidth + EPS || k.bottom > innerHeight + EPS) out.push(`credit line is off screen (${fmt(k)})`);
      const over = (r) => r.left < k.right - 1 && r.right > k.left + 1 && r.top < k.bottom - 1 && r.bottom > k.top + 1;
      for (const el of taps) { const c = clip(el); if (c.w > 0 && c.h > 0 && over(c)) out.push(`${name(el)} overlaps the credit line`); }
      for (const { el, r } of textRects) if (el !== credit && over(r)) out.push(`text in ${name(el)} overlaps the credit line`);
      for (const [x, y] of [[k.left + 2, k.top + k.height / 2], [k.left + k.width / 2, k.top + k.height / 2], [k.right - 2, k.top + k.height / 2]]) {
        credit.style.pointerEvents = "auto";
        // anything painted above the credit at these points (other than its own containers) hides it
        const above = document.elementsFromPoint(x, y); const i = above.indexOf(credit);
        if (i < 0) { out.push('credit line is covered'); break; }
        for (const e of above.slice(0, i)) { const s = getComputedStyle(e); if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none') { out.push(`${name(e)} is drawn over the credit line`); break; } }
        credit.style.pointerEvents = "";
      }
    }
  }
  return [...new Set(out)];
}
