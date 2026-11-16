export const STEP = 1 / 60;

/** Fixed-step update with rAF render; renders only after at least one step (saves battery on 120 Hz screens). */
export function startLoop(update: (dt: number) => void, render: (dt: number) => void) {
  let last = performance.now();
  let acc = 0;
  let renderAcc = 0;
  const frame = (now: number) => {
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;
    acc += elapsed;
    renderAcc += elapsed;
    let stepped = false;
    while (acc >= STEP - 0.002) { update(STEP); acc -= STEP; stepped = true; }
    if (stepped) { render(renderAcc); renderAcc = 0; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
