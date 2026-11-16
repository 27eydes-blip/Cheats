// One requestAnimationFrame loop for every animated space-lobby piece (background, pad, pods).
// It runs only while something is subscribed and the page is visible, so a hidden tab or a
// closed lobby costs nothing. Subscribers get (t seconds, dt seconds).
const subs = new Set();
let raf = 0, last = 0;
function frame(now) {
  raf = 0;
  if (document.hidden || !subs.size) return;
  const t = now / 1000, dt = last ? Math.min(0.1, t - last) : 1 / 60;
  last = t;
  for (const fn of subs) fn(t, dt);
  raf = requestAnimationFrame(frame);
}
function kick() { if (!raf && subs.size && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
export function onFrame(fn) { subs.add(fn); kick(); return () => offFrame(fn); }
export function offFrame(fn) { subs.delete(fn); if (!subs.size && raf) { cancelAnimationFrame(raf); raf = 0; } }
export const loopRunning = () => !!raf;
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else kick(); });
