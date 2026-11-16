/** Tiny DOM helpers for the intertitle UI. */
type Attrs = Record<string, any>;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}
export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

let clickSound: () => void = () => {};
export function setClickSound(f: () => void) { clickSound = f; }
export function haptic(ms = 8) { try { (navigator as any).vibrate?.(ms); } catch { /* ignore */ } }

/** A brass-bordered intertitle button with press animation + click sound. */
export function btn(label: string, onClick: () => void, opts: { cls?: string; sub?: string; disabled?: boolean } = {}) {
  const b = h('button', { class: `btn ${opts.cls ?? ''}`, disabled: opts.disabled }, label, opts.sub ? h('span', { class: 'sub' }, opts.sub) : null);
  b.addEventListener('pointerdown', () => { b.classList.add('down'); haptic(6); });
  const up = () => b.classList.remove('down');
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  b.addEventListener('click', (e) => { e.preventDefault(); clickSound(); onClick(); });
  return b;
}

export function rule() { return h('div', { class: 'rule' }); }

export function credits() {
  return h('div', { class: 'credits' }, h('b', {}, 'Gleyde Technologies, LLC'), ' · Created by Sam Eyde III');
}

export function toast(text: string) {
  const t = h('div', { class: 'toast' }, text);
  document.getElementById('stage')!.append(t);
  setTimeout(() => t.remove(), 2500);
}

export const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
export const fmtTime = (t: number) => { if (!isFinite(t) || t <= 0) return '–:––.–'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
