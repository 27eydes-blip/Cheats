// Locker (skins / kill effects / titles) and Hunt Pass screens. Test currency only.
import { ACC, progress, shop } from './account.js';
import { SKINS, KILL_FX, TITLES, TITLE_PRICE, PASS, PASS_TIERS, PASS_XP_PER_TIER, PREMIUM_PRICE, CURRENCY, passTier, itemId } from './catalog.js';
import { BRAWLERS, BRAWLER_IDS } from './shared.js';
import { drawBrawler } from './render.js';

const $ = (id) => document.getElementById(id);
function modal(html) {
  let m = $('modal');
  if (!m) { m = document.createElement('div'); m.id = 'modal'; m.className = 'screen dim'; document.body.appendChild(m); }
  m.hidden = false;
  m.innerHTML = `<div class="panel wide">${html}<p class="testnote">${CURRENCY} — test currency only, no real money.</p><button class="ghost" id="modalClose">CLOSE</button></div>`;
  $('modalClose').onclick = () => { m.hidden = true; };
}
const guard = async (fn) => { try { await fn(); } catch (e) { alert(e.message); } };
const label = (r) => r.coins ? `🪙 ${r.coins}` : r.skin ? `🎨 ${SKINS[r.skin].name}` : r.fx ? `✨ ${KILL_FX[r.fx].name}` : `🏷 ${TITLES[r.title]}`;

export function openLocker(tab = 'skins') {
  if (!ACC.user) return alert('Offline — the locker needs a connection.');
  const p = progress();
  let body = '';
  if (tab === 'skins') {
    body = BRAWLER_IDS.map((b) => {
      const opts = [[null, 'Classic'], ...Object.entries(SKINS).filter(([, s]) => s.brawler === b).map(([id, s]) => [id, s.name])];
      return `<div class="lrow"><b>${BRAWLERS[b].name}</b>${opts.map(([id, name]) => {
        const owned = !id || p.owned.includes(id), on = (p.equipped['skin:' + b] || null) === id;
        return `<div class="litem ${on ? 'on' : ''}"><canvas data-b="${b}" data-skin="${id || ''}"></canvas><span>${name}</span>${on ? '<i>EQUIPPED</i>' : owned ? `<button data-eq="skin:${b}" data-id="${id || ''}">EQUIP</button>` : `<button data-buy="${id}">🪙 ${SKINS[id].price}</button>`}</div>`;
      }).join('')}</div>`;
    }).join('');
  } else if (tab === 'fx') {
    body = `<div class="lrow">${[[null, { name: 'None' }], ...Object.entries(KILL_FX)].map(([id, f]) => {
      const owned = !id || p.owned.includes(id), on = (p.equipped.fx || null) === id;
      return `<div class="litem ${on ? 'on' : ''}"><span>${f.name}</span>${on ? '<i>EQUIPPED</i>' : owned ? `<button data-eq="fx" data-id="${id || ''}">EQUIP</button>` : `<button data-buy="${id}">🪙 ${f.price}</button>`}</div>`;
    }).join('')}</div>`;
  } else {
    body = `<div class="lrow">${[[null, 'None'], ...Object.entries(TITLES)].map(([id, name]) => {
      const owned = !id || p.owned.includes(id), on = (p.equipped.title || null) === id;
      return `<div class="litem ${on ? 'on' : ''}"><span>${name}</span>${on ? '<i>EQUIPPED</i>' : owned ? `<button data-eq="title" data-id="${id || ''}">EQUIP</button>` : `<button data-buy="${id}">🪙 ${TITLE_PRICE}</button>`}</div>`;
    }).join('')}</div>`;
  }
  modal(`<h2>LOCKER <small>🪙 ${p.coins}</small></h2><div class="tabs">${['skins', 'fx', 'titles'].map((t) => `<button class="${t === tab ? 'sel' : ''}" data-tab="${t}">${{ skins: 'SKINS', fx: 'KILL EFFECTS', titles: 'TITLES' }[t]}</button>`).join('')}</div>
    <p class="desc">Cosmetic only — skins never change hitboxes or stats.</p><div class="lbody">${body}</div>`);
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => openLocker(b.dataset.tab);
  for (const b of document.querySelectorAll('[data-eq]')) b.onclick = () => guard(async () => { await shop({ action: 'equip', slot: b.dataset.eq, id: b.dataset.id || null }); openLocker(tab); });
  for (const b of document.querySelectorAll('[data-buy]')) b.onclick = () => guard(async () => { await shop({ action: 'buy', id: b.dataset.buy }); openLocker(tab); });
  for (const c of document.querySelectorAll('canvas[data-b]')) {
    const ctx = c.getContext('2d'); c.width = 120; c.height = 110;
    ctx.scale(1.4, 1.4); drawBrawler(ctx, c.dataset.b, 43, 44, 0.4, 1, { skin: c.dataset.skin || null });
  }
}

export function openPass() {
  if (!ACC.user) return alert('Offline — the Hunt Pass needs a connection.');
  const p = progress(), tier = passTier(p.pass.xp), into = (p.pass.xp || 0) % PASS_XP_PER_TIER;
  const cell = (row, track) => {
    const key = `${track}:${row.tier}`, got = p.pass.claimed.includes(key);
    const locked = row.tier > tier || (track === 'premium' && !p.pass.premium);
    return `<div class="pcell ${track} ${got ? 'got' : ''} ${locked ? 'locked' : ''}">${label(row[track])}${got ? '<i>✓</i>' : locked ? '<i>🔒</i>' : `<button data-claim="${row.tier}" data-track="${track}">CLAIM</button>`}</div>`;
  };
  modal(`<h2>HUNT PASS</h2>
    <p class="desc">Tier <b>${tier}</b> / ${PASS_TIERS} ${tier < PASS_TIERS ? `· ${into}/${PASS_XP_PER_TIER} XP to next` : '· complete!'} — earn XP by playing matches.</p>
    ${p.pass.premium ? '<p class="prem on">PREMIUM UNLOCKED</p>' : `<button class="big" id="buyPrem">UNLOCK PREMIUM · 🪙 ${PREMIUM_PRICE} (test)</button>`}
    <div class="pass"><div class="ptrack"><b>FREE</b><b>PREMIUM</b></div>${PASS.map((row) => `<div class="pcol"><span class="ptier ${row.tier <= tier ? 'reached' : ''}">${row.tier}</span>${cell(row, 'free')}${cell(row, 'premium')}</div>`).join('')}</div>`);
  const pb = $('buyPrem');
  if (pb) pb.onclick = () => guard(async () => { await shop({ action: 'premium' }); openPass(); });
  for (const b of document.querySelectorAll('[data-claim]')) b.onclick = () => guard(async () => { await shop({ action: 'passClaim', tier: +b.dataset.claim, track: b.dataset.track }); openPass(); });
  const reached = document.querySelectorAll('.pcol')[Math.max(0, tier - 2)];
  if (reached) reached.scrollIntoView({ inline: 'start', block: 'nearest' });
}
