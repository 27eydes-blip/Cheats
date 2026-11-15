// Adaptive resolution: a pure controller, shared by the match and the lobby stage (and unit-tested
// with frame-time traces). It is fed, per frame, the WORK time of the frame (what our code costs)
// and the rAF interval (what the display gives us). It compares the two:
// - the display interval is the median of recent rAF intervals, so a 60 Hz, 120 Hz or a 30 Hz
//   battery-saver cap all count as "the budget" (a 30 Hz cap with cheap frames never drops quality);
// - step down (lower resolution) when frames cost more than 85% of the budget for 1.5 s;
// - step back up when they cost under 45% of the budget for a while (5 s at first);
// - hysteresis: if a step up has to be undone soon after, the next step up waits twice as long.
const N = 31; // intervals kept for the median

export function createAdapt(steps = 4) {
  return {
    steps, step: 0, cost: 0, budget: 1000 / 60, slowFor: 0, fastFor: 0, upHold: 5000, sinceUp: Infinity,
    buf: new Float32Array(N).fill(1000 / 60), scratch: new Float32Array(N), i: 0, n: 0,
  };
}

// clear the timers (not the step): e.g. after a pause, so stale history doesn't decide anything
export function resetAdaptTimers(st) { st.slowFor = 0; st.fastFor = 0; st.n = 0; st.cost = 0; }

// one frame: costMs = work time of the frame, intervalMs = time since the previous frame.
// Returns -1 (step down to a sharper level), 0, or +1 (step up to a cheaper level) and updates st.step.
export function adaptFrame(st, costMs, intervalMs) {
  const iv = Math.min(100, Math.max(1, intervalMs)); // a stall (tab switch) never counts as the display rate
  st.buf[st.i] = iv; st.i = (st.i + 1) % N;
  st.scratch.set(st.buf); st.scratch.sort();
  st.budget = Math.max(4, st.scratch[N >> 1]);
  st.cost = st.n++ ? st.cost + (costMs - st.cost) * 0.1 : costMs;
  if (st.n < 10) return 0; // not enough history yet
  st.sinceUp += iv;
  const load = st.cost / st.budget;
  if (load > 0.85) { st.slowFor += iv; st.fastFor = 0; } else if (load < 0.45) { st.fastFor += iv; st.slowFor = 0; } else { st.slowFor = 0; st.fastFor = 0; }
  if (st.slowFor > 1500 && st.step < st.steps - 1) {
    st.step++; st.slowFor = 0;
    // a step up that didn't hold: wait longer before trying again (up to two minutes)
    st.upHold = st.sinceUp < st.upHold + 10000 ? Math.min(120000, st.upHold * 2) : 5000;
    return 1;
  }
  if (st.fastFor > st.upHold && st.step > 0) { st.step--; st.fastFor = 0; st.sinceUp = 0; return -1; }
  return 0;
}
