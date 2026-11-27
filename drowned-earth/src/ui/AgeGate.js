// First-launch age and content gate. Mature content (alcohol, gambling,
// violence, brief artistic nudity) is opt-in; declining keeps every flagged
// scene in its clean version (data marks them `mature: true` with a `clean`
// alternative). The choice can be changed later in Options (only if 18+).
export function ageGate(settings, params) {
  if (settings.ageConfirmed !== null || params.has('skipintro') || params.get('agegate') === 'off') return;
  const el = document.createElement('div');
  el.className = 'age-gate';
  el.innerHTML = `<div class="age-card"><h2>Before you go under</h2>
    <p>This game contains mature themes (alcohol, gambling, violence, brief artistic nudity).</p>
    <p><b>Are you 18 or older?</b></p>
    <div class="age-btns"><button class="btn" data-y>Yes, I'm 18 or older</button><button class="btn" data-n>No — keep it clean</button></div>
    <small>You can change Mature Content later in Options. Declining swaps flagged scenes for clean versions; nothing else is cut.</small></div>`;
  const st = document.createElement('style');
  st.textContent = `.age-gate{position:fixed;inset:0;z-index:100;background:rgba(4,6,8,.94);display:grid;place-items:center;font:16px Georgia,serif;color:#e8e2d4}
    .age-card{max-width:520px;padding:28px;border:1px solid rgba(255,255,255,.15);text-align:center}.age-card p{line-height:1.6}
    .age-btns{display:flex;gap:10px;justify-content:center;margin:18px 0}.age-card small{opacity:.6;font:12px sans-serif}`;
  document.head.appendChild(st); document.body.appendChild(el);
  const done = (adult) => { settings.ageConfirmed = adult; settings.mature = adult; settings.save(); el.remove(); };
  el.querySelector('[data-y]').addEventListener('click', () => done(true));
  el.querySelector('[data-n]').addEventListener('click', () => done(false));
}
