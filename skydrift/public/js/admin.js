import { parseAnswerList, buildIndex, matchAnswer, normalize } from '../shared/match.js';
import { blendedShare, pointsForShare, tierFor, PROMPTS_PER_DAY } from '../shared/score.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let token = localStorage.getItem('skydrift.adminToken') || '';
let current = null; // { date, prompts, stats, source }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

function showLogin(err = '') {
  $('login').hidden = false;
  $('main').hidden = true;
  $('login-err').textContent = err;
}

$('login').onsubmit = async (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  try {
    await loadDays();
    localStorage.setItem('skydrift.adminToken', token);
  } catch (err) {
    showLogin(err.status === 401 ? 'That token didn’t work.' : err.message);
  }
};
$('logout').onclick = () => { localStorage.removeItem('skydrift.adminToken'); token = ''; showLogin(); };

async function loadDays(select) {
  const { today, days } = await api('/api/admin/days');
  $('login').hidden = true;
  $('main').hidden = false;
  $('days').innerHTML = days.map((d) => `<button class="day ${d.date === today ? 'today' : ''}" data-date="${d.date}">
    <span>${d.date} <small style="color:#888">#${d.dayNumber}</small></span><span class="tag ${d.source}">${d.source}</span></button>`).join('');
  $('days').onclick = (e) => { const b = e.target.closest('[data-date]'); if (b) openDay(b.dataset.date); };
  openDay(select || current?.date || today);
}

async function openDay(date) {
  $('ed-msg').textContent = 'Loading…';
  $('ed-msg').className = 'msg';
  const data = await api(`/api/admin/day?date=${date}`);
  current = data;
  document.querySelectorAll('.day').forEach((b) => b.classList.toggle('active', b.dataset.date === date));
  $('ed-title').textContent = `${date} · Day #${data.dayNumber}`;
  const src = data.source.startsWith('fallback') ? 'empty' : data.source;
  $('ed-source').className = `tag ${src}`;
  $('ed-source').textContent = data.source.startsWith('fallback')
    ? `nothing saved: players get ${data.source.split(':')[1]}'s prompts` : data.source;
  $('ed-msg').textContent = '';
  renderPrompts();
}

function renderPrompts() {
  const wrap = $('prompts');
  wrap.innerHTML = '';
  for (let i = 0; i < PROMPTS_PER_DAY; i++) {
    const p = current.prompts[i] || { prompt: '', answers: '' };
    const st = current.stats?.[i] || { players: 0, counts: {}, misses: [] };
    const el = document.createElement('div');
    el.className = 'prompt';
    el.innerHTML = `
      <div class="prompt-head"><b>${i + 1}</b><input class="q" value="${esc(p.prompt)}" placeholder="Name something…" /></div>
      <div class="cols">
        <textarea class="a" spellcheck="false" wrap="off">${esc(String(p.answers).trim())}</textarea>
        <div class="side">
          <div class="test"><input class="t" placeholder="Test an answer…" /><span class="result"></span></div>
          <div class="summary msg"></div>
          <div class="scroll"><table><thead><tr><th>Answer</th><th class="n">Est%</th><th class="n">Real</th><th class="n">Pts</th></tr></thead><tbody></tbody></table></div>
          <div><b>Misses</b> <span class="msg">(typed but not recognised)</span>
            <div class="scroll misses">${st.misses.length ? '' : '<span class="msg">None yet.</span>'}</div></div>
        </div>
      </div>`;
    const q = el.querySelector('.q'), a = el.querySelector('.a'), t = el.querySelector('.t');
    const refresh = () => {
      const list = parseAnswerList(a.value);
      const estTotal = list.reduce((s, x) => s + x.est, 0);
      const rows = list.map((x) => {
        const count = st.counts[normalize(x.answer)] || 0;
        const pts = pointsForShare(blendedShare({ est: x.est, estTotal, count, total: st.players }));
        return { x, count, pts };
      }).sort((m, n) => n.pts - m.pts);
      el.querySelector('tbody').innerHTML = rows.map((r) => `<tr><td>${esc(r.x.answer)}</td><td class="n">${r.x.est}</td><td class="n">${r.count}</td>
        <td class="n" style="color:${tierFor(r.pts).id === 'legendary' ? '#b07d22' : 'inherit'}">${r.pts}</td></tr>`).join('');
      el.querySelector('.summary').textContent = `${list.length} answers · estimates sum to ${Math.round(estTotal)}% · ${st.players} real players`;
      el._index = buildIndex(list);
      el._list = list;
      test();
    };
    const test = () => {
      const r = el.querySelector('.result');
      if (!t.value.trim()) { r.textContent = ''; return; }
      const m = matchAnswer(t.value, el._index);
      r.innerHTML = m ? `✅ <b>${esc(el._list[m.index].answer)}</b> <span class="msg">(${m.how})</span>` : '❌ no match';
    };
    a.addEventListener('input', refresh);
    t.addEventListener('input', test);
    q.addEventListener('input', () => { current.prompts[i] = { ...(current.prompts[i] || {}), prompt: q.value }; });
    a.addEventListener('input', () => { current.prompts[i] = { ...(current.prompts[i] || {}), answers: a.value }; });
    const misses = el.querySelector('.misses');
    for (const m of st.misses) {
      const row = document.createElement('div');
      row.className = 'miss';
      row.innerHTML = `<span>${esc(m.text)} <span class="msg">×${m.count}</span></span><button>Add</button>`;
      row.querySelector('button').onclick = () => {
        a.value = a.value.replace(/\s*$/, '') + `\n${m.text} |  | 0.5`;
        a.dispatchEvent(new Event('input'));
        row.remove();
      };
      misses.appendChild(row);
    }
    wrap.appendChild(el);
    refresh();
  }
}

function collect() {
  return [...document.querySelectorAll('.prompt')].map((el) => ({
    prompt: el.querySelector('.q').value.trim(),
    answers: el.querySelector('.a').value,
  }));
}

$('btn-save').onclick = async () => {
  const msg = $('ed-msg');
  try {
    await api('/api/admin/day', { method: 'PUT', body: JSON.stringify({ date: current.date, prompts: collect() }) });
    msg.className = 'msg ok';
    msg.textContent = 'Saved ✓';
    await loadDays(current.date);
    msg.className = 'msg ok';
    msg.textContent = 'Saved ✓';
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
};

$('btn-revert').onclick = async () => {
  if (!confirm(`Remove the saved version of ${current.date}? Players will get the seed or fallback prompts.`)) return;
  await api(`/api/admin/day?date=${current.date}`, { method: 'DELETE' });
  await loadDays(current.date);
};

if (token) loadDays().catch((err) => showLogin(err.status === 401 ? '' : err.message));
else showLogin();
