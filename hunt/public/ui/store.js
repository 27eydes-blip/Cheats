// HUNT RACERS STORE (test currency only, no real money): DAILY deals, CARS, SKINS, UNDERGLOW, WHEELS,
// FLAMES, HORNS, BOOST TRAILS. A big turning preview of the car you are dressing tries on the item
// you tap before you buy it; the BUY / EQUIP button sits in the preview panel, outside the
// scrolling cards, so nothing ever covers it. Rules and prices: race/garage.js (the server runs the
// same code); nothing here changes speed, handling or weapons.
import { DRIVERS, ALL_DRIVER_IDS } from '../race/physics.js';
import { carName, rarityOf, RARITY as CAR_RARITY } from '../race/looks2.js';
import { UNLOCKS, PERKS, carUnlocked, unlockProgress } from '../race/unlocks.js';
import { Showcase } from '../race/showcase2.js';
import { ITEMS, RARITY, SLOT_NAMES, itemsOf, dailyShop, shopDay, msToShopRefresh, equippedOf, owns } from '../race/garage.js';
import { horn } from '../race/sound.js';
import { driverStats, weaponOf } from '../race/preview.js';
import { SETTINGS } from '../settings.js';
import { sfx } from '../audio.js';
import { icon } from './icons.js';
import { openScreen, closeScreen, rewardBurst } from './fx.js';
import { toastMsg } from './screens.js';
import { lookOf, drawPlatform } from './platform.js';
import * as A from '../account.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STORE_TABS = [['daily', 'DAILY'], ['cars', 'CARS'], ['skin', 'SKINS'], ['glow', 'UNDERGLOW'], ['wheel', 'WHEELS'], ['flame', 'FLAMES'], ['horn', 'HORNS'], ['trail', 'BOOST TRAILS']];
export const fmtCountdown = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const curIcon = (cur) => icon(cur === 'gems' ? 'gem' : 'coin');

// ---- small original vector art for the cards (no canvas per card: cheap to show many)
const carSvg = (neon, body, cls = '') => `<svg class="st-svg ${cls}" viewBox="0 0 64 40" aria-hidden="true"><g fill="${body}" stroke="${neon}" stroke-width="2.4" stroke-linejoin="round"><path d="M4 20 L10 9 L36 7 L54 12 L61 20 L54 28 L36 33 L10 31 Z"/><path d="M24 12 L40 12 L46 20 L40 28 L24 28 L20 20 Z" fill="none"/><path d="M6 6 h8 M6 34 h8 M44 6 h8 M44 34 h8" stroke-width="3.4"/></g><path d="M50 16 L57 20 L50 24" fill="none" stroke="#fff" stroke-width="1.4" opacity=".7"/></svg>`;
function art(it, car) {
  const o = it ? it.opt : null, L = lookOf(car);
  switch (it ? it.kind : 'car') {
    case 'car': return carSvg(lookOf(car).neon, lookOf(car).body);
    case 'skin': return carSvg(o.neon, o.body || L.body, o.pattern ? 'anim' : '');
    case 'glow': return `<span class="st-glow ${o.style}" style="--c:${o.color}"><i></i><i></i></span>`;
    case 'wheel': return `<svg class="st-svg" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#12091e" stroke="#2a2340" stroke-width="5"/><circle cx="20" cy="20" r="12" fill="none" stroke="${o.rim}" stroke-width="2.6"/>${Array.from({ length: o.spokes }, (_, i) => { const a = (i / o.spokes) * Math.PI * 2; return `<line x1="20" y1="20" x2="${(20 + Math.cos(a) * 11).toFixed(1)}" y2="${(20 + Math.sin(a) * 11).toFixed(1)}" stroke="${o.rim}" stroke-width="1.8"/>`; }).join('')}<circle cx="20" cy="20" r="3" fill="${o.rim}"/></svg>`;
    case 'flame': return `<svg class="st-svg" viewBox="0 0 48 32" aria-hidden="true"><path d="M44 10 Q8 16 44 22 Z" fill="${o.outer}"/><path d="M44 13 Q24 16 44 19 Z" fill="${o.core}"/><rect x="40" y="8" width="6" height="16" rx="2" fill="#2a2340"/></svg>`;
    case 'trail': return `<svg class="st-svg" viewBox="0 0 48 32" aria-hidden="true">${o.style === 'sparks' ? [6, 14, 22, 30, 38].map((x, i) => `<circle cx="${x}" cy="${16 + (i % 2 ? 5 : -5)}" r="${1 + i * 0.6}" fill="${o.color}"/>`).join('') : `<path d="M2 ${o.style === 'ribbon' ? 16 : 11} C16 ${o.style === 'ribbon' ? 8 : 6} 30 ${o.style === 'ribbon' ? 24 : 14} 46 16" stroke="${o.color}" stroke-width="${o.style === 'ribbon' ? 7 : 3}" fill="none" stroke-linecap="round"/>${o.style === 'ribbon' ? '' : `<path d="M2 21 C16 16 30 24 46 16" stroke="${o.color}" stroke-width="3" fill="none" stroke-linecap="round"/>`}`}</svg>`;
    case 'horn': return `<svg class="st-svg" viewBox="0 0 40 32" aria-hidden="true"><path d="M5 12h6l9-6v20l-9-6H5z" fill="#ffd23f" stroke="#12091e" stroke-width="2" stroke-linejoin="round"/>${o.notes.filter(([f]) => f > 0).slice(0, 4).map(([f], i) => `<circle cx="${25 + i * 4}" cy="${26 - Math.min(20, f / 60)}" r="1.8" fill="#5ff4ff"/>`).join('')}</svg>`;
  }
  return '';
}

