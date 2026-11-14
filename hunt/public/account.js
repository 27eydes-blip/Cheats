// Client side of accounts: guest bootstrap, sign in/up, trophy road, cloud sync.
import { normalize, totalTrophies, levelInfo, ROAD, roadReward, ROAD_STEP } from './progression.js';
import { CATALOG } from './catalog.js';

const TOKEN_KEY = 'hunt-token';
export const ACC = { token: null, user: null, offline: false, listeners: [] };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(ACC.token ? { authorization: 'Bearer ' + ACC.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: r.status });
  return data;
}
function setSession(data) {
  if (data.token) { ACC.token = data.token; try { localStorage.setItem(TOKEN_KEY, data.token); } catch {} }
  if (data.user) setUser(data.user);
}
export function setUser(user) {
  ACC.user = { ...user, progress: normalize(user.progress) };
  render();
  for (const f of ACC.listeners) f(ACC.user);
}
export const progress = () => ACC.user?.progress || normalize({});
export const onUser = (f) => ACC.listeners.push(f);

export async function boot() {
  try { ACC.token = localStorage.getItem(TOKEN_KEY); } catch {}
  try {
    if (ACC.token) setSession(await api('/me'));
    else setSession(await api('/guest', {}));
  } catch (e) {
    if (e.status === 401) { ACC.token = null; try { setSession(await api('/guest', {})); return; } catch {} }
    ACC.offline = true; render();
  }
}
export async function refresh() { if (ACC.token) try { setSession(await api('/me')); } catch {} }
export async function shop(body) { const d = await api('/shop', body); setSession(d); return d; }
// cloud sync: pick up changes made on another device whenever the game comes back to the front
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

function render() {
  const bar = $('profileBar');
  if (!bar) return;
  if (ACC.offline || !ACC.user) { bar.innerHTML = '<span class="chip">Offline · progress not saved</span>'; return; }
  const p = ACC.user.progress, L = levelInfo(p.xp);
  bar.innerHTML = `<span class="chip lvl" title="${L.into}/${L.need} XP">LV ${L.level}<i style="width:${Math.round((L.into / L.need) * 100)}%"></i></span>
    <span class="chip">🏆 ${totalTrophies(p)}</span><span class="chip">🪙 ${p.coins} <small>test</small></span>
    <button class="chip btn" id="lockerBtn">LOCKER</button><button class="chip btn" id="passBtn">HUNT PASS</button>
    <button class="chip btn" id="roadBtn">TROPHY ROAD${roadClaimable(p) ? ' <b class="dot"></b>' : ''}</button>
    <button class="chip btn" id="accBtn">${ACC.user.guest ? 'GUEST · SAVE PROGRESS' : '👤 ' + esc(ACC.user.username)}</button>`;
  $('roadBtn').onclick = openRoad;
  $('lockerBtn').onclick = () => import('./locker.js').then((m) => m.openLocker());
  $('passBtn').onclick = () => import('./locker.js').then((m) => m.openPass());
  $('accBtn').onclick = openAccount;
}
const roadClaimable = (p) => { const tt = totalTrophies(p); for (let at = ROAD_STEP; at <= tt; at += ROAD_STEP) if (!p.claimed.includes(at)) return true; return false; };

function modal(html) {
  let m = $('modal');
  if (!m) { m = document.createElement('div'); m.id = 'modal'; m.className = 'screen dim'; document.body.appendChild(m); }
  m.hidden = false;
  m.innerHTML = `<div class="panel small">${html}<button class="ghost" id="modalClose">CLOSE</button></div>`;
  $('modalClose').onclick = () => { m.hidden = true; };
  return m;
}
const rewardText = (r) => r.coins ? `🪙 ${r.coins}` : r.title ? `Title: ${CATALOG.titles[r.title] || r.title}` : r.fx ? `Kill effect: ${CATALOG.fx[r.fx] || r.fx}` : r.skin ? `Skin: ${CATALOG.skins[r.skin]?.name || r.skin}` : '';

function openRoad() {
  const p = progress(), tt = totalTrophies(p);
  const max = Math.max(1000, Math.ceil((tt + 1) / ROAD_STEP) * ROAD_STEP + 200);
  const rows = [];
  for (let at = ROAD_STEP; at <= max; at += ROAD_STEP) {
    const r = roadReward(at), done = p.claimed.includes(at), ok = tt >= at;
    rows.push(`<li class="${done ? 'done' : ok ? 'ready' : ''}"><b>🏆 ${at}</b><span>${rewardText(r)}</span>${done ? '✓' : ok ? `<button class="small big" data-at="${at}">CLAIM</button>` : '🔒'}</li>`);
  }
  modal(`<h2>TROPHY ROAD</h2><p class="desc">You have 🏆 ${tt}. A free reward every ${ROAD_STEP} trophies.</p><ul class="road">${rows.join('')}</ul>`);
  for (const b of document.querySelectorAll('.road button')) b.onclick = async () => { try { setSession(await api('/claim', { at: +b.dataset.at })); openRoad(); } catch (e) { alert(e.message); } };
}

function openAccount() {
  const u = ACC.user;
  if (!u) return;
  if (!u.guest) {
    modal(`<h2>ACCOUNT</h2><p>Signed in as <b>${esc(u.username)}</b>. Your progress syncs to any device you sign in on.</p>
      <button class="ghost" id="logout">LOG OUT</button>`);
    $('logout').onclick = async () => { try { await api('/logout', {}); } catch {} ACC.token = null; try { localStorage.removeItem(TOKEN_KEY); } catch {} await boot(); $('modal').hidden = true; };
    return;
  }
  modal(`<h2>SAVE YOUR PROGRESS</h2><p class="desc">Upgrade this guest to an account — you keep everything — and sign in on your iPad too.</p>
    <form id="regForm" class="accForm"><input name="username" placeholder="Username" autocomplete="username" maxlength="16"><input name="password" type="password" placeholder="Password (6+)" autocomplete="new-password"><button class="big">CREATE ACCOUNT</button></form>
    <p class="desc">Already have one?</p>
    <form id="loginForm" class="accForm"><input name="username" placeholder="Username" autocomplete="username"><input name="password" type="password" placeholder="Password" autocomplete="current-password"><button class="ghost">LOG IN</button></form>
    <p class="err" id="accErr"></p>`);
  const go = (path) => async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { setSession(await api(path, { username: f.get('username'), password: f.get('password') })); $('modal').hidden = true; }
    catch (err) { $('accErr').textContent = err.message; }
  };
  $('regForm').onsubmit = go('/register');
  $('loginForm').onsubmit = go('/login');
}
