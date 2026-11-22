export const STEP = 1 / 60;

/** Fixed 60 Hz simulation with a render on every display frame (60/120 Hz).
 *  `alpha` (0..1) says how far the display time is between the last two simulation steps,
 *  so the renderer can interpolate positions and motion stays smooth at any refresh rate. */
export function startLoop(update: (dt: number) => void, render: (dt: number, alpha: number) => void) {
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25; // tab was hidden: don't fast-forward
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP && steps < 8) { update(STEP); acc -= STEP; steps++; }
    if (steps === 8) acc = 0;
    render(elapsed, Math.min(1, acc / STEP));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