export function openStore(api, onDone, start = {}) {
  const el = document.createElement('div');
  el.className = 'ui-screen store-screen'; el.hidden = true;
  el.innerHTML = `<div class="ui-head"><button class="btn btn-sm alt back" aria-label="Back">${icon('back')}</button><div class="title">STORE</div>
      <div class="st-curs"><div class="cur">${icon('gem')}<b id="stGems">0</b><small>TEST</small></div><div class="cur">${icon('coin')}<b id="stCoins">0</b><small>TEST</small></div></div></div>
    <div class="st-body">
      <section class="st-stage">
        <div class="st-cvwrap"><canvas id="stCv" aria-hidden="true"></canvas><span class="st-try" id="stTry" hidden>TRYING ON</span></div>
        <div class="st-carrow"><button class="st-arrow" id="stPrev" aria-label="Previous car">‹</button><b class="st-carname" id="stCar">ARCWIRE</b><button class="st-arrow" id="stNext" aria-label="Next car">›</button></div>
        <div class="st-act"><div class="st-info"><span class="st-rar" id="stRar"></span><b id="stName"></b></div><div class="st-price" id="stPrice"></div><button class="btn btn-md st-buy" id="stBuy">BUY</button></div>
      </section>
      <section class="st-shop">
        <div class="st-tabs" id="stTabs" role="tablist">${STORE_TABS.map(([k, l]) => `<button class="st-tab" role="tab" data-t="${k}">${l}${k === 'daily' ? ' <i class="st-new"></i>' : ''}</button>`).join('')}</div>
        <div class="st-dhead" id="stDaily"><b>DAILY SHOP</b><span>NEW ITEMS IN <time id="stCount">--:--:--</time> (UTC midnight)</span></div>
        <div class="st-grid" id="stGrid"></div>
      </section>
    </div>
    <div class="st-foot"><span class="st-note">Test currency only, no real money. Skins and parts are looks only: no effect on speed, handling or weapons.</span><span class="st-credit">Made by Gleyde Technologies</span></div>`;
  document.body.appendChild(el);
  // tab, the car being dressed, and the selected card (try-on): {kind, id} (id null = the car's stock part)
  const S = { tab: STORE_TABS.some(([k]) => k === start.tab) ? start.tab : 'daily', car: DRIVERS[start.car] ? start.car : api.getBrawler(), sel: null, day: shopDay(), shownSec: -1 };
  let busy = false;
  const close = async () => { const i = A.ACC.listeners.indexOf(onUser); if (i >= 0) A.ACC.listeners.splice(i, 1); onDone?.(); await closeScreen(el); el.remove(); };
  el.querySelector('.back').onclick = close;
  const progress = () => A.progress();
  const deals = () => dailyShop(S.day);

  // what the card / action bar says about one item for the car being dressed
  function stateOf(kind, id) {
    const p = progress();
    if (kind === 'car') return { owned: carUnlocked(p, id), on: api.getBrawler() === id };
    if (!id) return { owned: true, on: !equippedOf(p, S.car)[kind] };
    return { owned: owns(p, id), on: equippedOf(p, S.car)[kind] === id };
  }
  const dealOf = (id) => (S.tab === 'daily' ? deals().find((d) => d.id === id) : null);
  function strip(kind, id) {
    const st = stateOf(kind, id);
    if (st.on) return `<span class="st-badge on">${kind === 'car' ? 'DRIVING' : 'EQUIPPED'}</span>`;
    if (st.owned) return '<span class="st-badge own">OWNED</span>';
    if (kind === 'car') { // a locked unlockable car: its coin price (rare) or how far along you are
      const pr = unlockProgress(progress(), id);
      return UNLOCKS[id].coins ? `<span class="st-cost">${curIcon('coins')}<b>${UNLOCKS[id].coins}</b></span>` : `<span class="st-lockp" title="${esc(pr.text)}"><i><b style="width:${Math.round(pr.f * 100)}%"></b></i>${Math.round(pr.f * 100)}%</span>`;
    }
    const it = ITEMS[id], d = dealOf(id), pr = d ? d.price : it.price;
    return `<span class="st-cost">${curIcon(pr.cur)}<b>${pr.n}</b>${d ? `<s>${d.was.n}</s>` : ''}</span>`;
  }
  function card(kind, id, car = S.car) {
    const it = id ? ITEMS[id] : null, rar = it ? it.rarity : kind === 'car' ? rarityOf(id) || 'common' : 'common', st = stateOf(kind, id);
    const name = kind === 'car' ? carName(id) : it ? it.name : 'Stock';
    const sel = S.sel && S.sel.kind === kind && S.sel.id === id;
    const extra = kind === 'car' ? `${rarityOf(id) ? `<span class="st-tag">${CAR_RARITY[rarityOf(id)].name}${st.owned ? '' : ' · LOCKED'}</span>` : ''}<span class="st-stats">${driverStats(id).map((r) => `<span>${r.label}</span><i><b style="width:${Math.round(r.f * 100)}%"></b></i>`).join('')}</span>`
      : `<span class="st-tag">${kind === 'skin' && it ? carName(it.car) + ' · ' : ''}${it ? RARITY[rar].name : 'DEFAULT'}${it && it.opt.pattern ? ' · ANIMATED' : ''}</span>`;
    return `<button class="st-card r-${rar} ${sel ? 'sel' : ''} ${st.on ? 'on' : ''}" data-kind="${kind}" data-id="${id || ''}" aria-pressed="${sel}">
      <span class="st-art">${kind === 'car' ? art(null, id) : it ? art(it, car) : `<span class="st-stock">${icon('star')}</span>`}</span>
      <span class="st-nm">${esc(name)}</span>${extra}<span class="st-strip">${strip(kind, id)}</span></button>`;
  }
  function renderGrid() {
    const g = $('stGrid'), t = S.tab;
    let html;
    if (t === 'daily') html = deals().map((d) => card(ITEMS[d.id].kind, d.id, ITEMS[d.id].car || S.car)).join('');
    else if (t === 'cars') html = ALL_DRIVER_IDS.map((d) => card('car', d)).join('');
    else html = [card(t, null), ...itemsOf(t, S.car).map((it) => card(t, it.id))].join('');
    g.innerHTML = html;
    g.dataset.tab = t;
    $('stDaily').hidden = t !== 'daily';
    for (const b of $('stTabs').children) { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
  }
  // the preview panel: the car, the try-on, and the one action for the selected card
  function renderAct() {
    const p = progress(), sel = S.sel, b = $('stBuy');
    $('stGems').textContent = p.gems ?? 0; $('stCoins').textContent = p.coins;
    $('stCar').textContent = carName(S.car);
    $('stTry').hidden = !sel || sel.kind === 'car' || stateOf(sel.kind, sel.id).on;
    let name, rar = '', price = '', label, act = null, dis = false;
    if (!sel) { name = 'Tap an item to try it on'; label = 'BUY'; dis = true; }
    else if (sel.kind === 'car') {
      const on = api.getBrawler() === sel.id, ok = carUnlocked(p, sel.id), U = UNLOCKS[sel.id];
      name = `${carName(sel.id)} · ${weaponOf(sel.id).name}${PERKS[sel.id] ? ' · ' + PERKS[sel.id] : ''}`;
      if (ok) { rar = 'OWNED'; label = on ? 'DRIVING' : 'DRIVE'; dis = on; act = 'drive'; }
      else if (U.coins) { rar = CAR_RARITY[U.rarity].name; label = 'BUY'; act = 'carbuy'; price = `${curIcon('coins')}<b>${U.coins}</b>`; }
      else { const pr = unlockProgress(p, sel.id); rar = CAR_RARITY[U.rarity].name; label = 'LOCKED'; dis = true; price = `<span class="st-lockp wide"><i><b style="width:${Math.round(pr.f * 100)}%"></b></i>${esc(pr.text)}</span>`; }
    } else {
      const it = sel.id ? ITEMS[sel.id] : null, st = stateOf(sel.kind, sel.id);
      name = it ? it.name : `Stock ${SLOT_NAMES[sel.kind].toLowerCase()}`;
      rar = it ? RARITY[it.rarity].name : 'DEFAULT';
      if (st.on) { label = 'EQUIPPED'; dis = true; }
      else if (st.owned) { label = 'EQUIP'; act = 'equip'; }
      else { const d = dealOf(sel.id), pr = d ? d.price : it.price; label = 'BUY'; act = 'buy'; price = `${curIcon(pr.cur)}<b>${pr.n}</b>${d ? `<s>${d.was.n}</s>` : ''}`; }
      if (!price) price = st.owned ? '<span class="st-badge own">OWNED</span>' : '';
    }
    $('stName').textContent = name;
    $('stRar').textContent = rar; $('stRar').className = 'st-rar' + (sel && sel.id && ITEMS[sel.id] ? ' r-' + ITEMS[sel.id].rarity : sel && sel.kind === 'car' && rarityOf(sel.id) ? ' r-' + rarityOf(sel.id) : '');
    $('stPrice').innerHTML = price;
    // (never `disabled`: the button stays a solid, hittable target; a done action just does nothing)
    b.textContent = label; b.setAttribute('aria-disabled', String(dis)); b.classList.toggle('off', dis); b.dataset.act = act || '';
    b.classList.toggle('gold', act === 'buy' || act === 'carbuy'); b.classList.toggle('mint', act === 'equip' || act === 'drive');
  }
  const render = () => { renderGrid(); renderAct(); };

  // the look in the preview: what this car has on, with the selected item swapped in (try-on)
  let lookKey = '', look = null, spinAt = performance.now();
  function previewLook() {
    const e = equippedOf(progress(), S.car), sel = S.sel;
    const ids = sel && sel.kind !== 'car' && SLOT_NAMES[sel.kind] ? { ...e, [sel.kind]: sel.id } : e;
    const k = S.car + JSON.stringify(ids);
    if (k !== lookKey) { lookKey = k; look = lookOf(S.car, ids); }
    return look;
  }
  const setCar = (car) => { S.car = car; lookKey = ''; spinAt = performance.now(); if (S.sel && S.sel.kind === 'skin' && S.sel.id && ITEMS[S.sel.id].car !== car) S.sel = null; render(); };

  $('stTabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; S.tab = b.dataset.t; S.sel = null; lookKey = ''; sfx('click', 0.6); render(); $('stGrid').scrollTop = 0; };
  $('stGrid').onclick = (e) => {
    const c = e.target.closest('.st-card'); if (!c) return;
    const kind = c.dataset.kind, id = c.dataset.id || null;
    S.sel = { kind, id };
    if (kind === 'car') { if (S.car !== id) spinAt = performance.now(); S.car = id; }
    else if (kind === 'skin' && id) S.car = ITEMS[id].car; // a skin is tried on its own car
    if (kind === 'horn') horn(id ? ITEMS[id].opt : null, 1); else sfx('click', 0.5);
    lookKey = '';
    render();
    $('stGrid').querySelector('.st-card.sel')?.scrollIntoView({ block: 'nearest' }); // the whole card, price strip included
  };
  const step = (d) => { const L = ALL_DRIVER_IDS, i = L.indexOf(S.car); setCar(L[(i + d + L.length) % L.length]); sfx('click', 0.5); };
  $('stPrev').onclick = () => step(-1); $('stNext').onclick = () => step(1);
  $('stBuy').onclick = async () => {
    const act = $('stBuy').dataset.act, sel = S.sel;
    if (!act || !sel || busy) return;
    if (act === 'drive') { api.setBrawler(sel.id); if (rarityOf(sel.id)) A.shop({ action: 'carset', car: sel.id }).catch(() => {}); render(); return; }
    busy = true;
    try {
      if (act === 'buy') { await A.shop({ action: 'gbuy', id: sel.id, ...(dealOf(sel.id) ? { daily: true } : {}) }); rewardBurst(); sfx('reward'); }
      else if (act === 'carbuy') { await A.shop({ action: 'carbuy', car: sel.id }); sfx('reward'); } // the NEW CAR UNLOCKED screen follows (ui/carunlock.js)
      else await A.shop({ action: 'gequip', car: S.car, slot: sel.kind, id: sel.id });
    } catch (err) { toastMsg(err.message); if (/refreshed/.test(err.message)) S.day = shopDay(); }
    finally { busy = false; }
    lookKey = '';
    render();
  };
  // the account can change underneath (a race result, another device): keep the numbers fresh
  const onUser = () => { if (el.isConnected) render(); };
  A.onUser(onUser);

  render();
  openScreen(el);
  // the preview turns every frame; the daily countdown text changes once a second
  const cv = $('stCv'), t0 = performance.now(), show = new Showcase();
  const tick = (now) => {
    if (!el.isConnected) return;
    const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) {
      if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
      const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
      const t = (now - t0) / 1000, boost = !!S.sel && (S.sel.kind === 'flame' || S.sel.kind === 'trail'); // try-on of a boost part: show it boosting
      // an unlockable car spins in onto a pad in its rarity glow (steady under Reduce Flashing)
      if (rarityOf(S.car) && !boost) { g.save(); g.translate(r.width / 2, r.height * 0.52); show.draw(g, S.car, previewLook(), (now - spinAt) / 1000, t, { size: Math.min(r.width * 0.5, r.height * 0.75), steady: !!SETTINGS.reduceFlash, low: !!SETTINGS.lowGfx, rarity: rarityOf(S.car) }); g.restore(); }
      else drawPlatform(g, r.width, r.height, S.car, previewLook(), SETTINGS.reduceFlash ? t * 0.5 : t, { boost, steady: SETTINGS.reduceFlash, low: SETTINGS.lowGfx });
    }
    const left = msToShopRefresh(), sec = Math.ceil(left / 1000);
    if (sec !== S.shownSec) {
      S.shownSec = sec; $('stCount').textContent = fmtCountdown(left);
      if (shopDay() !== S.day) { S.day = shopDay(); if (S.tab === 'daily') { S.sel = null; render(); } }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { el, close, state: S };
}
